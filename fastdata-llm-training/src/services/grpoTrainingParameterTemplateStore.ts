import { useSyncExternalStore } from 'react'
import type { FineTuneType, TrainingConfig } from '../types/training'

export type GrpoTemplateTrainingMethod = 'GRPO'

export type GrpoTrainingParameterValues = Pick<
  TrainingConfig,
  | 'learningRate'
  | 'numEpochs'
  | 'perDeviceBatchSize'
  | 'gradientAccumulationSteps'
  | 'warmupRatio'
  | 'lrSchedulerType'
  | 'useBf16'
  | 'gradientCheckpointing'
  | 'maxGradNorm'
  | 'ropeScalingMethod'
  | 'randomSeed'
  | 'weightDecay'
  | 'cutoffLength'
  | 'preprocessingNumWorkers'
  | 'evalSteps'
  | 'evalStrategy'
  | 'metricGreaterIsBetter'
  | 'loadBestModelAtEnd'
  | 'bestModelMetric'
  | 'perDeviceEvalBatchSize'
  | 'saveSteps'
  | 'saveStrategy'
  | 'saveTotalLimit'
  | 'loggingSteps'
  | 'numGenerations'
  | 'maxPromptLength'
  | 'maxCompletionLength'
  | 'temperature'
  | 'topP'
  | 'topK'
  | 'repetitionPenalty'
  | 'klCoefficient'
  | 'clipRange'
  | 'advantageEstimator'
  | 'rewardNormalization'
  | 'rewardScale'
  | 'loraAlpha'
  | 'loraDropout'
  | 'loraRank'
> & {
  loraTargetModules?: string[]
}

export interface GrpoTrainingParameterTemplate {
  id: string
  name: string
  description?: string
  enabled: boolean
  trainingMethod: GrpoTemplateTrainingMethod
  fineTuneType: FineTuneType
  params: GrpoTrainingParameterValues
  createdAt: string
  updatedAt: string
}

export const GRPO_TEMPLATE_PARAM_KEYS = [
  'learningRate',
  'numEpochs',
  'perDeviceBatchSize',
  'gradientAccumulationSteps',
  'warmupRatio',
  'lrSchedulerType',
  'useBf16',
  'gradientCheckpointing',
  'maxGradNorm',
  'ropeScalingMethod',
  'randomSeed',
  'weightDecay',
  'cutoffLength',
  'preprocessingNumWorkers',
  'evalSteps',
  'evalStrategy',
  'metricGreaterIsBetter',
  'loadBestModelAtEnd',
  'bestModelMetric',
  'perDeviceEvalBatchSize',
  'saveSteps',
  'saveStrategy',
  'saveTotalLimit',
  'loggingSteps',
  'numGenerations',
  'maxPromptLength',
  'maxCompletionLength',
  'temperature',
  'topP',
  'topK',
  'repetitionPenalty',
  'klCoefficient',
  'clipRange',
  'advantageEstimator',
  'rewardNormalization',
  'rewardScale',
  'loraRank',
  'loraTargetModules',
  'loraAlpha',
  'loraDropout',
] as const

const STORAGE_KEY = 'lab-coding:grpo-training-parameter-templates:v1'

