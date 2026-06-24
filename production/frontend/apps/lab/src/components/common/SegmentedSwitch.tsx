import React from 'react'
import { Segmented } from 'antd'
import type { SegmentedProps } from 'antd'
import './SegmentedSwitch.css'

const joinClassNames = (...classNames: Array<string | undefined | false>) =>
  classNames.filter(Boolean).join(' ')

const SegmentedSwitch: React.FC<SegmentedProps> = ({ className, ...props }) => (
  <Segmented
    className={joinClassNames('segmented-switch', className)}
    {...props}
  />
)

export default SegmentedSwitch
