import { throttle } from 'lodash'
import qs from 'query-string'
import { useEffect, useRef } from 'react'
import { convertFileSize } from '@/utils'
import request from '@/utils/request'

export interface HandlerOptions {
  isComplete?: boolean | null
  percent?: number
  progress?: number
  contentLength?: number | null
}

type HandlerFunction = (data: any, options?: HandlerOptions) => any
interface RequestConfig {
  url: string
  handler: HandlerFunction
  errorHandler?: (error: any) => void
  beforeReconnect?: () => void
  params?: object
  watch?: boolean
  contentType?: 'json' | 'text'
}

async function parseErrorResponse(response: Response) {
  try {
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      return await response.json()
    }
    else {
      const text = await response.text()
      return { message: text || 'Unknown error' }
    }
  }
  catch (e) {
    return { message: 'Failed to parse error response' }
  }
}

const useSetChunkFetch = () => {
  const axiosToken = useRef<any>(null)
  const requestConfig = useRef<any>({})
  const chunkDataRef = useRef<any>([])

  const readTextEventStreamData = async (
    response: Response,
    callback: HandlerFunction,
    delay = 100,
  ) => {
    class BufferManager {
      private buffer: any[] = []
      private contentLength: number | null = null
      private progress: number = 0
      private percent: number = 0
      private speedHistory: number[] = []
      private maxHistory = 5
      private lastTime: number = performance.now()
      private lastBytes: number = 0
      private totalBytes: number = 0
      private avgSpeed: number = 0

      constructor(private options: { contentLength?: string | null }) {
        this.contentLength = options.contentLength
          ? parseInt(options.contentLength, 10)
          : null
      }

      private updateProgress(data: any) {
        if (this.contentLength) {
          this.progress += new TextEncoder().encode(data).length
          this.percent = Math.floor((this.progress / this.contentLength) * 100)
        }
      }

      private logSpeed(speedBps: number) {
        this.speedHistory.push(speedBps)
        if (this.speedHistory.length > this.maxHistory) {
          this.speedHistory.shift()
        }
        this.avgSpeed
          = this.speedHistory.reduce((a, b) => a + b, 0)
            / this.speedHistory.length
      }

      public updateSpeed(bytes: number) {
        const now = performance.now()
        const elapsed = (now - this.lastTime) / 1000
        if (elapsed > 0.3) {
          const speed = (this.totalBytes + bytes - this.lastBytes) / elapsed
          this.logSpeed(speed)
          this.lastTime = now
          this.lastBytes = this.totalBytes + bytes
        }
      }

      public add(data: any) {
        this.buffer.push(data)
        this.updateProgress(data)
      }

      public flush(done?: boolean) {
        if (this.buffer.length > 0) {
          const currentBuffer = [...this.buffer]
          this.buffer = []
          currentBuffer.forEach((item, i) => {
            const isComplete = i === currentBuffer.length - 1 && done
            callback(item, {
              isComplete: isComplete || this.percent === 100,
              percent: this.percent,
              progress: this.progress,
              contentLength: this.contentLength,
            })
          })
        }
      }

      public getBuffer() {
        return this.buffer
      }
    }

    const reader
      = response?.body?.getReader() as ReadableStreamDefaultReader<Uint8Array>
    const decoder = new TextDecoder('utf-8')
    const contentLength = response.headers.get('content-length')

    const bufferManager = new BufferManager({
      contentLength,
    })

    const throttledCallback = throttle(() => {
      bufferManager.flush()
    }, delay)

    let isReading = true

    while (isReading) {
      const { done, value } = await reader.read()

      if (done) {
        isReading = false
        bufferManager.flush(done)
        break
      }

      try {
        const chunk = decoder.decode(value, { stream: true })
        bufferManager.add(chunk)
        bufferManager.updateSpeed(chunk.length)
        throttledCallback()
      }
      catch (error) {
        // handle error
      }
    }
  }

  const fetchChunkRequest = async ({
    url,
    handler,
    errorHandler,
    watch,
    params = {},
  }: RequestConfig) => {
    axiosToken.current?.abort?.()
    axiosToken.current = new AbortController()

    try {
      // 构建完整的 URL，包含查询参数
      const queryParams = qs.stringify({
        ...params,
        watch: watch === undefined ? true : watch,
      })
      const fullUrl = queryParams ? `${url}?${queryParams}` : url

      // 使用 request 工具，通过 adapter: 'fetch' 获取原始 Response 对象以支持流式响应
      const axiosResponse = await request({
        url: fullUrl,
        method: 'GET',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        signal: axiosToken.current.signal,
        adapter: 'fetch', // 使用 fetch adapter 以支持流式响应
        responseType: 'stream', // 设置为 stream 类型
      } as any) as any // 类型断言，因为使用 adapter: 'fetch' 时返回的是 axios 响应对象

      // 从 axios 响应中获取原始的 Response 对象
      // 当使用 adapter: 'fetch' 时，response.data 是 ReadableStream 或 Response 对象
      let response: Response
      if (axiosResponse.data instanceof Response) {
        response = axiosResponse.data
      }
      else if (axiosResponse.data instanceof ReadableStream) {
        // 如果是 ReadableStream，需要包装成 Response 对象
        response = new Response(axiosResponse.data, {
          headers: (axiosResponse.headers || {}) as HeadersInit,
          status: axiosResponse.status || 200,
          statusText: axiosResponse.statusText || 'OK',
        })
      }
      else {
        // 如果都不匹配，尝试从原始响应中获取
        // 这种情况不应该发生，但为了安全起见添加回退逻辑
        throw new TypeError('无法获取流式响应')
      }

      if (!response.ok) {
        const error = await parseErrorResponse(response)
        if (errorHandler) {
          errorHandler(error)
        }
        else {
          handler(error?.message)
        }
        return
      }

      await readTextEventStreamData(response, handler)
    }
    catch (error) {
      // handle error: catched in request interceptor
      if (errorHandler && error instanceof Error) {
        errorHandler(error)
      }
    }

    return axiosToken.current
  }

  const setChunkFetch = (config: RequestConfig) => {
    requestConfig.current = { ...config }
    fetchChunkRequest(requestConfig.current)
    return axiosToken
  }

  useEffect(() => {
    const handleUnload = () => {
      axiosToken.current?.abort?.()
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleUnload)
    }

    return () => {
      axiosToken.current?.abort?.()
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleUnload)
      }
    }
  }, [])

  return {
    setChunkFetch,
  }
}

export default useSetChunkFetch
