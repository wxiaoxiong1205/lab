import React, { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { RobotOutlined, PlusOutlined } from '@ant-design/icons'
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

const seedRows: BaseModelRow[] = [
  { ...mockBaseModels[0], status: '运行中', modelSource: 'modelscope' },
  { ...mockBaseModels[1], status: '已创建', modelSource: 'modelscope' },
  { ...mockBaseModels[2], status: '失败', modelSource: 'modelscope' },
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
    { title: '模型Code', dataIndex: 'name', key: 'name' },
    { title: '描述', dataIndex: 'description', key: 'description', render: value => value || '-' },
    { title: '模型类型', dataIndex: 'type', key: 'type', render: value => <Tag color="blue">{value}</Tag> },
    { title: '模型提供商', dataIndex: 'provider', key: 'provider' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: value => statusTag(value) },
    {
      title: '支持能力',
      dataIndex: 'capabilities',
      key: 'capabilities',
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
        <Space size={0}>
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
          capabilities: values.capabilities,
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

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <Space>
              <Select
                placeholder="请选择模型类型"
                allowClear
                value={typeFilter}
                onChange={value => setTypeFilter(value)}
                style={{ width: 160 }}
                options={[
                  { value: 'LLM', label: 'LLM' },
                  { value: 'VLM', label: 'VLM' },
                ]}
              />
              <Select
                placeholder="请选择模型提供商"
                allowClear
                value={providerFilter}
                onChange={value => setProviderFilter(value)}
                style={{ width: 180 }}
                options={[
                  { value: 'Qwen', label: 'Qwen' },
                ]}
              />
              <Button>搜索</Button>
              <Button onClick={() => { setTypeFilter(undefined); setProviderFilter(undefined) }}>重置</Button>
            </Space>
            <Space>
              <Button>刷新</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                新增模型
              </Button>
            </Space>
          </div>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredData}
            pagination={{ pageSize: 10 }}
          />
        </Card>
      </div>

      <Modal
        title="新增基础模型"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false)
          setModelSource('local')
        }}
        footer={
          <Space>
            <Button onClick={() => {
              setCreateOpen(false)
              setModelSource('local')
            }}>取消</Button>
            <Button type="primary" onClick={submitCreate}>创建</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item label="模型来源" name="modelSource" initialValue="local" rules={[{ required: true, message: '请选择模型来源' }]}>
              <Select
              onChange={value => setModelSource(value)}
              options={[
                { value: 'local', label: '本地' },
                { value: 'modelscope', label: 'ModelScope' },
              ]}
            />
          </Form.Item>
          <Form.Item label="模型Code" name="code" rules={[{ required: true, message: '请输入模型Code' }]}>
            <Input placeholder="如：qwen2.5-7b-instruct" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="请输入描述" />
          </Form.Item>
          <Form.Item label="模型类型" name="type" rules={[{ required: true, message: '请选择模型类型' }]}>
            <Select
              options={[
                { value: 'LLM', label: 'LLM' },
                { value: 'VLM', label: 'VLM' },
              ]}
            />
          </Form.Item>
          <Form.Item label="模型提供商" name="provider" rules={[{ required: true, message: '请选择模型提供商' }]}>
            <Select
              options={[
                { value: 'Qwen', label: 'Qwen' },
              ]}
            />
          </Form.Item>
          {modelSource === 'modelscope' && (
            <Form.Item label="ModelScope链接" name="modelScopeUrl">
              <Input placeholder="https://www.modelscope.cn/models" />
            </Form.Item>
          )}
          <Form.Item label="支持能力" name="capabilities" rules={[{ required: true, message: '请选择支持能力' }]}>
            <Select
              mode="multiple"
              options={[
                { value: '训练', label: '训练' },
                { value: '推理', label: '推理' },
              ]}
            />
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
