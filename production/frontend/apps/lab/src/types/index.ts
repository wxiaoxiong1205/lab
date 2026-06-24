export interface MenuItem {
  id: number
  code: string
  name: string
  type: 0 | 1 | 2
  sort: number
  parentId: number
  idPath: string
  children: MenuItem[]
  description?: string
  elementResourceId?: number
  elementStatus?: number
  highLightIconUrl?: string | null
  iconUrl?: string
  pathUrl?: string
  remark?: string | null
  secretLevel?: number
}

export interface Project {
  id: number
  name: string
  description?: string
  kubernetes_id?: number
  kubernetes_name?: string
  admin_user_ids?: number[]
  is_project_admin?: boolean
  is_platform_admin?: boolean
  is_tenant_admin?: boolean
  created_at: string
  updated_at: string
}

export interface Dataset {
  id: number
  project_id: number
  question: string
  meta_info: Record<string, any>
  ground_truth?: string
  output?: string
  context?: string
  model?: string
  created_at: string
  updated_at: string
}

export interface CreateProjectRequest {
  name: string
  description?: string
  kubernetes_id?: number
  admin_user_ids?: number[]
}

export interface CreateDatasetRequest {
  question: string
  meta_info?: string | Record<string, any>
  ground_truth?: string
  output?: string
  context?: string
}

export interface DatasetSearchParams {
  project_id?: number
  question?: string
  tag_ids?: number[]
  tag_match_type?: 'any' | 'all'
  sort_by?: 'created_at' | 'updated_at' | 'question'
  sort_order?: 'asc' | 'desc'
  created_after?: string
  created_before?: string
  skip?: number
  limit?: number
}

export interface LLMConfig {
  id: number
  name: string
  description?: string
  project_id: number

  // LLM基本配置
  model: string
  temperature?: number
  max_tokens?: number | null
  timeout?: number | null
  max_retries?: number

  // 模型生成参数
  frequency_penalty?: number
  presence_penalty?: number
  top_p?: number

  // 可选配置
  api_key?: string
  base_url?: string
  organization?: string

  // 其他配置参数
  additional_params?: Record<string, any>

  // 是否为当前项目的默认配置
  is_default: boolean

  created_at: string
  updated_at: string
}

export interface CreateLLMConfigRequest {
  name: string
  description?: string
  project_id: number

  // LLM基本配置
  model: string
  temperature?: number
  max_tokens?: number | null
  timeout?: number | null
  max_retries?: number

  // 模型生成参数
  frequency_penalty?: number
  presence_penalty?: number
  top_p?: number

  // 可选配置
  api_key?: string
  base_url?: string
  organization?: string

  // 其他配置参数
  additional_params?: Record<string, any>

  // 是否为当前项目的默认配置
  is_default?: boolean
}

export interface UpdateLLMConfigRequest {
  name?: string
  description?: string

  // LLM基本配置
  model?: string
  temperature?: number
  max_tokens?: number | null
  timeout?: number | null
  max_retries?: number

  // 模型生成参数
  frequency_penalty?: number
  presence_penalty?: number
  top_p?: number

  // 可选配置
  api_key?: string
  base_url?: string
  organization?: string

  // 其他配置参数
  additional_params?: Record<string, any>

  // 是否为当前项目的默认配置
  is_default?: boolean
}

export interface LLMConfigSearchParams {
  project_id?: number
  name?: string
  model?: string
  is_default?: boolean
  sort_by?: 'created_at' | 'updated_at' | 'name'
  sort_order?: 'asc' | 'desc'
  skip?: number
  limit?: number
}

// User and Authentication types
export interface User {
  userId: number
  username: string
  accountId: number
  tenantId: string
  enterpriseCode: string
}

