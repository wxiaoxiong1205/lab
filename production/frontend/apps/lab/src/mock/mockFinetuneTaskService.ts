// 微调任务管理的模拟数据
import type { CreateFinetuneTaskRequest, FinetuneTask, KubernetesResourceRequirements, TaskStatus } from '../types'
import { DatasetConfig, ValidationConfig } from '../types'

// 模拟的任务数据
const mockTasks: FinetuneTask[] = [
  {
    id: 'task-001',
    name: 'Qwen2.5-7B中文指令微调',
    description: '使用中文指令数据集微调Qwen2.5-7B模型',
    base_model: 'qwen/Qwen2.5-7B-Instruct',

    // 新增多数据集配置
    datasets: [
      {
        id: 'dataset-001',
        name: '指令微调数据集-中文',
        ratio: 70,
        record_count: 15000,
        format: 'jsonl',
      },
      {
        id: 'dataset-002',
        name: '代码辅助对话数据集',
        ratio: 30,
        record_count: 32000,
        format: 'jsonl',
      },
    ],

    // 新增验证集配置
    validation_config: {
      type: 'split',
      split_ratio: 20,
    },

    // 兼容性字段
    dataset_id: 'dataset-001',
    dataset_name: '指令微调数据集-中文',

    resource_requirements: {
      gpu: {
        node_name: 'gpu-node-1',
        count: 2,
        type: 'nvidia-a100',
        specific_gpus: ['gpu-0', 'gpu-1'],
      },
      model_publish: {
        auto_publish: true,
        publish_mode: 'new_model',
        model_name: 'qwen2.5-7b-zh-instruct-v1',
        model_type: 'text_generation',
        context_length: 8192,
        version_description: 'Chinese instruction tuned model based on Qwen2.5-7B',
      },
    },
    status: 'completed',
    progress: 100,
    created_at: '2023-10-10T08:30:00Z',
    started_at: '2023-10-10T08:32:15Z',
    completed_at: '2023-10-10T14:45:30Z',
    hyperparameters: {
      learning_rate: 2e-5,
      num_train_epochs: 3,
      per_device_train_batch_size: 8,
      warmup_steps: 500,
      weight_decay: 0.01,
      optimizer: 'adamw_torch',
      lora_r: 16,
      lora_alpha: 32,
      lora_dropout: 0.1,
    },
    output_model_id: 'model-001',
    output_model_name: 'qwen2.5-7b-zh-instruct-v1',
    metrics: {
      loss: [1.28, 1.15, 0.98, 0.85, 0.76, 0.72, 0.68, 0.65],
      perplexity: [3.6, 3.15, 2.66, 2.34, 2.14, 2.05, 1.97, 1.92],
    },
    steps_completed: 1500,
    total_steps: 1500,
    kubernetes_info: {
      namespace: 'project-001',
      pod_name: 'finetune-task-001-xyz',
      job_name: 'finetune-task-001',
      node_name: 'gpu-node-1',
      cluster_name: 'training-cluster',
    },
  },
  {
    id: 'task-002',
    name: 'Qwen2.5-7B代码助手微调',
    description: '使用代码对话数据集微调Qwen2.5-7B模型',
    base_model: 'qwen/Qwen2.5-7B-Instruct',

    // 新增多数据集配置
    datasets: [
      {
        id: 'dataset-002',
        name: '代码辅助对话数据集',
        ratio: 80,
        record_count: 32000,
        format: 'jsonl',
      },
      {
        id: 'dataset-003',
        name: '通用对话数据集',
        ratio: 20,
        record_count: 48000,
        format: 'jsonl',
      },
    ],

    // 新增验证集配置
    validation_config: {
      type: 'platform',
      platform_datasets: [
        {
          id: 'dataset-005',
          name: '金融领域问答数据',
          ratio: 100,
          record_count: 25000,
          format: 'jsonl',
        },
      ],
    },

    // 兼容性字段
    dataset_id: 'dataset-002',
    dataset_name: '代码辅助对话数据集',

    resource_requirements: {
      gpu: {
        node_name: 'gpu-node-2',
        count: 4,
        type: 'nvidia-h100',
        specific_gpus: ['gpu-0', 'gpu-1', 'gpu-2', 'gpu-3'],
      },
      model_publish: {
        auto_publish: false,
        publish_mode: 'new_model',
        model_name: 'qwen2.5-7b-code-assistant',
        model_type: 'text_generation',
        context_length: 8192,
        version_description: 'Code assistant model based on Qwen2.5-7B',
      },
    },
    status: 'running',
    progress: 68,
    created_at: '2023-11-20T13:15:00Z',
    started_at: '2023-11-20T13:18:22Z',
    hyperparameters: {
      learning_rate: 1e-5,
      num_train_epochs: 2,
      per_device_train_batch_size: 16,
      warmup_steps: 200,
      weight_decay: 0.01,
      optimizer: 'adamw_8bit',
      lora_r: 32,
      lora_alpha: 64,
      lora_dropout: 0.05,
    },
    metrics: {
      loss: [1.42, 1.25, 1.12, 1.05, 0.98, 0.92],
      perplexity: [4.14, 3.49, 3.06, 2.86, 2.66, 2.51],
    },
    steps_completed: 1020,
    total_steps: 1500,
    estimated_remaining_time: 7200, // 秒
    kubernetes_info: {
      namespace: 'project-002',
      pod_name: 'finetune-task-002-abc',
      job_name: 'finetune-task-002',
      node_name: 'gpu-node-2',
      cluster_name: 'training-cluster',
    },
  },
  {
    id: 'task-003',
    name: 'Qwen2.5-4B中文对话微调',
    description: '使用通用对话数据集微调Qwen2.5-4B模型',
    base_model: 'qwen/Qwen2.5-4B-Chat',

    // 新增多数据集配置
    datasets: [
      {
        id: 'dataset-003',
        name: '通用对话数据集',
        ratio: 100,
        record_count: 48000,
        format: 'jsonl',
      },
    ],

    // 新增验证集配置
    validation_config: {
      type: 'split',
      split_ratio: 15,
    },

    // 兼容性字段
    dataset_id: 'dataset-003',
    dataset_name: '通用对话数据集',

    resource_requirements: {
      gpu: {
        node_name: 'gpu-node-1',
        count: 2,
        type: 'nvidia-a100',
        specific_gpus: ['gpu-2', 'gpu-3'],
      },
      model_publish: {
        auto_publish: true,
        publish_mode: 'existing_model_version',
        existing_model_id: 'model-base-001',
        model_type: 'text_generation',
        context_length: 8192,
        version_description: 'General chat model fine-tuned version',
      },
    },
    status: 'failed',
    progress: 35,
    created_at: '2023-11-25T09:20:00Z',
    started_at: '2023-11-25T09:25:10Z',
    error_message: 'CUDA out of memory. Tried to allocate 2.5 GiB. GPU 0 has a total capacity of 80 GiB of which 1.4 GiB is free.',
    hyperparameters: {
      learning_rate: 2.5e-5,
      num_train_epochs: 3,
      per_device_train_batch_size: 12,
      warmup_steps: 300,
      weight_decay: 0.01,
      optimizer: 'adamw_torch',
      lora_r: 16,
      lora_alpha: 32,
      lora_dropout: 0.1,
    },
    metrics: {
      loss: [1.35, 1.22, 1.05, 0.95],
      perplexity: [3.86, 3.39, 2.86, 2.59],
    },
    steps_completed: 524,
    total_steps: 1500,
    kubernetes_info: {
      namespace: 'project-003',
      pod_name: 'finetune-task-003-def',
      job_name: 'finetune-task-003',
      node_name: 'gpu-node-1',
      cluster_name: 'training-cluster',
    },
  },
  {
    id: 'task-004',
    name: 'Qwen2.5-14B指令微调',
    description: '使用HuggingFace Alpaca指令集微调大型模型',
    base_model: 'qwen/Qwen2.5-14B-Chat',

    // 新增多数据集配置
    datasets: [
      {
        id: 'dataset-004',
        name: 'HuggingFace Alpaca指令集',
        ratio: 60,
        record_count: 52000,
        format: 'jsonl',
      },
      {
        id: 'dataset-001',
        name: '指令微调数据集-中文',
        ratio: 40,
        record_count: 15000,
        format: 'jsonl',
      },
    ],

    // 新增验证集配置
    validation_config: {
      type: 'platform',
      platform_datasets: [
        {
          id: 'dataset-005',
          name: '金融领域问答数据',
          ratio: 60,
          record_count: 25000,
          format: 'jsonl',
        },
        {
          id: 'dataset-006',
          name: '法律领域问答数据',
          ratio: 40,
          record_count: 18000,
          format: 'jsonl',
        },
      ],
    },

    // 兼容性字段
    dataset_id: 'dataset-004',
    dataset_name: 'HuggingFace Alpaca指令集',

    resource_requirements: {
      gpu: {
        node_name: 'gpu-node-3',
        count: 4,
        type: 'nvidia-a100',
        specific_gpus: ['gpu-0', 'gpu-1', 'gpu-2', 'gpu-3'],
      },
      model_publish: {
        auto_publish: true,
        publish_mode: 'new_model',
        model_name: 'qwen2.5-14b-instruct-bilingual',
        model_type: 'text_generation',
        context_length: 8192,
        version_description: 'Bilingual instruction model based on Qwen2.5-14B',
      },
    },
    status: 'pending',
    progress: 0,
    created_at: '2023-12-01T10:00:00Z',
    hyperparameters: {
      learning_rate: 1.5e-5,
      num_train_epochs: 3,
      per_device_train_batch_size: 8,
      warmup_steps: 500,
      weight_decay: 0.01,
      optimizer: 'adamw_torch',
      lora_r: 32,
      lora_alpha: 64,
      lora_dropout: 0.05,
    },
    total_steps: 2000,
    kubernetes_info: {
      namespace: 'project-004',
      cluster_name: 'training-cluster',
    },
  },
]

