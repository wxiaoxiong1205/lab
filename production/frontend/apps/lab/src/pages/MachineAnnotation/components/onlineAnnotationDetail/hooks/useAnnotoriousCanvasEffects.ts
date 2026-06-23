import type React from 'react'
import { useEffect } from 'react'
import type OpenSeadragon from 'openseadragon'
import { message } from 'antd'
import {
  type AnnotoriousOpenSeadragonAnnotator,
  type DrawingStyle,
  type ImageAnnotation,
  UserSelectAction,
} from '@annotorious/react'
import { mountPlugin as mountToolsPlugin } from '@annotorious/plugin-tools'
import type {
  ImageAnnotationItem,
  MaskPartSelection,
  OnlineAnnotationPageItem,
} from '../../../types'
import type { RenderedImageBox } from '../types'
import {
  addPolygonWithHolesPart,
  findPolygonWithHolesTarget,
  getAnnotationColor,
  getClassIdFromAnnotation,
  getDefaultSegmentationClassId,
  getPointAnnotations,
  getPolygonWithHolesValidationError,
  getRenderedImageBoxFromViewer,
  hexToRgba,
  mergeCanvasAnnotationsWithPoints,
  toAnnotoriousAnnotation,
  toAnnotoriousAnnotations,
  toBackendAnnotation,
  viewerEventToImagePoint,
} from '../utils'

export function useSyncAnnotationsRef(
  annotations: ImageAnnotationItem[],
  annotationsRef: React.MutableRefObject<ImageAnnotationItem[]>,
) {
  useEffect(() => {
    annotationsRef.current = annotations
  }, [annotations, annotationsRef])
}

export function useImageBoxSync(
  item: OnlineAnnotationPageItem,
  viewer: OpenSeadragon.Viewer | null,
  setImageBox: React.Dispatch<React.SetStateAction<RenderedImageBox | null>>,
) {
  useEffect(() => {
    if (!viewer) return

    const updateImageBox = () => {
      setImageBox(getRenderedImageBoxFromViewer(viewer, item))
    }

    updateImageBox()
    viewer.addHandler('open', updateImageBox)
    viewer.addHandler('animation', updateImageBox)
    viewer.addHandler('resize', updateImageBox)
    viewer.addHandler('update-viewport', updateImageBox)

    return () => {
      viewer.removeHandler('open', updateImageBox)
      viewer.removeHandler('animation', updateImageBox)
      viewer.removeHandler('resize', updateImageBox)
      viewer.removeHandler('update-viewport', updateImageBox)
    }
  }, [item, setImageBox, viewer])
}

export function useAnnotatorSetup(
  annotator: AnnotoriousOpenSeadragonAnnotator<ImageAnnotation, ImageAnnotation> | undefined,
  pluginMountedRef: React.MutableRefObject<boolean>,
  annotations: ImageAnnotationItem[],
  onAnnotatorHistoryChange: () => void,
) {
  useEffect(() => {
    if (!annotator) return
    if (!pluginMountedRef.current) {
      mountToolsPlugin(annotator as never)
      pluginMountedRef.current = true
    }
    onAnnotatorHistoryChange()
  }, [annotator, onAnnotatorHistoryChange, pluginMountedRef])

  useEffect(() => {
    if (!annotator) return
    onAnnotatorHistoryChange()
  }, [annotations, annotator, onAnnotatorHistoryChange])
}

export function useAnnotatorDrawingSync({
  annotator,
  drawingTool,
  drawingEnabled,
}: {
  annotator: AnnotoriousOpenSeadragonAnnotator<ImageAnnotation, ImageAnnotation> | undefined
  drawingTool: 'polygon' | 'line' | 'point' | 'rectangle' | 'quick-rectangle' | 'hole' | 'region'
  drawingEnabled: boolean
}) {
  useEffect(() => {
    if (!annotator) return
    if (drawingTool === 'point') {
      annotator.setUserSelectAction(UserSelectAction.EDIT)
      annotator.setDrawingEnabled(false)
      return
    }

    if (drawingTool === 'quick-rectangle') {
      annotator.setUserSelectAction(UserSelectAction.EDIT)
      annotator.setDrawingTool('rectangle')
      annotator.setDrawingEnabled(false)
      return
    }

    if (drawingTool === 'hole' || drawingTool === 'region') {
      annotator.setUserSelectAction(UserSelectAction.EDIT)
      annotator.setDrawingTool('polygon')
      annotator.setDrawingMode('click')
      annotator.setDrawingEnabled(drawingEnabled)
      return
    }

    // Keep existing annotations selectable/editable even while continuous drawing is enabled.
    // Clicking empty image area still starts a new shape via Annotorious drawing mode.
    annotator.setUserSelectAction(UserSelectAction.EDIT)
    annotator.setDrawingTool(drawingTool)
    annotator.setDrawingMode('click')
    annotator.setDrawingEnabled(drawingEnabled)
  }, [annotator, drawingEnabled, drawingTool])
}

