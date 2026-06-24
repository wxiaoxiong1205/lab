import { Card, Col, Progress, Row, Space, Tag, Typography } from 'antd'
import { ClusterOutlined } from '@ant-design/icons'

export interface ResourceMetric {
  label: string
  used: number
  total: number
  unit: string
}

interface ComputeResourceCardProps {
  resourceTypes: string[]
  projectMetrics: ResourceMetric[]
  clusterMetrics: ResourceMetric[]
  scopeLabel: string
  clusterName?: string
}

const { Text, Title } = Typography

const ResourcePanel = ({
  title,
  subtitle,
  tag,
  color,
  metrics,
}: {
  title: string
  subtitle: string
  tag: string
  color: string
  metrics: ResourceMetric[]
}) => (
  <div className="task-overview-resource-panel">
    <div className="mb-4">
      <Space wrap size={8} className="mb-1">
        <span className="task-overview-resource-dot" style={{ background: color }} />
        <Title level={5} className="!m-0">{title}</Title>
        <Tag className="!m-0 rounded-full" style={{ color, borderColor: `${color}22`, background: `${color}10` }}>
          {tag}
        </Tag>
      </Space>
      <div>
        <Text type="secondary">{subtitle}</Text>
      </div>
    </div>

    <Row gutter={[14, 14]}>
      {metrics.map((metric) => {
        const percent = metric.total ? Math.round((metric.used / metric.total) * 100) : 0
        return (
          <Col xs={24} sm={12} key={metric.label}>
            <div className="task-overview-resource-metric">
              <div className="mb-2 flex items-center justify-between gap-3">
                <Text type="secondary">{metric.label}</Text>
                <Text style={{ color }}>
                  <strong>
                    {metric.used}
                    /
                    {metric.total}
                    {metric.unit}
                  </strong>
                </Text>
              </div>
              <Progress percent={percent} showInfo={false} size="small" strokeColor={color} />
            </div>
          </Col>
        )
      })}
    </Row>
  </div>
)

const ComputeResourceCard = ({
  resourceTypes,
  projectMetrics,
  clusterMetrics,
  scopeLabel,
  clusterName,
}: ComputeResourceCardProps) => {
  return (
    <Card className="task-overview-section-card task-overview-compute-card" bodyStyle={{ padding: 22 }}>
      <div className="task-overview-section-head task-overview-compute-head">
        <div>
          <Space size={10} className="mb-1">
            <ClusterOutlined className="text-[#2563eb]" />
            <Title level={4} className="!m-0">算力资源</Title>
          </Space>
          <div>
            <Text type="secondary">当前项目与绑定集群的算力使用放在同一模块中对比查看。</Text>
          </div>
        </div>
        <div className="task-overview-compute-tags">
          {resourceTypes.map((item) => <Tag key={item} color={item.includes('GPU') ? 'blue' : 'default'}>{item}</Tag>)}
        </div>
      </div>

      <div className="task-overview-compute-grid">
        <ResourcePanel
          title="当前项目算力"
          subtitle="当前范围内运行、启动中，分母为绑定集群总量"
          tag={scopeLabel}
          color="#2563eb"
          metrics={projectMetrics}
        />
        <ResourcePanel
          title="对应集群算力"
          subtitle={`集群整体资源使用${clusterName ? `：${clusterName}` : ''}，不受任务范围筛选影响`}
          tag="集群总量"
          color="#059669"
          metrics={clusterMetrics}
        />
      </div>
    </Card>
  )
}

export default ComputeResourceCard
