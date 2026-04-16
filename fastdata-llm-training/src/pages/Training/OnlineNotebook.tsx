import React, { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Divider,
  Form,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  Empty,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ExperimentOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  CopyOutlined,
  EyeOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  canRunTaskLifecycleAction,
  TASK_LIFECYCLE_TAG,
  type TaskLifecycleStatus,
} from '../../services/taskLifecycle'

const { Text, Title, Paragraph } = Typography

type NotebookStatus = TaskLifecycleStatus

type MyNotebookRecord = {
  id: string
  name: string
  image: string
  sshSupported: boolean
  status: NotebookStatus
  spec: string
  runtimeLimit: string
  createdAt: string
}

type SquareNotebookRecord = {
  id: string
  name: string
  description: string
  creator: string
  createdAt: string
}

const myNotebooks: MyNotebookRecord[] = [
  {
    id: 'nb-1',
    name: '3rwrwr',
    image: 'lab-cn-guangzhou.cr.volces.com/fs/jupyter/deepexi-notebook:torch_2.5-cann_8.0.rc1-py311-ubuntu22.04',
    sshSupported: true,
    status: '已创建',
    spec: 'CPU Only\n0.5~16 Cores',
    runtimeLimit: '-',
    createdAt: '2026/4/14 15:21:19',
  },
  {
    id: 'nb-2',
    name: '新建 Notebook-选带标签的镜像',
    image: 'jupyter/deepexi-notebook:datascience-cpu-python',
    sshSupported: true,
    status: '已终止',
    spec: 'CPU Only\n0.5~16 Cores',
    runtimeLimit: '-',
    createdAt: '2026/3/25 15:19:10',
  },
  {
    id: 'nb-3',
    name: '新建 Notebook001',
    image: 'lab-cn-guangzhou.cr.volces.com/fs/jupyter/deepexi-notebook:datascience-cpu-python312-ubuntu24.04',
    sshSupported: true,
    status: '已终止',
    spec: 'CPU Only\n1~16 Cores',
    runtimeLimit: '-',
    createdAt: '2026/3/19 15:39:08',
  },
]

const squareNotebooks: SquareNotebookRecord[] = [
  {
    id: 'sq-1',
    name: '新建 Notebook-无数据集和模型-案例',
    description: '',
    creator: '平台',
    createdAt: '2026/03/23 09:20:00',
  },
  {
    id: 'sq-2',
    name: '新建 Notebook-1-lab5发布的案例',
    description: '# 3.23金价暴跌事件 2026年3月23日上午，国内黄金价迅速暴跌破1000元...',
    creator: 'lab5',
    createdAt: '2026/03/23 11:08:00',
  },
  {
    id: 'sq-3',
    name: '新建 Notebook-哈哈案例',
    description: '新建 Notebook-哈哈案例说明',
    creator: '平台',
    createdAt: '2026/03/18 15:00:00',
  },
  {
    id: 'sq-4',
    name: '新建 Notebook121 案例',
    description: '测试',
    creator: '平台',
    createdAt: '2026/03/16 10:11:00',
  },
]

function statusTag(status: NotebookStatus): React.ReactNode {
  const config = TASK_LIFECYCLE_TAG[status]
  return <Tag color={config.color}>{config.label}</Tag>
}

