/*
 * @Author: fangjun fangjun@deepexi.com
 * @Date: 2025-01-XX XX:XX:XX
 * @LastEditors: fangjun fangjun@deepexi.com
 * @LastEditTime: 2025-01-XX XX:XX:XX
 * @FilePath: \deepexi-lab-web\src\services\inferenceApi.ts
 * @Description: 推理结果集相关接口
 */
import apiClient from './apiClient'
import type {
  CreateInferenceResultSetRequest,
  CreateInferenceResultSetResponse,
  InferenceResultSetListResponse,
  InferenceResultSetSearchParams,
} from '@/types/inference/index'

// 推理结果集服务
export const inferenceResultSetService = {
  /**
   * 获取推理结果集列表
   * @param projectId 项目ID
   * @param params 搜索参数
   * @returns 推理结果集列表响应
   */
  list: async (
    projectId: number,
    params: InferenceResultSetSearchParams,
  ): Promise<InferenceResultSetListResponse> => {
    const response = await apiClient.get<InferenceResultSetListResponse>(
      `/inference-result-datasets/project/${projectId}/list`,
      { params },
    )
    return response.data
  },

  /**
   * 获取推理结果集基本信息
   * @param projectId 项目ID
   * @param datasetId 数据集ID
   * @returns 推理结果集基本信息
   */
  get: async (projectId: number, datasetId: string | number) => {
    const response = await apiClient.get<any>(
      `/inference-result-datasets/project/${projectId}/dataset/${datasetId}`,
    )
    return response.data
  },

  /**
   * 获取推理结果集详情
   * @param projectId 项目ID
   * @param datasetId 数据集ID
   * @returns 推理结果集详情
   */
  detail: async (projectId: number, datasetId: string | number) => {
    const response = await apiClient.get<any>(
      `/inference-result-datasets/project/${projectId}/dataset/${datasetId}`,
    )
    return response.data
  },

  /**
   * 创建推理结果集
   * @param projectId 项目ID
   * @param requestData 创建请求数据
   * @returns 创建结果响应
   */
  create: async (
    projectId: number,
    requestData: CreateInferenceResultSetRequest,
  ): Promise<CreateInferenceResultSetResponse> => {
    // 接口要求所有情况都使用multipart/form-data格式
    const formData = new FormData()

    // 基础字段
    formData.append('name', requestData.name)
    if (requestData.description) {
      formData.append('description', requestData.description)
    }
    formData.append('inference_method', requestData.inference_method)
    if (requestData.usage) {
      formData.append('usage', requestData.usage)
    }

    // 根据推理方式添加相应字段
    if (requestData.inference_method === 'offline') {
      // 离线推理
      if (requestData.model_id !== undefined) {
        formData.append('model_id', String(requestData.model_id))
      }
      if (requestData.model_name) {
        formData.append('model_name', requestData.model_name)
      }
      if (requestData.source_dataset_id !== undefined) {
        formData.append('source_dataset_id', String(requestData.source_dataset_id))
      }
      if (requestData.source_dataset_name) {
        formData.append('source_dataset_name', requestData.source_dataset_name)
      }
      if (requestData.inference_params) {
        formData.append('inference_params', requestData.inference_params)
      }
      if (requestData.graphics_card_resource) {
        formData.append('graphics_card_resource', requestData.graphics_card_resource)
      }
      if (requestData.model_source) {
        formData.append('model_source', requestData.model_source)
      }
      if (requestData.time) {
        formData.append('schedule_at', requestData.time)
      }
    }
    else if (requestData.inference_method === 'online') {
      // 在线推理
      if (requestData.online_service_id !== undefined) {
        formData.append('online_service_id', String(requestData.online_service_id))
      }
      if (requestData.online_service_name) {
        formData.append('online_service_name', requestData.online_service_name)
      }
      if (requestData.model_name) {
        formData.append('model_name', requestData.model_name)
      }
      if (requestData.source_dataset_id !== undefined) {
        formData.append('source_dataset_id', String(requestData.source_dataset_id))
      }
      if (requestData.source_dataset_name) {
        formData.append('source_dataset_name', requestData.source_dataset_name)
      }
      if (requestData.inference_params) {
        formData.append('inference_params', requestData.inference_params)
      }
      if (requestData.time) {
        formData.append('schedule_at', requestData.time)
      }
    }
    else if (requestData.inference_method === 'import') {
      // 导入推理结果集
      if (requestData.upload_method) {
        formData.append('upload_method', requestData.upload_method)
      }
      if (requestData.file_url) {
        formData.append('file_url', requestData.file_url)
      }
      if (requestData.files && requestData.files.length > 0) {
        requestData.files.forEach((file) => {
          formData.append('files', file)
        })
      }
      if (requestData.chunk_upload_ids && requestData.chunk_upload_ids.length > 0) {
        requestData.chunk_upload_ids.forEach((id) => {
          formData.append('chunk_upload_ids', id)
        })
      }
      if (requestData.model_name) {
        formData.append('model_name', requestData.model_name)
      }
      if (requestData.dataset_format) {
        formData.append('dataset_format', requestData.dataset_format)
      }
      if (requestData.dataset_type) {
        formData.append('dataset_type', requestData.dataset_type)
      }
    }

    const response = await apiClient.post<CreateInferenceResultSetResponse>(
      `/inference-result-datasets/project/${projectId}/create`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 1800000, // 30分钟超时
      },
    )
    return response.data
  },

  /**
   * 更新推理结果集
   * @param projectId 项目ID
   * @param datasetId 数据集ID
   * @param requestData 更新请求数据
   * @returns 更新结果
   */
  update: async (
    projectId: number,
    datasetId: string | number,
    requestData: CreateInferenceResultSetRequest,
  ) => {
    // 接口要求所有情况都使用multipart/form-data格式
    const formData = new FormData()

    // 基础字段
    formData.append('name', requestData.name)
    if (requestData.description) {
      formData.append('description', requestData.description)
    }
    formData.append('inference_method', requestData.inference_method)
    if (requestData.usage) {
      formData.append('usage', requestData.usage)
    }

    // 根据推理方式添加相应字段
    if (requestData.inference_method === 'offline') {
      // 离线推理
      if (requestData.model_id !== undefined) {
        formData.append('model_id', String(requestData.model_id))
      }
      if (requestData.model_name) {
        formData.append('model_name', requestData.model_name)
      }
      if (requestData.source_dataset_id !== undefined) {
        formData.append('source_dataset_id', String(requestData.source_dataset_id))
      }
      if (requestData.source_dataset_name) {
        formData.append('source_dataset_name', requestData.source_dataset_name)
      }
      if (requestData.inference_params) {
        formData.append('inference_params', requestData.inference_params)
      }
      if (requestData.graphics_card_resource) {
        formData.append('graphics_card_resource', requestData.graphics_card_resource)
      }
      if (requestData.time) {
        formData.append('schedule_at', requestData.time)
      }
      if (requestData.model_source) {
        formData.append('model_source', requestData.model_source)
      }
    }
    else if (requestData.inference_method === 'online') {
      // 在线推理
      if (requestData.online_service_id !== undefined) {
        formData.append('online_service_id', String(requestData.online_service_id))
      }
      if (requestData.online_service_name) {
        formData.append('online_service_name', requestData.online_service_name)
      }
      if (requestData.model_name) {
        formData.append('model_name', requestData.model_name)
      }
      if (requestData.source_dataset_id !== undefined) {
        formData.append('source_dataset_id', String(requestData.source_dataset_id))
      }
      if (requestData.source_dataset_name) {
        formData.append('source_dataset_name', requestData.source_dataset_name)
      }
      if (requestData.time) {
        formData.append('schedule_at', requestData.time)
      }
      if (requestData.inference_params) {
        formData.append('inference_params', requestData.inference_params)
      }
    }
    else if (requestData.inference_method === 'import') {
      // 导入推理结果集
      if (requestData.upload_method) {
        formData.append('upload_method', requestData.upload_method)
      }
      if (requestData.file_url) {
        formData.append('file_url', requestData.file_url)
      }
      if (requestData.files && requestData.files.length > 0) {
        requestData.files.forEach((file) => {
          formData.append('files', file)
        })
      }
      if (requestData.chunk_upload_ids && requestData.chunk_upload_ids.length > 0) {
        requestData.chunk_upload_ids.forEach((id) => {
          formData.append('chunk_upload_ids', id)
        })
      }
      if (requestData.model_name) {
        formData.append('model_name', requestData.model_name)
      }
      if (requestData.dataset_format) {
        formData.append('dataset_format', requestData.dataset_format)
      }
      if (requestData.dataset_type) {
        formData.append('dataset_type', requestData.dataset_type)
      }
    }

    const response = await apiClient.put<any>(
      `/inference-result-datasets/project/${projectId}/dataset/${datasetId}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 1800000, // 30分钟超时
      },
    )
    return response.data
  },

  /**
   * 删除推理结果集
   * @param projectId 项目ID
   * @param datasetId 数据集ID
   * @returns 删除结果
   */
  delete: async (projectId: number, datasetId: string | number) => {
    const response = await apiClient.delete<any>(
      `/inference-result-datasets/project/${projectId}/dataset/${datasetId}`,
    )
    return response.data
  },

  /**
   * 下载推理结果集
   * @param projectId 项目ID
   * @param datasetId 数据集ID
   * @param exportType 导出类型 ('json' | 'jsonl' | 'xlsx')
   * @returns 下载结果响应（包含headers和data）
   */
  download: async (projectId: number, datasetId: string | number, exportType?: string) => {
    const response = await apiClient.get<any>(
      `/inference-result-datasets/project/${projectId}/dataset/${datasetId}/download`,
      {
        responseType: 'blob',
        params: {
          export_type: exportType,
        },
      },
    )
    // 返回完整的response对象，包含headers和data
    return response
  },

  /**
   * 预览推理结果集数据项
   * @param projectId 项目ID
   * @param datasetId 数据集ID
   * @param page 页码
   * @param pageSize 每页数量
   * @returns 预览数据
   */
  preview: async (
    projectId: number,
    datasetId: string | number,
    page: number = 1,
    pageSize: number = 10,
  ) => {
    const response = await apiClient.get<any>(
      `/inference-result-datasets/project/${projectId}/dataset/${datasetId}/items`,
      {
        params: {
          page,
          size: pageSize,
        },
      },
    )
    return response.data
  },

  /**
   * 更新推理结果集状态
   * @param projectId 项目ID
   * @param datasetId 数据集ID
   * @param status 状态
   * @returns 更新结果
   */
  updateStatus: async (
    projectId: number,
    datasetId: string | number,
    status: string,
  ) => {
    const response = await apiClient.patch<any>(
      `/inference-result-datasets/project/${projectId}/dataset/${datasetId}/status`,
      { status },
    )
    return response.data
  },

  /**
   * 下载推理结果样例数据集
   * @param fileType 文件类型：jsonl、csv、xlsx、json、zip
   * @param datasetFormat 数据集格式（可选）
   * @param datasetType 数据集类型（可选）
   * @returns 下载结果响应
   */
  downloadSample: async (fileType: 'jsonl' | 'csv' | 'xlsx' | 'json' | 'zip' = 'jsonl', datasetFormat?: string, datasetType?: string) => {
    const response = await apiClient.get<any>(
      `/inference-result-datasets/sample/download`,
      {
        params: {
          file_type: fileType,
          ...(datasetFormat && { dataset_format: datasetFormat }),
          ...(datasetType && { dataset_type: datasetType }),
        },
        responseType: 'blob',
      },
    )
    // 返回完整的response对象，包含headers和data
    return response
  },

  getInferenceLogs: async (projectId: number, taskId: number, endTime: string, days?: number): Promise<any> => {
    const response = await apiClient.get(`/inference-result-datasets/project/${projectId}/task/${taskId}/logs`, {
      params: {
        end_time: endTime,
        days: days ?? 30, // 使用默认值30
      },
    })
    return response.data
  },

  getInferenceLogsDownload: async (projectId: number, taskId: number, startTime: string, endTime: string, signal?: AbortSignal): Promise<any> => {
    const response = await apiClient.get(`/inference-result-datasets/project/${projectId}/task/${taskId}/logs/range`, {
      params: {
        start_time: startTime,
        end_time: endTime,
      },
      signal,
    })
    return response.data
  },

  /**
   * 停止推理结果集任务
   * @param projectId 项目ID
   * @param datasetId 数据集ID
   * @returns Promise<void>
   */
  stop: async (projectId: number, datasetId: string | number): Promise<void> => {
    await apiClient.post(`/inference-result-datasets/project/${projectId}/task/${datasetId}/stop`)
  },

  // 编辑推理结果集名称和描述 datasetId数据集ID name数据集名称 推理结果集
  edit: async (projectId: number, datasetId: number, name?: string, description?: string): Promise<any> => {
    const response = await apiClient.patch(`/inference-result-datasets/project/${projectId}/dataset/${datasetId}/basic-info`, {
      name,
      description,
    })
    return response.data
  },
}
