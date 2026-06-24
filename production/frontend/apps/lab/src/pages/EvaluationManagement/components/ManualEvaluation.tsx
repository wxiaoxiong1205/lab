import React, { useEffect, useState } from 'react'
import { Button, Modal, Progress, Segmented, Space, Table, Tag, message } from 'antd'
import { BarChartOutlined, CopyOutlined, DatabaseOutlined, DeleteOutlined, EyeOutlined, FormOutlined, LineChartOutlined, PlusOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import type { ProjectEvaluationTaskListItem } from '@/services/manualEvaluationService'
import { manualEvaluationServices } from '@/services/manualEvaluationService'
import WorkflowSteps from '@/components/common/WorkflowSteps'
import type { TableActionItem } from '@/components/common/TableActionColumn'
import TableActionColumn from '@/components/common/TableActionColumn'

const manualEvaluationSteps = [
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
    icon: <SettingOutlined />,
    title: '人工评估指标设置',
    description: '在评估指标中设置人工评估指标，如正确性、满意度、准确性等',
  },
  {
    icon: <BarChartOutlined />,
    title: '评估指标计算',
    description: '对模型结果进行人工评分，并汇总计算评估指标，产出评估报告',
  },
]
const ManualEvaluation: React.FC = () => {
  const navigate = useNavigate()
  const { projectId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [datasetType, setDatasetType] = useState<'text-generation' | 'image-understanding'>((searchParams.get('dataset_type') as 'text-generation' | 'image-understanding') || 'text-generation')
  // 同步 URL 参数
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
  // 查询评估任务列表
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['manualEvaluationTasks', projectId, currentPage, pageSize, datasetType],
    queryFn: async () => {
      if (!projectId)
        return { items: [], total: 0 }
      const result = await manualEvaluationServices.getManualEvaluationList(Number(projectId), { page: currentPage, size: pageSize, dataset_type: datasetType })
      return result
    },
    enabled: !!projectId,
  })
  const dataSource = data?.items || []
  const total = data?.total || 0
  const handleRefresh = () => {
    refetch()
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
  const handleDelete = async (taskId: number, taskName?: string) => {
    if (!projectId)
      return
    Modal.confirm({
      title: '确认删除',
      content: `确定要删除任务"${taskName || '未知任务'}"吗？删除后无法恢复。`,
      okText: '确定',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        try {
          await manualEvaluationServices.deleteManualEvaluationTask(Number(projectId), taskId)
          message.success('删除成功')
          refetch() // 刷新列表
        }
        catch (error: any) {
          console.error('删除失败:', error)
          message.error(error?.response?.data?.message || '删除失败，请重试')
        }
      },
    })
  }
  const handleClone = async (taskId: number) => {
    if (!projectId)
      return
    try {
      message.loading({ content: '正在获取任务详情...', key: 'clone' })
      const taskDetail = await manualEvaluationServices.getManualEvaluationTaskDetail(Number(projectId), taskId)
      const datasetType = taskDetail?.dataset_type || 'text-generation'
      navigate(`/project/${projectId}/effect-evaluation/manual/create?dataset_type=${datasetType}`, {
        state: { cloneData: taskDetail },
      })
      message.success({ content: '已加载任务信息', key: 'clone' })
    }
    catch (error: any) {
      console.error('获取任务详情失败:', error)
      message.error({ content: error?.response?.data?.message || '获取任务详情失败，请重试', key: 'clone' })
    }
  }
  const columns = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (text: string) => text || '-',
    },
    {
      title: '任务状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        let color = 'default'
        if (status === '已完成')
          color = 'success'
        else if (status === '评估中' || status === '报告生成中')
          color = 'processing'
        else if (status === '未评估' || status === '创建')
          color = 'warning'
        return <Tag color={color}>{status || '-'}</Tag>
      },
    },
    {
      title: '评估进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 200,
      render: (progress: number) => (<Progress percent={progress} />),
    },
    {
      title: '推理结果集',
      dataIndex: 'inference_result_dataset_names',
      key: 'inference_result_dataset_names',
      width: 180,
      render: (names: string[] | undefined) => {
        if (!names || !Array.isArray(names) || names.length === 0) {
          return <span>-</span>
        }
        return <div className="whitespace-pre-line">{names.join('\n')}</div>
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
        return <div className="whitespace-pre-line">{names.join('\n')}</div>
      },
    },
    {
      title: '创建人',
      dataIndex: 'created_by',
      key: 'created_by',
      width: 120,
      render: (text: string) => text || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (time: string) => {
        return time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : '-'
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right' as const,
      render: (_: unknown, record: ProjectEvaluationTaskListItem) => {
        const status = record.status
        const isCompleted = status === '已完成'
        const canEvaluate = status === '未评估' || status === '评估中'
        const actions: TableActionItem[] = [
          {
            key: 'view-report',
            label: '查看报告',
            icon: <EyeOutlined />,
            disabled: !isCompleted,
            onClick: () => navigate(`/project/${projectId}/effect-evaluation/report/${record.id}?evaluationType=manual`, {
              state: {
                evaluationType: 'manual',
              },
            }),
          },
          {
            key: 'evaluate',
            label: '去评估',
            icon: <FormOutlined />,
            disabled: !canEvaluate,
            onClick: () => navigate(`/project/${projectId}/effect-evaluation/manual/${record.id}`),
          },
          {
            key: 'clone',
            label: '克隆',
            icon: <CopyOutlined />,
            onClick: () => handleClone(record.id),
          },
          {
            key: 'delete',
            label: '删除',
            icon: <DeleteOutlined />,
            danger: true,
            onClick: () => handleDelete(record.id, record.name),
          },
        ]
        return <TableActionColumn actions={actions} />
      },
    },
  ]
  return (
    <div className="manual-evaluation-container">
      {/* 顶部卡片说明区域 */}
      <WorkflowSteps steps={manualEvaluationSteps} />

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
            {
              value: 'image-understanding',
              label: '图像理解',
            },
          ]}
        />
        <Space className="shrink-0">
          <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={isFetching}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/project/${projectId}/effect-evaluation/manual/create?dataset_type=${datasetType}`)}>
            创建评估任务
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
export default ManualEvaluation
