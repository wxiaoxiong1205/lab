import React, { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ApiOutlined, CloudSyncOutlined, PlayCircleOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  documentAgentApi,
  hasEmbeddingConfigChanged,
  type AgentAdvancedParams,
  type DocumentAgentIndexStatus,
  type DocumentAgentPayload,
  type DocumentAgentServiceRecord,
  type DocumentAgentStatus,
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

const cardStyle: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid #e5e7eb',
  boxShadow: '0 8px 26px rgba(15, 23, 42, 0.04)',
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

const DocumentAgentSettings: React.FC = () => {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const onlineServices = useOnlineInferenceServices()
  const { services, loading, setServices, refresh } = useDocumentAgentServices()
  const [open, setOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<DocumentAgentServiceRecord | null>(null)
  const chatModelSource = Form.useWatch('chatModelSource', form)

  const onlineInferenceOptions = useMemo(
    () =>
      onlineServices
        .filter(item => item.connectionStatus === '测试通过' && item.modelType.includes('文本生成'))
        .map(item => ({ value: item.id, label: item.name })),
    [onlineServices],
  )

  const activeService = services.find(item => item.status === 'running')

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

  const openCreate = () => {
    setEditingRecord(null)
    form.resetFields()
    form.setFieldsValue({
      chatModelSource: 'onlineInference',
      advanced: defaultAdvancedParams,
      embedding: { apiUrl: '', apiKey: '', modelName: '' },
      rerank: { apiUrl: '', apiKey: '', modelName: '' },
      customChat: { apiUrl: '', apiKey: '', modelName: '' },
    })
    setOpen(true)
  }

  const openEdit = (record: DocumentAgentServiceRecord) => {
    setEditingRecord(record)
    form.resetFields()
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      embedding: record.embedding,
      rerank: record.rerank,
      chatModelSource: record.chatModel.source,
      onlineInferenceServiceId: record.chatModel.onlineInferenceServiceId,
      customChat: record.chatModel.customApi ?? { apiUrl: '', apiKey: '', modelName: '' },
      advanced: record.chatModel.advanced,
    })
    setOpen(true)
  }

  const savePayload = async (payload: DocumentAgentPayload, rebuildIndex: boolean) => {
    const nextServices = editingRecord
      ? await documentAgentApi.updateService(editingRecord.id, payload)
      : await documentAgentApi.createService(payload)
    setServices(nextServices)

    if (rebuildIndex) {
      const targetId = editingRecord?.id ?? nextServices[0]?.id
      if (targetId) {
        setServices(await documentAgentApi.reindexService(targetId))
      }
    }

    message.success(editingRecord ? 'Agent 服务已更新' : 'Agent 服务已创建')
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
        onOk: () => savePayload(payload, true),
        onCancel: () => savePayload(payload, false),
      })
      return
    }

    await savePayload(payload, false)
  }

  const startService = async (record: DocumentAgentServiceRecord) => {
    const run = async () => {
      setServices(await documentAgentApi.startService(record.id))
      message.success(`已启动：${record.name}`)
    }

    if (activeService && activeService.id !== record.id) {
      Modal.confirm({
        title: '切换运行中的 Agent 服务',
        content: `当前已启动「${activeService.name}」。启动「${record.name}」后，当前服务会自动停止。`,
        okText: '启动并切换',
        cancelText: '取消',
        onOk: run,
      })
      return
    }

    await run()
  }

  const columns: ColumnsType<DocumentAgentServiceRecord> = [
    {
      title: '服务名称',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      render: (_, record) => (
        <div>
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => openEdit(record)}>
            {record.name}
          </Button>
          <div style={{ color: '#64748b', fontSize: 12 }}>{record.description || '暂无描述'}</div>
        </div>
      ),
    },
    {
      title: '运行状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (value: DocumentAgentStatus) => <Tag color={statusLabelMap[value].color}>{statusLabelMap[value].text}</Tag>,
    },
    {
      title: '索引状态',
      dataIndex: 'indexStatus',
      key: 'indexStatus',
      width: 100,
      render: (value: DocumentAgentIndexStatus) => <Tag color={indexStatusLabelMap[value].color}>{indexStatusLabelMap[value].text}</Tag>,
    },
    {
      title: '模型配置',
      key: 'models',
      width: 260,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text style={{ fontSize: 12 }}>Embedding：{record.embedding.modelName}</Text>
          <Text style={{ fontSize: 12 }}>Rerank：{record.rerank.modelName}</Text>
          <Text style={{ fontSize: 12 }}>
            对话：{record.chatModel.source === 'onlineInference' ? record.chatModel.onlineInferenceServiceName : record.chatModel.customApi?.modelName}
          </Text>
        </Space>
      ),
    },
    { title: '更新时间', dataIndex: 'updatedAt', key: 'updatedAt', width: 160 },
    {
      title: '操作',
      key: 'action',
      width: 310,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0}>
          {record.status === 'running' ? (
            <Button
              type="link"
              size="small"
              onClick={async () => {
                setServices(await documentAgentApi.stopService(record.id))
                message.success('Agent 服务已停止')
              }}
            >
              停止
            </Button>
          ) : (
            <Button type="link" size="small" onClick={() => startService(record)}>
              启动
            </Button>
          )}
          <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Button
            type="link"
            size="small"
            onClick={async () => {
              const result = await documentAgentApi.testService(record.id)
              result.ok ? message.success(result.message) : message.error(result.message)
            }}
          >
            测试
          </Button>
          <Button
            type="link"
            size="small"
            onClick={async () => {
              setServices(await documentAgentApi.reindexService(record.id))
              message.success('知识库向量已重新构建')
            }}
          >
            重建索引
          </Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={() => {
              if (record.status === 'running') {
                message.warning('运行中的 Agent 服务不能删除，请先停止服务')
                return
              }
              Modal.confirm({
                title: '删除 Agent 服务',
                content: `确认删除「${record.name}」吗？`,
                okText: '删除',
                okButtonProps: { danger: true },
                cancelText: '取消',
                onOk: async () => {
                  setServices(await documentAgentApi.deleteService(record.id))
                  message.success('Agent 服务已删除')
                },
              })
            }}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ ...cardStyle, background: '#fff', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <Title level={4} style={{ marginTop: 0, marginBottom: 6 }}>
              文档中心 Agent 服务
            </Title>
            <Text type="secondary">
              全局服务配置，同一时间仅允许一个 Agent 服务运行；文档中心将使用运行中的服务进行 RAG 问答和文档定位。
            </Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建服务</Button>
          </Space>
        </div>

        <Alert
          showIcon
          type="info"
          style={{ marginBottom: 16, borderRadius: 12 }}
          message={activeService ? `当前运行服务：${activeService.name}` : '当前未启动文档中心 Agent 服务'}
          description="Embedding 用于向量化文档，Rerank 用于对召回结果重排，对话模型用于生成最终回答和引用说明。"
        />

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={services}
          scroll={{ x: 1180 }}
          pagination={{ pageSize: 6, showTotal: total => `共 ${total} 个服务` }}
        />
      </div>

      <Modal
        title={editingRecord ? '编辑 Agent 服务' : '新建 Agent 服务'}
        open={open}
        width={920}
        onCancel={() => {
          setOpen(false)
          setEditingRecord(null)
          form.resetFields()
        }}
        onOk={submit}
        okText={editingRecord ? '保存' : '创建'}
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

            <Divider orientationMargin={0}>推理模型参数设置</Divider>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2 }}>
              {renderAdvancedNumber('max_tokens(最大生成token数)', 'maxTokens', { placeholder: '留空表示不限制', step: 1, min: 1 })}
              {renderAdvancedNumber('Temperature（温度）', 'temperature', { required: true, step: 0.1, min: 0 })}
              {renderAdvancedNumber('Top_p（核采样）', 'topP', { required: true, step: 0.1, min: 0 })}
              {renderAdvancedNumber('presence_penalty（存在性惩罚）', 'presencePenalty', { required: true, step: 0.1 })}
            </div>
          </Card>

          {editingRecord && (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 14, borderRadius: 12 }}
              message="修改 Embedding 配置后，保存时将提示是否重建知识库向量。"
              description={`当前 API Key：${maskApiKey(editingRecord.embedding.apiKey)}`}
            />
          )}
        </Form>
      </Modal>
    </>
  )
}

export default DocumentAgentSettings
