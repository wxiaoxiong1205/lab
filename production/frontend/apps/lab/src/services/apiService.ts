import apiClient from './apiClient'
import type { Attribute } from '@/types/inference'

// 类型定义
export interface HeaderItem {
  name: string
  value: string
  default_value?: string
}

export interface ApiParam {
  name: string
  default_value: any
  data_type: 'int' | 'string' | 'array' | 'object' | 'boolean' | 'float'
  binding?: boolean
  inference?: boolean
  desc?: string
  child?: ApiParam[]
}

export interface CreateApiRequest {
  name: string
  description?: string
  base_url: string
  header?: HeaderItem[]
  request_param?: ApiParam[]
  response_param?: ApiParam[]
  request_type?: 'POST' | 'GET' | 'PUT' | 'DELETE'
  protocol?: string
  attr_values?: Attribute[]
}

export interface ApiListItem {
  id: number
  name: string
  description?: string
  base_url: string
  request_type?: string
  protocol?: string
  status: '未连接' | '连接成功'
  created_by: string
}

export interface ApiListResponse {
  items: ApiListItem[]
  total: number
  page: number
  size: number
  pages: number
}

export interface ApiDetailResponse {
  id: number
  name: string
  description?: string
  base_url: string
  header?: HeaderItem[]
  request_param?: ApiParam[]
  response_param?: ApiParam[]
  request_type?: string
  protocol?: string
  status: '未连接' | '连接成功'
  created_by: string
  attr_values?: Attribute[]
}

export interface UpdateApiRequest extends CreateApiRequest {
  id?: number
}

export interface DeleteApiRequest {
  ids: number[]
}

export interface VerifyConnectRequest {
  id: number
  verify_request_param: Record<string, any>
}

export interface VerifyConnectResponse {
  state: number
  original_data: any
  mapped_response_data: Record<string, any>
  mapped_request_data: any
}

export interface ApiListQueryParams {
  page_size?: number
  name?: string
  page_num?: number
  status?: string
}

// API绑定字段相关类型
export interface BindingField {
  name: string
  desc: string
  jsonpath: string
}

export interface ApiBindingFieldsResponse {
  request_binding: BindingField[]
  response_binding: BindingField[]
}

// 业务测试结果集相关类型
export interface RequestMapItem {
  source_field_desc: string
  source_field_path: string
  target_field_desc: string
  target_field_path: string
}

export interface ResponseMapItem {
  source_field_desc: string // api响应参数名称
  target_field_desc: string // 评估模型字段名称
}

export interface BusinessInferenceParam {
  request_map: RequestMapItem[]
  response_map: ResponseMapItem[]
}

export interface CreateBusinessInferenceResultRequest {
  name: string
  description?: string
  inference_type: 'api'
  api_id: number
  api_name: string
  dataset_id: number
  dataset_name: string
  param: BusinessInferenceParam
  schedule_at?: string
}

export interface BusinessInferenceResultResponse extends CreateBusinessInferenceResultRequest {
  id: number
  created_at?: string
  updated_at?: string
}

// 业务测试数据集元数据字段响应类型
export interface BusinessInferenceMetadataFieldsResponse {
  fields?: string[]
  [key: string]: any
}

/**
 * 第三方API管理服务类
 */
class ApiService {
  /**
   * 创建第三方 API
   * @param projectId 项目 ID
   * @param data API 配置数据
   * @returns 成功返回 true，失败抛出错误
   */
  async createApi(projectId: number | string, data: CreateApiRequest): Promise<boolean> {
    const response = await apiClient.post<boolean>(
      `/third_party_api/project/${projectId}/create`,
      data,
    )
    return response.data
  }

  /**
   * 查询第三方 API 列表
   * @param projectId 项目 ID
   * @param params 查询参数
   * @returns API 列表响应
   */
  async getApiList(
    projectId: number | string,
    params?: ApiListQueryParams,
  ): Promise<ApiListResponse> {
    const response = await apiClient.get<ApiListResponse>(
      `/third_party_api/project/${projectId}/list`,
      { params },
    )
    return response.data
  }

