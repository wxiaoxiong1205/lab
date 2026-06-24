import { Empty } from 'antd'
import { useEffect, useMemo } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

export default function LLMService() {
  const navigate = useNavigate()
  const hasAuth = useAuthStore((state) => state.hasAuth)
  const location = useLocation()
  const tabs = useMemo(() => [
    {
      key: 'hosted',
      label: '已部署推理服务',
      show: hasAuth('service_inference_hosted'),
    },
    {
      key: 'external',
      label: '第三方推理服务',
      show: hasAuth('service_inference_external'),
    },
  ].filter((item) => item.show), [hasAuth])

  function getActiveTab() {
    const key = location.pathname.split('/').pop()
    if (tabs.some((item) => item.key === key)) {
      return key
    }
    return tabs[0]?.key
  }

  useEffect(() => {
    const currentTab = getActiveTab()

    // 如果当前路径正好是 /service/inference（没有 tab key），自动导航到第一个有权限的 tab
    const isBasePath = location.pathname.endsWith('/service/inference')

    if (isBasePath && tabs.length > 0 && currentTab) {
      const basePath = location.pathname.split('/service/inference')[0]
      navigate(`${basePath}/service/inference/${currentTab}`, { replace: true })
    }
  }, [location.pathname, tabs, navigate])

  return (
    tabs.length ? (
      <div className="h-full">
        <Outlet />
      </div>
    )
      : <Empty description="您没有权限访问该页面" image={Empty.PRESENTED_IMAGE_SIMPLE} />
  )
}
