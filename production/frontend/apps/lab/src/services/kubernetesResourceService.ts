// Mock数据服务 - 模拟Kubernetes GPU资源管理

import apiClient from './apiClient'

// GPU 资源相关的类型定义
export interface GPUInfo {
  index: number
  name: string
  uuid: string
  memory_total: string
  memory_free: string
  status: 'available' | 'partial' | 'occupied'
  utilization: number
}

export interface KubernetesNode {
  name: string
  status: string
  labels: Record<string, string>
  capacity: Record<string, string>
  allocatable: Record<string, string>
  gpus: GPUInfo[]
}

export interface NodeResourceSummary {
  total_nodes: number
  total_gpus: number
  available_gpus: number
  partial_gpus: number
  occupied_gpus: number
  gpu_types: string[]
}

export interface KubernetesNodesResponse {
  nodes: KubernetesNode[]
  summary: NodeResourceSummary
}

export interface NodeGPUResponse {
  node_name: string
  node_status: string
  node_labels: Record<string, string>
  gpu_capacity: string
  gpus: GPUInfo[]
  gpu_summary: {
    available_count: number
    partial_count: number
    occupied_count: number
    total_memory_free: number
    total_memory_capacity: number
  }
}

export interface GPUType {
  type: string
  display_name: string
  memory: string
  nodes: string[]
  total_count: number
  available_count: number
}

export interface GPUTypesResponse {
  gpu_types: GPUType[]
  total_types: number
}

export interface ReserveGPUsRequest {
  node_name: string
  gpu_count: number
}

export interface ReserveGPUsResponse {
  success: boolean
  message: string
  reservation_id: string
  node_name: string
  gpu_count: number
}

