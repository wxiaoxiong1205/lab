import React, { useMemo } from 'react'
import { Button, Popconfirm, Table } from 'antd'
import ImageAnnotationPreview, {
  AnnotationTags,
  type ImageAnnotationDisplayItem,
} from './components/ImageAnnotationPreview'
import type { ItemDetail, SampleData } from '@/services/machineLearnModel'

interface ImageTabDetailsProps {
  items: ItemDetail[]
  labelSchema: Record<string, string>
  baseUrl?: string
  loading: boolean
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  storagePath?: string
  datasetPath?: string
  canDeleteRows?: boolean
  deletingRowNumber?: number | null
  onDeleteRow?: (record: ItemDetail) => void | Promise<void>
}

interface RawImageAnnotationItem {
  class_id: number
  segmentation?: number[][] | {
    type: 'polygon_with_holes'
    regions: Array<{
      exterior: Array<[number, number]>
      holes: Array<Array<[number, number]>>
    }>
  }
  bbox?: [number, number, number, number]
}

interface ImageSampleData extends Omit<SampleData, 'annotations' | 'sample_id' | 'data'> {
  sample_id: string | number
  annotations?: number[] | RawImageAnnotationItem[]
  data?: {
    image?: string
    content?: string
    url?: string
    width?: number
    height?: number
  }
}

interface ImageRow extends ItemDetail {
  key: string
  _imageUrl: string
  _labels: number[]
  _annotations: ImageAnnotationDisplayItem[]
  _imageWidth?: number
  _imageHeight?: number
}

const getDownloadBaseUrl = () => (
  import.meta.env.DEV
    ? `${import.meta.env.VITE_PREFIX_BASE_URL}/api/v1/storage/download/`
    : '/lab-backend/api/v1/storage/download/'
)

const normalizePathPart = (p: string) => p.replace(/^\/+/, '').replace(/\/+$/, '').trim()

function joinBaseAndRelativePath(base: string, rel: string): string {
  const b = base.replace(/\/+$/, '')
  const r = rel.replace(/^\/+/, '')
  if (!b) return r
  return `${b}/${r}`
}

function getFirstSample(item: any): ImageSampleData | null {
  let raw = item?.sample_data ?? item?.sampleData
  if (raw == null) return null

  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw) as ImageSampleData | ImageSampleData[]
    }
    catch {
      return null
    }
  }

  if (Array.isArray(raw) && raw.length > 0) return raw[0] as ImageSampleData
  if (typeof raw === 'object') return raw as ImageSampleData
  return null
}

function getImageSource(sample: ImageSampleData | null): string {
  if (!sample) return ''
  const data = sample.data
  if (!data || typeof data !== 'object') return ''

  const fromImage = typeof data.image === 'string' && data.image.trim() ? data.image.trim() : ''
  if (fromImage) return fromImage

  const fromContent = typeof data.content === 'string' && data.content.trim() ? data.content.trim() : ''
  if (fromContent) return fromContent

  return typeof data.url === 'string' ? data.url.trim() : ''
}

export function buildImageUrl(
  imagePath: string,
  baseUrl?: string,
  storagePath?: string,
  datasetPath?: string,
): string {
  if (!imagePath || typeof imagePath !== 'string') return ''
  const trimmed = imagePath.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('/')) return trimmed

  const rel = normalizePathPart(trimmed)
  const baseRaw = (baseUrl || storagePath || datasetPath || '').trim()
  const base = normalizePathPart(baseRaw)

  if (/^https?:\/\//i.test(baseRaw)) {
    return joinBaseAndRelativePath(baseRaw, rel)
  }
  if (!base) {
    return `${getDownloadBaseUrl()}${rel}`
  }
  return `${getDownloadBaseUrl()}${joinBaseAndRelativePath(base, rel)}`
}

function toPolygonPoints(segmentation: number[] = []) {
  const points: Array<[number, number]> = []

  for (let index = 0; index < segmentation.length; index += 2) {
    const x = segmentation[index]
    const y = segmentation[index + 1]
    if (typeof x === 'number' && typeof y === 'number') {
      points.push([x, y])
    }
  }

  if (points.length > 1) {
    const [firstX, firstY] = points[0]
    const [lastX, lastY] = points[points.length - 1]
    if (firstX === lastX && firstY === lastY) {
      return points.slice(0, -1)
    }
  }

  return points
}

function toBboxPolygonPoints(
  bbox: [number, number, number, number],
  width?: number,
  height?: number,
): Array<[number, number]> {
  const [x1, y1, x2, y2] = bbox
  const resolvedWidth = width || 1
  const resolvedHeight = height || 1

  const left = x1 <= 1 && x2 <= 1 ? x1 * resolvedWidth : x1
  const top = y1 <= 1 && y2 <= 1 ? y1 * resolvedHeight : y1
  const right = x1 <= 1 && x2 <= 1 ? x2 * resolvedWidth : x2
  const bottom = y1 <= 1 && y2 <= 1 ? y2 * resolvedHeight : y2

  return [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ]
}

function getRawAnnotations(sample: ImageSampleData | null): RawImageAnnotationItem[] {
  if (!sample || !Array.isArray(sample.annotations)) return []
  return sample.annotations.filter((annotation): annotation is RawImageAnnotationItem => (
    typeof annotation === 'object'
    && annotation !== null
    && typeof (annotation as RawImageAnnotationItem).class_id === 'number'
  ))
}

