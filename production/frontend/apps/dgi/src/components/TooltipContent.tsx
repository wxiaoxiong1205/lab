import { Tooltip } from 'antd'

function TooltipContent({
  content,
  width = 'auto',
}: {
  content: string
  width?: string
}) {
  return (
    <Tooltip
      title={content}
      styles={{
        body: {
          width,
          maxHeight: '500px',
          overflow: 'auto',
        },
      }}
    >
      <p className="text-ellipsis overflow-hidden whitespace-nowrap mb-0">
        {content}
      </p>
    </Tooltip>
  )
}

export default TooltipContent
