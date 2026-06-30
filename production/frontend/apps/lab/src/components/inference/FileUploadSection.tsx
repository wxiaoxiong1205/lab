import React from 'react'
import { Button, Form, Input, Radio, Space, Tooltip, Typography, Upload, message } from 'antd'
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons'
import type { RcFile, UploadProps } from 'antd/es/upload'
import { inferenceResultSetService } from '@/services/inferenceApi'
import { downloadBlobFile } from '@/utils/download'

const { Dragger } = Upload
const { Text } = Typography

interface FileUploadSectionProps {
  form: any
  uploadMethod: 'local' | 'url'
  selectedFile: File | null
  onUploadMethodChange: (method: 'local' | 'url') => void
  onFileChange: (file: File | null) => void
  uploadProps: UploadProps
}

/**
 * 文件上传组件
 */
const FileUploadSection: React.FC<FileUploadSectionProps> = ({
  form,
  uploadMethod,
  selectedFile,
  onUploadMethodChange,
  onFileChange,
  uploadProps,
}) => {
  return (
    <>
      <Form.Item
        label="上传方式"
        name="upload_method"
        initialValue="local"
      >
        <Radio.Group
          value={uploadMethod}
          onChange={(e) => {
            onUploadMethodChange(e.target.value)
            form.setFieldsValue({
              file_url: undefined,
            })
            onFileChange(null)
          }}
        >
          <Radio value="local">本地上传</Radio>
          <Tooltip title="即将上线" color="blue">
            <Radio value="url" disabled>URL获取</Radio>
          </Tooltip>
        </Radio.Group>
      </Form.Item>
      <Form.Item
        label="模型名称"
        name="model_name"
        rules={[
          { required: true, message: '请输入模型名称' },
          { min: 2, max: 64, message: '模型名称长度为2-64个字符' },
          { pattern: /^[^-_].*$/, message: '模型名称不能以下划线和中划线开头' },
          { pattern: /^[\u4E00-\u9FA5a-zA-Z0-9._-]*$/, message: '模型名称只支持中英文、数字、小数点、中划线(-)、下划线(_)' },
        ]}
      >
        <Input placeholder="请输入模型名称" className="w-[400px]" />
      </Form.Item>

      {uploadMethod === 'local' ? (
        <Form.Item
          label="上传文件"
          rules={[{ required: true, message: '请上传文件' }]}
        >
          <Dragger {...uploadProps} className="w-[700px] p-10">
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
            <p className="ant-upload-hint">
              支持 jsonl、csv、xlsx 格式，单个文件不超过 100MB
            </p>
          </Dragger>
        </Form.Item>
      ) : (
        <Form.Item
          label="文件URL"
          name="file_url"
          rules={[{ required: true, message: '请输入文件URL' }]}
        >
          <Input placeholder="请输入文件URL" className="w-[500px]" />
        </Form.Item>
      )}

      <div className="mt-4">
        <Text type="secondary">下载示例文件：</Text>
        <Space>
          {(['jsonl', 'csv', 'xlsx'] as const).map((fileType) => (
            <Button
              key={fileType}
              type="link"
              icon={<DownloadOutlined />}
              onClick={async () => {
                try {
                  const response = await inferenceResultSetService.downloadSample(fileType)

                  const rawContentDisposition
                    = response.headers['content-disposition']
                      || response.headers['Content-Disposition']
                  const rawContentType
                    = response.headers['content-type']
                      || response.headers['Content-Type']
                  const contentDisposition = typeof rawContentDisposition === 'string' ? rawContentDisposition : ''
                  const contentType = typeof rawContentType === 'string' ? rawContentType : ''

                  let filename = `inference_result_sample.${fileType}`
                  if (contentDisposition) {
                    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
                    if (utf8Match && utf8Match[1]) {
                      try {
                        filename = decodeURIComponent(utf8Match[1].trim())
                      }
                      catch (e) {
                        filename = utf8Match[1].trim()
                      }
                    }
                    else {
                      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]+)/i)
                      if (filenameMatch && filenameMatch[1]) {
                        filename = filenameMatch[1].trim().replace(/^["']|["']$/g, '')
                      }
                    }
                  }

                  let blob: Blob
                  if (response.data instanceof Blob) {
                    blob = response.data
                  }
                  else {
                    const blobType = contentType || (
                      fileType === 'jsonl' ? 'application/jsonl'
                        : fileType === 'csv' ? 'text/csv'
                          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                    )
                    blob = new Blob([response.data], { type: blobType })
                  }

                  downloadBlobFile(blob, filename)
                  message.success('示例文件下载成功')
                }
                catch (error) {
                  console.error('下载示例文件失败:', error)
                  message.error('下载示例文件失败，请稍后重试')
                }
              }}
            >
              {fileType.toUpperCase()}
              {' '}
              格式
            </Button>
          ))}
        </Space>
      </div>
    </>
  )
}

export default FileUploadSection
