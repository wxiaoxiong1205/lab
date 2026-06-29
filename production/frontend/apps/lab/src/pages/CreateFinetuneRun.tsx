import React, { useEffect, useState } from 'react'
import {
  Button,
  Form,
  Row,
  Steps,
  message,
} from 'antd'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import './styles/finetune.scss'
import { useQueryClient } from '@tanstack/react-query'
import { ModelService } from '@/services/modelsApi'
import type { FormValues, LocalTrainingDataset, LocalValidationDataset } from '@/types/createFinetuneRun'
import type { DataConfigValue } from '@/components/finetune/EnhancedDataConfig'
import EnhancedDataConfig from '@/components/finetune/EnhancedDataConfig'
import BasicConfig from '@/components/finetune/BasicConfig'
import ModelConfig from '@/components/finetune/ModelConfig'
import TrainingConfig from '@/components/finetune/TrainingConfig'
import ResourceConfig from '@/components/finetune/ResourceConfig'
import GrpoRayResourceConfig from '@/components/finetune/GrpoRayResourceConfig'
import { finetuneTaskService } from '@/services/FinetuneTrainingServices'
import { getProjectEnum } from '@/services/api'
import { useConfigStore } from '@/stores/configStore'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'

/**
 * 创建训练运行页面 - 单页面多模块设计
 * 在特定实验下创建新的训练运行
 */

const createDefaultRayNodeResource = (overrides: Partial<{
  card_selector: string[]
  card_type: string
  card_model: string
  count: number | null
  card_memory: string | null
  k8s_resource_type: string | null
  cpu_request: number
  cpu_limit: number
  memory_request: number
  memory_limit: number
}> = {}) => ({
  card_selector: overrides.card_selector,
  card_type: overrides.card_type,
  card_model: overrides.card_model,
  count: overrides.count ?? null,
  card_memory: null,
  k8s_resource_type: null,
  cpu_request: 0.5,
  cpu_limit: 16,
  memory_request: 0.5,
  memory_limit: 16,
  ...overrides,
})

const createDefaultRayCpuNodeResource = () =>
  createDefaultRayNodeResource({
    card_selector: ['CPU', 'CPU'],
    card_type: 'CPU',
    card_model: 'CPU',
    count: 0,
    card_memory: null,
    k8s_resource_type: null,
  })

const createDefaultGraphicsCardResource = () => ({
  cpu_request: 0.5,
  cpu_limit: 16,
  memory_request: 0.5,
  memory_limit: 16,
})

const defaultValues = {
  base_provider: 'Qwen', // 默认选择Qwen
  training_type: 'sft',
  num_train_epochs: 3, // 对应num_train_epochs
  learning_rate: 0.00005, // 用户指定的值
  lr_scheduler_type: 'cosine', // 用户指定的值
  gradient_accumulation_steps: 1, // 用户指定的值
  batch_size: 2, // 对应per_device_train_batch_size
  mixed_precision: true, // 对应bf16
  warmup_ratio: 0.1, // 用户指定的值
  bf16: true,
  // bias: 'none',
  train_type_category: 'text-generation',
  eval_strategy: 'steps',
  // eval_split_ratio: 0.1,
  per_device_eval_batch_size: 2,
  preprocessing_num_workers: 16,
  per_device_train_batch_size: 2,
  metric_for_best_model: 'loss',
  beta: 0.5,
  reference_free: false,
  loss_type: 'mse',
  label_smoothing: 0.1,
  max_prompt_length: 4096,
  max_length: 4096,
  remove_unused_columns: false,
  cutoff_len: 4096,
  image_resolution: 1024,
  max_images_per_sample: 1,
  prompt_max_length: 512,
  negative_prompt_max_length: 256,
  image_resize_mode: 'keep_ratio',
  logging_interval: 1,
  warmup_steps: 100,
  weight_decay: 0,
  eval_steps: 20,
  save_strategy: 'steps',
  logging_steps: 5,
  early_stopping: false,
  lora_rank: 16,
  lora_target: 'all',
  lora_alpha: 32,
  lora_dropout: 0,
  validation_split: 0.1,
  gradient_checkpointing: false,
  dataloader_num_workers: 4,
  max_grad_norm: 1.0,
  pseudo_probability: 0.0,
  checkpoint_save_strategy: 'stop',
  checkpoint_save_total_limit: 1,
  validation_steps: 16,
  checkpoint_save_steps: 64,
  seed: 42,
  cosine_period: 0.5,
  polynomial_decay_end_lr: 0.00000001,
  polynomial_decay_power: 1,
  rope_scaling: 'yarn',
  fine_tuning_type: 'full',
  template: '',
  deepspeed_enabled: true,
  deepspeed: 'ZeRO-0',
  gpu_count: null,
  graphics_card_resource: createDefaultGraphicsCardResource(),
  schedule_enabled: false,
  advanced_template_mode: 'template',
  advanced_template_params: {},
  advanced_template_yaml: '',
  ray_resource_config: {
    submit_graphics_card_resource: createDefaultRayCpuNodeResource(),
    head_graphics_card_resource: createDefaultRayCpuNodeResource(),
    worker_replicas: 1,
    worker_graphics_card_resource: createDefaultRayNodeResource(),
  },
}

