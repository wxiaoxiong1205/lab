import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Layout, Modal, Select, Space, Table, Tag, Tooltip, Typography, message } from 'antd'
import { ArrowLeftOutlined, SendOutlined } from '@ant-design/icons'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { ColumnsType } from 'antd/es/table'
import { getDisplayGroundTruth, getDisplayPrompt, getDisplaySystem, getNormalizedRawData, getRawDataImages, getRawDataMessages } from './multiLabelDataCompat'
import { formatGrpoPrompt, formatGrpoValue, getGrpoRewardModel, getGrpoStringValue } from './grpoDisplay'
import { labelTaskService } from '@/services/dataAnnotationService'
import type { OverviewDataItem } from '@/services/dataAnnotationService'
import { expandImageData } from '@/utils/imageUtils'
import ExpandableCell from '@/components/common/ExpandableCell'
import MdPreview from '@/components/md-preview'

const PAGE_SIZE = 30
/** 带 messages 展开后的展示用项（只读列表用） */
export interface OverviewDisplayItem extends OverviewDataItem {
  training_method_type?: string
  dataset_format?: string
  instruction?: string
  input?: string
  data_source?: string
  prompt?: string
  ability?: string
  reward_model?: string
  extra_info?: string
  messages?: unknown[]
  chosen?: string
  rejected?: string
  _systemMessage?: string
  _userMessages?: string[]
  _assistantMessages?: string[]
  _rawImages?: string[]
  base_url?: string
}
type ReviewFilter = 'all' | 'unaudited' | 'passed' | 'failed'

const getStringValue = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

const getDpoText = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return getStringValue((value as Record<string, unknown>).content)
  }
  return ''
}

const renderMarkdownContent = (content?: string) => (
  content ? <MdPreview content={content} /> : <span className="text-gray-400">-</span>
)

