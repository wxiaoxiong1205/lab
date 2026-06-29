import { BrowserRouter as Router, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ConfigProvider, Spin, message } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { qiankunWindow } from 'vite-plugin-qiankun/dist/helper'
import ErrorBoundary from './components/ErrorBoundary'
import AppRoutes from './routes'
import { useProjectStore } from './stores/projectStore'
import { changeLanguage, initializeLanguage } from './utils/languageUtils'
import { tokenStorage, useAuthStore } from './stores/authStore'
import { useConfigStore } from './stores/configStore'
import { authApi, userApi } from './services/api'
import configApi from './services/config'
import { labAntdTheme } from './theme/antdTheme'
import { mockMenuData } from './mock/mockMenuData'
import { isLocalPreview, previewTenantAdminToken, previewTenantAdminUser } from './mock/localPreviewData'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function AppContent() {
  const { currentProject } = useProjectStore()
  const { setAuth, isAuthenticated, userMenus, setMenus, menuLoadError, setMenuLoadError, setFailedRequest, menuLoadAttempted, setMenuLoadAttempted } = useAuthStore()
  const { setConfig, setModelStatusDict } = useConfigStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [isInitializing, setIsInitializing] = useState(true)
  const tokenLoginProcessed = useRef(false)
  const pathFixApplied = useRef(false)

  // 判断是否是 qiankun 子应用
  const isQiankun = qiankunWindow.__POWERED_BY_QIANKUN__
  // 判断是否是无界微前端子应用
  const isWujie = window.__POWERED_BY_WUJIE__
  const isEmbedded = isQiankun || isWujie
  const loadingClassName = isEmbedded ? 'lab-app-loading lab-app-loading-embedded' : 'lab-app-loading'

  const handleMenuError = useCallback((error: unknown) => {
    const errorMsg = (error as any)?.response?.data?.detail || (error as any)?.message || '获取菜单权限失败'
    setMenuLoadError(errorMsg)
    setFailedRequest({
      url: '/menu',
      method: 'GET',
      originalError: error,
      timestamp: Date.now(),
    })
  }, [setMenuLoadError, setFailedRequest])

  // 微前端模式下，监听 token 变化并刷新菜单和配置
  useEffect(() => {
    if (!isQiankun || !window.qiankunProps?.authStorage) {
      return
    }

    const refreshMenusAndConfig = async (authInfo: any) => {
      if (!authInfo?.token) {
        return
      }

      try {
        // 获取菜单
        const menus = await userApi.menuList()
        setMenus(menus)
      }
      catch (menuError) {
        console.error('❌ 获取用户菜单失败:', menuError)
        handleMenuError(menuError)
      }

      await authApi.getCurrentUser()

      // 获取配置
      try {
        const [config, modelStatusData] = await Promise.all([
          configApi.getConfig(),
          configApi.getModelStatus(),
        ])

        const statusDict = modelStatusData.reduce((acc: Record<string, any>, item: any) => {
          acc[item.value] = item
          return acc
        }, {})

        setConfig(config.data)
        setModelStatusDict(statusDict)
      }
      catch (configError) {
        console.error('❌ 获取配置失败:', configError)
      }
    }

    // 订阅 token 变化
    const handleAuthChange = (authInfo: any) => {
      console.log('🔔 Token 变化，刷新菜单和配置')
      refreshMenusAndConfig(authInfo)
    }

    window.qiankunProps.authStorage.onAuthChange(handleAuthChange)

    // 初始化时也获取一次
    const initialAuthInfo = window.qiankunProps.authStorage.getAuthInfo()
    if (initialAuthInfo?.token) {
      refreshMenusAndConfig(initialAuthInfo).finally(() => {
        setIsInitializing(false)
      })
    }

    // 清理订阅
    return () => {
      window.qiankunProps.authStorage.offAuthChange(handleAuthChange)
    }
  }, [isQiankun])

  useEffect(() => {
    if (isQiankun) {
      return
    }
    const handleTokenLogin = async () => {
      const params = new URLSearchParams(location.search)
      // 本地环境优先使用 VITE_LOCAL_TEST_TOKEN
      let token = params.get('_tk')
      const refreshToken = params.get('_rtk')
      const isLocalDev = import.meta.env.DEV
      const localTestToken = import.meta.env.VITE_LOCAL_TEST_TOKEN
      const existingToken = tokenStorage.getToken()

      if (!token && isLocalPreview) {
        token = previewTenantAdminToken
        console.log('🔧 使用本地预览租户管理员账号 lab@lab')
      }
      else if (!token && isLocalDev && localTestToken) {
        token = localTestToken
        console.log('🔧 使用本地测试 token')
      }
      else if (!token && existingToken) {
        token = existingToken
      }
      const loginUrl = params.get('_login_url')

      if (!token || tokenLoginProcessed.current) {
        if (!token && isLocalPreview && !tokenLoginProcessed.current) {
          tokenLoginProcessed.current = true
          setAuth(previewTenantAdminUser, previewTenantAdminToken, mockMenuData)
        }
        setIsInitializing(false)
        return
      }

      tokenLoginProcessed.current = true

      try {
        const cleanToken = token.trim()

        // 保存token到localStorage
        tokenStorage.setToken(cleanToken)
        tokenStorage.setRefreshToken(refreshToken)
        // 保存login_url（如果有）
        if (loginUrl) {
          localStorage.setItem('login_url', loginUrl)
        }

        setAuth(
          {
            userId: 0,
            username: 'token_user',
            accountId: 0,
            tenantId: '',
            enterpriseCode: '',
          },
          cleanToken,
        )

        await new Promise((resolve) => setTimeout(resolve, 200))

        let menus = []
        try {
          menus = await userApi.menuList()
          console.log('✅ 成功获取用户菜单:', menus)
        }
        catch (menuError) {
          console.error('❌ 获取用户菜单失败:', menuError)
          handleMenuError(menuError)
          return
        }

        let user = previewTenantAdminUser
        try {
          user = await authApi.getCurrentUser()
        }
        catch (userError) {
          if (!(isLocalPreview && cleanToken === previewTenantAdminToken)) {
            throw userError
          }
          console.warn('本地预览：/users/me 获取失败，使用演示用户兜底。', userError)
        }
        setAuth(user, cleanToken, menus)

        try {
          const [config, modelStatusData] = await Promise.all([
            configApi.getConfig(),
            configApi.getModelStatus(),
          ])

          const statusDict = modelStatusData.reduce((acc: Record<string, any>, item: any) => {
            acc[item.value] = item
            return acc
          }, {})

          setConfig(config.data)
          setModelStatusDict(statusDict)
        }
        catch (configError) {
          console.error('❌ 获取配置失败:', configError)
        }

        // 清除URL中的敏感参数
        const cleanUrl = new URL(window.location.href)
        cleanUrl.searchParams.delete('_tk')
        cleanUrl.searchParams.delete('_login_url')
        const targetPath = location.pathname === '/' ? '/home' : location.pathname
        navigate(targetPath + cleanUrl.search, { replace: true })
      }
      catch (error: unknown) {
        console.error('❌ Token登录失败:', error)
        const errorMsg = (error as any)?.response?.data?.detail || (error as any)?.message || '自动登录失败'
        message.error(`登录失败: ${errorMsg}`)

        // 清除无效token
        localStorage.removeItem('auth_token')
        localStorage.removeItem('auth_refresh_token')
      }
      finally {
        setIsInitializing(false)
      }
    }

    handleTokenLogin()
  }, [location.search, location.pathname, navigate, setAuth, handleMenuError])

  useEffect(() => {
    if (currentProject) {
      queryClient.invalidateQueries()
    }
  }, [currentProject])

  useEffect(() => {
    initializeLanguage()
  }, [])

  // 自动添加斜杠并导航到home页面
  useEffect(() => {
    // 避免重复处理
    if (pathFixApplied.current) return

    const { pathname } = location

    // 如果路径不是以斜杠结尾且不是根路径
    if (pathname !== '/' && !pathname.endsWith('/')) {
      // 添加斜杠并重定向
      navigate(`${pathname + location.search}`, { replace: true })
    }
    // // 如果是根路径，导航到home页面
    // else if (pathname === '/') {
    //   navigate('/home', { replace: true });
    // }

    pathFixApplied.current = true
  }, [location.pathname, navigate])

  useEffect(() => {
    const loadMenusIfNeeded = async () => {
      if (!isAuthenticated || (userMenus?.length > 0) || menuLoadError || menuLoadAttempted) {
        return
      }

      setMenuLoadAttempted(true)
      try {
        const menus = await userApi.menuList()
        setMenus(menus)
      }
      catch (e) {
        console.error('❌ 加载菜单失败:', e)
        handleMenuError(e)
      }
    }

    loadMenusIfNeeded()
  }, [isAuthenticated, userMenus, menuLoadError, menuLoadAttempted, setMenus, setMenuLoadAttempted, handleMenuError])

  if (isInitializing) {
    return (
      <div className={loadingClassName}>
        <Spin size="large" tip="正在登录..." />
      </div>
    )
  }

  return (
    <Suspense fallback={(
      <div className={loadingClassName}>
        <Spin size="large" tip="页面加载中..." />
      </div>
    )}
    >
      <AppRoutes />
    </Suspense>
  )
}

