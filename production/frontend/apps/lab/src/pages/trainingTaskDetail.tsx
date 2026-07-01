import React, { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, Card, Descriptions, Space, Table, Tooltip, Typography, message } from 'antd'
import { ArrowLeftOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { finetuneTaskService } from '@/services/FinetuneTrainingServices'
import { taskExecutionService } from '@/services/taskExecutionService'
import { ModelTypeMapping, TrainingMethodTypeMapping } from '@/utils/EnumMaping'
import { formatDuration } from '@/utils/timeProcessing'
import type { ModelProviderOption } from '@/types/model'
import TableActionColumn, { type TableActionItem } from '@/components/common/TableActionColumn'
import { useConfigStore } from '@/stores/configStore'

const { Title, Text } = Typography
// 状态渲染组件
const StatusIndicator: React.FC<{
  status: string
}> = ({ status }) => {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'running':
        return { color: 'blue', text: '运行中', icon: 'PlayCircleOutlined' }
      case 'completed':
        return { color: 'green', text: '已完成', icon: 'CheckCircleOutlined' }
      case 'failed':
        return { color: 'red', text: '失败', icon: 'ExclamationCircleOutlined' }
      case 'cancelled':
        return { color: 'gray', text: '已取消', icon: 'StopOutlined' }
      case 'pending':
        return { color: 'blue', text: '待运行', icon: 'PlayCircleOutlined' }
      case 'creating':
        return { color: 'blue', text: '创建中', icon: 'PlayCircleOutlined' }
      case '创建':
        return { color: 'blue', text: '创建中', icon: 'PlayCircleOutlined' }
      case '排队中':
        return { color: 'blue', text: '排队中', icon: 'PlayCircleOutlined' }
      case '准备中':
        return { color: 'blue', text: '准备中', icon: 'PlayCircleOutlined' }
      case '停止':
        return { color: 'gray', text: '已停止', icon: 'StopOutlined' }
      case '失败':
        return { color: 'red', text: '失败', icon: 'ExclamationCircleOutlined' }
      case '已完成':
        return { color: 'green', text: '已完成', icon: 'CheckCircleOutlined' }
      case '运行中':
        return { color: 'blue', text: '运行中', icon: 'PlayCircleOutlined' }
      default:
        return { color: 'default', text: status, icon: 'ExclamationCircleOutlined' }
    }
  }
  const config = getStatusConfig(status)
  return (
    <Space>
      <div className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: config.color }} />
      <span>{config.text}</span>
    </Space>
  )
}
// 可启动的状态
const STARTABLE_STATUSES = ['已创建']
// 可终止的状态
const STOPPABLE_STATUSES = ['排队中', '运行中']
const CAN_DELETE_STATUSES = ['已创建', '定时待启动', '已完成', '失败', '已终止', '终止']
const RUNNING_STATUSES = ['running', '运行中']

const getTrainingMethodText = (trainingType?: any) => {
  const method = trainingType?.train_method_type || trainingType?.training_method_type || ''
  return TrainingMethodTypeMapping(method).text || method || '-'
}

const getFineTuneTypeText = (trainingType?: any) => {
  const fineTuningType = trainingType?.fine_tuning_type || trainingType?.finetuning_type || ''
  if (fineTuningType === 'full') return '全参微调'
  if (fineTuningType === 'lora') return 'LoRA微调'
  if (fineTuningType === 'freeze') return '冻结微调'
  return fineTuningType || '-'
}
/**
 * 训练任务详情页面
 * 显示任务基本信息和版本管理
 */
