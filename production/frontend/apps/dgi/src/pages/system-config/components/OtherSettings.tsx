import { useState } from 'react'
import { Card, Switch, Tooltip, message } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import { useRequest } from 'ahooks'
import { apiSecurityLevelSwitch, apiSecurityLevelSwitchUpdate } from '@/services/api'
import { useSystemConfig } from '@/hooks/use-system-config'
import { $t } from '@/locales'

export default function OtherSettings() {
  const [securityLevelEnabled, setSecurityLevelEnabled] = useState(false)

  const { refresh } = useSystemConfig(true)

  // 获取密级管理开关状态
  const { loading: initLoading } = useRequest(apiSecurityLevelSwitch, {
    onSuccess: (res) => {
      setSecurityLevelEnabled(res.data.security_level_enabled)
    },
    onError: (error) => {
      message.error($t('获取密级管理状态失败'))
      console.error('获取密级管理状态失败:', error)
    },
  })

  // 更新密级管理状态
  const { loading: updateLoading, run: updateSecurityLevel } = useRequest(
    async (enabled: boolean) => {
      return apiSecurityLevelSwitchUpdate({ security_level_enabled: enabled })
    },
    {
      manual: true,
      onSuccess: () => {
        message.success($t('设置更新成功'))
        refresh()
      },
      onError: (error) => {
        message.error($t('设置更新失败'))
        // 恢复开关状态
        setSecurityLevelEnabled((prev) => !prev)
        console.error('更新密级管理设置失败:', error)
      },
    },
  )

  const handleSecurityLevelChange = async (checked: boolean) => {
    setSecurityLevelEnabled(checked)
    await updateSecurityLevel(checked)
  }

  return (
    <Card title={$t('系统设置')} className="shadow-sm">
      <div className="flex items-center justify-between py-4 border-b">
        <div className="flex items-center space-x-2">
          <span className="text-base">{$t('密级管理')}</span>
          <Tooltip
            title={$t('开启后，秘钥、渠道、模型数据实体会支持密级控制。在创建、使用实体时会校验人员权限。')}
            placement="right"
          >
            <InfoCircleOutlined className="text-gray-400 cursor-help" />
          </Tooltip>
        </div>
        <Switch
          checked={securityLevelEnabled}
          onChange={handleSecurityLevelChange}
          loading={initLoading || updateLoading}
          checkedChildren={$t('开启')}
          unCheckedChildren={$t('关闭')}
        />
      </div>
    </Card>
  )
}
