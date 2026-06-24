import apiClient from './apiClient'
import type {
  CreateMlModelPayload,
  CreateMlModelVersionPayload,
  MlModelListParams,
  MlModelSummaryPage,
  MlModelVersion,
  MlTaskTypeOption,
  UpdateMlModelVersionPayload,
} from '@/types/mlModel'

export const mlModelService = {
  listByProject: async (projectId: number, params: MlModelListParams) => {
    const response = await apiClient.get<MlModelSummaryPage>(`/models/ml/project/${projectId}`, {
      params,
    })
    return response.data
  },

  create: async (projectId: number, payload: CreateMlModelPayload) => {
    const response = await apiClient.post(`/models/ml/project/${projectId}`, payload)
    return response.data
  },

  getVersions: async (projectId: number, modelName: string, status?: string) => {
    const response = await apiClient.get<MlModelVersion[]>(`/models/ml/project/${projectId}/model/${encodeURIComponent(modelName)}`, {
      params: {
        status,
      },
    })
    return response.data
  },

  deleteModel: async (projectId: number, modelName: string, modelVersion?: string) => {
    const response = await apiClient.delete(
      `/models/ml/project/${projectId}/model/${encodeURIComponent(modelName)}`,
      {
        params: modelVersion ? { model_version: modelVersion } : undefined,
      },
    )
    return response.data
  },

  createVersion: async (projectId: number, modelName: string, payload: CreateMlModelVersionPayload) => {
    const response = await apiClient.post(
      `/models/ml/project/${projectId}/model/${encodeURIComponent(modelName)}/versions`,
      payload,
    )
    return response.data
  },

  updateVersion: async (mlModelId: number, payload: UpdateMlModelVersionPayload) => {
    const response = await apiClient.put(`/models/ml/versions/${mlModelId}`, payload)
    return response.data
  },

  getTaskTypes: async (modelType: string) => {
    const response = await apiClient.get<
      Record<string, Array<string | { label?: string, value?: string, name?: string, task_type?: string }>>
    >(
      '/enums/ml-task-types',
      {
        params: { model_type: modelType },
      },
    )

    const taskTypes = response.data?.[modelType] ?? []

    return taskTypes.map<MlTaskTypeOption>((item) => {
      if (typeof item === 'string') {
        return { label: item, value: item }
      }

      const value = item.value ?? item.task_type ?? item.name ?? ''
      const label = item.label ?? item.name ?? value
      return {
        label,
        value,
      }
    }).filter((item) => item.value)
  },
}
