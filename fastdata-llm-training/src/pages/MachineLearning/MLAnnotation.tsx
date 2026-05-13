import React, { useEffect, useState } from 'react'
import {
  App as AntdApp,
  Breadcrumb,
  Button,
  Card,
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
  BorderOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DeploymentUnitOutlined,
  DragOutlined,
  EditOutlined,
  FormOutlined,
  FullscreenOutlined,
  EyeOutlined,
  LeftOutlined,
  MinusOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  SendOutlined,
  SettingOutlined,
  StopOutlined,
  TagsOutlined,
  TeamOutlined,
  ZoomInOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { getCurrentProjectMember, getCurrentUser, usePermissionStore } from '../../services/permissionStore'
import TaskMetadataEditor from '../../components/TaskMetadataEditor'

const { Title, Text } = Typography

type MLAnnotationRecord = {
  id: string
  name: string
  description?: string
  dataType: '文本' | '图片'
  annotationType: string
  count: number
  progress: number | null
  preDataset: string
  postDataset: string
  creator: string
  createdAt: string
  status: '未发布' | '已完成'
}

type MultiAnnotationRecord = {
  id: string
  name: string
  description?: string
  annotationType: string
  count: number
  status: '未发布' | '已完成'
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

type WorkbenchSample = {
  id: string
  title: string
  content: string
  label: string
  status: '待处理' | '进行中' | '已完成'
}

type ReviewResult = {
  decision: 'pass' | 'reject'
  reason: string
  saved: boolean
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
    status: '未发布',
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
    status: '未发布',
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
    status: '未发布',
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
    status: '未发布',
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
    status: '未发布',
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
    status: '未发布',
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
    status: '未发布',
  },
]

const multiRecords: MultiAnnotationRecord[] = [
  {
    id: 'multi-1',
    name: '标签测试0025',
    annotationType: '图像分类',
    count: 13,
    status: '未发布',
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
    status: '未发布',
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
    status: '未发布',
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
    status: '已完成',
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
    status: '未发布',
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
    status: '已完成',
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

const workbenchSamples: WorkbenchSample[] = [
  { id: 'sample-1', title: '样本 001', content: '客户反馈：图片中商品外观完整，主体清晰，可用于单图多标签分类。', label: '商品图', status: '待处理' },
  { id: 'sample-2', title: '样本 002', content: '文本内容：售后问题集中在发货时效和包装破损，需要标记为物流相关。', label: '物流问题', status: '进行中' },
  { id: 'sample-3', title: '样本 003', content: '图片主体存在遮挡，建议审核时重点检查标注边界和标签一致性。', label: '待复核', status: '已完成' },
]

type WorkbenchKind = 'text-classification' | 'entity' | 'image-classification' | 'object-detection' | 'image-segmentation'

type DetectionBox = { id: string; label: string; x: number; y: number; width: number; height: number }

type SegmentationRegion = { id: string; label: string; points: string; color: string }

type LabelItem = { name: string; color: string; classId?: string }

type EntityMark = { id: string; text: string; label: string; range: string; color: string }

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
    未发布: 'default',
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

const palette = ['#bf6a2a', '#2dd4a3', '#d63ae0', '#84cc16', '#2f7fd8', '#e2435f', '#1fc547']
const textClassificationLabels: LabelItem[] = [
  { name: '科技', color: '#bf6a2a' },
  { name: '财经', color: '#2dd4a3' },
  { name: '体育', color: '#d63ae0' },
  { name: '健康', color: '#84cc16' },
  { name: '娱乐', color: '#2f7fd8' },
  { name: '环保', color: '#e2435f' },
]
const entityLabelItems: LabelItem[] = [
  { name: 'LOC', color: '#bf6a2a' },
  { name: '企业', color: '#2dd4a3' },
  { name: '学校', color: '#d63ae0' },
  { name: '人名', color: '#84cc16' },
  { name: '产品', color: '#2f7fd8' },
  { name: '药物', color: '#e2435f' },
  { name: '业务', color: '#1fc547' },
]
const imageClassificationLabels: LabelItem[] = [
  { name: 'Build_Your_Dream', color: '#bf6a2a' },
  { name: 'Lamborghini', color: '#2dd4a3' },
  { name: 'Audi', color: '#d63ae0' },
  { name: 'Bmw', color: '#84cc16' },
  { name: 'M_Power', color: '#2f7fd8' },
  { name: 'RS', color: '#e2435f' },
  { name: 'SUV', color: '#64748b' },
]
const detectionLabelItems: LabelItem[] = [
  { name: '食品', color: '#2dd4a3', classId: 'class_id=1' },
  { name: '人物', color: '#d63ae0', classId: 'class_id=2' },
  { name: '物体', color: '#84cc16', classId: 'class_id=3' },
  { name: '动物', color: '#e2435f', classId: 'class_id=4' },
  { name: '文字', color: '#6d28d9', classId: 'class_id=5' },
]
const segmentationLabelItems: LabelItem[] = [
  { name: 'road_sign', color: '#84cc16', classId: 'class_id=3' },
  { name: 'background', color: '#2f7fd8', classId: 'class_id=4' },
]

function getAnnotationWorkbenchKind(record: { annotationType: string; name?: string; taskName?: string }): WorkbenchKind {
  if (record.annotationType === '实体识别') return 'entity'
  if (record.annotationType === '图像分类') return 'image-classification'
  if (record.annotationType === '物体检测') return 'object-detection'
  if (record.annotationType === '图像分割') return 'image-segmentation'
  return 'text-classification'
}

function getDefaultWorkbenchLabels(kind: WorkbenchKind): LabelItem[] {
  if (kind === 'entity') return entityLabelItems
  if (kind === 'image-classification') return imageClassificationLabels
  if (kind === 'object-detection') return detectionLabelItems
  if (kind === 'image-segmentation') return segmentationLabelItems
  return textClassificationLabels
}

function isMultiLabelTask(name: string) {
  return name.includes('多标签') || name.includes('多')
}

function buildWorkbenchSamples(kind: WorkbenchKind, total: number, progress = 0, seed = '标注任务'): WorkbenchSample[] {
  const safeTotal = Math.max(1, total)
  const completedCount = Math.min(safeTotal, Math.floor((safeTotal * Math.max(0, progress)) / 100))
  const contentByKind: Record<WorkbenchKind, string[]> = {
    'text-classification': [
      '苹果公司发布了新款 iPhone，搭载更强大的芯片，相关供应链股价应声上涨。',
      '受强降雨影响，城市部分道路出现拥堵，交通部门已启动应急疏导。',
      '本周末将进行足球联赛半决赛，主队核心球员已恢复合练。',
    ],
    entity: [
      '四川省江油市华丰中学选用豆奶和复合营养素后，试验组男生的贫血率下降13个百分点。',
      '杭州某科技公司发布新一代智能终端，产品将首先在华东区域试点。',
      '张三在北京大学附属医院完成药物临床随访，治疗方案保持稳定。',
    ],
    'image-classification': [
      '车辆正面清晰，包含品牌标识和车身颜色，可用于单图分类。',
      '设备表面存在轻微划痕和污渍，可用于缺陷多标签分类。',
      '商品包装完整且主体居中，适合图像分类训练。',
    ],
    'object-detection': [
      '货架商品与价格标签需要分别框选，要求边界贴合主体。',
      '画面中存在人物和手持物体，需要区分不同目标类别。',
      '动物主体位于画面中央，需框选头部和躯干整体。',
    ],
    'image-segmentation': [
      '道路场景需要区分 road_sign 与 background，并保留实例边界。',
      '建筑与路面交界较清晰，适合多边形区域标注。',
      '天空、道路和标识牌需要分别形成分割区域。',
    ],
  }
  const labelByKind: Record<WorkbenchKind, string[]> = {
    'text-classification': ['科技', '财经', '体育'],
    entity: ['LOC', '企业', '人名'],
    'image-classification': ['Build_Your_Dream', 'SUV', 'Audi'],
    'object-detection': ['食品', '人物', '动物'],
    'image-segmentation': ['road_sign', 'background', 'road_sign'],
  }

  return Array.from({ length: safeTotal }, (_, index) => {
    const status: WorkbenchSample['status'] = index < completedCount ? '已完成' : index === completedCount ? '进行中' : '待处理'
    const contents = contentByKind[kind]
    const labels = labelByKind[kind]
    return {
      id: `${kind}-${seed}-${index + 1}`,
      title: `样本 ${String(index + 1).padStart(3, '0')}`,
      content: contents[index % contents.length],
      label: labels[index % labels.length],
      status,
    }
  })
}

const defaultEntityMarks: EntityMark[] = [
  { id: 'entity-1', text: '四川', label: 'LOC', range: '[0, 2]', color: '#bf6a2a' },
  { id: 'entity-2', text: '江油市华丰中', label: '企业', range: '[3, 9]', color: '#2dd4a3' },
  { id: 'entity-3', text: '奶和复合营养素', label: 'LOC', range: '[13, 20]', color: '#bf6a2a' },
]

function renderTagGroup(labels: string[]) {
  return (
    <Space wrap size={[6, 6]}>
      {labels.map(label => <Tag key={label} color="blue">{label}</Tag>)}
    </Space>
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
  const [onlineRows, setOnlineRows] = useState<MLAnnotationRecord[]>(onlineRecords)
  const [multiRows, setMultiRows] = useState<MultiAnnotationRecord[]>(multiRecords)
  const [onlineDatasetType, setOnlineDatasetType] = useState<'文本' | '图片'>('图片')
  const [onlineDatasetPickerOpen, setOnlineDatasetPickerOpen] = useState(false)
  const [onlineSelectedDatasetValue, setOnlineSelectedDatasetValue] = useState<string>()
  const [detailRecord, setDetailRecord] = useState<MLAnnotationRecord | MultiAnnotationRecord | null>(null)
  const [memberRecord, setMemberRecord] = useState<MultiAnnotationRecord | null>(null)
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [annotatorDrafts, setAnnotatorDrafts] = useState<MemberDraft[]>([])
  const [reviewerDrafts, setReviewerDrafts] = useState<MemberDraft[]>([])
  const [selectedDataset, setSelectedDataset] = useState(datasetOptions[0])
  const onlineDatasetOptions = datasetOptions.filter(item => item.dataType === onlineDatasetType)
  const onlineSelectedDataset = datasetOptions.find(item => item.value === onlineSelectedDatasetValue)
  const [workbenchSampleRows, setWorkbenchSampleRows] = useState(workbenchSamples)
  const [activeSampleId, setActiveSampleId] = useState(workbenchSamples[0].id)
  const [sampleLabelResults, setSampleLabelResults] = useState<Record<string, string[]>>({})
  const [reviewResults, setReviewResults] = useState<Record<string, ReviewResult>>({})
  const [workbenchSubmitted, setWorkbenchSubmitted] = useState(false)
  const [detectionBoxes, setDetectionBoxes] = useState<DetectionBox[]>([
    { id: 'box-1', label: '商品', x: 16, y: 18, width: 38, height: 34 },
    { id: 'box-2', label: '价签', x: 58, y: 54, width: 24, height: 18 },
  ])
  const [activeDetectionBoxId, setActiveDetectionBoxId] = useState('box-1')
  const [segmentationRegions, setSegmentationRegions] = useState<SegmentationRegion[]>([
    { id: 'seg-1', label: '道路', points: '12,68 92,62 98,96 8,98', color: 'rgba(59, 130, 246, 0.42)' },
    { id: 'seg-2', label: '建筑', points: '18,16 56,10 62,48 22,54', color: 'rgba(245, 158, 11, 0.46)' },
  ])
  const [activeSegmentationRegionId, setActiveSegmentationRegionId] = useState('seg-1')
  const [entityMarks, setEntityMarks] = useState<EntityMark[]>(defaultEntityMarks)
  const [activeEntityId, setActiveEntityId] = useState(defaultEntityMarks[2].id)
  const [customLabels, setCustomLabels] = useState<Partial<Record<WorkbenchKind, LabelItem[]>>>({})
  const [selectedLabelName, setSelectedLabelName] = useState<string>('科技')
  const [labelSearchValue, setLabelSearchValue] = useState('')
  const [labelModalOpen, setLabelModalOpen] = useState(false)
  const [editingLabel, setEditingLabel] = useState<LabelItem | null>(null)
  const [labelDraftName, setLabelDraftName] = useState('')
  const currentOnlineTask = onlineTaskId ? onlineRows.find(item => item.id === onlineTaskId) : undefined
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
  const activeSampleIndex = Math.max(0, workbenchSampleRows.findIndex(item => item.id === activeSample?.id))
  const activeReviewResult = activeSample ? reviewResults[activeSample.id] ?? { decision: 'pass', reason: '', saved: false } : { decision: 'pass', reason: '', saved: false }
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
      const targetTask = currentOnlineTask ?? currentWorkbenchAssignment
      const kind = targetTask ? getAnnotationWorkbenchKind(targetTask) : 'text-classification'
      const targetStatus = targetTask?.status
      const progress = targetStatus === '已完成'
        ? 100
        : currentWorkbenchAssignment
          ? Math.round((currentWorkbenchAssignment.completed / Math.max(1, currentWorkbenchAssignment.amount)) * 100)
          : 0
      const total = currentOnlineTask?.count ?? currentWorkbenchAssignment?.amount ?? workbenchSamples.length
      const nextSamples = buildWorkbenchSamples(kind, total, progress ?? 0, targetTask ? ('name' in targetTask ? targetTask.name : targetTask.taskName) : '标注任务')
      setWorkbenchSampleRows(nextSamples)
      setActiveSampleId(nextSamples.find(sample => sample.status !== '已完成')?.id ?? nextSamples[0]?.id ?? '')
      setSampleLabelResults(Object.fromEntries(nextSamples
        .filter(sample => sample.status === '已完成')
        .map(sample => [sample.id, sample.label ? [sample.label] : []])))
      setReviewResults(Object.fromEntries(nextSamples
        .filter(sample => sample.status === '已完成')
        .map(sample => [sample.id, { decision: 'pass', reason: '', saved: true } satisfies ReviewResult])))
      setWorkbenchSubmitted(false)
      setDetectionBoxes([
        { id: 'box-1', label: '商品', x: 16, y: 18, width: 38, height: 34 },
        { id: 'box-2', label: '价签', x: 58, y: 54, width: 24, height: 18 },
      ])
      setActiveDetectionBoxId('box-1')
      setSegmentationRegions([
        { id: 'seg-1', label: '道路', points: '12,68 92,62 98,96 8,98', color: 'rgba(59, 130, 246, 0.42)' },
        { id: 'seg-2', label: '建筑', points: '18,16 56,10 62,48 22,54', color: 'rgba(245, 158, 11, 0.46)' },
      ])
      setActiveSegmentationRegionId('seg-1')
      setEntityMarks(defaultEntityMarks)
      setActiveEntityId(defaultEntityMarks[2].id)
      setSelectedLabelName(getDefaultWorkbenchLabels(kind)[0]?.name ?? '')
    }
  }, [currentOnlineTask, currentWorkbenchAssignment, onlineTaskId, workbenchId, workbenchMode])

  const onlineColumns: ColumnsType<MLAnnotationRecord> = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
      width: 260,
      render: (_value, record) => (
        <TaskMetadataEditor
          value={record.name}
          required
          maxLength={80}
          strong
          placeholder="请输入任务名称"
          onSave={name => setOnlineRows(previous => previous.map(item => (item.id === record.id ? { ...item, name } : item)))}
        />
      ),
    },
    {
      title: '任务描述',
      dataIndex: 'description',
      key: 'description',
      width: 220,
      render: (value, record) => (
        <TaskMetadataEditor
          value={value}
          emptyText="暂无描述"
          placeholder="请输入任务描述"
          type="secondary"
          onSave={description => setOnlineRows(previous => previous.map(item => (item.id === record.id ? { ...item, description } : item)))}
        />
      ),
    },
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
    {
      title: '标注任务',
      dataIndex: 'name',
      key: 'name',
      width: 240,
      render: (_value, record) => (
        <TaskMetadataEditor
          value={record.name}
          required
          maxLength={80}
          strong
          placeholder="请输入标注任务名称"
          onSave={name => setMultiRows(previous => previous.map(item => (item.id === record.id ? { ...item, name } : item)))}
        />
      ),
    },
    {
      title: '任务描述',
      dataIndex: 'description',
      key: 'description',
      width: 220,
      render: (value, record) => (
        <TaskMetadataEditor
          value={value}
          emptyText="暂无描述"
          placeholder="请输入任务描述"
          type="secondary"
          onSave={description => setMultiRows(previous => previous.map(item => (item.id === record.id ? { ...item, description } : item)))}
        />
      ),
    },
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
          <Button type="link" size="small" icon={<SendOutlined />} disabled={record.status !== '未发布'}>发布</Button>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetailRecord(record)}>详情</Button>
          <Button type="link" size="small" icon={<TeamOutlined />} onClick={() => setMemberRecord(record)}>任务成员</Button>
          <Button type="link" size="small" icon={<DeleteOutlined />} disabled={record.status === '已完成'} danger>删除</Button>
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
        const deletingId = activeSample.id
        setWorkbenchSampleRows(previous => {
          const nextRows = previous.filter(item => item.id !== deletingId)
          const nextActive = nextRows[Math.min(activeSampleIndex, Math.max(0, nextRows.length - 1))]
          if (nextActive) {
            setActiveSampleId(nextActive.id)
          }
          return nextRows
        })
        setSampleLabelResults(previous => {
          const next = { ...previous }
          delete next[deletingId]
          return next
        })
        setReviewResults(previous => {
          const next = { ...previous }
          delete next[deletingId]
          return next
        })
        message.success('删除成功')
      },
    })
  }

  function markActiveSampleInProgress() {
    if (!activeSample) return
    setWorkbenchSampleRows(previous => previous.map(sample => (
      sample.id === activeSample.id && sample.status === '待处理' ? { ...sample, status: '进行中' } : sample
    )))
  }

  function getCurrentWorkbenchKind() {
    return currentOnlineTask
      ? getAnnotationWorkbenchKind(currentOnlineTask)
      : currentWorkbenchAssignment
        ? getAnnotationWorkbenchKind(currentWorkbenchAssignment)
        : 'text-classification'
  }

  function getActiveSampleLabels(fallback?: string, includeFallback = false) {
    const values = activeSample ? sampleLabelResults[activeSample.id] : undefined
    return values?.length || !includeFallback ? (values ?? []) : [fallback ?? activeSample?.label ?? selectedLabelName].filter(Boolean)
  }

  function updateActiveSampleLabels(nextValue: string | string[]) {
    if (!activeSample) return
    const nextLabels = (Array.isArray(nextValue) ? nextValue : [nextValue]).filter(Boolean)
    setSampleLabelResults(previous => ({ ...previous, [activeSample.id]: nextLabels }))
    setSelectedLabelName(nextLabels[0] ?? '')
    markActiveSampleInProgress()
  }

  function saveCurrentAnnotation() {
    if (!activeSample) return
    const kind = getCurrentWorkbenchKind()
    if (kind === 'entity') {
      const labels = entityMarks.map(entity => entity.label).filter(Boolean)
      if (!labels.length) {
        message.warning('请先完成实体标注')
        return
      }
      setSampleLabelResults(previous => ({ ...previous, [activeSample.id]: Array.from(new Set(labels)) }))
    } else if (kind === 'object-detection') {
      const labels = detectionBoxes.map(box => box.label).filter(Boolean)
      if (!labels.length) {
        message.warning('请先新增或选择检测框')
        return
      }
      setSampleLabelResults(previous => ({ ...previous, [activeSample.id]: Array.from(new Set(labels)) }))
    } else if (kind === 'image-segmentation') {
      const labels = segmentationRegions.map(region => region.label).filter(Boolean)
      if (!labels.length) {
        message.warning('请先新增或选择分割区域')
        return
      }
      setSampleLabelResults(previous => ({ ...previous, [activeSample.id]: Array.from(new Set(labels)) }))
    } else if (!(sampleLabelResults[activeSample.id] ?? []).length) {
      message.warning('请先选择标注结果')
      return
    }
    markActiveSampleInProgress()
    message.success('标注结果已保存')
  }

  function updateActiveDetectionLabel(label: string) {
    setSelectedLabelName(label)
    setDetectionBoxes(previous => previous.map(box => (
      box.id === activeDetectionBoxId ? { ...box, label } : box
    )))
    updateActiveSampleLabels(label)
  }

  function updateActiveSegmentationLabel(label: string) {
    setSelectedLabelName(label)
    setSegmentationRegions(previous => previous.map(region => (
      region.id === activeSegmentationRegionId ? { ...region, label } : region
    )))
    updateActiveSampleLabels(label)
  }

  function updateActiveEntityLabel(label: LabelItem) {
    setSelectedLabelName(label.name)
    setEntityMarks(previous => previous.map(entity => (
      entity.id === activeEntityId ? { ...entity, label: label.name, color: label.color } : entity
    )))
    updateActiveSampleLabels(label.name)
  }

  function deleteActiveEntity() {
    if (!activeEntityId) return
    setEntityMarks(previous => {
      const next = previous.filter(entity => entity.id !== activeEntityId)
      setActiveEntityId(next[0]?.id ?? '')
      return next
    })
    markActiveSampleInProgress()
    message.success('已删除当前选中实体')
  }

  function updateReviewResult(patch: Partial<ReviewResult>) {
    if (!activeSample) return
    setReviewResults(previous => ({
      ...previous,
      [activeSample.id]: {
        decision: previous[activeSample.id]?.decision ?? 'pass',
        reason: previous[activeSample.id]?.reason ?? '',
        saved: false,
        ...patch,
      },
    }))
    setWorkbenchSampleRows(previous => previous.map(sample => (
      sample.id === activeSample.id && sample.status === '待处理' ? { ...sample, status: '进行中' } : sample
    )))
  }

  function saveCurrentReview() {
    if (!activeSample) return
    const result = reviewResults[activeSample.id] ?? activeReviewResult
    if (result.decision === 'reject' && !result.reason.trim()) {
      message.warning('审核不通过时请填写原因')
      return
    }
    setReviewResults(previous => ({
      ...previous,
      [activeSample.id]: { ...result, saved: true },
    }))
    message.success('审核结果已保存')
  }

  function completeCurrentReview() {
    if (!activeSample) return
    const result = reviewResults[activeSample.id] ?? activeReviewResult
    if (result.decision === 'reject' && !result.reason.trim()) {
      message.warning('审核不通过时请填写原因')
      return
    }
    const currentId = activeSample.id
    const currentIndex = workbenchSampleRows.findIndex(sample => sample.id === currentId)
    setReviewResults(previous => ({
      ...previous,
      [currentId]: { ...result, saved: true },
    }))
    setWorkbenchSampleRows(previous => previous.map(sample => (
      sample.id === currentId ? { ...sample, status: '已完成' } : sample
    )))
    const nextSample = workbenchSampleRows.slice(currentIndex + 1).find(sample => sample.status !== '已完成')
      ?? workbenchSampleRows.find(sample => sample.id !== currentId && sample.status !== '已完成')
      ?? workbenchSampleRows[currentIndex + 1]
      ?? workbenchSampleRows.find(sample => sample.id !== currentId)
    if (nextSample) {
      setActiveSampleId(nextSample.id)
    }
    message.success('完成审核')
  }

  function selectWorkbenchLabel(kind: WorkbenchKind, label: LabelItem) {
    setSelectedLabelName(label.name)
    if (kind === 'object-detection' && activeDetectionBoxId) {
      updateActiveDetectionLabel(label.name)
      return
    }
    if (kind === 'image-segmentation' && activeSegmentationRegionId) {
      updateActiveSegmentationLabel(label.name)
      return
    }
    if (kind === 'entity' && activeEntityId) {
      updateActiveEntityLabel(label)
      return
    }
    updateActiveSampleLabels(label.name)
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

  function getDefaultLabels(kind: WorkbenchKind): LabelItem[] {
    return getDefaultWorkbenchLabels(kind)
  }

  function getCurrentLabels(kind: WorkbenchKind) {
    return customLabels[kind] ?? getDefaultLabels(kind)
  }

  function openLabelEditor(label?: LabelItem) {
    setEditingLabel(label ?? null)
    setLabelDraftName(label?.name ?? '')
    setLabelModalOpen(true)
  }

  function saveLabel(kind: WorkbenchKind) {
    const name = labelDraftName.trim()
    if (!name) {
      message.warning('请输入标签名称')
      return
    }
    setCustomLabels(previous => {
      const labels = previous[kind] ?? getDefaultLabels(kind)
      const nextLabels = editingLabel
        ? labels.map(label => label.name === editingLabel.name ? { ...label, name } : label)
        : [...labels, { name, color: palette[labels.length % palette.length], classId: kind === 'object-detection' || kind === 'image-segmentation' ? `class_id=${labels.length + 1}` : undefined }]
      return { ...previous, [kind]: nextLabels }
    })
    setSelectedLabelName(name)
    setLabelModalOpen(false)
  }

  function deleteLabel(kind: WorkbenchKind, labelName: string) {
    Modal.confirm({
      title: '确认删除标签？',
      content: `删除标签“${labelName}”后，当前工作台不再展示该标签。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        setCustomLabels(previous => {
          const labels = previous[kind] ?? getDefaultLabels(kind)
          const nextLabels = labels.filter(label => label.name !== labelName)
          return { ...previous, [kind]: nextLabels }
        })
        if (selectedLabelName === labelName) {
          setSelectedLabelName(getCurrentLabels(kind).find(label => label.name !== labelName)?.name ?? '')
        }
      },
    })
  }

  function renderLabelRail(kind: WorkbenchKind, locked: boolean) {
    const labels = getCurrentLabels(kind)
    const visibleLabels = labels.filter(label => label.name.toLowerCase().includes(labelSearchValue.toLowerCase()))
    return (
      <aside style={{ width: 240, borderRight: '1px solid #e5e7eb', background: '#fff', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 14px 16px 14px' }}>
          <Title level={4} style={{ margin: 0 }}>标签栏</Title>
          <Button type="primary" shape="round" icon={<PlusOutlined />} disabled={locked} onClick={() => openLabelEditor()} style={{ width: 44, height: 44 }} />
        </div>
        <div style={{ padding: '0 14px 12px 14px' }}>
          <Input value={labelSearchValue} onChange={event => setLabelSearchValue(event.target.value)} placeholder="搜索标签" style={{ height: 42, borderRadius: 8 }} />
        </div>
        <div style={{ padding: '0 14px 14px 14px', overflowY: 'auto', flex: 1 }}>
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            {visibleLabels.map(label => (
              <div
                key={label.name}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (!locked) {
                    selectWorkbenchLabel(kind, label)
                  }
                }}
                style={{
                  minHeight: 52,
                  borderRadius: 10,
                  border: `1px solid ${selectedLabelName === label.name ? '#60a5fa' : '#e5e7eb'}`,
                  padding: '12px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: selectedLabelName === label.name ? '#eff6ff' : '#fff',
                  cursor: locked ? 'not-allowed' : 'pointer',
                  opacity: locked ? 0.65 : 1,
                }}
              >
                <Space>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: label.color, display: 'inline-block' }} />
                  <Text ellipsis style={{ maxWidth: 112 }}>{label.name}</Text>
                </Space>
                <Space size={8}>
                  <Button type="text" size="small" icon={<EditOutlined />} disabled={locked} onClick={event => { event.stopPropagation(); openLabelEditor(label) }} />
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} disabled={locked} onClick={event => { event.stopPropagation(); deleteLabel(kind, label.name) }} />
                </Space>
              </div>
            ))}
            {!visibleLabels.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无标签" />}
          </Space>
        </div>
      </aside>
    )
  }

  function completeCurrentSample(feedback: string) {
    if (!activeSample) return
    const kind = getCurrentWorkbenchKind()
    const labelsByKind =
      kind === 'entity'
        ? entityMarks.map(entity => entity.label).filter(Boolean)
        : kind === 'object-detection'
          ? detectionBoxes.map(box => box.label).filter(Boolean)
          : kind === 'image-segmentation'
            ? segmentationRegions.map(region => region.label).filter(Boolean)
            : (sampleLabelResults[activeSample.id] ?? [])
    const nextLabels = Array.from(new Set(labelsByKind))
    if (!nextLabels.length) {
      message.warning('请先完成当前数据的标注结果')
      return
    }
    const currentId = activeSample.id
    const currentIndex = workbenchSampleRows.findIndex(sample => sample.id === currentId)
    setSampleLabelResults(previous => ({ ...previous, [currentId]: nextLabels }))
    setWorkbenchSampleRows(previous => previous.map(sample => (
      sample.id === currentId ? { ...sample, status: '已完成' } : sample
    )))
    const nextSample = workbenchSampleRows.slice(currentIndex + 1).find(sample => sample.status !== '已完成')
      ?? workbenchSampleRows.find(sample => sample.id !== currentId && sample.status !== '已完成')
      ?? workbenchSampleRows[currentIndex + 1]
      ?? workbenchSampleRows.find(sample => sample.id !== currentId)
    if (nextSample) {
      setActiveSampleId(nextSample.id)
    }
    message.success(feedback)
  }

  function goToSample(offset: number) {
    const currentIndex = workbenchSampleRows.findIndex(sample => sample.id === activeSampleId)
    const nextSample = workbenchSampleRows[currentIndex + offset]
    if (nextSample) {
      setActiveSampleId(nextSample.id)
    }
  }

  function submitAllAnnotations(locked: boolean) {
    if (locked) return
    const unfinished = workbenchSampleRows.some(sample => sample.status !== '已完成')
    if (unfinished) {
      message.warning('请先完成当前任务中的全部数据标注')
      return
    }
    setWorkbenchSubmitted(true)
    if (currentOnlineTask) {
      setOnlineRows(previous => previous.map(item => (
        item.id === currentOnlineTask.id ? { ...item, progress: 100, status: '已完成' } : item
      )))
    }
    message.success('提交标注成功，当前任务已锁定')
  }

  function addDetectionBox() {
    const index = detectionBoxes.length + 1
    const next: DetectionBox = {
      id: `box-${Date.now()}`,
      label: selectedLabelName || '物体',
      x: 12 + (index % 4) * 12,
      y: 16 + (index % 3) * 10,
      width: 24,
      height: 20,
    }
    setDetectionBoxes(previous => [...previous, next])
    setActiveDetectionBoxId(next.id)
    updateActiveSampleLabels(next.label)
    message.success('已新增矩形框')
  }

  function deleteActiveDetectionBox() {
    if (!activeDetectionBoxId) return
    const nextBoxes = detectionBoxes.filter(box => box.id !== activeDetectionBoxId)
    setDetectionBoxes(nextBoxes)
    setActiveDetectionBoxId(nextBoxes[0]?.id ?? '')
    if (nextBoxes[0]) {
      updateActiveSampleLabels(nextBoxes[0].label)
    } else if (activeSample) {
      setSampleLabelResults(previous => ({ ...previous, [activeSample.id]: [] }))
    }
    message.success('已删除当前矩形框')
  }

  function addSegmentationRegion() {
    const next: SegmentationRegion = {
      id: `seg-${Date.now()}`,
      label: selectedLabelName || 'background',
      points: '22,58 42,50 62,56 70,82 30,86',
      color: 'rgba(132, 204, 22, 0.38)',
    }
    setSegmentationRegions(previous => [...previous, next])
    setActiveSegmentationRegionId(next.id)
    updateActiveSampleLabels(next.label)
    message.success('已新增分割区域')
  }

  function deleteActiveSegmentationRegion() {
    if (!activeSegmentationRegionId) return
    const nextRegions = segmentationRegions.filter(region => region.id !== activeSegmentationRegionId)
    setSegmentationRegions(nextRegions)
    setActiveSegmentationRegionId(nextRegions[0]?.id ?? '')
    if (nextRegions[0]) {
      updateActiveSampleLabels(nextRegions[0].label)
    } else if (activeSample) {
      setSampleLabelResults(previous => ({ ...previous, [activeSample.id]: [] }))
    }
    message.success('已删除当前分割区域')
  }

  function renderSampleListPanel() {
    return (
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        {workbenchSampleRows.map(sample => {
          const active = sample.id === activeSampleId
          return (
            <button
              key={sample.id}
              type="button"
              onClick={() => setActiveSampleId(sample.id)}
              style={{
                width: '100%',
                border: `1px solid ${active ? '#2563eb' : '#e5e7eb'}`,
                borderRadius: 10,
                padding: '12px 14px',
                textAlign: 'left',
                cursor: 'pointer',
                background: active ? 'linear-gradient(135deg, #2563eb 0%, #60a5fa 100%)' : '#fff',
                boxShadow: active ? '0 12px 24px rgba(37, 99, 235, 0.2)' : 'none',
              }}
            >
              <div style={{ fontWeight: 700, color: active ? '#fff' : '#0f172a', fontSize: 15 }}>{sample.title}</div>
              <div style={{ color: active ? 'rgba(255,255,255,0.8)' : '#64748b', fontSize: 12, marginTop: 4 }}>{sample.status}</div>
            </button>
          )
        })}
        {!workbenchSampleRows.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />}
      </Space>
    )
  }

  function renderTopActions(locked: boolean) {
    const kind = currentOnlineTask ? getAnnotationWorkbenchKind(currentOnlineTask) : currentWorkbenchAssignment ? getAnnotationWorkbenchKind(currentWorkbenchAssignment) : 'text-classification'
    const labels = getCurrentLabels(kind)
    return (
      <Space size={12}>
        <Button type="primary" size="large" icon={<SettingOutlined />} disabled={locked} onClick={() => setConfigModalOpen(true)}>标注配置</Button>
        <Button
          size="large"
          icon={<FormOutlined />}
          disabled={locked || !activeSample}
          onClick={() => {
            const suggestedLabel = labels[0]?.name ?? ''
            if (suggestedLabel) {
              updateActiveSampleLabels(suggestedLabel)
            }
            message.success('AI 自动标注已生成建议结果')
          }}
        >
          AI自动标注
        </Button>
        <Button type="primary" size="large" icon={<FormOutlined />} disabled={locked || !activeSample} onClick={() => completeCurrentSample('完成标注')}>完成标注</Button>
      </Space>
    )
  }

  function renderBottomPagination(locked: boolean) {
    const total = workbenchSampleRows.length
    const currentIndex = Math.max(0, workbenchSampleRows.findIndex(sample => sample.id === activeSampleId))
    const pageNumbers = Array.from({ length: Math.min(total, 5) }, (_, index) => index + 1)
    const selectPage = (page: number) => {
      const target = workbenchSampleRows[page - 1]
      if (target) {
        setActiveSampleId(target.id)
      }
    }
    return (
      <div style={{ height: 64, borderTop: '1px solid #e5e7eb', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px 0 18px' }}>
        <Space size={18}>
          <Text style={{ fontSize: 16 }}>显示第 {total ? currentIndex + 1 : 0}-{total ? currentIndex + 1 : 0} 条，共 {total} 条</Text>
          <Button type="text" icon={<LeftOutlined />} disabled={currentIndex <= 0} onClick={() => goToSample(-1)} />
          {pageNumbers.map(page => (
            <Button key={page} type={page === currentIndex + 1 ? 'primary' : 'text'} ghost={page === currentIndex + 1} onClick={() => selectPage(page)} style={{ minWidth: 36 }}>{page}</Button>
          ))}
          {total > 5 && <Text type="secondary">...</Text>}
          {total > 5 && <Button type={total === currentIndex + 1 ? 'primary' : 'text'} ghost={total === currentIndex + 1} onClick={() => selectPage(total)}>{total}</Button>}
          <Button type="text" icon={<RightOutlined />} disabled={currentIndex >= total - 1} onClick={() => goToSample(1)} />
        </Space>
        <Button type="primary" size="large" disabled={locked || !workbenchSampleRows.length || workbenchSampleRows.some(sample => sample.status !== '已完成')} onClick={() => submitAllAnnotations(locked)}>
          提交标注
        </Button>
      </div>
    )
  }

  function renderAnnotationFrame(kind: WorkbenchKind, locked: boolean, content: React.ReactNode) {
    const labels = getCurrentLabels(kind)
    const finished = workbenchSampleRows.filter(sample => sample.status === '已完成').length
    return (
      <div style={{ height: '100vh', minHeight: 680, background: '#fff', overflow: 'hidden', display: 'grid', gridTemplateRows: '64px minmax(0, 1fr) 64px' }}>
        <div style={{ borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
          <Button type="text" size="large" icon={<ArrowLeftOutlined />} onClick={() => navigate('/machine-annotation')}>返回</Button>
          <Space size={24}>
            <Text type="secondary">当前进度：{finished}/{workbenchSampleRows.length}</Text>
            {renderTopActions(locked)}
          </Space>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '240px minmax(0, 1fr)', minHeight: 0 }}>
          {renderLabelRail(kind, locked)}
          {content}
        </div>
        {renderBottomPagination(locked)}
        <Modal
          title={editingLabel ? '编辑标签' : '新增标签'}
          open={labelModalOpen}
          onOk={() => saveLabel(kind)}
          onCancel={() => setLabelModalOpen(false)}
          okText="确定"
          cancelText="取消"
          destroyOnClose
        >
          <Input value={labelDraftName} onChange={event => setLabelDraftName(event.target.value)} placeholder="请输入标签名称" />
        </Modal>
        <Modal
          title="标注配置"
          open={configModalOpen}
          onCancel={() => setConfigModalOpen(false)}
          onOk={() => {
            setConfigModalOpen(false)
            message.success('标注配置已保存')
          }}
          okText="保存"
          cancelText="取消"
        >
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="标注类型">{currentOnlineTask?.annotationType ?? currentWorkbenchAssignment?.annotationType ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="标签数量">{labels.length}</Descriptions.Item>
            <Descriptions.Item label="当前标签">{selectedLabelName || '-'}</Descriptions.Item>
            <Descriptions.Item label="交互方式">一页一条数据，完成后自动跳转下一条；未提交前可删除当前数据。</Descriptions.Item>
          </Descriptions>
        </Modal>
      </div>
    )
  }

  function renderImageToolbar(mode: 'rect' | 'polygon') {
    return (
      <div style={{ height: 44, border: '1px solid #e5e7eb', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 14, padding: '0 12px', background: '#fff' }}>
        <Button type="text" icon={<TagsOutlined />} />
        <Button type="text" icon={<MinusOutlined />} />
        <Button type="text" icon={<DeploymentUnitOutlined />} />
        <Button type={mode === 'rect' ? 'primary' : 'text'} ghost={mode === 'rect'} icon={<BorderOutlined />} />
        <Button type={mode === 'polygon' ? 'primary' : 'text'} ghost={mode === 'polygon'} icon={<EditOutlined />} />
        <Button type="text" icon={<StopOutlined />} />
        <span style={{ height: 24, borderLeft: '1px solid #e5e7eb' }} />
        <Button type="text" icon={<LeftOutlined />} />
        <Button type="text" icon={<RightOutlined />} />
        <Button type="text" icon={<DeleteOutlined />} />
        <span style={{ height: 24, borderLeft: '1px solid #e5e7eb' }} />
        <Button type="text" icon={<MinusOutlined />} />
        <Text>100%</Text>
        <Button type="text" icon={<ZoomInOutlined />} />
        <Button type="text" icon={<DragOutlined />}>拖拽平移，滚轮缩放</Button>
        <Button type="text" icon={<FullscreenOutlined />} />
      </div>
    )
  }

  function renderTextClassificationWorkbench(record: MLAnnotationRecord | AssignmentRecord, locked: boolean) {
    const recordName = 'name' in record ? record.name : record.taskName
    const multi = isMultiLabelTask(recordName)
    const labels = getCurrentLabels('text-classification')
    const resultValues = getActiveSampleLabels(labels[0]?.name)
    const content = (
      <main style={{ padding: 14, overflow: 'auto' }}>
        <div style={{ borderRadius: 8, background: '#f3f4f6', minHeight: 40, display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr) 360px', alignItems: 'center', padding: '0 28px', fontSize: 16 }}>
          <span>序号</span>
          <span>文本</span>
          <span>标注结果</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr) 360px', minHeight: 300, padding: '6px 28px 0', borderBottom: '1px solid #e5e7eb' }}>
          <div><Tag color="blue" style={{ borderRadius: '50%', width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>{activeSampleIndex + 1}</Tag></div>
          <div style={{ padding: '34px 26px', textAlign: 'center', color: '#1f2937', fontSize: 15, lineHeight: '28px' }}>
            {activeSample?.content || '苹果公司发布了新款iPhone，搭载了更强大的A17芯片，股价应声上涨'}
          </div>
          <div style={{ padding: '22px 0' }}>
            <Select
              mode={multi ? 'multiple' : undefined}
              value={multi ? resultValues : resultValues[0]}
              disabled={locked}
              placeholder="请选择标注结果"
              options={labels.map(label => ({ label: label.name, value: label.name }))}
              style={{ width: '100%' }}
              onChange={updateActiveSampleLabels}
            />
            <div style={{ marginTop: 10 }}>{renderTagGroup(resultValues)}</div>
            <Button size="small" style={{ marginTop: 12 }} disabled={locked || !activeSample} onClick={saveCurrentAnnotation}>
              保存当前标注
            </Button>
          </div>
        </div>
      </main>
    )
    return renderAnnotationFrame('text-classification', locked, content)
  }

  function renderEntityWorkbench(locked: boolean) {
    const labels = getCurrentLabels('entity')
    const activeEntity = entityMarks.find(entity => entity.id === activeEntityId) ?? entityMarks[0]
    const content = (
      <main style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 14, padding: 14, overflow: 'auto' }}>
        <section style={{ borderRadius: 10, background: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,0.08)', padding: 24 }}>
          <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <Title level={4} style={{ margin: 0 }}>文本实体识别</Title>
              <Text type="secondary">先选中文本，再点击右侧标签完成标注</Text>
            </div>
            <Button danger size="large" icon={<DeleteOutlined />} disabled={locked || !activeEntity} onClick={deleteActiveEntity}>删除实体</Button>
          </Space>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, background: '#fbfdff', padding: 26, minHeight: 120, fontSize: 17, lineHeight: '42px' }}>
            <Text>{activeSample?.content ?? '四川省江油市华丰中学选用豆奶和复合营养素后，试验组男生的贫血率下降13个百分点。'}</Text>
            <div style={{ marginTop: 22 }}>
              <Space wrap size={[10, 10]}>
                {entityMarks.map(entity => (
                  <button
                    key={entity.id}
                    type="button"
                    disabled={locked}
                    onClick={() => setActiveEntityId(entity.id)}
                    style={{
                      border: `1px solid ${activeEntityId === entity.id ? '#2563eb' : '#d9e2ef'}`,
                      borderRadius: 999,
                      background: activeEntityId === entity.id ? '#eff6ff' : '#fff',
                      padding: '6px 10px',
                      cursor: locked ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <span style={{ borderBottom: `2px solid ${entity.color}`, marginRight: 6 }}>{entity.text}</span>
                    <Tag color={entity.color} style={{ marginInlineEnd: 0 }}>{entity.label}</Tag>
                  </button>
                ))}
              </Space>
            </div>
          </div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, marginTop: 18, padding: 18, minHeight: 120 }}>
            <Title level={5}>当前选择</Title>
            <Text>文本：{activeEntity?.text ?? '-'}</Text><br />
            <Text>标签：{activeEntity?.label ?? '-'}</Text><br />
            <Text>范围：{activeEntity?.range ?? '-'}</Text>
          </div>
        </section>
        <aside style={{ borderRadius: 10, background: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,0.08)', padding: 22 }}>
          <Title level={4}>可用标签</Title>
          <Space wrap size={[8, 8]} style={{ marginBottom: 24 }}>
            {labels.map(label => <Button key={label.name} shape="round" disabled={locked || !activeEntity} onClick={() => updateActiveEntityLabel(label)}><span style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', background: label.color, marginRight: 6 }} />{label.name}</Button>)}
          </Space>
          <Title level={4}>已标注实体</Title>
          <Space direction="vertical" style={{ width: '100%' }}>
            {entityMarks.map(entity => (
              <div
                key={`${entity.text}-${entity.range}`}
                role="button"
                tabIndex={0}
                onClick={() => setActiveEntityId(entity.id)}
                style={{
                  border: `1px solid ${activeEntityId === entity.id ? '#60a5fa' : '#e5e7eb'}`,
                  borderRadius: 10,
                  padding: 14,
                  background: activeEntityId === entity.id ? '#eff6ff' : '#fff',
                  cursor: 'pointer',
                }}
              >
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <div><Text strong>{entity.text}</Text><br /><Text type="secondary">{entity.range}</Text></div>
                  <Tag color={entity.color}>{entity.label}</Tag>
                </Space>
              </div>
            ))}
          </Space>
        </aside>
      </main>
    )
    return renderAnnotationFrame('entity', locked, content)
  }

  function renderImageClassificationWorkbench(record: MLAnnotationRecord | AssignmentRecord, locked: boolean) {
    const recordName = 'name' in record ? record.name : record.taskName
    const multi = isMultiLabelTask(recordName)
    const labels = getCurrentLabels('image-classification')
    const resultValues = getActiveSampleLabels(labels[0]?.name)
    const content = (
      <main style={{ padding: 14, overflow: 'auto' }}>
        <div style={{ borderRadius: 8, background: '#f3f4f6', minHeight: 40, display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr) 360px', alignItems: 'center', padding: '0 28px', fontSize: 16 }}>
          <span>序号</span>
          <span>图像</span>
          <span>标注结果</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr) 360px', minHeight: 500, padding: '6px 28px 18px', borderBottom: '1px solid #e5e7eb' }}>
          <div><Tag color="blue" style={{ borderRadius: '50%', width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>{activeSampleIndex + 1}</Tag></div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ width: '72%', minWidth: 420, height: 360, border: '1px solid #dbe2ea', borderRadius: 8, overflow: 'hidden', background: '#eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <div style={{ width: 360, height: 150, borderRadius: '50% 46% 18% 18%', background: 'linear-gradient(135deg, #111827 0%, #475569 46%, #94a3b8 100%)', position: 'relative', boxShadow: '0 28px 55px rgba(15,23,42,0.28)' }}>
                <span style={{ position: 'absolute', left: 62, top: 96, width: 58, height: 58, borderRadius: '50%', background: '#0f172a', border: '8px solid #cbd5e1' }} />
                <span style={{ position: 'absolute', right: 58, top: 96, width: 58, height: 58, borderRadius: '50%', background: '#0f172a', border: '8px solid #cbd5e1' }} />
                <span style={{ position: 'absolute', left: 124, top: 20, width: 118, height: 54, borderRadius: '52px 52px 10px 10px', background: 'rgba(219,234,254,0.86)' }} />
              </div>
              <Text type="secondary" style={{ position: 'absolute', bottom: 18 }}>{activeSample?.content}</Text>
            </div>
          </div>
          <div style={{ padding: '22px 0' }}>
            <Select
              mode={multi ? 'multiple' : undefined}
              value={multi ? resultValues : resultValues[0]}
              disabled={locked}
              placeholder="请选择标注结果"
              options={labels.map(label => ({ label: label.name, value: label.name }))}
              style={{ width: '100%' }}
              onChange={updateActiveSampleLabels}
            />
            <div style={{ marginTop: 10 }}>{renderTagGroup(resultValues)}</div>
            <Button size="small" style={{ marginTop: 12 }} disabled={locked || !activeSample} onClick={saveCurrentAnnotation}>
              保存当前标注
            </Button>
          </div>
        </div>
      </main>
    )
    return renderAnnotationFrame('image-classification', locked, content)
  }

  function renderObjectDetectionWorkbench(locked: boolean) {
    const labels = getCurrentLabels('object-detection')
    const activeBox = detectionBoxes.find(box => box.id === activeDetectionBoxId) ?? detectionBoxes[0]
    const content = (
      <main style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 14, padding: 14, overflow: 'auto' }}>
        <section style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
          {renderImageToolbar('rect')}
          <div style={{ position: 'relative', minHeight: 420, marginTop: 12, borderRadius: 10, background: '#eaf2fb', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
            <div style={{ width: '72%', height: 360, background: 'linear-gradient(135deg, #cbd5e1 0%, #b45309 45%, #78350f 70%, #fda4af 100%)', position: 'relative' }}>
              {detectionBoxes.map(box => (
                <div
                  key={box.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setActiveDetectionBoxId(box.id)
                    updateActiveSampleLabels(box.label)
                  }}
                  style={{
                    position: 'absolute',
                    left: `${box.x}%`,
                    top: `${box.y}%`,
                    width: `${box.width}%`,
                    height: `${box.height}%`,
                    border: `2px solid ${activeDetectionBoxId === box.id ? '#2563eb' : '#e23b63'}`,
                    background: activeDetectionBoxId === box.id ? 'rgba(37, 99, 235, 0.18)' : 'rgba(225, 29, 72, 0.16)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ position: 'absolute', width: 10, height: 10, borderRadius: '50%', background: '#fff', border: '1px solid #94a3b8', left: -6, top: -6 }} />
                </div>
              ))}
            </div>
          </div>
        </section>
        <aside>
          <Card title="区域信息" style={{ ...cardStyle, marginBottom: 14 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Select value={activeBox?.label ?? selectedLabelName ?? '动物'} disabled={locked || !activeBox} options={labels.map(label => ({ value: label.name, label: label.name }))} onChange={updateActiveDetectionLabel} style={{ width: '100%' }} />
              <Space>
                <Button type="primary" disabled={locked} onClick={addDetectionBox}>新增框</Button>
                <Button danger disabled={locked || !activeDetectionBoxId} onClick={deleteActiveDetectionBox}>删除框</Button>
              </Space>
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12 }}>
                <Text type="secondary">区域 ID: {activeBox?.id ?? '-'}</Text><br />
                <Text type="secondary">矩形: x={activeBox?.x ?? '-'}, y={activeBox?.y ?? '-'}, w={activeBox?.width ?? '-'}, h={activeBox?.height ?? '-'}</Text><br />
                <Text type="secondary">类别: {activeBox?.label ?? '-'}</Text>
              </div>
            </Space>
          </Card>
          <Card title="标签图例" style={cardStyle}>
            <Space direction="vertical" style={{ width: '100%' }}>
              {labels.map(label => (
                <div key={label.name} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space><span style={{ width: 10, height: 10, borderRadius: '50%', background: label.color }} />{label.name}</Space>
                  <Tag color="blue">{label.classId}</Tag>
                </div>
              ))}
            </Space>
          </Card>
        </aside>
      </main>
    )
    return renderAnnotationFrame('object-detection', locked, content)
  }

  function renderImageSegmentationWorkbench(locked: boolean) {
    const labels = getCurrentLabels('image-segmentation')
    const activeRegion = segmentationRegions.find(region => region.id === activeSegmentationRegionId) ?? segmentationRegions[0]
    const content = (
      <main style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 14, padding: 14, overflow: 'auto' }}>
        <section style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14 }}>
          {renderImageToolbar('polygon')}
          <div style={{ position: 'relative', minHeight: 420, marginTop: 12, borderRadius: 10, background: '#eaf2fb', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
            <div style={{ width: '78%', height: 360, background: 'linear-gradient(180deg, #cbd5e1 0%, #94a3b8 26%, #64748b 52%, #334155 100%)', position: 'relative' }}>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                <polygon points="0,48 16,42 32,36 52,32 70,36 100,48 100,100 0,100" fill="rgba(47, 127, 216, 0.28)" stroke="#2f7fd8" strokeWidth="0.8" />
                <polyline points="0,48 16,42 32,36 52,32 70,36 100,48" fill="none" stroke="#2f7fd8" strokeWidth="1.2" />
                {segmentationRegions.map(region => (
                  <polygon
                    key={region.id}
                    points={region.points}
                    fill={region.color}
                    stroke={activeSegmentationRegionId === region.id ? '#2563eb' : '#d63ae0'}
                    strokeWidth={activeSegmentationRegionId === region.id ? '1.2' : '0.8'}
                    onClick={() => {
                      setActiveSegmentationRegionId(region.id)
                      updateActiveSampleLabels(region.label)
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                ))}
              </svg>
            </div>
          </div>
        </section>
        <aside>
          <Card title="区域信息" style={{ ...cardStyle, marginBottom: 14 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Select value={activeRegion?.label ?? selectedLabelName ?? 'background'} disabled={locked || !activeRegion} options={labels.map(label => ({ value: label.name, label: label.name }))} onChange={updateActiveSegmentationLabel} style={{ width: '100%' }} />
              <Space>
                <Button type="primary" disabled={locked} onClick={addSegmentationRegion}>新增区域</Button>
                <Button danger disabled={locked || !activeSegmentationRegionId} onClick={deleteActiveSegmentationRegion}>删除区域</Button>
              </Space>
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12 }}>
                <Text type="secondary">区域 ID: {activeRegion?.id ?? '-'}</Text><br />
                <Text type="secondary">点数量: {activeRegion?.points.split(' ').length ?? 0}</Text><br />
                <Text type="secondary">类别: {activeRegion?.label ?? '-'}</Text>
              </div>
            </Space>
          </Card>
          <Card title="标签图例" style={cardStyle}>
            <Space direction="vertical" style={{ width: '100%' }}>
              {labels.map(label => (
                <div key={label.name} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space><span style={{ width: 10, height: 10, borderRadius: '50%', background: label.color }} />{label.name}</Space>
                  <Tag color="blue">{label.classId}</Tag>
                </div>
              ))}
            </Space>
          </Card>
        </aside>
      </main>
    )
    return renderAnnotationFrame('image-segmentation', locked, content)
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
    const workbenchKind = getAnnotationWorkbenchKind(currentOnlineTask)
    const workbench = workbenchKind === 'text-classification'
      ? renderTextClassificationWorkbench(currentOnlineTask, locked)
      : workbenchKind === 'entity'
        ? renderEntityWorkbench(locked)
        : workbenchKind === 'image-classification'
          ? renderImageClassificationWorkbench(currentOnlineTask, locked)
          : workbenchKind === 'object-detection'
            ? renderObjectDetectionWorkbench(locked)
            : renderImageSegmentationWorkbench(locked)
    return (
      <div style={{ padding: 0, minHeight: '100%', background: '#f7f8fa' }}>
        {workbench}
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

    if (!isReview) {
      const locked = workbenchSubmitted || currentWorkbenchAssignment.status === '已完成'
      const workbenchKind = getAnnotationWorkbenchKind(currentWorkbenchAssignment)
      return workbenchKind === 'text-classification'
        ? renderTextClassificationWorkbench(currentWorkbenchAssignment, locked)
        : workbenchKind === 'entity'
          ? renderEntityWorkbench(locked)
          : workbenchKind === 'image-classification'
            ? renderImageClassificationWorkbench(currentWorkbenchAssignment, locked)
            : workbenchKind === 'object-detection'
              ? renderObjectDetectionWorkbench(locked)
              : renderImageSegmentationWorkbench(locked)
    }

    const locked = workbenchSubmitted || currentWorkbenchAssignment.status === '已完成'

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
                    <Radio.Group
                      value={activeReviewResult.decision}
                      disabled={locked || !activeSample}
                      onChange={event => updateReviewResult({ decision: event.target.value })}
                    >
                      <Space direction="vertical">
                        <Radio value="pass">审核通过</Radio>
                        <Radio value="reject">驳回重新标注</Radio>
                      </Space>
                    </Radio.Group>
                    <Input.TextArea
                      rows={5}
                      value={activeReviewResult.reason}
                      disabled={locked || !activeSample}
                      placeholder={activeReviewResult.decision === 'reject' ? '审核不通过时必须填写原因' : '请输入审核意见'}
                      onChange={event => updateReviewResult({ reason: event.target.value })}
                    />
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
                  <Button disabled={activeSampleIndex <= 0} onClick={() => goToSample(-1)}>上一条</Button>
                  <Button disabled={locked || !activeSample} onClick={saveCurrentReview}>保存</Button>
                  <Button danger disabled={!activeSample || workbenchSubmitted || currentWorkbenchAssignment.status === '已完成'} onClick={handleDeleteWorkbenchSample}>
                    删除当前数据
                  </Button>
                  <Button
                    type="primary"
                    disabled={!activeSample || locked}
                    onClick={completeCurrentReview}
                  >
                    完成审核
                  </Button>
                  <Button
                    disabled={locked || !workbenchSampleRows.length || workbenchSampleRows.some(sample => sample.status !== '已完成')}
                    onClick={() => {
                      setWorkbenchSubmitted(true)
                      message.success('审核任务已提交，数据已锁定')
                    }}
                  >
                    提交审核
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
                  dataSource={onlineRows}
                  pagination={{ pageSize: 10, total: 68, showTotal: total => `共 ${total} 条记录` }}
                  scroll={{ x: 1870 }}
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
                    dataSource={multiRows}
                    pagination={{ pageSize: 10, showTotal: total => `共 ${total} 条记录` }}
                    scroll={{ x: 1540 }}
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
