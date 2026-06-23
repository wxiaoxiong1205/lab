import { Button, Spin } from 'antd'
import React from 'react'
import { formatDatasetFormatDisplay, formatDatasetTypeLabel } from './DatasetCascaderSelectorShared'
import type { AttrOptions, FilterItem } from '@/services/datasetFilter'

const statBtn = (active: boolean) =>
  [
    'flex h-[36px] w-[208px] items-center justify-between rounded px-2 text-left',
    'text-[14px] font-normal leading-5 text-foreground-primary',
    'hover:bg-tag-gray',
    active ? 'bg-tag-gray' : '',
  ].join(' ')

const sectionTitleClass = 'mb-2 text-[14px] font-normal leading-5 text-foreground-muted'

const splitOptionLabel = (label: string) => {
  const matched = label.match(/^(.*?)(?:\s*\((\d+)\))?$/)
  return {
    text: matched?.[1]?.trim() || label,
    count: matched?.[2] || '',
  }
}

export interface DatasetCascaderFiltersSidebarProps {
  statsLoading: boolean
  clearSidebarFilters: () => void
  fixedListUsage?: string
  usageFilter: string
  setUsageFilter: (v: string) => void
  usageRadioOptions: { value: string, label: string }[]
  hideStatsDatasetTypeAndFormatFilters: boolean
  parentLocksDatasetTypeFilter: boolean
  parentLocksDatasetFormatFilter: boolean
  datasetTypeOptions: FilterItem[]
  datasetFormatOptions: FilterItem[]
  datasetTypePick: string | undefined
  setDatasetTypePick: React.Dispatch<React.SetStateAction<string | undefined>>
  datasetFormatPick: string | undefined
  setDatasetFormatPick: React.Dispatch<React.SetStateAction<string | undefined>>
  attrGroups: AttrOptions[]
  attrNamePick: string | undefined
  attrValuePick: string | undefined
  setAttrNamePick: React.Dispatch<React.SetStateAction<string | undefined>>
  setAttrValuePick: React.Dispatch<React.SetStateAction<string | undefined>>
  bumpPage: () => void
}

export const DatasetCascaderFiltersSidebar: React.FC<DatasetCascaderFiltersSidebarProps> = ({
  statsLoading,
  clearSidebarFilters,
  fixedListUsage,
  usageFilter,
  setUsageFilter,
  usageRadioOptions,
  hideStatsDatasetTypeAndFormatFilters,
  parentLocksDatasetTypeFilter,
  parentLocksDatasetFormatFilter,
  datasetTypeOptions,
  datasetFormatOptions,
  datasetTypePick,
  setDatasetTypePick,
  datasetFormatPick,
  setDatasetFormatPick,
  attrGroups,
  attrNamePick,
  attrValuePick,
  setAttrNamePick,
  setAttrValuePick,
  bumpPage,
}) => (
  <div className="flex h-full min-h-0 w-[220px] shrink-0 flex-col border-r border-gray-200 pr-3">
    <div className="mb-3 flex shrink-0 items-center justify-between">
      <span className="font-medium">筛选条件</span>
      <Button type="link" size="small" className="p-0 !text-foreground-primary !font-medium !text-[14px] !leading-5" onClick={clearSidebarFilters}>
        清除
      </Button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Spin spinning={statsLoading}>
        <div className="space-y-[30px]">
          {!fixedListUsage && (
            <div>
              <div className={sectionTitleClass}>数据类型</div>
              <div className="flex flex-col gap-1">
                {usageRadioOptions.map((u) => {
                  const { text, count } = splitOptionLabel(String(u.label))
                  return (
                    <button
                      key={u.value || 'all'}
                      type="button"
                      className={statBtn(usageFilter === u.value)}
                      onClick={() => {
                        setUsageFilter(u.value)
                        bumpPage()
                      }}
                    >
                      <span>{text}</span>
                      <span>{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {!hideStatsDatasetTypeAndFormatFilters && !parentLocksDatasetTypeFilter && (
            <div>
              <div className={sectionTitleClass}>数据用途</div>
              <div className="flex flex-col gap-1">
                {datasetTypeOptions.map((it) => (
                  <button
                    key={it.value}
                    type="button"
                    className={statBtn(datasetTypePick === it.value)}
                    onClick={() => {
                      setDatasetTypePick((p) => (p === it.value ? undefined : it.value))
                      bumpPage()
                    }}
                  >
                    <span>{formatDatasetTypeLabel(it.value)}</span>
                    <span>{it.count ?? 0}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!hideStatsDatasetTypeAndFormatFilters && !parentLocksDatasetFormatFilter && (
            <div>
              <div className={sectionTitleClass}>数据格式</div>
              <div className="flex flex-col gap-1">
                {datasetFormatOptions.map((it) => (
                  <button
                    key={it.value}
                    type="button"
                    className={statBtn(datasetFormatPick === it.value)}
                    onClick={() => {
                      setDatasetFormatPick(it.value)
                      bumpPage()
                    }}
                  >
                    <span>{formatDatasetFormatDisplay(it.value)}</span>
                    <span>{it.count ?? 0}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {attrGroups.length > 0 && (
            <div>
              <div className={sectionTitleClass}>数据分类</div>
              <div className="flex flex-col gap-2">
                {attrGroups.map((ag) => (
                  <div key={ag.name}>
                    <div className="mb-1 text-[14px] font-normal leading-5 text-foreground-muted">{ag.name}</div>
                    <div className="flex flex-col gap-1 pl-1">
                      {ag.options?.map((op) => (
                        <button
                          key={`${ag.name}-${op.value}`}
                          type="button"
                          className={statBtn(attrNamePick === ag.name && attrValuePick === op.value)}
                          onClick={() => {
                            if (attrNamePick === ag.name && attrValuePick === op.value) {
                              setAttrNamePick(undefined)
                              setAttrValuePick(undefined)
                            }
                            else {
                              setAttrNamePick(ag.name)
                              setAttrValuePick(op.value)
                            }
                            bumpPage()
                          }}
                        >
                          <span>{op.value}</span>
                          <span>{op.count ?? 0}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Spin>
    </div>
  </div>
)
