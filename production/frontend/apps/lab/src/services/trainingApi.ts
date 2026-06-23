import { message } from 'antd'
import apiClient from './apiClient'
import type {
  DatasetInUseResponse,
  DatasetPreview,
  MergeDatasetVersionsRequest,
  TrainingDatasetListResponse,
  UploadDatasetVersionRequest,
  UploadDatasetVersionResponse,
  UploadTrainingDatasetQueryParams,
  UploadTrainingDatasetRequest,
  UploadTrainingDatasetResponse,
  getDataParams } from '@/types/training/index'

// 训练数据列表
export const trainingDatasetService = {
  get: async (projectId: number, params: getDataParams): Promise<TrainingDatasetListResponse> => {
    const response = await apiClient.get<TrainingDatasetListResponse>(`/training-datasets/project/${projectId}`, { params })
    return response.data
  },
  /**
   * 上传训练数据集
   * @param params 查询参数，包含数据集类型、训练方法类型、数据格式
   * @param requestData 请求数据，包含表单字段和文件
   * @returns 上传结果响应
   */
  create: async (
    params: UploadTrainingDatasetQueryParams,
    requestData: UploadTrainingDatasetRequest,
  ): Promise<UploadTrainingDatasetResponse> => {
    // 创建FormData对象
    const formData = new FormData()

    // 添加表单字段
    formData.append('name', requestData.name)
    formData.append('project_id', requestData.project_id.toString())
    if (requestData.version) {
      formData.append('version', requestData.version)
    }
    if (requestData.description) {
      formData.append('description', requestData.description)
    }
    if (requestData.dataset_config) {
      formData.append('dataset_config', requestData.dataset_config)
    }
    if (requestData.attr_values && requestData.attr_values.length > 0) {
      formData.append('attr_values', JSON.stringify(requestData.attr_values))
    }
    // 优先使用 chunk_upload_id（分片上传后），否则使用 file_url 或直接文件上传
    if ((requestData as any).chunk_upload_ids) {
      formData.append('chunk_upload_ids', (requestData as any).chunk_upload_ids)
    }
    else if ((requestData as any).file_url) {
      formData.append('file_url', (requestData as any).file_url)
    }
    else if (requestData.file) {
      formData.append('file', requestData.file)
    }

    // 发送请求
    const response = await apiClient.post<UploadTrainingDatasetResponse>(
      '/training-datasets/upload',
      formData,
      {
        params,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 1800000, // 设置超时时间为30分钟
      },
    )
    return response.data
  },
  detail: async (projectId: number, datasetId: string, usage?: string, processing_status?: string): Promise<any> => {
    const response = await apiClient.get<any>(`/training-datasets/project/${projectId}/dataset/${datasetId}`, {
      params: {
        usage,
        processing_status,
      },
    })
    return response.data
  },
  // 数据预览
  preview: async (projectId: number, datasetId: string, version: string, page: number = 1, pageSize: number = 10, usage?: string) => {
    const response = await apiClient.get<DatasetPreview>(`/training-datasets/project/${projectId}/dataset/${datasetId}/version/${version}/preview`, {
      params: {
        page,
        size: pageSize,
        usage,
      },
    })
    return response.data
  },
  /**
   * 创建数据集新版本
   * @param requestData 请求数据，包含表单字段和文件
   * @returns 创建结果响应
   */
  uploadVersion: async (
    requestData: UploadDatasetVersionRequest,
  ): Promise<UploadDatasetVersionResponse> => {
    // 创建FormData对象
    const formData = new FormData()

    // 添加表单字段
    formData.append('name', requestData.name)
    formData.append('usage', requestData.usage)
    formData.append('project_id', requestData.project_id.toString())
    formData.append('new_version', requestData.new_version)
    formData.append('inherit_from_version', requestData.inherit_from_version.toString())

    if (requestData.inherit_from_version && requestData.source_version) {
      formData.append('source_version', requestData.source_version)
    }

    if (requestData.chunk_upload_ids && requestData.chunk_upload_ids.length > 0) {
      formData.append('chunk_upload_ids', requestData.chunk_upload_ids)
    }

    if (!requestData.inherit_from_version) {
      if (requestData.file) {
        formData.append('file', requestData.file)
      }
      else if (requestData.dataset_config) {
        formData.append('dataset_config', requestData.dataset_config)
      }
      else if (!requestData.chunk_upload_ids) {
        message.error('上传模式下必须提供数据文件或数据URL')
      }
    }
    if (requestData.description) {
      formData.append('description', requestData.description)
    }
    if (requestData.dataset_config && requestData.inherit_from_version) {
      formData.append('dataset_config', requestData.dataset_config)
    }
    if (requestData.attr_values && requestData.attr_values.length > 0) {
      formData.append('attr_values', JSON.stringify(requestData.attr_values))
    }

    // 发送请求
    const response = await apiClient.post<UploadDatasetVersionResponse>(
      '/training-datasets/upload-version',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    )

    return response.data
  },
  download: async (projectId: number, datasetId: string, version: string, usage?: string, export_type?: string) => {
    // 设置responseType为blob，确保二进制数据正确处理
    const response = await apiClient.get<any>(`/training-datasets/project/${projectId}/dataset/${datasetId}/version/${version}/download`, {
      responseType: 'blob',
      params: {
        usage,
        export_type,
      },
    })
    // 返回完整的response对象，包含headers和data
    return response
  },
  /**
   *下载样例数据集
   * @param project_id 项目id
   * @param dataset_type 数据集类型
   * @param dataset_format 数据集格式
   * @param training_method_type  训练方法
   * @param file_type 文件格式类型
   * @returns 下载结果响应
   */
  downloadExample: async (project_id: number, dataset_type: string, dataset_format: string, training_method_type: string, file_type: string) => {
    // 始终使用 blob 接收：透传的 fileType 可能是内容格式(如 jsonl)，但服务端实际返回 zip 等二进制，用 json 会破坏二进制
    const response = await apiClient.get<Blob>(`/training-datasets/project/${project_id}/sample/download`, {
      params: {
        dataset_type,
        training_method_type,
        dataset_format,
        file_type,
      },
      responseType: 'blob',
    })
    // 返回完整的response对象，包含headers和data
    return response
  },
  delete: async (project_id: number, dataset_name: string, usage?: string) => {
    const response = await apiClient.delete<any>(`/training-datasets/project/${project_id}/dataset/${dataset_name}`, {
      params: {
        usage,
      },
    })
    return response.data
  },
  deleteVersion: async (project_id: number, dataset_name: string, version: string, usage?: string) => {
    const response = await apiClient.delete<any>(`/training-datasets/project/${project_id}/dataset/${dataset_name}/${version}`, {
      params: {
        usage,
      },
    })
    return response.data
  },
  checkInUse: async (projectId: number, datasetName: string, version: string, usage?: string): Promise<DatasetInUseResponse> => {
    const response = await apiClient.get<DatasetInUseResponse>(
      `/training-datasets/project/${projectId}/dataset/${datasetName}/version/${version}/in-use`,
      {
        params: {
          usage,
        },
      },
    )
    return response.data
  },
  mergeVersions: async (projectId: number, datasetName: string, usage: string, requestData: MergeDatasetVersionsRequest) => {
    const response = await apiClient.post<any>(
      `/training-datasets/project/${projectId}/dataset/${datasetName}/merge-versions`,
      requestData,
      {
        params: {
          usage,
        },
      },
    )
    return response.data
  },

  // 编辑数据集名称和描述 dataset_id 数据集名称 训练/验证/测试数据集 name为修改后的数据集名称 dataset_name为修改前的数据集名称
  edit: async (project_id: number, dataset_name: string, dataset_id: number, usage: string, name?: string, description?: string) => {
    const response = await apiClient.patch(
      `/training-datasets/project/${project_id}/dataset/${dataset_name}/basic-info`,
      {
        dataset_id,
        name,
        description,
      },
      {
        params: {
          usage,
        },
      },
    )
    return response.data
  },
}
