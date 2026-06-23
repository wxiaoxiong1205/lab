import type {
  AvailableCluster,
  OccupiedCluster,
  StorageConfig,
  StorageConfigCreateUpdate,
  StorageConfigQueryParams,
} from '../types'

// 模拟存储配置数据
const mockStorageConfigs: StorageConfig[] = [
  {
    id: 1,
    name: '生产环境TOS存储',
    description: '用于生产环境的火山引擎TOS对象存储配置',
    type: 'tos',
    config: {
      endpoint: 'tos-cn-beijing.volces.com',
      access_key: 'ak_test_123456',
      secret_key: 'sk_test_123456',
    },
    status: '连接正常',
    cluster_number: 3,
    last_test_at: '2024-12-01T10:30:00Z',
    test_status: 'success',
    test_message: '连接测试成功',
    created_at: '2024-11-01T09:00:00Z',
    updated_at: '2024-12-01T10:30:00Z',
    created_id: 1,
    created_by: 'admin',
  },
  {
    id: 2,
    name: '开发环境MinIO',
    description: '开发环境使用的MinIO对象存储',
    type: 'minio',
    config: {
      endpoint: 'http://localhost:9000',
      access_key: 'minioadmin',
      secret_key: 'minioadmin123',
    },
    status: '连接正常',
    cluster_number: 1,
    last_test_at: '2024-12-01T09:15:00Z',
    test_status: 'success',
    test_message: '连接测试成功',
    created_at: '2024-11-15T14:30:00Z',
    updated_at: '2024-12-01T09:15:00Z',
    created_id: 1,
    created_by: 'admin',
  },
  {
    id: 3,
    name: '本地NFS存储',
    description: '本地网络文件系统存储',
    type: 'nfs',
    config: {
      endpoint: '192.168.1.100',
    },
    status: '连接失败',
    cluster_number: 0,
    last_test_at: '2024-12-01T08:45:00Z',
    test_status: 'failed',
    test_message: '无法连接到NFS服务器',
    created_at: '2024-11-20T16:00:00Z',
    updated_at: '2024-12-01T08:45:00Z',
    created_id: 1,
    created_by: 'admin',
  },
]

// 模拟可用集群数据
const mockAvailableClusters: AvailableCluster[] = [
  {
    id: 1,
    name: '生产集群-01',
    api_server: 'https://k8s-prod-01.example.com:6443',
    status: 'online',
    version: 'v1.28.0',
    node_number: 8,
    description: '生产环境主集群',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-12-01T00:00:00Z',
    created_by: 'admin',
  },
  {
    id: 2,
    name: '生产集群-02',
    api_server: 'https://k8s-prod-02.example.com:6443',
    status: 'online',
    version: 'v1.28.0',
    node_number: 6,
    description: '生产环境备用集群',
    created_at: '2024-02-01T00:00:00Z',
    updated_at: '2024-12-01T00:00:00Z',
    created_by: 'admin',
  },
  {
    id: 3,
    name: '开发集群',
    api_server: 'https://k8s-dev.example.com:6443',
    status: 'online',
    version: 'v1.27.0',
    node_number: 4,
    description: '开发环境集群',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-12-01T00:00:00Z',
    created_by: 'admin',
  },
  {
    id: 4,
    name: '测试集群',
    api_server: 'https://k8s-test.example.com:6443',
    status: 'offline',
    version: 'v1.26.0',
    node_number: 2,
    description: '测试环境集群',
    created_at: '2024-04-01T00:00:00Z',
    updated_at: '2024-12-01T00:00:00Z',
    created_by: 'admin',
  },
]

// 模拟已绑定集群数据
const mockOccupiedClusters: Record<number, OccupiedCluster[]> = {
  1: [
    {
      cluster_id: 1,
      cluster_name: '生产集群-01',
      api_server: 'https://k8s-prod-01.example.com:6443',
      status: 'online',
      bound_at: '2024-11-15T10:00:00Z',
      is_active: true,
    },
    {
      cluster_id: 2,
      cluster_name: '生产集群-02',
      api_server: 'https://k8s-prod-02.example.com:6443',
      status: 'online',
      bound_at: '2024-11-20T14:30:00Z',
      is_active: true,
    },
    {
      cluster_id: 3,
      cluster_name: '开发集群',
      api_server: 'https://k8s-dev.example.com:6443',
      status: 'online',
      bound_at: '2024-11-25T09:15:00Z',
      is_active: true,
    },
  ],
  2: [
    {
      cluster_id: 3,
      cluster_name: '开发集群',
      api_server: 'https://k8s-dev.example.com:6443',
      status: 'online',
      bound_at: '2024-11-15T16:00:00Z',
      is_active: true,
    },
  ],
  3: [],
}

/**
 * 模拟存储配置服务
 */
