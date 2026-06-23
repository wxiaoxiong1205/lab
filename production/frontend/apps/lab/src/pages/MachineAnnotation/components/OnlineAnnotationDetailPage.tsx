import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '@annotorious/react/annotorious-react.css'
import '@annotorious/openseadragon/annotorious-openseadragon.css'
import '@annotorious/plugin-tools/annotorious-plugin-tools.css'
import {
  Button,
  Input,
  Modal,
  Pagination,
  Spin,
  message,
} from 'antd'
import { useQuery } from '@tanstack/react-query'
import type {
  AnnotationKind,
  EntitySpanItem,
  ImageAnnotationItem,
  OnlineAnnotationPageItem,
  OnlineAnnotationTaskDetail,
} from '../types'
import DetailContent from './onlineAnnotationDetail/DetailContent'
import DetailHeader, { type DetailStatusFilter } from './onlineAnnotationDetail/DetailHeader'
import DetailModals from './onlineAnnotationDetail/DetailModals'
import type { SegmentationDrawingTool } from './onlineAnnotationDetail/SegmentationWorkspace'
import type { MachineAnnotationConfig } from './onlineAnnotationDetail/AnnotationServiceConfigModal'
import LabelSidebar from './onlineAnnotationDetail/LabelSidebar'
import type {
  DetailPageEntitySpans,
  DetailPageSelectedClassIds,
  EntityRecognitionPayloadItem,
  LabelTaskLabelsResponse,
  MachineAnnotationDataResponse,
  OnlineAnnotationDetailPageProps,
} from './onlineAnnotationDetail/types'
import {
  buildChoicesPredictLabelConfig,
  buildPredictLabelConfig,
  buildRectanglePredictLabelConfig,
  buildTextEntityPredictLabelConfig,
  createDetailColumns,
  createIndexedLabels,
  filterClassificationClassIdsByLabels,
  filterEntitySpansByLabels,
  getAnnotationColor,
  isValidSegmentationClassId,
  normalizeEntitySpans,
  normalizeImageAnnotation,
  predictResponseToChoiceSelection,
  predictResponseToEntitySpans,
  predictResponseToRectangleAnnotations,
  predictResponseToSegmentationAnnotations,
  resolveEntityRecognitionSource,
  resolveImageAnnotationSource,
  resolveImageClassificationSource,
  serializeImageAnnotations,
  toSegmentationLabelOptions,
} from './onlineAnnotationDetail/utils'
import { buildImageUrl } from '@/pages/machineLearning/ImageTabDetails'
import apiClient from '@/services/apiClient'
import type { LabelTaskLabelItem } from '@/services/dataAnnotationService'
import { labelTaskService } from '@/services/dataAnnotationService'

const SEGMENTATION_TEMPLATE_TYPES = ['semantic_segmentation', 'image_segmentation_instance', 'instance_segmentation_mask'] as const
const IMAGE_WORKSPACE_TEMPLATE_TYPES = [...SEGMENTATION_TEMPLATE_TYPES, 'object_detection_bbox'] as const
const IMAGE_CLASSIFICATION_TEMPLATE_TYPES = ['image_classification_single_label', 'image_classification_multi_label'] as const
const TEXT_CLASSIFICATION_TEMPLATE_TYPES = ['text_classification_single_label', 'text_classification_multi_label'] as const
const ENTITY_RECOGNITION_TEMPLATE_TYPES = ['entity_recognition'] as const
const EDITABLE_LABEL_TASK_STATUSES = new Set(['creating', 'created', 'annotating'])

type MachineAnnotationItem = NonNullable<MachineAnnotationDataResponse['items']>

function buildProxyPredictUrl(service: any): string | undefined {
  const proxyAccessUrl = service?.proxy_access_url || service?.ports?.[0]?.proxy_access_url
  if (typeof proxyAccessUrl === 'string' && proxyAccessUrl) {
    return `${proxyAccessUrl.replace(/\/?$/, '/')}predict`
  }

  return undefined
}

function mapKindToTemplateType(kind?: AnnotationKind): string | undefined {
  if (kind === 'text-classification') return 'text_classification_single_label'
  if (kind === 'image-classification') return 'image_classification_single_label'
  if (kind === 'entity-recognition') return 'entity_recognition'
  if (kind === 'object-detection') return 'object_detection_bbox'
  if (kind === 'image-segmentation') return 'image_segmentation_instance'
  return undefined
}

function inferOverviewTemplateType(
  item?: MachineAnnotationItem,
  fallbackKind?: AnnotationKind,
): string | undefined {
  if (!item) return undefined

  const source = Array.isArray(item.annotation) && item.annotation.length > 0
    ? item.annotation
    : Array.isArray(item.raw_data?.annotations) && item.raw_data.annotations.length > 0
      ? item.raw_data.annotations
      : []

  if (!source.length) {
    return mapKindToTemplateType(fallbackKind)
  }

  const first = source[0]
  if (typeof first === 'number') {
    return mapKindToTemplateType(fallbackKind)
  }
  if (first && typeof first === 'object' && 'offset' in first && 'tag' in first) {
    return 'entity_recognition'
  }
  if (first && typeof first === 'object' && 'bbox' in first) {
    return 'object_detection_bbox'
  }
  if (first && typeof first === 'object' && 'segmentation' in first) {
    const segmentation = (first as { segmentation?: unknown }).segmentation
    if (
      segmentation
      && typeof segmentation === 'object'
      && !Array.isArray(segmentation)
      && (segmentation as { type?: unknown }).type === 'polygon_with_holes'
    ) {
      return 'instance_segmentation_mask'
    }
    return 'image_segmentation_instance'
  }
  return mapKindToTemplateType(fallbackKind)
}

function getResponseItem(
  items?: MachineAnnotationItem | MachineAnnotationItem[],
): MachineAnnotationItem | undefined {
  if (Array.isArray(items)) {
    return items[0]
  }
  return items
}

async function fetchFallbackSubmitRowNumber(taskId: number, bizType?: string): Promise<number | undefined> {
  const response = await labelTaskService.getData(taskId, {
    page: 1,
    size: 1,
    biz_type: bizType,
  })
  return getResponseItem(response?.items)?.row_number
}

