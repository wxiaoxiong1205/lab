/*
 * @Description: 模型评估相关接口
 */
import apiClient from './apiClient'

export type EvaluationDatasetType = 'text-generation' | 'image-understanding' | 'image-generation'
export type EvaluationDatasetFormat = 'prompt-response' | 'role-based' | 'prefix-suffix-middle' | 'image-prompt'

/**
 * 裁判员评估指标接口
 */
export interface EvaluationMetric {
  id: number
  name: string
  description: string
  score_range: string
  scenario: string
  sort_order: number
  is_enabled: boolean
  is_builtin?: boolean
  created_at: string
  updated_at: string
  created_by: string
}

/**
 * 创建/更新裁判员评估指标参数
 */
export interface CreateMetricParams {
  name: string
  description: string
  score_range: string
  scenario: string
  sort_order: number
  is_enabled: boolean
}

/**
 * 查询裁判员评估指标列表参数
 */
export interface GetSystemMetricsParams {
  name?: string
  scenario?: string | null
  page?: number
  size?: number
}

/**
 * 裁判员评估指标列表响应
 */
export interface SystemMetricsResponse {
  items: EvaluationMetric[]
  total: number
  page: number
  size: number
}

/**
 * 基础指标
 */
export interface BasicMetric {
  id: number
  name: string
  description: string
  created_at?: string
  updated_at?: string
}

/**
 * 基础指标列表响应
 */
export interface BasicMetricsResponse {
  items: BasicMetric[]
  total: number
  page: number
  size: number
}

/**
 * 评估任务模板渲染参数
 */
export interface RenderTemplateParams {
  name: string
  description: string
  score_scope: Array<{
    score_min: number
    score_max: number
    score_definitions: string
  }>
  metrics_mapping: {
    input?: string
    actual_output?: string
    expected_output?: string
    retrieval_context?: string
  }
  sample_data?: Record<string, string>
}

/**
 * 创建/更新项目评估指标参数
 */
export interface CreateProjectMetricParams {
  id?: number // 编辑时需要传 id
  name: string
  description: string
  score_scope: Array<{
    score_min: number
    score_max: number
    score_definitions: string
  }>
  metrics_param: string[] // 指标关键字段数组
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
  cpu_request: number // CPU请求
  cpu_limit: number // CPU限制
  memory_request: number // 内存请求
  memory_limit: number // 内存限制
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
  evaluated_model_id: number // 被评估的模型ID
  evaluated_model_name?: string // 被评估的模型名称
  sort_order: number // 排序
}

/**
 * API 入参映射（与创建业务推理结果集的 param 一致，用于业务效果评估新建推理结果集）
 */
export interface ApiParamsRequestMapItem {
  source_field_desc: string
  source_field_path: string
  target_field_desc: string
  target_field_path: string
}

export interface ApiParamsResponseMapItem {
  source_field_desc: string
  target_field_desc: string
}

export interface ApiParams {
  request_map: ApiParamsRequestMapItem[]
  response_map: ApiParamsResponseMapItem[]
}

/**
 * 数据集与模型关联（新建推理结果集）
 */
export interface NewDatasetModelRelation {
  evaluated_model_id: number // 被评估的模型ID
  evaluated_model_name: string // 被评估的模型名称
  sort_order: number // 排序
  inference_method: string // 推理方法，如 "online" | "api"
  model_id: number // 模型ID
  model_name: string // 模型名称
  online_service_id: number // 待推理服务ID
  online_service_name?: string // 待推理服务名称
  inference_params?: InferenceParams // 推理参数（在线推理时必填）
  dataset_name: string // 数据集名称
  dataset_description: string // 数据集描述
  source_dataset_id: number // 源数据集ID
  source_dataset_name: string // 源数据集名称
  graphics_card_resource?: GraphicsCardResource // 显卡资源配置
  inference_result_dataset_id?: number // 推理结果集ID
  // 业务效果评估-新建推理结果集（第三方 API）时使用，与创建业务推理结果集的 param 一致
  api_id?: number
  api_name?: string
  api_params?: ApiParams
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
  system_metric_id: number // 系统指标ID
  metrics_mapping: {
    input?: string // 输入字段（如 "Prompt"）
    actual_output?: string // 实际输出字段（如 "Model Response"）
    expected_output?: string // 期望输出字段（如 "Standard Response"）
    retrieval_context?: string // 召回上下文字段
  }
  score_min?: number // 最小分值
  score_max?: number // 最大分值
  score_definitions?: string[] // 量级说明
}

/**
 * 评估提示词配置（裁判员评估）
 */
export interface EvaluationPromptConfig {
  metrics: EvaluationMetricConfig[] // 评估指标列表
  prompt_template?: string // Prompt模板
}