export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterRequest {
  username: string
  email: string
  password: string
  is_active?: boolean
  is_admin?: boolean
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface UserUpdate {
  username?: string
  email?: string
  password?: string
  is_active?: boolean
  is_admin?: boolean
}
// 定义请求信息接口
export interface FailedRequest {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  data?: any
  params?: any
  headers?: Record<string, string>
  originalError?: any // 保存原始错误信息
  timestamp?: number // 请求失败的时间戳
}
export interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  userMenus: MenuItem[] // 用户的菜单权限列表
  menuCodeSet: Set<string> // 菜单 code 缓存 Set，用于快速查找（不持久化）
  isLoggingOut: boolean // 是否正在退出登录
  menuLoadError: string | null // 菜单加载错误信息
  failedRequest: FailedRequest | null // 失败的请求信息
  requestUrl: string // 失败的请求URL
  menuLoadAttempted: boolean // 是否已尝试加载菜单（避免空数组时无限循环）

  // Functions
  setAuth: (user: User, token: string, menus?: MenuItem[]) => void
  setMenus: (menus: MenuItem[]) => void
  setMenuLoadError: (error: string | null) => void
  setFailedRequest: (request: FailedRequest | null) => void
  retryFailedRequest: () => any
  logout: () => void
  getToken: () => string | null
  isAdmin: () => boolean // 判断用户是否是管理员（通过菜单权限）
  hasAuth: (code: string) => boolean // 判断是否有指定 code 的菜单权限
  setMenuLoadAttempted: (attempted: boolean) => void
}

// Project Member types
export type ProjectMemberRole = 'owner' | 'admin' | 'member'

export interface ProjectMember {
  id: number
  userId?: number
  username: string
  email: string
  is_active: boolean
  is_admin: boolean
  created_at: string
  updated_at: string
}

export interface AddProjectMemberRequest {
  user_id: number
  role: ProjectMemberRole
}

export interface BatchAddProjectMemberRequest {
  user_ids: number[]
}

export interface UpdateProjectMemberRequest {
  role: ProjectMemberRole
}

export interface ProjectMemberListResponse {
  items: ProjectMember[]
  total: number
  rows?: any[]
  page: number
  size: number
  pages: number
}

// Test Run types
export interface TestCase {
  id: number
  test_run_id: number
  name: string
  input: string
  actual_output: string
  actualOutput: string
  expected_output?: string
  expectedOutput?: string
  ground_truth?: string
  success: boolean
  metrics_data: Record<string, any>[]
  metricsData: Record<string, any>[]
  run_duration: number
  order: number
  is_conversational: boolean
}

export interface TestRun {
  name: string
  id: number
  run_id: string
  project_id: number
  model: string | null
  dataset: string | null
  total_test_cases: number
  successful_test_cases: number
  run_duration: number
  metrics_scores: Record<string, any>[]
  avg_metric_scores: Record<string, any>[]
  dataset_tags: string[]
  created_at: string
  status?: string
  test_cases?: TestCase[]
  evaluate_model?: Record<string, any>
}

export interface TestRunSearchParams {
  project_id: number
  model?: string
  tag?: string
  skip?: number
  limit?: number
}

export interface TestRunResponse {
  items: TestRun[]
  total: number
  page: number
  page_size: number
}

// 添加PromptDirectory类型
export interface PromptDirectory {
  id: number
  name: string
  description: string | null
  project_id: number
  prompt_count: number
  created_at: string
  updated_at: string
}

// 用户分页返回类型，适配 fastapi-pagination
export interface PageUser {
  items: User[]
  total: number
  rows?: any[]
  page: number
  size: number
}

// PromptDirectory 分页返回类型，适配 fastapi-pagination
export interface Page_PromptDirectoryResponse_ {
  items: PromptDirectory[]
  total: number
  page: number
  size: number
}

// Prompt 分页返回类型，适配 fastapi-pagination
export interface Page_PromptResponse_ {
  items: PromptResponse[]
  total: number
  page: number
  size: number
}

// Prompt 单条返回类型
export interface PromptResponse {
  id: number
  title: string
  content: string
  description?: string | null
  project_id: number
  directory_id?: number
  created_at: string
  updated_at: string
  input_variables: any[]
  // 其他后端返回字段可补充
  [key: string]: unknown
}

// 后端返回的Kubernetes集群数据格式
export interface GraphicsCardResourceType {
  type: string
  model: string
  memory: string
}

export interface GraphicsCardCategory {
  category: string
  resource_types: GraphicsCardResourceType[]
}

export interface KubernetesClusterExt {
  graphics_card_resource_type?: GraphicsCardCategory[]
}

