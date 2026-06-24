import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Form, message } from 'antd'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import CreateMultiPersonAnnotationTask from '../dataAnnotation/CreateMultiPersonAnnotationTask'
import {
  createFallbackOnlineTaskDetail,
} from './constants'
import type { AnnotationTaskItem, MainTab, MultiSubTab, OnlineDatasetOption } from './types'
import AnnotationListContent from './components/AnnotationListContent'
import OnlineAnnotationDetailPage from './components/OnlineAnnotationDetailPage'
import OnlineCreateModal from './components/OnlineCreateModal'
import type { OnlineDatasetCascaderOption } from './components/OnlineCreateModal'
import { labelTaskService } from '@/services/dataAnnotationService'
import { machineDatamanagement } from '@/services/machineDatamanagement'
import type { ItemList } from '@/services/machineLearnModel'
import { TASK_TYPE_MAP, TASK_TYPE_TO_TEMPLATE_TYPES, TEMPLATE_TYPE_MAP } from '@/services/machineLearnModel'
import { paginationUtils } from '@/utils/paginationUtils'

interface DatasetCascaderOption extends OnlineDatasetCascaderOption {
  dataset?: ItemList
  versionItem?: ItemList
}

const DATASET_PAGE_SIZE = 100

function createTaskTypeOptions(): DatasetCascaderOption[] {
  return Object.entries(TASK_TYPE_MAP).map(([value, label]) => ({
    value,
    label,
    isLeaf: false,
  }))
}

const TEMPLATE_TYPE_KIND_MAP: Partial<Record<string, AnnotationTaskItem['kind']>> = {
  text_classification_single_label: 'text-classification',
  text_classification_multi_label: 'text-classification',
  entity_recognition: 'entity-recognition',
  image_classification_single_label: 'image-classification',
  image_classification_multi_label: 'image-classification',
  object_detection_bbox: 'object-detection',
  image_segmentation_instance: 'image-segmentation',
  semantic_segmentation: 'image-segmentation',
  instance_segmentation_mask: 'image-segmentation',
}

const ANNOTATION_TYPE_KIND_MAP: Partial<Record<string, AnnotationTaskItem['kind']>> = {
  text_classification: 'text-classification',
  entity_recognition: 'entity-recognition',
  image_classification: 'image-classification',
  object_detection: 'object-detection',
  image_segmentation: 'image-segmentation',
}

function mapTemplateTypeToKind(templateType?: string): AnnotationTaskItem['kind'] | undefined {
  return templateType ? TEMPLATE_TYPE_KIND_MAP[templateType] : undefined
}

function mapAnnotationTypeToKind(annotationType?: string): AnnotationTaskItem['kind'] | undefined {
  return annotationType ? ANNOTATION_TYPE_KIND_MAP[annotationType] : undefined
}

