import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Card,
  Space,
  Typography,
  message,
} from 'antd'
import { FileWordOutlined } from '@ant-design/icons'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import EvaluationDetailsTab from './EvaluationDetailsTab'
import ReportBasicInfoCard from './ReportBasicInfoCard'
import ReportChartsSection from './ReportChartsSection'
import ReportDetailShell from './ReportDetailShell'
import { buildEvaluationResultColumns } from './ReportEvaluationColumns'
import ReportTaskLogsTab from './ReportTaskLogsTab'
import type { EvaluationResultData, EvaluationType } from '@/types/ReportDetailTypes.ts'
import { useReportDownloads } from '@/utils/useReportDownloads.ts'
import {
  buildAvailableMetrics,
  buildCurrentModelData,
  buildReportChartData,
  collectBusinessEvaluationDynamicFieldKeys,
} from '@/utils/ReportDataTransforms.ts'
import { useReportLogs } from '@/utils/useReportLogs.ts'
import type { DatasetModelRelation, MetricSummaryItem, ModelReport, ProjectEvaluationTaskDetail, ProjectEvaluationTaskReport, ProjectEvaluationTaskResults } from '@/services/modelEvaluationServices'
import { modelEvaluationServices } from '@/services/modelEvaluationServices'
import type { EvaluationListResponse } from '@/services/manualEvaluationService'
import { manualEvaluationServices } from '@/services/manualEvaluationService'
import { benchmarkEvaluationServices } from '@/services/benchmarkEvaluationService'
import { EvaluationMethodMapping } from '@/utils/EnumMaping'

const { Title, Text } = Typography

interface EvaluationReportDetailProps { evaluationPrefix?: string }

// 路由状态类型
interface LocationState {
  taskStatus?: string
  evaluationType?: EvaluationType
}

// 计算方式映射
const CALCULATION_METHOD_MAP: { [key: string]: string } = {
  平均: 'average',
  最大: 'max',
  最小: 'min',
}

