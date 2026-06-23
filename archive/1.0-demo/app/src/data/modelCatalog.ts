import type { BaseModelRecord } from '../types/shared'
import type { TrainingType } from '../types/training'

export const CUSTOM_MODEL_PROVIDER = '自定义'

export const modelProviderOptions = [
  { value: 'Qwen', label: 'Qwen' },
  { value: 'DeepSeek', label: 'DeepSeek' },
  { value: 'Llama', label: 'Llama' },
  { value: 'Mistral', label: 'Mistral' },
  { value: 'Baichuan', label: 'Baichuan' },
  { value: 'ChatGLM', label: 'ChatGLM' },
  { value: 'Yi', label: 'Yi' },
  { value: 'InternLM', label: 'InternLM' },
  { value: 'Hunyuan', label: 'Hunyuan' },
  { value: 'Kimi', label: 'Kimi' },
  { value: CUSTOM_MODEL_PROVIDER, label: CUSTOM_MODEL_PROVIDER },
]

export const knownModelProviders = modelProviderOptions
  .map(option => option.value)
  .filter(provider => provider !== CUSTOM_MODEL_PROVIDER)

export const mockBaseModelCatalog: BaseModelRecord[] = [
  { id: 'qwen-1', code: 'qwen2.5-7b-instruct', name: 'Qwen2.5-7B-Instruct', description: '通义千问2.5 7B指令微调模型', provider: 'Qwen', status: 'running', createdAt: '2026/01/15 08:00:00' },
  { id: 'qwen-2', code: 'qwen2-vl-2b-instruct', name: 'Qwen2-VL-2B-Instruct', description: '通义千问2 VL 2B视觉语言模型', provider: 'Qwen', status: 'stopped', createdAt: '2026/01/20 10:00:00' },
  { id: 'qwen-3', code: 'qwen3-8b', name: 'Qwen3-8B', description: '通义千问3 8B基础模型', provider: 'Qwen', status: 'stopped', createdAt: '2026/03/01 09:00:00' },
  { id: 'qwen-4', code: 'qwen2.5-0.5b-instruct', name: 'Qwen2.5-0.5B-Instruct', description: '轻量级指令模型', provider: 'Qwen', status: 'running', createdAt: '2026/03/06 09:00:00' },
  { id: 'qwen-5', code: 'qwen3-vl-8b-instruct', name: 'Qwen3-VL-8B-Instruct', description: '通义千问3视觉语言模型', provider: 'Qwen', status: 'running', createdAt: '2026/03/08 09:00:00' },
  { id: 'deepseek-1', code: 'deepseek-r1-7b', name: 'DeepSeek-R1-7B', description: 'DeepSeek 推理模型', provider: 'DeepSeek', status: 'stopped', createdAt: '2026/03/12 09:00:00' },
  { id: 'llama-1', code: 'llama-3.1-8b-instruct', name: 'Llama-3.1-8B-Instruct', description: 'Llama 3.1 指令模型', provider: 'Llama', status: 'stopped', createdAt: '2026/03/13 09:00:00' },
  { id: 'internvl-1', code: 'internvl2.5-8b', name: 'InternVL2.5-8B', description: 'InternVL 视觉语言模型', provider: 'InternLM', status: 'stopped', createdAt: '2026/03/14 09:00:00' },
]

const MODEL_CATALOG_STORAGE_KEY = 'deepexi.baseModelCatalog'

export function loadBaseModelCatalog(): BaseModelRecord[] {
  if (typeof window === 'undefined') {
    return mockBaseModelCatalog
  }

  const raw = window.localStorage.getItem(MODEL_CATALOG_STORAGE_KEY)
  if (!raw) {
    return mockBaseModelCatalog
  }

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return mockBaseModelCatalog
    }
    return parsed.filter(
      (item): item is BaseModelRecord =>
        Boolean(item?.id && item?.code && item?.name && item?.createdAt),
    )
  } catch {
    return mockBaseModelCatalog
  }
}

export function saveBaseModelCatalog(models: BaseModelRecord[]): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(MODEL_CATALOG_STORAGE_KEY, JSON.stringify(models))
}

export function getTrainingTypeFromModel(model: Pick<BaseModelRecord, 'code' | 'name'>): TrainingType {
  const text = `${model.code} ${model.name}`.toLowerCase()
  return /\bvl\b|vl-|internvl|vision|visual/.test(text) ? 'vision' : 'text'
}

export function isQwenProvider(provider?: string): boolean {
  return provider === 'Qwen'
}
