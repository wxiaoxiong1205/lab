export interface AdaptedBaseModel {
  name: string
  provider: 'Qwen'
  modelType: 'text-generation' | 'image-understanding'
  description: string
}

export const ADAPTED_QWEN_BASE_MODELS: AdaptedBaseModel[] = [
  {
    name: 'Qwen2.5-0.5B-Instruct',
    provider: 'Qwen',
    modelType: 'text-generation',
    description: '轻量级文本生成指令模型，适合低资源微调验证。',
  },
  {
    name: 'Qwen2.5-7B-Instruct',
    provider: 'Qwen',
    modelType: 'text-generation',
    description: '通义千问 2.5 7B 指令模型，适合通用文本生成训练。',
  },
  {
    name: 'Qwen3-8B',
    provider: 'Qwen',
    modelType: 'text-generation',
    description: '通义千问 3 8B 基础模型，适合文本生成训练。',
  },
  {
    name: 'Qwen2-VL-2B-Instruct',
    provider: 'Qwen',
    modelType: 'image-understanding',
    description: '通义千问 2 VL 轻量视觉语言模型，适合图像理解训练验证。',
  },
  {
    name: 'Qwen2.5-VL-7B-Instruct',
    provider: 'Qwen',
    modelType: 'image-understanding',
    description: '通义千问 2.5 VL 视觉语言模型，适合图像理解训练。',
  },
  {
    name: 'Qwen3-VL-8B-Instruct',
    provider: 'Qwen',
    modelType: 'image-understanding',
    description: '通义千问 3 VL 视觉语言模型，适合图像理解训练。',
  },
  {
    name: 'Qwen3-VL-30B-A3B-Instruct',
    provider: 'Qwen',
    modelType: 'image-understanding',
    description: '通义千问 3 VL MoE 视觉语言模型，适合较高资源图像理解训练。',
  },
]

export const normalizeBaseModelName = (name?: string | null) =>
  (name || '').trim().toLowerCase()
