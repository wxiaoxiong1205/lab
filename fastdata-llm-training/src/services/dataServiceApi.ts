import { useEffect } from 'react'
import {
  dataServiceActions,
  getDataServiceState,
  replaceDataServiceState,
  type DataServiceState,
  type DatasetRecord,
  type InferenceResultRecord,
  type AnnotationTaskRecord,
  type CleaningTaskRecord,
  useDataServiceStore,
} from './dataServiceStore'
import { type TrainingDatasetUsage } from './datasetUsage'

export type DatasetKind = 'training' | 'validation' | 'test'
export type AnnotationDatasetType = 'text-generation' | 'image-understanding'

export interface DatasetOption {
  value: string
  label: string
  count: number
}

export interface CreateDatasetParams {
  name: string
  dataUsage: TrainingDatasetUsage | '文本生成' | '图像理解'
  dataFormat: 'PROMPT_RESPONSE' | 'ROLE_BASED'
}

export interface AddDatasetVersionParams {
  inheritFromPrevious?: boolean
  description?: string
}

export interface CreateInferenceResultParams {
  name: string
  dataUsage: '文本生成' | '图像理解'
  pendingData: string
  pendingModel: string
}

export interface CreateAnnotationTaskParams {
  name: string
  dataVolume: number
  preDataset: string
}

export interface CreateCleaningTaskParams {
  name: string
  preDataset: string
}

export interface ListQueryParams {
  search?: string
  dataUsage?: string
  page?: number
  pageSize?: number
}

export interface InferenceQueryParams extends ListQueryParams {
  inferenceMode?: string
}

export interface CleaningQueryParams {
  status?: string
  page?: number
  pageSize?: number
}

export interface AnnotationQueryParams {
  page?: number
  pageSize?: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
}

function delay(ms = 120): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

const API_ROOT = '/api/data-service'

async function requestSnapshot(
  input: string,
  init?: RequestInit,
): Promise<DataServiceState | null> {
  if (typeof fetch === 'undefined') {
    return null
  }

  try {
    const response = await fetch(input, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as DataServiceState
  } catch {
    return null
  }
}

async function requestJson<T>(
  input: string,
  init?: RequestInit,
): Promise<T | null> {
  if (typeof fetch === 'undefined') {
    return null
  }

  try {
    const response = await fetch(input, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as T
  } catch {
    return null
  }
}

function buildQueryString(params: object): string {
  const search = new URLSearchParams()
  Object.entries(params as Record<string, string | number | undefined>).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      search.set(key, String(value))
    }
  })
  const query = search.toString()
  return query ? `?${query}` : ''
}

function paginate<T>(items: T[], page = 1, pageSize = 10): PaginatedResult<T> {
  const total = items.length
  const start = (page - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    total,
  }
}

function syncSnapshot(nextState: DataServiceState | null): boolean {
  if (!nextState) {
    return false
  }

  replaceDataServiceState(nextState)
  return true
}

export function useDataServiceSnapshot(): DataServiceState {
  return useDataServiceStore()
}

export function useDataServiceBackendBootstrap(): void {
  useEffect(() => {
    let active = true

    void requestSnapshot(`${API_ROOT}/snapshot`).then(snapshot => {
      if (!active || !snapshot) {
        return
      }

      replaceDataServiceState(snapshot)
    })

    return () => {
      active = false
    }
  }, [])
}

export function selectDatasets(state: DataServiceState, kind: DatasetKind): DatasetRecord[] {
  if (kind === 'training') return state.trainingDatasets
  if (kind === 'validation') return state.validationDatasets
  return state.testDatasets
}

export function selectInferenceResults(state: DataServiceState): InferenceResultRecord[] {
  return state.inferenceResults
}

export function selectAnnotationTasks(state: DataServiceState): AnnotationTaskRecord[] {
  return state.annotationTasks
}

export function selectCleaningTasks(state: DataServiceState): CleaningTaskRecord[] {
  return state.cleaningTasks
}

export function buildAnnotationDatasetOptions(
  state: DataServiceState,
  datasetType: AnnotationDatasetType,
): DatasetOption[] {
  const targetUsage = datasetType === 'image-understanding' ? 'SFT-图像理解' : 'SFT-文本生成'
  const groups = [
    { prefix: '训练数据集', list: state.trainingDatasets },
    { prefix: '验证数据集', list: state.validationDatasets },
    { prefix: '测试数据集', list: state.testDatasets },
  ]

  return groups.flatMap(group =>
    group.list
      .filter(item => item.dataUsage === targetUsage)
      .map<DatasetOption>(item => ({
        value: item.id,
        label: `${group.prefix}/${item.name}-${item.latestVersion}`,
        count: item.sampleCount,
      })),
  )
}

