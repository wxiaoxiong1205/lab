import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/**
 * 配置状态接口
 */
interface ConfigState {
  config: Record<string, any> | null
  modelStatusDict: Record<string, any>
  providerType: 'belle'
  setConfig: (config: Record<string, any>) => void
  setModelStatusDict: (statusDict: Record<string, any>) => void
}

/**
 * 全局配置 Store
 */
export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      config: null,
      modelStatusDict: {},
      providerType: 'belle',

      setConfig: (config: Record<string, any>) => {
        set({ config })
      },

      setModelStatusDict: (statusDict: Record<string, any>) => {
        set({ modelStatusDict: statusDict })
      },
    }),
    {
      name: 'config-storage',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
