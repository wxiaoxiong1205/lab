import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Button, Card, Col, Divider, Form,
  Input, InputNumber, Row, Select,
  Space, Steps, Switch, Typography, message,
} from 'antd'
import {
  AppstoreOutlined,
  DatabaseOutlined,
  EyeOutlined, RocketOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import {
  createFinetuneTask,
  getBaseModelList,
  getFinetuneTaskDetail,
  getFinetuneValidationDatasets,
  getTrainingDatasets,
} from '../services/finetuneTaskService'
import { getPublishedModels } from '../services/publishedModelService'
import type {
  CreateFinetuneTaskRequest,
  DatasetConfig,
  FinetuneDataset,
  PublishedModel,
  TrainingDataset,
  ValidationConfig as ValidationConfigType,
} from '../types'

import { useProjectStore } from '../stores/projectStore'
import type { KubernetesResourceRequirements } from '../types'
import GPUResourceSelector from '../components/finetune/GPUResourceSelector'
import MultiDatasetSelector from '../components/finetune/MultiDatasetSelector'
import ValidationConfigComponent from '../components/finetune/ValidationConfig'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'

import './styles/finetune.scss'

const { Title, Paragraph, Text } = Typography
const { Option } = Select
const { TextArea } = Input
const { Step } = Steps

// 定义类型接口
interface BaseModel {
  id: string
  name: string
  description: string
  provider?: string
  size?: string
  type?: string
  recommended_gpu?: string[]
  min_gpu_memory?: number
}

// 使用统一的FinetuneDataset类型，无需本地定义

// 创建FormState接口来替代any类型
interface FormState {
  name: string
  description?: string
  base_model?: string
  datasets?: DatasetConfig[]
  validation_config?: ValidationConfigType

  resource_requirements: KubernetesResourceRequirements
  hyperparameters: {
    learning_rate: number
    epochs: number
    batch_size: number
    optimizer: string
    warmup_ratio?: number
    weight_decay?: number
    [key: string]: unknown
  }
  output_model_name: string
  [key: string]: unknown
}

/**
 * 微调任务创建页面
 * 提供多步骤表单创建微调任务
 */
const CreateFinetuneTask: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { projectId } = useParams<{ projectId: string }>()
  const { currentProject } = useProjectStore()
  const [form] = Form.useForm()

  const [current, setCurrent] = useState<number>(0)
  const [loading, setLoading] = useState<boolean>(false)
  const [baseModels, setBaseModels] = useState<BaseModel[]>([])
  const [publishedModels, setPublishedModels] = useState<PublishedModel[]>([])
  // 修复数据集状态类型，匹配组件接口要求
  const [datasets, setDatasets] = useState<{
    id: string
    name: string
    description?: string
    format: string
    record_count: number
    size: string
    status: string
  }[]>([])
  const [validationDatasets, setValidationDatasets] = useState<FinetuneDataset[]>([])

  const [cloneTaskId, setCloneTaskId] = useState<string | null>(null)

  // 添加表单所有值的状态，确保步骤间切换时数据不丢失
  const [formState, setFormState] = useState<FormState>({
    name: '新微调任务',
    description: '',
    datasets: [], // 初始化为空数组
    validation_config: { type: 'split', split_ratio: 20 }, // 默认验证集配置

    resource_requirements: {
      gpu: {
        node_name: '',
        count: 1,
        type: '',
        specific_gpus: [],
      },
      model_publish: {
        auto_publish: false,
        publish_mode: 'new_model' as const,
        model_name: '',
        model_type: 'text_generation',
        context_length: 8192,
        version_description: '',
      },
    },
    hyperparameters: {
      learning_rate: 0.0001,
      epochs: 3,
      batch_size: 4,
      optimizer: 'adamw',
      warmup_ratio: 0.03,
      weight_decay: 0.01,
    },
    output_model_name: '微调模型',
  })

  // 在表单值变化时保存最新状态
  const handleFormValuesChange = (changedValues: Partial<FormState>, allValues: FormState) => {
    console.log('表单值变化:', changedValues)
    console.log('所有表单值:', allValues)

    // 深度合并表单值，确保嵌套对象正确更新
    const updatedValues = { ...formState }

    // 基本字段直接赋值
    if (allValues.name !== undefined) updatedValues.name = allValues.name
    if (allValues.description !== undefined) updatedValues.description = allValues.description
    if (allValues.base_model !== undefined) updatedValues.base_model = allValues.base_model
    if (allValues.output_model_name !== undefined) updatedValues.output_model_name = allValues.output_model_name

    // 数据集配置
    if (allValues.datasets !== undefined) updatedValues.datasets = allValues.datasets
    if (allValues.validation_config !== undefined) updatedValues.validation_config = allValues.validation_config

    // 深度合并 hyperparameters
    if (allValues.hyperparameters) {
      updatedValues.hyperparameters = {
        ...formState.hyperparameters,
        ...allValues.hyperparameters,
      }
    }

    // 深度合并 resource_requirements
    if (allValues.resource_requirements) {
      updatedValues.resource_requirements = {
        ...formState.resource_requirements,
        ...allValues.resource_requirements,
      }

      // 确保子对象也正确合并
      if (allValues.resource_requirements.gpu) {
        updatedValues.resource_requirements.gpu = {
          ...formState.resource_requirements.gpu,
          ...allValues.resource_requirements.gpu,
        }
      }
      if (allValues.resource_requirements.model_publish) {
        updatedValues.resource_requirements.model_publish = {
          ...formState.resource_requirements.model_publish,
          ...allValues.resource_requirements.model_publish,
        }
      }
    }

    console.log('更新后的状态:', updatedValues)
    setFormState(updatedValues)
  }

  // 从URL获取克隆任务ID和数据集ID
  useEffect(() => {
    const query = new URLSearchParams(location.search)
    const cloneId = query.get('clone')
    const datasetId = query.get('datasetId')

    if (cloneId) {
      setCloneTaskId(cloneId)
    }

    // 如果提供了数据集ID，预选该数据集
    if (datasetId && datasets.length > 0) {
      const selectedDataset = datasets.find((d) => d.id === datasetId)
      if (selectedDataset) {
        const datasetConfig: DatasetConfig = {
          id: selectedDataset.id,
          name: selectedDataset.name,
          format: selectedDataset.format,
          record_count: selectedDataset.record_count,
          ratio: 100, // 默认100%使用该数据集
        }
        const updatedFormState = {
          ...formState,
          datasets: [datasetConfig],
        }
        setFormState(updatedFormState)
        form.setFieldsValue(updatedFormState)
        message.info(`已自动选择数据集: ${selectedDataset.name}`)
      }
    }
  }, [location, datasets])

  // 修改初始化表单默认值，使用formState
  useEffect(() => {
    // 设置默认值
    const initialValues = {
      name: '新微调任务',
      description: '',
      datasets: [], // 初始化为空数组
      validation_config: { type: 'split' as const, split_ratio: 20 },
      resource_requirements: {
        gpu: {
          node_name: '',
          count: 1,
          type: '',
          specific_gpus: [],
        },
        model_publish: {
          auto_publish: false,
          publish_mode: 'new_model' as const,
          model_name: '',
          model_type: 'text_generation',
          context_length: 8192,
          version_description: '',
        },
      },
      hyperparameters: {
        learning_rate: 0.0001,
        epochs: 3,
        batch_size: 4,
        optimizer: 'adamw',
        warmup_ratio: 0.03,
        weight_decay: 0.01,
      },
      output_model_name: '微调模型',
    }

    form.setFieldsValue(initialValues)
    setFormState(initialValues)
  }, [])

  // 添加监听current变化的useEffect
  useEffect(() => {
    // 当步骤改变时，重新加载表单值
    console.log('当前步骤已改变，重新加载表单数据')
    form.setFieldsValue(formState)
  }, [current])

  // 如果有克隆任务ID，加载任务详情
  useEffect(() => {
    if (cloneTaskId) {
      fetchCloneTaskDetail(cloneTaskId)
    }
  }, [cloneTaskId])

  // 获取克隆任务详情
  const fetchCloneTaskDetail = async (taskId: string) => {
    try {
      setLoading(true)
      const taskDetail = await getFinetuneTaskDetail(taskId)

      // 设置克隆任务的表单值，处理资源需求结构转换
      const cloneFormValues = {
        name: `${taskDetail.name} (克隆)`,
        description: taskDetail.description,
        base_model: taskDetail.base_model,
        datasets: taskDetail.datasets || [], // 转换为DatasetConfig[]
        validation_config: taskDetail.validation_config || { type: 'split' as const, split_ratio: 20 },
        resource_requirements: {
          // 转换为新的GPU资源结构
          gpu: {
            node_name: taskDetail.resource_requirements?.gpu?.node_name || '',
            count: taskDetail.resource_requirements?.gpu?.count || 1,
            type: taskDetail.resource_requirements?.gpu?.type || taskDetail.resource_requirements?.gpu?.model || '',
            specific_gpus: taskDetail.resource_requirements?.gpu?.specific_gpus || [],
          },
          model_publish: taskDetail.resource_requirements?.model_publish || {
            auto_publish: false,
            publish_mode: 'new_model' as const,
            model_name: '',
            model_type: 'text_generation',
            context_length: 8192,
            version_description: '',
          },
        },
        hyperparameters: taskDetail.hyperparameters,
        output_model_name: `${taskDetail.output_model_name}-clone`,
      }

      form.setFieldsValue(cloneFormValues)
      setFormState(cloneFormValues)
    }
    catch (error) {
      console.error('Failed to fetch clone task detail:', error)
      message.error('加载克隆任务详情失败')
    }
    finally {
      setLoading(false)
    }
  }

  // 获取基础模型列表
  const fetchBaseModels = async () => {
    try {
      const models = await getBaseModelList()

      // 确保models是数组
      if (Array.isArray(models)) {
        setBaseModels(models)
      }
      else {
        console.error('Base models is not an array:', models)
        setBaseModels([])
      }
    }
    catch (error) {
      console.error('Failed to fetch base models:', error)
      message.error('加载基础模型列表失败')
      setBaseModels([])
    }
  }

  // 获取训练数据集列表
  const fetchDatasets = async () => {
    try {
      if (!projectId && !currentProject?.id) {
        console.warn('No project ID available for fetching datasets')
        return
      }

      const numericProjectId = projectId ? parseInt(projectId, 10) : currentProject!.id
      const trainingDatasets = await getTrainingDatasets(numericProjectId)

      // 转换为Dataset格式（匹配MultiDatasetSelector接口）
      const datasetList = trainingDatasets.map((dataset: TrainingDataset) => ({
        id: String(dataset.id),
        name: dataset.name,
        description: dataset.description || '',
        format: dataset.format,
        record_count: dataset.total_samples || 0,
        size: dataset.file_size ? `${Math.round(dataset.file_size / 1024 / 1024 * 100) / 100}MB` : '未知',
        status: 'active',
      }))

      setDatasets(datasetList)
    }
    catch (error) {
      console.error('Failed to fetch training datasets:', error)
      message.error('加载训练数据集失败')
      setDatasets([])
    }
  }

  // 获取验证数据集列表
  const fetchValidationDatasets = async () => {
    try {
      if (!projectId && !currentProject?.id) {
        console.warn('No project ID available for fetching validation datasets')
        return
      }

      const numericProjectId = projectId ? parseInt(projectId, 10) : currentProject!.id
      const validationDatasetList = await getFinetuneValidationDatasets(numericProjectId)

      // 转换为FinetuneDataset格式
      const validationDatasets = validationDatasetList.map((dataset: FinetuneDataset) => ({
        id: String(dataset.id),
        name: dataset.name,
        description: dataset.description || '',
        format: dataset.format,
        record_count: dataset.record_count || 0,
        size: dataset.size || '未知',
        status: dataset.status,
      }))

      setValidationDatasets(validationDatasets)
    }
    catch (error) {
      console.error('Failed to fetch validation datasets:', error)
      message.error('加载验证数据集失败')
      setValidationDatasets([])
    }
  }

  // 获取已发布模型列表
  const fetchPublishedModels = async () => {
    try {
      const models = await getPublishedModels()
      setPublishedModels(models)
    }
    catch (error) {
      console.error('Failed to fetch published models:', error)
      message.error('加载已发布模型列表失败')
      setPublishedModels([])
    }
  }

  // 页面加载时获取数据
  useEffect(() => {
    fetchBaseModels()
    fetchDatasets()
    fetchValidationDatasets() // 添加获取验证数据集的调用
    fetchPublishedModels()
  }, [])

  // 获取项目路径
  const getProjectPath = () => {
    // 首先使用URL中的projectId
    if (projectId) {
      return `/project/${projectId}`
    }

    // 否则使用全局存储的项目ID
    if (currentProject?.id) {
      return `/project/${currentProject.id}`
    }

    // 如果都没有，显示错误并返回到项目列表
    message.error('未找到项目信息，请先选择一个项目')
    navigate('/projects')
    return ''
  }

  // 下一步
  const handleNext = async () => {
    try {
      // 获取当前步骤需要验证的字段
      const fieldsToValidate = getFieldsForCurrentStep()

      // 验证当前步骤的字段
      if (fieldsToValidate.length > 0) {
        await form.validateFields(fieldsToValidate)
      }

      // 获取当前表单值并保存到状态
      const currentValues = form.getFieldsValue()
      const updatedFormState = { ...formState, ...currentValues }
      setFormState(updatedFormState)

      // 进入下一步
      setCurrent(current + 1)
    }
    catch (error) {
      console.error('表单验证失败:', error)
      message.error('请填写完整的表单信息')
    }
  }

  // 上一步
  const handlePrev = () => {
    // 保存当前表单值
    const currentValues = form.getFieldsValue()
    const updatedFormState = { ...formState, ...currentValues }
    setFormState(updatedFormState)

    setCurrent(current - 1)
  }

  // 提交表单
  const handleSubmit = async () => {
    try {
      // 验证所有字段
      await form.validateFields()

      setLoading(true)

      // 获取最终表单值
      const finalValues = form.getFieldsValue()

      // 构造任务创建数据
      const taskData: CreateFinetuneTaskRequest = {
        name: finalValues.name,
        description: finalValues.description,
        base_model: finalValues.base_model,
        datasets: finalValues.datasets, // 使用多数据集配置
        validation_config: finalValues.validation_config,
        resource_requirements: finalValues.resource_requirements,
        hyperparameters: finalValues.hyperparameters,
        output_model_name: finalValues.output_model_name,
      }

      console.log('提交任务数据:', taskData)

      // 调用API创建任务
      try {
        const result = await createFinetuneTask(taskData)
        message.success('微调任务创建成功')
        console.log('Task created successfully with ID:', result.id || result.task?.id)

        // 获取项目路径
        const basePath = getProjectPath()
        if (!basePath) return

        // 重定向到任务详情页
        if (result.id) {
          navigate(`${basePath}/training/runs/${result.id}`)
        }
        else if (result.task?.id) {
          navigate(`${basePath}/training/runs/${result.task.id}`)
        }
        else {
          console.error('No task ID in response:', result)
          message.warning('任务已创建，但无法导航到详情页')
          navigate(`${basePath}/training`)
        }
      }
      catch (error) {
        console.error('Failed to create task:', error)
        message.error(`创建任务失败: ${error instanceof Error ? error.message : String(error)}`)
      }
      finally {
        setLoading(false)
      }
    }
    catch (error) {
      console.error('Form validation failed:', error)
      message.error('表单验证失败，请检查输入')
    }
  }

  // 返回训练列表页
  const handleCancel = () => {
    const basePath = getProjectPath()
    if (!basePath) return

    navigate(`${basePath}/training`)
  }

  // 获取当前步骤需要验证的字段
  const getFieldsForCurrentStep = () => {
    switch (current) {
      case 0: // 基本信息
        return ['name'] // 描述是可选的
      case 1: // 模型与数据
        return ['base_model']
      case 2: // 多数据集配置
        return ['datasets', 'validation_config']
      case 3: // 配置与超参数
        return [
          'hyperparameters.learning_rate',
          'hyperparameters.epochs',
          'hyperparameters.batch_size',
          'hyperparameters.optimizer',
          'output_model_name',
        ]
      case 4: { // 资源分配
        const fields = [
          ['resource_requirements', 'gpu'], // GPU资源验证
          'resource_requirements.model_publish.auto_publish',
          'resource_requirements.model_publish.publish_mode',
          'resource_requirements.model_publish.model_type',
          'resource_requirements.model_publish.context_length',
        ]

        // 根据发布方式动态添加验证字段
        const publishMode = form.getFieldValue(['resource_requirements', 'model_publish', 'publish_mode'])
        if (publishMode === 'new_model') {
          fields.push('resource_requirements.model_publish.model_name')
        }
        else {
          fields.push('resource_requirements.model_publish.existing_model_id')
        }

        return fields
      }
      default:
        return []
    }
  }

  // 渲染项目警告
  const renderProjectWarning = () => {
    if (!currentProject) {
      return (
        <Alert
          message="请先选择项目"
          description="在创建微调任务之前，请先选择或创建一个项目。"
          type="warning"
          showIcon
          className="mb-4"
        />
      )
    }
    return null
  }

  // 渲染步骤1：基本信息
  const renderBasicInfoStep = () => {
    return (
      <div>
        <Title level={5}>基本信息</Title>
        <Paragraph>请输入微调任务的基本信息。</Paragraph>

        <Form.Item
          name="name"
          label="任务名称"
          rules={[{ required: true, message: '请输入任务名称' }]}
        >
          <Input placeholder="请输入任务名称" />
        </Form.Item>

        <Form.Item
          name="description"
          label="任务描述"
        >
          <TextArea
            placeholder="请输入任务描述（可选）"
            rows={4}
            maxLength={1000}
            showCount
          />
        </Form.Item>
      </div>
    )
  }

  // 渲染步骤2：模型与数据
  const renderModelAndDataStep = () => {
    // 确保baseModels是数组
    const modelsArray = Array.isArray(baseModels) ? baseModels : []

    return (
      <div>
        <Title level={5}>选择基础模型</Title>
        <Paragraph>选择要微调的基础模型。</Paragraph>

        <Form.Item
          name="base_model"
          label="基础模型"
          rules={[{ required: true, message: '请选择基础模型' }]}
        >
          <Select
            placeholder="请选择基础模型"
            loading={modelsArray.length === 0}
            allowClear
          >
            {modelsArray.map((model) => (
              <Option key={model.id} value={model.id}>
                {model.name}
                {' '}
                -
                {model.description}
              </Option>
            ))}
          </Select>
        </Form.Item>
      </div>
    )
  }

  // 渲染步骤3：多数据集配置
  const renderMultiDatasetStep = () => {
    return (
      <div>
        <Title level={5}>多数据集配置</Title>
        <Paragraph>配置微调任务所需的多数据集。</Paragraph>

        <Form.Item
          name="datasets"
          rules={[
            { required: true, message: '请至少选择一个数据集' },
            {
              validator: (_, value) => {
                if (!value || value.length === 0) {
                  return Promise.reject(new Error('请至少选择一个数据集'))
                }
                const totalRatio = value.reduce((sum: number, ds: DatasetConfig) => sum + (ds.ratio || 0), 0)
                if (totalRatio !== 100) {
                  return Promise.reject(new Error('数据集比例总和必须等于100%'))
                }
                return Promise.resolve()
              },
            },
          ]}
        >
          <MultiDatasetSelector
            availableDatasets={datasets}
            disabled={loading}
          />
        </Form.Item>

        <Form.Item
          name="validation_config"
          rules={[
            { required: true, message: '请配置验证集' },
            {
              validator: (_, value) => {
                if (!value) {
                  return Promise.reject(new Error('请配置验证集'))
                }

                // 验证分割模式的配置
                if (value.type === 'split') {
                  if (!value.split_ratio || value.split_ratio < 5 || value.split_ratio > 30) {
                    return Promise.reject(new Error('验证集分割比例必须在5%-30%之间'))
                  }
                }

                // 验证平台验证集模式的配置
                if (value.type === 'platform') {
                  if (!value.platform_datasets || value.platform_datasets.length === 0) {
                    return Promise.reject(new Error('请至少选择一个平台验证集'))
                  }

                  // 检查是否与训练数据集重复
                  const trainDatasets = formState.datasets || []
                  const trainDatasetIds = new Set(trainDatasets.map((d: DatasetConfig) => d.id))
                  const hasOverlap = value.platform_datasets.some((v: DatasetConfig) => trainDatasetIds.has(v.id))
                  if (hasOverlap) {
                    return Promise.reject(new Error('验证集不能与训练数据集重复'))
                  }

                  // 检查验证集数据规模合理性
                  const totalTrainRecords = trainDatasets.reduce((sum: number, ds: DatasetConfig) => sum + ds.record_count, 0)
                  const totalValidationRecords = value.platform_datasets.reduce((sum: number, ds: DatasetConfig) => sum + ds.record_count, 0)
                  const validationRatio = totalValidationRecords / totalTrainRecords

                  if (validationRatio > 0.5) {
                    return Promise.reject(new Error('验证集数据量不应超过训练集的50%'))
                  }
                  if (validationRatio < 0.05) {
                    return Promise.reject(new Error('验证集数据量不应少于训练集的5%'))
                  }
                }

                return Promise.resolve()
              },
            },
          ]}
        >
          <ValidationConfigComponent
            availableValidationDatasets={validationDatasets}
            selectedTrainingDatasets={formState.datasets || []}
            disabled={loading}
          />
        </Form.Item>
      </div>
    )
  }

  // 渲染步骤4：配置与超参数
  const renderHyperparametersStep = () => {
    return (
      <div>
        <Title level={5}>设置超参数</Title>
        <Paragraph>配置微调任务的超参数和输出模型名称。</Paragraph>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name={['hyperparameters', 'learning_rate']}
              label="学习率"
              initialValue={0.0001}
              rules={[{ required: true, message: '请输入学习率' }]}
            >
              <InputNumber
                min={0.000001}
                max={1}
                step={0.00001}
                className="w-full"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name={['hyperparameters', 'epochs']}
              label="训练轮次"
              initialValue={3}
              rules={[{ required: true, message: '请输入训练轮次' }]}
            >
              <InputNumber
                min={1}
                max={100}
                step={1}
                className="w-full"
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name={['hyperparameters', 'batch_size']}
              label="批大小"
              initialValue={4}
              rules={[{ required: true, message: '请输入批大小' }]}
            >
              <InputNumber
                min={1}
                max={128}
                step={1}
                className="w-full"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name={['hyperparameters', 'optimizer']}
              label="优化器"
              initialValue="adamw"
              rules={[{ required: true, message: '请选择优化器' }]}
            >
              <Select placeholder="请选择优化器">
                <Option value="adamw">AdamW (推荐)</Option>
                <Option value="adam">Adam</Option>
                <Option value="sgd">SGD</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name={['hyperparameters', 'warmup_ratio']}
          label="预热比例"
          initialValue={0.03}
          tooltip="预热阶段占总训练步数的比例"
        >
          <InputNumber
            min={0}
            max={0.5}
            step={0.01}
            className="w-full"
          />
        </Form.Item>

        <Form.Item
          name={['hyperparameters', 'weight_decay']}
          label="权重衰减"
          initialValue={0.01}
          tooltip="权重正则化系数"
        >
          <InputNumber
            min={0}
            max={0.1}
            step={0.001}
            className="w-full"
          />
        </Form.Item>

        <Divider />

        <Form.Item
          name="output_model_name"
          label="输出模型名称"
          rules={[
            { required: true, message: '请输入输出模型名称' },
            { min: 2, message: '模型名称至少2个字符' },
            { max: 50, message: '模型名称最多50个字符' },
            {
              pattern: /^[a-zA-Z0-9\u4E00-\u9FA5_-]+$/,
              message: '模型名称只能包含中文、英文、数字、下划线和连字符',
            },
          ]}
        >
          <Input
            placeholder="请输入输出模型名称，如：my-finetune-model"
            showCount
            maxLength={50}
          />
        </Form.Item>
      </div>
    )
  }

  // 渲染步骤5：资源分配
  const renderResourceAllocationStep = () => {
    return (
      <div>
        <Title level={5}>GPU资源配置</Title>
        <Paragraph>选择GPU节点和配置训练所需的GPU资源。系统将根据您的选择自动分配相应的计算资源。</Paragraph>

        <Card title="GPU资源配置" size="small" className="mb-4">
          <Form.Item
            name={['resource_requirements', 'gpu']}
            label="GPU资源"
            rules={[
              { required: true, message: '请配置GPU资源' },
              {
                validator: (_, value) => {
                  if (!value || !value.node_name) {
                    return Promise.reject(new Error('请选择GPU节点'))
                  }
                  if (!value.type) {
                    return Promise.reject(new Error('请选择GPU类型'))
                  }
                  if (!value.count || value.count < 1) {
                    return Promise.reject(new Error('请设置GPU数量'))
                  }
                  return Promise.resolve()
                },
              },
            ]}
          >
            <GPUResourceSelector />
          </Form.Item>
        </Card>

        <Card title="发布模型" size="small" className="mb-4">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name={['resource_requirements', 'model_publish', 'auto_publish']}
                label="自动发布"
                initialValue={false}
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
              <div className="text-[var(--lab-color-text-muted)] text-[12px] mt-1">
                支持自动发布训练完成后的模型
              </div>
            </Col>
            <Col span={8}>
              <Form.Item
                name={['resource_requirements', 'model_publish', 'publish_mode']}
                label="发布方式"
                initialValue="new_model"
                rules={[{ required: true, message: '请选择发布方式' }]}
              >
                <Select placeholder="请选择发布方式">
                  <Option value="new_model">新模型</Option>
                  <Option value="existing_model_version">已有模型新版本</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16} className="mt-4">
            <Col span={8}>
              <Form.Item
                noStyle
                shouldUpdate={(prevValues, curValues) =>
                  prevValues?.resource_requirements?.model_publish?.publish_mode
                  !== curValues?.resource_requirements?.model_publish?.publish_mode}
              >
                {({ getFieldValue }) => {
                  const publishMode = getFieldValue(['resource_requirements', 'model_publish', 'publish_mode'])

                  if (publishMode === 'new_model') {
                    return (
                      <Form.Item
                        name={['resource_requirements', 'model_publish', 'model_name']}
                        label="模型名称"
                        rules={[
                          { required: true, message: '请输入模型名称' },
                          { min: 2, message: '模型名称至少2个字符' },
                          { max: 50, message: '模型名称最多50个字符' },
                        ]}
                      >
                        <Input
                          placeholder="请输入模型名称"
                          showCount
                          maxLength={50}
                        />
                      </Form.Item>
                    )
                  }
                  else {
                    return (
                      <Form.Item
                        name={['resource_requirements', 'model_publish', 'existing_model_id']}
                        label="选择已有模型"
                        rules={[
                          { required: true, message: '请选择已有模型' },
                        ]}
                      >
                        <Select
                          placeholder="请选择已有模型"
                          showSearch
                          filterOption={(input, option) =>
                            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                          options={publishedModels.map((model) => ({
                            value: model.id,
                            label: model.name,
                            extra: model,
                          }))}
                          optionRender={(option) => (
                            <div>
                              <div className="font-bold">{option.data.extra.name}</div>
                              <div className="text-[12px] text-[var(--lab-color-text-muted)]">
                                {option.data.extra.description}
                              </div>
                              <div className="text-[11px] text-[var(--lab-color-placeholder)]">
                                版本:
                                {' '}
                                {option.data.extra.latest_version}
                                {' '}
                                |
                                类型:
                                {' '}
                                {option.data.extra.model_type === 'text_generation' ? '文本生成' : option.data.extra.model_type}
                              </div>
                            </div>
                          )}
                        />
                      </Form.Item>
                    )
                  }
                }}
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name={['resource_requirements', 'model_publish', 'model_type']}
                label="模型类型"
                initialValue="text_generation"
                rules={[{ required: true, message: '请选择模型类型' }]}
              >
                <Select placeholder="请选择模型类型">
                  <Option value="text_generation">文本生成</Option>
                  <Option value="text_classification">文本分类</Option>
                  <Option value="question_answering">问答系统</Option>
                  <Option value="summarization">文本摘要</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name={['resource_requirements', 'model_publish', 'context_length']}
                label="上下文长度"
                initialValue={8192}
                rules={[{ required: true, message: '请输入上下文长度' }]}
              >
                <Select placeholder="请选择上下文长度">
                  <Option value={2048}>2K</Option>
                  <Option value={4096}>4K</Option>
                  <Option value={8192}>8K</Option>
                  <Option value={16384}>16K</Option>
                  <Option value={32768}>32K</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16} className="mt-4">
            <Col span={24}>
              <Form.Item
                name={['resource_requirements', 'model_publish', 'version_description']}
                label="版本描述"
              >
                <Input.TextArea
                  placeholder="请输入版本描述"
                  rows={3}
                  maxLength={300}
                  showCount
                />
              </Form.Item>
            </Col>
          </Row>
        </Card>

      </div>
    )
  }

  // 渲染步骤6：预览
  const renderPreviewStep = () => {
    // 首先获取当前表单值并更新状态
    const currentValues = form.getFieldsValue()
    const mergedValues = { ...formState, ...currentValues }

    return (
      <div>
        <Title level={5}>任务预览</Title>
        <Paragraph>请确认以下任务配置信息。</Paragraph>

        <Card title="基本信息" size="small" className="mb-4">
          <p>
            <strong>任务名称:</strong>
            {' '}
            {mergedValues.name || '未设置'}
          </p>
          <p>
            <strong>任务描述:</strong>
            {' '}
            {mergedValues.description || '无'}
          </p>
        </Card>

        <Card title="模型与数据" size="small" className="mb-4">
          <p>
            <strong>基础模型:</strong>
            {' '}
            {mergedValues.base_model || '未选择'}
          </p>
          <p>
            <strong>训练数据集:</strong>
            {' '}
            {mergedValues.datasets?.length > 0 ? mergedValues.datasets.map((ds) => `${ds.name} (${ds.format?.toUpperCase()})`).join(', ') : '未选择'}
          </p>
          <p>
            <strong>验证集配置:</strong>
            {' '}
            {
              (() => {
                const validationConfig = mergedValues.validation_config
                if (!validationConfig) return '未配置'

                if (validationConfig.type === 'split') {
                  return `从训练集分割 ${validationConfig.split_ratio}%`
                }
                else if (validationConfig.type === 'platform') {
                  const platformDatasets = validationConfig.platform_datasets
                  if (platformDatasets && platformDatasets.length > 0) {
                    return `平台验证集: ${platformDatasets.map((ds) => ds.name).join(', ')}`
                  }
                  return '使用平台验证集 (未选择)'
                }
                return '未配置'
              })()
            }
          </p>
        </Card>

        <Card title="资源配置" size="small" className="mb-4">
          <div className="mb-4">
            <Text strong>GPU资源:</Text>
            <div className="ml-4 mt-1">
              <p>
                <strong>GPU节点:</strong>
                {' '}
                {mergedValues.resource_requirements?.gpu?.node_name || '未设置'}
              </p>
              <p>
                <strong>GPU类型:</strong>
                {' '}
                {mergedValues.resource_requirements?.gpu?.type || '未设置'}
              </p>
              <p>
                <strong>GPU数量:</strong>
                {' '}
                {mergedValues.resource_requirements?.gpu?.count || 0}
              </p>
            </div>
          </div>
          <div>
            <Text strong>模型发布:</Text>
            <div className="ml-4 mt-1">
              <p>
                <strong>自动发布:</strong>
                {' '}
                {mergedValues.resource_requirements?.model_publish?.auto_publish ? '是' : '否'}
              </p>
              <p>
                <strong>发布方式:</strong>
                {' '}
                {mergedValues.resource_requirements?.model_publish?.publish_mode === 'new_model' ? '新模型' : '已有模型新版本'}
              </p>
              {mergedValues.resource_requirements?.model_publish?.publish_mode === 'new_model' ? (
                <p>
                  <strong>模型名称:</strong>
                  {' '}
                  {mergedValues.resource_requirements?.model_publish?.model_name || '未设置'}
                </p>
              ) : (
                <p>
                  <strong>选择的模型:</strong>
                  {' '}
                  {
                    publishedModels.find((m) => m.id === mergedValues.resource_requirements?.model_publish?.existing_model_id)?.name || '未选择'
                  }
                </p>
              )}
              <p>
                <strong>模型类型:</strong>
                {' '}
                {mergedValues.resource_requirements?.model_publish?.model_type || '未设置'}
              </p>
              <p>
                <strong>上下文长度:</strong>
                {' '}
                {mergedValues.resource_requirements?.model_publish?.context_length || '未设置'}
              </p>
              {mergedValues.resource_requirements?.model_publish?.version_description && (
                <p>
                  <strong>版本描述:</strong>
                  {' '}
                  {mergedValues.resource_requirements.model_publish.version_description}
                </p>
              )}
            </div>
          </div>
        </Card>

        <Card title="超参数" size="small" className="mb-4">
          <p>
            <strong>学习率:</strong>
            {' '}
            {mergedValues.hyperparameters?.learning_rate || '未设置'}
          </p>
          <p>
            <strong>训练轮次:</strong>
            {' '}
            {mergedValues.hyperparameters?.epochs || '未设置'}
          </p>
          <p>
            <strong>批大小:</strong>
            {' '}
            {mergedValues.hyperparameters?.batch_size || '未设置'}
          </p>
          <p>
            <strong>优化器:</strong>
            {' '}
            {mergedValues.hyperparameters?.optimizer || '未设置'}
          </p>
          <p>
            <strong>输出模型名称:</strong>
            {' '}
            {mergedValues.output_model_name || '未设置'}
          </p>
        </Card>
      </div>
    )
  }

  // 渲染步骤内容
  const renderStepContent = () => {
    switch (current) {
      case 0: return renderBasicInfoStep()
      case 1: return renderModelAndDataStep()
      case 2: return renderMultiDatasetStep()
      case 3: return renderHyperparametersStep()
      case 4: return renderResourceAllocationStep()
      case 5: return renderPreviewStep()
      default: return null
    }
  }

  // 渲染底部按钮
  const renderFooter = () => {
    return (
      <div className="steps-action">
        <Space>
          <Button onClick={handleCancel}>
            取消
          </Button>
          {current > 0 && (
            <Button onClick={handlePrev}>
              上一步
            </Button>
          )}
          {current < 5 && (
            <Button type="primary" onClick={handleNext}>
              下一步
            </Button>
          )}
          {current === 5 && (
            <Button
              type="primary"
              onClick={handleSubmit}
              loading={loading}
              icon={<RocketOutlined />}
            >
              创建任务
            </Button>
          )}
        </Space>
      </div>
    )
  }

  const steps = [
    {
      title: '基本信息',
      icon: <AppstoreOutlined />,
    },
    {
      title: '模型与数据',
      icon: <DatabaseOutlined />,
    },
    {
      title: '多数据集配置',
      icon: <DatabaseOutlined />,
    },
    {
      title: '超参数配置',
      icon: <SettingOutlined />,
    },
    {
      title: '资源分配',
      icon: <AppstoreOutlined />,
    },
    {
      title: '预览',
      icon: <EyeOutlined />,
    },
  ]

  return (
    <div className="create-finetune-task-container create-form-page">
      <section className="create-form-card">
        <CreateFormPageHeader title="创建微调任务" onBack={handleCancel} />
        <div className="create-form-divider" />
        <div className="create-form-body">

          {renderProjectWarning()}

          <Steps current={current} className="mb-6">
            {steps.map((item, index) => (
              <Step key={index} title={item.title} icon={item.icon} />
            ))}
          </Steps>

          <Form
            form={form}
            layout="vertical"
            onValuesChange={handleFormValuesChange}
            initialValues={formState}
          >
            <div className="steps-content">
              {renderStepContent()}
            </div>

            {renderFooter()}
          </Form>
        </div>
      </section>
    </div>
  )
}

export default CreateFinetuneTask
