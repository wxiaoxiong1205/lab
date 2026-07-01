import { BarChartOutlined, DeleteOutlined, EyeOutlined, FilterOutlined, PlusOutlined, ReloadOutlined, SaveOutlined, SearchOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Form, Input, Layout, Modal, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { dataInsightService, type DataInsightTask } from '@/services/dataInsightService'
import WorkflowSteps from '@/components/common/WorkflowSteps'
import { formatDateTime } from '@/utils/timeProcessing'

const { Title, Text } = Typography

const steps = [
  { icon: <SearchOutlined />, title: '选择数据集', description: '选择已发布的文本生成 SFT 数据集版本' },
  { icon: <BarChartOutlined />, title: '洞察数据', description: '统计字段、字符数、轮次和特殊字符分布' },
  { icon: <FilterOutlined />, title: '处理数据', description: '通过筛选条件删除或定位问题样本' },
  { icon: <SaveOutlined />, title: '保存数据', description: '另存为新的训练数据集版本' },
]

const insightStatusMap: Record<string, { text: string, color: string }> = {
  completed: { text: '已完成', color: 'green' },
  running: { text: '运行中', color: 'blue' },
  pending: { text: '待运行', color: 'default' },
  failed: { text: '失败', color: 'red' },
}

export default function DataInsight() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()
  const numericProjectId = Number(projectId)
  const [form] = Form.useForm()
  const [params, setParams] = useState({ page: 1, size: 10, name: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['data-insight-tasks', numericProjectId, params],
    queryFn: () => dataInsightService.list(numericProjectId, params),
    enabled: !!numericProjectId,
  })

  const handleDelete = (task: DataInsightTask) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定删除洞察任务 ${task.name} 吗？`,
      okText: '确认删除',
      cancelText: '取消',
      onOk: async () => {
        await dataInsightService.delete(numericProjectId, task.id)
        message.success('删除成功')
        queryClient.invalidateQueries({ queryKey: ['data-insight-tasks', numericProjectId] })
      },
    })
  }

  const columns: ColumnsType<DataInsightTask> = [
    { title: '数据集名称', dataIndex: 'source_dataset_name', ellipsis: true },
    {
      title: '任务状态',
      dataIndex: 'status',
      width: 110,
      render: (value, record) => {
        const status = insightStatusMap[value] || { text: record.status_display || value || '-', color: 'default' }
        return <Tag color={status.color}>{status.text}</Tag>
      },
    },
    { title: '数据格式', dataIndex: 'dataset_format', width: 150, render: (value) => <Tag color="blue">{value}</Tag> },
    { title: '样本数', width: 120, render: (_, record) => record.result_summary?.total_samples ?? '-' },
    { title: '洞察时间', dataIndex: 'created_at', width: 180, render: (value) => value ? formatDateTime(value) : '-' },
    {
      title: '操作',
      width: 180,
      render: (_, record) => (
        <Space>
          <Button type="link" icon={<EyeOutlined />} onClick={() => navigate(`/project/${numericProjectId}/data-insight/${record.id}`)}>查看详情</Button>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>删除</Button>
        </Space>
      ),
    },
  ]

  return (
    <Layout.Content className="p-8">
      <div className="mb-6">
        <Title level={3}>数据洞察</Title>
        <Text type="secondary">提供可视化的数据洞察，帮助分析数据情况和特征分布，为训练、评估等模块打造更高质量的数据。</Text>
      </div>
      <WorkflowSteps steps={steps} />
      <div className="flex items-center justify-between mb-4">
        <Form
          form={form}
          layout="inline"
          onFinish={(values) => setParams((prev) => ({ ...prev, page: 1, name: values.name?.trim() || '' }))}
        >
          <Form.Item name="name">
            <Input prefix={<SearchOutlined />} placeholder="搜索任务/数据集" allowClear />
          </Form.Item>
          <Button htmlType="submit">搜索</Button>
          <Button onClick={() => { form.resetFields(); setParams((prev) => ({ ...prev, page: 1, name: '' })) }}>重置</Button>
        </Form>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => queryClient.invalidateQueries({ queryKey: ['data-insight-tasks', numericProjectId] })}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/project/${numericProjectId}/data-insight/create`)}>创建洞察任务</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isLoading}
        pagination={{
          current: params.page,
          pageSize: params.size,
          total: data?.total ?? 0,
          onChange: (page, size) => setParams((prev) => ({ ...prev, page, size })),
          showTotal: (total) => `共 ${total} 条`,
        }}
      />
    </Layout.Content>
  )
}
