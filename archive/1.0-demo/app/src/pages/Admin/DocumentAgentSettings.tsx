import React, { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Collapse,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd'
import { ApiOutlined, CloudSyncOutlined, EditOutlined, PlayCircleOutlined, ReloadOutlined, ToolOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  documentAgentApi,
  hasEmbeddingConfigChanged,
  type AgentAdvancedParams,
  type DocumentAgentPayload,
  type DocumentAgentServiceRecord,
  useDocumentAgentServices,
} from '../../services/documentAgentService'
import { useOnlineInferenceServices } from '../../services/onlineInferenceServiceStore'

const { Text, Title } = Typography

const statusLabelMap: Record<DocumentAgentServiceRecord['status'], { text: string; color: string }> = {
  stopped: { text: '未启动', color: 'default' },
  starting: { text: '启动中', color: 'processing' },
  running: { text: '运行中', color: 'green' },
  failed: { text: '异常', color: 'red' },
}

const indexStatusLabelMap: Record<DocumentAgentServiceRecord['indexStatus'], { text: string; color: string }> = {
  not_built: { text: '未构建', color: 'default' },
  building: { text: '构建中', color: 'processing' },
  ready: { text: '已就绪', color: 'green' },
  failed: { text: '构建失败', color: 'red' },
}

const defaultAdvancedParams: AgentAdvancedParams = {
  maxTokens: null,
  temperature: 0.7,
  topP: 1,
  presencePenalty: 0,
}

const panelStyle: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid #e5e7eb',
  boxShadow: '0 8px 26px rgba(15, 23, 42, 0.04)',
  background: '#fff',
  padding: 20,
}

interface DocumentAgentFormValues {
  name: string
  description?: string
  embedding: DocumentAgentPayload['embedding']
  rerank: DocumentAgentPayload['rerank']
  chatModelSource: DocumentAgentPayload['chatModel']['source']
  onlineInferenceServiceId?: string
  customChat?: DocumentAgentPayload['chatModel']['customApi']
  advanced: AgentAdvancedParams
}

function maskApiKey(value?: string) {
  if (!value) return '-'
  if (value.length <= 8) return '********'
  return `${value.slice(0, 3)}****${value.slice(-4)}`
}

function modelName(record: DocumentAgentServiceRecord) {
  return record.chatModel.source === 'onlineInference'
    ? record.chatModel.onlineInferenceServiceName || '-'
    : record.chatModel.customApi?.modelName || '-'
}