// 模拟的基础模型列表
const mockBaseModels = [
  {
    id: 'qwen/Qwen2.5-7B-Instruct',
    name: 'Qwen2.5-7B-Instruct',
    provider: 'Alibaba Cloud',
    size: '7B',
    type: 'causal_lm',
    description: '通义千问2.5指令模型，适合微调各种指令场景',
    recommended_gpu: ['A100', 'H100', 'A6000'],
    min_gpu_memory: 24,
  },
  {
    id: 'qwen/Qwen2.5-14B-Chat',
    name: 'Qwen2.5-14B-Chat',
    provider: 'Alibaba Cloud',
    size: '14B',
    type: 'causal_lm',
    description: '通义千问2.5对话模型，支持更长上下文，适合复杂场景',
    recommended_gpu: ['A100', 'H100'],
    min_gpu_memory: 40,
  },
  {
    id: 'qwen/Qwen2.5-4B-Chat',
    name: 'Qwen2.5-4B-Chat',
    provider: 'Alibaba Cloud',
    size: '4B',
    type: 'causal_lm',
    description: '通义千问2.5轻量级对话模型，适合资源受限场景',
    recommended_gpu: ['A100', 'H100', 'A6000', 'A40'],
    min_gpu_memory: 16,
  },
  {
    id: 'qwen/Qwen2.5-1.8B-Chat',
    name: 'Qwen2.5-1.8B-Chat',
    provider: 'Alibaba Cloud',
    size: '1.8B',
    type: 'causal_lm',
    description: '通义千问2.5超轻量级对话模型，适合边缘设备和移动端',
    recommended_gpu: ['A100', 'A6000', 'A40', 'V100', 'T4'],
    min_gpu_memory: 8,
  },
  {
    id: 'qwen/Qwen2.5-72B-Chat',
    name: 'Qwen2.5-72B-Chat',
    provider: 'Alibaba Cloud',
    size: '72B',
    type: 'causal_lm',
    description: '通义千问2.5旗舰级对话模型，提供接近API模型的能力',
    recommended_gpu: ['A100-80G', 'H100-80G'],
    min_gpu_memory: 160,
  },
]