function toDisplayAnnotations(
  annotations: RawImageAnnotationItem[],
  imageWidth?: number,
  imageHeight?: number,
): ImageAnnotationDisplayItem[] {
  return annotations.reduce<ImageAnnotationDisplayItem[]>((result, annotation) => {
    const shapes: ImageAnnotationDisplayItem['shapes'] = []

    if (Array.isArray(annotation.segmentation)) {
      annotation.segmentation.forEach((polygon) => {
        const points = toPolygonPoints(polygon)
        if (!points.length) return
        shapes.push({ type: 'polygon', points })
      })
    }

    const segmentationMask = !Array.isArray(annotation.segmentation) && annotation.segmentation?.type === 'polygon_with_holes'
      ? annotation.segmentation
      : undefined
    if (segmentationMask) {
      segmentationMask.regions.forEach((region) => {
        if (!region.exterior.length) return
        shapes.push({
          type: 'polygon-with-holes',
          points: region.exterior,
          holes: region.holes,
        })
      })
    }

    if (annotation.bbox?.length === 4) {
      shapes.push({
        type: 'rectangle',
        points: toBboxPolygonPoints(annotation.bbox, imageWidth, imageHeight),
      })
    }

    if (!shapes.length) return result

    result.push({
      classId: annotation.class_id,
      shapes,
    })

    return result
  }, [])
}

function getAnnotationLabels(annotations: ImageAnnotationDisplayItem[]): number[] {
  return Array.from(new Set(
    annotations
      .map((annotation) => annotation.classId)
      .filter((classId) => Number.isFinite(classId)),
  )).sort((a, b) => a - b)
}

/** 多标签分类等场景：annotations 为 number[]，元素为 label_schema 的 key（与分割/检测的对象数组并存时合并） */
function getNumericAnnotationClassIds(sample: ImageSampleData | null): number[] {
  if (!sample || !Array.isArray(sample.annotations)) return []
  const ids = sample.annotations.filter(
    (a): a is number => typeof a === 'number' && Number.isFinite(a),
  )
  return Array.from(new Set(ids)).sort((a, b) => a - b)
}

function mergeSortedClassIds(a: number[], b: number[]): number[] {
  return Array.from(new Set([...a, ...b])).sort((x, y) => x - y)
}

const ImageTabDetails: React.FC<ImageTabDetailsProps> = ({
  items,
  labelSchema,
  baseUrl,
  loading,
  page,
  pageSize,
  total,
  onPageChange,
  storagePath,
  datasetPath,
  canDeleteRows,
  deletingRowNumber,
  onDeleteRow,
}) => {
  const rows = useMemo<ImageRow[]>(() => {
    const list = Array.isArray(items) ? items : []
    return list.map((item, index) => {
      const first = getFirstSample(item)
      const src = getImageSource(first)
      const imageUrl = src ? buildImageUrl(src, baseUrl, storagePath, datasetPath) : ''
      const imageWidth = first?.data?.width
      const imageHeight = first?.data?.height
      const displayAnnotations = toDisplayAnnotations(
        getRawAnnotations(first),
        imageWidth,
        imageHeight,
      )
      const labels = mergeSortedClassIds(
        getAnnotationLabels(displayAnnotations),
        getNumericAnnotationClassIds(first),
      )
      const rowNumber = item?.row_number ?? (item as any)?.rowNumber ?? index + 1

      return {
        ...item,
        key: `row-${rowNumber}-${index}`,
        row_number: rowNumber,
        _imageUrl: imageUrl,
        _labels: labels,
        _annotations: displayAnnotations,
        _imageWidth: imageWidth,
        _imageHeight: imageHeight,
      }
    })
  }, [items, baseUrl, storagePath, datasetPath])

  const start = total ? (page - 1) * pageSize + 1 : 0
  const end = Math.min(page * pageSize, total)

  const columns = [
    {
      title: '序号',
      dataIndex: 'row_number',
      key: 'row_number',
      render: (_val: number, record: ImageRow) => record.row_number ?? '-',
      width: 80,
      align: 'center' as const,
    },
    {
      title: '图片',
      dataIndex: '_imageUrl',
      key: '_imageUrl',
      width: 260,
      render: (_url: string, record: ImageRow) => (
        <ImageAnnotationPreview
          imageUrl={record._imageUrl}
          annotations={record._annotations}
          legendClassIds={record._labels}
          labelSchema={labelSchema}
          imageWidth={record._imageWidth}
          imageHeight={record._imageHeight}
        />
      ),
    },
    {
      title: '标签',
      dataIndex: '_labels',
      key: '_labels',
      width: 240,
      render: (labels: number[]) => <AnnotationTags classIds={labels} labelSchema={labelSchema} />,
    },
    ...(canDeleteRows
      ? [{
          title: '操作',
          key: 'action',
          width: 100,
          align: 'center' as const,
          render: (_: unknown, record: ImageRow) => {
            const rowNumber = Number(record?.row_number)
            const canDelete = Number.isFinite(rowNumber) && !!onDeleteRow
            return (
              <Popconfirm
                title="确认删除"
                description="确定要删除该行数据吗？删除后将无法恢复。"
                okText="确认删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                disabled={!canDelete}
                onConfirm={() => onDeleteRow?.(record)}
              >
                <Button
                  type="link"
                  danger
                  size="small"
                  disabled={!canDelete}
                  loading={deletingRowNumber === rowNumber}
                >
                  删除
                </Button>
              </Popconfirm>
            )
          },
        }]
      : []),
  ]

  return (
    <Table
      columns={columns}
      dataSource={rows}
      loading={loading}
      rowKey={(record: ImageRow) => record.key}
      pagination={{
        current: page,
        pageSize,
        total,
        showSizeChanger: false,
        showTotal: () => `显示第 ${start} 到 ${end} 条，共 ${total} 条记录`,
        onChange: onPageChange,
      }}
    />
  )
}

export default ImageTabDetails
