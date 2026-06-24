import apiClient from './apiClient'

export interface OpenapiApplicationItem {
  id: number
  name?: string
  plugins?: string | {
    'hmac-auth'?: {
      key_id?: string
      secret_key?: string
      clock_skew?: number
    }
    [key: string]: unknown
  }
  access_key_id?: string
  accessKeyId?: string
  ak?: string
  key?: string
  secret_access_key?: string
  secretAccessKey?: string
  secret_key?: string
  sk?: string
  created_at?: string
  createdAt?: string
  created_time?: string | number
  createdTime?: string | number
}

export interface OpenapiApplicationListParams {
  page: number
  size: number
  name?: string
}

export interface OpenapiApplicationListResult {
  items: OpenapiApplicationItem[]
  total: number
  page: number
  size: number
}

function unwrapPayload<T>(payload: any): T {
  return (payload?.data ?? payload) as T
}

export const openapiApplicationService = {
  create: async () => {
    const response = await apiClient.post('/openapi-applications/create', {})
    return unwrapPayload<OpenapiApplicationItem>(response.data)
  },

  list: async (params: OpenapiApplicationListParams) => {
    const response = await apiClient.get('/openapi-applications/list', { params })
    return unwrapPayload<OpenapiApplicationListResult>(response.data)
  },

  delete: async (ids: number[]) => {
    const response = await apiClient.delete('/openapi-applications/delete', {
      data: { ids },
    })
    return unwrapPayload(response.data)
  },
}
