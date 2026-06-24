import { Badge } from 'antd'
import { getMlModelStatus } from '../data'

interface StatusTagProps {
  status?: string
}

const StatusTag = ({ status }: StatusTagProps) => {
  const config = getMlModelStatus(status)

  return <Badge color={config.color} text={config.text} />
}

export default StatusTag
