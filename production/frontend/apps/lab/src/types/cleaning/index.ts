/**
 * 数据清洗模块类型定义
 */

/**
 * 清洗任务状态枚举
 */
export type CleaningTaskStatus = 'pending' | 'running' | 'finished' | 'failed'

/**
 * 清洗任务列表搜索参数
 */
export interface CleaningTaskSearchParams {
  project_id: number // 项目ID（必需）
  name?: string // 任务名称搜索（可选）
  status?: CleaningTaskStatus | null // 任务状态筛选（可选）
  page?: number // 页码，默认为1
  size?: number // 每页数量，默认为50
}

/**
 * 清洗任务列表项
 */
export interface CleaningTaskListResponse {
  id: number | null // 主键id
  created_at: string | null // 创建时间
  updated_at: string | null // 更新时间
  created_id: number | null // 创建者用户ID
  created_by: string | null // 用户名
  tenant_id: string | null // 租户id
  name: string // 清洗任务名称
  project_id: number // 项目ID
  source: string // 数据来源：existed_dataset/upload
  input_dataset_id: number | null // 输入数据集ID
  output_dataset_id: number | null // 输出数据集ID
  input_dataset_name: string | null // 清洗前数据集名称（格式：数据集名称-版本号）
  output_dataset_name: string | null // 清洗后数据集名称（格式：数据集名称-版本号）
  status: string // 任务状态
  total_samples: number | null // 总样本数
  completed_at: string | null // 完成时间
  total_characters: number | null // 总字符数
  file_size: number | null // 文件大小（MB）
  steps_snapshot: CleaningStepSnapshot[] | null // 步骤快照数组
  schedule_at?: string | null // 定时执行时间，格式：YYYY-MM-DDTHH:mm:ss
}

/**
 * 清洗任务列表分页响应
 */
export interface PageCleaningTaskListResponse {
  items: CleaningTaskListResponse[] // 清洗任务列表
  total: number | null // 总记录数
  page: number | null // 当前页码
  size: number | null // 每页数量
  pages: number | null // 总页数
}

/**
 * 清洗算子分类响应
 */
export interface CleaningOperatorCategory {
  categories: CleaningCategoryItem[]
}

/**
 * 清洗算子分类项
 */
export interface CleaningCategoryItem {
  category: string // 分类标识
  category_name: string // 分类名称
  operators: CleaningOperator[] // 该分类下的算子列表
}

/**
 * 参数 Schema 定义
 */
export interface CleaningOperatorParamSchema {
  type: 'int' | 'float' | 'string' | 'list' | 'bool' // 参数类型
  default?: any // 默认值（如果有则显示配置面板）
  description?: string // 参数描述
  ui_type?: 'input' | 'number' | 'select' | 'textarea' | 'tags' | 'switch' // UI控件类型（可选）
  required?: boolean // 是否必填（可选，默认false）
  min?: number // 最小值（数字类型）
  max?: number // 最大值（数字类型）
  step?: number // 步长（数字类型）
  enum?: string[] // 枚举值（如果有则渲染为Select）
  enum_labels?: Record<string, string> // 枚举值显示标签（可选）
  placeholder?: string // 占位符文本
  unit?: string // 单位显示（可选）
  list_item_type?: string // list类型时，列表项的类型（可选）
}

/**
 * 清洗算子
 */
export interface CleaningOperator {
  type: string // 算子类型（唯一标识）
  name: string // 算子名称
  category: string // 所属分类
  description: string // 算子描述
  params_schema?: Record<string, CleaningOperatorParamSchema> // 参数schema定义
}

/**
 * 数据来源枚举
 */
export type CleaningDataSource = 'existed_dataset' | 'upload'

/**
 * 算子配置参数（用于内部状态管理）
 */
export interface OperatorConfig {
  operator_id: string // 算子ID（内部使用）
  params?: Record<string, any> // 算子参数配置
}

/**
 * 清洗算子配置（API格式，符合OpenAPI规范）
 */
export interface CleaningOperatorConfig {
  operator_type: string // 算子类型（必需）
  operator_name?: string | null // 算子名称（用于显示，可选）
  params?: Record<string, any> | null // 算子参数（可选）
  order?: number // 执行顺序（默认0）
}

/**
 * 创建清洗任务请求（符合OpenAPI规范）
 */
export interface CreateCleaningTaskRequest {
  name: string // 任务名称（必需）
  project_id: number // 项目ID（必需，必须大于0）
  source?: CleaningDataSource // 数据来源：existed_dataset/upload（默认existed_dataset）
  input_dataset_id?: number | null // 输入数据集ID（当source=existed_dataset时必需）
  override?: boolean // 是否覆盖原版本（默认false）
  steps: CleaningOperatorConfig[] // 算子流程配置（必需）
  selected_fields?: string[] // 清洗字段列表（可选）
  schedule_at?: string // 定时执行时间，格式：YYYY-MM-DDTHH:mm:ss（可选）
}

/**
 * 清洗模板（内部使用，从 API 响应转换而来）
 */
