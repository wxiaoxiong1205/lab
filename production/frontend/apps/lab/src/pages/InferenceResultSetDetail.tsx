/*
 * @Author: fangjun fangjun@deepexi.com
 * @Date: 2025-01-XX XX:XX:XX
 * @LastEditors: fangjun fangjun@deepexi.com
 * @LastEditTime: 2025-01-XX XX:XX:XX
 * @FilePath: \deepexi-lab-web\src\pages\InferenceResultSetDetail.tsx
 * @Description: 推理结果集详情页面组件
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Card,
  Col,
  Descriptions,
  Dropdown,
  Row,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  CodeOutlined,
  DatabaseOutlined,
  DownOutlined,
  DownloadOutlined,
  FileTextOutlined,
  ReloadOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { inferenceResultSetService } from '@/services/inferenceApi'
import { InferenceProgressStatus } from '@/types/inference/index'
import ExpandableCell from '@/components/common/ExpandableCell'
import TaskLogsPage from '@/components/common/TaskLogsPage'
import { parseUserAssistantTags, replaceImagePlaceholders } from '@/utils/imageUtils'
import { isInteractiveElement } from '@/utils/domUtils'
import { downloadBlobFile, extractFilenameFromHeaders, getContentType, processFilenameExtension } from '@/utils/download.ts'
import './InferenceResultSetDetail.css'

const { Paragraph, Text } = Typography

interface DatasetAsyncExportResponse {
  message?: string
}

/**
 * 推理结果集详情页面组件
 */
