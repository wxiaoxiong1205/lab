import React, { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Checkbox,
  Descriptions,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined } from '@ant-design/icons'
import { mockBaseModels } from '../../data/mockDataAll'
import type { BaseModelRecord } from '../../types/shared'
import {
  canRunTaskLifecycleAction,
  getPrimaryTaskLifecycleAction,
  TASK_LIFECYCLE_TAG,
  type TaskLifecycleStatus,
} from '../../services/taskLifecycle'

const { Title } = Typography

type BaseModelRow = Omit<BaseModelRecord, 'status'> & {
  status: TaskLifecycleStatus
  modelSource: 'local' | 'modelscope'
}

const modelTypeOptions = [
  { value: '文本生成', label: '文本生成' },
  { value: '图像理解', label: '图像理解' },
]

const providerOptions = [
  { value: 'Qwen', label: 'Qwen' },
]

const seedRows: BaseModelRow[] = [
  { ...mockBaseModels[0], type: '文本生成', provider: 'Qwen', status: '运行中', modelSource: 'modelscope' },
  { ...mockBaseModels[1], type: '文本生成', provider: 'Qwen', status: '已创建', modelSource: 'modelscope' },
  { ...mockBaseModels[2], type: '图像理解', provider: 'Qwen', status: '失败', modelSource: 'modelscope' },
]

function statusTag(status: TaskLifecycleStatus): React.ReactNode {
  const config = TASK_LIFECYCLE_TAG[status]
  return <Tag color={config.color}>{config.label}</Tag>
}

