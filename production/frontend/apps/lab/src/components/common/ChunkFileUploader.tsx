import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Button, Progress, message } from 'antd'
import { CloseCircleOutlined, InboxOutlined } from '@ant-design/icons'
import type { RcFile, UploadProps } from 'antd/es/upload'
import Dragger from 'antd/es/upload/Dragger'
// import BigFileUploader from 'bigfile-chunk-uploader'
import { useLocation } from 'react-router-dom'
import type { AxiosRequestConfig } from 'axios'
import apiClient from '@/services/apiClient'
import BigFileUploader from '@/utils/bigFileUploadUtil'
import { getBackendConfig, getBackendURLFromParams, sstBackendConfig } from '@/utils/getBackendURL.ts'

export interface FileUploadInfo {
  file: File
  progress: number
  isUploading: boolean
  fileUrl?: string
  uploadId?: string
  uploader?: BigFileUploader
  error?: Error
}

export interface ChunkFileUploaderProps {
  /** 接受的文件类型，如 '.jsonl,.json,.xlsx' 或 '.zip' */
  accept?: string
  /** 文件大小限制（MB），不传则不限制 */
  maxSize?: number
  /** 分片大小（字节），默认 5MB */
  chunkSize?: number
  /** 并发上传数，默认 3 */
  concurrent?: number
  /** 最大重试次数，默认 3 */
  maxRetries?: number
  /** 上传成功回调，返回文件 URL 和 uploadId（每个文件上传成功时调用） */
  onSuccess?: (data: { fileUrl: string, uploadId?: string, file?: File }) => void
  /** 上传失败回调 */
  onError?: (error: Error, file?: File) => void
  /** 文件变化回调（传入当前所有文件数组，为保持向后兼容，也支持单个文件） */
  onFileChange?: (file: File | null) => void
  /** 多个文件变化回调（传入当前所有文件数组） */
  onFilesChange?: (files: File[]) => void
  /** 所有上传成功的 uploadId 变化回调（传入逗号拼接的 uploadId 字符串，如 "uploadId1,uploadId2"） */
  onUploadIdsChange?: (uploadIds: string) => void
  /** 自定义提示文本 */
  hintText?: string | React.ReactNode
  /** 是否显示进度条，默认 true */
  showProgress?: boolean
  /** 是否禁用，默认 false */
  disabled?: boolean
  /** 自定义 baseURL，如果不提供则自动获取 */
  baseURL?: string
  /** API 端点配置 */
  endpoints?: {
    init?: string
    chunk?: string
    merge?: string
    progress?: string
  }
  projectId?: string
  usage?: string
  /** 自定义文件验证函数 */
  beforeUpload?: (file: RcFile) => boolean | Promise<boolean>
  /** 最大文件数量，默认不限制 */
  maxCount?: number
}

export interface ChunkFileUploaderRef {
  /** 取消所有上传 */
  abort: () => void
  /** 取消指定文件的上传 */
  abortFile: (file: File) => void
}

/**
 * 分片文件上传组件
 * 支持大文件分片上传、断点续传、秒传等功能
 */
