import { getDataServiceState } from './dataServiceStore'
import type { DatasetKind } from './dataServiceApi'
import { getMachineDeploymentState } from './machineDeploymentStore'
import { canAccessResourceData, getCurrentUser, getPermissionState, type DataPermissionDomain } from './permissionStore'
import { getTrainingTasks } from './trainingTaskStore'

export type ResourceLock = {
  taskName: string
  taskType: string
  status: string
  reference: string
}

export type ResourceDeletePermission = {
  allowed: boolean
  reason?: string
}

function normalize(value?: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[>\s/\\_-]/g, '')
}

function referencesAny(reference: string | undefined, candidates: string[]): boolean {
  const normalizedReference = normalize(reference)
  if (!normalizedReference || normalizedReference === '-') {
    return false
  }

  return candidates.some(candidate => {
    const normalizedCandidate = normalize(candidate)
    return Boolean(
      normalizedCandidate &&
        (normalizedReference.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedReference)),
    )
  })
}

function datasetPrefix(kind: DatasetKind): string {
  if (kind === 'training') return '训练数据集'
  if (kind === 'validation') return '验证数据集'
  return '测试数据集'
}

export function formatResourceLockMessage(resourceName: string, locks: ResourceLock[]): string {
  const topLocks = locks.slice(0, 3).map(lock => `${lock.taskType}「${lock.taskName}」(${lock.status})`)
  const suffix = locks.length > 3 ? ` 等 ${locks.length} 个任务` : ''
  return `${resourceName} 正被任务引用：${topLocks.join('、')}${suffix}。请先删除相关任务或停止引用链后再删除该资源。`
}

export function getCreatorDeletePermission(creator?: string, domain: DataPermissionDomain = 'llm'): ResourceDeletePermission {
  const permissionState = getPermissionState()
  const currentUser = getCurrentUser(permissionState)
  const result = canAccessResourceData(domain, creator, permissionState)

  if (result.allowed) {
    return { allowed: true }
  }

  return {
    allowed: false,
    reason: `权限不足：当前账号 ${currentUser.account} 仅可操作个人资源，资源创建人：${creator || '-'}`,
  }
}

export function getDatasetReferenceLocks(kind: DatasetKind, datasetId: string): ResourceLock[] {
  const state = getDataServiceState()
  const list = kind === 'training' ? state.trainingDatasets : kind === 'validation' ? state.validationDatasets : state.testDatasets
  const dataset = list.find(item => item.id === datasetId)
  if (!dataset) {
    return []
  }

  const prefix = datasetPrefix(kind)
  const candidates = [
    dataset.id,
    dataset.name,
    `${dataset.name}-${dataset.latestVersion}`,
    `${dataset.name}>${dataset.latestVersion}`,
    `${prefix}/${dataset.name}`,
    `${prefix}/${dataset.name}-${dataset.latestVersion}`,
    `${prefix}/${dataset.name}>${dataset.latestVersion}`,
  ]

  const locks: ResourceLock[] = []

  state.inferenceResults.forEach(task => {
    if (referencesAny(task.pendingData, candidates)) {
      locks.push({ taskName: task.name, taskType: '推理任务', status: task.progress, reference: task.pendingData })
    }
  })

  state.annotationTasks.forEach(task => {
    if (referencesAny(task.preDataset, candidates)) {
      locks.push({ taskName: task.name, taskType: '标注任务', status: task.status ?? '未开始', reference: task.preDataset })
    }
  })

  state.cleaningTasks.forEach(task => {
    if (referencesAny(task.preDataset, candidates)) {
      locks.push({ taskName: task.name, taskType: '清洗任务', status: task.status, reference: task.preDataset })
    }
  })

  getTrainingTasks().forEach(task => {
    task.versions.forEach(version => {
      const dataset = version.dataset as unknown as { train?: { name?: string }; name?: string } | undefined
      const datasetName = dataset?.train?.name ?? dataset?.name
      if (datasetName && referencesAny(datasetName, candidates)) {
        locks.push({ taskName: task.name, taskType: '训练任务', status: version.status, reference: datasetName })
      }
    })
  })

  return locks
}

export function getModelReferenceLocks(modelName: string): ResourceLock[] {
  const state = getDataServiceState()
  const candidates = [modelName]
  const locks: ResourceLock[] = []

  state.inferenceResults.forEach(task => {
    if (referencesAny(task.pendingModel, candidates)) {
      locks.push({ taskName: task.name, taskType: '推理任务', status: task.progress, reference: task.pendingModel })
    }
  })

  getMachineDeploymentState().deployments.forEach(task => {
    const reference = task.standardConfig?.model ?? task.targetSummary
    if (referencesAny(reference, candidates)) {
      locks.push({ taskName: task.name, taskType: '部署任务', status: task.status, reference })
    }
  })

  getTrainingTasks().forEach(task => {
    task.versions.forEach(version => {
      const reference = version.baseModel || task.baseModel
      if (referencesAny(reference, candidates)) {
        locks.push({ taskName: task.name, taskType: '训练任务', status: version.status, reference })
      }
    })
  })

  return locks
}

export function getOnlineInferenceServiceReferenceLocks(serviceName: string): ResourceLock[] {
  const state = getDataServiceState()
  const candidates = [serviceName]
  const locks: ResourceLock[] = []

  state.inferenceResults.forEach(task => {
    if (referencesAny(task.pendingModel, candidates)) {
      locks.push({ taskName: task.name, taskType: '推理任务', status: task.progress, reference: task.pendingModel })
    }
  })

  state.annotationTasks.forEach(task => {
    const reference = `${task.name} ${task.datasetType === 'image-understanding' ? '图像理解' : '文本生成'} 在线推理服务`
    if (referencesAny(reference, candidates)) {
      locks.push({ taskName: task.name, taskType: '标注任务', status: task.status ?? '未开始', reference })
    }
  })

  return locks
}

export function getOnlineAnnotationServiceReferenceLocks(serviceName: string, targetDataset?: string): ResourceLock[] {
  const state = getDataServiceState()
  const candidates = [serviceName, targetDataset ?? ''].filter(Boolean)
  const locks: ResourceLock[] = []

  state.annotationTasks.forEach(task => {
    if (referencesAny(task.preDataset, candidates)) {
      locks.push({ taskName: task.name, taskType: '标注任务', status: task.status ?? '未开始', reference: task.preDataset })
    }
  })

  return locks
}
