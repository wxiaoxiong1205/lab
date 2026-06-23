import { Tabs } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ModelTable from '../other-settings/components/ModelTable'
import ChannelPage from './components/ChannelPage'
import { useTransform } from '@/locales'
import Title from '@/components/Title'

type TabKey = 'channel-manage' | 'model-manage'

const TAB_ROUTES: Record<TabKey, string> = {
  'channel-manage': '/channel-manage',
  'model-manage': '/channel-manage/model-manage',
}

export default function ChannelManagePage({ type = 'channel-manage' }: { type?: TabKey }) {
  const navigate = useNavigate()
  const { $t } = useTransform()
  const [activeKey, setActiveKey] = useState<TabKey>(type)

  useEffect(() => {
    setActiveKey(type)
  }, [type])

  const handleChange = (key: string) => {
    const tabKey = key as TabKey
    setActiveKey(tabKey)
    navigate(TAB_ROUTES[tabKey])
  }

  const items = [
    {
      key: 'channel-manage',
      label: $t('渠道管理'),
      children: (
        <div className="space-y-4 pt-4">
          <ChannelPage />
        </div>
      ),
    },
    {
      key: 'model-manage',
      label: $t('模型设置'),
      children: (
        <div className="space-y-4 pt-4">
          <ModelTable />
        </div>
      ),
    },
    // {
    //   key: "content-security",
    //   label: $t("插件管理"),
    //   children: (
    //     <div className="space-y-4">
    //       <PluginManager />
    //     </div>
    //   ),
    // },
  ]

  return (
    <div className="bg-white min-h-full rounded-lg p-6">
      <Title title={$t('渠道管理')} description={$t('模型统一标准接入')} />
      <Tabs activeKey={activeKey} items={items} onChange={handleChange} />
    </div>
  )
}
