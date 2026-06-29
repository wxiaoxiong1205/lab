import type { TrainingDatasetListResponse, getDataParams } from '@/types/training'

type PreviewDatasetVersion = Record<string, any>
type PreviewPreviewRow = { row_number: number, sample_data: Record<string, any> }

const now = '2026-06-25T18:00:00+08:00'

const demoImage = (title: string, subtitle: string, from: string, to: string) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${from}" />
          <stop offset="100%" stop-color="${to}" />
        </linearGradient>
      </defs>
      <rect width="640" height="420" rx="32" fill="url(#bg)" />
      <circle cx="512" cy="92" r="72" fill="rgba(255,255,255,0.2)" />
      <circle cx="118" cy="330" r="86" fill="rgba(255,255,255,0.16)" />
      <rect x="78" y="96" width="484" height="228" rx="28" fill="rgba(255,255,255,0.3)" stroke="rgba(255,255,255,0.52)" />
      <text x="320" y="194" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff">${title}</text>
      <text x="320" y="242" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="rgba(255,255,255,0.88)">${subtitle}</text>
    </svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

const demoImages = {
  generationPoster: demoImage('图像生成样本 1', '智能音箱商品海报', '#f97316', '#ec4899'),
  generationLock: demoImage('图像生成样本 2', '智能门锁家居场景', '#0f766e', '#84cc16'),
  generationOutdoor: demoImage('图像生成样本 3', '户外便携电源广告', '#4f46e5', '#f59e0b'),
  understandingQuality: demoImage('图像理解样本 1', '商品外观质检', '#2563eb', '#14b8a6'),
  understandingScene: demoImage('图像理解样本 2', '物体与场景提取', '#7c3aed', '#0ea5e9'),
}

const attrValues = (scope: string, owner = '算法一组') => [
  {
    id: 9000,
    reference_id: 0,
    attr_id: 7000,
    name: '数据渠道',
    input_type: '下拉选择',
    attr_value: null,
    data_type: 'string',
    required_tag: 0,
    multi_select: 0,
    business_type: 'training_management',
    group: '',
    options: [{ option_value: '客服工单' }],
  },
  {
    id: 9001,
    reference_id: 0,
    attr_id: 7001,
    name: '业务线',
    input_type: '下拉选择',
    attr_value: null,
    data_type: 'string',
    required_tag: 1,
    multi_select: 0,
    business_type: 'training_management',
    group: '基础属性',
    options: [{ option_value: scope, option_order: 0 }],
  },
  {
    id: 9002,
    reference_id: 0,
    attr_id: 7002,
    name: '数据负责人',
    input_type: '手动输入',
    attr_value: owner,
    data_type: 'string',
    required_tag: 0,
    multi_select: 0,
    business_type: 'training_management',
    group: '治理属性',
    options: [],
  },
  {
    id: 9003,
    reference_id: 0,
    attr_id: 7003,
    name: '敏感级别',
    input_type: '下拉选择',
    attr_value: null,
    data_type: 'string',
    required_tag: 1,
    multi_select: 1,
    business_type: 'training_management',
    group: '治理属性',
    options: [{ option_value: '内部' }, { option_value: '脱敏' }],
  },
]

const version = (params: Partial<PreviewDatasetVersion> & {
  id: number
  name: string
  version: string
  usage: 'training' | 'test' | 'validation' | 'business_test'
  publish: number
  processing_status: 'pending' | 'completed' | 'failed'
}): PreviewDatasetVersion => {
  const processingDisplayMap = {
    pending: '处理中',
    completed: '处理完成',
    failed: '处理失败',
  } as const
  const publishDisplayMap: Record<number, string> = {
    0: '未发布',
    1: '已发布',
    2: '-',
    3: '-',
  }
  const processingStatusDisplay = processingDisplayMap[params.processing_status]
  const publishDisplay = publishDisplayMap[params.publish] || '-'
  const statusDisplay = params.processing_status === 'completed'
    ? publishDisplay
    : processingStatusDisplay

  return {
    project_id: 1001,
    description: 'V1.14 showcase 演示数据',
    dataset_type: 'text-generation',
    training_method_type: 'sft',
    dataset_format: 'role-based',
    usage: params.usage,
    dataset_config: {},
    metadata_fields: ['messages', 'category', 'difficulty'],
    total_samples: 4,
    total_characters: 1200,
    file_size: 1.28,
    file_size_display: '1.28 MB',
    dataset_path: `/preview/${params.usage}/${params.name}/${params.version}.jsonl`,
    processing_status_display: processingStatusDisplay,
    status_display: statusDisplay,
    publish_display: publishDisplay,
    processing_error: params.processing_status === 'failed' ? '演示：字段 category 缺失，解析失败' : undefined,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
    is_published: params.publish === 1,
    attr_values: attrValues(params.usage === 'test' ? '效果评估' : '客服训练'),
    ...params,
  }
}

