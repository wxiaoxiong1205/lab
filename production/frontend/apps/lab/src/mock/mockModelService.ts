// 模型管理Mock数据服务
import type {
  ApiResponse,
  CreateModelRequest,
  Model,
  ModelDetail,
  ModelFavoriteRequest,
  ModelMarketSearchParams,
  ModelSearchParams,
  ModelVersion,
  PaginatedResponse,
  UpdateModelRequest } from '../types/model'
import {
  DeploymentEnvironment,
  ModelCategory,
  ModelSource,
  ModelStatus,
  ModelType,
} from '../types/model'

// 模拟延迟
const mockDelay = (ms: number = 300) => new Promise((resolve) => setTimeout(resolve, ms))

// 模拟API调用
const mockApiCall = async <T>(data: T, success: boolean = true): Promise<ApiResponse<T>> => {
  await mockDelay()
  return {
    success,
    data,
    message: success ? 'Success' : 'Error occurred',
  }
}

// 模拟版本数据（基于实验运行记录）
const mockModelVersions: Record<string, ModelVersion[]> = {
  'model-bert-001': [
    {
      id: 'version-bert-001-2',
      model_id: 'model-bert-001',
      version: '2.0',
      version_name: 'Production Release - run-001',
      changelog: '• 基于BERT-base-lr001运行优化\n• 学习率优化至0.001\n• 准确率提升至95%\n• 支持批量推理',
      description: '基于实验run-001的最佳参数配置，在文本分类任务上表现优异',
      performance_metrics: {
        accuracy: 0.95,
        precision: 0.95,
        recall: 0.93,
        f1_score: 0.94,
        latency_ms: 45,
      },
      model_file_info: {
        size_mb: 438,
        format: 'pytorch',
        download_url: 'https://example.com/models/bert-base-run-001.pt',
        checksum: 'sha256:abc123...',
        file_count: 3,
      },
      deployment_info: {
        environment: DeploymentEnvironment.PRODUCTION,
        api_endpoint: 'https://api.example.com/models/bert-sentiment/v2.0',
        deployed_at: '2024-01-20T10:30:00Z',
        deployment_id: 'deploy-bert-001',
        status: 'running',
        replicas: 2,
        health_check_url: 'https://api.example.com/models/bert-sentiment/v2.0/health',
      },
      training_info: {
        training_duration: 1800,
        training_samples: 50000,
        validation_samples: 5000,
        epochs: 10,
        learning_rate: 0.001,
        batch_size: 32,
      },
      is_latest: true,
      is_active: true,
      tags: ['production', 'bert', 'nlp'],
      created_at: '2024-01-20T10:30:00Z',
      created_by: 'user001',
    },
    {
      id: 'version-bert-001-1',
      model_id: 'model-bert-001',
      version: '1.0',
      version_name: 'Initial Release - run-002',
      changelog: '• 基于BERT-base-lr0001运行\n• 初始学习率0.0001\n• 基础版本发布',
      description: '基于实验run-002的参数配置，作为基线模型',
      performance_metrics: {
        accuracy: 0.92,
        precision: 0.93,
        recall: 0.90,
        f1_score: 0.91,
        latency_ms: 50,
      },
      model_file_info: {
        size_mb: 438,
        format: 'pytorch',
        download_url: 'https://example.com/models/bert-base-run-002.pt',
        checksum: 'sha256:def456...',
        file_count: 3,
      },
      training_info: {
        training_duration: 2100,
        training_samples: 50000,
        validation_samples: 5000,
        epochs: 10,
        learning_rate: 0.0001,
        batch_size: 32,
      },
      is_latest: false,
      is_active: false,
      tags: ['baseline', 'bert', 'nlp'],
      created_at: '2024-01-20T11:35:00Z',
      created_by: 'user001',
    },
  ],
  'model-resnet-002': [
    {
      id: 'version-resnet-002-1',
      model_id: 'model-resnet-002',
      version: '1.0',
      version_name: 'Training Release - run-003',
      changelog: '• 基于ResNet50-bs64运行训练\n• 大批量训练提升性能\n• 支持1000类图像分类',
      description: '基于实验run-003的ResNet50模型，在图像分类任务上表现优异',
      performance_metrics: {
        accuracy: 0.88,
        precision: 0.89,
        recall: 0.85,
        f1_score: 0.87,
        latency_ms: 25,
      },
      model_file_info: {
        size_mb: 98,
        format: 'pytorch',
        download_url: 'https://example.com/models/resnet50-run-003.pth',
        checksum: 'sha256:resnet123...',
        file_count: 2,
      },
      training_info: {
        training_duration: 3600,
        training_samples: 100000,
        validation_samples: 10000,
        epochs: 50,
        learning_rate: 0.01,
        batch_size: 64,
      },
      is_latest: true,
      is_active: true,
      tags: ['computer_vision', 'resnet', 'classification'],
      created_at: '2024-01-20T14:20:00Z',
      created_by: 'user002',
    },
  ],
  'model-yolo-004': [
    {
      id: 'version-yolo-004-3',
      model_id: 'model-yolo-004',
      version: '3.0',
      version_name: 'YOLOv12-small Enhanced - run-006',
      changelog: '• 基于YOLOv12-small-finetune运行\n• mAP@0.5提升至91.2%\n• 优化推理速度\n• 支持实时检测',
      description: '基于实验run-006优化的YOLOv12-small模型，在目标检测任务上表现卓越',
      performance_metrics: {
        accuracy: 0.912,
        precision: 0.889,
        recall: 0.823,
        f1_score: 0.855,
        latency_ms: 12,
      },
      model_file_info: {
        size_mb: 43,
        format: 'pytorch',
        download_url: 'https://example.com/models/yolov12s-run-006.pt',
        checksum: 'sha256:yolo123...',
        file_count: 2,
      },
      training_info: {
        training_duration: 8100,
        training_samples: 80000,
        validation_samples: 8000,
        epochs: 100,
        learning_rate: 0.0005,
        batch_size: 8,
      },
      is_latest: true,
      is_active: true,
      tags: ['object_detection', 'yolov12', 'real_time'],
      created_at: '2024-01-29T16:15:00Z',
      created_by: 'user003',
    },
    {
      id: 'version-yolo-004-2',
      model_id: 'model-yolo-004',
      version: '2.0',
      version_name: 'YOLOv12-nano Baseline - run-005',
      changelog: '• 基于YOLOv12-coco-pretrain运行\n• COCO预训练基础模型\n• 轻量化设计',
      description: '基于实验run-005的YOLOv12-nano模型，轻量级目标检测解决方案',
      performance_metrics: {
        accuracy: 0.887,
        precision: 0.851,
        recall: 0.794,
        f1_score: 0.821,
        latency_ms: 8,
      },
      model_file_info: {
        size_mb: 12,
        format: 'pytorch',
        download_url: 'https://example.com/models/yolov12n-run-005.pt',
        checksum: 'sha256:yolo456...',
        file_count: 2,
      },
      training_info: {
        training_duration: 5400,
        training_samples: 80000,
        validation_samples: 8000,
        epochs: 300,
        learning_rate: 0.001,
        batch_size: 16,
      },
      is_latest: false,
      is_active: false,
      tags: ['object_detection', 'yolov12', 'lightweight'],
      created_at: '2024-01-28T11:30:00Z',
      created_by: 'user003',
    },
  ],
  'model-qwen-005': [
    {
      id: 'version-qwen-005-3',
      model_id: 'model-qwen-005',
      version: '3.0',
      version_name: 'DPO Aligned - run-009',
      changelog: '• 基于Qwen3-7B-dpo-align运行\n• DPO偏好对齐优化\n• 人类评估分数89.1%\n• 降低有害性输出',
      description: '基于实验run-009的DPO对齐版本，在对话安全性和质量上显著提升',
      performance_metrics: {
        rouge: 0.782,
        bleu: 0.467,
        f1_score: 0.908,
        accuracy: 0.891,
        latency_ms: 2500,
      },
      model_file_info: {
        size_mb: 14080,
        format: 'pytorch',
        download_url: 'https://example.com/models/qwen3-7b-dpo-run-009.bin',
        checksum: 'sha256:qwen123...',
        file_count: 8,
      },
      training_info: {
        training_duration: 19800,
        training_samples: 50000,
        validation_samples: 5000,
        epochs: 1,
        learning_rate: 5e-6,
        batch_size: 2,
      },
      is_latest: true,
      is_active: true,
      tags: ['llm', 'qwen3', 'dpo', 'alignment'],
      created_at: '2024-01-31T15:30:00Z',
      created_by: 'user004',
    },
    {
      id: 'version-qwen-005-2',
      model_id: 'model-qwen-005',
      version: '2.0',
      version_name: 'SFT Tuned - run-008',
      changelog: '• 基于Qwen3-7B-sft-v1运行\n• 指令微调优化\n• LoRA高效训练\n• ROUGE-L达75.8%',
      description: '基于实验run-008的指令微调版本，在指令遵循能力上显著提升',
      performance_metrics: {
        rouge: 0.758,
        bleu: 0.432,
        f1_score: 0.891,
        accuracy: 0.823,
        latency_ms: 2200,
      },
      model_file_info: {
        size_mb: 14080,
        format: 'pytorch',
        download_url: 'https://example.com/models/qwen3-7b-sft-run-008.bin',
        checksum: 'sha256:qwen456...',
        file_count: 6,
      },
      training_info: {
        training_duration: 14400,
        training_samples: 100000,
        validation_samples: 10000,
        epochs: 3,
        learning_rate: 2e-5,
        batch_size: 4,
      },
      is_latest: false,
      is_active: false,
      tags: ['llm', 'qwen3', 'sft', 'instruction'],
      created_at: '2024-01-30T12:00:00Z',
      created_by: 'user004',
    },
  ],
}

