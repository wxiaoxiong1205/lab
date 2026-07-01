import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { mockMenuData } from '@/mock/mockMenuData'
import {
  previewBaseModelList,
  previewKubernetesClusters,
  previewProjectList,
  previewTenantAdminUser,
} from '@/mock/localPreviewData'
import {
  previewTrainingDatasetDetail,
  previewTrainingDatasetList,
  previewTrainingDatasetPreview,
} from '@/mock/previewTrainingDatasets'

const now = '2026-06-30T10:00:00+08:00'

type Page<T> = {
  items: T[]
  total: number
  page: number
  size: number
}

type StaticHandler = (context: StaticRequestContext) => unknown

interface StaticRequestContext {
  method: string
  path: string
  params: Record<string, any>
  body: any
}

const pageOf = <T>(items: T[], page = 1, size = 10): Page<T> => ({
  items: items.slice((page - 1) * size, page * size),
  total: items.length,
  page,
  size,
})

const ok = (data: unknown, config: InternalAxiosRequestConfig): AxiosResponse => ({
  data,
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
  request: {},
})

const asNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const parseBody = (data: unknown) => {
  if (typeof data !== 'string') {
    return data
  }
  try {
    return JSON.parse(data)
  }
  catch {
    return data
  }
}

const demoImage = (title: string, subtitle: string, from: string, to: string) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${from}" />
          <stop offset="100%" stop-color="${to}" />
        </linearGradient>
      </defs>
      <rect width="640" height="420" rx="28" fill="url(#bg)" />
      <rect x="62" y="78" width="516" height="264" rx="28" fill="rgba(255,255,255,0.28)" stroke="rgba(255,255,255,0.55)" />
      <circle cx="510" cy="110" r="70" fill="rgba(255,255,255,0.18)" />
      <circle cx="126" cy="326" r="82" fill="rgba(255,255,255,0.14)" />
      <text x="320" y="194" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff">${title}</text>
      <text x="320" y="244" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="rgba(255,255,255,0.9)">${subtitle}</text>
    </svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

const demoImages = {
  poster: demoImage('图像生成', '电商活动海报', '#f97316', '#ec4899'),
  product: demoImage('图像生成', '商品白底图', '#0f766e', '#84cc16'),
  interior: demoImage('图像生成', '室内设计效果', '#4f46e5', '#06b6d4'),
  character: demoImage('图像生成', '角色插画', '#7c3aed', '#f59e0b'),
  vision: demoImage('图像理解', '商品质检图', '#2563eb', '#14b8a6'),
}

const normalizePath = (url?: string) => {
  const parsed = new URL(url || '/', 'https://showcase.local')
  let path = parsed.pathname.replace(/^\/lab-backend/, '').replace(/^\/api\/v1/, '')
  if (!path.startsWith('/')) {
    path = `/${path}`
  }
  return { path, searchParams: parsed.searchParams }
}

const mergeParams = (config: InternalAxiosRequestConfig) => {
  const { searchParams } = normalizePath(config.url)
  const params: Record<string, any> = {}
  searchParams.forEach((value, key) => {
    params[key] = value
  })
  if (config.params && typeof config.params === 'object') {
    Object.assign(params, config.params)
  }
  return params
}

