import React from 'react'
import { Menu, Typography } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import { ApiOutlined, AppstoreOutlined, BulbOutlined, FileTextOutlined, HomeOutlined } from '@ant-design/icons'
import '../styles/docs.css'

const { Title } = Typography
/**
 * 文档侧边栏组件
 * 提供文档页面的导航目录
 */
const DocsSidebar: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  // 文档菜单项配置
  const menuItems = [
    {
      key: '/docs',
      icon: <HomeOutlined />,
      label: '文档概述',
      title: '文档中心首页',
    },
    {
      key: '/docs/product-planning',
      icon: <AppstoreOutlined />,
      label: '产品规划',
      title: '模型训练平台产品架构、功能和发展路线图',
    },
    {
      key: '/docs/api',
      icon: <ApiOutlined />,
      label: 'API文档',
      title: '平台API接口使用说明和示例',
      disabled: true, // 暂时禁用，待实现
    },
    {
      key: '/docs/user-guide',
      icon: <FileTextOutlined />,
      label: '用户指南',
      title: '平台功能使用说明和最佳实践',
      disabled: true, // 暂时禁用，待实现
    },
    {
      key: '/docs/faq',
      icon: <BulbOutlined />,
      label: '常见问题',
      title: '常见问题解答和故障排除指南',
      disabled: true, // 暂时禁用，待实现
    },
  ]
  // 处理菜单点击事件
  const handleMenuClick = ({ key }: {
    key: string
  }) => {
    navigate(key)
  }
  // 获取当前选中的菜单项
  const getSelectedKeys = () => {
    const currentPath = location.pathname
    // 精确匹配当前路径
    const matchedItem = menuItems.find((item) => item.key === currentPath)
    return matchedItem ? [matchedItem.key] : ['/docs']
  }
  return (
    <div className="h-full flex flex-col">
      {/* 侧边栏标题 */}
      <div className="docs-sidebar-header p-[16px_24px]">
        <Title level={4} className="m-0 text-[var(--lab-color-brand-primary)]">
          📚 文档中心
        </Title>
      </div>

      {/* 导航菜单 */}
      <div className="flex-1 overflow-auto">
        <Menu
          className="docs-sidebar-menu h-[100%]"
          mode="inline"
          selectedKeys={getSelectedKeys()}
          onClick={handleMenuClick}
          items={menuItems.map((item) => ({
            key: item.key,
            icon: item.icon,
            label: item.label,
            disabled: item.disabled,
            title: item.title,
          }))}
        />
      </div>

      {/* 底部信息 */}
      <div className="docs-sidebar-footer p-[16px_24px] text-[12px]">
        <div>DeepexiLab v1.0</div>
        <div>文档更新时间: 2025-05-23</div>
      </div>
    </div>
  )
}
export default DocsSidebar
