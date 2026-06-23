import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button, Card, Tabs, Tag } from 'antd'
import type { TabsProps } from 'antd'

interface ReportDetailShellProps {
  activeTab: string
  items: TabsProps['items']
  isCompleted: boolean
  statusText: string
  onBack: () => void
  onTabChange: (key: string) => void
}

export default function ReportDetailShell({
  activeTab,
  items,
  isCompleted,
  statusText,
  onBack,
  onTabChange,
}: ReportDetailShellProps) {
  return (
    <div className="evaluation-report-detail-container px-[24px] py-[16px] min-h-screen">
      <Card>
        <div className="mb-4">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack}>
            返回
          </Button>
        </div>
        <div>
          <Tabs
            activeKey={activeTab}
            onChange={onTabChange}
            items={items}
            type="line"
            size="large"
            tabBarExtraContent={(
              <Tag color={isCompleted ? 'green' : 'processing'}>
                {statusText}
              </Tag>
            )}
          />
        </div>
      </Card>
    </div>
  )
}
