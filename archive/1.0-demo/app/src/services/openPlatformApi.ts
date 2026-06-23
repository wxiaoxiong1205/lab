import { useSyncExternalStore } from 'react'

export interface AccessKeyRecord {
  id: string
  ownerAccount: string
  accessKeyId: string
  secretAccessKey: string
  createdAt: string
}

const STORAGE_KEY = 'lab-coding:open-platform-access-keys:v2'

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

function cloneRecords(records: AccessKeyRecord[]) {
  return JSON.parse(JSON.stringify(records)) as AccessKeyRecord[]
}

function loadRecords(): AccessKeyRecord[] {
  if (typeof window === 'undefined') {
    return []
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as AccessKeyRecord[]
    return parsed.filter(item => item.ownerAccount && item.accessKeyId && item.secretAccessKey)
  } catch {
    return []
  }
}

let records = loadRecords()

function persistRecords(nextRecords: AccessKeyRecord[]) {
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

export function useOpenPlatformAccessKeys(ownerAccount: string): AccessKeyRecord[] {
  const snapshot = useSyncExternalStore(subscribeOpenPlatformApi, getSnapshot, getSnapshot)
  return snapshot.filter(item => item.ownerAccount === ownerAccount).slice(0, 1)
}

export const openPlatformApi = {
  listAccessKeys(ownerAccount: string): AccessKeyRecord[] {
    return cloneRecords(records.filter(item => item.ownerAccount === ownerAccount).slice(0, 1))
  },

  createAccessKey(ownerAccount: string): AccessKeyRecord {
    const existing = records.find(item => item.ownerAccount === ownerAccount)
    if (existing) {
      return cloneRecords([existing])[0]
    }

    const record: AccessKeyRecord = {
      id: `access-key-${Date.now()}-${randomToken(6)}`,
      ownerAccount,
      accessKeyId: `AKID${randomToken(20)}`,
      secretAccessKey: `SAK${randomToken(32)}`,
      createdAt: new Date().toISOString(),
    }

    persistRecords([record, ...records])
    return cloneRecords([record])[0]
  },

  deleteAccessKey(id: string) {
    persistRecords(records.filter(item => item.id !== id))
  },
}
