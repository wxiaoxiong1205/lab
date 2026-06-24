import React, { useState } from 'react'
import { Button, Result, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { HomeOutlined, ReloadOutlined } from '@ant-design/icons'
import useI18n from '../hooks/useI18n'
import { useAuthStore } from '../stores/authStore'

interface MenuErrorFallbackProps {
  error: string
  onRetry?: () => void
}
/**
 * 菜单加载失败时的错误提示组件
 */
const MenuErrorFallback: React.FC<MenuErrorFallbackProps> = ({ error }) => {
  const navigate = useNavigate()
  const { t } = useI18n()
  const { retryFailedRequest } = useAuthStore()
  const [isRetrying, setIsRetrying] = useState(false)
  const handleGoHome = () => {
    navigate(-1)
  }
  const handleRetry = async () => {
    setIsRetrying(true)
    try {
      await retryFailedRequest()
      message.success('菜单加载成功')
    }
    finally {
      setIsRetrying(false)
    }
  }
  return (
    <div
      className="flex justify-center items-center h-[100vh]"
      style={{
        background: '#f5f5f5',
      }}
    >
      <Result
        status="error"
        title="菜单获取失败"
        subTitle={error || '无法获取用户菜单权限，请检查网络连接或联系管理员'}
        extra={[
          <Button type="primary" icon={<ReloadOutlined />} onClick={handleRetry} loading={isRetrying} key="retry">
            {isRetrying ? '重试中...' : '重新获取'}
          </Button>,
          <Button icon={<HomeOutlined />} onClick={handleGoHome} key="home">
            返回
          </Button>,
        ]}
      />
    </div>
  )
}
export default MenuErrorFallback