const InferenceResultSetDetail: React.FC<{ usage?: string }> = ({ usage }) => {
  const { projectId, datasetId } = useParams<{
    projectId: string
    datasetId: string
  }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // 状态管理
  const [activeTab, setActiveTab] = useState<string>('detail')
  const [dataContentPage, setDataContentPage] = useState(1)
  const [dataContentPageSize, setDataContentPageSize] = useState(10)
  const [previewData, setPreviewData] = useState<any[]>([])
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [previewTotal, setPreviewTotal] = useState(0)
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set())
  const [baseUrl, setBaseUrl] = useState<string>('')
  const [editingBasicField, setEditingBasicField] = useState<'name' | 'description' | null>(null)

  // 任务日志相关状态
  const [logs, setLogs] = useState<any[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  // 下载日志
  const downloadLogs = async () => {
    if (!logs || logs.length === 0) {
      message.warning('暂无日志可下载')
      return
    }

    try {
      const logContent = logs
        .map((log: any, index: number) => {
          let logContent = ''
          if (typeof log === 'string') {
            logContent = log
          }
          else if (log && typeof log === 'object') {
            if (log.message) {
              logContent = log.message
            }
            else if (log.text || log.content || log.log) {
              logContent = log.text || log.content || log.log
            }
            else {
              logContent = JSON.stringify(log, null, 2)
            }
          }
          else {
            logContent = String(log)
          }
          return `${index}: ${logContent}`
        })
        .join('\n')

      const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute(
        'download',
        `推理任务日志_${dataset?.name || 'logs'}_${new Date().toISOString().split('T')[0]}.txt`,
      )
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      message.success('日志下载成功')
    }
    catch (error) {
      console.error('下载日志失败:', error)
      message.error('下载日志失败')
    }
  }

  // 表格容器宽度监听
  const tableContainerRef = useRef<HTMLDivElement>(null)
  // 使用窗口宽度作为初始值
  const [tableContainerWidth, setTableContainerWidth] = useState(window.innerWidth)

  useEffect(() => {
    const updateTableWidth = () => {
      if (tableContainerRef.current) {
        const width = tableContainerRef.current.offsetWidth
        if (width > 0) {
          setTableContainerWidth(width)
        }
      }
    }

    // 初始计算（延迟执行，确保 DOM 已渲染）
    const timer = setTimeout(() => {
      updateTableWidth()
    }, 0)

    // 使用 ResizeObserver 监听容器宽度变化
    const resizeObserver = new ResizeObserver(() => {
      updateTableWidth()
    })

    if (tableContainerRef.current) {
      resizeObserver.observe(tableContainerRef.current)
    }

    // 同时监听窗口大小变化（作为备用）
    const handleResize = () => {
      updateTableWidth()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      clearTimeout(timer)
      resizeObserver.disconnect()
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  // 获取数据集详情
  const { data: dataset, isLoading, refetch } = useQuery({
    queryKey: ['inference-result-set-detail', projectId, datasetId],
    queryFn: async () => {
      const data = await inferenceResultSetService.detail(
        Number(projectId),
        datasetId!,
      )

      return data
    },
    enabled: !!datasetId && !!projectId,
    staleTime: 0,
  })

  // 加载预览数据
  useEffect(() => {
    if (!dataset || !projectId || !datasetId) return

    const loadPreviewData = async () => {
      setIsPreviewLoading(true)
      try {
        const data = await inferenceResultSetService.preview(
          Number(projectId),
          datasetId,
          dataContentPage,
          dataContentPageSize,
        )
        // 保存 base_url
        setBaseUrl(data.base_url || '')
        const formattedData = (data.items || []).map((item: any, index: number) => {
          return {
            ...item,
            key: item.sequence || item.id || index + 1,
            id: item.sequence || item.id || index + 1,
            base_url: data.base_url || '', // 确保每个 item 都有 base_url
            images: item.images || [], // 确保每个 item 都有 images 数组
          }
        })
        setPreviewData(formattedData)
        setPreviewTotal(data.total || 0)
      }
      catch (error) {
        console.error('获取预览数据失败:', error)
      }
      finally {
        setIsPreviewLoading(false)
      }
    }
    if (dataset.status === '已完成') {
      loadPreviewData()
    }
    else {
      setPreviewData([])
      setPreviewTotal(0)
    }
  }, [dataset, projectId, datasetId, dataContentPage, dataContentPageSize])

  // 加载任务日志
  const fetchLogs = async () => {
    if (!dataset || !projectId || !dataset.id) return

    setLogsLoading(true)
    try {
      const endTime = new Date().toISOString()
      const data = await inferenceResultSetService.getInferenceLogs(
        Number(projectId),
        dataset.id,
        endTime,
        30,
      )
      setLogs(data.logs || [])
    }
    catch (error) {
      message.error('获取任务日志失败')
    }
    finally {
      setLogsLoading(false)
    }
  }

  // 当切换到任务日志标签页时加载日志
  useEffect(() => {
    if (activeTab === 'logs' && dataset?.id && dataset?.inference_method !== 'import') {
      fetchLogs()
    }
    // 如果当前在日志标签页但推理方式是导入，则切换回详情标签页
    if (activeTab === 'logs' && dataset?.inference_method === 'import') {
      setActiveTab('detail')
    }
  }, [activeTab, dataset?.id, dataset?.inference_method])

  // 渲染推理进度状态
  const getProgressStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string, text: string }> = {
      [InferenceProgressStatus.CREATED]: {
        color: 'orange',
        text: '排队中',
      },
      [InferenceProgressStatus.PROCESSING]: {
        color: 'blue',
        text: '进行中',
      },
      [InferenceProgressStatus.COMPLETED]: {
        color: 'green',
        text: '已完成',
      },
      [InferenceProgressStatus.FAILED]: {
        color: 'red',
        text: '失败',
      },
    }

    const config
      = statusMap[status] || { color: 'default', text: status || '未知' }
    return <Tag color={config.color}>{config.text}</Tag>
  }

  // 渲染推理方式标签
  const getInferenceMethodTag = (method: string) => {
    const methodMap: Record<string, { color: string, text: string }> = {
      online: { color: 'blue', text: '在线推理' },
      import: { color: 'blue', text: '导入推理结果集' },
      third_api: { color: 'blue', text: 'API服务' },
      offline: { color: 'blue', text: '离线推理' },
    }

    const config = methodMap[method] || {
      color: 'default',
      text: method || '未知',
    }
    return <Tag color={config.color}>{config.text}</Tag>
  }

  // 去评估
  const handleEvaluate = () => {
    if (!dataset) return

    // 导航到评估创建页面，通过 state 传递推理结果集ID
    navigate(`/project/${projectId}/effect-evaluation/auto/create`, {
      state: {
        inferenceDatasetId: dataset.id,
        dataset_type: dataset.dataset_type,
        usage,
      },
    })
  }

  const downloadDataset = async (exportType?: string) => {
    try {
      const defaultFilename = dataset?.name || '推理结果集'

      const response = await inferenceResultSetService.download(Number(projectId), datasetId!, exportType)

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
      const filename = processFilenameExtension(filenameFromHeaders, exportType, undefined, contentType)
      downloadBlobFile(blob, filename)

      message.success('文件下载成功')
    }
    catch (error) {
      console.error('下载失败:', error)
      message.error('下载失败')
    }
  }

  const handleEditBasicInfo = useCallback(async (field: 'name' | 'description', value: string) => {
    if (!dataset?.id || !projectId) return

    const nextValue = value.trim()
    const currentValue = field === 'name' ? dataset.name || '' : dataset.description || ''

    if (field === 'name' && !nextValue) {
      message.warning('推理结果集名称不能为空')
      return
    }
    if (nextValue === currentValue) {
      return
    }

    setEditingBasicField(field)
    try {
      await inferenceResultSetService.edit(
        Number(projectId),
        dataset.id,
        field === 'name' ? nextValue : dataset.name,
        field === 'description' ? nextValue : dataset.description,
      )
      message.success('推理结果集信息更新成功')
      await queryClient.invalidateQueries({
        queryKey: ['inference-result-sets', Number(projectId)],
      })
      await refetch()
    }
    catch (error) {
      console.error('更新推理结果集信息失败:', error)
      message.error('推理结果集信息更新失败')
    }
    finally {
      setEditingBasicField(null)
    }
  }, [dataset?.description, dataset?.id, dataset?.name, projectId, queryClient, refetch])

  const toggleCellExpand = (rowKey: string, columnKey: string) => {
    const cellKey = `${rowKey}-${columnKey}`
    setExpandedCells((prev) => {
      const newSet = new Set(prev)

      newSet.has(cellKey) ? newSet.delete(cellKey) : newSet.add(cellKey)
      return newSet
    })
  }

  // 获取业务推理结果集的动态表头键（从 data 字段中获取）
  const getKeys = useMemo(() => {
    if (usage !== 'business-inference' || !previewData || previewData.length === 0) {
      return []
    }
    // 从第一个 item 的 data 字段中获取键
    const firstItem = previewData[0]
    const data = firstItem?.data

    if (data && typeof data === 'object') {
      return Object.keys(data)
    }
    return []
  }, [previewData, usage])

  // 统一获取列键数组（动态或固定列）
  const getColumnKeys = useMemo(() => {
    if (usage === 'business-inference') {
      // 业务推理结果集：从 data 字段动态获取
      return getKeys
    }
    else {
      // 非业务推理结果集：固定列
      return ['system', 'prompt', 'standard_response', 'model_response']
    }
  }, [usage, getKeys])

  // 切换行的展开/收起状态（点击行任意位置）
  const toggleRowExpand = useCallback((record: any) => {
    const rowKey = record.key || record.id || record.sequence
    const rowPrefix = rowKey?.toString() || '0'

    setExpandedCells((prev) => {
      const newSet = new Set(prev)
      const columnKeys = getColumnKeys

      // 检查当前行是否已展开（通过检查第一个列是否展开）
      const firstKey = columnKeys[0]
      const isCurrentlyExpanded = firstKey ? newSet.has(`${rowPrefix}-${firstKey}`) : false

      if (isCurrentlyExpanded) {
        // 收起：收起同一行的所有列单元格
        const keysToDelete: string[] = []
        prev.forEach((k) => {
          // 匹配所有列
          columnKeys.forEach((key) => {
            if (k === `${rowPrefix}-${key}`) {
              keysToDelete.push(k)
            }
          })
        })
        keysToDelete.forEach((k) => newSet.delete(k))
      }
      else {
        // 展开：展开同一行的所有列单元格
        columnKeys.forEach((key) => {
          newSet.add(`${rowPrefix}-${key}`)
        })
      }

      return newSet
    })
  }, [getColumnKeys])

  // 数据预览表格列定义（响应式宽度）
  // const { dataContentColumns, tableScrollX } = useMemo(() => {
  //   // 序号列固定宽度
  //   const ID_COLUMN_WIDTH = 80;

  //   // 使用容器宽度（如果为 0 则使用窗口宽度作为备用）
  //   const effectiveWidth = tableContainerWidth > 0 ? tableContainerWidth : window.innerWidth;

  //   const cardPadding = 48;
  //   const tableBorder = 2;
  //   const availableWidth = effectiveWidth - cardPadding - tableBorder;

  //   // 定义列的最小宽度
  //   const MIN_SYSTEM_WIDTH = 150;
  //   const MIN_PROMPT_WIDTH = 180;
  //   const MIN_STANDARD_RESPONSE_WIDTH = 180;
  //   const MIN_MODEL_RESPONSE_WIDTH = 180;
  //   const MIN_TOTAL_WIDTH = ID_COLUMN_WIDTH + MIN_SYSTEM_WIDTH + MIN_PROMPT_WIDTH + MIN_STANDARD_RESPONSE_WIDTH + MIN_MODEL_RESPONSE_WIDTH;

  //   // 计算其他列的可用宽度
  //   const otherColumnsWidth = Math.max(
  //     availableWidth - ID_COLUMN_WIDTH,
  //     MIN_TOTAL_WIDTH - ID_COLUMN_WIDTH
  //   );

  //   // 如果可用宽度不足，按比例缩小最小宽度
  //   let systemWidth, promptWidth, standardResponseWidth, modelResponseWidth;
  //   if (otherColumnsWidth < MIN_SYSTEM_WIDTH + MIN_PROMPT_WIDTH + MIN_STANDARD_RESPONSE_WIDTH + MIN_MODEL_RESPONSE_WIDTH) {
  //     // 宽度不足时，按比例分配
  //     const totalMinWidth = MIN_SYSTEM_WIDTH + MIN_PROMPT_WIDTH + MIN_STANDARD_RESPONSE_WIDTH + MIN_MODEL_RESPONSE_WIDTH;
  //     const scale = otherColumnsWidth / totalMinWidth;
  //     systemWidth = Math.floor(MIN_SYSTEM_WIDTH * scale);
  //     promptWidth = Math.floor(MIN_PROMPT_WIDTH * scale);
  //     standardResponseWidth = Math.floor(MIN_STANDARD_RESPONSE_WIDTH * scale);
  //     modelResponseWidth = otherColumnsWidth - systemWidth - promptWidth - standardResponseWidth; // 确保总宽度准确
  //   } else {
  //     // 各列平均分配宽度
  //     const avgWidth = Math.floor(otherColumnsWidth / 4);
  //     systemWidth = Math.max(avgWidth, MIN_SYSTEM_WIDTH);
  //     promptWidth = Math.max(avgWidth, MIN_PROMPT_WIDTH);
  //     standardResponseWidth = Math.max(avgWidth, MIN_STANDARD_RESPONSE_WIDTH);
  //     modelResponseWidth = otherColumnsWidth - systemWidth - promptWidth - standardResponseWidth;

  //     // 确保所有列都不小于最小宽度
  //     const columns = [
  //       { name: 'system', width: systemWidth, min: MIN_SYSTEM_WIDTH },
  //       { name: 'prompt', width: promptWidth, min: MIN_PROMPT_WIDTH },
  //       { name: 'standard', width: standardResponseWidth, min: MIN_STANDARD_RESPONSE_WIDTH },
  //       { name: 'model', width: modelResponseWidth, min: MIN_MODEL_RESPONSE_WIDTH }
  //     ];

  //     // 从最小宽度的列开始调整
  //     let remainingWidth = otherColumnsWidth;
  //     columns.forEach(col => {
  //       if (col.width < col.min) {
  //         const diff = col.min - col.width;
  //         col.width = col.min;
  //         remainingWidth -= diff;
  //       }
  //     });

  //     // 重新分配剩余宽度
  //     const adjustableColumns = columns.filter(col => col.width > col.min);
  //     if (adjustableColumns.length > 0 && remainingWidth > 0) {
  //       const extraWidth = Math.floor(remainingWidth / adjustableColumns.length);
  //       adjustableColumns.forEach(col => col.width += extraWidth);
  //       // 最后一个列获取剩余宽度
  //       adjustableColumns[adjustableColumns.length - 1].width += remainingWidth % adjustableColumns.length;
  //     }

  //     systemWidth = columns[0].width;
  //     promptWidth = columns[1].width;
  //     standardResponseWidth = columns[2].width;
  //     modelResponseWidth = columns[3].width;
  //   }

  //   // 计算总宽度
  //   const totalWidth = ID_COLUMN_WIDTH + systemWidth + promptWidth + standardResponseWidth + modelResponseWidth;

  //   const scrollX = totalWidth <= availableWidth ? totalWidth : availableWidth;

  // 业务推理结果集表格列定义（动态表头）
  const businessInferenceColumns = useMemo(() => {
    const keys = getKeys
    return [
      {
        title: '序号',
        dataIndex: 'sequence',
        key: 'sequence',
        width: 80,
        align: 'center' as const,
        fixed: 'left' as const,
      },
      ...keys.map((key) => ({
        title: key,
        dataIndex: key,
        key,
        width: 200,
        align: 'left' as const,
        ellipsis: { showTitle: false },
        render: (text: string, record: any) => {
          // 从 record.data[key] 中获取值
          const value = record?.data?.[key] || ''
          const rowKey = record.key || record.id || record.sequence
          return (
            <ExpandableCell
              text={typeof value === 'string' ? value : JSON.stringify(value)}
              rowKey={rowKey}
              columnKey={key}
              bgColor="#f0f9ff"
              borderColor="#1890ff"
              isExpanded={expandedCells.has(`${rowKey}-${key}`)}
              onToggle={toggleCellExpand}
            />
          )
        },
      })),
    ]
  }, [getKeys, expandedCells, toggleCellExpand])

  // 数据预览表格列定义（固定表头，用于非业务推理结果集）
  const columns = useMemo(() => [
    {
      title: '序号',
      dataIndex: 'sequence',
      key: 'sequence',
      // width: ID_COLUMN_WIDTH,
      width: 80,
      align: 'center' as const,
      fixed: 'left' as const,
    },
    {
      title: 'System',
      dataIndex: 'system',
      key: 'system',
      // width: systemWidth,
      align: 'left' as const,
      ellipsis: { showTitle: false },
      render: (text: string, record: any) => {
        const rowKey = record.key || record.id
        const images = record.images || []
        const baseUrl = record.base_url || ''
        // 处理图片占位符
        const { processedContent } = replaceImagePlaceholders(
          text || '',
          images,
          baseUrl,
          0,
        )
        // 解析 User 和 Assistant 标签
        const finalContent = parseUserAssistantTags(processedContent)
        return (
          <ExpandableCell
            text={finalContent}
            rowKey={rowKey}
            columnKey="system"
            bgColor="#f0f9ff"
            borderColor="#1890ff"
            isExpanded={expandedCells.has(`${rowKey}-system`)}
            onToggle={toggleCellExpand}
          />
        )
      },
    },
    {
      title: 'Prompt',
      dataIndex: 'prompt',
      key: 'prompt',
      // width: promptWidth,
      align: 'left' as const,
      ellipsis: { showTitle: false },
      render: (text: string, record: any) => {
        const rowKey = record.key || record.id
        const images = record.images || []
        const baseUrl = record.base_url || ''
        // 计算 system 字段使用的图片数量，prompt 从该索引开始
        const systemText = record.system || ''
        const systemImageCount = (systemText.match(/<image>/g) || []).length
        // 处理图片占位符，从 system 使用后的索引开始
        const { processedContent } = replaceImagePlaceholders(
          text || '',
          images,
          baseUrl,
          systemImageCount,
        )
        // 解析 User 和 Assistant 标签
        const finalContent = parseUserAssistantTags(processedContent)
        return (
          <ExpandableCell
            text={finalContent}
            rowKey={rowKey}
            columnKey="prompt"
            bgColor="#fff7e6"
            borderColor="#faad14"
            isExpanded={expandedCells.has(`${rowKey}-prompt`)}
            onToggle={toggleCellExpand}
          />
        )
      },
    },
    {
      title: 'Response (标准回答)',
      dataIndex: 'standard_response',
      key: 'standard_response',
      // width: standardResponseWidth,
      align: 'left' as const,
      ellipsis: { showTitle: false },
      render: (text: string, record: any) => {
        const rowKey = record.key || record.id
        const rawText = text || record.output || record.answer || record.response || ''
        // 解析 User 和 Assistant 标签
        const finalContent = parseUserAssistantTags(rawText)
        return (
          <ExpandableCell
            text={finalContent}
            rowKey={rowKey}
            columnKey="standard_response"
            bgColor="#f6ffed"
            borderColor="#52c41a"
            isExpanded={expandedCells.has(`${rowKey}-standard_response`)}
            onToggle={toggleCellExpand}
          />
        )
      },
    },
    {
      title: 'Model Response (模型回答)',
      dataIndex: 'model_response',
      key: 'model_response',
      // width: modelResponseWidth,
      align: 'left' as const,
      ellipsis: { showTitle: false },
      render: (text: string, record: any) => {
        const rowKey = record.key || record.id
        const rawText = text || ''
        // 解析 User 和 Assistant 标签
        const finalContent = parseUserAssistantTags(rawText)
        return (
          <ExpandableCell
            text={finalContent}
            rowKey={rowKey}
            columnKey="model_response"
            bgColor="#fff2f0"
            borderColor="#ff4d4f"
            isExpanded={expandedCells.has(`${rowKey}-model_response`)}
            onToggle={toggleCellExpand}
          />
        )
      },
    },
  ], [expandedCells, toggleCellExpand])

  //   return { dataContentColumns: columns, tableScrollX: scrollX };
  // }, [tableContainerWidth, expandedCells, toggleCellExpand]);

  // 根据推理方式动态生成标签页项（必须在所有早期返回之前）
  const tabItems = useMemo(() => {
    // 如果 dataset 不存在，返回空数组
    if (!dataset) {
      return []
    }
    const items = [
      {
        key: 'detail',
        label: '推理详情',
        children: (
          <>
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
              <Descriptions column={2} size="middle">
                <Descriptions.Item label="推理结果集名称">
                  <Text
                    // editable={{
                    //   tooltip: '编辑名称',
                    //   triggerType: ['icon'],
                    //   onChange: (value) => handleEditBasicInfo('name', value),
                    // }}
                    disabled={editingBasicField === 'name'}
                  >
                    {dataset.name || '-'}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="待推理数据">
                  <Text>{dataset.source_dataset_name || '外部导入'}</Text>
                </Descriptions.Item>

                <Descriptions.Item label="状态">
                  <Text strong>
                    {dataset.status ?? '-'}
                  </Text>
                </Descriptions.Item>

                <Descriptions.Item label="推理方式">
                  {getInferenceMethodTag(dataset.inference_method)}
                </Descriptions.Item>
                <Descriptions.Item label="数据量">
                  <Text strong>
                    {(dataset.total_items || 0).toLocaleString()}
                  </Text>
                </Descriptions.Item>
                <Descriptions.Item label="推理模型">
                  <Text>{dataset.online_service_name || dataset.model_name || '-'}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="创建人">
                  <Text>{dataset.created_by || '-'}</Text>
                </Descriptions.Item>
                {usage !== 'business-inference' && (
                  <Descriptions.Item label="数据用途">
                    <Text>{dataset.dataset_type === 'text-generation' ? '文本生成' : '图像理解'}</Text>
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="创建时间">
                  {dataset.created_at
                    ? new Date(dataset.created_at).toLocaleString()
                    : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="描述">
                  <Paragraph
                    className="!mb-0"
                    editable={{
                      tooltip: '编辑描述',
                      triggerType: ['icon'],
                      autoSize: { minRows: 1, maxRows: 4 },
                      onChange: (value) => handleEditBasicInfo('description', value),
                    }}
                    disabled={editingBasicField === 'description'}
                  >
                    {dataset.description || '-'}
                  </Paragraph>
                </Descriptions.Item>
              </Descriptions>
            </Card>

            {/* 数据预览 */}
            <Card
              title={(
                <span className="text-blue-400">
                  <DatabaseOutlined />
                  {' '}
                  数据预览
                </span>
              )}
            >
              {isPreviewLoading ? (
                <div className="text-center p-[50px]">
                  <Spin tip="加载详情数据中..." />
                </div>
              ) : previewData.length > 0 ? (
                <div ref={tableContainerRef}>
                  <Table
                    columns={usage === 'business-inference' ? businessInferenceColumns : columns}
                    dataSource={previewData}
                    pagination={{
                      current: dataContentPage,
                      pageSize: dataContentPageSize,
                      total: previewTotal,
                      showSizeChanger: false,
                      showQuickJumper: true,
                      showTotal: (total, range) => `显示第${range[0]}到${range[1]}条,共${total}条记录`,
                      // pageSizeOptions: ["10", "20", "50"],
                      onChange: (page, pageSize) => {
                        setDataContentPage(page)
                        setDataContentPageSize(pageSize || 10)
                      },
                    }}
                    // scroll={tableScrollX ? { x: tableScrollX } : undefined}
                    scroll={{ x: 'max-content' }}
                    size="middle"
                    bordered
                    rowClassName={(record, index) =>
                      index % 2 === 0 ? 'table-row-even' : 'table-row-odd'}
                    onRow={(record) => ({
                      onClick: (e) => {
                        // 如果点击的是按钮、输入框、链接等交互元素，不触发行展开
                        const target = e.target as HTMLElement
                        if (!isInteractiveElement(target)) {
                          toggleRowExpand(record)
                        }
                      },
                      style: { cursor: 'pointer' },
                    })}
                    className="inference-result-set-detail-table bg-[var(--lab-color-surface-elevated)] w-full"
                  />
                </div>
              ) : (
                <div className="text-center p-[50px]">
                  <Text type="secondary">暂无数据内容</Text>
                </div>
              )}
            </Card>
          </>
        ),
      },
    ]

    // 如果推理方式不是"导入推理结果集"，则添加"任务日志"标签页
    if (dataset.inference_method !== 'import') {
      items.push({
        key: 'logs',
        label: '任务日志',
        children: (
          <Card
            title={(
              <span className="text-blue-400">
                <CodeOutlined />
                {' '}
                推理任务日志
              </span>
            )}
            extra={(
              <Space>
                <Button
                  type="text"
                  icon={<ReloadOutlined />}
                  onClick={fetchLogs}
                  loading={logsLoading}
                >
                  刷新
                </Button>
                <Button
                  type="text"
                  icon={<DownloadOutlined />}
                  onClick={downloadLogs}
                  disabled={!logs || logs.length === 0}
                >
                  下载
                </Button>
              </Space>
            )}
          >
            <TaskLogsPage
              logs={logs}
              loading={logsLoading}
              taskName={dataset?.name || '推理任务'}
              showTaskIdError={!dataset?.id}
              maxHeight={600}
              showDownloadButton={false}
            />
          </Card>
        ),
      })
    }

    return items
  }, [
    dataset,
    isPreviewLoading,
    previewData,
    columns,
    businessInferenceColumns,
    usage,
    dataContentPage,
    dataContentPageSize,
    previewTotal,
    logsLoading,
    logs,
    editingBasicField,
    tableContainerRef,
    fetchLogs,
    handleEditBasicInfo,
    toggleRowExpand,
    expandedCells,
    toggleCellExpand,
  ])

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

  return (
    <Card className="m-[24px]">
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate(-1)}
        className="mb-4"
      >
        返回
      </Button>

      <div className="px-[24px] py-[16px]">
        <Row gutter={16}>
          <Col span={24}>
            <div className="flex justify-end items-center gap-12 pl-[6px] pr-[12px]">
              <div className="flex gap-6">
                <Button
                  type="primary"
                  onClick={handleEvaluate}
                  disabled={dataset?.status !== InferenceProgressStatus.COMPLETED && dataset?.status !== '已完成'}
                >
                  去评估
                </Button>
                <Dropdown
                  menu={{
                    items: [
                      ...(dataset?.dataset_type === 'image-understanding'
                        ? [
                            {
                              key: 'zip',
                              label: 'ZIP',
                              onClick: () => downloadDataset('zip'),
                            },
                          ]
                        : [
                            {
                              key: 'json',
                              label: 'JSON',
                              onClick: () => downloadDataset('json'),
                            },
                            {
                              key: 'jsonl',
                              label: 'JSONL',
                              onClick: () => downloadDataset('jsonl'),
                            },
                            {
                              key: 'xlsx',
                              label: 'XLSX',
                              onClick: () => downloadDataset('xlsx'),
                            },
                          ]
                      ),
                    ],
                  }}
                  disabled={dataset?.status !== InferenceProgressStatus.COMPLETED && dataset?.status !== '已完成'}
                >
                  <Button type="primary">
                    下载
                    {' '}
                    <DownOutlined />
                  </Button>
                </Dropdown>
              </div>
            </div>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={24} className="px-[24px]">
            <div className="px-[12px] py-[12px]">
              <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={tabItems}
              />
            </div>
          </Col>
        </Row>
      </div>
    </Card>
  )
}

export default InferenceResultSetDetail
