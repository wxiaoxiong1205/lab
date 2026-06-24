import request from '@/utils/request'

export interface ModelAttributeListParams {
  name?: string
  input_type?: string
  page_number?: number
  page_size?: number
  owner_type?: 'model' | 'api'
}

// 创建模型自定义属性的参数类型
export interface ModelAttributeCreateParams {
  name: string // 必填，属性名
  input_type?: string // 输入类型
  description?: string // 描述
  required?: boolean // 是否必填
  multi_select?: boolean // 是否多选
  option_values?: string[] // 可选值列表
  owner_type?: 'model' | 'api'
}

export const ModelAttributeService = {
  list: async (params: ModelAttributeListParams) => {
    const response = await request({
      url: '/model_custom_attribute',
      method: 'get',
      params,
    })
    return response.data
  },
  create: async (data: ModelAttributeCreateParams) => {
    const response = await request({
      url: '/model_custom_attribute',
      method: 'post',
      data,
    })
    return response.data
  },

  allList: async () => {
    const response = await request({
      url: '/model_custom_attribute/all',
      method: 'get',
    })
    return response.data
  },

  getDetail: async (id: string) => {
    const response = await request({
      url: `/model_custom_attribute/${id}`,
      method: 'get',
    })
    return response.data
  },
  update: async (id: string, data: ModelAttributeCreateParams) => {
    const response = await request({
      url: `/model_custom_attribute/${id}`,
      method: 'put',
      data,
    })
    return response.data
  },

  delete: async (id: string) => {
    const response = await request({
      url: `/model_custom_attribute/${id}`,
      method: 'delete',
    })
    return response.data
  },
}