const OnlineNotebook: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [searchValue, setSearchValue] = useState('')
  const [activeTab, setActiveTab] = useState<'mine' | 'square'>(location.pathname.includes('/tabs/mine') ? 'mine' : 'square')
  const [detailRecord, setDetailRecord] = useState<MyNotebookRecord | SquareNotebookRecord | null>(null)
  const isCreateRoute = location.pathname === '/finetune/notebooks/create'
  const [rows, setRows] = useState(myNotebooks)

  const notebookList = useMemo(
    () => rows.filter(item => item.name.toLowerCase().includes(searchValue.toLowerCase())),
    [rows, searchValue],
  )

  const squareList = useMemo(
    () =>
      squareNotebooks.filter(item => item.name.toLowerCase().includes(searchValue.toLowerCase())),
    [searchValue],
  )

  const notebookColumns: ColumnsType<MyNotebookRecord> = [
    { title: 'Notebook名称', dataIndex: 'name', key: 'name', width: 210 },
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
      width: 110,
      render: value => statusTag(value),
    },
    {
      title: '资源规格',
      dataIndex: 'spec',
      key: 'spec',
      width: 160,
      render: value => <div style={{ whiteSpace: 'pre-line' }}>{value}</div>,
    },
    { title: '最大运行时长', dataIndex: 'runtimeLimit', key: 'runtimeLimit', width: 120 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170 },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_, record) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            disabled={!canRunTaskLifecycleAction(record.status, 'start') && !canRunTaskLifecycleAction(record.status, 'resubmit')}
            onClick={() =>
              setRows(previous =>
                previous.map(item =>
                  item.id === record.id
                    ? { ...item, status: canRunTaskLifecycleAction(item.status, 'start') ? '启动中' : '已创建' }
                    : item,
                ),
              )
            }
          >
            {canRunTaskLifecycleAction(record.status, 'start') ? '启动' : canRunTaskLifecycleAction(record.status, 'resubmit') ? '重新提交' : '启动'}
          </Button>
          <Button type="link" size="small" onClick={() => setDetailRecord(record)}>查看详情</Button>
          <Button type="link" size="small">发布为案例</Button>
          <Button type="link" size="small">...</Button>
        </Space>
      ),
    },
  ]

  const handleTabChange = (key: string) => {
    const next = key as 'mine' | 'square'
    setActiveTab(next)
    setSearchValue('')
  }

  const openCreate = () => {
    form.resetFields()
    navigate('/finetune/notebooks/create')
  }

  const closeCreate = () => {
    navigate('/finetune/notebooks')
  }

  const submitCreate = async () => {
    try {
      await form.validateFields()
      closeCreate()
    } catch {
      return
    }
  }

  if (isCreateRoute) {
    return (
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <div style={{ marginBottom: 20 }}>
          <Text type="secondary">在线Notebook / 创建 Notebook</Text>
        </div>
        <Card style={{ borderRadius: 18, border: '1px solid #e5e7eb' }}>
          <Title level={3} style={{ marginBottom: 18 }}>创建 Notebook</Title>

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
            <Form.Item label="大模型">
              <Input value="数据集" disabled style={{ display: 'none' }} />
            </Form.Item>
            <Space style={{ width: '100%', marginBottom: 16 }}>
              <Button>选择</Button>
              <Button>模型</Button>
            </Space>

            <Divider>资源配置</Divider>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>配置CPU、内存和显卡资源。</Text>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
              <Form.Item label="CPU 请求" name="cpuRequest"><Input suffix="Core" /></Form.Item>
              <Form.Item label="CPU 限制" name="cpuLimit"><Input suffix="Core" /></Form.Item>
              <Form.Item label="内存请求" name="memoryRequest"><Input suffix="GB" /></Form.Item>
              <Form.Item label="内存限制" name="memoryLimit"><Input suffix="GB" /></Form.Item>
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

            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <Button type="primary" onClick={submitCreate}>创建</Button>
              <Button onClick={closeCreate}>取消</Button>
            </div>
          </Form>
        </Card>
      </div>
    )
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Card style={{ borderRadius: 20, border: '1px solid #e5e7eb' }}>
          <Title level={2} style={{ marginBottom: 18 }}>在线Notebook</Title>

          <Tabs
            activeKey={activeTab}
            onChange={handleTabChange}
            items={[
              { key: 'square', label: 'Notebook广场' },
              { key: 'mine', label: '我的Notebook' },
            ]}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
            <Space>
              <Input
                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                placeholder="搜索名称"
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                style={{ width: 230 }}
              />
              <Button icon={<ReloadOutlined />}>刷新</Button>
              {activeTab === 'mine' && <Button onClick={() => message.success('自定义镜像入口待补充')}>自定义镜像</Button>}
            </Space>

            {activeTab === 'mine' && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                创建Notebook
              </Button>
            )}
          </div>

          {activeTab === 'mine' ? (
            <Table
              rowKey="id"
              columns={notebookColumns}
              dataSource={notebookList}
              pagination={{ pageSize: 10, showTotal: total => `共 ${total} 条数据` }}
            />
          ) : (
            <>
              {squareList.length ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 18 }}>
                  {squareList.map(item => (
                    <Card key={item.id} style={{ borderRadius: 18, minHeight: 212 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <Title level={4} style={{ margin: 0, fontSize: 18 }}>{item.name}</Title>
                        <Button type="text" danger icon={<DeleteOutlined />} />
                      </div>
                      <Paragraph type="secondary" style={{ minHeight: 84 }}>{item.description || '暂无说明'}</Paragraph>
                      <Space>
                        <Button icon={<EyeOutlined />} onClick={() => setDetailRecord(item)}>查看详情</Button>
                        <Button type="primary" icon={<CopyOutlined />}>复制案例</Button>
                      </Space>
                    </Card>
                  ))}
                </div>
              ) : (
                <Empty description="暂无案例" />
              )}
            </>
          )}
        </Card>
      </div>

      <Modal
        title={detailRecord?.name ?? '详情'}
        open={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
        footer={
          <Space>
            <Button onClick={() => setDetailRecord(null)}>关闭</Button>
            {'status' in (detailRecord ?? {}) ? (
              <Button type="primary">启动</Button>
            ) : (
              <Button type="primary">复制案例</Button>
            )}
          </Space>
        }
      >
        {detailRecord && 'status' in detailRecord ? (
          <Table
            rowKey="key"
            pagination={false}
            columns={[
              { title: '字段', dataIndex: 'label', key: 'label', width: 120 },
              { title: '内容', dataIndex: 'value', key: 'value' },
            ]}
            dataSource={[
              { key: 'name', label: '名称', value: detailRecord.name },
              { key: 'image', label: '镜像', value: detailRecord.image },
              { key: 'ssh', label: 'SSH配置', value: detailRecord.sshSupported ? '已支持' : '未支持' },
              { key: 'status', label: '状态', value: detailRecord.status },
              { key: 'spec', label: '资源规格', value: detailRecord.spec },
              { key: 'time', label: '创建时间', value: detailRecord.createdAt },
            ]}
          />
        ) : detailRecord ? (
          <Table
            rowKey="key"
            pagination={false}
            columns={[
              { title: '字段', dataIndex: 'label', key: 'label', width: 120 },
              { title: '内容', dataIndex: 'value', key: 'value' },
            ]}
            dataSource={[
              { key: 'name', label: '名称', value: detailRecord.name },
              { key: 'desc', label: '描述', value: detailRecord.description || '暂无说明' },
              { key: 'creator', label: '创建人', value: detailRecord.creator },
              { key: 'time', label: '创建时间', value: detailRecord.createdAt },
            ]}
          />
        ) : null}
      </Modal>
    </>
  )
}

export default OnlineNotebook
