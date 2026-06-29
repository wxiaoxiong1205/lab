import type { GetLabelTaskDataParams, GetLabelTasksParams } from '@/services/dataAnnotationService'

const now = '2026-06-29T10:00:00+08:00'

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
      <circle cx="515" cy="96" r="68" fill="rgba(255,255,255,0.22)" />
      <circle cx="112" cy="334" r="92" fill="rgba(255,255,255,0.16)" />
      <rect x="82" y="92" width="476" height="236" rx="28" fill="rgba(255,255,255,0.28)" stroke="rgba(255,255,255,0.52)" />
      <text x="320" y="194" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" font-weight="700" fill="#ffffff">${title}</text>
      <text x="320" y="244" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="rgba(255,255,255,0.88)">${subtitle}</text>
    </svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

const demoImages = {
  vlQuality: demoImage('质检样图', '外观完整度识别', '#2563eb', '#14b8a6'),
  vlScene: demoImage('场景样图', '物体与环境提取', '#7c3aed', '#0ea5e9'),
  igMaterial: demoImage('素材图片 1', '待补充 Prompt', '#f97316', '#ec4899'),
  igProduct: demoImage('素材图片 2', '商品主图风格', '#0f766e', '#84cc16'),
  igPoster: demoImage('素材图片 3', '活动海报风格', '#4f46e5', '#f59e0b'),
}

type DemoTask = {
  id: number
  task_name: string
  dataset_type: string
  training_method_type: string
  dataset_format: string
  total_samples: number
  saved_count: number
  assigned_count: number
  created_by: string
  created_at: string
  source_dataset_name: string
  submit_dataset_name: string
  task_type: 'online'
  status: string
  items: Array<{
    raw_data: Record<string, unknown>
    annotation?: Record<string, unknown> | null
    is_annotated?: boolean
  }>
  base_url?: string
}

