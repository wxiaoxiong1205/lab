import React from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  Tabs,
  Typography,
} from 'antd'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../stores/projectStore'
import { EvaluationDatasetTab, TrainingDatasetTab } from '../components/dataset'
import './DirectoryManagement.css'

const { Title, Text } = Typography

const DirectoryManagement: React.FC = () => {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()
  const currentProject = useProjectStore((state) => state.currentProject)
  const [searchParams, setSearchParams] = useSearchParams({ key: 'training' })
  const activeKey = searchParams.get('key') || 'training'

  // 优先使用URL中的projectId，如果没有则使用store中的
  const numericProjectId = projectId
    ? parseInt(projectId, 10)
    : currentProject?.id

  if (!numericProjectId) {
    return <div>{t('common.selectProject') || '请选择项目'}</div>
  }

  return (
    <div className="directory-management-page">
      <div className="directory-management-header">
        <Title level={4} className="directory-management-title">
          {t('sidebar.TrainingDatasets', '训练数据管理')}
        </Title>
      </div>
      <div className="directory-management-description">
        <Text type="secondary">
          管理和创建用于模型训练的数据集，支持多种格式和训练类型。
        </Text>
      </div>

      <Tabs
        className="directory-management-tabs"
        activeKey={activeKey}
        onChange={(key) => {
          setSearchParams({ key })
        }}
        items={[
          {
            key: 'training',
            label: '训练数据集',
            children: <TrainingDatasetTab projectId={numericProjectId} />,
          },
          {
            key: 'validation',
            label: '验证数据集',
            children: <EvaluationDatasetTab projectId={numericProjectId} />,
          },
        ]}
      />
    </div>
  )
}

export default DirectoryManagement
