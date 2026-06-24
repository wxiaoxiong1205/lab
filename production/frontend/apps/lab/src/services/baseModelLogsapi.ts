import apiClient from './apiClient'

// 基础模型日志服务
export const baseModelLogsApi = {

  /**
   * 获取基础模型日志（支持ISO时间格式）
   * @param modelId 基础模型ID
   * @param endTime 结束时间（ISO格式），用于指定Loki查询的结束时间点
   * @param days 如果没有归档日志，从结束时间往前查询N天的日志，默认值30
   * @returns Promise<any> 基础模型日志
   */
  getBaseModelLogs: async (modelId: number, endTime: string, days?: number): Promise<any> => {
    const response = await apiClient.get(`/models/base/model/download/${modelId}/logs`, {
      params: {
        end_time: endTime,
        days: days ?? 30, // 使用默认值30
      },
    })
    return response.data
  },
  /**
   * 获取指定时间范围内的基础模型日志
   * @param modelId 基础模型ID
   * @param startTime 开始时间戳
   * @param endTime 结束时间戳
   * @returns Promise<any> 基础模型日志
   */
  getBaseModelLogsByTime: async (modelId: number, startTime: string, endTime: string, signal?: AbortSignal): Promise<any> => {
    const response = await apiClient.get(`/models/base/model/download/${modelId}/logs/range`, {
      params: {
        start_time: startTime,
        end_time: endTime,
      },
      signal,
    })
    return response.data
  },
}
