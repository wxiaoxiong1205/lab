import apiClient from './apiClient'
import type {
  BenchmarkEvaluationDatasetsResponse,
  BenchmarkEvaluationDetailResponse,
  BenchmarkEvaluationTaskListResponse,
  BenchmarkTaskConfigParams,
  CompareBatchResponse,
  CreateBenchmarkEvaluationTaskParams,
  EvaluationLogsResponse, EvaluationReportResponse,
  LeaderboardListResponse, RadarChartResponse,
} from './benchmarkModel.ts'

// 基准评估所需接口
export const benchmarkEvaluationServices = {

  // 获取基准评估数据集列表（按分类、模型类型组织）；含全局 + 当前租户数据集
  getBenchmarkEvaluationDatasets: async (category?: string, model_type?: string) => {
    const response = await apiClient.get<BenchmarkEvaluationDatasetsResponse[]>('/benchmark/datasets', {
      params: {
        category,
        model_type,
      },
    })
    return response.data
  },

  // 创建基准评估任务
  createBenchmarkEvaluationTask: async (project_Id?: number, params?: CreateBenchmarkEvaluationTaskParams) => {
    const response = await apiClient.post(`/benchmark/project/${project_Id}/tasks`, params)
    return response.data
  },

  // 获取项目下的基准评估任务列表（分页）
  getBenchmarkEvaluationTasks: async (project_Id?: number, params?: { page?: number, size?: number, status?: string }) => {
    const response = await apiClient.get<BenchmarkEvaluationTaskListResponse>(`/benchmark/project/${project_Id}/tasks`, {
      params: {
        page: params?.page || 1,
        size: params?.size || 10,
        status: params?.status,
      },
    })
    return response.data
  },

  // 获取指定基准评估任务详情
  getBenchmarkEvaluationDetail: async (project_Id?: number, id?: number) => {
    const response = await apiClient.get<BenchmarkEvaluationDetailResponse>(`/benchmark/project/${project_Id}/tasks/${id}`)
    return response.data
  },

  // 编辑任务配置
  updateBenchmarkTaskConfig: async (project_Id?: number, id?: number, params?: BenchmarkTaskConfigParams) => {
    const response = await apiClient.put(`/benchmark/project/${project_Id}/tasks/${id}`, params)
    return response.data
  },

  // 删除任务（运行中需先终止）
  deleteBenchmarkTask: async (project_Id?: number, id?: number) => {
    const response = await apiClient.delete(`/benchmark/project/${project_Id}/tasks/${id}`)
    return response.data
  },

  // 启动任务
  startBenchmarkTask: async (project_Id?: number, id?: number) => {
    const response = await apiClient.post(`/benchmark/project/${project_Id}/tasks/${id}/start`)
    return response.data
  },

  // 终止任务
  cancelBenchmarkTask: async (project_Id?: number, id?: number) => {
    const response = await apiClient.post(`/benchmark/project/${project_Id}/tasks/${id}/cancel`)
    return response.data
  },

  // 重新提交任务（失败/已取消状态）
  resubmitBatchTask: async (project_Id?: number, id?: number) => {
    const response = await apiClient.post(`/benchmark/project/${project_Id}/tasks/${id}/resubmit`)
    return response.data
  },

  // 克隆任务
  cloneBatchTask: async (project_Id?: number, id?: number) => {
    const response = await apiClient.post<BenchmarkEvaluationDetailResponse>(`/benchmark/project/${project_Id}/tasks/${id}/clone`)
    return response.data
  },

  // 对比评估（传入任务ID列表，2-5个，返回对比数据）
  compareBatchTask: async (project_Id?: number, params?: { task_ids: number[] }) => {
    const response = await apiClient.post<CompareBatchResponse>(`/benchmark/project/${project_Id}/tasks/compare`, params)
    return response.data
  },

  // 获取评估报告
  getBatchEvaluationReport: async (project_Id?: number, id?: number) => {
    const response = await apiClient.get<EvaluationReportResponse>(`/benchmark/project/${project_Id}/tasks/${id}/report`)
    return response.data
  },

  // 获取基准评估任务日志
  getBatchEvaluationLogs: async (project_Id?: number, id?: number) => {
    const response = await apiClient.get<EvaluationLogsResponse>(`/benchmark/project/${project_Id}/tasks/${id}/logs`)
    return response.data
  },

  // 下载基准评估任务日志文件（优先归档日志，其次 Loki 实时日志）
  downloadBatchEvaluationLogs: async (project_Id?: number, id?: number) => {
    const response = await apiClient.get<EvaluationLogsResponse>(`/benchmark/project/${project_Id}/tasks/download/log/${id}`)
    return response.data
  },

  // 获取榜单列表（分页、支持按平均分或指定数据集得分排序）
  getLeaderboardList: async (project_Id?: number, params?: { sort_by?: string, sort_order?: string, page?: number, size?: number }) => {
    const response = await apiClient.get<LeaderboardListResponse>(`/benchmark/project/${project_Id}/leaderboard`, {
      params: {
        sort_by: params?.sort_by,
        sort_order: params?.sort_order,
        page: params?.page || 1,
        size: params?.size || 10,
      },
    })
    return response.data
  },

  // 获取雷达图数据
  getLeaderboardRadarChart: async (project_Id?: number, params?: { model_ids: number | number[] }) => {
    let queryString = ''
    if (params?.model_ids !== undefined) {
      const modelIds = Array.isArray(params.model_ids) ? params.model_ids : [params.model_ids]
      queryString = modelIds.map((id) => `model_ids=${id}`).join('&')
    }

    const url = `/benchmark/project/${project_Id}/leaderboard/radar-chart${queryString ? `?${queryString}` : ''}`
    const response = await apiClient.get<RadarChartResponse>(url)
    return response.data
  },

  // 下载数据集评测结果 //数据集代码（如 humaneval）model_id 模型id
  downDatasetResult: async (project_Id?: number, id?: number, params?: { dataset_code?: string, model_id?: number }) => {
    const response = await apiClient.get(`/benchmark/project/${project_Id}/tasks/${id}/download-result`, {
      params: {
        dataset_code: params.dataset_code,
        model_id: params?.model_id || null,
      },
      responseType: 'blob', // 设置为 blob 类型以处理文件下载
    })
    return response
  },
  downCompareResult: async (project_Id?: number, id?: number) => {
    const response = await apiClient.get(`/benchmark/project/${project_Id}/tasks/${id}/report/download-docx`, {
      responseType: 'blob', // 设置为 blob 类型以处理文件下载
    })
    return response
  },

  // 下载对比评估报告结果（传入任务 id 数组，与对比评估一致）
  downCompareResults: async (project_Id?: number, task_ids?: number[]) => {
    const response = await apiClient.post(
      `/benchmark/project/${project_Id}/tasks/compare/download-docx`,
      { task_ids },
      { responseType: 'blob' },
    )
    return response
  },
}
