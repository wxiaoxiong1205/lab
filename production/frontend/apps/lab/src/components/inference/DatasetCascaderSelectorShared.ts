import type { DatasetStatsQuery } from '@/services/datasetFilter'
import type { TrainingDatasetItem } from '@/types/training'

/** 未传 statsQuery.usage 时，stats 接口默认按这些用途聚合筛选项 */
export const DEFAULT_STATS_USAGE = ['test', 'training', 'validation'] as const

/** stats / 列表中的 usage 枚举值 -> 展示文案 */
const USAGE_VALUE_LABEL: Record<string, string> = {
  training: '训练数据集',
  validation: '验证数据集',
  test: '测试数据集',
  business_test: '业务测试数据集',
}

export function formatUsageLabel(value: string): string {
  return USAGE_VALUE_LABEL[value] ?? value
}

export function formatDatasetTypeLabel(v: string) {
  const map: Record<string, string> = {
    'text-generation': '文本生成',
    'image-understanding': '图像理解',
    'image-generation': '图像生成',
  }
  return map[v] || v
}

export function formatDatasetFormatDisplay(v: string) {
  const map: Record<string, string> = {
    'role-based': 'ROLE_BASED',
    'prompt-response': 'PROMPT_RESPONSE',
    'question-answer': 'QUESTION_ANSWER',
    'text-completion': 'TEXT_COMPLETION',
    'alpaca': 'ALPACA',
    'image-prompt': 'IMAGE_PROMPT',
    'grpo': 'GRPO',
  }
  return map[v] || v
}

export interface DatasetCascaderSelectorProps {
  form: any
  options?: any[]
  onLoadData?: (selectedOptions: any[]) => void
  onChange?: (value, selectedOptions?: any[]) => void
  filter?: (inputValue: string, path: any[]) => boolean
  loading?: boolean
  label?: string
  /** 表单字段名，默认 data_to_infer */
  fieldName?: string
  /** 传给 stats 接口；不传 usage 时默认 ['test','training','validation']；可传 dataset_type / dataset_format 与父级「数据用途」等对齐 */
  statsQuery?: DatasetStatsQuery
  /** 传 false 接口传入 prompt-response和role-based 两种数据格式 不传就是原本的 */
  includeAllStatsDatasetFormats?: boolean
  /** 固定列表按该 usage 筛选，并隐藏左侧「数据类型」单选 */
  fixedListUsage?: string
  listDatasetType?: string
  /** 禁用选择按钮与输入 */
  disabled?: boolean
  /** 是否校验必选（微调场景选填，选 false） */
  requiredSelection?: boolean
  placeholder?: string
  modalTitle?: string
  /** 弹窗右侧顶部提示文案；不传时使用推理结果集默认限制说明 */
  selectionNotice?: string
  selectButtonText?: string
  /** 路由无 projectId 时传入（如微调页 projectIdParam） */
  projectIdOverride?: number
  /** 使用推理结果集筛选接口：statsInferenceResult/listInferenceResult */
  useInferenceResultApi?: boolean
  /** 推理结果集：弹窗未打开时用于输入框展示（克隆/编辑回显） */
  inferenceDisplayName?: string
  /** 推理结果集：弹窗内多选，表单值为单个 number 或 number[]（与单选互斥） */
  inferenceMultiSelect?: boolean
  /** 训练数据集（含版本）：弹窗内多选，表单值为 string[][]，每项为 [usage, dataset_name, version]；与 useInferenceResultApi 互斥 */
  trainingDatasetMultiSelect?: boolean
  /** 与 trainingDatasetMultiSelect 联用，默认 3 */
  trainingMultiSelectMax?: number
  /**
   * 为 true 时不展示 stats 返回的「数据用途」「数据格式」左侧筛选；
   * 列表请求仅使用 listDatasetType（及 usage 等），不拼接弹窗内的 dataset_type / dataset_format 选项。
   */
  hideStatsDatasetTypeAndFormatFilters?: boolean
  onModalOpenChange?: (open: boolean) => void
}

export type TrainingMultiPick = {
  pickKey: string
  rk: string
  usage: string
  datasetName: string
  version: string
  versionData: any
  record: TrainingDatasetItem | null
}
