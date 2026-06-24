import apiClient from './apiClient'

const pickArray = <T>(value: unknown): T[] | null => {
  if (Array.isArray(value)) {
    return value as T[]
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const candidates = [
    (value as any).data,
    (value as any).items,
    (value as any).rows,
    (value as any).result,
    (value as any).options,
    (value as any).data?.items,
    (value as any).data?.rows,
    (value as any).data?.result,
    (value as any).data?.options,
  ]

  const arrayValue = candidates.find(Array.isArray)
  return arrayValue ? (arrayValue as T[]) : null
}

const localModelStatusOptions = [
  { label: '未开始', value: '未开始' },
  { label: '下载中', value: '下载中' },
  { label: '已完成', value: '已完成' },
  { label: '失败', value: '失败' },
]

/**
 * 公共配置服务
 */
export const configApi = {
  /**
   * 获取公共配置
   * @returns 配置信息
   */
  getConfig: async () => {
    const response = await apiClient.get('/config')
    return response.data
  },

  /**
   * 获取模型字典状态
   * @returns 模型状态枚举
   */
  getModelStatus: async () => {
    try {
      const response = await apiClient.get('/models/enums/model-status')
      const options = pickArray(response.data)
      if (options) {
        return options
      }

      if (import.meta.env.DEV) {
        console.warn('本地预览：模型状态枚举不是数组，使用预览枚举兜底。', response.data)
        return localModelStatusOptions
      }

      return []
    }
    catch (error) {
      if (import.meta.env.DEV) {
        console.warn('本地预览：模型状态枚举获取失败，使用预览枚举兜底。', error)
        return localModelStatusOptions
      }

      throw error
    }
  },
}

export default configApi
