import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Col, Descriptions, Divider, Empty, Progress, Row, Space, Spin, Statistic, Tabs, Tag, Timeline, Typography, message } from 'antd'
import { AppstoreOutlined, AreaChartOutlined, CheckCircleOutlined, ClusterOutlined, CodeOutlined, CopyOutlined, ReloadOutlined, RollbackOutlined, StopOutlined } from '@ant-design/icons'
import { Line } from '@ant-design/plots'
import FinetuneTaskStatusIndicator from '../components/finetune/FinetuneTaskStatusIndicator'
import { cloneFinetuneTask, getFinetuneTaskDetail, getFinetuneTaskLogs, getFinetuneTaskMetrics, stopFinetuneTask } from '../services/finetuneTaskService'
import { useProjectStore } from '../stores/projectStore'
import type { KubernetesResourceRequirements } from '../types'
import './styles/finetune.scss'

const { Title, Text } = Typography
const { TabPane } = Tabs
interface TaskMetric {
  epoch: number
  loss: number
  val_loss?: number
  learning_rate?: number
}
interface ProgressStep {
  name: string
  description?: string
  completed: boolean
  current: boolean
}
interface Task {
  id: string
  name: string
  status: string
  base_model: string
  base_model_display?: string
  dataset_name: string
  record_count?: number
  started_at?: string
  completed_at?: string
  duration?: string
  resource_requirements?: KubernetesResourceRequirements
  kubernetes_info?: {
    namespace?: string
    pod_name?: string
    job_name?: string
    node_name?: string
    cluster_name?: string
  }
  description?: string
  hyperparameters?: Record<string, unknown>
  progress: number
  progress_info?: {
    steps?: ProgressStep[]
  }
  output_model_id?: string
  output_model_name?: string
}
/**
 * 微调任务详情页面
 * 显示单个微调任务的详细信息
 */