// Mock数据：模拟GPU节点信息
const mockNodes: KubernetesNode[] = [
  {
    name: 'gpu-node-1',
    status: 'Ready',
    labels: {
      'gpu-type': 'nvidia-a100',
      'node-role': 'training',
      'region': 'us-west-2',
      'kubernetes.io/hostname': 'gpu-node-1',
      'node.kubernetes.io/instance-type': 'g5.4xlarge',
    },
    capacity: {
      'cpu': '16',
      'memory': '64Gi',
      'nvidia.com/gpu': '4',
      'ephemeral-storage': '200Gi',
    },
    allocatable: {
      'cpu': '15800m',
      'memory': '58Gi',
      'nvidia.com/gpu': '4',
      'ephemeral-storage': '184Gi',
    },
    gpus: [
      {
        index: 0,
        name: 'NVIDIA A100-SXM4-80GB',
        uuid: 'GPU-a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        memory_total: '80GB',
        memory_free: '78GB',
        status: 'available',
        utilization: 5,
      },
      {
        index: 1,
        name: 'NVIDIA A100-SXM4-80GB',
        uuid: 'GPU-a1b2c3d4-e5f6-7890-abcd-ef1234567891',
        memory_total: '80GB',
        memory_free: '35GB',
        status: 'occupied',
        utilization: 85,
      },
      {
        index: 2,
        name: 'NVIDIA A100-SXM4-80GB',
        uuid: 'GPU-a1b2c3d4-e5f6-7890-abcd-ef1234567892',
        memory_total: '80GB',
        memory_free: '79GB',
        status: 'available',
        utilization: 2,
      },
      {
        index: 3,
        name: 'NVIDIA A100-SXM4-80GB',
        uuid: 'GPU-a1b2c3d4-e5f6-7890-abcd-ef1234567893',
        memory_total: '80GB',
        memory_free: '80GB',
        status: 'available',
        utilization: 0,
      },
    ],
  },
  {
    name: 'gpu-node-2',
    status: 'Ready',
    labels: {
      'gpu-type': 'nvidia-h100',
      'node-role': 'training',
      'region': 'us-west-2',
      'kubernetes.io/hostname': 'gpu-node-2',
      'node.kubernetes.io/instance-type': 'p4d.24xlarge',
    },
    capacity: {
      'cpu': '96',
      'memory': '1152Gi',
      'nvidia.com/gpu': '8',
      'ephemeral-storage': '1000Gi',
    },
    allocatable: {
      'cpu': '95800m',
      'memory': '1100Gi',
      'nvidia.com/gpu': '8',
      'ephemeral-storage': '900Gi',
    },
    gpus: [
      {
        index: 0,
        name: 'NVIDIA H100-SXM5-80GB',
        uuid: 'GPU-h1b2c3d4-e5f6-7890-abcd-ef1234567890',
        memory_total: '80GB',
        memory_free: '80GB',
        status: 'available',
        utilization: 0,
      },
      {
        index: 1,
        name: 'NVIDIA H100-SXM5-80GB',
        uuid: 'GPU-h1b2c3d4-e5f6-7890-abcd-ef1234567891',
        memory_total: '80GB',
        memory_free: '80GB',
        status: 'available',
        utilization: 0,
      },
      {
        index: 2,
        name: 'NVIDIA H100-SXM5-80GB',
        uuid: 'GPU-h1b2c3d4-e5f6-7890-abcd-ef1234567892',
        memory_total: '80GB',
        memory_free: '8GB',
        status: 'occupied',
        utilization: 95,
      },
      {
        index: 3,
        name: 'NVIDIA H100-SXM5-80GB',
        uuid: 'GPU-h1b2c3d4-e5f6-7890-abcd-ef1234567893',
        memory_total: '80GB',
        memory_free: '80GB',
        status: 'available',
        utilization: 0,
      },
      {
        index: 4,
        name: 'NVIDIA H100-SXM5-80GB',
        uuid: 'GPU-h1b2c3d4-e5f6-7890-abcd-ef1234567894',
        memory_total: '80GB',
        memory_free: '60GB',
        status: 'partial',
        utilization: 25,
      },
      {
        index: 5,
        name: 'NVIDIA H100-SXM5-80GB',
        uuid: 'GPU-h1b2c3d4-e5f6-7890-abcd-ef1234567895',
        memory_total: '80GB',
        memory_free: '80GB',
        status: 'available',
        utilization: 0,
      },
      {
        index: 6,
        name: 'NVIDIA H100-SXM5-80GB',
        uuid: 'GPU-h1b2c3d4-e5f6-7890-abcd-ef1234567896',
        memory_total: '80GB',
        memory_free: '80GB',
        status: 'available',
        utilization: 0,
      },
      {
        index: 7,
        name: 'NVIDIA H100-SXM5-80GB',
        uuid: 'GPU-h1b2c3d4-e5f6-7890-abcd-ef1234567897',
        memory_total: '80GB',
        memory_free: '80GB',
        status: 'available',
        utilization: 0,
      },
    ],
  },
  {
    name: 'gpu-node-3',
    status: 'Ready',
    labels: {
      'gpu-type': 'nvidia-v100',
      'node-role': 'training',
      'region': 'us-west-2',
      'kubernetes.io/hostname': 'gpu-node-3',
      'node.kubernetes.io/instance-type': 'p3.8xlarge',
    },
    capacity: {
      'cpu': '32',
      'memory': '244Gi',
      'nvidia.com/gpu': '4',
      'ephemeral-storage': '500Gi',
    },
    allocatable: {
      'cpu': '31800m',
      'memory': '230Gi',
      'nvidia.com/gpu': '4',
      'ephemeral-storage': '450Gi',
    },
    gpus: [
      {
        index: 0,
        name: 'NVIDIA Tesla V100-SXM2-32GB',
        uuid: 'GPU-v1b2c3d4-e5f6-7890-abcd-ef1234567890',
        memory_total: '32GB',
        memory_free: '32GB',
        status: 'available',
        utilization: 0,
      },
      {
        index: 1,
        name: 'NVIDIA Tesla V100-SXM2-32GB',
        uuid: 'GPU-v1b2c3d4-e5f6-7890-abcd-ef1234567891',
        memory_total: '32GB',
        memory_free: '32GB',
        status: 'available',
        utilization: 0,
      },
      {
        index: 2,
        name: 'NVIDIA Tesla V100-SXM2-32GB',
        uuid: 'GPU-v1b2c3d4-e5f6-7890-abcd-ef1234567892',
        memory_total: '32GB',
        memory_free: '4GB',
        status: 'occupied',
        utilization: 80,
      },
      {
        index: 3,
        name: 'NVIDIA Tesla V100-SXM2-32GB',
        uuid: 'GPU-v1b2c3d4-e5f6-7890-abcd-ef1234567893',
        memory_total: '32GB',
        memory_free: '32GB',
        status: 'available',
        utilization: 0,
      },
    ],
  },
  {
    name: 'gpu-node-4',
    status: 'Ready',
    labels: {
      'gpu-type': 'nvidia-v100',
      'node-role': 'training',
      'region': 'us-west-2',
      'kubernetes.io/hostname': 'gpu-node-4',
      'node.kubernetes.io/instance-type': 'p3.16xlarge',
    },
    capacity: {
      'cpu': '64',
      'memory': '488Gi',
      'nvidia.com/gpu': '8',
      'ephemeral-storage': '1000Gi',
    },
    allocatable: {
      'cpu': '63800m',
      'memory': '460Gi',
      'nvidia.com/gpu': '8',
      'ephemeral-storage': '900Gi',
    },
    gpus: [
      {
        index: 0,
        name: 'NVIDIA Tesla V100-SXM2-32GB',
        uuid: 'GPU-v2b2c3d4-e5f6-7890-abcd-ef1234567890',
        memory_total: '32GB',
        memory_free: '32GB',
        status: 'available',
        utilization: 0,
      },
      {
        index: 1,
        name: 'NVIDIA Tesla V100-SXM2-32GB',
        uuid: 'GPU-v2b2c3d4-e5f6-7890-abcd-ef1234567891',
        memory_total: '32GB',
        memory_free: '32GB',
        status: 'available',
        utilization: 0,
      },
      {
        index: 2,
        name: 'NVIDIA Tesla V100-SXM2-32GB',
        uuid: 'GPU-v2b2c3d4-e5f6-7890-abcd-ef1234567892',
        memory_total: '32GB',
        memory_free: '32GB',
        status: 'available',
        utilization: 0,
      },
      {
        index: 3,
        name: 'NVIDIA Tesla V100-SXM2-32GB',
        uuid: 'GPU-v2b2c3d4-e5f6-7890-abcd-ef1234567893',
        memory_total: '32GB',
        memory_free: '32GB',
        status: 'available',
        utilization: 0,
      },
      {
        index: 4,
        name: 'NVIDIA Tesla V100-SXM2-32GB',
        uuid: 'GPU-v2b2c3d4-e5f6-7890-abcd-ef1234567894',
        memory_total: '32GB',
        memory_free: '32GB',
        status: 'available',
        utilization: 0,
      },
      {
        index: 5,
        name: 'NVIDIA Tesla V100-SXM2-32GB',
        uuid: 'GPU-v2b2c3d4-e5f6-7890-abcd-ef1234567895',
        memory_total: '32GB',
        memory_free: '32GB',
        status: 'available',
        utilization: 0,
      },
      {
        index: 6,
        name: 'NVIDIA Tesla V100-SXM2-32GB',
        uuid: 'GPU-v2b2c3d4-e5f6-7890-abcd-ef1234567896',
        memory_total: '32GB',
        memory_free: '32GB',
        status: 'available',
        utilization: 0,
      },
      {
        index: 7,
        name: 'NVIDIA Tesla V100-SXM2-32GB',
        uuid: 'GPU-v2b2c3d4-e5f6-7890-abcd-ef1234567897',
        memory_total: '32GB',
        memory_free: '32GB',
        status: 'available',
        utilization: 0,
      },
    ],
  },
]