const datasetVersions: PreviewDatasetVersion[] = [
  version({
    id: 90901,
    name: 'showcase-数据增强源SFT',
    version: 'V1',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    dataset_format: 'prompt-response',
    metadata_fields: ['prompt', 'response', 'category'],
    description: '数据增强与数据洞察演示源数据集',
  }),
  version({
    id: 90902,
    name: 'showcase-多轮对话洞察SFT',
    version: 'V2',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    dataset_format: 'role-based',
    metadata_fields: ['messages', 'category', 'difficulty'],
    description: 'Role-based 多轮对话洞察演示数据集',
  }),
  version({
    id: 91001,
    name: 'showcase-客服SFT多状态数据',
    version: 'V1',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    description: '已发布源版本，可被新增/继承/合并选择',
  }),
  version({
    id: 91002,
    name: 'showcase-客服SFT多状态数据',
    version: 'V2',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    description: '已发布前置版本，用于验证已发布后才允许继续创建下一版本',
  }),
  version({
    id: 91003,
    name: 'showcase-客服SFT多状态数据',
    version: 'V3',
    usage: 'training',
    publish: 2,
    processing_status: 'pending',
    description: '最新版本创建中，列表展示“创建中”，详情操作置灰',
  }),
  version({
    id: 91011,
    name: 'showcase-来源展示与单条删除',
    version: 'V1',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    description: '合并演示 V1',
  }),
  version({
    id: 91012,
    name: 'showcase-来源展示与单条删除',
    version: 'V2',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    description: '合并演示 V2',
  }),
  version({
    id: 91013,
    name: 'showcase-来源展示与单条删除',
    version: 'V3',
    usage: 'training',
    publish: 0,
    processing_status: 'completed',
    description: '由 V1 与 V2 合并生成，未发布，允许删除单条数据',
    dataset_config: {
      data_source_type: 'merge',
      merge_source_versions: ['V1', 'V2'],
    },
    active_operation: {
      operation_id: 'preview-delete-running-91013',
      dataset_kind: 'llm_dataset',
      dataset_id: 91013,
      version: 'V3',
      operation_type: 'delete_rows',
      status: 'running',
      row_numbers: [2],
      requested_count: 1,
      removed_count: 0,
      updated_at: now,
    },
    attr_values: attrValues('客服训练', '数据治理演示组'),
  }),
  version({
    id: 91021,
    name: 'showcase-继承本地上传展示',
    version: 'V1',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    description: '继承演示 V1',
  }),
  version({
    id: 91022,
    name: 'showcase-继承本地上传展示',
    version: 'V2',
    usage: 'training',
    publish: 0,
    processing_status: 'completed',
    description: '继承 V1 后追加本地上传文件生成，未发布，允许删除单条数据',
    dataset_config: {
      data_source_type: 'inherit_upload',
      inherit_source_version: 'V1',
      has_uploaded_files: true,
    },
  }),
  version({
    id: 91041,
    name: 'showcase-单条删除失败演示',
    version: 'V1',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    description: '删除失败演示的已发布来源版本',
  }),
  version({
    id: 91042,
    name: 'showcase-单条删除失败演示',
    version: 'V2',
    usage: 'training',
    publish: 0,
    processing_status: 'completed',
    description: '未发布版本，单条删除后台任务失败，目标行恢复正常展示',
    dataset_config: {
      data_source_type: 'inherit',
      inherit_source_version: 'V1',
    },
    active_operation: {
      operation_id: 'preview-delete-failed-91042',
      dataset_kind: 'llm_dataset',
      dataset_id: 91042,
      version: 'V2',
      operation_type: 'delete_rows',
      status: 'failed',
      row_numbers: [2],
      requested_count: 1,
      removed_count: 0,
      error_message: '目标数据已变化，请刷新后重试',
      updated_at: now,
    },
    attr_values: attrValues('客服训练', '数据治理演示组'),
  }),
  version({
    id: 91031,
    name: 'showcase-创建失败数据',
    version: 'V1',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
  }),
  version({
    id: 91032,
    name: 'showcase-创建失败数据',
    version: 'V2',
    usage: 'training',
    publish: 3,
    processing_status: 'failed',
    description: '最新版本创建失败，列表展示“创建失败”',
  }),
  version({
    id: 92001,
    name: 'showcase-测试数据发布态',
    version: 'V1',
    usage: 'test',
    publish: 1,
    processing_status: 'completed',
    description: '测试数据已发布来源',
  }),
  version({
    id: 92002,
    name: 'showcase-测试数据发布态',
    version: 'V2',
    usage: 'test',
    publish: 0,
    processing_status: 'completed',
    description: '测试数据未发布版本，允许删除单条数据',
    dataset_config: {
      data_source_type: 'inherit',
      inherit_source_version: 'V1',
    },
    active_operation: {
      operation_id: 'preview-delete-failed-92002',
      dataset_kind: 'llm_dataset',
      dataset_id: 92002,
      version: 'V2',
      operation_type: 'delete_rows',
      status: 'failed',
      row_numbers: [3],
      requested_count: 1,
      removed_count: 0,
      error_message: '目标数据已变化，请刷新后重试',
      updated_at: now,
    },
    attr_values: attrValues('效果评估', '评估团队'),
  }),
  version({
    id: 92011,
    name: 'showcase-测试数据创建中',
    version: 'V1',
    usage: 'test',
    publish: 2,
    processing_status: 'pending',
    description: '测试数据创建中',
  }),
  version({
    id: 92021,
    name: 'showcase-测试数据创建失败',
    version: 'V1',
    usage: 'test',
    publish: 3,
    processing_status: 'failed',
    description: '测试数据创建失败',
  }),
  version({
    id: 93001,
    name: 'showcase-SFT-PromptResponse-客服问答',
    version: 'V1',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    dataset_format: 'prompt-response',
    metadata_fields: ['prompt', 'response', 'category'],
    description: '文本生成 SFT Prompt+Response 演示数据，可用于标注、清洗、洞察和训练。',
  }),
  version({
    id: 93002,
    name: 'showcase-SFT-RoleBased-多轮客服',
    version: 'V1',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    dataset_format: 'role-based',
    metadata_fields: ['messages', 'category', 'difficulty'],
    description: '文本生成 SFT Role-Based 多轮对话演示数据。',
  }),
  version({
    id: 93011,
    name: 'showcase-DPO-Alpaca-偏好问答',
    version: 'V1',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    training_method_type: 'dpo',
    dataset_format: 'alpaca',
    metadata_fields: ['instruction', 'input', 'chosen', 'rejected'],
    description: '文本生成 DPO Alpaca 偏好数据演示。',
  }),
  version({
    id: 93012,
    name: 'showcase-DPO-RoleBased-客服偏好',
    version: 'V1',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    training_method_type: 'dpo',
    dataset_format: 'role-based',
    metadata_fields: ['messages', 'chosen', 'rejected'],
    description: '文本生成 DPO Role-Based 偏好数据演示。',
  }),
  version({
    id: 93021,
    name: 'showcase-GRPO-数学推理奖励',
    version: 'V1',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    training_method_type: 'grpo',
    dataset_format: 'grpo',
    metadata_fields: ['prompt', 'reward_model', 'ability', 'data_source'],
    description: '文本生成 RFT-GRPO 奖励数据演示。',
  }),
  version({
    id: 93031,
    name: 'showcase-图像理解SFT-质检问答',
    version: 'V1',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    dataset_type: 'image-understanding',
    dataset_format: 'role-based',
    metadata_fields: ['messages', 'images', 'category'],
    description: '图像理解 SFT Role-Based 演示数据。',
  }),
  version({
    id: 93041,
    name: 'showcase-图像生成SFT-商品海报',
    version: 'V1',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    dataset_type: 'image-generation',
    dataset_format: 'image-prompt',
    metadata_fields: ['prompt', 'images', 'negative_prompt', 'metadata'],
    description: '图像生成 SFT image-prompt 有标注演示数据。',
  }),
  version({
    id: 93042,
    name: 'showcase-图像生成SFT-未标注素材',
    version: 'V1',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    dataset_type: 'image-generation',
    dataset_format: 'image-prompt',
    metadata_fields: ['prompt', 'images', 'negative_prompt', 'metadata'],
    total_samples: 3,
    description: '图像生成 SFT image-prompt 未标注图片素材演示，Prompt 待数据标注补充。',
  }),
  version({
    id: 94001,
    name: 'showcase-测试集-图像生成评估',
    version: 'V1',
    usage: 'test',
    publish: 1,
    processing_status: 'completed',
    dataset_type: 'image-generation',
    dataset_format: 'image-prompt',
    metadata_fields: ['prompt', 'images', 'negative_prompt', 'metadata'],
    description: '图像生成测试数据演示，可用于后续评估与结果集链路。',
  }),
]

