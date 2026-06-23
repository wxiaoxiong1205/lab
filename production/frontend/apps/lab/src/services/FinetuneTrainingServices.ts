/*
 * @Author: fangjun fangjun@deepexi.com
 * @Date: 2025-09-16 11:51:01
 * @LastEditors: fangjun fangjun@deepexi.com
 * @LastEditTime: 2025-09-25 09:53:22
 * @FilePath: \deepexi-lab-web\src\services\FinetuneTrainingServices.ts
 * @Description: 训练任务相关服务接口
 */
import apiClient from './apiClient'
import type { TrainingTaskConfig, TrainingTaskResponse, TrainingTaskSearchParams } from '@/types/training'

// 训练任务服务
export const finetuneTaskService = {
  /**
   * 获取项目下的训练任务汇总列表
   * @param projectId 项目ID
   * @param params 搜索参数
   * @returns Promise<TrainingTaskResponse> 训练任务列表响应
   */
  get: async (projectId: number, params?: TrainingTaskSearchParams): Promise<TrainingTaskResponse> => {
    const response = await apiClient.get<TrainingTaskResponse>(`/training_tasks/project/${projectId}`, {
      params: {
        page: 1,
        size: 50,
        ...params,
      },
    })
    return response.data
  },
  /**
   * 创建新的训练任务
   * @param projectId 项目ID
   * @param taskConfig 训练任务配置
   * @returns Promise<TrainingTaskResponse> 创建的训练任务信息
   */
  create: async (projectId: number, taskConfig: TrainingTaskConfig): Promise<TrainingTaskResponse> => {
    const response = await apiClient.post<TrainingTaskResponse>(
      `/training_tasks/project/${projectId}`,
      taskConfig,
      {
        timeout: 60000, // 设置超时时间为1分钟
      },
    )
    return response.data
  },

  /**
   * 编辑训练任务版本
   * @param projectId 项目ID
   * @param taskId 任务版本ID（运行ID）
   * @param taskConfig 训练任务配置
   */
  update: async (projectId: number, taskId: number, taskConfig: TrainingTaskConfig): Promise<TrainingTaskResponse> => {
    const response = await apiClient.put<TrainingTaskResponse>(
      `/training_tasks/project/${projectId}/task/${taskId}`,
      taskConfig,
      { timeout: 60000 },
    )
    return response.data
  },

  /**
   * 根据任务名称获取该任务的所有版本
   * @param projectId 项目ID
   * @param taskName 训练任务名称
   * @param deps 组合依赖（可选）
   * @returns Promise<any> 该任务名称下的所有版本列表，按版本号排序
   * @throws 当项目不存在或任务不存在时抛出错误
   */
  getTaskVersions: async (projectId: number, taskName: string, status?: string): Promise<any> => {
    const params: any = {}
    // 只有当status有值时才传递该参数
    if (status) {
      params.status = status
    }
    const response = await apiClient.get(`/training_tasks/project/${projectId}/task/${taskName}`, {
      params,
    })
    return response.data
  },

  /**
   * 删除指定项目下指定任务名称的所有版本
   * @param projectId 项目ID
   * @param taskName 训练任务名称
   * @param deps 组合依赖（可选）
   * @returns Promise<void>
   * @throws 当任务不存在或存在运行中的版本时抛出错误
   */
  delete: async (projectId: number, taskName: string, deps?: string): Promise<void> => {
    await apiClient.delete(`/training_tasks/project/${projectId}/task/${taskName}`, {
      params: {
        deps,
      },
    })
  },
  /**
   * 删除指定项目下指定任务名称的特定版本
   * @param projectId 项目ID
   * @param taskName 训练任务名称
   * @param version 任务版本号
   * @param deps 组合依赖（可选）
   * @returns Promise<void>
   * @throws 当任务不存在或状态不允许删除时抛出错误
   */
  deleteVersion: async (projectId: number, taskName: string, version: string, deps?: string): Promise<void> => {
    await apiClient.delete(`/training_tasks/project/${projectId}/task/${taskName}/version/${version}`, {
      params: {
        deps,
      },
    })
  },
  /**
   * 获取训练任务日志（支持ISO时间格式）
   * @param projectId 项目ID
   * @param taskId 训练任务ID
   * @param endTime 结束时间（ISO格式），用于指定Loki查询的结束时间点
   * @param days 如果没有归档日志，从结束时间往前查询N天的日志，默认值30
   * @returns Promise<any> 训练任务日志
   */
  getTaskLogs: async (projectId: number, taskId: number, endTime: string, days?: number): Promise<any> => {
    const response = await apiClient.get(`/training_tasks/project/${projectId}/task/${taskId}/logs`, {
      params: {
        end_time: endTime,
        days: days ?? 30, // 使用默认值30
      },
    })
    return response.data
  },
  /**
   * 获取指定时间范围内的训练任务日志
   * @param projectId 项目ID
   * @param taskId 训练任务ID
   * @param startTime 开始时间戳
   * @param endTime 结束时间戳
   * @returns Promise<any> 训练任务日志
   */
  getTaskLogsByTime: async (projectId: number, taskId: number, startTime: string, endTime: string, signal?: AbortSignal): Promise<any> => {
    const response = await apiClient.get(`/training_tasks/project/${projectId}/task/${taskId}/logs/range`, {
      params: {
        start_time: startTime,
        end_time: endTime,
      },
      signal,
    })
    return response.data
  }, /**
      * 获取训练任务版本的 MLflow 信息
      * @param projectId 项目ID
      * @param task_name  训练任务ID
      * @param version 任务版本号
      * @returns Promise<any> 训练任务版本的 MLflow 信息
      */
  getTaskVersionMLflowInfo: async (projectId: number, task_name: string, version: string): Promise<any> => {
    const response = await apiClient.get(`/training_tasks/project/${projectId}/task/${task_name}/version/${version}/mlflow`)
    return response.data
  },
  getTaskCheckpoints: async (projectId: number, taskId: number): Promise<any> => {
    const response = await apiClient.get(`/training_tasks/project/${projectId}/task/${taskId}/checkpoints`)
    return response.data
  },

  /**
   * 终止大模型训练任务
   * POST /training_tasks/project/{project_id}/task/{task_id}/stop
   */
  stopTask: async (projectId: number, taskId: number): Promise<void> => {
    await apiClient.post(`/training_tasks/project/${projectId}/task/${taskId}/stop`)
  },
}
