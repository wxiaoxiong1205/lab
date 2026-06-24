import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Col, Divider, Form, InputNumber, Radio, Row, Select, Slider, Space, Table, Tag, Tooltip, Typography, message } from 'antd'
import { DatabaseOutlined, DeleteOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { useParams } from 'react-router-dom'
import type { ValidationConfig, trainDatasetConfig } from '../../types'
import DatasetCascaderSelector from '@/components/inference/DatasetCascaderSelector'
import FINETUNE_VISIBLE_TRAINING_TYPES from '@/utils/EnumMaping'

const FINETUNE_TRAINING_PICK_FIELD = 'finetune_training_dataset_pick'
const FINETUNE_VALIDATION_PICK_FIELD = 'finetune_validation_dataset_pick'
const EMPTY_DATA_CONFIG: DataConfigValue = {
  training_datasets: [],
  validation_config: {
    type: 'split',
    split_ratio: 15,
  },
  validation_datasets: [],
}
const { Title, Text } = Typography
// 训练数据集类型（适配现有接口）
interface TrainingDataset {
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
/**
 * 数据集信息接口
 * 描述数据集的基本信息、版本信息和使用情况
 */
export interface DatasetInfo {
  created_at: string
  dataset_format: string
  dataset_name: string
  dataset_type: string
  earliest_version: string
  latest_version: string
  project_id: number
  training_method_type: string
  updated_at: string
  usage: string
  version_count: number
}
// 验证数据集类型（用于平台数据集选择）
interface ValidationDataset {
  id: string
  name: string
  description?: string
  format: string
  record_count: number
  status: string
  dataset_type?: string
  dataset_format?: string
}
// 验证数据集配置类型
interface ValidationDatasetConfig {
  id: string
  name: string
  version: string
  dataset_path: string
  character_count: number
  sample_count: number
  sampling_rate: number
  weight_in_total: number
  dataset_type: string
  dataset_format: string
}
// 数据配置值类型
export interface DataConfigValue {
  // 训练数据集（多选）
  training_datasets: trainDatasetConfig[]
  // 验证集配置
  validation_config: ValidationConfig
  // 验证数据集（用于平台数据集模式）
  validation_datasets?: ValidationDatasetConfig[]
}
interface EnhancedDataConfigProps {
  onChange?: (config: DataConfigValue) => void
  value?: DataConfigValue
  availableTrainingDatasets: TrainingDataset[]
  availableValidationDatasets: ValidationDataset[]
  disabled?: boolean
  projectId?: number
  dataConfig?: any
  form?: any
  trainTypeCategoryFromTask?: string
  trainingMethodTypeFromTask?: string
}
/**
 * 增强的数据配置组件
 * 支持多训练数据集选择和验证集双模式配置
 */
const EnhancedDataConfig: React.FC<EnhancedDataConfigProps> = ({ onChange, value, disabled = false, projectId, dataConfig, form: _form, trainTypeCategoryFromTask, trainingMethodTypeFromTask }) => {
  const [config, setConfig] = useState<DataConfigValue>(value ?? dataConfig ?? EMPTY_DATA_CONFIG)
  const { projectIdParam } = useParams<{
    projectIdParam: string
  }>()
  const [pickerForm] = Form.useForm()
  const [validationPickerForm] = Form.useForm()
  const [parentWatchFallback] = Form.useForm()
  const parentFormForWatch = _form ?? parentWatchFallback
  const trainTypeCategory = Form.useWatch('train_type_category', parentFormForWatch)
  const trainingMethodType = Form.useWatch('training_type', parentFormForWatch)
  const latestConfigRef = useRef<DataConfigValue>(value ?? dataConfig ?? EMPTY_DATA_CONFIG)
  latestConfigRef.current = value ?? config ?? dataConfig ?? EMPTY_DATA_CONFIG
  useEffect(() => {
    if (value !== undefined && value !== null) {
      setConfig(value)
      return
    }
    if (dataConfig) {
      setConfig(dataConfig)
    }
  }, [value, dataConfig])
  const effectiveTrainTypeCategory = trainTypeCategoryFromTask ?? trainTypeCategory
  const watchedTrainingMethodType = typeof trainingMethodType === 'string' && ['sft', 'dpo'].includes(trainingMethodType)
    ? trainingMethodType
    : undefined
  const taskTrainingMethodType = typeof trainingMethodTypeFromTask === 'string' && ['sft', 'dpo'].includes(trainingMethodTypeFromTask)
    ? trainingMethodTypeFromTask
    : undefined
  const effectiveTrainingMethodType = watchedTrainingMethodType ?? taskTrainingMethodType

  // 获取训练数据集的数据用途和格式
  const getTrainingDatasetRequirements = () => {
    if (config.training_datasets.length === 0) {
      return { dataset_type: null, dataset_format: null }
    }
    // 获取第一个训练数据集的数据用途和格式作为标准
    const firstDataset = config.training_datasets[0]
    return {
      dataset_type: firstDataset.dataset_type || null,
      dataset_format: firstDataset.dataset_format || null,
    }
  }
  // 处理配置变更
  const handleConfigChange = (newConfig: Partial<DataConfigValue>) => {
    const updatedConfig = { ...latestConfigRef.current, ...newConfig }
    setConfig(updatedConfig)
    onChange?.(updatedConfig)
  }
  const trainingPickStatsScope = useMemo(() => {
    const first = config.training_datasets[0]
    const cat = effectiveTrainTypeCategory
    const typeOk = typeof cat === 'string' && FINETUNE_VISIBLE_TRAINING_TYPES.includes(cat) ? cat : undefined
    if (typeOk) {
      return {
        dataset_type: typeOk,
        dataset_format: first?.dataset_format ?? undefined,
        training_method_type: effectiveTrainingMethodType,
      }
    }
    if (first) {
      return {
        dataset_type: first.dataset_type || undefined,
        dataset_format: first.dataset_format || undefined,
        training_method_type: effectiveTrainingMethodType,
      }
    }
    return { dataset_type: undefined, dataset_format: undefined, training_method_type: effectiveTrainingMethodType }
  }, [config.training_datasets, effectiveTrainTypeCategory, effectiveTrainingMethodType])

  /** 验证集弹窗：与当前训练数据用途一致；无首条时仍用任务/表单训练类型，避免可选到其它用途 */
  const validationPickStatsScope = useMemo(() => {
    const first = config.training_datasets[0]
    const cat = effectiveTrainTypeCategory
    const typeOk = typeof cat === 'string' && FINETUNE_VISIBLE_TRAINING_TYPES.includes(cat) ? cat : undefined
    const dataset_type = first?.dataset_type || typeOk
    const dataset_format = first?.dataset_format
    return { dataset_type, dataset_format, training_method_type: effectiveTrainingMethodType }
  }, [config.training_datasets, effectiveTrainTypeCategory, effectiveTrainingMethodType])

  const handleValidationDatasetMultiPick = (value: string[][], payloads?: any[][]) => {
    if (!value?.length || !payloads?.length)
      return
    const requirements = getTrainingDatasetRequirements()
    const existing = config.validation_datasets || []
    const newItems: ValidationDatasetConfig[] = []
    const remainingSlots = 3 - existing.length
    for (let i = 0; i < value.length && newItems.length < remainingSlots; i++) {
      const triple = value[i]
      const payload = payloads[i]
      if (!Array.isArray(triple) || triple.length < 3)
        continue
      const versionData = payload?.[2]?.versionData
      const [, datasetName, versionStr] = triple
      const name = versionData?.name ?? datasetName
      const versionId = `${name}-${versionStr}`
      if (existing.some((d) => d.id === versionId) || newItems.some((d) => d.id === versionId)) {
        continue
      }
      const dt = versionData?.dataset_type ?? (payload?.[1] as {
        data?: {
          dataset_type?: string
        }
      })?.data?.dataset_type ?? ''
      const df = versionData?.dataset_format ?? ''
      if (requirements.dataset_type && dt !== requirements.dataset_type)
        continue
      if (requirements.dataset_format && df !== requirements.dataset_format)
        continue
      newItems.push({
        id: versionId,
        name,
        version: versionStr,
        dataset_path: versionData?.dataset_path || '',
        character_count: versionData?.total_characters ?? versionData?.character_count ?? 0,
        sample_count: versionData?.total_samples ?? versionData?.sample_count ?? 0,
        sampling_rate: 1,
        weight_in_total: 100,
        dataset_type: dt,
        dataset_format: df,
      })
    }
    if (newItems.length === 0) {
      message.warning('所选验证集均已添加，或与当前训练数据类型/格式不一致')
      validationPickerForm.resetFields([FINETUNE_VALIDATION_PICK_FIELD])
      return
    }
    const merged = [...existing, ...newItems]
    const autoDistributedList = autoDistributeValidationRatio(merged)
    handleConfigChange({ validation_datasets: autoDistributedList })
    message.success('成功添加验证数据集，已自动平均分配验证比例')
    validationPickerForm.resetFields([FINETUNE_VALIDATION_PICK_FIELD])
  }
  // 自动平均分配训练比例（内部函数，用于添加数据集时自动调用）
  const autoDistributeTrainingRatio = (datasets: trainDatasetConfig[]) => {
    if (datasets.length === 0)
      return datasets
    const averageRatio = Math.floor(100 / datasets.length)
    const remainder = 100 - (averageRatio * datasets.length)
    return datasets.map((dataset, index) => ({
      ...dataset,
      weight_in_total: index === 0 ? averageRatio + remainder : averageRatio,
    }))
  }
  const handleFinetuneTrainingDatasetPick = (value: any[], selectedOptions?: any[]) => {
    if (!value || value.length < 3) return
    const versionData = selectedOptions?.[2]?.versionData
    const [, datasetName, versionStr] = value
    const name = versionData?.name ?? datasetName
    const versionId = `${name}-${versionStr}`
    if (config.training_datasets.some((dataset) => dataset.id === versionId)) {
      message.warning('该训练数据集已存在')
      pickerForm.resetFields([FINETUNE_TRAINING_PICK_FIELD])
      return
    }
    const datasetTypeFromPick = versionData?.dataset_type
      ?? (selectedOptions?.[1] as {
        data?: {
          dataset_type?: string
        }
      })?.data?.dataset_type
      ?? ''
    const newDataset: trainDatasetConfig = {
      id: versionId,
      name,
      version: versionStr,
      dataset_path: versionData?.dataset_path || '',
      character_count: versionData?.total_characters ?? versionData?.character_count ?? 0,
      sample_count: versionData?.total_samples ?? versionData?.sample_count ?? 0,
      sampling_rate: 1,
      weight_in_total: 100,
      dataset_type: datasetTypeFromPick,
      dataset_format: versionData?.dataset_format || '',
    }
    const newList = [...config.training_datasets, newDataset]
    const autoDistributedList = autoDistributeTrainingRatio(newList)
    handleConfigChange({ training_datasets: autoDistributedList })
    if (_form
      && datasetTypeFromPick
      && FINETUNE_VISIBLE_TRAINING_TYPES.includes(datasetTypeFromPick)
      && !trainTypeCategoryFromTask) {
      _form.setFieldsValue({ train_type_category: datasetTypeFromPick })
    }
    message.success('成功添加训练数据集，已自动平均分配训练比例')
    pickerForm.resetFields([FINETUNE_TRAINING_PICK_FIELD])
  }
  // 自动平均分配训练比例（用户手动触发）
  const handleAutoDistributeRatio = () => {
    if (config.training_datasets.length === 0)
      return
    const autoDistributedList = autoDistributeTrainingRatio(config.training_datasets)
    handleConfigChange({ training_datasets: autoDistributedList })
  }
  // 自动平均分配验证比例（内部函数，用于添加验证数据集时自动调用）
  const autoDistributeValidationRatio = (datasets: ValidationDatasetConfig[]) => {
    if (datasets.length === 0)
      return datasets
    const averageRatio = Math.floor(100 / datasets.length)
    const remainder = 100 - (averageRatio * datasets.length)
    return datasets.map((dataset, index) => ({
      ...dataset,
      weight_in_total: index === 0 ? averageRatio + remainder : averageRatio,
    }))
  }
  // 自动平均分配验证比例（用户手动触发）
  const handleAutoDistributeValidationRatio = () => {
    if ((config.validation_datasets || []).length === 0)
      return
    const autoDistributedList = autoDistributeValidationRatio(config.validation_datasets || [])
    handleConfigChange({ validation_datasets: autoDistributedList })
  }
  // 计算训练数据集统计信息
  const trainingStats = useMemo(() => {
    const totalRatio = config.training_datasets.reduce((sum, d) => sum + (d.weight_in_total || 0), 0)
    const totalRecords = config.training_datasets.length
    const isValidRatio = totalRatio === 100
    return { totalRatio, totalRecords, isValidRatio }
  }, [config.training_datasets])
  // 计算验证数据集统计信息
  const validationStats = useMemo(() => {
    const totalRatio = (config.validation_datasets || []).reduce((sum, d) => sum + (d.weight_in_total || 0), 0)
    const totalRecords = (config.validation_datasets || []).length
    const isValidRatio = totalRatio === 100
    return { totalRatio, totalRecords, isValidRatio }
  }, [config.validation_datasets])
  // 训练数据集表格列定义
  const trainingColumns = [
    {
      title: '训练数据集',
      dataIndex: 'name',
      key: 'name',
      width: '30%',
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: '5%',
    },
    {
      title: '文件路径',
      dataIndex: 'dataset_path',
      key: 'dataset_path',
      width: '20%',
      hidden: true,
    },
    {
      title: (<Space>字符数</Space>),
      dataIndex: 'character_count',
      key: 'character_count',
      width: '10%',
    },
    {
      title: '样本数',
      dataIndex: 'sample_count',
      key: 'sample_count',
      width: '10%',
    },
    {
      title: (
        <Space>
          采样率
          <Tooltip title="数据集采样率乘数（0.01-10.0），决定实际训练数据量。例如：1.5表示将数据集放大1.5倍，0.8表示将数据集缩小到80%%">
            <InfoCircleOutlined />
          </Tooltip>
        </Space>
      ),
      dataIndex: 'sampling_rate',
      key: 'sampling_rate',
      width: '10%',
      render: (rate: number, record: trainDatasetConfig, index: number) => (<InputNumber value={rate} min={0} max={10} precision={2} step={0.01} className="w-full" disabled={disabled} onChange={(value) => handleUpdateTrainingDataset(index, 'sampling_rate', value || 0)} />),
    },
    {
      title: (
        <Space>
          训练比例 (%)
          <Tooltip title="所有数据集的比例总和必须等于100%">
            <InfoCircleOutlined />
          </Tooltip>
        </Space>
      ),
      dataIndex: 'weight_in_total',
      key: 'weight_in_total',
      render: (_: any, record: trainDatasetConfig, index: number) => (<InputNumber value={record.weight_in_total} min={1} max={100} precision={0} className="w-full" disabled={disabled} onChange={(value) => handleUpdateTrainingDataset(index, 'weight_in_total', value || 0)} addonAfter="%" />),
    },
    {
      title: '操作',
      key: 'action',
      width: '10%',
      render: (_: any, record: trainDatasetConfig, index: number) => (
        <Button type="link" danger icon={<DeleteOutlined />} disabled={disabled} onClick={() => handleRemoveTrainingDataset(index)}>
          删除
        </Button>
      ),
    },
  ]
  const handleRemoveTrainingDataset = (index: number) => {
    const newList = config.training_datasets.filter((_, i) => i !== index)
    handleConfigChange({ training_datasets: newList })
  }
  const handleUpdateTrainingDataset = (index: number, field: string, value: any) => {
    const newList = [...config.training_datasets]
    newList[index] = {
      ...newList[index],
      [field]: value,
    }
    handleConfigChange({ training_datasets: newList })
  }
  // 验证数据集删除功能
  const handleRemoveValidationDataset = (index: number) => {
    const newList = (config.validation_datasets || []).filter((_, i) => i !== index)
    handleConfigChange({ validation_datasets: newList })
  }
  // 验证数据集编辑功能
  const handleUpdateValidationDataset = (index: number, field: string, value: any) => {
    const newList = [...(config.validation_datasets || [])]
    newList[index] = {
      ...newList[index],
      [field]: value,
    }
    handleConfigChange({ validation_datasets: newList })
  }
  const validationColumns = [
    {
      title: '验证数据集',
      dataIndex: 'name',
      key: 'name',
      width: '25%',
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: '15%',
    },
    {
      title: '文件路径',
      dataIndex: 'dataset_path',
      key: 'dataset_path',
      width: '20%',
      hidden: true,
    },
    {
      title: '字符数',
      dataIndex: 'character_count',
      key: 'character_count',
      width: '10%',
    },
    {
      title: '样本数',
      dataIndex: 'sample_count',
      key: 'sample_count',
      width: '10%',
    },
    {
      title: (
        <Space>
          采样率
          <Tooltip title="数据集采样率乘数（0.01-10.0），决定实际训练数据量。例如：1.5表示将数据集放大1.5倍，0.8表示将数据集缩小到80%">
            <InfoCircleOutlined />
          </Tooltip>
        </Space>
      ),
      dataIndex: 'sampling_rate',
      key: 'sampling_rate',
      tooltip: '采样率范围为0-10，采样率越高，样本数越多',
      width: '10%',
      render: (rate: number, record: ValidationDatasetConfig, index: number) => (<InputNumber value={rate} min={0} max={10} precision={2} step={0.01} className="w-full" disabled={disabled} onChange={(value) => handleUpdateValidationDataset(index, 'sampling_rate', value || 0)} />),
    },
    {
      title: (
        <Space>
          验证数据集比例 (%)
          <Tooltip title="所有数据集的比例总和必须等于100%">
            <InfoCircleOutlined />
          </Tooltip>
        </Space>
      ),
      dataIndex: 'weight_in_total',
      key: 'weight_in_total',
      render: (_: any, record: trainDatasetConfig, index: number) => (<InputNumber value={record.weight_in_total} min={1} max={100} precision={0} className="w-full" disabled={disabled} onChange={(value) => handleUpdateValidationDataset(index, 'weight_in_total', value || 0)} addonAfter="%" />),
    },
    {
      title: '操作',
      key: 'action',
      width: '10%',
      render: (_: any, record: ValidationDatasetConfig, index: number) => (
        <Button type="link" danger icon={<DeleteOutlined />} disabled={disabled} onClick={() => handleRemoveValidationDataset(index)}>
          删除
        </Button>
      ),
    },
  ]
  const handleValidationTypeChange = (newType: 'split' | 'platform') => {
    handleConfigChange({ validation_config: { ...config.validation_config, type: newType } })
  }
  const handleValidationSplitChange = (ratio: number) => {
    const newValidationConfig: ValidationConfig = {
      ...config.validation_config,
      split_ratio: ratio,
    }
    handleConfigChange({ validation_config: newValidationConfig })
  }
  return (
    <Card
      title={(
        <div className="flex items-center">
          <DatabaseOutlined className="mr-[8px]" style={{ color: '#722ed1' }} />
          数据配置
        </div>
      )}
      className="mb-4 rounded-[8px]"
      size="small"
    >
      {/* 训练数据集配置 */}
      <div className="mb-6">
        <div className="flex items-center mb-3">
          <Title level={5} className="m-0 mr-2">
            训练数据集
          </Title>
          <Tag color="red">必填</Tag>
          <Tooltip title="选择多个数据集进行混合训练，可以提高模型的泛化能力">
            <InfoCircleOutlined className="ml-1 text-[var(--lab-color-text-muted)]" />
          </Tooltip>
        </div>

        <Table
          columns={trainingColumns as any}
          dataSource={config.training_datasets || []}
          pagination={false}
          rowKey={(record, index) => record.id || `${record.name}-${record.version}-${index}`}
          locale={{
            emptyText: '暂无选择的训练数据集，请点击下方「添加数据集」选择训练数据',
          }}
          size="small"
          scroll={{ x: 'max-content' }}
          className="mb-3"
        />

        <Row justify="space-between" align="middle">
          <Col>
            <Space direction="horizontal" className="w-full">
              <Form form={pickerForm} component={false}>
                <DatasetCascaderSelector
                  form={pickerForm}
                  fieldName={FINETUNE_TRAINING_PICK_FIELD}
                  label=""
                  projectIdOverride={projectId ?? (projectIdParam ? Number(projectIdParam) : undefined)}
                  statsQuery={{
                    usage: ['training'],
                    ...(trainingPickStatsScope.training_method_type
                      ? { training_method_type: [trainingPickStatsScope.training_method_type] }
                      : {}),
                    ...(trainingPickStatsScope.dataset_type
                      ? { dataset_type: [trainingPickStatsScope.dataset_type] }
                      : {}),
                    ...(trainingPickStatsScope.dataset_format
                      ? { dataset_format: [trainingPickStatsScope.dataset_format] }
                      : {}),
                  }}
                  fixedListUsage="training"
                  listDatasetType={trainingPickStatsScope.dataset_type}
                  requiredSelection={false}
                  placeholder="请选择训练数据集及版本，可多次添加"
                  modalTitle="选择训练数据集"
                  selectButtonText="添加数据集"
                  onChange={handleFinetuneTrainingDatasetPick}
                  disabled={disabled}
                />
              </Form>
            </Space>
          </Col>

          <Col>
            <Space>
              <Text>总记录数：</Text>
              <Text strong>
                {trainingStats.totalRecords.toLocaleString()}
                条
              </Text>
              <Text>总比例：</Text>
              <Text strong type={trainingStats.isValidRatio ? 'success' : 'danger'}>
                {trainingStats.totalRatio}
                %
              </Text>
              {!trainingStats.isValidRatio && (
                <Text type="danger" className="text-[12px]">
                  (必须等于100%)
                </Text>
              )}
            </Space>
          </Col>
        </Row>

        {config.training_datasets.length >= 5 && (
          <Text type="warning" className="text-[12px] block mt-2">
            为了确保训练效果，建议最多选择5个数据集
          </Text>
        )}
      </div>

      <Divider />

      {/* 验证集配置 */}
      <div className="mb-4">
        <div className="flex items-center mb-3">
          <Title level={5} className="m-0 mr-2">
            验证集配置
          </Title>
          <Tooltip title="选择验证集配置方式：从训练数据集拆分或使用独立的验证数据集">
            <InfoCircleOutlined className="ml-1 text-[var(--lab-color-text-muted)]" />
          </Tooltip>
        </div>

        <Radio.Group value={config.validation_config.type} onChange={(e) => handleValidationTypeChange(e.target.value)} disabled={disabled} className="mb-4">
          <Radio value="split">数据拆分</Radio>
          <Tooltip title="前置需跟随第一项训练数据集的数据用途和数据格式" color="blue">
            <Radio value="platform">验证数据集</Radio>
          </Tooltip>
        </Radio.Group>

        {/* 数据拆分模式 */}
        {config.validation_config.type === 'split' && (
          <div>
            <Row gutter={16} align="middle">
              <Col span={12}>
                <Text>拆分比例：</Text>
                <Slider
                  className="mt-[8px]"
                  value={config.validation_config.split_ratio || 15}
                  min={0}
                  max={20}
                  marks={{
                    0: '0%',
                    5: '5%',
                    10: '10%',
                    15: '15%',
                    20: '20%',
                  }}
                  disabled={disabled}
                  onChange={handleValidationSplitChange}
                />
              </Col>
              <Col span={12}>
                <Space direction="vertical" className="w-full">
                  <Text strong>
                    {config.validation_config.split_ratio || 15}
                    %
                  </Text>
                  <Text type="secondary" className="text-[12px]">
                    从训练数据集中按比例拆分验证集
                  </Text>
                </Space>
              </Col>
            </Row>
          </div>
        )}

        {/* 验证数据集模式 */}
        {config.validation_config.type === 'platform' && (
          <div>
            {/* 验证数据集统计信息 */}
            <Table
              columns={validationColumns as any}
              dataSource={config.validation_datasets || []}
              pagination={false}
              rowKey={(record, index) => record.id || `${record.name}-${record.version}-${index}`}
              locale={{
                emptyText: '暂无选择的验证数据集，请点击下方"添加数据集"按钮',
              }}
              size="small"
              scroll={{ x: 'max-content' }}
              className="mb-3"
            />
            <Row justify="space-between" align="middle" className="mb-3">
              <Col>
                <Form form={validationPickerForm} component={false}>
                  <DatasetCascaderSelector
                    form={validationPickerForm}
                    fieldName={FINETUNE_VALIDATION_PICK_FIELD}
                    label=""
                    projectIdOverride={projectId ?? (projectIdParam ? Number(projectIdParam) : undefined)}
                    statsQuery={{
                      usage: ['validation'],
                      ...(validationPickStatsScope.training_method_type
                        ? { training_method_type: [validationPickStatsScope.training_method_type] }
                        : {}),
                      ...(validationPickStatsScope.dataset_type
                        ? { dataset_type: [validationPickStatsScope.dataset_type] }
                        : {}),
                      ...(validationPickStatsScope.dataset_format
                        ? { dataset_format: [validationPickStatsScope.dataset_format] }
                        : {}),
                    }}
                    fixedListUsage="validation"
                    listDatasetType={validationPickStatsScope.dataset_type}
                    requiredSelection={false}
                    placeholder="请选择验证数据集及版本，可在弹窗内多选"
                    modalTitle="选择验证数据集"
                    selectButtonText="添加验证数据集"
                    trainingDatasetMultiSelect
                    trainingMultiSelectMax={Math.max(0, 3 - (config.validation_datasets?.length || 0))}
                    onChange={handleValidationDatasetMultiPick}
                    disabled={disabled || (config.validation_datasets?.length || 0) >= 3}
                  />
                </Form>
                {/* {config.validation_datasets.length > 0 && (
              <Button
                type="link"
                onClick={handleAutoDistributeValidationRatio}
                disabled={disabled}
              >
                自动分配比例
              </Button>
            )} */}
              </Col>
              {(config.validation_datasets || []).length > 0 && (
                <Col>
                  <Space>
                    <Text>总记录数：</Text>
                    <Text strong>
                      {validationStats.totalRecords.toLocaleString()}
                      条
                    </Text>
                    <Text>总比例：</Text>
                    <Text strong type={validationStats.isValidRatio ? 'success' : 'danger'}>
                      {validationStats.totalRatio}
                      %
                    </Text>
                    {!validationStats.isValidRatio && (
                      <Text type="danger" className="text-[12px]">
                        (必须等于100%)
                      </Text>
                    )}
                  </Space>
                </Col>
              )}
            </Row>

            {(config.validation_datasets?.length || 0) >= 3 && (
              <Text type="warning" className="text-[12px] block mt-2">
                为了确保验证效果，建议最多选择3个验证数据集
              </Text>
            )}
          </div>
        )}
      </div>

    </Card>
  )
}
export default EnhancedDataConfig
