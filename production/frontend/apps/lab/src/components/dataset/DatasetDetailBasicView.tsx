import { Descriptions, Tag, Typography, message } from 'antd'
import { useState } from 'react'
import { ModelTypeMapping, TrainingMethodTypeMapping } from '@/utils/EnumMaping.ts'
import type { Attribute } from '@/types/training'

const { Paragraph, Text } = Typography

export interface BasicViewDataType {
  processing_status_display: string
  name: string
  total_samples: number
  training_method_type: string
  total_characters: number
  dataset_format: string
  file_size: number
  created_by: string
  description: string
  created_at: string
  usage: string
  dataset_type: string
  publish_display?: string
  attr_values: Attribute[]
}

const getFormatTag = (format: string, selectedVersion?: BasicViewDataType) => {
  const formatMap: Record<string, { color: string, text: string }> = {
    'role-based': { color: 'blue', text: 'ROLE_BASED' },
    'json': { color: 'blue', text: 'JSON' },
    'csv': { color: 'blue', text: 'CSV' },
    'xlsx': { color: 'blue', text: 'Excel' },
    'alpaca': { color: 'blue', text: 'ALPACA' },
    'prompt-response': { color: 'blue', text: 'PROMPT_RESPONSE' },
    'grpo': { color: 'blue', text: 'GRPO' },
  }
  const config = formatMap[format] || formatMap[selectedVersion?.dataset_format || ''] || { color: 'default', text: format || selectedVersion?.dataset_format || '未知格式' }
  return <Tag color={config.color}>{config.text}</Tag>
}

const getPublishTag = (data: BasicViewDataType) => {
  const text = data.publish_display
  const color = text === '已发布' ? 'green' : 'orange'
  return <Tag color={color}>{text}</Tag>
}

const DatasetDetailBasicView = ({
  data,
  usage,
  onEditBasicInfo,
}: {
  data: BasicViewDataType
  usage?: string
  onEditBasicInfo?: (values: { name?: string, description?: string }) => Promise<void>
}) => {
  const [editingField, setEditingField] = useState<'name' | 'description' | null>(null)

  const handleEditBasicInfo = async (field: 'name' | 'description', value: string) => {
    const nextValue = value.trim()
    const currentValue = field === 'name' ? data.name || '' : data.description || ''

    if (field === 'name' && !nextValue) {
      message.warning('数据集名称不能为空')
      return
    }
    if (nextValue === currentValue || !onEditBasicInfo) {
      return
    }

    setEditingField(field)
    try {
      await onEditBasicInfo({ [field]: nextValue })
    }
    finally {
      setEditingField(null)
    }
  }

  const items = [
    {
      key: 'name',
      label: '数据集名称',
      children: (
        <Text
          // editable={onEditBasicInfo
          //   ? {
          //       tooltip: '编辑名称',
          //       triggerType: ['icon'],
          //       onChange: (value) => handleEditBasicInfo('name', value),
          //     }
          //   : false}
          disabled={editingField === 'name'}
        >
          {data.name || '-'}
        </Text>
      ),
    },
    {
      key: 'total_samples',
      label: '数据量',
      children: (
        <Text strong>
          {(data.total_samples || 0).toLocaleString()}
          {' '}
          条
        </Text>
      ),
    },
    ...(data.usage !== 'business_test' ? [{
      key: 'training_method_type',
      label: '数据用途',
      children: TrainingMethodTypeMapping(data.training_method_type || '').text
        ? `${TrainingMethodTypeMapping(data.training_method_type || '').text}-${ModelTypeMapping(data.dataset_type || '').text}`
        : ModelTypeMapping(data.dataset_type || '').text,
    },
    {
      key: 'dataset_format',
      label: '数据格式',
      children: getFormatTag(data.dataset_format || '', data),
    }] : []),
    {
      key: 'processing_status_display',
      label: '状态',
      children: <strong>{data.processing_status_display || '-'}</strong>,
    },
    {
      key: 'publish_display',
      label: '发布状态',
      children: getPublishTag(data),
    },
    {
      key: 'file_size',
      label: '文件大小',
      children: (
        <Text>
          {data.file_size?.toFixed(2) || '--'}
          {' '}
          MB
        </Text>
      ),
    },
    ...(usage === 'business_test' ? [{
      key: 'created_by',
      label: '创建人',
      children: <Text>{data.created_by || '-'}</Text>,
    }] : []),
    {
      key: 'description',
      label: '描述',
      children: (
        <Paragraph
          className="!mb-0"
          editable={onEditBasicInfo
            ? {
                tooltip: '编辑描述',
                triggerType: ['icon'],
                autoSize: { minRows: 1, maxRows: 4 },
                onChange: (value) => handleEditBasicInfo('description', value),
              }
            : false}
          disabled={editingField === 'description'}
        >
          {data.description || '-'}
        </Paragraph>
      ),
    },
    {
      key: 'created_at',
      label: '创建时间',
      children: <Text>{data.created_at ? new Date(data.created_at).toLocaleString() : ''}</Text>,
    },
    {
      key: 'attr_values',
      label: '属性分类',
      children: <Text>{data.attr_values?.map((item) => item.options?.map((option) => option.option_value).join(',') || '-').join(',') || '-'}</Text>,
    },
  ]

  return (
    <Descriptions column={2} size="middle">
      {items.map((item) => (
        <Descriptions.Item key={item.key} label={item.label}>
          {item.children}
        </Descriptions.Item>
      ))}
    </Descriptions>
  )
}

export default DatasetDetailBasicView
