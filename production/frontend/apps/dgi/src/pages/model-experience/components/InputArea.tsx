import type { UploadProps } from 'antd'
import { Flex, Input, Space, Tooltip, Upload, message } from 'antd'
import { Sender } from '@ant-design/x'
import { ImageIcon } from 'lucide-react'
import React, { useEffect, useRef } from 'react'
import type { ModelItem } from './types'
import { hasModelCategory } from './HasModelCategory'
import { $t } from '@/locales'

/**
 * 输入区域组件 - 包含输入框和控制按钮
 */
interface InputAreaProps {
  models: ModelItem[]
  agents: { isRequesting: () => boolean }[]
  query: string
  setQuery: (value: string) => void
  inputMessage: string
  setInputMessage: (value: string) => void
  headerNode: React.ReactNode
  onSubmit: (text: string, fileName?: string) => void
  handleCancel: () => void
  fileList: NonNullable<UploadProps['fileList']>
  setFileList: React.Dispatch<React.SetStateAction<NonNullable<UploadProps['fileList']>>>
  props: UploadProps
  isFullscreen?: boolean
}

export const InputArea: React.FC<InputAreaProps> = ({
  models,
  agents,
  query,
  setQuery,
  inputMessage,
  setInputMessage,
  headerNode,
  onSubmit,
  handleCancel,
  fileList,
  setFileList,
  props,
  isFullscreen = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const supportsVision = hasModelCategory(models[0]?.category, 'Vision_Language')

  useEffect(() => {
    if (!supportsVision) {
      return
    }

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type.includes('image')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (!file) continue

          const validFormats = ['image/jpeg', 'image/png', 'image/bmp', 'image/jpg']
          if (!validFormats.includes(file.type)) {
            message.error('仅支持JPEG/PNG/BMP/JPG格式的图片')
            return
          }

          const maxSize = 10 * 1024 * 1024
          if (file.size > maxSize) {
            message.error('图片大小不能超过10MB')
            return
          }

          const rcFile = file as any
          const uid = `-paste-${Date.now()}-${Math.random()}`
          rcFile.uid = uid

          // 创建文件对象
          const uploadFile: any = {
            uid,
            name: file.name || `pasted-image-${Date.now()}.png`,
            status: 'done',
            originFileObj: rcFile,
            thumbUrl: URL.createObjectURL(file),
            percent: 100,
          }

          // 直接添加到文件列表，和点击上传的逻辑一致
          setFileList((prev) => [...prev, uploadFile])
        }
      }
    }

    const container = containerRef.current
    if (container) {
      container.addEventListener('paste', handlePaste)
    }

    return () => {
      if (container) {
        container.removeEventListener('paste', handlePaste)
      }
    }
  }, [setFileList, supportsVision])

  return (
    <div
      ref={containerRef}
      className={`${isFullscreen ? 'p-4 border-t bg-white flex-shrink-0' : 'px-6 pt-4 pb-6'}`}
      tabIndex={-1}
    >
      <div className="max-w-5xl mx-auto">
        <Flex vertical={models[0]?.category !== 'Rerank'} gap="middle">
          {models[0]?.category === 'Rerank' && (
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
              }}
              onBlur={(e) => {
                setQuery(e.target.value)
              }}
              placeholder={$t('请输入您的问题，例如：元宇宙是什么')}
            />
          )}
          <Sender
            placeholder={models[0]?.category === 'Rerank' ? $t('请输入待排序分片，多个分片用英文逗号分制，例如：元宇宙是什么东西,元宇宙的元年') : $t('请输入问题，将同时发送给所有选中的模型')}
            loading={agents.some((agent) => agent.isRequesting())}
            value={inputMessage}
            onChange={(v) => {
              setInputMessage(v)
            }}
            header={headerNode}
            onSubmit={(text: string) => onSubmit(text)}
            onCancel={handleCancel}
            autoSize={{ minRows: 2, maxRows: 6 }}
            actions={(_, info) => {
              const { SendButton, LoadingButton } = info.components
              const isDisabled = supportsVision
                ? (!inputMessage.trim() && fileList.length === 0)
                : !inputMessage.trim()

              return (
                <Space size="small">
                  {supportsVision && (
                    <Tooltip title={$t('支持上传JPEG/PNG/BMP/JPG格式的图片，最大不超过10MB')}>
                      <Upload {...props}>
                        <div className="flex items-center justify-center w-8 h-8 hover:bg-gray-100 rounded-[8px] cursor-pointer">
                          <ImageIcon className="w-4 h-4" />
                        </div>
                      </Upload>
                    </Tooltip>
                  )}
                  {agents.some((agent) => agent.isRequesting()) ? (
                    <LoadingButton type="default" onClick={handleCancel} />
                  ) : (
                    <SendButton type="primary" disabled={isDisabled} />
                  )}
                </Space>
              )
            }}
          />
        </Flex>
        <div className="text-center text-xs text-gray-500 mt-2">
          {$t('本回答由AI生成，内容仅供参考，请仔细甄别')}
        </div>
      </div>
    </div>
  )
}
