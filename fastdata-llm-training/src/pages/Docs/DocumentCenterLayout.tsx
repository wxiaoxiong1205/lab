import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Menu } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeftOutlined, BookOutlined, SearchOutlined, FileTextOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { getCurrentProject, usePermissionStore } from '../../services/permissionStore'
import { useActiveDocumentAgent } from '../../services/documentAgentService'
import { productManual } from '../../docs/productManual'
import DocumentAgentPanel from './DocumentAgentPanel'

const SIDER_WIDTH = 280

function getParentKeys(headingId: string): string[] {
  const keys = ['doc-root', 'product-manual']
  let currentLevelOneId = ''

  for (const heading of productManual.headings) {
    if (heading.level === 1) {
      currentLevelOneId = heading.id
    }
    if (heading.id === headingId) {
      if (currentLevelOneId) {
        keys.push(`heading:${currentLevelOneId}`)
      }
      break
    }
  }

  return keys
}

const DocumentCenterLayout: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const contentRef = useRef<HTMLDivElement>(null)
  const permissionState = usePermissionStore()
  const currentProject = getCurrentProject(permissionState)
  const { activeService, loading: agentLoading } = useActiveDocumentAgent()
  const [search, setSearch] = useState('')
  const [activeHeadingId, setActiveHeadingId] = useState(() => decodeURIComponent(location.hash.replace(/^#/, '')))
  const [openKeys, setOpenKeys] = useState<string[]>(['doc-root', 'product-manual'])

  const visibleHeadings = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) {
      return productManual.headings
    }

    return productManual.headings.filter(item => item.title.toLowerCase().includes(keyword))
  }, [search])

  useEffect(() => {
    const currentAnchor = decodeURIComponent(location.hash.replace(/^#/, ''))
    if (currentAnchor) {
      setActiveHeadingId(currentAnchor)
      setOpenKeys(previous => Array.from(new Set([...previous, ...getParentKeys(currentAnchor)])))
    }
  }, [location.hash])

  useEffect(() => {
    const container = contentRef.current
    if (!container) {
      return undefined
    }

    const updateActiveHeading = () => {
      const headings = Array.from(container.querySelectorAll<HTMLElement>('.manual-heading[id]'))
      if (!headings.length) {
        return
      }

      const containerTop = container.getBoundingClientRect().top
      const current = headings.reduce((candidate, heading) => {
        const offset = heading.getBoundingClientRect().top - containerTop
        if (offset <= 96) {
          return heading
        }
        return candidate
      }, headings[0])
      const nextId = current.id
      if (nextId && nextId !== activeHeadingId) {
        setActiveHeadingId(nextId)
        setOpenKeys(previous => Array.from(new Set([...previous, ...getParentKeys(nextId)])))
      }
    }

    updateActiveHeading()
    container.addEventListener('scroll', updateActiveHeading, { passive: true })
    return () => container.removeEventListener('scroll', updateActiveHeading)
  }, [activeHeadingId, location.pathname])

  const selectedKeys = useMemo(() => {
    if (activeHeadingId) {
      return [`heading:${activeHeadingId}`]
    }
    if (location.pathname.includes('/docs')) return ['product-manual']
    return []
  }, [activeHeadingId, location.pathname])

  const getMenuLabel = (title: string, level: number) => (
    <span
      title={title}
      style={{
        display: 'block',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        paddingLeft: Math.max(level - 2, 0) * 10,
      }}
    >
      {title}
    </span>
  )

  const groupedHeadings = useMemo(() => {
    if (search.trim()) {
      return visibleHeadings.map(item => ({
        key: `heading:${item.id}`,
        label: getMenuLabel(item.title, item.level),
      }))
    }

    const groups: NonNullable<MenuProps['items']> = []
    let currentGroup: NonNullable<MenuProps['items']>[number] | null = null

    productManual.headings.forEach(item => {
      if (item.level === 1) {
        const children: NonNullable<MenuProps['items']> = []
        currentGroup = {
          key: `heading:${item.id}`,
          label: getMenuLabel(item.title, item.level),
          children,
        }
        groups.push(currentGroup)
        return
      }

      const menuItem = {
        key: `heading:${item.id}`,
        label: getMenuLabel(item.title, item.level),
      }

      if (currentGroup && 'children' in currentGroup && Array.isArray(currentGroup.children)) {
        currentGroup.children.push(menuItem)
      } else {
        groups.push(menuItem)
      }
    })

    return groups
  }, [search, visibleHeadings])

  const menuItems: MenuProps['items'] = [
    {
      key: 'doc-root',
      icon: <FileTextOutlined />,
      label: '文档中心',
      children: [
        {
          key: 'product-manual',
          label: productManual.title,
          icon: <BookOutlined />,
          children: groupedHeadings,
        },
      ],
    },
  ]

  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'product-manual') {
      navigate('/docs/product-manual')
      return
    }
    if (typeof key === 'string' && key.startsWith('heading:')) {
      const targetId = key.replace('heading:', '')
      setActiveHeadingId(targetId)
      navigate(`/docs/product-manual#${encodeURIComponent(targetId)}`)
    }
  }

  const handleSearchEnter = () => {
    const firstHeading = visibleHeadings[0]
    if (firstHeading) {
      navigate(`/docs/product-manual#${encodeURIComponent(firstHeading.id)}`)
    }
  }

  const handleBackToApp = () => {
    navigate(currentProject ? '/home' : '/workspace')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'row', height: 'calc(100vh - 60px)', background: '#fff', overflow: 'hidden' }}>
      <div
        style={{
          width: SIDER_WIDTH,
          background: '#fff',
          borderRight: '1px solid #e2e8f0',
          overflow: 'hidden',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
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
            onPressEnter={handleSearchEnter}
            style={{ borderRadius: 8 }}
          />
        </div>
        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          openKeys={openKeys}
          onOpenChange={keys => setOpenKeys(keys)}
          items={menuItems}
          onClick={onMenuClick}
          style={{ border: 'none', padding: '0 8px 16px', flex: 1, overflowY: 'auto' }}
        />
      </div>
      <div style={{ flex: 1, display: 'flex', minWidth: 0, minHeight: 0 }}>
        <div
          ref={contentRef}
          style={{
            flex: 1,
            padding: '32px 40px 48px',
            background: '#fff',
            overflow: 'auto',
            maxWidth: 900,
            minHeight: 0,
          }}
        >
          <Outlet />
        </div>
        <DocumentAgentPanel activeService={activeService} loading={agentLoading} />
      </div>
    </div>
  )
}

export default DocumentCenterLayout
