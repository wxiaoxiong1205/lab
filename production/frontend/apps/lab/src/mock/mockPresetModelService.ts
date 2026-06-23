// Mock数据服务 - 预置模型调参功能
import { message } from 'antd'

// 技术领域枚举
export enum TechnicalDomain {
  COMPUTER_VISION = 'computer_vision',
  NLP = 'nlp',
  STRUCTURED_DATA = 'structured_data',
}

// 模板类别枚举
export enum TemplateCategory {
  GENERAL = 'general',
  INDUSTRY = 'industry',
}

// 任务状态枚举
export enum PresetTaskStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

// 运行状态枚举
export enum PresetRunStatus {
  CREATED = 'created',
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// 预置模型任务模板接口
export interface PresetModelTemplate {
  id: string
  name: string
  description: string
  category: TemplateCategory
  domain: TechnicalDomain
  tags: string[]
  icon: string
  difficulty: 'easy' | 'medium' | 'hard'
  estimatedTime: string
  supportedModels: string[]
  supportedDataFormats: string[]
  defaultConfig: {
    epochs: number
    learningRate: number
    batchSize: number
    [key: string]: unknown
  }
  requirements: {
    minGpu: string
    minMemory: string
    minStorage: string
  }
  examples: {
    title: string
    description: string
    expectedAccuracy: number
  }[]
}

// 预置模型任务接口 - 任务定义
export interface PresetModelTask {
  id: string
  name: string
  description: string
  templateId: string
  templateName: string
  projectId: string
  status: PresetTaskStatus
  taskType?: string // 任务类型，如"图像分类-单图单标签"
  progress?: number // 任务进度
  result?: PresetModelResult // 任务结果
  datasetName?: string // 数据集名称
  startedAt?: string // 开始时间
  finishedAt?: string // 完成时间
  logs?: string[] // 执行日志

  // 任务配置 - 作为模板
  config: {
    // 数据配置
    datasetId?: string
    datasetName?: string
    dataSplit: {
      train: number
      validation: number
      test: number
    }

    // 模型配置
    model: string
    mode: 'simple' | 'expert'

    // 基础超参数模板
    hyperparameters: Record<string, unknown>

    // 资源需求
    resourceRequirements: {
      gpu: string
      memory: string
      storage: string
    }
  }

  // 运行统计
  runs: {
    total: number
    completed: number
    failed: number
    running: number
  }

  // 最佳结果
  bestRun?: {
    runId: string
    accuracy: number
    loss: number
    runTime: number
  }

  // 时间戳
  createdAt: string
  updatedAt: string
  createdBy?: string
  tags?: string[]
}

// 预置模型运行接口 - 具体执行实例
export interface PresetModelRun {
  id: string
  taskId: string
  name: string
  description?: string
  status: PresetRunStatus
  progress: number

  // 运行配置 - 基于任务模板但可调整
  config: {
    // 数据配置
    datasetId: string
    datasetName: string
    dataSplit: {
      train: number
      validation: number
      test: number
    }

    // 模型配置
    model: string
    mode: 'simple' | 'expert'

    // 具体超参数
    hyperparameters: Record<string, unknown>

    // 资源需求
    resourceRequirements: {
      gpu: string
      memory: string
      storage: string
    }
  }

  // 运行结果
  result?: PresetModelResult

  // 运行日志
  logs: string[]

  // 时间戳
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
  errorMessage?: string

