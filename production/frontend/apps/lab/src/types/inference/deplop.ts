// ================================ 已部署推理服务列表请求参数 ================================
/**
 * 已部署推理服务列表请求参数
 */
export interface DelopServerListParams {
  /**
   * 项目id
   */
  project_id: number
  page?: number
  size?: number
  /**
   * 按模型名称搜索
   */
  model_name?: string
  /**
   * 指定模型来源（训练生成 / 基础模型 / 机器模型）
   */
  model_source?: ModelSource
  /**
   * 按推理服务名称搜索
   */
  server_name?: string
  /**
   * 模型的运行状态
   */
  status?: DelopServerStatus
  [property: string]: any
}

/**
 * 指定模型来源，来源包括训练生成和基础模型
 */
export enum DelopServerModelSource {
  BaseModel = 'base_model',
  TrainedModel = 'trained_model',
  MlModel = 'ml_model',
}

/**
 * 模型的运行状态
 */
export enum DelopServerStatus {
  准备中 = '准备中',
  失败 = '失败',
  终止 = '终止',
  运行中 = '运行中',
}

/**
 * 已部署推理服务列表响应
 */
export interface DeplopServerListResponse {
  items: DeplopServerItem[]
  page: number
  pages: number
  size: number
  total: number
  [property: string]: any
}

/**
 * 已部署推理服务列表项
 */
export interface DeplopServerItem {
  access_url?: string
  created_at?: string
  created_by?: string
  description?: string
  desired_replicas?: number
  id?: number
  model_name?: string
  model_source?: string
  project_id?: number
  ready_replicas?: number
  server_name?: string
  status?: string
  updated_at?: string
  [property: string]: any
}

// ================================ 拉起推理任务 ================================
/**
 * 拉起推理任务请求参数
 */
export interface DelopServerStartParams {
  auto_start?: boolean // 在线调试时自动启动 设置为true
  /**
   * 命令行（推理参数）
   */
  backend_parameters?: string[] | null
  /**
   * 基础模型配置
   */
  base_model_config?: null | BaseModelConfig // 基础模型部署 仅基础模型部署时传入
  ml_model_config?: null | MlModelConfig // 机器模型部署 仅机器模型部署时传入
  /**
   * 部署实例数
   */
  desired_replicas: number
  env_vars: { [key: string]: any }
  /**
   * 图形卡资源配置
   */
  graphics_card_resource: GraphicsCardResource
  /**
   * 推理服务镜像配置
   */
  image_config: ImageConfig
  /**
   * 推理引擎类型
   */
  inference_engine_type: InferenceEngineType
  /**
   * 模型来源（base_model/trained_model
   */
  model_source: ModelSource
  /**
   * 关联项目ID
   */
  project_id: number
  run_command: string
  /**
   * 推理服务名称
   */
  server_name: string
  /**
   * 训练生成模型配置
   */
  trained_model_config?: null | TrainedModelConfig
  /**
   * 资源配置
   */
  resource_cpu_config?: null | ResourceCpuConfig
  [property: string]: any
}

/**
 * 基础模型配置
 */
export interface BaseModelConfig {
  /**
   * 基础模型ID
   */
  base_model_id: number
  /**
   * 基础模型名称
   */
  base_model_name: string
  /**
   * 基础模型路径
   */
  base_model_path: string
  [property: string]: any
}

export interface MlModelConfig {
  ml_model_id: number
  ml_handle_upload_id?: string // 本地上传才传入 机器模型上传文件 python 文件 id
  notebook_id?: number // Notebook 获取时传入
  handle_source_ref?: string // Notebook 获取时传入（工作区文件路径）
  ml_handle_source_type?: string // Notebook 获取时传入，值为 `notebook`
  /** 版本号（与模型管理一致，可选） */
  model_version?: string
  /** 模型名称（不含版本后缀，与模型管理一致） */
  ml_model_name: string
}

/**
 * 图形卡资源配置
 */
export interface GraphicsCardResource {
  card_memory?: string
  card_model: string
  card_type: string
  count: number
  k8s_resource_type: K8SResourceType
  [property: string]: any
}

export enum K8SResourceType {
  Huaweicomnpu = 'huawei.com/npu',
  Nvidiacomgpu = 'nvidia.com/gpu',
}

/**
 * 推理服务镜像配置
 */
export interface ImageConfig {
  /**
   * 镜像ID
   */
  image_id: number
  /**
   * 镜像名称
   */
  image_name: string
  /**
   * 镜像地址
   */
  image_url: string
  [property: string]: any
}

/**
 * 推理引擎类型
 */
export enum InferenceEngineType {
  DGIServer = 'DGI-Server',
  MindIE = 'MindIE',
  SGLang = 'SGLang',
  VLLM = 'vLLM',
}

/**
 * 模型来源（base_model/trained_model
 */
export enum ModelSource {
  BaseModel = 'base_model',
  TrainedModel = 'trained_model',
  MachineModel = 'ml_model',
}

export interface TrainedModelConfig {
  /**
   * 模型版本
   */
  model_version: string
  /**
   * 训练生成模型ID
   */
  trained_model_id: number
  /**
   * 训练生成模型名称
   */
  trained_model_name: string
  /**
   * 训练生成模型路径
   */
  trained_model_path: string
  [property: string]: any
}

/**
 * 资源配置
 */
export interface ResourceCpuConfig {
  /**
   * CPU请求
   */
  resource_cpu_request: number
  /**
   * CPU限制
   */
  resource_cpu_limit: number
  /**
   * 内存请求
   */
  resource_memory_request: number
  /**
   * 内存限制
   */
  resource_memory_limit: number
}
export interface DeplopServerStartResponse {
  created_at: string
  description: string
  desired_replicas: number
  /**
   * 任务ID
   */
  id: number
  message: string
  model_name: string
  model_source: ModelSource
  project_id: number
  ready_replicas: number
  server_name: string
  status: Status
  updated_at: string
  [property: string]: any
}

