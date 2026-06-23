import React, { useEffect, useState } from 'react'
import {
  Button,
  Progress,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd'
import {
  BarChartOutlined,
  DatabaseOutlined,
  LineChartOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import type { ProjectEvaluationTaskListItem } from '@/services/modelEvaluationServices'
import { modelEvaluationServices } from '@/services/modelEvaluationServices'
import { EvaluationMethodMapping } from '@/utils/EnumMaping'
import type { TableActionItem } from '@/components/common/TableActionColumn'
import TableActionColumn from '@/components/common/TableActionColumn'
import { taskExecutionService } from '@/services/taskExecutionService'
import WorkflowSteps from '@/components/common/WorkflowSteps'
import { calculateRunningTime } from '@/utils/timeProcessing'

const autoEvaluationSteps = [
  {
    icon: <DatabaseOutlined />,
    title: '评估数据准备',
    description: '准备用于评估模型效果的数据集，并导入至训练/验证/测试模块',
  },
  {
    icon: <LineChartOutlined />,
    title: '模型推理结果生成',
    description: '使用所选评估数据集，生成模型推理结果，以便进行模型训练效果评估',
  },
  {
    icon: <BarChartOutlined />,
    title: '评估指标计算',
    description: '根据选定评估方法，自动对推理结果进行评估，并生成评估报告',
  },
]

const AutoEvaluation: React.FC<{ evaluationPrefix?: string }> = ({ evaluationPrefix }) => {
  const navigate = useNavigate()
  const { projectId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()

  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [datasetType, setDatasetType] = useState<'text-generation' | 'image-understanding' | 'business'>(
    (searchParams.get('dataset_type') as 'text-generation' | 'image-understanding') || 'text-generation',
  )

  // 查询评估任务列表
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['evaluationTasks', projectId, currentPage, pageSize, datasetType],
    queryFn: async () => {
      if (!projectId) return { items: [], total: 0 }
      const result = await modelEvaluationServices.getProjectEvaluationTasks(
        Number(projectId),
        { page: currentPage, size: pageSize, dataset_type: (evaluationPrefix === 'BUSSINESS' ? 'business' : datasetType) },
      )
      return result
    },
    staleTime: 0,
    gcTime: 0,
    enabled: !!projectId,
  })

  const dataSource = data?.items || []
  const total = data?.total || 0

  useEffect(() => {
    const urlDatasetType = searchParams.get('dataset_type') as 'text-generation' | 'image-understanding' | null
    if (urlDatasetType && (urlDatasetType === 'text-generation' || urlDatasetType === 'image-understanding')) {
      setDatasetType(urlDatasetType)
    }
    else if (!urlDatasetType) {
      const newSearchParams = new URLSearchParams(searchParams)
      newSearchParams.set('dataset_type', 'text-generation')
      setSearchParams(newSearchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // 当 evaluationPrefix 为 BUSSINESS时 防止直接更改url中dataset_type为image-understanding
  useEffect(() => {
    if (evaluationPrefix === 'BUSSINESS' && datasetType === 'image-understanding') {
      setDatasetType('text-generation')
      setCurrentPage(1)
      const newSearchParams = new URLSearchParams(searchParams)
      newSearchParams.set('dataset_type', 'text-generation')
      setSearchParams(newSearchParams, { replace: true })
    }
  }, [evaluationPrefix, datasetType, searchParams, setSearchParams])

  const handleRefresh = () => {
    refetch()
  }

  const handleViewReport = (record: ProjectEvaluationTaskListItem) => {
    if (projectId) {
      const reportTitle = record.name
      navigate(`/project/${projectId}/${evaluationPrefix === 'BUSSINESS' ? 'business-effect-evaluation' : 'effect-evaluation'}/report/${record.id}?evaluationType=auto`, {
        state: {
          taskStatus: record.status,
          evaluationType: 'auto',
        },
      })
    }
    else {
      console.error('无法获取项目ID')
    }
  }

  const handlePageChange = (page: number, size: number) => {
    setCurrentPage(page)
    setPageSize(size)
  }

  const handleDatasetTypeChange = (value: string) => {
    const newType = value as 'text-generation' | 'image-understanding'
    setDatasetType(newType)
    setCurrentPage(1)
    const newSearchParams = new URLSearchParams(searchParams)
    newSearchParams.set('dataset_type', newType)
    setSearchParams(newSearchParams, { replace: true })
  }

  const handleCloneTask = (record: ProjectEvaluationTaskListItem) => {
    if (projectId) {
      // 跳转到创建页面，传递克隆任务ID
      const basePath = evaluationPrefix === 'BUSSINESS' ? 'business-effect-evaluation' : 'effect-evaluation'
      navigate(`/project/${projectId}/${basePath}/auto/create`, {
        state: { cloneTaskId: record.id },
      })
    }
    else {
      console.error('无法获取项目ID')
    }
  }

  const handleDeleteTask = async (record: ProjectEvaluationTaskListItem) => {
    if (!projectId) {
      message.error('缺少项目ID')
      return
    }
    try {
      await modelEvaluationServices.deleteProjectEvaluationTask(Number(projectId), record.id)
      message.success('删除任务成功')

      // 如果当前页只有一条数据，删除后需要跳转到前一页
      const isLastItemOnCurrentPage = dataSource.length === 1
      if (isLastItemOnCurrentPage && currentPage > 1) {
        // 跳转到前一页，React Query 会自动重新查询
        setCurrentPage(currentPage - 1)
      }
      else {
        // 刷新当前页数据
        await refetch()
      }
    }
    catch (error) {
      message.error('删除任务失败')
    }
  }

  const handleStopTask = async (record: ProjectEvaluationTaskListItem) => {
    if (!projectId) {
      message.error('缺少项目ID')
      return
    }
    try {
      await modelEvaluationServices.stopProjectEvaluationTask(Number(projectId), record.id)
      message.success('停止任务成功')
      await refetch() // 刷新页面
    }
    catch (error) {
      message.error('停止任务失败')
    }
  }

  const handleStartTask = async (record: ProjectEvaluationTaskListItem) => {
    if (!projectId) {
      message.error('缺少项目ID')
      return
    }
    try {
      await taskExecutionService.manualStart({
        business_type: 'evaluation_task',
        business_id: String(record.id),
      })
      message.success('启动任务成功')
      await refetch() // 刷新页面
    }
    catch (error) {
      // message.error('启动任务失败');
    }
  }

  const handleEditTask = (record: ProjectEvaluationTaskListItem) => {
    if (projectId) {
      // 跳转到创建页面，传递编辑任务ID
      const basePath = evaluationPrefix === 'BUSSINESS' ? 'business-effect-evaluation' : 'effect-evaluation'
      navigate(`/project/${projectId}/${basePath}/auto/create`, {
        state: {
          editTaskId: record.id,
        },
      })
    }
    else {
      console.error('无法获取项目ID')
    }
  }

  // 根据任务状态获取操作标志
  const getTaskStatusFlags = (status: string) => {
    // 准备中：没有停止和删除操作
    const isPreparing = status === '准备中'
    // 运行中：没有删除操作
    const isRunning = status === '运行中'
    // 终止状态：展示重新评估、克隆、删除
    const isTerminated = ['终止', '已终止'].includes(status)
    // 可以停止的状态（排除准备中）
    const canStop = ['运行中', '排队中'].includes(status)
    // 可以重新评估的状态（终止状态不需要确认）
    const canRestart = ['失败', '终止', '已终止'].includes(status)
    // 可以启动的状态：已创建、定时待启动、失败、已终止
    const canStart = ['已创建'].includes(status)
    // 可以删除的状态：已创建、定时待启动、已完成、失败、已终止
    const canDelete = ['已创建', '定时待启动', '已完成', '失败', '已终止', '终止'].includes(status)

    const canEdit = ['已创建', '定时待启动', '失败', '已终止', '终止'].includes(status)

    return {
      isPreparing,
      isRunning,
      isTerminated,
      canStop,
      canRestart,
      canStart,
      canDelete,
      canEdit,
    }
  }

  const columns = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      ellipsis: true,
      render: (text: string) => (
        <Tooltip title={text} placement="topLeft">
          <div className="overflow-hidden text-ellipsis whitespace-nowrap">
            {text || '-'}
          </div>
        </Tooltip>
      ),
    },
    {
      title: '任务状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string, record: ProjectEvaluationTaskListItem) => {
        const tag = (
          <Tag color={status === '已完成' ? 'success' : 'processing'}>
            {status}
          </Tag>
        )
        const isScheduledPending = status === '定时待启动'
        const tipTitle
          = isScheduledPending && record?.schedule_at
            ? `启动时间: ${dayjs(record.schedule_at).format('YYYY-MM-DD HH:mm:ss')}`
            : undefined
        return tipTitle ? (
          <Tooltip title={tipTitle} placement="topLeft">
            {tag}
          </Tooltip>
        ) : (
          tag
        )
      },
    },
    {
      title: '运行时长',
      key: 'runningTime',
      width: 200,
      render: (_: unknown, record: ProjectEvaluationTaskListItem) => (
        <span>{calculateRunningTime(record.started_at, record.finished_at)}</span>
      ),
    },
    {
      title: '评估进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 200,
      render: (progress: number) => (
        <Progress percent={progress} />
      ),
    },
    {
      title: '推理结果集',
      dataIndex: 'inference_result_dataset_names',
      key: 'inference_result_dataset_names',
      width: 180,
      ellipsis: true,
      render: (names: string[] | undefined) => {
        if (!names || !Array.isArray(names) || names.length === 0) {
          return <span>-</span>
        }
        const content = names.join('，')
        return (
          <Tooltip title={content} placement="topLeft">
            <div className="overflow-hidden text-ellipsis whitespace-nowrap">
              {content}
            </div>
          </Tooltip>
        )
      },
    },
    {
      title: '待评估模型/服务',
      dataIndex: 'evaluated_model_names',
      key: 'evaluated_model_names',
      width: 180,
      render: (names: string[] | undefined) => {
        if (!names || !Array.isArray(names) || names.length === 0) {
          return <span>-</span>
        }
        return (
          <div className="whitespace-pre-line">
            {names.join('\n')}
          </div>
        )
      },
    },
    {
      title: '评估方法',
      dataIndex: 'evaluation_method',
      key: 'evaluation_method',
      width: 180,
      ellipsis: true,
      render: (text: string) => {
        const displayText = EvaluationMethodMapping[text] || text || '-'
        return (
          <Tooltip title={displayText} placement="topLeft">
            <div className="overflow-hidden text-ellipsis whitespace-nowrap">
              {displayText}
            </div>
          </Tooltip>
        )
      },
    },
    {
      title: '创建人',
      dataIndex: 'created_by',
      key: 'created_by',
      width: 150,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (time: string) => {
        return dayjs(time).format('YYYY-MM-DD HH:mm:ss')
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right' as const,
      render: (_: unknown, record: ProjectEvaluationTaskListItem) => {
        const status = record.status || ''
        const { canStop, canRestart, canStart, canDelete, canEdit } = getTaskStatusFlags(status)
        // 业务效果评估不展示启动、编辑能力，置灰
        const actions: TableActionItem[] = [
          {
            key: 'start',
            label: '启动',
            disabled: !canStart,
            onClick: () => handleStartTask(record),
          },
          {
            key: 'edit',
            label: '编辑',
            disabled: !canEdit,
            onClick: () => handleEditTask(record),
          },
          {
            key: 'delete',
            label: '删除',
            danger: true,
            disabled: !canDelete,
            confirm: {
              title: '确认删除',
              description: `确定要删除任务 ${record.name} 吗？删除后将无法恢复。`,
              onConfirm: () => handleDeleteTask(record),
              okText: '确认删除',
              cancelText: '取消',
            },
          },
          {
            key: 'view',
            label: '查看报告',
            onClick: () => handleViewReport(record),
          },
          {
            key: 'clone',
            label: '克隆',
            onClick: () => handleCloneTask(record),
          },
          {
            key: 'stop',
            label: '终止',
            disabled: !canStop,
            onClick: () => handleStopTask(record),
          },
        ]
        return <TableActionColumn actions={actions} />
      },
    },
  ]

  return (
    <div className="auto-evaluation-container">
      {/* 顶部卡片说明区域 */}
      <WorkflowSteps steps={autoEvaluationSteps} />

      {/* 评估任务 type 分为文本生成和图像理解 不同的表格 */}
      <div className="mb-4 flex min-h-10 items-center justify-between gap-4 overflow-visible">
        <Segmented
          className="lab-segmented-switch"
          value={datasetType}
          onChange={handleDatasetTypeChange}
          options={[
            {
              value: 'text-generation',
              label: '文本生成',
            },
            ...(evaluationPrefix !== 'BUSSINESS' ? [{
              value: 'image-understanding',
              label: '图像理解',
            }] : []),
          ]}
        />
        <Space className="shrink-0">
          <Button
            type="primary"
            onClick={() => {
              const basePath = evaluationPrefix === 'BUSSINESS' ? 'business-effect-evaluation' : 'effect-evaluation'
              navigate(`/project/${projectId}/${basePath}/auto/create?dataset_type=${datasetType}`)
            }}
          >
            创建评估任务
          </Button>
          <Button onClick={handleRefresh} loading={isFetching}>
            刷新
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={dataSource}
        loading={isLoading || isFetching}
        rowKey="id"
        pagination={{
          current: currentPage,
          pageSize,
          total,
          showSizeChanger: false,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条数据`,
          pageSizeOptions: ['10'],
          onChange: handlePageChange,
        }}
        scroll={{ x: 1400 }}
      />
    </div>
  )
}

export default AutoEvaluation
