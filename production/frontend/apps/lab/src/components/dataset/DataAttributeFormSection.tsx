import React from 'react'
import { Form, Input, Select, Spin, Tooltip } from 'antd'
import { QuestionCircleOutlined } from '@ant-design/icons'
import type { BusinessAttrGroupItem, BusinessAttrItem } from '@/types/inference'

function isDataAttrGroupItem(groupItem: BusinessAttrGroupItem): boolean {
  return groupItem.group != null && groupItem.group !== ''
}

function getDataAttrItems(groupItem: BusinessAttrGroupItem): BusinessAttrItem[] {
  return Array.isArray(groupItem.items) ? groupItem.items : []
}

function getSelectOptionsFromAttr(attr: BusinessAttrItem): { label: string, value: string }[] {
  const optionsArray = attr.options || []
  return optionsArray
    .map((option: { option_value: string } | string) => {
      if (typeof option === 'string') return { label: option, value: option }
      if (option && typeof option === 'object' && option.option_value != null) {
        return { label: option.option_value, value: option.option_value }
      }
      return { label: '', value: '' }
    })
    .filter((o) => o.value !== '')
}

export interface DataAttributeFormSectionProps {
  /** 按分组返回的属性列表 */
  attrGroupList: BusinessAttrGroupItem[]
  /** 是否加载中 */
  loading?: boolean
}

const DataAttributeFormSection: React.FC<DataAttributeFormSectionProps> = ({
  attrGroupList,
  loading = false,
}) => {
  const renderDataAttrFormItem = (attr: BusinessAttrItem) => {
    const label = (
      <span>
        {attr.name}
        {attr.required_tag === 1 && <span className="text-red-500 ml-0.5">*</span>}
        {attr.description ? (
          <Tooltip title={attr.description}>
            <QuestionCircleOutlined className="text-gray-400 text-xs ml-1" />
          </Tooltip>
        ) : null}
      </span>
    )
    const requiredRules
            = attr.required_tag === 1
              ? [
                  {
                    required: true,
                    message: attr.input_type === '手动输入' ? `请输入${attr.name}` : `请选择${attr.name}`,
                  },
                ]
              : []

    if (attr.input_type === '手动输入') {
      return (
        <Form.Item
          key={attr.id}
          name={`manualInput_${attr.id}`}
          label={label}
          rules={[...requiredRules, { max: 64, message: '输入值不能超过64个字符' }]}
        >
          <Input placeholder="请输入属性值" maxLength={64} showCount />
        </Form.Item>
      )
    }
    if (attr.input_type === '下拉选择') {
      const selectOptions = getSelectOptionsFromAttr(attr)
      const isMultiple = attr.multi_select === 1
      return (
        <Form.Item
          key={attr.id}
          name={`dropdown_${attr.id}`}
          label={label}
          rules={requiredRules}
        >
          <Select
            mode={isMultiple ? 'multiple' : undefined}
            placeholder="请选择属性值"
            allowClear
            showSearch
            filterOption={(input, option) => {
              const value = option?.value as string
              return value ? value.toLowerCase().includes(input.toLowerCase()) : false
            }}
            options={selectOptions}
          />
        </Form.Item>
      )
    }
    return null
  }

  return (
    <Form.Item
      label="数据属性"
      tooltip="配置需要关联到该数据集的业务属性值，用于后续数据标注或筛选"
    >
      <Spin spinning={loading}>
        {attrGroupList.length === 0 && !loading ? (
          <div className="text-gray-500 text-sm">当前业务暂无扩展属性配置</div>
        ) : (
          <>
            {/* 无分组：直接展示每个属性的输入框或下拉框 */}
            {attrGroupList.map((groupItem: BusinessAttrGroupItem, index: number) => {
              const items = getDataAttrItems(groupItem)
              const hasGroup = isDataAttrGroupItem(groupItem)
              if (hasGroup) return null
              return (
                <div key={`no-group-${index}`} className="mb-4 mt-2">
                  <div className="text-gray-600 text-sm mb-2">未分组</div>
                  <div className="flex flex-col gap-0">
                    {items.map((attr) => renderDataAttrFormItem(attr))}
                  </div>
                </div>
              )
            })}
            {/* 有分组：直接展示分组标题与属性，无需展开/折叠 */}
            {attrGroupList
              .filter(isDataAttrGroupItem)
              .map((groupItem: BusinessAttrGroupItem, index: number) => (
                <div key={`group-${index}`} className="mb-4 mt-2">
                  <div className="text-gray-600 text-sm font-medium mb-2">{groupItem.group}</div>
                  <div className="flex flex-col gap-0">
                    {getDataAttrItems(groupItem).map((attr) =>
                      renderDataAttrFormItem(attr),
                    )}
                  </div>
                </div>
              ))}
          </>
        )}
      </Spin>
    </Form.Item>
  )
}

export default DataAttributeFormSection
