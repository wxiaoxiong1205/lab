/**
 * 数据清洗服务
 */
import apiClient from './apiClient'
import type {
  CleaningOperator,
  CleaningOperatorCategory,
  CleaningPreviewResponse,
  CleaningTaskDetailResponse,
  CleaningTaskListResponse,
  CleaningTaskLogResponse,
  CleaningTaskSearchParams,
  CleaningTemplateCreate,
  CleaningTemplateListResponse,
  CleaningTemplateResponse,
  CreateCleaningTaskRequest,
  CreateCleaningTemplateRequest,
  PageCleaningTaskListResponse,
  cleanningRequest,
} from '@/types/cleaning'
import {
  OperatorConfig,
} from '@/types/cleaning'

/**
 * 数据清洗任务服务
 */
export const cleaningService = {
  /**
   * 获取项目下的清洗任务列表
   * @param params 搜索参数
   * @returns Promise<PageCleaningTaskListResponse> 清洗任务列表响应
   */
  getTasks: async (
    params: CleaningTaskSearchParams,
  ): Promise<PageCleaningTaskListResponse> => {
    const response = await apiClient.get<PageCleaningTaskListResponse>(
      `/data_cleaning/${params.project_id}/tasks`,
      {
        params: {
          project_id: params.project_id,
          name: params.name || undefined,
          status: params.status || undefined,
          page: params.page || 1,
          size: params.size || 50,
        },
      },
    )
    return response.data
  },

  /**
   * 创建清洗任务
   * @param data 创建任务请求数据
   * @returns Promise<CleaningTaskListResponse> 创建的任务信息
   */
  createTask: async (
    data: CreateCleaningTaskRequest,
  ): Promise<CleaningTaskListResponse> => {
    const response = await apiClient.post<CleaningTaskListResponse>(
      `/data_cleaning/${data.project_id}/tasks`,
      data,
    )
    return response.data
  },

  /**
   * 获取清洗任务详情
   * @param taskId 任务ID
   * @returns Promise<CleaningTaskListResponse> 任务详情
   */
  getTask: async (taskId: number): Promise<CleaningTaskListResponse> => {
    const response = await apiClient.get<CleaningTaskListResponse>(
      `/data_cleaning/tasks/${taskId}`,
    )
    return response.data
  },

  /**
   * 获取清洗任务详情与结果预览（随机50条）
   * @param taskId 任务ID
   * @returns Promise<CleaningTaskDetailResponse> 任务详情和预览数据
   */
  getTaskDetail: async (taskId: number): Promise<CleaningTaskDetailResponse> => {
    const response = await apiClient.get<CleaningTaskDetailResponse>(
      `/data_cleaning/tasks/${taskId}/comparison`,
    )
    return response.data
  },

  /**
   * 更新清洗任务配置
   * @param projectId 项目ID
   * @param taskId 任务ID
   * @param data 更新数据
   * @returns Promise<CleaningTaskListResponse> 更新后的任务信息
   */
  updateTask: async (
    projectId: number,
    taskId: number,
    data: Partial<CreateCleaningTaskRequest>,
  ): Promise<CleaningTaskListResponse> => {
    const response = await apiClient.put<CleaningTaskListResponse>(
      `/data_cleaning/${projectId}/tasks/${taskId}`,
      data,
    )
    return response.data
  },

  /**
   * 删除清洗任务
   * @param taskId 任务ID
   * @returns Promise<void>
   */
  deleteTask: async (taskId: number): Promise<void> => {
    await apiClient.delete(`/data_cleaning/tasks/${taskId}`)
  },

  /**
   * 执行清洗任务
   * @param taskId 任务ID
   * @returns Promise<void>
   */
  runTask: async (taskId: number): Promise<void> => {
    await apiClient.post(`/data_cleaning/tasks/${taskId}/run`)
  },

  /**
   * 停止清洗任务
   * @param projectId 项目ID
   * @param taskId 任务ID
   * @returns Promise<void>
   */
  stopTask: async (projectId: number, taskId: number): Promise<void> => {
    await apiClient.post(`/data_cleaning/${projectId}/tasks/${taskId}/stop`)
  },

  /**
   * 获取按分类组织的清洗算子列表
   * @returns Promise<CleaningOperatorCategory> 算子分类列表响应
   */
  getOperatorsByCategory: async (): Promise<CleaningOperatorCategory> => {
    const response = await apiClient.get<CleaningOperatorCategory>(
      '/data_cleaning/operators/categories',
    )
    return response.data
  },

  /**
   * 获取可用的清洗算子列表（平铺）
   * @returns Promise<CleaningOperator[]> 算子列表
   */
  getOperatorsList: async (): Promise<CleaningOperator[]> => {
    const response = await apiClient.get<CleaningOperator[]>(
      '/data_cleaning/operators',
    )
    return response.data
  },

  /**
   * 获取清洗模板列表
   * @param projectId 项目ID（必需）
   * @param page 页码（可选，默认1）
   * @param size 每页数量（可选，默认50）
   * @returns Promise<CleaningTemplateListResponse> 模板列表响应
   */
  getTemplates: async (
    projectId: number,
    page?: number,
    size?: number,
    operator_type?: string,
    created_by?: string,
  ): Promise<CleaningTemplateListResponse> => {
    const response = await apiClient.get<CleaningTemplateListResponse>(
      `/data_cleaning/${projectId}/templates`,
      {
        params: {
          page: page || 1,
          size: size || 50,
          operator_type: operator_type || undefined,
          created_by: created_by || undefined,
        },
      },
    )
    return response.data
  },

  /**
   * 获取清洗模板详情
   * @param templateId 模板ID
   * @returns Promise<CleaningTemplateResponse> 模板详情
   */
  getTemplate: async (templateId: number): Promise<CleaningTemplateResponse> => {
    const response = await apiClient.get<CleaningTemplateResponse>(
      `/data_cleaning/templates/${templateId}`,
    )
    return response.data
  },

  /**
   * 创建清洗模板
   * @param data 创建模板请求数据（符合OpenAPI规范）
   * @returns Promise<CleaningTemplateResponse> 创建的模板信息
   */
  createTemplate: async (
    data: CleaningTemplateCreate,
  ): Promise<CleaningTemplateResponse> => {
    const response = await apiClient.post<CleaningTemplateResponse>(
      `/data_cleaning/${data.project_id}/templates`,
      data,
    )
    return response.data
  },

  /**
   * 更新清洗模板
   * @param templateId 模板ID
   * @param data 更新数据
   * @returns Promise<CleaningTemplateResponse> 更新后的模板信息
   */
  updateTemplate: async (
    templateId: number,
    data: Partial<CreateCleaningTemplateRequest>,
  ): Promise<CleaningTemplateResponse> => {
    const response = await apiClient.put<CleaningTemplateResponse>(
      `/data_cleaning/templates/${templateId}`,
      data,
    )
    return response.data
  },

  /**
   * 删除清洗模板
   * @param templateId 模板ID
   * @returns Promise<void>
   */
  deleteTemplate: async (templateId: number): Promise<void> => {
    await apiClient.delete(`/data_cleaning/templates/${templateId}`)
  },

  /**
   * 应用模板到任务并保存执行快照
   * @param taskId 任务ID
   * @param templateId 模板ID
   * @returns Promise<void>
   */
  applyTemplateToTask: async (
    taskId: number,
    templateId: number,
  ): Promise<void> => {
    await apiClient.post(`/data_cleaning/tasks/${taskId}/apply-template`, {
      template_id: templateId,
    })
  },

  /**
   * 获取清洗结果预览（随机N条）
   * @param taskId 任务ID
   * @param sampleCount 预览条数，默认50，最大100
   * @returns Promise<CleaningPreviewResponse> 预览数据响应
   */
  getPreview: async (
    taskId: number,
    sampleCount: number = 50,
  ): Promise<CleaningPreviewResponse> => {
    const response = await apiClient.get<CleaningPreviewResponse>(
      `/api/v1/data_cleaning/tasks/${taskId}/preview`,
      {
        params: {
          sample_count: sampleCount,
        },
      },
    )
    return response.data
  },

  /**
   * 获取清洗任务日志详情
   * @param taskId 任务ID
   * @returns Promise<CleaningTaskLogResponse> 日志响应
   */
  getTaskLog: async (taskId: number): Promise<CleaningTaskLogResponse> => {
    const response = await apiClient.get<CleaningTaskLogResponse>(
      `/data_cleaning/tasks/${taskId}/logs`,
    )
    return response.data
  },

  /**
   * 下载清洗结果或日志
   * @param taskId 任务ID
   * @param type 下载类型：result（结果）或 log（日志）
   * @returns Promise<Blob> 文件数据
   */
  downloadResult: async (
    taskId: number,
    type: 'result' | 'log' = 'result',
  ): Promise<Blob> => {
    const response = await apiClient.get<Blob>(
      `/data_cleaning/tasks/download/${type}/${taskId}`,
      {
        responseType: 'blob',
      },
    )
    return response.data
  },

  getCleaningWords: async (
    dataset_id: number,
  ): Promise<cleanningRequest> => {
    const response = await apiClient.get<cleanningRequest>(
      `/data_cleaning/datasets/${dataset_id}/fields`,
    )
    return response.data
  },
}