const MachineAnnotation: React.FC = () => {
  const { projectId, taskId } = useParams<{ projectId: string, taskId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [onlineCreateForm] = Form.useForm()
  const projectIdNum = Number(projectId)

  const isCreatePage = location.pathname.endsWith('/create')
  const detailSearchParams = new URLSearchParams(location.search)
  const detailFrom = detailSearchParams.get('from')
  const isAuditDetail = location.pathname.includes('/machine-annotation/review/')
  const isMultiPersonDetail = detailFrom === 'multi-person' && detailSearchParams.get('audit') !== '1'
  const isOverviewDetail = detailFrom === 'overview'
  const [mainTab, setMainTab] = useState<MainTab>('online')
  const [multiSubTab, setMultiSubTab] = useState<MultiSubTab>('overview')
  const [onlineCreateVisible, setOnlineCreateVisible] = useState(false)
  const [selectedOnlineDataset, setSelectedOnlineDataset] = useState<OnlineDatasetOption>()
  const [datasetCascaderOptions, setDatasetCascaderOptions] = useState<DatasetCascaderOption[]>(() => createTaskTypeOptions())
  const [deletingOnlineTaskId, setDeletingOnlineTaskId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [taskList, setTaskList] = useState<AnnotationTaskItem[]>([])
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewList, setOverviewList] = useState<AnnotationTaskItem[]>([])
  const [overviewPagination, setOverviewPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditList, setAuditList] = useState<AnnotationTaskItem[]>([])
  const [auditPagination, setAuditPagination] = useState({ current: 1, pageSize: 10, total: 0 })
  const [canAccessMultiLabelOverview, setCanAccessMultiLabelOverview] = useState<boolean | null>(null)
  const isDetailPage = Boolean(taskId) && !isCreatePage
  const currentDetailTask = useMemo(() => {
    const detailTaskId = taskId ? Number(taskId) : undefined
    const fallbackTask = createFallbackOnlineTaskDetail(detailTaskId)
    const stateTaskName = location.state?.taskName as string | undefined
    const stateTaskKind = location.state?.kind as AnnotationTaskItem['kind'] | undefined
    const stateTemplateType = location.state?.templateType as string | undefined
    const stateAnnotationType = location.state?.annotationType as string | undefined
    const derivedStateKind = stateTaskKind
      || mapTemplateTypeToKind(stateTemplateType)
      || mapAnnotationTypeToKind(stateAnnotationType)
    if (!detailTaskId) return fallbackTask

    const matchedTask = taskList.find((item) => item.id === detailTaskId)
      || overviewList.find((item) => item.id === detailTaskId)
      || auditList.find((item) => item.id === detailTaskId)
    if (!matchedTask) {
      return {
        ...fallbackTask,
        title: stateTaskName || fallbackTask.title,
        task_name: stateTaskName || fallbackTask.task_name,
        kind: derivedStateKind || fallbackTask.kind,
      }
    }

    return {
      ...fallbackTask,
      id: matchedTask.id,
      kind: matchedTask.kind
        || mapTemplateTypeToKind(matchedTask.template_type)
        || mapAnnotationTypeToKind(matchedTask.annotation_type)
        || derivedStateKind
        || fallbackTask.kind,
      title: matchedTask.task_name || fallbackTask.title,
      task_name: matchedTask.task_name || fallbackTask.task_name,
    }
  }, [auditList, location.state, overviewList, taskId, taskList])

  const buildNextVersion = useCallback((versions: ItemList[], fallbackVersion?: string) => {
    const versionCandidates = versions.length
      ? versions.map((item) => item.version)
      : fallbackVersion
        ? [fallbackVersion]
        : []
    if (!versionCandidates.length) return 'V1'

    const maxVersion = versionCandidates.reduce((max, version) => {
      const match = version?.match(/^V?(\d+)$/i)
      const current = match ? Number(match[1]) : 0
      return Math.max(max, current)
    }, 0)

    return `V${maxVersion + 1}`
  }, [])

  useEffect(() => {
    if (!onlineCreateVisible) return
    setDatasetCascaderOptions(createTaskTypeOptions())
  }, [onlineCreateVisible])

  const loadDatasetOptions = useCallback(async (selectedOptions: DatasetCascaderOption[]) => {
    const targetOption = selectedOptions[selectedOptions.length - 1]
    if (!targetOption || targetOption.loading || targetOption.children) return
    if (!projectId || Number.isNaN(projectIdNum)) return

    targetOption.loading = true
    setDatasetCascaderOptions((prev) => [...prev])

    try {
      if (selectedOptions.length === 1) {
        const taskType = String(targetOption.value)
        const templates = TASK_TYPE_TO_TEMPLATE_TYPES[taskType] ?? []
        targetOption.children = templates.length
          ? templates.map((templateType) => ({
              value: templateType,
              label: TEMPLATE_TYPE_MAP[templateType] ?? templateType,
              isLeaf: false,
            }))
          : [{
              value: '__no_template__',
              label: '暂无可用模板',
              isLeaf: true,
              disabled: true,
            }]
      }
      else if (selectedOptions.length === 2) {
        const taskType = String(selectedOptions[0].value)
        const templateType = String(targetOption.value)
        const response = await machineDatamanagement.getMachineDatasetList(
          projectIdNum,
          1,
          DATASET_PAGE_SIZE,
          taskType,
          undefined,
          templateType,
          undefined,
          1,
        )
        const items = response.items ?? []
        targetOption.children = items.length
          ? items.map((item) => ({
              value: `ds-${item.id}`,
              label: item.name || `数据集 ${item.id}`,
              isLeaf: false,
              dataset: item,
            }))
          : [{
              value: '__no_dataset__',
              label: '暂无可用数据集',
              isLeaf: true,
              disabled: true,
            }]
      }
      else if (selectedOptions.length === 3) {
        const dataset = targetOption.dataset
        if (!dataset) return

        const versions = await machineDatamanagement.getDatasetVersion(projectIdNum, dataset.id, undefined, 1)
        targetOption.children = versions.length ? versions.map((item) => ({ value: item.id, label: item.version || `版本 ${item.id}`, isLeaf: true, versionItem: item })) : [{ value: '__no_version__', label: '暂无可用版本', isLeaf: true, disabled: true }]
      }
      else {
        targetOption.children = []
      }
    }
    catch (error) {
      targetOption.children = [{
        value: '__load_error__',
        label: '加载版本失败，请重试',
        isLeaf: true,
        disabled: true,
      }]
      message.error(error instanceof Error ? error.message : '加载数据集版本失败')
    }
    finally {
      targetOption.loading = false
      setDatasetCascaderOptions((prev) => [...prev])
    }
  }, [projectId, projectIdNum])

  const buildSelectedDataset = useCallback((
    taskType: string,
    templateType: string,
    dataset: ItemList,
    versionItem: ItemList,
    versions: ItemList[],
  ) => {
    const nextVersion = buildNextVersion(versions, versionItem.version || dataset.version)
    return {
      value: String(versionItem.id),
      label: versionItem.version ? `${dataset.name} / ${versionItem.version}` : dataset.name,
      total: versionItem.sample_count ?? dataset.sample_count ?? 0,
      nextVersion: dataset.name ? `${dataset.name}-${nextVersion}` : nextVersion,
      taskType,
      templateType,
      datasetId: dataset.id,
      versionId: versionItem.id,
      version: versionItem.version || '',
      name: dataset.name,
      cascaderValue: [taskType, templateType, `ds-${dataset.id}`, versionItem.id],
    }
  }, [buildNextVersion])

  const handleBack = () => {
    navigate(`/project/${projectId}/machine-annotation`)
  }

  const handleCreate = () => {
    if (mainTab === 'online') {
      setOnlineCreateVisible(true)
      return
    }
    navigate(`/project/${projectId}/machine-annotation/create`)
  }

  const fetchTaskList = useCallback(async (page: number = 1, size: number = 10) => {
    if (!projectId) return
    setLoading(true)
    try {
      let response: { total: number, items: AnnotationTaskItem[] }
      if (mainTab === 'multi-person') {
        response = await labelTaskService.getMultiLabelAnnotationTaskList({
          project_id: Number(projectId),
          biz_type: 'machine_learning',
          page,
          size,
        })
      }
      else {
        response = await labelTaskService.getList({
          project_id: Number(projectId),
          task_type: 'online',
          page,
          size,
          biz_type: 'machine_learning',
        })
      }
      await paginationUtils.handlePaginatedResponse({
        page,
        size,
        response,
        setList: setTaskList,
        setPagination,
        refetch: fetchTaskList,
      })
    }
    catch (error) {
      setTaskList([])
      message.error(error instanceof Error ? error.message : '获取任务列表失败')
    }
    finally {
      setLoading(false)
    }
  }, [projectId, mainTab])

  const fetchOverview = useCallback(async (page: number = 1, size: number = 10) => {
    if (!projectId) return
    setOverviewLoading(true)
    try {
      const response = await labelTaskService.getMultiLabelTaskOverview({
        project_id: Number(projectId),
        biz_type: 'machine_learning',
        page,
        size,
      })
      await paginationUtils.handlePaginatedResponse<AnnotationTaskItem>({
        page,
        size,
        response: {
          items: (response?.items ?? []) as AnnotationTaskItem[],
          total: response?.total,
        },
        setList: setOverviewList,
        setPagination: setOverviewPagination,
        refetch: fetchOverview,
      })
    }
    catch (error) {
      setOverviewList([])
      message.error(error instanceof Error ? error.message : '获取任务总览失败')
    }
    finally {
      setOverviewLoading(false)
    }
  }, [projectId])

  const fetchAudit = useCallback(async (page: number = 1, size: number = 10) => {
    if (!projectId) return
    setAuditLoading(true)
    try {
      const response = await labelTaskService.getMultiLabelAuditTaskList({
        project_id: Number(projectId),
        biz_type: 'machine_learning',
        page,
        size,
      })
      await paginationUtils.handlePaginatedResponse<AnnotationTaskItem>({
        page,
        size,
        response: {
          items: (response?.items ?? []) as AnnotationTaskItem[],
          total: response?.total,
        },
        setList: setAuditList,
        setPagination: setAuditPagination,
        refetch: fetchAudit,
      })
    }
    catch (error) {
      setAuditList([])
      message.error(error instanceof Error ? error.message : '获取审核任务失败')
    }
    finally {
      setAuditLoading(false)
    }
  }, [projectId])

  const fetchMultiLabelAdminAccess = useCallback(async () => {
    if (!projectId) return
    try {
      const response = await labelTaskService.getMultiLabelAdminAccess(Number(projectId), 'machine_learning')
      setCanAccessMultiLabelOverview(Boolean(response?.can_access))
    }
    catch {
      setCanAccessMultiLabelOverview(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId || isCreatePage || isDetailPage) return
    fetchMultiLabelAdminAccess()
  }, [fetchMultiLabelAdminAccess, isCreatePage, isDetailPage, projectId])

  useEffect(() => {
    if (mainTab !== 'multi-person') return
    if (canAccessMultiLabelOverview == null) return
    if (canAccessMultiLabelOverview || multiSubTab !== 'overview') return

    setMultiSubTab('task')
  }, [canAccessMultiLabelOverview, mainTab, multiSubTab])

  useEffect(() => {
    if (!projectId || isCreatePage) return
    fetchTaskList(1, pagination.pageSize)
    if (isDetailPage) return
    if (mainTab === 'multi-person') {
      if (canAccessMultiLabelOverview) {
        fetchOverview(1, overviewPagination.pageSize)
      }
      fetchAudit(1, auditPagination.pageSize)
    }
  }, [
    projectId,
    mainTab,
    isCreatePage,
    isDetailPage,
    fetchTaskList,
    fetchOverview,
    fetchAudit,
    canAccessMultiLabelOverview,
    pagination.pageSize,
    overviewPagination.pageSize,
    auditPagination.pageSize,
  ])

  const refreshMultiPersonTab = useCallback((tab: MultiSubTab) => {
    if (tab === 'overview') {
      if (canAccessMultiLabelOverview) {
        fetchOverview(overviewPagination.current, overviewPagination.pageSize)
      }
      return
    }

    if (tab === 'task') {
      fetchTaskList(pagination.current, pagination.pageSize)
      return
    }

    fetchAudit(auditPagination.current, auditPagination.pageSize)
  }, [fetchAudit, auditPagination, canAccessMultiLabelOverview, fetchOverview, overviewPagination, fetchTaskList, pagination])

  const handleMultiSubTabChange = useCallback((tab: MultiSubTab) => {
    setMultiSubTab(tab)
    refreshMultiPersonTab(tab)
  }, [refreshMultiPersonTab])

  const handleRefresh = useCallback(() => {
    if (mainTab === 'multi-person') {
      refreshMultiPersonTab(multiSubTab)
      return
    }
    fetchTaskList(pagination.current, pagination.pageSize)
  }, [
    mainTab,
    multiSubTab,
    fetchTaskList,
    pagination,
    refreshMultiPersonTab,
  ])

  const handleViewDetail = useCallback((id: number) => {
    const targetTask = taskList.find((item) => item.id === id)
    const fallbackTask = createFallbackOnlineTaskDetail(id)
    const taskName = targetTask?.task_name || fallbackTask.task_name
    navigate(`/project/${projectId}/machine-annotation/${id}`, {
      state: {
        taskName,
      },
    })
  }, [navigate, projectId, taskList])

  const inferContentTabFromRecord = useCallback((record: AnnotationTaskItem): 'text' | 'image' => {
    const datasetType = (record as AnnotationTaskItem & {
      dataset?: { dataset_type?: string }
    }).dataset_type
    ?? (record as AnnotationTaskItem & { dataset?: { dataset_type?: string } }).dataset?.dataset_type
    ?? record.source_dataset_type

    return datasetType === 'image-understanding' ? 'image' : 'text'
  }, [])

  const handleViewOverviewDetail = useCallback((id: number) => {
    const record = overviewList.find((item) => item.id === id)
    if (!record) return
    const kind = record.kind
      || mapTemplateTypeToKind(record.template_type)
      || mapAnnotationTypeToKind(record.annotation_type)
    const params = new URLSearchParams({
      from: 'overview',
      sub_tab: multiSubTab,
      biz_type: 'machine_learning',
    })
    navigate(`/project/${projectId}/machine-annotation/${id}?${params.toString()}`, {
      state: {
        taskName: record.task_name,
        kind,
        templateType: record.template_type,
        annotationType: record.annotation_type,
      },
    })
  }, [multiSubTab, navigate, overviewList, projectId])

  const handleViewTaskMembers = useCallback((id: number) => {
    const record = overviewList.find((item) => item.id === id)
    const params = new URLSearchParams({
      from: 'machine-annotation',
      sub_tab: multiSubTab,
      biz_type: 'machine_learning',
    })
    navigate(`/project/${projectId}/machine-annotation/task-members/${id}?${params.toString()}`, {
      state: {
        taskName: record?.task_name,
      },
    })
  }, [multiSubTab, navigate, overviewList, projectId])

  const handleViewAuditDetail = useCallback((id: number) => {
    const record = auditList.find((item) => item.id === id)
    if (!record) return
    const content = inferContentTabFromRecord(record)
    const params = new URLSearchParams({
      from: 'multi-person',
      audit: '1',
      content,
      sub_tab: 'review',
      biz_type: 'machine_learning',
    })
    navigate(`/project/${projectId}/machine-annotation/review/${id}?${params.toString()}`, {
      state: {
        taskName: record.task_name,
        kind: record.kind,
        contentTab: content,
        isMultiPerson: true,
        isAuditMode: true,
        bizType: 'machine_learning',
      },
    })
  }, [auditList, inferContentTabFromRecord, navigate, projectId])

  const handleViewMultiTaskDetail = useCallback((id: number) => {
    const record = taskList.find((item) => item.id === id)
    if (!record) return
    const content = inferContentTabFromRecord(record)
    const params = new URLSearchParams({
      from: 'multi-person',
      content,
      sub_tab: 'task',
      biz_type: 'machine_learning',
    })
    navigate(`/project/${projectId}/machine-annotation/${id}?${params.toString()}`, {
      state: {
        taskName: record.task_name,
        contentTab: content,
        isMultiPerson: true,
        bizType: 'machine_learning',
      },
    })
  }, [inferContentTabFromRecord, navigate, projectId, taskList])

  const handleDeleteMultiTask = useCallback(async (id: number) => {
    if (!projectId) return
    try {
      await labelTaskService.deleteMultiLabelTask(Number(projectId), id, 'machine_learning')
      message.success('删除成功')
      await paginationUtils.refreshAfterDelete({
        pagination: overviewPagination,
        fetchList: fetchOverview,
      })
    }
    catch (error) {
      message.error(error instanceof Error ? error.message : '删除失败')
    }
  }, [fetchOverview, overviewPagination, projectId])

  const [publishingTaskId, setPublishingTaskId] = useState<number | null>(null)
  const handlePublishMultiTask = useCallback(async (id: number) => {
    if (!projectId) return
    setPublishingTaskId(id)
    try {
      await labelTaskService.publishMultiLabelTask(Number(projectId), id, 'machine_learning')
      message.success('发布成功')
      await Promise.all([
        fetchOverview(overviewPagination.current, overviewPagination.pageSize),
        fetchTaskList(pagination.current, pagination.pageSize),
      ])
    }
    catch (error) {
      message.error(error instanceof Error ? error.message : '发布失败')
    }
    finally {
      setPublishingTaskId(null)
    }
  }, [fetchOverview, fetchTaskList, overviewPagination, pagination, projectId])

  const handleDeleteOnlineTask = useCallback(async (id: number) => {
    setDeletingOnlineTaskId(id)
    try {
      await labelTaskService.delete(id, 'machine_learning')
      message.success('删除成功')
      await paginationUtils.refreshAfterDelete({
        pagination,
        fetchList: fetchTaskList,
      })
    }
    catch (error) {
      message.error(error instanceof Error ? error.message : '删除失败')
    }
    finally {
      setDeletingOnlineTaskId(null)
    }
  }, [fetchTaskList, pagination])

  const handleOnlineCreateCancel = () => {
    onlineCreateForm.resetFields()
    setSelectedOnlineDataset(undefined)
    setDatasetCascaderOptions(createTaskTypeOptions())
    setOnlineCreateVisible(false)
  }

  const handleOnlineCreateSubmit = async () => {
    if (!datasetCascaderOptions.length) {
      message.warning('当前没有可用的数据管理数据集')
      return
    }
    if (!projectId || Number.isNaN(projectIdNum)) {
      message.error('项目 ID 不存在')
      return
    }
    if (!selectedOnlineDataset) {
      message.warning('请选择数据集版本')
      return
    }

    try {
      const values = await onlineCreateForm.validateFields()
      setCreateSubmitting(true)
      await labelTaskService.create({
        task_type: 'online',
        task_name: values.task_name.trim(),
        dataset_name: selectedOnlineDataset.nextVersion,
        dataset_description: '',
        biz_type: 'machine_learning',
        project_id: projectIdNum,
        source: 'existed_dataset',
        source_dataset_id: selectedOnlineDataset.versionId,
        override: values.override === 'override',
      })
      message.success('创建标注任务成功')
      handleOnlineCreateCancel()
      fetchTaskList(1, pagination.pageSize)
    }
    catch (error) {
      if (error instanceof Error) {
        message.error(error.message)
      }
    }
    finally {
      setCreateSubmitting(false)
    }
  }

  const handleDatasetChange = useCallback(async (
    value: Array<string | number>,
    selectedOptions?: OnlineDatasetCascaderOption[],
  ) => {
    if (!value?.length || !selectedOptions || selectedOptions.length !== 4) {
      setSelectedOnlineDataset(undefined)
      return
    }

    const [taskTypeOption, templateTypeOption, datasetOption, versionOption] = selectedOptions as DatasetCascaderOption[]
    const dataset = datasetOption.dataset
    const versionItem = versionOption.versionItem
    if (!dataset || !versionItem) {
      setSelectedOnlineDataset(undefined)
      return
    }

    try {
      const versions = await machineDatamanagement.getDatasetVersion(projectIdNum, dataset.id, undefined, 1)
      setSelectedOnlineDataset(buildSelectedDataset(
        String(taskTypeOption.value),
        String(templateTypeOption.value),
        dataset,
        versionItem,
        versions,
      ))
    }
    catch (error) {
      setSelectedOnlineDataset(undefined)
      message.error(error instanceof Error ? error.message : '获取版本信息失败')
    }
  }, [buildSelectedDataset, projectIdNum])

  const selectedDatasetValue = useMemo(() => {
    if (!selectedOnlineDataset) return undefined
    return selectedOnlineDataset.cascaderValue
  }, [selectedOnlineDataset])

  useEffect(() => {
    if (!onlineCreateVisible) return
    onlineCreateForm.setFieldValue('selected_dataset', selectedDatasetValue)
  }, [onlineCreateForm, onlineCreateVisible, selectedDatasetValue])

  if (isCreatePage) {
    return (
      <CreateMultiPersonAnnotationTask
        projectId={projectId}
        backPath={`/project/${projectId}/machine-annotation`}
        bizType="machine_learning"
      />
    )
  }

  if (isDetailPage) {
    const stateTaskName = location.state?.taskName as string | undefined
    return (
      <OnlineAnnotationDetailPage
        projectId={projectIdNum}
        taskId={taskId ? Number(taskId) : undefined}
        bizType="machine_learning"
        isMultiPerson={isMultiPersonDetail || isAuditDetail}
        isAuditMode={isAuditDetail}
        isOnlineTabDetail={!isMultiPersonDetail && !isAuditDetail && !isOverviewDetail}
        viewMode={isOverviewDetail ? 'overview' : 'annotation'}
        task={stateTaskName
          ? {
              ...currentDetailTask,
              title: stateTaskName,
              task_name: stateTaskName,
            }
          : currentDetailTask}
        onBack={handleBack}
      />
    )
  }

  return (
    <>
      <AnnotationListContent
        showOverviewTab={canAccessMultiLabelOverview}
        mainTab={mainTab}
        multiSubTab={multiSubTab}
        taskList={taskList}
        loading={loading}
        pagination={pagination}
        overviewList={overviewList}
        overviewLoading={overviewLoading}
        overviewPagination={overviewPagination}
        auditList={auditList}
        auditLoading={auditLoading}
        auditPagination={auditPagination}
        onMainTabChange={setMainTab}
        onMultiSubTabChange={handleMultiSubTabChange}
        onRefresh={handleRefresh}
        onCreate={handleCreate}
        onTaskPageChange={fetchTaskList}
        onOverviewPageChange={fetchOverview}
        onAuditPageChange={fetchAudit}
        onViewDetail={mainTab === 'multi-person' ? handleViewMultiTaskDetail : handleViewDetail}
        onViewOverviewDetail={handleViewOverviewDetail}
        onViewAuditDetail={handleViewAuditDetail}
        onViewTaskMembers={handleViewTaskMembers}
        onDeleteOnlineTask={handleDeleteOnlineTask}
        onDeleteMultiTask={handleDeleteMultiTask}
        onPublishMultiTask={handlePublishMultiTask}
        deletingOnlineTaskId={deletingOnlineTaskId}
        publishingTaskId={publishingTaskId}
      />
      <OnlineCreateModal
        form={onlineCreateForm}
        open={onlineCreateVisible}
        submitLoading={createSubmitting}
        datasetOptions={datasetCascaderOptions}
        selectedDataset={selectedOnlineDataset}
        onCancel={handleOnlineCreateCancel}
        onLoadDatasetOptions={loadDatasetOptions}
        onDatasetChange={handleDatasetChange}
        onSubmit={handleOnlineCreateSubmit}
      />
    </>
  )
}

export default MachineAnnotation
