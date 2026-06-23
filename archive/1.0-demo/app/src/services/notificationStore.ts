import { useSyncExternalStore } from 'react'
import {
  getCurrentProject,
  getCurrentUser,
  getPermissionState,
  type PermissionState,
} from './permissionStore'

export type TaskNotificationType =
  | 'training'
  | 'inference'
  | 'cleaning'
  | 'annotation'
  | 'deployment'
  | 'notebook'
  | 'notebook_case'
  | 'image_build'

export type TaskNotificationSeverity = 'info' | 'success' | 'warning' | 'error'
export type TaskNotificationStatus = 'created' | 'started' | 'completed' | 'failed' | 'terminated' | 'action_required'

export interface TaskNotification {
  id: string
  title: string
  content: string
  type: TaskNotificationType
  severity: TaskNotificationSeverity
  status: TaskNotificationStatus
  taskId: string
  taskName: string
  taskModule: string
  projectId?: string
  recipientAccounts: string[]
  readAccounts: string[]
  createdAt: string
  targetPath: string
}

export interface CreateTaskNotificationInput {
  title?: string
  content?: string
  type: TaskNotificationType
  severity?: TaskNotificationSeverity
  status: TaskNotificationStatus
  taskId: string
  taskName: string
  taskModule: string
  projectId?: string
  recipientAccounts?: string[]
  actorAccount?: string
  targetPath: string
}

const STORAGE_KEY = 'lab-coding:task-notification-store:v1'

const TASK_TYPE_LABEL: Record<TaskNotificationType, string> = {
  training: '大模型训练',
  inference: '推理结果集',
  cleaning: '数据清洗',
  annotation: '数据标注',
  deployment: '模型部署',
  notebook: '在线Notebook',
  notebook_case: 'Notebook案例',
  image_build: '自定义镜像',
}

const STATUS_LABEL: Record<TaskNotificationStatus, string> = {
  created: '已创建',
  started: '已启动',
  completed: '已完成',
  failed: '失败',
  terminated: '已终止',
  action_required: '待处理',
}

function nowText(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function getRelatedAccounts(permissionState: PermissionState, projectId?: string, actorAccount?: string): string[] {
  const currentProject = projectId
    ? permissionState.projects.find(item => item.id === projectId)
    : getCurrentProject(permissionState)
  const platformAdmins = permissionState.users
    .filter(user => user.roleKeys.includes('platform_admin'))
    .map(user => user.account)
  const projectAdmins = currentProject?.members
    .filter(member => member.roleKey === 'project_admin' || member.roleKey === 'platform_admin')
    .map(member => member.account) ?? []
  const currentUser = getCurrentUser(permissionState)

  return unique([actorAccount ?? currentUser.account, currentUser.account, ...platformAdmins, ...projectAdmins])
}

const seedNotifications: TaskNotification[] = [
  {
    id: 'notice-seed-training-failed',
    title: '图像理解-SFT训练 V3 失败',
    content: '训练版本执行失败，请进入任务详情查看日志并重新提交。',
    type: 'training',
    severity: 'error',
    status: 'failed',
    taskId: '3',
    taskName: '图像理解-SFT训练',
    taskModule: '大模型训练',
    projectId: 'project-1',
    recipientAccounts: ['zhangsan', 'lisi'],
    readAccounts: [],
    createdAt: '2026/05/12 09:12:00',
    targetPath: '/training/detail/3',
  },
  {
    id: 'notice-seed-notebook-running',
    title: 'Notebook 已进入运行中',
    content: '新建 Notebook-无数据集和模型 已启动完成，可进入详情打开 Notebook。',
    type: 'notebook',
    severity: 'success',
    status: 'completed',
    taskId: 'nb-1',
    taskName: '新建 Notebook-无数据集和模型',
    taskModule: '在线Notebook',
    projectId: 'project-1',
    recipientAccounts: ['zhangsan', 'lisi'],
    readAccounts: ['lisi'],
    createdAt: '2026/05/12 09:05:00',
    targetPath: '/finetune/notebooks/nb-1',
  },
  {
    id: 'notice-seed-inference-created',
    title: '推理结果集任务已创建',
    content: '测试111 已创建，等待启动处理。',
    type: 'inference',
    severity: 'info',
    status: 'created',
    taskId: 'inf-2',
    taskName: '测试111',
    taskModule: '推理结果集',
    projectId: 'project-1',
    recipientAccounts: ['zhangsan', 'lisi'],
    readAccounts: [],
    createdAt: '2026/05/12 08:58:00',
    targetPath: '/inference',
  },
]

function readNotifications(): TaskNotification[] {
  if (typeof window === 'undefined') {
    return seedNotifications
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as TaskNotification[]) : seedNotifications
  } catch {
    return seedNotifications
  }
}

let notifications = readNotifications()
const listeners = new Set<() => void>()

function emit() {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications))
  }
  listeners.forEach(listener => listener())
}

function persist(nextNotifications: TaskNotification[]) {
  notifications = nextNotifications
  emit()
}

export function useNotifications(): TaskNotification[] {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => notifications,
    () => notifications,
  )
}

export function getNotifications(): TaskNotification[] {
  return notifications
}

export function createTaskNotification(input: CreateTaskNotificationInput): TaskNotification {
  const permissionState = getPermissionState()
  const recipients = unique(
    input.recipientAccounts?.length
      ? input.recipientAccounts
      : getRelatedAccounts(permissionState, input.projectId, input.actorAccount),
  )
  const title = input.title ?? `${input.taskModule}${STATUS_LABEL[input.status]}`
  const content = input.content ?? `${input.taskName} ${STATUS_LABEL[input.status]}`
  const nextNotification: TaskNotification = {
    id: `notice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    content,
    type: input.type,
    severity: input.severity ?? (input.status === 'failed' ? 'error' : input.status === 'completed' ? 'success' : 'info'),
    status: input.status,
    taskId: input.taskId,
    taskName: input.taskName,
    taskModule: input.taskModule || TASK_TYPE_LABEL[input.type],
    projectId: input.projectId ?? getCurrentProject(permissionState)?.id,
    recipientAccounts: recipients,
    readAccounts: [],
    createdAt: nowText(),
    targetPath: input.targetPath,
  }

  persist([nextNotification, ...notifications])
  return nextNotification
}

export function markRead(id: string, account: string): void {
  persist(
    notifications.map(item =>
      item.id === id ? { ...item, readAccounts: unique([...item.readAccounts, account]) } : item,
    ),
  )
}

export function markAllRead(account: string): void {
  persist(
    notifications.map(item =>
      item.recipientAccounts.includes(account)
        ? { ...item, readAccounts: unique([...item.readAccounts, account]) }
        : item,
    ),
  )
}

export function getVisibleNotifications(account: string): TaskNotification[] {
  return notifications.filter(item => item.recipientAccounts.includes(account))
}

export function getUnreadCount(account: string): number {
  return getVisibleNotifications(account).filter(item => !item.readAccounts.includes(account)).length
}

export const taskNotificationLabels = {
  type: TASK_TYPE_LABEL,
  status: STATUS_LABEL,
}
