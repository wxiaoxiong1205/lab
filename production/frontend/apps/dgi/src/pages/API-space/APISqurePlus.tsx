import { useCallback, useState } from 'react'
import { useRequest } from 'ahooks'
import SqureIndex from '@/components/squre/SqureIndex'
import { useTransform } from '@/locales'
import { useSqureFilterOptions } from '@/components/squre/filterOptions'
import { apiService } from '@/services/apiService'

export default function SqureTest() {
  const { $t } = useTransform()

  // 选中的选项
  const [current, setCurrent] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selected, setSelected] = useState<{ [key: string]: string | undefined }>({})
  const [apiName, setApiName] = useState('')

  const { squreFilterOptions, typeLoading } = useSqureFilterOptions('api')

  // 获取模型列表
  const {
    data = { items: [], total: 0 },
    loading: listLoading,
  } = useRequest(
    () => {
      return apiService.getApiList({
        page_number: current,
        page_size: pageSize,
        api_name: apiName,
        ...selected,
      }).then((res) => res || { items: [], total: 0 })
    },
    {
      refreshDeps: [
        current,
        pageSize,
        selected,
        apiName,
      ],
    },
  )

  const onSelectedChange = useCallback((selectedOption: { [key: string]: string | undefined }) => {
    setSelected(selectedOption)
    setCurrent(1)
    setPageSize(12)
  }, [])

  const handleSearchModelName = useCallback((searchValue: string) => {
    setApiName(searchValue)
    setCurrent(1)
    setPageSize(12)
  }, [])

  return (
    <SqureIndex
      title={$t('API广场')}
      description={$t('企业统一API门户，让API安全可靠的被使用，驱动AI赋能')}

      filterType="api"
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
