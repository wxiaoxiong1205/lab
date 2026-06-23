import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Row,
  Select,
  Space,
  Table,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  DeleteFilled,
  EditTwoTone,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import type { RegistryMirrorImage } from '../services/RegistryMirrorService'
import { registryMirrorService } from '../services/RegistryMirrorService'
import { formatDate, formatDateTime } from '../utils/timeProcessing'
import TableToolbar from '@/components/common/TableToolbar'
import { getTablePagination } from '@/utils/tablePagination'

const { Title, Text } = Typography

/**
 * 镜像列表
 */
const RegistryMirrorList = () => {
  const navigate = useNavigate()

  // 状态管理
  const [loading, setLoading] = useState(false)
  const [configs, setConfigs] = useState<RegistryMirrorImage[]>([])
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  // 编辑加载状态
  const [editLoading, setEditLoading] = useState<number | null>(null)
  // 加载镜像仓库配置列表（override 用于搜索时强制使用第 1 页等）
  const loadConfigs = async (override?: { page?: number }) => {
    try {
      setLoading(true)
      const page = override?.page ?? currentPage
      const queryParams = {
        page,
        page_size: pageSize,
        image_name: searchForm.getFieldValue('mirror_service_name'),
        image_type: searchForm.getFieldValue('mirror_type'),
        image_source: 'built-in',
      }
      console.log(searchForm.getFieldValue('mirror_type'))
      if ((!searchForm.getFieldValue('mirror_type') && searchForm.getFieldValue('mirror_type') != 0) || searchForm.getFieldValue('mirror_type') == 'all') {
        delete queryParams.image_type
      }
      const result = await registryMirrorService.getRegistryMirrorConfigs(queryParams)

      setConfigs(result.items)
      setTotal(result.total)
    }
    catch (error) {
      message.error(error instanceof Error ? error.message : '加载镜像仓库配置失败')
      console.error('Load configs error:', error)
    }
    finally {
      setLoading(false)
    }
  }
  const { data: registryTypeEnum, isLoading: registryTypeEnumLoading } = useQuery({
    queryKey: ['registryTypeNotebookEnum'],
    queryFn: () => registryMirrorService.getRegistryTypeEnum(),
  })

  const [searchForm] = Form.useForm()
  const { Option } = Select

  // 初始化加载
  useEffect(() => {
    loadConfigs()
  }, [currentPage, pageSize])

  // 打开创建镜像页面
  const openCreateModal = () => {
    navigate('/project/admin/registry/list/create')
  }

  // 打开编辑镜像页面
  const openEditModal = (config: RegistryMirrorImage) => {
    navigate(`/project/admin/registry/list/edit/${config.id}`)
  }

  // 删除镜像
  const handleDelete = async (id: number) => {
    try {
      setLoading(true)
      await registryMirrorService.deleteRegistryImage(id)
      message.success('删除成功')
      loadConfigs()
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : '删除失败'
      message.error(errorMessage)
    }
    finally {
      setLoading(false)
    }
  }

  // 搜索（重置到第一页）
  const handleSearch = () => {
    setCurrentPage(1)
    loadConfigs({ page: 1 })
  }

  // 重置搜索条件
  const resetSearch = () => {
    searchForm.resetFields()
    loadConfigs()
  }

  // 表格列定义
  const columns = [
    {
      title: '镜像名称',
      dataIndex: 'image',
      key: 'image',
      render: (text: string) => (
        <Tooltip title={text}>
          <Text strong>{text}</Text>
        </Tooltip>
      ),
    },

    {
      title: '镜像描述',
      dataIndex: 'describe',
      key: 'describe',
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text}>
          {text}
        </Tooltip>
      ),
    },
    {
      title: '镜像分类',
      dataIndex: 'type',
      key: 'type',
      render: (type: number) => {
        return registryTypeEnum?.find((item) => item.value === type)?.label || '未知'
      },
    },
    {
      title: '镜像仓库',
      dataIndex: 'repository_name',
      key: 'repository_name',
    },
    {
      title: '命名空间',
      dataIndex: 'namespace',
      key: 'namespace',
    },
    {
      title: '添加时间',
      key: 'created_at',
      render: (record: RegistryMirrorImage) => (
        <Tooltip title={formatDateTime(record.created_at)}>
          {formatDate(record.created_at)}
        </Tooltip>
      ),
    },
    // {
    //   title: "操作",
    //   key: "action",
    //   fixed: "right" as const,
    //   align: "center",
    //   width: 160,
    //   render: (record: RegistryMirrorImage) => (
    //     <Space size="middle">
    //       <Button
    //         icon={<EditTwoTone />}
    //         size="middle"
    //         onClick={() => openEditModal(record)}
    //         loading={editLoading === record.id}
    //       >
    //       </Button>
    //       <Button
    //         icon={<DeleteFilled />}
    //         size="middle"
    //         danger
    //         onClick={() => handleDelete(record.id)}
    //       >
    //       </Button>
    //     </Space>
    //   ),
    // }
  ]

  return (
    <div className="registry-mirror-list-container lab-list-page-shell">
      <Space direction="vertical" size="large" className="w-full">
        <div>
          <Title level={3} className="m-0">
            镜像列表
          </Title>
        </div>

        <TableToolbar
          form={searchForm}
          onSearch={handleSearch}
          searchFormItems={(
            <>
              <Form.Item name="mirror_service_name" className="mb-0">
                <Input
                  placeholder="请输入镜像服务名称"
                  prefix={<SearchOutlined />}
                  className="w-[200px]"
                />
              </Form.Item>
              <Form.Item name="mirror_type" className="mb-0">
                <Select placeholder="镜像分类" className="!w-[200px]" allowClear>
                  <Option value="all">全部</Option>
                  {registryTypeEnum?.map((item) => (
                    <Option key={item.value} value={item.value}>{item.label}</Option>
                  ))}
                </Select>
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
              onClick: resetSearch,
            },
          ]}
        />

        {/* 配置列表 */}
        <div className="pb-8">
          <Table
            columns={columns as any}
            dataSource={configs}
            rowKey="id"
            loading={loading}
            pagination={getTablePagination({
              total,
              current: currentPage,
              pageSize,
              onChange: (page, size) => {
                setCurrentPage(page)
                setPageSize(size || 10)
              },
            })}
            scroll={{ x: 1200 }}
          />
        </div>
      </Space>
    </div>
  )
}

export default RegistryMirrorList
