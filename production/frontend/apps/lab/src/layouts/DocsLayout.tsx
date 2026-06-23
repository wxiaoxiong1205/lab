import React, { Suspense, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Button, Layout } from 'antd'
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons'
import DocsSidebar from '../components/DocsSidebar'
import '../styles/docs.css'

const { Content, Sider } = Layout
/**
 * 文档布局组件
 * 提供文档页面的布局结构，包含左侧导航栏和主内容区域
 */
const DocsLayout: React.FC = () => {
  // 控制侧边栏折叠状态
  const [collapsed, setCollapsed] = useState(false)
  // 切换侧边栏折叠状态
  const toggleCollapsed = () => {
    setCollapsed(!collapsed)
  }
  return (
    <Layout className="min-h-[100vh]">
      {/* 左侧导航栏 */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={280}
        collapsedWidth={0}
        breakpoint="lg"
        className="docs-sider"
        trigger={null} // 禁用默认的折叠按钮，使用自定义按钮
      >
        <DocsSidebar />
      </Sider>

      {/* 主内容区域 */}
      <Layout>
        {/* 顶部工具栏 */}
        <div className="docs-toolbar p-[0_16px] flex items-center h-[48px] sticky top-[0] z-[100]">
          {/* 折叠按钮 */}
          <Button type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={toggleCollapsed} className="text-[16px] w-[32px] h-[32px]" />

        </div>

        {/* 文档内容区域 */}
        <Content className="p-0 m-0 bg-[var(--lab-color-surface-elevated)] overflow-auto">
          <Suspense fallback={(
            <div className="p-10 text-center text-[16px] text-[var(--lab-color-text-muted)]">
              📖 文档加载中...
            </div>
          )}
          >
            <Outlet />
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  )
}
export default DocsLayout
