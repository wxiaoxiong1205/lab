// 任务类型
export enum TaskType {
  DATASET_DISTILLATION = 'dataset-distillation',
  DATASET_OUTPUT_CLEAN = 'dataset-output-clean',
}

// 任务状态
export enum TaskStatus {
  CREATED = 'created',
  QUEUED = 'queued',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// 任务主类型定义
export interface Task {
  id: number
  name: string
  description: string
  celery_task_id: string
  project_id: number
  prompt_id: number | null
  llm_config_id: number | null
  task_type: TaskType | string
  status: TaskStatus | string
  progress: number
  priority: number
  batch_size: number
  max_concurrency: number
  tag_ids: number[]
  tag_match_type: string
  variable_mappings: Record<string, any>
  created_at: string
  updated_at: string
  started_at: string | null
  completed_at: string | null
  total_datasets: number
  processed_datasets: number
  successful_datasets: number
  failed_datasets: number
}

// 创建任务请求体
export interface TaskCreate {
  name: string
  description?: string
  prompt_id?: number | null
  llm_config_id?: number | null
  task_type: TaskType | string
  priority?: number
  batch_size?: number
  max_concurrency?: number
  tag_ids?: number[]
  tag_match_type?: string
  variable_mappings?: Record<string, any>
}

// 更新任务请求体
export interface TaskUpdate extends Partial<TaskCreate> {}

// 任务状态变更请求体
export interface TaskStatusUpdate {
  action: string
}

// 任务分页响应
export interface Page_TaskResponse_ {
  items: Task[]
  total: number
  page: number
  size: number
}

// 任务日志单条
export interface TaskLogItem {
  timestamp: string
  type: string
  message: string
  details?: Record<string, unknown> | string
}

// 任务日志响应
export interface TaskLogsResponse {
  logs: TaskLogItem[]
  total: number
}
