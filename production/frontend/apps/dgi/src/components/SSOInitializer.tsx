import { useEffect } from 'react'
import { UrlSSO } from '@deep/sso'
import { useShallow } from 'zustand/react/shallow'
import useAuthStore from '@/stores/auth'

/**
 * SSO 初始化组件
 * 用于处理单点登录逻辑，应该在应用启动时初始化
 */
export default function SSOInitializer() {
  const { setToken, setRefreshToken, setLoginUrl, setUserInfo } = useAuthStore(useShallow((state) => {
    return {
      setToken: state.setToken,
      setRefreshToken: state.setRefreshToken,
      setLoginUrl: state.setLoginUrl,
      setUserInfo: state.setUserInfo,
    }
  }))

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const instance = new UrlSSO()
      const query = instance.parse()

      // 单点登录 & 控制台同域名下自动登录
      const inputToken = query.token || localStorage.getItem('uat-console-token')
      const inputRefreshToken = query.refreshToken || localStorage.getItem('uat-console-refreshToken')
      if (inputToken) {
        setToken(inputToken)
        setUserInfo(null)
      }
      if (inputRefreshToken) {
        setRefreshToken(inputRefreshToken)
      }
      if (query.loginUrl) {
        setLoginUrl(query.loginUrl)
      }

      instance.clearAndRedirect()
    }
  }, [])

  return null
}
