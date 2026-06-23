import React from 'react'
import { Card, Input, Select } from 'antd'

export interface BusinessMappingItem {
  sourceField: string
  targetField: string
}

export type BusinessApiBindingFields = {
  request_binding: { label: string, value: string, name?: string, jsonpath?: string }[]
  response_binding: { label: string, value: string, name?: string, jsonpath?: string }[]
}

function BusinessRequestMappingRow({
  sourceFields,
  name: _name,
  mapping,
  onChange,
}: {
  sourceFields: { label: string, value: string }[]
  name: string
  mapping: BusinessMappingItem
  onChange: (m: BusinessMappingItem) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="请输入字段映射"
        className="w-[200px]"
        value={mapping.sourceField}
        onChange={(e) => onChange({ ...mapping, sourceField: e.target.value })}
      />
      <span className="text-xl text-gray-400 px-2">→</span>
      <Select
        placeholder="请选择业务测试数据集元数据字段"
        className="w-[200px]"
        options={sourceFields}
        value={mapping.targetField || undefined}
        onChange={(value) => onChange({ ...mapping, targetField: value })}
      />
    </div>
  )
}

/** 输出字段映射行（response_binding） */
function BusinessResponseMappingRow({
  name,
  mapping,
  onChange,
}: {
  name: string
  mapping: BusinessMappingItem
  onChange: (m: BusinessMappingItem) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Input readOnly className="w-[200px] bg-[var(--lab-color-surface-page)]" value={name || ''} />
      <span className="text-xl text-gray-400 px-2">→</span>
      <Input
        placeholder="请输入字段映射"
        className="w-[200px]"
        value={mapping.targetField || name || ''}
        onChange={(e) => onChange({ ...mapping, targetField: e.target.value })}
      />
    </div>
  )
}

export interface BusinessInferenceParamsMappingCardProps {
  firstApiId: number | undefined
  apiBindingFieldsByApiIdForBusiness: Record<number, BusinessApiBindingFields>
  requestMappingsByApiIdForBusiness: Record<number, BusinessMappingItem[]>
  responseMappingsByApiIdForBusiness: Record<number, BusinessMappingItem[]>
  businessTestDatasetMetadataFieldsForBusiness: Array<string | { name?: string, jsonpath?: string }>
  setRequestMappingsByApiIdForBusiness: React.Dispatch<React.SetStateAction<Record<number, BusinessMappingItem[]>>>
  setResponseMappingsByApiIdForBusiness: React.Dispatch<React.SetStateAction<Record<number, BusinessMappingItem[]>>>
}

/** 业务效果评估-新建推理：首个 API 的推理参数字段映射卡片 */
export function BusinessInferenceParamsMappingCard({
  firstApiId,
  apiBindingFieldsByApiIdForBusiness,
  requestMappingsByApiIdForBusiness,
  responseMappingsByApiIdForBusiness,
  businessTestDatasetMetadataFieldsForBusiness,
  setRequestMappingsByApiIdForBusiness,
  setResponseMappingsByApiIdForBusiness,
}: BusinessInferenceParamsMappingCardProps) {
  const apiBindingFields = firstApiId != null ? apiBindingFieldsByApiIdForBusiness[firstApiId] : null
  if (!apiBindingFields) return null

  const requestMappings = requestMappingsByApiIdForBusiness[firstApiId] || []
  const responseMappings = responseMappingsByApiIdForBusiness[firstApiId] || []
  const sourceFields = businessTestDatasetMetadataFieldsForBusiness.map((field: string | { name?: string, jsonpath?: string }) => {
    const name = typeof field === 'string' ? field : (field?.name ?? '')
    return { label: name, value: name }
  })

  return (
    <Card title="推理参数设置" size="small">
      <div className="flex items-start gap-8">
        <div className="flex-1">
          <div className="mb-2 text-sm font-medium">输入字段映射 (request_binding)</div>
          <div className="space-y-3">
            {apiBindingFields.request_binding.map((bindingField, index) => {
              const mapping = requestMappings[index] || { sourceField: '', targetField: '' }
              return (
                <BusinessRequestMappingRow
                  key={index}
                  sourceFields={sourceFields}
                  name={bindingField.value}
                  mapping={mapping}
                  onChange={(newMapping) => {
                    setRequestMappingsByApiIdForBusiness((prev) => {
                      if (firstApiId == null) return prev
                      const next = [...(prev[firstApiId] || [])]
                      next[index] = newMapping
                      return { ...prev, [firstApiId]: next }
                    })
                  }}
                />
              )
            })}
          </div>
        </div>
        <div className="flex-1">
          <div className="mb-2 text-sm font-medium">输出字段映射 (response_binding)</div>
          <div className="space-y-3">
            {apiBindingFields.response_binding.map((bindingField, index) => {
              const mapping = responseMappings[index] || {
                sourceField: '',
                targetField: bindingField.value,
              }
              return (
                <BusinessResponseMappingRow
                  key={index}
                  name={bindingField.value}
                  mapping={mapping}
                  onChange={(newMapping) => {
                    setResponseMappingsByApiIdForBusiness((prev) => {
                      if (firstApiId == null) return prev
                      const next = [...(prev[firstApiId] || [])]
                      next[index] = newMapping
                      return { ...prev, [firstApiId]: next }
                    })
                  }}
                />
              )
            })}
          </div>
        </div>
      </div>
    </Card>
  )
}