export function useAnnotatorStyle(
  annotator: AnnotoriousOpenSeadragonAnnotator<ImageAnnotation, ImageAnnotation> | undefined,
  polygonWithHoles = false,
) {
  useEffect(() => {
    if (!annotator) return
    annotator.setStyle((annotation): DrawingStyle => {
      const classId = getClassIdFromAnnotation(annotation)
      const color = getAnnotationColor(classId)
      const isMaskPart = polygonWithHoles && !!annotation.properties?.maskParentId

      return {
        fill: (isMaskPart ? 'transparent' : hexToRgba(color, 0.24)) as DrawingStyle['fill'],
        fillOpacity: isMaskPart ? 0 : 0.24,
        stroke: color as DrawingStyle['stroke'],
        strokeOpacity: 1,
        strokeWidth: 2.5,
      }
    })
  }, [annotator, polygonWithHoles])
}

export function useAnnotatorAnnotationsSync({
  annotator,
  annotations,
  item,
  labels,
  selectedAnnotationId,
  polygonWithHoles = false,
}: {
  annotator: AnnotoriousOpenSeadragonAnnotator<ImageAnnotation, ImageAnnotation> | undefined
  annotations: ImageAnnotationItem[]
  item: OnlineAnnotationPageItem
  labels: string[]
  selectedAnnotationId: string | null
  polygonWithHoles?: boolean
}) {
  useEffect(() => {
    if (!annotator) return
    const canvasAnnotations = annotations
      .filter((annotation) => annotation.tool !== 'point')
      .flatMap((annotation) => polygonWithHoles
        ? toAnnotoriousAnnotations(annotation, item, labels)
        : [toAnnotoriousAnnotation(annotation, item, labels)])

    annotator.setAnnotations(canvasAnnotations, true)
  }, [annotator, annotations, item, labels, polygonWithHoles])

  useEffect(() => {
    if (!annotator || !selectedAnnotationId) return
    const canvasAnnotations = annotations
      .filter((annotation) => annotation.tool !== 'point')
      .flatMap((annotation) => polygonWithHoles
        ? toAnnotoriousAnnotations(annotation, item, labels)
        : [toAnnotoriousAnnotation(annotation, item, labels)])

    if (!canvasAnnotations.some((annotation) => annotation.id === selectedAnnotationId)) return

    window.requestAnimationFrame(() => {
      annotator.setSelected(selectedAnnotationId, true)
    })
  }, [annotator, annotations, item, labels, polygonWithHoles, selectedAnnotationId])
}

