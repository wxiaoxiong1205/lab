/*
 * @Description: 模型评估相关接口
 */
import apiClient from './apiClient'
import type { MessagesItem } from '@/services/modelEvaluationServices.ts'

export type EvaluationDatasetType = 'text-generation' | 'image-understanding' | 'image-generation'
export type EvaluationDatasetFormat = 'prompt-response' | 'role-based' | 'prefix-suffix-middle' | 'image-prompt'

export interface EvaluationItem {
  key: string
  item_index: number
  model_name?: string
  system: string
  prompt: string
  standardAnswer: string
  modelResponse: string
  negativePrompt?: string
  metadata?: Record<string, unknown>
  generatedImages?: string[]
  referenceImages?: string[]
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
  negative_prompt?: string
  metadata?: Record<string, unknown>
  generated_images?: string[]
  reference_images?: string[]
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
  dataset_type: EvaluationDatasetType // 评估类别：文本生成/图像理解/图像生成评估
  data_source: 'existing' | 'new' // 数据来源：已有推理结果集/新建推理结果集
  evaluation_method?: 'referee' | 'manual' | 'all' // 评估方法：裁判员评估/基础指标评估/全部（创建人工评估任务时会被自动设置为 manual）
  data_format?: EvaluationDatasetFormat // 数据格式（可选）
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
  evaluation_method: 'referee' | 'basic_metric' | 'all' | 'manual' // 评估方法：裁判员评估/基础指标评估/全部/人工评估
  dataset_format?: EvaluationDatasetFormat // 数据格式（可选）
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
  dataset_type?: EvaluationDatasetType // 评估类别：文本生成/图像理解/图像生成评估
}

const demoImage = (label: string, bg: string, fg = '#ffffff') =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#111827"/></linearGradient></defs><rect width="640" height="420" fill="url(#g)"/><circle cx="500" cy="92" r="54" fill="rgba(255,255,255,.2)"/><rect x="64" y="236" width="512" height="92" rx="18" fill="rgba(255,255,255,.18)"/><text x="72" y="112" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="${fg}">${label}</text><text x="72" y="294" font-family="Arial, sans-serif" font-size="24" fill="${fg}">image-generation demo</text></svg>`)}`

const imageGenerationManualTasks: ProjectEvaluationTaskListItem[] = [
  {
    id: 99031,
    name: '图像生成海报人工评估',
    status: '未评估',
    progress: 35,
    inference_result_dataset_names: ['电商海报图像生成结果集'],
    evaluated_model_names: ['SeedDream-SFT-Poster', 'Qwen-Image-Service'],
    created_by: '产品演示',
    created_at: '2026-06-30T09:30:00',
  },
  {
    id: 99032,
    name: '图像生成商品图人工评估',
    status: '已完成',
    progress: 100,
    inference_result_dataset_names: ['商品场景图像生成结果集'],
    evaluated_model_names: ['SeedDream-SFT-Product'],
    created_by: '产品演示',
    created_at: '2026-06-29T16:10:00',
  },
  {
    id: 99033,
    name: '图像生成社媒配图人工评估',
    status: '未评估',
    progress: 20,
    inference_result_dataset_names: ['社媒营销图像生成结果集'],
    evaluated_model_names: ['Qwen-Image-Service', 'SeedDream-SFT-Poster'],
    created_by: '产品演示',
    created_at: '2026-06-30T13:40:00',
  },
  {
    id: 99034,
    name: '图像生成室内设计人工评估',
    status: '评估中',
    progress: 58,
    inference_result_dataset_names: ['室内设计图像生成结果集'],
    evaluated_model_names: ['SeedDream-SFT-Interior'],
    created_by: '产品演示',
    created_at: '2026-06-30T14:25:00',
  },
  {
    id: 99035,
    name: '图像生成角色插画人工评估',
    status: '已完成',
    progress: 100,
    inference_result_dataset_names: ['角色插画图像生成结果集'],
    evaluated_model_names: ['Qwen-Image-Service'],
    created_by: '产品演示',
    created_at: '2026-06-28T18:20:00',
  },
  {
    id: 99036,
    name: '图像生成包装视觉人工评估',
    status: '评估中',
    progress: 45,
    inference_result_dataset_names: ['包装视觉图像生成结果集'],
    evaluated_model_names: ['SeedDream-SFT-Packaging'],
    created_by: '产品演示',
    created_at: '2026-06-27T15:35:00',
  },
]

