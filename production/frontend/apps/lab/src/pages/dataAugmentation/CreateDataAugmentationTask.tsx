import { ArrowLeftOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Cascader, Form, Input, InputNumber, Layout, Radio, Select, Space, Switch, Table, Typography, message } from 'antd'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { dataAugmentationService, type PromptDirectionConfig } from '@/services/dataAugmentationService'
import type { V115DatasetRef } from '@/services/dataInsightService'
import { trainingDatasetService } from '@/services/trainingApi'
import { DelopServerApi, inferenceServiceApi } from '@/services/inferenceService'

const { Title, Text } = Typography
type ServiceType = 'deployment' | 'online_inference'
type ServiceCascaderValue = [ServiceType, string]
type DirectionRow = PromptDirectionConfig & { custom?: boolean, row_id?: string }

const DEFAULT_DIRECTIONS: DirectionRow[] = [
  { direction: '同类泛化', sample_count: 50, enabled: false, description: '问题类型不变，变换发生场景和情境' },
  { direction: '同义泛化', sample_count: 100, enabled: false, description: '语义不变，调整词汇、句式和语气' },
  { direction: '增加约束', sample_count: 100, enabled: false, description: '增加输出格式、口吻、范围等约束' },
  { direction: '复杂场景变换', sample_count: 100, enabled: false, description: '加入多条件、长上下文或跨领域场景' },
  { direction: '考察方向变换', sample_count: 100, enabled: false, description: '变换问题考察重点' },
  { direction: '前提条件变换', sample_count: 100, enabled: false, description: '改变前提条件的取值范围、关键事实或逻辑关系' },
]

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

function getUsageLabel(usage?: string) {
  if (usage === 'validation') return '验证数据集'
  if (usage === 'test') return '测试数据集'
  return '训练数据集'
}

function getNextVersionFromDataset(dataset: any) {
  const version = String(dataset?.latest_version || dataset?.version || 'V1')
  const matched = version.match(/V?(\d+)/i)
  if (!matched) return 'V1'
  return `V${Number(matched[1]) + 1}`
}

