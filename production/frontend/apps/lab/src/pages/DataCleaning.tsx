import React, { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Form,
  Input,
  Layout,
  Select,
  Space,
  Table,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import debounce from 'lodash-es/debounce'
import type { ColumnsType } from 'antd/es/table'
import { cleaningService } from '@/services/cleaningService'
import type {
  CleaningTaskListResponse,
  CleaningTaskStatus,
} from '@/types/cleaning'
import { formatDateTime } from '@/utils/timeProcessing'
import { useProjectStore } from '@/stores/projectStore'
import { TrainingTaskStatusMapping } from '@/utils/EnumMaping'
import { taskExecutionService } from '@/services/taskExecutionService'
import TableActionColumn, { type TableActionItem } from '@/components/common/TableActionColumn'
import { getTablePagination } from '@/utils/tablePagination'
import WorkflowSteps from '@/components/common/WorkflowSteps'
import SvgIcon from '@/components/common/SvgIcon'
import './DataCleaning.css'

const { Title, Text } = Typography
const { Option } = Select

const cleaningSteps = [
  {
    title: '选择数据集',
    icon: <SvgIcon name="dataCleanSelect" className="h-10 w-10" />,
    description: '从平台数据管理中选择需要清洗的数据集',
  },
  {
    title: '清洗能力选择',
    icon: <SvgIcon name="dataCleanAblity" className="h-10 w-10" />,
    description: '根据数据特性及目标，选择合适的数据清洗算子',
  },
  {
    title: '清洗流程配置',
    icon: <SvgIcon name="dataCleanConfig" className="h-10 w-10" />,
    description: '在选择的清洗算子基础上，配置清洗流程',
  },
  {
    title: '清洗结果查看',
    icon: <SvgIcon name="dataCleanResult" className="h-10 w-10" />,
    description: '清洗完成后，点击详情即可查看清洗结果',
  },
]

const getCleaningStatusClassName = (status: string) => {
  const text = TrainingTaskStatusMapping(status).text
  if (text.includes('完成') || text.includes('成功')) return 'data-cleaning-status-success'
  if (text.includes('失败')) return 'data-cleaning-status-error'
  if (text.includes('启动') || text.includes('运行') || text.includes('排队') || text.includes('准备')) return 'data-cleaning-status-running'
  return 'data-cleaning-status-muted'
}

const DataCleaning: React.FC = () => {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const { currentProject } = useProjectStore()
  const queryClient = useQueryClient()
  const [searchForm] = Form.useForm()

  const [searchParams, setSearchParams] = useState<{
    name?: string
    status?: CleaningTaskStatus | null
    page: number
    size: number
  }>({
    page: 1,
    size: 10,
  })
  const [cleaningTaskStatus, setCleaningTaskStatus] = useState<any[]>([])
  const submitSearch = useMemo(
    () => debounce(() => searchForm.submit(), 300),
    [searchForm],
  )
  const debouncedNameSearch = useMemo(
    () => debounce((value: string) => {
      const name = value.trim()
      setSearchParams((prev) => ({
        ...prev,
        name: name || undefined,
        page: 1,
      }))
    }, 300),
    [],
  )
  useEffect(() => {
    return () => {
      submitSearch.cancel()
      debouncedNameSearch.cancel()
    }
  }, [debouncedNameSearch, submitSearch])

  useEffect(() => {
    const value = localStorage.getItem('projectEnumValues')
    if (value) {
      setCleaningTaskStatus(JSON.parse(value).all_enums.find((item) => item.enum_name === 'TrainingTaskStatus').options)
    }
  }, [])
  const numericProjectId = projectId ? Number(projectId) : currentProject?.id
  if (!numericProjectId) {
    message.error('未找到项目信息，请先选择一个项目')
    navigate('/home')
  }

  const { data, isLoading } = useQuery({
    queryKey: ['cleaningTasks', numericProjectId, searchParams],
    queryFn: async () => {
      if (!numericProjectId) {
        throw new Error('Project ID is required')
      }
      return await cleaningService.getTasks({
        project_id: numericProjectId,
        name: searchParams.name || undefined,
        status: searchParams.status || undefined,
        page: searchParams.page,
        size: searchParams.size,
      })
    },
    enabled: !!numericProjectId,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  const tasks = data?.items || []
  const displayTotal = data?.total || 0

  const handleSearch = (values: { name?: string, status?: CleaningTaskStatus | 'all' | null }) => {
    const name = values.name?.trim()
    setSearchParams({
      name: name || undefined,
      status: values.status && values.status !== 'all' ? values.status : null,
      page: 1,
      size: searchParams.size,
    })
  }
  const handleNameSearchChange = (value: string) => {
    debouncedNameSearch(value)
  }
  const handleReset = () => {
    submitSearch.cancel()
    debouncedNameSearch.cancel()
    searchForm.resetFields()
    setSearchParams((prev) => ({
      page: 1,
      size: prev.size,
    }))
  }

  const handlePageChange = (page: number, pageSize?: number) => {
    setSearchParams((prev) => ({
      ...prev,
      page: page || prev.page,
      size: pageSize || prev.size,
    }))
  }

  const handleCreateTask = () => {
    if (!numericProjectId) {
      message.error('未找到项目信息')
      return
    }
    navigate(`/project/${numericProjectId}/data-cleaning/create`)
  }

  const handleViewDetail = (taskId: number) => {
    if (!numericProjectId) {
      message.error('未找到项目信息')
      return
    }
    navigate(`/project/${numericProjectId}/data-cleaning/${taskId}`)
  }

  const handleEdit = (taskId: number) => {
    if (!numericProjectId) {
      message.error('未找到项目信息')
      return
    }
    navigate(`/project/${numericProjectId}/data-cleaning/create?taskId=${taskId}`)
  }

  // 判断任务是否可以编辑：只有已创建、定时待启动、失败、已终止状态才能编辑
  const canEditTask = (status: string): boolean => {
    const editableStatuses = [
      '已创建', // 已创建
      '定时待启动', // 定时待启动（中文）
      '失败', // 失败（中文）
      '已终止', // 已终止
      '终止', // 终止
    ]
    return editableStatuses.includes(status)
  }

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['cleaningTasks', numericProjectId] })
  }

  // 判断任务是否可以终止：只有排队中或运行中状态才能终止
  const canStopTask = (status: string): boolean => {
    return status === '排队中' || status === '运行中'
  }

  // 处理终止任务
  const handleStopTask = async (taskId: number) => {
    if (!numericProjectId) {
      message.error('未找到项目信息')
      return
    }
    try {
      await cleaningService.stopTask(numericProjectId, taskId)
      message.success('终止任务成功')
      queryClient.invalidateQueries({ queryKey: ['cleaningTasks', numericProjectId] })
    }
    catch {
      message.error('终止任务失败')
    }
  }

  // 判断任务是否可以启动：已创建、定时待启动、失败、已终止状态可以启动
  const canStartTask = (status: string): boolean => {
    const startableStatuses = [
      '已创建',
    ]
    return startableStatuses.includes(status)
  }

  // 处理启动任务
  const handleStartTask = async (taskId: number) => {
    if (!numericProjectId) {
      message.error('未找到项目信息')
      return
    }
    try {
      await taskExecutionService.manualStart({
        business_type: 'data_cleaning_task',
        business_id: String(taskId),
      })
      message.success('启动任务成功')
      queryClient.invalidateQueries({ queryKey: ['cleaningTasks', numericProjectId] })
    }
    catch {
      message.error('启动任务失败')
    }
  }

  // 判断任务是否可以删除：已创建、定时待启动、已完成、失败、已终止状态可以删除
  const canDeleteTask = (status: string): boolean => {
    const deletableStatuses = [
      '已创建',
      '定时待启动',
      '已完成',
      '失败',
      '已终止',
      '终止',
    ]
    return deletableStatuses.includes(status)
  }

  // 处理删除任务
  const handleDeleteTask = async (taskId: number) => {
    try {
      await cleaningService.deleteTask(taskId)
      message.success('删除任务成功')
      // 若当前页只有一条且不是第一页，删除后先切到上一页再刷新，避免出现空页
      if (tasks.length === 1 && searchParams.page > 1) {
        setSearchParams((prev) => ({ ...prev, page: prev.page - 1 }))
      }
      queryClient.invalidateQueries({ queryKey: ['cleaningTasks', numericProjectId] })
    }
    catch {
      message.error('删除任务失败')
    }
  }

  const renderDatasetNameCell = (text: string | null) => {
    if (text) return text
    return (
      <Tooltip title="该数据集版本已被删除">
        <span>-</span>
      </Tooltip>
    )
  }

  // 表格列定义
  const columns: ColumnsType<CleaningTaskListResponse> = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
      align: 'left',
      fixed: 'left',
      ellipsis: true,
      width: 120,
    },
    {
      title: '清洗状态',
      dataIndex: 'status',
      key: 'status',
      align: 'left',
      width: 100,
      render: (status: string, record: CleaningTaskListResponse) => {
        const showSchedule = status === '定时待启动' && record.schedule_at
        const statusText = (
          <span className={`data-cleaning-status ${getCleaningStatusClassName(status)}`}>
            {TrainingTaskStatusMapping(status).text}
          </span>
        )
        return showSchedule
          ? (
              <Tooltip title={`启动时间：${formatDateTime(record.schedule_at!)}`}>
                {statusText}
              </Tooltip>
            )
          : statusText
      },
    },
    {
      title: '清洗前数据集',
      dataIndex: 'input_dataset_name',
      key: 'input_dataset_name',
      align: 'left',
      ellipsis: true,
      width: 120,
      render: renderDatasetNameCell,
    },
    {
      title: '清洗后数据集',
      dataIndex: 'output_dataset_name',
      key: 'output_dataset_name',
      align: 'left',
      ellipsis: true,
      width: 120,
      render: renderDatasetNameCell,
    },
    {
      title: '创建人',
      dataIndex: 'created_by',
      key: 'created_by',
      align: 'left',
      width: 80,
      render: (text: string | null) => text || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      align: 'left',
      width: 160,
      render: (createdAt: string | null) => {
        return createdAt ? formatDateTime(createdAt) : '-'
      },
    },
    {
      title: '操作',
      key: 'action',
      align: 'left',
      fixed: 'right',
      width: 160,
      render: (_: any, record: CleaningTaskListResponse) => {
        const actions: TableActionItem[] = [
          {
            key: 'start',
            label: '启动',
            disabled: !canStartTask(record.status),
            onClick: () => handleStartTask(record.id!),
          },
          {
            key: 'edit',
            label: '编辑',
            disabled: !canEditTask(record.status),
            onClick: () => handleEdit(record.id!),
          },
          {
            key: 'delete',
            label: '删除',
            danger: true,
            visible: canDeleteTask(record.status),
            confirm: {
              title: '确认删除',
              description: `确定要删除任务 ${record.name} 吗？删除后将无法恢复。`,
              onConfirm: () => handleDeleteTask(record.id!),
              okText: '确认删除',
              cancelText: '取消',
            },
          },
          {
            key: 'stop',
            label: '终止',
            disabled: !canStopTask(record.status),
            onClick: () => handleStopTask(record.id!),
          },
          {
            key: 'view',
            label: '查看详情',
            onClick: () => handleViewDetail(record.id!),
          },
        ]
        return <TableActionColumn actions={actions} />
      },
    },
  ]

  return (
    <Layout.Content className="data-cleaning-page">
      <div>
        <Title level={3} className="data-cleaning-page-title">
          数据清洗
        </Title>
        <Text type="secondary" className="data-cleaning-page-desc">
          数据清洗功能，通过对数据进行异常清洗、文本过滤、文本去重和去除隐私信息，大幅提升数据质量，优化模型训练效果。
        </Text>
      </div>

      <WorkflowSteps steps={cleaningSteps} />

      <Form
        form={searchForm}
        layout="inline"
        onFinish={handleSearch}
        className="data-cleaning-toolbar w-full flex flex-row flex-wrap gap-0"
      >
        <Form.Item name="name">
          <Input
            prefix={<SearchOutlined />}
            placeholder="任务名称"
            allowClear
            className="data-cleaning-name-input"
            onChange={(event) => handleNameSearchChange(event.target.value)}
            onPressEnter={() => {
              debouncedNameSearch.cancel()
              searchForm.submit()
            }}
          />
        </Form.Item>
        <Form.Item name="status">
          <Select
            placeholder="清洗状态"
            className="data-cleaning-status-select"
            allowClear
            onChange={() => submitSearch()}
          >
            <Option value="all">全部状态</Option>
            {cleaningTaskStatus.map((item) => (
              <Option key={item.value} value={item.value}>{item.label}</Option>
            ))}
          </Select>
        </Form.Item>
        <div className="flex justify-end flex-1">
          <Space size={10}>
            <Button className="data-cleaning-refresh-btn" onClick={handleRefresh}>
              刷新
            </Button>
            <Button onClick={handleReset} className="w-[88px]">
              重置
            </Button>
            <Button
              className="data-cleaning-create-btn"
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreateTask}
            >
              创建清洗任务
            </Button>
          </Space>
        </div>
      </Form>

      <div className="data-cleaning-table-block">
        <Table
          className="data-cleaning-table"
          columns={columns}
          dataSource={tasks}
          rowKey="id"
          loading={isLoading}
          pagination={getTablePagination({
            total: displayTotal,
            pageSize: searchParams.size,
            current: searchParams.page,
            onChange: handlePageChange,
            showQuickJumper: true,
            showTotal: (total) => (
              <>
                共
                {total}
                {' '}
                条
              </>
            ),
          })}
          scroll={{ x: 'max-content', y: 550 }}
          size="middle"
        />
      </div>
    </Layout.Content>
  )
}

export default DataCleaning
