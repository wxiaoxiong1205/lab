import React from 'react'
import { Alert, Card, Col, Row, Spin, Table, Tabs, Tag, Typography } from 'antd'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { finetuneTaskService } from '@/services/FinetuneTrainingServices'
import { formatNumberForChart, formatNumberForTable } from '@/utils/numberFormatter'

const { Text } = Typography

const MLFLOW_CARD_MAX_HEIGHT = 800

const TRAINING_METRIC_ORDER = [
  'loss',
  'eval_loss',
  'train_loss',
  'perplexity',
  'eval_perplexity',
  'accuracy',
  'eval_accuracy',
  'learning_rate',
  'grad_norm',
  'epoch',
  'eval_runtime',
  'eval_samples_per_second',
  'eval_steps_per_second',
]

interface MLflowInfoProps {
  runDetail: any
}

interface MetricDataPoint {
  value: number
  timestamp: number
  step: number
}

interface MLflowData {
  task_id: number
  task_name: string
  version: string
  project_name: string
  experiment_name: string
  run_name: string
  run_info: {
    run_uuid: string
    experiment_id: string
    name: string
    status: string
    start_time: number
    end_time: number
    user_id: string
    artifact_uri: string
  }
  params: Record<string, string>
  metrics: Record<string, MetricDataPoint[]>
  tags: Record<string, string>
  latest_metrics: Record<string, number>
  mlflow_available: boolean
  error_message?: string
}

