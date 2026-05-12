import React, { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Pagination,
  Progress,
  Radio,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EyeOutlined,
  FileTextOutlined,
  FolderOutlined,
  PlusOutlined,
  PictureOutlined,
  ReloadOutlined,
  RobotOutlined,
  SendOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  buildAnnotationDatasetOptions,
  dataServiceApi,
  type PaginatedResult,
  selectAnnotationTasks,
  useDataServiceSnapshot,
} from '../../services/dataServiceApi'

const { Text, Title } = Typography

type AnnotationTask = {
  id: string
  name: string
  dataVolume: number
  progress: number | null
  status?: '未开始' | '标注中' | '待审核' | '已完成' | '已提交' | '失败'
  collaborationMode?: 'online' | 'multi'
  reviewerCount?: number
  reviewMode?: string
  datasetType?: 'text-generation' | 'image-understanding'
  preDataset: string
  postDataset: string
  outputMode?: string
  creator: string
  createdAt: string
}

type DatasetOption = {
  value: string
  label: string
  count: number
}

type AnnotationSample = {
  id: string
  index: number
  system: string
  prompt: string
  groundTruth: string
  imagePrompts?: Array<{
    question: string
    imageLabel: string
  }>
  assistantAnswers?: string[]
  status: '待标注' | '已标注'
}

type AnnotationServiceConfig = {
  service: string
  maxTokens: number
  temperature: number
  topP: number
  presencePenalty: number
}

type MemberRole = 'annotator' | 'reviewer'

type ProjectMember = {
  account: string
  username: string
  email: string
}

type AssignmentDraft = {
  annotators: ProjectMember[]
  reviewers: ProjectMember[]
}

type ReviewDecision = {
  result?: '通过' | '未通过'
  reason?: string
  status: '待审核' | '已审核'
}

const CREATE_ASSIGNMENT_KEY = '__create_multi_annotation__'

const projectMemberOptions: ProjectMember[] = [
  { account: 'dp3', username: 'dp3', email: '1****@163.com' },
  { account: 'dp2', username: 'dp2', email: '2****@163.com' },
  { account: 'dp1', username: 'dp1', email: '3****@163.com' },
  { account: 'lab5', username: 'lab5', email: 'lab5@deepexi.com' },
  { account: 'sailixi', username: 'sailixi', email: 'sailixi@deepexi.com' },
  { account: 'system_admin', username: '平台管理员', email: 'admin@deepexi.com' },
  { account: 'Phoena', username: 'Phoena', email: 'phoena@deepexi.com' },
  { account: 'lab3', username: 'lab3', email: 'lab3@deepexi.com' },
  { account: 'lab2', username: 'lab2', email: 'lab2@deepexi.com' },
  { account: 'lab1', username: 'lab1', email: 'lab1@deepexi.com' },
]

const stepCards = [
  {
    title: '选择数据集',
    description: '从已有数据集中选择或上传新数据',
    icon: <FolderOutlined />,
  },
  {
    title: '标注数据',
    description: '使用工具对数据进行精确标注',
    icon: <FileTextOutlined />,
  },
  {
    title: '发布数据集',
    description: '完成标注后发布供模型训练使用',
    icon: <CloudUploadOutlined />,
  },
  {
    title: '使用数据集',
    description: '下载或直接调用标注完成的数据集',
    icon: <DatabaseOutlined />,
  },
]

function getDatasetTypeFromSearch(search: string): 'text-generation' | 'image-understanding' {
  const value = new URLSearchParams(search).get('dataset_type')
  return value === 'image-understanding' ? 'image-understanding' : 'text-generation'
}

function getDefaultAnnotationService(datasetType?: AnnotationTask['datasetType']) {
  return datasetType === 'image-understanding' ? 'svc-qwen2-vision-72b' : 'svc-qwen3-next-80b'
}

function buildAnnotationSamples(task?: AnnotationTask | null): AnnotationSample[] {
  const total = Math.max(1, Math.min(task?.dataVolume ?? 10, 20))
  const readonly = task?.status === '已完成' || task?.status === '已提交' || task?.progress === 100
  const isImageTask = task?.datasetType === 'image-understanding'

  return Array.from({ length: total }).map((_, index) => ({
    id: `${task?.id ?? 'annotation'}-sample-${index + 1}`,
    index: index + 1,
    system: isImageTask
      ? '你是一个专业的 AI 助手，擅长分析图片内容。'
      : index % 2 === 0
        ? '你是一个严谨的数据标注助手，请根据用户输入生成可用于模型训练的标准答案。'
        : '请判断输入内容的意图，并补充完整、客观、可复用的标注结果。',
    prompt: isImageTask
      ? '请根据图片内容回答问题，并输出适合作为图像理解训练数据的答案。'
      : index % 3 === 0
        ? '请分析这段用户问题，输出符合业务语境的回答，并保留关键事实。'
        : index % 3 === 1
          ? '请根据图片描述抽取主体、场景、动作和潜在风险信息。'
          : '请把原始问答整理成训练数据可用的 Ground Truth。',
    groundTruth: readonly ? `这是第 ${index + 1} 条数据的标注结果示例，已随任务完成生成。` : '',
    imagePrompts: isImageTask
      ? [
          { question: index % 2 === 0 ? 'Who are they?' : '图中主体是谁？', imageLabel: `Image ${index + 1}-A` },
          { question: index % 2 === 0 ? 'What are they doing?' : '他们正在做什么？', imageLabel: `Image ${index + 1}-B` },
        ]
      : undefined,
    assistantAnswers: isImageTask
      ? [
          readonly ? '图中展示了两名运动员在比赛场景中的互动，可见主体、服饰和场馆背景。' : '',
          readonly ? '他们正在赛场上交流或庆祝，画面重点是人物动作、表情和比赛氛围。' : '',
        ]
      : undefined,
    status: readonly ? '已标注' : '待标注',
  }))
}

const annotationServiceOptions = [
  { value: 'svc-qwen3-next-80b', label: 'Qwen3-Next-80B-A3B-Instruct-文本生成-在线推理服务' },
  { value: 'svc-qwen2-vision-72b', label: 'Qwen2.5-VL-72B-Instruct-图像理解-在线推理服务' },
  { value: 'svc-deepseek-v3', label: 'DeepSeek-V3-文本生成-在线推理服务' },
]

function getAnnotationTaskStatus(record: AnnotationTask): NonNullable<AnnotationTask['status']> {
  if ((record.status as string | undefined) === '异常') {
    return '失败'
  }
  if (record.status) {
    return record.status
  }
  if (record.progress === null) {
    return '失败'
  }
  if (record.progress >= 100) {
    return '已完成'
  }
  if (record.progress > 0) {
    return '标注中'
  }
  return '未开始'
}

function getAnnotationStatusColor(status: NonNullable<AnnotationTask['status']>): string {
  const colorMap: Record<NonNullable<AnnotationTask['status']>, string> = {
    未开始: 'default',
    标注中: 'processing',
    待审核: 'warning',
    已完成: 'success',
    已提交: 'success',
    失败: 'error',
  }
  return colorMap[status]
}

function getIndexedProgress(overallPercent: number, index: number, total: number) {
  if (total <= 0) {
    return 0
  }

  const completed = (Math.max(0, Math.min(overallPercent, 100)) / 100) * total
  const whole = Math.floor(completed)
  if (index <= whole) {
    return 100
  }
  if (index === whole + 1) {
    return Math.round((completed - whole) * 100)
  }
  return 0
}

function getIndexedAnnotationStatus(overallPercent: number, index: number, total: number) {
  return getIndexedProgress(overallPercent, index, total) >= 100 ? '已标注' : '未标注'
}

function getIndexedReviewStatus(reviewPercent: number, index: number, total: number) {
  const progress = getIndexedProgress(reviewPercent, index, total)
  if (progress < 100) {
    return '未审核'
  }

  return index % 7 === 0 ? '未通过' : '通过'
}

