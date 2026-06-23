import { useAuthStore } from '../stores/authStore'
import apiClient from '.Client'

/**
 * 日志管理服务
 * 提供与后端日志管理API的交互功能
 */

/**
 * 测试日志管理API是否正常工作
 * @returns {Promise<object>} 测试结果
 */
export const testLogManagementAPI = async () => {
  try {
    console.log('Testing log management API...')
    const response = await apiClient.get('/log-management/test')
    console.log('Test response:', response.data)
    return response.data
  }
  catch (error) {
    console.error('测试日志管理API失败:', error)
    if (error.response) {
      console.error(
        'Error response:',
        error.response.status,
        error.response.data,
      )

      // 处理认证错误
      if (error.response.status === 401) {
        console.error('Authentication error. Please log in again.')
        // 可以在这里添加重定向到登录页面的逻辑
      }
    }
    else if (error.request) {
      console.error('No response received:', error.request)
    }
    else {
      console.error('Error message:', error.message)
    }
    throw error
  }
}

/**
 * 获取日志统计信息
 * @param {object} params - 查询参数
 * @param {number} [params.task_id] - 任务ID（可选）
 * @param {string} [params.batch_id] - 批次ID（可选）
 * @param {string} [params.start_date] - 开始日期（可选）
 * @param {string} [params.end_date] - 结束日期（可选）
 * @returns {Promise<object>} 统计信息
 */
export const getLogStatistics = async (params = {}) => {
  try {
    console.log('Calling getLogStatistics API with params:', params)

    // 获取认证token
    const token = localStorage.getItem('auth_token')
    console.log(
      'Using auth token:',
      token ? `${token.substring(0, 10)}...` : 'No token',
    )

    const response = await apiClient.get('/log-management/statistics', {
      params,
    })
    console.log('getLogStatistics API response:', response)
    return response.data
  }
  catch (error) {
    console.error('获取日志统计信息失败:', error)
    if (error.response) {
      console.error(
        'Error response:',
        error.response.status,
        error.response.data,
      )

      // 处理认证错误
      if (error.response.status === 401) {
        console.error('Authentication error. Please log in again.')
        // 可以在这里添加重定向到登录页面的逻辑
      }
    }
    else if (error.request) {
      console.error('No response received:', error.request)
    }
    else {
      console.error('Error message:', error.message)
    }
    throw error
  }
}

/**
 * 获取任务日志摘要
 * @param {number} taskId - 任务ID
 * @returns {Promise<object>} 日志摘要
 */
export const getTaskLogSummary = async (taskId) => {
  try {
    const response = await apiClient.get(
      `/log-management/task/${taskId}/summary`,
    )
    return response.data
  }
  catch (error) {
    console.error('获取任务日志摘要失败:', error)
    throw error
  }
}

/**
 * 触发日志清理
 * @param {object} params - 清理参数
 * @param {number} [params.older_than_days] - 清理多少天前的日志
 * @param {number} [params.batch_size] - 每批处理的记录数
 * @returns {Promise<object>} 清理结果
 */
export const triggerLogCleanup = async (params = {}) => {
  try {
    const response = await apiClient.post('/log-management/cleanup', params)
    return response.data
  }
  catch (error) {
    console.error('触发日志清理失败:', error)
    throw error
  }
}

/**
 * 触发日志存储优化
 * @param {object} params - 优化参数
 * @param {number} [params.older_than_days] - 为多少天前的日志设置过期时间
 * @param {number} [params.batch_size] - 每批处理的记录数
 * @returns {Promise<object>} 优化结果
 */
export const triggerLogOptimization = async (params = {}) => {
  try {
    const response = await apiClient.post('/log-management/optimize', params)
    return response.data
  }
  catch (error) {
    console.error('触发日志存储优化失败:', error)
    throw error
  }
}

/**
 * 手动触发计划任务
 * @param {string} taskName - 任务名称
 * @returns {Promise<object>} 任务执行结果
 */
export const triggerScheduledTask = async (taskName) => {
  try {
    const response = await apiClient.post(
      `/log-management/run-task/${taskName}`,
    )
    return response.data
  }
  catch (error) {
    console.error('触发计划任务失败:', error)
    throw error
  }
}

/**
 * 获取系统日志文件列表
 * @returns {Promise<Array>} 日志文件列表
 */
export const getSystemLogFiles = async () => {
  try {
    const response = await apiClient.get('/log-management/system-logs')
    return response.data
  }
  catch (error) {
    console.error('获取系统日志文件列表失败:', error)
    throw error
  }
}

/**
 * 获取系统日志文件内容
 * @param {string} filename - 日志文件名
 * @param {number} [lines] - 获取的行数
 * @returns {Promise<object>} 日志文件内容
 */
export const getSystemLogContent = async (filename, lines = 100) => {
  try {
    const response = await apiClient.get(
      `/log-management/system-logs/${filename}`,
      {
        params: { lines },
      },
    )
    return response.data
  }
  catch (error) {
    console.error('获取系统日志文件内容失败:', error)
    throw error
  }
}
