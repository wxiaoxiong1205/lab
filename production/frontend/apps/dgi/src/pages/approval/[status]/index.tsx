import { useNavigate, useParams } from 'react-router-dom'
import { Tabs } from 'antd'
import { useShallow } from 'zustand/react/shallow'
import ApprovalPage from '../components/ApprovalPage'
import useMenuStore from '@/stores/menu'

export default function Approval() {
  const { status, type } = useParams()
  const navigate = useNavigate()
  const isSanYuan = useMenuStore(useShallow((state) => state.isSanYuan))

  const typeEnum: Record<string, number> = {
    // 配额申请
    quota: 1,
    // 模型申请
    model: 2,
  }

  // 组件内tabs控制
  const tabComponent = (
    <Tabs
      items={[
        { label: '额度', key: 'quota' },
        ...(!isSanYuan ? [{ label: '资源', key: 'model' }] : []),
      ]}
      onChange={(key) => {
        navigate(`/approval/${status}/${key}`)
      }}
      activeKey={type}
    />
  )

  return status && (
    <ApprovalPage status={status || ''} type={typeEnum[type] || typeEnum.quota} key={`${status}-${type}`} tabComponent={tabComponent} />
  )
}
