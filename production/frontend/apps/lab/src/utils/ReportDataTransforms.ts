import type { EvaluationResultData, EvaluationType } from '../types/ReportDetailTypes.ts'
import type {
  EvaluationMetricItem,
  EvaluationTaskResultItem,
  MetricSummaryItem,
  ProjectEvaluationTaskDetail,
  ProjectEvaluationTaskReport,
  ProjectEvaluationTaskResults,
} from '@/services/modelEvaluationServices.ts'
import type { EvaluationListResponse } from '@/services/manualEvaluationService.ts'

const CALCULATION_METHOD_MAP: Record<string, string> = {
  平均: 'average',
  最大: 'max',
  最小: 'min',
}

const emptyChartData = {
  radarData: [],
  barData: [],
  multiRadarData: [],
  modelConfigs: [],
  modelNames: [],
  isComparison: false,
  maxValue: 100,
}

export function collectBusinessEvaluationDynamicFieldKeys(items: EvaluationTaskResultItem[]): string[] {
  const excludedKeys = new Set([
    'metrics',
    'serial_no',
    'images',
    'messages',
    'error',
  ])
  const ordered: string[] = []
  const seen = new Set<string>()

  items.forEach((item) => {
    Object.keys(item as Record<string, unknown>).forEach((key) => {
      if (excludedKeys.has(key) || seen.has(key)) return
      seen.add(key)
      ordered.push(key)
    })
  })

  return ordered
}

export function buildAvailableMetrics({
  evaluationType,
  manualEvaluationResults,
  evaluationResults,
}: {
  evaluationType: EvaluationType
  manualEvaluationResults: EvaluationListResponse | null
  evaluationResults: ProjectEvaluationTaskResults | null
}): string[] {
  const metricNames = new Set<string>()

  if (evaluationType === 'manual' && manualEvaluationResults?.items) {
    manualEvaluationResults.items.forEach((item) => {
      item.content?.forEach((contentItem) => {
        if (Array.isArray(contentItem.annotation?.metrics)) {
          contentItem.annotation.metrics.forEach((metric: any) => {
            if (metric.metric_name) metricNames.add(metric.metric_name)
          })
        }
      })
    })
    return Array.from(metricNames)
  }

  evaluationResults?.items?.forEach((item) => {
    if (Array.isArray(item.metrics)) {
      item.metrics.forEach((metric: EvaluationMetricItem) => {
        if (metric.metric_name) metricNames.add(metric.metric_name)
      })
    }
  })

  return Array.from(metricNames)
}

function applyMetrics(
  metrics: any[] | undefined,
  taskDetail?: ProjectEvaluationTaskDetail | null,
) {
  const scores: Record<string, number | null> = {}
  const metricReasons: Record<string, string> = {}
  const metricScores: Record<string, number> = {}
  const metricScoreMaxs: Record<string, number> = {}

  if (Array.isArray(metrics)) {
    metrics.forEach((metric) => {
      if (!metric.metric_name) return
      const dataIndex = metric.metric_name.toLowerCase().replace(/\s+/g, '_')
      const score = typeof metric.score === 'number' ? metric.score : Number(metric.score || 0)
      const configuredMax = taskDetail?.evaluation_prompt_config?.metrics?.find((m) => m.name === metric.metric_name)?.score_max
      const scoreMax = Number(metric.score_max ?? configuredMax ?? 10)
      scores[dataIndex] = metric.percentage_score !== undefined && metric.percentage_score !== null
        ? Number(metric.percentage_score)
        : scoreMax > 0
          ? (score / scoreMax) * 100
          : null
      metricScores[dataIndex] = score
      metricScoreMaxs[dataIndex] = scoreMax
      if (metric.reason) metricReasons[dataIndex] = metric.reason
    })
  }

  return {
    scores,
    metricReasons,
    metricScores,
    metricScoreMaxs,
    reason: Object.values(metricReasons).find((r) => r && r.trim()) || '',
  }
}

export function buildCurrentModelData({
  evaluationType,
  manualEvaluationResults,
  evaluationResults,
  currentPage,
  pageSize,
  taskDetail,
  evaluationPrefix,
}: {
  evaluationType: EvaluationType
  manualEvaluationResults: EvaluationListResponse | null
  evaluationResults: ProjectEvaluationTaskResults | null
  currentPage: number
  pageSize: number
  taskDetail: ProjectEvaluationTaskDetail | null
  evaluationPrefix?: string
}): EvaluationResultData[] {
  if (evaluationType === 'manual' && manualEvaluationResults?.items) {
    const result: EvaluationResultData[] = []
    let globalIndex = 0

    manualEvaluationResults.items.forEach((item) => {
      item.content?.forEach((contentItem, contentIndex) => {
        const metrics = applyMetrics(contentItem.annotation?.metrics, taskDetail)
        result.push({
          key: `manual-${item.item_index}-${contentIndex}`,
          sequence: item.item_index || ((currentPage - 1) * pageSize + globalIndex + 1),
          prompt: contentItem.prompt || '',
          model_name: contentItem.model_name || '',
          system: contentItem.system || '',
          response: contentItem.response || '',
          modelResponse: contentItem.model_response || '',
          images: contentItem.images || [],
          baseUrl: contentItem.base_url || '',
          item_index: item.item_index,
          ...metrics,
        })
        globalIndex++
      })
    })

    return result
  }

  if (!evaluationResults?.items) return []

  const baseUrl = evaluationResults.base_url || ''
  const dynamicKeys = evaluationPrefix === 'BUSSINESS'
    ? collectBusinessEvaluationDynamicFieldKeys(evaluationResults.items)
    : []

  return evaluationResults.items.map((item, index) => {
    const sequence = item.serial_no || ((currentPage - 1) * pageSize + index + 1)
    const metrics = applyMetrics(item.metrics)
    const rawFields: Record<string, string> | undefined = dynamicKeys.length
      ? Object.fromEntries(dynamicKeys.map((key) => {
          const value = (item as Record<string, unknown>)[key]
          return [key, value === null || value === undefined ? '' : String(value)]
        }))
      : undefined

    return {
      key: String(item.serial_no || sequence),
      sequence,
      prompt: item.prompt || '',
      system: item.system || '',
      model_name: (item.model_name || '') as string,
      response: (item.response || '') as string,
      modelResponse: item.model_response || '',
      images: item.images || [],
      baseUrl,
      rawFields,
      ...metrics,
    }
  })
}

