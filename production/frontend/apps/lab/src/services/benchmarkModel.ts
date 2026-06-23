import type { GraphicsCardResource, InferenceParams } from '@/services/manualEvaluationService.ts'

// 基准评估接口定义模型
export interface BenchmarkEvaluationDatasetsResponse {
  id: number // 主键id
  name: string // 数据集名称
  code: string // 数据集代码
  language: string // 语言
  description: string // 数据集描述
  category: string // 分类 枚举值:language_understanding knowledge instruction_followingreasoningcode safety
  model_types: string[] // 适用模型类型：text-generation/image-generation/image-understanding/multimodal，为空表示兼容全部
  sort_order: number // 排序
  original_sample_count: number // 原始样本数
}

export interface CreateBenchmarkEvaluationTaskParams {
  name: string
  description?: string
  model_type: string // 模型类型：model离线模型/service在线服务 枚举值:model service
  model_id: number // 待评估模型/服务ID
  dataset_ids: number[] // 基准评估数据集ID列表
  schedule_enabled: boolean // 是否启用定时任务
  schedule_date?: string // 定时执行日期（启用定时任务时必填）
  schedule_time?: string // 定时执行时间（启用定时任务时必填）
  graphics_card_resource?: GraphicsCardResource
  offline_model_source?: string // 离线模型来源：trained训练模型/base基础模型，仅当 model_type=model 时有效
  model_provider?: string // 仅在 model_type==="service" 才传入
  inference_params: InferenceParams
}

export interface BenchmarkEvaluationDetailResponse {
  id: number
  created_at: string
  created_by: string
  updated_at: string
  name: string
  description: string
  project_id: number
  model_type: string
  schedule_enabled: boolean
  schedule_date: string
  schedule_time: string
  status: string
  progress: number
  lab_k8s_uuid: string
  graphics_card_resource: GraphicsCardResource
  started_at: string
  finished_at: string
  error_message: string
  result_path: string
  log_path: string
  models: CorrelationModel[] // 关联的模型列表
  datasets: CorrelationDatasets[] // 关联的数据集列表
  model_provider: string
  schedule_at?: string
  inference_params?: InferenceParams // 推理参数
}

export interface CorrelationModel {
  id: number
  model_id: number
  model_name: string
  model_version: string
  model_type: string
  sort_order: number
}

export interface CorrelationDatasets {
  id: number
  dataset_id: number
  dataset_name: string
  dataset_code: string
}

export interface BenchmarkTaskConfigParams {
  name: string
  description: string
  model_type: string
  model_id: number
  dataset_ids: number[]
  schedule_enabled: boolean
  schedule_date: string
  schedule_time: string
  graphics_card_resource?: GraphicsCardResource
  model_provider?: string // 仅在 model_type==="service" 才传入
  inference_params: InferenceParams
}

export interface EvaluationReportResponse {
  benchmark_task_id: number
  evaluation_type: string // 评估类型（对比评估/单个评估 默认值single） 默认为单个评估
  model_reports: ModelReportList[] // 每个模型的报告数据列表
}

export interface ModelReportList {
  model_id: number
  model_name: string
  model_version: string
  dataset_scores: { [key: string]: number } // 各数据集得分，键是数据集名称，值是分数
  average_score: number // 平均分
}

export interface ModelReport {
  model_id: number
  model_name: string
  model_version: string
  average_score: number
  dataset_scores: DatasetScores // 各数据集得分（键是数据集名称/代码，值是分数）
}

// 评估报告数据模型 各数据集得分（键是数据集名称/代码，值是分数）
export interface DatasetScores {
  [key: string]: number
}

export interface EvaluationLogsResponse {
  archived: boolean
  logs: string[]
}

export interface RadarChartResponse {
  benchmark_task_id: number
  evaluation_type: string
  model_reports: ModelReport[]
}

export interface BenchmarkEvaluationTaskListResponse {
  items: BenchmarkEvaluationDetailResponse[]
  total: number
  page: number
  size: number
  pages: number
}

export interface LeaderboardListResponse {
  items: LeaderboardListItem[]
  total: number
  page: number
  size: number
  pages: number
}

export interface LeaderboardListItem {
  id: number
  created_at: string
  updated_at: string
  project_id: number
  model_id: number // 模型id
  model_name: string // 模型名称
  model_version: string
  average_score: number // 平均分
  dataset_scores: DatasetScores // 各数据集得分
  last_task_id: number // 最近一次评估任务id
  last_evaluated_at: string
}

export interface CompareBatchResponse {
  benchmark_task_ids: number[] // 基准评估任务ID列表
  evaluation_type: string
  model_reports: ModelReports[]// 每个模型的报告数据列表
}

export interface ModelReports {
  model_id: number
  model_name: string // 模型名称
  model_version: string
  radar_chart_data: RadarChartData1 // 雷达图数据
}

export interface RadarChartData1 {
  data: RadarChartDataItem[]
  model_id: number
  model_name: string // 模型名称
  model_version: string
}

export interface RadarChartDataItem {
  dataset_code: string // 数据集代码
  dataset_name: string // 数据集名称
  score: number // 得分
}

export interface BenchmarkData {
  key: string
  rank: number
  model: string
  modelTag: string
  datasetScores: { [key: string]: string } // 动态数据集得分
}

// 导入通用雷达图的多模型数据类型
export interface RadarChartData {
  subject: string
  modelA: number
  modelB: number
  modelC: number
}

export interface TaskTableItem {
  key: string
  taskName: string
  taskStatus: string
  resultSet: string
  model: string
  creator: string
  createTime: string
  id: number
  started_at?: string | null
  finished_at?: string | null
  progress?: number
  schedule_at?: string
}