const buildImageGenerationManualTaskDetail = (taskId: number): ProjectEvaluationTaskDetail => {
  const task = imageGenerationManualTasks.find((item) => item.id === taskId) ?? imageGenerationManualTasks[0]
  return {
    id: task.id,
    name: task.name,
    description: task.id === 99034
      ? '评估室内设计图像生成结果的空间布局、风格一致性、家具比例和参考约束。'
      : task.id === 99035
        ? '评估角色插画图像生成结果的角色可爱度、造型稳定性和目标人群适配性。'
        : '评估图像生成模型在电商海报、商品图、社媒配图和包装视觉中的提示词匹配、画面质量与安全合规表现。',
    evaluation_type: 'comparison',
    data_source: 'existing',
    evaluation_method: 'manual',
    dataset_format: 'image-prompt',
    dataset_type: 'image-generation',
    sampling_rate: 100,
    status: task.status,
    progress: task.progress,
    dataset_model_relations: [
      { inference_result_dataset_id: 93031, sort_order: 0 },
      { inference_result_dataset_id: 93032, sort_order: 1 },
    ],
    evaluation_prompt_config: {
      metrics: [
        { name: '提示词匹配度', description: '生成图片是否准确体现 prompt 中的主体、风格和场景要求。', score_min: 0, score_max: 10, system_metric_id: null, metrics_mapping: { input: 'prompt', actual_output: 'generated_images', expected_output: 'images' }, score_definitions: '0-3 不匹配；4-6 部分匹配；7-10 高度匹配' },
        { name: '画面质量', description: '构图、清晰度、主体完整性和视觉表现是否稳定。', score_min: 0, score_max: 10, system_metric_id: null, metrics_mapping: { input: 'prompt', actual_output: 'generated_images' }, score_definitions: '0-3 质量差；4-6 可用；7-10 质量高' },
        { name: '细节一致性', description: '文字、颜色、材质、数量和约束条件是否与要求一致。', score_min: 0, score_max: 10, system_metric_id: null, metrics_mapping: { input: 'metadata', actual_output: 'generated_images' }, score_definitions: '0-3 明显冲突；4-6 有轻微偏差；7-10 细节一致' },
        { name: '安全合规', description: '是否避免违禁、侵权、低俗或不适宜内容。', score_min: 0, score_max: 10, system_metric_id: null, metrics_mapping: { input: 'negative_prompt', actual_output: 'generated_images' }, score_definitions: '0-3 风险高；4-6 需复核；7-10 安全' },
      ],
    },
    created_at: task.created_at,
    updated_at: task.created_at,
    created_by: task.created_by,
    inference_result_dataset_names: task.inference_result_dataset_names,
    evaluated_model_names: task.evaluated_model_names,
  }
}

