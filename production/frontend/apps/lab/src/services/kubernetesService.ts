import type {
  ClusterHealthStatus,
  KubeconfigImportRequest,
  KubeconfigValidationResult,
  KubernetesCluster,
  KubernetesClusterBackend,
} from '../types'
import apiClient from './apiClient'

/**
 * 将后端集群数据转换为前端格式
 */
const transformClusterData = (backendCluster: KubernetesClusterBackend): KubernetesCluster => {
  return {
    id: String(backendCluster.id),
    name: backendCluster.name,
    server: backendCluster.api_server,
    status: backendCluster.status,
    description: backendCluster.description || undefined,
    version: backendCluster.version,
    nodeCount: backendCluster.node_number,
    createdAt: backendCluster.created_at,
    updatedAt: backendCluster.updated_at,
    created_by: backendCluster.created_by,
    // 保留后端原始字段
    api_server: backendCluster.api_server,
    node_number: backendCluster.node_number,
    created_at: backendCluster.created_at,
    updated_at: backendCluster.updated_at,
    created_id: backendCluster.created_id,
    // 添加存储和仓库配置字段
    storage_id: backendCluster.storage_id,
    repository_id: backendCluster.repository_id,
    // 添加挂载状态字段
    is_mount: backendCluster.is_mount,
    // 添加扩展字段
    ext: backendCluster.ext,
  }
}

/**
 * 分页查询参数接口
 */
export interface PaginationParams {
  page?: number
  size?: number
}

/**
 * 分页响应接口
 */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
}

/**
 * SSH配置接口
 */
export interface SSHConfig {
  ssh_username: string
  ssh_password: string
  ssh_key: string
  is_ssh: boolean
}

/**
 * 实例列表响应接口
 */
export interface InstanceListResponse {
  pod_name: string
  phase: string
  node_name: string
  start_time: string
  containers: InstanceContainer[]
}

/**
 * 实例容器接口
 */
export interface InstanceContainer {
  name: string
  ready: boolean
  restart_count: number
}

/**
 * 获取所有Kubernetes集群列表（支持分页）
 * @param params 分页参数
 * @returns 集群列表数据
 */
export const getKubernetesClusters = async (params: PaginationParams = {}): Promise<KubernetesCluster[]> => {
  const { page = 1, size = 50 } = params
  const response = await apiClient.get('/k8s/clusters', {

    params: { page, size },
  })

  // 如果后端返回分页格式，则返回items；否则直接返回data
  if (response.data && Array.isArray(response.data.items)) {
    return response.data.items.map((cluster: KubernetesClusterBackend) => transformClusterData(cluster))
  }

  // 如果是直接返回数组格式
  const backendClusters = response.data as KubernetesClusterBackend[]
  return backendClusters.map(transformClusterData)
}
/**
 * 获取可用Kubernetes集群列表（支持分页）
 * @param params 分页参数
 * @returns 集群列表数据
 */
export const getCanUseKubernetesClusters = async (params: PaginationParams = {}): Promise<KubernetesCluster[]> => {
  const { page = 1, size = 50 } = params
  const response = await apiClient.get('/k8s/available-clusters', {

    params: { page, size },
  })

  // 如果后端返回分页格式，则返回items；否则直接返回data
  if (response.data && Array.isArray(response.data.items)) {
    return response.data.items.map((cluster: KubernetesClusterBackend) => transformClusterData(cluster))
  }

  // 如果是直接返回数组格式
  const backendClusters = response.data as KubernetesClusterBackend[]
  return backendClusters.map(transformClusterData)
}
/**
 * 获取单个集群详情
 * @param clusterId 集群ID
 * @returns 集群详情数据
 */
export const getKubernetesCluster = async (clusterId: string): Promise<KubernetesCluster> => {
  const response = await apiClient.get(`/k8s/clusters/${clusterId}`)
  const backendCluster = response.data as KubernetesClusterBackend
  return transformClusterData(backendCluster)
}
/**
 * 获取集群显卡资源
 * @param clusterId 集群ID
 * @returns 显卡资源数据
 */
export const getKubernetesClusterGPUs = async (project_id: number): Promise<any> => {
  const response = await apiClient.get(`/k8s/k8s-resource/by-project/${project_id}/list`)
  return response.data
}
/**
 * 获取集群显卡型号资源
 */
export const getKubernetesClusterGPUTypes = async (project_id: number, resource_type: string): Promise<any> => {
  const response = await apiClient.get(`/k8s/k8s-graphics-card-model/by-project/${project_id}`, {
    params: {
      resource_type,
    },
  })
  return response.data
}

/**
 * 获取显卡型号资源
 * @param project_id 项目ID
 * @returns 显卡型号资源数据
 */
export const getKubernetesAllocatableResources = async (project_id: number, resource_type: string, resource_card_model: string): Promise<any> => {
  const response = await apiClient.get(`/k8s/allocatable/by-project/${project_id}/list`, {
    params: {
      resource_type, resource_card_model,
    },
  })
  return response.data
}

/**
 * 获取集群显卡资源
 * @param clusterId 集群ID
 * @returns 显卡资源数据
 */
export const getKubernetesClusterGPUsByType = async (project_id: number, resource_type: string): Promise<any> => {
  const response = await apiClient.get(`/k8s/k8s-graphics-card-model/by-project/${project_id}`, {
    params: {
      resource_type,
    },
  })
  return response.data
}
/**
 * 导入kubeconfig配置
 * @param data 导入数据
 * @returns 导入结果
 */
