import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Cascader, Col, DatePicker, Form, Input, Radio, Row, Select, Space, Switch, TimePicker, Tooltip, Typography, message } from 'antd'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { finetuneTaskService } from '@/services/FinetuneTrainingServices'
import { ModelService } from '@/services/modelsApi'
import type { CreateTrainedModelParams } from '@/types/model'
import { ModelTypeMapping, TrainingMethodTypeMapping } from '@/utils/EnumMaping'
import ResourceConfig from '@/components/finetune/ResourceConfig'
import { SourceFromNotebookForm, notebookFolderPathFromCascaderValue } from '@/components/models/SourceFromNotebookForm'
import { notebookService } from '@/services/notebookService'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'
import { useConfigStore } from '@/stores/configStore'

const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input
const pickBelleResourceValue = (...values: any[]) => values.find((value) => value !== undefined && value !== null && value !== '' && value !== 0)
const getTrainingMethodType = (task: any) => String(
  task?.training_method_type
  ?? task?.train_method_type
  ?? task?.training_type?.training_method_type
  ?? task?.training_type?.train_method_type
  ?? '',
).toLowerCase()
const isLoraTrainingTask = (task: any) => task?.training_type?.fine_tuning_type?.toLowerCase() === 'lora'
const needsResourceConfig = (task: any) => isLoraTrainingTask(task) || getTrainingMethodType(task) === 'grpo'
const getTrainingMethodText = (task: any) => {
  const method = getTrainingMethodType(task)
  return TrainingMethodTypeMapping(method).text || method || '-'
}

