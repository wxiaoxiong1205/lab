import React, { useEffect, useMemo, useState } from 'react'
import { Layout, Menu, Dropdown, Button, Badge, Avatar, Tooltip, Result, Tag } from 'antd'
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
  MenuFoldOutlined,
  MenuUnfoldOutlined,
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
  getCurrentUser,
  getOperationDeniedMessage,
  getUserRoleLabels,
  hasMenuPermission,
  setCurrentUser,
  usePermissionStore,
} from '../../services/permissionStore'
import { resolveRouteAccess } from '../../services/permissionCatalog'

const { Header, Sider, Content } = Layout

interface AppLayoutProps {
  children: React.ReactNode
}

type MenuItemList = NonNullable<MenuProps['items']>

const projectMenuSource: MenuItemList = [
  {
    key: '/home',
    icon: <HomeOutlined />,
    label: '项目概览',
  },
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
      { key: '/machine-annotation', label: '机器学习标注' },
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
  { key: '/admin/registry', icon: <AppstoreOutlined />, label: '镜像管理' },
  { key: '/admin/base-model', icon: <CloudServerOutlined />, label: '模型仓库' },
  { key: '/admin/settings', icon: <SettingOutlined />, label: '系统配置' },
  { key: '/admin/permissions', icon: <FileTextOutlined />, label: '权限配置' },
]

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const permissionState = usePermissionStore()
  const [collapsed, setCollapsed] = useState(false)
  const isDocsRoute = location.pathname.startsWith('/docs')
  const isWorkspaceRoute = location.pathname === '/workspace'
  const isAdminRoute = location.pathname.startsWith('/admin')
  const [docPanelOpen, setDocPanelOpen] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.localStorage.getItem('design-doc-panel-open') === 'true'
  })
  const currentDoc = getPageDesignDoc(location.pathname)
  const currentUser = getCurrentUser(permissionState)
  const currentProject = getCurrentProject(permissionState)
  const routeAccess = canViewCurrentRoute(location.pathname, permissionState)

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
  const activeMenuItems = useMemo(
    () => filterMenuItems(isAdminRoute ? systemMenuSource : projectMenuSource),
    [isAdminRoute, permissionState],
  )

  const showProjectMenus = !isDocsRoute && !isWorkspaceRoute && !isAdminRoute && Boolean(currentProject)
  const showSystemMenus = !isDocsRoute && isAdminRoute
  const showMainSider = showProjectMenus || showSystemMenus

  const getSelectedKeys = () => {
    const selectedKey = resolveRouteAccess(location.pathname)?.menuKey
    return selectedKey ? [selectedKey] : []
  }

  const getDefaultOpenKeys = () => {
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
    if (isDocsRoute) {
      setDocPanelOpen(false)
    }
  }, [isDocsRoute])

  const toggleDocPanel = () => {
    setDocPanelOpen(previous => !previous)
  }

  const contentNode = routeAccess.allowed ? (
    <div className={`app-shell ${docPanelOpen && !isDocsRoute ? 'app-shell--doc-open' : ''}`}>
      <div className="app-shell__main">{children}</div>

      {!isDocsRoute && (
        <div className={`app-shell__doc-rail ${docPanelOpen ? 'app-shell__doc-rail--open' : ''}`}>
          <DesignDocPanel doc={currentDoc} open={docPanelOpen} onClose={() => setDocPanelOpen(false)} />
        </div>
      )}
    </div>
  ) : (
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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {showMainSider && (
            <Tooltip title={collapsed ? '展开菜单' : '收起菜单'}>
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed(!collapsed)}
                style={{
                  color: '#475569',
                  fontSize: 18,
                  width: 40,
                  height: 40,
                }}
              />
            </Tooltip>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                background: 'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 6px 18px rgba(37, 99, 235, 0.28)',
              }}
            >
              <RocketOutlined style={{ color: '#fff', fontSize: 20 }} />
            </div>
            <div>
              <div style={{ color: '#0f172a', fontSize: 18, fontWeight: 800, lineHeight: 1.1 }}>FastAGI</div>
              <div style={{ color: '#94a3b8', fontSize: 11, lineHeight: 1.2 }}>LLM Workspace</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            type={activeTopTab === 'workspace' ? 'primary' : 'text'}
            icon={<FolderOpenOutlined />}
            onClick={() => navigate('/workspace')}
            style={{
              height: 48,
              paddingInline: 22,
              borderRadius: 16,
              fontWeight: 700,
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
              height: 48,
              paddingInline: 22,
              borderRadius: 16,
              fontWeight: 700,
              boxShadow: activeTopTab === 'system' ? '0 10px 24px rgba(37, 99, 235, 0.18)' : 'none',
            }}
          >
            系统管理
          </Button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tooltip title="文档中心">
            <Button
              type="text"
              icon={<FileTextOutlined />}
              onClick={() => navigate('/docs')}
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
            <Badge count={3} size="small" offset={[-2, 2]}>
              <Button
                type="text"
                icon={<BellOutlined />}
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
              }}
            >
              zh
            </Button>
          </Dropdown>

          <Dropdown
            menu={{
              items: [
                { key: 'switch-title', label: '切换身份', disabled: true },
                ...permissionState.users.map(user => ({
                  key: `switch:${user.account}`,
                  label: `${user.account} · ${getUserRoleLabels(user.account, permissionState).join(' / ')}`,
                })),
                { type: 'divider' as const },
                { key: 'profile', label: '个人中心' },
                { key: 'settings', label: '设置' },
              ],
              onClick: ({ key }) => {
                if (key.startsWith('switch:')) {
                  setCurrentUser(key.replace('switch:', ''))
                  navigate('/workspace')
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
                padding: '6px 12px 6px 6px',
                marginLeft: 8,
                background: 'rgba(255, 255, 255, 0.7)',
                borderRadius: 14,
                cursor: 'pointer',
                border: '1px solid rgba(148, 163, 184, 0.18)',
              }}
            >
              <Avatar
                size={34}
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {currentUser.account.slice(0, 1).toUpperCase()}
              </Avatar>
              <div>
                <div style={{ color: '#0f172a', fontSize: 13, fontWeight: 600 }}>{currentUser.account}</div>
                <div style={{ color: '#94a3b8', fontSize: 11 }}>{getUserRoleLabels(currentUser.account, permissionState).join(' / ')}</div>
              </div>
            </div>
          </Dropdown>
        </div>
      </Header>

      <Layout style={{ marginTop: 72 }}>
        {showMainSider && (
          <Sider
            width={collapsed ? 72 : 248}
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
            {!collapsed && (
              <div
                style={{
                  padding: '16px 16px 12px',
                  borderBottom: '1px solid #f1f5f9',
                }}
              >
                {isAdminRoute ? (
                  <div
                    style={{
                      padding: '14px 16px',
                      background: '#f8fafc',
                      borderRadius: 14,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>当前域</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>系统管理</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>平台级配置与资源治理</div>
                  </div>
                ) : currentProject ? (
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
            )}

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
              inlineCollapsed={collapsed}
              style={{
                border: 'none',
                padding: '12px 8px',
                height: collapsed ? 'calc(100% - 73px)' : 'calc(100% - 92px)',
                overflow: 'auto',
              }}
            />
          </Sider>
        )}

        <Content
          style={{
            marginLeft: showMainSider ? (collapsed ? 72 : 248) : 0,
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
    </Layout>
  )
}

export default AppLayout
