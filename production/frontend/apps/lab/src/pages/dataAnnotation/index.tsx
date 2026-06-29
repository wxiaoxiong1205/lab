import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  Layout,
  Popconfirm,
  Progress,
  Tabs,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  DeleteOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import debounce from 'lodash-es/debounce'
import { type TaskType, labelTaskService } from '../../services/dataAnnotationService'
import { OnlineAnnotationTab } from './components/OnlineAnnotationTab'
import { MultiPersonAnnotationTab } from './components/MultiPersonAnnotationTab'
import './index.css'

const { Title, Text } = Typography

export type AnnotationContentTab = 'text' | 'image-understanding' | 'image-generation'

const contentTabToDatasetType = (tab: AnnotationContentTab) => {
  if (tab === 'image-understanding') return 'image-understanding'
  if (tab === 'image-generation') return 'image-generation'
  return 'text-generation'
}

const datasetTypeToContentTab = (datasetType?: string | null): AnnotationContentTab => {
  if (datasetType === 'image-understanding') return 'image-understanding'
  if (datasetType === 'image-generation') return 'image-generation'
  return 'text'
}

// 标注任务数据类型
export interface AnnotationTask {
  id: number
  dataset_name?: string
  datasetName?: string
  dataset_type?: string
  task_name?: string
  total_samples?: number
  my_assigned_count?: number // 标注任务列表展示的数据量
  my_progress?: number // 标注任务列表展示的标注进度
  progress?: number
  saved_count?: number // 已保存数量
  assigned_count?: number // 已分配数量
  creator?: string
  created_at?: string
  /** 多人标注任务列表：当前用户分配的截止时间 */
  deadline?: string | null
  created_by?: string
  task_type?: TaskType
  status?: string // 任务状态
  source_dataset_name?: string // 数据来源
  submit_dataset_name?: string // 标注后数据集
}

// 工作流步骤项类型
export interface WorkflowStepItem {
  icon: React.ReactNode
  title: string
  description: string
}

// 多人标注 Tab 内容
export interface MultiPersonAnnotationTabProps {
  showOverviewTab: boolean | null
  columns: ColumnsType<AnnotationTask>
  taskList: AnnotationTask[]
  loading: boolean
  pagination: { current: number, pageSize: number, total: number }
  fetchTaskList: (page: number, pageSize: number) => void
  overviewList: Record<string, unknown>[]
  overviewLoading: boolean
  overviewPagination: { current: number, pageSize: number, total: number }
  fetchOverview: (page: number, pageSize: number) => void
  auditList: Record<string, unknown>[]
  auditLoading: boolean
  auditPagination: { current: number, pageSize: number, total: number }
  fetchAudit: (page: number, pageSize: number) => void
  handleRefresh: () => void
  handleCreateTask: () => void
  onViewDataList: (record: Record<string, unknown>) => void
  onPublishTask?: (record: Record<string, unknown>) => Promise<void>
  publishingTaskId?: number | null
  /** 审核任务 tab 的「详情」：跳转到标注详情页（AnnotationDetail）做审核，用 audit 接口 */
  onViewAuditDetail?: (record: Record<string, unknown>) => void
  onViewTaskMembers?: (record: Record<string, unknown>) => void
  onDeleteTask?: (record: Record<string, unknown>) => void
  /** 多人子 Tab（与 URL sub_tab 同步，刷新不丢失） */
  multiSubTab: 'overview' | 'task' | 'review'
  onMultiSubTabChange: (key: 'overview' | 'task' | 'review') => void
  searchValue: string
  onSearchChange: (value: string) => void
  onSearchPressEnter: () => void
  onSearchReset: () => void
}

// 任务列表表格（复用）
export interface TaskListTableProps {
  columns: ColumnsType<AnnotationTask>
  taskList: AnnotationTask[]
  loading: boolean
  pagination: { current: number, pageSize: number, total: number }
  fetchTaskList: (page: number, pageSize: number) => void
  toolbarExtra?: React.ReactNode
  searchPlaceholder?: string
  searchValue?: string
  onSearchChange?: (value: string) => void
  onSearchPressEnter?: () => void
}

