import React, { useEffect, useState } from 'react'
import { Button, Card, Col, Form, Input, Radio, Row, Select, Space, Switch, Tooltip, Typography, message } from 'antd'
import { DownloadOutlined, QuestionCircleOutlined, SettingOutlined } from '@ant-design/icons'
import type { RcFile } from 'antd/es/upload'
import { useParams } from 'react-router-dom'
import ParamTabs from './ParamTabs'
import ChunkFileUploader from '@/components/common/ChunkFileUploader'
import { SegmentedRadioButton, SegmentedRadioGroup } from '@/components/common/SegmentedRadio'
import FINETUNE_VISIBLE_TRAINING_TYPES, { ModelTypeMapping, TrainingMethodTypeMapping } from '@/utils/EnumMaping'
import { downloadDataset } from '@/utils/download'
import { finetuneTaskService } from '@/services/FinetuneTrainingServices'
import './TrainingConfig.css'

const { Option } = Select
const { Text } = Typography
interface TrainingConfigProps {
  form: any
  TrainingTypeCategory: any
  TrainingMethodCategory: any
  MonitoringConfigCategory: any
  EvalStrategyCategory: any
  LrSchedulerTypeCategory: any
  SaveStrategyCategory: any
  taskName: string
  type: string
  trainingMethodType?: string
  onTrainingMethodChange?: () => void
}

const createEmptyDataConfig = () => ({
  training_datasets: [] as unknown[],
  validation_config: {
    type: 'split' as const,
    split_ratio: 15,
  },
  validation_datasets: [] as unknown[],
})

const DEEPSPEED_OPTIONS = [
  { value: 'ZeRO-0', title: 'ZeRO-0', desc: '普通 DDP', tooltip: '普通数据并行训练' },
  { value: 'ZeRO-2', title: 'ZeRO-2', desc: '均衡策略', tooltip: '在显存占用与训练效率之间取得均衡' },
  { value: 'ZeRO-3', title: 'ZeRO-3', desc: '最大节省', tooltip: '最大化节省显存' },
]
const FALLBACK_TRAINING_TYPE_OPTIONS = [
  { value: 'text-generation', name: '文本生成', description: '文本生成训练' },
  { value: 'image-generation', name: '图像生成', description: '图像生成训练' },
  { value: 'image-understanding', name: '图像理解', description: '图像理解训练' },
]
const FALLBACK_TRAINING_METHOD_OPTIONS = [
  { value: 'sft', name: 'SFT', description: '有监督微调' },
  { value: 'dpo', name: 'DPO', description: '偏好优化训练' },
  { value: 'grpo', name: 'RFT-GRPO', description: '基于奖励规则的强化学习训练' },
]

const normalizeTrainingMethodType = (value?: string) => {
  if (typeof value !== 'string')
    return undefined

  const normalized = value.toLowerCase()
  if (normalized.includes('grpo') || normalized.includes('rft'))
    return 'grpo'

  return normalized
}

