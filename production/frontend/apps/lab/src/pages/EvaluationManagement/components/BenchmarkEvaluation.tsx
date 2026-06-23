import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, Col, Modal, Popconfirm, Progress, Row, Select, Space, Table, Tag, Tooltip, Typography, message } from 'antd'
import { CloseOutlined, DownloadOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import dayjs from 'dayjs'
import BenchmarkRadarChart from './BenchmarkRadarChart'
import { benchmarkEvaluationServices } from '@/services/benchmarkEvaluationService'
import type { BenchmarkData, BenchmarkEvaluationDetailResponse, CompareBatchResponse, LeaderboardListItem, ModelReport, RadarChartData, TaskTableItem } from '@/services/benchmarkModel'
import { RadarChartResponse } from '@/services/benchmarkModel'
import { createBlobFromResponse, downloadBlobFile, extractFilenameFromHeaders } from '@/utils/download'
import type { TableActionItem } from '@/components/common/TableActionColumn'
import TableActionColumn from '@/components/common/TableActionColumn'
import { calculateRunningTime } from '@/utils/timeProcessing'

const { Title } = Typography
const { Option } = Select
const BenchmarkEvaluation: React.FC = () => {
  const navigate = useNavigate()
  const { projectId } = useParams()
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [availableModels, setAvailableModels] = useState<Array<{
    id: number
    name: string
  }>>([])
  const [radarData, setRadarData] = useState<RadarChartData[]>([])
  const [radarLoading, setRadarLoading] = useState(false)
  const [taskList, setTaskList] = useState<TaskTableItem[]>([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  })
  const [selectedTaskIds, setSelectedTaskIds] = useState<React.Key[]>([])
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareModalVisible, setCompareModalVisible] = useState(false)
  const [compareResult, setCompareResult] = useState<CompareBatchResponse | null>(null)
  const [compareDownloadLoading, setCompareDownloadLoading] = useState(false)
  // 榜单数据相关状态
  const [leaderboardData, setLeaderboardData] = useState<BenchmarkData[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [leaderboardPagination, setLeaderboardPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  })
  const [datasetColumns, setDatasetColumns] = useState<string[]>([]) // 动态数据集列
  // 获取任务列表数据
  const fetchTaskList = async (page: number = 1, size: number = 10) => {
    if (!projectId)
      return
    setLoading(true)
    try {
      const response = await benchmarkEvaluationServices.getBenchmarkEvaluationTasks(Number(projectId), { page, size })
      // 转换数据格式
      const formattedData: TaskTableItem[] = response.items.map((item: BenchmarkEvaluationDetailResponse) => {
        // 格式化模型名称列表
        const modelNames = item.models?.map((m) => `${m.model_name}${m.model_version ? `-${m.model_version}` : ''}`).join('\n') || '-'
        // 格式化数据集名称列表
        const datasetNames = item.datasets?.map((d) => d.dataset_name).join('、') || '-'
        // 格式化创建时间
        const createTime = item.created_at ? new Date(item.created_at).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).replace(/\//g, '-') : '-'
        return {
          key: String(item.id),
          taskName: item.name,
          taskStatus: item.status || '-',
          resultSet: datasetNames,
          model: modelNames,
          creator: item.created_by || '-',
          createTime,
          id: item.id,
          started_at: item.started_at,
          finished_at: item.finished_at,
          progress: item.progress,
          schedule_at: item.schedule_at,
        }
      })
      setTaskList(formattedData)
      setPagination({
        current: response.page || page,
        pageSize: response.size || size,
        total: response.total || 0,
      })
    }
    catch (error) {
      message.error('获取任务列表失败')
      console.error('获取任务列表失败:', error)
    }
    finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    fetchTaskList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])
  // 查看评估报告
  const handleViewReport = (record: TaskTableItem) => {
    if (!projectId)
      return
    navigate(`/project/${projectId}/effect-evaluation/report/${record.id}?evaluationType=benchmark`, {
      state: {
        taskStatus: record.taskStatus,
        evaluationType: 'benchmark',
      },
    })
  }
  // 启动任务
  const handleStartTask = async (record: TaskTableItem) => {
    if (!projectId)
      return
    try {
      await benchmarkEvaluationServices.startBenchmarkTask(Number(projectId), record.id)
      message.success('任务启动成功')
      // 刷新列表
      fetchTaskList(pagination.current, pagination.pageSize)
    }
    catch (error: any) {
      console.error('启动任务失败:', error)
      message.error(error?.response?.data?.message || '启动任务失败，请重试')
    }
  }
  // 终止任务
  const handleCancelTask = async (record: TaskTableItem) => {
    if (!projectId)
      return
    try {
      await benchmarkEvaluationServices.cancelBenchmarkTask(Number(projectId), record.id)
      message.success('任务终止成功')
      // 刷新列表
      fetchTaskList(pagination.current, pagination.pageSize)
    }
    catch (error: any) {
      console.error('终止任务失败:', error)
      message.error(error?.response?.data?.message || '终止任务失败，请重试')
    }
  }
  // 删除任务
  const handleDeleteTask = async (record: TaskTableItem) => {
    if (!projectId)
      return
    try {
      await benchmarkEvaluationServices.deleteBenchmarkTask(Number(projectId), record.id)
      message.success('删除成功')
      // 刷新列表
      fetchTaskList(pagination.current, pagination.pageSize)
      // 如果删除的任务在选中列表中，移除它
      setSelectedTaskIds((prev) => prev.filter((id) => id !== record.id))
    }
    catch (error: any) {
      console.error('删除失败:', error)
      message.error(error?.response?.data?.message || '删除失败，请重试')
    }
  }
  // 克隆任务：拉取详情后跳转创建页并回显
  const handleCloneTask = async (record: TaskTableItem) => {
    if (!projectId)
      return
    try {
      const detail = await benchmarkEvaluationServices.getBenchmarkEvaluationDetail(Number(projectId), record.id)
      navigate(`/project/${projectId}/effect-evaluation/benchmark/create`, {
        state: { cloneData: detail },
      })
    }
    catch (error: any) {
      console.error('克隆失败:', error)
      message.error(error?.response?.data?.message || '获取任务详情失败，请重试')
    }
  }
  // 编辑任务
  const handleEditTask = async (record: TaskTableItem) => {
    if (!projectId)
      return
    try {
      const detail = await benchmarkEvaluationServices.getBenchmarkEvaluationDetail(Number(projectId), record.id)
      // 跳转到创建页面 传递详情数据用于回显
      navigate(`/project/${projectId}/effect-evaluation/benchmark/create`, {
        state: { editData: detail, taskId: record.id },
      })
    }
    catch (error: any) {
      console.error('获取任务详情失败:', error)
      message.error(error?.response?.data?.message || '获取任务详情失败，请重试')
    }
  }
  // 对比评估
  const handleCompareEvaluation = async () => {
    if (!projectId)
      return
    // 验证选中数量（2-5个）
    if (selectedTaskIds.length < 2) {
      message.warning('请至少选择2个任务进行对比评估')
      return
    }
    if (selectedTaskIds.length > 5) {
      message.warning('最多只能选择5个任务进行对比评估')
      return
    }
    setCompareLoading(true)
    try {
      const taskIds = selectedTaskIds.map((id) => Number(id))
      const result = await benchmarkEvaluationServices.compareBatchTask(Number(projectId), { task_ids: taskIds })
      setCompareResult(result)
      setCompareModalVisible(true)
      message.success('对比评估成功')
    }
    catch (error: any) {
      console.error('对比评估失败:', error)
      message.error(error?.response?.data?.message || '对比评估失败，请重试')
    }
    finally {
      setCompareLoading(false)
    }
  }
  // 下载对比评估报告（仿 ReportDetail：从响应头取文件名，用 createBlobFromResponse 生成 blob 避免乱码）
  const handleDownloadCompareResult = async () => {
    if (!projectId || !compareResult || !selectedTaskIds?.length)
      return
    setCompareDownloadLoading(true)
    try {
      const taskIds = selectedTaskIds.map((id) => Number(id))
      const response = await benchmarkEvaluationServices.downCompareResults(Number(projectId), taskIds)
      const defaultFilename = `对比评估报告_${dayjs().format('YYYYMMDD_HHmmss')}.docx`
      const fileName = extractFilenameFromHeaders(response.headers, defaultFilename) || defaultFilename
      const blob = createBlobFromResponse(response.data, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      downloadBlobFile(blob, fileName)
      message.success('下载成功')
    }
    catch (error: any) {
      console.error('下载对比评估报告失败:', error)
      message.error(error?.response?.data?.message || '下载失败，请稍后重试')
    }
    finally {
      setCompareDownloadLoading(false)
    }
  }
  // 处理对比数据，转换为图表和表格所需格式
  const compareChartData = useMemo(() => {
    if (!compareResult || !compareResult.model_reports || compareResult.model_reports.length === 0) {
      return {
        radarData: [],
        barData: [],
        tableData: [],
        modelConfigs: [],
        modelNames: [],
      }
    }
    // 收集所有数据集名称
    const allDatasetNames = new Set<string>()
    compareResult.model_reports.forEach((modelReport) => {
      if (modelReport.radar_chart_data?.data) {
        modelReport.radar_chart_data.data.forEach((item) => {
          allDatasetNames.add(item.dataset_name)
        })
      }
    })
    const datasetNames = Array.from(allDatasetNames).sort()
    // 生成模型配置
    const colors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2']
    const tagColors = ['blue', 'green', 'orange', 'red', 'purple', 'cyan']
    const modelConfigs = compareResult.model_reports.map((modelReport, index) => ({
      key: `model${index + 1}`,
      name: `${modelReport.model_name}${modelReport.model_version ? `-${modelReport.model_version}` : ''}`,
      color: colors[index % colors.length],
      tagColor: tagColors[index % tagColors.length],
      modelId: modelReport.model_id,
    }))
    // 生成雷达图数据（多模型格式）
    const multiRadarData = datasetNames.map((datasetName) => {
      const dataPoint: {
        subject: string
        [key: string]: string | number
      } = {
        subject: datasetName,
      }
      compareResult.model_reports.forEach((modelReport, index) => {
        const chartData = modelReport.radar_chart_data?.data || []
        const datasetItem = chartData.find((item) => item.dataset_name === datasetName)
        const score = datasetItem?.score ?? 0
        dataPoint[`model${index + 1}`] = score
      })
      return dataPoint
    })
    // 生成柱状图数据（与雷达图数据格式相同）
    const barData = multiRadarData
    // 生成表格数据
    const tableData = datasetNames.map((datasetName) => {
      const row: {
        dataset: string
        [key: string]: string | number
      } = {
        dataset: datasetName,
        key: datasetName,
      }
      compareResult.model_reports.forEach((modelReport, index) => {
        const chartData = modelReport.radar_chart_data?.data || []
        const datasetItem = chartData.find((item) => item.dataset_name === datasetName)
        const score = datasetItem?.score ?? 0
        row[`model${index + 1}`] = score.toFixed(2)
      })
      return row
    })
    // 计算最大值（用于图表域）
    let maxValue = 0
    multiRadarData.forEach((item) => {
      compareResult.model_reports.forEach((_, index) => {
        const value = item[`model${index + 1}`] as number
        if (typeof value === 'number' && !isNaN(value)) {
          maxValue = Math.max(maxValue, value)
        }
      })
    })
    const domainMax = maxValue > 0 ? Math.max(10, Math.ceil(maxValue / 10) * 10) : 100
    return {
      radarData: multiRadarData,
      barData,
      tableData,
      modelConfigs,
      modelNames: modelConfigs.map((c) => c.name),
      maxValue: domainMax,
    }
  }, [compareResult])
  // 获取榜单列表数据
  const fetchLeaderboardList = useCallback(async (page: number = 1, size: number = 10, sortBy?: string, sortOrder?: string) => {
    if (!projectId)
      return
    setLeaderboardLoading(true)
    try {
      const response = await benchmarkEvaluationServices.getLeaderboardList(Number(projectId), { page, size, sort_by: sortBy, sort_order: sortOrder })
      // 收集所有出现的数据集名称
      const allDatasetNames = new Set<string>()
      response.items.forEach((item: LeaderboardListItem) => {
        if (item.dataset_scores) {
          Object.keys(item.dataset_scores).forEach((datasetName) => {
            allDatasetNames.add(datasetName)
          })
        }
      })
      const sortedDatasetNames = Array.from(allDatasetNames).sort()
      setDatasetColumns(sortedDatasetNames)
      // 转换数据格式
      const formattedData: BenchmarkData[] = response.items.map((item: LeaderboardListItem, index: number) => {
        const rank = (page - 1) * size + index + 1
        const modelName = `${item.model_name}${item.model_version ? `-${item.model_version}` : ''}`
        const averageScore = item.average_score !== null && item.average_score !== undefined
          ? item.average_score.toFixed(2)
          : '-'
        // 从 dataset_scores 中提取各数据集得分
        const datasetScores: {
          [key: string]: string
        } = {}
        if (item.dataset_scores) {
          Object.entries(item.dataset_scores).forEach(([datasetName, score]) => {
            datasetScores[datasetName] = score !== null && score !== undefined ? score.toFixed(2) : '-'
          })
        }
        return {
          key: String(item.id),
          rank,
          model: modelName,
          modelTag: averageScore,
          datasetScores,
        }
      })
      setLeaderboardData(formattedData)
      setLeaderboardPagination({
        current: response.page || page,
        pageSize: response.size || size,
        total: response.total || 0,
      })
      // 从榜单数据中提取模型列表（用于下拉选择框）
      const models = response.items.map((item: LeaderboardListItem) => ({
        id: item.model_id,
        name: `${item.model_name}${item.model_version ? `-${item.model_version}` : ''}`,
      }))
      setAvailableModels(models)
      // 如果还没有选中模型，默认选择前两个
      if (selectedModels.length === 0 && models.length > 0) {
        setSelectedModels(models.slice(0, Math.min(3, models.length)).map((m) => m.name))
      }
    }
    catch (error) {
      console.error('获取榜单列表失败:', error)
      message.error('获取榜单列表失败')
      setLeaderboardData([])
    }
    finally {
      setLeaderboardLoading(false)
    }
  }, [projectId])
  // 获取雷达图数据
  const fetchRadarChartData = useCallback(async (modelNames: string[]) => {
    if (!projectId || modelNames.length === 0) {
      setRadarData([])
      return
    }
    setRadarLoading(true)
    try {
      // 根据模型名称找到对应的模型ID
      const modelIds = modelNames
        .map((name) => {
          const model = availableModels.find((m) => m.name === name)
          return model?.id
        })
        .filter((id): id is number => id !== undefined)
      if (modelIds.length === 0) {
        setRadarData([])
        return
      }
      // 调用雷达图接口，传递所有选中的模型ID
      const response = await benchmarkEvaluationServices.getLeaderboardRadarChart(Number(projectId), { model_ids: modelIds.length === 1 ? modelIds[0] : modelIds })
      // 转换雷达图数据格式
      if (response.model_reports && response.model_reports.length > 0) {
        const orderedReports = modelIds
          .map((id) => response.model_reports!.find((r: ModelReport) => r.model_id === id))
          .filter((report) => report !== null)
        if (orderedReports.length === 0) {
          setRadarData([])
          return
        }
        // 收集所有数据集名称
        const allDatasetNames = new Set<string>()
        orderedReports.forEach((report: ModelReport) => {
          Object.keys(report.dataset_scores || {}).forEach((datasetName) => {
            allDatasetNames.add(datasetName)
          })
        })
        // 转换为雷达图数据格式
        const chartData: RadarChartData[] = Array.from(allDatasetNames).map((datasetName) => {
          const dataPoint: any = { subject: datasetName }
          orderedReports.forEach((report: ModelReport, index: number) => {
            const score = report.dataset_scores?.[datasetName]
            const modelKey = `model${String.fromCharCode(65 + index)}` // modelA, modelB, modelC...
            if (score !== undefined && score !== null) {
              dataPoint[modelKey] = score
            }
          })
          return dataPoint
        })
        setRadarData(chartData)
      }
      else {
        setRadarData([])
      }
    }
    catch (error) {
      console.error('获取雷达图数据失败:', error)
      message.error('获取雷达图数据失败')
      setRadarData([])
    }
    finally {
      setRadarLoading(false)
    }
  }, [projectId, availableModels])
  // 组件挂载时获取榜单数据
  useEffect(() => {
    fetchLeaderboardList()
  }, [fetchLeaderboardList])
  // 当选中模型变化时，获取雷达图数据
  useEffect(() => {
    if (availableModels.length > 0 && selectedModels.length > 0) {
      fetchRadarChartData(selectedModels)
    }
  }, [selectedModels, availableModels, fetchRadarChartData])
  // 动态生成表格列
  const columns = [
    {
      title: '排名',
      dataIndex: 'rank',
      key: 'rank',
      width: 30,
      fixed: 'left' as const,
      render: (rank: number) => {
        let badgeColor = ''
        if (rank === 1)
          badgeColor = '#ff4d4f'
        else if (rank === 2)
          badgeColor = '#faad14'
        else if (rank === 3)
          badgeColor = '#52c41a'
        return (
          <Badge
            className="font-bold"
            count={rank}
            style={{
              backgroundColor: badgeColor || '#d9d9d9',
              color: '#fff',
            }}
          />
        )
      },
    },
    {
      title: '模型',
      dataIndex: 'model',
      key: 'model',
      width: 100,
      fixed: 'left' as const,
    },
    {
      title: '平均分',
      dataIndex: 'modelTag',
      key: 'modelTag',
      width: 80,
    },
    // 动态生成数据集列
    ...datasetColumns.map((datasetName) => ({
      title: datasetName,
      key: `dataset_${datasetName}`,
      width: 80,
      render: (_: any, record: BenchmarkData) => {
        return record.datasetScores?.[datasetName] || '-'
      },
    })),
  ]
  return (
    <div className="benchmark-evaluation-container">
      <Row gutter={16} className="mb-8">
        {/* 左侧：基准评估选择 */}
        <Col span={12}>
          <Card
            title={(
              <Space>
                <Title level={5} className="m-0">
                  基准评估雷达图
                </Title>
              </Space>
            )}
            extra={(
              <Space>
                <span>对比模型:</span>
                <Select
                  mode="multiple"
                  className="w-[200px]"
                  placeholder="请选择模型"
                  value={selectedModels}
                  onChange={setSelectedModels}
                  loading={leaderboardLoading}
                  disabled={availableModels.length === 0}
                  maxTagCount="responsive"
                  maxTagTextLength={10}
                  maxTagPlaceholder={(omittedValues) => (
                    <Tooltip
                      title={omittedValues.map((item) => item.label ?? item.value).join('、')}
                    >
                      <span>{`+${omittedValues.length}...`}</span>
                    </Tooltip>
                  )}
                >
                  {availableModels.map((model) => (
                    <Option key={model.id} value={model.name}>
                      {model.name}
                    </Option>
                  ))}
                </Select>
              </Space>
            )}
            className="h-[488px]"
            bodyStyle={{ height: '400px', padding: '24px' }}
          >
            {radarLoading ? (
              <div className="flex justify-center items-center h-full">
                加载中...
              </div>
            ) : radarData.length > 0 && selectedModels.length > 0 ? (
              <BenchmarkRadarChart
                type="multi"
                multiData={radarData}
                modelConfigs={selectedModels.map((name, index) => {
                  const colors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2']
                  return {
                    key: `model${String.fromCharCode(65 + index)}`,
                    name,
                    color: colors[index % colors.length],
                  }
                })}
                height={400}
                domain={[0, 100]}
              />
            ) : (
              <div className="flex justify-center items-center h-full text-[var(--lab-color-placeholder)]">
                {selectedModels.length === 0 ? '请选择对比模型' : '暂无雷达图数据'}
              </div>
            )}
          </Card>
        </Col>

        {/* 右侧：基准评估榜单 */}
        <Col span={12}>
          <Card
            title={(
              <Title level={5} className="m-0">
                基准评估榜单
              </Title>
            )}
            extra={(
              <Button icon={<ReloadOutlined />} type="link" onClick={() => fetchLeaderboardList(leaderboardPagination.current, leaderboardPagination.pageSize)} loading={leaderboardLoading}>
                刷新
              </Button>
            )}
            className="h-[488px]"
            bodyStyle={{ height: '400px', padding: '10px', overflow: 'hidden' }}
          >
            <Table
              columns={columns}
              dataSource={leaderboardData}
              loading={leaderboardLoading}
              pagination={{
                current: leaderboardPagination.current,
                pageSize: leaderboardPagination.pageSize,
                total: leaderboardPagination.total,
                size: 'small',
                showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
                onChange: (page, pageSize) => {
                  fetchLeaderboardList(page, pageSize)
                },
              }}
              scroll={{ x: 900, y: 320 }}
              size="small"
            />
          </Card>
        </Col>
      </Row>

      {/* 底部表格区域 */}
      <Card
        title="基准评估任务"
        extra={(
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => fetchTaskList(pagination.current, pagination.pageSize)} loading={loading}>
              刷新
            </Button>
            <Button type="primary" onClick={handleCompareEvaluation} disabled={selectedTaskIds.length < 2 || selectedTaskIds.length > 5} loading={compareLoading}>
              对比评估 (
              {selectedTaskIds.length}
              )
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/project/${projectId}/effect-evaluation/benchmark/create`)}>
              创建基准评估任务
            </Button>
          </Space>
        )}
      >
        <Table<TaskTableItem>
          rowSelection={{
            selectedRowKeys: selectedTaskIds,
            onChange: (selectedRowKeys) => {
              setSelectedTaskIds(selectedRowKeys)
            },
            getCheckboxProps: (record: TaskTableItem) => ({
              // 只有状态为'已完成'的任务才能被勾选
              disabled: record.taskStatus !== '已完成',
            }),
          }}
          columns={[
            {
              title: '任务名称',
              dataIndex: 'taskName',
              key: 'taskName',
              fixed: 'left',
              width: 150,
            },
            {
              title: '任务状态',
              width: 100,
              dataIndex: 'taskStatus',
              key: 'taskStatus',
              render: (status: string, record: TaskTableItem) => {
                const tag = (
                  <Tag color={status === '已完成' ? 'success' : 'processing'}>
                    {status}
                  </Tag>
                )
                const isScheduledPending = status === '定时待启动'
                const tipTitle = isScheduledPending && record?.schedule_at
                  ? `启动时间: ${dayjs(record.schedule_at).format('YYYY-MM-DD HH:mm:ss')}`
                  : undefined
                return tipTitle ? (
                  <Tooltip title={tipTitle} placement="topLeft">
                    {tag}
                  </Tooltip>
                ) : (tag)
              },
            },
            {
              title: '运行时长',
              width: 180,
              key: 'runningTime',
              render: (_: unknown, record: TaskTableItem) => (
                <span>{calculateRunningTime(record.started_at, record.finished_at)}</span>
              ),
            },
            {
              title: '评估进度',
              width: 150,
              dataIndex: 'progress',
              key: 'progress',
              render: (progress: number) => (<Progress percent={progress} />),
            },
            {
              title: '基准评估集',
              width: 150,
              dataIndex: 'resultSet',
              key: 'resultSet',
              render: (resultSet: string) => (<span>{resultSet}</span>),
            },
            {
              title: '待评估模型/服务',
              width: 150,
              dataIndex: 'model',
              key: 'model',
              render: (model: string) => (<span>{model}</span>),
            },
            {
              title: '创建人',
              width: 100,
              dataIndex: 'creator',
              key: 'creator',
            },
            {
              title: '创建时间',
              width: 150,
              dataIndex: 'createTime',
              key: 'createTime',
            },
            {
              title: '操作',
              key: 'action',
              fixed: 'right' as const,
              width: 180,
              render: (_, record: TaskTableItem) => {
                // 判断是否可以启动任务（已完成、运行中、排队中、终止、失败的任务不能启动）
                const canStart = ['已创建'].includes(record.taskStatus)
                const canStop = ['运行中', '排队中'].includes(record.taskStatus)
                const canDelete = ['已创建', '定时待启动', '已完成', '失败', '已终止', '终止'].includes(record.taskStatus)
                const canEdit = ['已创建', '定时待启动', '失败', '已终止', '终止'].includes(record.taskStatus)
                const actions: TableActionItem[] = [
                  {
                    key: 'start',
                    label: '启动',
                    disabled: !canStart,
                    confirm: {
                      title: '确定启动该任务吗？',
                      description: `启动任务"${record.taskName}"后，任务将开始执行。`,
                      onConfirm: () => handleStartTask(record),
                      okText: '确定',
                      cancelText: '取消',
                    },
                  },
                  {
                    key: 'edit',
                    label: '编辑',
                    disabled: !canEdit,
                    onClick: () => handleEditTask(record),
                  },
                  {
                    key: 'delete',
                    label: '删除',
                    danger: true,
                    disabled: !canDelete,
                    // disabled: record.taskStatus !== '已完成',
                    confirm: {
                      title: '确定删除该任务吗？',
                      description: `删除任务"${record.taskName}"后无法恢复，确定要继续吗？`,
                      onConfirm: () => handleDeleteTask(record),
                      okText: '确定',
                      cancelText: '取消',
                    },
                  },
                  {
                    key: 'view',
                    label: '查看报告',
                    onClick: () => handleViewReport(record),
                  },
                  {
                    key: 'clone',
                    label: '克隆',
                    onClick: () => handleCloneTask(record),
                  },
                  {
                    key: 'stop',
                    label: '终止',
                    disabled: !canStop,
                    danger: true,
                    confirm: {
                      title: '确定终止该任务吗？',
                      description: `终止任务"${record.taskName}"后，任务将停止执行。`,
                      onConfirm: () => handleCancelTask(record),
                      okText: '确定',
                      cancelText: '取消',
                    },
                  },
                ]
                return <TableActionColumn actions={actions} />
              },
            },
          ]}
          dataSource={taskList}
          loading={loading}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条数据`,
            onChange: (page, pageSize) => {
              fetchTaskList(page, pageSize)
            },
            onShowSizeChange: (current, size) => {
              fetchTaskList(current, size)
            },
          }}
        />
      </Card>

      {/* 对比评估弹窗 */}
      <Modal
        className="top-[20px]"
        title={(
          <div className="flex justify-between items-center w-full pr-10">
            <Title level={4} className="m-0">对比报告</Title>
            <Space style={{ marginLeft: 'auto' }}>
              <Button type="primary" icon={<DownloadOutlined />} disabled={!compareResult} loading={compareDownloadLoading} onClick={handleDownloadCompareResult} className="mr-2">
                下载
              </Button>
              <Button icon={<CloseOutlined />} onClick={() => setCompareModalVisible(false)}>
                关闭
              </Button>
            </Space>
          </div>
        )}
        open={compareModalVisible}
        onCancel={() => setCompareModalVisible(false)}
        footer={null}
        width={1200}
        bodyStyle={{ maxHeight: 'calc(100vh - 100px)', overflowY: 'auto', padding: '24px' }}
        closeIcon={null}
      >
        {compareResult && compareChartData.radarData.length > 0 ? (
          <Space direction="vertical" size="large" className="w-full">
            {/* 评分维度雷达图和评分数据明细 */}
            <Row gutter={24}>
              <Col span={12}>
                <Card size="small" title="评分维度雷达图">
                  <BenchmarkRadarChart type="multi" multiData={compareChartData.radarData} modelConfigs={compareChartData.modelConfigs} height={300} domain={[0, compareChartData.maxValue]} />
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" title="评分数据明细">
                  <Table
                    size="small"
                    columns={[
                      {
                        title: '评估数据集',
                        dataIndex: 'dataset',
                        key: 'dataset',
                        fixed: 'left' as const,
                        width: 150,
                      },
                      ...compareChartData.modelConfigs.map((config) => ({
                        title: config.name,
                        dataIndex: config.key,
                        key: config.key,
                        width: 120,
                        align: 'center' as const,
                        render: (value: string | number) => value || '-',
                      })),
                    ]}
                    dataSource={compareChartData.tableData}
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    bordered
                  />
                </Card>
              </Col>
            </Row>

            {/* 评分对比柱状图 */}
            <Card>
              <Title level={5} className="mb-4">评分对比柱状图</Title>
              {compareChartData.modelNames.length > 0 && (
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  {compareChartData.modelNames.map((name, index) => (
                    <Tag key={index} color={compareChartData.modelConfigs[index]?.tagColor || 'blue'} className="mr-2">
                      {name}
                    </Tag>
                  ))}
                </div>
              )}
              {compareChartData.barData.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={compareChartData.barData} margin={{ top: 20, right: 30, left: 20, bottom: 90 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="subject" angle={-45} textAnchor="end" height={90} interval={0} tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, compareChartData.maxValue]} ticks={Array.from({ length: 6 }, (_, i) => Math.round((compareChartData.maxValue / 5) * i))} label={{ value: '分数', angle: -90, position: 'insideLeft' }} />
                    <RechartsTooltip
                      formatter={(value: number, name: string) => {
                        const config = compareChartData.modelConfigs.find((c) => c.key === name)
                        return [`${value.toFixed(2)}分`, config?.name || name]
                      }}
                      labelFormatter={(label) => `指标: ${label}`}
                    />
                    {compareChartData.modelConfigs.map((config) => (<Bar key={config.key} dataKey={config.key} fill={config.color} radius={[4, 4, 0, 0]} name={config.name} />))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  暂无数据
                </div>
              )}
            </Card>
          </Space>
        ) : (
          <div className="text-center py-8 text-gray-400">
            暂无对比数据
          </div>
        )}
      </Modal>
    </div>
  )
}
export default BenchmarkEvaluation
