/*
 * @Description: 模型评估相关接口
 */
import apiClient from './apiClient'
import type { MessagesItem } from '@/services/modelEvaluationServices.ts'

export interface EvaluationItem {
  key: string
  item_index: number
  model_name?: string
  system: string
  prompt: string
  standardAnswer: string
  modelResponse: string
  // 动态指标：使用指标名称作为 key，值为 { score: number, reason: string }
  metrics: Record<string, { score: number, reason: string }>
  comment: string
  status: '未评估' | '已完成'
  // 存储原始数据用于后续提交
  originalData?: any
  images?: string[] // 图片路径数组
  baseUrl?: string // 图片基地址
}

// 接口返回的数据类型
export interface AnnotationMetricScore {
  score: number
  reason: string
}

export interface AnnotationMetric {
  metric_name: string
  scores: AnnotationMetricScore[]
}

export interface AnnotationMetricItem {
  model_name: string
  metric_scores: AnnotationMetric[]
}

export interface Annotation {
  status: string
  metrics: AnnotationMetricItem[]
  annotated_at?: string
  annotated_by?: string
}

export interface EvaluationListItem {
  item_index: number
  content: EvaluationContent[]
}

export type EvaluationContent = {
  system: string
  prompt: string
  model_response: string
  annotation?: Annotation
  response: string
  model_name?: string
  images?: string[]
  messages?: MessagesItem[]
  base_url?: string
}

export interface EvaluationListResponse {
  items: EvaluationListItem[]
  total: number
  page: number
  size: number
  pages: number
  evalution_num?: number
}

/**
 * 显卡资源配置
 */
export interface GraphicsCardResource {
  card_type: string // 卡类型，如 "GPU"
  card_model: string // 卡型号，如 "A100", "A800"
  count: number // 数量
  card_memory: string // 显存，如 "80GB"
  k8s_resource_type: string // K8s资源类型，如 "nvidia.com/gpu"
}

/**
 * 推理参数配置
 */
export interface InferenceParams {
  temperature: number // 温度参数
  top_p: number // Top-p采样参数
  max_tokens: number // 最大token数
  presence_penalty: number // 存在惩罚
}

/**
 * 数据集与模型关联（已有推理结果集）
 */
export interface ExistingDatasetModelRelation {
  inference_result_dataset_id: number // 推理结果集ID
  evaluated_model_id?: number // 被评估的模型ID（可选，选择已有推理结果集时不需要）
  evaluated_model_name?: string // 被评估的模型名称（可选，选择已有推理结果集时不需要）
  sort_order: number // 排序（按照选择的数据集先后顺序）
}

/**
 * 数据集与模型关联（新建推理结果集）
 */
export interface NewDatasetModelRelation {
  evaluated_model_id: number // 被评估的模型ID
  evaluated_model_name: string // 被评估的模型名称
  sort_order: number // 排序
  inference_method: string // 推理方法，如 "online"
  model_id: number // 模型ID
  model_name: string // 模型名称
  online_service_id: number // 待推理服务ID
  online_service_name?: string // 待推理服务名称
  inference_params: InferenceParams // 推理参数
  dataset_name: string // 数据集名称
  dataset_description: string // 数据集描述
  source_dataset_id: number // 源数据集ID
  source_dataset_name: string // 源数据集名称
  graphics_card_resource?: GraphicsCardResource // 显卡资源配置
}

/**
 * 数据集与模型关联（联合类型）
 */
export type DatasetModelRelation = ExistingDatasetModelRelation | NewDatasetModelRelation

/**
 * 评估指标配置
 */
export interface EvaluationMetricConfig {
  name: string // 指标名称
  description: string // 指标描述
  system_metric_id?: number | null // 系统指标ID（可选）
  metrics_mapping?: {
    input?: string // 输入字段（如 "Prompt"）
    actual_output?: string // 实际输出字段（如 "Model Response"）
    expected_output?: string // 期望输出字段（如 "Standard Response"）
    retrieval_context?: string // 召回上下文字段
  } | null // 字段映射（可选）
  score_min: number // 最小分值
  score_max: number // 最大分值
  score_definitions?: string // 指标分值定义（描述分值的含义和说明）
}

/**
 * 评估提示词配置（裁判员评估）
 */
export interface EvaluationPromptConfig {
  metrics: EvaluationMetricConfig[] // 评估指标列表
  prompt_template?: string // Prompt模板
}

/**
 * 创建项目评估任务参数
 */
