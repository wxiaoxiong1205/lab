import { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { type SaveAnnotationRequest, type SaveMultiLabelAnnotationRequest, labelTaskService } from '../../services/dataAnnotationService'
import { expandImageData } from '../../utils/imageUtils'
import { useAiAnnotation } from './useAiAnnotation'
import type { AnnotationDataItem } from './annotationDetail.shared'
import type { AnnotationConfig } from './components/AnnotationConfigModal'
import type { AnnotationFilter } from './components/AnnotationDetailSections.types'
import { formatGrpoPrompt, formatGrpoValue } from './grpoDisplay'
import {
  getDisplayGroundTruth,
  getDisplayPrompt,
  getDisplaySystem,
  getNormalizedRawData,
  getRawDataImages,
  getRawDataMessages,
  getRewardModelStyle,
} from './multiLabelDataCompat'

type TaskQueryParams = {
  page: number
  size: number
  is_annotated?: boolean
  audit_status?: 'unaudited' | 'passed' | 'failed'
}

type TaskLayoutMeta = {
  isImageType: boolean
  isTextWithMessages: boolean
  useMessagesLayout: boolean
  isDpoType: boolean
  isGrpoType: boolean
  dpoFormat: 'alpaca' | 'role-based' | ''
}

const buildTaskQueryParams = (
  page: number,
  filter: AnnotationFilter,
  isAuditMode: boolean,
): TaskQueryParams => {
  const params: TaskQueryParams = { page, size: 1 }

  if (isAuditMode) {
    if (filter === 'unaudited' || filter === 'passed' || filter === 'failed') {
      params.audit_status = filter
    }
  }
  else if (filter === 'annotated') {
    params.is_annotated = true
  }
  else if (filter === 'unannotated') {
    params.is_annotated = false
  }

  return params
}

const getStringValue = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

const getDpoText = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    return getStringValue(record.content)
  }
  return ''
}

const getDpoRole = (value: unknown): string => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return getStringValue((value as Record<string, unknown>).role) || 'assistant'
  }
  return 'assistant'
}

const getTaskLayoutMeta = (
  item: any,
  contentTab: 'text' | 'image',
  trainingMethodType?: string,
  datasetFormat?: string,
): TaskLayoutMeta => {
  const normalizedRawData = getNormalizedRawData(item.raw_data)
  const rawMessages = getRawDataMessages(normalizedRawData)
  const rawImages = getRawDataImages(normalizedRawData)
  const hasRawImages = rawImages.length > 0
  const normalizedTrainingMethodType = String(trainingMethodType || '').toLowerCase()
  const normalizedDatasetFormat = String(datasetFormat || '').toLowerCase()
  const isDpoType = normalizedTrainingMethodType === 'dpo'
  const isGrpoType = normalizedTrainingMethodType === 'grpo' || normalizedDatasetFormat === 'grpo'
  const isImageType = contentTab === 'image' || hasRawImages
  const isTextWithMessages = !isImageType
    && rawMessages.length > 0

  return {
    isImageType,
    isTextWithMessages,
    useMessagesLayout: !isDpoType && !isGrpoType && (isImageType || isTextWithMessages),
    isDpoType,
    isGrpoType,
    dpoFormat: isDpoType && normalizedDatasetFormat === 'role-based' ? 'role-based' : (isDpoType ? 'alpaca' : ''),
  }
}

const buildMessageTableData = (
  item: any,
  page: number,
  messagesToUse: any[],
  images: string[],
  baseUrl: string,
  trainingMethodType?: string,
  datasetFormat?: string,
): AnnotationDataItem<string>[] => {
  const processedData = expandImageData([{
    ...item,
    messages: messagesToUse,
    images,
    base_url: baseUrl,
  }])

  if (processedData.length === 0) {
    return []
  }

  const processed = processedData[0]

  return [{
    id: Number(item.item_id) || page,
    row_number: item.row_number || page,
    training_method_type: trainingMethodType,
    dataset_format: datasetFormat,
    is_annotated: item.is_annotated,
    status: item.status,
    audit_result: item.audit_result,
    audit_reason: item.audit_reason,
    annotation: item.annotation || null,
    _systemMessage: processed._systemMessage || '',
    _userMessages: processed._userMessages || [],
    _assistantMessages: processed._assistantMessages || [],
    base_url: baseUrl,
    _rawMessages: messagesToUse,
    _rawImages: images,
  }]
}

const buildTextTableData = (item: any, page: number): AnnotationDataItem<string>[] => [{
  id: Number(item.item_id) || page,
  row_number: item.row_number || page,
  training_method_type: item.training_method_type,
  dataset_format: item.dataset_format,
  system: getDisplaySystem(item.raw_data),
  prompt: getDisplayPrompt(item.raw_data),
  ground_truth: getDisplayGroundTruth(item.raw_data, item.annotation),
  is_annotated: item.is_annotated,
  status: item.status,
  audit_result: item.audit_result,
  audit_reason: item.audit_reason,
  annotation: item.annotation || null,
  rewardModelStyle: getRewardModelStyle(item.raw_data, item.annotation),
}]

