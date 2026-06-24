// 模型管理类型定义

// 模型状态枚举
export enum ModelStatus {
  DEVELOPING = 'developing', // 开发中
  TESTING = 'testing', // 测试中
  PRODUCTION = 'production', // 生产中
  ARCHIVED = 'archived', // 已归档
}
// 基础模型
export interface CreateBaseModelParams {
  model_source: string
  k8s_id: string
  name: string
  model_type: string[] // 新增时是string[]数组格式
  description: string
  model_provider: string
  model_status: string
  model_tags: string[]
  /** 定时执行时间，格式：YYYY-MM-DDTHH:mm:ss */
  schedule_at?: string
}

// 模型来源类型
export enum ModelSource {
  EXPERIMENT = 'experiment', // 实验产生
  FINETUNE = 'finetune', // 微调产生
  UPLOAD = 'upload', // 手动上传
  PRESET = 'preset', // 预置模型
}

// 模型分类
export enum ModelCategory {
  TEXT_PROCESSING = 'text_processing', // 文本处理
  IMAGE_PROCESSING = 'image_processing', // 图像处理
  AUDIO_PROCESSING = 'audio_processing', // 语音处理
  MULTIMODAL = 'multimodal', // 多模态
  OTHER = 'other', // 其他
}

// 模型类型（更具体的分类）
export enum ModelType {
  // 文本处理类型
  TEXT_CLASSIFICATION = 'text_classification', // 文本分类
  TEXT_GENERATION = 'text_generation', // 文本生成
  NAMED_ENTITY_RECOGNITION = 'ner', // 命名实体识别
  SENTIMENT_ANALYSIS = 'sentiment_analysis', // 情感分析
  QUESTION_ANSWERING = 'question_answering', // 问答系统

  // 图像处理类型
  IMAGE_CLASSIFICATION = 'image_classification', // 图像分类
  OBJECT_DETECTION = 'object_detection', // 目标检测
  IMAGE_SEGMENTATION = 'image_segmentation', // 图像分割
  IMAGE_GENERATION = 'image_generation', // 图像生成

  // 语音处理类型
  SPEECH_RECOGNITION = 'speech_recognition', // 语音识别
  SPEECH_SYNTHESIS = 'speech_synthesis', // 语音合成
  SPEAKER_RECOGNITION = 'speaker_recognition', // 说话人识别

  // 多模态类型
  IMAGE_CAPTIONING = 'image_captioning', // 图像描述
  VISUAL_QUESTION_ANSWERING = 'vqa', // 视觉问答

  // 其他
  RECOMMENDATION = 'recommendation', // 推荐系统
  TIME_SERIES = 'time_series', // 时序预测
  OTHER = 'other', // 其他
}

// 部署环境
export enum DeploymentEnvironment {
  TEST = 'test', // 测试环境
  PRODUCTION = 'production', // 生产环境
}

// 模型来源信息
export interface ModelSourceInfo {
  experiment_name?: string // 来源实验名称
  experiment_id?: string // 来源实验ID
  run_name?: string // 运行名称
  run_id?: string // 运行ID
  task_name?: string // 微调任务名称
  task_id?: string // 微调任务ID
}

// 性能指标
export interface PerformanceMetrics {
  accuracy?: number // 准确率
  precision?: number // 精确率
  recall?: number // 召回率
  f1_score?: number // F1分数
  loss?: number // 损失值
  latency_ms?: number // 延迟（毫秒）
  throughput?: number // 吞吐量
  auc?: number // AUC值
  mse?: number // 均方误差
  mae?: number // 平均绝对误差
  bleu?: number // BLEU分数（文本生成）
  rouge?: number // ROUGE分数（文本摘要）
}

// 资源需求
export interface ResourceRequirements {
  gpu_type?: string // GPU类型（如 V100, A100, RTX3080）
  gpu_memory_gb?: number // GPU显存需求（GB）
  memory_gb: number // 内存需求（GB）
  storage_gb: number // 存储需求（GB）
  cpu_cores?: number // CPU核心数
  min_batch_size?: number // 最小批次大小
  max_batch_size?: number // 最大批次大小
}

// 模型文件信息
export interface ModelFileInfo {
  size_mb: number // 文件大小（MB）
  format: string // 文件格式（如 pytorch, onnx, tensorflow）
  download_url?: string // 下载链接
  checksum?: string // 文件校验和
  file_count?: number // 文件数量
}

