import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { qiankunWindow } from 'vite-plugin-qiankun/dist/helper'
import type { AuthState, FailedRequest, User } from '../types'
import type { MenuItem } from '@/types'
import apiClient from '@/services/apiClient'

// 创建一个独立的token存储函数，确保token始终可用
const tokenStorage = {
  getToken: (): string | null => {
    try {
      return localStorage.getItem('auth_token')
    }
    catch (error) {
      console.error('Failed to get token from localStorage:', error)
      return null
    }
  },

  setToken: (token: string | null): void => {
    try {
      if (token) {
        localStorage.setItem('auth_token', token)
      }
      else {
        localStorage.removeItem('auth_token')
      }
    }
    catch (error) {
      console.error('Failed to set token in localStorage:', error)
    }
  },

  getRefreshToken: (): string | null => {
    try {
      return localStorage.getItem('auth_refresh_token')
    }
    catch (error) {
      console.error('Failed to get refresh token from localStorage:', error)
      return null
    }
  },

  setRefreshToken: (refreshToken: string | null): void => {
    try {
      if (refreshToken) {
        localStorage.setItem('auth_refresh_token', refreshToken)
      }
      else {
        localStorage.removeItem('auth_refresh_token')
      }
    }
    catch (error) {
      console.error('Failed to set refresh token in localStorage:', error)
    }
  },
}

// 递归提取所有菜单的 code，构建 Set 用于快速查找
const extractMenuCodes = (menus: MenuItem[]): Set<string> => {
  const codeSet = new Set<string>()

  const traverse = (items: MenuItem[]) => {
    for (const item of items) {
      if (item.code) {
        codeSet.add(item.code)
      }
      if (item.children && item.children.length > 0) {
        traverse(item.children)
      }
    }
  }

  traverse(menus)
  return codeSet
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: tokenStorage.getToken(), // 初始化时从localStorage获取token
      isAuthenticated: !!tokenStorage.getToken(), // 根据token是否存在判断认证状态
      userMenus: [], // 初始化用户菜单权限为空数组
      menuCodeSet: new Set<string>(), // 菜单 code 缓存 Set，用于快速查找
      isLoggingOut: false, // 初始化退出状态为false
      menuLoadError: null, // 菜单加载错误状态
      failedRequest: null,
      requestUrl: '',
      menuLoadAttempted: false, // 初始化菜单加载尝试状态为false
      setAuth: (user: User, token: string, menus: MenuItem[] = []) => {
        // 先保存到localStorage，确保token立即可用
        tokenStorage.setToken(token)

        // 使用 setMenus 统一更新菜单和 menuCodeSet
        get().setMenus(menus)

        // 然后更新其他认证状态
        set({
          user,
          token,
          isAuthenticated: true,
          isLoggingOut: false, // 登录时重置退出状态
        })
      },

      setMenus: (menus: MenuItem[]) => {
        set({
          userMenus: menus,
          menuCodeSet: extractMenuCodes(menus),
          menuLoadError: null,
          menuLoadAttempted: true,
        })
      },

      setMenuLoadError: (error: string | null) => {
        set({ menuLoadError: error })
      },

      setMenuLoadAttempted: (attempted: boolean) => {
        set({ menuLoadAttempted: attempted })
      },

      // 保存失败的请求信息
      setFailedRequest: (request: FailedRequest | null) => {
        set({ failedRequest: request })
      },

      // 重试失败的请求
      retryFailedRequest: async () => {
        const { failedRequest } = get()

        if (!failedRequest) {
          console.error('No failed request to retry')
          return Promise.reject(new Error('No failed request to retry'))
        }

        // 重试前重置菜单加载尝试标记，允许重新加载
        set({ menuLoadAttempted: false })

        try {
          const { url, method, data, params, headers } = failedRequest

          // 使用apiClient重新发起请求
          const response = await apiClient.request({
            url,
            method,
            data,
            params,
            headers,
          })

          // 使用 setMenus 统一更新菜单和 menuCodeSet
          get().setMenus(response.data)

          // 请求成功后清除失败请求记录和错误信息
          set({
            failedRequest: null,
          })

          return response
        }
        catch (error) {
          console.error('❌ 重试请求失败:', error)

          // 更新失败请求信息，包含新的错误
          set({
            failedRequest: {
              ...failedRequest,
              originalError: error,
              timestamp: Date.now(),
            },
            menuLoadError: error.response?.data?.detail || error.message || '重试失败',
          })

          throw error
        }
      },
      // 保存请求失败的url
      setRequestUrl: (url: string) => {
        set({ requestUrl: url })
      },

      logout: () => {
        console.log('Logging out, clearing auth state')

        // 1. 先设置退出状态，避免显示未授权页面
        set({ isLoggingOut: true })

        // 2. 清除localStorage中的所有认证和应用数据
        tokenStorage.setToken(null)
        tokenStorage.setRefreshToken(null)

        // 清除其他localStorage数据
        try {
          localStorage.removeItem('auth-storage') // zustand persist 存储的认证信息
          localStorage.removeItem('project-storage') // zustand persist 存储的项目信息
          localStorage.removeItem('projectEnumValues') // 项目枚举值缓存
          localStorage.removeItem('comparison_logs') // 日志对比数据
        }
        catch (error) {
          console.error('Failed to clear localStorage:', error)
        }

        // 3. 使用 setMenus 统一清空菜单和 menuCodeSet
        get().setMenus([])

        // 4. 更新认证状态
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoggingOut: false, // 退出完成后重置状态
        })

        // 如果是微前端模式，调用控制台的登出方法
        const isQiankun = qiankunWindow.__POWERED_BY_QIANKUN__
        if (isQiankun && window.qiankunProps?.methods?.logout) {
          window.qiankunProps.methods.logout()
        }
      },

      // 辅助方法，优先从localStorage获取token，确保始终返回最新的token
      getToken: () => {
        const storeToken = get().token
        const localToken = tokenStorage.getToken()

        // 如果localStorage中有token但store中没有，更新store
        if (localToken && !storeToken) {
          set({ token: localToken, isAuthenticated: true })
          return localToken
        }

        return storeToken || localToken
      },

      // 判断用户是否是管理员（通过菜单权限）
      isAdmin: () => {
        const { menuCodeSet } = get()
        return menuCodeSet.has('admin')
      },

      // 判断是否有指定 code 的菜单权限（优化版本，使用 Set 缓存）
      hasAuth: (code: string) => {
        const { menuCodeSet } = get()
        return menuCodeSet.has(code)
      },
    }),
    {
      name: 'auth-storage', // name of the item in the storage (must be unique)
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        userMenus: state.userMenus,
        isLoggingOut: state.isLoggingOut,
        menuLoadAttempted: state.menuLoadAttempted,
      }),
      onRehydrateStorage: () => {
        // 返回方法，在rehydrate后执行
        return (state) => {
          // 从 localStorage 恢复状态后，重建 menuCodeSet
          if (state?.userMenus && Array.isArray(state.userMenus) && state.userMenus.length > 0) {
            state.menuCodeSet = extractMenuCodes(state.userMenus)
          }
          else if (state) {
            state.menuCodeSet = new Set<string>()
          }
        }
      },
    },
  ),
)

// 导出token存储，方便在其他地方直接使用
export { tokenStorage }
