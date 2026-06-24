import { QuestionCircleOutlined } from '@ant-design/icons'
import { Empty, Form, Input, InputNumber, Select, Switch, Tooltip } from 'antd'
import type { FormInstance } from 'antd'
import type { NamePath } from 'antd/es/form/interface'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import SegmentedSwitch from './SegmentedSwitch'

type DynamicFieldValue = string | number | boolean | null
type DynamicFieldControlType = 'string' | 'number' | 'boolean' | 'enum'

export interface DynamicFieldSchema {
  id?: string | number | null
  field_name: string
  category?: string | null
  description?: string | null
  field_type: string
  enum_options?: string[] | null
  default_value?: DynamicFieldValue
  sort_order?: number | null
  required?: boolean
  enabled?: boolean
}

export interface DynamicFieldGroupSchema {
  category?: string | null
  fields?: DynamicFieldSchema[] | null
}

interface ParsedDynamicField {
  formName: NamePath
  valueKey: string
  label: string
  value: DynamicFieldValue
  type: DynamicFieldControlType
  enumOptions?: string[]
  description?: string
  sectionTitle?: string
  required?: boolean
}

interface ParsedDynamicFieldSection {
  id: string
  title?: string
  fields: ParsedDynamicField[]
}

interface ParsedDynamicFieldGroup {
  id: string
  title: string
  values: Record<string, DynamicFieldValue>
  sections: ParsedDynamicFieldSection[]
}

export interface DynamicFieldFormProps {
  fieldGroups?: DynamicFieldGroupSchema[] | null
  form?: FormInstance
  namePrefix?: NamePath
  className?: string
  emptyDescription?: ReactNode
  columns?: 1 | 2
  resetKey?: string | number | null
  resetOnFieldGroupsChange?: boolean
}

const STRING_FIELD_TYPES = ['str', 'string']
const BOOLEAN_FIELD_TYPES = ['bool', 'boolean']
const NUMBER_FIELD_TYPES = ['int', 'integer', 'float', 'number']
const ENUM_FIELD_TYPES = ['enum']

