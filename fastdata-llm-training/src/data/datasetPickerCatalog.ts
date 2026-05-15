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
  dataType: DatasetPickerDataType
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
    id: 'ds_vision_sft_1',
    name: '图像理解-SFT-商品图文问答',
    latestVersion: 'V2',
    dataType: '训练数据集',
    dataUsage: '图像理解',
    dataFormat: 'ROLE_BASED',
    versions: [
      { id: 'v1', label: 'V1', charCount: 72_000, sampleCount: 480 },
      { id: 'v2', label: 'V2', charCount: 96_000, sampleCount: 640 },
    ],
  },
  {
    id: 'ds_vision_sft_2',
    name: '图像理解-SFT-文档截图解析',
    latestVersion: 'V1',
    dataType: '训练数据集',
    dataUsage: '图像理解',
    dataFormat: 'ROLE_BASED',
    versions: [{ id: 'v1', label: 'V1', charCount: 78_000, sampleCount: 420 }],
  },
  {
    id: 'ds_vision_sft_3',
    name: '图像理解-SFT-质检缺陷识别',
    latestVersion: 'V3',
    dataType: '训练数据集',
    dataUsage: '图像理解',
    dataFormat: 'ROLE_BASED',
    versions: [
      { id: 'v1', label: 'V1', charCount: 88_000, sampleCount: 720 },
      { id: 'v2', label: 'V2', charCount: 132_000, sampleCount: 1040 },
      { id: 'v3', label: 'V3', charCount: 156_000, sampleCount: 1280 },
    ],
  },
  {
    id: 'ds_vision_dpo_1',
    name: '图像理解-DPO-多模态偏好对',
    latestVersion: 'V1',
    dataType: '训练数据集',
    dataUsage: '图像理解',
    dataFormat: 'Chosen_Rejected',
    versions: [{ id: 'v1', label: 'V1', charCount: 72_000, sampleCount: 360 }],
  },
  {
    id: 'ds_vision_rft_1',
    name: '图像理解-RFT-PPO-视觉推理奖励集',
    latestVersion: 'V1',
    dataType: '训练数据集',
    dataUsage: '图像理解',
    dataFormat: 'Completion_Reward',
    versions: [{ id: 'v1', label: 'V1', charCount: 54_000, sampleCount: 260 }],
  },
  {
    id: 'ds_vision_rft_2',
    name: '图像理解-RFT-GRPO-图表推理集',
    latestVersion: 'V1',
    dataType: '训练数据集',
    dataUsage: '图像理解',
    dataFormat: 'Completion_Reward',
    versions: [{ id: 'v1', label: 'V1', charCount: 62_000, sampleCount: 300 }],
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
    id: 'ds_train_support_role_1',
    name: '训练-ROLE_BASED-客服意图识别',
    latestVersion: 'V2',
    dataType: '训练数据集',
    dataUsage: '文本生成',
    dataFormat: 'ROLE_BASED',
    versions: [
      { id: 'v1', label: 'V1', charCount: 620_000, sampleCount: 1650 },
      { id: 'v2', label: 'V2', charCount: 790_000, sampleCount: 2180 },
    ],
  },
  {
    id: 'ds_train_ops_pr_1',
    name: '训练-PROMPT_RESPONSE-运营问答',
    latestVersion: 'V1',
    dataType: '训练数据集',
    dataUsage: '文本生成',
    dataFormat: 'PROMPT_RESPONSE',
    versions: [{ id: 'v1', label: 'V1', charCount: 510_000, sampleCount: 1320 }],
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
    id: 'ds_val_pr_2',
    name: '验证-PROMPT_RESPONSE-金融问答',
    latestVersion: 'V2',
    dataType: '验证数据集',
    dataUsage: '文本生成',
    dataFormat: 'PROMPT_RESPONSE',
    versions: [
      { id: 'v1', label: 'V1', charCount: 105_000, sampleCount: 260 },
      { id: 'v2', label: 'V2', charCount: 132_000, sampleCount: 340 },
    ],
  },
  {
    id: 'ds_val_role_2',
    name: '验证-ROLE_BASED-多轮客服',
    latestVersion: 'V1',
    dataType: '验证数据集',
    dataUsage: '文本生成',
    dataFormat: 'ROLE_BASED',
    versions: [{ id: 'v1', label: 'V1', charCount: 118_000, sampleCount: 310 }],
  },
  {
    id: 'ds_val_vision_role_1',
    name: '验证-图像理解-商品识别',
    latestVersion: 'V1',
    dataType: '验证数据集',
    dataUsage: '图像理解',
    dataFormat: 'ROLE_BASED',
    versions: [{ id: 'v1', label: 'V1', charCount: 42_000, sampleCount: 180 }],
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
    id: 'ds_test_pr_1',
    name: '测试-PROMPT_RESPONSE-回归样本',
    latestVersion: 'V2',
    dataType: '测试数据集',
    dataUsage: '文本生成',
    dataFormat: 'PROMPT_RESPONSE',
    versions: [
      { id: 'v1', label: 'V1', charCount: 86_000, sampleCount: 360 },
      { id: 'v2', label: 'V2', charCount: 124_000, sampleCount: 520 },
    ],
  },
  {
    id: 'ds_test_role_2',
    name: '测试-ROLE_BASED-多轮对话',
    latestVersion: 'V1',
    dataType: '测试数据集',
    dataUsage: '文本生成',
    dataFormat: 'ROLE_BASED',
    versions: [{ id: 'v1', label: 'V1', charCount: 74_000, sampleCount: 295 }],
  },
  {
    id: 'ds_test_vision_role_1',
    name: '测试-图像理解-文档截图',
    latestVersion: 'V1',
    dataType: '测试数据集',
    dataUsage: '图像理解',
    dataFormat: 'ROLE_BASED',
    versions: [{ id: 'v1', label: 'V1', charCount: 36_000, sampleCount: 160 }],
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
    id: 'ds_grpo_reward_1',
    name: 'GRPO-Completion_Reward-推理增强集',
    latestVersion: 'V1',
    dataType: '训练数据集',
    dataUsage: '文本生成',
    dataFormat: 'Completion_Reward',
    versions: [
      { id: 'v1', label: 'V1', charCount: 420_000, sampleCount: 1050 },
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
    dataType: ds.dataType,
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
