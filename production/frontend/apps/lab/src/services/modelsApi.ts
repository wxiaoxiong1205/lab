/*
 * @Author: fangjun fangjun@deepexi.com
 * @Date: 2025-09-11 09:33:41
 * @LastEditors: fangjun fangjun@deepexi.com
 * @LastEditTime: 2025-09-22 16:03:21
 * @FilePath: \deepexi-lab-web\src\services\modelsApi.ts
 * @Description: model相关接口
 */
import apiClient from './apiClient'
import type {
  AllTrainedModelsParamsType,
  AllTrainedModelsResponse,
  BaseModel, BaseModelListResponse,
  CreateBaseModelParams,
  CreateTrainedModelParams, GetBaseModelsParams,
  GetModelListParams,
  ModelListResponse,
  ModelSourceOption,
  ModelStatusOption,
  ModelVersionListResponse,
} from '@/types/model'

export const ModelService = {
  /**
   * 获取基础模型列表
   * @param params 查询参数
   * @returns Promise<基础模型列表响应>
   */
  getBaseModels: async (params?: GetBaseModelsParams) => {
    const response = await apiClient.get<BaseModelListResponse>('/models/base/list', {
      params: {
        model_type: params?.model_type || '',
        model_provider: params?.model_provider || '',
        ...(params?.is_available !== false ? { is_available: params?.is_available } : {}),
        page: params?.page || 1,
        size: params?.size || 50,
        model_tags: params?.model_tags,
      },
    })
    return response.data
  },
  getBaseModelsByProjectId: async (projectId: number, params?: GetBaseModelsParams) => {
    const response = await apiClient.get<BaseModelListResponse>(`/models/trained/project/${projectId}`, {
      params,
    })
    return response.data
  },
  getMlModelList: async (projectId: number, params: { page: number, size: number }) => {
    const response = await apiClient.get<ModelListResponse>(`/models/ml/project/${projectId}`, { params })
    return response.data
  },
  /**
   * 创建基础模型
   */
  CreateBaseModel: async (params?: CreateBaseModelParams) => {
    const response = await apiClient.post<BaseModel>(`/models/base`, params)
    return response.data
  },
  /**
   * 更新基础模型
   */
  UpdateBaseModel: async (id: string, params?: Partial<CreateBaseModelParams>) => {
    const response = await apiClient.put<BaseModel>(`/models/base`, { id, ...params })
    return response.data
  },
  /**
   * 删除基础模型
   */
  DeleteBaseModel: async (id: string) => {
    const response = await apiClient.delete<BaseModel>(`/models/base/${id}`)
    return response.data
  },
  /**
   * 创建训练模型
   */
  CreateTrainedModel: async (params?: CreateTrainedModelParams) => {
    const response = await apiClient.post<BaseModel>(`/models/trained`, params)
    return response.data
  },
  /**
   * 编辑训练模型（更新指定版本）
   * PUT /api/v1/trained/{trained_model_id}
   */
  updateTrainedModel: async (trainedModelId: number | string, params: Partial<CreateTrainedModelParams>) => {
    const response = await apiClient.put(`/models/trained/${trainedModelId}`, params)
    return response.data
  },
  /**
   * 根据模型名称获取该模型的所有版本
   */
  getModelVersions: async (projectId: number, modelName: string, status?: string) => {
    const response = await apiClient.get<ModelVersionListResponse[]>(`/models/trained/project/${projectId}/model/${modelName}`, {
      params: {
        status,
      },
    })
    return response.data
  },
  /**
   *
   * 删除模型指定版本
   */
  deleteModelVersion: async (projectId: number, modelName: string, version: string) => {
    const response = await apiClient.delete<ModelVersionListResponse>(`/models/trained/project/${projectId}/model/${modelName}/${version}`)
    return response.data
  },
  /**
   *
   * 删除模型
   */
  deleteModel: async (projectId: number, modelName: string) => {
    const response = await apiClient.delete<ModelVersionListResponse>(`/models/trained/project/${projectId}/model/${modelName}`)
    return response.data
  },

  getModelList: async (params: GetModelListParams) => {
    const response = await apiClient.get<string[]>('/models/public/list', { params })
    return response.data
  },

  deleteModelList: async (id: number) => {
    const response = await apiClient.delete(`/models/base/${id}`)
    return response
  },
  /**
   * 获取模型训练日志（支持ISO时间格式）
   * @param projectId 项目ID
   * @param taskId 训练任务ID
   * @param endTime 结束时间（ISO格式），用于指定Loki查询的结束时间点
   * @param days 如果没有归档日志，从结束时间往前查询N天的日志，默认值30
   * @returns Promise<any> 训练任务日志
   */
  getModelLogs: async (projectId: number, taskId: number, endTime: string, days?: number): Promise<any> => {
    const response = await apiClient.get(`/models/trained/project/${projectId}/model/${taskId}/logs`, {
      params: {
        end_time: endTime,
        start_time: endTime,
        // days: days ?? 30 // 使用默认值30
      },
    })
    return response.data
  },
  /**
   * 获取指定时间范围内的模型训练日志
   * @param projectId 项目ID
   * @param taskId 训练任务ID
   * @param startTime 开始时间戳
   * @param endTime 结束时间戳
   * @returns Promise<any> 训练任务日志
   */
  getModelLogsByTime: async (projectId: number, taskId: number, startTime: string, endTime: string, signal?: AbortSignal): Promise<any> => {
    const response = await apiClient.get(`/models/trained/project/${projectId}/model/${taskId}/logs/range`, {
      params: {
        start_time: startTime,
        end_time: endTime,
      },
      signal,
    })
    return response.data
  },

  /**
   *
   * @returns Promise<any[]> 模块来源枚举值
   */
  getMoudleSorceEnums: async () => {
    const response = await apiClient.get<ModelSourceOption[]>('/models/enums/model-source')
    return response.data
  },

  /**
   * 基础模型状态枚举
   */
  getBaseModelStatusEnums: async () => {
    const response = await apiClient.get<ModelStatusOption[]>('/models/enums/model-status')
    return response.data
  },

  /**
   * 终止模型管理（训练）任务
   * POST /models/trained/project/{project_id}/task/{task_id}/stop
   */
  stopTrainedTask: async (projectId: number, taskId: number): Promise<void> => {
    await apiClient.post(`/models/trained/project/${projectId}/task/${taskId}/stop`)
  },

  /**
   * 终止基础模型下载任务
   * POST /models/base/model/download/{task_id}/stop
   */
  stopBaseModelDownload: async (taskId: string): Promise<void> => {
    await apiClient.post(`/models/base/model/download/${taskId}/stop`)
  },

  /**
   * 获取所有训练模型列表，包含版本
   */
  getAllTrainedModels: async (projectId: number, params?: AllTrainedModelsParamsType) => {
    const response = await apiClient.get<AllTrainedModelsResponse>(`/models/trained/project/${projectId}/all-versions`, { params })
    return response.data
  },
}
