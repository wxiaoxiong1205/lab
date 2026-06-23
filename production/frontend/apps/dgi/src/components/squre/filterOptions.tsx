import { useMemo } from 'react'
import { useRequest } from 'ahooks'
import { useShallow } from 'zustand/react/shallow'
import { useSystemConfig } from '@/hooks/use-system-config'
import { ModelAttributeService } from '@/services/modelAttributeApi'
import useMenuStore from '@/stores/menu'
import { useTransform } from '@/locales'

/**
 * 获取模型广场用的 options 配置
 */
export function useSqureFilterOptions(filterType: 'model' | 'api' = 'model') {
  const isSanYuan = useMenuStore(useShallow((state) => state.isSanYuan))
  const { $t } = useTransform()

  const { data: attributeList = [] } = useRequest(
    () =>
      ModelAttributeService.list({
        owner_type: filterType === 'api' ? 'api' : 'model',
        page_number: 1,
        page_size: 99,
      }).then((res) => res.items),
    { staleTime: 0 },
  )

  // 系统相关选项
  const {
    modelTypeOptions,
    isLoading: typeLoading,
    securityPolicyOptions,
    modelPermissionOptions,
  } = useSystemConfig(true)

  // 模型权限选项
  const permissionOptions = {
    title: filterType === 'model' ? $t('模型权限') : $t('API权限'),
    key: 'view',
    isMultiple: false,
    options: modelPermissionOptions as any,
  }
  // 模型类型选项
  const ModelCategoryOptions = {
    title: $t('模型类型'),
    key: 'category',
    isMultiple: false,
    options: modelTypeOptions as any,
  }
  // 安全策略审核选项
  const SecurityPolicyOptions = {
    title: $t('安全策略审核'),
    children: [
      {
        title: $t('输入'),
        key: 'security_policy',
        isMultiple: false,
        options: securityPolicyOptions as any,
      },
      {
        title: $t('输出'),
        key: 'security_policy_out',
        isMultiple: false,
        options: securityPolicyOptions as any,
      },
    ],
  }

  const squreAttributeOptions = attributeList.map((item: any) => ({
    title: item.name,
    key: `custom_attr_${item.id}`,
    isMultiple: true,
    needTitle: true,
    options: (JSON.parse(item?.option_values || '[]') as string[]).map((o) => (
      { label: o, value: o }
    )),
  }))

  // 模型广场
  const modelFilterOptions = useMemo(() => {
    return [
      !isSanYuan && permissionOptions,
      ModelCategoryOptions,
      SecurityPolicyOptions,
      ...squreAttributeOptions,
    ]
  }, [isSanYuan, permissionOptions, ModelCategoryOptions, SecurityPolicyOptions, squreAttributeOptions])

  // API广场
  const apiFilterOptions = useMemo(() => {
    return [
      !isSanYuan && permissionOptions,
      ...squreAttributeOptions,
    ]
  }, [isSanYuan, permissionOptions, squreAttributeOptions])

  const squreFilterOptions = filterType === 'model' ? modelFilterOptions : apiFilterOptions

  return { squreFilterOptions, typeLoading }
}
