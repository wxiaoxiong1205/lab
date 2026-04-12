import React, { useState } from 'react'
import { message, Modal, Form, Input, Select, Button, Typography, Space, Divider, Descriptions, Popconfirm } from 'antd'
import { DatabaseOutlined, PlusOutlined, CheckCircleOutlined } from '@ant-design/icons'
import SharedListPage from '../../components/Shared/SharedListPage'

const { Text } = Typography

// 存储类型选项
const storageTypes = [
  { value: 'tos', label: '火山引擎 TOS', description: '火山引擎对象存储' },
  { value: 'oss', label: '阿里云 OSS', description: '阿里云对象存储' },
  { value: 's3', label: 'AWS S3', description: 'Amazon S3 兼容存储' },
  { value: 'nfs', label: 'NFS', description: '网络文件系统' },
  { value: 'ceph', label: 'Ceph', description: 'Ceph分布式存储' },
]

const mockData = [
  {
    id: '1',
    name: '测试环境存储',
    description: '',
    type: '火山引擎 TOS',
    clusterCount: 8,
    connectionStatus: 'connected',
    lastTestTime: '2026/1/31 14:57:03',
  },
]

const statusColor = (status: string) => {
  if (status === 'connected') return 'green'
  if (status === 'disconnected') return 'red'
  return 'default'
}
const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    connected: '连接正常',
    disconnected: '未连接',
    untested: '未测试',
  }
  return map[status] || status
}

const StorageConfig: React.FC = () => {
  const [data] = useState(mockData)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<typeof mockData[0] | null>(null)
  const [form] = Form.useForm()
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success'>('idle')

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
      message.success('存储配置创建成功')
    } catch {
      // 表单校验失败，不做处理
    }
  }

  const handleOpenDetail = (record: typeof mockData[0]) => {
    setSelectedRecord(record)
    setDetailModalVisible(true)
  }

  const handleCloseDetail = () => {
    setDetailModalVisible(false)
    setSelectedRecord(null)
  }

  const handleTestConnection = (record: typeof mockData[0]) => {
    message.loading(`正在测试存储 ${record.name} 连接...`, 2).then(() => {
      message.success(`存储 ${record.name} 连接正常`)
    })
  }

  const handleTestCurrentConnection = () => {
    const name = form.getFieldValue('name') || '当前'
    setConnectionStatus('testing')
    setTimeout(() => {
      setConnectionStatus('success')
      message.success(`存储 ${name} 连接正常`)
    }, 1500)
  }

  return (
    <>
      <SharedListPage
        title="存储配置"
        titleIcon={<DatabaseOutlined style={{ color: '#fff', fontSize: 18 }} />}
        subtitle="管理和配置不同类型的存储，并进行文件系统格式化"
        searchPlaceholder="搜索存储名称"
        searchField="name"
        columns={[
          { title: '存储名称', dataIndex: 'name', key: 'name' },
          { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
          { title: '存储类型', dataIndex: 'type', key: 'type' },
          { title: '集群数量', dataIndex: 'clusterCount', key: 'clusterCount' },
          {
            title: '连接状态',
            dataIndex: 'connectionStatus',
            key: 'connectionStatus',
            render: (val: string) => (
              <span style={{ color: val === 'connected' ? '#52c41a' : val === 'disconnected' ? '#ff4d4f' : '#999' }}>
                {statusLabel(val)}
              </span>
            ),
          },
          { title: '最后测试时间', dataIndex: 'lastTestTime', key: 'lastTestTime' },
        ]}
        dataSource={data}
        createButtonText="新建配置"
        onCreate={handleOpenCreate}
        onRefresh={() => message.success('刷新成功')}
        emptyText="暂无存储配置"
        actionButtons={[
          { label: '测试连接', onClick: handleTestConnection },
          { label: '详情', onClick: handleOpenDetail },
          { label: '格式化', danger: true, onClick: (record: typeof mockData[0]) => message.success(`开始格式化存储: ${record.name}`) },
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
            <span style={{ fontWeight: 600 }}>新建存储配置</span>
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
            label="存储名称"
            name="name"
            rules={[
              { required: true, message: '请输入存储名称' },
              { pattern: /^[\u4e00-\u9fa5a-zA-Z0-9_-]{2,64}$/, message: '支持中英文、数字、下划线、中划线，2-64字符' }
            ]}
          >
            <Input placeholder="请输入存储名称" maxLength={64} showCount />
          </Form.Item>

          <Form.Item
            label="描述"
            name="description"
          >
            <Input.TextArea rows={2} placeholder="请输入存储描述（可选）" maxLength={200} showCount />
          </Form.Item>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            连接配置
          </Divider>

          <Form.Item
            label="存储类型"
            name="type"
            rules={[{ required: true, message: '请选择存储类型' }]}
          >
            <Select placeholder="请选择存储类型">
              {storageTypes.map(st => (
                <Select.Option key={st.value} value={st.value}>
                  <div>
                    <div>{st.label}</div>
                    <Text type="secondary" style={{ fontSize: 11 }}>{st.description}</Text>
                  </div>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="访问密钥ID"
            name="accessKeyId"
            rules={[{ required: true, message: '请输入访问密钥ID' }]}
          >
            <Input placeholder="请输入访问密钥ID" />
          </Form.Item>

          <Form.Item
            label="访问密钥密钥"
            name="accessKeySecret"
            rules={[{ required: true, message: '请输入访问密钥密钥' }]}
          >
            <Input.Password placeholder="请输入访问密钥密钥" />
          </Form.Item>

          <Form.Item
            label="存储桶/卷名"
            name="bucket"
            rules={[{ required: true, message: '请输入存储桶或卷名' }]}
          >
            <Input placeholder="请输入存储桶名称或挂载卷名" />
          </Form.Item>

          <Form.Item
            label="访问域名/地址"
            name="endpoint"
            rules={[
              { required: true, message: '请输入访问域名' },
              { type: 'url', message: '请输入有效的URL地址' }
            ]}
          >
            <Input placeholder="如：https://your-bucket.s3.amazonaws.com" />
          </Form.Item>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Button
              onClick={handleTestCurrentConnection}
              loading={connectionStatus === 'testing'}
              icon={<DatabaseOutlined />}
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
              <DatabaseOutlined style={{ marginRight: 6 }} />
              提示：测试连接成功后，可以进行文件系统格式化操作
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
              <DatabaseOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>存储配置详情</span>
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
            <Descriptions.Item label="存储名称" span={2}>{selectedRecord.name}</Descriptions.Item>
            <Descriptions.Item label="描述">{selectedRecord.description || '-'}</Descriptions.Item>
            <Descriptions.Item label="存储类型">{selectedRecord.type}</Descriptions.Item>
            <Descriptions.Item label="集群数量">{selectedRecord.clusterCount}</Descriptions.Item>
            <Descriptions.Item label="连接状态" span={2}>
              <span style={{ color: selectedRecord.connectionStatus === 'connected' ? '#52c41a' : '#ff4d4f' }}>
                {statusLabel(selectedRecord.connectionStatus)}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="最后测试时间" span={2}>{selectedRecord.lastTestTime}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default StorageConfig
