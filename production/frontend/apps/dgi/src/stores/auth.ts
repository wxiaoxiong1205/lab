import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserInfo } from '@/services/api'

type AuthState = {
  userInfo: UserInfo | null
  setUserInfo: (userInfo: UserInfo | null) => void
  token: string | null
  setToken: (token: string | null) => void
  refreshToken: string | null
  setRefreshToken: (refreshToken: string | null) => void
  loginUrl: string | null
  setLoginUrl: (loginUrl: string | null) => void
}
// 创建 store
const useAuthStore = create(
  persist<AuthState>(
    (set) => ({
      userInfo: null,
      setUserInfo: (userInfo) =>
        set(() => ({
          userInfo,
        })),
      token: null,
      setLoginUrl: (loginUrl) =>
        set(() => ({
          loginUrl,
        })),
      loginUrl: null,
      refreshToken: null,
      setToken: (token) =>
        set(() => ({
          token,
        })),
      setRefreshToken: (refreshToken) =>
        set(() => ({
          refreshToken,
        })),
    }),
    {
      name: 'auth-storage', // localStorage key
      partialize: (state) => ({
        loginUrl: state.loginUrl,
        userInfo: state.userInfo,
        token: state.token,
        refreshToken: state.refreshToken,
      }) as AuthState,
    },
  ),
)

export default useAuthStore
