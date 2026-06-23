import type { MenuProps } from 'antd'
import { Layout, Menu, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

const { Content, Sider } = Layout
const { Title } = Typography

const menuItems: MenuProps['items'] = [
  {
    key: 'user-manual',
    label: '用户手册',
  },
  {
    key: 'product-api',
    label: '产品API',
  },
  {
    key: 'model-api',
    label: '模型API',
  },
]

export default function DocumentPage() {
  const navigate = useNavigate()
  const [selectedKeys, setSelectedKeys] = useState<string[]>(['user-manual'])

  const handleMenuClick = ({ key }: { key: string }) => {
    setSelectedKeys([key])
    // 这里可以根据key来加载不同的文档内容
  }

  return (
    <Layout className="h-[calc(100vh-120px)] bg-white overflow-hidden">
      <Layout className="h-full">
        <Sider
          width={200}
          className="!bg-white h-full overflow-hidden flex flex-col"
          style={{
            borderRight: '1px solid #f0f0f0',
          }}
        >
          <div className="border-b border-[#f0f0f0] flex-none">
            <Title level={4} className="px-4 py-4 mb-0">
              文档中心
            </Title>
          </div>
          <Menu
            mode="inline"
            selectedKeys={selectedKeys}
            className="flex-1 overflow-y-auto !bg-white"
            style={{ borderRight: 0 }}
            items={menuItems}
            onClick={handleMenuClick}
          />
        </Sider>
        <Layout className="h-full overflow-hidden">
          <Content className="bg-white p-6 h-full overflow-y-auto">
            {/* 这里可以根据selectedKeys来渲染对应的文档内容 */}
            <div className="prose max-w-none">
              <h1>用户手册</h1>
              <p>这里是用户手册的内容...</p>
            </div>
          </Content>
        </Layout>
      </Layout>
    </Layout>
  )
}