const previewRowsByVersionId = new Map<number, PreviewPreviewRow[]>(
  datasetVersions.map((item) => [
    item.id,
    item.dataset_format === 'image-prompt'
      ? [
          {
            row_number: 1,
            sample_data: {
              prompt: item.name.includes('未标注') ? '' : '一张现代极简风格的智能音箱商品海报，浅灰背景，柔和自然光，突出圆柱形机身和屏幕细节',
              negative_prompt: '低清晰度、变形、文字乱码、过曝',
              images: [demoImages.generationPoster],
              metadata: { style: 'product-poster', scene: 'ecommerce', ratio: '3:2' },
            },
          },
          {
            row_number: 2,
            sample_data: {
              prompt: item.name.includes('未标注') ? '' : '适合家居场景的智能门锁宣传图，木质门板，金属拉丝质感，画面干净高级',
              negative_prompt: '杂乱背景、低质感、Logo 变形',
              images: [demoImages.generationLock],
              metadata: { style: 'realistic', scene: 'smart-home', ratio: '3:2' },
            },
          },
          {
            row_number: 3,
            sample_data: {
              prompt: item.name.includes('未标注') ? '' : '户外露营氛围的便携电源广告图，傍晚暖光，帐篷和设备清晰可见',
              negative_prompt: '',
              images: [demoImages.generationOutdoor],
              metadata: { style: 'lifestyle', scene: 'outdoor' },
            },
          },
        ]
      : item.dataset_type === 'image-understanding'
        ? [
            {
              row_number: 1,
              sample_data: {
                messages: [
                  { role: 'system', content: '你是质检图像理解助手。' },
                  { role: 'user', content: '<image>请判断图片中商品外观是否有明显破损。' },
                  { role: 'assistant', content: '图片中商品外观完整，未见明显破损或污渍。' },
                ],
                images: [demoImages.understandingQuality],
                category: '质检',
              },
            },
            {
              row_number: 2,
              sample_data: {
                messages: [
                  { role: 'user', content: '<image>请提取画面中的主要物体和场景。' },
                  { role: 'assistant', content: '主要物体为电子设备，场景为室内桌面展示。' },
                ],
                images: [demoImages.understandingScene],
                category: '视觉问答',
              },
            },
          ]
        : item.dataset_format === 'prompt-response'
          ? [
              {
                row_number: 1,
                sample_data: {
                  system: '你是企业客服助手。',
                  prompt: '用户刚下单的智能门锁想修改收货地址，但订单已进入配货中，应该如何回复？',
                  response: '建议先核实订单状态。若尚未出库，可协助用户提交地址修改；若已出库，应引导用户联系快递或走拒收重寄流程。',
                  category: '售后',
                },
              },
              {
                row_number: 2,
                sample_data: {
                  prompt: '用户反馈智能音箱无法联网，请给出排查步骤。',
                  response: '请先确认 Wi-Fi 密码、路由器 2.4G 网络、设备距离和 App 授权；仍失败时可重置设备后重新配网。',
                  category: '故障排查',
                },
              },
            ]
          : item.training_method_type === 'dpo' && item.dataset_format === 'alpaca'
            ? [
                {
                  row_number: 1,
                  sample_data: {
                    instruction: '解释会员退款规则',
                    input: '用户购买年度会员后使用 3 天，希望全额退款。',
                    chosen: '可以先说明退款需按实际使用和活动规则核算，再引导用户提交订单号由客服进一步处理。',
                    rejected: '直接告诉用户不能退，不需要解释。',
                  },
                },
                {
                  row_number: 2,
                  sample_data: {
                    instruction: '生成简洁客服回复',
                    input: '用户催促发货。',
                    chosen: '已帮您查看订单状态，若超过承诺发货时间我们会优先为您催促仓库处理。',
                    rejected: '别急，仓库会发的。',
                  },
                },
              ]
            : item.training_method_type === 'grpo'
              ? [
                  {
                    row_number: 1,
                    sample_data: {
                      data_source: 'math_demo',
                      prompt: [{ role: 'user', content: '如果 3 件商品共 99 元，买 5 件多少钱？' }],
                      ability: 'math',
                      reward_model: { style: 'rule', ground_truth: '165 元' },
                      extra_info: { answer_format: 'number_with_unit' },
                    },
                  },
                  {
                    row_number: 2,
                    sample_data: {
                      data_source: 'logic_demo',
                      prompt: [{ role: 'user', content: 'A 比 B 高，B 比 C 高，谁最高？' }],
                      ability: 'logic',
                      reward_model: { style: 'rule', ground_truth: 'A 最高' },
                      extra_info: { answer_format: 'short_text' },
                    },
                  },
                ]
              : [
                  {
                    row_number: 1,
                    sample_data: {
                      messages: [
                        { role: 'system', content: '你是企业客服助手。' },
                        { role: 'user', content: `请说明 ${item.name} ${item.version} 的用途。` },
                        { role: 'assistant', content: '用于覆盖数据创建态、发布态和来源展示。' },
                      ],
                      chosen: { role: 'assistant', content: '用于覆盖数据创建态、发布态和来源展示。' },
                      rejected: { role: 'assistant', content: '这是普通样例。' },
                      category: item.usage === 'test' ? '效果评估' : '客服问答',
                      difficulty: '中',
                    },
                  },
                  {
                    row_number: 2,
                    sample_data: {
                      messages: [
                        { role: 'user', content: '未发布版本可以做什么？' },
                        { role: 'assistant', content: '未发布版本允许删除单条数据，发布后明细锁定。' },
                      ],
                      chosen: { role: 'assistant', content: '未发布版本允许删除单条数据，发布后明细锁定。' },
                      rejected: { role: 'assistant', content: '可以随意改。' },
                      category: '发布态',
                      difficulty: '低',
                    },
                  },
                  {
                    row_number: 3,
                    sample_data: {
                      messages: [
                        { role: 'user', content: '新增/继承/合并版本的来源范围是什么？' },
                        { role: 'assistant', content: '只展示已发布版本作为来源。' },
                      ],
                      chosen: { role: 'assistant', content: '只展示已发布版本作为来源。' },
                      rejected: { role: 'assistant', content: '所有历史版本都可以。' },
                      category: '来源版本',
                      difficulty: '高',
                    },
                  },
                ],
  ]),
)