const buildGrpoTableData = (
  item: any,
  page: number,
  baseUrl: string,
  trainingMethodType?: string,
  datasetFormat?: string,
): AnnotationDataItem<string>[] => {
  const rawData = getNormalizedRawData(item.raw_data)
  const annotationRewardModel = item.annotation?.reward_model && typeof item.annotation.reward_model === 'object'
    ? item.annotation.reward_model
    : null
  const rewardModel = rawData.reward_model && typeof rawData.reward_model === 'object'
    ? rawData.reward_model as Record<string, unknown>
    : {}
  const style = getStringValue(annotationRewardModel?.style) || getStringValue(rewardModel.style) || 'rule'
  const groundTruth = getDisplayGroundTruth(rawData, item.annotation)

  return [{
    id: Number(item.item_id) || page,
    row_number: item.row_number || page,
    training_method_type: trainingMethodType,
    dataset_format: datasetFormat,
    data_source: getStringValue(rawData.data_source),
    prompt: formatGrpoPrompt(rawData, baseUrl),
    ability: getStringValue(rawData.ability),
    reward_model: {
      style,
      ground_truth: groundTruth,
    },
    rewardModelStyle: style,
    extra_info: formatGrpoValue(rawData.extra_info),
    is_annotated: item.is_annotated,
    status: item.status,
    audit_result: item.audit_result,
    audit_reason: item.audit_reason,
    annotation: item.annotation || null,
    base_url: baseUrl,
    _rawData: rawData,
    _rawImages: getRawDataImages(rawData),
  }]
}

const buildDpoTableData = (
  item: any,
  page: number,
  dpoFormat: 'alpaca' | 'role-based',
  trainingMethodType?: string,
  datasetFormat?: string,
): AnnotationDataItem<string>[] => {
  const rawData = getNormalizedRawData(item.raw_data)
  const annotation = item.annotation || {}
  const rawChosen = annotation.chosen ?? rawData.chosen
  const rawRejected = annotation.rejected ?? rawData.rejected

  return [{
    id: Number(item.item_id) || page,
    row_number: item.row_number || page,
    training_method_type: trainingMethodType,
    dataset_format: datasetFormat,
    instruction: getStringValue(rawData.instruction),
    input: getStringValue(rawData.input),
    prompt: getDisplayPrompt(rawData),
    messages: getRawDataMessages(rawData),
    chosen: getDpoText(rawChosen),
    rejected: getDpoText(rawRejected),
    chosenRole: getDpoRole(rawChosen),
    rejectedRole: getDpoRole(rawRejected),
    is_annotated: item.is_annotated,
    status: item.status,
    audit_result: item.audit_result,
    audit_reason: item.audit_reason,
    annotation: item.annotation || null,
    _rawMessages: getRawDataMessages(rawData),
  }]
}

const buildTaskTableData = (
  item: any,
  page: number,
  layout: TaskLayoutMeta,
  baseUrl: string,
  trainingMethodType?: string,
  datasetFormat?: string,
): AnnotationDataItem<string>[] => {
  if (layout.isGrpoType) {
    return buildGrpoTableData(item, page, baseUrl, trainingMethodType, datasetFormat)
  }

  if (layout.isDpoType) {
    return buildDpoTableData(item, page, layout.dpoFormat || 'alpaca', trainingMethodType, datasetFormat)
  }

  if (layout.isImageType) {
    const messagesToUse = item.annotation?.messages && Array.isArray(item.annotation.messages)
      ? item.annotation.messages
      : getRawDataMessages(item.raw_data)

    return buildMessageTableData(
      item,
      page,
      messagesToUse,
      getRawDataImages(item.raw_data),
      baseUrl,
      trainingMethodType,
      datasetFormat,
    )
  }

  if (layout.isTextWithMessages) {
    const messagesToUse = item.annotation?.messages && Array.isArray(item.annotation.messages)
      ? item.annotation.messages
      : getRawDataMessages(item.raw_data)

    return buildMessageTableData(item, page, messagesToUse, [], '', trainingMethodType, datasetFormat)
  }

  return buildTextTableData({ ...item, training_method_type: trainingMethodType, dataset_format: datasetFormat }, page)
}

const getInitialContent = (item: any, useMessagesLayout: boolean): string => {
  let initialContent = item.annotation?.response ?? item.annotation?.content ?? ''

  if (!useMessagesLayout && !initialContent) {
    initialContent = getDisplayGroundTruth(item.raw_data, item.annotation)
  }

  if (useMessagesLayout && !initialContent && item.annotation?.messages) {
    const msgs = item.annotation.messages
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'assistant') {
        initialContent = msgs[i].content ?? ''
        break
      }
    }
  }

  return initialContent
}

const buildAssistantContentsMap = (
  tableData: AnnotationDataItem<string>[],
  initialContent: string,
  useMessagesLayout: boolean,
) => {
  if (!useMessagesLayout || tableData.length === 0) {
    return {}
  }

  const assistantMessages = tableData[0]._assistantMessages || []
  const contents: Record<number, string> = {}

  assistantMessages.forEach((msg: string, index: number) => {
    contents[index] = index === assistantMessages.length - 1 && initialContent
      ? initialContent
      : msg
  })

  return contents
}

