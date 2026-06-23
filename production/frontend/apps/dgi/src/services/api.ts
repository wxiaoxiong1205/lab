import qs from 'qs'
import { GPU_STACK_API } from '@/components/gpustacks/api'
import request from '@/utils/request'

// 定义通用的响应类型
export interface ApiResponse<T = any> {
  code: number
  data: T
  message: string
}

// 定义分页参数类型
export interface PaginationParams {
  current?: number
  pageSize?: number
}

// 定义分页响应类型
export interface PaginatedData<T> {
  items: T[]
  total: number
  pageNumber: number
  pageSize: number
}

// 获取分组设置
export const apiGroupSettingsGet = () =>
  request<{
    key: string
    value: string
  }>({
    url: '/option',
    method: 'get',
  })

export interface UserInfo {
  id: number
  tenant_id: string
  username: string
  display_name: string
  role: number
  status: number
  phone: string
  email: string
  quota: string
  unlimited_quota: boolean
  used_quota: string
  request_count: number
  language: string
  balance: string
  balance_consumed: string
}

// 获取分组列表
export const apiGroupListGet = () =>
  request<string[]>({
    url: '/option/group',
    method: 'get',
  })

// 获取角色列表
export const apiRoleGet = () =>
  request<string[]>({
    url: '/roles/levels',
    method: 'get',
  })

// 更新分组设置
export const apiGroupSettingsUpdate = (data: { key: string, value: string }) =>
  request({
    url: '/option',
    method: 'put',
    data,
  })

// 获取用户信息
export const apiUserInfo = () =>
  request({
    url: '/users/get_user_info',
    method: 'get',
  })

// 登录
export const apiLogin = (data: { username: string, password: string }) =>
  request({
    url: '/login',
    method: 'post',
    data,
  })

// 渠道列表
export const apiChannelList = (data: {
  name?: string
  type?: number
  page_number?: number
  page_size?: number
  channel_id?: number
  base_url?: string
  status?: number
  data_level?: string
}) =>
  request<PaginatedData<any>>({
    url: '/channel',
    method: 'get',
    params: data,
  })

export interface ChannelForm {
  name: string
  type: number
  key: string
  base_url: string
  other: string
  model_mapping: string
  system_prompt: string
  models: string[]
  group: string[]
  lab_project_id?: number
  service_name?: string
  model_endpoint?: string // 临时字段，用于表单中的模型链接显示，提交时会被转换为 base_url
  lab_project_name?: string
  lab_inference_task_id?: number
  lab_inference_task_name?: string
}

// 新增渠道
export const apiChannelAdd = (data: ChannelForm) =>
  request({
    url: '/channel',
    method: 'post',
    data,
  })

// 更新渠道
export const apiChannelUpdate = (id: number, data: ChannelForm) =>
  request({
    url: `/channel/${id}`,
    method: 'put',
    data,
  })

// 删除渠道
export const apiChannelDelete = (id: number) =>
  request({
    url: `/channel/${id}`,
    method: 'delete',
  })

// 启用渠道
export const apiChannelEnable = (id: number) =>
  request({
    url: `/channel/enable/${id}`,
    method: 'post',
  })

// 禁用渠道
export const apiChannelDisable = (id: number) =>
  request({
    url: `/channel/disable/${id}`,
    method: 'post',
  })

// 单个渠道详情
export const apiChannelDetail = (id: number) =>
  request({
    url: `/channel/${id}`,
    method: 'get',
  })

// 可用提供商列表
export const apiProviderList = () =>
  request({
    url: `/channel/providers`,
    method: 'get',
  })

// 所有提供商模型列表
export const apiProviderModelMapList = () =>
  request({
    url: `/channel/models`,
    method: 'get',
  })

