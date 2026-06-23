import React, { useCallback, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Col,
  Input,
  InputNumber,
  Row,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  QuestionCircleOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { EvaluationItem, EvaluationListResponse, UpdateEvaluationItemParams } from '@/services/manualEvaluationService'
import { manualEvaluationServices } from '@/services/manualEvaluationService'
import { modelEvaluationServices } from '@/services/modelEvaluationServices'
import { parseUserAssistantTags, replaceImagePlaceholders } from '@/utils/imageUtils'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'

const { Text } = Typography

// 独立的评分组件，避免状态共享问题
interface ScoreInputProps {
  record: EvaluationItem
  metricsConfig: Array<{
    name: string
    score_min?: number
    score_max?: number
    score_definitions?: string[] | string
  }> // 指标配置
  onScoreChange: (key: string, metricName: string, value: number) => void
  onReasonChange: (key: string, metricName: string, value: string) => void
}

const ScoreInput: React.FC<ScoreInputProps> = React.memo(({ record, metricsConfig, onScoreChange, onReasonChange }) => {
  return (
    <div className="space-y-4">
      {metricsConfig.map((metric) => {
        const min = metric.score_min ?? 0
        const metricData = record.metrics[metric.name] || { score: min, reason: '' }
        const max = metric.score_max ?? 10
        const step = 0.01
        const rawDefs = metric.score_definitions
        const definitionLines = Array.isArray(rawDefs)
          ? rawDefs.filter((line) => Boolean(line?.trim?.()))
          : typeof rawDefs === 'string' && rawDefs.trim()
            ? [rawDefs.trim()]
            : []

        const clampScore = (num: number) =>
          Math.round(Math.min(max, Math.max(min, num)) * 100) / 100

        return (
          <div key={metric.name}>
            <div className="flex items-center gap-1 mb-2 flex-wrap">
              <Text strong className="inline">{metric.name}</Text>
              <Tooltip
                title={
                  definitionLines.length > 0
                    ? (
                        <div className="space-y-1 max-w-xs">
                          {definitionLines.map((line) => (
                            <div key={line}>{line}</div>
                          ))}
                        </div>
                      )
                    : '暂无评分区间说明'
                }
              >
                <QuestionCircleOutlined className="text-gray-400 cursor-help shrink-0" />
              </Tooltip>
            </div>
            <InputNumber
              min={min}
              max={max}
              step={step}
              precision={2}
              value={metricData.score}
              onChange={(num) => {
                const next = typeof num === 'number' && !Number.isNaN(num) ? clampScore(num) : min
                onScoreChange(record.key, metric.name, next)
              }}
              addonAfter="分"
              className="w-full"
            />
            <Input.TextArea
              placeholder="请输入打分原因"
              value={metricData.reason}
              onChange={(e) => onReasonChange(record.key, metric.name, e.target.value)}
              rows={2}
              className="mt-2"
              maxLength={64}
            />
          </div>
        )
      })}
    </div>
  )
})

ScoreInput.displayName = 'ScoreInput'

const ManualEvaluationDetail: React.FC = () => {
  const { taskId, projectId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10) // 初始值，后续会根据 evalution_num 更新
  const [evaluationData, setEvaluationData] = useState<EvaluationItem[]>([])
  const [fixedPageSizeSet, setFixedPageSizeSet] = useState(false) // 标记是否已设置固定分页大小
  const [statusFilter, setStatusFilter] = useState<string>('all') // 状态筛选：'all' | '未评估' | '已完成'
  const [isSubmittingTask, setIsSubmittingTask] = useState(false) // 提交任务loading状态

  // 获取任务详情（用于获取 referee_model_name 和指标配置）
  const { data: taskDetail } = useQuery({
    queryKey: ['manual-evaluation-task-detail', projectId, taskId],
    queryFn: async () => {
      if (!projectId || !taskId) return null
      return await modelEvaluationServices.getProjectEvaluationTaskDetail(
        Number(projectId),
        Number(taskId),
      )
    },
    enabled: !!projectId && !!taskId,
  })

  // 获取人工评估标注统计信息（全局统计，不随页面变化）
  const { data: annotationStats, refetch: refetchAnnotationStats } = useQuery({
    queryKey: ['manual-evaluation-annotation-stats', projectId, taskId],
    queryFn: async () => {
      if (!projectId || !taskId) return null
      const result = await manualEvaluationServices.getAnnotationInformation(
        Number(projectId),
        Number(taskId),
      )
      return result
    },
    enabled: !!projectId && !!taskId,
  })

  // 获取评估列表数据
  const { data: evaluationListResponse, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['manual-evaluation-items', projectId, taskId, currentPage, pageSize, statusFilter],
    queryFn: async () => {
      if (!projectId || !taskId) return { items: [], total: 0, page: 1, size: 1, pages: 0 }
      const result = await manualEvaluationServices.getQueryEvaluationList(
        Number(projectId),
        Number(taskId),
        { page: currentPage, size: 1, status: statusFilter },
      )
      return result as EvaluationListResponse
    },
    enabled: !!projectId && !!taskId,
    staleTime: 0, // 禁用缓存，确保每次都能获取最新数据
  })

  // 当状态筛选变化时，重置到第一页（确保在数据请求前重置）
  React.useEffect(() => {
    setCurrentPage(1)
  }, [statusFilter])

  // 当接口返回空数据且当前页超出范围时，重置到最后一页或第一页
  React.useEffect(() => {
    if (evaluationListResponse) {
      const totalPages = evaluationListResponse.pages || 0
      if (currentPage > totalPages && totalPages > 0) {
        // 如果当前页超出总页数，重置到最后一页
        setCurrentPage(totalPages)
      }
      else if (currentPage > totalPages && totalPages === 0) {
        // 如果没有数据，重置到第一页
        setCurrentPage(1)
      }
    }
  }, [evaluationListResponse, currentPage])

  // 当任务或项目变化时，重置页码和固定分页大小标志
  React.useEffect(() => {
    setCurrentPage(1)
    setFixedPageSizeSet(false)
    setPageSize(10) // 重置为默认值
    setStatusFilter('all') // 重置状态筛选
  }, [taskId, projectId])

  // 根据接口返回的 evalution_num 硬性设置分页大小（只设置一次）
  React.useEffect(() => {
    if (evaluationListResponse && !fixedPageSizeSet) {
      const evaluationNum = evaluationListResponse.evalution_num
      if (evaluationNum && evaluationNum > 0) {
        setPageSize(evaluationNum)
        setCurrentPage(1) // 重置到第一页
        setFixedPageSizeSet(true) // 标记已设置，后续不再修改
      }
    }
  }, [evaluationListResponse, fixedPageSizeSet])

  // 获取指标配置
  const metricsConfig = useMemo(() => {
    return taskDetail?.evaluation_prompt_config?.metrics || []
  }, [taskDetail])

  // 将接口数据转换为组件需要的格式
  const transformedData = useMemo(() => {
    if (!evaluationListResponse?.items) return []

    const result: EvaluationItem[] = []

    evaluationListResponse.items.forEach((item) => {
      // 遍历 content 数组，为每个 content 项创建一个 EvaluationItem
      item.content?.forEach((contentItem, contentIndex) => {
      // 动态指标数据：使用指标名称作为 key
        const metrics: Record<string, { score: number, reason: string }> = {}
        const commentParts: string[] = []

        // 初始化所有指标为默认值（使用指标的最低分）
        metricsConfig.forEach((metricConfig) => {
          const minScore = metricConfig.score_min ?? 0
          metrics[metricConfig.name] = { score: minScore, reason: '' }
        })

        if (contentItem.annotation?.metrics && contentItem.annotation.metrics.length > 0) {
        // 处理新数据结构：annotation.metrics 直接是指标数组，每个元素有 metric_name、score 和 reason
          contentItem.annotation.metrics.forEach((metric: any) => {
            if (metric.metric_name) {
            // 找到对应的指标配置以获取最低分
              const metricConfig = metricsConfig.find((m) => m.name === metric.metric_name)
              const minScore = metricConfig?.score_min ?? 0

              // 如果接口返回的 score 有效，使用它；否则使用指标的最低分作为默认值
              const score = typeof metric.score === 'number' && metric.score >= minScore
                ? metric.score
                : minScore
              const reason = metric.reason || ''

              // 使用指标名称作为 key
              if (Object.prototype.hasOwnProperty.call(metrics, metric.metric_name)) {
                metrics[metric.metric_name] = { score, reason }
              }

              // 收集所有原因的评论
              if (reason) {
                commentParts.push(reason)
              }
            }
          })
        }

        // 使用接口返回的状态，如果没有则默认为"未评估"
        let status: '未评估' | '已完成' = '未评估'
        if (contentItem.annotation?.status) {
          if (contentItem.annotation.status === '已完成' || contentItem.annotation.status === '标注完成') {
            status = '已完成'
          }
        }

        // 使用 item_index、contentIndex 和页面信息组合生成唯一的 key，避免重复
        const uniqueKey = `${projectId}-${taskId}-${currentPage}-${pageSize}-${item.item_index}-${contentIndex}`

        // 提取图片和基地址
        const images = contentItem.images || []
        const baseUrl = contentItem.base_url || ''

        result.push({
          key: uniqueKey,
          item_index: item.item_index,
          model_name: contentItem.model_name || '',
          system: contentItem.system || '',
          prompt: contentItem.prompt || '',
          standardAnswer: contentItem.response || '',
          modelResponse: contentItem.model_response || '',
          metrics,
          comment: commentParts.join('; '),
          status,
          images,
          baseUrl,
          originalData: { ...item, content: [contentItem] }, // 保存原始数据用于后续提交，只包含当前 contentItem
        } as EvaluationItem)
      })
    })
    return result
  }, [evaluationListResponse, projectId, taskId, currentPage, pageSize, metricsConfig])

  // 更新本地状态 - 无论数据是否为空都要更新，确保接口返回空数据时页面也显示空数据
  React.useEffect(() => {
    setEvaluationData(transformedData)
  }, [transformedData])

  const handleScoreChange = useCallback((key: string, metricName: string, value: number) => {
    setEvaluationData((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item

        const updatedMetrics = {
          ...item.metrics,
          [metricName]: {
            ...item.metrics[metricName],
            score: value,
          },
        }

        const updatedItem = {
          ...item,
          metrics: updatedMetrics,
        }

        // "完成评估"并成功提交后  状态变为"已完成"
        return { ...updatedItem, status: item.status }
      }),
    )
  }, [metricsConfig])

  const handleReasonChange = useCallback((key: string, metricName: string, value: string) => {
    setEvaluationData((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item

        const updatedMetrics = {
          ...item.metrics,
          [metricName]: {
            ...item.metrics[metricName],
            reason: value,
          },
        }

        const updatedItem = {
          ...item,
          metrics: updatedMetrics,
        }

        // "完成评估"并成功提交后  状态变为"已完成"
        return { ...updatedItem, status: item.status }
      }),
    )
  }, [metricsConfig])

  const columns = useMemo(() => {
    // 获取第一条数据用于合并单元格
    const firstRecord = evaluationData.length > 0 ? evaluationData[0] : null
    const firstStandardAnswer = firstRecord?.standardAnswer || ''
    const firstSystem = firstRecord?.system || ''
    const firstPrompt = firstRecord?.prompt || ''
    const firstImages = firstRecord?.images || []
    const firstBaseUrl = firstRecord?.baseUrl || ''

    let firstStatus: '未评估' | '已完成' = '未评估'
    if (evaluationData.length > 0) {
      firstStatus = evaluationData[0].status
    }

    // 状态颜色映射
    const getStatusColor = (status: string) => {
      if (status === '已完成') return 'success'
      if (status === '未评估') return 'warning'
      return 'default'
    }

    // 处理 System 列的图片
    const processedSystem = (() => {
      const { processedContent } = replaceImagePlaceholders(
        firstSystem || '-',
        firstImages,
        firstBaseUrl,
        0,
      )
      return parseUserAssistantTags(processedContent)
    })()

    // 处理 Prompt 列的图片
    const processedPrompt = (() => {
      const { processedContent } = replaceImagePlaceholders(
        firstPrompt || '',
        firstImages,
        firstBaseUrl,
        0,
      )
      return parseUserAssistantTags(processedContent)
    })()

    // 处理 Response 列的图片（从 prompt 使用后的索引开始）
    const processedResponse = (() => {
      const promptImageCount = (firstPrompt.match(/<image>/g) || []).length
      const { processedContent } = replaceImagePlaceholders(
        firstStandardAnswer || '',
        firstImages,
        firstBaseUrl,
        promptImageCount,
      )
      return parseUserAssistantTags(processedContent)
    })()

    return [
      {
        title: '待评估模型/服务',
        dataIndex: 'model_name',
        key: 'model_name',
        width: 100,
        render: (text: string) => (
          <div className="text-[12px] leading-[1.4] whitespace-pre-wrap">
            {text}
          </div>
        ),
      },
      {
        title: 'System',
        dataIndex: 'system',
        key: 'system',
        width: 200,
        render: (text: string, record: EvaluationItem, index: number) => {
        // 只在第一行显示合并单元格的内容
          if (index === 0) {
            return {
              children: (
                <div
                  className="max-h-[120px] overflow-auto text-[12px] leading-[1.4]"
                  dangerouslySetInnerHTML={{ __html: processedSystem }}
                />
              ),
              props: {
                rowSpan: evaluationData.length, // 跨所有行
              },
            }
          }
          // 其他行不显示
          return {
            children: null,
            props: {
              rowSpan: 0,
            },
          }
        },
      },
      {
        title: 'Prompt',
        dataIndex: 'prompt',
        key: 'prompt',
        width: 200,
        render: (text: string, record: EvaluationItem, index: number) => {
        // 只在第一行显示合并单元格的内容
          if (index === 0) {
            return {
              children: (
                <div
                  className="max-h-[120px] overflow-auto text-[12px] leading-[1.4]"
                  dangerouslySetInnerHTML={{ __html: processedPrompt }}
                />
              ),
              props: {
                rowSpan: evaluationData.length, // 跨所有行
              },
            }
          }
          // 其他行不显示
          return {
            children: null,
            props: {
              rowSpan: 0,
            },
          }
        },
      },
      {
        title: 'Response (标准回答)',
        dataIndex: 'standardAnswer',
        key: 'standardAnswer',
        width: 200,
        render: (text: string, record: EvaluationItem, index: number) => {
        // 只在第一行显示合并单元格的内容
          if (index === 0) {
            return {
              children: (
                <div
                  className="max-h-[120px] overflow-auto text-[12px] leading-[1.4]"
                  dangerouslySetInnerHTML={{ __html: processedResponse }}
                />
              ),
              props: {
                rowSpan: evaluationData.length, // 跨所有行
              },
            }
          }
          // 其他行不显示
          return {
            children: null,
            props: {
              rowSpan: 0,
            },
          }
        },
      },
      {
        title: 'Model Response (模型回答)',
        dataIndex: 'modelResponse',
        key: 'modelResponse',
        width: 200,
        render: (text: string, record: EvaluationItem) => {
          const images = record.images || []
          const baseUrl = record.baseUrl || ''
          // 计算 prompt 和 response 字段使用的图片数量，modelResponse 从该索引开始
          const promptText = firstPrompt || ''
          const responseText = firstStandardAnswer || ''
          const promptImageCount = (promptText.match(/<image>/g) || []).length
          const responseImageCount = (responseText.match(/<image>/g) || []).length
          const startIndex = promptImageCount + responseImageCount
          // 处理图片占位符，从 prompt 和 response 使用后的索引开始
          const { processedContent } = replaceImagePlaceholders(
            text || '',
            images,
            baseUrl,
            startIndex,
          )
          const finalContent = parseUserAssistantTags(processedContent)

          return (
            <div
              className="max-h-[120px] overflow-auto text-[12px] leading-[1.4]"
              dangerouslySetInnerHTML={{ __html: finalContent }}
            />
          )
        },
      },
      {
        title: '得分',
        key: 'scores',
        width: 300,
        render: (_: any, record: EvaluationItem) => {
          return (
            <ScoreInput
              record={record}
              metricsConfig={metricsConfig}
              onScoreChange={handleScoreChange}
              onReasonChange={handleReasonChange}
            />
          )
        },
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 100,
        render: (status: string, record: EvaluationItem, index: number) => {
        // 只在第一行显示合并单元格的内容
          if (index === 0) {
            return {
              children: (
                <Tag color={getStatusColor(firstStatus)}>
                  {firstStatus}
                </Tag>
              ),
              props: {
                rowSpan: evaluationData.length, // 跨所有行
              },
            }
          }
          // 其他行不显示
          return {
            children: null,
            props: {
              rowSpan: 0,
            },
          }
        },
      },
      {
        title: '操作',
        key: 'action',
        width: 100,
        render: (_: any, record: EvaluationItem, index: number) => {
        // 只在第一行显示合并单元格的内容
          if (index === 0) {
            return {
              children: (
                <Typography.Link onClick={handleSubmitEvaluation}>完成评估</Typography.Link>
              ),
              props: {
                rowSpan: evaluationData.length, // 跨所有行
              },
            }
          }
          // 其他行不显示
          return {
            children: null,
            props: {
              rowSpan: 0,
            },
          }
        },
      },
    ]
  }, [handleScoreChange, handleReasonChange, evaluationData, metricsConfig])

  // 使用接口返回的统计数据（用于统计卡片显示）
  const totalCount = annotationStats?.total_tasks || 0
  const completedCount = annotationStats?.completed_count || 0
  const pendingCount = annotationStats?.unannotated_count || 0

  // 判断是否所有评估任务都已完成
  const isAllTasksCompleted = useMemo(() => {
    return totalCount > 0 && completedCount === totalCount
  }, [totalCount, completedCount])

  // 使用接口返回的实际总数（用于分页组件）
  // 总页数由后端根据 total 返回的 pages 字段，所以需要通过 pages * pageSize 来计算 total
  const paginationTotal = evaluationListResponse?.pages
    ? evaluationListResponse.pages * pageSize
    : (evaluationListResponse?.total || 0)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleBack = () => {
    navigate(-1)
  }

  // 提交评估结果的处理函数
  const handleSubmitEvaluation = useCallback(async () => {
    if (!projectId || !taskId) {
      return
    }

    // 获取 evalution_num 判断是单个评估还是对比评估
    const evaluationNum = evaluationListResponse?.evalution_num ?? 1
    const isComparison = evaluationNum > 1 // 大于1是对比评估

    // 从 dataset_model_relations 中获取 evaluated_model_name
    const datasetModelRelations = taskDetail?.dataset_model_relations || []

    // 验证：检查所有评估项的所有指标是否都有评分和打分原因
    const validationErrors: string[] = []
    evaluationData.forEach((item, index) => {
      const missingMetrics: string[] = []
      metricsConfig.forEach((metricConfig) => {
        const metricData = item.metrics[metricConfig.name]
        if (!metricData || typeof metricData.score !== 'number' || !metricData.reason || metricData.reason.trim() === '') {
          missingMetrics.push(metricConfig.name)
        }
      })

      if (missingMetrics.length > 0) {
        validationErrors.push(`第 ${index + 1} 条数据的指标 "${missingMetrics.join('、')}" 缺少评分或打分原因`)
      }
    })

    if (validationErrors.length > 0) {
      message.warning(validationErrors.join('\n'))
      return
    }

    // 准备提交数据：将当前页面的评估数据转换为接口需要的格式
    const itemDataMap = new Map<number, {
      item_index: number
      model_metrics: Array<{
        metrics: Array<{
          metric_name: string
          score: number
          reason: string
        }>
      }>
    }>()

    evaluationData.forEach((item, itemIndex) => {
      const originalMetrics = item.originalData?.content?.[0]?.annotation?.metrics || []

      // 获取或创建该 item_index 的数据对象
      let itemData = itemDataMap.get(item.item_index)
      if (!itemData) {
        itemData = {
          item_index: item.item_index,
          model_metrics: [],
        }
        itemDataMap.set(item.item_index, itemData)
      }

      if (isComparison && datasetModelRelations.length > 0) {
        // 对比评估：每个 item 对应一个模型
        // 通过 originalMetrics 中的 model_name 来匹配当前 item 对应的模型
        let matchedModelIndex = -1
        let evaluatedModelName = ''

        // 尝试从 originalMetrics 中找到匹配的模型
        if (originalMetrics.length > 0) {
          // 如果 originalMetrics 中有数据，使用第一个模型的 model_name
          const firstModelMetric = originalMetrics[0]
          if (firstModelMetric?.model_name) {
            evaluatedModelName = firstModelMetric.model_name
            // 在 datasetModelRelations 中查找匹配的模型
            matchedModelIndex = datasetModelRelations.findIndex(
              (relation: any) => relation.evaluated_model_name === evaluatedModelName,
            )
          }
        }

        // 如果没找到匹配的模型，使用 itemIndex 取模作为后备方案
        if (matchedModelIndex < 0) {
          matchedModelIndex = itemIndex % datasetModelRelations.length
          evaluatedModelName = datasetModelRelations[matchedModelIndex]?.evaluated_model_name || ''
        }

        // 构建当前模型的 metrics 数组
        const metrics: Array<{
          metric_name: string
          score: number
          reason: string
        }> = []

        // 使用当前编辑的数据构建 metrics
        metricsConfig.forEach((metricConfig) => {
          const metricData = item.metrics[metricConfig.name]
          const minScore = metricConfig.score_min ?? 0
          // 确保 score 有效，如果无效则使用最低分
          const score = metricData && typeof metricData.score === 'number' && metricData.score >= minScore
            ? metricData.score
            : minScore
          if (metricData && metricData.reason && metricData.reason.trim() !== '') {
            metrics.push({
              metric_name: metricConfig.name,
              score,
              reason: metricData.reason,
            })
          }
        })

        // 只有当 metrics 不为空时才添加到 model_metrics 数组
        if (metrics.length > 0) {
          itemData.model_metrics.push({ metrics })
        }
      }
      else {
        // 单个评估：只有一个模型，构建一个 model_metrics 元素
        const metrics: Array<{
          metric_name: string
          score: number
          reason: string
        }> = []

        // 使用动态指标：遍历所有指标配置（此时已经验证过，所有指标都有评分和原因）
        metricsConfig.forEach((metricConfig) => {
          const metricData = item.metrics[metricConfig.name]
          const minScore = metricConfig.score_min ?? 0
          // 确保 score 有效，如果无效则使用最低分
          const score = metricData && typeof metricData.score === 'number' && metricData.score >= minScore
            ? metricData.score
            : minScore
          if (metricData && metricData.reason && metricData.reason.trim() !== '') {
            metrics.push({
              metric_name: metricConfig.name,
              score,
              reason: metricData.reason,
            })
          }
        })

        // 单个评估时，每个 item_index 应该只有一个 model_metrics 元素
        // 如果已经存在，则更新；否则添加
        if (metrics.length > 0) {
          if (itemData.model_metrics.length === 0) {
            itemData.model_metrics.push({ metrics })
          }
          else {
            // 更新第一个（也是唯一的）model_metrics 元素
            itemData.model_metrics[0].metrics = metrics
          }
        }
      }
    })

    // 将 Map 转换为数组，并过滤掉没有评估数据的项
    const submitData = Array.from(itemDataMap.values()).filter((item) => item.model_metrics.length > 0)

    if (submitData.length === 0) {
      message.warning('当前页面没有可提交的评估数据')
      return
    }

    try {
      const params: UpdateEvaluationItemParams = { items: submitData }
      await manualEvaluationServices.updateEvaluationItem(
        Number(projectId),
        Number(taskId),
        params,
      )

      // 更新状态为"已完成"
      setEvaluationData((prev) =>
        prev.map((item) => ({
          ...item,
          status: '已完成' as const,
        })),
      )

      // 提交成功后刷新数据和统计数据
      refetch()
      refetchAnnotationStats()
      message.success('提交成功')

      // 检查是否有下一页，如果有则跳转
      const totalPages = evaluationListResponse?.pages || 0
      if (currentPage < totalPages) {
        setCurrentPage(currentPage + 1)
      }
    }
    catch (error: any) {
      console.error('提交失败:', error)
      message.error(error?.response?.data?.message || '提交失败，请重试')
    }
  }, [
    projectId,
    taskId,
    evaluationListResponse,
    taskDetail,
    evaluationData,
    metricsConfig,
    refetch,
    refetchAnnotationStats,
    currentPage,
  ])

  // 提交评估任务
  const handleSubmitTask = useCallback(async () => {
    if (!projectId || !taskId) {
      message.warning('缺少项目ID或任务ID')
      return
    }

    // 检查所有任务是否完成
    if (!isAllTasksCompleted) {
      message.warning('请完成所有评估任务后再提交')
      return
    }

    setIsSubmittingTask(true)
    try {
      await manualEvaluationServices.submitManualEvaluationTask(
        Number(projectId),
        Number(taskId),
      )
      message.success('提交成功')
      // 刷新统计数据
      refetchAnnotationStats()
      queryClient.invalidateQueries({ queryKey: ['manualEvaluationTasks', projectId] })
      navigate(-1)
    }
    catch (error: any) {
      console.error('提交失败:', error)
      message.error(error?.response?.data?.message || '提交失败，请重试')
    }
    finally {
      setIsSubmittingTask(false)
    }
  }, [projectId, taskId, isAllTasksCompleted, refetchAnnotationStats, navigate, queryClient])

  const taskSearch = () => {
    return (
      <div>
        <span className="mr-2">评估任务列表</span>
      </div>
    )
  }

  return (
    <div className="manual-evaluation-detail create-form-page px-[10px] pb-[10px]">
      <section className="create-form-card">
        <CreateFormPageHeader
          title={taskDetail?.name ? `人工评估详情：${taskDetail.name}` : '人工评估详情'}
          onBack={handleBack}
          actions={(
            <>
              <Button className="create-form-cancel" onClick={handleBack}>返回</Button>
              <Button
                className="create-form-submit"
                type="primary"
                onClick={handleSubmitTask}
                disabled={!isAllTasksCompleted}
                loading={isSubmittingTask}
              >
                提交
              </Button>
            </>
          )}
        />
        <div className="create-form-divider" />
        <div className="create-form-body">
          <Row gutter={16} className="mb-6">
            <Col span={8}>
              <Card
                className="text-center cursor-pointer hover:shadow-md transition-shadow"
                style={{
                  border: statusFilter === 'all' ? '2px solid #1890ff' : undefined,
                  backgroundColor: statusFilter === 'all' ? '#f0f8ff' : undefined,
                }}
                onClick={() => {
                  setCurrentPage(1) // 立即重置页码
                  setStatusFilter('all')
                }}
              >
                <div className="flex items-center justify-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mr-4">
                    <span className="text-2xl text-blue-600">📋</span>
                  </div>
                  <div className="text-left">
                    <div className="text-2xl font-bold text-gray-800">{totalCount}</div>
                    <div className="text-gray-500">总任务数</div>
                  </div>
                </div>
              </Card>
            </Col>
            <Col span={8}>
              <Card
                className="text-center cursor-pointer hover:shadow-md transition-shadow"
                style={{
                  border: statusFilter === '已完成' ? '2px solid #1890ff' : undefined,
                  backgroundColor: statusFilter === '已完成' ? '#f0f8ff' : undefined,
                }}
                onClick={() => {
                  setCurrentPage(1) // 立即重置页码
                  setStatusFilter('已完成')
                }}
              >
                <div className="flex items-center justify-center">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mr-4">
                    <span className="text-2xl text-green-600">✅</span>
                  </div>
                  <div className="text-left">
                    <div className="text-2xl font-bold text-gray-800">{completedCount}</div>
                    <div className="text-gray-500">已完成</div>
                  </div>
                </div>
              </Card>
            </Col>
            <Col span={8}>
              <Card
                className="text-center cursor-pointer hover:shadow-md transition-shadow"
                style={{
                  border: statusFilter === '未评估' ? '2px solid #1890ff' : undefined,
                  backgroundColor: statusFilter === '未评估' ? '#f0f8ff' : undefined,
                }}
                onClick={() => {
                  setCurrentPage(1) // 立即重置页码
                  setStatusFilter('未评估')
                }}
              >
                <div className="flex items-center justify-center">
                  <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mr-4">
                    <span className="text-2xl text-orange-600">⏳</span>
                  </div>
                  <div className="text-left">
                    <div className="text-2xl font-bold text-gray-800">{pendingCount}</div>
                    <div className="text-gray-500">未评估</div>
                  </div>
                </div>
              </Card>
            </Col>
          </Row>

          <Card title={taskSearch()}>
            <Table
              columns={columns}
              dataSource={evaluationData}
              loading={isLoading || isFetching}
              rowKey="key"
              pagination={{
                current: currentPage,
                pageSize,
                total: paginationTotal, // 使用接口返回的实际总数，而不是全局统计数据
                showSizeChanger: false, // 禁用分页大小选择器，硬性使用 evalution_num 的值，用户不能修改
                showQuickJumper: true,
                // showTotal: (total) => `共 ${total} 条数据`,
                onChange: handlePageChange,
              }}
              scroll={{ x: 1600 }}
              bordered
              size="middle"
            />
          </Card>
        </div>
      </section>
    </div>
  )
}

export default ManualEvaluationDetail
