import React, { useEffect, useRef, useState } from 'react'
import type { UploadProps } from 'antd'
import { Button, Image, Modal, message } from 'antd'
import type {
  Bubble,
  BubbleProps,
} from '@ant-design/x'
import {
  Sender,
} from '@ant-design/x'
import { ArrowLeftOutlined, CloseOutlined, FullscreenExitOutlined, FullscreenOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons'
import type { GetProp, GetRef } from 'antd/es'
import markdownit from 'markdown-it'
import type { MessageContent, ModelItem } from './types'
import { hasModelCategory } from './HasModelCategory'
import { ChatArea } from './ChatArea'
import { MarkdownContent } from './MarkdownContent'
import { InputArea } from './InputArea'
import { AudioArea } from './AudioArea'
import RealtimeTranscriptionPanel from './RealtimeTranscriptionPanel'
import SpeechSynthesisPanel from './SpeechSynthesisPanel'
import ChangeModelModal from './ChangeModelModal'
import AddModelModal from './AddModelModal'
import ModelChatItem from './ModelChatItem'
import { exitFullscreen, fileToBase64, getFullscreenElement, requestFullscreen } from '@/utils'
import { $t } from '@/locales'

interface ModelChatPageProps {
  models: ModelItem[]
  onBack: () => void
  onModelsChange?: (models: ModelItem[]) => void
}

const md = markdownit({ html: true, breaks: true })

const renderMarkdown: BubbleProps['messageRender'] = (content) => {
  return <MarkdownContent content={content} />
}
/**
 * 模型对话页面组件
 * 功能：
 * 1. 展示模型信息
 * 2. 处理用户输入
 * 3. 展示对话历史
 * 4. 支持流式响应
 * 5. 展示AI思考过程
 */
const ModelChatPage: React.FC<ModelChatPageProps> = ({ models, onBack, onModelsChange }) => {
  const listRefs = React.useRef<Map<number, GetRef<typeof Bubble.List>>>(new Map())
  const scrollRefs = React.useRef<Map<number, HTMLDivElement>>(new Map())
  const [inputMessage, setInputMessage] = useState('')
  // const [queryInput, setQueryInput] = useState("");
  const [, setScrollTop] = React.useState(0)
  const [abortControllers, setAbortControllers] = useState<Map<number, AbortController>>(new Map())
  const [query, setQuery] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [changeModelVisible, setChangeModelVisible] = useState(false)
  const [changingModel, setChangingModel] = useState<ModelItem | null>(null)
  const [addModelVisible, setAddModelVisible] = useState(false)

  // 浏览器原生全屏功能
  const chatAreaRef = useRef<HTMLDivElement>(null)
  const handleFullscreen = async () => {
    try {
      if (!getFullscreenElement()) {
        // 进入全屏模式
        await requestFullscreen(chatAreaRef.current || document.documentElement)
        setIsFullscreen(true)
      }
      else {
        // 退出全屏模式
        await exitFullscreen()
        setIsFullscreen(false)
      }
    }
    catch (error) {
      console.error('全屏操作失败:', error)
      // 如果浏览器不支持全屏API，降级为页面内全屏
      setIsFullscreen(!isFullscreen)
    }
  }

  // 监听浏览器全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!getFullscreenElement())
    }

    // 监听各种浏览器的全屏事件
    const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange']
    events.forEach((event) => {
      document.addEventListener(event, handleFullscreenChange)
    })

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleFullscreenChange)
      })
    }
  }, [])

  // 使用ref保持最新的abortControllers引用
  const abortControllersRef = React.useRef(abortControllers)
  abortControllersRef.current = abortControllers

  // 组件卸载时清理资源
  React.useEffect(() => {
    return () => {
      // 取消所有进行中的请求
      abortControllersRef.current.forEach((controller) => {
        try {
          controller.abort()
        }
        catch (error) {
          console.warn('Failed to abort controller:', error)
        }
      })
    }
  }, [])

  const rolesAsObject: GetProp<typeof Bubble.List, 'roles'> = {
    ai: {
      placement: 'start',
      avatar: {
        icon: <UserOutlined />,
        style: { background: '#fde3cf' },
      },
      // 关键优化：完全禁用打字机效果，确保数据流实时显示
      typing: false,
      style: {
        maxWidth: 600,
      },
      messageRender: renderMarkdown,
    },
    local: {
      placement: 'end',
      avatar: { icon: <UserOutlined />, style: { background: '#87d068' } },
      messageRender: renderMarkdown,
    },
  }

  const onScroll = React.useCallback(
    (e: React.UIEvent<HTMLDivElement, UIEvent>) => {
      const target = e.target as HTMLDivElement
      setScrollTop(target.scrollTop)
    },
    [],
  )
  // 管理每个模型的请求函数引用
  const modelRequestRefs = React.useRef<Map<number, React.MutableRefObject<((message: any) => void) | null>>>(new Map())

  // 确保每个模型都有对应的请求函数引用
  React.useEffect(() => {
    models.forEach((model) => {
      if (!modelRequestRefs.current.has(model.id)) {
        const ref = { current: null }
        modelRequestRefs.current.set(model.id, ref)
      }
    })

    // 清理已移除模型的引用
    const currentModelIds = new Set(models.map((m) => m.id))
    modelRequestRefs.current.forEach((ref, id) => {
      if (!currentModelIds.has(id)) {
        modelRequestRefs.current.delete(id)
      }
    })
  }, [models])

  // 为每个模型创建一个chat实例
  const [modelMessages, setModelMessages] = useState<Map<number, any[]>>(new Map())

  // 管理每个模型的loading状态
  const [modelLoadingStates, setModelLoadingStates] = useState<Map<number, boolean>>(new Map())

  // 音频转录完成标志：转录结束后屏蔽轮询对 loadingStates 的恢复
  const audioFinishedRef = React.useRef(false)

  const handleFinish = () => {
    audioFinishedRef.current = true
    setModelLoadingStates(new Map())
    setModelMessages((prev) => {
      const next = new Map<number, any[]>()
      for (const [id, msgs] of prev) {
        next.set(id, msgs.filter((m: any) => !(m.status === 'ai' && !m.message)))
      }
      return next
    })
  }

  // 当models变化时清理不存在的模型消息
  React.useEffect(() => {
    const currentModelIds = new Set(models.map((m) => m.id))
    setModelMessages((prev) => {
      const next = new Map()
      // 只保留当前存在的模型的消息
      for (const [id, messages] of prev) {
        if (currentModelIds.has(id)) {
          next.set(id, messages)
        }
      }
      return next
    })

    // 清理不存在的模型的loading状态
    setModelLoadingStates((prev) => {
      const next = new Map()
      for (const [id, isLoading] of prev) {
        if (currentModelIds.has(id)) {
          next.set(id, isLoading)
        }
      }
      return next
    })

    // 清理不存在的模型的refs
    listRefs.current.forEach((_, id) => {
      if (!currentModelIds.has(id)) {
        listRefs.current.delete(id)
      }
    })
    scrollRefs.current.forEach((_, id) => {
      if (!currentModelIds.has(id)) {
        scrollRefs.current.delete(id)
      }
    })
  }, [models])

  // 处理消息变化的回调
  const handleMessagesChange = React.useCallback((modelId: number, messages: any[]) => {
    setModelMessages((prev) => {
      const next = new Map(prev)
      next.set(modelId, messages)
      return next
    })

    // 新消息自动滚动到底部
    if (messages.length > 0) {
      setTimeout(() => {
        try {
          const scrollElement = scrollRefs.current.get(modelId)
          if (scrollElement) {
            scrollElement.scrollTop = scrollElement.scrollHeight
            return
          }

          const listRef = listRefs.current.get(modelId)
          if (listRef && typeof (listRef as any).scrollToBottom === 'function') {
            (listRef as any).scrollToBottom()
          }
        }
        catch (error) {
          console.warn('Auto scroll failed:', error)
        }
      }, 100)
    }
  }, [])

  // 处理请求控制器变化的回调
  const handleAbortControllerChange = React.useCallback((modelId: number, controller: AbortController | null) => {
    setAbortControllers((prev) => {
      const next = new Map(prev)
      if (controller) {
        next.set(modelId, controller)
      }
      else {
        next.delete(modelId)
      }
      return next
    })
  }, [])

  // 处理模型loading状态变化的回调
  const handleLoadingChange = React.useCallback((modelId: number, isLoading: boolean) => {
    // 音频转录完成后，忽略轮询发来的 isLoading: true，避免恢复阻塞状态
    if (audioFinishedRef.current && isLoading) {
      return
    }
    setModelLoadingStates((prev) => {
      const next = new Map(prev)
      next.set(modelId, isLoading)
      return next
    })
  }, [])

  // 构建 chats 对象，用于兼容现有的代码
  const chats = models.map((model) => {
    const messages = modelMessages.get(model.id) || []
    const requestRef = modelRequestRefs.current.get(model.id)
    const onRequest = requestRef?.current || (() => { })

    return { onRequest, messages }
  })

  // 构建 agents 兼容对象，用于InputArea组件的loading状态检查
  const agents = models.map((model) => ({
    isRequesting: () => modelLoadingStates.get(model.id) || false,
  }))

  // 当models变化时，清理已移除模型的abortControllers
  React.useEffect(() => {
    const currentModelIds = new Set(models.map((m) => m.id))
    setAbortControllers((prev) => {
      const next = new Map()
      // 先取消已移除模型的请求
      prev.forEach((controller, id) => {
        if (!currentModelIds.has(id)) {
          controller.abort()
        }
        else {
          next.set(id, controller)
        }
      })
      return next
    })
  }, [models])

  // 处理取消请求
  const handleCancel = () => {
    abortControllers.forEach((controller) => {
      controller.abort()
    })
    setAbortControllers(new Map())
  }

  const [fileList, setFileList] = useState<NonNullable<UploadProps['fileList']>>([])

  const props: UploadProps = {
    name: 'file',
    multiple: true,
    showUploadList: false,
    accept: 'image/*',
    beforeUpload: (file) => {
      const isImage = file.type.startsWith('image/')
      if (!isImage) {
        message.error('只能上传图片文件！')
        return false
      }

      // 手动添加文件到列表，完全控制状态
      const newFile: any = {
        uid: file.uid || `-${Date.now()}-${Math.random()}`,
        name: file.name,
        status: 'done',
        originFileObj: file,
        thumbUrl: URL.createObjectURL(file),
        percent: 100,
      }

      setFileList((prev) => [...prev, newFile])

      return false // 返回 false 阻止自动上传
    },
    // 不使用 onChange，避免循环触发
    // 不传递 fileList，使用非受控模式
  }

  const handleRemove = (uid: string) => {
    setFileList((prev) => (prev || []).filter((file) => file.uid !== uid))
  }

  const headerNode = (
    <Sender.Header
      open={fileList.length > 0}
      title={(
        <div className="p-1 max-h-[200px] overflow-y-auto">
          <div className="flex gap-4">
            {fileList.map((file) => (
              <div key={file.uid} className="relative group h-[60px] flex items-center">
                <Image
                  src={file.thumbUrl || URL.createObjectURL(file.originFileObj as Blob)}
                  alt={file.name}
                  className="!h-16 !w-16 object-contain rounded"
                />
                <div
                  className="absolute top-0 right-[-6px] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemove(file.uid)
                  }}
                >
                  <div className="bg-black bg-opacity-50 rounded-full w-4 h-4 flex items-center justify-center">
                    <CloseOutlined className="text-white text-[10px]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      onOpenChange={(open) => {
        if (!open) {
          setFileList([])
        }
      }}
    />
  )

  // 处理更换模型
  const handleChangeModel = (model: ModelItem) => {
    setChangingModel(model)
    setChangeModelVisible(true)
  }

  // 处理移除模型
  const handleRemoveModel = (model: ModelItem) => {
    if (models.length <= 1) {
      message.warning('至少需要保留一个模型')
      return
    }

    Modal.confirm({
      title: '确认移除模型',
      content: '模型服务移除后，对话不会保留，是否继续？',
      okText: '确认移除',
      cancelText: '取消',
      okType: 'danger',
      onOk() {
        try {
          // 取消该模型的请求
          const controller = abortControllers.get(model.id)
          if (controller) {
            controller.abort()
          }

          const newModels = models.filter((m) => m.id !== model.id)
          onModelsChange?.(newModels)
          message.success(`已移除模型 ${model.model_name}`)
        }
        catch (error) {
          console.error('移除模型时发生错误:', error)
          message.error('移除模型失败，请重试')
        }
      },
    })
  }

  // 确认更换模型
  const handleConfirmChangeModel = (newModel: ModelItem) => {
    if (changingModel) {
      try {
        // 取消原模型的请求
        const controller = abortControllers.get(changingModel.id)
        if (controller) {
          controller.abort()
        }

        const newModels = models.map((m) => m.id === changingModel.id ? newModel : m)
        onModelsChange?.(newModels)
        message.success(`已将模型 ${changingModel.model_name} 更换为 ${newModel.model_name}`)
      }
      catch (error) {
        console.error('更换模型时发生错误:', error)
        message.error('更换模型失败，请重试')
      }
    }
  }

  // 处理添加模型
  const handleAddModel = (newModels: ModelItem[]) => {
    try {
      if (!newModels || newModels.length === 0) {
        return
      }

      // 检查是否已达到最大数量
      if (models.length + newModels.length > 3) {
        message.warning('最多只能选择3个模型进行对比')
        return
      }

      // 过滤掉已存在的模型
      const modelsToAdd = newModels.filter((newModel) => !models.some((m) => m.id === newModel.id))

      if (modelsToAdd.length === 0) {
        message.warning('所选模型均已添加')
        return
      }

      if (modelsToAdd.length < newModels.length) {
        message.warning(`部分模型已存在，已添加 ${modelsToAdd.length} 个模型`)
      }

      const updatedModels = [...models, ...modelsToAdd]
      onModelsChange?.(updatedModels)

      if (modelsToAdd.length === 1) {
        message.success(`已添加模型 ${modelsToAdd[0].model_name}`)
      }
      else {
        message.success(`已添加 ${modelsToAdd.length} 个模型`)
      }
    }
    catch (error) {
      console.error('添加模型时发生错误:', error)
      message.error('添加模型失败，请重试')
    }
  }

  const onSubmit = async (text: string, fileName?: string) => {
    try {
      // 处理图片和音频文件上传和消息构建
      let messageContent
      const supportsVision = hasModelCategory(models[0]?.category, 'Vision_Language')

      if (supportsVision) {
        // 处理图片，将每个图片转换为 base64
        const imageContents: MessageContent[] = await Promise.all(
          (fileList || []).map(async (file) => {
            const base64 = await fileToBase64(file.originFileObj as File)
            return {
              type: 'image_url',
              image_url: {
                url: `data:${file.originFileObj?.type};base64,${base64}`,
              },
            }
          }),
        )

        // 添加文本内容（即使为空也添加，确保有文本类型的内容）
        imageContents.push({
          type: 'text',
          text: text || '请描述这张图片',
        })

        messageContent = imageContents
      }
      else if (models[0]?.category === 'AudioTranscription') {
        // 对于音频转录类型，用户消息显示文件名，模型输出显示转录文本
        if (text) {
          // 使用传入的文件名，如果没有则从 fileList 获取，都没有则使用默认值
          const audioFileName = fileName || (fileList && fileList.length > 0 ? fileList[fileList.length - 1]?.name : null) || '音频文件'

          // 判断是用户消息（文件名）还是AI回复（转录文本）
          // 如果 text === fileName，说明是用户消息（文件名）
          // 如果 text !== fileName，说明是AI回复（转录文本）
          if (text === audioFileName) {
            // 新一轮转录开始，重置完成标志，让 loading 轮询正常工作
            audioFinishedRef.current = false
            // 用户消息：只传递文件名
            messageContent = {
              __audioTranscription: true,
              __isUserMessage: true,
              userMessage: audioFileName,
            }
          }
          else {
            // AI回复：传递转录文本
            messageContent = {
              __audioTranscription: true,
              __isUserMessage: false,
              transcriptionText: text,
            }
          }
        }
        else {
          message.error('未获取到转录文本')
          return
        }
      }
      else {
        messageContent = text
      }

      // 发送消息
      if (models[0]?.category === 'Rerank') {
        if (!query.trim()) {
          message.error('请先输入查询问题')
          return
        }
        const currentQuery = query
        chats.forEach(({ onRequest }) => {
          onRequest(JSON.stringify({
            query: currentQuery,
            texts: text.split(',').map((t) => t.trim()).filter(Boolean),
          }))
        })
      }
      else if (supportsVision) {
        chats.forEach(({ onRequest }, index) => {
          const requestBody = {
            model: models[index].model_name,
            messages: [
              { role: 'user', content: messageContent },
            ],
            stream: true,
            temperature: 0.5,
          }
          onRequest(requestBody)
        })
      }
      else {
        chats.forEach(({ onRequest }) => {
          onRequest(messageContent)
        })
      }

      // 清理状态
      setInputMessage('')
      if (models[0]?.category === 'Rerank') {
        setQuery('') // 清空查询输入
      }
      setFileList([])
    }
    catch (error) {
      message.error('图片上传失败，请重试')
      console.error('Upload error:', error)
    }
  }

  return (
    <div ref={chatAreaRef} className={`${isFullscreen ? (getFullscreenElement() ? 'fixed inset-0' : 'fixed inset-0 z-50') : 'h-full'} bg-white flex flex-col min-h-0 overflow-hidden`}>
      {/* 每个模型的 ChatItem 组件，独立子组件调用 useXAgent 和 useXChat - 解决之前循环嵌套调用 useXAgent 和 useXChat 导致 Error: Should have a queue. This is likely a bug in React. Please file an issue. 的问题 */}
      {models.map((model) => {
        const requestRef = modelRequestRefs.current.get(model.id)
        const modelMessage = modelMessages.get(model.id) || []

        if (!requestRef) return null

        return (
          <ModelChatItem
            key={model.id}
            model={model}
            modelMessages={modelMessage}
            onRequest={requestRef}
            onMessagesChange={handleMessagesChange}
            onAbortControllerChange={handleAbortControllerChange}
            onLoadingChange={handleLoadingChange}
          />
        )
      })}

      {/* 头部区域 - 根据全屏状态显示不同内容 */}
      {isFullscreen ? (
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
          <h1 className="text-lg m-0">
            {models.length === 1 ? $t('模型体验') : $t('模型对比体验')}
            {' '}
            - 全屏模式
          </h1>
          <Button
            icon={<FullscreenExitOutlined />}
            type="text"
            onClick={handleFullscreen}
            title="退出全屏"
            className="p-2"
          />
        </div>
      ) : (
        <div className="flex items-center justify-between p-6 pb-4">
          <div className="flex items-center gap-4">
            <Button
              icon={<ArrowLeftOutlined />}
              type="text"
              onClick={onBack}
              className="p-0"
            />
            <h1 className="text-xl m-0">{models.length === 1 ? $t('模型体验') : $t('模型对比体验')}</h1>
          </div>
          <div className="flex items-center gap-2">
            {!models[0]?.category.includes('AudioSpeech') && !models[0]?.category.includes('Realtime') && (
              <Button
                icon={<PlusOutlined />}
                type="text"
                onClick={() => setAddModelVisible(true)}
                title={$t('添加模型')}
                className="p-2"
                disabled={models.length > 1 && models.length >= 3}
              />
            )}
            <Button
              icon={<FullscreenOutlined />}
              type="text"
              onClick={handleFullscreen}
              title="聊天区域全屏"
              className="p-2"
            />
          </div>
        </div>
      )}

      {/* 语音合成：独立面板（左侧模型+声音角色，右侧合成表单+结果） */}
      {models[0]?.category.includes('AudioSpeech') ? (
        <SpeechSynthesisPanel models={models} isFullscreen={isFullscreen} />
      ) : models[0]?.category.includes('Realtime') ? (
        <div className="flex-1 overflow-hidden min-h-0">
          <RealtimeTranscriptionPanel model={models[0]} isFullscreen={isFullscreen} />
        </div>
      ) : (
        <>
          {/* 聊天区域 - 复用组件 */}
          <ChatArea
            models={models}
            chats={chats}
            rolesAsObject={rolesAsObject}
            agents={agents}
            listRefs={listRefs}
            scrollRefs={scrollRefs}
            onScroll={onScroll}
            isFullscreen={isFullscreen}
            onModelChange={handleChangeModel}
            onModelRemove={handleRemoveModel}
          />

          {/* 输入区域 - 根据模型类型选择组件 */}
          {models[0]?.category === 'AudioTranscription' ? (
            <AudioArea
              fileList={fileList}
              setFileList={setFileList}
              agents={agents}
              isFullscreen={isFullscreen}
              onSubmit={onSubmit}
              handleCancel={handleCancel}
              onFinish={handleFinish}
              models={models}
              chats={chats}
            />
          ) : (
            <InputArea
              models={models}
              agents={agents}
              query={query}
              setQuery={setQuery}
              inputMessage={inputMessage}
              setInputMessage={setInputMessage}
              headerNode={headerNode}
              onSubmit={onSubmit}
              handleCancel={handleCancel}
              fileList={fileList}
              setFileList={setFileList}
              props={props}
              isFullscreen={isFullscreen}
            />
          )}
        </>
      )}

      {/* 更换模型弹窗 */}
      {changingModel && (
        <ChangeModelModal
          open={changeModelVisible}
          onCancel={() => {
            setChangeModelVisible(false)
            setChangingModel(null)
          }}
          onConfirm={handleConfirmChangeModel}
          modelType={changingModel.category}
          currentModel={changingModel}
          excludeModels={models.filter((m) => m.id !== changingModel.id)}
        />
      )}

      {/* 添加模型弹窗 */}
      <AddModelModal
        open={addModelVisible}
        onCancel={() => setAddModelVisible(false)}
        onConfirm={handleAddModel}
        modelType={models[0]?.category}
        selectedModels={models}
      />
    </div>
  )
}

export default ModelChatPage
