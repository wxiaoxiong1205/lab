import React, { useEffect, useState } from 'react'
import { Card, Col, Form, Radio, Row, Select, Space, Switch, Tooltip, Typography } from 'antd'
import { QuestionCircleOutlined, SettingOutlined } from '@ant-design/icons'
import ParamTabs from './ParamTabs'
import FINETUNE_VISIBLE_TRAINING_TYPES, { ModelTypeMapping, TrainingMethodTypeMapping } from '@/utils/EnumMaping'
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
  const fineTuningTypeValue = Form.useWatch('fine_tuning_type', form)
  const trainingMethod = Form.useWatch('training_type', form)
  const effectiveTrainingMethod = trainingMethod || trainingMethodType || form.getFieldValue('training_type')
  const trainTypeCategory = Form.useWatch('train_type_category', form)
  const deepspeedEnabled = Form.useWatch('deepspeed_enabled', form)
  const isImageUnderstanding = trainTypeCategory === 'image-understanding'
  const trainingMethodOptions = TrainingMethodCategory?.options
    .filter((type: any) => !TrainingMethodTypeMapping(type.value).disabled)
    .filter((type: any) => !(isImageUnderstanding && type.value === 'dpo')) ?? []
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
  }, [effectiveTrainingMethod, form, isImageUnderstanding, onTrainingMethodChange])
  const handleTrainingTypeChange = (e: any) => {
    setTrainingType(e.target.value)
  }

  const handleTrainingMethodChange = () => {
    onTrainingMethodChange?.()
  }

  const handleTrainTypeCategoryChange = () => {
    form.setFieldsValue({
      data_config: createEmptyDataConfig(),
      data_format: undefined,
      ...(form.getFieldValue('training_type') === 'dpo' ? { training_type: 'sft' } : {}),
    })
  }

  const handleDeepspeedEnabledChange = (checked: boolean) => {
    if (checked && !form.getFieldValue('deepspeed')) {
      form.setFieldsValue({ deepspeed: 'ZeRO-0' })
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
              <Radio.Group onChange={handleTrainTypeCategoryChange}>
                {TrainingTypeCategory?.options
                  .filter((item: any) => item.value !== 'business' && FINETUNE_VISIBLE_TRAINING_TYPES.includes(item.value))
                  .map((item: any) => (
                    <Radio.Button key={item.value} value={item.value} disabled={ModelTypeMapping(item.value).disabled} className="relative">
                      {ModelTypeMapping(item.value).text}
                      {ModelTypeMapping(item.value).disabled && (
                        <Tooltip title={ModelTypeMapping(item.value).disabledTooltip}>
                        </Tooltip>
                      )}
                    </Radio.Button>
                  ))}
              </Radio.Group>
            </Form.Item>
          </Col>
        </Row>
      )}

      <div className="max-w-[760px]">
        {!taskName && (
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
        )}

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

      <Row gutter={16}>
        <Col span={24}>
          <Form.Item name="fine_tuning_type" label="微调类型" rules={[{ required: true, message: '请选择训练类型' }]}>
            <Radio.Group onChange={handleTrainingTypeChange}>
              <Radio.Button className="m-[0_12px]" value="full">
                全参微调
              </Radio.Button>
              <Radio.Button className="m-[0_12px]" value="lora">
                Lora微调
              </Radio.Button>
            </Radio.Group>
          </Form.Item>
        </Col>
      </Row>

      <ParamTabs
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
