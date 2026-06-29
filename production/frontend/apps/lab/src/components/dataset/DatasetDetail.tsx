import { Alert, Button, Card, Col, Dropdown, Modal, Popconfirm, Row, Spin, Table, Tag, Tooltip, Typography, message } from 'antd'
import { ArrowLeftOutlined, DatabaseOutlined, DownOutlined, FileTextOutlined } from '@ant-design/icons'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import React, { useCallback, useEffect, useState } from 'react'
import BasicView from './DatasetDetailBasicView'
import { useDatasetDetailDpoColumns } from './DatasetDetailDpoColumns'
import { formatDatasetPreviewItems, getBusinessTestKeys, isDpoAlpacaPreview, isDpoRoleBasedPreview } from './datasetPreviewFormat'
import { trainingDatasetService } from '@/services/trainingApi.ts'
import ExpandableCell from '@/components/common/ExpandableCell.tsx'
import { expandImageData, replaceImagePlaceholders } from '@/utils/imageUtils.ts'
import { isInteractiveElement } from '@/utils/domUtils'
import { downloadBlobFile, extractFilenameFromHeaders, getContentType, processFilenameExtension } from '@/utils/download.ts'
import { formatDatasetVersionStatus, isDatasetCreateFailed, isDatasetCreateSucceeded, isDatasetCreating } from '@/utils/datasetStatus'
import './DatasetDetail.css'

const { Text } = Typography
const DELETE_ROW_POLL_INTERVAL = 2500

const PREVIEW_META_KEYS = new Set(['key', 'id', 'item', 'row_number', 'base_url', 'images'])

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

const isMessageList = (value: unknown): value is Array<Record<string, unknown>> => {
  return Array.isArray(value) && value.every((item) => isPlainObject(item) && ('role' in item || 'content' in item))
}

const formatPreviewValue = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return '-'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value, null, 2)
  }
  catch {
    return String(value)
  }
}

const getRoleTagColor = (role?: unknown) => {
  const normalizedRole = typeof role === 'string' ? role : 'message'
  const roleColorMap: Record<string, string> = {
    system: 'purple',
    user: 'blue',
    assistant: 'green',
  }
  return roleColorMap[normalizedRole] || 'default'
}

const getRoleLabel = (role?: unknown) => {
  const normalizedRole = typeof role === 'string' && role ? role : 'message'
  return normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1)
}

const getPreviewImageUrl = (imagePath: string, baseUrl: string) => {
  const imageBaseUrl = import.meta.env.DEV
    ? `${import.meta.env.VITE_PREFIX_BASE_URL}/api/v1/storage/download/`
    : '/lab-backend/api/v1/storage/download/'
  const fileName = imagePath.includes('/') ? imagePath.split('/').pop() : imagePath
  return `${imageBaseUrl}${baseUrl}/${fileName}`
}

const renderContentWithImages = (
  content: string,
  images: string[],
  baseUrl: string,
  startIndex: number,
) => {
  if (!content.includes('<image>') || images.length === 0) {
    return {
      content: <div className="whitespace-pre-wrap">{content}</div>,
      nextIndex: startIndex,
    }
  }

  let imageIndex = startIndex
  const nodes: React.ReactNode[] = []
  const parts = content.split('<image>')

  parts.forEach((part, partIndex) => {
    if (part) {
      nodes.push(
        <span key={`text-${part.slice(0, 24)}-${nodes.length}`} className="whitespace-pre-wrap">
          {part}
        </span>,
      )
    }

    if (partIndex >= parts.length - 1)
      return

    const imagePath = images[imageIndex]
    if (!imagePath) {
      nodes.push(<span key={`placeholder-${nodes.length}`}>{'<image>'}</span>)
      return
    }

    nodes.push(
      <img
        key={`image-${imagePath}-${nodes.length}`}
        src={getPreviewImageUrl(imagePath, baseUrl)}
        alt="Image"
        className="my-1 h-auto max-w-full rounded"
      />,
    )
    imageIndex += 1
  })

  return {
    content: <div>{nodes}</div>,
    nextIndex: imageIndex,
  }
}

const formatMessageList = (messages: unknown, images: unknown = [], baseUrl = ''): string => {
  if (!isMessageList(messages)) return formatPreviewValue(messages)
  let imageIndex = 0
  return messages.map((item) => {
    const role = getRoleLabel(item.role)
    const rawContent = formatPreviewValue(item.content)
    const { processedContent, nextIndex } = replaceImagePlaceholders(
      rawContent,
      Array.isArray(images) ? images : [],
      baseUrl,
      imageIndex,
    )
    imageIndex = nextIndex
    const content = processedContent
    return `${role}\n${content}`
  }).join('\n\n')
}

const renderMessageListContent = (messages: unknown, images: unknown = [], baseUrl = '') => {
  if (!isMessageList(messages))
    return undefined

  let imageIndex = 0
  const imageList = Array.isArray(images) ? images.filter((image): image is string => typeof image === 'string') : []
  return (
    <div className="space-y-3">
      {messages.map((item) => {
        const rawContent = formatPreviewValue(item.content)
        const { content, nextIndex } = renderContentWithImages(
          rawContent,
          imageList,
          baseUrl,
          imageIndex,
        )
        imageIndex = nextIndex

        return (
          <div key={`${formatPreviewValue(item.role)}-${rawContent.slice(0, 48)}`}>
            <Tag color={getRoleTagColor(item.role)} className="!mb-1">
              {getRoleLabel(item.role)}
            </Tag>
            {content}
          </div>
        )
      })}
    </div>
  )
}

const getDynamicSampleKeys = (previewData: any[]) => {
  const sampleData = previewData[0]?.item?.sample_data
  const source = isPlainObject(sampleData) ? sampleData : previewData[0]
  return Object.keys(source || {}).filter((key) => !PREVIEW_META_KEYS.has(key))
}

interface DatasetAsyncExportResponse {
  message?: string
}

interface DatasetVersionOperation {
  operation_id?: string
  operation_type?: string
  status?: 'queued' | 'running' | 'succeeded' | 'failed' | string
  row_numbers?: number[]
  requested_count?: number
  removed_count?: number
  error_message?: string
  updated_at?: string
}

interface DatasetDetailProps {
  type: 'training' | 'test' | 'validation'
  usage: string
}