export const mockStorageConfigService = {
  /**
   * 获取存储配置列表
   */
  async getStorageConfigs(params: StorageConfigQueryParams = {}): Promise<{
    items: StorageConfig[]
    total: number
    page: number
    page_size: number
  }> {
    // 模拟网络延迟
    await new Promise((resolve) => setTimeout(resolve, 300))

    const { page = 1, page_size = 10, search, type } = params

    let filteredConfigs = [...mockStorageConfigs]

    // 搜索过滤
    if (search) {
      filteredConfigs = filteredConfigs.filter((config) =>
        config.name.toLowerCase().includes(search.toLowerCase())
        || (config.description && config.description.toLowerCase().includes(search.toLowerCase())),
      )
    }

    // 类型过滤
    if (type) {
      filteredConfigs = filteredConfigs.filter((config) =>
        config.type.toLowerCase() === type.toLowerCase(),
      )
    }

    // 分页
    const startIndex = (page - 1) * page_size
    const endIndex = startIndex + page_size
    const paginatedConfigs = filteredConfigs.slice(startIndex, endIndex)

    return {
      items: paginatedConfigs,
      total: filteredConfigs.length,
      page,
      page_size,
    }
  },

  /**
   * 获取单个存储配置
   */
  async getStorageConfig(id: number | string): Promise<StorageConfig> {
    await new Promise((resolve) => setTimeout(resolve, 200))

    const config = mockStorageConfigs.find((c) => c.id === Number(id))
    if (!config) {
      throw new Error('存储配置不存在')
    }

    return config
  },

  /**
   * 创建存储配置
   */
  async createStorageConfig(data: StorageConfigCreateUpdate): Promise<StorageConfig> {
    await new Promise((resolve) => setTimeout(resolve, 500))

    const newConfig: StorageConfig = {
      id: Math.max(...mockStorageConfigs.map((c) => c.id)) + 1,
      name: data.name,
      description: data.description,
      type: data.type,
      config: data.config,
      status: '未测试',
      cluster_number: 0,
      test_status: 'untested',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_id: 1,
      created_by: 'admin',
    }

    mockStorageConfigs.push(newConfig)
    return newConfig
  },

  /**
   * 更新存储配置
   */
  async updateStorageConfig(id: number | string, data: Partial<StorageConfigCreateUpdate>): Promise<StorageConfig> {
    await new Promise((resolve) => setTimeout(resolve, 400))

    const index = mockStorageConfigs.findIndex((c) => c.id === Number(id))
    if (index === -1) {
      throw new Error('存储配置不存在')
    }

    const updatedConfig = {
      ...mockStorageConfigs[index],
      ...data,
      updated_at: new Date().toISOString(),
    }

    mockStorageConfigs[index] = updatedConfig
    return updatedConfig
  },

  /**
   * 删除存储配置
   */
  async deleteStorageConfig(id: number | string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 300))

    const index = mockStorageConfigs.findIndex((c) => c.id === Number(id))
    if (index === -1) {
      throw new Error('存储配置不存在')
    }

    mockStorageConfigs.splice(index, 1)
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
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const config = mockStorageConfigs.find((c) => c.id === Number(id))
    if (!config) {
      throw new Error('存储配置不存在')
    }

    // 模拟测试结果
    const isSuccess = Math.random() > 0.3 // 70%成功率

    const result = {
      success: isSuccess,
      message: isSuccess ? '连接测试成功' : '连接测试失败，请检查配置参数',
      test_time: new Date().toISOString(),
      is_connected: isSuccess, // 兼容现有代码的字段
    }

    // 更新配置状态
    config.status = isSuccess ? '连接正常' : '连接失败'
    config.last_test_at = result.test_time
    config.test_status = isSuccess ? 'success' : 'failed'
    config.test_message = result.message

    return result
  },

  /**
   * 获取可用集群列表
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
    await new Promise((resolve) => setTimeout(resolve, 300))

    const { page = 1, size = 50 } = params

    return {
      items: mockAvailableClusters,
      total: mockAvailableClusters.length,
      page,
      size,
    }
  },

  /**
   * 获取已绑定的集群列表
   */
  async getOccupiedClusters(storageConfigId: number | string): Promise<OccupiedCluster[]> {
    await new Promise((resolve) => setTimeout(resolve, 200))

    return mockOccupiedClusters[Number(storageConfigId)] || []
  },

  /**
   * 批量绑定集群到存储配置
   */
  async bindClusters(storageConfigId: number | string, clusterIds: number[]): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 800))

    const configId = Number(storageConfigId)

    // 更新配置的集群数量
    const config = mockStorageConfigs.find((c) => c.id === configId)
    if (config) {
      config.cluster_number = clusterIds.length
    }

    // 更新绑定关系
    mockOccupiedClusters[configId] = clusterIds.map((clusterId) => {
      const cluster = mockAvailableClusters.find((c) => c.id === clusterId)
      return {
        cluster_id: clusterId,
        cluster_name: cluster?.name || `集群-${clusterId}`,
        api_server: cluster?.api_server || '',
        status: cluster?.status || 'online',
        bound_at: new Date().toISOString(),
        is_active: true,
      }
    })
  },

  /**
   * 批量解绑集群
   */
  async unbindClusters(storageConfigId: number | string, clusterIds: number[]): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 500))

    const configId = Number(storageConfigId)

    // 更新配置的集群数量
    const config = mockStorageConfigs.find((c) => c.id === configId)
    if (config) {
      config.cluster_number = Math.max(0, (config.cluster_number || 0) - clusterIds.length)
    }

    // 更新绑定关系
    if (mockOccupiedClusters[configId]) {
      mockOccupiedClusters[configId] = mockOccupiedClusters[configId].filter(
        (cluster) => !clusterIds.includes(cluster.cluster_id),
      )
    }
  },
}

export default mockStorageConfigService