// 模拟的微调数据集列表（包含验证集）
const mockDatasets = [
  {
    id: 'dataset-001',
    name: '指令微调数据集-中文',
    description: '包含中文指令和对话的微调数据集',
    format: 'jsonl',
    record_count: 15000,
    size: '125MB',
    created_at: '2023-09-15T10:00:00Z',
    status: 'active',
  },
  {
    id: 'dataset-002',
    name: '代码辅助对话数据集',
    description: '专注于代码生成和解释的对话数据集',
    format: 'jsonl',
    record_count: 32000,
    size: '280MB',
    created_at: '2023-10-01T14:30:00Z',
    status: 'active',
  },
  {
    id: 'dataset-003',
    name: '通用对话数据集',
    description: '涵盖多种场景的通用对话数据集',
    format: 'jsonl',
    record_count: 48000,
    size: '350MB',
    created_at: '2023-10-15T09:20:00Z',
    status: 'active',
  },
  {
    id: 'dataset-004',
    name: 'HuggingFace Alpaca指令集',
    description: '来自HuggingFace的高质量指令数据集',
    format: 'jsonl',
    record_count: 52000,
    size: '420MB',
    created_at: '2023-11-01T11:45:00Z',
    status: 'active',
  },
  {
    id: 'dataset-005',
    name: '金融领域问答数据',
    description: '金融行业专业问答数据集',
    format: 'jsonl',
    record_count: 25000,
    size: '180MB',
    created_at: '2023-11-10T16:30:00Z',
    status: 'active',
  },
  {
    id: 'dataset-006',
    name: '法律领域问答数据',
    description: '法律行业专业问答验证数据集',
    format: 'jsonl',
    record_count: 18000,
    size: '150MB',
    created_at: '2023-11-15T14:20:00Z',
    status: 'active',
  },
  {
    id: 'dataset-007',
    name: '医疗领域对话数据',
    description: '医疗健康领域的对话验证数据集',
    format: 'jsonl',
    record_count: 22000,
    size: '160MB',
    created_at: '2023-11-20T10:30:00Z',
    status: 'active',
  },
  {
    id: 'dataset-008',
    name: '教育领域问答数据',
    description: '教育培训领域的问答验证数据集',
    format: 'jsonl',
    record_count: 20000,
    size: '140MB',
    created_at: '2023-11-25T09:15:00Z',
    status: 'active',
  },
]

