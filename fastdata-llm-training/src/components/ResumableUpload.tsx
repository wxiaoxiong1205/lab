import React, { useEffect, useRef, useState } from 'react'
import { Button, List, Progress, Space, Tag, Typography, Upload } from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  FileOutlined,
  InboxOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import type { UploadFile } from 'antd/es/upload/interface'

const { Text } = Typography

type UploadRunStatus = 'idle' | 'uploading' | 'done' | 'error' | 'cancelled'

export interface ResumableUploadProps {
  value?: UploadFile | string | null
  onChange?: (file: UploadFile | null) => void
  onFileChange?: (file: UploadFile | null) => void
  onUploadingChange?: (uploading: boolean) => void
  onProgressChange?: (progress: number) => void
  accept?: string
  disabled?: boolean
  title?: string
  hint?: string
  maxCount?: number
  compact?: boolean
}

function toUploadFile(file: File & { uid?: string }, percent: number, status: UploadFile['status']): UploadFile {
  return {
    uid: file.uid ?? `${Date.now()}-${file.name}`,
    name: file.name,
    size: file.size,
    type: file.type,
    percent,
    status,
    originFileObj: file as UploadFile['originFileObj'],
  }
}

function coerceUploadFile(value?: UploadFile | string | null): UploadFile | null {
  if (!value) {
    return null
  }
  if (typeof value === 'string') {
    return {
      uid: value,
      name: value,
      percent: 100,
      status: 'done',
    }
  }
  return value
}

function statusMeta(status: UploadRunStatus) {
  if (status === 'done') {
    return { color: 'success', text: '上传完成', icon: <CheckCircleOutlined style={{ color: '#52c41a' }} /> }
  }
  if (status === 'error') {
    return { color: 'error', text: '上传失败，可断点续传', icon: <CloseCircleOutlined style={{ color: '#ef4444' }} /> }
  }
  if (status === 'cancelled') {
    return { color: 'warning', text: '已取消，进度已保留', icon: <PauseCircleOutlined style={{ color: '#f59e0b' }} /> }
  }
  if (status === 'uploading') {
    return { color: 'processing', text: '上传中', icon: <FileOutlined style={{ color: '#1677ff' }} /> }
  }
  return { color: 'default', text: '待上传', icon: <FileOutlined /> }
}

const ResumableUpload: React.FC<ResumableUploadProps> = ({
  value,
  onChange,
  onFileChange,
  onUploadingChange,
  onProgressChange,
  accept,
  disabled,
  title = '点击或拖拽文件到此区域上传',
  hint,
  compact = false,
}) => {
  const timerRef = useRef<number | null>(null)
  const initialFile = coerceUploadFile(value)
  const [file, setFile] = useState<UploadFile | null>(initialFile)
  const [status, setStatus] = useState<UploadRunStatus>(value ? 'done' : 'idle')
  const [progress, setProgress] = useState(initialFile?.percent ?? (value ? 100 : 0))

  useEffect(() => {
    const nextFile = coerceUploadFile(value)

    if (!nextFile) {
      setFile(null)
      setStatus('idle')
      setProgress(0)
      return
    }

    setFile(nextFile)
    setStatus(nextFile.status === 'done' ? 'done' : 'idle')
    setProgress(nextFile.percent ?? (nextFile.status === 'done' ? 100 : 0))
  }, [typeof value === 'string' ? value : value?.uid])

  useEffect(
    () => () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
      }
    },
    [],
  )

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const emitFile = (nextFile: UploadFile | null) => {
    onChange?.(nextFile)
    onFileChange?.(nextFile)
  }

  const updateProgress = (nextProgress: number) => {
    setProgress(nextProgress)
    onProgressChange?.(nextProgress)
  }

  const runUpload = (sourceFile: UploadFile, startProgress: number) => {
    clearTimer()
    setStatus('uploading')
    onUploadingChange?.(true)

    timerRef.current = window.setInterval(() => {
      setProgress(current => {
        const nextProgress = Math.min(100, current + 8)
        onProgressChange?.(nextProgress)

        if (nextProgress >= 100) {
          clearTimer()
          const doneFile = { ...sourceFile, percent: 100, status: 'done' as const }
          setFile(doneFile)
          setStatus('done')
          onUploadingChange?.(false)
          emitFile(doneFile)
        }

        return nextProgress
      })
    }, startProgress >= 80 ? 180 : 220)
  }

  const startUpload = (rawFile: File & { uid?: string }) => {
    const nextFile = toUploadFile(rawFile, 0, 'uploading')
    setFile(nextFile)
    updateProgress(0)
    emitFile(null)
    runUpload(nextFile, 0)
  }

  const retryUpload = () => {
    if (!file) return
    const retryFile = { ...file, status: 'uploading' as const, percent: progress }
    setFile(retryFile)
    runUpload(retryFile, progress)
  }

  const cancelUpload = () => {
    clearTimer()
    setStatus('cancelled')
    onUploadingChange?.(false)
    setFile(current => (current ? { ...current, status: 'error', percent: progress } : current))
  }

  const removeFile = () => {
    clearTimer()
    setFile(null)
    setStatus('idle')
    updateProgress(0)
    onUploadingChange?.(false)
    emitFile(null)
  }

  const meta = statusMeta(status)
  const showProgress = Boolean(file) && status !== 'idle'

  return (
    <div>
      <Upload.Dragger
        accept={accept}
        disabled={disabled || status === 'uploading'}
        showUploadList={false}
        beforeUpload={rawFile => {
          startUpload(rawFile as File & { uid?: string })
          return Upload.LIST_IGNORE
        }}
        style={compact ? { padding: 0 } : undefined}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">{title}</p>
        {hint && <p className="ant-upload-hint">{hint}</p>}
      </Upload.Dragger>

      {file && (
        <List
          size="small"
          bordered
          dataSource={[file]}
          style={{ background: '#f8fafc', marginTop: 12 }}
          renderItem={item => (
            <List.Item
              actions={[
                status === 'uploading' ? (
                  <Button key="cancel" type="link" size="small" onClick={cancelUpload}>
                    取消上传
                  </Button>
                ) : null,
                status === 'error' || status === 'cancelled' ? (
                  <Button key="retry" type="link" size="small" icon={<ReloadOutlined />} onClick={retryUpload}>
                    继续上传
                  </Button>
                ) : null,
                <Button key="remove" type="link" danger size="small" icon={<DeleteOutlined />} onClick={removeFile}>
                  删除
                </Button>,
              ].filter(Boolean)}
            >
              <List.Item.Meta
                avatar={meta.icon}
                title={
                  <Space size={8} wrap>
                    <Text>{item.name}</Text>
                    <Tag color={meta.color}>{meta.text}</Tag>
                  </Space>
                }
                description={
                  showProgress ? (
                    <Progress
                      percent={progress}
                      size="small"
                      status={status === 'error' ? 'exception' : status === 'done' ? 'success' : 'active'}
                    />
                  ) : null
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  )
}

export default ResumableUpload
