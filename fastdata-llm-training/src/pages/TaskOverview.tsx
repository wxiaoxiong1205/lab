import React, { useMemo, useState } from 'react'
import { Button, Card, Col, Empty, Progress, Row, Space, Tag, Tooltip, Typography, message } from 'antd'
import {
  ArrowRightOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  CloudServerOutlined,
  ClusterOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  FireOutlined,
  FolderOpenOutlined,
  LeftOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RightOutlined,
  RocketOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTrainingTasks, getTrainingTaskLifecycleStatus } from '../services/trainingTaskStore'
import { useDataServiceStore, type TaskLifecycleStatus } from '../services/dataServiceStore'
import { useMachineDeploymentStore } from '../services/machineDeploymentStore'
import {
  getAccessibleProjects,
  getCurrentProject,
  getCurrentUser,
  usePermissionStore,
} from '../services/permissionStore'

const { Title, Text } = Typography

type ComputeType = 'GPU T4' | 'GPU A100' | 'NPU Ascend' | 'CPU'
type TaskModule = '大模型训练' | '推理结果集' | '数据清洗' | '效果评估' | '大模型部署' | '机器学习模型部署' | '在线Notebook'
type TaskScope = 'all' | 'llm' | 'ml'

interface ResourceSnapshot {
  computeTypes: ComputeType[]
  cards: number
  vramGb: number
  cpu: number
  memoryGb: number
}

interface OverviewTask {
  id: string
  name: string
  module: TaskModule
  status: TaskLifecycleStatus
  creator: string
  creatorName?: string
  createdAt: string
  path: string
  resource: ResourceSnapshot
}

interface CapacitySnapshot extends ResourceSnapshot {
  label: string
}

const statusOrder: TaskLifecycleStatus[] = ['已创建', '定时待启动', '启动中', '排队中', '运行中', '已终止', '已完成', '失败']
const latestStatusOrder: TaskLifecycleStatus[] = ['定时待启动', '启动中', '排队中', '运行中', '失败']
const latestGroupPageSize = 4
const taskScopeMeta: Record<TaskScope, { label: string; title: string; description: string; latestLabel: string; icon: React.ReactNode; accent: string; gradient: string }> = {
  all: {
    label: '全部任务',
    title: '项目算力任务总览',
    description: '统计当前项目下大模型与机器学习中需要配置算力资源的任务；数据集、模型、标注等资源类对象不计入任务数量。',
    latestLabel: '全部算力型任务',
    icon: <AppstoreOutlined />,
    accent: '#1d4ed8',
    gradient: 'linear-gradient(135deg, #1d4ed8 0%, #0891b2 100%)',
  },
  llm: {
    label: '大模型',
    title: '大模型算力任务总览',
    description: '仅统计当前项目下大模型相关算力任务，包括训练、推理、清洗、评估、部署和 Notebook。',
    latestLabel: '大模型算力型任务',
    icon: <CloudServerOutlined />,
    accent: '#2563eb',
    gradient: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
  },
  ml: {
    label: '机器学习',
    title: '机器学习算力任务总览',
    description: '仅统计当前项目下机器学习相关算力任务，便于单独查看机器学习模型部署等资源占用。',
    latestLabel: '机器学习算力型任务',
    icon: <ExperimentOutlined />,
    accent: '#0f766e',
    gradient: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)',
  },
}
const statusVisual: Record<TaskLifecycleStatus, { color: string; bg: string; tag: string }> = {
  已创建: { color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.08)', tag: 'purple' },
  定时待启动: { color: '#b45309', bg: 'rgba(245, 158, 11, 0.11)', tag: 'gold' },
  启动中: { color: '#2563eb', bg: 'rgba(37, 99, 235, 0.09)', tag: 'blue' },
  排队中: { color: '#0284c7', bg: 'rgba(14, 165, 233, 0.1)', tag: 'cyan' },
  运行中: { color: '#059669', bg: 'rgba(5, 150, 105, 0.1)', tag: 'green' },
  已终止: { color: '#64748b', bg: 'rgba(100, 116, 139, 0.11)', tag: 'default' },
  已完成: { color: '#16a34a', bg: 'rgba(22, 163, 74, 0.09)', tag: 'success' },
  失败: { color: '#dc2626', bg: 'rgba(220, 38, 38, 0.09)', tag: 'red' },
}

const moduleVisual: Record<TaskModule, { color: string; icon: React.ReactNode }> = {
  大模型训练: { color: '#2563eb', icon: <CloudServerOutlined /> },
  推理结果集: { color: '#059669', icon: <ThunderboltOutlined /> },
  数据清洗: { color: '#0891b2', icon: <DatabaseOutlined /> },
  效果评估: { color: '#7c3aed', icon: <BarChartOutlined /> },
  大模型部署: { color: '#f97316', icon: <RocketOutlined /> },
  机器学习模型部署: { color: '#0f766e', icon: <ExperimentOutlined /> },
  在线Notebook: { color: '#4f46e5', icon: <PlayCircleOutlined /> },
}

