import type { UploadProps } from 'antd'
import { Button, Flex, Modal, Tooltip, message } from 'antd'
import { Mic, StopCircle, Upload as UploadIcon } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import Recorder from 'js-audio-recorder'
import type { ModelItem } from './types'
import request from '@/utils/request'
import { $t } from '@/locales'

/** 与 ChatArea 中逻辑一致：旧版 result 为数组，新版为 result.chunks[].segments */
const isTranscriptionDataEmpty = (data: { result?: unknown } | null | undefined): boolean => {
  const result = data?.result
  if (!result) {
    return true
  }
  if (Array.isArray(result)) {
    return result.length === 0
  }
  if (typeof result === 'object' && result !== null && 'chunks' in result) {
    const chunks = (result as { chunks?: Array<{ segments?: unknown[] }> }).chunks
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return true
    }
    return !chunks.some((c) => Array.isArray(c?.segments) && c.segments.length > 0)
  }
  return true
}

interface AudioAreaProps {
  fileList: NonNullable<UploadProps['fileList']>
  setFileList: React.Dispatch<React.SetStateAction<NonNullable<UploadProps['fileList']>>>
  agents: { isRequesting: () => boolean }[]
  isFullscreen?: boolean
  onSubmit: (text: string, fileName?: string) => void
  handleCancel: () => void
  onFinish: () => void
  models: ModelItem[]
  chats: { onRequest: (message: any) => void, messages: any[] }[]
}

