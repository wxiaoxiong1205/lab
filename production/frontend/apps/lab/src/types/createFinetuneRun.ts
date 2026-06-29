import type { DataConfigValue } from '@/components/finetune/EnhancedDataConfig'

export interface LocalTrainingDataset {
  id: number
  project_id: number
  dataset_name: string
  description?: string
  dataset_format: string
  created_at: string
  earliest_version: string
  latest_version: string
  training_method_type: string
  version_count: number
  dataset_type: string
  usage?: string
}

export interface LocalValidationDataset {
  id: string
  name: string
  description?: string
  format: string
  record_count: number
  status: string
}

export interface FormValues {
  version: string
  name: string
  description?: string
  base_provider: string
  base_model_name: string
  data_config: DataConfigValue
  training_type: string
  fine_tuning_type?: string // 新增：微调类型
  deepspeed_enabled?: boolean
  deepspeed?: string
  num_train_epochs: number
  learning_rate: number
  max_length: number
  batch_size: number
  per_device_train_batch_size?: number // 新增：每个设备的训练批次大小
  logging_interval: number
  logging_steps?: number // 新增：日志步数
  warmup_steps: number
  warmup_ratio?: number // 新增：预热比例
  weight_decay: number
  save_strategy: string
  save_steps: number
  save_total_limit: number
  early_stopping: boolean
  lora_rank: number
  lora_alpha: number
  lora_dropout: number
  lora_target: string
  bias: string
  gpu_config: string
  gpu_count?: number // 新增：GPU数量
  validation_split: number
  mixed_precision: boolean
  bf16?: boolean // 新增：bf16精度
  template?: string
  gradient_checkpointing: boolean
  dataloader_num_workers: number
  gradient_accumulation_steps: number
  max_grad_norm: number
  lr_scheduler_type: string
  pseudo_probability: number
  checkpoint_save_strategy: string
  checkpoint_save_total_limit: number
  validation_steps: number
  checkpoint_save_steps: number
  random_seed: number
  seed?: number // 新增：随机种子
  cosine_period: number
  polynomial_decay_end_lr: number
  polynomial_decay_power: number
  rope_scaling: string
  train_type_category: string
  data_format?: string
  cutoff_len?: number // 新增：截断长度
  preprocessing_num_workers?: number // 新增：预处理工作进程数
  image_resolution?: number
  max_images_per_sample?: number
  prompt_max_length?: number
  negative_prompt_max_length?: number
  image_resize_mode?: string
  // 评估相关字段
  eval_split_ratio: number
  eval_steps: number
  eval_strategy: string
  eval_use_split: boolean
  greater_is_better: boolean
  load_best_model_at_end: boolean
  metric_for_best_model: string
  per_device_eval_batch_size: number
  beta: number
  reference_free: boolean
  loss_type: string
  label_smoothing: number
  max_prompt_length: number
  preference_prompt: string
  remove_unused_columns: boolean
  gradient_checkpointing_kwargs: string
  additional_params: string
  advanced_template_id?: number
  advanced_template_name?: string
  advanced_template_mode?: 'template' | 'custom'
  advanced_template_yaml?: string
  advanced_template_params?: Record<string, string | number | boolean | null>
  reward_rule_file?: Array<{ name?: string, originFileObj?: File }>
  reward_rule_upload_id?: string
  gpu_type: string[]
  gpu_model: string
  gpu_memory: string
  k8s_resource_type?: string // Kubernetes资源类型
  // 新增字段
  base_model_id?: number // 基础模型ID
  base_model_provider?: string // 基础模型提供商
  graphics_card_resource?: {
    cpu_request?: number
    cpu_limit?: number
    memory_request?: number
    memory_limit?: number
  }
  ray_resource_config?: {
    submit_graphics_card_resource?: {
      card_selector?: string[]
      card_type?: string | null
      card_model?: string | null
      count?: number | null
      card_memory?: string | null
      k8s_resource_type?: string | null
      cpu_request?: number
      cpu_limit?: number
      memory_request?: number
      memory_limit?: number
    }
    head_graphics_card_resource?: {
      card_selector?: string[]
      card_type?: string | null
      card_model?: string | null
      count?: number | null
      card_memory?: string | null
      k8s_resource_type?: string | null
      cpu_request?: number
      cpu_limit?: number
      memory_request?: number
      memory_limit?: number
    }
    worker_replicas?: number
    worker_graphics_card_resource?: {
      card_selector?: string[]
      card_type?: string | null
      card_model?: string | null
      count?: number | null
      card_memory?: string | null
      k8s_resource_type?: string | null
      cpu_request?: number
      cpu_limit?: number
      memory_request?: number
      memory_limit?: number
    }
  }
  // 任务定时配置
  schedule_enabled?: boolean
  schedule_date?: any
  schedule_time?: any
}