export interface CreateManualEvaluationTaskParams {
  name: string // 任务名称
  description?: string // 任务描述
  evaluation_type: 'single' | 'comparison' // 评估类型：单个评估/对比评估
  dataset_type: 'text-generation' | 'image-understanding' // 评估类别：文本生成/图像理解评估
  data_source: 'existing' | 'new' // 数据来源：已有推理结果集/新建推理结果集
  evaluation_method?: 'referee' | 'manual' | 'all' // 评估方法：裁判员评估/基础指标评估/全部（创建人工评估任务时会被自动设置为 manual）
  data_format?: 'prompt-response' | 'role-based' | 'prefix-suffix-middle' // 数据格式（可选）
  dataset_model_relations: DatasetModelRelation[] // 推理结果集与模型关联
  sampling_rate: number | null // 数据采样率（0-100），null表示不采样
  referee_model_id?: number | null // 裁判员模型ID
  referee_type?: 'service' | 'model' // 裁判员类型：在线服务/离线模型
  graphics_card_resource?: GraphicsCardResource // 显卡资源配置（使用离线裁判模型时需要）
  evaluation_prompt_config?: EvaluationPromptConfig // 评估提示词配置（人工评估时使用）
  referee_inference_params?: InferenceParams // 裁判员推理参数配置（裁判员评估时使用）
  id?: number // 重新评估时的原任务ID
}

// 人工评估任务状态类型
export type ManualEvaluationTaskStatus = '未评估' | '评估中' | '报告生成中' | '创建' | '已完成'

/**
 * 项目评估任务列表项
 */
export interface ProjectEvaluationTaskListItem {
  id: number // 任务ID
  name?: string // 任务名称
  task_name?: string // 任务名称（兼容字段）
  status?: ManualEvaluationTaskStatus // 任务状态
  push_result_set?: string // 推送结果集（兼容字段）
  inference_result?: string // 推理结果（兼容字段）
  evaluated_model_names?: string[] // 待评估模型名称列表
  evaluation_method?: string // 评估方法
  created_by?: string // 创建人
  creator?: string // 创建人（兼容字段）
  created_at?: string // 创建时间
  create_time?: string // 创建时间（兼容字段）
  running_time?: number // 运行时长
  progress?: number // 评估进度
  inference_result_dataset_names?: string[] // 推理结果集名称列表
  started_at?: string | null // 开始时间
  finished_at?: string | null // 结束时间
}

/**
 * 项目评估任务列表响应
 */
export interface ProjectEvaluationTaskListResponse {
  items: ProjectEvaluationTaskListItem[] // 任务列表
  total: number // 总记录数
  page?: number // 当前页码
  size?: number // 每页数量
}

/**
 * 更新人工评估项参数
 */
export interface UpdateEvaluationItemMetric {
  metric_name: string
  score: number
  reason: string
}

export interface UpdateEvaluationItemModelMetrics {
  metrics: UpdateEvaluationItemMetric[]
}

export interface UpdateEvaluationItem {
  item_index: number
  model_metrics: UpdateEvaluationItemModelMetrics[]
}

export interface UpdateEvaluationItemParams {
  items: UpdateEvaluationItem[]
}

/**
 * 项目评估任务详情
 */
export interface ProjectEvaluationTaskDetail {
  id: number // 任务ID
  name: string // 任务名称
  description?: string // 任务描述
  evaluation_type: 'single' | 'comparison' // 评估类型：单个评估/对比评估
  data_source: 'existing' | 'new' // 数据来源：已有推理结果集/新建推理结果集
  evaluation_method: 'referee' | 'basic_metric' | 'all' // 评估方法：裁判员评估/基础指标评估/全部
  dataset_format?: 'prompt-response' | 'role-based' | 'prefix-suffix-middle' // 数据格式（可选）
  sampling_rate?: number | null // 数据采样率（0-100），null表示不采样
  status?: ManualEvaluationTaskStatus // 任务状态
  progress?: number // 评估进度
  dataset_model_relations: DatasetModelRelation[] // 推理结果集与模型关联
  referee_model_id?: number | null // 裁判员模型ID
  referee_type?: 'service' | 'model' // 裁判员类型：在线服务/离线模型
  referee_model_name?: string // 裁判员模型名称
  graphics_card_resource?: GraphicsCardResource // 显卡资源配置（使用离线裁判模型时需要）
  evaluation_prompt_config?: EvaluationPromptConfig // 评估提示词配置（裁判员评估时使用）
  referee_inference_params?: InferenceParams // 裁判员推理参数配置（裁判员评估时使用）
  created_at?: string // 创建时间
  updated_at?: string // 更新时间
  created_by?: string // 创建人
  running_time?: number // 运行时长
  inference_result_dataset_names?: string[] // 推理结果集名称列表
  evaluated_model_names?: string[] // 待评估模型名称列表
  dataset_type?: 'text-generation' | 'image-understanding' // 评估类别：文本生成/图像理解评估
}