// 生成模拟任务日志
const generateTaskLogs = (taskId: string, status: TaskStatus, count: number = 100): string[] => {
  const logs = []
  const baseMessages = [
    'Initializing training environment...',
    'Loading model weights...',
    'Preparing dataset...',
    'Processing multi-dataset configuration...',
    'Configuring validation dataset...',
    'Starting training process...',
    'Epoch 1/3: Training started',
    'Batch 100/1500: Loss=1.245, LR=2.3e-5',
    'Batch 200/1500: Loss=1.180, LR=2.1e-5',
    'Batch 300/1500: Loss=1.125, LR=1.9e-5',
    'Epoch 1/3: Training completed, Validation Loss=1.050',
    'Epoch 2/3: Training started',
    'Batch 500/1500: Loss=0.980, LR=1.5e-5',
    'Batch 600/1500: Loss=0.925, LR=1.3e-5',
    'Batch 700/1500: Loss=0.885, LR=1.1e-5',
    'Epoch 2/3: Training completed, Validation Loss=0.820',
    'Epoch 3/3: Training started',
    'Batch 1000/1500: Loss=0.760, LR=8.0e-6',
    'Batch 1100/1500: Loss=0.720, LR=6.0e-6',
    'Batch 1200/1500: Loss=0.685, LR=4.0e-6',
    'Batch 1300/1500: Loss=0.665, LR=2.0e-6',
    'Batch 1400/1500: Loss=0.650, LR=1.0e-6',
    'Epoch 3/3: Training completed, Validation Loss=0.680',
    'Saving model weights...',
    'Training completed successfully!',
  ]

  const errorMessages = [
    'CUDA out of memory error detected',
    'GPU utilization dropped to 0%',
    'Training process terminated unexpectedly',
    'Failed to save model checkpoint',
    'Memory allocation failed',
    'Dataset loading failed',
  ]

  const pendingMessages = [
    'Waiting for GPU resources...',
    'Task queued for execution',
    'Preparing training environment...',
    'Downloading model weights...',
    'Validating dataset format...',
    'Processing multi-dataset configuration...',
  ]

  let messagesToUse = baseMessages
  if (status === 'failed') {
    messagesToUse = [...baseMessages.slice(0, 10), ...errorMessages]
  }
  else if (status === 'pending') {
    messagesToUse = pendingMessages
  }

  for (let i = 0; i < Math.min(count, messagesToUse.length); i++) {
    const timestamp = new Date(Date.now() - (messagesToUse.length - i) * 60000).toISOString()
    logs.push(`[${timestamp}] ${messagesToUse[i]}`)
  }

  return logs
}