// 模拟我的模型数据（基于实验数据构建）
const mockMyModels: Model[] = [
  {
    id: 'model-bert-001',
    name: 'BERT文本分类优化模型',
    display_name: 'BERT Text Classification v2.0',
    description: '基于BERT-base-uncased的文本分类模型参数调优实验产出，在电商评论情感分析任务上准确率达95%',
    project_id: '33',
    category: ModelCategory.TEXT_PROCESSING,
    type: ModelType.SENTIMENT_ANALYSIS,
    source: ModelSource.EXPERIMENT,
    source_info: {
      experiment_name: 'BERT文本分类优化',
      experiment_id: 'exp-001',
      run_name: 'BERT-base-lr001',
      run_id: 'run-001',
    },
    current_version: '2.0',
    latest_version: '2.0',
    status: ModelStatus.PRODUCTION,
    performance_metrics: {
      accuracy: 0.95,
      precision: 0.95,
      recall: 0.93,
      f1_score: 0.94,
      loss: 0.12,
      latency_ms: 45,
    },
    resource_requirements: {
      gpu_type: 'V100',
      gpu_memory_gb: 8,
      memory_gb: 16,
      storage_gb: 2,
      cpu_cores: 4,
      min_batch_size: 1,
      max_batch_size: 32,
    },
    tags: ['NLP', 'BERT', '文本分类', '情感分析', '电商'],
    is_favorite: true,
    is_public: false,
    usage_stats: {
      total_calls: 15420,
      calls_today: 234,
      calls_this_week: 1876,
      calls_this_month: 7523,
      avg_response_time: 45,
      success_rate: 99.2,
      error_rate: 0.8,
      last_used_at: '2024-03-15T14:30:00Z',
    },
    rating: {
      average_rating: 4.7,
      rating_count: 23,
      five_star: 16,
      four_star: 5,
      three_star: 2,
      two_star: 0,
      one_star: 0,
    },
    framework: 'pytorch',
    license: 'MIT',
    author: 'user001',
    created_at: '2024-01-20T10:30:00Z',
    updated_at: '2024-01-20T10:30:00Z',
    created_by: 'user001',
  },
  {
    id: 'model-resnet-002',
    name: 'ResNet50图像分类模型',
    display_name: 'ResNet50 Image Classification',
    description: 'ResNet50图像分类模型训练实验产出，在ImageNet数据集上表现优异，支持1000类物体识别',
    project_id: '33',
    category: ModelCategory.IMAGE_PROCESSING,
    type: ModelType.IMAGE_CLASSIFICATION,
    source: ModelSource.EXPERIMENT,
    source_info: {
      experiment_name: 'ResNet图像分类',
      experiment_id: 'exp-002',
      run_name: 'ResNet50-bs64',
      run_id: 'run-003',
    },
    current_version: '1.0',
    latest_version: '1.0',
    status: ModelStatus.TESTING,
    performance_metrics: {
      accuracy: 0.88,
      precision: 0.89,
      recall: 0.85,
      f1_score: 0.87,
      loss: 0.35,
      latency_ms: 25,
    },
    resource_requirements: {
      gpu_type: 'A100',
      gpu_memory_gb: 12,
      memory_gb: 32,
      storage_gb: 4,
      cpu_cores: 8,
      min_batch_size: 1,
      max_batch_size: 64,
    },
    tags: ['CV', 'ResNet', '图像分类', 'ImageNet'],
    is_favorite: false,
    is_public: true,
    usage_stats: {
      total_calls: 8934,
      calls_today: 156,
      calls_this_week: 1023,
      calls_this_month: 4562,
      avg_response_time: 25,
      success_rate: 98.7,
      error_rate: 1.3,
      last_used_at: '2024-03-14T09:15:00Z',
    },
    rating: {
      average_rating: 4.3,
      rating_count: 18,
      five_star: 10,
      four_star: 6,
      three_star: 2,
      two_star: 0,
      one_star: 0,
    },
    framework: 'pytorch',
    license: 'Apache-2.0',
    author: 'user002',
    created_at: '2024-01-20T14:20:00Z',
    updated_at: '2024-01-20T14:20:00Z',
    created_by: 'user002',
  },
  {
    id: 'model-gpt2-003',
    name: 'GPT-2中文文本生成模型',
    display_name: 'GPT-2 Chinese Text Generation',
    description: 'GPT-2模型用于中文文本生成的微调实验产出，专注于高质量中文内容生成',
    project_id: '33',
    category: ModelCategory.TEXT_PROCESSING,
    type: ModelType.TEXT_GENERATION,
    source: ModelSource.EXPERIMENT,
    source_info: {
      experiment_name: 'GPT-2文本生成',
      experiment_id: 'exp-003',
      run_name: 'GPT2-finetune-v1',
      run_id: 'run-004',
    },
    current_version: '1.0',
    latest_version: '1.0',
    status: ModelStatus.ARCHIVED,
    performance_metrics: {
      loss: 2.1,
      latency_ms: 180,
    },
    resource_requirements: {
      gpu_type: 'V100',
      gpu_memory_gb: 16,
      memory_gb: 32,
      storage_gb: 8,
      cpu_cores: 8,
      min_batch_size: 1,
      max_batch_size: 16,
    },
    tags: ['NLP', 'GPT-2', '文本生成', '中文'],
    is_favorite: false,
    is_public: false,
    usage_stats: {
      total_calls: 1256,
      calls_today: 0,
      calls_this_week: 12,
      calls_this_month: 89,
      avg_response_time: 180,
      success_rate: 89.2,
      error_rate: 10.8,
      last_used_at: '2024-02-15T16:45:00Z',
    },
    rating: {
      average_rating: 3.8,
      rating_count: 8,
      five_star: 3,
      four_star: 2,
      three_star: 2,
      two_star: 1,
      one_star: 0,
    },
    framework: 'pytorch',
    license: 'MIT',
    author: 'user001',
    created_at: '2024-01-15T09:45:00Z',
    updated_at: '2024-01-15T09:45:00Z',
    created_by: 'user001',
  },
  {
    id: 'model-yolo-004',
    name: 'YOLOv12目标检测优化模型',
    display_name: 'YOLOv12 Object Detection Enhanced',
    description: 'YOLOv12模型在自定义数据集上的目标检测性能优化实验产出，mAP@0.5达到91.2%，支持实时检测',
    project_id: '33',
    category: ModelCategory.IMAGE_PROCESSING,
    type: ModelType.OBJECT_DETECTION,
    source: ModelSource.EXPERIMENT,
    source_info: {
      experiment_name: 'YOLOv12目标检测优化',
      experiment_id: 'exp-004',
      run_name: 'YOLOv12-small-finetune',
      run_id: 'run-006',
    },
    current_version: '3.0',
    latest_version: '3.0',
    status: ModelStatus.PRODUCTION,
    performance_metrics: {
      accuracy: 0.912,
      precision: 0.889,
      recall: 0.823,
      f1_score: 0.855,
      latency_ms: 12,
    },
    resource_requirements: {
      gpu_type: 'A100',
      gpu_memory_gb: 8,
      memory_gb: 16,
      storage_gb: 2,
      cpu_cores: 4,
      min_batch_size: 1,
      max_batch_size: 32,
    },
    tags: ['CV', 'YOLO', '目标检测', '实时检测', 'YOLOv12'],
    is_favorite: true,
    is_public: true,
    usage_stats: {
      total_calls: 12456,
      calls_today: 345,
      calls_this_week: 2134,
      calls_this_month: 8934,
      avg_response_time: 12,
      success_rate: 99.8,
      error_rate: 0.2,
      last_used_at: '2024-03-15T16:30:00Z',
    },
    rating: {
      average_rating: 4.9,
      rating_count: 45,
      five_star: 42,
      four_star: 2,
      three_star: 1,
      two_star: 0,
      one_star: 0,
    },
    framework: 'pytorch',
    license: 'GPL-3.0',
    author: 'user003',
    created_at: '2024-01-29T16:15:00Z',
    updated_at: '2024-01-29T16:15:00Z',
    created_by: 'user003',
  },
  {
    id: 'model-qwen-005',
    name: 'Qwen3大模型微调版本',
    display_name: 'Qwen3-7B Fine-tuned Model',
    description: 'Qwen3-7B在领域专用数据上的指令微调和对齐优化实验产出，支持高质量对话和指令遵循',
    project_id: '33',
    category: ModelCategory.TEXT_PROCESSING,
    type: ModelType.TEXT_GENERATION,
    source: ModelSource.EXPERIMENT,
    source_info: {
      experiment_name: 'Qwen3大模型微调',
      experiment_id: 'exp-005',
      run_name: 'Qwen3-7B-dpo-align',
      run_id: 'run-009',
    },
    current_version: '3.0',
    latest_version: '3.0',
    status: ModelStatus.PRODUCTION,
    performance_metrics: {
      rouge: 0.782,
      bleu: 0.467,
      f1_score: 0.908,
      accuracy: 0.891,
      latency_ms: 2500,
    },
    resource_requirements: {
      gpu_type: 'A100',
      gpu_memory_gb: 40,
      memory_gb: 64,
      storage_gb: 20,
      cpu_cores: 16,
      min_batch_size: 1,
      max_batch_size: 8,
    },
    tags: ['LLM', 'Qwen3', '指令微调', '对话系统', 'DPO'],
    is_favorite: true,
    is_public: false,
    usage_stats: {
      total_calls: 5678,
      calls_today: 123,
      calls_this_week: 789,
      calls_this_month: 3456,
      avg_response_time: 2500,
      success_rate: 97.8,
      error_rate: 2.2,
      last_used_at: '2024-03-15T18:45:00Z',
    },
    rating: {
      average_rating: 4.8,
      rating_count: 32,
      five_star: 28,
      four_star: 3,
      three_star: 1,
      two_star: 0,
      one_star: 0,
    },
    framework: 'pytorch',
    license: 'Custom',
    author: 'user004',
    created_at: '2024-01-31T15:30:00Z',
    updated_at: '2024-01-31T15:30:00Z',
    created_by: 'user004',
  },
  // 为datasense项目添加模型数据
  {
    id: 'model-datasense-001',
    name: 'Transformer情感分析模型',
    display_name: 'Transformer Sentiment Analysis',
    description: '基于Transformer的情感分析模型优化实验产出，专门用于社交媒体文本情感分类，F1-Score达94%',
    project_id: 'datasense',
    category: ModelCategory.TEXT_PROCESSING,
    type: ModelType.SENTIMENT_ANALYSIS,
    source: ModelSource.EXPERIMENT,
    source_info: {
      experiment_name: 'Transformer情感分析模型',
      experiment_id: 'exp-datasense-001',
      run_name: 'transformer-sentiment-best',
      run_id: 'run-datasense-001',
    },
    current_version: '1.0',
    latest_version: '1.0',
    status: ModelStatus.PRODUCTION,
    performance_metrics: {
      accuracy: 0.94,
      precision: 0.95,
      recall: 0.93,
      f1_score: 0.94,
      latency_ms: 35,
    },
    resource_requirements: {
      gpu_type: 'RTX3080',
      gpu_memory_gb: 10,
      memory_gb: 16,
      storage_gb: 3,
      cpu_cores: 6,
      min_batch_size: 1,
      max_batch_size: 64,
    },
    tags: ['NLP', '情感分析', 'Transformer', '社交媒体'],
    is_favorite: true,
    is_public: false,
    usage_stats: {
      total_calls: 9876,
      calls_today: 198,
      calls_this_week: 1234,
      calls_this_month: 5432,
      avg_response_time: 35,
      success_rate: 98.9,
      error_rate: 1.1,
      last_used_at: '2024-03-15T12:20:00Z',
    },
    rating: {
      average_rating: 4.6,
      rating_count: 25,
      five_star: 19,
      four_star: 4,
      three_star: 2,
      two_star: 0,
      one_star: 0,
    },
    framework: 'pytorch',
    license: 'MIT',
    author: 'datasense_user',
    created_at: '2024-02-05T14:30:00Z',
    updated_at: '2024-02-05T14:30:00Z',
    created_by: 'datasense_user',
  },
  {
    id: 'model-datasense-002',
    name: 'CNN医疗影像诊断模型',
    display_name: 'CNN Medical Image Diagnosis',
    description: '卷积神经网络在医疗影像诊断中的应用研究产出，在X光、CT等影像诊断上准确率达96%',
    project_id: 'datasense',
    category: ModelCategory.IMAGE_PROCESSING,
    type: ModelType.IMAGE_CLASSIFICATION,
    source: ModelSource.EXPERIMENT,
    source_info: {
      experiment_name: 'CNN图像识别模型',
      experiment_id: 'exp-datasense-002',
      run_name: 'cnn-medical-best',
      run_id: 'run-datasense-002',
    },
    current_version: '1.0',
    latest_version: '1.0',
    status: ModelStatus.PRODUCTION,
    performance_metrics: {
      accuracy: 0.96,
      precision: 0.97,
      recall: 0.95,
      f1_score: 0.96,
      latency_ms: 45,
    },
    resource_requirements: {
      gpu_type: 'A100',
      gpu_memory_gb: 16,
      memory_gb: 32,
      storage_gb: 8,
      cpu_cores: 8,
      min_batch_size: 1,
      max_batch_size: 32,
    },
    tags: ['CV', 'CNN', '医疗影像', '诊断'],
    is_favorite: true,
    is_public: false,
    usage_stats: {
      total_calls: 3456,
      calls_today: 67,
      calls_this_week: 456,
      calls_this_month: 1789,
      avg_response_time: 45,
      success_rate: 99.5,
      error_rate: 0.5,
      last_used_at: '2024-03-15T10:15:00Z',
    },
    rating: {
      average_rating: 4.9,
      rating_count: 18,
      five_star: 17,
      four_star: 1,
      three_star: 0,
      two_star: 0,
      one_star: 0,
    },
    framework: 'tensorflow',
    license: 'Academic',
    author: 'datasense_user',
    created_at: '2024-02-03T16:45:00Z',
    updated_at: '2024-02-03T16:45:00Z',
    created_by: 'datasense_user',
  },
  {
    id: 'model-datasense-003',
    name: 'LSTM股票价格预测模型',
    display_name: 'LSTM Stock Price Prediction',
    description: '长短期记忆网络在股票价格预测中的应用与优化实验产出，在时序预测任务上MSE达0.82',
    project_id: 'datasense',
    category: ModelCategory.OTHER,
    type: ModelType.TIME_SERIES,
    source: ModelSource.EXPERIMENT,
    source_info: {
      experiment_name: 'LSTM时序预测模型',
      experiment_id: 'exp-datasense-003',
      run_name: 'lstm-stock-prediction',
      run_id: 'run-datasense-003',
    },
    current_version: '1.0',
    latest_version: '1.0',
    status: ModelStatus.TESTING,
    performance_metrics: {
      mse: 0.82,
      mae: 0.67,
      latency_ms: 15,
    },
    resource_requirements: {
      gpu_type: 'RTX3070',
      gpu_memory_gb: 8,
      memory_gb: 16,
      storage_gb: 4,
      cpu_cores: 4,
      min_batch_size: 1,
      max_batch_size: 128,
    },
    tags: ['时序预测', 'LSTM', '金融', '股票'],
    is_favorite: false,
    is_public: false,
    usage_stats: {
      total_calls: 2345,
      calls_today: 34,
      calls_this_week: 234,
      calls_this_month: 1123,
      avg_response_time: 15,
      success_rate: 96.8,
      error_rate: 3.2,
      last_used_at: '2024-03-14T14:20:00Z',
    },
    rating: {
      average_rating: 4.2,
      rating_count: 12,
      five_star: 7,
      four_star: 4,
      three_star: 1,
      two_star: 0,
      one_star: 0,
    },
    framework: 'pytorch',
    license: 'MIT',
    author: 'datasense_user',
    created_at: '2024-02-06T11:10:00Z',
    updated_at: '2024-02-06T11:10:00Z',
    created_by: 'datasense_user',
  },
  {
    id: 'model-datasense-005',
    name: 'BERT智能问答系统模型',
    display_name: 'BERT QA System',
    description: 'BERT模型在智能问答系统中的性能优化和部署研究产出，在问答任务上EM-Score达91%',
    project_id: 'datasense',
    category: ModelCategory.TEXT_PROCESSING,
    type: ModelType.QUESTION_ANSWERING,
    source: ModelSource.EXPERIMENT,
    source_info: {
      experiment_name: 'BERT问答系统优化',
      experiment_id: 'exp-datasense-005',
      run_name: 'bert-qa-optimized',
      run_id: 'run-datasense-005',
    },
    current_version: '1.0',
    latest_version: '1.0',
    status: ModelStatus.PRODUCTION,
    performance_metrics: {
      f1_score: 0.94,
      accuracy: 0.89,
      latency_ms: 65,
    },
    resource_requirements: {
      gpu_type: 'V100',
      gpu_memory_gb: 12,
      memory_gb: 24,
      storage_gb: 5,
      cpu_cores: 6,
      min_batch_size: 1,
      max_batch_size: 16,
    },
    tags: ['BERT', '问答系统', 'NLP', '智能客服'],
    is_favorite: true,
    is_public: false,
    usage_stats: {
      total_calls: 7890,
      calls_today: 145,
      calls_this_week: 987,
      calls_this_month: 4321,
      avg_response_time: 65,
      success_rate: 98.3,
      error_rate: 1.7,
      last_used_at: '2024-03-15T09:20:00Z',
    },
    rating: {
      average_rating: 4.7,
      rating_count: 28,
      five_star: 22,
      four_star: 5,
      three_star: 1,
      two_star: 0,
      one_star: 0,
    },
    framework: 'pytorch',
    license: 'MIT',
    author: 'datasense_user',
    created_at: '2024-02-07T09:20:00Z',
    updated_at: '2024-02-07T09:20:00Z',
    created_by: 'datasense_user',
  },
]

