import { useSyncExternalStore } from 'react'

export type FileFolderRecord = {
  id: string
  name: string
  description: string
  creator: string
  createdAt: string
}

export type FolderFileRecord = {
  id: string
  name: string
  size: string
  type: string
}

export type NotebookFileMountRecord = {
  key: string
  folderId: string
  folderName: string
  fileName: string
  size: string
  type: string
  mountPath: string
}

const FOLDERS_STORAGE_KEY = 'fastdata-file-management-folders'
const FILES_STORAGE_KEY = 'fastdata-file-management-files'
const CHANGE_EVENT = 'fastdata-file-management-change'
let cachedMountsKey = '__unset__'
let cachedMounts: NotebookFileMountRecord[] = []

export const seedFileManagementFolders: FileFolderRecord[] = [
  { id: 'folder-size-check', name: '文件大小校验', description: '-', creator: 'lab1', createdAt: '2026-05-21 15:46:23' },
  { id: 'folder-retry', name: '失败重试', description: '-', creator: 'deepexilab', createdAt: '2026-05-21 15:31:10' },
  { id: 'folder-cancel-upload', name: '取消上传验证', description: '-', creator: 'lab1', createdAt: '2026-05-21 14:58:42' },
  { id: 'folder-description', name: '描述测试', description: '# 推理结果集 |--...', creator: 'lab1', createdAt: '2026-05-20 19:22:16' },
  { id: 'folder-demo-111', name: '测试111', description: '-', creator: 'lab1', createdAt: '2026-05-20 18:40:03' },
  { id: 'folder-test7', name: 'test7', description: '-', creator: 'lab1', createdAt: '2026-05-20 17:26:38' },
]

export const seedFolderFiles: FolderFileRecord[] = [
  { id: 'file-1', name: '文本生成偏好样例(alpaca)-制表符.xlsx', size: '24.43 KB', type: '.xlsx' },
  { id: 'file-2', name: '文本生成偏好样例(alpaca)-制表符.jsonl', size: '11.61 KB', type: '.jsonl' },
  { id: 'file-3', name: '文本生成偏好样例(alpaca)-制表符.json', size: '11.91 KB', type: '.json' },
  { id: 'file-4', name: '文本生成偏好样例(alpaca)-空格.xlsx', size: '24.43 KB', type: '.xlsx' },
  { id: 'file-5', name: '文本生成偏好样例(alpaca)-换行符.xlsx', size: '24.43 KB', type: '.xlsx' },
  { id: 'file-6', name: '文本生成偏好样例(alpaca)-空格.jsonl', size: '11.61 KB', type: '.jsonl' },
  { id: 'file-7', name: '文本生成偏好样例(alpaca)-空格.json', size: '11.91 KB', type: '.json' },
  { id: 'file-8', name: '文本生成偏好样例(alpaca)-换行符.jsonl', size: '11.61 KB', type: '.jsonl' },
  { id: 'file-9', name: '文本生成偏好样例(alpaca)-换行符.xlsx', size: '24.43 KB', type: '.xlsx' },
]

function defaultFilesByFolder(): Record<string, FolderFileRecord[]> {
  return {
    [seedFileManagementFolders[0].id]: seedFolderFiles,
  }
}

function emitChange() {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) {
    return fallback
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function loadFileManagementFolders(): FileFolderRecord[] {
  if (typeof window === 'undefined') {
    return seedFileManagementFolders
  }

  return safeParse<FileFolderRecord[]>(window.localStorage.getItem(FOLDERS_STORAGE_KEY), seedFileManagementFolders)
}

export function saveFileManagementFolders(folders: FileFolderRecord[]) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders))
  emitChange()
}

export function loadFileManagementFiles(): Record<string, FolderFileRecord[]> {
  if (typeof window === 'undefined') {
    return defaultFilesByFolder()
  }

  return safeParse<Record<string, FolderFileRecord[]>>(window.localStorage.getItem(FILES_STORAGE_KEY), defaultFilesByFolder())
}

export function saveFileManagementFiles(filesByFolder: Record<string, FolderFileRecord[]>) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(FILES_STORAGE_KEY, JSON.stringify(filesByFolder))
  emitChange()
}

export function getFileManagementNotebookMounts(): NotebookFileMountRecord[] {
  const snapshotKey = typeof window === 'undefined'
    ? 'server'
    : `${window.localStorage.getItem(FOLDERS_STORAGE_KEY) ?? ''}::${window.localStorage.getItem(FILES_STORAGE_KEY) ?? ''}`

  if (snapshotKey === cachedMountsKey) {
    return cachedMounts
  }

  const folders = loadFileManagementFolders()
  const filesByFolder = loadFileManagementFiles()

  cachedMountsKey = snapshotKey
  cachedMounts = folders.flatMap(folder =>
    (filesByFolder[folder.id] ?? []).map(file => ({
      key: `${folder.id}-${file.id}`,
      folderId: folder.id,
      folderName: folder.name,
      fileName: file.name,
      size: file.size,
      type: file.type,
      mountPath: `/workspace/file-management/${folder.name}/${file.name}`,
    })),
  )

  return cachedMounts
}

export function subscribeFileManagementStore(listener: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === FOLDERS_STORAGE_KEY || event.key === FILES_STORAGE_KEY) {
      listener()
    }
  }

  window.addEventListener(CHANGE_EVENT, listener)
  window.addEventListener('storage', handleStorage)

  return () => {
    window.removeEventListener(CHANGE_EVENT, listener)
    window.removeEventListener('storage', handleStorage)
  }
}

export function useFileManagementNotebookMounts(): NotebookFileMountRecord[] {
  return useSyncExternalStore(
    subscribeFileManagementStore,
    getFileManagementNotebookMounts,
    getFileManagementNotebookMounts,
  )
}
