import { useSyncExternalStore } from 'react'

export type ApiKeyStatus = 'active' | 'disabled' | 'expired'

export interface ApiKeyRecord {
  id: string
  ownerAccount: string
  name: string
  keyPrefix: string
  keyPreview: string
  status: Exclude<ApiKeyStatus, 'expired'>
  expiresAt: string | null
  createdAt: string
  lastUsedAt: string | null
  remark: string
}

export interface CreateApiKeyPayload {
  ownerAccount: string
  name: string
  validityDays: number | null
  remark: string
}

const STORAGE_KEY = 'lab-coding:open-platform-api-keys:v1'

const listeners = new Set<() => void>()

function randomToken(length: number) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  let value = ''
  const randomValues = new Uint32Array(length)

  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(randomValues)
  } else {
    for (let index = 0; index < length; index += 1) {
      randomValues[index] = Math.floor(Math.random() * chars.length)
    }
  }

  for (let index = 0; index < length; index += 1) {
    value += chars[randomValues[index] % chars.length]
  }

  return value
}

function createDate(offsetDays: number) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return date.toISOString()
}

function seedRecords(): ApiKeyRecord[] {
  const now = new Date().toISOString()
  return [
    {
      id: 'api-key-seed-active',
      ownerAccount: 'zhangsan',
      name: '开发联调密钥',
      keyPrefix: 'dlab_live_9K2M',
      keyPreview: 'dlab_live_9K2M****Q8zP',
      status: 'active',
      expiresAt: createDate(30),
      createdAt: now,
      lastUsedAt: now,
      remark: '用于本地联调和开发指南示例。',
    },
    {
      id: 'api-key-seed-expired',
      ownerAccount: 'zhangsan',
      name: '历史测试密钥',
      keyPrefix: 'dlab_live_7H4T',
      keyPreview: 'dlab_live_7H4T****A2nK',
      status: 'active',
      expiresAt: createDate(-3),
      createdAt: createDate(-40),
      lastUsedAt: createDate(-8),
      remark: '用于展示过期密钥状态。',
    },
  ]
}

function cloneRecords(records: ApiKeyRecord[]) {
  return JSON.parse(JSON.stringify(records)) as ApiKeyRecord[]
}

function loadRecords(): ApiKeyRecord[] {
  if (typeof window === 'undefined') {
    return seedRecords()
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const seeded = seedRecords()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded))
    return seeded
  }

  try {
    return JSON.parse(raw) as ApiKeyRecord[]
  } catch {
    return seedRecords()
  }
}

let records = loadRecords()

function persistRecords(nextRecords: ApiKeyRecord[]) {
  records = nextRecords
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRecords))
  }
  listeners.forEach(listener => listener())
}

function getSnapshot() {
  return records
}

export function subscribeOpenPlatformApi(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useOpenPlatformApiKeys(ownerAccount: string): ApiKeyRecord[] {
  const snapshot = useSyncExternalStore(subscribeOpenPlatformApi, getSnapshot, getSnapshot)
  return snapshot.filter(item => item.ownerAccount === ownerAccount)
}

export function getApiKeyComputedStatus(record: ApiKeyRecord): ApiKeyStatus {
  if (record.status === 'disabled') {
    return 'disabled'
  }
  if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
    return 'expired'
  }
  return 'active'
}

export const openPlatformApi = {
  listApiKeys(ownerAccount: string): ApiKeyRecord[] {
    return cloneRecords(records.filter(item => item.ownerAccount === ownerAccount))
  },

  createApiKey(payload: CreateApiKeyPayload): { record: ApiKeyRecord; plainTextKey: string } {
    const fullKey = `dlab_live_${randomToken(12)}_${randomToken(24)}`
    const keyPrefix = fullKey.slice(0, 14)
    const now = new Date()
    const expiresAt = payload.validityDays === null
      ? null
      : new Date(now.getTime() + payload.validityDays * 24 * 60 * 60 * 1000).toISOString()
    const record: ApiKeyRecord = {
      id: `api-key-${Date.now()}-${randomToken(6)}`,
      ownerAccount: payload.ownerAccount,
      name: payload.name,
      keyPrefix,
      keyPreview: `${keyPrefix}****${fullKey.slice(-4)}`,
      status: 'active',
      expiresAt,
      createdAt: now.toISOString(),
      lastUsedAt: null,
      remark: payload.remark,
    }

    persistRecords([record, ...records])
    return { record: cloneRecords([record])[0], plainTextKey: fullKey }
  },

  disableApiKey(id: string) {
    persistRecords(records.map(item => (item.id === id ? { ...item, status: 'disabled' } : item)))
  },

  deleteApiKey(id: string) {
    persistRecords(records.filter(item => item.id !== id))
  },
}
