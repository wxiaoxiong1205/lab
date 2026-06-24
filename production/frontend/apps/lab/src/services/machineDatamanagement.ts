import type { AxiosResponse } from 'axios'
import apiClient from './apiClient'
import type {
  CreateDatasetRequest,
  DatasetAsyncExportResponse,
  DatasetDetailsResponse,
  DatasetExportFormatsResponse,
  DownloadDatasetRequest,
  ItemList,
  MachineLearnListModel,
} from '@/services/machineLearnModel.ts'

export const machineDatamanagement = {
  // 获取机器学习数据管理下的数据集列表  task_type枚举值：text_classification, text_entity_recognition, image_classification, object_detection, image_segmentation
  // publish 0:未发布 1:已发布
  getMachineDatasetList: async (
    projectId: number,
    page: number,
    size: number,
    task_type: string,
    name?: string,
    template_type?: string,
    is_annotated?: boolean,
    publish?: number,
  ) => {
    const response = await apiClient.get<MachineLearnListModel>(`machine-learning-datasets/dataset/${projectId}/page`, {
      params: {
        page,
        size,
        ...(task_type ? { task_type } : {}),
        ...(name ? { name } : {}),
        ...(template_type ? { template_type } : {}),
        is_annotated,
        publish,
      },
    })
    return response.data
  },

  // 创建数据集/新增版本
  createMachineDataset: async (projectId: number, params: CreateDatasetRequest) => {
    const formData = new FormData()
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return
      if (typeof value === 'boolean') {
        formData.append(key, value ? 'true' : 'false')
      }
      else {
        formData.append(key, String(value))
      }
    })

    const response = await apiClient.post(
      `machine-learning-datasets/dataset/${projectId}/upload`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return response.data
  },

  // 编辑机器学习数据集名称和描述
  editMachineDatasetBasicInfo: async (
    projectId: number,
    datasetId: number,
    params: { name: string, description?: string },
  ) => {
    const response = await apiClient.put(
      `machine-learning-datasets/dataset/${projectId}/${datasetId}/basic-info`,
      params,
    )
    return response.data
  },

  // 删除数据集单个版本
  deleteMachineDataset: async (projectId: number, datasetId: number) => {
    const response = await apiClient.delete(`machine-learning-datasets/dataset/${projectId}/${datasetId}`)
    return response.data
  },
  // 删除数据集下所有版本
  deleteMachineDatasets: async (projectId: number, datasetId: number) => {
    const response = await apiClient.delete(`machine-learning-datasets/dataset/${projectId}/${datasetId}/versions`)
    return response.data
  },

  // 下载机器学习样例数据集（返回 blob，用于前端触发文件下载）
  downloadSampleDataset: async (projectId: number, params: DownloadDatasetRequest) => {
    const response = await apiClient.get<Blob>(
      `machine-learning-datasets/dataset/${projectId}/sample/download`,
      { params, responseType: 'blob' },
    )
    return { blob: response.data, headers: response.headers }
  },

  // 下载已创建的机器学习数据集
  downloadMachineDataset: async (projectId: number, datasetId: number, exportFormat?: string) => {
    return await apiClient.get<Blob | DatasetAsyncExportResponse, AxiosResponse<Blob | DatasetAsyncExportResponse>>(
      `machine-learning-datasets/dataset/${projectId}/${datasetId}/download`,
      {
        params: exportFormat ? { export_format: exportFormat } : undefined,
        responseType: 'blob',
      },
    )
  },

  // 获取数据集可导出的格式字典
  getDatasetExportFormats: async () => {
    const response = await apiClient.get<DatasetExportFormatsResponse>('machine-learning-datasets/dataset/export-formats')
    return response.data
  },

  // 根据数据集 id 获取该数据集（同名）下的所有版本列表，按创建时间倒序。 publish 0:未发布 1:已发布
  getDatasetVersion: async (projectId: number, datasetId: number, isAnnotated?: boolean, publish?: number) => {
    const response = await apiClient.get<ItemList[]>(`machine-learning-datasets/dataset/${projectId}/${datasetId}/versions`, {
      params: {
        is_annotated: isAnnotated,
        publish,
      },
    })
    return response.data
  },

  // 获取该数据集的详情信息
  getDatasetDetails: async (projectId: number, datasetId: number, page: number, size: number) => {
    const response = await apiClient.get<DatasetDetailsResponse>(`machine-learning-datasets/dataset/${projectId}/${datasetId}`, {
      params: {
        page,
        size,
      },
    })
    return response.data
  },

  // publish 传1 代表发布 传0代表未发布（无对应功能） 固定传1
  publish: async (project_id: number, dataset_id: number, publish: number) => {
    const response = await apiClient.patch(
      `/machine-learning-datasets/dataset/${project_id}/${dataset_id}/publish`,
      {
        publish,
      },
    )
    return response.data
  },

  //  删除详情中的行数据 row_number number数组 按照preview数据预览接口返回的序号 传入
  deleteRow: async (project_id: number, dataset_id: number, row_numbers: number[]) => {
    const response = await apiClient.delete(
      `/machine-learning-datasets/dataset/${project_id}/${dataset_id}/rows`,
      {
        data: { row_numbers },
      },
    )
    return response.data
  },
}