export function buildCleaningDatasetOptions(state: DataServiceState): DatasetOption[] {
  return [
    ...state.trainingDatasets.map(item => ({
      value: item.id,
      label: `训练数据集/${item.name}-${item.latestVersion}`,
      count: item.sampleCount,
    })),
    ...state.testDatasets.map(item => ({
      value: item.id,
      label: `测试数据集/${item.name}-${item.latestVersion}`,
      count: item.sampleCount,
    })),
  ]
}

export function buildInferencePendingDatasetOptions(
  state: DataServiceState,
): Array<{ value: string; label: string }> {
  return [
    ...state.testDatasets.map(item => ({
      value: `测试数据集/${item.name}>${item.latestVersion}`,
      label: `测试数据集/${item.name}>${item.latestVersion}`,
    })),
    ...state.validationDatasets.map(item => ({
      value: `验证数据集/${item.name}>${item.latestVersion}`,
      label: `验证数据集/${item.name}>${item.latestVersion}`,
    })),
  ]
}

function filterDatasets(items: DatasetRecord[], params: ListQueryParams): PaginatedResult<DatasetRecord> {
  const { search = '', dataUsage, page = 1, pageSize = 10 } = params
  const filtered = items.filter(item => {
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase())
    const matchUsage = !dataUsage || item.dataUsage === dataUsage
    return matchSearch && matchUsage
  })
  return paginate(filtered, page, pageSize)
}

function filterInferenceResults(
  items: InferenceResultRecord[],
  params: InferenceQueryParams,
): PaginatedResult<InferenceResultRecord> {
  const { search = '', dataUsage, inferenceMode, page = 1, pageSize = 10 } = params
  const filtered = items.filter(item => {
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase())
    const matchUsage = !dataUsage || item.dataUsage === dataUsage
    const matchMode = !inferenceMode || item.pendingModel.includes(inferenceMode) || item.name.includes(inferenceMode)
    return matchSearch && matchUsage && matchMode
  })
  return paginate(filtered, page, pageSize)
}

function filterCleaningTasks(
  items: CleaningTaskRecord[],
  params: CleaningQueryParams,
): PaginatedResult<CleaningTaskRecord> {
  const { status, page = 1, pageSize = 20 } = params
  const filtered = items.filter(item => !status || item.status === status)
  return paginate(filtered, page, pageSize)
}

