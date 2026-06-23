import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Annotorious,
  type AnnotoriousOpenSeadragonAnnotator,
  type ImageAnnotation,
  OpenSeadragonAnnotator,
  OpenSeadragonViewer,
  Origin,
  ShapeType,
  useAnnotator,
} from '@annotorious/react'
import type OpenSeadragon from 'openseadragon'
import {
  Card,
  Select,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  AimOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  BorderOutlined,
  DeleteOutlined,
  DragOutlined,
  EditOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  GatewayOutlined,
  LineOutlined,
  MinusOutlined,
  NodeIndexOutlined,
  OneToOneOutlined,
  PlusOutlined,
  StopOutlined,
} from '@ant-design/icons'
import type {
  ImageAnnotationItem,
  MaskPartSelection,
  OnlineAnnotationPageItem,
} from '../../types'
import type { RenderedImageBox, SegmentationLabelOption } from './types'
import {
  buildAnnotationBodies,
  getAnnotationColor,
  getLabelName,
  getPointAnnotations,
  getPolygonWithHolesValidationError,
  hexToRgba,
  isValidSegmentationClassId,
  pointMarkerHeight,
  pointMarkerWidth,
  quickRectangleSubmitSize,
  removePolygonWithHolesPart,
  renderAnnotationGeometrySummary,
  replacePointAnnotations,
  toSegmentationLabelOptions,
} from './utils'
import {
  useAnnotatorAnnotationsSync,
  useAnnotatorDrawingSync,
  useAnnotatorEvents,
  useAnnotatorSetup,
  useAnnotatorStyle,
  useImageBoxSync,
  usePointToolInteractions,
  useSyncAnnotationsRef,
} from './hooks/useAnnotoriousCanvasEffects'

export type SegmentationDrawingTool = 'polygon' | 'line' | 'point' | 'rectangle' | 'quick-rectangle' | 'hole' | 'region'

