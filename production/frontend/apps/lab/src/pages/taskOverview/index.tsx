import { useEffect, useMemo, useState } from 'react'
import { Button, Empty, Spin, Tag, Typography, message } from 'antd'
import { FolderOpenOutlined, ReloadOutlined } from '@ant-design/icons'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import ComputeResourceCard, { type ResourceMetric } from './components/ComputeResourceCard'
import LatestTaskGroups, { type LatestTaskGroup } from './components/LatestTaskGroups'
import TaskScopeFilter, { type TaskScope } from './components/TaskScopeFilter'
import TaskStatusSummary, { type StatusSummaryItem } from './components/TaskStatusSummary'
import { projectApi } from '@/services/api'
import { type ComputeResourceUsageResponse, type ComputeTaskScope, taskOverviewService } from '@/services/taskOverviewService'
import { useAuthStore } from '@/stores/authStore'
import { useProjectStore } from '@/stores/projectStore'
import type { Project } from '@/types'
import './index.css'

const { Title } = Typography

interface TaskOverviewProps {
  domain?: Extract<TaskScope, 'llm' | 'ml'>
}

const statusDefinitions: Array<Omit<StatusSummaryItem, 'count'>> = [
  { key: 'created', label: '已创建', color: '#7c3aed', background: 'rgba(124, 58, 237, 0.08)' },
  { key: 'scheduled', label: '定时待启动', color: '#b45309', background: 'rgba(245, 158, 11, 0.11)' },
  { key: 'starting', label: '启动中', color: '#2563eb', background: 'rgba(37, 99, 235, 0.09)' },
  { key: 'queued', label: '排队中', color: '#0284c7', background: 'rgba(14, 165, 233, 0.1)' },
  { key: 'running', label: '运行中', color: '#059669', background: 'rgba(5, 150, 105, 0.1)' },
  { key: 'terminated', label: '已终止', color: '#64748b', background: 'rgba(100, 116, 139, 0.11)' },
  { key: 'completed', label: '已完成', color: '#16a34a', background: 'rgba(22, 163, 74, 0.09)' },
  { key: 'failed', label: '失败', color: '#dc2626', background: 'rgba(220, 38, 38, 0.09)' },
]

const scopeLabelMap: Record<TaskScope, string> = {
  all: '全部算力型任务',
  llm: '大模型任务',
  ml: '机器学习任务',
}

const scopeTitleMap: Record<TaskScope, string> = {
  all: '项目算力任务总览',
  llm: '大模型算力任务总览',
  ml: '机器学习算力任务总览',
}

const scopeDescriptionMap: Record<TaskScope, string> = {
  all: '统计当前项目下大模型与机器学习中需要配置算力资源的任务。',
  llm: '统计当前项目下大模型训练、推理、评估、Notebook 等算力任务。',
  ml: '统计当前项目下机器学习训练、部署、Notebook 等算力任务。',
}

const domainScopeOptions: Record<Extract<TaskScope, 'llm' | 'ml'>, TaskScope[]> = {
  llm: ['all', 'llm', 'ml'],
  ml: ['all', 'llm', 'ml'],
}

const overviewQueryOptions = {
  gcTime: 0,
  refetchOnMount: 'always' as const,
  refetchOnReconnect: 'always' as const,
  refetchOnWindowFocus: 'always' as const,
  staleTime: 0,
}

const statusVisualMap: Record<string, Pick<LatestTaskGroup, 'color' | 'tagColor'>> = {
  created: { color: '#7c3aed', tagColor: 'purple' },
  scheduled: { color: '#b45309', tagColor: 'gold' },
  starting: { color: '#2563eb', tagColor: 'blue' },
  queued: { color: '#0284c7', tagColor: 'cyan' },
  running: { color: '#059669', tagColor: 'green' },
  terminated: { color: '#64748b', tagColor: 'default' },
  completed: { color: '#16a34a', tagColor: 'success' },
  failed: { color: '#dc2626', tagColor: 'red' },
}

const latestTaskStatusOrder = ['scheduled', 'starting', 'queued', 'running', 'failed']
const latestTaskStatusNames: Record<string, string> = {
  scheduled: '定时待启动',
  starting: '启动中',
  queued: '排队中',
  running: '运行中',
  failed: '失败',
}