export function usePointToolInteractions({
  drawingTool,
  drawingEnabled,
  viewer,
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
}: {
  annotator: AnnotoriousOpenSeadragonAnnotator<ImageAnnotation, ImageAnnotation> | undefined
  drawingTool: 'polygon' | 'line' | 'point' | 'rectangle' | 'quick-rectangle' | 'hole' | 'region'
  drawingEnabled: boolean
  viewer: OpenSeadragon.Viewer | null
  item: OnlineAnnotationPageItem
  labels: string[]
  annotations: ImageAnnotationItem[]
  annotationsRef: React.MutableRefObject<ImageAnnotationItem[]>
  dragPointIdRef: React.MutableRefObject<string | null>
  dragPointSnapshotRef: React.MutableRefObject<ImageAnnotationItem[] | null>
  onChange: (annotations: ImageAnnotationItem[]) => void
  onPointChange: (annotations: ImageAnnotationItem[], previousPointAnnotations?: ImageAnnotationItem[]) => void
  onSelectAnnotation: (id: string | null) => void
  onAnnotationCreated: (id: string) => void
  onQuickRectangleRequest: (point: [number, number]) => void
  pendingQuickRectanglePoint: [number, number] | null
  quickRectangleClickGuardUntil: number
}) {
  useEffect(() => {
    if (drawingTool !== 'point' || !drawingEnabled) return
    if (!viewer?.element) return

    const handleClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-floating-label-picker="true"]')) {
        return
      }

      const point = viewerEventToImagePoint(event, viewer, item)
      if (!point) return

      const nextAnnotation: ImageAnnotationItem = {
        id: `point-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tool: 'point',
        class_id: getDefaultSegmentationClassId(labels),
        pointShape: 'circle',
        segmentation: [],
        point,
      }

      const nextAnnotations = [...annotations, nextAnnotation]
      onPointChange(nextAnnotations, getPointAnnotations(annotations))
      onChange(nextAnnotations)
      onSelectAnnotation(nextAnnotation.id ?? null)
      if (nextAnnotation.id) onAnnotationCreated(nextAnnotation.id)
    }

    viewer.element.addEventListener('click', handleClick)
    return () => viewer.element?.removeEventListener('click', handleClick)
  }, [annotations, drawingEnabled, drawingTool, item, labels, onAnnotationCreated, onChange, onPointChange, onSelectAnnotation, viewer])

  useEffect(() => {
    if (drawingTool !== 'quick-rectangle' || !drawingEnabled) return
    if (!viewer?.element) return

    const handleClick = (event: MouseEvent) => {
      if (Date.now() < quickRectangleClickGuardUntil) return
      if (pendingQuickRectanglePoint) return
      if (
        event.target instanceof Element
        && (
          event.target.closest('[data-floating-label-picker="true"]')
          || event.target.closest('.segmentation-floating-label-popup')
          || event.target.closest('.a9s-annotation')
          || event.target.closest('.a9s-handle')
          || event.target.closest('.a9s-inner')
          || event.target.closest('.a9s-outer')
        )
      ) {
        return
      }

      const point = viewerEventToImagePoint(event, viewer, item)
      if (!point) return

      onQuickRectangleRequest(point)
    }

    viewer.element.addEventListener('click', handleClick)
    return () => viewer.element?.removeEventListener('click', handleClick)
  }, [drawingEnabled, drawingTool, item, onQuickRectangleRequest, pendingQuickRectanglePoint, quickRectangleClickGuardUntil, viewer])

  useEffect(() => {
    if (!viewer?.element) return

    const handlePointerMove = (event: PointerEvent) => {
      const pointId = dragPointIdRef.current
      if (!pointId) return

      const point = viewerEventToImagePoint(event, viewer, item)
      if (!point) return

      onChange(
        annotationsRef.current.map((annotation) => annotation.id === pointId
          ? { ...annotation, point }
          : annotation),
      )
    }

    const handlePointerUp = () => {
      if (dragPointSnapshotRef.current) {
        onPointChange(annotationsRef.current, dragPointSnapshotRef.current)
        dragPointSnapshotRef.current = null
      }
      dragPointIdRef.current = null
    }

    viewer.element.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      viewer.element?.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [annotationsRef, dragPointIdRef, dragPointSnapshotRef, item, onChange, onPointChange, viewer])
}

export function useAnnotatorEvents({
  annotator,
  annotationsRef,
  item,
  labels,
  drawingTool,
  selectedAnnotationId,
  maskEditTargetId,
  polygonWithHoles = false,
  onChange,
  onSelectAnnotation,
  onSelectMaskPart,
  onAnnotationCreated,
}: {
  annotator: AnnotoriousOpenSeadragonAnnotator<ImageAnnotation, ImageAnnotation> | undefined
  annotationsRef: React.MutableRefObject<ImageAnnotationItem[]>
  item: OnlineAnnotationPageItem
  labels: string[]
  drawingTool: 'polygon' | 'line' | 'point' | 'rectangle' | 'quick-rectangle' | 'hole' | 'region'
  selectedAnnotationId: string | null
  maskEditTargetId: string | null
  polygonWithHoles?: boolean
  onChange: (annotations: ImageAnnotationItem[]) => void
  onSelectAnnotation: (id: string | null) => void
  onSelectMaskPart?: (selection: MaskPartSelection | null) => void
  onAnnotationCreated: (id: string) => void
}) {
  useEffect(() => {
    if (!annotator) return

    const resetAnnotatorToCurrentAnnotations = () => {
      const canvasAnnotations = annotationsRef.current
        .filter((annotation) => annotation.tool !== 'point')
        .flatMap((annotation) => polygonWithHoles
          ? toAnnotoriousAnnotations(annotation, item, labels)
          : [toAnnotoriousAnnotation(annotation, item, labels)])
      annotator.setAnnotations(canvasAnnotations, true)
    }

    const handleCreate = (annotation: ImageAnnotation) => {
      if (polygonWithHoles && (drawingTool === 'hole' || drawingTool === 'region')) {
        const polygon = toBackendAnnotation(annotation).segmentation[0] ?? []
        const inferredTarget = drawingTool === 'hole'
          ? findPolygonWithHolesTarget(annotationsRef.current, polygon)
          : null
        const targetAnnotationId = inferredTarget?.annotationId ?? maskEditTargetId ?? selectedAnnotationId
        if (!targetAnnotationId) {
          message.warning('孔洞需要画在外轮廓内')
          resetAnnotatorToCurrentAnnotations()
          return
        }
        const nextAnnotations = addPolygonWithHolesPart(
          annotationsRef.current,
          targetAnnotationId,
          polygon,
          drawingTool,
          inferredTarget?.regionIndex,
        )
        const validationError = getPolygonWithHolesValidationError(nextAnnotations)
        if (validationError) {
          message.warning(validationError)
          resetAnnotatorToCurrentAnnotations()
          onSelectAnnotation(targetAnnotationId)
          return
        }

        onChange(nextAnnotations)
        onSelectAnnotation(targetAnnotationId)
        return
      }

      const nextAnnotations = mergeCanvasAnnotationsWithPoints(annotationsRef.current, annotator.getAnnotations(), polygonWithHoles)
      const validationError = polygonWithHoles ? getPolygonWithHolesValidationError(nextAnnotations) : null
      if (validationError) {
        message.warning(validationError)
        resetAnnotatorToCurrentAnnotations()
        return
      }

      onChange(nextAnnotations)
      if (annotation.id) onAnnotationCreated(annotation.id)
    }

    const handleUpdate = () => {
      const nextAnnotations = mergeCanvasAnnotationsWithPoints(annotationsRef.current, annotator.getAnnotations(), polygonWithHoles)
      const validationError = polygonWithHoles ? getPolygonWithHolesValidationError(nextAnnotations) : null
      if (validationError) {
        message.warning(validationError)
        resetAnnotatorToCurrentAnnotations()
        return
      }

      onChange(nextAnnotations)
    }

    const handleDelete = () => {
      onChange(mergeCanvasAnnotationsWithPoints(annotationsRef.current, annotator.getAnnotations(), polygonWithHoles))
      onSelectAnnotation(null)
    }

    const handleSelectionChange = (selection: ImageAnnotation[]) => {
      const selected = selection[0]
      if (polygonWithHoles && (drawingTool === 'hole' || drawingTool === 'region') && !selected) {
        return
      }
      const parentId = selected?.properties?.maskParentId
      if (polygonWithHoles && typeof parentId === 'string') {
        const regionIndex = Number(selected?.properties?.maskRegionIndex)
        const holeIndex = Number(selected?.properties?.maskHoleIndex)
        const part = selected?.properties?.maskPart === 'hole' ? 'hole' : 'exterior'
        onSelectMaskPart?.({
          parentId,
          part,
          regionIndex: Number.isFinite(regionIndex) ? regionIndex : 0,
          holeIndex: Number.isFinite(holeIndex) ? holeIndex : undefined,
        })
        onSelectAnnotation(parentId)
        return
      }

      onSelectMaskPart?.(null)
      onSelectAnnotation(selected?.id ?? null)
    }

    annotator.on('createAnnotation', handleCreate)
    annotator.on('updateAnnotation', handleUpdate)
    annotator.on('deleteAnnotation', handleDelete)
    annotator.on('selectionChanged', handleSelectionChange)

    return () => {
      annotator.off('createAnnotation', handleCreate)
      annotator.off('updateAnnotation', handleUpdate)
      annotator.off('deleteAnnotation', handleDelete)
      annotator.off('selectionChanged', handleSelectionChange)
    }
  }, [annotator, annotationsRef, drawingTool, item, labels, maskEditTargetId, onAnnotationCreated, onChange, onSelectAnnotation, onSelectMaskPart, polygonWithHoles, selectedAnnotationId])
}
