import React from 'react'
import { getAnnotationColor } from '../MachineAnnotation/components/onlineAnnotationDetail/utils'
import type { Annotation } from '@/services/machineLearnModel'

const BASE_TEXT_LINE_HEIGHT = 32
const UNDERLINE_BASE_OFFSET = 4
const UNDERLINE_TRACK_GAP = 4
const UNDERLINE_TRACK_HEIGHT = 2
const MIN_UNDERLINE_AREA_HEIGHT = 8

interface EntityDisplaySpan {
  start: number
  end: number
  tagKey: string
  label: string
}

/**
 * 渲染实体识别文本：按 offset 分段，实体区间使用多色分层下划线，并在实体末尾展示同色标签。
 * annotations[].tag 为 label_schema 的 key（如 "0"），展示名通过 labelSchema 映射。
 */
export function renderEntityRecognitionText(
  content: string,
  annotations: Annotation[],
  labelSchema?: Record<string, string>,
): React.ReactNode {
  if (!content)
    return <span className="text-gray-400">-</span>
  if (!Array.isArray(annotations) || annotations.length === 0) {
    return content
  }

  const spans = normalizeEntitySpans(content, annotations, labelSchema)
  if (!spans.length) {
    return (
      <div className="max-w-[1000px] whitespace-pre-wrap break-words">
        {content}
      </div>
    )
  }

  const spansByIndex = new Map<number, EntityDisplaySpan[]>()
  const annotationGroups = getAnnotationGroups(spans, labelSchema)
  const underlineAreaHeight = getUnderlineAreaHeight(
    annotationGroups.reduce((maxCount, group) => Math.max(maxCount, group.labels.length), 0),
  )
  const segmentBoundaries = new Set<number>([0, content.length])

  spans.forEach((span) => {
    segmentBoundaries.add(span.start)
    segmentBoundaries.add(span.end)
    for (let index = span.start; index < span.end; index += 1) {
      const current = spansByIndex.get(index) ?? []
      current.push(span)
      spansByIndex.set(index, current)
    }
  })

  const segments = Array.from(segmentBoundaries)
    .filter((index) => index >= 0 && index <= content.length)
    .sort((a, b) => a - b)
    .reduce<Array<{ start: number, end: number }>>((result, boundary, index, boundaries) => {
      const nextBoundary = boundaries[index + 1]
      if (nextBoundary != null && nextBoundary > boundary) {
        result.push({ start: boundary, end: nextBoundary })
      }
      return result
    }, [])

  return (
    <div
      className="max-w-[1000px] whitespace-pre-wrap break-words"
      style={{ lineHeight: `${BASE_TEXT_LINE_HEIGHT + underlineAreaHeight}px` }}
    >
      {segments.map(({ start, end }) => {
        const segmentText = content.slice(start, end)
        const containingSpans = (spansByIndex.get(start) ?? [])
          .slice()
          .sort((a, b) => {
            const lengthDiff = (a.end - a.start) - (b.end - b.start)
            if (lengthDiff !== 0) return lengthDiff
            if (a.start !== b.start) return a.start - b.start
            return getLabelOrder(a.tagKey, labelSchema) - getLabelOrder(b.tagKey, labelSchema)
          })
        const groupLabels = getSegmentGroupLabels(start, annotationGroups)
        const underlineStyle = containingSpans.length
          ? getStackedUnderlineStyle(containingSpans, labelSchema, groupLabels, underlineAreaHeight)
          : undefined
        const endingSpans = containingSpans.filter((span) => span.end === end)

        return (
          <React.Fragment key={`${start}-${end}`}>
            <span
              className={containingSpans.length ? 'rounded-sm' : undefined}
              style={underlineStyle}
              title={containingSpans.map((span) => span.label).join(' / ') || undefined}
            >
              {segmentText}
            </span>
            {endingSpans.map((span) => {
              const color = getLabelColor(span.tagKey, labelSchema)
              return (
                <span
                  key={`${span.start}-${span.end}-${span.tagKey}`}
                  className="mx-1 inline-block select-none rounded px-2 py-0 align-middle text-[12px]"
                  style={{
                    lineHeight: '20px',
                    color,
                    background: `${color}1A`,
                    border: `1px solid ${color}52`,
                  }}
                >
                  {span.label}
                </span>
              )
            })}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function normalizeEntitySpans(
  content: string,
  annotations: Annotation[],
  labelSchema?: Record<string, string>,
): EntityDisplaySpan[] {
  return annotations
    .map((annotation) => {
      const [rawStart, rawEnd] = annotation.offset ?? []
      const start = Math.max(0, Number(rawStart))
      const end = Math.min(content.length, Number(rawEnd))
      const tagKey = annotation.tag != null && annotation.tag !== '' ? String(annotation.tag) : ''

      return {
        start,
        end,
        tagKey,
        label: tagKey ? (labelSchema?.[tagKey] ?? tagKey) : '',
      }
    })
    .filter((span) => (
      Number.isFinite(span.start)
      && Number.isFinite(span.end)
      && span.end > span.start
      && Boolean(span.label)
    ))
    .sort((a, b) => a.start - b.start || a.end - b.end || getLabelOrder(a.tagKey, labelSchema) - getLabelOrder(b.tagKey, labelSchema))
}

function getStackedUnderlineStyle(
  spans: EntityDisplaySpan[],
  labelSchema: Record<string, string> | undefined,
  groupLabels: string[],
  underlineAreaHeight: number,
): React.CSSProperties {
  const uniqueLabels = getSortedUniqueLabels(spans, labelSchema)
  const labelColors = uniqueLabels.map((label) => getLabelColor(label, labelSchema))
  const layers = labelColors.map((color) => `linear-gradient(${color}, ${color})`)
  const layerOffsets = uniqueLabels.map((label) => `${UNDERLINE_BASE_OFFSET + Math.max(0, groupLabels.indexOf(label)) * UNDERLINE_TRACK_GAP}px`)

  return {
    backgroundImage: layers.join(', '),
    backgroundRepeat: 'no-repeat',
    backgroundSize: uniqueLabels.map(() => `100% ${UNDERLINE_TRACK_HEIGHT}px`).join(', '),
    backgroundPosition: layerOffsets.map((offset) => `0 calc(100% - ${offset})`).join(', '),
    paddingBottom: underlineAreaHeight,
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
  }
}

function getAnnotationGroups(spans: EntityDisplaySpan[], labelSchema?: Record<string, string>) {
  const groups: Array<{ start: number, end: number, spans: EntityDisplaySpan[], labels: string[] }> = []

  spans.forEach((span) => {
    const previousGroup = groups[groups.length - 1]
    if (previousGroup && span.start < previousGroup.end) {
      previousGroup.end = Math.max(previousGroup.end, span.end)
      previousGroup.spans.push(span)
      previousGroup.labels = getSortedUniqueLabels(previousGroup.spans, labelSchema)
      return
    }

    groups.push({
      start: span.start,
      end: span.end,
      spans: [span],
      labels: getSortedUniqueLabels([span], labelSchema),
    })
  })

  return groups
}

function getSegmentGroupLabels(
  index: number,
  groups: Array<{ start: number, end: number, labels: string[] }>,
) {
  return groups.find((group) => index >= group.start && index < group.end)?.labels ?? []
}

function getSortedUniqueLabels(spans: EntityDisplaySpan[], labelSchema?: Record<string, string>) {
  return Array.from(new Set(spans.map((span) => span.tagKey)))
    .sort((a, b) => getLabelOrder(a, labelSchema) - getLabelOrder(b, labelSchema))
}

function getLabelColor(tagKey: string, labelSchema?: Record<string, string>) {
  if (/^\d+$/.test(tagKey)) return getAnnotationColor(Number(tagKey))
  return getAnnotationColor(getLabelOrder(tagKey, labelSchema))
}

function getLabelOrder(tagKey: string, labelSchema?: Record<string, string>) {
  const schemaKeys = Object.keys(labelSchema ?? {})
  const schemaIndex = schemaKeys.findIndex((key) => key === tagKey)
  if (schemaIndex >= 0) return schemaIndex
  if (/^\d+$/.test(tagKey)) return Number(tagKey)
  return schemaKeys.length + hashString(tagKey)
}

function getUnderlineAreaHeight(labelCount: number) {
  if (labelCount <= 0) return MIN_UNDERLINE_AREA_HEIGHT
  return Math.max(
    MIN_UNDERLINE_AREA_HEIGHT,
    UNDERLINE_BASE_OFFSET + (labelCount - 1) * UNDERLINE_TRACK_GAP + UNDERLINE_TRACK_HEIGHT + 2,
  )
}

function hashString(value: string) {
  return Array.from(value).reduce((hash, char) => (
    (hash * 31 + char.charCodeAt(0)) % 997
  ), 0)
}
