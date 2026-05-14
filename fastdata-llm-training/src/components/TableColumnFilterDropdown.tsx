import React from 'react'
import { Button, Checkbox, Divider, Empty, Space, Typography } from 'antd'

const { Text } = Typography

export type TableColumnFilterOption = {
  value: string
  label: React.ReactNode
  searchText: string
  count?: number
}

type TableColumnFilterDropdownProps = {
  title: string
  options: TableColumnFilterOption[]
  selectedKeys: React.Key[]
  setSelectedKeys: (selectedKeys: React.Key[]) => void
  confirm: () => void
  clearFilters?: () => void
}

const filterPanelStyle: React.CSSProperties = {
  width: 248,
  padding: 12,
  background: '#fff',
  borderRadius: 12,
  boxShadow: '0 18px 45px rgba(15, 23, 42, 0.16)',
}

const optionListStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  maxHeight: 260,
  overflowY: 'auto',
  paddingRight: 2,
}

const optionLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  width: 188,
}

const TableColumnFilterDropdown: React.FC<TableColumnFilterDropdownProps> = ({
  title,
  options,
  selectedKeys,
  setSelectedKeys,
  confirm,
  clearFilters,
}) => {
  const selectedValues = selectedKeys.map(key => String(key))

  const applyFilter = () => {
    confirm()
  }

  const resetFilter = () => {
    clearFilters?.()
    setSelectedKeys([])
    confirm()
  }

  const handleSelect = (values: Array<string | number | boolean>) => {
    setSelectedKeys(values.map(value => String(value)))
  }

  return (
    <div style={filterPanelStyle}>
      <div style={{ display: 'grid', gap: 4 }}>
        <Text strong>{title}</Text>
      </div>

      <Divider style={{ margin: '10px 0' }} />

      <Checkbox.Group value={selectedValues} onChange={handleSelect}>
        <div style={optionListStyle}>
          {options.length ? (
            options.map(option => (
              <Checkbox key={option.value} value={option.value}>
                <span style={optionLabelStyle}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{option.label}</span>
                  {typeof option.count === 'number' && <Text type="secondary">{option.count}</Text>}
                </span>
              </Checkbox>
            ))
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无匹配选项" />
          )}
        </div>
      </Checkbox.Group>

      <Divider style={{ margin: '10px 0' }} />

      <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
        <Button size="small" onClick={resetFilter}>
          清空
        </Button>
        <Button type="primary" size="small" onClick={applyFilter}>
          应用
        </Button>
      </Space>
    </div>
  )
}

export default TableColumnFilterDropdown
