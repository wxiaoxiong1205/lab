import React from 'react'
import { useParams } from 'react-router-dom'
import { Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '@/stores/projectStore'
import { InferenceResultSetTab } from '@/components/dataset'

const { Title, Text } = Typography

export default function BusinessInference() {
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
    <div className="inference-result-set-container">
      <div className="flex justify-between items-center">
        <Title level={4} className="m-0">
          {t('sidebar.InferenceResultSet', '业务推理结果集')}
        </Title>
      </div>
      <div className="mb-4">
        <Text type="secondary">
          管理业务推理结果集, 适用于模型选型、效果评估或模型复用场景。
        </Text>
      </div>

      <InferenceResultSetTab projectId={numericProjectId} usage="business-inference" />
    </div>
  )
};