export interface KubernetesClusterBackend {
  id: number
  name: string
  api_server: string
  status: string
  description?: string | null
  version?: string
  node_number?: number
  created_at: string
  updated_at: string
  created_id?: number
  created_by?: string
  // 存储配置ID
  storage_id?: number
  // 镜像仓库配置ID
  repository_id?: number
  // 挂载状态
  is_mount?: boolean
  // 扩展字段
  ext?: KubernetesClusterExt
}

// 前端使用的Kubernetes集群数据格式（保持兼容性）
export interface KubernetesCluster {
  id: string
  name: string
  server: string // 映射自api_server
  status: string
  description?: string // 映射自desc
  version?: string
  nodeCount?: number // 映射自node_number
  createdAt: string // 映射自created_at
  updatedAt: string // 映射自updated_at
  created_by?: string

  // 后端原始字段（保留用于API调用）
  api_server?: string
  node_number?: number
  created_at?: string
  updated_at?: string
  created_id?: number

  // 可选的扩展字段（用于其他功能）
  context?: string
  currentContext?: string
  // 敏感信息（脱敏显示）
  certificateAuthority?: string
  clientCertificate?: string
  clientKey?: string
  token?: string
  // 元数据
  labels?: Record<string, string>
  tags?: string[]
  // 关联的存储服务名称（一对一关系）
  storage_service_name?: string
  // 存储类型
  storage_type?: 'tos' | 'minio' | 'nfs'
  // 集群配置
  configmap?: string
  // 存储配置ID
  storage_id?: number
  // 镜像仓库配置ID
  repository_id?: number
  // 挂载状态
  is_mount?: boolean
  // 扩展字段
  ext?: KubernetesClusterExt
}

export interface KubeconfigImportRequest {
  name?: string
  config: string
  description?: string
}

export interface KubeconfigValidationResult {
  valid: boolean
  clusters: Array<{
    name: string
    server: string
    context: string
  }>
  errors?: string[]
  warnings?: string[]
}

export interface ClusterHealthStatus {
  clusterId: string
  status: 'healthy' | 'unhealthy' | 'unknown'
  lastCheck: string
  nodes: {
    total: number
    ready: number
    notReady: number
  }
  pods: {
    total: number
    running: number
    pending: number
    failed: number
  }
  version: string
  resources: {
    cpu: {
      total: string
      used: string
      percentage: number
    }
    memory: {
      total: string
      used: string
      percentage: number
    }
  }
}

// K8s资源需求相关类型定义
export interface KubernetesResourceRequirements {
  // GPU 资源需求 - 支持节点选择的GPU配置
  gpu: {
    node_name: string // 指定节点名称
    count: number // GPU数量
    type: string // GPU类型，如: "nvidia-a100", "nvidia-h100"
    model?: string // GPU模型
    specific_gpus?: string[] // 可选：指定具体的GPU UUID
  }
  // CPU 资源需求
  cpu?: {
    request?: string // CPU请求量
    limit?: string // CPU限制量
  }
  // 内存资源需求
  memory?: {
    request?: string // 内存请求量
    limit?: string // 内存限制量
  }
  // 存储资源需求
  storage?: {
    size?: string // 存储大小
    type?: string // 存储类型
    mountPath?: string // 挂载路径
  }
  // 模型发布配置
  model_publish: {
    auto_publish: boolean // 是否自动发布
    publish_mode: 'new_model' | 'existing_model_version' // 发布方式
    model_name?: string // 模型名称（新模型时必填）
    existing_model_id?: string // 已有模型ID（选择已有模型时必填）
    model_type: string // 模型类型，如: "text_generation"
    context_length: number // 上下文长度，如: 8192
    version_description?: string // 版本描述
  }
}

// 微调任务类型定义
export interface FinetuneTask {
  id: string
  name: string
  description?: string
  base_model: string

  // 多数据集配置
  datasets?: DatasetConfig[]
  validation_config?: ValidationConfig

  // 兼容性字段
  dataset_id?: string
  dataset_name?: string

