import apiClient from './apiClient'
import type {
  CreateTagClassData,
  CreateTagClassResponse,
  CreateTagElementData,
  CreateTagElementResponse,
  GetTagClassByIdResponse,
  GetTagElementByIdResponse,
  GetTagsListParams,
  GetTagsListResponse,
  SaveTagsData,
  SaveTagsResponse,
  TagByBusinessTypeResponse,
  TagClassParams,
  TagClassResponse,
  TagElementParams,
  TagElementResponse,
  UpdateTagClassData,
  UpdateTagClassResponse,
  UpdateTagElementData,
  UpdateTagElementResponse,
} from '@/types/tags'

export const tagsService = {
  // ================== 标签分类 ==================
  getClassesList: async (params: TagClassParams): Promise<TagClassResponse> => {
    const response = await apiClient.get('/tags/classes', { params })
    return response.data
  },
  createClass: async (params: CreateTagClassData): Promise<CreateTagClassResponse> => {
    const response = await apiClient.post('/tags/classes', params)
    return response.data
  },
  getClassById: async (tag_class_id: number): Promise<GetTagClassByIdResponse> => {
    const response = await apiClient.get(`/tags/classes/${tag_class_id}`)
    return response.data
  },
  updateClass: async (tag_class_id: number, params: UpdateTagClassData): Promise<UpdateTagClassResponse> => {
    const response = await apiClient.put(`/tags/classes/${tag_class_id}`, params)
    return response.data
  },
  deleteClass: async (tag_class_id: number) => {
    const response = await apiClient.delete(`/tags/classes/${tag_class_id}`)
    return response.data
  },

  // ================== 标签元素 ==================
  getElementsList: async (params: TagElementParams): Promise<TagElementResponse> => {
    const response = await apiClient.get('/tags/elements', { params })
    return response.data
  },
  createElement: async (params: CreateTagElementData): Promise<CreateTagElementResponse> => {
    const response = await apiClient.post('/tags/elements', params)
    return response.data
  },
  getElementById: async (tag_element_id: number): Promise<GetTagElementByIdResponse> => {
    const response = await apiClient.get(`/tags/elements/${tag_element_id}`)
    return response.data
  },
  updateElement: async (tag_element_id: number, params: UpdateTagElementData): Promise<UpdateTagElementResponse> => {
    const response = await apiClient.put(`/tags/elements/${tag_element_id}`, params)
    return response.data
  },
  deleteElement: async (tag_element_id: number) => {
    const response = await apiClient.delete(`/tags/elements/${tag_element_id}`)
    return response.data
  },

  // 获取标签类型列表（按分类分组返回）
  getTagsByBusinessType: async (business_type: string): Promise<TagByBusinessTypeResponse> => {
    const response = await apiClient.get(`/tags/types/${business_type}`)
    return response.data
  },

  // 保存业务对象的标签（覆盖式修改）
  saveTags: async (params: SaveTagsData): Promise<SaveTagsResponse> => {
    const response = await apiClient.post(`/tags/business/${params.business_type}/${params.business_id}`, {
      tag_element_ids: params.tag_element_ids,
    })
    return response.data
  },

  // 获取业务对象的标签列表
  getTagsList: async (params: GetTagsListParams): Promise<GetTagsListResponse> => {
    const response = await apiClient.get(`/tags/business/${params.business_type}/${params.business_id}`)
    return response.data
  },
}
