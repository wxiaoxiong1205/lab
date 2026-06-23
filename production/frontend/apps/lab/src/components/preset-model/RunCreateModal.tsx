import React, { useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Select,
  Slider,
  Space,
  Steps,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  InfoCircleOutlined,
  PlayCircleOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import type {
  PresetModelTask,
  PresetModelTemplate } from '../../mock/mockPresetModelService'
import {
  mockPresetModelService,
} from '../../mock/mockPresetModelService'

const { Text } = Typography
const { Step } = Steps
const { TextArea } = Input
const { Option } = Select

// 模拟数据集数据
const mockDatasets = [
  { id: 'dataset_1', name: '商品图像数据集', size: 12000, format: ['JPG', 'PNG'] },
  { id: 'dataset_2', name: '用户评论数据集', size: 8000, format: ['TXT', 'JSON'] },
  { id: 'dataset_3', name: '用户行为数据集', size: 50000, format: ['CSV', 'Excel'] },
  { id: 'dataset_4', name: '产品描述数据集', size: 15000, format: ['TXT', 'JSON'] },
]

// 表单数据类型
interface FormData {
  basicInfo?: {
    name: string
    description: string
  }
  dataConfig?: {
    datasetId: string
    trainRatio: number
    validationRatio: number
    testRatio: number
  }
  modelConfig?: {
    mode: 'simple' | 'expert'
    model: string
    gpu: string
    duration?: string
    epochs?: number
    learningRate?: number
    batchSize?: number
  }
}

interface RunCreateModalProps {
  visible: boolean
  onClose: () => void
  onSuccess: (runId: string) => void
  task: PresetModelTask
  template?: PresetModelTemplate
}

export default function RunCreateModal({
  visible,
  onClose,
  onSuccess,
  task,
  template,
}: RunCreateModalProps) {
  const [form] = Form.useForm()
  const [current, setCurrent] = useState(0)
  const [formData, setFormData] = useState<FormData>({})
  const [loading, setLoading] = useState(false)
  const [selectedDataset, setSelectedDataset] = useState<typeof mockDatasets[0] | null>(null)
  const [mode, setMode] = useState<'simple' | 'expert'>('simple')

  // 步骤配置
  const steps = [
    { title: '运行信息', icon: <InfoCircleOutlined /> },
    { title: '数据配置', icon: <DatabaseOutlined /> },
    { title: '模型配置', icon: <SettingOutlined /> },
    { title: '启动运行', icon: <CheckCircleOutlined /> },
  ]

  // 重置表单和状态
  const resetForm = () => {
    form.resetFields()
    setCurrent(0)
    setFormData({})
    setSelectedDataset(null)
    setMode('simple')
  }

  // 处理弹窗关闭
  const handleClose = () => {
    resetForm()
    onClose()
  }

  // 下一步
  const handleNext = async () => {
    try {
      const values = await form.validateFields()

      // 根据当前步骤更新对应的数据
      const updatedData = { ...formData }

      switch (current) {
        case 0:
          updatedData.basicInfo = values
          break
        case 1:
          updatedData.dataConfig = values
          break
        case 2:
          updatedData.modelConfig = { ...values, mode }
          break
      }

      setFormData(updatedData)
      setCurrent(current + 1)
    }
    catch {
      message.error('请完善当前步骤的信息')
    }
  }

  // 上一步
  const handlePrev = () => {
    setCurrent(current - 1)
  }

  // 提交表单
  const handleSubmit = async () => {
    setLoading(true)
    try {
      const runData = {
        taskId: task.id,
        name: formData.basicInfo!.name,
        description: formData.basicInfo!.description,
        config: {
          datasetId: formData.dataConfig!.datasetId,
          datasetName: selectedDataset?.name || '',
          dataSplit: {
            train: formData.dataConfig!.trainRatio / 100,
            validation: formData.dataConfig!.validationRatio / 100,
            test: formData.dataConfig!.testRatio / 100,
          },
          model: formData.modelConfig!.model,
          mode: formData.modelConfig!.mode,
          hyperparameters: formData.modelConfig!.mode === 'expert' ? {
            epochs: formData.modelConfig!.epochs,
            learningRate: formData.modelConfig!.learningRate,
            batchSize: formData.modelConfig!.batchSize,
          } : task.config.hyperparameters,
          resourceRequirements: {
            gpu: formData.modelConfig!.gpu,
            memory: task.config.resourceRequirements.memory,
            storage: task.config.resourceRequirements.storage,
          },
        },
      }

      const response = await mockPresetModelService.createRun(runData)

      if (response.success) {
        message.success('运行创建成功！')
        onSuccess(response.data.id)
        handleClose()
      }
    }
    catch (error) {
      console.error('创建运行失败:', error)
      message.error('创建运行失败，请重试')
    }
    finally {
      setLoading(false)
    }
  }

  // 处理数据集选择
  const handleDatasetChange = (datasetId: string) => {
    const dataset = mockDatasets.find((d) => d.id === datasetId)
    setSelectedDataset(dataset || null)
  }

  // 获取预计训练时间
  const getEstimatedTime = () => {
    if (!formData.modelConfig) return '未知'

    const { mode, duration } = formData.modelConfig
    if (mode === 'simple') {
      switch (duration) {
        case 'quick': return '约30分钟'
        case 'medium': return '约2小时'
        case 'long': return '约6小时'
        default: return '约2小时'
      }
    }
    else {
      const epochs = formData.modelConfig.epochs || 3
      return `约${Math.ceil(epochs * 0.5)}小时`
    }
  }

  // 渲染步骤内容
  const renderStepContent = () => {
    switch (current) {
      case 0:
        return renderBasicInfoStep()
      case 1:
        return renderDataConfigStep()
      case 2:
        return renderModelConfigStep()
      case 3:
        return renderReviewStep()
      default:
        return null
    }
  }

  // 渲染基础信息步骤
  const renderBasicInfoStep = () => {
    // 设置初始值
    if (!form.getFieldValue('name')) {
      form.setFieldsValue({
        name: `${task.name} - 运行${Date.now().toString().slice(-4)}`,
        description: `基于任务 ${task.name} 创建的运行实例`,
      })
    }

    return (
      <div>
        <Card
          size="small"
          title={(
            <Space>
              <Text strong>
                基础任务：
                {task.name}
              </Text>
              <Tag color="blue">{task.templateName}</Tag>
            </Space>
          )}
          className="mb-4"
        >
          <Text type="secondary">{task.description}</Text>
        </Card>

        <Alert
          message="创建运行实例"
          description="运行实例是基于任务配置的具体执行，您可以调整参数来测试不同的效果。"
          type="info"
          showIcon
          className="mb-4"
        />

        <Form form={form} layout="vertical" autoComplete="off">
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item
                name="name"
                label="运行名称"
                rules={[
                  { required: true, message: '请输入运行名称' },
                  { max: 50, message: '运行名称不能超过50个字符' },
                ]}
              >
                <Input placeholder="输入运行名称" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="description"
            label="运行描述"
            rules={[{ max: 200, message: '描述不能超过200个字符' }]}
          >
            <TextArea
              rows={3}
              placeholder="描述本次运行的目标和调整的参数"
              maxLength={200}
              showCount
            />
          </Form.Item>
        </Form>
      </div>
    )
  }

  // 渲染数据配置步骤
  const renderDataConfigStep = () => {
    // 设置初始值
    if (!form.getFieldValue('datasetId')) {
      form.setFieldsValue({
        datasetId: task.config.datasetId || 'dataset_1',
        trainRatio: task.config.dataSplit.train * 100,
        validationRatio: task.config.dataSplit.validation * 100,
        testRatio: task.config.dataSplit.test * 100,
      })
    }

    return (
      <div>
        <Form form={form} layout="vertical" autoComplete="off">
          <Form.Item
            name="datasetId"
            label="选择数据集"
            rules={[{ required: true, message: '请选择数据集' }]}
          >
            <Select
              placeholder="选择训练数据集"
              onChange={handleDatasetChange}
            >
              {mockDatasets.map((dataset) => (
                <Option key={dataset.id} value={dataset.id}>
                  <div>
                    <strong>{dataset.name}</strong>
                    <br />
                    <Text type="secondary">
                      {dataset.size.toLocaleString()}
                      {' '}
                      条数据 | 格式:
                      {dataset.format.join(', ')}
                    </Text>
                  </div>
                </Option>
              ))}
            </Select>
          </Form.Item>

          {selectedDataset && (
            <Alert
              message="数据集信息"
              description={(
                <Descriptions size="small" column={1}>
                  <Descriptions.Item label="数据量">
                    {selectedDataset.size.toLocaleString()}
                    {' '}
                    条
                  </Descriptions.Item>
                  <Descriptions.Item label="格式">{selectedDataset.format.join(', ')}</Descriptions.Item>
                </Descriptions>
              )}
              type="info"
              className="mb-4"
            />
          )}

          <Divider>数据划分</Divider>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="trainRatio"
                label="训练集"
              >
                <Slider
                  min={50}
                  max={80}
                  marks={{ 50: '50%', 70: '70%', 80: '80%' }}
                  tooltip={{ formatter: (value) => `${value}%` }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="validationRatio"
                label="验证集"
              >
                <Slider
                  min={10}
                  max={30}
                  marks={{ 10: '10%', 20: '20%', 30: '30%' }}
                  tooltip={{ formatter: (value) => `${value}%` }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="testRatio"
                label="测试集"
              >
                <Slider
                  min={5}
                  max={20}
                  marks={{ 5: '5%', 10: '10%', 20: '20%' }}
                  tooltip={{ formatter: (value) => `${value}%` }}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </div>
    )
  }

  // 渲染模型配置步骤
  const renderModelConfigStep = () => {
    // 设置初始值
    if (!form.getFieldValue('model')) {
      form.setFieldsValue({
        model: task.config.model,
        gpu: task.config.resourceRequirements.gpu,
        duration: 'medium',
        epochs: task.config.hyperparameters.epochs || 50,
        learningRate: task.config.hyperparameters.learningRate || 0.001,
        batchSize: task.config.hyperparameters.batchSize || 32,
      })
    }

    return (
      <div>
        <div className="mb-4">
          <Text strong>配置模式：</Text>
          <Radio.Group
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="ml-2"
          >
            <Radio.Button value="simple">简单模式</Radio.Button>
            <Radio.Button value="expert">专家模式</Radio.Button>
          </Radio.Group>
        </div>

        {mode === 'simple' ? (
          <Alert
            message="简单模式"
            description="使用任务的默认参数，您只需要选择训练时长即可。"
            type="info"
            className="mb-4"
          />
        ) : (
          <Alert
            message="专家模式"
            description="您可以自定义模型选择和超参数配置。"
            type="warning"
            className="mb-4"
          />
        )}

        <Form form={form} layout="vertical" autoComplete="off">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="model"
                label="模型选择"
                rules={[{ required: true, message: '请选择模型' }]}
              >
                <Select placeholder="选择预训练模型">
                  {template?.supportedModels.map((model) => (
                    <Option key={model} value={model}>{model}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="gpu"
                label="GPU资源"
              >
                <Select>
                  <Option value="auto">自动分配</Option>
                  <Option value="tesla-v100">Tesla V100</Option>
                  <Option value="tesla-a100">Tesla A100</Option>
                  <Option value="tesla-t4">Tesla T4</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {mode === 'simple' ? (
            <Form.Item
              name="duration"
              label="训练时长"
              initialValue="medium"
            >
              <Radio.Group>
                <Radio.Button value="quick">快速 (30分钟)</Radio.Button>
                <Radio.Button value="medium">标准 (2小时)</Radio.Button>
                <Radio.Button value="long">深度 (6小时)</Radio.Button>
              </Radio.Group>
            </Form.Item>
          ) : (
            <>
              <Divider>超参数配置</Divider>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item
                    name="epochs"
                    label="训练轮数"
                    rules={[{ required: true, type: 'number', min: 1, max: 1000 }]}
                  >
                    <InputNumber min={1} max={1000} className="w-full" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="learningRate"
                    label="学习率"
                    rules={[{ required: true, type: 'number', min: 0.00001, max: 1 }]}
                  >
                    <InputNumber min={0.00001} max={1} step={0.00001} className="w-full" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    name="batchSize"
                    label="批处理大小"
                    rules={[{ required: true, type: 'number', min: 1, max: 1024 }]}
                  >
                    <InputNumber min={1} max={1024} className="w-full" />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}
        </Form>
      </div>
    )
  }

  // 渲染回顾步骤
  const renderReviewStep = () => {
    return (
      <div>
        <Alert
          message="准备启动运行"
          description="请确认配置信息无误后点击启动运行按钮。"
          type="success"
          showIcon
          className="mb-4"
        />

        <Descriptions title="运行配置汇总" bordered column={2} size="small">
          <Descriptions.Item label="基础任务" span={2}>
            <Tag color="blue">{task.name}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="运行名称" span={2}>
            {formData.basicInfo?.name}
          </Descriptions.Item>
          <Descriptions.Item label="运行描述" span={2}>
            {formData.basicInfo?.description}
          </Descriptions.Item>
          <Descriptions.Item label="数据集">
            {selectedDataset?.name}
          </Descriptions.Item>
          <Descriptions.Item label="数据量">
            {selectedDataset?.size?.toLocaleString()}
            {' '}
            条
          </Descriptions.Item>
          <Descriptions.Item label="数据划分">
            训练:
            {' '}
            {formData.dataConfig?.trainRatio}
            % |
            验证:
            {' '}
            {formData.dataConfig?.validationRatio}
            % |
            测试:
            {' '}
            {formData.dataConfig?.testRatio}
            %
          </Descriptions.Item>
          <Descriptions.Item label="模型">
            {formData.modelConfig?.model}
          </Descriptions.Item>
          <Descriptions.Item label="配置模式">
            <Tag color={formData.modelConfig?.mode === 'expert' ? 'purple' : 'green'}>
              {formData.modelConfig?.mode === 'expert' ? '专家模式' : '简单模式'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="GPU资源">
            {formData.modelConfig?.gpu === 'auto' ? '自动分配' : formData.modelConfig?.gpu}
          </Descriptions.Item>
          <Descriptions.Item label="预计时长">
            {getEstimatedTime()}
          </Descriptions.Item>
        </Descriptions>
      </div>
    )
  }

  return (
    <Modal
      title={(
        <Space>
          <PlayCircleOutlined />
          创建运行实例
        </Space>
      )}
      open={visible}
      onCancel={handleClose}
      width={800}
      footer={null}
      destroyOnClose
    >
      <div className="py-4">
        <Steps current={current} size="small" className="mb-6">
          {steps.map((step, index) => (
            <Step key={index} title={step.title} icon={step.icon} />
          ))}
        </Steps>

        <div className="min-h-[400px]">
          {renderStepContent()}
        </div>

        <div className="flex justify-between mt-6">
          <Space>
            <Button onClick={handleClose}>取消</Button>
            {current > 0 && (
              <Button onClick={handlePrev}>
                <ArrowLeftOutlined />
                {' '}
                上一步
              </Button>
            )}
          </Space>
          <Space>
            {current < steps.length - 1 ? (
              <Button type="primary" onClick={handleNext}>
                下一步
                {' '}
                <ArrowRightOutlined />
              </Button>
            ) : (
              <Button type="primary" onClick={handleSubmit} loading={loading}>
                <PlayCircleOutlined />
                {' '}
                启动运行
              </Button>
            )}
          </Space>
        </div>
      </div>
    </Modal>
  )
}
