// import { useIntl } from '@umijs/max';
import _ from 'lodash'
import React, { useCallback, useEffect, useState } from 'react'
import Inner from './inner'
import { useTransform } from '@/locales'

interface LabelSelectorProps {
  labels: Record<string, any>
  label?: string
  btnText?: string
  description?: React.ReactNode
  onChange?: (labels: Record<string, any>) => void
  onBlur?: (e: any, type: string, index: number) => void
  onDelete?: (index: number) => void
}

const LabelSelector: React.FC<LabelSelectorProps> = ({
  labels,
  onChange,
  onBlur,
  onDelete,
  label,
  btnText,
  description,
}) => {
  // const intl = useIntl();
  const { $t } = useTransform()
  const [labelsData, setLabelsData] = useState({})
  const [labelList, setLabelList] = useState<{ key: string, value: string }[]>(
    [],
  )

  useEffect(() => {
    if (!_.isEqual(labels, labelsData)) {
      setLabelsData(labels || {})
      const list = _.map(_.keys(labels), (key: string) => {
        return {
          key,
          value: labels[key],
        }
      })
      setLabelList(list)
    }
  }, [labels])

  const handleLabelListChange = useCallback(
    (list: { key: string, value: string }[]) => {
      setLabelList(list)
    },
    [setLabelList],
  )
  const handleLabelsChange = (data: Record<string, any>) => {
    setLabelsData(data)
    onChange?.(data)
  }

  const handleOnPaste = (
    e: React.ClipboardEvent<HTMLTextAreaElement>,
    index: number,
  ) => {
    const clipboardText = e.clipboardData.getData('text')
    if (!clipboardText || !clipboardText.includes('=')) return
    e.preventDefault()

    const lines = clipboardText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && line.includes('='))

    const parsedData = lines.map((line) => {
      const [key, value] = line.split('=').map((part) => part.trim())
      return { key, value }
    })

    setLabelList((prevPairs) => {
      const newPairs = [...prevPairs]
      newPairs.splice(index, 1, ...parsedData)
      return newPairs
    })
  }

  return (
    <Inner
      label={label}
      btnText={btnText}
      description={
        description ?? $t('粘贴多行文本，每行包含一个键值对，键和值之间用 = 号分隔，不同的键值对之间用换行符分隔。')
      }
      labels={labelsData}
      labelList={labelList}
      onChange={handleLabelsChange}
      onLabelListChange={handleLabelListChange}
      onPaste={handleOnPaste}
      onBlur={onBlur}
      onDelete={onDelete}
    />
  )
}

export default React.memo(LabelSelector)
