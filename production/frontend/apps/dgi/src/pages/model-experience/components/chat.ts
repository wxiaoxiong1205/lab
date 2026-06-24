import markdownit from 'markdown-it'
import type { MessageContent, StreamChunk, StreamState } from './types'

const md = markdownit({ html: true, breaks: true })

/**
 * 从文本中提取主要内容和思考内容
 *
 * 优化逻辑：
 * - 只要以 < 开头就当作 think 数据，避免延迟
 * - 然后再处理具体的标签解析
 * - 提前识别思考内容，提升响应速度
 */
export const extractThinkContent = (content: string | MessageContent[]) => {
  // 如果 content 是数组（Vision_Language 类型的消息），只返回文本内容
  if (Array.isArray(content)) {
    const textContent = content.find((item) => item.type === 'text')
    return {
      mainContent: textContent?.text || '已上传图片',
      thinkContent: null,
    }
  }

  // 如果是字符串，保持原有的处理逻辑
  const contentStr = String(content)

  // 关键优化：只要以 < 开头，就当作 think 数据处理
  if (contentStr.startsWith('<')) {
    // 检查是否是完整的 think 标签
    const thinkEndIndex = contentStr.indexOf('</think>')

    if (thinkEndIndex !== -1) {
      // 有完整的 think 标签
      if (contentStr.startsWith('<think>')) {
        const thinkContent = contentStr.substring(7, thinkEndIndex) // 提取 <think> 和 </think> 之间的内容
        const afterThink = contentStr.substring(thinkEndIndex + 8) // 8 是 "</think>" 的长度
        return {
          mainContent: afterThink.trim(),
          thinkContent,
        }
      }
      else {
        // 以其他 < 开头但有 </think> 结束，全部当作 think 内容
        const thinkContent = contentStr.substring(0, thinkEndIndex)
        const mainContent = contentStr.substring(thinkEndIndex + 8)
        return { mainContent, thinkContent }
      }
    }
    else {
      // 以 < 开头但没有结束标签，全部当作 think 内容
      if (contentStr.startsWith('<think>')) {
        // 去掉 <think> 标签，剩余内容作为 think 内容
        const thinkContent = contentStr.substring(7)
        return {
          mainContent: '',
          thinkContent,
        }
      }
      else {
        // 以其他 < 开头，全部当作 think 内容
        return {
          mainContent: '',
          thinkContent: contentStr,
        }
      }
    }
  }

  // 不以 < 开头，检查中间是否有 think 标签
  const thinkStartIndex = contentStr.indexOf('<think>')
  if (thinkStartIndex === -1) {
    return { mainContent: contentStr, thinkContent: null }
  }

  const thinkEndIndex = contentStr.indexOf('</think>')

  // 有开始标签但没有结束标签（流式传输中）
  if (thinkEndIndex === -1) {
    const beforeThink = contentStr.substring(0, thinkStartIndex)
    const thinkContent = contentStr.substring(thinkStartIndex + 7) // 7 是 "<think>" 的长度
    return {
      mainContent: beforeThink,
      thinkContent,
    }
  }

  // 有完整的 think 标签
  const beforeThink = contentStr.substring(0, thinkStartIndex)
  const thinkContent = contentStr.substring(thinkStartIndex + 7, thinkEndIndex)
  const afterThink = contentStr.substring(thinkEndIndex + 8) // 8 是 "</think>" 的长度
  const mainContent = (beforeThink + afterThink).trim()

  return {
    mainContent,
    thinkContent,
  }
}

interface LLMResponseError {
  error: {
    code: string
    message: string
    param: string
    type: string
  }
}

/**
 * 统一处理流式传输中的错误
 * 包括：
 * 1. 用户中断
 * 2. 网络错误
 * 3. 其他异常
 */
export const handleStreamError = async (
  error: any,
  state: StreamState,
  onSuccess: (messages: string[]) => void,
) => {
  if (error instanceof Error && error.name === 'AbortError') {
    onSuccess([createFullContent(state, true) || '对话已中断'])
    return true
  }

  let errorMessage = error?.message || '请求失败'

  if ('response' in error) {
    const errorBody = error.response?.data as LLMResponseError
    if (typeof errorBody === 'string') {
      errorMessage = errorBody
    }
    else {
      errorMessage = `请求失败: ${errorBody.error.code}${
        errorBody.error.message ? `\n具体原因: ${errorBody.error.message}` : ''
      }`
    }
  }

  console.error('Error in SSE request:', error)
  onSuccess([errorMessage])
  return false
}

