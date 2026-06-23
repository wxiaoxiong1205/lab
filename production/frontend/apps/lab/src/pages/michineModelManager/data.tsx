import {
  FileImageOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import type { OptionItem } from './types'
import {
  ANNOTATION_TYPE_IMAGE,
  ANNOTATION_TYPE_TEXT,
  TEMPLATE_TYPE_IMAGE_CLASSIFICATION,
  TEMPLATE_TYPE_IMAGE_SEGMENTATION,
  TEMPLATE_TYPE_OBJECT_DETECTION,
  TEMPLATE_TYPE_TEXT_CLASSIFICATION,
  TEMPLATE_TYPE_TEXT_ENTITY_RECOGNITION,
} from '@/services/machineLearnModel'
import type { MlModelVersionStatus } from '@/types/mlModel'

export const MODEL_TYPE_OPTIONS: OptionItem[] = [
  {
    label: '文本',
    value: 'text',
    icon: <FileTextOutlined />,
  },
  {
    label: '图片',
    value: 'image',
    icon: <FileImageOutlined />,
  },
]

export const SOURCE_TYPE_OPTIONS = [
  { label: 'Notebook获取', value: 'notebook' },
]

export const MOCK_NOTEBOOK_OPTIONS = [
  {
    label: '文本分类模型 Notebook',
    value: 1001,
    instanceName: 'nb-project-001',
  },
  {
    label: '实体识别模型 Notebook',
    value: 1002,
    instanceName: 'nb-project-002',
  },
  {
    label: '图像分类模型 Notebook',
    value: 1003,
    instanceName: 'nb-project-003',
  },
]

export const ML_MODEL_STATUS_MAP: Record<string, { color: string, text: string }> = {
  running: { color: '#faad14', text: '运行中' },
  completed: { color: '#52c41a', text: '完成' },
  success: { color: '#52c41a', text: '完成' },
  pending: { color: '#1677ff', text: '待启动' },
  created: { color: '#1677ff', text: '待启动' },
  failed: { color: '#ff4d4f', text: '失败' },
}

export const ML_MODEL_TYPE_LABEL_MAP: Record<string, string> = {
  text: '文本',
  image: '图片',
}

export const ML_TASK_TYPE_LABEL_MAP: Record<string, string> = {
  'text-classification': '文本分类',
  'entity-recognition': '实体识别',
  'image-classification': '图像分类',
  'object-detection': '物体检测',
  'text_classification': '文本分类',
  'text_classification_single_label': '文本单标签',
  'text_classification_multi_label': '文本多标签',
  'text_entity_recognition': '文本实体识别',
  'entity_recognition': '实体识别',
  'image_classification': '图像分类',
  'image_classification_single_label': '单图单标签',
  'image_classification_multi_label': '单图多标签',
  'object_detection': '物体检测',
  'object_detection_bbox': '矩形框标注',
  'image_segmentation': '图像分割',
  'image_segmentation_instance': '实例分割',
  'short_text_single_label': '文本单标签',
  'short_text_multi_label': '文本多标签',
  'single_image_single_label': '单图单标签',
  'single_image_multi_label': '单图多标签',
  'rectangle': '矩阵框标注',
  'instance_segmentation': '实例分割',
  'semantic_segmentation': '语义分割',
  'instance_segmentation_mask': '实例分割（掩码）',
}

export function getMlModelStatus(status?: MlModelVersionStatus | string) {
  if (!status) return { color: '#d9d9d9', text: '-' }
  const key = String(status).toLowerCase()
  return ML_MODEL_STATUS_MAP[key] ?? { color: '#d9d9d9', text: String(status) }
}

export function getMlModelTypeLabel(modelType?: string) {
  if (!modelType) return '-'
  return ML_MODEL_TYPE_LABEL_MAP[modelType] ?? modelType
}

export function getMlTaskTypeLabel(taskType?: string) {
  if (!taskType) return '-'
  return ML_TASK_TYPE_LABEL_MAP[taskType] ?? taskType
}

const ML_ANNOTATION_TYPE_LABEL_MAP = Object.fromEntries(
  [...ANNOTATION_TYPE_IMAGE, ...ANNOTATION_TYPE_TEXT].map(({ value, label }) => [value, label]),
) as Record<string, string>

const ML_TASK_TYPE_TO_ANNOTATION_TYPE_MAP = Object.fromEntries([
  ...TEMPLATE_TYPE_TEXT_CLASSIFICATION.map(({ value }) => [value, 'text_classification']),
  ...TEMPLATE_TYPE_TEXT_ENTITY_RECOGNITION.map(({ value }) => [value, 'entity_recognition']),
  ...TEMPLATE_TYPE_IMAGE_CLASSIFICATION.map(({ value }) => [value, 'image_classification']),
  ...TEMPLATE_TYPE_OBJECT_DETECTION.map(({ value }) => [value, 'object_detection']),
  ...TEMPLATE_TYPE_IMAGE_SEGMENTATION.map(({ value }) => [value, 'image_segmentation']),
]) as Record<string, string>

export function getMlModelTypeHierarchyLabel(modelType?: string, taskType?: string) {
  if (!modelType && !taskType) return '-'

  const labels: string[] = []
  const modelLabel = getMlModelTypeLabel(modelType)
  const annotationType = taskType ? ML_TASK_TYPE_TO_ANNOTATION_TYPE_MAP[taskType] : undefined
  const annotationLabel = annotationType ? ML_ANNOTATION_TYPE_LABEL_MAP[annotationType] ?? annotationType : undefined
  const taskLabel = getMlTaskTypeLabel(taskType)

  if (modelType) {
    labels.push(modelLabel)
  }
  if (annotationLabel) {
    labels.push(annotationLabel)
  }
  if (taskType) {
    labels.push(taskLabel)
  }

  return labels.join(' > ') || '-'
}

export function getNextVersionLabel(versions: { model_version: string }[]) {
  const maxVersion = versions.reduce((max, item) => {
    const match = item.model_version.match(/^V(\d+)$/i)
    const current = match ? Number(match[1]) : 0
    return Math.max(max, current)
  }, 0)

  return `V${maxVersion + 1}`
}
