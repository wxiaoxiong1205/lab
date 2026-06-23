import React from 'react'
import { Spin, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type {
  AnnotationKind,
  EntitySpanItem,
  ImageAnnotationItem,
  OnlineAnnotationPageItem,
} from '../../types'
import EntityRecognitionWorkspace from './EntityRecognitionWorkspace'
import SegmentationWorkspace, { type SegmentationDrawingTool } from './SegmentationWorkspace'

const WORKSPACE_KINDS: AnnotationKind[] = ['image-segmentation', 'object-detection']

interface DetailContentProps {
  isPageLoading: boolean
  kind: AnnotationKind
  item?: OnlineAnnotationPageItem
  readOnly?: boolean
  polygonWithHoles?: boolean
  annotations: ImageAnnotationItem[]
  entitySpans: EntitySpanItem[]
  labels: string[]
  drawingTool: SegmentationDrawingTool
  columns: ColumnsType<OnlineAnnotationPageItem>
  onDrawingToolChange: (tool: SegmentationDrawingTool) => void
  onSegmentationChange: (annotations: ImageAnnotationItem[]) => void
  onEntitySpansChange: (spans: EntitySpanItem[]) => void
}

const DetailContent: React.FC<DetailContentProps> = ({
  isPageLoading,
  kind,
  item,
  readOnly = false,
  polygonWithHoles = false,
  annotations,
  entitySpans,
  labels,
  drawingTool,
  columns,
  onDrawingToolChange,
  onSegmentationChange,
  onEntitySpansChange,
}) => {
  const isWorkspaceTask = WORKSPACE_KINDS.includes(kind)

  return (
    <div className="min-h-0 min-w-0 overflow-auto p-4">
      {isPageLoading
        ? (
            <div className="flex h-full min-h-[320px] items-center justify-center">
              <Spin size="large" />
            </div>
          )
        : isWorkspaceTask && item
          ? (
              <SegmentationWorkspace
                item={item}
                annotations={annotations}
                labels={labels}
                readOnly={readOnly}
                polygonWithHoles={polygonWithHoles}
                drawingTool={drawingTool}
                onDrawingToolChange={onDrawingToolChange}
                onChange={onSegmentationChange}
              />
            )
          : kind === 'entity-recognition' && item
            ? (
                <EntityRecognitionWorkspace
                  item={item}
                  labels={labels}
                  spans={entitySpans}
                  readOnly={readOnly}
                  onChange={onEntitySpansChange}
                />
              )
            : (
                <Table
                  columns={columns}
                  dataSource={item ? [item] : []}
                  rowKey="id"
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  bordered={false}
                  className="[&_.ant-table-thead>tr>th]:bg-white [&_.ant-table-thead>tr>th]:text-[#6b7280] [&_.ant-table-tbody>tr>td]:align-top"
                />
              )}
    </div>
  )
}

export default DetailContent
