import { DeleteOutlined, MoreOutlined } from '@ant-design/icons'
// import { useIntl } from '@umijs/max';
import { Button, Dropdown, type MenuProps, Tooltip } from 'antd'
import classNames from 'classnames'
import _ from 'lodash'
import React from 'react'
import './index.css'

type Trigger = 'click' | 'hover'

// 定义更准确的菜单项类型
interface CustomMenuItem {
  key: string | number
  label?: React.ReactNode
  icon?: React.ReactNode
  disabled?: boolean
  props?: Record<string, any>
  danger?: boolean
}

interface DropdownButtonsProps {
  items: CustomMenuItem[]
  size?: 'small' | 'middle' | 'large' | 'default'
  trigger?: Trigger[]
  showText?: boolean
  disabled?: boolean
  variant?: 'filled' | 'outlined'
  color?: 'default' | 'danger' | 'primary' | 'blue' | 'purple' | 'cyan' | 'green' | 'magenta' | 'pink' | 'red' | 'orange' | 'yellow' | 'volcano' | 'geekblue' | 'lime' | 'gold'
  extra?: React.ReactNode
  onSelect: (val: any, item?: any) => void
}

const DropdownButtons: React.FC<DropdownButtonsProps> = ({
  items,
  size = 'middle',
  trigger = ['hover'],
  showText,
  disabled,
  variant,
  color,
  extra,
  onSelect,
}) => {
  const headItem = _.head(items) as CustomMenuItem | undefined
  // const intl = useIntl();

  const handleMenuClick = (item: any) => {
    const selectItem = _.find(items, { key: item.key })
    onSelect(item.key, selectItem)
  }

  const handleButtonClick = (e: any) => {
    const headItem = _.head(items) as CustomMenuItem | undefined
    onSelect(headItem?.key, headItem)
  }

  if (!items?.length) {
    return <span></span>
  }

  // 检查第一个按钮是否是MoreOutlined，只有这种情况才显示下拉菜单
  const isMoreButton = (headItem?.icon as any)?.type?.render?.name === 'MoreOutlined'
    || (headItem?.icon as any)?.type?.displayName === 'MoreOutlined'
    || React.isValidElement(headItem?.icon) && (headItem?.icon as any)?.type === MoreOutlined

  return (
    <>
      {items?.length === 1 ? (
        <Tooltip title={headItem?.label}>
          <Button
            className={classNames('dropdown-button', size)}
            icon={headItem?.icon}
            size={size as any}
            {...headItem?.props}
            onClick={handleButtonClick}
          >
          </Button>
        </Tooltip>
      ) : (
        <Dropdown
          disabled={disabled}
          trigger={['click']}
          menu={{
            items: _.tail(items)?.map((item: CustomMenuItem) => ({
              key: item.key,
              label: item.label,
              icon: item.icon,
              danger: item.props?.danger,
              disabled: item.disabled,
              onClick: () => handleMenuClick(item),
            })),
          }}
          onOpenChange={(open) => {
            // 阻止主按钮点击时打开下拉菜单
            if (!open) return
          }}
        >
          <Button.Group>
            {showText ? (
              <Button
                {...headItem?.props}
                disabled={headItem?.disabled || disabled}
                className={classNames('dropdown-button', size)}
                onClick={(e) => {
                  e.stopPropagation()
                  handleButtonClick(e)
                }}
                size={size as any}
                icon={headItem?.icon}
                variant={variant}
                color={color}
              >
                {headItem?.label}
                {extra}
              </Button>
            ) : (
              <Tooltip
                title={headItem?.label}
                key="leftButton"
              >
                <Button
                  {...headItem?.props}
                  className={classNames('dropdown-button', size)}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleButtonClick(e)
                  }}
                  size={size as any}
                  icon={headItem?.icon}
                  disabled={headItem?.disabled}
                >
                </Button>
              </Tooltip>
            )}
            <Button
              icon={<MoreOutlined />}
              size={size as any}
              key="menu"
              variant={variant}
              color="default"
              className={classNames('dropdown-button', size)}
            >
            </Button>
          </Button.Group>
        </Dropdown>
      )}
    </>
  )
}

export default DropdownButtons
