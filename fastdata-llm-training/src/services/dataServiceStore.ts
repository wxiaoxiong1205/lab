import { useSyncExternalStore } from 'react'

export type DataUsage = 'SFT-文本生成' | 'SFT-图像理解'
export type DataFormat = 'prompt-response' | 'role-based'
export type TaskLifecycleStatus =
  | '已创建'
  | '定时待启动'
  | '启动中'
  | '排队中'
  | '运行中'
  | '已完成'
  | '失败'
  | '已终止'

export interface DatasetDetailRowRecord {
  key: string
  system?: string
  user?: string
  assistant?: string
  prompt?: string
  response?: string
}

export interface DatasetVersionRecord {
  id: string
  version: string
  processStatus: string
  publishStatus: string
  createdAt: string
  sampleCount: number
  charCount?: number
  trainRatio?: number
  description?: string
  detailRows: DatasetDetailRowRecord[]
}

export interface DatasetRecord {
  id: string
  name: string
  versionStatus: string
  latestVersion: string
  dataUsage: DataUsage
  dataFormat: DataFormat
  creator: string
  createdAt: string
  status: string
  sampleCount: number
  charCount?: number
  trainRatio?: number
  versions: DatasetVersionRecord[]
}

export interface InferenceResultRecord {
  id: string
  name: string
  progress: TaskLifecycleStatus
  dataUsage: '文本生成' | '图像理解'
  pendingData: string
  pendingModel: string
  dataVolume: number
  createdAt: string
}

export interface AnnotationTaskRecord {
  id: string
  name: string
  dataVolume: number
  progress: number | null
  preDataset: string
  postDataset: string
  creator: string
  createdAt: string
}

export interface CleaningTaskRecord {
  id: string
  name: string
  status: TaskLifecycleStatus
  preDataset: string
  postDataset: string
  creator: string
  createdAt: string
}

export interface DataServiceState {
  trainingDatasets: DatasetRecord[]
  validationDatasets: DatasetRecord[]
  testDatasets: DatasetRecord[]
  inferenceResults: InferenceResultRecord[]
  annotationTasks: AnnotationTaskRecord[]
  cleaningTasks: CleaningTaskRecord[]
}

const STORAGE_KEY = 'lab-coding:data-service-store:v1'

