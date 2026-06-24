import { useState } from 'react'
import React from 'react'
import type {
  RadioChangeEvent } from 'antd'
import {
  Alert,
  Button,
  Card,
  Col,
  Progress,
  Radio,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
} from 'antd'
import {
  BarChartOutlined,
  CompressOutlined,
  InfoCircleOutlined,
  RollbackOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { testRunApi } from '../services/api'
import type { TestCase, TestRun } from '../types'
import useI18n from '../hooks/useI18n'
import './EvaluationCompare.css'

const EvaluationCompare = () => {
  // 获取两个测试运行ID
  const { projectId, testRunIds = '' } = useParams<{
    projectId: string
    testRunIds: string
  }>()
  const { t } = useI18n()
  const navigate = useNavigate()

  // 解析测试运行ID
  const [testRunId1, testRunId2] = testRunIds.split('-')

  // 状态过滤
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // 区间大小状态
  const [interval, setInterval] = useState(0.2)

  // 新增：匹配方式状态
  const [matchType, setMatchType] = useState<'name' | 'input'>('input')

  // 定义两个图表的颜色
  const chartColors = {
    run1: 'var(--lab-chart-run-1)',
    run2: 'var(--lab-chart-run-2)',
  }

  // 查询第一个测试运行
  const {
    data: testRun1,
    isLoading: isLoading1,
    error: error1,
  } = useQuery({
    queryKey: ['testRun', projectId, testRunId1],
    queryFn: () => testRunApi.getById(Number(projectId), Number(testRunId1)),
    enabled: !!projectId && !!testRunId1,
  })

  // 查询第二个测试运行
  const {
    data: testRun2,
    isLoading: isLoading2,
    error: error2,
  } = useQuery({
    queryKey: ['testRun', projectId, testRunId2],
    queryFn: () => testRunApi.getById(Number(projectId), Number(testRunId2)),
    enabled: !!projectId && !!testRunId2,
  })

  // 处理返回按钮
  const handleBack = () => {
    navigate(`/project/${projectId}/evaluation`)
  }

  // 处理区间大小变更
  const handleIntervalChange = (e: RadioChangeEvent) => {
    setInterval(parseFloat(e.target.value))
  }

  // 处理状态过滤变化
  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value)
  }

  // 单个指标分布图组件
  interface MetricDistributionChartProps {
    metricList1: Record<string, unknown>[]
    metricList2: Record<string, unknown>[]
    interval: number
    testRun1Name: string
    testRun2Name: string
  }

  const MetricDistributionChart: React.FC<MetricDistributionChartProps> = ({
    metricList1,
    metricList2,
    interval,
    testRun1Name,
    testRun2Name,
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
      [testRun1Name]: 0,
      [testRun2Name]: 0,
    }))

    // 遍历 metricList1，将每个项目的分数归类到对应的区间
    metricList1.forEach((item) => {
      const score = item.score as number
      // 找到分数所属的区间
      for (let i = 0; i < chartData.length; i++) {
        const currentInterval = chartData[i].interval
        const nextInterval = i < gapList.length - 1 ? gapList[i + 1] : 1

        // 检查分数是否在当前区间范围内
        if (
          score >= currentInterval
          && (score < nextInterval || (score === 1 && nextInterval === 1))
        ) {
          chartData[i][testRun1Name] += 1
          break
        }
      }
    })

    // 遍历 metricList2，将每个项目的分数归类到对应的区间
    metricList2.forEach((item) => {
      const score = item.score as number
      // 找到分数所属的区间
      for (let i = 0; i < chartData.length; i++) {
        const currentInterval = chartData[i].interval
        const nextInterval = i < gapList.length - 1 ? gapList[i + 1] : 1

        // 检查分数是否在当前区间范围内
        if (
          score >= currentInterval
          && (score < nextInterval || (score === 1 && nextInterval === 1))
        ) {
          chartData[i][testRun2Name] += 1
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
            barGap={8}
          >
            <XAxis
              dataKey="interval"
              scale="band"
              fontSize={10}
              padding={{ left: 0, right: 0 }}
              label={{
                value: t('evaluation.metricScore'),
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
              dataKey={testRun1Name}
              fill={chartColors.run1}
              name={testRun1Name}
              radius={[4, 4, 0, 0]}
              label={{
                position: 'top',
                fill: 'var(--lab-color-text-muted)',
                fontSize: 10,
                formatter: (value: number) => (value > 0 ? value : ''),
                offset: 5,
              }}
            />
            <Bar
              dataKey={testRun2Name}
              fill={chartColors.run2}
              name={testRun2Name}
              radius={[4, 4, 0, 0]}
              label={{
                position: 'top',
                fill: 'var(--lab-color-text-muted)',
                fontSize: 10,
                formatter: (value: number) => (value > 0 ? value : ''),
                offset: 5,
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  // 分布对比组件
  const DistributionCompare = () => {
    if (!testRun1 || !testRun2) return null

    // 收集并整理两个测试运行中所有指标
    const metricsMap: Record<
      string,
      {
        list1: Record<string, unknown>[]
        list2: Record<string, unknown>[]
      }
    > = {}

    // 收集第一个测试运行的指标
    testRun1.test_cases.forEach((testCase) => {
      testCase.metricsData.forEach((metric) => {
        if (!metricsMap[metric.name]) {
          metricsMap[metric.name] = { list1: [], list2: [] }
        }
        metricsMap[metric.name].list1.push(metric)
      })
    })

    // 收集第二个测试运行的指标
    testRun2.test_cases.forEach((testCase) => {
      testCase.metricsData.forEach((metric) => {
        if (!metricsMap[metric.name]) {
          metricsMap[metric.name] = { list1: [], list2: [] }
        }
        metricsMap[metric.name].list2.push(metric)
      })
    })

    // 简化展示的测试运行名称
    const testRun1Name = testRun1.run_id.substring(0, 8)
    const testRun2Name = testRun2.run_id.substring(0, 8)

    return (
      <Card
        title={(
          <div className="flex items-center">
            <BarChartOutlined className="mr-2" />
            {t('evaluation.distributionCompare', '分布对比')}
            <Tooltip
              title={t(
                'evaluation.distributionCompareTooltip',
                '显示两个测试运行指标分布对比',
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
                metricList1={metricsMap[name].list1}
                metricList2={metricsMap[name].list2}
                interval={interval}
                testRun1Name={testRun1Name}
                testRun2Name={testRun2Name}
              />
            </Card>
          ))}
        </div>
      </Card>
    )
  }

  // 过滤测试用例
  const getFilteredTestCases = (testRun?: TestRun) => {
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

  // 查找匹配的测试用例-通过任务名称匹配
  const findMatchingTestCases = (type: 'name' | 'input' = 'name') => {
    if (!testRun1 || !testRun2) return []

    const testCases1 = getFilteredTestCases(testRun1)
    const testCases2 = getFilteredTestCases(testRun2)

    // 通过名称匹配测试用例
    const matched: Array<{ name: string, case1: TestCase, case2: TestCase }>
      = []
    const nameMap2 = new Map<string, TestCase>()

    // 建立第二个测试运行的名称映射
    testCases2.forEach((testCase) => {
      nameMap2.set(testCase[type], testCase)
    })

    // 匹配第一个测试运行中的测试用例
    testCases1.forEach((testCase1) => {
      const testCase2 = nameMap2.get(testCase1[type])
      if (testCase2) {
        matched.push({
          name: testCase1[type],
          case1: testCase1,
          case2: testCase2,
        })
      }
    })

    return matched
  }

  // 测试用例对比表格列定义
  const columns = [
    {
      title: testRun1?.name || testRun1?.run_id,
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
    {
      title: testRun2?.name || testRun2?.run_id,
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
  ]

  // 扩展行渲染函数 - 改为表格展示
  const expandedRowRender = (record: {
    name: string
    case1: TestCase
    case2: TestCase
  }) => {
    // 整理指标数据进行对比
    const metricsMap: Record<
      string,
      {
        metric1?: { name: string, score: number, success: boolean }
        metric2?: { name: string, score: number, success: boolean }
      }
    > = {}

    // 收集测试用例1的指标
    record.case1.metricsData.forEach((metric) => {
      if (!metricsMap[metric.name]) {
        metricsMap[metric.name] = {}
      }
      metricsMap[metric.name].metric1 = {
        name: metric.name,
        score: metric.score || 0,
        success: metric.success || false,
      }
    })

    // 收集测试用例2的指标
    record.case2.metricsData.forEach((metric) => {
      if (!metricsMap[metric.name]) {
        metricsMap[metric.name] = {}
      }
      metricsMap[metric.name].metric2 = {
        name: metric.name,
        score: metric.score || 0,
        success: metric.success || false,
      }
    })

    // 测试运行名称简写
    const testRun1Name = testRun1?.name || testRun1?.run_id
    const testRun2Name = testRun2?.name || testRun2?.run_id

    return (
      <div className="evaluation-compare-detail">
        <table className="evaluation-compare-table">
          <thead>
            <tr className="evaluation-compare-row">
              <th className="evaluation-compare-header"></th>
              <th className="evaluation-compare-header">
                <div className="evaluation-compare-header-content flex items-center">
                  <div className="w-3 h-3 mr-2 rounded evaluation-compare-swatch-run1"></div>
                  <span>{testRun1Name}</span>
                </div>
              </th>
              <th className="evaluation-compare-header">
                <div className="evaluation-compare-header-content flex items-center">
                  <div className="w-3 h-3 mr-2 rounded evaluation-compare-swatch-run2"></div>
                  {testRun2Name}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {/* 指标行 */}
            <tr className="evaluation-compare-row">
              <td className="evaluation-compare-label-cell">
                <div className="evaluation-compare-label-content">
                  {t('evaluation.metrics', '指标')}
                </div>
              </td>
              <td className="evaluation-compare-cell">
                <div className="evaluation-compare-cell-content">
                  {Object.keys(metricsMap).map((metricName) => (
                    <div key={metricName} className="mb-2">
                      <strong>{metricName}</strong>
                      ：
                      <span className="ml-1">
                        {metricsMap[metricName].metric1?.score.toFixed(2)
                        || '-'}
                      </span>
                      <span className="ml-2">
                        <Tag
                          color={
                            metricsMap[metricName].metric1?.success
                              ? 'success'
                              : 'error'
                          }
                        >
                          {metricsMap[metricName].metric1?.success
                            ? t('common.success')
                            : t('common.failure')}
                        </Tag>
                      </span>
                    </div>
                  ))}
                </div>
              </td>
              <td className="evaluation-compare-cell">
                <div className="evaluation-compare-cell-content">
                  {Object.keys(metricsMap).map((metricName) => (
                    <div key={metricName} className="mb-2">
                      <strong>{metricName}</strong>
                      ：
                      <span className="ml-1">
                        {metricsMap[metricName].metric2?.score.toFixed(2)
                        || '-'}
                      </span>
                      <span className="ml-2">
                        <Tag
                          color={
                            metricsMap[metricName].metric2?.success
                              ? 'success'
                              : 'error'
                          }
                        >
                          {metricsMap[metricName].metric2?.success
                            ? t('common.success')
                            : t('common.failure')}
                        </Tag>
                      </span>
                    </div>
                  ))}
                </div>
              </td>
            </tr>

            {/* 输入行 */}
            <tr className="evaluation-compare-row">
              <td className="evaluation-compare-label-cell">
                <div className="evaluation-compare-label-content">
                  {t('evaluation.input', '输入')}
                </div>
              </td>
              <td className="evaluation-compare-cell">
                <pre className="evaluation-compare-code">{record.case1.input}</pre>
              </td>
              <td className="evaluation-compare-cell">
                <pre className="evaluation-compare-code">{record.case2.input}</pre>
              </td>
            </tr>

            {/* 实际输出行 */}
            <tr className="evaluation-compare-row">
              <td className="evaluation-compare-label-cell">
                <div className="evaluation-compare-label-content">
                  {t('evaluation.actualOutput', '实际输出')}
                </div>
              </td>
              <td className="evaluation-compare-cell">
                <pre className="evaluation-compare-code">
                  {record.case1.actual_output || record.case1.actualOutput}
                </pre>
              </td>
              <td className="evaluation-compare-cell">
                <pre className="evaluation-compare-code">
                  {record.case2.actual_output || record.case2.actualOutput}
                </pre>
              </td>
            </tr>

            {/* 预期输出行 */}
            <tr className="evaluation-compare-row">
              <td className="evaluation-compare-label-cell">
                <div className="evaluation-compare-label-content">
                  {t('evaluation.expectedOutput', '预期输出')}
                </div>
              </td>
              <td className="evaluation-compare-cell">
                <pre className="evaluation-compare-code">
                  {record.case1.expected_output
                  || record.case1.expectedOutput
                  || record.case1.ground_truth
                  || '-'}
                </pre>
              </td>
              <td className="evaluation-compare-cell">
                <pre className="evaluation-compare-code">
                  {record.case2.expected_output
                  || record.case2.expectedOutput
                  || record.case2.ground_truth
                  || '-'}
                </pre>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  if (isLoading1 || isLoading2) {
    return <Spin size="large" />
  }

  if (error1 || error2) {
    return (
      <Alert
        message={t('common.error')}
        description={t('evaluation.loadError')}
        type="error"
        showIcon
      />
    )
  }

  if (!testRun1 || !testRun2) {
    return (
      <Alert
        message={t('common.notFound')}
        description={t('evaluation.testRunNotFound')}
        type="warning"
        showIcon
      />
    )
  }

  // 匹配的测试用例数据
  const matchedTestCases = findMatchingTestCases(matchType)

  return (
    <div className="p-4">
      <div className="mb-4">
        <Button type="link" icon={<RollbackOutlined />} onClick={handleBack}>
          {t('common.back')}
        </Button>
      </div>

      {/* 结果对比 */}
      <Card title={t('evaluation.resultCompare', '结果对比')} className="mb-4">
        <Row gutter={16}>
          <Col span={12}>
            <Card
              title={(
                <div className="flex items-center">
                  <div className="w-4 h-4 mr-2 rounded evaluation-compare-swatch-run1"></div>
                  {testRun1?.name || testRun1?.run_id}
                </div>
              )}
              className="shadow-sm"
            >
              <div className="flex justify-center items-center">
                <Progress
                  className="block"
                  type="circle"
                  percent={
                    (testRun1.successful_test_cases
                      / testRun1.total_test_cases)
                    * 100
                  }
                  format={(percent) => `${percent?.toFixed(1)}%`}
                  trailColor="var(--lab-color-danger)"
                  strokeColor="var(--lab-color-success)"
                  strokeWidth={12}
                />
                <div className="ml-8 flex flex-col gap-2">
                  <div className="flex items-center">
                    <span className="text-gray-500 w-16">
                      {t('evaluation.testCases')}
                      :
                    </span>
                    <span className="font-medium text-right w-8">
                      {testRun1.total_test_cases}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-gray-500 w-16">
                      {t('evaluation.successRate')}
                      :
                    </span>
                    <span className="font-medium text-green-600 text-right w-8">
                      {(
                        (testRun1.successful_test_cases
                          / testRun1.total_test_cases)
                        * 100
                      ).toFixed(1)}
                      %
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-gray-500 w-16">
                      {t('evaluation.model')}
                      :
                    </span>
                    <span className="font-medium text-right">
                      {testRun1.model || '-'}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          </Col>
          <Col span={12}>
            <Card
              title={(
                <div className="flex items-center">
                  <div className="w-4 h-4 mr-2 rounded evaluation-compare-swatch-run2"></div>
                  {testRun2?.name || testRun2?.run_id}
                </div>
              )}
              className="shadow-sm"
            >
              <div className="flex justify-center items-center">
                <Progress
                  className="block"
                  type="circle"
                  percent={
                    (testRun2.successful_test_cases
                      / testRun2.total_test_cases)
                    * 100
                  }
                  format={(percent) => `${percent?.toFixed(1)}%`}
                  trailColor="var(--lab-color-danger)"
                  strokeColor="var(--lab-color-success)"
                  strokeWidth={12}
                />
                <div className="ml-8 flex flex-col gap-2">
                  <div className="flex items-center">
                    <span className="text-gray-500 w-16">
                      {t('evaluation.testCases')}
                      :
                    </span>
                    <span className="font-medium text-right w-8">
                      {testRun2.total_test_cases}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-gray-500 w-16">
                      {t('evaluation.successRate')}
                      :
                    </span>
                    <span className="font-medium text-green-600 text-right w-8">
                      {(
                        (testRun2.successful_test_cases
                          / testRun2.total_test_cases)
                        * 100
                      ).toFixed(1)}
                      %
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-gray-500 w-16">
                      {t('evaluation.model')}
                      :
                    </span>
                    <span className="font-medium text-right">
                      {testRun2.model || '-'}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        </Row>
      </Card>

      {/* 分布对比 */}
      <DistributionCompare />

      {/* 用例对比 */}
      <Card
        title={(
          <div className="flex items-center">
            <CompressOutlined className="mr-2" />
            {t('evaluation.caseCompare', '用例对比')}
            <Tooltip
              title={t(
                'evaluation.caseCompareTooltip',
                '比较两个测试运行中相同名称的测试用例',
              )}
            >
              <InfoCircleOutlined className="ml-2 text-gray-400 text-sm" />
            </Tooltip>
          </div>
        )}
        className="mt-4"
        extra={(
          <Space>
            <span>
              {t('evaluation.filterByStatus')}
              :
            </span>
            <Select
              value={statusFilter}
              onChange={handleStatusFilterChange}
              className="w-[120px]"
              options={[
                { value: 'all', label: '所有' },
                { value: 'success', label: t('common.success') },
                { value: 'failure', label: t('common.failure') },
              ]}
            />
            <span>
              {t('evaluation.matchType', '匹配方式')}
              :
            </span>
            <Select
              value={matchType}
              onChange={(v) => setMatchType(v)}
              className="w-[140px]"
              options={[
                {
                  value: 'name',
                  label: t('evaluation.filterByName', '按名称匹配'),
                },
                {
                  value: 'input',
                  label: t('evaluation.filterByInput', '按输入问题匹配'),
                },
              ]}
            />
          </Space>
        )}
      >
        <Table
          columns={columns}
          dataSource={matchedTestCases}
          rowKey="name"
          expandable={{
            expandedRowRender,
            expandedRowClassName: 'no-padding-expanded-row',
          }}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  )
}

export default EvaluationCompare
