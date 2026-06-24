import React, { useEffect, useState } from 'react'
import { Alert, Button, Input, Modal, Space, Spin, Typography, message } from 'antd'
import { CloseOutlined, CopyOutlined, FileSyncOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { storageConfigService } from '../../services/storageConfigService'
import { copyToClipboard, handleInputContextMenu } from '../../utils/clipboard'

const { Text } = Typography
interface FileSystemFormatModalProps {
  open: boolean
  onCancel: () => void
  onSuccess: () => void
  storageConfigId: number
  storageConfigName: string
}
interface FormatResponse {
  metadata_url: string
  success: boolean
  message?: string
}
/**
 * 文件系统格式化弹窗组件
 */
const FileSystemFormatModal: React.FC<FileSystemFormatModalProps> = ({ open, onCancel, onSuccess, storageConfigId, storageConfigName }) => {
  const [loading, setLoading] = useState(false)
  const [metadataUrl, setMetadataUrl] = useState<string>('')
  const [formatSuccess, setFormatSuccess] = useState(false)
  // 重置状态
  const resetState = () => {
    setLoading(false)
    setMetadataUrl('')
    setFormatSuccess(false)
  }
  // 关闭弹窗
  const handleCancel = () => {
    resetState()
    onCancel()
  }
  // 执行文件系统格式化
  const handleFormat = async () => {
    try {
      setLoading(true)
      // 调用格式化API
      const response = await storageConfigService.formatFileSystem(storageConfigId.toString())
      // const response = {
      //     success: true,
      //     meta_url: 'https://www.baidu.com',
      // }
      if (response.success && response.meta_url) {
        setMetadataUrl(response.meta_url)
        setFormatSuccess(true)
        message.success('文件系统格式化成功')
      }
      else {
        throw new Error('格式化失败')
      }
    }
    catch (error) {
      console.error('Format file system error:', error)
      const errorMessage = error instanceof Error ? error.message : '文件系统格式化失败'
      message.error(errorMessage)
    }
    finally {
      setLoading(false)
    }
  }
  // 复制URL到剪贴板 - 兼容Mac和鼠标右键复制
  const handleCopyUrl = () => {
    copyToClipboard(metadataUrl, '元数据引擎URL')
  }
  // 弹窗打开时自动执行格式化
  useEffect(() => {
    if (open && !formatSuccess) {
      handleFormat()
    }
  }, [open])
  return (
    <Modal
      title={(
        <div className="flex items-center">
          <FileSyncOutlined className="mr-2 text-[var(--lab-color-brand-primary)]" />
          <span>文件系统格式化</span>
        </div>
      )}
      open={open}
      onCancel={handleCancel}
      footer={null}
      width={500}
      destroyOnClose
      maskClosable={false}
      closable
    >
      <div className="py-2">
        {loading && (
          <div className="text-center px-5 py-10">
            <Spin size="large" />
            <div className="mt-4 text-[var(--lab-color-text-muted)]">
              正在执行文件系统格式化，请稍候...
            </div>
          </div>
        )}

        {metadataUrl && (
          <div>
            <Alert message="格式化完成" description={`存储配置 "${storageConfigName}" 的文件系统格式化已成功完成。`} type="success" showIcon className="mb-6" />

            <div className="mb-4">
              <Text strong className="block mb-2">
                元数据引擎 URL
              </Text>
              <Input.Group compact>
                <Input className="w-[calc(100%_-_80px)]" value={metadataUrl} readOnly placeholder="元数据引擎URL" onContextMenu={handleInputContextMenu} />
                <Button type="primary" icon={<CopyOutlined />} onClick={handleCopyUrl} className="w-[80px]">
                  复制
                </Button>
              </Input.Group>
            </div>

            <Alert
              message={(
                <div className="flex items-center">
                  <InfoCircleOutlined className="mr-[8px]" style={{ color: '#faad14' }} />
                  <span>重要提示</span>
                </div>
              )}
              description="该URL仅当前可看，后续无法查询，请及时保存并妥善保管！"
              type="warning"
              showIcon={false}
              className="mb-6"
            />

            <div className="text-right">
              <Button type="primary" onClick={handleCancel} icon={<CloseOutlined />}>
                关闭
              </Button>
            </div>
          </div>
        )}

        {/* {!loading && !formatSuccess && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <FileSyncOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: 16 }} />
            <div style={{ fontSize: '16px', marginBottom: 8 }}>
              准备格式化文件系统
            </div>
            <div style={{ color: '#666', marginBottom: 24 }}>
              存储配置：{storageConfigName}
            </div>
            <Space>
              <Button onClick={handleCancel}>
                取消
              </Button>
              <Button
                type="primary"
                onClick={handleFormat}
                loading={loading}
                icon={<FileSyncOutlined />}
              >
                开始格式化
              </Button>
            </Space>
          </div>
        )} */}
      </div>
    </Modal>
  )
}
export default FileSystemFormatModal
