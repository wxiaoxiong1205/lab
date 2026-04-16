import type { TaskLifecycleStatus } from './dataServiceStore'

export type { TaskLifecycleStatus } from './dataServiceStore'

export type TaskLifecycleAction =
  | 'start'
  | 'edit'
  | 'detail'
  | 'delete'
  | 'terminate'
  | 'resubmit'

export const STARTING_TERMINATE_BLOCKED_MESSAGE = '正在启动中任务不支持终止'

export const TASK_LIFECYCLE_TAG: Record<
  TaskLifecycleStatus,
  { color: string; label: string }
> = {
  已创建: { color: 'default', label: '已创建' },
  定时待启动: { color: 'gold', label: '定时待启动' },
  启动中: { color: 'processing', label: '启动中' },
  排队中: { color: 'processing', label: '排队中' },
  运行中: { color: 'processing', label: '运行中' },
  已完成: { color: 'success', label: '已完成' },
  失败: { color: 'error', label: '失败' },
  已终止: { color: 'default', label: '已终止' },
}

const actionMap: Record<TaskLifecycleStatus, TaskLifecycleAction[]> = {
  已创建: ['start', 'edit', 'detail', 'delete'],
  定时待启动: ['edit', 'detail', 'delete'],
  启动中: ['detail'],
  排队中: ['terminate', 'detail'],
  运行中: ['terminate', 'detail'],
  已完成: ['detail', 'delete'],
  失败: ['resubmit', 'detail', 'delete'],
  已终止: ['resubmit', 'detail', 'delete'],
}

export function getAllowedTaskLifecycleActions(status: TaskLifecycleStatus): TaskLifecycleAction[] {
  return actionMap[status] ?? ['detail']
}

export function canRunTaskLifecycleAction(status: TaskLifecycleStatus, action: TaskLifecycleAction): boolean {
  return getAllowedTaskLifecycleActions(status).includes(action)
}

export function getPrimaryTaskLifecycleAction(status: TaskLifecycleStatus): 'start' | 'resubmit' | null {
  if (canRunTaskLifecycleAction(status, 'start')) {
    return 'start'
  }

  if (canRunTaskLifecycleAction(status, 'resubmit')) {
    return 'resubmit'
  }

  return null
}
