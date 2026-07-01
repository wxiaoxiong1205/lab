import apiClient from './apiClient'

export type ComputeTaskScope = 'total' | 'llm' | 'machine_learning' | string

export interface TaskTypeStatsItem {
  task_scope: ComputeTaskScope
  task_scope_name: string
  count: number
}

export interface TaskTypeStatsResponse {
  project_id: number
  items: TaskTypeStatsItem[]
}

export interface TaskStatusStatsItem {
  status_code: string
  status_name: string
  count: number
}

export interface TaskStatusStatsResponse {
  project_id: number
  task_scope: ComputeTaskScope
  total: number
  statuses: TaskStatusStatsItem[]
}

export interface TaskOverviewSourceRef {
  source_type?: string
  source_id?: number
  source_table?: string
}

export interface LatestComputeTask {
  task_id: number
  task_name: string
  task_scope: ComputeTaskScope
  task_scope_name: string
  task_type: string
  task_type_name: string
  status: string
  status_name: string
  creator_id?: number
  created_by?: string
  created_at?: string
  status_updated_at?: string
  source?: TaskOverviewSourceRef
  detail_ref?: TaskOverviewSourceRef
  list_filter?: Record<string, unknown>
  gpu_type?: string
  gpu_cards?: number
  gpu_memory?: number
  cpu?: number
  memory?: number
}

export interface LatestTaskStatusGroup {
  status: string
  status_name: string
  total_count: number
  page: number
  page_size: number
  total_pages: number
  has_more: boolean
  items: LatestComputeTask[]
}

export interface LatestTasksResponse {
  project_id: number
  task_scope: ComputeTaskScope
  limit_per_status: number
  page: number
  page_size: number
  sort_by: string
  sort_order: string
  groups: LatestTaskStatusGroup[]
}

export type LatestTasksApiResponse = LatestTasksResponse | LatestTaskStatusGroup[]

export interface ResourceUsageValue {
  used: number
  total: number
  unit: string
}

export interface ComputeResourceUsageResponse {
  project_id: number
  cluster_id: number
  cluster_name: string
  resource_type: string
  resource_card_model: string
  scope: ComputeTaskScope
  gpu_cards: ResourceUsageValue
  gpu_memory: ResourceUsageValue
  cpu: ResourceUsageValue
  memory: ResourceUsageValue
  raw?: Record<string, unknown>
}

interface LatestTasksParams {
  task_scope: ComputeTaskScope
  statuses?: string[]
  page?: number
  page_size?: number
}

export const taskOverviewService = {
  getTaskTypeStats: async (projectId: number) => {
    const response = await apiClient.get<TaskTypeStatsResponse>(
      `/projects/${projectId}/compute-task-overview/task-type-stats`,
    )
    return response.data
  },

  getStatusStats: async (projectId: number, taskScope: ComputeTaskScope) => {
    const response = await apiClient.get<TaskStatusStatsResponse>(
      `/projects/${projectId}/compute-task-overview/status-stats`,
      { params: { task_scope: taskScope } },
    )
    return response.data
  },

  getLatestTasks: async (projectId: number, params: LatestTasksParams) => {
    const response = await apiClient.get<LatestTasksApiResponse>(
      `/projects/${projectId}/compute-task-overview/latest-tasks`,
      {
        params: {
          task_scope: params.task_scope,
          ...(params.statuses?.length ? { statuses: params.statuses.join(',') } : {}),
          page: params.page ?? 1,
          page_size: params.page_size ?? 4,
        },
      },
    )
    return response.data
  },

  getProjectResources: async (
    projectId: number,
    clusterId: number | undefined,
    taskScope: ComputeTaskScope,
  ) => {
    const response = await apiClient.get<ComputeResourceUsageResponse>(
      `/projects/${projectId}/compute-task-overview/project-resources`,
      { params: { cluster_id: clusterId, task_scope: taskScope } },
    )
    return response.data
  },

  getClusterResources: async (projectId: number, clusterId?: number) => {
    const response = await apiClient.get<ComputeResourceUsageResponse>(
      `/projects/${projectId}/compute-task-overview/cluster-resources`,
      { params: { cluster_id: clusterId } },
    )
    return response.data
  },
}
