import apiClient from './apiClient'
import type { V115DatasetRef } from './dataInsightService'

export interface PromptDirectionConfig {
  direction: string
  sample_count: number
  enabled: boolean
  description?: string
}

export interface DataAugmentationTask {
  id: number
  name: string
  description?: string
  project_id: number
  source_dataset_id?: number
  source_dataset_name: string
  source_dataset_version: string
  source_dataset_usage: string
  output_dataset_name: string
  output_dataset_version?: string
  dataset_type: string
  training_method_type: string
  dataset_format: string
  status: string
  config?: Record<string, any>
  result_summary?: Record<string, any>
  result_samples?: { items?: any[], total?: number }
  error_message?: string
  created_at: string
  updated_at: string
  created_by?: string
  finished_at?: string
}

export interface DataAugmentationTaskPage {
  items: DataAugmentationTask[]
  total: number
  page: number
  size: number
}

export interface CreateDataAugmentationTaskRequest {
  name: string
  description?: string
  source_dataset: V115DatasetRef
  output_dataset_name: string
  output_dataset_version: string
  prompt_generation: {
    enabled: boolean
    service_type?: string
    service_id?: number
    service_name?: string
    scene_description?: string
    directions: PromptDirectionConfig[]
  }
  response_generation: {
    enabled: boolean
    target_scope: string
    output_format: string
    json_schema?: Record<string, unknown>
    service_type?: string
    service_id?: number
    service_name?: string
  }
}

