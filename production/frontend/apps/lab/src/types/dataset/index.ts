// 数据集目录相关类型
export interface DatasetDirectory {
  id: number
  name: string
  description?: string
  project_id: number
  created_at: string
  updated_at: string
  dataset_count?: number // 数据集数量
}

// 带数据集数量的目录类型
export interface DatasetDirectoryWithCount extends DatasetDirectory {
  dataset_count: number
}

export interface Dataset {
  id: number
  project_id: number
  question: string
  ground_truth?: string
  output?: string
  context?: string
  model?: string
  created_at: string
  updated_at: string
  tags?: string[]
  meta_info?: Record<string, unknown>
  directory_id?: number
  directory_name?: string
  retrieval_context?: string[]
  expected_tools?: { name: string }[]
  comments?: string
}

export interface CreateDatasetRequest {
  question: string
  ground_truth?: string
  output?: string
  context?: string
  comments?: string
  meta_info?: Record<string, unknown>
  directory_id?: number
  retrieval_context?: string[]
  expected_tools?: { name: string }[]
  remark?: string
}

export interface SearchParams {
  project_id: number
  skip: number
  limit: number
  question?: string
  tag_ids?: number[]
  tag_match_type?: 'any' | 'all'
  sort_by?: 'created_at' | 'updated_at' | 'question'
  sort_order?: 'desc' | 'asc'
  directory_id?: number
}

export interface DatasetResponse {
  items: Dataset[]
  total: number
  [key: string]: unknown
}

// 数据集目录创建请求类型
export interface CreateDirectoryRequest {
  name: string
  description?: string
  project_id: number
}

// 数据集目录更新请求类型
export interface UpdateDirectoryRequest {
  name?: string
  description?: string
}

// 数据集执行日志类型
export interface DatasetLogResponse {
  id: number
  project_id: number
  dataset_id?: number | null
  question: string
  output?: string
  prompt_id?: number | null
  prompt_messages?: Record<string, unknown>
  llm_config_content?: Record<string, unknown>
  model_id?: number | null
  success: boolean
  request_id?: string
  session_id?: string
  created_at: string
  updated_at: string
  log_type?: string
  execution_time_ms?: number
  error_message?: string
  task_id?: number | null
  [key: string]: unknown
}

// 分页返回类型
export interface Page_DatasetLogResponse_ {
  items: DatasetLogResponse[]
  total: number
  page: number
  size: number
}

// 批量删除请求体
export interface BatchDeleteRequest {
  log_ids: number[]
}
