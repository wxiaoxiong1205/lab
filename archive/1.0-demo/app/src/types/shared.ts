// ============ 数据服务 ============

export interface DatasetRecord {
  id: string
  name: string
  version?: string
  versionStatus?: 'released' | 'draft' | 'archived'
  latestVersion?: string
  dataUsage?: string
  dataFormat?: string
  status?: string
  creator?: string
  createdAt: string
  charCount?: number
  sampleCount?: number
  sampleRate?: number
  trainRatio?: number
  // 推理结果集特有
  inferenceProgress?: number
  inferenceModel?: string
  dataVolume?: number
  pendingData?: string
  pendingModel?: string
}

export interface FileFolder {
  id: string
  name: string
  description?: string
  creator: string
  createdAt: string
}

// ============ 模型评估 ============

export interface EvaluationTask {
  id: string
  name: string
  businessScenario?: string
  model: string
  indicator?: string
  result?: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  createdAt: string
  creator?: string
}

export interface EvaluationIndicator {
  id: string
  name: string
  type: string
  description: string
  calculationMethod?: string
  createdAt?: string
}

// ============ 模型服务 ============

export interface ModelService {
  id: string
  name: string
  modelVersion?: string
  inferenceModel?: string
  status: 'running' | 'stopped' | 'error'
  accessUrl?: string
  qps?: number
  latency?: string
  apiPath?: string
  httpMethod?: string
  authType?: string
  qpsLimit?: number
  createdAt: string
  creator?: string
}

// ============ 机器学习 ============

export interface MLDataset {
  id: string
  name: string
  version?: string
  dataType?: string
  annotationType?: string
  annotationTemplate?: string
  createdAt: string
}

export interface MLAnnotationTask {
  id: string
  name: string
  dataset: string
  progress: string
  status: 'pending' | 'in_progress' | 'completed'
  createdAt: string
}

// ============ 系统管理 ============

export interface Project {
  id: string
  name: string
  description?: string
  boundCluster?: string
  createdAt: string
  memberCount?: number
}

export interface KubernetesCluster {
  id: string
  name: string
  description?: string
  apiServer: string
  kubeconfig?: string
  labels?: string[]
  nodeCount?: number
  connectionStatus: 'connected' | 'disconnected' | 'unknown' | 'untested'
  mountStatus: 'mounted' | 'unmounted'
  storageConfig?: string
  imageRegistry?: string
  createdAt: string
}

export interface StorageConfig {
  id: string
  name: string
  description?: string
  type: string
  endpoint?: string
  region?: string
  bucket?: string
  accessKeyId?: string
  accessKeySecret?: string
  clusterCount?: number
  connectionStatus: 'connected' | 'disconnected' | 'untested'
  lastTestTime?: string
}

export interface ImageRegistry {
  id: string
  name: string
  namespace?: string
  address: string
  authType?: string
  adminAddress?: string
  boundClusterCount?: number
  status: 'normal' | 'abnormal'
  createdAt: string
}

export interface ImageRecord {
  id: string
  name: string
  description?: string
  category?: string
  registry?: string
  namespace?: string
  addedAt: string
}

export interface BaseModelRecord {
  id: string
  code: string
  name: string
  description?: string
  provider?: string
  address?: string
  status: 'running' | 'stopped'
  createdAt: string
}

export interface SystemSetting {
  id: string
  name: string
  description?: string
  inputType: string
  value: string
  group?: string
  required: boolean
}

export interface PlatformAdmin {
  id: string
  account: string
  username: string
  email?: string
  joinedAt: string
}