// 部署信息
export interface DeploymentInfo {
  environment: DeploymentEnvironment // 部署环境
  api_endpoint?: string // API端点
  deployed_at?: string // 部署时间
  deployment_id?: string // 部署ID
  status: 'deploying' | 'running' | 'stopped' | 'failed' // 部署状态
  replicas?: number // 副本数量
  health_check_url?: string // 健康检查URL
}

// 使用统计
export interface UsageStats {
  total_calls: number // 总调用次数
  calls_today: number // 今日调用次数
  calls_this_week: number // 本周调用次数
  calls_this_month: number // 本月调用次数
  avg_response_time: number // 平均响应时间
  success_rate: number // 成功率
  error_rate: number // 错误率
  last_used_at?: string // 最后使用时间
}

// 评分和反馈
export interface ModelRating {
  average_rating: number // 平均评分（1-5）
  rating_count: number // 评分次数
  five_star: number // 5星评分数
  four_star: number // 4星评分数
  three_star: number // 3星评分数
  two_star: number // 2星评分数
  one_star: number // 1星评分数
}

// 模型基础信息
export interface Model {
  id: string
  name: string // 模型名称
  display_name?: string // 显示名称
  description?: string // 模型描述
  project_id: string // 项目ID
  category: ModelCategory // 模型分类
  type: ModelType // 模型类型
  source: ModelSource // 模型来源
  source_info?: ModelSourceInfo // 来源信息
  current_version: string // 当前版本
  latest_version: string // 最新版本
  status: ModelStatus // 模型状态
  performance_metrics: PerformanceMetrics // 性能指标
  resource_requirements: ResourceRequirements // 资源需求
  tags: string[] // 标签
  is_favorite: boolean // 是否收藏
  is_public: boolean // 是否公开（其他项目可见）
  usage_stats: UsageStats // 使用统计
  rating: ModelRating // 评分信息
  framework: string // 框架（pytorch, tensorflow, onnx等）
  license?: string // 许可证
  author: string // 作者
  created_at: string // 创建时间
  updated_at: string // 更新时间
  created_by: string // 创建者
}

// 模型版本信息
export interface ModelVersion {
  id: string
  model_id: string // 模型ID
  version: string // 版本号
  version_name?: string // 版本名称
  changelog?: string // 更新说明
  description?: string // 版本描述
  performance_metrics: PerformanceMetrics // 性能指标
  model_file_info: ModelFileInfo // 模型文件信息
  deployment_info?: DeploymentInfo // 部署信息
  training_info?: { // 训练信息
    training_duration?: number // 训练时长（小时）
    training_samples?: number // 训练样本数
    validation_samples?: number // 验证样本数
    epochs?: number // 训练轮次
    learning_rate?: number // 学习率
    batch_size?: number // 批次大小
  }
  is_latest: boolean // 是否为最新版本
  is_active: boolean // 是否激活
  tags: string[] // 版本标签
  created_at: string // 创建时间
  created_by: string // 创建者
}

// 模型详情信息（包含版本列表）
export interface ModelDetail extends Model {
  versions: ModelVersion[] // 版本列表
  total_versions: number // 总版本数
  deployment_count: number // 部署次数
  fork_count: number // 被复制次数
  related_models: Model[] // 相关模型
}

// 搜索参数
export interface ModelSearchParams {
  page?: number // 页码
  page_size?: number // 每页大小
  search?: string // 搜索关键词
  category?: ModelCategory[] // 分类筛选
  type?: ModelType[] // 类型筛选
  source?: ModelSource[] // 来源筛选
  status?: ModelStatus[] // 状态筛选
  tags?: string[] // 标签筛选
  framework?: string[] // 框架筛选
  sort_by?: 'created_at' | 'updated_at' | 'name' | 'rating' | 'usage_count' // 排序字段
  sort_order?: 'asc' | 'desc' // 排序方向
  is_favorite?: boolean // 只显示收藏
  is_public?: boolean // 只显示公开模型
  min_rating?: number // 最低评分
  author?: string // 作者筛选
}

// 模型版本搜索参数
export interface ModelVersionSearchParams {
  model_id: string // 模型ID
  page?: number // 页码
  page_size?: number // 每页大小
  version?: string // 版本号搜索
  is_active?: boolean // 只显示激活版本
  deployment_status?: string[] // 部署状态筛选
  sort_by?: 'created_at' | 'version' | 'performance' // 排序字段
  sort_order?: 'asc' | 'desc' // 排序方向
}

