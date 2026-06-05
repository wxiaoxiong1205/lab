import { useSyncExternalStore } from 'react'
import type { FineTuneType, TrainingConfig } from '../types/training'

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
  'loraRank',
  'loraTargetModules',
  'loraAlpha',
  'loraDropout',
] as const

const STORAGE_KEY = 'lab-coding:grpo-training-parameter-templates:v1'

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
}

const seedTemplates: GrpoTrainingParameterTemplate[] = [
  {
    id: 'grpo-full-default',
    name: 'GRPO 全参通用模板',
    description: '适用于常规 GRPO 全参训练，参数口径与创建页默认训练参数保持一致。',
    enabled: true,
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

function readTemplates(): GrpoTrainingParameterTemplate[] {
  if (typeof window === 'undefined') {
    return cloneTemplates(seedTemplates)
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as GrpoTrainingParameterTemplate[]) : cloneTemplates(seedTemplates)
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
          params: normalizeGrpoTemplateParams(value.params as Record<string, unknown>),
          updatedAt: now,
        }
      } else {
        draft.unshift({
          ...value,
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
