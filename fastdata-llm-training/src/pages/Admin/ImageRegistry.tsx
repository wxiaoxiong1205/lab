import React, { useState } from 'react'
import { message, Modal, Form, Input, Select, Button, Typography, Space, Divider, Table, Descriptions } from 'antd'
import { AppstoreOutlined, PlusOutlined, CheckCircleOutlined } from '@ant-design/icons'
import SharedListPage from '../../components/Shared/SharedListPage'
import { mockImageRegistries } from '../../data/mockDataAll'
import type { ColumnsType } from 'antd/es/table'
import type { ImageRegistry, ImageRecord } from '../../types/shared'

const { Text } = Typography

// 认证方式选项
const authTypes = [
  { value: 'username_password', label: '用户名密码' },
  { value: 'token', label: 'Token' },
  { value: 'public', label: '公开' },
]

const ImageRegistryPage: React.FC = () => {
  const [data] = useState<ImageRegistry[]>(mockImageRegistries)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<ImageRegistry | null>(null)
  const [form] = Form.useForm()
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success'>('idle')

  const columns: ColumnsType<ImageRegistry> = [
    { title: '仓库名称', dataIndex: 'name', key: 'name' },
    { title: '命名空间', dataIndex: 'namespace', key: 'namespace' },
    { title: '仓库地址', dataIndex: 'address', key: 'address', render: (val: string) => (
      <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b' }}>{val}</span>
    )},
    { title: '认证方式', dataIndex: 'authType', key: 'authType' },
    { title: '绑定集群', dataIndex: 'boundClusterCount', key: 'boundClusterCount', render: (val: number) => `${val} 个` },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => (
        <Text style={{ color: val === 'normal' ? '#52c41a' : '#ff4d4f' }}>
          {val === 'normal' ? '正常' : '异常'}
        </Text>
      ),
    },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
  ]

  const handleOpenCreate = () => {
    form.resetFields()
    setConnectionStatus('idle')
    setCreateModalVisible(true)
  }

  const handleTestConnection = async () => {
    setConnectionStatus('testing')
    setTimeout(() => {
      setConnectionStatus('success')
      message.success('连接测试成功')
    }, 2000)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('新建镜像仓库:', values)
      message.success('创建成功')
      setCreateModalVisible(false)
      form.resetFields()
      setConnectionStatus('idle')
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  const imageListColumns: ColumnsType<ImageRecord> = [
    { title: '镜像名称', dataIndex: 'name', key: 'name' },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: '分类', dataIndex: 'category', key: 'category' },
    { title: '添加时间', dataIndex: 'addedAt', key: 'addedAt' },
  ]

  const handleOpenDetail = (record: ImageRegistry) => {
    setSelectedRecord(record)
    setDetailModalVisible(true)
  }

  const handleCloseDetail = () => {
    setDetailModalVisible(false)
    setSelectedRecord(null)
  }

  const handleCancel = () => {
    setCreateModalVisible(false)
    form.resetFields()
    setConnectionStatus('idle')
  }

  return (
    <>
      <SharedListPage
        title="镜像仓库配置"
        titleIcon={<AppstoreOutlined style={{ color: '#fff', fontSize: 18 }} />}
        subtitle="镜像仓库配置管理，管理镜像仓库的接入配置"
        searchPlaceholder="请输入仓库名称"
        searchField="name"
        columns={columns}
        dataSource={data}
        createButtonText="新建配置"
        onCreate={handleOpenCreate}
        onRefresh={() => message.success('刷新成功')}
        emptyText="暂无镜像仓库"
        actionButtons={[
          { label: '测试连接', onClick: (record: ImageRegistry) => message.loading(`正在测试 ${record.name}...`, 2).then(() => message.success('连接成功')) },
          { label: '详情', onClick: handleOpenDetail },
          { label: '删除', danger: true, onClick: (record: ImageRegistry) => message.success(`删除镜像仓库: ${record.name}`) },
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
            <span style={{ fontWeight: 600 }}>新建镜像仓库</span>
          </div>
        }
        open={createModalVisible}
        onCancel={handleCancel}
        width={640}
        footer={
          <Space>
            <Button onClick={handleCancel}>取消</Button>
            <Button type="primary" onClick={handleSubmit} style={{ background: '#4f46e5' }}>
              创建
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
            基本信息
          </Divider>

          <Form.Item
            label="仓库名称"
            name="name"
            rules={[
              { required: true, message: '请输入仓库名称' },
              { pattern: /^[\u4e00-\u9fa5a-zA-Z0-9_-]{2,64}$/, message: '支持中英文、数字、下划线、中划线，2-64字符' }
            ]}
          >
            <Input placeholder="请输入仓库名称" maxLength={64} showCount />
          </Form.Item>

          <Form.Item
            label="仓库地址"
            name="address"
            rules={[
              { required: true, message: '请输入仓库地址' },
              { type: 'url', message: '请输入有效的URL地址' }
            ]}
            extra="镜像仓库的完整URL地址，如：https://harbor.example.com"
          >
            <Input placeholder="https://harbor.example.com" />
          </Form.Item>

          <Form.Item
            label="命名空间"
            name="namespace"
            rules={[{ required: true, message: '请输入命名空间' }]}
            extra="镜像仓库的命名空间"
          >
            <Input placeholder="如：deepexi/project" />
          </Form.Item>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            认证配置
          </Divider>

          <Form.Item
            label="认证方式"
            name="authType"
            rules={[{ required: true, message: '请选择认证方式' }]}
          >
            <Select placeholder="请选择认证方式">
              {authTypes.map(at => (
                <Select.Option key={at.value} value={at.label}>{at.label}</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.authType !== currentValues.authType}
          >
            {({ getFieldValue }) => {
              const authType = getFieldValue('authType')
              if (authType === '用户名密码') {
                return (
                  <>
                    <Form.Item
                      label="用户名"
                      name="username"
                      rules={[{ required: true, message: '请输入用户名' }]}
                    >
                      <Input placeholder="请输入用户名" />
                    </Form.Item>
                    <Form.Item
                      label="密码"
                      name="password"
                      rules={[{ required: true, message: '请输入密码' }]}
                    >
                      <Input.Password placeholder="请输入密码" />
                    </Form.Item>
                  </>
                )
              } else if (authType === 'Token') {
                return (
                  <Form.Item
                    label="Token"
                    name="token"
                    rules={[{ required: true, message: '请输入Token' }]}
                  >
                    <Input.Password placeholder="请输入访问Token" />
                  </Form.Item>
                )
              }
              return null
            }}
          </Form.Item>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Button
              onClick={handleTestConnection}
              loading={connectionStatus === 'testing'}
              icon={<AppstoreOutlined />}
            >
              测试连接
            </Button>
            {connectionStatus === 'success' && (
              <Text style={{ color: '#52c41a' }}>
                <CheckCircleOutlined style={{ marginRight: 4 }} />
                连接成功
              </Text>
            )}
          </div>

          <div style={{
            background: '#f8fafc',
            borderRadius: 8,
            padding: '12px 16px',
            border: '1px solid #e2e8f0'
          }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <AppstoreOutlined style={{ marginRight: 6 }} />
              提示：创建后可以将此仓库绑定到Kubernetes集群
            </Text>
          </div>
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
              <AppstoreOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>镜像仓库详情</span>
          </div>
        }
        open={detailModalVisible}
        onCancel={handleCloseDetail}
        width={640}
        footer={<Button onClick={handleCloseDetail}>关闭</Button>}
      >
        {selectedRecord && (
          <>
            <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="仓库名称" span={2}>{selectedRecord.name}</Descriptions.Item>
              <Descriptions.Item label="命名空间">{selectedRecord.namespace}</Descriptions.Item>
              <Descriptions.Item label="认证方式">{selectedRecord.authType}</Descriptions.Item>
              <Descriptions.Item label="仓库地址" span={2}>
                <Text code style={{ fontSize: 11 }}>{selectedRecord.address}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <span style={{ color: selectedRecord.status === 'normal' ? '#52c41a' : '#ff4d4f' }}>
                  {selectedRecord.status === 'normal' ? '正常' : '异常'}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="绑定集群">{selectedRecord.boundClusterCount} 个</Descriptions.Item>
              <Descriptions.Item label="创建时间" span={2}>{selectedRecord.createdAt}</Descriptions.Item>
            </Descriptions>

            <Text strong style={{ fontSize: 13, color: '#0f172a', marginBottom: 8, display: 'block' }}>已添加镜像</Text>
            <Table
              columns={imageListColumns}
              dataSource={[
                { id: '1', name: 'dgi-server:v1.0.0', description: 'DGI服务镜像', category: 'DGI Server', addedAt: '2026/02/01 10:00:00' },
                { id: '2', name: 'dgi-server:latest', description: 'DGI服务最新镜像', category: 'DGI Server', addedAt: '2026/02/01 10:00:00' },
              ]}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </>
        )}
      </Modal>
    </>
  )
}

export default ImageRegistryPage
