import { Descriptions, Tag, Typography, message } from 'antd'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { ModelTypeMapping, TrainingMethodTypeMapping } from '@/utils/EnumMaping.ts'
import type { Attribute } from '@/types/training'
import { formatDatasetCreationStatus, formatDatasetVersionStatus, isDatasetCreateSucceeded } from '@/utils/datasetStatus'

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
  dataset_config?: Record<string, any> | string | null
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
  const creationStatus = formatDatasetCreationStatus(data.processing_status_display)
  const text = isDatasetCreateSucceeded(creationStatus)
    ? formatDatasetVersionStatus(data as unknown as Record<string, any>)
    : (data.publish_display || '-')
  const color = text === '已发布' ? 'green' : 'orange'
  return <Tag color={color}>{text}</Tag>
}

const formatAttributeValue = (item: Attribute) => {
  const optionValues = item.options
    ?.map((option) => {
      if (typeof option === 'string') return option
      return option.option_value
    })
    .filter(Boolean)
    .join('、')
  const manualValue = (item as any).attr_value
  if (optionValues) return optionValues
  if (Array.isArray(manualValue)) return manualValue.filter(Boolean).join('、') || '-'
  return manualValue !== undefined && manualValue !== null && manualValue !== '' ? String(manualValue) : '-'
}

const getAttributeGroupName = (item: Attribute) => {
  const group = (item as any).group
  return typeof group === 'string' && group.trim() ? group.trim() : '未分组'
}

const renderAttributeGroups = (attrValues?: Attribute[]) => {
  if (!attrValues?.length) return <Text>-</Text>

  const groupMap = new Map<string, Attribute[]>()
  attrValues.forEach((item) => {
    const groupName = getAttributeGroupName(item)
    const current = groupMap.get(groupName) || []
    current.push(item)
    groupMap.set(groupName, current)
  })

  const orderedGroups = [
    ...(['未分组'].filter((groupName) => groupMap.has(groupName))),
    ...Array.from(groupMap.keys()).filter((groupName) => groupName !== '未分组'),
  ]

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {orderedGroups.map((groupName) => (
        <div key={groupName} className="inline-flex max-w-full items-center gap-2">
          <div className="shrink-0 text-xs font-medium text-gray-500">{groupName}</div>
          <div className="inline-flex min-w-0 flex-wrap gap-2">
            {groupMap.get(groupName)?.map((item, index) => (
              <span
                key={`${groupName}-${item.attr_id || item.name}-${index}`}
                className="inline-flex max-w-full items-center gap-1 rounded border border-gray-200 bg-gray-50 px-2.5 py-1 text-sm leading-5"
              >
                <span className="shrink-0 text-gray-500">{item.name || '未命名属性'}</span>
                <span className="text-gray-400">:</span>
                <span className="min-w-0 break-words text-gray-900">{formatAttributeValue(item)}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const normalizeSourceVersions = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value.split(/[,+，、]/).map((item) => item.trim()).filter(Boolean)
  }
  return []
}

const getDatasetConfig = (rawConfig: BasicViewDataType['dataset_config']) => {
  if (!rawConfig) return {}
  if (typeof rawConfig === 'string') {
    try {
      const parsed = JSON.parse(rawConfig)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, any>
        : {}
    }
    catch {
      return {}
    }
  }
  return rawConfig
}

const formatDatasetSource = (data: BasicViewDataType) => {
  const config = getDatasetConfig(data.dataset_config)
  const dataSourceType = config.data_source_type || config.source_type || config.data_source
  const inheritSource = config.inherit_source_version || config.source_version || config.inherit_version
  const mergeSources = normalizeSourceVersions(config.merge_source_versions || config.source_versions || config.merge_versions)
  const hasUploadedFiles = Boolean(config.has_uploaded_files || config.local_upload || config.uploaded_files)

  if (dataSourceType === 'merge' || mergeSources.length > 0) {
    return mergeSources.length > 0 ? `合并（${mergeSources.join('+')}）` : '合并'
  }
  if (inheritSource) {
    const inherited = `继承（${inheritSource}）`
    return dataSourceType === 'inherit_upload' || hasUploadedFiles
      ? `${inherited}+本地上传`
      : inherited
  }
  return '本地上传'
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

  const items: Array<{ key: string, label: string, children: ReactNode, span?: number }> = [
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
      label: '创建状态',
      children: <strong>{formatDatasetCreationStatus(data.processing_status_display)}</strong>,
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
      key: 'data_source',
      label: '数据来源',
      children: <Text>{formatDatasetSource(data)}</Text>,
    },
    {
      key: 'created_at',
      label: '创建时间',
      children: <Text>{data.created_at ? new Date(data.created_at).toLocaleString() : ''}</Text>,
    },
  ]

  return (
    <div>
      <Descriptions column={2} size="middle">
        {items.map((item) => (
          <Descriptions.Item key={item.key} label={item.label} span={item.span}>
            {item.children}
          </Descriptions.Item>
        ))}
      </Descriptions>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <div className="flex items-start gap-4">
          <div className="w-[76px] shrink-0 text-sm text-gray-400">数据属性</div>
          <div className="min-w-0 flex-1">
            {renderAttributeGroups(data.attr_values)}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DatasetDetailBasicView