const getLatestVersions = (usage?: string) => {
  const grouped = new Map<string, PreviewDatasetVersion[]>()
  datasetVersions
    .filter((item) => !usage || item.usage === usage)
    .forEach((item) => {
      grouped.set(item.name, [...(grouped.get(item.name) || []), item])
    })
  return [...grouped.values()].map((items) => items[items.length - 1])
}

export const previewTrainingDatasetList = (params: getDataParams = {}): TrainingDatasetListResponse => {
  const page = params.page ?? 1
  const size = params.size ?? 10
  const latestVersions = getLatestVersions(params.usage).filter((item) => {
    const matchName = !params.name || item.name.toLowerCase().includes(params.name.toLowerCase())
    const matchDatasetType = !params.dataset_type || item.dataset_type === params.dataset_type
    const matchTrainingMethod = !params.training_method_type || item.training_method_type === params.training_method_type
    const matchPublish = params.publish == null || item.publish === params.publish
    return matchName && matchDatasetType && matchTrainingMethod && matchPublish
  })

  const items = latestVersions.map((item) => {
    const versions = datasetVersions.filter((versionItem) => versionItem.name === item.name && versionItem.usage === item.usage)
    return {
      id: item.id,
      dataset_name: item.name,
      version_count: versions.length,
      dataset_type: item.dataset_type,
      training_method_type: item.training_method_type,
      dataset_format: item.dataset_format,
      usage: item.usage,
      project_id: item.project_id,
      model_name: 'Qwen2.5-7B-Instruct',
      latest_version: item.version,
      earliest_version: versions[0]?.version || item.version,
      processing_status: item.processing_status,
      processing_status_display: item.processing_status_display,
      processing_error: item.processing_error,
      metadata_fields: item.metadata_fields,
      publish: item.publish,
      publish_display: item.publish_display,
      created_at: versions[0]?.created_at || item.created_at,
      updated_at: item.updated_at,
      created_by: item.created_by,
    }
  })

  return {
    items: items.slice((page - 1) * size, page * size),
    total: items.length,
    page,
    size,
    pages: Math.max(1, Math.ceil(items.length / size)),
  } as TrainingDatasetListResponse
}

