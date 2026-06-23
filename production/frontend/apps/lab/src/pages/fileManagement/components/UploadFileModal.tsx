import React, { useEffect, useRef, useState } from 'react'
import { Form, Modal, Radio, message } from 'antd'
import type { ChunkFileUploaderRef } from '../../../components/common/ChunkFileUploader'
import ChunkFileUploader from '../../../components/common/ChunkFileUploader'
import { fileManagementService } from '../../../services/fileManagementService'

interface UploadFileModalProps {
  visible: boolean
  projectId: number
  folderId?: number
  onCancel: () => void
  onSuccess: () => void
}

const UploadFileModal: React.FC<UploadFileModalProps> = ({
  visible,
  projectId,
  folderId,
  onCancel,
  onSuccess,
}) => {
  const [form] = Form.useForm()
  const [uploadMethod, setUploadMethod] = useState<'local' | 'url'>('local')
  const [uploadId, setUploadId] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const uploaderRef = useRef<ChunkFileUploaderRef>(null)

  useEffect(() => {
    if (visible) {
      form.resetFields()
      setUploadMethod('local')
      setUploadId(null)
      setIsUploading(false)
      setIsSaving(false)
    }
  }, [visible, form])

  // 处理文件上传成功
  const handleUploadSuccess = (data: { fileUrl: string, uploadId?: string }) => {
    if (data.uploadId) {
      setUploadId(data.uploadId)
      setIsUploading(false)
      // 自动保存文件信息
      handleSaveFile(data.uploadId)
    }
    else {
      message.error('上传成功但未获取到 uploadId')
    }
  }

  // 处理文件上传失败
  const handleUploadError = (error: Error) => {
    setIsUploading(false)
    console.error('文件上传失败:', error)
  }

  // 处理文件变化
  const handleFileChange = (file: File | null) => {
    if (file) {
      setIsUploading(true)
    }
    else {
      setIsUploading(false)
      setUploadId(null)
    }
  }

  // 保存文件信息到文件管理
  const handleSaveFile = async (uploadIdValue: string) => {
    try {
      setIsSaving(true)
      await fileManagementService.addFile({
        upload_id: uploadIdValue,
        project_id: projectId,
        folder_id: folderId,
      })
      // message.success("文件保存成功");
      onSuccess()
    }
    catch (error: any) {
      message.error(error?.response?.data?.message || '保存文件信息失败')
    }
    finally {
      setIsSaving(false)
    }
  }

  // 处理确定按钮
  const handleOk = async () => {
    if (uploadMethod === 'local') {
      if (!uploadId) {
        if (isUploading) {
          message.warning('文件正在上传中，请稍候...')
          return
        }
        message.warning('请先上传文件')
        return
      }
      // 如果已经有 uploadId，说明已经自动保存了
      if (!isSaving) {
        onSuccess()
      }
    }
    else {
      // URL链接方式（暂未实现）
      message.warning('URL链接上传功能暂未实现')
    }
  }

  // 处理取消，上传中可以取消上传
  const handleCancel = () => {
    if (isUploading) {
      // 取消上传
      uploaderRef.current?.abort()
      message.info('已取消上传')
      setIsUploading(false)
      setUploadId(null)
    }
    if (isSaving) {
      message.warning('文件正在保存中，请稍候...')
      return
    }
    onCancel()
  }

  return (
    <Modal
      title="上传文件"
      open={visible}
      onCancel={handleCancel}
      onOk={handleOk}
      footer={false}
      // okText="确定"
      // cancelText="取消"
      confirmLoading={isSaving}
      maskClosable={!isUploading && !isSaving}
      keyboard={!isUploading && !isSaving}
      destroyOnClose
      width={600}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label={(
            <span>
              <span className="text-[var(--lab-color-danger)]">*</span>
              {' '}
              上传方式
            </span>
          )}
        >
          <Radio.Group
            value={uploadMethod}
            onChange={(e) => setUploadMethod(e.target.value)}
          >
            <Radio value="local">本地上传</Radio>
            {/* <Radio value="url">url链接</Radio> */}
          </Radio.Group>
        </Form.Item>

        {uploadMethod === 'local' && (
          <Form.Item label="文件上传">
            <ChunkFileUploader
              ref={uploaderRef}
              accept="*/*"
              maxSize={1024} // 1GB
              onSuccess={handleUploadSuccess}
              // onError={handleUploadError}
              onFileChange={handleFileChange}
              hintText="单个文件最大1GB。"
              showProgress
              projectId={String(projectId)}
              usage="file-management"
            />
          </Form.Item>
        )}

        {/* {uploadMethod === "url" && (
          <Form.Item label="URL链接">
            <div style={{ padding: "20px", textAlign: "center", color: "#999" }}>
              URL链接上传功能暂未实现
            </div>
          </Form.Item>
        )} */}
      </Form>
    </Modal>
  )
}

export default UploadFileModal
