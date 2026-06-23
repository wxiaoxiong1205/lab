import React from 'react'
import { useParams } from 'react-router-dom'
import { Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../stores/projectStore'
import { InferenceResultSetTab } from '../components/dataset'
import './DirectoryManagement.css'

const { Title, Text } = Typography

const InferenceResultSet: React.FC = () => {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()
  const currentProject = useProjectStore((state) => state.currentProject)

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
          {t('sidebar.InferenceResultSet', '推理结果集')}
        </Title>
      </div>
      <div className="directory-management-description">
        <Text type="secondary">
          管理推理数据集, 适用于模型选型、效果评估或模型复用场景。
        </Text>
      </div>

      <div className="directory-management-content">
        <InferenceResultSetTab projectId={numericProjectId} />
      </div>
    </div>
  )
}

export default InferenceResultSet
