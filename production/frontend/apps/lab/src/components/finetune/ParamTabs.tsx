import React, { useEffect, useState } from 'react'
import { Alert, Button, Col, Form, Input, InputNumber, Row, Select, Space, Switch, Tabs, message } from 'antd'
import { DownloadOutlined, ExclamationCircleOutlined, ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import {
  trainingParameterTemplateService,
  type TrainingParameterTemplate,
} from '@/services/trainingParameterTemplateService'
import ChunkFileUploader from '@/components/common/ChunkFileUploader'

const { Option } = Select

const normalizeTrainingMethodType = (value?: string) => {
  if (typeof value !== 'string')
    return undefined

  const normalized = value.toLowerCase()
  if (normalized.includes('dpo'))
    return 'dpo'
  if (normalized.includes('grpo'))
    return 'rft-grpo'
  if (normalized.includes('sft'))
    return 'sft'

  return normalized
}

const grpoTemplateParamFields = [
  'learning_rate',
  'num_train_epochs',
  'per_device_train_batch_size',
  'gradient_accumulation_steps',
  'warmup_ratio',
  'lr_scheduler_type',
  'bf16',
  'gradient_checkpointing',
  'max_grad_norm',
  'rope_scaling',
  'seed',
  'weight_decay',
  'cutoff_len',
  'preprocessing_num_workers',
  'eval_strategy',
  'eval_steps',
  'greater_is_better',
  'load_best_model_at_end',
  'metric_for_best_model',
  'per_device_eval_batch_size',
  'save_strategy',
  'save_steps',
  'save_total_limit',
  'logging_steps',
  'num_generations',
  'max_prompt_length',
  'max_completion_length',
  'temperature',
  'top_p',
  'top_k',
  'repetition_penalty',
  'kl_coefficient',
  'clip_range',
  'advantage_estimator',
  'reward_normalization',
  'reward_scale',
  'lora_rank',
  'lora_alpha',
  'lora_dropout',
]

const normalizeTemplateParams = (template: TrainingParameterTemplate) => {
  const params = template.params || {}
  const nextValues: Record<string, unknown> = {
    fine_tuning_type: template.fine_tune_type,
    grpo_template_id: template.id,
    grpo_template_name: template.name,
    grpo_template_content: template.template_content,
    grpo_template_params_json: JSON.stringify(params),
  }

  grpoTemplateParamFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(params, field)) {
      nextValues[field] = params[field]
    }
  })

  const loraTargetModules = params.lora_target_modules
  if (Array.isArray(loraTargetModules)) {
    nextValues.lora_target = loraTargetModules.join(',')
  }
  else if (typeof loraTargetModules === 'string') {
    nextValues.lora_target = loraTargetModules
  }

  return nextValues
}

const CUSTOM_REWARD_TEMPLATE = `import os

import torch


def reward_func(queries, prompts, labels):
    """
    Calculate rewards based on model outputs and labels.

    Args:
        queries (list[str]): prompts + model responses.
        prompts (list[str]): original model prompts.
        labels (list[str]): reference answers or labels.

    Returns:
        torch.Tensor: float reward tensor, one value per sample.
    """
    outputs = []
    max_prompt_len = int(os.environ.get("MAX_PROMPT_LEN", "1024"))

    for query, prompt in zip(queries, prompts):
        max_len = min(len(prompt), max_prompt_len)
        outputs.append(query[max_len:].strip())

    rewards = process(outputs, labels)
    return torch.tensor(rewards, dtype=torch.float)
`