export const mergePreviewTrainingDatasetList = (
  source: TrainingDatasetListResponse,
  params: getDataParams = {},
): TrainingDatasetListResponse => {
  const preview = previewTrainingDatasetList({ ...params, page: 1, size: 999 })
  const existingNames = new Set((source.items || []).map((item: any) => item.dataset_name))
  const mergedItems = [
    ...(source.items || []),
    ...preview.items.filter((item: any) => !existingNames.has(item.dataset_name)),
  ]
  const page = params.page ?? source.page ?? 1
  const size = params.size ?? source.size ?? 10
  return {
    ...source,
    items: mergedItems.slice((page - 1) * size, page * size),
    total: Math.max(source.total || 0, mergedItems.length),
    page,
    size,
    pages: Math.max(1, Math.ceil(mergedItems.length / size)),
  }
}

export const isPreviewTrainingDatasetName = (datasetName?: string) => {
  return datasetVersions.some((item) => item.name === datasetName)
}

export const isPreviewTrainingDatasetId = (datasetId?: number) => {
  return datasetVersions.some((item) => item.id === datasetId)
}

export const previewTrainingDatasetDetail = (datasetName: string, usage?: string) => {
  return datasetVersions
    .filter((item) => item.name === datasetName && (!usage || item.usage === usage))
    .map((item) => ({ ...item, attr_values: item.attr_values.map((attr: any) => ({ ...attr, reference_id: item.id })) }))
}

