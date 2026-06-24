import { Button, Result, Spin } from 'antd'
import { useEffect, useState } from 'react'
import React from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { checkPathPermission, isAdminUser } from '../utils/permission'

interface ProtectedRouteProps {
  children: React.ReactNode
  adminOnly?: boolean
  requireMenuPermission?: boolean // 是否需要菜单权限检查
}
const ProtectedRoute = ({ children, adminOnly = false, requireMenuPermission = true, // 默认开启菜单权限检查
}: ProtectedRouteProps) => {
  const { isAuthenticated, userMenus, isLoggingOut } = useAuthStore()
  const [isMenuLoaded, setIsMenuLoaded] = useState(false)
  const location = useLocation()
  const isLocalTenantAdminPreview = import.meta.env.DEV && localStorage.getItem('lab-local-role') === 'tenant_admin'
  // 监听菜单加载状态
  useEffect(() => {
    if (isAuthenticated) {
      // 如果已经有菜单数据，标记为已加载
      if (userMenus && userMenus.length > 0) {
        setIsMenuLoaded(true)
      }
      else {
        // 如果菜单为空，等待一段时间后标记为已加载（避免无限等待）
        const timer = setTimeout(() => {
          console.log('⚠️ 菜单加载超时，继续权限检查')
          setIsMenuLoaded(true)
        }, 3000) // 等待3秒，给菜单加载足够的时间
        return () => clearTimeout(timer)
      }
    }
    else {
      setIsMenuLoaded(false)
    }
  }, [isAuthenticated, userMenus])
  // 如果正在退出登录，显示加载状态
  if (isLoggingOut) {
    return (
      <div className="flex justify-center items-center h-[100vh]">
        <Spin size="large" tip="正在退出登录..." />
      </div>
    )
  }
  // 如果未认证，显示未授权提示
  if (!isAuthenticated) {
    const loginUrl = localStorage.getItem('login_url')
    return (
      <Result
        status="403"
        title="未授权访问"
        subTitle="请通过授权链接访问此页面。如果您需要访问权限，请联系管理员。"
        extra={loginUrl ? (
          <Button type="primary" onClick={() => window.location.href = loginUrl}>
            返回登录
          </Button>
        ) : null}
      />
    )
  }
  // 如果是仅限管理员访问的页面，通过菜单检查用户是否是管理员
  if (adminOnly && !isLocalTenantAdminPreview && !isAdminUser(userMenus)) {
    return (
      <Result
        status="403"
        title="403"
        subTitle="抱歉，您没有权限访问此页面。"
        extra={(
          <Button type="primary" onClick={() => window.history.back()}>
            返回
          </Button>
        )}
      />
    )
  }
  // 如果需要菜单权限检查
  if (requireMenuPermission) {
    // 如果菜单还未加载完成，显示加载状态
    if (!isMenuLoaded) {
      return (
        <div className="flex justify-center items-center h-[100vh]">
          <Spin size="large" tip="正在加载权限信息..." />
        </div>
      )
    }
    const hasPermission = isLocalTenantAdminPreview || checkPathPermission(userMenus, location.pathname)
    if (!hasPermission) {
      return (
        <Result
          status="403"
          title="403"
          subTitle="抱歉，您没有访问此页面的权限。请联系管理员开通相关权限。"
          extra={(
            <Button type="primary" onClick={() => window.history.back()}>
              返回
            </Button>
          )}
        />
      )
    }
  }
  // 渲染子组件
  return <>{children}</>
}
export default ProtectedRoute