  // K8s资源需求
  resource_requirements: KubernetesResourceRequirements
  // 任务状态
  status: TaskStatus
  progress: number
  created_at: string
  started_at?: string
  completed_at?: string
  error_message?: string
  hyperparameters: Record<string, unknown>
  output_model_id?: string
  output_model_name?: string
  metrics?: {
    [key: string]: number[]
  }
  steps_completed?: number
  total_steps?: number
  estimated_remaining_time?: number
  progress_info?: {
    steps?: Array<{
      name: string
      description?: string
      completed: boolean
      current: boolean
    }>
  }
  // K8s部署信息
  kubernetes_info?: {
    namespace: string
    pod_name?: string
    job_name?: string
    node_name?: string
    cluster_name?: string
  }
}

// 任务状态类型
export type TaskStatus = 'pending' | 'preparing' | 'running' | 'completed' | 'failed' | 'cancelled' | 'stopping'

// 创建微调任务请求
export interface CreateFinetuneTaskRequest {
  name: string
  description?: string
  base_model: string
  datasets?: DatasetConfig[] // 多数据集配置
  validation_config?: ValidationConfig // 验证集配置
  resource_requirements: KubernetesResourceRequirements
  hyperparameters: Record<string, unknown>
  output_model_name?: string
}

// 数据集配置（用于多数据集训练）
export interface DatasetConfig {
  id: string
  name: string
  ratio: number // 数据集在训练中的比例（百分比）
  record_count: number // 记录数量
  format: string // 数据格式
  dataset?: string
}
export interface trainDatasetConfig {
  id?: string
  name: string
  version: string
  dataset_path: string
  character_count: number
  sample_count: number
  sampling_rate?: number
  weight_in_total: number
  dataset_type?: string
  dataset_format?: string
}

// 验证集配置
export interface ValidationConfig {
  type: 'split' | 'platform' // 验证集类型：从训练集分割 | 使用平台验证集
  split_ratio?: number // 分割比例（当type为split时）
  platform_datasets?: DatasetConfig[] // 平台验证集（当type为platform时）
}

// 微调数据集（兼容现有组件）
export interface FinetuneDataset {
  id: string
  name: string
  description?: string
  format: string
  record_count: number
  size?: string
  status: string
  created_at?: string
  updated_at?: string
  // 其他字段...
}

// 微调任务查询参数
export interface FinetuneTaskSearchParams {
  search?: string
  status?: string
  base_model?: string
  dataset_id?: string
  dataset_ids?: string[] // 支持多数据集查询
  skip?: number
  limit?: number
}

// 模型发布相关类型
export interface PublishedModel {
  id: string
  name: string
  description?: string
  model_type: string
  context_length: number
  created_at: string
  updated_at: string
  version_count: number
  latest_version: string
}

export interface ModelSearchParams {
  search?: string
  model_type?: string
  skip?: number
  limit?: number
}

// Notebook在线创建系统相关类型定义
export interface NotebookInstance {
  id: number
  instance_name: string
  describe?: string
  biz_type?: string
  is_public?: boolean
  model_service_name?: string
  model_service_id?: number
  // 基础配置
  image: string
  create_by?: string

  // 资源配置 - 扁平结构
  resource_cpu_request: string
  resource_cpu_limit: string
  resource_memory_request: string
  resource_memory_limit: string
  gpu_type?: string | null
  gpu_count: number
  max_runtime_minutes?: number
  ext?: {
    model?: string
    memory?: string
    category?: string
  }

  // 状态信息
  status: string | 'creating' | 'running' | 'stopped' | 'failed' | 'deleting' | 'not_running'
  can_operate?: boolean

  // 访问信息
  access_url?: string | null

  // 时间戳
  created_at: string
  updated_at: string
  created_by?: string

  // 兼容旧格式的可选字段
  name?: string
  description?: string
  project_id?: string
  image_display?: string
  resources?: {
    cpu: {
      request: string
      limit: string
    }
    memory: {
      request: string
      limit: string
    }
    gpu?: {
      enabled: boolean
      type: string
      count: number
    }
  }
  storage?: {
    size: string
    storage_class: string
    mount_path: string
    persistent: boolean
  }
  network?: {
    port: number
    custom_ports: number[]
    protocol: 'http' | 'https'
  }
  error_message?: string
  access_token?: string

