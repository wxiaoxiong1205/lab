import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Cascader, Col, DatePicker, Form, Input, Row, Select, Space, Switch, TimePicker, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { finetuneTaskService } from '@/services/FinetuneTrainingServices'
import { ModelService } from '@/services/modelsApi'
import type { CreateTrainedModelParams, GraphicsCardResourcePayload } from '@/types/model'
import ResourceConfig from '@/components/finetune/ResourceConfig'
import { SourceFromNotebookForm, notebookFolderPathFromCascaderValue } from '@/components/models/SourceFromNotebookForm'
import { notebookService } from '@/services/notebookService'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'
import { useConfigStore } from '@/stores/configStore'
/** 根据任务/模型保存的 graphics_card_resource 反填表单（与 CreateModelPage 一致） */
const pickBelleResourceValue = (...values: any[]) => values.find((value) => value !== undefined && value !== null && value !== '' && value !== 0)

function applyGraphicsResourceToForm(form: ReturnType<typeof Form.useForm>[0], resource: any, isBelleProvider = false) {
  if (!resource)
    return
  const gpuMemory = !isBelleProvider && typeof resource.card_memory === 'string'
    ? parseInt(resource.card_memory.replace(/\D/g, ''), 10) || 0
    : resource.card_memory
  form.setFieldsValue({
    gpu_type: resource.card_type && resource.card_model ? [resource.card_type, resource.card_model] : undefined,
    gpu_model: resource.card_model,
    gpu_memory: gpuMemory,
    k8s_resource_type: resource.k8s_resource_type,
    gpu_count: resource.count ?? resource.gpu_count,
    graphics_card_resource: {
      cpu_request: resource.cpu_request,
      cpu_limit: isBelleProvider ? pickBelleResourceValue(resource.cpu_limit, resource.cpu) : resource.cpu_limit,
      memory_request: resource.memory_request,
      memory_limit: isBelleProvider ? pickBelleResourceValue(resource.memory_limit, resource.memory) : resource.memory_limit,
    },
    // model_source: resource.modelSource,
    notebook_id: resource.notebook_id,
    // notebook_path: resource.notebook_path,
  })
}
function buildGraphicsCardResourceForSubmit(values: any, taskSelected: boolean, isBelleProvider = false, allocatableResources?: any): GraphicsCardResourcePayload | undefined {
  const resource = values.graphics_card_resource
  const gpuType = values.gpu_type
  const gpuModel = values.gpu_model ?? ''
  const gpuMemory = values.gpu_memory
  const gpuCount = values.gpu_count ?? 1
  const k8sResourceType = values.k8s_resource_type ?? 'nvidia.com/gpu'
  const cpuLimit = isBelleProvider ? pickBelleResourceValue(resource?.cpu_limit, allocatableResources?.cpu) : Number(resource?.cpu_limit)
  const memoryLimit = isBelleProvider ? pickBelleResourceValue(resource?.memory_limit, allocatableResources?.memory) : Number(resource?.memory_limit)
  const cardMemory = isBelleProvider
    ? gpuMemory
    : ((gpuMemory != null && gpuMemory !== '') ? `${Number(gpuMemory)}GB` : '')
  const cardModel = isBelleProvider ? pickBelleResourceValue(allocatableResources?.gpu_model, gpuModel) : gpuModel
  const hasValid = taskSelected
    && gpuType?.length >= 2
    && cardModel
    && cardMemory
    && resource
    && (!isBelleProvider || allocatableResources?.queue_group_id)
  if (!hasValid)
    return undefined
  return {
    card_type: gpuType[0] ?? 'GPU',
    card_model: cardModel,
    count: Number(gpuCount) || 1,
    card_memory: cardMemory,
    k8s_resource_type: isBelleProvider ? gpuType[0] : k8sResourceType,
    ...(isBelleProvider && {
      cpu: cpuLimit,
      memory: memoryLimit,
      queue_group_id: allocatableResources?.queue_group_id,
    }),
    cpu_request: isBelleProvider ? resource.cpu_request : (Number(resource.cpu_request) ?? 0.5),
    cpu_limit: isBelleProvider ? cpuLimit : (Number(resource.cpu_limit) ?? 16),
    memory_request: isBelleProvider ? resource.memory_request : (Number(resource.memory_request) ?? 0.5),
    memory_limit: isBelleProvider ? memoryLimit : (Number(resource.memory_limit) ?? 128),
  }
}
const { TextArea } = Input
const { Option } = Select
const CreateVersionPage: React.FC = () => {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const { projectId } = useParams<{
    projectId: string
  }>()
  const [searchParams] = useSearchParams()
  const { modelName } = useParams<{
    modelName: string
  }>()
  const queryTaskName = searchParams.get('taskName') || undefined
  const isEditMode = searchParams.get('edit') === '1'
  const queryClient = useQueryClient()
  const taskVersionChangeReqIdRef = useRef(0)
  const { config, providerType } = useConfigStore()
  const isBelleProvider = config?.PROVIDER_TYPE === providerType
  const [allocatableResources, setAllocatableResources] = useState<any>(undefined)
  // 训练任务级联选项：任务名 -> 任务版本
  const [cascaderOptions, setCascaderOptions] = useState<any[]>([])
  // 已加载的当前任务版本列表
  const [selectedTaskVersions, setSelectedTaskVersions] = useState<any[]>([])
  // Checkpoint
  const [checkpoint, setcheckpoint] = useState<any[]>([])
  // checkpoint加载状态
  const [isCheckpointLoading, setIsCheckpointLoading] = useState(false)
  const [lastModelDetailInfo, setlastModelDetailInfo] = useState<any>(null)
  // 选择的版本信息
  const [selectedModelDetailInfo, setselectedModelDetailInfo] = useState<any>(null)
  const scheduleEnabled = Form.useWatch('schedule_enabled', form) ?? false
  const selectedTaskName = queryTaskName || lastModelDetailInfo?.task_name
  useEffect(() => {
    if (isEditMode) {
      const editData = localStorage.getItem('modelDetailInfoEdit')
      if (editData) {
        const record = JSON.parse(editData)
        setlastModelDetailInfo({ ...record, version: record.model_version })
      }
    }
    else {
      const modelDetailInfo = localStorage.getItem('modelDetailInfo')
      if (modelDetailInfo) {
        const modelDetailInfoData = JSON.parse(modelDetailInfo)
        const match = modelDetailInfoData.model_version?.match(/V?(\d+)/i)
        const latestVersion = match ? match[1] : '1'
        modelDetailInfoData.version = `V${parseInt(latestVersion) + 1}`
        setlastModelDetailInfo(modelDetailInfoData)
        if (modelDetailInfoData.model_source_type === 'notebook') {
          form.setFieldsValue({
            notebook_id: modelDetailInfoData.notebook_id,
          })
        }
      }
    }
  }, [isEditMode, form])
  useEffect(() => {
    if (lastModelDetailInfo?.model_source_type === 'training' && selectedTaskName) {
      setCascaderOptions([{
        label: selectedTaskName,
        value: selectedTaskName,
        isLeaf: false,
      }])
      return
    }
    setCascaderOptions([])
  }, [lastModelDetailInfo?.model_source_type, selectedTaskName])
  const getCompletedTaskVersions = useCallback((versions: any[]) =>
    versions.filter((item: any) => item.status === 'completed' || item.status === '已完成'), [])

  const mapTaskVersionOptions = useCallback((versions: any[]) => {
    const completedVersions = getCompletedTaskVersions(versions)
    if (completedVersions.length === 0) {
      return [
        {
          label: '无可用版本',
          value: '无可用版本',
          isLeaf: true,
          disabled: true,
        },
      ]
    }
    return completedVersions.map((item: any) => ({
      label: item.version,
      value: item.version,
      isLeaf: true,
    }))
  }, [getCompletedTaskVersions])

  const updateTaskChildren = useCallback((targetTaskName: string, versions: any[]) => {
    setCascaderOptions((prev) => prev.map((option) => (
      option.value === targetTaskName
        ? {
            ...option,
            loading: false,
            children: mapTaskVersionOptions(versions),
          }
        : option
    )))
  }, [mapTaskVersionOptions])

  const loadData = async (selectedOptions: any[]) => {
    const targetOption = selectedOptions[selectedOptions.length - 1]
    if (targetOption.loading || targetOption.children?.length > 0)
      return
    try {
      targetOption.loading = true
      setCascaderOptions([...cascaderOptions])
      const response = await finetuneTaskService.getTaskVersions(Number(projectId), targetOption.value, '已完成')
      updateTaskChildren(targetOption.value, response)
    }
    catch (error) {
      console.error('加载版本数据失败:', error)
      message.error('加载版本数据失败')
      targetOption.loading = false
      setCascaderOptions([...cascaderOptions])
    }
  }

  // 编辑模式：任务版本列表加载完成后，回显表单并拉取 checkpoint 选项
  useEffect(() => {
    if (!isEditMode || !lastModelDetailInfo || !selectedTaskName)
      return
    const loadEditTaskVersion = async () => {
      const editTaskName = selectedTaskName
      const editTaskVersion = lastModelDetailInfo?.task_version
      if (!projectId || !editTaskName || !editTaskVersion)
        return
      try {
        const versions = await finetuneTaskService.getTaskVersions(Number(projectId), editTaskName)
        const completedVersions = getCompletedTaskVersions(versions)
        setSelectedTaskVersions(completedVersions)
        updateTaskChildren(editTaskName, completedVersions)
        const taskRun = completedVersions.find((item: any) => item.version === editTaskVersion)
        if (!taskRun)
          return
        setselectedModelDetailInfo(taskRun)
        const rawSchedule = lastModelDetailInfo.schedule_at ?? (lastModelDetailInfo as any).scheduleAt
        let scheduleAt: dayjs.Dayjs | null = null
        if (rawSchedule != null && rawSchedule !== '') {
          const parsed = dayjs(rawSchedule)
          if (parsed.isValid())
            scheduleAt = parsed
        }
        form.setFieldsValue({
          description: lastModelDetailInfo.description ?? '',
          taskVersion: [editTaskName, editTaskVersion],
          checkpoint: lastModelDetailInfo.checkpoint ?? undefined,
          schedule_enabled: scheduleAt != null,
          ...(scheduleAt && {
            schedule_date: scheduleAt,
            schedule_time: scheduleAt,
          }),
        })
        // 编辑回显：已保存版本与任务运行记录合并（缺省字段用任务侧补全）
        const savedResource = (lastModelDetailInfo as any).graphics_card_resource
        const taskResource = taskRun?.graphics_card_resource
        const echoResource = savedResource || taskResource ? {
          ...taskResource,
          ...savedResource,
          card_type: savedResource?.card_type || taskResource?.card_type,
          card_model: savedResource?.card_model || taskResource?.card_model,
          card_memory: savedResource?.card_memory || taskResource?.card_memory,
          k8s_resource_type: savedResource?.k8s_resource_type || taskResource?.k8s_resource_type,
          count: savedResource?.count ?? savedResource?.gpu_count ?? taskResource?.count ?? taskResource?.gpu_count,
          cpu_request: savedResource?.cpu_request ?? taskResource?.cpu_request,
          cpu_limit: savedResource?.cpu_limit ?? taskResource?.cpu_limit,
          cpu: savedResource?.cpu ?? taskResource?.cpu,
          memory_request: savedResource?.memory_request ?? taskResource?.memory_request,
          memory_limit: savedResource?.memory_limit ?? taskResource?.memory_limit,
          memory: savedResource?.memory ?? taskResource?.memory,
          queue_group_id: savedResource?.queue_group_id ?? taskResource?.queue_group_id,
          gpu_model: savedResource?.gpu_model ?? taskResource?.gpu_model,
        }
          : undefined
        applyGraphicsResourceToForm(form, echoResource, isBelleProvider)
        setAllocatableResources(isBelleProvider && echoResource
          ? {
              gpu_model: echoResource.gpu_model || echoResource.card_model,
              cpu: echoResource.cpu,
              memory: echoResource.memory,
              queue_group_id: echoResource.queue_group_id,
            }
          : undefined)
        setIsCheckpointLoading(true)
        const checkpointData = await finetuneTaskService.getTaskCheckpoints(Number(projectId), taskRun.id)
        const options = Array.isArray(checkpointData) ? checkpointData.map((item: any) => ({
          value: item.name || item.value || item,
          label: item.name || item.value || item,
        }))
          : []
        setcheckpoint(options)
        form.setFieldsValue({ checkpoint: lastModelDetailInfo.checkpoint ?? undefined })
      }
      catch {
        message.error('获取 checkpoint 失败')
        setcheckpoint([])
      }
      finally {
        setIsCheckpointLoading(false)
      }
    }
    loadEditTaskVersion()
  }, [form, getCompletedTaskVersions, isBelleProvider, isEditMode, lastModelDetailInfo, projectId, selectedTaskName, updateTaskChildren])

  const handleTaskVersionChange = async (values: any[]) => {
    const reqId = ++taskVersionChangeReqIdRef.current
    // 清空之前的checkpoint选项
    setcheckpoint([])
    setIsCheckpointLoading(false)
    form.setFieldsValue({
      checkpoint: undefined,
    })
    if (!values || values.length < 2) {
      setSelectedTaskVersions([])
      setselectedModelDetailInfo(null)
      return
    }
    const targetTaskName = values[values.length - 2]
    const targetVersion = values[values.length - 1]
    let versions = selectedTaskVersions
    if (!versions.some((item: any) => item.name === targetTaskName || item.task_name === targetTaskName)) {
      try {
        const response = await finetuneTaskService.getTaskVersions(Number(projectId), targetTaskName)
        versions = getCompletedTaskVersions(response)
        setSelectedTaskVersions(versions)
        updateTaskChildren(targetTaskName, versions)
      }
      catch (error) {
        console.error('加载版本数据失败:', error)
        message.error('加载版本数据失败')
        return
      }
    }
    const modelVersion = versions.find((item: any) => item.version === targetVersion)
    if (reqId !== taskVersionChangeReqIdRef.current)
      return
    setselectedModelDetailInfo(modelVersion)
    if (modelVersion?.graphics_card_resource) {
      applyGraphicsResourceToForm(form, modelVersion.graphics_card_resource, isBelleProvider)
      setAllocatableResources(isBelleProvider
        ? {
            gpu_model: modelVersion.graphics_card_resource.gpu_model || modelVersion.graphics_card_resource.card_model,
            cpu: modelVersion.graphics_card_resource.cpu,
            memory: modelVersion.graphics_card_resource.memory,
            queue_group_id: modelVersion.graphics_card_resource.queue_group_id,
          }
        : undefined)
    }
    else {
      form.setFieldsValue({
        gpu_type: undefined,
        gpu_model: undefined,
        gpu_memory: undefined,
        k8s_resource_type: undefined,
        gpu_count: undefined,
        graphics_card_resource: undefined,
      })
      setAllocatableResources(undefined)
    }
    // 调用接口获取checkpoint数据
    if (modelVersion?.id && projectId) {
      try {
        setIsCheckpointLoading(true)
        const checkpointData = await finetuneTaskService.getTaskCheckpoints(Number(projectId), modelVersion.id)
        // 处理返回的checkpoint数据
        const checkpointOptions = Array.isArray(checkpointData) ? checkpointData.map((item: any) => ({
          value: item.name || item.value || item,
          label: item.name || item.value || item,
        }))
          : []
        if (reqId === taskVersionChangeReqIdRef.current)
          setcheckpoint(checkpointOptions)
      }
      catch (error) {
        console.error('获取checkpoint数据失败:', error)
        message.error('获取checkpoint数据失败')
        setcheckpoint([])
      }
      finally {
        if (reqId === taskVersionChangeReqIdRef.current)
          setIsCheckpointLoading(false)
      }
    }
  }
  const handleBack = () => {
    form.resetFields()
    if (isEditMode)
      localStorage.removeItem('modelDetailInfoEdit')
    navigate(`/project/${projectId}/model/${modelName}?activeTab=versions`)
  }
  const onEdit = async (values: any) => {
    const id = lastModelDetailInfo?.id
    if (id == null) {
      message.error('缺少训练模型 ID，无法提交')
      return
    }
    const scheduleAt = values.schedule_enabled && values.schedule_date && values.schedule_time
      ? `${dayjs(values.schedule_date).format('YYYY-MM-DD')}T${dayjs(values.schedule_time).format('HH:mm:ss')}`
      : undefined
    const isLora = selectedModelDetailInfo?.training_type?.fine_tuning_type?.toLowerCase() === 'lora'
    const graphics_card_resource = buildGraphicsCardResourceForSubmit(values, !!selectedModelDetailInfo?.id, isBelleProvider, allocatableResources)
    if (isLora && selectedModelDetailInfo?.id && (!graphics_card_resource || !graphics_card_resource.card_model || !graphics_card_resource.card_memory)) {
      message.warning('请先选择显卡类型及型号，并确保资源配置完整后再提交')
      return
    }
    const updateData: Partial<CreateTrainedModelParams> = {
      name: lastModelDetailInfo.name,
      model_type: selectedModelDetailInfo?.training_type?.train_type_category ?? lastModelDetailInfo.model_type,
      description: values.description,
      model_version: lastModelDetailInfo.version,
      model_path: selectedModelDetailInfo?.model_output_path ?? lastModelDetailInfo.model_path,
      project_id: Number(projectId),
      task_id: String(selectedModelDetailInfo?.id ?? lastModelDetailInfo.task_id),
      task_name: selectedModelDetailInfo?.name ?? lastModelDetailInfo.task_name,
      task_version: selectedModelDetailInfo?.version ?? lastModelDetailInfo.task_version,
      base_model_id: selectedModelDetailInfo?.base_model?.base_model_id ?? lastModelDetailInfo.base_model_id,
      base_model_name: selectedModelDetailInfo?.base_model?.base_model_name ?? lastModelDetailInfo.base_model_name,
      checkpoint: values.checkpoint ?? lastModelDetailInfo.checkpoint,
      ...(scheduleAt && { schedule_at: scheduleAt }),
      ...(graphics_card_resource && { graphics_card_resource }),
    }
    try {
      await ModelService.updateTrainedModel(id, updateData)
      message.success('编辑成功')
      localStorage.removeItem('modelDetailInfoEdit')
      navigate(`/project/${projectId}/model/${modelName}`)
      queryClient.invalidateQueries({ queryKey: ['modelList', projectId] })
      queryClient.invalidateQueries({ queryKey: ['modelVersions', projectId, modelName] })
    }
    catch (error) {
      console.error('Failed to update trained model:', error)
      // message.error('编辑失败')
    }
  }
  const onCreateVersion = async (values: any) => {
    const modelDetailInfoData = JSON.parse(localStorage.getItem('modelDetailInfo') || '{}')
    const scheduleAt = values.schedule_enabled && values.schedule_date && values.schedule_time
      ? `${dayjs(values.schedule_date).format('YYYY-MM-DD')}T${dayjs(values.schedule_time).format('HH:mm:ss')}`
      : undefined
    const isLora = selectedModelDetailInfo?.training_type?.fine_tuning_type?.toLowerCase() === 'lora'
    const graphics_card_resource = buildGraphicsCardResourceForSubmit(values, !!selectedModelDetailInfo?.id, isBelleProvider, allocatableResources)
    if (isLora && selectedModelDetailInfo?.id && (!graphics_card_resource || !graphics_card_resource.card_model || !graphics_card_resource.card_memory)) {
      message.warning('请先选择显卡类型及型号，并确保资源配置完整后再提交')
      return
    }
    const backendData: CreateTrainedModelParams = {
      project_id: Number(projectId),
      name: modelDetailInfoData.name,
      description: values.description,
      model_version: lastModelDetailInfo?.version,
      model_type: selectedModelDetailInfo?.training_type?.train_type_category || modelDetailInfoData.model_type,
      model_source_type: modelDetailInfoData.model_source_type,
    }
    if (modelDetailInfoData.model_source_type === 'training') {
      const modelData = {
        model_path: selectedModelDetailInfo?.model_output_path,
        task_id: String(selectedModelDetailInfo?.id),
        task_name: selectedModelDetailInfo?.name,
        task_version: selectedModelDetailInfo?.version,
        base_model_id: selectedModelDetailInfo?.base_model?.base_model_id,
        base_model_name: selectedModelDetailInfo?.base_model?.base_model_name,
        checkpoint: values.checkpoint,
        ...(scheduleAt && { schedule_at: scheduleAt }),
        ...(graphics_card_resource && { graphics_card_resource }),
        model_source_type: values.model_source,
      }
      Object.assign(backendData, modelData)
    }
    else if (modelDetailInfoData.model_source_type === 'notebook') {
      backendData.notebook_id = values.notebook_id
      const notebook = await notebookService.getNotebookInstance(values.notebook_id, Number(projectId))
      backendData.notebook_name = notebook.instance_name
      backendData.notebook_path = `/${notebookFolderPathFromCascaderValue(values.notebook_path)}`
    }
    try {
      await ModelService.CreateTrainedModel(backendData)
      message.success('创建版本成功')
      navigate(`/project/${projectId}/model/${modelName}`)
      queryClient.invalidateQueries({ queryKey: ['modelList', projectId] })
    }
    catch (error) {
      console.error('Failed to create version:', error)
      message.error('创建版本失败')
    }
  }
  const handleSubmit = async (values: any) => {
    if (isEditMode) {
      onEdit(values)
    }
    else {
      onCreateVersion(values)
    }
  }
  return (
    <div className="create-form-page">
      <section className="create-form-card">
        <CreateFormPageHeader
          title={isEditMode ? '编辑模型版本' : '新增模型版本'}
          onBack={handleBack}
          actions={(
            <>
              <Button className="create-form-cancel" onClick={handleBack}>取消</Button>
              <Button className="create-form-submit" type="primary" onClick={() => form.submit()}>
                确定
              </Button>
            </>
          )}
        />
        <div className="create-form-divider" />

        <Form form={form} layout="horizontal" labelAlign="left" className="create-form-body" labelCol={{ span: 3 }} wrapperCol={{ span: 21 }} onFinish={handleSubmit} initialValues={{ model_source: 'training' }}>
          <div className="mb-[16px] p-[24px] rounded-[8px]" style={{ border: '1px solid #f0f0f0' }}>
            <Typography.Title level={4} className="mb-4">基础信息</Typography.Title>

            <Form.Item label="模型版本">
              <Typography.Text>
                {' '}
                {lastModelDetailInfo?.version}
              </Typography.Text>
            </Form.Item>

            <Form.Item label="模型描述" name="description">
              <TextArea className="w-[400px]" placeholder="请输入版本描述" rows={4} maxLength={1000} showCount />
            </Form.Item>

            <Form.Item label="训练类型">
              <Typography.Text>
                {' '}
                {lastModelDetailInfo?.model_type === 'text-generation' ? '文本生成' : '图像理解'}
              </Typography.Text>
            </Form.Item>
          </div>

          <div className="p-[24px] rounded-[8px] mb-[50px]" style={{ border: '1px solid #f0f0f0' }}>
            <Typography.Title level={4} className="mb-4">模型配置</Typography.Title>

            <Form.Item name="model_source" label="模型来源" rules={[{ required: true, message: '请选择模型来源' }]}>
              <Typography.Text>
                {lastModelDetailInfo?.model_source_type === 'training' ? '大模型训练' : 'Notebook'}
              </Typography.Text>
            </Form.Item>

            {lastModelDetailInfo?.model_source_type === 'training' && (
              <>
                <Form.Item label="模型任务版本" name="taskVersion" rules={[{ required: true, message: '请选择模型任务版本' }]} tooltip="可选已运行成功的任务版本">
                  <Cascader
                    className="w-[400px]"
                    options={cascaderOptions}
                    showCheckedStrategy={Cascader.SHOW_CHILD}
                    placeholder="请选择模型任务版本"
                    loadData={loadData}
                    onChange={handleTaskVersionChange}
                    changeOnSelect
                    loading={false}
                  />
                </Form.Item>

                {selectedModelDetailInfo?.training_type?.fine_tuning_type?.toLowerCase() === 'lora' && (
                  <Form.Item label="资源配置" className="mb-0">
                    <ResourceConfig
                      projectId={projectId ? Number(projectId) : undefined}
                      skipLocalStorageEcho
                      onAllocatableResourcesChange={setAllocatableResources}
                      preserveResourceValuesOnAllocatableChange={isEditMode}
                    />
                  </Form.Item>
                )}

                {selectedModelDetailInfo?.training_type?.fine_tuning_type?.toLowerCase() === 'lora' && (
                  <Form.Item label="定时配置">
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
                        <Row gutter={16} className="w-[820px]">
                          <Col span={12}>
                            <Form.Item name="schedule_date" label="执行时间" rules={scheduleEnabled ? [{ required: true, message: '请选择日期' }] : []}>
                              <DatePicker className="w-full" placeholder="请选择日期" format="YYYY-MM-DD" disabledDate={(current) => current && current < dayjs().startOf('day')} />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item name="schedule_time" label=" " rules={scheduleEnabled ? [{ required: true, message: '请选择时间' }] : []}>
                              <TimePicker className="w-full" placeholder="请选择时间" format="HH:mm:ss" />
                            </Form.Item>
                          </Col>
                        </Row>
                      )}
                    </Space>
                  </Form.Item>
                )}

                <Form.Item label="Checkpoint" name="checkpoint" rules={[{ required: true, message: '请选择step' }]}>
                  <Select placeholder="请选择step" className="checkpoint-select w-[400px]" loading={isCheckpointLoading} disabled={isCheckpointLoading || checkpoint.length === 0}>
                    {checkpoint.map((option) => (
                      <Option key={option.value} value={option.value}>
                        {option.label}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </>
            )}

            {lastModelDetailInfo?.model_source_type === 'notebook' && <SourceFromNotebookForm canEditNotebook={false} />}
          </div>
        </Form>
      </section>
    </div>
  )
}
export default CreateVersionPage