const FALLBACK_TRAINING_TYPE_CATEGORY = {
  enum_name: 'TrainingTypeCategory',
  options: [
    { value: 'text-generation', name: '文本生成', description: '文本生成训练' },
    { value: 'image-generation', name: '图像生成', description: '图像生成训练' },
    { value: 'image-understanding', name: '图像理解', description: '图像理解训练' },
  ],
}

const FALLBACK_TRAINING_METHOD_CATEGORY = {
  enum_name: 'TrainingMethodType',
  options: [
    { value: 'sft', name: 'SFT', description: '有监督微调' },
    { value: 'dpo', name: 'DPO', description: '偏好优化训练' },
    { value: 'grpo', name: 'RFT-GRPO', description: '基于奖励规则的强化学习训练' },
  ],
}

const buildRayNodeResourceFormValue = (resource?: {
  card_type?: string | null
  card_model?: string | null
  count?: number | null
  card_memory?: string | null
  k8s_resource_type?: string | null
  cpu_request?: number | null
  cpu_limit?: number | null
  memory_request?: number | null
  memory_limit?: number | null
}) => ({
  ...createDefaultRayNodeResource(),
  card_selector: resource?.card_type && resource?.card_model
    ? [resource.card_type, resource.card_model]
    : undefined,
  card_type: resource?.card_type ?? undefined,
  card_model: resource?.card_model ?? undefined,
  count: resource?.count ?? null,
  card_memory: resource?.card_memory ?? null,
  k8s_resource_type: resource?.k8s_resource_type ?? null,
  cpu_request: resource?.cpu_request ?? 0.5,
  cpu_limit: resource?.cpu_limit ?? 16,
  memory_request: resource?.memory_request ?? 0.5,
  memory_limit: resource?.memory_limit ?? 16,
})

const createEmptyDataConfig = () => ({
  training_datasets: [],
  validation_config: {
    type: 'split',
    split_ratio: 15,
  },
  validation_datasets: [],
})

const normalizeTrainingMethodType = (value?: unknown) => {
  if (typeof value !== 'string')
    return undefined

  const normalized = value.toLowerCase()
  if (normalized.includes('dpo'))
    return 'dpo'
  if (normalized.includes('sft'))
    return 'sft'
  if (normalized.includes('grpo'))
    return 'grpo'

  return normalized
}

const getTrainingMethodType = (trainingType?: any) => {
  return normalizeTrainingMethodType(trainingType?.train_method_type || trainingType?.training_method_type)
}

