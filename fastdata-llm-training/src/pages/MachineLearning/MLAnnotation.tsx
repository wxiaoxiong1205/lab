import React, { useEffect, useState } from 'react'
import {
  App as AntdApp,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Radio,
  Result,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import {
  ArrowLeftOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DeploymentUnitOutlined,
  FormOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
  TagsOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { getCurrentProjectMember, getCurrentUser, usePermissionStore } from '../../services/permissionStore'

const { Title, Text } = Typography

type MLAnnotationRecord = {
  id: string
  name: string
  dataType: '文本' | '图片'
  annotationType: string
  count: number
  progress: number | null
  preDataset: string
  postDataset: string
  creator: string
  createdAt: string
  status: '草稿' | '已完成'
}

type MultiAnnotationRecord = {
  id: string
  name: string
  annotationType: string
  count: number
  status: '草稿' | '已发布'
  annotationProgress: number
  reviewProgress: number
  creator: string
  createdAt: string
  dataset: string
  outputDataset: string
  annotators: string[]
  reviewers: string[]
}

type AssignmentRecord = {
  id: string
  taskName: string
  member: string
  annotationType: string
  amount: number
  completed: number
  preDataset: string
  postDataset: string
  creator: string
  createdAt: string
  deadline: string
  status: '待处理' | '进行中' | '已完成'
}

type MemberDraft = {
  id: string
  member: string
  amount: number
  deadline: string
}

const onlineRecords: MLAnnotationRecord[] = [
  {
    id: '1',
    name: 'Phoena-文本分类-文本多标签-标注',
    dataType: '文本',
    annotationType: '文本分类',
    count: 10,
    progress: 100,
    preDataset: '文本分类/Phoena-文本分类-文本多标签-无标注-V1',
    postDataset: '-',
    creator: 'lab1',
    createdAt: '2026-04-20 14:55:10',
    status: '草稿',
  },
  {
    id: '2',
    name: 'Phoena-文本分类-文本单标签-标注',
    dataType: '文本',
    annotationType: '文本分类',
    count: 10,
    progress: 100,
    preDataset: '文本分类/Phoena-文本分类-文本单标签-无标注-V1',
    postDataset: '-',
    creator: 'lab1',
    createdAt: '2026-04-17 16:18:44',
    status: '草稿',
  },
  {
    id: '3',
    name: 'Phoena-图像分类-单图单标签-标注',
    dataType: '图片',
    annotationType: '图像分类',
    count: 21,
    progress: 100,
    preDataset: '图像分类/Phoena-图像分类-单图单标签-有标注-V2',
    postDataset: '图像分类/Phoena-图像分类-单图单标签-有标注-V3',
    creator: 'lab1',
    createdAt: '2026-04-14 14:28:22',
    status: '已完成',
  },
  {
    id: '4',
    name: 'Phoena-图像分类-单图多标签-标注',
    dataType: '图片',
    annotationType: '图像分类',
    count: 22,
    progress: 9,
    preDataset: '图像分类/Phoena-图像分类-单图多标签-有标注-V2',
    postDataset: '-',
    creator: 'lab1',
    createdAt: '2026-04-14 14:25:09',
    status: '草稿',
  },
  {
    id: '5',
    name: '实体识别-商品属性抽取-标注',
    dataType: '文本',
    annotationType: '实体识别',
    count: 30,
    progress: 64,
    preDataset: '实体识别/商品属性抽取-无标注-V1',
    postDataset: '-',
    creator: 'lab2',
    createdAt: '2026-04-13 11:05:22',
    status: '草稿',
  },
  {
    id: '6',
    name: '物体检测-货架商品框选-标注',
    dataType: '图片',
    annotationType: '物体检测',
    count: 48,
    progress: 32,
    preDataset: '物体检测/货架商品框选-无标注-V1',
    postDataset: '-',
    creator: 'admin',
    createdAt: '2026-04-12 10:18:31',
    status: '草稿',
  },
  {
    id: '7',
    name: '文本分类-客服意图单标签-标注',
    dataType: '文本',
    annotationType: '文本分类',
    count: 36,
    progress: 100,
    preDataset: '文本分类/客服意图单标签-无标注-V1',
    postDataset: '文本分类/客服意图单标签-有标注-V2',
    creator: 'lab5',
    createdAt: '2026-04-11 16:40:20',
    status: '已完成',
  },
  {
    id: '8',
    name: '图像分类-设备缺陷多标签-标注',
    dataType: '图片',
    annotationType: '图像分类',
    count: 52,
    progress: 72,
    preDataset: '图像分类/设备缺陷多标签-无标注-V1',
    postDataset: '-',
    creator: 'deepexilab',
    createdAt: '2026-04-10 09:24:18',
    status: '草稿',
  },
  {
    id: '9',
    name: '图像分割-道路场景实例分割-标注',
    dataType: '图片',
    annotationType: '图像分割',
    count: 18,
    progress: 28,
    preDataset: '图像分割/道路场景实例分割-无标注-V1',
    postDataset: '-',
    creator: 'lab1',
    createdAt: '2026-04-09 10:08:12',
    status: '草稿',
  },
]

const multiRecords: MultiAnnotationRecord[] = [
  {
    id: 'multi-1',
    name: '标签测试0025',
    annotationType: '图像分类',
    count: 13,
    status: '草稿',
    annotationProgress: 85,
    reviewProgress: 100,
    creator: 'lab1',
    createdAt: '2026-04-20 16:08:55',
    dataset: '图像分类/Phoena-图像分类-单图多标签-有标注-V2',
    outputDataset: '图像分类/Phoena-图像分类-单图多标签-有标注-V3',
    annotators: ['lab1', 'lab2'],
    reviewers: ['admin'],
  },
  {
    id: 'multi-2',
    name: '有有有有有有有有有有有有',
    annotationType: '文本分类',
    count: 10,
    status: '草稿',
    annotationProgress: 100,
    reviewProgress: 90,
    creator: 'lab1',
    createdAt: '2026-04-20 15:33:14',
    dataset: '文本分类/Phoena-文本分类-文本单标签-无标注-V1',
    outputDataset: '-',
    annotators: ['lab1', 'deepexilab'],
    reviewers: ['lab5'],
  },
  {
    id: 'multi-3',
    name: '标注数据集测试001',
    annotationType: '文本分类',
    count: 10,
    status: '草稿',
    annotationProgress: 100,
    reviewProgress: 100,
    creator: 'lab1',
    createdAt: '2026-04-20 13:51:43',
    dataset: '文本分类/Phoena-文本分类-文本多标签-无标注-V1',
    outputDataset: '-',
    annotators: ['lab1'],
    reviewers: ['admin', 'lab5'],
  },
  {
    id: 'multi-4',
    name: '标注测试00000000',
    annotationType: '实体识别',
    count: 10,
    status: '已发布',
    annotationProgress: 100,
    reviewProgress: 100,
    creator: 'lab5',
    createdAt: '2026-04-15 13:45:13',
    dataset: '实体识别/实体识别---123-V1',
    outputDataset: '-',
    annotators: ['lab1', 'lab5'],
    reviewers: ['deepexilab'],
  },
  {
    id: 'multi-5',
    name: '货架商品检测多人标注',
    annotationType: '物体检测',
    count: 48,
    status: '草稿',
    annotationProgress: 46,
    reviewProgress: 18,
    creator: 'admin',
    createdAt: '2026-04-18 10:22:41',
    dataset: '物体检测/货架商品框选-无标注-V1',
    outputDataset: '物体检测/货架商品框选-有标注-V2',
    annotators: ['lab1', 'lab2', 'deepexilab'],
    reviewers: ['admin', 'lab5'],
  },
  {
    id: 'multi-6',
    name: '客服意图分类多人标注',
    annotationType: '文本分类',
    count: 36,
    status: '已发布',
    annotationProgress: 100,
    reviewProgress: 72,
    creator: 'lab2',
    createdAt: '2026-04-16 09:12:36',
    dataset: '文本分类/客服意图单标签-无标注-V1',
    outputDataset: '文本分类/客服意图单标签-有标注-V2',
    annotators: ['lab1', 'lab5'],
    reviewers: ['admin'],
  },
]

const annotationAssignments: AssignmentRecord[] = [
  {
    id: 'a1',
    taskName: '标签测试0025',
    member: 'wangwu',
    annotationType: '图像分类',
    amount: 7,
    completed: 7,
    preDataset: '图像分类/Phoena-图像分类-单图多标签-有标注-V2',
    postDataset: '图像分类/Phoena-图像分类-单图多标签-有标注-V3',
    creator: 'lab1',
    createdAt: '2026-04-20 16:08:55',
    deadline: '2026-04-24 18:00:00',
    status: '已完成',
  },
  {
    id: 'a2',
    taskName: '标签测试0025',
    member: 'lab2',
    annotationType: '图像分类',
    amount: 6,
    completed: 4,
    preDataset: '图像分类/Phoena-图像分类-单图多标签-有标注-V2',
    postDataset: '图像分类/Phoena-图像分类-单图多标签-有标注-V3',
    creator: 'lab1',
    createdAt: '2026-04-20 16:08:55',
    deadline: '2026-04-24 18:00:00',
    status: '进行中',
  },
  {
    id: 'a3',
    taskName: '标注数据集测试001',
    member: 'wangwu',
    annotationType: '文本分类',
    amount: 10,
    completed: 10,
    preDataset: '文本分类/Phoena-文本分类-文本多标签-无标注-V1',
    postDataset: '-',
    creator: 'lab1',
    createdAt: '2026-04-20 13:51:43',
    deadline: '2026-04-22 18:00:00',
    status: '已完成',
  },
  {
    id: 'a4',
    taskName: '货架商品检测多人标注',
    member: 'deepexilab',
    annotationType: '物体检测',
    amount: 16,
    completed: 7,
    preDataset: '物体检测/货架商品框选-无标注-V1',
    postDataset: '物体检测/货架商品框选-有标注-V2',
    creator: 'admin',
    createdAt: '2026-04-18 10:22:41',
    deadline: '2026-04-26 18:00:00',
    status: '进行中',
  },
  {
    id: 'a5',
    taskName: '客服意图分类多人标注',
    member: 'lab5',
    annotationType: '文本分类',
    amount: 18,
    completed: 18,
    preDataset: '文本分类/客服意图单标签-无标注-V1',
    postDataset: '文本分类/客服意图单标签-有标注-V2',
    creator: 'lab2',
    createdAt: '2026-04-16 09:12:36',
    deadline: '2026-04-22 18:00:00',
    status: '已完成',
  },
]

const reviewAssignments: AssignmentRecord[] = [
  {
    id: 'r1',
    taskName: '标签测试0025',
    member: 'wangwu',
    annotationType: '图像分类',
    amount: 13,
    completed: 13,
    preDataset: '图像分类/Phoena-图像分类-单图多标签-有标注-V2',
    postDataset: '图像分类/Phoena-图像分类-单图多标签-有标注-V3',
    creator: 'lab1',
    createdAt: '2026-04-20 16:08:55',
    deadline: '2026-04-25 18:00:00',
    status: '已完成',
  },
  {
    id: 'r2',
    taskName: '有有有有有有有有有有有有',
    member: 'lab5',
    annotationType: '文本分类',
    amount: 10,
    completed: 9,
    preDataset: '文本分类/Phoena-文本分类-文本单标签-无标注-V1',
    postDataset: '-',
    creator: 'lab1',
    createdAt: '2026-04-20 15:33:14',
    deadline: '2026-04-24 18:00:00',
    status: '进行中',
  },
  {
    id: 'r3',
    taskName: '标注数据集测试001',
    member: 'wangwu',
    annotationType: '文本分类',
    amount: 5,
    completed: 5,
    preDataset: '文本分类/Phoena-文本分类-文本多标签-无标注-V1',
    postDataset: '-',
    creator: 'lab1',
    createdAt: '2026-04-20 13:51:43',
    deadline: '2026-04-23 18:00:00',
    status: '已完成',
  },
  {
    id: 'r4',
    taskName: '货架商品检测多人标注',
    member: 'admin',
    annotationType: '物体检测',
    amount: 24,
    completed: 5,
    preDataset: '物体检测/货架商品框选-无标注-V1',
    postDataset: '物体检测/货架商品框选-有标注-V2',
    creator: 'admin',
    createdAt: '2026-04-18 10:22:41',
    deadline: '2026-04-27 18:00:00',
    status: '进行中',
  },
  {
    id: 'r5',
    taskName: '客服意图分类多人标注',
    member: 'admin',
    annotationType: '文本分类',
    amount: 36,
    completed: 26,
    preDataset: '文本分类/客服意图单标签-无标注-V1',
    postDataset: '文本分类/客服意图单标签-有标注-V2',
    creator: 'lab2',
    createdAt: '2026-04-16 09:12:36',
    deadline: '2026-04-23 18:00:00',
    status: '进行中',
  },
]

const workbenchSamples = [
  { id: 'sample-1', title: '样本 001', content: '客户反馈：图片中商品外观完整，主体清晰，可用于单图多标签分类。', label: '商品图', status: '待处理' },
  { id: 'sample-2', title: '样本 002', content: '文本内容：售后问题集中在发货时效和包装破损，需要标记为物流相关。', label: '物流问题', status: '进行中' },
  { id: 'sample-3', title: '样本 003', content: '图片主体存在遮挡，建议审核时重点检查标注边界和标签一致性。', label: '待复核', status: '已完成' },
]

type WorkbenchKind = 'text-classification' | 'entity' | 'image-classification' | 'object-detection' | 'image-segmentation'

type DetectionBox = { id: string; label: string; x: number; y: number; width: number; height: number }

type SegmentationRegion = { id: string; label: string; points: string; color: string }

const datasetOptions = [
  { value: 'image-multi-v2', label: '图像分类/Phoena-图像分类-单图多标签-有标注-V2', dataType: '图片', annotationType: '图像分类', count: 13, output: '图像分类/Phoena-图像分类-单图多标签-有标注-V3' },
  { value: 'image-single-v1', label: '图像分类/Phoena-图像分类-单图单标签-无标注-V1', dataType: '图片', annotationType: '图像分类', count: 21, output: '图像分类/Phoena-图像分类-单图单标签-有标注-V2' },
  { value: 'object-detection-v1', label: '物体检测/货架商品框选-无标注-V1', dataType: '图片', annotationType: '物体检测', count: 48, output: '物体检测/货架商品框选-有标注-V2' },
  { value: 'defect-image-v1', label: '图像分类/设备缺陷多标签-无标注-V1', dataType: '图片', annotationType: '图像分类', count: 52, output: '图像分类/设备缺陷多标签-有标注-V2' },
  { value: 'text-single-v1', label: '文本分类/Phoena-文本分类-文本单标签-无标注-V1', dataType: '文本', annotationType: '文本分类', count: 10, output: '文本分类/Phoena-文本分类-文本单标签-有标注-V2' },
  { value: 'text-multi-v1', label: '文本分类/Phoena-文本分类-文本多标签-无标注-V1', dataType: '文本', annotationType: '文本分类', count: 10, output: '文本分类/Phoena-文本分类-文本多标签-有标注-V2' },
  { value: 'entity-v1', label: '实体识别/实体识别---123-V1', dataType: '文本', annotationType: '实体识别', count: 30, output: '实体识别/实体识别---123-V2' },
  { value: 'intent-v1', label: '文本分类/客服意图单标签-无标注-V1', dataType: '文本', annotationType: '文本分类', count: 36, output: '文本分类/客服意图单标签-有标注-V2' },
]

type MachineAnnotationDatasetOption = (typeof datasetOptions)[number]

const memberOptions = [
  { value: 'lab1', label: 'lab1' },
  { value: 'lab2', label: 'lab2' },
  { value: 'lab5', label: 'lab5' },
  { value: 'admin', label: 'admin' },
  { value: 'deepexilab', label: 'deepexilab' },
]

const defaultDeadline = '2026-04-25 18:00:00'
const dateTimeFormat = 'YYYY-MM-DD HH:mm:ss'

const stepCards = [
  { title: '选择数据', icon: <DatabaseOutlined />, description: '从已有数据集版本创建在线标注任务或多人协同标注任务。' },
  { title: '配置标签', icon: <TagsOutlined />, description: '根据任务类型维护标签集与模型配置，准备进入标注流程。' },
  { title: '执行标注', icon: <DeploymentUnitOutlined />, description: '支持在线标注、多人分配、审核流转等机器学习标注场景。' },
  { title: '提交结果', icon: <CheckCircleOutlined />, description: '保存标注结果并提交，产出可用于训练或复核的数据版本。' },
]

function statusTag(status: MultiAnnotationRecord['status'] | MLAnnotationRecord['status'] | AssignmentRecord['status']) {
  const colorMap: Record<string, string> = {
    草稿: 'default',
    已发布: 'processing',
    已完成: 'success',
    待处理: 'default',
    进行中: 'processing',
  }

  return <Tag color={colorMap[status] ?? 'default'}>{status}</Tag>
}

function progressCell(value: number | null) {
  if (value === null) return '-'
  return <Progress percent={value} size="small" status={value >= 100 ? 'success' : 'active'} />
}

const cardStyle: React.CSSProperties = { borderRadius: 6, border: '1px solid #edf0f5' }
const tableContainerStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
}

const labelOptions = ['食品', '人物', '物体', '动物', '文字', '车辆', '正向', '负向', '中性']
const entityLabels = ['LOC', '企业', '学校', '人名', '产品', '药物']
const detectionLabelOptions = ['商品', '价签', '货架', '人物', '缺陷']
const segmentationLabelOptions = ['道路', '建筑', '车辆', '天空', '植被']

function getAnnotationWorkbenchKind(record: { annotationType: string; name?: string; taskName?: string }): WorkbenchKind {
  if (record.annotationType === '实体识别') return 'entity'
  if (record.annotationType === '图像分类') return 'image-classification'
  if (record.annotationType === '物体检测') return 'object-detection'
  if (record.annotationType === '图像分割') return 'image-segmentation'
  return 'text-classification'
}

function isMultiLabelTask(name: string) {
  return name.includes('多标签') || name.includes('多')
}

function renderMockImage(title: string, height = 280) {
  return (
    <div
      style={{
        position: 'relative',
        height,
        borderRadius: 10,
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #1d4ed8 0%, #38bdf8 42%, #fef3c7 100%)',
        border: '1px solid #dbeafe',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: 18,
        fontWeight: 700,
      }}
    >
      {title}
    </div>
  )
}

const MLAnnotation: React.FC = () => {
  const [form] = Form.useForm()
  const [onlineForm] = Form.useForm()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { message } = AntdApp.useApp()
  const permissionState = usePermissionStore()
  const currentUser = getCurrentUser(permissionState)
  const currentProjectMember = getCurrentProjectMember(permissionState)
  const isCreateRoute = location.pathname === '/machine-annotation/create'
  const onlineRouteMatch = location.pathname.match(/^\/machine-annotation\/online\/([^/]+)$/)
  const annotateRouteMatch = location.pathname.match(/^\/machine-annotation\/annotate\/([^/]+)$/)
  const reviewRouteMatch = location.pathname.match(/^\/machine-annotation\/review\/([^/]+)$/)
  const workbenchMode: 'annotation' | 'review' | null = annotateRouteMatch ? 'annotation' : reviewRouteMatch ? 'review' : null
  const onlineTaskId = onlineRouteMatch?.[1]
  const workbenchId = annotateRouteMatch?.[1] ?? reviewRouteMatch?.[1]
  const canManageMultiAnnotation = currentUser.roleKeys.includes('platform_admin') || currentProjectMember?.roleKey === 'project_admin'
  const [activeTab, setActiveTab] = useState<'online' | 'multi'>(searchParams.get('tab') === 'multi' || isCreateRoute ? 'multi' : 'online')
  const [multiSubTab, setMultiSubTab] = useState<'overview' | 'annotation' | 'review'>(canManageMultiAnnotation ? 'overview' : 'annotation')
  const [onlineCreateOpen, setOnlineCreateOpen] = useState(false)
  const [onlineDatasetType, setOnlineDatasetType] = useState<'文本' | '图片'>('图片')
  const [onlineDatasetPickerOpen, setOnlineDatasetPickerOpen] = useState(false)
  const [onlineSelectedDatasetValue, setOnlineSelectedDatasetValue] = useState<string>()
  const [detailRecord, setDetailRecord] = useState<MLAnnotationRecord | MultiAnnotationRecord | null>(null)
  const [memberRecord, setMemberRecord] = useState<MultiAnnotationRecord | null>(null)
  const [annotatorDrafts, setAnnotatorDrafts] = useState<MemberDraft[]>([])
  const [reviewerDrafts, setReviewerDrafts] = useState<MemberDraft[]>([])
  const [selectedDataset, setSelectedDataset] = useState(datasetOptions[0])
  const onlineDatasetOptions = datasetOptions.filter(item => item.dataType === onlineDatasetType)
  const onlineSelectedDataset = datasetOptions.find(item => item.value === onlineSelectedDatasetValue)
  const [workbenchSampleRows, setWorkbenchSampleRows] = useState(workbenchSamples)
  const [activeSampleId, setActiveSampleId] = useState(workbenchSamples[0].id)
  const [workbenchSubmitted, setWorkbenchSubmitted] = useState(false)
  const [detectionBoxes, setDetectionBoxes] = useState<DetectionBox[]>([
    { id: 'box-1', label: '商品', x: 16, y: 18, width: 38, height: 34 },
    { id: 'box-2', label: '价签', x: 58, y: 54, width: 24, height: 18 },
  ])
  const [segmentationRegions, setSegmentationRegions] = useState<SegmentationRegion[]>([
    { id: 'seg-1', label: '道路', points: '12,68 92,62 98,96 8,98', color: 'rgba(59, 130, 246, 0.42)' },
    { id: 'seg-2', label: '建筑', points: '18,16 56,10 62,48 22,54', color: 'rgba(245, 158, 11, 0.46)' },
  ])
  const currentOnlineTask = onlineTaskId ? onlineRecords.find(item => item.id === onlineTaskId) : undefined
  const visibleAnnotationAssignments = canManageMultiAnnotation
    ? annotationAssignments
    : annotationAssignments.filter(item => item.member === currentUser.account)
  const visibleReviewAssignments = canManageMultiAnnotation
    ? reviewAssignments
    : reviewAssignments.filter(item => item.member === currentUser.account)
  const currentWorkbenchAssignment = workbenchMode === 'annotation'
    ? visibleAnnotationAssignments.find(item => item.id === workbenchId)
    : workbenchMode === 'review'
      ? visibleReviewAssignments.find(item => item.id === workbenchId)
      : undefined
  const activeSample = workbenchSampleRows.find(item => item.id === activeSampleId) ?? workbenchSampleRows[0]
  const multiTabItems = [
    ...(canManageMultiAnnotation ? [{ key: 'overview', label: '任务总览' }] : []),
    { key: 'annotation', label: '标注任务' },
    { key: 'review', label: '审核任务' },
  ]

  useEffect(() => {
    if (!canManageMultiAnnotation && multiSubTab === 'overview') {
      setMultiSubTab('annotation')
    }
  }, [canManageMultiAnnotation, multiSubTab])

  useEffect(() => {
    if (workbenchSampleRows.length && !workbenchSampleRows.some(item => item.id === activeSampleId)) {
      setActiveSampleId(workbenchSampleRows[0].id)
    }
  }, [activeSampleId, workbenchSampleRows])

  useEffect(() => {
    if (workbenchMode || onlineTaskId) {
      setWorkbenchSampleRows(workbenchSamples)
      setActiveSampleId(workbenchSamples[0].id)
      setWorkbenchSubmitted(false)
      setDetectionBoxes([
        { id: 'box-1', label: '商品', x: 16, y: 18, width: 38, height: 34 },
        { id: 'box-2', label: '价签', x: 58, y: 54, width: 24, height: 18 },
      ])
      setSegmentationRegions([
        { id: 'seg-1', label: '道路', points: '12,68 92,62 98,96 8,98', color: 'rgba(59, 130, 246, 0.42)' },
        { id: 'seg-2', label: '建筑', points: '18,16 56,10 62,48 22,54', color: 'rgba(245, 158, 11, 0.46)' },
      ])
    }
  }, [onlineTaskId, workbenchId, workbenchMode])

  const onlineColumns: ColumnsType<MLAnnotationRecord> = [
    { title: '任务名称', dataIndex: 'name', key: 'name', width: 260, ellipsis: true },
    { title: '数据类型', dataIndex: 'dataType', key: 'dataType', width: 96 },
    { title: '标注类型', dataIndex: 'annotationType', key: 'annotationType', width: 120 },
    { title: '数据量', dataIndex: 'count', key: 'count', width: 90 },
    { title: '标注进度', dataIndex: 'progress', key: 'progress', width: 180, render: progressCell },
    { title: '标注前数据集', dataIndex: 'preDataset', key: 'preDataset', width: 280, ellipsis: true },
    { title: '标注后数据集', dataIndex: 'postDataset', key: 'postDataset', width: 280, ellipsis: true },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 100 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 90, render: statusTag },
    {
      title: '操作',
      key: 'action',
      width: 130,
      render: (_, record) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/machine-annotation/online/${record.id}`)}>详情</Button>
          <Button type="link" size="small" icon={<DeleteOutlined />} disabled={record.status === '已完成'} danger>删除</Button>
        </Space>
      ),
    },
  ]

  const multiColumns: ColumnsType<MultiAnnotationRecord> = [
    { title: '标注任务', dataIndex: 'name', key: 'name', width: 240, ellipsis: true },
    { title: '标注类型', dataIndex: 'annotationType', key: 'annotationType', width: 120 },
    { title: '数据量', dataIndex: 'count', key: 'count', width: 90 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 90, render: statusTag },
    { title: '标注进度', dataIndex: 'annotationProgress', key: 'annotationProgress', width: 150, render: progressCell },
    { title: '审核进度', dataIndex: 'reviewProgress', key: 'reviewProgress', width: 150, render: progressCell },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 110 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170 },
    {
      title: '操作',
      key: 'action',
      width: 280,
      render: (_, record) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<SendOutlined />} disabled={record.status !== '草稿'}>发布</Button>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailRecord(record)}>详情</Button>
          <Button type="link" size="small" icon={<TeamOutlined />} onClick={() => setMemberRecord(record)}>任务成员</Button>
          <Button type="link" size="small" icon={<DeleteOutlined />} disabled={record.status === '已发布'} danger>删除</Button>
        </Space>
      ),
    },
  ]

  const annotationAssignmentColumns: ColumnsType<AssignmentRecord> = [
    { title: '任务名称', dataIndex: 'taskName', key: 'taskName', width: 240, ellipsis: true },
    { title: '标注类型', dataIndex: 'annotationType', key: 'annotationType', width: 120 },
    { title: '数据量', dataIndex: 'amount', key: 'amount', width: 90 },
    {
      title: '标注进度',
      key: 'progress',
      width: 180,
      render: (_, record) => progressCell(Math.round((record.completed / record.amount) * 100)),
    },
    { title: '标注前数据集', dataIndex: 'preDataset', key: 'preDataset', width: 280, ellipsis: true },
    { title: '标注后数据集', dataIndex: 'postDataset', key: 'postDataset', width: 280, ellipsis: true },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 110 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170 },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Button type="link" size="small" icon={<FormOutlined />} onClick={() => navigate(`/machine-annotation/annotate/${record.id}`)}>标注</Button>
      ),
    },
  ]

  const reviewAssignmentColumns: ColumnsType<AssignmentRecord> = [
    { title: '标注任务', dataIndex: 'taskName', key: 'taskName', width: 240, ellipsis: true },
    { title: '标注类型', dataIndex: 'annotationType', key: 'annotationType', width: 120 },
    { title: '数据量', dataIndex: 'amount', key: 'amount', width: 90 },
    {
      title: '审核进度',
      key: 'progress',
      width: 180,
      render: (_, record) => progressCell(Math.round((record.completed / record.amount) * 100)),
    },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 110 },
    { title: '截止时间', dataIndex: 'deadline', key: 'deadline', width: 170 },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Button type="link" size="small" icon={<AuditOutlined />} onClick={() => navigate(`/machine-annotation/review/${record.id}`)}>审核</Button>
      ),
    },
  ]

  const memberDraftColumns = (type: 'annotator' | 'reviewer'): ColumnsType<MemberDraft> => [
    {
      title: type === 'annotator' ? '标注成员' : '审核成员',
      dataIndex: 'member',
      key: 'member',
      render: (_, record) => (
        <Select
          value={record.member}
          options={memberOptions}
          style={{ width: '100%' }}
          onChange={value => updateDraft(type, record.id, { member: value })}
        />
      ),
    },
    {
      title: (
        <Space>
          {type === 'annotator' ? '标注数量' : '审核数量'}
          <Button type="link" size="small" onClick={() => averageDrafts(type)}>平均分配</Button>
        </Space>
      ),
      dataIndex: 'amount',
      key: 'amount',
      width: 180,
      render: (_, record) => (
        <InputNumber min={1} max={selectedDataset.count} value={record.amount} style={{ width: '100%' }} onChange={value => updateDraft(type, record.id, { amount: Number(value ?? 1) })} />
      ),
    },
    {
      title: (
        <Space>
          任务截止时间
          <Button type="link" size="small" onClick={() => setUniformDeadline(type)}>统一时间</Button>
        </Space>
      ),
      dataIndex: 'deadline',
      key: 'deadline',
      width: 260,
      render: (_, record) => (
        <DatePicker
          showTime
          value={record.deadline ? dayjs(record.deadline, dateTimeFormat) : null}
          style={{ width: '100%' }}
          placeholder="请选择截止时间"
          onChange={value => updateDraft(type, record.id, { deadline: value ? value.format(dateTimeFormat) : '' })}
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 90,
      render: (_, record) => <Button type="link" size="small" icon={<DeleteOutlined />} danger onClick={() => removeDraft(type, record.id)}>删除</Button>,
    },
  ]

  function updateDraft(type: 'annotator' | 'reviewer', id: string, patch: Partial<MemberDraft>) {
    const updater = (items: MemberDraft[]) => items.map(item => item.id === id ? { ...item, ...patch } : item)
    if (type === 'annotator') setAnnotatorDrafts(updater)
    else setReviewerDrafts(updater)
  }

  function removeDraft(type: 'annotator' | 'reviewer', id: string) {
    if (type === 'annotator') setAnnotatorDrafts(items => items.filter(item => item.id !== id))
    else setReviewerDrafts(items => items.filter(item => item.id !== id))
  }

  function addDraft(type: 'annotator' | 'reviewer') {
    const current = type === 'annotator' ? annotatorDrafts : reviewerDrafts
    const fallbackMember = type === 'annotator' ? 'lab1' : 'admin'
    const nextMember = memberOptions.find(option => !current.some(item => item.member === option.value))?.value ?? fallbackMember
    const next: MemberDraft = {
      id: `${type}-${Date.now()}`,
      member: nextMember,
      amount: selectedDataset.count,
      deadline: '',
    }
    if (type === 'annotator') setAnnotatorDrafts(items => [...items, next])
    else setReviewerDrafts(items => [...items, next])
  }

  function averageDrafts(type: 'annotator' | 'reviewer') {
    const applyAverage = (items: MemberDraft[]) => {
      if (items.length === 0) return items
      const base = Math.floor(selectedDataset.count / items.length)
      const remainder = selectedDataset.count % items.length
      return items.map((item, index) => ({ ...item, amount: base + (index < remainder ? 1 : 0) }))
    }
    if (type === 'annotator') setAnnotatorDrafts(applyAverage)
    else setReviewerDrafts(applyAverage)
  }

  function setUniformDeadline(type: 'annotator' | 'reviewer') {
    const applyDeadline = (items: MemberDraft[]) => items.map(item => ({ ...item, deadline: defaultDeadline }))
    if (type === 'annotator') setAnnotatorDrafts(applyDeadline)
    else setReviewerDrafts(applyDeadline)
  }

  function submitCreatePage() {
    form.validateFields().then(() => {
      message.success('多人标注任务已创建')
      navigate('/machine-annotation?tab=multi')
    })
  }

  function handleDeleteWorkbenchSample() {
    if (!activeSample) {
      return
    }

    if (workbenchSubmitted || currentWorkbenchAssignment?.status === '已完成' || currentOnlineTask?.status === '已完成') {
      Modal.warning({
        title: '已提交数据不允许删除',
        content: '当前标注或审核任务已提交，数据已锁定，不能再删除单条数据。',
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
        setWorkbenchSampleRows(previous => {
          const nextRows = previous.filter(item => item.id !== activeSample.id)
          const nextActive = nextRows.find(item => item.id !== activeSample.id) ?? nextRows[0]
          if (nextActive) {
            setActiveSampleId(nextActive.id)
          }
          return nextRows
        })
        message.success('删除成功')
      },
    })
  }

  function openOnlineCreate() {
    onlineForm.resetFields()
    onlineForm.setFieldsValue({ dataType: onlineDatasetType, sourceType: '已有数据集', outputMode: '新增版本' })
    setOnlineCreateOpen(true)
  }

  function submitOnlineCreate() {
    onlineForm.validateFields().then(() => {
      message.success('在线标注任务已创建')
      setOnlineCreateOpen(false)
      setOnlineSelectedDatasetValue(undefined)
    })
  }

  function renderOnlineDatasetPickerModal() {
    return (
      <Modal
        title="选择数据集"
        open={onlineDatasetPickerOpen}
        onCancel={() => setOnlineDatasetPickerOpen(false)}
        footer={null}
        width={820}
        destroyOnClose
      >
        <Table<MachineAnnotationDatasetOption>
          rowKey="value"
          size="small"
          columns={[
            { title: '数据集名称', dataIndex: 'label', key: 'label', ellipsis: true },
            { title: '数据类型', dataIndex: 'dataType', key: 'dataType', width: 100 },
            { title: '标注类型', dataIndex: 'annotationType', key: 'annotationType', width: 120 },
            { title: '数据量', dataIndex: 'count', key: 'count', width: 100 },
            {
              title: '操作',
              key: 'action',
              width: 96,
              render: (_, record) => (
                <Button
                  type="link"
                  onClick={() => {
                    setOnlineSelectedDatasetValue(record.value)
                    onlineForm.setFieldValue('dataset', record.value)
                    setOnlineDatasetPickerOpen(false)
                  }}
                >
                  选择
                </Button>
              ),
            },
          ]}
          dataSource={onlineDatasetOptions}
          pagination={false}
          scroll={{ x: 760 }}
          locale={{ emptyText: '当前类型下暂无可用数据集' }}
        />
      </Modal>
    )
  }

  function renderStepCards() {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 24 }}>
        {stepCards.map(card => (
          <Card key={card.title} style={{ ...cardStyle, textAlign: 'center', minHeight: 128 }}>
            <div style={{ fontSize: 22, marginBottom: 12, color: '#3b82f6' }}>{card.icon}</div>
            <Title level={5} style={{ margin: 0, marginBottom: 8 }}>{card.title}</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>{card.description}</Text>
          </Card>
        ))}
      </div>
    )
  }

  function renderOnlineWorkbench() {
    if (!currentOnlineTask) {
      return (
        <div style={{ padding: '24px 32px', minHeight: '100%', background: '#f7f8fa' }}>
          <Card style={cardStyle}>
            <Result
              status="404"
              title="未找到标注任务"
              subTitle="当前在线标注任务不存在，或已从列表中删除。"
              extra={<Button type="primary" onClick={() => navigate('/machine-annotation')}>返回数据标注</Button>}
            />
          </Card>
        </div>
      )
    }

    const locked = workbenchSubmitted || currentOnlineTask.status === '已完成'
    return (
      <div style={{ padding: '24px 32px', minHeight: '100%', background: '#f7f8fa' }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card
            style={cardStyle}
            title="在线标注详情"
            extra={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/machine-annotation')}>返回列表</Button>}
          >
            <Descriptions column={4} size="small" bordered>
              <Descriptions.Item label="任务名称" span={2}>{currentOnlineTask.name}</Descriptions.Item>
              <Descriptions.Item label="数据类型">{currentOnlineTask.dataType}</Descriptions.Item>
              <Descriptions.Item label="标注类型">{currentOnlineTask.annotationType}</Descriptions.Item>
              <Descriptions.Item label="数据量">{workbenchSampleRows.length}</Descriptions.Item>
              <Descriptions.Item label="标注进度" span={2}>{progressCell(currentOnlineTask.progress)}</Descriptions.Item>
              <Descriptions.Item label="状态">{statusTag(locked ? '已完成' : currentOnlineTask.status)}</Descriptions.Item>
              <Descriptions.Item label="标注前数据集" span={2}>{currentOnlineTask.preDataset}</Descriptions.Item>
              <Descriptions.Item label="标注后数据集" span={2}>{currentOnlineTask.postDataset}</Descriptions.Item>
              <Descriptions.Item label="创建人">{currentOnlineTask.creator}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{currentOnlineTask.createdAt}</Descriptions.Item>
            </Descriptions>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr) 320px', gap: 16 }}>
            <Card title="数据列表" style={cardStyle}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {workbenchSampleRows.map(sample => (
                  <Button
                    key={sample.id}
                    block
                    type={sample.id === activeSampleId ? 'primary' : 'default'}
                    onClick={() => setActiveSampleId(sample.id)}
                    style={{ height: 'auto', padding: '10px 12px', textAlign: 'left' }}
                  >
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Text strong>{sample.title}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{sample.status}</Text>
                    </Space>
                  </Button>
                ))}
                {!workbenchSampleRows.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />}
              </Space>
            </Card>

            <Card title="当前数据" style={cardStyle}>
              {activeSample ? (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Tag color="blue">{activeSample.label}</Tag>
                  <div style={{ minHeight: 260, padding: 20, borderRadius: 8, border: '1px dashed #cbd5e1', background: '#fbfdff' }}>
                    <Text>{activeSample.content}</Text>
                  </div>
                  <Text type="secondary">未提交前可删除当前单条数据；提交或已完成后数据锁定，不允许继续删除。</Text>
                </Space>
              ) : (
                <Empty description="暂无可标注数据" />
              )}
            </Card>

            <Card title={currentOnlineTask.status === '已完成' ? '标注结果' : '标注操作'} style={cardStyle}>
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Select
                  mode="multiple"
                  value={activeSample ? [activeSample.label] : []}
                  disabled={locked || !activeSample}
                  options={[
                    { value: '商品图', label: '商品图' },
                    { value: '物流问题', label: '物流问题' },
                    { value: '待复核', label: '待复核' },
                    { value: '噪声数据', label: '噪声数据' },
                  ]}
                  style={{ width: '100%' }}
                  placeholder="请选择标签"
                />
                <Input.TextArea rows={6} disabled={locked || !activeSample} placeholder="请输入标注备注" />
                <Space wrap>
                  <Button disabled={!activeSample}>上一条</Button>
                  <Button disabled={locked || !activeSample} onClick={() => message.success('标注结果已保存')}>保存</Button>
                  <Button danger disabled={locked || !activeSample} onClick={handleDeleteWorkbenchSample}>
                    删除当前数据
                  </Button>
                  <Button
                    type="primary"
                    disabled={!activeSample || locked}
                    onClick={() => {
                      setWorkbenchSubmitted(true)
                      message.success('标注任务已提交，数据已锁定')
                    }}
                  >
                    提交标注
                  </Button>
                </Space>
              </Space>
            </Card>
          </div>
        </Space>
      </div>
    )
  }

  function renderWorkbench() {
    const isReview = workbenchMode === 'review'

    if (!currentWorkbenchAssignment) {
      return (
        <div style={{ padding: '24px 32px', minHeight: '100%', background: '#f7f8fa' }}>
          <Card style={cardStyle}>
            <Result
              status="404"
              title="未找到任务"
              subTitle="当前任务不存在，或不在你可处理的标注/审核任务范围内。"
              extra={<Button type="primary" onClick={() => navigate('/machine-annotation?tab=multi')}>返回多人标注</Button>}
            />
          </Card>
        </div>
      )
    }

    return (
      <div style={{ padding: '24px 32px', minHeight: '100%', background: '#f7f8fa' }}>
        <Breadcrumb
          style={{ marginBottom: 12 }}
          items={[
            { title: <Button type="link" size="small" onClick={() => navigate('/machine-annotation?tab=multi')}>数据标注</Button> },
            { title: isReview ? '审核任务' : '标注任务' },
            { title: currentWorkbenchAssignment.taskName },
          ]}
        />
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card
            style={cardStyle}
            title={isReview ? '审核工作台' : '标注工作台'}
            extra={<Button onClick={() => navigate('/machine-annotation?tab=multi')}>返回列表</Button>}
          >
            <Descriptions column={4} size="small" bordered>
              <Descriptions.Item label="任务名称" span={2}>{currentWorkbenchAssignment.taskName}</Descriptions.Item>
              <Descriptions.Item label="标注类型">{currentWorkbenchAssignment.annotationType}</Descriptions.Item>
              <Descriptions.Item label="状态">{statusTag(currentWorkbenchAssignment.status)}</Descriptions.Item>
              <Descriptions.Item label="数据量">{currentWorkbenchAssignment.amount}</Descriptions.Item>
              <Descriptions.Item label={isReview ? '审核进度' : '标注进度'} span={2}>
                {progressCell(Math.round((currentWorkbenchAssignment.completed / currentWorkbenchAssignment.amount) * 100))}
              </Descriptions.Item>
              <Descriptions.Item label="截止时间">{currentWorkbenchAssignment.deadline}</Descriptions.Item>
              <Descriptions.Item label="标注前数据集" span={2}>{currentWorkbenchAssignment.preDataset}</Descriptions.Item>
              <Descriptions.Item label="标注后数据集" span={2}>{currentWorkbenchAssignment.postDataset}</Descriptions.Item>
            </Descriptions>
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr) 300px', gap: 16 }}>
            <Card title="数据列表" style={cardStyle}>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {workbenchSampleRows.map(sample => (
                  <Button
                    key={sample.id}
                    block
                    type={sample.id === activeSampleId ? 'primary' : 'default'}
                    onClick={() => setActiveSampleId(sample.id)}
                    style={{ height: 'auto', padding: '10px 12px', textAlign: 'left' }}
                  >
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Text strong>{sample.title}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{sample.status}</Text>
                    </Space>
                  </Button>
                ))}
              </Space>
            </Card>

            <Card title="待处理数据" style={cardStyle}>
              {activeSample ? (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Tag color="blue">{activeSample.label}</Tag>
                  <div style={{ minHeight: 220, padding: 20, borderRadius: 6, border: '1px dashed #cbd5e1', background: '#fbfdff' }}>
                    <Text>{activeSample.content}</Text>
                  </div>
                  <Text type="secondary">当前为本地 mock 工作台，用于承接列表进入标注/审核的页面流程，后续可替换为真实样本接口。</Text>
                </Space>
              ) : (
                <Empty description="暂无可处理数据" />
              )}
            </Card>

            <Card title={isReview ? '审核结果' : '标注结果'} style={cardStyle}>
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {isReview ? (
                  <>
                    <Radio.Group defaultValue="pass">
                      <Space direction="vertical">
                        <Radio value="pass">审核通过</Radio>
                        <Radio value="reject">驳回重新标注</Radio>
                      </Space>
                    </Radio.Group>
                    <Input.TextArea rows={5} placeholder="请输入审核意见" />
                  </>
                ) : (
                  <>
                    <Select
                      mode="multiple"
                      value={activeSample ? [activeSample.label] : []}
                      options={[
                        { value: '商品图', label: '商品图' },
                        { value: '物流问题', label: '物流问题' },
                        { value: '待复核', label: '待复核' },
                        { value: '噪声数据', label: '噪声数据' },
                      ]}
                      style={{ width: '100%' }}
                      placeholder="请选择标签"
                    />
                    <Input.TextArea rows={5} placeholder="请输入标注备注" />
                  </>
                )}
                <Space wrap>
                  <Button>上一条</Button>
                  <Button onClick={() => message.success(isReview ? '审核结果已保存' : '标注结果已保存')}>保存</Button>
                  <Button danger disabled={!activeSample || workbenchSubmitted || currentWorkbenchAssignment.status === '已完成'} onClick={handleDeleteWorkbenchSample}>
                    删除当前数据
                  </Button>
                  <Button
                    type="primary"
                    disabled={!activeSample || workbenchSubmitted}
                    onClick={() => {
                      setWorkbenchSubmitted(true)
                      message.success(isReview ? '审核任务已提交' : '标注任务已提交')
                    }}
                  >
                    {isReview ? '完成审核' : '完成标注'}
                  </Button>
                </Space>
              </Space>
            </Card>
          </div>
        </Space>
      </div>
    )
  }

  if (workbenchMode) {
    return renderWorkbench()
  }

  if (onlineTaskId) {
    return renderOnlineWorkbench()
  }

  if (isCreateRoute) {
    const annotatorTotal = annotatorDrafts.reduce((sum, item) => sum + item.amount, 0)
    const reviewerTotal = reviewerDrafts.reduce((sum, item) => sum + item.amount, 0)

    if (!canManageMultiAnnotation) {
      return (
        <div style={{ padding: '24px 32px', minHeight: '100%', background: '#f7f8fa' }}>
          <Card style={cardStyle}>
            <Result
              status="403"
              title="无权限创建标注任务"
              subTitle="任务总览和创建标注任务仅项目管理员可用，普通成员请在标注任务或审核任务中处理已领取任务。"
              extra={<Button type="primary" onClick={() => navigate('/machine-annotation?tab=multi')}>返回多人标注</Button>}
            />
          </Card>
        </div>
      )
    }

    return (
      <div style={{ padding: '24px 32px', minHeight: '100%', background: '#f7f8fa' }}>
        <Breadcrumb
          style={{ marginBottom: 12 }}
          items={[
            { title: <Button type="link" size="small" onClick={() => navigate('/machine-annotation?tab=multi')}>数据标注</Button> },
            { title: '创建标注任务' },
          ]}
        />
        <Card style={cardStyle}>
          <Form
            form={form}
            layout="vertical"
            initialValues={{ datasetSource: 'existing', dataset: selectedDataset.value, outputMode: 'newVersion', sampleRatio: 100 }}
          >
            <Title level={4}>基本信息</Title>
            <Form.Item label="任务名称" name="name" rules={[{ required: true, message: '请输入标注任务名称' }]}>
              <Input maxLength={64} showCount placeholder="请输入标注任务名称" />
            </Form.Item>
            <Form.Item label="任务描述" name="description">
              <Input.TextArea maxLength={200} showCount rows={3} placeholder="请输入数据标注任务描述，200字以内" />
            </Form.Item>

            <Title level={4}>数据选择</Title>
            <Form.Item name="datasetSource">
              <Radio.Group value="existing">
                <Radio value="existing">已有数据集</Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item name="dataset" rules={[{ required: true, message: '请选择需要标注的数据集版本' }]}>
              <Select
                placeholder="请选择需要标注的数据集版本"
                options={datasetOptions.map(item => ({ value: item.value, label: item.label }))}
                onChange={value => setSelectedDataset(datasetOptions.find(item => item.value === value) ?? datasetOptions[0])}
              />
            </Form.Item>
            <Text type="secondary">数据量：{selectedDataset.count} 条</Text>

            <Title level={4} style={{ marginTop: 24 }}>处理后数据集</Title>
            <Form.Item name="outputMode">
              <Radio.Group>
                <Radio value="newVersion">新增版本</Radio>
              </Radio.Group>
            </Form.Item>
            <Text type="secondary">数据集名称：{selectedDataset.output}</Text>

            <Title level={4} style={{ marginTop: 24 }}>选择标注成员</Title>
            <div style={tableContainerStyle}>
              <Table
                rowKey="id"
                columns={memberDraftColumns('annotator')}
                dataSource={annotatorDrafts}
                pagination={false}
                scroll={{ x: 760 }}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" /> }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <Text type="secondary">分配标注数量/总计标注数量：{annotatorTotal} 条 / {selectedDataset.count} 条</Text>
              <Button icon={<PlusOutlined />} onClick={() => addDraft('annotator')}>添加标注成员</Button>
            </div>

            <Title level={4} style={{ marginTop: 24 }}>选择审核成员</Title>
            <Form.Item label="抽检比例" name="sampleRatio" extra="请填写人数或输入分配比例，默认100%">
              <InputNumber min={1} max={100} addonAfter="%" style={{ width: 180 }} />
            </Form.Item>
            <div style={tableContainerStyle}>
              <Table
                rowKey="id"
                columns={memberDraftColumns('reviewer')}
                dataSource={reviewerDrafts}
                pagination={false}
                scroll={{ x: 760 }}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" /> }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <Text type="secondary">分配审核数量/总计审核数量：{reviewerTotal} 条 / {selectedDataset.count} 条</Text>
              <Button icon={<PlusOutlined />} onClick={() => addDraft('reviewer')}>添加审核成员</Button>
            </div>

            <Space style={{ marginTop: 28 }}>
              <Button onClick={() => navigate('/machine-annotation?tab=multi')}>取消</Button>
              <Button type="primary" onClick={submitCreatePage}>确定</Button>
            </Space>
          </Form>
        </Card>
      </div>
    )
  }

  return (
    <>
      <div style={{ padding: '24px 32px', minHeight: '100%', background: '#f7f8fa' }}>
        <Card style={cardStyle}>
          <Title level={2}>机器学习标注</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>支持在线标注与多人协同标注。</Text>

          <Tabs
            activeKey={activeTab}
            onChange={key => setActiveTab(key as 'online' | 'multi')}
            items={[
              { key: 'online', label: '在线标注' },
              { key: 'multi', label: '多人标注' },
            ]}
          />

          {renderStepCards()}

          {activeTab === 'online' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginBottom: 16 }}>
                <Button icon={<ReloadOutlined />}>刷新</Button>
                <Button type="primary" icon={<PlusOutlined />} onClick={openOnlineCreate}>创建标注任务</Button>
              </div>
              <div style={tableContainerStyle}>
                <Table
                  rowKey="id"
                  columns={onlineColumns}
                  dataSource={onlineRecords}
                  pagination={{ pageSize: 10, total: 68, showTotal: total => `共 ${total} 条记录` }}
                  scroll={{ x: 1650 }}
                />
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Tabs
                  activeKey={multiSubTab}
                  onChange={key => setMultiSubTab(key as 'overview' | 'annotation' | 'review')}
                  items={multiTabItems}
                  style={{ flex: 1 }}
                />
                <Space>
                  <Button icon={<ReloadOutlined />}>刷新</Button>
                  {canManageMultiAnnotation && multiSubTab === 'overview' && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/machine-annotation/create')}>创建标注任务</Button>
                  )}
                </Space>
              </div>
              {multiSubTab === 'overview' && (
                <div style={tableContainerStyle}>
                  <Table
                    rowKey="id"
                    columns={multiColumns}
                    dataSource={multiRecords}
                    pagination={{ pageSize: 10, showTotal: total => `共 ${total} 条记录` }}
                    scroll={{ x: 1320 }}
                  />
                </div>
              )}
              {multiSubTab === 'annotation' && (
                <div style={tableContainerStyle}>
                  <Table
                    rowKey="id"
                    columns={annotationAssignmentColumns}
                    dataSource={visibleAnnotationAssignments}
                    pagination={{ pageSize: 10, showTotal: total => `共 ${total} 条记录` }}
                    scroll={{ x: 1500 }}
                  />
                </div>
              )}
              {multiSubTab === 'review' && (
                <div style={tableContainerStyle}>
                  <Table
                    rowKey="id"
                    columns={reviewAssignmentColumns}
                    dataSource={visibleReviewAssignments}
                    pagination={{ pageSize: 10, showTotal: total => `共 ${total} 条记录` }}
                    scroll={{ x: 1040 }}
                  />
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <Modal
        title="创建在线标注任务"
        open={onlineCreateOpen}
        onCancel={() => setOnlineCreateOpen(false)}
        width={680}
        destroyOnClose
        footer={
          <Space>
            <Button onClick={() => setOnlineCreateOpen(false)}>取消</Button>
            <Button type="primary" onClick={submitOnlineCreate}>创建</Button>
          </Space>
        }
      >
        <Form
          form={onlineForm}
          layout="vertical"
          initialValues={{ dataType: onlineDatasetType, sourceType: '已有数据集', outputMode: '新增版本' }}
        >
          <Form.Item label="任务名称" name="name" rules={[{ required: true, message: '请输入任务名称' }]}>
            <Input placeholder="请输入任务名称" />
          </Form.Item>

          <Form.Item label="数据类型" name="dataType" rules={[{ required: true, message: '请选择数据类型' }]}>
            <Radio.Group
              onChange={event => {
                const nextType = event.target.value as '文本' | '图片'
                setOnlineDatasetType(nextType)
                setOnlineSelectedDatasetValue(undefined)
                onlineForm.setFieldsValue({ dataType: nextType, dataset: undefined })
              }}
            >
              <Radio.Button value="文本">文本</Radio.Button>
              <Radio.Button value="图片">图片</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item label="数据选择" name="sourceType">
            <Radio.Group>
              <Radio value="已有数据集">已有数据集</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item label="选择数据集" name="dataset" rules={[{ required: true, message: '请选择数据集' }]}>
            <Input.Group compact>
              <Input
                readOnly
                placeholder="请选择需要标注的数据集"
                value={onlineSelectedDataset?.label}
                style={{ width: 'calc(100% - 88px)' }}
              />
              <Button
                type="primary"
                disabled={!onlineDatasetOptions.length}
                onClick={() => setOnlineDatasetPickerOpen(true)}
                style={{ width: 88 }}
              >
                选择
              </Button>
            </Input.Group>
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, marginTop: -6, marginBottom: 16 }}>
            <div>
              <Text type="secondary">数据量：</Text>
              <Text>{onlineSelectedDataset?.count ?? 0} 条</Text>
            </div>
            <div>
              <Text type="secondary">标注类型：</Text>
              <Text>{onlineSelectedDataset?.annotationType ?? '-'}</Text>
            </div>
          </div>

          <Form.Item label="处理后数据集" name="outputMode">
            <Radio.Group>
              <Radio value="新增版本">新增版本</Radio>
            </Radio.Group>
          </Form.Item>

          <Text type="secondary">数据集名称：{onlineSelectedDataset?.output ?? '-'}</Text>
        </Form>
      </Modal>

      {renderOnlineDatasetPickerModal()}

      <Modal
        title="标注任务详情"
        open={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
        footer={<Button onClick={() => setDetailRecord(null)}>关闭</Button>}
        width={760}
      >
        {detailRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="任务名称" span={2}>{detailRecord.name}</Descriptions.Item>
            <Descriptions.Item label="数据量">{detailRecord.count}</Descriptions.Item>
            <Descriptions.Item label="状态">{statusTag(detailRecord.status)}</Descriptions.Item>
            <Descriptions.Item label="标注类型">{detailRecord.annotationType}</Descriptions.Item>
            {'dataset' in detailRecord ? (
              <>
                <Descriptions.Item label="标注进度">{progressCell(detailRecord.annotationProgress)}</Descriptions.Item>
                <Descriptions.Item label="审核进度">{progressCell(detailRecord.reviewProgress)}</Descriptions.Item>
                <Descriptions.Item label="标注前数据集" span={2}>{detailRecord.dataset}</Descriptions.Item>
                <Descriptions.Item label="标注后数据集" span={2}>{detailRecord.outputDataset}</Descriptions.Item>
              </>
            ) : (
              <>
                <Descriptions.Item label="标注进度">{progressCell(detailRecord.progress)}</Descriptions.Item>
                <Descriptions.Item label="标注前数据集" span={2}>{detailRecord.preDataset}</Descriptions.Item>
                <Descriptions.Item label="标注后数据集" span={2}>{detailRecord.postDataset}</Descriptions.Item>
              </>
            )}
            <Descriptions.Item label="创建人">{detailRecord.creator}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{detailRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      <Modal
        title="任务成员"
        open={Boolean(memberRecord)}
        onCancel={() => setMemberRecord(null)}
        footer={<Button onClick={() => setMemberRecord(null)}>关闭</Button>}
      >
        {memberRecord && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="标注成员">{memberRecord.annotators.join('、')}</Descriptions.Item>
              <Descriptions.Item label="审核成员">{memberRecord.reviewers.join('、')}</Descriptions.Item>
            </Descriptions>
          </Space>
        )}
      </Modal>
    </>
  )
}

export default MLAnnotation
