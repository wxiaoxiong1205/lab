import type React from 'react'
import type { Dayjs } from 'dayjs'

export type MainTab = 'online' | 'multi-person'
export type MultiSubTab = 'overview' | 'task' | 'review'
export type AnnotationKind =
  | 'text-classification'
  | 'entity-recognition'
  | 'image-classification'
  | 'object-detection'
  | 'image-segmentation'

export interface WorkflowStepItem {
  icon: React.ReactNode
  title: string
  description: string
}

export interface AnnotationTaskItem {
  id: number
  task_name: string
  total_samples: number
  saved_count?: number
  my_assigned_count?: number
  my_progress?: number
  source_dataset_name: string
  submit_dataset_name: string
  created_by: string
  created_at: string
  status?: 'draft' | 'running' | 'completed' | 'published' | 'audit_passed'
  annotation_progress?: number
  audit_progress?: number
  my_audit_total?: number
  my_audit_progress?: number
  deadline?: string
  kind?: AnnotationKind
  template_type?: string
  annotation_type?: string
  dataset_type?: string
  source_dataset_type?: string
  dataset_title?: string
}

export interface MemberRow {
  key: string
  userId: number
  username: string
  count: number
  deadline: Dayjs | null
}

export interface MemberOption {
  userId: number
  username: string
}

export interface OnlineDatasetOption {
  value: string
  label: string
  total: number
  nextVersion: string
  taskType: string
  templateType: string
  datasetId: number
  versionId: number
  version: string
  name: string
  cascaderValue: Array<string | number>
}

export interface OnlineAnnotationPageItem {
  id: number
  itemId?: string | number
  text?: string
  image?: string
  imageWidth?: number
  imageHeight?: number
  selectedLabel?: string
  selectedClassIds?: number[]
  annotations?: ImageAnnotationItem[]
  entitySpans?: EntitySpanItem[]
}

export interface EntitySpanItem {
  offset: [number, number]
  text: string
  label: string
}

export interface ImageAnnotationItem {
  id?: string
  class_id: number
  tool?: 'polygon' | 'line' | 'point' | 'rectangle'
  pointShape?: 'circle' | 'rectangle'
  pointRectangle?: {
    w: number
    h: number
  }
  segmentation: number[][]
  segmentationMask?: PolygonWithHolesSegmentation
  line?: [[number, number], [number, number]]
  point?: [number, number]
  rectangle?: {
    x: number
    y: number
    w: number
    h: number
  }
}

export type PolygonPoint = [number, number]

export interface PolygonWithHolesRegion {
  exterior: PolygonPoint[]
  holes: PolygonPoint[][]
}

export interface PolygonWithHolesSegmentation {
  type: 'polygon_with_holes'
  regions: PolygonWithHolesRegion[]
}

export interface MaskPartSelection {
  parentId: string
  part: 'exterior' | 'hole'
  regionIndex: number
  holeIndex?: number
}

export interface OnlineAnnotationTaskDetail {
  id: number
  title: string
  task_name: string
  kind: AnnotationKind
  labels: string[]
  pages: OnlineAnnotationPageItem[]
}