export const dataServiceApi = {
  async listDatasets(kind: DatasetKind, params: ListQueryParams): Promise<PaginatedResult<DatasetRecord>> {
    const query = buildQueryString(params)
    const remote = await requestJson<PaginatedResult<DatasetRecord>>(`${API_ROOT}/datasets/${kind}${query}`)
    if (remote) {
      return remote
    }

    return filterDatasets(selectDatasets(getDataServiceState(), kind), params)
  },

  async listInferenceResults(params: InferenceQueryParams): Promise<PaginatedResult<InferenceResultRecord>> {
    const query = buildQueryString(params)
    const remote = await requestJson<PaginatedResult<InferenceResultRecord>>(`${API_ROOT}/inference-results${query}`)
    if (remote) {
      return remote
    }

    return filterInferenceResults(selectInferenceResults(getDataServiceState()), params)
  },

  async listAnnotationTasks(params: AnnotationQueryParams): Promise<PaginatedResult<AnnotationTaskRecord>> {
    const query = buildQueryString(params)
    const remote = await requestJson<PaginatedResult<AnnotationTaskRecord>>(`${API_ROOT}/annotation-tasks${query}`)
    if (remote) {
      return remote
    }

    return paginate(selectAnnotationTasks(getDataServiceState()), params.page ?? 1, params.pageSize ?? 10)
  },

  async listCleaningTasks(params: CleaningQueryParams): Promise<PaginatedResult<CleaningTaskRecord>> {
    const query = buildQueryString(params)
    const remote = await requestJson<PaginatedResult<CleaningTaskRecord>>(`${API_ROOT}/cleaning-tasks${query}`)
    if (remote) {
      return remote
    }

    return filterCleaningTasks(selectCleaningTasks(getDataServiceState()), params)
  },

  async createDataset(kind: DatasetKind, params: CreateDatasetParams): Promise<void> {
    const snapshot = await requestSnapshot(`${API_ROOT}/datasets/${kind}`, {
      method: 'POST',
      body: JSON.stringify(params),
    })

    if (syncSnapshot(snapshot)) {
      return
    }

    await delay()
    dataServiceActions.createDataset(kind, params)
  },

  async addDatasetVersion(kind: DatasetKind, id: string, params?: AddDatasetVersionParams): Promise<void> {
    const snapshot = await requestSnapshot(`${API_ROOT}/datasets/${kind}/${encodeURIComponent(id)}/versions`, {
      method: 'POST',
      body: JSON.stringify(params ?? {}),
    })

    if (syncSnapshot(snapshot)) {
      return
    }

    await delay()
    dataServiceActions.addDatasetVersion(kind, id, params)
  },

  async deleteDataset(kind: DatasetKind, id: string): Promise<void> {
    const snapshot = await requestSnapshot(`${API_ROOT}/datasets/${kind}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })

    if (syncSnapshot(snapshot)) {
      return
    }

    await delay()
    dataServiceActions.deleteDataset(kind, id)
  },

  async createInferenceResult(params: CreateInferenceResultParams): Promise<void> {
    const snapshot = await requestSnapshot(`${API_ROOT}/inference-results`, {
      method: 'POST',
      body: JSON.stringify(params),
    })

    if (syncSnapshot(snapshot)) {
      return
    }

    await delay()
    dataServiceActions.createInferenceResult(params)
  },

  async deleteInferenceResult(id: string): Promise<void> {
    const snapshot = await requestSnapshot(`${API_ROOT}/inference-results/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })

    if (syncSnapshot(snapshot)) {
      return
    }

    await delay()
    dataServiceActions.deleteInferenceResult(id)
  },

  async startInferenceResult(id: string): Promise<void> {
    const snapshot = await requestSnapshot(`${API_ROOT}/inference-results/${encodeURIComponent(id)}/start`, {
      method: 'POST',
    })

    if (syncSnapshot(snapshot)) {
      return
    }

    await delay()
    dataServiceActions.startInferenceResult(id)
  },

  async terminateInferenceResult(id: string): Promise<void> {
    const snapshot = await requestSnapshot(`${API_ROOT}/inference-results/${encodeURIComponent(id)}/terminate`, {
      method: 'POST',
    })

    if (syncSnapshot(snapshot)) {
      return
    }

    await delay()
    dataServiceActions.terminateInferenceResult(id)
  },

  async createAnnotationTask(params: CreateAnnotationTaskParams): Promise<void> {
    const snapshot = await requestSnapshot(`${API_ROOT}/annotation-tasks`, {
      method: 'POST',
      body: JSON.stringify(params),
    })

    if (syncSnapshot(snapshot)) {
      return
    }

    await delay()
    dataServiceActions.createAnnotationTask(params)
  },

  async deleteAnnotationTask(id: string): Promise<void> {
    const snapshot = await requestSnapshot(`${API_ROOT}/annotation-tasks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })

    if (syncSnapshot(snapshot)) {
      return
    }

    await delay()
    dataServiceActions.deleteAnnotationTask(id)
  },

  async createCleaningTask(params: CreateCleaningTaskParams): Promise<void> {
    const snapshot = await requestSnapshot(`${API_ROOT}/cleaning-tasks`, {
      method: 'POST',
      body: JSON.stringify(params),
    })

    if (syncSnapshot(snapshot)) {
      return
    }

    await delay()
    dataServiceActions.createCleaningTask(params)
  },

  async deleteCleaningTask(id: string): Promise<void> {
    const snapshot = await requestSnapshot(`${API_ROOT}/cleaning-tasks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })

    if (syncSnapshot(snapshot)) {
      return
    }

    await delay()
    dataServiceActions.deleteCleaningTask(id)
  },

  async startCleaningTask(id: string): Promise<void> {
    const snapshot = await requestSnapshot(`${API_ROOT}/cleaning-tasks/${encodeURIComponent(id)}/start`, {
      method: 'POST',
    })

    if (syncSnapshot(snapshot)) {
      return
    }

    await delay()
    dataServiceActions.startCleaningTask(id)
  },
}
