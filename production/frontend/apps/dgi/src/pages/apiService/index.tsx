import { useState } from 'react'
import { Button, Drawer, Form, Input, Modal, Select, Space, Table, Tooltip, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { useRequest } from 'ahooks'
import ApiDocPanel from '../API-space/[id]/components/ApiDocPanel'
import { apiService } from '@/services/apiService'
import ApiSettingModal from '@/components/apiService/apiSetting'
import { ApiStatusMap } from '@/types/enums/apiPageEnum'
import type { searchField } from '@/components/ListSearchForm'
import { ListSearchForm } from '@/components/ListSearchForm'

export interface ApiServiceData {
  id: number
  name: string
  base_url: string
  /** 列表项可能为单 url 或多 urls */
  url?: string
  urls?: string[]
  description?: string
  status: string
  logo: string
  price: number
  created_by: string
  created_at: string
  custom_attribute_values: {
    attribute_id: number
    attribute_name: string
    value: string
  }[]
}

export default function ApiService() {
  const navigate = useNavigate()

  const [settingRecord, setSettingRecord] = useState<ApiServiceData | undefined>(undefined)
  const [settingModal, setSettingModal] = useState(false)
  const [docModalOpen, setDocModalOpen] = useState(false)
  const [docApiId, setDocApiId] = useState<number | undefined>(undefined)

  const [searchParams, setSearchParams] = useState({
    page_number: 1,
    page_size: 10,
  })

  const searchFields: searchField[] = [
    {
      name: 'api_name',
      type: 'input',
      placeholder: '请输入API名称',
    },
    {
      name: 'url',
      type: 'input',
      placeholder: '请输入API地址',
    },
    // {
    //   name: 'enable_status',
    //   type: 'select',
    //   placeholder: '请选择API状态',
    //   className: '!w-40',
    //   options: [
    //     { label: '全部', value: '' },
    //     { label: '已发布', value: '1' },
    //     { label: '未发布', value: '2' },
    //   ],
    // },
  ]

  const handleSearch = (values: Record<string, any>) => {
    setSearchParams((prev) => ({
      ...prev,
      ...values,
    }))
  }

  const onReset = () => {
    setSearchParams({
      page_number: 1,
      page_size: 10,
    })
  }

  const { data: list, refresh: refreshList, loading: apiListLoading } = useRequest(
    () => apiService.getApiList(searchParams),
    {
      staleTime: 0,
      refreshDeps: [searchParams],
    },
  )

  // API测试
  const handleApiTest = (record: ApiServiceData) => {
    navigate(`/api-service/test/${record.id}`)
  }

  // 编辑
  const handleEdit = (record: ApiServiceData) => {
    navigate(`/api-service/edit/${record.id}`)
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
        apiService.deleteApi(record.id).then(() => {
          message.success('删除成功')
          refreshList()
        })
      },
    })
  }

  // 添加API
  const handleAddApi = () => {
    navigate(`/api-service/create`)
  }

  const handleSetting = (record: ApiServiceData) => {
    setSettingRecord(record)
    setSettingModal(true)
  }

  const handleViewDocument = (record: ApiServiceData) => {
    setDocApiId(record.id)
    setDocModalOpen(true)
  }

  const columns: ColumnsType<ApiServiceData> = [
    {
      title: 'API名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: 'API地址',
      dataIndex: 'urls', // 确认使用 dataIndex，否则部分表格实现 render 不会触发
      key: 'url',
      width: 300,
      ellipsis: true,
      render: (urls: string[] | undefined, record: ApiServiceData) => {
        return (
          <Tooltip title={urls?.join(';\n')}>
            <div className="block w-100 overflow-hidden text-ellipsis whitespace-nowrap">
              {urls?.join(',')}
            </div>
          </Tooltip>
        )
      },
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 220,
    },
    // {
    //   title: '状态',
    //   dataIndex: 'status',
    //   key: 'status',
    //   width: 100,
    //   render: (text: string) => {
    //     return <span>{ApiStatusMap[text]}</span>
    //   },
    // },
    {
      title: '创建人',
      dataIndex: 'created_by',
      key: 'created_by',
      width: 100,
    },
    {
      title: '创建时间',
      dataIndex: 'created_time',
      key: 'created_time',
      width: 180,
      render: (text: string) => {
        return <span>{dayjs(Number(text) * 1000).format('YYYY-MM-DD HH:mm:ss')}</span>
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 300,
      fixed: 'right' as const,
      render: (_, record) => (
        <Space size="middle">
          <a onClick={() => handleApiTest(record)}>API测试</a>
          <a onClick={() => handleEdit(record)}>编辑</a>
          <a onClick={() => handleViewDocument(record)}>接口文档</a>
          <a onClick={() => handleSetting(record)}>设置</a>
          <a onClick={() => handleDelete(record)} style={{ color: '#ff4d4f' }}>
            删除
          </a>
        </Space>
      ),
    },
  ]

  return (
    <div className="bg-white min-h-full rounded-lg p-6">
      <h2 className="text-2xl font-bold mb-4">API服务</h2>

      <div className="flex justify-between items-center mb-4">
        <ListSearchForm fields={searchFields} onSearch={handleSearch} onReset={onReset} />
        <div>
          <Button type="primary" onClick={handleAddApi} className="mb-4">添加API</Button>
          <Button type="primary" onClick={() => navigate('/api-service/attribute')} className="mb-4 ml-4">API属性</Button>
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={list?.items || []}
        loading={apiListLoading}
        pagination={{
          total: list?.total || 0,
          pageSize: searchParams.page_size,
          current: searchParams.page_number,
          showTotal: (total) => `共 ${total} 条数据`,
          showSizeChanger: true,
          showQuickJumper: false,
          pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (page, pageSize) => {
            setSearchParams((prev) => ({
              ...prev,
              page_number: page,
              page_size: pageSize,
            }))
          },
        }}
        scroll={{ x: 'max-content' }}
      />

      <Drawer
        title="接口文档"
        open={docModalOpen}
        onClose={() => setDocModalOpen(false)}
        width={1000}
        destroyOnHidden
      >
        <ApiDocPanel apiId={docApiId} />
      </Drawer>

      <ApiSettingModal
        open={settingModal}
        onCancel={() => {
          setSettingModal(false)
        }}
        data={settingRecord}
        onSuccess={() => {
          setSettingModal(false)
          refreshList()
        }}
      />
    </div>
  )
}
