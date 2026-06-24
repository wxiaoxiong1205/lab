import apiClient from './apiClient'

export interface MetricDirectoryCreate {
  name: string
  project_id: number
  description?: string
}

export interface MetricDirectoryUpdate {
  name?: string
  description?: string
}

export interface MetricCreate {
  name: string
  description?: string
  type: string
  is_builtin?: boolean
}

export interface MetricUpdate {
  name?: string
  description?: string
  type?: string
  is_builtin?: boolean
}

export interface MetricBatchDelete {
  metric_ids: number[]
}

export interface MetricSearchParams {
  name?: string
  type?: string
  is_builtin?: boolean
  metric_type?: string
  sort_by?: 'created_at' | 'updated_at' | 'name'
  sort_order?: 'asc' | 'desc'
  page?: number
  size?: number
}

export interface MetricCountParams {
  directory_id?: number
  [key: string]: unknown
}

export interface BuiltinMetric {
  id: number
  name: string
  description?: string
  type: string
  is_builtin: boolean
  required_params: string[]
  params_content?: Record<string, unknown>
  project_id: number
  directory_id: number
  created_at: string
  updated_at: string
}

export interface MetricResponse {
  id: number
  name: string
  description?: string
  type: string
  is_builtin: boolean
  required_params: string[]
  params_content?: Record<string, unknown>
  project_id: number
  directory_id: number
  created_at: string
  updated_at: string
}

export interface PageMetricResponse {
  items: MetricResponse[]
  total: number
  page: number
  size: number
}

export const metricService = {
  // 指标目录相关接口
  createMetricDirectory: (projectId: number, data: MetricDirectoryCreate) => {
    return apiClient.post(`/metric_directories/project/${projectId}`, data)
  },

  listMetricDirectories: (projectId: number) => {
    return apiClient.get(`/metric_directories/project/${projectId}`)
  },

  getMetricDirectory: (projectId: number, directoryId: number) => {
    return apiClient.get(
      `/metric_directories/project/${projectId}/directory/${directoryId}`,
    )
  },

  updateMetricDirectory: (
    projectId: number,
    directoryId: number,
    data: MetricDirectoryUpdate,
  ) => {
    return apiClient.put(
      `/metric_directories/project/${projectId}/directory/${directoryId}`,
      data,
    )
  },

  deleteMetricDirectory: (projectId: number, directoryId: number) => {
    return apiClient.delete(
      `/metrics/directories/project/${projectId}/directory/${directoryId}`,
    )
  },

  // 指标相关接口
  createMetric: (
    projectId: number,
    directoryId: number,
    data: MetricCreate,
  ) => {
    return apiClient.post(
      `/metrics/by-project/${projectId}/directory/${directoryId}/metrics`,
      data,
    )
  },

  getMetric: (projectId: number, directoryId: number, metricId: number) => {
    return apiClient.get(
      `/metrics/by-project/${projectId}/directory/${directoryId}/metric/${metricId}`,
    )
  },

  updateMetric: (
    projectId: number,
    directoryId: number,
    metricId: number,
    data: MetricUpdate,
  ) => {
    return apiClient.put(
      `/metrics/by-project/${projectId}/directory/${directoryId}/metric/${metricId}`,
      data,
    )
  },

  deleteMetric: (projectId: number, directoryId: number, metricId: number) => {
    return apiClient.delete(
      `/metrics/by-project/${projectId}/directory/${directoryId}/metric/${metricId}`,
    )
  },

  batchDeleteMetrics: (
    projectId: number,
    directoryId: number,
    data: MetricBatchDelete,
  ) => {
    return apiClient.post(
      `/metrics/by-project/${projectId}/directory/${directoryId}/batch-delete`,
      data,
    )
  },

  // 分页获取目录下指标
  listMetrics: (
    projectId: number,
    directoryId: number,
    params?: MetricSearchParams,
  ) => {
    return apiClient.get<PageMetricResponse>(
      `/metrics/by-project/${projectId}/directory/${directoryId}/list`,
      { params },
    )
  },

  // 内置指标分页
  listBuiltinMetrics: (params?: { page?: number, size?: number }) => {
    return apiClient.get<PageMetricResponse>('/metrics/builtin', {
      params,
    })
  },

  // 生成评估步骤
  generateEvaluationStep: (data: {
    project_id: number
    llm_config_id: number
    parameters: string[]
    criteria: string
  }) => {
    return apiClient.post(`/metrics/generate-evaluation-steps`, data)
  },
}
