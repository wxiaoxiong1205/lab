import apiClient from './apiClient'

export interface V115DatasetRef {
  dataset_id?: number
  dataset_name: string
  version: string
  usage: string
  dataset_type: string
  training_method_type: string
  dataset_format: string
}

export interface DataInsightFilterCondition {
  condition_type: string
  operator: string
  value?: unknown
  min_value?: number
  max_value?: number
}

export interface DataInsightTask {
  id: number
  name: string
  description?: string
  project_id: number
  source_dataset_id?: number
  source_dataset_name: string
  source_dataset_version: string
  source_dataset_usage: string
  dataset_type: string
  training_method_type: string
  dataset_format: string
  status: string
  config?: Record<string, unknown>
  result_summary?: Record<string, any>
  result_samples?: { items?: any[], total?: number }
  error_message?: string
  created_at: string
  updated_at: string
  created_by?: string
  finished_at?: string
}

export interface DataInsightTaskPage {
  items: DataInsightTask[]
  total: number
  page: number
  size: number
}

export interface CreateDataInsightTaskRequest {
  name: string
  description?: string
  source_dataset: V115DatasetRef
  filters?: DataInsightFilterCondition[]
}

const promptResponseInsightSamples = [
  {
    system: '你是企业客服助手，回答需准确、克制。',
    prompt: '用户表示刚刚下单的智能门锁想要修改收货地址，但订单页面显示已经进入配货中，请说明可操作路径。',
    response: '可以先引导用户在订单详情页查看是否仍支持修改地址。如果页面入口已关闭，需要联系人工客服核验订单状态；若仓库尚未出库，可由客服协助提交地址变更申请。若订单已经出库，则建议用户在物流派送前联系快递员沟通，或在签收后通过售后流程处理。',
    flags: [],
  },
  {
    system: '你是企业客服助手。',
    prompt: '会员日优惠券不能叠加满减，用户质疑活动页写得不清楚。',
    response: '请先安抚用户情绪，再说明优惠券和满减属于同类营销权益，系统会自动选择更优惠的一项。可以引导用户查看活动规则中的“不可同享”说明，并在确有页面歧义时记录活动名称、截图和用户诉求，转交运营核查。',
    flags: ['疑似重复'],
  },
  {
    system: '你是企业客服助手，涉及退款金额时不得承诺超出规则的补偿。',
    prompt: '客户购买的课程包已经学习 3 节，剩余课程想退款，订单中使用了 200 元优惠券和 50 元积分抵扣，应该如何解释退款计算？',
    response: '可以说明退款会按实际支付金额、已使用课时、优惠券和积分抵扣规则综合计算。已学习课时通常需要按课时单价扣除，优惠券不折现退回，积分是否返还以订单规则为准。建议用户提交退款申请后，以系统审核页展示的金额为准，如对结果有疑问，可提供订单号继续核查。',
    flags: [],
  },
  {
    system: '你是企业客服助手。',
    prompt: '用户反馈 App 支付页出现 “ERR_PAY_502 !!!”，连续点击后被扣款两次，要求马上退款。',
    response: '先确认用户是否收到两笔支付成功通知，并请用户提供订单号、支付时间和支付渠道截图。若系统仅生成一笔有效订单，另一笔通常会由支付渠道自动冲正；若确认为重复扣款，需要创建支付异常工单并告知预计处理时效。回复中不要让用户继续重复支付。',
    flags: ['特殊字符偏高'],
  },
  {
    system: '你是企业客服助手，回答需包含下一步动作。',
    prompt: '企业采购客户希望一次性导出 200 个子账号的开票信息，页面只能导出当前页。',
    response: '可以告知当前页面导出仅覆盖筛选后的当前页数据。若需要批量导出全部子账号开票信息，建议客户使用管理后台的“批量导出”入口或联系客户成功经理申请后台导出。为减少等待时间，需要客户提供企业 ID、开票周期和字段范围。',
    flags: [],
  },
  {
    system: '你是企业客服助手。',
    prompt: '用户只说“打不开”。',
    response: '需要先追问用户打不开的是 App、网页、订单详情还是具体功能入口，并收集设备型号、系统版本、网络环境和报错截图。获得信息后再给出清缓存、切换网络、升级版本或转技术排查的建议。',
    flags: [],
  },
  {
    system: '你是企业客服助手。',
    prompt: '客户称售后寄回的商品已经签收 9 天，但退款还没到账，还在评论区连续发布 “######”、“@@@@@” 等内容。',
    response: '先说明已理解用户焦急情绪，并请用户提供售后单号或订单号。核查后若仓库已质检完成，需要说明退款通常在财务确认后原路退回；若质检未完成，应告知当前节点和预计完成时间。对评论区特殊字符内容不做评价，只处理退款问题本身。',
    flags: ['特殊字符偏高'],
  },
  {
    system: '你是企业客服助手，回答需避免营销话术。',
    prompt: '用户咨询海外手机号无法接收验证码，账号里还有未使用的兑换码和历史订单，需要换绑国内手机号。用户说明已经尝试重新安装、切换网络、等待 30 分钟，仍然无法收到短信。',
    response: '可以引导用户进入账号安全页尝试自助换绑。如果旧手机号无法接收验证码，需要通过人工身份核验处理，包括提供账号 ID、历史订单信息、兑换码记录和可联系的新手机号。核验通过后再协助换绑，期间提醒用户不要公开兑换码或验证码。',
    flags: [],
  },
]

