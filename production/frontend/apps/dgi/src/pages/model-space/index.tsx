import React, { useMemo, useState } from 'react'
import { Empty, Input, Pagination, Spin, Tag } from 'antd'
import { useRequest } from 'ahooks'
import { useShallow } from 'zustand/react/shallow'
import { useSystemConfig } from '@/hooks/use-system-config'
import { apiModelList } from '@/services/api'
import { useTransform } from '@/locales'
import Title from '@/components/Title'
import ModelCard from '@/components/model-card'
import useMenuStore from '@/stores/menu'
import { ModelAttributeService } from '@/services/modelAttributeApi'
import FilterItem from '@/components/squre/FilterItem'

interface ModelItem {
  id: number
  model_name: string
  model_type: string
  description?: string
  logo?: string
  updated_time?: number
  model_count?: number
  category?: string
  security_policy?: string
  security_policy_out?: string
  ability_count?: number
  data_level: string
}

const PAGE_SIZE = 12

const ModelSpacePage: React.FC = () => {
  const { $t } = useTransform()
  const isSanYuan = useMenuStore(useShallow((state) => state.isSanYuan))
  // 左侧类型选中
  const [selectedType, setSelectedType] = useState<string | undefined>(
    undefined,
  )
  // 输入审核策略选中
  const [selectedSecurityIn, setSelectedSecurityIn] = useState<string | number | undefined>(undefined)
  // 输出审核策略选中
  const [selectedSecurityOut, setSelectedSecurityOut] = useState<string | number | undefined>(undefined)
  // 模型密级选中
  const [selectedSecurityLevel, setSelectedSecurityLevel] = useState<string | undefined>(
    undefined,
  )
  // 模型权限选中
  const [selectedModelPermission, setSelectedModelPermission] = useState<string | undefined>(
    undefined,
  )
  // 分页
  const [current, setCurrent] = useState(1)
  const [modelName, setModelName] = useState('')

  const [pageSize, setPageSize] = useState(PAGE_SIZE)

  const [selectedModelAttribute, setSelectedModelAttribute] = useState<string[] | undefined>(undefined)
  const { data: ModelAttributeList = [] } = useRequest(
    () => ModelAttributeService.allList(),
    { staleTime: 0 },
  )

  // 密级选项数据
  // const [securityLevels, setSecurityLevels] = useState<Array<{label: string; value: string}>>([]);

  // 获取模型类型
  const {
    modelTypeOptions,
    isLoading: typeLoading,
    securityPolicyOptions,
    securityLevel,
    securityLevelEnabled,
    modelPermissionOptions,
  } = useSystemConfig(true)

  // // 获取密级选项数据
  // useEffect(() => {
  //   const enabledLevels = PermissionHelper.getEnabledDataSecurityLevels(securityLevel as UserPermissionLevel || '非密');
  //   setSecurityLevels(enabledLevels);
  // }, [securityLevel]);

  // 被选中的所有元素数组，包含类型和值信息
  const selectedItems = useMemo(() => {
    const items: Array<{ label: string, type: 'type' | 'security_in' | 'security_out' | 'securityLevel' | 'modelPermission' | 'modelAttribute', value: string | number }> = []
    // 模型类型
    if (selectedType) {
      const label = modelTypeOptions.find((item) => item.value === selectedType)?.label
      if (label) items.push({ label, type: 'type', value: selectedType })
    }
    // 输入审核策略
    if (selectedSecurityIn != null) {
      const label = securityPolicyOptions.find((item) => String(item.value) === String(selectedSecurityIn))?.label
      if (label) items.push({ label: `${$t('输入' as any)}-${label}`, type: 'security_in', value: selectedSecurityIn })
    }
    // 输出审核策略
    if (selectedSecurityOut != null) {
      const label = securityPolicyOptions.find((item) => String(item.value) === String(selectedSecurityOut))?.label
      if (label) items.push({ label: `${$t('输出' as any)}-${label}`, type: 'security_out', value: selectedSecurityOut })
    }
    // 密集
    if (selectedSecurityLevel) {
      const label = securityLevel.find((item) => item.value === selectedSecurityLevel)?.label
      if (label) items.push({ label, type: 'securityLevel', value: selectedSecurityLevel })
    }
    // 模型权限
    if (selectedModelPermission) {
      const label = modelPermissionOptions.find((item) => item.value === selectedModelPermission)?.label
      if (label) items.push({ label, type: 'modelPermission', value: selectedModelPermission })
    }
    // 自定义属性
    if (selectedModelAttribute) {
      selectedModelAttribute.forEach((item) => {
        const arrWithId = item.split('-', 2)
        const label = ModelAttributeList.find((o) => arrWithId[0] === o.id.toString())?.name
        if (label) items.push({ label: `${label}-${arrWithId[1]}`, type: 'modelAttribute', value: item })
      })
    }
    return items
  }, [
    selectedType,
    selectedSecurityIn,
    selectedSecurityOut,
    selectedSecurityLevel,
    selectedModelPermission,
    selectedModelAttribute,
    securityPolicyOptions,
    modelTypeOptions,
    modelPermissionOptions,
    securityLevel,
    ModelAttributeList,
    $t,
  ])

  // 获取模型列表
  const {
    data = { items: [], total: 0 },
    loading: listLoading,
  } = useRequest(
    () => {
      const attribute = {}
      if (selectedModelAttribute) {
        selectedModelAttribute.forEach((item) => {
          const arrWithId = item.split('-', 2)
          attribute[`custom_attr_${arrWithId[0]}`] = arrWithId[1]
        })
      }
      return apiModelList({
        page_number: current,
        page_size: pageSize,
        category: selectedType,
        model_name: modelName,
        security_policy: selectedSecurityIn as any,
        security_policy_out: selectedSecurityOut as any,
        data_level: selectedSecurityLevel,
        view: selectedModelPermission as any,
        ...attribute,
      }).then((res) => res?.data || { items: [], total: 0 })
    },
    {
      refreshDeps: [current, selectedType, modelName, selectedSecurityIn, selectedSecurityOut, selectedSecurityLevel, selectedModelPermission, pageSize, selectedModelAttribute],
    },
  )

  return (
    <div className="h-full bg-gray-50">
      <div className="bg-white rounded-lg shadow-sm p-6 h-full min-h-0 flex flex-col">
        <Title
          title={$t('模型广场')}
          description={$t('企业统一模型门户，让模型安全可靠的被使用，驱动AI赋能')}
        />

        {/* 筛选标题和清空按钮 */}
        <div className="flex items-center justify-between mb-3 gap-6">
          <h3 className="text-base font-medium text-gray-900 m-0 w-[200px]">
            {$t('模型筛选')}
          </h3>
          <div className="flex flex-1 justify-between items-center">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-gray-600">
                {$t('模型')}
                {' '}
                <span className="text-gray-900 font-medium">{data.total}</span>
                {' '}
                个
              </span>

              {/* 被选中的元素 */}
              {selectedItems.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedItems.map((item) => (
                    <Tag
                      key={`${item.type}-${String(item.value)}`}
                      closable
                      onClose={() => {
                        switch (item.type) {
                          case 'type':
                            setSelectedType(undefined)
                            break
                          case 'security_in':
                            setSelectedSecurityIn(undefined)
                            break
                          case 'security_out':
                            setSelectedSecurityOut(undefined)
                            break
                          case 'securityLevel':
                            setSelectedSecurityLevel(undefined)
                            break
                          case 'modelPermission':
                            setSelectedModelPermission(undefined)
                            break
                          case 'modelAttribute':
                            setSelectedModelAttribute((prev) => prev?.filter((v) => v !== String(item.value)) ?? [])
                            break
                        }
                        setCurrent(1)
                      }}
                    >
                      {item.label}
                    </Tag>
                  ))}
                </div>
              )}

              {/* 清空按钮 */}
              {selectedItems.length > 0 && (
                <span
                  className="text-sm text-blue-500 cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => {
                    setSelectedType(undefined)
                    setSelectedSecurityIn(undefined)
                    setSelectedSecurityOut(undefined)
                    setSelectedSecurityLevel(undefined)
                    setSelectedModelPermission(undefined)
                    setSelectedModelAttribute(undefined)
                    setModelName('')
                    setCurrent(1)
                  }}
                >
                  {$t('清空')}
                </span>
              )}
            </div>
            <div>
              <Input.Search
                value={modelName}
                placeholder={$t('请输入模型名称')}
                onSearch={() => {
                  setCurrent(1)
                }}
                onChange={(e) => {
                  setModelName(e.target.value)
                  setCurrent(1)
                }}
                className="w-full"
              />
            </div>
          </div>

        </div>

        <div className="flex gap-4 flex-1 min-h-0">
          {/* 左侧筛选栏 */}
          <div className="w-[200px] shrink-0 h-full min-h-0 overflow-y-auto">
            {!isSanYuan && (
              <FilterItem
                title={$t('模型权限')}
                options={modelPermissionOptions as any}
                selected={selectedModelPermission}
                onSelect={(v?: string) => {
                  if (v === selectedModelPermission) {
                    setSelectedModelPermission(undefined)
                  }
                  else {
                    setSelectedModelPermission(v)
                  }
                  setCurrent(1)
                }}
              >
              </FilterItem>
            )}
            <FilterItem
              title={$t('模型类型')}
              options={modelTypeOptions as any}
              selected={selectedType}
              onSelect={(v?: string) => {
                if (v === selectedType) {
                  setSelectedType(undefined)
                }
                else {
                  setSelectedType(v)
                }
                setCurrent(1)
              }}
            >
            </FilterItem>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                {$t('内容安全审核策略')}
              </label>

              <div className="mb-4">
                <div className="text-xs text-gray-500 mb-2">
                  {$t('输入' as any)}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(securityPolicyOptions as any[]).map((item) => {
                    const active = String(selectedSecurityIn) === String(item.value)
                    return (
                      <span
                        key={`security-in-${String(item.value)}`}
                        className={[
                          'px-3 py-2 text-[12px] rounded-md cursor-pointer transition-all border whitespace-nowrap text-center',
                          active
                            ? 'border-blue-500 bg-blue-50 text-blue-600 font-medium'
                            : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50',
                        ].join(' ')}
                        onClick={() => {
                          if (active) setSelectedSecurityIn(undefined)
                          else setSelectedSecurityIn(item.value)
                          setCurrent(1)
                        }}
                      >
                        {item.label}
                      </span>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-2">
                  {$t('输出' as any)}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(securityPolicyOptions as any[]).map((item) => {
                    const active = String(selectedSecurityOut) === String(item.value)
                    return (
                      <span
                        key={`security-out-${String(item.value)}`}
                        className={[
                          'px-3 py-2 text-[12px] rounded-md cursor-pointer transition-all border whitespace-nowrap text-center',
                          active
                            ? 'border-blue-500 bg-blue-50 text-blue-600 font-medium'
                            : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50',
                        ].join(' ')}
                        onClick={() => {
                          if (active) setSelectedSecurityOut(undefined)
                          else setSelectedSecurityOut(item.value)
                          setCurrent(1)
                        }}
                      >
                        {item.label}
                      </span>
                    )
                  })}
                </div>
              </div>
            </div>
            {ModelAttributeList?.map((item) => (
              <FilterItem
                key={item?.id}
                title={item?.name}
                options={(JSON.parse(item?.option_values || '[]') as string[]).map((o) => (
                  { label: o, value: `${item?.id}-${o}` }),
                )}
                selected={selectedModelAttribute?.join(',')}
                mutiple
                onSelect={(v?: string) => {
                  if (selectedModelAttribute?.includes(v)) {
                    setSelectedModelAttribute((prev) => prev?.filter((item) => item !== v) ?? [])
                  }
                  else {
                    setSelectedModelAttribute((prev) => [...(prev ?? []), v])
                  }
                  setCurrent(1)
                }}
              >
              </FilterItem>
            ))}
            {securityLevelEnabled && (
              <FilterItem
                title={$t('模型密级')}
                options={securityLevel}
                selected={selectedSecurityLevel}
                onSelect={(v?: string) => {
                  if (v === selectedSecurityLevel) {
                    setSelectedSecurityLevel(undefined)
                  }
                  else {
                    setSelectedSecurityLevel(v)
                  }
                  setCurrent(1)
                }}
              >
              </FilterItem>
            )}
          </div>

          {/* 右侧主体块 */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col h-full">
            <div className="flex flex-col h-full min-h-0">
              {/* content-start 解决flexbox设置固定高度且数据不满的情况下，align-content: stretch; 行之间产生间隔，或者配置min-h和max-h，但是效果没有center-start好 */}
              <div className="flex-1 min-h-0 overflow-y-auto pb-4 w-full pr-2">
                <Spin spinning={listLoading || typeLoading}>
                  {data.items.length ? (
                    <div className="flex flex-wrap gap-4 content-start">
                      {data.items.map((item: ModelItem) => (
                        <ModelCard key={item.id} item={item} showActions isSanYuan={isSanYuan}></ModelCard>
                      ))}
                    </div>
                  ) : (
                    <Empty description={$t('暂无模型')} className="mt-24" />
                  )}
                </Spin>
              </div>

              {!!data.items.length && (
                <Pagination
                  current={current}
                  pageSize={pageSize}
                  total={data.total}
                  showSizeChanger
                  pageSizeOptions={[12, 24, 36, 48]}
                  onShowSizeChange={(page, size) => {
                    setPageSize(size)
                  }}
                  onChange={setCurrent}
                  showTotal={(total) => $t(`总共 {total} 条`, { total })}
                  className="justify-end! shrink-0"
                // locale={antdLocale.Pagination}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ModelSpacePage
