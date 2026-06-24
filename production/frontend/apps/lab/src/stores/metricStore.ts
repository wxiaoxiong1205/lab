import { create } from 'zustand'
import { metricService } from '../services/metricService'

interface MetricState {
  directories: any[]
  metrics: any[]
  selectedDirectoryId: number | null
  loading: boolean
  error: string | null
  currentProjectId: number | null
  // 操作方法
  fetchDirectories: (projectId: number) => Promise<void>
  fetchMetrics: (projectId: number, params?: any) => Promise<void>
  setSelectedDirectoryId: (id: number | null) => void
  setProjectId: (projectId: number) => void
  createDirectory: (projectId: number, data: any) => Promise<void>
  updateDirectory: (
    projectId: number,
    directoryId: number,
    data: any
  ) => Promise<void>
  deleteDirectory: (projectId: number, directoryId: number) => Promise<void>
  createMetric: (projectId: number, data: any) => Promise<void>
  updateMetric: (
    projectId: number,
    metricId: number,
    data: any
  ) => Promise<void>
  deleteMetric: (projectId: number, metricId: number) => Promise<void>
  batchDeleteMetrics: (metricIds: number[]) => Promise<void>
}

export const useMetricStore = create<MetricState>((set, get) => ({
  directories: [],
  metrics: [],
  selectedDirectoryId: null,
  loading: false,
  error: null,
  currentProjectId: null,

  fetchDirectories: async (projectId: number) => {
    try {
      set({ loading: true, error: null })
      const response = await metricService.listMetricDirectories(projectId)
      set({ directories: response.data.items })
    }
    catch (error: any) {
      set({ error: error.message })
    }
    finally {
      set({ loading: false })
    }
  },

  fetchMetrics: async (
    projectId: number = get().currentProjectId,
    params?: Parameters<typeof metricService.listMetrics>[1],
  ) => {
    try {
      set({ loading: true, error: null })
      const response = await metricService.listMetrics(
        projectId,
        get().selectedDirectoryId,
      )
      set({ metrics: response.data.items })
    }
    catch (error: any) {
      set({ error: error.message })
    }
    finally {
      set({ loading: false })
    }
  },

  setSelectedDirectoryId: async (id: number | null) => {
    set({ selectedDirectoryId: id })
    await get().fetchMetrics(get().currentProjectId, {
      directory_id: id,
    })
  },

  setProjectId: (projectId: number) => {
    set({ currentProjectId: projectId })
  },

  createDirectory: async (projectId: number, data: any) => {
    try {
      set({ loading: true, error: null })
      await metricService.createMetricDirectory(projectId, {
        ...data,
        project_id: projectId,
      })
      await get().fetchDirectories(projectId)
    }
    catch (error: any) {
      set({ error: error.message })
    }
    finally {
      set({ loading: false })
    }
  },

  updateDirectory: async (
    projectId: number,
    directoryId: number,
    data: any,
  ) => {
    try {
      set({ loading: true, error: null })
      await metricService.updateMetricDirectory(projectId, directoryId, data)
      await get().fetchDirectories(projectId)
    }
    catch (error: any) {
      set({ error: error.message })
    }
    finally {
      set({ loading: false })
    }
  },

  deleteDirectory: async (projectId: number, directoryId: number) => {
    try {
      set({ loading: true, error: null })
      await metricService.deleteMetricDirectory(projectId, directoryId)
      await get().fetchDirectories(projectId)
    }
    catch (error: any) {
      set({ error: error.message })
    }
    finally {
      set({ loading: false })
    }
  },

  createMetric: async (projectId: number, data: any) => {
    try {
      set({ loading: true, error: null })
      await metricService.createMetric(
        projectId,
        get().selectedDirectoryId,
        data,
      )
      await get().fetchMetrics(projectId, {
        directory_id: get().selectedDirectoryId,
      })
    }
    catch (error: any) {
      set({ error: error.message })
    }
    finally {
      set({ loading: false })
    }
  },

  updateMetric: async (projectId: number, metricId: number, data: any) => {
    try {
      set({ loading: true, error: null })
      await metricService.updateMetric(
        projectId,
        get().selectedDirectoryId,
        metricId,
        data,
      )
      await get().fetchMetrics(projectId)
    }
    catch (error: any) {
      set({ error: error.message })
    }
    finally {
      set({ loading: false })
    }
  },

  deleteMetric: async (projectId: number, metricId: number) => {
    try {
      set({ loading: true, error: null })
      await metricService.deleteMetric(
        projectId,
        get().selectedDirectoryId,
        metricId,
      )
      await get().fetchMetrics(projectId)
    }
    catch (error: any) {
      set({ error: error.message })
    }
    finally {
      set({ loading: false })
    }
  },

  batchDeleteMetrics: async (metricIds: number[]) => {
    try {
      set({ loading: true, error: null })
      await metricService.batchDeleteMetrics(
        get().currentProjectId,
        get().selectedDirectoryId,
        { metric_ids: metricIds },
      )
      // 重新获取指标列表
      await get().fetchMetrics(get().currentProjectId)
    }
    catch (error: any) {
      set({ error: error.message })
    }
    finally {
      set({ loading: false })
    }
  },
}))
