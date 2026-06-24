import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Modal, Tooltip, message } from 'antd'
import { Mic, Pause, Play, Square } from 'lucide-react'
import type { ModelItem } from './types'
import { ModelLogo } from '@/components/model-card/ModelLogo'
import useAuthStore from '@/stores/auth'
import { withApiPath } from '@/utils'

type RealtimeStatus = 'idle' | 'connecting' | 'recording' | 'paused' | 'stopping' | 'closed' | 'error'

interface RealtimeTranscriptionPanelProps {
  model: ModelItem
  isFullscreen?: boolean
}

const TARGET_SAMPLE_RATE = 16000
const FRAME_SIZE = 960
const DEFAULT_CHUNK_SIZE = [5, 10, 5]
const DEFAULT_CHUNK_INTERVAL = 10
const DEFAULT_MODE = '2pass'

const buildRealtimeWsUrl = (modelName: string, token: string) => {
  const wsUrl = new URL(withApiPath('/v1/experience/realtime'), window.location.origin)
  wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  wsUrl.search = new URLSearchParams({
    model: modelName,
    auth_token: token,
  }).toString()
  return wsUrl.toString()
}

const createSessionId = (modelName: string) => {
  const safeModelName = modelName.replace(/[^\w-]+/g, '_')
  return `${safeModelName}_${Date.now()}`
}

const getStoredToken = () => {
  const storeToken = useAuthStore.getState().token
  if (storeToken) {
    return storeToken
  }

  try {
    return JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token || ''
  }
  catch {
    return ''
  }
}

const mergeTranscript = (current: string, incoming: string) => {
  const nextText = incoming.trim()
  if (!nextText) {
    return current
  }
  if (!current) {
    return nextText
  }
  if (nextText.startsWith(current)) {
    return nextText
  }
  if (current.endsWith(nextText)) {
    return current
  }
  return `${current}${current.endsWith(' ') ? '' : ' '}${nextText}`
}

/** 2pass-online：不清空 interim，只在上一帧结果上延续；整段刷新时用新整段替换，避免「个」+「这个」叠字 */
const mergeOnlineInterim = (prev: string, incoming: string) => {
  const nextText = incoming.trim()
  if (!nextText) {
    return prev
  }
  if (!prev) {
    return nextText
  }
  if (nextText.startsWith(prev)) {
    return nextText
  }
  if (prev.endsWith(nextText)) {
    return prev
  }
  if (nextText.length > prev.length) {
    return nextText
  }
  return `${prev}${nextText}`
}

const extractTextFromPayload = (payload: any): string => {
  if (!payload) {
    return ''
  }

  if (typeof payload === 'string') {
    return payload
  }

  const joinStampSents = (stampSents: any[]) => {
    return stampSents
      .map((item: any) => {
        if (typeof item?.text === 'string' && item.text.trim()) {
          return item.text.trim()
        }
        if (typeof item?.sentence === 'string' && item.sentence.trim()) {
          return item.sentence.trim()
        }
        if (typeof item?.text_seg === 'string' && item.text_seg.trim()) {
          return item.text_seg.replace(/\s+/g, '')
        }
        return ''
      })
      .filter(Boolean)
      .join('')
  }

  if (typeof payload.text === 'string' && payload.text.trim()) {
    return payload.text
  }

  if (typeof payload.result === 'string' && payload.result.trim()) {
    return payload.result
  }

  if (payload.result && typeof payload.result.text === 'string' && payload.result.text.trim()) {
    return payload.result.text
  }

  if (payload.data && typeof payload.data.text === 'string' && payload.data.text.trim()) {
    return payload.data.text
  }

  if (Array.isArray(payload.stamp_sents) && payload.stamp_sents.length > 0) {
    return joinStampSents(payload.stamp_sents)
  }

  return ''
}

const normalizePassMode = (payload: any) => String(payload?.mode ?? payload?.type ?? '').toLowerCase()