export const AudioArea: React.FC<AudioAreaProps> = ({
  fileList,
  setFileList,
  agents,
  isFullscreen = false,
  onSubmit,
  handleCancel,
  onFinish,
  models,
  chats,
}) => {
  const recorderRef = useRef<Recorder | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const [isTranscribing, setIsTranscribing] = useState(false) // 是否正在识别中
  const MAX_RECORDING_TIME = 60 // 最大录音时长60秒（1分钟）

  // 支持的音频格式
  const supportedAudioFormats = [
    '.mp3', '.mp4', '.wav', '.webm', '.aac', '.flac', '.m4a', '.mkv',
    '.mov', '.ogg', '.opus', '.amr', '.flv', '.mpeg', '.wma', '.wmv',
  ]

  const supportedAudioMimeTypes = [
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/wav', 'audio/webm',
    'audio/aac', 'audio/flac', 'audio/x-m4a', 'audio/ogg', 'audio/opus',
    'audio/amr', 'audio/x-ms-wma', 'video/mp4', 'video/webm', 'video/quicktime',
    'video/x-matroska', 'video/avi', 'video/x-msvideo', 'video/mpeg', 'video/x-ms-wmv',
  ]

  // 初始化录音器
  useEffect(() => {
    if (!recorderRef.current) {
      recorderRef.current = new Recorder({
        sampleBits: 16,
        sampleRate: 16000,
        numChannels: 1,
      })
    }

    return () => {
      if (recorderRef.current) {
        recorderRef.current.destroy()
        recorderRef.current = null
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
      }
    }
  }, [])

  // 检查并请求麦克风权限
  const checkMicrophonePermission = async (): Promise<boolean> => {
    try {
      // 检查是否支持权限API
      if (navigator.permissions) {
        const permissionStatus = await navigator.permissions.query({
          name: 'microphone',
        })

        if (permissionStatus.state === 'granted') {
          return true
        }

        if (permissionStatus.state === 'denied') {
          message.error('麦克风权限已被拒绝，请在浏览器设置中允许麦克风访问')
          return false
        }

        // 如果是 'prompt' 状态，尝试请求权限
        if (permissionStatus.state === 'prompt') {
          // 通过尝试获取媒体流来触发权限请求
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            stream.getTracks().forEach((track) => track.stop()) // 立即停止流
            return true
          }
          catch (err: any) {
            const errName = err?.name || ''
            if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
              message.error('需要麦克风权限才能录音，请允许访问麦克风')
              return false
            }
            throw err
          }
        }
      }

      // 如果不支持权限API，直接尝试获取媒体流
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop()) // 立即停止流
        return true
      }
      catch (err: any) {
        const errName = err?.name || ''
        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          message.error('需要麦克风权限才能录音，请允许访问麦克风')
          return false
        }
        if (errName === 'NotFoundError') {
          message.error('未检测到麦克风设备，请检查设备连接')
          return false
        }
        throw err
      }
    }
    catch (error: any) {
      console.error('权限检查失败:', error)
      message.error('无法访问麦克风，请检查浏览器设置')
      return false
    }
  }

  // 开始录音
  const handleStartRecording = async () => {
    if (!recorderRef.current) return

    // 先检查并请求权限
    const hasPermission = await checkMicrophonePermission()
    if (!hasPermission) {
      return
    }

    try {
      await recorderRef.current.start()
      setIsRecording(true)
      setRecordingTime(0)

      // 开始计时
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          const nextTime = prev + 1
          // 达到最大录音时长时自动停止
          if (nextTime >= MAX_RECORDING_TIME) {
            // 清除计时器
            if (recordingTimerRef.current) {
              clearInterval(recordingTimerRef.current)
              recordingTimerRef.current = null
            }
            // 自动停止录音并保存，直接回到初始状态（不需要确认框）
            if (recorderRef.current) {
              // 停止录音器
              recorderRef.current.stop()

              // 获取录音文件
              const audioBlob = recorderRef.current.getWAVBlob()
              const audioFile = new File([audioBlob], `recording-${Date.now()}.wav`, { type: 'audio/wav' })

              // 创建上传文件对象
              const uid = `-audio-${Date.now()}-${Math.random()}`
              const uploadFile: any = {
                uid,
                name: audioFile.name,
                status: 'done',
                originFileObj: audioFile,
                percent: 100,
              }

              // 添加到文件列表
              setFileList((prev: NonNullable<UploadProps['fileList']>) => [...prev, uploadFile])

              // Console 打印录音文件
              console.log('录音文件:', audioFile)
              console.log('录音时长:', MAX_RECORDING_TIME, '秒')
              console.log('文件大小:', (audioFile.size / 1024).toFixed(2), 'KB')

              // 重置状态，回到初始状态
              setIsRecording(false)
              setRecordingTime(0)

              message.info('录音已达到最大时长，已自动停止')

              // 调用转录接口
              callTranscriptionAPI(audioFile)
            }
            return MAX_RECORDING_TIME
          }
          return nextTime
        })
      }, 1000)
    }
    catch (error: any) {
      console.error('录音失败:', error)

      // 安全地检查错误类型
      let errorName = ''
      let errorMessage = ''

      if (error) {
        if (typeof error === 'string') {
          errorMessage = error
        }
        else if (typeof error === 'object') {
          errorName = error.name || ''
          errorMessage = error.message || error.toString() || ''
        }
        else {
          errorMessage = String(error)
        }
      }

      // 检查错误消息中是否包含权限相关的关键词
      const isPermissionError = errorName === 'NotAllowedError'
        || errorName === 'PermissionDeniedError'
        || errorMessage.toLowerCase().includes('permission')
        || errorMessage.toLowerCase().includes('权限')

      const isNotFoundError = errorName === 'NotFoundError'
        || errorMessage.toLowerCase().includes('not found')
        || errorMessage.toLowerCase().includes('未找到')

      const isNotReadableError = errorName === 'NotReadableError'
        || errorMessage.toLowerCase().includes('not readable')
        || errorMessage.toLowerCase().includes('无法访问')

      if (isPermissionError) {
        message.error('麦克风权限被拒绝，无法开始录音')
      }
      else if (isNotFoundError) {
        message.error('未检测到麦克风设备')
      }
      else if (isNotReadableError) {
        message.error('无法访问麦克风，可能被其他应用占用')
      }
      else {
        const displayMessage = errorMessage || '请检查麦克风权限和设备'
        message.error(`录音失败: ${displayMessage}`)
      }
    }
  }

  // 调用转录接口 - 支持多个模型
  const callTranscriptionAPI = async (audioFile: File) => {
    // 保存文件名（在函数开始处定义，确保在所有代码路径中都可访问）
    const fileName = audioFile.name

    try {
      // 检查是否有模型
      if (!models || models.length === 0) {
        message.error('未找到模型信息')
        return
      }

      // 设置识别中状态
      setIsTranscribing(true)

      // 先提交用户消息（文件名）- 这会为所有模型添加用户消息
      onSubmit(fileName, fileName)

      // 为每个模型并行调用转录接口，每个完成后立即显示结果
      const transcriptionPromises = models.map(async (model, index) => {
        try {
          // 创建 FormData
          const formData = new FormData()
          formData.append('file', audioFile)
          formData.append('model', model.model_name)

          // 调用转录接口
          const response = await request({
            url: '/experience/audio/transcriptions',
            baseURL: '/dgi-backend/v1',
            method: 'POST',
            data: formData,
            headers: {
              'Content-Type': 'multipart/form-data',
            },
            timeout: 30000 * 20,
          })

          // 获取对应的 chat
          const chat = chats[index]
          if (!chat || !chat.onRequest) {
            console.error(`模型索引 ${index} 对应的 chat 不存在`)
            return
          }

          // 处理响应结果 - 立即显示
          if (response.code === 0 && response.data) {
            const transcriptionData = response.data
            const isEmpty = isTranscriptionDataEmpty(transcriptionData)
            // 立即为对应模型添加AI回复
            const messageContent = {
              __audioTranscription: true,
              __isUserMessage: false,
              transcriptionData: isEmpty ? null : transcriptionData,
            }
            chat.onRequest(messageContent)

            if (isEmpty) {
              message.warning('未识别到语音内容')
            }
          }
          else {
            // 接口返回错误，立即为对应模型添加错误消息
            const errorMsg = response.msg || '语音识别失败'
            const messageContent = {
              __audioTranscription: true,
              __isUserMessage: false,
              transcriptionData: null,
              errorMessage: `语音识别失败：${errorMsg}`,
            }
            chat.onRequest(messageContent)
            message.error(errorMsg)
          }
        }
        catch (error: any) {
          console.error(`模型 ${model.model_name} 转录接口调用失败:`, error)

          // 获取对应的 chat
          const chat = chats[index]
          if (!chat || !chat.onRequest) {
            console.error(`模型索引 ${index} 对应的 chat 不存在`)
            return
          }

          // 提取错误信息
          let errorMessage = '语音识别失败，请重试'
          if (error?.response?.data) {
            errorMessage = error.response.data.error?.message || error.response.data.msg || error.response.data.message || errorMessage
          }
          else if (error?.message) {
            errorMessage = error.message
          }

          // 立即为对应模型添加错误消息
          const messageContent = {
            __audioTranscription: true,
            __isUserMessage: false,
            transcriptionData: null,
            errorMessage: `语音识别失败：${errorMessage}`,
          }
          chat.onRequest(messageContent)
          message.error(errorMessage)
        }
      })

      // 等待所有请求完成（用于控制识别状态）
      await Promise.allSettled(transcriptionPromises)
    }
    catch (error: any) {
      console.error('转录接口调用失败:', error)
      // 提取错误信息
      let errorMessage = '语音识别失败，请重试'
      if (error?.response?.data) {
        errorMessage = error.response.data.error?.message || error.response.data.msg || error.response.data.message || errorMessage
      }
      else if (error?.message) {
        errorMessage = error.message
      }
      // 为所有模型添加错误消息
      chats.forEach((chat) => {
        if (chat && chat.onRequest) {
          const messageContent = {
            __audioTranscription: true,
            __isUserMessage: false,
            transcriptionData: null,
            errorMessage: `语音识别失败：${errorMessage}`,
          }
          chat.onRequest(messageContent)
        }
      })
      message.error(errorMessage)
    }
    finally {
      // 无论成功失败，都要重置识别状态
      onFinish()
      setIsTranscribing(false)
    }
  }

  // 实际执行停止录音的函数
  const doStopRecording = async () => {
    if (!recorderRef.current || !isRecording) return

    recorderRef.current.stop()
    setIsRecording(false)

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }

    // 获取录音文件
    const audioBlob = recorderRef.current.getWAVBlob()
    const audioFile = new File([audioBlob], `recording-${Date.now()}.wav`, { type: 'audio/wav' })

    // 创建上传文件对象
    const uid = `-audio-${Date.now()}-${Math.random()}`
    const uploadFile: any = {
      uid,
      name: audioFile.name,
      status: 'done',
      originFileObj: audioFile,
      percent: 100,
    }

    // 添加到文件列表
    setFileList((prev: NonNullable<UploadProps['fileList']>) => [...prev, uploadFile])

    // Console 打印录音文件
    console.log('录音文件:', audioFile)
    console.log('录音时长:', recordingTime, '秒')
    console.log('文件大小:', (audioFile.size / 1024).toFixed(2), 'KB')

    setRecordingTime(0)

    // 调用转录接口
    await callTranscriptionAPI(audioFile)
  }

  // 停止录音（带二次确认）
  const handleStopRecording = () => {
    if (!recorderRef.current || !isRecording) return

    Modal.confirm({
      title: '结束录音',
      content: '结束后本次录音无法再继续，再次启动录音将清除现有录音重新开始，确定结束吗？',
      okText: '结束录音',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        // 不返回 Promise，让弹窗立即关闭
        // 延迟执行停止录音操作，确保弹窗关闭动画完成后再执行
        setTimeout(() => {
          doStopRecording()
        }, 200)
      },
      onCancel: () => {
        // 点击取消，录音继续，不做任何操作
      },
    })
  }

  // 验证文件格式
  const isValidAudioFormat = (fileName: string, fileType: string): boolean => {
    // 检查文件扩展名
    const fileExtension = fileName.substring(fileName.lastIndexOf('.')).toLowerCase()
    if (supportedAudioFormats.includes(fileExtension)) {
      return true
    }

    // 检查 MIME 类型
    if (supportedAudioMimeTypes.some((mimeType) => fileType.includes(mimeType))) {
      return true
    }

    return false
  }

  // 处理音频文件上传
  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 验证文件格式
    if (!isValidAudioFormat(file.name, file.type)) {
      const formatsText = supportedAudioFormats.join('、')
      message.error(`仅支持以下格式：${formatsText}`)
      // 重置 input
      if (audioInputRef.current) {
        audioInputRef.current.value = ''
      }
      return
    }

    // 验证文件大小（30MB）
    const maxSize = 30 * 1024 * 1024
    if (file.size > maxSize) {
      message.error('音频文件大小不能超过30MB')
      // 重置 input
      if (audioInputRef.current) {
        audioInputRef.current.value = ''
      }
      return
    }

    // 最多支持1个文件，如果已有文件则替换
    const uid = `-audio-${Date.now()}-${Math.random()}`
    const uploadFile: any = {
      uid,
      name: file.name,
      status: 'done',
      originFileObj: file,
      percent: 100,
    }

    // 替换文件列表（最多1个）
    setFileList([uploadFile])

    // 重置 input
    if (audioInputRef.current) {
      audioInputRef.current.value = ''
    }

    // 上传文件后自动调用转录接口
    await callTranscriptionAPI(file)
  }

  // 格式化录音时长
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // 格式化录音时长显示（当前时间/总时长）
  const formatRecordingTime = (seconds: number) => {
    return `${formatTime(seconds)}/ ${formatTime(MAX_RECORDING_TIME)}`
  }

  return (
    <div
      className={`${isFullscreen ? 'p-4 border-t bg-white flex-shrink-0' : 'px-6 pt-4 pb-6'}`}
      tabIndex={-1}
    >
      <div className="max-w-5xl mx-auto">
        <Flex vertical gap="middle" align="center">
          {/* 录音状态显示 */}
          {isRecording ? (
            <div className="w-full flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              {/* 紫色麦克风图标 */}
              <div className="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center animate-pulse">
                <Mic className="w-6 h-6 text-white" />
              </div>
              {/* 中间信息区域 */}
              <div className="flex-1 flex flex-col gap-1">
                {/* 时间和识别中同一行 */}
                <div className="flex items-center gap-2">
                  <div className="text-lg font-medium text-gray-900">
                    {formatRecordingTime(recordingTime)}
                  </div>
                  <div className="text-sm text-gray-600">识别中...</div>
                </div>
                <div className="text-xs text-gray-500">
                  1分钟后自动停止识别,也可点击结束录音
                </div>
              </div>
              {/* 右侧结束录音图标 */}
              <Tooltip title={$t('结束录音' as any)}>
                <div
                  className="w-10 h-10 flex items-center justify-center rounded-lg cursor-pointer hover:bg-gray-200 transition-colors group"
                  onClick={handleStopRecording}
                >
                  <StopCircle className="w-6 h-6 text-gray-600 group-hover:text-red-500 transition-colors" />
                </div>
              </Tooltip>
            </div>
          ) : isTranscribing ? (
            /* 语音识别中状态 */
            <div className="w-full flex items-center justify-center gap-2 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-base text-gray-600">语音识别中...</div>
            </div>
          ) : (
            /* 音频操作按钮 */
            <Flex gap="middle" justify="center" className="w-full">
              <input
                ref={audioInputRef}
                type="file"
                accept={supportedAudioFormats.join(',')}
                onChange={handleAudioUpload}
                style={{ display: 'none' }}
              />
              <Tooltip
                title={(
                  <div>
                    <div>支持格式：</div>
                    <div>
                      {supportedAudioFormats.join('、')}
                      ；最多支持1个文件，单个文件大小不超过30MB
                    </div>
                  </div>
                )}
              >
                <Button
                  type="default"
                  size="large"
                  icon={<UploadIcon className="w-4 h-4" />}
                  onClick={() => audioInputRef.current?.click()}
                  disabled={isTranscribing}
                >
                  {$t('上传音频' as any)}
                </Button>
              </Tooltip>
              <Button
                type="primary"
                size="large"
                icon={<Mic className="w-4 h-4" />}
                onClick={handleStartRecording}
                disabled={isTranscribing}
              >
                {$t('开始录音' as any)}
              </Button>
            </Flex>
          )}
        </Flex>
        <div className="text-center text-xs text-gray-500 mt-2">
          {$t('本回答由AI生成，内容仅供参考，请仔细甄别')}
        </div>
      </div>
    </div>
  )
}