const normalizeTaskStatus = (status?: string) => {
  const value = String(status || '').toLowerCase()
  if (['created', 'pending'].includes(value)) return 'created'
  if (['scheduled', 'waiting_schedule', 'waiting-schedule'].includes(value)) return 'scheduled'
  if (['starting', 'preparing', 'initializing'].includes(value)) return 'starting'
  if (['queued', 'queue'].includes(value)) return 'queued'
  if (['running', 'processing'].includes(value)) return 'running'
  if (['cancelled', 'canceled', 'terminated', 'stopped', 'paused'].includes(value)) return 'terminated'
  if (['completed', 'success', 'succeeded', 'finished'].includes(value)) return 'completed'
  if (['failed', 'error'].includes(value)) return 'failed'
  return value || 'created'
}

const taskScopeToApiScope = (taskScope: TaskScope): ComputeTaskScope => {
  if (taskScope === 'all') return 'total'
  if (taskScope === 'ml') return 'machine_learning'
  return taskScope
}

const apiScopeToTaskScope = (taskScope?: string): TaskScope => {
  const value = String(taskScope || '').toLowerCase()
  if (value === 'total' || value === 'all') return 'all'
  if (value.includes('machine') || value === 'ml') return 'ml'
  return 'llm'
}

const toResourceMetrics = (resource?: ComputeResourceUsageResponse): ResourceMetric[] => {
  if (!resource) {
    return [
      { label: '已使用卡数', used: 0, total: 0, unit: '卡' },
      { label: '已使用显存', used: 0, total: 0, unit: 'GB' },
      { label: '已使用 CPU', used: 0, total: 0, unit: '核' },
      { label: '已使用内存', used: 0, total: 0, unit: 'GB' },
    ]
  }

  return [
    { label: '已使用卡数', ...resource.gpu_cards },
    { label: '已使用显存', ...resource.gpu_memory },
    { label: '已使用 CPU', ...resource.cpu },
    { label: '已使用内存', ...resource.memory },
  ]
}

const getProjectClusterId = (project?: Project) => {
  const rawProject = project as Project & {
    cluster_id?: number | string
    clusterId?: number | string
    kubernetesId?: number | string
  } | undefined
  const clusterId = rawProject?.kubernetes_id
    ?? rawProject?.cluster_id
    ?? rawProject?.clusterId
    ?? rawProject?.kubernetesId
  const numericClusterId = Number(clusterId)

  return Number.isFinite(numericClusterId) && numericClusterId > 0 ? numericClusterId : undefined
}

const getLatestTaskGroups = (data: Awaited<ReturnType<typeof taskOverviewService.getLatestTasks>> | undefined) => {
  return Array.isArray(data) ? data : data?.groups || []
}

