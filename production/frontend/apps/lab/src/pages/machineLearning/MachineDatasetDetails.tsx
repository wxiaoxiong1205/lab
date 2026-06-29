import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftOutlined, DeleteOutlined, DownOutlined, DownloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Descriptions, Dropdown, Popconfirm, Spin, Tag, Typography, message } from 'antd'
import type { MenuProps } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import TextTabDetails from './TextTabDetails'
import ImageTabDetails from './ImageTabDetails'
import AddVersionModal from './AddVersionModal'
import type { AddVersionFormValues } from './AddVersionModal'
import { machineDatamanagement } from '@/services/machineDatamanagement'
import { downloadBlobFile, extractFilenameFromHeaders, getContentType, processFilenameExtension } from '@/utils/download'
import type { CreateDatasetRequest, DatasetAsyncExportResponse, DatasetDetailsResponse, ItemDetail, ItemList } from '@/services/machineLearnModel'
import { DATASET_CATEGORY_MAP, TASK_TYPE_MAP, TEMPLATE_TYPE_MAP } from '@/services/machineLearnModel'
import { isDatasetCreateSucceeded } from '@/utils/datasetStatus'

const PAGE_SIZE = 10
const DELETE_ROW_POLL_INTERVAL = 2500
const { Paragraph, Text } = Typography

