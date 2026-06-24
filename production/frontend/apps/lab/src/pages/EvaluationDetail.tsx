import { useEffect, useState } from 'react'
import React from 'react'
import type {
  RadioChangeEvent } from 'antd'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Progress,
  Radio,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd'
import {
  BarChartOutlined,
  DownloadOutlined,
  FilterOutlined,
  InfoCircleOutlined,
  RollbackOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { testRunApi } from '../services/api'
import type { TestCase, TestRun } from '../types'
import useI18n from '../hooks/useI18n'

const EvaluationDetail = () => {
  const { projectId, testRunId } = useParams<{
    projectId: string
    testRunId: string
  }>()
  const { t } = useI18n()
  const navigate = useNavigate()

  // 添加状态过滤的状态
  const [statusFilter, setStatusFilter] = useState<string>('all')
  // 添加导出加载状态
  const [exporting, setExporting] = useState<boolean>(false)

  // Query for test run detail
  const {
    data: testRun,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['testRun', projectId, testRunId],
    queryFn: () => testRunApi.getById(Number(projectId), Number(testRunId)),
    enabled: !!projectId && !!testRunId,
  })

  // Test case table columns
  const columns = [
    {
      title: t('evaluation.testCaseName'),
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
    {
      title: t('evaluation.status'),
      key: 'success',
      dataIndex: 'success',
      render: (success: boolean) => (
        <Tag color={success ? 'success' : 'error'}>
          {success ? t('common.success') : t('common.failure')}
        </Tag>
      ),
    },
    {
      title: t('evaluation.duration'),
      dataIndex: 'runDuration',
      key: 'runDuration',
      render: (duration: number) =>
        typeof duration === 'number' ? `${duration.toFixed(2)}s` : '0s',
    },
    {
      title: t('evaluation.type'),
      key: 'is_conversational',
      dataIndex: 'is_conversational',
      render: (isConversational: boolean) => (
        <Tag color={isConversational ? 'purple' : 'blue'}>
          {isConversational
            ? t('evaluation.conversational')
            : t('evaluation.standard')}
        </Tag>
      ),
    },
  ]

  // Handle navigation back to list
  const handleBack = () => {
    navigate(`/project/${projectId}/evaluation`)
  }

  // 渲染测试用例详情面板
  const expandedRowRender = (testCase: TestCase) => {
    const itemRender = (k: string) => {
      try {
        if (typeof testCase[k] !== 'object' || testCase[k] === null) {
          throw new Error('testCase[k] is not an object')
        }
        const value = JSON.stringify(testCase[k], null, 2)
        return {
          key: k,
          label: k,
          span: 3,
          children: (
            <pre className="p-2 overflow-x-auto whitespace-pre bg-gray-800 text-gray-200 rounded-md">
              {value}
            </pre>
          ),
        }
      }
      catch (err) {
        return {
          key: k,
          label: k,
          span: 1,
          children: testCase[k] || '-',
        }
      }
    }

    const keys = [
      'input',
      'actualOutput',
      'expectedOutput',
      'metricsData',
      'name',
      'success',
      'runDuration',
      'order',
      'conversational',
      'multimodal',
      'context',
      'retrievalContext',
    ]
    const items = keys.map(itemRender)

    return (
      <div className="space-y-4">
        <Descriptions items={items} layout="vertical" column={3} />
      </div>
    )
  }

  // 单个指标分布图组件
  interface MetricDistributionChartProps {
    metricList: Record<string, any>[]
    metricName: string
    interval: number
  }

  const MetricDistributionChart: React.FC<MetricDistributionChartProps> = ({
    metricList,
    interval,
  }) => {
    // 生成固定的区间刻度
    const generateFixedIntervals = (intervalSize: number) => {
      const intervals = []
      for (let i = 0; i <= 1; i += intervalSize) {
        intervals.push(parseFloat(i.toFixed(2)))
      }
      // 确保最后一个是1.00
      if (intervals[intervals.length - 1] !== 1) {
        intervals.push(1.0)
      }
      return intervals
    }

    const gapList = generateFixedIntervals(interval)

    // 初始化 chartData，为每个区间创建一个对象，count 初始为 0
    const chartData = gapList.map((value) => ({
      interval: value,
      count: 0,
    }))

    // 遍历 metricList，将每个项目的分数归类到对应的区间
    metricList.forEach((item) => {
      const score = item.score
      // 找到分数所属的区间
      for (let i = 0; i < chartData.length; i++) {
        const currentInterval = chartData[i].interval
        const nextInterval = i < gapList.length - 1 ? gapList[i + 1] : 1

        // 检查分数是否在当前区间范围内
        if (
          score >= currentInterval
          && (score < nextInterval || (score === 1 && nextInterval === 1))
        ) {
          chartData[i].count += 1
          break
        }
      }
    })

    return (
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 20, left: 0, bottom: 5 }}
            barCategoryGap={0}
            barGap={0}
          >
            <XAxis
              dataKey="interval"
              scale="band"
              fontSize={10}
              padding={{ left: 0, right: 0 }}
              label={{
                value: t('evaluation.metricScore', '指标 score'),
                position: 'insideBottom',
                fontSize: 12,
              }}
            />
            <YAxis
              hide={false}
              tick={false}
              tickLine={false}
              axisLine
              label={{
                value: 'case',
                angle: -90,
                position: 'insideLeft',
                offset: 50,
              }}
            />
            <Bar
              dataKey="count"
              fill="#8884d8"
              name={t('evaluation.caseCount')}
              radius={[4, 4, 0, 0]}
              label={{
                position: 'top',
                fill: '#666',
                fontSize: 12,
                formatter: (value: number) => (value > 0 ? value : ''),
                offset: 5,
              }}
              barSize="100%"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // 得分分析组件
  interface ScoreAnalysisProps {
    testCases: TestCase[] | undefined
  }

  const ScoreAnalysis: React.FC<ScoreAnalysisProps> = ({ testCases }) => {
    const { t } = useI18n()
    const [interval, setInterval] = useState(0.2) // 默认区间大小
    const metricsMap: Record<string, Record<string, any>[]> = {}
    testCases.forEach((testCase) => {
      testCase.metricsData.forEach((metric) => {
        if (!metricsMap[metric.name]) {
          metricsMap[metric.name] = []
        }
        metricsMap[metric.name].push(metric)
      })
    })

    const handleIntervalChange = (e: RadioChangeEvent) => {
      setInterval(parseFloat(e.target.value))
    }

    return (
      <Card
        title={(
          <div className="flex items-center">
            <BarChartOutlined className="mr-2" />
            {t('evaluation.scoreAnalysis')}
            <Tooltip
              title={t(
                'evaluation.scoreAnalysisTooltip',
                '显示每个指标的分数分布',
              )}
            >
              <InfoCircleOutlined className="ml-2 text-gray-400 text-sm" />
            </Tooltip>
          </div>
        )}
        className="mt-4"
        extra={(
          <div>
            <span className="mr-2">
              {t('evaluation.intervalSize')}
              :
            </span>
            <Radio.Group onChange={handleIntervalChange} value={interval}>
              <Radio.Button value={0.05}>0.05</Radio.Button>
              <Radio.Button value={0.1}>0.1</Radio.Button>
              <Radio.Button value={0.2}>0.2</Radio.Button>
              <Radio.Button value={0.5}>0.5</Radio.Button>
            </Radio.Group>
          </div>
        )}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
          {Object.keys(metricsMap).map((name) => (
            <Card
              key={name}
              title={name}
              size="small"
              className="shadow-sm"
              headStyle={{ textAlign: 'center' }}
            >
              <MetricDistributionChart
                metricList={metricsMap[name]}
                metricName={name}
                interval={interval}
              />
            </Card>
          ))}
        </div>
      </Card>
    )
  }

  // 添加状态过滤逻辑
  const getFilteredTestCases = () => {
    if (!testRun?.test_cases) return []

    if (statusFilter === 'all') {
      return testRun.test_cases
    }

    return testRun.test_cases.filter((testCase) => {
      if (statusFilter === 'success') {
        return testCase.success === true
      }
      else if (statusFilter === 'failure') {
        return testCase.success === false
      }
      return true
    })
  }

  // 处理状态过滤变化
  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value)
  }

  // 处理导出Excel
  const handleExportXlsx = async () => {
    if (!testRun) return

    try {
      setExporting(true)
      await testRunApi.exportTestCasesToXlsx(testRun, statusFilter)
      message.success(t('evaluation.exportSuccess', '导出成功'))
    }
    catch (err) {
      console.error('Error exporting test cases:', err)
      message.error(t('evaluation.exportError', '导出失败'))
    }
    finally {
      setExporting(false)
    }
  }

  if (isLoading) {
    return <Spin size="large" />
  }

  if (error) {
    return (
      <Alert
        message={t('common.error')}
        description={t('evaluation.loadError')}
        type="error"
        showIcon
      />
    )
  }

  if (!testRun) {
    return (
      <Alert
        message={t('common.notFound')}
        description={t('evaluation.testRunNotFound')}
        type="warning"
        showIcon
      />
    )
  }

  // 获取过滤后的测试用例
  const filteredTestCases = getFilteredTestCases()

  return (
    <div className="p-4">
      <div className="mb-4">
        <Button type="link" icon={<RollbackOutlined />} onClick={handleBack}>
          {t('common.back')}
        </Button>
      </div>

      <Row gutter={16}>
        <Col className="h-auto" span={8}>
          <Card title={t('evaluation.summary')} className="h-full">
            <div className="flex justify-center items-center">
              <Progress
                className="block"
                type="circle"
                percent={
                  (testRun.successful_test_cases / testRun.total_test_cases)
                  * 100
                }
                format={(percent) => `${percent?.toFixed(1)}%`}
                trailColor="#cf1322"
                strokeColor="#389e0d"
                strokeWidth={12}
              />
              <div className="ml-8 flex flex-col gap-2">
                <div className="flex items-center">
                  <span className="text-gray-500 w-16">
                    {t('evaluation.testCases')}
                    :
                  </span>
                  <span className="font-medium text-right w-8">
                    {testRun.total_test_cases}
                  </span>
                </div>
                <div className="flex items-center">
                  <span className="text-gray-500 w-16">
                    {t('evaluation.successRate')}
                    :
                  </span>
                  <span className="font-medium text-green-600 text-right w-8">
                    {(
                      (testRun.successful_test_cases
                        / testRun.total_test_cases)
                      * 100
                    ).toFixed(1)}
                    %
                  </span>
                </div>
                <div className="flex items-center">
                  <span className="text-gray-500 w-16">
                    {t('evaluation.failureRate')}
                    :
                  </span>
                  <span className="font-medium text-red-600 text-right w-8">
                    {(
                      ((testRun.total_test_cases
                        - testRun.successful_test_cases)
                      / testRun.total_test_cases)
                    * 100
                    ).toFixed(1)}
                    %
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </Col>
        <Col span={16} className="h-auto">
          <Card
            title={t('evaluation.testRunDetail')}
            className="h-full"
            styles={{
              body: {
                paddingTop: 2,
              },
            }}
          >
            <Descriptions>
              <Descriptions.Item label={t('evaluation.runId')} span={3}>
                {testRun.run_id}
              </Descriptions.Item>
              <Descriptions.Item label={t('evaluation.model')}>
                {testRun.model || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('evaluation.dataset')}>
                {testRun.dataset || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('evaluation.createdAt')}>
                {dayjs(testRun.created_at).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      {/* 添加得分分析图表 */}
      <ScoreAnalysis testCases={testRun.test_cases} />

      {/* 指标通过率展示 */}
      <Card
        title={(
          <div className="flex items-center">
            <BarChartOutlined className="mr-2" />
            {t('evaluation.metricsBreakdown', '指标通过率')}
            <Tooltip
              title={t(
                'evaluation.metricsBreakdownTooltip',
                '显示每个指标的通过情况',
              )}
            >
              <InfoCircleOutlined className="ml-2 text-gray-400 text-sm" />
            </Tooltip>
          </div>
        )}
        className="mt-4"
      >
        <div className="mb-2 text-gray-500 text-sm">
          {t('evaluation.individualMetricsBreakdown', '各指标通过/失败情况')}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-6 mt-4">
          {(() => {
            // 收集指标数据并计算通过率
            const metricsPassingMap: Record<
              string,
              { total: number, passing: number }
            > = {}

            // 遍历所有测试用例，收集指标数据
            testRun.test_cases.forEach((testCase) => {
              testCase.metricsData.forEach((metric) => {
                if (!metricsPassingMap[metric.name]) {
                  metricsPassingMap[metric.name] = { total: 0, passing: 0 }
                }

                metricsPassingMap[metric.name].total += 1
                if (metric.success) {
                  // 假设分数 >= 0.7 视为通过
                  metricsPassingMap[metric.name].passing += 1
                }
              })
            })

            // 渲染每个指标的通过率
            return Object.keys(metricsPassingMap).map((metricName) => {
              const metricData = metricsPassingMap[metricName]
              const passingRate
                = metricData.total > 0
                  ? (metricData.passing / metricData.total) * 100
                  : 0

              return (
                <div key={metricName} className="flex flex-col items-center">
                  <div className="text-center font-medium mb-2">
                    {metricName}
                  </div>
                  <Progress
                    type="circle"
                    percent={passingRate}
                    format={(percent) => `${percent?.toFixed(1)}%`}
                    trailColor="#cf1322"
                    strokeColor="#389e0d"
                    strokeWidth={12}
                  />
                  <div className="mt-2 text-center text-gray-600">
                    {`${metricData.passing}/${metricData.total} ${t(
                      'evaluation.passing',
                      '通过',
                    )}`}
                  </div>
                </div>
              )
            })
          })()}
        </div>
      </Card>

      {/* Test Cases Table */}
      <Card
        title={(
          <div className="flex items-center">
            {t('evaluation.testCases')}
            <Tooltip title={t('evaluation.filterByStatus', '按状态过滤')}>
              <InfoCircleOutlined className="ml-2 text-gray-400 text-sm" />
            </Tooltip>
          </div>
        )}
        className="mt-4"
        extra={(
          <Space>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleExportXlsx}
              loading={exporting}
              size="small"
            >
              {t('evaluation.exportXlsx', '导出Excel')}
            </Button>
            <FilterOutlined />
            <Select
              value={statusFilter}
              onChange={handleStatusFilterChange}
              className="w-[120px]"
              options={[
                { value: 'all', label: t('evaluation.all', '全部') },
                { value: 'success', label: t('common.success', '成功') },
                { value: 'failure', label: t('common.failure', '失败') },
              ]}
            />
          </Space>
        )}
      >
        <Table
          columns={columns}
          dataSource={filteredTestCases}
          rowKey="id"
          expandable={{
            expandedRowRender,
          }}
        />
      </Card>
    </div>
  )
}

export default EvaluationDetail
