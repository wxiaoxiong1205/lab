import React, { useEffect, useRef } from 'react'
import { Input, InputNumber, Select, Space, Switch, Typography } from 'antd'
import type { CleaningOperator, CleaningOperatorParamSchema, OperatorConfig } from '@/types/cleaning'

const { Text } = Typography
const { Option } = Select
const { TextArea } = Input
interface OperatorConfigPanelProps {
  operator: CleaningOperator
  config: OperatorConfig
  onConfigChange: (params: any) => void
}
/**
 * 检查值是否为空
 * 用于验证必填项是否已填写
 */
const isEmptyValue = (value: any, type: string): boolean => {
  if (value === null || value === undefined) {
    return true
  }
  if (type === 'string' && value === '') {
    return true
  }
  if (type === 'list') {
    // 对于 list 类型，需要兼容数组和字符串
    // 如果是数组，检查是否为空数组
    if (Array.isArray(value)) {
      return value.length === 0
    }
    // 如果是字符串，检查是否为空字符串（兼容单选的枚举值）
    if (typeof value === 'string') {
      return value === ''
    }
  }
  return false
}
/**
 * 动态渲染单个参数控件
 */
const renderParamField = (paramName: string, schema: CleaningOperatorParamSchema, value: any, onChange: (value: any) => void, hasError: boolean = false): React.ReactNode => {
  const { type, ui_type, enum: enumValues, enum_labels, placeholder, min, max, step, unit, list_item_type } = schema
  if (enumValues && enumValues.length > 0) {
    return (
      <Select value={value} onChange={onChange} placeholder={placeholder || `请选择${paramName}`} className="w-full" status={hasError ? 'error' : undefined} allowClear>
        {enumValues.map((enumValue) => (
          <Option key={enumValue} value={enumValue}>
            {enum_labels?.[enumValue] || enumValue}
          </Option>
        ))}
      </Select>
    )
  }
  if (ui_type) {
    switch (ui_type) {
      case 'switch':
        return (<Switch checked={value ?? false} onChange={onChange} />)
      case 'tags':
        return (<Select mode="tags" value={Array.isArray(value) ? value : (value ? [value] : [])} onChange={(tags) => onChange(tags)} placeholder={placeholder || '请输入，按回车添加'} className="w-full" status={hasError ? 'error' : undefined} tokenSeparators={[',']} />)
      case 'textarea':
        return (<TextArea value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} status={hasError ? 'error' : undefined} />)
      case 'number':
        return (
          <Space>
            <InputNumber value={value} onChange={onChange} min={min} max={max} step={type === 'float' ? (step || 0.1) : step} placeholder={placeholder} className="w-[150px]" status={hasError ? 'error' : undefined} />
            {unit && <Text type="secondary" className="text-[12px]">{unit}</Text>}
          </Space>
        )
      case 'select':
        return (<Select value={value} onChange={onChange} placeholder={placeholder} className="w-full" status={hasError ? 'error' : undefined} allowClear />)
      case 'input':
      default:
        return (<Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} status={hasError ? 'error' : undefined} allowClear />)
    }
  }
  // 根据 type 自动推断控件类型
  switch (type) {
    case 'int':
    case 'float': {
      return (
        <Space>
          <InputNumber value={value} onChange={onChange} min={min} max={max} step={type === 'float' ? (step || 0.1) : step} placeholder={placeholder} className="w-[150px]" status={hasError ? 'error' : undefined} />
          {unit && <Text type="secondary" className="text-[12px]">{unit}</Text>}
        </Space>
      )
    }
    case 'string': {
      return (<Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} status={hasError ? 'error' : undefined} allowClear />)
    }
    case 'list': {
      return (<Select mode="tags" value={Array.isArray(value) ? value : (value ? [value] : [])} onChange={(tags) => onChange(tags)} placeholder={placeholder || '请输入，按回车添加'} className="w-full" status={hasError ? 'error' : undefined} tokenSeparators={[',']} />)
    }
    case 'bool': {
      return (<Switch checked={value ?? false} onChange={onChange} />)
    }
    default:
      return (<Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} status={hasError ? 'error' : undefined} allowClear />)
  }
}
/**
 * 算子参数配置面板组件
 */
