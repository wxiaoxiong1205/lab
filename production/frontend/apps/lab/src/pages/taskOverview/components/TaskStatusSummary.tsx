import { Card, Col, Row, Tag, Typography } from 'antd'
import React from 'react'

export interface StatusSummaryItem {
  key: string
  label: string
  count: number
  color: string
  background: string
}

interface TaskStatusSummaryProps {
  scopeLabel: string
  title: string
  description: string
  total: number
  items: StatusSummaryItem[]
}

const { Text, Title } = Typography

const TaskStatusSummary = ({ scopeLabel, title, description, total, items }: TaskStatusSummaryProps) => {
  return (
    <Card className="task-overview-section-card" bodyStyle={{ padding: 20 }}>
      <div className="task-overview-section-head">
        <div>
          <Text type="secondary" className="text-[12px]">当前视图</Text>
          <Title level={3} className="!mt-1 !mb-1 !text-[18px]">{title}</Title>
          <Text type="secondary">{description}</Text>
        </div>
        <Tag className="task-overview-pill" color="blue">
          {scopeLabel}
          {' · '}
          {total}
        </Tag>
      </div>

      <Row gutter={[12, 12]}>
        {items.map((item) => (
          <Col xs={12} sm={8} md={6} xl={3} key={item.key}>
            <div
              className="task-overview-status-tile"
              style={{
                '--status-color': item.color,
                '--status-bg': item.background,
              } as React.CSSProperties}
            >
              <Text className="text-[13px] text-[var(--lab-color-text-secondary,#475569)]">{item.label}</Text>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-[28px] font-bold leading-none" style={{ color: item.color }}>
                  {item.count}
                </span>
                <Text type="secondary">个</Text>
              </div>
            </div>
          </Col>
        ))}
      </Row>
    </Card>
  )
}

export default TaskStatusSummary