const MachineDatasetDetails: React.FC = () => {
  const { projectId, datasetId } = useParams<{ projectId: string, datasetId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const projectIdNum = Number(projectId)
  const datasetIdNum = Number(datasetId)

  const [selectedVersionId, setSelectedVersionId] = useState<number>(datasetIdNum)
  const [page, setPage] = useState<number>(1)
  const [addVersionModalOpen, setAddVersionModalOpen] = useState(false)
  const [editingBasicField, setEditingBasicField] = useState<'name' | 'description' | null>(null)
  const [publishingVersionId, setPublishingVersionId] = useState<number | null>(null)
  const [deletingRowNumber, setDeletingRowNumber] = useState<number | null>(null)
  const [dismissedOperationIds, setDismissedOperationIds] = useState<Set<string>>(new Set())
  // 拉取版本列表时使用的 id（删除当前版本后改为剩余版本 id，避免用已删除 id 请求报错）
  const [versionListKeyId, setVersionListKeyId] = useState<number>(datasetIdNum)

  useEffect(() => {
    setVersionListKeyId(datasetIdNum)
  }, [datasetIdNum])

  // 获取版本列表（用于左侧版本选择）
  const versionsRef = useRef<ItemList[]>([])
  const {
    data: versions,
  } = useQuery<ItemList[]>({
    queryKey: ['machine-dataset-versions', projectIdNum, versionListKeyId],
    queryFn: () => machineDatamanagement.getDatasetVersion(projectIdNum, versionListKeyId),
    enabled: !!projectIdNum && !!versionListKeyId && !Number.isNaN(projectIdNum) && !Number.isNaN(versionListKeyId),
  })

  useEffect(() => {
    versionsRef.current = versions ?? []
  }, [versions])

  // 初始化/纠正选中版本（如果 URL id 不在版本列表里，则默认选最新的第一项）
  useEffect(() => {
    if (!versions?.length) return
    const hasSelected = versions.some((v) => v.id === selectedVersionId)
    if (!hasSelected) {
      setSelectedVersionId(versions[0].id)
      setPage(1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions])

  const {
    data: datasetDetail,
    isLoading: detailsLoading,
    refetch: refetchDatasetDetail,
  } = useQuery<DatasetDetailsResponse>({
    queryKey: ['machine-dataset-details', projectIdNum, selectedVersionId, page, PAGE_SIZE],
    queryFn: () => machineDatamanagement.getDatasetDetails(projectIdNum, selectedVersionId, page, PAGE_SIZE),
    enabled: !!projectIdNum && !!selectedVersionId && !Number.isNaN(projectIdNum) && !Number.isNaN(selectedVersionId),
    gcTime: 0,
  })

  const { data: exportFormatsMap } = useQuery({
    queryKey: ['machine-dataset-export-formats'],
    queryFn: () => machineDatamanagement.getDatasetExportFormats(),
  })

  const labelSchema = datasetDetail?.label_schema || {}
  const labelSchemaKeys = Object.values(labelSchema)

  const items = datasetDetail?.items ?? []
  const total = datasetDetail?.total ?? 0

  const datasetCategory = datasetDetail?.data_type
  const datasetCategoryLabel = DATASET_CATEGORY_MAP[datasetCategory as string]
  const taskTypeKey = datasetDetail?.task_type || ''
  const taskTypeLabel = TASK_TYPE_MAP[taskTypeKey] ?? (taskTypeKey || '-')
  const templateTypeLabel = TEMPLATE_TYPE_MAP[datasetDetail?.template_type] || '-'
  const createdByLabel = datasetDetail?.created_by || '-'
  const date = new Date(datasetDetail?.updated_at)
  const localDateStr = date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const createdAtLabel = localDateStr || '-'
  const descriptionLabel = datasetDetail?.description || '-'
  const publishDisplay = datasetDetail?.publish_display || '-'
  const isSelectedVersionUnpublished = Boolean(publishDisplay && publishDisplay !== '已发布')
  const activeDeleteOperation = datasetDetail?.active_operation?.operation_type === 'delete_rows'
    ? datasetDetail.active_operation
    : undefined
  const isActiveDeleteOperationRunning = activeDeleteOperation?.status === 'queued' || activeDeleteOperation?.status === 'running'
  const isActiveDeleteOperationFailed = activeDeleteOperation?.status === 'failed'
  const isFailedOperationDismissed = Boolean(
    activeDeleteOperation?.operation_id && dismissedOperationIds.has(activeDeleteOperation.operation_id),
  )
  const activeDeleteRequestedCount = activeDeleteOperation?.requested_count
    || activeDeleteOperation?.row_numbers?.length
    || 1
  const activeDeleteRemovedCount = activeDeleteOperation?.removed_count || 0
  const activeDeleteFailedCount = Math.max(activeDeleteRequestedCount - activeDeleteRemovedCount, 0)
  const activeDeleteRowNumbers = useMemo(
    () => new Set((isActiveDeleteOperationRunning ? activeDeleteOperation?.row_numbers || [] : []).map(Number)),
    [activeDeleteOperation?.row_numbers, isActiveDeleteOperationRunning],
  )
  const failedDeleteRowNumbers = useMemo(
    () => new Set((isActiveDeleteOperationFailed ? activeDeleteOperation?.row_numbers || [] : []).map(Number)),
    [activeDeleteOperation?.row_numbers, isActiveDeleteOperationFailed],
  )
  const isVersionOperationLocked = deletingRowNumber !== null || isActiveDeleteOperationRunning
  const renderDataDetailTitle = () => {
    const title = <span className="shrink-0">数据详情</span>

    if (isActiveDeleteOperationRunning) {
      return (
        <div className="flex flex-wrap items-center gap-3">
          {title}
          <Alert
            type="warning"
            showIcon
            className="min-w-[360px] max-w-full flex-1 !border-l-4 !border-amber-400 !bg-amber-50 !py-2 !px-3 !shadow-sm"
            message={(
              <span className="font-medium">
                {`版本操作状态：删除中。正在删除 ${activeDeleteRequestedCount} 条数据，数据集较大时可能需要几分钟。你可以离开页面，回来后会继续展示处理状态。`}
              </span>
            )}
          />
        </div>
      )
    }

    if (isActiveDeleteOperationFailed && !isFailedOperationDismissed) {
      return (
        <div className="flex flex-wrap items-center gap-3">
          {title}
          <Alert
            type="error"
            showIcon
            className="min-w-[360px] max-w-full flex-1 !border-l-4 !border-red-400 !bg-red-50 !py-2 !px-3 !shadow-sm"
            message={(
              <span className="font-medium">
                {`版本操作状态：删除失败。已成功 ${activeDeleteRemovedCount} 条，已失败 ${activeDeleteFailedCount} 条。${activeDeleteOperation?.error_message || '目标数据已变化，请刷新后重试'}`}
              </span>
            )}
            action={(
              <div className="flex gap-2">
                <Button size="small" danger onClick={handleRetryDeleteRows}>
                  重试删除
                </Button>
                <Button size="small" onClick={handleDismissOperationAlert}>
                  关闭提示
                </Button>
              </div>
            )}
          />
        </div>
      )
    }

    return title
  }
  useEffect(() => {
    if (!isActiveDeleteOperationRunning) return

    const rowNumbers = activeDeleteOperation?.row_numbers || []
    const timer = window.setInterval(async () => {
      const result = await refetchDatasetDetail()
      const latestOperation = result.data?.active_operation?.operation_type === 'delete_rows'
        ? result.data.active_operation
        : undefined

      if (latestOperation?.status === 'queued' || latestOperation?.status === 'running') return

      window.clearInterval(timer)
      if (latestOperation?.status === 'failed') {
        return
      }

      message.success('删除完成')
      const nextPage = items.length <= rowNumbers.length && page > 1 ? page - 1 : page
      if (nextPage !== page) {
        setPage(nextPage)
      }
      else {
        await refetchDatasetDetail()
      }
      queryClient.invalidateQueries({ queryKey: ['machine-dataset-list'] })
      queryClient.invalidateQueries({ queryKey: ['machine-dataset-versions', projectIdNum, versionListKeyId] })
    }, DELETE_ROW_POLL_INTERVAL)

    return () => window.clearInterval(timer)
  }, [
    activeDeleteOperation?.operation_id,
    activeDeleteOperation?.row_numbers,
    isActiveDeleteOperationRunning,
    items.length,
    page,
    projectIdNum,
    queryClient,
    refetchDatasetDetail,
    versionListKeyId,
  ])

  const isVersionUnpublished = (versionItem: Pick<ItemList, 'publish_display' | 'status_display'> | DatasetDetailsResponse | undefined) => {
    if (!versionItem) return false
    const display = versionItem.status_display || versionItem.publish_display
    if (display !== undefined && display !== null && display !== '') {
      return display !== '已发布'
    }
    return false
  }

  const renderPublishStatusBadge = (versionItem: Pick<ItemList, 'publish_display' | 'status_display'> | DatasetDetailsResponse | undefined) => {
    const display = versionItem?.status_display
    if (!display) return null

    const colorClass = isVersionUnpublished(versionItem)
      ? 'bg-orange-50 text-orange-500'
      : 'bg-green-50 text-green-600'

    return (
      <span className={`absolute right-3 top-2 rounded-full px-3 py-[2px] text-xs leading-5 font-medium ${colorClass}`}>
        {display}
      </span>
    )
  }

  const getPublishStatusTag = () => {
    const display = publishDisplay || '-'
    return <Tag color={isSelectedVersionUnpublished ? 'orange' : 'green'}>{display}</Tag>
  }

  const canDeletePreviewRows = () => {
    const processingStatus = datasetDetail?.processing_status_display
    return isVersionUnpublished(datasetDetail)
      && (!processingStatus || isDatasetCreateSucceeded(processingStatus))
      && !isActiveDeleteOperationRunning
  }

  const handleBack = () => {
    if (!projectId) return
    navigate(`/project/${projectId}/machine-data-management`)
  }

  const [downloadLoading, setDownloadLoading] = useState(false)
  const currentTemplateType = useMemo(() => {
    if (!datasetDetail) return ''
    return datasetDetail.template_type ?? ''
  }, [datasetDetail])

  const downloadFormatOptions = useMemo(() => {
    if (!exportFormatsMap || !currentTemplateType) return []
    const formats = exportFormatsMap[currentTemplateType] ?? []
    const isUnannotatedDataset = datasetDetail?.is_annotated === false
    return isUnannotatedDataset
      ? ['platform'].filter((format) => formats.includes(format))
      : formats
  }, [currentTemplateType, datasetDetail?.is_annotated, exportFormatsMap])

  const downloadMenuItems: MenuProps['items'] = downloadFormatOptions.map((format) => ({
    key: format,
    label: format === 'platform'
      ? '平台格式'
      : `训练格式（${format}）`,
    onClick: () => {
      void handleDownload(format)
    },
  }))

  const handleDownload = async (exportFormat?: string) => {
    if (!projectIdNum || !selectedVersionId) return
    setDownloadLoading(true)
    try {
      const response = await machineDatamanagement.downloadMachineDataset(projectIdNum, selectedVersionId, exportFormat)
      if (response.status === 202) {
        const asyncExportResult = response.data instanceof Blob
          ? JSON.parse(await response.data.text()) as DatasetAsyncExportResponse
          : response.data
        message.warning(asyncExportResult.message || '已提交异步导出任务，请稍后重试下载')
        return
      }

      const blob = response.data instanceof Blob
        ? response.data
        : new Blob([JSON.stringify(response.data)], { type: 'application/json' })
      const contentType = getContentType(response.headers, blob)
      const filenameFromHeaders = extractFilenameFromHeaders(response.headers, 'dataset')
      const filename = processFilenameExtension(filenameFromHeaders, undefined, undefined, contentType)
      downloadBlobFile(blob, filename)
      message.success('下载成功')
    }
    catch (e: unknown) {
      message.error((e as Error)?.message || '下载失败')
    }
    finally {
      setDownloadLoading(false)
    }
  }

  const handlePublishVersion = async () => {
    if (!projectIdNum || !selectedVersionId || Number.isNaN(projectIdNum)) return

    setPublishingVersionId(selectedVersionId)
    try {
      await machineDatamanagement.publish(projectIdNum, selectedVersionId, 1)
      message.success('发布成功')
      queryClient.invalidateQueries({ queryKey: ['machine-dataset-list'] })
      queryClient.invalidateQueries({ queryKey: ['machine-dataset-versions', projectIdNum, versionListKeyId] })
      await refetchDatasetDetail()
    }
    catch (e: unknown) {
      message.error((e as Error)?.message || '发布失败')
    }
    finally {
      setPublishingVersionId(null)
    }
  }

  const getPreviewRowNumber = (record: ItemDetail) => {
    const rowNumber = record?.row_number ?? (record as any)?.rowNumber
    const normalized = Number(rowNumber)
    return Number.isFinite(normalized) ? normalized : undefined
  }

  const submitDeleteRows = async (rowNumbers: number[]) => {
    if (!projectIdNum || !selectedVersionId || Number.isNaN(projectIdNum)) return

    try {
      await machineDatamanagement.deleteRow(projectIdNum, selectedVersionId, rowNumbers)
      message.success('删除任务已提交，正在后台处理')
      await refetchDatasetDetail()
      queryClient.invalidateQueries({ queryKey: ['machine-dataset-list'] })
      queryClient.invalidateQueries({ queryKey: ['machine-dataset-versions', projectIdNum, versionListKeyId] })
    }
    catch (e: unknown) {
      message.error((e as any)?.response?.data?.detail || (e as Error)?.message || '删除任务提交失败')
    }
  }

  const handleDeletePreviewRow = async (record: ItemDetail) => {
    const rowNumber = getPreviewRowNumber(record)
    if (!rowNumber) {
      message.error('无法获取行号，删除失败')
      return
    }

    setDeletingRowNumber(rowNumber)
    try {
      await submitDeleteRows([rowNumber])
    }
    finally {
      setDeletingRowNumber(null)
    }
  }

  const handleRetryDeleteRows = async () => {
    const rowNumbers = activeDeleteOperation?.row_numbers || []
    if (!rowNumbers.length) {
      message.error('无法获取需要重试的行号')
      return
    }
    await submitDeleteRows(rowNumbers.map(Number))
  }

  const handleDismissOperationAlert = () => {
    if (!activeDeleteOperation?.operation_id) return
    setDismissedOperationIds((prev) => new Set([...prev, activeDeleteOperation.operation_id!]))
  }

  const deleteVersionMutation = useMutation({
    mutationFn: () => machineDatamanagement.deleteMachineDataset(projectIdNum, selectedVersionId),
    onSuccess: () => {
      message.success('删除成功')
      queryClient.invalidateQueries({ queryKey: ['machine-dataset-list'] })
      const currentVersions = versionsRef.current
      if (currentVersions.length <= 1) {
        navigate(`/project/${projectId}/machine-data-management`)
        return
      }
      const rest = currentVersions.filter((v) => v.id !== selectedVersionId)
      if (rest.length) {
        const nextId = rest[0].id
        setVersionListKeyId(nextId)
        setSelectedVersionId(nextId)
        setPage(1)
        queryClient.invalidateQueries({ queryKey: ['machine-dataset-versions', projectIdNum, nextId] })
      }
    },
    onError: (e: Error) => {
      message.error(e?.message || '删除失败')
    },
  })

  const handleVersionClick = (versionId: number) => {
    setSelectedVersionId(versionId)
    setPage(1)
  }

  const handleEditBasicInfo = useCallback(async (field: 'name' | 'description', value: string) => {
    if (!datasetDetail?.id || !projectIdNum || Number.isNaN(projectIdNum)) return

    const nextValue = value.trim()
    const currentValue = field === 'name' ? datasetDetail.name || '' : datasetDetail.description || ''

    if (field === 'name' && !nextValue) {
      message.warning('数据集名称不能为空')
      return
    }
    if (nextValue === currentValue) {
      return
    }

    setEditingBasicField(field)
    try {
      await machineDatamanagement.editMachineDatasetBasicInfo(
        projectIdNum,
        datasetDetail.id,
        {
          name: field === 'name' ? nextValue : datasetDetail.name,
          description: field === 'description' ? nextValue : datasetDetail.description,
        },
      )
      message.success('数据集信息更新成功')
      queryClient.invalidateQueries({ queryKey: ['machine-dataset-list'] })
      queryClient.invalidateQueries({ queryKey: ['machine-dataset-versions', projectIdNum, versionListKeyId] })
      await refetchDatasetDetail()
    }
    catch (e: unknown) {
      message.error((e as Error)?.message || '数据集信息更新失败')
    }
    finally {
      setEditingBasicField(null)
    }
  }, [
    datasetDetail?.description,
    datasetDetail?.id,
    datasetDetail?.name,
    projectIdNum,
    queryClient,
    refetchDatasetDetail,
    versionListKeyId,
  ])

  const nextVersionLabel = useMemo(() => {
    if (!versions?.length) return 'V1'
    const nums = versions.map((v) => {
      const m = (v.version || '').match(/^V?(\d+)$/i)
      return m ? parseInt(m[1], 10) : 0
    })
    const max = Math.max(0, ...nums)
    return `V${max + 1}`
  }, [versions])

  const addVersionMutation = useMutation({
    mutationFn: (params: CreateDatasetRequest) =>
      machineDatamanagement.createMachineDataset(projectIdNum, params),
    onSuccess: () => {
      message.success('新增版本成功')
      setAddVersionModalOpen(false)
      queryClient.invalidateQueries({ queryKey: ['machine-dataset-list'] })
      queryClient.invalidateQueries({ queryKey: ['machine-dataset-versions', projectIdNum, versionListKeyId] })
    },
    onError: (e: Error) => {
      console.error(e?.message || '新增版本失败')
    },
  })

  const handleAddVersionConfirm = async (values: AddVersionFormValues) => {
    const datasetName = datasetDetail?.name
    if (!datasetName) {
      message.error('无法获取数据集名称')
      return
    }
    const sourceVersion = values.inheritFromVersion && values.sourceVersionId != null
      ? versions?.find((v) => v.id === values.sourceVersionId)?.version
      : undefined
    if (values.inheritFromVersion && !sourceVersion) {
      message.error('请选择要继承的历史版本')
      return
    }
    const params: CreateDatasetRequest = {
      name: datasetName,
      version: nextVersionLabel,
      inherit_from_version: values.inheritFromVersion,
      data_source: values.dataSource === 'notebook' ? 'notebook_fetch' : 'local_upload',
      ...(values.description ? { description: values.description } : {}),
      ...(sourceVersion ? { source_version: sourceVersion } : {}),
      is_annotated: values.is_annotated,
    }
    if (!values.inheritFromVersion && datasetDetail) {
      const apiTemplateType = datasetDetail.template_type
      params.data_type = datasetDetail.data_type
      params.annotation_type = datasetDetail.annotation_type
      params.template_type = apiTemplateType
    }

    if (values.dataSource === 'notebook') {
      params.notebook_id = values?.notebook_id
      params.notebook_name = values?.notebook_name
      params.notebook_path = values?.notebook_path
    }
    // if (values.dataSource === 'local_upload' && values.chunkUploadIds) {
    //   params.chunk_upload_ids = values.chunkUploadIds.split(',').map((id) => id.trim()).filter(Boolean).join(',')
    // }
    if (values?.chunkUploadIds) {
      params.chunk_upload_ids = values.chunkUploadIds
    }
    await addVersionMutation.mutateAsync(params)
  }

  return (
    <div className="machine-data-management-detail-container lab-list-page-shell">
      <div className="flex items-center justify-between gap-3 mb-4">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={handleBack}>
          返回
        </Button>
        <div className="flex items-center gap-2">
          {isSelectedVersionUnpublished && (
            <Button
              type="primary"
              loading={publishingVersionId === selectedVersionId}
              disabled={detailsLoading || deleteVersionMutation.isPending || isVersionOperationLocked}
              onClick={handlePublishVersion}
            >
              发布
            </Button>
          )}
          <Dropdown
            menu={{ items: downloadMenuItems }}
            disabled={detailsLoading || !downloadMenuItems?.length}
          >
            <Button
              icon={<DownloadOutlined />}
              loading={downloadLoading}
              disabled={detailsLoading || !downloadMenuItems?.length}
            >
              导出
              <DownOutlined />
            </Button>
          </Dropdown>
          <Popconfirm
            title="确定删除该版本？"
            onConfirm={() => deleteVersionMutation.mutate()}
          >
            <Button
              danger
              icon={<DeleteOutlined />}
              loading={deleteVersionMutation.isPending}
              disabled={isVersionOperationLocked}
            >
              删除
            </Button>
          </Popconfirm>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="w-[160px] flex-shrink-0">
          <div className="text-center mb-4">
            <Button
              type="primary"
              size="large"
              block
              disabled={isVersionOperationLocked}
              onClick={() => setAddVersionModalOpen(true)}
            >
              新增版本
            </Button>
          </div>
          {/* <Card loading={versionsLoading}> */}
          <div className="space-y-2">
            {versions?.length ? versions.map((v) => {
              const isActive = v.id === selectedVersionId
              return (
                <div
                  key={v.id}
                  className={`relative px-3 py-2 pr-[76px] rounded cursor-pointer border-l-4 transition-colors ${isActive
                    ? 'bg-blue-50 border-blue-500 text-blue-600 font-medium'
                    : 'bg-white border-transparent text-gray-700 hover:bg-gray-50'
                  }`}
                  onClick={() => handleVersionClick(v.id)}
                >
                  {renderPublishStatusBadge(v)}
                  {v.version || '-'}
                </div>
              )
            }) : (
              <Typography.Text type="secondary">暂无版本</Typography.Text>
            )}
          </div>
          {/* </Card> */}
        </div>

        <div className="flex-1 min-w-0">
          <Card className="!mb-4" title="基本信息">
            {detailsLoading ? (
              <div className="py-8 w-full flex justify-center">
                <Spin />
              </div>
            ) : (
              <Descriptions column={2} size="small" bordered={false}>
                <Descriptions.Item label="数据集名称">
                  <Text
                    editable={datasetDetail
                      ? {
                          tooltip: '编辑名称',
                          triggerType: ['icon'],
                          onChange: (value) => handleEditBasicInfo('name', value),
                        }
                      : false}
                    disabled={editingBasicField === 'name'}
                  >
                    {datasetDetail?.name || '-'}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="数据量">
                  {(datasetDetail?.sample_count ?? 0).toLocaleString()}
                  {' '}
                  条
                </Descriptions.Item>
                <Descriptions.Item label="数据类型">
                  {datasetCategoryLabel}
                </Descriptions.Item>
                <Descriptions.Item label="标注类型">
                  {taskTypeLabel}
                </Descriptions.Item>
                <Descriptions.Item label="标注模板">
                  {templateTypeLabel}
                </Descriptions.Item>
                <Descriptions.Item label="数据标注状态">
                  {datasetDetail?.is_annotated ? '有标注信息' : '无标注信息'}
                </Descriptions.Item>
                <Descriptions.Item label="发布状态">
                  {getPublishStatusTag()}
                </Descriptions.Item>
                {datasetDetail?.is_annotated && (
                  <Descriptions.Item label="标签">
                    {labelSchemaKeys.length ? labelSchemaKeys.join(', ') : '-'}
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="创建人">
                  {createdByLabel}
                </Descriptions.Item>
                <Descriptions.Item label="创建时间">
                  {createdAtLabel}
                </Descriptions.Item>
                <Descriptions.Item label="描述" span={2}>
                  <Paragraph
                    className="!mb-0"
                    editable={datasetDetail
                      ? {
                          tooltip: '编辑描述',
                          triggerType: ['icon'],
                          autoSize: { minRows: 1, maxRows: 4 },
                          onChange: (value) => handleEditBasicInfo('description', value),
                        }
                      : false}
                    disabled={editingBasicField === 'description'}
                  >
                    {descriptionLabel}
                  </Paragraph>
                </Descriptions.Item>
              </Descriptions>
            )}
          </Card>

          <Card title={renderDataDetailTitle()}>
            {detailsLoading ? (
              <div className="text-center py-10">
                <Spin />
              </div>
            ) : datasetCategory === 'image' ? (
              <ImageTabDetails
                items={items}
                labelSchema={labelSchema}
                baseUrl={datasetDetail?.base_url ?? (datasetDetail as { baseUrl?: string })?.baseUrl}
                loading={detailsLoading}
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                onPageChange={(p) => setPage(p)}
                storagePath={datasetDetail?.storage_path}
                datasetPath={datasetDetail?.dataset_path}
                canDeleteRows={canDeletePreviewRows() || isActiveDeleteOperationRunning}
                deleteLocked={isActiveDeleteOperationRunning}
                deletingRowNumber={deletingRowNumber}
                deletingRowNumbers={Array.from(activeDeleteRowNumbers)}
                failedRowNumbers={Array.from(failedDeleteRowNumbers)}
                onDeleteRow={handleDeletePreviewRow}
              />
            ) : (
              <TextTabDetails
                items={items}
                labelSchema={labelSchema}
                taskType={datasetDetail?.task_type}
                loading={detailsLoading}
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                onPageChange={(p) => setPage(p)}
                canDeleteRows={canDeletePreviewRows() || isActiveDeleteOperationRunning}
                deleteLocked={isActiveDeleteOperationRunning}
                deletingRowNumber={deletingRowNumber}
                deletingRowNumbers={Array.from(activeDeleteRowNumbers)}
                failedRowNumbers={Array.from(failedDeleteRowNumbers)}
                onDeleteRow={handleDeletePreviewRow}
              />
            )}
          </Card>
        </div>
      </div>

      <AddVersionModal
        open={addVersionModalOpen}
        confirmLoading={addVersionMutation.isPending}
        projectId={projectId}
        dataType={datasetCategory === 'image' ? 'image' : 'text'}
        datasetVersion={nextVersionLabel}
        dataTypeLabel={datasetCategoryLabel ?? '-'}
        taskTypeLabel={taskTypeLabel}
        templateTypeLabel={templateTypeLabel}
        templateType={datasetDetail?.template_type}
        historyVersions={versions ?? []}
        onCancel={() => setAddVersionModalOpen(false)}
        onConfirm={handleAddVersionConfirm}
      />
    </div>
  )
}

export default MachineDatasetDetails