// 模拟API延迟
const simulateDelay = (ms: number = 300): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 计算汇总信息
const calculateSummary = (nodes: KubernetesNode[]): NodeResourceSummary => {
  const totalGPUs = nodes.reduce((sum, node) => sum + node.gpus.length, 0)
  const availableGPUs = nodes.reduce((sum, node) =>
    sum + node.gpus.filter((gpu) => gpu.status === 'available').length, 0,
  )
  const partialGPUs = nodes.reduce((sum, node) =>
    sum + node.gpus.filter((gpu) => gpu.status === 'partial').length, 0,
  )
  const occupiedGPUs = nodes.reduce((sum, node) =>
    sum + node.gpus.filter((gpu) => gpu.status === 'occupied').length, 0,
  )

  const gpuTypes = Array.from(new Set(
    nodes.flatMap((node) => node.labels['gpu-type'] || []),
  )).filter((type) => type)

  return {
    total_nodes: nodes.length,
    total_gpus: totalGPUs,
    available_gpus: availableGPUs,
    partial_gpus: partialGPUs,
    occupied_gpus: occupiedGPUs,
    gpu_types: gpuTypes,
  }
}

/**
 * 获取Kubernetes节点列表
 * @param params 查询参数
 * @returns 节点列表和汇总信息
 */
