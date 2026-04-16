import React, { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Divider,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ExperimentOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

type MLNotebookStatus = '已创建' | '已终止' | '运行中'

type MLNotebookRecord = {
  id: string
  name: string
  description: string
  image: string
  sshSupported: boolean
  status: MLNotebookStatus
  spec: string
  runtimeLimit: string
  createdAt: string
}

type MLSquareRecord = {
  id: string
  name: string
  description: string
}

const myNotebooks: MLNotebookRecord[] = [
  {
    id: 'ml-nb-1',
    name: 'hzj_单图多标签-ml-dev',
    description: 'ML 部署在线开发：hzj_单图多标签',
    image: 'lab-cn-guangzhou.cr.volces.com/fs/jupyter/ml/deepexi-notebook:pytorch_2.5-cuda_12.1-py311-ubuntu22.04',
    sshSupported: true,
    status: '已终止',
    spec: '1x GPU\nCPU: 0.5~16',
    runtimeLimit: '-',
    createdAt: '2026/4/15 09:58:34',
  },
  {
    id: 'ml-nb-2',
    name: 'basion-ml-dev',
    description: 'ML 部署在线开发：basion',
    image: 'lab-cn-guangzhou.cr.volces.com/fs/jupyter/ml/deepexi-notebook:pytorch_2.5-cuda_12.1-py311-ubuntu22.04',
    sshSupported: true,
    status: '已终止',
    spec: '1x GPU\nCPU: 0.5~16',
    runtimeLimit: '-',
    createdAt: '2026/4/13 15:14:48',
  },
]

const squareNotebooks: MLSquareRecord[] = [
  {
    id: 'ml-square-1',
    name: '图像分类开发案例',
    description: '用于机器学习图像分类任务的在线开发模板。',
  },
  {
    id: 'ml-square-2',
    name: '实体识别开发案例',
    description: '用于机器学习文本实体识别任务的在线开发模板。',
  },
]

function statusTag(status: MLNotebookStatus): React.ReactNode {
  if (status === '运行中') return <Tag color="success">运行中</Tag>
  if (status === '已终止') return <Tag color="default">已终止</Tag>
  return <Tag color="processing">已创建</Tag>
}

const MLNotebook: React.FC = () => {
  const [form] = Form.useForm()
  const [searchValue, setSearchValue] = useState('')
  const [activeTab, setActiveTab] = useState<'mine' | 'square'>('mine')
  const [createOpen, setCreateOpen] = useState(false)

  const filteredMine = useMemo(
    () => myNotebooks.filter(item => item.name.toLowerCase().includes(searchValue.toLowerCase())),
    [searchValue],
  )
  const filteredSquare = useMemo(
    () => squareNotebooks.filter(item => item.name.toLowerCase().includes(searchValue.toLowerCase())),
    [searchValue],
  )

  const columns: ColumnsType<MLNotebookRecord> = [
    { title: 'Notebook名称', dataIndex: 'name', key: 'name' },
    { title: '镜像', dataIndex: 'image', key: 'image', ellipsis: true },
    {
      title: 'SSH配置',
      dataIndex: 'sshSupported',
      key: 'sshSupported',
      width: 100,
      render: value => (value ? <Text style={{ color: '#059669' }}>已支持</Text> : <Text type="secondary">未支持</Text>),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: value => statusTag(value),
    },
    {
      title: '资源规格',
      dataIndex: 'spec',
      key: 'spec',
      width: 140,
      render: value => <div style={{ whiteSpace: 'pre-line' }}>{value}</div>,
    },
    { title: '最大运行时长', dataIndex: 'runtimeLimit', key: 'runtimeLimit', width: 120 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170 },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: () => (
        <Space size={0}>
          <Button type="link" size="small">启动</Button>
          <Button type="link" size="small">查看详情</Button>
          <Button type="link" size="small">发布为案例</Button>
          <Button type="link" size="small">...</Button>
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
          <Title level={2}>在线Notebook</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
            Notebook 列表
          </Text>

          <Tabs
            activeKey={activeTab}
            onChange={key => setActiveTab(key as 'mine' | 'square')}
            items={[
              { key: 'mine', label: '我的Notebook' },
              { key: 'square', label: 'Notebook广场' },
            ]}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <Space>
              <Select
                placeholder="状态"
                style={{ width: 120 }}
                options={[
                  { value: 'all', label: '状态' },
                ]}
              />
              <Input
                placeholder="搜索"
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                style={{ width: 220 }}
              />
              <Button>搜索</Button>
              <Button onClick={() => setSearchValue('')}>重置</Button>
              <Button onClick={() => setCreateOpen(true)}>创建Notebook</Button>
              <Button>自定义镜像</Button>
              <Button icon={<ReloadOutlined />}>刷新</Button>
            </Space>
          </div>

          {activeTab === 'mine' ? (
            <Table
              rowKey="id"
              columns={columns}
              dataSource={filteredMine}
              pagination={{ pageSize: 10, showTotal: total => `共 ${total} 条数据` }}
            />
          ) : (
            <Table
              rowKey="id"
              columns={[
                { title: '案例名称', dataIndex: 'name', key: 'name' },
                { title: '描述', dataIndex: 'description', key: 'description' },
                {
                  title: '操作',
                  key: 'action',
                  width: 140,
                  render: () => (
                    <Space size={0}>
                      <Button type="link" size="small">查看详情</Button>
                      <Button type="link" size="small">复制案例</Button>
                    </Space>
                  ),
                },
              ]}
              dataSource={filteredSquare}
              pagination={{ pageSize: 10, showTotal: total => `共 ${total} 条数据` }}
            />
          )}
        </Card>
      </div>

      <Modal
        title="创建 Notebook"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        width={680}
        footer={
          <Space>
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button type="primary" onClick={submitCreate}>创建</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Divider>基本信息</Divider>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>设置Notebook基本信息。</Text>

          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input maxLength={50} showCount />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} maxLength={300} showCount />
          </Form.Item>

          <Divider>AI服务选择</Divider>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>选择你想使用的模型服务，可在Notebook任务中使用</Text>
          <Form.Item label="在线推理服务" name="service">
            <Select placeholder="请选择在线推理服务（可选）" />
          </Form.Item>

          <Divider>数据/模型选择</Divider>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>选择任务中需要的数据集或模型。</Text>
          <Space style={{ marginBottom: 16 }}>
            <Button>选择</Button>
            <Button>模型</Button>
          </Space>

          <Divider>资源配置</Divider>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item label="CPU 请求" name="cpuRequest"><Input /></Form.Item>
            <Form.Item label="CPU 限制" name="cpuLimit"><Input /></Form.Item>
            <Form.Item label="内存请求" name="memoryRequest"><Input /></Form.Item>
            <Form.Item label="内存限制" name="memoryLimit"><Input /></Form.Item>
          </div>

          <Form.Item label="显卡配置" name="gpuConfig">
            <Select placeholder="请选择显卡配置" />
          </Form.Item>

          <Form.Item label="运行时长配置" name="runtimeLimit">
            <Select placeholder="请选择最大运行时长" />
          </Form.Item>

          <Divider>选择Notebook镜像</Divider>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>选择适合您需求的预配置环境</Text>
          <Space>
            <Form.Item label="镜像" name="image" style={{ minWidth: 320 }}>
              <Select placeholder="请选择镜像" />
            </Form.Item>
            <Button>添加镜像</Button>
          </Space>
        </Form>
      </Modal>
    </>
  )
}

export default MLNotebook