const DataAnnotation: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { id: annotationId } = useParams()
  const state = useDataServiceSnapshot()
  const annotationTasks = selectAnnotationTasks(state)
  const [form] = Form.useForm()
  const [configForm] = Form.useForm<AnnotationServiceConfig>()
  const [createOpen, setCreateOpen] = useState(false)
  const [collaborationTab, setCollaborationTab] = useState<'online' | 'multi'>('online')
  const [datasetType, setDatasetType] = useState<'text-generation' | 'image-understanding'>('text-generation')
  const [selectedDatasetValue, setSelectedDatasetValue] = useState<string>()
  const [datasetPickerOpen, setDatasetPickerOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [listLoading, setListLoading] = useState(false)
  const [listResult, setListResult] = useState<PaginatedResult<AnnotationTask>>({ items: [], total: 0 })
  const [samplePage, setSamplePage] = useState(1)
  const [sampleFilter, setSampleFilter] = useState<'全部' | '待标注' | '已标注'>('全部')
  const [multiSubTab, setMultiSubTab] = useState<'overview' | 'annotation' | 'review'>('overview')
  const [submitted, setSubmitted] = useState(false)
  const [reviewSubmitted, setReviewSubmitted] = useState(false)
  const [annotationSamples, setAnnotationSamples] = useState<AnnotationSample[]>([])
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, ReviewDecision>>({})
  const [memberModalTask, setMemberModalTask] = useState<AnnotationTask | null>(null)
  const [memberPickerContext, setMemberPickerContext] = useState<{ assignmentKey: string; role: MemberRole; replaceAccount?: string } | null>(null)
  const [selectedMemberAccounts, setSelectedMemberAccounts] = useState<string[]>([])
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, AssignmentDraft>>({
    [CREATE_ASSIGNMENT_KEY]: { annotators: [], reviewers: [] },
  })
  const [serviceConfig, setServiceConfig] = useState<AnnotationServiceConfig>({
    service: getDefaultAnnotationService('text-generation'),
    maxTokens: 2048,
    temperature: 0.7,
    topP: 1.0,
    presencePenalty: 1.0,
  })
  const isMultiCreatePage = location.pathname === '/data-annotation/multi/create'

  const datasetOptions = useMemo(
    () => buildAnnotationDatasetOptions(state, datasetType),
    [datasetType, state],
  )
  const selectedDataset = useMemo(
    () => datasetOptions.find(item => item.value === selectedDatasetValue) ?? null,
    [datasetOptions, selectedDatasetValue],
  )
  const selectedAnnotationTask = useMemo(() => {
    if (!annotationId) {
      return null
    }

    return (
      listResult.items.find(item => item.id === annotationId) ??
      annotationTasks.find(item => item.id === annotationId) ??
      null
    )
  }, [annotationId, annotationTasks, listResult.items])
  const fallbackAnnotationTask = useMemo<AnnotationTask | null>(() => {
    if (!annotationId || selectedAnnotationTask) {
      return selectedAnnotationTask
    }

    return {
      id: annotationId,
      name: annotationId,
      dataVolume: 10,
      progress: 0,
      status: '未开始',
      collaborationMode: 'online',
      datasetType,
      preDataset: '-',
      postDataset: '-',
      creator: 'zhangsan',
      createdAt: '2026/04/29 10:00:00',
    }
  }, [annotationId, datasetType, selectedAnnotationTask])
  const visibleSamples = useMemo(
    () => annotationSamples.filter(item => sampleFilter === '全部' || item.status === sampleFilter),
    [annotationSamples, sampleFilter],
  )
  const currentSample = visibleSamples[Math.max(samplePage - 1, 0)] ?? visibleSamples[0] ?? null
  const annotatedCount = annotationSamples.filter(item => item.status === '已标注').length
  const reviewedCount = annotationSamples.filter(item => reviewDecisions[item.id]?.status === '已审核').length
  const allSamplesAnnotated = annotationSamples.length > 0 && annotationSamples.every(item => {
    const hasTextAnswer = item.groundTruth.trim()
    const hasImageAnswers = item.assistantAnswers?.every(answer => answer.trim())
    return item.status === '已标注' && (hasTextAnswer || hasImageAnswers)
  })
  const allSamplesReviewed = annotationSamples.length > 0 && annotationSamples.every(item => reviewDecisions[item.id]?.status === '已审核')

  const filteredItems = listResult.items.filter(item => {
    const matchMode = !item.collaborationMode || item.collaborationMode === collaborationTab
    const matchDatasetType = !item.datasetType || item.datasetType === datasetType
    return matchMode && matchDatasetType
  })
  const multiItems = listResult.items.filter(item => item.collaborationMode === 'multi')
  const myAnnotationAssignments = multiItems
    .filter(item => item.status !== '已提交')
    .map((item, index) => ({
      ...item,
      assignedCount: Math.max(1, Math.ceil(item.dataVolume / Math.max(item.reviewerCount ?? 2, 1))),
      assignmentStatus: index % 3 === 0 ? '待标注' : index % 3 === 1 ? '标注中' : '已完成',
    }))
  const myReviewAssignments = multiItems
    .filter(item => item.status === '待审核' || item.status === '已完成' || item.status === '已提交' || (item.progress ?? 0) >= 80)
    .map((item, index) => ({
      ...item,
      reviewCount: Math.max(1, Math.floor(item.dataVolume / 2)),
      reviewStatus: item.status === '已提交' ? '已审核' : index % 2 === 0 ? '待审核' : '审核中',
    }))
  const getAssignmentDraft = (assignmentKey: string): AssignmentDraft => {
    const draft = assignmentDrafts[assignmentKey]
    if (draft) {
      return draft
    }

    return {
      annotators: projectMemberOptions.slice(0, 2),
      reviewers: projectMemberOptions.slice(3, 4),
    }
  }
  const openMemberPicker = (assignmentKey: string, role: MemberRole, replaceAccount?: string) => {
    const draft = getAssignmentDraft(assignmentKey)
    setMemberPickerContext({ assignmentKey, role, replaceAccount })
    setSelectedMemberAccounts(
      replaceAccount
        ? [replaceAccount]
        : (role === 'annotator' ? draft.annotators : draft.reviewers).map(item => item.account),
    )
  }
  const handleAddSelectedMembers = () => {
    if (!memberPickerContext) {
      return
    }

    const selectedMembers = projectMemberOptions.filter(item => selectedMemberAccounts.includes(item.account))
    if (memberPickerContext.replaceAccount && selectedMembers.length !== 1) {
      message.warning('替换成员时只能选择一个成员')
      return
    }

    setAssignmentDrafts(previous => {
      const current = previous[memberPickerContext.assignmentKey] ?? getAssignmentDraft(memberPickerContext.assignmentKey)
      const field = memberPickerContext.role === 'annotator' ? 'annotators' : 'reviewers'
      const nextMembers = memberPickerContext.replaceAccount
        ? current[field].map(item => (item.account === memberPickerContext.replaceAccount ? selectedMembers[0] : item))
        : selectedMembers

      return {
        ...previous,
        [memberPickerContext.assignmentKey]: {
          ...current,
          [field]: nextMembers,
        },
      }
    })
    setMemberPickerContext(null)
    setSelectedMemberAccounts([])
  }
  const removeAssignedMember = (assignmentKey: string, role: MemberRole, account: string) => {
    setAssignmentDrafts(previous => {
      const current = previous[assignmentKey] ?? getAssignmentDraft(assignmentKey)
      const field = role === 'annotator' ? 'annotators' : 'reviewers'
      return {
        ...previous,
        [assignmentKey]: {
          ...current,
          [field]: current[field].filter(item => item.account !== account),
        },
      }
    })
  }

  useEffect(() => {
    const nextType = getDatasetTypeFromSearch(location.search)
    const mode = new URLSearchParams(location.search).get('mode')
    setDatasetType(nextType)
    form.setFieldValue('datasetType', nextType)
    if (mode === 'multi' || isMultiCreatePage) {
      setCollaborationTab('multi')
    }
  }, [form, isMultiCreatePage, location.search])

  useEffect(() => {
    let active = true
    setListLoading(true)

    void dataServiceApi
      .listAnnotationTasks({ page, pageSize })
      .then(result => {
        if (!active) {
          return
        }
        setListResult(result as PaginatedResult<AnnotationTask>)
      })
      .finally(() => {
        if (active) {
          setListLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [annotationTasks, page, pageSize])

  useEffect(() => {
    if (!annotationId) {
      return
    }

    setAnnotationSamples(buildAnnotationSamples(fallbackAnnotationTask))
    setSamplePage(1)
    setSampleFilter('全部')
    setSubmitted(false)
    setReviewSubmitted(false)
    setReviewDecisions({})
    setServiceConfig(previous => ({
      ...previous,
      service: getDefaultAnnotationService(fallbackAnnotationTask?.datasetType),
    }))
  }, [annotationId, fallbackAnnotationTask])

  useEffect(() => {
    if (samplePage > Math.max(visibleSamples.length, 1)) {
      setSamplePage(Math.max(visibleSamples.length, 1))
    }
  }, [samplePage, visibleSamples.length])

  useEffect(() => {
    setPage(1)
  }, [collaborationTab, datasetType, multiSubTab])

  useEffect(() => {
    if (configOpen) {
      configForm.setFieldsValue(serviceConfig)
    }
  }, [configForm, configOpen, serviceConfig])

  const handleDatasetTypeChange = (nextType: 'text-generation' | 'image-understanding') => {
    navigate(`/data-annotation?dataset_type=${nextType}`)
    setSelectedDatasetValue(undefined)
    form.setFieldsValue({ dataset: undefined, datasetType: nextType, outputName: undefined })
  }

  const handleOpenCreate = () => {
    form.resetFields()
    form.setFieldsValue({
      datasetType,
      outputMode: '新增版本',
      sourceType: '已有数据集',
    })
    setSelectedDatasetValue(undefined)
    if (collaborationTab === 'multi') {
      navigate(`/data-annotation/multi/create?dataset_type=${datasetType}`)
      return
    }
    setCreateOpen(true)
  }

  const handleCloseCreate = () => {
    setCreateOpen(false)
    setSelectedDatasetValue(undefined)
    setDatasetPickerOpen(false)
  }

  const handleSubmitCreate = async () => {
    try {
      await form.validateFields()
      if (!selectedDataset) {
        message.warning('请选择需要标注的数据集')
        return
      }
      setCreateOpen(false)
    } catch {
      return
    }

    const datasetLabel = selectedDataset?.label ?? '-'
    const outputMode = form.getFieldValue('outputMode')
    const createMode = isMultiCreatePage ? 'multi' : collaborationTab
    const createAssignmentDraft = getAssignmentDraft(CREATE_ASSIGNMENT_KEY)
    setCreating(true)
    try {
      await dataServiceApi.createAnnotationTask({
        name: form.getFieldValue('name'),
        dataVolume: selectedDataset?.count ?? 0,
        collaborationMode: createMode,
        reviewerCount:
          createMode === 'multi'
            ? createAssignmentDraft.annotators.length + createAssignmentDraft.reviewers.length
            : undefined,
        reviewMode: createMode === 'multi' ? '抽检审核' : undefined,
        datasetType: form.getFieldValue('datasetType'),
        preDataset: datasetLabel,
        postDataset: outputMode === '新增版本' ? `${datasetLabel}-标注结果` : '-',
        outputMode,
      })
      if (isMultiCreatePage) {
        navigate(`/data-annotation?dataset_type=${form.getFieldValue('datasetType')}&mode=multi`)
      }
    } finally {
      setCreating(false)
    }
  }

  const handleGroundTruthChange = (sampleId: string, value: string) => {
    setAnnotationSamples(previous =>
      previous.map(item => (item.id === sampleId ? { ...item, groundTruth: value } : item)),
    )
  }

  const handleAssistantAnswerChange = (sampleId: string, answerIndex: number, value: string) => {
    setAnnotationSamples(previous =>
      previous.map(item => {
        if (item.id !== sampleId) {
          return item
        }

        const nextAnswers = [...(item.assistantAnswers ?? [])]
        nextAnswers[answerIndex] = value
        return { ...item, assistantAnswers: nextAnswers }
      }),
    )
  }

  const handleCompleteSample = (sampleId: string) => {
    const targetSample = annotationSamples.find(item => item.id === sampleId)
    const answerComplete = targetSample?.assistantAnswers
      ? targetSample.assistantAnswers.every(answer => answer.trim())
      : Boolean(targetSample?.groundTruth.trim())
    if (!answerComplete) {
      message.warning(targetSample?.assistantAnswers ? '请先完成全部 Assistant 标注内容' : '请先填写 Ground Truth')
      return
    }

    const nextSamples = annotationSamples.map(item =>
      item.id === sampleId ? { ...item, status: '已标注' as const } : item,
    )
    setAnnotationSamples(nextSamples)

    const nextPendingIndex = nextSamples.findIndex(item => item.status === '待标注')
    if (nextPendingIndex >= 0) {
      setSampleFilter('全部')
      setSamplePage(nextPendingIndex + 1)
      message.success('当前数据已完成，已自动切换到下一条')
      return
    }

    setSampleFilter('全部')
    setSamplePage(nextSamples.length)
    message.success('全部数据已完成标注，可以提交标注')
  }

  const handleSubmitAnnotation = () => {
    if (!allSamplesAnnotated) {
      message.warning('请先完成全部数据标注')
      return
    }

    setSubmitted(true)
    message.success('标注已提交，结果已锁定')
  }

  const handleReviewResultChange = (sampleId: string, result: '通过' | '未通过') => {
    setReviewDecisions(previous => ({
      ...previous,
      [sampleId]: {
        status: previous[sampleId]?.status === '已审核' ? '已审核' : '待审核',
        result,
        reason: result === '未通过' ? previous[sampleId]?.reason : undefined,
      },
    }))
  }

  const handleReviewReasonChange = (sampleId: string, reason: string) => {
    setReviewDecisions(previous => ({
      ...previous,
      [sampleId]: {
        status: previous[sampleId]?.status ?? '待审核',
        result: previous[sampleId]?.result,
        reason,
      },
    }))
  }

  const handleCompleteReview = (sampleId: string) => {
    const decision = reviewDecisions[sampleId]
    if (!decision?.result) {
      message.warning('请先选择审核结果')
      return
    }
    if (decision.result === '未通过' && !decision.reason?.trim()) {
      message.warning('审核不通过时请填写原因')
      return
    }

    const nextDecisions = {
      ...reviewDecisions,
      [sampleId]: {
        ...decision,
        status: '已审核' as const,
      },
    }
    setReviewDecisions(nextDecisions)

    const nextPendingIndex = annotationSamples.findIndex(item => nextDecisions[item.id]?.status !== '已审核')
    if (nextPendingIndex >= 0) {
      setSampleFilter('全部')
      setSamplePage(nextPendingIndex + 1)
      message.success('当前数据已完成审核，已自动切换到下一条')
      return
    }

    setSampleFilter('全部')
    setSamplePage(annotationSamples.length)
    message.success('全部数据已完成审核，可以提交审核')
  }

  const handleSubmitReview = () => {
    if (!allSamplesReviewed) {
      message.warning('请先完成全部数据审核')
      return
    }

    setReviewSubmitted(true)
    message.success('审核已提交，结果已锁定')
  }

  const handleDeleteAnnotationSample = (record: AnnotationSample, locked = submitted || reviewSubmitted) => {
    if (locked) {
      Modal.warning({
        title: '已提交数据不允许删除',
        content: '当前标注或审核结果已提交，数据已锁定，不能再删除单条数据。',
      })
      return
    }

    Modal.confirm({
      title: '确认删除该条数据？',
      content: '删除后不可恢复，请确认是否继续。',
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        setAnnotationSamples(previous => {
          const nextSamples = previous.filter(item => item.id !== record.id).map((item, index) => ({
            ...item,
            index: index + 1,
          }))
          setSamplePage(current => Math.min(current, Math.max(nextSamples.length, 1)))
          return nextSamples
        })
        setReviewDecisions(previous => {
          const { [record.id]: _removed, ...rest } = previous
          return rest
        })
        message.success('删除成功')
      },
    })
  }

  const handleSaveConfig = async () => {
    try {
      const values = await configForm.validateFields()
      setServiceConfig(values)
      setConfigOpen(false)
      message.success('标注配置已保存')
    } catch {
      return
    }
  }

  const renderImagePrompt = (record: AnnotationSample) => (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      {(record.imagePrompts ?? []).map((item, index) => (
        <div key={`${record.id}-image-${index}`} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, alignItems: 'center' }}>
          <div
            style={{
              height: 72,
              borderRadius: 10,
              border: '1px solid #dbeafe',
              background: index % 2 === 0
                ? 'linear-gradient(135deg, #1e293b 0%, #2563eb 48%, #f97316 100%)'
                : 'linear-gradient(135deg, #0f766e 0%, #38bdf8 48%, #fde68a 100%)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.24)',
            }}
          >
            {item.imageLabel}
          </div>
          <Text style={{ lineHeight: 1.7 }}>{item.question}</Text>
        </div>
      ))}
    </Space>
  )

  const renderAssistantAnswers = (record: AnnotationSample, readonly = false) => (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      {(record.assistantAnswers ?? []).map((answer, index) => (
        <div key={`${record.id}-answer-${index}`}>
          <Input.TextArea
            value={answer}
            disabled={readonly || submitted}
            autoSize={{ minRows: 3, maxRows: 6 }}
            placeholder={`请输入第 ${index + 1} 条标注内容`}
            onChange={event => handleAssistantAnswerChange(record.id, index, event.target.value)}
          />
          {!readonly && (
            <Button
              size="small"
              icon={<RobotOutlined />}
              style={{ marginTop: 6 }}
              onClick={() =>
                handleAssistantAnswerChange(
                  record.id,
                  index,
                  index === 0
                    ? '图中包含主要人物、场景背景和可识别动作，答案应覆盖主体身份与画面关键信息。'
                    : '图中人物正在进行互动或动作表达，答案应描述行为、情绪和上下文环境。',
                )
              }
            >
              AI标注
            </Button>
          )}
        </div>
      ))}
    </Space>
  )

  const columns: ColumnsType<AnnotationTask> = [
    { title: '任务名称', dataIndex: 'name', key: 'name' },
    {
      title: '任务状态',
      dataIndex: 'status',
      key: 'status',
      width: 96,
      render: (_, record) => {
        const status = getAnnotationTaskStatus(record)
        return <Tag color={getAnnotationStatusColor(status)}>{status}</Tag>
      },
    },
    { title: '数据量', dataIndex: 'dataVolume', key: 'dataVolume', width: 88 },
    {
      title: '标注进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 110,
      render: value => (value === null ? '-' : <Progress percent={value} size="small" showInfo={false} />),
    },
    { title: '标注前数据集', dataIndex: 'preDataset', key: 'preDataset', ellipsis: true },
    { title: '标注后数据集', dataIndex: 'postDataset', key: 'postDataset', ellipsis: true },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 120 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 176 },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/data-annotation/${record.id}`)}>
            查看详情
          </Button>
        </Space>
      ),
    },
  ]

  const multiOverviewColumns: ColumnsType<AnnotationTask> = [
    { title: '标注任务', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: '数据量', dataIndex: 'dataVolume', key: 'dataVolume', width: 88 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 96,
      render: (_, record) => {
        const status = getAnnotationTaskStatus(record)
        return <Tag color={status === '已提交' ? 'success' : 'processing'}>{status === '已提交' ? '已发布' : '未发布'}</Tag>
      },
    },
    {
      title: '标注进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 140,
      render: value => (value === null ? '-' : <Progress percent={value} size="small" />),
    },
    {
      title: '审核进度',
      key: 'reviewProgress',
      width: 140,
      render: (_, record) => <Progress percent={record.status === '已提交' ? 100 : record.status === '待审核' ? 30 : 0} size="small" />,
    },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 120 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 176 },
    {
      title: '操作',
      key: 'action',
      width: 260,
      render: (_, record) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<SendOutlined />} disabled={record.status !== '已提交'}>
            发布
          </Button>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/data-annotation/${record.id}`)}>
            详情
          </Button>
          <Button type="link" size="small" icon={<TeamOutlined />} onClick={() => setMemberModalTask(record)}>
            任务成员
          </Button>
        </Space>
      ),
    },
  ]

  const myAnnotationColumns: ColumnsType<AnnotationTask & { assignedCount: number; assignmentStatus: string }> = [
    { title: '标注任务', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: '分配数据量', dataIndex: 'assignedCount', key: 'assignedCount', width: 110 },
    { title: '任务状态', dataIndex: 'assignmentStatus', key: 'assignmentStatus', width: 100, render: value => <Tag color={value === '已完成' ? 'success' : 'processing'}>{value}</Tag> },
    { title: '来源数据集', dataIndex: 'preDataset', key: 'preDataset', ellipsis: true },
    { title: '分配人', dataIndex: 'creator', key: 'creator', width: 120 },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/data-annotation/${record.id}?view=annotation`)}>
          查看详情
        </Button>
      ),
    },
  ]

  const myReviewColumns: ColumnsType<AnnotationTask & { reviewCount: number; reviewStatus: string }> = [
    { title: '审核任务', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: '待审核数据量', dataIndex: 'reviewCount', key: 'reviewCount', width: 120 },
    { title: '审核状态', dataIndex: 'reviewStatus', key: 'reviewStatus', width: 100, render: value => <Tag color={value === '已审核' ? 'success' : 'warning'}>{value}</Tag> },
    { title: '标注结果集', dataIndex: 'postDataset', key: 'postDataset', ellipsis: true },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 120 },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/data-annotation/${record.id}?view=review`)}>
          详情
        </Button>
      ),
    },
  ]

  const annotationColumns: ColumnsType<AnnotationSample> = [
    {
      title: '序号',
      dataIndex: 'index',
      key: 'index',
      width: 72,
      align: 'center',
    },
    {
      title: 'System',
      dataIndex: 'system',
      key: 'system',
      width: 260,
      render: value => <Text style={{ lineHeight: 1.7 }}>{value}</Text>,
    },
    {
      title: 'Prompt',
      dataIndex: 'prompt',
      key: 'prompt',
      width: 300,
      render: value => <Text style={{ lineHeight: 1.7 }}>{value}</Text>,
    },
    {
      title: 'Ground Truth',
      dataIndex: 'groundTruth',
      key: 'groundTruth',
      width: 360,
      render: (_, record) => (
        <Input.TextArea
          value={record.groundTruth}
          disabled={submitted}
          autoSize={{ minRows: 5, maxRows: 8 }}
          placeholder="请输入当前数据的标注结果"
          onChange={event => handleGroundTruthChange(record.id, event.target.value)}
        />
      ),
    },
    {
      title: '标注进度',
      dataIndex: 'status',
      key: 'status',
      width: 112,
      render: value => (
        <Tag color={value === '已标注' ? 'success' : 'warning'} icon={value === '已标注' ? <CheckCircleOutlined /> : undefined}>
          {value}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            disabled={submitted || record.status === '已标注'}
            onClick={() => handleCompleteSample(record.id)}
          >
            完成标注
          </Button>
          <Button type="link" size="small" danger disabled={submitted} onClick={() => handleDeleteAnnotationSample(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ]
  const completedAnnotationColumns: ColumnsType<AnnotationSample> = [
    {
      title: '序号',
      dataIndex: 'index',
      key: 'index',
      width: 72,
      align: 'center',
    },
    {
      title: 'System',
      dataIndex: 'system',
      key: 'system',
      width: 260,
      render: value => <Text style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{value}</Text>,
    },
    {
      title: 'Prompt',
      dataIndex: 'prompt',
      key: 'prompt',
      width: 300,
      render: value => <Text style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{value}</Text>,
    },
    {
      title: 'Ground Truth',
      dataIndex: 'groundTruth',
      key: 'groundTruth',
      width: 360,
      render: value => (
        <div
          style={{
            minHeight: 92,
            padding: '10px 12px',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            background: '#f8fafc',
            color: '#334155',
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
          }}
        >
          {value || '-'}
        </div>
      ),
    },
  ]
  const imageAnnotationColumns: ColumnsType<AnnotationSample> = [
    {
      title: '序号',
      dataIndex: 'index',
      key: 'index',
      width: 72,
      align: 'center',
    },
    {
      title: 'System',
      dataIndex: 'system',
      key: 'system',
      width: 220,
      render: value => <Text style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{value}</Text>,
    },
    {
      title: 'User',
      key: 'user',
      width: 380,
      render: (_, record) => renderImagePrompt(record),
    },
    {
      title: 'Assistant',
      key: 'assistant',
      width: 420,
      render: (_, record) => renderAssistantAnswers(record),
    },
    {
      title: '标注进度',
      dataIndex: 'status',
      key: 'status',
      width: 112,
      render: value => (
        <Tag color={value === '已标注' ? 'success' : 'warning'} icon={value === '已标注' ? <CheckCircleOutlined /> : undefined}>
          {value}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            disabled={submitted || record.status === '已标注'}
            onClick={() => handleCompleteSample(record.id)}
          >
            完成标注
          </Button>
          <Button type="link" size="small" danger disabled={submitted} onClick={() => handleDeleteAnnotationSample(record)}>
            删除
          </Button>
        </Space>
      ),
    },
  ]
  const completedImageAnnotationColumns: ColumnsType<AnnotationSample> = imageAnnotationColumns
    .filter(column => column.key !== 'status' && column.key !== 'action')
    .map(column => (
      column.key === 'assistant'
        ? { ...column, render: (_, record) => renderAssistantAnswers(record, true) }
        : column
    ))

  const renderMemberAssignmentSection = (
    assignmentKey: string,
    role: MemberRole,
    totalCount: number,
    options?: { compact?: boolean; readonlyAssignment?: boolean; deadline?: string },
  ) => {
    const draft = getAssignmentDraft(assignmentKey)
    const members = role === 'annotator' ? draft.annotators : draft.reviewers
    const quantityLabel = role === 'annotator' ? '标注数量 平均分配' : '审核数量 平均分配'
    const sectionTitle = role === 'annotator' ? '选择标注成员' : '选择审核成员'
    const assignedCount = members.length ? totalCount : 0
    const actionText = options?.readonlyAssignment ? '替换' : '移除'

    return (
      <Card
        title={
          <Space>
            <TeamOutlined />
            <span>{sectionTitle}</span>
          </Space>
        }
        extra={
          role === 'reviewer' ? (
            <Space>
              <Text type="secondary">抽检比例:</Text>
              <InputNumber min={1} max={100} defaultValue={100} addonAfter="%" style={{ width: 132 }} />
            </Space>
          ) : null
        }
        style={{ borderRadius: 14, border: '1px solid #e2e8f0' }}
        styles={{ body: { padding: options?.compact ? 14 : 18 } }}
      >
        {role === 'reviewer' && (
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            请填写人数或输入分配比例，默认为100%
          </Text>
        )}
        <Table<ProjectMember>
          rowKey="account"
          size="small"
          columns={[
            { title: role === 'annotator' ? '标注成员' : '审核成员', dataIndex: 'username', key: 'username' },
            {
              title: quantityLabel,
              key: 'quantity',
              width: 160,
              render: () => `${members.length ? Math.ceil(totalCount / members.length) : 0}条`,
            },
            {
              title: '任务截止时间 统一时间',
              key: 'deadline',
              width: 180,
              render: () =>
                options?.readonlyAssignment ? (
                  <Text>{options.deadline ?? '2026/04/23 05:00:00'}</Text>
                ) : (
                  <Input size="small" placeholder="请选择截止时间" />
                ),
            },
            {
              title: '操作',
              key: 'action',
              width: 88,
              render: (_, record: ProjectMember) => (
                <Button
                  type="link"
                  size="small"
                  danger={!options?.readonlyAssignment}
                  onClick={() =>
                    options?.readonlyAssignment
                      ? openMemberPicker(assignmentKey, role, record.account)
                      : removeAssignedMember(assignmentKey, role, record.account)
                  }
                >
                  {actionText}
                </Button>
              ),
            },
          ]}
          dataSource={members}
          pagination={false}
          locale={{ emptyText: role === 'annotator' ? '暂无标注成员' : '暂无审核成员' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginTop: 14 }}>
          <Text type="secondary">
            分配{role === 'annotator' ? '标注' : '审核'}数量/总计{role === 'annotator' ? '标注' : '审核'}数量: {assignedCount}条/{totalCount}条
          </Text>
          {!options?.readonlyAssignment && (
            <Button icon={<PlusOutlined />} onClick={() => openMemberPicker(assignmentKey, role)}>
              添加{role === 'annotator' ? '标注' : '审核'}成员
            </Button>
          )}
        </div>
      </Card>
    )
  }

  const renderDatasetPickerModal = () => (
    <Modal
      title="选择数据集"
      open={datasetPickerOpen}
      onCancel={() => setDatasetPickerOpen(false)}
      footer={null}
      width={720}
      destroyOnClose
    >
      <Table<DatasetOption>
        rowKey="value"
        size="small"
        columns={[
          { title: '数据集名称', dataIndex: 'label', key: 'label', ellipsis: true },
          { title: '数据量', dataIndex: 'count', key: 'count', width: 120 },
          {
            title: '操作',
            key: 'action',
            width: 96,
            render: (_, record) => (
              <Button
                type="link"
                onClick={() => {
                  setSelectedDatasetValue(record.value)
                  form.setFieldValue('dataset', record.value)
                  setDatasetPickerOpen(false)
                }}
              >
                选择
              </Button>
            ),
          },
        ]}
        dataSource={datasetOptions}
        pagination={false}
        locale={{ emptyText: '当前无可用数据集' }}
      />
    </Modal>
  )

  const renderMemberPickerModal = () => (
    <Modal
      title={`${memberPickerContext?.assignmentKey === CREATE_ASSIGNMENT_KEY ? '添加' : '替换'}${memberPickerContext?.role === 'reviewer' ? '审核成员' : '标注成员'}`}
      open={Boolean(memberPickerContext)}
      onCancel={() => {
        setMemberPickerContext(null)
        setSelectedMemberAccounts([])
      }}
      width={760}
      footer={
        <Space>
          <Button
            onClick={() => {
              setMemberPickerContext(null)
              setSelectedMemberAccounts([])
            }}
          >
            取消
          </Button>
          <Button
            type="primary"
            disabled={
              memberPickerContext?.replaceAccount
                ? selectedMemberAccounts.length !== 1
                : !selectedMemberAccounts.length
            }
            onClick={handleAddSelectedMembers}
          >
            {memberPickerContext?.assignmentKey === CREATE_ASSIGNMENT_KEY ? '添加' : '替换'}选中成员 ({selectedMemberAccounts.length})
          </Button>
        </Space>
      }
      destroyOnClose
    >
      <Space style={{ width: '100%', marginBottom: 14 }} align="start">
        <Input.Search placeholder="搜索账号" allowClear enterButton="搜索" style={{ width: 320 }} />
      </Space>
      <Text strong style={{ display: 'block', marginBottom: 10 }}>
        从项目成员列表中选择
      </Text>
      <Table<ProjectMember>
        rowKey="account"
        size="small"
        rowSelection={{
          type: memberPickerContext?.replaceAccount ? 'radio' : 'checkbox',
          selectedRowKeys: selectedMemberAccounts,
          onChange: keys => {
            const nextKeys = keys.map(String)
            setSelectedMemberAccounts(memberPickerContext?.replaceAccount ? nextKeys.slice(-1) : nextKeys)
          },
        }}
        columns={[
          { title: '账号', dataIndex: 'account', key: 'account' },
          { title: '用户名', dataIndex: 'username', key: 'username' },
          { title: '邮箱', dataIndex: 'email', key: 'email' },
        ]}
        dataSource={projectMemberOptions}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: total => `1-${Math.min(total, 10)} / ${total} 个用户` }}
      />
    </Modal>
  )

  const renderMemberManagementModal = () => {
    if (!memberModalTask) {
      return null
    }

    const assignmentKey = memberModalTask.id
    return (
      <Modal
        title={`${memberModalTask.name} · 任务成员`}
        open
        onCancel={() => setMemberModalTask(null)}
        width={980}
        footer={<Button onClick={() => setMemberModalTask(null)}>关闭</Button>}
        destroyOnClose
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Text type="secondary">项目管理员可查看该多人标注任务的成员分配，截止时间取任务创建时配置；如需调整成员，可使用替换操作。</Text>
          {renderMemberAssignmentSection(assignmentKey, 'annotator', memberModalTask.dataVolume, {
            compact: true,
            readonlyAssignment: true,
            deadline: '2026/04/23 05:00:00',
          })}
          {renderMemberAssignmentSection(assignmentKey, 'reviewer', memberModalTask.dataVolume, {
            compact: true,
            readonlyAssignment: true,
            deadline: '2026/04/22 16:30:18',
          })}
        </Space>
      </Modal>
    )
  }

  const renderCreateMultiPage = () => (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(`/data-annotation?dataset_type=${datasetType}&mode=multi`)}
          style={{ padding: 0, marginBottom: 8 }}
        >
          返回
        </Button>
        <Title level={2} style={{ margin: 0, color: '#0f172a' }}>创建多人标注任务</Title>
        <Text type="secondary">配置数据集、输出结果与标注/审核成员分配。</Text>

        <Card style={{ marginTop: 20, borderRadius: 16, border: '1px solid #e2e8f0' }}>
          <Form form={form} layout="vertical" initialValues={{ sourceType: '已有数据集', outputMode: '新增版本', datasetType }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 20px' }}>
              <Form.Item label="任务名称" name="name" rules={[{ required: true, message: '请输入任务名称' }]}>
                <Input placeholder="请输入任务名称" />
              </Form.Item>
              <Form.Item label="数据集类型" name="datasetType" rules={[{ required: true, message: '请选择数据集类型' }]}>
                <Radio.Group
                  onChange={event => {
                    const nextType = event.target.value as 'text-generation' | 'image-understanding'
                    setDatasetType(nextType)
                    setSelectedDatasetValue(undefined)
                    form.setFieldsValue({ dataset: undefined, datasetType: nextType, outputName: undefined })
                  }}
                >
                  <Radio.Button value="text-generation">文本生成</Radio.Button>
                  <Radio.Button value="image-understanding">图像理解</Radio.Button>
                </Radio.Group>
              </Form.Item>
              <Form.Item label="数据选择" name="sourceType">
                <Radio.Group>
                  <Radio value="已有数据集">已有数据集</Radio>
                </Radio.Group>
              </Form.Item>
              <Form.Item label="选择数据集" name="dataset" rules={[{ required: true, message: '请选择数据集' }]}>
                <Input.Group compact>
                  <Input readOnly placeholder="请选择需要标注的数据集" value={selectedDataset?.label} style={{ width: 'calc(100% - 88px)' }} />
                  <Button type="primary" disabled={!datasetOptions.length} onClick={() => setDatasetPickerOpen(true)} style={{ width: 88 }}>
                    选择
                  </Button>
                </Input.Group>
              </Form.Item>
              <div style={{ marginTop: -10, marginBottom: 16 }}>
                <Text type="secondary">数据量:{selectedDataset?.count ?? 0}条</Text>
              </div>
              <Form.Item label="处理后数据集" name="outputMode">
                <Radio.Group>
                  <Radio value="新增版本">新增版本</Radio>
                </Radio.Group>
              </Form.Item>
            </div>
          </Form>
        </Card>

        <Space direction="vertical" size={16} style={{ width: '100%', marginTop: 18 }}>
          {renderMemberAssignmentSection(CREATE_ASSIGNMENT_KEY, 'annotator', selectedDataset?.count ?? 0)}
          {renderMemberAssignmentSection(CREATE_ASSIGNMENT_KEY, 'reviewer', selectedDataset?.count ?? 0)}
        </Space>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
          <Button onClick={() => navigate(`/data-annotation?dataset_type=${datasetType}&mode=multi`)}>取消</Button>
          <Button type="primary" loading={creating} onClick={handleSubmitCreate}>创建</Button>
        </div>
      </div>
      {renderDatasetPickerModal()}
      {renderMemberPickerModal()}
    </>
  )

  if (isMultiCreatePage) {
    return renderCreateMultiPage()
  }

  if (annotationId) {
    const task = fallbackAnnotationTask
    const serviceLabel = annotationServiceOptions.find(item => item.value === serviceConfig.service)?.label ?? '-'
    const taskStatus = task ? getAnnotationTaskStatus(task) : '未开始'
    const readonlyDetail = taskStatus === '已完成' || taskStatus === '已提交'
    const isImageDetail = task?.datasetType === 'image-understanding'
    const isMultiDetail = task?.collaborationMode === 'multi'
    const detailView = new URLSearchParams(location.search).get('view')
    const isMultiAnnotationWork = isMultiDetail && detailView === 'annotation'
    const isMultiReviewWork = isMultiDetail && detailView === 'review'
    const isMultiOverviewDetail = isMultiDetail && !isMultiAnnotationWork && !isMultiReviewWork
    const reviewPercent = task?.status === '已提交' ? 100 : task?.status === '待审核' ? 30 : taskStatus === '已完成' ? 80 : 0
    const multiDetailColumns: ColumnsType<AnnotationSample> = [
      {
        title: '序号',
        dataIndex: 'index',
        key: 'index',
        width: 72,
        align: 'center',
      },
      {
        title: 'System',
        dataIndex: 'system',
        key: 'system',
        width: 220,
        render: value => <Text style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{value}</Text>,
      },
      {
        title: isImageDetail ? 'User' : 'Prompt',
        dataIndex: 'prompt',
        key: 'prompt',
        width: 320,
        render: (_, record) => isImageDetail ? renderImagePrompt(record) : <Text style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{record.prompt}</Text>,
      },
      {
        title: isImageDetail ? 'Assistant' : 'Ground Truth',
        dataIndex: 'groundTruth',
        key: 'groundTruth',
        width: 360,
        render: (_, record) =>
          isImageDetail ? (
            renderAssistantAnswers(record, true)
          ) : (
            <div
              style={{
                minHeight: 72,
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                background: '#f8fafc',
                color: '#334155',
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
              }}
            >
              {record.groundTruth || '待标注'}
            </div>
          ),
      },
      {
        title: '标注进度',
        key: 'annotationProgress',
        width: 140,
        render: (_, record) => {
          const status = getIndexedAnnotationStatus(task?.progress ?? 0, record.index, annotationSamples.length)
          return <Tag color={status === '已标注' ? 'success' : 'default'}>{status}</Tag>
        },
      },
      {
        title: '审核进度',
        key: 'reviewProgress',
        width: 140,
        render: (_, record) => {
          const status = getIndexedReviewStatus(reviewPercent, record.index, annotationSamples.length)
          const color = status === '通过' ? 'success' : status === '未通过' ? 'error' : 'default'
          return <Tag color={color}>{status}</Tag>
        },
      },
    ]
    const multiTextAnnotationColumns: ColumnsType<AnnotationSample> = [
      {
        title: '序号',
        dataIndex: 'index',
        key: 'index',
        width: 72,
        align: 'center',
      },
      {
        title: 'System',
        dataIndex: 'system',
        key: 'system',
        width: 220,
        render: value => <Text style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{value}</Text>,
      },
      {
        title: 'User',
        dataIndex: 'prompt',
        key: 'user',
        width: 340,
        render: value => <Text style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{value}</Text>,
      },
      {
        title: 'Assistant',
        dataIndex: 'groundTruth',
        key: 'assistant',
        width: 420,
        render: (_, record) => (
          <Input.TextArea
            value={record.groundTruth}
            disabled={submitted}
            autoSize={{ minRows: 5, maxRows: 8 }}
            placeholder={`请输入第 ${record.index} 条标注内容`}
            onChange={event => handleGroundTruthChange(record.id, event.target.value)}
          />
        ),
      },
      {
        title: '标注进度',
        dataIndex: 'status',
        key: 'status',
        width: 112,
        render: value => (
          <Tag color={value === '已标注' ? 'success' : 'warning'} icon={value === '已标注' ? <CheckCircleOutlined /> : undefined}>
            {value === '已标注' ? '已完成' : value}
          </Tag>
        ),
      },
      {
        title: '操作',
        key: 'action',
        width: 180,
        render: (_, record) => (
          <Space size={0}>
            <Button
              type="link"
              size="small"
              disabled={submitted || record.status === '已标注'}
              onClick={() => handleCompleteSample(record.id)}
            >
              完成标注
            </Button>
            <Button type="link" size="small" danger disabled={submitted || readonlyDetail} onClick={() => handleDeleteAnnotationSample(record, submitted || readonlyDetail)}>
              删除
            </Button>
          </Space>
        ),
      },
    ]
    const multiAnnotationColumns = isImageDetail ? imageAnnotationColumns : multiTextAnnotationColumns
    const multiReviewColumns: ColumnsType<AnnotationSample> = [
      {
        title: '序号',
        dataIndex: 'index',
        key: 'index',
        width: 72,
        align: 'center',
      },
      {
        title: 'System',
        dataIndex: 'system',
        key: 'system',
        width: 220,
        render: value => <Text style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{value}</Text>,
      },
      {
        title: 'User',
        key: 'prompt',
        width: 320,
        render: (_, record) => isImageDetail ? renderImagePrompt(record) : <Text style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{record.prompt}</Text>,
      },
      {
        title: 'Assistant',
        key: 'groundTruth',
        width: 360,
        render: (_, record) =>
          isImageDetail ? (
            renderAssistantAnswers(record, true)
          ) : (
            <div
              style={{
                minHeight: 72,
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                background: '#f8fafc',
                color: '#334155',
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
              }}
            >
              {record.groundTruth || `这是第 ${record.index} 条数据的标注结果，待审核确认。`}
            </div>
          ),
      },
      {
        title: '审核结果',
        key: 'reviewResult',
        width: 280,
        render: (_, record) => {
          const decision = reviewDecisions[record.id]
          return (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Radio.Group
                disabled={reviewSubmitted || decision?.status === '已审核'}
                value={decision?.result}
                onChange={event => handleReviewResultChange(record.id, event.target.value)}
              >
                <Radio value="通过">通过</Radio>
                <Radio value="未通过">未通过</Radio>
              </Radio.Group>
              {decision?.result === '未通过' && (
                <Input.TextArea
                  disabled={reviewSubmitted || decision.status === '已审核'}
                  value={decision.reason}
                  autoSize={{ minRows: 3, maxRows: 5 }}
                  placeholder="请输入审核不通过原因"
                  onChange={event => handleReviewReasonChange(record.id, event.target.value)}
                />
              )}
            </Space>
          )
        },
      },
      {
        title: '操作',
        key: 'action',
        width: 190,
        render: (_, record) => {
          const decision = reviewDecisions[record.id]
          return (
            <Space size={0}>
              <Button
                type="link"
                size="small"
                disabled={reviewSubmitted || decision?.status === '已审核'}
                onClick={() => handleCompleteReview(record.id)}
              >
                完成审核
              </Button>
              <Button type="link" size="small" danger disabled={reviewSubmitted || readonlyDetail} onClick={() => handleDeleteAnnotationSample(record, reviewSubmitted || readonlyDetail)}>
                删除
              </Button>
            </Space>
          )
        },
      },
    ]
    const detailColumns = isMultiDetail
      ? isMultiAnnotationWork
        ? multiAnnotationColumns
        : isMultiReviewWork
          ? multiReviewColumns
          : multiDetailColumns
      : isImageDetail
      ? (readonlyDetail ? completedImageAnnotationColumns : imageAnnotationColumns)
      : (readonlyDetail ? completedAnnotationColumns : annotationColumns)

    return (
      <>
        <div style={{ padding: '28px 32px', minHeight: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 22 }}>
            <div>
              <Button
                type="link"
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate(`/data-annotation?dataset_type=${datasetType}${isMultiDetail ? '&mode=multi' : ''}`)}
                style={{ padding: 0, marginBottom: 8 }}
              >
                返回
              </Button>
              <Title level={2} style={{ margin: 0, color: '#0f172a' }}>
                数据标注 / {task?.name ?? annotationId}
                {isMultiAnnotationWork && ' · 标注任务'}
                {isMultiReviewWork && ' · 审核任务'}
              </Title>
              <Text type="secondary">
                {isMultiAnnotationWork
                  ? '仅展示分配给当前账号的标注数据，完成标注后可提交标注结果。'
                  : isMultiReviewWork
                    ? '仅展示分配给当前账号的审核数据，逐条选择审核结果后提交审核。'
                    : isMultiDetail
                  ? '查看多人标注任务的整体进度，以及每条数据的标注进度和审核进度。'
                  : readonlyDetail
                    ? `当前${isImageDetail ? '图像理解' : '文本'}任务已完成，详情页仅展示标注数据。`
                    : '当页仅展示一条数据；完成当前标注后自动切换下一条，全部完成后才可提交。'}
              </Text>
            </div>
            {!readonlyDetail && !isMultiDetail && (
              <Space>
                <Select
                  value={sampleFilter}
                  style={{ width: 132 }}
                  options={[
                    { value: '全部', label: '全部' },
                    { value: '待标注', label: '待标注' },
                    { value: '已标注', label: '已标注' },
                  ]}
                  onChange={value => {
                    setSampleFilter(value)
                    setSamplePage(1)
                  }}
                />
                <Button icon={<SettingOutlined />} onClick={() => setConfigOpen(true)}>
                  标注配置
                </Button>
              </Space>
            )}
          </div>

          <Card
            style={{ borderRadius: 16, border: '1px solid #e2e8f0', marginBottom: 16 }}
            styles={{ body: { padding: 18 } }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
              <Space size={20} wrap>
                <Text type="secondary">任务数据：<Text strong>{task?.preDataset ?? '-'}</Text></Text>
                {!readonlyDetail && !isMultiDetail && <Text type="secondary">标注服务：<Text strong>{serviceLabel}</Text></Text>}
                {isMultiDetail && !isMultiReviewWork && <Text type="secondary">标注服务：<Text strong>{serviceLabel}</Text></Text>}
                {isMultiOverviewDetail && <Text type="secondary">标注进度：<Text strong>{task?.progress ?? 0}%</Text></Text>}
                {isMultiOverviewDetail && <Text type="secondary">审核进度：<Text strong>{reviewPercent}%</Text></Text>}
                {isMultiAnnotationWork && <Text type="secondary">标注进度：<Text strong>{annotatedCount}/{annotationSamples.length}</Text></Text>}
                {isMultiReviewWork && <Text type="secondary">审核进度：<Text strong>{reviewedCount}/{annotationSamples.length}</Text></Text>}
                {!readonlyDetail && !isMultiDetail && <Text type="secondary">进度：<Text strong>{annotatedCount}/{annotationSamples.length}</Text></Text>}
                {submitted && <Tag color="success">已提交，禁止编辑</Tag>}
                {reviewSubmitted && <Tag color="success">审核已提交，禁止编辑</Tag>}
              </Space>
              {!readonlyDetail && !isMultiDetail && (
                <Progress
                  percent={annotationSamples.length ? Math.round((annotatedCount / annotationSamples.length) * 100) : 0}
                  style={{ width: 220, marginBottom: 0 }}
                />
              )}
            </div>
            {isMultiOverviewDetail && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: 16, marginBottom: 16 }}>
                <Card size="small" styles={{ body: { padding: 12 } }}>
                  <Text type="secondary">标注进度</Text>
                  <Progress percent={task?.progress ?? 0} style={{ marginTop: 8 }} />
                </Card>
                <Card size="small" styles={{ body: { padding: 12 } }}>
                  <Text type="secondary">审核进度</Text>
                  <Progress percent={reviewPercent} status={reviewPercent >= 100 ? 'success' : 'active'} style={{ marginTop: 8 }} />
                </Card>
              </div>
            )}

            <Table<AnnotationSample>
              rowKey="id"
              columns={detailColumns}
              dataSource={
                isMultiOverviewDetail
                  ? annotationSamples
                  : currentSample
                    ? [currentSample]
                    : []
              }
              pagination={
                isMultiOverviewDetail
                  ? { pageSize: 10, showSizeChanger: false, showTotal: total => `共 ${total} 条` }
                  : false
              }
              tableLayout="fixed"
              scroll={{ x: isMultiReviewWork ? 1380 : isImageDetail ? 1320 : 1280 }}
              locale={{ emptyText: '暂无可标注数据' }}
            />

            {(isMultiAnnotationWork || isMultiReviewWork || !isMultiDetail) && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginTop: 18 }}>
              <Space>
                <Text type="secondary">共 {visibleSamples.length} 条</Text>
                <Pagination
                  current={samplePage}
                  total={visibleSamples.length}
                  pageSize={1}
                  showSizeChanger={false}
                  onChange={setSamplePage}
                />
              </Space>
              {isMultiAnnotationWork ? (
                <Button type="primary" disabled={!allSamplesAnnotated || submitted} onClick={handleSubmitAnnotation}>
                  提交标注
                </Button>
              ) : isMultiReviewWork ? (
                <Button type="primary" disabled={!allSamplesReviewed || reviewSubmitted} onClick={handleSubmitReview}>
                  提交审核
                </Button>
              ) : !readonlyDetail && (
                <Button type="primary" disabled={!allSamplesAnnotated || submitted} onClick={handleSubmitAnnotation}>
                  提交标注
                </Button>
              )}
            </div>}
          </Card>
        </div>

        <Modal
          title="标注配置"
          open={configOpen}
          onCancel={() => setConfigOpen(false)}
          onOk={handleSaveConfig}
          width={760}
          okText="确定"
          cancelText="取消"
          destroyOnClose
        >
          <Form form={configForm} layout="vertical" initialValues={serviceConfig}>
            <Form.Item
              label="选择服务"
              name="service"
              rules={[{ required: true, message: '请选择在线推理服务' }]}
            >
              <Select placeholder="请选择在线推理服务" options={annotationServiceOptions} />
            </Form.Item>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
              <Form.Item
                label="Max_tokens（最大生成token数）"
                name="maxTokens"
                rules={[{ required: true, message: '请输入最大生成token数' }]}
              >
                <InputNumber min={1} max={32768} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                label="Temperature（温度）"
                name="temperature"
                rules={[{ required: true, message: '请输入温度' }]}
              >
                <InputNumber min={0} max={2} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                label="Top_p（核采样）"
                name="topP"
                rules={[{ required: true, message: '请输入核采样参数' }]}
              >
                <InputNumber min={0} max={1} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                label="presence_penalty（存在性惩罚）"
                name="presencePenalty"
                rules={[{ required: true, message: '请输入存在性惩罚' }]}
              >
                <InputNumber min={-2} max={2} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </div>
          </Form>
        </Modal>
      </>
    )
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <div style={{ marginBottom: 24 }}>
          <Title level={2} style={{ marginBottom: 8, color: '#0f172a' }}>数据标注</Title>
          <Text type="secondary" style={{ fontSize: 14 }}>
            支持数据集在线标注、多人协同，提升数据处理效率。
          </Text>
        </div>

        <Tabs
          activeKey={collaborationTab}
          onChange={key => setCollaborationTab(key as 'online' | 'multi')}
          items={[
            { key: 'online', label: '在线标注' },
            { key: 'multi', label: '多人标注' },
          ]}
          style={{ marginBottom: 18 }}
        />

        <Card style={{ borderRadius: 12, border: '1px solid #eef2f7', marginBottom: 24 }} styles={{ body: { padding: '24px 28px' } }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 18 }}>
          {stepCards.map((card, index) => (
            <Card
              key={card.title}
              bordered={false}
              style={{ background: 'transparent' }}
              styles={{ body: { padding: 0 } }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: 20, color: '#1677ff' }}>{card.icon}</span>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>{card.title}</div>
                {index < stepCards.length - 1 && <div style={{ flex: 1, height: 1, background: '#1677ff', opacity: 0.85 }} />}
              </div>
              <Text type="secondary" style={{ lineHeight: 1.7, paddingLeft: 32, display: 'block' }}>{card.description}</Text>
            </Card>
          ))}
          </div>
        </Card>

        {collaborationTab === 'online' ? (
          <>
            <Tabs
              activeKey={datasetType}
              onChange={key => handleDatasetTypeChange(key as 'text-generation' | 'image-understanding')}
              items={[
                { key: 'text-generation', label: '文本标注' },
                { key: 'image-understanding', label: '图像标注' },
              ]}
              style={{ marginBottom: 16 }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
              <Button icon={<ReloadOutlined />} onClick={() => message.success('刷新成功')}>刷新</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
                创建标注任务
              </Button>
            </div>

            <Card
              style={{ borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
              styles={{ body: { padding: 0 } }}
            >
              <Table
                rowKey="id"
                columns={columns}
                dataSource={filteredItems}
                loading={listLoading}
                tableLayout="fixed"
                scroll={{ x: 1280 }}
                pagination={{
                  current: page,
                  pageSize,
                  total: filteredItems.length,
                  showSizeChanger: false,
                  showTotal: total => `共 ${total} 条记录`,
                  onChange: (nextPage, nextPageSize) => {
                    setPage(nextPage)
                    setPageSize(nextPageSize)
                  },
                }}
                locale={{ emptyText: '暂无标注任务' }}
              />
            </Card>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
              <Tabs
                activeKey={multiSubTab}
                onChange={key => setMultiSubTab(key as 'overview' | 'annotation' | 'review')}
                items={[
                  { key: 'overview', label: '任务总览' },
                  { key: 'annotation', label: '标注任务' },
                  { key: 'review', label: '审核任务' },
                ]}
                style={{ marginBottom: 0 }}
              />
              <Space>
                <Button icon={<ReloadOutlined />} onClick={() => message.success('刷新成功')}>刷新</Button>
                {multiSubTab === 'overview' && (
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
                    创建标注任务
                  </Button>
                )}
              </Space>
            </div>

            <Card
              style={{ borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
              styles={{ body: { padding: 0 } }}
            >
              <Table<any>
                rowKey="id"
                columns={(multiSubTab === 'overview'
                    ? multiOverviewColumns
                    : multiSubTab === 'annotation'
                      ? myAnnotationColumns
                      : myReviewColumns
                ) as ColumnsType<any>}
                dataSource={(multiSubTab === 'overview'
                    ? multiItems
                    : multiSubTab === 'annotation'
                      ? myAnnotationAssignments
                      : myReviewAssignments
                ) as any[]}
                loading={listLoading}
                tableLayout="fixed"
                scroll={{ x: multiSubTab === 'overview' ? 1320 : 1000 }}
                pagination={{
                  current: page,
                  pageSize,
                  total:
                    multiSubTab === 'overview'
                      ? multiItems.length
                      : multiSubTab === 'annotation'
                        ? myAnnotationAssignments.length
                        : myReviewAssignments.length,
                  showSizeChanger: false,
                  showTotal: total => `共 ${total} 条记录`,
                  onChange: (nextPage, nextPageSize) => {
                    setPage(nextPage)
                    setPageSize(nextPageSize)
                  },
                }}
                locale={{
                  emptyText:
                    multiSubTab === 'overview'
                      ? '暂无多人标注任务'
                      : multiSubTab === 'annotation'
                        ? '当前账号暂无分配的标注任务'
                        : '当前账号暂无分配的审核任务',
                }}
              />
            </Card>
          </>
        )}
      </div>

      <Modal
        title={collaborationTab === 'online' ? '在线标注任务' : '多人标注任务'}
        open={createOpen}
        onCancel={handleCloseCreate}
        width={680}
        destroyOnClose
        footer={
          <Space>
            <Button onClick={handleCloseCreate}>取消</Button>
            <Button type="primary" loading={creating} onClick={handleSubmitCreate}>确定</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" initialValues={{ sourceType: '已有数据集', outputMode: '新增版本', datasetType }}>
          <Form.Item
            label="任务名称"
            name="name"
            rules={[{ required: true, message: '请输入任务名称' }]}
          >
            <Input placeholder="请输入任务名称" />
          </Form.Item>

          <Form.Item
            label="数据集类型"
            name="datasetType"
            rules={[{ required: true, message: '请选择数据集类型' }]}
          >
            <Radio.Group
              onChange={event => {
                const nextType = event.target.value as 'text-generation' | 'image-understanding'
                setDatasetType(nextType)
                setSelectedDatasetValue(undefined)
                form.setFieldsValue({ dataset: undefined, datasetType: nextType, outputName: undefined })
              }}
            >
              <Space size={12}>
                <Radio.Button value="text-generation">
                  <FileTextOutlined style={{ marginRight: 6 }} />
                  文本生成
                </Radio.Button>
                <Radio.Button value="image-understanding">
                  <PictureOutlined style={{ marginRight: 6 }} />
                  图像理解
                </Radio.Button>
              </Space>
            </Radio.Group>
          </Form.Item>

          <Form.Item label="数据选择" name="sourceType">
            <Radio.Group>
              <Radio value="已有数据集">已有数据集</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            label="选择数据集"
            name="dataset"
            rules={[{ required: true, message: '请选择数据集' }]}
          >
            <Input.Group compact>
              <Input
                readOnly
                placeholder="请选择需要标注的数据集"
                value={selectedDataset?.label}
                style={{ width: 'calc(100% - 88px)' }}
              />
              <Button
                type="primary"
                disabled={!datasetOptions.length}
                onClick={() => setDatasetPickerOpen(true)}
                style={{ width: 88 }}
              >
                选择
              </Button>
            </Input.Group>
          </Form.Item>

          <div style={{ marginTop: -6, marginBottom: 16 }}>
            <Text type="secondary">数据量:{selectedDataset?.count ?? 0}条</Text>
          </div>

          <Form.Item label="处理后数据集" name="outputMode">
            <Radio.Group>
              <Radio value="新增版本">新增版本</Radio>
            </Radio.Group>
          </Form.Item>

          {collaborationTab === 'multi' && (
            <>
              <Form.Item label="协作人数" name="reviewerCount" rules={[{ required: true, message: '请输入协作人数' }]}>
                <Select
                  options={[
                    { value: 2, label: '2人' },
                    { value: 3, label: '3人' },
                    { value: 5, label: '5人' },
                  ]}
                />
              </Form.Item>
              <Form.Item label="审核方式" name="reviewMode" rules={[{ required: true, message: '请选择审核方式' }]}>
                <Select
                  options={[
                    { value: '双人交叉审核', label: '双人交叉审核' },
                    { value: '组长复核', label: '组长复核' },
                    { value: '全量复核', label: '全量复核' },
                  ]}
                />
              </Form.Item>
            </>
          )}

          <Text type="secondary">数据集名称: {selectedDataset?.label ?? '-'}</Text>
        </Form>
      </Modal>

      {renderDatasetPickerModal()}
      {renderMemberManagementModal()}
      {renderMemberPickerModal()}
    </>
  )
}

export default DataAnnotation