// 生成模拟任务指标
const generateTaskMetrics = (task: FinetuneTask) => {
  const metrics = []
  const stepCount = task.steps_completed || 0

  for (let i = 0; i < stepCount; i += 100) {
    const step = i + 100
    const progress = Math.min(step / (task.total_steps || 1500), 1)

    metrics.push({
      step,
      timestamp: new Date(Date.now() - (stepCount - step) * 1000).toISOString(),
      training_loss: 1.5 - (progress * 0.8) + (Math.random() * 0.1),
      validation_loss: 1.3 - (progress * 0.6) + (Math.random() * 0.08),
      learning_rate: 2e-5 * (1 - progress * 0.9),
      gpu_utilization: 85 + (Math.random() * 10),
      memory_usage: 0.7 + (Math.random() * 0.2),
      throughput: 120 + (Math.random() * 20),
    })
  }

  return metrics
}

// 导出函数
// 注意：getMockFinetuneTaskList 已删除，因为不再使用 FinetuneTaskList 页面

export const getMockFinetuneTaskDetail = async (taskId: string) => {
  // 模拟网络延迟
  await new Promise((resolve) => setTimeout(resolve, 300))

  const task = mockTasks.find((t) => t.id === taskId)
  if (!task) {
    throw new Error(`Task with ID ${taskId} not found`)
  }

  return task
}

