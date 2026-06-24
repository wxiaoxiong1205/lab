import { useCallback, useState } from 'react'
import { useRequest } from 'ahooks'
import SqureIndex from '@/components/squre/SqureIndex'
import { useTransform } from '@/locales'
import { apiModelList } from '@/services/api'
import { useSqureFilterOptions } from '@/components/squre/filterOptions'

export default function SqureTest() {
  const { $t } = useTransform()

  // 选中的选项
  const [current, setCurrent] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selected, setSelected] = useState<{ [key: string]: string | undefined }>({})
  const [modelName, setModelName] = useState('')

  const { squreFilterOptions, typeLoading } = useSqureFilterOptions()

  // 获取模型列表
  const {
    data = { items: [], total: 0 },
    loading: listLoading,
  } = useRequest(
    () => {
      return apiModelList({
        page_number: current,
        page_size: pageSize,
        model_name: modelName,
        ...selected,
      }).then((res) => res?.data || { items: [], total: 0 })
    },
    {
      refreshDeps: [
        current,
        pageSize,
        selected,
        modelName,
      ],
    },
  )

  const onSelectedChange = useCallback((selectedOption: { [key: string]: string | undefined }) => {
    setSelected(selectedOption)
    setCurrent(1)
    setPageSize(12)
  }, [])

  const handleSearchModelName = useCallback((searchValue: string) => {
    setModelName(searchValue)
    setCurrent(1)
    setPageSize(12)
  }, [])

  return (
    <SqureIndex
      title={$t('模型广场')}
      description={$t('企业统一模型门户，让模型安全可靠的被使用，驱动AI赋能')}

      filterType="model"
      filterOptions={squreFilterOptions}

      current={current}
      setCurrent={setCurrent}
      pageSize={pageSize}
      setPageSize={setPageSize}
      listLoading={listLoading || typeLoading}

      data={data}
      onChange={onSelectedChange}
      onSearch={handleSearchModelName}
    />
  )
}
