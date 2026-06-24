import { ArrowsAltOutlined, CaretDownOutlined, DownOutlined, RightOutlined, ShrinkOutlined } from '@ant-design/icons'
import { Button, Checkbox } from 'antd'
import _ from 'lodash'
import React from 'react'
import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react'

interface HeaderPrefixProps {
  expandable?: boolean | React.ReactNode
  enableSelection?: boolean
  onSelectAll?: (e: any) => void
  onExpandAll?: (e: any) => void
  expandAll?: boolean
  indeterminate?: boolean
  selectAll?: boolean
  hasColumns?: boolean
  disabled?: boolean
}

const HeaderPrefix: React.FC<HeaderPrefixProps> = (props) => {
  const {
    hasColumns,
    expandable,
    enableSelection,
    onSelectAll,
    onExpandAll,
    indeterminate,
    selectAll,
    expandAll,
    disabled,
  } = props

  const handleToggleExpand = () => {
    onExpandAll?.(!expandAll)
  }

  const handleUnCheckAll = () => {
    onSelectAll?.({
      target: {
        checked: false,
      },
    })
  }

  if (!hasColumns) {
    return null
  }
  if (expandable && enableSelection) {
    return (
      <div
        className="header-row-prefix-wrapper flex justify-center items-center"
        style={{ paddingLeft: 16 }}
      >
        <span style={{ marginRight: 5 }}>
          {_.isBoolean(expandable) ? (
            <Button
              type="text"
              size="small"
              onClick={handleToggleExpand}
              style={{ paddingInline: 6 }}
            >
              {expandAll ? (
                // <ShrinkOutlined className='text-base' />
                <ChevronsDownUp className="text-base" size={16} />

              ) : (
                <ChevronsUpDown className="text-base" size={16} />
                // <ArrowsAltOutlined className='text-base' />

              )}
            </Button>
          ) : (
            expandable
          )}
        </span>
        <Checkbox
          onChange={onSelectAll}
          className="!mr-2"
          indeterminate={indeterminate}
          checked={selectAll}
          disabled={disabled}
        >
        </Checkbox>
      </div>
    )
  }
  if (expandable) {
    return (
      <div className="header-row-prefix-wrapper">
        {_.isBoolean(expandable) ? (
          <Button type="text" size="small">
            <RightOutlined />
          </Button>
        ) : (
          expandable
        )}
      </div>
    )
  }
  if (enableSelection) {
    return (
      <div className="header-row-prefix-wrapper">
        <Checkbox className="!mr-2" disabled={disabled}></Checkbox>
      </div>
    )
  }
  return null
}

export default HeaderPrefix
