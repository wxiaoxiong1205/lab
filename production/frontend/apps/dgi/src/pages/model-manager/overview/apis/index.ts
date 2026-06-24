import qs from 'query-string'
import request from '@/utils/request'
import { GPU_STACK_API } from '@/components/gpustacks/api'

export const DASHBOARD_API = `${GPU_STACK_API}/dashboard`

export const DASHBOARD_USAGE_API = `${DASHBOARD_API}/usage`
export const DASHBOARD_STATS_API = `${DASHBOARD_API}/usage/stats`

export async function queryDashboardData() {
  return request({ url: DASHBOARD_API, method: 'GET' })
}

export async function queryDashboardUsageData<T>(
  params: {
    start_date: string
    end_date: string
    model_ids?: number[]
    user_ids?: number[]
    raw?: boolean
  },
  options: {
    url: string
    token?: any
  },
) {
  return request<T>({
    url: `${options.url}?${qs.stringify(params)}`,
    method: 'GET',
  })
}
