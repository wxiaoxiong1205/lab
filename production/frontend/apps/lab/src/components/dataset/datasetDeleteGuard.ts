import { trainingDatasetService } from '@/services/trainingApi.ts'
import type { DatasetInUseResponse } from '@/types/training'

const taskTypeText: Record<string, string> = {
  label: '标注任务',
  cleaning: '清洗任务',
}

export function getDatasetDeleteErrorMessage(error: any, fallback = '删除失败') {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) {
    return detail
  }
  if (Array.isArray(detail) && detail[0]?.msg) {
    return detail[0].msg
  }
  return error?.response?.data?.msg || error?.message || fallback
}

export function formatDatasetInUseMessage(inUse: DatasetInUseResponse, datasetName: string) {
  const taskType = inUse.task_type ? (taskTypeText[inUse.task_type] || inUse.task_type) : '任务'
  const taskName = inUse.task_name ? `「${inUse.task_name}」` : ''
  return `数据集 ${datasetName} 的版本 ${inUse.version} 正被${taskType}${taskName}引用，请先处理引用任务后再删除。`
}

export async function getDatasetVersionDeleteBlockReason(
  projectId: number,
  datasetName: string,
  version?: string,
  usage?: string,
) {
  if (!version) {
    return null
  }

  try {
    const inUse = await trainingDatasetService.checkInUse(projectId, datasetName, version, usage)
    return inUse.in_use ? formatDatasetInUseMessage(inUse, datasetName) : null
  }
  catch (error) {
    console.warn('检查数据集引用状态失败，继续交由删除接口兜底:', error)
    return null
  }
}