function App({ locale }: { locale?: string }) {
  // 获取 base，优先使用 qiankun 下发的 base
  const qiankunBase = window.qiankunProps?.base
  const basename = qiankunWindow.__POWERED_BY_QIANKUN__
    ? (qiankunBase && qiankunBase !== '/' ? qiankunBase : '/lab')
    : import.meta.env.BASE_URL || ''

  // 处理 locale（国际化）
  useEffect(() => {
    if (locale) {
      // 将控制台的语言格式转换为应用支持的语言格式
      const localeMap: Record<string, string> = {
        'zh-CN': 'zh-CN',
        'zh_CN': 'zh-CN',
        'en-US': 'en',
        'en_US': 'en',
        'en': 'en',
        'zh-TW': 'zh-TW',
        'zh_TW': 'zh-TW',
        'zh-HK': 'zh-TW',
        'zh_HK': 'zh-TW',
      }
      const targetLocale = localeMap[locale] || 'zh-CN'
      if (targetLocale) {
        changeLanguage(targetLocale)
      }
    }
  }, [locale])

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={zhCN}
        theme={labAntdTheme}
      >
        <ErrorBoundary>
          <Router basename={basename}>
            <AppContent />
          </Router>
        </ErrorBoundary>
      </ConfigProvider>
    </QueryClientProvider>
  )
}

export default App
