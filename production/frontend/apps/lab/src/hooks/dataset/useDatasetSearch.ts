import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { datasetApi } from '../../services/api'
import type { SearchParams } from '../../types/dataset'

export const useDatasetSearch = (projectId: number) => {
  const [searchParams, setSearchParams] = useState<SearchParams>({
    project_id: projectId,
    skip: 0,
    limit: 10,
    sort_by: 'created_at',
    sort_order: 'desc',
  })

  const {
    data: response = { items: [], total: 0 },
    isLoading,
    error,
  } = useQuery({
    queryKey: ['datasets', 'search', searchParams, projectId],
    queryFn: async () => {
      console.log('Fetching datasets with params:', searchParams)
      const result = await datasetApi.list(projectId, 0, searchParams)
      console.log('Dataset search result:', result)
      return result
    },
    enabled: !!projectId,
    staleTime: 1000 * 60, // 1分钟内不重新获取
    refetchOnMount: true,
  })

  // 处理分页变化
  const handlePageChange = (page: number, pageSize: number) => {
    const newParams = {
      ...searchParams,
      skip: (page - 1) * pageSize,
      limit: pageSize,
    }
    setSearchParams(newParams)
  }

  // 处理搜索
  const handleSearch = (values: any) => {
    const { question, tag_ids, tag_match_type, sort_by, sort_order } = values

    // 确保tag_ids是数组，即使是空数组
    const normalizedTagIds = Array.isArray(tag_ids)
      ? tag_ids
      : tag_ids
        ? [tag_ids]
        : []

    const newParams = {
      ...searchParams,
      project_id: projectId,
      question,
      tag_ids: normalizedTagIds,
      tag_match_type,
      sort_by: sort_by || 'created_at',
      sort_order: sort_order || 'desc',
      skip: 0, // 重置分页
      limit: searchParams.limit, // 保持每页条数不变
    }

    setSearchParams(newParams)
  }

  // 处理重置
  const handleReset = () => {
    setSearchParams({
      project_id: projectId,
      skip: 0,
      limit: 10,
      sort_by: 'created_at',
      sort_order: 'desc',
    })
  }

  return {
    searchParams,
    setSearchParams,
    handlePageChange,
    handleSearch,
    handleReset,
    datasets: response.items,
    total: response.total,
    isLoading,
    error,
  }
}