  /**
   * 查询 API 详情
   * @param projectId 项目 ID
   * @param apiId API 主键 ID
   * @returns API 详情响应
   */
  async getApiDetail(
    projectId: number | string,
    apiId: number | string,
  ): Promise<ApiDetailResponse> {
    const response = await apiClient.get<ApiDetailResponse>(
      `/third_party_api/project/${projectId}/detail/${apiId}`,
    )
    return response.data
  }

  /**
   * 修改第三方 API
   * @param projectId 项目 ID
   * @param data API 配置数据（需传入完整的 API 配置）
   * @returns 更新后的 API 详情
   */
  async updateApi(
    projectId: number | string,
    data: UpdateApiRequest,
  ): Promise<ApiDetailResponse> {
    const response = await apiClient.put<ApiDetailResponse>(
      `/third_party_api/project/${projectId}/update`,
      data,
    )
    return response.data
  }

  /**
   * 删除第三方 API
   * @param projectId 项目 ID
   * @param data 删除请求数据
   * @returns 成功返回 true 或无返回体，失败抛出错误
   */
  async deleteApi(
    projectId: number | string,
    data: DeleteApiRequest,
  ): Promise<boolean | void> {
    const response = await apiClient.delete<boolean | void>(
      `/third_party_api/project/${projectId}/delete`,
      { data },
    )
    return response.data
  }

  /**
   * 测试 API 连接
   * @param projectId 项目 ID
   * @param data 测试连接请求数据
   * @returns 测试连接响应
   */
  async verifyConnect(
    projectId: number | string,
    data: VerifyConnectRequest,
  ): Promise<VerifyConnectResponse> {
    const response = await apiClient.post<VerifyConnectResponse>(
      `/third_party_api/project/${projectId}/verify_connect`,
      data,
    )
    return response.data
  }

  /**
   * 查询 API 绑定字段
   * @param projectId 项目 ID
   * @param apiId API 主键 ID
   * @returns API 绑定字段响应
   */
  async getApiBindingFields(
    projectId: number | string,
    apiId: number | string,
  ): Promise<ApiBindingFieldsResponse> {
    const response = await apiClient.get<ApiBindingFieldsResponse>(
      `/third_party_api/project/${projectId}/binding_fields/${apiId}`,
    )
    return response.data
  }

  /**
   * 创建业务测试结果集
   * @param projectId 项目 ID
   * @param data 业务测试结果集配置数据
   * @returns 创建的业务测试结果集响应
   */
  async createBusinessInferenceResult(
    projectId: number | string,
    data: CreateBusinessInferenceResultRequest,
  ): Promise<BusinessInferenceResultResponse> {
    const response = await apiClient.post<BusinessInferenceResultResponse>(
      `/business_inference_result_dataset/project/${projectId}/create`,
      data,
    )
    return response.data
  }

  /**
   * 更新业务测试结果集
   * @param projectId 项目 ID
   * @param datasetId 数据集 ID
   * @param data 业务测试结果集配置数据
   * @returns 更新的业务测试结果集响应
   */
  async updateBusinessInferenceResult(
    projectId: number | string,
    datasetId: string | number,
    data: CreateBusinessInferenceResultRequest,
  ): Promise<BusinessInferenceResultResponse> {
    const response = await apiClient.put<BusinessInferenceResultResponse>(
      `/inference-result-datasets/project/${projectId}/dataset/${datasetId}`,
      data,
    )
    return response.data
  }

  /**
   * 获取业务测试数据集元数据字段
   * @param projectId 项目 ID
   * @param datasetId 数据集 ID
   * @returns 业务测试数据集元数据字段响应
   */
  async getBusinessInferenceMetadataFields(
    projectId: number | string,
    datasetId: number | string,
  ): Promise<BusinessInferenceMetadataFieldsResponse> {
    const response = await apiClient.get<BusinessInferenceMetadataFieldsResponse>(
      `/third_party_api/project/${projectId}/business_dataset_matedata/${datasetId}`,
    )
    return response.data
  }
}

// 导出单例实例
export default new ApiService()