function mergeLabelTaskApiResponse(
  taskLabelsData: LabelTaskLabelItem[] | LabelTaskLabelsResponse | undefined,
  fallbackLabels: string[],
): string[] {
  const response = taskLabelsData as LabelTaskLabelItem[] | LabelTaskLabelsResponse | undefined
  const rawLabels = Array.isArray(response)
    ? response
    : response?.items ?? response?.labels ?? []

  const normalizedLabels = rawLabels
    .reduce<string[]>((result, item: any, index) => {
      if (typeof item === 'string') {
        result[index] = item.trim()
        return result
      }

      const labelName = [
        item?.tag_name,
        item?.name,
        item?.label,
        item?.label_name,
        item?.display_name,
      ].find((value) => typeof value === 'string' && value.trim())

      const classId = item?.class_id ?? index
      result[classId] = labelName?.trim() || ''
      return result
    }, [])

  return normalizedLabels.some(Boolean) ? normalizedLabels : fallbackLabels
}

interface EditingLabelState {
  classId: number
  label: string
}

const OnlineAnnotationDetailPage: React.FC<OnlineAnnotationDetailPageProps> = ({
  projectId,
  taskId,
  bizType,
  isMultiPerson = false,
  isAuditMode = false,
  isOnlineTabDetail = false,
  viewMode = 'annotation',
  task,
  onBack,
}) => {
  const [currentPage, setCurrentPage] = useState(1)
  const [configVisible, setConfigVisible] = useState(false)
  const [annotationConfig, setAnnotationConfig] = useState<MachineAnnotationConfig | null>(null)
  const [addLabelVisible, setAddLabelVisible] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [editingLabel, setEditingLabel] = useState<EditingLabelState | null>(null)
  const [creatingLabel, setCreatingLabel] = useState(false)
  const [removingLabelId, setRemovingLabelId] = useState<number | null>(null)
  const [savingDraft, setSavingDraft] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [autoAnnotating, setAutoAnnotating] = useState(false)
  const [auditSubmitting, setAuditSubmitting] = useState(false)
  const [auditSubmitLoading, setAuditSubmitLoading] = useState(false)
  const [auditRejectVisible, setAuditRejectVisible] = useState(false)
  const [auditRejectReason, setAuditRejectReason] = useState('')
  const [statusFilter, setStatusFilter] = useState<DetailStatusFilter>('all')
  const isReadOnly = viewMode === 'overview'

  const fetchAnnotationConfig = useCallback(async () => {
    if (!taskId) {
      setAnnotationConfig(null)
      return
    }

    try {
      const response = await labelTaskService.getModelConfig({ task_id: Number(taskId) })
      const config = response?.data || response
      let paramConfig: Record<string, any> | undefined
      if (config?.param_config_json && typeof config.param_config_json === 'string') {
        try {
          paramConfig = JSON.parse(config.param_config_json)
        }
        catch {
          paramConfig = undefined
        }
      }
      else if (config?.param_config_json && typeof config.param_config_json === 'object') {
        paramConfig = config.param_config_json
      }

      let resolvedBaseUrl = paramConfig?.base_url
      if (
        !resolvedBaseUrl
        && projectId
        && config?.model_id
        && paramConfig?.service_type === 'model_deployment'
      ) {
        try {
          const deploymentResponse = await apiClient.get(
            `/inference_tasks/project/${projectId}/${config.model_id}`,
          )
          const deployment = deploymentResponse?.data?.data || deploymentResponse?.data || deploymentResponse
          resolvedBaseUrl = buildProxyPredictUrl(deployment)
        }
        catch {
          resolvedBaseUrl = undefined
        }
      }

      setAnnotationConfig(config?.model_id
        ? {
            model_id: config.model_id,
            service_type: paramConfig?.service_type,
            base_url: resolvedBaseUrl,
            service_name: paramConfig?.serviceName,
          }
        : null)
    }
    catch {
      setAnnotationConfig(null)
    }
  }, [projectId, taskId])
  const {
    data: taskData,
    isLoading: taskDataLoading,
    isFetching: taskDataFetching,
    refetch: refetchTaskData,
  } = useQuery({
    queryKey: ['machine-annotation-detail-data', taskId, currentPage, bizType, isMultiPerson, isAuditMode, viewMode, statusFilter],
    queryFn: async () => {
      if (viewMode === 'overview' && projectId) {
        const params: {
          project_id: number
          task_id: number
          biz_type?: string
          page: number
          size: number
          audit_status?: 'unaudited' | 'passed' | 'failed'
        } = {
          project_id: projectId,
          task_id: taskId as number,
          biz_type: bizType,
          page: currentPage,
          size: 1,
        }
        if (statusFilter === 'unaudited' || statusFilter === 'passed' || statusFilter === 'failed') {
          params.audit_status = statusFilter
        }
        return labelTaskService.getOverviewData(params)
      }
      const params: {
        page: number
        size: number
        biz_type?: string
        is_annotated?: boolean
        audit_status?: 'unaudited' | 'passed' | 'failed'
      } = {
        page: currentPage,
        size: 1,
        biz_type: bizType,
      }
      if (isAuditMode) {
        if (statusFilter === 'unaudited' || statusFilter === 'passed' || statusFilter === 'failed') {
          params.audit_status = statusFilter
        }
      }
      else if (statusFilter === 'annotated') {
        params.is_annotated = true
      }
      else if (statusFilter === 'unannotated') {
        params.is_annotated = false
      }
      if (isAuditMode && projectId) {
        return labelTaskService.getAuditData(projectId, taskId as number, params)
      }
      if (isMultiPerson && projectId) {
        return labelTaskService.getMultiLabelTaskData(projectId, taskId as number, params)
      }
      return labelTaskService.getData(taskId as number, params)
    },
    enabled: !!taskId && (viewMode === 'overview' || isAuditMode || isMultiPerson ? !!projectId : true),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  })

  const { data: taskLabelsData, refetch: refetchTaskLabels } = useQuery({
    queryKey: ['machine-annotation-task-labels', taskId, bizType],
    queryFn: () => labelTaskService.getLabels(taskId as number, bizType),
    enabled: !!taskId,
  })

  const { data: completionStatus, refetch: refetchCompletionStatus } = useQuery({
    queryKey: ['machine-annotation-completion-status', projectId, taskId, bizType, isMultiPerson, viewMode],
    queryFn: async () => {
      if (viewMode === 'overview') {
        return {
          is_completed: false,
          is_submitted: true,
          total_samples: 0,
          saved_count: 0,
        }
      }
      if (isAuditMode && projectId) {
        const response = await labelTaskService.getAuditCompletionStatus(projectId, taskId as number, bizType)
        return response?.data || response
      }
      const response = isMultiPerson && projectId
        ? await labelTaskService.getMultiLabelCompletionStatus(projectId, taskId as number, bizType)
        : await labelTaskService.getCompletionStatus(taskId as number, bizType)
      return response?.data || response
    },
    enabled: !!taskId && (viewMode === 'overview' ? true : (isAuditMode || isMultiPerson ? !!projectId : true)),
    refetchOnMount: 'always',
    refetchInterval: (query) => {
      const data = query.state.data as {
        total_samples?: number
        saved_count?: number
        is_completed?: boolean
      } | undefined
      if (!data) return false

      const shouldPoll = (data.total_samples ?? 0) > 0
        && (data.total_samples ?? 0) - (data.saved_count ?? 0) === 1
        && !data.is_completed
      return shouldPoll ? 2000 : false
    },
  })
  const isSubmitted = viewMode === 'overview' ? true : !!completionStatus?.is_submitted
  const isCompleted = completionStatus?.is_completed === true
  const isReauditRound = (taskData as MachineAnnotationDataResponse | undefined)?.is_reaudit_round === true

  const mergedEntityLabelList = useMemo(
    () => mergeLabelTaskApiResponse(taskLabelsData, task.labels),
    [task.labels, taskLabelsData],
  )

  const effectiveTask = useMemo<OnlineAnnotationTaskDetail>(() => {
    const rawResponse = taskData as (MachineAnnotationDataResponse & {
      items?: MachineAnnotationItem | MachineAnnotationItem[]
    }) | undefined
    const overviewResponse = taskData as {
      items?: MachineAnnotationItem | MachineAnnotationItem[]
      total?: number
      page?: number
      total_pages?: number
      task_status?: string
      base_url?: string
      ml_task_template_type?: string
      ml_task_annotation_type?: string
    } | undefined
    const normalizedItem = getResponseItem(
      viewMode === 'overview' ? overviewResponse?.items : rawResponse?.items,
    )
    const response = viewMode === 'overview'
      ? {
          items: normalizedItem,
          total: overviewResponse?.total,
          page: overviewResponse?.page,
          total_pages: overviewResponse?.total_pages,
          task_status: overviewResponse?.task_status,
          base_url: overviewResponse?.base_url,
          ml_task_template_type: overviewResponse?.ml_task_template_type
            || inferOverviewTemplateType(normalizedItem, task.kind),
          ml_task_annotation_type: overviewResponse?.ml_task_annotation_type,
        } as MachineAnnotationDataResponse
      : {
          ...rawResponse,
          items: normalizedItem,
        } as MachineAnnotationDataResponse
    const templateType = response?.ml_task_template_type || inferOverviewTemplateType(normalizedItem, task.kind)
    const isImageClassificationTask = !!templateType
      && IMAGE_CLASSIFICATION_TEMPLATE_TYPES.includes(
        templateType as (typeof IMAGE_CLASSIFICATION_TEMPLATE_TYPES)[number],
      )
    const isTextClassificationTask = !!templateType
      && TEXT_CLASSIFICATION_TEMPLATE_TYPES.includes(
        templateType as (typeof TEXT_CLASSIFICATION_TEMPLATE_TYPES)[number],
      )
    const isEntityRecognitionTask = !!templateType
      && ENTITY_RECOGNITION_TEMPLATE_TYPES.includes(
        templateType as (typeof ENTITY_RECOGNITION_TEMPLATE_TYPES)[number],
      )
    const isImageWorkspaceTask = !!templateType
      && IMAGE_WORKSPACE_TEMPLATE_TYPES.includes(
        templateType as (typeof IMAGE_WORKSPACE_TEMPLATE_TYPES)[number],
      )

    if (!response?.items?.raw_data?.data) {
      return task
    }

    if (isImageClassificationTask || isTextClassificationTask) {
      const rawData = response.items.raw_data
      const annotation = Array.isArray(response.items.annotation) && response.items.annotation.every((item) => typeof item === 'number')
        ? response.items.annotation
        : undefined
      const rawAnnotations = Array.isArray(rawData.annotations) && rawData.annotations.every((item) => typeof item === 'number')
        ? rawData.annotations
        : undefined
      const selectedClassIds = resolveImageClassificationSource(
        annotation,
        rawAnnotations,
      )
      const pageItem: OnlineAnnotationPageItem = {
        id: response.items.row_number || 1,
        itemId: response.items.item_id ?? response.items.row_number ?? 1,
        text: rawData.data.content || rawData.data.text,
        image: buildImageUrl(rawData.data.image || '', response.base_url),
        imageWidth: rawData.data.width,
        imageHeight: rawData.data.height,
        selectedClassIds,
      }

      return {
        ...task,
        kind: isImageClassificationTask ? 'image-classification' : 'text-classification',
        title: task.title || task.task_name,
        labels: task.labels,
        pages: [pageItem],
      }
    }

    if (isEntityRecognitionTask) {
      const rawData = response.items.raw_data
      const text = rawData.data.content || rawData.data.text || ''
      const annotation = Array.isArray(response.items.annotation) && response.items.annotation.every((item) => item != null && typeof item === 'object' && 'offset' in item && 'tag' in item)
        ? response.items.annotation as EntityRecognitionPayloadItem[]
        : undefined
      const rawAnnotations = Array.isArray(rawData.annotations) && rawData.annotations.every((item) => item != null && typeof item === 'object' && 'offset' in item && 'tag' in item)
        ? rawData.annotations as EntityRecognitionPayloadItem[]
        : undefined
      const entitySpans = normalizeEntitySpans(
        text,
        resolveEntityRecognitionSource(annotation, rawAnnotations),
        mergedEntityLabelList,
      )
      const pageItem: OnlineAnnotationPageItem = {
        id: response.items.row_number || 1,
        itemId: response.items.item_id ?? response.items.row_number ?? 1,
        text,
        entitySpans,
      }

      return {
        ...task,
        kind: 'entity-recognition',
        title: task.title || task.task_name,
        labels: task.labels,
        pages: [pageItem],
      }
    }

    if (!isImageWorkspaceTask) {
      return task
    }

    const isSegmentationTask = SEGMENTATION_TEMPLATE_TYPES.includes(
      templateType as (typeof SEGMENTATION_TEMPLATE_TYPES)[number],
    )
    const kind = isSegmentationTask ? 'image-segmentation' : 'object-detection'

    const rawData = response.items.raw_data
    const maskAnnotation = templateType === 'instance_segmentation_mask'
      && response.items.annotation
      && !Array.isArray(response.items.annotation)
      && 'annotations' in response.items.annotation
      ? response.items.annotation.annotations
      : undefined
    const annotation = maskAnnotation
      ?? (
        Array.isArray(response.items.annotation) && response.items.annotation.every((item) => item != null && typeof item === 'object')
          ? response.items.annotation
          : undefined
      )
    const rawAnnotations = Array.isArray(rawData.annotations) && rawData.annotations.every((item) => item != null && typeof item === 'object')
      ? rawData.annotations
      : undefined
    const annotationSource = resolveImageAnnotationSource(
      annotation,
      rawAnnotations,
    )
    const pageItem: OnlineAnnotationPageItem = {
      id: response.items.row_number || 1,
      itemId: response.items.item_id ?? response.items.row_number ?? 1,
      image: buildImageUrl(rawData.data.image || '', response.base_url),
      imageWidth: rawData.data.width,
      imageHeight: rawData.data.height,
      annotations: annotationSource.map((item, index) => normalizeImageAnnotation(item, index)),
    }

    return {
      ...task,
      kind,
      title: task.title || task.task_name,
      labels: createIndexedLabels(
        Array.from(new Set(annotationSource.map((item) => item.class_id))).sort((a, b) => a - b),
      ),
      pages: [pageItem],
    }
  }, [task, taskData, mergedEntityLabelList, viewMode])

  const isWorkspaceTask = effectiveTask.kind === 'image-segmentation' || effectiveTask.kind === 'object-detection'
  const isClassificationTask = effectiveTask.kind === 'image-classification' || effectiveTask.kind === 'text-classification'
  const isEntityRecognitionTask = effectiveTask.kind === 'entity-recognition'
  const isPaginatedDetailTask = isWorkspaceTask || isClassificationTask || isEntityRecognitionTask

  const responsePagination = useMemo(() => {
    const response = taskData as MachineAnnotationDataResponse | { total?: number, total_pages?: number, page?: number } | undefined
    return {
      total: response?.total ?? 0,
      totalPages: response?.total_pages ?? 0,
      page: response?.page ?? currentPage,
    }
  }, [currentPage, taskData])

  const resolvedTaskLabels = useMemo(
    () => mergeLabelTaskApiResponse(taskLabelsData, effectiveTask.labels),
    [effectiveTask.labels, taskLabelsData],
  )

  const [labels, setLabels] = useState(resolvedTaskLabels)
  const [selectedClassIds, setSelectedClassIds] = useState<DetailPageSelectedClassIds>({})
  const [pageAnnotations, setPageAnnotations] = useState<Record<number, ImageAnnotationItem[]>>({})
  const [pageEntitySpans, setPageEntitySpans] = useState<DetailPageEntitySpans>({})
  const [segmentationDrawingTool, setSegmentationDrawingTool] = useState<SegmentationDrawingTool>('polygon')
  const resolvedTaskLabelsRef = useRef(resolvedTaskLabels)

  useEffect(() => {
    resolvedTaskLabelsRef.current = resolvedTaskLabels
    setLabels(resolvedTaskLabels)
  }, [resolvedTaskLabels])

  useEffect(() => {
    setSelectedClassIds(
      Object.fromEntries(effectiveTask.pages.map((page) => {
        const nextSelectedClassIds = page.selectedClassIds
          ?? (page.selectedLabel
            ? (() => {
                const labelIndex = resolvedTaskLabelsRef.current.findIndex((label) => label === page.selectedLabel)
                return labelIndex >= 0 ? [labelIndex] : []
              })()
            : [])
        return [page.id, filterClassificationClassIdsByLabels(resolvedTaskLabelsRef.current, nextSelectedClassIds)]
      })),
    )
    setPageAnnotations(
      Object.fromEntries(effectiveTask.pages.map((page) => [page.id, page.annotations ?? []])),
    )
    setPageEntitySpans((prev) => Object.fromEntries(effectiveTask.pages.map((page) => [
      page.id,
      prev[page.id] ?? filterEntitySpansByLabels(resolvedTaskLabelsRef.current, page.entitySpans),
    ])))
  }, [effectiveTask])

  useEffect(() => {
    setSelectedClassIds((prev) => {
      let changed = false
      const next: DetailPageSelectedClassIds = { ...prev }
      for (const pageId of Object.keys(next)) {
        const id = Number(pageId)
        const raw = next[id]
        const filtered = filterClassificationClassIdsByLabels(labels, raw)
        if (raw.length !== filtered.length || raw.some((v, i) => v !== filtered[i])) {
          next[id] = filtered
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [labels])

  useEffect(() => {
    setCurrentPage(1)
  }, [taskId])

  useEffect(() => {
    setStatusFilter('all')
  }, [isAuditMode, taskId])

  useEffect(() => {
    void fetchAnnotationConfig()
  }, [fetchAnnotationConfig])

  const currentItem = effectiveTask.pages[currentPage - 1] ?? effectiveTask.pages[0]
  const currentAnnotations = pageAnnotations[currentItem?.id] ?? []
  const currentSelectedClassIds = selectedClassIds[currentItem?.id] ?? []
  const currentEntitySpans = pageEntitySpans[currentItem?.id] ?? []
  const segmentationLabelOptions = useMemo(() => toSegmentationLabelOptions(labels), [labels])
  const labelSidebarOptions = useMemo(
    () => labels.reduce<typeof segmentationLabelOptions>((result, label, index) => {
      if (!label) return result
      result.push({
        label,
        value: index,
        color: getAnnotationColor(index),
      })
      return result
    }, []),
    [labels],
  )
  const isInitialLoading = !!taskId && taskDataLoading && !taskData
  const isPageLoading = !!taskId && taskDataFetching
  const classificationMode = useMemo<'single' | 'multiple'>(() => {
    const response = taskData as (MachineAnnotationDataResponse & {
      items?: MachineAnnotationItem | MachineAnnotationItem[]
    }) | undefined
    const templateType = response?.ml_task_template_type
      || inferOverviewTemplateType(
        getResponseItem(response?.items),
        task.kind,
      )
    return templateType === 'image_classification_multi_label'
      || templateType === 'text_classification_multi_label'
      ? 'multiple'
      : 'single'
  }, [task.kind, taskData])
  const notebookServiceFilters = useMemo(() => {
    const response = taskData as MachineAnnotationDataResponse | undefined

    return {
      templateType: response?.ml_task_template_type,
    }
  }, [taskData])
  const isPolygonWithHolesTemplate = notebookServiceFilters.templateType === 'instance_segmentation_mask'

  useEffect(() => {
    if (isPolygonWithHolesTemplate) {
      if (segmentationDrawingTool !== 'polygon' && segmentationDrawingTool !== 'hole' && segmentationDrawingTool !== 'region') {
        setSegmentationDrawingTool('polygon')
      }
      return
    }

    if (segmentationDrawingTool === 'hole' || segmentationDrawingTool === 'region') {
      setSegmentationDrawingTool('polygon')
    }
  }, [isPolygonWithHolesTemplate, segmentationDrawingTool])
  const paginationTotal = isPaginatedDetailTask
    ? responsePagination.total || responsePagination.totalPages || 1
    : effectiveTask.pages.length
  const currentRecord = getResponseItem((taskData as {
    items?: MachineAnnotationItem | MachineAnnotationItem[]
  } | undefined)?.items)
  const taskStatus = (taskData as MachineAnnotationDataResponse | undefined)?.task_status
  const isPassedAnnotatedLocked = currentRecord?.audit_result === 'passed' && currentRecord?.is_annotated === true
  const hasAuditResult = currentRecord?.audit_result != null
  const canEditLabelsByTaskStatus = taskStatus == null || EDITABLE_LABEL_TASK_STATUSES.has(taskStatus)
  const canManageLabels = isPaginatedDetailTask
    && viewMode !== 'overview'
    && !isAuditMode
    && !hasAuditResult
    && canEditLabelsByTaskStatus
  const isPageReadOnly = isReadOnly || isSubmitted
  const nonOnlineAuditLocksAnnotation = !isOnlineTabDetail
    && currentRecord?.audit_result != null
    && currentRecord.audit_result !== 'failed'
  const isAnnotationReadOnly = isPageReadOnly || isAuditMode || nonOnlineAuditLocksAnnotation
  const auditActionDisabled = auditSubmitting || (isReauditRound && currentRecord?.audit_result === 'passed')

  const tableColumns = useMemo(
    () => createDetailColumns(
      effectiveTask.kind,
      labels,
      selectedClassIds,
      setSelectedClassIds,
      classificationMode,
      isAnnotationReadOnly,
    ),
    [classificationMode, effectiveTask.kind, isAnnotationReadOnly, labels, selectedClassIds],
  )

  const goToPage = (page: number) => {
    const upperBound = isPaginatedDetailTask
      ? Math.max(responsePagination.totalPages, responsePagination.total, 1)
      : effectiveTask.pages.length
    const next = Math.min(Math.max(page, 1), upperBound)
    setCurrentPage(next)
  }

  const refreshAfterAuditAction = async (auditResult: 'passed' | 'failed') => {
    const shouldResetToFirstPage = isAuditMode
      && (statusFilter === 'unaudited' || (statusFilter === 'failed' && auditResult === 'passed'))

    if (shouldResetToFirstPage) {
      if (currentPage === 1) {
        await refetchTaskData()
      }
      else {
        goToPage(1)
      }
      return
    }

    if (currentPage < paginationTotal) {
      goToPage(currentPage + 1)
    }
    else {
      await refetchTaskData()
    }
  }

  const handleCreateLabel = async () => {
    if (isAnnotationReadOnly) return
    if (!taskId) return

    const tagName = newLabelName.trim()
    if (!tagName) {
      message.warning('请输入标签名')
      return
    }

    setCreatingLabel(true)
    try {
      if (editingLabel) {
        await labelTaskService.updateLabel(taskId, editingLabel.classId, {
          tag_name: tagName,
        }, bizType)

        setPageEntitySpans((prev) => Object.fromEntries(
          Object.entries(prev).map(([pageId, spans]) => [
            Number(pageId),
            spans.map((span) => (
              span.label === editingLabel.label ? { ...span, label: tagName } : span
            )),
          ]),
        ))
      }
      else {
        await labelTaskService.createLabel(taskId, {
          tag_name: tagName,
        }, bizType)
      }

      const latestTaskLabels = await refetchTaskLabels()
      setLabels(mergeLabelTaskApiResponse(latestTaskLabels.data, effectiveTask.labels))
      setAddLabelVisible(false)
      setNewLabelName('')
      setEditingLabel(null)
      message.success(editingLabel ? '编辑标签成功' : '新增标签成功')
    }
    catch (error) {
      // message.error(error instanceof Error ? error.message : editingLabel ? '编辑标签失败' : '新增标签失败')
    }
    finally {
      setCreatingLabel(false)
    }
  }

  const handleRemoveLabel = async (classId: number) => {
    if (isAnnotationReadOnly) return
    if (!taskId) return

    const labelName = labels[classId]
    setRemovingLabelId(classId)
    try {
      await labelTaskService.deleteLabel(taskId, classId, bizType)

      setLabels((prev) => {
        const next = [...prev]
        delete next[classId]
        return next
      })

      if (isWorkspaceTask) {
        setPageAnnotations((prev) => Object.fromEntries(
          Object.entries(prev).map(([pageId, annotations]) => [
            Number(pageId),
            annotations.filter((item) => item.class_id !== classId),
          ]),
        ))
      }

      if (isEntityRecognitionTask && labelName) {
        setPageEntitySpans((prev) => Object.fromEntries(
          Object.entries(prev).map(([pageId, spans]) => [
            Number(pageId),
            spans.filter((span) => span.label !== labelName),
          ]),
        ))
      }

      if (isClassificationTask) {
        setSelectedClassIds((prev) => Object.fromEntries(
          Object.entries(prev).map(([pageId, classIds]) => [
            Number(pageId),
            classIds.filter((item) => item !== classId),
          ]),
        ))
      }

      await refetchTaskLabels()
      message.success('删除标签成功，关联标注已一并删除')
    }
    catch (error) {
      message.error(error instanceof Error ? error.message : '删除标签失败')
    }
    finally {
      setRemovingLabelId(null)
    }
  }

  const handleSegmentationChange = (nextAnnotations: ImageAnnotationItem[]) => {
    if (isAnnotationReadOnly) return
    if (!currentItem) return
    setPageAnnotations((prev) => ({ ...prev, [currentItem.id]: nextAnnotations }))
  }

  const handleEntitySpansChange = (nextSpans: EntitySpanItem[]) => {
    if (isAnnotationReadOnly) return
    if (!currentItem) return
    setPageEntitySpans((prev) => ({
      ...prev,
      [currentItem.id]: filterEntitySpansByLabels(labels, nextSpans),
    }))
  }

  const handleOpenConfig = () => {
    if (isAnnotationReadOnly) return
    void fetchAnnotationConfig()
    setConfigVisible(true)
  }

  const handleAutoAnnotate = async () => {
    if (isAnnotationReadOnly) return
    if (!projectId) {
      message.warning('缺少项目 ID，无法发起自动标注')
      return
    }
    if (!taskId || !currentItem) return
    if (effectiveTask.kind !== 'image-segmentation' && effectiveTask.kind !== 'object-detection' && effectiveTask.kind !== 'image-classification' && effectiveTask.kind !== 'text-classification' && effectiveTask.kind !== 'entity-recognition') {
      message.warning('当前仅支持图像分割、物体检测、图像分类、文本分类和实体识别自动标注')
      return
    }
    if (!annotationConfig?.model_id) {
      message.warning('请先配置自动标注服务')
      return
    }
    if (annotationConfig.service_type !== 'online_annotation_service' && !annotationConfig.base_url) {
      message.warning('当前自动标注服务缺少预测地址，请重新选择并保存标注配置')
      return
    }

    const validLabels = labels.filter(Boolean)
    if (!validLabels.length) {
      message.warning('当前任务暂无可用标签')
      return
    }

    setAutoAnnotating(true)
    try {
      const predictData = effectiveTask.kind === 'image-segmentation' || effectiveTask.kind === 'object-detection' || effectiveTask.kind === 'image-classification'
        ? {
            image: toAbsoluteImageUrl(currentItem.image),
          }
        : effectiveTask.kind === 'text-classification' || effectiveTask.kind === 'entity-recognition'
          ? {
              text: currentItem.text || '',
            }
          : undefined
      if (
        (effectiveTask.kind === 'image-segmentation' || effectiveTask.kind === 'object-detection' || effectiveTask.kind === 'image-classification')
        && !predictData?.image
      ) {
        message.warning('当前数据缺少可用于自动标注的图像')
        return
      }
      if ((effectiveTask.kind === 'text-classification' || effectiveTask.kind === 'entity-recognition') && !predictData?.text) {
        message.warning('当前数据缺少可用于自动标注的文本')
        return
      }
      let predictLabelConfig = buildChoicesPredictLabelConfig(labels, {
        toName: effectiveTask.kind === 'text-classification' ? 'text' : 'image',
        fromName: effectiveTask.kind === 'text-classification' ? 'sentiment' : 'category',
        choiceMode: classificationMode,
        objectTag: effectiveTask.kind === 'text-classification' ? 'Text' : 'Image',
        valueKey: effectiveTask.kind === 'text-classification' ? 'text' : 'image',
      })
      if (effectiveTask.kind === 'image-segmentation') {
        predictLabelConfig = buildPredictLabelConfig(labels, 'image', 'label')
      }
      else if (effectiveTask.kind === 'object-detection') {
        predictLabelConfig = buildRectanglePredictLabelConfig(labels, {
          toName: 'image',
          fromName: 'label',
          valueKey: 'image',
        })
      }
      else if (effectiveTask.kind === 'entity-recognition') {
        predictLabelConfig = buildTextEntityPredictLabelConfig(labels, {
          toName: 'text',
          fromName: 'label',
          valueKey: 'text',
        })
      }

      const requestPayload = {
        tasks: [
          {
            id: currentItem.itemId ?? currentItem.id,
            data: predictData,
          },
        ],
        project_id: Number(projectId),
        ml_inference_task_id: Number(annotationConfig.model_id),
        predict_base_url: annotationConfig.base_url,
        project: String(projectId),
        label_config: predictLabelConfig,
      }

      const response = annotationConfig.service_type === 'online_annotation_service'
        ? await labelTaskService.predictOnlineAnnotationService(requestPayload)
        : await labelTaskService.predict(requestPayload)

      if (effectiveTask.kind === 'image-segmentation') {
        const { annotations: nextAnnotations, labels: nextLabels } = predictResponseToSegmentationAnnotations(
          response,
          labels,
          currentItem.imageWidth,
          currentItem.imageHeight,
        )

        if (!nextAnnotations.length) {
          message.warning('AI 未返回可显示的分割结果')
          return
        }

        if (nextLabels.some((label, index) => label !== labels[index])) {
          setLabels(nextLabels)
        }
        setPageAnnotations((prev) => ({ ...prev, [currentItem.id]: nextAnnotations }))
        message.success(`AI 自动标注完成，共生成 ${nextAnnotations.length} 个区域`)
        return
      }

      if (effectiveTask.kind === 'object-detection') {
        const { annotations: nextAnnotations, labels: nextLabels } = predictResponseToRectangleAnnotations(
          response,
          labels,
          currentItem.imageWidth,
          currentItem.imageHeight,
        )

        if (!nextAnnotations.length) {
          message.warning('AI 未返回可显示的检测框结果')
          return
        }

        if (nextLabels.some((label, index) => label !== labels[index])) {
          setLabels(nextLabels)
        }
        setPageAnnotations((prev) => ({ ...prev, [currentItem.id]: nextAnnotations }))
        message.success(`AI 自动标注完成，共生成 ${nextAnnotations.length} 个检测框`)
        return
      }

      if (effectiveTask.kind === 'entity-recognition') {
        const { entitySpans: nextEntitySpans, labels: nextLabels } = predictResponseToEntitySpans(
          response,
          labels,
          currentItem.text || '',
        )

        if (!nextEntitySpans.length) {
          message.warning('AI 未返回可用的实体识别结果')
          return
        }

        if (nextLabels.some((label, index) => label !== labels[index])) {
          setLabels(nextLabels)
        }
        setPageEntitySpans((prev) => ({ ...prev, [currentItem.id]: nextEntitySpans }))
        message.success(`AI 自动标注完成，共识别 ${nextEntitySpans.length} 个实体`)
        return
      }

      const { selectedClassIds: nextSelectedClassIds, labels: nextLabels } = predictResponseToChoiceSelection(
        response,
        labels,
      )

      if (!nextSelectedClassIds.length) {
        message.warning('AI 未返回可用的分类结果')
        return
      }

      if (nextLabels.some((label, index) => label !== labels[index])) {
        setLabels(nextLabels)
      }
      setSelectedClassIds((prev) => ({ ...prev, [currentItem.id]: nextSelectedClassIds }))
      message.success(`AI 自动标注完成，共识别 ${nextSelectedClassIds.length} 个标签`)
    }
    catch (error) {
      message.error(error instanceof Error ? error.message : 'AI 自动标注失败')
    }
    finally {
      setAutoAnnotating(false)
    }
  }

  const handleConfigConfirm = (config: MachineAnnotationConfig) => {
    setAnnotationConfig(config)
    void fetchAnnotationConfig()
  }

  const handleAuditPass = async () => {
    if (!projectId || !taskId || !currentItem || auditActionDisabled) return
    setAuditSubmitting(true)
    try {
      await labelTaskService.saveAudit(projectId, {
        task_id: taskId,
        row_number: currentItem.id,
        audit_result: 'passed',
        biz_type: bizType,
      })
      message.success('审核通过')
      await refreshAfterAuditAction('passed')
      await refetchCompletionStatus()
    }
    catch (error) {
      message.error(error instanceof Error ? error.message : '审核失败')
    }
    finally {
      setAuditSubmitting(false)
    }
  }

  const handleAuditFail = async () => {
    const reason = auditRejectReason.trim()
    if (!reason) {
      message.warning('请填写驳回原因')
      return
    }
    if (!projectId || !taskId || !currentItem || auditSubmitting) return
    setAuditSubmitting(true)
    try {
      await labelTaskService.saveAudit(projectId, {
        task_id: taskId,
        row_number: currentItem.id,
        audit_result: 'failed',
        reason,
        biz_type: bizType,
      })
      message.success('审核不通过')
      setAuditRejectVisible(false)
      setAuditRejectReason('')
      await refreshAfterAuditAction('failed')
      await refetchCompletionStatus()
    }
    catch (error) {
      message.error(error instanceof Error ? error.message : '审核失败')
    }
    finally {
      setAuditSubmitting(false)
    }
  }

  const handleSubmitAudit = async () => {
    if (!projectId || !taskId || auditSubmitLoading) return
    setAuditSubmitLoading(true)
    try {
      await labelTaskService.submitAuditTask(projectId, taskId, bizType)
      message.success('提交审核成功')
      await refetchCompletionStatus()
      onBack()
    }
    catch (error) {
      message.error(error instanceof Error ? error.message : '提交审核失败')
    }
    finally {
      setAuditSubmitLoading(false)
    }
  }

  const handleSaveAnnotation = async (isFinal: boolean) => {
    // if (isAnnotationReadOnly) return
    if (!taskId) return

    if (isWorkspaceTask) {
      const annotationsNeedLabel = isPolygonWithHolesTemplate
        ? currentAnnotations.filter((annotation) => annotation.segmentationMask?.regions.length)
        : currentAnnotations
      const unlabeledAnnotations = annotationsNeedLabel.filter(
        (annotation) => !isValidSegmentationClassId(labels, annotation.class_id),
      )
      if (unlabeledAnnotations.length > 0) {
        message.warning(`存在 ${unlabeledAnnotations.length} 个${isPolygonWithHolesTemplate ? '实例' : '区域'}未选择标签，请先补全后再完成标注`)
        return
      }
    }

    const annotationPayload = isClassificationTask
      ? filterClassificationClassIdsByLabels(labels, currentSelectedClassIds)
      : isEntityRecognitionTask
        ? filterEntitySpansByLabels(labels, currentEntitySpans).map((span) => {
            const tagIndex = labels.findIndex((label) => label === span.label)
            return {
              offset: span.offset,
              tag: tagIndex >= 0 ? String(tagIndex) : span.label,
            }
          })
        : serializeImageAnnotations(currentAnnotations, isPolygonWithHolesTemplate)

    if (!isFinal && !currentItem) return

    if (!isFinal && !annotationPayload.length) {
      message.warning('请先完成标注')
      return
    }

    const setLoading = isFinal ? setSubmitting : setSavingDraft
    setLoading(true)
    try {
      if (isMultiPerson && projectId) {
        if (isFinal) {
          await labelTaskService.submitAllMultiLabelAnnotation(projectId, taskId, bizType)
        }
        else {
          await labelTaskService.saveMultiLabelAnnotation(projectId, {
            task_id: taskId,
            row_number: currentItem.id,
            annotation: annotationPayload,
            biz_type: bizType,
          })
        }
      }
      else {
        const submitRowNumber = currentItem?.id
          ?? (isFinal ? await fetchFallbackSubmitRowNumber(taskId, bizType) : undefined)

        if (submitRowNumber == null) {
          throw new Error('当前没有可提交的数据')
        }

        await labelTaskService.save({
          task_id: taskId,
          row_number: submitRowNumber,
          annotation: isFinal ? undefined : annotationPayload,
          is_final: isFinal,
          biz_type: bizType,
        })
      }

      await refetchCompletionStatus()

      if (isFinal) {
        message.success('提交标注成功')
        await refetchTaskData()
        return
      }

      message.success('完成标注成功')
      if (currentPage < paginationTotal) {
        goToPage(currentPage + 1)
      }
      else {
        await refetchTaskData()
      }
    }
    catch (error) {
      message.error(error instanceof Error ? error.message : isFinal ? '提交标注失败' : '完成标注失败')
    }
    finally {
      setLoading(false)
    }
  }

  if (isInitialLoading) {
    return (
      <div className="flex h-[calc(100vh-132px)] items-center justify-center">
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-132px)] bg-white">
      <div className="flex h-full flex-col">
        <div className="flex min-h-0 flex-1 flex-col">
          <DetailHeader
            title={effectiveTask.title}
            savingDraft={savingDraft}
            autoAnnotating={autoAnnotating}
            isSubmitted={isSubmitted}
            isAuditMode={isAuditMode}
            useAuditStatusFilter={viewMode === 'overview'}
            hideFilter={viewMode === 'annotation' && !isAuditMode}
            readOnly={isPageReadOnly || isPassedAnnotatedLocked}
            auditSubmitting={auditSubmitting}
            auditActionDisabled={auditActionDisabled}
            auditResult={currentRecord?.audit_result}
            auditReason={currentRecord?.audit_reason}
            isOnlineTabDetail={isOnlineTabDetail}
            filterValue={statusFilter}
            onFilterChange={(value) => {
              setStatusFilter(value)
              setCurrentPage(1)
            }}
            onShowConfig={handleOpenConfig}
            onAutoAnnotate={() => {
              void handleAutoAnnotate()
            }}
            onComplete={() => {
              void handleSaveAnnotation(false)
            }}
            onBack={onBack}
            onAuditPass={() => {
              void handleAuditPass()
            }}
            onAuditFail={() => setAuditRejectVisible(true)}
          />

          <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)] gap-0">
            <LabelSidebar
              options={isWorkspaceTask ? segmentationLabelOptions : labelSidebarOptions}
              onAdd={() => {
                setEditingLabel(null)
                setNewLabelName('')
                setAddLabelVisible(true)
              }}
              onEdit={(option) => {
                if (creatingLabel) return
                setEditingLabel({
                  classId: option.value,
                  label: option.label,
                })
                setNewLabelName(option.label)
                setAddLabelVisible(true)
              }}
              onRemove={(classId) => {
                if (removingLabelId != null) return
                return handleRemoveLabel(classId)
              }}
              hideActions={isSubmitted || !canManageLabels || isAnnotationReadOnly}
            />

            <DetailContent
              isPageLoading={isPageLoading}
              kind={effectiveTask.kind}
              item={currentItem}
              readOnly={isAnnotationReadOnly}
              annotations={currentAnnotations}
              entitySpans={currentEntitySpans}
              labels={labels}
              polygonWithHoles={isPolygonWithHolesTemplate}
              drawingTool={segmentationDrawingTool}
              columns={tableColumns}
              onDrawingToolChange={setSegmentationDrawingTool}
              onSegmentationChange={handleSegmentationChange}
              onEntitySpansChange={handleEntitySpansChange}
            />
          </div>

          <div className="flex items-center justify-between border-t border-[#edf0f5] px-5 py-4">
            <Pagination
              current={currentPage}
              pageSize={1}
              total={paginationTotal}
              showSizeChanger={false}
              onChange={goToPage}
              showTotal={(total, range) => `显示第 ${range[0]}-${range[1]} 条，共 ${total} 条`}
            />
            {isAuditMode && !isSubmitted
              ? (
                  <Button
                    type="primary"
                    disabled={!isCompleted}
                    loading={auditSubmitLoading}
                    onClick={() => {
                      void handleSubmitAudit()
                    }}
                  >
                    提交审核
                  </Button>
                )
              : !isSubmitted && !isAuditMode && (
                  <Button
                    type="primary"
                    disabled={!isCompleted}
                    loading={submitting}
                    onClick={() => {
                      void handleSaveAnnotation(true)
                    }}
                  >
                    提交标注
                  </Button>
                )}
          </div>
        </div>
      </div>

      <DetailModals
        configVisible={configVisible}
        addLabelVisible={addLabelVisible}
        creatingLabel={creatingLabel}
        newLabelName={newLabelName}
        taskTemplateType={notebookServiceFilters.templateType}
        labelModalTitle={editingLabel ? '编辑标签' : '新增标签'}
        labelModalOkText={editingLabel ? '保存' : '确定'}
        taskId={taskId}
        initialConfig={annotationConfig}
        onCloseConfig={() => setConfigVisible(false)}
        onConfigConfirm={handleConfigConfirm}
        onCloseAddLabel={() => {
          if (creatingLabel) return
          setAddLabelVisible(false)
          setNewLabelName('')
          setEditingLabel(null)
        }}
        onNewLabelNameChange={setNewLabelName}
        onCreateLabel={() => {
          void handleCreateLabel()
        }}
      />
      <Modal
        title="审核不通过"
        open={auditRejectVisible}
        confirmLoading={auditSubmitting}
        onCancel={() => setAuditRejectVisible(false)}
        onOk={() => {
          void handleAuditFail()
        }}
        okText="确认"
        cancelText="取消"
      >
        <Input.TextArea
          value={auditRejectReason}
          onChange={(event) => setAuditRejectReason(event.target.value)}
          rows={4}
          placeholder="请输入驳回原因"
        />
      </Modal>
    </div>
  )
}

function toAbsoluteImageUrl(imageUrl?: string) {
  if (!imageUrl) return ''
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl
  if (typeof window === 'undefined') return imageUrl

  return new URL(imageUrl, window.location.origin).toString()
  // return new URL(imageUrl, 'https://deepexilab-test.deepexi.com/').toString()
}

export default OnlineAnnotationDetailPage
