import { useSyncExternalStore } from 'react'
import type { TaskLifecycleStatus } from './dataServiceStore'

export type DeploymentType = 'standard' | 'custom'
export type ImageSourceType = 'system' | 'custom'

export interface ResourceConfig {
  cpuRequest?: number
  cpuLimit?: number
  memoryRequest?: number
  memoryLimit?: number
  gpuType?: string
  gpuCount?: number
  instanceCount?: number
}

export interface DependencyItem {
  name?: string
  version?: string
}

export interface EnvVarItem {
  key?: string
  value?: string
}

export interface ServiceConfig {
  accessPath?: string
  healthCheckPath?: string
  timeout?: number
}

export interface StandardDeploymentConfig {
  model?: string
  modelVersion?: string
  modelSource?: string
  network?: string
  resources: ResourceConfig
}

export interface CustomDeploymentConfig {
  deployMode: '镜像部署'
  imageSource: ImageSourceType
  systemImage?: string
  customImage?: string
  command?: string
  port?: number
  dependencies: DependencyItem[]
  envs: EnvVarItem[]
  resources: ResourceConfig
  serviceConfig: ServiceConfig
  serviceConfigJson?: string
}

export interface MLDeploymentRecord {
  id: string
  name: string
  deploymentType: DeploymentType
  targetSummary: string
  resourceSummary: string
  instanceCount: string
  status: TaskLifecycleStatus
  creator: string
  createdAt: string
  standardConfig?: StandardDeploymentConfig
  customConfig?: CustomDeploymentConfig
}

interface MachineDeploymentState {
  deployments: MLDeploymentRecord[]
}

interface CreateMachineDeploymentInput {
  name: string
  deploymentType: DeploymentType
  targetSummary: string
  resourceSummary: string
  instanceCount: string
  creator: string
  standardConfig?: StandardDeploymentConfig
  customConfig?: CustomDeploymentConfig
}

interface UpdateMachineDeploymentInput {
  name: string
  deploymentType: DeploymentType
  targetSummary: string
  resourceSummary: string
  instanceCount: string
  standardConfig?: StandardDeploymentConfig
  customConfig?: CustomDeploymentConfig
}

const STORAGE_KEY = 'lab-coding:machine-deployment-store:v1'

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

const seedState: MachineDeploymentState = {
  deployments: [
    {
      id: 'ml-deploy-1',
      name: 'hzj_单图多标签',
      deploymentType: 'standard',
      targetSummary: 'hzj_图片分类多标签 / resnet34',
      resourceSummary: '4C / 16GB / NVIDIA Tesla T4 x1',
      instanceCount: '0/1',
      status: '已终止',
      creator: 'lab1',
      createdAt: '2026/04/15 10:09:30',
      standardConfig: {
        model: 'hzj_图片分类多标签',
        modelVersion: 'V3',
        modelSource: '模型管理',
        network: 'resnet34',
        resources: {
          cpuRequest: 4,
          cpuLimit: 8,
          memoryRequest: 16,
          memoryLimit: 32,
          gpuType: 'NVIDIA Tesla T4',
          gpuCount: 1,
          instanceCount: 1,
        },
      },
    },
    {
      id: 'ml-deploy-2',
      name: 'basion-classification-single',
      deploymentType: 'standard',
      targetSummary: 'basion-图像分类-单标签 / resnet50',
      resourceSummary: '2C / 8GB / CPU',
      instanceCount: '0/1',
      status: '已终止',
      creator: 'lab1',
      createdAt: '2026/04/13 15:24:20',
      standardConfig: {
        model: 'basion-图像分类-单标签',
        modelVersion: 'V2',
        modelSource: '模型管理',
        network: 'resnet50',
        resources: {
          cpuRequest: 2,
          cpuLimit: 4,
          memoryRequest: 8,
          memoryLimit: 16,
          instanceCount: 1,
        },
      },
    },
    {
      id: 'ml-deploy-3',
      name: 'custom-image-classifier',
      deploymentType: 'custom',
      targetSummary: '镜像部署 / python-inference:3.9-ubuntu2004',
      resourceSummary: '6C / 24GB / NVIDIA Tesla T4 x1',
      instanceCount: '0/2',
      status: '运行中',
      creator: 'admin',
      createdAt: '2026/04/18 16:22:00',
      customConfig: {
        deployMode: '镜像部署',
        imageSource: 'system',
        systemImage: 'python-inference:3.9-ubuntu2004',
        command: 'python app.py --port 8000',
        port: 8000,
        dependencies: [
          { name: 'flask', version: '2.3.3' },
          { name: 'opencv-python', version: '4.10.0' },
        ],
        envs: [
          { key: 'MODEL_PATH', value: '/workspace/model' },
          { key: 'PYTHONUNBUFFERED', value: '1' },
        ],
        resources: {
          cpuRequest: 6,
          cpuLimit: 8,
          memoryRequest: 24,
          memoryLimit: 32,
          gpuType: 'NVIDIA Tesla T4',
          gpuCount: 1,
          instanceCount: 2,
        },
        serviceConfig: {
          accessPath: '/predict',
          healthCheckPath: '/health',
          timeout: 90,
        },
      },
    },
  ],
}

function readState(): MachineDeploymentState {
  if (typeof window === 'undefined') {
    return cloneState(seedState)
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as MachineDeploymentState) : cloneState(seedState)
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

function update(mutator: (draft: MachineDeploymentState) => void) {
  const draft = cloneState(state)
  mutator(draft)
  state = draft
  emit()
}

export function useMachineDeploymentStore(): MachineDeploymentState {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
    () => state,
  )
}

export function getMachineDeploymentState(): MachineDeploymentState {
  return state
}

export function resetMachineDeploymentState(): void {
  state = cloneState(seedState)
  emit()
}

export const machineDeploymentActions = {
  createDeployment(input: CreateMachineDeploymentInput): MLDeploymentRecord {
    const next: MLDeploymentRecord = {
      id: `ml-deployment-${Date.now()}`,
      name: input.name,
      deploymentType: input.deploymentType,
      targetSummary: input.targetSummary,
      resourceSummary: input.resourceSummary,
      instanceCount: input.instanceCount,
      status: '已创建',
      creator: input.creator,
      createdAt: nowText(),
      standardConfig: input.standardConfig,
      customConfig: input.customConfig,
    }

    update(draft => {
      draft.deployments.unshift(next)
    })

    return next
  },

  updateDeployment(id: string, input: UpdateMachineDeploymentInput): MLDeploymentRecord | null {
    let updated: MLDeploymentRecord | null = null

    update(draft => {
      draft.deployments = draft.deployments.map(item => {
        if (item.id !== id) {
          return item
        }

        updated = {
          ...item,
          name: input.name,
          deploymentType: input.deploymentType,
          targetSummary: input.targetSummary,
          resourceSummary: input.resourceSummary,
          instanceCount: input.instanceCount,
          standardConfig: input.standardConfig,
          customConfig: input.customConfig,
        }

        return updated
      })
    })

    return updated
  },

  setDeploymentStatus(id: string, status: TaskLifecycleStatus): void {
    update(draft => {
      draft.deployments = draft.deployments.map(item => (item.id === id ? { ...item, status } : item))
    })
  },

  deleteDeployment(id: string): void {
    update(draft => {
      draft.deployments = draft.deployments.filter(item => item.id !== id)
    })
  },
}

function nowText(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}
