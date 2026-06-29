import { ArrowLeftOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Form, Input, Layout, Select, Space, Typography, message } from 'antd'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { dataInsightService, type V115DatasetRef } from '@/services/dataInsightService'
import { trainingDatasetService } from '@/services/trainingApi'

const { Title } = Typography

function buildDatasetRef(value: string, datasets: any[]): V115DatasetRef | null {
  const item = datasets.find((dataset) => String(dataset.id ?? `${dataset.dataset_name}:${dataset.latest_version}`) === value)
  if (!item) return null
  return {
    dataset_id: item.id,
    dataset_name: item.dataset_name,
    version: item.latest_version,
    usage: item.usage || 'training',
    dataset_type: item.dataset_type,
    training_method_type: item.training_method_type,
    dataset_format: item.dataset_format,
  }
}

export default function CreateDataInsightTask() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const numericProjectId = Number(projectId)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  const { data } = useQuery({
    queryKey: ['data-insight-selectable-datasets', numericProjectId],
    queryFn: () => trainingDatasetService.get(numericProjectId, {
      page: 1,
      size: 100,
      dataset_type: 'text-generation',
      training_method_type: 'sft',
      publish: 1,
    }),
    enabled: !!numericProjectId,
  })

  const datasets = useMemo(() => (data?.items ?? []).filter((item: any) => ['prompt-response', 'role-based'].includes(item.dataset_format)), [data?.items])

  const handleSubmit = async (values: any) => {
    const sourceDataset = buildDatasetRef(values.dataset, datasets)
    if (!sourceDataset) {
      message.error('请选择文本生成 SFT 数据集')
      return
    }
    setSubmitting(true)
    try {
      const task = await dataInsightService.create(numericProjectId, {
        name: values.name,
        description: values.description,
        source_dataset: sourceDataset,
      })
      message.success('洞察任务创建成功')
      navigate(`/project/${numericProjectId}/data-insight/${task.id}`)
    }
    finally {
      setSubmitting(false)
    }
  }

  return (
    <Layout.Content className="p-8">
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/project/${numericProjectId}/data-insight`)}>返回</Button>
      <Title level={3}>创建数据洞察任务</Title>
      <Form form={form} layout="vertical" onFinish={handleSubmit} className="max-w-[920px]">
        <Card title="基本信息" className="mb-4">
          <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
            <Input placeholder="示例：客服问答 SFT 数据洞察" />
          </Form.Item>
          <Form.Item name="description" label="任务描述">
            <Input.TextArea placeholder="补充本次洞察目标" rows={3} />
          </Form.Item>
          <Form.Item name="dataset" label="洞察数据集" rules={[{ required: true, message: '请选择数据集' }]}>
            <Select
              showSearch
              placeholder="选择已发布的文本生成 SFT 数据集"
              optionFilterProp="label"
              options={datasets.map((item: any) => ({
                value: String(item.id ?? `${item.dataset_name}:${item.latest_version}`),
                label: `${item.dataset_name} / ${item.latest_version} / ${item.dataset_format}`,
              }))}
            />
          </Form.Item>
        </Card>
        <div className="sticky bottom-0 bg-white py-4 text-right">
          <Space>
            <Button onClick={() => navigate(`/project/${numericProjectId}/data-insight`)}>取消</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>创建任务</Button>
          </Space>
        </div>
      </Form>
    </Layout.Content>
  )
}
