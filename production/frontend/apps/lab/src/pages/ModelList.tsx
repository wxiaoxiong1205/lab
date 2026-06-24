import React, { useState } from 'react'
import {
  Button,
  Col,
  Empty,
  Form,
  Input,
  Layout,
  Popconfirm,
  Row,
  Space,
  Table,
  Tabs,
  Typography,
  message,
} from 'antd'
import {
  DeleteOutlined,
  InfoCircleOutlined,
  PlusOutlined,

} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ModelService } from '@/services/modelsApi'
import { ModelTypeMapping } from '@/utils/EnumMaping'

const { Title, Text } = Typography

const ModelList: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // 状态管理
  const [searchText, setSearchText] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [activeTab, setActiveTab] = useState('my-models')

  // 模态框状态
  const [form] = Form.useForm()

  // 使用 useQuery 获取模型列表
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['models', projectId, currentPage, pageSize, searchText, activeTab],
    queryFn: async () => {
      if (!projectId) {
        throw new Error('Project ID is required')
      }

      const response = await ModelService.getBaseModelsByProjectId(Number(projectId), {
        name: searchText,
        page: currentPage,
        size: pageSize,
      })

      return response
    },
    enabled: !!projectId,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  const models = data?.items || []
  const total = data?.total || 0

  // 处理搜索
  const handleSearch = (value: string) => {
    setSearchText(value)
    setCurrentPage(1)
  }

  // 处理删除
  const handleDelete = async (modelId: string) => {
    try {
      await ModelService.deleteModel(Number(projectId), modelId)
      message.success('删除成功')
      // 重新获取数据
      queryClient.invalidateQueries({ queryKey: ['models'] })
    }
    catch (error) {
      message.error('删除失败')
    }
  }

  // 查看模型详情
  const viewModelDetail = (modelNAme: string) => {
    navigate(`/project/${projectId}/model/${modelNAme}`)
  }

  // 表格列定义
  const columns: any[] = [
    {
      title: '模型名称',
      key: 'model_name',
      dataIndex: 'model_name',
      align: 'left',
      width: 240,
      render: (modelName: string, record: any) => (
        <Text
          className="cursor-pointer text-blue-500"
          onClick={() => viewModelDetail(record.model_name)}
        >
          {modelName}
        </Text>
      ),
    },
    {
      title: '模型类型',
      dataIndex: 'model_type',
      key: 'model_type',
      align: 'left',
      width: 180,
      render: (modelType: string) => {
        return ModelTypeMapping(modelType).text
      },
    },
    {
      title: '基础模型',
      dataIndex: 'base_model_name',
      key: 'base_model_name',
      align: 'left',
      width: 240,
    },
    {
      title: '版本数量',
      dataIndex: 'version_count',
      key: 'version_count',
      align: 'left',
      width: 120,
      render: (versionCount: number) => (
        <Text type="secondary">
          {versionCount}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      align: 'left',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<InfoCircleOutlined />}
            onClick={() => viewModelDetail(record.model_name)}
          >
            详情
          </Button>

          <Popconfirm
            title="确认删除"
            description={`确定要删除模型 ${record.model_name} 吗？删除后将无法恢复。`}
            onConfirm={() => handleDelete(record.model_name)}
            okText="确认删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            placement="topLeft"
          >
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Layout.Content className="model-list-page lab-list-page-shell">
      {/* 页面标题 */}
      <Row justify="space-between" align="middle">
        <Col>
          <Title level={3} className="m-0">模型管理</Title>
        </Col>
      </Row>
      <div className="px-4 py-4">
        {/* 标签页 */}
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'my-models',
              label: '我的模型',
            },
          ]}
          size="large"
          tabBarExtraContent={(
            <Row gutter={16} justify="end">
              <Col>
                <Input.Search
                  placeholder="搜索模型名称"
                  allowClear
                  onSearch={handleSearch}
                  onChange={(e) => e.target.value === '' && handleSearch('')}
                />
              </Col>
              <Col>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => navigate(`/project/${projectId}/model/create`)}
                >
                  创建模型
                </Button>
              </Col>
            </Row>
          )}
        />

        {/* 模型表格 */}
        <Table
          columns={columns}
          dataSource={models}
          rowKey="id"
          loading={isLoading}
          pagination={{
            current: currentPage,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (page, size) => {
              setCurrentPage(page)
              setPageSize(size)
            },
            onShowSizeChange: (current, size) => {
              setCurrentPage(1)
              setPageSize(size)
            },
          }}
          scroll={{ x: 800 }}
          size="middle"
          className="h-full min-h-[400px]"
          locale={{
            emptyText: isLoading ? '加载中...' : <Empty description="您还没有创建任何模型"></Empty>,
          }}
        />
      </div>
    </Layout.Content>
  )
}

export default ModelList
