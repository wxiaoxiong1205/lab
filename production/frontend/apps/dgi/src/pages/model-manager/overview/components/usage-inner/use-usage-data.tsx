import dayjs from 'dayjs'
import _ from 'lodash'
import { useCallback, useMemo, useState } from 'react'
import { DASHBOARD_USAGE_API, queryDashboardUsageData } from '../../apis'
import { baseColorMap } from '../../config'

interface RequestTokenData {
  requestData: {
    name: string
    color: string
    areaStyle: any
    data: { time: string, value: number }[]
  }[]
  tokenData: {
    data: { time: string, value: number }[]
  }[]
  xAxisData: string[]
}

const DefaultDateConfig = {
  maxRange: 60,
  defaultRange: 29,
}

const getLast30Days = () => {
  const dates: string[] = []

  for (let i = 29; i >= 0; i--) {
    const date = dayjs().subtract(i, 'day').format('YYYY-MM-DD')
    dates.push(date)
  }

  return dates
}

const getAllDays = (start: string, end: string) => {
  const startDate = dayjs(start)
  const endDate = dayjs(end)
  const days: string[] = []
  for (
    let d = startDate;
    d.isBefore(endDate) || d.isSame(endDate, 'day');
    d = d.add(1, 'day')
  ) {
    days.push(d.format('YYYY-MM-DD'))
  }
  return days
}

const generateValueMap = (list: { timestamp: number, value: number }[]) => {
  return new Map(
    list.map((item) => [
      dayjs(item.timestamp * 1000).format('YYYY-MM-DD'),
      item.value,
    ]),
  )
}

const generateData = (dateRange: string[], valueMap: Map<string, number>) => {
  return dateRange.map((date, index) => {
    const value = valueMap.get(date) || 0
    return {
      time: date,
      value,
    }
  })
}

interface UseUsageDataOptions<T> {
  url: string
  disabledDate?: boolean
  defaultData?: T
}

interface UseUsageDataReturn<T> {
  usageData?: {
    requestTokenData: RequestTokenData
  }
  query: any
  setQuery: (query: any) => void
  userList: any[]
  modelList: any[]
  result: {
    start_date?: string
    end_date?: string
    data: T
  }
  setResult: (result: any) => void
  loading: boolean
  open: boolean
  handleOnCancel: () => void
  init: () => Promise<void>
  handleExport: () => void
  handleDateChange: (dates: any, dateStrings: [string, string]) => void
  handleUsersChange: (value: any) => void
  handleModelsChange: (value: any) => void
}