// 模型列表
export const apiChannelModelList = (data: {
  page_number?: number
  page_size?: number
  model_id?: number
  model_name?: string
  base_url?: string
  channel_name?: string
  connect_status?: number
  model_types?: string[]
  types?: string[]
  group_list_name?: string
  security_policy?: string
  status?: number
}) =>
  request({
    url: `/channel/model_list`,
    method: 'get',
    params: data,
    paramsSerializer: (params) => {
      return qs.stringify(params, { arrayFormat: 'repeat' })
    },
  })

// 模型列表
export const apiModelList = (params: {
  page_number?: number
  page_size?: number
  model_name?: string
  category?: string
  security_policy?: string | number
  security_policy_out?: string | number
  data_level?: string
  token_data_level?: string
  security_policy_has_l1_l2?: number
  view?: 'all' | 'usable' | 'can_apply' | 'viewable'
}) =>
  request({
    url: '/model',
    method: 'get',
    params,
  })

// 模型详情
export const apiModelDetail = (model_id: number) =>
  request({
    url: `/model/${model_id}`,
    method: 'get',
  })

// 更新模型
export const apiModelUpdate = (model_id: number, data: any) =>
  request({
    url: `/model/${model_id}`,
    method: 'put',
    data,
  })

// 删除模型
export const apiModelDelete = (model_id: number) =>
  request({
    url: `/model/${model_id}`,
    method: 'delete',
  })

/** 音色列表项（语音合成），合成接口请使用 voice_id 而非 id */
export interface ModelVoiceItem {
  id: number
  tenant_id: string
  model_id: number
  voice_id: string
  voice_name: string
  language: string
  gender: string
  description: string
  enabled: boolean
  created_time: number
  updated_time: number
  creator: string
  sample_url: string
  sample_text: string
  biz_languages: string
  scenes: string
  age_group: string
  logo_url?: string
}

/** 获取模型音色列表，查询参数使用 config 中对应的 key */
export const apiModelVoiceList = (
  modelId: number,
  params: {
    biz_language?: string
    scene?: string
    gender?: string
    age_group?: string
  },
) =>
  request<PaginatedData<ModelVoiceItem>>({
    url: `/model/${modelId}/voice`,
    method: 'get',
    params: Object.fromEntries(
      Object.entries(params).filter(([, v]) => v != null && v !== 'all'),
    ),
  })

/** 语音合成请求参数：voice_id_list 必须使用音色列表接口返回的 voice_id */
export interface SpeechSynthesisParams {
  /** 语音模型名称 */
  model: string
  mode: 'common'
  voice_id_list: string[]
  input_text: string
  extra_params?: {
    target_language?: string // 可选，取值来自 VOICE_TARGET_LANGUAGE 的 key；不传则默认自动识别
  }
}

/** 语音合成响应中的 data 字段（request 返回 IResponse<SpeechSynthesisData>） */
export interface SpeechSynthesisData {
  audio_url: string
  md5: string
}

/** 语音合成接口 POST /v1/experience/audio/speech，返回 data 含 audio_url、md5，超时 20 倍（10 分钟） */
export const apiSpeechSynthesis = (data: SpeechSynthesisParams) =>
  request<SpeechSynthesisData>({
    baseURL: '/v1',
    url: '/experience/audio/speech',
    method: 'post',
    data,
    timeout: 30000 * 20, // 默认 30s 的 20 倍
  })

// 保存安全服务地址
export const apiSaveSecurityServer = (data: { security_server: string }) =>
  request({
    url: '/security/set_security_server',
    method: 'post',
    data,
  })

// 保存安全服务地址
export const apiGetSecurityServer = () =>
  request({
    url: '/security/get_security_server',
    method: 'get',
  })

// 安全服务地址-连通性测试
export const apiSecurityServerConnectTest = (data: { server_url: string, api_key: string }) =>
  request({
    url: '/security/test_connectivity',
    method: 'post',
    data,
  })

// 测试安全服务
export const apiSecurityServerTest = (data: {
  server_url: string
  content: string
  api_key: string
}) =>
  request({
    url: '/security/test_service',
    method: 'post',
    data,
  })

