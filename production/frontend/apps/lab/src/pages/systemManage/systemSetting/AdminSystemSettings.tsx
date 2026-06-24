import React, { useState } from 'react'
import { Tabs } from 'antd'
import AttributeSetting from './AttributeSetting'
import { TagsSetting } from './TagsSetting'
import TemplateSetting from './TemplateSetting'
import { useSystemSetting } from '@/hooks/system/systemSetting'

const AdminSystemSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('attribute')
  const [tabRefreshKeys, setTabRefreshKeys] = useState<Record<string, number>>({
    attribute: 0,
    tags: 0,
    template: 0,
  })
  const { canViewTabs } = useSystemSetting()

  const handleTabChange = (key: string) => {
    setActiveTab(key)
    setTabRefreshKeys((prev) => ({
      ...prev,
      [key]: (prev[key] ?? 0) + 1,
    }))
  }

  return (
    <div className="admin-system-settings-container lab-list-page-shell box-border w-full min-w-0 max-w-full">
      {/* 页面标题 */}
      <h1 className="text-[24px] font-bold mt-0">
        系统配置
      </h1>

      {/* 顶部标签页；min-w-0 让 Tab 内表格在窄屏下可收缩，横向滚动留在内容区 */}
      <Tabs
        className="min-w-0 [&_.ant-tabs-content-holder]:min-w-0 [&_.ant-tabs-content]:min-w-0 [&_.ant-tabs-tabpane]:min-w-0 mb-[0]"
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          {
            key: 'attribute',
            label: '属性配置',
            children: <AttributeSetting key={`attribute-${tabRefreshKeys.attribute}`} activeTab={activeTab} />,
          },
          {
            key: 'tags',
            label: '标签配置',
            children: <TagsSetting key={`tags-${tabRefreshKeys.tags}`} />,
          },
          {
            key: 'template',
            label: '模板管理',
            children: <TemplateSetting key={`template-${tabRefreshKeys.template}`} />,
          },
        ].filter((item) => canViewTabs.includes(item.key))}
      />
    </div>
  )
}
export default AdminSystemSettings