export function useAnnotationDetailController() {
  const { projectId, taskId } = useParams<{ projectId: string, taskId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const fromParam = searchParams.get('from')
  const auditParam = searchParams.get('audit')
  const contentParam = searchParams.get('content')
  const subTabParam = searchParams.get('sub_tab')
  const bizTypeParam = searchParams.get('biz_type') || location.state?.bizType
  const isMultiPerson = fromParam === 'multi-person' || location.state?.isMultiPerson === true
  const isAuditMode = auditParam === '1' || location.state?.isAuditMode === true
  const isMachineLearningBiz = bizTypeParam === 'machine_learning'
  const contentTab = contentParam === 'image' ? 'image' : (contentParam === 'text' ? 'text' : (location.state?.contentTab || 'text'))

  const [loading, setLoading] = useState(false)
  const [dataList, setDataList] = useState<AnnotationDataItem<string>[]>([])
  const [formerListData, setFormerListData] = useState<any>(null)
  const [taskName, setTaskName] = useState<string>('')
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 1,
    total: 0,
  })
  const [currentRowNumber, setCurrentRowNumber] = useState(1)
  const [annotationFilter, setAnnotationFilter] = useState<AnnotationFilter>('all')
  const [isCompleted, setIsCompleted] = useState<boolean>(false)
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false)
  const [isReauditRound, setIsReauditRound] = useState<boolean>(false)
  const [savedCount, setSavedCount] = useState<number>(0)
  const [totalSamples, setTotalSamples] = useState<number>(0)
  const [editingContent, setEditingContent] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)
  const [manualContent, setManualContent] = useState<string>('')
  const [dpoContents, setDpoContents] = useState<{ chosen: string, rejected: string }>({ chosen: '', rejected: '' })
  const [dpoProcessingTarget, setDpoProcessingTarget] = useState<'chosen' | 'rejected' | null>(null)
  const [assistantContents, setAssistantContents] = useState<Record<number, string>>({})
  const [savingDraft, setSavingDraft] = useState<boolean>(false)
  const [auditSubmitting, setAuditSubmitting] = useState<boolean>(false)
  const [auditSubmitLoading, setAuditSubmitLoading] = useState<boolean>(false)
  const [auditRejectModalVisible, setAuditRejectModalVisible] = useState(false)
  const [auditRejectReason, setAuditRejectReason] = useState('')
  const [isImageTask, setIsImageTask] = useState<boolean>(false)
  const resolvedContentTab: 'text' | 'image' = isImageTask || contentTab === 'image' ? 'image' : 'text'
  const [isImageAnnotation, setIsImageAnnotation] = useState<boolean>(false)
  const [baseUrl, setBaseUrl] = useState<string>('')
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set())
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({})
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState<number | null>(null)
  const [imagePreviewVisible, setImagePreviewVisible] = useState(false)
  const [previewImageUrl, setPreviewImageUrl] = useState<string>('')
  const [configModalVisible, setConfigModalVisible] = useState(false)
  const [hasConfig, setHasConfig] = useState<boolean>(false)
  const [fetchingConfig, setFetchingConfig] = useState(false)
  const [annotationConfig, setAnnotationConfig] = useState<AnnotationConfig | null>(null)

  const {
    streamingContent,
    loading: aiLoading,
    startAnnotation,
    reset: resetAiAnnotation,
  } = useAiAnnotation({
    onComplete: () => {
      setCurrentProcessingIndex(null)
    },
  })

  const assistantMessagesLength = useMemo(() => {
    if (isImageAnnotation && dataList.length > 0) {
      return dataList[0]._assistantMessages?.length || 0
    }
    return 0
  }, [isImageAnnotation, dataList])

  useEffect(() => {
    if (streamingContent) {
      if (dpoProcessingTarget) {
        setDpoContents((prev) => ({
          ...prev,
          [dpoProcessingTarget]: streamingContent,
        }))
      }
      else if (isImageAnnotation && currentProcessingIndex !== null) {
        setAssistantContents((prev) => ({
          ...prev,
          [currentProcessingIndex]: streamingContent,
        }))
        if (currentProcessingIndex === assistantMessagesLength - 1) {
          setManualContent(streamingContent)
        }
      }
      else {
        setManualContent(streamingContent)
      }
    }
  }, [streamingContent, dpoProcessingTarget, isImageAnnotation, currentProcessingIndex, assistantMessagesLength])

  const fetchAnnotationConfig = async () => {
    if (!taskId) {
      setHasConfig(false)
      setAnnotationConfig(null)
      return
    }

    setFetchingConfig(true)
    try {
      const response = await labelTaskService.getModelConfig({ task_id: Number(taskId) })
      const config = response.data || response
      const isValidConfig = config.model_id && config.param_config_json
      setHasConfig(!!isValidConfig)

      if (isValidConfig && config.param_config_json) {
        setAnnotationConfig({
          model_id: config.model_id,
          max_token: config.param_config_json.max_token || 2048,
          temperature: config.param_config_json.temperature || 0.7,
          top_p: config.param_config_json.top_p || 1.0,
          presence_penalty: config.param_config_json.presence_penalty || 1.0,
        })
      }
      else {
        setAnnotationConfig(null)
      }
    }
    catch (error: unknown) {
      console.error('获取配置失败:', error)
      setHasConfig(false)
      setAnnotationConfig(null)
    }
    finally {
      setFetchingConfig(false)
    }
  }

  const fetchTaskData = async (page: number = 1, filter?: AnnotationFilter) => {
    if (!taskId || !projectId) {
      return
    }
    setLoading(true)
    try {
      const currentFilter = filter ?? annotationFilter
      const params = buildTaskQueryParams(page, currentFilter, isAuditMode)

      let response: any
      if (isAuditMode && projectId) {
        response = await labelTaskService.getAuditData(Number(projectId), Number(taskId), {
          ...params,
          biz_type: bizTypeParam || undefined,
        })
      }
      else if (isMultiPerson && projectId) {
        response = await labelTaskService.getMultiLabelTaskData(Number(projectId), Number(taskId), {
          ...params,
          biz_type: bizTypeParam || undefined,
        })
      }
      else {
        response = await labelTaskService.getData(Number(taskId), {
          ...params,
          biz_type: bizTypeParam || undefined,
        })
      }

      const data = response.data || response
      const item = Array.isArray(data.items) ? data.items[0] : data.items
      const responseBaseUrl = data.base_url || ''
      const trainingMethodType = data.training_method_type || item?.training_method_type || ''
      const datasetFormat = data.dataset_format || item?.dataset_format || ''
      setIsReauditRound(Boolean(data.is_reaudit_round))

      setFormerListData(data)

      if (!item) {
        // message.error('数据格式错误')
        setDataList([])
        setPagination((prev) => ({ ...prev, total: 0 }))
        return
      }

      const isEmpty = !item.item_id || item.row_number === 0 || data.total === 0
      if (isEmpty) {
        setDataList([])
        setPagination((prev) => ({
          ...prev,
          total: data.total || 0,
        }))
        return
      }

      const layout = getTaskLayoutMeta(item, contentTab, trainingMethodType, datasetFormat)
      const tableData = buildTaskTableData(item, page, layout, responseBaseUrl, trainingMethodType, datasetFormat)
      const initialContent = getInitialContent(item, layout.useMessagesLayout)
      const nextAssistantContents = buildAssistantContentsMap(tableData, initialContent, layout.useMessagesLayout)
      const dpoItem = tableData[0]

      setIsImageTask(!layout.isDpoType && layout.isImageType)
      setIsImageAnnotation(layout.useMessagesLayout)
      setBaseUrl(responseBaseUrl)

      setDataList(tableData)
      setCurrentRowNumber(item.row_number || page)
      resetAiAnnotation()
      setIsEditing(false)
      setEditingContent('')
      setCurrentProcessingIndex(null)
      setDpoProcessingTarget(null)
      setExpandedCells(new Set())
      setRowHeights({})
      setManualContent(initialContent)
      setDpoContents({
        chosen: dpoItem?.chosen || '',
        rejected: dpoItem?.rejected || '',
      })
      setAssistantContents(nextAssistantContents)

      if (data.total !== undefined) {
        setPagination((prev) => ({
          ...prev,
          total: data.total,
        }))
      }
    }
    catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '获取数据失败'
      message.error(errorMessage)
      setDataList([])
    }
    finally {
      setLoading(false)
    }
  }

  const { data: completionStatusData, refetch: refetchCompletionStatus, error: completionStatusError } = useQuery({
    queryKey: ['annotation-completion-status', taskId, isMultiPerson, isAuditMode, projectId],
    queryFn: async () => {
      if (!taskId) {
        throw new Error('任务ID不存在')
      }
      if (isAuditMode && projectId) {
        const response = await labelTaskService.getAuditCompletionStatus(Number(projectId), Number(taskId), bizTypeParam || undefined)
        const data = response?.data ?? response
        return {
          ...data,
          is_completed: data?.is_completed ?? false,
          is_submitted: data?.is_submitted ?? false,
        }
      }
      const response = isMultiPerson && projectId
        ? await labelTaskService.getMultiLabelCompletionStatus(Number(projectId), Number(taskId), bizTypeParam || undefined)
        : await labelTaskService.getCompletionStatus(Number(taskId), bizTypeParam || undefined)
      const data = response.data || response
      return data
    },
    enabled: !!taskId && (isAuditMode ? !!projectId : true),
    refetchOnMount: 'always',
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      if (isAuditMode) {
        const total = data.total_assigned ?? 0
        return total > 0 && !data.is_completed ? 2000 : false
      }
      const shouldPoll = data.total_samples > 0
        && data.total_samples - data.saved_count === 1
        && !data.is_completed
      return shouldPoll ? 2000 : false
    },
  })

  useEffect(() => {
    if (completionStatusData) {
      setIsCompleted(completionStatusData.is_completed || false)
      setIsSubmitted(completionStatusData.is_submitted || false)
      if (!isAuditMode) {
        setSavedCount(completionStatusData.saved_count || 0)
        setTotalSamples(completionStatusData.total_samples || 0)
      }
    }
  }, [completionStatusData, isAuditMode])

  useEffect(() => {
    if (completionStatusError) {
      console.error('查询标注状态失败:', completionStatusError)
      setIsCompleted(false)
      setIsSubmitted(false)
    }
  }, [completionStatusError])

  useEffect(() => {
    if (location.state && location?.state?.taskName) {
      setTaskName(location.state.taskName)
    }

    if (taskId && projectId) {
      fetchTaskData(1)
      fetchAnnotationConfig()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, projectId])

  const getListUrl = () => {
    const tab = isMultiPerson ? 'multi-person' : 'online'
    const datasetType = resolvedContentTab === 'image' ? 'image-understanding' : 'text-generation'
    const params = new URLSearchParams({ tab, dataset_type: datasetType })
    if (isMultiPerson) params.set('sub_tab', subTabParam || 'overview')
    if (bizTypeParam) params.set('biz_type', bizTypeParam)
    return `/project/${projectId}/${isMachineLearningBiz ? 'machine-annotation' : 'data-annotation'}?${params.toString()}`
  }

  const handlePageChange = async (page: number, pageSize?: number) => {
    if (aiLoading) {
      message.warning('AI标注正在进行中，请稍候...')
      return
    }

    setPagination((prev) => ({
      ...prev,
      current: page,
      pageSize: pageSize || prev.pageSize,
    }))
    fetchTaskData(page)
  }

  const handleFilterChange = (newFilter: AnnotationFilter) => {
    setAnnotationFilter(newFilter)
    setPagination((prev) => ({ ...prev, current: 1 }))
    fetchTaskData(1, newFilter)
  }

  const refreshAuditListAfterAction = async () => {
    const shouldResetToFirstPage = annotationFilter === 'unaudited' || annotationFilter === 'failed'

    if (shouldResetToFirstPage) {
      setPagination((prev) => ({ ...prev, current: 1 }))
      await fetchTaskData(1)
      return
    }

    if (pagination.current < pagination.total) {
      await handlePageChange(pagination.current + 1)
      return
    }

    await fetchTaskData(pagination.current)
  }

  const buildImageAnnotationMessages = (): any[] | null => {
    if (!isImageAnnotation || !dataList[0]) {
      return null
    }

    const currentData = dataList[0]
    const rawMessages = currentData._rawMessages || []
    if (rawMessages.length === 0) {
      return null
    }

    let assistantIndex = 0
    const updatedMessages = rawMessages.map((msg: any) => {
      if (msg.role === 'assistant') {
        let updatedContent = msg.content

        if (assistantContents[assistantIndex] !== undefined) {
          updatedContent = assistantContents[assistantIndex]
        }
        else if (currentProcessingIndex === assistantIndex && streamingContent) {
          updatedContent = streamingContent
        }

        assistantIndex++
        return {
          ...msg,
          content: updatedContent,
        }
      }
      return msg
    })

    return updatedMessages
  }

  const buildDpoAnnotationData = () => {
    const currentData = dataList[0]
    if (!currentData) return null

    const chosen = dpoContents.chosen ?? currentData.chosen ?? ''
    const rejected = dpoContents.rejected ?? currentData.rejected ?? ''
    if (!chosen.trim() || !rejected.trim()) {
      return null
    }

    if (currentData.dataset_format === 'role-based') {
      return {
        chosen: {
          role: currentData.chosenRole || 'assistant',
          content: chosen,
        },
        rejected: {
          role: currentData.rejectedRole || 'assistant',
          content: rejected,
        },
      }
    }

    return { chosen, rejected }
  }

  const buildGrpoAnnotationData = () => {
    const currentData = dataList[0]
    if (!currentData) return null

    const content = manualContent ?? streamingContent ?? ''
    if (!content || content.trim() === '') {
      return null
    }

    const rawData = currentData._rawData || {}
    const annotationData = currentData.annotation && typeof currentData.annotation === 'object'
      ? currentData.annotation as Record<string, unknown>
      : {}
    const baseData = {
      ...rawData,
      ...annotationData,
    }
    const rawRewardModel = rawData.reward_model && typeof rawData.reward_model === 'object'
      ? rawData.reward_model as Record<string, unknown>
      : {}
    const annotationRewardModel = annotationData.reward_model && typeof annotationData.reward_model === 'object'
      ? annotationData.reward_model as Record<string, unknown>
      : {}
    return {
      ...baseData,
      reward_model: {
        ...rawRewardModel,
        ...annotationRewardModel,
        style: currentData.rewardModelStyle || 'rule',
        ground_truth: content,
      },
    }
  }

  const handleSaveDraft = async () => {
    if (!taskId) return
    const currentItem = dataList[0]
    const isMultiPersonPassedLocked = isMultiPerson
      && currentItem?.audit_result === 'passed'
      && currentItem?.is_annotated === true
    if (isMultiPersonPassedLocked) {
      return
    }
    if (aiLoading) {
      message.warning('AI标注正在进行中，请稍候...')
      return
    }
    if (savingDraft) {
      return
    }

    setSavingDraft(true)
    try {
      let annotationData: any = {}

      if (currentItem?.training_method_type === 'grpo' || formerListData?.training_method_type === 'grpo' || currentItem?.dataset_format === 'grpo' || formerListData?.dataset_format === 'grpo') {
        const grpoAnnotationData = buildGrpoAnnotationData()
        if (!grpoAnnotationData) {
          message.warning('Ground Truth 不能为空，请先输入标注内容')
          setSavingDraft(false)
          return
        }
        annotationData = grpoAnnotationData
      }
      else if (currentItem?.training_method_type === 'dpo' || formerListData?.training_method_type === 'dpo') {
        const dpoAnnotationData = buildDpoAnnotationData()
        if (!dpoAnnotationData) {
          message.warning('Chosen 和 Rejected 均不能为空，请先输入标注内容')
          setSavingDraft(false)
          return
        }
        annotationData = dpoAnnotationData
      }
      else if (isImageAnnotation) {
        const messages = buildImageAnnotationMessages()
        if (!messages || messages.length === 0) {
          message.warning('请先进行AI自动标注或手动输入标注内容')
          setSavingDraft(false)
          return
        }

        const assistantMessages = messages.filter((msg: any) => msg.role === 'assistant')
        if (assistantMessages.length > 0) {
          const emptyAssistants = assistantMessages.filter((msg: any) => !msg.content || msg.content.trim() === '')
          if (emptyAssistants.length > 0) {
            message.warning('所有 assistant 消息不能为空，请先进行AI自动标注或手动输入标注内容')
            setSavingDraft(false)
            return
          }
        }

        annotationData = { messages }
      }
      else {
        const content = manualContent ?? streamingContent ?? ''
        if (!content || content.trim() === '') {
          message.warning('请先进行AI自动标注或手动输入标注内容')
          setSavingDraft(false)
          return
        }
        annotationData = { response: content }
      }

      if (isMultiPerson && projectId) {
        const payload: SaveMultiLabelAnnotationRequest = {
          task_id: Number(taskId),
          row_number: currentRowNumber,
          annotation: annotationData,
          biz_type: bizTypeParam || undefined,
        }
        await labelTaskService.saveMultiLabelAnnotation(Number(projectId), payload)
      }
      else {
        await labelTaskService.save({
          task_id: Number(taskId),
          row_number: currentRowNumber,
          annotation: annotationData,
          is_final: false,
          biz_type: bizTypeParam || undefined,
        })
      }
      message.success('标注已暂存')
      refetchCompletionStatus()
      if (pagination.current < pagination.total && annotationFilter !== 'unannotated') {
        handlePageChange(pagination.current + 1)
      }
      else {
        await fetchTaskData(pagination.current)
      }
    }
    catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '暂存失败'
      message.error(errorMessage)
    }
    finally {
      setSavingDraft(false)
    }
  }

  const handleSubmit = async () => {
    if (!taskId) return
    if (aiLoading) {
      message.warning('AI标注正在进行中，请稍候...')
      return
    }

    try {
      if (isMultiPerson && projectId) {
        await labelTaskService.submitAllMultiLabelAnnotation(
          Number(projectId),
          Number(taskId),
          bizTypeParam || undefined,
        )
      }
      else {
        const submitData: SaveAnnotationRequest = {
          task_id: Number(taskId),
          row_number: currentRowNumber,
          is_final: true,
          biz_type: bizTypeParam || undefined,
        }
        await labelTaskService.save(submitData)
      }
      message.success('提交成功')
      navigate(getListUrl())
    }
    catch {}
  }

  const handleAuditPass = async () => {
    const currentItem = dataList[0]
    const isActionDisabled = isReauditRound && currentItem?.audit_result === 'passed'
    if (!projectId || !taskId || auditSubmitting || isActionDisabled) return
    setAuditSubmitting(true)
    try {
      await labelTaskService.saveAudit(Number(projectId), {
        task_id: Number(taskId),
        row_number: currentRowNumber,
        audit_result: 'passed',
        biz_type: bizTypeParam || undefined,
      })
      message.success('审核通过')
      refetchCompletionStatus?.()
      await refreshAuditListAfterAction()
    }
    catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '操作失败')
    }
    finally {
      setAuditSubmitting(false)
    }
  }

  const handleAuditFailOpen = () => {
    const currentItem = dataList[0]
    const isActionDisabled = isReauditRound && currentItem?.audit_result === 'passed'
    if (isActionDisabled || auditSubmitting) return
    setAuditRejectReason('')
    setAuditRejectModalVisible(true)
  }

  const handleAuditFailConfirm = async () => {
    const reason = auditRejectReason?.trim()
    if (!reason) {
      message.warning('请填写驳回原因')
      return
    }
    if (!projectId || !taskId || auditSubmitting) return
    setAuditSubmitting(true)
    try {
      await labelTaskService.saveAudit(Number(projectId), {
        task_id: Number(taskId),
        row_number: currentRowNumber,
        audit_result: 'failed',
        reason,
        biz_type: bizTypeParam || undefined,
      })
      message.success('审核不通过')
      setAuditRejectModalVisible(false)
      setAuditRejectReason('')
      refetchCompletionStatus?.()
      await refreshAuditListAfterAction()
    }
    catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '操作失败')
    }
    finally {
      setAuditSubmitting(false)
    }
  }

  const handleSubmitAudit = async () => {
    if (!projectId || !taskId || auditSubmitLoading) return
    setAuditSubmitLoading(true)
    try {
      await labelTaskService.submitAuditTask(Number(projectId), Number(taskId), bizTypeParam || undefined)
      message.success('提交成功')
      navigate(getListUrl())
    }
    catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '提交失败')
    }
    finally {
      setAuditSubmitLoading(false)
    }
  }

  const handleBack = () => {
    navigate(getListUrl())
  }

  const handleOpenConfig = () => {
    setConfigModalVisible(true)
  }

  const handleConfigConfirm = (_config: AnnotationConfig) => {
    fetchAnnotationConfig()
  }

  const toggleRowExpand = useCallback((record: AnnotationDataItem<string>) => {
    if (!isImageAnnotation) return

    const rowKey = record.id?.toString() || record.row_number?.toString() || '0'
    const rowPrefix = rowKey

    setExpandedCells((prev) => {
      const newSet = new Set(prev)
      const isCurrentlyExpanded = newSet.has(`${rowPrefix}-system`)

      if (isCurrentlyExpanded) {
        const keysToDelete: string[] = []
        prev.forEach((k) => {
          if (k === `${rowPrefix}-system` || (k.startsWith(`${rowPrefix}-user-`) && k.endsWith('-user'))) {
            keysToDelete.push(k)
          }
        })
        keysToDelete.forEach((k) => newSet.delete(k))
      }
      else {
        newSet.add(`${rowPrefix}-system`)
        const userMessages = record._userMessages || []
        userMessages.forEach((_: string, index: number) => {
          newSet.add(`${rowPrefix}-user-${index}-user`)
        })
      }

      return newSet
    })
  }, [isImageAnnotation])

  const toggleCellExpand = (_rowKey: string, _columnKey: string) => {}

  const handleHeightChange = useCallback((rowKey: string, columnKey: string, height: number) => {
    setRowHeights((prev) => {
      const newHeights = { ...prev }
      const key = `${rowKey}-${columnKey}`
      newHeights[key] = height

      const rowPrefix = rowKey.includes('-') ? rowKey.split('-')[0] : rowKey
      let maxHeight = 0

      Object.keys(newHeights).forEach((k) => {
        if (k !== `${rowPrefix}-max`) {
          if (k === rowPrefix || k.startsWith(`${rowPrefix}-`)) {
            maxHeight = Math.max(maxHeight, newHeights[k])
          }
        }
      })

      if (maxHeight > 100) {
        newHeights[`${rowPrefix}-max`] = maxHeight
      }
      else {
        delete newHeights[`${rowPrefix}-max`]
      }

      return newHeights
    })
  }, [])

  const handleImageClick = (imageIndex: number, record: AnnotationDataItem<string>) => {
    const rawImages = record._rawImages || []
    const recordBaseUrl = record.base_url || ''

    if (imageIndex >= 0 && imageIndex < rawImages.length) {
      const imagePath = rawImages[imageIndex]
      const fileName = imagePath.includes('/') ? imagePath.split('/').pop() : imagePath
      const imageBaseUrl = import.meta.env.DEV
        ? `${import.meta.env.VITE_PREFIX_BASE_URL}/api/v1/storage/download/`
        : '/lab-backend/api/v1/storage/download/'

      const fullImageUrl = `${imageBaseUrl}${recordBaseUrl}/${fileName}`
      setPreviewImageUrl(fullImageUrl)
      setImagePreviewVisible(true)
    }
  }

  const handleOpenAIAnnotation = async (index?: number | 'chosen' | 'rejected') => {
    if (!taskId) {
      message.error('任务ID不存在')
      return
    }

    if (!hasConfig) {
      message.warning('请先配置标注配置，AI自动标注依赖标注配置')
      setConfigModalVisible(true)
      return
    }

    const currentData = dataList[0]
    if (!currentData) {
      message.error('当前没有可标注的数据')
      return
    }

    if (index === 'chosen' || index === 'rejected') {
      setDpoProcessingTarget(index)
      setCurrentProcessingIndex(null)
    }
    else if (isImageAnnotation && index !== undefined) {
      setCurrentProcessingIndex(index)
      setDpoProcessingTarget(null)
    }
    else {
      setCurrentProcessingIndex(null)
      setDpoProcessingTarget(null)
    }

    setManualContent('')
    setIsEditing(false)
    setEditingContent('')

    try {
      if (currentData.training_method_type === 'dpo') {
        const annotationTarget = index === 'chosen' || index === 'rejected' ? index : undefined
        if (currentData.dataset_format === 'role-based') {
          const rawMessages = currentData._rawMessages || []
          if (rawMessages.length === 0) {
            message.error('当前 DPO role-based 数据缺少 messages')
            return
          }
          await startAnnotation(Number(taskId), undefined, {
            messages: rawMessages,
            images: [],
          }, {
            annotationTarget,
          })
        }
        else {
          const instruction = currentData.instruction || ''
          const input = currentData.input || ''
          if (!instruction && !input) {
            message.error('当前 DPO alpaca 数据缺少 instruction/input 字段')
            return
          }
          await startAnnotation(Number(taskId), undefined, undefined, {
            annotationTarget,
            instruction,
            input,
          })
        }
      }
      else if (currentData.training_method_type === 'grpo' || currentData.dataset_format === 'grpo') {
        const rawData = currentData._rawData || {}
        const rawPrompt = Array.isArray(rawData.prompt) ? rawData.prompt : []
        const rawImages = currentData._rawImages || []

        if (rawPrompt.length > 0 && rawImages.length > 0) {
          await startAnnotation(Number(taskId), undefined, {
            messages: rawPrompt,
            images: rawImages,
          })
        }
        else {
          const prompt = currentData.prompt || ''
          if (!prompt) {
            message.error('当前 GRPO 数据缺少 prompt 字段')
            return
          }
          await startAnnotation(Number(taskId), prompt)
        }
      }
      else if (isImageAnnotation) {
        const rawMessages = currentData._rawMessages || []
        const rawImages = currentData._rawImages || []

        if (rawMessages.length === 0) {
          message.error('多轮对话数据不完整，缺少 messages')
          return
        }

        if (isImageTask && (!rawImages || rawImages.length === 0)) {
          message.error('图像标注数据不完整，缺少图片')
          return
        }

        const assistantMessages = currentData._assistantMessages || []
        const targetIndex = index !== undefined ? index : (assistantMessages.length > 0 ? assistantMessages.length - 1 : 0)

        let assistantCount = 0
        let targetAssistantIndex = -1

        for (let i = 0; i < rawMessages.length; i++) {
          if (rawMessages[i].role === 'assistant') {
            if (assistantCount === targetIndex) {
              targetAssistantIndex = i
              break
            }
            assistantCount++
          }
        }

        if (targetAssistantIndex === -1) {
          message.error('无法找到要标注的assistant位置')
          return
        }

        const messagesToSend = rawMessages.slice(0, targetAssistantIndex)

        if (isImageTask) {
          let imageCount = 0
          for (let i = 0; i < targetAssistantIndex; i++) {
            const content = rawMessages[i].content || ''
            const matches = content.match(/<image>/g)
            if (matches) imageCount += matches.length
          }
          const imagesToSend = rawImages.slice(0, imageCount)
          await startAnnotation(Number(taskId), undefined, {
            messages: messagesToSend,
            images: imagesToSend,
          })
        }
        else {
          await startAnnotation(Number(taskId), undefined, {
            messages: messagesToSend,
            images: [],
          })
        }
      }
      else {
        const prompt = currentData.prompt || ''

        if (!prompt) {
          message.error('当前数据缺少prompt字段')
          return
        }

        await startAnnotation(Number(taskId), prompt)
      }
    }
    finally {
      setCurrentProcessingIndex(null)
      setDpoProcessingTarget(null)
    }
  }

  const currentItem = dataList[0]
  const isMultiPersonPassedLocked = isMultiPerson
    && currentItem?.audit_result === 'passed'
    && currentItem?.is_annotated === true

  return {
    projectId,
    taskId,
    taskName,
    loading,
    dataList,
    formerListData,
    pagination,
    annotationFilter,
    isCompleted,
    isSubmitted,
    isReauditRound,
    manualContent,
    dpoContents,
    dpoProcessingTarget,
    assistantContents,
    savingDraft,
    auditSubmitting,
    auditSubmitLoading,
    auditRejectModalVisible,
    auditRejectReason,
    isImageTask,
    resolvedContentTab,
    isImageAnnotation,
    baseUrl,
    expandedCells,
    rowHeights,
    currentProcessingIndex,
    imagePreviewVisible,
    previewImageUrl,
    streamingContent,
    aiLoading,
    configModalVisible,
    annotationConfig,
    isMultiPerson,
    isAuditMode,
    isMultiPersonPassedLocked,
    setManualContent,
    setDpoContents,
    setAssistantContents,
    setAuditRejectReason,
    setAuditRejectModalVisible,
    setConfigModalVisible,
    setImagePreviewVisible,
    fetchTaskData,
    handleFilterChange,
    handlePageChange,
    handleSaveDraft,
    handleSubmit,
    handleBack,
    handleAuditPass,
    handleAuditFailOpen,
    handleAuditFailConfirm,
    handleSubmitAudit,
    handleOpenConfig,
    handleConfigConfirm,
    toggleRowExpand,
    toggleCellExpand,
    handleHeightChange,
    handleImageClick,
    handleOpenAIAnnotation,
  }
}