// 获取敏感词类别列表
export const apiSensitiveCategoriesList = () =>
  request({
    url: `/security/words/categories`,
    method: 'get',
  })

// 获取敏感词列表
export const apiSensitiveWordList = (data: {
  page_number?: number
  page_size?: number
  original_word?: string
  creator?: string
  category_id?: number
}) =>
  request({
    url: '/security/words/query',
    method: 'post',
    data,
  })

// 新增敏感词
export const apiSensitiveWordAdd = (data: {
  original_word: string
  category: string // 默认传： '社会公共安全类'
  enhance: boolean
}) =>
  request({
    url: '/security/words/add/single',
    method: 'post',
    data,
  })

// 编辑敏感词
export const apiSensitiveWordUpdate = (data: {
  word_id: string
  original_word?: string
  category?: string // 默认传： '社会公共安全类'
  enhance?: boolean
}) =>
  request({
    url: '/security/words/edit',
    method: 'post',
    data,
  })

// 批量删除敏感词
export const apiSensitiveWordDelete = (data: { word_ids: string[] }) =>
  request({
    url: '/security/words/delete',
    method: 'delete',
    data,
  })

// 导入敏感词
export const apiSensitiveWordImport = (formData: FormData) =>
  request({
    url: '/security/words/import/excel',
    method: 'post',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
  })

// 上传文件（头像）
export const apiFileUpload = (formData: FormData) =>
  request({
    url: '/files',
    method: 'post',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
  })

// 获取系统头像（假设用 apiGroupSettingsGet，具体字段后端确认）
export const apiSystemAvatars = () => apiGroupSettingsGet()

// 连通性测试
export const apiModelTest = (channelId: number, modelName: string) =>
  request({
    url: `/channel/test/${channelId}?model_name=${modelName}`,
    method: 'get',
  })

// 连通性测试（同模型下所有渠道）
export const apiAllModelChanelTest = (modelName: string) =>
  request({
    url: `/channel/test_models/${modelName}`,
    method: 'get',
  })

// 获取密钥列表
export const apiSecretList = (data: {
  page_number?: number
  page_size?: number
  name?: string
  key?: string
  status?: number
  data_level?: string
}) =>
  request({
    url: `/token`,
    method: 'get',
    params: data,
  })

export interface AccessKeyForm {
  name: string
  expired_time: number | null
  unlimited_quota: boolean
  models?: string
  apis?: string
  remain_quota: number
  qpm: number
  tpm: number
  subnet: string
  data_level?: string
}

// 新增密钥
export const apiSecretAdd = (data: AccessKeyForm) =>
  request({
    url: `/token`,
    method: 'post',
    data,
  })

// 更新密钥
export const apiSecretUpdate = (id: number, data: AccessKeyForm) =>
  request({
    url: `/token/${id}`,
    method: 'put',
    data,
  })

// 删除密钥
export const apiSecretDelete = (id: number) =>
  request({
    url: `/token/${id}`,
    method: 'delete',
  })

// 密钥详情
export const apiSecretDetail = (id: number) =>
  request({
    url: `/token/${id}`,
    method: 'get',
  })

// 密钥启用
export const apiSecretEnable = (id: number) =>
  request({
    url: `/token/${id}/enable`,
    method: 'post',
  })

// 密钥禁用
export const apiSecretDisable = (id: number) =>
  request({
    url: `/token/${id}/disable`,
    method: 'post',
  })

// 调用日志列表
export const apiInvokeLogList = (data: {
  type?: 'model' | 'api'
  page_number?: number
  page_size?: number
  security_layer?: string
  audit_result?: string
  start_timestamp?: number
  end_timestamp?: number
  token_name?: string
  model_name?: string
  channel_id?: number
  username?: string
  question?: string
  answer?: string
  desc?: 'backward' | 'forward'
  limit?: number
  search_time?: string
  log_id?: string
  sensitive_category?: string
  risk_level?: string
  api_name?: string
  api_url?: string
}) =>
  request({
    url: `/log/${data.type ?? 'model'}`,
    method: 'get',
    params: data,
  })