export const previewTrainingDatasetPreview = (
  datasetName: string,
  versionName: string,
  page = 1,
  size = 10,
  usage?: string,
) => {
  const versionItem = datasetVersions.find((item) => item.name === datasetName && item.version === versionName && (!usage || item.usage === usage))
  const rows = versionItem ? (previewRowsByVersionId.get(versionItem.id) || []) : []
  return {
    items: rows.slice((page - 1) * size, page * size),
    total: rows.length,
    page,
    size,
  }
}

export const publishPreviewTrainingDataset = (datasetId: number) => {
  const item = datasetVersions.find((versionItem) => versionItem.id === datasetId)
  if (!item) return
  item.publish = 1
  item.publish_display = '已发布'
  item.status_display = '已发布'
  item.is_published = true
  item.updated_at = new Date().toISOString()
}

export const deletePreviewTrainingDatasetRows = (datasetId: number, rowNumbers: number[]) => {
  const rows = previewRowsByVersionId.get(datasetId)
  if (!rows) return
  const nextRows = rows.filter((row) => !rowNumbers.includes(row.row_number))
  previewRowsByVersionId.set(datasetId, nextRows)
  const item = datasetVersions.find((versionItem) => versionItem.id === datasetId)
  if (item) {
    item.total_samples = nextRows.length
    item.updated_at = new Date().toISOString()
  }
}

export const deletePreviewTrainingDatasetVersion = (datasetName: string, versionName: string, usage?: string) => {
  const index = datasetVersions.findIndex((item) => item.name === datasetName && item.version === versionName && (!usage || item.usage === usage))
  if (index >= 0) {
    previewRowsByVersionId.delete(datasetVersions[index].id)
    datasetVersions.splice(index, 1)
  }
}

export const deletePreviewTrainingDatasetAllVersions = (datasetName: string, usage?: string) => {
  for (let index = datasetVersions.length - 1; index >= 0; index--) {
    const item = datasetVersions[index]
    if (item.name === datasetName && (!usage || item.usage === usage)) {
      previewRowsByVersionId.delete(item.id)
      datasetVersions.splice(index, 1)
    }
  }
}

export const editPreviewTrainingDataset = (
  datasetName: string,
  datasetId: number,
  usage: string,
  nextName?: string,
  description?: string,
) => {
  const item = datasetVersions.find((versionItem) => versionItem.id === datasetId)
  if (!item) return
  const oldName = item.name || datasetName
  datasetVersions.forEach((versionItem) => {
    if (versionItem.name === oldName && versionItem.usage === usage) {
      if (nextName) versionItem.name = nextName
    }
  })
  if (description !== undefined) item.description = description
}