function nowText(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

function nextVersionLabel(current: string): string {
  const match = /^V(\d+)$/i.exec(current)
  const num = match ? Number(match[1]) : 1
  return `V${num + 1}`
}

function buildSeedDetailRows(format: DataFormat, name: string, version: string): DatasetDetailRowRecord[] {
  if (format === 'role-based') {
    return [
      {
        key: `${name}-${version}-1`,
        system: '你是一名数据质量审核助手。',
        user: `${name} ${version} 的示例输入 1`,
        assistant: '这是示例输出。',
      },
      {
        key: `${name}-${version}-2`,
        system: '你是一名数据质量审核助手。',
        user: '请判断这段内容是否合规。',
        assistant: '判断结果：合规。',
      },
    ]
  }

  return [
    {
      key: `${name}-${version}-1`,
      system: '# 角色：内容安全审核专家 ## 描述：负责识别和评估文本中的潜在安全风险。',
      prompt: `${name} ${version} 的示例 Prompt 1`,
      response: '判断结果：【不安全】 判断依据：涉及知识产权类、经济犯罪类违规内容。',
    },
    {
      key: `${name}-${version}-2`,
      system: '# 角色：内容安全审核专家 ## 描述：负责识别和评估文本中的潜在安全风险。',
      prompt: `${name} ${version} 的示例 Prompt 2`,
      response: '判断结果：【不安全】 判断依据：属于道德伦理类违规内容。',
    },
  ]
}

function makeDataset(params: {
  id: string
  name: string
  latestVersion: string
  dataUsage: DataUsage
  dataFormat: DataFormat
  creator: string
  createdAt: string
  status?: string
  sampleCount: number
  charCount?: number
  trainRatio?: number
  description?: string
}): DatasetRecord {
  const {
    id,
    name,
    latestVersion,
    dataUsage,
    dataFormat,
    creator,
    createdAt,
    sampleCount,
    charCount,
    trainRatio,
    description,
    status = '已发布',
  } = params

  return {
    id,
    name,
    versionStatus: '处理完成',
    latestVersion,
    dataUsage,
    dataFormat,
    creator,
    createdAt,
    status,
    sampleCount,
    charCount,
    trainRatio,
    versions: [
      {
        id: `${id}-${latestVersion}`,
        version: latestVersion,
        processStatus: '处理完成',
        publishStatus: status,
        createdAt,
        sampleCount,
        charCount,
        trainRatio,
        description,
        detailRows: buildSeedDetailRows(dataFormat, name, latestVersion),
      },
    ],
  }
}

const seedState: DataServiceState = {
  trainingDatasets: [
    makeDataset({ id: 'train-1', name: 'roleBased', latestVersion: 'V5', dataUsage: 'SFT-文本生成', dataFormat: 'role-based', creator: 'deepexilab', createdAt: '2026/03/11 14:43:09', sampleCount: 2, charCount: 3200, trainRatio: 80 }),
    makeDataset({ id: 'train-2', name: '训练测试-1', latestVersion: 'V8', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/03/08 14:30:00', sampleCount: 40, charCount: 125000, trainRatio: 80 }),
    makeDataset({ id: 'train-3', name: '222222222222222', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/03/07 09:15:00', sampleCount: 20, charCount: 56000, trainRatio: 80 }),
    makeDataset({ id: 'train-4', name: 'role_base', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/03/06 09:15:00', sampleCount: 12, charCount: 32000, trainRatio: 80, status: '处理失败' }),
    makeDataset({ id: 'train-5', name: '小量训练数据-xjh-test', latestVersion: 'V3', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/03/05 15:45:00', sampleCount: 28, charCount: 83000, trainRatio: 80 }),
  ],
  validationDatasets: [
    makeDataset({ id: 'val-1', name: '多轮---1', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'role-based', creator: 'admin', createdAt: '2026/02/27 14:00:00', sampleCount: 20, charCount: 36000, trainRatio: 20 }),
    makeDataset({ id: 'val-2', name: '正常-2', latestVersion: 'V2', dataUsage: 'SFT-文本生成', dataFormat: 'role-based', creator: 'admin', createdAt: '2026/02/26 14:00:00', sampleCount: 16, charCount: 24000, trainRatio: 20 }),
    makeDataset({ id: 'val-3', name: '验证-xlsx-0001', latestVersion: 'V15', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/02/25 15:00:00', sampleCount: 40, charCount: 68000, trainRatio: 20 }),
  ],
  testDatasets: [
    makeDataset({ id: 'test-1', name: '多文件-10', latestVersion: 'V2', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'admin', createdAt: '2026/03/03 17:04:19', sampleCount: 40 }),
    makeDataset({ id: 'test-2', name: '乱码测试4', latestVersion: 'V7', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/03/02 14:30:00', sampleCount: 50 }),
    makeDataset({ id: 'test-3', name: '333333333', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'role-based', creator: 'lab1', createdAt: '2026/03/01 11:00:00', sampleCount: 10, status: '处理失败' }),
    makeDataset({ id: 'test-4', name: '属性回归测试-22-333-444', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'admin', createdAt: '2026/04/09 10:00:00', sampleCount: 5 }),
  ],
  inferenceResults: [
    { id: 'inf-1', name: '属性回归-推理结果集-22-333-444', progress: '已完成', dataUsage: '文本生成', pendingData: '测试数据集/属性回归测试-22-333-444>V1', pendingModel: 'qwen3-vl-plus-图像理解-在线推理服务1', dataVolume: 5, createdAt: '2026/04/03 15:41:36' },
    { id: 'inf-2', name: '删除测试3', progress: '已创建', dataUsage: '文本生成', pendingData: '测试数据集/测试-role-多轮-1>V1', pendingModel: 'Qwen2-VL-2B-Instruct', dataVolume: 4, createdAt: '2026/04/02 14:49:02' },
    { id: 'inf-3', name: '图像理解-模型管理', progress: '已完成', dataUsage: '图像理解', pendingData: '验证数据集/图像-单轮多轮交叉-2>V1', pendingModel: '图像理解-模型管理', dataVolume: 12, createdAt: '2026/04/01 14:43:25' },
  ],
  annotationTasks: [
    { id: 'ann-1', name: '11111', dataVolume: 4, progress: 0, preDataset: '验证数据集/json-22-V1', postDataset: '-', creator: 'deepexilab', createdAt: '2026-03-30 15:42:21' },
    { id: 'ann-2', name: '评估任务1', dataVolume: 20, progress: 0, preDataset: '训练数据集/小量数据集-V34', postDataset: '-', creator: 'lab1', createdAt: '2026-03-27 10:38:22' },
    { id: 'ann-3', name: 'xcvbnm', dataVolume: 20, progress: 20, preDataset: '训练数据集/训练测试-1-V5', postDataset: '-', creator: 'lab1', createdAt: '2026-03-20 10:17:59' },
  ],
  cleaningTasks: [
    { id: 'clean-1', name: '多人标注任务清洗', status: '已完成', preDataset: '训练数据集/roleBased-V4', postDataset: '训练数据集/roleBased-V5', creator: 'deepexilab', createdAt: '2026/03/24 11:53:50' },
    { id: 'clean-2', name: '多人-1', status: '启动中', preDataset: '训练数据集/训练测试-1-V8', postDataset: '-', creator: 'lab1', createdAt: '2026/03/20 09:45:19' },
    { id: 'clean-3', name: '异常-2', status: '已完成', preDataset: '测试数据集/多文件-10-V1', postDataset: '测试数据集/多文件-10-V2', creator: 'lab1', createdAt: '2026/03/13 15:18:51' },
  ],
}

function cloneState(state: DataServiceState): DataServiceState {
  return JSON.parse(JSON.stringify(state)) as DataServiceState
}

function readState(): DataServiceState {
  if (typeof window === 'undefined') {
    return cloneState(seedState)
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as DataServiceState) : cloneState(seedState)
  } catch {
    return cloneState(seedState)
  }
}

let state = readState()
const listeners = new Set<() => void>()

function emit() {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }
  listeners.forEach(listener => listener())
}

function update(mutator: (draft: DataServiceState) => void) {
  const draft = cloneState(state)
  mutator(draft)
  state = draft
  emit()
}

export function useDataServiceStore(): DataServiceState {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
    () => state,
  )
}

export function getDataServiceState(): DataServiceState {
  return state
}

export function replaceDataServiceState(nextState: DataServiceState): void {
  state = cloneState(nextState)
  emit()
}

function createDatasetVersion(
  version: string,
  createdAt: string,
  sampleCount: number,
  charCount?: number,
  trainRatio?: number,
  description?: string,
  detailRows?: DatasetDetailRowRecord[],
): DatasetVersionRecord {
  return {
    id: `${version}-${Date.now()}`,
    version,
    processStatus: '处理完成',
    publishStatus: '已发布',
    createdAt,
    sampleCount,
    charCount,
    trainRatio,
    description,
    detailRows: detailRows ?? [],
  }
}

export const dataServiceActions = {
  createDataset(
    kind: 'training' | 'validation' | 'test',
    params: { name: string; dataUsage: '文本生成' | '图像理解'; dataFormat: 'PROMPT_RESPONSE' | 'ROLE_BASED' },
  ) {
    update(draft => {
      const createdAt = nowText()
      const next: DatasetRecord = {
        id: `${kind}-${Date.now()}`,
        name: params.name,
        versionStatus: '处理完成',
        latestVersion: 'V1',
        dataUsage: params.dataUsage === '图像理解' ? 'SFT-图像理解' : 'SFT-文本生成',
        dataFormat: params.dataFormat === 'ROLE_BASED' ? 'role-based' : 'prompt-response',
        creator: 'deepexilab',
        createdAt,
        status: '已发布',
        sampleCount: Math.max(2, Math.floor(Math.random() * 40) + 2),
        charCount: kind === 'test' ? undefined : Math.floor(Math.random() * 90000) + 12000,
        trainRatio: kind === 'validation' ? 20 : kind === 'test' ? undefined : 80,
        versions: [],
      }

      next.versions = [
        createDatasetVersion(next.latestVersion, createdAt, next.sampleCount, next.charCount, next.trainRatio),
      ]

      if (kind === 'training') draft.trainingDatasets.unshift(next)
      else if (kind === 'validation') draft.validationDatasets.unshift(next)
      else draft.testDatasets.unshift(next)
    })
  },

  addDatasetVersion(
    kind: 'training' | 'validation' | 'test',
    id: string,
    options?: { inheritFromPrevious?: boolean; description?: string },
  ) {
    update(draft => {
      const list =
        kind === 'training'
          ? draft.trainingDatasets
          : kind === 'validation'
            ? draft.validationDatasets
            : draft.testDatasets
      const target = list.find(item => item.id === id)
      if (!target) return

      const createdAt = nowText()
      const nextVersion = nextVersionLabel(target.latestVersion)
      target.versions = target.versions.map(item =>
        item.version === target.latestVersion ? { ...item, publishStatus: '已归档' } : item,
      )
      target.latestVersion = nextVersion
      target.createdAt = createdAt
      target.versionStatus = '处理完成'
      target.status = '已发布'
      target.sampleCount = Math.max(2, Math.floor(Math.random() * 40) + 2)
      if (typeof target.charCount === 'number') {
        target.charCount = Math.floor(Math.random() * 90000) + 12000
      }
      const previousVersion = target.versions[0]
      target.versions.unshift(
          createDatasetVersion(
          nextVersion,
          createdAt,
          target.sampleCount,
          target.charCount,
          target.trainRatio,
          options?.description,
          options?.inheritFromPrevious
            ? JSON.parse(JSON.stringify(previousVersion?.detailRows ?? []))
            : buildSeedDetailRows(target.dataFormat, target.name, nextVersion),
        ),
      )
    })
  },

  deleteDataset(kind: 'training' | 'validation' | 'test', id: string) {
    update(draft => {
      if (kind === 'training') draft.trainingDatasets = draft.trainingDatasets.filter(item => item.id !== id)
      else if (kind === 'validation') draft.validationDatasets = draft.validationDatasets.filter(item => item.id !== id)
      else draft.testDatasets = draft.testDatasets.filter(item => item.id !== id)
    })
  },

  createInferenceResult(params: {
    name: string
    dataUsage: '文本生成' | '图像理解'
    pendingData: string
    pendingModel: string
  }) {
    update(draft => {
      draft.inferenceResults.unshift({
        id: `inf-${Date.now()}`,
        name: params.name,
        progress: '已创建',
        dataUsage: params.dataUsage,
        pendingData: params.pendingData,
        pendingModel: params.pendingModel,
        dataVolume: Math.max(1, Math.floor(Math.random() * 20) + 1),
        createdAt: nowText(),
      })
    })
  },

  deleteInferenceResult(id: string) {
    update(draft => {
      draft.inferenceResults = draft.inferenceResults.filter(item => item.id !== id)
    })
  },

  startInferenceResult(id: string) {
    update(draft => {
      const target = draft.inferenceResults.find(item => item.id === id)
      if (!target) return
      if (target.progress !== '启动中') {
        target.progress = '启动中'
      }
    })
  },

  terminateInferenceResult(id: string) {
    update(draft => {
      const target = draft.inferenceResults.find(item => item.id === id)
      if (!target) return
      target.progress = '已终止'
    })
  },

  createAnnotationTask(params: {
    name: string
    dataVolume: number
    preDataset: string
  }) {
    update(draft => {
      draft.annotationTasks.unshift({
        id: `ann-${Date.now()}`,
        name: params.name,
        dataVolume: params.dataVolume,
        progress: 0,
        preDataset: params.preDataset,
        postDataset: '-',
        creator: 'deepexilab',
        createdAt: nowText().replace(/\//g, '-'),
      })
    })
  },

  deleteAnnotationTask(id: string) {
    update(draft => {
      draft.annotationTasks = draft.annotationTasks.filter(item => item.id !== id)
    })
  },

  createCleaningTask(params: {
    name: string
    preDataset: string
  }) {
    update(draft => {
      draft.cleaningTasks.unshift({
        id: `clean-${Date.now()}`,
        name: params.name,
        status: '启动中',
        preDataset: params.preDataset,
        postDataset: '-',
        creator: 'deepexilab',
        createdAt: nowText(),
      })
    })
  },

  deleteCleaningTask(id: string) {
    update(draft => {
      draft.cleaningTasks = draft.cleaningTasks.filter(item => item.id !== id)
    })
  },

  startCleaningTask(id: string) {
    update(draft => {
      const target = draft.cleaningTasks.find(item => item.id === id)
      if (!target) return
      if (target.status !== '启动中') {
        target.status = '启动中'
      }
    })
  },
}
