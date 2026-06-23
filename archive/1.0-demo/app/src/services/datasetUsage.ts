export type TrainingDatasetUsage =
  | 'SFT-文本生成'
  | 'SFT-图像理解'
  | 'DPO-文本生成'
  | 'DPO-图像理解'
  | 'RFT-PPO-文本生成'
  | 'RFT-PPO-图像理解'
  | 'RFT-GRPO-文本生成'
  | 'RFT-GRPO-图像理解'

export const DATASET_USAGE_TAGS: Record<TrainingDatasetUsage, { color: string; text: string }> = {
  'SFT-文本生成': { color: 'blue', text: 'SFT-文本生成' },
  'SFT-图像理解': { color: 'cyan', text: 'SFT-图像理解' },
  'DPO-文本生成': { color: 'green', text: 'DPO-文本生成' },
  'DPO-图像理解': { color: 'lime', text: 'DPO-图像理解' },
  'RFT-PPO-文本生成': { color: 'magenta', text: 'RFT-PPO-文本生成' },
  'RFT-PPO-图像理解': { color: 'volcano', text: 'RFT-PPO-图像理解' },
  'RFT-GRPO-文本生成': { color: 'purple', text: 'RFT-GRPO-文本生成' },
  'RFT-GRPO-图像理解': { color: 'geekblue', text: 'RFT-GRPO-图像理解' },
}

export const DATASET_USAGE_OPTIONS: Array<{
  value: TrainingDatasetUsage
  method: 'SFT' | 'DPO' | 'RFT'
  scene: '文本生成' | '图像理解'
  algorithm?: 'PPO' | 'GRPO'
}> = [
  { value: 'SFT-文本生成', method: 'SFT', scene: '文本生成' },
  { value: 'SFT-图像理解', method: 'SFT', scene: '图像理解' },
  { value: 'DPO-文本生成', method: 'DPO', scene: '文本生成' },
  { value: 'DPO-图像理解', method: 'DPO', scene: '图像理解' },
  { value: 'RFT-GRPO-文本生成', method: 'RFT', algorithm: 'GRPO', scene: '文本生成' },
  { value: 'RFT-GRPO-图像理解', method: 'RFT', algorithm: 'GRPO', scene: '图像理解' },
]

export interface DatasetUsageCascaderOption {
  value: string
  label: string
  children?: DatasetUsageCascaderOption[]
  datasetUsage?: TrainingDatasetUsage
}

export const DATASET_USAGE_CASCADER_OPTIONS: DatasetUsageCascaderOption[] = [
  {
    value: '文本生成',
    label: '文本生成',
    children: [
      { value: 'SFT', label: 'SFT', datasetUsage: 'SFT-文本生成' },
      { value: 'DPO', label: 'DPO', datasetUsage: 'DPO-文本生成' },
      { value: 'RFT-GRPO', label: 'RFT-GRPO', datasetUsage: 'RFT-GRPO-文本生成' },
    ],
  },
  {
    value: '图像理解',
    label: '图像理解',
    children: [
      { value: 'SFT', label: 'SFT', datasetUsage: 'SFT-图像理解' },
      { value: 'DPO', label: 'DPO', datasetUsage: 'DPO-图像理解' },
      { value: 'RFT-GRPO', label: 'RFT-GRPO', datasetUsage: 'RFT-GRPO-图像理解' },
    ],
  },
]

export function isPpoDatasetUsage(value?: string): boolean {
  return value === 'RFT-PPO' || value === 'RFT-PPO-文本生成' || value === 'RFT-PPO-图像理解'
}

export function getDatasetUsagePath(value?: string): [string, string] | undefined {
  const normalized = normalizeDatasetUsage(value)
  const option = DATASET_USAGE_OPTIONS.find(item => item.value === normalized)
  if (!option) {
    return undefined
  }

  if (option.method === 'RFT' && option.algorithm) {
    return [option.scene, `RFT-${option.algorithm}`]
  }

  return [option.scene, option.method]
}

export function resolveDatasetUsageFromPath(path?: string[]): TrainingDatasetUsage | undefined {
  if (!path?.length) {
    return undefined
  }

  const [scene, method] = path
  const group = DATASET_USAGE_CASCADER_OPTIONS.find(item => item.value === scene)
  const option = group?.children?.find(item => item.value === method)
  return option?.datasetUsage
}

export function normalizeDatasetUsage(
  value?: string,
): TrainingDatasetUsage {
  switch (value) {
    case '图像理解':
      return 'SFT-图像理解'
    case 'DPO-文本生成':
    case 'DPO-图像理解':
    case 'RFT-PPO-文本生成':
    case 'RFT-PPO-图像理解':
    case 'RFT-GRPO-文本生成':
    case 'RFT-GRPO-图像理解':
    case 'SFT-图像理解':
    case 'SFT-文本生成':
      return value
    case 'RFT-PPO':
      return 'RFT-PPO-文本生成'
    case 'RFT-GRPO':
      return 'RFT-GRPO-文本生成'
    case '文本生成':
    default:
      return 'SFT-文本生成'
  }
}
