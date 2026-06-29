import { CheckCircleOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, SettingOutlined, ThunderboltOutlined, UploadOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Layout, Modal, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate, useParams } from 'react-router-dom'
import { dataAugmentationService, type DataAugmentationTask } from '@/services/dataAugmentationService'
import WorkflowSteps from '@/components/common/WorkflowSteps'
import TableActionColumn, { type TableActionItem } from '@/components/common/TableActionColumn'
import { formatDateTime } from '@/utils/timeProcessing'

const { Title, Text } = Typography

const steps = [
  { icon: <UploadOutlined />, title: '数据准备', description: '选择需要增强的数据集' },
  { icon: <SettingOutlined />, title: '选择增强类型', description: '配置 Prompt 生成或 Response 生成' },
  { icon: <ThunderboltOutlined />, title: '增强方向确定', description: '确定同类泛化、同义泛化等方向' },
  { icon: <CheckCircleOutlined />, title: '洞察筛选', description: '增强完成后进入数据洞察质检' },
]

const statusMap: Record<string, { text: string, color: string }> = {
  completed: { text: '已完成', color: 'green' },
  running: { text: '运行中', color: 'blue' },
  pending: { text: '待运行', color: 'default' },
  failed: { text: '失败', color: 'red' },
}

export default function DataAugmentation() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const numericProjectId = Number(projectId)
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['data-augmentation-tasks', numericProjectId],
    queryFn: () => dataAugmentationService.list(numericProjectId, { page: 1, size: 20 }),
    enabled: !!numericProjectId,
  })

  const handleDelete = (task: DataAugmentationTask) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定删除增强任务 ${task.name} 吗？`,
      okText: '确认删除',
      cancelText: '取消',
      onOk: async () => {
        await dataAugmentationService.delete(numericProjectId, task.id)
        message.success('删除成功')
        queryClient.invalidateQueries({ queryKey: ['data-augmentation-tasks', numericProjectId] })
      },
    })
  }

  const columns: ColumnsType<DataAugmentationTask> = [
    { title: '任务名称', dataIndex: 'name', ellipsis: true, width: 180 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: (value) => {
        const status = statusMap[value] || { text: value || '-', color: 'default' }
        return <Tag color={status.color}>{status.text}</Tag>
      },
    },
    { title: '增强前数据集', dataIndex: 'source_dataset_name', ellipsis: true, width: 160 },
    { title: '增强后数据集', dataIndex: 'output_dataset_name', ellipsis: true, width: 160 },
    { title: '生成样本', width: 120, render: (_, record) => record.result_summary?.generated_prompt_samples ?? '-' },
    { title: '创建时间', dataIndex: 'created_at', width: 180, render: (value) => value ? formatDateTime(value) : '-' },
    {
      title: '操作',
      width: 190,
      render: (_, record) => {
        const actions: TableActionItem[] = [
          {
            key: 'detail',
            label: '查看详情',
            icon: <EyeOutlined />,
            onClick: () => navigate(`/project/${numericProjectId}/data-augmentation/${record.id}`),
          },
          {
            key: 'insight',
            label: '进入洞察',
            onClick: () => navigate(`/project/${numericProjectId}/data-insight/create`),
          },
          {
            key: 'delete',
            label: '删除',
            icon: <DeleteOutlined />,
            danger: true,
            onClick: () => handleDelete(record),
          },
        ]

        return <TableActionColumn actions={actions} maxVisible={2} />
      },
    },
  ]

  return (
    <Layout.Content className="p-8">
      <div className="mb-6">
        <Title level={3}>数据增强</Title>
        <Text type="secondary">通过模型生成 Prompt 或 Response，扩展训练数据覆盖面；增强完成后建议进入数据洞察筛除低质样本。</Text>
      </div>
      <WorkflowSteps steps={steps} />
      <div className="flex justify-end mb-4">
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => queryClient.invalidateQueries({ queryKey: ['data-augmentation-tasks', numericProjectId] })}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/project/${numericProjectId}/data-augmentation/create`)}>创建任务</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isLoading}
        pagination={{ pageSize: 10, total: data?.total ?? 0 }}
        scroll={{ x: 1110 }}
      />
    </Layout.Content>
  )
}
