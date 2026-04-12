import React, { useState } from 'react'
import { Layout, Menu, Select, Dropdown, Button, Badge, Avatar, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  HomeOutlined,
  DatabaseOutlined,
  CloudServerOutlined,
  ExperimentOutlined,
  BarChartOutlined,
  AppstoreOutlined,
  UserOutlined,
  GlobalOutlined,
  BellOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  RocketOutlined,
  FileTextOutlined,
} from '@ant-design/icons'

const { Header, Sider, Content } = Layout

interface AppLayoutProps {
  children: React.ReactNode
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const hideMainSider = location.pathname.startsWith('/docs')

  const menuItems: MenuProps['items'] = [
    {
      key: '/home',
      icon: <HomeOutlined />,
      label: '首页',
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
        { key: '/model', label: '模型管理' },
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
        { key: '/service/inference/hosted', label: '模型部署' },
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
      ],
    },
    {
      key: 'system-management',
      icon: <SettingOutlined />,
      label: '系统管理',
      children: [
        { key: '/admin/projects', label: '项目管理' },
        { key: '/admin/kubernetes', label: '集群管理' },
        { key: '/admin/storage', label: '存储配置' },
        { key: '/admin/registry', label: '镜像管理' },
        { key: '/admin/base-model', label: '基础模型管理' },
        { key: '/admin/settings', label: '系统配置' },
      ],
    },
    {
      key: '/admin/platform-management',
      icon: <UserOutlined />,
      label: '平台管理员',
    },
  ]

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key.startsWith('/')) {
      navigate(key)
    }
  }

  const getSelectedKeys = () => {
    const path = location.pathname
    return menuItems
      .filter(item => item?.key === path)
      .map(item => item!.key as string)
  }

  const getDefaultOpenKeys = () => {
    const path = location.pathname
    const openKeys: string[] = []

    menuItems.forEach(item => {
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

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          height: 60,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Tooltip title={collapsed ? '展开菜单' : '收起菜单'}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: 18,
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
          </Tooltip>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)',
              }}
            >
              <RocketOutlined style={{ color: '#fff', fontSize: 18 }} />
            </div>
            <div>
              <div style={{ color: '#fff', fontSize: 17, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.3px' }}>
                DeepexiLab
              </div>
              <div style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 11, lineHeight: 1.2 }}>
                LLM Training Platform
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tooltip title="文档中心">
            <Button
              type="text"
              icon={<FileTextOutlined />}
              onClick={() => navigate('/docs')}
              style={{
                color: hideMainSider ? '#fff' : 'rgba(255, 255, 255, 0.7)',
                fontSize: 18,
                width: 40,
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 10,
                background: hideMainSider ? 'rgba(255, 255, 255, 0.12)' : undefined,
              }}
            />
          </Tooltip>

          <Tooltip title="通知中心">
            <Badge count={3} size="small" offset={[-2, 2]}>
              <Button
                type="text"
                icon={<BellOutlined />}
                style={{
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: 18,
                  width: 40,
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
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
                color: 'rgba(255, 255, 255, 0.7)',
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
                { key: 'profile', label: '个人中心' },
                { key: 'settings', label: '设置' },
                { type: 'divider' },
                { key: 'logout', label: '退出登录', danger: true },
              ],
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
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: 10,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <Avatar
                size={32}
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                L
              </Avatar>
              <div style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: 13, fontWeight: 500 }}>
                lab1
              </div>
            </div>
          </Dropdown>
        </div>
      </Header>

      <Layout style={{ marginTop: 60 }}>
        {!hideMainSider && (
        <Sider
          width={collapsed ? 72 : 240}
          style={{
            background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
            boxShadow: '2px 0 12px rgba(0, 0, 0, 0.04)',
            overflow: 'auto',
            height: 'calc(100vh - 60px)',
            position: 'fixed',
            left: 0,
            top: 60,
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
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  background: '#f8fafc',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    color: '#fff',
                    fontWeight: 600,
                  }}
                >
                  V1
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', lineHeight: 1.2 }}>
                    V1.12测试项目
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.2, marginTop: 2 }}>
                    已选择
                  </div>
                </div>
              </div>
            </div>
          )}

          <Menu
            mode="inline"
            selectedKeys={getSelectedKeys()}
            defaultOpenKeys={getDefaultOpenKeys()}
            items={menuItems}
            onClick={handleMenuClick}
            inlineCollapsed={collapsed}
            style={{
              border: 'none',
              padding: '12px 8px',
              height: collapsed ? 'calc(100% - 73px)' : 'calc(100% - 85px)',
              overflow: 'auto',
            }}
          />
        </Sider>
        )}

        <Content
          style={{
            marginLeft: hideMainSider ? 0 : collapsed ? 72 : 240,
            background: 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
            minHeight: 'calc(100vh - 60px)',
            overflow: 'auto',
            transition: 'margin-left 0.2s ease',
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}

export default AppLayout