const overviewSeedTasks: OverviewTask[] = [
  {
    id: 'eval-overview-1',
    name: '客服多轮对话-自动评估',
    module: '效果评估',
    status: '运行中',
    creator: 'zhangsan',
    creatorName: '张三',
    createdAt: '2026/05/20 16:18:42',
    path: '/effect-evaluation/report/eval-overview-1',
    resource: makeResource(['GPU T4'], 1, 16, 8, 32),
  },
  {
    id: 'notebook-overview-1',
    name: 'Qwen2.5-RAG 实验 Notebook',
    module: '在线Notebook',
    status: '排队中',
    creator: 'lisi',
    creatorName: '李四',
    createdAt: '2026/05/20 15:44:18',
    path: '/finetune/notebooks/notebook-overview-1',
    resource: makeResource(['GPU T4'], 1, 16, 6, 24),
  },
  {
    id: 'service-overview-1',
    name: '文本生成服务-vllm-灰度',
    module: '大模型部署',
    status: '启动中',
    creator: 'zhangsan',
    creatorName: '张三',
    createdAt: '2026/05/20 15:08:36',
    path: '/service/inference/hosted',
    resource: makeResource(['GPU A100'], 2, 160, 24, 128),
  },
  {
    id: 'training-overview-boot-1',
    name: 'Qwen2.5-客服助手-SFT 启动',
    module: '大模型训练',
    status: '启动中',
    creator: 'zhangsan',
    creatorName: '张三',
    createdAt: '2026/05/20 14:52:12',
    path: '/training/detail/1/version/v3',
    resource: makeResource(['GPU T4'], 2, 32, 16, 64),
  },
  {
    id: 'cleaning-overview-boot-1',
    name: 'DPO-Role-Based-客服质检清洗',
    module: '数据清洗',
    status: '启动中',
    creator: 'lab1',
    creatorName: 'lab1',
    createdAt: '2026/05/20 14:36:45',
    path: '/data-cleaning',
    resource: makeResource(['CPU'], 0, 0, 10, 24),
  },
  {
    id: 'notebook-overview-boot-1',
    name: '评测脚本调试 Notebook',
    module: '在线Notebook',
    status: '启动中',
    creator: 'lisi',
    creatorName: '李四',
    createdAt: '2026/05/20 14:18:03',
    path: '/finetune/notebooks/notebook-overview-boot-1',
    resource: makeResource(['GPU T4'], 1, 16, 8, 32),
  },
  {
    id: 'inference-overview-boot-1',
    name: '批量推理结果集-灰度启动',
    module: '推理结果集',
    status: '启动中',
    creator: 'zhangsan',
    creatorName: '张三',
    createdAt: '2026/05/20 14:03:27',
    path: '/inference/inference-overview-boot-1',
    resource: makeResource(['GPU T4'], 1, 16, 8, 32),
  },
  {
    id: 'eval-overview-2',
    name: '图像理解-对比评估失败重跑',
    module: '效果评估',
    status: '失败',
    creator: 'wangwu',
    creatorName: '王五',
    createdAt: '2026/05/20 11:26:10',
    path: '/effect-evaluation/report/eval-overview-2',
    resource: makeResource(['GPU T4'], 1, 16, 8, 32),
  },
  {
    id: 'notebook-overview-2',
    name: 'Embedding 数据处理 Notebook',
    module: '在线Notebook',
    status: '定时待启动',
    creator: 'zhangsan',
    creatorName: '张三',
    createdAt: '2026/05/19 20:30:00',
    path: '/finetune/notebooks/notebook-overview-2',
    resource: makeResource(['CPU'], 0, 0, 16, 64),
  },
  {
    id: 'service-overview-2',
    name: '多模态推理服务-压测',
    module: '大模型部署',
    status: '已创建',
    creator: 'lisi',
    creatorName: '李四',
    createdAt: '2026/05/19 18:12:45',
    path: '/service/inference/hosted',
    resource: makeResource(['GPU A100'], 1, 80, 16, 80),
  },
]

function makeResource(computeTypes: ComputeType[], cards: number, vramGb: number, cpu: number, memoryGb: number): ResourceSnapshot {
  return { computeTypes, cards, vramGb, cpu, memoryGb }
}

function parseMemoryGb(value?: string): number {
  if (!value) {
    return 0
  }
  const matched = value.match(/(\d+(?:\.\d+)?)/)
  return matched ? Number(matched[1]) : 0
}

function normalizeDate(value: string): number {
  const normalized = value.replace(/-/g, '/')
  const time = new Date(normalized).getTime()
  return Number.isFinite(time) ? time : 0
}

function sumResource(tasks: OverviewTask[]): ResourceSnapshot {
  const computeTypes = new Set<ComputeType>()
  const total = tasks.reduce(
    (acc, task) => {
      task.resource.computeTypes.forEach(type => computeTypes.add(type))
      acc.cards += task.resource.cards
      acc.vramGb += task.resource.vramGb
      acc.cpu += task.resource.cpu
      acc.memoryGb += task.resource.memoryGb
      return acc
    },
    { cards: 0, vramGb: 0, cpu: 0, memoryGb: 0 },
  )

  return {
    computeTypes: Array.from(computeTypes),
    ...total,
  }
}