export interface CleaningTemplate {
  id: number | null // 模板ID
  name?: string // 模板名称（内部使用，用于显示）
  operators: OperatorConfig[] // 算子配置列表（从 steps_json 转换而来）
  created_by?: string | null // 创建人
  created_at?: string | null // 创建时间
  is_system?: boolean // 是否为系统模板（从 is_builtin 转换而来）
  // 以下字段来自 API，但通常不直接使用
  updated_at?: string | null // 更新时间
  created_id?: number | null // 创建者用户ID
  tenant_id?: string | null // 租户id
  project_id?: number // 项目ID
  is_builtin?: boolean // 是否系统内置模板（API 字段）
  steps_json?: CleaningOperatorConfig[] | Record<string, any> | null // 算子流程配置（API 原始字段）
}

/**
 * 清洗模板列表响应（符合 OpenAPI 规范）
 */
export interface CleaningTemplateListResponse {
  items: CleaningTemplateResponse[] // 模板列表（API 原始响应）
  total: number | null // 总记录数
  page: number | null // 当前页码
  size: number | null // 每页数量
  pages: number | null // 总页数
}

/**
 * 创建清洗模板请求（符合OpenAPI规范）
 */
export interface CleaningTemplateCreate {
  project_id: number // 项目ID（必需，必须 > 0）
  steps_json: CleaningOperatorConfig[] // 算子流程配置（必需）
  description?: string | null // 模板描述（可选）
}

/**
 * 创建清洗模板请求（内部使用，向后兼容）
 */
export interface CreateCleaningTemplateRequest {
  name: string // 模板名称
  operators: OperatorConfig[] // 算子配置列表
}

/**
 * 数据集版本信息
 */
export interface DatasetVersion {
  version: string // 版本号
  dataset_id: string // 数据集ID
  dataset_name: string // 数据集名称
  record_count?: number // 记录数
}

/**
 * 清洗步骤快照
 */
export interface CleaningStepSnapshot {
  order: number // 执行顺序
  params: Record<string, any> | null // 算子参数
  operator_name: string // 算子名称
  operator_type: string // 算子类型
}

/**
 * 清洗对比数据项
 */
export interface CleaningComparisonItem {
  mapping_key: string // 数据唯一标识
  before_data: Record<string, any> | null // 清洗前数据
  before_index: number | null // 清洗前索引
  after_data: Record<string, any> | null // 清洗后数据
  after_index: number | null // 清洗后索引
  status: 'modified' | 'filtered' | 'unchanged' // 状态
  changes: Record<string, any> | null // 变更信息
  filter_reason: string | null // 过滤原因
}

/**
 * 清洗任务详情响应
 */
export interface CleaningTaskDetailResponse {
  id: number | null
  created_at: string // ISO 8601 datetime format
  updated_at: string // ISO 8601 datetime format
  created_id: number | null
  created_by: string | null
  tenant_id: string | null
  name: string
  project_id: number
  source: string // 数据来源：existed_dataset/upload
  input_dataset_id: number | null
  output_dataset_id: number | null
  override: boolean
  status: string // 任务状态：准备中、运行中、已完成、失败
  steps_snapshot: CleaningStepSnapshot[] | null // 步骤快照数组
  selected_fields: string[] | null // 清洗字段列表
  total_samples: number | null
  total_characters: number | null
  file_size: number | null // 文件大小（MB）
  dataset_path: string | null
  completed_at: string | null // ISO 8601 datetime format
  input_dataset_name: string | null
  output_dataset_name: string | null
  preview_samples: Record<string, any>[] | null // 预览数据（随机50条，旧格式）
  comparisons?: CleaningComparisonItem[] // 清洗对比数据（新格式）
}

/**
 * 清洗预览数据
 */
export interface CleaningPreviewData {
  before: string // 清洗前内容
  after: string // 清洗后内容
}

export interface CleaningPreviewResponse {
  task_id: number
  samples?: Record<string, any>[] // 旧格式
  comparisons?: CleaningComparisonItem[] // 新格式
  total_count: number
}
/**
 * 清洗任务日志响应
 */
export interface CleaningTaskLogResponse {
  logs: string[] // 日志内容列表
  archived?: boolean // 是否已归档
}

/**
 * 清洗预览请求参数
 */
export interface CleaningPreviewParams {
  task_id: number // 任务ID
  n?: number // 预览条数，默认50
}

/**
 * 清洗模板响应（符合OpenAPI规范）
 */
export interface CleaningTemplateResponse {
  id: number | null // 主键id
  created_at: string | null // 创建时间
  updated_at: string | null // 更新时间
  created_id: number | null // 创建者用户ID
  created_by: string | null // 用户名
  tenant_id: string | null // 租户id
  project_id: number // 项目ID（0表示全局内置模板）
  is_builtin: boolean // 是否系统内置模板（默认 false）
  steps_json: CleaningOperatorConfig[] | Record<string, any> | null // 算子流程配置（可能是数组或对象）
}

export interface cleanningRequest {
  dataset_id: number
  dataset_name: string
  fields: string[]
}
