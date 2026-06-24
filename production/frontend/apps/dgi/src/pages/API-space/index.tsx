import React, { useMemo, useState } from 'react'
import { Button, Empty, Input, Pagination, Spin, Tag } from 'antd'
import { useRequest } from 'ahooks'
import { EyeOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import Title from '@/components/Title'
import { useTransform } from '@/locales'
import { apiService } from '@/services/apiService'
import { ModelLogo } from '@/components/model-card/ModelLogo'
import { ModelAttributeService } from '@/services/modelAttributeApi'
import './index.css'
import FilterItem from '@/components/squre/FilterItem'

interface ApiItem {
  id: number
  name: string
  description?: string
  category?: string
  logo?: string
  price?: number
  can_use?: 'usable' | 'viewable' | string
  view?: 'usable' | 'viewable' | string
  permission_status?: string | number
  custom_attribute_values?: Array<{
    attribute_id: number
    attribute_name: string
    value: string
  }>
}

const PAGE_SIZE = 12

/** 模型广场 ModelCard 同款小标签样式 */
const ApiCardTag: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span
    style={{ color: 'rgba(38, 36, 76, 0.45)' }}
    className="inline-block bg-gray-100 text-xs min-h-5 px-2 py-0.5 text-center leading-5 rounded-sm"
  >
    {children}
  </span>
)

const ApiCard: React.FC<{
  item: ApiItem
  /** 列表按权限筛选时，接口可能不把权限回显在 item 上，用当前筛选值兜底 */
  permissionFallback?: string
  onViewDetails: (item: ApiItem) => void
}> = ({ item, permissionFallback, onViewDetails }) => {
  const metaTags = useMemo(() => {
    const tags: { key: string, label: string }[] = []
    if (item?.can_use) {
      if (item?.can_use === 'usable') tags.push({ key: 'perm-usable', label: '使用权限' })
      else if (item?.can_use === 'viewable') tags.push({ key: 'perm-viewable', label: '查看权限' })
    }
    if (item?.custom_attribute_values) {
      item.custom_attribute_values.forEach((o) => {
        o.value.split(',').forEach((value, i) => {
          tags.push({
            key: `attr-${o.attribute_id}-${value}-${i}`,
            label: `${o.attribute_name}-${value}`,
          })
        })
      })
    }
    return tags
  }, [item, permissionFallback])

  return (
    <div
      className="api-card with-actions"
    >
      <div className="info-content">
        <div className="flex gap-4 shrink-0">
          <ModelLogo name={item.name} logo={item.logo} size="medium" />
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <p className="text-base mb-0 text-default line-clamp-1">{item.name}</p>
            <div className="flex flex-wrap items-center gap-1.5 leading-6">
              {metaTags.map((t) => (
                <ApiCardTag key={t.key}>{t.label}</ApiCardTag>
              ))}
            </div>
          </div>
        </div>
        <div
          title={item.description || ''}
          className="text-xs text-label line-clamp-2 wrap-break-word mt-2 shrink-0"
        >
          {item.description || '--'}
        </div>
      </div>

      <div className="action-buttons" onClick={(e) => e.stopPropagation()}>
        <Button size="small" onClick={() => onViewDetails(item)} icon={<EyeOutlined />}>
          查看详情
        </Button>
      </div>
    </div>
  )
}