export const importKubeconfig = async (data: KubeconfigImportRequest): Promise<KubernetesCluster> => {
  const response = await apiClient.post('/k8s/clusters', data)
  const backendCluster = response.data as KubernetesClusterBackend
  return transformClusterData(backendCluster)
}

/**
 * 验证kubeconfig配置
 * @param content kubeconfig内容
 * @returns 验证结果
 */
export const validateKubeconfig = async (content: string): Promise<KubeconfigValidationResult> => {
  const response = await apiClient.post('/k8s/clusters/validate', { config: content })
  return response.data
}

/**
 * 删除集群
 * @param clusterId 集群ID
 * @returns 操作结果
 */
export const deleteKubernetesCluster = async (clusterId: string): Promise<void> => {
  await apiClient.delete(`/k8s/clusters/${clusterId}`)
}

/**
 * 集群更新请求接口
 */
export interface ClusterUpdateRequest {
  name: string
  config?: string
  description?: string
  api_server?: string
}

/**
 * 更新集群信息
 * @param clusterId 集群ID
 * @param data 更新数据
 * @returns 更新结果
 */
export const updateKubernetesCluster = async (
  clusterId: string,
  data: ClusterUpdateRequest,
): Promise<KubernetesCluster> => {
  // 确保clusterId是数字类型，因为后端API期望integer
  const numericClusterId = parseInt(clusterId, 10)
  if (isNaN(numericClusterId)) {
    throw new TypeError(`无效的集群ID: ${clusterId}`)
  }

  // 只发送后端期望的字段
  const requestData: ClusterUpdateRequest = {
    name: data.name,
    config: data.config,
    description: data.description,
    api_server: data.api_server,
  }

  const response = await apiClient.put(`/k8s/clusters/${numericClusterId}`, requestData)
  const backendCluster = response.data as KubernetesClusterBackend
  return transformClusterData(backendCluster)
}

/**
 * 获取集群健康状态
 * @param clusterId 集群ID
 * @returns 健康状态数据
 */
export const getClusterHealthStatus = async (clusterId: string): Promise<ClusterHealthStatus> => {
  const response = await apiClient.get(`/k8s/clusters/${clusterId}/health`)
  return response.data
}

/**
 * 集群连接测试响应接口
 */
export interface ClusterConnectivityResponse {
  cluster_id: number
  is_connected: boolean
}

/**
 * 测试集群连接
 * @param clusterId 集群ID（字符串，会自动转换为数字）
 * @returns 连接测试结果
 */
export const testClusterConnection = async (clusterId: string): Promise<ClusterConnectivityResponse> => {
  // 确保clusterId是数字类型，因为后端API期望integer
  const numericClusterId = parseInt(clusterId, 10)
  if (isNaN(numericClusterId)) {
    throw new TypeError(`无效的集群ID: ${clusterId}`)
  }

  // POST请求，请求体为空
  const response = await apiClient.post(`/k8s/clusters/${numericClusterId}/test-connectivity`, {})
  return response.data
}

/**
 * 获取SSH配置
 * @returns SSH配置
 */
export const getSSHConfig = async (project_id: number): Promise<SSHConfig> => {
  const response = await apiClient.get(`/projects/ssh-config/${project_id}`)
  return response.data
}

/**
 * 更新SSH配置
 * @param project_id 项目ID
 * @param data 更新数据
 * @returns 更新结果
 */
export const updateSSHConfig = async (project_id: number, data: { is_ssh: boolean, ssh_username?: string, ssh_password?: string }): Promise<SSHConfig> => {
  const response = await apiClient.put(`/projects/ssh-config-user/${project_id}`, data)
  return response.data
}
/**
 * 生成ssh密钥，需要管理员
 * @returns 生成结果
 */
export const generateSSHKey = async (project_id: number): Promise<any> => {
  const response = await apiClient.get(`/projects/ssh-config-key/${project_id}`, {
    responseType: 'blob',
  })
  return response
}

/**
 * 获取实例列表
 * @param project_id
 * @param app_name
 * @returns
 */
export const getInstanceList = async (project_id: number, app_name: string): Promise<InstanceListResponse[]> => {
  const response = await apiClient.get(`/k8s/namespaces/${project_id}/deployments/${app_name}/pods`)
  return response.data
}

/**
 * 构建 Pod 日志流的 WebSocket URL
 * @param projectId 项目ID（对应 namespace）
 * @param podName Pod名称
 * @param containerName 容器名称（可选）
 * @returns WebSocket URL
 */
export const getPodLogsStreamUrl = (
  projectId: number,
  podName: string,
): string => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host

  // 构建基础 URL
  let url = `${protocol}//${host}/lab-backend/api/v1/k8s/namespaces/${projectId}/pods/${podName}/logs/stream`

  // 添加参数
  const params: string[] = []

  // tail_lines 固定为 100（只获取最新 100 行日志）
  params.push(`tail_lines=100`)

  // 如果需要 token 认证，从 localStorage 获取
  const token = localStorage.getItem('access_token')
  if (token) {
    params.push(`token=${encodeURIComponent(token)}`)
  }

  // 拼接查询参数
  if (params.length > 0) {
    url += `?${params.join('&')}`
  }

  return url
}
