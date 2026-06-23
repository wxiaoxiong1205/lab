import type {
  RegistryConfigQueryParams,
} from '../types'
import apiClient from './apiClient'
import type { GetTagsListTagsData } from '@/types/tags'
// 后端分页响应格式
interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
}

// 定义镜像仓库镜像的请求和响应类型
export interface RegistryMirrorImage {
  id: number
  image: string
  type: number
  describe: string
  repository_id: number
  repository_name: string
  created_at: string
  namespace: string

}

interface RegistryMirrorImageCreateUpdate {
  image: string
  type: number
  describe: string
  repository_id: number
}

export const NotebookCustomImageType = {
  baseModelNotebook: 9,
  machineLearningNotebook: 10,
} as const

export const NotebookSystemImageType = {
  baseModelNotebook: 11,
  machineLearningNotebook: 12,
} as const

export interface GetNamespaceEnumParams {
  repository_id: number // 仓库ID
  search_type: number // 搜索类型（1:命名空间，2:镜像名称）
  namespaces?: string
  image_name?: string
  page: number
  size: number
  image_type?: number
}

export interface SaveRegistryImageParams {
  project_id: number
  notebook_id: number
  namespace: string
  name?: string
  describe?: string
  include_lab_work?: boolean
  /**
   * 自动: auto, 手动: manual
   */
  trigger_type?: 'auto' | 'manual'
}

export interface GetCustomImageListParams {
  project_id: number
  image_name?: string
  image_type?: number
  status?: string
  tag_element_ids?: number[]
  size: number
  page: number
  business_type?: string
}

export interface GetBuildLogParams {
  task_id: number
  end_time: string
  days?: number
}

export interface GetBuildLogResponse {
  archived: boolean
  logs: string[]
}

export interface RegistryMirrorImageListResponse {
  items: RegistryMirrorImage[]

  total: number
  page: number
  size: number
  pages: number
}

export interface RegistryMirrorImage {
  id: number
  name: string

  project_id: number
  business_id: number

  base_image: string
  output_image: string

  image_type: number

  trigger_type: 'auto' | 'manual' // 如果后端只会返回这几种，强烈推荐
  status: '创建' | '准备中' | '已完成' | '失败'

  lab_k8s_uuid: string
  log_path: string | null

  image_address: string

  created_at: string // ISO 时间字符串
  updated_at: string
  created_by: string // 创建人

  tags: GetTagsListTagsData[]
  output_image_id: number
}

export enum ImageType {
  notebook = 0,
  deploy = 3,
}

export interface systemImageParamsType {
  card_category?: string
  card_model?: string
  cuda_version?: string
  python_version?: string
  sub_type?: string
  page?: number
  size?: number
  tag_element_ids?: number[]
  business_type?: string
}

export interface addImageParams {
  namespace: string
  image_name: string
  describe?: string
  image_type?: number
}

export interface NameSpaceList {
  items: string[] // 命令空间数组
  total: number
  page: number
  size: number
}
/**
 * 镜像列表服务 - 对接后端真实API
 */
export const registryMirrorService = {
  /**
   * 获取已有镜像列表
   */
  async getRegistryMirrorConfigs(params: RegistryConfigQueryParams = {}): Promise<PaginatedResponse<RegistryMirrorImage>> {
    const response = await apiClient.get('/repository_images/list', {
      params,
    })
    return response.data
  },
  /**
   * 获取全部镜像列表/获取命名空间列表
   */
  async getNamespaceEnum(params: GetNamespaceEnumParams): Promise<any> {
    const response = await apiClient.get<NameSpaceList>(`/repository_images/find-namespaces/list`, {
      params,
    })
    return response.data
  },
  /**
   * 获取单个镜像信息
   */
  async getRegistryImage(id: number): Promise<RegistryMirrorImage> {
    const response = await apiClient.get(`/repository_images/${id}`)
    return response.data
  },
  /**
   * 获取仓库类型
   * @returns 仓库类型
   */
  async getRegistryTypeEnum(): Promise<{ label: string, value: number }[]> {
    const response = await apiClient.get('/repository_images/enums/type-list')
    return response.data
  },
  /**
   * 创建镜像
   */
  async createRegistryMirrorConfig(data: RegistryMirrorImageCreateUpdate): Promise<RegistryMirrorImage> {
    const response = await apiClient.post('/repository_images/create', data)
    return response.data
  },

  /**
   * 更新镜像
   */
  async updateRegistryMirrorConfig(id: number, data: RegistryMirrorImageCreateUpdate): Promise<RegistryMirrorImage> {
    const response = await apiClient.put(`/repository_images/${id}`, data)
    return response.data
  },

  /**
   * 删除镜像
   */
  async deleteRegistryImage(id: number): Promise<void> {
    await apiClient.delete(`/repository_images/${id}`)
  },

  /**
   * 镜像列表搜索
   * @param query 搜索关键词
   * @returns 镜像列表
   */
  async searchRegistryImages(projectId: number, type: number, query?: systemImageParamsType): Promise<RegistryMirrorImage[]> {
    const response = await apiClient.get(`/repository_images/by_project/${projectId}/${type}`, { params: query })
    return response.data
  },

  /**
   * 获取系统镜像列表
   */
  async getSystemImageList(projectId: number, type: number, query?: systemImageParamsType): Promise<PaginatedResponse<RegistryMirrorImage>> {
    let url = `/repository_images/by_project/${projectId}/${type}/page?`
    if (query?.tag_element_ids) {
      url += query.tag_element_ids.map((id) => `tag_element_ids=${id}`).join('&')
    }
    delete query.tag_element_ids
    const response = await apiClient.get(url, { params: query })
    return response.data
  },

  /**
   * 保存镜像
   */
  async saveRegistryImage({ project_id, notebook_id, ...data }: SaveRegistryImageParams): Promise<RegistryMirrorImage> {
    const response = await apiClient.post(
      `/repository_images/save-notebook-as-image/${project_id}/${notebook_id}`,
      data,
    )
    return response.data
  },

  /**
   * 获取自定义镜像列表
   */
  async getCustomImageList({
    project_id,
    ...params
  }: GetCustomImageListParams): Promise<RegistryMirrorImageListResponse> {
    let url = `repository_images/custom/${project_id}/list?`
    if (params?.tag_element_ids) {
      url += params.tag_element_ids.map((id) => `tag_element_ids=${id}`).join('&')
    }
    delete params.tag_element_ids
    const response = await apiClient.get(url, { params })
    return response.data
  },

  /**
   * 删除自定义镜像
   */
  async deleteCustomImage(build_log_id: number): Promise<void> {
    await apiClient.delete(`/repository_images/build_image/${build_log_id}`)
  },

  /**
   * 获取镜像构建日志
   */
  async getBuildLog(params: GetBuildLogParams): Promise<{ logs: string[] }> {
    const response = await apiClient.get(
      `/repository_images/build_image/${params.task_id}/logs`,
      { params },
    )
    return response.data
  },

  /*
   * 判断是否正在构建镜像
   */
  async isBuildingImage(notebook_id: number): Promise<boolean> {
    const response = await apiClient.get(
      `/repository_images/build_image/${notebook_id}/is_notebook_building`,
    )
    return response.data.is_building
  },

  // 添加自定义镜像
  async addImage(projectId: number, params: addImageParams) {
    const response = await apiClient.post<RegistryMirrorImage>(`/repository_images/custom/${projectId}/add-image`, params)
    return response.data
  },
}