export default function CreateDataAugmentationTask() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const numericProjectId = Number(projectId)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const promptEnabled = Form.useWatch('prompt_enabled', form)
  const responseEnabled = Form.useWatch('response_enabled', form)
  const outputFormat = Form.useWatch('output_format', form)
  const selectedDatasetValue = Form.useWatch('dataset', form)
  const [directions, setDirections] = useState<DirectionRow[]>(DEFAULT_DIRECTIONS)

  const { data } = useQuery({
    queryKey: ['data-augmentation-selectable-datasets', numericProjectId],
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
  const selectedDataset = useMemo(
    () => datasets.find((dataset: any) => String(dataset.id ?? `${dataset.dataset_name}:${dataset.latest_version}`) === selectedDatasetValue),
    [datasets, selectedDatasetValue],
  )
  const outputDatasetName = useMemo(() => {
    if (!selectedDataset) return ''
    return `${getUsageLabel(selectedDataset.usage)}/${selectedDataset.dataset_name}-${getNextVersionFromDataset(selectedDataset)}`
  }, [selectedDataset])
  const outputDatasetVersion = useMemo(() => selectedDataset ? getNextVersionFromDataset(selectedDataset) : 'V1', [selectedDataset])

  const { data: deploymentServices = [] } = useQuery({
    queryKey: ['data-augmentation-deployment-services', numericProjectId],
    queryFn: async () => {
      try {
        const response = await DelopServerApi.list({ project_id: numericProjectId, page: 1, size: 100 })
        return response?.items ?? []
      }
      catch (error) {
        console.warn('获取大模型部署服务失败', error)
        return []
      }
    },
    enabled: !!numericProjectId,
  })
  const { data: onlineInferenceServices = [] } = useQuery({
    queryKey: ['data-augmentation-online-inference-services', numericProjectId],
    queryFn: async () => {
      try {
        const response = await inferenceServiceApi.list({ projectId: String(numericProjectId), page: 1, size: 100 })
        return response?.items ?? []
      }
      catch (error) {
        console.warn('获取在线推理服务失败', error)
        return []
      }
    },
    enabled: !!numericProjectId,
  })
  const serviceOptions = useMemo(() => [
    {
      value: 'deployment',
      label: '大模型部署',
      children: deploymentServices.map((item: any) => ({
        value: String(item.id),
        label: item.server_name || item.name || item.model_name || `服务 ${item.id}`,
      })),
    },
    {
      value: 'online_inference',
      label: '在线推理服务',
      children: onlineInferenceServices.map((item: any) => ({
        value: String(item.id),
        label: item.name || item.model_name || `服务 ${item.id}`,
      })),
    },
  ], [deploymentServices, onlineInferenceServices])

  const resolveService = (value?: ServiceCascaderValue) => {
    if (!value || value.length !== 2) return {}
    const [serviceType, serviceId] = value
    const serviceList = serviceType === 'deployment' ? deploymentServices : onlineInferenceServices
    const service = serviceList.find((item: any) => String(item.id) === String(serviceId))
    return {
      service_type: serviceType,
      service_id: Number(serviceId),
      service_name: service?.server_name || service?.name || service?.model_name || '',
    }
  }

  const handleSubmit = async (values: any) => {
    const sourceDataset = buildDatasetRef(values.dataset, datasets)
    if (!sourceDataset) {
      message.error('请选择文本生成 SFT 数据集')
      return
    }
    if (!values.prompt_enabled && !values.response_enabled) {
      message.error('Prompt 生成和 Response 生成至少开启一个')
      return
    }
    const enabledDirections = directions.filter((item) => item.enabled)
    if (values.prompt_enabled && enabledDirections.some((item) => !item.direction.trim())) {
      message.error('请填写已启用的自定义增强方向')
      return
    }
    setSubmitting(true)
    try {
      const promptService = resolveService(values.prompt_service)
      const responseService = resolveService(values.response_service)
      const task = await dataAugmentationService.create(numericProjectId, {
        name: values.name,
        description: values.description,
        source_dataset: sourceDataset,
        output_dataset_name: outputDatasetName || values.output_dataset_name,
        output_dataset_version: outputDatasetVersion || 'V1',
        prompt_generation: {
          enabled: !!values.prompt_enabled,
          service_type: promptService.service_type,
          service_id: promptService.service_id,
          service_name: promptService.service_name,
          scene_description: values.scene_description,
          directions: directions.map(({ custom, row_id, ...item }) => item),
        },
        response_generation: {
          enabled: !!values.response_enabled,
          service_type: responseService.service_type,
          service_id: responseService.service_id,
          service_name: responseService.service_name,
          target_scope: values.target_scope || 'missing-only',
          output_format: values.output_format || 'text',
          json_schema: values.json_schema ? { raw: values.json_schema } : undefined,
        },
      })
      message.success('增强任务创建成功')
      navigate(`/project/${numericProjectId}/data-augmentation/${task.id}`)
    }
    finally {
      setSubmitting(false)
    }
  }

  return (
    <Layout.Content className="p-8">
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/project/${numericProjectId}/data-augmentation`)}>返回</Button>
      <Title level={3}>创建数据增强任务</Title>
      <Form
        form={form}
        layout="vertical"
        className="max-w-[980px]"
        initialValues={{ prompt_enabled: true, response_enabled: true, output_dataset_version: 'V1', output_format: 'text', target_scope: 'missing-only' }}
        onFinish={handleSubmit}
      >
        <Card title="基本信息" className="mb-4">
          <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
            <Input placeholder="示例：电商评论情感增强" />
          </Form.Item>
          <Form.Item name="dataset" label="处理前数据集" rules={[{ required: true, message: '请选择数据集' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="选择文本生成 SFT 数据集"
              options={datasets.map((item: any) => ({
                value: String(item.id ?? `${item.dataset_name}:${item.latest_version}`),
                label: `${item.dataset_name} / ${item.latest_version} / ${item.dataset_format}`,
              }))}
            />
          </Form.Item>
          <Form.Item label="处理后数据集" required>
            <Radio.Group value="new">
              <Radio.Button value="new">新增版本</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item label="增强后数据集名称">
            <div className="rounded-md border border-[#e5e7eb] bg-[#fafafa] px-3 py-2 text-sm text-[#1f2937]">
              {outputDatasetName ? `数据集名称: ${outputDatasetName}` : '数据集名称: -'}
            </div>
          </Form.Item>
        </Card>
        <Card title="Prompt 生成" className="mb-4">
          <Space direction="vertical" className="w-full" size={20}>
            <Form.Item name="prompt_enabled" label="是否开启 Prompt 生成" valuePropName="checked">
              <Switch />
            </Form.Item>
            {promptEnabled && (
              <>
                <Form.Item name="prompt_service" label="在线服务选择" rules={[{ required: true, message: '请选择在线服务' }]}>
                  <Cascader
                    options={serviceOptions}
                    placeholder="先选择服务类型，再选择具体服务"
                    showSearch
                    changeOnSelect={false}
                  />
                </Form.Item>
                <Form.Item name="scene_description" label="场景介绍">
                  <Input.TextArea rows={3} placeholder="请详细描述您的业务场景和目标" />
                </Form.Item>
                <div className="flex items-center justify-between">
                  <Text strong>增强方向</Text>
                  <Button
                    onClick={() => setDirections((prev) => [
                      ...prev,
                      { direction: '自定义方向', sample_count: 100, enabled: true, description: '', custom: true, row_id: `custom-${Date.now()}-${prev.length}` },
                    ])}
                  >
                    添加自定义方向
                  </Button>
                </div>
                <Table
                  rowKey={(record) => record.row_id || record.direction}
                  pagination={false}
                  dataSource={directions}
                  columns={[
                    {
                      title: '增强方向',
                      dataIndex: 'direction',
                      render: (_, record, index) => record.custom ? (
                        <Input
                          value={record.direction}
                          placeholder="请输入自定义方向"
                          onChange={(event) => setDirections((prev) => prev.map((item, i) => i === index ? { ...item, direction: event.target.value } : item))}
                        />
                      ) : record.direction,
                    },
                    {
                      title: '说明',
                      dataIndex: 'description',
                      render: (_, record, index) => record.custom ? (
                        <Input
                          value={record.description}
                          placeholder="请输入方向说明"
                          onChange={(event) => setDirections((prev) => prev.map((item, i) => i === index ? { ...item, description: event.target.value } : item))}
                        />
                      ) : record.description,
                    },
                    {
                      title: '生成样本数',
                      width: 160,
                      render: (_, record, index) => (
                        <InputNumber
                          min={1}
                          max={1000}
                          value={record.sample_count}
                          onChange={(value) => setDirections((prev) => prev.map((item, i) => i === index ? { ...item, sample_count: Number(value || 1) } : item))}
                        />
                      ),
                    },
                    {
                      title: '操作',
                      width: 90,
                      render: (_, record, index) => record.custom ? (
                        <Button type="link" danger onClick={() => setDirections((prev) => prev.filter((_, i) => i !== index))}>删除</Button>
                      ) : '-',
                    },
                    {
                      title: '是否应用',
                      width: 120,
                      render: (_, record, index) => (
                        <Switch
                          checked={record.enabled}
                          onChange={(checked) => setDirections((prev) => prev.map((item, i) => i === index ? { ...item, enabled: checked } : item))}
                        />
                      ),
                    },
                  ]}
                />
              </>
            )}
          </Space>
        </Card>
        <Card title="Response 生成" className="mb-4">
          <Text type="secondary" className="mb-4 block text-sm">
            先基于 Prompt 生成扩展样本，再为原始样本与扩展样本生成 Response；完成后可进入数据洞察筛选。
          </Text>
          <Space direction="vertical" className="w-full" size={20}>
            <Form.Item name="response_enabled" label="是否开启 Response 生成" valuePropName="checked">
              <Switch />
            </Form.Item>
            {responseEnabled && (
              <>
                <Form.Item name="response_service" label="在线服务选择" rules={[{ required: true, message: '请选择在线服务' }]}>
                  <Cascader
                    options={serviceOptions}
                    placeholder="先选择服务类型，再选择具体服务"
                    showSearch
                    changeOnSelect={false}
                  />
                </Form.Item>
                <Form.Item name="target_scope" label="生成范围">
                  <Select options={[
                    { value: 'missing-only', label: '仅无标注样本' },
                    { value: 'all', label: '全部样本' },
                  ]}
                  />
                </Form.Item>
                <Form.Item name="output_format" label="输出格式">
                  <Select options={[
                    { value: 'text', label: '文本' },
                    { value: 'json-object', label: 'JSON Object' },
                    { value: 'json-schema', label: 'JSON Schema' },
                  ]}
                  />
                </Form.Item>
                {outputFormat === 'json-schema' && (
                  <Form.Item name="json_schema" label="JSON Schema" rules={[{ required: true, message: '请输入 JSON Schema' }]}>
                    <Input.TextArea rows={5} placeholder='{"type":"object","properties":{"answer":{"type":"string"}},"required":["answer"]}' />
                  </Form.Item>
                )}
              </>
            )}
          </Space>
        </Card>
        <div className="sticky bottom-0 bg-white py-4 text-right">
          <Space>
            <Button onClick={() => navigate(`/project/${numericProjectId}/data-augmentation`)}>取消</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>确定</Button>
          </Space>
        </div>
      </Form>
    </Layout.Content>
  )
}
