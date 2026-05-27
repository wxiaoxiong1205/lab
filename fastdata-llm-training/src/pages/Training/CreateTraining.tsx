import React, { useEffect, useMemo, useState } from 'react'
import {
  Card,
  Form,
  Input,
  Select,
  Tabs,
  Button,
  InputNumber,
  Switch,
  Space,
  Typography,
  Divider,
  message,
  Table,
  Radio,
  Slider,
  Tag,
  DatePicker,
  Alert,
  Tooltip,
  Modal,
} from 'antd'
import {
  PlusOutlined,
  DeleteOutlined,
  CloudServerOutlined,
  RocketOutlined,
  SettingOutlined,
  DatabaseOutlined,
  ThunderboltOutlined,
  SafetyOutlined,
  BarChartOutlined,
  SaveOutlined,
  MonitorOutlined,
  CheckOutlined,
  ExperimentOutlined,
  ArrowLeftOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { trainedModels } from '../../data/mockData'
import { getTrainingTypeFromModel, isQwenProvider, loadBaseModelCatalog } from '../../data/modelCatalog'
import { useTrainingTasks } from '../../services/trainingTaskStore'
import { createTaskNotification } from '../../services/notificationStore'
import { resolveDatasetVersionRow } from '../../data/datasetPickerCatalog'
import DatasetSelectModal, { type SelectedDatasetVersionRow } from '../../components/DatasetSelectModal'
import RewardRulesConfig from '../../components/RewardRulesConfig'
import { validateFieldsAndScroll } from '../../utils/formValidation'
import {
  TRAINING_METHOD_LABELS,
  type TrainingMethod,
  type TrainingType,
  type FineTuneType,
  type TrainedModel,
  type RunStatus,
  type TrainingVersion,
  type RFTAlgorithm,
  type RewardRuleType,
} from '../../types/training'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'

dayjs.extend(customParseFormat)

const { Title, Text, Paragraph } = Typography

type DeepSpeedStage = 'off' | 'z0' | 'z2' | 'z3'

const deepspeedStageOptions: Array<{
  value: DeepSpeedStage
  label: string
  summary: string
  description: string
  tooltip: string
}> = [
  {
    value: 'off',
    label: '不开启',
    summary: '默认训练',
    description: '使用框架默认训练策略，适合 LoRA 或单卡显存充足的场景。',
    tooltip: '不开启 DeepSpeed 训练加速，不加载 ZeRO 配置。适合模型本身能放下、希望保持配置简单，或 LoRA 微调显存压力不大的场景。',
  },
  {
    value: 'z0',
    label: 'ZeRO-0',
    summary: '普通 DDP',
    description: '普通 DDP 基线，不切分参数、梯度和优化器状态，通常速度最快。',
    tooltip: 'ZeRO-0 不做显存状态切分，等价于普通数据并行基线。显存节省最低、通信开销低，适合显存足够时做性能和稳定性基线。',
  },
  {
    value: 'z2',
    label: 'ZeRO-2',
    summary: '均衡策略',
    description: '切分优化器状态和梯度，在显存占用与训练速度之间取得平衡。',
    tooltip: 'ZeRO-2 切分 optimizer states 和 gradients。显存节省中等，通信开销仍相对可控，是多卡训练中最常见的折中方案。',
  },
  {
    value: 'z3',
    label: 'ZeRO-3',
    summary: '最大节省',
    description: '切分优化器状态、梯度和参数，最大化降低单卡显存占用。',
    tooltip: 'ZeRO-3 同时切分 optimizer states、gradients 和 parameters。显存节省最高，但通信开销最大、单步通常更慢，适合模型很大或 ZeRO-2 仍放不下时使用。',
  },
]

type TrainingBaseModelOption = {
  id: string
  name: string
  provider: string
  description?: string
  type: TrainingType
  adapted: boolean
  downloaded: boolean
}

/** 将版本上的 scheduleTime 字符串转为 DatePicker 可用的 dayjs（与 mock 中 `2026/04/02 10:00:00` 等格式兼容） */
function scheduleTimeToPickerValue(raw?: string) {
  if (!raw?.trim()) return undefined
  const s = raw.trim()
  const formats = ['YYYY/MM/DD HH:mm:ss', 'YYYY-MM-DD HH:mm:ss', 'YYYY/MM/DD HH:mm', 'YYYY-MM-DD HH:mm']
  for (const f of formats) {
    const d = dayjs(s, f, true)
    if (d.isValid()) return d
  }
  const d = dayjs(s)
  return d.isValid() ? d : undefined
}
const { TextArea } = Input

/** 微调类型：与 Form 联动，切换时回到基础参数 Tab */
const FineTuneTypePicker: React.FC<{
  value?: FineTuneType
  onChange?: (v: FineTuneType) => void
  onAfterChange?: () => void
}> = ({ value, onChange, onAfterChange }) => (
  <Space size={12}>
    <Button
      type={value === 'full' ? 'primary' : 'default'}
      onClick={() => {
        onChange?.('full')
        onAfterChange?.()
      }}
      style={{
        borderRadius: 8,
        height: 36,
        padding: '0 20px',
        fontWeight: 500,
      }}
    >
      全参微调
    </Button>
    <Button
      type={value === 'lora' ? 'primary' : 'default'}
      onClick={() => {
        onChange?.('lora')
        onAfterChange?.()
      }}
      style={{
        borderRadius: 8,
        height: 36,
        padding: '0 20px',
        fontWeight: 500,
      }}
    >
      LoRA微调
    </Button>
  </Space>
)

const BaseModelModalPicker: React.FC<{
  value?: string
  onChange?: (id: string) => void
  options: TrainingBaseModelOption[]
  trainingType: TrainingType
}> = ({ value, onChange, options, trainingType }) => {
  const [open, setOpen] = useState(false)
  const providers = useMemo(() => Array.from(new Set(options.map(item => item.provider))), [options])
  const [activeProvider, setActiveProvider] = useState<string>()
  const selectedModel = useMemo(() => options.find(item => item.id === value), [options, value])

  useEffect(() => {
    if (providers.length === 0) {
      setActiveProvider(undefined)
      return
    }

    if (!activeProvider || !providers.includes(activeProvider)) {
      setActiveProvider(selectedModel?.provider && providers.includes(selectedModel.provider) ? selectedModel.provider : providers[0])
    }
  }, [activeProvider, providers, selectedModel?.provider])

  const currentModels = useMemo(
    () => options.filter(item => item.provider === activeProvider),
    [activeProvider, options],
  )

  if (options.length === 0) {
    return (
      <div
        style={{
          padding: '24px 20px',
          textAlign: 'center',
          background: '#f8fafc',
          borderRadius: 12,
          border: '1px dashed #cbd5e1',
        }}
      >
        <Text type="secondary">当前训练类型下暂无可用模型版本</Text>
      </div>
    )
  }

  return (
    <>
      <div
        data-form-error-anchor="baseModel"
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          background: '#f8fafc',
          padding: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>
            当前基础模型
          </Text>
          {selectedModel ? (
            <Space wrap size={8}>
              <Text strong style={{ fontSize: 15 }}>{selectedModel.name}</Text>
              <Tag color={selectedModel.adapted ? 'green' : 'orange'}>{selectedModel.adapted ? '已适配' : '未适配'}</Tag>
              {selectedModel.adapted && !selectedModel.downloaded && <Tag color="red">未下载，请联系管理员</Tag>}
              <Tag color="blue">{selectedModel.provider}</Tag>
            </Space>
          ) : (
            <Text type="secondary">请选择基础模型</Text>
          )}
        </div>
        <Button onClick={() => setOpen(true)}>选择基础模型</Button>
      </div>

      <Modal
        title="选择基础模型"
        open={open}
        width={900}
        onCancel={() => setOpen(false)}
        footer={<Button onClick={() => setOpen(false)}>关闭</Button>}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0,1fr)', gap: 20, minHeight: 420 }}>
          <div style={{ borderRight: '1px solid #e2e8f0', paddingRight: 16 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>模型提供商</Text>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {providers.map(provider => {
                const active = provider === activeProvider
                const count = options.filter(item => item.provider === provider).length
                return (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => setActiveProvider(provider)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: active ? '1px solid rgba(37,99,235,0.38)' : '1px solid transparent',
                      background: active ? 'rgba(37,99,235,0.1)' : '#fff',
                      color: active ? '#2563eb' : '#334155',
                      fontWeight: active ? 600 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    <span>{provider}</span>
                    <Tag style={{ margin: 0 }}>{count}</Tag>
                  </button>
                )
              })}
            </Space>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <Text strong>{activeProvider || '模型'}</Text>
                <Text type="secondary" style={{ marginLeft: 8 }}>
                  {trainingType === 'vision' ? '图像理解' : '文本生成'} · {currentModels.length} 个模型
                </Text>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, maxHeight: 360, overflow: 'auto', paddingRight: 4 }}>
              {currentModels.map(model => {
                const active = value === model.id
                const disabled = model.adapted && !model.downloaded
                return (
                  <Tooltip key={model.id} title={disabled ? '未下载，请联系管理员' : undefined}>
                    <button
                      type="button"
                      aria-disabled={disabled}
                      onClick={() => {
                        if (disabled) {
                          message.warning('未下载，请联系管理员')
                          return
                        }
                        onChange?.(model.id)
                        setOpen(false)
                      }}
                      style={{
                        minHeight: 122,
                        padding: 14,
                        borderRadius: 12,
                        border: active ? '2px solid #2563eb' : '1px solid #e2e8f0',
                        background: disabled ? '#f8fafc' : active ? 'rgba(37,99,235,0.06)' : '#fff',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        textAlign: 'left',
                        opacity: disabled ? 0.66 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                        <Text strong style={{ color: disabled ? '#94a3b8' : '#0f172a' }}>{model.name}</Text>
                        {active && <CheckOutlined style={{ color: '#2563eb', marginTop: 3 }} />}
                      </div>
                      <Space wrap size={6}>
                        <Tag color={model.adapted ? 'green' : 'orange'}>{model.adapted ? '已适配' : '未适配'}</Tag>
                        {model.adapted && !model.downloaded && <Tag color="red">未下载，请联系管理员</Tag>}
                      </Space>
                      {model.description && (
                        <Text type="secondary" style={{ display: 'block', marginTop: 10, fontSize: 12, lineHeight: 1.45 }}>
                          {model.description}
                        </Text>
                      )}
                    </button>
                  </Tooltip>
                )
              })}
            </div>

            {currentModels.length === 0 && (
              <div
                style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  background: '#f8fafc',
                  borderRadius: 12,
                  border: '1px dashed #cbd5e1',
                }}
              >
                <Text type="secondary">当前提供商暂无匹配模型</Text>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}

/** 全参微调默认参数（与产品截图一致；说明仅作 tooltip，不在表单项下方展示） */
const FULL_FINETUNE_DEFAULTS = {
  learningRate: 0.00005,
  numEpochs: 3,
  perDeviceBatchSize: 2,
  gradientAccumulationSteps: 1,
  warmupRatio: 0.1,
  lrSchedulerType: 'COSINE',
  useBf16: true,
  gradientCheckpointing: false,
  maxGradNorm: 1,
  ropeScalingMethod: 'YARN',
  randomSeed: 42,
  weightDecay: 0,
  cutoffLength: 4096,
  preprocessingNumWorkers: 16,
  evalStrategy: 'STEPS',
  evalSteps: 20,
  metricGreaterIsBetter: false,
  loadBestModelAtEnd: true,
  bestModelMetric: 'loss',
  perDeviceEvalBatchSize: 2,
  saveSteps: 20,
  saveStrategy: 'STEPS',
  saveTotalLimit: 3,
  loggingSteps: 5,
  deepspeedStage: 'off' as DeepSpeedStage,
} as const

/** LoRA 微调：仅 LoRA 配置 Tab 的默认值（说明仅 tooltip 展示） */
const LORA_FINETUNE_DEFAULTS = {
  loraRank: 16,
  loraTargetModules: ['all'],
  loraAlpha: 32,
  loraDropout: 0,
}

/** LoRA 目标模块：可选 all 或具体模块；选 all 与具体模块互斥 */
const LoraTargetModulesSelect: React.FC<{
  value?: string[]
  onChange?: (v: string[]) => void
}> = ({ value, onChange }) => (
  <Select
    mode="multiple"
    allowClear
    placeholder="请选择"
    value={value}
    onChange={vals => {
      const v = vals as string[]
      if (v.includes('all') && v.length > 1) {
        const last = v[v.length - 1]
        onChange?.(last === 'all' ? ['all'] : v.filter(x => x !== 'all'))
        return
      }
      onChange?.(v)
    }}
  >
    <Select.Option value="all">all</Select.Option>
    <Select.Option value="q_proj">q_proj (Query 投影)</Select.Option>
    <Select.Option value="k_proj">k_proj (Key 投影)</Select.Option>
    <Select.Option value="v_proj">v_proj (Value 投影)</Select.Option>
    <Select.Option value="o_proj">o_proj (Output 投影)</Select.Option>
    <Select.Option value="gate_proj">gate_proj (门控投影)</Select.Option>
    <Select.Option value="up_proj">up_proj (上投影)</Select.Option>
    <Select.Option value="down_proj">down_proj (下投影)</Select.Option>
  </Select>
)

const DeepSpeedStageField: React.FC = () => {
  const form = Form.useFormInstance()
  const selectedStage = (Form.useWatch('deepspeedStage', form) ?? 'off') as DeepSpeedStage
  const enabled = selectedStage !== 'off'
  const zeroOptions = deepspeedStageOptions.filter(option => option.value !== 'off')

  return (
    <div style={{ marginBottom: 20 }}>
      <Form.Item name="deepspeedStage" hidden>
        <Input />
      </Form.Item>

      <Form.Item
        label="训练加速配置"
        tooltip="DeepSpeed 用于提升大模型训练效率，并优化显存占用。"
        style={{ marginBottom: 0 }}
      >
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Space align="center" size={12}>
            <Switch
              checked={enabled}
              checkedChildren="开启"
              unCheckedChildren="关闭"
              onChange={checked => form.setFieldValue('deepspeedStage', checked ? 'z0' : 'off')}
            />
          </Space>

          {enabled && (
            <Radio.Group
              value={selectedStage}
              onChange={event => form.setFieldValue('deepspeedStage', event.target.value)}
            >
              <Space size={[12, 8]} wrap>
                {zeroOptions.map(option => (
                  <Radio
                    key={option.value}
                    value={option.value}
                    style={{
                      marginInlineEnd: 0,
                      padding: '6px 10px',
                      border: '1px solid #e2e8f0',
                      borderRadius: 6,
                      background: '#fff',
                    }}
                  >
                    <Space size={6}>
                      <Text strong>{option.label}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>{option.summary}</Text>
                      <Tooltip title={option.tooltip} placement="top">
                        <QuestionCircleOutlined style={{ color: '#94a3b8', fontSize: 13 }} />
                      </Tooltip>
                    </Space>
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          )}
        </Space>
      </Form.Item>
    </div>
  )
}

type TrainingDatasetRow = {
  key: string
  name: string
  version: string
  charCount: number
  sampleCount: number
  sampleRate: number
  trainRatio: number
}

/** 训练数据集列表（受控，配合 Form.Item 做必填与红星样式） */
const TrainingDatasetPicker: React.FC<{
  value?: TrainingDatasetRow[]
  onChange?: (v: TrainingDatasetRow[]) => void
  trainingType: TrainingType
  trainingMethod: TrainingMethod
}> = ({ value = [], onChange, trainingType, trainingMethod }) => {
  const [modalOpen, setModalOpen] = useState(false)

  const excludeKeys = useMemo(() => value.map(r => r.key).filter(Boolean), [value])

  const columns = useMemo(
    () => [
      { title: '训练数据集', dataIndex: 'name', key: 'name', ellipsis: true },
      { title: '版本', dataIndex: 'version', key: 'version', width: 72 },
      {
        title: '字符数',
        dataIndex: 'charCount',
        key: 'charCount',
        width: 100,
        render: (n: number) => n.toLocaleString(),
      },
      {
        title: '样本数',
        dataIndex: 'sampleCount',
        key: 'sampleCount',
        width: 100,
        render: (n: number) => n.toLocaleString(),
      },
      { title: '采样率', dataIndex: 'sampleRate', key: 'sampleRate', width: 88 },
      { title: '训练比例(%)', dataIndex: 'trainRatio', key: 'trainRatio', width: 110 },
      {
        title: '操作',
        key: 'action',
        width: 80,
        render: (_: unknown, __: unknown, index: number) => (
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => onChange?.(value.filter((_, i) => i !== index))}
          >
            删除
          </Button>
        ),
      },
    ],
    [value, onChange],
  )

  const handleModalConfirm = (rows: SelectedDatasetVersionRow[]) => {
    const mapped: TrainingDatasetRow[] = rows.map(r => ({
      key: r.key,
      name: r.datasetName,
      version: r.version,
      charCount: r.charCount,
      sampleCount: r.sampleCount,
      sampleRate: r.sampleRate,
      trainRatio: r.trainRatio,
    }))
    const existing = new Set(value.map(r => r.key))
    const merged = [...value]
    for (const row of mapped) {
      if (!existing.has(row.key)) {
        merged.push(row)
        existing.add(row.key)
      }
    }
    onChange?.(merged)
    setModalOpen(false)
  }

  return (
    <div data-form-error-anchor="trainingDatasets">
      <Button
        type="dashed"
        icon={<PlusOutlined />}
        onClick={() => setModalOpen(true)}
        style={{
          borderRadius: 8,
          height: 40,
          width: '100%',
          borderStyle: 'dashed',
          borderColor: '#cbd5e1',
          color: '#64748b',
          marginBottom: 12,
        }}
      >
        添加数据集
      </Button>
      <Table<TrainingDatasetRow>
        columns={columns}
        dataSource={value}
        rowKey="key"
        pagination={false}
        locale={{
          emptyText: (
            <div style={{ padding: '32px 0', color: '#94a3b8' }}>
              <DatabaseOutlined style={{ fontSize: 32, marginBottom: 12, display: 'block', color: '#cbd5e1' }} />
              <Text type="secondary">暂无选择的训练数据集</Text>
            </div>
          ),
        }}
      />
      <DatasetSelectModal
        open={modalOpen}
        title="选择训练数据集"
        mode="multiple"
        trainingType={trainingType}
        trainingMethod={trainingMethod}
        fixedDataType="训练数据集"
        excludeKeys={excludeKeys}
        onCancel={() => setModalOpen(false)}
        onConfirm={handleModalConfirm}
      />
    </div>
  )
}

/** 验证数据集：弹窗单选，表单存版本 key */
const EvalDatasetPicker: React.FC<{
  value?: string
  onChange?: (v: string | undefined) => void
  trainingType: TrainingType
  trainingMethod: TrainingMethod
}> = ({ value, onChange, trainingType, trainingMethod }) => {
  const [open, setOpen] = useState(false)
  const label = value ? resolveDatasetVersionRow(value) : null
  const display = label ? `${label.datasetName} / ${label.version}` : ''
  const defaultSelectedKeys = useMemo(() => (value ? [value] : []), [value])

  return (
    <Space.Compact style={{ width: '100%' }}>
      <Input readOnly placeholder="请选择验证数据集（可选）" value={display} style={{ cursor: 'default' }} />
      <Button type="primary" ghost onClick={() => setOpen(true)}>
        选择
      </Button>
      {value ? (
        <Button
          onClick={() => {
            onChange?.(undefined)
          }}
        >
          清除
        </Button>
      ) : null}
      <DatasetSelectModal
        open={open}
        title="选择验证数据集"
        mode="single"
        trainingType={trainingType}
        trainingMethod={trainingMethod}
        fixedDataType="验证数据集"
        defaultSelectedKeys={defaultSelectedKeys}
        onCancel={() => setOpen(false)}
        onConfirm={rows => {
          onChange?.(rows[0]?.key)
          setOpen(false)
        }}
      />
    </Space.Compact>
  )
}

/** 页面入口模式 */
type FormMode = 'create' | 'editVersion' | 'resubmitFrom'

/** 将版本数据映射为表单初始值（用于编辑/重新提交回显） */
function mapVersionToFormValues(
  version: TrainingVersion,
  parentTaskName: string,
): Record<string, unknown> {
  const c = version.config ?? {}
  const gpu = version.gpuConfig ?? {}

  const datasetRows: TrainingDatasetRow[] = version.dataset?.train
    ? [
        {
          key: version.dataset.train.id,
          name: version.dataset.train.name,
          version: version.dataset.train.version,
          charCount: version.dataset.train.charCount ?? 0,
          sampleCount: version.dataset.train.sampleCount ?? 0,
          sampleRate: version.dataset.train.sampleRate ?? 1,
          trainRatio: version.dataset.train.weight ?? 100,
        },
      ]
    : []

  const evalDatasetKey = version.dataset?.validationSplit ? version.dataset.train.id : undefined

  const baseModelId = loadBaseModelCatalog().find(v => v.name === version.baseModel)?.code ?? version.baseModel

  return {
    taskName: parentTaskName,
    taskDescription: version.taskDescription,
    taskVersion: version.version,
    fineTuneType: version.fineTuneType ?? 'full',
    trainingDatasets: datasetRows,
    evalDataset: evalDatasetKey,
    validationSplitMode: version.dataset?.validationSplit ? 'dataset' : 'split',
    splitRatio: version.dataset?.validationSplit?.ratio ?? 15,
    baseModelSource: version.modelSource ?? 'base',
    baseModel: baseModelId,
    trainedModelId: version.modelSource === 'trained' ? version.baseModel : undefined,
    rewardModelId: undefined,
    scheduleEnabled: Boolean(version.scheduleTime),
    taskSchedule: scheduleTimeToPickerValue(version.scheduleTime),
    learningRate: c.learningRate,
    numEpochs: c.numEpochs,
    perDeviceBatchSize: c.perDeviceBatchSize,
    gradientAccumulationSteps: c.gradientAccumulationSteps,
    warmupRatio: c.warmupRatio,
    lrSchedulerType: c.lrSchedulerType,
    useBf16: c.useBf16,
    gradientCheckpointing: c.gradientCheckpointing,
    maxGradNorm: c.maxGradNorm,
    ropeScalingMethod: c.ropeScalingMethod,
    randomSeed: c.randomSeed,
    weightDecay: c.weightDecay,
    cutoffLength: c.cutoffLength,
    preprocessingNumWorkers: c.preprocessingNumWorkers,
    evalStrategy: c.evalStrategy,
    evalSteps: c.evalSteps,
    metricGreaterIsBetter: c.metricGreaterIsBetter,
    loadBestModelAtEnd: c.loadBestModelAtEnd,
    bestModelMetric: c.bestModelMetric,
    perDeviceEvalBatchSize: c.perDeviceEvalBatchSize,
    saveSteps: c.saveSteps,
    saveStrategy: c.saveStrategy,
    saveTotalLimit: c.saveTotalLimit,
    loggingSteps: c.loggingSteps,
    deepspeedStage: c.deepspeedStage ?? 'off',
    loraRank: c.loraRank,
    loraTargetModules: c.loraTarget === 'all' ? ['all'] : (c.loraTarget ? [c.loraTarget] : ['all']),
    loraAlpha: c.loraAlpha,
    loraDropout: c.loraDropout,
    gpuType: gpu.gpuModel,
    gpuCount: gpu.gpuCount,
    cpuRequest: c.cpuRequest,
    cpuLimit: c.cpuLimit,
    memoryRequest: c.memoryRequest,
    memoryLimit: c.memoryLimit,
  }
}

const CreateTraining: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [form] = Form.useForm()
  const [activeTab, setActiveTab] = useState('basic')
  const [baseModelCatalog] = useState(() => loadBaseModelCatalog())
  const trainingTasks = useTrainingTasks()

  // 同一页面路由在「仅 taskId」与「taskId + editVersion」之间切换时组件不卸载，Ant Design Form 的 initialValues 只生效一次；
  // 用完整查询串作为 key，保证从「新增版本 V9」切到「编辑某版本」时表单整表重建并正确回显。
  const formRouteKey = `${location.pathname}${location.search}`

  // ── URL 参数解析 ────────────────────────────────────────────────────────
  const taskId = searchParams.get('taskId')
  const parentTask = taskId ? trainingTasks.find(t => t.id === taskId) : undefined
  const editVersionId = searchParams.get('editVersion')
  const resubmitFromId = searchParams.get('resubmitFrom')

  const mode: FormMode = editVersionId
    ? 'editVersion'
    : resubmitFromId
      ? 'resubmitFrom'
      : 'create'

  const sourceVersion = useMemo(() => {
    if (!parentTask) return undefined
    const vid = editVersionId ?? resubmitFromId
    if (!vid) return undefined
    return parentTask.versions.find(v => v.id === vid)
  }, [parentTask, editVersionId, resubmitFromId])

  /** 在已有任务下点「新增版本」时为 true；与「编辑/重新提交」区分标题文案 */
  const isNewVersionUnderTask = mode === 'create' && Boolean(taskId)

  // 版本号：新增版本时 V +（已有版本数 + 1）；编辑/重新提交时沿用原版本号
  const nextVersionNum = parentTask ? parentTask.versions.length + 1 : 1
  const effectiveVersionLabel =
    mode === 'create' ? `V${nextVersionNum}` : (sourceVersion?.version ?? 'V1')

  const missingVersionForEdit =
    (mode === 'editVersion' || mode === 'resubmitFrom') &&
    Boolean(parentTask && (editVersionId || resubmitFromId) && !sourceVersion)

  /** 与当前 URL 模式一致的表单初值（编辑/重提交时合并 mapVersionToFormValues，避免沿用上一次「新增版本」的 Vn） */
  const formInitialValues = useMemo(() => {
    const base = {
      ...FULL_FINETUNE_DEFAULTS,
      ...LORA_FINETUNE_DEFAULTS,
      taskName: parentTask?.name ?? '',
      trainingType: parentTask?.trainingType || 'text',
      trainingMethod: parentTask?.trainingMethod || 'SFT',
      baseModelSource: 'base',
      fineTuneType: 'full' as FineTuneType,
      splitRatio: 15,
      validationSplitMode: 'split' as const,
      trainingDatasets: [] as TrainingDatasetRow[],
    }

    if ((mode === 'editVersion' || mode === 'resubmitFrom') && sourceVersion && parentTask) {
      const mapped = mapVersionToFormValues(sourceVersion, parentTask.name)
      return {
        ...base,
        ...mapped,
        trainingType: parentTask.trainingType ?? 'text',
        trainingMethod: sourceVersion.trainingMethod,
        taskVersion: sourceVersion.version,
      }
    }

    return {
      ...base,
      taskVersion: effectiveVersionLabel,
    }
  }, [mode, sourceVersion, parentTask, effectiveVersionLabel])

  // 全新创建（无 taskId）或编辑/重提交：可改任务名；仅在「某任务下新增版本」时沿用父任务名并置灰
  const canEditTaskName = !taskId || mode !== 'create'

  // ── 表单字段监听 ────────────────────────────────────────────────────────
  const trainingType = (Form.useWatch('trainingType', form) as TrainingType) || parentTask?.trainingType || 'text'
  const trainingMethod = (Form.useWatch('trainingMethod', form) as TrainingMethod) || parentTask?.trainingMethod || 'SFT'
  const baseModelSource = (Form.useWatch('baseModelSource', form) as 'base' | 'my') ?? 'base'
  const fineTuneType = (Form.useWatch('fineTuneType', form) as FineTuneType) || 'full'
  const trainingDatasets = (Form.useWatch('trainingDatasets', form) as TrainingDatasetRow[] | undefined) ?? []
  const validationSplitMode =
    (Form.useWatch('validationSplitMode', form) as 'split' | 'dataset' | undefined) ?? 'split'
  const scheduleEnabled = Form.useWatch('scheduleEnabled', form)
  const rftAlgorithm = Form.useWatch('rftAlgorithm', form) as RFTAlgorithm | undefined
  const rewardRuleType = Form.useWatch('rewardRuleType', form) as RewardRuleType | undefined

  const filteredVariants = useMemo<TrainingBaseModelOption[]>(
    () =>
      baseModelCatalog
        .map((model): TrainingBaseModelOption | null => {
          const type = getTrainingTypeFromModel(model)
          const option: TrainingBaseModelOption = {
            id: model.code,
            name: model.name,
            provider: model.provider ?? '未知',
            type,
            adapted: isQwenProvider(model.provider),
            downloaded: model.status === 'running',
          }
          if (model.description) {
            option.description = model.description
          }
          return option
        })
        .filter((model): model is TrainingBaseModelOption => model !== null && model.type === trainingType),
    [baseModelCatalog, trainingType],
  )

  /** 我的模型：按训练类型过滤（DPO/RFT 可用已训练的模型作基础） */
  const filteredTrainedModels = useMemo(
    () => trainedModels.filter(m => m.type === trainingType),
    [trainingType],
  )

  useEffect(() => {
    if (mode !== 'create') {
      return
    }

    const prefillDatasetName = searchParams.get('prefillDatasetName')
    if (!prefillDatasetName) {
      return
    }

    const prefillRow: TrainingDatasetRow = {
      key: `${prefillDatasetName}__${searchParams.get('prefillDatasetVersion') ?? 'V1'}`,
      name: prefillDatasetName,
      version: searchParams.get('prefillDatasetVersion') ?? 'V1',
      charCount: Number(searchParams.get('prefillCharCount') ?? 0),
      sampleCount: Number(searchParams.get('prefillSampleCount') ?? 0),
      sampleRate: Number(searchParams.get('prefillSampleRate') ?? 100),
      trainRatio: Number(searchParams.get('prefillTrainRatio') ?? 100),
    }

    const currentRows = ((form.getFieldValue('trainingDatasets') as TrainingDatasetRow[] | undefined) ?? []).filter(Boolean)
    const exists = currentRows.some(row => row.name === prefillRow.name && row.version === prefillRow.version)
    if (exists) {
      return
    }

    form.setFieldValue('trainingDatasets', [...currentRows, prefillRow])
  }, [form, mode, searchParams])

  // 表单提交
  const handleSubmit = async () => {
    const values = await validateFieldsAndScroll(form, message)

    if (!values) {
      return
    }

    if (mode === 'editVersion') {
      message.success('保存成功')
      navigate(`/training/detail/${taskId}`)
    } else if (mode === 'resubmitFrom') {
      createTaskNotification({
        type: 'training',
        status: 'started',
        severity: 'info',
        taskId: taskId ?? `training-${Date.now()}`,
        taskName: form.getFieldValue('taskName') || parentTask?.name || '训练任务',
        taskModule: '大模型训练',
        title: '训练任务已重新提交',
        content: `${form.getFieldValue('taskName') || parentTask?.name || '训练任务'} 已重新提交，等待启动。`,
        targetPath: taskId ? `/training/detail/${taskId}` : '/training',
      })
      message.success('重新提交成功')
      navigate(`/training/detail/${taskId}`)
    } else {
      const taskName = form.getFieldValue('taskName') || '未命名训练任务'
      createTaskNotification({
        type: 'training',
        status: 'created',
        severity: 'info',
        taskId: taskId ?? `training-${Date.now()}`,
        taskName,
        taskModule: '大模型训练',
        title: '训练任务已创建',
        content: `${taskName} 已创建，等待启动训练。`,
        targetPath: taskId ? `/training/detail/${taskId}` : '/training',
      })
      message.success('创建成功')
      navigate('/training')
    }
  }

  // 取消：返回训练列表并恢复表单初始状态
  const handleCancel = () => {
    form.resetFields()
    setActiveTab('basic')
    navigate('/training')
  }

  // 标签页配置（字段说明见 tooltip，不在输入框下方重复展示）
  const tabItems = [
    {
      key: 'basic',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SettingOutlined />
          基础参数
        </span>
      ),
      children: (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 24px' }}>
          <Form.Item
            label="学习率"
            name="learningRate"
            tooltip="学习率 (Learning Rate)，控制模型学习新知识的速度。过高会导致训练不稳定，过低会使训练速度过慢。"
          >
            <InputNumber style={{ width: '100%' }} min={0} step={0.000001} precision={6} placeholder="如: 0.000050" />
          </Form.Item>
          <Form.Item
            label="训练轮次"
            name="numEpochs"
            tooltip="训练轮次 (num_epochs)，控制训练过程中遍历过数据集的次数。建议设置在1-15之间，数据集可用更少轮次以避免过拟合。"
          >
            <InputNumber style={{ width: '100%' }} min={1} max={100} placeholder="1-15" />
          </Form.Item>
          <Form.Item
            label="每个设备上的训练batch大小"
            name="perDeviceBatchSize"
            tooltip="控制每个设备上进行训练时的批次大小，影响训练速度和内存占用。"
          >
            <InputNumber style={{ width: '100%' }} min={1} placeholder="如: 2" />
          </Form.Item>
          <Form.Item
            label="梯度累积步数"
            name="gradientAccumulationSteps"
            tooltip="控制梯度累积的步数，影响训练速度和内存占用。"
          >
            <InputNumber style={{ width: '100%' }} min={1} placeholder="如: 1" />
          </Form.Item>
          <Form.Item
            label="预热比例"
            name="warmupRatio"
            tooltip="预热比例 (Warmup Ratio)，训练开始时学习率逐渐增加到设定值的过程占总训练步数的比例。"
          >
            <InputNumber style={{ width: '100%' }} min={0} max={1} step={0.01} placeholder="0.0-1.0" />
          </Form.Item>
          <Form.Item
            label="学习率调度器类型"
            name="lrSchedulerType"
            tooltip="学习率调度器类型，自动学习率调度器根据训练过程自动调整学习率。"
          >
            <Select placeholder="请选择">
              <Select.Option value="COSINE">COSINE</Select.Option>
              <Select.Option value="LINEAR">LINEAR</Select.Option>
              <Select.Option value="CONSTANT">CONSTANT</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="是否使用bf16精度"
            name="useBf16"
            valuePropName="checked"
            tooltip="是否使用bf16精度，使用bf16精度可以提高训练速度，但会略微降低训练精度。"
          >
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'advanced',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ThunderboltOutlined />
          高级配置
        </span>
      ),
      children: (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 24px' }}>
          <Form.Item
            label="梯度检查点"
            name="gradientCheckpointing"
            tooltip="通过梯度检查点技术减少训练过程中的内存占用，适用于显存受限的情况。"
          >
            <Select placeholder="请选择">
              <Select.Option value={true}>是</Select.Option>
              <Select.Option value={false}>否</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="最大梯度范数"
            name="maxGradNorm"
            tooltip="梯度裁剪有助于稳定训练过程，防止梯度爆炸问题。常用值为1.0。"
          >
            <InputNumber style={{ width: '100%' }} min={0} step={0.1} placeholder="常用值: 1.0" />
          </Form.Item>
          <Form.Item
            label="RoPE缩放方法"
            name="ropeScalingMethod"
            tooltip="RoPE缩放方法用于扩展模型的上下文窗口大小，YaRN是一种高效的上下文扩展技术。"
          >
            <Select placeholder="请选择">
              <Select.Option value="YARN">YARN</Select.Option>
              <Select.Option value="NONE">无</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="随机种子"
            name="randomSeed"
            tooltip="设置固定的随机种子可以确保训练过程的可重复性，便于实验比较和调试。"
          >
            <InputNumber style={{ width: '100%' }} min={0} placeholder="如: 42" />
          </Form.Item>
          <Form.Item
            label="权重衰减"
            name="weightDecay"
            tooltip="权重衰减是一种正则化技术，有助于防止模型过拟合。设置为0表示不使用权重衰减。"
          >
            <InputNumber style={{ width: '100%' }} min={0} step={0.000001} precision={6} placeholder="0表示不使用" />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'dataProcess',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DatabaseOutlined />
          数据处理配置
        </span>
      ),
      children: (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 24px' }}>
          <Form.Item
            label="训练样本的最大token长度限制"
            name="cutoffLength"
            tooltip="训练样本的最大token长度限制 (Cutoff Len)，训练样本的最大token长度限制。"
          >
            <InputNumber style={{ width: '100%' }} min={64} max={8192} placeholder="如: 4096" />
          </Form.Item>
          <Form.Item
            label="预处理各种进程数"
            name="preprocessingNumWorkers"
            tooltip="预处理各种进程数 (Preprocessing Num Workers)，控制预处理各种进程数。"
          >
            <InputNumber style={{ width: '100%' }} min={1} max={32} placeholder="如: 16" />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'eval',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChartOutlined />
          评估配置
        </span>
      ),
      children: (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 24px' }}>
          <Form.Item
            label="评估策略"
            name="evalStrategy"
            tooltip="控制模型评估的频率和时机，按步数评估会在训练到指定步数时进行评估,评估策略与评估间隔步数保持一致。"
          >
            <Select placeholder="请选择">
              <Select.Option value="STEPS">STEPS</Select.Option>
              <Select.Option value="EPOCHS">EPOCHS</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="评估间隔步数"
            name="evalSteps"
            tooltip="当评估策略选择「按步数评估」时，每训练指定步数后进行一次模型评估,评估间隔步数与评估策略保持一致。"
          >
            <InputNumber style={{ width: '100%' }} min={1} placeholder="如: 20" />
          </Form.Item>
          <Form.Item
            label="指标越大越好"
            name="metricGreaterIsBetter"
            valuePropName="checked"
            tooltip="控制评估指标的优化方向，例如准确率越大越好，而损失值越小越好。"
          >
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>
          <Form.Item
            label="训练结束加载最佳模型"
            name="loadBestModelAtEnd"
            valuePropName="checked"
            tooltip="开启后，训练结束时会自动加载评估表现最佳的模型权重。"
          >
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>
          <Form.Item
            label="最佳模型指标"
            name="bestModelMetric"
            tooltip="选择用于判断训练过程中最佳模型的评估指标，通常使用损失值。"
          >
            <Select placeholder="请选择">
              <Select.Option value="loss">损失值 (loss)</Select.Option>
              <Select.Option value="accuracy">准确率</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="每个设备上的评估batch大小"
            name="perDeviceEvalBatchSize"
            tooltip="控制每个设备上进行评估时的批次大小，影响评估速度和内存占用。"
          >
            <InputNumber style={{ width: '100%' }} min={1} placeholder="如: 2" />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'save',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SaveOutlined />
          保存配置
        </span>
      ),
      children: (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 24px' }}>
          <Form.Item
            label="模型保存步数"
            name="saveSteps"
            tooltip="当保存策略选择「按步数保存」时，每训练指定步数后进行一次模型保存，保存步数与保存策略保持一致。"
          >
            <InputNumber style={{ width: '100%' }} min={1} placeholder="如: 20" />
          </Form.Item>
          <Form.Item
            label="模型保存策略"
            name="saveStrategy"
            tooltip="控制模型保存的频率和时机，按步数保存会在训练到指定步数时进行模型保存，保存策略与保存步数保持一致。"
          >
            <Select placeholder="请选择">
              <Select.Option value="STEPS">STEPS</Select.Option>
              <Select.Option value="EPOCHS">EPOCHS</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item label="模型保存总数限制" name="saveTotalLimit" tooltip="模型保存总数限制。">
            <InputNumber style={{ width: '100%' }} min={1} max={100} placeholder="如: 3" />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'monitor',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MonitorOutlined />
          监控配置
        </span>
      ),
      children: (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 24px' }}>
          <Form.Item label="日志" name="loggingSteps" tooltip="日志记录频率。">
            <InputNumber style={{ width: '100%' }} min={1} placeholder="如: 5" />
          </Form.Item>
        </div>
      ),
    },
  ]

  // LoRA 配置标签页（仅选择 LoRA 微调时显示）
  const loraTabItem = {
    key: 'lora',
    label: (
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <SafetyOutlined />
        LoRA配置
      </span>
    ),
    children: (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 24px' }}>
        <Form.Item
          label="LoRA秩 (LoRA Rank)"
          name="loraRank"
          tooltip="LoRA秩 (LoRA Rank)，LoRA的秩决定了可训练参数的数量。秩越低，参数越少，训练速度越快，但可能影响模型的表达能力。建议选择8或16。"
        >
          <InputNumber style={{ width: '100%' }} min={1} max={256} placeholder="如: 16" />
        </Form.Item>
        <Form.Item
          label="LoRA 目标模块"
          name="loraTargetModules"
          tooltip="可以是 'all' 或具体的模块名称，LoRA的目标模块决定了可训练参数的数量。目标模块越少，参数越少，训练速度越快，但可能影响模型的表达能力。"
        >
          <LoraTargetModulesSelect />
        </Form.Item>
        <Form.Item
          label="LoRA alpha 参数"
          name="loraAlpha"
          tooltip="LoRA alpha 参数，通常设置为 lora_rank 的2倍，影响模型的表达能力。"
        >
          <InputNumber style={{ width: '100%' }} min={1} placeholder="如: 32" />
        </Form.Item>
        <Form.Item
          label="LoRA dropout 率"
          name="loraDropout"
          tooltip="LoRA dropout 率，LoRA的dropout率决定了可训练参数的数量。dropout率越低，参数越少，训练速度越快，但可能影响模型的表达能力。"
        >
          <InputNumber style={{ width: '100%' }} min={0} max={1} step={0.01} precision={2} placeholder="如: 0.00" />
        </Form.Item>
      </div>
    ),
  }

  // 合并标签页：若选择 LoRA 则在末尾追加 LoRA 配置标签
  const computedTabItems = fineTuneType === 'lora'
    ? [...tabItems.slice(0, -1), loraTabItem, tabItems[tabItems.length - 1]]
    : tabItems

  return (
    <div style={{ padding: '28px 32px', minHeight: '100%' }}>
      {/* 页面标题 + 返回按钮（新增版本时） */}
      <div
        style={{
          marginBottom: 28,
          opacity: 0,
          animation: 'fadeInUp 0.5s ease forwards',
        }}
      >
        {mode !== 'create' && (
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/training/detail/${taskId}`)}
            style={{
              borderRadius: 8,
              marginBottom: 16,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            返回详情
          </Button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div
            style={{
              width: 40,
              height: 40,
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
            }}
          >
            <RocketOutlined style={{ color: '#fff', fontSize: 20 }} />
          </div>
          <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px' }}>
            {mode === 'create'
              ? isNewVersionUnderTask
                ? `新增版本（${effectiveVersionLabel}）`
                : '创建训练任务'
              : mode === 'editVersion'
                ? `编辑版本（${effectiveVersionLabel}）`
                : `重新提交（${effectiveVersionLabel}）`}
          </Title>
        </div>
        <Paragraph style={{ color: '#64748b', fontSize: 14, marginLeft: 52, marginBottom: 0 }}>
          {mode === 'create'
            ? isNewVersionUnderTask
              ? `基于「${parentTask?.name}」，创建新的训练版本 ${effectiveVersionLabel}`
              : '配置大模型训练参数，创建新的训练任务'
            : mode === 'editVersion'
              ? `编辑「${parentTask?.name}」版本 ${effectiveVersionLabel} 的配置信息`
              : `基于「${parentTask?.name}」版本 ${effectiveVersionLabel} 重新提交训练`}
        </Paragraph>
      </div>

      {missingVersionForEdit ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="未找到对应版本"
          description="链接中的版本 id 与当前任务数据不一致，请从任务详情重新进入编辑。"
        />
      ) : null}

      <Form
        key={formRouteKey}
        form={form}
        layout="vertical"
        scrollToFirstError={{ behavior: 'smooth', block: 'center' }}
        initialValues={formInitialValues}
      >
        {/* 基础配置 */}
        <Card
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 4, height: 18, background: 'linear-gradient(180deg, #2563eb 0%, #3b82f6 100%)', borderRadius: 2 }} />
              <span style={{ fontWeight: 600, fontSize: 15 }}>基础配置</span>
            </div>
          }
          style={{
            marginBottom: 20,
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            opacity: 0,
            animation: 'fadeInUp 0.5s ease 0.1s forwards',
          }}
          styles={{ body: { padding: '24px' } }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
            <Form.Item
              label="任务名称"
              name="taskName"
              rules={[{ required: true, message: '请输入任务名称' }]}
            >
              <Input placeholder="请输入任务名称" disabled={!canEditTaskName} />
            </Form.Item>
            <Form.Item label="任务版本" name="taskVersion">
              <Input disabled />
            </Form.Item>
            <Form.Item label="任务定时配置" tooltip="可选配置，支持定时启动训练任务">
              <Space size={12}>
                <Form.Item name="scheduleEnabled" valuePropName="checked" noStyle>
                  <Switch checkedChildren="开" unCheckedChildren="关" />
                </Form.Item>
                {scheduleEnabled && (
                  <Form.Item name="taskSchedule" noStyle>
                    <DatePicker showTime format="YYYY-MM-DD HH:mm" placeholder="选择时间" />
                  </Form.Item>
                )}
              </Space>
            </Form.Item>
          </div>
          <Form.Item label="任务描述" name="taskDescription">
            <TextArea rows={2} placeholder="请输入任务描述（0 / 300）" maxLength={300} showCount />
          </Form.Item>
        </Card>

        {/* 训练配置（与模型配置互换位置：先选训练方法，再选模型） */}
        <Card
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 4, height: 18, background: 'linear-gradient(180deg, #0891b2 0%, #22d3ee 100%)', borderRadius: 2 }} />
              <span style={{ fontWeight: 600, fontSize: 15 }}>训练配置</span>
            </div>
          }
          style={{
            marginBottom: 20,
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            opacity: 0,
            animation: 'fadeInUp 0.5s ease 0.15s forwards',
          }}
          styles={{ body: { padding: '24px' } }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <Form.Item
              label="训练类型"
              name="trainingType"
              rules={[{ required: true, message: '请选择训练类型' }]}
              tooltip="切换类型将筛选可用的具体模型：文本生成仅展示语言模型，图像理解仅展示含 VL 的视觉语言模型"
            >
              <Select
                placeholder="请选择训练类型"
                onChange={() => {
                  form.setFieldValue('baseModel', undefined)
                  form.setFieldValue('trainedModelId', undefined)
                  form.setFieldValue('rewardModelId', undefined)
                }}
              >
                <Select.Option value="text">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: 3, fontWeight: 500 }}>文本</span>
                    文本生成
                  </div>
                </Select.Option>
                <Select.Option value="vision">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: '#0891b2', background: 'rgba(8, 145, 178, 0.08)', padding: '2px 6px', borderRadius: 3, fontWeight: 500 }}>视觉</span>
                    图像理解
                  </div>
                </Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              label="训练方法"
              name="trainingMethod"
              rules={[{ required: true, message: '请选择训练方法' }]}
              tooltip="强化学习（DPO / RFT）支持文本生成和图像理解；新建版本时可从父任务继承或切换"
            >
              <Select
                placeholder="请选择训练方法"
                onChange={() => {
                  form.setFieldValue('baseModel', undefined)
                  form.setFieldValue('trainedModelId', undefined)
                  form.setFieldValue('rftAlgorithm', undefined)
                  form.setFieldValue('rewardRuleType', undefined)
                  form.setFieldValue('rewardRuleCustomCodePath', undefined)
                }}
              >
                <Select.Option value="SFT">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#4f46e5', background: 'rgba(79,70,229,0.08)', padding: '1px 6px', borderRadius: 3, fontWeight: 600 }}>SFT</span>
                    SFT（监督微调）
                  </div>
                </Select.Option>
                <Select.Option value="DPO">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#089669', background: 'rgba(8,150,105,0.08)', padding: '1px 6px', borderRadius: 3, fontWeight: 600 }}>DPO</span>
                    DPO（直接偏好优化）
                  </div>
                </Select.Option>
                <Select.Option value="RFT">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#7c3aed', background: 'rgba(124,58,237,0.08)', padding: '1px 6px', borderRadius: 3, fontWeight: 600 }}>RFT</span>
                    RFT（强化微调）
                  </div>
                </Select.Option>
              </Select>
            </Form.Item>
          </div>

          {/* RFT 算法选择 + 奖励规则配置（位于训练配置模块） */}
          {trainingMethod === 'RFT' && (
            <>
              <Divider style={{ margin: '20px 0 16px' }} />

              <Form.Item
                label="RFT 算法"
                name="rftAlgorithm"
                rules={[{ required: trainingMethod === 'RFT', message: '请选择 RFT 算法' }]}
                tooltip="RFT 支持 PPO（近端策略优化）和 GRPO（群组相对策略优化）两种算法"
              >
                <Radio.Group style={{ display: 'flex', gap: 16 }}>
                  <Radio.Button value="PPO" style={{ height: 40, lineHeight: '38px', padding: '0 24px', borderRadius: 8 }}>
                    <Space>
                      <span style={{ fontSize: 11, color: '#9f1239', background: 'rgba(159,18,57,0.08)', padding: '1px 6px', borderRadius: 3, fontWeight: 600 }}>PPO</span>
                      近端策略优化
                    </Space>
                  </Radio.Button>
                  <Radio.Button value="GRPO" style={{ height: 40, lineHeight: '38px', padding: '0 24px', borderRadius: 8 }}>
                    <Space>
                      <span style={{ fontSize: 11, color: '#0891b2', background: 'rgba(8,145,178,0.08)', padding: '1px 6px', borderRadius: 3, fontWeight: 600 }}>GRPO</span>
                      群组相对策略优化
                    </Space>
                  </Radio.Button>
                </Radio.Group>
              </Form.Item>

              <Form.Item name="rewardRule" valuePropName="value">
                <RewardRulesConfig />
              </Form.Item>
            </>
          )}

          <Divider style={{ margin: '20px 0 16px' }} />

          <DeepSpeedStageField />

          {/* 微调类型：仅 SFT / DPO / RFT 显示，参数 Tabs 紧跟其后 */}
          {(trainingMethod === 'SFT' || trainingMethod === 'DPO' || trainingMethod === 'RFT') && (
            <Form.Item
              label="微调类型"
              name="fineTuneType"
              rules={[{ required: true, message: '请选择微调类型' }]}
            >
              <FineTuneTypePicker onAfterChange={() => setActiveTab('basic')} />
            </Form.Item>
          )}

          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={computedTabItems}
            style={{ marginTop: -8 }}
          />
        </Card>

        {/* 模型配置（互换位置后移至第三） */}
        <Card
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 4, height: 18, background: 'linear-gradient(180deg, #7c3aed 0%, #a78bfa 100%)', borderRadius: 2 }} />
              <span style={{ fontWeight: 600, fontSize: 15 }}>模型配置</span>
            </div>
          }
          style={{
            marginBottom: 20,
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            opacity: 0,
            animation: 'fadeInUp 0.5s ease 0.2s forwards',
          }}
          styles={{ body: { padding: '24px' } }}
        >
          {/* 基础模型来源切换：基础模型 / 我的模型 */}
          <Form.Item label="模型来源" name="baseModelSource">
            <Radio.Group
              value={baseModelSource}
              onChange={e => {
                form.setFieldValue('baseModelSource', e.target.value)
                form.setFieldValue('baseModel', undefined)
                form.setFieldValue('trainedModelId', undefined)
              }}
            >
              <Radio.Button value="base">
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CloudServerOutlined />
                  基础模型
                </span>
              </Radio.Button>
              <Radio.Button value="my">
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ExperimentOutlined />
                  我的模型
                </span>
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          {/* 选择基础模型（基础模型来源时） */}
          {baseModelSource === 'base' && (
            <Form.Item
              label="基础模型版本"
              name="baseModel"
              rules={[{ required: baseModelSource === 'base', message: '请选择具体模型版本' }]}
              tooltip="通过弹窗先选择模型提供商，再选择具体模型；Qwen 本期标记为已适配，其它提供商可选并标记为未适配"
            >
              <BaseModelModalPicker options={filteredVariants} trainingType={trainingType} />
            </Form.Item>
          )}

          {/* 选择我的模型（我的模型来源时） */}
          {baseModelSource === 'my' && (
            <Form.Item
              label="选择已训练模型"
              name="trainedModelId"
              rules={[{ required: baseModelSource === 'my', message: '请选择已训练的模型' }]}
              tooltip="选择已训练完成的模型作为基础模型进行强化学习训练"
            >
              {filteredTrainedModels.length === 0 ? (
                <div style={{ padding: '24px 20px', textAlign: 'center', background: '#f8fafc', borderRadius: 12, border: '1px dashed #cbd5e1', color: '#94a3b8' }}>
                  当前训练类型暂无已训练模型
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {filteredTrainedModels.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => form.setFieldValue('trainedModelId', m.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderRadius: 10,
                        border: form.getFieldValue('trainedModelId') === m.id ? '2px solid #1677ff' : '1px solid #e2e8f0',
                        background: form.getFieldValue('trainedModelId') === m.id ? 'rgba(22,119,255,0.06)' : '#fff',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>{m.name}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                          {m.versionCount ?? 1}个版本 · {m.createdAt}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Tag
                          color={
                            m.method === 'SFT' ? 'blue'
                            : m.method === 'DPO' ? 'green'
                            : m.method === 'RFT' ? 'purple'
                            : 'default'
                          }
                          style={{ fontWeight: 600 }}
                        >
                          {m.method}
                        </Tag>
                        {form.getFieldValue('trainedModelId') === m.id && (
                          <CheckOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Form.Item>
          )}
        </Card>

        {/* 数据配置 */}
        <Card
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 4, height: 18, background: 'linear-gradient(180deg, #059669 0%, #34d399 100%)', borderRadius: 2 }} />
              <span style={{ fontWeight: 600, fontSize: 15 }}>数据配置</span>
            </div>
          }
          style={{
            marginBottom: 20,
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            opacity: 0,
            animation: 'fadeInUp 0.5s ease 0.25s forwards',
          }}
          styles={{ body: { padding: '24px' } }}
        >
          <Form.Item
            label="训练数据集"
            name="trainingDatasets"
            rules={[{ type: 'array', min: 1, message: '请至少添加一个训练数据集' }]}
          >
            <TrainingDatasetPicker trainingType={trainingType} trainingMethod={trainingMethod} />
          </Form.Item>

          {trainingDatasets.length > 0 && (
            <div style={{ marginBottom: 16, color: '#666', padding: '12px 16px', background: '#f8fafc', borderRadius: 8 }}>
              <Text style={{ color: '#64748b' }}>总记录数：{trainingDatasets.length}条</Text>
              <Text style={{ marginLeft: 24, color: '#64748b' }}>
                总比例：
                {trainingDatasets.reduce((sum, d) => sum + Number(d.trainRatio || 0), 0)}%
              </Text>
              <Text type="danger" style={{ marginLeft: 8 }}>(必须等于100%)</Text>
            </div>
          )}

          <Divider style={{ margin: '24px 0' }} />

          <Form.Item
            label="验证集配置"
            name="validationSplitMode"
            tooltip="从训练数据集中按比例拆分验证集：选择「数据拆分」时，按下方滑动条在 0%–20% 间设定拆分比例（默认 15%）。选择「验证数据集」时，改为从平台选择独立验证集。"
          >
            <Radio.Group style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
              <Radio value="split">数据拆分</Radio>
              <Radio value="dataset">验证数据集</Radio>
            </Radio.Group>
          </Form.Item>

          {validationSplitMode === 'split' ? (
            <Form.Item label="拆分比例：" name="splitRatio" style={{ marginBottom: 8 }}>
              <Slider
                min={0}
                max={20}
                step={5}
                marks={{
                  0: '0%',
                  5: '5%',
                  10: '10%',
                  15: '15%',
                  20: '20%',
                }}
                tooltip={{ formatter: v => (v != null ? `${v}%` : '') }}
              />
            </Form.Item>
          ) : (
            <Form.Item
              label="验证数据集"
              name="evalDataset"
              tooltip="从平台数据集中选择用于验证的数据集（可不选则按业务规则处理）。"
            >
              <EvalDatasetPicker trainingType={trainingType} trainingMethod={trainingMethod} />
            </Form.Item>
          )}
        </Card>

        {/* 显卡资源配置 */}
        <Card
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 4, height: 18, background: 'linear-gradient(180deg, #dc2626 0%, #f87171 100%)', borderRadius: 2 }} />
              <span style={{ fontWeight: 600, fontSize: 15 }}>显卡资源配置</span>
            </div>
          }
          style={{
            marginBottom: 20,
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
            opacity: 0,
            animation: 'fadeInUp 0.5s ease 0.3s forwards',
          }}
          styles={{ body: { padding: '24px' } }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
            <Form.Item label="显卡类型及型号" name="gpuType">
              <Select placeholder="请选择显卡类型及型号">
                <Select.Option value="A100">NVIDIA A100</Select.Option>
                <Select.Option value="V100">NVIDIA V100</Select.Option>
                <Select.Option value="T4">NVIDIA T4</Select.Option>
                <Select.Option value="H100">NVIDIA H100</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item label="显卡卡数配置" name="gpuCount">
              <Select placeholder="请选择显卡数量">
                <Select.Option value={1}>1卡</Select.Option>
                <Select.Option value={2}>2卡</Select.Option>
                <Select.Option value={4}>4卡</Select.Option>
                <Select.Option value={8}>8卡</Select.Option>
              </Select>
            </Form.Item>
          </div>

          {/* GPU 资源配置卡片 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
            marginTop: 20,
            padding: 20,
            background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.03) 0%, rgba(99, 102, 241, 0.03) 100%)',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
          }}>
            <Form.Item label="CPU请求" name="cpuRequest" style={{ marginBottom: 0 }}>
              <InputNumber style={{ width: '100%' }} min={1} addonAfter="Core" placeholder="如: 8" />
            </Form.Item>
            <Form.Item label="CPU限制" name="cpuLimit" style={{ marginBottom: 0 }}>
              <InputNumber style={{ width: '100%' }} min={1} addonAfter="Core" placeholder="如: 16" />
            </Form.Item>
            <Form.Item label="内存请求" name="memoryRequest" style={{ marginBottom: 0 }}>
              <InputNumber style={{ width: '100%' }} min={1} addonAfter="GB" placeholder="如: 32" />
            </Form.Item>
            <Form.Item label="内存限制" name="memoryLimit" style={{ marginBottom: 0 }}>
              <InputNumber style={{ width: '100%' }} min={1} addonAfter="GB" placeholder="如: 64" />
            </Form.Item>
          </div>
        </Card>

        {/* 操作按钮（避免 opacity:0 动画未完成时影响点击与可见性） */}
        <div
          style={{
            textAlign: 'right',
            marginTop: 32,
            padding: '24px 0',
            position: 'relative',
            zIndex: 2,
          }}
        >
          <Space size={16}>
            <Button
              htmlType="button"
              onClick={handleCancel}
              size="large"
              style={{
                borderRadius: 10,
                height: 44,
                padding: '0 32px',
                fontWeight: 500,
              }}
            >
              取消
            </Button>
            <Button
              type="primary"
              htmlType="button"
              size="large"
              icon={<CloudServerOutlined />}
              onClick={handleSubmit}
              style={{
                borderRadius: 10,
                height: 44,
                padding: '0 32px',
                fontWeight: 600,
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
              }}
            >
              {mode === 'editVersion' ? '保存' : mode === 'resubmitFrom' ? '重新提交' : '提交'}
            </Button>
          </Space>
        </div>
      </Form>

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(15px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}

export default CreateTraining
