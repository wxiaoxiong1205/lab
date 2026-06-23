import React from 'react'
import { Alert, Button, Card, Col, Modal, Row, Space, Upload } from 'antd'
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd/es/upload/interface'
import type { RcFile } from 'antd/es/upload'

interface ImportXlsxModalProps {
  visible: boolean
  onCancel: () => void
  onImport: () => void
  onDownloadTemplate: () => void
  uploadProps: UploadProps
  importFile: RcFile | null
  importing: boolean
}
export const ImportXlsxModal: React.FC<ImportXlsxModalProps> = ({ visible, onCancel, onImport, onDownloadTemplate, uploadProps, importFile, importing }) => {
  return (
    <Modal
      title="导入数据集"
      open={visible}
      onCancel={() => {
        onCancel()
      }}
      width={600}
      footer={null}
    >
      <div className="mb-6">
        <Button type="text" icon={<DownloadOutlined />} onClick={onDownloadTemplate}>
          下载模板
        </Button>
        <Upload.Dragger className="p-[16px_8px]" {...uploadProps} maxCount={1}>
          <p className="ant-upload-drag-icon">
            <UploadOutlined className="text-[32px]" style={{ color: '#40a9ff' }} />
          </p>
          <p className="ant-upload-text mb-1">
            点击或拖拽文件到此区域
          </p>
          <p className="ant-upload-hint text-[var(--lab-color-text-muted)]">
            仅支持 .xlsx 格式文件
          </p>
        </Upload.Dragger>
      </div>

      {importFile && (
        <div className="mt-4">
          <Alert
            message={(
              <Space>
                <span>
                  已选择文件：
                  {importFile.name}
                </span>
                <span className="text-[var(--lab-color-text-muted)]">
                  (
                  {(importFile.size / 1024).toFixed(2)}
                  {' '}
                  KB)
                </span>
              </Space>
            )}
            type="success"
            showIcon
          />
        </div>
      )}

      <div
        className="mt-[24px] pt-[16px]"
        style={{
          borderTop: '1px solid #f0f0f0',
        }}
      >
        <Space className="w-full justify-end">
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={onImport} disabled={!importFile} loading={importing}>
            开始导入
          </Button>
        </Space>
      </div>
    </Modal>
  )
}
