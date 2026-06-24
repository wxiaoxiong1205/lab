import type React from 'react'
import type { ColumnsType } from 'antd/es/table'

export type AnnotationFilter = 'all' | 'annotated' | 'unannotated' | 'unaudited' | 'passed' | 'failed'

export interface PaginationState {
  current: number
  pageSize: number
  total: number
}

export interface AnnotationDetailToolbarProps {
  isSubmitted: boolean
  annotationFilter: AnnotationFilter
  isAuditMode: boolean
  onFilterChange: (value: AnnotationFilter) => void
  onOpenConfig: () => void
}

export interface AnnotationDetailTableSectionProps<T> {
  columns: ColumnsType<T>
  dataSource: T[]
  loading: boolean
  isImageAnnotation: boolean
  onRowClick: (record: T, event: React.MouseEvent<HTMLElement>) => void
}

export interface AnnotationDetailFooterProps {
  pagination: PaginationState
  aiLoading: boolean
  isSubmitted: boolean
  isAuditMode: boolean
  auditSubmitLoading: boolean
  isCompleted: boolean
  onPageChange: (page: number, pageSize?: number) => void
  onSubmitAudit: () => void
  onSubmit: () => void
}

export interface AuditRejectModalProps {
  visible: boolean
  reason: string
  loading: boolean
  onReasonChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}

export interface ImagePreviewModalProps {
  visible: boolean
  imageUrl: string
  onClose: () => void
}

export const ANNOTATION_FILTER_OPTIONS: Array<{ label: string, value: AnnotationFilter }> = [
  { label: '全部', value: 'all' },
  { label: '未标注', value: 'unannotated' },
  { label: '已完成', value: 'annotated' },
]

export const AUDIT_FILTER_OPTIONS: Array<{ label: string, value: AnnotationFilter }> = [
  { label: '全部', value: 'all' },
  { label: '未审核', value: 'unaudited' },
  { label: '审核通过', value: 'passed' },
  { label: '审核不通过', value: 'failed' },
]

export const getPaginationTotalText = (total: number) => `共 ${total} 条`
