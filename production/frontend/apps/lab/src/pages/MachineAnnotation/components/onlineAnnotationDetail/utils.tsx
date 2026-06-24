/* eslint-disable react-refresh/only-export-components */
import React from 'react'
import { Button, Select, Tag, Typography, message } from 'antd'
import { type ImageAnnotation, ShapeType } from '@annotorious/react'
import OpenSeadragon from 'openseadragon'
import type { ColumnsType } from 'antd/es/table'
import type {
  AnnotationKind,
  EntitySpanItem,
  ImageAnnotationItem,
  MaskPartSelection,
  OnlineAnnotationPageItem,
  PolygonPoint,
  PolygonWithHolesRegion,
  PolygonWithHolesSegmentation,
} from '../../types'
import type {
  DetailPageSelectedClassIds,
  EntityRecognitionPayloadItem,
  ImageAnnotationPayloadItem,
  ImageAnnotationSubmitPayload,
  MachineAnnotationDataResponse,
  PredictResponse,
  PredictResultItem,
  RenderedImageBox,
  SegmentationLabelOption,
} from './types'

const { Text } = Typography

export const imageFallbackSize = { width: 1061, height: 801 }
export const pointMarkerSize = 14
export const pointMarkerWidth = 12
export const pointMarkerHeight = 12
export const quickRectangleSubmitSize = {
  w: 6,
  h: 6,
} as const

export function createDetailColumns(
  kind: AnnotationKind,
  labels: string[],
  selectedClassIds: DetailPageSelectedClassIds,
  setSelectedClassIds: React.Dispatch<React.SetStateAction<DetailPageSelectedClassIds>>,
  classificationMode: 'single' | 'multiple' = 'single',
  readOnly = false,
): ColumnsType<OnlineAnnotationPageItem> {
  const baseColumns: ColumnsType<OnlineAnnotationPageItem> = [
    {
      title: '序号',
      key: 'index',
      width: 80,
      render: (_, record) => <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#3b82f6] text-xs text-white">{record.id}</span>,
    },
  ]

  if (kind === 'text-classification') {
    return [
      ...baseColumns,
      {
        title: '文本',
        dataIndex: 'text',
        key: 'text',
        render: (value) => <div className="min-h-[140px] py-6 text-[13px] leading-7 text-[#1f2937]">{value}</div>,
      },
      {
        title: '标注结果',
        key: 'selectedLabel',
        width: 220,
        render: (_, record) => {
          const filteredClassIds = filterClassificationClassIdsByLabels(labels, selectedClassIds[record.id])
          return (
            <div className="min-h-[140px] py-6">
              <Select
                mode={classificationMode === 'multiple' ? 'multiple' : undefined}
                value={filteredClassIds.length ? filteredClassIds.map(String) : undefined}
                placeholder="请选择标签"
                className="w-full"
                showSearch
                optionFilterProp="label"
                disabled={readOnly}
                options={toClassificationLabelOptions(labels)}
                onChange={(value) => {
                  const nextValue = Array.isArray(value) ? value.map(Number) : [Number(value)]
                  setSelectedClassIds((prev) => ({ ...prev, [record.id]: nextValue }))
                }}
              />
            </div>
          )
        },
      },
    ]
  }

  if (kind === 'entity-recognition') {
    return [
      ...baseColumns,
      {
        title: '文本',
        key: 'text',
        render: (_, record) => (
          <div className="min-h-[140px] py-6 text-[13px] leading-8 text-[#1f2937]">
            {renderEntityText(record)}
          </div>
        ),
      },
      {
        title: '操作',
        key: 'action',
        width: 140,
        render: () => (
          <div className="min-h-[140px] py-6">
            <Button type="primary" onClick={() => message.success('已完成标注')}>
              完成标注
            </Button>
          </div>
        ),
      },
    ]
  }

  if (kind === 'image-classification') {
    return [
      ...baseColumns,
      {
        title: '图像',
        key: 'image',
        render: (_, record) => <ImagePanel image={record.image} kind={kind} />,
      },
      {
        title: '标注结果',
        key: 'selectedLabel',
        width: 220,
        render: (_, record) => {
          const filteredClassIds = filterClassificationClassIdsByLabels(labels, selectedClassIds[record.id])
          return (
            <div className="min-h-[340px] py-6">
              <Select
                mode={classificationMode === 'multiple' ? 'multiple' : undefined}
                value={filteredClassIds.length ? filteredClassIds.map(String) : undefined}
                placeholder="请选择标签"
                className="w-full"
                showSearch
                optionFilterProp="label"
                disabled={readOnly}
                options={toClassificationLabelOptions(labels)}
                onChange={(value) => {
                  const nextValue = Array.isArray(value) ? value.map(Number) : [Number(value)]
                  setSelectedClassIds((prev) => ({ ...prev, [record.id]: nextValue }))
                }}
              />
            </div>
          )
        },
      },
    ]
  }

  return [
    ...baseColumns,
    {
      title: '图像',
      key: 'image',
      render: (_, record) => <ImagePanel image={record.image} kind={kind} />,
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      render: () => (
        <div className="min-h-[340px] py-6">
          <Button type="primary" onClick={() => message.success('已完成标注')}>
            完成标注
          </Button>
        </div>
      ),
    },
  ]
}

export function renderEntityText(record: OnlineAnnotationPageItem) {
  if (!record.text) return null
  if (!record.entitySpans?.length) return record.text

  let content = record.text
  const nodes: React.ReactNode[] = []

  record.entitySpans.forEach((span) => {
    const marker = content.indexOf(span.text)
    if (marker >= 0) {
      const beforeText = content.slice(0, marker)
      const baseKey = `${span.label}-${span.text}-${marker}`
      if (beforeText) nodes.push(<span key={`before-${baseKey}`}>{beforeText}</span>)
      nodes.push(
        <Tag key={`tag-${baseKey}`} color="processing" className="mx-1 rounded px-2 py-1">
          {span.text}
        </Tag>,
      )
      content = content.slice(marker + span.text.length)
    }
  })

  if (content) nodes.push(<span key="rest">{content}</span>)
  return nodes
}

export function resolveEntityRecognitionSource(
  annotation: EntityRecognitionPayloadItem[] | null | undefined,
  rawAnnotations?: EntityRecognitionPayloadItem[],
) {
  if (annotation == null) return rawAnnotations || []
  return annotation
}

/** 将接口中的 tag（数字索引或旧版中文标签名）解析为展示用标签名 */
export function resolveEntityTagToLabel(tag: string | number, labels?: string[]): string {
  const trimmed = typeof tag === 'string' ? tag.trim() : String(tag)
  if (!labels?.length) return trimmed
  if (/^\d+$/.test(trimmed)) {
    const index = Number(trimmed)
    if (Number.isFinite(index) && index >= 0 && index < labels.length && labels[index]) {
      return labels[index]
    }
  }
  return trimmed
}

export function normalizeEntitySpans(
  text: string,
  items: EntityRecognitionPayloadItem[],
  labels?: string[],
): EntitySpanItem[] {
  return items
    .filter((item) => Array.isArray(item.offset) && item.offset.length === 2 && (typeof item.tag === 'string' || typeof item.tag === 'number'))
    .map((item) => {
      const [start, end] = item.offset
      return {
        offset: [start, end] as [number, number],
        text: text.slice(start, end),
        label: resolveEntityTagToLabel(item.tag, labels),
      }
    })
    .filter((item) => item.offset[0] >= 0 && item.offset[1] > item.offset[0])
    .sort((a, b) => a.offset[0] - b.offset[0] || a.offset[1] - b.offset[1])
}

