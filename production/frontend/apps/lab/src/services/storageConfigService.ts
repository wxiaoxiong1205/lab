import type {
  AvailableCluster,
  ClusterStorageConfig,
  OccupiedCluster,
  StorageClusterMapping,
  StorageClusterMappingCreate,
  StorageClusterMappingUpdate,
  StorageConfig,
  StorageConfigCreateUpdate,
  StorageConfigDetail,
  StorageConfigQueryParams,
} from '../types'
import apiClient from './apiClient'

/**
 * 存储配置API服务 - 对接后端真实API
 */
export const storageConfigService = {
  /**
   * 获取存储配置列表
   */
  async getStorageConfigs(params: StorageConfigQueryParams = {}): Promise<{
    items: StorageConfig[]
    total: number
    page: number
    page_size: number
  }> {
    const { page = 1, page_size = 10, search, type, available } = params

    const queryParams: Record<string, any> = {
      page,
      size: page_size, // 后端使用size参数
    }

    // 添加搜索条件
    if (search) queryParams.search = search
    if (type) queryParams.type = type
    if (available) queryParams.available = available

    const response = await apiClient.get('/storage', {
      params: queryParams,
    })

    return {
      items: response.data.items || [],
      total: response.data.total || 0,
      page: response.data.page || page,
      page_size: response.data.size || page_size,
    }
  },

  /**
   * 获取单个存储配置
   */
  async getStorageConfig(id: number | string): Promise<StorageConfig> {
    const response = await apiClient.get(`/storage/${id}`)
    return response.data
  },

  /**
   * 创建存储配置
   */
  async createStorageConfig(data: StorageConfigCreateUpdate): Promise<StorageConfig> {
    const response = await apiClient.post('/storage', data)
    return response.data
  },

  /**
   * 更新存储配置
   */
  async updateStorageConfig(id: number | string, data: Partial<StorageConfigCreateUpdate>): Promise<StorageConfig> {
    const response = await apiClient.put(`/storage/${id}`, data)
    return response.data
  },

  /**
   * 删除存储配置
   */
  async deleteStorageConfig(id: number | string): Promise<void> {
    await apiClient.delete(`/storage/${id}`)
  },

  /**
   * 测试存储配置连接
   */
  async testStorageConfig(id: number | string): Promise<{
    success: boolean
    message: string
    test_time: string
    is_connected: boolean // 兼容现有代码的字段
  }> {
    const response = await apiClient.post(`/storage/${id}/test-connectivity`)
    return {
      ...response.data,
      is_connected: response?.data?.is_connected, // 映射 success 到 is_connected
    }
  },

  /**
   * 获取可用集群列表（用于存储配置绑定）
   */
  async getAvailableClusters(params: {
    name?: string
    page?: number
    size?: number
  } = {}): Promise<{
      items: AvailableCluster[]
      total: number
      page: number
      size: number
    }> {
    const { page = 1, size = 50 } = params

    const queryParams: Record<string, any> = {
      page,
      size,
    }

    const response = await apiClient.get('/storage/available-clusters', {
      params: queryParams,
    })

    return response.data
  },

  /**
   * 获取已绑定的集群列表
   */
  async getOccupiedClusters(storageConfigId: number | string): Promise<OccupiedCluster[]> {
    const response = await apiClient.get(`/storage/occupied-clusters/${storageConfigId}`)

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
   * 批量绑定集群到存储配置
   */
  async bindClusters(storageConfigId: number | string, clusterIds: number[]): Promise<void> {
    await apiClient.post(`/storage/${storageConfigId}/bind-clusters`, {
      cluster_ids: clusterIds,
    })
  },

  /**
   * 批量解绑集群
   */
  async unbindClusters(storageConfigId: number | string, clusterIds: number[]): Promise<void> {
    await apiClient.delete(`/storage/${storageConfigId}/unbind-clusters`, {
      data: { cluster_ids: clusterIds },
    })
  },

  /**
   * 获取存储配置的集群映射关系（向后兼容）
   * @deprecated 推荐使用 getOccupiedClusters
   */
  async getStorageClusterMappings(storageConfigId: string): Promise<StorageClusterMapping[]> {
    const response = await apiClient.get(`/storage/${storageConfigId}/cluster-mappings`)
    return response.data
  },

  /**
   * 创建存储配置与集群的映射关系（向后兼容）
   * @deprecated 推荐使用 bindClusters
   */
  async createStorageClusterMapping(
    storageConfigId: string,
    data: StorageClusterMappingCreate,
  ): Promise<StorageClusterMapping> {
    const response = await apiClient.post(`/storage/${storageConfigId}/cluster-mappings`, data)
    return response.data
  },

  /**
   * 更新存储配置与集群的映射关系（向后兼容）
   * @deprecated 推荐使用 bindClusters
   */
  async updateStorageClusterMapping(
    storageConfigId: string,
    mappingId: string,
    data: StorageClusterMappingUpdate,
  ): Promise<StorageClusterMapping> {
    const response = await apiClient.put(`/storage/${storageConfigId}/cluster-mappings/${mappingId}`, data)
    return response.data
  },

  /**
   * 删除存储配置与集群的映射关系（向后兼容）
   * @deprecated 推荐使用 unbindClusters
   */
  async deleteStorageClusterMapping(storageConfigId: string, mappingId: string): Promise<void> {
    await apiClient.delete(`/storage/${storageConfigId}/cluster-mappings/${mappingId}`)
  },

  /**
   * 获取集群的存储配置列表
   */
  async getClusterStorageConfigs(clusterId: string): Promise<ClusterStorageConfig[]> {
    const response = await apiClient.get(`/clusters/${clusterId}/storage-configs`)
    return response.data
  },

  /**
   * 获取存储配置详情（包含集群映射信息）
   */
  async getStorageConfigDetail(storageConfigId: string): Promise<StorageConfigDetail> {
    const response = await apiClient.get(`/storage/${storageConfigId}/detail`)
    return response.data
  },

  /**
   * 激活存储配置在特定集群中的使用
   */
  async activateStorageInCluster(
    storageConfigId: string,
    clusterId: string,
  ): Promise<StorageClusterMapping> {
    const response = await apiClient.post(`/storage/${storageConfigId}/clusters/${clusterId}/activate`)
    return response.data
  },

  /**
   * 文件系统格式化
   */
  async formatFileSystem(storageConfigId: string): Promise<{
    meta_url: string
    success: boolean
    message?: string
  }> {
    const response = await apiClient.post(`/storage/init-juicefs-format/${storageConfigId}`)
    return response.data
  },
}

export default storageConfigService