const FinetuneTaskDetail: React.FC = () => {
  const { projectId, taskId } = useParams<{
    projectId: string
    taskId: string
  }>()
  const navigate = useNavigate()
  const { currentProject } = useProjectStore()
  const [task, setTask] = useState<Task | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [metrics, setMetrics] = useState<TaskMetric[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [logsLoading, setLogsLoading] = useState<boolean>(false)
  const [metricsLoading, setMetricsLoading] = useState<boolean>(false)
  const [activeTab, setActiveTab] = useState<string>('overview')
  // 确保有效的项目ID
  const getProjectPath = () => {
    // 首先使用URL中的projectId
    if (projectId) {
      return `/project/${projectId}`
    }
    // 否则使用全局存储的项目ID
    if (currentProject?.id) {
      return `/project/${currentProject.id}`
    }
    // 如果都没有，显示错误并返回到项目列表
    message.error('未找到项目信息，请先选择一个项目')
    navigate('/projects')
    return ''
  }
  // 加载任务详情
  const fetchTaskDetail = async () => {
    if (!taskId)
      return
    setLoading(true)
    try {
      const data = await getFinetuneTaskDetail(taskId)
      setTask(data)
    }
    catch (error) {
      message.error('加载任务详情失败')
      console.error('Failed to fetch task detail:', error)
    }
    finally {
      setLoading(false)
    }
  }
  // 加载日志
  const fetchLogs = async () => {
    if (!taskId)
      return
    setLogsLoading(true)
    try {
      const data = await getFinetuneTaskLogs(taskId, 200)
      setLogs(data.logs || [])
    }
    catch (error) {
      console.error('Failed to fetch task logs:', error)
      message.error('加载日志失败')
    }
    finally {
      setLogsLoading(false)
    }
  }
  // 加载指标
  const fetchMetrics = async () => {
    if (!taskId)
      return
    setMetricsLoading(true)
    try {
      const data = await getFinetuneTaskMetrics(taskId)
      // 确保 metrics 是一个数组，处理各种可能的响应格式
      let metricsData: TaskMetric[] = []
      if (data) {
        if (Array.isArray(data)) {
          metricsData = data
        }
        else if (data.metrics) {
          if (Array.isArray(data.metrics)) {
            metricsData = data.metrics
          }
          else if (data.metrics && typeof data.metrics === 'object') {
            // 单个指标对象，包装为数组
            metricsData = [data.metrics]
          }
        }
        else if (typeof data === 'object' && Object.keys(data).length > 0) {
          // 尝试将整个响应对象作为单个指标处理
          metricsData = [data]
        }
      }
      console.log('Fetched metrics data:', metricsData)
      setMetrics(metricsData)
    }
    catch (error) {
      console.error('Failed to fetch task metrics:', error)
      message.error('加载指标失败')
      setMetrics([]) // 出错时设置为空数组
    }
    finally {
      setMetricsLoading(false)
    }
  }
  // 初始加载
  useEffect(() => {
    fetchTaskDetail()
    // 设置定时刷新
    const interval = setInterval(() => {
      fetchTaskDetail()
      if (activeTab === 'logs') {
        fetchLogs()
      }
      else if (activeTab === 'metrics') {
        fetchMetrics()
      }
    }, 30000) // 每30秒刷新一次
    return () => clearInterval(interval)
  }, [taskId, activeTab])
  // 处理标签切换
  const handleTabChange = (key: string) => {
    setActiveTab(key)
    if (key === 'logs') {
      fetchLogs()
    }
    else if (key === 'metrics') {
      fetchMetrics()
    }
  }
  // 刷新
  const handleRefresh = () => {
    fetchTaskDetail()
    if (activeTab === 'logs') {
      fetchLogs()
    }
    else if (activeTab === 'metrics') {
      fetchMetrics()
    }
  }
  // 返回训练列表
  const handleGoBack = () => {
    const basePath = getProjectPath()
    if (basePath) {
      navigate(`${basePath}/training`)
    }
  }
  // 停止任务
  const handleStopTask = async () => {
    if (!taskId)
      return
    try {
      await stopFinetuneTask(taskId)
      message.success('任务已停止')
      fetchTaskDetail()
    }
    catch (error) {
      message.error('停止任务失败')
      console.error('Failed to stop task:', error)
    }
  }
  // 克隆任务
  const handleCloneTask = async () => {
    if (!taskId)
      return
    try {
      const result = await cloneFinetuneTask(taskId)
      message.success('任务已克隆')
      // 重定向到创建页面
      const basePath = getProjectPath()
      if (basePath) {
        navigate(`${basePath}/training/create?clone=${taskId}`)
      }
    }
    catch (error) {
      message.error('克隆任务失败')
      console.error('Failed to clone task:', error)
    }
  }
  // 查看模型
  const handleViewModel = () => {
    if (!task?.output_model_id) {
      message.info('任务尚未完成，暂无输出模型')
      return
    }
    const basePath = getProjectPath()
    if (basePath) {
      navigate(`${basePath}/models/${task.output_model_id}`)
    }
  }
  // 获取任务状态
  const getTaskStatus = () => {
    if (!task)
      return 'pending'
    return task.status
  }
  // 判断任务是否运行中
  const isTaskRunning = () => {
    if (!task)
      return false
    return task.status === 'running' || task.status === 'preparing'
  }
  // 判断任务是否已完成
  const isTaskCompleted = () => {
    if (!task)
      return false
    return task.status === 'completed'
  }
  // 渲染概览
  const renderOverview = () => {
    if (!task)
      return <Empty description="暂无任务数据" />
    return (
      <div className="task-overview">
        <Card title="基本信息" size="small" className="mb-4">
          <Descriptions column={2} size="small">
            <Descriptions.Item label="任务名称">{task.name}</Descriptions.Item>
            <Descriptions.Item label="任务状态">
              <FinetuneTaskStatusIndicator status={task.status} />
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {task.started_at
                ? new Date(task.started_at).toLocaleString()
                : '未开始'}
            </Descriptions.Item>
            <Descriptions.Item label="完成时间">
              {task.completed_at
                ? new Date(task.completed_at).toLocaleString()
                : '未完成'}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="模型配置" size="small" className="mb-4">
          <Descriptions column={2} size="small">
            <Descriptions.Item label="基础模型">
              {task.base_model_display || task.base_model}
            </Descriptions.Item>
            <Descriptions.Item label="数据集">
              {task.dataset_name}
            </Descriptions.Item>
            <Descriptions.Item label="输出模型">
              {task.output_model_name || '未设置'}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="资源配置" size="small" className="mb-4">
          {task.resource_requirements ? (
            <div>
              <Row gutter={16}>
                <Col span={12}>
                  <Descriptions column={1} size="small" title="CPU资源">
                    <Descriptions.Item label="请求">
                      {task.resource_requirements.cpu?.request || '未设置'}
                    </Descriptions.Item>
                    <Descriptions.Item label="限制">
                      {task.resource_requirements.cpu?.limit || '未设置'}
                    </Descriptions.Item>
                  </Descriptions>
                </Col>
                <Col span={12}>
                  <Descriptions column={1} size="small" title="内存资源">
                    <Descriptions.Item label="请求">
                      {task.resource_requirements.memory?.request || '未设置'}
                    </Descriptions.Item>
                    <Descriptions.Item label="限制">
                      {task.resource_requirements.memory?.limit || '未设置'}
                    </Descriptions.Item>
                  </Descriptions>
                </Col>
              </Row>
              <Divider />
              <Row gutter={16}>
                <Col span={12}>
                  <Descriptions column={1} size="small" title="GPU资源">
                    <Descriptions.Item label="数量">
                      {task.resource_requirements.gpu?.count || 0}
                    </Descriptions.Item>
                    <Descriptions.Item label="类型">
                      {task.resource_requirements.gpu?.type || '未设置'}
                    </Descriptions.Item>
                    <Descriptions.Item label="型号">
                      {task.resource_requirements.gpu?.model || '未设置'}
                    </Descriptions.Item>
                  </Descriptions>
                </Col>
                <Col span={12}>
                  <Descriptions column={1} size="small" title="存储资源">
                    <Descriptions.Item label="大小">
                      {task.resource_requirements.storage?.size || '未设置'}
                    </Descriptions.Item>
                    <Descriptions.Item label="类型">
                      {task.resource_requirements.storage?.type || '未设置'}
                    </Descriptions.Item>
                    <Descriptions.Item label="挂载路径">
                      {task.resource_requirements.storage?.mountPath || '未设置'}
                    </Descriptions.Item>
                  </Descriptions>
                </Col>
              </Row>
            </div>
          ) : (<Empty description="未配置资源要求" />)}
        </Card>

        <Card
          title={(
            <Space>
              <ClusterOutlined />
              Kubernetes 信息
            </Space>
          )}
          size="small"
          className="mb-4"
        >
          {task.kubernetes_info ? (
            <Descriptions column={2} size="small">
              <Descriptions.Item label="命名空间">
                <Tag color="blue">{task.kubernetes_info.namespace || '未设置'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="集群名称">
                <Tag color="green">{task.kubernetes_info.cluster_name || '未设置'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Pod名称">
                <Text code>{task.kubernetes_info.pod_name || '未设置'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Job名称">
                <Text code>{task.kubernetes_info.job_name || '未设置'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="节点名称">
                <Text code>{task.kubernetes_info.node_name || '未设置'}</Text>
              </Descriptions.Item>
            </Descriptions>
          ) : (<Empty description="未获取到Kubernetes信息" />)}
        </Card>

        <Card title="超参数配置" size="small" className="mb-4">
          {task.hyperparameters ? (
            <Descriptions column={2} size="small">
              <Descriptions.Item label="学习率">
                {String(task.hyperparameters.learning_rate || '未设置')}
              </Descriptions.Item>
              <Descriptions.Item label="训练轮次">
                {String(task.hyperparameters.epochs || '未设置')}
              </Descriptions.Item>
              <Descriptions.Item label="批大小">
                {String(task.hyperparameters.batch_size || '未设置')}
              </Descriptions.Item>
              <Descriptions.Item label="优化器">
                {String(task.hyperparameters.optimizer || '未设置')}
              </Descriptions.Item>
              <Descriptions.Item label="预热比例">
                {String(task.hyperparameters.warmup_ratio || '未设置')}
              </Descriptions.Item>
              <Descriptions.Item label="权重衰减">
                {String(task.hyperparameters.weight_decay || '未设置')}
              </Descriptions.Item>
            </Descriptions>
          ) : (<Empty description="未配置超参数" />)}
        </Card>

        <Card title="训练进度" size="small" className="mb-4">
          <Progress
            percent={task.progress}
            status={task.status === 'completed'
              ? 'success'
              : task.status === 'failed'
                ? 'exception'
                : 'active'}
            showInfo
            format={(percent) => `${percent}%`}
          />

          {task.progress_info?.steps && (
            <div className="mt-4">
              <Timeline>
                {task.progress_info.steps.map((step, index) => (
                  <Timeline.Item
                    key={index}
                    color={step.completed
                      ? 'green'
                      : step.current
                        ? 'blue'
                        : 'gray'}
                    dot={step.completed ? (<CheckCircleOutlined style={{ color: 'green' }} />) : undefined}
                  >
                    <div>
                      <Text strong>{step.name}</Text>
                      {step.description && (
                        <div className="mt-1">
                          <Text type="secondary">{step.description}</Text>
                        </div>
                      )}
                    </div>
                  </Timeline.Item>
                ))}
              </Timeline>
            </div>
          )}
        </Card>
      </div>
    )
  }
  // 渲染指标
  const renderMetrics = () => {
    if (metricsLoading) {
      return (
        <div className="text-center p-[50px]">
          <Spin size="large" />
        </div>
      )
    }
    if (!metrics || metrics.length === 0) {
      return (
        <div className="text-center p-[50px]">
          <Empty description="暂无指标数据" />
        </div>
      )
    }
    // 准备图表数据
    const chartData = metrics.map((metric, index) => ({
      epoch: metric.epoch || index + 1,
      loss: metric.loss,
      val_loss: metric.val_loss,
      learning_rate: metric.learning_rate,
    }))
    // 损失曲线配置
    const lossConfig = {
      data: chartData,
      xField: 'epoch',
      yField: 'loss',
      smooth: true,
      lineStyle: {
        lineWidth: 2,
      },
      point: {
        size: 3,
        shape: 'circle',
      },
      tooltip: {
        formatter: (datum: any) => ({
          name: 'Training Loss',
          value: datum.loss?.toFixed(4) || 'N/A',
        }),
      },
      yAxis: {
        title: {
          text: 'Loss',
        },
      },
      xAxis: {
        title: {
          text: 'Epoch',
        },
      },
    }
    // 学习率曲线配置
    const learningRateConfig = {
      data: chartData.filter((d) => d.learning_rate !== undefined),
      xField: 'epoch',
      yField: 'learning_rate',
      smooth: true,
      lineStyle: {
        lineWidth: 2,
        stroke: '#ff7f0e',
      },
      point: {
        size: 3,
        shape: 'circle',
        style: {
          fill: '#ff7f0e',
          stroke: '#ff7f0e',
        },
      },
      tooltip: {
        formatter: (datum: any) => ({
          name: 'Learning Rate',
          value: datum.learning_rate?.toExponential(2) || 'N/A',
        }),
      },
      yAxis: {
        title: {
          text: 'Learning Rate',
        },
      },
      xAxis: {
        title: {
          text: 'Epoch',
        },
      },
    }
    return (
      <div className="task-metrics">
        <Row gutter={16}>
          <Col span={12}>
            <Card title="训练损失" size="small" className="mb-4">
              <Line {...lossConfig} />
            </Card>
          </Col>
          <Col span={12}>
            <Card title="学习率" size="small" className="mb-4">
              {chartData.some((d) => d.learning_rate !== undefined) ? (<Line {...learningRateConfig} />) : (<Empty description="暂无学习率数据" />)}
            </Card>
          </Col>
        </Row>

        <Card title="详细指标" size="small">
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th>Epoch</th>
                  <th>Loss</th>
                  <th>Val Loss</th>
                  <th>Learning Rate</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((metric, index) => (
                  <tr key={index}>
                    <td>{metric.epoch}</td>
                    <td>{metric.loss?.toFixed(4) || 'N/A'}</td>
                    <td>{metric.val_loss?.toFixed(4) || 'N/A'}</td>
                    <td>{metric.learning_rate?.toExponential(2) || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    )
  }
  // 渲染日志
  const renderLogs = () => {
    if (logsLoading) {
      return (
        <div className="text-center p-[50px]">
          <Spin size="large" />
        </div>
      )
    }
    if (!logs || logs.length === 0) {
      return (
        <div className="text-center p-[50px]">
          <Empty description="暂无日志数据" />
        </div>
      )
    }
    return (
      <div className="task-logs">
        <Card
          title={(
            <Space>
              <CodeOutlined />
              训练日志
            </Space>
          )}
          size="small"
          extra={(
            <Button type="text" icon={<ReloadOutlined />} onClick={fetchLogs} loading={logsLoading}>
              刷新
            </Button>
          )}
        >
          <div
            className="p-[16px] rounded-[4px] text-[12px] max-h-[500px] overflow-y-auto whitespace-pre-wrap"
            style={{
              backgroundColor: '#1e1e1e',
              color: '#d4d4d4',
              fontFamily: 'Monaco, \'Courier New\', monospace',
              lineHeight: '1.5',
            }}
          >
            {logs.map((log, index) => (
              <div key={index} className="mb-1">
                {log}
              </div>
            ))}
          </div>
        </Card>
      </div>
    )
  }
  if (loading) {
    return (
      <div className="text-center py-[100px]">
        <Spin size="large" />
      </div>
    )
  }
  if (!task) {
    return (
      <div className="text-center py-[100px]">
        <Empty description="任务不存在" />
      </div>
    )
  }
  return (
    <div className="finetune-task-detail">
      <div className="page-header">
        <div className="header-content">
          <Space>
            <Button type="text" icon={<RollbackOutlined />} onClick={handleGoBack}>
              返回
            </Button>
            <Title level={3} className="m-0">
              {task.name}
            </Title>
            <FinetuneTaskStatusIndicator status={task.status} />
          </Space>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>
              刷新
            </Button>
            <Button icon={<CopyOutlined />} onClick={handleCloneTask} disabled={loading}>
              克隆
            </Button>
            {isTaskRunning() && (
              <Button danger icon={<StopOutlined />} onClick={handleStopTask} disabled={loading}>
                停止
              </Button>
            )}
            {isTaskCompleted() && task.output_model_id && (
              <Button type="primary" icon={<AppstoreOutlined />} onClick={handleViewModel}>
                查看模型
              </Button>
            )}
          </Space>
        </div>
      </div>

      <div className="page-content">
        <Tabs activeKey={activeTab} onChange={handleTabChange}>
          <TabPane tab="概览" key="overview">
            {renderOverview()}
          </TabPane>
          <TabPane
            tab={(
              <Space>
                <AreaChartOutlined />
                指标
              </Space>
            )}
            key="metrics"
          >
            {renderMetrics()}
          </TabPane>
          <TabPane
            tab={(
              <Space>
                <CodeOutlined />
                日志
              </Space>
            )}
            key="logs"
          >
            {renderLogs()}
          </TabPane>
        </Tabs>
      </div>
    </div>
  )
}
export default FinetuneTaskDetail
