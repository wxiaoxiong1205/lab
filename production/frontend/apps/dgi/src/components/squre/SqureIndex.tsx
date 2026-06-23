import { useCallback, useEffect, useMemo, useState } from 'react'
import { Empty, Input, Pagination, Spin, Tag } from 'antd'
import FilterItem from './FilterItem'
import SqureItemCard from './squreItemCard'
import Title from '@/components/Title'
import { useTransform } from '@/locales'
import './index.css'

export interface SqureIndexProps {
  title: string
  description: string

  filterType: 'model' | 'api'
  filterOptions: FilterOption[]

  current: number
  setCurrent: (current: number) => void
  pageSize: number
  setPageSize: (pageSize: number) => void
  listLoading: boolean

  data: any
  onChange: (selectedOption: { [key: string]: string | undefined }) => void
  onSearch: (searchValue: string) => void
}

export interface FilterOption {
  title: string
  key?: string
  isMultiple?: boolean
  needTitle?: boolean
  options?: { label: string, value: string }[]
  children?: FilterOption[]
}

export default function SqureIndex({
  title,
  description,

  filterType,
  filterOptions,

  current,
  setCurrent,
  pageSize,
  setPageSize,
  listLoading,

  data,
  onChange,
  onSearch,
}: SqureIndexProps) {
  const { $t } = useTransform()

  const [searchValue, setSearchValue] = useState('')

  // children 只有一层：父项有 children 就取 children 的 key，否则取自身 key
  const filterKeys = useMemo(() => {
    const keys = filterOptions.flatMap((item) => {
      if (item.children?.length) return item.children.map((c) => c.key).filter(Boolean) as string[]
      return item.key ? [item.key] : []
    })
    return keys.join('|')
  }, [filterOptions])
  const buildSelectedOption = useCallback((prev: Record<string, string | undefined> = {}) => {
    const nextSelected: Record<string, string | undefined> = {}
    filterKeys.split('|').filter(Boolean).forEach((key) => {
      nextSelected[key] = prev[key]
    })
    return nextSelected
  }, [filterKeys])

  // 选中的选项，分别为选择内容的对象，初始化
  const [SelectedOption, setSelectedOption] = useState<Record<string, string | undefined>>(() => buildSelectedOption())
  useEffect(() => {
    setSelectedOption((prev) => {
      const nextSelected = buildSelectedOption(prev)
      if (Object.keys(prev).length === Object.keys(nextSelected).length && Object.keys(nextSelected).every((key) => prev[key] === nextSelected[key])) {
        return prev
      }
      return nextSelected
    })
  }, [buildSelectedOption])

  useEffect(() => {
    onChange(SelectedOption)
  }, [SelectedOption, onChange])

  // 获取在筛选栏中的内容
  const getSelectedText = useCallback((key: string, value: string | undefined) => {
    if (!value) return ''

    // children 只有一层：优先从 children 里找
    for (const item of filterOptions) {
      if (item.children?.length) {
        const child = item.children.find((c) => c.key === key)
        if (child) {
          const label = (child.options ?? []).find((opt) => opt.value === value)?.label ?? ''
          return label ? `${child.title}-${label}` : child.title
        }
      }
    }

    // 普通项：直接找 label
    const item = filterOptions.find((item) => item.key === key)
    const option = item?.options?.find((opt) => opt.value === value)
    if (item?.needTitle) {
      return `${item?.title}-${option?.label}`
    }
    return option?.label ?? ''
  }, [filterOptions])

  // 获取选中的选项后触发事件
  const onSelecte = (element: FilterOption, v: string | string[] | undefined) => {
    const nextValue = Array.isArray(v) ? v.join(',') : v
    if (element.isMultiple) {
      setSelectedOption((prev) => {
        const curr = prev[element.key!]?.split(',').filter(Boolean) ?? []
        if (!nextValue) return { ...prev, [element.key!]: undefined }
        const nextArr = curr.includes(nextValue)
          ? curr.filter((x) => x !== nextValue)
          : [...curr, nextValue]
        return { ...prev, [element.key!]: nextArr.length ? nextArr.join(',') : undefined }
      })
    }
    else {
      setSelectedOption((prev) => ({
        ...prev,
        [element.key!]: prev[element.key!] === nextValue ? undefined : nextValue,
      }))
    }
  }

  return (
    <div className="h-full bg-gray-50">
      <div className="bg-white rounded-lg shadow-sm p-6 h-full min-h-0 flex flex-col">
        <Title title={title} description={description} />

        {/* 筛选行 */}
        <div className="flex items-center justify-between mb-3 gap-6">
          <h3 className="text-base font-medium text-gray-900 m-0 w-[200px]">
            {filterType === 'model' ? $t('模型筛选') : $t('API筛选')}
          </h3>
          <div className="flex flex-1 justify-between items-center">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-gray-600">
                {filterType === 'model' ? $t('模型') : $t('API')}
                <span className="text-gray-900 font-medium">{data.total}</span>
                {' '}
                个
              </span>

              {/* 被选中的元素 */}
              {Object.values(SelectedOption).filter((item) => item !== undefined).length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {Object.entries(SelectedOption)
                    .filter(([, value]) => value !== undefined)
                    .flatMap(([key, value]) => {
                      const values = String(value).split(',').filter(Boolean)
                      return values.map((v) => ({ key, value: v }))
                    })
                    .map(({ key, value }) => (
                      <Tag
                        key={`${key}-${value}`}
                        closable
                        onClose={() => {
                          setSelectedOption((prev) => {
                            const curr = prev[key]?.split(',').filter(Boolean) ?? []
                            // 多选：只移除当前值；单选：移除后自然为空
                            const nextArr = curr.length ? curr.filter((x) => x !== value) : []
                            return {
                              ...prev,
                              [key]: nextArr.length ? nextArr.join(',') : undefined,
                            }
                          })
                        }}
                      >
                        {getSelectedText(key, value)}
                      </Tag>
                    ))}
                </div>
              )}

              {/* 清空按钮 */}
              {Object.values(SelectedOption).filter((item) => item !== undefined).length > 0 && (
                <span
                  className="text-sm text-blue-500 cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => {
                    const cleared = { ...SelectedOption }
                    Object.keys(cleared).forEach((key) => {
                      cleared[key] = undefined
                    })
                    setSelectedOption(cleared)
                  }}
                >
                  {$t('清空')}
                </span>
              )}
            </div>

            <div>
              <Input.Search
                value={searchValue}
                placeholder={filterType === 'model' ? $t('请输入模型名称') : $t('请输入API名称')}
                onSearch={(value) => {
                  onSearch(value)
                  setCurrent(1)
                }}
                onChange={(e) => {
                  setSearchValue(e.target.value)
                  onSearch(e.target.value)
                  setCurrent(1)
                }}
                className="w-full"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-4 flex-1 min-h-0">
          {/* 左侧筛选栏 */}
          <div className="w-[200px] shrink-0 h-full min-h-0 overflow-y-auto hover-auto-scrollbar">
            {filterOptions.map((item) =>
              item.children ? (
                <div key={item.title}>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    {item.title}
                  </label>
                  {item.children.map((child) => (
                    <FilterItem
                      key={child.title}
                      title={child.title}
                      options={child.options}
                      selected={SelectedOption[child.key]}
                      mutiple={child.isMultiple}
                      isMainTitle={false}
                      onSelect={(v) => onSelecte(child, v)}
                    />
                  ))}
                </div>
              ) : (
                <FilterItem
                  key={item.title}
                  title={item.title}
                  options={item.options}
                  selected={SelectedOption[item.key]}
                  mutiple={item.isMultiple}
                  onSelect={(v) => onSelecte(item, v)}
                />
              ),
            )}
          </div>

          {/* 右侧主体块 */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col h-full">
            <div className="flex flex-col h-full min-h-0">
              {/* content-start 解决flexbox设置固定高度且数据不满的情况下，align-content: stretch; 行之间产生间隔，或者配置min-h和max-h，但是效果没有center-start好 */}
              <div className="flex-1 min-h-0 overflow-y-auto pb-4 w-full pr-2 hover-auto-scrollbar">
                <Spin spinning={listLoading}>
                  {data.items.length ? (
                    <div className="flex flex-wrap gap-4 content-start">
                      {data.items.map((item: any) => (
                        <SqureItemCard key={item.id} item={item} showActions filterType={filterType} />
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
