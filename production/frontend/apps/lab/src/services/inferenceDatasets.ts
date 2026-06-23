import apiClient from './apiClient'

export const inferenceDatasetsServices = {
  getInferenceDatasets: async (projectId: number, status?: string, page?: number, size?: number, dataType?: string, sourceDatasetId?: number, usage?: string) => {
    let url = `/inference-result-datasets/project/${projectId}/list?status=${status}&page=${page}&size=${size}`
    if (usage === 'BUSSINESS') {
      url += '&usage=business-inference'
    }
    else {
      if (dataType) {
        url += `&dataset_type=${dataType}`
      }
    }
    if (sourceDatasetId !== undefined && sourceDatasetId !== null) {
      url += `&source_dataset_id=${sourceDatasetId}`
    }
    const response = await apiClient.get(url)
    return response.data
  },
  getInferenceDatasetIndicators: async (projectId: number, datasetId: number, usage?: string) => {
    let url = `/inference-result-datasets/project/${projectId}/datasets/${datasetId}/metadata-fields`
    if (usage === 'BUSSINESS') {
      url += '?&usage=business-inference'
    }
    const response = await apiClient.get(url)
    return response.data
  },
  getDatasetIndicators: async (projectId: number, datasetId: number) => {
    const url = `/training-datasets/project/${projectId}/dataset/${datasetId}/metadata-fields`
    const response = await apiClient.get(url)
    return response.data
  },
  getInferenceDatasetDetails: async (projectId: number, datasetId: number) => {
    const response = await apiClient.get(`/inference-result-datasets/project/${projectId}/dataset/${datasetId}`)
    return response.data
  },
}