const OperatorConfigPanel: React.FC<OperatorConfigPanelProps> = ({ operator, config, onConfigChange }) => {
  const paramsSchema = operator.params_schema
  const hasValidParamsSchema = paramsSchema && typeof paramsSchema === 'object' && Object.keys(paramsSchema).length > 0
  const hasDefaultValues = hasValidParamsSchema
    ? Object.values(paramsSchema).some((schema: any) => schema && typeof schema === 'object' && 'default' in schema)
    : false
  // 用于跟踪是否已经为当前operator初始化过默认值
  const initializedOperatorRef = useRef<string | null>(null)
  // 在组件挂载或operator变化时，如果config.params中没有值，自动同步默认值
  useEffect(() => {
    if (!hasValidParamsSchema || !hasDefaultValues)
      return

    const operatorId = operator.type
    // 如果operator变化了，重置初始化标记
    if (initializedOperatorRef.current !== operatorId) {
      initializedOperatorRef.current = null
    }
    // 如果已经为当前operator初始化过，跳过
    if (initializedOperatorRef.current === operatorId)
      return
    const isEmptyParams = !config.params
      || (typeof config.params === 'object' && !Array.isArray(config.params) && Object.keys(config.params).length === 0)
    // 如果params不为空，说明已经有值了，不需要初始化
    if (!isEmptyParams) {
      initializedOperatorRef.current = operatorId
      return
    }
    const defaultParams: Record<string, any> = {}
    for (const [paramName, schema] of Object.entries(paramsSchema)) {
      const paramSchema = schema as CleaningOperatorParamSchema
      if (paramSchema && typeof paramSchema === 'object' && 'default' in paramSchema) {
        defaultParams[paramName] = paramSchema.default
      }
    }
    initializedOperatorRef.current = operatorId
    if (Object.keys(defaultParams).length > 0) {
      onConfigChange(defaultParams)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operator.type, hasValidParamsSchema, hasDefaultValues]) // 当operator变化时重新初始化
  if (!hasValidParamsSchema || !hasDefaultValues) {
    return null
  }
  // 处理参数变化
  const handleParamChange = (paramName: string, value: any) => {
    const newParams = {
      ...config.params,
      [paramName]: value,
    }
    onConfigChange(newParams)
  }
  // 动态渲染所有参数
  const validParams = Object.entries(paramsSchema).filter(([, schema]) => 'default' in (schema as CleaningOperatorParamSchema))
  const paramFields = validParams.map(([paramName, schema], index) => {
    const paramSchema = schema as CleaningOperatorParamSchema
    const isRequired = paramSchema.required === true
    const isSwitch = paramSchema.type === 'bool' || paramSchema.ui_type === 'switch'
    const isLast = index === validParams.length - 1
    let currentValue: any
    const params = config.params || {}
    if (paramName in params) {
      currentValue = params[paramName]
    }
    else {
      currentValue = paramSchema.default
    }
    const hasError = isRequired && isEmptyValue(currentValue, paramSchema.type)
    return (
      <div
        key={paramName}
        className={isLast ? undefined : 'pb-3'}
      >
        <div
          className={`flex gap-[12px] flex-wrap ${isSwitch ? 'items-center' : 'items-start'}`}
        >
          <div className="min-w-[120px] shrink-0">
            <Text
              className={`text-[13px] block text-[var(--lab-color-text-primary)] ${isSwitch ? 'leading-[32px]' : 'leading-[1.5]'}`}
              strong
            >
              {paramSchema.description || paramName}
              {isRequired && <Text type="danger" className="ml-0.5">*</Text>}
            </Text>
          </div>
          <div className="flex-1 min-w-[200px]">
            {renderParamField(paramName, paramSchema, currentValue, (value) => handleParamChange(paramName, value), hasError)}
            {hasError && (
              <div className="text-[var(--lab-color-danger)] text-[12px] mt-1 leading-[1.5]">
                此字段为必填项，请仔细输入值
              </div>
            )}
          </div>
        </div>
      </div>
    )
  })
  if (paramFields.length === 0) {
    return null
  }
  return (
    <div className="w-full">
      {paramFields}
    </div>
  )
}
export default OperatorConfigPanel
