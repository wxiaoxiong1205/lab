import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type EventSourceMessage,
  fetchEventSource,
} from '@microsoft/fetch-event-source'

export type Service<R, P extends unknown[]> = (
  abortController: AbortController,
  ...args: P
) => Promise<R>

export interface Options<R, EventKey extends string = string> {
  manual?: boolean // 是否手动触发请求
  eventType?: (data: R) => EventKey // 计算事件类型
  events?: Partial<Record<EventKey, (data: R) => void>> // 事件处理函数，自动根据 eventType 计算事件类型
  onMessage?: (data: R) => void // 消息处理函数，适用于自定义处理的情况
  onMessageRaw?: (event: EventSourceMessage) => void // 原始消息处理函数，适用于需要根据原始事件自定义处理的情况
  onError?: (error: Error) => void // 错误处理函数
  openWhenHidden?: boolean // 是否在隐藏时打开
}

export function useSSE<
  R,
  EventKey extends string = string,
  P extends unknown[] = unknown[],
>(request: Service<ReadableStream<R>, P>, options?: Options<R, EventKey>) {
  const {
    manual = true,
    eventType,
    events,
    onMessage,
    onMessageRaw,
    onError,
    openWhenHidden = true,
  } = options || {}

  // 状态管理
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 使用 useRef 存储可变值
  const abortControllerRef = useRef<AbortController | null>(null)
  const streamRef = useRef<ReadableStream<R> | null>(null)

  const getEventType = useCallback(
    (data: R): EventKey => {
      return eventType?.(data) || ('event' as EventKey)
    },
    [eventType],
  )

  const readStream = useCallback(async () => {
    await fetchEventSource('', {
      fetch: (async () =>
        new Response(streamRef.current, {
          headers: { 'Content-Type': 'text/event-stream' },
        })) as typeof fetch,
      signal: abortControllerRef.current?.signal,
      openWhenHidden,
      onmessage: (event: EventSourceMessage) => {
        // 清除之前的错误状态
        setError(null)

        if (onMessageRaw) {
          onMessageRaw(event)
        }

        if (event.data === '[DONE]') return

        try {
          const data = event.data ? (JSON.parse(event.data) as R) : undefined

          if (data) {
            if (onMessage) {
              onMessage(data)
            }

            const eventTypeValue = getEventType(data)
            events?.[eventTypeValue]?.(data)
          }
        }
        catch (e) {
          const errorMessage = e instanceof Error ? e.message : String(e)
          setError(errorMessage)
          onError?.(e instanceof Error ? e : new Error(errorMessage))
        }
      },
      onerror: (err: Error) => {
        const errorMessage = err.message
        setError(errorMessage)
        setLoading(false)

        if (onError) {
          onError(err)
        }
        else {
          console.error(err)
          throw err
        }
      },
      onclose: () => {
        setLoading(false)
      },
    })
  }, [events, getEventType, onMessage, onMessageRaw, onError, openWhenHidden])

  const run = useCallback(
    async (...args: P) => {
      if (loading) {
        console.warn(
          'useSSE: 请求已在进行中，请等待当前请求完成或调用 stop() 停止',
        )
        return
      }

      try {
        setLoading(true)
        setError(null)
        abortControllerRef.current = new AbortController()

        streamRef.current = await request(abortControllerRef.current, ...args)
        await readStream()
      }
      catch (err) {
        if (abortControllerRef.current?.signal.aborted) {
          // 请求被手动取消，不视为错误
          console.log('useSSE: 请求已被取消')
        }
        else {
          const errorMessage = err instanceof Error ? err.message : String(err)
          setError(errorMessage)
          onError?.(err instanceof Error ? err : new Error(errorMessage))
        }
      }
      finally {
        setLoading(false)
        abortControllerRef.current = null
      }
    },
    [loading, request, readStream, onError],
  )

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      streamRef.current = null
      setLoading(false)
      console.log('useSSE: 流处理已停止')
    }
  }, [])

  // 自动运行（如果 manual 为 false）
  useEffect(() => {
    if (!manual) {
      run(...([] as unknown as P))
    }
    return () => {
      stop()
    }
  }, [manual, run, stop])

  return {
    run,
    stop,
    loading,
    error,
  }
}
