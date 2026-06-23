/* eslint-disable react-dom/no-missing-button-type */
import type { GetRef } from 'antd'
import { message } from 'antd'
import type { BubbleProps } from '@ant-design/x'
import { Bubble } from '@ant-design/x'
import { Repeat } from 'lucide-react'
import React from 'react'
import type { ModelItem } from './types'
import { hasModelCategory } from './HasModelCategory'
import { MessageContentWithImages } from './MessageContentWithImages'
import { MarkdownContent } from './MarkdownContent'
import { ModelLogo } from '@/components/model-card/ModelLogo'

/**
 * 聊天区域组件 - 包含模型网格和聊天列表
 */
interface ChatAreaProps {
  models: ModelItem[]
  chats: Array<{ onRequest: any, messages: any[] }>
  rolesAsObject: any
  agents: { isRequesting: () => boolean }[]
  listRefs: React.MutableRefObject<Map<number, GetRef<typeof Bubble.List>>>
  scrollRefs: React.MutableRefObject<Map<number, HTMLDivElement>>
  onScroll: (e: React.UIEvent<HTMLDivElement, UIEvent>) => void
  isFullscreen?: boolean
  onModelChange?: (model: ModelItem) => void
  onModelRemove?: (model: ModelItem) => void
}

const renderMessageWithImages: BubbleProps['messageRender'] = (content) => {
  return <MessageContentWithImages content={content} />
}

const renderMarkdown: BubbleProps['messageRender'] = (content) => {
  return <MarkdownContent content={content} />
}

type TranscriptionSegment = { speaker: number, text: string, start_time: number, end_time: number }

/** 兼容旧版 result 为数组，或新版 result.chunks[].segments */
const extractTranscriptionSegments = (transcriptionData: { result?: unknown } | null | undefined): TranscriptionSegment[] | null => {
  const result = transcriptionData?.result
  if (!result) {
    return null
  }

  if (Array.isArray(result)) {
    return result as TranscriptionSegment[]
  }

  if (typeof result === 'object' && result !== null && 'chunks' in result) {
    const chunks = (result as { chunks?: Array<{ segments?: TranscriptionSegment[] }> }).chunks
    if (!Array.isArray(chunks)) {
      return null
    }
    const segments: TranscriptionSegment[] = []
    for (const chunk of chunks) {
      if (!chunk?.segments || !Array.isArray(chunk.segments)) {
        continue
      }
      for (const seg of chunk.segments) {
        if (seg && typeof seg.text === 'string') {
          segments.push({
            speaker: seg.speaker,
            text: seg.text,
            start_time: seg.start_time,
            end_time: seg.end_time,
          })
        }
      }
    }
    return segments.length > 0 ? segments : null
  }

  return null
}

// 按 speaker 分组音频转录结果
const groupBySpeaker = (result: TranscriptionSegment[]) => {
  const groups: Array<{ speaker: number, texts: string[], start_time: number, end_time: number }> = []
  let currentGroup: { speaker: number, texts: string[], start_time: number, end_time: number } | null = null

  result.forEach((item) => {
    if (!currentGroup || currentGroup.speaker !== item.speaker) {
      // 开始新的发言人组
      if (currentGroup) {
        groups.push(currentGroup)
      }
      currentGroup = {
        speaker: item.speaker,
        texts: [item.text],
        start_time: item.start_time,
        end_time: item.end_time,
      }
    }
    else {
      // 同一发言人，合并文本
      currentGroup.texts.push(item.text)
      currentGroup.end_time = item.end_time
    }
  })

  // 添加最后一组
  if (currentGroup) {
    groups.push(currentGroup)
  }

  return groups
}

// 渲染音频转录消息（带发言人标识）
const renderAudioTranscription: BubbleProps['messageRender'] = (content) => {
  if (typeof content === 'string') {
    // 如果是字符串，直接渲染
    return <MarkdownContent content={content} />
  }

  // 如果是对象，检查是否是音频转录数据
  if (typeof content === 'object' && content !== null) {
    // 检查是否包含 __audioTranscription 标识
    if ('__audioTranscription' in content) {
      const audioData = content as {
        __audioTranscription?: boolean
        transcriptionData?: any
        errorMessage?: string
      }

      if (audioData.errorMessage) {
        // 显示错误消息
        return <MarkdownContent content={audioData.errorMessage} />
      }

      const flatSegments = extractTranscriptionSegments(audioData.transcriptionData)
      if (flatSegments && flatSegments.length > 0) {
        // 按 speaker 分组
        const groups = groupBySpeaker(flatSegments)

        // 渲染每个发言人的消息
        return (
          <div className="space-y-3">
            {groups.map((group, index) => (
              <div key={index} className="mb-4">
                <div className="text-xs font-semibold text-gray-600 mb-1">
                  发言人
                  {' '}
                  {group.speaker + 1}
                </div>
                <div className="text-sm text-gray-500 mb-2">
                  {formatTime(group.start_time)}
                  {' '}
                  ~
                  {formatTime(group.end_time)}
                </div>
                <MarkdownContent content={group.texts.join('')} />
              </div>
            ))}
          </div>
        )
      }
    }
  }

  return <MarkdownContent content={String(content)} />
}