// 创建模型请求
export interface CreateModelRequest {
  name: string // 模型名称
  display_name?: string // 显示名称
  description?: string // 描述
  category: ModelCategory // 分类
  type: ModelType // 类型
  source: ModelSource // 来源
  source_info?: ModelSourceInfo // 来源信息
  framework: string // 框架
  tags?: string[] // 标签
  is_public?: boolean // 是否公开
  performance_metrics?: PerformanceMetrics // 性能指标
  resource_requirements?: ResourceRequirements // 资源需求
}

// 更新模型请求
export interface UpdateModelRequest {
  name?: string // 模型名称
  display_name?: string // 显示名称
  description?: string // 描述
  status?: ModelStatus // 状态
  tags?: string[] // 标签
  is_public?: boolean // 是否公开
  performance_metrics?: PerformanceMetrics // 性能指标
  resource_requirements?: ResourceRequirements // 资源需求
}

// 创建模型版本请求
export interface CreateModelVersionRequest {
  model_id: string // 模型ID
  version?: string // 版本号（自动生成或手动指定）
  version_name?: string // 版本名称
  changelog?: string // 更新说明
  description?: string // 版本描述
  performance_metrics?: PerformanceMetrics // 性能指标
  model_file_info: ModelFileInfo // 模型文件信息
  training_info?: { // 训练信息
    training_duration?: number // 训练时长（小时）
    training_samples?: number // 训练样本数
    validation_samples?: number // 验证样本数
    epochs?: number // 训练轮次
    learning_rate?: number // 学习率
    batch_size?: number // 批次大小
    [key: string]: unknown // 其他训练参数
  }
  tags?: string[] // 版本标签
}

// 部署模型请求
export interface DeployModelRequest {
  model_id: string // 模型ID
  version_id: string // 版本ID
  environment: DeploymentEnvironment // 部署环境
  replicas?: number // 副本数量
  resource_config?: { // 资源配置
    cpu_limit?: string // CPU限制
    memory_limit?: string // 内存限制
    gpu_limit?: number // GPU限制
  }
  config?: Record<string, unknown> // 额外配置
}

// 模型收藏操作
export interface ModelFavoriteRequest {
  model_id: string // 模型ID
  is_favorite: boolean // 是否收藏
}

// 模型评分请求
export interface ModelRatingRequest {
  model_id: string // 模型ID
  rating: number // 评分（1-5）
  comment?: string // 评论
}

// 通用分页响应
export interface PaginatedResponse<T> {
  items: T[] // 数据项
  total: number // 总数
  page: number // 当前页
  page_size: number // 每页大小
  pages: number // 总页数
}

// 通用API响应
export interface ApiResponse<T> {
  success: boolean // 是否成功
  data: T // 响应数据
  message?: string // 消息
  error?: string // 错误信息
}

// 模型对比请求
export interface ModelComparisonRequest {
  model_ids: string[] // 要对比的模型ID列表
  version_ids?: string[] // 特定版本ID列表（可选）
  metrics?: string[] // 要对比的指标列表
}

// 模型对比结果
export interface ModelComparisonResult {
  models: Model[] // 对比的模型列表
  versions: ModelVersion[] // 对比的版本列表（如果指定）
  comparison_metrics: { // 对比指标
    metric_name: string
    values: Record<string, number> // 模型ID对应的指标值
    best_model_id?: string // 该指标表现最好的模型ID
  }[]
  summary: { // 对比摘要
    best_overall_model_id: string // 综合表现最好的模型
    strengths_weaknesses: Record<string, { // 各模型的优劣势
      strengths: string[]
      weaknesses: string[]
    }>
  }
}

// 模型市场筛选参数（继承自ModelSearchParams但增加一些特定字段）
export interface ModelMarketSearchParams extends ModelSearchParams {
  difficulty_level?: 'beginner' | 'intermediate' | 'advanced' // 使用难度
  industry?: string[] // 适用行业
  use_case?: string[] // 使用场景
  min_performance?: number // 最低性能要求
  max_resource_requirement?: { // 最大资源要求
    memory_gb?: number
    gpu_memory_gb?: number
    storage_gb?: number
  }
  is_featured?: boolean // 是否为精选模型
  has_demo?: boolean // 是否有演示
}
/**
 * 获取基础模型列表的请求参数接口
 */