function SegmentationWorkspace({
  item,
  annotations,
  labels,
  readOnly = false,
  polygonWithHoles = false,
  drawingTool,
  onDrawingToolChange,
  onChange,
}: {
  item: OnlineAnnotationPageItem
  annotations: ImageAnnotationItem[]
  labels: string[]
  readOnly?: boolean
  polygonWithHoles?: boolean
  drawingTool: SegmentationDrawingTool
  onDrawingToolChange: (tool: SegmentationDrawingTool) => void
  onChange: (annotations: ImageAnnotationItem[]) => void
}) {
  const annotoriousRef = useRef<AnnotoriousOpenSeadragonAnnotator<ImageAnnotation, ImageAnnotation> | null>(null)
  const workspaceRootRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null)
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(annotations[0]?.id ?? null)
  const [drawingEnabled, setDrawingEnabled] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [viewerState, setViewerState] = useState({
    zoomPercent: 100,
    canZoomOut: false,
    canZoomIn: true,
    canReset: false,
  })
  const [pointHistoryState, setPointHistoryState] = useState({ index: 0, length: 1 })
  const [annotatorHistoryState, setAnnotatorHistoryState] = useState({ canUndo: false, canRedo: false })
  const [pendingLabelAnnotationId, setPendingLabelAnnotationId] = useState<string | null>(null)
  const [pendingQuickRectanglePoint, setPendingQuickRectanglePoint] = useState<[number, number] | null>(null)
  const [quickRectangleClickGuardUntil, setQuickRectangleClickGuardUntil] = useState(0)
  const [maskEditTargetId, setMaskEditTargetId] = useState<string | null>(null)
  const [selectedMaskPart, setSelectedMaskPart] = useState<MaskPartSelection | null>(null)
  const [maskHistoryState, setMaskHistoryState] = useState({ index: 0, length: 1 })
  const pointHistoryRef = useRef<ImageAnnotationItem[][]>([getPointAnnotations(annotations)])
  const pointHistoryIndexRef = useRef(0)
  const maskHistoryRef = useRef<ImageAnnotationItem[][]>([annotations])
  const maskHistoryIndexRef = useRef(0)
  const maskHistoryDirtyRef = useRef(false)
  const latestAnnotationsRef = useRef<ImageAnnotationItem[]>(annotations)
  const suppressNextCreatedPickerRef = useRef(false)
  const selectedAnnotation = annotations.find((annotation) => annotation.id === selectedAnnotationId) ?? null
  const labelOptions = useMemo(() => toSegmentationLabelOptions(labels), [labels])
  const selectedAnnotationClassId = useMemo(() => {
    if (selectedMaskPart?.part === 'hole') return undefined
    if (!selectedAnnotation) return undefined
    return isValidSegmentationClassId(labels, selectedAnnotation.class_id)
      ? selectedAnnotation.class_id
      : undefined
  }, [labels, selectedAnnotation, selectedMaskPart])

  const syncPointHistoryState = useCallback((index: number, length: number) => {
    pointHistoryIndexRef.current = index
    setPointHistoryState((prev) => (
      prev.index === index && prev.length === length ? prev : { index, length }
    ))
  }, [])

  const refreshAnnotatorHistoryState = useCallback(() => {
    const annotator = annotoriousRef.current
    const nextState = {
      canUndo: annotator?.canUndo?.() ?? false,
      canRedo: annotator?.canRedo?.() ?? false,
    }
    setAnnotatorHistoryState((prev) => (
      prev.canUndo === nextState.canUndo && prev.canRedo === nextState.canRedo
        ? prev
        : nextState
    ))
  }, [])

  const syncMaskHistoryState = useCallback((index: number, length: number) => {
    maskHistoryIndexRef.current = index
    setMaskHistoryState((prev) => (
      prev.index === index && prev.length === length ? prev : { index, length }
    ))
  }, [])

  const pushMaskHistory = useCallback((nextAnnotations: ImageAnnotationItem[]) => {
    const currentSnapshot = maskHistoryRef.current[maskHistoryIndexRef.current] ?? []
    if (JSON.stringify(currentSnapshot) === JSON.stringify(nextAnnotations)) return

    const nextHistory = maskHistoryRef.current
      .slice(0, maskHistoryIndexRef.current + 1)
      .concat([nextAnnotations])
    maskHistoryRef.current = nextHistory
    maskHistoryDirtyRef.current = true
    syncMaskHistoryState(nextHistory.length - 1, nextHistory.length)
  }, [syncMaskHistoryState])

  const emitAnnotationsChange = useCallback((nextAnnotations: ImageAnnotationItem[], options?: { skipHistory?: boolean }) => {
    if (polygonWithHoles) {
      const validationError = getPolygonWithHolesValidationError(nextAnnotations)
      if (validationError) {
        message.warning(validationError)
        onChange(latestAnnotationsRef.current)
        return
      }

      if (!options?.skipHistory) {
        pushMaskHistory(nextAnnotations)
      }
    }

    onChange(nextAnnotations)
  }, [onChange, polygonWithHoles, pushMaskHistory])

  const pushPointHistory = useCallback((nextAnnotations: ImageAnnotationItem[]) => {
    const nextPointAnnotations = getPointAnnotations(nextAnnotations)
    const currentSnapshot = pointHistoryRef.current[pointHistoryIndexRef.current] ?? []
    if (JSON.stringify(currentSnapshot) === JSON.stringify(nextPointAnnotations)) return

    const nextHistory = pointHistoryRef.current
      .slice(0, pointHistoryIndexRef.current + 1)
      .concat([nextPointAnnotations])
    pointHistoryRef.current = nextHistory
    syncPointHistoryState(nextHistory.length - 1, nextHistory.length)
  }, [syncPointHistoryState])

  const handlePointHistoryChange = useCallback((
    nextAnnotations: ImageAnnotationItem[],
    previousPointAnnotations?: ImageAnnotationItem[],
  ) => {
    if (!previousPointAnnotations) return

    const nextPointAnnotations = getPointAnnotations(nextAnnotations)
    if (JSON.stringify(previousPointAnnotations) === JSON.stringify(nextPointAnnotations)) return

    const nextHistory = pointHistoryRef.current
      .slice(0, pointHistoryIndexRef.current + 1)
      .concat([nextPointAnnotations])
    pointHistoryRef.current = nextHistory
    syncPointHistoryState(nextHistory.length - 1, nextHistory.length)
  }, [syncPointHistoryState])

  useEffect(() => {
    setSelectedAnnotationId((current) => {
      if (current && annotations.some((annotation) => annotation.id === current)) return current
      return annotations[0]?.id ?? null
    })
    setSelectedMaskPart((current) => {
      if (!current) return null
      const target = annotations.find((annotation) => annotation.id === current.parentId)
      const region = target?.segmentationMask?.regions[current.regionIndex]
      if (!region) return null
      if (current.part === 'hole' && current.holeIndex != null && !region.holes[current.holeIndex]) return null
      return current
    })
  }, [annotations])

  useEffect(() => {
    latestAnnotationsRef.current = annotations
  }, [annotations])

  useEffect(() => {
    setSelectedMaskPart((current) => {
      if (!current || current.parentId === selectedAnnotationId) return current
      return null
    })
  }, [selectedAnnotationId])

  useEffect(() => {
    setDrawingEnabled(true)
    setViewerState({
      zoomPercent: 100,
      canZoomOut: false,
      canZoomIn: true,
      canReset: false,
    })
    setPendingLabelAnnotationId(null)
    setPendingQuickRectanglePoint(null)
    setQuickRectangleClickGuardUntil(0)
    setMaskEditTargetId(null)
    setSelectedMaskPart(null)
    maskHistoryDirtyRef.current = false
  }, [item.id])

  // Reset point-tool history only when switching to a different page item.
  // Keeping annotations out of the deps avoids wiping undo state after each edit.
  useEffect(() => {
    pointHistoryRef.current = [getPointAnnotations(latestAnnotationsRef.current)]
    syncPointHistoryState(0, 1)
  }, [item.id, syncPointHistoryState])

  useEffect(() => {
    maskHistoryRef.current = [latestAnnotationsRef.current]
    syncMaskHistoryState(0, 1)
  }, [item.id, syncMaskHistoryState])

  useEffect(() => {
    if (!polygonWithHoles || maskHistoryDirtyRef.current) return
    const initialSnapshot = maskHistoryRef.current[0] ?? []
    if (JSON.stringify(initialSnapshot) === JSON.stringify(annotations)) return

    maskHistoryRef.current = [annotations]
    syncMaskHistoryState(0, 1)
  }, [annotations, polygonWithHoles, syncMaskHistoryState])

  useEffect(() => {
    if (!pendingLabelAnnotationId) return
    if (pendingQuickRectanglePoint && pendingLabelAnnotationId === 'quick-rectangle-pending') return
    if (!annotations.some((annotation) => annotation.id === pendingLabelAnnotationId)) {
      setPendingLabelAnnotationId(null)
    }
  }, [annotations, pendingLabelAnnotationId, pendingQuickRectanglePoint])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === workspaceRootRef.current)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    message.config({
      getContainer: () => (
        isFullscreen && workspaceRootRef.current
          ? workspaceRootRef.current
          : document.body
      ),
    })

    return () => {
      message.config({ getContainer: () => document.body })
    }
  }, [isFullscreen])

  const handleStartDrawing = () => {
    if (readOnly) return
    if (drawingTool === 'point' || drawingTool === 'quick-rectangle') {
      setDrawingEnabled(true)
      return
    }

    const annotator = annotoriousRef.current
    if (!annotator) {
      message.warning('标注器初始化中，请稍后再试')
      return
    }

    if (drawingTool === 'region' && !selectedAnnotationId) {
      message.warning('请先选中一个实例')
      return
    }
    if (drawingTool === 'hole' || drawingTool === 'region') {
      setMaskEditTargetId(selectedAnnotationId)
    }

    annotator.setDrawingTool((drawingTool === 'hole' || drawingTool === 'region') ? 'polygon' : drawingTool)
    annotator.setDrawingEnabled(true)
    setDrawingEnabled(true)
  }

  const handleCancelDrawing = () => {
    if (readOnly) return
    if (drawingTool === 'point' || drawingTool === 'quick-rectangle') {
      setPendingQuickRectanglePoint(null)
      setPendingLabelAnnotationId(null)
      setDrawingEnabled(false)
      return
    }

    const annotator = annotoriousRef.current
    if (!annotator) return

    annotator.cancelDrawing()
    annotator.setDrawingEnabled(false)
    setDrawingEnabled(false)
  }

  const handleDeleteSelected = () => {
    if (readOnly) return
    if (!selectedAnnotationId) return
    if (selectedAnnotation?.tool === 'point') {
      const nextAnnotations = annotations.filter((annotation) => annotation.id !== selectedAnnotationId)
      pushPointHistory(nextAnnotations)
      emitAnnotationsChange(nextAnnotations)
      setSelectedAnnotationId(null)
      return
    }

    if (polygonWithHoles) {
      const activeMaskPart = selectedMaskPart?.parentId === selectedAnnotationId ? selectedMaskPart : null
      const nextAnnotations = activeMaskPart
        ? removePolygonWithHolesPart(annotations, activeMaskPart)
        : annotations.filter((annotation) => annotation.id !== selectedAnnotationId)
      emitAnnotationsChange(nextAnnotations)
      setSelectedAnnotationId(null)
      setSelectedMaskPart(null)
      refreshAnnotatorHistoryState()
      return
    }

    const annotator = annotoriousRef.current
    if (!annotator) return

    annotator.removeAnnotation(selectedAnnotationId)
    setSelectedAnnotationId(null)
    refreshAnnotatorHistoryState()
  }

  const handleUndo = () => {
    if (readOnly) return
    if (polygonWithHoles) {
      if (maskHistoryIndexRef.current <= 0) return
      const nextIndex = maskHistoryIndexRef.current - 1
      syncMaskHistoryState(nextIndex, maskHistoryRef.current.length)
      setSelectedAnnotationId(null)
      setSelectedMaskPart(null)
      emitAnnotationsChange(maskHistoryRef.current[nextIndex] ?? [], { skipHistory: true })
      return
    }

    const annotator = annotoriousRef.current
    if (
      pointHistoryIndexRef.current > 0
      && (
        selectedAnnotation?.tool === 'point'
        || drawingTool === 'point'
        || !(annotator?.canUndo?.() ?? false)
      )
    ) {
      const nextIndex = pointHistoryIndexRef.current - 1
      syncPointHistoryState(nextIndex, pointHistoryRef.current.length)
      setSelectedAnnotationId(null)
      emitAnnotationsChange(replacePointAnnotations(annotations, pointHistoryRef.current[nextIndex] ?? []))
      return
    }

    if (!annotator?.canUndo?.()) return
    annotator.undo()
    setSelectedAnnotationId(null)
    refreshAnnotatorHistoryState()
  }

  const handleRedo = () => {
    if (readOnly) return
    if (polygonWithHoles) {
      if (maskHistoryIndexRef.current >= maskHistoryRef.current.length - 1) return
      const nextIndex = maskHistoryIndexRef.current + 1
      syncMaskHistoryState(nextIndex, maskHistoryRef.current.length)
      setSelectedAnnotationId(null)
      setSelectedMaskPart(null)
      emitAnnotationsChange(maskHistoryRef.current[nextIndex] ?? [], { skipHistory: true })
      return
    }

    const annotator = annotoriousRef.current
    if (
      pointHistoryIndexRef.current < pointHistoryRef.current.length - 1
      && (
        selectedAnnotation?.tool === 'point'
        || drawingTool === 'point'
        || !(annotator?.canRedo?.() ?? false)
      )
    ) {
      const nextIndex = pointHistoryIndexRef.current + 1
      syncPointHistoryState(nextIndex, pointHistoryRef.current.length)
      setSelectedAnnotationId(null)
      emitAnnotationsChange(replacePointAnnotations(annotations, pointHistoryRef.current[nextIndex] ?? []))
      return
    }

    if (!annotator?.canRedo?.()) return
    annotator.redo()
    setSelectedAnnotationId(null)
    refreshAnnotatorHistoryState()
  }

  const applyLabelChange = useCallback((annotationId: string, classId: number) => {
    if (readOnly) return
    const targetAnnotation = annotations.find((annotation) => annotation.id === annotationId)
    if (!targetAnnotation) return

    if (targetAnnotation.tool === 'point') {
      const nextAnnotations = annotations.map((annotation) => annotation.id === annotationId
        ? { ...annotation, class_id: classId }
        : annotation)
      pushPointHistory(nextAnnotations)
      emitAnnotationsChange(nextAnnotations)
      setSelectedAnnotationId(annotationId)
      return
    }

    if (polygonWithHoles) {
      if (selectedMaskPart?.part === 'hole') return
      const nextAnnotations = annotations.map((annotation) => annotation.id === annotationId
        ? { ...annotation, class_id: classId }
        : annotation)
      emitAnnotationsChange(nextAnnotations)
      setSelectedAnnotationId(annotationId)
      return
    }

    const annotator = annotoriousRef.current
    if (!annotator) return

    const current = annotator.getAnnotationById(annotationId)
    if (!current) return

    const nextAnnotation = {
      ...current,
      bodies: buildAnnotationBodies(annotationId, classId, labels),
      properties: {
        ...current.properties,
        classId,
      },
    }

    annotator.updateAnnotation(nextAnnotation)
    setSelectedAnnotationId(annotationId)
    window.requestAnimationFrame(() => {
      annotator.setSelected(annotationId, true)
    })
    refreshAnnotatorHistoryState()
  }, [annotations, emitAnnotationsChange, labels, polygonWithHoles, pushPointHistory, readOnly, refreshAnnotatorHistoryState, selectedMaskPart])

  const handleLabelChange = (classId: number) => {
    if (!selectedAnnotationId) return
    applyLabelChange(selectedAnnotationId, classId)
    setPendingLabelAnnotationId(null)
  }

  const handleLabelClear = () => {
    if (!selectedAnnotationId) return
    applyLabelChange(selectedAnnotationId, -1)
    setPendingLabelAnnotationId(null)
  }

  const handlePendingLabelChange = (classId: number) => {
    if (pendingQuickRectanglePoint) {
      const annotator = annotoriousRef.current
      if (!annotator) return

      const id = `quick-rectangle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const width = quickRectangleSubmitSize.w
      const height = quickRectangleSubmitSize.h
      const x = Number((pendingQuickRectanglePoint[0] - width / 2).toFixed(1))
      const y = Number((pendingQuickRectanglePoint[1] - height / 2).toFixed(1))

      suppressNextCreatedPickerRef.current = true
      annotator.state.store.addAnnotation({
        id,
        bodies: buildAnnotationBodies(id, classId, labels),
        properties: {
          classId,
          sourceImage: item.image,
          tool: 'rectangle',
        },
        target: {
          annotation: id,
          selector: {
            type: ShapeType.RECTANGLE,
            geometry: {
              x,
              y,
              w: width,
              h: height,
              rot: 0,
              bounds: {
                minX: x,
                minY: y,
                maxX: x + width,
                maxY: y + height,
              },
            },
          },
        },
      } as ImageAnnotation, Origin.LOCAL)

      setQuickRectangleClickGuardUntil(Date.now() + 250)
      setSelectedAnnotationId(id)
      annotator.setSelected(id, true)
      refreshAnnotatorHistoryState()
      setPendingQuickRectanglePoint(null)
      setPendingLabelAnnotationId(null)
      return
    }

    if (!pendingLabelAnnotationId) return
    applyLabelChange(pendingLabelAnnotationId, classId)
    setPendingLabelAnnotationId(null)
  }

  const handleFloatingLabelPickerClose = useCallback(() => {
    setPendingQuickRectanglePoint(null)
    setPendingLabelAnnotationId(null)
  }, [])

  const handleAnnotationCreated = useCallback((id: string) => {
    if (suppressNextCreatedPickerRef.current) {
      suppressNextCreatedPickerRef.current = false
      return
    }

    setPendingLabelAnnotationId(id)
  }, [])

  const handleToggleFullscreen = async () => {
    const root = workspaceRootRef.current
    if (!root) return

    try {
      if (document.fullscreenElement === root) {
        await document.exitFullscreen()
        return
      }

      await root.requestFullscreen()
    }
    catch {
      message.warning('当前环境不支持全屏操作')
    }
  }

  const handleZoomIn = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.viewport.zoomBy(1.2, undefined, false)
    viewer.viewport.applyConstraints()
  }, [])

  const handleZoomOut = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.viewport.zoomBy(1 / 1.2, undefined, false)
    viewer.viewport.applyConstraints()
  }, [])

  const handleResetViewport = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.viewport.goHome()
  }, [])

  const toolOptions = polygonWithHoles
    ? [
        { key: 'polygon', title: '新实例', icon: <NodeIndexOutlined /> },
        { key: 'hole', title: '添加孔洞', icon: <GatewayOutlined /> },
        // { key: 'region', title: '添加连通区域', icon: <BorderOutlined /> },
      ] as const
    : [
        { key: 'polygon', title: '多边形', icon: <NodeIndexOutlined /> },
        { key: 'line', title: '线段', icon: <LineOutlined /> },
        // { key: 'point', title: '点', icon: <AimOutlined /> },
        { key: 'quick-rectangle', title: '点', icon: <AimOutlined /> },
        { key: 'rectangle', title: '矩形', icon: <BorderOutlined /> },
      ] as const

  return (
    <div
      ref={workspaceRootRef}
      className={`grid min-h-0 ${isFullscreen ? 'h-screen w-screen grid-cols-[minmax(0,1fr)_280px] gap-4 bg-[#f5f7fb] p-4' : 'h-full grid-cols-[minmax(0,1fr)_260px] gap-4'}`}
    >
      <div
        className={`flex min-h-0 flex-col rounded-xl border border-[#edf0f5] bg-[#fbfcfe] p-4 ${isFullscreen ? 'h-full' : ''}`}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[#e3e8f2] bg-white/80 px-2 py-1">
            {toolOptions.map((tool) => (
              <ToolbarIconButton
                key={tool.key}
                title={tool.title}
                active={drawingTool === tool.key}
                disabled={readOnly || (polygonWithHoles && tool.key === 'region' && !selectedAnnotationId)}
                icon={tool.icon}
                onClick={() => {
                  if (polygonWithHoles && (tool.key === 'hole' || tool.key === 'region')) {
                    if (tool.key === 'region' && !selectedAnnotationId) {
                      message.warning('请先选中一个实例')
                      return
                    }
                    setMaskEditTargetId(selectedAnnotationId)
                  }
                  else {
                    setMaskEditTargetId(null)
                  }
                  onDrawingToolChange(tool.key)
                }}
              />
            ))}
            <div className="mx-1 h-5 w-px bg-[#e5e7eb]" />
            <ToolbarIconButton
              title="开始绘制"
              active={!readOnly && drawingEnabled}
              disabled={readOnly}
              icon={<EditOutlined />}
              onClick={handleStartDrawing}
            />
            <ToolbarIconButton
              title="取消绘制"
              disabled={readOnly || !drawingEnabled}
              icon={<StopOutlined />}
              onClick={handleCancelDrawing}
            />
            <div className="mx-1 h-5 w-px bg-[#e5e7eb]" />
            <ToolbarIconButton
              title="撤销"
              disabled={readOnly || (polygonWithHoles ? maskHistoryState.index <= 0 : pointHistoryState.index <= 0 && !annotatorHistoryState.canUndo)}
              icon={<ArrowLeftOutlined />}
              onClick={handleUndo}
            />
            <ToolbarIconButton
              title="重做"
              disabled={readOnly || (polygonWithHoles ? maskHistoryState.index >= maskHistoryState.length - 1 : pointHistoryState.index >= pointHistoryState.length - 1 && !annotatorHistoryState.canRedo)}
              icon={<ArrowRightOutlined />}
              onClick={handleRedo}
            />
            <ToolbarIconButton
              title="删除区域"
              danger
              disabled={readOnly || !selectedAnnotationId}
              icon={<DeleteOutlined />}
              onClick={handleDeleteSelected}
            />
            <div className="mx-1 h-5 w-px bg-[#e5e7eb]" />
            <ToolbarIconButton
              title="缩小"
              disabled={!viewerState.canZoomOut}
              icon={<MinusOutlined />}
              onClick={handleZoomOut}
            />
            <div className="min-w-[52px] text-center text-xs font-medium text-[#4b5563]">
              {`${viewerState.zoomPercent}%`}
            </div>
            <ToolbarIconButton
              title="放大"
              disabled={!viewerState.canZoomIn}
              icon={<PlusOutlined />}
              onClick={handleZoomIn}
            />
            <ToolbarIconButton
              title="重置缩放"
              disabled={!viewerState.canReset}
              icon={<OneToOneOutlined />}
              onClick={handleResetViewport}
            />
            <div className="flex items-center px-1 text-xs text-[#6b7280]">
              <DragOutlined className="mr-1" />
              拖拽平移，滚轮缩放
            </div>
            <div className="mx-1 h-5 w-px bg-[#e5e7eb]" />
            <ToolbarIconButton
              title={isFullscreen ? '退出全屏' : '全屏'}
              icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={() => {
                void handleToggleFullscreen()
              }}
            />
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-[#dbe4f0] bg-[#eef4fb] p-4">
          <Annotorious ref={annotoriousRef as never}>
            <AnnotoriousImageCanvas
              item={item}
              annotations={annotations}
              labels={labels}
              drawingEnabled={drawingEnabled}
              drawingTool={drawingTool}
              selectedAnnotationId={selectedAnnotationId}
              onChange={emitAnnotationsChange}
              onPointChange={handlePointHistoryChange}
              onSelectAnnotation={setSelectedAnnotationId}
              onAnnotatorHistoryChange={refreshAnnotatorHistoryState}
              onAnnotationCreated={handleAnnotationCreated}
              onQuickRectangleRequest={(point) => {
                setPendingQuickRectanglePoint(point)
                setPendingLabelAnnotationId('quick-rectangle-pending')
              }}
              pendingLabelAnnotationId={pendingLabelAnnotationId}
              pendingQuickRectanglePoint={pendingQuickRectanglePoint}
              quickRectangleClickGuardUntil={quickRectangleClickGuardUntil}
              labelOptions={labelOptions}
              onFloatingLabelChange={handlePendingLabelChange}
              onFloatingLabelPickerClose={handleFloatingLabelPickerClose}
              viewerRef={viewerRef}
              onViewerStateChange={setViewerState}
              polygonWithHoles={polygonWithHoles}
              maskEditTargetId={maskEditTargetId}
              onSelectMaskPart={setSelectedMaskPart}
            />
          </Annotorious>
          {readOnly && <div className="absolute inset-4 z-10 cursor-not-allowed rounded-lg bg-transparent" />}
        </div>
      </div>

      <div className={`flex min-h-0 flex-col gap-4 ${isFullscreen ? 'overflow-auto' : ''}`}>
        <Card bordered={false} className="rounded-xl">
          <div className="space-y-3">
            <div>
              <Typography.Text strong className="text-[14px] text-[#1f2937]">区域信息</Typography.Text>
              <div className="mt-1 text-xs text-[#6b7280]">
                当前页共
                {annotations.length}
                {' '}
                {polygonWithHoles ? '个实例，点击外轮廓后可修改类别。' : '个区域，点击图中区域后可修改类别。'}
              </div>
            </div>
            <Select
              value={selectedAnnotationClassId}
              placeholder="请选择区域标签"
              className="w-full"
              allowClear
              disabled={readOnly || !selectedAnnotation || selectedMaskPart?.part === 'hole'}
              options={labelOptions}
              onChange={handleLabelChange}
              onClear={handleLabelClear}
              getPopupContainer={(node) => node.parentElement ?? document.body}
            />
            <div className="rounded-lg bg-[#f8fafc] p-3 text-xs text-[#4b5563]">
              {selectedAnnotation ? (
                <>
                  <div>{`区域 ID: ${selectedAnnotation.id}`}</div>
                  <div className="mt-1">{renderAnnotationGeometrySummary(selectedAnnotation)}</div>
                  <div className="mt-1">
                    {selectedMaskPart?.part === 'hole'
                      ? '类别: 孔洞不需要标签'
                      : `类别: ${selectedAnnotationClassId == null ? '未选择' : getLabelName(labels, selectedAnnotationClassId)}`}
                  </div>
                </>
              ) : (
                <span>未选中任何区域</span>
              )}
            </div>
          </div>
        </Card>

        <Card
          bordered={false}
          className="min-h-0 flex flex-1 flex-col overflow-hidden rounded-xl"
          classNames={{
            body: 'flex min-h-0 flex-1 flex-col overflow-hidden',
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="mb-3 shrink-0">
              <Typography.Text strong className="text-[14px] text-[#1f2937]">标签图例</Typography.Text>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {labelOptions.map((option) => (
                <div key={option.value} className="flex items-center justify-between rounded-lg border border-[#edf0f5] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: option.color }} />
                    <span className="text-sm text-[#1f2937]">{option.label}</span>
                  </div>
                  <Tag color="processing">{`class_id=${option.value}`}</Tag>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function AnnotoriousImageCanvas({
  item,
  annotations,
  labels,
  drawingEnabled,
  drawingTool,
  selectedAnnotationId,
  onChange,
  onPointChange,
  onSelectAnnotation,
  onAnnotatorHistoryChange,
  onAnnotationCreated,
  onQuickRectangleRequest,
  pendingLabelAnnotationId,
  pendingQuickRectanglePoint,
  quickRectangleClickGuardUntil,
  labelOptions,
  onFloatingLabelChange,
  onFloatingLabelPickerClose,
  viewerRef,
  onViewerStateChange,
  polygonWithHoles,
  maskEditTargetId,
  onSelectMaskPart,
}: {
  item: OnlineAnnotationPageItem
  annotations: ImageAnnotationItem[]
  labels: string[]
  drawingEnabled: boolean
  drawingTool: SegmentationDrawingTool
  selectedAnnotationId: string | null
  onChange: (annotations: ImageAnnotationItem[]) => void
  onPointChange: (annotations: ImageAnnotationItem[], previousPointAnnotations?: ImageAnnotationItem[]) => void
  onSelectAnnotation: (id: string | null) => void
  onAnnotatorHistoryChange: () => void
  onAnnotationCreated: (id: string) => void
  onQuickRectangleRequest: (point: [number, number]) => void
  pendingLabelAnnotationId: string | null
  pendingQuickRectanglePoint: [number, number] | null
  quickRectangleClickGuardUntil: number
  labelOptions: SegmentationLabelOption[]
  onFloatingLabelChange: (classId: number) => void
  onFloatingLabelPickerClose: () => void
  viewerRef: React.MutableRefObject<OpenSeadragon.Viewer | null>
  onViewerStateChange: React.Dispatch<React.SetStateAction<{
    zoomPercent: number
    canZoomOut: boolean
    canZoomIn: boolean
    canReset: boolean
  }>>
  polygonWithHoles: boolean
  maskEditTargetId: string | null
  onSelectMaskPart: (selection: MaskPartSelection | null) => void
}) {
  const annotator = useAnnotator<AnnotoriousOpenSeadragonAnnotator<ImageAnnotation, ImageAnnotation>>()
  const [viewer, setViewer] = useState<OpenSeadragon.Viewer | null>(null)
  const pluginMountedRef = useRef(false)
  const [imageBox, setImageBox] = useState<RenderedImageBox | null>(null)
  const dragPointIdRef = useRef<string | null>(null)
  const dragPointSnapshotRef = useRef<ImageAnnotationItem[] | null>(null)
  const annotationsRef = useRef<ImageAnnotationItem[]>(annotations)

  const handleViewerRef = useCallback((instance: OpenSeadragon.Viewer | null) => {
    viewerRef.current = instance
    setViewer(instance)
  }, [viewerRef])

  useSyncAnnotationsRef(annotations, annotationsRef)
  useImageBoxSync(item, viewer ?? null, setImageBox)
  useAnnotatorSetup(annotator, pluginMountedRef, annotations, onAnnotatorHistoryChange)
  useAnnotatorDrawingSync({ annotator, drawingTool, drawingEnabled })
  useAnnotatorStyle(annotator, polygonWithHoles)
  useAnnotatorAnnotationsSync({ annotator, annotations, item, labels, selectedAnnotationId, polygonWithHoles })
  usePointToolInteractions({
    annotator,
    drawingTool,
    drawingEnabled,
    viewer: viewer ?? null,
    item,
    labels,
    annotations,
    annotationsRef,
    dragPointIdRef,
    dragPointSnapshotRef,
    onChange,
    onPointChange,
    onSelectAnnotation,
    onAnnotationCreated,
    onQuickRectangleRequest,
    pendingQuickRectanglePoint,
    quickRectangleClickGuardUntil,
  })
  useAnnotatorEvents({
    annotator,
    annotationsRef,
    item,
    labels,
    drawingTool,
    selectedAnnotationId,
    maskEditTargetId,
    polygonWithHoles,
    onChange,
    onSelectAnnotation,
    onSelectMaskPart,
    onAnnotationCreated,
  })

  useEffect(() => {
    if (!viewer) return

    viewerRef.current = viewer

    const syncViewerState = () => {
      const currentZoom = viewer.viewport.getZoom(true)
      const homeZoom = viewer.viewport.getHomeZoom()
      const zoomPercent = Math.max(1, Math.round((currentZoom / homeZoom) * 100))
      const maxZoom = viewer.viewport.getMaxZoom?.() ?? Number.POSITIVE_INFINITY

      onViewerStateChange({
        zoomPercent,
        canZoomOut: currentZoom > homeZoom * 1.01,
        canZoomIn: currentZoom < maxZoom * 0.99,
        canReset: currentZoom > homeZoom * 1.01,
      })
    }

    syncViewerState()
    viewer.addHandler('open', syncViewerState)
    viewer.addHandler('animation', syncViewerState)
    viewer.addHandler('update-viewport', syncViewerState)

    return () => {
      viewer.removeHandler('open', syncViewerState)
      viewer.removeHandler('animation', syncViewerState)
      viewer.removeHandler('update-viewport', syncViewerState)
      if (viewerRef.current === viewer) viewerRef.current = null
    }
  }, [onViewerStateChange, viewer, viewerRef])

  const viewerOptions = useMemo<OpenSeadragon.Options>(() => ({
    tileSources: {
      type: 'image',
      url: item.image,
    },
    showNavigationControl: false,
    showHomeControl: false,
    showZoomControl: false,
    showFullPageControl: false,
    showRotationControl: false,
    gestureSettingsMouse: {
      clickToZoom: false,
      dblClickToZoom: false,
      scrollToZoom: true,
      dragToPan: true,
      pinchToZoom: true,
      zoomToRefPoint: true,
      flickEnabled: true,
      flickMinSpeed: 120,
      flickMomentum: 0.18,
    },
    gestureSettingsTouch: {
      dragToPan: true,
      scrollToZoom: false,
      clickToZoom: false,
      dblClickToZoom: true,
      dblClickDragToZoom: true,
      pinchToZoom: true,
      zoomToRefPoint: true,
      flickEnabled: true,
      flickMinSpeed: 120,
      flickMomentum: 0.18,
    },
    constrainDuringPan: true,
    visibilityRatio: 0.8,
    springStiffness: 6.5,
    maxZoomPixelRatio: 4,
    animationTime: 1.2,
    blendTime: 0.15,
    immediateRender: false,
  }), [item.image])

  return (
    <OpenSeadragonAnnotator>
      <div className="relative h-full w-full overflow-hidden rounded-lg">
        <OpenSeadragonViewer
          key={item.id}
          ref={handleViewerRef}
          className={`h-full w-full ${(drawingTool === 'point' || drawingTool === 'quick-rectangle') && drawingEnabled ? 'cursor-crosshair' : ''}`}
          options={viewerOptions}
        />
        <div className="pointer-events-none absolute inset-0 z-20">
          {polygonWithHoles && (
            <MaskAnnotationOverlay
              annotations={annotations}
              imageBox={imageBox}
              selectedAnnotationId={selectedAnnotationId}
            />
          )}
          <PointAnnotationOverlay
            annotations={annotations}
            imageBox={imageBox}
            selectedAnnotationId={selectedAnnotationId}
            onSelectAnnotation={onSelectAnnotation}
            onStartDrag={(id) => {
              dragPointIdRef.current = id
              dragPointSnapshotRef.current = getPointAnnotations(annotationsRef.current)
              onSelectAnnotation(id)
            }}
          />
          <PendingQuickRectangleOverlay
            imageBox={imageBox}
            point={pendingQuickRectanglePoint}
          />
          <NewAnnotationLabelPicker
            annotation={annotations.find((annotationItem) => annotationItem.id === pendingLabelAnnotationId) ?? null}
            imageBox={imageBox}
            pendingPoint={pendingQuickRectanglePoint}
            options={labelOptions}
            onChange={onFloatingLabelChange}
            onClose={onFloatingLabelPickerClose}
          />
        </div>
      </div>
    </OpenSeadragonAnnotator>
  )
}

function MaskAnnotationOverlay({
  annotations,
  imageBox,
  selectedAnnotationId,
}: {
  annotations: ImageAnnotationItem[]
  imageBox: RenderedImageBox | null
  selectedAnnotationId: string | null
}) {
  if (!imageBox) return null

  const maskAnnotations = annotations.filter((annotation) => annotation.segmentationMask?.regions.length)
  if (!maskAnnotations.length) return null

  return (
    <svg className="absolute inset-0 z-10 h-full w-full" aria-hidden="true">
      {maskAnnotations.flatMap((annotation) => {
        const color = getAnnotationColor(annotation.class_id)
        const isSelected = annotation.id === selectedAnnotationId

        return annotation.segmentationMask!.regions.map((region) => {
          const path = [
            polygonPointsToSvgPath(region.exterior, imageBox),
            ...region.holes.map((hole) => polygonPointsToSvgPath(hole, imageBox)),
          ].filter(Boolean).join(' ')

          if (!path) return null

          return (
            <path
              key={`${annotation.id ?? 'mask'}-${region.exterior.map(([x, y]) => `${x},${y}`).join(';')}`}
              d={path}
              fill={color}
              fillOpacity={isSelected ? 0.34 : 0.24}
              fillRule="evenodd"
              clipRule="evenodd"
              stroke={color}
              strokeOpacity={isSelected ? 0.95 : 0.55}
              strokeWidth={isSelected ? 2.5 : 1.5}
              vectorEffect="non-scaling-stroke"
            />
          )
        })
      })}
    </svg>
  )
}

function NewAnnotationLabelPicker({
  annotation,
  imageBox,
  pendingPoint,
  options,
  onChange,
  onClose,
}: {
  annotation: ImageAnnotationItem | null
  imageBox: RenderedImageBox | null
  pendingPoint: [number, number] | null
  options: SegmentationLabelOption[]
  onChange: (classId: number) => void
  onClose: () => void
}) {
  const [open, setOpen] = useState(true)
  const pendingX = pendingPoint?.[0]
  const pendingY = pendingPoint?.[1]

  useEffect(() => {
    setOpen(true)
  }, [annotation?.id, pendingX, pendingY])

  const position = useMemo(() => {
    if (pendingPoint && imageBox) {
      const anchor = imagePointToViewportPoint(pendingPoint, imageBox)
      return getFloatingPickerPositionFromAnchor(anchor, imageBox)
    }
    if (!annotation || !imageBox) return null
    return getFloatingPickerPosition(annotation, imageBox)
  }, [annotation, imageBox, pendingPoint])

  if ((!annotation && !pendingPoint) || !imageBox || !position || !options.length) return null

  return (
    <div
      className="pointer-events-auto absolute z-30"
      data-floating-label-picker="true"
      style={{
        left: position.left,
        top: position.top,
        transform: position.alignRight ? 'translateX(-100%)' : undefined,
      }}
    >
      <div className="rounded-lg border border-[#dbe4f0] bg-white p-2 shadow-lg">
        <div className="mb-2 text-xs font-medium text-[#4b5563]">选择标签</div>
        <Select
          autoFocus
          open={open}
          key={annotation?.id ?? `pending-${pendingPoint?.[0] ?? 0}-${pendingPoint?.[1] ?? 0}`}
          value={undefined}
          placeholder="请选择区域标签"
          className="w-[180px]"
          popupClassName="segmentation-floating-label-popup"
          options={options}
          onChange={(classId) => {
            setOpen(false)
            onChange(classId)
            onClose()
          }}
          onDropdownVisibleChange={(nextOpen) => {
            setOpen(nextOpen)
            if (!nextOpen) onClose()
          }}
          getPopupContainer={(node) => node.parentElement ?? document.body}
        />
      </div>
    </div>
  )
}

function PendingQuickRectangleOverlay({
  imageBox,
  point,
}: {
  imageBox: RenderedImageBox | null
  point: [number, number] | null
}) {
  if (!imageBox || !point) return null

  const center = imagePointToViewportPoint(point, imageBox)
  const width = (quickRectangleSubmitSize.w / imageBox.naturalWidth) * imageBox.renderedWidth
  const height = (quickRectangleSubmitSize.h / imageBox.naturalHeight) * imageBox.renderedHeight

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div
        className="absolute rounded-[3px] !border !border-2 !border-dashed !border-[#2563eb]"
        style={{
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          left: center.left,
          top: center.top,
          width,
          height,
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 0 3px rgba(37, 99, 235, 0.12)',
        }}
      />
    </div>
  )
}

function PointAnnotationOverlay({
  annotations,
  imageBox,
  selectedAnnotationId,
  onSelectAnnotation,
  onStartDrag,
}: {
  annotations: ImageAnnotationItem[]
  imageBox: RenderedImageBox | null
  selectedAnnotationId: string | null
  onSelectAnnotation: (id: string | null) => void
  onStartDrag: (id: string) => void
}) {
  const pointAnnotations = annotations.filter((annotation) => annotation.tool === 'point' && annotation.point)
  if (!imageBox) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {pointAnnotations.map((annotation) => {
        const [x, y] = annotation.point!
        const color = getAnnotationColor(annotation.class_id)
        const isSelected = annotation.id === selectedAnnotationId
        const isRectanglePoint = annotation.pointShape === 'rectangle'

        return (
          <button
            key={annotation.id}
            type="button"
            className={`pointer-events-auto absolute border-2 border-white shadow ${isRectanglePoint ? 'rounded-[3px]' : 'rounded-full'}`}
            style={{
              left: imageBox.offsetX + (x / imageBox.naturalWidth) * imageBox.renderedWidth,
              top: imageBox.offsetY + (y / imageBox.naturalHeight) * imageBox.renderedHeight,
              width: isRectanglePoint ? pointMarkerWidth : pointMarkerHeight,
              height: pointMarkerHeight,
              backgroundColor: isRectanglePoint ? 'transparent' : color,
              borderColor: isRectanglePoint ? color : '#ffffff',
              transform: 'translate(-50%, -50%)',
              boxShadow: isSelected ? `0 0 0 3px ${hexToRgba(color, 0.28)}` : undefined,
            }}
            title={`(${x.toFixed(1)}, ${y.toFixed(1)})`}
            onClick={(event) => {
              event.stopPropagation()
              onSelectAnnotation(annotation.id ?? null)
            }}
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (annotation.id) onStartDrag(annotation.id)
            }}
          />
        )
      })}
    </div>
  )
}

function ToolbarIconButton({
  title,
  icon,
  onClick,
  active = false,
  disabled = false,
  danger = false,
}: {
  title: string
  icon: React.ReactNode
  onClick: () => void
  active?: boolean
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <Tooltip title={title}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border-none p-0 text-[18px] shadow-none transition ${
          danger
            ? 'text-[#ef4444]'
            : active
              ? 'bg-[#e8f1ff] text-[#2563eb]'
              : 'bg-transparent text-[#4b5563]'
        } ${
          disabled
            ? 'cursor-not-allowed opacity-35'
            : danger
              ? 'hover:bg-[#fef2f2] hover:text-[#dc2626]'
              : 'hover:bg-[#f3f6fb] hover:text-[#111827]'
        }`}
      >
        {icon}
      </button>
    </Tooltip>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getFloatingPickerPosition(
  annotation: ImageAnnotationItem,
  imageBox: RenderedImageBox,
) {
  const anchor = getAnnotationAnchor(annotation, imageBox)
  return getFloatingPickerPositionFromAnchor(anchor, imageBox)
}

function getFloatingPickerPositionFromAnchor(
  anchor: { left: number, top: number },
  imageBox: RenderedImageBox,
) {
  const pickerWidth = 180
  const offset = 12
  const maxLeft = imageBox.offsetX + imageBox.renderedWidth
  const alignRight = anchor.left + pickerWidth + offset > maxLeft

  return {
    left: alignRight ? Math.max(anchor.left - offset, imageBox.offsetX + pickerWidth) : anchor.left + offset,
    top: clamp(anchor.top, imageBox.offsetY, imageBox.offsetY + imageBox.renderedHeight - 40),
    alignRight,
  }
}

function getAnnotationAnchor(annotation: ImageAnnotationItem, imageBox: RenderedImageBox) {
  if (annotation.tool === 'point' && annotation.point) {
    return imagePointToViewportPoint(annotation.point, imageBox)
  }

  if (annotation.tool === 'line' && annotation.line) {
    const x = Math.max(annotation.line[0][0], annotation.line[1][0])
    const y = Math.min(annotation.line[0][1], annotation.line[1][1])
    return imagePointToViewportPoint([x, y], imageBox)
  }

  if (annotation.tool === 'rectangle' && annotation.rectangle) {
    return imagePointToViewportPoint([
      annotation.rectangle.x + annotation.rectangle.w,
      annotation.rectangle.y,
    ], imageBox)
  }

  const polygon = annotation.segmentation[0] ?? []
  const points: Array<[number, number]> = []
  for (let index = 0; index < polygon.length; index += 2) {
    const x = polygon[index]
    const y = polygon[index + 1]
    if (typeof x === 'number' && typeof y === 'number') points.push([x, y])
  }

  if (!points.length) {
    return {
      left: imageBox.offsetX + imageBox.renderedWidth / 2,
      top: imageBox.offsetY + imageBox.renderedHeight / 2,
    }
  }

  const maxX = Math.max(...points.map(([x]) => x))
  const minY = Math.min(...points.map(([, y]) => y))
  return imagePointToViewportPoint([maxX, minY], imageBox)
}

function imagePointToViewportPoint(
  point: [number, number],
  imageBox: RenderedImageBox,
) {
  return {
    left: imageBox.offsetX + (point[0] / imageBox.naturalWidth) * imageBox.renderedWidth,
    top: imageBox.offsetY + (point[1] / imageBox.naturalHeight) * imageBox.renderedHeight,
  }
}

function polygonPointsToSvgPath(points: Array<[number, number]>, imageBox: RenderedImageBox) {
  if (points.length < 3) return ''

  return points
    .map((point, index) => {
      const viewportPoint = imagePointToViewportPoint(point, imageBox)
      return `${index === 0 ? 'M' : 'L'} ${viewportPoint.left.toFixed(2)} ${viewportPoint.top.toFixed(2)}`
    })
    .join(' ')
    .concat(' Z')
}

export default SegmentationWorkspace
