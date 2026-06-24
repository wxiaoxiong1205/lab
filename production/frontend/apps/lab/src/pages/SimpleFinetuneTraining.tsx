import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Input, Popconfirm, Space, Table, Typography, message } from 'antd'
import { BarChartOutlined, DatabaseOutlined, DeleteOutlined, ExperimentOutlined, InfoCircleOutlined, PlusOutlined, SearchOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import debounce from 'lodash-es/debounce'
import type { ColumnsType } from 'antd/es/table'
import { useProjectStore } from '../stores/projectStore'
import type { ExperimentRun, ExperimentRunSearchParams, ExperimentRunStatus } from '../types/experiment'
import './styles/finetune.scss'
import { finetuneTaskService } from '@/services/FinetuneTrainingServices'
import { formatDateTime, trainType } from '@/utils/timeProcessing'
import WorkflowSteps from '@/components/common/WorkflowSteps'

const { Title, Text } = Typography
// 大模型训练流程配置
const finetuneSteps = [
  {
    title: '数据准备',
    icon: <DatabaseOutlined />,
    description: '准备训练所需数据集',
  },
  {
    title: '任务创建',
    icon: <ExperimentOutlined />,
    description: '创建新的模型训练任务',
  },
  {
    title: '配置参数',
    icon: <ThunderboltOutlined />,
    description: '设置模型和训练参数',
  },
  {
    title: '分布式训练',
    icon: <BarChartOutlined />,
    description: '任务提交后，多GPU集群高效训练',
  },
]
/**
 * 简化的大模型训练管理页面
 * 直接显示项目下的所有运行记录，无实验层级
 */
const SimpleFinetuneTraining: React.FC = () => {
  const navigate = useNavigate()
  const { projectId } = useParams<{
    projectId: string
  }>()
  const { currentProject } = useProjectStore()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useState<ExperimentRunSearchParams>({
    page: 1,
    size: 10,
  })
  const [searchName, setSearchName] = useState('')
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const { data: runs, isLoading } = useQuery({
    queryKey: ['finetuneRuns', projectId, searchParams],
    queryFn: async () => {
      const response = await finetuneTaskService.get(Number(projectId), searchParams)
      return response
    },
  })
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['finetuneRuns', projectId] })
  }
  // 确保有效的项目ID
  const getProjectPath = () => {
    if (projectId) {
      return `/project/${projectId}`
    }
    if (currentProject?.id) {
      return `/project/${currentProject.id}`
    }
    message.error('未找到项目信息，请先选择一个项目')
    navigate('/projects')
    return ''
  }
  // 创建新的训练任务
  const handleCreateRun = () => {
    try {
      const basePath = getProjectPath()
      if (!basePath)
        return
      // 跳转到创建训练任务页面（简化版）
      navigate(`${basePath}/training/create`)
    }
    catch (error) {
      console.error('Navigation error:', error)
      message.error('无法创建训练任务')
    }
  }
  // 查看详情
  const handleView = (runName: string) => {
    try {
      const basePath = getProjectPath()
      if (!basePath)
        return
      navigate(`${basePath}/training/tasks/${runName}`)
    }
    catch (error) {
      console.error('Navigation error:', error)
      message.error('无法查看运行详情')
    }
  }
  // 搜索处理
  const handleSearch = useCallback((value: string) => {
    const name = value.trim()
    setSearchParams((prev) => ({
      ...prev,
      name: name || undefined,
      page: 1,
    }))
  }, [])
  const debouncedSearch = useMemo(
    () => debounce((value: string) => handleSearch(value), 300),
    [handleSearch],
  )
  useEffect(() => {
    return () => debouncedSearch.cancel()
  }, [debouncedSearch])
  const handleSearchChange = (value: string) => {
    debouncedSearch(value)
  }
  const handleReset = () => {
    debouncedSearch.cancel()
    setSearchName('')
    setSearchParams((prev) => ({
      ...prev,
      name: undefined,
      status: undefined,
      page: 1,
    }))
  }
  // 状态筛选
  const handleStatusFilter = (status: ExperimentRunStatus | 'all') => {
    setSearchParams((prev) => ({
      ...prev,
      status: status === 'all' ? undefined : [status],
      page: 1,
    }))
  }
  // 删除训练任务的功能
  const handleDeleteTask = async (taskName: string) => {
    try {
      const currentProjectId = Number(projectId)
      await finetuneTaskService.delete(currentProjectId, taskName)
      message.success('训练任务删除成功')
      queryClient.invalidateQueries({ queryKey: ['finetuneRuns', projectId] })
    }
    catch (error) {
      console.error('删除训练任务失败:', error)
    }
  }
  // 表格列定义
  const columns: ColumnsType<ExperimentRun> = [
    {
      title: '训练任务名称',
      dataIndex: 'task_name',
      key: 'task_name',
      align: 'center',
      width: 200,
    },
    {
      title: '训练类型',
      dataIndex: 'training_type_category',
      key: 'training_type_category',
      align: 'center',
      width: 120,
      render: (type: string) => {
        return trainType(type)
      },
    },
    {
      title: '版本数量',
      dataIndex: 'version_count',
      key: 'version_count',
      align: 'center',
      width: 120,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      align: 'center',
      width: 120,
      render: (createdAt: string) => {
        return formatDateTime(createdAt)
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      align: 'center',
      render: (record: ExperimentRun) => (
        <Space size="middle">
          <Button type="link" icon={<InfoCircleOutlined />} onClick={() => handleView(record.task_name)}>详情</Button>
          <Popconfirm
            title="确认删除"
            description={(
              <div>
                <p>
                  确定要删除训练任务 "
                  {record.task_name}
                  " 吗？
                </p>
                <p>此操作将删除该任务的所有版本且无法恢复。</p>
              </div>
            )}
            okText="确认删除"
            okType="danger"
            cancelText="取消"
            onConfirm={() => handleDeleteTask(record.task_name)}
            placement="topRight"
          >
            <Button type="link" icon={<DeleteOutlined />} danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]
  return (
    <div className="simple-finetune-training lab-list-page-shell">
      {/* 页面标题 */}
      <div className="mb-6">
        <Title level={3} className="mb-2">
          大模型训练
        </Title>
        <Text type="secondary">
          项目级别的大模型训练管理，支持完整的训练生命周期跟踪
        </Text>
      </div>

      {/* 训练流程介绍 */}
      <Card className="mb-6">
        <WorkflowSteps steps={finetuneSteps} />
      </Card>

      {/* 训练记录管理 */}
      <Card title={(
        <div className="flex w-full items-center justify-between">
          <div className="w-[180px] flex-none">
            <Input
              className="simple-finetune-search"
              prefix={<SearchOutlined />}
              placeholder="搜索"
              allowClear
              value={searchName}
              onChange={(event) => {
                setSearchName(event.target.value)
                handleSearchChange(event.target.value)
              }}
            />
          </div>
          <Space>
            <Button onClick={handleRefresh} className="w-[88px]">
              刷新
            </Button>
            <Button onClick={handleReset} className="w-[88px]">
              重置
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateRun}>
              创建训练任务
            </Button>
          </Space>
        </div>
      )}
      >

        {/* 批量操作 */}
        {selectedRowKeys.length > 0 && (
          <div className="mb-4">
            <Alert
              message={`已选择 ${selectedRowKeys.length} 个训练任务`}
              type="info"
              action={(
                <Space>
                  <Button size="small" onClick={() => setSelectedRowKeys([])}>
                    取消选择
                  </Button>
                  <Button size="small" type="primary">
                    批量对比
                  </Button>
                </Space>
              )}
              closable
              onClose={() => setSelectedRowKeys([])}
            />
          </div>
        )}

        {/* 训练记录表格 */}
        <Table
          columns={columns as ColumnsType<any>}
          dataSource={runs?.items || []}
          loading={isLoading}
          rowKey="task_name"
          pagination={{
            current: searchParams.page,
            pageSize: searchParams.page_size,
            total: runs?.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `共 ${total} 条`,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (page, pageSize) => {
              setSearchParams((prev) => ({
                ...prev,
                page,
                size: pageSize,
              }))
            },
          }}
          size="middle"
        />
      </Card>
    </div>
  )
}
export default SimpleFinetuneTraining