function getClusterCapacity(clusterName?: string): { project: CapacitySnapshot; cluster: CapacitySnapshot; sharedUsed: ResourceSnapshot } {
  if (clusterName?.includes('12')) {
    return {
      project: { label: '当前项目配额', computeTypes: ['GPU T4', 'CPU'], cards: 8, vramGb: 128, cpu: 256, memoryGb: 768 },
      cluster: { label: '对应集群总量', computeTypes: ['GPU T4', 'CPU'], cards: 32, vramGb: 512, cpu: 1280, memoryGb: 4096 },
      sharedUsed: makeResource(['GPU T4', 'CPU'], 11, 176, 280, 920),
    }
  }

  return {
    project: { label: '当前项目配额', computeTypes: ['GPU T4', 'GPU A100', 'NPU Ascend', 'CPU'], cards: 24, vramGb: 768, cpu: 960, memoryGb: 3072 },
    cluster: { label: '对应集群总量', computeTypes: ['GPU T4', 'GPU A100', 'NPU Ascend', 'CPU'], cards: 96, vramGb: 3072, cpu: 3840, memoryGb: 12288 },
    sharedUsed: makeResource(['GPU T4', 'GPU A100', 'CPU'], 28, 896, 1024, 3584),
  }
}

function resourceFromTrainingVersion(version: ReturnType<typeof useTrainingTasks>[number]['versions'][number]): ResourceSnapshot {
  const gpuCount = version.gpuConfig?.gpuCount ?? version.gpuCount ?? version.config?.gpuCount ?? 0
  const gpuModel = version.gpuConfig?.gpuModel
  const computeType = gpuCount > 0 ? (gpuModel?.includes('A100') ? 'GPU A100' : 'GPU T4') : 'CPU'
  const vramPerCard = parseMemoryGb(version.gpuConfig?.gpuMemory) || (computeType === 'GPU A100' ? 80 : computeType === 'GPU T4' ? 16 : 0)
  return makeResource(
    [computeType],
    gpuCount,
    gpuCount * vramPerCard,
    version.config?.cpuRequest ?? Math.max(4, gpuCount * 8),
    version.config?.memoryRequest ?? Math.max(16, gpuCount * 32),
  )
}

function formatResourceSpec(resource: ResourceSnapshot): string {
  const gpuTypes = resource.computeTypes.filter(type => type !== 'CPU')
  const gpuLabel = gpuTypes.length ? gpuTypes.join('/') : '无'
  return `显卡：${gpuLabel} · ${resource.cards}卡 · 显存：${resource.vramGb}GB · CPU：${resource.cpu}核 · 内存：${resource.memoryGb}GB`
}

function getResourceOccupancyHint(status: TaskLifecycleStatus): { keyword: string; tone: 'pending' | 'using' } | null {
  if (status === '运行中') {
    return {
      keyword: '资源正在使用中',
      tone: 'using',
    }
  }
  if (status === '定时待启动') {
    return {
      keyword: '资源即将被占用',
      tone: 'pending',
    }
  }
  if (status === '启动中') {
    return {
      keyword: '资源即将被占用',
      tone: 'pending',
    }
  }
  if (status === '排队中') {
    return {
      keyword: '资源即将被占用',
      tone: 'pending',
    }
  }
  return null
}

function getCreatorName(account: string, users: ReturnType<typeof usePermissionStore>['users']): string {
  return users.find(user => user.account === account)?.username ?? account
}

function getTaskScope(task: OverviewTask): Exclude<TaskScope, 'all'> {
  return task.module === '机器学习模型部署' ? 'ml' : 'llm'
}

