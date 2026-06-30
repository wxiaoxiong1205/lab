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
]

const evaluationTasks = [
  {
    id: 7501,
    task_id: 7501,
    name: 'showcase-客服模型效果评估',
    task_name: 'showcase-客服模型效果评估',
    status: 'SUCCESS',
    status_display: '已完成',
    dataset_name: 'showcase-客服问答推理结果',
    model_name: 'showcase-Qwen客服SFT成功',
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
    status: 'RUNNING',
    status_display: '评估中',
    dataset_name: 'showcase-业务规则推理结果',
    model_name: 'Qwen2.5-7B-Instruct',
    score: null,
    project_id: 1001,
    created_at: now,
    updated_at: now,
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
]

const generatedTasks = (prefix: string) => [
  {
    id: 7901,
    task_id: 7901,
    name: `showcase-${prefix}成功任务`,
    task_name: `showcase-${prefix}成功任务`,
    status: 'SUCCESS',
    status_display: '已完成',
    dataset_name: 'showcase-数据增强源SFT',
    output_dataset_name: `showcase-${prefix}结果集`,
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
  {
    id: 7902,
    task_id: 7902,
    name: `showcase-${prefix}运行中任务`,
    task_name: `showcase-${prefix}运行中任务`,
    status: 'RUNNING',
    status_display: '运行中',
    dataset_name: 'showcase-多轮对话洞察SFT',
    output_dataset_name: `showcase-${prefix}生成中`,
    project_id: 1001,
    created_at: now,
    updated_at: now,
  },
]

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
  [/^\/inference-result-datasets\/project\/1001\/list$/, ({ params }) => pageOf(inferenceResultDatasets, asNumber(params.page, 1), asNumber(params.size, 10))],
  [/^\/inference-result-datasets\/project\/1001\/dataset\/\d+$/, () => inferenceResultDatasets[0]],
  [/^\/evaluation-tasks\/project\/1001$/, ({ params }) => pageOf(evaluationTasks, asNumber(params.page, 1), asNumber(params.size, 10))],
  [/^\/benchmark\/project\/1001\/tasks$/, ({ params }) => pageOf(evaluationTasks.map((task) => ({ ...task, evaluation_type: 'business' })), asNumber(params.page, 1), asNumber(params.size, 10))],
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
  [/^\/multi-label\/project\/1001\/tasks\/overview$/, () => ({ total: 2, in_progress: 1, completed: 1 })],
  [/^\/multi-label\/project\/1001\/admin-access$/, () => ({ is_admin: true, has_access: true })],
  [/^\/data-insights\/project\/1001\/tasks$/, ({ params }) => pageOf(generatedTasks('数据洞察'), asNumber(params.page, 1), asNumber(params.size, 10))],
  [/^\/data-augmentations\/project\/1001\/tasks$/, ({ params }) => pageOf(generatedTasks('数据增强'), asNumber(params.page, 1), asNumber(params.size, 10))],
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
