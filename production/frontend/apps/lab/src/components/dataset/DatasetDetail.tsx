import { Button, Card, Col, Dropdown, Modal, Popconfirm, Row, Spin, Table, Typography, message } from 'antd'
import { ArrowLeftOutlined, DatabaseOutlined, DownOutlined, FileTextOutlined } from '@ant-design/icons'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import React, { useCallback, useEffect, useState } from 'react'
import BasicView from './DatasetDetailBasicView'
import { useDatasetDetailDpoColumns } from './DatasetDetailDpoColumns'
import DatasetVersionMergeModal from './DatasetVersionMergeModal'
import { formatDatasetPreviewItems, getBusinessTestKeys, isDpoAlpacaPreview, isDpoRoleBasedPreview } from './datasetPreviewFormat'
import { trainingDatasetService } from '@/services/trainingApi.ts'
import ExpandableCell from '@/components/common/ExpandableCell.tsx'
import { expandImageData } from '@/utils/imageUtils.ts'
import { isInteractiveElement } from '@/utils/domUtils'
import { downloadBlobFile, extractFilenameFromHeaders, getContentType, processFilenameExtension } from '@/utils/download.ts'
import './DatasetDetail.css'

const { Text } = Typography

interface DatasetAsyncExportResponse {
  message?: string
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
  const [mergeVersionOpen, setMergeVersionOpen] = useState(false)
  const [mergeVersionLoading, setMergeVersionLoading] = useState(false)
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

  const pickSelectedVersionFromDetail = (detail: any, currentVersion: any) => {
    if (!Array.isArray(detail)) {
      return detail
    }
    return detail.find((item: any) => item.id === currentVersion?.id)
      || detail.find((item: any) => item.version === currentVersion?.version)
      || detail[detail.length - 1]
      || currentVersion
  }

  const buildNextVersion = (versions: any[]) => {
    const maxVersionNumber = versions.reduce((max, versionItem) => {
      const match = String(versionItem?.version || '').match(/^V?(\d+)$/i)
      return Math.max(max, match ? Number(match[1]) : 0)
    }, 0)
    return `V${maxVersionNumber + 1}`
  }

  const mergeableVersions = Array.isArray(dataset) ? dataset : selectedVersion ? [selectedVersion] : []
  const nextMergeVersion = buildNextVersion(mergeableVersions)

  const handleMergeVersions = async (sourceVersionIds: number[], description?: string) => {
    if (!projectId || !datasetId) return
    setMergeVersionLoading(true)
    try {
      const createdVersion = await trainingDatasetService.mergeVersions(Number(projectId), datasetId, usage, {
        new_version: nextMergeVersion,
        source_version_ids: sourceVersionIds,
        description,
      })
      message.success('已提交版本合并任务')
      setMergeVersionOpen(false)
      queryClient.invalidateQueries({
        predicate: (query) => {
          const queryKey = query.queryKey
          return Array.isArray(queryKey)
            && queryKey.length > 0
            && (queryKey[0] === 'training-datasets' || queryKey[0] === `${type}-dataset-detail`)
        },
      })
      const result = await refetch()
      if (result.data) {
        setSelectedVersion(pickSelectedVersionFromDetail(result.data, createdVersion))
      }
    }
    catch (error) {
      console.error('合并数据集版本失败:', error)
      message.error('合并数据集版本失败')
    }
    finally {
      setMergeVersionLoading(false)
    }
  }

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
                const isProcessingOrFailed = ['处理中', '处理失败'].includes(statusDisplay)
                const isButtonDisabled = deletingVersion === selectedVersion?.version || isProcessingOrFailed
                return (
                  <>
                    {type !== 'test'
                    && selectedVersion?.dataset_type !== 'image-understanding'
                    && (
                      <Button
                        type="primary"
                        onClick={handleActionClick}
                        disabled={isButtonDisabled}
                      >
                        {type === 'training' || usage === 'validation' ? '去训练' : '去评估'}
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
                        disabled={deletingVersion === selectedVersion.version}
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
            <Button
              type="primary"
              size="large"
              block
              onClick={handleNewVersionClick}
            >
              新增版本
            </Button>
            <Button
              className="mt-2"
              block
              disabled={mergeableVersions.length < 2 || selectedVersion?.dataset_type === 'image-understanding'}
              onClick={() => setMergeVersionOpen(true)}
            >
              合并版本
            </Button>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {Array.isArray(dataset) ? dataset.map((item) => (
              <div
                key={item.id}
                className={`px-4 py-3 cursor-pointer transition-all duration-200 ${selectedVersion.id === item.id
                  ? 'bg-blue-50 border-l-4 border-blue-500 -ml-px font-medium text-blue-500'
                  : 'bg-white border-l-4 border-transparent font-normal text-gray-800'
                }`}
                onClick={() => handleVersionChange(item)}
              >
                {item.version}
              </div>
            )) : (
            // 如果dataset不是数组，则显示单一版本
              <div className="px-4 py-3 bg-blue-50 border-l-4 border-blue-500 -ml-px font-medium text-blue-500">
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
              title={(
                <span className="text-blue-400">
                  <DatabaseOutlined />
                  {' '}
                  数据详情
                </span>
              )}
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

                if (isDpoRoleBased) {
                  createColumnsFn = createDpoRoleBasedDataContentColumns
                }
                else if (isDpoAlpaca) {
                  createColumnsFn = createDpoAlpacaDataContentColumns
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

                return (
                  <Table
                    columns={currentColumns}
                    dataSource={
                      isDpoRoleBased || isDpoAlpaca
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
                    rowClassName={(record, index) =>
                      index % 2 === 0 ? 'bg-gray-50 hover:bg-blue-50' : 'bg-white hover:bg-blue-50'}
                    className="dataset-detail-preview-table bg-white"
                    rowKey={(record) => {
                      return getRecordRowKey(record, currentColumns)
                    }}
                    onRow={(record) => ({
                      onClick: (e) => {
                        // 如果点击的是按钮、输入框、链接等交互元素，不触发行展开
                        const target = e.target as HTMLElement
                        if (!isInteractiveElement(target)) {
                          toggleRowExpand(record, currentColumns)
                        }
                      },
                      style: { cursor: 'pointer' },
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
      <DatasetVersionMergeModal
        open={mergeVersionOpen}
        loading={mergeVersionLoading}
        datasetName={selectedVersion?.name || datasetId || ''}
        nextVersion={nextMergeVersion}
        versions={mergeableVersions}
        onCancel={() => setMergeVersionOpen(false)}
        onSubmit={handleMergeVersions}
      />
    </Card>
  )
}

export default DatasetDetail
