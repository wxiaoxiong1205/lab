import { Segmented } from 'antd'
import React from 'react'
import AlarmRulesPage from './components/AlarmRulesPage'
import EventManagementPage from './components/EventManagementPage'

type TabProps = '告警规则' | '事件管理'

const AlarmManagePage: React.FC = () => {
  const ALARM_RULES = '告警规则'
  const EVENT_MANAGEMENT = '事件管理'
  const [tabValue, setTabValue] = React.useState<TabProps>(ALARM_RULES)

  return (
    <div>
      <Segmented
        value={tabValue}
        style={{ marginBottom: 8 }}
        onChange={setTabValue}
        options={[ALARM_RULES, EVENT_MANAGEMENT] as const}
      />
      <div className="bg-white p-6 rounded-lg">
        {tabValue === ALARM_RULES ? <AlarmRulesPage /> : <EventManagementPage />}
      </div>
    </div>
  )
}

export default AlarmManagePage
