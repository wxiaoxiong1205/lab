// import { useIntl } from '@umijs/max';
import type { DropDownProps, MenuProps } from 'antd'
import { Dropdown } from 'antd'
import _ from 'lodash'
import React, { useMemo } from 'react'

const DropDownActions: React.FC<DropDownProps> = (props) => {
  const {
    menu,
    trigger = ['hover'],
    placement = 'bottomRight',
    children,
    ...rest
  } = props
  // const intl = useIntl();

  const items = useMemo(() => {
    return menu?.items?.map((item: any) => ({
      ..._.omit(item, 'locale'),
      label: item.locale ? item.label : item.label,
    })) as MenuProps['items']
  }, [menu?.items])
  return (
    <Dropdown
      menu={{
        items: items as any,
        onClick: menu?.onClick,
      }}
      trigger={trigger}
      placement={placement}
      {...rest}
    >
      {children}
    </Dropdown>
  )
}

export default DropDownActions
