import React, { useEffect } from 'react'
import { Alert, Card, Col, Form, Input, InputNumber, Row, Select, Space, Tabs, Typography } from 'antd'
import { PartitionOutlined } from '@ant-design/icons'

const { Text } = Typography

type GrpoResourceStage = 'hand' | 'work' | 'submit'

const stageLabels: Record<GrpoResourceStage, string> = {
  hand: 'Hand',
  work: 'Work',
  submit: 'Submit',
}

const stageDescriptions: Record<GrpoResourceStage, string> = {
  hand: '用于奖励函数执行前后的样本处理和辅助计算。',
  work: '用于主训练进程，默认沿用下方生产训练资源配置。',
  submit: '用于提交与结果整理阶段，只配置 CPU 和内存。',
}

const getStagePath = (stage: GrpoResourceStage, field: string) => ['grpo_resource_config', stage, field]

const createLimitValidator = (
  form: any,
  stage: GrpoResourceStage,
  requestField: string,
  errorMessage: string,
) => {
  return (_: unknown, value: number) => {
    const requestValue = form.getFieldValue(getStagePath(stage, requestField))
    if (value !== undefined && requestValue !== undefined && value < requestValue) {
      return Promise.reject(new Error(errorMessage))
    }
    return Promise.resolve()
  }
}

const normalizeNumber = (value: unknown, fallback?: number) => {
  if (typeof value === 'number')
    return value
  if (typeof value === 'string' && value.trim() !== '')
    return Number(value)
  return fallback
}

const buildGpuLabel = (gpuType?: unknown, gpuModel?: unknown) => {
  const typeText = Array.isArray(gpuType) ? gpuType[0] : gpuType
  return [typeText, gpuModel].filter(Boolean).join(' / ') || '请先在生产资源配置中选择显卡'
}

const GrpoStageResourceConfig: React.FC = () => {
  const form = Form.useFormInstance()
  const gpuType = Form.useWatch('gpu_type', form)
  const gpuModel = Form.useWatch('gpu_model', form)
  const gpuMemory = Form.useWatch('gpu_memory', form)
  const gpuCount = Form.useWatch('gpu_count', form)
  const k8sResourceType = Form.useWatch('k8s_resource_type', form)
  const graphicsCardResource = Form.useWatch('graphics_card_resource', form)

  useEffect(() => {
    const current = form.getFieldValue('grpo_resource_config') || {}
    const gpuLabel = buildGpuLabel(gpuType, gpuModel)
    const cpuRequest = normalizeNumber(graphicsCardResource?.cpu_request, 0.5)
    const cpuLimit = normalizeNumber(graphicsCardResource?.cpu_limit, 16)
    const memoryRequest = normalizeNumber(graphicsCardResource?.memory_request, 0.5)
    const memoryLimit = normalizeNumber(graphicsCardResource?.memory_limit, 16)

    const next = {
      ...current,
      hand: {
        cpu_request: cpuRequest,
        cpu_limit: cpuLimit,
        memory_request: memoryRequest,
        memory_limit: memoryLimit,
        ...current.hand,
        gpu_type: gpuType,
        gpu_model: gpuModel,
        gpu_memory: gpuMemory,
        gpu_count: current.hand?.gpu_count ?? gpuCount,
        k8s_resource_type: k8sResourceType,
        gpu_label: gpuLabel,
      },
      work: {
        cpu_request: cpuRequest,
        cpu_limit: cpuLimit,
        memory_request: memoryRequest,
        memory_limit: memoryLimit,
        ...current.work,
        gpu_type: gpuType,
        gpu_model: gpuModel,
        gpu_memory: gpuMemory,
        gpu_count: current.work?.gpu_count ?? gpuCount,
        k8s_resource_type: k8sResourceType,
        gpu_label: gpuLabel,
      },
      submit: {
        cpu_request: cpuRequest,
        cpu_limit: cpuLimit,
        memory_request: memoryRequest,
        memory_limit: memoryLimit,
        ...current.submit,
      },
    }

    form.setFieldValue('grpo_resource_config', next)
  }, [form, gpuCount, gpuMemory, gpuModel, gpuType, graphicsCardResource, k8sResourceType])

  const renderStageFields = (stage: GrpoResourceStage, includeGpu: boolean) => (
    <Space direction="vertical" size={16} className="w-full">
      <Alert type="info" showIcon message={stageDescriptions[stage]} />
      {includeGpu && (
        <>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name={getStagePath(stage, 'gpu_label')}
                label="显卡类型及型号"
                rules={[{ required: true, message: '请先选择显卡类型及型号' }]}
              >
                <Input disabled />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name={getStagePath(stage, 'gpu_count')}
                label="显卡 卡数配置"
                rules={[{ required: true, message: '请选择显卡数量' }]}
              >
                <Select placeholder="请选择显卡数量">
                  {[1, 2, 4, 8].map(count => (
                    <Select.Option key={count} value={count}>
                      {count}
                      张
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name={getStagePath(stage, 'gpu_type')} hidden>
            <Input />
          </Form.Item>
          <Form.Item name={getStagePath(stage, 'gpu_model')} hidden>
            <Input />
          </Form.Item>
          <Form.Item name={getStagePath(stage, 'gpu_memory')} hidden>
            <Input />
          </Form.Item>
          <Form.Item name={getStagePath(stage, 'k8s_resource_type')} hidden>
            <Input />
          </Form.Item>
        </>
      )}
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item
            name={getStagePath(stage, 'cpu_request')}
            label="CPU 请求"
            rules={[{ required: true, message: '请输入CPU请求' }]}
          >
            <InputNumber min={0} step={0.1} className="w-full" addonAfter="Core" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item
            name={getStagePath(stage, 'cpu_limit')}
            label="CPU 限制"
            dependencies={[getStagePath(stage, 'cpu_request')]}
            rules={[
              { required: true, message: '请输入CPU限制' },
              { validator: createLimitValidator(form, stage, 'cpu_request', 'CPU限制必须大于或等于CPU请求') },
            ]}
          >
            <InputNumber min={0} step={0.1} className="w-full" addonAfter="Core" />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={8}>
          <Form.Item
            name={getStagePath(stage, 'memory_request')}
            label="内存请求"
            rules={[{ required: true, message: '请输入内存请求' }]}
          >
            <InputNumber min={0} step={0.1} className="w-full" addonAfter="GB" />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item
            name={getStagePath(stage, 'memory_limit')}
            label="内存限制"
            dependencies={[getStagePath(stage, 'memory_request')]}
            rules={[
              { required: true, message: '请输入内存限制' },
              { validator: createLimitValidator(form, stage, 'memory_request', '内存限制必须大于或等于内存请求') },
            ]}
          >
            <InputNumber min={0} step={0.1} className="w-full" addonAfter="GB" />
          </Form.Item>
        </Col>
      </Row>
    </Space>
  )

  return (
    <Card
      className="mb-4 rounded-[8px]"
      size="small"
      title={(
        <Space>
          <PartitionOutlined className="text-[var(--lab-color-primary)]" />
          <span>GRPO 三阶段资源配置</span>
        </Space>
      )}
    >
      <Text type="secondary" className="mb-4 block">
        Hand 和 Work 使用显卡、CPU、内存资源；Submit 只使用 CPU 和内存。生产训练接口仍保留上方单组资源配置作为执行兜底。
      </Text>
      <Tabs
        items={(Object.keys(stageLabels) as GrpoResourceStage[]).map(stage => ({
          key: stage,
          label: stageLabels[stage],
          children: renderStageFields(stage, stage !== 'submit'),
        }))}
      />
    </Card>
  )
}

export default GrpoStageResourceConfig
