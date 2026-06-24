import apiClient from './apiClient'

export interface AdvancedTemplateField {
  id?: number | null
  template_id: number
  field_name: string
  category?: string | null
  description?: string | null
  field_type: string
  enum_options?: string[] | null
  default_value?: string | number | boolean | null
  sort_order: number
  required: boolean
  enabled: boolean
  created_at?: string | null
  updated_at?: string | null
}

export interface AdvancedTemplateFieldGroup {
  category?: string | null
  fields: AdvancedTemplateField[]
}

export interface AdvancedTemplate {
  id?: number | null
  name: string
  description?: string | null
  domain: string
  template_type: string
  status: string
  visibility: string
  yaml_content?: string | null
  version?: number
  is_current?: boolean
  fields?: AdvancedTemplateFieldGroup[]
  created_at?: string | null
  updated_at?: string | null
}

export interface AdvancedTemplatePage {
  items: AdvancedTemplate[]
  total?: number | null
  page?: number | null
  size?: number | null
  pages?: number | null
}

export interface AdvancedTemplateListParams {
  domain?: string
  template_type?: string
  status?: string
  name?: string
  page?: number
  size?: number
}

export interface AdvancedTemplateYamlPayload {
  name: string
  description?: string | null
  domain: string
  template_type: string
  status?: string
  visibility?: string
  yaml_content: string
}

export interface AdvancedTemplateYamlUpdatePayload extends Partial<Omit<AdvancedTemplateYamlPayload, 'yaml_content'>> {
  yaml_content: string
  disable_missing_fields?: boolean
}

export interface AdvancedTemplateYamlToJsonPayload {
  yaml_content: string
}

export type AdvancedTemplateYamlToJsonResponse = AdvancedTemplateFieldGroup[] | {
  fields?: AdvancedTemplateFieldGroup[]
  fileds?: AdvancedTemplateFieldGroup[]
}

export const advancedTemplateService = {
  list: async (params: AdvancedTemplateListParams = {}) => {
    const response = await apiClient.get<AdvancedTemplatePage>('/advanced-templates', { params })
    return response.data
  },

  get: async (templateId: number) => {
    const response = await apiClient.get<AdvancedTemplate>(`/advanced-templates/${templateId}`)
    return response.data
  },

  createFromYaml: async (data: AdvancedTemplateYamlPayload) => {
    const response = await apiClient.post<AdvancedTemplate>('/advanced-templates/from-yaml', data)
    return response.data
  },

  yamlToJson: async (data: AdvancedTemplateYamlToJsonPayload) => {
    const response = await apiClient.post<AdvancedTemplateYamlToJsonResponse>('/advanced-templates/yaml-to-json', data)
    return response.data
  },

  updateFromYaml: async (templateId: number, data: AdvancedTemplateYamlUpdatePayload) => {
    const response = await apiClient.put<AdvancedTemplate>(`/advanced-templates/${templateId}/from-yaml`, data)
    return response.data
  },

  delete: async (templateId: number) => {
    await apiClient.delete(`/advanced-templates/${templateId}`)
  },

  copy: async (templateId: number) => {
    const response = await apiClient.post<AdvancedTemplate>(`/advanced-templates/${templateId}/copy`)
    return response.data
  },

  enable: async (templateId: number) => {
    const response = await apiClient.post<AdvancedTemplate>(`/advanced-templates/${templateId}/enable`)
    return response.data
  },

  disable: async (templateId: number) => {
    const response = await apiClient.post<AdvancedTemplate>(`/advanced-templates/${templateId}/disable`)
    return response.data
  },
}
