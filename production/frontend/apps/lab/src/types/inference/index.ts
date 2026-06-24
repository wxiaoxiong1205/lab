/**
 * 推理结果集接口定义
 */

// 推理结果集搜索参数
export interface InferenceResultSetSearchParams {
  name?: string
  inference_method?: InferenceMethod
  dataset_type?: string
  status?: InferenceProgressStatus
  source_dataset_id?: number
  page?: number
  size?: number
}

// 推理进度状态枚举
export enum InferenceProgressStatus {
  CREATED = '已创建', // 创建
  QUEUED = '排队中', // 排队中
  PREPARING = '准备中', // 准备中
  PROCESSING = '运行中', // 运行中
  COMPLETED = '已完成', // 已完成
  FAILED = '失败', // 失败
  TERMINATED = '终止', // 终止
  STOPPED = '停止', // 停止
  SETTIMEOUT = '定时待启动', // 定时待启动
}

// 推理结果集项接口
export interface InferenceResultSetItem {
  id: number
  name: string // 数据集名称
  dataset_format?: string // 数据格式
  dataset_type?: string
  description?: string // 描述
  inference_method: string // 推理方式：offline, online, import
  model_name?: string // 待推理模型名称
  source_dataset_name?: string // 待推理数据（源数据集名称）
  total_items: number // 数据量
  status: InferenceProgressStatus // 状态：created, processing, completed, failed
  progress: number // 进度（0-100）
  created_at: string // 创建时间
  created_by?: string // 创建者
}

// 推理结果集列表响应接口
export interface InferenceResultSetListResponse {
  items: InferenceResultSetItem[]
  total: number
  page: number
  size: number
  pages: number
}

// 定义API请求参数类型
export interface ListParams {
  page?: number
  size?: number
  projectId?: string
  name?: string
  status?: string
  model_type?: string
}

// 定义在线推理服务数据类型
export interface InferenceService {
  model_type: string
  id: string
  created_at: string
  updated_at: string
  created_by: string
  tenant_id: string
  name: string
  model_name: string
  description: string
  status: string
  attr_values?: Attribute[]
}

// 定义API响应类型
export interface ApiResponse {
  items: InferenceService[]
  total: number
  page: number
  size: number
  pages: number
}

// 推理方式枚举
export enum InferenceMethod {
  OFFLINE = 'offline', // 离线推理
  ONLINE = 'online', // 在线推理
  IMPORT = 'import', // 导入推理结果集
  API = 'api', // API服务
  THIRD_API = 'third_api', // 第三方API服务（业务效果评估/推理）
}

// 推理参数配置（用于前端表单，提交时需要转换为JSON字符串）
export interface InferenceParameters {
  temperature?: number // 温度，范围0.0-2.0
  top_p?: number // Top_p，范围0.0-1.0
  max_tokens?: number | null // 最大生成token数，None表示不限制
  presence_penalty?: number // 重复惩罚参数，范围>=0.0
}

// 显卡资源配置
export interface GPUResourceConfig {
  gpu_type?: string // 显卡类型：nvidia.com/gpu、huawei.com/npu
  gpu_model?: string // 显卡型号
  gpu_count?: number // 显卡数量，最高8张
}

// 创建推理结果集请求参数
export interface CreateInferenceResultSetRequest {
  name: string
  project_id: number
  usage?: string
  description?: string
  inference_method: InferenceMethod
  // 离线推理相关
  model_id?: number // 待推理模型ID
  model_name?: string // 待推理模型名称及版本
  source_dataset_id?: number // 待推理数据ID（训练数据集ID）
  source_dataset_name?: string // 待推理数据名称
  inference_params?: string // 推理模型参数（JSON字符串格式）
  graphics_card_resource?: string // GPU/NPU 资源配置（JSON字符串格式）
  // 在线推理相关
  online_service_id?: number // 待推理服务ID
  online_service_name?: string // 待推理服务名称及版本
  // 导入推理结果集相关
  upload_method?: string // 上传方式：local本地上传, url_url获取
  file_url?: string // 文件URL（URL获取方式使用）
  files?: File[] // 上传的文件列表（本地上传方式使用）
  chunk_upload_ids?: string[] // 分片上传ID（本地上传方式使用）
  dataset_format?: string // 数据格式
  dataset_type?: string // 数据用途
  model_source?: string // 模型来源
  time?: string // 定时执行时间，格式：YYYY-MM-DDTHH:mm:ss
}

// 创建推理结果集响应接口
export interface CreateInferenceResultSetResponse {
  id: number
  dataset_name: string
  created_at: string
}

// 服务详情接口响应类型
export interface InferenceServiceDetail {
  id?: string | number
  name: string
  description: string
  base_url: string
  model_name: string
  model_type: string[]
  attr_values: Attribute[]
  api_key?: string
  status?: string
  created_at?: string
  updated_at?: string
  created_by?: string
  tenant_id?: string
}

// 创建服务接口请求数据类型
export interface CreateServiceRequest {
  name: string
  description: string
  api_key: string
  base_url: string
  model_name: string
  model_type: string[]
  attr_values: Attribute[]
}

