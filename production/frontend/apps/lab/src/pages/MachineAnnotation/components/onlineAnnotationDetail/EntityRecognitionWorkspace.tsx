import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Tag, Typography, message } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import type { EntitySpanItem, OnlineAnnotationPageItem } from '../../types'
import { getAnnotationColor } from './utils'

const { Text } = Typography
const BASE_TEXT_LINE_HEIGHT = 32
const UNDERLINE_BASE_OFFSET = 4
const UNDERLINE_TRACK_GAP = 4
const UNDERLINE_TRACK_HEIGHT = 2
const MIN_UNDERLINE_AREA_HEIGHT = 8

interface EntityRecognitionWorkspaceProps {
  item: OnlineAnnotationPageItem
  labels: string[]
  spans: EntitySpanItem[]
  readOnly?: boolean
  onChange: (spans: EntitySpanItem[]) => void
}

interface TextSelectionRange {
  start: number
  end: number
  text: string
}

interface AnnotationGroup {
  start: number
  end: number
  spans: EntitySpanItem[]
  spanTracks: Map<string, number>
  trackCount: number
}

function EntityRecognitionWorkspace({
  item,
  labels,
  spans,
  readOnly = false,
  onChange,
}: EntityRecognitionWorkspaceProps) {
  const textContainerRef = useRef<HTMLDivElement | null>(null)
  const [pendingSelection, setPendingSelection] = useState<TextSelectionRange | null>(null)
  const [selectedSpanKey, setSelectedSpanKey] = useState<string | null>(null)
  const text = item.text || ''

  const sortedSpans = useMemo(
    () => [...spans].sort((a, b) => a.offset[0] - b.offset[0] || a.offset[1] - b.offset[1]),
    [spans],
  )

  useEffect(() => {
    setPendingSelection(null)
    setSelectedSpanKey(null)
  }, [item.id])

  const getCurrentTextSelection = (): TextSelectionRange | null => {
    const container = textContainerRef.current
    const selection = window.getSelection()
    if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null
    }

    const range = selection.getRangeAt(0)
    if (!container.contains(range.commonAncestorContainer)) {
      return null
    }

    const selectionRange = getTextSelectionRange(range, text)
    if (!selectionRange) return null

    return selectionRange
  }

  const applyLabel = (label: string) => {
    if (readOnly) return
    const selectedSpan = selectedSpanKey
      ? sortedSpans.find((span) => getSpanKey(span) === selectedSpanKey)
      : null
    const selectionRange = getCurrentTextSelection()
      ?? pendingSelection
      ?? (selectedSpan ? getTextRangeFromSpan(selectedSpan) : null)

    if (!selectionRange) {
      message.warning('请先选中文本或已有实体')
      return
    }

    const duplicatedSpan = sortedSpans.some((span) => (
      span.offset[0] === selectionRange.start
      && span.offset[1] === selectionRange.end
      && span.label === label
    ))
    if (duplicatedSpan) {
      message.warning('相同范围和标签的实体已存在')
      return
    }

    const nextSpan: EntitySpanItem = {
      offset: [selectionRange.start, selectionRange.end],
      text: selectionRange.text,
      label,
    }
    const nextSpans = [...sortedSpans, nextSpan]
      .sort((a, b) => a.offset[0] - b.offset[0] || a.offset[1] - b.offset[1])
    onChange(nextSpans)
    setPendingSelection(null)
    setSelectedSpanKey(getSpanKey(nextSpan))
    window.getSelection()?.removeAllRanges()
  }

  const removeSelectedSpan = () => {
    if (readOnly) return
    if (!selectedSpanKey) {
      message.warning('请先选中实体')
      return
    }

    onChange(sortedSpans.filter((span) => getSpanKey(span) !== selectedSpanKey))
    setSelectedSpanKey(null)
  }

  const handleMouseUp = () => {
    if (readOnly) return
    queueMicrotask(() => {
      const container = textContainerRef.current
      const selection = window.getSelection()
      if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setPendingSelection(null)
        return
      }

      const range = selection.getRangeAt(0)
      if (!container.contains(range.commonAncestorContainer)) {
        setPendingSelection(null)
        return
      }

      const start = getSelectionOffset(range.startContainer, range.startOffset)
      const end = getSelectionOffset(range.endContainer, range.endOffset)
      const selectionRange = getTextSelectionRange(range, text)
      if (!selectionRange || start == null || end == null) {
        setPendingSelection(null)
        return
      }

      setSelectedSpanKey(null)
      setPendingSelection(selectionRange)
    })
  }

  if (!text) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-[#edf0f5] bg-white">
        <Text type="secondary">当前数据缺少文本内容</Text>
      </div>
    )
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_300px] gap-4">
      <Card bordered={false} className="min-h-0 rounded-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <Text strong className="text-[14px] text-[#1f2937]">文本实体识别</Text>
            <div className="mt-1 text-xs text-[#6b7280]">
              {readOnly ? '当前为只读模式，仅支持查看标注结果' : '先选中文本，再点击右侧标签完成标注'}
            </div>
          </div>
          {!readOnly && selectedSpanKey && (
            <Button danger icon={<DeleteOutlined />} onClick={removeSelectedSpan}>
              删除实体
            </Button>
          )}
        </div>

        <div
          ref={textContainerRef}
          className="rounded-xl border border-[#e5edf6] bg-[#fbfcfe] p-5 text-[15px] leading-8 text-[#1f2937]"
          onMouseUp={handleMouseUp}
        >
          <AnnotatedText
            text={text}
            spans={sortedSpans}
            labels={labels}
            selectedSpanKey={selectedSpanKey}
            onSelectSpan={(span) => {
              setPendingSelection(null)
              setSelectedSpanKey(getSpanKey(span))
              window.getSelection()?.removeAllRanges()
            }}
          />
        </div>

        <div className="mt-4 rounded-xl border border-[#e5edf6] bg-white p-4">
          <div className="mb-3 text-sm font-medium text-[#1f2937]">当前选择</div>
          {pendingSelection
            ? (
                <div className="space-y-2 text-sm text-[#4b5563]">
                  <div>{`文本: ${pendingSelection.text}`}</div>
                  <div>{`范围: [${pendingSelection.start}, ${pendingSelection.end}]`}</div>
                </div>
              )
            : selectedSpanKey
              ? (
                  sortedSpans
                    .filter((span) => getSpanKey(span) === selectedSpanKey)
                    .map((span) => (
                      <div key={getSpanKey(span)} className="space-y-2 text-sm text-[#4b5563]">
                        <div>{`文本: ${span.text}`}</div>
                        <div>{`标签: ${span.label}`}</div>
                        <div>{`范围: [${span.offset[0]}, ${span.offset[1]}]`}</div>
                      </div>
                    ))
                )
              : <Text type="secondary">未选中文本</Text>}
        </div>
      </Card>

      <Card
        bordered={false}
        className="min-h-0 rounded-xl"
        styles={{ body: { height: '100%' } }}
        classNames={{ body: 'flex h-full min-h-0 flex-col' }}
      >
        <div className="mb-3 shrink-0">
          <Text strong className="text-[14px] text-[#1f2937]">可用标签</Text>
        </div>
        <div className="shrink-0 flex flex-wrap gap-2">
          {labels.filter(Boolean).map((label) => (
            <Button
              key={label}
              type="default"
              className="!h-auto !rounded-full !px-3 !py-1"
              disabled={readOnly}
              onClick={() => applyLabel(label)}
            >
              <span
                className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: getLabelColor(label, labels) }}
              />
              {label}
            </Button>
          ))}
        </div>

        <div className="mt-6 flex min-h-0 flex-1 flex-col overflow-hidden">
          <Text strong className="shrink-0 text-[14px] text-[#1f2937]">已标注实体</Text>
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="space-y-3">
              {sortedSpans.length
                ? sortedSpans.map((span) => {
                    const isActive = getSpanKey(span) === selectedSpanKey

                    return (
                      <button
                        key={getSpanKey(span)}
                        type="button"
                        className={`w-full rounded-xl border px-3 py-3 text-left transition ${isActive ? 'border-[#3b82f6] bg-[#eff6ff]' : 'border-[#e5edf6] bg-white'}`}
                        onClick={() => {
                          setPendingSelection(null)
                          setSelectedSpanKey(getSpanKey(span))
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-[#1f2937]">{span.text}</span>
                          <Tag color={getLabelColor(span.label, labels)}>{span.label}</Tag>
                        </div>
                        <div className="mt-1 text-xs text-[#6b7280]">{`[${span.offset[0]}, ${span.offset[1]}]`}</div>
                      </button>
                    )
                  })
                : <Text type="secondary">暂无实体标注</Text>}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

function AnnotatedText({
  text,
  spans,
  labels,
  selectedSpanKey,
  onSelectSpan,
}: {
  text: string
  spans: EntitySpanItem[]
  labels: string[]
  selectedSpanKey: string | null
  onSelectSpan: (span: EntitySpanItem) => void
}) {
  const spansByIndex = new Map<number, EntitySpanItem[]>()
  const annotationGroups = getAnnotationGroups(spans, labels)
  const underlineAreaHeight = getUnderlineAreaHeight(
    annotationGroups.reduce((maxCount, group) => Math.max(maxCount, group.trackCount), 0),
  )
  const segmentBoundaries = new Set<number>([0, text.length])

  spans.forEach((span) => {
    segmentBoundaries.add(span.offset[0])
    segmentBoundaries.add(span.offset[1])
    for (let index = span.offset[0]; index < span.offset[1]; index += 1) {
      const current = spansByIndex.get(index) ?? []
      current.push(span)
      spansByIndex.set(index, current)
    }
  })

  const segments = Array.from(segmentBoundaries)
    .filter((index) => index >= 0 && index <= text.length)
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
      className="whitespace-pre-wrap break-words"
      style={{ lineHeight: `${BASE_TEXT_LINE_HEIGHT + underlineAreaHeight}px` }}
    >
      {segments.map(({ start, end }) => {
        const segmentText = text.slice(start, end)
        const containingSpans = (spansByIndex.get(start) ?? [])
          .slice()
          .sort((a, b) => {
            const lengthDiff = (a.offset[1] - a.offset[0]) - (b.offset[1] - b.offset[0])
            if (lengthDiff !== 0) return lengthDiff
            if (a.offset[0] !== b.offset[0]) return a.offset[0] - b.offset[0]
            return a.label.localeCompare(b.label)
          })
        const activeSpan = containingSpans.find((span) => getSpanKey(span) === selectedSpanKey) ?? null
        const displaySpan = activeSpan ?? containingSpans[0] ?? null
        const annotationGroup = getSegmentAnnotationGroup(start, annotationGroups)
        const underlineStyle = displaySpan ? getStackedUnderlineStyle(containingSpans, labels, annotationGroup, underlineAreaHeight, Boolean(activeSpan)) : undefined
        const labelTitle = containingSpans.map((span) => span.label).join(' / ')
        const endingSpans = containingSpans.filter((span) => span.offset[1] === end)
        const handleSegmentClick = displaySpan
          ? () => {
              const selection = window.getSelection()
              if (selection && !selection.isCollapsed) return
              onSelectSpan(displaySpan)
            }
          : undefined

        return (
          <React.Fragment key={`${start}-${end}`}>
            <span
              data-char-index={start}
              data-char-end={end}
              className={displaySpan
                ? `cursor-pointer rounded-sm ${activeSpan ? 'bg-[#dbeafe]' : 'bg-transparent hover:bg-[#f8fafc]'}`
                : ''}
              style={underlineStyle}
              title={labelTitle || undefined}
              onClick={handleSegmentClick}
            >
              {segmentText}
            </span>
            {endingSpans.map((span) => {
              const spanKey = getSpanKey(span)
              const isActive = spanKey === selectedSpanKey
              const color = getLabelColor(span.label, labels)

              return (
                <Tag
                  key={spanKey}
                  className={`mx-1 select-none rounded px-2 py-0 align-middle ${isActive ? '!font-medium' : ''}`}
                  color={color}
                  onClick={() => {
                    const selection = window.getSelection()
                    if (selection && !selection.isCollapsed) return
                    onSelectSpan(span)
                  }}
                >
                  {span.label}
                </Tag>
              )
            })}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function getStackedUnderlineStyle(
  spans: EntitySpanItem[],
  labels: string[],
  annotationGroup: AnnotationGroup | null,
  underlineAreaHeight: number,
  active: boolean,
): React.CSSProperties {
  const orderedSpans = spans
    .slice()
    .sort((a, b) => getSpanTrack(a, annotationGroup) - getSpanTrack(b, annotationGroup))
  const layers = orderedSpans.map((span) => {
    const color = getLabelColor(span.label, labels)
    return `linear-gradient(${color}, ${color})`
  })
  const layerOffsets = orderedSpans.map((span) => (
    `${UNDERLINE_BASE_OFFSET + getSpanTrack(span, annotationGroup) * UNDERLINE_TRACK_GAP}px`
  ))

  return {
    backgroundImage: layers.join(', '),
    backgroundRepeat: 'no-repeat',
    backgroundSize: orderedSpans.map(() => `100% ${UNDERLINE_TRACK_HEIGHT}px`).join(', '),
    backgroundPosition: layerOffsets.map((offset) => `0 calc(100% - ${offset})`).join(', '),
    paddingBottom: underlineAreaHeight,
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
    fontWeight: active ? 600 : undefined,
  }
}

function getAnnotationGroups(spans: EntitySpanItem[], labels: string[]) {
  const groups: AnnotationGroup[] = []

  spans.forEach((span) => {
    const previousGroup = groups[groups.length - 1]
    if (previousGroup && span.offset[0] < previousGroup.end) {
      previousGroup.end = Math.max(previousGroup.end, span.offset[1])
      previousGroup.spans.push(span)
      updateGroupTracks(previousGroup, labels)
      return
    }

    const nextGroup: AnnotationGroup = {
      start: span.offset[0],
      end: span.offset[1],
      spans: [span],
      spanTracks: new Map(),
      trackCount: 0,
    }
    updateGroupTracks(nextGroup, labels)
    groups.push(nextGroup)
  })

  return groups
}

function getSegmentAnnotationGroup(
  index: number,
  groups: AnnotationGroup[],
) {
  return groups.find((group) => index >= group.start && index < group.end) ?? null
}

function updateGroupTracks(group: AnnotationGroup, labels: string[]) {
  const trackEnds: number[] = []
  const spanTracks = new Map<string, number>()

  group.spans
    .slice()
    .sort((a, b) => {
      if (a.offset[0] !== b.offset[0]) return a.offset[0] - b.offset[0]
      if (a.offset[1] !== b.offset[1]) return a.offset[1] - b.offset[1]
      return getLabelOrder(a.label, labels) - getLabelOrder(b.label, labels)
    })
    .forEach((span) => {
      const availableTrack = trackEnds.findIndex((trackEnd) => trackEnd <= span.offset[0])
      const trackIndex = availableTrack >= 0 ? availableTrack : trackEnds.length
      trackEnds[trackIndex] = span.offset[1]
      spanTracks.set(getSpanKey(span), trackIndex)
    })

  group.spanTracks = spanTracks
  group.trackCount = Math.max(1, trackEnds.length)
}

function getSpanTrack(span: EntitySpanItem, annotationGroup: AnnotationGroup | null) {
  return annotationGroup?.spanTracks.get(getSpanKey(span)) ?? 0
}

function getUnderlineAreaHeight(labelCount: number) {
  if (labelCount <= 0) return MIN_UNDERLINE_AREA_HEIGHT
  return Math.max(
    MIN_UNDERLINE_AREA_HEIGHT,
    UNDERLINE_BASE_OFFSET + (labelCount - 1) * UNDERLINE_TRACK_GAP + UNDERLINE_TRACK_HEIGHT + 2,
  )
}

function getLabelColor(label: string, labels: string[]) {
  const labelIndex = labels.findIndex((item) => item === label)
  if (labelIndex >= 0) return getAnnotationColor(labelIndex)
  return getAnnotationColor(labels.length + hashString(label))
}

function getLabelOrder(label: string, labels: string[]) {
  const labelIndex = labels.findIndex((item) => item === label)
  if (labelIndex >= 0) return labelIndex
  return labels.length + hashString(label)
}

function hashString(value: string) {
  return Array.from(value).reduce((hash, char) => (
    (hash * 31 + char.charCodeAt(0)) % 997
  ), 0)
}

function getTextSelectionRange(range: Range, text: string): TextSelectionRange | null {
  const start = getSelectionOffset(range.startContainer, range.startOffset)
  const end = getSelectionOffset(range.endContainer, range.endOffset)
  if (start == null || end == null || start === end) return null

  const normalizedStart = Math.min(start, end)
  const normalizedEnd = Math.max(start, end)
  const selectedText = text.slice(normalizedStart, normalizedEnd)
  if (!selectedText.trim()) return null

  return {
    start: normalizedStart,
    end: normalizedEnd,
    text: selectedText,
  }
}

function getTextRangeFromSpan(span: EntitySpanItem): TextSelectionRange {
  return {
    start: span.offset[0],
    end: span.offset[1],
    text: span.text,
  }
}

function getSelectionOffset(node: Node, offset: number): number | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement?.closest('[data-char-index][data-char-end]')
    if (!parent) return getNearestTextBoundaryOffset(node)
    const index = Number(parent.getAttribute('data-char-index'))
    const end = Number(parent.getAttribute('data-char-end'))
    if (!Number.isFinite(index)) return null
    if (!Number.isFinite(end)) return null
    return Math.min(index + offset, end)
  }

  if (node instanceof Element) {
    for (let index = offset; index < node.childNodes.length; index += 1) {
      const boundaryOffset = getNodeBoundaryOffset(node.childNodes[index], 'start')
      if (boundaryOffset != null) return boundaryOffset
    }

    for (let index = offset - 1; index >= 0; index -= 1) {
      const boundaryOffset = getNodeBoundaryOffset(node.childNodes[index], 'end')
      if (boundaryOffset != null) return boundaryOffset
    }

    return getNearestTextBoundaryOffset(node)
  }

  return null
}

function getNearestTextBoundaryOffset(node: Node): number | null {
  let current: Node | null = node

  while (current?.parentNode) {
    const parent = current.parentNode
    const children = Array.from(parent.childNodes)
    const currentIndex = children.findIndex((child) => child === current)

    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      const boundaryOffset = getNodeBoundaryOffset(children[index], 'end')
      if (boundaryOffset != null) return boundaryOffset
    }

    for (let index = currentIndex + 1; index < children.length; index += 1) {
      const boundaryOffset = getNodeBoundaryOffset(children[index], 'start')
      if (boundaryOffset != null) return boundaryOffset
    }

    current = parent
  }

  return null
}

function getNodeBoundaryOffset(node: Node, edge: 'start' | 'end'): number | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement?.closest('[data-char-index][data-char-end]')
    if (!parent) return null
    const value = Number(parent.getAttribute(edge === 'start' ? 'data-char-index' : 'data-char-end'))
    return Number.isFinite(value) ? value : null
  }

  if (node instanceof Element) {
    if (node.matches('[data-char-index][data-char-end]')) {
      const value = Number(node.getAttribute(edge === 'start' ? 'data-char-index' : 'data-char-end'))
      return Number.isFinite(value) ? value : null
    }

    const children = Array.from(node.childNodes)
    const orderedChildren = edge === 'start' ? children : children.reverse()
    for (const child of orderedChildren) {
      const boundaryOffset = getNodeBoundaryOffset(child, edge)
      if (boundaryOffset != null) return boundaryOffset
    }
  }

  return null
}

function getSpanKey(span: EntitySpanItem) {
  return `${span.offset[0]}-${span.offset[1]}-${span.label}`
}

export default EntityRecognitionWorkspace
