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
}

const seedRows: BaseModelRow[] = [
  { ...mockBaseModels[0], status: '运行中' },
  { ...mockBaseModels[1], status: '已创建' },
  { ...mockBaseModels[2], status: '失败' },
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
      width: 300,
      render: (_, record) => (
        <Space size={0}>
          {getPrimaryTaskLifecycleAction(record.status) && (
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
              {getPrimaryTaskLifecycleAction(record.status) === 'start' ? '启动' : '重新提交'}
            </Button>
          )}
          <Button type="link" size="small" disabled={!canRunTaskLifecycleAction(record.status, 'edit')}>编辑</Button>
          <Button type="link" size="small" onClick={() => setDetailRecord(record)}>查看详情</Button>
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
      setCreateOpen(false)
    } catch {
      return
    }
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Card style={{ borderRadius: 20, border: '1px solid #e5e7eb' }}>
          <Title level={2}>基础模型管理</Title>

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
                  { value: '阿里云', label: '阿里云' },
                  { value: 'OpenAI', label: 'OpenAI' },
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
        onCancel={() => setCreateOpen(false)}
        footer={
          <Space>
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button type="primary" onClick={submitCreate}>创建</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
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
                { value: '阿里云', label: '阿里云' },
                { value: 'OpenAI', label: 'OpenAI' },
                { value: 'Anthropic', label: 'Anthropic' },
              ]}
            />
          </Form.Item>
          <Form.Item label="支持能力" name="capabilities" rules={[{ required: true, message: '请选择支持能力' }]}>
            <Select
              mode="multiple"
              options={[
                { value: '文本生成', label: '文本生成' },
                { value: '推理', label: '推理' },
                { value: '训练', label: '训练' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="基础模型详情"
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
