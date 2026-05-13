import React, { useEffect, useMemo, useState } from 'react'
import { Layout, Menu, Dropdown, Button, Badge, Avatar, Tooltip, Result, Tag, Drawer, Empty, Segmented, Space, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  HomeOutlined,
  DatabaseOutlined,
  CloudServerOutlined,
  ExperimentOutlined,
  BarChartOutlined,
  AppstoreOutlined,
  GlobalOutlined,
  BellOutlined,
  SettingOutlined,
  RocketOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  ApartmentOutlined,
} from '@ant-design/icons'
import DesignDocFab from '../DesignDoc/DesignDocFab'
import DesignDocPanel from '../DesignDoc/DesignDocPanel'
import { getPageDesignDoc } from '../../docs/pageDocs'
import {
  canViewCurrentRoute,
  getCurrentProject,
  getCurrentProjectMode,
  getCurrentUser,
  getOperationDeniedMessage,
  getUserRoleLabels,
  hasMenuPermission,
  usePermissionStore,
} from '../../services/permissionStore'
import { resolveRouteAccess } from '../../services/permissionCatalog'
import {
  getUnreadCount,
  markAllRead,
  markRead,
  taskNotificationLabels,
  useNotifications,
  type TaskNotification,
} from '../../services/notificationStore'

const { Header, Sider, Content } = Layout
const { Text } = Typography

interface AppLayoutProps {
  children: React.ReactNode
}

type MenuItemList = NonNullable<MenuProps['items']>

const projectMenuSource: MenuItemList = [
  {
    key: 'data-services',
    icon: <DatabaseOutlined />,
    label: '数据服务',
    children: [
      {
        key: 'data-management',
        label: '数据管理',
        children: [
          { key: '/datasets', label: '训练数据管理' },
          { key: '/measurement', label: '测试数据管理' },
          { key: '/inference', label: '推理结果集' },
        ],
      },
      {
        key: 'data-processing',
        label: '数据处理',
        children: [
          { key: '/data-annotation', label: '数据标注' },
          { key: '/data-cleaning', label: '数据清洗' },
        ],
      },
    ],
  },
  {
    key: 'model-training',
    icon: <CloudServerOutlined />,
    label: '模型训练',
    children: [
      { key: '/finetune/notebooks', label: '在线Notebook' },
      { key: '/training', label: '大模型训练' },
      { key: '/model', label: '我的模型' },
    ],
  },
  {
    key: 'evaluation',
    icon: <BarChartOutlined />,
    label: '模型评估',
    children: [
      { key: '/effect-evaluation', label: '效果评估' },
      { key: '/evaluation-indicator', label: '评估指标' },
    ],
  },
  {
    key: 'model-service',
    icon: <ExperimentOutlined />,
    label: '模型服务',
    children: [
      { key: '/service/inference/hosted', label: '大模型部署' },
      { key: '/service/inference/external', label: '在线推理服务' },
    ],
  },
  {
    key: 'machine-learning',
    icon: <AppstoreOutlined />,
    label: '机器学习',
    children: [
      { key: '/machine-data-management', label: '数据管理' },
      { key: '/machine-annotation', label: '数据标注' },
      { key: '/machine-model-management', label: '模型管理' },
      { key: '/machine-model-deployment', label: '模型部署' },
      { key: '/machine-notebook', label: '在线Notebook' },
      { key: '/machine-annotation-service', label: '在线标注服务' },
    ],
  },
]

const systemMenuSource: MenuItemList = [
  { key: '/admin/projects', icon: <FolderOpenOutlined />, label: '项目管理' },
  { key: '/admin/kubernetes', icon: <ApartmentOutlined />, label: '集群管理' },
  { key: '/admin/storage', icon: <DatabaseOutlined />, label: '存储管理' },
  {
    key: 'admin-images',
    icon: <AppstoreOutlined />,
    label: '镜像管理',
    children: [
      { key: '/admin/image-list', label: '镜像列表' },
      { key: '/admin/registry', label: '镜像仓库' },
    ],
  },
  { key: '/admin/base-model', icon: <CloudServerOutlined />, label: '模型仓库' },
  { key: '/admin/settings', icon: <SettingOutlined />, label: '系统配置' },
  { key: '/admin/permissions', icon: <FileTextOutlined />, label: '权限配置' },
]

