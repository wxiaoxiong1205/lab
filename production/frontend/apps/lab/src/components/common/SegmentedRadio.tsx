import React from 'react'
import { Radio } from 'antd'
import './SegmentedRadio.css'

const joinClassNames = (...classNames: Array<string | undefined | false>) =>
  classNames.filter(Boolean).join(' ')

interface SegmentedRadioGroupProps extends React.ComponentProps<typeof Radio.Group> {
  children?: React.ReactNode
}

interface SegmentedRadioButtonProps extends React.ComponentProps<typeof Radio.Button> {
  variant?: 'default' | 'usage' | 'source'
}

export const SegmentedRadioGroup: React.FC<SegmentedRadioGroupProps> = ({
  className,
  children,
  ...props
}) => (
  <Radio.Group
    className={joinClassNames('segmented-radio-group', className)}
    {...props}
  >
    {children}
  </Radio.Group>
)

export const SegmentedRadioButton: React.FC<SegmentedRadioButtonProps> = ({
  className,
  variant = 'default',
  ...props
}) => (
  <Radio.Button
    className={joinClassNames('segmented-radio-button', `segmented-radio-button--${variant}`, className)}
    {...props}
  />
)