const taskPage = [
  {
    id: 7101,
    task_id: 7101,
    name: 'showcase-客服语料清洗成功',
    task_name: 'showcase-客服语料清洗成功',
    status: 'SUCCESS',
    status_display: '已完成',
    project_id: 1001,
    dataset_name: 'showcase-客服SFT多状态数据',
    source_dataset_name: 'showcase-客服SFT多状态数据',
    target_dataset_name: 'showcase-清洗后客服SFT',
    operator_count: 4,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
  {
    id: 7102,
    task_id: 7102,
    name: 'showcase-敏感词清洗运行中',
    task_name: 'showcase-敏感词清洗运行中',
    status: 'RUNNING',
    status_display: '运行中',
    project_id: 1001,
    dataset_name: 'showcase-多轮对话洞察SFT',
    source_dataset_name: 'showcase-多轮对话洞察SFT',
    target_dataset_name: 'showcase-敏感词清洗结果',
    operator_count: 2,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
  {
    id: 7103,
    task_id: 7103,
    name: 'showcase-格式校验失败',
    task_name: 'showcase-格式校验失败',
    status: 'FAILED',
    status_display: '失败',
    project_id: 1001,
    dataset_name: 'showcase-来源展示与单条删除',
    source_dataset_name: 'showcase-来源展示与单条删除',
    target_dataset_name: 'showcase-格式校验失败结果',
    error_message: '演示：输入样本缺少 response 字段',
    operator_count: 1,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
  {
    id: 7104,
    task_id: 7104,
    name: 'showcase-图像生成描述字段清洗',
    task_name: 'showcase-图像生成描述字段清洗',
    status: 'PENDING',
    status_display: '排队中',
    project_id: 1001,
    dataset_name: 'showcase-图像生成海报SFT',
    source_dataset_name: 'showcase-图像生成海报SFT',
    target_dataset_name: 'showcase-图像生成描述清洗结果',
    operator_count: 3,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
  {
    id: 7105,
    task_id: 7105,
    name: 'showcase-DPO偏好数据脱敏清洗',
    task_name: 'showcase-DPO偏好数据脱敏清洗',
    status: 'SUCCESS',
    status_display: '已完成',
    project_id: 1001,
    dataset_name: 'showcase-DPO客服偏好数据',
    source_dataset_name: 'showcase-DPO客服偏好数据',
    target_dataset_name: 'showcase-DPO偏好脱敏结果',
    operator_count: 5,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
]

const trainingTasks = [
  {
    id: 7201,
    task_id: 7201,
    name: 'showcase-Qwen客服SFT成功',
    task_name: 'showcase-Qwen客服SFT成功',
    version: 'V3',
    version_count: 3,
    status: 'SUCCESS',
    status_display: '已完成',
    training_type: 'text-generation',
    training_type_category: 'text-generation',
    model_name: 'Qwen2.5-7B-Instruct',
    base_model_name: 'Qwen2.5-7B-Instruct',
    dataset_name: 'showcase-客服SFT多状态数据',
    training_method_type: 'sft',
    project_id: 1001,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
  {
    id: 7202,
    task_id: 7202,
    name: 'showcase-多轮对话训练运行中',
    task_name: 'showcase-多轮对话训练运行中',
    version: 'V1',
    version_count: 1,
    status: 'RUNNING',
    status_display: '运行中',
    training_type: 'text-generation',
    training_type_category: 'text-generation',
    model_name: 'Qwen2.5-7B-Instruct',
    base_model_name: 'Qwen2.5-7B-Instruct',
    dataset_name: 'showcase-多轮对话洞察SFT',
    training_method_type: 'sft',
    project_id: 1001,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
  {
    id: 7203,
    task_id: 7203,
    name: 'showcase-DPO偏好对齐完成',
    task_name: 'showcase-DPO偏好对齐完成',
    version: 'V1',
    version_count: 1,
    status: 'SUCCESS',
    status_display: '已完成',
    training_type: 'text-generation',
    training_type_category: 'text-generation',
    model_name: 'Qwen2.5-7B-Instruct-DPO',
    base_model_name: 'Qwen2.5-7B-Instruct',
    dataset_name: 'showcase-DPO客服偏好数据',
    training_method_type: 'dpo',
    project_id: 1001,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
  {
    id: 7204,
    task_id: 7204,
    name: 'showcase-GRPO数学推理失败',
    task_name: 'showcase-GRPO数学推理失败',
    version: 'V1',
    version_count: 1,
    status: 'FAILED',
    status_display: '失败',
    training_type: 'text-generation',
    training_type_category: 'text-generation',
    model_name: 'Qwen2.5-7B-Instruct-GRPO',
    base_model_name: 'Qwen2.5-7B-Instruct',
    dataset_name: 'showcase-GRPO推理奖励数据',
    training_method_type: 'grpo',
    error_message: '演示：奖励函数返回格式不符合约束',
    project_id: 1001,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
  {
    id: 7205,
    task_id: 7205,
    name: 'showcase-图像生成SFT训练完成',
    task_name: 'showcase-图像生成SFT训练完成',
    version: 'V2',
    version_count: 2,
    status: 'SUCCESS',
    status_display: '已完成',
    model_name: 'showcase-imagegen-sft-poster',
    base_model_name: 'Stable-Diffusion-XL',
    dataset_name: 'showcase-图像生成海报SFT',
    training_type: 'image-generation',
    training_type_category: 'image-generation',
    training_method_type: 'sft',
    dataset_format: 'image-prompt',
    project_id: 1001,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
]

const trainingTaskSummaries = trainingTasks.map((task) => ({
  ...task,
  training_type_category: task.training_type_category || task.training_type || 'text-generation',
  version_count: task.version_count || 1,
}))

const trainingStatusForDetail = (status?: string, display?: string) => {
  const value = String(display || status || '')
  const normalized = String(status || '').toUpperCase()
  if (value.includes('运行中') || normalized === 'RUNNING')
    return '运行中'
  if (value.includes('失败') || normalized === 'FAILED')
    return '失败'
  if (value.includes('排队') || normalized === 'QUEUED')
    return '排队中'
  if (value.includes('启动') || normalized === 'STARTING')
    return '启动中'
  if (value.includes('定时') || normalized === 'SCHEDULED')
    return '定时待启动'
  if (value.includes('完成') || normalized === 'SUCCESS' || normalized === 'COMPLETED')
    return '已完成'
  return value || '已创建'
}

const trainingDatasetItem = (name: string, version: string, sampleCount: number, characterCount: number, weight = 100, samplingRate = 1) => ({
  name,
  version,
  dataset_path: `/showcase/datasets/${name}/${version}`,
  sample_count: sampleCount,
  character_count: characterCount,
  weight_in_total: weight,
  sampling_rate: samplingRate,
})

const defaultTrainingBasic = {
  learning_rate: 0.00002,
  num_train_epochs: 3,
  per_device_train_batch_size: 4,
  gradient_accumulation_steps: 4,
  warmup_ratio: 0.03,
  lr_scheduler_type: 'cosine',
  bf16: true,
}

const defaultTrainingAdvanced = {
  max_seq_length: 4096,
  save_steps: 200,
  logging_steps: 10,
  eval_steps: 100,
  gradient_checkpointing: true,
}

const defaultGraphicsCardResource = {
  card_type: 'NVIDIA',
  card_model: 'A800',
  count: 2,
  cpu_request: 16,
  cpu_limit: 32,
  memory_request: 128,
  memory_limit: 256,
}

const makeTrainingVersion = (
  task: typeof trainingTaskSummaries[number],
  override: Record<string, any>,
) => {
  const method = override.training_method_type || task.training_method_type || 'sft'
  const category = override.training_type_category || task.training_type_category || task.training_type || 'text-generation'
  return {
    id: override.id,
    task_id: override.id,
    name: task.task_name,
    task_name: task.task_name,
    version: override.version,
    description: override.description || (task as any).description || `${task.task_name} ${override.version} 演示版本`,
    status: override.status || trainingStatusForDetail(task.status, task.status_display),
    progress: override.progress ?? (trainingStatusForDetail(task.status, task.status_display) === '运行中' ? 68 : 100),
    project_id: task.project_id,
    created_at: override.created_at || task.created_at,
    updated_at: override.updated_at || task.updated_at,
    started_at: override.started_at,
    finished_at: override.finished_at,
    schedule_at: override.schedule_at,
    estimated_duration: override.estimated_duration ?? 0,
    created_by: task.created_by || 'showcase_admin',
    dataset_name: override.dataset_name || task.dataset_name,
    model_output_path: override.model_output_path || `/showcase/models/${task.task_name}/${override.version}`,
    deepspeed: override.deepspeed || 'ZeRO-2',
    base_model: {
      base_model_name: override.base_model_name || task.base_model_name || task.model_name,
      template: override.template || 'qwen-chat',
    },
    training_type: {
      train_type_category: category,
      train_method_type: method,
      training_method_type: method,
      fine_tuning_type: override.fine_tuning_type || (method === 'sft' ? 'lora' : 'full'),
    },
    graphics_card_resource: override.graphics_card_resource || defaultGraphicsCardResource,
    ray_resource_config: override.ray_resource_config,
    dataset_items: override.dataset_items || [trainingDatasetItem(task.dataset_name || 'showcase-训练数据集', 'V1', 2400, 386000)],
    eval_dataset_items: override.eval_dataset_items || [],
    effective_evaluation_items: override.effective_evaluation_items || [trainingDatasetItem(`${task.dataset_name || 'showcase-训练数据集'}-验证抽样`, 'auto', 240, 38200, 10, 0.1)],
    basic: override.basic || defaultTrainingBasic,
    advanced: override.advanced || defaultTrainingAdvanced,
    data_processing: override.data_processing || { max_prompt_length: 2048, max_response_length: 2048, truncation: 'right' },
    lora_config: override.lora_config || (method === 'sft'
      ? { lora_rank: 16, lora_alpha: 32, lora_dropout: 0.05, target_modules: 'q_proj,v_proj,k_proj,o_proj' }
      : undefined),
    dpo_config: override.dpo_config,
    save: override.save || { save_strategy: 'steps', save_total_limit: 3 },
    evaluation: override.evaluation || { eval_strategy: 'steps', eval_steps: 100, eval_split_ratio: 0.1 },
    monitor: override.monitor || { report_to: 'mlflow', logging_steps: 10 },
    additional_params: override.additional_params || {},
    error_message: override.error_message || task.error_message,
  }
}

const trainingTaskVersions = trainingTaskSummaries.flatMap((task) => {
  const baseCreated = task.created_at || now
  switch (task.task_name) {
    case 'showcase-Qwen客服SFT成功':
      return [
        makeTrainingVersion(task, {
          id: 17201,
          version: 'V3',
          status: '已完成',
          description: '引入数据洞察筛选后的客服问答样本，优化拒答边界和售后多轮承接。',
          created_at: baseCreated,
          started_at: '2026-06-30T10:10:00+08:00',
          finished_at: '2026-06-30T12:48:00+08:00',
          estimated_duration: 9480,
          dataset_items: [
            trainingDatasetItem('showcase-客服SFT多状态数据', 'V3', 3680, 592400, 80),
            trainingDatasetItem('showcase-多轮对话洞察SFT', 'V2', 920, 186200, 20),
          ],
        }),
        makeTrainingVersion(task, {
          id: 17202,
          version: 'V2',
          status: '已完成',
          description: '补充物流、退款、地址修改等高频场景增强样本。',
          created_at: '2026-06-28T14:20:00+08:00',
          started_at: '2026-06-28T14:30:00+08:00',
          finished_at: '2026-06-28T16:12:00+08:00',
          estimated_duration: 6120,
          dataset_items: [trainingDatasetItem('showcase-客服SFT多状态数据', 'V2', 2860, 451000)],
        }),
        makeTrainingVersion(task, {
          id: 17203,
          version: 'V1',
          status: '已完成',
          description: '客服问答基础 SFT 版本，用于演示训练详情、指标、日志和产物。',
          created_at: '2026-06-25T09:00:00+08:00',
          started_at: '2026-06-25T09:20:00+08:00',
          finished_at: '2026-06-25T10:55:00+08:00',
          estimated_duration: 5700,
          dataset_items: [trainingDatasetItem('showcase-客服SFT多状态数据', 'V1', 2100, 326000)],
        }),
      ]
    case 'showcase-多轮对话训练运行中':
      return [makeTrainingVersion(task, {
        id: 17211,
        version: 'V1',
        status: '运行中',
        progress: 72,
        description: '多轮客服会话训练中，覆盖第 1/2 轮 User 与 Assistant 响应稳定性。',
        started_at: '2026-06-30T09:40:00+08:00',
        estimated_duration: 0,
        dataset_items: [trainingDatasetItem('showcase-多轮对话洞察SFT', 'V2', 1480, 408000)],
      })]
    case 'showcase-DPO偏好对齐完成':
      return [makeTrainingVersion(task, {
        id: 17221,
        version: 'V1',
        status: '已完成',
        training_method_type: 'dpo',
        fine_tuning_type: 'full',
        description: '使用客服偏好对数据完成 DPO 对齐，提升答案完整度与拒答一致性。',
        started_at: '2026-06-29T13:00:00+08:00',
        finished_at: '2026-06-29T15:20:00+08:00',
        estimated_duration: 8400,
        dataset_items: [trainingDatasetItem('showcase-DPO客服偏好数据', 'V1', 1260, 298000)],
        dpo_config: { beta: 0.1, loss_type: 'sigmoid', max_prompt_length: 2048, max_length: 4096 },
        lora_config: undefined,
      })]
    case 'showcase-GRPO数学推理失败':
      return [makeTrainingVersion(task, {
        id: 17231,
        version: 'V1',
        status: '失败',
        training_method_type: 'grpo',
        fine_tuning_type: 'full',
        description: 'GRPO 数学推理奖励函数演示任务，失败态用于验证异常展示。',
        started_at: '2026-06-29T16:10:00+08:00',
        finished_at: '2026-06-29T16:36:00+08:00',
        estimated_duration: 1560,
        dataset_items: [trainingDatasetItem('showcase-GRPO推理奖励数据', 'V1', 640, 174000)],
        lora_config: undefined,
        ray_resource_config: {
          submit_graphics_card_resource: { ...defaultGraphicsCardResource, count: 1 },
          head_graphics_card_resource: { ...defaultGraphicsCardResource, count: 1 },
          worker_graphics_card_resource: { ...defaultGraphicsCardResource, count: 4 },
          worker_replicas: 2,
        },
        additional_params: {
          'data.train_batch_size': 128,
          'actor_rollout_ref.rollout.n': 8,
          'algorithm.adv_estimator': 'grpo',
          'reward.score_clip': 5,
          'trainer.total_epochs': 1,
        },
        error_message: '奖励函数返回格式不符合约束，请检查 score 字段。',
      })]
    case 'showcase-图像生成SFT训练完成':
      return [
        makeTrainingVersion(task, {
          id: 17241,
          version: 'V2',
          status: '已完成',
          training_type_category: 'image-generation',
          description: '图像生成海报 Prompt 数据 SFT 版本，覆盖电商海报、商品白底图和室内设计场景。',
          started_at: '2026-06-30T08:30:00+08:00',
          finished_at: '2026-06-30T11:05:00+08:00',
          estimated_duration: 9300,
          base_model_name: 'Stable-Diffusion-XL',
          template: 'image-prompt',
          dataset_items: [trainingDatasetItem('showcase-图像生成海报SFT', 'V2', 820, 98000)],
          basic: {
            learning_rate: 0.00001,
            num_train_epochs: 4,
            per_device_train_batch_size: 2,
            gradient_accumulation_steps: 8,
            resolution: 1024,
            noise_scheduler: 'ddpm',
            bf16: true,
          },
          advanced: {
            train_text_encoder: false,
            center_crop: true,
            random_flip: true,
            checkpointing_steps: 250,
          },
        }),
        makeTrainingVersion(task, {
          id: 17242,
          version: 'V1',
          status: '已完成',
          training_type_category: 'image-generation',
          description: '图像生成 SFT 首版，验证 image-prompt ZIP 数据链路。',
          started_at: '2026-06-27T10:00:00+08:00',
          finished_at: '2026-06-27T12:10:00+08:00',
          estimated_duration: 7800,
          base_model_name: 'Stable-Diffusion-XL',
          dataset_items: [trainingDatasetItem('showcase-图像生成海报SFT', 'V1', 560, 67200)],
        }),
      ]
    default:
      return [makeTrainingVersion(task, {
        id: Number(task.id) + 10000,
        version: task.version || 'V1',
        status: trainingStatusForDetail(task.status, task.status_display),
      })]
  }
})

const trainedModels = [
  {
    id: 7251,
    model_name: 'showcase-Qwen客服SFT成功',
    name: 'showcase-Qwen客服SFT成功',
    model_type: 'text-generation',
    base_model_name: 'Qwen2.5-7B-Instruct',
    version_count: 3,
    latest_version: 'V3',
    status: '已完成',
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
  {
    id: 7252,
    model_name: 'showcase-多轮对话训练运行中',
    name: 'showcase-多轮对话训练运行中',
    model_type: 'text-generation',
    base_model_name: 'Qwen2.5-7B-Instruct',
    version_count: 1,
    latest_version: 'V1',
    status: '运行中',
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
  {
    id: 7253,
    model_name: 'showcase-图像生成SFT训练完成',
    name: 'showcase-图像生成SFT训练完成',
    model_type: 'image-generation',
    base_model_name: 'Stable-Diffusion-XL',
    version_count: 2,
    latest_version: 'V2',
    status: '已完成',
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
  {
    id: 7254,
    model_name: 'showcase-DPO偏好对齐完成',
    name: 'showcase-DPO偏好对齐完成',
    model_type: 'text-generation',
    base_model_name: 'Qwen2.5-7B-Instruct',
    version_count: 1,
    latest_version: 'V1',
    status: '已完成',
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
]

const notebooks = [
  {
    id: 7301,
    notebook_id: 7301,
    name: 'showcase-数据探索Notebook',
    notebook_name: 'showcase-数据探索Notebook',
    instance_name: 'showcase-数据探索Notebook',
    status: 'running',
    status_display: '运行中',
    image: 'harbor-preview.example.local/deepexilab/pytorch:2.3-cuda12.1',
    cpu: 8,
    memory: 32,
    gpu: 1,
    project_id: 1001,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
  {
    id: 7302,
    notebook_id: 7302,
    name: 'showcase-模型评估Notebook',
    notebook_name: 'showcase-模型评估Notebook',
    instance_name: 'showcase-模型评估Notebook',
    status: 'stopped',
    status_display: '已停止',
    image: 'harbor-preview.example.local/deepexilab/pytorch:2.3-cuda12.1',
    cpu: 4,
    memory: 16,
    gpu: 0,
    project_id: 1001,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
  {
    id: 7303,
    notebook_id: 7303,
    name: 'showcase-SFT训练案例Notebook',
    notebook_name: 'showcase-SFT训练案例Notebook',
    instance_name: 'showcase-SFT训练案例Notebook',
    status: 'starting',
    status_display: '启动中',
    image: 'harbor-preview.example.local/deepexilab/llm-train:cuda12.1',
    cpu: 16,
    memory: 64,
    gpu: 2,
    biz_type: 'llm',
    category: '模型训练',
    project_id: 1001,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
  {
    id: 7304,
    notebook_id: 7304,
    name: 'showcase-DPO偏好数据处理案例',
    notebook_name: 'showcase-DPO偏好数据处理案例',
    instance_name: 'showcase-DPO偏好数据处理案例',
    status: 'running',
    status_display: '运行中',
    image: 'harbor-preview.example.local/deepexilab/llm-data:py310',
    cpu: 8,
    memory: 32,
    gpu: 0,
    biz_type: 'llm',
    category: '数据处理',
    project_id: 1001,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
  {
    id: 7305,
    notebook_id: 7305,
    name: 'showcase-GRPO奖励函数调试案例',
    notebook_name: 'showcase-GRPO奖励函数调试案例',
    instance_name: 'showcase-GRPO奖励函数调试案例',
    status: 'failed',
    status_display: '启动失败',
    image: 'harbor-preview.example.local/deepexilab/llm-rl:py310',
    cpu: 12,
    memory: 48,
    gpu: 1,
    biz_type: 'llm',
    category: '模型训练',
    error_message: '演示：镜像拉取超时',
    project_id: 1001,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
]

const inferenceResultDatasets = [
  {
    id: 7401,
    dataset_id: 7401,
    name: 'showcase-客服问答推理结果',
    dataset_name: 'showcase-客服问答推理结果',
    status: 'completed',
    status_display: '已完成',
    dataset_type: 'text-generation',
    usage: 'inference',
    source_dataset_name: 'showcase-客服SFT多状态数据',
    sample_count: 320,
    created_at: now,
    updated_at: now,
  },
  {
    id: 7402,
    dataset_id: 7402,
    name: 'showcase-业务规则推理结果',
    dataset_name: 'showcase-业务规则推理结果',
    status: 'running',
    status_display: '生成中',
    dataset_type: 'text-generation',
    usage: 'business-inference',
    source_dataset_name: 'showcase-业务测试集',
    sample_count: 160,
    created_at: now,
    updated_at: now,
  },
  {
    id: 7403,
    dataset_id: 7403,
    name: 'showcase-图像理解质检推理结果',
    dataset_name: 'showcase-图像理解质检推理结果',
    status: 'completed',
    status_display: '已完成',
    dataset_type: 'image-understanding',
    dataset_format: 'role-based',
    usage: 'inference',
    source_dataset_name: 'showcase-商品质检图像理解集',
    model_name: 'Qwen2.5-VL-7B-Instruct',
    sample_count: 96,
    preview_images: [demoImages.vision],
    created_at: now,
    updated_at: now,
  },
  {
    id: 7404,
    dataset_id: 7404,
    name: 'showcase-图像生成海报推理结果',
    dataset_name: 'showcase-图像生成海报推理结果',
    status: 'completed',
    status_display: '已完成',
    dataset_type: 'image-generation',
    dataset_format: 'image-prompt',
    usage: 'default-inference',
    source_dataset_name: 'showcase-图像生成海报SFT',
    model_name: 'showcase-imagegen-sft-poster',
    sample_count: 72,
    reference_images: [demoImages.poster, demoImages.product],
    generated_images: [demoImages.poster, demoImages.interior],
    created_at: now,
    updated_at: now,
  },
  {
    id: 7405,
    dataset_id: 7405,
    name: 'showcase-包装视觉推理失败集',
    dataset_name: 'showcase-包装视觉推理失败集',
    status: 'failed',
    status_display: '失败',
    dataset_type: 'image-generation',
    dataset_format: 'image-prompt',
    usage: 'default-inference',
    source_dataset_name: 'showcase-图像生成包装SFT',
    model_name: 'showcase-imagegen-sft-poster',
    sample_count: 18,
    error_message: '演示：部分图片生成超时',
    generated_images: [demoImages.character],
    created_at: now,
    updated_at: now,
  },
]

const evaluationTasks = [
  {
    id: 7501,
    task_id: 7501,
    name: 'showcase-客服模型效果评估',
    task_name: 'showcase-客服模型效果评估',
    status: '已完成',
    status_display: '已完成',
    data_source: 'existing',
    dataset_type: 'text-generation',
    evaluation_type: 'auto',
    evaluation_method: 'referee',
    dataset_name: 'showcase-客服问答推理结果',
    inference_result_dataset_names: ['showcase-客服问答推理结果'],
    model_name: 'showcase-Qwen客服SFT成功',
    evaluated_model_names: ['showcase-Qwen客服SFT成功'],
    score: 0.87,
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
  {
    id: 7502,
    task_id: 7502,
    name: 'showcase-失败样本专项评估',
    task_name: 'showcase-失败样本专项评估',
    status: '运行中',
    status_display: '评估中',
    data_source: 'existing',
    dataset_type: 'text-generation',
    evaluation_type: 'auto',
    evaluation_method: 'referee',
    dataset_name: 'showcase-业务规则推理结果',
    inference_result_dataset_names: ['showcase-业务规则推理结果'],
    model_name: 'Qwen2.5-7B-Instruct',
    evaluated_model_names: ['Qwen2.5-7B-Instruct'],
    score: null,
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
  {
    id: 7503,
    task_id: 7503,
    name: 'showcase-图像生成海报裁判员评估',
    task_name: 'showcase-图像生成海报裁判员评估',
    status: '已完成',
    status_display: '已完成',
    data_source: 'existing',
    evaluation_type: 'auto',
    evaluation_method: 'referee',
    dataset_type: 'image-generation',
    dataset_format: 'image-prompt',
    dataset_name: 'showcase-图像生成海报推理结果',
    inference_result_dataset_names: ['showcase-图像生成海报推理结果'],
    model_name: 'showcase-imagegen-sft-poster',
    evaluated_model_names: ['showcase-imagegen-sft-poster'],
    metrics: ['提示词匹配度', '画面质量', '细节一致性', '安全合规'],
    score: 0.82,
    generated_images: [demoImages.poster, demoImages.product],
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
  {
    id: 7504,
    task_id: 7504,
    name: 'showcase-图像生成室内设计人工评估',
    task_name: 'showcase-图像生成室内设计人工评估',
    status: '运行中',
    status_display: '评估中',
    data_source: 'existing',
    evaluation_type: 'manual',
    dataset_type: 'image-generation',
    dataset_format: 'image-prompt',
    dataset_name: 'showcase-图像生成室内场景结果',
    inference_result_dataset_names: ['showcase-图像生成室内场景结果'],
    model_name: 'showcase-imagegen-sft-poster',
    evaluated_model_names: ['showcase-imagegen-sft-poster'],
    metrics: ['空间合理性', '材质一致性', '提示词匹配度', '安全合规'],
    score: null,
    generated_images: [demoImages.interior],
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
  {
    id: 7505,
    task_id: 7505,
    name: 'showcase-图像生成包装视觉评估失败',
    task_name: 'showcase-图像生成包装视觉评估失败',
    status: '失败',
    status_display: '失败',
    data_source: 'existing',
    evaluation_type: 'auto',
    evaluation_method: 'referee',
    dataset_type: 'image-generation',
    dataset_format: 'image-prompt',
    dataset_name: 'showcase-包装视觉推理失败集',
    inference_result_dataset_names: ['showcase-包装视觉推理失败集'],
    model_name: 'showcase-imagegen-sft-poster',
    evaluated_model_names: ['showcase-imagegen-sft-poster'],
    score: null,
    error_message: '演示：推理结果集中存在不可读取图片',
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
]

const manualEvaluationTasks = [
  {
    id: 7561,
    task_id: 7561,
    name: 'showcase-客服答案人工评估',
    task_name: 'showcase-客服答案人工评估',
    status: '已完成',
    status_display: '已完成',
    data_source: 'existing',
    evaluation_type: 'manual',
    dataset_type: 'text-generation',
    dataset_name: 'showcase-客服问答推理结果',
    inference_result_dataset_names: ['showcase-客服问答推理结果'],
    model_name: 'showcase-Qwen客服SFT成功',
    evaluated_model_names: ['showcase-Qwen客服SFT成功'],
    progress: 100,
    project_id: 1001,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
  {
    id: 7562,
    task_id: 7562,
    name: 'showcase-图像理解质检人工评估',
    task_name: 'showcase-图像理解质检人工评估',
    status: '运行中',
    status_display: '评估中',
    data_source: 'existing',
    evaluation_type: 'manual',
    dataset_type: 'image-understanding',
    dataset_format: 'role-based',
    dataset_name: 'showcase-图像理解质检推理结果',
    inference_result_dataset_names: ['showcase-图像理解质检推理结果'],
    model_name: 'Qwen2.5-VL-7B-Instruct',
    evaluated_model_names: ['Qwen2.5-VL-7B-Instruct'],
    progress: 62,
    project_id: 1001,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
  {
    id: 7563,
    task_id: 7563,
    name: 'showcase-图像生成海报人工评估',
    task_name: 'showcase-图像生成海报人工评估',
    status: '已完成',
    status_display: '已完成',
    data_source: 'existing',
    evaluation_type: 'manual',
    dataset_type: 'image-generation',
    dataset_format: 'image-prompt',
    dataset_name: 'showcase-图像生成海报推理结果',
    inference_result_dataset_names: ['showcase-图像生成海报推理结果'],
    model_name: 'showcase-imagegen-sft-poster',
    evaluated_model_names: ['showcase-imagegen-sft-poster'],
    progress: 100,
    generated_images: [demoImages.poster, demoImages.product],
    project_id: 1001,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
  {
    id: 7564,
    task_id: 7564,
    name: 'showcase-图像生成包装视觉人工评估',
    task_name: 'showcase-图像生成包装视觉人工评估',
    status: '失败',
    status_display: '失败',
    data_source: 'existing',
    evaluation_type: 'manual',
    dataset_type: 'image-generation',
    dataset_format: 'image-prompt',
    dataset_name: 'showcase-包装视觉推理失败集',
    inference_result_dataset_names: ['showcase-包装视觉推理失败集'],
    model_name: 'showcase-imagegen-sft-poster',
    evaluated_model_names: ['showcase-imagegen-sft-poster'],
    progress: 32,
    error_message: '演示：评估样本图片缺失',
    project_id: 1001,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
]

const benchmarkTasks = [
  {
    id: 7551,
    name: 'showcase-Qwen MMLU 基准评估',
    description: '文本生成权威评估集，覆盖知识理解与推理能力。',
    status: '已完成',
    progress: 100,
    model_type: 'model',
    schedule_enabled: false,
    schedule_date: '',
    schedule_time: '',
    models: [
      { id: 1, model_id: 7251, model_name: 'showcase-Qwen客服SFT成功', model_version: 'V3', model_type: 'text-generation', sort_order: 1 },
    ],
    datasets: [
      { id: 1, dataset_id: 1, dataset_name: 'MMLU', dataset_code: 'mmlu' },
      { id: 2, dataset_id: 2, dataset_name: 'C-Eval', dataset_code: 'ceval' },
    ],
    project_id: 1001,
    created_by: 'showcase_admin',
    created_at: now,
    updated_at: now,
    started_at: '2026-06-30T10:12:00+08:00',
    finished_at: '2026-06-30T10:36:00+08:00',
    error_message: '',
  },
  {
    id: 7552,
    name: 'showcase-Qwen HumanEval 基准评估',
    description: '代码生成权威评估集，覆盖 HumanEval 与 MBPP。',
    status: '运行中',
    progress: 64,
    model_type: 'model',
    schedule_enabled: false,
    schedule_date: '',
    schedule_time: '',
    models: [
      { id: 1, model_id: 101, model_name: 'Qwen2.5-7B-Instruct', model_version: 'base', model_type: 'text-generation', sort_order: 1 },
    ],
    datasets: [
      { id: 1, dataset_id: 3, dataset_name: 'HumanEval', dataset_code: 'humaneval' },
      { id: 2, dataset_id: 4, dataset_name: 'MBPP', dataset_code: 'mbpp' },
    ],
    project_id: 1001,
    created_by: 'showcase_admin',
    created_at: now,
    updated_at: now,
    started_at: '2026-06-30T13:24:00+08:00',
    finished_at: '',
    error_message: '',
  },
  {
    id: 7553,
    name: 'showcase-GenEval 图像生成基准评估',
    description: '图像生成权威评估集，评估提示词遵循和组合泛化。',
    status: '已完成',
    progress: 100,
    model_type: 'model',
    schedule_enabled: false,
    schedule_date: '',
    schedule_time: '',
    models: [
      { id: 1, model_id: 7253, model_name: 'showcase-imagegen-sft-poster', model_version: 'V2', model_type: 'image-generation', sort_order: 1 },
    ],
    datasets: [
      { id: 1, dataset_id: 101, dataset_name: 'GenEval', dataset_code: 'geneval' },
      { id: 2, dataset_id: 102, dataset_name: 'DrawBench', dataset_code: 'drawbench' },
      { id: 3, dataset_id: 103, dataset_name: 'PartiPrompts', dataset_code: 'partiprompts' },
    ],
    project_id: 1001,
    created_by: 'showcase_admin',
    created_at: now,
    updated_at: now,
    started_at: '2026-06-29T16:44:00+08:00',
    finished_at: '2026-06-29T17:08:00+08:00',
    error_message: '',
  },
  {
    id: 7554,
    name: 'showcase-DrawBench 图像生成基准评估',
    description: '图像生成组合理解评估，覆盖空间关系、属性绑定和人类偏好。',
    status: '失败',
    progress: 42,
    model_type: 'model',
    schedule_enabled: false,
    schedule_date: '',
    schedule_time: '',
    models: [
      { id: 1, model_id: 7253, model_name: 'showcase-imagegen-sft-poster', model_version: 'V2', model_type: 'image-generation', sort_order: 1 },
    ],
    datasets: [
      { id: 1, dataset_id: 104, dataset_name: 'T2I-CompBench', dataset_code: 't2i_compbench' },
      { id: 2, dataset_id: 105, dataset_name: 'DPG-Bench', dataset_code: 'dpg_bench' },
      { id: 3, dataset_id: 106, dataset_name: 'HPSv2', dataset_code: 'hpsv2' },
    ],
    project_id: 1001,
    created_by: 'showcase_admin',
    created_at: now,
    updated_at: now,
    started_at: '2026-06-28T15:16:00+08:00',
    finished_at: '',
    error_message: '演示：部分评估图片结果缺失，任务终止。',
  },
]

const machineDatasets = [
  {
    id: 7601,
    dataset_id: 7601,
    name: 'showcase-商品图像分类数据集',
    dataset_name: 'showcase-商品图像分类数据集',
    task_type: 'image_classification',
    template_type: 'image',
    publish: 1,
    publish_display: '已发布',
    is_annotated: true,
    sample_count: 1280,
    version: 'V2',
    created_at: now,
    updated_at: now,
  },
  {
    id: 7602,
    dataset_id: 7602,
    name: 'showcase-工单文本分类数据集',
    dataset_name: 'showcase-工单文本分类数据集',
    task_type: 'text_classification',
    template_type: 'text',
    publish: 0,
    publish_display: '未发布',
    is_annotated: false,
    sample_count: 860,
    version: 'V1',
    created_at: now,
    updated_at: now,
  },
  {
    id: 7603,
    dataset_id: 7603,
    name: 'showcase-合同实体识别数据集',
    dataset_name: 'showcase-合同实体识别数据集',
    task_type: 'named_entity_recognition',
    template_type: 'text',
    publish: 1,
    publish_display: '已发布',
    is_annotated: true,
    sample_count: 2350,
    version: 'V3',
    created_at: now,
    updated_at: now,
  },
  {
    id: 7604,
    dataset_id: 7604,
    name: 'showcase-货架物体检测数据集',
    dataset_name: 'showcase-货架物体检测数据集',
    task_type: 'object_detection',
    template_type: 'image',
    publish: 1,
    publish_display: '已发布',
    is_annotated: true,
    sample_count: 640,
    version: 'V2',
    created_at: now,
    updated_at: now,
  },
  {
    id: 7605,
    dataset_id: 7605,
    name: 'showcase-回形零件实例分割孔洞数据',
    dataset_name: 'showcase-回形零件实例分割孔洞数据',
    task_type: 'instance_segmentation_hole',
    template_type: 'image',
    publish: 0,
    publish_display: '未发布',
    is_annotated: false,
    sample_count: 220,
    version: 'V1',
    created_at: now,
    updated_at: now,
  },
  {
    id: 7606,
    dataset_id: 7606,
    name: 'showcase-道路语义分割数据集',
    dataset_name: 'showcase-道路语义分割数据集',
    task_type: 'semantic_segmentation',
    template_type: 'image',
    publish: 2,
    publish_display: '-',
    processing_status: 'pending',
    is_annotated: false,
    sample_count: 180,
    version: 'V1',
    created_at: now,
    updated_at: now,
  },
  {
    id: 7607,
    dataset_id: 7607,
    name: 'showcase-缺陷检测上传失败数据',
    dataset_name: 'showcase-缺陷检测上传失败数据',
    task_type: 'image_classification',
    template_type: 'image',
    publish: 3,
    publish_display: '-',
    processing_status: 'failed',
    processing_error: '演示：压缩包缺少 labels.json',
    is_annotated: false,
    sample_count: 0,
    version: 'V1',
    created_at: now,
    updated_at: now,
  },
]

const inferenceTasks = [
  {
    id: 7701,
    inference_task_id: 7701,
    service_id: 7701,
    name: 'showcase-商品分类在线服务',
    service_name: 'showcase-商品分类在线服务',
    task_name: 'showcase-商品分类在线服务',
    status: '运行中',
    model_source: 'ml_model',
    inference_engine_type: 'ML',
    model_name: 'showcase-resnet50商品分类',
    replicas: 2,
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
  {
    id: 7702,
    inference_task_id: 7702,
    service_id: 7702,
    name: 'showcase-文本分类灰度服务',
    service_name: 'showcase-文本分类灰度服务',
    task_name: 'showcase-文本分类灰度服务',
    status: '部署中',
    model_source: 'ml_model',
    inference_engine_type: 'ML',
    model_name: 'showcase-bert工单分类',
    replicas: 1,
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
  {
    id: 7703,
    inference_task_id: 7703,
    service_id: 7703,
    name: 'showcase-Qwen客服大模型部署',
    service_name: 'showcase-Qwen客服大模型部署',
    task_name: 'showcase-Qwen客服大模型部署',
    status: '运行中',
    model_source: 'trained_model',
    inference_engine_type: 'LLM',
    model_name: 'showcase-Qwen客服SFT成功',
    replicas: 2,
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
  {
    id: 7704,
    inference_task_id: 7704,
    service_id: 7704,
    name: 'showcase-图像生成海报在线服务',
    service_name: 'showcase-图像生成海报在线服务',
    task_name: 'showcase-图像生成海报在线服务',
    status: '运行中',
    model_source: 'trained_model',
    inference_engine_type: 'IMAGE_GENERATION',
    model_name: 'showcase-imagegen-sft-poster',
    replicas: 1,
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
  {
    id: 7705,
    inference_task_id: 7705,
    service_id: 7705,
    name: 'showcase-图像理解质检服务失败',
    service_name: 'showcase-图像理解质检服务失败',
    task_name: 'showcase-图像理解质检服务失败',
    status: '失败',
    model_source: 'base_model',
    inference_engine_type: 'VL',
    model_name: 'Qwen2.5-VL-7B-Instruct',
    replicas: 1,
    error_message: '演示：资源池 GPU 不足',
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
]

const annotationTasks = [
  {
    id: 7801,
    task_id: 7801,
    name: '演示-客服意图标注',
    task_name: '演示-客服意图标注',
    status: 'IN_PROGRESS',
    status_display: '进行中',
    dataset_name: 'showcase-工单文本分类数据集',
    annotated_count: 420,
    total_count: 860,
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
  {
    id: 7802,
    task_id: 7802,
    name: '演示-商品图片标注',
    task_name: '演示-商品图片标注',
    status: 'COMPLETED',
    status_display: '已完成',
    dataset_name: 'showcase-商品图像分类数据集',
    annotated_count: 1280,
    total_count: 1280,
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
  {
    id: 7803,
    task_id: 7803,
    name: '演示-图像理解质检标注',
    task_name: '演示-图像理解质检标注',
    status: 'PENDING_REVIEW',
    status_display: '待审核',
    dataset_type: 'image-understanding',
    dataset_format: 'role-based',
    dataset_name: 'showcase-商品质检图像理解集',
    annotated_count: 86,
    total_count: 120,
    sample_images: [demoImages.vision],
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
  {
    id: 7804,
    task_id: 7804,
    name: '演示-图像生成海报Prompt标注',
    task_name: '演示-图像生成海报Prompt标注',
    status: 'IN_PROGRESS',
    status_display: '进行中',
    dataset_type: 'image-generation',
    dataset_format: 'image-prompt',
    dataset_name: 'showcase-图像生成海报SFT',
    annotated_count: 38,
    total_count: 90,
    sample_images: [demoImages.poster, demoImages.product],
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
  {
    id: 7805,
    task_id: 7805,
    name: '演示-DPO偏好答案标注',
    task_name: '演示-DPO偏好答案标注',
    status: 'COMPLETED',
    status_display: '已完成',
    dataset_type: 'text-generation',
    training_method_type: 'dpo',
    dataset_format: 'dpo-role-based',
    dataset_name: 'showcase-DPO客服偏好数据',
    annotated_count: 320,
    total_count: 320,
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
  {
    id: 7806,
    task_id: 7806,
    name: '演示-零件分割多人标注',
    task_name: '演示-零件分割多人标注',
    status: 'FAILED',
    status_display: '失败',
    dataset_type: 'machine-learning',
    task_type: 'instance_segmentation_hole',
    dataset_name: 'showcase-回形零件实例分割孔洞数据',
    annotated_count: 18,
    total_count: 220,
    error_message: '演示：审核员未配置',
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
]

const insightTasks = [
  {
    id: 91001,
    task_id: 91001,
    name: '客服问答 SFT 数据洞察',
    task_name: '客服问答 SFT 数据洞察',
    status: 'completed',
    status_display: '已完成',
    source_dataset_name: '智能客服问答集合',
    source_dataset_version: 'V1',
    dataset_name: '智能客服问答集合',
    dataset_type: 'text-generation',
    training_method_type: 'sft',
    dataset_format: 'prompt-response',
    result_summary: { total_samples: 8, empty_samples: 0, format_errors: 1, duplicate_samples: 2 },
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
  {
    id: 91002,
    task_id: 91002,
    name: '多轮客服会话质量洞察',
    task_name: '多轮客服会话质量洞察',
    status: 'completed',
    status_display: '已完成',
    source_dataset_name: 'showcase-多轮对话洞察SFT',
    source_dataset_version: 'V2',
    dataset_name: 'showcase-多轮对话洞察SFT',
    dataset_type: 'text-generation',
    training_method_type: 'sft',
    dataset_format: 'role-based',
    result_summary: { total_samples: 5, empty_samples: 3, format_errors: 4, duplicate_samples: 7 },
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
  {
    id: 91003,
    task_id: 91003,
    name: '增强结果重复样本洞察',
    task_name: '增强结果重复样本洞察',
    status: 'running',
    status_display: '运行中',
    source_dataset_name: '训练数据集/showcase-数据增强源SFT-V2',
    source_dataset_version: 'V2',
    dataset_name: '训练数据集/showcase-数据增强源SFT-V2',
    dataset_type: 'text-generation',
    training_method_type: 'sft',
    dataset_format: 'prompt-response',
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
]

const augmentationTasks = [
  {
    id: 92001,
    task_id: 92001,
    name: '电商评论情感增强',
    task_name: '电商评论情感增强',
    status: 'completed',
    status_display: '已完成',
    source_dataset_name: '电商评论情感',
    source_dataset_version: 'V1',
    dataset_name: '电商评论情感',
    output_dataset_name: '电商评论情感增强',
    output_dataset_version: 'V1',
    dataset_type: 'text-generation',
    training_method_type: 'sft',
    dataset_format: 'prompt-response',
    result_summary: { source_samples: 120, generated_prompt_samples: 250, generated_response_samples: 30, total_output_samples: 370 },
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
  {
    id: 92002,
    task_id: 92002,
    name: '客服问答 Prompt 泛化增强',
    task_name: '客服问答 Prompt 泛化增强',
    status: 'running',
    status_display: '运行中',
    source_dataset_name: 'showcase-数据增强源SFT',
    source_dataset_version: 'V1',
    dataset_name: 'showcase-数据增强源SFT',
    output_dataset_name: '训练数据集/showcase-数据增强源SFT-V2',
    output_dataset_version: 'V2',
    dataset_type: 'text-generation',
    training_method_type: 'sft',
    dataset_format: 'prompt-response',
    result_summary: { source_samples: 80, generated_prompt_samples: 126, generated_response_samples: 0, total_output_samples: 206 },
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
  {
    id: 92003,
    task_id: 92003,
    name: '知识库问答 Response 补全',
    task_name: '知识库问答 Response 补全',
    status: 'failed',
    status_display: '失败',
    source_dataset_name: 'showcase-多轮对话洞察SFT',
    source_dataset_version: 'V2',
    dataset_name: 'showcase-多轮对话洞察SFT',
    output_dataset_name: '训练数据集/showcase-多轮对话洞察SFT-V3',
    output_dataset_version: 'V3',
    dataset_type: 'text-generation',
    training_method_type: 'sft',
    dataset_format: 'role-based',
    error_message: '在线推理服务超时，18 条样本已生成，6 条样本失败。',
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
]

const filterByDatasetType = <T extends { dataset_type?: string }>(items: T[], datasetType?: string) => {
  if (!datasetType || datasetType === 'all') {
    return items
  }
  return items.filter((item) => item.dataset_type === datasetType)
}

const filterByTaskTypeParam = <T extends { dataset_type?: string, evaluation_type?: string }>(items: T[], params: Record<string, any>) => {
  const datasetType = params.dataset_type || params.content || params.datasetType
  const evaluationType = params.evaluation_type || params.evaluationType
  return items.filter((item) => {
    const matchDatasetType = !datasetType || item.dataset_type === datasetType
    const matchEvaluationType = !evaluationType || item.evaluation_type === evaluationType
    return matchDatasetType && matchEvaluationType
  })
}

const trainingDatasetStats = {
  usage: [
    { value: 'training', count: 12 },
    { value: 'validation', count: 4 },
    { value: 'test', count: 6 },
  ],
  dataset_type: [
    { value: 'text-generation', count: 10 },
    { value: 'image-understanding', count: 4 },
    { value: 'image-generation', count: 5 },
  ],
  dataset_format: [
    { value: 'prompt-response', count: 5 },
    { value: 'role-based', count: 7 },
    { value: 'image-prompt', count: 5 },
  ],
  attr_option: [
    { name: '业务线', options: [{ value: '客服训练', count: 6 }, { value: '视觉生成', count: 5 }, { value: '效果评估', count: 4 }] },
    { name: '敏感级别', options: [{ value: '内部', count: 12 }, { value: '脱敏', count: 8 }] },
  ],
}

const inferenceResultStats = {
  usage: [
    { value: 'default-inference', count: 4 },
    { value: 'inference', count: 3 },
    { value: 'business-inference', count: 1 },
  ],
  dataset_type: [
    { value: 'text-generation', count: 2 },
    { value: 'image-understanding', count: 1 },
    { value: 'image-generation', count: 2 },
  ],
  dataset_format: [
    { value: 'prompt-response', count: 2 },
    { value: 'role-based', count: 1 },
    { value: 'image-prompt', count: 2 },
  ],
  attr_option: [
    { name: '评估用途', options: [{ value: '自动评估', count: 3 }, { value: '人工评估', count: 3 }, { value: '基准评估', count: 2 }] },
  ],
}

const benchmarkDatasets = [
  { id: 1, name: 'MMLU', code: 'mmlu', language: 'en', description: '多学科知识理解评估集', category: 'knowledge', model_types: ['text-generation'], sort_order: 1, original_sample_count: 14042 },
  { id: 2, name: 'MMLU-Pro', code: 'mmlu_pro', language: 'en', description: '高难度多学科推理评估集', category: 'knowledge', model_types: ['text-generation'], sort_order: 2, original_sample_count: 12032 },
  { id: 3, name: 'CMMLU', code: 'cmmlu', language: 'zh', description: '中文多任务语言理解评估集', category: 'knowledge', model_types: ['text-generation'], sort_order: 3, original_sample_count: 11800 },
  { id: 4, name: 'C-Eval', code: 'ceval', language: 'zh', description: '中文考试与专业知识评估集', category: 'knowledge', model_types: ['text-generation'], sort_order: 4, original_sample_count: 13948 },
  { id: 5, name: 'HumanEval', code: 'humaneval', language: 'en', description: '代码生成能力评估集', category: 'code', model_types: ['text-generation'], sort_order: 5, original_sample_count: 164 },
  { id: 6, name: 'MBPP', code: 'mbpp', language: 'en', description: 'Python 编程题评估集', category: 'code', model_types: ['text-generation'], sort_order: 6, original_sample_count: 974 },
  { id: 101, name: 'GenEval', code: 'geneval', language: 'en', description: '图像生成提示词遵循与组合泛化评估集', category: 'image_generation', model_types: ['image-generation'], sort_order: 101, original_sample_count: 553 },
  { id: 102, name: 'DrawBench', code: 'drawbench', language: 'en', description: '开放域文生图提示词评估集', category: 'image_generation', model_types: ['image-generation'], sort_order: 102, original_sample_count: 200 },
  { id: 103, name: 'PartiPrompts', code: 'partiprompts', language: 'en', description: '复杂文生图提示词集合', category: 'image_generation', model_types: ['image-generation'], sort_order: 103, original_sample_count: 1632 },
  { id: 104, name: 'T2I-CompBench', code: 't2i_compbench', language: 'en', description: '属性、空间、数量关系组合理解评估集', category: 'image_generation', model_types: ['image-generation'], sort_order: 104, original_sample_count: 6000 },
  { id: 105, name: 'DPG-Bench', code: 'dpg_bench', language: 'en', description: '细粒度提示词遵循图像生成评估集', category: 'image_generation', model_types: ['image-generation'], sort_order: 105, original_sample_count: 1065 },
  { id: 106, name: 'HPSv2', code: 'hpsv2', language: 'en', description: '人类偏好图像质量评估集', category: 'image_generation', model_types: ['image-generation'], sort_order: 106, original_sample_count: 3200 },
]

const filterBenchmarkDatasets = (params: Record<string, any>) => {
  const category = params.category || ''
  const modelType = params.model_type || ''
  return benchmarkDatasets.filter((item) => {
    const matchCategory = !category || item.category === category
    const matchModelType = !modelType || item.model_types.length === 0 || item.model_types.includes(modelType)
    return matchCategory && matchModelType
  })
}

const normalizeOverviewStatus = (status?: string) => {
  const value = String(status || '').toLowerCase()
  const statusMap: Record<string, { code: string, name: string }> = {
    success: { code: 'completed', name: '已完成' },
    completed: { code: 'completed', name: '已完成' },
    '已完成': { code: 'completed', name: '已完成' },
    running: { code: 'running', name: '运行中' },
    processing: { code: 'running', name: '运行中' },
    '运行中': { code: 'running', name: '运行中' },
    failed: { code: 'failed', name: '失败' },
    error: { code: 'failed', name: '失败' },
    '失败': { code: 'failed', name: '失败' },
    pending: { code: 'created', name: '已创建' },
    created: { code: 'created', name: '已创建' },
    '已创建': { code: 'created', name: '已创建' },
    scheduled: { code: 'scheduled', name: '定时待启动' },
    '定时待启动': { code: 'scheduled', name: '定时待启动' },
    starting: { code: 'starting', name: '启动中' },
    '启动中': { code: 'starting', name: '启动中' },
    queued: { code: 'queued', name: '排队中' },
    queue: { code: 'queued', name: '排队中' },
    '排队中': { code: 'queued', name: '排队中' },
    stopped: { code: 'terminated', name: '已终止' },
    terminated: { code: 'terminated', name: '已终止' },
    '已停止': { code: 'terminated', name: '已终止' },
    '已终止': { code: 'terminated', name: '已终止' },
    '部署中': { code: 'starting', name: '启动中' },
    '生成中': { code: 'running', name: '运行中' },
    '评估中': { code: 'running', name: '运行中' },
    '待审核': { code: 'running', name: '运行中' },
    '进行中': { code: 'running', name: '运行中' },
    '启动失败': { code: 'failed', name: '失败' },
  }
  return statusMap[value] || statusMap[String(status || '')] || { code: value || 'created', name: status || '已创建' }
}

const overviewTask = (
  item: Record<string, any>,
  options: {
    scope: 'llm' | 'machine_learning'
    scopeName: string
    type: string
    typeName: string
    fallbackName?: string
  },
) => {
  const status = normalizeOverviewStatus(item.status_display || item.status)
  const gpuCards = asNumber(item.gpu_cards ?? item.gpu ?? item.card_count ?? item.replicas, item.inference_engine_type === 'LLM' ? 2 : 1)
  const cpu = asNumber(item.cpu ?? item.cpu_cores, item.inference_engine_type === 'ML' ? 8 : 16)
  const memory = asNumber(item.memory ?? item.memory_gb, item.inference_engine_type === 'ML' ? 32 : 64)
  return {
    task_id: Number(item.task_id ?? item.id ?? item.notebook_id ?? item.dataset_id ?? item.service_id),
    task_name: String(item.task_name || item.name || item.dataset_name || item.service_name || options.fallbackName || 'showcase-演示任务'),
    task_scope: options.scope,
    task_scope_name: options.scopeName,
    task_type: options.type,
    task_type_name: options.typeName,
    status: status.code,
    status_name: status.name,
    created_by: item.created_by || 'showcase_admin',
    created_at: item.created_at || now,
    status_updated_at: item.updated_at || item.finished_at || now,
    source: {
      source_type: options.type,
      source_id: Number(item.id ?? item.task_id ?? item.dataset_id ?? item.service_id),
      source_table: `showcase_${options.type}`,
    },
    detail_ref: {
      source_type: options.type,
      source_id: Number(item.id ?? item.task_id ?? item.dataset_id ?? item.service_id),
      source_table: `showcase_${options.type}`,
    },
    gpu_type: item.gpu_type || item.resource_card_model || (options.scope === 'machine_learning' ? 'T4' : 'A800'),
    gpu_cards: gpuCards,
    gpu_memory: asNumber(item.gpu_memory ?? item.gpu_memory_gb, gpuCards * 48),
    cpu,
    memory,
  }
}

const overviewTasks = [
  ...taskPage.map((item) => overviewTask(item, { scope: 'llm', scopeName: '大模型任务', type: 'data_cleaning', typeName: '数据清洗' })),
  ...trainingTasks.map((item) => overviewTask(item, { scope: 'llm', scopeName: '大模型任务', type: 'llm_training', typeName: '大模型训练' })),
  ...notebooks.map((item) => overviewTask(item, { scope: 'llm', scopeName: '大模型任务', type: 'notebook', typeName: '在线 Notebook' })),
  ...inferenceResultDatasets.map((item) => overviewTask(item, { scope: 'llm', scopeName: '大模型任务', type: 'inference_result', typeName: '推理结果集' })),
  ...evaluationTasks.map((item) => overviewTask(item, { scope: 'llm', scopeName: '大模型任务', type: 'evaluation_auto', typeName: '自动评估' })),
  ...manualEvaluationTasks.map((item) => overviewTask(item, { scope: 'llm', scopeName: '大模型任务', type: 'evaluation_manual', typeName: '人工评估' })),
  ...benchmarkTasks.map((item) => overviewTask(item, { scope: 'llm', scopeName: '大模型任务', type: 'evaluation_benchmark', typeName: '基准评估' })),
  ...insightTasks.map((item) => overviewTask(item, { scope: 'llm', scopeName: '大模型任务', type: 'data_insight', typeName: '数据洞察' })),
  ...augmentationTasks.map((item) => overviewTask(item, { scope: 'llm', scopeName: '大模型任务', type: 'data_augmentation', typeName: '数据增强' })),
  ...inferenceTasks.map((item) => overviewTask(item, { scope: item.inference_engine_type === 'ML' ? 'machine_learning' : 'llm', scopeName: item.inference_engine_type === 'ML' ? '机器学习任务' : '大模型任务', type: 'online_service', typeName: '在线推理服务' })),
  ...machineDatasets.map((item) => overviewTask(item, { scope: 'machine_learning', scopeName: '机器学习任务', type: 'machine_dataset', typeName: '机器学习数据管理' })),
  ...annotationTasks.map((item) => overviewTask(item, { scope: item.dataset_type === 'machine-learning' ? 'machine_learning' : 'llm', scopeName: item.dataset_type === 'machine-learning' ? '机器学习任务' : '大模型任务', type: 'annotation', typeName: '数据标注' })),
].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))

const filterOverviewTasksByScope = (taskScope?: string) => {
  if (!taskScope || taskScope === 'total' || taskScope === 'all') {
    return overviewTasks
  }
  return overviewTasks.filter((item) => item.task_scope === taskScope)
}

const overviewTaskTypeStats = () => {
  const llm = overviewTasks.filter((item) => item.task_scope === 'llm').length
  const ml = overviewTasks.filter((item) => item.task_scope === 'machine_learning').length
  return {
    project_id: 1001,
    items: [
      { task_scope: 'total', task_scope_name: '全部算力型任务', count: overviewTasks.length },
      { task_scope: 'llm', task_scope_name: '大模型任务', count: llm },
      { task_scope: 'machine_learning', task_scope_name: '机器学习任务', count: ml },
    ],
  }
}

const overviewStatusStats = (taskScope?: string) => {
  const items = filterOverviewTasksByScope(taskScope)
  const order = ['created', 'scheduled', 'starting', 'queued', 'running', 'terminated', 'completed', 'failed']
  const labelMap: Record<string, string> = {
    created: '已创建',
    scheduled: '定时待启动',
    starting: '启动中',
    queued: '排队中',
    running: '运行中',
    terminated: '已终止',
    completed: '已完成',
    failed: '失败',
  }
  return {
    project_id: 1001,
    task_scope: taskScope || 'total',
    total: items.length,
    statuses: order.map((status) => ({
      status_code: status,
      status_name: labelMap[status],
      count: items.filter((item) => item.status === status).length,
    })),
  }
}

const overviewLatestTasks = (params: Record<string, any>) => {
  const page = asNumber(params.page, 1)
  const pageSize = asNumber(params.page_size, 4)
  const statusFilter = typeof params.statuses === 'string' && params.statuses
    ? params.statuses.split(',').filter(Boolean)
    : []
  const latestStatusOrder = ['scheduled', 'starting', 'queued', 'running', 'failed']
  const sourceTasks = filterOverviewTasksByScope(params.task_scope)
    .filter((item) => statusFilter.length === 0 || statusFilter.includes(item.status))
  const groupedStatuses = statusFilter.length
    ? statusFilter
    : latestStatusOrder
  const groups = groupedStatuses.map((status) => {
    const items = sourceTasks.filter((item) => item.status === status)
    const pageItems = items.slice((page - 1) * pageSize, page * pageSize)
    const statusMeta = normalizeOverviewStatus(status)
    return {
      status,
      status_name: statusMeta.name,
      total_count: items.length,
      page,
      page_size: pageSize,
      total_pages: Math.max(1, Math.ceil(items.length / pageSize)),
      has_more: page * pageSize < items.length,
      items: pageItems,
    }
  })
  return {
    project_id: 1001,
    task_scope: params.task_scope || 'total',
    limit_per_status: pageSize,
    page,
    page_size: pageSize,
    sort_by: 'status_updated_at',
    sort_order: 'desc',
    groups,
  }
}

const overviewResource = (taskScope?: string) => {
  const isMl = taskScope === 'machine_learning'
  const usedGpu = isMl ? 3 : 9
  return {
    project_id: 1001,
    cluster_id: 1,
    cluster_name: 'showcase-gpu-cluster',
    resource_type: 'GPU',
    resource_card_model: isMl ? 'T4 / A10' : 'A800 / L40S',
    scope: taskScope || 'total',
    gpu_cards: { used: usedGpu, total: 16, unit: '卡' },
    gpu_memory: { used: usedGpu * 48, total: 1280, unit: 'GB' },
    cpu: { used: isMl ? 48 : 168, total: 512, unit: '核' },
    memory: { used: isMl ? 192 : 640, total: 2048, unit: 'GB' },
  }
}

const filteredInferenceResultDatasets = (params: Record<string, any>) => {
  const datasetType = params.dataset_type || ''
  const datasetFormat = params.dataset_format || ''
  const usage = params.usage || ''
  const name = params.name || ''
  const items = inferenceResultDatasets.filter((item) => {
    const matchDatasetType = !datasetType || item.dataset_type === datasetType
    const matchFormat = !datasetFormat || item.dataset_format === datasetFormat
    const matchUsage = !usage || item.usage === usage
    const matchName = !name || item.name.includes(name) || item.dataset_name.includes(name)
    return matchDatasetType && matchFormat && matchUsage && matchName
  })
  return pageOf(items, asNumber(params.page, 1), asNumber(params.size, 10))
}

const compareTrainingVersionDesc = (a: any, b: any) => {
  const versionNumber = (version?: string) => Number(String(version || '').match(/\d+/)?.[0] || 0)
  return versionNumber(b.version) - versionNumber(a.version)
}

const previewTrainingTaskVersions = (taskName: string, status?: string) => {
  const decodedTaskName = decodeURIComponent(taskName)
  const normalizedStatus = status ? trainingStatusForDetail(status, status) : ''
  return trainingTaskVersions
    .filter((item) => item.task_name === decodedTaskName || item.name === decodedTaskName)
    .filter((item) => !normalizedStatus || item.status === normalizedStatus || item.status === status)
    .sort(compareTrainingVersionDesc)
}

const previewTrainingTaskLogs = (taskId: number) => {
  const version = trainingTaskVersions.find((item) => Number(item.id) === Number(taskId))
  const taskName = version?.task_name || 'showcase-训练任务'
  const isFailed = version?.status === '失败'
  const isRunning = version?.status === '运行中'
  const logs = [
    `[INFO] ${taskName} ${version?.version || 'V1'} 已提交到训练队列`,
    `[INFO] 加载基础模型: ${version?.base_model?.base_model_name || 'Qwen2.5-7B-Instruct'}`,
    `[INFO] 加载训练数据集: ${(version?.dataset_items || []).map((item: any) => `${item.name}/${item.version}`).join(', ') || '-'}`,
    '[INFO] 初始化分布式训练环境与显卡资源',
    '[INFO] step=100 loss=1.824 eval_loss=1.736 learning_rate=1.8e-5',
    '[INFO] step=200 loss=1.426 eval_loss=1.384 learning_rate=1.5e-5',
    isFailed
      ? `[ERROR] ${version?.error_message || '训练任务执行失败，请检查配置'}`
      : isRunning
        ? '[INFO] step=360 loss=1.118 eval_loss=1.204 learning_rate=1.1e-5，任务仍在运行'
        : '[INFO] 训练完成，模型产物与指标已保存',
  ]
  return {
    archived: !isRunning,
    logs: logs.map((message, index) => ({ number: index + 1, message })),
  }
}

const previewTrainingTaskMlflow = (taskName: string, version: string) => {
  const decodedTaskName = decodeURIComponent(taskName)
  const decodedVersion = decodeURIComponent(version)
  const taskVersion = trainingTaskVersions.find((item) => item.task_name === decodedTaskName && item.version === decodedVersion)
  const startTime = Math.floor(new Date(taskVersion?.started_at || now).getTime() / 1000)
  const endTime = taskVersion?.finished_at ? Math.floor(new Date(taskVersion.finished_at).getTime() / 1000) : 0
  const failed = taskVersion?.status === '失败'
  const running = taskVersion?.status === '运行中'
  const lossPoints = failed
    ? [1.9, 1.66, 1.58]
    : running
      ? [1.9, 1.62, 1.36, 1.18]
      : [1.9, 1.52, 1.21, 0.98, 0.86]
  const evalLossPoints = lossPoints.map((loss, index) => Number((loss + 0.08 + index * 0.01).toFixed(3)))
  const metricSeries = (values: number[]) => values.map((value, index) => ({
    value,
    timestamp: startTime + index * 600,
    step: (index + 1) * 100,
  }))
  return {
    task_id: taskVersion?.id || 0,
    task_name: decodedTaskName,
    version: decodedVersion,
    project_name: '演示项目 - 大模型训练',
    experiment_name: `${decodedTaskName}-experiment`,
    run_name: `${decodedTaskName}-${decodedVersion}`,
    run_info: {
      run_uuid: `showcase-${taskVersion?.id || 0}`,
      experiment_id: `exp-${taskVersion?.id || 0}`,
      name: `${decodedTaskName}-${decodedVersion}`,
      status: failed ? 'FAILED' : running ? 'RUNNING' : 'FINISHED',
      start_time: startTime,
      end_time: endTime,
      user_id: taskVersion?.created_by || 'showcase_admin',
      artifact_uri: taskVersion?.model_output_path || `/showcase/models/${decodedTaskName}/${decodedVersion}`,
    },
    params: {
      learning_rate: String(taskVersion?.basic?.learning_rate || 0.00002),
      train_method: taskVersion?.training_type?.train_method_type || 'sft',
      fine_tuning_type: taskVersion?.training_type?.fine_tuning_type || 'lora',
    },
    metrics: {
      loss: metricSeries(lossPoints),
      eval_loss: metricSeries(evalLossPoints),
      learning_rate: metricSeries(lossPoints.map((_, index) => Number((0.00002 * (1 - index / Math.max(lossPoints.length, 1))).toFixed(8)))),
    },
    latest_metrics: {
      loss: lossPoints[lossPoints.length - 1],
      eval_loss: evalLossPoints[evalLossPoints.length - 1],
    },
    tags: {
      dataset_type: taskVersion?.training_type?.train_type_category || 'text-generation',
      training_method_type: taskVersion?.training_type?.train_method_type || 'sft',
    },
    mlflow_available: true,
  }
}

const previewTrainingTaskCheckpoints = (taskId: number) => {
  const taskVersion = trainingTaskVersions.find((item) => Number(item.id) === Number(taskId))
  const isGrpo = taskVersion?.training_type?.train_method_type === 'grpo'
  if (isGrpo) {
    return [
      { name: 'global_step_100', epoch: 0.2, train_loss: null, eval_loss: null, step: 100, metrics: { reward_mean: 0.42, kl: 0.08, pass_rate: 0.61 } },
      { name: 'global_step_200', epoch: 0.4, train_loss: null, eval_loss: null, step: 200, metrics: { reward_mean: 0.51, kl: 0.11, pass_rate: 0.66 } },
    ]
  }
  return [
    { name: 'checkpoint-100', epoch: 0.5, train_loss: 1.824, eval_loss: 1.736, step: 100 },
    { name: 'checkpoint-200', epoch: 1.0, train_loss: 1.426, eval_loss: 1.384, step: 200 },
    { name: 'checkpoint-300', epoch: 1.5, train_loss: 1.118, eval_loss: 1.204, step: 300 },
  ]
}

const staticHandlers: Array<[RegExp, StaticHandler]> = [
  [/^\/menu$/, () => mockMenuData],
  [/^\/users\/me$/, () => previewTenantAdminUser],
  [/^\/permissions\/menu\/visible$/, () => ({ visible: true })],
  [/^\/models\/enums\/model-status$/, () => ['已创建', '下载中', '已完成', '失败']],
  [/^\/enums\/list$/, () => ({ items: [] })],
  [/^\/k8s\/available-clusters$/, ({ params }) => pageOf(previewKubernetesClusters, asNumber(params.page, 1), asNumber(params.size, 50))],
  [/^\/projects\/list$/, ({ params }) => previewProjectList(asNumber(params.page, 1), asNumber(params.size, 100))],
  [/^\/projects\/1001\/user\/list$/, ({ params }) => pageOf([previewTenantAdminUser], asNumber(params.page, 1), asNumber(params.size, 100))],
  [/^\/projects\/1001\/compute-task-overview\/task-type-stats$/, () => overviewTaskTypeStats()],
  [/^\/projects\/1001\/compute-task-overview\/status-stats$/, ({ params }) => overviewStatusStats(params.task_scope)],
  [/^\/projects\/1001\/compute-task-overview\/latest-tasks$/, ({ params }) => overviewLatestTasks(params)],
  [/^\/projects\/1001\/compute-task-overview\/project-resources$/, ({ params }) => overviewResource(params.task_scope)],
  [/^\/projects\/1001\/compute-task-overview\/cluster-resources$/, () => overviewResource('total')],
  [/^\/models\/base\/list$/, ({ params }) => previewBaseModelList(params)],
  [/^\/models\/trained\/project\/1001$/, ({ params }) => pageOf(trainedModels, asNumber(params.page, 1), asNumber(params.size, 10))],
  [/^\/training-datasets\/project\/1001$/, ({ params }) => previewTrainingDatasetList(params)],
  [/^\/training-datasets\/project\/1001\/stats$/, () => trainingDatasetStats],
  [/^\/training-datasets\/project\/1001\/filtered$/, ({ params }) => previewTrainingDatasetList(params)],
  [/^\/training-datasets\/project\/1001\/dataset\/([^/]+)$/, ({ path, params }) => {
    const datasetName = decodeURIComponent(path.split('/').pop() || '')
    return previewTrainingDatasetDetail(datasetName, params.usage)
  }],
  [/^\/training-datasets\/project\/1001\/dataset\/([^/]+)\/version\/([^/]+)\/preview$/, ({ path, params }) => {
    const parts = path.split('/')
    return previewTrainingDatasetPreview(decodeURIComponent(parts[5] || ''), decodeURIComponent(parts[7] || 'V1'), asNumber(params.page, 1), asNumber(params.size, 10), params.usage)
  }],
  [/^\/data_cleaning\/1001\/tasks$/, ({ params }) => pageOf(taskPage, asNumber(params.page, 1), asNumber(params.size, 10))],
  [/^\/training_tasks\/project\/1001$/, ({ params }) => pageOf(trainingTaskSummaries, asNumber(params.page, 1), asNumber(params.size, 10))],
  [/^\/training_tasks\/project\/1001\/task\/\d+\/logs$/, ({ path }) => {
    const taskId = Number(path.split('/')[5])
    return previewTrainingTaskLogs(taskId)
  }],
  [/^\/training_tasks\/project\/1001\/task\/\d+\/logs\/range$/, ({ path }) => {
    const taskId = Number(path.split('/')[5])
    return previewTrainingTaskLogs(taskId)
  }],
  [/^\/training_tasks\/project\/1001\/task\/([^/]+)\/version\/([^/]+)\/mlflow$/, ({ path }) => {
    const parts = path.split('/')
    return previewTrainingTaskMlflow(parts[5] || '', parts[7] || '')
  }],
  [/^\/training_tasks\/project\/1001\/task\/\d+\/checkpoints$/, ({ path }) => {
    const taskId = Number(path.split('/')[5])
    return previewTrainingTaskCheckpoints(taskId)
  }],
  [/^\/training_tasks\/project\/1001\/task\/([^/]+)$/, ({ path, params }) => {
    const taskName = path.split('/').pop() || ''
    return previewTrainingTaskVersions(taskName, params.status)
  }],
  [/^\/notebooks\/1001\/list$/, ({ params }) => pageOf(notebooks, asNumber(params.page, 1), asNumber(params.size, 10))],
  [/^\/inference-result-datasets\/project\/1001\/list$/, ({ params }) => pageOf(filterByDatasetType(inferenceResultDatasets, params.dataset_type), asNumber(params.page, 1), asNumber(params.size, 10))],
  [/^\/inference-result-datasets\/project\/1001\/stats$/, () => inferenceResultStats],
  [/^\/inference-result-datasets\/project\/1001\/filtered$/, ({ params }) => filteredInferenceResultDatasets(params)],
  [/^\/inference-result-datasets\/project\/1001\/dataset\/\d+$/, () => inferenceResultDatasets[0]],
  [/^\/evaluation-tasks\/project\/1001$/, ({ params }) => pageOf(filterByTaskTypeParam(evaluationTasks, params), asNumber(params.page, 1), asNumber(params.size, 10))],
  [/^\/manual-evaluation-tasks\/project\/1001\/list$/, ({ params }) => pageOf(filterByTaskTypeParam(manualEvaluationTasks, params), asNumber(params.page, 1), asNumber(params.size, 10))],
  [/^\/benchmark\/datasets$/, ({ params }) => filterBenchmarkDatasets(params)],
  [/^\/benchmark\/project\/1001\/tasks$/, ({ params }) => pageOf(benchmarkTasks, asNumber(params.page, 1), asNumber(params.size, 10))],
  [/^\/machine-learning-datasets\/dataset\/1001\/page$/, ({ params }) => pageOf(machineDatasets, asNumber(params.page, 1), asNumber(params.size, 20))],
  [/^\/machine-learning-datasets\/dataset\/1001\/\d+$/, ({ params }) => ({
    ...machineDatasets[0],
    rows: pageOf([
      { row_number: 1, image: 'showcase-product-001.jpg', label: '智能音箱' },
      { row_number: 2, image: 'showcase-product-002.jpg', label: '智能门锁' },
    ], asNumber(params.page, 1), asNumber(params.size, 10)),
  })],
  [/^\/inference_tasks\/project\/1001$/, ({ params }) => pageOf(inferenceTasks, asNumber(params.page, 1), asNumber(params.size, 10))],
  [/^\/online_annotation_service\/project\/1001\/list$/, ({ params }) => pageOf(annotationTasks, asNumber(params.page, 1), asNumber(params.size, 10))],
  [/^\/label\/1001\/tasks$/, ({ params }) => pageOf(annotationTasks, asNumber(params.page, 1), asNumber(params.size, 10))],
  [/^\/multi-label\/project\/1001\/tasks\/annotation$/, ({ params }) => pageOf(annotationTasks, asNumber(params.page, 1), asNumber(params.size, 10))],
  [/^\/multi-label\/project\/1001\/tasks\/audit-list$/, ({ params }) => pageOf(annotationTasks, asNumber(params.page, 1), asNumber(params.size, 10))],
  [/^\/multi-label\/project\/1001\/tasks\/overview$/, () => ({ total: annotationTasks.length, in_progress: 3, completed: 2, failed: 1 })],
  [/^\/multi-label\/project\/1001\/admin-access$/, () => ({ is_admin: true, has_access: true })],
  [/^\/data-insights\/project\/1001\/tasks$/, ({ params }) => pageOf(insightTasks, asNumber(params.page, 1), asNumber(params.size, 10))],
  [/^\/data-augmentations\/project\/1001\/tasks$/, ({ params }) => pageOf(augmentationTasks, asNumber(params.page, 1), asNumber(params.size, 10))],
  [/^\/business-attr\/app-menu$/, () => mockMenuData],
  [/^\/business-attr\/list$/, ({ params }) => pageOf([
    { id: 1, name: '业务线', business_type: params.business_type, required_tag: true, input_type: '下拉选择', options: ['客服', '商品'] },
  ], asNumber(params.page, 1), asNumber(params.size, 10))],
]

export const isShowcaseStaticMode = import.meta.env.VITE_SHOWCASE_STATIC === 'true'

export function getShowcaseStaticResponse(config: InternalAxiosRequestConfig): AxiosResponse | null {
  if (!isShowcaseStaticMode) {
    return null
  }

  const { path } = normalizePath(config.url)
  const context: StaticRequestContext = {
    method: (config.method || 'get').toLowerCase(),
    path,
    params: mergeParams(config),
    body: parseBody(config.data),
  }

  if (context.method !== 'get') {
    return null
  }

  const handler = staticHandlers.find(([pattern]) => pattern.test(path))?.[1]
  if (!handler) {
    return null
  }

  return ok(handler(context), config)
}

export const showcaseStaticAdapter: AxiosAdapter = async (config) => {
  const response = getShowcaseStaticResponse(config as InternalAxiosRequestConfig)
  if (!response) {
    throw new Error(`Unhandled showcase static endpoint: ${config.method || 'get'} ${config.url || ''}`)
  }
  return response
}