const BaseModelManagement: React.FC = () => {
  const [form] = Form.useForm()
  const [typeFilter, setTypeFilter] = useState<string>()
  const [providerFilter, setProviderFilter] = useState<string>()
  const [createOpen, setCreateOpen] = useState(false)
  const [detailRecord, setDetailRecord] = useState<BaseModelRow | null>(null)
  const [rows, setRows] = useState(seedRows)
  const [modelSource, setModelSource] = useState<'local' | 'modelscope'>('local')

  const filteredData = useMemo(
    () =>
      rows.filter(item => {
        const matchType = !typeFilter || item.type === typeFilter
        const matchProvider = !providerFilter || item.provider === providerFilter
        return matchType && matchProvider
      }),
    [providerFilter, rows, typeFilter],
  )

  const columns: ColumnsType<BaseModelRow> = [
    { title: '模型Code', dataIndex: 'name', key: 'name', width: 220 },
    { title: '描述', dataIndex: 'description', key: 'description', width: 260, render: value => value || '-' },
    { title: '模型类型', dataIndex: 'type', key: 'type', width: 130, render: value => <Tag color="blue">{value}</Tag> },
    { title: '模型提供商', dataIndex: 'provider', key: 'provider', width: 150 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: value => statusTag(value) },
    {
      title: '支持能力',
      dataIndex: 'capabilities',
      key: 'capabilities',
      width: 180,
      render: value => (
        <Space wrap size={6}>
          {value?.map((item: string) => (
            <Tag key={item}>{item}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 360,
      render: (_, record) => (
        <Space size={0} style={{ whiteSpace: 'nowrap' }}>
          {getPrimaryTaskLifecycleAction(record.status) && canRunTaskLifecycleAction(record.status, 'start') && (
            <Button
              type="link"
              size="small"
              onClick={() =>
                setRows(previous =>
                  previous.map(item =>
                    item.id === record.id
                      ? {
                          ...item,
                          status: getPrimaryTaskLifecycleAction(item.status) === 'start' ? '启动中' : '已创建',
                        }
                      : item,
                  ),
                )
              }
            >
              启动
            </Button>
          )}
          {(record.status === '失败' || record.status === '已终止') ? (
            <Button
              type="link"
              size="small"
              onClick={() =>
                setRows(previous =>
                  previous.map(item =>
                    item.id === record.id ? { ...item, status: '已创建' } : item,
                  ),
                )
              }
            >
              重新提交
            </Button>
          ) : (
            <Button type="link" size="small" disabled={!canRunTaskLifecycleAction(record.status, 'edit')}>编辑</Button>
          )}
          <Button type="link" size="small" onClick={() => setDetailRecord(record)}>查看详情</Button>
          {record.modelSource !== 'local' && <Button type="link" size="small">日志</Button>}
          <Button
            type="link"
            size="small"
            danger
            disabled={!canRunTaskLifecycleAction(record.status, 'delete')}
            onClick={() => setRows(previous => previous.filter(item => item.id !== record.id))}
          >
            删除
          </Button>
          <Button
            type="link"
            size="small"
            disabled={!canRunTaskLifecycleAction(record.status, 'terminate')}
            onClick={() =>
              setRows(previous =>
                previous.map(item => (item.id === record.id ? { ...item, status: '已终止' } : item)),
              )
            }
          >
            终止
          </Button>
        </Space>
      ),
    },
  ]

  const submitCreate = async () => {
    try {
      await form.validateFields()
      const values = form.getFieldsValue()
      setRows(previous => [
        {
          id: `base-${Date.now()}`,
          code: values.code,
          name: values.code,
          description: values.description,
          type: values.type,
          provider: values.provider,
          capabilities: values.capabilities || [],
          status: '已创建',
          modelSource: values.modelSource,
          createdAt: new Date().toISOString(),
        },
        ...previous,
      ])
      setCreateOpen(false)
      form.resetFields()
      setModelSource('local')
    } catch {
      return
    }
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Card style={{ borderRadius: 20, border: '1px solid #e5e7eb' }}>
          <Title level={2}>模型仓库</Title>

          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <Space wrap>
              <Select
                placeholder="请选择模型类型"
                allowClear
                value={typeFilter}
                onChange={value => setTypeFilter(value)}
                style={{ width: 160 }}
                options={modelTypeOptions}
              />
              <Select
                placeholder="请选择模型提供商"
                allowClear
                value={providerFilter}
                onChange={value => setProviderFilter(value)}
                style={{ width: 180 }}
                options={providerOptions}
              />
              <Button>搜索</Button>
              <Button onClick={() => { setTypeFilter(undefined); setProviderFilter(undefined) }}>重置</Button>
            </Space>
            <Space>
              <Button>刷新</Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  form.resetFields()
                  form.setFieldsValue({ modelSource: 'local' })
                  setModelSource('local')
                  setCreateOpen(true)
                }}
              >
                新增模型
              </Button>
            </Space>
          </div>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredData}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 1520 }}
          />
        </Card>
      </div>

      <Modal
        title="新增基础模型"
        open={createOpen}
        width={640}
        onCancel={() => {
          setCreateOpen(false)
          form.resetFields()
          setModelSource('local')
        }}
        footer={
          <Space>
            <Button onClick={() => {
              setCreateOpen(false)
              form.resetFields()
              setModelSource('local')
            }}>取消</Button>
            <Button type="primary" onClick={submitCreate}>确定</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item label="模型来源" name="modelSource" initialValue="local" rules={[{ required: true, message: '请选择模型来源' }]}>
            <Space wrap>
              <Radio.Group
                onChange={event => {
                  const nextSource = event.target.value as 'local' | 'modelscope'
                  setModelSource(nextSource)
                  form.setFieldsValue({ code: undefined, cluster: undefined, scheduled: false })
                }}
              >
                <Radio.Button value="local">本地</Radio.Button>
                <Radio.Button value="modelscope">ModelScope</Radio.Button>
              </Radio.Group>
              <Typography.Link href="https://www.modelscope.cn/models" target="_blank">
                https://www.modelscope.cn/models
              </Typography.Link>
            </Space>
          </Form.Item>
          <Form.Item label="模型类型" name="type" rules={[{ required: true, message: '请选择模型类型' }]}>
            <Select
              placeholder="请选择模型类型"
              options={modelTypeOptions}
            />
          </Form.Item>
          <Form.Item label="模型提供商" name="provider" rules={[{ required: true, message: '请选择模型提供商' }]}>
            <Select
              placeholder="请选择模型提供商"
              options={providerOptions}
            />
          </Form.Item>
          {modelSource === 'local' ? (
            <Form.Item label="模型Code" name="code" rules={[{ required: true, message: '请选择模型Code' }]}>
              <Select
                showSearch
                placeholder="请选择模型Code"
                options={[
                  { value: 'qwen2.5-7b-instruct', label: 'qwen2.5-7b-instruct' },
                  { value: 'qwen2.5-1.5b-instruct', label: 'qwen2.5-1.5b-instruct' },
                  { value: 'qwen2.5-vl-7b-instruct', label: 'qwen2.5-vl-7b-instruct' },
                ]}
              />
            </Form.Item>
          ) : (
            <>
              <Form.Item label="模型Code" name="code" rules={[{ required: true, message: '请输入模型Code' }]}>
                <Input placeholder="请输入模型code" />
              </Form.Item>
              <Form.Item label="集群" name="cluster" rules={[{ required: true, message: '请选择集群' }]}>
                <Select
                  placeholder="请选择集群，用于模型下载"
                  options={[
                    { value: 'v1.12-cluster', label: 'V1.12版本集群' },
                    { value: 'gpu-training-cluster', label: 'GPU训练集群' },
                  ]}
                />
              </Form.Item>
              <Form.Item label="任务定时配置" name="scheduled" valuePropName="checked" initialValue={false}>
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
            </>
          )}
          <Form.Item label="支持能力" name="capabilities" rules={[{ required: true, message: '请选择支持能力' }]}>
            <Checkbox.Group
              options={[
                { value: '训练', label: '训练' },
                { value: '推理', label: '推理' },
              ]}
            />
          </Form.Item>
          <Form.Item label="模型描述" name="description">
            <Input.TextArea rows={3} maxLength={200} showCount placeholder="请输入模型描述" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="模型仓库详情"
        open={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
        footer={<Button onClick={() => setDetailRecord(null)}>关闭</Button>}
      >
        {detailRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="模型Code" span={2}>{detailRecord.code}</Descriptions.Item>
            <Descriptions.Item label="模型名称">{detailRecord.name}</Descriptions.Item>
            <Descriptions.Item label="模型类型">{detailRecord.type || '-'}</Descriptions.Item>
            <Descriptions.Item label="模型提供商">{detailRecord.provider || '-'}</Descriptions.Item>
            <Descriptions.Item label="状态">{statusTag(detailRecord.status)}</Descriptions.Item>
            <Descriptions.Item label="模型来源">{detailRecord.modelSource === 'local' ? '本地' : 'ModelScope'}</Descriptions.Item>
            <Descriptions.Item label="支持能力" span={2}>{detailRecord.capabilities?.join('、') || '-'}</Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>{detailRecord.createdAt}</Descriptions.Item>
            <Descriptions.Item label="描述" span={2}>{detailRecord.description || '-'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default BaseModelManagement
