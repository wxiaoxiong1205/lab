import React, { useMemo, useState } from 'react'
import { EyeOutlined } from '@ant-design/icons'
import { Image, Modal, Tag, Typography } from 'antd'
import { getAnnotationColor, hexToRgba } from '../../MachineAnnotation/components/onlineAnnotationDetail/utils'

export interface ImageAnnotationShape {
  type: 'polygon' | 'rectangle' | 'polygon-with-holes'
  points: Array<[number, number]>
  holes?: Array<Array<[number, number]>>
}

export interface ImageAnnotationDisplayItem {
  classId: number
  shapes: ImageAnnotationShape[]
}

interface ImageAnnotationPreviewProps {
  imageUrl: string
  annotations: ImageAnnotationDisplayItem[]
  legendClassIds?: number[]
  labelSchema: Record<string, string>
  imageWidth?: number
  imageHeight?: number
  thumbnailWidth?: number
  thumbnailHeight?: number
}

const previewImageStyle: React.CSSProperties = {
  objectFit: 'cover',
  borderRadius: 6,
  background: '#fafafa',
}

function getLabelName(classId: number, labelSchema: Record<string, string>) {
  return labelSchema[String(classId)] ?? `class_${classId}`
}

function getAnnotationLabels(annotations: ImageAnnotationDisplayItem[]): number[] {
  return Array.from(new Set(
    annotations
      .map((annotation) => annotation.classId)
      .filter((classId) => Number.isFinite(classId)),
  )).sort((a, b) => a - b)
}

function AnnotationLegend({
  classIds,
  labelSchema,
}: {
  classIds: number[]
  labelSchema: Record<string, string>
}) {
  if (!classIds.length) return <Typography.Text type="secondary">暂无标注</Typography.Text>

  return (
    <div className="flex flex-wrap gap-2">
      {classIds.map((classId) => (
        <Tag
          key={classId}
          style={{
            marginInlineEnd: 0,
            borderColor: hexToRgba(getAnnotationColor(classId), 0.32),
            color: getAnnotationColor(classId),
            background: hexToRgba(getAnnotationColor(classId), 0.1),
          }}
        >
          {getLabelName(classId, labelSchema)}
        </Tag>
      ))}
    </div>
  )
}

function toSvgPath(points: Array<[number, number]>) {
  if (!points.length) return ''
  return points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`)
    .join(' ')
    .concat(' Z')
}

function ImageAnnotationPreviewModal({
  open,
  onClose,
  imageUrl,
  annotations,
  legendClassIds,
  imageWidth,
  imageHeight,
  labelSchema,
}: ImageAnnotationPreviewProps & { open: boolean, onClose: () => void }) {
  const width = imageWidth || 1280
  const height = imageHeight || 720
  const classIds = useMemo(() => (
    legendClassIds !== undefined
      ? legendClassIds
      : getAnnotationLabels(annotations)
  ), [annotations, legendClassIds])

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={1100}
      title="图片标注预览"
      destroyOnClose
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-[#edf0f5] bg-[#f8fafc] p-3">
          <div className="relative mx-auto max-h-[70vh] overflow-hidden rounded-lg bg-[#111827]">
            <img
              src={imageUrl}
              alt="annotation-preview"
              className="block max-h-[70vh] w-full object-contain"
            />
            <svg
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="xMidYMid meet"
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              {annotations.map((annotation) => {
                const color = getAnnotationColor(annotation.classId)
                return annotation.shapes.map((shape) => {
                  if (!shape.points.length) return null

                  const pointString = shape.points.map(([x, y]) => `${x},${y}`).join(' ')
                  const shapeKey = `${annotation.classId}-${shape.type}-${pointString}`
                  if (shape.type === 'polygon-with-holes') {
                    const path = [
                      toSvgPath(shape.points),
                      ...(shape.holes ?? []).map(toSvgPath),
                    ].join(' ')

                    return (
                      <path
                        key={shapeKey}
                        d={path}
                        fill={hexToRgba(color, 0.18)}
                        fillRule="evenodd"
                        clipRule="evenodd"
                        stroke={color}
                        strokeWidth={2}
                      />
                    )
                  }

                  return (
                    <g key={shapeKey}>
                      <polygon
                        points={pointString}
                        fill={hexToRgba(color, 0.18)}
                        stroke={color}
                        strokeWidth={2}
                      />
                    </g>
                  )
                })
              })}
            </svg>
          </div>
        </div>

        <div className="rounded-lg border border-[#edf0f5] bg-white p-3">
          <Typography.Text strong>标签图例</Typography.Text>
          <div className="mt-3">
            <AnnotationLegend classIds={classIds} labelSchema={labelSchema} />
          </div>
        </div>
      </div>
    </Modal>
  )
}

function ImageAnnotationPreview({
  imageUrl,
  annotations,
  legendClassIds,
  labelSchema,
  imageWidth,
  imageHeight,
  thumbnailWidth = 140,
  thumbnailHeight = 90,
}: ImageAnnotationPreviewProps) {
  const [open, setOpen] = useState(false)

  if (!imageUrl) return <Typography.Text type="secondary">-</Typography.Text>

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative overflow-hidden rounded-lg border border-[#e5e7eb] bg-white p-0"
      >
        <Image
          src={imageUrl}
          preview={false}
          width={thumbnailWidth}
          height={thumbnailHeight}
          style={previewImageStyle}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-white transition group-hover:bg-black/35">
          <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-xs opacity-0 transition group-hover:opacity-100">
            <EyeOutlined />
            查看标注
          </span>
        </div>
      </button>

      <ImageAnnotationPreviewModal
        open={open}
        onClose={() => setOpen(false)}
        imageUrl={imageUrl}
        annotations={annotations}
        legendClassIds={legendClassIds}
        labelSchema={labelSchema}
        imageWidth={imageWidth}
        imageHeight={imageHeight}
        thumbnailWidth={thumbnailWidth}
        thumbnailHeight={thumbnailHeight}
      />
    </>
  )
}

export function AnnotationTags({
  classIds,
  labelSchema,
}: {
  classIds: number[]
  labelSchema: Record<string, string>
}) {
  if (!classIds.length) return <Typography.Text type="secondary">-</Typography.Text>
  return <AnnotationLegend classIds={classIds} labelSchema={labelSchema} />
}

export default ImageAnnotationPreview
