import React, { useState } from 'react'
import {
  Alert,
  Button,
  Card,
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
import { CloudOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons'
import { mockKubernetesClusters } from '../../data/mockDataAll'
import type { KubernetesCluster } from '../../types/shared'

const { Title, Text } = Typography

const labelPresets = [
  { value: 'dev', label: '开发环境' },
  { value: 'test', label: '测试环境' },
  { value: 'prod', label: '生产环境' },
  { value: 'gpu', label: 'GPU集群' },
  { value: 'high-memory', label: '高内存' },
]

function renderStatus(status: string): React.ReactNode {
  if (status === 'connected') {
    return <Tag color="success">连接正常</Tag>
  }
  if (status === 'disconnected') {
    return <Tag color="error">连接失败</Tag>
  }
  return <Tag>未知</Tag>
}

const KubernetesClusterPage: React.FC = () => {
  const [form] = Form.useForm()
  const [createOpen, setCreateOpen] = useState(false)
  const [detailRecord, setDetailRecord] = useState<KubernetesCluster | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success'>('idle')

  const columns: ColumnsType<KubernetesCluster> = [
    { title: '集群名称', dataIndex: 'name', key: 'name' },
    {
      title: 'API Server',
      dataIndex: 'apiServer',
      key: 'apiServer',
      render: value => <Text code style={{ fontSize: 11 }}>{value}</Text>,
    },
    {
      title: '标签',
      dataIndex: 'labels',
      key: 'labels',
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
      title: '操作',
      key: 'action',
      width: 260,
      render: (_, record) => (
        <Space size={0}>
          <Button type="link" size="small">测试连接</Button>
          <Button type="link" size="small">绑定存储配置</Button>
          <Button type="link" size="small">绑定仓库配置</Button>
          <Button type="link" size="small" onClick={() => setDetailRecord(record)}>...</Button>
        </Space>
      ),
    },
  ]

  const testCurrentConnection = () => {
    setConnectionStatus('testing')
    window.setTimeout(() => setConnectionStatus('success'), 1200)
  }

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
          <Title level={2}>Kubernetes集群管理</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
            管理和监控 Kubernetes 集群，支持 kubeconfig 导入和多集群管理
          </Text>

          <Space style={{ marginBottom: 16 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              导入集群
            </Button>
            <Button>刷新</Button>
          </Space>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={mockKubernetesClusters}
            pagination={{ pageSize: 10, showTotal: total => `共 ${total} 个集群` }}
          />
        </Card>
      </div>

      <Modal
        title="导入Kubernetes集群"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={
          <Space>
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button type="primary" onClick={submitCreate}>导入</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item label="集群名称" name="name" rules={[{ required: true, message: '请输入集群名称' }]}>
            <Input placeholder="请输入集群名称" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="请输入集群描述（可选）" />
          </Form.Item>
          <Form.Item label="Kubeconfig文件" name="kubeconfig" rules={[{ required: true, message: '请上传Kubeconfig文件' }]}>
            <Button icon={<UploadOutlined />} style={{ width: '100%', height: 80 }}>
              点击或拖拽上传文件
            </Button>
          </Form.Item>
          <Form.Item label="API Server地址" name="apiServer" rules={[{ required: true, message: '请输入API Server地址' }]}>
            <Input placeholder="https://192.168.1.1:6443" />
          </Form.Item>
          <Space style={{ marginBottom: 12 }}>
            <Button icon={<CloudOutlined />} loading={connectionStatus === 'testing'} onClick={testCurrentConnection}>
              测试连接
            </Button>
            {connectionStatus === 'success' && <Tag color="success">连接成功</Tag>}
          </Space>
          <Form.Item label="集群标签" name="labels">
            <Select
              mode="tags"
              placeholder="输入标签名称，可添加多个"
              options={labelPresets.map(item => ({ value: item.value, label: item.label }))}
            />
          </Form.Item>
          {connectionStatus === 'success' && (
            <Alert message="连接测试成功" description="集群连接正常，可以进行导入操作。" type="success" showIcon />
          )}
        </Form>
      </Modal>

      <Modal
        title="集群详情"
        open={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
        footer={<Button onClick={() => setDetailRecord(null)}>关闭</Button>}
      >
        {detailRecord && (
          <Table
            rowKey="key"
            pagination={false}
            columns={[
              { title: '字段', dataIndex: 'label', key: 'label', width: 120 },
              { title: '内容', dataIndex: 'value', key: 'value' },
            ]}
            dataSource={[
              { key: 'name', label: '集群名称', value: detailRecord.name },
              { key: 'api', label: 'API Server', value: detailRecord.apiServer },
              { key: 'labels', label: '标签', value: detailRecord.labels?.join(', ') || '-' },
              { key: 'nodes', label: '节点数', value: detailRecord.nodeCount ?? '-' },
              { key: 'connect', label: '连接状态', value: detailRecord.connectionStatus },
              { key: 'mount', label: '挂载状态', value: detailRecord.mountStatus },
              { key: 'storage', label: '存储配置', value: detailRecord.storageConfig || '未配置' },
              { key: 'registry', label: '镜像仓库', value: detailRecord.imageRegistry || '未配置' },
              { key: 'createdAt', label: '创建时间', value: detailRecord.createdAt },
            ]}
          />
        )}
      </Modal>
    </>
  )
}

export default KubernetesClusterPage
