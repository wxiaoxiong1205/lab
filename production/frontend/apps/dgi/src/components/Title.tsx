import { Divider } from 'antd'

function Title({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-normal">{title}</h1>
      {description && <p className="text-xs text-label m-0">{description}</p>}
    </div>
  )
}

export default Title