const llmTopNavItems = [
  { key: '/home', label: '首页', icon: <HomeOutlined />, route: '/home' },
  { key: 'data-services', label: '数据服务', icon: <DatabaseOutlined />, route: '/datasets' },
  { key: 'model-training', label: '模型训练', icon: <CloudServerOutlined />, route: '/finetune/notebooks' },
  { key: 'evaluation', label: '模型评估', icon: <BarChartOutlined />, route: '/effect-evaluation' },
  { key: 'model-service', label: '模型服务', icon: <ExperimentOutlined />, route: '/service/inference/hosted' },
] as const

const mlTopNavItems = [
  { key: 'machine-learning', label: '机器学习', icon: <AppstoreOutlined />, route: '/machine-data-management' },
] as const

const notificationSeverityColor: Record<TaskNotification['severity'], string> = {
  info: 'blue',
  success: 'green',
  warning: 'gold',
  error: 'red',
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const permissionState = usePermissionStore()
  const isDocsRoute = location.pathname.startsWith('/docs')
  const isWorkspaceRoute = location.pathname === '/workspace'
  const isAdminRoute = location.pathname.startsWith('/admin')
  const isOpenPlatformRoute = location.pathname.startsWith('/open-platform')
  const isStandaloneUtilityRoute = isDocsRoute || isOpenPlatformRoute
  const [docPanelOpen, setDocPanelOpen] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.localStorage.getItem('design-doc-panel-open') === 'true'
  })
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread'>('all')
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth))
  const notifications = useNotifications()
  const currentDoc = getPageDesignDoc(location.pathname)
  const currentUser = getCurrentUser(permissionState)
  const currentProject = getCurrentProject(permissionState)
  const currentProjectMode = getCurrentProjectMode(permissionState)
  const routeAccess = canViewCurrentRoute(location.pathname, permissionState)
  const shouldRedirectToWorkspace = routeAccess.reason === 'no-project' && !isWorkspaceRoute
  const visibleNotifications = useMemo(
    () => notifications.filter(item => item.recipientAccounts.includes(currentUser.account)),
    [currentUser.account, notifications],
  )
  const unreadCount = getUnreadCount(currentUser.account)
  const displayedNotifications = notificationFilter === 'unread'
    ? visibleNotifications.filter(item => !item.readAccounts.includes(currentUser.account))
    : visibleNotifications

  const filterMenuItems = (items: MenuItemList): MenuItemList =>
    items
      .map(item => {
        if (!item) return null
        if ('children' in item && item.children) {
          const children = filterMenuItems(item.children)
          return children.length ? { ...item, children } : null
        }
        if ('key' in item && typeof item.key === 'string' && item.key.startsWith('/')) {
          return hasMenuPermission(item.key, permissionState) ? item : null
        }
        return item
      })
      .filter(Boolean) as MenuItemList

  const activeTopTab = isAdminRoute ? 'system' : 'workspace'
  const showProjectMenus = !isDocsRoute && !isWorkspaceRoute && !isAdminRoute && !isOpenPlatformRoute && Boolean(currentProject)
  const projectTopNavItems = showProjectMenus
    ? (currentProjectMode === 'ml' ? mlTopNavItems : llmTopNavItems)
    : []

  const activeProjectTopKey = useMemo(() => {
    if (!showProjectMenus) {
      return null
    }
    const currentMenuKey = resolveRouteAccess(location.pathname)?.menuKey ?? location.pathname
    if (currentProjectMode === 'ml') {
      return 'machine-learning'
    }
    if (currentMenuKey === '/home') {
      return '/home'
    }
    for (const item of projectMenuSource) {
      if (!item || !('key' in item) || !('children' in item) || !item.children) continue
      const group = item.children as MenuItemList
      for (const child of group) {
        if (!child) continue
        if ('key' in child && child.key === currentMenuKey) {
          return item.key as string
        }
        if ('children' in child && child.children) {
          for (const subChild of child.children as MenuItemList) {
            if (subChild && 'key' in subChild && subChild.key === currentMenuKey) {
              return item.key as string
            }
          }
        }
      }
    }
    return '/home'
  }, [currentProjectMode, location.pathname, showProjectMenus])

  const activeMenuItems = useMemo(() => {
    if (isAdminRoute) {
      return filterMenuItems(systemMenuSource)
    }
    if (!showProjectMenus || !activeProjectTopKey || activeProjectTopKey === '/home') {
      return []
    }

    const topItem = projectMenuSource.find(item => item && 'key' in item && item.key === activeProjectTopKey)
    if (!topItem || !('children' in topItem) || !topItem.children) {
      return []
    }

    const flattenedChildren = (topItem.children as MenuItemList).map(child => {
      if (!child) return null
      if ('children' in child && child.children) {
        return {
          type: 'group' as const,
          key: `${topItem.key}-${String(child.key)}`,
          label: child.label,
          children: filterMenuItems(child.children as MenuItemList),
        }
      }
      return child
    }).filter(Boolean) as MenuItemList

    return filterMenuItems(flattenedChildren)
  }, [activeProjectTopKey, isAdminRoute, permissionState, showProjectMenus])

  const showSystemMenus = !isDocsRoute && isAdminRoute
  const showMainSider = showProjectMenus || showSystemMenus

  const getSelectedKeys = () => {
    const selectedKey = resolveRouteAccess(location.pathname)?.menuKey
    return selectedKey ? [selectedKey] : []
  }

  const getDefaultOpenKeys = () => {
    if (!isAdminRoute) {
      return []
    }
    const path = resolveRouteAccess(location.pathname)?.menuKey ?? location.pathname
    const openKeys: string[] = []

    activeMenuItems.forEach(item => {
      if (!item) return
      if ('children' in item && item.children) {
        item.children.forEach(child => {
          if (!child) return
          if ('key' in child && child.key === path) {
            openKeys.push(item.key as string)
          }
          if ('children' in child && child.children) {
            child.children.forEach(subChild => {
              if (subChild && 'key' in subChild && subChild.key === path) {
                openKeys.push(item.key as string)
                openKeys.push(child.key as string)
              }
            })
          }
        })
      }
    })

    return openKeys
  }

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem('design-doc-panel-open', String(docPanelOpen))
  }, [docPanelOpen])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (isDocsRoute) {
      setDocPanelOpen(false)
    }
  }, [isDocsRoute])

  useEffect(() => {
    if (shouldRedirectToWorkspace) {
      navigate('/workspace', { replace: true })
    }
  }, [navigate, shouldRedirectToWorkspace])

  const toggleDocPanel = () => {
    setDocPanelOpen(previous => !previous)
  }

  const openNotification = (notice: TaskNotification) => {
    markRead(notice.id, currentUser.account)
    setNotificationOpen(false)
    navigate(notice.targetPath)
  }

  const openStandaloneWindow = (path: string) => {
    if (typeof window === 'undefined') {
      navigate(path)
      return
    }

    window.open(path, '_blank', 'noopener,noreferrer')
  }

  const compactHeader = viewportWidth < 1280
  const compressedHeader = viewportWidth < 1180
  const ultraCompactHeader = viewportWidth < 1080
  const headerPaddingX = ultraCompactHeader ? 12 : compactHeader ? 18 : 28
  const headerGap = ultraCompactHeader ? 10 : compactHeader ? 14 : 20
  const navButtonPadding = ultraCompactHeader ? 10 : compactHeader ? 12 : 16
  const navButtonHeight = ultraCompactHeader ? 40 : 44
  const accountCardMinWidth = ultraCompactHeader ? 86 : compactHeader ? 126 : 150
  const showBrandSubtitle = !compactHeader
  const showLanguageLabel = !ultraCompactHeader
  const showRoleSubtitle = !compressedHeader
  const showAccountName = !ultraCompactHeader
  const headerGridColumns = ultraCompactHeader
    ? 'minmax(120px, auto) minmax(0, 1fr) minmax(64px, auto)'
    : compactHeader
      ? 'minmax(170px, auto) minmax(0, 1fr) minmax(160px, auto)'
      : 'minmax(220px, 1fr) minmax(0, 760px) minmax(280px, 1fr)'

  const contentNode = routeAccess.allowed ? (
    <div className={`app-shell ${docPanelOpen && !isDocsRoute ? 'app-shell--doc-open' : ''}`}>
      <div className="app-shell__main">{children}</div>

      {!isDocsRoute && (
        <div className={`app-shell__doc-rail ${docPanelOpen ? 'app-shell__doc-rail--open' : ''}`}>
          <DesignDocPanel doc={currentDoc} open={docPanelOpen} onClose={() => setDocPanelOpen(false)} />
        </div>
      )}
    </div>
  ) : shouldRedirectToWorkspace ? null : (
    <div style={{ padding: '64px 36px' }}>
      <Result
        status="403"
        title={routeAccess.reason === 'no-project' ? '请先进入项目空间' : '无菜单权限'}
        subTitle={
          routeAccess.reason === 'no-project'
            ? '登录后已自动匹配可访问项目，请先在项目空间中点击项目卡片，再进入对应业务功能。'
            : getOperationDeniedMessage(routeAccess.reason)
        }
        extra={
          <Button type="primary" onClick={() => navigate('/workspace')}>
            返回项目空间
          </Button>
        }
      />
    </div>
  )

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          height: 72,
          background: 'linear-gradient(90deg, #ffffff 0%, #eef4ff 52%, #f1fbf7 100%)',
          borderBottom: '1px solid rgba(148, 163, 184, 0.18)',
          display: 'grid',
          gridTemplateColumns: headerGridColumns,
          alignItems: 'center',
          columnGap: headerGap,
          padding: `0 ${headerPaddingX}px`,
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: headerGap, minWidth: 0, justifySelf: 'start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: compactHeader ? 10 : 12, minWidth: 0 }}>
            <div
              style={{
                width: compactHeader ? 38 : 42,
                height: compactHeader ? 38 : 42,
                background: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 6px 18px rgba(37, 99, 235, 0.28)',
                flexShrink: 0,
              }}
            >
              <RocketOutlined style={{ color: '#fff', fontSize: compactHeader ? 18 : 20 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#0f172a', fontSize: compactHeader ? 16 : 18, fontWeight: 800, lineHeight: 1.1, whiteSpace: 'nowrap' }}>Deepexilab</div>
              {showBrandSubtitle && <div style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.2 }}>LLM Workspace</div>}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'nowrap',
            justifyContent: 'center',
            width: '100%',
            minWidth: 0,
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            paddingInline: 4,
            justifySelf: 'center',
          }}
        >
          {isStandaloneUtilityRoute ? null : showProjectMenus ? (
            projectTopNavItems.map(item => (
              <Button
                key={item.key}
                type={activeProjectTopKey === item.key ? 'primary' : 'text'}
                icon={item.icon}
                onClick={() => navigate(item.route)}
                style={{
                  height: navButtonHeight,
                  paddingInline: navButtonPadding,
                  borderRadius: 16,
                  fontWeight: 700,
                  flexShrink: 0,
                  boxShadow: activeProjectTopKey === item.key ? '0 10px 24px rgba(37, 99, 235, 0.18)' : 'none',
                }}
              >
                {item.label}
              </Button>
            ))
          ) : (
            <>
              <Button
                type={activeTopTab === 'workspace' ? 'primary' : 'text'}
                icon={<FolderOpenOutlined />}
                onClick={() => navigate('/workspace')}
                style={{
                  height: navButtonHeight,
                  paddingInline: ultraCompactHeader ? 12 : 18,
                  borderRadius: 16,
                  fontWeight: 700,
                  flexShrink: 0,
                  boxShadow: activeTopTab === 'workspace' ? '0 10px 24px rgba(37, 99, 235, 0.18)' : 'none',
                }}
              >
                项目空间
              </Button>
              <Button
                type={activeTopTab === 'system' ? 'primary' : 'text'}
                icon={<SettingOutlined />}
                onClick={() => navigate('/admin/projects')}
                style={{
                  height: navButtonHeight,
                  paddingInline: ultraCompactHeader ? 12 : 18,
                  borderRadius: 16,
                  fontWeight: 700,
                  flexShrink: 0,
                  boxShadow: activeTopTab === 'system' ? '0 10px 24px rgba(37, 99, 235, 0.18)' : 'none',
                }}
              >
                系统管理
              </Button>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: ultraCompactHeader ? 4 : 8, minWidth: 0, justifySelf: 'end' }}>
          <Tooltip title="文档中心">
            <Button
              type="text"
              icon={<FileTextOutlined />}
              onClick={() => openStandaloneWindow('/docs')}
              style={{
                color: isDocsRoute ? '#1d4ed8' : '#475569',
                fontSize: 18,
                width: 40,
                height: 40,
                borderRadius: 10,
                background: isDocsRoute ? 'rgba(37, 99, 235, 0.08)' : undefined,
              }}
            />
          </Tooltip>

          <Tooltip title="通知中心">
            <Badge count={unreadCount} size="small" offset={[-2, 2]}>
              <Button
                type="text"
                icon={<BellOutlined />}
                onClick={() => setNotificationOpen(true)}
                style={{
                  color: '#475569',
                  fontSize: 18,
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                }}
              />
            </Badge>
          </Tooltip>

          <Dropdown
            menu={{
              items: [
                { key: 'zh', label: '中文' },
                { key: 'en', label: 'English' },
              ],
            }}
            trigger={['click']}
          >
            <Button
              type="text"
              icon={<GlobalOutlined />}
              style={{
                color: '#475569',
                fontSize: 14,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                minWidth: ultraCompactHeader ? 36 : undefined,
                paddingInline: ultraCompactHeader ? 8 : 12,
              }}
            >
              {showLanguageLabel ? 'zh' : null}
            </Button>
          </Dropdown>

          <Dropdown
            menu={{
              items: [
                { key: 'open-platform-api', label: 'API访问密钥' },
                { key: 'profile', label: '个人中心' },
                { key: 'settings', label: '设置' },
              ],
              onClick: ({ key }) => {
                if (key === 'open-platform-api') {
                  openStandaloneWindow('/open-platform/api-keys')
                }
              },
            }}
            trigger={['click']}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '6px 14px 6px 6px',
                marginLeft: 8,
                background: 'rgba(255, 255, 255, 0.7)',
                borderRadius: 14,
                cursor: 'pointer',
                border: '1px solid rgba(148, 163, 184, 0.18)',
                minWidth: accountCardMinWidth,
              }}
            >
              <Avatar
                size={compactHeader ? 30 : 34}
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {currentUser.account.slice(0, 1).toUpperCase()}
              </Avatar>
              {(showAccountName || showRoleSubtitle) && (
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.25 }}>
                  {showAccountName && (
                    <div style={{ color: '#0f172a', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {currentUser.account}
                    </div>
                  )}
                  {showRoleSubtitle && (
                    <div
                      style={{
                        color: '#94a3b8',
                        fontSize: 11,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: 110,
                      }}
                    >
                      {getUserRoleLabels(currentUser.account, permissionState).join(' / ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Dropdown>
        </div>
      </Header>

      <Layout style={{ marginTop: 72 }}>
        {showMainSider && (
          <Sider
            width={248}
            style={{
              background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
              boxShadow: '2px 0 12px rgba(0, 0, 0, 0.04)',
              overflow: 'auto',
              height: 'calc(100vh - 72px)',
              position: 'fixed',
              left: 0,
              top: 72,
              bottom: 0,
              borderRight: '1px solid #e2e8f0',
              transition: 'all 0.2s ease',
            }}
          >
            <div
              style={{
                padding: '16px 16px 12px',
                borderBottom: '1px solid #f1f5f9',
              }}
            >
              {!isAdminRoute && currentProject ? (
                <div
                  style={{
                    padding: '14px 16px',
                    background: '#f8fafc',
                    borderRadius: 14,
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>当前项目</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', wordBreak: 'break-all' }}>
                        {currentProject.name}
                      </div>
                    </div>
                    <Tag color="blue">已进入</Tag>
                  </div>
                  <Button
                    type="link"
                    size="small"
                    style={{ paddingInline: 0, marginTop: 10 }}
                    onClick={() => navigate('/workspace')}
                  >
                    返回项目空间
                  </Button>
                </div>
              ) : null}
            </div>

            <Menu
              mode="inline"
              selectedKeys={getSelectedKeys()}
              defaultOpenKeys={getDefaultOpenKeys()}
              items={activeMenuItems}
              onClick={({ key }) => {
                if (typeof key === 'string' && key.startsWith('/')) {
                  navigate(key)
                }
              }}
              style={{
                border: 'none',
                padding: '12px 8px',
                height: 'calc(100% - 92px)',
                overflow: 'auto',
              }}
            />
          </Sider>
        )}

        <Content
          style={{
            marginLeft: showMainSider ? 248 : 0,
            width: showMainSider ? 'calc(100% - 248px)' : '100%',
            maxWidth: showMainSider ? 'calc(100% - 248px)' : '100%',
            background: 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
            minHeight: 'calc(100vh - 72px)',
            overflow: 'auto',
            transition: 'margin-left 0.2s ease',
          }}
        >
          {contentNode}

          {!isDocsRoute && (
            <DesignDocFab
              open={docPanelOpen}
              onToggle={toggleDocPanel}
              rightOffset={docPanelOpen ? 428 : 28}
            />
          )}
        </Content>
      </Layout>
      <Drawer
        title="消息中心"
        placement="right"
        width={420}
        open={notificationOpen}
        onClose={() => setNotificationOpen(false)}
        extra={
          <Button type="link" disabled={!unreadCount} onClick={() => markAllRead(currentUser.account)}>
            全部已读
          </Button>
        }
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <Segmented
            block
            value={notificationFilter}
            onChange={value => setNotificationFilter(value as 'all' | 'unread')}
            options={[
              { label: `全部 ${visibleNotifications.length}`, value: 'all' },
              { label: `未读 ${unreadCount}`, value: 'unread' },
            ]}
          />

          {displayedNotifications.length ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {displayedNotifications.map(notice => {
                const isUnread = !notice.readAccounts.includes(currentUser.account)
                return (
                  <button
                    key={notice.id}
                    type="button"
                    onClick={() => openNotification(notice)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: `1px solid ${isUnread ? '#bfdbfe' : '#e2e8f0'}`,
                      background: isUnread ? '#eff6ff' : '#ffffff',
                      borderRadius: 8,
                      padding: 14,
                      cursor: 'pointer',
                      boxShadow: isUnread ? '0 8px 20px rgba(37, 99, 235, 0.08)' : 'none',
                    }}
                  >
                    <Space size={6} wrap style={{ marginBottom: 8 }}>
                      <Tag color={notificationSeverityColor[notice.severity]}>{taskNotificationLabels.type[notice.type]}</Tag>
                      <Tag>{taskNotificationLabels.status[notice.status]}</Tag>
                      {isUnread && <Tag color="blue">未读</Tag>}
                    </Space>
                    <div style={{ color: '#0f172a', fontSize: 14, fontWeight: 700, lineHeight: 1.45, marginBottom: 6 }}>
                      {notice.title}
                    </div>
                    <div style={{ color: '#475569', fontSize: 13, lineHeight: 1.6, marginBottom: 10 }}>
                      {notice.content}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{notice.taskModule}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{notice.createdAt}</Text>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={notificationFilter === 'unread' ? '暂无未读消息' : '暂无消息'} />
          )}
        </div>
      </Drawer>
    </Layout>
  )
}

export default AppLayout