  // 运行统计
  stats?: {
    totalTime: number
    gpuUsage: number
    memoryUsage: number
    iterations: number
  }
}

// 预置模型结果接口
export interface PresetModelResult {
  id: string
  taskId: string
  runId: string
  bestModel: {
    name: string
    accuracy: number
    loss: number
    f1Score: number
    precision: number
    recall: number
  }
  trainingMetrics: {
    epoch: number
    loss: number
    accuracy: number
    valLoss: number
    valAccuracy: number
  }[]
  confusionMatrix: number[][]
  classificationReport: {
    className: string
    precision: number
    recall: number
    f1Score: number
    support: number
  }[]
  predictionSamples: {
    input: string
    predicted: string
    actual: string
    confidence: number
  }[]
  modelArtifacts: {
    modelFile: string
    configFile: string
    vocabularyFile?: string
  }
  // 添加缺失的字段
  trials?: {
    id: string
    runId: string
    parameters: Record<string, unknown>
    metrics: Record<string, number>
    status: PresetRunStatus
    startTime: string
    endTime?: string
    duration?: number
  }[]
  deploymentInfo?: {
    status: 'deployed' | 'deploying' | 'failed'
    apiEndpoint?: string
    metrics: {
      requests: number
      avgResponseTime: number
      errorRate: number
    }
  }
}

// 模板数据
const mockTemplates: PresetModelTemplate[] = [
  {
    id: 'template_1',
    name: '图像分类-通用模型',
    description: '适用于各种图像分类任务的通用模型，支持多种预训练模型',
    category: TemplateCategory.GENERAL,
    domain: TechnicalDomain.COMPUTER_VISION,
    tags: ['图像分类', '深度学习', '计算机视觉'],
    icon: '🖼️',
    difficulty: 'easy',
    estimatedTime: '30分钟 - 2小时',
    supportedModels: ['ResNet50', 'EfficientNet-B0', 'MobileNet-V2', 'Vision Transformer'],
    supportedDataFormats: ['JPG', 'PNG', 'BMP', 'TIFF'],
    defaultConfig: {
      epochs: 50,
      learningRate: 0.001,
      batchSize: 32,
      optimizer: 'Adam',
      augmentation: true,
    },
    requirements: {
      minGpu: 'GTX 1060',
      minMemory: '8GB',
      minStorage: '50GB',
    },
    examples: [
      {
        title: '商品图像分类',
        description: '对电商平台商品图像进行分类，识别商品类别',
        expectedAccuracy: 0.92,
      },
      {
        title: '医疗影像分析',
        description: '医疗影像的病理分类，辅助诊断',
        expectedAccuracy: 0.89,
      },
    ],
  },
  {
    id: 'template_2',
    name: '文本分类-情感分析',
    description: '专门用于文本情感分析任务的模型',
    category: TemplateCategory.GENERAL,
    domain: TechnicalDomain.NLP,
    tags: ['文本分类', '情感分析', '自然语言处理'],
    icon: '📝',
    difficulty: 'medium',
    estimatedTime: '45分钟 - 3小时',
    supportedModels: ['BERT', 'RoBERTa', 'DistilBERT', 'ALBERT'],
    supportedDataFormats: ['TXT', 'CSV', 'JSON', 'JSONL'],
    defaultConfig: {
      epochs: 10,
      learningRate: 0.00002,
      batchSize: 16,
      maxLength: 512,
      warmupSteps: 500,
    },
    requirements: {
      minGpu: 'GTX 1080',
      minMemory: '16GB',
      minStorage: '30GB',
    },
    examples: [
      {
        title: '用户评论情感分析',
        description: '分析用户对产品的评论情感倾向',
        expectedAccuracy: 0.88,
      },
      {
        title: '社交媒体情绪监控',
        description: '监控社交媒体上的情绪变化',
        expectedAccuracy: 0.85,
      },
    ],
  },
  {
    id: 'template_3',
    name: '用户流失预测',
    description: '预测用户流失风险的机器学习模型',
    category: TemplateCategory.INDUSTRY,
    domain: TechnicalDomain.STRUCTURED_DATA,
    tags: ['流失预测', '机器学习', '用户分析'],
    icon: '📊',
    difficulty: 'medium',
    estimatedTime: '20分钟 - 1小时',
    supportedModels: ['XGBoost', 'Random Forest', 'Gradient Boosting', 'Neural Network'],
    supportedDataFormats: ['CSV', 'JSON', 'Parquet'],
    defaultConfig: {
      epochs: 100,
      learningRate: 0.1,
      batchSize: 256,
      maxDepth: 6,
      subsample: 0.8,
    },
    requirements: {
      minGpu: 'CPU',
      minMemory: '8GB',
      minStorage: '20GB',
    },
    examples: [
      {
        title: '电商用户流失预测',
        description: '预测电商平台用户的流失风险',
        expectedAccuracy: 0.82,
      },
      {
        title: '订阅服务续费预测',
        description: '预测订阅用户的续费可能性',
        expectedAccuracy: 0.79,
      },
    ],
  },
]

// 任务数据
const mockTasks: PresetModelTask[] = [
  {
    id: 'task_1',
    name: '商品图像分类实验',
    description: '对电商平台商品图像进行分类的实验任务',
    templateId: 'template_1',
    templateName: '图像分类-通用模型',
    projectId: 'project_1',
    status: PresetTaskStatus.ACTIVE,
    taskType: 'cv_multi_classification',
    progress: 85,
    datasetName: '商品图像数据集',
    startedAt: '2024-01-15T10:00:00Z',
    logs: [
      '2024-01-15T10:00:00Z - 任务开始执行',
      '2024-01-15T10:05:00Z - 数据集加载完成',
      '2024-01-15T10:10:00Z - 模型训练开始',
      '2024-01-15T14:30:00Z - 当前训练进度 85%',
    ],
    config: {
      datasetId: 'dataset_1',
      datasetName: '商品图像数据集',
      dataSplit: {
        train: 0.7,
        validation: 0.2,
        test: 0.1,
      },
      model: 'ResNet50',
      mode: 'simple',
      hyperparameters: {
        epochs: 50,
        learningRate: 0.001,
        batchSize: 32,
        optimizer: 'Adam',
        augmentation: true,
      },
      resourceRequirements: {
        gpu: 'NVIDIA Tesla V100',
        memory: '16GB',
        storage: '100GB',
      },
    },
    runs: {
      total: 3,
      completed: 2,
      failed: 0,
      running: 1,
    },
    bestRun: {
      runId: 'run_1_2',
      accuracy: 0.94,
      loss: 0.18,
      runTime: 3600,
    },
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-16T14:30:00Z',
    createdBy: 'user_1',
    tags: ['图像分类', '商品识别'],
  },
  {
    id: 'task_2',
    name: '评论情感分析实验',
    description: '分析用户评论情感倾向的实验任务',
    templateId: 'template_2',
    templateName: '文本分类-情感分析',
    projectId: 'project_1',
    status: PresetTaskStatus.ACTIVE,
    config: {
      datasetId: 'dataset_2',
      datasetName: '用户评论数据集',
      dataSplit: {
        train: 0.8,
        validation: 0.15,
        test: 0.05,
      },
      model: 'BERT',
      mode: 'expert',
      hyperparameters: {
        epochs: 10,
        learningRate: 0.00002,
        batchSize: 16,
        maxLength: 512,
        warmupSteps: 500,
      },
      resourceRequirements: {
        gpu: 'NVIDIA Tesla A100',
        memory: '32GB',
        storage: '50GB',
      },
    },
    runs: {
      total: 2,
      completed: 1,
      failed: 0,
      running: 1,
    },
    bestRun: {
      runId: 'run_2_1',
      accuracy: 0.89,
      loss: 0.32,
      runTime: 7200,
    },
    createdAt: '2024-01-16T08:30:00Z',
    updatedAt: '2024-01-16T12:15:00Z',
    createdBy: 'user_1',
    tags: ['情感分析', '用户体验'],
  },
]

// 运行数据
const mockRuns: PresetModelRun[] = [
  {
    id: 'run_1_1',
    taskId: 'task_1',
    name: '商品图像分类 - 运行1',
    description: '使用ResNet50模型的第一次运行',
    status: PresetRunStatus.COMPLETED,
    progress: 100,
    config: {
      datasetId: 'dataset_1',
      datasetName: '商品图像数据集',
      dataSplit: {
        train: 0.7,
        validation: 0.2,
        test: 0.1,
      },
      model: 'ResNet50',
      mode: 'simple',
      hyperparameters: {
        epochs: 50,
        learningRate: 0.001,
        batchSize: 32,
        optimizer: 'Adam',
        augmentation: true,
      },
      resourceRequirements: {
        gpu: 'NVIDIA Tesla V100',
        memory: '16GB',
        storage: '100GB',
      },
    },
    result: {
      id: 'result_1_1',
      taskId: 'task_1',
      runId: 'run_1_1',
      bestModel: {
        name: 'ResNet50_best',
        accuracy: 0.92,
        loss: 0.22,
        f1Score: 0.91,
        precision: 0.93,
        recall: 0.89,
      },
      trainingMetrics: [
        { epoch: 1, loss: 2.3, accuracy: 0.3, valLoss: 2.1, valAccuracy: 0.35 },
        { epoch: 10, loss: 1.2, accuracy: 0.65, valLoss: 1.1, valAccuracy: 0.68 },
        { epoch: 20, loss: 0.8, accuracy: 0.78, valLoss: 0.7, valAccuracy: 0.82 },
        { epoch: 30, loss: 0.5, accuracy: 0.86, valLoss: 0.45, valAccuracy: 0.88 },
        { epoch: 40, loss: 0.3, accuracy: 0.91, valLoss: 0.28, valAccuracy: 0.92 },
        { epoch: 50, loss: 0.22, accuracy: 0.92, valLoss: 0.24, valAccuracy: 0.91 },
      ],
      confusionMatrix: [
        [145, 3, 5, 2],
        [2, 148, 3, 2],
        [4, 2, 147, 2],
        [1, 2, 3, 149],
      ],
      classificationReport: [
        { className: '服装', precision: 0.95, recall: 0.93, f1Score: 0.94, support: 155 },
        { className: '电子产品', precision: 0.95, recall: 0.95, f1Score: 0.95, support: 155 },
        { className: '家居用品', precision: 0.93, recall: 0.95, f1Score: 0.94, support: 155 },
        { className: '运动器材', precision: 0.96, recall: 0.96, f1Score: 0.96, support: 155 },
      ],
      predictionSamples: [
        { input: 'Nike运动鞋', predicted: '运动器材', actual: '运动器材', confidence: 0.98 },
        { input: 'iPhone手机', predicted: '电子产品', actual: '电子产品', confidence: 0.97 },
        { input: '连衣裙', predicted: '服装', actual: '服装', confidence: 0.95 },
      ],
      modelArtifacts: {
        modelFile: 'resnet50_model.pth',
        configFile: 'config.json',
        vocabularyFile: 'vocab.json',
      },
    },
    logs: [
      '2024-01-15 10:00:00 - 运行开始',
      '2024-01-15 10:00:05 - 数据加载完成，共10000张图像',
      '2024-01-15 10:00:10 - 模型初始化完成',
      '2024-01-15 10:00:15 - 开始训练...',
      '2024-01-15 11:30:00 - 训练完成，最佳准确率: 92%',
    ],
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T11:30:00Z',
    startedAt: '2024-01-15T10:00:00Z',
    finishedAt: '2024-01-15T11:30:00Z',
    stats: {
      totalTime: 5400,
      gpuUsage: 85,
      memoryUsage: 12,
      iterations: 50,
    },
  },
  {
    id: 'run_1_2',
    taskId: 'task_1',
    name: '商品图像分类 - 运行2',
    description: '使用EfficientNet-B0模型的第二次运行',
    status: PresetRunStatus.COMPLETED,
    progress: 100,
    config: {
      datasetId: 'dataset_1',
      datasetName: '商品图像数据集',
      dataSplit: {
        train: 0.7,
        validation: 0.2,
        test: 0.1,
      },
      model: 'EfficientNet-B0',
      mode: 'simple',
      hyperparameters: {
        epochs: 50,
        learningRate: 0.001,
        batchSize: 32,
        optimizer: 'Adam',
        augmentation: true,
      },
      resourceRequirements: {
        gpu: 'NVIDIA Tesla V100',
        memory: '16GB',
        storage: '100GB',
      },
    },
    result: {
      id: 'result_1_2',
      taskId: 'task_1',
      runId: 'run_1_2',
      bestModel: {
        name: 'EfficientNet_best',
        accuracy: 0.94,
        loss: 0.18,
        f1Score: 0.93,
        precision: 0.95,
        recall: 0.91,
      },
      trainingMetrics: [
        { epoch: 1, loss: 2.1, accuracy: 0.35, valLoss: 1.9, valAccuracy: 0.40 },
        { epoch: 10, loss: 1.0, accuracy: 0.70, valLoss: 0.9, valAccuracy: 0.73 },
        { epoch: 20, loss: 0.6, accuracy: 0.82, valLoss: 0.55, valAccuracy: 0.85 },
        { epoch: 30, loss: 0.4, accuracy: 0.89, valLoss: 0.35, valAccuracy: 0.91 },
        { epoch: 40, loss: 0.25, accuracy: 0.92, valLoss: 0.22, valAccuracy: 0.94 },
        { epoch: 50, loss: 0.18, accuracy: 0.94, valLoss: 0.19, valAccuracy: 0.95 },
      ],
      confusionMatrix: [
        [150, 2, 2, 1],
        [1, 149, 3, 2],
        [2, 2, 149, 2],
        [0, 1, 2, 152],
      ],
      classificationReport: [
        { className: '服装', precision: 0.98, recall: 0.97, f1Score: 0.97, support: 155 },
        { className: '电子产品', precision: 0.96, recall: 0.96, f1Score: 0.96, support: 155 },
        { className: '家居用品', precision: 0.95, recall: 0.96, f1Score: 0.96, support: 155 },
        { className: '运动器材', precision: 0.97, recall: 0.98, f1Score: 0.97, support: 155 },
      ],
      predictionSamples: [
        { input: 'Nike运动鞋', predicted: '运动器材', actual: '运动器材', confidence: 0.99 },
        { input: 'iPhone手机', predicted: '电子产品', actual: '电子产品', confidence: 0.98 },
        { input: '连衣裙', predicted: '服装', actual: '服装', confidence: 0.97 },
      ],
      modelArtifacts: {
        modelFile: 'efficientnet_model.pth',
        configFile: 'config.json',
        vocabularyFile: 'vocab.json',
      },
    },
    logs: [
      '2024-01-16 09:00:00 - 运行开始',
      '2024-01-16 09:00:05 - 数据加载完成，共10000张图像',
      '2024-01-16 09:00:10 - EfficientNet模型初始化完成',
      '2024-01-16 09:00:15 - 开始训练...',
      '2024-01-16 10:00:00 - 训练完成，最佳准确率: 94%',
    ],
    createdAt: '2024-01-16T09:00:00Z',
    updatedAt: '2024-01-16T10:00:00Z',
    startedAt: '2024-01-16T09:00:00Z',
    finishedAt: '2024-01-16T10:00:00Z',
    stats: {
      totalTime: 3600,
      gpuUsage: 78,
      memoryUsage: 10,
      iterations: 50,
    },
  },
  {
    id: 'run_1_3',
    taskId: 'task_1',
    name: '商品图像分类 - 运行3',
    description: '使用Vision Transformer模型的第三次运行',
    status: PresetRunStatus.RUNNING,
    progress: 65,
    config: {
      datasetId: 'dataset_1',
      datasetName: '商品图像数据集',
      dataSplit: {
        train: 0.7,
        validation: 0.2,
        test: 0.1,
      },
      model: 'Vision Transformer',
      mode: 'expert',
      hyperparameters: {
        epochs: 50,
        learningRate: 0.0001,
        batchSize: 16,
        optimizer: 'AdamW',
        augmentation: true,
        patchSize: 16,
      },
      resourceRequirements: {
        gpu: 'NVIDIA Tesla V100',
        memory: '32GB',
        storage: '100GB',
      },
    },
    logs: [
      '2024-01-16 14:00:00 - 运行开始',
      '2024-01-16 14:00:05 - 数据加载完成，共10000张图像',
      '2024-01-16 14:00:10 - Vision Transformer模型初始化完成',
      '2024-01-16 14:00:15 - 开始训练...',
      '2024-01-16 15:30:00 - Epoch 32/50 完成，当前准确率: 89%',
    ],
    createdAt: '2024-01-16T14:00:00Z',
    updatedAt: '2024-01-16T15:30:00Z',
    startedAt: '2024-01-16T14:00:00Z',
    stats: {
      totalTime: 5400,
      gpuUsage: 92,
      memoryUsage: 28,
      iterations: 32,
    },
  },
  {
    id: 'run_2_1',
    taskId: 'task_2',
    name: '评论情感分析 - 运行1',
    description: '使用BERT模型的情感分析运行',
    status: PresetRunStatus.COMPLETED,
    progress: 100,
    config: {
      datasetId: 'dataset_2',
      datasetName: '用户评论数据集',
      dataSplit: {
        train: 0.8,
        validation: 0.15,
        test: 0.05,
      },
      model: 'BERT',
      mode: 'expert',
      hyperparameters: {
        epochs: 10,
        learningRate: 0.00002,
        batchSize: 16,
        maxLength: 512,
        warmupSteps: 500,
      },
      resourceRequirements: {
        gpu: 'NVIDIA Tesla A100',
        memory: '32GB',
        storage: '50GB',
      },
    },
    result: {
      id: 'result_2_1',
      taskId: 'task_2',
      runId: 'run_2_1',
      bestModel: {
        name: 'BERT_sentiment',
        accuracy: 0.89,
        loss: 0.32,
        f1Score: 0.88,
        precision: 0.90,
        recall: 0.87,
      },
      trainingMetrics: [
        { epoch: 1, loss: 1.8, accuracy: 0.45, valLoss: 1.6, valAccuracy: 0.50 },
        { epoch: 3, loss: 1.2, accuracy: 0.68, valLoss: 1.0, valAccuracy: 0.72 },
        { epoch: 5, loss: 0.8, accuracy: 0.78, valLoss: 0.7, valAccuracy: 0.82 },
        { epoch: 7, loss: 0.5, accuracy: 0.85, valLoss: 0.45, valAccuracy: 0.87 },
        { epoch: 10, loss: 0.32, accuracy: 0.89, valLoss: 0.38, valAccuracy: 0.88 },
      ],
      confusionMatrix: [
        [450, 25, 25],
        [30, 440, 30],
        [20, 35, 445],
      ],
      classificationReport: [
        { className: '正面', precision: 0.90, recall: 0.90, f1Score: 0.90, support: 500 },
        { className: '中性', precision: 0.88, recall: 0.88, f1Score: 0.88, support: 500 },
        { className: '负面', precision: 0.89, recall: 0.89, f1Score: 0.89, support: 500 },
      ],
      predictionSamples: [
        { input: '这个产品太棒了！', predicted: '正面', actual: '正面', confidence: 0.95 },
        { input: '还可以吧', predicted: '中性', actual: '中性', confidence: 0.78 },
        { input: '质量很差', predicted: '负面', actual: '负面', confidence: 0.92 },
      ],
      modelArtifacts: {
        modelFile: 'bert_sentiment.pth',
        configFile: 'config.json',
        vocabularyFile: 'vocab.txt',
      },
    },
    logs: [
      '2024-01-16 10:00:00 - 运行开始',
      '2024-01-16 10:00:05 - 数据加载完成，共8000条评论',
      '2024-01-16 10:00:10 - BERT模型初始化完成',
      '2024-01-16 10:00:15 - 开始训练...',
      '2024-01-16 12:00:00 - 训练完成，最佳准确率: 89%',
    ],
    createdAt: '2024-01-16T10:00:00Z',
    updatedAt: '2024-01-16T12:00:00Z',
    startedAt: '2024-01-16T10:00:00Z',
    finishedAt: '2024-01-16T12:00:00Z',
    stats: {
      totalTime: 7200,
      gpuUsage: 88,
      memoryUsage: 24,
      iterations: 10,
    },
  },
  {
    id: 'run_2_2',
    taskId: 'task_2',
    name: '评论情感分析 - 运行2',
    description: '使用RoBERTa模型的情感分析运行',
    status: PresetRunStatus.RUNNING,
    progress: 40,
    config: {
      datasetId: 'dataset_2',
      datasetName: '用户评论数据集',
      dataSplit: {
        train: 0.8,
        validation: 0.15,
        test: 0.05,
      },
      model: 'RoBERTa',
      mode: 'expert',
      hyperparameters: {
        epochs: 10,
        learningRate: 0.00001,
        batchSize: 16,
        maxLength: 512,
        warmupSteps: 300,
      },
      resourceRequirements: {
        gpu: 'NVIDIA Tesla A100',
        memory: '32GB',
        storage: '50GB',
      },
    },
    logs: [
      '2024-01-16 12:15:00 - 运行开始',
      '2024-01-16 12:15:05 - 数据加载完成，共8000条评论',
      '2024-01-16 12:15:10 - RoBERTa模型初始化完成',
      '2024-01-16 12:15:15 - 开始训练...',
      '2024-01-16 13:45:00 - Epoch 4/10 完成，当前准确率: 85%',
    ],
    createdAt: '2024-01-16T12:15:00Z',
    updatedAt: '2024-01-16T13:45:00Z',
    startedAt: '2024-01-16T12:15:00Z',
    stats: {
      totalTime: 5400,
      gpuUsage: 90,
      memoryUsage: 28,
      iterations: 4,
    },
  },
]

// 模拟API延迟
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const mockPresetModelService = {
  // 获取模板列表
  async getTemplates() {
    await delay(300)
    return {
      success: true,
      data: mockTemplates,
    }
  },

  // 获取模板详情
  async getTemplate(id: string) {
    await delay(200)
    const template = mockTemplates.find((t) => t.id === id)
    if (!template) {
      throw new Error('Template not found')
    }
    return {
      success: true,
      data: template,
    }
  },

  // 获取任务列表
  async getTasks(filters?: {
    status?: PresetTaskStatus
    search?: string
    templateId?: string
    projectId?: string
  }) {
    await delay(400)
    let filteredTasks = [...mockTasks]

    if (filters?.status) {
      filteredTasks = filteredTasks.filter((task) => task.status === filters.status)
    }

    if (filters?.search) {
      const searchLower = filters.search.toLowerCase()
      filteredTasks = filteredTasks.filter((task) =>
        task.name.toLowerCase().includes(searchLower)
        || task.description.toLowerCase().includes(searchLower)
        || task.templateName.toLowerCase().includes(searchLower),
      )
    }

    if (filters?.templateId) {
      filteredTasks = filteredTasks.filter((task) => task.templateId === filters.templateId)
    }

    if (filters?.projectId) {
      filteredTasks = filteredTasks.filter((task) => task.projectId === filters.projectId)
    }

    return {
      success: true,
      data: filteredTasks,
    }
  },

  // 获取任务详情
  async getTask(id: string) {
    await delay(200)
    const task = mockTasks.find((t) => t.id === id)
    if (!task) {
      throw new Error('Task not found')
    }
    return {
      success: true,
      data: task,
    }
  },

  // 创建任务
  async createTask(data: {
    name: string
    description: string
    templateId: string
    projectId: string
    config: PresetModelTask['config']
    tags?: string[]
    taskType?: string // 任务类型
  }) {
    await delay(500)
    const template = mockTemplates.find((t) => t.id === data.templateId)
    if (!template) {
      throw new Error('Template not found')
    }

    const newTask: PresetModelTask = {
      id: `task_${Date.now()}`,
      name: data.name,
      description: data.description,
      templateId: data.templateId,
      templateName: template.name,
      projectId: data.projectId,
      status: PresetTaskStatus.ACTIVE,
      taskType: data.taskType, // 添加任务类型字段
      config: data.config,
      runs: {
        total: 0,
        completed: 0,
        failed: 0,
        running: 0,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'current_user',
      tags: data.tags || [],
    }

    mockTasks.push(newTask)
    message.success('任务创建成功')
    return {
      success: true,
      data: newTask,
    }
  },

  // 更新任务
  async updateTask(id: string, data: Partial<PresetModelTask>) {
    await delay(300)
    const taskIndex = mockTasks.findIndex((t) => t.id === id)
    if (taskIndex === -1) {
      throw new Error('Task not found')
    }

    mockTasks[taskIndex] = {
      ...mockTasks[taskIndex],
      ...data,
      updatedAt: new Date().toISOString(),
    }

    message.success('任务更新成功')
    return {
      success: true,
      data: mockTasks[taskIndex],
    }
  },

  // 删除任务
  async deleteTask(id: string) {
    await delay(300)
    const taskIndex = mockTasks.findIndex((t) => t.id === id)
    if (taskIndex === -1) {
      throw new Error('Task not found')
    }

    mockTasks.splice(taskIndex, 1)
    message.success('任务删除成功')
    return {
      success: true,
    }
  },

  // 启动任务
  async startTask(id: string) {
    await delay(300)
    const task = mockTasks.find((task) => task.id === id)
    if (!task) {
      throw new Error('任务不存在')
    }

    task.status = PresetTaskStatus.ACTIVE
    task.startedAt = new Date().toISOString()

    return { success: true, data: task }
  },

  // 取消任务
  async cancelTask(id: string) {
    await delay(300)
    const task = mockTasks.find((task) => task.id === id)
    if (!task) {
      throw new Error('任务不存在')
    }

    task.status = PresetTaskStatus.ARCHIVED
    task.finishedAt = new Date().toISOString()

    return { success: true, data: task }
  },

  // 重新运行任务
  async retryTask(id: string) {
    await delay(300)
    const task = mockTasks.find((task) => task.id === id)
    if (!task) {
      throw new Error('任务不存在')
    }

    task.status = PresetTaskStatus.ACTIVE
    task.startedAt = new Date().toISOString()
    task.finishedAt = undefined

    return { success: true, data: task }
  },

  // 获取任务的运行列表
  async getTaskRuns(taskId: string, filters?: {
    status?: PresetRunStatus
    search?: string
  }) {
    await delay(300)
    let filteredRuns = mockRuns.filter((run) => run.taskId === taskId)

    if (filters?.status) {
      filteredRuns = filteredRuns.filter((run) => run.status === filters.status)
    }

    if (filters?.search) {
      const searchLower = filters.search.toLowerCase()
      filteredRuns = filteredRuns.filter((run) =>
        run.name.toLowerCase().includes(searchLower)
        || (run.description && run.description.toLowerCase().includes(searchLower)),
      )
    }

    return {
      success: true,
      data: filteredRuns,
    }
  },

  // 获取运行详情
  async getRun(id: string) {
    await delay(200)
    const run = mockRuns.find((r) => r.id === id)
    if (!run) {
      throw new Error('Run not found')
    }
    return {
      success: true,
      data: run,
    }
  },

  // 创建运行
  async createRun(data: {
    taskId: string
    name: string
    description?: string
    config: PresetModelRun['config']
  }) {
    await delay(500)
    const task = mockTasks.find((t) => t.id === data.taskId)
    if (!task) {
      throw new Error('Task not found')
    }

    const newRun: PresetModelRun = {
      id: `run_${Date.now()}`,
      taskId: data.taskId,
      name: data.name,
      description: data.description,
      status: PresetRunStatus.CREATED,
      progress: 0,
      config: data.config,
      logs: [`${new Date().toISOString()} - 运行创建成功`],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    mockRuns.push(newRun)

    // 更新任务的运行统计
    const taskIndex = mockTasks.findIndex((t) => t.id === data.taskId)
    if (taskIndex !== -1) {
      mockTasks[taskIndex].runs.total += 1
      mockTasks[taskIndex].updatedAt = new Date().toISOString()
    }

    message.success('运行创建成功')
    return {
      success: true,
      data: newRun,
    }
  },

  // 启动运行
  async startRun(id: string) {
    await delay(300)
    const runIndex = mockRuns.findIndex((r) => r.id === id)
    if (runIndex === -1) {
      throw new Error('Run not found')
    }

    mockRuns[runIndex].status = PresetRunStatus.RUNNING
    mockRuns[runIndex].progress = 0
    mockRuns[runIndex].startedAt = new Date().toISOString()
    mockRuns[runIndex].updatedAt = new Date().toISOString()
    mockRuns[runIndex].logs.push(`${new Date().toISOString()} - 运行开始`)

    // 更新任务的运行统计
    const taskIndex = mockTasks.findIndex((t) => t.id === mockRuns[runIndex].taskId)
    if (taskIndex !== -1) {
      mockTasks[taskIndex].runs.running += 1
      mockTasks[taskIndex].updatedAt = new Date().toISOString()
    }

    message.success('运行启动成功')
    return {
      success: true,
      data: mockRuns[runIndex],
    }
  },

  // 停止运行
  async stopRun(id: string) {
    await delay(300)
    const runIndex = mockRuns.findIndex((r) => r.id === id)
    if (runIndex === -1) {
      throw new Error('Run not found')
    }

    mockRuns[runIndex].status = PresetRunStatus.CANCELLED
    mockRuns[runIndex].updatedAt = new Date().toISOString()
    mockRuns[runIndex].finishedAt = new Date().toISOString()
    mockRuns[runIndex].logs.push(`${new Date().toISOString()} - 运行已取消`)

    // 更新任务的运行统计
    const taskIndex = mockTasks.findIndex((t) => t.id === mockRuns[runIndex].taskId)
    if (taskIndex !== -1) {
      mockTasks[taskIndex].runs.running -= 1
      mockTasks[taskIndex].updatedAt = new Date().toISOString()
    }

    message.success('运行已停止')
    return {
      success: true,
      data: mockRuns[runIndex],
    }
  },

  // 删除运行
  async deleteRun(id: string) {
    await delay(300)
    const runIndex = mockRuns.findIndex((r) => r.id === id)
    if (runIndex === -1) {
      throw new Error('Run not found')
    }

    const run = mockRuns[runIndex]
    mockRuns.splice(runIndex, 1)

    // 更新任务的运行统计
    const taskIndex = mockTasks.findIndex((t) => t.id === run.taskId)
    if (taskIndex !== -1) {
      mockTasks[taskIndex].runs.total -= 1
      if (run.status === PresetRunStatus.RUNNING) {
        mockTasks[taskIndex].runs.running -= 1
      }
      else if (run.status === PresetRunStatus.COMPLETED) {
        mockTasks[taskIndex].runs.completed -= 1
      }
      else if (run.status === PresetRunStatus.FAILED) {
        mockTasks[taskIndex].runs.failed -= 1
      }
      mockTasks[taskIndex].updatedAt = new Date().toISOString()
    }

    message.success('运行删除成功')
    return {
      success: true,
    }
  },

  // 部署模型
  async deployModel(taskId: string, config: Record<string, unknown>) {
    await delay(500)

    // 模拟部署逻辑
    const task = mockTasks.find((t) => t.id === taskId)
    if (!task) {
      throw new Error('Task not found')
    }

    // 模拟部署配置
    const deploymentConfig = {
      ...config,
      taskId,
      deployedAt: new Date().toISOString(),
      status: 'deploying' as const,
    }

    message.success('模型部署启动成功')
    return {
      success: true,
      data: deploymentConfig,
    }
  },
}
