import { useState } from 'react'
import { Button, Modal, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import apiService from '@/services/apiService'
import TableToolbar from '@/components/common/TableToolbar'

interface ApiServiceData {
  id: number
  name: string
  base_url: string
  description?: string
  status: string
  created_by: string
  created_at: string
}

export default function ApiService() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()

  const [searchParams, setSearchParams] = useState({
    page_num: 1,
    page_size: 10,
    name: '',
  })

  const { data: list, refetch: refetchApiList, isLoading: apiListLoading } = useQuery({
    queryKey: ['apiServiceList', projectId, searchParams],
    queryFn: () => apiService.getApiList(projectId, searchParams),
    staleTime: 0,
  })

  // API测试
  const handleApiTest = (record: ApiServiceData) => {
    navigate(`/project/${projectId}/service/api/test/${record.id}`)
  }

  // 编辑
  const handleEdit = (record: ApiServiceData) => {
    navigate(`/project/${projectId}/service/api/edit/${record.id}`)
  }

  // 删除
  const handleDelete = (record: ApiServiceData) => {
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除 ${record.name} 吗？`,
      okText: '确定',
      cancelText: '取消',
      okButtonProps: {
        danger: true,
      },
      onOk: () => {
        apiService.deleteApi(projectId, { ids: [record.id] }).then(() => {
          message.success('删除成功')
          refetchApiList()
        })
      },
    })
  }

  // 添加API
  const handleAddApi = () => {
    navigate(`/project/${projectId}/service/api/create`)
  }

  const columns = [
    {
      title: 'API名称',
      dataIndex: 'name',
      key: 'name',
      width: 120,
    },
    {
      title: 'API地址',
      dataIndex: 'base_url',
      key: 'base_url',
      width: 300,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 120,
    },
    {
      title: '连接状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
    },
    {
      title: '创建人',
      dataIndex: 'created_by',
      key: 'created_by',
      width: 100,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (text: string) => {
        return <span>{dayjs(text).format('YYYY-MM-DD HH:mm:ss')}</span>
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right' as const,
      render: (_, record) => (
        <Space size="middle">
          <a onClick={() => handleApiTest(record)}>API测试</a>
          <a onClick={() => handleEdit(record)}>编辑</a>
          <a onClick={() => handleDelete(record)} className="text-[var(--lab-color-danger)]">
            删除
          </a>
        </Space>
      ),
    },
  ]

  return (
    <div className="api-service-list-container lab-list-page-shell">
      <h2 className="text-2xl font-bold mb-4">API服务</h2>
      <TableToolbar
        toolbarActions={[
          {
            key: 'add',
            label: '添加API',
            type: 'primary',
            onClick: handleAddApi,
          },
        ]}
      />
      <Table
        columns={columns}
        dataSource={list?.items || []}
        loading={apiListLoading}
        pagination={{
          total: list?.total || 0,
          pageSize: searchParams.page_size,
          current: searchParams.page_num,
          showTotal: (total) => `共 ${total} 条数据`,
          showSizeChanger: true,
          showQuickJumper: false,
          pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (page, pageSize) => {
            setSearchParams((prev) => ({
              ...prev,
              page_num: page,
              page_size: pageSize,
            }))
          },
        }}
        scroll={{ x: 'max-content' }}
      />
    </div>
  )
}
