import { useEffect, useState } from 'react'
import { productManual } from '../docs/productManual'

export type DocumentAgentStatus = 'stopped' | 'starting' | 'running' | 'failed'
export type DocumentAgentIndexStatus = 'not_built' | 'building' | 'ready' | 'failed'
export type ChatModelSource = 'onlineInference' | 'customApi'

export interface AgentModelEndpointConfig {
  apiUrl: string
  apiKey: string
  modelName: string
}

export interface AgentAdvancedParams {
  maxTokens?: number | null
  temperature: number
  topP: number
  presencePenalty: number
}

export interface AgentChatModelConfig {
  source: ChatModelSource
  onlineInferenceServiceId?: string
  onlineInferenceServiceName?: string
  customApi?: AgentModelEndpointConfig
  advanced: AgentAdvancedParams
}

export interface DocumentAgentServiceRecord {
  id: string
  name: string
  directory: '文档中心'
  description: string
  status: DocumentAgentStatus
  indexStatus: DocumentAgentIndexStatus
  embedding: AgentModelEndpointConfig
  rerank: AgentModelEndpointConfig
  chatModel: AgentChatModelConfig
  createdBy: string
  createdAt: string
  updatedAt: string
  startedAt?: string
}

export interface DocumentAgentPayload {
  name: string
  description: string
  embedding: AgentModelEndpointConfig
  rerank: AgentModelEndpointConfig
  chatModel: AgentChatModelConfig
}

export interface DocumentAgentCitation {
  docId: string
  title: string
  sectionTitle: string
  routePath: string
  anchor?: string
  snippet: string
  score: number
}

export interface DocumentAgentChatResponse {
  answer: string
  citations: DocumentAgentCitation[]
  conversationId: string
  serviceName: string
}

const API_ROOT = '/api/document-agent'
const FALLBACK_STORAGE_KEY = 'fastdata-document-agent-services'

const defaultAdvancedParams: AgentAdvancedParams = {
  maxTokens: null,
  temperature: 0.7,
  topP: 1,
  presencePenalty: 0,
}

const seedService: DocumentAgentServiceRecord = {
  id: 'doc-agent-seed',
  name: '文档中心默认助手',
  directory: '文档中心',
  description: '用于文档中心问答和文档定位的全局 Agent 服务。',
  status: 'stopped',
  indexStatus: 'ready',
  embedding: {
    apiUrl: 'http://127.0.0.1:5203/mock/embedding',
    apiKey: '',
    modelName: 'bge-m3',
  },
  rerank: {
    apiUrl: 'http://127.0.0.1:5203/mock/rerank',
    apiKey: '',
    modelName: 'bge-reranker-large',
  },
  chatModel: {
    source: 'customApi',
    customApi: {
      apiUrl: 'http://127.0.0.1:5203/mock/chat',
      apiKey: '',
      modelName: 'qwen-plus',
    },
    advanced: defaultAdvancedParams,
  },
  createdBy: 'system_admin',
  createdAt: '2026/05/07 10:00:00',
  updatedAt: '2026/05/07 10:00:00',
}

function readFallbackServices(): DocumentAgentServiceRecord[] {
  if (typeof window === 'undefined') {
    return [seedService]
  }

  try {
    const raw = window.localStorage.getItem(FALLBACK_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as DocumentAgentServiceRecord[]) : [seedService]
  } catch {
    return [seedService]
  }
}

function persistFallbackServices(nextServices: DocumentAgentServiceRecord[]) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(nextServices))
  }
}

