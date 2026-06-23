import React from 'react'
import { Col, Form, Input, InputNumber, Row, Select, Switch, Tabs } from 'antd'

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

interface ParamTabsProps {
  MonitoringConfigCategory: any
  EvalStrategyCategory: any
  LrSchedulerTypeCategory: any
  trainingType: any
  trainingMethod?: string
  SaveStrategyCategory: any
}

const ParamTabs: React.FC<ParamTabsProps> = ({
  MonitoringConfigCategory,
  EvalStrategyCategory,
  LrSchedulerTypeCategory,
  trainingType,
  trainingMethod,
  SaveStrategyCategory,
}) => {
  const effectiveTrainingMethod = normalizeTrainingMethodType(trainingMethod)
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
    <Tabs
      defaultActiveKey="basic"
      type="card"
      size="small"
      items={items}
    />
  )
}

export default ParamTabs