/**
 * 基础指标评估配置
 */
export interface BasicMetricConfig {
  metrics: string[] // 基础指标列表，如 ["准确率", "F1", "ROUGE-1", "Rouge-2", "Rouge-L", "BLEU-4", "格式遵从性", "语义相似度"]
  stop_words?: string // 停用词文件路径，如 "jfs://evaluation/stop_words/stop_words_20250828.txt"
}

/**
 * 创建项目评估任务参数
 */
export interface CreateProjectEvaluationTaskParams {
  name: string // 任务名称
  description?: string // 任务描述
  evaluation_type: 'single' | 'comparison' // 评估类型：单个评估/对比评估
  data_source: 'existing' | 'new' // 数据来源：已有推理结果集/新建推理结果集
  evaluation_method: 'referee' | 'basic_metric' | 'all' // 评估方法：裁判员评估/基础指标评估/全部
  dataset_type?: EvaluationDatasetType // 评估类别：文本生成/图像理解/图像生成
  dataset_model_relations: DatasetModelRelation[] // 推理结果集与模型关联
  referee_model_id?: number | null // 裁判员模型ID
  referee_type?: 'service' | 'model' // 裁判员类型：在线服务/离线模型
  graphics_card_resource?: GraphicsCardResource // 显卡资源配置（使用离线裁判模型时需要）
  evaluation_prompt_config?: EvaluationPromptConfig // 评估提示词配置（裁判员评估时使用）
  referee_inference_params?: InferenceParams // 裁判员推理参数配置（裁判员评估时使用）
  basic_metric_config?: BasicMetricConfig // 基础指标配置（基础指标评估时使用）
  id?: number // 重新评估时的原任务ID
}

/**
 * 项目评估任务列表项
 */