export enum Status {
  停止 = '停止',
  准备中 = '准备中',
  创建 = '创建',
  失败 = '失败',
  已完成 = '已完成',
  排队中 = '排队中',
  终止 = '终止',
  运行中 = '运行中',
}

// ================================ 获取推理任务详情 ================================
/**
 * 获取推理任务详情请求参数
 */
export interface DelopServerDetailParams {
  /**
   * 项目ID
   */
  project_id: number
  /**
   * 推理任务名称
   */
  inference_task_id: number
}

/**
 * 获取推理任务详情响应
 */
export interface DeplopServerDetailResponse {
  id: number
  server_name: string
  model_name: string
  /**
   * 机器模型部署：多为模型管理中的「模型汇总」id（列表行 id），与 ml_model_config.ml_model_id（版本记录 id）不同
   */
  model_id: number
  model_source: ModelSource
  /** 部分详情接口将 Python 文件 id 平铺在根级，与 ml_model_config.ml_handle_upload_id 等价 */
  resource_cpu_config?: null | ResourceCpuConfig
  project_id: number
  desired_replicas: number
  created_at: string
  image_id: number
  run_command: string
  backend_parameters: string[]
  env_vars: { [key: string]: any }
  inference_engine_type: InferenceEngineType
  [property: string]: any
  status: string
  graphics_card_resource: GraphicsCardResource
  /** 详情接口返回的部署版本号（根级）；训练生成模型与机器模型部署均以此为准 */
  trained_model_version?: string
  ml_handle?: MlHandel
}

export interface MlHandel {
  handel_source_ref: string // notebook来源时返回 选择的路径
  notebook_id: number // notebook Id
  ml_handle_upload_id: string | null // 机器模型部署时返回 上传文件的id
  ml_handel_jfs_path?: string | null
  /** 与请求体 ml_model_config.ml_handle_source_type 对应；值为 notebook 表示 Notebook 获取 */
  ml_handel_source_type?: string | null // 来源 notebook 为空时：部署时本地上传文件
  ml_handle_download_url?: string // 机器模型部署时返回 下载文件的url 示例："/api/v1/storage/download/lab_dev/deepexilab-35/ml/model_8/model_handle/model.py"
}

export function resolveDeployDetailMlHandle(detail: DeplopServerDetailResponse): {
  handleSourceType: string | undefined
  isNotebook: boolean
  notebookId: number | undefined
  sourceRef: string
  uploadId: string
  downloadUrl: string
} {
  const mh = detail.ml_handle
  const legacyCfg = (detail as DeplopServerDetailResponse & { ml_model_config?: MlModelConfig }).ml_model_config
  const handleSourceType
    = mh?.ml_handel_source_type?.trim()
      || (mh as { ml_handle_source_type?: string | null })?.ml_handle_source_type?.trim()
      || legacyCfg?.ml_handle_source_type?.trim()
      || undefined
  const rawNid = mh?.notebook_id ?? legacyCfg?.notebook_id
  const notebookId
    = typeof rawNid === 'number'
      ? rawNid
      : rawNid != null && String(rawNid).trim() !== '' && Number.isFinite(Number(rawNid))
        ? Number(rawNid)
        : undefined
  const rawSourceRef
    = mh?.handel_source_ref
      ?? (mh as { handle_source_ref?: string })?.handle_source_ref
      ?? legacyCfg?.handle_source_ref
      ?? ''
  const sourceRef = String(rawSourceRef).trim()
  const rawUpload
    = mh?.ml_handle_upload_id
      ?? legacyCfg?.ml_handle_upload_id
      ?? (detail as { ml_handle_upload_id?: string | null }).ml_handle_upload_id
  const uploadId
    = rawUpload != null && String(rawUpload).trim() !== '' ? String(rawUpload).trim() : ''
  const inferredNotebook
    = !handleSourceType
      && notebookId != null
      && sourceRef !== ''
      && uploadId === ''
  const isNotebookResolved = handleSourceType === 'notebook' || inferredNotebook
  const dl = mh?.ml_handle_download_url ?? (detail as { ml_handle_download_url?: string }).ml_handle_download_url
  const downloadUrl = dl != null ? String(dl).trim() : ''
  return {
    handleSourceType,
    isNotebook: isNotebookResolved,
    notebookId,
    sourceRef,
    uploadId,
    downloadUrl,
  }
}

// ================================ 删除推理任务 ================================
/**
 * 删除推理任务请求参数
 */
export interface DelopServerDeleteParams {
  /**
   * 项目ID
   */
  project_id: number
  /**
   * 推理任务名称
   */
  inference_task_id: number
}

// ================================ 启动或停止服务 ================================
/**
 * 启动或停止接口参数
 */
export interface StartOrStopParams {
  /**
   * 项目ID
   */
  project_id: number
  /**
   * 推理任务名称
   */
  inference_task_id: number
  /**
   * 具体行动
   */
  update_type: 'start' | 'stop'
}

// ================================ 修改实例数 ================================
/**
 * 修改实例数请求参数
 */
export interface DelopServerUpdateDesiredReplicasParams {
  /**
   * 项目ID
   */
  project_id: number
  /**
   * 推理任务名称
   */
  inference_task_id: number
  /**
   * 实例数
   */
  desired_replicas: number
}

export interface DebugResponse {
  notebook_id: number // 在线调试 notebook id
  auto_started: boolean
  message: string
}
