import type { RunStatus } from '../../types/training'

/** 执行中（占用资源或不可删） */
export function isVersionInExecution(status: RunStatus): boolean {
  return status === 'starting' || status === 'queuing' || status === 'running'
}

export interface VersionActionFlags {
  canStart: boolean
  canEdit: boolean
  canViewDetail: boolean
  canDelete: boolean
  canTerminate: boolean
  /** 启动中：展示终止入口但仅提示，不可真正终止 */
  showTerminateBlocked: boolean
  canResubmit: boolean
}

export function getVersionActionFlags(status: RunStatus): VersionActionFlags {
  return {
    canStart: status === 'created',
    canEdit: status === 'created' || status === 'scheduled_pending',
    canViewDetail: true,
    canDelete:
      status === 'created' ||
      status === 'scheduled_pending' ||
      status === 'completed' ||
      status === 'failed' ||
      status === 'terminated',
    canTerminate: status === 'queuing' || status === 'running',
    showTerminateBlocked: status === 'starting',
    canResubmit: status === 'failed' || status === 'terminated',
  }
}

export const TERMINATE_BLOCKED_MESSAGE = '正在启动中任务不支持终止'
