import React, { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Empty,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip as RechartTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import {
  BarChartOutlined,
  CompressOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  FilterOutlined,
  InfoCircleOutlined,
  LineChartOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { testRunApi } from '../services/api'
import type { TestRun, TestRunSearchParams } from '../types'
import useI18n from '../hooks/useI18n'
import EvaluationTaskCreateModal from '../components/evaluation/EvaluationTaskCreateModal'

const { confirm } = Modal

// 指标颜色配置数组
export const metricColors = [
  {
    key: 'Answer Relevancy',
    background: '#d9f7be',
    color: '#389e0d',
  },
  {
    key: 'Format Correctness',
    background: '#fff1b8',
    color: '#d48806',
  },

  {
    key: 'Faithfulness',
    background: '#bae7ff',
    color: '#096dd9',
  },
  {
    key: 'Helpfulness',
    background: '#d3adf7',
    color: '#722ed1',
  },
  {
    key: 'Correctness',
    background: '#ffe7ba',
    color: '#d46b08',
  },
  {
    key: 'G-Eval',
    background: '#efdbff',
    color: '#531dab',
  },
  {
    key: 'DAG',
    background: '#f4ffb8',
    color: '#5b8c00',
  },
  {
    key: 'Contextual Relevancy',
    background: '#b5f5ec',
    color: '#006d75',
  },
  {
    key: 'Contextual Precision',
    background: '#d6e4ff',
    color: '#1d39c4',
  },
  {
    key: 'Contextual Recall',
    background: '#ffd6e7',
    color: '#c41d7f',
  },
  {
    key: 'Tool Correctness',
    background: '#fff2e8',
    color: '#873800',
  },
  {
    key: 'Task Completion',
    background: '#d6f5d6',
    color: '#237804',
  },
  {
    key: 'Json Correctness',
    background: '#ffffb8',
    color: '#ad8b00',
  },
  {
    key: 'Ragas',
    background: '#f0f5ff',
    color: '#10239e',
  },
  {
    key: 'Hallucination',
    background: '#ffd8bf',
    color: '#d4380d',
  },
  {
    key: 'Toxicity',
    background: '#ffbbbb',
    color: '#a8071a',
  },
  {
    key: 'Bias',
    background: '#e6fffb',
    color: '#08979c',
  },
  {
    key: 'Summarization',
    background: '#fff0f6',
    color: '#eb2f96',
  },
  {
    key: 'Liaison Correctness',
    background: '#ffd8bf',
    color: '#d4380d',
  },
  {
    key: 'Iaison Correctness',
    background: '#ffd8bf',
    color: '#d4380d',
  },
  {
    key: 'Liaision Correctness',
    background: '#ffd8bf',
    color: '#d4380d',
  },
]

// 使用16进制颜色定义指标主题
const METRIC_THEME = {
  // 通用错误颜色 (对应原来的红色系)
  error: {
    background: '#ffccc7',
    color: '#cf1322',
  },
  // 默认成功颜色 (高分) (对应原来的绿色系)
  success: {
    background: '#d9f7be',
    color: '#389e0d',
  },
  // 默认警告颜色 (中等分数) (对应原来的橙色系)
  warning: {
    background: '#ffe7ba',
    color: '#d46b08',
  },
  // 指标特定主题
  metrics: metricColors.reduce((acc, cur) => {
    acc[cur.key] = { background: cur.background, color: cur.color }
    return acc
  }, {} as Record<string, { background: string, color: string }>),
}

const getMetricTheme = (() => {
  // 缓存 name -> theme
  const nameToTheme = new Map<string, { background: string, color: string }>()
  // 已分配的 theme 下标
  let nextIndex = 0

  return (metricName: string) => {
    console.log(metricName, 'metricName')
    if (nameToTheme.has(metricName)) {
      return nameToTheme.get(metricName)!
    }
    // 如果 metricColors 用完，则循环使用
    const theme = metricColors[nextIndex % metricColors.length]
    const themeObj = { background: theme.background, color: theme.color }
    nameToTheme.set(metricName, themeObj)
    nextIndex += 1
    return themeObj
  }
})()

// 根据指标名称和分数获取样式
const getMetricStyle = (
  metricName: string,
  score: number,
): { background: string, color: string } => {
  // 检查 score 是否为有效数字
  const isValidScore = typeof score === 'number' && !isNaN(score)

  // 低分情况或无效分数统一使用错误样式
  if (!isValidScore || score <= 0.5) {
    return METRIC_THEME.error
  }

  // 查找匹配的指标主题
  // for (const [key, theme] of Object.entries(METRIC_THEME.metrics)) {
  //   if (metricName.includes(key)) {
  //     return theme;
  //   }
  // }

  const metricTheme = getMetricTheme(metricName)

  if (metricTheme) return metricTheme

  // 默认规则基于分数
  if (score >= 0.8) {
    return METRIC_THEME.success
  }
  else if (score >= 0.5) {
    return METRIC_THEME.warning
  }

  // 兜底错误样式
  return METRIC_THEME.error
}

// MetricTag 子组件
interface MetricTagProps {
  metricName: string
  metricScore: number
}

const MetricTag: React.FC<MetricTagProps> = ({ metricName, metricScore }) => {
  // 简化指标名称显示
  let displayName = metricName
  if (displayName.includes('(')) {
    displayName = displayName.split('(')[0].trim()
  }

  const { background, color } = getMetricStyle(metricName, metricScore)

  // 确保 metricScore 是有效数字
  const score
    = typeof metricScore === 'number' && !isNaN(metricScore)
      ? metricScore.toFixed(2)
      : '0.00'

  return (
    <Tag
      style={{
        backgroundColor: background,
        color,
      }}
    >
      {displayName}
      :
      {score}
    </Tag>
  )
}

// MetricScoreDisplay 子组件
interface MetricScoreDisplayProps {
  metrics: Record<string, unknown>[]
}

const MetricScoreDisplay: React.FC<MetricScoreDisplayProps> = ({ metrics }) => {
  const { t } = useI18n()

  if (!metrics || metrics.length === 0) {
    return null
  }

  // 将所有指标转换为显示元素
  const metricTags = metrics.map((metric, index) => {
    const metricName = metric.name || Object.keys(metric)[0] || ''
    // 确保 metricScore 是有效数字，如果不是则默认为 0
    const metricScore
      = typeof metric.averageScore === 'number'
        && !isNaN(metric.averageScore as number)
        ? (metric.averageScore as number)
        : 0

    return (
      <MetricTag
        key={index}
        metricName={metricName as string}
        metricScore={metricScore}
      />
    )
  })

  if (metrics.length > 5) {
    return (
      <Tooltip title={metricTags} placement="rightTop">
        <div className="flex flex-col items-start gap-2">
          {metricTags.slice(0, 5)}
          <div className="text-blue-500 text-xs">
            {t('evaluation.viewAllMetrics', { count: metrics.length })}
          </div>
        </div>
      </Tooltip>
    )
  }

  // 少量指标直接显示
  return <div className="flex flex-col items-start gap-2">{metricTags}</div>
}

// TestResultBar 子组件
interface TestResultBarProps {
  successfulCases: number
  totalCases: number
}

const TestResultBar: React.FC<TestResultBarProps> = ({
  successfulCases,
  totalCases,
}) => {
  const failRate = totalCases - successfulCases / totalCases
  const { t } = useI18n()

  return (
    <div className="flex gap-2">
      <div className="w-[120px] bg-green-300 rounded-lg h-4 overflow-hidden">
        <div
          className="h-4 rounded-lg transition-all duration-300 bg-red-400"
          style={{
            width: `${failRate * 100}%`,
          }}
        />
      </div>
      <div className="text-xs text-gray-500 flex justify-end">
        {successfulCases}
        {' '}
        /
        {totalCases}
        {' '}
        {t('evaluation.testCases')}
      </div>
    </div>
  )
}

// 指标趋势子组件
interface MetricTrendItemProps {
  metric: string
  firstValue: number
  lastValue: number
  percentChange: number
  isSelected: boolean
}

const MetricTrendItem: React.FC<MetricTrendItemProps> = ({
  metric,
  firstValue,
  lastValue,
  percentChange,
  isSelected,
}) => {
  // 从 METRIC_THEME 获取指标颜色
  const metricStyle = getMetricStyle(metric, 1)
  const { t } = useI18n()

  // 趋势方向颜色
  const trendColor
    = percentChange > 0 ? '#52c41a' : percentChange < 0 ? '#f5222d' : '#d9d9d9'

  return (
    <div
      className={`mb-4 border-b border-gray-200 pb-2.5 ${
        isSelected
          ? 'opacity-100 bg-blue-50 p-2 rounded transition-all duration-300'
          : 'opacity-60'
      }`}
    >
      <div className="flex justify-between items-center">
        <div>
          <Tooltip title={t('evaluation.metricTrendsTooltip')}>
            <span
              className={`${isSelected ? 'font-semibold' : 'font-medium'}`}
              style={{ color: metricStyle.color }}
            >
              {metric}
            </span>
          </Tooltip>
          <div className="text-xs text-gray-500 mt-0.5">
            {firstValue.toFixed(2)}
            {' '}
            →
            {lastValue.toFixed(2)}
          </div>
        </div>
        <div
          className="font-medium text-sm flex items-center"
          style={{ color: trendColor }}
        >
          {percentChange !== 0 && (percentChange > 0 ? '↑ ' : '↓ ')}
          {Math.abs(percentChange).toFixed(2)}
          %
        </div>
      </div>
      <div className="h-1.5 bg-gray-100 rounded mt-2 relative overflow-hidden">
        <div
          className="absolute left-0 top-0 bottom-0 rounded transition-all duration-300"
          style={{
            width: `${Math.min(Math.abs(percentChange) * 2, 100)}%`,
            backgroundColor: metricStyle.color,
          }}
        >
        </div>
      </div>
    </div>
  )
}

// MetricSelector 子组件
interface MetricSelectorProps {
  availableMetrics: { label: string, value: string }[]
  selectedMetrics: string[]
  onChange: (values: string[]) => void
}

const MetricSelector: React.FC<MetricSelectorProps> = ({
  availableMetrics,
  selectedMetrics,
  onChange,
}) => {
  const { t } = useI18n()

  return (
    <Card className="mb-4 shadow-sm" size="small">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <FilterOutlined className="mr-2 text-blue-500" />
          <span className="mr-2 font-medium">
            {t('evaluation.allMetrics')}
            :
          </span>
          <Select
            mode="multiple"
            allowClear
            className="min-w-[300px]"
            placeholder={t('common.filter')}
            value={selectedMetrics}
            onChange={onChange}
            options={availableMetrics}
            showSearch
            optionFilterProp="label"
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
          />
        </div>
        <div>
          <Button
            type="link"
            onClick={() => onChange(availableMetrics.map((m) => m.value))}
          >
            {t('common.reset')}
          </Button>
          <Tooltip title={t('evaluation.filterTooltip')}>
            <InfoCircleOutlined className="ml-2 text-gray-400" />
          </Tooltip>
        </div>
      </div>
    </Card>
  )
}

// MetricChart 子组件
interface MetricChartProps {
  chartData: Record<string, unknown>[]
  selectedMetrics: string[]
}

const MetricChart: React.FC<MetricChartProps> = ({
  chartData,
  selectedMetrics,
}) => {
  const { t } = useI18n()

  if (selectedMetrics.length === 0) {
    return (
      <Empty
        description={t('evaluation.noMetricsSelected')}
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    )
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart
        data={chartData}
        margin={{ top: 5, right: 30, left: 20, bottom: 25 }}
      >
        <CartesianGrid
          horizontal
          vertical={false}
          strokeDasharray="0"
          stroke="#e0e0e0"
        />
        <XAxis
          dataKey="name"
          tick={(props) => {
            const { x, y, payload, index } = props
            if (index === chartData.length - 1) {
              return (
                <g transform={`translate(${x},${y})`}>
                  <text
                    x={0}
                    y={0}
                    dy={16}
                    textAnchor="middle"
                    fill="#666"
                    fontSize={12}
                  >
                    {t('evaluation.latestTest')}
                  </text>
                </g>
              )
            }
            return null
          }}
          tickLine
          axisLine
        />
        <YAxis
          domain={[0, 1.1]}
          tickFormatter={(value) => (value === 1.1 ? '' : value.toFixed(2))}
        />
        <RechartTooltip
          formatter={(value: unknown, name: string) => [
            typeof value === 'number' ? value.toFixed(2) : String(value),
            name,
          ]}
          labelFormatter={(label) => `${t('evaluation.time')}: ${label}`}
        />
        <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: 10 }} />
        {selectedMetrics.map((metric) => {
          const color = getMetricStyle(metric, 1).color

          return (
            <Line
              key={metric}
              type="monotone"
              dataKey={metric}
              stroke={color}
              name={metric}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              strokeWidth={2}
            />
          )
        })}
      </LineChart>
    </ResponsiveContainer>
  )
}