// 模拟预置模型数据（模型市场）
const mockPresetModels: Model[] = [
  {
    id: 'model-101',
    name: 'YOLOv8目标检测',
    display_name: 'YOLOv8 Object Detection',
    description: '最新版本YOLOv8目标检测模型，支持实时检测80类常见物体，精度和速度双优',
    project_id: 'preset',
    category: ModelCategory.IMAGE_PROCESSING,
    type: ModelType.OBJECT_DETECTION,
    source: ModelSource.PRESET,
    current_version: '8.0',
    latest_version: '8.0',
    status: ModelStatus.PRODUCTION,
    performance_metrics: {
      accuracy: 0.92,
      precision: 0.90,
      recall: 0.94,
      f1_score: 0.92,
      latency_ms: 15,
    },
    resource_requirements: {
      gpu_type: 'RTX3070',
      gpu_memory_gb: 6,
      memory_gb: 8,
      storage_gb: 1,
      cpu_cores: 4,
      min_batch_size: 1,
      max_batch_size: 32,
    },
    tags: ['目标检测', 'YOLO', '实时检测', '预置模型'],
    is_favorite: false,
    is_public: true,
    usage_stats: {
      total_calls: 45678,
      calls_today: 567,
      calls_this_week: 3456,
      calls_this_month: 15234,
      avg_response_time: 15,
      success_rate: 99.5,
      error_rate: 0.5,
      last_used_at: '2024-03-15T16:45:00Z',
    },
    rating: {
      average_rating: 4.8,
      rating_count: 156,
      five_star: 120,
      four_star: 28,
      three_star: 6,
      two_star: 2,
      one_star: 0,
    },
    framework: 'pytorch',
    license: 'GPL-3.0',
    author: 'Ultralytics',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-03-01T12:00:00Z',
    created_by: 'admin',
  },
  {
    id: 'model-102',
    name: 'BERT-base-chinese',
    display_name: 'BERT Base Chinese',
    description: 'Google官方发布的中文BERT预训练模型，适用于各种中文NLP任务的基础模型',
    project_id: 'preset',
    category: ModelCategory.TEXT_PROCESSING,
    type: ModelType.TEXT_CLASSIFICATION,
    source: ModelSource.PRESET,
    current_version: '1.0',
    latest_version: '1.0',
    status: ModelStatus.PRODUCTION,
    performance_metrics: {
      accuracy: 0.88,
      precision: 0.87,
      recall: 0.89,
      f1_score: 0.88,
      latency_ms: 80,
    },
    resource_requirements: {
      gpu_type: 'V100',
      gpu_memory_gb: 8,
      memory_gb: 16,
      storage_gb: 2,
      cpu_cores: 4,
      min_batch_size: 1,
      max_batch_size: 32,
    },
    tags: ['BERT', '中文', 'NLP', '预训练', '预置模型'],
    is_favorite: true,
    is_public: true,
    usage_stats: {
      total_calls: 89012,
      calls_today: 892,
      calls_this_week: 5467,
      calls_this_month: 23456,
      avg_response_time: 80,
      success_rate: 98.9,
      error_rate: 1.1,
      last_used_at: '2024-03-15T17:30:00Z',
    },
    rating: {
      average_rating: 4.6,
      rating_count: 234,
      five_star: 189,
      four_star: 32,
      three_star: 10,
      two_star: 2,
      one_star: 1,
    },
    framework: 'tensorflow',
    license: 'Apache-2.0',
    author: 'Google',
    created_at: '2023-12-01T00:00:00Z',
    updated_at: '2023-12-01T00:00:00Z',
    created_by: 'admin',
  },
  {
    id: 'model-103',
    name: 'Whisper语音识别',
    display_name: 'Whisper Speech Recognition',
    description: 'OpenAI开源的多语言语音识别模型，支持99种语言的语音转文字，准确率极高',
    project_id: 'preset',
    category: ModelCategory.AUDIO_PROCESSING,
    type: ModelType.SPEECH_RECOGNITION,
    source: ModelSource.PRESET,
    current_version: '2.0',
    latest_version: '2.0',
    status: ModelStatus.PRODUCTION,
    performance_metrics: {
      accuracy: 0.96,
      latency_ms: 200,
    },
    resource_requirements: {
      gpu_type: 'RTX3080',
      gpu_memory_gb: 8,
      memory_gb: 16,
      storage_gb: 3,
      cpu_cores: 6,
      min_batch_size: 1,
      max_batch_size: 16,
    },
    tags: ['语音识别', 'Whisper', '多语言', 'OpenAI', '预置模型'],
    is_favorite: false,
    is_public: true,
    usage_stats: {
      total_calls: 34567,
      calls_today: 345,
      calls_this_week: 2134,
      calls_this_month: 9876,
      avg_response_time: 200,
      success_rate: 97.8,
      error_rate: 2.2,
      last_used_at: '2024-03-15T15:20:00Z',
    },
    rating: {
      average_rating: 4.7,
      rating_count: 89,
      five_star: 71,
      four_star: 14,
      three_star: 3,
      two_star: 1,
      one_star: 0,
    },
    framework: 'pytorch',
    license: 'MIT',
    author: 'OpenAI',
    created_at: '2023-11-15T00:00:00Z',
    updated_at: '2024-01-20T10:00:00Z',
    created_by: 'admin',
  },
  {
    id: 'model-104',
    name: 'CLIP多模态模型',
    display_name: 'CLIP Multimodal Model',
    description: 'OpenAI的CLIP模型，能够理解图像和文本的关联，支持图像分类、图像搜索等多模态任务',
    project_id: 'preset',
    category: ModelCategory.MULTIMODAL,
    type: ModelType.IMAGE_CAPTIONING,
    source: ModelSource.PRESET,
    current_version: '1.0',
    latest_version: '1.0',
    status: ModelStatus.PRODUCTION,
    performance_metrics: {
      accuracy: 0.89,
      latency_ms: 120,
    },
    resource_requirements: {
      gpu_type: 'A100',
      gpu_memory_gb: 20,
      memory_gb: 32,
      storage_gb: 5,
      cpu_cores: 8,
      min_batch_size: 1,
      max_batch_size: 64,
    },
    tags: ['多模态', 'CLIP', '图像理解', 'OpenAI', '预置模型'],
    is_favorite: false,
    is_public: true,
    usage_stats: {
      total_calls: 23456,
      calls_today: 234,
      calls_this_week: 1567,
      calls_this_month: 6789,
      avg_response_time: 120,
      success_rate: 98.2,
      error_rate: 1.8,
      last_used_at: '2024-03-15T13:10:00Z',
    },
    rating: {
      average_rating: 4.4,
      rating_count: 67,
      five_star: 45,
      four_star: 16,
      three_star: 5,
      two_star: 1,
      one_star: 0,
    },
    framework: 'pytorch',
    license: 'MIT',
    author: 'OpenAI',
    created_at: '2023-10-01T00:00:00Z',
    updated_at: '2023-10-01T00:00:00Z',
    created_by: 'admin',
  },
]

