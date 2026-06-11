// 训练任务类型（文本生成 / 图像理解）
export type TrainingType = 'text' | 'vision'

// 训练方法：SFT（监督微调）或强化学习（DPO / RFT）
export type TrainingMethod = 'SFT' | 'DPO' | 'RFT'

// RFT 子算法：PPO 暂不开放，当前仅支持 GRPO
export type RFTAlgorithm = 'GRPO'

// 强化学习方法对应的显示名称
export const TRAINING_METHOD_LABELS: Record<TrainingMethod, string> = {
  SFT: 'SFT（监督微调）',
  DPO: 'DPO（直接偏好优化）',
  RFT: 'RFT（强化微调）',
}

// 微调类型（仅 SFT/DPO/RFT 使用）
export type FineTuneType = 'full' | 'lora'

/** 大模型训练任务版本运行状态（与平台状态机一致） */
export type RunStatus =
  | 'created' /** 已创建 */
  | 'scheduled_pending' /** 定时待启动 */
  | 'starting' /** 启动中（数据预处理等，不可终止/删除） */
  | 'queuing' /** 排队中（等待 K8s 资源） */
  | 'running' /** 运行中（已排到资源） */
  | 'completed' /** 已完成 */
  | 'failed' /** 失败 */
  | 'terminated' /** 已终止 */

/** 列表/详情中的状态标签样式与文案 */
export const TRAINING_RUN_STATUS_TAG: Record<
  RunStatus,
  { label: string; bg: string; color: string; border: string }
> = {
  created: {
    label: '已创建',
    bg: 'rgba(139,92,246,0.1)',
    color: '#7c3aed',
    border: 'rgba(139,92,246,0.2)',
  },
  scheduled_pending: {
    label: '定时待启动',
    bg: 'rgba(234,179,8,0.12)',
    color: '#b45309',
    border: 'rgba(234,179,8,0.35)',
  },
  starting: {
    label: '启动中',
    bg: 'rgba(59,130,246,0.12)',
    color: '#1d4ed8',
    border: 'rgba(59,130,246,0.25)',
  },
  queuing: {
    label: '排队中',
    bg: 'rgba(14,165,233,0.12)',
    color: '#0284c7',
    border: 'rgba(14,165,233,0.3)',
  },
  running: {
    label: '运行中',
    bg: 'rgba(37,99,235,0.1)',
    color: '#2563eb',
    border: 'rgba(37,99,235,0.2)',
  },
  completed: {
    label: '已完成',
    bg: 'rgba(16,185,129,0.1)',
    color: '#059669',
    border: 'rgba(16,185,129,0.2)',
  },
  failed: {
    label: '失败',
    bg: 'rgba(239,68,68,0.1)',
    color: '#dc2626',
    border: 'rgba(239,68,68,0.2)',
  },
  terminated: {
    label: '已终止',
    bg: 'rgba(100,116,139,0.12)',
    color: '#475569',
    border: 'rgba(100,116,139,0.25)',
  },
}

// 基础模型系列（如 Qwen）
export interface BaseModelSeries {
  id: string
  name: string
  description?: string
}

// 系列下的具体模型版本（checkpoint）
export interface BaseModelVariant {
  id: string
  name: string
  seriesId: string
  type: TrainingType
}

// 兼容旧命名：与 BaseModelVariant 一致
export interface BaseModel extends BaseModelVariant {
  version?: string
}

// 训练任务
export interface TrainingTask {
  id: string
  name: string
  description?: string
  baseModel: string
  trainingType: TrainingType
  trainingMethod: TrainingMethod
  versions: TrainingVersion[]
  createdAt: string
}

// RFT 奖励规则类型
export type RewardRuleType =
  | 'string_exact'    // 字符串比较（相等）
  | 'string_contains' // 字符串比较（包含）
  | 'string_similarity' // 字符串相似度对比
  | 'math_answer'     // 数学答案匹配
  | 'logic_reasoning' // 逻辑推理匹配
  | 'custom'          // 自定义代码

// RFT 奖励规则
export interface RewardRule {
  type: RewardRuleType
  /** 自定义规则代码路径（仅 type=custom 时） */
  customCodePath?: string
}

// 强化学习额外配置
export interface RLConfig {
  /** RFT 时必填：算法类型（当前仅支持 GRPO） */
  rftAlgorithm?: RFTAlgorithm
  /** RFT 时必填：奖励规则 */
  rewardRule?: RewardRule
}

// 已训练模型（我的模型）
export interface TrainedModel {
  id: string
  name: string
  type: TrainingType
  method: TrainingMethod
  baseModelSeries?: string
  versionCount?: number
  createdAt: string
}

