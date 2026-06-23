import type { Dispatch, SetStateAction } from 'react'
import { message } from 'antd'
import type { TrainingMultiPick } from './DatasetCascaderSelectorShared'
import type { InferenceResultSetItem } from '@/types/inference'
import type { TrainingDatasetItem } from '@/types/training'

export function methodTypeTagColor(t: string): string {
  const u = t?.toLowerCase?.() ?? ''
  if (u.includes('dpo')) return 'orange'
  if (u.includes('sft')) return 'blue'
  return 'default'
}

export function rowKeyOf(usage: string, name: string) {
  return `${usage}::${name}`
}

export function parseRowKey(rk: string): { usage: string, datasetName: string } {
  const i = rk.indexOf('::')
  if (i <= 0) return { usage: '', datasetName: rk }
  return { usage: rk.slice(0, i), datasetName: rk.slice(i + 2) }
}

export function normalizeInferenceItemToTrainingRow(item: InferenceResultSetItem): TrainingDatasetItem {
  return {
    id: item.id,
    created_at: item.created_at,
    updated_at: item.created_at,
    dataset_name: item.name,
    latest_version: '-',
    earliest_version: '-',
    dataset_format: item.dataset_format,
    dataset_type: item.dataset_type?.trim() ? item.dataset_type : 'text-generation',
    training_method_type: item.inference_method || 'inference',
    project_id: 0,
    version_count: 1,
    model_name: item.model_name,
    usage: 'default-inference',
  }
}

export function isNoVersionInferenceUsage(usage?: string): boolean {
  return usage === 'business-inference' || usage === 'default-inference'
}

export const MAX_INFERENCE_RESULT_MULTI_SELECT = 5

export function toggleInferenceResultRowMultiSelect(
  rk: string,
  setSelectedInferenceRowKeys: Dispatch<SetStateAction<string[]>>,
): void {
  setSelectedInferenceRowKeys((prev) => {
    if (prev.includes(rk)) return prev.filter((k) => k !== rk)
    if (prev.length >= MAX_INFERENCE_RESULT_MULTI_SELECT) {
      message.warning('最多选择5个推理结果集')
      return prev
    }
    return [...prev, rk]
  })
}

export function createDatasetToInferFieldValidator(options: {
  trainingDatasetMultiSelect: boolean
  useInferenceResultApi: boolean
  trainingMultiSelectMax: number
  noVersionInferenceMode: boolean
}) {
  const {
    trainingDatasetMultiSelect,
    useInferenceResultApi,
    trainingMultiSelectMax,
    noVersionInferenceMode,
  } = options

  return (_rule: unknown, value: unknown): Promise<void> => {
    if (trainingDatasetMultiSelect && !useInferenceResultApi) {
      if (!value || !Array.isArray(value) || value.length === 0) {
        return Promise.reject(new Error('请选择至少1个数据集'))
      }
      if (value.length > trainingMultiSelectMax) {
        return Promise.reject(new Error(`最多选择${trainingMultiSelectMax}个数据集`))
      }
      if (!(value as unknown[]).every((row) => Array.isArray(row) && row.length >= 3)) {
        return Promise.reject(new Error('请选择完整的数据集和版本'))
      }
      return Promise.resolve()
    }
    if (useInferenceResultApi) {
      if (typeof value === 'number' && value > 0) {
        return Promise.resolve()
      }
      if (
        Array.isArray(value)
        && value.length > 0
        && value.every((v) => typeof v === 'number' && v > 0)
      ) {
        return Promise.resolve()
      }
    }
    if (!value || !Array.isArray(value) || value.length === 0) {
      return Promise.reject(new Error('请选择待推理数据'))
    }

    if (!noVersionInferenceMode && (value as unknown[]).length < 3) {
      return Promise.reject(new Error('请选择完整的数据集和版本'))
    }

    return Promise.resolve()
  }
}

export function handleNoVersionInferenceDatasetRowClick(
  record: TrainingDatasetItem,
  options: {
    inferenceMultiSelect: boolean
    setSelectedInferenceRowKeys: Dispatch<SetStateAction<string[]>>
    setSelectedRowKey: Dispatch<SetStateAction<string | null>>
    setSelectedDatasetRecord: Dispatch<SetStateAction<TrainingDatasetItem | null>>
  },
): void {
  const rk = rowKeyOf(record.usage, record.dataset_name)
  const { inferenceMultiSelect, setSelectedInferenceRowKeys, setSelectedRowKey, setSelectedDatasetRecord } = options
  if (inferenceMultiSelect) {
    toggleInferenceResultRowMultiSelect(rk, setSelectedInferenceRowKeys)
    return
  }
  setSelectedRowKey(rk)
  setSelectedDatasetRecord(record)
}

export function reconcileTrainingMultiPicksWithListData(
  prev: TrainingMultiPick[],
  listData: TrainingDatasetItem[],
): TrainingMultiPick[] {
  if (!prev.length) return prev
  /** 切换「数据类型」等筛选后 listData 只含当前页/当前用途，不能把其它用途下已选项整行删掉 */
  if (!listData.length) return prev
  return prev.map((item) => {
    const rec = listData.find((res) => res.usage === item.usage && res.dataset_name === item.datasetName)
    if (!rec) return item
    if (item.record && item.record === rec) return item
    return { ...item, record: rec }
  })
}

export function inferTrainingDatasetItemFromVersionData(
  p: TrainingMultiPick,
  versionData: unknown,
): TrainingDatasetItem | null {
  if (!versionData || typeof versionData !== 'object') return null
  const v = versionData as Record<string, any>
  const tdId = v.training_dataset_id ?? v.dataset_id
  if (tdId == null || Number.isNaN(Number(tdId))) return null
  return {
    id: Number(tdId),
    dataset_name: p.datasetName,
    usage: p.usage,
    created_at: String(v.created_at ?? ''),
    updated_at: String(v.updated_at ?? ''),
    dataset_format: String(v.dataset_format ?? ''),
    dataset_type: String(v.dataset_type ?? ''),
    earliest_version: '',
    latest_version: '',
    model_name: v.model_name,
    project_id: Number(v.project_id) || 0,
    training_method_type: String(v.training_method_type ?? ''),
    version_count: 0,
  }
}

/** 与 onChange 第二参数中单条路径结构一致 */
export function buildTrainingPickSelectedOptions(
  p: TrainingMultiPick,
  record: TrainingDatasetItem,
  versionData: unknown,
  resolveUsageLabel: (u: string) => string,
): any[] {
  const usageLabel = resolveUsageLabel(p.usage)
  return [
    { label: usageLabel, value: p.usage },
    {
      label: p.datasetName,
      value: p.datasetName,
      datasetId: record?.id ?? p.datasetName,
      data: record,
      isLeaf: false,
    },
    { label: p.version, value: p.version, versionData },
  ]
}