const demoTasks: DemoTask[] = [
  {
    id: 99001,
    task_name: '演示-文本生成SFT客服问答标注',
    dataset_type: 'text-generation',
    training_method_type: 'sft',
    dataset_format: 'prompt-response',
    total_samples: 2,
    saved_count: 1,
    assigned_count: 2,
    created_by: 'showcase_admin',
    created_at: now,
    source_dataset_name: '训练数据集/showcase-SFT-PromptResponse-客服问答-V1',
    submit_dataset_name: '训练数据集/showcase-SFT-PromptResponse-客服问答-V2',
    task_type: 'online',
    status: 'in_progress',
    items: [
      {
        raw_data: {
          system: '你是企业客服助手。',
          prompt: '用户刚下单的智能门锁想修改收货地址，但订单已进入配货中，应该如何回复？',
          response: '建议先核实订单状态。若尚未出库，可协助用户提交地址修改；若已出库，应引导用户联系快递或走拒收重寄流程。',
        },
        annotation: { response: '先安抚用户，再根据订单是否出库分别给出修改地址或快递拦截方案。' },
        is_annotated: true,
      },
      {
        raw_data: {
          prompt: '用户反馈智能音箱无法联网，请给出排查步骤。',
          response: '',
        },
        annotation: null,
        is_annotated: false,
      },
    ],
  },
  {
    id: 99002,
    task_name: '演示-DPO Alpaca偏好标注',
    dataset_type: 'text-generation',
    training_method_type: 'dpo',
    dataset_format: 'alpaca',
    total_samples: 2,
    saved_count: 1,
    assigned_count: 2,
    created_by: 'showcase_admin',
    created_at: now,
    source_dataset_name: '训练数据集/showcase-DPO-Alpaca-偏好问答-V1',
    submit_dataset_name: '训练数据集/showcase-DPO-Alpaca-偏好问答-V2',
    task_type: 'online',
    status: 'in_progress',
    items: [
      {
        raw_data: {
          instruction: '解释会员退款规则',
          input: '用户购买年度会员后使用 3 天，希望全额退款。',
          chosen: '可以先说明退款需按实际使用和活动规则核算，再引导用户提交订单号由客服进一步处理。',
          rejected: '直接告诉用户不能退，不需要解释。',
        },
        annotation: null,
        is_annotated: false,
      },
      {
        raw_data: {
          instruction: '生成简洁客服回复',
          input: '用户催促发货。',
          chosen: '已帮您查看订单状态，若超过承诺发货时间我们会优先为您催促仓库处理。',
          rejected: '别急，仓库会发的。',
        },
        annotation: { chosen: '我会先帮您核对订单状态，如已超过承诺时效会同步催促仓库优先处理。', rejected: '等着就行。' },
        is_annotated: true,
      },
    ],
  },
  {
    id: 99003,
    task_name: '演示-GRPO奖励答案标注',
    dataset_type: 'text-generation',
    training_method_type: 'grpo',
    dataset_format: 'grpo',
    total_samples: 2,
    saved_count: 0,
    assigned_count: 2,
    created_by: 'showcase_admin',
    created_at: now,
    source_dataset_name: '训练数据集/showcase-GRPO-数学推理奖励-V1',
    submit_dataset_name: '-',
    task_type: 'online',
    status: 'created',
    items: [
      {
        raw_data: {
          data_source: 'math_demo',
          prompt: [{ role: 'user', content: '如果 3 件商品共 99 元，买 5 件多少钱？' }],
          ability: 'math',
          reward_model: { style: 'rule', ground_truth: '165 元' },
          extra_info: { answer_format: 'number_with_unit' },
        },
        annotation: null,
        is_annotated: false,
      },
      {
        raw_data: {
          data_source: 'logic_demo',
          prompt: [{ role: 'user', content: 'A 比 B 高，B 比 C 高，谁最高？' }],
          ability: 'logic',
          reward_model: { style: 'rule', ground_truth: 'A 最高' },
          extra_info: { answer_format: 'short_text' },
        },
        annotation: null,
        is_annotated: false,
      },
    ],
  },
  {
    id: 99011,
    task_name: '演示-图像理解质检问答标注',
    dataset_type: 'image-understanding',
    training_method_type: 'sft',
    dataset_format: 'role-based',
    total_samples: 2,
    saved_count: 1,
    assigned_count: 2,
    created_by: 'showcase_admin',
    created_at: now,
    source_dataset_name: '训练数据集/showcase-图像理解SFT-质检问答-V1',
    submit_dataset_name: '训练数据集/showcase-图像理解SFT-质检问答-V2',
    task_type: 'online',
    status: 'in_progress',
    items: [
      {
        raw_data: {
          messages: [
            { role: 'system', content: '你是质检图像理解助手。' },
            { role: 'user', content: '<image>请判断图片中商品外观是否有明显破损。' },
            { role: 'assistant', content: '图片中商品外观完整，未见明显破损或污渍。' },
          ],
          images: [demoImages.vlQuality],
        },
        annotation: null,
        is_annotated: false,
      },
      {
        raw_data: {
          messages: [
            { role: 'user', content: '<image>请提取画面中的主要物体和场景。' },
            { role: 'assistant', content: '主要物体为电子设备，场景为室内桌面展示。' },
          ],
          images: [demoImages.vlScene],
        },
        annotation: { messages: [{ role: 'user', content: '<image>请提取画面中的主要物体和场景。' }, { role: 'assistant', content: '画面中心为电子产品，整体为商品展示场景。' }] },
        is_annotated: true,
      },
    ],
  },
  {
    id: 99021,
    task_name: '演示-图像生成Prompt补充标注',
    dataset_type: 'image-generation',
    training_method_type: 'sft',
    dataset_format: 'image-prompt',
    total_samples: 3,
    saved_count: 1,
    assigned_count: 3,
    created_by: 'showcase_admin',
    created_at: now,
    source_dataset_name: '训练数据集/showcase-图像生成SFT-未标注素材-V1',
    submit_dataset_name: '训练数据集/showcase-图像生成SFT-未标注素材-V2',
    task_type: 'online',
    status: 'in_progress',
    items: [
      {
        raw_data: {
          prompt: '',
          negative_prompt: '',
          images: [demoImages.igMaterial],
          metadata: { source: 'unannotated-material' },
        },
        annotation: null,
        is_annotated: false,
      },
      {
        raw_data: {
          prompt: '家居场景中的智能门锁商品图，金属质感，浅色背景',
          negative_prompt: '模糊、过曝、文字乱码',
          images: [demoImages.igProduct],
          metadata: { style: 'product', scene: 'smart-home' },
        },
        annotation: { prompt: '现代家居门板上的智能门锁商品图，干净构图，金属拉丝质感，适合电商主图', negative_prompt: '低清晰度、过曝、变形', metadata: { style: 'product', scene: 'smart-home', reviewed: true } },
        is_annotated: true,
      },
      {
        raw_data: {
          prompt: '',
          negative_prompt: '',
          images: [demoImages.igPoster],
          metadata: {},
        },
        annotation: null,
        is_annotated: false,
      },
    ],
  },
]