export const createMockFinetuneTask = async (taskData: CreateFinetuneTaskRequest) => {
  // 模拟网络延迟
  await new Promise((resolve) => setTimeout(resolve, 800))

  console.log('创建任务请求数据:', taskData)

  // 确保所有字段都有默认值
  const defaultResourceRequirements: KubernetesResourceRequirements = {
    gpu: {
      node_name: 'gpu-node-1',
      count: 1,
      type: 'nvidia-a100',
      specific_gpus: [],
    },
    model_publish: {
      auto_publish: false,
      publish_mode: 'new_model',
      model_type: 'text_generation',
      context_length: 8192,
    },
  }

  const sanitizedTaskData = {
    name: taskData.name || '新微调任务',
    description: taskData.description || '',
    base_model: taskData.base_model,
    datasets: taskData.datasets || [],
    validation_config: taskData.validation_config,
    dataset_id: (taskData.datasets && taskData.datasets.length > 0 ? taskData.datasets[0].id : undefined),
    resource_requirements: taskData.resource_requirements || defaultResourceRequirements,
    hyperparameters: taskData.hyperparameters || {
      learning_rate: 0.0001,
      epochs: 3,
      batch_size: 4,
      optimizer: 'adamw',
      warmup_ratio: 0.03,
      weight_decay: 0.01,
    },
    output_model_name: taskData.output_model_name || `${taskData.name || '新微调任务'}-model`,
  }

  // 验证必需字段
  const missingFields = []
  if (!sanitizedTaskData.base_model) missingFields.push('base_model')
  if (!sanitizedTaskData.datasets || sanitizedTaskData.datasets.length === 0) {
    if (!sanitizedTaskData.dataset_id) missingFields.push('datasets or dataset_id')
  }
  if (!sanitizedTaskData.resource_requirements) missingFields.push('resource_requirements')

  if (missingFields.length > 0) {
    const errorMsg = `Missing required fields: ${missingFields.join(', ')}`
    console.error(errorMsg, sanitizedTaskData)
    throw new Error(errorMsg)
  }

  // 获取数据集名称
  let datasetName = 'Unknown Dataset'
  if (sanitizedTaskData.datasets && sanitizedTaskData.datasets.length > 0) {
    datasetName = sanitizedTaskData.datasets[0].name
  }
  else if (sanitizedTaskData.dataset_id) {
    const dataset = mockDatasets.find((d) => d.id === sanitizedTaskData.dataset_id)
    datasetName = dataset?.name || 'Unknown Dataset'
  }

  // 从项目ID生成namespace
  const namespace = `project-${Math.random().toString(36).substring(2, 5)}`

  // 创建新任务
  const newTask: FinetuneTask = {
    id: `task-${Date.now()}`,
    name: sanitizedTaskData.name,
    description: sanitizedTaskData.description,
    base_model: sanitizedTaskData.base_model,
    datasets: sanitizedTaskData.datasets,
    validation_config: sanitizedTaskData.validation_config,
    dataset_id: sanitizedTaskData.dataset_id,
    dataset_name: datasetName,
    resource_requirements: sanitizedTaskData.resource_requirements,
    status: 'pending',
    progress: 0,
    created_at: new Date().toISOString(),
    hyperparameters: sanitizedTaskData.hyperparameters,
    output_model_name: sanitizedTaskData.output_model_name,
    steps_completed: 0,
    total_steps: 1500,
    kubernetes_info: {
      namespace,
      cluster_name: 'training-cluster',
    },
  }

  // 添加到模拟数据中
  mockTasks.push(newTask)

  return {
    success: true,
    task: newTask,
  }
}

export const stopMockFinetuneTask = async (taskId: string) => {
  await new Promise((resolve) => setTimeout(resolve, 500))

  const task = mockTasks.find((t) => t.id === taskId)
  if (!task) {
    throw new Error(`Task with ID ${taskId} not found`)
  }

  if (task.status !== 'running' && task.status !== 'preparing') {
    throw new Error(`Task ${taskId} is not in a state that can be stopped`)
  }

  task.status = 'stopping'

  // 模拟停止过程
  setTimeout(() => {
    task.status = 'cancelled'
    task.completed_at = new Date().toISOString()
  }, 2000)

  return {
    success: true,
    message: `Task ${taskId} is being stopped`,
  }
}

// 注意：deleteMockFinetuneTask 已删除，现在通过实验管理服务进行删除操作

export const getMockFinetuneTaskLogs = async (taskId: string, lines: number = 100) => {
  await new Promise((resolve) => setTimeout(resolve, 200))

  const task = mockTasks.find((t) => t.id === taskId)
  if (!task) {
    throw new Error(`Task with ID ${taskId} not found`)
  }

  const logs = generateTaskLogs(taskId, task.status, lines)

  return {
    logs,
    total_lines: logs.length,
    task_id: taskId,
  }
}

export const getMockFinetuneTaskMetrics = async (taskId: string) => {
  await new Promise((resolve) => setTimeout(resolve, 300))

  const task = mockTasks.find((t) => t.id === taskId)
  if (!task) {
    throw new Error(`Task with ID ${taskId} not found`)
  }

  const metrics = generateTaskMetrics(task)

  return {
    metrics,
    task_id: taskId,
  }
}

export const getMockBaseModelList = async () => {
  await new Promise((resolve) => setTimeout(resolve, 200))
  return mockBaseModels
}

// 注意：getMockDatasetList 已删除，现在使用训练数据集服务获取数据集

// 新增：获取验证集数据集列表
export const getMockValidationDatasetList = async () => {
  await new Promise((resolve) => setTimeout(resolve, 200))
  // 返回所有可用作验证集的数据集
  return mockDatasets.filter((dataset) => dataset.status === 'active')
}
