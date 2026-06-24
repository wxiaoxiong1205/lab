// 实验管理Mock数据服务
import type {
  ApiResponse,
  CreateExperimentRequest,
  CreateExperimentRunRequest,
  Experiment,
  ExperimentComparison,
  ExperimentRun,
  ExperimentRunDetail,
  ExperimentRunSearchParams,
  ExperimentSearchParams,
  ExperimentStats,
  PaginatedResponse,
  UpdateExperimentRequest,
  UpdateExperimentRunRequest } from '../types/experiment'
import {
  ExperimentRunStatus,
  ExperimentStatus,
  MetricType,
  ParameterType,
} from '../types/experiment'

// 模拟数据
const mockExperiments: Experiment[] = [
  {
    id: 'exp-001',
    name: 'BERT文本分类优化',
    description: '基于BERT的文本分类模型参数调优实验',
    project_id: '33',
    mlflow_experiment_id: 'mlflow-exp-001',
    status: ExperimentStatus.ACTIVE,
    run_count: 15,
    success_count: 12,
    failed_count: 3,
    avg_duration: 1800,
    best_metric_value: 0.95,
    best_metric_name: 'accuracy',
    tags: ['NLP', 'BERT', '文本分类'],
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-20T15:30:00Z',
    created_by: 'user001',
  },
  {
    id: 'exp-002',
    name: 'ResNet图像分类',
    description: 'ResNet50图像分类模型训练实验',
    project_id: '33',
    mlflow_experiment_id: 'mlflow-exp-002',
    status: ExperimentStatus.ACTIVE,
    run_count: 8,
    success_count: 7,
    failed_count: 1,
    avg_duration: 3600,
    best_metric_value: 0.92,
    best_metric_name: 'accuracy',
    tags: ['CV', 'ResNet', '图像分类'],
    created_at: '2024-01-10T14:20:00Z',
    updated_at: '2024-01-18T09:45:00Z',
    created_by: 'user002',
  },
  {
    id: 'exp-003',
    name: 'GPT-2文本生成',
    description: 'GPT-2模型用于中文文本生成的微调实验',
    project_id: '33',
    mlflow_experiment_id: 'mlflow-exp-003',
    status: ExperimentStatus.COMPLETED,
    run_count: 20,
    success_count: 18,
    failed_count: 2,
    avg_duration: 7200,
    best_metric_value: 3.2,
    best_metric_name: 'perplexity',
    tags: ['NLP', 'GPT-2', '文本生成'],
    created_at: '2024-01-05T11:15:00Z',
    updated_at: '2024-01-15T16:20:00Z',
    created_by: 'user001',
  },
  {
    id: 'exp-004',
    name: 'YOLOv12目标检测优化',
    description: 'YOLOv12模型在自定义数据集上的目标检测性能优化实验',
    project_id: '33',
    mlflow_experiment_id: 'mlflow-exp-004',
    status: ExperimentStatus.ACTIVE,
    run_count: 12,
    success_count: 10,
    failed_count: 2,
    avg_duration: 5400,
    best_metric_value: 0.887,
    best_metric_name: 'mAP@0.5',
    tags: ['CV', 'YOLO', '目标检测', '实时检测'],
    created_at: '2024-01-22T09:30:00Z',
    updated_at: '2024-01-28T14:15:00Z',
    created_by: 'user003',
  },
  {
    id: 'exp-005',
    name: 'Qwen3大模型微调',
    description: 'Qwen3-7B在领域专用数据上的指令微调和对齐优化',
    project_id: '33',
    mlflow_experiment_id: 'mlflow-exp-005',
    status: ExperimentStatus.ACTIVE,
    run_count: 8,
    success_count: 6,
    failed_count: 2,
    avg_duration: 14400,
    best_metric_value: 0.758,
    best_metric_name: 'rouge_l',
    tags: ['LLM', 'Qwen3', '指令微调', '对话系统'],
    created_at: '2024-01-25T16:00:00Z',
    updated_at: '2024-01-30T11:20:00Z',
    created_by: 'user004',
  },
  // 为 datasense 项目添加实验数据
  {
    id: 'exp-datasense-001',
    name: 'Transformer情感分析模型',
    description: '基于Transformer的情感分析模型优化实验，用于社交媒体文本情感分类',
    project_id: 'datasense',
    mlflow_experiment_id: 'mlflow-exp-datasense-001',
    status: ExperimentStatus.ACTIVE,
    run_count: 12,
    success_count: 10,
    failed_count: 2,
    avg_duration: 2400,
    best_metric_value: 0.94,
    best_metric_name: 'f1_score',
    tags: ['NLP', '情感分析', 'Transformer', '社交媒体'],
    created_at: '2024-02-01T09:00:00Z',
    updated_at: '2024-02-05T14:30:00Z',
    created_by: 'datasense_user',
  },
  {
    id: 'exp-datasense-002',
    name: 'CNN图像识别模型',
    description: '卷积神经网络在医疗影像诊断中的应用研究',
    project_id: 'datasense',
    mlflow_experiment_id: 'mlflow-exp-datasense-002',
    status: ExperimentStatus.COMPLETED,
    run_count: 25,
    success_count: 22,
    failed_count: 3,
    avg_duration: 4800,
    best_metric_value: 0.96,
    best_metric_name: 'accuracy',
    tags: ['CV', 'CNN', '医疗影像', '诊断'],
    created_at: '2024-01-28T10:15:00Z',
    updated_at: '2024-02-03T16:45:00Z',
    created_by: 'datasense_user',
  },
  {
    id: 'exp-datasense-003',
    name: 'LSTM时序预测模型',
    description: '长短期记忆网络在股票价格预测中的应用与优化',
    project_id: 'datasense',
    mlflow_experiment_id: 'mlflow-exp-datasense-003',
    status: ExperimentStatus.ACTIVE,
    run_count: 18,
    success_count: 15,
    failed_count: 3,
    avg_duration: 3600,
    best_metric_value: 0.82,
    best_metric_name: 'mse',
    tags: ['时序预测', 'LSTM', '金融', '股票'],
    created_at: '2024-02-02T14:20:00Z',
    updated_at: '2024-02-06T11:10:00Z',
    created_by: 'datasense_user',
  },
  {
    id: 'exp-datasense-004',
    name: 'GAN图像生成实验',
    description: '生成对抗网络在高质量图像生成中的应用研究',
    project_id: 'datasense',
    mlflow_experiment_id: 'mlflow-exp-datasense-004',
    status: ExperimentStatus.ARCHIVED,
    run_count: 30,
    success_count: 26,
    failed_count: 4,
    avg_duration: 7200,
    best_metric_value: 0.89,
    best_metric_name: 'fid_score',
    tags: ['GAN', '图像生成', '深度学习'],
    created_at: '2024-01-20T08:30:00Z',
    updated_at: '2024-01-30T17:00:00Z',
    created_by: 'datasense_user',
  },
  {
    id: 'exp-datasense-005',
    name: 'BERT问答系统优化',
    description: 'BERT模型在智能问答系统中的性能优化和部署研究',
    project_id: 'datasense',
    mlflow_experiment_id: 'mlflow-exp-datasense-005',
    status: ExperimentStatus.ACTIVE,
    run_count: 14,
    success_count: 12,
    failed_count: 2,
    avg_duration: 5400,
    best_metric_value: 0.91,
    best_metric_name: 'em_score',
    tags: ['BERT', '问答系统', 'NLP', '智能客服'],
    created_at: '2024-02-04T11:45:00Z',
    updated_at: '2024-02-07T09:20:00Z',
    created_by: 'datasense_user',
  },
]