export function ImagePanel({ image, kind }: { image?: string, kind: AnnotationKind }) {
  return (
    <div className="min-w-0 py-3">
      <div className="relative mx-auto aspect-[520/360] w-full max-w-[520px] overflow-hidden rounded-lg border border-[#e5e7eb] bg-[#f8fafc]">
        {image && <img src={image} alt="annotation" className="h-full w-full object-contain" />}
        {kind === 'object-detection' && (
          <>
            <div className="absolute left-[118px] top-[148px] h-[96px] w-[110px] rounded border-[3px] border-[#2563eb]" />
            <div className="absolute left-[110px] top-[140px] rounded bg-white px-3 py-2 shadow">
              <Text strong className="block text-xs">选择标签</Text>
              <div className="mt-2 space-y-2 text-xs text-[#374151]">
                <div>标签一</div>
                <div>标签二</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function getAnnotationColor(classId: number) {
  const normalizedId = Math.abs(classId)
  const hue = (normalizedId * 137.508 + 23) % 360
  const saturation = 62 + (normalizedId % 4) * 7
  const lightness = 44 + (normalizedId % 3) * 6
  return hslToHex(hue, saturation, lightness)
}

export function toAnnotoriousAnnotation(
  annotation: ImageAnnotationItem,
  item: OnlineAnnotationPageItem,
  labels: string[],
): ImageAnnotation {
  if (annotation.tool === 'rectangle' && annotation.rectangle) {
    const id = annotation.id ?? `rect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    return {
      id,
      bodies: buildAnnotationBodies(id, annotation.class_id, labels),
      properties: {
        classId: annotation.class_id,
        sourceImage: item.image,
        tool: 'rectangle',
      },
      target: {
        annotation: id,
        selector: {
          type: ShapeType.RECTANGLE,
          geometry: {
            ...annotation.rectangle,
            rot: 0,
            bounds: {
              minX: annotation.rectangle.x,
              minY: annotation.rectangle.y,
              maxX: annotation.rectangle.x + annotation.rectangle.w,
              maxY: annotation.rectangle.y + annotation.rectangle.h,
            },
          } as NonNullable<ImageAnnotationItem['rectangle']> & {
            rot: number
            bounds: ReturnType<typeof toBounds>
          },
        },
      },
    }
  }

  if (annotation.tool === 'line' && annotation.line) {
    const id = annotation.id ?? `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    return {
      id,
      bodies: buildAnnotationBodies(id, annotation.class_id, labels),
      properties: {
        classId: annotation.class_id,
        sourceImage: item.image,
        tool: 'line',
      },
      target: {
        annotation: id,
        selector: {
          type: ShapeType.LINE,
          geometry: {
            points: annotation.line,
            bounds: toBounds(annotation.line),
          } as { bounds: ReturnType<typeof toBounds>, points: [[number, number], [number, number]] },
        },
      },
    }
  }

  const points = toPolygonPoints(annotation.segmentation[0] ?? [])
  const classId = annotation.class_id
  const id = annotation.id ?? `seg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  return toPolygonAnnotoriousAnnotation({
    id,
    classId,
    labels,
    sourceImage: item.image,
    points,
  })
}

function toPolygonAnnotoriousAnnotation({
  id,
  classId,
  labels,
  sourceImage,
  points,
  properties,
}: {
  id: string
  classId: number
  labels: string[]
  sourceImage?: string
  points: PolygonPoint[]
  properties?: Record<string, unknown>
}): ImageAnnotation {
  return {
    id,
    bodies: buildAnnotationBodies(id, classId, labels),
    properties: {
      classId,
      sourceImage,
      ...properties,
    },
    target: {
      annotation: id,
      selector: {
        type: ShapeType.POLYGON,
        geometry: {
          bounds: toBounds(points),
          points: points.map((point) => [point[0], point[1]]),
        } as { bounds: ReturnType<typeof toBounds>, points: [number, number][] },
      },
    },
  }
}

export function toAnnotoriousAnnotations(
  annotation: ImageAnnotationItem,
  item: OnlineAnnotationPageItem,
  labels: string[],
): ImageAnnotation[] {
  if (!annotation.segmentationMask) return [toAnnotoriousAnnotation(annotation, item, labels)]

  const baseId = getAnnotationStableId(annotation)
  const result: ImageAnnotation[] = []
  annotation.segmentationMask.regions.forEach((region, regionIndex) => {
    const exteriorId = getMaskExteriorAnnotationId(baseId, regionIndex)
    result.push(toPolygonAnnotoriousAnnotation({
      id: exteriorId,
      classId: annotation.class_id,
      labels,
      sourceImage: item.image,
      points: region.exterior,
      properties: {
        maskParentId: baseId,
        maskPart: 'exterior',
        maskRegionIndex: regionIndex,
      },
    }))

    region.holes.forEach((hole, holeIndex) => {
      result.push(toPolygonAnnotoriousAnnotation({
        id: getMaskHoleAnnotationId(baseId, regionIndex, holeIndex),
        classId: annotation.class_id,
        labels,
        sourceImage: item.image,
        points: hole,
        properties: {
          maskParentId: baseId,
          maskPart: 'hole',
          maskRegionIndex: regionIndex,
          maskHoleIndex: holeIndex,
        },
      }))
    })
  })

  return result
}

export function mergeCanvasAnnotationsWithPoints(
  currentAnnotations: ImageAnnotationItem[],
  canvasAnnotations: ImageAnnotation[],
  polygonWithHoles = false,
) {
  const pointAnnotations = getPointAnnotations(currentAnnotations)
  if (!polygonWithHoles) {
    return [...canvasAnnotations.map(toBackendAnnotation), ...pointAnnotations]
  }

  return [
    ...mergeMaskCanvasAnnotations(currentAnnotations, canvasAnnotations),
    ...pointAnnotations,
  ]
}

export function serializeImageAnnotations(
  annotations: ImageAnnotationItem[],
  polygonWithHoles = false,
): ImageAnnotationSubmitPayload[] {
  return annotations
    .map((annotation): ImageAnnotationSubmitPayload | null => {
      if (polygonWithHoles) {
        const segmentation = normalizePolygonWithHolesAnnotation(annotation)?.segmentationMask
        if (!segmentation?.regions.length) return null

        return {
          class_id: annotation.class_id,
          segmentation,
        }
      }

      if (annotation.tool === 'point' && annotation.point) {
        if (annotation.pointShape === 'rectangle') {
          const rectangle = toPointRectangle(annotation)
          return {
            class_id: annotation.class_id,
            closed: false,
            segmentation: [[
              rectangle.x,
              rectangle.y,
              rectangle.x + rectangle.w,
              rectangle.y,
              rectangle.x + rectangle.w,
              rectangle.y + rectangle.h,
              rectangle.x,
              rectangle.y + rectangle.h,
            ]],
          }
        }

        return {
          class_id: annotation.class_id,
          segmentation: [[annotation.point[0], annotation.point[1]]],
        }
      }

      if (annotation.tool === 'line' && annotation.line) {
        const [[x1, y1], [x2, y2]] = annotation.line
        return {
          class_id: annotation.class_id,
          segmentation: [[x1, y1, x2, y2]],
        }
      }

      if (annotation.tool === 'rectangle' && annotation.rectangle) {
        const { x, y, w, h } = annotation.rectangle
        return {
          class_id: annotation.class_id,
          bbox: [x, y, x + w, y + h] as [number, number, number, number],
        }
      }

      const segmentation = annotation.segmentation.filter((polygon) => polygon.length >= 4)
      if (!segmentation.length) return null

      return {
        class_id: annotation.class_id,
        segmentation,
      }
    })
    .filter((item): item is ImageAnnotationSubmitPayload => item != null)
}

type RawDataAnnotations = NonNullable<
  NonNullable<MachineAnnotationDataResponse['items']>['raw_data']
>['annotations']

export function resolveImageAnnotationSource(
  annotation: NonNullable<MachineAnnotationDataResponse['items']>['annotation'],
  rawAnnotations?: RawDataAnnotations,
): ImageAnnotationPayloadItem[] {
  const isObjectPayloadArray = (arr: unknown): arr is ImageAnnotationPayloadItem[] =>
    Array.isArray(arr) && arr.every((item) => item != null && typeof item === 'object')

  if (annotation == null) {
    return isObjectPayloadArray(rawAnnotations) ? rawAnnotations : []
  }
  if (isObjectPayloadArray(annotation)) {
    return annotation
  }
  return isObjectPayloadArray(rawAnnotations) ? rawAnnotations : []
}

export function resolveImageClassificationSource(
  annotation: number[] | null | undefined,
  rawAnnotations?: number[],
) {
  if (annotation == null) return rawAnnotations || []
  return annotation
}

export function normalizeImageAnnotation(item: ImageAnnotationPayloadItem, index: number): ImageAnnotationItem {
  if (item.bbox?.length === 4) {
    const [x1, y1, x2, y2] = item.bbox
    return {
      id: item.id ?? `rect-${index + 1}`,
      class_id: item.class_id,
      tool: 'rectangle',
      segmentation: [],
      rectangle: {
        x: x1,
        y: y1,
        w: x2 - x1,
        h: y2 - y1,
      },
    }
  }

  if (isPolygonWithHolesSegmentation(item.segmentation)) {
    return normalizePolygonWithHolesPayload(item, index)
  }

  if (item.segmentation && !Array.isArray(item.segmentation)) {
    return {
      id: item.id ?? `seg-${index + 1}`,
      class_id: item.class_id,
      tool: 'polygon',
      segmentation: [],
    }
  }

  const segmentation = (item.segmentation ?? []) as number[][]
  const firstShape = segmentation[0] ?? []

  if (item.closed === false && firstShape.length >= 8) {
    const rectangle = toRectangleShape(firstShape)
    if (rectangle) {
      return {
        id: item.id ?? `point-${index + 1}`,
        class_id: item.class_id,
        tool: 'point',
        pointShape: 'rectangle',
        pointRectangle: {
          w: Number(rectangle.w.toFixed(1)),
          h: Number(rectangle.h.toFixed(1)),
        },
        segmentation: [],
        point: [
          Number((rectangle.x + rectangle.w / 2).toFixed(1)),
          Number((rectangle.y + rectangle.h / 2).toFixed(1)),
        ],
      }
    }
  }

  if (firstShape.length === 2) {
    const [x, y] = firstShape
    return {
      id: item.id ?? `point-${index + 1}`,
      class_id: item.class_id,
      tool: 'point',
      pointShape: 'circle',
      segmentation: [],
      point: [x, y],
    }
  }

  if (firstShape.length === 4) {
    const [x1, y1, x2, y2] = firstShape
    return {
      id: item.id ?? `line-${index + 1}`,
      class_id: item.class_id,
      tool: 'line',
      segmentation: [],
      line: [[x1, y1], [x2, y2]],
    }
  }

  const rectangle = toRectangleShape(firstShape)
  if (rectangle) {
    return {
      id: item.id ?? `rect-${index + 1}`,
      class_id: item.class_id,
      tool: 'rectangle',
      segmentation: [],
      rectangle,
    }
  }

  return {
    id: item.id ?? `seg-${index + 1}`,
    class_id: item.class_id,
    tool: 'polygon',
    segmentation,
  }
}

export function normalizePolygonWithHolesAnnotation(annotation: ImageAnnotationItem): ImageAnnotationItem | null {
  if (annotation.segmentationMask) {
    const regions: PolygonWithHolesRegion[] = annotation.segmentationMask.regions
      .map((region) => ({
        exterior: normalizePolygonPoints(region.exterior),
        holes: (region.holes ?? [])
          .map(normalizePolygonPoints)
          .filter((hole) => hole.length >= 3),
      }))
      .filter((region) => region.exterior.length >= 3)

    if (!regions.length) return null
    return {
      ...annotation,
      id: getAnnotationStableId(annotation),
      tool: 'polygon',
      segmentation: regions.map((region) => pointsToFlatClosedPolygon(region.exterior)),
      segmentationMask: {
        type: 'polygon_with_holes',
        regions,
      },
    }
  }

  const regions = annotation.segmentation
    .map((polygon) => normalizePolygonPoints(toPolygonPoints(polygon)))
    .filter((exterior) => exterior.length >= 3)
    .map<PolygonWithHolesRegion>((exterior) => ({
      exterior,
      holes: [],
    }))

  if (!regions.length) return null

  return {
    ...annotation,
    id: getAnnotationStableId(annotation),
    tool: 'polygon',
    segmentation: regions.map((region) => pointsToFlatClosedPolygon(region.exterior)),
    segmentationMask: {
      type: 'polygon_with_holes',
      regions,
    },
  }
}

export function addPolygonWithHolesPart(
  annotations: ImageAnnotationItem[],
  targetAnnotationId: string,
  polygon: number[],
  part: 'hole' | 'region',
  targetRegionIndex = 0,
) {
  const points = normalizePolygonPoints(toPolygonPoints(polygon))
  if (points.length < 3) return annotations

  return annotations.map((annotation): ImageAnnotationItem => {
    if (getAnnotationStableId(annotation) !== targetAnnotationId) return annotation

    const normalized = normalizePolygonWithHolesAnnotation(annotation)
    if (!normalized?.segmentationMask?.regions.length) return annotation

    const regions: PolygonWithHolesRegion[] = normalized.segmentationMask.regions.map((region) => ({
      exterior: region.exterior,
      holes: region.holes.map((hole) => [...hole]),
    }))

    if (part === 'hole') {
      const regionIndex = Math.min(Math.max(targetRegionIndex, 0), regions.length - 1)
      regions[regionIndex] = {
        ...regions[regionIndex],
        holes: [...regions[regionIndex].holes, points],
      }
    }
    else {
      regions.push({
        exterior: points,
        holes: [],
      })
    }

    return {
      ...normalized,
      segmentation: regions.map((region) => pointsToFlatClosedPolygon(region.exterior)),
      segmentationMask: {
        type: 'polygon_with_holes',
        regions,
      },
    }
  })
}

export function findPolygonWithHolesTarget(
  annotations: ImageAnnotationItem[],
  polygon: number[],
): { annotationId: string, regionIndex: number } | null {
  const points = normalizePolygonPoints(toPolygonPoints(polygon))
  if (points.length < 3) return null

  const candidates = annotations.flatMap((annotation) => {
    const normalized = normalizePolygonWithHolesAnnotation(annotation)
    if (!normalized?.segmentationMask) return []

    return normalized.segmentationMask.regions
      .map((region, regionIndex) => {
        if (!polygonContainsPolygon(region.exterior, points)) return null

        return {
          annotationId: getAnnotationStableId(normalized),
          regionIndex,
          area: Math.abs(polygonArea(region.exterior)),
        }
      })
      .filter((candidate): candidate is { annotationId: string, regionIndex: number, area: number } => candidate != null)
  })

  return candidates.sort((a, b) => a.area - b.area)[0] ?? null
}

export function removePolygonWithHolesPart(
  annotations: ImageAnnotationItem[],
  selection: MaskPartSelection,
) {
  return annotations.reduce<ImageAnnotationItem[]>((result, annotation) => {
    if (getAnnotationStableId(annotation) !== selection.parentId) {
      result.push(annotation)
      return result
    }

    const normalized = normalizePolygonWithHolesAnnotation(annotation)
    if (!normalized?.segmentationMask?.regions.length) return result

    if (selection.part === 'hole') {
      const regions = normalized.segmentationMask.regions.map((region, regionIndex) => ({
        exterior: region.exterior,
        holes: regionIndex === selection.regionIndex
          ? region.holes.filter((_, holeIndex) => holeIndex !== selection.holeIndex)
          : region.holes,
      }))

      result.push({
        ...normalized,
        segmentationMask: {
          type: 'polygon_with_holes',
          regions,
        },
      })
      return result
    }

    const regions = normalized.segmentationMask.regions.filter((_, regionIndex) => regionIndex !== selection.regionIndex)
    if (!regions.length) return result

    result.push({
      ...normalized,
      segmentation: regions.map((region) => pointsToFlatClosedPolygon(region.exterior)),
      segmentationMask: {
        type: 'polygon_with_holes',
        regions,
      },
    })
    return result
  }, [])
}

export function getPolygonWithHolesValidationError(annotations: ImageAnnotationItem[]) {
  for (const annotation of annotations) {
    if (!annotation.segmentationMask) continue

    const normalized = normalizePolygonWithHolesAnnotation(annotation)
    const regionsWithHoles = normalized?.segmentationMask?.regions
      .filter((region) => region.holes.length > 0) ?? []
    if (!regionsWithHoles.length) continue

    for (const region of regionsWithHoles) {
      for (const hole of region.holes) {
        if (!polygonContainsPolygon(region.exterior, hole)) {
          return '孔洞不能超出外轮廓'
        }
      }

      for (let i = 0; i < region.holes.length; i += 1) {
        for (let j = i + 1; j < region.holes.length; j += 1) {
          if (polygonsOverlap(region.holes[i], region.holes[j])) {
            return '孔洞之间不能重叠'
          }
        }
      }
    }
  }

  return null
}

function normalizePolygonWithHolesPayload(item: ImageAnnotationPayloadItem, index: number): ImageAnnotationItem {
  const rawSegmentation = item.segmentation as PolygonWithHolesSegmentation
  const regions: PolygonWithHolesRegion[] = rawSegmentation.regions
    .map((region) => ({
      exterior: normalizePolygonPoints(region.exterior),
      holes: (region.holes ?? [])
        .map(normalizePolygonPoints)
        .filter((hole) => hole.length >= 3),
    }))
    .filter((region) => region.exterior.length >= 3)

  return {
    id: item.id ?? `seg-${index + 1}`,
    class_id: item.class_id,
    tool: 'polygon',
    segmentation: regions.map((region) => pointsToFlatClosedPolygon(region.exterior)),
    segmentationMask: {
      type: 'polygon_with_holes',
      regions,
    },
  }
}

function mergeMaskCanvasAnnotations(
  currentAnnotations: ImageAnnotationItem[],
  canvasAnnotations: ImageAnnotation[],
): ImageAnnotationItem[] {
  const consumedIds = new Set<string>()
  const byId = new Map(canvasAnnotations.map((annotation) => [annotation.id, annotation]))
  const nextAnnotations = currentAnnotations
    .filter((annotation) => annotation.tool !== 'point')
    .map((annotation): ImageAnnotationItem | null => {
      const normalized = normalizePolygonWithHolesAnnotation(annotation)
      if (!normalized) return null

      const baseId = getAnnotationStableId(normalized)
      const regions: PolygonWithHolesRegion[] = normalized.segmentationMask?.regions.map((region, regionIndex) => {
        const exteriorAnnotation = byId.get(getMaskExteriorAnnotationId(baseId, regionIndex))
        if (exteriorAnnotation?.id) consumedIds.add(exteriorAnnotation.id)

        const exterior = exteriorAnnotation
          ? getPolygonPointsFromCanvasAnnotation(exteriorAnnotation)
          : []

        const holes = region.holes
          .map((hole, holeIndex) => {
            const holeAnnotation = byId.get(getMaskHoleAnnotationId(baseId, regionIndex, holeIndex))
            if (holeAnnotation?.id) consumedIds.add(holeAnnotation.id)
            return holeAnnotation ? getPolygonPointsFromCanvasAnnotation(holeAnnotation) : []
          })
          .filter((hole) => hole.length >= 3)

        return {
          exterior: normalizePolygonPoints(exterior),
          holes,
        }
      }).filter((region) => region.exterior.length >= 3) ?? []

      if (!regions.length) return null

      return {
        ...normalized,
        segmentation: regions.map((region) => pointsToFlatClosedPolygon(region.exterior)),
        segmentationMask: {
          type: 'polygon_with_holes',
          regions,
        },
      }
    })
    .filter((annotation): annotation is ImageAnnotationItem => annotation != null)

  const currentIds = new Set(nextAnnotations.map((annotation) => getAnnotationStableId(annotation)))
  canvasAnnotations.forEach((annotation) => {
    if (!annotation.id || consumedIds.has(annotation.id)) return
    if (annotation.properties?.maskParentId) return

    const backendAnnotation = toBackendAnnotation(annotation)
    if (backendAnnotation.tool !== 'polygon' || !backendAnnotation.segmentation[0]?.length) return
    if (currentIds.has(annotation.id)) return

    const normalized = normalizePolygonWithHolesAnnotation(backendAnnotation)
    if (normalized) nextAnnotations.push(normalized)
  })

  return nextAnnotations
}

export function isPolygonWithHolesSegmentation(value: unknown): value is PolygonWithHolesSegmentation {
  return !!value
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as { type?: unknown }).type === 'polygon_with_holes'
    && Array.isArray((value as { regions?: unknown }).regions)
}

function getAnnotationStableId(annotation: ImageAnnotationItem) {
  return annotation.id ?? `seg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function getMaskExteriorAnnotationId(baseId: string, regionIndex: number) {
  return regionIndex === 0 ? baseId : `${baseId}__region__${regionIndex}`
}

function getMaskHoleAnnotationId(baseId: string, regionIndex: number, holeIndex: number) {
  return `${baseId}__hole__${regionIndex}__${holeIndex}`
}

function getPolygonPointsFromCanvasAnnotation(annotation: ImageAnnotation): PolygonPoint[] {
  const selector = annotation.target.selector
  if (selector.type !== ShapeType.POLYGON || !('points' in selector.geometry)) return []

  return ((selector.geometry as { points: PolygonPoint[] }).points ?? [])
    .map(([x, y]) => [Number(x.toFixed(1)), Number(y.toFixed(1))] as PolygonPoint)
}

function normalizePolygonPoints(points: PolygonPoint[]) {
  const normalized = points
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
    .map(([x, y]) => [Number(x.toFixed(1)), Number(y.toFixed(1))] as PolygonPoint)

  if (normalized.length > 1) {
    const [firstX, firstY] = normalized[0]
    const [lastX, lastY] = normalized[normalized.length - 1]
    if (firstX === lastX && firstY === lastY) {
      return normalized.slice(0, -1)
    }
  }

  return normalized
}

function pointsToFlatClosedPolygon(points: PolygonPoint[]) {
  const flattened = normalizePolygonPoints(points).flatMap(([x, y]) => [x, y])
  if (flattened.length >= 4) {
    flattened.push(flattened[0], flattened[1])
  }
  return flattened
}

function polygonsOverlap(a: PolygonPoint[], b: PolygonPoint[]) {
  const polygonA = normalizePolygonPoints(a)
  const polygonB = normalizePolygonPoints(b)
  if (polygonA.length < 3 || polygonB.length < 3) return false

  for (let i = 0; i < polygonA.length; i += 1) {
    const a1 = polygonA[i]
    const a2 = polygonA[(i + 1) % polygonA.length]
    for (let j = 0; j < polygonB.length; j += 1) {
      const b1 = polygonB[j]
      const b2 = polygonB[(j + 1) % polygonB.length]
      if (segmentsProperlyIntersect(a1, a2, b1, b2)) return true
    }
  }

  const hasStrictInteriorPoint = polygonA.some((point) => pointInPolygon(point, polygonB) && !pointOnPolygonBoundary(point, polygonB))
    || polygonB.some((point) => pointInPolygon(point, polygonA) && !pointOnPolygonBoundary(point, polygonA))
  if (hasStrictInteriorPoint) return true

  return polygonA.every((point) => pointOnPolygonBoundary(point, polygonB))
    && polygonB.every((point) => pointOnPolygonBoundary(point, polygonA))
}

function polygonContainsPolygon(container: PolygonPoint[], target: PolygonPoint[]) {
  const containerPolygon = normalizePolygonPoints(container)
  const targetPolygon = normalizePolygonPoints(target)
  if (containerPolygon.length < 3 || targetPolygon.length < 3) return false

  for (const point of targetPolygon) {
    if (!pointInPolygon(point, containerPolygon) && !pointOnPolygonBoundary(point, containerPolygon)) {
      return false
    }
  }

  for (let i = 0; i < targetPolygon.length; i += 1) {
    const targetStart = targetPolygon[i]
    const targetEnd = targetPolygon[(i + 1) % targetPolygon.length]
    for (let j = 0; j < containerPolygon.length; j += 1) {
      const containerStart = containerPolygon[j]
      const containerEnd = containerPolygon[(j + 1) % containerPolygon.length]
      if (segmentsProperlyIntersect(targetStart, targetEnd, containerStart, containerEnd)) {
        return false
      }
    }
  }

  return true
}

function pointOnPolygonBoundary(point: PolygonPoint, polygon: PolygonPoint[]) {
  return polygon.some((current, index) => pointOnSegment(
    point,
    current,
    polygon[(index + 1) % polygon.length],
  ))
}

function segmentsProperlyIntersect(a1: PolygonPoint, a2: PolygonPoint, b1: PolygonPoint, b2: PolygonPoint) {
  const d1 = direction(a1, a2, b1)
  const d2 = direction(a1, a2, b2)
  const d3 = direction(b1, b2, a1)
  const d4 = direction(b1, b2, a2)

  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

function direction(a: PolygonPoint, b: PolygonPoint, c: PolygonPoint) {
  return Number((((c[0] - a[0]) * (b[1] - a[1])) - ((b[0] - a[0]) * (c[1] - a[1]))).toFixed(6))
}

function pointOnSegment(point: PolygonPoint, a: PolygonPoint, b: PolygonPoint) {
  return point[0] >= Math.min(a[0], b[0])
    && point[0] <= Math.max(a[0], b[0])
    && point[1] >= Math.min(a[1], b[1])
    && point[1] <= Math.max(a[1], b[1])
}

function pointInPolygon(point: PolygonPoint, polygon: PolygonPoint[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i][0]
    const yi = polygon[i][1]
    const xj = polygon[j][0]
    const yj = polygon[j][1]
    const intersects = ((yi > point[1]) !== (yj > point[1]))
      && (point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi)
    if (intersects) inside = !inside
  }
  return inside
}

function polygonArea(points: PolygonPoint[]) {
  return normalizePolygonPoints(points).reduce((sum, point, index, polygon) => {
    const next = polygon[(index + 1) % polygon.length]
    return sum + point[0] * next[1] - next[0] * point[1]
  }, 0) / 2
}

export function getPointAnnotations(annotations: ImageAnnotationItem[]) {
  return annotations.filter((annotation) => annotation.tool === 'point')
}

export function replacePointAnnotations(
  annotations: ImageAnnotationItem[],
  pointAnnotations: ImageAnnotationItem[],
) {
  const canvasAnnotations = annotations.filter((annotation) => annotation.tool !== 'point')
  return [...canvasAnnotations, ...pointAnnotations]
}

export function buildAnnotationBodies(annotationId: string, classId: number, labels: string[]) {
  if (!isValidSegmentationClassId(labels, classId)) return []
  const label = getLabelName(labels, classId)

  return [
    {
      id: `${annotationId}-body-class`,
      annotation: annotationId,
      purpose: 'tagging',
      value: label,
    },
    {
      id: `${annotationId}-body-class-id`,
      annotation: annotationId,
      purpose: 'classifying',
      value: String(classId),
    },
  ]
}

export function getClassIdFromAnnotation(annotation: ImageAnnotation) {
  const propertyClassId = Number(annotation.properties?.classId)
  if (Number.isFinite(propertyClassId)) return propertyClassId

  const classIdBody = annotation.bodies.find((body) => body.purpose === 'classifying')
  const classId = Number(classIdBody?.value)
  return Number.isFinite(classId) ? classId : -1
}

export function createIndexedLabels(classIds: number[]) {
  const labels: string[] = []
  classIds.forEach((classId) => {
    labels[classId] = ''
  })
  return labels
}

export function toSegmentationLabelOptions(labels: string[]): SegmentationLabelOption[] {
  return labels.reduce<SegmentationLabelOption[]>((result, label, index) => {
    if (!label) return result
    result.push({
      label,
      value: index,
      color: getAnnotationColor(index),
    })
    return result
  }, [])
}

export function isValidSegmentationClassId(labels: string[], classId: number) {
  return Number.isInteger(classId) && classId >= 0 && typeof labels[classId] === 'string' && labels[classId].trim() !== ''
}

export function toClassificationLabelOptions(labels: string[]) {
  return labels.reduce<Array<{ label: string, value: string }>>((result, label, index) => {
    if (!label) return result
    result.push({
      label,
      value: String(index),
    })
    return result
  }, [])
}

/** 与 toClassificationLabelOptions 一致：仅保留当前标签列表中存在的 class_id（非空标签名、有效下标） */
export function filterClassificationClassIdsByLabels(labels: string[], classIds: number[] | undefined): number[] {
  if (!classIds?.length) return []
  return classIds.filter(
    (id) => Number.isInteger(id) && id >= 0 && typeof labels[id] === 'string' && labels[id].trim() !== '',
  )
}

export function filterEntitySpansByLabels(labels: string[], spans: EntitySpanItem[] | undefined): EntitySpanItem[] {
  if (!spans?.length) return []
  const validLabels = new Set(labels.filter((label) => typeof label === 'string' && label.trim() !== ''))
  if (!validLabels.size) return []
  return spans.filter((span) => validLabels.has(span.label))
}

export function getDefaultSegmentationClassId(labels: string[]) {
  const firstOption = toSegmentationLabelOptions(labels)[0]
  return firstOption?.value ?? 1
}

export function getNextSegmentationClassId(labels: string[]) {
  const options = toSegmentationLabelOptions(labels)
  const maxClassId = Math.max(0, ...options.map((option) => option.value))
  return maxClassId + 1
}

export function getLabelName(labels: string[], classId: number) {
  return labels[classId] ?? labels[classId - 1] ?? ''
}

function hslToHex(h: number, s: number, l: number) {
  const normalizedH = ((h % 360) + 360) % 360
  const normalizedS = Math.min(100, Math.max(0, s)) / 100
  const normalizedL = Math.min(100, Math.max(0, l)) / 100

  const chroma = (1 - Math.abs(2 * normalizedL - 1)) * normalizedS
  const segment = normalizedH / 60
  const second = chroma * (1 - Math.abs((segment % 2) - 1))
  const match = normalizedL - chroma / 2

  let red = 0
  let green = 0
  let blue = 0

  if (segment >= 0 && segment < 1) {
    red = chroma
    green = second
  }
  else if (segment >= 1 && segment < 2) {
    red = second
    green = chroma
  }
  else if (segment >= 2 && segment < 3) {
    green = chroma
    blue = second
  }
  else if (segment >= 3 && segment < 4) {
    green = second
    blue = chroma
  }
  else if (segment >= 4 && segment < 5) {
    red = second
    blue = chroma
  }
  else {
    red = chroma
    blue = second
  }

  const toHex = (value: number) => Math.round((value + match) * 255).toString(16).padStart(2, '0')
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`
}

function buildPredictConfigNodes(
  labels: string[],
  render: (label: string, index: number) => string,
) {
  let displayIndex = 1

  return labels
    .map((label) => {
      if (!label) return ''
      const node = render(label, displayIndex)
      displayIndex += 1
      return node
    })
    .filter(Boolean)
    .join('')
}

export function buildPredictLabelConfig(labels: string[], toName = 'image', fromName = 'label') {
  const labelNodes = buildPredictConfigNodes(
    labels,
    (label, index) => `<Label value="${escapeXml(label)}" index="${index}"/>`,
  )

  return `<View><Image name="${toName}" value="$${toName}"/><PolygonLabels name="${fromName}" toName="${toName}">${labelNodes}</PolygonLabels></View>`
}

export function buildRectanglePredictLabelConfig(
  labels: string[],
  options: {
    toName?: string
    fromName?: string
    valueKey?: string
  } = {},
) {
  const {
    toName = 'image',
    fromName = 'label',
    valueKey = toName,
  } = options
  const labelNodes = buildPredictConfigNodes(
    labels,
    (label, index) => `<Label value="${escapeXml(label)}" index="${index}"/>`,
  )

  return `<View><Image name="${toName}" value="$${valueKey}"/><RectangleLabels name="${fromName}" toName="${toName}">${labelNodes}</RectangleLabels></View>`
}

export function buildChoicesPredictLabelConfig(
  labels: string[],
  options: {
    toName?: string
    fromName?: string
    choiceMode?: 'single' | 'multiple'
    objectTag?: 'Image' | 'Text'
    valueKey?: string
  } = {},
) {
  const {
    toName = 'image',
    fromName = 'category',
    choiceMode = 'single',
    objectTag = 'Image',
    valueKey = toName,
  } = options
  const choiceNodes = buildPredictConfigNodes(
    labels,
    (label, index) => `<Choice value="${escapeXml(label)}" index="${index}"/>`,
  )

  return `<View><${objectTag} name="${toName}" value="$${valueKey}"/><Choices name="${fromName}" toName="${toName}" choice="${choiceMode}">${choiceNodes}</Choices></View>`
}

export function buildTextEntityPredictLabelConfig(
  labels: string[],
  options: {
    toName?: string
    fromName?: string
    valueKey?: string
  } = {},
) {
  const {
    toName = 'text',
    fromName = 'label',
    valueKey = 'text',
  } = options
  const labelNodes = buildPredictConfigNodes(
    labels,
    (label, index) => `<Label value="${escapeXml(label)}" index="${index}"/>`,
  )

  return `<View><Text name="${toName}" value="$${valueKey}"/><Labels name="${fromName}" toName="${toName}">${labelNodes}</Labels></View>`
}

export function predictResponseToSegmentationAnnotations(
  response: PredictResponse | undefined,
  labels: string[],
  fallbackWidth?: number,
  fallbackHeight?: number,
) {
  const resolvedLabels = mergePredictLabels(response, labels)
  const results = response?.results ?? []
  const annotations = results.flatMap((group, groupIndex) => (
    (group.result ?? []).reduce<ImageAnnotationItem[]>((annotations, item, itemIndex) => {
      const annotation = toPredictNativeSegmentationAnnotation(
        item,
        resolvedLabels,
        groupIndex,
        itemIndex,
      ) ?? toPredictAnnotation(
        item,
        resolvedLabels,
        fallbackWidth,
        fallbackHeight,
        groupIndex,
        itemIndex,
      )

      if (annotation) annotations.push(annotation)
      return annotations
    }, [])
  ))

  return {
    annotations,
    labels: resolvedLabels,
  }
}

export function predictResponseToRectangleAnnotations(
  response: PredictResponse | undefined,
  labels: string[],
  fallbackWidth?: number,
  fallbackHeight?: number,
) {
  const resolvedLabels = mergePredictRectangleLabels(response, labels)
  const annotations = (response?.results ?? []).flatMap((group, groupIndex) => (
    (group.result ?? []).reduce<ImageAnnotationItem[]>((result, item, itemIndex) => {
      const annotation = toPredictRectangleAnnotation(
        item,
        resolvedLabels,
        fallbackWidth,
        fallbackHeight,
        groupIndex,
        itemIndex,
      )
      if (annotation) result.push(annotation)
      return result
    }, [])
  ))

  return {
    annotations,
    labels: resolvedLabels,
  }
}

export function predictResponseToChoiceSelection(
  response: PredictResponse | undefined,
  labels: string[],
) {
  const resolvedLabels = mergePredictChoiceLabels(response, labels)
  const selectedClassIds = Array.from(new Set(
    (response?.results ?? []).flatMap((group) => (
      (group.result ?? []).flatMap((item) => toPredictChoiceValues(item))
    )),
  ))
    .map((labelName) => resolvedLabels.findIndex((label) => label === labelName))
    .filter((classId) => classId >= 0)

  return {
    selectedClassIds,
    labels: resolvedLabels,
  }
}

export function predictResponseToEntitySpans(
  response: PredictResponse | undefined,
  labels: string[],
  text: string,
) {
  const resolvedLabels = mergePredictEntityLabels(response, labels)
  const entitySpans = (response?.results ?? []).flatMap((group) => (
    (group.result ?? []).reduce<EntitySpanItem[]>((result, item) => {
      const span = toPredictEntitySpan(item, text, resolvedLabels)
      if (span) result.push(span)
      return result
    }, [])
  ))
    .sort((a, b) => a.offset[0] - b.offset[0] || a.offset[1] - b.offset[1])

  return {
    entitySpans,
    labels: resolvedLabels,
  }
}

export function renderAnnotationGeometrySummary(annotation: ImageAnnotationItem) {
  if (annotation.segmentationMask) {
    const regionCount = annotation.segmentationMask.regions.length
    const holeCount = annotation.segmentationMask.regions.reduce((count, region) => count + region.holes.length, 0)
    return `掩码: ${regionCount} 个连通区域，${holeCount} 个孔洞`
  }

  if (annotation.tool === 'rectangle' && annotation.rectangle) {
    const { x, y, w, h } = annotation.rectangle
    return `矩形: x=${x.toFixed(1)}, y=${y.toFixed(1)}, w=${w.toFixed(1)}, h=${h.toFixed(1)}`
  }

  if (annotation.tool === 'point' && annotation.point) {
    const [x, y] = annotation.point
    return annotation.pointShape === 'rectangle'
      ? `小矩形中心: (${x.toFixed(1)}, ${y.toFixed(1)})`
      : `点坐标: (${x.toFixed(1)}, ${y.toFixed(1)})`
  }

  if (annotation.tool === 'line' && annotation.line) {
    const [[x1, y1], [x2, y2]] = annotation.line
    const length = Math.hypot(x2 - x1, y2 - y1)
    return `线段长度: ${length.toFixed(1)} px`
  }

  return `点数量: ${Math.max((annotation.segmentation[0]?.length ?? 0) / 2 - 1, 0)}`
}

export function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '')
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized
  if (!/^[\da-f]{6}$/i.test(value)) return `rgba(37, 99, 235, ${alpha})`

  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export function eventToImagePoint(
  event: MouseEvent,
  stageElement: HTMLDivElement,
  imageElement: HTMLImageElement,
  item: OnlineAnnotationPageItem,
): [number, number] | null {
  const imageBox = getRenderedImageBox(stageElement, imageElement, item)
  if (!imageBox) return null

  const rect = stageElement.getBoundingClientRect()
  const relativeX = event.clientX - rect.left - imageBox.offsetX
  const relativeY = event.clientY - rect.top - imageBox.offsetY

  if (relativeX < 0 || relativeY < 0 || relativeX > imageBox.renderedWidth || relativeY > imageBox.renderedHeight) {
    return null
  }

  const x = Number(((relativeX / imageBox.renderedWidth) * imageBox.naturalWidth).toFixed(1))
  const y = Number(((relativeY / imageBox.renderedHeight) * imageBox.naturalHeight).toFixed(1))
  return [x, y]
}

export function viewerEventToImagePoint(
  event: MouseEvent | PointerEvent,
  viewer: OpenSeadragon.Viewer,
  item: OnlineAnnotationPageItem,
): [number, number] | null {
  const imageBox = getRenderedImageBoxFromViewer(viewer, item)
  if (!imageBox) return null

  const rect = viewer.element.getBoundingClientRect()
  const localX = event.clientX - rect.left
  const localY = event.clientY - rect.top

  if (
    localX < imageBox.offsetX
    || localY < imageBox.offsetY
    || localX > imageBox.offsetX + imageBox.renderedWidth
    || localY > imageBox.offsetY + imageBox.renderedHeight
  ) {
    return null
  }

  const point = viewer.viewport.viewerElementToImageCoordinates(
    new OpenSeadragon.Point(localX, localY),
  )

  return [
    Number(point.x.toFixed(1)),
    Number(point.y.toFixed(1)),
  ]
}

export function getRenderedImageBox(
  stageElement: HTMLDivElement,
  imageElement: HTMLImageElement,
  item: OnlineAnnotationPageItem,
): RenderedImageBox | null {
  const rect = stageElement.getBoundingClientRect()
  const naturalWidth = item.imageWidth ?? imageElement.naturalWidth ?? imageFallbackSize.width
  const naturalHeight = item.imageHeight ?? imageElement.naturalHeight ?? imageFallbackSize.height
  if (!rect.width || !rect.height || !naturalWidth || !naturalHeight) return null

  const imageRatio = naturalWidth / naturalHeight
  const rectRatio = rect.width / rect.height

  let renderedWidth = rect.width
  let renderedHeight = rect.height
  let offsetX = 0
  let offsetY = 0

  if (imageRatio > rectRatio) {
    renderedHeight = rect.width / imageRatio
    offsetY = (rect.height - renderedHeight) / 2
  }
  else {
    renderedWidth = rect.height * imageRatio
    offsetX = (rect.width - renderedWidth) / 2
  }

  return {
    naturalWidth,
    naturalHeight,
    renderedWidth,
    renderedHeight,
    offsetX,
    offsetY,
  }
}

export function getRenderedImageBoxFromViewer(
  viewer: OpenSeadragon.Viewer,
  item: OnlineAnnotationPageItem,
): RenderedImageBox | null {
  if (!viewer.element || !viewer.viewport) return null

  const tiledImageSize = viewer.world.getItemCount() > 0
    ? viewer.world.getItemAt(0)?.getContentSize?.()
    : null
  const naturalWidth = item.imageWidth ?? tiledImageSize?.x ?? imageFallbackSize.width
  const naturalHeight = item.imageHeight ?? tiledImageSize?.y ?? imageFallbackSize.height
  if (!naturalWidth || !naturalHeight) return null

  const topLeft = viewer.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(0, 0))
  const bottomRight = viewer.viewport.imageToViewerElementCoordinates(
    new OpenSeadragon.Point(naturalWidth, naturalHeight),
  )

  const renderedWidth = bottomRight.x - topLeft.x
  const renderedHeight = bottomRight.y - topLeft.y

  return {
    naturalWidth,
    naturalHeight,
    renderedWidth,
    renderedHeight,
    offsetX: topLeft.x,
    offsetY: topLeft.y,
  }
}

export function renderKindName(kind: AnnotationKind) {
  if (kind === 'text-classification') return '文本分类'
  if (kind === 'entity-recognition') return '实体识别'
  if (kind === 'image-classification') return '图像分类'
  if (kind === 'object-detection') return '物体检测'
  return '图像分割'
}

export function toBackendAnnotation(annotation: ImageAnnotation): ImageAnnotationItem {
  const selector = annotation.target.selector
  if (selector.type === ShapeType.RECTANGLE && 'x' in selector.geometry) {
    const geometry = selector.geometry as unknown as {
      x: number
      y: number
      w: number
      h: number
    }

    return {
      id: annotation.id,
      tool: 'rectangle',
      class_id: getClassIdFromAnnotation(annotation),
      segmentation: [],
      rectangle: {
        x: Number(geometry.x.toFixed(1)),
        y: Number(geometry.y.toFixed(1)),
        w: Number(geometry.w.toFixed(1)),
        h: Number(geometry.h.toFixed(1)),
      },
    }
  }

  if (selector.type === ShapeType.LINE && 'points' in selector.geometry) {
    const points = (selector.geometry as { points: [[number, number], [number, number]] }).points

    return {
      id: annotation.id,
      tool: 'line',
      class_id: getClassIdFromAnnotation(annotation),
      segmentation: [],
      line: points.map(([x, y]) => [Number(x.toFixed(1)), Number(y.toFixed(1))]) as [[number, number], [number, number]],
    }
  }

  const polygon = selector.type === ShapeType.POLYGON && 'points' in selector.geometry
    ? (selector.geometry as { points: [number, number][] }).points
    : []

  const flattened = polygon.flatMap(([x, y]) => [Number(x.toFixed(1)), Number(y.toFixed(1))])
  const isClosed = flattened.length >= 4
    && flattened[0] === flattened[flattened.length - 2]
    && flattened[1] === flattened[flattened.length - 1]

  return {
    id: annotation.id,
    tool: 'polygon',
    class_id: getClassIdFromAnnotation(annotation),
    segmentation: [isClosed ? flattened : [...flattened, flattened[0], flattened[1]]],
  }
}

function toPolygonPoints(segmentation: number[]) {
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

function toRectangleShape(segmentation: number[]) {
  const points = toPolygonPoints(segmentation)
  if (points.length !== 4) return null

  const xs = Array.from(new Set(points.map(([x]) => x))).sort((a, b) => a - b)
  const ys = Array.from(new Set(points.map(([, y]) => y))).sort((a, b) => a - b)
  if (xs.length !== 2 || ys.length !== 2) return null

  const corners = new Set(points.map(([x, y]) => `${x},${y}`))
  const expectedCorners = [
    `${xs[0]},${ys[0]}`,
    `${xs[1]},${ys[0]}`,
    `${xs[1]},${ys[1]}`,
    `${xs[0]},${ys[1]}`,
  ]

  if (!expectedCorners.every((corner) => corners.has(corner))) return null

  return {
    x: xs[0],
    y: ys[0],
    w: xs[1] - xs[0],
    h: ys[1] - ys[0],
  }
}

function toBounds(points: Array<[number, number]>) {
  if (!points.length) {
    return {
      minX: 0,
      minY: 0,
      maxX: imageFallbackSize.width,
      maxY: imageFallbackSize.height,
    }
  }

  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)

  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  }
}

function toPredictAnnotation(
  item: PredictResultItem,
  labels: string[],
  fallbackWidth?: number,
  fallbackHeight?: number,
  groupIndex = 0,
  itemIndex = 0,
) {
  const rawPoints = item.value?.points ?? []
  if (!rawPoints.length) return null

  const width = item.original_width ?? fallbackWidth
  const height = item.original_height ?? fallbackHeight
  if (!width || !height) return null

  const labelName = item.value?.polygonlabels?.[0]
  const classId = labels.findIndex((label) => label === labelName)
  if (classId < 0) return null

  const segmentation = rawPoints.flatMap(([xPercent, yPercent]) => ([
    Number(((xPercent / 100) * width).toFixed(1)),
    Number(((yPercent / 100) * height).toFixed(1)),
  ]))

  if (segmentation.length < 2) return null

  const pointCount = segmentation.length / 2
  const isClosed = (item.value?.closed ?? true) && pointCount > 2
  if (!item.value?.closed && pointCount >= 4) {
    return toPredictRectanglePointAnnotation(segmentation, classId, groupIndex * 1000 + itemIndex)
  }

  if (isClosed) {
    segmentation.push(segmentation[0], segmentation[1])
  }

  return normalizeImageAnnotation(
    {
      class_id: classId,
      segmentation: [segmentation],
    },
    groupIndex * 1000 + itemIndex,
  )
}

function resolvePredictNativeClassId(item: PredictResultItem, labels: string[]) {
  if (typeof item.class_id === 'number' && Number.isInteger(item.class_id) && item.class_id >= 0) {
    return item.class_id
  }

  const labelName = item.category_name?.trim()
  if (!labelName) return -1
  return labels.findIndex((label) => label === labelName)
}

function toPredictNativeSegmentationAnnotation(
  item: PredictResultItem,
  labels: string[],
  groupIndex = 0,
  itemIndex = 0,
): ImageAnnotationItem | null {
  if (!item.segmentation && !item.bbox) return null

  const classId = resolvePredictNativeClassId(item, labels)
  if (classId < 0) return null

  const annotation = normalizeImageAnnotation(
    {
      id: item.id,
      class_id: classId,
      segmentation: item.segmentation,
      bbox: item.bbox,
    },
    groupIndex * 1000 + itemIndex,
  )

  if (annotation.segmentationMask?.regions.length) return annotation
  if (annotation.segmentation.some((polygon) => polygon.length >= 6)) return annotation
  if (annotation.rectangle) return annotation
  return null
}

function toPredictRectanglePointAnnotation(segmentation: number[], classId: number, index: number): ImageAnnotationItem | null {
  const rectangle = toRectangleShape(segmentation)
  if (!rectangle) return null

  return {
    id: `point-${index + 1}`,
    class_id: classId,
    tool: 'point',
    pointShape: 'rectangle',
    pointRectangle: {
      w: Number(rectangle.w.toFixed(1)),
      h: Number(rectangle.h.toFixed(1)),
    },
    segmentation: [],
    point: [
      Number((rectangle.x + rectangle.w / 2).toFixed(1)),
      Number((rectangle.y + rectangle.h / 2).toFixed(1)),
    ],
  }
}

function toPointRectangle(annotation: ImageAnnotationItem) {
  const [x, y] = annotation.point ?? [0, 0]
  const width = annotation.pointRectangle?.w ?? quickRectangleSubmitSize.w
  const height = annotation.pointRectangle?.h ?? quickRectangleSubmitSize.h

  return {
    x: Number((x - width / 2).toFixed(1)),
    y: Number((y - height / 2).toFixed(1)),
    w: Number(width.toFixed(1)),
    h: Number(height.toFixed(1)),
  }
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function mergePredictLabels(response: PredictResponse | undefined, labels: string[]) {
  const nextLabels = [...labels]
  const usedClassIds = new Set(
    nextLabels
      .map((label, index) => (label ? index : null))
      .filter((value): value is number => value != null),
  )

  ;(response?.results ?? []).forEach((group) => {
    ;(group.result ?? []).forEach((item) => {
      const nativeLabelName = item.category_name?.trim()
      if (nativeLabelName) {
        const nativeClassId = item.class_id
        if (
          typeof nativeClassId === 'number'
          && Number.isInteger(nativeClassId)
          && nativeClassId >= 0
        ) {
          if (!nextLabels[nativeClassId]) {
            nextLabels[nativeClassId] = nativeLabelName
            usedClassIds.add(nativeClassId)
          }
          return
        }

        if (!nextLabels.includes(nativeLabelName)) {
          let classId = 0
          while (usedClassIds.has(classId)) classId += 1
          nextLabels[classId] = nativeLabelName
          usedClassIds.add(classId)
        }
        return
      }

      const labelName = item.value?.polygonlabels?.[0]?.trim()
      if (!labelName) return
      if (nextLabels.includes(labelName)) return

      let classId = 0
      while (usedClassIds.has(classId)) classId += 1
      nextLabels[classId] = labelName
      usedClassIds.add(classId)
    })
  })

  return nextLabels
}

function mergePredictChoiceLabels(response: PredictResponse | undefined, labels: string[]) {
  const nextLabels = [...labels]
  const usedClassIds = new Set(
    nextLabels
      .map((label, index) => (label ? index : null))
      .filter((value): value is number => value != null),
  )

  ;(response?.results ?? []).forEach((group) => {
    ;(group.result ?? []).forEach((item) => {
      toPredictChoiceValues(item).forEach((labelName) => {
        if (nextLabels.includes(labelName)) return

        let classId = 0
        while (usedClassIds.has(classId)) classId += 1
        nextLabels[classId] = labelName
        usedClassIds.add(classId)
      })
    })
  })

  return nextLabels
}

function mergePredictEntityLabels(response: PredictResponse | undefined, labels: string[]) {
  const nextLabels = [...labels]
  const usedClassIds = new Set(
    nextLabels
      .map((label, index) => (label ? index : null))
      .filter((value): value is number => value != null),
  )

  ;(response?.results ?? []).forEach((group) => {
    ;(group.result ?? []).forEach((item) => {
      const labelName = item.value?.labels?.[0]?.trim()
      if (!labelName) return
      if (/^\d+$/.test(labelName)) {
        const index = Number(labelName)
        if (Number.isFinite(index) && index >= 0 && index < nextLabels.length && nextLabels[index]) {
          return
        }
      }
      if (nextLabels.includes(labelName)) return

      let classId = 0
      while (usedClassIds.has(classId)) classId += 1
      nextLabels[classId] = labelName
      usedClassIds.add(classId)
    })
  })

  return nextLabels
}

function mergePredictRectangleLabels(response: PredictResponse | undefined, labels: string[]) {
  const nextLabels = [...labels]
  const usedClassIds = new Set(
    nextLabels
      .map((label, index) => (label ? index : null))
      .filter((value): value is number => value != null),
  )

  ;(response?.results ?? []).forEach((group) => {
    ;(group.result ?? []).forEach((item) => {
      const labelName = item.value?.rectanglelabels?.[0]?.trim()
      if (!labelName || nextLabels.includes(labelName)) return

      let classId = 0
      while (usedClassIds.has(classId)) classId += 1
      nextLabels[classId] = labelName
      usedClassIds.add(classId)
    })
  })

  return nextLabels
}

function toPredictChoiceValues(item: PredictResultItem) {
  const rawChoices = item.value?.choices
  if (Array.isArray(rawChoices)) {
    return rawChoices
      .map((choice) => choice?.trim())
      .filter((choice): choice is string => !!choice)
  }
  if (typeof rawChoices === 'string' && rawChoices.trim()) {
    return [rawChoices.trim()]
  }
  return []
}

function toPredictEntitySpan(
  item: PredictResultItem,
  fallbackText: string,
  labels: string[],
): EntitySpanItem | null {
  const start = item.value?.start
  const end = item.value?.end
  const rawLabel = item.value?.labels?.[0]?.trim()
  if (typeof start !== 'number' || typeof end !== 'number' || !rawLabel || end <= start) return null

  const label = resolveEntityTagToLabel(rawLabel, labels)
  const text = item.value?.text?.trim() || fallbackText.slice(start, end)
  return {
    offset: [start, end],
    text,
    label,
  }
}

function toPredictRectangleAnnotation(
  item: PredictResultItem,
  labels: string[],
  fallbackWidth?: number,
  fallbackHeight?: number,
  groupIndex = 0,
  itemIndex = 0,
): ImageAnnotationItem | null {
  const width = item.original_width ?? fallbackWidth
  const height = item.original_height ?? fallbackHeight
  const xPercent = item.value?.x
  const yPercent = item.value?.y
  const widthPercent = item.value?.width
  const heightPercent = item.value?.height
  const labelName = item.value?.rectanglelabels?.[0]?.trim()

  if (
    !width
    || !height
    || typeof xPercent !== 'number'
    || typeof yPercent !== 'number'
    || typeof widthPercent !== 'number'
    || typeof heightPercent !== 'number'
    || !labelName
  ) {
    return null
  }

  const classId = labels.findIndex((label) => label === labelName)
  if (classId < 0) return null

  const x1 = Number(((xPercent / 100) * width).toFixed(1))
  const y1 = Number(((yPercent / 100) * height).toFixed(1))
  const rectWidth = Number(((widthPercent / 100) * width).toFixed(1))
  const rectHeight = Number(((heightPercent / 100) * height).toFixed(1))
  const x2 = Number((x1 + rectWidth).toFixed(1))
  const y2 = Number((y1 + rectHeight).toFixed(1))

  return {
    id: item.id || `rect-${groupIndex * 1000 + itemIndex + 1}`,
    class_id: classId,
    tool: 'rectangle',
    segmentation: [],
    rectangle: {
      x: x1,
      y: y1,
      w: Number((x2 - x1).toFixed(1)),
      h: Number((y2 - y1).toFixed(1)),
    },
  }
}