function parseScalarValue(value: string): DynamicFieldValue {
  const normalized = value.trim()
  if (/^(null|~)$/i.test(normalized))
    return null

  if (/^(true|false)$/i.test(normalized))
    return normalized.toLowerCase() === 'true'

  if (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(normalized))
    return Number(normalized)

  return normalized.replace(/^['"]|['"]$/g, '')
}

function normalizeFieldType(fieldType?: string) {
  return fieldType?.toLowerCase()
}

function parseStringFieldValue(value: DynamicFieldValue) {
  if (value == null)
    return null

  return String(value).trim().replace(/^(['"])(.*)\1$/, '$2')
}

function parseFieldValue(value?: DynamicFieldValue, fieldType?: string) {
  if (value == null || value === '')
    return null

  const normalizedFieldType = normalizeFieldType(fieldType)
  if (normalizedFieldType && (STRING_FIELD_TYPES.includes(normalizedFieldType) || ENUM_FIELD_TYPES.includes(normalizedFieldType)))
    return parseStringFieldValue(value)

  if (normalizedFieldType && BOOLEAN_FIELD_TYPES.includes(normalizedFieldType)) {
    if (typeof value === 'boolean')
      return value

    return /^(true|1)$/i.test(String(value).trim())
  }

  if (normalizedFieldType && NUMBER_FIELD_TYPES.includes(normalizedFieldType)) {
    if (typeof value === 'number')
      return value

    const parsedNumber = Number(String(value).trim().replace(/^['"]|['"]$/g, ''))
    return Number.isNaN(parsedNumber) ? null : parsedNumber
  }

  if (typeof value === 'number' || typeof value === 'boolean')
    return value

  return parseScalarValue(value)
}

function getFieldControlType(value: DynamicFieldValue, fieldType?: string): DynamicFieldControlType {
  const normalized = normalizeFieldType(fieldType)
  if (normalized && ENUM_FIELD_TYPES.includes(normalized))
    return 'enum'
  if (normalized && STRING_FIELD_TYPES.includes(normalized))
    return 'string'
  if (normalized && BOOLEAN_FIELD_TYPES.includes(normalized))
    return 'boolean'
  if (normalized && NUMBER_FIELD_TYPES.includes(normalized))
    return 'number'

  if (typeof value === 'boolean')
    return 'boolean'
  if (typeof value === 'number')
    return 'number'
  return 'string'
}

function coerceFieldValueByType(value: DynamicFieldValue | undefined, fieldType?: string): DynamicFieldValue {
  if (value == null || value === '')
    return null

  const normalizedFieldType = normalizeFieldType(fieldType)
  if (normalizedFieldType && (STRING_FIELD_TYPES.includes(normalizedFieldType) || ENUM_FIELD_TYPES.includes(normalizedFieldType)))
    return String(value)

  if (normalizedFieldType && BOOLEAN_FIELD_TYPES.includes(normalizedFieldType)) {
    if (typeof value === 'boolean')
      return value

    return /^(true|1)$/i.test(String(value).trim())
  }

  if (normalizedFieldType && NUMBER_FIELD_TYPES.includes(normalizedFieldType)) {
    if (typeof value === 'number')
      return value

    const parsedNumber = Number(String(value).trim())
    return Number.isNaN(parsedNumber) ? null : parsedNumber
  }

  return value
}

function getFieldLabel(fieldName: string) {
  const segments = fieldName.split('.').filter(Boolean)
  return segments[segments.length - 1] || fieldName
}

function getFieldSectionTitle(fieldName: string, category?: string | null) {
  const segments = fieldName.split('.').filter(Boolean)
  if (segments.length < 3)
    return undefined

  const categorySegments = category?.split('.').filter(Boolean) ?? []
  if (categorySegments.length > 0) {
    const isCategoryPrefix = categorySegments.every((segment, index) => segments[index] === segment)
    if (isCategoryPrefix && categorySegments.length < segments.length - 1)
      return segments[categorySegments.length]
  }

  return segments[segments.length - 2]
}

function normalizeNamePrefix(namePrefix?: NamePath) {
  if (namePrefix == null)
    return []

  return Array.isArray(namePrefix) ? namePrefix : [namePrefix]
}

function parseDynamicFieldGroups(fieldGroups?: DynamicFieldGroupSchema[] | null, namePrefix?: NamePath) {
  const values: Record<string, DynamicFieldValue> = {}
  const prefix = normalizeNamePrefix(namePrefix)
  const groups: ParsedDynamicFieldGroup[] = (fieldGroups ?? []).map((group, groupIndex) => {
    const groupId = `dynamic_group_${groupIndex + 1}`
    const enabledFields = (group.fields ?? [])
      .filter((field) => field.enabled !== false)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

    const fields = enabledFields.map((field, fieldIndex) => {
      const parsedValue = parseFieldValue(field.default_value, field.field_type)
      const valueKey = field.field_name || `${groupId}_${field.id ?? fieldIndex}`
      const formName = [...prefix, valueKey]
      values[valueKey] = parsedValue

      return {
        formName,
        valueKey,
        label: getFieldLabel(field.field_name),
        value: parsedValue,
        type: getFieldControlType(parsedValue, field.field_type),
        enumOptions: field.enum_options ?? undefined,
        description: field.description ?? undefined,
        sectionTitle: getFieldSectionTitle(field.field_name, group.category),
        required: field.required,
      }
    })

    const sections = fields.reduce<ParsedDynamicFieldSection[]>((result, field) => {
      const title = field.sectionTitle
      const id = title || '__default__'
      const section = result.find((item) => item.id === id)

      if (section) {
        section.fields.push(field)
        return result
      }

      result.push({ id, title, fields: [field] })
      return result
    }, [])

    return {
      id: groupId,
      title: group.category || '参数配置',
      values: fields.reduce<Record<string, DynamicFieldValue>>((result, field) => {
        result[field.valueKey] = field.value
        return result
      }, {}),
      sections,
    }
  })

  return { values, groups: groups.filter((group) => group.sections.some((section) => section.fields.length > 0)) }
}

function buildFieldTypeMap(groups: ParsedDynamicFieldGroup[]) {
  const typeMap: Record<string, DynamicFieldControlType> = {}

  groups.forEach((group) => {
    group.sections.forEach((section) => {
      section.fields.forEach((field) => {
        typeMap[field.valueKey] = field.type
      })
    })
  })

  return typeMap
}

function normalizeDynamicValues(
  currentValues: Record<string, DynamicFieldValue> | undefined,
  defaultValues: Record<string, DynamicFieldValue>,
  typeMap: Record<string, DynamicFieldControlType>,
) {
  const nextValues = { ...defaultValues }

  Object.entries(currentValues ?? {}).forEach(([key, value]) => {
    const fieldType = typeMap[key]
    if (fieldType)
      nextValues[key] = coerceFieldValueByType(value, fieldType)
  })

  return nextValues
}

export function DynamicFieldForm({
  fieldGroups,
  form: externalForm,
  namePrefix,
  className = 'max-h-[430px] overflow-y-auto pr-2',
  emptyDescription = '暂无 fields 字段配置',
  columns = 2,
  resetKey,
  resetOnFieldGroupsChange = false,
}: DynamicFieldFormProps) {
  const [innerForm] = Form.useForm()
  const form = externalForm ?? innerForm
  const [activeGroupId, setActiveGroupId] = useState<string>()
  const lastResetKeyRef = useRef<string | number | null | undefined>()
  const parsed = useMemo(() => parseDynamicFieldGroups(fieldGroups, namePrefix), [fieldGroups, namePrefix])
  const fieldTypeMap = useMemo(() => buildFieldTypeMap(parsed.groups), [parsed.groups])
  const activeGroup = parsed.groups.find((group) => group.id === activeGroupId) ?? parsed.groups[0]

  useEffect(() => {
    const shouldResetToDefaults = resetOnFieldGroupsChange || (resetKey != null && lastResetKeyRef.current !== resetKey)
    lastResetKeyRef.current = resetKey

    if (!namePrefix) {
      const currentValues = form.getFieldsValue()
      form.setFieldsValue(shouldResetToDefaults ? parsed.values : normalizeDynamicValues(currentValues, parsed.values, fieldTypeMap))
      return
    }

    const currentValues = form.getFieldValue(namePrefix)
    const nextValues = shouldResetToDefaults ? parsed.values : normalizeDynamicValues(currentValues, parsed.values, fieldTypeMap)
    form.setFieldValue(namePrefix, nextValues)
  }, [fieldTypeMap, form, namePrefix, parsed.values, resetKey, resetOnFieldGroupsChange])

  useEffect(() => {
    setActiveGroupId(parsed.groups[0]?.id)
  }, [parsed.groups])

  if (parsed.groups.length === 0) {
    return (
      <div className="flex min-h-[240px] items-center justify-center">
        <Empty description={emptyDescription} />
      </div>
    )
  }

  const renderFieldControl = (field: ParsedDynamicField) => {
    if (field.type === 'boolean')
      return <Switch checkedChildren="是" unCheckedChildren="否" />

    if (field.type === 'number')
      return <InputNumber className="w-full" placeholder={field.description} />

    if (field.type === 'enum') {
      return (
        <Select
          className="w-full"
          placeholder={field.description || '请选择'}
          options={(field.enumOptions ?? []).map((option) => ({ label: option, value: option }))}
          allowClear={!field.required}
        />
      )
    }

    return <Input placeholder={field.description} />
  }

  const renderFieldLabel = (field: ParsedDynamicField) => {
    if (!field.description)
      return field.label

    return (
      <span className="inline-flex items-center gap-1">
        <span>{field.label}</span>
        <Tooltip title={field.description}>
          <QuestionCircleOutlined className="cursor-help text-[13px] text-[var(--lab-color-text-tertiary)]" />
        </Tooltip>
      </span>
    )
  }

  const content = (
    <>
      <div className="sticky top-0 z-10 mb-5 overflow-x-auto bg-[var(--lab-color-surface-elevated)] pb-3">
        <SegmentedSwitch
          value={activeGroup?.id}
          options={parsed.groups.map((group) => ({ label: group.title, value: group.id }))}
          onChange={(value) => setActiveGroupId(String(value))}
        />
      </div>

      {parsed.groups.map((group) => (
        <div
          key={group.id}
          style={{ display: activeGroup?.id === group.id ? undefined : 'none' }}
        >
          {group.sections.map((section) => (
            <div key={section.id} className="mb-2 last:mb-0">
              {section.title && (
                <div className="mb-3 !border-l-4 !border-[#0047bb] pl-2 text-[13px] font-medium text-[var(--lab-color-text-secondary)]">
                  {section.title}
                </div>
              )}
              <div
                className={columns === 1 ? 'grid grid-cols-1 gap-x-4' : 'grid grid-cols-2 gap-x-4'}
              >
                {section.fields.map((field) => (
                  <Form.Item
                    key={field.valueKey}
                    name={field.formName}
                    label={renderFieldLabel(field)}
                    required={field.required}
                    valuePropName={field.type === 'boolean' ? 'checked' : undefined}
                  >
                    {renderFieldControl(field)}
                  </Form.Item>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  )

  if (externalForm) {
    return (
      <div className={className}>
        {content}
      </div>
    )
  }

  return (
    <Form
      form={form}
      layout="vertical"
      className={className}
      initialValues={parsed.values}
    >
      {content}
    </Form>
  )
}
