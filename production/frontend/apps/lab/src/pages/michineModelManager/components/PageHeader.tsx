import { Space, Typography } from 'antd'

interface PageHeaderProps {
  title: string
  showBack?: boolean
}

const PageHeader = ({ title }: PageHeaderProps) => {
  return (
    <div className="flex items-center justify-between mb-4">
      <Space size={12}>
        <Typography.Title level={4} className="!mb-0">
          {title}
        </Typography.Title>
      </Space>
    </div>
  )
}

export default PageHeader