export interface GetBaseModelsParams {
  /** 按模型类型筛选，空字符串表示不筛选 */
  model_type?: string
  /** 按模型提供商筛选，空字符串表示不筛选 */
  model_provider?: string
  /** 页码，默认值: 1 */
  page?: number
  /** 每页大小，默认值: 50，最小值: 1，最大值: 100 */
  size?: number
  name?: string // 模型名称
  is_available?: boolean // 是否可用
  model_tags?: string // 模型标签
  status?: string // 模型状态
}

/**
 * 基础模型接口
 */
export interface BaseModel {
  id: string
  name: string
  model_source: string
  k8s_id: string
  model_provider: string
  model_type: string | string[]
  description: string
  created_at: string
  updated_at: string
  model_tags: string[]
  status: string
  model_name?: string
  /** 定时执行时间，格式：YYYY-MM-DDTHH:mm:ss */
  schedule_at?: string
}

/**
 * 基础模型列表响应接口
 */
export interface BaseModelListResponse {
  items: BaseModel[]
  total: number
  page: number
  size: number
}
/** 创建/提交时的显卡资源配置 */
export interface GraphicsCardResourcePayload {
  card_type: string
  card_model: string
  count: number
  card_memory: string
  k8s_resource_type: string
  cpu_request: number
  cpu_limit: number
  memory_request: number
  memory_limit: number
}

/**
 * 创建训练模型接口
 */
export interface CreateTrainedModelParams {
  name: string
  model_version: string
  description: string

  model_type: string
  model_source_type: 'notebook' | 'training'

  model_path?: string
  project_id?: number
  task_id?: string
  task_name?: string
  task_version?: string
  base_model_id?: string
  base_model_name?: string
  checkpoint?: string
  /** 定时执行时间，格式：YYYY-MM-DDTHH:mm:ss */
  schedule_at?: string
  /** 显卡资源配置（创建时必传，card_model/card_memory 来自选择显卡型号） */
  graphics_card_resource?: GraphicsCardResourcePayload
  notebook_id?: number
  notebook_name?: string
  notebook_path?: string
}

export interface GetModelListParams {
  model_provider: string
  model_type?: string | string[]
}

export interface ModelVersionListResponse {
  name: string
  description: string
  model_type: string
  model_path: string
  model_version: string
  project_id: number
  task_id: string
  task_name: string
  task_version: string
  base_model_id: string
  base_model_name: string
  checkpoint: string
  id: number
  created_at: string
  updated_at: string
  training_type: ModelDataType
  /** 定时执行时间，格式：YYYY-MM-DDTHH:mm:ss；部分接口返回 camelCase scheduleAt */
  schedule_at?: string
  scheduleAt?: string
  status?: string
}

export interface ModelDataType {
  fine_tuning_type: string
  train_method_type: string
  train_type_category: string
}
export interface ModelVersionListResponse {
  name: string
  description: string
  model_type: string
  model_path: string
  model_version: string
  project_id: number
  task_id: string
  task_name: string
  task_version: string
  base_model_id: string
  base_model_name: string
  checkpoint: string
  id: number
  created_at: string
  updated_at: string
  model_source_type: string
  notebook_name: string
  notebook_path: string
  notebook_id: number
}

// 模型提供商枚举值类型定义
export interface ModelProviderOption {
  description: string | null
  name: string
  value: string
}

// 模型类型枚举值类型定义
export interface ModelTypeOption {
  description: string | null
  name: string
  value: string
}

// 模型列表项类型定义
export type ModelListItem = string | { name: string }

// 枚举值类型定义(label: 显示值, value: 值)
export interface EnumOption { label: string, value: string }

// 模型来源枚举值类型定义
export interface ModelSourceOption extends EnumOption {}

// 基础模型状态枚举值类型定义
export interface ModelStatusOption extends EnumOption {}

export interface AllTrainedModelsParamsType {
  name?: string
  model_type?: string
  status?: string
  page?: number
  size?: number
}
export interface AllTrainedModelsResponse {
  items: ModelVersionListResponse[]
  total: number
  page: number
  size: number
}
export interface AllTrainedModelsItem {
  model_name: string
  versions: ModelVersionListResponse[]
}

export interface ModelListResponse {
  items: ItemListResponse[]
  total: number
  page: number
  size: number
}
export interface ItemListResponse {
  id: number
  model_name: string
  version_count: number
  model_type: string
  task_type: string
  source_type: string
  source_ref: string
  /** 机器模型部署用：Python 上传文件 id（接口返回时与列表选择联动） */
  ml_handle_upload_id?: string
  latest_version: string
  notebook_id: number
  earliest_version: string
  created_at: string
  updated_at: string
}
