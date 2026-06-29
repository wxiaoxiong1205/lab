import { ArrowLeftOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Descriptions, Layout, Space, Statistic, Table, Tag, Typography } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { dataAugmentationService } from '@/services/dataAugmentationService'

const { Title } = Typography

const statusMap: Record<string, { text: string, color: string }> = {
  completed: { text: '已完成', color: 'green' },
  running: { text: '运行中', color: 'blue' },
  pending: { text: '待运行', color: 'default' },
  failed: { text: '失败', color: 'red' },
}

export default function DataAugmentationDetail() {
  const navigate = useNavigate()
  const { projectId, taskId } = useParams<{ projectId: string, taskId: string }>()
  const numericProjectId = Number(projectId)
  const numericTaskId = Number(taskId)
  const { data: task } = useQuery({
    queryKey: ['data-augmentation-detail', numericProjectId, numericTaskId],
    queryFn: () => dataAugmentationService.detail(numericProjectId, numericTaskId),
    enabled: !!numericProjectId && !!numericTaskId,
  })
  const summary = task?.result_summary ?? {}
  const directions = task?.config?.prompt_generation?.directions ?? []
  const samples = task?.result_samples?.items ?? []
  const status = task?.status ? statusMap[task.status] || { text: task.status, color: 'default' } : undefined

  return (
    <Layout.Content className="p-8">
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/project/${numericProjectId}/data-augmentation`)}>返回</Button>
      <div className="flex items-start justify-between mb-4">
        <div>
          <Title level={3}>{task?.name ?? '数据增强详情'}</Title>
        </div>
        <Space>
          <Button onClick={() => navigate(`/project/${numericProjectId}/data-insight/create`)}>进入数据洞察</Button>
        </Space>
      </div>
      <Card className="mb-4">
        <Descriptions column={3}>
          <Descriptions.Item label="增强前数据集">{task?.source_dataset_name} / {task?.source_dataset_version}</Descriptions.Item>
          <Descriptions.Item label="增强后数据集">{task?.output_dataset_name} / {task?.output_dataset_version}</Descriptions.Item>
          <Descriptions.Item label="状态">{status ? <Tag color={status.color}>{status.text}</Tag> : '-'}</Descriptions.Item>
          {task?.error_message && <Descriptions.Item label="失败原因" span={3}>{task.error_message}</Descriptions.Item>}
        </Descriptions>
      </Card>
      <div className="grid grid-cols-4 gap-4 mb-4">
        <Card><Statistic title="原始样本" value={summary.source_samples ?? 0} /></Card>
        <Card><Statistic title="Prompt 生成" value={summary.generated_prompt_samples ?? 0} /></Card>
        <Card><Statistic title="Response 生成" value={summary.generated_response_samples ?? 0} /></Card>
        <Card><Statistic title="输出样本" value={summary.total_output_samples ?? 0} /></Card>
      </div>
      <Card title="Prompt 增强方向" className="mb-4">
        <Table
          rowKey="direction"
          dataSource={directions}
          pagination={false}
          columns={[
            { title: '增强方向', dataIndex: 'direction' },
            { title: '生成样本数', dataIndex: 'sample_count' },
            { title: '是否应用', dataIndex: 'enabled', render: (value) => value ? '是' : '否' },
            { title: '说明', dataIndex: 'description' },
          ]}
        />
      </Card>
      <Card title="增强样本明细" className="mb-4">
        <Table
          rowKey="row_number"
          dataSource={samples}
          pagination={{ pageSize: 5, total: task?.result_samples?.total ?? samples.length }}
          columns={[
            { title: '序号', dataIndex: 'row_number', width: 80 },
            { title: '增强方向', dataIndex: 'direction', width: 140 },
            { title: '原始 Prompt', dataIndex: 'source_prompt', ellipsis: true },
            { title: '生成 Prompt', dataIndex: 'generated_prompt', ellipsis: true },
            { title: '生成 Response', dataIndex: 'generated_response', ellipsis: true },
            {
              title: '质量标记',
              width: 160,
              render: (_, record) => (record.quality_flags ?? []).length
                ? record.quality_flags.map((flag: string) => <Tag key={flag} color="orange">{flag}</Tag>)
                : '-',
            },
          ]}
          scroll={{ x: 1200 }}
        />
      </Card>
    </Layout.Content>
  )
}
