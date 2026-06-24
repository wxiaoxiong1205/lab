import React, { useEffect } from 'react'
import { useXAgent, useXChat } from '@ant-design/x'
import type { AxiosResponse } from 'axios'
import type { ModelItem, StreamState } from './types'
import { createFullContent, handleStreamChunk, handleStreamError } from './chat'
import request from '@/utils/request'

interface ModelChatItemProps {
  model: ModelItem
  modelMessages: any[]
  onRequest: React.MutableRefObject<((message: any) => void) | null>
  onMessagesChange: (modelId: number, messages: any[]) => void
  onAbortControllerChange: (modelId: number, controller: AbortController | null) => void
  onLoadingChange: (modelId: number, isLoading: boolean) => void
}

/**
 * 单个模型的聊天项组件
 * 封装了 useXAgent 和 useXChat 的逻辑，避免在循环中使用 hooks
 */
const ModelChatItem: React.FC<ModelChatItemProps> = ({
  model,
  modelMessages,
  onRequest: parentOnRequest,
  onMessagesChange,
  onAbortControllerChange,
  onLoadingChange,
}) => {
  // 为单个模型创建 agent
  const [agent] = useXAgent<string | FormData, { message: string | FormData }, string>({
    request: async ({ message }, { onSuccess, onUpdate }) => {
      try {
        const controller = new AbortController()
        onAbortControllerChange(model.id, controller)

        // 对于 AudioTranscription 类型，不调用 completions 接口
        // 用户消息显示文件名，模型输出显示转录文本
        if (model.category === 'AudioTranscription') {
          // message 应该是一个包含 __audioTranscription 的对象
          // 先排除 FormData、字符串和 null 类型
          if (message instanceof FormData || typeof message === 'string' || message === null) {
            // 兼容处理：如果 message 是字符串、FormData 或 null，直接显示
            const messageStr = typeof message === 'string' ? message : String(message || '')
            onSuccess([messageStr])
            return
          }

          // 此时 message 应该是非 null 的对象类型
          if (typeof message === 'object' && '__audioTranscription' in message) {
            // 使用 unknown 中转来安全地进行类型转换
            const audioMessage = message as unknown as {
              userMessage?: string
              transcriptionData?: any
              errorMessage?: string
              __isUserMessage?: boolean
            }

            // 如果是用户消息（文件名），不调用 onSuccess，只添加用户消息
            if (audioMessage.__isUserMessage) {
              // 用户消息已经通过 onRequest 添加，这里不需要做任何操作
              return
            }

            // 如果是AI回复（转录数据），调用 onSuccess 添加AI消息
            // 传递完整的 message 对象，让 ChatArea 来处理按 speaker 分组
            if ('transcriptionData' in audioMessage || 'errorMessage' in audioMessage) {
              onSuccess([message])
              return
            }
          }

          // 兜底处理
          const messageStr = String(message)
          onSuccess([messageStr])
          return
        }

        // 构建请求体
        let requestBody: any
        const requestHeaders: any = {}

        // 检查是否是 FormData（用于音频文件上传）
        const isFormData = message && typeof message === 'object' && message !== null && message.constructor === FormData

        if (isFormData) {
          // 对于 FormData，添加 model 参数
          const formData = message as FormData
          formData.append('model', model.model_name)
          requestBody = formData
          // FormData 会自动设置 Content-Type，不需要手动设置
        }
        else {
          // 此时 message 不是 FormData，可以安全地使用
          const messageStr = typeof message === 'string' ? message : String(message)
          requestBody = model.category === 'Rerank'
            ? (() => {
                // 解析传入的 JSON 字符串
                const { query: messageQuery, texts } = JSON.parse(messageStr)
                return {
                  model: model.model_name,
                  query: messageQuery,
                  texts,
                }
              })()
            : typeof message === 'object' && message !== null && !isFormData
              ? message // 如果 message 已经是完整的请求体对象，直接使用
              : {
                  model: model.model_name,
                  messages: [
                    ...modelMessages?.map((m) => ({
                      role: m.status === 'local' ? 'user' : 'assistant',
                      content: m.message,
                    })) || [],
                    { role: 'user', content: messageStr },
                  ],
                  stream: true,
                  temperature: 0.5,
                }
        }

        // 使用 request 工具，通过 adapter: 'fetch' 获取原始 Response 对象以支持流式响应
        const url = model.category === 'Rerank' ? '/experience/rerank' : '/experience/chat/completions'

        // 使用 request 工具，但通过 adapter: 'fetch' 和 responseType: 'stream' 来获取流式响应
        // 注意：这里需要绕过响应拦截器，直接获取原始 Response
        const axiosResponse = await request<any, AxiosResponse>({
          url,
          baseURL: '/dgi-backend/v1',
          method: 'POST',
          data: requestBody,
          headers: requestHeaders,
          signal: controller.signal,
          timeout: 300000, // 10 倍默认超时（默认 30s，流式请求设为 300s）
          adapter: 'fetch', // 使用 fetch adapter 以支持流式响应
          responseType: 'stream', // 设置为 stream 类型
          isLLMStreamRequest: true,
        } as any)

        // 从 axios 响应中获取原始的 Response 对象
        // 当使用 adapter: 'fetch' 时，response.data 是 ReadableStream 或 Response 对象
        let response: Response
        if (axiosResponse.data instanceof Response) {
          response = axiosResponse.data
        }
        else if (axiosResponse.data instanceof ReadableStream) {
          // 如果是 ReadableStream，需要包装成 Response 对象
          response = new Response(axiosResponse.data, {
            headers: axiosResponse.headers as HeadersInit,
            status: axiosResponse.status,
            statusText: axiosResponse.statusText,
          })
        }
        else {
          // 如果都不匹配，尝试从原始响应中获取
          // 这种情况不应该发生，但为了安全起见添加回退逻辑
          throw new TypeError('无法获取流式响应')
        }

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}))
          const data = errorBody.data as { error?: { code: number, message: string } }
          const errorMessage = `请求失败: ${data.error?.code || response.status} ${data.error?.message ? '' : response.statusText}${
            data.error?.message ? `\n具体原因: ${data.error.message}` : ''
          }`
          onSuccess([errorMessage])
          throw new Error(errorMessage)
        }

        // 对于Rerank模型，使用非流式处理
        if (model.category === 'Rerank') {
          const result = await response.json()
          const jsonResult = `\`\`\`json\n${JSON.stringify(result.data, null, 2)}\n\`\`\``
          onSuccess([jsonResult])
          return
        }

        if (!response.body) {
          const errorMessage = '响应内容为空'
          onSuccess([errorMessage])
          throw new Error(errorMessage)
        }

        const state: StreamState & { isReasoningPhase?: boolean, lastUpdateLength?: number, pendingSensitiveReplace?: boolean, stopReason?: 'error' | 'sensitive_replace' } = {
          content: '',
          reasoningContent: '',
          isReasoningPhase: false,
          lastUpdateLength: 0,
          pendingSensitiveReplace: false,
        }

        // 使用 XStream 处理 SSE 数据
        const { XStream } = await import('@ant-design/x')
        const stream = XStream({ readableStream: response.body })

        try {
          for await (const chunk of stream) {
            // 检查是否已经被中断
            if (controller.signal.aborted) {
              throw new DOMException('Operation was aborted', 'AbortError')
            }

            if (!handleStreamChunk(chunk, state, onUpdate, onSuccess)) {
              if (state.stopReason === 'sensitive_replace') {
                onSuccess([createFullContent(state, true)])
                controller.abort()
              }
              return
            }
          }
        }
        catch (e) {
          if (handleStreamError(e, state, onSuccess)) {
            return
          }
          throw e
        }

        onSuccess([createFullContent(state, true)])
      }
      catch (error) {
        handleStreamError(
          error,
          { content: '', reasoningContent: '' },
          onSuccess,
        )
      }
      finally {
        onAbortControllerChange(model.id, null)
      }
    },
  })

  // 为单个模型创建 chat 实例
  const { onRequest, messages } = useXChat({
    agent,
  })

  // 将内部的 onRequest 暴露给父组件
  React.useEffect(() => {
    parentOnRequest.current = onRequest
  }, [onRequest, parentOnRequest])

  // 更新消息记录
  useEffect(() => {
    onMessagesChange(model.id, messages)
  }, [messages, model.id, onMessagesChange])

  // 监听agent的loading状态变化
  React.useEffect(() => {
    const isLoading = agent.isRequesting()
    onLoadingChange(model.id, isLoading)
  }, [agent, model.id, onLoadingChange])

  // 定期检查loading状态（因为agent.isRequesting()可能不会自动触发re-render）
  React.useEffect(() => {
    const interval = setInterval(() => {
      const isLoading = agent.isRequesting()
      onLoadingChange(model.id, isLoading)
    }, 100) // 每100ms检查一次

    return () => clearInterval(interval)
  }, [agent, model.id, onLoadingChange])

  // 这个组件不渲染任何内容，只是管理状态
  return null
}

export default ModelChatItem
