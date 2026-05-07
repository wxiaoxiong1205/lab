import React, { useMemo, useState } from 'react'
import { Button, Input, Menu } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeftOutlined, BookOutlined, SearchOutlined, FileTextOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { getCurrentProject, usePermissionStore } from '../../services/permissionStore'
import { useActiveDocumentAgent } from '../../services/documentAgentService'
import DocumentAgentPanel from './DocumentAgentPanel'

const SIDER_WIDTH = 280

const DocumentCenterLayout: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const permissionState = usePermissionStore()
  const currentProject = getCurrentProject(permissionState)
  const { activeService } = useActiveDocumentAgent()
  const [search, setSearch] = useState('')

  const selectedKeys = useMemo(() => {
    if (location.pathname.includes('usage-guide')) return ['usage-guide']
    return []
  }, [location.pathname])

  const menuItems: MenuProps['items'] = [
    {
      key: 'doc-root',
      icon: <FileTextOutlined />,
      label: '文档中心',
      children: [{ key: 'usage-guide', label: '使用指南', icon: <BookOutlined /> }],
    },
  ]

  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'usage-guide') navigate('/docs/usage-guide')
  }

  const handleBackToApp = () => {
    navigate(currentProject ? '/home' : '/workspace')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'row', minHeight: 'calc(100vh - 60px)', background: '#fff' }}>
      <div
        style={{
          width: SIDER_WIDTH,
          background: '#fff',
          borderRight: '1px solid #e2e8f0',
          overflow: 'auto',
          flexShrink: 0,
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <Button
            type="default"
            icon={<ArrowLeftOutlined />}
            onClick={handleBackToApp}
            style={{
              width: '100%',
              borderRadius: 8,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              fontWeight: 500,
            }}
          >
            返回{currentProject ? '项目概览' : '项目空间'}
          </Button>
        </div>
        <div style={{ padding: '16px 16px 12px' }}>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder="通过关键词搜索文档"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ borderRadius: 8 }}
          />
        </div>
        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          defaultOpenKeys={['doc-root']}
          items={menuItems}
          onClick={onMenuClick}
          style={{ border: 'none', padding: '0 8px 16px' }}
        />
      </div>
      <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
        <div
          style={{
            flex: 1,
            padding: '32px 40px 48px',
            background: '#fff',
            overflow: 'auto',
            maxWidth: activeService ? 900 : 960,
          }}
        >
          <Outlet />
        </div>
        {activeService && <DocumentAgentPanel activeService={activeService} />}
      </div>
    </div>
  )
}

export default DocumentCenterLayout
