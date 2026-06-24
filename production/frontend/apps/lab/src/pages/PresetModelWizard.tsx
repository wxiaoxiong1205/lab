import React, { useEffect, useState } from 'react'
import { Alert, Button, Card, Col, Descriptions, Divider, Form, Input, InputNumber, Radio, Row, Select, Slider, Spin, Steps, Tag, Typography, message } from 'antd'
import { ArrowLeftOutlined, ArrowRightOutlined, CheckCircleOutlined, DatabaseOutlined, InfoCircleOutlined, RocketOutlined, SettingOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { PresetModelTemplate } from '../mock/mockPresetModelService'
import { mockPresetModelService } from '../mock/mockPresetModelService'

const { Title, Text } = Typography
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
    priority: string
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
// 步骤组件接口
interface StepProps {
  template: PresetModelTemplate | null
  formData: FormData
  onDataChange: (data: FormData) => void
  onNext: () => void
  onPrev: () => void
  current: number
}
// 步骤1：基础信息
const StepBasicInfo: React.FC<StepProps> = ({ template, formData, onDataChange, onNext }) => {
  const [form] = Form.useForm()
  const handleNext = async () => {
    try {
      const values = await form.validateFields()
      onDataChange({ ...formData, basicInfo: values })
      onNext()
    }
    catch {
      message.error('请完善基础信息')
    }
  }
  useEffect(() => {
    if (formData.basicInfo) {
      form.setFieldsValue(formData.basicInfo)
    }
    else if (template) {
      form.setFieldsValue({
        name: `${template.name}任务`,
        description: `基于${template.name}模板创建的调参任务`,
      })
    }
  }, [form, formData.basicInfo, template])
  return (
    <Card title={(
      <>
        <InfoCircleOutlined />
        {' '}
        基础信息
      </>
    )}
    >
      {template && (<Alert message={`已选择模板：${template.name}`} description={template.description} type="info" showIcon className="mb-6" />)}

      <Form form={form} layout="vertical" autoComplete="off">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
              <Input placeholder="输入任务名称" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="priority" label="任务优先级">
              <Select defaultValue="normal">
                <Option value="low">低</Option>
                <Option value="normal">普通</Option>
                <Option value="high">高</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="description" label="任务描述" rules={[{ required: true, message: '请输入任务描述' }]}>
          <TextArea rows={4} placeholder="描述您的任务目标和期望效果" />
        </Form.Item>
      </Form>

      <div className="text-right mt-6">
        <Button type="primary" onClick={handleNext}>
          下一步
          {' '}
          <ArrowRightOutlined />
        </Button>
      </div>
    </Card>
  )
}
// 步骤2：数据配置
const StepDataConfig: React.FC<StepProps> = ({ template, formData, onDataChange, onNext, onPrev }) => {
  const [form] = Form.useForm()
  const [selectedDataset, setSelectedDataset] = useState<typeof mockDatasets[0] | null>(null)
  const handleNext = async () => {
    try {
      const values = await form.validateFields()
      onDataChange({ ...formData, dataConfig: values })
      onNext()
    }
    catch {
      message.error('请完善数据配置')
    }
  }
  const handleDatasetChange = (datasetId: string) => {
    const dataset = mockDatasets.find((d) => d.id === datasetId)
    setSelectedDataset(dataset)
    // 检查数据格式兼容性
    if (dataset && template) {
      const isCompatible = template.supportedDataFormats.some((format) => dataset.format.includes(format))
      if (!isCompatible) {
        message.warning('选择的数据集格式与模板要求不完全匹配，请确认数据格式')
      }
    }
  }
  useEffect(() => {
    if (formData.dataConfig) {
      form.setFieldsValue(formData.dataConfig)
      const datasetId = formData.dataConfig.datasetId
      if (datasetId) {
        handleDatasetChange(datasetId)
      }
    }
  }, [form, formData.dataConfig])
  return (
    <Card title={(
      <>
        <DatabaseOutlined />
        {' '}
        数据配置
      </>
    )}
    >
      <Form form={form} layout="vertical" autoComplete="off">
        <Form.Item name="datasetId" label="选择数据集" rules={[{ required: true, message: '请选择数据集' }]}>
          <Select placeholder="选择训练数据集" onChange={handleDatasetChange}>
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
                <Descriptions.Item label="模板要求">{template?.supportedDataFormats.join(', ')}</Descriptions.Item>
              </Descriptions>
            )}
            type="info"
            className="mb-4"
          />
        )}

        <Divider>数据划分</Divider>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item name="trainRatio" label="训练集比例" initialValue={70}>
              <Slider min={50} max={80} marks={{ 50: '50%', 70: '70%', 80: '80%' }} tooltip={{ formatter: (value) => `${value}%` }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="validationRatio" label="验证集比例" initialValue={20}>
              <Slider min={10} max={30} marks={{ 10: '10%', 20: '20%', 30: '30%' }} tooltip={{ formatter: (value) => `${value}%` }} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="testRatio" label="测试集比例" initialValue={10}>
              <Slider min={5} max={20} marks={{ 5: '5%', 10: '10%', 20: '20%' }} tooltip={{ formatter: (value) => `${value}%` }} />
            </Form.Item>
          </Col>
        </Row>
      </Form>

      <div className="flex justify-between mt-6">
        <Button onClick={onPrev}>
          <ArrowLeftOutlined />
          {' '}
          上一步
        </Button>
        <Button type="primary" onClick={handleNext}>
          下一步
          {' '}
          <ArrowRightOutlined />
        </Button>
      </div>
    </Card>
  )
}
// 步骤3：模型与调参策略
const StepModelConfig: React.FC<StepProps> = ({ template, formData, onDataChange, onNext, onPrev }) => {
  const [form] = Form.useForm()
  const [mode, setMode] = useState<'simple' | 'expert'>('simple')
  const handleNext = async () => {
    try {
      const values = await form.validateFields()
      onDataChange({ ...formData, modelConfig: { ...values, mode } })
      onNext()
    }
    catch {
      message.error('请完善模型配置')
    }
  }
  useEffect(() => {
    if (formData.modelConfig) {
      form.setFieldsValue(formData.modelConfig)
      setMode(formData.modelConfig.mode || 'simple')
    }
    else if (template) {
      // 使用模板默认配置
      form.setFieldsValue({
        model: template.supportedModels[0],
        epochs: template.defaultConfig.epochs,
        learningRate: template.defaultConfig.learningRate,
        batchSize: template.defaultConfig.batchSize,
      })
    }
  }, [form, formData.modelConfig, template])
  return (
    <Card title={(
      <>
        <SettingOutlined />
        {' '}
        模型与调参策略
      </>
    )}
    >
      <div className="mb-6">
        <Text strong>配置模式：</Text>
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} className="ml-4">
          <Radio.Button value="simple">简单模式</Radio.Button>
          <Radio.Button value="expert">专家模式</Radio.Button>
        </Radio.Group>
      </div>

      {mode === 'simple' ? (<Alert message="简单模式" description="系统将使用最优的默认参数，您只需要选择训练时长即可。" type="info" className="mb-6" />) : (<Alert message="专家模式" description="您可以自定义模型选择和超参数配置。" type="warning" className="mb-6" />)}

      <Form form={form} layout="vertical" autoComplete="off">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="model" label="模型选择" rules={[{ required: true, message: '请选择模型' }]}>
              <Select placeholder="选择预训练模型">
                {template?.supportedModels.map((model) => (<Option key={model} value={model}>{model}</Option>))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="gpu" label="GPU资源" initialValue="auto">
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
          <Form.Item name="duration" label="训练时长" initialValue="medium">
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
                <Form.Item name="epochs" label="训练轮数" rules={[{ required: true, type: 'number', min: 1, max: 1000 }]}>
                  <InputNumber min={1} max={1000} className="w-full" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="learningRate" label="学习率" rules={[{ required: true, type: 'number', min: 0.00001, max: 1 }]}>
                  <InputNumber min={0.00001} max={1} step={0.00001} className="w-full" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="batchSize" label="批处理大小" rules={[{ required: true, type: 'number', min: 1, max: 1024 }]}>
                  <InputNumber min={1} max={1024} className="w-full" />
                </Form.Item>
              </Col>
            </Row>
          </>
        )}
      </Form>

      <div className="flex justify-between mt-6">
        <Button onClick={onPrev}>
          <ArrowLeftOutlined />
          {' '}
          上一步
        </Button>
        <Button type="primary" onClick={handleNext}>
          下一步
          {' '}
          <ArrowRightOutlined />
        </Button>
      </div>
    </Card>
  )
}
// 步骤4：回顾与启动
const StepReview: React.FC<StepProps & {
  onSubmit: () => Promise<void>
  loading: boolean
}> = ({ template, formData, onPrev, onSubmit, loading }) => {
  const selectedDataset = mockDatasets.find((d) => d.id === formData.dataConfig?.datasetId)
  const getEstimatedTime = () => {
    if (formData.modelConfig?.mode === 'simple') {
      const duration = formData.modelConfig?.duration
      switch (duration) {
        case 'quick': return '30分钟'
        case 'medium': return '2小时'
        case 'long': return '6小时'
        default: return '2小时'
      }
    }
    return template?.estimatedTime || '预计2-4小时'
  }
  return (
    <Card title={(
      <>
        <CheckCircleOutlined />
        {' '}
        回顾与启动
      </>
    )}
    >
      <Alert message="配置确认" description="请确认以下配置信息，点击启动任务开始训练。" type="success" className="mb-6" />

      <Descriptions title="任务配置汇总" bordered column={2}>
        <Descriptions.Item label="任务名称" span={2}>
          {formData.basicInfo?.name}
        </Descriptions.Item>
        <Descriptions.Item label="任务描述" span={2}>
          {formData.basicInfo?.description}
        </Descriptions.Item>
        <Descriptions.Item label="使用模板">
          <Tag color="blue">{template?.name}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="任务优先级">
          <Tag color={formData.basicInfo?.priority === 'high' ? 'red' : formData.basicInfo?.priority === 'low' ? 'gray' : 'orange'}>
            {formData.basicInfo?.priority === 'high' ? '高' : formData.basicInfo?.priority === 'low' ? '低' : '普通'}
          </Tag>
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
        <Descriptions.Item label="预计完成时间">
          {new Date(Date.now() + 2 * 60 * 60 * 1000).toLocaleString()}
        </Descriptions.Item>
      </Descriptions>

      <div className="flex justify-between mt-6">
        <Button onClick={onPrev} disabled={loading}>
          <ArrowLeftOutlined />
          {' '}
          上一步
        </Button>
        <Button type="primary" size="large" icon={<RocketOutlined />} loading={loading} onClick={onSubmit}>
          启动任务
        </Button>
      </div>
    </Card>
  )
}
// 主组件
const PresetModelWizard: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('template')
  const [current, setCurrent] = useState(0)
  const [template, setTemplate] = useState<PresetModelTemplate | null>(null)
  const [formData, setFormData] = useState<FormData>({})
  const [loading, setLoading] = useState(false)
  const [templateLoading, setTemplateLoading] = useState(true)
  // 加载模板信息
  useEffect(() => {
    const loadTemplate = async () => {
      if (templateId) {
        try {
          const response = await mockPresetModelService.getTemplate(templateId)
          setTemplate(response.data)
        }
        catch {
          message.error('加载模板信息失败')
          navigate('/preset-model')
        }
      }
      else {
        message.error('缺少模板参数')
        navigate('/preset-model')
      }
      setTemplateLoading(false)
    }
    loadTemplate()
  }, [templateId, navigate])
  const steps = [
    { title: '基础信息', icon: <InfoCircleOutlined /> },
    { title: '数据配置', icon: <DatabaseOutlined /> },
    { title: '模型配置', icon: <SettingOutlined /> },
    { title: '回顾启动', icon: <CheckCircleOutlined /> },
  ]
  const next = () => {
    setCurrent(current + 1)
  }
  const prev = () => {
    setCurrent(current - 1)
  }
  const handleSubmit = async () => {
    setLoading(true)
    try {
      const taskData = {
        name: formData.basicInfo.name,
        description: formData.basicInfo.description,
        templateId: template!.id,
        projectId: 'project_1', // 当前项目ID
        datasetId: formData.dataConfig.datasetId,
        config: {
          mode: formData.modelConfig.mode,
          model: formData.modelConfig.model,
          hyperparameters: formData.modelConfig.mode === 'expert' ? {
            epochs: formData.modelConfig.epochs,
            learningRate: formData.modelConfig.learningRate,
            batchSize: formData.modelConfig.batchSize,
          } : {},
          resourceRequirements: {
            gpu: formData.modelConfig.gpu,
            memory: '16GB',
            storage: '100GB',
          },
          dataSplit: {
            train: formData.dataConfig.trainRatio / 100,
            validation: formData.dataConfig.validationRatio / 100,
            test: formData.dataConfig.testRatio / 100,
          },
        },
      }
      const response = await mockPresetModelService.createTask(taskData)
      message.success('任务创建成功！')
      navigate(`/preset-model/tasks/${response.data.id}`)
    }
    catch {
      message.error('任务创建失败')
    }
    finally {
      setLoading(false)
    }
  }
  if (templateLoading) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Spin size="large" />
      </div>
    )
  }
  const stepProps = {
    template,
    formData,
    onDataChange: setFormData,
    onNext: next,
    onPrev: prev,
    current,
  }
  return (
    <div className="p-[24px] min-h-[100vh]" style={{ backgroundColor: '#f5f5f5' }}>
      <div className="max-w-[1200px] m-[0_auto]">
        <Title level={2} className="text-center mb-[32px]">
          <RocketOutlined />
          {' '}
          创建预置模型调参任务
        </Title>

        <Steps current={current} className="mb-[32px]">
          {steps.map((step, index) => (<Step key={index} title={step.title} icon={step.icon} />))}
        </Steps>

        <div className="bg-[var(--lab-color-surface-elevated)] rounded-[8px] p-6">
          {current === 0 && <StepBasicInfo {...stepProps} />}
          {current === 1 && <StepDataConfig {...stepProps} />}
          {current === 2 && <StepModelConfig {...stepProps} />}
          {current === 3 && (<StepReview {...stepProps} onSubmit={handleSubmit} loading={loading} />)}
        </div>
      </div>
    </div>
  )
}
export default PresetModelWizard
