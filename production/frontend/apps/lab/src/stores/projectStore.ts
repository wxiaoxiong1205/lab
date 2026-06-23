import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Project } from '../types'

interface ProjectStore {
  currentProject: Project | null
  setCurrentProject: (project: Project | null) => void
  clearProject: () => void
}

// 使用persist中间件来持久化存储当前项目
export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      currentProject: null,
      setCurrentProject: (project) => set({ currentProject: project }),
      clearProject: () => set({ currentProject: null }),
    }),
    {
      name: 'project-storage', // localStorage的键名
      partialize: (state) => ({ currentProject: state.currentProject }), // 只持久化currentProject
    },
  ),
)
