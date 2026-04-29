import { useEffect, useState } from 'react'

export type OnlineServiceConnectionStatus = '测试通过' | '测试失败'
export type OnlineServiceModelType = '文本生成' | '图像理解' | '图像理解/文本生成'

export type OnlineInferenceServiceRecord = {
  id: string
  name: string
  connectionStatus: OnlineServiceConnectionStatus
  description: string
  modelType: OnlineServiceModelType
  creator: string
  createdAt: string
}

const STORAGE_KEY = 'fastdata-online-inference-services'

const seedServices: OnlineInferenceServiceRecord[] = [
  {
    id: 'svc-1',
    name: 'qwen3-vl-plus-图像理解-在线推理服务',
    connectionStatus: '测试通过',
    description: '测试2',
    modelType: '图像理解',
    creator: 'deepexilab',
    createdAt: '2026/03/19 14:04:46',
  },
  {
    id: 'svc-2',
    name: 'Qwen3-Next-80B-A3B-Instruct-文本生成-在线推理服务',
    connectionStatus: '测试通过',
    description: '测试',
    modelType: '文本生成',
    creator: 'deepexilab',
    createdAt: '2026/03/19 14:04:43',
  },
  {
    id: 'svc-3',
    name: 'test2323243',
    connectionStatus: '测试失败',
    description: '文本生成',
    modelType: '文本生成',
    creator: 'system_admin',
    createdAt: '2026/03/06 16:06:22',
  },
]

let memoryState = readInitialState()
const listeners = new Set<() => void>()

function readInitialState(): OnlineInferenceServiceRecord[] {
  if (typeof window === 'undefined') {
    return seedServices
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as OnlineInferenceServiceRecord[]) : seedServices
  } catch {
    return seedServices
  }
}

function persist(nextState: OnlineInferenceServiceRecord[]) {
  memoryState = nextState
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState))
  }
  listeners.forEach(listener => listener())
}

export function getOnlineInferenceServices(): OnlineInferenceServiceRecord[] {
  return memoryState
}

export function useOnlineInferenceServices(): OnlineInferenceServiceRecord[] {
  const [state, setState] = useState(() => memoryState)

  useEffect(() => {
    const listener = () => setState([...memoryState])
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  return state
}

export const onlineInferenceServiceActions = {
  createService(record: Omit<OnlineInferenceServiceRecord, 'id' | 'createdAt'>) {
    persist([
      {
        ...record,
        id: `svc-${Date.now()}`,
        createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      },
      ...memoryState,
    ])
  },
  updateService(id: string, updater: (record: OnlineInferenceServiceRecord) => OnlineInferenceServiceRecord) {
    persist(memoryState.map(item => (item.id === id ? updater(item) : item)))
  },
}