// 调用日志详情
export const apiInvokeLogDetail = (data: {
  log_id: string
  start_timestamp: string
  end_timestamp: string
  hasLargeFields: boolean
}) =>
  request({
    url: `/log/details`,
    method: 'get',
    params: data,
  })

// 用户列表
export const apiUserList = (data: {
  page_number?: number
  page_size?: number
  username?: string
  display_name?: string
}) =>
  request({
    url: `/users`,
    method: 'get',
    params: data,
  })

// 创建用户
export const apiUserCreate = (data: {
  username: string
  display_name: string
  password: string
}) =>
  request({
    url: `/users`,
    method: 'post',
    data,
  })

// 更新用户
export const apiUserUpdate = (
  id: number,
  data: {
    display_name: string
    password: string
  },
) =>
  request({
    url: `/users/${id}`,
    method: 'put',
    data,
  })

// 删除用户
export const apiUserDelete = (id: number) =>
  request({
    url: `/users/${id}`,
    method: 'delete',
  })

// 用户详情
export const apiUserDetail = (id: number) =>
  request({
    url: `/users/${id}`,
    method: 'get',
  })

// 统计分析指标
export const apiAnalysis = (data: {
  start_time: number
  end_time: number
  aggregation: string
  user_name?: string
}) =>
  request({
    url: `/metrics/timeseries`,
    method: 'get',
    params: data,
  })

// 系统配置
export const apiSystemConfig = () =>
  request({
    url: `/config`,
    method: 'get',
  })

// 创建审批
export const apiApprovalCreate = (data: {
  type: number
  content: string
  apply_reason?: string
}) =>
  request({
    url: `/approvals`,
    method: 'post',
    data,
  })

// 查询角色管理列表
export const apiQueryRoleList = (data: {
  page_number?: number
  page_size?: number
  name?: string
}) =>
  request({
    url: `/roles`,
    method: 'get',
    params: data,
  })

// 编辑角色
export const apiEditRole = (
  data: {
    name?: string
    description?: string
  },
  id: number,
) =>
  request({
    url: `/roles/${id}`,
    method: 'put',
    data,
  })

// 根据角色id获取权限
export const apiQueryPermissionList = (id: number) =>
  request({
    url: `/permissions/role/${id}/tree`,
    method: 'get',
  })

// 获取当前登录用户的权限列表
export const apiQueryUserPermission = () =>
  request({
    url: `/permissions/user`,
    method: 'get',
  })

// 查询角色管理列表
export const apiQueryApprovalList = (data: {
  page_number?: number
  page_size?: number
  status?: string
  applicant_name?: string
  approver_name?: string
  created_start_time?: string
  created_end_time?: string
  approved_start_time?: string
  approved_end_time?: string
}) =>
  request({
    url: `/approvals`,
    method: 'get',
    params: data,
  })

export const apiQueryApprovalDetails = (approve_id: number) =>
  request({
    url: `/approvals/${approve_id}`,
    method: 'get',
  })

// 批准审批
export const apiApproves = (approval_id: number) =>
  request({
    url: `/approvals/${approval_id}/approve`,
    method: 'put',
  })

// 拒绝审批
export const apiApprovesReject = (
  approval_id: number,
  approver_reason: string,
) =>
  request({
    url: `/approvals/${approval_id}/reject`,
    method: 'put',
    data: { approver_reason },
  })

interface ModelChatParams {
  model: string
  messages: {
    role: string
    content: string
  }[]
  stream?: boolean
  temperature?: number
}

// 模型体验
export const apiModelChat = (data: ModelChatParams) =>
  request({
    baseURL: '/v1',
    url: `/experience/chat/completions`,
    method: 'post',
    data,
  })
// 告警规则相关接口