const TrainingConfig: React.FC<TrainingConfigProps> = ({
  form,
  TrainingTypeCategory,
  TrainingMethodCategory,
  MonitoringConfigCategory,
  EvalStrategyCategory,
  LrSchedulerTypeCategory,
  SaveStrategyCategory,
  type,
  taskName,
  trainingMethodType,
  onTrainingMethodChange,
}) => {
  const { projectId } = useParams()
  const fineTuningTypeValue = Form.useWatch('fine_tuning_type', form)
  const trainingMethod = Form.useWatch('training_type', form)
  const watchedRewardRuleUploadId = Form.useWatch('reward_rule_upload_id', form)
  const rewardRuleUploadId = watchedRewardRuleUploadId || form.getFieldValue('reward_rule_upload_id')
  const effectiveTrainingMethod = trainingMethod || trainingMethodType || form.getFieldValue('training_type')
  const isGrpoTraining = normalizeTrainingMethodType(effectiveTrainingMethod) === 'grpo'
  const trainTypeCategory = Form.useWatch('train_type_category', form)
  const deepspeedEnabled = Form.useWatch('deepspeed_enabled', form)
  const isImageUnderstanding = trainTypeCategory === 'image-understanding'
  const isImageGeneration = trainTypeCategory === 'image-generation'
  const [rewardSampleDownloading, setRewardSampleDownloading] = useState(false)
  const visibleTrainingTypeOptions = (TrainingTypeCategory?.options ?? [])
    .filter((item: any) => item.value !== 'business' && FINETUNE_VISIBLE_TRAINING_TYPES.includes(item.value))
  const trainingTypeOptions = visibleTrainingTypeOptions.length > 0 ? visibleTrainingTypeOptions : FALLBACK_TRAINING_TYPE_OPTIONS
  const visibleTrainingMethodOptions = (TrainingMethodCategory?.options ?? [])
    .filter((type: any) => !TrainingMethodTypeMapping(type.value).disabled)
    .filter((type: any) => !(isImageUnderstanding && type.value === 'dpo'))
    .filter((type: any) => !(isImageGeneration && normalizeTrainingMethodType(type.value) !== 'sft'))
  const trainingMethodOptions = visibleTrainingMethodOptions.length > 0
    ? visibleTrainingMethodOptions
    : FALLBACK_TRAINING_METHOD_OPTIONS
        .filter((type) => !(isImageUnderstanding && type.value === 'dpo'))
        .filter((type) => !(isImageGeneration && normalizeTrainingMethodType(type.value) !== 'sft'))
  const [trainingType, setTrainingType] = useState<string>(fineTuningTypeValue || type || '')
  useEffect(() => {
    if (fineTuningTypeValue) {
      setTrainingType(fineTuningTypeValue)
    }
    else if (type) {
      setTrainingType(type)
    }
  }, [fineTuningTypeValue, type])
  useEffect(() => {
    if (isImageUnderstanding && effectiveTrainingMethod === 'dpo') {
      form.setFieldValue('training_type', 'sft')
      onTrainingMethodChange?.()
    }
    if (isImageGeneration && normalizeTrainingMethodType(effectiveTrainingMethod) !== 'sft') {
      form.setFieldValue('training_type', 'sft')
      onTrainingMethodChange?.()
    }
  }, [effectiveTrainingMethod, form, isImageGeneration, isImageUnderstanding, onTrainingMethodChange])
  const handleTrainingTypeChange = (e: any) => {
    setTrainingType(e.target.value)
  }

  const handleTrainingMethodChange = () => {
    const method = form.getFieldValue('training_type')
    if (normalizeTrainingMethodType(method) === 'grpo') {
      form.setFieldValue('fine_tuning_type', undefined)
      setTrainingType('')
    }
    onTrainingMethodChange?.()
  }

  const handleTrainTypeCategoryChange = (event?: any) => {
    const nextTrainTypeCategory = event?.target?.value
    form.setFieldsValue({
      data_config: createEmptyDataConfig(),
      data_format: undefined,
      ...((nextTrainTypeCategory === 'image-generation' || form.getFieldValue('training_type') === 'dpo') ? { training_type: 'sft' } : {}),
      ...(nextTrainTypeCategory === 'image-generation'
        ? {
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

  const handleDeepspeedEnabledChange = (checked: boolean) => {
    if (checked && !form.getFieldValue('deepspeed')) {
      form.setFieldsValue({ deepspeed: 'ZeRO-0' })
    }
  }

  const handleDownloadRewardTemplate = async () => {
    setRewardSampleDownloading(true)
    try {
      await downloadDataset(
        finetuneTaskService.downloadGrpoRewardFunctionSample,
        'reward_func.py',
      )
    }
    catch (error) {
      console.error('Failed to download GRPO reward function sample:', error)
      message.error('下载模板失败')
    }
    finally {
      setRewardSampleDownloading(false)
    }
  }

  return (
    <Card
      title={(
        <div className="flex items-center">
          <SettingOutlined className="mr-[8px] text-[var(--lab-color-warning)]" />
          训练配置
        </div>
      )}
      className="mb-4 rounded-[8px]"
      size="small"
    >
      {!taskName && (
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item name="train_type_category" label="选择训练类型" rules={[{ required: true, message: '请选择训练类型' }]}>
              <SegmentedRadioGroup onChange={handleTrainTypeCategoryChange}>
                {trainingTypeOptions.map((item: any) => (
                  <SegmentedRadioButton key={item.value} value={item.value} disabled={ModelTypeMapping(item.value).disabled} className="relative">
                    {ModelTypeMapping(item.value).text}
                    {ModelTypeMapping(item.value).disabled && (
                      <Tooltip title={ModelTypeMapping(item.value).disabledTooltip}>
                      </Tooltip>
                    )}
                  </SegmentedRadioButton>
                ))}
              </SegmentedRadioGroup>
            </Form.Item>
          </Col>
        </Row>
      )}

      <div className="max-w-[760px]">
        <Form.Item name="training_type" label="训练方法" rules={[{ required: true, message: '请选择训练方法' }]}>
          <Select
            className="w-full"
            placeholder="选择训练方法"
            onChange={handleTrainingMethodChange}
            labelRender={({ value }) => {
              return TrainingMethodCategory?.options.find((item: any) => item.value === value)?.name
            }}
          >
            {trainingMethodOptions
              .map((type: any) => (
                <Option key={type.value} value={type.value}>
                  <div>
                    <div>{TrainingMethodTypeMapping(type.value).text}</div>
                    <Text type="secondary" className="text-[12px]">
                      {type.description}
                    </Text>
                  </div>
                </Option>
              ))}
          </Select>
        </Form.Item>
      </div>

      {isGrpoTraining && (
        <div className="mb-6">
          <Form.Item label="RFT 算法" required>
            <SegmentedRadioGroup value="grpo">
              <SegmentedRadioButton value="grpo" className="training-config-algorithm-option">
                <span className="training-config-algorithm-tag">GRPO</span>
                组相对策略优化
              </SegmentedRadioButton>
            </SegmentedRadioGroup>
          </Form.Item>

          <Form.Item
            label={(
              <Space size={4}>
                <span>奖励规则配置</span>
                <Tooltip title="详见下载模版，按照模版内的compute_score方法签名约束来实现奖励函数">
                  <QuestionCircleOutlined className="text-[var(--lab-color-text-muted)]" />
                </Tooltip>
              </Space>
            )}
            required
          >
            <div className="training-reward-rule">
              <Form.Item
                name="reward_rule_upload_id"
                rules={[{ required: true, message: '请先上传奖励规则 .py 文件' }]}
                hidden
              >
                <Input type="hidden" />
              </Form.Item>

              <div className="w-[560px]">
                <Form.Item className="mb-0" label="">
                  <div className="w-[562px]">
                    <ChunkFileUploader
                      accept=".py"
                      maxSize={100}
                      maxCount={1}
                      projectId={projectId}
                      valueUploadIds={rewardRuleUploadId}
                      beforeUpload={(file: RcFile) => {
                        const okPy = /\.py$/i.test(file.name)
                        if (!okPy) {
                          message.error('仅支持上传 .py 文件')
                          return false
                        }
                        return true
                      }}
                      hintText={(
                        <p className="ant-upload-hint">
                          支持 .py 格式，文件大小不能超过100M
                        </p>
                      )}
                      onFileChange={(file) => {
                        form.setFieldValue('reward_rule_file', file ? [{ name: file.name, originFileObj: file }] : undefined)
                        if (!file && !form.getFieldValue('reward_rule_upload_id')) {
                          form.setFieldValue('reward_rule_upload_id', undefined)
                        }
                      }}
                      onUploadIdsChange={(ids) => {
                        const firstId = ids?.split(',')[0]?.trim()
                        form.setFieldValue('reward_rule_upload_id', firstId || undefined)
                        if (firstId) {
                          form.setFields([{ name: 'reward_rule_upload_id', errors: [] }])
                        }
                      }}
                      onSuccess={({ uploadId, file }) => {
                        const id = uploadId?.trim()
                        if (id) {
                          form.setFieldValue('reward_rule_upload_id', id)
                          form.setFields([{ name: 'reward_rule_upload_id', errors: [] }])
                        }
                        if (file) {
                          form.setFieldValue('reward_rule_file', [{ name: file.name, originFileObj: file }])
                        }
                      }}
                      onError={() => {
                        if (!form.getFieldValue('reward_rule_upload_id')) {
                          form.setFieldValue('reward_rule_upload_id', undefined)
                        }
                      }}
                    />
                  </div>
                </Form.Item>

                <div className="mt-2.5 flex h-[50px] w-[560px] items-center rounded-[6px] bg-[#f4f6f8] px-4">
                  <span className="mr-[26px] text-[14px] leading-5 text-[#70767f]">下载示例文件</span>
                  <Button type="link" icon={<DownloadOutlined />} loading={rewardSampleDownloading} onClick={handleDownloadRewardTemplate}>
                    Python模板
                  </Button>
                </div>
              </div>
              <Form.Item noStyle shouldUpdate>
                {() => (
                  <Form.ErrorList errors={form.getFieldError('reward_rule_upload_id')} />
                )}
              </Form.Item>
            </div>
          </Form.Item>
        </div>
      )}

      {!isGrpoTraining && (
        <div className="max-w-[760px]">
          <Form.Item
            className="mb-5"
            label={(
              <Space size={4}>
                <span>训练加速配置</span>
                <Tooltip title="开启后可选择 ZeRO 训练加速策略">
                  <QuestionCircleOutlined className="text-[var(--lab-color-text-muted)]" />
                </Tooltip>
              </Space>
            )}
          >
            <Form.Item name="deepspeed_enabled" initialValue valuePropName="checked" noStyle>
              <Switch onChange={handleDeepspeedEnabledChange} />
            </Form.Item>
          </Form.Item>

          {deepspeedEnabled && (
            <Form.Item name="deepspeed" initialValue="ZeRO-0" className="mt-[-12px] mb-6">
              <Radio.Group className="w-full">
                <Space size={12} wrap className="w-full">
                  {DEEPSPEED_OPTIONS.map((option) => (
                    <Radio
                      key={option.value}
                      value={option.value}
                      className="training-config-deepspeed-option"
                    >
                      <Space size={4}>
                        <strong>{option.title}</strong>
                        <Text type="secondary">{option.desc}</Text>
                        <Tooltip title={option.tooltip}>
                          <QuestionCircleOutlined className="text-[var(--lab-color-text-muted)]" />
                        </Tooltip>
                      </Space>
                    </Radio>
                  ))}
                </Space>
              </Radio.Group>
            </Form.Item>
          )}
        </div>
      )}

      {!isGrpoTraining && (
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item name="fine_tuning_type" label="微调类型" rules={[{ required: true, message: '请选择训练类型' }]}>
              <SegmentedRadioGroup onChange={handleTrainingTypeChange}>
                <SegmentedRadioButton value="full">
                  全参微调
                </SegmentedRadioButton>
                <SegmentedRadioButton value="lora">
                  Lora微调
                </SegmentedRadioButton>
              </SegmentedRadioGroup>
            </Form.Item>
          </Col>
        </Row>
      )}

      <ParamTabs
        form={form}
        MonitoringConfigCategory={MonitoringConfigCategory}
        EvalStrategyCategory={EvalStrategyCategory}
        LrSchedulerTypeCategory={LrSchedulerTypeCategory}
        trainingType={trainingType}
        trainingMethod={effectiveTrainingMethod}
        SaveStrategyCategory={SaveStrategyCategory}
      />
    </Card>
  )
}
export default TrainingConfig
