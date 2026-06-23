import React, { useState } from 'react'
import { Tabs } from 'antd'
import AttributeSetting from './AttributeSetting'
import { TagsSetting } from './TagsSetting'
import TrainingParameterTemplateSetting from './TrainingParameterTemplateSetting'
import { useSystemSetting } from '@/hooks/system/systemSetting'

const AdminSystemSettings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('attribute')
  const { canViewTabs } = useSystemSetting()
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
        onChange={setActiveTab}
        items={[
          {
            key: 'attribute',
            label: '属性配置',
            children: <AttributeSetting activeTab={activeTab} />,
          },
          {
            key: 'tags',
            label: '标签配置',
            children: <TagsSetting />,
          },
          {
            key: 'training-template',
            label: '训练参数模板',
            children: <TrainingParameterTemplateSetting />,
          },
        ].filter((item) => canViewTabs.includes(item.key))}
      />
    </div>
  )
}
export default AdminSystemSettings
