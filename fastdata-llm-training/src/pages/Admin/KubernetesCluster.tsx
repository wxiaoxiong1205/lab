import React, { useState } from 'react'
import { Button, Card, Form, Input, Modal, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { InfoCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { mockKubernetesClusters } from '../../data/mockDataAll'
import type { KubernetesCluster } from '../../types/shared'

const { Title, Text } = Typography
const { TextArea } = Input

function renderStatus(status: string): React.ReactNode {
  if (status === 'connected') {
    return <Tag color="success">连接正常</Tag>
  }
  if (status === 'disconnected') {
    return <Tag color="error">连接失败</Tag>
  }
  return <Tag>未测试</Tag>
}

function renderMountStatus(status: string): React.ReactNode {
  if (status === 'mounted') {
    return <Tag color="success">已挂载</Tag>
  }
  if (status === 'unmounted') {
    return <Tag color="default">未挂载</Tag>
  }
  return <Tag>未知</Tag>
}

const KubernetesClusterPage: React.FC = () => {
  const [form] = Form.useForm()
  const [createOpen, setCreateOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<KubernetesCluster | null>(null)
  const [editingKubeconfig, setEditingKubeconfig] = useState('')
  const [rows, setRows] = useState<KubernetesCluster[]>(mockKubernetesClusters)

  const openCreate = () => {
    setEditingRecord(null)
    setEditingKubeconfig('')
    form.resetFields()
    setCreateOpen(true)
  }

  const openEdit = (record: KubernetesCluster) => {
    setEditingRecord(record)
    setEditingKubeconfig(record.kubeconfig ?? '')
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      apiServer: record.apiServer,
      kubeconfig: record.kubeconfig,
    })
    setCreateOpen(true)
  }

  const closeCreate = () => {
    setCreateOpen(false)
    setEditingRecord(null)
    setEditingKubeconfig('')
    form.resetFields()
  }

  const extractApiServer = (kubeconfig?: string) => {
    const matched = kubeconfig?.match(/server:\s*(\S+)/)
    return matched?.[1] ?? '待解析'
  }

  const formatCreatedAt = () => {
    const now = new Date()
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  }

  const columns: ColumnsType<KubernetesCluster> = [
    { title: '集群名称', dataIndex: 'name', key: 'name', width: 160 },
    {
      title: 'API Server',
      dataIndex: 'apiServer',
      key: 'apiServer',
      width: 260,
      render: value => <Text code style={{ fontSize: 11, whiteSpace: 'normal' }}>{value}</Text>,
    },
    {
      title: '标签',
      dataIndex: 'labels',
      key: 'labels',
      width: 220,
      render: value => (
        <Space wrap size={6}>
          {value?.map((item: string) => (
            <Tag key={item}>{item}</Tag>
          ))}
        </Space>
      ),
    },
    { title: '节点数', dataIndex: 'nodeCount', key: 'nodeCount', width: 80 },
    {
      title: '连接状态',
      dataIndex: 'connectionStatus',
      key: 'connectionStatus',
      width: 120,
      render: value => renderStatus(value),
    },
    {
      title: '挂载状态',
      dataIndex: 'mountStatus',
      key: 'mountStatus',
      width: 110,
      render: value => renderMountStatus(value),
    },
    {
      title: '存储配置',
      dataIndex: 'storageConfig',
      key: 'storageConfig',
      width: 140,
      render: value => (value ? <Tag color="success">已配置</Tag> : <Tag>未配置</Tag>),
    },
    {
      title: '镜像仓库',
      dataIndex: 'imageRegistry',
      key: 'imageRegistry',
      width: 150,
      render: value => (value ? <Tag color="success">已配置</Tag> : <Tag>未配置</Tag>),
    },
    {
      title: '操作',
      key: 'action',
      width: 380,
      render: (_, record) => (
        <Space size={0} style={{ whiteSpace: 'nowrap' }}>
          <Button type="link" size="small">测试连接</Button>
          <Button type="link" size="small" onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Button type="link" size="small">绑定存储配置</Button>
          <Button type="link" size="small">绑定仓库配置</Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={() => {
              setRows(previous => previous.filter(item => item.id !== record.id))
              message.success(`已删除集群：${record.name}`)
            }}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  const submitCreate = async () => {
    try {
      const values = await form.validateFields()
      if (editingRecord) {
        setRows(previous =>
          previous.map(item =>
            item.id === editingRecord.id
              ? {
                  ...item,
                  name: values.name,
                  description: values.description,
                  apiServer: values.apiServer?.trim() || extractApiServer(values.kubeconfig),
                  kubeconfig: values.kubeconfig,
                  connectionStatus: 'untested',
                }
              : item,
          ),
        )
        message.success('集群已更新，连接状态已重置为未测试')
      } else {
        const kubeconfig = values.kubeconfig ?? ''
        setRows(previous => [
          {
            id: `cluster-${Date.now()}`,
            name: values.name,
            description: values.description,
            apiServer: extractApiServer(kubeconfig),
            kubeconfig,
            labels: [],
            nodeCount: 0,
            connectionStatus: 'untested',
            mountStatus: 'unmounted',
            createdAt: formatCreatedAt(),
          },
          ...previous,
        ])
        message.success('集群已导入，连接状态为未测试')
      }
      closeCreate()
    } catch {
      return
    }
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Card style={{ borderRadius: 20, border: '1px solid #e5e7eb' }}>
          <Title level={2}>Kubernetes集群管理</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
            管理和监控 Kubernetes 集群，支持 kubeconfig 导入和多集群管理
          </Text>

          <Space style={{ marginBottom: 16 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              导入集群
            </Button>
            <Button>刷新</Button>
          </Space>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={rows}
            pagination={{ pageSize: 10, showTotal: total => `共 ${total} 个集群` }}
            scroll={{ x: 1620 }}
          />
        </Card>
      </div>

      <Modal
        title={editingRecord ? '编辑集群信息' : '导入Kubernetes集群'}
        open={createOpen}
        onCancel={closeCreate}
        width={editingRecord ? 680 : 860}
        footer={
          <Space>
            <Button onClick={closeCreate}>取消</Button>
            <Button type="primary" onClick={submitCreate}>{editingRecord ? '更新' : '导入'}</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item label="集群名称" name="name" rules={[{ required: true, message: '请输入集群名称' }]}>
            <Input placeholder="请输入集群名称" />
          </Form.Item>
          <Form.Item label="集群描述" name="description">
            <Input placeholder="请输入集群描述" />
          </Form.Item>
          {editingRecord ? (
            <>
              <Form.Item label="API Server" name="apiServer" rules={[{ required: true, message: '请输入 API Server 地址' }]}>
                <Input placeholder="请输入 API Server 地址，例如：https://k8s.example.com:6443" />
              </Form.Item>
              <Form.Item label="集群配置 (YAML格式)" name="kubeconfig">
                <TextArea
                  rows={14}
                  value={editingKubeconfig}
                  placeholder="请输入集群配置信息，支持YAML格式..."
                  onChange={event => {
                    setEditingKubeconfig(event.target.value)
                    form.setFieldValue('kubeconfig', event.target.value)
                  }}
                />
              </Form.Item>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <Text>导入方式</Text>
              </div>
              <div style={{ borderBottom: '1px solid #f0f0f0', marginBottom: 18 }}>
                <Button type="link" style={{ paddingLeft: 0, borderBottom: '2px solid #1677ff', borderRadius: 0 }}>
                  文本输入
                </Button>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 14,
                  padding: '20px 24px',
                  border: '1px solid #91caff',
                  borderRadius: 8,
                  background: '#e6f4ff',
                  marginBottom: 16,
                }}
              >
                <InfoCircleOutlined style={{ color: '#1677ff', fontSize: 24, marginTop: 3 }} />
                <div>
                  <Text style={{ display: 'block', marginBottom: 12 }}>请粘贴您的kubeconfig文件内容</Text>
                  <Text type="secondary">支持标准的YAML格式kubeconfig文件</Text>
                </div>
              </div>
              <Form.Item name="kubeconfig" rules={[{ required: true, message: '请粘贴kubeconfig文件内容' }]}>
                <TextArea rows={14} placeholder="请粘贴kubeconfig文件内容..." />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

    </>
  )
}

export default KubernetesClusterPage
