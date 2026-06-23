import { PageContainer } from '@ant-design/pro-components'
import { Spin } from 'antd'
import { useState } from 'react'
import DashboardInner from './components/dahboard-inner'

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(false)

  return (
    <Spin spinning={loading}>
      <DashboardInner setLoading={setLoading} />
    </Spin>
  )
}

export default Dashboard