export const getKubernetesNodes = async (params?: {
  cluster_name?: string
  gpu_type?: string
  available_only?: boolean
}): Promise<KubernetesNodesResponse> => {
  await simulateDelay()

  let filteredNodes = [...mockNodes]

  // 根据GPU类型过滤
  if (params?.gpu_type) {
    filteredNodes = filteredNodes.filter((node) =>
      node.labels['gpu-type'] === params.gpu_type,
    )
  }

  // 只显示有可用GPU的节点
  if (params?.available_only) {
    filteredNodes = filteredNodes.filter((node) =>
      node.gpus.some((gpu) => gpu.status === 'available'),
    )
  }

  return {
    nodes: filteredNodes,
    summary: calculateSummary(filteredNodes),
  }
}

/**
 * 获取指定节点的GPU详细信息
 * @param nodeName 节点名称
 * @returns 节点的GPU详细信息
 */
export const getNodeGPUs = async (nodeName: string): Promise<NodeGPUResponse> => {
  await simulateDelay()

  const node = mockNodes.find((n) => n.name === nodeName)
  if (!node) {
    throw new Error(`Node ${nodeName} not found`)
  }

  const availableCount = node.gpus.filter((gpu) => gpu.status === 'available').length
  const partialCount = node.gpus.filter((gpu) => gpu.status === 'partial').length
  const occupiedCount = node.gpus.filter((gpu) => gpu.status === 'occupied').length

  const totalMemoryFree = node.gpus.reduce((sum, gpu) => {
    return sum + parseInt(gpu.memory_free.replace('GB', ''))
  }, 0)

  const totalMemoryCapacity = node.gpus.reduce((sum, gpu) => {
    return sum + parseInt(gpu.memory_total.replace('GB', ''))
  }, 0)

  return {
    node_name: node.name,
    node_status: node.status,
    node_labels: node.labels,
    gpu_capacity: node.capacity['nvidia.com/gpu'] || '0',
    gpus: node.gpus,
    gpu_summary: {
      available_count: availableCount,
      partial_count: partialCount,
      occupied_count: occupiedCount,
      total_memory_free: totalMemoryFree,
      total_memory_capacity: totalMemoryCapacity,
    },
  }
}

/**
 * 获取集群中可用的GPU类型信息
 * @returns GPU类型信息
 */