const mockExperimentRuns: ExperimentRun[] = [
  {
    id: 'run-001',
    name: 'BERT-base-lr001',
    experiment_id: 'exp-001',
    project_id: '33',
    mlflow_run_id: 'mlflow-run-001',
    status: ExperimentRunStatus.FINISHED,
    start_time: '2024-01-20T10:00:00Z',
    end_time: '2024-01-20T10:30:00Z',
    duration: 1800,
    parameters: {
      learning_rate: 0.001,
      batch_size: 32,
      epochs: 10,
      optimizer: 'adam',
      model_type: 'bert-base-uncased',
    },
    metrics: {
      accuracy: 0.95,
      f1_score: 0.94,
      precision: 0.95,
      recall: 0.93,
      loss: 0.12,
    },
    tags: {
      version: 'v1.0',
      experiment_type: 'hyperparameter_tuning',
      gpu_type: 'V100',
    },
    artifacts: ['model.pkl', 'metrics.json', 'confusion_matrix.png'],
    model_info: {
      model_type: 'bert-base-uncased',
      model_size: 110000000,
      model_path: '/models/bert-base-run-001',
    },
    resource_info: {
      cpu_usage: 75,
      memory_usage: 85,
      gpu_usage: 90,
      disk_usage: 45,
    },
    created_at: '2024-01-20T10:00:00Z',
    updated_at: '2024-01-20T10:30:00Z',
    created_by: 'user001',
  },
  {
    id: 'run-002',
    name: 'BERT-base-lr0001',
    experiment_id: 'exp-001',
    project_id: '33',
    mlflow_run_id: 'mlflow-run-002',
    status: ExperimentRunStatus.FINISHED,
    start_time: '2024-01-20T11:00:00Z',
    end_time: '2024-01-20T11:35:00Z',
    duration: 2100,
    parameters: {
      learning_rate: 0.0001,
      batch_size: 32,
      epochs: 10,
      optimizer: 'adam',
      model_type: 'bert-base-uncased',
    },
    metrics: {
      accuracy: 0.92,
      f1_score: 0.91,
      precision: 0.93,
      recall: 0.90,
      loss: 0.18,
    },
    tags: {
      version: 'v1.0',
      experiment_type: 'hyperparameter_tuning',
      gpu_type: 'V100',
    },
    artifacts: ['model.pkl', 'metrics.json', 'confusion_matrix.png'],
    model_info: {
      model_type: 'bert-base-uncased',
      model_size: 110000000,
      model_path: '/models/bert-base-run-002',
    },
    resource_info: {
      cpu_usage: 70,
      memory_usage: 80,
      gpu_usage: 85,
      disk_usage: 42,
    },
    created_at: '2024-01-20T11:00:00Z',
    updated_at: '2024-01-20T11:35:00Z',
    created_by: 'user001',
  },
  {
    id: 'run-003',
    name: 'ResNet50-bs64',
    experiment_id: 'exp-002',
    project_id: '33',
    mlflow_run_id: 'mlflow-run-003',
    status: ExperimentRunStatus.RUNNING,
    start_time: '2024-01-20T14:00:00Z',
    duration: 1200,
    parameters: {
      learning_rate: 0.01,
      batch_size: 64,
      epochs: 50,
      optimizer: 'sgd',
      model_type: 'resnet50',
    },
    metrics: {
      accuracy: 0.88,
      f1_score: 0.87,
      precision: 0.89,
      recall: 0.85,
      loss: 0.35,
    },
    tags: {
      version: 'v2.0',
      experiment_type: 'model_training',
      gpu_type: 'A100',
    },
    artifacts: ['checkpoint.pth', 'training_log.txt'],
    model_info: {
      model_type: 'resnet50',
      model_size: 25600000,
      model_path: '/models/resnet50-run-003',
    },
    resource_info: {
      cpu_usage: 85,
      memory_usage: 90,
      gpu_usage: 95,
      disk_usage: 60,
    },
    created_at: '2024-01-20T14:00:00Z',
    updated_at: '2024-01-20T14:20:00Z',
    created_by: 'user002',
  },
  {
    id: 'run-004',
    name: 'GPT2-finetune-v1',
    experiment_id: 'exp-003',
    project_id: '33',
    mlflow_run_id: 'mlflow-run-004',
    status: ExperimentRunStatus.FAILED,
    start_time: '2024-01-15T09:00:00Z',
    end_time: '2024-01-15T09:45:00Z',
    duration: 2700,
    parameters: {
      learning_rate: 0.0005,
      batch_size: 16,
      epochs: 20,
      optimizer: 'adamw',
      model_type: 'gpt2',
    },
    metrics: {
      perplexity: 8.5,
      loss: 2.1,
    },
    tags: {
      version: 'v1.0',
      experiment_type: 'fine_tuning',
      gpu_type: 'V100',
    },
    artifacts: ['error_log.txt'],
    model_info: {
      model_type: 'gpt2',
      model_size: 124000000,
      model_path: '/models/gpt2-run-004',
    },
    resource_info: {
      cpu_usage: 60,
      memory_usage: 70,
      gpu_usage: 80,
      disk_usage: 35,
    },
    created_at: '2024-01-15T09:00:00Z',
    updated_at: '2024-01-15T09:45:00Z',
    created_by: 'user001',
  },
  {
    id: 'run-005',
    name: 'YOLOv12-coco-pretrain',
    experiment_id: 'exp-004',
    project_id: '33',
    mlflow_run_id: 'mlflow-run-005',
    status: ExperimentRunStatus.FINISHED,
    start_time: '2024-01-28T10:00:00Z',
    end_time: '2024-01-28T11:30:00Z',
    duration: 5400,
    parameters: {
      learning_rate: 0.001,
      batch_size: 16,
      epochs: 300,
      optimizer: 'sgd',
      model_type: 'yolov12n',
      img_size: 640,
      conf_threshold: 0.25,
      iou_threshold: 0.7,
      momentum: 0.937,
      weight_decay: 0.0005,
    },
    metrics: {
      'mAP@0.5': 0.887,
      'mAP@0.5:0.95': 0.623,
      'precision': 0.851,
      'recall': 0.794,
      'f1_score': 0.821,
      'box_loss': 0.0234,
      'obj_loss': 0.0076,
      'cls_loss': 0.0018,
      'fps': 168.5,
    },
    tags: {
      version: 'v12.0',
      experiment_type: 'object_detection',
      gpu_type: 'A100',
      dataset: 'custom_coco',
      architecture: 'YOLOv12-nano',
    },
    artifacts: ['best.pt', 'last.pt', 'results.png', 'confusion_matrix.png', 'PR_curve.png', 'F1_curve.png'],
    model_info: {
      model_type: 'yolov12n',
      model_size: 3200000,
      model_path: '/models/yolov12-run-005',
    },
    resource_info: {
      cpu_usage: 45,
      memory_usage: 75,
      gpu_usage: 92,
      disk_usage: 65,
    },
    created_at: '2024-01-28T10:00:00Z',
    updated_at: '2024-01-28T11:30:00Z',
    created_by: 'user003',
  },
  {
    id: 'run-006',
    name: 'YOLOv12-small-finetune',
    experiment_id: 'exp-004',
    project_id: '33',
    mlflow_run_id: 'mlflow-run-006',
    status: ExperimentRunStatus.FINISHED,
    start_time: '2024-01-29T14:00:00Z',
    end_time: '2024-01-29T16:15:00Z',
    duration: 8100,
    parameters: {
      learning_rate: 0.0005,
      batch_size: 8,
      epochs: 100,
      optimizer: 'adamw',
      model_type: 'yolov12s',
      img_size: 640,
      conf_threshold: 0.3,
      iou_threshold: 0.65,
      momentum: 0.9,
      weight_decay: 0.001,
    },
    metrics: {
      'mAP@0.5': 0.912,
      'mAP@0.5:0.95': 0.671,
      'precision': 0.889,
      'recall': 0.823,
      'f1_score': 0.855,
      'box_loss': 0.0198,
      'obj_loss': 0.0063,
      'cls_loss': 0.0012,
      'fps': 142.3,
    },
    tags: {
      version: 'v12.0',
      experiment_type: 'object_detection',
      gpu_type: 'A100',
      dataset: 'custom_coco',
      architecture: 'YOLOv12-small',
    },
    artifacts: ['best.pt', 'last.pt', 'results.png', 'confusion_matrix.png', 'PR_curve.png', 'F1_curve.png'],
    model_info: {
      model_type: 'yolov12s',
      model_size: 11200000,
      model_path: '/models/yolov12-run-006',
    },
    resource_info: {
      cpu_usage: 52,
      memory_usage: 78,
      gpu_usage: 95,
      disk_usage: 68,
    },
    created_at: '2024-01-29T14:00:00Z',
    updated_at: '2024-01-29T16:15:00Z',
    created_by: 'user003',
  },
  {
    id: 'run-007',
    name: 'YOLOv12-medium-augment',
    experiment_id: 'exp-004',
    project_id: '33',
    mlflow_run_id: 'mlflow-run-007',
    status: ExperimentRunStatus.RUNNING,
    start_time: '2024-01-30T09:00:00Z',
    duration: 3600,
    parameters: {
      learning_rate: 0.001,
      batch_size: 4,
      epochs: 200,
      optimizer: 'sgd',
      model_type: 'yolov12m',
      img_size: 640,
      conf_threshold: 0.25,
      iou_threshold: 0.7,
      momentum: 0.937,
      weight_decay: 0.0005,
      augment: true,
      mosaic: 1.0,
      mixup: 0.15,
    },
    metrics: {
      'mAP@0.5': 0.856,
      'mAP@0.5:0.95': 0.598,
      'precision': 0.834,
      'recall': 0.781,
      'f1_score': 0.807,
      'box_loss': 0.0267,
      'obj_loss': 0.0089,
      'cls_loss': 0.0021,
      'fps': 89.2,
    },
    tags: {
      version: 'v12.0',
      experiment_type: 'object_detection',
      gpu_type: 'A100',
      dataset: 'custom_coco',
      architecture: 'YOLOv12-medium',
    },
    artifacts: ['checkpoint.pt', 'train_log.txt'],
    model_info: {
      model_type: 'yolov12m',
      model_size: 25900000,
      model_path: '/models/yolov12-run-007',
    },
    resource_info: {
      cpu_usage: 65,
      memory_usage: 85,
      gpu_usage: 98,
      disk_usage: 72,
    },
    created_at: '2024-01-30T09:00:00Z',
    updated_at: '2024-01-30T10:00:00Z',
    created_by: 'user003',
  },
  {
    id: 'run-008',
    name: 'Qwen3-7B-sft-v1',
    experiment_id: 'exp-005',
    project_id: '33',
    mlflow_run_id: 'mlflow-run-008',
    status: ExperimentRunStatus.FINISHED,
    start_time: '2024-01-30T08:00:00Z',
    end_time: '2024-01-30T12:00:00Z',
    duration: 14400,
    parameters: {
      learning_rate: 2e-5,
      batch_size: 4,
      epochs: 3,
      optimizer: 'adamw',
      model_type: 'qwen3-7b',
      max_length: 2048,
      gradient_accumulation_steps: 8,
      warmup_steps: 100,
      weight_decay: 0.01,
      lr_scheduler: 'cosine',
      fp16: true,
      lora_r: 64,
      lora_alpha: 16,
      lora_dropout: 0.1,
    },
    metrics: {
      rouge_l: 0.758,
      bleu_4: 0.432,
      bertscore_f1: 0.891,
      train_loss: 1.234,
      eval_loss: 1.567,
      perplexity: 4.78,
      human_eval_score: 0.823,
      response_length_avg: 156.7,
    },
    tags: {
      version: 'v3.0',
      experiment_type: 'instruction_tuning',
      gpu_type: 'A100',
      dataset: 'custom_instruct',
      tuning_method: 'lora',
    },
    artifacts: ['adapter_model.bin', 'adapter_config.json', 'training_args.json', 'eval_results.json'],
    model_info: {
      model_type: 'qwen3-7b',
      model_size: 7200000000,
      model_path: '/models/qwen3-run-008',
    },
    resource_info: {
      cpu_usage: 35,
      memory_usage: 95,
      gpu_usage: 99,
      disk_usage: 85,
    },
    created_at: '2024-01-30T08:00:00Z',
    updated_at: '2024-01-30T12:00:00Z',
    created_by: 'user004',
  },
  {
    id: 'run-009',
    name: 'Qwen3-7B-dpo-align',
    experiment_id: 'exp-005',
    project_id: '33',
    mlflow_run_id: 'mlflow-run-009',
    status: ExperimentRunStatus.FINISHED,
    start_time: '2024-01-31T10:00:00Z',
    end_time: '2024-01-31T15:30:00Z',
    duration: 19800,
    parameters: {
      learning_rate: 5e-6,
      batch_size: 2,
      epochs: 1,
      optimizer: 'adamw',
      model_type: 'qwen3-7b',
      max_length: 2048,
      gradient_accumulation_steps: 16,
      warmup_steps: 50,
      weight_decay: 0.01,
      beta: 0.1,
      reference_free: false,
      loss_type: 'sigmoid',
      label_smoothing: 0.0,
    },
    metrics: {
      rouge_l: 0.782,
      bleu_4: 0.467,
      bertscore_f1: 0.908,
      train_loss: 0.689,
      eval_loss: 0.723,
      reward_accuracy: 0.876,
      human_eval_score: 0.891,
      response_length_avg: 142.3,
      harmfulness_score: 0.023,
    },
    tags: {
      version: 'v3.0',
      experiment_type: 'preference_alignment',
      gpu_type: 'A100',
      dataset: 'preference_pairs',
      tuning_method: 'dpo',
    },
    artifacts: ['model.bin', 'config.json', 'training_args.json', 'eval_results.json', 'reward_model.bin'],
    model_info: {
      model_type: 'qwen3-7b',
      model_size: 7200000000,
      model_path: '/models/qwen3-run-009',
    },
    resource_info: {
      cpu_usage: 40,
      memory_usage: 97,
      gpu_usage: 99,
      disk_usage: 88,
    },
    created_at: '2024-01-31T10:00:00Z',
    updated_at: '2024-01-31T15:30:00Z',
    created_by: 'user004',
  },
  {
    id: 'run-010',
    name: 'Qwen3-7B-rlhf-v2',
    experiment_id: 'exp-005',
    project_id: '33',
    mlflow_run_id: 'mlflow-run-010',
    status: ExperimentRunStatus.RUNNING,
    start_time: '2024-02-01T14:00:00Z',
    duration: 7200,
    parameters: {
      learning_rate: 1e-6,
      batch_size: 1,
      epochs: 2,
      optimizer: 'adamw',
      model_type: 'qwen3-7b',
      max_length: 2048,
      gradient_accumulation_steps: 32,
      warmup_steps: 20,
      weight_decay: 0.01,
      ppo_epochs: 4,
      clip_range: 0.2,
      value_loss_coef: 0.1,
      entropy_coef: 0.01,
    },
    metrics: {
      rouge_l: 0.734,
      bleu_4: 0.398,
      bertscore_f1: 0.874,
      train_loss: 0.567,
      eval_loss: 0.612,
      reward_score: 2.34,
      human_eval_score: 0.845,
      response_length_avg: 168.9,
      policy_loss: 0.234,
      value_loss: 0.456,
    },
    tags: {
      version: 'v3.0',
      experiment_type: 'rlhf_training',
      gpu_type: 'A100',
      dataset: 'rlhf_pairs',
      tuning_method: 'ppo',
    },
    artifacts: ['checkpoint.bin', 'policy_model.bin', 'value_model.bin', 'training_log.txt'],
    model_info: {
      model_type: 'qwen3-7b',
      model_size: 7200000000,
      model_path: '/models/qwen3-run-010',
    },
    resource_info: {
      cpu_usage: 45,
      memory_usage: 98,
      gpu_usage: 99,
      disk_usage: 92,
    },
    created_at: '2024-02-01T14:00:00Z',
    updated_at: '2024-02-01T16:00:00Z',
    created_by: 'user004',
  },
]

