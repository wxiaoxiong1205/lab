import { useCallback, useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { getBackendConfig, getBackendURLFromParams } from '../../utils/getBackendURL'

interface UseAiAnnotationOptions {
  /** 成功完成时的回调 */
  onComplete?: () => void
  /** 错误时的回调 */
  onError?: (error: Error) => void
}

interface UseAiAnnotationReturn {
  /** 流式返回的内容 */
  streamingContent: string
  /** 是否正在加载 */
  loading: boolean
  /** 开始AI自动标注 */
  startAnnotation: (
    taskId: number,
    prompt?: string,
    imageData?: { messages: any[], images: string[] },
    options?: { annotationTarget?: string, instruction?: string, input?: string }
  ) => Promise<void>
  /** 取消当前请求 */
  cancel: () => void
  /** 重置流式内容 */
  reset: () => void
}

/**
 * AI自动标注 Hook（SSE流式返回）
 * @param options 配置选项
 * @returns Hook返回值
 */
export const useAiAnnotation = (options: UseAiAnnotationOptions): UseAiAnnotationReturn => {
  const { onComplete, onError } = options
  const [streamingContent, setStreamingContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const hasReceivedContentRef = useRef<boolean>(false)

  // 取消当前请求
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setLoading(false)
    }
  }, [])

  // 重置流式内容
  const reset = useCallback(() => {
    setStreamingContent('')
    hasReceivedContentRef.current = false
    cancel()
  }, [cancel])

  // 检查错误消息是否是HTML（404页面等）
  const isHtmlError = useCallback((errorMessage: string): boolean => {
    if (!errorMessage) return false
    // 检查是否包含HTML标签或404页面的特征
    return (
      errorMessage.includes('<!DOCTYPE html>')
      || errorMessage.includes('<html')
      || errorMessage.includes('404')
      || errorMessage.includes('This page could not be found')
    )
  }, [])

  // 提取错误消息，如果是HTML错误则返回"标注失败"
  const extractErrorMessage = useCallback((error: any): string => {
    let errorMessage = error?.message || 'AI自动标注失败'

    try {
      // 如果错误对象有 error 属性
      if (error?.error?.message) {
        errorMessage = error.error.message
      }
      else if (typeof error?.message === 'string' && error.message.startsWith('{')) {
        // 如果错误信息是JSON字符串，尝试解析
        const errorData = JSON.parse(error.message)
        errorMessage = errorData?.error?.message || errorData?.message || errorMessage
      }
    }
    catch (e) {
      // 解析失败，使用原始错误信息
    }

    // 如果是HTML错误（404页面等），返回"标注失败"
    if (isHtmlError(errorMessage)) {
      return '标注失败'
    }

    return errorMessage
  }, [isHtmlError])

  // 开始AI自动标注
  const startAnnotation = useCallback(async (
    taskId: number,
    prompt?: string,
    imageData?: { messages: any[], images: string[] },
    options?: { annotationTarget?: string, instruction?: string, input?: string },
  ) => {
    // 验证参数
    if (!taskId) {
      message.error('任务ID不存在')
      return
    }

    // 多轮对话（图像或文本）与单轮文本的参数验证
    if (imageData) {
      // 多轮：必须有 messages；images 可为空数组（文本多轮无图）
      if (!imageData.messages || !Array.isArray(imageData.messages) || imageData.messages.length === 0) {
        message.error('多轮对话缺少messages数据')
        return
      }
      if (!Array.isArray(imageData.images)) {
        message.error('images 必须为数组')
        return
      }
    }
    else {
      // 文本标注：sft需要 prompt；dpo alpaca 使用 instruction input
      if (!prompt && !options?.instruction && !options?.input) {
        message.error('当前数据缺少prompt字段')
        return
      }
    }

    // 如果已有正在进行的请求，先取消它
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // 创建新的 AbortController
    const controller = new AbortController()
    abortControllerRef.current = controller

    // 重置流式内容
    setStreamingContent('')
    hasReceivedContentRef.current = false
    setLoading(true)

    // 获取 baseURL，与 apiClient 保持一致
    let baseURL = import.meta.env.DEV
      ? `${import.meta.env.VITE_PREFIX_BASE_URL}/api/v1`
      : '/lab-backend/api/v1'

    // 优先使用URL参数中的baseURL
    const backendURLFromParams = getBackendURLFromParams()
    if (backendURLFromParams) {
      baseURL = `${backendURLFromParams}/api/v1`
    }
    else {
      // 如果URL参数中没有，则使用localStorage中保存的配置
      const backendConfig = getBackendConfig()
      if (backendConfig?.baseURL) {
        baseURL = `${backendConfig.baseURL}/api/v1`
      }
    }

    // 获取 token，与 apiClient 保持一致
    const token
      = localStorage.getItem('auth_token')
        || (window as any).tokenStorage?.getToken?.()
        || (window as any).useAuthStore?.getState?.()?.token

    const url = `${baseURL}/label/annotations/ai`

    try {
      await fetchEventSource(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(
          imageData
            ? {
                task_id: taskId,
                input_data: {
                  messages: imageData.messages,
                  images: imageData.images,
                  ...(options?.annotationTarget ? { annotation_target: options.annotationTarget } : {}),
                },
              }
            : {
                task_id: taskId,
                input_data: {
                  ...(options?.instruction !== undefined || options?.input !== undefined
                    ? {
                        instruction: options?.instruction || '',
                        input: options?.input || '',
                      }
                    : { prompt }),
                  ...(options?.annotationTarget ? { annotation_target: options.annotationTarget } : {}),
                },
              },
        ),
        signal: controller.signal,
        // 当接收到消息时触发
        onmessage(event) {
          try {
            // 检查是否是结束标记
            if (event.data === '[DONE]') {
              // 检查是否接收到任何内容
              if (!hasReceivedContentRef.current) {
                message.error('标注失败')
                setLoading(false)
                abortControllerRef.current = null
                onError?.(new Error('未接收到任何标注内容'))
                return
              }
              message.success('AI自动标注完成')
              setLoading(false)
              abortControllerRef.current = null
              onComplete?.()
              return
            }

            // 解析 JSON 数据
            const chunk = JSON.parse(event.data)

            // 提取 content 内容
            if (chunk.choices && chunk.choices[0]?.delta?.content) {
              const content = chunk.choices[0].delta.content
              hasReceivedContentRef.current = true
              setStreamingContent((prev) => prev + content)
            }
          }
          catch (error) {
            console.error('解析SSE数据失败:', error, event.data)
            // 不抛出错误，继续处理后续数据
          }
        },
        // 当连接打开时触发
        async onopen(response) {
          // 检查响应状态
          if (response.ok && response.status === 200) {
            return // 一切正常，继续处理
          }

          // 对于错误响应，尝试解析错误信息
          let errorMessage = `HTTP error! status: ${response.status}`
          try {
            const errorData = await response.json()
            // 支持多种错误结构：error.error.message、error.message、detail
            errorMessage = errorData?.error?.message || errorData?.message || errorData?.detail || errorMessage
          }
          catch (e) {
            // 如果无法解析JSON，使用默认错误信息
          }

          // 如果是HTML错误（404页面等），使用"标注失败"
          if (isHtmlError(errorMessage)) {
            errorMessage = '标注失败'
          }

          // 抛出错误，这会触发 onerror 回调并停止连接
          throw new Error(errorMessage)
        },
        // 当发生错误时触发
        onerror(err) {
          const error = err instanceof Error ? err : new Error(String(err))
          // 如果是取消操作，不显示错误提示
          if (error?.name !== 'AbortError') {
            const errorMessage = extractErrorMessage(error)
            message.error(errorMessage)
            onError?.(error)
          }
          setLoading(false)
          abortControllerRef.current = null
          throw error // 重新抛出错误以停止事件源
        },
        // 当连接关闭时触发（正常完成）
        onclose() {
          // 检查是否接收到任何内容
          if (!hasReceivedContentRef.current) {
            message.error('标注失败')
            onError?.(new Error('未接收到任何标注内容'))
          }
          else {
            // message.success('AI自动标注完成');
          }
          setLoading(false)
          abortControllerRef.current = null
          onComplete?.()
        },
      })
    }
    catch (error: any) {
      // 如果是 AbortError，不调用 onError（因为这是用户主动取消）
      if (error?.name === 'AbortError') {
        return
      }
      // 如果是取消操作，不显示错误提示
      if (error?.name !== 'AbortError') {
        const errorMessage = extractErrorMessage(error)
        message.error(errorMessage)
        onError?.(error)
      }
      setLoading(false)
      abortControllerRef.current = null
    }
  }, [onComplete, onError, isHtmlError, extractErrorMessage])
  // 组件卸载时取消正在进行的请求
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  return {
    streamingContent,
    loading,
    startAnnotation,
    cancel,
    reset,
  }
}
