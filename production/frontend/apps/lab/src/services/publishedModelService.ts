import type { ModelSearchParams, PublishedModel } from '../types'

// Mock数据：用户已发布的模型列表
const mockPublishedModels: PublishedModel[] = [
  {
    id: 'model-001',
    name: 'ChatGLM-6B-Finance',
    description: '基于ChatGLM-6B微调的金融领域模型',
    model_type: 'text_generation',
    context_length: 8192,
    created_at: '2024-01-15T10:30:00Z',
    updated_at: '2024-01-20T15:45:00Z',
    version_count: 3,
    latest_version: 'v1.2.0',
  },
  {
    id: 'model-002',
    name: 'Qwen-7B-Medical',
    description: '基于Qwen-7B微调的医疗问答模型',
    model_type: 'text_generation',
    context_length: 4096,
    created_at: '2024-01-10T08:20:00Z',
    updated_at: '2024-01-25T12:30:00Z',
    version_count: 2,
    latest_version: 'v1.1.0',
  },
  {
    id: 'model-003',
    name: 'LLaMA2-13B-Code',
    description: '基于LLaMA2-13B微调的代码生成模型',
    model_type: 'text_generation',
    context_length: 8192,
    created_at: '2024-01-08T14:15:00Z',
    updated_at: '2024-01-28T16:20:00Z',
    version_count: 4,
    latest_version: 'v2.0.0',
  },
  {
    id: 'model-004',
    name: 'Baichuan2-7B-Legal',
    description: '基于Baichuan2-7B微调的法律咨询模型',
    model_type: 'text_generation',
    context_length: 4096,
    created_at: '2024-01-05T09:10:00Z',
    updated_at: '2024-01-30T11:25:00Z',
    version_count: 1,
    latest_version: 'v1.0.0',
  },
]

// 模拟API延迟
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 获取用户已发布的模型列表
 * @param params 查询参数
 * @returns 模型列表
 */
export const getPublishedModels = async (params: ModelSearchParams = {}): Promise<PublishedModel[]> => {
  await delay(300) // 模拟网络延迟

  let filteredModels = [...mockPublishedModels]

  // 根据搜索关键词过滤
  if (params.search) {
    const searchLower = params.search.toLowerCase()
    filteredModels = filteredModels.filter((model) =>
      model.name.toLowerCase().includes(searchLower)
      || model.description?.toLowerCase().includes(searchLower),
    )
  }

  // 根据模型类型过滤
  if (params.model_type) {
    filteredModels = filteredModels.filter((model) =>
      model.model_type === params.model_type,
    )
  }

  // 分页处理
  const skip = params.skip || 0
  const limit = params.limit || 10

  return filteredModels.slice(skip, skip + limit)
}

/**
 * 根据ID获取模型详情
 * @param modelId 模型ID
 * @returns 模型详情
 */
export const getPublishedModelById = async (modelId: string): Promise<PublishedModel | null> => {
  await delay(200)

  return mockPublishedModels.find((model) => model.id === modelId) || null
}

/**
 * 验证模型名称是否可用
 * @param modelName 模型名称
 * @returns 是否可用
 */
export const validateModelName = async (modelName: string): Promise<boolean> => {
  await delay(200)

  // 检查是否与已有模型重名
  const existingModel = mockPublishedModels.find((model) =>
    model.name.toLowerCase() === modelName.toLowerCase(),
  )

  return !existingModel
}

export default {
  getPublishedModels,
  getPublishedModelById,
  validateModelName,
}