export interface Attribute {
  id?: number // 更新时传入
  business_type?: string
  attr_id: number // 属性ID
  attr_value?: string // 属性值键名 手动输入类型才传入
  data_type?: string
  required_tag?: number
  name: string
  input_type: string
  multi_select?: number // 下拉选择模式：0=单选，1=多选（仅下拉选择类型有）
  options?: optionsItem[] // 下拉选择类型 选定的选项值 才传入 手动输入该数组为空
  attr_options?: optionsItem[] // 下拉选择类型 所有选项值
}

export interface AttributeFormItem {
  id?: number
  attr_id: number
  name: string
  description?: string
  inputType: '下拉选择' | '手动输入'
  required: boolean
  selectMode?: 'single' | 'multiple'
  multi_select?: number // 下拉选择模式：0=单选，1=多选（从接口返回）
  options?: string[] // 已选定的选项值（用于回显）
  attr_options?: string[] // 所有可选的选项值（用于下拉选项）
  attr_value?: string | string[] // 属性值：单选时为字符串，多选时为字符串数组
}

export interface FormValues {
  serviceName: string
  description?: string
  baseUrl: string
  modelName: string
  modelType: string[]
  apiKey?: string
  attributes?: AttributeFormItem[]
}

export interface ApiAttributeItem {
  id?: number
  attr_id: number
  name: string
  description?: string
  input_type: '下拉选择' | '手动输入'
  required_tag: number
  multi_select?: number
  options?: string[] | optionsItem[] // 已选定的选项值
  attr_options?: optionsItem[] // 所有可选的选项值
}

export interface optionsItem {
  option_value: string // 下拉选择的选择项名称
}

// 创建服务接口响应数据类型
export interface CreateServiceResponse {
  code: number
  msg: string
  payload: boolean
}

// 删除服务接口请求数据类型
export interface DeleteServiceRequest {
  ids: number[]
}

// 删除服务接口响应数据类型
export interface DeleteServiceResponse {
  code: number
  msg: string
  payload: boolean
}

// 测试连接服务接口请求数据类型
export interface TestServiceRequest {
  id: number
}

// 测试连接服务接口响应数据类型
export interface TestServiceResponse {
  code: number
  msg: string
  payload: boolean
}

// 测试连接服务接口请求数据类型
export interface UpdateServiceRequest {
  id: number
  name?: string
  description?: string
  base_url?: string
  model_name?: string
  model_type?: string[]
  api_key?: string
  attr_values?: Attribute[]
}

export interface MenuResponse {
  id: number
  code: string
  name: string
  type: number
  sort: number
  parentId: number
  idPath: string
  children?: (string | MenuResponse)[]
  description?: string
  elementResourceId?: number
  elementStatus?: number
  highLightIconUrl?: string
  iconUrl?: string
  pathUrl?: string
  remark?: string
  secretLevel?: number
}

export interface ModelServiceMenuGroup {
  code: string
  name: string
  options: Array<{ code: string, name: string }>
}

/** 应用菜单过滤后的结果：一级菜单 + 数据管理下的选项 + 模型服务（含在线推理服务等二级菜单） */
export interface AppMenuFilteredResult {
  /** 一级菜单项（code 为 data_services 的节点的直接子节点，含 name） */
  firstLevelMenus: Array<{ code: string, name: string }>
  /** 数据管理下的子项（code 为 business_test / business_inference / training_management / test_management 的 name 列表） */
  dataManagementOptions: Array<{ code: string, name: string }>
  /** 模型服务一级菜单（key 为 model_service，其下二级菜单如在线推理服务），与数据管理结构一致 */
  modelServiceMenu?: ModelServiceMenuGroup | null
}

/** 业务属性下拉选项（/business-attr/list-by-group 接口） */
export interface BusinessAttrOptionItem {
  option_value: string // 下拉选择的选择项名称
  option_order: number // 下拉选择的选择项排序
}

/** 业务属性项（/business-attr/list-by-group 返回的 items 中单项） */
export interface BusinessAttrItem {
  id: number
  created_at: string
  updated_at: string
  created_id: number
  created_by: string
  tenant_id: string
  name: string // 属性名称
  description: string // 属性描述
  attr_order: number // 属性排序
  input_type: string // 如 "下拉选择" | "手动输入"
  data_type: string // 如 "string"
  required_tag: number // 是否必填 1=是 0=否
  multi_select: number // 是否多选 1=是 0=否
  business_type: string // 业务类型
  group: string | null // 属性分组
  options?: BusinessAttrOptionItem[] // 下拉选择的选择项列表 仅下拉选择类型有
}

/** 按分组后的业务属性（/business-attr/list-by-group 返回的单项） */
export interface BusinessAttrGroupItem {
  group: string | null // 为null时：说明该属性没有分组，其items下为所有没有分组属性的集合
  items: BusinessAttrItem[] // 属性列表
}

/** 按分组获取业务属性列表接口返回类型 */
export type GroupListResponse = BusinessAttrGroupItem[]