// MetricTrends 子组件
interface MetricTrendsProps {
  chartData: Record<string, unknown>[]
  availableMetrics: string[]
  selectedMetrics: string[]
}

const MetricTrends: React.FC<MetricTrendsProps> = ({
  chartData,
  availableMetrics,
  selectedMetrics,
}) => {
  const { t } = useI18n()

  if (availableMetrics.length === 0) {
    return (
      <Empty
        description={t('evaluation.noMetricsSelected')}
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    )
  }

  return (
    <div className="h-[350px] overflow-y-auto pr-2.5">
      {availableMetrics.map((metric) => {
        // 获取有效的数据点（过滤掉undefined和null）
        const validDataPoints = chartData
          .filter(
            (point) => point[metric] !== undefined && point[metric] !== null,
          )
          .map((point) => point[metric] as number)

        // 检查指标是否被选中
        const isSelected = selectedMetrics.includes(
          metric,
        )

        if (validDataPoints.length < 2) {
          return (
            <div
              key={metric}
              className={`mb-4 border-b border-gray-200 pb-2.5 ${
                isSelected ? 'opacity-100' : 'opacity-60'
              }`}
            >
              <div className="flex justify-between items-center">
                <div>{metric}</div>
                <div className="text-gray-300">
                  {t('evaluation.insufficientData')}
                </div>
              </div>
            </div>
          )
        }

        // 计算趋势变化百分比（从第一个数据点到最后一个）
        const firstValue = validDataPoints[0]
        const lastValue = validDataPoints[validDataPoints.length - 1]
        const percentChange
          = firstValue !== 0 ? ((lastValue - firstValue) / firstValue) * 100 : 0

        return (
          <MetricTrendItem
            key={metric}
            metric={metric}
            firstValue={firstValue}
            lastValue={lastValue}
            percentChange={percentChange}
            isSelected={isSelected}
          />
        )
      })}
    </div>
  )
}