const TaskOverview: React.FC = () => {
  const navigate = useNavigate()
  const permissionState = usePermissionStore()
  const currentUser = getCurrentUser(permissionState)
  const currentProject = getCurrentProject(permissionState)
  const accessibleProjects = getAccessibleProjects(permissionState)
  const trainingTasks = useTrainingTasks()
  const dataServiceState = useDataServiceStore()
  const machineDeploymentState = useMachineDeploymentStore()
  const [taskScope, setTaskScope] = useState<TaskScope>('all')
  const [latestGroupPages, setLatestGroupPages] = useState<Partial<Record<TaskLifecycleStatus, number>>>({})
  const [refreshTick, setRefreshTick] = useState(0)
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => new Date())

  const overviewTasks = useMemo<OverviewTask[]>(() => {
    const trainingOverviewTasks: OverviewTask[] = trainingTasks
      .filter(task => task.versions.length > 0)
      .map(task => {
        const latestVersion = task.versions[0]
        return {
          id: task.id,
          name: task.name,
          module: '大模型训练',
          status: getTrainingTaskLifecycleStatus(task),
          creator: latestVersion.creator ?? 'lab1',
          creatorName: getCreatorName(latestVersion.creator ?? 'lab1', permissionState.users),
          createdAt: latestVersion.createdAt ?? task.createdAt,
          path: `/training/detail/${task.id}/version/${latestVersion.id}`,
          resource: resourceFromTrainingVersion(latestVersion),
        }
      })

    const inferenceOverviewTasks: OverviewTask[] = dataServiceState.inferenceResults
      .filter(task => task.inferenceMode !== '导入推理结果集')
      .map((task, index) => {
        const creator = index % 2 === 0 ? 'zhangsan' : 'lisi'
        return {
          id: task.id,
          name: task.name,
          module: '推理结果集',
          status: task.progress,
          creator,
          creatorName: getCreatorName(creator, permissionState.users),
          createdAt: task.createdAt,
          path: `/inference/${task.id}`,
          resource: makeResource(['GPU T4'], task.progress === '已创建' ? 0 : 1, task.progress === '已创建' ? 0 : 16, 8, 32),
        }
      })

    const cleaningOverviewTasks: OverviewTask[] = dataServiceState.cleaningTasks.map(task => ({
      id: task.id,
      name: task.name,
      module: '数据清洗',
      status: task.status,
      creator: task.creator,
      creatorName: getCreatorName(task.creator, permissionState.users),
      createdAt: task.createdAt,
      path: '/data-cleaning',
      resource: makeResource(['CPU'], 0, 0, 10, 24),
    }))

    const machineDeploymentOverviewTasks: OverviewTask[] = machineDeploymentState.deployments.map(task => {
      const resources = task.customConfig?.resources ?? task.standardConfig?.resources
      const instanceCount = resources?.instanceCount ?? 1
      const gpuCount = (resources?.gpuCount ?? 0) * instanceCount
      const gpuType = gpuCount > 0 ? (resources?.gpuType?.includes('A100') ? 'GPU A100' : 'GPU T4') : 'CPU'
      return {
        id: task.id,
        name: task.name,
        module: '机器学习模型部署',
        status: task.status,
        creator: task.creator,
        creatorName: getCreatorName(task.creator, permissionState.users),
        createdAt: task.createdAt,
        path: '/machine-model-deployment',
        resource: makeResource(
          [gpuType],
          gpuCount,
          gpuCount * (gpuType === 'GPU A100' ? 80 : gpuType === 'GPU T4' ? 16 : 0),
          (resources?.cpuRequest ?? 2) * instanceCount,
          (resources?.memoryRequest ?? 8) * instanceCount,
        ),
      }
    })

    return [
      ...overviewSeedTasks,
      ...trainingOverviewTasks,
      ...inferenceOverviewTasks,
      ...cleaningOverviewTasks,
      ...machineDeploymentOverviewTasks,
    ].sort((a, b) => normalizeDate(b.createdAt) - normalizeDate(a.createdAt))
  }, [dataServiceState, machineDeploymentState.deployments, permissionState.users, refreshTick, trainingTasks])

  const taskScopeCounts = useMemo<Record<TaskScope, number>>(() => ({
    all: overviewTasks.length,
    llm: overviewTasks.filter(task => getTaskScope(task) === 'llm').length,
    ml: overviewTasks.filter(task => getTaskScope(task) === 'ml').length,
  }), [overviewTasks])

  const filteredOverviewTasks = useMemo(
    () => taskScope === 'all' ? overviewTasks : overviewTasks.filter(task => getTaskScope(task) === taskScope),
    [overviewTasks, taskScope],
  )

  const currentScopeMeta = taskScopeMeta[taskScope]
  const runningTasks = filteredOverviewTasks.filter(task => task.status === '运行中')
  const projectUsed = sumResource(runningTasks)
  const capacity = getClusterCapacity(currentProject?.cluster)
  const clusterUsed = {
    computeTypes: Array.from(new Set([...projectUsed.computeTypes, ...capacity.sharedUsed.computeTypes])),
    cards: projectUsed.cards + capacity.sharedUsed.cards,
    vramGb: projectUsed.vramGb + capacity.sharedUsed.vramGb,
    cpu: projectUsed.cpu + capacity.sharedUsed.cpu,
    memoryGb: projectUsed.memoryGb + capacity.sharedUsed.memoryGb,
  }

  const statusCounts = statusOrder.map(status => ({
    status,
    count: filteredOverviewTasks.filter(task => task.status === status).length,
  }))

  const latestGroups = latestStatusOrder.map(status => ({
    status,
    tasks: filteredOverviewTasks.filter(task => task.status === status),
  }))

  const canOpenTask = (task: OverviewTask) =>
    task.creator === currentUser.account ||
    task.creator === currentUser.username ||
    task.creatorName === currentUser.username

  const handleOpenTask = (task: OverviewTask) => {
    if (!canOpenTask(task)) {
      message.warning('暂无权限')
      return
    }
    navigate(task.path)
  }

  const handleLatestGroupPageChange = (status: TaskLifecycleStatus, page: number) => {
    setLatestGroupPages(prev => ({ ...prev, [status]: page }))
  }

  const handleRefreshOverview = () => {
    setRefreshTick(value => value + 1)
    setLatestGroupPages({})
    setLastRefreshedAt(new Date())
    message.success('任务概览已刷新')
  }

  const scopeOptions = Object.keys(taskScopeMeta) as TaskScope[]

  if (!currentProject && !accessibleProjects.length) {
    return (
      <div style={{ padding: 40 }}>
        <Card style={{ borderRadius: 24 }}>
          <Empty description="当前账号暂无可访问项目，无法查看任务概览" />
        </Card>
      </div>
    )
  }

  return (
    <div className="task-overview-page" style={{ padding: '30px 36px 40px', minHeight: '100%' }}>
      <section className="task-overview-hero">
        <div className="task-overview-hero__copy">
          <Space size={10} wrap style={{ marginBottom: 14 }}>
            <Tag color="blue" style={{ borderRadius: 999, paddingInline: 10, border: 'none' }}>任务概览</Tag>
          </Space>
          <Title level={1} style={{ margin: 0, color: '#0f172a', fontSize: 28, lineHeight: 1.16, letterSpacing: '-0.7px' }}>
            任务概览
          </Title>
          <div className="task-overview-context-line">
            <span>当前项目</span>
            <strong>{currentProject?.name ?? '未选择项目'}</strong>
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
              onClick={() => navigate('/workspace')}
            >
              返回项目空间
            </Button>
            <span className="task-overview-refresh-time">最近刷新 {lastRefreshedAt.toLocaleTimeString('zh-CN', { hour12: false })}</span>
          </div>
        </div>

        <div className="task-overview-scope-grid" role="tablist" aria-label="任务范围">
          {scopeOptions.map(scope => {
            const meta = taskScopeMeta[scope]
            const active = taskScope === scope
            return (
              <button
                key={scope}
                type="button"
                role="tab"
                aria-selected={active}
                className={`task-overview-scope-card${active ? ' task-overview-scope-card--active' : ''}`}
                style={{
                  '--scope-accent': meta.accent,
                  '--scope-gradient': meta.gradient,
                } as React.CSSProperties}
                onClick={() => setTaskScope(scope)}
              >
                <span className="task-overview-scope-card__icon">{meta.icon}</span>
                <span className="task-overview-scope-card__main">
                  <span className="task-overview-scope-card__label">{meta.label}</span>
                  <span className="task-overview-scope-card__hint">{active ? '当前视图' : '筛选视图'}</span>
                </span>
                <span className="task-overview-scope-card__count">{taskScopeCounts[scope]}</span>
              </button>
            )
          })}
        </div>
      </section>

      <Card className="task-overview-section-card" styles={{ body: { padding: 20 } }}>
        <div className="task-overview-section-head">
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>当前视图</Text>
            <Title level={3} style={{ margin: '4px 0 6px', color: '#0f172a' }}>
              {currentScopeMeta.title}
            </Title>
            <Text type="secondary">{currentScopeMeta.description}</Text>
          </div>
          <Tag
            style={{
              borderRadius: 999,
              padding: '7px 12px',
              background: `${currentScopeMeta.accent}12`,
              border: `1px solid ${currentScopeMeta.accent}26`,
              color: currentScopeMeta.accent,
              fontWeight: 700,
              margin: 0,
            }}
          >
            {currentScopeMeta.latestLabel} · {filteredOverviewTasks.length}
          </Tag>
        </div>

        <Row gutter={[12, 12]}>
          {statusCounts.map(item => {
            const visual = statusVisual[item.status]
            return (
              <Col xs={12} sm={8} md={6} xl={3} key={item.status}>
                <div
                  className="task-overview-status-tile"
                  style={{ '--status-color': visual.color, '--status-bg': visual.bg } as React.CSSProperties}
                >
                  <Text style={{ color: '#475569', fontSize: 13 }}>{item.status}</Text>
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 5 }}>
                    <span style={{ color: visual.color, fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{item.count}</span>
                    <Text type="secondary">个</Text>
                  </div>
                </div>
              </Col>
            )
          })}
        </Row>
      </Card>

      <ComputeOverviewCard
        scopeLabel={currentScopeMeta.label}
        clusterName={currentProject?.cluster}
        capacity={capacity.cluster}
        projectUsed={projectUsed}
        clusterUsed={clusterUsed}
      />

      <Card
        className="task-overview-section-card"
        styles={{ body: { padding: 24 } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <Title level={4} style={{ margin: 0 }}>最新任务</Title>
            <Text type="secondary">按待启动、启动中、排队、运行和失败任务聚合展示</Text>
          </div>
          <Tag color="processing" style={{ borderRadius: 999 }}>{currentScopeMeta.latestLabel}</Tag>
        </div>

        <Row gutter={[16, 16]}>
          {latestGroups.map(group => {
            const totalPages = Math.max(1, Math.ceil(group.tasks.length / latestGroupPageSize))
            const currentPage = Math.min(latestGroupPages[group.status] ?? 1, totalPages)
            const pageTasks = group.tasks.slice((currentPage - 1) * latestGroupPageSize, currentPage * latestGroupPageSize)
            const groupOccupancyHint = getResourceOccupancyHint(group.status)

            return (
              <Col xs={24} lg={12} xxl={group.status === '失败' ? 24 : 12} key={group.status}>
                <div
                  className="task-overview-latest-group"
                  style={{
                    '--latest-status-color': statusVisual[group.status].color,
                    '--latest-status-bg': statusVisual[group.status].bg,
                  } as React.CSSProperties}
                >
                  <div className="task-overview-latest-group__head">
                    <div className="task-overview-latest-group__title">
                      <Space size={8}>
                        <FireOutlined style={{ color: statusVisual[group.status].color }} />
                        <Text strong>{group.status}</Text>
                      </Space>
                      {groupOccupancyHint && (
                        <span className={`task-overview-latest-group__hint task-overview-latest-group__hint--${groupOccupancyHint.tone}`}>
                          （{groupOccupancyHint.keyword}）
                        </span>
                      )}
                    </div>
                    <Tag color={statusVisual[group.status].tag}>{group.tasks.length}</Tag>
                  </div>
                  <div className="task-overview-latest-group__body">
                    {pageTasks.length ? (
                      <div className="task-overview-latest-grid">
                        {pageTasks.map(task => {
                            return (
                              <button
                                key={task.id}
                                type="button"
                                onClick={() => handleOpenTask(task)}
                                className="task-overview-item"
                              >
                                <div className="task-overview-item__content">
                                  <div className="task-overview-item__main">
                                    <div className="task-overview-item__title">
                                      <span style={{ color: moduleVisual[task.module].color }}>{moduleVisual[task.module].icon}</span>
                                      <Text strong ellipsis className="task-overview-item__name">{task.name}</Text>
                                    </div>
                                    <Space size={8} wrap>
                                      <Tag style={{ margin: 0 }}>{task.module}</Tag>
                                      <Text type="secondary" style={{ fontSize: 12 }}>创建人：{task.creatorName ?? task.creator}</Text>
                                      <Text type="secondary" style={{ fontSize: 12 }}>创建时间：{task.createdAt}</Text>
                                    </Space>
                                    <div className="task-overview-item__resource">
                                      <Text type="secondary" ellipsis={{ tooltip: formatResourceSpec(task.resource) }}>
                                        {formatResourceSpec(task.resource)}
                                      </Text>
                                    </div>
                                  </div>
                                  <Tooltip title={canOpenTask(task) ? '进入任务详情' : '暂无权限'}>
                                    <ArrowRightOutlined style={{ color: canOpenTask(task) ? '#2563eb' : '#cbd5e1', marginTop: 3 }} />
                                  </Tooltip>
                                </div>
                              </button>
                            )
                          })}
                      </div>
                    ) : (
                      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`当前范围暂无${group.status}任务`} style={{ marginBlock: 18 }} />
                    )}
                  </div>
                  {group.tasks.length > latestGroupPageSize && (
                    <div className="task-overview-latest-pagination" aria-label={`${group.status}任务分页`}>
                      <button
                        type="button"
                        className="task-overview-latest-pagination__arrow"
                        disabled={currentPage <= 1}
                        aria-label="上一页"
                        onClick={() => handleLatestGroupPageChange(group.status, currentPage - 1)}
                      >
                        <LeftOutlined />
                      </button>
                      <div className="task-overview-latest-pagination__pages">
                        {Array.from({ length: totalPages }, (_, index) => {
                          const page = index + 1
                          return (
                            <button
                              key={page}
                              type="button"
                              className={`task-overview-latest-pagination__page${page === currentPage ? ' task-overview-latest-pagination__page--active' : ''}`}
                              aria-label={`第 ${page} 页`}
                              aria-current={page === currentPage ? 'page' : undefined}
                              onClick={() => handleLatestGroupPageChange(group.status, page)}
                            >
                              {page}
                            </button>
                          )
                        })}
                      </div>
                      <button
                        type="button"
                        className="task-overview-latest-pagination__arrow"
                        disabled={currentPage >= totalPages}
                        aria-label="下一页"
                        onClick={() => handleLatestGroupPageChange(group.status, currentPage + 1)}
                      >
                        <RightOutlined />
                      </button>
                    </div>
                  )}
                </div>
              </Col>
            )
          })}
        </Row>
      </Card>

      <style>{`
        .task-overview-page {
          --overview-ink: #0f172a;
          --overview-muted: #64748b;
          --overview-line: rgba(148, 163, 184, 0.22);
        }
        .task-overview-hero {
          position: relative;
          display: grid;
          grid-template-columns: minmax(320px, 1fr) minmax(540px, 720px);
          align-items: center;
          gap: 18px;
          margin-bottom: 18px;
          padding: 2px 0 0;
        }
        .task-overview-hero__copy,
        .task-overview-scope-grid {
          position: relative;
          z-index: 1;
        }
        .task-overview-context-line {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          color: #64748b;
          font-size: 13px;
        }
        .task-overview-context-line strong {
          color: #0f172a;
          font-size: 14px;
        }
        .task-overview-refresh-button.ant-btn {
          height: 24px;
          border-radius: 999px;
          border-color: rgba(37, 99, 235, 0.2);
          color: #2563eb;
          background: rgba(37, 99, 235, 0.06);
          font-size: 12px;
          font-weight: 700;
        }
        .task-overview-refresh-button.ant-btn:hover {
          border-color: rgba(37, 99, 235, 0.36) !important;
          color: #1d4ed8 !important;
          background: rgba(37, 99, 235, 0.1) !important;
        }
        .task-overview-refresh-time {
          color: #94a3b8;
          font-size: 12px;
        }
        .task-overview-back-link.ant-btn {
          height: 24px;
          padding: 0 4px;
          color: #2563eb;
          font-weight: 700;
        }
        .task-overview-scope-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin: 0;
          padding: 8px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.68);
          border: 1px solid rgba(226, 232, 240, 0.82);
          backdrop-filter: blur(10px);
        }
        .task-overview-scope-card {
          position: relative;
          display: grid;
          grid-template-columns: 26px minmax(0, 1fr) auto;
          grid-template-areas:
            "icon main count";
          align-items: center;
          gap: 8px;
          min-height: 58px;
          padding: 9px 10px;
          text-align: left;
          border: 1px solid transparent;
          border-radius: 14px;
          background: transparent;
          color: var(--overview-ink);
          cursor: pointer;
          overflow: hidden;
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .task-overview-scope-card::after {
          content: '';
          position: absolute;
          inset: 0 auto 0 0;
          width: 3px;
          height: auto;
          border-radius: 999px;
          background: var(--scope-accent);
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .task-overview-scope-card:hover {
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--scope-accent) 34%, #e2e8f0);
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.06);
        }
        .task-overview-scope-card:hover::after {
          opacity: 0.35;
        }
        .task-overview-scope-card--active {
          color: var(--overview-ink);
          border-color: color-mix(in srgb, var(--scope-accent) 42%, #e2e8f0);
          background: color-mix(in srgb, var(--scope-accent) 7%, #ffffff);
          box-shadow: 0 10px 24px color-mix(in srgb, var(--scope-accent) 10%, transparent);
        }
        .task-overview-scope-card--active::after {
          background: var(--scope-accent);
          opacity: 1;
        }
        .task-overview-scope-card__icon {
          grid-area: icon;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border-radius: 9px;
          color: var(--scope-accent);
          background: color-mix(in srgb, var(--scope-accent) 12%, #ffffff);
          font-size: 14px;
        }
        .task-overview-scope-card--active .task-overview-scope-card__icon {
          color: var(--scope-accent);
          background: color-mix(in srgb, var(--scope-accent) 14%, #ffffff);
        }
        .task-overview-scope-card__main {
          grid-area: main;
          display: grid;
          gap: 4px;
          min-width: 0;
        }
        .task-overview-scope-card__label {
          font-size: 13px;
          font-weight: 800;
          white-space: nowrap;
        }
        .task-overview-scope-card__hint {
          color: var(--overview-muted);
          font-size: 11px;
        }
        .task-overview-scope-card--active .task-overview-scope-card__hint {
          color: var(--scope-accent);
        }
        .task-overview-scope-card__count {
          grid-area: count;
          position: relative;
          z-index: 1;
          font-size: 20px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: -1px;
          color: var(--scope-accent);
        }
        .task-overview-section-card {
          margin-bottom: 20px;
          border-radius: 22px;
          border: 1px solid rgba(226, 232, 240, 0.95);
          background: rgba(255, 255, 255, 0.9);
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.04);
        }
        .task-overview-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }
        .task-overview-status-tile {
          height: 100%;
          min-height: 96px;
          border-radius: 16px;
          border: 1px solid color-mix(in srgb, var(--status-color) 12%, #e2e8f0);
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(255, 255, 255, 0.74)),
            var(--status-bg);
          padding: 16px;
        }
        .task-overview-compute-card {
          overflow: hidden;
        }
        .task-overview-compute-head {
          padding-bottom: 16px;
          border-bottom: 1px solid rgba(226, 232, 240, 0.8);
        }
        .task-overview-compute-tags {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 6px;
        }
        .task-overview-compute-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0;
          border: 1px solid rgba(226, 232, 240, 0.86);
          border-radius: 18px;
          overflow: hidden;
          background: #f8fafc;
        }
        .task-overview-resource-panel {
          padding: 18px;
          background: rgba(255, 255, 255, 0.78);
        }
        .task-overview-resource-panel + .task-overview-resource-panel {
          border-left: 1px solid rgba(226, 232, 240, 0.9);
        }
        .task-overview-resource-dot {
          display: inline-flex;
          width: 8px;
          height: 8px;
          border-radius: 999px;
          box-shadow: 0 0 0 4px rgba(148, 163, 184, 0.13);
        }
        .task-overview-latest-group {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 430px;
          max-height: 430px;
          border-radius: 18px;
          border: 1px solid color-mix(in srgb, var(--latest-status-color) 13%, #e2e8f0);
          background: #fff;
          overflow: hidden;
        }
        .task-overview-latest-group__head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          background: var(--latest-status-bg);
        }
        .task-overview-latest-group__title {
          display: inline-flex;
          align-items: center;
          gap: 14px;
          min-width: 0;
        }
        .task-overview-latest-group__hint {
          font-size: 14px;
          font-weight: 800;
          line-height: 1;
          white-space: nowrap;
        }
        .task-overview-latest-group__hint--pending {
          color: #ef4444;
        }
        .task-overview-latest-group__hint--using {
          color: #059669;
        }
        .task-overview-latest-group__body {
          flex: 1;
          padding: 12px;
          overflow: hidden;
        }
        .task-overview-latest-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .task-overview-item {
          width: 100%;
          min-height: 128px;
          text-align: left;
          border: 1px solid #eef2f7;
          background: #ffffff;
          border-radius: 14px;
          padding: 13px 14px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .task-overview-item__content {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: flex-start;
        }
        .task-overview-item__main {
          min-width: 0;
          flex: 1;
        }
        .task-overview-item__title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          min-width: 0;
        }
        .task-overview-item__name {
          max-width: 100%;
        }
        .task-overview-item__resource {
          display: block;
          max-width: 100%;
          margin-top: 10px;
          font-size: 12px;
          line-height: 1.55;
        }
        .task-overview-item__resource .ant-typography {
          display: block;
          max-width: 100%;
          font-size: 12px;
        }
        .task-overview-item:hover {
          border-color: #bfdbfe !important;
          box-shadow: 0 10px 26px rgba(37, 99, 235, 0.09);
          transform: translateY(-1px);
        }
        .task-overview-latest-pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          height: 44px;
          padding: 0 12px 14px;
        }
        .task-overview-latest-pagination__pages {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
        .task-overview-latest-pagination__arrow,
        .task-overview-latest-pagination__page {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 24px;
          height: 24px;
          padding: 0;
          border: none;
          background: transparent;
          color: var(--latest-status-color);
          cursor: pointer;
          font-size: 13px;
          font-weight: 700;
          line-height: 1;
          transition: color 0.2s ease, opacity 0.2s ease, transform 0.2s ease;
        }
        .task-overview-latest-pagination__arrow {
          font-size: 15px;
        }
        .task-overview-latest-pagination__arrow:disabled {
          cursor: not-allowed;
          opacity: 0.28;
        }
        .task-overview-latest-pagination__page {
          color: color-mix(in srgb, var(--latest-status-color) 78%, #64748b);
        }
        .task-overview-latest-pagination__page--active {
          border-radius: 999px;
          background: color-mix(in srgb, var(--latest-status-color) 12%, #ffffff);
          color: var(--latest-status-color);
        }
        .task-overview-latest-pagination__arrow:not(:disabled):hover,
        .task-overview-latest-pagination__page:hover {
          transform: translateY(-1px);
          color: color-mix(in srgb, var(--latest-status-color) 88%, #0f172a);
        }
        @media (max-width: 1180px) {
          .task-overview-hero {
            grid-template-columns: 1fr;
          }
          .task-overview-scope-grid {
            max-width: none;
            margin-left: 0;
          }
        }
        @media (max-width: 760px) {
          .task-overview-page {
            padding: 20px !important;
          }
          .task-overview-hero {
            padding: 0;
          }
          .task-overview-context-line {
            align-items: flex-start;
            flex-direction: column;
            gap: 4px;
          }
          .task-overview-scope-grid {
            grid-template-columns: 1fr;
          }
          .task-overview-section-head,
          .task-overview-compute-head {
            align-items: stretch;
            flex-direction: column;
          }
          .task-overview-compute-grid {
            grid-template-columns: 1fr;
          }
          .task-overview-resource-panel + .task-overview-resource-panel {
            border-left: none;
            border-top: 1px solid rgba(226, 232, 240, 0.9);
          }
          .task-overview-latest-grid {
            grid-template-columns: 1fr;
          }
          .task-overview-latest-group {
            min-height: 740px;
            max-height: 740px;
          }
        }
      `}</style>
    </div>
  )
}

