import { Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type React from 'react'
import type { EvaluationResultData, EvaluationType } from '@/types/ReportDetailTypes.ts'
import ExpandableCell from '@/components/common/ExpandableCell'
import { parseUserAssistantTags, replaceImagePlaceholders } from '@/utils/imageUtils'

interface BuildEvaluationResultColumnsParams {
  evaluationPrefix?: string
  evaluationType: EvaluationType
  businessDynamicFieldKeys: string[]
  availableMetrics: string[]
  itemIndexFirstRowMap: Map<number, number>
  itemIndexRowSpanMap: Map<number, number>
  expandedCells: Set<string>
  toggleCellExpand: (rowKey: string, columnKey: string) => void
}

function renderMergedCell(
  record: EvaluationResultData,
  index: number,
  maps: Pick<BuildEvaluationResultColumnsParams, 'itemIndexFirstRowMap' | 'itemIndexRowSpanMap'>,
  renderChildren: () => React.ReactNode,
) {
  if (record.item_index === undefined) return null

  const firstRowIndex = maps.itemIndexFirstRowMap.get(record.item_index)
  const rowSpan = maps.itemIndexRowSpanMap.get(record.item_index) || 1

  if (firstRowIndex === index) {
    return {
      children: renderChildren(),
      props: {
        rowSpan,
        className: 'relative',
      },
    }
  }

  return {
    children: null,
    props: {
      rowSpan: 0,
    },
  }
}

function imageStartIndex(record: EvaluationResultData, keys: Array<'prompt' | 'response'>) {
  return keys.reduce((sum, key) => sum + ((record[key] || '').match(/<image>/g) || []).length, 0)
}

function processedText(record: EvaluationResultData, text: string, startIndex: number, parseTags = true) {
  const { processedContent } = replaceImagePlaceholders(
    text || '',
    record.images || [],
    record.baseUrl || '',
    startIndex,
  )
  return parseTags ? parseUserAssistantTags(processedContent) : processedContent
}

function expandableTextCell({
  text,
  record,
  columnKey,
  bgColor,
  borderColor,
  expandedCells,
  toggleCellExpand,
  startIndex = 0,
  parseTags = true,
}: {
  text: string
  record: EvaluationResultData
  columnKey: string
  bgColor: string
  borderColor: string
  expandedCells: Set<string>
  toggleCellExpand: (rowKey: string, columnKey: string) => void
  startIndex?: number
  parseTags?: boolean
}) {
  const rowKey = record.key
  const content = processedText(record, text, startIndex, parseTags)

  return (
    <ExpandableCell
      text={content}
      rowKey={rowKey}
      columnKey={columnKey}
      bgColor={bgColor}
      borderColor={borderColor}
      isExpanded={expandedCells.has(`${rowKey}-${columnKey}`)}
      onToggle={toggleCellExpand}
    />
  )
}

function mergedExpandableCell(children: React.ReactNode) {
  return (
    <div className="absolute top-2 right-4 bottom-2 left-4 flex flex-col items-center justify-center">
      {children}
    </div>
  )
}

function buildMetricColumns(availableMetrics: string[]): ColumnsType<EvaluationResultData> {
  return availableMetrics.map((metricName) => {
    const dataIndex = metricName.toLowerCase().replace(/\s+/g, '_')

    return {
      title: metricName,
      dataIndex,
      key: dataIndex,
      width: 100,
      align: 'center' as const,
      render: (_value: unknown, record: EvaluationResultData) => {
        const percentageScore = record.scores[dataIndex]
        const score = record.metricScores?.[dataIndex]
        const scoreMax = record.metricScoreMaxs?.[dataIndex]
        const hasScore = percentageScore !== undefined && percentageScore !== null
        const metricReason = record.metricReasons?.[dataIndex] || record.reason || ''
        const tooltipContent = hasScore && score !== undefined && score !== null && scoreMax !== undefined && scoreMax !== null && scoreMax > 0 ? (
          <div className="text-left">
            <div>
              得分/最大值：
              {score}
              /
              {scoreMax}
            </div>
            <div>
              打分原因：
              {metricReason || '无'}
            </div>
          </div>
        ) : null

        const content = (
          <div className="font-medium">
            {percentageScore !== undefined && percentageScore !== null ? percentageScore.toFixed(2) : '-'}
          </div>
        )

        return (
          <div className="text-center">
            {hasScore && tooltipContent ? (
              <Tooltip title={tooltipContent}>
                {content}
              </Tooltip>
            ) : (
              content
            )}
          </div>
        )
      },
    }
  })
}

export function buildEvaluationResultColumns({
  evaluationPrefix,
  evaluationType,
  businessDynamicFieldKeys,
  availableMetrics,
  itemIndexFirstRowMap,
  itemIndexRowSpanMap,
  expandedCells,
  toggleCellExpand,
}: BuildEvaluationResultColumnsParams): ColumnsType<EvaluationResultData> {
  const isBusinessDynamicTable
    = evaluationPrefix === 'BUSSINESS' && evaluationType === 'auto' && businessDynamicFieldKeys.length > 0

  const maps = { itemIndexFirstRowMap, itemIndexRowSpanMap }

  const businessDynamicTextColumns: ColumnsType<EvaluationResultData> = isBusinessDynamicTable
    ? businessDynamicFieldKeys.map((fieldKey) => ({
        title: fieldKey,
        key: `dyn-${fieldKey}`,
        width: 260,
        ellipsis: { showTitle: false },
        render: (_: unknown, record: EvaluationResultData) => {
          const rowKey = record.key
          const text = record.rawFields?.[fieldKey] ?? ''
          const finalContent = processedText(record, text, 0)
          return (
            <div className="min-w-0 w-full">
              <ExpandableCell
                text={finalContent}
                rowKey={rowKey}
                columnKey={fieldKey}
                bgColor="transparent"
                borderColor="transparent"
                isExpanded={expandedCells.has(`${rowKey}-${fieldKey}`)}
                onToggle={toggleCellExpand}
              />
            </div>
          )
        },
      }))
    : []

  const legacyTextColumns: ColumnsType<EvaluationResultData> = [
    {
      title: 'System',
      dataIndex: 'system',
      key: 'system',
      width: 300,
      ellipsis: { showTitle: false },
      render: (text: string, record: EvaluationResultData, index: number) => {
        if (evaluationType === 'manual' && record.item_index !== undefined) {
          return renderMergedCell(record, index, maps, () =>
            mergedExpandableCell(
              expandableTextCell({
                text: text || '-',
                record,
                columnKey: 'system',
                bgColor: '#fff7e6',
                borderColor: '#faad14',
                expandedCells,
                toggleCellExpand,
              }),
            ))
        }

        return expandableTextCell({
          text: text || '-',
          record,
          columnKey: 'system',
          bgColor: '#fff7e6',
          borderColor: '#faad14',
          expandedCells,
          toggleCellExpand,
        })
      },
    },
    {
      title: 'Prompt',
      dataIndex: 'prompt',
      key: 'prompt',
      width: 300,
      ellipsis: { showTitle: false },
      render: (text: string, record: EvaluationResultData, index: number) => {
        if (evaluationType === 'manual' && record.item_index !== undefined) {
          return renderMergedCell(record, index, maps, () =>
            mergedExpandableCell(
              expandableTextCell({
                text: text || '',
                record,
                columnKey: 'prompt',
                bgColor: '#fff7e6',
                borderColor: '#faad14',
                expandedCells,
                toggleCellExpand,
              }),
            ))
        }

        return expandableTextCell({
          text: text || '',
          record,
          columnKey: 'prompt',
          bgColor: '#fff7e6',
          borderColor: '#faad14',
          expandedCells,
          toggleCellExpand,
        })
      },
    },
    {
      title: 'Response (回答)',
      dataIndex: 'response',
      key: 'response',
      width: 240,
      ellipsis: { showTitle: false },
      render: (text: string, record: EvaluationResultData, index: number) => {
        const startIndex = imageStartIndex(record, ['prompt'])
        if (evaluationType === 'manual' && record.item_index !== undefined) {
          return renderMergedCell(record, index, maps, () =>
            mergedExpandableCell(
              expandableTextCell({
                text: text || '',
                record,
                columnKey: 'response',
                bgColor: '#f6ffed',
                borderColor: '#52c41a',
                expandedCells,
                toggleCellExpand,
                startIndex,
              }),
            ))
        }

        return expandableTextCell({
          text: text || '',
          record,
          columnKey: 'response',
          bgColor: '#f6ffed',
          borderColor: '#52c41a',
          expandedCells,
          toggleCellExpand,
          startIndex,
          parseTags: false,
        })
      },
    },
    {
      title: 'Model Response (模型回答)',
      dataIndex: 'modelResponse',
      key: 'modelResponse',
      width: 220,
      ellipsis: { showTitle: false },
      render: (text: string, record: EvaluationResultData) =>
        expandableTextCell({
          text: text || '',
          record,
          columnKey: 'modelResponse',
          bgColor: '#fff2f0',
          borderColor: '#ff4d4f',
          expandedCells,
          toggleCellExpand,
          startIndex: imageStartIndex(record, ['prompt', 'response']),
          parseTags: false,
        }),
    },
  ]

  const textColumns = isBusinessDynamicTable ? businessDynamicTextColumns : legacyTextColumns

  const allColumns: ColumnsType<EvaluationResultData> = [
    {
      title: '序号',
      dataIndex: 'sequence',
      key: 'sequence',
      width: 80,
      fixed: 'left' as const,
      render: (text: number, record: EvaluationResultData, index: number) => {
        if (evaluationType === 'manual' && record.item_index !== undefined) {
          const merged = renderMergedCell(record, index, maps, () => (
            <div className="flex h-full items-center justify-center">
              {text}
            </div>
          ))
          if (merged) {
            const props = { ...merged.props }
            delete props.className
            return { ...merged, props }
          }
        }
        return text
      },
    },
    {
      title: '待评估模型服务',
      dataIndex: 'model_name',
      key: 'model_name',
      width: 100,
      render: (text: string) => (
        <div className="whitespace-pre-wrap text-xs leading-[1.4]">{text}</div>
      ),
    },
    ...textColumns,
    {
      title: '指标',
      key: 'evaluationMetrics',
      align: 'center' as const,
      children: buildMetricColumns(availableMetrics),
    },
  ]

  return allColumns.filter((col) => !(evaluationType === 'auto' && col.key === 'model_name'))
}
