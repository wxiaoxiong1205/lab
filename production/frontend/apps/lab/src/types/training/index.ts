/**
 * 训练数据接口定义
 */
// 训练数据列表
export interface getDataParams {
  name?: string
  dataset_type?: string
  usage?: string
  training_method_type?: string
  page?: number
  size?: number
}
// 训练数据集项接口
export interface TrainingDatasetItem {
  id?: number
  created_at: string
  dataset_format: string
  dataset_name: string
  dataset_type: string
  earliest_version: string
  latest_version: string
  project_id: number
  training_method_type: string
  updated_at: string
  version_count: number
  usage: string
  model_name: string
}

// 训练数据集列表响应接口
export interface TrainingDatasetListResponse {
  items: TrainingDatasetItem[]
  total: number
  page: number
  size: number
  pages: number
}

export interface DatasetInUseResponse {
  in_use: boolean
  task_type?: string | null
  task_id?: number | null
  task_name?: string | null
  version: string
}

// 数据集类型枚举
export enum DatasetType {
  TEXT_GENERATION = 'text-generation',
  IMAGE_GENERATION = 'image-generation',
  IMAGE_UNDERSTANDING = 'image-understanding',
}

// 训练方法类型枚举
export enum TrainingMethodType {
  SFT = 'sft',
  RFT_GRPO = 'rft-grpo',
  RFT = 'rft',
  DPO = 'dpo',
  KTO = 'kto',
  RLHF = 'rlhf',
  POST_TRAIN = 'post-train',
}

// 数据格式枚举
export enum DatasetFormat {
  ROLE_BASED = 'role-based',
  QUESTION_ANSWER = 'question-answer',
  TEXT_COMPLETION = 'text-completion',
}

// 上传训练数据集请求参数接口
export interface UploadTrainingDatasetRequest {
  // Form字段
  name: string // 数据集名称 (1-100字符)
  project_id: number // 关联项目ID (必须大于0)
  file: File // 训练数据文件 (.jsonl格式)
  version?: string // 数据集版本号 (可选，默认为"v1"，最多50字符)
  description?: string // 数据集描述 (可选，最多500字符)
  dataset_config?: string // 配置信息 (可选，JSON字符串)
  attr_values?: Attribute[] // 关联属性值和选项 (可选，JSON数组)
}

export interface Attribute {
  attr_id: number // 属性ID
  attr_value?: string // 属性值键名 手动输入类型才传入
  data_type?: string
  required_tag?: number
  name: string
  input_type: string
  multi_select?: number // 下拉选择模式：0=单选，1=多选（仅下拉选择类型有）
  options?: optionsItem[] // 下拉选择类型 选定的选项值 才传入 手动输入该数组为空
}

export interface optionsItem {
  option_value: string // 下拉选择的选择项名称
}

// 上传训练数据集查询参数接口
export interface UploadTrainingDatasetQueryParams {
  dataset_type?: string // 数据集类型
  training_method_type?: string // 训练方法类型
  dataset_format?: string // 数据格式
  usage?: string // 数据用途
}

// 上传训练数据集响应接口
export interface UploadTrainingDatasetResponse {
  id: string
  dataset_name: string
  version: string
  created_at: string
}
export interface UploadDatasetVersionRequest {
  // Form字段
  name: string // 数据集名称 (必需)
  usage: string // 分类type (必需)
  project_id: number // 关联项目ID (必需)
  new_version: string // 新版本号 (必需)
  inherit_from_version: boolean // 是否继承现有版本 (必需，默认false)
  source_version?: string // 源版本号 (继承模式需要)
  file?: File // 数据集文件 (非继承模式需要，已弃用，优先使用 chunk_upload_ids)
  chunk_upload_ids?: string // 分片上传ID，逗号拼接的字符串 (非继承模式需要，优先使用)
  description?: string // 描述 (可选)
  dataset_config?: string // 配置信息 (可选)
  attr_values?: Attribute[] // 关联属性值和选项 (可选，与 create 一致)
}