export function buildReportChartData({
  reportData,
  evaluationMethodFilter,
  calculationMethod,
  apiEvaluationMethodForReport,
  evaluationType,
  evaluationMethodOptions,
}: {
  reportData: ProjectEvaluationTaskReport | null
  evaluationMethodFilter: string
  calculationMethod: string
  apiEvaluationMethodForReport: string
  evaluationType: EvaluationType
  evaluationMethodOptions: Array<{ value: string, label: string, apiValue: string }>
}) {
  if (!reportData?.model_reports?.length) return emptyChartData

  const filterMethod = evaluationType === 'manual' || evaluationType === 'auto'
    ? apiEvaluationMethodForReport
    : evaluationMethodFilter === 'all'
      ? ''
      : evaluationMethodOptions.find((opt) => opt.value === evaluationMethodFilter)?.apiValue || ''

  const filteredReports = evaluationType === 'benchmark'
    ? reportData.model_reports
    : reportData.model_reports.filter((report) => !report.evaluation_method || report.evaluation_method === filterMethod)

  if (!filteredReports.length) return emptyChartData

  const apiMethod = CALCULATION_METHOD_MAP[calculationMethod] || 'average'
  let maxValue = 0

  filteredReports.forEach((report) => {
    const aggregativeMetric = report.aggregative_metrics?.find((metric) => metric.calculation_method === apiMethod)
    if (!aggregativeMetric?.metric_summary) return
    const values = Object.values(aggregativeMetric.metric_summary)
      .map((item: MetricSummaryItem) => typeof item.percentage_score === 'number' && !Number.isNaN(item.percentage_score) ? item.percentage_score : null)
      .filter((value): value is number => value !== null)
    if (values.length) maxValue = Math.max(maxValue, Math.max(...values))
  })

  const domainMax = maxValue > 0 ? Math.max(10, Math.ceil(maxValue / 10) * 10) : 100
  const isComparison = reportData.evaluation_type === 'comparison' && filteredReports.length > 1

  if (isComparison) {
    const allMetricNames = new Set<string>()
    filteredReports.forEach((report) => {
      const metricSummary = report.aggregative_metrics.find((metric) => metric.calculation_method === apiMethod)?.metric_summary
      if (metricSummary) Object.keys(metricSummary).forEach((key) => allMetricNames.add(key))
    })

    const multiRadarData = Array.from(allMetricNames).map((metricName) => {
      const dataPoint: { subject: string, [key: string]: string | number } = { subject: metricName }
      filteredReports.forEach((report, index) => {
        const metricData = report.aggregative_metrics.find((metric) => metric.calculation_method === apiMethod)?.metric_summary?.[metricName]
        dataPoint[`model${index + 1}`] = metricData?.percentage_score ?? 0
      })
      return dataPoint
    })

    const colors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2']
    const tagColors = ['blue', 'green', 'orange', 'red', 'purple', 'cyan']
    const modelConfigs = filteredReports.map((report, index) => ({
      key: `model${index + 1}`,
      name: report.model_name,
      color: colors[index % colors.length],
      tagColor: tagColors[index % tagColors.length],
    }))

    return {
      radarData: [],
      barData: multiRadarData,
      multiRadarData,
      modelConfigs,
      modelNames: filteredReports.map((report) => report.model_name),
      isComparison: true,
      maxValue: domainMax,
    }
  }

  const currentReport = filteredReports[0]
  const metricSummary = currentReport.aggregative_metrics?.find((metric) => metric.calculation_method === apiMethod)?.metric_summary
  if (!metricSummary) {
    return {
      ...emptyChartData,
      modelNames: [currentReport.model_name],
      maxValue: domainMax,
    }
  }

  const chartData = Object.entries(metricSummary).map(([key, item]) => ({
    name: key,
    value: item.percentage_score ?? 0,
  }))

  return {
    radarData: chartData,
    barData: chartData,
    multiRadarData: [],
    modelConfigs: [],
    modelNames: [currentReport.model_name],
    isComparison: false,
    maxValue: domainMax,
  }
}
