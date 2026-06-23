import { useEffect, useState } from 'react'
import { Button, Tabs, message } from 'antd'
import type { TabsProps } from 'antd'
import { useRequest } from 'ahooks'
import { useShallow } from 'zustand/react/shallow'
import ModelTable from './components/ModelTable'
import KeyValueEditor from './components/KeyValueEditor'
import ContentSecurity from './components/ContentSecurity'
import { apiGroupSettingsGet, apiGroupSettingsUpdate } from '@/services/api'
import { useTransform } from '@/locales'
import useMenuStore from '@/stores/menu'
import { hasMenuPermission } from '@/utils'

export default function OtherSettingsPage() {
  const { $t } = useTransform()
  const [jsonValue, setJsonValue] = useState('{}')
  const { menuList } = useMenuStore(
    useShallow((state) => {
      return {
        menuList: state.menuList,
      }
    }),
  )

  const {
    data: configData,
    loading,
    run: getConfig,
  } = useRequest(apiGroupSettingsGet, {
    manual: true,
    onSuccess: (res) => {
      setJsonValue(res.data.value)
    },
    debounceWait: 300,
  })

  useEffect(() => {
    getConfig()
  }, [])

  const { loading: saveLoading, run: saveSettings } = useRequest(
    apiGroupSettingsUpdate,
    {
      onSuccess: () => {
        message.success($t('保存成功'))
      },
      manual: true,
    },
  )

  const handleSave = () => {
    try {
      JSON.parse(jsonValue)
    }
    catch (error) {
      console.error(error)
      message.error($t('JSON 格式错误'))
      return
    }

    saveSettings({
      key: configData?.data.key ?? '',
      value: jsonValue,
    })
  }

  const allItems = [
    // {
    //   key: "group-settings",
    //   code: "group_settings",
    //   label: $t("分组设置"),
    //   children: (
    //     <div className="space-y-4 pt-4">
    //       {/* 可视化编辑器 */}
    //       <KeyValueEditor
    //         value={jsonValue}
    //         onChange={setJsonValue}
    //         loading={loading}
    //       />
    //       <div className="flex justify-start">
    //         <Button loading={saveLoading} type="primary" onClick={handleSave}>
    //           {$t("保存")}
    //         </Button>
    //       </div>
    //     </div>
    //   ),
    // },
    {
      key: 'model-settings',
      code: 'model_config',
      label: $t('模型设置'),
      children: (
        <div className="space-y-4 pt-4">
          <ModelTable />
        </div>
      ),
    },
    {
      key: 'content-security',
      code: 'content_security',
      label: $t('内容安全'),
      children: (
        <div className="space-y-4">
          <ContentSecurity />
        </div>
      ),
    },
  ]

  // 根据菜单权限过滤标签页
  const items = allItems.filter((item) => hasMenuPermission(item.code, Array.isArray(menuList) ? menuList : []))

  return (
    <div className="bg-white min-h-full rounded-lg p-6">
      <h1 className="text-xl font-bold mb-6">{$t('其他配置')}</h1>
      <Tabs items={items} />
    </div>
  )
}