export const isPreviewLabelTaskId = (taskId?: number) => demoTasks.some((task) => task.id === taskId)

export function previewLabelTaskList(params: GetLabelTasksParams) {
  const page = params.page ?? 1
  const size = params.size ?? 10
  const filtered = demoTasks.filter((task) => {
    const matchType = !params.dataset_type || task.dataset_type === params.dataset_type
    const matchTaskType = !params.task_type || task.task_type === params.task_type
    const matchName = !params.task_name || task.task_name.toLowerCase().includes(params.task_name.toLowerCase())
    return matchType && matchTaskType && matchName
  })
  return {
    items: filtered.slice((page - 1) * size, page * size).map(({ items: _items, base_url: _baseUrl, ...task }) => task),
    total: filtered.length,
    page,
    size,
    pages: Math.max(1, Math.ceil(filtered.length / size)),
  }
}

export function mergePreviewLabelTaskList(source: any, params: GetLabelTasksParams) {
  const preview = previewLabelTaskList({ ...params, page: 1, size: 999 })
  const existingIds = new Set((source?.items || []).map((item: any) => item.id))
  const mergedItems = [
    ...(source?.items || []),
    ...preview.items.filter((item: any) => !existingIds.has(item.id)),
  ]
  const page = params.page ?? source?.page ?? 1
  const size = params.size ?? source?.size ?? 10
  return {
    ...(source || {}),
    items: mergedItems.slice((page - 1) * size, page * size),
    total: Math.max(source?.total || 0, mergedItems.length),
    page,
    size,
    pages: Math.max(1, Math.ceil(mergedItems.length / size)),
  }
}

export function previewLabelTaskData(taskId: number, params: GetLabelTaskDataParams) {
  const task = demoTasks.find((item) => item.id === taskId)
  if (!task) return null
  const filtered = task.items.filter((item) => {
    if (params.is_annotated == null) return true
    return Boolean(item.is_annotated) === params.is_annotated
  })
  const page = params.page ?? 1
  const size = params.size ?? 1
  const item = filtered[(page - 1) * size]
  return {
    items: item
      ? {
          item_id: String((page - 1) * size + 1),
          row_number: (page - 1) * size + 1,
          raw_data: item.raw_data,
          annotation: item.annotation ?? null,
          is_annotated: Boolean(item.is_annotated),
          training_method_type: task.training_method_type,
          dataset_format: task.dataset_format,
        }
      : {
          item_id: '',
          row_number: 0,
          raw_data: {},
          annotation: null,
          is_annotated: false,
        },
    total: filtered.length,
    page,
    size,
    total_pages: Math.max(1, Math.ceil(filtered.length / size)),
    training_method_type: task.training_method_type,
    dataset_format: task.dataset_format,
    base_url: task.base_url || '',
  }
}

export function previewLabelCompletionStatus(taskId: number) {
  const task = demoTasks.find((item) => item.id === taskId)
  if (!task) {
    return { task_id: taskId, is_completed: false, is_submitted: false, saved_count: 0, total_samples: 0 }
  }
  return {
    task_id: taskId,
    is_completed: task.saved_count >= task.total_samples,
    is_submitted: task.status === 'completed' || task.status === 'published',
    saved_count: task.saved_count,
    total_samples: task.total_samples,
  }
}