/**
 * 处理单个数据流块 - DGI三种场景兼容版本
 *
 * 支持三种DGI思索场景：
 * 1. 只在content里有（私有化部署的模型）
 * 2. 只在reasoning_content里有（云服务接口）
 * 3. 在content和reasoning_content同时有（兼容处理）- 优先使用reasoning_content
 *
 * 敏感词中断（sensitive_interrupt）：
 * - 当 choices[0].sensitive_interrupt === true 时，表示命中敏感词
 * - 撤回当前已输出，等待下一条 chunk；下一条的 delta.content 为完整替换文案（非流式）
 * - 用该 content 整体替换显示内容，并中断后续接口调用（返回 false，由调用方 abort）
 */
export const handleStreamChunk = (
  chunk: StreamChunk,
  state: StreamState & { isReasoningPhase?: boolean, lastUpdateLength?: number, pendingSensitiveReplace?: boolean, stopReason?: 'error' | 'sensitive_replace' },
  onUpdate: (content: string) => void,
  onSuccess: (messages: string[]) => void,
) => {
  try {
    if (!chunk.data || chunk.data === ' [DONE]') return true

    const parsed = JSON.parse(chunk.data as string)
    const choice = parsed.choices?.[0]

    // 敏感词中断：当前 chunk 仅带 finish_reason + sensitive_interrupt，无内容
    const sensitiveInterrupt = choice?.sensitive_interrupt === true
    if (sensitiveInterrupt) {
      state.pendingSensitiveReplace = true
      return true
    }

    // 上一条是敏感词中断，本条为完整替换文案（delta.content 为整段，非流式）；替换后中断接口
    if (state.pendingSensitiveReplace) {
      const replacementContent = choice?.delta?.content ?? ''
      state.content = replacementContent
      state.reasoningContent = ''
      state.isReasoningPhase = false
      state.pendingSensitiveReplace = false
      state.stopReason = 'sensitive_replace'
      onUpdate(replacementContent)
      return false
    }

    // 获取增量内容
    const content = choice?.delta?.content || ''
    const reasoningContent = choice?.delta?.reasoning_content || ''

    // DGI三种场景兼容处理
    if (reasoningContent) {
      state.reasoningContent += reasoningContent
      state.isReasoningPhase = true
    }
    else if (content) {
      if (content.startsWith('<') || state.content.includes('<think>') || content.includes('<think>')) {
        // content中包含think标签，直接作为原始内容保存，不进行分离和重组
        state.content += content

        // 检查是否包含完整的think标签来判断reasoning状态
        const fullContent = state.content
        const hasOpenThink = fullContent.includes('<think>')
        const hasCloseThink = fullContent.includes('</think>')

        if (hasOpenThink && !hasCloseThink) {
          // 有开始标签但没有结束标签，说明还在reasoning
          state.isReasoningPhase = true
        }
        else {
          state.isReasoningPhase = false
        }
      }
      else {
        // 普通内容，直接追加
        state.content += content
        state.isReasoningPhase = false
      }
    }

    // 只要有任何内容更新就立即推送
    if (reasoningContent || content) {
      // 构建显示内容
      let displayContent = ''

      if (state.reasoningContent) {
        if (state.isReasoningPhase) {
          // 正在reasoning，不加结束标签
          displayContent = `<think>${state.reasoningContent}`
        }
        else {
          // reasoning完成，加完整标签
          displayContent = `<think>${state.reasoningContent}</think>\n${state.content}`
        }
      }
      else {
        displayContent = state.content
      }

      // 立即更新UI
      onUpdate(displayContent)
    }

    return true
  }
  catch (e) {
    const errorMessage = '解析响应数据失败，请稍后重试'
    console.error('Failed to parse SSE message:', e)
    state.stopReason = 'error'
    onSuccess([errorMessage])
    return false
  }
}

/**
 * 将主要内容和思考内容组合成完整的消息
 *
 * 支持三种场景：
 * 1. 只有content（可能包含think标签）- 直接返回原始content
 * 2. 只有reasoningContent - 构建think标签格式
 * 3. 同时有content和reasoningContent - 组合格式
 *
 * 优化：
 * - 场景1不进行标签补全，保持原始格式
 * - 减少字符串拼接操作
 */
export const createFullContent = (state: StreamState, isReasoningComplete: boolean = false) => {
  const { content, reasoningContent } = state

  if (!reasoningContent) {
    return content
  }

  // 如果只有think内容且还在reasoning阶段，直接返回think标签
  if (!content && !isReasoningComplete) {
    return `<think>${reasoningContent}`
  }

  // 如果reasoning完成或者已经有content，返回完整格式
  if (isReasoningComplete || content) {
    // 如果没有主内容，只返回完整的think标签
    if (!content) {
      return `<think>${reasoningContent}</think>`
    }
    // 有主内容时，返回think + 主内容
    return `<think>${reasoningContent}</think>\n${content}`
  }

  // 兜底情况
  return `<think>${reasoningContent}`
}
