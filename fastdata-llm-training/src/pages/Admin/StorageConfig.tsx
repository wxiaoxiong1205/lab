import React, { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DatabaseOutlined, PlusOutlined } from '@ant-design/icons'
import { mockStorageConfigs } from '../../data/mockDataAll'
import type { StorageConfig as StorageConfigRecord } from '../../types/shared'

const { Title, Text } = Typography

const storageTypes = [
  { value: 'NFS', label: 'NFS' },
  { value: 'Ceph', label: 'Ceph' },
  { value: 'OSS', label: 'OSS' },
  { value: '火山引擎 TOS', label: '火山引擎 TOS' },
]

function renderStatus(status: string): React.ReactNode {
  if (status === 'connected') {
    return <Tag color="success">连接正常</Tag>
  }
  if (status === 'disconnected') {
    return <Tag color="error">未连接</Tag>
  }
  return <Tag>未测试</Tag>
}

const StorageConfig: React.FC = () => {
  const [form] = Form.useForm()
  const [searchValue, setSearchValue] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>()
  const [createOpen, setCreateOpen] = useState(false)
  const [detailRecord, setDetailRecord] = useState<StorageConfigRecord | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success'>('idle')
  const [rows, setRows] = useState<StorageConfigRecord[]>(mockStorageConfigs)

  const filteredData = useMemo(
    () =>
      rows.filter(item => {
        const matchSearch =
          !searchValue ||
          item.name.toLowerCase().includes(searchValue.toLowerCase()) ||
          (item.description || '').toLowerCase().includes(searchValue.toLowerCase())
        const matchType = !typeFilter || item.type === typeFilter
        return matchSearch && matchType
      }),
    [rows, searchValue, typeFilter],
  )

  const columns: ColumnsType<StorageConfigRecord> = [
    { title: '存储名称', dataIndex: 'name', key: 'name' },
    { title: '描述', dataIndex: 'description', key: 'description', render: value => value || '-' },
    { title: '存储类型', dataIndex: 'type', key: 'type' },
    { title: '集群数量', dataIndex: 'clusterCount', key: 'clusterCount', width: 90 },
    {
      title: '连接状态',
      dataIndex: 'connectionStatus',
      key: 'connectionStatus',
      width: 120,
      render: value => renderStatus(value),
    },
    { title: '最后测试时间', dataIndex: 'lastTestTime', key: 'lastTestTime', width: 170 },
    {
      title: '操作',
      key: 'action',
      width: 280,
      render: (_, record) => (
        <Space size={0}>
          <Button type="link" size="small">测试连接</Button>
          <Button type="link" size="small" onClick={() => setDetailRecord(record)}>查看详情</Button>
          <Button type="link" size="small" danger>文件系统格式化</Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={() => {
              if ((record.clusterCount ?? 0) > 0) {
                message.warning('已绑定集群，不允许删除')
                return
              }
              setRows(previous => previous.filter(item => item.id !== record.id))
              message.success(`已删除存储配置：${record.name}`)
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
      await form.validateFields()
      setCreateOpen(false)
    } catch {
      return
    }
  }

  const testCurrentConnection = () => {
    setConnectionStatus('testing')
    window.setTimeout(() => setConnectionStatus('success'), 1200)
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Card style={{ borderRadius: 20, border: '1px solid #e5e7eb' }}>
          <Title level={2}>存储配置管理</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
            管理和配置不同类型的存储，并进行文件系统格式化
          </Text>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <Space>
              <Input
                placeholder="搜索配置名称或描述"
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                style={{ width: 260 }}
              />
              <Select
                placeholder="存储类型"
                allowClear
                value={typeFilter}
                onChange={value => setTypeFilter(value)}
                style={{ width: 160 }}
                options={storageTypes}
              />
              <Button>搜索</Button>
              <Button onClick={() => { setSearchValue(''); setTypeFilter(undefined) }}>重置</Button>
            </Space>

            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                新建配置
              </Button>
              <Button>刷新</Button>
            </Space>
          </div>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredData}
            pagination={{ pageSize: 10, showTotal: total => `共 ${total} 条数据` }}
          />
        </Card>
      </div>

      <Modal
        title="新建存储配置"
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
          <Form.Item label="存储名称" name="name" rules={[{ required: true, message: '请输入存储名称' }]}>
            <Input placeholder="请输入存储名称" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="请输入存储描述（可选）" />
          </Form.Item>
          <Form.Item label="存储类型" name="type" rules={[{ required: true, message: '请选择存储类型' }]}>
            <Select placeholder="请选择存储类型" options={storageTypes} />
          </Form.Item>
          <Form.Item label="访问密钥ID" name="accessKeyId" rules={[{ required: true, message: '请输入访问密钥ID' }]}>
            <Input placeholder="请输入访问密钥ID" />
          </Form.Item>
          <Form.Item label="访问密钥密钥" name="accessKeySecret" rules={[{ required: true, message: '请输入访问密钥密钥' }]}>
            <Input.Password placeholder="请输入访问密钥密钥" />
          </Form.Item>
          <Form.Item label="存储桶/卷名" name="bucket" rules={[{ required: true, message: '请输入存储桶/卷名' }]}>
            <Input placeholder="请输入存储桶名称或挂载卷名" />
          </Form.Item>
          <Form.Item label="访问域名/地址" name="endpoint" rules={[{ required: true, message: '请输入访问域名/地址' }]}>
            <Input placeholder="如：https://your-bucket.s3.amazonaws.com" />
          </Form.Item>
          <Space style={{ marginBottom: 12 }}>
            <Button icon={<DatabaseOutlined />} loading={connectionStatus === 'testing'} onClick={testCurrentConnection}>
              测试连接
            </Button>
            {connectionStatus === 'success' && <Tag color="success">连接成功</Tag>}
          </Space>
          {connectionStatus === 'success' && (
            <Alert message="连接测试成功" description="连接正常，可以进行创建操作。" type="success" showIcon />
          )}
        </Form>
      </Modal>

      <Modal
        title="存储配置详情"
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
              { key: 'name', label: '存储名称', value: detailRecord.name },
              { key: 'desc', label: '描述', value: detailRecord.description || '-' },
              { key: 'type', label: '存储类型', value: detailRecord.type },
              { key: 'count', label: '集群数量', value: detailRecord.clusterCount ?? '-' },
              { key: 'status', label: '连接状态', value: detailRecord.connectionStatus },
              { key: 'time', label: '最后测试时间', value: detailRecord.lastTestTime || '-' },
            ]}
          />
        )}
      </Modal>
    </>
  )
}

export default StorageConfig
