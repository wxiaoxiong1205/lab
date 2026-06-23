import { qiankunWindow } from 'vite-plugin-qiankun/dist/helper'
import useAuthStore from '@/stores/auth'

export function logout() {
  const { setToken, setUserInfo } = useAuthStore.getState()

  setToken(null)
  setUserInfo(null)

  if (qiankunWindow.__POWERED_BY_QIANKUN__) {
    if (typeof window.qiankunProps?.methods?.logout === 'function') {
      window.qiankunProps.methods.logout()
      return
    }
    console.warn('Qiankun logout method not found')
    window.location.reload()
    return
  }

  // 获取登录 URL
  const authStorage = useAuthStore.getState()
  const loginUrl = authStorage.loginUrl || `${import.meta.env.VITE_PUBLIC_PATH}/iam-login`

  window.location.href = loginUrl
}