const EvaluationReportDetail: React.FC<EvaluationReportDetailProps> = ({ evaluationPrefix }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { taskId, projectId } = useParams()
  const [activeTab, setActiveTab] = useState('report')
  const [selectedModelTab, setSelectedModelTab] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(10)

  // 基本信息对象
  const [taskDetail, setTaskDetail] = useState<ProjectEvaluationTaskDetail | null>(null)
  const [isLoadingTaskDetail, setIsLoadingTaskDetail] = useState(false)

  // 从路由 state 获取任务状态和评估类型
  const locationState = location.state as LocationState | null
  const routeTaskStatus = locationState?.taskStatus || ''
  const searchParams = new URLSearchParams(location.search)
  const evaluationType = (searchParams.get('evaluationType') || locationState?.evaluationType || 'auto') as EvaluationType // 默认为auto，兼容旧代码

  const taskStatus = useMemo(() => {
    return routeTaskStatus || taskDetail?.status || ''
  }, [routeTaskStatus, taskDetail?.status])
  const isCompleted = useMemo(() => {
    return taskStatus === '已完成'
  }, [taskStatus])
  const isFailed = useMemo(() => {
    return taskStatus === '失败' || taskStatus === '执行失败'
  }, [taskStatus])

  // 评估结果数据
  const [evaluationResults, setEvaluationResults] = useState<ProjectEvaluationTaskResults | null>(null)
  const [isLoadingResults, setIsLoadingResults] = useState(false)

  // 人工评估结果数据
  const [manualEvaluationResults, setManualEvaluationResults] = useState<EvaluationListResponse | null>(null)
  const [isLoadingManualResults, setIsLoadingManualResults] = useState(false)

  // 报告数据
  const [reportData, setReportData] = useState<ProjectEvaluationTaskReport | null>(null)
  const [refereeReportData, setRefereeReportData] = useState<ProjectEvaluationTaskReport | null>(null) // 裁判员评估报告数据
  const [basicMetricReportData, setBasicMetricReportData] = useState<ProjectEvaluationTaskReport | null>(null) // 基础指标评估报告数据
  const [isReportDataLoaded, setIsReportDataLoaded] = useState(false) // 标记是否已加载所有报告数据
  const [isLoadingReport, setIsLoadingReport] = useState(false)
  const [calculationMethod, setCalculationMethod] = useState<string>('平均') // 计算方式：平均、最大、最小
  const [evaluationMethodFilter, setEvaluationMethodFilter] = useState<string>('裁判员评估') // 评估方法筛选：裁判员评估、基础指标评估（用于报告）
  const [evaluationMethodFilterForResults, setEvaluationMethodFilterForResults] = useState<string>('裁判员评估') // 评估方法筛选：裁判员评估、基础指标评估（用于评估数据结果）

  // 评估方法选项配置
  const evaluationMethodOptions = useMemo(() => [
    { value: '裁判员评估', label: '裁判员评估', apiValue: 'referee' },
    { value: '基础指标评估', label: '基础指标评估', apiValue: 'basic_metric' },
  ], [])

  // 将评估结果筛选值映射到 API 值
  const apiEvaluationMethodForResults = useMemo(() => {
    if (evaluationType === 'manual') {
      return 'manual'
    }
    // 根据筛选值映射到对应的 API 值
    const option = evaluationMethodOptions.find((opt) => opt.value === evaluationMethodFilterForResults)
    return option?.apiValue || 'basic_metric'
  }, [evaluationType, evaluationMethodFilterForResults, evaluationMethodOptions])

  // 将报告筛选值映射到 API 值
  const apiEvaluationMethodForReport = useMemo(() => {
    if (evaluationType === 'manual') {
      return 'manual'
    }
    // 根据筛选值映射到对应的 API 值
    const option = evaluationMethodOptions.find((opt) => opt.value === evaluationMethodFilter)
    return option?.apiValue || 'basic_metric'
  }, [evaluationType, evaluationMethodFilter, evaluationMethodOptions])

  // 展开单元格状态
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set())

  // 图表引用，用于导出Word
  const radarChartRef = useRef<HTMLDivElement>(null)
  const barChartRef = useRef<HTMLDivElement>(null)

  // 用于跟踪是否正在加载报告数据，避免循环调用
  const isLoadingReportsRef = useRef(false)
  // 用于跟踪上一次的 apiEvaluationMethodForReport，避免重复调用
  const lastReportRequestKeyRef = useRef<string | null>(null)

  // 获取评估任务详情 - 每次进入页面都重新调用，根据evaluationType调用不同的接口
  useEffect(() => {
    const fetchTaskDetail = async () => {
      if (!projectId || !taskId) return

      setIsLoadingTaskDetail(true)

      try {
        let result: ProjectEvaluationTaskDetail

        // 根据评估类型调用不同的接口
        if (evaluationType === 'manual') {
          // 人工评估调用人工评估接口
          const manualResult = await manualEvaluationServices.getManualEvaluationTaskDetail(
            Number(projectId),
            Number(taskId),
          )
          // 类型转换，因为两个服务的类型定义略有不同但结构相似，使用双重断言绕过类型检查
          result = manualResult as any as ProjectEvaluationTaskDetail
        }
        else if (evaluationType === 'benchmark') {
          // 基准评估调用基准评估专门接口
          const benchmarkResult = await benchmarkEvaluationServices.getBenchmarkEvaluationDetail(
            Number(projectId),
            Number(taskId),
          )
          // 类型转换，将基准评估详情转换为通用格式
          result = benchmarkResult as any as ProjectEvaluationTaskDetail
        }
        else {
          // 自动评估调用通用接口
          result = await modelEvaluationServices.getProjectEvaluationTaskDetail(
            Number(projectId),
            Number(taskId),
          )
        }

        setTaskDetail(result)
        // 根据 evaluation_method 设置默认的评估方法筛选值
        if (result?.evaluation_method) {
          const methodMap: { [key: string]: string } = {
            referee: '裁判员评估',
            basic_metric: '基础指标评估',
            all: '裁判员评估', // all 时默认选择第一个选项
          }
          const defaultFilter = methodMap[result.evaluation_method] || '裁判员评估'
          setEvaluationMethodFilter(defaultFilter)
          setEvaluationMethodFilterForResults(defaultFilter)
        }
        // 设置默认选中的模型 tab
        if (result?.dataset_model_relations && result.dataset_model_relations.length > 0) {
          // 暂时使用 inference_result_dataset_id，model_id 暂时注释
          const firstDatasetId = Object.prototype.hasOwnProperty.call(result.dataset_model_relations[0], 'inference_result_dataset_id')
            ? String(result.dataset_model_relations[0].inference_result_dataset_id)
            : String(result.dataset_model_relations[0].evaluated_model_id)
          // const firstModelId = String(result.dataset_model_relations[0].evaluated_model_id);
          setSelectedModelTab(firstDatasetId)
        }
      }
      catch (error) {
        console.error('获取评估任务详情失败:', error)
        message.error('获取评估任务详情失败')
      }
      finally {
        setIsLoadingTaskDetail(false)
      }
    }

    fetchTaskDetail()
  }, [projectId, taskId, evaluationType])

  // 获取评估结果数据 - 只有已完成状态才调用，人工评估调用不同的接口
  useEffect(() => {
    const fetchEvaluationResults = async () => {
      // 如果状态不是已完成，不调用接口
      if (!isCompleted || !projectId || !taskId) return

      // 人工评估调用不同的接口
      if (evaluationType === 'manual') {
        setIsLoadingManualResults(true)
        try {
          const result = await manualEvaluationServices.getQueryEvaluationList(
            Number(projectId),
            Number(taskId),
            { page: currentPage, size: pageSize, status: 'all' },
          )
          setManualEvaluationResults(result)
          setEvaluationResults(null)
        }
        catch (error) {
          console.error('获取人工评估结果失败:', error)
          setManualEvaluationResults(null)
        }
        finally {
          setIsLoadingManualResults(false)
        }
        return
      }

      // 非人工评估需要 selectedModelTab
      if (!selectedModelTab) return

      setIsLoadingResults(true)

      try {
        // 暂时使用 inference_result_dataset_id，model_id 暂时注释
        const datasetId = Number(selectedModelTab)
        // 使用映射后的评估方法值（根据筛选器选择）
        const result = await modelEvaluationServices.getProjectEvaluationTaskResults(
          Number(projectId),
          Number(taskId),
          datasetId, // 暂时使用 dataset_id，model_id 暂时注释
          // modelId,
          currentPage,
          pageSize,
          apiEvaluationMethodForResults,
        )
        setEvaluationResults(result)
        setManualEvaluationResults(null)
      }
      catch (error) {
        console.error('获取评估结果失败:', error)
        setEvaluationResults(null)
      }
      finally {
        setIsLoadingResults(false)
      }
    }

    fetchEvaluationResults()
  }, [isCompleted, projectId, taskId, selectedModelTab, currentPage, pageSize, apiEvaluationMethodForResults, evaluationType])

  // 切换模型 tab 或评估方法筛选时重置页码
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedModelTab, evaluationMethodFilterForResults])

  // 获取评估报告数据 - 只有已完成状态才调用
  useEffect(() => {
    const fetchReport = async (apiMethod: string, evaluationMethod: string) => {
      try {
        let result: ProjectEvaluationTaskReport

        if (evaluationType === 'benchmark') {
          // 基准评估调用基准评估专门接口
          const benchmarkReport = await benchmarkEvaluationServices.getBatchEvaluationReport(
            Number(projectId),
            Number(taskId),
          )

          // 将基准评估报告转换为通用格式
          const convertedModelReports = benchmarkReport.model_reports.map((modelReport) => {
            const metricSummary: { [key: string]: MetricSummaryItem } = {}

            // 将 dataset_scores 转换为 metric_summary
            if (modelReport.dataset_scores && typeof modelReport.dataset_scores === 'object') {
              Object.entries(modelReport.dataset_scores).forEach(([datasetName, score]) => {
                if (score !== null && score !== undefined && typeof score === 'number' && !isNaN(score)) {
                  metricSummary[datasetName] = {
                    metric_name: datasetName,
                    score,
                    score_min: 0,
                    score_max: 100,
                    percentage_score: score,
                  }
                }
              })
            }

            return {
              model_id: modelReport.model_id,
              model_name: modelReport.model_name,
              evaluation_method: 'basic_metric',
              aggregative_metrics: Object.keys(metricSummary).length > 0 ? [{
                calculation_method: apiMethod,
                metric_summary: metricSummary,
              }] : [],
              comparison_data: null,
            } as ModelReport
          })

          result = {
            evaluation_task_id: benchmarkReport.benchmark_task_id,
            evaluation_type: benchmarkReport.evaluation_type === 'comparison' ? 'comparison' : 'single',
            model_reports: convertedModelReports,
          } as ProjectEvaluationTaskReport
        }
        else {
          // 自动评估和人工评估使用原有逻辑
          result = await modelEvaluationServices.getProjectEvaluationTaskReport(
            Number(projectId),
            Number(taskId),
            apiMethod,
            evaluationMethod,
          )
        }

        return result
      }
      catch (error) {
        console.error('获取评估报告失败:', error)
        return null
      }
    }

    const loadReports = async () => {
      // 如果正在加载，直接返回
      if (isLoadingReportsRef.current) return

      // 如果状态不是已完成，不调用接口
      if (!isCompleted || !projectId || !taskId) return

      // 人工评估和基准评估不需要 selectedModelTab，自动评估需要
      if (evaluationType === 'auto' && !selectedModelTab) return

      const apiMethod = CALCULATION_METHOD_MAP[calculationMethod] || 'average'
      const reportEvaluationMethodKey = evaluationType === 'manual'
        ? 'manual'
        : (taskDetail?.evaluation_method === 'all' ? 'all' : apiEvaluationMethodForReport)
      const reportRequestKey = [
        projectId,
        taskId,
        evaluationType,
        selectedModelTab,
        apiMethod,
        reportEvaluationMethodKey,
      ].join('|')

      if (lastReportRequestKeyRef.current === reportRequestKey) return

      // 如果是自动评估且 evaluation_method === 'all' 且已加载过数据，不再重新加载
      if (evaluationType === 'auto' && taskDetail?.evaluation_method === 'all' && isReportDataLoaded) {
        return
      }

      isLoadingReportsRef.current = true
      setIsLoadingReport(true)

      try {
        // 如果是自动评估且 evaluation_method === 'all'，同时加载两个数据
        if (evaluationType === 'auto' && taskDetail?.evaluation_method === 'all') {
          const [refereeResult, basicMetricResult] = await Promise.all([
            fetchReport(apiMethod, 'referee'),
            fetchReport(apiMethod, 'basic_metric'),
          ])

          setRefereeReportData(refereeResult)
          setBasicMetricReportData(basicMetricResult)
          setIsReportDataLoaded(true)

          setReportData(refereeResult)
        }
        else {
          // 其他情况使用原有逻辑
          const evaluationMethod = evaluationType === 'manual' ? 'manual' : apiEvaluationMethodForReport

          const result = await fetchReport(apiMethod, evaluationMethod)
          setReportData(result)
        }
        lastReportRequestKeyRef.current = reportRequestKey
      }
      catch (error) {
        console.error('获取评估报告失败:', error)
        setReportData(null)
      }
      finally {
        setIsLoadingReport(false)
        isLoadingReportsRef.current = false
      }
    }

    loadReports()
  }, [isCompleted, projectId, taskId, selectedModelTab, calculationMethod, evaluationType, taskDetail?.evaluation_method, isReportDataLoaded, apiEvaluationMethodForReport])

  // 切换评估方法筛选时，如果已加载过数据，直接切换显示，不重新调用API
  useEffect(() => {
    // 只有在自动评估且 evaluation_method === 'all' 且已加载过数据时，才切换显示，不重新调用API
    if (evaluationType === 'auto' && taskDetail?.evaluation_method === 'all' && isReportDataLoaded && refereeReportData && basicMetricReportData) {
      if (evaluationMethodFilter === '裁判员评估') {
        setReportData(refereeReportData)
      }
      else {
        setReportData(basicMetricReportData)
      }
    }
  }, [evaluationMethodFilter, evaluationType, taskDetail?.evaluation_method, isReportDataLoaded, refereeReportData, basicMetricReportData])

  // 当计算方式变化时，如果已加载过数据，需要重新加载（因为计算方式会影响数据）
  useEffect(() => {
    if (evaluationType === 'auto' && taskDetail?.evaluation_method === 'all' && isReportDataLoaded) {
      setIsReportDataLoaded(false)
      // 清空已加载的数据，触发重新加载
      setRefereeReportData(null)
      setBasicMetricReportData(null)
    }
  }, [calculationMethod, evaluationType, taskDetail?.evaluation_method, isReportDataLoaded])

  // 获取任务日志的公共方法
  const formatEvaluationType = (type?: string) => {
    if (!type) return '-'
    return type === 'comparison' ? '对比评估' : '单模型评估'
  }

  const formatEvaluationMethod = (method?: string) => {
    if (!method) return '-'
    return EvaluationMethodMapping[method as keyof typeof EvaluationMethodMapping] || method
  }

  const formatArrayToString = (arr?: string[]) => {
    if (!arr || arr.length === 0) return '-'
    return Array.from(new Set(arr.filter(Boolean))).join('、')
  }

  const getModelTabLabel = (relation: DatasetModelRelation) => {
    if (Object.prototype.hasOwnProperty.call(relation, 'evaluated_model_name') && relation.evaluated_model_name) {
      return relation.evaluated_model_name
    }
    if (Object.prototype.hasOwnProperty.call(relation, 'inference_result_dataset_id')) {
      return `数据集${relation.inference_result_dataset_id}`
    }
    return `模型${relation.evaluated_model_id}`
  }

  const businessDynamicFieldKeys = useMemo(
    () => evaluationPrefix === 'BUSSINESS' && evaluationType === 'auto' && evaluationResults?.items?.length
      ? collectBusinessEvaluationDynamicFieldKeys(evaluationResults.items)
      : [],
    [evaluationPrefix, evaluationType, evaluationResults],
  )

  const { radarData, barData, multiRadarData, modelConfigs, modelNames, isComparison, maxValue } = useMemo(() => buildReportChartData({
    reportData,
    evaluationMethodFilter,
    calculationMethod,
    apiEvaluationMethodForReport,
    evaluationType,
    evaluationMethodOptions,
  }), [reportData, evaluationMethodFilter, calculationMethod, apiEvaluationMethodForReport, evaluationType, evaluationMethodOptions])

  const getEvaluationMethodOptions = useCallback(() => {
    const evaluationMethod = taskDetail?.evaluation_method
    return evaluationMethod === 'all'
      ? evaluationMethodOptions
      : evaluationMethodOptions.filter((opt) => opt.apiValue === evaluationMethod)
  }, [taskDetail?.evaluation_method, evaluationMethodOptions])

  const {
    logs,
    isLoadingLogs,
    isArchivedLogs,
    isDownloadingLogs,
    handleRefreshLogs,
    handleDownloadLogs,
  } = useReportLogs({
    projectId,
    taskId,
    evaluationType,
    activeTab,
  })

  const {
    isExportingWord,
    downloadMenuItems,
    handleDownloadDatasetResult,
    handleDownloadWordReport,
  } = useReportDownloads({
    projectId,
    taskId,
    evaluationType,
    selectedModelTab,
    apiEvaluationMethodForResults,
    isCompleted,
    taskDetail,
    reportData,
  })

  // 切换单元格展开/收起
  const toggleCellExpand = useCallback((rowKey: string, columnKey: string) => {
    const cellKey = `${rowKey}-${columnKey}`
    setExpandedCells((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(cellKey)) {
        newSet.delete(cellKey)
      }
      else {
        newSet.add(cellKey)
      }
      return newSet
    })
  }, [])

  // 切换行的展开/收起状态（点击行任意位置）
  const toggleRowExpand = useCallback((record: EvaluationResultData) => {
    const rowKey = record.key
    const rowPrefix = rowKey?.toString() || '0'
    const expandColumnKeys = record.rawFields && Object.keys(record.rawFields).length > 0
      ? Object.keys(record.rawFields)
      : ['system', 'prompt', 'response', 'modelResponse']

    setExpandedCells((prev) => {
      const newSet = new Set(prev)

      const firstKey = expandColumnKeys[0] || 'system'
      const isCurrentlyExpanded = newSet.has(`${rowPrefix}-${firstKey}`)

      if (isCurrentlyExpanded) {
        expandColumnKeys.forEach((colKey) => {
          newSet.delete(`${rowPrefix}-${colKey}`)
        })
      }
      else {
        expandColumnKeys.forEach((colKey) => {
          newSet.add(`${rowPrefix}-${colKey}`)
        })
      }

      return newSet
    })
  }, [])

  const currentModelData = useMemo(() => buildCurrentModelData({
    evaluationType,
    manualEvaluationResults,
    evaluationResults,
    currentPage,
    pageSize,
    taskDetail,
    evaluationPrefix,
  }), [evaluationResults, manualEvaluationResults, currentPage, pageSize, evaluationType, taskDetail, evaluationPrefix])

  const itemIndexRowSpanMap = useMemo(() => {
    const itemIndexMap = new Map<number, number>()

    currentModelData.forEach((item) => {
      if (item.item_index !== undefined) {
        const count = itemIndexMap.get(item.item_index) || 0
        itemIndexMap.set(item.item_index, count + 1)
      }
    })

    return itemIndexMap
  }, [currentModelData])

  const itemIndexFirstRowMap = useMemo(() => {
    const firstRowMap = new Map<number, number>()

    currentModelData.forEach((item, index) => {
      if (item.item_index !== undefined && !firstRowMap.has(item.item_index)) {
        firstRowMap.set(item.item_index, index)
      }
    })

    return firstRowMap
  }, [currentModelData])

  // 动态生成指标列
  const evaluationResultColumns = useMemo(() => buildEvaluationResultColumns({
    evaluationPrefix,
    evaluationType,
    businessDynamicFieldKeys,
    availableMetrics: buildAvailableMetrics({
      evaluationType,
      manualEvaluationResults,
      evaluationResults,
    }),
    itemIndexFirstRowMap,
    itemIndexRowSpanMap,
    expandedCells,
    toggleCellExpand,
  }), [
    evaluationPrefix,
    evaluationType,
    businessDynamicFieldKeys,
    itemIndexFirstRowMap,
    itemIndexRowSpanMap,
    expandedCells,
    toggleCellExpand,
    evaluationResults,
    manualEvaluationResults,
  ])
  const tabItems = useMemo(() => {
    const tabs = [
      {
        key: 'report',
        label: '评估报告',
        children: (
          <Space direction="vertical" className="w-full">
            <div className="flex justify-end">
              <Button
                type="primary"
                icon={<FileWordOutlined />}
                onClick={handleDownloadWordReport}
                loading={isExportingWord}
                disabled={isLoadingReport || !reportData}
              >
                导出Word报告
              </Button>
            </div>
            <ReportBasicInfoCard
              loading={isLoadingTaskDetail}
              evaluationType={evaluationType}
              taskDetail={taskDetail}
              formatArrayToString={formatArrayToString}
              formatEvaluationType={formatEvaluationType}
              formatEvaluationMethod={formatEvaluationMethod}
            />

            {/* Prompt */}
            {taskDetail?.evaluation_prompt_config?.prompt_template && (
              <Card className="mb-6">
                <Title level={5} className="mb-4">Prompt</Title>
                <div className="bg-gray-50 p-4 rounded">
                  <Text>
                    {taskDetail.evaluation_prompt_config.prompt_template}
                  </Text>
                  <div className="mt-2 flex justify-end">
                    <Button type="link" size="small">
                      展开
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* 报告结果 - 只有已完成状态才显示 */}
            {isCompleted && (
              <ReportChartsSection
                evaluationType={evaluationType}
                loading={isLoadingReport}
                reportData={reportData}
                evaluationMethodFilter={evaluationMethodFilter}
                setEvaluationMethodFilter={setEvaluationMethodFilter}
                calculationMethod={calculationMethod}
                setCalculationMethod={setCalculationMethod}
                getEvaluationMethodOptions={getEvaluationMethodOptions}
                radarData={radarData}
                barData={barData}
                multiRadarData={multiRadarData}
                modelConfigs={modelConfigs}
                modelNames={modelNames}
                isComparison={isComparison}
                maxValue={maxValue}
                radarChartRef={radarChartRef}
                barChartRef={barChartRef}
                onDownloadDatasetResult={handleDownloadDatasetResult}
              />
            )}

            {/* 非已完成状态提示 */}
            {!isCompleted && (
              <Card>
                <div className="text-center py-8 text-gray-400">
                  {isFailed ? '任务执行失败，暂无法查看报告' : '任务尚未完成，报告将在任务完成后显示'}
                </div>
              </Card>
            )}
          </Space>
        ),
      },
      {
        key: 'details',
        label: '评估详情',
        hidden: evaluationType === 'benchmark',
        children: (
          <EvaluationDetailsTab
            evaluationType={evaluationType}
            isCompleted={isCompleted}
            isFailed={isFailed}
            isLoadingTaskDetail={isLoadingTaskDetail}
            taskDetail={taskDetail}
            isLoadingResults={isLoadingResults}
            isLoadingManualResults={isLoadingManualResults}
            evaluationMethodFilterForResults={evaluationMethodFilterForResults}
            setEvaluationMethodFilterForResults={setEvaluationMethodFilterForResults}
            getEvaluationMethodOptions={getEvaluationMethodOptions}
            downloadMenuItems={downloadMenuItems}
            evaluationResultColumns={evaluationResultColumns}
            currentModelData={currentModelData}
            currentPage={currentPage}
            pageSize={pageSize}
            manualEvaluationResults={manualEvaluationResults}
            evaluationResults={evaluationResults}
            setCurrentPage={setCurrentPage}
            selectedModelTab={selectedModelTab}
            setSelectedModelTab={setSelectedModelTab}
            reportData={reportData}
            getModelTabLabel={getModelTabLabel}
            toggleRowExpand={toggleRowExpand}
          />
        ),
      },
    ]

    // 人工评估不显示任务日志标签页
    if (evaluationType !== 'manual') {
      tabs.push({
        key: 'logs',
        label: '任务日志',
        children: (
          <ReportTaskLogsTab
            logs={logs}
            archived={isArchivedLogs}
            loading={isLoadingLogs}
            downloading={isDownloadingLogs}
            onRefresh={handleRefreshLogs}
            onDownload={handleDownloadLogs}
          />
        ),
      })
    }

    return tabs
  }, [evaluationType, isCompleted, isFailed, isLoadingTaskDetail, taskDetail, isLoadingReport, reportData, calculationMethod, evaluationMethodFilter, radarData, barData, multiRadarData, modelConfigs, modelNames, isComparison, maxValue, isLoadingResults, isLoadingManualResults, evaluationMethodFilterForResults, selectedModelTab, evaluationResults, manualEvaluationResults, currentPage, pageSize, currentModelData, logs, isLoadingLogs, isArchivedLogs, isDownloadingLogs, handleRefreshLogs, handleDownloadLogs, downloadMenuItems, evaluationResultColumns, getEvaluationMethodOptions, handleDownloadDatasetResult, handleDownloadWordReport, isExportingWord, toggleRowExpand])

  return (
    <ReportDetailShell
      activeTab={activeTab}
      items={tabItems.filter((item) => !item.hidden)}
      isCompleted={isCompleted}
      statusText={taskStatus || taskDetail?.status || '已完成'}
      onBack={() => navigate(-1)}
      onTabChange={setActiveTab}
    />
  )
}

export default EvaluationReportDetail
