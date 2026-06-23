import React, { useCallback, useEffect, useState } from 'react'
import type { TableColumnsType } from 'antd'
import { Form, Input, Select, Table, Tag, message } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { deleteInferenceService, inferenceServiceApi } from '../services/inferenceService'
import type { ApiResponse } from '../types/inference'
import EditServiceModal from './service/EditServiceModal.tsx'
import TableActionColumn, { type TableActionItem } from '@/components/common/TableActionColumn'
import TableToolbar from '@/components/common/TableToolbar'
import { getTablePagination } from '@/utils/tablePagination'

// 定义组件内部使用的服务数据类型
interface InferenceService {
  id: string
  service_name: string
  status: '未测试' | '测试通过' | '测试失败'
  description: string
  model_type: string[]
  creator: string
  created_time: string
}

interface SearchFormValues {
  name?: string
  status?: '未测试' | '测试通过' | '测试失败'
  model_type?: string
}

const MODEL_TYPE_OPTIONS = [
  { label: '文本生成', value: 'text-generation' },
  { label: '图像生成', value: 'image-generation' },
  { label: '图像理解', value: 'image-understanding' },
]

export default function OnlineInferenceService() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const [searchForm] = Form.useForm<SearchFormValues>()
  const [services, setServices] = useState<InferenceService[]>([])
  const [loading, setLoading] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [searchParams, setSearchParams] = useState({
    page: 1,
    size: 10,
    name: undefined as string | undefined,
    status: undefined as SearchFormValues['status'] | undefined,
    model_type: undefined as string | undefined,
  })

  // 编辑弹窗相关状态
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [currentServiceId, setCurrentServiceId] = useState<string>('')

  // 状态标签映射
  const statusMap = {
    未测试: <Tag color="blue">未测试</Tag>,
    测试通过: <Tag color="green">测试通过</Tag>,
    测试失败: <Tag color="red">测试失败</Tag>,
  }

  // 打开编辑弹窗
  const handleEdit = (record: InferenceService) => {
    setCurrentServiceId(record.id)
    setEditModalVisible(true)
  }

  // 关闭编辑弹窗
  const handleEditClose = () => {
    setEditModalVisible(false)
    setCurrentServiceId('')
  }

  // 表格列配置
  const columns: TableColumnsType<InferenceService> = [
    {
      title: '服务名称',
      dataIndex: 'service_name',
      key: 'service_name',
      align: 'left',
      fixed: 'left' as const,
      width: 150, // 设置列宽度
      ellipsis: true, // 文字溢出时显示省略号
      render: (text: string, record: InferenceService) => {
        // 限制最多显示10个字符，超过时添加省略号
        const displayText = text.length > 10 ? `${text.substring(0, 10)}...` : text
        return (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              // 查看服务详情
              navigate(`${record.id}`)
            }}
            className="overflow-hidden text-ellipsis whitespace-nowrap break-all"
            title={text}
          >
            {displayText}
          </a>
        )
      },
    },
    {
      title: '连接状态',
      dataIndex: 'status',
      key: 'status',
      align: 'left',
      render: (status: string) => statusMap[status as keyof typeof statusMap] || status,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      align: 'left',
      width: 250, // 设置列宽度
      ellipsis: true, // 文字溢出时显示省略号
      render: (text: string) => (
        <div className="max-w-[500px] overflow-hidden text-ellipsis whitespace-nowrap break-all" title={text}>
          {text}
        </div>
      ),
    },
    {
      title: '模型类型',
      dataIndex: 'model_type',
      key: 'model_type',
      align: 'left',
      width: 150, // 设置列宽度
      render: (modelTypes: string[]) => (
        <div className="flex flex-wrap gap-1">
          {modelTypes && modelTypes.length > 0 ? (
            modelTypes.map((type) => (
              <Tag key={type}>{type}</Tag>
            ))
          ) : (
            <span>-</span>
          )}
        </div>
      ),
    },
    {
      title: '创建人',
      dataIndex: 'creator',
      key: 'creator',
      align: 'left',
    },
    {
      title: '创建时间',
      dataIndex: 'created_time',
      key: 'created_time',
      align: 'left',
    },
    {
      title: '操作',
      key: 'action',
      align: 'left',
      fixed: 'right' as const,
      width: 240,
      render: (_, record: InferenceService) => {
        const actions: TableActionItem[] = [
          { key: 'view', label: '查看详情', onClick: () => navigate(`${record.id}`) },
          { key: 'edit', label: '编辑', onClick: () => handleEdit(record) },
          {
            key: 'test',
            label: '连接测试',
            loading: testingId === record.id,
            onClick: async () => {
              setTestingId(record.id)
              try {
                const result = await inferenceServiceApi.test({ id: parseInt(record.id) }, projectId)
                if (result) message.success('连接测试成功')
                else message.error('连接测试失败')
                fetchServices(searchParams)
              }
              catch (error) {
                message.error(`连接测试失败：${(error as Error).message}`)
              }
              finally {
                setTestingId(null)
              }
            },
          },
          {
            key: 'delete',
            label: '删除',
            confirm: {
              title: '确认删除',
              description: `确定要删除服务 ${record.service_name} 吗？删除后将无法恢复。`,
              okText: '确认删除',
              cancelText: '取消',
              onConfirm: async () => {
                const shouldNavigateBack = services.length === 1 && searchParams.page > 1
                await deleteInferenceService(record.id, projectId, () => {
                  if (shouldNavigateBack) setSearchParams((prev) => ({ ...prev, page: prev.page - 1 }))
                  else fetchServices()
                })
              },
            },
          },
        ]
        return <TableActionColumn actions={actions} />
      },
    },
  ]

  // 将API数据映射为组件需要的格式
  const mapApiDataToComponentFormat = (apiItems: ApiResponse['items']): InferenceService[] => {
    return apiItems.map((item) => ({
      id: item.id,
      service_name: item.name,
      status: (item.status === 'running' || item.status === '未测试' ? '未测试'
        : item.status === 'stopped' || item.status === '测试通过' ? '测试通过' : '测试失败') as '未测试' | '测试通过' | '测试失败',
      description: item.description,
      model_type: Array.isArray(item.model_type) ? item.model_type : [item.model_type],
      creator: item.created_by,
      created_time: dayjs(item.created_at).format('YYYY/MM/DD HH:mm:ss'),
    }))
  }

  // 获取在线推理服务列表
  const fetchServices = useCallback(async (params = searchParams) => {
    setLoading(true)
    try {
      // 调用实际API获取在线推理服务列表
      const response = await inferenceServiceApi.list({
        page: params.page,
        size: params.size,
        name: params.name,
        status: params.status,
        model_type: params.model_type,
        projectId,
      })
      // 将API返回的数据映射为组件需要的格式
      const formattedServices = mapApiDataToComponentFormat(response.items)
      // 确保services和total都被正确设置
      setServices(formattedServices)
      setTotal(response.total)

      // 如果当前页没有数据但总数据量大于0，且不是第一页，则自动回退到上一页
      if (formattedServices.length === 0 && response.total > 0 && params.page > 1) {
        setSearchParams((prev) => ({ ...prev, page: prev.page - 1 }))
      }
    }
    catch (error) {
      console.error('获取在线推理服务列表失败:', error)
    }
    finally {
      setLoading(false)
    }
  }, [projectId, searchParams])

  // 页面加载时获取数据
  useEffect(() => {
    fetchServices(searchParams)
  }, [fetchServices, searchParams])

  // 处理分页变化
  const handlePageChange = (page: number, size: number) => {
    setSearchParams((prev) => ({ ...prev, page, size }))
  }

  const handleSearch = (values: SearchFormValues) => {
    setSearchParams((prev) => ({
      ...prev,
      page: 1,
      name: values.name?.trim() || undefined,
      status: values.status || undefined,
      model_type: values.model_type || undefined,
    }))
  }

  const handleReset = () => {
    searchForm.resetFields()
    setSearchParams((prev) => ({
      ...prev,
      page: 1,
      name: undefined,
      status: undefined,
      model_type: undefined,
    }))
  }

  return (
    <div className="online-inference-service-container lab-list-page-shell">
      <h2 className="text-2xl font-bold mb-4">在线推理服务</h2>
      <TableToolbar
        form={searchForm}
        onSearch={handleSearch}
        searchFormItems={(
          <>
            <Form.Item name="name" className="mb-0">
              <Input
                placeholder="请输入服务名称"
                prefix={<SearchOutlined />}
                className="w-[200px]"
                allowClear
              />
            </Form.Item>
            <Form.Item name="status" className="mb-0">
              <Select
                placeholder="服务连接状态"
                className="w-[160px]"
                allowClear
                options={[
                  { label: '全部', value: '' },
                  { label: '未测试', value: '未测试' },
                  { label: '测试通过', value: '测试通过' },
                  { label: '测试失败', value: '测试失败' },
                ]}
              />
            </Form.Item>
            <Form.Item name="model_type" className="mb-0">
              <Select
                placeholder="模型类型"
                className="w-[160px]"
                allowClear
                options={MODEL_TYPE_OPTIONS}
              />
            </Form.Item>
          </>
        )}
        rightActions={[
          {
            key: 'search',
            label: '搜索',
            type: 'primary',
            onClick: () => searchForm.submit(),
          },
          {
            key: 'reset',
            label: '重置',
            onClick: handleReset,
          },
        ]}
        toolbarActions={[
          {
            key: 'create',
            label: '新建服务',
            type: 'primary',
            onClick: () => navigate('create'),
          },
        ]}
      />

      {/* 服务表格 */}
      <Table
        columns={columns}
        dataSource={services}
        rowKey={(record) => record.id}
        loading={loading}
        pagination={getTablePagination({
          total,
          current: searchParams.page,
          pageSize: searchParams.size,
          onChange: handlePageChange,
        })}
        scroll={{ x: 'max-content' }} // 设置为max-content让表格根据内容自动调整宽度
      />

      {/* 编辑弹窗组件 */}
      <EditServiceModal
        visible={editModalVisible}
        serviceId={currentServiceId}
        projectId={projectId}
        onClose={handleEditClose}
        onUpdateSuccess={() => fetchServices(searchParams)}
      />
    </div>
  )
}
