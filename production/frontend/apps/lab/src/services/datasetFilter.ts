import apiClient from './apiClient'
import type { TrainingDatasetListResponse } from '@/types/training'
import type { InferenceResultSetListResponse } from '@/types/inference'

/** stats 接口返回：各筛选项及数量（嵌套结构） */
export interface FilterOptions {
  usage?: FilterItem[]
  dataset_format?: FilterItem[]
  dataset_type?: FilterItem[]
  attr_option?: AttrOptions[]
}
export interface FilterItem {
  value: string // 选项值名称
  count?: number // 数量
}
export interface AttrOptions {
  name: string // 属性名称
  options: FilterItem[] // 该属性下的所有选项
}

/** stats 接口可选查询参数 */
export interface DatasetStatsQuery {
  processing_status?: string
  /** 如 ['training'] 仅统计训练用途下的筛选项 */
  usage?: string[]
  training_method_type?: string[]
  /** 如 ['image-generation'] 仅统计 image-generation 类型的筛选项 */
  dataset_type?: string[]
  /** 如 ['role-based'] 仅统计 role-based 格式的筛选项 */
  dataset_format?: string[]
  /** 发布状态：0未发布, 1已发布 */
  publish?: number
}

export interface Options {
  name?: string // 数据集名称 模糊搜索
  usage?: string // 数据集用途 类似test（测试数据集） validation（验证数据集）等等 空字符串表示不筛选
  training_method_type?: string
  dataset_format?: string // 数据格式
  dataset_type?: string // 数据集类型 image-generation图像生成 text-generation文本生成 空字符串表示不筛选
  attr_name?: string // 属性名称 按属性 name 筛选（需与 option_value 同时传入）
  option_value?: string // 属性值 按该属性下 option 值筛选（需与 attr_name 同时传入）
  page?: number
  size?: number
  processing_status?: string
  publish?: number // 发布状态：0未发布 1已发布
}

/** stats 请求 query：与后端约定 usage / dataset_type / dataset_format 可重复出现 */
const STATS_MULTI_KEYS = ['usage', 'training_method_type', 'dataset_type', 'dataset_format'] as const

function buildStatsQueryParams(query?: DatasetStatsQuery): Record<string, unknown> {
  const params: Record<string, unknown> = {
    processing_status: query?.processing_status ?? 'completed',
  }
  if (query?.usage?.length) {
    params.usage = query.usage
  }
  if (query?.training_method_type?.length) {
    params.training_method_type = query.training_method_type
  }
  if (query?.dataset_type?.length) {
    params.dataset_type = query.dataset_type
  }
  if (query?.dataset_format?.length) {
    params.dataset_format = query.dataset_format
  }
  if (query?.publish !== undefined) {
    params.publish = query.publish
  }
  return params
}

export const DatasetFilter = {
  // 获取所有的筛选条件
  stats: async (projectId: number, query?: DatasetStatsQuery) => {
    const params = buildStatsQueryParams(query)
    const response = await apiClient.get<FilterOptions>(`/training-datasets/project/${projectId}/stats`, {
      params,
      paramsSerializer: serializeStatsQueryParams,
    })
    return response.data
  },

  /**
   * 传入筛选条件获取数据集列表（扁平 query，与 Options 一致）
   * 空字符串表示不筛选的字段：usage、dataset_type（由调用方按需传入）
   */
  list: async (projectId: number, params: Options) => {
    const response = await apiClient.get<TrainingDatasetListResponse>(`/training-datasets/project/${projectId}/filtered`, {
      params: buildFilteredListParams(params),
    })
    return response.data
  },

  // 获取业务数据集所有的筛选条件
  statsInferenceResult: async (projectId: number, query?: DatasetStatsQuery) => {
    const params = buildStatsQueryParams(query)
    const response = await apiClient.get<FilterOptions>(`/inference-result-datasets/project/${projectId}/stats`, {
      params,
      paramsSerializer: serializeStatsQueryParams,
    })
    return response.data
  },

  listInferenceResult: async (projectId: number, params: Options) => {
    const response = await apiClient.get<InferenceResultSetListResponse>(`/inference-result-datasets/project/${projectId}/filtered`, {
      params: buildFilteredListParams(params),
    })
    return response.data
  },
}

function serializeStatsQueryParams(p: Record<string, unknown>): string {
  const result = new URLSearchParams()
  result.set('processing_status', String(p.processing_status ?? 'completed'))
  for (const key of STATS_MULTI_KEYS) {
    const arr = p[key]
    if (Array.isArray(arr)) {
      for (const item of arr) {
        result.append(key, String(item))
      }
    }
  }
  if (p.publish !== undefined) {
    result.set('publish', String(p.publish))
  }
  return result.toString()
}

/** filtered 列表接口共用的扁平 query（训练数据集与推理结果集列表参数一致） */
function buildFilteredListParams(params: Options): Record<string, string | number> {
  const flat: Record<string, string | number> = {
    page: params.page ?? 1,
    size: params.size ?? 10,
    processing_status: params.processing_status ?? 'completed',
    /** 空字符串：不按用途筛选，查全部数据集 */
    usage: params.usage ?? '',
  }
  if (params.name) {
    flat.name = params.name
  }
  if (params.dataset_type !== undefined) {
    flat.dataset_type = params.dataset_type
  }
  if (params.training_method_type !== undefined) {
    flat.training_method_type = params.training_method_type
  }
  if (params.dataset_format !== undefined) {
    flat.dataset_format = params.dataset_format
  }
  if (params.attr_name !== undefined && params.option_value !== undefined) {
    flat.attr_name = params.attr_name
    flat.option_value = params.option_value
  }
  if (params.publish !== undefined) {
    flat.publish = params.publish
  }
  return flat
}
