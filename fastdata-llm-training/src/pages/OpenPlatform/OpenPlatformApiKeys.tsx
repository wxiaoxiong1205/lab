import React from 'react'
import {
  Button,
  Card,
  Modal,
  Space,
  Table,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate } from 'react-router-dom'
import {
  ApiOutlined,
  CopyOutlined,
  DeleteOutlined,
  FileTextOutlined,
  KeyOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { getCurrentUser, usePermissionStore } from '../../services/permissionStore'
import {
  openPlatformApi,
  type AccessKeyRecord,
  useOpenPlatformAccessKeys,
} from '../../services/openPlatformApi'

const { Paragraph, Text, Title } = Typography

function formatCompactDate(value: string) {
  const date = new Date(value)
  const pad = (item: number) => String(item).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function maskMiddle(value: string) {
  if (value.length <= 12) {
    return value
  }

  return `${value.slice(0, 8)}${'*'.repeat(Math.max(value.length - 12, 8))}${value.slice(-4)}`
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
  const navigate = useNavigate()
  const permissionState = usePermissionStore()
  const currentUser = getCurrentUser(permissionState)
  const records = useOpenPlatformAccessKeys(currentUser.account)
  const [messageApi, contextHolder] = message.useMessage()
  const hasAccessKey = records.length > 0

  const createRecord = () => {
    if (hasAccessKey) {
      messageApi.warning('每个账号仅允许创建一个 API 访问密钥')
      return
    }

    openPlatformApi.createAccessKey(currentUser.account)
    messageApi.success('API 访问密钥已创建')
  }

  const deleteRecord = (record: AccessKeyRecord) => {
    Modal.confirm({
      title: '删除 API 访问密钥',
      content: '删除后，该 Access Key ID 与 Secret Access Key 将无法继续使用，且无法恢复。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        openPlatformApi.deleteAccessKey(record.id)
        messageApi.success('API 访问密钥已删除')
      },
    })
  }

  const copyAccessValue = async (value: string, label: string) => {
    await copyText(value)
    messageApi.success(`${label} 已复制`)
  }

  const columns: ColumnsType<AccessKeyRecord> = [
    {
      title: 'Access Key ID',
      dataIndex: 'accessKeyId',
      width: 260,
      render: (value: string) => (
        <Space size={8} wrap={false}>
          <Text code>{value}</Text>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => copyAccessValue(value, 'Access Key ID')}
          />
        </Space>
      ),
    },
    {
      title: 'Secret Access Key',
      dataIndex: 'secretAccessKey',
      width: 360,
      render: (value: string) => (
        <Space size={8} wrap={false}>
          <Text code>{maskMiddle(value)}</Text>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => copyAccessValue(value, 'Secret Access Key')}
          />
        </Space>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 140,
      render: formatCompactDate,
    },
    {
      title: '操作',
      width: 96,
      render: (_, record) => (
        <Button
          type="link"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => deleteRecord(record)}
        >
          删除
        </Button>
      ),
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
                API访问密钥
              </Title>
            </Space>
            <Paragraph type="secondary" style={{ marginBottom: 0, maxWidth: 720 }}>
              用于生成访问开放平台 API 的账号级凭证，可在开发指南中查看认证方式与调用示例。
            </Paragraph>
          </div>
          <Space size={10} wrap>
            <Button icon={<FileTextOutlined />} onClick={() => navigate('/docs/developer-guide')}>
              开放平台文档
            </Button>
            <Button type="primary" icon={<PlusOutlined />} disabled={hasAccessKey} onClick={createRecord}>
              创建密钥
            </Button>
          </Space>
        </div>

        <Card
          title={
            <Space>
              <KeyOutlined />
              API访问密钥
            </Space>
          }
        >
          <Table
            rowKey="id"
            columns={columns}
            dataSource={records}
            pagination={false}
            scroll={{ x: 920 }}
          />
        </Card>
      </div>
    </div>
  )
}

export default OpenPlatformApiKeys
