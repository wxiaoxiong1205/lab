import React, { useMemo } from 'react'
import { Button, Popconfirm, Table, Typography } from 'antd'
import { renderEntityRecognitionText } from './renderEntityRecognitionText'
import type {
  Annotation,
  ItemDetail,
  SampleData,
  SampleData1,
} from '@/services/machineLearnModel'

interface TextTabDetailsProps {
  items: ItemDetail[]
  labelSchema: Record<string, string>
  taskType?: string
  loading: boolean
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  canDeleteRows?: boolean
  deletingRowNumber?: number | null
  onDeleteRow?: (record: ItemDetail) => void | Promise<void>
}

/** 判断是否为实体识别的 annotations 结构（Annotation[]，每项含 offset、tag） */
function isEntityAnnotationList(annotations: unknown): annotations is Annotation[] {
  if (!Array.isArray(annotations) || annotations.length === 0) return false
  const first = annotations[0] as any
  return (
    Array.isArray(first?.offset)
    && first.offset.length >= 2
    && typeof first.tag === 'string'
  )
}

/** 将 annotations 数字数组按 label_schema 转成标签文案 */
function annotationsToLabel(annotations: number[], labelSchema: Record<string, string>): string {
  if (!Array.isArray(annotations) || !labelSchema || Object.keys(labelSchema).length === 0) {
    return ''
  }
  const parts = annotations
    .map((num) => labelSchema[String(num)] ?? String(num))
    .filter(Boolean)
  return parts.join(', ')
}

/** 从接口原始 item 中解析出第一条 SampleData（兼容 sample_data 为数组 / 单对象 / JSON 字符串） */
function getFirstSample(item: any): SampleData | SampleData1 | null {
  let raw = item?.sample_data ?? item?.sampleData
  if (raw == null) return null
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    }
    catch {
      return null
    }
  }
  if (Array.isArray(raw) && raw.length > 0) return raw[0] as SampleData | SampleData1
  if (typeof raw === 'object' && (raw.data != null || raw.content != null || raw.text != null)) {
    return raw as SampleData | SampleData1
  }
  return null
}

function getTextContent(sample: SampleData | SampleData1 | null): string {
  if (!sample) return ''
  const d = (sample as SampleData).data
  if (d && typeof d === 'object') return (d as { content?: string }).content ?? ''
  return ''
}

const TextTabDetails: React.FC<TextTabDetailsProps> = ({
  items,
  labelSchema,
  taskType,
  loading,
  page,
  pageSize,
  total,
  onPageChange,
  canDeleteRows,
  deletingRowNumber,
  onDeleteRow,
}) => {
  const isEntityRecognition
    = taskType === 'text_entity_recognition' || taskType === 'entity_recognition'

  const rows = useMemo(() => {
    const list = Array.isArray(items) ? items : []
    return list.map((item, index) => {
      const first = getFirstSample(item)
      const text = getTextContent(first)
      const rowNumber = item?.row_number ?? (item as any)?.rowNumber ?? index + 1
      const annotations = first?.annotations

      if (isEntityAnnotationList(annotations)) {
        return {
          ...item,
          key: `row-${rowNumber}-${index}`,
          row_number: rowNumber,
          _text: text,
          _entityAnnotations: annotations as Annotation[],
        }
      }

      const label = first ? annotationsToLabel((first as SampleData).annotations ?? [], labelSchema) : ''
      return {
        ...item,
        key: `row-${rowNumber}-${index}`,
        row_number: rowNumber,
        _text: text,
        _label: label,
      }
    })
  }, [items, labelSchema])

  const start = total ? (page - 1) * pageSize + 1 : 0
  const end = Math.min(page * pageSize, total)

  const baseColumns = [
    {
      title: '序号',
      dataIndex: 'row_number',
      key: 'row_number',
      render: (_val: number, record: any) => record.row_number ?? '-',
      width: 80,
      align: 'center' as const,
    },
    {
      title: '文本',
      dataIndex: '_text',
      key: '_text',
      width: 1000,
      render: (_text: string, record: any) => {
        const entityAnnotations = record._entityAnnotations as Annotation[] | undefined
        if (isEntityRecognition && entityAnnotations?.length) {
          return renderEntityRecognitionText(record._text ?? '', entityAnnotations, labelSchema)
        }
        return (
          <div className="max-w-[1000px] whitespace-pre-wrap break-words">
            {record._text || '-'}
          </div>
        )
      },
    },
  ]

  const labelColumn = {
    title: '标签',
    dataIndex: '_label',
    key: '_label',
    width: 180,
    render: (label: string) => <Typography.Text>{label || '-'}</Typography.Text>,
  }

  const actionColumn = {
    title: '操作',
    key: 'action',
    width: 100,
    align: 'center' as const,
    render: (_: unknown, record: ItemDetail) => {
      const rowNumber = Number((record as any)?.row_number)
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
  }

  const columns = [
    ...(isEntityRecognition ? baseColumns : [...baseColumns, labelColumn]),
    ...(canDeleteRows ? [actionColumn] : []),
  ]

  return (
    <Table
      columns={columns}
      dataSource={rows}
      loading={loading}
      rowKey={(record: any) => record?.key ?? `row-${record?.row_number ?? ''}`}
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

export default TextTabDetails