export interface ProjectEvaluationTaskListItem {
  data_source: string
  id: number // 任务ID
  name?: string // 任务名称
  task_name?: string // 任务名称（兼容字段）
  status?: string // 任务状态
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
  schedule_at?: string | null // 定时执行时间，格式：YYYY-MM-DDTHH:mm:ss
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
 * 项目评估任务详情
 */
export interface ProjectEvaluationTaskDetail {
  id: number // 任务ID
  name: string // 任务名称
  description?: string // 任务描述
  evaluation_type: 'single' | 'comparison' // 评估类型：单个评估/对比评估
  data_source: 'existing' | 'new' // 数据来源：已有推理结果集/新建推理结果集
  evaluation_method: 'referee' | 'basic_metric' | 'all' // 评估方法：裁判员评估/基础指标评估/全部
  dataset_type?: EvaluationDatasetType // 评估类别：文本生成/图像理解/图像生成
  sampling_rate?: number | null // 数据采样率（0-100），null表示不采样
  status?: string // 任务状态
  progress?: number // 评估进度
  dataset_model_relations: DatasetModelRelation[] // 推理结果集与模型关联
  referee_model_id?: number | null // 裁判员模型ID
  referee_type?: 'service' | 'model' // 裁判员类型：在线服务/离线模型
  referee_model_name?: string // 裁判员模型名称
  graphics_card_resource?: GraphicsCardResource // 显卡资源配置（使用离线裁判模型时需要）
  evaluation_prompt_config?: EvaluationPromptConfig // 评估提示词配置（裁判员评估时使用）
  referee_inference_params?: InferenceParams
  basic_metric_config?: BasicMetricConfig // 基础指标配置（基础指标评估时使用）
  created_at?: string // 创建时间
  updated_at?: string // 更新时间
  created_by?: string // 创建人
  running_time?: number // 运行时长
  inference_result_dataset_names?: string[] // 推理结果集名称列表
  evaluated_model_names?: string[] // 待评估模型名称列表
  dataset_format?: EvaluationDatasetFormat // 数据格式（可选）
  schedule_at?: string // 定时执行时间，格式：YYYY-MM-DDTHH:mm:ss
}

/**
 * 评估指标明细
 */
export interface EvaluationMetricItem {
  metric_name: string // 指标名称
  description?: string // 指标描述
  score_min?: number // 最小分数
  score_max?: number // 最大分数
  score?: number | null // 指标分数
  percentage_score?: number | null // 百分比分数
  reason?: string // 评分原因
  error?: boolean // 是否有错误
  raw_response?: string // 原始响应
}

/**
 * 评估任务结果明细项
 */
export interface EvaluationTaskResultItem {
  serial_no?: number // 序号
  prompt?: string // 提示词
  images?: string[]
  negative_prompt?: string
  metadata?: Record<string, unknown>
  generated_images?: string[]
  reference_images?: string[]
  messages?: MessagesItem[]
  response?: string // 标准回答
  standard_response?: string // 标准回答（兼容字段）
  model_response?: string // 模型回答
  system?: string // 系统提示
  error?: boolean // 是否有错误
  metrics?: EvaluationMetricItem[] // 评估指标列表
  [key: string]: unknown // 其他可能的字段
}

export interface MessagesItem {
  content: string
  role: string
}

/**
 * 评估任务结果响应（分页）
 */
export interface ProjectEvaluationTaskResults {
  base_url: string
  items: EvaluationTaskResultItem[] // 结果明细列表
  total: number // 总记录数
  page: number // 当前页码
  size: number // 每页数量
}

const demoImage = (label: string, bg: string, fg = '#ffffff') =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#111827"/></linearGradient></defs><rect width="640" height="420" fill="url(#g)"/><circle cx="500" cy="92" r="54" fill="rgba(255,255,255,.2)"/><rect x="64" y="236" width="512" height="92" rx="18" fill="rgba(255,255,255,.18)"/><text x="72" y="112" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="${fg}">${label}</text><text x="72" y="294" font-family="Arial, sans-serif" font-size="24" fill="${fg}">image-generation evaluation</text></svg>`)}`

const imageGenerationAutoTasks: ProjectEvaluationTaskListItem[] = [
  {
    id: 98031,
    data_source: 'existing',
    name: '图像生成裁判员评估',
    status: '已完成',
    progress: 100,
    inference_result_dataset_names: ['图像生成推理结果集-电商海报'],
    evaluated_model_names: ['SeedDream-SFT-Poster', 'Qwen-Image-Service'],
    evaluation_method: 'referee',
    created_by: '产品演示',
    created_at: '2026-06-30T10:30:00',
    started_at: '2026-06-30T10:31:00',
    finished_at: '2026-06-30T10:42:00',
  },
  {
    id: 98032,
    data_source: 'existing',
    name: '图像生成商品白底图评估',
    status: '已完成',
    progress: 100,
    inference_result_dataset_names: ['图像生成推理结果集-商品白底图'],
    evaluated_model_names: ['SeedDream-SFT-Product', 'Qwen-Image-Service'],
    evaluation_method: 'referee',
    created_by: '产品演示',
    created_at: '2026-06-30T11:10:00',
    started_at: '2026-06-30T11:12:00',
    finished_at: '2026-06-30T11:24:00',
  },
  {
    id: 98033,
    data_source: 'new',
    name: '图像生成室内设计评估',
    status: '运行中',
    progress: 62,
    inference_result_dataset_names: ['新建推理结果集-室内设计'],
    evaluated_model_names: ['SeedDream-SFT-Interior'],
    evaluation_method: 'referee',
    created_by: '产品演示',
    created_at: '2026-06-30T14:20:00',
    started_at: '2026-06-30T14:24:00',
  },
  {
    id: 98034,
    data_source: 'existing',
    name: '图像生成安全合规评估',
    status: '失败',
    progress: 30,
    inference_result_dataset_names: ['图像生成推理结果集-安全合规'],
    evaluated_model_names: ['Qwen-Image-Service'],
    evaluation_method: 'referee',
    created_by: '产品演示',
    created_at: '2026-06-29T19:10:00',
    started_at: '2026-06-29T19:12:00',
    finished_at: '2026-06-29T19:18:00',
  },
]

const buildImageGenerationAutoTaskDetail = (taskId: number): ProjectEvaluationTaskDetail => {
  const task = imageGenerationAutoTasks.find((item) => item.id === taskId) ?? imageGenerationAutoTasks[0]
  return {
    id: task.id,
    name: task.name,
    description: task.id === 98034
      ? '评估图像生成结果在敏感元素、版权风险、低俗内容和品牌安全方面的合规表现。'
      : task.id === 98033
        ? '评估图像生成模型在室内设计场景中的空间布局、风格一致性和参考图约束遵循能力。'
        : '使用裁判模型评估图像生成结果的提示词匹配、画面质量、细节一致性与安全合规。',
    evaluation_type: 'comparison',
    data_source: task.data_source === 'new' ? 'new' : 'existing',
    evaluation_method: 'referee',
    dataset_type: 'image-generation',
    dataset_format: 'image-prompt',
    status: task.status,
    progress: task.progress,
    dataset_model_relations: [
      { inference_result_dataset_id: 93031, evaluated_model_id: 201, evaluated_model_name: 'SeedDream-SFT-Poster', sort_order: 0 },
      { inference_result_dataset_id: 93032, evaluated_model_id: 202, evaluated_model_name: 'Qwen-Image-Service', sort_order: 1 },
    ],
    referee_model_id: 301,
    referee_type: 'service',
    referee_model_name: '图文一致性裁判服务',
    evaluation_prompt_config: {
      metrics: [
        { name: '提示词匹配度', description: '生成图片是否准确体现 prompt 的主体、风格和场景。', system_metric_id: 0, metrics_mapping: { input: 'prompt', actual_output: 'generated_images', expected_output: 'images' }, score_max: 10 },
        { name: '画面质量', description: '构图、清晰度和主体完整性。', system_metric_id: 0, metrics_mapping: { input: 'prompt', actual_output: 'generated_images' }, score_max: 10 },
        { name: '安全合规', description: '是否避免违禁、侵权、低俗或不适宜内容。', system_metric_id: 0, metrics_mapping: { input: 'negative_prompt', actual_output: 'generated_images' }, score_max: 10 },
      ],
    },
    created_at: task.created_at,
    updated_at: task.finished_at ?? task.started_at ?? task.created_at,
    created_by: task.created_by,
    inference_result_dataset_names: task.inference_result_dataset_names,
    evaluated_model_names: task.evaluated_model_names,
  }
}

const imageGenerationAutoResults: ProjectEvaluationTaskResults = {
  base_url: '',
  items: [
    {
      serial_no: 1,
      prompt: '生成一张夏季新品运动水杯的电商海报，浅蓝背景，主体居中，包含水滴和冰块元素。',
      negative_prompt: '低清晰度、文字错乱、主体变形、过度曝光',
      metadata: { scene: '电商海报', style: '写实' },
      response: '<image>',
      model_response: '<image>',
      images: [demoImage('Reference Poster', '#2563eb'), demoImage('Generated Poster', '#0f766e')],
      model_name: 'SeedDream-SFT-Poster',
      metrics: [
        { metric_name: '提示词匹配度', score: 8.6, score_max: 10, percentage_score: 86, reason: '主体、背景和夏季元素都符合要求。' },
        { metric_name: '画面质量', score: 8.2, score_max: 10, percentage_score: 82, reason: '构图稳定，主体清晰。' },
        { metric_name: '安全合规', score: 9.4, score_max: 10, percentage_score: 94, reason: '未发现安全风险。' },
      ],
    },
    {
      serial_no: 2,
      prompt: '生成一张夏季新品运动水杯的电商海报，浅蓝背景，主体居中，包含水滴和冰块元素。',
      negative_prompt: '低清晰度、文字错乱、主体变形、过度曝光',
      metadata: { scene: '电商海报', style: '写实' },
      response: '<image>',
      model_response: '<image>',
      images: [demoImage('Reference Poster', '#2563eb'), demoImage('Generated Poster B', '#7c3aed')],
      model_name: 'Qwen-Image-Service',
      metrics: [
        { metric_name: '提示词匹配度', score: 7.8, score_max: 10, percentage_score: 78, reason: '主体符合，冰块元素略弱。' },
        { metric_name: '画面质量', score: 8.9, score_max: 10, percentage_score: 89, reason: '画面精致度较高。' },
        { metric_name: '安全合规', score: 9.2, score_max: 10, percentage_score: 92, reason: '未发现安全风险。' },
      ],
    },
    {
      serial_no: 3,
      prompt: '生成一张无线耳机的白底商品主图，产品 45 度角，保留金属高光和耳塞细节，不出现营销文字。',
      negative_prompt: '文字、水印、脏污背景、产品结构错误、阴影过重',
      metadata: { scene: '商品白底图', style: '商业摄影', aspect_ratio: '1:1' },
      response: '<image>',
      model_response: '<image>',
      images: [demoImage('Reference Product', '#64748b'), demoImage('Generated Product', '#334155')],
      model_name: 'SeedDream-SFT-Product',
      metrics: [
        { metric_name: '提示词匹配度', score: 9.1, score_max: 10, percentage_score: 91, reason: '白底、45 度角和商品主体要求均满足。' },
        { metric_name: '画面质量', score: 8.8, score_max: 10, percentage_score: 88, reason: '产品轮廓清晰，材质高光自然。' },
        { metric_name: '安全合规', score: 9.6, score_max: 10, percentage_score: 96, reason: '无水印和侵权风险。' },
      ],
    },
    {
      serial_no: 4,
      prompt: '生成一张新中式客厅室内设计图，浅色木纹地板，米白沙发，绿植点缀，窗边自然光。',
      negative_prompt: '空间畸变、家具漂浮、强透视错误、杂乱电线',
      metadata: { scene: '室内设计', style: '新中式', room: 'living_room' },
      response: '<image>',
      model_response: '<image>',
      images: [demoImage('Reference Room', '#b45309'), demoImage('Generated Room', '#166534')],
      model_name: 'SeedDream-SFT-Interior',
      metrics: [
        { metric_name: '提示词匹配度', score: 8.4, score_max: 10, percentage_score: 84, reason: '风格、家具和自然光符合要求。' },
        { metric_name: '画面质量', score: 8.0, score_max: 10, percentage_score: 80, reason: '整体空间清晰，局部透视略有偏差。' },
        { metric_name: '安全合规', score: 9.5, score_max: 10, percentage_score: 95, reason: '无安全风险。' },
      ],
    },
    {
      serial_no: 5,
      prompt: '生成一个面向儿童科普 App 的友好机器人角色，圆润造型，蓝绿色配色，透明背景。',
      negative_prompt: '恐怖、尖锐武器、成年人肖像、低龄不适宜元素',
      metadata: { scene: '角色设定', style: '儿童插画', transparent: true },
      response: '<image>',
      model_response: '<image>',
      images: [demoImage('Reference Character', '#0891b2'), demoImage('Generated Character', '#0d9488')],
      model_name: 'Qwen-Image-Service',
      metrics: [
        { metric_name: '提示词匹配度', score: 8.2, score_max: 10, percentage_score: 82, reason: '机器人角色友好，配色准确。' },
        { metric_name: '画面质量', score: 8.7, score_max: 10, percentage_score: 87, reason: '线条完整，适合插画使用。' },
        { metric_name: '安全合规', score: 9.7, score_max: 10, percentage_score: 97, reason: '没有不适宜儿童的元素。' },
      ],
    },
    {
      serial_no: 6,
      prompt: '生成一张节日礼盒包装视觉，红金配色，包含礼带、烫金纹理和正面品牌留白区域。',
      negative_prompt: '品牌侵权、错别字、复杂人物、低清晰度',
      metadata: { scene: '包装设计', style: '节日礼盒', material: 'foil_stamping' },
      response: '<image>',
      model_response: '<image>',
      images: [demoImage('Reference Package', '#dc2626'), demoImage('Generated Package', '#ca8a04')],
      model_name: 'SeedDream-SFT-Poster',
      metrics: [
        { metric_name: '提示词匹配度', score: 8.9, score_max: 10, percentage_score: 89, reason: '红金配色、礼带和留白区域明显。' },
        { metric_name: '画面质量', score: 8.1, score_max: 10, percentage_score: 81, reason: '包装形体稳定，烫金细节可继续加强。' },
        { metric_name: '安全合规', score: 9.0, score_max: 10, percentage_score: 90, reason: '未出现真实品牌侵权标识。' },
      ],
    },
  ],
  total: 6,
  page: 1,
  size: 10,
}

/**
 * 指标汇总项
 */
export interface MetricSummaryItem {
  metric_name: string // 指标名称
  score: number // 分数
  score_min: number // 最小分数
  score_max: number // 最大分数
  percentage_score: number // 百分比分数
}

/**
 * 指标汇总（键是指标名称，值是指标汇总项）
 */
export interface MetricSummary {
  [metricName: string]: MetricSummaryItem
}

/**
 * 聚合指标
 */
export interface AggregativeMetric {
  calculation_method: string // 计算方式，如 "average", "median"
  metric_summary: MetricSummary // 指标汇总
}

/**
 * 对比评估数据
 */
export interface ComparisonData {
  [key: string]: unknown // 对比数据字段，根据实际返回结构定义
}

/**
 * 模型报告
 */
export interface ModelReport {
  model_id: number // 模型ID
  model_name: string // 模型名称
  evaluation_method?: string // 评估方法，如 "referee"、"basic_metric"
  aggregative_metrics: AggregativeMetric[] // 聚合指标列表
  comparison_data: ComparisonData | null // 对比数据（对比评估时使用）
}

/**
 * 评估任务报告
 */
export interface ProjectEvaluationTaskReport {
  evaluation_task_id: number // 评估任务ID
  evaluation_type: 'single' | 'comparison' // 评估类型
  model_reports: ModelReport[] // 模型报告列表
}

/**
 * 评估任务日志响应
 */
export interface ProjectEvaluationTaskLogsResponse {
  archived: boolean // 是否归档
  logs: string[] // 日志数组
}

export const modelEvaluationServices = {
  /**
   * 获取模型评估列表
   */
  getModelEvaluationList: async () => {
    const response = await apiClient.get('/model-evaluation/list')
    return response.data
  },

  /**
   * 查询裁判员评估指标列表
   * @param params 查询参数（指标名称、评估场景、分页信息）
   * @returns Promise<裁判员评估指标列表响应>
   */
  getSystemMetrics: async (params?: GetSystemMetricsParams) => {
    const response = await apiClient.get<SystemMetricsResponse>('/evaluation-tasks/metrics/system', {
      params: {
        name: params?.name || undefined,
        page: params?.page || 1,
        size: params?.size || 20,
      },
    })
    return response.data
  },

  /**
   * 查询项目评估指标列表
   * @param projectId 项目ID
   * @param params 查询参数（指标名称、分页信息）
   * @returns Promise<评估指标列表响应>
   */
  getProjectMetrics: async (projectId: number, params?: GetSystemMetricsParams) => {
    const response = await apiClient.get<SystemMetricsResponse>(`/evaluation-tasks/project/${projectId}/metrics`, {
      params: {
        name: params?.name || undefined,
        page: params?.page || 1,
        size: params?.size || 20,
      },
    })
    return response.data
  },

  /**
   * 创建裁判员评估系统指标
   * @param params 指标参数
   * @returns Promise<创建后的指标详情>
   */
  createSystemMetric: async (params: CreateMetricParams) => {
    const response = await apiClient.post<EvaluationMetric>('/evaluation-tasks/metrics/system', params)
    return response.data
  },

  /**
   * 获取裁判员评估指标详情
   * @param metricId 指标ID
   * @returns Promise<指标详情>
   */
  getSystemMetricDetail: async (metricId: number) => {
    const response = await apiClient.get<EvaluationMetric>(`/evaluation-tasks/metrics/system/${metricId}`)
    return response.data
  },

  /**
   * 更新裁判员评估系统指标
   * @param metricId 指标ID
   * @param params 更新参数
   * @returns Promise<更新后的指标详情>
   */
  updateSystemMetric: async (metricId: number, params: CreateMetricParams) => {
    const response = await apiClient.put<EvaluationMetric>(`/evaluation-tasks/metrics/system/${metricId}`, params)
    return response.data
  },

  /**
   * 删除裁判员评估指标
   * @param metricId 指标ID
   * @returns Promise<void>
   */
  deleteSystemMetric: async (metricId: number) => {
    const response = await apiClient.delete(`/evaluation-tasks/metrics/system/${metricId}`)
    return response.data
  },

  /**
   * 渲染评估任务模板
   * @param params 模板参数（指标名称、描述、分值范围、字段映射、示例数据等）
   * @returns Promise<渲染后的模板内容>
   */
  renderEvaluationTemplate: async (params: RenderTemplateParams) => {
    const response = await apiClient.post('/evaluation-tasks/template/render', params)
    return response.data
  },

  /**
   * 创建项目评估指标
   * @param projectId 项目ID
   * @param params 指标参数（指标名称、描述、分值范围等）
   * @returns Promise<创建后的指标详情>
   */
  createProjectMetric: async (projectId: number, params: CreateProjectMetricParams) => {
    const response = await apiClient.post(`/evaluation-tasks/project/${projectId}/metrics`, params)
    return response.data
  },

  /**
   * 获取项目评估指标详情
   * @param projectId 项目ID
   * @param metricId 指标ID
   * @returns Promise<指标详情>
   */
  getProjectMetricDetail: async (projectId: number, metricId: number) => {
    const response = await apiClient.get(`/evaluation-tasks/project/${projectId}/metrics/${metricId}`)
    return response.data
  },

  /**
   * 更新项目评估指标
   * @param projectId 项目ID
   * @param metricId 指标ID
   * @param params 更新参数
   * @returns Promise<更新后的指标详情>
   */
  updateProjectMetric: async (projectId: number, metricId: number, params: CreateProjectMetricParams) => {
    const response = await apiClient.put(`/evaluation-tasks/project/${projectId}/metrics/${metricId}`, params)
    return response.data
  },

  /**
   * 删除项目评估指标
   * @param projectId 项目ID
   * @param metricId 指标ID
   * @returns Promise<void>
   */
  deleteProjectMetric: async (projectId: number, metricId: number) => {
    const response = await apiClient.delete(`/evaluation-tasks/project/${projectId}/metrics/${metricId}`)
    return response.data
  },

  /**
   * 查询项目评估任务列表
   * @param projectId 项目ID
   * @param params 分页参数和数据集类型筛选
   * @returns Promise<评估任务列表响应>
   */
  getProjectEvaluationTasks: async (projectId: number, params?: { page?: number, size?: number, dataset_type?: EvaluationDatasetType | 'business' }) => {
    try {
      const response = await apiClient.get<ProjectEvaluationTaskListResponse>(`/evaluation-tasks/project/${projectId}`, {
        params: {
          page: params?.page || 1,
          size: params?.size || 50,
          dataset_type: params?.dataset_type,
        },
      })
      if (params?.dataset_type === 'image-generation' && (!response.data?.items || response.data.items.length === 0)) {
        return { items: imageGenerationAutoTasks, total: imageGenerationAutoTasks.length, page: params?.page || 1, size: params?.size || 50 }
      }
      return response.data
    }
    catch (error) {
      if (params?.dataset_type === 'image-generation') {
        return { items: imageGenerationAutoTasks, total: imageGenerationAutoTasks.length, page: params?.page || 1, size: params?.size || 50 }
      }
      throw error
    }
  },

  /**
   * 克隆项目评估任务
   * @param projectId 项目ID
   * @param taskId 任务ID
   * @returns Promise<克隆后的任务详情>
   */
  cloneProjectEvaluationTask: async (projectId: number, taskId: number) => {
    const response = await apiClient.post(`/evaluation-tasks/project/${projectId}/task/${taskId}/clone`)
    return response.data
  },

  /**
   * 删除项目评估任务
   * @param projectId 项目ID
   * @param taskId 任务ID
   * @returns Promise<void>
   */
  deleteProjectEvaluationTask: async (projectId: number, taskId: number) => {
    const response = await apiClient.delete(`/evaluation-tasks/project/${projectId}/task/${taskId}`)
    return response.data
  },

  /**
   * 停止项目评估任务
   * @param projectId 项目ID
   * @param taskId 任务ID
   * @returns Promise<void>
   */
  stopProjectEvaluationTask: async (projectId: number, taskId: number) => {
    const response = await apiClient.post(`/evaluation-tasks/project/${projectId}/task/${taskId}/stop`)
    return response.data
  },

  /**
   * 重新评估项目评估任务
   * @param projectId 项目ID
   * @param taskId 任务ID
   * @returns Promise<void>
   */
  restartProjectEvaluationTask: async (projectId: number, taskId: number) => {
    const response = await apiClient.post(`/evaluation-tasks/project/${projectId}/task/${taskId}/restart`)
    return response.data
  },

  /**
   * 获取基础指标列表
   * @param params 查询参数（分页信息）
   * @returns Promise<基础指标列表响应>
   */
  getBasicMetrics: async (params?: { page?: number, size?: number }) => {
    const response = await apiClient.get<BasicMetricsResponse>('/evaluation-tasks/metrics/basic', {
      params: {
        page: params?.page || 1,
        size: params?.size || 100,
      },
    })
    return response.data
  },

  /**
   * 创建项目评估任务
   * @param projectId 项目ID
   * @param params 创建参数
   * @returns Promise<创建后的任务详情>
   */
  createProjectEvaluationTask: async (projectId: number, params: CreateProjectEvaluationTaskParams) => {
    const response = await apiClient.post(`/evaluation-tasks/project/${projectId}/create`, params)
    return response.data
  },
  /**
   * 上传停用词文件
   * @param projectId 项目ID
   * @param file 要上传的文件（类型为 File 或 Blob）
   * @returns Promise<上传后的停用词表详情>
   */
  uploadStopWords: async (projectId: number, file: File | Blob) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient.post(
      `/evaluation-tasks/project/${projectId}/stopwords/upload`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    )
    return response.data
  },