// 告警规则列表
export const apiMonitorRuleList = (data: {
  enabled?: boolean
  model_name?: string
  page_number?: string
  page_size?: string
  rule_name?: string
  sensitive_types?: string
  [property: string]: any
}) =>
  request({
    url: `/monitor_rule`,
    method: 'get',
    params: data,
  })

// 删除告警规则
export const apiMonitorRuleDelete = (id: number) =>
  request({
    url: `/monitor_rule/${id}`,
    method: 'delete',
  })

// 编辑告警规则
export const apiMonitorRuleUpdate = (
  id: number,
  data: {
    rule_name: string
    monitor_models: string
    sensitive_types: string
    alert_count: number
    alert_interval: number
    alert_methods: string
    receivers: string
    webhooks: string
  },
) =>
  request({
    url: `/monitor_rule/${id}`,
    method: 'put',
    data,
  })

// 新增告警规则
export const apiMonitorRuleAdd = (
  data: {
    rule_name: string
    monitor_models: string
    sensitive_types: string
    alert_count: number
    alert_interval: number
    alert_methods: string
    receivers: string
    webhooks: string
    type: string
  },
) =>
  request({
    url: `/monitor_rule`,
    method: 'post',
    data,
  })
// 获取用户列表
export const apiUsersList = (data: {
  page_number?: string
  page_size?: string
}) =>
  request({
    url: `/users/list`,
    method: 'get',
    params: data,
  })

// 获取告警规则详情
export const apiMonitorRuleDetail = (id: number) =>
  request({
    url: `/monitor_rule/${id}`,
    method: 'get',
  })

// 启用监控规则
export const apiMonitorRuleEnable = (id: number) =>
  request({
    url: `/monitor_rule/${id}/enable`,
    method: 'put',
  })

// 禁用监控规则
export const apiMonitorRuleDisable = (id: number) =>
  request({
    url: `/monitor_rule/${id}/disable`,
    method: 'put',
  })

// 获取告警记录列表
export const apiAlertRecordsList = (data: {
  ai_response?: string
  enabled?: boolean
  end_time?: number
  model_name?: string
  page_number?: string
  page_size?: string
  risk_level?: string
  rule_name?: string
  sensitive_types?: string
  start_time?: number
  status?: string
  token_name?: string
  user_question?: string
  username?: string
  [property: string]: any
}) =>
  request({
    url: `/monitor_rule/alert_records`,
    method: 'get',
    params: data,
  })

// 处理告警记录
export const apiAlertRecordProcess = (id: number) =>
  request({
    url: `/monitor_rule/alert_records/${id}/process`,
    method: 'put',
  })

// 获取敏感类别
export const apiSensitiveCategoriesGet = (id?: number) =>
  request({
    url: `/monitor_rule/sensitive_categories${id ? `?monitor_rules_id=${id}` : ''
    }`,
    method: 'get',
  })

// 获取敏感类别
export const apiWordsCategoriesGet = () =>
  request({
    url: `/security/words/categories`,
    method: 'get',
  })

export const apiQueryNodeDashboards = (data: { worker_name: string }) =>
  request({
    url: `${GPU_STACK_API}/node_dashboard`,
    method: 'get',
    params: data,
  })

// 获取密级管理开关
export const apiSecurityLevelSwitch = () =>
  request({
    url: `/option/security_level_switch`,
    method: 'get',
  })

// 更新密级
export const apiSecurityLevelSwitchUpdate = (data: { security_level_enabled: boolean }) =>
  request({
    url: `/option/security_level_switch`,
    method: 'post',
    data,
  })

// 校验模型是否存在
export const apiModelCheckAbilities = (model_names: string[]) =>
  request({
    url: `/model/check-abilities`,
    method: 'post',
    data: { model_names },
  })

export const IAM_CLIENT_CODE = '414dddb1453f4e27bb046bd158227f1b'

