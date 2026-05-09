import React, { useMemo, useState } from 'react'
import {
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
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ApiOutlined,
  CopyOutlined,
  DeleteOutlined,
  KeyOutlined,
  PlusOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { getCurrentUser, usePermissionStore } from '../../services/permissionStore'
import {
  getApiKeyComputedStatus,
  openPlatformApi,
  type ApiKeyRecord,
  type ApiKeyStatus,
  useOpenPlatformApiKeys,
} from '../../services/openPlatformApi'

const { Paragraph, Text, Title } = Typography

const validityOptions = [
  { label: '7 天', value: 7 },
  { label: '30 天', value: 30 },
  { label: '90 天', value: 90 },
  { label: '180 天', value: 180 },
  { label: '永久有效', value: 0 },
]

const statusMap: Record<ApiKeyStatus, { text: string; color: string }> = {
  active: { text: '启用中', color: 'green' },
  disabled: { text: '已禁用', color: 'default' },
  expired: { text: '已过期', color: 'orange' },
}

interface ApiKeyFormValues {
  name: string
  validityDays: number
  remark?: string
}

function formatCompactDate(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  const pad = (item: number) => String(item).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

const OpenPlatformApiKeys: React.FC = () => {
  const [form] = Form.useForm<ApiKeyFormValues>()
  const permissionState = usePermissionStore()
  const currentUser = getCurrentUser(permissionState)
  const records = useOpenPlatformApiKeys(currentUser.account)
  const [createOpen, setCreateOpen] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  const summary = useMemo(() => {
    const activeCount = records.filter(item => getApiKeyComputedStatus(item) === 'active').length
    const expiredCount = records.filter(item => getApiKeyComputedStatus(item) === 'expired').length
    return { total: records.length, activeCount, expiredCount }
  }, [records])

  const closeCreateModal = () => {
    setCreateOpen(false)
    form.resetFields()
  }

  const submitCreate = async () => {
    const values = await form.validateFields()
    openPlatformApi.createApiKey({
      ownerAccount: currentUser.account,
      name: values.name,
      validityDays: values.validityDays === 0 ? null : values.validityDays,
      remark: values.remark ?? '',
    })
    closeCreateModal()
    messageApi.success('API 密钥已创建')
  }

  const disableRecord = (record: ApiKeyRecord) => {
    Modal.confirm({
      title: '禁用 API 密钥',
      content: `禁用后，${record.name} 将无法继续调用开放平台 API。`,
      okText: '禁用',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        openPlatformApi.disableApiKey(record.id)
        messageApi.success('API 密钥已禁用')
      },
    })
  }

  const deleteRecord = (record: ApiKeyRecord) => {
    Modal.confirm({
      title: '删除 API 密钥',
      content: `删除后，${record.name} 的记录将从列表移除，且无法恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        openPlatformApi.deleteApiKey(record.id)
        messageApi.success('API 密钥已删除')
      },
    })
  }

  const columns: ColumnsType<ApiKeyRecord> = [
    {
      title: '密钥名称',
      dataIndex: 'name',
      width: 220,
      render: (value: string, record) => (
        <Space orientation="vertical" size={2}>
          <Text strong>{value}</Text>
          {record.remark ? <Text type="secondary">{record.remark}</Text> : null}
        </Space>
      ),
    },
    {
      title: 'API 密钥',
      dataIndex: 'keyPrefix',
      width: 220,
      render: (value: string) => (
        <Space size={8} wrap={false}>
          <Text code>{value}</Text>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            onClick={async () => {
              await copyText(value)
              messageApi.success('API 密钥已复制')
            }}
          />
        </Space>
      ),
    },
    {
      title: '状态',
      width: 96,
      render: (_, record) => {
        const status = getApiKeyComputedStatus(record)
        const option = statusMap[status]
        return <Tag color={option.color}>{option.text}</Tag>
      },
    },
    {
      title: '有效期',
      dataIndex: 'expiresAt',
      width: 128,
      render: (value: string | null) => (value ? formatCompactDate(value) : '永久有效'),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 128,
      render: formatCompactDate,
    },
    {
      title: '最后使用时间',
      dataIndex: 'lastUsedAt',
      width: 128,
      render: formatCompactDate,
    },
    {
      title: '操作',
      width: 176,
      render: (_, record) => {
        const status = getApiKeyComputedStatus(record)
        return (
          <Space size={6} wrap={false} style={{ minWidth: 144 }}>
            <Button
              type="link"
              size="small"
              icon={<StopOutlined />}
              disabled={status !== 'active'}
              onClick={() => disableRecord(record)}
            >
              禁用
            </Button>
            <Button
              type="link"
              danger
              size="small"
              icon={<DeleteOutlined />}
              onClick={() => deleteRecord(record)}
            >
              删除
            </Button>
          </Space>
        )
      },
    },
  ]

  return (
    <div style={{ padding: '28px 32px 48px', minHeight: 'calc(100vh - 72px)' }}>
      {contextHolder}
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 20,
            marginBottom: 20,
          }}
        >
          <div>
            <Space align="center" size={12} style={{ marginBottom: 8 }}>
              <span
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  background: 'linear-gradient(135deg, #0f766e 0%, #2563eb 100%)',
                  boxShadow: '0 12px 28px rgba(37, 99, 235, 0.2)',
                }}
              >
                <ApiOutlined />
              </span>
              <Title level={3} style={{ margin: 0 }}>
                开放平台 API
              </Title>
            </Space>
            <Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 720 }}>
              管理当前账号的 API 密钥，支持按有效期创建、复制、禁用和删除。
            </Paragraph>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            创建密钥
          </Button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
          <Card styles={{ body: { padding: 18 } }}>
            <Text type="secondary">密钥总数</Text>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{summary.total}</div>
          </Card>
          <Card styles={{ body: { padding: 18 } }}>
            <Text type="secondary">启用中</Text>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#059669', marginTop: 4 }}>{summary.activeCount}</div>
          </Card>
          <Card styles={{ body: { padding: 18 } }}>
            <Text type="secondary">已过期</Text>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#d97706', marginTop: 4 }}>{summary.expiredCount}</div>
          </Card>
        </div>

        <Card
          title={
            <Space>
              <KeyOutlined />
              API 密钥列表
            </Space>
          }
          extra={<Text type="secondary">当前账号：{currentUser.account}</Text>}
        >
          <Table
            rowKey="id"
            columns={columns}
            dataSource={records}
            pagination={{ pageSize: 8, showSizeChanger: false }}
            scroll={{ x: 1096 }}
          />
        </Card>
      </div>

      <Modal
        title="创建 API 密钥"
        open={createOpen}
        okText="创建"
        cancelText="取消"
        onCancel={closeCreateModal}
        onOk={submitCreate}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ validityDays: 30 }}>
          <Form.Item
            label="名称"
            name="name"
            rules={[
              { required: true, message: '请输入密钥名称' },
              { max: 32, message: '名称不能超过 32 个字符' },
            ]}
          >
            <Input placeholder="例如：数据同步脚本" />
          </Form.Item>
          <Form.Item label="密钥有效期" name="validityDays" rules={[{ required: true, message: '请选择密钥有效期' }]}>
            <Select options={validityOptions} />
          </Form.Item>
          <Form.Item label="备注" name="remark" rules={[{ max: 80, message: '备注不能超过 80 个字符' }]}>
            <Input.TextArea rows={3} placeholder="记录使用场景，便于后续轮换和清理" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default OpenPlatformApiKeys