  // K8s信息
  kubernetes_info?: {
    namespace: string
    pod_name?: string
    node_name?: string
    cluster_name?: string
  }

  // 数据集信息
  dataset_names?: {
    training?: string[]
    validation?: string[]
    test?: string[]
    machine_learning_dataset?: string[]
  }

  // 模型信息
  model_names?: {
    base_models?: string[]
    finetuned_models?: string[]
    machine_learning_models?: string[]
  } | null

  // 生命周期
  auto_stop_minutes?: number
  last_activity?: string
  started_at?: string
  stopped_at?: string
  running_hours?: number
  running_minutes?: number
  running_seconds?: number
  ssh_username?: string
  ssh_password?: string
  ssh_key?: string
  is_ssh?: boolean
  ssh_url?: string
  ports?: PortItems[]
}

export interface NotebookTemplate {
  id: string
  name: string
  description: string
  image: string
  category: 'python' | 'r' | 'julia' | 'custom'
  tags: string[]
  image_address: string

  // 预设资源配置
  default_resources: {
    cpu: string
    memory: string
    gpu_supported: boolean
  }

  // 预装软件包
  packages: string[]

  // 是否推荐
  recommended: boolean

  // 版本信息
  version: string

  created_at: string
  updated_at: string
}

export interface CreateNotebookRequest {
  instance_name?: string
  describe?: string
  image?: string
  biz_type?: string | null // 区别模型训练和机器学习
  is_public?: boolean
  model_service_id?: number | null // 在线AI推理服务id 可传可不传，编辑清空时传 null
  // 资源配置（扁平化）
  resource_cpu_request?: number | string
  resource_cpu_limit?: number | string
  resource_memory_request?: number | string
  resource_memory_limit?: number | string
  gpu_type?: string
  gpu_count?: number
  status?: number
  access_url?: string

  // 兼容旧格式的字段
  name?: string
  description?: string
  template_id?: string
  resources?: {
    cpu_request?: string
    cpu_limit?: string
    memory_request?: string
    memory_limit?: string
    gpu_enabled?: boolean
    gpu_type?: string
    gpu_count?: number
  }
  storage?: {
    size?: string
    storage_class?: string
    mount_path?: string
    persistent?: boolean
  }
  network?: {
    port?: number
    custom_ports?: number[]
    protocol?: 'http' | 'https'
  }
  auto_stop_minutes?: number
  max_run_hours?: number | null
  max_run_minutes?: number | null
  max_runtime_minutes?: number | null
  ext?: {
    model?: string
    memory?: string
    category?: string
    models?: {
      base_models: number[]
      finetuned_models: number[]
      machine_learning_models?: number[]
    }
    dataset?: {
      training: number[]
      validation: number[]
      test: number[]
      machine_learning_dataset?: MachineLearnListModel[]
    }
  }
  is_ssh?: boolean
  ssh_username?: string
  ssh_password?: string
  source_example_id?: number
  ports?: PortItems[]
}

export interface PortItems {
  id?: string
  protocol: string // 示例 TCP UDP
  container_port: number // 端口号 端口号范围是 0-65535
  description: string | null // 描述 可选
  access_url?: string
}

export interface MachineLearnListModel {
  dataset_id: number
  format: string
}

export interface UpdateNotebookRequest extends CreateNotebookRequest {}

export interface NotebookSearchParams {
  biz_type?: string // machine_learning 机器学习在线 Notebook
  is_ml_debug?: boolean
  instance_name?: string
  status?: string[]
  is_public?: string[]
  created_id?: string[]
  template_id?: string
  sort_by?: 'created_at' | 'updated_at' | 'name' | 'last_activity'
  sort_order?: 'asc' | 'desc'
  page?: number
  size?: number

  // 兼容 mock 服务的字段
  search?: string
  skip?: number
  limit?: number
  view_mode?: string
}

export interface NotebookOperation {
  id: number
  notebook_id: number
  operation: 'start' | 'stop' | 'restart' | 'delete'
  status: 'pending' | 'running' | 'completed' | 'failed' | '创建' | '准备中' | '运行中' | '停止' | '失败'
  message?: string
  created_at: string
  completed_at?: string
}

