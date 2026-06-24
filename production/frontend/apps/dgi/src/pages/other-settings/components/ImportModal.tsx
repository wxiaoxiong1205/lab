import { useEffect, useState } from 'react'
import { Button, Modal, Upload, message } from 'antd'
import type { UploadProps } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import { useRequest } from 'ahooks'
import { apiSensitiveWordImport } from '@/services/api'
import { $t } from '@/locales'
import { withBasePath } from '@/utils'

const { Dragger } = Upload

interface ImportModalProps {
  open: boolean
  onCancel: () => void
  onSuccess: () => void
}

export default function ImportModal({
  open,
  onCancel,
  onSuccess,
}: ImportModalProps) {
  const [fileList, setFileList] = useState<any[]>([])

  const { run: importWords, loading } = useRequest(apiSensitiveWordImport, {
    manual: true,
    onSuccess: (res) => {
      // message.success('导入成功')
      message.success(res?.data)
      onSuccess()
      onCancel()
    },
  })

  const handleImport = () => {
    if (fileList.length === 0) {
      message.error('请先选择文件')
      return
    }
    const formData = new FormData()
    formData.append('file', fileList[0])
    importWords(formData)
  }

  const uploadProps: UploadProps = {
    onRemove: () => {
      setFileList([])
    },
    beforeUpload: (file) => {
      setFileList([file])
      return false // 阻止自动上传
    },
    fileList,
    maxCount: 1,
    accept: '.xls,.xlsx',
  }

  useEffect(() => {
    if (open) {
      setFileList([])
    }
  }, [open])

  return (
    <Modal
      title={$t('批量导入敏感词')}
      open={open}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          {$t('取消')}
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={loading}
          onClick={handleImport}
        >
          {$t('导入')}
        </Button>,
      ]}
    >
      <Dragger {...uploadProps}>
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">{$t('点击或拖拽文件到此区域上传')}</p>
        <p className="ant-upload-hint">{$t('支持 .xls, .xlsx 格式的文件')}</p>
      </Dragger>
      <p className="my-2">
        <a
          href={withBasePath('/sensitive_words_template.xlsx')}
          download="sensitive_words_template.xlsx"
          style={{ textDecoration: 'none' }}
        >
          {$t('下载模版')}
        </a>
      </p>
    </Modal>
  )
}
