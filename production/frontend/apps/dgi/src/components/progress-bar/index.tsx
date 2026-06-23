import { Progress, Tooltip } from 'antd'
import React, { memo, useMemo } from 'react'

const RenderProgress = memo(
  (props: {
    open?: boolean
    percent: number
    steps?: number
    download?: boolean
    label?: React.ReactNode
    successPercent?: number
    successColor?: string
  }) => {
    const { open, percent, download, label, successPercent } = props

    const strokeColor = useMemo(() => {
      if (download) {
        return '#1890FF'
      }

      if (percent <= 50) {
        return '#1890FF'
      }
      if (percent <= 80) {
        return '#FAAD14'
      }
      return '#F5222D'
    }, [percent])

    const renderProgress = useMemo(() => {
      return (
        <Progress
          percentPosition={{ align: 'center', type: 'inner' }}
          size={['', 16]}
          format={() => {
            return (
              <span
                style={{
                  color: 'var(--color-progress-text)',
                }}
              >
                {percent}
                %
              </span>
            )
          }}
          percent={percent}
          success={{
            percent: successPercent,
            strokeColor: 'var(--ant-geekblue-3)',
          }}
          strokeColor={strokeColor}
        >
        </Progress>
      )
    }, [percent, successPercent, strokeColor])

    return (
      <>
        {label ? (
          <Tooltip
            title={label}
            open={open}
            overlayInnerStyle={{ paddingInline: 12 }}
          >
            {renderProgress}
          </Tooltip>
        ) : (
          renderProgress
        )}
      </>
    )
  },
)

export default RenderProgress