// 存储快照相关类型
export interface NotebookSnapshot {
  id: string
  notebook_id: string
  name: string
  description?: string
  size: string
  status: 'creating' | 'ready' | 'failed'
  created_at: string
}

export interface CreateSnapshotRequest {
  name: string
  description?: string
}

// GPU节点和资源类型
export interface GPUNode {
  node_name: string
  gpu_type: string
  total_gpus: number
  available_gpus: number
  gpu_memory: string
  node_labels: Record<string, string>
}

export interface StorageClass {
  name: string
  type: 'ssd' | 'hdd'
  description: string
  default: boolean
  provisioner: string
}

// 监控和日志相关类型
export interface NotebookMetrics {
  notebook_id: string
  cpu_usage: number
  memory_usage: number
  gpu_usage?: number
  storage_usage: number
  network_in: number
  network_out: number
  timestamp: string
}

export interface NotebookLog {
  id: string
  notebook_id: string
  level: 'info' | 'warning' | 'error'
  message: string
  timestamp: string
  source: 'system' | 'jupyter' | 'container'
}

// Notebook精选案例相关类型定义
export interface NotebookCaseCategory {
  id: string
  name: string
  description: string
  icon: string
  color: string
  sort_order: number
}

export interface NotebookCase {
  id: string
  name: string
  description: string
  category_id: string
  category_name: string

  // 案例元数据
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  duration: number // 预计学习时间（分钟）

  // 技术栈和标签
  tech_stack: string[]
  tags: string[]

  // 资源需求
  resource_requirements: {
    cpu: string
    memory: string
    gpu_required: boolean
    gpu_type?: string
    storage: string
  }

  // 案例内容
  thumbnail: string // 预览图URL
  notebook_file: string // notebook文件路径
  dataset_files: string[] // 数据集文件路径
  readme_file?: string // README文件路径

  // 统计信息
  view_count: number
  clone_count: number
  rating: number

  // 依赖和环境
  dependencies: string[]
  environment: {
    python_version: string
    packages: string[]
    conda_environment?: string
  }

  // 版本信息
  version: string
  created_at: string
  updated_at: string
  created_by: string

  // 学习路径
  learning_objectives: string[]
  prerequisites: string[]
  next_steps: string[]
}

// Jupyter Notebook文件结构
export interface JupyterNotebook {
  cells: JupyterCell[]
  metadata: {
    kernelspec: {
      display_name: string
      language: string
      name: string
    }
    language_info: {
      name: string
      version: string
    }
  }
  nbformat: number
  nbformat_minor: number
}

export interface JupyterCell {
  cell_type: 'code' | 'markdown' | 'raw'
  metadata: Record<string, unknown>
  source: string[]
  outputs?: JupyterCellOutput[]
  execution_count?: number
}

export interface JupyterCellOutput {
  output_type: 'execute_result' | 'display_data' | 'stream' | 'error'
  data?: Record<string, unknown>
  text?: string[]
  name?: string
  ename?: string
  evalue?: string
  traceback?: string[]
  execution_count?: number
}

// 案例搜索参数
export interface CaseSearchParams {
  search?: string
  category_id?: string
  difficulty?: 'beginner' | 'intermediate' | 'advanced'
  tech_stack?: string[]
  tags?: string[]
  sort_by?: 'created_at' | 'updated_at' | 'name' | 'rating' | 'popularity'
  sort_order?: 'asc' | 'desc'
  skip?: number
  limit?: number
}

// 案例复制请求
export interface CaseCloneRequest {
  case_id: string
  notebook_name: string
  description?: string

  // 资源配置（可选覆盖）
  resource_config?: {
    cpu_request?: string
    cpu_limit?: string
    memory_request?: string
    memory_limit?: string
    gpu_enabled?: boolean
    gpu_type?: string
    gpu_count?: number
    storage_size?: string
  }

  // 环境配置
  environment_config?: {
    image?: string
    additional_packages?: string[]
    environment_variables?: Record<string, string>
  }

  // 生命周期配置
  auto_start?: boolean
  auto_stop_minutes?: number
}