const downloadRewardTemplate = () => {
  if (typeof window === 'undefined') {
    return
  }

  const blob = new Blob([CUSTOM_REWARD_TEMPLATE], { type: 'text/x-python;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'grpo-custom-reward-template.py'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

interface ParamTabsProps {
  MonitoringConfigCategory: any
  EvalStrategyCategory: any
  LrSchedulerTypeCategory: any
  trainingType: any
  trainingMethod?: string
  SaveStrategyCategory: any
  projectId?: string
}

const ParamTabs: React.FC<ParamTabsProps> = ({
  MonitoringConfigCategory,
  EvalStrategyCategory,
  LrSchedulerTypeCategory,
  trainingType,
  trainingMethod,
  SaveStrategyCategory,
  projectId,
}) => {
  const form = Form.useFormInstance()
  const effectiveTrainingMethod = normalizeTrainingMethodType(trainingMethod)
  const [grpoTemplates, setGrpoTemplates] = useState<TrainingParameterTemplate[]>([])
  const [grpoTemplatesLoading, setGrpoTemplatesLoading] = useState(false)

  const loadGrpoTemplates = async () => {
    if (effectiveTrainingMethod !== 'rft-grpo') {
      return
    }

    setGrpoTemplatesLoading(true)
    try {
      const data = await trainingParameterTemplateService.list({
        page: 1,
        size: 100,
        enabled: true,
        training_method: 'rft-grpo',
      })
      setGrpoTemplates(data.items || [])
    }
    catch (error) {
      console.error('Failed to load GRPO templates:', error)
      message.error('训练参数模板加载失败')
    }
    finally {
      setGrpoTemplatesLoading(false)
    }
  }

  useEffect(() => {
    if (effectiveTrainingMethod === 'rft-grpo') {
      loadGrpoTemplates()
      return
    }

    setGrpoTemplates([])
    form.setFieldsValue({
      grpo_template_id: undefined,
      grpo_template_name: undefined,
      grpo_template_content: undefined,
      grpo_template_params_json: undefined,
      grpo_reward_function_upload_id: undefined,
      grpo_reward_function_file_name: undefined,
      grpo_reward_function_file_url: undefined,
    })
  }, [effectiveTrainingMethod])

  const handleGrpoTemplateChange = (templateId?: number) => {
    if (!templateId) {
      form.setFieldsValue({
        grpo_template_id: undefined,
        grpo_template_name: undefined,
        grpo_template_content: undefined,
        grpo_template_params_json: undefined,
      })
      return
    }

    const template = grpoTemplates.find(item => item.id === templateId)
    if (!template) {
      return
    }

    form.setFieldsValue(normalizeTemplateParams(template))
    message.success('已应用训练参数模板')
  }

  const rewardFunctionSection = effectiveTrainingMethod === 'rft-grpo' && (
    <div className="param-config-container mb-4">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <SafetyCertificateOutlined style={{ color: 'var(--lab-color-primary)' }} />
        <span className="param-name">奖励规则配置</span>
      </div>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          icon={<ExclamationCircleOutlined />}
          message="自定义奖励函数要求"
          description={(
            <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 12, color: '#64748b', lineHeight: 1.8 }}>
              <li>
                函数名必须为
                {' '}
                <code>reward_func(queries, prompts, labels)</code>
              </li>
              <li>
                返回类型必须为
                {' '}
                <code>torch.Tensor</code>
                ，且每条样本对应一个奖励值
              </li>
              <li>当前只支持单个 Python .py 文件</li>
            </ul>
          )}
        />
        <Form.Item name="grpo_reward_function_upload_id" hidden>
          <Input />
        </Form.Item>
        <Form.Item name="grpo_reward_function_file_name" hidden>
          <Input />
        </Form.Item>
        <Form.Item name="grpo_reward_function_file_url" hidden>
          <Input />
        </Form.Item>
        <ChunkFileUploader
          accept=".py"
          maxCount={1}
          projectId={projectId}
          usage="training-reward-function"
          hintText="仅支持上传单个 .py 文件；上传完成后会随本次 RFT-GRPO 训练任务保存引用"
          beforeUpload={(file) => {
            if (!file.name.toLowerCase().endsWith('.py')) {
              message.error('请上传 .py 格式的奖励函数文件')
              return false
            }
            return true
          }}
          onSuccess={({ fileUrl, uploadId, file }) => {
            form.setFieldsValue({
              grpo_reward_function_upload_id: uploadId,
              grpo_reward_function_file_name: file?.name,
              grpo_reward_function_file_url: fileUrl,
            })
          }}
          onFileChange={(file) => {
            if (!file) {
              form.setFieldsValue({
                grpo_reward_function_upload_id: undefined,
                grpo_reward_function_file_name: undefined,
                grpo_reward_function_file_url: undefined,
              })
            }
          }}
        />
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 8,
            border: '1px solid var(--lab-color-border)',
            background: 'var(--lab-color-bg-container)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <Space direction="vertical" size={2}>
            <span style={{ fontWeight: 600 }}>参考模板</span>
            <span style={{ fontSize: 12, color: 'var(--lab-color-text-secondary)' }}>
              下载 Python 模板后补充奖励逻辑，再上传为本次任务的自定义奖励函数。
            </span>
          </Space>
          <Button icon={<DownloadOutlined />} onClick={downloadRewardTemplate}>
            下载模板
          </Button>
        </div>
      </Space>
    </div>
  )

  const items = [
    {
      key: 'basic',
      label: '基础参数',
      forceRender: true,
      children: (
        <div className="param-config-container">
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">学习率</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="learning_rate" className="m-0">
                      <InputNumber
                        min={0.000001}
                        max={0.1}
                        step={0.000001}
                        className="w-full"
                        placeholder="0.00001"
                      />
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    学习率（Learning Rate），控制模型学习新知识的速度。过高会导致训练不稳定，过低会使训练速度过慢。
                  </div>
                </div>
              </div>
            </Col>

            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">训练轮次</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="num_train_epochs" className="m-0" tooltip="训练轮次。">
                      <InputNumber
                        min={1}
                        max={100}
                        className="w-full"
                        placeholder="3"
                      />
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    训练轮次（num_epochs），控制训练过程中遍历过数据集合的次数。建议设置在1-15之间，小数据集可用更少轮次以避免过拟合。
                  </div>
                </div>
              </div>
            </Col>

            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">每个设备上的训练batch大小</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="per_device_train_batch_size" className="m-0" tooltip="每个设备上的训练batch大小。">
                      <InputNumber min={1} max={1024} className="w-full" />
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    控制每个设备上进行训练时的批次大小，影响训练速度和内存占用。
                  </div>
                </div>
              </div>
            </Col>

            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">梯度累积步数</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="gradient_accumulation_steps" className="m-0" tooltip="梯度累积步数。">
                      <InputNumber min={1} max={100} className="w-full" />
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    控制梯度累积的步数，影响训练速度和内存占用。
                  </div>
                </div>
              </div>
            </Col>

            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">预热比例</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="warmup_ratio" className="m-0">
                      <InputNumber
                        min={0}
                        max={1}
                        step={0.01}
                        className="w-full"
                        placeholder="0.1"
                      />
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    预热比例（Warmup Ratio），训练开始时学习率逐渐增加到设定值的过程占总训练步数的比例。
                  </div>
                </div>
              </div>
            </Col>

            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">学习率调度器类型</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="lr_scheduler_type" className="m-0">
                      <Select placeholder="选择学习率调度器类型">
                        {LrSchedulerTypeCategory?.options.map((item: any) => (
                          <Option key={item.value} value={item.value}>{item.name}</Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    学习率调度器类型，自动学习率调度器根据训练过程自动调整学习率。
                  </div>
                </div>
              </div>
            </Col>

            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">是否使用bf16精度</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="bf16" className="m-0" initialValue>
                      <Select className="w-full">
                        <Option value>是</Option>
                        <Option value={false}>否</Option>
                      </Select>
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    是否使用bf16精度，使用bf16精度可以提高训练速度，但会略微降低训练精度。
                  </div>
                </div>
              </div>
            </Col>

            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">聊天模板类型</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="template" style={{ margin: 0 }} initialValue="">
                      <Input />
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    若不传则按模型名称自动推断。
                  </div>
                </div>
              </div>
            </Col>
          </Row>
        </div>
      ),
    },
    {
      key: 'randomSeed',
      label: '高级配置',
      forceRender: true,
      children: (
        <div className="param-config-container">
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <div className="param-item">
                <Form.Item
                  name="gradient_checkpointing"
                  label="梯度检查点"
                  tooltip="启用梯度检查点可以减少内存使用，但会略微降低训练速度。"
                  initialValue={false}
                >
                  <Select className="w-full">
                    <Option value>是</Option>
                    <Option value={false}>否</Option>
                  </Select>
                </Form.Item>
                <div className="param-description">
                  通过梯度检查点技术减少训练过程中的内存占用，适用于显存受限的情况。
                </div>
              </div>
            </Col>
            <Col span={12}>
              <div className="param-item">
                <Form.Item
                  name="max_grad_norm"
                  label="最大梯度范数"
                  tooltip="设置梯度裁剪的最大范数，用于防止梯度爆炸。"
                >
                  <InputNumber min={0.1} max={10} step={0.1} />
                </Form.Item>
                <div className="param-description">
                  梯度裁剪有助于稳定训练过程，防止梯度爆炸问题。常用值为1.0。
                </div>
              </div>
            </Col>

            <Col span={12}>
              <div className="param-item">
                <Form.Item
                  name="rope_scaling"
                  label="RoPE缩放方法"
                  tooltip="选择旋转位置编码(RoPE)的缩放策略。"
                >
                  <Select placeholder="选择RoPE缩放方法">
                    {MonitoringConfigCategory?.options.map((item: any) => (
                      <Option key={item.value} value={item.value}>{item.name}</Option>
                    ))}
                  </Select>
                </Form.Item>
                <div className="param-description">
                  RoPE缩放方法用于扩展模型的上下文窗口大小，YaRN是一种高效的上下文扩展技术。
                </div>
              </div>
            </Col>

            <Col span={12}>
              <div className="param-item">
                <Form.Item
                  name="seed"
                  label="随机种子"
                  tooltip="设置随机种子以确保实验可复现性。"
                >
                  <InputNumber min={0} max={Number.MAX_SAFE_INTEGER} />
                </Form.Item>
                <div className="param-description">
                  设置固定的随机种子可以确保训练过程的可重复性，便于实验比较和调试。
                </div>
              </div>
            </Col>

            <Col span={12}>
              <div className="param-item">
                <Form.Item
                  name="weight_decay"
                  label="权重衰减"
                  tooltip="设置权重衰减系数，用于正则化模型参数。"
                >
                  <InputNumber min={0} max={0.1} step={0.0001} precision={6} />
                </Form.Item>
                <div className="param-description">
                  权重衰减是一种正则化技术，有助于防止模型过拟合。设置为0表示不使用权重衰减。
                </div>
              </div>
            </Col>
          </Row>
        </div>
      ),
    },
    {
      key: 'lrScheduler',
      label: '数据处理配置',
      forceRender: true,
      children: (
        <div className="param-config-container">
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">训练样本的最大token长度限制</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="cutoff_len" className="m-0">
                      <InputNumber
                        className="w-full"
                      />
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    训练样本的最大token长度限制（Cutoff Len），训练样本的最大token长度限制。
                  </div>
                </div>
              </div>
            </Col>

            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">预处理各种进程数</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="preprocessing_num_workers" className="m-0">
                      <InputNumber min={0} max={100} className="w-full" />
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    预处理各种进程数（Preprocessing Num Workers），控制预处理各种进程数。
                  </div>
                </div>
              </div>
            </Col>
          </Row>
        </div>
      ),
    },
    // LoRA配置标签页（条件渲染）
    ...(trainingType === 'lora' ? [{
      key: 'lora',
      label: 'LoRA配置',
      forceRender: true,
      children: (
        <div className="param-config-container">
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">LoRA秩</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="lora_rank" className="m-0">
                      <InputNumber min={1} max={256} className="w-full" />
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    LoRA秩（LoRA Rank），LoRA的秩决定了可训练参数的数量。秩越低，参数越少，训练速度越快，但可能影响模型的表达能力。建议选择8或16。
                  </div>
                </div>
              </div>
            </Col>

            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">LoRA 目标模块</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="lora_target" className="m-0">
                      <Input placeholder="all" className="w-full" />
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    可以是 'all' 或具体的模块名称，LoRA的目标模块决定了可训练参数的数量。目标模块越少，参数越少，训练速度越快，但可能影响模型的表达能力。
                  </div>
                </div>
              </div>
            </Col>

            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">LoRA alpha 参数</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="lora_alpha" className="m-0">
                      <InputNumber className="w-full" />
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    LoRA alpha 参数，通常设置为 lora_rank 的2倍，影响模型的表达能力。
                  </div>
                </div>
              </div>
            </Col>

            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">LoRA dropout 率</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="lora_dropout" className="m-0">
                      <InputNumber min={0} max={1} step={0.01} className="w-full" />
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    LoRA dropout 率，LoRA的dropout率决定了可训练参数的数量。dropout率越低，参数越少，训练速度越快，但可能影响模型的表达能力。
                  </div>
                </div>
              </div>
            </Col>
          </Row>
        </div>
      ),
    }] : []),
    {
      key: 'checkpoint',
      label: '评估配置',
      forceRender: true,
      children: (
        <div className="param-config-container">
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">评估间隔步数</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="eval_steps" className="m-0" tooltip="每训练多少步进行一次评估">
                      <InputNumber min={1} max={10000} className="w-full" />
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    当评估策略选择"按步数评估"时，每训练指定步数后进行一次模型评估,评估间隔步数与评估策略保持一致。
                  </div>
                </div>
              </div>
            </Col>
            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">评估策略</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="eval_strategy" className="m-0" tooltip="选择何时进行模型评估">
                      <Select placeholder="steps" className="w-full">
                        {EvalStrategyCategory?.options.map((item: any) => (
                          <Option key={item.value} value={item.value}>{item.name}</Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    控制模型评估的频率和时机，按步数评估会在训练到指定步数时进行评估,评估策略与评估间隔步数保持一致。
                  </div>
                </div>
              </div>
            </Col>

            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">指标越大越好</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="greater_is_better" className="m-0" tooltip="设置评估指标是否越大越好" initialValue={false}>
                      <Select className="w-full">
                        <Option value>是</Option>
                        <Option value={false}>否</Option>
                      </Select>
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    控制评估指标的优化方向，例如准确率越大越好，而损失值越小越好。
                  </div>
                </div>
              </div>
            </Col>

            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">训练结束加载最佳模型</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="load_best_model_at_end" className="m-0" tooltip="训练结束后是否加载表现最佳的模型" initialValue>
                      <Select className="w-full">
                        <Option value>是</Option>
                        <Option value={false}>否</Option>
                      </Select>
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    开启后，训练结束时会自动加载评估表现最佳的模型权重。
                  </div>
                </div>
              </div>
            </Col>

            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">最佳模型指标</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="metric_for_best_model" className="m-0" tooltip="用于判断最佳模型的评估指标">
                      <Select placeholder="损失值 (loss)" className="w-full">
                        <Option value="loss">损失值 (loss)</Option>
                        <Option value="accuracy">准确率 (accuracy)</Option>
                        <Option value="f1">F1分数 (f1)</Option>
                        <Option value="precision">精确率 (precision)</Option>
                        <Option value="recall">召回率 (recall)</Option>
                      </Select>
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    选择用于判断训练过程中最佳模型的评估指标，通常使用损失值。
                  </div>
                </div>
              </div>
            </Col>

            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">每个设备上的评估batch大小</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="per_device_eval_batch_size" className="m-0" tooltip="每个设备上的评估批次大小">
                      <InputNumber min={1} max={128} className="w-full" />
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    控制每个设备上进行评估时的批次大小，影响评估速度和内存占用。
                  </div>
                </div>
              </div>
            </Col>
          </Row>
        </div>
      ),
    },
    // DPO配置标签页（条件渲染）
    ...(effectiveTrainingMethod === 'dpo' ? [{
      key: 'dpo',
      label: 'DPO配置',
      forceRender: true,
      children: (
        <div className="param-config-container">
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">Beta值</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="beta" className="m-0" tooltip="DPO算法中的beta参数，控制偏好数据对模型更新的影响程度。">
                      <InputNumber
                        min={0}
                        step={0.1}
                        className="w-full"
                        placeholder="0.5"
                      />
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    DPO算法中的beta参数，控制偏好数据对模型更新的影响程度。
                  </div>
                </div>
              </div>
            </Col>
          </Row>
        </div>
      ),
    }] : []),
    ...(effectiveTrainingMethod === 'rft-grpo' ? [{
      key: 'grpo',
      label: 'GRPO配置',
      forceRender: true,
      children: (
        <div className="param-config-container">
          <div className="mb-4">
            <Row gutter={[16, 12]} align="bottom">
              <Col xs={24} md={16}>
                <Form.Item
                  name="grpo_template_id"
                  label="训练参数模板"
                  rules={[{ required: true, message: '请选择训练参数模板' }]}
                >
                  <Select
                    allowClear
                    loading={grpoTemplatesLoading}
                    placeholder="选择已启用的 RFT-GRPO 训练参数模板"
                    optionFilterProp="label"
                    options={grpoTemplates.map(template => ({
                      value: template.id,
                      label: template.name,
                    }))}
                    onChange={handleGrpoTemplateChange}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Space>
                  <Button
                    icon={<ReloadOutlined />}
                    loading={grpoTemplatesLoading}
                    onClick={loadGrpoTemplates}
                  >
                    刷新模板
                  </Button>
                </Space>
              </Col>
            </Row>
            {!grpoTemplatesLoading && grpoTemplates.length === 0 && (
              <Alert
                type="warning"
                showIcon
                message="暂无可用训练参数模板"
                description="请先在系统配置的训练参数模板中新增并启用 RFT-GRPO 模板。"
              />
            )}
          </div>
          <Row gutter={[16, 16]}>
            {[
              ['num_generations', '每题生成数量', '每个Prompt生成多个候选答案后参与奖励评分，数量越大训练开销越高。', { min: 1, max: 64, placeholder: '8' }],
              ['max_completion_length', 'Completion最大长度', '限制模型生成答案的最大长度，避免单次采样占用过多上下文和显存。', { min: 1, max: 32768, placeholder: '1024' }],
              ['temperature', '采样温度', '温度越高生成越发散，温度越低生成越稳定。', { min: 0, max: 2, step: 0.01, placeholder: '0.9' }],
              ['top_p', 'Top-p', '仅在累计概率范围内采样候选Token，通常与温度一起控制探索范围。', { min: 0, max: 1, step: 0.01, placeholder: '0.95' }],
              ['top_k', 'Top-k', '仅从概率最高的Top-k个Token中采样，0表示不限制。', { min: 0, max: 1000, placeholder: '50' }],
              ['repetition_penalty', '重复惩罚', '用于减少重复生成，值越大惩罚越强。', { min: 0.1, max: 5, step: 0.01, placeholder: '1.05' }],
              ['kl_coefficient', 'KL系数', 'KL系数越高，训练越倾向保持原模型分布。', { min: 0, max: 10, step: 0.01, placeholder: '0.04' }],
              ['clip_range', '裁剪范围', '限制单次策略更新幅度，降低强化训练震荡风险。', { min: 0, max: 1, step: 0.01, placeholder: '0.2' }],
              ['reward_scale', '奖励缩放系数', '用于统一调整奖励信号强度。', { min: 0, max: 100, step: 0.1, placeholder: '1' }],
            ].map(([name, label, description, inputProps]) => (
              <Col span={12} key={name as string}>
                <div className="param-item">
                  <div className="param-header">
                    <span className="param-name">{label as string}</span>
                  </div>
                  <div className="param-content">
                    <div className="param-control">
                      <Form.Item name={name as string} className="m-0">
                        <InputNumber {...(inputProps as Record<string, number | string>)} className="w-full" />
                      </Form.Item>
                    </div>
                    <div className="param-description">{description as string}</div>
                  </div>
                </div>
              </Col>
            ))}
            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">奖励归一化</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="reward_normalization" className="m-0" valuePropName="checked">
                      <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                    </Form.Item>
                  </div>
                  <div className="param-description">对奖励分数做归一化处理，减少不同样本间奖励尺度差异。</div>
                </div>
              </div>
            </Col>
          </Row>
          <Form.Item name="advantage_estimator" hidden initialValue="grpo">
            <Input />
          </Form.Item>
          <Form.Item name="grpo_template_name" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="grpo_template_content" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="grpo_template_params_json" hidden>
            <Input />
          </Form.Item>
        </div>
      ),
    }] : []),
    {
      key: 'save',
      label: '保存配置',
      forceRender: true,
      children: (
        <div className="param-config-container">
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">模型保存步数</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="save_steps" className="m-0" tooltip="模型保存步数" initialValue={20}>
                      <InputNumber min={1} max={10000} />
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    当保存策略选择"按步数保存"时，每训练指定步数后进行一次模型保存,保存步数与保存策略保持一致。
                  </div>
                </div>
              </div>
            </Col>
            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">模型保存策略</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="save_strategy" className="m-0" tooltip="模型保存策略">
                      <Select placeholder="模型保存策略" className="w-full">
                        {SaveStrategyCategory?.options.map((item: any) => (
                          <Option key={item.value} value={item.value}>{item.name}</Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    控制模型保存的频率和时机，按步数保存会在训练到指定步数时进行模型保存,保存策略与保存步数保持一致。
                  </div>
                </div>
              </div>
            </Col>

            <Col span={12}>
              <div className="param-item">
                <div className="param-header">
                  <span className="param-name">模型保存总数限制</span>
                </div>
                <div className="param-content">
                  <div className="param-control">
                    <Form.Item name="save_total_limit" className="m-0" tooltip="模型保存总数限制" initialValue={3}>
                      <InputNumber min={1} max={10000} />
                    </Form.Item>
                  </div>
                  <div className="param-description">
                    模型保存总数限制。
                  </div>
                </div>
              </div>
            </Col>
          </Row>
        </div>
      ),
    },
    {
      key: 'earlyStopping',
      label: '监控配置',
      forceRender: true,
      children: (
        <div className="param-config-container">
          <Row gutter={[16, 16]}>
            <div className="param-item">
              <div className="param-header">
                <span className="param-name">日志</span>
              </div>
              <div className="param-content">
                <div className="param-control">
                  <Form.Item name="logging_steps" className="m-0" tooltip="日志记录频率。">
                    <InputNumber min={1} max={10000} />
                  </Form.Item>
                </div>
                <div className="param-description">
                  日志记录频率。
                </div>
              </div>
            </div>
          </Row>
        </div>
      ),
    },
  ]

  return (
    <>
      {rewardFunctionSection}
      <Tabs
        defaultActiveKey="basic"
        type="card"
        size="small"
        items={items}
      />
    </>
  )
}

export default ParamTabs