const DatasetDetail: React.FC<DatasetDetailProps> = ({ type, usage }) => {
  const { projectId, datasetId } = useParams<{ projectId: string, datasetId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  // 状态管理
  const [dataContentPage, setDataContentPage] = useState(1)
  const [dataContentPageSize, setDataContentPageSize] = useState(10)
  // 添加当前选中的数据集版本状态
  const [selectedVersion, setSelectedVersion] = useState<any>(null)
  // 添加预览数据状态
  const [previewData, setPreviewData] = useState<any[]>([])
  // 添加预览数据加载状态
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  // 添加预览数据总数
  const [previewTotal, setPreviewTotal] = useState(0)
  // 添加正在删除的版本状态
  const [deletingVersion, setDeletingVersion] = useState<string | null>(null)
  const [publishingVersion, setPublishingVersion] = useState<string | null>(null)
  const [deletingRowNumber, setDeletingRowNumber] = useState<number | null>(null)
  const [dismissedOperationIds, setDismissedOperationIds] = useState<Set<string>>(new Set())
  // 添加展开状态管理，key格式: `${rowKey}-${columnKey}`
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set())
  // 添加单元格高度跟踪，key格式: `${rowKey}-${columnKey}`
  const [cellHeights, setCellHeights] = useState<Map<string, number>>(new Map())
  // 添加每行的最大高度，key为 rowKey
  const [rowMaxHeights, setRowMaxHeights] = useState<Map<string, number>>(new Map())

  // 获取数据集详情
  const { data: dataset, isLoading, refetch } = useQuery({
    queryKey: [`${type}-dataset-detail`, datasetId, usage],
    queryFn: async () => {
      const data = await trainingDatasetService.detail(Number(projectId), datasetId, usage)
      localStorage.setItem('VersionDetails', JSON.stringify(data))
      return data
    },
    enabled: !!datasetId && !!projectId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })

  // 当 datasetId 或 usage 变化时，清除旧的状态和缓存
  useEffect(() => {
    // 重置状态
    setSelectedVersion(null)
    setPreviewData([])
    setDataContentPage(1)
    setExpandedCells(new Set())
    setCellHeights(new Map())
    setRowMaxHeights(new Map())
  }, [datasetId, usage])

  useEffect(() => {
    if (!dataset) return

    if (Array.isArray(dataset)) {
      const latestVersion = dataset[dataset.length - 1]
      if (latestVersion) {
        handleVersionChange(latestVersion)
      }
    }
    else {
      setSelectedVersion(dataset)
    }
  }, [dataset?.length])

  const handleVersionChange = async (versionItem: any, page: number = 1, pageSize: number = dataContentPageSize) => {
    if (!versionItem || !versionItem.version) {
      console.error('无效的版本项:', versionItem)
      return
    }
    if (dataset) {
      if (Array.isArray(dataset)) {
        const versionExists = dataset.some((item: any) => item.version === versionItem.version && item.id === versionItem.id)
        if (!versionExists) {
          console.warn('版本项不在当前数据集中，可能使用了缓存数据')
          // 尝试从当前数据集中找到匹配的版本
          const matchedVersion = dataset.find((item: any) => item.version === versionItem.version)
          if (matchedVersion) {
            versionItem = matchedVersion
          }
          else {
            console.error('无法找到匹配的版本')
            return
          }
        }
      }
    }

    setSelectedVersion(versionItem)
    setDataContentPage(page)
    setExpandedCells(new Set())
    setCellHeights(new Map())
    setRowMaxHeights(new Map())
    setIsPreviewLoading(true)
    refetch()

    try {
      const data = await trainingDatasetService.preview(Number(projectId), datasetId, versionItem.version, page, pageSize, usage)
      setPreviewData(formatDatasetPreviewItems(data, versionItem))
      setPreviewTotal(data.total)
    }
    catch (error) {
      console.error('获取预览数据失败:', error)
      message.error('获取预览数据失败，请刷新页面重试')
    }
    finally {
      setIsPreviewLoading(false)
    }
  }

  const downloadDataset = async (version: string, exportType?: string) => {
    try {
      const defaultFilename = `${selectedVersion?.name || 'dataset'}_${version}`

      const response = await trainingDatasetService.download(Number(projectId), datasetId, version, usage, exportType)

      if (response.status === 202) {
        const asyncExportResult = response.data instanceof Blob
          ? JSON.parse(await response.data.text()) as DatasetAsyncExportResponse
          : response.data as DatasetAsyncExportResponse
        message.warning(asyncExportResult.message || '已提交异步导出任务，请稍后重试下载')
        return
      }

      const blob = response.data instanceof Blob
        ? response.data
        : new Blob([JSON.stringify(response.data)], { type: 'application/json' })
      const contentType = getContentType(response.headers, blob)
      const filenameFromHeaders = extractFilenameFromHeaders(response.headers, defaultFilename)
      const filename = processFilenameExtension(filenameFromHeaders, exportType, selectedVersion?.dataset_format, contentType)
      downloadBlobFile(blob, filename)

      message.success('文件下载成功')
    }
    catch (error) {
      console.error('下载失败:', error)
      message.error('下载失败')
    }
  }

  const isVersionUnpublished = (versionItem: any) => {
    if (!versionItem) return false
    return formatDatasetVersionStatus(versionItem) === '未发布'
  }

  const renderPublishStatusBadge = (versionItem: any) => {
    const versionStatus = formatDatasetVersionStatus(versionItem)
    if (!versionStatus || versionStatus === '-') return null

    const colorClassMap: Record<string, string> = {
      创建中: 'bg-blue-50 text-blue-500',
      创建失败: 'bg-red-50 text-red-500',
      未发布: 'bg-orange-50 text-orange-500',
      已发布: 'bg-green-50 text-green-600',
    }
    const colorClass = colorClassMap[versionStatus] || 'bg-gray-50 text-gray-500'

    return (
      <span className={`absolute right-3 top-2 rounded-full px-3 py-[2px] text-xs leading-5 font-medium ${colorClass}`}>
        {versionStatus}
      </span>
    )
  }

  const getLatestDatasetVersion = () => {
    if (Array.isArray(dataset)) {
      return dataset[dataset.length - 1]
    }
    return dataset
  }

  const getDeleteRowsOperation = (versionItem: any): DatasetVersionOperation | null => {
    const operation = versionItem?.active_operation
    if (!operation || operation.operation_type !== 'delete_rows') return null
    return operation
  }

  const isDeleteOperationRunning = (operation?: DatasetVersionOperation | null) => {
    return operation?.status === 'queued' || operation?.status === 'running'
  }

  const activeDeleteOperation = getDeleteRowsOperation(selectedVersion)
  const isActiveDeleteOperationRunning = isDeleteOperationRunning(activeDeleteOperation)
  const isActiveDeleteOperationFailed = activeDeleteOperation?.status === 'failed'
  const isFailedOperationDismissed = Boolean(
    activeDeleteOperation?.operation_id && dismissedOperationIds.has(activeDeleteOperation.operation_id),
  )
  const activeDeleteRequestedCount = activeDeleteOperation?.requested_count
    || activeDeleteOperation?.row_numbers?.length
    || 1
  const activeDeleteRemovedCount = activeDeleteOperation?.removed_count || 0
  const activeDeleteFailedCount = Math.max(activeDeleteRequestedCount - activeDeleteRemovedCount, 0)
  const activeDeleteRowNumbers = new Set(
    isActiveDeleteOperationRunning ? (activeDeleteOperation?.row_numbers || []).map(Number) : [],
  )
  const failedDeleteRowNumbers = new Set(
    isActiveDeleteOperationFailed
      ? (activeDeleteOperation?.row_numbers || []).map(Number)
      : [],
  )
  const isRowInActiveDeleteOperation = (record: any) => {
    const rowNumber = getPreviewRowNumber(record)
    return rowNumber !== undefined && activeDeleteRowNumbers.has(rowNumber)
  }
  const isRowInFailedDeleteOperation = (record: any) => {
    const rowNumber = getPreviewRowNumber(record)
    return rowNumber !== undefined && failedDeleteRowNumbers.has(rowNumber)
  }

  const renderDataDetailTitle = () => {
    const title = (
      <span className="text-blue-400 shrink-0">
        <DatabaseOutlined />
        {' '}
        数据详情
      </span>
    )

    if (isActiveDeleteOperationRunning) {
      return (
        <div className="flex flex-wrap items-center gap-3">
          {title}
          <Alert
            type="warning"
            showIcon
            className="min-w-[420px] flex-1 !py-2"
            message={`版本操作状态：删除中。正在删除 ${activeDeleteRequestedCount} 条数据，数据集较大时可能需要几分钟。你可以离开页面，回来后会继续展示处理状态。`}
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
            className="min-w-[420px] flex-1 !py-2"
            message={`版本操作状态：删除失败。已成功 ${activeDeleteRemovedCount} 条，已失败 ${activeDeleteFailedCount} 条。${activeDeleteOperation?.error_message || '目标数据已变化，请刷新后重试'}`}
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

  const getNewVersionBlockedReason = () => {
    const latestVersion = getLatestDatasetVersion()
    if (!latestVersion) return ''

    const latestOperation = getDeleteRowsOperation(latestVersion)
    if (isDeleteOperationRunning(latestOperation)) {
      return '最新版本有删除任务处理中，请完成后再新增下一版本'
    }

    const latestVersionStatus = formatDatasetVersionStatus(latestVersion)
    if (latestVersionStatus === '已发布') return ''

    if (latestVersionStatus === '创建失败') {
      return '最新版本创建失败，不能新增下一个版本'
    }
    if (latestVersionStatus === '未发布') {
      return '最新版本未发布，发布后才能新增下一个版本'
    }
    if (latestVersionStatus === '创建中') {
      return '最新版本创建中，创建完成并发布后才能新增下一个版本'
    }
    return '最新版本需已发布后才能新增下一个版本'
  }

  const canDeletePreviewRows = () => {
    return isDatasetCreateSucceeded(selectedVersion?.processing_status_display)
      && isVersionUnpublished(selectedVersion)
      && !isActiveDeleteOperationRunning
  }

  const pickSelectedVersionFromDetail = (detail: any, currentVersion: any) => {
    if (!Array.isArray(detail)) {
      return detail
    }
    return detail.find((item: any) => item.id === currentVersion?.id)
      || detail.find((item: any) => item.version === currentVersion?.version)
      || detail[detail.length - 1]
      || currentVersion
  }

  useEffect(() => {
    if (!isActiveDeleteOperationRunning || !selectedVersion) return

    const rowNumbers = activeDeleteOperation?.row_numbers || []
    const timer = window.setInterval(async () => {
      const result = await refetch()
      if (!result.data) return

      const latestVersion = pickSelectedVersionFromDetail(result.data, selectedVersion)
      const latestOperation = getDeleteRowsOperation(latestVersion)
      setSelectedVersion(latestVersion)

      if (isDeleteOperationRunning(latestOperation)) return

      window.clearInterval(timer)
      if (latestOperation?.status === 'failed') {
        return
      }

      message.success('删除完成')
      const nextPage = previewData.length <= rowNumbers.length && dataContentPage > 1
        ? dataContentPage - 1
        : dataContentPage
      await handleVersionChange(latestVersion, nextPage, dataContentPageSize)
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey
          return Array.isArray(queryKey)
            && queryKey.length > 0
            && queryKey[0] === 'training-datasets'
        },
      })
    }, DELETE_ROW_POLL_INTERVAL)

    return () => window.clearInterval(timer)
  }, [
    activeDeleteOperation?.operation_id,
    activeDeleteOperation?.status,
    dataContentPage,
    dataContentPageSize,
    isActiveDeleteOperationRunning,
    previewData.length,
    queryClient,
    refetch,
    selectedVersion,
  ])

  const handleEditBasicInfo = async (values: { name?: string, description?: string }) => {
    if (!selectedVersion?.id || !projectId) return

    const nextName = values.name ?? selectedVersion.name
    const nextDescription = values.description ?? selectedVersion.description
    const isRename = !!values.name && values.name !== datasetId

    try {
      await trainingDatasetService.edit(Number(projectId), selectedVersion.name, selectedVersion.id, usage, nextName, nextDescription)
      message.success('数据集信息更新成功')
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey
          return Array.isArray(queryKey)
            && queryKey.length > 0
            && queryKey[0] === 'training-datasets'
        },
      })

      if (isRename) {
        queryClient.removeQueries({
          queryKey: [`${type}-dataset-detail`, datasetId, usage],
        })
        const encodedCurrentId = encodeURIComponent(datasetId || '')
        const encodedNextName = encodeURIComponent(values.name)
        const nextPath = location.pathname.includes(encodedCurrentId)
          ? location.pathname.replace(encodedCurrentId, encodedNextName)
          : location.pathname.replace(/\/[^/]*$/, `/${encodedNextName}`)
        navigate(`${nextPath}${location.search}`, { replace: true })
      }
      else {
        const result = await refetch()
        if (result.data) {
          setSelectedVersion(pickSelectedVersionFromDetail(result.data, selectedVersion))
        }
      }
    }
    catch (error) {
      console.error('更新数据集信息失败:', error)
      message.error('数据集信息更新失败')
      throw error
    }
  }

  const handlePublishVersion = async () => {
    if (!selectedVersion?.id || !projectId) return

    setPublishingVersion(selectedVersion.version)
    try {
      await trainingDatasetService.publish(Number(projectId), selectedVersion.id, 1)
      message.success('发布成功')

      const result = await refetch()
      if (result.data) {
        setSelectedVersion(pickSelectedVersionFromDetail(result.data, selectedVersion))
      }

      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey
          return Array.isArray(queryKey)
            && queryKey.length > 0
            && queryKey[0] === 'training-datasets'
        },
      })
    }
    catch (error) {
      console.error('发布数据集版本失败:', error)
      message.error('发布失败')
    }
    finally {
      setPublishingVersion(null)
    }
  }

  const getPreviewRowNumber = (record: any) => {
    const rowNumber = record?.row_number ?? record?.id ?? record?.key
    const normalized = Number(rowNumber)
    return Number.isFinite(normalized) ? normalized : undefined
  }

  const submitDeleteRows = async (rowNumbers: number[]) => {
    if (!selectedVersion?.id || !projectId) return

    try {
      await trainingDatasetService.deleteRow(Number(projectId), selectedVersion.id, rowNumbers)
      message.success('删除任务已提交，正在后台处理')

      const result = await refetch()
      if (result.data) {
        const latestVersion = pickSelectedVersionFromDetail(result.data, selectedVersion)
        setSelectedVersion(latestVersion)
      }

      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey
          return Array.isArray(queryKey)
            && queryKey.length > 0
            && queryKey[0] === 'training-datasets'
        },
      })
    }
    catch (error) {
      console.error('提交删除行任务失败:', error)
      message.error((error as any)?.response?.data?.detail || '删除任务提交失败')
    }
  }

  const handleDeletePreviewRow = async (record: any) => {
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
    if (rowNumbers.length === 0) {
      message.error('无法获取需要重试的行号')
      return
    }
    await submitDeleteRows(rowNumbers.map(Number))
  }

  const handleDismissOperationAlert = () => {
    if (!activeDeleteOperation?.operation_id) return
    setDismissedOperationIds((prev) => new Set([...prev, activeDeleteOperation.operation_id!]))
  }

  const deleteDatasetVersion = async (version: string) => {
    // 检查是否是最后一个版本
    const isLastVersion = Array.isArray(dataset)
      ? dataset.length === 1
      : true // 如果不是数组，说明只有一个版本

    if (isLastVersion) {
      const datasetName = selectedVersion?.name

      // 如果是最后一个版本，弹出二次确认，询问是否删除整个数据集
      Modal.confirm({
        title: '删除确认',
        content: `这是该数据集的最后一个版本，删除后将删除整个数据集。确定要删除数据集 "${datasetName}" 吗？`,
        okText: '确认删除',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: async () => {
          setDeletingVersion(version)
          try {
            // 删除整个数据集
            await trainingDatasetService.delete(Number(projectId), datasetName, usage)
            message.success('数据集删除成功')

            queryClient.invalidateQueries({
              predicate: (query) => {
                const queryKey = query.queryKey
                return Array.isArray(queryKey)
                  && queryKey.length > 0
                  && queryKey[0] === 'training-datasets'
              },
            })
            // 立即重新获取数据，确保列表页面显示最新数据
            queryClient.refetchQueries({
              predicate: (query) => {
                const queryKey = query.queryKey
                return Array.isArray(queryKey)
                  && queryKey.length > 0
                  && queryKey[0] === 'training-datasets'
              },
            })

            // 清除数据集详情相关的所有缓存（包括不同 usage 的缓存）
            queryClient.removeQueries({
              predicate: (query) => {
                const queryKey = query.queryKey
                return Array.isArray(queryKey)
                  && queryKey.length > 0
                  && (queryKey[0] === `${type}-dataset-detail`
                    || queryKey[0] === 'training-dataset-detail'
                    || queryKey[0] === 'test-dataset-detail')
                  && queryKey[1] === datasetId
              },
            })

            // 返回列表页面
            back()
          }
          catch (error) {
            console.error('删除数据集失败:', error)
            message.error('删除数据集失败')
            setDeletingVersion(null)
          }
        },
      })
      return
    }

    // 如果不是最后一个版本，正常删除版本
    setDeletingVersion(version)
    try {
      await trainingDatasetService.deleteVersion(Number(projectId), datasetId, version, usage)
      message.success('数据集版本删除成功')

      // 刷新当前数据集详情
      await refetch()

      // 使数据集列表查询失效并立即重新获取，强制刷新最新版本信息
      // DatasetTab 中所有类型都使用 "training-datasets" 作为查询键前缀
      // 使用 predicate 确保匹配所有以该键开头的查询（包括带搜索参数的查询）
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey
          return Array.isArray(queryKey)
            && queryKey.length > 0
            && queryKey[0] === 'training-datasets'
        },
      })
      // 立即重新获取数据，确保列表页面显示最新数据
      queryClient.refetchQueries({
        predicate: (query) => {
          const queryKey = query.queryKey
          return Array.isArray(queryKey)
            && queryKey.length > 0
            && queryKey[0] === 'training-datasets'
        },
      })

      // 使数据集详情查询失效，确保返回时获取最新数据
      // 包含 usage 参数，确保清除正确的缓存
      const detailQueryKey = type === 'training' ? ['training-dataset-detail', datasetId, usage] : ['test-dataset-detail', datasetId, usage]
      queryClient.invalidateQueries({ queryKey: detailQueryKey })

      if (selectedVersion?.version === version) {
        if (Array.isArray(dataset)) {
          const remainingVersions = dataset.filter((item) => item.version !== version)
          if (remainingVersions.length > 0) {
            handleVersionChange(remainingVersions[0])
          }
          else {
            setSelectedVersion(null)
            setPreviewData([])
          }
        }
      }
    }
    catch (error) {
      console.error('删除数据集版本失败:', error)
      message.error('删除数据集版本失败')
    }
    finally {
      setDeletingVersion(null)
    }
  }

  const toggleCellExpand = (rowKey: string, columnKey: string) => {
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
  }

  // 处理单元格高度变化（仅在展开时调用）
  const handleCellHeightChange = useCallback((rowKey: string | number, columnKey: string, height: number) => {
    const cellKey = `${rowKey}-${columnKey}`
    setCellHeights((prev) => {
      const newMap = new Map(prev)
      // 更新高度（ExpandableCell 已经确保只在展开时调用，且高度大于100px）
      newMap.set(cellKey, height)
      return newMap
    })
  }, [])

  // 获取行的最大高度
  const getRowMaxHeight = useCallback((rowKey: string | number): number | undefined => {
    const rowPrefix = rowKey?.toString() || '0'
    return rowMaxHeights.get(rowPrefix)
  }, [rowMaxHeights])

  const {
    createDpoRoleBasedDataContentColumns,
    createDpoAlpacaDataContentColumns,
  } = useDatasetDetailDpoColumns({
    expandedCells,
    toggleCellExpand,
    handleCellHeightChange,
    getRowMaxHeight,
  })

  useEffect(() => {
    const newRowMaxHeights = new Map<string, number>()

    // 遍历所有单元格高度
    cellHeights.forEach((height, cellKey) => {
      // 检查该单元格是否展开
      if (!expandedCells.has(cellKey)) {
        return
      }

      // 提取基础行键
      let baseRowKey = cellKey
      if (cellKey.includes('-prompt-')) {
        baseRowKey = cellKey.split('-prompt-')[0]
      }
      else if (cellKey.includes('-response-')) {
        baseRowKey = cellKey.split('-response-')[0]
      }
      else if (cellKey.endsWith('-system') || cellKey.endsWith('-prompt') || cellKey.endsWith('-response')) {
        baseRowKey = cellKey.substring(0, cellKey.lastIndexOf('-'))
      }

      // 更新该行的最大高度
      const currentMax = newRowMaxHeights.get(baseRowKey) || 0
      newRowMaxHeights.set(baseRowKey, Math.max(currentMax, height))
    })

    setRowMaxHeights(newRowMaxHeights)
  }, [expandedCells, cellHeights])

  // 从 record 中动态获取 rowKey（简化版：直接从第一个有 dataIndex 的列获取）
  const getRecordRowKey = useCallback((record: any, columns: any[]) => {
    const firstColumn = columns.find((col) => col.dataIndex)
    const keyField = firstColumn?.dataIndex || 'id'
    return record[keyField] || record.key || record.id || record.row_number
  }, [])

  // 切换行的展开/收起状态（点击行任意位置）
  const toggleRowExpand = useCallback((record: any, columns: any[]) => {
    const rowKey = getRecordRowKey(record, columns)
    const rowPrefix = rowKey?.toString() || '0'

    setExpandedCells((prev) => {
      const newSet = new Set(prev)

      // 检查是否有任何列已展开（动态匹配所有可能的单元格键）
      let hasExpanded = false
      for (const k of prev) {
        if (k.startsWith(`${rowPrefix}-`) && k !== `${rowPrefix}-id`) {
          hasExpanded = true
          break
        }
      }

      if (hasExpanded) {
        // 鏀惰捣锛氭敹璧峰悓涓€琛岀殑鎵€鏈夊崟鍏冩牸
        const keysToDelete: string[] = []
        prev.forEach((k) => {
          // 鍖归厤鎵€鏈変互 rowPrefix 寮€澶寸殑閿紙鎺掗櫎 id锛?
          if (k.startsWith(`${rowPrefix}-`) && k !== `${rowPrefix}-id`) {
            keysToDelete.push(k)
          }
        })
        keysToDelete.forEach((k) => newSet.delete(k))
      }
      else {
        // 展开：动态收集所有需要展开的单元格键
        // 遍历 columns，调用每个列的 getExpandKeys 函数（如果存在）来获取展开键
        columns.forEach((col) => {
          if (!col.dataIndex || col.dataIndex === 'id') return

          // 如果列定义了 getExpandKeys 函数，使用它来获取展开键
          if (typeof col.getExpandKeys === 'function') {
            const expandKeys = col.getExpandKeys(record, rowKey)
            expandKeys.forEach((key: string) => newSet.add(key))
          }
          else {
            // 否则，根据 dataIndex 和 record 数据动态推断
            const dataIndex = col.dataIndex
            const recordValue = record[dataIndex]
            const columnKey = col.key || dataIndex

            // 如果值是数组，说明是多消息列，需要展开所有消息
            if (Array.isArray(recordValue) && recordValue.length > 0) {
              // 为每个消息生成展开键，格式：${rowPrefix}-${columnKey}-${index}-${columnKey}
              recordValue.forEach((_: any, index: number) => {
                newSet.add(`${rowPrefix}-${columnKey}-${index}-${columnKey}`)
              })
            }
            else {
              // 普通列：使用 columnKey
              newSet.add(`${rowPrefix}-${columnKey}`)
            }
          }
        })
      }

      return newSet
    })
  }, [getRecordRowKey])

  // 创建图像类型表格列定义（不使用单元格合并，所有内容显示在同一单元格内）
  const createImageDataContentColumns = useCallback((getRowKey: (record: any) => any) => [
    {
      title: '序号',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      align: 'center' as const,
      fixed: 'left' as const,
    },
    {
      title: 'System',
      dataIndex: '_systemMessage',
      key: 'system',
      width: 300,
      align: 'left' as const,
      ellipsis: { showTitle: false },
      getExpandKeys: (record: any, rowKey: any) => {
        const rowPrefix = rowKey?.toString() || '0'
        return [`${rowPrefix}-system`]
      },
      render: (text: string, record: any) => {
        const rowKey = getRowKey(record)
        const systemMessage = record._systemMessage || ''
        const baseRowKey = rowKey?.toString() || '0'
        return (
          <ExpandableCell
            text={systemMessage}
            rowKey={rowKey}
            columnKey="system"
            bgColor="#f0f9ff"
            borderColor="#1890ff"
            isExpanded={expandedCells.has(`${rowKey}-system`)}
            onToggle={toggleCellExpand}
            onHeightChange={handleCellHeightChange}
            synchronizedHeight={getRowMaxHeight(baseRowKey)}
          />
        )
      },
    },
    {
      title: 'User',
      dataIndex: '_userMessages',
      key: 'User',
      width: 400,
      align: 'left' as const,
      ellipsis: { showTitle: false },
      getExpandKeys: (record: any, rowKey: any) => {
        const rowPrefix = rowKey?.toString() || '0'
        const userMessages = record._userMessages || []
        return userMessages.map((_: any, index: number) => `${rowPrefix}-prompt-${index}-prompt`)
      },
      render: (text: any, record: any) => {
        const rowKey = getRowKey(record)
        const userMessages = record._userMessages || []

        // 如果没有内容，返回空
        if (userMessages.length === 0) {
          return <span className="text-gray-400">-</span>
        }

        // 将所有 user messages 用分隔线连接
        return (
          <div className="space-y-2">
            {userMessages.map((msg: string, index: number) => (
              <div key={index}>
                {index > 0 && (
                  <div className="my-2 border-t border-gray-100"></div>
                )}
                <ExpandableCell
                  text={msg}
                  rowKey={`${rowKey}-prompt-${index}`}
                  columnKey="prompt"
                  bgColor="#fff7e6"
                  borderColor="#faad14"
                  isExpanded={expandedCells.has(`${rowKey}-prompt-${index}-prompt`)}
                  onToggle={toggleCellExpand}
                  onHeightChange={handleCellHeightChange}
                  synchronizedHeight={getRowMaxHeight(rowKey)}
                />
              </div>
            ))}
          </div>
        )
      },
    },
    {
      title: 'Assistant',
      dataIndex: '_assistantMessages',
      key: 'assistant',
      width: 400,
      align: 'left' as const,
      ellipsis: { showTitle: false },
      getExpandKeys: (record: any, rowKey: any) => {
        const rowPrefix = rowKey?.toString() || '0'
        const assistantMessages = record._assistantMessages || []
        return assistantMessages.map((_: any, index: number) => `${rowPrefix}-response-${index}-response`)
      },
      render: (text: any, record: any) => {
        const rowKey = getRowKey(record)
        const assistantMessages = record._assistantMessages || []

        // 如果没有内容，返回空
        if (assistantMessages.length === 0) {
          return <span className="text-gray-400">-</span>
        }

        // 将所有 assistant messages 用分隔线连接
        return (
          <div className="space-y-2">
            {assistantMessages.map((msg: string, index: number) => (
              <div key={index}>
                {index > 0 && (
                  <div className="my-2 border-t border-gray-100"></div>
                )}
                <ExpandableCell
                  text={msg}
                  rowKey={`${rowKey}-response-${index}`}
                  columnKey="response"
                  bgColor="#f6ffed"
                  borderColor="#52c41a"
                  isExpanded={expandedCells.has(`${rowKey}-response-${index}-response`)}
                  onToggle={toggleCellExpand}
                  onHeightChange={handleCellHeightChange}
                  synchronizedHeight={getRowMaxHeight(rowKey)}
                />
              </div>
            ))}
          </div>
        )
      },
    },
  ], [expandedCells, toggleCellExpand, handleCellHeightChange, getRowMaxHeight])

  // 创建多轮对话表格列定义（非图像类型）
  const createDataContentColumns = useCallback((getRowKey: (record: any) => any) => [
    {
      title: '序号',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      align: 'center' as const,
      fixed: 'left' as const,
      render: (text: any) => (
        <span className="font-semibold text-blue-500 text-sm">{text}</span>
      ),
    },
    {
      title: 'System',
      dataIndex: 'system',
      key: 'system',
      width: 300,
      align: 'left' as const,
      ellipsis: { showTitle: false },
      getExpandKeys: (record: any, rowKey: any) => {
        const rowPrefix = rowKey?.toString() || '0'
        return [`${rowPrefix}-system`]
      },
      render: (text: string, record: any) => {
        const rowKey = getRowKey(record)
        const baseRowKey = rowKey?.toString() || '0'
        return (
          <ExpandableCell
            text={text}
            rowKey={rowKey}
            columnKey="system"
            bgColor="#f0f9ff"
            borderColor="#1890ff"
            isExpanded={expandedCells.has(`${rowKey}-system`)}
            onToggle={toggleCellExpand}
            onHeightChange={handleCellHeightChange}
            synchronizedHeight={getRowMaxHeight(baseRowKey)}
          />
        )
      },
    },
    {
      title: 'Prompt',
      dataIndex: 'prompt',
      key: 'prompt',
      width: 400,
      align: 'left' as const,
      ellipsis: { showTitle: false },
      getExpandKeys: (record: any, rowKey: any) => {
        const rowPrefix = rowKey?.toString() || '0'
        return [`${rowPrefix}-prompt`]
      },
      render: (text: string, record: any) => {
        const rowKey = getRowKey(record)
        const baseRowKey = rowKey?.toString() || '0'
        return (
          <ExpandableCell
            text={text}
            rowKey={rowKey}
            columnKey="prompt"
            bgColor="#fff7e6"
            borderColor="#faad14"
            isExpanded={expandedCells.has(`${rowKey}-prompt`)}
            onToggle={toggleCellExpand}
            onHeightChange={handleCellHeightChange}
            synchronizedHeight={getRowMaxHeight(baseRowKey)}
          />
        )
      },
    },
    {
      title: 'Response',
      dataIndex: 'response',
      key: 'response',
      width: 400,
      align: 'left' as const,
      ellipsis: { showTitle: false },
      getExpandKeys: (record: any, rowKey: any) => {
        const rowPrefix = rowKey?.toString() || '0'
        return [`${rowPrefix}-response`]
      },
      render: (text: string, record: any) => {
        const rowKey = getRowKey(record)
        const baseRowKey = rowKey?.toString() || '0'
        return (
          <ExpandableCell
            text={text}
            rowKey={rowKey}
            columnKey="response"
            bgColor="#f6ffed"
            borderColor="#52c41a"
            isExpanded={expandedCells.has(`${rowKey}-response`)}
            onToggle={toggleCellExpand}
            onHeightChange={handleCellHeightChange}
            synchronizedHeight={getRowMaxHeight(baseRowKey)}
          />
        )
      },
    },
  ], [expandedCells, toggleCellExpand, handleCellHeightChange, getRowMaxHeight])

  const keys = getBusinessTestKeys(previewData)
  const dynamicSampleKeys = getDynamicSampleKeys(previewData)
  const createDynamicSampleDataContentColumns = useCallback((getRowKey: (record: any) => any) => [
    {
      title: '序号',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      align: 'center' as const,
      fixed: 'left' as const,
      render: (text: any) => (
        <span className="font-semibold text-blue-500 text-sm">{text}</span>
      ),
    },
    ...dynamicSampleKeys.map((key) => ({
      title: key,
      dataIndex: key,
      key,
      width: key === 'prompt' ? 420 : 240,
      align: 'left' as const,
      ellipsis: { showTitle: false },
      getExpandKeys: (_record: any, rowKey: any) => {
        const rowPrefix = rowKey?.toString() || '0'
        return [`${rowPrefix}-${key}`]
      },
      render: (text: unknown, record: any) => {
        const rowKey = getRowKey(record)
        const baseRowKey = rowKey?.toString() || '0'
        const rawValue = record?.item?.sample_data?.[key] ?? record?.[key] ?? text
        const images = record?.item?.sample_data?.images ?? record?.images ?? []
        const baseUrl = record?.base_url || record?.item?.base_url || ''
        const isMessagesValue = isMessageList(rawValue)
        const value = isMessagesValue ? formatMessageList(rawValue, images, baseUrl) : formatPreviewValue(rawValue)
        return (
          <ExpandableCell
            text={value}
            content={isMessagesValue ? renderMessageListContent(rawValue, images, baseUrl) : undefined}
            rowKey={rowKey}
            columnKey={key}
            bgColor={isMessagesValue ? '#fff7e6' : '#f0f9ff'}
            borderColor={isMessagesValue ? '#faad14' : '#1890ff'}
            isExpanded={expandedCells.has(`${rowKey}-${key}`)}
            onToggle={toggleCellExpand}
            onHeightChange={handleCellHeightChange}
            synchronizedHeight={getRowMaxHeight(baseRowKey)}
          />
        )
      },
    })),
  ], [dynamicSampleKeys, expandedCells, toggleCellExpand, handleCellHeightChange, getRowMaxHeight])

  const createBusinessTestDataContentColumns = useCallback((getRowKey: (record: any) => any) => [
    {
      title: '序号',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    ...keys?.map((key) => ({
      title: key,
      dataIndex: key,
      key,
      width: 100,
      getExpandKeys: (record: any, rowKey: any) => {
        const rowPrefix = rowKey?.toString() || '0'
        return [`${rowPrefix}-${key}`]
      },
      render: (text: string, record: any) => {
        const value = record?.item?.sample_data[key] || text
        const rowKey = getRowKey(record)
        const baseRowKey = rowKey?.toString() || '0'
        return (
          <ExpandableCell
            text={value}
            rowKey={rowKey}
            columnKey={key}
            bgColor="#f0f9ff"
            borderColor="#1890ff"
            isExpanded={expandedCells.has(`${rowKey}-${key}`)}
            onToggle={toggleCellExpand}
            onHeightChange={handleCellHeightChange}
            synchronizedHeight={getRowMaxHeight(baseRowKey)}
          />
        )
      },
    })),
  ], [keys, expandedCells, toggleCellExpand, handleCellHeightChange, getRowMaxHeight])

  const handleNewVersionClick = () => {
    const blockedReason = getNewVersionBlockedReason()
    if (blockedReason) {
      message.warning(blockedReason)
      return
    }

    if (type === 'training') {
      navigate(`/project/${projectId}/datasets/training/${datasetId}/new-version`)
    }
    else {
      switch (usage) {
        case 'validation':
          navigate(`/project/${projectId}/datasets/validation/${datasetId}/new-version`)
          break
        case 'business_test':
          navigate(`/project/${projectId}/business-test/training/${datasetId}/new-version`)
          break
        case 'test':
          navigate(`/project/${projectId}/measurement/testing/${datasetId}/new-version`)
          break
        default:
          navigate(`/project/${projectId}/datasets/training/${datasetId}/new-version`)
          break
      }
    }
  }

  const handleActionClick = () => {
    localStorage.setItem('datasetInfo', JSON.stringify(selectedVersion))
    if (type === 'training' || usage === 'validation') {
      navigate(`/project/${projectId}/training/create?datasetId=${datasetId}&datasetName=${usage}`)
    }
    else {
      navigate(`/project/${projectId}/effect-evaluation/auto/create`, {
        state: {
          inferenceDatasetId: dataset.id,
          dataset_type: dataset.dataset_type,
        },
      })
    }
  }

  useEffect(() => {
    if (selectedVersion?.dataset_type === 'image-understanding' || selectedVersion?.dataset_type === 'image-generation') {
      console.log(expandImageData(previewData), 'previewData')
    }
  }, [previewData, selectedVersion])

  const back = () => {
    switch (usage) {
      case 'training':
        navigate(`/project/${projectId}/datasets`)
        break
      case 'business_test':
        navigate(`/project/${projectId}/business-test`)
        break
      case 'test':
        navigate(`/project/${projectId}/measurement`)
        break
      case 'validation':
        navigate(`/project/${projectId}/datasets?key=validation`)
        break
      default:
        navigate(-1)
        break
    }
  }

  if (isLoading) {
    return (
      <div className="text-center p-[50px]">
        <Spin size="large" tip="加载中..." />
      </div>
    )
  }

  if (!dataset) {
    return (
      <div className="text-center p-[50px]">
        <Text type="secondary">数据集不存在</Text>
      </div>
    )
  }

  // 使用selectedVersion而非dataset来显示详情
  if (!selectedVersion) {
    return (
      <div className="text-center p-[50px]">
        <Text type="secondary">请选择数据集版本</Text>
      </div>
    )
  }

  return (
    <Card className="m-[24px]">
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={back}
        className="mb-4"
      >
        返回
      </Button>

      <Row gutter={16}>
        <Col span={24}>
          <div className="flex justify-end items-center gap-12 not-last:pl-[6px] pr-[12px]">
            <div className="flex gap-6">
              {(() => {
                const statusDisplay = selectedVersion?.processing_status_display || ''
                const isCreating = isDatasetCreating(statusDisplay)
                const isCreateFailed = isDatasetCreateFailed(statusDisplay)
                const isPublishing = publishingVersion === selectedVersion?.version
                const isRowDeleting = deletingRowNumber !== null || isActiveDeleteOperationRunning
                const isButtonDisabled = deletingVersion === selectedVersion?.version || isPublishing || isCreating || isCreateFailed || isRowDeleting
                const isDeleteVersionDisabled = deletingVersion === selectedVersion?.version || isPublishing || isCreating || isRowDeleting
                const isUnpublished = isVersionUnpublished(selectedVersion)
                return (
                  <>
                    {(isUnpublished || (type !== 'test' && selectedVersion?.dataset_type !== 'image-understanding'))
                    && (
                      <Button
                        type="primary"
                        onClick={isUnpublished ? handlePublishVersion : handleActionClick}
                        loading={isPublishing}
                        disabled={isButtonDisabled}
                      >
                        {isUnpublished ? '发布' : (type === 'training' || usage === 'validation' ? '去训练' : '去评估')}
                      </Button>
                    )}
                    <Dropdown
                      menu={{
                        items: [
                          ...(
                            selectedVersion?.dataset_type === 'image-understanding'
                              ? [
                                  {
                                    key: 'zip',
                                    label: 'ZIP',
                                    onClick: () => downloadDataset(selectedVersion.version, 'zip'),
                                  },
                                ]
                              : [
                                  {
                                    key: 'json',
                                    label: 'JSON',
                                    onClick: () => downloadDataset(selectedVersion.version, 'json'),
                                  },
                                  {
                                    key: 'jsonl',
                                    label: 'JSONL',
                                    onClick: () => downloadDataset(selectedVersion.version, 'jsonl'),
                                  },
                                  {
                                    key: 'xlsx',
                                    label: 'XLSX',
                                    onClick: () => downloadDataset(selectedVersion.version, 'xlsx'),
                                  },
                                ]
                          ),
                        ],
                      }}
                      disabled={isButtonDisabled}
                    >
                      <Button type="primary">
                        下载
                        {' '}
                        <DownOutlined />
                      </Button>
                    </Dropdown>
                    <Popconfirm
                      title="确认删除"
                      placement="topLeft"
                      description={`确定要删除版本 ${selectedVersion.version} 吗？删除后将无法恢复。`}
                      onConfirm={() => deleteDatasetVersion(selectedVersion.version)}
                      okText="确认删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                    >
                      <Button
                        danger
                        loading={deletingVersion === selectedVersion.version}
                        disabled={isDeleteVersionDisabled}
                      >
                        删除
                      </Button>
                    </Popconfirm>
                  </>
                )
              })()}
            </div>
          </div>
        </Col>
      </Row>
      <Row gutter={16} className="flex flex-nowrap">
        <Col flex="0 0 160px" className="min-w-0">
          <div className="text-center mb-4">
            {(() => {
              const blockedReason = getNewVersionBlockedReason()
              const disabled = deletingRowNumber !== null || isActiveDeleteOperationRunning || !!blockedReason
              const button = (
                <Button
                  type="primary"
                  size="large"
                  block
                  disabled={disabled}
                  onClick={handleNewVersionClick}
                >
                  新增版本
                </Button>
              )
              return disabled
                ? (
                    <Tooltip title={blockedReason || '数据处理中，请稍后再试'}>
                      <span className="block">{button}</span>
                    </Tooltip>
                  )
                : button
            })()}
          </div>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {Array.isArray(dataset) ? dataset.map((item) => (
              <div
                key={item.id}
                className={`relative px-4 py-3 pr-[76px] cursor-pointer transition-all duration-200 ${selectedVersion.id === item.id
                  ? 'bg-blue-50 border-l-4 border-blue-500 -ml-px font-medium text-blue-500'
                  : 'bg-white border-l-4 border-transparent font-normal text-gray-800'
                }`}
                onClick={() => handleVersionChange(item)}
              >
                {renderPublishStatusBadge(item)}
                {item.version}
              </div>
            )) : (
            // 如果dataset不是数组，则显示单一版本
              <div className="relative px-4 py-3 pr-[76px] bg-blue-50 border-l-4 border-blue-500 -ml-px font-medium text-blue-500">
                {renderPublishStatusBadge(selectedVersion)}
                v1.0
              </div>
            )}
          </div>
        </Col>
        <Col flex="1" className="px-[24px] min-w-[400px]">
          <div className="border-l border-[#e8e8e8] px-[12px] py-[12px]">
            {/* 数据集基本信息 */}
            <Card
              title={(
                <span className="text-blue-400">
                  <FileTextOutlined />
                  {' '}
                  基本信息
                </span>
              )}
              className="mb-4"
            >
              <BasicView data={selectedVersion} usage={usage} onEditBasicInfo={handleEditBasicInfo} />
            </Card>

            {/* 数据预览 */}
            <Card
              title={renderDataDetailTitle()}
              className="!mt-4"
            >
              {isPreviewLoading ? (
                <div className="text-center p-[50px]">
                  <Spin tip="加载详情数据中..." />
                </div>
              ) : previewData.length > 0 ? (() => {
                // 动态确定使用的 columns 和创建函数
                let createColumnsFn: (getRowKey: (record: any) => any) => any[]
                const firstPreviewItem = previewData[0]
                const isDpoRoleBased = isDpoRoleBasedPreview(firstPreviewItem)
                const isDpoAlpaca = isDpoAlpacaPreview(firstPreviewItem)
                const isGrpoPreview = selectedVersion?.dataset_format === 'grpo' || selectedVersion?.training_method_type === 'grpo'

                if (isDpoRoleBased) {
                  createColumnsFn = createDpoRoleBasedDataContentColumns
                }
                else if (isDpoAlpaca) {
                  createColumnsFn = createDpoAlpacaDataContentColumns
                }
                else if (isGrpoPreview) {
                  createColumnsFn = createDynamicSampleDataContentColumns
                }
                else if (selectedVersion?.dataset_type === 'image-understanding' || selectedVersion?.dataset_type === 'image-generation') {
                  createColumnsFn = createImageDataContentColumns
                }
                else if (previewData.length > 0 && (previewData[0].messages || previewData[0].sample_data?.messages)) {
                  createColumnsFn = createImageDataContentColumns
                }
                else if (selectedVersion?.dataset_type === 'business') {
                  createColumnsFn = createBusinessTestDataContentColumns
                }
                else {
                  createColumnsFn = createDataContentColumns
                }

                // 创建 getRowKey 函数（从第一个有 dataIndex 的列获取）
                const getRowKey = (record: any) => {
                  return record.id || record.key || record.row_number
                }

                // 生成最终的 columns
                const currentColumns = createColumnsFn(getRowKey)
                const tableColumns = (canDeletePreviewRows() || isActiveDeleteOperationRunning || isActiveDeleteOperationFailed)
                  ? [
                      ...currentColumns,
                      {
                        title: '操作',
                        key: 'action',
                        width: 100,
                        align: 'center' as const,
                        className: 'dataset-detail-action-cell',
                        onCell: () => ({
                          className: 'dataset-detail-action-cell',
                          style: {
                            verticalAlign: 'middle',
                          },
                        }),
                        render: (_: unknown, record: any) => {
                          const rowNumber = getPreviewRowNumber(record)
                          const isTargetDeleting = rowNumber !== undefined && activeDeleteRowNumbers.has(rowNumber)
                          const isTargetDeleteFailed = rowNumber !== undefined && failedDeleteRowNumbers.has(rowNumber)
                          return (
                            <div className="dataset-detail-action-wrapper">
                              {isTargetDeleting ? (
                                <Button
                                  type="link"
                                  size="small"
                                  className="dataset-detail-action-delete"
                                  loading
                                  disabled
                                >
                                  删除中
                                </Button>
                              ) : isTargetDeleteFailed ? (
                                <Tooltip title="重新提交该条数据的删除任务">
                                  <Button
                                    type="link"
                                    size="small"
                                    danger
                                    onClick={() => rowNumber !== undefined && submitDeleteRows([rowNumber])}
                                  >
                                    重试删除
                                  </Button>
                                </Tooltip>
                              ) : (
                                <Popconfirm
                                  title="确认删除该条数据？"
                                  description="数据集较大时删除可能需要较长时间。确认后将进入后台处理，处理完成前该版本不可发布、删除、创建新版本或合并版本。"
                                  okText="确认删除"
                                  cancelText="取消"
                                  okButtonProps={{ danger: true }}
                                  onConfirm={() => handleDeletePreviewRow(record)}
                                  disabled={!rowNumber || isActiveDeleteOperationRunning}
                                >
                                  <Button
                                    type="link"
                                    size="small"
                                    className="dataset-detail-action-delete"
                                    loading={deletingRowNumber === rowNumber}
                                    disabled={!rowNumber || isActiveDeleteOperationRunning}
                                  >
                                    删除
                                  </Button>
                                </Popconfirm>
                              )}
                            </div>
                          )
                        },
                      },
                    ]
                  : currentColumns

                return (
                  <Table
                    columns={tableColumns}
                    dataSource={
                      isDpoRoleBased || isDpoAlpaca || isGrpoPreview
                        ? previewData
                        : (selectedVersion?.dataset_type === 'image-understanding' || selectedVersion?.dataset_type === 'image-generation')
                            ? expandImageData(previewData)
                            : (previewData.length > 0 && (previewData[0].messages || previewData[0].sample_data?.messages))
                                ? expandImageData(previewData)
                                : previewData
                    }
                    pagination={{
                      current: dataContentPage,
                      pageSize: dataContentPageSize,
                      // 重要：total 使用原始数据总数，而不是展开后的行数
                      // messages 只用于合并单元格显示，不影响分页计算
                      total: previewTotal,
                      showSizeChanger: false,
                      showQuickJumper: true,
                      showTotal: (total) => `共 ${total} 条记录`,
                      // pageSizeOptions: ["10", "20", "50"],
                      onChange: (page, pageSize) => {
                        setDataContentPage(page)
                        setDataContentPageSize(pageSize || 10)
                        // 当分页变化时，重新获取数据
                        if (selectedVersion) {
                          handleVersionChange(selectedVersion, page, pageSize || 10)
                        }
                      },
                    }}
                    scroll={{ x: 1200 }}
                    size="middle"
                    bordered
                    rowClassName={(record, index) => {
                      const baseClass = index % 2 === 0 ? 'bg-gray-50 hover:bg-blue-50' : 'bg-white hover:bg-blue-50'
                      if (isRowInFailedDeleteOperation(record)) {
                        return 'bg-red-50 hover:bg-red-50 text-red-700'
                      }
                      return isRowInActiveDeleteOperation(record)
                        ? `${baseClass} opacity-50`
                        : baseClass
                    }}
                    className="dataset-detail-preview-table bg-white"
                    rowKey={(record) => {
                      return getRecordRowKey(record, tableColumns)
                    }}
                    onRow={(record) => ({
                      onClick: (e) => {
                        // 如果点击的是按钮、输入框、链接等交互元素，不触发行展开
                        const target = e.target as HTMLElement
                        if (!isInteractiveElement(target)) {
                          toggleRowExpand(record, currentColumns)
                        }
                      },
                      style: {
                        cursor: 'pointer',
                        ...(isRowInFailedDeleteOperation(record) ? { color: '#cf1322' } : {}),
                        ...(isRowInActiveDeleteOperation(record) ? { color: '#8c8c8c' } : {}),
                      },
                    })}
                  />
                )
              })() : (
                <div className="text-center p-[50px]">
                  <Text type="secondary">暂无数据内容</Text>
                </div>
              )}
            </Card>
          </div>
        </Col>
      </Row>
    </Card>
  )
}

export default DatasetDetail