// 案例复制响应
export interface CaseCloneResponse {
  success: boolean
  notebook_instance: NotebookInstance
  message: string
  warnings?: string[]
}

// 案例详情视图
export interface NotebookCaseDetail extends NotebookCase {
  notebook_content: JupyterNotebook
  readme_content?: string
  sample_data?: unknown
  related_cases: NotebookCase[]
}

// 案例编辑请求
export interface NotebookCaseEditRequest {
  name: string
  describe: string
}

// 判断是否用户是否有权限 对该案例进行编辑
export interface PermissionResponse {
  has_permission: boolean
}

// 存储集群映射相关类型定义
export interface StorageClusterMapping {
  id: string
  storage_config_id: string
  cluster_id: string
  cluster_name?: string
  mount_path?: string
  filesystem_name?: string
  mount_options?: Record<string, string | number | boolean>
  is_active?: boolean
  created_at: string
  updated_at: string
}

export interface StorageClusterMappingCreate {
  cluster_id: string
}

export interface StorageClusterMappingUpdate {
  cluster_id?: string
}

// 存储配置基础类型定义（现在支持任意字符串类型）
export type StorageType = string

export interface StorageConfig {
  id: number
  name: string
  description?: string | null
  type: string
  config: Record<string, any>
  status?: string // 后端返回的状态字段
  cluster_number?: number // 后端返回的集群数量字段
  last_test_at?: string
  test_status?: 'success' | 'failed' | 'untested'
  test_message?: string
  created_at: string
  updated_at: string
  created_id?: number
  created_by?: string
  is_init?: boolean
}

export interface StorageConfigCreateUpdate {
  name: string
  description?: string
  type: string
  config: Record<string, any>
}

export interface StorageConfigQueryParams {
  page?: number
  page_size?: number
  search?: string
  type?: string
  available?: boolean
}

// 存储配置详情页面的类型定义
export interface StorageConfigDetail {
  id: string
  name: string
  desc?: string
  type: string
  config: Record<string, any>
  last_test_at?: string
  test_status?: 'success' | 'failed' | 'untested'
  test_message?: string
  created_at: string
  updated_at: string
  // 关联的集群映射
  cluster_mappings?: StorageClusterMapping[]
}

// 集群详情页面的存储配置类型定义
export interface ClusterStorageConfig {
  storage_config_id: string
  storage_config_name: string
  storage_type: string
  mount_path?: string
  filesystem_name?: string
  is_active: boolean
  test_status?: 'success' | 'failed' | 'untested'
}

// 训练数据集相关类型定义
export interface RoleMessage {
  from: 'system' | 'user' | 'assistant'
  value: string
}

export interface RoleConversation {
  conversations: RoleMessage[]
}