const TaskOverview = ({ domain = 'llm' }: TaskOverviewProps) => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { currentProject, setCurrentProject } = useProjectStore()
  const { user } = useAuthStore()
  const { projectId: routeProjectId } = useParams<{ projectId: string }>()
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(
    routeProjectId ? Number(routeProjectId) : currentProject?.id,
  )
  const [scope, setScope] = useState<TaskScope>(domain)
  const [latestGroupPages, setLatestGroupPages] = useState<Record<string, number>>({})
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => new Date())

  useEffect(() => {
    setScope(domain)
  }, [domain])

  const { data: projects = [], isLoading: projectLoading } = useQuery<Project[]>({
    queryKey: ['task-overview-projects'],
    queryFn: () => projectApi.list({ page: 1, size: 100 }).then((res) => res.items),
    refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (selectedProjectId || projects.length === 0) return
    setSelectedProjectId(projects[0].id)
    setCurrentProject(projects[0])
  }, [projects, selectedProjectId, setCurrentProject])

  const selectedProject = useMemo(() => {
    return projects.find((project) => project.id === selectedProjectId) || currentProject || undefined
  }, [currentProject, projects, selectedProjectId])

  const apiTaskScope = taskScopeToApiScope(scope)
  const selectedClusterId = getProjectClusterId(selectedProject)

  useEffect(() => {
    setLatestGroupPages({})
  }, [apiTaskScope, selectedProjectId])

  const { data: taskTypeStats, isFetching: isTaskTypeFetching } = useQuery({
    queryKey: ['task-overview-task-type-stats', selectedProjectId],
    queryFn: () => taskOverviewService.getTaskTypeStats(selectedProjectId as number),
    enabled: !!selectedProjectId,
    ...overviewQueryOptions,
  })

  const { data: statusStats, isFetching: isStatusFetching } = useQuery({
    queryKey: ['task-overview-status-stats', selectedProjectId, apiTaskScope],
    queryFn: () => taskOverviewService.getStatusStats(selectedProjectId as number, apiTaskScope),
    enabled: !!selectedProjectId,
    ...overviewQueryOptions,
  })

  const { data: latestTasks, isFetching: isLatestFetching } = useQuery({
    queryKey: ['task-overview-latest-tasks', selectedProjectId, apiTaskScope],
    queryFn: () => taskOverviewService.getLatestTasks(selectedProjectId as number, {
      task_scope: apiTaskScope,
      page: 1,
      page_size: 4,
    }),
    enabled: !!selectedProjectId,
    ...overviewQueryOptions,
  })

  const latestStatusGroups = getLatestTaskGroups(latestTasks)

  const latestGroupQueries = useQueries({
    queries: latestStatusGroups.map((group) => ({
      queryKey: [
        'task-overview-latest-task-group',
        selectedProjectId,
        apiTaskScope,
        group.status,
        latestGroupPages[group.status] || 1,
      ],
      queryFn: () => taskOverviewService.getLatestTasks(selectedProjectId as number, {
        task_scope: apiTaskScope,
        statuses: [group.status],
        page: latestGroupPages[group.status] || 1,
        page_size: group.page_size || 4,
      }),
      enabled: !!selectedProjectId,
      ...overviewQueryOptions,
    })),
  })

  const { data: projectResource, isFetching: isProjectResourceFetching } = useQuery({
    queryKey: ['task-overview-project-resources', selectedProjectId, selectedClusterId, apiTaskScope],
    queryFn: () => taskOverviewService.getProjectResources(
      selectedProjectId as number,
      selectedClusterId,
      apiTaskScope,
    ),
    enabled: !!selectedProjectId,
    ...overviewQueryOptions,
  })

  const { data: clusterResource, isFetching: isClusterResourceFetching } = useQuery({
    queryKey: ['task-overview-cluster-resources', selectedProjectId, selectedClusterId, apiTaskScope],
    queryFn: () => taskOverviewService.getClusterResources(
      selectedProjectId as number,
      selectedClusterId,
    ),
    enabled: !!selectedProjectId,
    ...overviewQueryOptions,
  })

  const scopeCounts = useMemo(() => {
    const counts = {
      all: 0,
      llm: 0,
      ml: 0,
      ...(taskTypeStats?.items || []).reduce((acc, item) => {
        acc[apiScopeToTaskScope(item.task_scope)] = item.count
        return acc
      }, {} as Record<TaskScope, number>),
    }

    return {
      ...counts,
      all: counts.all || counts.llm + counts.ml,
    }
  }, [taskTypeStats?.items])

  const statusItems = useMemo(() => {
    const countMap = new Map(
      (statusStats?.statuses || []).map((item) => [normalizeTaskStatus(item.status_code), item.count]),
    )

    return statusDefinitions.map((item) => ({
      ...item,
      count: countMap.get(item.key) || 0,
    }))
  }, [statusStats?.statuses])

  const latestGroups = useMemo(() => {
    const pagedGroupMap = new Map(
      latestGroupQueries
        .map((query) => getLatestTaskGroups(query.data)[0])
        .filter((group) => !!group)
        .map((group) => [normalizeTaskStatus(group.status), group]),
    )
    const baseGroupMap = new Map(
      latestStatusGroups
        .filter((group) => latestTaskStatusOrder.includes(normalizeTaskStatus(group.status)))
        .map((group) => [normalizeTaskStatus(group.status), group]),
    )

    return latestTaskStatusOrder.map((key) => {
      const baseGroup = baseGroupMap.get(key)
      const group = pagedGroupMap.get(key) || baseGroup
      const visual = statusVisualMap[key] || { color: '#2563eb', tagColor: 'processing' }

      return {
        key,
        label: latestTaskStatusNames[key] || group?.status_name || key,
        color: visual.color,
        tagColor: visual.tagColor,
        totalCount: group?.total_count || 0,
        page: group?.page || latestGroupPages[key] || 1,
        pageSize: group?.page_size || 4,
        tasks: group?.items || [],
      }
    })
  }, [latestGroupPages, latestGroupQueries, latestStatusGroups])

  const latestGroupFetching = latestGroupQueries.some((query) => query.isFetching)

  const projectMetrics = useMemo(() => toResourceMetrics(projectResource), [projectResource])
  const clusterMetrics = useMemo(() => toResourceMetrics(clusterResource), [clusterResource])
  const resourceTypes = useMemo(() => {
    const types = [projectResource, clusterResource]
      .flatMap((resource) => [resource?.resource_card_model, resource?.resource_type])
      .filter((item): item is string => !!item)

    return Array.from(new Set(types)).length ? Array.from(new Set(types)) : ['GPU', 'CPU']
  }, [clusterResource, projectResource])

  const isFetching = isTaskTypeFetching
    || isStatusFetching
    || isLatestFetching
    || latestGroupFetching
    || isProjectResourceFetching
    || isClusterResourceFetching

  const handleRefreshOverview = () => {
    setLatestGroupPages({})
    setLastRefreshedAt(new Date())
    queryClient.invalidateQueries({ queryKey: ['task-overview-task-type-stats', selectedProjectId] })
    queryClient.invalidateQueries({ queryKey: ['task-overview-status-stats', selectedProjectId] })
    queryClient.invalidateQueries({ queryKey: ['task-overview-latest-tasks', selectedProjectId] })
    queryClient.invalidateQueries({ queryKey: ['task-overview-latest-task-group', selectedProjectId] })
    queryClient.invalidateQueries({ queryKey: ['task-overview-project-resources', selectedProjectId] })
    queryClient.invalidateQueries({ queryKey: ['task-overview-cluster-resources', selectedProjectId] })
    message.success('任务概览已刷新')
  }

  if (projectLoading) {
    return (
      <div className="task-overview-page lab-list-page-shell task-overview-page--center">
        <Spin tip="正在加载项目" />
      </div>
    )
  }

  if (!projects.length && !selectedProjectId) {
    return (
      <div className="task-overview-page lab-list-page-shell task-overview-page--center">
        <Empty description="当前账号没有可访问项目" />
      </div>
    )
  }

  return (
    <div className="task-overview-page lab-list-page-shell">
      <section className="task-overview-hero">
        <div className="task-overview-hero__copy">
          <Tag color="blue" className="task-overview-hero__tag">任务概览</Tag>
          <Title level={1} className="task-overview-hero__title">任务概览</Title>
          <div className="task-overview-context-line">
            <span>当前项目</span>
            <strong>{selectedProject?.name || currentProject?.name || '未选择项目'}</strong>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              className="task-overview-refresh-button"
              onClick={handleRefreshOverview}
            >
              刷新
            </Button>
            <Button
              type="link"
              size="small"
              icon={<FolderOpenOutlined />}
              className="task-overview-back-link"
              onClick={() => navigate('/home')}
            >
              返回项目空间
            </Button>
            <span className="task-overview-refresh-time">
              最近刷新
              {' '}
              {lastRefreshedAt.toLocaleTimeString('zh-CN', { hour12: false })}
            </span>
          </div>
        </div>
        <TaskScopeFilter
          value={scope}
          counts={scopeCounts}
          options={domainScopeOptions[domain]}
          onChange={setScope}
        />
      </section>

      <Spin spinning={isFetching}>
        <TaskStatusSummary
          scopeLabel={scopeLabelMap[scope]}
          title={scopeTitleMap[scope]}
          description={scopeDescriptionMap[scope]}
          total={statusStats?.total || scopeCounts[scope] || 0}
          items={statusItems}
        />

        <ComputeResourceCard
          resourceTypes={resourceTypes}
          projectMetrics={projectMetrics}
          clusterMetrics={clusterMetrics}
          scopeLabel={scopeLabelMap[scope]}
          clusterName={clusterResource?.cluster_name || selectedProject?.kubernetes_name}
        />

        <LatestTaskGroups
          groups={latestGroups}
          scopeLabel={scopeLabelMap[scope]}
          projectId={selectedProjectId}
          currentUsername={user?.username}
          onPageChange={(status, page) => {
            setLatestGroupPages((prev) => ({
              ...prev,
              [status]: page,
            }))
          }}
        />
      </Spin>
    </div>
  )
}

export default TaskOverview
