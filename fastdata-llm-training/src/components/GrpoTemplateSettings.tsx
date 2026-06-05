import React, { useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CopyOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  buildGrpoTemplateYaml,
  grpoTrainingParameterTemplateActions,
  parseGrpoTemplateYaml,
  type GrpoTrainingParameterTemplate,
  useGrpoTrainingParameterTemplates,
} from '../services/grpoTrainingParameterTemplateStore'
import type { FineTuneType } from '../types/training'

const { Text } = Typography

type TemplateMetaFormValues = {
  name: string
  description?: string
  enabled: boolean
}

const defaultTemplate: { fineTuneType: FineTuneType; params: Record<string, unknown> } = {
  fineTuneType: 'lora',
  params: {
    learningRate: 0.00002,
    numEpochs: 3,
    perDeviceBatchSize: 2,
    gradientAccumulationSteps: 1,
    warmupRatio: 0.1,
    lrSchedulerType: 'COSINE',
    useBf16: true,
    gradientCheckpointing: true,
    maxGradNorm: 1,
    ropeScalingMethod: 'YARN',
    randomSeed: 42,
    weightDecay: 0,
    cutoffLength: 4096,
    preprocessingNumWorkers: 16,
    evalStrategy: 'STEPS',
    evalSteps: 20,
    metricGreaterIsBetter: false,
    loadBestModelAtEnd: true,
    bestModelMetric: 'loss',
    perDeviceEvalBatchSize: 2,
    saveSteps: 20,
    saveStrategy: 'STEPS',
    saveTotalLimit: 3,
    loggingSteps: 5,
    loraRank: 16,
    loraTargetModules: ['all'],
    loraAlpha: 32,
    loraDropout: 0,
  },
}

function buildTemplateDraft(template?: GrpoTrainingParameterTemplate) {
  if (!template) {
    return buildGrpoTemplateYaml(defaultTemplate)
  }
  return buildGrpoTemplateYaml({
    fineTuneType: template.fineTuneType,
    params: template.params,
  })
}

const GrpoTemplateSettings: React.FC = () => {
  const templates = useGrpoTrainingParameterTemplates()
  const [form] = Form.useForm<TemplateMetaFormValues>()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<GrpoTrainingParameterTemplate | null>(null)
  const [templateDraft, setTemplateDraft] = useState('')

  const openEditor = (template?: GrpoTrainingParameterTemplate) => {
    setEditingTemplate(template ?? null)
    form.setFieldsValue({
      name: template?.name ?? '',
      description: template?.description ?? '',
      enabled: template?.enabled ?? true,
    })
    setTemplateDraft(buildTemplateDraft(template))
    setModalOpen(true)
  }

  const closeEditor = () => {
    setModalOpen(false)
    setEditingTemplate(null)
    setTemplateDraft('')
    form.resetFields()
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const parsed = parseGrpoTemplateYaml(templateDraft)
      grpoTrainingParameterTemplateActions.upsert({
        id: editingTemplate?.id ?? `grpo-template-${Date.now()}`,
        name: values.name,
        description: values.description ?? '',
        enabled: values.enabled,
        fineTuneType: parsed.fineTuneType,
        params: parsed.params,
        createdAt: editingTemplate?.createdAt,
      })
      message.success(editingTemplate ? '配置已更新' : '配置已添加')
      closeEditor()
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message || '配置模板不合法')
      }
    }
  }

  const columns: ColumnsType<GrpoTrainingParameterTemplate> = [
    {
      title: '模板名称',
      dataIndex: 'name',
      key: 'name',
      render: (value: string, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{value}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.description || '暂无描述'}</Text>
        </Space>
      ),
    },
    {
      title: '微调类型',
      dataIndex: 'fineTuneType',
      key: 'fineTuneType',
      width: 120,
      render: (value: FineTuneType) => <Tag color={value === 'lora' ? 'purple' : 'blue'}>{value === 'lora' ? 'LoRA微调' : '全参微调'}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 110,
      render: (value: boolean, record) => (
        <Switch
          checked={value}
          checkedChildren="启用"
          unCheckedChildren="停用"
          onChange={() => grpoTrainingParameterTemplateActions.toggleEnabled(record.id)}
        />
      ),
    },
    { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 180 },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_, record) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditor(record)}>编辑</Button>
          <Button
            type="link"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => {
              grpoTrainingParameterTemplateActions.upsert({
                ...record,
                id: `grpo-template-${Date.now()}`,
                name: `${record.name} 副本`,
              })
              message.success('配置已复制')
            }}
          >
            复制
          </Button>
          <Popconfirm
            title="确认删除该配置？"
            okText="删除"
            cancelText="取消"
            onConfirm={() => {
              grpoTrainingParameterTemplateActions.delete(record.id)
              message.success('配置已删除')
            }}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <Card
        style={{ borderRadius: 16, border: '1px solid #e5e7eb', background: '#fbfdff' }}
        styles={{ body: { padding: 18 } }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }}>
          <Space direction="vertical" size={4}>
            <Text strong style={{ fontSize: 16 }}>GRPO训练参数配置</Text>
            <Text type="secondary">
              将 GRPO 常用训练参数沉淀为可复用配置，创建训练任务时可快速带出参数模板，并在本次任务中继续调整。
            </Text>
          </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>
            新增配置
          </Button>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={templates}
          pagination={false}
          scroll={{ x: 900 }}
        />
      </Card>

      <Modal
        title={editingTemplate ? '编辑GRPO训练参数配置' : '新增GRPO训练参数配置'}
        open={modalOpen}
        width={920}
        onCancel={closeEditor}
        footer={
          <Space>
            <Button onClick={closeEditor}>取消</Button>
            <Button type="primary" onClick={handleSubmit}>保存</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" initialValues={{ enabled: true }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 16 }}>
            <Form.Item label="模板名称" name="name" rules={[{ required: true, message: '请输入模板名称' }]}>
              <Input placeholder="请输入模板名称" />
            </Form.Item>
            <Form.Item label="启用状态" name="enabled" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="停用" />
            </Form.Item>
            <Form.Item label="模板描述" name="description" style={{ gridColumn: '1 / -1' }}>
              <Input.TextArea rows={2} placeholder="请输入模板描述" />
            </Form.Item>
          </div>
        </Form>

        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Text strong>参数模板</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            在下方直接维护 YAML 模板。只允许 fineTuneType 与 params；params 只支持当前产品已有训练参数字段。
          </Text>
          <Input.TextArea
            rows={22}
            value={templateDraft}
            onChange={event => setTemplateDraft(event.target.value)}
            placeholder={buildGrpoTemplateYaml(defaultTemplate)}
            style={{
              fontFamily: 'Menlo, Monaco, Consolas, "Liberation Mono", monospace',
              fontSize: 12,
              lineHeight: 1.6,
              background: '#0f172a',
              color: '#e2e8f0',
              borderRadius: 12,
            }}
          />
        </Space>
      </Modal>
    </>
  )
}

export default GrpoTemplateSettings
