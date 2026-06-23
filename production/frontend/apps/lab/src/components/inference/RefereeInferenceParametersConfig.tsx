import React from 'react'
import { Button, Card, Form, InputNumber, Space, Tooltip } from 'antd'
import { QuestionCircleOutlined } from '@ant-design/icons'
import './RefereeInferenceParametersConfig.css'

interface RefereeInferenceParametersConfigProps {
  form: any
}

/**
 * 裁判员推理参数配置组件
 */
const RefereeInferenceParametersConfig: React.FC<RefereeInferenceParametersConfigProps> = ({
  form,
}) => {
  return (
    <Card
      title="推理模型参数设置"
      size="small"
      className="referee-inference-parameters-card mt-4 !mb-4"
    >
      <Form.Item
        name="referee_max_tokens"
        className="fixed-label-form-item !mb-3 last:!mb-0"
        label={(
          <span className="inline-flex items-center gap-1">
            max_tokens(最大生成token数)
            <Tooltip
              color="blue"
              title="最大生成token数，None表示不限制，使用模型的最长上下文。"
            >
              <QuestionCircleOutlined className="text-sm text-gray-500 cursor-help" />
            </Tooltip>
          </span>
        )}
        rules={[
          { required: false, message: '请输入最大生成token数' },
          { type: 'number', min: 1 },
        ]}
      >
        <InputNumber
          min={1}
          step={1}
          placeholder="留空表示不限制"
          className="w-[300px]"
          addonAfter={(
            <Space>
              <Button
                size="small"
                onClick={() => {
                  const current = form.getFieldValue('referee_max_tokens')
                  if (current != null && current > 1) {
                    form.setFieldValue(
                      'referee_max_tokens',
                      current - 1,
                    )
                  }
                }}
              >
                -
              </Button>
              <Button
                size="small"
                onClick={() => {
                  const current = form.getFieldValue('referee_max_tokens') || null
                  if (current < Infinity) {
                    form.setFieldValue(
                      'referee_max_tokens',
                      Math.min(Infinity, current + 1),
                    )
                  }
                }}
              >
                +
              </Button>
            </Space>
          )}
        />
      </Form.Item>
      <Form.Item
        name="referee_temperature"
        className="fixed-label-form-item !mb-3 last:!mb-0"
        label={(
          <span className="inline-flex items-center gap-1">
            Temperature (温度)
            <Tooltip
              color="blue"
              title="控制随机性，范围0-2，默认0.7"
            >
              <QuestionCircleOutlined className="text-sm text-gray-500 cursor-help" />
            </Tooltip>
          </span>
        )}
        rules={[{ required: true, message: '请输入Temperature' }]}
        initialValue={0.7}
      >
        <InputNumber
          min={0}
          max={2}
          step={0.1}
          className="w-[300px]"
          addonAfter={(
            <Space>
              <Button
                size="small"
                onClick={() => {
                  const current = form.getFieldValue('referee_temperature') ?? 0.7
                  if (current > 0) {
                    const newValue = parseFloat((current - 0.1).toFixed(1))
                    if (newValue >= 0) {
                      form.setFieldValue('referee_temperature', newValue)
                    }
                  }
                }}
              >
                -
              </Button>
              <Button
                size="small"
                onClick={() => {
                  const current = form.getFieldValue('referee_temperature') || 0.7
                  if (current < 2) {
                    const newValue = Math.min(2, parseFloat((current + 0.1).toFixed(1)))
                    form.setFieldValue('referee_temperature', newValue)
                  }
                }}
              >
                +
              </Button>
            </Space>
          )}
        />
      </Form.Item>
      <Form.Item
        name="referee_top_p"
        className="fixed-label-form-item !mb-3 last:!mb-0"
        label={(
          <span className="inline-flex items-center gap-1">
            Top_p (核采样)
            <Tooltip
              color="blue"
              title="核采样，范围0-1，默认1.0（采样时考虑所有tokens）"
            >
              <QuestionCircleOutlined className="text-sm text-gray-500 cursor-help" />
            </Tooltip>
          </span>
        )}
        rules={[{ required: true, message: '请输入Top_p' }]}
        initialValue={1.0}
      >
        <InputNumber
          min={0}
          max={1}
          step={0.1}
          className="w-[300px]"
          addonAfter={(
            <Space>
              <Button
                size="small"
                onClick={() => {
                  const current = form.getFieldValue('referee_top_p') ?? 1.0
                  if (current > 0) {
                    const newValue = parseFloat((current - 0.1).toFixed(1))
                    if (newValue >= 0) {
                      form.setFieldValue('referee_top_p', newValue)
                    }
                  }
                }}
              >
                -
              </Button>
              <Button
                size="small"
                onClick={() => {
                  const current = form.getFieldValue('referee_top_p') || 1.0
                  if (current < 1) {
                    const newValue = Math.min(1, parseFloat((current + 0.1).toFixed(1)))
                    form.setFieldValue('referee_top_p', newValue)
                  }
                }}
              >
                +
              </Button>
            </Space>
          )}
        />
      </Form.Item>
      <Form.Item
        name="referee_presence_penalty"
        className="fixed-label-form-item !mb-3 last:!mb-0"
        label={(
          <span className="inline-flex items-center gap-1">
            presence_penalty (存在性惩罚)
            <Tooltip
              color="blue"
              title="存在性惩罚，范围-2.0到2.0，默认0.0（不惩罚）"
            >
              <QuestionCircleOutlined className="text-sm text-gray-500 cursor-help" />
            </Tooltip>
          </span>
        )}
        rules={[{ required: true, message: '请输入presence_penalty' }]}
        initialValue={0.0}
      >
        <InputNumber
          min={-2.0}
          max={2.0}
          step={0.1}
          className="w-[300px]"
          addonAfter={(
            <Space>
              <Button
                size="small"
                onClick={() => {
                  const current = form.getFieldValue('referee_presence_penalty') ?? 0.0
                  if (current > -2.0) {
                    const newValue = parseFloat((current - 0.1).toFixed(1))
                    if (newValue >= -2.0) {
                      form.setFieldValue('referee_presence_penalty', newValue)
                    }
                  }
                }}
              >
                -
              </Button>
              <Button
                size="small"
                onClick={() => {
                  const current = form.getFieldValue('referee_presence_penalty') || 0.0
                  if (current < 2.0) {
                    const newValue = Math.min(2.0, parseFloat((current + 0.1).toFixed(1)))
                    form.setFieldValue('referee_presence_penalty', newValue)
                  }
                }}
              >
                +
              </Button>
            </Space>
          )}
        />
      </Form.Item>
    </Card>
  )
}

export default RefereeInferenceParametersConfig
