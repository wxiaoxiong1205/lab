import { useSyncExternalStore } from 'react'
import { mockTasks } from '../data/mockData'
import type { RunStatus, TrainingTask } from '../types/training'
import type { TaskLifecycleStatus } from './dataServiceStore'

const STORAGE_KEY = 'lab-coding:training-task-store:v1'

const statusMap: Record<RunStatus, TaskLifecycleStatus> = {
  created: '已创建',
  scheduled_pending: '定时待启动',
  starting: '启动中',
  queuing: '排队中',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  terminated: '已终止',
}

function cloneTasks(tasks: TrainingTask[]): TrainingTask[] {
  return JSON.parse(JSON.stringify(tasks)) as TrainingTask[]
}

function readTasks(): TrainingTask[] {
  if (typeof window === 'undefined') {
    return cloneTasks(mockTasks)
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as TrainingTask[]) : cloneTasks(mockTasks)
  } catch {
    return cloneTasks(mockTasks)
  }
}

let tasks = readTasks()
const listeners = new Set<() => void>()

function emit() {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  }
  listeners.forEach(listener => listener())
}

function update(mutator: (draft: TrainingTask[]) => void) {
  const draft = cloneTasks(tasks)
  mutator(draft)
  tasks = draft
  emit()
}

export function useTrainingTasks(): TrainingTask[] {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => tasks,
    () => tasks,
  )
}

export function getTrainingTasks(): TrainingTask[] {
  return tasks
}

export function getTrainingTaskLifecycleStatus(task: TrainingTask): TaskLifecycleStatus {
  const latestVersion = task.versions[0]
  return latestVersion ? statusMap[latestVersion.status] : '已创建'
}

export const trainingTaskActions = {
  updateTrainingTaskMeta(id: string, value: { name: string; description?: string }) {
    update(draft => {
      const target = draft.find(item => item.id === id)
      if (!target) {
        return
      }

      target.name = value.name
      target.description = value.description ?? ''
    })
  },

  deleteTrainingTask(id: string) {
    update(draft => {
      const index = draft.findIndex(item => item.id === id)
      if (index >= 0) {
        draft.splice(index, 1)
      }
    })
  },
}