// 上传数据集版本响应接口
export interface UploadDatasetVersionResponse {
  id: string
  dataset_name: string
  version: string
  created_at: string
}

export interface MergeDatasetVersionsRequest {
  new_version: string
  source_version_ids: number[]
  description?: string
}

/**
 * 大模型训练模块
 * 训练任务搜索参数接口
 */
export interface TrainingTaskSearchParams {
  name?: string | null // 按任务名称搜索
  train_type_category?: string | null // 训练类型分类筛选
  training_method_type?: string | null // 训练方法类型筛选
  deps?: string | null // 组合依赖
  page?: number // 页码，默认为1
  size?: number // 每页数量，默认为50
}

/**
 * 训练任务项接口
 */
export interface TrainingTaskItem {
  id: number // 任务ID
  name: string // 任务名称
  train_type_category: string // 训练类型分类
  training_method_type: string // 训练方法类型
  status: string // 任务状态
  created_at: string // 创建时间
  updated_at: string // 更新时间
  // 其他可能的字段...
}

/**
 * 训练任务列表响应接口
 */
export interface TrainingTaskResponse {
  items: TrainingTaskItem[] // 训练任务列表
  total: number // 总记录数
  page: number // 当前页码
  size: number // 每页数量
  total_pages: number // 总页数
}

// 训练任务基础信息
export interface TrainingTaskBasicInfo {
  name: string
  description: string
  project_id: number
  gpu_count: number
}

// 基础模型配置
export interface BaseModelConfig {
  base_model_id: number
  base_model_name: string
  template?: string
}

// 训练类型配置
export interface TrainingTypeConfig {
  fine_tuning_type: string
  train_method_type: string
  train_type_category: string
}

// 基础训练参数
export interface BasicTrainingConfig {
  bf16: boolean
  gradient_accumulation_steps: number
  learning_rate: number
  lr_scheduler_type: string
  num_train_epochs: number
  per_device_train_batch_size: number
  template?: string
  warmup_ratio: number
}

// 高级参数
export interface AdvancedTrainingConfig {
  gradient_checkpointing: boolean
  max_grad_norm: number
  rope_scaling: string
  seed: number
  weight_decay: number
}

// LoRA配置
export interface LoraConfig {
  lora_alpha: number
  lora_dropout: number
  lora_rank: number
}

// 数据处理配置
export interface DataProcessingConfig {
  cutoff_len: number
  preprocessing_num_workers: number
}

// 数据集项
export interface DatasetItem {
  character_count: number
  dataset_path: string
  name: string
  sample_count: number
  sampling_rate: number
  weight_in_total: number
}

// 评估配置
export interface EvaluationConfig {
  eval_split_ratio: number
  eval_steps: number
  eval_strategy: string
  eval_use_split: boolean
  greater_is_better: boolean
  load_best_model_at_end: boolean
  metric_for_best_model: string
  per_device_eval_batch_size: number
}

// 监控配置
export interface MonitorConfig {
  logging_steps: number
}

// 保存配置
export interface SaveConfig {
  save_steps: number
  save_strategy: string
  save_total_limit: number
}

// 额外参数
export interface AdditionalParams {
  dataloader_num_workers: number
  grpo_config?: {
    num_generations?: number
    max_prompt_length?: number
    max_completion_length?: number
    temperature?: number
    top_p?: number
    top_k?: number
    repetition_penalty?: number
    kl_coefficient?: number
    clip_range?: number
    advantage_estimator?: string
    reward_normalization?: boolean
    reward_scale?: number
  }
}

export interface GPUConfig {
  cpu_request: number
  cpu_limit: number
  memory_request: number
  memory_limit: number
}

// 完整的训练任务配置
export interface TrainingTaskConfig {
  // 基础信息
  name: string
  description: string
  project_id: number
  gpu_count: number
  /** 定时执行时间，格式：YYYY-MM-DDTHH:mm:ss */
  schedule_at?: string