interface ModelSource {
  id: string
  name: string
  icon: string
  description?: string
}
// 模型来源
interface ModelSource {
  id: string
  name: string
  icon: string
  description?: string
}
const CreateModelPage: React.FC = () => {
  const { projectId } = useParams<{
    projectId: string
  }>()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const queryClient = useQueryClient()
  const trainingTaskChangeReqIdRef = useRef(0)
  const { config, providerType } = useConfigStore()
  const [allocatableResources, setAllocatableResources] = useState<any>(undefined)
  // 训练类型
  const [TrainingTypeCategory, setTrainingTypeCategory] = useState(null)
  // 模型提供商
  const [ModelProviderCategory, setModelProviderCategory] = useState(null)
  // 模型类型
  const [ModelTypeCategory, setModelTypeCategory] = useState(null)
  // 模型训练方式
  const [TrainingMethodCategory, setTrainingMethodCategory] = useState(null)
  // 训练任务数据
  const [cascaderOptions, setCascaderOptions] = useState<any[]>([])
  // checkpoint
  const [checkpoint, setCheckpoint] = useState<any[]>([])
  // checkpoint加载状态
  const [isCheckpointLoading, setIsCheckpointLoading] = useState(false)
  // 训练任务
  const [trainingTask, setTrainingTask] = useState<any>({})
  // 提交loading状态
  const [isSubmitting, setIsSubmitting] = useState(false)
  const scheduleEnabled = Form.useWatch('schedule_enabled', form) ?? false
  // 模型来源
  const model_source = Form.useWatch('model_source', form)
  const model_type = Form.useWatch('model_type', form)
  useEffect(() => {
    if (model_source === 'training') {
      form.setFieldsValue({
        notebook_id: undefined,
        notebook_path: undefined,
        model_path: undefined,
      })
    }
  }, [model_source, form])
  useEffect(() => {
    const fetchProjectEnumValues = async () => {
      form.setFieldsValue({
        model_type: 'text-generation',
      })
      const cachedEnumValues = JSON.parse(localStorage.getItem('projectEnumValues') || '{}')
      if (cachedEnumValues) {
        setTrainingTypeCategory(cachedEnumValues.all_enums.find((item) => item.enum_name === 'TrainingTypeCategory'))
        setModelProviderCategory(cachedEnumValues.all_enums.find((item) => item.enum_name === 'ModelProvider'))
        setModelTypeCategory(cachedEnumValues.all_enums.find((item) => item.enum_name === 'ModelType'))
        setTrainingMethodCategory(cachedEnumValues.all_enums.find((item) => item.enum_name === 'TrainingMethodType'))
      }
    }
    fetchProjectEnumValues()
    form.setFieldsValue({
      model_source: 'training',
    })
  }, [])
  const { data: trainingTasks, isLoading } = useQuery({
    queryKey: ['finetuneRuns', projectId, model_type],
    queryFn: async () => {
      const response = await finetuneTaskService.get(Number(projectId), {
        train_type_category: model_type,
        page: 1,
        size: 50,
      })
      const options = response.items.map((item: any) => ({
        label: item.task_name,
        value: item.task_name,
        isLeaf: false,
      }))
      setCascaderOptions(options)
      return response
    },
    enabled: !!projectId && !isNaN(Number(projectId)),
  })
  useEffect(() => {
    if (trainingTasks) {
      const options = trainingTasks.items.map((item: any) => ({
        label: item.task_name,
        value: item.task_name,
        isLeaf: false,
      }))
      setCascaderOptions(options)
    }
  }, [trainingTasks])
  /**
   * 处理创建模型表单提交
   * @param values 表单提交的值
   */
  const handleCreateModel = async (values: any) => {
    if (!projectId)
      return
    const resource = values.graphics_card_resource
    const gpuType = values.gpu_type
    const gpuModel = values.gpu_model ?? ''
    const gpuMemory = values.gpu_memory
    const gpuCount = values.gpu_count ?? 1
    const k8sResourceType = values.k8s_resource_type ?? 'nvidia.com/gpu'
    const isBelleProvider = config?.PROVIDER_TYPE === providerType
    const belleResource = isBelleProvider ? allocatableResources : undefined
    const cpuLimit = isBelleProvider
      ? pickBelleResourceValue(resource?.cpu_limit, belleResource?.cpu)
      : Number(resource?.cpu_limit)
    const memoryLimit = isBelleProvider
      ? pickBelleResourceValue(resource?.memory_limit, belleResource?.memory)
      : Number(resource?.memory_limit)
    // belle 环境的显卡资源字段与训练创建页保持一致，非 belle 保留模型管理原有格式。
    const cardMemory = isBelleProvider
      ? gpuMemory
      : ((gpuMemory != null && gpuMemory !== '') ? `${Number(gpuMemory)}GB` : '')
    const cardModel = isBelleProvider ? pickBelleResourceValue(belleResource?.gpu_model, gpuModel) : gpuModel
    const taskNeedsResourceConfig = needsResourceConfig(trainingTask)
    const hasValidResource = taskNeedsResourceConfig
      && trainingTask?.id
      && gpuType?.length >= 2
      && cardModel
      && cardMemory
      && resource
      && (!isBelleProvider || belleResource?.queue_group_id)
    const graphics_card_resource = hasValidResource ? {
      card_type: gpuType[0] ?? 'GPU',
      card_model: cardModel,
      count: Number(gpuCount) || 1,
      card_memory: cardMemory,
      k8s_resource_type: isBelleProvider ? gpuType[0] : k8sResourceType,
      ...(isBelleProvider && {
        cpu: cpuLimit,
        memory: memoryLimit,
        queue_group_id: belleResource?.queue_group_id,
      }),
      cpu_request: isBelleProvider ? resource.cpu_request : (Number(resource.cpu_request) ?? 0.5),
      cpu_limit: isBelleProvider ? cpuLimit : (Number(resource.cpu_limit) ?? 16),
      memory_request: isBelleProvider ? resource.memory_request : (Number(resource.memory_request) ?? 0.5),
      memory_limit: isBelleProvider ? memoryLimit : (Number(resource.memory_limit) ?? 16),
    }
      : undefined
    if (taskNeedsResourceConfig && trainingTask?.id && (!graphics_card_resource || !graphics_card_resource.card_model || !graphics_card_resource.card_memory)) {
      message.warning('请先选择显卡类型及型号，并确保资源配置完整后再提交')
      return
    }
    const backendData: CreateTrainedModelParams = {
      project_id: Number(projectId),
      name: values.name,
      model_version: values.version,
      description: values.description,
      model_type: values.model_type,
      model_source_type: values.model_source,
      model_path: values.model_path,
    }
    if (values.model_source === 'training') {
      const modelData = {
        checkpoint: values.checkpoint,
        project_id: Number(projectId),
        task_id: trainingTask.id,
        task_name: trainingTask.name,
        task_version: trainingTask.version,
        base_model_id: trainingTask?.base_model?.base_model_id,
        base_model_name: trainingTask?.base_model?.base_model_name,
        ...(graphics_card_resource && { graphics_card_resource }),
        ...(values.schedule_enabled && values.schedule_date && values.schedule_time && {
          schedule_at: `${dayjs(values.schedule_date).format('YYYY-MM-DD')}T${dayjs(values.schedule_time).format('HH:mm:ss')}`,
        }),
      }
      Object.assign(backendData, modelData)
    }
    else if (values.model_source === 'notebook') {
      backendData.notebook_id = values.notebook_id
      const notebook = await notebookService.getNotebookInstance(values.notebook_id, Number(projectId))
      backendData.notebook_name = notebook.instance_name
      backendData.notebook_path = `/${notebookFolderPathFromCascaderValue(values.notebook_path)}`
    }
    try {
      setIsSubmitting(true)
      await ModelService.CreateTrainedModel(backendData)
      message.success('创建模型成功')
      // 创建成功后返回到模型列表页面
      navigate(`/project/${projectId}/model`)
      queryClient.invalidateQueries({ queryKey: ['models', projectId] })
    }
    catch (error) {
      console.error('创建模型失败')
    }
    finally {
      setIsSubmitting(false)
    }
  }
  /**
   * 处理取消按钮点击
   */
  const handleCancel = () => {
    navigate(`/project/${projectId}/model`)
  }
  const loadData = async (selectedOptions: any[]) => {
    const targetOption = selectedOptions[selectedOptions.length - 1]
    if (targetOption.loading || targetOption.children?.length > 0) {
      return
    }
    try {
      // 设置加载状态
      targetOption.loading = true
      setCascaderOptions([...cascaderOptions])
      // 获取数据
      const response = await finetuneTaskService.getTaskVersions(Number(projectId), targetOption.value, '已完成')
      const options = response.filter((item: any) => item.status === 'completed' || item.status === '已完成')
      if (options.length === 0) {
        targetOption.children = [
          {
            label: '无可用版本',
            value: '无可用版本',
            isLeaf: true,
            disabled: true,
          },
        ]
      }
      else {
        // 设置子选项
        targetOption.children = options.map((item: any) => ({
          label: `${item.version} / ${getTrainingMethodText(item)} / ${item.base_model?.base_model_name || item.base_model_name || '-'} / ${item.status || '-'}`,
          value: item.version,
          isLeaf: true,
        }))
      }
      // 更新状态触发重新渲染
      targetOption.loading = false
      setCascaderOptions([...cascaderOptions])
    }
    catch (error) {
      console.error('加载版本数据失败:', error)
      message.error('加载版本数据失败')
      targetOption.loading = false
      setCascaderOptions([...cascaderOptions])
    }
  }
  // 处理训练任务选择变化
  const handleTrainingTaskChange = async (values: any[]) => {
    const reqId = ++trainingTaskChangeReqIdRef.current
    // 清空之前的checkpoint选项
    setCheckpoint([])
    setIsCheckpointLoading(false)
    setAllocatableResources(undefined)
    form.setFieldsValue({
      checkpoint: undefined,
      model_path: undefined,
    })
    // 如果没有选择完整路径，直接返回
    if (!values || values.length < 2) {
      setTrainingTask({})
      form.setFieldsValue({
        schedule_enabled: false,
        schedule_date: undefined,
        schedule_time: undefined,
        gpu_type: undefined,
        gpu_model: undefined,
        gpu_memory: undefined,
        k8s_resource_type: undefined,
        gpu_count: undefined,
        graphics_card_resource: undefined,
      })
      setAllocatableResources(undefined)
      return
    }
    const targetTaskName = values[values.length - 2]
    const targetVersion = values[values.length - 1]
    // 注意：Cascader 的 children 可能已缓存，loadData 未必会再次触发，
    // 因此这里不要依赖全局 modelVersionData（可能已过期），而是按当前 taskName 拉取版本详情。
    let versions: any[] = []
    try {
      if (projectId) {
        const response = await finetuneTaskService.getTaskVersions(Number(projectId), targetTaskName)
        versions = response.filter((item: any) => item.status === 'completed' || item.status === '已完成')
      }
    }
    catch (error) {
      console.error('加载版本数据失败:', error)
      message.error('加载版本数据失败')
      if (reqId === trainingTaskChangeReqIdRef.current) {
        setTrainingTask({})
        setCheckpoint([])
        setIsCheckpointLoading(false)
      }
      return
    }
    const selectedVersion = versions.find((item: any) => item.version === targetVersion && item.name === targetTaskName)
    setTrainingTask(selectedVersion || {})
    // 非 Lora 类型时清空定时配置
    const selectedVersionIsLora = isLoraTrainingTask(selectedVersion)
    if (!selectedVersionIsLora) {
      form.setFieldsValue({ schedule_enabled: false, schedule_date: undefined, schedule_time: undefined })
    }
    if (selectedVersion) {
      // 设置模型路径
      form.setFieldsValue({
        model_path: selectedVersion.model_output_path,
        training_method_type: getTrainingMethodType(selectedVersion),
      })
      // 创建模型时资源配置不从训练任务默认反填，用户需要重新选择。
      form.setFieldsValue({
        gpu_type: undefined,
        gpu_model: undefined,
        gpu_memory: undefined,
        k8s_resource_type: undefined,
        gpu_count: undefined,
        graphics_card_resource: undefined,
      })
      setAllocatableResources(undefined)
      // 调用接口获取checkpoint数据
      if (selectedVersion.id && projectId) {
        try {
          setIsCheckpointLoading(true)
          const checkpointData = await finetuneTaskService.getTaskCheckpoints(Number(projectId), selectedVersion.id)
          // 处理返回的checkpoint数据
          const checkpointOptions = Array.isArray(checkpointData) ? checkpointData.map((item: any) => ({
            value: item.name || item.value || item,
            name: item.name || item.value || item,
            label: item.name || item.value || item,
          }))
            : []
          if (reqId === trainingTaskChangeReqIdRef.current) {
            setCheckpoint(checkpointOptions)
          }
        }
        catch (error) {
          console.error('获取checkpoint数据失败:', error)
          message.error('获取checkpoint数据失败')
          if (reqId === trainingTaskChangeReqIdRef.current) {
            setCheckpoint([])
          }
        }
        finally {
          if (reqId === trainingTaskChangeReqIdRef.current) {
            setIsCheckpointLoading(false)
          }
        }
      }
    }
  }
  // 处理模型类型变化
  const handleModelTypeChange = (e: any) => {
    const selectedValue = e.target.value
    // 根据模型类型过滤训练任务
    const filteredTasks = trainingTasks?.items.filter((item: any) => item.training_type_category === selectedValue) || []
    // 更新级联选择器选项
    const options = filteredTasks.map((item: any) => ({
      label: item.task_name,
      value: item.task_name,
      isLeaf: false,
    }))
    setCascaderOptions(options)
    // 清空相关状态
    setCheckpoint([])
    setTrainingTask({})
    // 清空表单中已选择的训练任务及资源配置
    form.setFieldsValue({
      trainingTask: undefined,
      model_path: undefined,
      checkpoint: undefined,
      gpu_type: undefined,
      gpu_model: undefined,
      gpu_memory: undefined,
      k8s_resource_type: undefined,
      gpu_count: undefined,
      graphics_card_resource: undefined,
    })
    setAllocatableResources(undefined)
  }
  // 处理模型训练方式变化
  const handleTrainingMethodTypeChange = (value: any) => {
    // 根据训练方式过滤训练任务
    const filteredTasks = trainingTasks?.items.filter((item: any) => item.training_method_type === value) || []
    // 更新级联选择器选项
    const options = filteredTasks.map((item: any) => ({
      label: item.task_name,
      value: item.task_name,
      isLeaf: false,
    }))
    setCascaderOptions(options)
    // 清空相关状态
    setCheckpoint([])
    setTrainingTask({})
    // 清空训练任务相关；资源配置保留（切换训练方法不清空显卡/CPU 内存配置）
    form.setFieldsValue({
      trainingTask: undefined,
      model_path: undefined,
      checkpoint: undefined,
    })
  }
  const taskNeedsResourceConfig = needsResourceConfig(trainingTask)
  const taskSupportsSchedule = isLoraTrainingTask(trainingTask)
  return (
    <div className="create-form-page">
      <section className="create-form-card">
        <CreateFormPageHeader
          title="创建模型"
          onBack={handleCancel}
          actions={(
            <>
              <Button className="create-form-cancel" onClick={handleCancel}>
                取消
              </Button>
              <Button className="create-form-submit" type="primary" onClick={() => form.submit()} loading={isSubmitting}>
                确定
              </Button>
            </>
          )}
        />
        <div className="create-form-divider" />
        <Form form={form} layout="horizontal" labelAlign="left" className="create-form-body" labelCol={{ span: 3 }} wrapperCol={{ span: 21 }} onFinish={handleCreateModel} initialValues={{ version: 'V1' }}>
          {/* 基础信息部分 */}
          <div className="mb-[16px] p-[24px] rounded-[8px]" style={{ border: '1px solid #f0f0f0' }}>
            <Title level={4} className="mb-4">基础信息</Title>

            <Form.Item
              label="模型名称"
              name="name"
              rules={[
                { required: true, message: '请输入模型名称' },
                {
                  validator: (_, value?: string) => {
                    if (!value) {
                      return Promise.resolve()
                    }
                    if (!/^[a-zA-Z0-9_.-]{1,96}$/.test(value)) {
                      return Promise.reject(new Error('仅支持字母、数字、连字符(-)、下划线(_)和点号(.)，最多96个字符'))
                    }
                    if (/--|\.\./.test(value)) {
                      return Promise.reject(new Error('不能包含连续的 -- 或 ..'))
                    }
                    if (/^[-.]|[-.]$/.test(value)) {
                      return Promise.reject(new Error('不能以 - 或 . 开头/结尾'))
                    }
                    return Promise.resolve()
                  },
                },
              ]}
              validateTrigger={['onChange', 'onBlur']}
              extra="仅支持字母、数字、连字符(-)、下划线(_)和点号(.)，不能包含连续的 -- 或 ..，不能以 - 或 . 开头/结尾，最多96个字符"
            >
              <TextArea className="w-[400px]" placeholder="请输入模型名称" maxLength={96} autoSize />
            </Form.Item>

            <Form.Item name="version" label="模型版本">
              <Text>V1</Text>
            </Form.Item>

            <Form.Item name="description" label="模型描述" rules={[{ max: 1000, message: '描述不能超过1000个字符' }]}>
              <TextArea className="w-[400px]" rows={3} placeholder="请输入模型描述，1000字以内" maxLength={1000} showCount />
            </Form.Item>
          </div>

          {/* 模型配置部分 */}
          <div className="p-[24px] rounded-[8px] mb-[50px]" style={{ border: '1px solid #f0f0f0' }}>
            <Title level={4} className="mb-4">模型配置</Title>

            <Form.Item name="model_source" label="模型来源" rules={[{ required: true, message: '请选择模型来源' }]}>
              <Radio.Group>
                <Radio.Button value="training">大模型训练</Radio.Button>
                {config?.PROVIDER_TYPE !== providerType && <Radio.Button value="notebook">Notebook</Radio.Button>}
              </Radio.Group>
            </Form.Item>

            <Form.Item name="model_type" label="模型类型" rules={[{ required: true, message: '请选择模型类型' }]}>
              <Radio.Group onChange={handleModelTypeChange}>
                {ModelTypeCategory?.options.map((item: any) => (['text-generation', 'image-generation', 'image-understanding'].includes(item.value) && (
                  <Radio.Button key={item.value} value={item.value}>
                    {ModelTypeMapping(item.value).text}
                    {ModelTypeMapping(item.value).disabled && (
                      <Tooltip title={ModelTypeMapping(item.value).disabledTooltip}>
                      </Tooltip>
                    )}
                  </Radio.Button>
                )))}
              </Radio.Group>
            </Form.Item>

            {model_source === 'notebook' && <SourceFromNotebookForm />}

            {model_source === 'training' && (
              <>
                <Form.Item name="trainingTask" label="训练任务" rules={[{ required: true, message: '请选择训练任务' }]} tooltip="可选已运行成功的任务版本">
                  <Cascader className="w-[400px]" options={cascaderOptions} showCheckedStrategy={Cascader.SHOW_CHILD} placeholder="请选择训练任务" loadData={loadData} onChange={handleTrainingTaskChange} changeOnSelect loading={isLoading} />
                </Form.Item>

                <Form.Item name="training_method_type" label="模型训练方法" rules={[{ required: true, message: '请选择模型训练方式' }]}>
                  <Select placeholder="请选择模型训练方式" className="w-[400px]" onChange={handleTrainingMethodTypeChange}>
                    {TrainingMethodCategory?.options.map((item: any) => (!TrainingMethodTypeMapping(item.value).disabled && (
                      <Option key={item.value} value={item.value} disabled={TrainingMethodTypeMapping(item.value).disabled}>
                        {TrainingMethodTypeMapping(item.value).text}
                        {TrainingMethodTypeMapping(item.value).disabled && (<Tooltip title={TrainingMethodTypeMapping(item.value).disabledTooltip} />)}
                      </Option>
                    )))}
                  </Select>
                </Form.Item>

                {taskNeedsResourceConfig && (
                  <Form.Item label="资源配置" className="mb-0">
                    <ResourceConfig
                      projectId={projectId ? Number(projectId) : undefined}
                      skipLocalStorageEcho
                      onAllocatableResourcesChange={setAllocatableResources}
                    />
                  </Form.Item>
                )}

                {taskSupportsSchedule && (
                  <Form.Item label="任务定时配置">
                    <Space direction="vertical" className="w-full">
                      <Form.Item name="schedule_enabled" valuePropName="checked" className="mb-0" initialValue={false}>
                        <Switch
                          checked={scheduleEnabled}
                          onChange={(checked) => {
                            form.setFieldsValue({ schedule_enabled: checked })
                            if (!checked) {
                              form.setFieldsValue({ schedule_date: undefined, schedule_time: undefined })
                            }
                          }}
                        />
                      </Form.Item>
                      {scheduleEnabled && (
                        <Row gutter={16}>
                          <Col span={8}>
                            <Form.Item name="schedule_date" label="执行时间" rules={scheduleEnabled ? [{ required: true, message: '请选择日期' }] : []}>
                              <DatePicker className="w-full" placeholder="请选择日期" format="YYYY-MM-DD" disabledDate={(current) => current && current < dayjs().startOf('day')} />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item name="schedule_time" label=" " rules={scheduleEnabled ? [{ required: true, message: '请选择时间' }] : []}>
                              <TimePicker className="w-full" placeholder="请选择时间" format="HH:mm:ss" />
                            </Form.Item>
                          </Col>
                        </Row>
                      )}
                    </Space>
                  </Form.Item>
                )}

                <Form.Item name="model_path" label="模型路径" hidden>
                  <Input placeholder="请输入模型路径" className="w-[400px]" />
                </Form.Item>

                <Form.Item name="checkpoint" label="Checkpoint" rules={[{ required: true, message: '请选择step' }]}>
                  <Select placeholder="请选择step" className="w-[400px]" loading={isCheckpointLoading} disabled={isCheckpointLoading || checkpoint.length === 0}>
                    {checkpoint.map((item: any) => (
                      <Option key={item.value} value={item.value}>
                        {item.name || item.label}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </>
            )}
          </div>
        </Form>
      </section>
    </div>
  )
}
export default CreateModelPage
