import apiClient from './apiClient'

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
    const response = await apiClient.get('/models/enums/model-status')
    return response.data
  },
}

export default configApi
