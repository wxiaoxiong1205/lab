import React from 'react'
import { Input } from 'antd'

const DEFAULT_DESCRIPTION_MAX_LENGTH = 1000

const getDescriptionLength = (value: string = '') => {
  const normalizedValue = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return normalizedValue.length + (normalizedValue.match(/\n/g)?.length || 0)
}

const truncateDescription = (value: string = '', max = DEFAULT_DESCRIPTION_MAX_LENGTH) => {
  const normalizedValue = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  let length = 0
  let result = ''

  for (const char of normalizedValue) {
    const nextLength = length + (char === '\n' ? 2 : 1)
    if (nextLength > max) break
    result += char
    length = nextLength
  }

  return result
}

type DescriptionTextAreaProps = React.ComponentProps<typeof Input.TextArea>
type DescriptionTextAreaRef = React.ElementRef<typeof Input.TextArea>

const createDescriptionCountConfig = (max = DEFAULT_DESCRIPTION_MAX_LENGTH): NonNullable<DescriptionTextAreaProps['count']> => ({
  max,
  strategy: getDescriptionLength,
  exceedFormatter: (value: string, { max }: { max: number }) => truncateDescription(value, max),
})

export const DescriptionTextArea = React.forwardRef<DescriptionTextAreaRef, DescriptionTextAreaProps>((props, ref) => {
  const { count, maxLength, showCount, ...restProps } = props
  const countMax = typeof maxLength === 'number' ? maxLength : DEFAULT_DESCRIPTION_MAX_LENGTH

  return (
    <Input.TextArea
      {...restProps}
      ref={ref}
      count={count ?? createDescriptionCountConfig(countMax)}
      showCount={showCount ?? true}
    />
  )
})

DescriptionTextArea.displayName = 'DescriptionTextArea'
