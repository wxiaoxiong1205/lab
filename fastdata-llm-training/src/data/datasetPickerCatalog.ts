/** 创建训练 / 验证集选择弹窗用的数据集目录（Mock，可对接接口替换） */

export interface DatasetPickerVersion {
  id: string
  label: string
  charCount: number
  sampleCount: number
}

/** 数据类型：与推理/训练侧数据集分类一致（Mock） */
export type DatasetPickerDataType = '测试数据集' | '训练数据集' | '验证数据集'

export interface DatasetPickerItem {
  id: string
  name: string
  latestVersion: string
  dataType: DatasetPickerDataType
  dataUsage: '文本生成' | '图像理解'
  dataFormat: string
  versions: DatasetPickerVersion[]
}

/** 选中后的训练表行 / 表单回填结构 */
export interface DatasetPickerResolvedRow {
  key: string
  datasetId: string
  datasetName: string
  version: string
  versionId: string
  dataUsage: string
  dataFormat: string
  charCount: number
  sampleCount: number
  sampleRate: number
  trainRatio: number
}

export const DATASET_PICKER_CATALOG: DatasetPickerItem[] = [
  {
    id: 'ds_pr_1',
    name: 'PROMPT_RESPONSE格式对话训练集',
    latestVersion: 'V2',
    dataType: '训练数据集',
    dataUsage: '文本生成',
    dataFormat: 'PROMPT_RESPONSE',
    versions: [
      { id: 'v1', label: 'V1', charCount: 890_000, sampleCount: 2200 },
      { id: 'v2', label: 'V2', charCount: 1_250_000, sampleCount: 3100 },
    ],
  },
  {
    id: 'ds_jsonl_1',
    name: '训练-ROLE_BASED-1',
    latestVersion: 'V1',
    dataType: '训练数据集',
    dataUsage: '文本生成',
    dataFormat: 'ROLE_BASED',
    versions: [{ id: 'v1', label: 'V1', charCount: 560_000, sampleCount: 1400 }],
  },
  {
    id: 'ds_pr_2',
    name: '文本生成-PROMPT_RESPONSE-业务A',
    latestVersion: 'V1',
    dataType: '训练数据集',
    dataUsage: '文本生成',
    dataFormat: 'PROMPT_RESPONSE',
    versions: [
      { id: 'v1', label: 'V1', charCount: 2_100_000, sampleCount: 5200 },
      { id: 'v2', label: 'V2', charCount: 2_340_000, sampleCount: 5800 },
    ],
  },
  {
    id: 'ds_vision_1',
    name: '图文对-VL微调样本',
    latestVersion: 'V1',
    dataType: '训练数据集',
    dataUsage: '图像理解',
    dataFormat: 'image_text_pair',
    versions: [
      { id: 'v1', label: 'V1', charCount: 0, sampleCount: 8000 },
      { id: 'v2', label: 'V2', charCount: 0, sampleCount: 12000 },
    ],
  },
  {
    id: 'ds_pr_3',
    name: '通用指令跟随-PROMPT_RESPONSE',
    latestVersion: 'V3',
    dataType: '训练数据集',
    dataUsage: '文本生成',
    dataFormat: 'PROMPT_RESPONSE',
    versions: [
      { id: 'v1', label: 'V1', charCount: 400_000, sampleCount: 900 },
      { id: 'v2', label: 'V2', charCount: 720_000, sampleCount: 1800 },
      { id: 'v3', label: 'V3', charCount: 980_000, sampleCount: 2400 },
    ],
  },
  {
    id: 'ds_val_pr_1',
    name: '验证-PROMPT_RESPONSE-1',
    latestVersion: 'V1',
    dataType: '验证数据集',
    dataUsage: '文本生成',
    dataFormat: 'PROMPT_RESPONSE',
    versions: [{ id: 'v1', label: 'V1', charCount: 120_000, sampleCount: 320 }],
  },
  {
    id: 'ds_val_role_1',
    name: '验证-ROLE_BASED-1',
    latestVersion: 'V1',
    dataType: '验证数据集',
    dataUsage: '文本生成',
    dataFormat: 'ROLE_BASED',
    versions: [{ id: 'v1', label: 'V1', charCount: 95_000, sampleCount: 280 }],
  },
  {
    id: 'ds_test_role_1',
    name: '测试-ROLE_BASED-样本',
    latestVersion: 'V1',
    dataType: '测试数据集',
    dataUsage: '文本生成',
    dataFormat: 'ROLE_BASED',
    versions: [{ id: 'v1', label: 'V1', charCount: 95_000, sampleCount: 410 }],
  },
  {
    id: 'ds_dpo_1',
    name: 'DPO偏好对-Chosen_Rejected-通用',
    latestVersion: 'V1',
    dataType: '训练数据集',
    dataUsage: '文本生成',
    dataFormat: 'Chosen_Rejected',
    versions: [
      { id: 'v1', label: 'V1', charCount: 450_000, sampleCount: 1100 },
      { id: 'v2', label: 'V2', charCount: 600_000, sampleCount: 1500 },
    ],
  },
  {
    id: 'ds_dpo_2',
    name: 'DPO偏好对-Chosen_Rejected-业务A',
    latestVersion: 'V1',
    dataType: '训练数据集',
    dataUsage: '文本生成',
    dataFormat: 'Chosen_Rejected',
    versions: [{ id: 'v1', label: 'V1', charCount: 280_000, sampleCount: 700 }],
  },
  {
    id: 'ds_rm_1',
    name: 'RM奖励模型- Chosen_Rejected-训练集',
    latestVersion: 'V1',
    dataType: '训练数据集',
    dataUsage: '文本生成',
    dataFormat: 'Chosen_Rejected',
    versions: [{ id: 'v1', label: 'V1', charCount: 350_000, sampleCount: 875 }],
  },
  {
    id: 'ds_val_cr_1',
    name: '验证-Chosen_Rejected-1',
    latestVersion: 'V1',
    dataType: '验证数据集',
    dataUsage: '文本生成',
    dataFormat: 'Chosen_Rejected',
    versions: [{ id: 'v1', label: 'V1', charCount: 90_000, sampleCount: 225 }],
  },
  {
    id: 'ds_pr_reward_1',
    name: 'PPO-Completion_Reward-训练集A',
    latestVersion: 'V1',
    dataType: '训练数据集',
    dataUsage: '文本生成',
    dataFormat: 'Completion_Reward',
    versions: [
      { id: 'v1', label: 'V1', charCount: 320_000, sampleCount: 800 },
    ],
  },
  {
    id: 'ds_pr_reward_2',
    name: 'PPO-Completion_Reward-业务场景',
    latestVersion: 'V1',
    dataType: '训练数据集',
    dataUsage: '文本生成',
    dataFormat: 'Completion_Reward',
    versions: [
      { id: 'v1', label: 'V1', charCount: 540_000, sampleCount: 1350 },
      { id: 'v2', label: 'V2', charCount: 680_000, sampleCount: 1700 },
    ],
  },
  {
    id: 'ds_val_reward_1',
    name: '验证-Completion_Reward-1',
    latestVersion: 'V1',
    dataType: '验证数据集',
    dataUsage: '文本生成',
    dataFormat: 'Completion_Reward',
    versions: [{ id: 'v1', label: 'V1', charCount: 80_000, sampleCount: 200 }],
  },
]

export function makeDatasetRowKey(datasetId: string, versionId: string) {
  return `${datasetId}__${versionId}`
}

export function parseDatasetRowKey(key: string): { datasetId: string; versionId: string } | null {
  const i = key.indexOf('__')
  if (i <= 0) return null
  return { datasetId: key.slice(0, i), versionId: key.slice(i + 2) }
}

/** 根据 catalog 解析版本行（用于展示与回填） */
export function resolveDatasetVersionRow(key: string): DatasetPickerResolvedRow | null {
  const parsed = parseDatasetRowKey(key)
  if (!parsed) return null
  const ds = DATASET_PICKER_CATALOG.find(d => d.id === parsed.datasetId)
  const ver = ds?.versions.find(v => v.id === parsed.versionId)
  if (!ds || !ver) return null
  return {
    key,
    datasetId: ds.id,
    datasetName: ds.name,
    version: ver.label,
    versionId: ver.id,
    dataUsage: ds.dataUsage,
    dataFormat: ds.dataFormat,
    charCount: ver.charCount,
    sampleCount: ver.sampleCount,
    sampleRate: 1,
    trainRatio: 0,
  }
}
