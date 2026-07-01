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
    status: 'SUCCESS',
    status_display: '已完成',
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
    status: 'RUNNING',
    status_display: '运行中',
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
    status: 'SUCCESS',
    status_display: '已完成',
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
    status: 'FAILED',
    status_display: '失败',
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
    status: 'SUCCESS',
    status_display: '已完成',
    model_name: 'showcase-imagegen-sft-poster',
    base_model_name: 'Stable-Diffusion-XL',
    dataset_name: 'showcase-图像生成海报SFT',
    training_type: 'image-generation',
    training_method_type: 'sft',
    dataset_format: 'image-prompt',
    project_id: 1001,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
  },
]

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

const staticHandlers: Array<[RegExp, StaticHandler]> = [
  [/^\/menu$/, () => mockMenuData],
  [/^\/users\/me$/, () => previewTenantAdminUser],
  [/^\/permissions\/menu\/visible$/, () => ({ visible: true })],
  [/^\/models\/enums\/model-status$/, () => ['已创建', '下载中', '已完成', '失败']],
  [/^\/enums\/list$/, () => ({ items: [] })],
  [/^\/k8s\/available-clusters$/, ({ params }) => pageOf(previewKubernetesClusters, asNumber(params.page, 1), asNumber(params.size, 50))],
  [/^\/projects\/list$/, ({ params }) => previewProjectList(asNumber(params.page, 1), asNumber(params.size, 100))],
  [/^\/projects\/1001\/user\/list$/, ({ params }) => pageOf([previewTenantAdminUser], asNumber(params.page, 1), asNumber(params.size, 100))],
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
  [/^\/training_tasks\/project\/1001$/, ({ params }) => pageOf(trainingTasks, asNumber(params.page, 1), asNumber(params.size, 10))],
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