export interface TrainingDataset {
  id: number
  project_id: number
  name: string
  description?: string
  dataset_type: 'training' | 'evaluation'
  training_type: 'SFT-文本生成' | 'SFT-图片理解' | 'DPO-文本生成'
  format: 'sharegpt' | 'json' | 'excel'
  file_path?: string
  file_size?: number
  total_samples?: number
  conversation_count?: number
  data_content?: RoleConversation[] | unknown[]
  meta_info?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CreateTrainingDatasetRequest {
  name: string
  description?: string
  training_type: 'SFT-文本生成' | 'SFT-图片理解' | 'DPO-文本生成'
  format: 'sharegpt' | 'json' | 'excel'
  file_content?: unknown
  meta_info?: Record<string, unknown>
}

export interface TrainingDatasetSearchParams {
  project_id?: number
  name?: string
  dataset_type?: string
  format?: string
  is_published?: boolean
  sort_by?: 'created_at' | 'updated_at' | 'name'
  sort_order?: 'asc' | 'desc'
  created_after?: string
  created_before?: string
  page?: number
  size?: number
  usage?: string
  skip?: number
  limit?: number
}

// 镜像仓库管理相关类型定义
export type RegistryType = 'dockerhub' | 'harbor' | 'private' | 'aliyun' | 'tencent' | 'huawei' | 'volcengine' | 'private_harbor'
export type AuthType = 'none' | 'username_password' | 'token'

// Harbor仓库集群绑定关系
export interface RegistryClusterBinding {
  id: string
  registry_config_id: string
  cluster_id: string
  cluster_name: string
  cluster_status: 'online' | 'offline' | 'error'
  created_at: string
  updated_at: string
}

// 镜像仓库配置类型定义
export interface RegistryConfig {
  id: number
  name: string
  registry_type: RegistryType // 仓库类型：火山云、私有Harbor等
  repository_address: string
  auth_type: AuthType
  auth_config: {
    username?: string
    password?: string
    token?: string
  }
  manager_address?: string
  cluster_number: number // 绑定的集群数量
  status: string // 连接状态：如"连接正常"、"未测试"、"连接失败"等
  created_at: string
  updated_at: string
  created_id: number
  created_by: string
  namespace?: string
  type?: string
  config?: {
    access_key?: string // 访问密钥
    secret_key?: string // 密钥
    region?: string // 地区
    registry?: string // 实例名称
  }
}

export interface RegistryConfigCreateUpdate {
  name: string
  type: string // 仓库类型
  repository_address: string
  auth_type: AuthType
  auth_config: {
    username?: string
    password?: string
    token?: string

  }
  manager_address?: string // 管理地址，用于跳转到web端查看镜像
  namespace?: string // 命名空间
  config?: {
    access_key?: string // 访问密钥
    secret_key?: string // 密钥
    region?: string // 地区
    registry?: string // 实例名称
  }
}

export interface RegistryConfigQueryParams {
  page?: number
  page_size?: number
  search?: string
  registry_type?: RegistryType
  auth_type?: AuthType
  available?: boolean
}

// Harbor仓库集群绑定管理相关类型
export interface RegistryClusterBindingCreateRequest {
  cluster_ids: string[]
}

export interface RegistryClusterBindingUpdateRequest {
  cluster_ids: string[]
}

// 镜像仓库中的镜像定义
export interface RegistryImage {
  id: string
  name: string
  tag: string
  digest: string
  size: number
  created_at: string
  last_updated: string
  pull_count: number
  architecture: string
}

// 镜像仓库中的仓库定义
export interface RegistryRepository {
  id: string
  name: string
  description?: string
  is_public: boolean
  star_count: number
  pull_count: number
  tag_count: number
  created_at: string
  last_updated: string
}

// 可用集群查询参数
export interface AvailableClustersQueryParams {
  name: string // 仓库名称
  page?: number
  size?: number
}

// 可用集群信息
export interface AvailableCluster {
  id: number
  name: string
  api_server: string
  status: 'online' | 'offline' | 'error'
  version?: string
  node_number?: number
  description?: string
  created_at: string
  updated_at: string
  created_by?: string
}

// 已占用集群信息（用于获取仓库已绑定的集群列表）
export interface OccupiedCluster {
  cluster_id: number
  cluster_name: string
  api_server?: string
  status?: string
  bound_at?: string
  is_active?: boolean
}

export interface NotebookSquareSearchParams {
  page?: number
  size?: number
  name?: string
  example_id?: string
  biz_type?: string // 业务类型 llm(大模型训练)/machine_learning(机器学习)
}

export interface NotebookSquareListResponse {
  items: NotebookSquare[]
  page: number
  size: number
  total: number
}

export interface NotebookSquare {
  id: number
  created_at: string
  created_by: string
  created_id: number
  describe: string
  is_available: boolean
  name: string
  updated_at: string
}

export interface PublishCaseParams {
  project_id: string
  notebook_id: string
  name: string
  describe: string
}

export interface PublishCaseResponse {
  celery_task_id: string
  message: string
}

export interface GetFileStructureParams {
  projectId: number
  notebookId: number
  path?: string
}

export interface FileStructureResponse {
  project_id: number
  notebook_id: number
  path: string
  files: FileStructure[]
}

export interface FileStructure {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
}

export interface notebookSshResponse {
  ssh_username?: string
  ssh_password?: string
  ssh_key?: string
  is_ssh: boolean
  notebook_id: 0
  project_id: 0
}

export interface setSshConfig {
  is_ssh: boolean
  ssh_username?: string
  ssh_password?: string
}
