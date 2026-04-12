import React, { useState } from 'react'
import { message, Modal, Form, Input, Select, Button, Typography, Space, Divider, InputNumber, Alert, Descriptions } from 'antd'
import { CloudOutlined, PlusOutlined, CheckCircleOutlined, UploadOutlined } from '@ant-design/icons'
import SharedListPage from '../../components/Shared/SharedListPage'
import { mockKubernetesClusters } from '../../data/mockDataAll'
import type { ColumnsType } from 'antd/es/table'
import type { KubernetesCluster } from '../../types/shared'

const { Text } = Typography

// 标签预设
const labelPresets = [
  { value: 'dev', label: '开发环境' },
  { value: 'test', label: '测试环境' },
  { value: 'prod', label: '生产环境' },
  { value: 'gpu', label: 'GPU集群' },
  { value: 'cpu', label: 'CPU集群' },
  { value: 'high-memory', label: '高内存' },
]

const statusColor = (status: string) => {
  if (status === 'connected' || status === 'mounted') return 'green'
  if (status === 'disconnected') return 'red'
  return 'default'
}

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    connected: '已连接',
    disconnected: '未连接',
    mounted: '已挂载',
    unmounted: '未挂载',
    unknown: '未知',
  }
  return map[status] || status
}

const KubernetesClusterPage: React.FC = () => {
  const [data] = useState<KubernetesCluster[]>(mockKubernetesClusters)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<KubernetesCluster | null>(null)
  const [form] = Form.useForm()
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle')

  const columns: ColumnsType<KubernetesCluster> = [
    { title: '集群名称', dataIndex: 'name', key: 'name' },
    { title: 'API Server', dataIndex: 'apiServer', key: 'apiServer', render: (val: string) => (
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b' }}>{val}</span>
    )},
    {
      title: '标签',
      dataIndex: 'labels',
      key: 'labels',
      render: (vals: string[] | undefined) => vals?.map(l => <Text key={l} style={{ marginRight: 4, padding: '2px 6px', background: '#f1f5f9', borderRadius: 4, fontSize: 11 }}>{l}</Text>),
    },
    { title: '节点数', dataIndex: 'nodeCount', key: 'nodeCount' },
    {
      title: '连接状态',
      dataIndex: 'connectionStatus',
      key: 'connectionStatus',
      render: (val: string) => <Text style={{ color: val === 'connected' ? '#52c41a' : val === 'disconnected' ? '#ff4d4f' : '#999' }}>{statusLabel(val)}</Text>,
    },
    {
      title: '挂载状态',
      dataIndex: 'mountStatus',
      key: 'mountStatus',
      render: (val: string) => <Text style={{ color: val === 'mounted' ? '#52c41a' : '#999' }}>{statusLabel(val)}</Text>,
    },
    { title: '存储配置', dataIndex: 'storageConfig', key: 'storageConfig' },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
  ]

  const handleOpenCreate = () => {
    form.resetFields()
    setConnectionStatus('idle')
    setCreateModalVisible(true)
  }

  const handleCancel = () => {
    setCreateModalVisible(false)
  }

  const handleSubmit = async () => {
    try {
      await form.validateFields()
      setCreateModalVisible(false)
      message.success('集群导入成功')
    } catch {
      // 表单校验失败，不做处理
    }
  }

  const handleOpenDetail = (record: KubernetesCluster) => {
    setSelectedRecord(record)
    setDetailModalVisible(true)
  }

  const handleCloseDetail = () => {
    setDetailModalVisible(false)
    setSelectedRecord(null)
  }

  const handleTestConnection = (record: KubernetesCluster) => {
    message.loading(`正在测试集群 ${record.name} 连接...`, 2).then(() => {
      message.success(`集群 ${record.name} 连接正常`)
    })
  }

  const handleTestCurrentConnection = () => {
    const name = form.getFieldValue('name') || '当前'
    setConnectionStatus('testing')
    setTimeout(() => {
      setConnectionStatus('success')
      message.success(`集群 ${name} 连接正常`)
    }, 1500)
  }

  return (
    <>
      <SharedListPage
        title="Kubernetes集群管理"
        titleIcon={<CloudOutlined style={{ color: '#fff', fontSize: 18 }} />}
        subtitle="Kubernetes 集群管理，支持集群导入、连接测试、存储和仓库绑定"
        searchPlaceholder="请输入集群名称"
        searchField="name"
        columns={columns}
        dataSource={data}
        createButtonText="导入集群"
        onCreate={handleOpenCreate}
        onRefresh={() => message.success('刷新成功')}
        emptyText="暂无集群"
        actionButtons={[
          { label: '测试连接', onClick: handleTestConnection },
          { label: '绑定存储', onClick: (record: KubernetesCluster) => message.success(`绑定存储配置: ${record.name}`) },
          { label: '绑定仓库', onClick: (record: KubernetesCluster) => message.success(`绑定镜像仓库: ${record.name}`) },
          { label: '详情', onClick: handleOpenDetail },
          { label: '删除', danger: true, onClick: (record: KubernetesCluster) => message.success(`删除集群: ${record.name}`) },
        ]}
      />

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <PlusOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>导入Kubernetes集群</span>
          </div>
        }
        open={createModalVisible}
        onCancel={handleCancel}
        width={720}
        footer={
          <Space>
            <Button onClick={handleCancel}>取消</Button>
            <Button type="primary" onClick={handleSubmit} style={{ background: '#4f46e5' }}>
              导入
            </Button>
          </Space>
        }
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Divider orientation="horizontal" plain style={{ margin: '0 0 16px 0', color: '#64748b', fontSize: 12 }}>
            集群信息
          </Divider>

          <Form.Item
            label="集群名称"
            name="name"
            rules={[
              { required: true, message: '请输入集群名称' },
              { pattern: /^[\u4e00-\u9fa5a-zA-Z0-9_-]{2,64}$/, message: '支持中英文、数字、下划线、中划线，2-64字符' }
            ]}
          >
            <Input placeholder="请输入集群名称" maxLength={64} showCount />
          </Form.Item>

          <Form.Item
            label="描述"
            name="description"
          >
            <Input.TextArea rows={2} placeholder="请输入集群描述（可选）" maxLength={200} showCount />
          </Form.Item>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            连接配置
          </Divider>

          <Form.Item
            label="Kubeconfig文件"
            name="kubeconfig"
            rules={[{ required: true, message: '请上传Kubeconfig文件' }]}
            extra="上传Kubernetes集群的kubeconfig配置文件"
          >
            <Button icon={<UploadOutlined />} style={{ width: '100%', height: 80 }}>
              <div style={{ marginTop: 8 }}>点击或拖拽上传文件</div>
              <Text type="secondary" style={{ fontSize: 12 }}>支持 .yaml、.yml、.kubeconfig 格式</Text>
            </Button>
          </Form.Item>

          <Form.Item
            label="API Server地址"
            name="apiServer"
            rules={[
              { required: true, message: '请输入API Server地址' },
              { type: 'url', message: '请输入有效的URL地址' }
            ]}
            extra="从Kubeconfig文件中提取，如：https://192.168.1.1:6443"
          >
            <Input placeholder="https://192.168.1.1:6443" />
          </Form.Item>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 16
          }}>
            <Button
              onClick={handleTestCurrentConnection}
              loading={connectionStatus === 'testing'}
              icon={<CloudOutlined />}
            >
              测试连接
            </Button>
            {connectionStatus === 'success' && (
              <Text style={{ color: '#52c41a' }}>
                <CheckCircleOutlined style={{ marginRight: 4 }} />
                连接成功
              </Text>
            )}
            {connectionStatus === 'failed' && (
              <Text type="danger">
                <CheckCircleOutlined style={{ marginRight: 4 }} />
                连接失败
              </Text>
            )}
          </div>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            标签配置
          </Divider>

          <Form.Item
            label="集群标签"
            name="labels"
          >
            <Select mode="tags" placeholder="输入标签名称，可添加多个" tokenSeparators={[',']}>
              {labelPresets.map(l => (
                <Select.Option key={l.value} value={l.value}>{l.label}</Select.Option>
              ))}
            </Select>
          </Form.Item>

          {connectionStatus === 'success' && (
            <Alert
              message="连接测试成功"
              description="集群连接正常，可以进行导入操作。"
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}
        </Form>
      </Modal>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CloudOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>集群详情</span>
          </div>
        }
        open={detailModalVisible}
        onCancel={handleCloseDetail}
        width={640}
        footer={
          <Space>
            <Button onClick={handleCloseDetail}>关闭</Button>
            {selectedRecord && (
              <Button type="primary" style={{ background: '#4f46e5' }} onClick={() => { handleCloseDetail(); handleTestConnection(selectedRecord); }}>
                测试连接
              </Button>
            )}
          </Space>
        }
      >
        {selectedRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="集群名称" span={2}>{selectedRecord.name}</Descriptions.Item>
            <Descriptions.Item label="API Server" span={2}>
              <Text code style={{ fontSize: 11 }}>{selectedRecord.apiServer}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="标签" span={2}>
              {selectedRecord.labels?.map(l => (
                <Text key={l} style={{ marginRight: 6, padding: '2px 8px', background: '#f1f5f9', borderRadius: 4, fontSize: 11 }}>{l}</Text>
              ))}
            </Descriptions.Item>
            <Descriptions.Item label="节点数">{selectedRecord.nodeCount}</Descriptions.Item>
            <Descriptions.Item label="连接状态">
              <span style={{ color: selectedRecord.connectionStatus === 'connected' ? '#52c41a' : '#ff4d4f' }}>{statusLabel(selectedRecord.connectionStatus)}</span>
            </Descriptions.Item>
            <Descriptions.Item label="挂载状态">
              <span style={{ color: selectedRecord.mountStatus === 'mounted' ? '#52c41a' : '#999' }}>{statusLabel(selectedRecord.mountStatus)}</span>
            </Descriptions.Item>
            <Descriptions.Item label="存储配置">
              <span style={{ color: selectedRecord.storageConfig ? '#52c41a' : '#999' }}>
                {selectedRecord.storageConfig || '未配置'}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="镜像仓库">
              <span style={{ color: selectedRecord.imageRegistry ? '#52c41a' : '#999' }}>
                {selectedRecord.imageRegistry || '未配置'}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>{selectedRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default KubernetesClusterPage