// 数据处理函数
const prepareChartData = (
  testRunsData:
    | {
      items?: TestRun[]
    }
    | undefined,
) => {
  if (!testRunsData?.items?.length) return []

  // 确保所有run的指标都包含在图表数据中
  const allMetricsSet = new Set<string>()

  // 首先收集所有可能的指标名称
  testRunsData.items.forEach((run: TestRun) => {
    run.avg_metric_scores.forEach((metric) => {
      const metricName = metric.name
      if (metricName) {
        allMetricsSet.add(metricName)
      }
    })
  })

  const allMetrics = Array.from(allMetricsSet)

  // Convert to chart format, latest runs first
  return [...testRunsData.items]
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    .map((run) => {
      // Extract key metrics from metrics_scores
      const metricsData: Record<string, unknown> = {
        name: dayjs(run.created_at).format('MM/DD HH:mm'),
        runId: run.run_id,
        successRate: (run.successful_test_cases / run.total_test_cases) * 100,
      }

      // 初始化所有可能的指标为0或null
      allMetrics.forEach((metricName) => {
        metricsData[metricName] = null
      })

      // 添加这个run中实际存在的指标数据
      run.avg_metric_scores.forEach((metric) => {
        // 提取指标名称和分数
        const metricName = metric.name
        if (metricName) {
          const metricScore = metric.averageScore

          // 使用指标名称作为键
          metricsData[metricName] = metricScore
        }
      })

      return metricsData
    })
}

