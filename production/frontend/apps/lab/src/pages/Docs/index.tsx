import React from 'react'
import { Card, List, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { ApiOutlined, AppstoreOutlined, BulbOutlined, FileTextOutlined } from '@ant-design/icons'
import '../../styles/docs.css'

const { Title, Paragraph } = Typography
const docsList = [
  {
    title: '产品规划',
    description: '模型训练平台产品架构、功能和发展路线图',
    icon: <AppstoreOutlined className="text-[24px] text-[var(--lab-color-brand-primary)]" />,
    link: '/docs/product-planning',
    available: true,
  },
  {
    title: 'API文档',
    description: '平台API接口使用说明和示例',
    icon: <ApiOutlined className="text-[24px] text-[var(--lab-color-purple)]" />,
    link: '/docs/api',
    available: false,
  },
  {
    title: '用户指南',
    description: '平台功能使用说明和最佳实践',
    icon: <FileTextOutlined className="text-[24px] text-[var(--lab-color-success)]" />,
    link: '/docs/user-guide',
    available: false,
  },
  {
    title: '常见问题',
    description: '常见问题解答和故障排除指南',
    icon: <BulbOutlined className="text-[24px] text-[var(--lab-color-warning)]" />,
    link: '/docs/faq',
    available: false,
  },
]
const DocsIndex: React.FC = () => {
  return (
    <div className="p-[32px_40px] max-w-[1200px] m-[0_auto]">
      {/* 页面标题和介绍 */}
      <div className="docs-hero mb-[40px] text-center p-[40px_20px] rounded-[12px]">
        <Title
          className="docs-hero-title mb-[16px]"
          level={1}
        >
          📚 文档中心
        </Title>
        <Paragraph
          className="docs-muted text-[18px] max-w-[600px] m-[0_auto]"
        >
          欢迎来到
          DeepexiLab文档中心。这里提供了平台的完整使用指南、API文档和最佳实践，
          帮助您快速上手并充分利用平台的各项功能。
        </Paragraph>
      </div>

      {/* 快速导航 */}
      <div className="mb-[32px]">
        <Title level={3} className="mb-6">
          📖 快速导航
        </Title>

        <List
          grid={{
            gutter: [24, 24],
            xs: 1,
            sm: 1,
            md: 2,
            lg: 2,
            xl: 2,
            xxl: 2,
          }}
          dataSource={docsList}
          renderItem={(item) => (
            <List.Item>
              {item.available ? (
                <Link className="block h-[100%]" to={item.link}>
                  <Card
                    className="docs-card h-[100%] rounded-[8px]"
                    hoverable
                    bodyStyle={{ padding: '24px' }}
                  >
                    <Card.Meta
                      avatar={item.icon}
                      title={(
                        <span className="text-[16px] font-semibold">
                          {item.title}
                        </span>
                      )}
                      description={(
                        <div>
                          <Paragraph className="docs-muted m-[8px_0_16px_0]">
                            {item.description}
                          </Paragraph>
                          <div className="text-[var(--lab-color-brand-primary)] text-[14px] font-medium">
                            查看文档 →
                          </div>
                        </div>
                      )}
                    />
                  </Card>
                </Link>
              ) : (
                <Card
                  className="docs-card h-[100%] rounded-[8px] opacity-[0.6] cursor-not-allowed"
                  bodyStyle={{ padding: '24px' }}
                >
                  <Card.Meta
                    avatar={<div className="opacity-[0.5]">{item.icon}</div>}
                    title={(
                      <span
                        className="docs-disabled text-[16px] font-semibold"
                      >
                        {item.title}
                      </span>
                    )}
                    description={(
                      <div>
                        <Paragraph className="docs-disabled m-[8px_0_16px_0]">
                          {item.description}
                        </Paragraph>
                        <div className="text-[var(--lab-color-placeholder)] text-[14px] font-medium">
                          🚧 即将推出
                        </div>
                      </div>
                    )}
                  />
                </Card>
              )}
            </List.Item>
          )}
        />
      </div>

      {/* 使用提示 */}
      <Card
        className="docs-card mt-[32px] rounded-[8px]"
        title="💡 使用提示"
      >
        <List
          size="small"
          dataSource={[
            '使用左侧导航栏可以快速跳转到不同的文档页面',
            '每个文档页面都包含详细的说明和示例代码',
            '如果您在使用过程中遇到问题，请查看常见问题页面',
            '建议按照产品规划 → API文档 → 用户指南的顺序阅读文档',
          ]}
          renderItem={(item, index) => (
            <List.Item className="p-[8px_0]">
              <span className="text-[var(--lab-color-brand-primary)] mr-2">
                {index + 1}
                .
              </span>
              {item}
            </List.Item>
          )}
        />
      </Card>
    </div>
  )
}
export default DocsIndex