const useUsageData = <T,>({
  url,
  disabledDate = false,
  defaultData,
}: UseUsageDataOptions<T>): UseUsageDataReturn<T> => {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<{
    start_date?: string
    end_date?: string
    data: T
  }>({
    start_date: dayjs()
      .subtract(DefaultDateConfig.defaultRange, 'days')
      .format('YYYY-MM-DD'),
    end_date: dayjs().format('YYYY-MM-DD'),
    data: defaultData as T,
  })

  const [query, setQuery] = useState<{
    start_date: string
    end_date: string
    model_ids: number[]
    user_ids: number[]
    dateRange: [dayjs.Dayjs, dayjs.Dayjs]
  }>({
    start_date: dayjs()
      .subtract(DefaultDateConfig.defaultRange, 'days')
      .format('YYYY-MM-DD'),
    end_date: dayjs().format('YYYY-MM-DD'),
    model_ids: [],
    user_ids: [],
    dateRange: [
      dayjs().subtract(DefaultDateConfig.defaultRange, 'days'),
      dayjs(),
    ],
  })

  const [modelList, setModelList] = useState<any[]>([])
  const [userList, setUserList] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const usageData = useMemo<{
    requestTokenData: RequestTokenData
  }>(() => {
    if (url === DASHBOARD_USAGE_API) {
      return {
        requestTokenData: {
          requestData: [],
          tokenData: [],
          xAxisData: [],
        },
      }
    }
    const { start_date, end_date, data } = result as {
      start_date?: string
      end_date?: string
      data: {
        api_request_history: { timestamp: number, value: number }[]
        completion_token_history: { timestamp: number, value: number }[]
        prompt_token_history: { timestamp: number, value: number }[]
      }
    }

    const dateRange
      = start_date && end_date
        ? getAllDays(start_date, end_date)
        : getLast30Days()

    const completionTokenHistory = data?.completion_token_history || []
    const promptTokenHistory = data?.prompt_token_history || []
    const apiRequestHistory = data?.api_request_history || []

    if (!completionTokenHistory.length && !promptTokenHistory.length && !apiRequestHistory.length) {
      return {
        requestTokenData: {
          requestData: [],
          tokenData: [],
          xAxisData: [],
        },
      }
    }

    // ========== API request ==============
    const requestList: {
      name: string
      color: string
      areaStyle: any
      data: { time: string, value: number }[]
    } = {
      name: 'API requests',
      areaStyle: {
        color: 'rgba(13,171,219,0.15)',
      },
      color: baseColorMap.baseR1,
      data: generateData(dateRange, generateValueMap(apiRequestHistory)),
    }

    // =========== token usage data ==============
    const completionDataList = generateData(
      dateRange,
      generateValueMap(completionTokenHistory),
    )
    const promptDataList = generateData(
      dateRange,
      generateValueMap(promptTokenHistory),
    )

    const completionData: any = {
      name: 'Completion tokens',
      color: baseColorMap.base,
      data: completionDataList.map((item, index) => {
        return {
          ...item,
          itemStyle: {
            borderRadius: !promptDataList[index].value
              ? [2, 2, 0, 0]
              : [0, 0, 0, 0],
          },
        }
      }),
    }
    const promptData: any = {
      name: 'Prompt tokens',
      color: baseColorMap.baseR3,
      data: promptDataList.map((item, index) => {
        return {
          ...item,
          itemStyle: {
            borderRadius: [2, 2, 0, 0],
          },
        }
      }),
    }

    return {
      requestTokenData: {
        requestData: [requestList],
        tokenData: [completionData, promptData],
        xAxisData: dateRange,
      },
    }
  }, [result, url])

  const fetchUsageData = async (queryParams: any) => {
    try {
      setLoading(true)
      const response = await queryDashboardUsageData<T>(queryParams, {
        url,
      })
      setResult({
        start_date: queryParams.start_date,
        end_date: queryParams.end_date,
        data: response as T,
      })
    }
    catch (error) {
      console.error('Failed to fetch usage data:', error)
      setResult({
        start_date: queryParams.start_date,
        end_date: queryParams.end_date,
        data: defaultData as T,
      })
    }
    finally {
      setLoading(false)
    }
  }

  const handleDateChange = useCallback((dates: any, dateStrings: [string, string]) => {
    const newQuery = {
      ...query,
      start_date: dateStrings[0],
      end_date: dateStrings[1],
      dateRange: dates,
    }
    setQuery(newQuery)
    fetchUsageData(newQuery)
  }, [query])

  const handleUsersChange = useCallback((value: any) => {
    const newQuery = {
      ...query,
      user_ids: value,
    }
    setQuery(newQuery)
    fetchUsageData(newQuery)
  }, [query])

  const handleModelsChange = useCallback((value: any) => {
    const newQuery = {
      ...query,
      model_ids: value,
    }
    setQuery(newQuery)
    fetchUsageData(newQuery)
  }, [query])

  const handleExport = useCallback(() => {
    setOpen(true)
  }, [])

  const handleOnCancel = useCallback(() => {
    setOpen(false)
  }, [])

  const init = useCallback(async () => {
    // 获取初始数据
    await fetchUsageData(query)

    // 模拟获取用户和模型列表，这里可以根据实际情况调用真实API
    try {
      // 这里可以添加真实的用户和模型API调用
      setUserList([
        { id: 1, name: 'User 1', username: 'user1' },
        { id: 2, name: 'User 2', username: 'user2' },
      ])
      setModelList([
        { id: 1, name: 'GPT-3.5' },
        { id: 2, name: 'GPT-4' },
      ])
    }
    catch (error) {
      console.error('Failed to fetch user/model list:', error)
      setUserList([])
      setModelList([])
    }
  }, [query])

  return {
    usageData,
    query,
    setQuery,
    userList,
    modelList,
    result,
    setResult,
    loading,
    open,
    handleOnCancel,
    init,
    handleExport,
    handleDateChange,
    handleUsersChange,
    handleModelsChange,
  }
}

export default useUsageData