function formatYamlScalar(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => String(item)).join(', ')}]`
  }
  if (typeof value === 'string') {
    return /^[A-Za-z0-9_.-]+$/.test(value) ? value : JSON.stringify(value)
  }
  return String(value)
}

function parseYamlScalar(raw: string): unknown {
  const value = raw.trim()
  if (!value) return ''
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null') return null
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()
    if (!inner) return []
    return inner.split(',').map(item => parseYamlScalar(item.trim()))
  }
  const numberValue = Number(value)
  if (value !== '' && Number.isFinite(numberValue)) return numberValue
  return value
}

export function buildGrpoTemplateYaml(template: { fineTuneType: FineTuneType; params: Record<string, unknown> }): string {
  const lines = [`fineTuneType: ${template.fineTuneType}`, 'params:']
  for (const [key, value] of Object.entries(template.params)) {
    if (Array.isArray(value)) {
      lines.push(`  ${key}:`)
      value.forEach(item => lines.push(`    - ${formatYamlScalar(item)}`))
    } else {
      lines.push(`  ${key}: ${formatYamlScalar(value)}`)
    }
  }
  return lines.join('\n')
}

export function parseGrpoTemplateYaml(raw?: string): { fineTuneType: FineTuneType; params: GrpoTrainingParameterValues } {
  const content = (raw ?? '').trim()
  if (!content) {
    throw new Error('模板内容不能为空')
  }

  if (content.startsWith('{')) {
    const parsed = JSON.parse(content) as Record<string, unknown>
    return normalizeGrpoTemplateContent(parsed)
  }

  const result: Record<string, unknown> = {}
  const params: Record<string, unknown> = {}
  let inParams = false
  let currentArrayKey: string | null = null

  for (const originalLine of content.split(/\r?\n/)) {
    const lineWithoutComment = originalLine.replace(/\s+#.*$/, '')
    if (!lineWithoutComment.trim()) continue

    if (/^\S/.test(lineWithoutComment)) {
      const [key, ...rest] = lineWithoutComment.split(':')
      const trimmedKey = key.trim()
      const rawValue = rest.join(':').trim()
      if (trimmedKey === 'params') {
        if (rawValue) throw new Error('params 必须使用缩进对象形式')
        result.params = params
        inParams = true
        currentArrayKey = null
        continue
      }
      result[trimmedKey] = parseYamlScalar(rawValue)
      inParams = false
      currentArrayKey = null
      continue
    }

    if (!inParams) {
      throw new Error('仅支持 fineTuneType 与 params 两个根字段')
    }

    const trimmed = lineWithoutComment.trim()
    if (trimmed.startsWith('- ')) {
      if (!currentArrayKey) {
        throw new Error('数组项必须归属于 params 下的字段')
      }
      const current = Array.isArray(params[currentArrayKey]) ? params[currentArrayKey] as unknown[] : []
      current.push(parseYamlScalar(trimmed.slice(2)))
      params[currentArrayKey] = current
      continue
    }

    const [key, ...rest] = trimmed.split(':')
    const trimmedKey = key.trim()
    const rawValue = rest.join(':').trim()
    if (!rawValue) {
      params[trimmedKey] = []
      currentArrayKey = trimmedKey
    } else {
      params[trimmedKey] = parseYamlScalar(rawValue)
      currentArrayKey = null
    }
  }

  result.params = params
  return normalizeGrpoTemplateContent(result)
}

function normalizeGrpoTemplateContent(parsed: Record<string, unknown>): { fineTuneType: FineTuneType; params: GrpoTrainingParameterValues } {
  const invalidRootKeys = Object.keys(parsed).filter(key => key !== 'fineTuneType' && key !== 'params')
  if (invalidRootKeys.length > 0) {
    throw new Error(`不支持的根字段：${invalidRootKeys.join('、')}`)
  }

  if (parsed.fineTuneType !== 'full' && parsed.fineTuneType !== 'lora') {
    throw new Error('fineTuneType 仅支持 full 或 lora')
  }

  if (!parsed.params || typeof parsed.params !== 'object' || Array.isArray(parsed.params)) {
    throw new Error('params 必须是对象')
  }

  const params = parsed.params as Record<string, unknown>
  const allowed = new Set<string>(GRPO_TEMPLATE_PARAM_KEYS)
  const invalidParamKeys = Object.keys(params).filter(key => !allowed.has(key))
  if (invalidParamKeys.length > 0) {
    throw new Error(`不支持的训练参数字段：${invalidParamKeys.join('、')}`)
  }

  return {
    fineTuneType: parsed.fineTuneType,
    params: normalizeGrpoTemplateParams(params),
  }
}

const commonParams: GrpoTrainingParameterValues = {
  learningRate: 0.00005,
  numEpochs: 3,
  perDeviceBatchSize: 2,
  gradientAccumulationSteps: 1,
  warmupRatio: 0.1,
  lrSchedulerType: 'COSINE',
  useBf16: true,
  gradientCheckpointing: false,
  maxGradNorm: 1,
  ropeScalingMethod: 'YARN',
  randomSeed: 42,
  weightDecay: 0,
  cutoffLength: 4096,
  preprocessingNumWorkers: 16,
  evalStrategy: 'STEPS',
  evalSteps: 20,
  metricGreaterIsBetter: false,
  loadBestModelAtEnd: true,
  bestModelMetric: 'loss',
  perDeviceEvalBatchSize: 2,
  saveSteps: 20,
  saveStrategy: 'STEPS',
  saveTotalLimit: 3,
  loggingSteps: 5,
  numGenerations: 8,
  maxPromptLength: 1024,
  maxCompletionLength: 1024,
  temperature: 0.9,
  topP: 0.95,
  topK: 50,
  repetitionPenalty: 1.05,
  klCoefficient: 0.04,
  clipRange: 0.2,
  advantageEstimator: 'GRPO',
  rewardNormalization: true,
  rewardScale: 1,
}

const seedTemplates: GrpoTrainingParameterTemplate[] = [
  {
    id: 'grpo-full-default',
    name: 'GRPO 全参通用模板',
    description: '适用于常规 GRPO 全参训练，参数口径与创建页默认训练参数保持一致。',
    enabled: true,
    trainingMethod: 'GRPO',
    fineTuneType: 'full',
    params: { ...commonParams },
    createdAt: '2026/06/05 10:00:00',
    updatedAt: '2026/06/05 10:00:00',
  },
  {
    id: 'grpo-lora-default',
    name: 'GRPO LoRA 轻量模板',
    description: '适用于先用 LoRA 快速验证 GRPO 训练效果的场景。',
    enabled: true,
    trainingMethod: 'GRPO',
    fineTuneType: 'lora',
    params: {
      ...commonParams,
      learningRate: 0.00002,
      gradientCheckpointing: true,
      loraRank: 16,
      loraTargetModules: ['all'],
      loraAlpha: 32,
      loraDropout: 0,
    },
    createdAt: '2026/06/05 10:00:00',
    updatedAt: '2026/06/05 10:00:00',
  },
]

function cloneTemplates(value: GrpoTrainingParameterTemplate[]): GrpoTrainingParameterTemplate[] {
  return JSON.parse(JSON.stringify(value)) as GrpoTrainingParameterTemplate[]
}

function normalizeTemplateRecord(value: Partial<GrpoTrainingParameterTemplate>): GrpoTrainingParameterTemplate {
  const fineTuneType = value.fineTuneType === 'full' || value.fineTuneType === 'lora' ? value.fineTuneType : 'lora'
  const defaultParams = fineTuneType === 'lora'
    ? {
        ...commonParams,
        learningRate: 0.00002,
        gradientCheckpointing: true,
        loraRank: 16,
        loraTargetModules: ['all'],
        loraAlpha: 32,
        loraDropout: 0,
      }
    : commonParams

  return {
    id: value.id ?? `grpo-template-${Date.now()}`,
    name: value.name ?? '未命名模板',
    description: value.description ?? '',
    enabled: value.enabled ?? true,
    trainingMethod: 'GRPO',
    fineTuneType,
    params: normalizeGrpoTemplateParams({
      ...defaultParams,
      ...((value.params ?? {}) as Record<string, unknown>),
    }),
    createdAt: value.createdAt ?? '2026/06/05 10:00:00',
    updatedAt: value.updatedAt ?? value.createdAt ?? '2026/06/05 10:00:00',
  }
}

function readTemplates(): GrpoTrainingParameterTemplate[] {
  if (typeof window === 'undefined') {
    return cloneTemplates(seedTemplates)
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<GrpoTrainingParameterTemplate>[]).map(normalizeTemplateRecord) : cloneTemplates(seedTemplates)
  } catch {
    return cloneTemplates(seedTemplates)
  }
}

let templates = readTemplates()
const listeners = new Set<() => void>()

function emit() {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
  }
  listeners.forEach(listener => listener())
}

function update(mutator: (draft: GrpoTrainingParameterTemplate[]) => void) {
  const draft = cloneTemplates(templates)
  mutator(draft)
  templates = draft
  emit()
}

export function useGrpoTrainingParameterTemplates(): GrpoTrainingParameterTemplate[] {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => templates,
    () => templates,
  )
}

export function getGrpoTrainingParameterTemplates(): GrpoTrainingParameterTemplate[] {
  return templates
}

export function getEnabledGrpoTrainingParameterTemplates(): GrpoTrainingParameterTemplate[] {
  return templates.filter(item => item.enabled)
}

export function normalizeGrpoTemplateParams(params: Record<string, unknown>): GrpoTrainingParameterValues {
  const allowed = new Set<string>(GRPO_TEMPLATE_PARAM_KEYS)
  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params)) {
    if (allowed.has(key) && value !== undefined) {
      normalized[key] = value
    }
  }
  return normalized as GrpoTrainingParameterValues
}

export const grpoTrainingParameterTemplateActions = {
  upsert(value: Omit<GrpoTrainingParameterTemplate, 'createdAt' | 'updatedAt'> & { createdAt?: string; updatedAt?: string }) {
    update(draft => {
      const now = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '/')
      const index = draft.findIndex(item => item.id === value.id)
      if (index >= 0) {
        draft[index] = {
          ...draft[index],
          ...value,
          trainingMethod: 'GRPO',
          params: normalizeGrpoTemplateParams(value.params as Record<string, unknown>),
          updatedAt: now,
        }
      } else {
        draft.unshift({
          ...value,
          trainingMethod: 'GRPO',
          params: normalizeGrpoTemplateParams(value.params as Record<string, unknown>),
          createdAt: value.createdAt ?? now,
          updatedAt: value.updatedAt ?? now,
        })
      }
    })
  },

  delete(id: string) {
    update(draft => {
      const index = draft.findIndex(item => item.id === id)
      if (index >= 0) {
        draft.splice(index, 1)
      }
    })
  },

  toggleEnabled(id: string) {
    update(draft => {
      const target = draft.find(item => item.id === id)
      if (target) {
        target.enabled = !target.enabled
        target.updatedAt = new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '/')
      }
    })
  },
}
