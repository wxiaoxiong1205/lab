import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Card,
  Dropdown,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  ExperimentOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  LockOutlined,
  MoreOutlined,
  SearchOutlined,
  SecurityScanOutlined,
} from '@ant-design/icons'
import { registryService } from '../services/registryService'
import RegistryClusterBindingModal from '../components/registry/RegistryClusterBindingModal'
import type {
  AuthType,
  RegistryConfig,
  RegistryConfigQueryParams,
} from '../types'
import TableToolbar from '@/components/common/TableToolbar'
import { getTablePagination } from '@/utils/tablePagination'
import './RegistryConfigList.css'

const { Title, Text } = Typography
const { Option } = Select

/**
 * 镜像仓库配置管理页面
 */
const RegistryConfigList = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchForm] = Form.useForm()

  // 状态管理
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [testingId, setTestingId] = useState<number | null>(null)
  const [clusterModalVisible, setClusterModalVisible] = useState(false)
  const [managingRegistryId, setManagingRegistryId] = useState<number | null>(null)
  const [totalCount, setTotalCount] = useState(0) // 所有数据的总数（不受搜索影响）

  // 搜索参数
  const [searchParams, setSearchParams] = useState<RegistryConfigQueryParams>({})

  // 使用 useQuery 获取镜像仓库配置列表
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['registryConfigs', currentPage, pageSize, searchParams],
    queryFn: async () => {
      const result = await registryService.getRegistryConfigs({
        page: currentPage,
        page_size: pageSize,
        ...searchParams,
      })
      return result
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  const configs = data?.items || []
  const total = data?.total || 0
  const loading = isLoading

  // 如果没有搜索参数，说明是初始加载，保存总数为 totalCount
  React.useEffect(() => {
    if (!searchParams.search && !searchParams.auth_type && data?.total !== undefined) {
      setTotalCount(data.total)
    }
  }, [data?.total, searchParams])

  // 搜索处理
  const handleSearch = (values: Record<string, string | boolean | undefined>) => {
    const params: RegistryConfigQueryParams = {}
    if (values.search) params.search = values.search as string
    if (values.auth_type) params.auth_type = values.auth_type as AuthType

    setSearchParams(params)
    setCurrentPage(1)
  }

  // 重置搜索
  const handleResetSearch = () => {
    searchForm.resetFields()
    setSearchParams({})
    setCurrentPage(1)
  }

  // 跳转到创建页面
  const handleCreate = () => {
    navigate('/project/admin/registry/create')
  }

  // 跳转到编辑页面
  const handleEdit = (id: number, name: string) => {
    navigate(`/project/admin/registry/edit/${id}`)
  }

  // 跳转到查看详情页面
  const handleView = (id: number, name: string) => {
    navigate(`/project/admin/registry/edit/${id}?view=true`)
  }

  // 删除配置
  const handleDelete = async (id: number) => {
    try {
      await registryService.deleteRegistryConfig(id)
      message.success('删除成功')
      // 使用 queryClient 刷新数据
      queryClient.invalidateQueries({ queryKey: ['registryConfigs'] })
      // 删除后，totalCount -1
      setTotalCount((prev) => Math.max(0, prev - 1))
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : '删除失败'
      message.error(errorMessage)
    }
  }

  // 测试连接
  const handleTestConnection = async (id: number) => {
    try {
      setTestingId(id)
      const result = await registryService.testRegistryConnection(id)

      if (result.is_connected) {
        message.success('镜像仓库连接测试成功')
      }
      else {
        message.error('镜像仓库连接测试失败')
      }

      // 使用 queryClient 刷新数据以更新测试状态
      queryClient.invalidateQueries({ queryKey: ['registryConfigs'] })
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : '测试失败'
      message.error(errorMessage)
    }
    finally {
      setTestingId(null)
    }
  }

  // 管理集群绑定
  const handleManageClusters = (registryId: number) => {
    setManagingRegistryId(registryId)
    setClusterModalVisible(true)
  }

  // 表格列定义
  const columns = [
    {
      title: '仓库名称',
      dataIndex: 'name',
      key: 'name',
      width: 100,
      fixed: 'left' as const,
      render: (text: string) => (
        <Text strong>{text}</Text>
      ),
    },
    // {
    //   title: "仓库类型",
    //   dataIndex: "registry_type",
    //   key: "registry_type",
    //   render: (type: RegistryType) => {
    //     const typeMap = {
    //       volcengine: { text: "火山云", color: "blue" },
    //       private_harbor: { text: "私有Harbor", color: "purple" },
    //       dockerhub: { text: "Docker Hub", color: "cyan" },
    //       harbor: { text: "Harbor", color: "geekblue" },
    //       private: { text: "私有仓库", color: "default" },
    //       aliyun: { text: "阿里云", color: "orange" },
    //       tencent: { text: "腾讯云", color: "green" },
    //       huawei: { text: "华为云", color: "red" },
    //     };
    //     const config = typeMap[type] || { text: type, color: "default" };
    //     return <Tag color={config.color}>{config.text}</Tag>;
    //   },
    // },
    {
      title: '命名空间',
      dataIndex: 'namespace',
      key: 'namespace',
      width: 100,
      render: (text: string) => (
        <Text strong>{text}</Text>
      ),
    },
    {
      title: '仓库地址',
      dataIndex: 'repository_address',
      key: 'repository_address',
      ellipsis: true,
      width: 150,
      render: (url: string) => (
        <Tooltip title={url}>
          <Text code className="text-[12px]">{url}</Text>
        </Tooltip>
      ),
    },
    {
      title: '认证方式',
      dataIndex: 'auth_type',
      key: 'auth_type',
      width: 100,
      render: (type: AuthType) => {
        const authMap = {
          none: { text: '无需认证', color: 'default', icon: <GlobalOutlined /> },
          username_password: { text: '用户密码', color: 'blue', icon: <SecurityScanOutlined /> },
          token: { text: '访问令牌', color: 'green', icon: <LockOutlined /> },
        }
        const config = authMap[type]
        return (
          <Tag color={config.color} icon={config.icon}>
            {config.text}
          </Tag>
        )
      },
    },
    {
      title: '管理地址',
      dataIndex: 'manager_address',
      key: 'manager_address',
      width: 100,
      render: (url: string) => {
        if (!url) {
          return <Text type="secondary">未配置</Text>
        }
        return (
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            onClick={() => window.open(url, '_blank')}
            className="p-0"
          >
            查看镜像
          </Button>
        )
      },
    },

    {
      title: '绑定集群',
      key: 'cluster_count',
      width: 100,
      render: (record: RegistryConfig) => (
        <Badge
          count={record.cluster_number || 0}
          showZero
          color="blue"
        />
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string, record: RegistryConfig) => {
        // 根据状态文本确定颜色
        let color: 'success' | 'error' | 'default' = 'default'
        if (status?.includes('正常') || status?.includes('成功')) {
          color = 'success'
        }
        else if (status?.includes('失败') || status?.includes('错误')) {
          color = 'error'
        }

        return (
          <Tooltip title={`状态: ${status} | 创建人: ${record.created_by}`}>
            <Badge status={color} text={status || '未知状态'} />
          </Tooltip>
        )
      },
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right' as const,
      width: 150,
      render: (record: RegistryConfig) => {
        const hasBoundClusters = (record.cluster_number || 0) > 0
        return (
          <Space size={16} className="registry-config-actions">
            <Button
              type="link"
              icon={<ExperimentOutlined />}
              loading={testingId === record.id}
              className="registry-config-action"
              onClick={() => handleTestConnection(record.id)}
            >
              测试
            </Button>
            <Button
              type="link"
              icon={hasBoundClusters ? <InfoCircleOutlined /> : <EditOutlined />}
              className="registry-config-action"
              onClick={() => (hasBoundClusters ? handleView(record.id, record.name) : handleEdit(record.id, record.name))}
            >
              {hasBoundClusters ? '详情' : '编辑'}
            </Button>
            <Dropdown
              trigger={['hover']}
              placement="bottomRight"
              menu={{
                items: [
                  {
                    key: 'delete',
                    label: '删除',
                    icon: <DeleteOutlined />,
                    danger: true,
                    disabled: hasBoundClusters,
                    onClick: () => {
                      Modal.confirm({
                        title: '确定要删除这个仓库配置吗？',
                        content: '删除后将无法恢复，请谨慎操作。',
                        okText: '确定',
                        cancelText: '取消',
                        onOk: () => handleDelete(record.id),
                      })
                    },
                  },
                ],
              }}
            >
              <Button
                type="link"
                icon={<MoreOutlined />}
                className="registry-config-action registry-config-more-action"
                aria-label="更多操作"
              />
            </Dropdown>
          </Space>
        )
      },
    },
  ]

  return (
    <div className="registry-config-list-container lab-list-page-shell">
      <Space direction="vertical" size="large" className="w-full">
        {/* 页面标题 */}
        <div>
          <Title level={3} className="m-0">
            镜像仓库配置
          </Title>
          <Text type="secondary">
            管理和配置镜像仓库连接
          </Text>
        </div>

        <TableToolbar
          form={searchForm}
          onSearch={handleSearch}
          searchFormItems={(
            <>
              <Form.Item name="search" className="mb-0">
                <Input
                  placeholder="搜索仓库名称或描述"
                  prefix={<SearchOutlined />}
                  className="w-[250px]"
                />
              </Form.Item>
              <Form.Item name="auth_type" className="mb-0">
                <Select placeholder="认证方式" className="w-[120px]" allowClear>
                  <Option value="none">无需认证</Option>
                  <Option value="username_password">用户密码</Option>
                  <Option value="token">访问令牌</Option>
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
              onClick: handleResetSearch,
            },
          ]}
          toolbarActions={[
            {
              key: 'create',
              label: '新建配置',
              type: 'primary',
              onClick: handleCreate,
              loading,
              disabled: totalCount >= 1,
            },
            {
              key: 'refresh',
              label: '刷新',
              onClick: () => refetch(),
              loading,
            },
          ]}
        />

        {/* 配置列表 */}
        <Card className="registry-config-table-card">
          <Table
            columns={columns}
            dataSource={configs}
            rowKey="id"
            loading={loading}
            className="registry-config-table"
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
        </Card>
      </Space>

      {/* 集群绑定管理对话框 */}
      <RegistryClusterBindingModal
        open={clusterModalVisible}
        onCancel={() => setClusterModalVisible(false)}
        registryId={managingRegistryId}
        registryName={configs.find((c) => c.id === managingRegistryId)?.name}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['registryConfigs'] })}
      />
    </div>
  )
}

export default RegistryConfigList