// 在线标注 Tab 内容
export interface OnlineAnnotationTabProps {
  contentTab: AnnotationContentTab
  setContentTab: (tab: AnnotationContentTab) => void
  searchParams: URLSearchParams
  setSearchParams: (params: URLSearchParams, opts?: { replace?: boolean }) => void
  columns: ColumnsType<AnnotationTask>
  taskList: AnnotationTask[]
  loading: boolean
  pagination: { current: number, pageSize: number, total: number }
  fetchTaskList: (page: number, pageSize: number) => void
  handleRefresh: () => void
  handleCreateTask: () => void
  searchValue: string
  onSearchChange: (value: string) => void
  onSearchPressEnter: () => void
  onSearchReset: () => void
}

const DataAnnotation: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // 主标签页状态（'multi-person' 为 UI 展示用，请求时转为 'multi_person'），与 URL tab 同步
  const tabFromUrl = searchParams.get('tab') as 'online' | 'multi-person' | null
  const [mainTab, setMainTab] = useState<'online' | 'multi-person'>(tabFromUrl === 'multi-person' ? 'multi-person' : 'online')
  // 多人标注子 Tab：与 URL sub_tab 同步，刷新不丢失
  const subTabFromUrl = searchParams.get('sub_tab') as 'overview' | 'task' | 'review' | null
  const [multiSubTab, setMultiSubTab] = useState<'overview' | 'task' | 'review'>(
    subTabFromUrl && ['overview', 'task', 'review'].includes(subTabFromUrl) ? subTabFromUrl : 'overview',
  )
  // 内容标签页状态
  const [contentTab, setContentTab] = useState<AnnotationContentTab>(datasetTypeToContentTab(searchParams.get('dataset_type')))

  // 数据状态
  const [loading, setLoading] = useState(false)
  const [taskList, setTaskList] = useState<AnnotationTask[]>([])
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  })
  const [onlineTaskNameInput, setOnlineTaskNameInput] = useState('')
  const [onlineTaskName, setOnlineTaskName] = useState('')
  const [multiTaskNameInput, setMultiTaskNameInput] = useState('')
  const [multiTaskName, setMultiTaskName] = useState('')
  // 多人标注：任务总览、审核任务
  const [overviewList, setOverviewList] = useState<Record<string, unknown>[]>([])
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewPagination, setOverviewPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [auditList, setAuditList] = useState<Record<string, unknown>[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditPagination, setAuditPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [publishingTaskId, setPublishingTaskId] = useState<number | null>(null)
  const [canAccessMultiLabelOverview, setCanAccessMultiLabelOverview] = useState<boolean | null>(null)
  const debouncedOnlineTaskNameSearch = useMemo(
    () => debounce((value: string) => {
      setOnlineTaskName(value.trim())
    }, 300),
    [],
  )
  const debouncedMultiTaskNameSearch = useMemo(
    () => debounce((value: string) => {
      setMultiTaskName(value.trim())
    }, 300),
    [],
  )

  // 获取任务列表：在线标注用 getList；多人标注的「标注任务」用 getMultiLabelAnnotationTaskList
  const fetchTaskList = useCallback(async (page: number = 1, size: number = 10) => {
    if (!projectId) {
      return
    }
    setLoading(true)
    try {
      let response: { total: number, items: AnnotationTask[] }
      if (mainTab === 'multi-person') {
        response = await labelTaskService.getMultiLabelAnnotationTaskList({
          project_id: Number(projectId),
          task_name: multiTaskName || undefined,
          page,
          size,
        })
      }
      else {
        const params: Parameters<typeof labelTaskService.getList>[0] = {
          project_id: Number(projectId),
          task_type: 'online',
          task_name: onlineTaskName || undefined,
          page,
          size,
          dataset_type: contentTabToDatasetType(contentTab),
        }
        response = await labelTaskService.getList(params)
      }
      const { total, items } = response
      setTaskList(items ?? [])
      setPagination({
        current: page,
        pageSize: size,
        total: total ?? 0,
      })
    }
    catch (_error) {
      setTaskList([])
    }
    finally {
      setLoading(false)
    }
  }, [projectId, mainTab, multiTaskName, onlineTaskName, contentTab])

  const handleOnlineTaskNameChange = useCallback((value: string) => {
    setOnlineTaskNameInput(value)
    debouncedOnlineTaskNameSearch(value)
  }, [debouncedOnlineTaskNameSearch])

  const handleOnlineTaskNamePressEnter = useCallback(() => {
    debouncedOnlineTaskNameSearch.cancel()
    setOnlineTaskName(onlineTaskNameInput.trim())
  }, [debouncedOnlineTaskNameSearch, onlineTaskNameInput])

  const handleOnlineTaskNameReset = useCallback(() => {
    debouncedOnlineTaskNameSearch.cancel()
    setOnlineTaskNameInput('')
    setOnlineTaskName('')
  }, [debouncedOnlineTaskNameSearch])

  const handleMultiTaskNameChange = useCallback((value: string) => {
    setMultiTaskNameInput(value)
    debouncedMultiTaskNameSearch(value)
  }, [debouncedMultiTaskNameSearch])

  const handleMultiTaskNamePressEnter = useCallback(() => {
    debouncedMultiTaskNameSearch.cancel()
    setMultiTaskName(multiTaskNameInput.trim())
  }, [debouncedMultiTaskNameSearch, multiTaskNameInput])

  const handleMultiTaskNameReset = useCallback(() => {
    debouncedMultiTaskNameSearch.cancel()
    setMultiTaskNameInput('')
    setMultiTaskName('')
  }, [debouncedMultiTaskNameSearch])

  useEffect(() => {
    return () => {
      debouncedOnlineTaskNameSearch.cancel()
      debouncedMultiTaskNameSearch.cancel()
    }
  }, [debouncedMultiTaskNameSearch, debouncedOnlineTaskNameSearch])

  // 多人标注：任务总览列表
  const fetchOverview = useCallback(async (page: number = 1, size: number = 10) => {
    if (!projectId) return
    setOverviewLoading(true)
    try {
      const res = await labelTaskService.getMultiLabelTaskOverview({
        project_id: Number(projectId),
        task_name: multiTaskName || undefined,
        page,
        size,
      })
      setOverviewList((res?.items ?? []) as Record<string, unknown>[])
      setOverviewPagination({
        current: page,
        pageSize: size,
        total: res?.total ?? 0,
      })
    }
    catch {
      setOverviewList([])
    }
    finally {
      setOverviewLoading(false)
    }
  }, [projectId, multiTaskName])

  // 多人标注：审核任务列表
  const fetchAudit = useCallback(async (page: number = 1, size: number = 10) => {
    if (!projectId) return
    setAuditLoading(true)
    try {
      const res = await labelTaskService.getMultiLabelAuditTaskList({
        project_id: Number(projectId),
        task_name: multiTaskName || undefined,
        page,
        size,
      })
      setAuditList((res?.items ?? []) as Record<string, unknown>[])
      setAuditPagination({
        current: page,
        pageSize: size,
        total: res?.total ?? 0,
      })
    }
    catch {
      setAuditList([])
    }
    finally {
      setAuditLoading(false)
    }
  }, [projectId, multiTaskName])

  const fetchMultiLabelAdminAccess = useCallback(async () => {
    if (!projectId) return
    try {
      const res = await labelTaskService.getMultiLabelAdminAccess(Number(projectId))
      setCanAccessMultiLabelOverview(Boolean(res?.can_access))
    }
    catch {
      setCanAccessMultiLabelOverview(false)
    }
  }, [projectId])

  // 从 URL 同步主 Tab、多人子 Tab、内容 Tab，保证刷新或从详情返回不丢失
  useEffect(() => {
    const urlTab = searchParams.get('tab') as 'online' | 'multi-person' | null
    if (urlTab === 'multi-person') {
      setMainTab('multi-person')
      const urlSubTab = searchParams.get('sub_tab') as 'overview' | 'task' | 'review' | null
      if (urlSubTab && ['overview', 'task', 'review'].includes(urlSubTab)) {
        setMultiSubTab(urlSubTab)
      }
    }
    else if (urlTab === 'online') {
      setMainTab('online')
    }

    const urlDatasetType = searchParams.get('dataset_type')
    if (urlDatasetType === 'image-understanding' || urlDatasetType === 'image-generation') {
      setContentTab(datasetTypeToContentTab(urlDatasetType))
    }
    else if (urlDatasetType === 'text-generation' || !urlDatasetType) {
      if (!urlDatasetType) {
        const newSearchParams = new URLSearchParams(searchParams)
        newSearchParams.set('dataset_type', 'text-generation')
        setSearchParams(newSearchParams, { replace: true })
      }
      setContentTab('text')
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (projectId) {
      fetchMultiLabelAdminAccess()
    }
  }, [projectId, fetchMultiLabelAdminAccess])

  useEffect(() => {
    if (mainTab !== 'multi-person') return
    if (canAccessMultiLabelOverview == null) return
    if (canAccessMultiLabelOverview || multiSubTab !== 'overview') return

    setMultiSubTab('task')
    const next = new URLSearchParams(searchParams)
    next.set('tab', 'multi-person')
    next.set('sub_tab', 'task')
    setSearchParams(next, { replace: true })
  }, [canAccessMultiLabelOverview, mainTab, multiSubTab, searchParams, setSearchParams])

  // 初始化加载数据
  useEffect(() => {
    if (projectId) {
      fetchTaskList(1, pagination.pageSize)
      if (mainTab === 'multi-person') {
        if (canAccessMultiLabelOverview) {
          fetchOverview(1, overviewPagination.pageSize)
        }
        fetchAudit(1, auditPagination.pageSize)
      }
    }
  }, [projectId, fetchTaskList, pagination.pageSize, mainTab, fetchOverview, fetchAudit, overviewPagination.pageSize, auditPagination.pageSize, canAccessMultiLabelOverview])

  // 刷新数据
  const handleRefresh = () => {
    fetchTaskList(pagination.current, pagination.pageSize)
  }

  // 多人子 Tab 切换时同步到 URL，并重新拉取当前 Tab 对应列表
  const handleMultiSubTabChange = useCallback((key: 'overview' | 'task' | 'review') => {
    setMultiSubTab(key)
    const next = new URLSearchParams(searchParams)
    next.set('tab', 'multi-person')
    next.set('sub_tab', key)
    setSearchParams(next, { replace: true })

    if (key === 'overview' && canAccessMultiLabelOverview) {
      fetchOverview(overviewPagination.current, overviewPagination.pageSize)
    }
    else if (key === 'task') {
      fetchTaskList(pagination.current, pagination.pageSize)
    }
    else if (key === 'review') {
      fetchAudit(auditPagination.current, auditPagination.pageSize)
    }
  }, [
    searchParams,
    setSearchParams,
    canAccessMultiLabelOverview,
    fetchOverview,
    overviewPagination,
    fetchTaskList,
    pagination,
    fetchAudit,
    auditPagination,
  ])

  // 创建标注任务：在线标注和多人标注都使用页面创建流程
  const handleCreateTask = () => {
    if (mainTab === 'multi-person') {
      navigate(`/project/${projectId}/data-annotation/create-multi-person`)
      return
    }
    navigate(`/project/${projectId}/data-annotation/create?dataset_type=${contentTabToDatasetType(contentTab)}`)
  }

  const inferContentTabFromRecord = useCallback((record: Record<string, unknown> | AnnotationTask): AnnotationContentTab => {
    const datasetType = record?.dataset_type
      ?? ((record as { dataset?: { dataset_type?: string } })?.dataset?.dataset_type)
      ?? ((record as { source_dataset_type?: string })?.source_dataset_type)

    return datasetTypeToContentTab(String(datasetType || ''))
  }, [])

  // 查看详情（在线标注传 contentTab，多人标注传 isMultiPerson）；来源写入 URL，刷新不丢失
  const handleViewDetail = useCallback((record: AnnotationTask) => {
    const from = mainTab === 'multi-person' ? 'multi-person' : 'online'
    const content = mainTab === 'online' ? contentTab : inferContentTabFromRecord(record)
    const q = new URLSearchParams({ from, content })
    navigate(`/project/${projectId}/data-annotation/${record.id}?${q.toString()}`, {
      state: {
        taskName: record.datasetName || record.dataset_name,
        contentTab: content,
        isMultiPerson: mainTab === 'multi-person',
      },
    })
  }, [projectId, navigate, mainTab, contentTab, inferContentTabFromRecord])

  // 多人标注：点击「详情」进入对话文本集合列表页；来源写入 URL，刷新不丢失
  const handleViewDataList = useCallback((record: Record<string, unknown>) => {
    const id = record.id as number | undefined
    if (id == null) return
    const q = new URLSearchParams({ from: 'multi-person', sub_tab: multiSubTab })
    if (record.status != null && record.status !== '') q.set('status', String(record.status))
    navigate(`/project/${projectId}/data-annotation/data-list/${id}?${q.toString()}`, {
      state: {
        taskName: record.task_name,
      },
    })
  }, [projectId, navigate, multiSubTab])

  // 审核员：点击「详情」进入标注详情页（AnnotationDetail）做审核；来源写入 URL，刷新不丢失
  const handleViewAuditDetail = useCallback((record: Record<string, unknown>) => {
    const id = record.id as number | undefined
    if (id == null) return
    const content = inferContentTabFromRecord(record)
    const q = new URLSearchParams({ from: 'multi-person', audit: '1', content, sub_tab: 'review' })
    navigate(`/project/${projectId}/data-annotation/${id}?${q.toString()}`, {
      state: {
        taskName: record.task_name,
        contentTab: content,
        isMultiPerson: true,
        isAuditMode: true,
      },
    })
  }, [projectId, navigate, inferContentTabFromRecord])

  // 多人标注：点击「任务成员」进入任务成员详情页；来源写入 URL，刷新不丢失
  const handleViewTaskMembers = useCallback(
    (record: Record<string, unknown>) => {
      const id = record.id as number | undefined
      if (id == null) return
      const q = new URLSearchParams({ from: 'multi-person', sub_tab: multiSubTab })
      navigate(`/project/${projectId}/data-annotation/task-members/${id}?${q.toString()}`, {
        state: {
          taskName: record.task_name,
        },
      })
    },
    [projectId, navigate, multiSubTab],
  )

  // 多人标注：删除任务（二次确认后调用接口并刷新总览）
  const handleDeleteMultiLabelTask = useCallback(async (record: Record<string, unknown>) => {
    const taskId = record.id as number | undefined
    if (taskId == null || !projectId) return
    try {
      await labelTaskService.deleteMultiLabelTask(Number(projectId), Number(taskId))
      message.success('删除成功')
      fetchOverview(overviewPagination.current, overviewPagination.pageSize)
    }
    catch (e: unknown) {
      // message.error(e instanceof Error ? e.message : '删除失败')
    }
  }, [projectId, fetchOverview, overviewPagination])

  // 删除任务
  const handlePublishMultiLabelTask = useCallback(async (record: Record<string, unknown>) => {
    const taskId = Number(record.id)
    if (!projectId || !Number.isFinite(taskId)) return

    setPublishingTaskId(taskId)
    try {
      await labelTaskService.publishMultiLabelTask(Number(projectId), taskId)
      message.success('发布成功')
      await Promise.all([
        fetchOverview(overviewPagination.current, overviewPagination.pageSize),
        fetchTaskList(pagination.current, pagination.pageSize),
      ])
    }
    catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '发布失败')
    }
    finally {
      setPublishingTaskId(null)
    }
  }, [projectId, fetchOverview, overviewPagination, fetchTaskList, pagination])

  const handleDelete = useCallback(async (record: AnnotationTask) => {
    try {
      await labelTaskService.delete(record.id)
      message.success('删除成功')
      // 计算删除后的总数据量
      const newTotal = pagination.total - 1
      // 计算删除后应该显示的页码（如果最后一页没数据了，跳转到上一页）
      const maxPage = Math.max(1, Math.ceil(newTotal / pagination.pageSize))
      const targetPage = Math.min(pagination.current, maxPage)
      // 重新获取数据
      fetchTaskList(targetPage, pagination.pageSize)
    }
    catch (error: any) {
      // message.error(error?.message || '删除失败');
    }
  }, [fetchTaskList, pagination.current, pagination.pageSize, pagination.total])

  // 表格列定义
  const columns: ColumnsType<AnnotationTask> = [
    {
      title: '任务名称',
      dataIndex: 'task_name',
      key: 'task_name',
      align: 'left',
      width: 120,
      fixed: 'left',
      ellipsis: true,
      render: (task_name: string) => {
        const text = task_name || '-'
        return (
          <Tooltip title={text}>
            <span className="block overflow-hidden text-ellipsis whitespace-nowrap max-w-[180px]">
              {text}
            </span>
          </Tooltip>
        )
      },
    },
    {
      title: '数据量',
      dataIndex: mainTab !== 'multi-person' ? 'total_samples' : 'my_assigned_count',
      key: mainTab !== 'multi-person' ? 'total_samples' : 'my_assigned_count',
      align: 'left',
      width: 80,
    },
    {
      title: '标注进度',
      dataIndex: 'my_progress',
      key: 'my_progress',
      align: 'left',
      width: 120,
      render: (myProgress: number, record) => {
        const progress = mainTab !== 'multi-person'
          ? Math.round(((record?.saved_count ?? 0) / Math.max(record?.total_samples ?? 0, 1)) * 100)
          : (myProgress ?? 0)
        return (
          <div className="flex items-center justify-start gap-2">
            <div className="w-[150px]">
              <Progress
                percent={progress}
                size="small"
                strokeColor={{ '0%': 'rgba(0,84,221,1)', '100%': 'rgba(82,133,247,1)' }}
              />
            </div>
          </div>
        )
      },
    },
    {
      title: '标注前数据集',
      dataIndex: 'source_dataset_name',
      key: 'source_dataset_name',
      align: 'left',
      width: 120,
      ellipsis: true,
      render: (source_dataset_name: string) => {
        const text = source_dataset_name || '-'
        return (
          <Tooltip title={text}>
            <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
              {text}
            </span>
          </Tooltip>
        )
      },
    },
    {
      title: '标注后数据集',
      dataIndex: 'submit_dataset_name',
      key: 'submit_dataset_name',
      align: 'left',
      width: 120,
      ellipsis: true,
      render: (submit_dataset_name: string) => {
        const text = submit_dataset_name || '-'
        return (
          <Tooltip title={text}>
            <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
              {text}
            </span>
          </Tooltip>
        )
      },
    },
    {
      title: '创建人',
      dataIndex: 'created_by',
      key: 'created_by',
      align: 'left',
      width: 80,
    },
    {
      title: mainTab === 'multi-person' ? '截止时间' : '创建时间',
      dataIndex: mainTab === 'multi-person' ? 'deadline' : 'created_at',
      key: mainTab === 'multi-person' ? 'deadline' : 'created_at',
      align: 'left',
      width: 160,
      render: (value: string | null | undefined) => {
        if (mainTab === 'multi-person') {
          return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'
        }
        return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : ''
      },
    },
    {
      title: '操作',
      key: 'action',
      align: 'left',
      width: 160,
      fixed: 'right',
      render: (_: any, record: AnnotationTask) => (
        <div className="data-annotation-action-cell">
          <Button
            type="link"
            icon={<InfoCircleOutlined />}
            onClick={() => {
              if (record.status === 'creating') {
                message.warning('任务创建中')
                return
              }
              handleViewDetail(record)
            }}
          >
            详情
          </Button>
          {mainTab !== 'multi-person' && (
            <Popconfirm
              title="确认删除"
              description={`确定要删除标注任务"${record.task_name || record.datasetName || record.dataset_name || '该任务'}"吗？`}
              onConfirm={() => handleDelete(record)}
              okText="确定"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button type="link" icon={<DeleteOutlined />} danger>
                删除
              </Button>
            </Popconfirm>
          )}
        </div>
      ),
    },
  ]

  return (
    <Layout.Content className="data-annotation-page">
      {/* 页面标题和描述 */}
      <div>
        <Title level={3} className="data-annotation-page-title">
          数据标注
        </Title>
        <Text type="secondary" className="data-annotation-page-desc">
          支持数据集在线标注、多人协同,提升数据处理效率。
        </Text>
      </div>

      {/* 主标签页：切换时写入 URL，刷新不丢失 */}
      <Tabs
        activeKey={mainTab}
        onChange={(key) => {
          const newTab = key as 'online' | 'multi-person'
          setMainTab(newTab)
          const next = new URLSearchParams(searchParams)
          next.set('tab', newTab)
          if (newTab === 'online') {
            next.delete('sub_tab')
          }
          else {
            next.set('sub_tab', multiSubTab)
          }
          setSearchParams(next, { replace: true })
        }}
        items={[
          {
            key: 'online',
            label: '在线标注',
            children: (
              <OnlineAnnotationTab
                contentTab={contentTab}
                setContentTab={setContentTab}
                searchParams={searchParams}
                setSearchParams={setSearchParams}
                columns={columns}
                taskList={taskList}
                loading={loading}
                pagination={pagination}
                fetchTaskList={fetchTaskList}
                handleRefresh={handleRefresh}
                handleCreateTask={handleCreateTask}
                searchValue={onlineTaskNameInput}
                onSearchChange={handleOnlineTaskNameChange}
                onSearchPressEnter={handleOnlineTaskNamePressEnter}
                onSearchReset={handleOnlineTaskNameReset}
              />
            ),
          },
          {
            key: 'multi-person',
            label: '多人标注',
            children: (
              <MultiPersonAnnotationTab
                showOverviewTab={canAccessMultiLabelOverview}
                columns={columns}
                taskList={taskList}
                loading={loading}
                pagination={pagination}
                fetchTaskList={fetchTaskList}
                overviewList={overviewList}
                overviewLoading={overviewLoading}
                overviewPagination={overviewPagination}
                fetchOverview={fetchOverview}
                auditList={auditList}
                auditLoading={auditLoading}
                auditPagination={auditPagination}
                fetchAudit={fetchAudit}
                handleRefresh={handleRefresh}
                handleCreateTask={handleCreateTask}
                onViewDataList={handleViewDataList}
                onPublishTask={handlePublishMultiLabelTask}
                publishingTaskId={publishingTaskId}
                onViewAuditDetail={handleViewAuditDetail}
                onViewTaskMembers={handleViewTaskMembers}
                onDeleteTask={handleDeleteMultiLabelTask}
                multiSubTab={multiSubTab}
                onMultiSubTabChange={handleMultiSubTabChange}
                searchValue={multiTaskNameInput}
                onSearchChange={handleMultiTaskNameChange}
                onSearchPressEnter={handleMultiTaskNamePressEnter}
                onSearchReset={handleMultiTaskNameReset}
              />
            ),
          },
        ]}
        size="large"
        className="data-annotation-main-tabs"
      />
    </Layout.Content>
  )
}

export default DataAnnotation
