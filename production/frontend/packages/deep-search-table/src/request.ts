import type { CrudNormalizedResponse, CrudResponseMapper } from './types'

function getValueByPath(source: any, path?: string) {
  if (!path) {
    return undefined
  }

  return path.split('.').reduce((accumulator, key) => {
    if (accumulator == null) {
      return undefined
    }

    return accumulator[key]
  }, source)
}

function pickFirstArray(source: any) {
  const candidates = [
    source?.data?.items,
    source?.data?.list,
    source?.data?.records,
    source?.items,
    source?.list,
    source?.records,
    source,
  ]

  return candidates.find(item => Array.isArray(item)) ?? []
}

function pickFirstNumber(source: any, keys: string[]) {
  for (const key of keys) {
    const value = getValueByPath(source, key)
    if (typeof value === 'number') {
      return value
    }
  }

  return undefined
}

export function normalizeCrudResponse<TData = Record<string, any>, TResponse = unknown>(
  response: TResponse,
  mapper?: CrudResponseMapper<TData, TResponse>,
): CrudNormalizedResponse<TData> {
  if (typeof mapper === 'function') {
    return mapper(response)
  }

  if (mapper) {
    return {
      list: (getValueByPath(response, mapper.list) ?? []) as TData[],
      total: Number(getValueByPath(response, mapper.total) ?? 0),
      page: Number(getValueByPath(response, mapper.page) ?? 1),
      pageSize: Number(getValueByPath(response, mapper.pageSize) ?? 10),
      raw: response,
    }
  }

  const list = pickFirstArray(response) as TData[]
  const total = pickFirstNumber(response, ['data.total', 'data.count', 'total', 'count']) ?? list.length
  const page = pickFirstNumber(response, ['data.page', 'page'])
  const pageSize = pickFirstNumber(response, ['data.size', 'data.pageSize', 'size', 'pageSize'])

  return {
    list,
    total,
    page,
    pageSize,
    raw: response,
  }
}

export function createAxiosLikeRequestAdapter(client: {
  request?: (config: { url: string, method?: string, params?: any, data?: any, headers?: any }) => Promise<any>
}) {
  return async (config: { url: string, method?: string, params?: any, data?: any, headers?: any }) => {
    if (typeof client.request !== 'function') {
      throw new Error('requestAdapter requires a client with a request method')
    }

    return client.request(config)
  }
}