/** 2pass-offline：优先用 text 作为黑色定稿展示，无则回退 stamp_sents 等 */
const extractOfflineDisplayText = (payload: any): string => {
  if (typeof payload?.text === 'string' && payload.text.trim()) {
    return payload.text.trim()
  }
  return extractTextFromPayload(payload)
}

const downsampleTo16k = (input: Float32Array, inputSampleRate: number) => {
  if (!input.length) {
    return new Int16Array()
  }

  if (inputSampleRate === TARGET_SAMPLE_RATE) {
    const direct = new Int16Array(input.length)
    for (let i = 0; i < input.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, input[i]))
      direct[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
    }
    return direct
  }

  const ratio = inputSampleRate / TARGET_SAMPLE_RATE
  const outputLength = Math.max(1, Math.round(input.length / ratio))
  const output = new Int16Array(outputLength)

  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio
    const leftIndex = Math.floor(position)
    const rightIndex = Math.min(leftIndex + 1, input.length - 1)
    const weight = position - leftIndex
    const sample = input[leftIndex] * (1 - weight) + input[rightIndex] * weight
    const normalized = Math.max(-1, Math.min(1, sample))
    output[i] = normalized < 0 ? normalized * 0x8000 : normalized * 0x7FFF
  }

  return output
}

const parseWsMessage = async (data: Blob | ArrayBuffer | string) => {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    }
    catch {
      return { text: data }
    }
  }

  if (data instanceof Blob) {
    const text = await data.text()
    return parseWsMessage(text)
  }

  return null
}