const CreateFinetuneRun: React.FC = () => {
  const navigate = useNavigate()
  const { projectId, experimentId } = useParams<{ projectId: string, experimentId: string }>()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const taskName = searchParams.get('taskName') || ''
  const isEditMode = searchParams.get('edit') === '1'
  const datasetName = searchParams.get('datasetName') || ''
  const datasetId = searchParams.get('datasetId') || ''
  const [form] = Form.useForm()
  const [datasets, setDatasets] = useState<LocalTrainingDataset[]>([])
  const [validationDatasets, setValidationDatasets] = useState<LocalValidationDataset[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [resourceConfigLoading, setResourceConfigLoading] = useState(Boolean(taskName && !isEditMode))
  const [currentStep, setCurrentStep] = useState(0)
  const [modelVersions, setModelVersions] = useState([])
  const [dataConfigResetKey, setDataConfigResetKey] = useState(0)
  const [forcedTrainingMethodType, setForcedTrainingMethodType] = useState<string | undefined>()
  const baseProvider = Form.useWatch('base_provider', form)
  const trainTypeCategory = Form.useWatch('train_type_category', form)
  const watchedTrainingMethod = Form.useWatch('training_type', form)
  const [dataConfig, setDataConfig] = useState<any>(createEmptyDataConfig())
  /**
   * 组件挂载时获取项目枚举值并存储到本地
   */
  // 训练类型
  const [TrainingTypeCategory, setTrainingTypeCategory] = useState(null)
  // 模型提供商
  const [ModelProviderCategory, setModelProviderCategory] = useState(null)
  // 训练方法
  const [TrainingMethodCategory, setTrainingMethodCategory] = useState(null)
  // RoPE（旋转位置编码）类型
  const [MonitoringConfigCategory, setMonitoringConfigCategory] = useState(null)
  // 评估策略
  const [EvalStrategyCategory, setEvalStrategyCategory] = useState(null)
  // 学习率调度器类型
  const [LrSchedulerTypeCategory, setLrSchedulerTypeCategory] = useState(null)
  // 保存策略
  const [SaveStrategyCategory, setSaveStrategyCategory] = useState(null)
  // 支持显卡型号
  const [SupportedGpuCategory, setSupportedGpuCategory] = useState<{ value: string, name: string, description?: string }[]>([])
  const [taskInfo, setTaskInfo] = useState<any>(null)
  const [allocatableResources, setAllocatableResources] = useState<any>(undefined)
  const { config, providerType } = useConfigStore()
  const effectiveTrainingMethod = watchedTrainingMethod || forcedTrainingMethodType || getTrainingMethodType(taskInfo?.training_type)
  const isGrpoResourceMode = normalizeTrainingMethodType(effectiveTrainingMethod) === 'grpo' || effectiveTrainingMethod === 'rft'
  useEffect(() => {
    const fetchProjectEnumValues = async () => {
      let cachedEnumValues = JSON.parse(localStorage.getItem('projectEnumValues') || '{}')
      if (!cachedEnumValues?.all_enums) {
        const data = await getProjectEnum()
        localStorage.setItem('projectEnumValues', JSON.stringify(data))
        cachedEnumValues = data
      }
      if (cachedEnumValues) {
        const allEnums = Array.isArray(cachedEnumValues.all_enums) ? cachedEnumValues.all_enums : []
        setTrainingTypeCategory(allEnums.find((item) => item.enum_name === 'TrainingTypeCategory') || FALLBACK_TRAINING_TYPE_CATEGORY)
        setModelProviderCategory(allEnums.find((item) => item.enum_name === 'ModelProvider'))
        setTrainingMethodCategory(allEnums.find((item) => item.enum_name === 'TrainingMethodType') || FALLBACK_TRAINING_METHOD_CATEGORY)
        setMonitoringConfigCategory(allEnums.find((item) => item.enum_name === 'RoPEType'))
        setEvalStrategyCategory(allEnums.find((item) => item.enum_name === 'EvalStrategy'))
        setLrSchedulerTypeCategory(allEnums.find((item) => item.enum_name === 'LRSchedulerType'))
        setSaveStrategyCategory(allEnums.find((item) => item.enum_name === 'SaveStrategy'))
        setSupportedGpuCategory(allEnums.find((item) => item.enum_name === 'CardModel')?.options)
      }
    }
    fetchProjectEnumValues()
  }, [])
  const fetchModelVersions = async () => {
    try {
      const data = await ModelService.getBaseModels({
        model_provider: baseProvider,
        model_type: trainTypeCategory,
        is_available: true,
        model_tags: 'training',
      })
      if (trainTypeCategory === 'image-understanding') {
        const baseModels = data.items.filter((model: any) => model.model_provider === baseProvider).map((item) => item.name === 'Qwen3-VL-30B-A3B-Instruct' ? { ...item, isUse: true } : item)
        setModelVersions(baseModels)
        return
      }
      const baseModels = data.items.filter((model) => model.model_provider === baseProvider)
      setModelVersions(baseModels)
    }
    catch (error) {
      console.error('Failed to fetch model versions:', error)
    }
    finally {
    }
  }
  useEffect(() => {
    if (baseProvider && trainTypeCategory) {
      fetchModelVersions()
    }
  }, [baseProvider, trainTypeCategory])

  useEffect(() => {
    // 回显
    if (taskName) {
      const taskInfo = JSON.parse(localStorage.getItem('taskInfo') || '{}')
      if (!isEditMode) {
        const currentVersion = taskInfo.version || 'V1'
        const versionNumber = parseInt(currentVersion.replace('V', '')) || 1
        taskInfo.version = `V${versionNumber + 1}`
      }
      setTaskInfo(taskInfo)
      const taskTrainingMethod = getTrainingMethodType(taskInfo?.training_type)
      setForcedTrainingMethodType(taskTrainingMethod)
      const trainCategory = taskInfo?.training_type?.train_type_category as string | undefined

      const trainingItems = Array.isArray(taskInfo?.dataset_items) ? [...taskInfo.dataset_items] : []
      const evalItems = Array.isArray(taskInfo?.eval_dataset_items) ? [...taskInfo.eval_dataset_items] : []
      const isGrpoTask = normalizeTrainingMethodType(taskTrainingMethod) === 'grpo'
      const validationType: 'split' | 'platform' = isGrpoTask
        ? 'split'
        : taskInfo?.evaluation?.eval_use_split === false && evalItems.length > 0
          ? 'platform'
          : 'split'
      const rewardRuleUploadId = taskInfo?.reward_function_upload_id ?? taskInfo?.grpo_config?.reward_rule_upload_id
      const rewardRuleFileName = taskInfo?.reward_function_file_name ?? taskInfo?.grpo_config?.reward_rule_file_name

      const data_config = {
        training_datasets: trainingItems,
        validation_datasets: validationType === 'platform' ? evalItems : [],
        validation_config: {
          type: validationType,
          ...(taskInfo?.evaluation?.eval_split_ratio !== undefined && taskInfo?.evaluation?.eval_split_ratio !== null && {
            split_ratio: taskInfo?.evaluation?.eval_split_ratio * 100,
          }),
        },
      }
      const taskValues = {
        // 显卡配置
        gpu_count: taskInfo?.graphics_card_resource?.count || taskInfo.gpu_count,
        gpu_model: taskInfo?.graphics_card_resource?.card_model,
        gpu_memory: taskInfo?.graphics_card_resource?.card_memory,
        gpu_type: taskInfo?.graphics_card_resource ? [
          taskInfo.graphics_card_resource.card_type,
          taskInfo.graphics_card_resource.card_model,
        ] : undefined,
        // 显卡资源配置
        graphics_card_resource: {
          ...createDefaultGraphicsCardResource(),
          cpu_request: taskInfo?.graphics_card_resource?.cpu_request ?? 0.5,
          cpu_limit: taskInfo?.graphics_card_resource?.cpu_limit ?? 16,
          memory_request: taskInfo?.graphics_card_resource?.memory_request ?? 0.5,
          memory_limit: taskInfo?.graphics_card_resource?.memory_limit ?? 16,
        },
        description: taskInfo.description,
        // 定时任务配置（加载时回填，展示在任务描述前）
        ...(taskInfo?.schedule_at && (() => {
          const scheduleDateTime = dayjs(taskInfo.schedule_at)
          return {
            schedule_enabled: true,
            schedule_date: scheduleDateTime,
            schedule_time: scheduleDateTime,
          }
        })()),
        // 微调类型
        training_type: taskTrainingMethod,
        fine_tuning_type: taskInfo.training_type.fine_tuning_type,
        deepspeed_enabled: Boolean(taskInfo?.deepspeed),
        deepspeed: taskInfo?.deepspeed || 'ZeRO-0',
        train_type_category: trainCategory ?? 'text-generation',
        data_format: taskInfo?.training_type?.dataset_format
          || (taskInfo?.training_type?.train_type_category === 'image-generation'
              ? 'image-prompt'
              : taskInfo?.training_type?.train_type_category === 'image-understanding' ? 'role-based' : 'prompt-response'),
        // 基础参数
        bf16: taskInfo.basic.bf16,
        gradient_accumulation_steps: taskInfo.basic.gradient_accumulation_steps,
        learning_rate: taskInfo.basic.learning_rate,
        lr_scheduler_type: taskInfo.basic.lr_scheduler_type,
        num_train_epochs: taskInfo.basic.num_train_epochs,
        per_device_train_batch_size: taskInfo.basic.per_device_train_batch_size,
        template: taskInfo?.template,
        warmup_ratio: taskInfo.basic.warmup_ratio,

        // 高级参数
        gradient_checkpointing: taskInfo.advanced.gradient_checkpointing,
        max_grad_norm: taskInfo.advanced.max_grad_norm,
        rope_scaling: taskInfo.advanced.rope_scaling,
        seed: taskInfo.advanced.seed,
        weight_decay: taskInfo.advanced.weight_decay,

        // LoRA参数
        ...(taskInfo?.lora_config && {
          lora_alpha: taskInfo?.lora_config.lora_alpha,
          lora_dropout: taskInfo?.lora_config.lora_dropout,
          lora_rank: taskInfo?.lora_config.lora_rank,
          lora_target: taskInfo?.lora_config.lora_target,
        }),
        ...(taskInfo?.dpo_config && {
          beta: taskInfo.dpo_config.pref_beta,
        }),
        ...(isGrpoTask && {
          advanced_template_mode: taskInfo?.advanced_template_id ? 'template' : 'custom',
          advanced_template_id: taskInfo?.advanced_template_id,
          advanced_template_name: taskInfo?.advanced_template_name,
          advanced_template_yaml: taskInfo?.advanced_template_yaml || '',
          advanced_template_params: taskInfo?.additional_params || {},
        }),
        ...(rewardRuleUploadId && {
          reward_rule_upload_id: rewardRuleUploadId,
          reward_rule_file: rewardRuleFileName
            ? [{ name: rewardRuleFileName }]
            : undefined,
        }),

        // 数据处理参数
        cutoff_len: taskInfo?.data_processing.cutoff_len,
        preprocessing_num_workers: taskInfo?.data_processing.preprocessing_num_workers,
        image_resolution: taskInfo?.additional_params?.image_resolution ?? 1024,
        max_images_per_sample: taskInfo?.additional_params?.max_images_per_sample ?? 1,
        prompt_max_length: taskInfo?.additional_params?.prompt_max_length ?? 512,
        negative_prompt_max_length: taskInfo?.additional_params?.negative_prompt_max_length ?? 256,
        image_resize_mode: taskInfo?.additional_params?.image_resize_mode ?? 'keep_ratio',

        // 评估参数
        ...(taskInfo?.evaluation?.eval_split_ratio !== undefined && taskInfo?.evaluation?.eval_split_ratio !== null && {
          eval_split_ratio: taskInfo?.evaluation.eval_split_ratio,
        }),
        eval_steps: taskInfo?.evaluation.eval_steps,
        eval_strategy: taskInfo?.evaluation.eval_strategy,
        eval_use_split: taskInfo?.evaluation.eval_use_split,
        greater_is_better: taskInfo?.evaluation.greater_is_better,
        load_best_model_at_end: taskInfo?.evaluation?.load_best_model_at_end,
        metric_for_best_model: taskInfo?.evaluation?.metric_for_best_model,
        per_device_eval_batch_size: taskInfo?.evaluation?.per_device_eval_batch_size,

        // 监控参数
        logging_steps: taskInfo?.monitor.logging_steps,

        // 保存参数
        save_steps: taskInfo?.save?.save_steps,
        save_strategy: taskInfo?.save?.save_strategy,
        save_total_limit: taskInfo?.save?.save_total_limit,

        // 额外参数
        dataloader_num_workers: taskInfo?.additional_params?.dataloader_num_workers,
        ...(taskInfo?.ray_resource_config && {
          ray_resource_config: {
            submit_graphics_card_resource: buildRayNodeResourceFormValue(taskInfo.ray_resource_config.submit_graphics_card_resource),
            head_graphics_card_resource: buildRayNodeResourceFormValue(taskInfo.ray_resource_config.head_graphics_card_resource),
            worker_replicas: taskInfo.ray_resource_config.worker_replicas ?? 1,
            worker_graphics_card_resource: buildRayNodeResourceFormValue(taskInfo.ray_resource_config.worker_graphics_card_resource),
          },
        }),

        // 数据集参数
        data_config,

      }
      setDataConfig(data_config)
      setDataConfigResetKey((key) => key + 1)
      form.setFieldsValue(taskValues)
      if (rewardRuleUploadId) {
        form.setFields([
          { name: 'reward_rule_upload_id', value: rewardRuleUploadId, errors: [] },
        ])
      }
    }
    else {
      setForcedTrainingMethodType(undefined)
      form.setFieldsValue(defaultValues)
    }
  }, [experimentId, form])
  useEffect(() => {
    if (datasetName === 'training') {
      const datasetInfo = JSON.parse(localStorage.getItem('datasetInfo') || '{}')
      const trainingMethodType = normalizeTrainingMethodType(datasetInfo.training_method_type || datasetInfo.train_method_type)
      setForcedTrainingMethodType(trainingMethodType)
      const training_datasets = {
        character_count: datasetInfo.total_characters,
        dataset_path: datasetInfo.dataset_path,
        name: datasetInfo.name,
        version: datasetInfo.version,
        sample_count: datasetInfo.total_samples,
        sampling_rate: 1,
        weight_in_total: 100,
        dataset_format: datasetInfo.dataset_format,
      }
      const data_config = {
        training_datasets: [training_datasets],
        validation_datasets: [],
        validation_config: {
          type: 'split',
          split_ratio: 15,
        },
      }
      setDataConfig(data_config)
      form.setFieldsValue({
        data_config,
        ...(trainingMethodType ? { training_type: trainingMethodType } : {}),
        ...(datasetInfo.dataset_type ? { train_type_category: datasetInfo.dataset_type } : {}),
        ...(datasetInfo.dataset_format ? { data_format: datasetInfo.dataset_format } : {}),
        ...(datasetInfo.dataset_type === 'image-generation'
          ? {
              training_type: 'sft',
              data_format: 'image-prompt',
              image_resolution: 1024,
              max_images_per_sample: 1,
              prompt_max_length: 512,
              negative_prompt_max_length: 256,
              image_resize_mode: 'keep_ratio',
            }
          : {}),
      })
    }
    else if (datasetName === 'validation') {
      setForcedTrainingMethodType(undefined)
      const datasetInfo = JSON.parse(localStorage.getItem('datasetInfo') || '{}')
      const validation_datasets = {
        character_count: datasetInfo.total_characters,
        dataset_path: datasetInfo.dataset_path,
        name: datasetInfo.name,
        version: datasetInfo.version,
        sample_count: datasetInfo.total_samples,
        sampling_rate: 1,
        weight_in_total: 100,
      }
      const data_config = {
        training_datasets: [],
        validation_datasets: [validation_datasets],
        validation_config: {
          type: 'platform',
          split_ratio: 15,
        },
      }
      setDataConfig(data_config)
      form.setFieldsValue({ data_config })
    }
  }, [datasetName])

  // 获取返回路径
  const getBackPath = () => {
    if (taskName) {
      return `/project/${projectId}/training/tasks/${taskName}?activeTab=versions`
    }
    else if (datasetName) {
      return `/project/${projectId}/datasets/training/${datasetId}`
    }
    else {
      return `/project/${projectId}/training`
    }
  }

  // 处理取消返回
  const handleCancel = () => {
    navigate(getBackPath())
  }

  // 提交创建运行
  const handleSubmit = async (values: FormValues) => {
    setSubmitting(true)
    try {
      // 构建数据集配置
      const datasetItems = values.data_config.training_datasets.map((dataset) => ({
        character_count: dataset.character_count,
        dataset_path: dataset.dataset_path,
        name: dataset.name,
        version: dataset.version,
        sample_count: dataset.sample_count,
        sampling_rate: dataset.sampling_rate,
        weight_in_total: dataset.weight_in_total,
      }))

      // 构建验证数据集配置
      const evalDatasetItems = values.data_config.validation_config.type === 'platform'
        ? (values.data_config.validation_datasets || []).map((dataset) => ({
            character_count: dataset.character_count,
            dataset_path: dataset.dataset_path,
            name: dataset.name,
            version: dataset.version,
            sample_count: dataset.sample_count,
            sampling_rate: dataset.sampling_rate,
            weight_in_total: dataset.weight_in_total,
          }))
        : []

      // 构建后端数据格式 - 按照后端API要求的格式
      const scheduleEnabled = values.schedule_enabled === true
      const scheduleDate = scheduleEnabled ? dayjs(values.schedule_date).format('YYYY-MM-DD') : undefined
      const scheduleTime = scheduleEnabled ? dayjs(values.schedule_time).format('HH:mm:ss') : undefined
      const scheduleAt = scheduleEnabled && scheduleDate && scheduleTime ? `${scheduleDate}T${scheduleTime}` : undefined

      const trainMethodType = taskName
        ? getTrainingMethodType(taskInfo?.training_type)
        : values.training_type
      const normalizedTrainMethodType = normalizeTrainingMethodType(trainMethodType)
      const isGrpoTraining = normalizedTrainMethodType === 'grpo' || trainMethodType === 'rft'
      const isImageGenerationTraining = values.train_type_category === 'image-generation'
      const isBelleProvider = config?.PROVIDER_TYPE === providerType

      const datasetFormat = values.data_config.training_datasets?.[0]?.dataset_format || values.data_format
      const buildRayResource = (resource?: {
        card_selector?: (string | number)[]
        card_type?: string | null
        card_model?: string | null
        count?: number | null
        card_memory?: string | null
        k8s_resource_type?: string | null
        cpu_request?: number
        cpu_limit?: number
        memory_request?: number
        memory_limit?: number
      }) => ({
        card_type: resource?.card_type ?? (resource?.card_selector?.[0] != null ? String(resource.card_selector[0]) : undefined),
        card_model: resource?.card_model ?? (resource?.card_selector?.[1] != null ? String(resource.card_selector[1]) : undefined),
        count: resource?.count,
        card_memory: resource?.card_memory ?? null,
        k8s_resource_type: resource?.k8s_resource_type ?? null,
        cpu_request: resource?.cpu_request,
        cpu_limit: resource?.cpu_limit,
        memory_request: resource?.memory_request,
        memory_limit: resource?.memory_limit,
      })
      const workerGraphicsCardResource = {
        card_type: values.gpu_type?.[0],
        card_model: isBelleProvider ? allocatableResources?.gpu_model : values.gpu_model,
        count: values.gpu_count,
        card_memory: values.gpu_memory,
        k8s_resource_type: isBelleProvider ? values.gpu_type?.[0] : values.k8s_resource_type,
        ...(isBelleProvider && allocatableResources && {
          cpu: values.graphics_card_resource?.cpu_limit,
          memory: values.graphics_card_resource?.memory_limit,
          queue_group_id: allocatableResources.queue_group_id,
        }),
        cpu_request: values.graphics_card_resource?.cpu_request,
        cpu_limit: values.graphics_card_resource?.cpu_limit,
        memory_request: values.graphics_card_resource?.memory_request,
        memory_limit: values.graphics_card_resource?.memory_limit,
      }

      const commonBackendData = {
        name: values.name,
        description: values.description,
        project_id: Number(projectId),
        ...(scheduleAt && { schedule_at: scheduleAt }),
        version: values.version,
        training_type: {
          ...({ fine_tuning_type: isGrpoTraining ? 'full' : values.fine_tuning_type }),
          train_method_type: trainMethodType,
          train_type_category: values.train_type_category,
          ...(!isGrpoTraining && datasetFormat ? { dataset_format: datasetFormat } : {}),
        },
        base_model: {
          base_model_id: values.base_model_id, // 需要从表单中获取
          base_model_name: values.base_model_name,
          model_provider: values.base_provider,
          template: values.template || '',
        },
        dataset_items: datasetItems,
        eval_dataset_items: evalDatasetItems,
      }

      const backendData = isGrpoTraining
        ? {
            ...commonBackendData,
            advanced_template_id: values.advanced_template_mode === 'template' ? values.advanced_template_id : undefined,
            additional_params: values.advanced_template_params || {},
            reward_function_upload_id: values.reward_rule_upload_id || taskInfo?.reward_function_upload_id,
            ray_resource_config: {
              submit_graphics_card_resource: buildRayResource(values.ray_resource_config?.submit_graphics_card_resource),
              head_graphics_card_resource: buildRayResource(values.ray_resource_config?.head_graphics_card_resource),
              worker_replicas: values.ray_resource_config?.worker_replicas,
              worker_graphics_card_resource: buildRayResource(values.ray_resource_config?.worker_graphics_card_resource),
            },
          }
        : {
            ...commonBackendData,
            gpu_count: values.gpu_count,
            ...(values.deepspeed_enabled && values.deepspeed ? { deepspeed: values.deepspeed } : {}),
            template: values.template,

            // 基础训练参数
            basic: {
              bf16: values.bf16,
              gradient_accumulation_steps: values.gradient_accumulation_steps,
              learning_rate: values.learning_rate,
              lr_scheduler_type: values.lr_scheduler_type,
              num_train_epochs: values.num_train_epochs,
              per_device_train_batch_size: values.per_device_train_batch_size,
              warmup_ratio: values.warmup_ratio,
            },

            // 高级参数
            advanced: {
              gradient_checkpointing: values.gradient_checkpointing,
              max_grad_norm: values.max_grad_norm,
              rope_scaling: values.rope_scaling,
              seed: values.seed || values.random_seed,
              weight_decay: values.weight_decay,
            },

            // LoRA配置 - 仅在非full微调时包含
            ...(values.fine_tuning_type !== 'full' && {
              lora_config: {
                lora_alpha: values.lora_alpha,
                lora_dropout: values.lora_dropout,
                lora_rank: values.lora_rank,
                lora_target: values.lora_target,
              },
            }),

            // 数据处理配置
            data_processing: {
              cutoff_len: values.cutoff_len || values.max_length,
              preprocessing_num_workers: values.preprocessing_num_workers,
            },

            // 评估配置
            evaluation: {
              ...(values.data_config.validation_config.split_ratio !== undefined && values.data_config.validation_config.split_ratio !== null && {
                eval_split_ratio: values.data_config.validation_config.split_ratio / 100,
              }),
              eval_steps: values.eval_steps,
              eval_strategy: values.eval_strategy,
              eval_use_split: values.data_config.validation_config.type === 'split',
              greater_is_better: values.greater_is_better,
              load_best_model_at_end: values.load_best_model_at_end,
              metric_for_best_model: values.metric_for_best_model,
              per_device_eval_batch_size: values.per_device_eval_batch_size,
            },
            // 监控配置
            monitor: {
              logging_steps: values.logging_steps || values.logging_interval,
            },

            // 保存配置
            save: {
              save_steps: values.save_steps,
              save_strategy: values.save_strategy,
              save_total_limit: values.save_total_limit,
            },

            // 额外参数
            additional_params: {
              dataloader_num_workers: values.dataloader_num_workers,
              ...(isImageGenerationTraining
                ? {
                    image_resolution: values.image_resolution,
                    max_images_per_sample: values.max_images_per_sample,
                    prompt_max_length: values.prompt_max_length,
                    negative_prompt_max_length: values.negative_prompt_max_length,
                    image_resize_mode: values.image_resize_mode,
                  }
                : {}),
            },
            ...(trainMethodType === 'dpo' && {
              dpo_config: {
                pref_beta: values.beta,
              },
            }),
            graphics_card_resource: workerGraphicsCardResource,
          }

      if (taskName) {
        backendData.base_model = taskInfo.base_model
        backendData.training_type.train_type_category = taskInfo.training_type.train_type_category
        backendData.training_type.train_method_type = getTrainingMethodType(taskInfo.training_type)
        backendData.name = taskName
        backendData.version = taskInfo.version
      }

      const isEdit = isEditMode && taskInfo?.id != null
      const response = isEdit
        ? await finetuneTaskService.update(Number(projectId), taskInfo.id, backendData)
        : await finetuneTaskService.create(Number(projectId), backendData)

      message.success(isEdit ? '编辑成功' : '创建成功')

      const runName = response?.name ?? taskName
      const query = taskName ? `?taskName=${taskName}` : datasetName ? `?datasetName=${datasetName}` : ''
      const redirectPath = isEdit
        ? `/project/${projectId}/training/tasks/${taskName}`
        : `/project/${projectId}/training/runs/${runName}${query}`
      navigate(redirectPath)

      queryClient.invalidateQueries({ queryKey: ['finetuneRuns', projectId] })
    }
    catch (error) {
      message.error('创建训练运行失败')
      console.error('Failed to create experiment run:', error)
    }
    finally {
      setSubmitting(false)
    }
  }

  const handleSubmitFailed = ({ errorFields }: { errorFields?: { name: (string | number)[], errors: string[] }[] }) => {
    const firstError = errorFields?.[0]
    message.error(firstError?.errors?.[0] || '请检查必填项配置')
    if (firstError?.name) {
      setCurrentStep(getStepIndexByField(firstError.name))
      setTimeout(() => {
        form.scrollToField(firstError.name, { block: 'center' })
      })
    }
  }

  const handleSubmitButtonClick = () => {
    form
      .validateFields()
      .then((values) => handleSubmit(values))
      .catch(handleSubmitFailed)
  }

  const getStepIndexByField = (name: (string | number)[]) => {
    const firstName = String(name[0] ?? '')
    const isModelStepVisible = !taskName
    const trainingStepIndex = isModelStepVisible ? 2 : 1
    const dataStepIndex = isModelStepVisible ? 3 : 2
    const resourceStepIndex = isModelStepVisible ? 4 : 3

    if (['name', 'version', 'schedule_enabled', 'schedule_date', 'schedule_time', 'description'].includes(firstName))
      return 0
    if (['base_provider', 'base_model_id', 'base_model_name'].includes(firstName))
      return isModelStepVisible ? 1 : 0
    if (firstName === 'data_config')
      return dataStepIndex
    if (
      ['gpu_type', 'gpu_count', 'gpu_model', 'gpu_memory', 'k8s_resource_type', 'graphics_card_resource', 'ray_resource_config'].includes(firstName)
    ) {
      return resourceStepIndex
    }

    return trainingStepIndex
  }

  const validateStepFields = async (fields: (string | (string | number)[])[]) => {
    if (!fields.length)
      return
    try {
      await form.validateFields(fields)
    }
    catch (error: any) {
      handleSubmitFailed({ errorFields: error?.errorFields })
      throw error
    }
  }

  const resetSelectedDatasets = () => {
    const emptyDataConfig = createEmptyDataConfig()
    setDataConfig(emptyDataConfig)
    setDataConfigResetKey((key) => key + 1)
    form.setFieldsValue({ data_config: emptyDataConfig })
  }

  const dataConfigContent = (
    <>
      <Form.Item
        noStyle
        name="data_config"
        rules={[
          { required: true, message: '请配置训练数据集' },
          {
            validator: async (_, value: DataConfigValue) => {
              if (!value?.training_datasets?.length) {
                throw new Error('请至少选择一个训练数据集')
              }

              const totalRatio = value.training_datasets.reduce((sum, d) => sum + (d.weight_in_total || 0), 0)
              if (totalRatio !== 100) {
                throw new Error('训练数据集比例总和必须等于100%')
              }

              if (value.validation_config.type === 'platform') {
                if (!value.validation_datasets || value.validation_datasets.length === 0) {
                  throw new Error('选择验证数据集模式时，请至少选择一个验证数据集')
                }

                const validationTotalRatio = value.validation_datasets.reduce((sum, d) => sum + (d.weight_in_total || 0), 0)
                if (validationTotalRatio !== 100) {
                  throw new Error('验证数据集比例总和必须等于100%')
                }
              }
            },
          },
        ]}
      >
        <EnhancedDataConfig
          key={dataConfigResetKey}
          form={form}
          availableTrainingDatasets={datasets}
          availableValidationDatasets={validationDatasets}
          disabled={submitting}
          projectId={projectId ? parseInt(projectId) : undefined}
          dataConfig={dataConfig}
          trainTypeCategoryFromTask={taskName ? taskInfo?.training_type?.train_type_category : undefined}
          trainingMethodTypeFromTask={forcedTrainingMethodType || getTrainingMethodType(taskInfo?.training_type)}
        />
      </Form.Item>
      <Form.Item noStyle shouldUpdate>
        {() => (
          <Form.ErrorList errors={form.getFieldError('data_config')} />
        )}
      </Form.Item>
    </>
  )

  const resourceConfigContent = isGrpoResourceMode ? (
    <GrpoRayResourceConfig
      projectId={projectId ? parseInt(projectId) : undefined}
      SupportedGpuCategory={SupportedGpuCategory}
      onAllocatableResourcesChange={setAllocatableResources}
      onResourceLoadingChange={setResourceConfigLoading}
      preserveResourceValuesOnAllocatableChange={isEditMode || !!taskName}
    />
  ) : (
    <ResourceConfig
      projectId={projectId ? parseInt(projectId) : undefined}
      SupportedGpuCategory={SupportedGpuCategory}
      onAllocatableResourcesChange={setAllocatableResources}
      onResourceLoadingChange={setResourceConfigLoading}
      preserveResourceValuesOnAllocatableChange={isEditMode || !!taskName}
    />
  )

  const stepConfigs = [
    {
      title: '基础配置',
      validateFields: ['name', 'version', 'schedule_date', 'schedule_time'],
      content: <BasicConfig form={form} datainfo={taskInfo} taskName={taskName} />,
    },
    ...(!taskName
      ? [{
          title: '模型配置',
          validateFields: ['base_provider', 'base_model_id', 'base_model_name'],
          content: (
            <ModelConfig
              form={form}
              ModelProviderCategory={ModelProviderCategory}
              modelVersions={modelVersions}
            />
          ),
        }]
      : []),
    {
      title: '训练配置',
      validateFields: [
        'train_type_category',
        'training_type',
        'fine_tuning_type',
        'reward_rule_upload_id',
        'deepspeed',
      ],
      content: (
        <TrainingConfig
          form={form}
          TrainingTypeCategory={TrainingTypeCategory}
          TrainingMethodCategory={TrainingMethodCategory}
          MonitoringConfigCategory={MonitoringConfigCategory}
          type={taskInfo?.training_type?.fine_tuning_type}
          EvalStrategyCategory={EvalStrategyCategory}
          LrSchedulerTypeCategory={LrSchedulerTypeCategory}
          SaveStrategyCategory={SaveStrategyCategory}
          taskName={taskName}
          trainingMethodType={forcedTrainingMethodType || getTrainingMethodType(taskInfo?.training_type)}
          onTrainingMethodChange={resetSelectedDatasets}
        />
      ),
    },
    {
      title: '数据配置',
      validateFields: ['data_config'],
      content: dataConfigContent,
    },
    {
      title: isGrpoResourceMode ? '资源配置' : '显卡资源配置',
      validateFields: [isGrpoResourceMode ? 'ray_resource_config' : 'gpu_type', isGrpoResourceMode ? 'ray_resource_config' : 'gpu_count'],
      content: resourceConfigContent,
    },
  ]
  const activeStep = Math.min(currentStep, stepConfigs.length - 1)
  const isLastStep = activeStep === stepConfigs.length - 1
  const handlePrevStep = () => {
    setCurrentStep((step) => Math.max(step - 1, 0))
  }
  const handleNextStep = async () => {
    await validateStepFields(stepConfigs[activeStep].validateFields)
    setCurrentStep((step) => Math.min(step + 1, stepConfigs.length - 1))
  }

  return (
    <div className="create-form-page create-finetune-run-page">
      <section className="create-form-card w-full min-w-0">
        <CreateFormPageHeader
          title={isEditMode ? '编辑训练任务' : taskName ? '创建训练版本' : '创建训练任务'}
          onBack={handleCancel}
          actions={(
            <>
              {activeStep > 0 && (
                <Button className="create-form-cancel" onClick={handlePrevStep}>
                  上一步
                </Button>
              )}
              {!isLastStep ? (
                <Button
                  className="create-form-submit"
                  type="primary"
                  onClick={handleNextStep}
                >
                  下一步
                </Button>
              ) : (
                <Button
                  className="create-form-submit"
                  type="primary"
                  loading={submitting}
                  disabled={submitting}
                  onClick={handleSubmitButtonClick}
                >
                  提交
                </Button>
              )}
            </>
          )}
        />
        <div className="create-form-divider" />
        <div className="create-form-body">
          <Row gutter={24} className="mb-4 w-full min-w-0">
            <Form
              form={form}
              className="w-full min-w-0"
              layout="vertical"
              onFinish={handleSubmit}
              onFinishFailed={handleSubmitFailed}
            >
              <Steps
                className="!mb-6"
                current={activeStep}
                items={stepConfigs.map((step) => ({ title: step.title }))}
                onChange={setCurrentStep}
              />

              {stepConfigs.map((step, index) => (
                <div
                  key={step.title}
                  style={{ display: activeStep === index ? undefined : 'none' }}
                >
                  {step.content}
                </div>
              ))}

            </Form>
          </Row>
        </div>
      </section>
    </div>
  )
}

export default CreateFinetuneRun