export const getGPUTypes = async (): Promise<GPUTypesResponse> => {
  await simulateDelay()

  const gpuTypeMap = new Map<string, {
    nodes: string[]
    totalCount: number
    availableCount: number
    memory: string
    displayName: string
  }>()

  mockNodes.forEach((node) => {
    const gpuType = node.labels['gpu-type']
    if (!gpuType) return

    if (!gpuTypeMap.has(gpuType)) {
      const sampleGPU = node.gpus[0]
      gpuTypeMap.set(gpuType, {
        nodes: [],
        totalCount: 0,
        availableCount: 0,
        memory: sampleGPU.memory_total,
        displayName: sampleGPU.name,
      })
    }

    const typeInfo = gpuTypeMap.get(gpuType)!
    typeInfo.nodes.push(node.name)
    typeInfo.totalCount += node.gpus.length
    typeInfo.availableCount += node.gpus.filter((gpu) => gpu.status === 'available').length
  })

  const gpuTypes: GPUType[] = Array.from(gpuTypeMap.entries()).map(([type, info]) => ({
    type,
    display_name: info.displayName,
    memory: info.memory,
    nodes: info.nodes,
    total_count: info.totalCount,
    available_count: info.availableCount,
  }))

  return {
    gpu_types: gpuTypes,
    total_types: gpuTypes.length,
  }
}

/**
 * 预留GPU资源
 * @param requestData 预留请求数据
 * @returns 预留结果
 */
export const reserveGPUs = async (requestData: ReserveGPUsRequest): Promise<ReserveGPUsResponse> => {
  await simulateDelay()

  // 模拟预留成功
  console.log('模拟预留GPU资源:', requestData)

  return {
    success: true,
    message: `成功预留 ${requestData.gpu_count} 个GPU资源`,
    reservation_id: `res-${Date.now()}`,
    node_name: requestData.node_name,
    gpu_count: requestData.gpu_count,
  }
}

/**
 * 获取可用的GPU选项列表（用于表单选择）
 * @returns GPU选项列表
 */
export const getAvailableGPUOptions = async (): Promise<Array<{
  node_name: string
  gpu_type: string
  available_gpus: GPUInfo[]
  total_memory_free: number
}>> => {
  const nodesResponse = await getKubernetesNodes({ available_only: true })

  return nodesResponse.nodes.map((node) => ({
    node_name: node.name,
    gpu_type: node.labels['gpu-type'] || 'unknown',
    available_gpus: node.gpus.filter((gpu) => gpu.status === 'available'),
    total_memory_free: node.gpus
      .filter((gpu) => gpu.status === 'available')
      .reduce((sum, gpu) => sum + parseInt(gpu.memory_free.replace('GB', '')), 0),
  })).filter((option) => option.available_gpus.length > 0)
}

/**
 * 根据GPU类型获取可用节点
 * @param gpuType GPU类型
 * @returns 可用节点列表
 */
export const getAvailableNodesByGPUType = async (gpuType: string): Promise<KubernetesNode[]> => {
  const response = await getKubernetesNodes({ gpu_type: gpuType, available_only: true })
  return response.nodes
}

/**
 * 获取节点的可用GPU数量
 * @param nodeName 节点名称
 * @returns 可用GPU数量
 */
export const getAvailableGPUCount = async (nodeName: string): Promise<number> => {
  const nodeGPUs = await getNodeGPUs(nodeName)
  return nodeGPUs.gpu_summary.available_count
}

export const bindStorage = async (registryId: number, clusterId: number): Promise<void> => {
  await apiClient.post(`/k8s/${clusterId}/${registryId}/bind-storage`)
}

export const bindRepository = async (registryId: number, clusterId: number): Promise<void> => {
  await apiClient.post(`/k8s/${clusterId}/${registryId}/bind-repository`)
}

export const bindMount = async (registryId: number, clusterId: number): Promise<void> => {
  await apiClient.post(`storage/${registryId}/mount/${clusterId}`)
}
