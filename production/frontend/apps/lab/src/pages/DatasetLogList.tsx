import React from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DatasetLogList } from '../components/dataset-logs'
import { useProjectStore } from '../stores/projectStore'

/**
 * 数据集执行日志页面
 * 显示当前项目的所有数据集执行日志
 */
const DatasetLogListPage: React.FC = () => {
  const { t } = useTranslation()
  const { projectId } = useParams<{ projectId: string }>()
  const { currentProject } = useProjectStore()

  // Convert projectId to number
  const projectIdNum = projectId ? parseInt(projectId, 10) : (currentProject?.id || 0)

  return (
    <DatasetLogList projectId={projectIdNum} />
  )
}

export default DatasetLogListPage
