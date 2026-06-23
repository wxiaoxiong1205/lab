import apiClient from './apiClient'

export type TrainingTemplateMethod = 'rft-grpo'
export type TrainingTemplateFineTuneType = 'full' | 'lora'

export interface TrainingParameterTemplate {
  id: number
  name: string
  description?: string | null
  training_method: TrainingTemplateMethod
  fine_tune_type: TrainingTemplateFineTuneType
  template_content: string
  params: Record<string, unknown>
  enabled: boolean
  created_at?: string
  updated_at?: string
  created_id?: number
  created_by?: string
  tenant_id?: string
}

export interface TrainingParameterTemplatePage {
  items: TrainingParameterTemplate[]
  total: number
  page: number
  size: number
  pages: number
}

export interface TrainingParameterTemplateListParams {
  page?: number
  size?: number
  name?: string
  enabled?: boolean
  training_method?: TrainingTemplateMethod
}

export interface TrainingParameterTemplateCreateParams {
  name: string
  description?: string
  training_method: TrainingTemplateMethod
  template_content: string
  enabled: boolean
}

export interface TrainingParameterTemplateUpdateParams {
  name?: string
  description?: string
  template_content?: string
  enabled?: boolean
}

export const trainingParameterTemplateService = {
  list: async (params: TrainingParameterTemplateListParams): Promise<TrainingParameterTemplatePage> => {
    const response = await apiClient.get('/training-parameter-templates', { params })
    return response.data
  },

  create: async (data: TrainingParameterTemplateCreateParams): Promise<TrainingParameterTemplate> => {
    const response = await apiClient.post('/training-parameter-templates', data)
    return response.data
  },

  update: async (templateId: number, data: TrainingParameterTemplateUpdateParams): Promise<TrainingParameterTemplate> => {
    const response = await apiClient.put(`/training-parameter-templates/${templateId}`, data)
    return response.data
  },

  copy: async (templateId: number, name: string): Promise<TrainingParameterTemplate> => {
    const response = await apiClient.post(`/training-parameter-templates/${templateId}/copy`, { name })
    return response.data
  },

  toggleEnabled: async (templateId: number, enabled: boolean): Promise<TrainingParameterTemplate> => {
    const response = await apiClient.patch(`/training-parameter-templates/${templateId}/enabled`, null, {
      params: { enabled },
    })
    return response.data
  },

  delete: async (templateId: number): Promise<void> => {
    await apiClient.delete(`/training-parameter-templates/${templateId}`)
  },
}