// 模拟网络延迟
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// 模拟API响应
const mockApiCall = async <T>(data: T, delayMs = 300): Promise<ApiResponse<T>> => {
  await delay(delayMs)
  return {
    success: true,
    data,
  }
}

// 模拟分页
const paginate = <T>(items: T[], page: number, pageSize: number): PaginatedResponse<T> => {
  const startIndex = (page - 1) * pageSize
  const endIndex = startIndex + pageSize
  const paginatedItems = items.slice(startIndex, endIndex)

  return {
    items: paginatedItems,
    total: items.length,
    page,
    page_size: pageSize,
    total_pages: Math.ceil(items.length / pageSize),
  }
}

// 实验管理Mock服务
export const mockExperimentService = {
  // 获取实验列表
  async getExperiments(projectId: string, params: ExperimentSearchParams = {}): Promise<ApiResponse<PaginatedResponse<Experiment>>> {
    let filteredExperiments = mockExperiments.filter((exp) => exp.project_id === projectId)

    // 关键词搜索
    if (params.keyword) {
      const keyword = params.keyword.toLowerCase()
      filteredExperiments = filteredExperiments.filter((exp) =>
        exp.name.toLowerCase().includes(keyword)
        || exp.description?.toLowerCase().includes(keyword),
      )
    }

    // 状态筛选
    if (params.status && params.status.length > 0) {
      filteredExperiments = filteredExperiments.filter((exp) =>
        params.status!.includes(exp.status),
      )
    }

    // 标签筛选
    if (params.tags && params.tags.length > 0) {
      filteredExperiments = filteredExperiments.filter((exp) =>
        params.tags!.some((tag) => exp.tags?.includes(tag)),
      )
    }

    // 创建者筛选
    if (params.created_by) {
      filteredExperiments = filteredExperiments.filter((exp) =>
        exp.created_by === params.created_by,
      )
    }

    // 时间范围筛选
    if (params.created_after) {
      filteredExperiments = filteredExperiments.filter((exp) =>
        new Date(exp.created_at) >= new Date(params.created_after!),
      )
    }

    if (params.created_before) {
      filteredExperiments = filteredExperiments.filter((exp) =>
        new Date(exp.created_at) <= new Date(params.created_before!),
      )
    }

    // 排序
    const sortBy = params.sort_by || 'created_at'
    const sortOrder = params.sort_order || 'desc'

    filteredExperiments.sort((a, b) => {
      let aValue: string | number
      let bValue: string | number

      switch (sortBy) {
        case 'name':
          aValue = a.name
          bValue = b.name
          break
        case 'run_count':
          aValue = a.run_count
          bValue = b.run_count
          break
        case 'updated_at':
          aValue = a.updated_at
          bValue = b.updated_at
          break
        default:
          aValue = a.created_at
          bValue = b.created_at
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1
      }
      else {
        return aValue < bValue ? 1 : -1
      }
    })

    // 分页
    const page = params.page || 1
    const pageSize = params.page_size || 10
    const paginatedData = paginate(filteredExperiments, page, pageSize)

    return mockApiCall(paginatedData)
  },

  // 获取实验详情
  async getExperiment(experimentId: string): Promise<ApiResponse<Experiment>> {
    const experiment = mockExperiments.find((exp) => exp.id === experimentId)

    if (!experiment) {
      return {
        success: false,
        data: {} as Experiment,
        error: '实验不存在',
      }
    }

    return mockApiCall(experiment)
  },

  // 创建实验
  async createExperiment(projectId: string, data: CreateExperimentRequest): Promise<ApiResponse<Experiment>> {
    const newExperiment: Experiment = {
      id: `exp-${Date.now()}`,
      name: data.name,
      description: data.description,
      project_id: projectId,
      mlflow_experiment_id: `mlflow-exp-${Date.now()}`,
      status: ExperimentStatus.ACTIVE,
      run_count: 0,
      success_count: 0,
      failed_count: 0,
      tags: data.tags || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'current_user',
    }

    mockExperiments.push(newExperiment)

    return mockApiCall(newExperiment)
  },

  // 更新实验
  async updateExperiment(experimentId: string, data: UpdateExperimentRequest): Promise<ApiResponse<Experiment>> {
    const experimentIndex = mockExperiments.findIndex((exp) => exp.id === experimentId)

    if (experimentIndex === -1) {
      return {
        success: false,
        data: {} as Experiment,
        error: '实验不存在',
      }
    }

    const updatedExperiment = {
      ...mockExperiments[experimentIndex],
      ...data,
      updated_at: new Date().toISOString(),
    }

    mockExperiments[experimentIndex] = updatedExperiment

    return mockApiCall(updatedExperiment)
  },

  // 删除实验
  async deleteExperiment(experimentId: string): Promise<ApiResponse<void>> {
    const experimentIndex = mockExperiments.findIndex((exp) => exp.id === experimentId)

    if (experimentIndex === -1) {
      return {
        success: false,
        data: undefined,
        error: '实验不存在',
      }
    }

    mockExperiments.splice(experimentIndex, 1)

    // 删除相关的运行记录
    const runIndicesToDelete = mockExperimentRuns
      .map((run, index) => run.experiment_id === experimentId ? index : -1)
      .filter((index) => index !== -1)
      .reverse() // 从后往前删除，避免索引问题

    runIndicesToDelete.forEach((index) => {
      mockExperimentRuns.splice(index, 1)
    })

    return mockApiCall(undefined)
  },

  // 获取实验运行记录列表
  async getExperimentRuns(experimentId: string, params: ExperimentRunSearchParams = {}): Promise<ApiResponse<PaginatedResponse<ExperimentRun>>> {
    let filteredRuns = mockExperimentRuns.filter((run) => run.experiment_id === experimentId)

    // 关键词搜索
    if (params.keyword) {
      const keyword = params.keyword.toLowerCase()
      filteredRuns = filteredRuns.filter((run) =>
        run.name.toLowerCase().includes(keyword)
        || Object.values(run.tags).some((tag) => tag.toLowerCase().includes(keyword)),
      )
    }

    // 状态筛选
    if (params.status && params.status.length > 0) {
      filteredRuns = filteredRuns.filter((run) =>
        params.status!.includes(run.status),
      )
    }

    // 创建者筛选
    if (params.created_by) {
      filteredRuns = filteredRuns.filter((run) =>
        run.created_by === params.created_by,
      )
    }

    // 模型类型筛选
    if (params.model_type) {
      filteredRuns = filteredRuns.filter((run) =>
        run.model_info?.model_type === params.model_type,
      )
    }

    // 时间范围筛选
    if (params.created_after) {
      filteredRuns = filteredRuns.filter((run) =>
        new Date(run.created_at) >= new Date(params.created_after!),
      )
    }

    if (params.created_before) {
      filteredRuns = filteredRuns.filter((run) =>
        new Date(run.created_at) <= new Date(params.created_before!),
      )
    }

    // 运行时长筛选
    if (params.duration_min !== undefined) {
      filteredRuns = filteredRuns.filter((run) =>
        (run.duration || 0) >= params.duration_min!,
      )
    }

    if (params.duration_max !== undefined) {
      filteredRuns = filteredRuns.filter((run) =>
        (run.duration || 0) <= params.duration_max!,
      )
    }

    // 排序
    const sortBy = params.sort_by || 'created_at'
    const sortOrder = params.sort_order || 'desc'

    filteredRuns.sort((a, b) => {
      let aValue: string | number
      let bValue: string | number

      switch (sortBy) {
        case 'name':
          aValue = a.name
          bValue = b.name
          break
        case 'duration':
          aValue = a.duration || 0
          bValue = b.duration || 0
          break
        case 'status':
          aValue = a.status
          bValue = b.status
          break
        default:
          aValue = a.created_at
          bValue = b.created_at
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1
      }
      else {
        return aValue < bValue ? 1 : -1
      }
    })

    // 分页
    const page = params.page || 1
    const pageSize = params.page_size || 10
    const paginatedData = paginate(filteredRuns, page, pageSize)

    return mockApiCall(paginatedData)
  },

  // 获取实验运行记录详情
  async getExperimentRunDetail(runId: string): Promise<ApiResponse<ExperimentRunDetail>> {
    const run = mockExperimentRuns.find((r) => r.id === runId)

    if (!run) {
      return {
        success: false,
        data: {} as ExperimentRunDetail,
        error: '运行记录不存在',
      }
    }

    // 生成模拟的详细信息
    const runDetail: ExperimentRunDetail = {
      ...run,
      logs: [
        '2024-01-20T10:00:00Z - 开始训练',
        '2024-01-20T10:05:00Z - 加载数据集完成',
        '2024-01-20T10:10:00Z - 模型初始化完成',
        '2024-01-20T10:15:00Z - 开始第1轮训练',
        '2024-01-20T10:20:00Z - 第1轮训练完成，loss: 0.5',
        '2024-01-20T10:25:00Z - 开始第2轮训练',
        '2024-01-20T10:30:00Z - 训练完成',
      ],
      metric_history: [
        { metric_name: 'accuracy', metric_type: MetricType.ACCURACY, timestamp: '2024-01-20T10:15:00Z', value: 0.85, step: 1 },
        { metric_name: 'accuracy', metric_type: MetricType.ACCURACY, timestamp: '2024-01-20T10:20:00Z', value: 0.90, step: 2 },
        { metric_name: 'accuracy', metric_type: MetricType.ACCURACY, timestamp: '2024-01-20T10:25:00Z', value: 0.93, step: 3 },
        { metric_name: 'accuracy', metric_type: MetricType.ACCURACY, timestamp: '2024-01-20T10:30:00Z', value: 0.95, step: 4 },
        { metric_name: 'loss', metric_type: MetricType.LOSS, timestamp: '2024-01-20T10:15:00Z', value: 0.5, step: 1 },
        { metric_name: 'loss', metric_type: MetricType.LOSS, timestamp: '2024-01-20T10:20:00Z', value: 0.3, step: 2 },
        { metric_name: 'loss', metric_type: MetricType.LOSS, timestamp: '2024-01-20T10:25:00Z', value: 0.2, step: 3 },
        { metric_name: 'loss', metric_type: MetricType.LOSS, timestamp: '2024-01-20T10:30:00Z', value: 0.12, step: 4 },
      ],
      parameter_history: [
        { parameter_name: 'learning_rate', parameter_type: ParameterType.HYPERPARAMETER, value: 0.001, timestamp: '2024-01-20T10:00:00Z' },
        { parameter_name: 'batch_size', parameter_type: ParameterType.HYPERPARAMETER, value: 32, timestamp: '2024-01-20T10:00:00Z' },
        { parameter_name: 'epochs', parameter_type: ParameterType.HYPERPARAMETER, value: 10, timestamp: '2024-01-20T10:00:00Z' },
      ],
      environment_info: {
        python_version: '3.8.10',
        framework_version: 'pytorch-1.12.0',
        cuda_version: '11.6',
        hardware_info: {
          cpu_model: 'Intel Xeon E5-2686 v4',
          gpu_model: 'NVIDIA V100',
          memory_total: 64000000000,
          disk_total: 1000000000000,
        },
        os_info: {
          os_name: 'Ubuntu',
          os_version: '20.04',
        },
      },
    }

    return mockApiCall(runDetail)
  },

  // 创建实验运行记录
  async createExperimentRun(data: CreateExperimentRunRequest): Promise<ApiResponse<ExperimentRun>> {
    const newRun: ExperimentRun = {
      id: `run-${Date.now()}`,
      name: data.name,
      experiment_id: data.experiment_id,
      project_id: '33', // 从实验中获取
      mlflow_run_id: `mlflow-run-${Date.now()}`,
      status: ExperimentRunStatus.RUNNING,
      start_time: new Date().toISOString(),
      parameters: data.parameters,
      metrics: {},
      tags: data.tags || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'current_user',
    }

    mockExperimentRuns.push(newRun)

    // 更新实验统计
    const experiment = mockExperiments.find((exp) => exp.id === data.experiment_id)
    if (experiment) {
      experiment.run_count++
      experiment.updated_at = new Date().toISOString()
    }

    return mockApiCall(newRun)
  },

  // 更新实验运行记录
  async updateExperimentRun(runId: string, data: UpdateExperimentRunRequest): Promise<ApiResponse<ExperimentRun>> {
    const runIndex = mockExperimentRuns.findIndex((run) => run.id === runId)

    if (runIndex === -1) {
      return {
        success: false,
        data: {} as ExperimentRun,
        error: '运行记录不存在',
      }
    }

    const updatedRun = {
      ...mockExperimentRuns[runIndex],
      ...data,
      updated_at: new Date().toISOString(),
    }

    // 如果状态更改为完成或失败，设置结束时间
    if (data.status === ExperimentRunStatus.FINISHED || data.status === ExperimentRunStatus.FAILED) {
      updatedRun.end_time = new Date().toISOString()
      updatedRun.duration = Math.floor((new Date(updatedRun.end_time).getTime() - new Date(updatedRun.start_time).getTime()) / 1000)
    }

    mockExperimentRuns[runIndex] = updatedRun

    return mockApiCall(updatedRun)
  },

  // 删除实验运行记录
  async deleteExperimentRun(runId: string): Promise<ApiResponse<void>> {
    const runIndex = mockExperimentRuns.findIndex((run) => run.id === runId)

    if (runIndex === -1) {
      return {
        success: false,
        data: undefined,
        error: '运行记录不存在',
      }
    }

    const run = mockExperimentRuns[runIndex]
    mockExperimentRuns.splice(runIndex, 1)

    // 更新实验统计
    const experiment = mockExperiments.find((exp) => exp.id === run.experiment_id)
    if (experiment) {
      experiment.run_count--
      experiment.updated_at = new Date().toISOString()
    }

    return mockApiCall(undefined)
  },

  // 获取实验统计信息
  async getExperimentStats(projectId: string): Promise<ApiResponse<ExperimentStats>> {
    const projectExperiments = mockExperiments.filter((exp) => exp.project_id === projectId)
    const projectRuns = mockExperimentRuns.filter((run) => run.project_id === projectId)

    const stats: ExperimentStats = {
      total_experiments: projectExperiments.length,
      active_experiments: projectExperiments.filter((exp) => exp.status === ExperimentStatus.ACTIVE).length,
      total_runs: projectRuns.length,
      running_runs: projectRuns.filter((run) => run.status === ExperimentRunStatus.RUNNING).length,
      success_rate: projectRuns.length > 0 ? projectRuns.filter((run) => run.status === ExperimentRunStatus.FINISHED).length / projectRuns.length : 0,
      avg_run_duration: projectRuns.length > 0 ? projectRuns.reduce((sum, run) => sum + (run.duration || 0), 0) / projectRuns.length : 0,
      popular_models: [
        { model_type: 'qwen3-7b', count: 3 },
        { model_type: 'yolov12s', count: 3 },
        { model_type: 'bert-base-uncased', count: 2 },
        { model_type: 'yolov12n', count: 1 },
        { model_type: 'yolov12m', count: 1 },
        { model_type: 'resnet50', count: 1 },
        { model_type: 'gpt2', count: 1 },
      ],
      recent_activity: [
        { type: 'run_started', message: 'Qwen3大模型微调 - run-010 开始RLHF训练', timestamp: '2024-02-01T14:00:00Z' },
        { type: 'run_completed', message: 'Qwen3大模型微调 - run-009 DPO对齐完成', timestamp: '2024-01-31T15:30:00Z' },
        { type: 'run_completed', message: 'Qwen3大模型微调 - run-008 指令微调完成', timestamp: '2024-01-30T12:00:00Z' },
        { type: 'run_started', message: 'YOLOv12目标检测优化 - run-007 开始训练', timestamp: '2024-01-30T09:00:00Z' },
        { type: 'run_completed', message: 'YOLOv12目标检测优化 - run-006 训练完成，mAP@0.5达到91.2%', timestamp: '2024-01-29T16:15:00Z' },
        { type: 'experiment_created', message: '创建新实验: Qwen3大模型微调', timestamp: '2024-01-25T16:00:00Z' },
        { type: 'experiment_created', message: '创建新实验: YOLOv12目标检测优化', timestamp: '2024-01-22T09:30:00Z' },
      ],
    }

    return mockApiCall(stats)
  },

  // 实验对比
  async compareExperimentRuns(runIds: string[]): Promise<ApiResponse<ExperimentComparison>> {
    const runs = mockExperimentRuns.filter((run) => runIds.includes(run.id))

    if (runs.length === 0) {
      return {
        success: false,
        data: {} as ExperimentComparison,
        error: '没有找到有效的运行记录',
      }
    }

    // 参数对比
    const allParameters = new Set<string>()
    runs.forEach((run) => {
      Object.keys(run.parameters).forEach((param) => allParameters.add(param))
    })

    const parameter_comparison = Array.from(allParameters).map((param) => ({
      parameter_name: param,
      parameter_type: ParameterType.HYPERPARAMETER,
      values: Object.fromEntries(runs.map((run) => [run.id, run.parameters[param]])),
      is_different: runs.some((run) => run.parameters[param] !== runs[0].parameters[param]),
    }))

    // 指标对比
    const allMetrics = new Set<string>()
    runs.forEach((run) => {
      Object.keys(run.metrics).forEach((metric) => allMetrics.add(metric))
    })

    const metric_comparison = Array.from(allMetrics).map((metric) => {
      const values = Object.fromEntries(runs.map((run) => [run.id, run.metrics[metric] || 0]))
      const metricValues = Object.values(values)
      const bestValue = Math.max(...metricValues)
      const bestRunId = Object.keys(values).find((id) => values[id] === bestValue) || ''

      return {
        metric_name: metric,
        metric_type: MetricType.CUSTOM,
        values,
        best_value: bestValue,
        best_run_id: bestRunId,
        improvement_percentage: metricValues.length > 1 ? (bestValue - Math.min(...metricValues)) / Math.min(...metricValues) * 100 : 0,
      }
    })

    // 找出最佳运行
    const best_run = runs.find((run) =>
      metric_comparison.some((mc) => mc.best_run_id === run.id),
    ) || runs[0]

    const comparison: ExperimentComparison = {
      runs,
      parameter_comparison,
      metric_comparison,
      best_run,
      summary: {
        total_runs: runs.length,
        different_parameters: parameter_comparison.filter((pc) => pc.is_different).length,
        compared_metrics: metric_comparison.length,
        best_overall_run_id: best_run.id,
        recommendations: [
          '建议使用最佳运行的参数配置',
          '考虑进一步优化学习率参数',
          '可以尝试增加训练轮数提升性能',
        ],
      },
    }

    return mockApiCall(comparison)
  },

  // 🆕 新增：按项目直接获取运行记录列表（重构后的主要方法）
  async getProjectRuns(projectId: string, params: ExperimentRunSearchParams = {}): Promise<ApiResponse<PaginatedResponse<ExperimentRun>>> {
    // 获取该项目下所有实验的运行记录
    const projectExperiments = mockExperiments.filter((exp) => exp.project_id === projectId)
    const experimentIds = projectExperiments.map((exp) => exp.id)

    let filteredRuns = mockExperimentRuns.filter((run) =>
      experimentIds.includes(run.experiment_id),
    )

    // 关键词搜索
    if (params.keyword) {
      const keyword = params.keyword.toLowerCase()
      filteredRuns = filteredRuns.filter((run) =>
        run.name.toLowerCase().includes(keyword)
        || Object.values(run.tags).some((tag) => tag.toLowerCase().includes(keyword)),
      )
    }

    // 状态筛选
    if (params.status && params.status.length > 0) {
      filteredRuns = filteredRuns.filter((run) =>
        params.status!.includes(run.status),
      )
    }

    // 创建者筛选
    if (params.created_by) {
      filteredRuns = filteredRuns.filter((run) =>
        run.created_by === params.created_by,
      )
    }

    // 模型类型筛选
    if (params.model_type) {
      filteredRuns = filteredRuns.filter((run) =>
        run.model_info?.model_type === params.model_type,
      )
    }

    // 时间范围筛选
    if (params.created_after) {
      filteredRuns = filteredRuns.filter((run) =>
        new Date(run.created_at) >= new Date(params.created_after!),
      )
    }

    if (params.created_before) {
      filteredRuns = filteredRuns.filter((run) =>
        new Date(run.created_at) <= new Date(params.created_before!),
      )
    }

    // 运行时长筛选
    if (params.duration_min !== undefined) {
      filteredRuns = filteredRuns.filter((run) =>
        (run.duration || 0) >= params.duration_min!,
      )
    }

    if (params.duration_max !== undefined) {
      filteredRuns = filteredRuns.filter((run) =>
        (run.duration || 0) <= params.duration_max!,
      )
    }

    // 排序
    const sortBy = params.sort_by || 'created_at'
    const sortOrder = params.sort_order || 'desc'

    filteredRuns.sort((a, b) => {
      let aValue: string | number
      let bValue: string | number

      switch (sortBy) {
        case 'name':
          aValue = a.name
          bValue = b.name
          break
        case 'duration':
          aValue = a.duration || 0
          bValue = b.duration || 0
          break
        case 'status':
          aValue = a.status
          bValue = b.status
          break
        default:
          aValue = a.created_at
          bValue = b.created_at
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1
      }
      else {
        return aValue < bValue ? 1 : -1
      }
    })

    // 分页
    const page = params.page || 1
    const pageSize = params.page_size || 10
    const paginatedData = paginate(filteredRuns, page, pageSize)

    return mockApiCall(paginatedData)
  },

  // 🆕 新增：获取项目的训练统计信息（重构后使用）
  async getProjectTrainingStats(projectId: string): Promise<ApiResponse<{
    total_runs: number
    running_count: number
    finished_count: number
    failed_count: number
    success_rate: number
    avg_duration: number
    recent_runs: ExperimentRun[]
  }>> {
    const projectExperiments = mockExperiments.filter((exp) => exp.project_id === projectId)
    const experimentIds = projectExperiments.map((exp) => exp.id)
    const allRuns = mockExperimentRuns.filter((run) => experimentIds.includes(run.experiment_id))

    const stats = {
      total_runs: allRuns.length,
      running_count: allRuns.filter((run) => run.status === ExperimentRunStatus.RUNNING).length,
      finished_count: allRuns.filter((run) => run.status === ExperimentRunStatus.FINISHED).length,
      failed_count: allRuns.filter((run) => run.status === ExperimentRunStatus.FAILED).length,
      success_rate: allRuns.length > 0
        ? allRuns.filter((run) => run.status === ExperimentRunStatus.FINISHED).length / allRuns.length
        : 0,
      avg_duration: allRuns.length > 0
        ? allRuns.reduce((sum, run) => sum + (run.duration || 0), 0) / allRuns.length
        : 0,
      recent_runs: allRuns
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 10),
    }

    return mockApiCall(stats)
  },
}

export default mockExperimentService