const roleBasedInsightSamples = [
  {
    system: '你是企业客服助手，回答需准确、克制。',
    messages: [
      { role: 'system', content: '你是企业客服助手，回答需准确、克制。' },
      { role: 'user', content: '我买的空气净化器今天降价了，昨天刚签收，能不能补差价？' },
      { role: 'assistant', content: '可以先查看商品是否在价保周期内。如果订单满足价保规则，用户可在订单详情页提交价保申请；若入口不可见，需要提供订单号和当前商品页面截图，由客服协助核验。' },
      { role: 'user', content: '页面提示不支持，但是活动页写着 7 天价保。' },
      { role: 'assistant', content: '建议核对活动页适用范围、商品 SKU 和订单签收时间。如果活动规则确实覆盖该商品，可以记录活动页截图、订单号和报错提示，提交价保异常工单复核。' },
    ],
    flags: [],
  },
  {
    system: '你是企业客服助手。',
    messages: [
      { role: 'system', content: '你是企业客服助手。' },
      { role: 'user', content: '发票开错抬头了，能重开吗？' },
      { role: 'assistant', content: '一般可在订单发票页申请红冲后重开，是否支持取决于发票状态和开票时间。' },
      { role: 'user', content: '我是企业采购，月底要报销，今天必须处理。税号是 9133***********，金额 12888.66 元。' },
      { role: 'assistant', content: '可以优先引导客户提交红冲重开申请，并提醒准备正确抬头、税号和接收邮箱。若页面无法提交，需要转企业客户工单并标记报销时效诉求，但不能承诺当天一定完成。' },
    ],
    flags: ['含敏感字段'],
  },
  {
    system: '你是企业客服助手，遇到技术故障需要收集环境信息。',
    messages: [
      { role: 'system', content: '你是企业客服助手，遇到技术故障需要收集环境信息。' },
      { role: 'user', content: '模型训练任务一直卡在排队中。' },
      { role: 'assistant', content: '请先确认项目配额、资源池和队列状态，并提供任务 ID、创建时间、训练类型和选择的资源规格。' },
      { role: 'user', content: '任务 ID 是 train-20260629-001，SFT，A800 资源，排队 4 小时了，页面没有报错。' },
      { role: 'assistant', content: '可以说明排队通常与资源池容量和优先级有关。建议检查是否存在同项目并发任务占用配额，同时将任务 ID、资源规格和排队时长提交给平台运维排查资源调度状态。' },
    ],
    flags: [],
  },
  {
    system: '你是企业客服助手。',
    messages: [
      { role: 'system', content: '你是企业客服助手。' },
      { role: 'user', content: '退款失败，提示 code=PAY_REFUND_LOCKED###，这是什么意思？' },
      { role: 'assistant', content: '该提示通常表示退款链路被支付状态或风控状态暂时锁定，需要核查支付渠道返回状态。' },
      { role: 'user', content: '我已经等了三天，订单号 202606290088，别再让我等！！！' },
      { role: 'assistant', content: '先安抚用户并收集订单号、支付渠道和失败截图。随后说明需要核验支付渠道锁定原因，如确认为异常锁定，应创建支付退款工单并同步预计处理时间。' },
    ],
    flags: ['特殊字符偏高'],
  },
  {
    system: '你是企业客服助手，回答必须给出下一步。',
    messages: [
      { role: 'system', content: '你是企业客服助手，回答必须给出下一步。' },
      { role: 'user', content: '账号被误封了。' },
      { role: 'assistant', content: '请用户提供账号 ID、登录手机号、封禁提示截图和最近一次操作时间，客服可协助提交申诉。' },
      { role: 'user', content: '账号里有团队成员，今天要交付客户项目，能不能先恢复？' },
      { role: 'assistant', content: '可以说明账号恢复必须完成安全核验，不能直接绕过封禁。建议先提交加急申诉材料，并让团队管理员确认是否有其他成员可临时接管项目权限。' },
    ],
    flags: [],
  },
]

