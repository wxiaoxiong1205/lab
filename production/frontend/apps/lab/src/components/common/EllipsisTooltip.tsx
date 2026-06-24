import React from 'react'
import { Tooltip } from 'antd'

interface EllipsisTooltipProps {
  children: React.ReactNode
  maxWidth?: number | string
  placement?: 'top' | 'topLeft' | 'topRight' | 'bottom' | 'bottomLeft' | 'bottomRight' | 'left' | 'right'
}
const EllipsisTooltip: React.FC<EllipsisTooltipProps> = ({ children, maxWidth = 180, placement = 'topLeft' }) => {
  return (
    <Tooltip title={children} placement={placement}>
      <span
        className="inline-block overflow-hidden whitespace-nowrap"
        style={{
          maxWidth,
          textOverflow: 'ellipsis',
          verticalAlign: 'middle',
        }}
      >
        {children}
      </span>
    </Tooltip>
  )
}
export default EllipsisTooltip
