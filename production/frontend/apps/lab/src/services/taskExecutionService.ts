/**
 * 任务执行服务
 */
import apiClient from './apiClient'

// 业务类型枚举项
export interface BusinessTypeOption {
  label: string
  value: string
}

/**
 * 启动任务请求参数
 */
export interface ManualStartTaskRequest {
  business_type: string
  business_id: string
}

/**
 * 任务执行服务
 */
export const taskExecutionService = {
  /**
   * 获取任务执行业务类型枚举
   * @returns Promise<BusinessTypeOption[]> 业务类型选项列表
   */
  getBusinessTypes: async (): Promise<BusinessTypeOption[]> => {
    const response = await apiClient.get<BusinessTypeOption[]>(
      '/task-executions/enums/task-execution-business',
    )
    return response.data
  },

  /**
   * 手动启动任务
   * @param data 启动任务请求数据
   * @returns Promise<void>
   */
  manualStart: async (data: ManualStartTaskRequest): Promise<void> => {
    await apiClient.post('/task-executions/manual-start', data)
  },
}