const RealtimeTranscriptionPanel: React.FC<RealtimeTranscriptionPanelProps> = ({
  model,
  isFullscreen = false,
}) => {
  const [status, setStatus] = useState<RealtimeStatus>('idle')
  const [errorText, setErrorText] = useState('')
  const [finalTranscript, setFinalTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [sessionId, setSessionId] = useState('')

  const statusRef = useRef<RealtimeStatus>('idle')
  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sampleBufferRef = useRef<number[]>([])
  const sessionIdRef = useRef('')
  const manualStopRef = useRef(false)
  const discardIncomingRef = useRef(false)
  /** 正在发起新会话（关闭旧 WebSocket 过程中），忽略旧连接的 onclose 以免把状态打回 idle */
  const reconnectingRef = useRef(false)

  useEffect(() => {
    statusRef.current = status
  }, [status])

  const stopAudioCapture = useCallback(async () => {
    processorRef.current?.disconnect()
    sourceNodeRef.current?.disconnect()

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      await audioContextRef.current.close().catch(() => {})
    }

    streamRef.current?.getTracks().forEach((track) => track.stop())

    processorRef.current = null
    sourceNodeRef.current = null
    audioContextRef.current = null
    streamRef.current = null
    sampleBufferRef.current = []
  }, [])

  const cleanupSession = useCallback(async (closeSocket = true) => {
    await stopAudioCapture()

    if (closeSocket && wsRef.current) {
      try {
        wsRef.current.close()
      }
      catch {
      }
    }

    wsRef.current = null
  }, [stopAudioCapture])

  useEffect(() => {
    return () => {
      void cleanupSession(true)
    }
  }, [cleanupSession])

  const flushSamples = useCallback((flushRemaining = false) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return
    }

    const buffer = sampleBufferRef.current
    while (buffer.length >= FRAME_SIZE) {
      const frame = new Int16Array(buffer.splice(0, FRAME_SIZE))
      ws.send(frame.buffer)
    }

    if (flushRemaining && buffer.length > 0) {
      const frame = new Int16Array(buffer.splice(0, buffer.length))
      ws.send(frame.buffer)
    }
  }, [])

  const setupAudioPipeline = useCallback(async (stream: MediaStream) => {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextCtor) {
      throw new Error('当前浏览器不支持音频采集')
    }

    const audioContext = new AudioContextCtor()
    const sourceNode = audioContext.createMediaStreamSource(stream)
    const processor = audioContext.createScriptProcessor(4096, 1, 1)

    processor.onaudioprocess = (event) => {
      if (statusRef.current !== 'recording') {
        return
      }

      const inputData = event.inputBuffer.getChannelData(0)
      const pcm16 = downsampleTo16k(inputData, audioContext.sampleRate)

      for (let i = 0; i < pcm16.length; i += 1) {
        sampleBufferRef.current.push(pcm16[i])
      }

      flushSamples(false)
    }

    sourceNode.connect(processor)
    processor.connect(audioContext.destination)

    audioContextRef.current = audioContext
    sourceNodeRef.current = sourceNode
    processorRef.current = processor
    streamRef.current = stream
  }, [flushSamples])

  const handleWsMessage = useCallback(async (data: Blob | ArrayBuffer | string) => {
    if (discardIncomingRef.current || manualStopRef.current || statusRef.current === 'stopping' || statusRef.current === 'closed') {
      return
    }

    const payload = await parseWsMessage(data)
    if (!payload || typeof payload !== 'object') {
      return
    }

    const mode = normalizePassMode(payload)

    if (mode === '2pass-online') {
      const text = extractTextFromPayload(payload)
      if (!text) {
        return
      }
      setInterimTranscript((prev) => mergeOnlineInterim(prev, text))
      return
    }

    if (mode === '2pass-offline') {
      const text = extractOfflineDisplayText(payload)
      if (!text) {
        return
      }
      setFinalTranscript((prev) => mergeTranscript(prev, text))
      setInterimTranscript('')
    }
  }, [])

  const startRealtimeSession = useCallback(async () => {
    const token = getStoredToken()
    if (!token) {
      message.error('未获取到登录 token，无法启动实时语音识别')
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      message.error('当前浏览器不支持麦克风采集')
      return
    }

    reconnectingRef.current = true
    await cleanupSession(true)

    manualStopRef.current = false
    discardIncomingRef.current = false
    setErrorText('')
    setFinalTranscript('')
    setInterimTranscript('')
    setStatus('connecting')

    const currentSessionId = createSessionId(model.model_name)
    sessionIdRef.current = currentSessionId
    setSessionId(currentSessionId)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      const ws = new WebSocket(buildRealtimeWsUrl(model.model_name, token))
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = async () => {
        reconnectingRef.current = false
        try {
          ws.send(JSON.stringify({
            chunk_size: DEFAULT_CHUNK_SIZE,
            wav_name: currentSessionId,
            is_speaking: true,
            chunk_interval: DEFAULT_CHUNK_INTERVAL,
            itn: true,
            mode: DEFAULT_MODE,
          }))

          await setupAudioPipeline(stream)
          setStatus('recording')
        }
        catch (error: any) {
          setErrorText(error?.message || '实时语音识别初始化失败')
          setStatus('error')
          message.error(error?.message || '实时语音识别初始化失败')
          await cleanupSession(true)
        }
      }

      ws.onmessage = (event) => {
        void handleWsMessage(event.data)
      }

      ws.onerror = () => {
        setErrorText('实时语音连接异常，请稍后重试')
        setStatus('error')
      }

      ws.onclose = async () => {
        await stopAudioCapture()

        if (wsRef.current !== null && wsRef.current !== ws) {
          return
        }
        if (reconnectingRef.current) {
          if (wsRef.current === ws) {
            wsRef.current = null
          }
          return
        }
        if (wsRef.current === ws) {
          wsRef.current = null
        }

        const wasManualStop = manualStopRef.current
        manualStopRef.current = false
        setSessionId('')
        sessionIdRef.current = ''
        setErrorText('')

        if (statusRef.current !== 'error') {
          setStatus(wasManualStop ? 'closed' : 'idle')
        }
      }
    }
    catch (error: any) {
      reconnectingRef.current = false
      await cleanupSession(true)
      setStatus('error')
      setErrorText(error?.message || '麦克风启动失败')
      message.error(error?.message || '麦克风启动失败')
    }
  }, [cleanupSession, handleWsMessage, model.model_name, setupAudioPipeline, stopAudioCapture])

  const handlePause = useCallback(async () => {
    if (!audioContextRef.current || statusRef.current !== 'recording') {
      return
    }

    await audioContextRef.current.suspend()
    setStatus('paused')
  }, [])

  const handleResume = useCallback(async () => {
    if (!audioContextRef.current || statusRef.current !== 'paused') {
      return
    }

    await audioContextRef.current.resume()
    setStatus('recording')
  }, [])

  const handleStop = useCallback(async () => {
    const ws = wsRef.current
    if (!ws || (statusRef.current !== 'recording' && statusRef.current !== 'paused')) {
      return
    }

    const currentSessionId = sessionIdRef.current

    manualStopRef.current = true
    discardIncomingRef.current = true
    setStatus('stopping')
    setFinalTranscript('')
    setInterimTranscript('')
    setSessionId('')
    sessionIdRef.current = ''

    flushSamples(true)
    await stopAudioCapture()

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        chunk_size: DEFAULT_CHUNK_SIZE,
        wav_name: currentSessionId,
        is_speaking: false,
        chunk_interval: DEFAULT_CHUNK_INTERVAL,
        mode: DEFAULT_MODE,
      }))
    }
  }, [flushSamples, stopAudioCapture])

  const handleConfirmStop = useCallback(() => {
    if (statusRef.current !== 'recording' && statusRef.current !== 'paused') {
      return
    }

    Modal.confirm({
      title: '结束录音',
      content: '结束后本次录音无法再继续，再次启动录音将清除现有录音重新开始，确定结束吗？',
      okText: '结束录音',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        void handleStop()
      },
    })
  }, [handleStop])

  const combinedTranscript = useMemo(() => {
    return `${finalTranscript}${interimTranscript || ''}`.trim()
  }, [finalTranscript, interimTranscript])

  return (
    <div className={`${isFullscreen ? 'flex-1 p-4 min-h-0' : 'flex-1 px-6 pt-4 pb-6 h-full overflow-hidden min-h-0'}`}>
      <style>
        {`
          @keyframes rt-interim-shimmer {
            0% { background-position: 0% 50%; }
            100% { background-position: 200% 50%; }
          }
          .rt-interim-live {
            background-image: linear-gradient(
              90deg,
              #9ca3af 0%,
              #d1d5db 40%,
              #e5e7eb 50%,
              #d1d5db 60%,
              #9ca3af 100%
            );
            background-size: 200% 100%;
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            -webkit-text-fill-color: transparent;
            animation: rt-interim-shimmer 2.2s ease-in-out infinite;
          }
          .rt-interim-caret {
            animation: rt-interim-blink 1s step-end infinite;
          }
          @keyframes rt-interim-blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.2; }
          }
        `}
      </style>
      <div className="w-full h-full flex flex-col gap-4 overflow-hidden">
        <div className="flex-1 rounded-lg border border-gray-200 bg-white overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-3 min-w-0">
              <ModelLogo name={model.model_name} logo={model.logo} size="medium" />
              <div className="min-w-0">
                <div className="text-base font-medium text-gray-900 truncate">{model.model_name}</div>
                <div className="text-sm text-gray-500">{model.description?.trim() || '--'}</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 p-4">
            <div className="text-sm text-gray-500">识别结果</div>
            {(status === 'idle' || status === 'closed' || status === 'error' || status === 'stopping') && (
              <div className="text-xs text-gray-400 break-all">
                会话 ID：
                {sessionId || '--'}
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 p-4 overflow-y-auto">
            {combinedTranscript
              ? (
                  <div className="text-base leading-7 whitespace-pre-wrap break-words flex-1 overflow-y-auto">
                    {finalTranscript && (
                      <span className="text-gray-900">{finalTranscript}</span>
                    )}
                    {interimTranscript && (
                      <span className="relative inline align-baseline">
                        <span className="rt-interim-live">{interimTranscript}</span>
                        <span
                          className="rt-interim-caret inline-block w-px h-[1.05em] align-middle ml-px bg-gray-400/90 shadow-[0_0_6px_rgba(156,163,175,0.85)]"
                          aria-hidden
                        />
                      </span>
                    )}
                  </div>
                )
              : (
                  <div className="h-full min-h-[180px]" />
                )}
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-1">
          {(status === 'recording' || status === 'paused' || status === 'connecting') && (
            <div className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={`shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-white ${
                  status === 'paused' ? 'bg-amber-500' : 'bg-blue-500'
                } ${(status === 'recording' || status === 'connecting') ? 'animate-pulse' : ''}`}
                >
                  {status === 'paused'
                    ? <Pause className="size-6" strokeWidth={2} aria-hidden />
                    : <Mic className="size-6" strokeWidth={2} aria-hidden />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-medium text-gray-900 truncate">
                    {status === 'connecting' && '正在建立实时识别连接'}
                    {status === 'recording' && '正在实时识别'}
                    {status === 'paused' && '录音已暂停'}
                  </div>
                  <div className="text-sm text-gray-500 mt-1 break-all">
                    会话 ID：
                    {sessionId || '--'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                {status === 'recording' && (
                  <>
                    <Tooltip title="暂停录音" placement="top">
                      <Button
                        type="default"
                        shape="circle"
                        className="!flex !size-10 !min-w-10 !p-0 !items-center !justify-center [&_.ant-wave]:!rounded-full"
                        onClick={() => {
                          void handlePause()
                        }}
                      >
                        <Pause className="size-[18px] shrink-0" strokeWidth={2} aria-hidden />
                      </Button>
                    </Tooltip>
                    <Tooltip title="结束录音" placement="top">
                      <Button
                        danger
                        shape="circle"
                        className="!flex !size-10 !min-w-10 !p-0 !items-center !justify-center [&_.ant-wave]:!rounded-full"
                        onClick={() => {
                          handleConfirmStop()
                        }}
                      >
                        <Square className="size-[18px] shrink-0" strokeWidth={2} aria-hidden />
                      </Button>
                    </Tooltip>
                  </>
                )}
                {status === 'paused' && (
                  <>
                    <Tooltip title="继续录音" placement="top">
                      <Button
                        type="primary"
                        shape="circle"
                        className="!flex !size-10 !min-w-10 !p-0 !items-center !justify-center [&_.ant-wave]:!rounded-full"
                        onClick={() => {
                          void handleResume()
                        }}
                      >
                        <Play className="size-[18px] shrink-0" strokeWidth={2} aria-hidden />
                      </Button>
                    </Tooltip>
                    <Tooltip title="结束录音" placement="top">
                      <Button
                        danger
                        shape="circle"
                        className="!flex !size-10 !min-w-10 !p-0 !items-center !justify-center [&_.ant-wave]:!rounded-full"
                        onClick={() => {
                          handleConfirmStop()
                        }}
                      >
                        <Square className="size-[18px] shrink-0" strokeWidth={2} aria-hidden />
                      </Button>
                    </Tooltip>
                  </>
                )}
              </div>
            </div>
          )}

          {(status === 'idle' || status === 'closed' || status === 'error' || status === 'stopping') && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                type="primary"
                size="large"
                icon={<Mic className="w-4 h-4" />}
                onClick={() => {
                  void startRealtimeSession()
                }}
              >
                开始录音
              </Button>
            </div>
          )}
        </div>

        <div className="text-center text-xs text-gray-500">
          本回答由AI生成，内容仅供参考，请仔细甄别
        </div>
      </div>
    </div>
  )
}

export default RealtimeTranscriptionPanel
