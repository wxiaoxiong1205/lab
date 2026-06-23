// 微调任务服务
import { ENABLE_MOCK_DATA, mockFinetuneTaskService } from '../mock'
import type { CreateFinetuneTaskRequest } from '../types'
import apiClient from './apiClient'

// 注意：getFinetuneTaskList 方法已删除，因为不再使用 FinetuneTaskList 页面
// 新的训练管理使用 SimpleFinetuneTraining 页面和实验管理服务

/**
 * 获取微调任务详情
 * @param taskId 任务ID
 * @returns 任务详情
 */
export const getFinetuneTaskDetail = async (taskId: string) => {
  if (ENABLE_MOCK_DATA) {
    return await mockFinetuneTaskService.getMockFinetuneTaskDetail(taskId)
  }

  const response = await apiClient.get(`/finetune/tasks/${taskId}`)
  return response.data
}

/**
 * 创建微调任务
 * @param taskData 任务数据
 * @returns 创建结果
 */
export const createFinetuneTask = async (taskData: CreateFinetuneTaskRequest) => {
  if (ENABLE_MOCK_DATA) {
    return await mockFinetuneTaskService.createMockFinetuneTask(taskData)
  }

  const response = await apiClient.post('/finetune/tasks', taskData)
  return response.data
}

/**
 * 停止微调任务
 * @param taskId 任务ID
 * @returns 停止结果
 */
export const stopFinetuneTask = async (taskId: string) => {
  if (ENABLE_MOCK_DATA) {
    return await mockFinetuneTaskService.stopMockFinetuneTask(taskId)
  }

  const response = await apiClient.post(`/finetune/tasks/${taskId}/stop`)
  return response.data
}

// 注意：deleteFinetuneTask 方法已删除，现在通过实验管理服务进行删除操作

/**
 * 克隆微调任务
 * @param taskId 源任务ID
 * @returns 克隆结果
 */
export const cloneFinetuneTask = async (taskId: string) => {
  if (ENABLE_MOCK_DATA) {
    // 获取源任务详情
    const sourceTask = await mockFinetuneTaskService.getMockFinetuneTaskDetail(
      taskId,
    )

    // 创建克隆任务数据，支持新的多数据集和验证集配置结构
    const cloneData: CreateFinetuneTaskRequest = {
      name: `${sourceTask.name} (克隆)`,
      description: sourceTask.description,
      base_model: sourceTask.base_model,

      // 优先使用新的多数据集配置，如果不存在则回退到旧的dataset_id
      datasets: sourceTask.datasets || (sourceTask.dataset_id ? [{
        id: sourceTask.dataset_id,
        name: '', // 这里需要从数据集列表中获取名称
        ratio: 100,
        record_count: 0, // 这里需要从数据集详情中获取
        format: 'jsonl', // 默认格式
      }] : []),

      // 验证集配置
      validation_config: sourceTask.validation_config || {
        type: 'split',
        split_ratio: 20,
      },

      resource_requirements: sourceTask.resource_requirements,
      hyperparameters: sourceTask.hyperparameters,
      output_model_name: `${sourceTask.output_model_name}-clone`,
    }

    // 创建克隆任务
    return await mockFinetuneTaskService.createMockFinetuneTask(cloneData)
  }

  const response = await apiClient.post(`/finetune/tasks/${taskId}/clone`)
  return response.data
}

/**
 * 获取微调任务日志
 * @param taskId 任务ID
 * @param lines 日志行数
 * @returns 任务日志
 */
export const getFinetuneTaskLogs = async (
  taskId: string,
  lines: number = 100,
) => {
  if (ENABLE_MOCK_DATA) {
    return await mockFinetuneTaskService.getMockFinetuneTaskLogs(taskId, lines)
  }

  const response = await apiClient.get(`/finetune/tasks/${taskId}/logs`, {
    params: { lines },
  })
  return response.data
}

/**
 * 获取微调任务训练指标
 * @param taskId 任务ID
 * @returns 训练指标
 */
export const getFinetuneTaskMetrics = async (taskId: string) => {
  if (ENABLE_MOCK_DATA) {
    return await mockFinetuneTaskService.getMockFinetuneTaskMetrics(taskId)
  }

  const response = await apiClient.get(`/finetune/tasks/${taskId}/metrics`)
  return response.data
}

/**
 * 获取基础模型列表
 * @returns 基础模型列表
 */
export const getBaseModelList = async () => {
  if (ENABLE_MOCK_DATA) {
    return await mockFinetuneTaskService.getMockBaseModelList()
  }

  const response = await apiClient.get('/finetune/models')
  return response.data
}

// 注意：getFinetuneDatasets 和 getValidationDatasets 方法已删除
// 现在使用 getTrainingDatasets 和 getFinetuneValidationDatasets 代替

/**
 * 获取训练数据集列表
 * @param projectId 项目ID
 * @returns 训练数据集列表
 */
export const getTrainingDatasets = async (projectId: number) => {
  if (ENABLE_MOCK_DATA) {
    // 使用训练数据集mock服务
    const { mockTrainingDatasetService } = await import('../mock/mockTrainingDatasetService')
    const response = await mockTrainingDatasetService.list({ project_id: projectId })
    return response.items || []
  }

  const response = await apiClient.get(`/projects/${projectId}/training-datasets`)
  return response.data
}

/**
 * 获取验证数据集列表（用于微调任务）
 * @param projectId 项目ID
 * @returns 验证数据集列表
 */
export const getFinetuneValidationDatasets = async (projectId: number) => {
  if (ENABLE_MOCK_DATA) {
    // 使用评估数据集mock服务作为验证数据集
    return await mockFinetuneTaskService.getMockValidationDatasetList()
  }

  const response = await apiClient.get(`/projects/${projectId}/validation-datasets`)
  return response.data
}