export const manualEvaluationServices = {
  /**
   * 获取人工评估任务列表
   */
  getManualEvaluationList: async (projectId: number, params?: { page?: number, size?: number, dataset_type?: 'text-generation' | 'image-understanding' }) => {
    const response = await apiClient.get<ProjectEvaluationTaskListResponse>(`/manual-evaluation-tasks/project/${projectId}/list`, {
      params: {
        page: params?.page || 1,
        size: params?.size || 10,
        dataset_type: params?.dataset_type,
      },
    })
    return response.data
  },

  /**
   * 创建人工评估任务
   * @param projectId 项目ID
   * @param params 创建参数
   * @returns Promise<创建后的任务详情>
   */
  createManualEvaluationTask: async (projectId: number, params: CreateManualEvaluationTaskParams) => {
    const response = await apiClient.post(`/manual-evaluation-tasks/project/${projectId}/create`, params)
    return response.data
  },

  // 分页查询人工评估项列表
  getQueryEvaluationList: async (projectId: number, taskId: number, params?: { page?: number, size?: number, status?: string }) => {
    const response = await apiClient.get<EvaluationListResponse>(`/manual-evaluation-tasks/project/${projectId}/task/${taskId}/items`, {
      params: {
        page: params?.page || 1,
        size: params?.size || 50,
        status: params?.status || 'all', // all 全部，'未标注' 未标注，'标注完成' 标注完成
      },
    })
    return response.data
  },

  // 批量更新人工评估项评分
  updateEvaluationItem: async (projectId: number, taskId: number, params: UpdateEvaluationItemParams) => {
    const response = await apiClient.put(`/manual-evaluation-tasks/project/${projectId}/task/${taskId}/items/batch-update`, params)
    return response.data
  },

  // 获取人工评估标注统计信息
  getAnnotationInformation: async (projectId: number, taskId: number) => {
    const response = await apiClient.get(`/manual-evaluation-tasks/project/${projectId}/task/${taskId}/annotation-stats`)
    return response.data
  },

  /**
   * 获取人工评估任务基础详情信息
   * @param projectId 项目ID
   * @param taskId 任务ID
   * @returns Promise<评估任务详情>
   */
  getManualEvaluationTaskDetail: async (projectId: number, taskId: number) => {
    const response = await apiClient.get<ProjectEvaluationTaskDetail>(
      `/manual-evaluation-tasks/project/${projectId}/task/${taskId}`,
    )
    return response.data
  },

  /**
   * 删除人工评估任务
   * @param projectId 项目ID
   * @param taskId 任务ID
   * @returns Promise<void>
   */
  deleteManualEvaluationTask: async (projectId: number, taskId: number) => {
    const response = await apiClient.delete(`/manual-evaluation-tasks/project/${projectId}/task/${taskId}`)
    return response.data
  },

  /**
   * 提交人工评估任务
   * @param projectId 项目ID
   * @param taskId 任务ID
   * @returns Promise<void>
   */
  submitManualEvaluationTask: async (projectId: number, taskId: number) => {
    const response = await apiClient.post(`/manual-evaluation-tasks/project/${projectId}/task/${taskId}/submit`)
    return response.data
  },

  /**
   * 下载评估任务结果
   * @param projectId 项目ID
   * @param taskId 任务ID
   * @param format 下载格式（json/jsonl/csv/xlsx，默认jsonl）
   * @returns Promise<{ data: Blob, headers: any }> 文件 Blob 对象和响应头
   * 从JSONL文件读取数据，转换为Excel、CSV、JSON格式并下载。
   * 查询参数 format: 下载格式（excel/csv/json，默认excel）
   * 返回文件流，Content-Type根据格式自动设置
   * Excel格式：application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
   */
  downloadProjectEvaluationTaskResults: async (
    projectId: number,
    taskId: number,
    format: 'json' | 'jsonl' | 'csv' | 'xlsx' = 'jsonl',
  ) => {
    const response = await apiClient.get(
      `/manual-evaluation-tasks/project/${projectId}/task/${taskId}/download`,
      {
        params: {
          format,
        },
        responseType: 'blob', // 设置为 blob 类型以处理文件下载
      },
    )
    return { data: response.data, headers: response.headers }
  },
}
