import type {
  AvailableCluster,
  AvailableClustersQueryParams,
  OccupiedCluster,
  RegistryConfig,
  RegistryConfigCreateUpdate,
  RegistryConfigQueryParams,
  RegistryImage,
  RegistryRepository,
} from '../types'
import apiClient from './apiClient'

// 后端分页响应格式
interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
}

// 测试连接响应
interface TestConnectionResponse {
  repository_id: number
  is_connected: boolean
}

// 集群绑定响应
interface ClusterBinding {
  cluster_id: number
  cluster_name: string
  is_bound: boolean
}

/**
 * 镜像仓库管理服务 - 对接后端真实API
 */
export const registryService = {
  /**
   * 获取镜像仓库配置列表
   */
  async getRegistryConfigs(params: RegistryConfigQueryParams = {}): Promise<PaginatedResponse<RegistryConfig>> {
    const { page = 1, page_size = 10, search, registry_type, auth_type, available } = params

    const queryParams: Record<string, any> = {
      page,
      size: page_size, // 后端使用size参数
    }

    // 添加搜索条件
    if (search) queryParams.search = search
    if (registry_type) queryParams.registry_type = registry_type
    if (auth_type) queryParams.auth_type = auth_type
    if (available) queryParams.available = available

    const response = await apiClient.get('/repository', {
      params: queryParams,
    })

    return response.data
  },
  /**
   * 获取仓库类型枚举
   */
  async getRegistryTypeEnum(): Promise<{ label: string, value: string }[]> {
    const response = await apiClient.get('/repository/enums/type-list')
    return response.data
  },

  /**
   * 获取单个镜像仓库配置
   */
  async getRegistryConfig(id: number): Promise<RegistryConfig> {
    const response = await apiClient.get(`/repository/${id}`)
    return response.data
  },

  /**
   * 创建镜像仓库配置
   */
  async createRegistryConfig(data: RegistryConfigCreateUpdate): Promise<RegistryConfig> {
    const response = await apiClient.post('/repository', data)
    return response.data
  },

  /**
   * 更新镜像仓库配置
   */
  async updateRegistryConfig(id: number, data: RegistryConfigCreateUpdate): Promise<RegistryConfig> {
    const response = await apiClient.put(`/repository/${id}`, data)
    return response.data
  },

  /**
   * 删除镜像仓库配置
   */
  async deleteRegistryConfig(id: number): Promise<void> {
    await apiClient.delete(`/repository/${id}`)
  },

  /**
   * 测试镜像仓库连接
   */
  async testRegistryConnection(id: number): Promise<TestConnectionResponse> {
    const response = await apiClient.post(`/repository/${id}/test-connectivity`)
    return response.data
  },

  /**
   * 绑定集群到仓库
   */
  async bindClusters(registryId: number, clusterIds: number[]): Promise<void> {
    await apiClient.post(`/repository/${registryId}/bind-clusters`, {
      cluster_ids: clusterIds,
    })
  },

  /**
   * 解绑集群
   */
  async unbindClusters(registryId: number, clusterIds: number[]): Promise<void> {
    await apiClient.delete(`/repository/${registryId}/unbind-clusters`, {
      data: { cluster_ids: clusterIds },
    })
  },

  /**
   * 获取仓库绑定的集群列表
   */
  async getRegistryClusterBindings(registryId: number): Promise<ClusterBinding[]> {
    const response = await apiClient.get(`/repository/${registryId}/clusters`)
    return response.data
  },

  /**
   * 获取已占用的集群列表（新增API对接）
   */
  async getOccupiedClusters(repositoryId: number): Promise<OccupiedCluster[]> {
    const response = await apiClient.get(`/repository/occupied-clusters/${repositoryId}`)

    // 处理分页响应格式，并映射字段名
    const paginatedData = response.data
    if (paginatedData && paginatedData.items) {
      return paginatedData.items.map((item: any) => ({
        cluster_id: item.id,
        cluster_name: item.name,
        api_server: item.api_server,
        status: item.status,
        bound_at: item.bound_at,
        is_active: item.is_active,
      }))
    }

    // 如果是直接数组格式，也做字段映射
    if (Array.isArray(response.data)) {
      return response.data.map((item: any) => ({
        cluster_id: item.id,
        cluster_name: item.name,
        api_server: item.api_server,
        status: item.status,
        bound_at: item.bound_at,
        is_active: item.is_active,
      }))
    }

    return []
  },

  /**
   * 获取镜像仓库中的镜像列表
   */
  async getRegistryImages(registryId: number, params: {
    page?: number
    page_size?: number
    search?: string
  } = {}): Promise<PaginatedResponse<RegistryImage>> {
    const { page = 1, page_size = 10, search } = params

    const queryParams: Record<string, any> = {
      page,
      size: page_size,
    }

    if (search) queryParams.search = search

    const response = await apiClient.get(`/repository/${registryId}/images`, {
      params: queryParams,
    })

    return response.data
  },

  /**
   * 获取镜像仓库中的仓库列表
   */
  async getRegistryRepositories(registryId: number, params: {
    page?: number
    page_size?: number
    search?: string
  } = {}): Promise<PaginatedResponse<RegistryRepository>> {
    const { page = 1, page_size = 10, search } = params

    const queryParams: Record<string, any> = {
      page,
      size: page_size,
    }

    if (search) queryParams.search = search

    const response = await apiClient.get(`/repository/${registryId}/repositories`, {
      params: queryParams,
    })

    return response.data
  },

  /**
   * 获取可用集群列表
   */
  async getAvailableClusters(params: AvailableClustersQueryParams): Promise<PaginatedResponse<AvailableCluster>> {
    const { name, page = 1, size = 50 } = params

    // 暂时不支持name过滤
    const queryParams: Record<string, any> = {
      // name,
      page,
      size,
    }

    const response = await apiClient.get('/repository/available-clusters', {
      params: queryParams,
    })

    return response.data
  },
}

// 重新导出类型以便在组件中使用
export type {
  RegistryConfig,
  RegistryConfigCreateUpdate,
  RegistryConfigQueryParams,
  RegistryImage,
  RegistryRepository,
  AvailableClustersQueryParams,
  AvailableCluster,
  OccupiedCluster,
} from '../types'