const DocumentAgentSettings: React.FC = () => {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const onlineServices = useOnlineInferenceServices()
  const { services, loading, setServices, refresh } = useDocumentAgentServices()
  const [open, setOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<DocumentAgentServiceRecord | null>(null)
  const chatModelSource = Form.useWatch('chatModelSource', form)

  const service = services[0] ?? null

  const onlineInferenceOptions = useMemo(
    () =>
      onlineServices
        .filter(item => item.connectionStatus === '测试通过' && item.modelType.includes('文本生成'))
        .map(item => ({ value: item.id, label: item.name })),
    [onlineServices],
  )

  const openConfig = () => {
    setEditingRecord(service)
    form.resetFields()
    form.setFieldsValue({
      name: service?.name ?? '文档中心默认助手',
      description: service?.description ?? '用于文档中心问答和文档定位的全局 Agent 服务。',
      embedding: service?.embedding ?? { apiUrl: '', apiKey: '', modelName: '' },
      rerank: service?.rerank ?? { apiUrl: '', apiKey: '', modelName: '' },
      chatModelSource: service?.chatModel.source ?? 'onlineInference',
      onlineInferenceServiceId: service?.chatModel.onlineInferenceServiceId,
      customChat: service?.chatModel.customApi ?? { apiUrl: '', apiKey: '', modelName: '' },
      advanced: service?.chatModel.advanced ?? defaultAdvancedParams,
    })
    setOpen(true)
  }

  const renderAdvancedNumber = (
    label: string,
    name: keyof AgentAdvancedParams,
    options?: { required?: boolean; placeholder?: string; step?: number; min?: number },
  ) => (
    <Form.Item
      label={label}
      name={['advanced', name]}
      rules={options?.required ? [{ required: true, message: `请配置${label}` }] : undefined}
    >
      <InputNumber
        controls={false}
        step={options?.step ?? 0.1}
        min={options?.min}
        placeholder={options?.placeholder}
        style={{ width: '100%' }}
        addonAfter={
          <Space.Compact>
            <Button
              size="small"
              onClick={() => {
                const current = Number(form.getFieldValue(['advanced', name]) ?? 0)
                form.setFieldValue(['advanced', name], Number((current - (options?.step ?? 0.1)).toFixed(2)))
              }}
            >
              -
            </Button>
            <Button
              size="small"
              onClick={() => {
                const current = Number(form.getFieldValue(['advanced', name]) ?? 0)
                form.setFieldValue(['advanced', name], Number((current + (options?.step ?? 0.1)).toFixed(2)))
              }}
            >
              +
            </Button>
          </Space.Compact>
        }
      />
    </Form.Item>
  )

  const buildPayload = (values: DocumentAgentFormValues): DocumentAgentPayload => {
    const selectedOnlineService = onlineServices.find(item => item.id === values.onlineInferenceServiceId)
    return {
      name: values.name,
      description: values.description || '',
      embedding: values.embedding,
      rerank: values.rerank,
      chatModel: {
        source: values.chatModelSource,
        onlineInferenceServiceId: values.chatModelSource === 'onlineInference' ? values.onlineInferenceServiceId : undefined,
        onlineInferenceServiceName: values.chatModelSource === 'onlineInference' ? selectedOnlineService?.name : undefined,
        customApi: values.chatModelSource === 'customApi' ? values.customChat : undefined,
        advanced: {
          maxTokens: values.advanced?.maxTokens ?? null,
          temperature: values.advanced?.temperature,
          topP: values.advanced?.topP,
          presencePenalty: values.advanced?.presencePenalty,
        },
      },
    }
  }

  const persistAndStart = async (payload: DocumentAgentPayload, rebuildIndex: boolean) => {
    const savedServices = editingRecord
      ? await documentAgentApi.updateService(editingRecord.id, payload)
      : await documentAgentApi.createService(payload)
    const targetId = editingRecord?.id ?? savedServices[0]?.id
    let nextServices = savedServices

    if (targetId && rebuildIndex) {
      nextServices = await documentAgentApi.reindexService(targetId)
    }
    if (targetId) {
      nextServices = await documentAgentApi.startService(targetId)
    }

    setServices(nextServices)
    message.success('Agent 服务已保存并启动')
    setOpen(false)
    setEditingRecord(null)
    form.resetFields()
  }

  const submit = async () => {
    const values = await form.validateFields()
    const payload = buildPayload(values)

    if (editingRecord && hasEmbeddingConfigChanged(editingRecord, payload)) {
      Modal.confirm({
        title: '修改向量模型配置',
        content: '修改向量模型会触发知识库向量重新构建，是否重新构建？',
        okText: '是',
        cancelText: '否',
        onOk: () => persistAndStart(payload, true),
        onCancel: () => persistAndStart(payload, false),
      })
      return
    }

    await persistAndStart(payload, false)
  }

  return (
    <>
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <Title level={4} style={{ marginTop: 0, marginBottom: 6 }}>
              Agent服务
            </Title>
            <Text type="secondary">
              启用后，文档中心将展示 Agent 助手，用户可通过对话检索平台文档，并查看命中文档的章节定位与引用来源。
            </Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
            <Button type="primary" icon={<EditOutlined />} onClick={openConfig}>
              {service ? '编辑配置' : '配置服务'}
            </Button>
          </Space>
        </div>

        {loading ? (
          <div style={{ padding: '64px 0', textAlign: 'center' }}>
            <Spin />
          </div>
        ) : service ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert
              showIcon
              type={service.status === 'running' ? 'success' : 'info'}
              style={{ borderRadius: 12 }}
              message={service.status === 'running' ? `当前运行服务：${service.name}` : '当前服务已配置，保存配置后会自动启动'}
              description="Embedding 用于向量化文档，Rerank 用于对召回结果重排，对话模型用于生成最终回答和引用说明。"
            />

            <div
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 14,
                overflow: 'hidden',
                background: '#fff',
              }}
            >
              <div style={{ padding: '18px 20px', display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', borderBottom: '1px solid #eef2f7' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <Text strong style={{ fontSize: 16 }}>{service.name}</Text>
                    <Tag color={statusLabelMap[service.status].color}>{statusLabelMap[service.status].text}</Tag>
                    <Tag color={indexStatusLabelMap[service.indexStatus].color}>索引{indexStatusLabelMap[service.indexStatus].text}</Tag>
                  </div>
                  <Text type="secondary">{service.description || '暂无描述'}</Text>
                </div>
                <Space wrap>
                  <Button
                    onClick={async () => {
                      const result = await documentAgentApi.testService(service.id)
                      result.ok ? message.success(result.message) : message.error(result.message)
                    }}
                  >
                    测试连接
                  </Button>
                  <Button
                    icon={<ToolOutlined />}
                    onClick={async () => {
                      setServices(await documentAgentApi.reindexService(service.id))
                      message.success('知识库向量已重新构建')
                    }}
                  >
                    重建索引
                  </Button>
                </Space>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0 }}>
                {[
                  {
                    title: 'Embedding',
                    icon: <CloudSyncOutlined />,
                    model: service.embedding.modelName,
                    api: service.embedding.apiUrl,
                    key: service.embedding.apiKey,
                  },
                  {
                    title: 'Rerank',
                    icon: <ApiOutlined />,
                    model: service.rerank.modelName,
                    api: service.rerank.apiUrl,
                    key: service.rerank.apiKey,
                  },
                  {
                    title: '对话模型',
                    icon: <PlayCircleOutlined />,
                    model: modelName(service),
                    api: service.chatModel.source === 'onlineInference' ? '在线推理服务' : service.chatModel.customApi?.apiUrl || '-',
                    key: service.chatModel.source === 'onlineInference' ? '-' : maskApiKey(service.chatModel.customApi?.apiKey),
                  },
                ].map(item => (
                  <div key={item.title} style={{ padding: 18, borderRight: item.title === '对话模型' ? 'none' : '1px solid #eef2f7', minWidth: 0 }}>
                    <Space size={8} style={{ marginBottom: 12 }}>
                      {item.icon}
                      <Text strong>{item.title}</Text>
                    </Space>
                    <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
                      <Text style={{ fontSize: 13 }} ellipsis={{ tooltip: item.model }}>模型：{item.model || '-'}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: item.api }}>API：{item.api || '-'}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>Key：{item.key === service.embedding.apiKey || item.key === service.rerank.apiKey ? maskApiKey(item.key) : item.key}</Text>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Space>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="尚未配置文档中心 Agent 服务"
          >
            <Button type="primary" icon={<EditOutlined />} onClick={openConfig}>配置服务</Button>
          </Empty>
        )}
      </div>

      <Modal
        title={editingRecord ? '编辑 Agent 服务' : '配置 Agent 服务'}
        open={open}
        width={920}
        onCancel={() => {
          setOpen(false)
          setEditingRecord(null)
          form.resetFields()
        }}
        onOk={submit}
        okText="保存并启动"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Card size="small" style={{ borderRadius: 14, marginBottom: 14 }}>
            <Form.Item label="服务名称" name="name" rules={[{ required: true, message: '请输入服务名称' }]}>
              <Input placeholder="请输入服务名称" />
            </Form.Item>
            <Form.Item label="服务描述" name="description">
              <Input.TextArea rows={2} placeholder="请输入服务描述（可选）" />
            </Form.Item>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Card size="small" title={<Space><CloudSyncOutlined />Embedding 配置</Space>} style={{ borderRadius: 14 }}>
              <Form.Item label="API地址" name={['embedding', 'apiUrl']} rules={[{ required: true, message: '请输入 Embedding API 地址' }]}>
                <Input placeholder="https://api.example.com/v1/embeddings" />
              </Form.Item>
              <Form.Item label="API Key" name={['embedding', 'apiKey']} rules={[{ required: true, message: '请输入 Embedding API Key' }]}>
                <Input.Password placeholder="请输入 API Key" />
              </Form.Item>
              <Form.Item label="模型名称" name={['embedding', 'modelName']} rules={[{ required: true, message: '请输入 Embedding 模型名称' }]}>
                <Input placeholder="例如 bge-m3" />
              </Form.Item>
            </Card>

            <Card size="small" title={<Space><ApiOutlined />Rerank 配置</Space>} style={{ borderRadius: 14 }}>
              <Form.Item label="API地址" name={['rerank', 'apiUrl']} rules={[{ required: true, message: '请输入 Rerank API 地址' }]}>
                <Input placeholder="https://api.example.com/v1/rerank" />
              </Form.Item>
              <Form.Item label="API Key" name={['rerank', 'apiKey']} rules={[{ required: true, message: '请输入 Rerank API Key' }]}>
                <Input.Password placeholder="请输入 API Key" />
              </Form.Item>
              <Form.Item label="模型名称" name={['rerank', 'modelName']} rules={[{ required: true, message: '请输入 Rerank 模型名称' }]}>
                <Input placeholder="例如 bge-reranker-large" />
              </Form.Item>
            </Card>
          </div>

          <Card size="small" title={<Space><PlayCircleOutlined />对话模型配置</Space>} style={{ borderRadius: 14, marginTop: 14 }}>
            <Form.Item label="模型来源" name="chatModelSource" rules={[{ required: true, message: '请选择模型来源' }]}>
              <Radio.Group
                options={[
                  { value: 'onlineInference', label: '选择在线推理服务' },
                  { value: 'customApi', label: '自行配置 API' },
                ]}
              />
            </Form.Item>

            {chatModelSource === 'onlineInference' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'end' }}>
                <Form.Item
                  label="在线推理服务"
                  name="onlineInferenceServiceId"
                  rules={[{ required: true, message: '请选择在线推理服务' }]}
                >
                  <Select
                    placeholder="请选择测试通过且支持文本生成的在线推理服务"
                    options={onlineInferenceOptions}
                    notFoundContent="暂无可用在线推理服务"
                  />
                </Form.Item>
                <Button
                  onClick={() => {
                    const redirect = encodeURIComponent('/admin/settings?tab=agent')
                    navigate(`/service/inference/external/create?redirect=${redirect}`)
                  }}
                >
                  新增在线推理服务
                </Button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Form.Item label="API地址" name={['customChat', 'apiUrl']} rules={[{ required: true, message: '请输入对话模型 API 地址' }]}>
                  <Input placeholder="https://api.example.com/v1/chat/completions" />
                </Form.Item>
                <Form.Item label="API Key" name={['customChat', 'apiKey']} rules={[{ required: true, message: '请输入对话模型 API Key' }]}>
                  <Input.Password placeholder="请输入 API Key" />
                </Form.Item>
                <Form.Item label="模型名称" name={['customChat', 'modelName']} rules={[{ required: true, message: '请输入对话模型名称' }]}>
                  <Input placeholder="例如 qwen-plus" />
                </Form.Item>
              </div>
            )}

            <Divider orientationMargin={0} />
            <Collapse
              bordered={false}
              style={{ background: '#f8fafc', borderRadius: 12 }}
              items={[
                {
                  key: 'advanced',
                  label: '高级配置',
                  children: (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2 }}>
                      {renderAdvancedNumber('max_tokens(最大生成token数)', 'maxTokens', { placeholder: '留空表示不限制', step: 1, min: 1 })}
                      {renderAdvancedNumber('Temperature（温度）', 'temperature', { required: true, step: 0.1, min: 0 })}
                      {renderAdvancedNumber('Top_p（核采样）', 'topP', { required: true, step: 0.1, min: 0 })}
                      {renderAdvancedNumber('presence_penalty（存在性惩罚）', 'presencePenalty', { required: true, step: 0.1 })}
                    </div>
                  ),
                },
              ]}
            />
          </Card>
        </Form>
      </Modal>
    </>
  )
}

export default DocumentAgentSettings
