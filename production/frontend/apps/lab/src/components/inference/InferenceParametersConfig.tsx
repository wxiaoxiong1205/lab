import React from 'react'
import { Button, Card, Form, InputNumber, Space, Tooltip } from 'antd'
import { QuestionCircleOutlined } from '@ant-design/icons'
import './RefereeInferenceParametersConfig.css'

interface InferenceParametersConfigProps {
  form: any
}

/**
 * 推理参数配置组件
 */
const InferenceParametersConfig: React.FC<InferenceParametersConfigProps> = ({ form }) => {
  return (
    <Card
      title="推理模型参数设置"
      size="small"
      className="inference-parameters-card mt-4 !mb-4"
    >
      <Form.Item
        name="max_tokens"
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
                  const current = form.getFieldValue('max_tokens')
                  if (current != null && current > 1) {
                    form.setFieldValue('max_tokens', current - 1)
                  }
                }}
              >
                -
              </Button>
              <Button
                size="small"
                onClick={() => {
                  const current = form.getFieldValue('max_tokens') || null
                  if (current < Infinity) {
                    form.setFieldValue('max_tokens', Math.min(Infinity, current + 1))
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
        name="temperature"
        className="fixed-label-form-item !mb-3 last:!mb-0"
        label={(
          <span className="inline-flex items-center gap-1">
            Temperature (温度)
            <Tooltip color="blue" title="控制随机性，范围0-2，默认0.7">
              <QuestionCircleOutlined className="text-sm text-gray-500 cursor-help" />
            </Tooltip>
          </span>
        )}
        initialValue={0.7}
        rules={[
          { required: false, message: '请输入温度值' },
          { type: 'number', min: 0.0, max: 2.0 },
        ]}
      >
        <InputNumber
          min={0.0}
          max={2.0}
          step={0.01}
          className="w-[300px]"
          addonAfter={(
            <Space>
              <Button
                size="small"
                onClick={() => {
                  const current = form.getFieldValue('temperature') ?? 0.7
                  if (current > 0) {
                    const newValue = parseFloat((current - 0.01).toFixed(2))
                    if (newValue >= 0) {
                      form.setFieldValue('temperature', newValue)
                    }
                  }
                }}
              >
                -
              </Button>
              <Button
                size="small"
                onClick={() => {
                  const current = form.getFieldValue('temperature') || 0.7
                  if (current < 2) {
                    const newValue = Math.min(2, parseFloat((current + 0.01).toFixed(2)))
                    form.setFieldValue('temperature', newValue)
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
        name="top_p"
        className="fixed-label-form-item !mb-3 last:!mb-0"
        label={(
          <span className="inline-flex items-center gap-1">
            Top_p (核采样)
            <Tooltip color="blue" title="核采样，范围0-1，默认1.0（采样时考虑所有tokens)">
              <QuestionCircleOutlined className="text-sm text-gray-500 cursor-help" />
            </Tooltip>
          </span>
        )}
        initialValue={1.0}
        rules={[
          { required: false, message: '请输入Top_p值' },
          { type: 'number', min: 0.0, max: 1.0 },
        ]}
      >
        <InputNumber
          min={0.0}
          max={1.0}
          step={0.01}
          className="w-[300px]"
          addonAfter={(
            <Space>
              <Button
                size="small"
                onClick={() => {
                  const current = form.getFieldValue('top_p') ?? 1.0
                  if (current > 0) {
                    const newValue = parseFloat((current - 0.01).toFixed(2))
                    if (newValue >= 0) {
                      form.setFieldValue('top_p', newValue)
                    }
                  }
                }}
              >
                -
              </Button>
              <Button
                size="small"
                onClick={() => {
                  const current = form.getFieldValue('top_p') || 1.0
                  if (current < 1) {
                    const newValue = Math.min(1, parseFloat((current + 0.01).toFixed(2)))
                    form.setFieldValue('top_p', newValue)
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
        name="presence_penalty"
        className="fixed-label-form-item !mb-3 last:!mb-0"
        label={(
          <span className="inline-flex items-center gap-1">
            presence_penalty (存在性惩罚)
            <Tooltip color="blue" title="存在性惩罚，范围-2.0到2.0，默认0.0（不惩罚）">
              <QuestionCircleOutlined className="text-sm text-gray-500 cursor-help" />
            </Tooltip>
          </span>
        )}
        initialValue={0.0}
        rules={[
          { required: false, message: '请输入重复惩罚值' },
          { type: 'number', min: -2.0, max: 2.0 },
        ]}
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
                  const current = form.getFieldValue('presence_penalty') ?? 0.0
                  if (current > -2.0) {
                    const newValue = parseFloat((current - 0.1).toFixed(1))
                    if (newValue >= -2.0) {
                      form.setFieldValue('presence_penalty', newValue)
                    }
                  }
                }}
              >
                -
              </Button>
              <Button
                size="small"
                onClick={() => {
                  const current = form.getFieldValue('presence_penalty') || 0.0
                  if (current < 2.0) {
                    const newValue = Math.min(2.0, parseFloat((current + 0.1).toFixed(1)))
                    form.setFieldValue('presence_penalty', newValue)
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

export default InferenceParametersConfig
