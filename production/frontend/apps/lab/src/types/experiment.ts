// 实验管理相关的TypeScript类型定义

// 实验运行状态枚举
export enum ExperimentRunStatus {
  RUNNING = 'RUNNING',
  FINISHED = 'FINISHED',
  FAILED = 'FAILED',
  KILLED = 'KILLED',
}

// 实验状态枚举
export enum ExperimentStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
  DELETED = 'DELETED',
}

// 指标类型枚举
export enum MetricType {
  ACCURACY = 'accuracy',
  PRECISION = 'precision',
  RECALL = 'recall',
  F1_SCORE = 'f1_score',
  AUC_ROC = 'auc_roc',
  AUC_PR = 'auc_pr',
  LOSS = 'loss',
  MSE = 'mse',
  RMSE = 'rmse',
  MAE = 'mae',
  R_SQUARED = 'r_squared',
  BLEU = 'bleu',
  ROUGE = 'rouge',
  CUSTOM = 'custom',
}

// 参数类型枚举
export enum ParameterType {
  HYPERPARAMETER = 'hyperparameter',
  MODEL_PARAMETER = 'model_parameter',
  DATA_PARAMETER = 'data_parameter',
  ENVIRONMENT_PARAMETER = 'environment_parameter',
}

// 实验项目基础信息
export interface Experiment {
  id: string
  name: string
  description?: string
  project_id: string
  mlflow_experiment_id?: string
  status: ExperimentStatus
  run_count: number
  success_count: number
  failed_count: number
  avg_duration?: number // 平均运行时长（秒）
  best_metric_value?: number // 最佳指标值
  best_metric_name?: string // 最佳指标名称
  tags?: string[]
  created_at: string
  updated_at: string
  created_by: string
}

// 实验运行记录
export interface ExperimentRun {
  id: string
  name: string
  task_name?: string
  version_count?: number
  experiment_id: string
  project_id: string
  mlflow_run_id?: string
  status: ExperimentRunStatus
  start_time: string
  end_time?: string
  duration?: number // 运行时长（秒）
  parameters: Record<string, string | number | boolean>
  metrics: Record<string, number>
  tags: Record<string, string>
  artifacts?: string[] // 产物文件路径
  model_info?: {
    model_type: string
    model_size?: number
    model_path?: string
  }
  resource_info?: {
    cpu_usage?: number
    memory_usage?: number
    gpu_usage?: number
    disk_usage?: number
  }
  created_at: string
  updated_at: string
  created_by: string
}

// 实验运行记录详情（包含更多信息）
export interface ExperimentRunDetail extends ExperimentRun {
  logs?: string[] // 日志信息
  metric_history?: MetricHistory[] // 指标历史记录
  parameter_history?: ParameterHistory[] // 参数历史记录
  environment_info?: EnvironmentInfo // 环境信息
}

// 指标历史记录
export interface MetricHistory {
  metric_name: string
  metric_type: MetricType
  timestamp: string
  value: number
  step?: number
}

// 参数历史记录
export interface ParameterHistory {
  parameter_name: string
  parameter_type: ParameterType
  value: string | number | boolean
  timestamp: string
}

// 环境信息
export interface EnvironmentInfo {
  python_version: string
  framework_version: string
  cuda_version?: string
  hardware_info: {
    cpu_model: string
    gpu_model?: string
    memory_total: number
    disk_total: number
  }
  os_info: {
    os_name: string
    os_version: string
  }
}

// 实验对比数据
export interface ExperimentComparison {
  runs: ExperimentRun[]
  parameter_comparison: ParameterComparison[]
  metric_comparison: MetricComparison[]
  best_run?: ExperimentRun
  summary: ComparisonSummary
}

// 参数对比
export interface ParameterComparison {
  parameter_name: string
  parameter_type: ParameterType
  values: Record<string, string | number | boolean> // run_id -> value
  is_different: boolean
}

// 指标对比
export interface MetricComparison {
  metric_name: string
  metric_type: MetricType
  values: Record<string, number> // run_id -> value
  best_value: number
  best_run_id: string
  improvement_percentage?: number
}

// 对比总结
export interface ComparisonSummary {
  total_runs: number
  different_parameters: number
  compared_metrics: number
  best_overall_run_id: string
  recommendations: string[]
}

// MLflow配置
export interface MLflowConfig {
  id: string
  name: string
  server_url: string
  username?: string
  password?: string
  token?: string
  is_active: boolean
  is_connected: boolean
  last_sync_time?: string
  connection_status: 'connected' | 'disconnected' | 'error'
  created_at: string
  updated_at: string
}

// 搜索和筛选条件
export interface ExperimentSearchParams {
  keyword?: string
  status?: ExperimentStatus[]
  tags?: string[]
  created_by?: string
  created_after?: string
  created_before?: string
  sort_by?: 'created_at' | 'updated_at' | 'name' | 'run_count'
  sort_order?: 'asc' | 'desc'
  page?: number
  page_size?: number
  size?: number
}

export interface ExperimentRunSearchParams {
  experiment_id?: string
  keyword?: string
  status?: ExperimentRunStatus[]
  created_by?: string
  model_type?: string
  created_after?: string
  created_before?: string
  duration_min?: number
  duration_max?: number
  sort_by?: 'created_at' | 'duration' | 'status' | 'name'
  sort_order?: 'asc' | 'desc'
  page?: number
  page_size?: number
  size?: number
}

// 创建实验请求
export interface CreateExperimentRequest {
  name: string
  description?: string
  tags?: string[]
}

// 创建实验运行请求
export interface CreateExperimentRunRequest {
  name: string
  experiment_id: string
  parameters: Record<string, string | number | boolean>
  tags?: Record<string, string>
}

// 更新实验请求
export interface UpdateExperimentRequest {
  name?: string
  description?: string
  status?: ExperimentStatus
  tags?: string[]
}

// 更新实验运行请求
export interface UpdateExperimentRunRequest {
  name?: string
  status?: ExperimentRunStatus
  parameters?: Record<string, string | number | boolean>
  metrics?: Record<string, number>
  tags?: Record<string, string>
}

// 分页响应
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

// API响应包装
export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
  error?: string
}

// 实验统计信息
export interface ExperimentStats {
  total_experiments: number
  active_experiments: number
  total_runs: number
  running_runs: number
  success_rate: number
  avg_run_duration: number
  popular_models: Array<{
    model_type: string
    count: number
  }>
  recent_activity: Array<{
    type: 'experiment_created' | 'run_started' | 'run_completed'
    message: string
    timestamp: string
  }>
}
