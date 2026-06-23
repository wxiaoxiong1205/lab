import { postApiServiceTestForward } from './apiTest'
import request from '@/utils/request'

export type { ApiTestForwardResult } from './apiTest'

export type ApiServiceView = 'usable' | 'viewable' | 'can_apply' | 'all'

export interface ApiServiceParamNode {
  id?: number | string
  usage_type?: string
  name: string
  data_type: string
  default_value?: unknown
  /** 是否必填 */
  binding?: boolean
  desc?: string
  child?: ApiServiceParamNode[]
}

export interface ApiServiceHeader {
  name: string
  value?: string
  desc?: string
  binding?: boolean
}

export interface ApiServiceDocument {
  name?: string
  category?: string
  data_level?: string
  updated_time?: number
  overview?: string
  protocol?: string
  is_websocket_upstream?: boolean
  gateway_base_url?: string
  gateway_invoke_path?: string
  gateway_full_url?: string
  gateway_http_method?: string
  upstream_method?: string
  upstream_url?: string
  invoke_guide?: string
  request_headers?: ApiServiceHeader[]
  request_param?: ApiServiceParamNode[]
  response_param?: ApiServiceParamNode[]
  request_example?: unknown
  response_example?: unknown
  curl_example?: string
  python_example?: string
}

export interface ApiServiceListParams {
  /** 页码，默认 1 */
  page_number?: number
  /** 每页条数，默认 10 */
  page_size?: number
  /** 分类筛选，多个用逗号分隔，如 A,B,C */
  category?: string
  /** API 名称模糊查询 */
  api_name?: string
  /** API 地址 / 上游 URL 等模糊查询（若后端未实现则忽略该参数） */
  api_url?: string
  /** 启用状态：1=发布，2=未发布 */
  enable_status?: 1 | 2
  /** 权限状态筛选，多个用逗号分隔，如 0,1,2,3 */
  permission_status?: string
  /** 视图筛选：usable/viewable/can_apply/all */
  view?: ApiServiceView
}

/** swagger: #/definitions/model.CreateApiServiceReq */
export interface CreateApiServiceReq {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  name: string
  /** 多上游地址 */
  urls: string[]
  category?: string
  description?: string
  header?: Array<{ name: string, value: string, desc?: string }>
  logo?: string
  price?: number
  protocol?: string
  request_param?: any[]
  response_param?: any[]
  status?: number
}

export const apiService = {
  /** 查询自定义 API 列表（分页） */
  getApiList: async (params: ApiServiceListParams) => {
    const res = await request({
      url: '/api_service',
      method: 'get',
      params,
    })
    return res.data
  },

  /** 查询自定义 API 详情 */
  getApiDetail: async (apiId: number | string) => {
    const res = await request({
      url: `/api_service/${apiId}`,
      method: 'get',
    })
    return res.data
  },

  /** 创建自定义 API */
  createApi: async (data: CreateApiServiceReq) => {
    const res = await request({
      url: '/api_service',
      method: 'post',
      data,
    })
    return res.data
  },

  /** 更新自定义 API */
  updateApi: async (apiId: number | string, data: CreateApiServiceReq) => {
    const res = await request({
      url: `/api_service/${apiId}`,
      method: 'put',
      data,
    })
    return res.data
  },

  /** 删除自定义 API */
  deleteApi: async (apiId: number | string) => {
    const res = await request({
      url: `/api_service/${apiId}`,
      method: 'delete',
    })
    return res.data
  },

  /** 禁用 API */
  disableApi: async (apiId: number | string) => {
    const res = await request({
      url: `/api_service/${apiId}/disable`,
      method: 'post',
    })
    return res.data
  },

  /** 启用 API */
  enableApi: async (apiId: number | string) => {
    const res = await request({
      url: `/api_service/${apiId}/enable`,
      method: 'post',
    })
    return res.data
  },

  /** 导出 OpenAPI */
  exportOpenApi: async (apiId: number | string) => {
    const res = await request({
      url: `/api_service/${apiId}/openapi`,
      method: 'get',
    })
    return res.data
  },

  /** 测试 API 转发（透传 body），实现见 {@link postApiServiceTestForward} */
  testApiForward: postApiServiceTestForward,

  /** 查询 API 文档 */
  getApiDocument: async (apiId: number | string) => {
    const res = await request<ApiServiceDocument>({
      url: `/api_service/${apiId}/doc`,
      method: 'get',
    })
    return res.data
  },
}