// 获取公钥
export const getPublicKey = () =>
  request({
    url: '/deepexi-client-iam-sso/sso/public-key',
    baseURL: '/iam',
    method: 'get',
    headers: {
      'X-CLIENT-CODE-HEADER': IAM_CLIENT_CODE,
    },
  })

// 登录
interface IamResponse<T> {
  code: string
  payload: T
}
interface IamLoginResponse {
  access_token: string
  refresh_token: string
}
export const iamLogin = (params: Record<string, any>) => {
  // 构建URL编码的参数字符串
  const urlParams = new URLSearchParams(params)

  return request<IamLoginResponse, IamResponse<IamLoginResponse>>({
    url: '/deepexi-client-iam-sso/oauth/token',
    baseURL: '/iam',
    method: 'post',
    data: urlParams.toString(),
    headers: {
      'X-CLIENT-CODE-HEADER': IAM_CLIENT_CODE,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })
}

// 刷新token
export const iamRefreshToken = (params: any, client_id: string) => {
  // 构建URL编码的参数字符串
  return request<IamLoginResponse, IamResponse<IamLoginResponse>>({
    url: '/deepexi-client-iam-sso/oauth/token',
    baseURL: '/iam',
    method: 'post',
    data: params,
    params: {
      client_id,
    },
    headers: {
      'X-CLIENT-CODE-HEADER': IAM_CLIENT_CODE,
    },
    // @ts-ignore
    isRefreshToken: true, // 标识为刷新token请求
  })
}

// /deepexi-client-iam-openapi/api/v1.0/menu/getAppMenuTreeByMenuGroup
export const apiGetAppMenuTreeByMenuGroup = () =>
  request({
    url: `/config/app_menu`,
    method: 'get',
  })

export const apiGetRegisterWorkerNames = () =>
  request({
    url: `${GPU_STACK_API}/workers/register_worker_names`,
    method: 'get',
  })

export const apiQueryWorkerResourceCounts = (data: { worker_name: string }) =>
  request({
    url: `${GPU_STACK_API}/node_dashboard/worker_resource_counts`,
    method: 'get',
    params: data,
  })

export const apiQueryLoadavgSummary = (data: { worker_name: string }) =>
  request({
    url: `${GPU_STACK_API}/node_dashboard/loadavg_summary`,
    method: 'get',
    params: data,
  })

export const apiQueryTcpSummary = (data: { worker_name: string }) =>
  request({
    url: `${GPU_STACK_API}/node_dashboard/tcp_summary`,
    method: 'get',
    params: data,
  })

export const apiQueryNetworkSummary = (data: { worker_name: string }) =>
  request({
    url: `${GPU_STACK_API}/node_dashboard/network_summary`,
    method: 'get',
    params: data,
  })

export const apiQueryCpuageSummary = (data: { worker_name: string }) =>
  request({
    url: `${GPU_STACK_API}/node_dashboard/cpuage_summary`,
    method: 'get',
    params: data,
  })

export const apiQueryMemorySummary = (data: { worker_name: string }) =>
  request({
    url: `${GPU_STACK_API}/node_dashboard/memory_summary`,
    method: 'get',
    params: data,
  })

export const apiQueryGpuSummary = (data: { worker_name: string }) =>
  request({
    url: `${GPU_STACK_API}/node_dashboard/gpu_summary`,
    method: 'get',
    params: data,
  })

export const apiQueryVramSummary = (data: { worker_name: string }) =>
  request({
    url: `${GPU_STACK_API}/node_dashboard/vram_summary`,
    method: 'get',
    params: data,
  })

export const apiQueryDisksSummary = (data: { worker_name: string }) =>
  request({
    url: `${GPU_STACK_API}/node_dashboard/disks_summary`,
    method: 'get',
    params: data,
  })

// 获取webhook列表
export const apiGetWebhookList = (data: { page: number, page_size: number, name?: string, type?: string }) =>
  request({
    url: `/webhook`,
    method: 'get',
    params: data,
  })

// 创建webhook
export const apiCreateWebhookList = (data: { name: string, url: string, type: string, encrypt_method: string, secret?: string, description?: string }) =>
  request({
    url: `/webhook`,
    method: 'post',
    data,
  })

// 获取webhook详情
export const apiGetWebhookDetail = (id: string) =>
  request({
    url: `/webhook/${id}`,
    method: 'get',
  })

// 删除webhook
export const apiDeleteWebhook = (id: string) =>
  request({
    url: `/webhook/${id}`,
    method: 'delete',
  })

// 更新webhook
export const apiUpdateWebhook = (id: string, data: {
  name: string
  url: string
  type: string
  encrypt_method: string
  secret?: string
  description?: string
}) =>
  request({
    url: `/webhook/${id}`,
    method: 'put',
    data: {
      ...data,
      description: data.description,
      ...(data.encrypt_method === 'none' ? { secret: undefined } : {}),
    },
  })

// webhook类型查询
export const apiGetWebhookTypeList = () =>
  request({
    url: `/webhook/types`,
    method: 'get',
  })

// webhook测试
export const apiTestWebhook = (id: string) =>
  request({
    url: `/webhook/${id}/test`,
    method: 'post',
  })

// webhook禁用
export const apiDisableWebhook = (id: string) =>
  request({
    url: `/webhook/${id}/disable`,
    method: 'put',
  })

// webhook启用
export const apiEnableWebhook = (id: string) =>
  request({
    url: `/webhook/${id}/enable`,
    method: 'put',
  })

// ===== 插件管理相关接口 =====

// 插件列表查询
export const apiPluginList = (data: {
  page?: number
  page_size?: number
  name?: string
  plugin_type?: string
}) =>
  request({
    url: `/plugins`,
    method: 'get',
    params: data,
  })

// 创建插件
export const apiPluginCreate = (data: FormData) =>
  request({
    url: `/plugins`,
    method: 'post',
    data,
    // axios 会自动设置正确的 Content-Type 和 boundary
  })

// 删除插件
export const apiPluginDelete = (id: number) =>
  request({
    url: `/plugins/${id}`,
    method: 'delete',
  })

// 更新插件（只允许修改描述）
export const apiPluginUpdate = (id: number, data: { description: string }) =>
  request({
    url: `/plugins/${id}`,
    method: 'put',
    data,
  })

// 下载插件开发文档
export const apiDownloadPluginDoc = () =>
  request({
    url: `/plugins/download_plugin_docx`,
    method: 'get',
    responseType: 'blob', // 重要：设置响应类型为 blob
  })

// 项目项接口
export interface ProjectItem {
  id: number
  name: string
  description: string
  created_at: string
  updated_at: string
  kubernetes_name: string
}

// 项目列表响应接口
export interface ProjectsListResponse {
  items: ProjectItem[]
  total: number
  page: number
  size: number
  pages: number
}

// 获取项目列表
export const projectsList = () =>
  request<ProjectsListResponse>({
    baseURL: '/',
    url: '/lab-backend/api/v1/projects/list',
    method: 'get',
    params: {
      page: 1,
      size: 20,
    },
  })

// 推理任务项接口
export interface InferenceTaskItem {
  id: number
  server_name: string
  model_name: string
  access_url?: string
  image_name?: string
  image_url?: string
  graphics_card_resource?: {
    card_memory: string
    card_model: string
    card_type: string
    count: number
    k8s_resource_type: string
  }
  resource_cpu_config?: {
    resource_cpu_request: number
    resource_cpu_limit: number
    resource_memory_request: number
    resource_memory_limit: number
  }
}

// 获取在线推理服务
export const inferenceTask = (project_id: number) =>
  request<PaginatedData<InferenceTaskItem>>({
    baseURL: '/',
    url: `/lab-backend/api/v1/inference_tasks/project/${project_id}`,
    method: 'get',
    params: {
      page: 1,
      size: 20,
    },
  })
