import { SearchOutlined } from '@ant-design/icons'
import { Button, Form, Input, Select } from 'antd'
import React from 'react'

export type searchFieldType = 'input' | 'select'

export type searchField = {
  name: string
  type: searchFieldType
  label?: string
  placeholder?: string
  options?: { label: string, value: string }[]

  className?: string
  style?: React.CSSProperties
}

export type ListSearchFormProps = {
  fields: searchField[]
  onSearch: (value: Record<string, any>) => void
  onReset?: () => void
}

export function ListSearchForm({
  fields,
  onSearch,
  onReset,
}: ListSearchFormProps) {
  const [form] = Form.useForm()

  const searchComponent = (field: searchField) => {
    switch (field.type) {
      case 'input':
        return InputComponent({ placeholder: field.placeholder, className: field.className })
      case 'select':
        return SelectComponent({ placeholder: field.placeholder, options: field.options, className: field.className })
      default:
        return null
    }
  }

  /** Form 的 onChange 不会在 Select/Input 值变化时触发，必须用 onValuesChange */
  const handleValuesChange = (
    _changed: Record<string, unknown>,
    allValues: Record<string, unknown>,
  ) => {
    const cleanedValues = Object.fromEntries(
      Object.entries(allValues),
    )
    onSearch(cleanedValues)
  }

  const handleReset = () => {
    form.resetFields()
    onReset?.()
  }

  const InputComponent = ({ placeholder, className, style }: {
    placeholder?: string
    className?: string
    style?: React.CSSProperties
  }) => {
    return (
      <Input
        placeholder={placeholder}
        allowClear
        className={className}
        style={style}
        prefix={<SearchOutlined className="text-gray-400" />}
      />
    )
  }

  const SelectComponent = ({ placeholder, options, className, style }: {
    options: { label: string, value: string }[]
    placeholder?: string
    className?: string
    style?: React.CSSProperties
  }) => {
    return <Select placeholder={placeholder} options={options} className={className} style={style} />
  }

  return (
    <Form
      form={form}
      layout="inline"
      onValuesChange={handleValuesChange}
    >
      {fields.map((field) => (
        <Form.Item
          key={field.name}
          name={field.name}
          {...({ label: field.label })}
        >
          {searchComponent(field)}
        </Form.Item>
      ))}
      <Form.Item>
        <Button onClick={handleReset} type="default">重置</Button>
      </Form.Item>
    </Form>
  )
}
