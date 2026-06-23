import { config } from 'node:process'
import React, { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { ColumnsType } from 'antd/es/table'
import { Button, Card, Descriptions, Space, Table, Tooltip, Typography, message } from 'antd'
import { ArrowLeftOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ModelService } from '@/services/modelsApi'
import { taskExecutionService } from '@/services/taskExecutionService'
import type { ModelVersionListResponse } from '@/types/model'
import { ModelTypeMapping, TrainingTaskStatusMapping } from '@/utils/EnumMaping'
import TableActionColumn, { type TableActionItem } from '@/components/common/TableActionColumn'
import { useConfigStore } from '@/stores/configStore'

const { Title, Text } = Typography
// 状态渲染组件
const StatusIndicator: React.FC<{
  status: string
}> = ({ status }) => {
  const config = TrainingTaskStatusMapping(status)
  return (
    <Space>
      <div className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: config.color }} />
      <span>{config.text}</span>
    </Space>
  )
}
// 可启动的状态：已创建、定时待启动、失败、已终止、创建、待运行、已取消、已停止
const STARTABLE_STATUSES = ['已创建']
// 可终止的状态：排队中、运行中、准备中
const STOPPABLE_STATUSES = ['排队中', '运行中']
const CAN_DELETE_STATUSES = ['已创建', '定时待启动', '已完成', '失败', '已终止', '终止']
/**
 * 训练任务详情页面
 * 显示任务基本信息和版本管理
 */
