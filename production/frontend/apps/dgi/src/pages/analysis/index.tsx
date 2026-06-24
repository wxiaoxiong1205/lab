import { Segmented } from 'antd'
import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import StatisticalAnalysis from './components/StatisticalAnalysis'
import PowerResource from './components/PowerResource'
import { hasMenuPermission } from '@/utils'
import useMenuStore from '@/stores/menu'
import { $t } from '@/locales'

type TabProps = '算力资源' | '模型请求'

const AnalysisPage: React.FC = () => {
  // TODO: 菜单已移除，待移除算力资源相关代码
  const POWER_RESOURCE = $t('算力资源')
  const MODEL_REQUEST = $t('模型请求')

  // 获取菜单权限
  const { menuList } = useMenuStore(
    useShallow((state) => ({
      menuList: state.menuList,
    })),
  )

  // 检查权限
  const hasComputingPowerPermission = hasMenuPermission('computing_power_resources', Array.isArray(menuList) ? menuList : [])
  const hasModelRequestPermission = hasMenuPermission('model_requests', Array.isArray(menuList) ? menuList : [])

  // 根据权限生成可用选项
  const availableOptions: TabProps[] = []
  if (hasComputingPowerPermission) {
    availableOptions.push(POWER_RESOURCE as TabProps)
  }
  if (hasModelRequestPermission) {
    availableOptions.push(MODEL_REQUEST as TabProps)
  }

  // 设置默认选择的 tab（选择第一个可用选项）
  const [tabValue, setTabValue] = React.useState<TabProps>(() => {
    if (availableOptions.length > 0) {
      return availableOptions[0] as TabProps
    }
    return POWER_RESOURCE as TabProps // 兜底值
  })

  // 如果当前选中的 tab 不在可用选项中，切换到第一个可用选项
  React.useEffect(() => {
    if (availableOptions.length > 0 && !availableOptions.includes(tabValue)) {
      setTabValue(availableOptions[0] as TabProps)
    }
  }, [availableOptions, tabValue])

  // 如果没有任何权限，不显示内容
  if (availableOptions.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg">
        <div className="text-center text-gray-500">
          暂无权限访问相关功能
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* 只有多个选项时才显示 Segmented */}
      {availableOptions.length > 1 && (
        <Segmented
          value={tabValue}
          style={{ marginBottom: 8 }}
          onChange={(value) => setTabValue(value as TabProps)}
          options={availableOptions as string[]}
        />
      )}
      <div className="bg-white p-6 rounded-lg">
        {tabValue === POWER_RESOURCE && hasComputingPowerPermission && <PowerResource />}
        {tabValue === MODEL_REQUEST && hasModelRequestPermission && <StatisticalAnalysis />}
      </div>
    </div>
  )
}

export default AnalysisPage