interface ComputeOverviewCardProps {
  scopeLabel: string
  clusterName?: string
  capacity: CapacitySnapshot
  projectUsed: ResourceSnapshot
  clusterUsed: ResourceSnapshot
}

const ComputeOverviewCard: React.FC<ComputeOverviewCardProps> = ({ scopeLabel, clusterName, capacity, projectUsed, clusterUsed }) => (
  <Card className="task-overview-section-card task-overview-compute-card" styles={{ body: { padding: 22 } }}>
    <div className="task-overview-section-head task-overview-compute-head">
      <div>
        <Space size={10} style={{ marginBottom: 6 }}>
          <ClusterOutlined style={{ color: '#2563eb' }} />
          <Title level={4} style={{ margin: 0 }}>算力资源</Title>
        </Space>
        <Text type="secondary">当前项目与绑定集群的算力使用放在同一模块中对比查看。</Text>
      </div>
      <div className="task-overview-compute-tags">
        {capacity.computeTypes.map(type => (
          <Tag key={type} color={type === 'CPU' ? 'default' : 'blue'} style={{ margin: 0 }}>{type}</Tag>
        ))}
      </div>
    </div>

    <div className="task-overview-compute-grid">
      <ResourcePanel
        title="当前项目算力"
        subtitle="仅统计当前范围内运行中任务占用，分母为绑定集群总量"
        capacity={capacity}
        used={projectUsed}
        accent="#2563eb"
        badgeLabel={scopeLabel}
      />
      <ResourcePanel
        title="对应集群算力"
        subtitle={clusterName ? `集群整体运行占用：${clusterName}，包含平台基础占用，不受任务范围筛选影响` : '当前项目绑定集群整体运行占用，包含平台基础占用，不受任务范围筛选影响'}
        capacity={capacity}
        used={clusterUsed}
        accent="#059669"
        badgeLabel="集群总量"
      />
    </div>
  </Card>
)