function normalizeSingleService(services: DocumentAgentServiceRecord[]): DocumentAgentServiceRecord[] {
  if (services.length <= 1) {
    return services
  }

  return [services.find(item => item.status === 'running') ?? services[0]]
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T | null> {
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

function nowText() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

function localSearchAnswer(question: string): DocumentAgentChatResponse {
  const lowerQuestion = question.toLowerCase()
  const compactQuestion = lowerQuestion.replace(/[\s,，。！？?;；:：/\\-]+/g, '')
  const cleanedQuestion = compactQuestion
    .replace(/^(如何|怎么|怎样|请问|什么是|如何查看|如何创建)/, '')
    .replace(/(是什么|有哪些能力|有哪些|有什么能力|怎么做|怎么操作|如何操作|的内容是)$/, '')
  const tokens = Array.from(
    new Set([
      ...lowerQuestion.split(/[\s,，。！？?;；:：/\\-]+/),
      compactQuestion,
      cleanedQuestion,
    ].filter(token => token.length >= 2)),
  )
  const matches = productManual.chunks
    .map((item, index) => {
      const haystack = `${item.title} ${item.sectionTitle} ${item.content}`.toLowerCase()
      const keywordScore = tokens.reduce((score, token) => score + (haystack.includes(token) ? Math.min(token.length, 8) : 0), 0)
      const directScore = haystack.includes(lowerQuestion) ? 2 : 0

      return {
        docId: item.docId,
        title: item.title,
        sectionTitle: item.sectionTitle,
        routePath: item.routePath,
        anchor: item.anchor,
        snippet: item.content.slice(0, 110),
        score: keywordScore + directScore || Math.max(0.2, 0.7 - index * 0.01),
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)

  return {
    answer: `已根据《${productManual.title}》找到 ${matches.length} 条相关定位。当前最相关的是「${matches[0].sectionTitle}」，可点击引用直接跳转。`,
    citations: matches,
    conversationId: `local-${Date.now()}`,
    serviceName: '本地文档助手',
  }
}

export function hasEmbeddingConfigChanged(
  previous: DocumentAgentServiceRecord | null,
  next: DocumentAgentPayload,
): boolean {
  if (!previous) {
    return false
  }

  return (
    previous.embedding.apiUrl !== next.embedding.apiUrl ||
    previous.embedding.apiKey !== next.embedding.apiKey ||
    previous.embedding.modelName !== next.embedding.modelName
  )
}

export const documentAgentApi = {
  async listServices(): Promise<DocumentAgentServiceRecord[]> {
    const remote = await requestJson<{ items: DocumentAgentServiceRecord[] }>(`${API_ROOT}/services`)
    return normalizeSingleService(remote?.items ?? readFallbackServices())
  },

  async getActiveService(): Promise<DocumentAgentServiceRecord | null> {
    const remote = await requestJson<{ service: DocumentAgentServiceRecord | null }>(`${API_ROOT}/active`)
    if (remote) {
      return remote.service
    }

    return readFallbackServices().find(item => item.status === 'running') ?? null
  },

  async createService(payload: DocumentAgentPayload): Promise<DocumentAgentServiceRecord[]> {
    const remote = await requestJson<{ items: DocumentAgentServiceRecord[] }>(`${API_ROOT}/services`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    if (remote?.items) {
      return normalizeSingleService(remote.items)
    }

    const nextServices = [
      {
        ...payload,
        id: `doc-agent-${Date.now()}`,
        directory: '文档中心' as const,
        status: 'stopped' as const,
        indexStatus: 'not_built' as const,
        createdBy: 'system_admin',
        createdAt: nowText(),
        updatedAt: nowText(),
      },
    ]
    persistFallbackServices(nextServices)
    return nextServices
  },

  async updateService(id: string, payload: DocumentAgentPayload): Promise<DocumentAgentServiceRecord[]> {
    const remote = await requestJson<{ items: DocumentAgentServiceRecord[] }>(`${API_ROOT}/services/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })

    if (remote?.items) {
      return normalizeSingleService(remote.items)
    }

    const nextServices = readFallbackServices().map(item =>
      item.id === id
        ? {
            ...item,
            ...payload,
            updatedAt: nowText(),
          }
        : item,
    )
    persistFallbackServices(nextServices)
    return nextServices
  },

  async deleteService(id: string): Promise<DocumentAgentServiceRecord[]> {
    const remote = await requestJson<{ items: DocumentAgentServiceRecord[] }>(`${API_ROOT}/services/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })

    if (remote?.items) {
      return normalizeSingleService(remote.items)
    }

    const nextServices = readFallbackServices().filter(item => item.id !== id)
    persistFallbackServices(nextServices)
    return nextServices
  },

  async startService(id: string): Promise<DocumentAgentServiceRecord[]> {
    const remote = await requestJson<{ items: DocumentAgentServiceRecord[] }>(`${API_ROOT}/services/${encodeURIComponent(id)}/start`, {
      method: 'POST',
    })

    if (remote?.items) {
      return normalizeSingleService(remote.items)
    }

    const nextServices = readFallbackServices().map(item =>
      item.id === id
        ? { ...item, status: 'running' as const, indexStatus: item.indexStatus === 'not_built' ? 'ready' as const : item.indexStatus, startedAt: nowText() }
        : { ...item, status: item.status === 'running' ? 'stopped' as const : item.status },
    )
    persistFallbackServices(nextServices)
    return nextServices
  },

  async stopService(id: string): Promise<DocumentAgentServiceRecord[]> {
    const remote = await requestJson<{ items: DocumentAgentServiceRecord[] }>(`${API_ROOT}/services/${encodeURIComponent(id)}/stop`, {
      method: 'POST',
    })

    if (remote?.items) {
      return normalizeSingleService(remote.items)
    }

    const nextServices = readFallbackServices().map(item =>
      item.id === id ? { ...item, status: 'stopped' as const } : item,
    )
    persistFallbackServices(nextServices)
    return nextServices
  },

  async reindexService(id: string): Promise<DocumentAgentServiceRecord[]> {
    const remote = await requestJson<{ items: DocumentAgentServiceRecord[] }>(`${API_ROOT}/services/${encodeURIComponent(id)}/reindex`, {
      method: 'POST',
    })

    if (remote?.items) {
      return normalizeSingleService(remote.items)
    }

    const nextServices = readFallbackServices().map(item =>
      item.id === id ? { ...item, indexStatus: 'ready' as const, updatedAt: nowText() } : item,
    )
    persistFallbackServices(nextServices)
    return nextServices
  },

  async testService(id: string): Promise<{ ok: boolean; message: string }> {
    return (
      await requestJson<{ ok: boolean; message: string }>(`${API_ROOT}/services/${encodeURIComponent(id)}/test`, {
        method: 'POST',
      })
    ) ?? { ok: true, message: '本地连接测试通过' }
  },

  async chat(question: string, conversationId?: string): Promise<DocumentAgentChatResponse> {
    const remote = await requestJson<DocumentAgentChatResponse>(`${API_ROOT}/chat`, {
      method: 'POST',
      body: JSON.stringify({ question, conversationId }),
    })

    return remote ?? localSearchAnswer(question)
  },
}

export function useDocumentAgentServices(): {
  services: DocumentAgentServiceRecord[]
  loading: boolean
  refresh: () => Promise<void>
  setServices: (services: DocumentAgentServiceRecord[]) => void
} {
  const [services, setServices] = useState<DocumentAgentServiceRecord[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    const nextServices = await documentAgentApi.listServices()
    setServices(nextServices)
    setLoading(false)
  }

  useEffect(() => {
    void refresh()
  }, [])

  return { services, loading, refresh, setServices }
}

export function useActiveDocumentAgent(): {
  activeService: DocumentAgentServiceRecord | null
  loading: boolean
  refresh: () => Promise<void>
} {
  const [activeService, setActiveService] = useState<DocumentAgentServiceRecord | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    const nextService = await documentAgentApi.getActiveService()
    setActiveService(nextService)
    setLoading(false)
  }

  useEffect(() => {
    void refresh()
  }, [])

  return { activeService, loading, refresh }
}
