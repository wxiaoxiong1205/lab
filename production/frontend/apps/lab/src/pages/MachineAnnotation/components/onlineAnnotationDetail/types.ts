import type {
  EntitySpanItem,
  ImageAnnotationItem,
  OnlineAnnotationTaskDetail,
  PolygonWithHolesSegmentation,
} from '../../types'
import type { LabelTaskLabelItem } from '@/services/dataAnnotationService'

export interface OnlineAnnotationDetailPageProps {
  projectId?: number
  taskId?: number
  bizType?: string
  isMultiPerson?: boolean
  isAuditMode?: boolean
  isOnlineTabDetail?: boolean
  viewMode?: 'annotation' | 'overview'
  task: OnlineAnnotationTaskDetail
  onBack: () => void
}

export interface ImageAnnotationPayloadItem {
  id?: string
  class_id: number
  segmentation?: number[][] | PolygonWithHolesSegmentation | {
    type: 'rle'
    size: [number, number]
    counts: number[]
  }
  bbox?: [number, number, number, number]
  closed?: boolean
}

export interface ImageClassificationPayloadItem {
  item_id?: string
  row_number?: number
  raw_data?: {
    data?: {
      content?: string
      text?: string
      image?: string
      height?: number
      width?: number
    }
    annotations?: number[]
  }
  annotation?: number[] | null
  is_annotated?: boolean
}

export interface EntityRecognitionPayloadItem {
  offset: [number, number]
  /** 标签在任务标签列表中的下标（字符串或数字），兼容旧数据为直接写入的标签名 */
  tag: string | number
}

export interface MachineAnnotationDataResponse {
  items?: {
    item_id?: string
    row_number?: number
    raw_data?: {
      data?: {
        content?: string
        text?: string
        image?: string
        height?: number
        width?: number
      }
      annotations?: ImageAnnotationPayloadItem[] | EntityRecognitionPayloadItem[] | number[]
    }
    annotation?: ImageAnnotationPayloadItem[] | { annotations: ImageAnnotationPayloadItem[] } | EntityRecognitionPayloadItem[] | number[] | null
    is_annotated?: boolean
    status?: string
    audit_result?: 'passed' | 'failed' | null
    audit_reason?: string | null
  }
  is_reaudit_round?: boolean
  total?: number
  page?: number
  size?: number
  total_pages?: number
  task_status?: string
  base_url?: string
  ml_task_template_type?: string
  ml_task_annotation_type?: string
}

export interface LabelTaskLabelsResponse {
  items?: LabelTaskLabelItem[]
  labels?: LabelTaskLabelItem[]
}

export interface PredictRequestBody {
  tasks: Array<{
    id: string | number
    data: Record<string, string>
  }>
  project: string
  label_config: string
}

export interface PredictResultItem {
  id?: string
  from_name?: string
  to_name?: string
  type?: string
  category_name?: string
  class_id?: number
  segmentation?: ImageAnnotationPayloadItem['segmentation']
  bbox?: [number, number, number, number]
  original_width?: number
  original_height?: number
  image_rotation?: number
  value?: {
    points?: number[][]
    polygonlabels?: string[]
    x?: number
    y?: number
    width?: number
    height?: number
    rotation?: number
    rectanglelabels?: string[]
    choices?: string[] | string
    start?: number
    end?: number
    text?: string
    labels?: string[]
    closed?: boolean
  }
  score?: number
}

export interface PredictResponse {
  results?: Array<{
    model_version?: string
    score?: number
    result?: PredictResultItem[]
  }>
}

export interface SegmentationLabelOption {
  label: string
  value: number
  color: string
}

export interface RenderedImageBox {
  naturalWidth: number
  naturalHeight: number
  renderedWidth: number
  renderedHeight: number
  offsetX: number
  offsetY: number
}

export type ImageAnnotationSubmitPayload =
  | {
    class_id: number
    segmentation: number[][] | PolygonWithHolesSegmentation
    closed?: boolean
  }
  | {
    class_id: number
    bbox: [number, number, number, number]
  }

export type DetailPageAnnotations = Record<number, ImageAnnotationItem[]>
export type DetailPageSelectedClassIds = Record<number, number[]>
export type DetailPageEntitySpans = Record<number, EntitySpanItem[]>