interface ResourcePanelProps {
  title: string
  subtitle: string
  capacity: CapacitySnapshot
  used: ResourceSnapshot
  accent: string
  badgeLabel?: string
}

const ResourcePanel: React.FC<ResourcePanelProps> = ({ title, subtitle, capacity, used, accent, badgeLabel }) => {
  const metrics = [
    { label: '已使用卡数', total: capacity.cards, used: used.cards, suffix: '卡' },
    { label: '已使用显存', total: capacity.vramGb, used: used.vramGb, suffix: 'GB' },
    { label: '已使用 CPU', total: capacity.cpu, used: used.cpu, suffix: '核' },
    { label: '已使用内存', total: capacity.memoryGb, used: used.memoryGb, suffix: 'GB' },
  ]

  return (
    <div className="task-overview-resource-panel">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
        <div style={{ minWidth: 0 }}>
          <Space size={10} wrap style={{ marginBottom: 8 }}>
            <span className="task-overview-resource-dot" style={{ background: accent }} />
            <Title level={5} style={{ margin: 0 }}>{title}</Title>
            {badgeLabel && (
              <Tag style={{ margin: 0, borderRadius: 999, color: accent, background: `${accent}10`, border: `1px solid ${accent}22` }}>
                {badgeLabel}
              </Tag>
            )}
          </Space>
          <Text type="secondary">{subtitle}</Text>
        </div>
      </div>

      <Row gutter={[14, 14]}>
        {metrics.map(metric => {
          const percent = metric.total ? Math.min(100, Math.round((metric.used / metric.total) * 100)) : 0
          return (
            <Col xs={24} sm={12} key={metric.label}>
              <div
                style={{
                  borderRadius: 16,
                  background: '#f8fafc',
                  border: '1px solid #eef2f7',
                  padding: 14,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text type="secondary">{metric.label}</Text>
                  <Text strong style={{ color: accent }}>
                    {metric.used}/{metric.total}{metric.suffix}
                  </Text>
                </div>
                <Progress percent={percent} size="small" showInfo={false} strokeColor={accent} />
              </div>
            </Col>
          )
        })}
      </Row>
    </div>
  )
}

export default TaskOverview