const AnnotationTaskDataList: React.FC = () => {
  const { projectId, taskId } = useParams<{
    projectId: string
    taskId: string
  }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const bizType = searchParams.get('biz_type') || undefined
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all') // 审核筛选：all | unaudited | passed | failed
  const [dataList, setDataList] = useState<OverviewDataItem[]>([])
  const [baseUrl, setBaseUrl] = useState<string>('')
  const [trainingMethodType, setTrainingMethodType] = useState<string>('')
  const [datasetFormat, setDatasetFormat] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: PAGE_SIZE,
    total: 0,
  })
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set())
  const [imagePreviewVisible, setImagePreviewVisible] = useState(false)
  const [previewImageUrl, setPreviewImageUrl] = useState<string>('')
  const [publishing, setPublishing] = useState(false)
  const [formerListData, setFormerListData] = useState(null)
  const canPublish = searchParams.get('status') === 'audit_passed'
  const from = searchParams.get('from')
  const subTab = searchParams.get('sub_tab') || 'overview'
  const getListUrl = useCallback(() => {
    const params = new URLSearchParams({
      tab: 'multi-person',
      sub_tab: subTab,
    })
    if (bizType) params.set('biz_type', bizType)
    const listPath = from === 'machine-annotation' ? 'machine-annotation' : 'data-annotation'
    return `/project/${projectId}/${listPath}?${params.toString()}`
  }, [bizType, from, projectId, subTab])
  const handleBack = useCallback(() => {
    navigate(getListUrl())
  }, [getListUrl, navigate])
  const fetchList = async () => {
    if (!projectId || !taskId)
      return
    setLoading(true)
    try {
      const auditFilter = reviewFilter === 'all' ? undefined : reviewFilter
      const res = await labelTaskService.getOverviewData({
        project_id: Number(projectId),
        task_id: Number(taskId),
        biz_type: bizType,
        page: pagination.current,
        size: pagination.pageSize,
        audit_status: auditFilter,
      })
      setFormerListData(res)
      setDataList(res.items ?? [])
      setBaseUrl(res.base_url ?? '')
      setTrainingMethodType(res.training_method_type ?? '')
      setDatasetFormat(res.dataset_format ?? '')
      setPagination((prev) => ({ ...prev, total: res.total ?? 0 }))
    }
    finally {
      setLoading(false)
    }
  }
  // 将原始列表处理为带 messages 展开的展示数据（与 AnnotationDetail 一致的数据结构）
  const displayList = useMemo((): OverviewDisplayItem[] => {
    if (!dataList.length)
      return []
    const list = dataList.map((item) => {
      const raw = getNormalizedRawData(item.raw_data)
      const currentTrainingMethodType = item.training_method_type || trainingMethodType
      const currentDatasetFormat = item.dataset_format || datasetFormat
      const annotation = item.annotation || {}
      const rawChosen = annotation.chosen ?? raw.chosen
      const rawRejected = annotation.rejected ?? raw.rejected
      const baseItem = {
        ...item,
        training_method_type: currentTrainingMethodType,
        dataset_format: currentDatasetFormat,
      }

      if (currentTrainingMethodType === 'dpo') {
        return {
          ...baseItem,
          raw_data: raw,
          instruction: getStringValue(raw.instruction),
          input: getStringValue(raw.input),
          messages: getRawDataMessages(raw),
          chosen: getDpoText(rawChosen),
          rejected: getDpoText(rawRejected),
        } as OverviewDisplayItem
      }

      if (currentTrainingMethodType === 'grpo' || currentDatasetFormat === 'grpo') {
        return {
          ...baseItem,
          raw_data: raw,
          data_source: getGrpoStringValue(raw.data_source),
          prompt: formatGrpoPrompt(raw, baseUrl),
          reward_model: getGrpoRewardModel(raw, annotation),
          ability: getGrpoStringValue(raw.ability),
          extra_info: formatGrpoValue(raw.extra_info),
          _rawImages: getRawDataImages(raw),
          base_url: baseUrl,
        } as OverviewDisplayItem
      }

      const messages = (item.annotation as Record<string, unknown> | undefined)?.messages
        ?? getRawDataMessages(raw)
      const isMessagesFormat = Array.isArray(messages) && messages.length > 0
      if (isMessagesFormat) {
        const messagesToUse = messages as {
          role: string
          content?: string
        }[]
        const images = getRawDataImages(raw)
        const expanded = expandImageData([{
          ...item,
          messages: messagesToUse,
          images,
          base_url: baseUrl,
        }])
        if (expanded.length > 0) {
          const e = expanded[0] as OverviewDisplayItem
          return {
            ...baseItem,
            _systemMessage: e._systemMessage ?? '',
            _userMessages: e._userMessages ?? [],
            _assistantMessages: e._assistantMessages ?? [],
            _rawImages: images as string[],
            base_url: baseUrl,
          }
        }
      }
      return { ...baseItem, raw_data: raw } as OverviewDisplayItem
    })
    return list
  }, [dataList, baseUrl, datasetFormat, trainingMethodType])
  const isDpoLayout = formerListData?.training_method_type === 'dpo'
  const isDpoRoleBased = isDpoLayout && formerListData?.dataset_format === 'role-based'
  const isGrpoLayout = formerListData?.training_method_type === 'grpo' || formerListData?.dataset_format === 'grpo'
  const isMessagesLayout = useMemo(() => {
    if (displayList.length === 0)
      return false
    if (displayList[0].training_method_type === 'dpo')
      return false
    const first = displayList[0]
    return !!(first._systemMessage !== undefined || (first._userMessages && first._userMessages.length > 0))
  }, [displayList])
  const toggleCellExpand = useCallback((rowKey: string, columnKey: string) => {
    setExpandedCells((prev) => {
      const next = new Set(prev)
      const key = `${rowKey}-${columnKey}`
      if (next.has(key))
        next.delete(key)
      else
        next.add(key)
      return next
    })
  }, [])
  const handleHeightChange = useCallback(() => {
    // 只读列表不需要同步高度
  }, [])
  const handleImageClick = useCallback((imageIndex: number, record: OverviewDisplayItem) => {
    const rawImages = record._rawImages ?? []
    const base = record.base_url ?? baseUrl
    if (imageIndex >= 0 && imageIndex < rawImages.length) {
      const imagePath = rawImages[imageIndex]
      if (/^(https?:|data:|blob:)/.test(imagePath)) {
        setPreviewImageUrl(imagePath)
        setImagePreviewVisible(true)
        return
      }
      const fileName = imagePath.includes('/') ? imagePath.split('/').pop() : imagePath
      const imageBaseUrl = import.meta.env.DEV
        ? `${import.meta.env.VITE_PREFIX_BASE_URL}/api/v1/storage/download/`
        : '/lab-backend/api/v1/storage/download/'
      setPreviewImageUrl(`${imageBaseUrl}${base}/${fileName}`)
      setImagePreviewVisible(true)
    }
  }, [baseUrl])
  useEffect(() => {
    fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在这些筛选/分页变化时拉取
  }, [projectId, taskId, pagination.current, pagination.pageSize, reviewFilter])
  const handlePublish = () => {
    if (!projectId || !taskId || !canPublish)
      return
    Modal.confirm({
      title: '确认发布',
      content: '确定要发布当前任务吗？发布后将生成标注后数据集。',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        setPublishing(true)
        try {
          await labelTaskService.publishMultiLabelTask(Number(projectId), Number(taskId), bizType)
          message.success('发布成功')
          navigate(getListUrl())
        }
        catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '发布失败')
        }
        finally {
          setPublishing(false)
        }
      },
    })
  }
  const columns: ColumnsType<OverviewDisplayItem> = [
    {
      title: '序号',
      dataIndex: 'row_number',
      key: 'row_number',
      align: 'center',
      width: 100,
      render: (rowNumber: number) => (
        <div className="flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-medium">
            {rowNumber}
          </div>
        </div>
      ),
    },
    {
      title: 'System',
      dataIndex: isMessagesLayout ? '_systemMessage' : 'raw_data',
      key: 'system',
      align: 'left',
      hidden: isDpoLayout || isGrpoLayout,
      render: (_: unknown, record: OverviewDisplayItem) => {
        if (isMessagesLayout && record._systemMessage !== undefined) {
          const rowKey = record.item_id ?? String(record.row_number)
          return (<ExpandableCell text={record._systemMessage ?? ''} rowKey={rowKey} columnKey="system" bgColor="#f0f9ff" borderColor="#1890ff" isExpanded={expandedCells.has(`${rowKey}-system`)} onToggle={toggleCellExpand} onHeightChange={handleHeightChange} />)
        }
        const text = getDisplaySystem(record.raw_data) || '-'
        return (
          <Tooltip title={text}>
            <div className="max-w-[200px] truncate text-sm break-words">
              {text}
            </div>
          </Tooltip>
        )
      },
    },
    {
      title: isMessagesLayout ? 'User' : 'Prompt',
      key: isMessagesLayout ? 'user' : 'prompt',
      align: 'left',
      hidden: isDpoLayout || isGrpoLayout,
      render: (_: unknown, record: OverviewDisplayItem) => {
        if (isMessagesLayout && record._userMessages?.length) {
          const rowKey = record.item_id ?? String(record.row_number)
          const userMessages = record._userMessages ?? []
          const rawImages = record._rawImages ?? []
          const systemMessage = record._systemMessage ?? ''
          const systemImageCount = (systemMessage.match(/<img\s+[^>]*?\/?>/gi) || []).length
          const getMessageStartImageIndex = (messageIndex: number) => {
            let imageCount = systemImageCount
            for (let i = 0; i < messageIndex; i++) {
              const msg = userMessages[i]
              const matches = (msg || '').match(/<img\s+[^>]*?\/?>/gi)
              if (matches)
                imageCount += matches.length
            }
            return imageCount
          }
          return (
            <div
              className="space-y-2"
              onClick={(e) => {
                const target = e.target as HTMLElement
                if (target.tagName === 'IMG') {
                  e.preventDefault()
                  e.stopPropagation()
                  const imageIndex = target.getAttribute('data-image-index')
                  if (imageIndex != null) {
                    const index = parseInt(imageIndex, 10)
                    if (index >= 0 && index < rawImages.length)
                      handleImageClick(index, record)
                  }
                }
              }}
            >
              {userMessages.map((msg: string, index: number) => {
                const startImageIndex = getMessageStartImageIndex(index)
                let processedMsg = msg || ''
                let currentImageIndex = startImageIndex
                processedMsg = processedMsg.replace(/<img\s+([^>]*?)(\/?)>/gi, (match, attributes, selfClose) => {
                  if (attributes.includes('data-image-index'))
                    return match
                  const idx = currentImageIndex++
                  const closingTag = selfClose ? ' />' : '>'
                  return `<img data-image-index="${idx}" ${attributes}${closingTag}`
                })
                return (
                  <div key={`${rowKey}-user-msg-${index}`} className="user-message-container">
                    {index > 0 && <div className="my-2 border-t border-gray-100" />}
                    <ExpandableCell text={processedMsg} rowKey={`${rowKey}-user-${index}`} columnKey="user" bgColor="#fff7e6" borderColor="#faad14" isExpanded={expandedCells.has(`${rowKey}-user-${index}-user`)} onToggle={toggleCellExpand} onHeightChange={handleHeightChange} />
                  </div>
                )
              })}
            </div>
          )
        }
        const text = getDisplayPrompt(record.raw_data) || '-'
        return (
          <Tooltip title={text}>
            <div className="max-w-[200px] truncate text-sm break-words">
              {text}
            </div>
          </Tooltip>
        )
      },
    },
    {
      title: isMessagesLayout ? 'Assistant' : 'Ground Truth',
      key: isMessagesLayout ? 'assistant' : 'ground_truth',
      align: 'left',
      width: isMessagesLayout ? 420 : undefined,
      hidden: isDpoLayout || isGrpoLayout,
      render: (_: unknown, record: OverviewDisplayItem) => {
        if (isMessagesLayout && record._assistantMessages?.length) {
          const assistantMessages = record._assistantMessages ?? []
          return (
            <div className="space-y-2 text-left min-w-0 max-w-[420px]">
              {assistantMessages.map((msg: string, index: number) => (
                <div key={`${record.item_id}-assistant-${index}`} className="assistant-message-container min-w-0">
                  {index > 0 && <div className="my-2 border-t border-gray-100" />}
                  {/* 与 User 列 ExpandableCell 一致高度 100px，保证两条子数据时对齐 */}
                  <div
                    className="break-words text-left rounded bg-gray-50 box-border min-w-0 max-w-full h-[100px] max-h-[100px] p-[8px_12px] overflow-y-auto overflow-x-hidden whitespace-pre-wrap text-[13px]"
                    style={{
                      lineHeight: 1.6,
                      wordBreak: 'break-word',
                    }}
                    dangerouslySetInnerHTML={{ __html: msg || '无' }}
                  />
                </div>
              ))}
            </div>
          )
        }
        const text = getDisplayGroundTruth(record.raw_data, record.annotation) || '-'
        return (
          <Tooltip title={text}>
            <div className="max-w-[200px] truncate text-sm break-words">
              {text}
            </div>
          </Tooltip>
        )
      },
    },
    {
      title: 'data_source',
      dataIndex: 'data_source',
      key: 'data_source',
      align: 'left',
      width: 220,
      hidden: !isGrpoLayout,
      render: (text: string) => (
        <div className="max-w-[220px] max-h-[160px] overflow-y-auto break-words whitespace-pre-wrap">
          {text || '-'}
        </div>
      ),
    },
    {
      title: 'prompt',
      dataIndex: 'prompt',
      key: 'grpo_prompt',
      align: 'left',
      width: 420,
      hidden: !isGrpoLayout,
      render: (text: string) => (
        <div
          className="max-w-[420px] max-h-[220px] overflow-y-auto break-words whitespace-pre-wrap [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded [&_img]:my-1"
          dangerouslySetInnerHTML={{ __html: text || '-' }}
        />
      ),
    },
    {
      title: 'reward_model',
      dataIndex: 'reward_model',
      key: 'reward_model',
      align: 'left',
      width: 280,
      hidden: !isGrpoLayout,
      render: (text: string) => (
        <div className="max-w-[280px] max-h-[160px] overflow-y-auto break-words whitespace-pre-wrap">
          {text || '-'}
        </div>
      ),
    },
    {
      title: 'ability',
      dataIndex: 'ability',
      key: 'ability',
      align: 'left',
      width: 160,
      hidden: !isGrpoLayout,
      render: (text: string) => (
        <div className="max-w-[160px] max-h-[160px] overflow-y-auto break-words whitespace-pre-wrap">
          {text || '-'}
        </div>
      ),
    },
    {
      title: 'extra_info',
      dataIndex: 'extra_info',
      key: 'extra_info',
      align: 'left',
      width: 260,
      hidden: !isGrpoLayout,
      render: (text: string) => (
        <div className="max-w-[260px] max-h-[160px] overflow-y-auto break-words whitespace-pre-wrap">
          {text || '-'}
        </div>
      ),
    },
    {
      title: 'Instruction',
      dataIndex: 'instruction',
      key: 'instruction',
      align: 'left',
      width: 260,
      hidden: !isDpoLayout || isDpoRoleBased,
      render: (text: string) => (
        <div className="max-w-[260px] break-words">
          {renderMarkdownContent(text)}
        </div>
      ),
    },
    {
      title: 'Input',
      dataIndex: 'input',
      key: 'input',
      align: 'left',
      width: 260,
      hidden: !isDpoLayout || isDpoRoleBased,
      render: (text: string) => (
        <div className="max-w-[260px] break-words">
          {renderMarkdownContent(text)}
        </div>
      ),
    },
    {
      title: 'Messages',
      dataIndex: 'messages',
      key: 'messages',
      align: 'left',
      width: 420,
      hidden: !isDpoRoleBased,
      render: (messages: unknown[]) => {
        const messageList = Array.isArray(messages) ? messages : []
        if (messageList.length === 0) {
          return '-'
        }
        return (
          <div className="space-y-2 max-w-[420px]">
            {messageList.map((msg: unknown, index: number) => {
              const record = msg && typeof msg === 'object' && !Array.isArray(msg)
                ? msg as Record<string, unknown>
                : {}
              return (
                <div key={`${getStringValue(record.role) || 'message'}-${index}`} className="rounded border border-gray-100 bg-gray-50 p-2">
                  <Tag color={record.role === 'system' ? 'purple' : record.role === 'assistant' ? 'green' : record.role === 'user' ? 'blue' : 'default'} className="!mb-1">
                    {getStringValue(record.role) || 'message'}
                  </Tag>
                  {renderMarkdownContent(getStringValue(record.content))}
                </div>
              )
            })}
          </div>
        )
      },
    },
    {
      title: 'Chosen',
      dataIndex: 'chosen',
      key: 'chosen',
      align: 'left',
      width: 320,
      hidden: !isDpoLayout,
      render: (text: string) => (
        <div className="max-w-[320px] break-words">
          {renderMarkdownContent(text)}
        </div>
      ),
    },
    {
      title: 'Rejected',
      dataIndex: 'rejected',
      key: 'rejected',
      align: 'left',
      width: 320,
      hidden: !isDpoLayout,
      render: (text: string) => (
        <div className="max-w-[320px] break-words">
          {renderMarkdownContent(text)}
        </div>
      ),
    },
    {
      title: '标注进度',
      dataIndex: 'is_annotated',
      key: 'is_annotated',
      align: 'center',
      fixed: 'right',
      width: 100,
      render: (isAnnotated: boolean) => (isAnnotated ? '已标注' : '未标注'),
    },
    {
      title: '审核结果',
      dataIndex: 'audit_result',
      fixed: 'right',
      key: 'audit_result',
      align: 'center',
      width: 100,
      render: (audit_result: string) => (audit_result === 'passed' ? '通过' : !audit_result ? '未审核' : '未通过'),
    },
  ]
  return (
    <Layout.Content className="p-6 pb-10 bg-white">
      {/* 顶部：返回 + 标题 + 筛选 + 发布 */}
      <div className="flex items-center justify-between mb-4">
        <Space align="center" size="middle">
          <Button
            type="text"
            className="!h-7 !w-7 !p-0 text-[18px] leading-7"
            icon={<ArrowLeftOutlined />}
            onClick={handleBack}
          />
          <Typography.Title level={5} className="!mb-0 mr-2">
            标注数据
          </Typography.Title>
          <Select
            value={reviewFilter}
            onChange={setReviewFilter}
            className="w-[140px]"
            options={[
              { value: 'all', label: '全部' },
              { value: 'unaudited', label: '未审核' },
              { value: 'passed', label: '审核通过' },
              { value: 'failed', label: '审核不通过' },
            ]}
          />
        </Space>
        <Button type="primary" icon={<SendOutlined />} onClick={handlePublish} disabled={!canPublish} loading={publishing}>
          发布
        </Button>
      </div>

      {/* 表格：与 AnnotationDetail 一致的 messages 只读展示，支持多条数据 */}
      <div className="mb-6">
        <Table<OverviewDisplayItem>
          columns={columns}
          dataSource={displayList}
          rowKey="item_id"
          loading={loading}
          scroll={{ x: 'max-content' }}
          className="[&_.ant-table-tbody>tr>td]:align-top"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '30', '50'],
            showTotal: (total) => `共${total}条`,
            locale: { items_per_page: '条/页', jump_to: '跳至' },
            onChange: (page, pageSize) => {
              setPagination((prev) => ({
                ...prev,
                current: page,
                pageSize: pageSize ?? prev.pageSize,
              }))
            },
          }}
          size="middle"
        />
      </div>

      {/* 图片预览 Modal（与 AnnotationDetail 一致） */}
      <Modal open={imagePreviewVisible} onCancel={() => setImagePreviewVisible(false)} width="60%" footer={null} title="图片详情" centered>
        {previewImageUrl && (<img src={previewImageUrl} alt="预览" className="w-full object-contain" />)}
      </Modal>
    </Layout.Content>
  )
}
export default AnnotationTaskDataList