const TrainingTaskDetail: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const TabKey = searchParams.get('activeTab') || 'info'
  const { projectId } = useParams<{
    projectId: string
  }>()
  const { taskName } = useParams<{
    taskName: string
  }>()
  const [taskInfo, setTaskInfo] = useState({
    name: '',
    trainType: '',
    description: '',
    version: '',
  })
  const [taskVersions, setTaskVersions] = useState<any[]>([])
  const [status, setStatus] = useState<ModelProviderOption[]>([])
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [loadingRows, setLoadingRows] = useState<Record<number, boolean>>({})
  const [now, setNow] = useState(Date.now())
  const { config, providerType } = useConfigStore()
  const isBelleProvider = config?.PROVIDER_TYPE === providerType
  useEffect(() => {
    const projectEnumValues = JSON.parse(localStorage.getItem('projectEnumValues') || '{}')
    const statusList = projectEnumValues?.all_enums?.find((item) => item.enum_name === 'TrainingTaskStatus')?.options || []
    setStatus(statusList)
  }, [])
  const queryClient = useQueryClient()
  const { data, isLoading, refetch: refetchTaskVersions } = useQuery({
    queryKey: ['finetuneRuns', projectId, taskName, selectedStatus],
    queryFn: async () => {
      const response = await finetuneTaskService.getTaskVersions(Number(projectId), taskName, selectedStatus)
      return response
    },
    enabled: !!projectId && !!taskName, // 只有当projectId和taskName都存在时才执行查询
    staleTime: 0, // 数据立即过期，每次都会重新请求
    refetchOnMount: true, // 组件挂载时重新请求
    refetchOnWindowFocus: true, // 窗口获得焦点时重新请求
  })
  const hasRunningTask = data?.some((item: any) => item.started_at && RUNNING_STATUSES.includes(item.status))
  useEffect(() => {
    if (!hasRunningTask)
      return

    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [hasRunningTask])
  const handleViewLog = (version: string) => {
    navigate(`/project/${projectId}/training/runs/${taskName}?version=${version}&&activeTab=logs`)
  }
  // 任务版本表格列定义
  const versionColumns = [
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      align: 'center',
      width: 120,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      align: 'center',
      ellipsis: true,
      minWidth: 280,
    },
    {
      title: '运行状态',
      dataIndex: 'status',
      key: 'status',
      align: 'center',
      render: (status: string, record: any) => {
        const isScheduledPending = status === '定时待启动'
        const tipTitle = isScheduledPending && record?.schedule_at
          ? `启动时间: ${dayjs(record.schedule_at).format('YYYY-MM-DD HH:mm:ss')}`
          : undefined
        const content = (
          <span className="inline-flex cursor-default">
            <StatusIndicator status={status} />
          </span>
        )
        return isScheduledPending && tipTitle ? (
          <Tooltip title={tipTitle} placement="topLeft">
            {content}
          </Tooltip>
        ) : (content)
      },
    },
    {
      title: '训练方法',
      dataIndex: 'trainingMethod',
      key: 'trainingMethod',
      align: 'center',
      width: 160,
    },
    {
      title: '微调类型',
      dataIndex: 'fineType',
      key: 'fineType',
      align: 'center',
      width: 160,
    },
    {
      title: '运行时长',
      dataIndex: 'estimated_duration',
      key: 'estimated_duration',
      align: 'center',
      render: (duration: number) => formatDuration(duration || 0),
    },
    {
      title: '创建人',
      dataIndex: 'created_by',
      key: 'created_by',
      align: 'center',
      render: (creator: string) => (
        <Space>
          <span>{creator}</span>
        </Space>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      align: 'center',
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      fixed: 'right' as const,
      render: (_, record) => {
        const status = record.status
        const isLoading = loadingRows[record.id]
        const canStart = status && STARTABLE_STATUSES.includes(status)
        const canStop = status && STOPPABLE_STATUSES.includes(status)
        const canDelete = CAN_DELETE_STATUSES.includes(status)
        const canEdit = ['已创建', '定时待启动', '失败', '已终止', '终止'].includes(status)
        const actions: TableActionItem[] = [
          {
            key: 'start',
            label: '启动',
            disabled: !canStart || isLoading,
            loading: isLoading,
            onClick: () => handleStart(record),
          },
          {
            key: 'edit',
            label: '编辑',
            visible: !isBelleProvider,
            disabled: isLoading || !canEdit,
            onClick: () => handleEdit(record),
          },
          {
            key: 'delete',
            label: '删除',
            danger: true,
            loading: isLoading,
            visible: canDelete,
            disabled: isLoading,
            confirm: {
              title: '确认删除版本',
              description: (
                <div>
                  <p>
                    确定要删除版本
                    {record.version}
                    吗？
                  </p>
                  <p className="text-red-500 mt-2">此操作不可撤销</p>
                </div>
              ),
              onConfirm: () => handleDeleteVersion(record.version),
              okText: '确定删除',
              cancelText: '取消',
            },
          },
          {
            key: 'log',
            label: '日志',
            onClick: () => handleViewLog(record.version),
          },
          {
            key: 'detail',
            label: '详情',
            onClick: () => handleViewDetail(record.version),
          },
          {
            key: 'stop',
            label: '终止',
            disabled: !canStop || isLoading,
            loading: isLoading,
            onClick: () => handleStop(record),
          },
        ]
        return <TableActionColumn actions={actions} />
      },
    },
  ]
  const handleDeleteVersion = async (version: string) => {
    if (!projectId || !taskName)
      return
    // 当只有一个版本时，不允许删除
    if (taskVersions.length === 1) {
      message.warning('至少需要保留一个版本，无法删除')
      return
    }
    try {
      // 删除前检查当前数据条数
      const currentDataLength = data?.length || 0
      await finetuneTaskService.deleteVersion(Number(projectId), taskName, version)
      message.success('版本删除成功')
      if (data && data.length === 0) {
        navigate(`/project/${projectId}/training`)
      }
      else {
        // 删除成功后重新获取数据
        queryClient.invalidateQueries({
          queryKey: ['finetuneRuns', projectId, taskName],
        })
      }
    }
    catch (error) {
      console.error('Failed to delete version:', error)
    }
  }
  const handleViewDetail = (version: string) => {
    navigate(`/project/${projectId}/training/runs/${taskName}?version=${version}`)
  }
  const handleStart = async (record: {
    id: number
  }) => {
    if (!projectId || record.id == null)
      return
    setLoadingRows((prev) => ({ ...prev, [record.id]: true }))
    try {
      await taskExecutionService.manualStart({
        business_type: 'training_task',
        business_id: String(record.id),
      })
      message.success('启动成功')
      await queryClient.invalidateQueries({ queryKey: ['finetuneRuns', projectId, taskName] })
    }
    catch (err) {
      console.error(err)
      message.error('启动失败')
    }
    finally {
      setLoadingRows((prev) => {
        const next = { ...prev }
        delete next[record.id]
        return next
      })
    }
  }
  const handleStop = async (record: {
    id: number
  }) => {
    if (!projectId || record.id == null)
      return
    setLoadingRows((prev) => ({ ...prev, [record.id]: true }))
    try {
      await finetuneTaskService.stopTask(Number(projectId), record.id)
      message.success('终止成功')
      await queryClient.invalidateQueries({ queryKey: ['finetuneRuns', projectId, taskName] })
    }
    catch (err) {
      console.error(err)
      message.error('终止失败')
    }
    finally {
      setLoadingRows((prev) => {
        const next = { ...prev }
        delete next[record.id]
        return next
      })
    }
  }
  // 监听isLoading状态，在加载期间清空taskVersions，避免显示旧数据
  useEffect(() => {
    if (isLoading) {
      setTaskVersions([])
    }
  }, [isLoading])
  useEffect(() => {
    if (data) {
      // 当data为空数组时，将taskVersions设置为空数组
      if (data.length === 0) {
        setTaskVersions([])
        return
      }
      const taskData = data[0]
      setTaskInfo({
        name: taskData.name || '',
        trainType: taskData.training_type?.train_type_category || '',
        description: taskData.description || '',
        version: taskData.version || '',
      })
      // 处理版本数据 - 根据后端数据结构
      const versions = data.map((item: any, index: number) => {
        // 计算运行时长
        const getDurationSeconds = () => {
          if (item.started_at && RUNNING_STATUSES.includes(item.status)) {
            const start = new Date(item.started_at).getTime()
            return Math.max(0, Math.floor((now - start) / 1000))
          }

          if (item.finished_at && item.started_at) {
            const start = new Date(item.started_at).getTime()
            const end = new Date(item.finished_at).getTime()
            return Math.max(0, Math.floor((end - start) / 1000))
          }

          return item.estimated_duration || 0
        }
        // 格式化创建时间
        const formatCreateTime = (dateString: string) => {
          if (!dateString)
            return ''
          const date = new Date(dateString)
          return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
        }
        return {
          id: item.id,
          key: item.id?.toString() || index.toString(),
          version: item.version || `V${index + 1}`,
          description: item.description || '无描述',
          status: item.status || '',
          created_by: item.created_by || '', // 后端数据中没有创建人信息，使用默认值
          // createTime: formatCreateTime(item.started_at),
          createTime: formatCreateTime(item.created_at) || '-',
          progress: item.progress || 0,
          estimated_duration: getDurationSeconds(),
          gpuCount: item.graphics_card_resource?.count || '--',
          schedule_at: item.schedule_at || '',
          trainingMethod: getTrainingMethodText(item.training_type),
          fineType: getFineTuneTypeText(item.training_type),
        }
      })
      setTaskVersions(versions)
    }
  }, [data, now])
  // 新增版本：使用列表最新一条数据
  const handleAddVersion = () => {
    if (!projectId || !taskName)
      return
    // 按版本号降序排列数据
    const sortedData = [...data].sort((a, b) => {
      // 提取版本号中的数字部分进行比较
      const getVersionNumber = (version: string) => {
        const match = version?.match(/V?(\d+)/)
        return match ? parseInt(match[1], 10) : 0
      }
      const versionA = getVersionNumber(a.version)
      const versionB = getVersionNumber(b.version)
      // 降序排列（版本号大的在前）
      return versionB - versionA
    })
    localStorage.setItem('taskInfo', JSON.stringify(sortedData[0]))
    navigate(`/project/${projectId}/training/create?taskName=${taskName}`)
  }
  // 编辑：完全使用当前行的数据，版本号不 +1；新增版本才做 version+1
  const handleEdit = (record: {
    id: number
  }) => {
    if (!projectId || !taskName || !data?.length)
      return
    const rawItem = data.find((d: any) => d.id === record.id)
    if (!rawItem)
      return
    localStorage.setItem('taskInfo', JSON.stringify(rawItem))
    navigate(`/project/${projectId}/training/create?taskName=${taskName}&edit=1`)
  }
  // 如果正在加载，显示加载状态
  if (isLoading) {
    return (
      <div className="p-6 bg-white min-h-screen text-center">
        <div className="mt-25">
          <div className="text-base text-gray-600">加载中...</div>
        </div>
      </div>
    )
  }
  return (
    <div className="p-6 bg-white min-h-screen">
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate(`/project/${projectId}/training`)}
        className="mb-4"
      >
        返回
      </Button>
      <Card className="border border-gray-200 rounded-md !mb-4">
        <div className="mb-4">
          <Title level={5}>任务信息</Title>
        </div>
        <Descriptions column={1} size="middle" className="p-0">
          <Descriptions.Item label="任务名称">
            <Text strong>{taskInfo.name || ''}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="训练类型">
            <Text>{ModelTypeMapping(taskInfo.trainType).text || ''}</Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>
      <Card
        className="rounded-[6px] mt-[16px]"
        style={{
          border: '1px solid #f0f0f0',
        }}
      >
        <div className="mb-4 flex justify-between items-center">
          <div className="flex items-center">
            <Title level={5} className="m-0 mr-4">任务版本</Title>
          </div>
          <div className="flex items-center gap-4">
            <Button type="default" icon={<ReloadOutlined />} onClick={() => refetchTaskVersions()}>
              刷新
            </Button>
            <Button type="default" icon={<PlusOutlined />} onClick={handleAddVersion}>
              新增版本
            </Button>
          </div>
        </div>
        <Table
          columns={versionColumns as any}
          dataSource={taskVersions}
          pagination={false}
          size="middle"
          loading={isLoading}
          scroll={{ x: 1180 }}
          className="border border-gray-200 rounded-md"
        />
      </Card>
    </div>
  )
}
export default TrainingTaskDetail