  // 加速配置选项值
  deepspeed?: string // ZeRO-0 ZeRO-2 ZeRO-3 选项值

  // 训练类型配置
  training_type: TrainingTypeConfig

  // 基础模型配置
  base_model: BaseModelConfig

  // 基础训练参数
  basic: BasicTrainingConfig

  // 高级参数
  advanced: AdvancedTrainingConfig

  // LoRA配置
  lora_config: LoraConfig

  // 数据处理配置
  data_processing: DataProcessingConfig

  // 数据集配置
  dataset_items: DatasetItem[]
  eval_dataset_items: DatasetItem[]

  // 评估配置
  evaluation: EvaluationConfig

  // 监控配置
  monitor: MonitorConfig

  // 保存配置
  save: SaveConfig

  // cpu配置 内存配置
  graphics_card_resource: GPUConfig

  // 额外参数
  additional_params: AdditionalParams

  // dpo配置
  dpo_config?: DpoConfig
}

export interface DpoConfig {
  pref_beta: number
}

// 创建训练任务请求参数
export interface CreateTrainingTaskRequest {
  task_config: TrainingTaskConfig
}

// 训练任务响应
export interface TrainingTaskResponse {
  id: number
  name: string
  status: string
  created_at: string
  updated_at: string
  // 其他任务相关字段
}

export interface DatasetVersionItem {
  name: string
  project_id: number
  business_id: number
  business_name: string
  base_image: string
  output_image: string
  output_image_id: number
  image_type: number
  trigger_type: string
  status: string
  lab_k8s_uuid: string
  log_path: string
  describe: string | null
  id: number
  created_at: string
  updated_at: string
  created_id: number
  created_by: string
  dataset_name: string
  versions: VersionItem[]
}

export interface VersionItem {
  id: number
}

export type DatasetPreviewValue = string | number | boolean | null | DatasetPreviewValue[] | { [key: string]: DatasetPreviewValue }

export interface DatasetPreviewMessage {
  role?: 'system' | 'user' | 'assistant' | string
  content?: string
  [key: string]: DatasetPreviewValue | undefined
}
export interface DpoItem {
  content: string
  role?: 'system' | 'user' | 'assistant' | string
}

export interface DatasetPreviewSampleData {
  messages?: DatasetPreviewMessage[]
  images?: string[]
  system?: string
  prompt?: string
  response?: string
  row_number?: number
  key?: string | number
  id?: string | number
  [key: string]: DatasetPreviewValue | DatasetPreviewMessage[] | undefined
}

export interface DatasetPreviewSampleDataArray extends Array<DatasetPreviewSampleData> {
  messages?: DatasetPreviewMessage[]
  images?: string[]
}

// dpo role-based 数据详情格式
export interface DatasetPreviewSampleDpo {
  messages: DpoItem[]
  images?: string[]
  base_url?: string
  chosen: DpoItem
  rejected: DpoItem
}

// dpo alpaca 数据详情格式
export interface DatasetPreviewSampleAlpaca {
  messages?: DatasetPreviewMessage[]
  chosen: string
  input: string
  instruction: string
  rejected: string
}

export interface DatasetPreviewItem {
  row_number: number
  sample_data?: DatasetPreviewSampleData | DatasetPreviewSampleDataArray | DatasetPreviewSampleDpo | DatasetPreviewSampleAlpaca
  messages?: DatasetPreviewMessage[]
  [key: string]: DatasetPreviewValue | DatasetPreviewSampleData | DatasetPreviewSampleDataArray | DatasetPreviewSampleDpo | DatasetPreviewSampleAlpaca | DatasetPreviewMessage[] | undefined
}

export interface DatasetPreview {
  items: DatasetPreviewItem[]
  total: number
  page: number
  size: number
  pages?: number
  base_url?: string
}
