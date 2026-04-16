import React, { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Divider,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CloudServerOutlined, PlusOutlined } from '@ant-design/icons'
import {
  canRunTaskLifecycleAction,
  getPrimaryTaskLifecycleAction,
  TASK_LIFECYCLE_TAG,
  type TaskLifecycleStatus,
} from '../../services/taskLifecycle'

const { Title, Text } = Typography

type MLDeploymentRecord = {
  id: string
  name: string
  modelName: string
  network: string
  modelSource: string
  instanceCount: string
  status: TaskLifecycleStatus
  creator: string
  createdAt: string
}

const deployments: MLDeploymentRecord[] = [
  {
    id: '1',
    name: 'hzj_单图多标签',
    modelName: 'hzj_图片分类多标签',
    network: 'resnet34',
    modelSource: '机器模型',
    instanceCount: '0/1',
    status: '已终止',
    creator: 'lab1',
    createdAt: '2026/04/15 10:09:30',
  },
  {
    id: '2',
    name: 'basion-classification-single',
    modelName: 'basion-图像分类-单标签',
    network: '-',
    modelSource: '机器模型',
    instanceCount: '0/1',
    status: '已终止',
    creator: 'lab1',
    createdAt: '2026/04/13 15:24:20',
  },
]

function statusTag(status: MLDeploymentRecord['status']): React.ReactNode {
  const config = TASK_LIFECYCLE_TAG[status]
  return <Tag color={config.color}>{config.label}</Tag>
}

const MLModelDeployment: React.FC = () => {
  const [form] = Form.useForm()
  const [statusFilter, setStatusFilter] = useState<string>()
  const [createOpen, setCreateOpen] = useState(false)
  const [rows, setRows] = useState(deployments)

  const filteredRows = useMemo(
    () => rows.filter(item => !statusFilter || item.status === statusFilter),
    [rows, statusFilter],
  )

  const columns: ColumnsType<MLDeploymentRecord> = [
    { title: '服务名称', dataIndex: 'name', key: 'name' },
    { title: '模型名称', dataIndex: 'modelName', key: 'modelName' },
    { title: '网络架构', dataIndex: 'network', key: 'network' },
    { title: '模型来源', dataIndex: 'modelSource', key: 'modelSource' },
    { title: '实例数', dataIndex: 'instanceCount', key: 'instanceCount', width: 90 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: value => statusTag(value) },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 100 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170 },
    {
      title: '操作',
      key: 'action',
      width: 220,
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
          <Button
            type="link"
            size="small"
            disabled={!canRunTaskLifecycleAction(record.status, 'edit')}
          >
            编辑
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
          <Button
            type="link"
            size="small"
            danger
            disabled={!canRunTaskLifecycleAction(record.status, 'delete')}
            onClick={() => setRows(previous => previous.filter(item => item.id !== record.id))}
          >
            删除
          </Button>
          <Button type="link" size="small">访问信息</Button>
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
          <Title level={2}>机器模型部署</Title>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <Space>
              <Select
                placeholder="状态"
                allowClear
                value={statusFilter}
                onChange={value => setStatusFilter(value)}
                style={{ width: 140 }}
                options={[
                  { value: '已终止', label: '已终止' },
                  { value: '运行中', label: '运行中' },
                  { value: '已创建', label: '已创建' },
                  { value: '启动中', label: '启动中' },
                ]}
              />
              <Button>搜索</Button>
              <Button onClick={() => setStatusFilter(undefined)}>重置</Button>
            </Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              创建部署
            </Button>
          </div>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredRows}
            pagination={{ pageSize: 10, showTotal: total => `共 ${total} 条记录` }}
          />
        </Card>
      </div>

      <Modal
        title="创建部署"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        width={680}
        footer={
          <Space>
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button type="primary" onClick={submitCreate}>部署</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Divider>基本信息</Divider>
          <Form.Item label="服务名称" name="name" rules={[{ required: true, message: '请输入服务名称' }]}>
            <Input placeholder="请输入服务名称" />
          </Form.Item>
          <Form.Item label="选择模型" name="model" rules={[{ required: true, message: '请选择模型' }]}>
            <Select placeholder="请选择模型" />
          </Form.Item>

          <Divider>资源配置</Divider>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item label="CPU请求" name="cpuRequest"><InputNumber style={{ width: '100%' }} addonAfter="Core" /></Form.Item>
            <Form.Item label="内存请求" name="memoryRequest"><InputNumber style={{ width: '100%' }} addonAfter="GB" /></Form.Item>
            <Form.Item label="显卡类型" name="gpuType"><Select placeholder="请选择显卡类型" /></Form.Item>
            <Form.Item label="实例数" name="instanceCount"><InputNumber style={{ width: '100%' }} min={1} max={10} /></Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  )
}

export default MLModelDeployment