// 合并所有模型数据
const allModels = [...mockMyModels, ...mockPresetModels]

const mockModelService = {
  // 获取我的模型列表
  async getMyModels(projectId: string, params: ModelSearchParams = {}): Promise<ApiResponse<PaginatedResponse<Model>>> {
    const {
      page = 1,
      page_size = 20,
      search = '',
      category = [],
      status = [],
      framework = [],
      sort_by = 'created_at',
      sort_order = 'desc',
    } = params

    let filteredModels = mockMyModels.filter((model) => model.project_id === projectId)

    // 搜索过滤
    if (search) {
      const searchLower = search.toLowerCase()
      filteredModels = filteredModels.filter((model) =>
        model.name.toLowerCase().includes(searchLower)
        || model.description?.toLowerCase().includes(searchLower)
        || model.tags.some((tag) => tag.toLowerCase().includes(searchLower)),
      )
    }

    // 分类过滤
    if (category.length > 0) {
      filteredModels = filteredModels.filter((model) => category.includes(model.category))
    }

    // 状态过滤
    if (status.length > 0) {
      filteredModels = filteredModels.filter((model) => status.includes(model.status))
    }

    // 框架过滤
    if (framework.length > 0) {
      filteredModels = filteredModels.filter((model) => framework.includes(model.framework))
    }

    // 排序
    filteredModels.sort((a, b) => {
      let aValue: unknown
      let bValue: unknown

      switch (sort_by) {
        case 'name':
          aValue = a.name
          bValue = b.name
          break
        case 'rating':
          aValue = a.rating.average_rating
          bValue = b.rating.average_rating
          break
        case 'usage_count':
          aValue = a.usage_stats.total_calls
          bValue = b.usage_stats.total_calls
          break
        case 'updated_at':
          aValue = new Date(a.updated_at)
          bValue = new Date(b.updated_at)
          break
        default:
          aValue = new Date(a.created_at)
          bValue = new Date(b.created_at)
      }

      if (aValue < bValue) return sort_order === 'asc' ? -1 : 1
      if (aValue > bValue) return sort_order === 'asc' ? 1 : -1
      return 0
    })

    // 分页
    const startIndex = (page - 1) * page_size
    const endIndex = startIndex + page_size
    const paginatedModels = filteredModels.slice(startIndex, endIndex)

    const response: PaginatedResponse<Model> = {
      items: paginatedModels,
      total: filteredModels.length,
      page,
      page_size,
      pages: Math.ceil(filteredModels.length / page_size),
    }

    return mockApiCall(response)
  },

  // 获取模型市场列表
  async getMarketModels(params: ModelMarketSearchParams = {}): Promise<ApiResponse<PaginatedResponse<Model>>> {
    const {
      page = 1,
      page_size = 20,
      search = '',
      category = [],
      framework = [],
      sort_by = 'created_at',
      sort_order = 'desc',
    } = params

    let filteredModels = mockPresetModels

    // 搜索过滤
    if (search) {
      const searchLower = search.toLowerCase()
      filteredModels = filteredModels.filter((model) =>
        model.name.toLowerCase().includes(searchLower)
        || model.description?.toLowerCase().includes(searchLower)
        || model.tags.some((tag) => tag.toLowerCase().includes(searchLower)),
      )
    }

    // 分类过滤
    if (category.length > 0) {
      filteredModels = filteredModels.filter((model) => category.includes(model.category))
    }

    // 框架过滤
    if (framework.length > 0) {
      filteredModels = filteredModels.filter((model) => framework.includes(model.framework))
    }

    // 排序
    filteredModels.sort((a, b) => {
      let aValue: unknown
      let bValue: unknown

      switch (sort_by) {
        case 'name':
          aValue = a.name
          bValue = b.name
          break
        case 'rating':
          aValue = a.rating.average_rating
          bValue = b.rating.average_rating
          break
        case 'usage_count':
          aValue = a.usage_stats.total_calls
          bValue = b.usage_stats.total_calls
          break
        case 'updated_at':
          aValue = new Date(a.updated_at)
          bValue = new Date(b.updated_at)
          break
        default:
          aValue = new Date(a.created_at)
          bValue = new Date(b.created_at)
      }

      if (aValue < bValue) return sort_order === 'asc' ? -1 : 1
      if (aValue > bValue) return sort_order === 'asc' ? 1 : -1
      return 0
    })

    // 分页
    const startIndex = (page - 1) * page_size
    const endIndex = startIndex + page_size
    const paginatedModels = filteredModels.slice(startIndex, endIndex)

    const response: PaginatedResponse<Model> = {
      items: paginatedModels,
      total: filteredModels.length,
      page,
      page_size,
      pages: Math.ceil(filteredModels.length / page_size),
    }

    return mockApiCall(response)
  },

  // 获取收藏模型列表
  async getFavoriteModels(projectId: string, params: ModelSearchParams = {}): Promise<ApiResponse<PaginatedResponse<Model>>> {
    const {
      page = 1,
      page_size = 20,
      search = '',
      category = [],
      status = [],
      framework = [],
      sort_by = 'created_at',
      sort_order = 'desc',
    } = params

    let filteredModels = allModels.filter((model) =>
      model.is_favorite && (model.project_id === projectId || model.is_public),
    )

    // 搜索过滤
    if (search) {
      const searchLower = search.toLowerCase()
      filteredModels = filteredModels.filter((model) =>
        model.name.toLowerCase().includes(searchLower)
        || model.description?.toLowerCase().includes(searchLower)
        || model.tags.some((tag) => tag.toLowerCase().includes(searchLower)),
      )
    }

    // 分类过滤
    if (category.length > 0) {
      filteredModels = filteredModels.filter((model) => category.includes(model.category))
    }

    // 状态过滤
    if (status.length > 0) {
      filteredModels = filteredModels.filter((model) => status.includes(model.status))
    }

    // 框架过滤
    if (framework.length > 0) {
      filteredModels = filteredModels.filter((model) => framework.includes(model.framework))
    }

    // 排序
    filteredModels.sort((a, b) => {
      let aValue: unknown
      let bValue: unknown

      switch (sort_by) {
        case 'name':
          aValue = a.name
          bValue = b.name
          break
        case 'rating':
          aValue = a.rating.average_rating
          bValue = b.rating.average_rating
          break
        case 'usage_count':
          aValue = a.usage_stats.total_calls
          bValue = b.usage_stats.total_calls
          break
        case 'updated_at':
          aValue = new Date(a.updated_at)
          bValue = new Date(b.updated_at)
          break
        default:
          aValue = new Date(a.created_at)
          bValue = new Date(b.created_at)
      }

      if (aValue < bValue) return sort_order === 'asc' ? -1 : 1
      if (aValue > bValue) return sort_order === 'asc' ? 1 : -1
      return 0
    })

    // 分页
    const startIndex = (page - 1) * page_size
    const endIndex = startIndex + page_size
    const paginatedModels = filteredModels.slice(startIndex, endIndex)

    const response: PaginatedResponse<Model> = {
      items: paginatedModels,
      total: filteredModels.length,
      page,
      page_size,
      pages: Math.ceil(filteredModels.length / page_size),
    }

    return mockApiCall(response)
  },

  // 获取单个模型详情
  async getModel(modelId: string): Promise<ApiResponse<ModelDetail>> {
    const model = allModels.find((m) => m.id === modelId)
    if (!model) {
      return mockApiCall(null as unknown as ModelDetail, false)
    }

    // 获取对应的版本数据
    const versions = mockModelVersions[modelId] || []

    const detail: ModelDetail = {
      ...model,
      versions,
      total_versions: versions.length,
      deployment_count: versions.filter((v) => v.deployment_info?.status === 'running').length,
      fork_count: Math.floor(Math.random() * 20) + 1,
      related_models: allModels.filter((m) => m.id !== modelId && m.category === model.category).slice(0, 3),
    }

    return mockApiCall(detail)
  },

  // 创建模型
  async createModel(projectId: string, data: CreateModelRequest): Promise<ApiResponse<Model>> {
    const newModel: Model = {
      id: `model-${Date.now()}`,
      name: data.name,
      display_name: data.display_name,
      description: data.description,
      project_id: projectId,
      category: data.category,
      type: data.type,
      source: data.source,
      source_info: data.source_info,
      current_version: '1.0',
      latest_version: '1.0',
      status: ModelStatus.DEVELOPING,
      performance_metrics: data.performance_metrics || {},
      resource_requirements: data.resource_requirements || {
        memory_gb: 8,
        storage_gb: 2,
      },
      tags: data.tags || [],
      is_favorite: false,
      is_public: data.is_public || false,
      usage_stats: {
        total_calls: 0,
        calls_today: 0,
        calls_this_week: 0,
        calls_this_month: 0,
        avg_response_time: 0,
        success_rate: 100,
        error_rate: 0,
      },
      rating: {
        average_rating: 0,
        rating_count: 0,
        five_star: 0,
        four_star: 0,
        three_star: 0,
        two_star: 0,
        one_star: 0,
      },
      framework: data.framework,
      author: 'current_user',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'current_user',
    }

    // 添加到模拟数据中
    mockMyModels.push(newModel)

    return mockApiCall(newModel)
  },

  // 更新模型
  async updateModel(modelId: string, data: UpdateModelRequest): Promise<ApiResponse<Model>> {
    const modelIndex = mockMyModels.findIndex((m) => m.id === modelId)
    if (modelIndex === -1) {
      return mockApiCall(null as unknown as Model, false)
    }

    const updatedModel = {
      ...mockMyModels[modelIndex],
      ...data,
      updated_at: new Date().toISOString(),
    }

    mockMyModels[modelIndex] = updatedModel

    return mockApiCall(updatedModel)
  },

  // 删除模型
  async deleteModel(modelId: string): Promise<ApiResponse<boolean>> {
    const modelIndex = mockMyModels.findIndex((m) => m.id === modelId)
    if (modelIndex === -1) {
      return mockApiCall(false, false)
    }

    mockMyModels.splice(modelIndex, 1)
    return mockApiCall(true)
  },

  // 收藏/取消收藏模型
  async toggleFavorite(data: ModelFavoriteRequest): Promise<ApiResponse<boolean>> {
    const model = allModels.find((m) => m.id === data.model_id)
    if (!model) {
      return mockApiCall(false, false)
    }

    model.is_favorite = data.is_favorite
    return mockApiCall(true)
  },

}

export default mockModelService