const fallbackInsightTasks: DataInsightTask[] = [
  {
    id: 91001,
    name: '客服问答 SFT 数据洞察',
    project_id: 0,
    source_dataset_name: '智能客服问答集合',
    source_dataset_version: 'V1',
    source_dataset_usage: 'training',
    dataset_type: 'text-generation',
    training_method_type: 'sft',
    dataset_format: 'prompt-response',
    status: 'completed',
    result_summary: {
      total_samples: promptResponseInsightSamples.length,
      total_characters: 12680,
      avg_characters: 634,
      field_stats: [
        { field: 'system', min_length: 12, max_length: 256, avg_length: 64, sample_count: 20, empty_count: 0 },
        { field: 'prompt', min_length: 197, max_length: 546, avg_length: 312, sample_count: 20, empty_count: 0 },
        { field: 'response', min_length: 400, max_length: 1080, avg_length: 712, sample_count: 20, empty_count: 0 },
      ],
      round_distribution: [
        { round: '1轮', count: 4 },
        { round: '2轮', count: 6 },
        { round: '3轮', count: 5 },
        { round: '4轮', count: 3 },
        { round: '5轮+', count: 2 },
      ],
      special_character_distribution: [
        { range: '0-2%', count: 12 },
        { range: '2-5%', count: 5 },
        { range: '5-10%', count: 2 },
        { range: '10%+', count: 1 },
      ],
      quality_findings: { empty_samples: 0, format_errors: 1, duplicate_samples: 2, active_filters: [] },
    },
    result_samples: {
      total: promptResponseInsightSamples.length,
      items: promptResponseInsightSamples.map((item, index) => ({
        row_number: index + 1,
        round_count: 1,
        sample_data: {
          system: item.system,
          prompt: item.prompt,
          response: item.response,
        },
        quality_flags: item.flags,
      })),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'system',
    finished_at: new Date().toISOString(),
  },
  {
    id: 91002,
    name: '多轮客服会话质量洞察',
    project_id: 0,
    source_dataset_name: 'showcase-多轮对话洞察SFT',
    source_dataset_version: 'V2',
    source_dataset_usage: 'training',
    dataset_type: 'text-generation',
    training_method_type: 'sft',
    dataset_format: 'role-based',
    status: 'completed',
    result_summary: {
      total_samples: roleBasedInsightSamples.length,
      total_characters: 96520,
      avg_characters: 754,
      field_stats: [
        { field: 'messages.system', min_length: 0, max_length: 140, avg_length: 38, sample_count: 128, empty_count: 14 },
        { field: 'messages.user', min_length: 18, max_length: 620, avg_length: 268, sample_count: 128, empty_count: 0 },
        { field: 'messages.assistant', min_length: 52, max_length: 1600, avg_length: 448, sample_count: 128, empty_count: 3 },
      ],
      round_distribution: [
        { round: '1轮', count: 38 },
        { round: '2轮', count: 42 },
        { round: '3轮', count: 30 },
        { round: '4轮', count: 12 },
        { round: '5轮+', count: 6 },
      ],
      special_character_distribution: [
        { range: '0-2%', count: 91 },
        { range: '2-5%', count: 24 },
        { range: '5-10%', count: 9 },
        { range: '10%+', count: 4 },
      ],
      quality_findings: { empty_samples: 3, format_errors: 4, duplicate_samples: 7, active_filters: ['assistant 为空', '重复样本'] },
    },
    result_samples: {
      total: roleBasedInsightSamples.length,
      items: roleBasedInsightSamples.map((item, index) => ({
        row_number: index + 1,
        round_count: 2,
        sample_data: {
          system: item.system,
          messages: item.messages,
          prompt: item.messages.filter((message) => message.role === 'user').map((message) => message.content).join('\n'),
          response: item.messages.filter((message) => message.role === 'assistant').map((message) => message.content).join('\n'),
        },
        quality_flags: item.flags,
      })),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'showcase_admin',
    finished_at: new Date().toISOString(),
  },
  {
    id: 91003,
    name: '增强结果重复样本洞察',
    project_id: 0,
    source_dataset_name: '训练数据集/showcase-数据增强源SFT-V2',
    source_dataset_version: 'V2',
    source_dataset_usage: 'training',
    dataset_type: 'text-generation',
    training_method_type: 'sft',
    dataset_format: 'prompt-response',
    status: 'running',
    result_summary: {
      total_samples: 206,
      total_characters: 118400,
      avg_characters: 574,
      field_stats: [
        { field: 'prompt', min_length: 24, max_length: 780, avg_length: 236, sample_count: 206, empty_count: 0 },
        { field: 'response', min_length: 0, max_length: 1320, avg_length: 338, sample_count: 206, empty_count: 18 },
      ],
      round_distribution: [
        { round: '1轮', count: 150 },
        { round: '2轮', count: 44 },
        { round: '3轮', count: 12 },
      ],
      special_character_distribution: [
        { range: '0-2%', count: 170 },
        { range: '2-5%', count: 26 },
        { range: '5-10%', count: 8 },
        { range: '10%+', count: 2 },
      ],
      quality_findings: { empty_samples: 18, format_errors: 2, duplicate_samples: 21, active_filters: ['重复样本', 'response 为空'] },
    },
    result_samples: {
      total: 206,
      items: Array.from({ length: 10 }).map((_, index) => ({
        row_number: index + 1,
        round_count: 1,
        sample_data: {
          prompt: `改写后的客服问题样本 ${index + 1}`,
          response: index % 3 === 0 ? '' : `增强生成的标准回复 ${index + 1}`,
        },
        quality_flags: index % 3 === 0 ? ['Response 为空'] : index % 4 === 0 ? ['疑似重复'] : [],
      })),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'showcase_admin',
  },
]

function isLocalPreviewEnabled() {
  return import.meta.env.VITE_SHOWCASE_PREVIEW === 'true' || import.meta.env.VITE_LOCAL_PREVIEW === 'true'
}

function mergeFallbackTasks(pageData: DataInsightTaskPage, params?: { name?: string, status?: string, page?: number, size?: number }): DataInsightTaskPage {
  const existingIds = new Set((pageData.items || []).map((item) => item.id))
  const merged = [
    ...(pageData.items || []),
    ...fallbackInsightTasks.filter((item) => !existingIds.has(item.id)),
  ].filter((item) => {
    const matchName = !params?.name || item.name.includes(params.name) || item.source_dataset_name.includes(params.name)
    const matchStatus = !params?.status || item.status === params.status
    return matchName && matchStatus
  })
  const page = params?.page ?? pageData.page ?? 1
  const size = params?.size ?? pageData.size ?? 10
  return {
    ...pageData,
    items: merged.slice((page - 1) * size, page * size),
    total: Math.max(pageData.total || 0, merged.length),
    page,
    size,
  }
}

export const dataInsightService = {
  list: async (projectId: number, params?: { name?: string, status?: string, page?: number, size?: number }): Promise<DataInsightTaskPage> => {
    try {
      const response = await apiClient.get<DataInsightTaskPage>(`/data-insights/project/${projectId}/tasks`, { params })
      return isLocalPreviewEnabled() ? mergeFallbackTasks(response.data, params) : response.data
    }
    catch (error) {
      if (!isLocalPreviewEnabled()) throw error
      return mergeFallbackTasks({ items: [], total: 0, page: params?.page ?? 1, size: params?.size ?? 10 }, params)
    }
  },
  create: async (projectId: number, data: CreateDataInsightTaskRequest): Promise<DataInsightTask> => {
    const response = await apiClient.post<DataInsightTask>(`/data-insights/project/${projectId}/tasks`, data)
    return response.data
  },
  detail: async (projectId: number, taskId: number): Promise<DataInsightTask> => {
    const fallbackTask = fallbackInsightTasks.find((item) => item.id === taskId)
    try {
      const response = await apiClient.get<DataInsightTask>(`/data-insights/project/${projectId}/tasks/${taskId}`)
      if (isLocalPreviewEnabled() && !response.data?.id) {
        return fallbackTask || fallbackInsightTasks[0]
      }
      return response.data
    }
    catch (error) {
      if (!isLocalPreviewEnabled()) throw error
      return fallbackTask || fallbackInsightTasks[0]
    }
  },
  delete: async (projectId: number, taskId: number) => {
    await apiClient.delete(`/data-insights/project/${projectId}/tasks/${taskId}`)
  },
  saveAsDataset: async (projectId: number, taskId: number, data: { name: string, version: string, description?: string, filters?: DataInsightFilterCondition[] }) => {
    const response = await apiClient.post(`/data-insights/project/${projectId}/tasks/${taskId}/save-as-dataset`, data)
    return response.data
  },
}