const ChunkFileUploader = forwardRef<ChunkFileUploaderRef, ChunkFileUploaderProps>(({
  accept = '.jsonl,.json,.xlsx',
  maxSize,
  chunkSize = 5 * 1024 * 1024, // 5MB
  concurrent = 3,
  maxRetries = 3,
  onSuccess,
  onError,
  onFileChange,
  onFilesChange,
  onUploadIdsChange,
  hintText,
  showProgress = true,
  disabled = false,
  baseURL,
  projectId = 3,
  usage = 'public',
  endpoints = {
    init: '/upload/init',
    chunk: '/upload/chunk',
    merge: `/upload/merge?project_id=${projectId}&usage=${usage}`,
    progress: '/upload/progress',
  },
  beforeUpload: customBeforeUpload,
  maxCount,
}, ref) => {
  const [fileUploadInfos, setFileUploadInfos] = useState<Map<string, FileUploadInfo>>(new Map())
  const isAbortedRef = useRef<Map<string, boolean>>(new Map())
  const location = useLocation()

  // 生成文件的唯一标识
  const getFileKey = (file: File): string => {
    return `${file.name}-${file.size}-${file.lastModified}`
  }

  const isCancelError = (error: any) => {
    const message = error?.message || ''
    return message === '上传已取消'
      || message === 'Upload has been aborted'
      || message === 'Upload was paused or aborted'
      || message.includes('abort')
      || message.includes('canceled')
  }

  // 中断所有上传的内部方法
  const abortAllUploads = () => {
    setFileUploadInfos((prev) => {
      const newMap = new Map(prev)
      newMap.forEach((info, key) => {
        if (info.uploader) {
          try {
            isAbortedRef.current.set(key, true)
            info.uploader.abort()
          }
          catch (e) {
            // 忽略取消错误
          }
        }
      })
      return new Map()
    })
    onFileChange?.(null)
    onFilesChange?.([])
    updateUploadIds(new Map())
  }

  // 中断指定文件的上传
  const abortFileUpload = (file: File) => {
    const fileKey = getFileKey(file)
    setFileUploadInfos((prev) => {
      const newMap = new Map(prev)
      const info = newMap.get(fileKey)
      if (info?.uploader) {
        try {
          isAbortedRef.current.set(fileKey, true)
          info.uploader.abort()
        }
        catch (e) {
          // 忽略取消错误
        }
      }
      newMap.delete(fileKey)

      // 更新回调
      const remainingFiles = Array.from(newMap.values()).map((info) => info.file)
      if (remainingFiles.length === 0) {
        onFileChange?.(null)
      }
      onFilesChange?.(remainingFiles)

      // 更新 uploadIds
      updateUploadIds(newMap)

      return newMap
    })
  }

  // 暴露取消上传方法给父组件
  useImperativeHandle(ref, () => ({
    abort: abortAllUploads,
    abortFile: abortFileUpload,
  }))

  // 路由变化时中断上传（切换系统页面时）
  useEffect(() => {
    // 只有在有正在进行的上传时才中断
    const hasUploading = Array.from(fileUploadInfos.values()).some((info) => info.isUploading)
    if (hasUploading) {
      abortAllUploads()
    }
  }, [location.pathname])

  // 页面卸载时中断上传
  useEffect(() => {
    // 页面卸载前中断上传
    const handleBeforeUnload = () => {
      abortAllUploads()
    }

    // 监听页面卸载
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      // 清理事件监听器
      window.removeEventListener('beforeunload', handleBeforeUnload)
      // 组件卸载时中断上传
      abortAllUploads()
    }
  }, [])

  // 收集所有已上传成功的 uploadId 的辅助函数
  const updateUploadIds = (fileInfos: Map<string, FileUploadInfo>) => {
    if (onUploadIdsChange) {
      const uploadIds = Array.from(fileInfos.values())
        .filter((info) => info.uploadId && !info.isUploading && !info.error)
        .map((info) => info.uploadId!)
        .join(',')
      onUploadIdsChange(uploadIds)
    }
  }

  // 获取 API baseURL
  const getBaseURL = () => {
    if (baseURL) {
      return baseURL
    }
    const backendURLFromParams = getBackendURLFromParams()
    if (backendURLFromParams) {
      sstBackendConfig(backendURLFromParams)
      return backendURLFromParams
    }
    const backendConfig = getBackendConfig()
    if (backendConfig?.baseURL) {
      return backendConfig.baseURL
    }
    return import.meta.env.DEV
      ? `${import.meta.env.VITE_PREFIX_BASE_URL}/api/v1`
      : '/lab-backend/api/v1'
  }

  // 分片上传处理函数
  const handleChunkUpload = async (file: File): Promise<string> => {
    const fileKey = getFileKey(file)
    const isAborted = isAbortedRef.current.get(fileKey) || false
    isAbortedRef.current.set(fileKey, false)

    let uploadFileUrl = ''

    // 初始化文件上传信息
    setFileUploadInfos((prev) => {
      const newMap = new Map(prev)
      newMap.set(fileKey, {
        file,
        progress: 0,
        isUploading: true,
      })
      return newMap
    })

    try {
      const apiBaseURL = getBaseURL()

      // 使用 bigfile-chunk-uploader 库进行分片上传
      const uploader = new BigFileUploader({
        file,
        baseURL: apiBaseURL,
        endpoints: {
          init: endpoints.init,
          chunk: endpoints.chunk,
          merge: endpoints.merge,
          progress: endpoints.progress,
        },
        chunkSize,
        concurrent,
        maxRetries,
        adapter: ({ adapter, ...config }: AxiosRequestConfig) => {
          return apiClient.request(config)
        },
        withCredentials: true,
        onProgress: (progress: number) => {
          if (isAbortedRef.current.get(fileKey)) {
            return
          }
          setFileUploadInfos((prev) => {
            const newMap = new Map(prev)
            const info = newMap.get(fileKey)
            if (info) {
              newMap.set(fileKey, {
                ...info,
                progress: Math.round(progress),
              })
            }
            return newMap
          })
        },
        onSuccess: (response: any) => {
          if (isAbortedRef.current.get(fileKey)) {
            return
          }
          const fileUrl = response?.result?.fileUrl || response?.fileUrl || response
          const uploadId = response?.result?.uploadId || response?.uploadId
          uploadFileUrl = fileUrl

          setFileUploadInfos((prev) => {
            const newMap = new Map(prev)
            const info = newMap.get(fileKey)
            if (info) {
              newMap.set(fileKey, {
                ...info,
                isUploading: false,
                progress: 100,
                fileUrl,
                uploadId,
              })
            }
            // 收集所有已上传成功的 uploadId
            updateUploadIds(newMap)
            return newMap
          })

          message.success(`${file.name} 上传成功！`)
          onSuccess?.({ fileUrl, uploadId, file })
          isAbortedRef.current.delete(fileKey)
          return fileUrl
        },
        onError: (error: any) => {
          const isAbortedForFile = isAbortedRef.current.get(fileKey) || false

          setFileUploadInfos((prev) => {
            const newMap = new Map(prev)
            const info = newMap.get(fileKey)
            if (info) {
              newMap.set(fileKey, {
                ...info,
                isUploading: false,
                error,
              })
            }
            return newMap
          })

          // 如果是手动取消，不显示错误消息
          if (!isAbortedForFile && !isCancelError(error)) {
            console.error('分片上传失败:', error, error.data, error.msg)
            onError?.(error, file)
          }
          if (isAbortedForFile) {
            isAbortedRef.current.delete(fileKey)
          }
          throw error
        },
        onChunkSuccess: (chunkIndex: number, response: any) => {
          console.log(`文件 ${file.name} 分片 ${chunkIndex} 上传成功`)
        },
      })

      // 保存 uploader 引用
      setFileUploadInfos((prev) => {
        const newMap = new Map(prev)
        const info = newMap.get(fileKey)
        if (info) {
          newMap.set(fileKey, {
            ...info,
            uploader,
          })
        }
        return newMap
      })

      // 开始上传
      await uploader.start()

      // 提取文件 URL（onSuccess 回调已经处理了 uploadId 的传递）
      return uploadFileUrl
    }
    catch (error: any) {
      const isAbortedForFile = isAbortedRef.current.get(fileKey) || false

      setFileUploadInfos((prev) => {
        const newMap = new Map(prev)
        const info = newMap.get(fileKey)
        if (info) {
          newMap.set(fileKey, {
            ...info,
            isUploading: false,
            error,
          })
        }
        return newMap
      })

      // 如果是手动取消，不显示错误消息
      if (!isAbortedForFile && !isCancelError(error)) {
        console.error('分片上传失败:', error)
        onError?.(error, file)
      }
      if (isAbortedForFile) {
        isAbortedRef.current.delete(fileKey)
      }
      throw error
    }
  }

  // 文件上传属性
  const uploadProps: UploadProps = {
    name: 'file',
    multiple: maxCount === undefined || maxCount > 1,
    showUploadList: true,
    accept,
    disabled: disabled || Array.from(fileUploadInfos.values()).some((info) => info.isUploading),
    beforeUpload: async (file: RcFile) => {
      const fileKey = getFileKey(file)

      if (navigator.onLine === false) {
        message.error('网络中断，请检查网络连接')
        return false
      }

      // 检查文件数量限制
      if (maxCount !== undefined && fileUploadInfos.size >= maxCount) {
        message.error(`最多只能上传 ${maxCount} 个文件！`)
        return false
      }

      // 检查是否已存在相同文件
      if (fileUploadInfos.has(fileKey)) {
        message.warning(`文件 ${file.name} 已存在！`)
        return false
      }

      // 自定义验证
      if (customBeforeUpload) {
        const result = await customBeforeUpload(file)
        if (result === false) {
          return false
        }
      }

      // 文件大小验证：未传 maxSize 时不限制
      const isOverMaxSize = maxSize !== undefined && file.size / 1024 / 1024 > maxSize
      if (isOverMaxSize) {
        message.error(`文件 ${file.name} 大小不能超过 ${maxSize}MB!`)
        return false
      }

      // 更新文件列表回调
      const newFiles = Array.from(fileUploadInfos.values()).map((info) => info.file).concat([file])
      onFileChange?.(file)
      onFilesChange?.(newFiles)

      // 自动开始上传
      handleChunkUpload(file).catch((error: any) => {
        // 错误已在 handleChunkUpload 中处理
        setFileUploadInfos((prev) => {
          const newMap = new Map(prev)
          newMap.delete(fileKey)
          const remainingFiles = Array.from(newMap.values()).map((info) => info.file)
          onFilesChange?.(remainingFiles)
          if (remainingFiles.length === 0) {
            onFileChange?.(null)
          }
          // 更新 uploadIds
          updateUploadIds(newMap)
          return newMap
        })
      })

      return false // 阻止自动上传
    },
    onRemove: (file: RcFile) => {
      // 从 fileList 中找到对应的 File 对象
      const fileObj = file as unknown as File
      if (fileObj && fileObj instanceof File) {
        abortFileUpload(fileObj)
      }
      else {
        // 如果 RcFile 不是 File 类型，通过属性匹配
        setFileUploadInfos((prev) => {
          for (const [key, info] of prev.entries()) {
            const fileKey = getFileKey(info.file)
            const removeFileKey = `${file.name}-${file.size}-${(file as any).lastModified || file.uid}`
            if (fileKey === removeFileKey
              || (info.file.name === file.name
                && info.file.size === file.size)) {
              abortFileUpload(info.file)
              break
            }
          }
          return prev
        })
      }
    },
    fileList: Array.from(fileUploadInfos.values()).map((info) => info.file as RcFile),
    maxCount,
  }

  // 获取所有正在上传的文件
  const uploadingFiles = Array.from(fileUploadInfos.values()).filter((info) => info.isUploading)
  // 获取所有已上传成功的文件
  const uploadedFiles = Array.from(fileUploadInfos.values()).filter(
    (info) => !info.isUploading && info.fileUrl && !info.error,
  )

  return (
    <div>
      <Dragger {...uploadProps} className="w-full p-10">
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
        {hintText && (
          <p className="ant-upload-hint">{hintText}</p>
        )}
      </Dragger>
      {showProgress && uploadingFiles.length > 0 && (
        <div className="mt-4 space-y-3">
          {uploadingFiles.map((info) => {
            const fileKey = getFileKey(info.file)
            return (
              <div key={fileKey}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700 truncate flex-1 mr-2">
                    {info.file.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">
                      {info.progress}
                      %
                    </span>
                    <Button
                      type="link"
                      danger
                      size="small"
                      icon={<CloseCircleOutlined />}
                      onClick={() => abortFileUpload(info.file)}
                    >
                      取消上传
                    </Button>
                  </div>
                </div>
                <Progress percent={info.progress} status="active" showInfo={false} />
              </div>
            )
          })}
        </div>
      )}
      {uploadedFiles.length > 0 && uploadingFiles.length === 0 && (
        <div className="mt-4">
          <p className="text-sm text-green-600">
            ✓
            {' '}
            {uploadedFiles.length}
            {' '}
            个文件上传成功
          </p>
        </div>
      )}
    </div>
  )
})

ChunkFileUploader.displayName = 'ChunkFileUploader'

export default ChunkFileUploader
