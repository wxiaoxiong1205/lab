import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Layout, Popconfirm, Table, Tooltip, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CopyOutlined, DeleteOutlined, FileTextOutlined, KeyOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { openapiApplicationService } from '@/services/openapiApplicationService'
import type { OpenapiApplicationItem } from '@/services/openapiApplicationService'
import { getTablePagination } from '@/utils/tablePagination'
import { useCopy } from '@/hooks/useCopy'
import TableToolbar from '@/components/common/TableToolbar'
import '@/pages/DirectoryManagement.css'
import './index.css'

const { Title, Text } = Typography

function getPlugins(record: OpenapiApplicationItem) {
  if (!record.plugins) return undefined
  if (typeof record.plugins === 'string') {
    try {
      return JSON.parse(record.plugins)
    }
    catch {
      return undefined
    }
  }
  return record.plugins
}

function getHmacAuth(record: OpenapiApplicationItem) {
  return getPlugins(record)?.['hmac-auth']
}

function getAccessKeyId(record: OpenapiApplicationItem) {
  return getHmacAuth(record)?.key_id ?? record.access_key_id ?? record.accessKeyId ?? record.ak ?? record.key ?? ''
}

function getSecretAccessKey(record: OpenapiApplicationItem) {
  return getHmacAuth(record)?.secret_key ?? record.secret_access_key ?? record.secretAccessKey ?? record.secret_key ?? record.sk ?? ''
}

function getCreatedTime(record: OpenapiApplicationItem) {
  return record.created_at ?? record.createdAt ?? record.created_time ?? record.createdTime
}

function formatDate(value: string | number | undefined) {
  if (value == null || value === '') return '-'
  const normalized = typeof value === 'number' && value < 100000000000 ? value * 1000 : value
  const date = dayjs(normalized)
  return date.isValid() ? date.format('YYYY-MM-DD') : String(value)
}

export default function OpenApiAccessKeyPage() {
  const navigate = useNavigate()
  const { copy } = useCopy()
  const [searchForm] = Form.useForm<{ name?: string }>()
  const [name, setName] = useState('')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [data, setData] = useState<OpenapiApplicationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const result = await openapiApplicationService.list({
        page,
        size,
        name: name.trim() || undefined,
      })
      const items = result?.items ?? []
      setData(items)
      setTotal(result?.total ?? items.length)
    }
    catch (error) {
      console.error('Failed to fetch openapi applications:', error)
      message.error('查询API访问密钥失败')
    }
    finally {
      setLoading(false)
    }
  }, [name, page, size])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const handleSearch = (values: { name?: string }) => {
    setName(values.name?.trim() ?? '')
    setPage(1)
  }

  const handleReset = () => {
    searchForm.resetFields()
    setName('')
    setPage(1)
  }

  const handleRefresh = () => {
    fetchList()
  }

  const handleCreate = async () => {
    setCreating(true)
    try {
      await openapiApplicationService.create()
      message.success('创建密钥成功')
      setPage(1)
      await fetchList()
    }
    catch (error) {
      console.error('Failed to create openapi application:', error)
      message.error('创建密钥失败')
    }
    finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await openapiApplicationService.delete([id])
      message.success('删除成功')
      await fetchList()
    }
    catch (error) {
      console.error('Failed to delete openapi application:', error)
      message.error('删除失败')
    }
  }

  const columns = useMemo<ColumnsType<OpenapiApplicationItem>>(() => [
    {
      title: 'Access Key ID',
      key: 'accessKeyId',
      width: 320,
      render: (_, record) => {
        const value = getAccessKeyId(record)
        return (
          <span className="openapi-access-key-value">
            <Tooltip title={value || '-'}>
              <span className="openapi-access-key-code">{value || '-'}</span>
            </Tooltip>
            {value ? (
              <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copy(value, 'Access Key ID')} />
            ) : null}
          </span>
        )
      },
    },
    {
      title: 'Secret Access Key',
      key: 'secretAccessKey',
      width: 420,
      render: (_, record) => {
        const value = getSecretAccessKey(record)
        return (
          <span className="openapi-access-key-value">
            <Tooltip title={value || '-'}>
              <span className="openapi-access-key-code">{value || '-'}</span>
            </Tooltip>
            {value ? (
              <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copy(value, 'Secret Access Key')} />
            ) : null}
          </span>
        )
      },
    },
    {
      title: '创建时间',
      key: 'createdAt',
      width: 180,
      render: (_, record) => formatDate(getCreatedTime(record)),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Popconfirm
          title="确定要删除吗？"
          okText="确定"
          cancelText="取消"
          onConfirm={() => handleDelete(record.id)}
        >
          <Button className="openapi-access-key-delete" type="link" icon={<DeleteOutlined />}>
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ], [copy])

  return (
    <Layout.Content className="openapi-access-key-page">
      <div className="openapi-access-key-header">
        <div className="openapi-access-key-title-wrap">
          <span className="openapi-access-key-icon">
            <KeyOutlined />
          </span>
          <div>
            <Title level={3} className="openapi-access-key-page-title">
              API访问密钥
            </Title>
            <Text type="secondary" className="openapi-access-key-page-desc">
              用于生成访问开放平台 API 的账号级凭证，可在开发指南中查看认证方式与调用示例。
            </Text>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-[10px]">
          {/* <Button className="openapi-access-key-doc-btn" icon={<FileTextOutlined />} onClick={() => navigate('/docs')}>
            开放平台文档
          </Button> */}
          <Button className="openapi-access-key-create-btn" type="primary" icon={<PlusOutlined />} loading={creating} onClick={handleCreate}>
            创建密钥
          </Button>
        </div>
      </div>

      <div className="openapi-access-key-table-card">
        <div className="openapi-access-key-section-title">
          <SearchOutlined />
          API访问密钥
        </div>
        <TableToolbar
          form={searchForm}
          onSearch={handleSearch}
          className="directory-dataset-toolbar openapi-access-key-toolbar"
          searchFormItems={(
            <Form.Item name="name" className="!mb-0">
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="请输入名称"
                className="directory-dataset-name-input"
                onPressEnter={() => searchForm.submit()}
              />
            </Form.Item>
          )}
          rightActions={[
            {
              key: 'refresh',
              label: '刷新',
              icon: <ReloadOutlined />,
              loading,
              onClick: handleRefresh,
            },
            {
              key: 'reset',
              label: '重置',
              onClick: handleReset,
            },
          ]}
          toolbarActions={[]}
        />
        <Table
          className="directory-dataset-table"
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          scroll={{ x: 'max-content', y: 460 }}
          pagination={getTablePagination({
            current: page,
            pageSize: size,
            total,
            showQuickJumper: true,
            showTotal: (currentTotal) => (
              <>
                共
                {currentTotal}
                {' '}
                条
              </>
            ),
            onChange: (nextPage, nextSize) => {
              setPage(nextPage)
              setSize(nextSize)
            },
          })}
          size="middle"
        />
      </div>
    </Layout.Content>
  )
}
