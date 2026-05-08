import React, { useMemo, useState } from 'react'
import {
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
import {
  CloudServerOutlined,
  CloseOutlined,
  DatabaseOutlined,
  FolderOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { mockStorageConfigs } from '../../data/mockDataAll'
import type { StorageConfig as StorageConfigRecord } from '../../types/shared'

const { Title, Text } = Typography

const storageTypes = [
  { value: '火山引擎 TOS', label: '火山引擎 TOS', icon: <CloudServerOutlined style={{ color: '#1677ff' }} /> },
  { value: 'MinIO', label: 'MinIO', icon: <DatabaseOutlined style={{ color: '#52c41a' }} /> },
  { value: 'NFS', label: 'NFS', icon: <FolderOutlined style={{ color: '#fa8c16' }} /> },
  { value: '华为云 OBS', label: '华为云 OBS', icon: <CloudServerOutlined style={{ color: '#1677ff' }} /> },
  { value: '移动云', label: '移动云', icon: <CloudServerOutlined style={{ color: '#2f54eb' }} /> },
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
  const [rows, setRows] = useState<StorageConfigRecord[]>(mockStorageConfigs)

  const maskSecret = (value?: string) => (value && value !== '-' ? '********' : value || '-')

  const confirmDelete = (record: StorageConfigRecord) => {
    if ((record.clusterCount ?? 0) > 0) {
      message.warning('已绑定集群，不允许删除')
      return
    }

    Modal.confirm({
      title: '确认删除存储配置？',
      content: `删除后存储配置「${record.name}」将从列表移除，请确认是否继续。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        setRows(previous => previous.filter(item => item.id !== record.id))
        message.success(`已删除存储配置：${record.name}`)
      },
    })
  }

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
    { title: '存储名称', dataIndex: 'name', key: 'name', width: 180 },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 260,
      ellipsis: true,
      render: value => value || '-',
    },
    { title: '存储类型', dataIndex: 'type', key: 'type', width: 140 },
    { title: '集群数量', dataIndex: 'clusterCount', key: 'clusterCount', width: 110 },
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
      width: 320,
      render: (_, record) => (
        <Space size={0} style={{ whiteSpace: 'nowrap' }}>
          <Button type="link" size="small">测试连接</Button>
          <Button type="link" size="small" onClick={() => setDetailRecord(record)}>查看详情</Button>
          <Button type="link" size="small" danger>文件系统格式化</Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={() => confirmDelete(record)}
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
      setRows(previous => [
        {
          id: `storage-${Date.now()}`,
          name: values.name,
          description: values.description,
          type: values.type,
          endpoint: values.endpoint,
          region: values.region,
          bucket: values.bucket,
          accessKeyId: values.accessKeyId,
          accessKeySecret: values.accessKeySecret,
          clusterCount: 0,
          connectionStatus: 'untested',
          lastTestTime: '--',
        },
        ...previous,
      ])
      setCreateOpen(false)
      form.resetFields()
      message.success('存储配置创建成功')
    } catch {
      return
    }
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Card style={{ borderRadius: 20, border: '1px solid #e5e7eb' }}>
          <Title level={2}>存储配置管理</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
            管理和配置不同类型的存储，并进行文件系统格式化
          </Text>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <Space wrap>
              <Input
                placeholder="搜索配置名称或描述"
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                style={{ width: 260, maxWidth: '100%' }}
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

            <Space wrap>
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
            scroll={{ x: 1470 }}
          />
        </Card>
      </div>

      <Modal
        title={
          <Space>
            <PlusOutlined />
            <span>新建存储配置</span>
          </Space>
        }
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false)
          form.resetFields()
        }}
        width={760}
        footer={
          <Space>
            <Button
              icon={<CloseOutlined />}
              onClick={() => {
                setCreateOpen(false)
                form.resetFields()
              }}
            >
              取消
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={submitCreate}>创建配置</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" initialValues={{ type: '火山引擎 TOS' }}>
          <Card
            size="small"
            title={
              <Space>
                <InfoCircleOutlined style={{ color: '#1677ff' }} />
                <span>基本信息</span>
              </Space>
            }
            style={{ borderRadius: 8, background: '#fafafa', marginBottom: 24 }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '20px 24px' }}>
              <Form.Item label="配置名称" name="name" rules={[{ required: true, message: '请输入存储配置名称' }]}>
                <Input prefix={<DatabaseOutlined />} placeholder="请输入存储配置名称" />
              </Form.Item>
              <Form.Item label="存储类型" name="type" rules={[{ required: true, message: '请选择存储类型' }]}>
                <Select
                  placeholder="请选择存储类型"
                  options={storageTypes.map(item => ({
                    value: item.value,
                    label: (
                      <Space>
                        {item.icon}
                        <span>{item.label}</span>
                      </Space>
                    ),
                  }))}
                />
              </Form.Item>
              <Form.Item
                label="描述信息"
                name="description"
                style={{ gridColumn: '1 / -1', marginBottom: 0 }}
              >
                <Input.TextArea
                  rows={3}
                  maxLength={200}
                  showCount
                  placeholder="请输入存储配置的描述信息（可选）"
                />
              </Form.Item>
            </div>
          </Card>

          <Card
            size="small"
            title={
              <Space>
                <SettingOutlined style={{ color: '#1677ff' }} />
                <span>配置参数</span>
              </Space>
            }
            style={{ borderRadius: 8, background: '#fafafa' }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '20px 24px' }}>
              <Form.Item label="终端节点" name="endpoint" rules={[{ required: true, message: '请输入终端节点' }]}>
                <Input prefix={<CloudServerOutlined />} placeholder="例如：tos-cn-beijing.volces.com" />
              </Form.Item>
              <Form.Item label="地区 (Region)" name="region" rules={[{ required: true, message: '请输入地区' }]}>
                <Input prefix={<CloudServerOutlined />} placeholder="例如：cn-beijing" />
              </Form.Item>
              <Form.Item
                label="存储桶 (Bucket)"
                name="bucket"
                rules={[{ required: true, message: '请输入存储桶名称' }]}
                style={{ gridColumn: '1 / -1' }}
              >
                <Input prefix={<FolderOutlined />} placeholder="例如：my-bucket" />
              </Form.Item>
              <Form.Item
                label="访问密钥 (Access Key)"
                name="accessKeyId"
                rules={[{ required: true, message: '请输入Access Key' }]}
                style={{ gridColumn: '1 / -1' }}
              >
                <Input prefix={<DatabaseOutlined />} placeholder="请输入Access Key" />
              </Form.Item>
              <Form.Item
                label="密钥 (Secret Key)"
                name="accessKeySecret"
                rules={[{ required: true, message: '请输入Secret Key' }]}
                style={{ gridColumn: '1 / -1', marginBottom: 0 }}
              >
                <Input.Password prefix={<DatabaseOutlined />} placeholder="请输入Secret Key" />
              </Form.Item>
            </div>
          </Card>
        </Form>
      </Modal>

      <Modal
        title={
          detailRecord ? (
            <Space>
              <InfoCircleOutlined />
              <span>存储配置详情</span>
              <Tag color="blue">{detailRecord.name}</Tag>
            </Space>
          ) : (
            '存储配置详情'
          )
        }
        open={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
        width={760}
        footer={null}
      >
        {detailRecord && (
          <Space direction="vertical" size={24} style={{ width: '100%' }}>
            <Card
              size="small"
              title={
                <Space>
                  <InfoCircleOutlined style={{ color: '#1677ff' }} />
                  <span>基本信息</span>
                </Space>
              }
              style={{ borderRadius: 8, background: '#fafafa' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '20px 24px' }}>
                <div>
                  <Text style={{ display: 'block', marginBottom: 10 }}>配置名称</Text>
                  <Input readOnly prefix={<DatabaseOutlined />} value={detailRecord.name} />
                </div>
                <div>
                  <Text style={{ display: 'block', marginBottom: 10 }}>存储类型</Text>
                  <Input readOnly value={detailRecord.type} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Text style={{ display: 'block', marginBottom: 10 }}>描述信息</Text>
                  <Input.TextArea readOnly rows={3} value={detailRecord.description || '-'} />
                </div>
              </div>
            </Card>

            <Card
              size="small"
              title={
                <Space>
                  <SettingOutlined style={{ color: '#1677ff' }} />
                  <span>配置参数</span>
                </Space>
              }
              style={{ borderRadius: 8, background: '#fafafa' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '20px 24px' }}>
                <div>
                  <Text style={{ display: 'block', marginBottom: 10 }}>终端节点</Text>
                  <Input readOnly prefix={<CloudServerOutlined />} value={detailRecord.endpoint || '-'} />
                </div>
                <div>
                  <Text style={{ display: 'block', marginBottom: 10 }}>地区 (Region)</Text>
                  <Input readOnly prefix={<CloudServerOutlined />} value={detailRecord.region || '-'} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Text style={{ display: 'block', marginBottom: 10 }}>存储桶 (Bucket)</Text>
                  <Input readOnly prefix={<FolderOutlined />} value={detailRecord.bucket || '-'} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Text style={{ display: 'block', marginBottom: 10 }}>访问密钥 (Access Key)</Text>
                  <Input readOnly prefix={<DatabaseOutlined />} value={detailRecord.accessKeyId || '-'} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Text style={{ display: 'block', marginBottom: 10 }}>密钥 (Secret Key)</Text>
                  <Input readOnly prefix={<DatabaseOutlined />} value={maskSecret(detailRecord.accessKeySecret)} />
                </div>
              </div>
            </Card>
          </Space>
        )}
      </Modal>
    </>
  )
}

export default StorageConfig