const now = new Date().toISOString()
const defaultPromptDirections: PromptDirectionConfig[] = [
  { direction: '同类泛化', sample_count: 70, enabled: true, description: '问题类型不变，变换发生场景和业务情境' },
  { direction: '同义泛化', sample_count: 80, enabled: true, description: '保持原始语义不变，调整表达方式和措辞' },
  { direction: '增加约束', sample_count: 40, enabled: true, description: '补充时间、金额、权限、渠道等限制条件' },
  { direction: '复杂场景变换', sample_count: 45, enabled: true, description: '加入多条件、多角色或异常状态，提升样本覆盖度' },
  { direction: '前提条件变换', sample_count: 15, enabled: true, description: '改变订单状态、用户身份或业务前置条件' },
]
const fallbackAugmentationTasks: DataAugmentationTask[] = [
  {
    id: 92001,
    name: '电商评论情感增强',
    project_id: 0,
    source_dataset_name: '电商评论情感',
    source_dataset_version: 'V1',
    source_dataset_usage: 'training',
    output_dataset_name: '电商评论情感增强',
    output_dataset_version: 'V1',
    dataset_type: 'text-generation',
    training_method_type: 'sft',
    dataset_format: 'prompt-response',
    status: 'completed',
    config: {
      prompt_generation: {
        enabled: true,
        service_type: 'deployment',
        service_name: 'Qwen2.5-7B-Instruct-部署服务',
        scene_description: '电商评论情感分类与客服回复样本增强',
        directions: defaultPromptDirections,
      },
      response_generation: { enabled: true, target_scope: 'missing-only', output_format: 'text' },
    },
    result_summary: {
      source_samples: 120,
      generated_prompt_samples: 250,
      generated_response_samples: 30,
      total_output_samples: 370,
      recommended_next_step: '进入数据洞察，筛除语义偏离、格式错误和重复样本后再保存为训练数据集。',
    },
    result_samples: {
      total: 6,
      items: [
        {
          row_number: 1,
          source_prompt: '用户说商品质量很好，物流也快，请判断情感倾向。',
          generated_prompt: '用户评价商品做工细致，配送速度超预期，请判断情感倾向。',
          generated_response: '正向',
          direction: '同义泛化',
          quality_flags: [],
        },
        {
          row_number: 2,
          source_prompt: '用户反馈包装破损但商品可用，该如何回复？',
          generated_prompt: '用户收到包裹时外包装有明显破损，但商品本体未受影响，请生成客服回复。',
          generated_response: '建议先表达歉意，说明可保留凭证并提供补偿或换货路径。',
          direction: '复杂场景变换',
          quality_flags: ['建议人工复核'],
        },
      ],
    },
    created_at: now,
    updated_at: now,
    created_by: 'system',
    finished_at: now,
  },
  {
    id: 92002,
    name: '客服问答 Prompt 泛化增强',
    project_id: 0,
    source_dataset_name: 'showcase-数据增强源SFT',
    source_dataset_version: 'V1',
    source_dataset_usage: 'training',
    output_dataset_name: '训练数据集/showcase-数据增强源SFT-V2',
    output_dataset_version: 'V2',
    dataset_type: 'text-generation',
    training_method_type: 'sft',
    dataset_format: 'prompt-response',
    status: 'running',
    config: {
      prompt_generation: {
        enabled: true,
        service_type: 'deployment',
        service_name: 'Qwen2.5-7B-Instruct-部署服务',
        directions: [
          { direction: '同义泛化', sample_count: 120, enabled: true, description: '保持语义不变，改写表达方式' },
          { direction: '复杂场景变换', sample_count: 80, enabled: true, description: '加入多条件售后咨询场景' },
        ],
      },
      response_generation: { enabled: false, target_scope: 'missing-only', output_format: 'text' },
    },
    result_summary: {
      source_samples: 80,
      generated_prompt_samples: 126,
      generated_response_samples: 0,
      total_output_samples: 206,
      recommended_next_step: '任务完成后进入数据洞察检查重复样本和语义偏移。',
    },
    result_samples: {
      total: 4,
      items: [
        {
          row_number: 1,
          source_prompt: '用户想取消订单但已发货，客服如何处理？',
          generated_prompt: '订单已经出库且物流揽收，用户仍要求取消订单，请生成客服处理建议。',
          generated_response: '-',
          direction: '复杂场景变换',
          quality_flags: ['等待 Response 生成'],
        },
        {
          row_number: 2,
          source_prompt: '会员积分不到账怎么办？',
          generated_prompt: '用户完成支付后会员积分未实时到账，请说明排查步骤。',
          generated_response: '-',
          direction: '同义泛化',
          quality_flags: [],
        },
      ],
    },
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
  {
    id: 92003,
    name: '知识库问答 Response 补全',
    project_id: 0,
    source_dataset_name: 'showcase-多轮对话洞察SFT',
    source_dataset_version: 'V2',
    source_dataset_usage: 'training',
    output_dataset_name: '训练数据集/showcase-多轮对话洞察SFT-V3',
    output_dataset_version: 'V3',
    dataset_type: 'text-generation',
    training_method_type: 'sft',
    dataset_format: 'role-based',
    status: 'failed',
    config: {
      prompt_generation: { enabled: false, directions: [] },
      response_generation: {
        enabled: true,
        service_type: 'online_inference',
        service_name: '知识库问答在线推理',
        target_scope: 'missing-only',
        output_format: 'json-object',
      },
    },
    result_summary: {
      source_samples: 64,
      generated_prompt_samples: 0,
      generated_response_samples: 18,
      total_output_samples: 82,
      recommended_next_step: '修复服务调用失败样本后重新运行增强。',
    },
    result_samples: {
      total: 5,
      items: [
        {
          row_number: 1,
          source_prompt: '企业知识库如何配置权限？',
          generated_prompt: '企业知识库如何配置权限？',
          generated_response: '进入知识库管理页，选择目标空间后配置成员角色和可见范围。',
          direction: 'Response 生成',
          quality_flags: [],
        },
        {
          row_number: 2,
          source_prompt: '如何导出项目报告？',
          generated_prompt: '如何导出项目报告？',
          generated_response: '',
          direction: 'Response 生成',
          quality_flags: ['生成失败'],
        },
      ],
    },
    error_message: '在线推理服务超时，18 条样本已生成，6 条样本失败。',
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
]

function isLocalPreviewEnabled() {
  return import.meta.env.VITE_SHOWCASE_PREVIEW === 'true' || import.meta.env.VITE_LOCAL_PREVIEW === 'true'
}

function shouldUseShowcaseFallback(projectId: number) {
  return projectId === 1001 || isLocalPreviewEnabled()
}

function mergeFallbackTasks(pageData: DataAugmentationTaskPage, params?: { name?: string, status?: string, page?: number, size?: number }): DataAugmentationTaskPage {
  const existingIds = new Set((pageData.items || []).map((item) => item.id))
  const merged = [
    ...(pageData.items || []),
    ...fallbackAugmentationTasks.filter((item) => !existingIds.has(item.id)),
  ].filter((item) => {
    const matchName = !params?.name || item.name.includes(params.name) || item.source_dataset_name.includes(params.name)
    const matchStatus = !params?.status || item.status === params.status
    return matchName && matchStatus
  })
  const page = params?.page ?? pageData.page ?? 1
  const size = params?.size ?? pageData.size ?? 10
  return {
    ...pageData,
    items: merged.slice((page - 1) * size, page * size),
    total: Math.max(pageData.total || 0, merged.length),
    page,
    size,
  }
}

function completePromptDirections(task: DataAugmentationTask): DataAugmentationTask {
  const existingDirections = task.config?.prompt_generation?.directions
  if (Array.isArray(existingDirections) && existingDirections.length > 0) {
    return task
  }

  const fallbackTask = fallbackAugmentationTasks.find((item) => item.id === task.id)
  const fallbackDirections = fallbackTask?.config?.prompt_generation?.directions
  const sampleDirections = Array.from(new Set((task.result_samples?.items || [])
    .map(item => item?.direction)
    .filter((value): value is string => Boolean(value) && value !== 'Response 生成')))

  const directions = Array.isArray(fallbackDirections) && fallbackDirections.length > 0
    ? fallbackDirections
    : sampleDirections.map(direction => ({
        direction,
        sample_count: (task.result_samples?.items || []).filter(item => item?.direction === direction).length,
        enabled: true,
        description: '根据增强样本明细自动汇总的 Prompt 增强方向',
      }))

  if (!directions.length) {
    return task
  }

  return {
    ...task,
    config: {
      ...(task.config || {}),
      prompt_generation: {
        ...(task.config?.prompt_generation || {}),
        enabled: task.config?.prompt_generation?.enabled ?? true,
        directions,
      },
    },
  }
}

export const dataAugmentationService = {
  list: async (projectId: number, params?: { name?: string, status?: string, page?: number, size?: number }): Promise<DataAugmentationTaskPage> => {
    try {
      const response = await apiClient.get<DataAugmentationTaskPage>(`/data-augmentations/project/${projectId}/tasks`, { params })
      return shouldUseShowcaseFallback(projectId) ? mergeFallbackTasks(response.data, params) : response.data
    }
    catch (error) {
      if (!shouldUseShowcaseFallback(projectId)) throw error
      return mergeFallbackTasks({ items: [], total: 0, page: params?.page ?? 1, size: params?.size ?? 10 }, params)
    }
  },
  create: async (projectId: number, data: CreateDataAugmentationTaskRequest): Promise<DataAugmentationTask> => {
    const response = await apiClient.post<DataAugmentationTask>(`/data-augmentations/project/${projectId}/tasks`, data)
    return response.data
  },
  detail: async (projectId: number, taskId: number): Promise<DataAugmentationTask> => {
    const fallbackTask = fallbackAugmentationTasks.find((item) => item.id === taskId)
    try {
      const response = await apiClient.get<DataAugmentationTask>(`/data-augmentations/project/${projectId}/tasks/${taskId}`)
      if (shouldUseShowcaseFallback(projectId) && !response.data?.id) {
        return fallbackTask || fallbackAugmentationTasks[0]
      }
      return completePromptDirections(response.data)
    }
    catch (error) {
      if (!shouldUseShowcaseFallback(projectId)) throw error
      return completePromptDirections(fallbackTask || fallbackAugmentationTasks[0])
    }
  },
  delete: async (projectId: number, taskId: number) => {
    await apiClient.delete(`/data-augmentations/project/${projectId}/tasks/${taskId}`)
  },
}