// 计算摘要指标
const calculateSummaryMetrics = (
  testRunsData:
    | {
      items?: TestRun[]
    }
    | undefined,
) => {
  if (!testRunsData?.items?.length) return null

  const total = testRunsData.items.length
  const successRate
    = testRunsData.items.reduce(
      (acc: number, run: TestRun) =>
        acc + run.successful_test_cases / (run.total_test_cases || 1),
      0,
    ) / total

  return {
    total,
    successRate: successRate * 100,
  }
}

const Evaluation = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [searchParams, setSearchParams] = useState<TestRunSearchParams>({
    project_id: Number(projectId),
    model: '',
    tag: '',
    skip: (page - 1) * pageSize,
    limit: pageSize,
  })

  // 添加选中的行状态
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([])
  const [availableMetricFilters, setAvailableMetricFilters] = useState<
    { label: string, value: string }[]
  >([])

  // 获取测试运行数据
  const { data: testRunsData, isLoading } = useQuery({
    queryKey: ['testRuns', projectId, searchParams],
    queryFn: () => testRunApi.list(Number(projectId), searchParams),
    enabled: !!projectId,
  })

  // 删除测试运行的 mutation
  const deleteTestRun = useMutation({
    mutationFn: ({
      testRunId,
      projectId,
    }: {
      testRunId: number
      projectId: number
    }) => testRunApi.delete(Number(projectId), testRunId),
    onSuccess: () => {
      message.success(t('evaluation.deleteSuccess'))
      queryClient.invalidateQueries({ queryKey: ['testRuns'] })
    },
    onError: () => {
      message.error(t('evaluation.deleteError'))
    },
  })

  // 处理分页参数变更
  useEffect(() => {
    setSearchParams({
      project_id: Number(projectId),
      skip: (page - 1) * pageSize,
      limit: pageSize,
    })
  }, [projectId, page, pageSize])

  // 处理测试运行删除
  const showDeleteConfirm = (testRunId: number) => {
    confirm({
      title: t('evaluation.confirmDelete'),
      icon: <ExclamationCircleOutlined />,
      content: t('evaluation.deleteWarning'),
      okText: t('common.yes'),
      okType: 'danger',
      cancelText: t('common.no'),
      onOk() {
        deleteTestRun.mutate({ testRunId, projectId: Number(projectId) })
      },
    })
  }

  // 处理查看详情
  const handleViewDetails = (testRunId: number) => {
    navigate(`/project/${projectId}/evaluation/${testRunId}`)
  }

  // 提取可用的指标过滤器
  useEffect(() => {
    if (testRunsData?.items) {
      const metricsSet = new Set<string>()

      // 从所有测试运行中收集指标名称
      testRunsData.items.forEach((run) => {
        run.avg_metric_scores.forEach((metric) => {
          const metricName = metric.name || Object.keys(metric)[0]
          if (metricName) {
            metricsSet.add(metricName)
          }
        })
      })

      // 转换为Select组件的选项格式
      const metricsOptions = Array.from(metricsSet).map((metric) => ({
        label: metric,
        value: metric,
      }))

      setAvailableMetricFilters(metricsOptions)

      // 如果没有选中任何指标，默认选择所有指标
      if (selectedMetrics.length === 0 && metricsOptions.length > 0) {
        setSelectedMetrics(metricsOptions.map((option) => option.value))
      }
    }
  }, [testRunsData?.items])

  // 处理指标选择变更
  const handleMetricsChange = (values: string[]) => {
    setSelectedMetrics(values)
    // 提醒用户选择变更
    if (values.length === 0) {
      message.info(t('evaluation.clearedMetricsInfo'))
    }
    else if (values.length !== selectedMetrics.length) {
      message.success(
        t('evaluation.metricsSelectedSuccess', {
          count: values.length,
        }),
      )
    }
  }

  // 计算摘要指标
  const metrics = calculateSummaryMetrics(testRunsData)

  // 准备图表数据
  const chartData = prepareChartData(testRunsData)

  // 获取可用的指标列表
  const availableMetrics
    = chartData.length > 0
      ? Object.keys(chartData[0]).filter((key) => {
          // 只包含真正的指标，排除非指标字段
          return key !== 'name' && key !== 'runId' && key !== 'successRate'
        })
      : []

  // 状态映射常量，移到组件内，使用 t
  const statusMap: Record<string, { label: string, color: string }> = {
    SUCCESS: {
      label: '已完成',
      color: 'success',
    },
    FAILED: {
      label: '失败',
      color: 'error',
    },
    failed: {
      label: '失败',
      color: 'error',
    },
    CREATED: {
      label: '已创建',
      color: 'default',
    },
    RUNNING: {
      label: '运行中',
      color: 'processing',
    },
    PENDING: {
      label: '待执行',
      color: 'default',
    },
  }

  // 表格列定义
  const columns = [
    {
      title: t('evaluation.name', '任务名称'),
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      // render: (name: string) => name || "-",
      render: (runId: string, record: TestRun) => (
        <span
          className="font-mono text-xs text-blue-600 cursor-pointer hover:text-blue-800 hover:underline transition-colors inline-flex items-center"
          onClick={() => handleViewDetails(record.id)}
          title={t('evaluation.viewDetails')}
        >
          <EyeOutlined className="mr-1 text-xs" />
          {record.name || record.run_id}
        </span>
      ),
    },
    {
      title: t('evaluation.status', '状态'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const info = statusMap[status]
        return (
          <Tag color={info?.color || 'default'}>{info?.label || status}</Tag>
        )
      },
    },
    {
      title: (
        <Tooltip
          title={t('evaluation.metricScoresTooltip', {
            defaultMessage: '显示所有评估指标及其分数',
          })}
        >
          <span className="flex items-center">
            {t('evaluation.metricScores')}
            {' '}
            <InfoCircleOutlined className="ml-1 text-sm" />
          </span>
        </Tooltip>
      ),
      key: 'metricScores',
      width: 200,
      render: (_: unknown, record: TestRun) =>
        record.status === 'SUCCESS' ? (
          <MetricScoreDisplay metrics={record.avg_metric_scores} />
        ) : (
          '--'
        ),
    },
    {
      title: t('evaluation.testResult'),
      key: 'testResult',
      width: 260,
      render: (_: unknown, record: TestRun) =>
        record.status === 'SUCCESS' ? (
          <TestResultBar
            successfulCases={record.successful_test_cases}
            totalCases={record.total_test_cases}
          />
        ) : (
          '--'
        ),
    },
    {
      title: '答案生成模型',
      dataIndex: 'model',
      key: 'model',
      render: (model: string | null) => model || '--',
    },
    {
      title: t('evaluation.evaluateModel', '评估模型'),
      dataIndex: ['evaluate_model', 'model'],
      key: 'evaluate_model.model',
      render: (_: unknown, record: TestRun) =>
        record.evaluate_model?.model || '--',
    },
    {
      title: t('evaluation.dataset'),
      dataIndex: 'dataset',
      key: 'dataset',
      render: (dataset: string | null) => dataset || '--',
    },

    {
      title: (
        <Tooltip
          title={(
            <pre className="max-w-[400px] whitespace-pre-wrap">
              {t('evaluation.hyperparametersTooltip', '查看超参数JSON')}
            </pre>
          )}
        >
          <span className="flex items-center">
            {t('evaluation.hyperparameters', '超参')}
            <InfoCircleOutlined className="ml-1 text-sm" />
          </span>
        </Tooltip>
      ),
      dataIndex: 'hyperparameters',
      key: 'hyperparameters',
      render: (hyper: Record<string, unknown>) => (
        <Tooltip
          title={(
            <pre className="max-w-[400px] whitespace-pre-wrap">
              {JSON.stringify(hyper, null, 2)}
            </pre>
          )}
        >
          <InfoCircleOutlined className="cursor-pointer" />
        </Tooltip>
      ),
    },
    {
      title: t('evaluation.createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => (
        <span className="text-gray-700">
          {dayjs(date).format('YYYY-MM-DD HH:mm:ss')}
        </span>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      fixed: 'right' as const,
      render: (_: unknown, record: TestRun) => (
        <Space size="middle">
          {/* 执行按钮，仅在 status === 'created' 时显示 */}
          {record.status === 'CREATED' && (
            <Tooltip title={t('evaluation.runNow', '执行')}>
              <Button
                type="primary"
                size="small"
                onClick={async () => {
                  try {
                    await testRunApi.start(Number(projectId), record.id)
                    message.success(t('evaluation.runStarted', '执行已启动'))
                    queryClient.invalidateQueries({ queryKey: ['testRuns'] })
                  }
                  catch {
                    message.error(
                      t('evaluation.runStartFailed', '执行启动失败'),
                    )
                  }
                }}
              >
                执行
              </Button>
            </Tooltip>
          )}
          <Tooltip title={t('common.delete')}>
            <Button
              icon={<DeleteOutlined />}
              danger
              type="text"
              className="hover:bg-red-50"
              onClick={() => {
                showDeleteConfirm(record.id)
              }}
              loading={deleteTestRun.isPending}
            />
          </Tooltip>
        </Space>
      ),
    },
  ]

  // 处理行选择变化
  const handleRowSelectionChange = (selectedKeys: React.Key[]) => {
    // 限制最多选择2个
    if (selectedKeys.length > 2) {
      message.warning(
        t('evaluation.maxTwoComparison', '最多只能选择两个测试运行进行对比'),
      )
      return
    }
    setSelectedRowKeys(selectedKeys)
  }

  // 处理对比按钮点击
  const handleCompare = () => {
    if (selectedRowKeys.length !== 2) {
      message.warning(
        t('evaluation.exactlyTwoForComparison', '请选择两个测试运行进行对比'),
      )
      return
    }

    // 导航到对比页面，使用 "-" 分隔两个测试运行ID
    navigate(
      `/project/${projectId}/evaluation/compare/${selectedRowKeys[0]}-${selectedRowKeys[1]}`,
    )
  }

  // 行选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: handleRowSelectionChange,
    // selections: [
    //   Table.SELECTION_ALL,
    //   Table.SELECTION_INVERT,
    //   Table.SELECTION_NONE,
    // ],
  }

  // 新增：创建评估任务弹窗控制
  const [createModalOpen, setCreateModalOpen] = useState(false)

  // 创建评估任务提交回调
  const handleCreateTaskSuccess = () => {
    setCreateModalOpen(false)
    queryClient.invalidateQueries({ queryKey: ['testRuns'] })
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">{t('sidebar.evaluation')}</h2>

      {/* 摘要指标统计 */}
      {metrics && (
        <div className="mb-4 bg-white rounded shadow-sm p-3">
          <div className="flex justify-between items-center">
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 font-medium">
                {t('evaluation.totalRuns')}
              </span>
              <span className="text-xl font-bold text-blue-500">
                {metrics.total}
              </span>
            </div>
            <div className="h-8 w-px bg-gray-200 mx-4"></div>
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 font-medium">
                {t('evaluation.avgSuccessRate')}
              </span>
              <span
                className={`text-xl font-bold ${
                  metrics.successRate >= 80
                    ? 'text-green-500'
                    : metrics.successRate >= 50
                      ? 'text-yellow-500'
                      : 'text-red-500'
                }`}
              >
                {metrics.successRate.toFixed(2)}
                %
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 指标数据与趋势仪表板 */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
          {/* 指标选择器 */}
          <div className="lg:col-span-4">
            <MetricSelector
              availableMetrics={availableMetricFilters}
              selectedMetrics={selectedMetrics}
              onChange={handleMetricsChange}
            />
          </div>

          {/* 指标数据面板 */}
          <div className="lg:col-span-3">
            <Card
              title={(
                <div className="flex items-center">
                  <BarChartOutlined className="mr-2" />
                  {t('evaluation.metricData')}
                  {' '}
                  (
                  {t('evaluation.allMetrics')}
                  )
                  <Tooltip title={t('evaluation.metricDataTooltip')}>
                    <InfoCircleOutlined className="ml-2 text-gray-400 text-sm" />
                  </Tooltip>
                </div>
              )}
              className="shadow-sm"
            >
              <MetricChart
                chartData={chartData}
                selectedMetrics={selectedMetrics}
              />
            </Card>
          </div>

          {/* 指标趋势面板 */}
          <div className="lg:col-span-1">
            <Card
              title={(
                <div className="flex items-center">
                  <LineChartOutlined className="mr-2" />
                  {t('evaluation.metricTrends')}
                  {' '}
                  (
                  {t('evaluation.allMetrics')}
                  )
                  <Tooltip title={t('evaluation.metricTrendsTooltip')}>
                    <InfoCircleOutlined className="ml-2 text-gray-400 text-sm" />
                  </Tooltip>
                </div>
              )}
              className="shadow-sm"
            >
              <MetricTrends
                chartData={chartData}
                availableMetrics={availableMetrics}
                selectedMetrics={selectedMetrics}
              />
            </Card>
          </div>
        </div>
      )}

      {/* 测试运行表格 */}
      <Card
        title={
          <h3 className="text-lg font-medium">{t('evaluation.testRuns')}</h3>
        }
        className="shadow-sm"
        extra={(
          <Space>
            {selectedRowKeys.length === 2 && (
              <Button
                type="primary"
                icon={<CompressOutlined />}
                onClick={handleCompare}
              >
                {t('evaluation.compare', '对比')}
              </Button>
            )}
            <Button
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['testRuns'] })
                message.success(t('evaluation.refreshSuccess', '刷新成功'))
              }}
            >
              刷新
            </Button>
            <Button type="primary" onClick={() => setCreateModalOpen(true)}>
              创建评估任务
            </Button>
          </Space>
        )}
      >
        <Table
          columns={columns}
          dataSource={testRunsData?.items || []}
          rowKey="id"
          loading={isLoading}
          rowSelection={rowSelection}
          pagination={{
            current: page,
            pageSize,
            total: testRunsData?.total || 0,
            onChange: (page, pageSize) => {
              setPage(page)
              setPageSize(pageSize)
            },
            showSizeChanger: true,
            className: 'pagination-container',
          }}
          scroll={{ x: 'max-content' }}
          rowClassName="hover:bg-gray-50 transition-colors"
        />
      </Card>

      <EvaluationTaskCreateModal
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onSuccess={handleCreateTaskSuccess}
        projectId={Number(projectId)}
      />
    </div>
  )
}

export default Evaluation