// 格式化时间（秒转分:秒）
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  models,
  chats,
  rolesAsObject,
  agents,
  listRefs,
  scrollRefs,
  onScroll,
  isFullscreen = false,
  onModelChange,
  onModelRemove,
}) => {
  return (
    <div className={`${isFullscreen ? 'flex-1 p-4 min-h-0' : 'flex-1 px-6 overflow-y-auto'}`}>
      <div className={`grid gap-4 ${isFullscreen ? 'h-full' : ''} ${models.length === 1 ? 'grid-cols-1'
        : models.length === 2 ? 'grid-cols-2'
          : 'grid-cols-3'
      }`}
      >
        {models.map((model, index) => (
          <div key={model.id} className={`border border-gray-200 rounded-lg p-4 bg-white shadow-sm ${isFullscreen ? 'flex flex-col min-h-0' : 'hover:shadow-md transition-shadow h-[calc(100vh-300px)] flex flex-col'}`}>
            <div className={`flex items-center justify-between mb-4 ${isFullscreen ? 'flex-shrink-0' : ''}`}>
              <div className="flex items-center gap-2">
                <ModelLogo name={model.model_name} logo={model.logo} size="small" />
                <h2 className="text-lg m-0">{model.model_name}</h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-all"
                  onClick={() => {
                    if (agents.some((agent) => agent.isRequesting())) {
                      message.warning('请先等待模型请求完成')
                      return
                    }
                    onModelChange?.(model)
                  }}
                  title="更换模型"
                >
                  <Repeat className="w-3 h-3" />
                  {/* <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
                  </svg> */}
                </button>
                <button
                  className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                  onClick={() => onModelRemove?.(model)}
                  title="移除模型"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              </div>
            </div>
            <div
              ref={(ref) => {
                if (ref) {
                  scrollRefs.current.set(model.id, ref)
                }
              }}
              className="flex-1 overflow-auto"
            >
              <Bubble.List
                onScroll={onScroll}
                ref={(ref) => {
                  if (ref) {
                    listRefs.current.set(model.id, ref)
                  }
                }}
                className="h-full"
                style={{
                  paddingInline: 16,
                }}
                roles={{
                  ...rolesAsObject,
                  ai: {
                    ...rolesAsObject.ai,
                    typing: false,
                    avatar: {
                      icon: (
                        <ModelLogo name={model.model_name} logo={model.logo} size="medium" />
                      ),
                      style: { background: '#fde3cf' },
                    },
                    messageRender: hasModelCategory(model.category, 'AudioTranscription') ? renderAudioTranscription : rolesAsObject.ai.messageRender,
                  },
                  local: {
                    ...rolesAsObject.local,
                    messageRender: hasModelCategory(model.category, 'Vision_Language') ? renderMessageWithImages : renderMarkdown,
                  },
                }}
                items={chats[index].messages
                  .filter(({ message, status }) => {
                    // 过滤掉音频转录 AI 回复中不应该显示的 local 消息
                    if (hasModelCategory(model.category, 'AudioTranscription')
                      && status === 'local'
                      && typeof message === 'object'
                      && message !== null
                      && '__audioTranscription' in message) {
                      const audioMessage = message as { __isUserMessage?: boolean }
                      // 只保留用户消息（文件名），过滤掉 AI 回复的 local 消息
                      return audioMessage.__isUserMessage === true
                    }
                    return true
                  })
                  .map(({ id, message, status }) => {
                    let content = message
                    let isVisionMessage = false

                    if (status === 'local') {
                      if (hasModelCategory(model.category, 'Vision_Language') && typeof message === 'object' && message !== null && 'messages' in message) {
                        const requestBody = message as any
                        const userMessage = requestBody.messages[requestBody.messages.length - 1]
                        if (userMessage && Array.isArray(userMessage.content)) {
                          content = userMessage.content
                          isVisionMessage = true
                        }
                        else {
                          content = userMessage?.content || '消息'
                        }
                      }
                      else if (hasModelCategory(model.category, 'AudioTranscription') && typeof message === 'object' && message !== null && '__audioTranscription' in message) {
                        // 对于音频转录类型，用户消息显示文件名
                        const audioMessage = message as { userMessage?: string, __isUserMessage?: boolean }
                        content = audioMessage.userMessage || '音频文件'
                      }
                      else if (typeof message !== 'string') {
                        content = '消息'
                      }
                    }
                    else if (status === 'ai') {
                      // AI回复：如果是音频转录类型，处理转录数据
                      if (hasModelCategory(model.category, 'AudioTranscription')) {
                        if (typeof message === 'object' && message !== null && '__audioTranscription' in message) {
                          // 传递完整的 message 对象，让 renderAudioTranscription 来处理
                          content = message
                        }
                        else if (typeof message === 'string') {
                          // 兼容旧格式：直接是字符串
                          content = message
                        }
                      }
                    }

                    return {
                      key: id,
                      role: status === 'local' ? 'local' : 'ai',
                      content,
                    }
                  })}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
