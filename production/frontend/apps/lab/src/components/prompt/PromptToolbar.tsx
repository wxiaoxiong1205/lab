import React from 'react'
import { Button, Space, Tooltip, Upload } from 'antd'
import {
  DownloadOutlined,
  FileTextOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import type { RcFile } from 'antd/es/upload'
import useI18n from '../../hooks/useI18n'

interface PromptToolbarProps {
  importLoading: boolean
  selectedProject: number | null
  onImport: (file: RcFile) => boolean | Promise<boolean>
  onExport: () => void
  onDownloadTemplate: () => void
  onCreateNew: () => void
}

const PromptToolbar: React.FC<PromptToolbarProps> = ({
  importLoading,
  selectedProject,
  onImport,
  onExport,
  onDownloadTemplate,
  onCreateNew,
}) => {
  const { t } = useI18n()

  return (
    <Space>
      <Upload
        accept=".xlsx"
        showUploadList={false}
        beforeUpload={onImport}
        disabled={importLoading || !selectedProject}
      >
        <Button
          icon={<UploadOutlined />}
          loading={importLoading}
          disabled={!selectedProject}
        >
          {t('prompt.import')}
        </Button>
      </Upload>
      <Button
        icon={<DownloadOutlined />}
        onClick={onExport}
        disabled={!selectedProject}
      >
        {t('prompt.export')}
      </Button>
      <Tooltip title={t('prompt.downloadTemplate')}>
        <Button
          icon={<FileTextOutlined />}
          onClick={onDownloadTemplate}
        >
          {t('prompt.template')}
        </Button>
      </Tooltip>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={onCreateNew}
      >
        {t('prompt.new')}
      </Button>
    </Space>
  )
}

export default PromptToolbar
