import type {
  Page_TaskResponse_,
  Task,
  TaskCreate,
  TaskLogsResponse,
  TaskStatusUpdate,
  TaskUpdate,
} from '../types/task'
import apiClient from './apiClient'

/**
 * Task service for interacting with the task API
 */

/**
 * Create a new task
 * @param {number} projectId - Project ID
 * @param {TaskCreate} taskData - Task data
 * @returns {Promise<Task>} - Created task
 */
export const createTask = async (
  projectId: number,
  taskData: TaskCreate,
): Promise<Task> => {
  const response = await apiClient.post<Task>(
    `/tasks/by-project/${projectId}`,
    taskData,
  )
  return response.data
}

/**
 * Get tasks with optional filtering
 * @param {number} projectId - Project ID
 * @param {object} params - Query parameters
 * @param {string} [params.status] - Filter by status
 * @param {number} [params.page] - Page number
 * @param {number} [params.size] - Page size
 * @returns {Promise<Page_TaskResponse_>} - Task list response
 */
export const getTasks = async (
  projectId: number,
  params?: { status?: string, page?: number, size?: number },
): Promise<Page_TaskResponse_> => {
  const response = await apiClient.get<Page_TaskResponse_>(
    `/tasks/by-project/${projectId}/list`,
    { params },
  )
  return response.data
}

/**
 * Get task by ID
 * @param {number} projectId - Project ID
 * @param {number} taskId - Task ID
 * @returns {Promise<Task>} - Task data
 */
export const getTaskById = async (
  projectId: number,
  taskId: number,
): Promise<Task> => {
  const response = await apiClient.get<Task>(
    `/tasks/by-project/${projectId}/task/${taskId}`,
  )
  return response.data
}

/**
 * Update task
 * @param {number} projectId - Project ID
 * @param {number} taskId - Task ID
 * @param {TaskUpdate} taskData - Task data to update
 * @returns {Promise<Task>} - Updated task
 */
export const updateTask = async (
  projectId: number,
  taskId: number,
  taskData: TaskUpdate,
): Promise<Task> => {
  const response = await apiClient.patch<Task>(
    `/tasks/by-project/${projectId}/task/${taskId}`,
    taskData,
  )
  return response.data
}

/**
 * Update task status
 * @param {number} projectId - Project ID
 * @param {number} taskId - Task ID
 * @param {TaskStatusUpdate} statusUpdate - Task status update
 * @returns {Promise<Task>} - Updated task
 */
export const updateTaskStatus = async (
  projectId: number,
  taskId: number,
  statusUpdate: TaskStatusUpdate,
): Promise<Task> => {
  const response = await apiClient.post<Task>(
    `/tasks/by-project/${projectId}/task/${taskId}/status`,
    statusUpdate,
  )
  return response.data
}

/**
 * Delete task by ID
 * @param {number} projectId - Project ID
 * @param {number} taskId - Task ID
 * @returns {Promise<void>}
 */
export const deleteTask = async (
  projectId: number,
  taskId: number,
): Promise<void> => {
  await apiClient.delete(`/tasks/by-project/${projectId}/task/${taskId}`)
}

/**
 * 获取指定项目下任务的日志
 * @param {number} projectId - 项目ID
 * @param {number} taskId - 任务ID
 * @param {object} params - 查询参数
 * @param {number} [params.start] - 起始位置（从0开始）
 * @param {number} [params.limit] - 限制条数（1-100）
 * @returns {Promise<TaskLogsResponse>} - 任务日志数据
 */
export const getTaskLogs = async (
  projectId: number,
  taskId: number,
  params?: { start?: number, limit?: number },
): Promise<TaskLogsResponse> => {
  const response = await apiClient.get<TaskLogsResponse>(
    `/tasks/by-project/${projectId}/task/${taskId}/logs`,
    { params },
  )
  return response.data
}

export const retryErrorTask = async (
  projectId: number,
  taskId: number,
): Promise<void> => {
  await apiClient.post(
    `/tasks/by-project/${projectId}/task/${taskId}/retry-error`,
  )
}

export default {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask,
  updateTaskStatus,
  getTaskLogs,
}
