import { Tabs } from 'antd'
import OtherSettings from './components/OtherSettings'
import WebHook from './components/WebHook'
import { $t } from '@/locales'
import useMenuStore from '@/stores/menu'

const SystemConfigPage: React.FC = () => {
  const isSanYuan = useMenuStore((state) => state.isSanYuan)

  const getTabItems = () => {
    const allItems = [
      {
        key: 'model-settings',
        code: 'model_config',
        label: $t('其他配置 '),
        children: (
          <div className="space-y-4 pt-4">
            <OtherSettings />
          </div>
        ),
      },
      {
        key: 'content-security',
        code: 'content_security',
        label: $t('WebHook'),
        children: (
          <div className="space-y-4">
            <WebHook />
          </div>
        ),
      },
    ]

    // 如果 isSanYuan 为 true，隐藏"其他配置"标签页
    if (!isSanYuan) {
      return allItems.filter((item) => item.key !== 'model-settings')
    }

    return allItems
  }

  const items = getTabItems()

  return (
    <div>
      <Tabs items={items} />
    </div>
  )
}

export default SystemConfigPage