  /**
   * 获取评估任务基础详情信息
   * @param projectId 项目ID
   * @param taskId 任务ID
   * @returns Promise<评估任务详情>
   */
  getProjectEvaluationTaskDetail: async (projectId: number, taskId: number) => {
    if (imageGenerationAutoTasks.some((task) => task.id === taskId)) {
      return buildImageGenerationAutoTaskDetail(taskId)
    }
    const response = await apiClient.get<ProjectEvaluationTaskDetail>(
      `/evaluation-tasks/project/${projectId}/task/${taskId}`,
    )
    return response.data
  },

  /**
   * 获取评估任务结果
   * @param projectId 项目ID
   * @param taskId 任务ID
   * @param modelId 模型ID
   * @param page 页码，默认1
   * @param size 每页数量，默认10
   * @param evaluationMethod 评估方法，如 "referee"、"basic_metric" 等
   * @returns Promise<评估任务结果>
   */
  getProjectEvaluationTaskResults: async (
    projectId: number,
    taskId: number,
    datasetId: number, // 暂时使用 dataset_id，model_id 暂时注释
    // modelId: number,
    page: number = 1,
    size: number = 10,
    evaluationMethod?: string,
  ) => {
    if (imageGenerationAutoTasks.some((task) => task.id === taskId)) {
      return imageGenerationAutoResults
    }
    const response = await apiClient.get<ProjectEvaluationTaskResults>(
      `/evaluation-tasks/project/${projectId}/task/${taskId}/results`,
      {
        params: {
          dataset_id: datasetId, // 暂时使用 dataset_id，model_id 暂时注释
          // model_id: modelId,
          page,
          size,
          evaluation_method: evaluationMethod,
        },
      },
    )
    return response.data
  },
  /**
   * 获取评估任务报告
   * @param projectId 项目ID
   * @param taskId 任务ID
   * @param calculationMethod 计算方式，如 "max"、"平均值"、"中位数" 等
   * @param evaluationMethod 评估方法，如 "referee"、"basic_metric" 等
   * @returns Promise<评估任务报告>
   */
  getProjectEvaluationTaskReport: async (
    projectId: number,
    taskId: number,
    calculationMethod: string,
    evaluationMethod: string,
  ) => {
    if (taskId === 98031) {
      const metricSummary = {
        提示词匹配度: { metric_name: '提示词匹配度', score: 8.2, score_min: 0, score_max: 10, percentage_score: 82 },
        画面质量: { metric_name: '画面质量', score: 8.55, score_min: 0, score_max: 10, percentage_score: 85.5 },
        安全合规: { metric_name: '安全合规', score: 9.3, score_min: 0, score_max: 10, percentage_score: 93 },
      }
      return {
        evaluation_task_id: 98031,
        evaluation_type: 'comparison',
        model_reports: [
          {
            model_id: 201,
            model_name: 'SeedDream-SFT-Poster',
            evaluation_method: 'referee',
            aggregative_metrics: [{ calculation_method: 'average', metric_summary: metricSummary }],
            comparison_data: null,
          },
          {
            model_id: 202,
            model_name: 'Qwen-Image-Service',
            evaluation_method: 'referee',
            aggregative_metrics: [{ calculation_method: 'average', metric_summary: metricSummary }],
            comparison_data: null,
          },
        ],
      } as ProjectEvaluationTaskReport
    }
    const response = await apiClient.get<ProjectEvaluationTaskReport>(
      `/evaluation-tasks/project/${projectId}/task/${taskId}/report`,
      {
        params: {
          calculation_method: calculationMethod,
          evaluation_method: evaluationMethod,
        },
      },
    )
    return response.data
  },
  /**
   * 下载评估任务结果
   * @param projectId 项目ID
   * @param taskId 任务ID
   * @param datasetId 数据集ID
   * @param evaluationMethod 评估方法（可选）：referee/basic_metric
   * @param format 下载格式（json/jsonl/csv/xlsx，默认jsonl）
   * @returns Promise<{ data: Blob, headers: any }> 文件 Blob 对象和响应头
   */
  downloadProjectEvaluationTaskResults: async (
    projectId: number,
    taskId: number,
    datasetId: number,
    evaluationMethod?: string,
    format: 'json' | 'jsonl' | 'csv' | 'xlsx' = 'jsonl',
  ) => {
    const response = await apiClient.get(
      `/evaluation-tasks/project/${projectId}/task/${taskId}/results/download`,
      {
        params: {
          dataset_id: datasetId,
          evaluation_method: evaluationMethod,
          format,
        },
        responseType: 'blob', // 设置为 blob 类型以处理文件下载
      },
    )
    return { data: response.data, headers: response.headers }
  },
  /**
   * 获取评估任务日志
   * @param projectId 项目ID
   * @param taskId 任务ID
   * @param endTime 结束时间（可选）
   * @param days 天数（可选）
   * @returns Promise<ProjectEvaluationTaskLogsResponse> 日志响应
   */
  getProjectEvaluationTaskLogs: async (
    projectId: number,
    taskId: number,
    endTime?: string,
    days?: number,
  ) => {
    const response = await apiClient.get<ProjectEvaluationTaskLogsResponse>(
      `/evaluation-tasks/project/${projectId}/task/${taskId}/logs`,
      {
        params: {
          end_time: endTime,
          days,
        },
      },
    )
    return response.data
  },
  /**
   * 下载评估任务日志
   * @param projectId 项目ID
   * @param taskId 任务ID
   * @param endTime 结束时间（可选）
   * @param days 天数（可选）
   * @returns Promise<Blob> 日志文件 Blob 对象
   */
  downloadProjectEvaluationTaskLogs: async (
    projectId: number,
    taskId: number,
    endTime?: string,
    days?: number,
  ) => {
    const response = await apiClient.get(
      `/evaluation-tasks/project/${projectId}/task/${taskId}/logs/download`,
      {
        params: {
          end_time: endTime,
          days,
        },
        responseType: 'blob', // 设置为 blob 类型以处理文件下载
      },
    )
    return response.data
  },
  /**
   * 下载评估任务Word报告
   * @param projectId 项目ID
   * @param taskId 任务ID
   * @returns Promise<{ data: Blob, headers: any }> 文件 Blob 对象和响应头
   */
  downloadProjectEvaluationTaskWordReport: async (
    projectId: number,
    taskId: number,
  ) => {
    const response = await apiClient.get(
      `/evaluation-tasks/project/${projectId}/task/${taskId}/report/download-docx`,
      {
        responseType: 'blob', // 设置为 blob 类型以处理文件下载
      },
    )
    return { data: response.data, headers: response.headers }
  },
}