// 训练版本
export interface TrainingVersion {
  id: string
  version: string
  /** 任务描述 */
  taskDescription?: string
  /** 该版本训练所基于的模型（基础模型或「我的模型」展示名） */
  baseModel: string
  /** 该版本采用的训练方法 */
  trainingMethod: TrainingMethod
  /** 模型来源：基础模型库 / 已训练产出模型 */
  modelSource?: 'base' | 'trained'
  /** RFT 场景下关联的奖励模型名称 */
  rewardModelName?: string
  description: string
  status: RunStatus
  /** 定时启动时间（仅 scheduled_pending 时有效） */
  scheduleTime?: string
  /** 开始时间 */
  startTime?: string
  /** 结束时间 */
  endTime?: string
  /** 微调类型：全参微调 / Lora微调 */
  fineTuneType?: 'full' | 'lora'
  runtime?: string
  gpuCount?: number
  creator?: string
  createdAt: string
  /** 关联的数据集 */
  dataset?: VersionDataset
  /** 显卡资源配置 */
  gpuConfig?: GpuConfig
  config?: TrainingConfig
  /** 指标数据 */
  metrics?: TrainingMetrics
  /** 训练产物 */
  outputPath?: string
}

export interface GpuConfig {
  gpuType?: string   // GPU / CPU
  gpuModel?: string  // T4 / V100 / A100 / H100
  gpuMemory?: string // 16GB / 32GB / 80GB
  gpuCount?: number
}

/** 训练曲线上的单点（横轴一般为 Step） */
export interface MetricPoint {
  step: number
  value: number
}

export interface TrainingMetrics {
  /** 训练结束时的汇总指标（表格展示） */
  current?: Record<string, number>
  /** 训练过程中各指标随 step 变化的曲线数据 */
  curves?: Partial<Record<string, MetricPoint[]>>
}

// 训练配置
export interface TrainingConfig {
  // 基础参数
  learningRate?: number
  numEpochs?: number
  perDeviceBatchSize?: number
  gradientAccumulationSteps?: number
  warmupRatio?: number
  lrSchedulerType?: string
  useBf16?: boolean
  
  // 高级配置
  gradientCheckpointing?: boolean
  maxGradNorm?: number
  ropeScalingMethod?: string
  randomSeed?: number
  weightDecay?: number
  
  // 数据处理配置
  cutoffLength?: number
  preprocessingNumWorkers?: number
  
  // 评估配置
  evalSteps?: number
  evalStrategy?: string
  metricGreaterIsBetter?: boolean
  loadBestModelAtEnd?: boolean
  bestModelMetric?: string
  perDeviceEvalBatchSize?: number
  
  // 保存配置
  saveSteps?: number
  saveStrategy?: string
  saveTotalLimit?: number
  
  // 监控配置
  loggingSteps?: number

  // GRPO 生成采样与策略优化配置
  numGenerations?: number
  maxPromptLength?: number
  maxCompletionLength?: number
  temperature?: number
  topP?: number
  topK?: number
  repetitionPenalty?: number
  klCoefficient?: number
  clipRange?: number
  advantageEstimator?: string
  rewardNormalization?: boolean
  rewardScale?: number

  // DeepSpeed 训练加速配置
  deepspeedStage?: 'off' | 'z0' | 'z2' | 'z3'

  // LoRA配置（仅 SFT/DPO/RFT + lora 场景）
  loraAlpha?: number
  loraDropout?: number
  loraRank?: number
  loraTarget?: string

  // GRPO 训练参数模板（仅记录“微调类型 + 训练参数”的来源快照）
  grpoTemplateId?: string
  grpoTemplateName?: string
  grpoTemplateContent?: string
  grpoParameterMode?: 'template' | 'custom'
  grpoTemplateSnapshot?: {
    fineTuneType: FineTuneType
    params: Record<string, unknown>
  }

  // RFT奖励规则
  rewardRuleType?: RewardRuleType
  rewardRuleCustomCodePath?: string
  
  // 资源配额
  gpuType?: string
  gpuCount?: number
  cpuRequest?: number
  cpuLimit?: number
  memoryRequest?: number
  memoryLimit?: number

  // GRPO 三阶段资源配置
  grpoResourceConfig?: {
    hand?: {
      gpuType?: string
      gpuCount?: number
      cpuRequest?: number
      cpuLimit?: number
      memoryRequest?: number
      memoryLimit?: number
    }
    work?: {
      gpuType?: string
      gpuCount?: number
      cpuRequest?: number
      cpuLimit?: number
      memoryRequest?: number
      memoryLimit?: number
    }
    submit?: {
      cpuRequest?: number
      cpuLimit?: number
      memoryRequest?: number
      memoryLimit?: number
    }
  }
}

// 数据集
export interface Dataset {
  id: string
  name: string
  version: string
  charCount?: number
  sampleCount?: number
  /** 采样权重百分比 */
  weight?: number
  sampleRate?: number
  trainRatio?: number
}

// 版本关联的数据集信息
export interface VersionDataset {
  /** 训练数据集 */
  train: Dataset
  /** 验证集从训练集按比例拆分 */
  validationSplit?: {
    ratio: number
    sampleCount: number
  }
}

// 验证集配置
export interface ValidationConfig {
  splitEnabled: boolean
  splitRatio: number
}