const TrainingTaskDetail: React.FC = () => {
  const navigate = useNavigate()
  const { projectId } = useParams<{
    projectId: string
  }>()
  const { modelName } = useParams<{
    modelName: string
  }>()
  const [searchParams] = useSearchParams()
  const active = searchParams.get('activeTab')
  const [startLoadingRows, setStartLoadingRows] = useState<Record<number, boolean>>({})
  const [stopLoadingRows, setStopLoadingRows] = useState<Record<number, boolean>>({})
  const [deleteLoadingRows, setDeleteLoadingRows] = useState<Record<number, boolean>>({})
  const { config: belleConfig, providerType } = useConfigStore()
  const [taskInfo, setTaskInfo] = useState({
    name: '',
    modalType: '',
    modalNAme: '',
    description: '',
    version: '',
    task_name: '',
    task_version: '',
    training_type: '',
    model_source: '',
  })
  const [modakList, setTaskVersions] = useState([])
  const queryClient = useQueryClient()
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['modelVersions', projectId, modelName],
    queryFn: async () => {
      const response = await ModelService.getModelVersions(Number(projectId), modelName)
      return response
    },
    enabled: !!projectId && !!modelName, // 只有当projectId和taskName都存在时才执行查询
    staleTime: 0, // 数据立即过期，每次都会重新请求
    refetchOnMount: true, // 组件挂载时重新请求
    refetchOnWindowFocus: true, // 窗口获得焦点时重新请求
  })
  // 任务版本表格列定义
  const versionColumns: ColumnsType<ModelVersionListResponse> = [
    {
      title: '版本',
      dataIndex: 'model_version',
      key: 'model_version',
      align: 'left' as const,
      width: 80,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      align: 'left' as const,
      ellipsis: true,
      minWidth: 240,
      render: (description: string) => <Text>{description || '-'}</Text>,
    },
    {
      title: '版本来源',
      dataIndex: 'base_model_name',
      key: 'base_model_name',
      width: 200,
      align: 'left' as const,
      ellipsis: true,
      render: (_: unknown, record: ModelVersionListResponse) => {
        const path = record.model_source_type === 'training'
          ? `${record.task_name}>${record.task_version}>${record.checkpoint}`
          : `${record.notebook_name}>${record.notebook_path}`
        return (
          <Tooltip title={path}>
            <Text>{taskInfo?.model_source === 'training' ? '大模型训练' : '在线Notebook'}</Text>
          </Tooltip>
        )
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      align: 'left',
      render: (status: string, record: ModelVersionListResponse) => {
        if (!status)
          return <Text>-</Text>
        const isLoraRunning = record.training_type?.fine_tuning_type === 'lora' && status === '运行中'
        const scheduleAt = record.schedule_at ?? record.scheduleAt
        const hasSchedule = scheduleAt != null && scheduleAt !== '' && dayjs(scheduleAt).isValid()
        const statusContent = <StatusIndicator status={status} />
        const tooltipParts: string[] = []
        if (status === '定时待启动' && hasSchedule)
          tooltipParts.push(`启动时间: ${dayjs(scheduleAt).format('YYYY-MM-DD HH:mm:ss')}`)
        if (isLoraRunning)
          tooltipParts.push('Lora微调的适配器权重和基础模型权重合并中...')
        const tooltipTitle = tooltipParts.length > 0 ? tooltipParts.join('\n') : undefined
        return tooltipTitle ? (
          <Tooltip title={tooltipTitle}>
            <span>{statusContent}</span>
          </Tooltip>
        ) : (statusContent)
      },
    },
    {
      title: '创建人',
      dataIndex: 'created_by',
      key: 'created_by',
      align: 'left' as const,
    },
    {
      title: 'Checkpoint',
      dataIndex: 'checkpoint',
      key: 'checkpoint',
      hidden: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      hidden: true,
      render: (status: string) => <StatusIndicator status={status} />,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      align: 'left' as const,
      render: (createdAt: string) => {
        if (!createdAt)
          return '-'
        const date = new Date(createdAt)
        return date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      },
    },
    {
      title: '操作',
      key: 'action',
      align: 'left',
      fixed: 'right' as const,
      width: 240,
      render: (_, record) => {
        const status = record.status
        const type = record.training_type?.fine_tuning_type
        const isStartLoading = startLoadingRows[record.id]
        const isStopLoading = stopLoadingRows[record.id]
        const isDeleteLoading = deleteLoadingRows[record.id]
        const canStart = status && STARTABLE_STATUSES.includes(status) && type === 'lora'
        const canStop = status && STOPPABLE_STATUSES.includes(status) && type === 'lora'
        const canDelete = CAN_DELETE_STATUSES.includes(status)
        const showLogs = record.id && projectId && type === 'lora' && ['运行中', '已完成', '失败', '已终止', '终止'].includes(status)
        const editableStatuses = [
          '已创建',
          '定时待启动',
          '失败',
          '已终止',
          '终止',
        ]
        const canEdit = editableStatuses.includes(record.status)
        const isLoading = isStartLoading || isStopLoading || isDeleteLoading
        const actions: TableActionItem[] = [
          {
            key: 'start',
            label: '启动',
            disabled: !canStart || isStartLoading,
            loading: isStartLoading,
            onClick: () => handleStart(record),
          },
          {
            key: 'edit',
            label: '编辑',
            visible: belleConfig?.PROVIDER_TYPE !== providerType,
            disabled: isLoading || !canEdit,
            onClick: () => handleStartEdit(record),
          },
          {
            key: 'delete',
            label: '删除',
            danger: true,
            loading: isDeleteLoading,
            disabled: !canDelete || isDeleteLoading,
            confirm: {
              title: '确认删除版本',
              description: (
                <div>
                  <p>
                    确定要删除版本
                    {record.model_version}
                    {' '}
                    吗？
                  </p>
                  <p className="text-red-500 mt-2">此操作不可撤销</p>
                </div>
              ),
              onConfirm: () => handleDeleteVersion(record),
              okText: '确定删除',
              cancelText: '取消',
            },
          },
          {
            key: 'stop',
            label: '终止',
            disabled: !canStop || isStopLoading,
            loading: isStopLoading,
            onClick: () => handleStop(record),
          },
          {
            key: 'logs',
            label: '查看日志',
            disabled: !showLogs,
            visible: belleConfig?.PROVIDER_TYPE !== providerType,
            onClick: () => navigate(`/project/${projectId}/model/${record.id}/logs`),
          },
        ]
        return <TableActionColumn actions={actions} />
      },
    },
  ]
  // 跳转到新增版本页进行编辑（带当前版本数据回显）
  const handleStartEdit = (record: ModelVersionListResponse) => {
    if (!projectId || !modelName)
      return
    localStorage.setItem('modelDetailInfoEdit', JSON.stringify(record))
    navigate(`/project/${projectId}/model/${modelName}/create-version?taskName=${encodeURIComponent(record.task_name || '')}&edit=1`)
  }
  const handleStart = async (record: {
    id: number
  }) => {
    if (!projectId || !record.id)
      return
    setStartLoadingRows((prev) => ({ ...prev, [record.id]: true }))
    try {
      await taskExecutionService.manualStart({
        business_type: 'trained_model',
        business_id: String(record.id),
      })
      message.success('启动成功')
      await queryClient.invalidateQueries({ queryKey: ['modelVersions', projectId, modelName] })
    }
    catch (err) {
      console.error(err)
      // message.error('启动失败');
    }
    finally {
      setStartLoadingRows((prev) => {
        const next = { ...prev }
        delete next[record.id]
        return next
      })
    }
  }
  const handleStop = async (record: {
    id: number
  }) => {
    if (!projectId || !record.id)
      return
    setStopLoadingRows((prev) => ({ ...prev, [record.id]: true }))
    try {
      await ModelService.stopTrainedTask(Number(projectId), record.id)
      message.success('终止成功')
      await queryClient.invalidateQueries({ queryKey: ['modelVersions', projectId, modelName] })
    }
    catch (err) {
      console.error(err)
    }
    finally {
      setStopLoadingRows((prev) => {
        const next = { ...prev }
        delete next[record.id]
        return next
      })
    }
  }
  const handleDeleteVersion = async (record: {
    id: number
    model_version: string
  }) => {
    if (!projectId || !modelName)
      return
    const { id, model_version: version } = record
    // 当只有一个版本时，不允许删除
    if (modakList.length === 1) {
      message.warning('至少需要保留一个版本，无法删除')
      return
    }
    setDeleteLoadingRows((prev) => ({ ...prev, [id]: true }))
    try {
      await ModelService.deleteModelVersion(Number(projectId), modelName, version)
      message.success('版本删除成功')
      queryClient.invalidateQueries({
        queryKey: ['modelVersions', projectId, modelName],
      })
    }
    catch (error) {
      message.error('删除版本失败')
      console.error('Failed to delete version:', error)
    }
    finally {
      setDeleteLoadingRows((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }
  useEffect(() => {
    if (data && data.length > 0) {
      const taskData = data[0]
      console.log(taskData)
      setTaskInfo({
        name: taskData.name || '',
        modalType: taskData.model_type || '',
        modalNAme: taskData.base_model_name || '',
        description: taskData.description || '',
        version: taskData.model_version || '',
        task_name: taskData.task_name || '',
        task_version: taskData.task_version || '',
        training_type: taskData.training_type?.fine_tuning_type || '',
        model_source: taskData.model_source_type || '',
      })
      // 处理版本数据 - 根据后端数据结构
      const versions = data.map((item: ModelVersionListResponse, index: number) => ({
        ...item,
        key: item.id || index, // 使用 id 作为 key，如果没有 id 则使用索引
      }))
      setTaskVersions(versions)
    }
  }, [data])
  // 刷新版本列表
  const handleRefresh = async () => {
    await refetch()
    message.success('刷新成功')
  }
  // 新增版本
  const handleAddVersion = () => {
    if (!projectId || !modelName)
      return
    // 按版本号降序排列数据
    const sortedData = [...(data || [])].sort((a, b) => {
      // 提取版本号中的数字部分进行比较
      const getVersionNumber = (version: string) => {
        const match = version?.match(/V?(\d+)/)
        return match ? parseInt(match[1], 10) : 0
      }
      const versionA = getVersionNumber(a.model_version)
      const versionB = getVersionNumber(b.model_version)
      // 降序排列（版本号大的在前）
      return versionB - versionA
    })
    if (sortedData.length > 0) {
      localStorage.setItem('modelDetailInfo', JSON.stringify(sortedData[0]))
    }
    if (sortedData[0].model_source_type === 'training') {
      navigate(`/project/${projectId}/model/${modelName}/create-version?taskName=${sortedData[0].task_name}`)
    }
    else {
      navigate(`/project/${projectId}/model/${modelName}/create-version?notebookId=${sortedData[0].notebook_id}`)
    }
  }
  // 如果正在加载，显示加载状态
  if (isLoading) {
    return (
      <div className="p-6 bg-white min-h-screen text-center">
        <div className="mt-25">
          <div className="text-gray-600">加载中...</div>
        </div>
      </div>
    )
  }
  return (
    <div className="p-6 bg-white min-h-screen">
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate(`/project/${projectId}/model`)}
        className="mb-4"
      >
        返回
      </Button>

      <Title level={4} className="mb-4 mt-4">基本信息</Title>
      <Card className="border border-gray-200 rounded-md">
        <Descriptions column={1} size="middle">
          <Descriptions.Item label="模型名称">
            <Text strong>{taskInfo.name || ''}</Text>
          </Descriptions.Item>
          {taskInfo.model_source === 'training' && (
            <Descriptions.Item label="基础模型">
              <Text>{taskInfo.modalNAme || ''}</Text>
            </Descriptions.Item>
          )}
          <Descriptions.Item label="模型类型">
            <Text>{ModelTypeMapping(taskInfo.modalType || '').text}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="模型来源">
            <Text>{taskInfo.model_source === 'training' ? '大模型训练' : 'Notebook'}</Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>
      <Title level={4} className="mb-4 mt-8">模型版本</Title>
      <div>
        <Space className="mb-4 w-full justify-end">
          <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={isFetching}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddVersion}>
            新增版本
          </Button>
        </Space>
        <Table
          className="rounded-[6px]"
          columns={versionColumns}
          dataSource={modakList}
          pagination={false}
          size="middle"
          loading={isLoading || isFetching}
          style={{
            border: '1px solid #f0f0f0',
          }}
          rowKey="id"
        />
      </div>
    </div>
  )
}
export default TrainingTaskDetail