const imageGenerationManualItems: EvaluationListResponse = {
  items: [
    {
      item_index: 1,
      content: [
        {
          system: '',
          prompt: '生成一张夏季新品运动水杯的电商海报，浅蓝背景，主体居中，包含水滴和冰块元素，画面干净高级。',
          negative_prompt: '低清晰度、文字错乱、主体变形、过度曝光',
          metadata: { scene: '电商海报', style: '写实', aspect_ratio: '3:2' },
          response: '<image>',
          model_response: '<image>',
          images: [demoImage('Reference Poster', '#2563eb'), demoImage('SeedDream Output', '#0f766e')],
          model_name: 'SeedDream-SFT-Poster',
          annotation: { status: '未评估', metrics: [] },
        },
        {
          system: '',
          prompt: '生成一张夏季新品运动水杯的电商海报，浅蓝背景，主体居中，包含水滴和冰块元素，画面干净高级。',
          negative_prompt: '低清晰度、文字错乱、主体变形、过度曝光',
          metadata: { scene: '电商海报', style: '写实', aspect_ratio: '3:2' },
          response: '<image>',
          model_response: '<image>',
          images: [demoImage('Reference Poster', '#2563eb'), demoImage('Qwen Image Output', '#7c3aed')],
          model_name: 'Qwen-Image-Service',
          annotation: { status: '未评估', metrics: [] },
        },
      ],
    },
    {
      item_index: 2,
      content: [
        {
          system: '',
          prompt: '生成一张无线耳机白底商品主图，产品 45 度角，保留金属高光和耳塞细节，不出现营销文字。',
          negative_prompt: '文字、水印、脏污背景、产品结构错误、阴影过重',
          metadata: { scene: '商品白底图', style: '商业摄影', aspect_ratio: '1:1' },
          response: '<image>',
          model_response: '<image>',
          images: [demoImage('Reference Product', '#64748b'), demoImage('Product Output', '#334155')],
          model_name: 'SeedDream-SFT-Product',
          annotation: {
            status: '已完成',
            metrics: [
              {
                model_name: 'SeedDream-SFT-Product',
                metric_scores: [
                  { metric_name: '提示词匹配度', scores: [{ score: 9, reason: '主体角度、白底和材质细节符合要求。' }] },
                  { metric_name: '画面质量', scores: [{ score: 8, reason: '商品轮廓清晰，局部阴影略重。' }] },
                  { metric_name: '细节一致性', scores: [{ score: 8, reason: '耳塞细节完整，没有明显结构错误。' }] },
                  { metric_name: '安全合规', scores: [{ score: 10, reason: '无品牌侵权和水印。' }] },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      item_index: 3,
      content: [
        {
          system: '',
          prompt: '生成一张露营咖啡品牌的小红书封面，暖色调，包含帐篷、咖啡杯、手写风标题留白。',
          negative_prompt: '错别字、真实品牌 Logo、人物脸部畸形、暗光噪点',
          metadata: { scene: '社媒配图', channel: '小红书', style: '生活方式摄影' },
          response: '<image>',
          model_response: '<image>',
          images: [demoImage('Reference Social', '#ea580c'), demoImage('Social Output', '#db2777')],
          model_name: 'Qwen-Image-Service',
          annotation: { status: '未评估', metrics: [] },
        },
        {
          system: '',
          prompt: '生成一张露营咖啡品牌的小红书封面，暖色调，包含帐篷、咖啡杯、手写风标题留白。',
          negative_prompt: '错别字、真实品牌 Logo、人物脸部畸形、暗光噪点',
          metadata: { scene: '社媒配图', channel: '小红书', style: '生活方式摄影' },
          response: '<image>',
          model_response: '<image>',
          images: [demoImage('Reference Social', '#ea580c'), demoImage('Poster Output', '#be123c')],
          model_name: 'SeedDream-SFT-Poster',
          annotation: { status: '未评估', metrics: [] },
        },
      ],
    },
    {
      item_index: 4,
      content: [
        {
          system: '',
          prompt: '生成一张新中式客厅室内设计图，浅色木纹地板，米白沙发，绿植点缀，窗边自然光。',
          negative_prompt: '空间畸变、家具漂浮、强透视错误、杂乱电线',
          metadata: { scene: '室内设计', style: '新中式', room: 'living_room' },
          response: '<image>',
          model_response: '<image>',
          images: [demoImage('Reference Room', '#b45309'), demoImage('Interior Output', '#166534')],
          model_name: 'SeedDream-SFT-Interior',
          annotation: { status: '未评估', metrics: [] },
        },
      ],
    },
    {
      item_index: 5,
      content: [
        {
          system: '',
          prompt: '生成一个面向儿童科普 App 的友好机器人角色，圆润造型，蓝绿色配色，透明背景。',
          negative_prompt: '恐怖、尖锐武器、成年人肖像、低龄不适宜元素',
          metadata: { scene: '角色设定', style: '儿童插画', transparent: true },
          response: '<image>',
          model_response: '<image>',
          images: [demoImage('Reference Character', '#0891b2'), demoImage('Character Output', '#0d9488')],
          model_name: 'Qwen-Image-Service',
          annotation: {
            status: '已完成',
            metrics: [
              {
                model_name: 'Qwen-Image-Service',
                metric_scores: [
                  { metric_name: '提示词匹配度', scores: [{ score: 8, reason: '机器人角色友好，蓝绿色配色明确。' }] },
                  { metric_name: '画面质量', scores: [{ score: 9, reason: '线条完整，角色轮廓清晰。' }] },
                  { metric_name: '细节一致性', scores: [{ score: 8, reason: '透明背景和儿童风格基本满足。' }] },
                  { metric_name: '安全合规', scores: [{ score: 10, reason: '无不适宜儿童元素。' }] },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      item_index: 6,
      content: [
        {
          system: '',
          prompt: '生成一张节日礼盒包装视觉，红金配色，包含礼带、烫金纹理和正面品牌留白区域。',
          negative_prompt: '品牌侵权、错别字、复杂人物、低清晰度',
          metadata: { scene: '包装设计', style: '节日礼盒', material: 'foil_stamping' },
          response: '<image>',
          model_response: '<image>',
          images: [demoImage('Reference Package', '#dc2626'), demoImage('Package Output', '#ca8a04')],
          model_name: 'SeedDream-SFT-Packaging',
          annotation: { status: '未评估', metrics: [] },
        },
      ],
    },
  ],
  total: 6,
  page: 1,
  size: 10,
  pages: 1,
  evalution_num: 8,
}

const imageGenerationAnnotationStats = {
  total_tasks: 6,
  completed_count: 2,
  unannotated_count: 4,
}

export const manualEvaluationServices = {
  /**
   * 获取人工评估任务列表
   */
  getManualEvaluationList: async (projectId: number, params?: { page?: number, size?: number, dataset_type?: EvaluationDatasetType }) => {
    try {
      const response = await apiClient.get<ProjectEvaluationTaskListResponse>(`/manual-evaluation-tasks/project/${projectId}/list`, {
        params: {
          page: params?.page || 1,
          size: params?.size || 10,
          dataset_type: params?.dataset_type,
        },
      })
      if (params?.dataset_type === 'image-generation' && (!response.data?.items || response.data.items.length === 0)) {
        return { items: imageGenerationManualTasks, total: imageGenerationManualTasks.length, page: params?.page || 1, size: params?.size || 10 }
      }
      return response.data
    }
    catch (error) {
      if (params?.dataset_type === 'image-generation') {
        return { items: imageGenerationManualTasks, total: imageGenerationManualTasks.length, page: params?.page || 1, size: params?.size || 10 }
      }
      throw error
    }
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
    if (imageGenerationManualTasks.some((task) => task.id === taskId)) {
      return imageGenerationManualItems
    }
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
    if (imageGenerationManualTasks.some((task) => task.id === taskId)) {
      return imageGenerationAnnotationStats
    }
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
    if (imageGenerationManualTasks.some((task) => task.id === taskId)) {
      return buildImageGenerationManualTaskDetail(taskId)
    }
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