export default function ApiSpacePage() {
  const { $t } = useTransform()
  const navigate = useNavigate()

  const apiPermissionOptions = useMemo(() => ([
    { label: '使用权限', value: 'usable' },
    { label: '查看权限', value: 'viewable' },
  ]), [])

  const [selectedPermission, setSelectedPermission] = useState<string | undefined>(undefined)
  const [selectedApiAttribute, setSelectedApiAttribute] = useState<string[]>([])
  const [current, setCurrent] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [apiName, setApiName] = useState('')

  const { data: apiAttributeList = [] } = useRequest(
    () =>
      ModelAttributeService.list({
        owner_type: 'api',
        page_number: 1,
        page_size: 99,
      }).then((res) => res.items),
    { staleTime: 0 },
  )

  const selectedItems = useMemo(() => {
    const items: Array<{ label: string, type: 'apiPermission' | 'apiAttribute', value: string }> = []
    if (selectedPermission) {
      const label = apiPermissionOptions.find((o) => o.value === selectedPermission)?.label
      if (label) items.push({ label, type: 'apiPermission', value: selectedPermission })
    }
    if (selectedApiAttribute.length > 0) {
      selectedApiAttribute.forEach((item) => {
        const arrWithId = item.split('-', 2)
        const label = apiAttributeList.find((o: any) => arrWithId[0] === o.id.toString())?.name
        if (label) items.push({ label: `${label}-${arrWithId[1]}`, type: 'apiAttribute', value: item })
      })
    }
    return items
  }, [apiAttributeList, apiPermissionOptions, selectedApiAttribute, selectedPermission])

  const {
    data = { items: [], total: 0 },
    loading: listLoading,
  } = useRequest(
    () => {
      const attribute: Record<string, any> = {}
      if (selectedApiAttribute.length > 0) {
        selectedApiAttribute.forEach((item) => {
          const arrWithId = item.split('-', 2)
          attribute[`custom_attr_${arrWithId[0]}`] = arrWithId[1]
        })
      }

      return apiService.getApiList({
        page_number: current,
        page_size: pageSize,
        api_name: apiName,
        view: (selectedPermission as any) || undefined,
        ...attribute,
      } as any).then((res) => res || { items: [], total: 0 })
    },
    {
      refreshDeps: [current, pageSize, apiName, selectedPermission, selectedApiAttribute],
    },
  )

  const items = (data.items || []) as ApiItem[]

  const handleViewDetails = (item: ApiItem) => {
    // 详情暂不跳转
    navigate(`/api-space/${item.id}`)
  }

  return (
    <div className="h-full bg-gray-50">
      <div className="bg-white rounded-lg shadow-sm p-6 h-full flex flex-col">
        <Title
          title={$t('API广场')}
          description={$t('企业统一API门户，让API安全可靠的被使用，驱动AI赋能')}
        />

        <div className="flex items-center justify-between mb-3 gap-6">
          <h3 className="text-base font-medium text-gray-900 m-0 w-[200px]">
            {$t('API筛选')}
          </h3>
          <div className="flex flex-1 justify-between items-center">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-gray-600">
                {$t('API')}
                {' '}
                <span className="text-gray-900 font-medium">{data.total}</span>
                {' '}
                个
              </span>

              {selectedItems.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedItems.map((it) => (
                    <Tag
                      key={`${it.type}-${it.value}`}
                      closable
                      onClose={() => {
                        switch (it.type) {
                          case 'apiPermission':
                            setSelectedPermission(undefined)
                            break
                          case 'apiAttribute':
                            setSelectedApiAttribute((prev) => prev.filter((v) => v !== it.value))
                            break
                        }
                        setCurrent(1)
                      }}
                    >
                      {it.label}
                    </Tag>
                  ))}
                </div>
              )}

              {selectedItems.length > 0 && (
                <span
                  className="text-sm text-blue-500 cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => {
                    setSelectedPermission(undefined)
                    setSelectedApiAttribute([])
                    setApiName('')
                    setCurrent(1)
                  }}
                >
                  {$t('清空')}
                </span>
              )}
            </div>
            <div>
              <Input.Search
                value={apiName}
                placeholder={$t('请输入API名称')}
                onSearch={() => setCurrent(1)}
                onChange={(e) => {
                  setApiName(e.target.value)
                  setCurrent(1)
                }}
                className="w-full"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-4 flex-1 min-h-0">
          <div className="w-[200px] shrink-0 h-full min-h-0 overflow-y-auto">
            <FilterItem
              title={$t('API权限')}
              options={apiPermissionOptions}
              selected={selectedPermission}
              onSelect={(v?: string) => {
                if (v === selectedPermission) setSelectedPermission(undefined)
                else setSelectedPermission(v)
                setCurrent(1)
              }}
            />

            {apiAttributeList?.map((attr: any) => (
              <FilterItem
                key={attr?.id}
                title={attr?.name}
                options={(JSON.parse(attr?.option_values || '[]') as string[]).map((o) => (
                  { label: o, value: `${attr?.id}-${o}` }),
                )}
                selected={selectedApiAttribute.length ? selectedApiAttribute.join(',') : undefined}
                mutiple
                onSelect={(v) => {
                  if (typeof v !== 'string') return
                  if (selectedApiAttribute.includes(v)) {
                    setSelectedApiAttribute((prev) => prev.filter((item) => item !== v))
                  }
                  else {
                    setSelectedApiAttribute((prev) => [...prev, v])
                  }
                  setCurrent(1)
                }}
              />
            ))}
          </div>

          <div className="flex-1 min-w-0">
            <Spin spinning={listLoading}>
              {items.length === 0 ? (
                <div className="flex items-center justify-center h-full min-h-[300px]">
                  <Empty description={$t('暂无数据')} />
                </div>
              ) : (
                <div className="flex flex-wrap gap-4 h-[calc(100vh-300px)] overflow-y-auto content-start pb-4 w-full pr-2">
                  {items.map((item) => (
                    <ApiCard
                      key={item.id}
                      item={item}
                      permissionFallback={selectedPermission}
                      onViewDetails={handleViewDetails}
                    />
                  ))}
                </div>
              )}
            </Spin>

            <Pagination
              current={current}
              pageSize={pageSize}
              total={data.total}
              showSizeChanger
              pageSizeOptions={[12, 24, 36, 48]}
              onShowSizeChange={(_, size) => setPageSize(size)}
              onChange={setCurrent}
              showTotal={(total) => $t(`总共 {total} 条`, { total })}
              className="justify-end! mt-4"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