const MLflowInfo: React.FC<MLflowInfoProps> = ({ runDetail }) => {
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams] = useSearchParams()
  const version = searchParams.get('version') || runDetail.version
  // 使用React Query获取MLflow信息
  const {
    data: mlflowData,
    isLoading: loading,
    error: queryError,
  } = useQuery<MLflowData>({
    queryKey: ['mlflowInfo', projectId, runDetail?.name, version],
    queryFn: async () => {
      if (!projectId || !runDetail?.name || !version) {
        throw new Error('缺少必要参数')
      }

      const data = await finetuneTaskService.getTaskVersionMLflowInfo(
        Number(projectId),
        runDetail.name,
        version,
      )
      return data
    },
    enabled: !!projectId && !!runDetail?.name && !!version,
    retry: 2,
    staleTime: 30 * 1000, // 30秒内数据被认为是新鲜的
    refetchOnWindowFocus: false,
  })

  // 处理错误状态
  const error = queryError ? '获取MLflow信息失败，请稍后重试' : null

  const normalizeMetricData = (data: MetricDataPoint[]) => {
    if (!Array.isArray(data)) return []

    return data
      .map((point, index) => ({
        value: Number(point.value),
        timestamp: Number(point.timestamp),
        step: Number.isFinite(Number(point.step)) ? Number(point.step) : index,
      }))
      .filter((point) => Number.isFinite(point.value) && Number.isFinite(point.step))
      .sort((a, b) => a.step - b.step)
  }

  const getTrainingMetrics = () => {
    if (!mlflowData?.metrics) return []

    return Object.entries(mlflowData.metrics)
      .map(([metricName, metricData]) => ({
        metricName,
        data: normalizeMetricData(metricData),
      }))
      .filter((metric) => metric.data.length > 0)
      .sort((a, b) => {
        const aIndex = TRAINING_METRIC_ORDER.indexOf(a.metricName)
        const bIndex = TRAINING_METRIC_ORDER.indexOf(b.metricName)
        const aOrder = aIndex === -1 ? TRAINING_METRIC_ORDER.length : aIndex
        const bOrder = bIndex === -1 ? TRAINING_METRIC_ORDER.length : bIndex

        if (aOrder !== bOrder) return aOrder - bOrder
        return a.metricName.localeCompare(b.metricName)
      })
  }

  // 格式化时间戳
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('zh-CN')
  }

  // 格式化时长
  const formatDuration = (startTime: number, endTime: number) => {
    if (!endTime) return '运行中'
    const duration = endTime - startTime
    const hours = Math.floor(duration / 3600)
    const minutes = Math.floor((duration % 3600) / 60)
    const seconds = duration % 60
    return `${hours}h ${minutes}m ${seconds}s`
  }

  // 渲染信息表格
  const renderInfoTable = () => {
    if (!mlflowData) return null

    const infoData = [
      { key: '任务ID', value: mlflowData.task_id },
      { key: '任务名称', value: mlflowData.task_name },
      { key: '版本', value: mlflowData.version },
      { key: '项目名称', value: mlflowData.project_name },
      { key: '实验名称', value: mlflowData.experiment_name },
      { key: '运行名称', value: mlflowData.run_name },
      { key: '运行UUID', value: mlflowData.run_info.run_uuid },
      { key: '实验ID', value: mlflowData.run_info.experiment_id },
      { key: '状态', value: mlflowData.run_info.status },
      { key: '开始时间', value: formatTimestamp(mlflowData.run_info.start_time) },
      { key: '结束时间', value: mlflowData.run_info.end_time ? formatTimestamp(mlflowData.run_info.end_time) : '未结束' },
      { key: '运行时长', value: formatDuration(mlflowData.run_info.start_time, mlflowData.run_info.end_time) },
      { key: '用户ID', value: mlflowData.run_info.user_id },
      { key: '产物URI', value: mlflowData.run_info.artifact_uri },
    ]

    const columns = [
      {
        title: '信息项',
        dataIndex: 'key',
        key: 'key',
        width: '30%',
      },
      {
        title: '值',
        dataIndex: 'value',
        key: 'value',
        render: (value: any) => (
          <Text code className="break-all">
            {String(value)}
          </Text>
        ),
      },
    ]

    return (
      <Table
        columns={columns}
        dataSource={infoData}
        pagination={false}
        size="small"
        showHeader
        bordered={false}
      />
    )
  }

  // 渲染参数表格
  const renderParamsTable = () => {
    if (!mlflowData?.params || Object.keys(mlflowData.params).length === 0) {
      return <Alert message="暂无参数配置" type="info" showIcon />
    }

    const paramData = Object.entries(mlflowData.params).map(([key, value]) => ({
      key,
      value,
    }))

    const columns = [
      {
        title: '参数名称',
        dataIndex: 'key',
        key: 'key',
        width: '40%',
      },
      {
        title: '参数值',
        dataIndex: 'value',
        key: 'value',
        render: (value: any) => (
          <Text code className="break-all">
            {String(value)}
          </Text>
        ),
      },
    ]

    return (
      <div className="max-h-[800px]">
        <Table
          columns={columns}
          dataSource={paramData}
          pagination={false}
          size="small"
          bordered={false}
        />
      </div>
    )
  }

  // 渲染标签表格
  const renderTagsTable = () => {
    if (!mlflowData?.tags || Object.keys(mlflowData.tags).length === 0) {
      return <Alert message="暂无标签信息" type="info" showIcon />
    }

    const tagData = Object.entries(mlflowData.tags).map(([key, value]) => ({
      key,
      value,
    }))

    const columns = [
      {
        title: '标签名称',
        dataIndex: 'key',
        key: 'key',
        width: '40%',
      },
      {
        title: '标签值',
        dataIndex: 'value',
        key: 'value',
        render: (value: any) => (
          <Tag color="blue">{String(value)}</Tag>
        ),
      },
    ]

    return (
      <Table
        columns={columns}
        dataSource={tagData}
        pagination={false}
        size="small"
        bordered={false}
      />
    )
  }

  // 渲染当前指标表格
  const renderLatestMetricsTable = () => {
    if (!mlflowData?.latest_metrics || Object.keys(mlflowData.latest_metrics).length === 0) {
      return <Alert message="暂无当前指标" type="info" showIcon />
    }

    const metricData = Object.entries(mlflowData.latest_metrics).map(([key, value]) => ({
      key,
      value,
    }))

    const columns = [
      {
        title: '指标名称',
        dataIndex: 'key',
        key: 'key',
        width: '50%',
      },
      {
        title: '指标值',
        dataIndex: 'value',
        key: 'value',
        render: (value: number) => (
          <Text strong className="text-[var(--lab-color-brand-primary)] text-[14px]">
            {formatNumberForTable(value)}
          </Text>
        ),
      },
    ]

    return (
      <Table
        columns={columns}
        dataSource={metricData}
        pagination={false}
        size="small"
        bordered={false}
        showHeader
      />
    )
  }

  // 渲染单个指标图表
  const renderMetricChart = (metricName: string, data: MetricDataPoint[]) => {
    const sortedData = normalizeMetricData(data)
    if (sortedData.length === 0) return null

    return (
      <Card
        title={metricName}
        size="small"
        className="h-full"
        styles={
          { header: { backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' },
            body: { padding: '12px', height: 'calc(100% - 57px)' },
          }
        }
      >
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={sortedData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" />
            <XAxis
              dataKey="step"
              name="Step"
              tick={{ fontSize: 12 }}
              axisLine={{ stroke: '#d9d9d9' }}
              tickLine={{ stroke: '#d9d9d9' }}
            />
            <YAxis
              name={metricName}
              tick={{ fontSize: 12 }}
              axisLine={{ stroke: '#d9d9d9' }}
              tickLine={{ stroke: '#d9d9d9' }}
            />
            <Tooltip
              formatter={(value: number) => [formatNumberForChart(value), metricName]}
              labelFormatter={(step) => `Step: ${step}`}
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #d9d9d9',
                borderRadius: '6px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#1890ff"
              strokeWidth={1}
              dot={{ r: 1.5, fill: '#1890ff' }}
              activeDot={{ r: 3, fill: '#1890ff' }}
              name={metricName}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    )
  }

  // 渲染训练曲线
  const renderTrainingCurves = () => {
    const availableMetrics = getTrainingMetrics()

    if (availableMetrics.length === 0) {
      return (
        <Card
          title="训练曲线"
          size="small"
          className="h-full overflow-hidden"
          styles={
            { header: { backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' },
              body: { maxHeight: MLFLOW_CARD_MAX_HEIGHT - 57, overflow: 'auto', padding: '12px' },
            }
          }
        >
          <Alert message="暂无训练指标数据" type="info" showIcon />
        </Card>
      )
    }

    return (
      <Card
        title="训练曲线"
        size="small"
        className="h-full overflow-hidden"
        styles={
          { header: { backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' },
            body: { maxHeight: MLFLOW_CARD_MAX_HEIGHT - 57, overflow: 'auto', padding: '12px' },
          }
        }
      >
        <Row gutter={[16, 16]}>
          {availableMetrics.map(({ metricName, data }) => (
            <Col key={metricName} xs={24} sm={12} lg={12}>
              {renderMetricChart(metricName, data)}
            </Col>
          ))}
        </Row>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="text-center p-[50px]">
        <Spin tip="加载MLflow信息中..." />
      </div>
    )
  }

  if (error) {
    return (
      <Alert
        message="获取MLflow信息失败"
        description={error}
        type="error"
        showIcon
      />
    )
  }

  if (!mlflowData) {
    return (
      <Alert
        message="暂无MLflow信息"
        description="该训练任务版本暂无MLflow相关信息"
        type="info"
        showIcon
      />
    )
  }

  if (!mlflowData.mlflow_available) {
    return (
      <Alert
        message="训练指标初始化中..."
        description={mlflowData.error_message || '正在初始化训练运行'}
        type="warning"
        showIcon
      />
    )
  }

  // 渲染左侧信息Tabs
  const renderInfoTabs = () => {
    // const tabItems = [
    //   {
    //     key: 'info',
    //     label: '运行信息',
    //     children: renderInfoTable(),
    //   },
    //   {
    //     key: 'params',
    //     label: '参数配置',
    //     children: renderParamsTable(),
    //   },
    //   {
    //     key: 'tags',
    //     label: '标签信息',
    //     children: renderTagsTable(),
    //   },
    //   {
    //     key: 'metrics',
    //     label: '当前指标',
    //     children: renderLatestMetricsTable(),
    //   },
    // ].filter(item => item.children !== null); // 过滤掉没有内容的tab

    const metricsTab = [
      {
        key: 'metrics',
        label: '当前指标',
        children: renderLatestMetricsTable(),
      },
    ]

    return (
      <Card
        title="基本信息汇总"
        size="small"
        className="h-full overflow-hidden"
        styles={
          { header: { backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' },
            body: { maxHeight: MLFLOW_CARD_MAX_HEIGHT - 57, overflow: 'auto', padding: '12px' },
          }
        }
      >
        <Tabs
          defaultActiveKey="metrics"
          size="small"
          items={metricsTab}
          tabPosition="top"
        />
      </Card>
    )
  }

  return (
    <Row gutter={16} className="h-full max-h-[800px]">
      <Col span={10}>
        {renderInfoTabs()}
      </Col>
      <Col span={14}>
        {renderTrainingCurves()}
      </Col>
    </Row>
  )
}

export default MLflowInfo
