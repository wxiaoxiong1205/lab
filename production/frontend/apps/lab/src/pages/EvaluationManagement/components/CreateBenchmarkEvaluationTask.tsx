import React, { useEffect, useState } from 'react'
import { Button, Card, Col, DatePicker, Divider, Form, Input, Row, Space, Switch, Table, Tag, TimePicker, Typography, message } from 'antd'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import { BenchmarkEvaluationModelService } from './BenchmarkEvaluationModelService.tsx'
import { benchmarkEvaluationServices } from '@/services/benchmarkEvaluationService'
import type { BenchmarkEvaluationDatasetsResponse } from '@/services/benchmarkModel'
import { InferenceParametersConfig } from '@/components/inference'
import ResourceConfig from '@/components/finetune/ResourceConfig'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'

const { Text } = Typography
const { TextArea } = Input
interface BenchmarkDataset {
  key: string
  name: string
  language: string
  score: number
  description: string
  id: number
  code: string
}
const CreateBenchmarkEvaluationTask: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { projectId } = useParams()
  const [form] = Form.useForm()
  const modelType = Form.useWatch('model_type', form) ?? 'model'
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([])
  const [benchmarkDatasets, setBenchmarkDatasets] = useState<BenchmarkDataset[]>([])
  const [loading, setLoading] = useState(false)
  const [editTaskId, setEditTaskId] = useState<number | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  // 任务定时配置：开关与时间组件以 schedule_at 为准，at 为 null 时开关关闭且不展示时间选择器
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  // 获取基准数据集列表
  useEffect(() => {
    const fetchDatasets = async () => {
      setLoading(true)
      try {
        const response = await benchmarkEvaluationServices.getBenchmarkEvaluationDatasets()
        // 转换数据格式
        const formattedData: BenchmarkDataset[] = response.map((item: BenchmarkEvaluationDatasetsResponse) => ({
          key: String(item.id),
          name: item.name,
          language: item.language || '-',
          score: item.original_sample_count || 0,
          description: item.description || '-',
          id: item.id,
          code: item.code,
        }))
        setBenchmarkDatasets(formattedData)
      }
      catch (error) {
        message.error('获取数据集列表失败')
        console.error('获取数据集列表失败:', error)
      }
      finally {
        setLoading(false)
      }
    }
    fetchDatasets()
  }, [])
  // 处理编辑/克隆数据的回显（编辑与克隆使用同一套回显逻辑，克隆不设置 editTaskId / isEditMode）
  useEffect(() => {
    const editData = (location.state as any)?.editData
    const cloneData = (location.state as any)?.cloneData
    const taskId = (location.state as any)?.taskId
    const data = editData || cloneData
    if (data && benchmarkDatasets.length > 0) {
      const isEdit = !!(editData && taskId)
      if (isEdit) {
        setIsEditMode(true)
        setEditTaskId(taskId)
      }
      // 设置模型类型（写入表单，显卡区域等通过 Form.useWatch('model_type') 联动）
      const currentModelType = data.model_type || 'model'
      // 定时任务以 schedule_at 为准：有 at 才开开关并展示时间，无 at 则关开关且不展示时间组件
      setScheduleEnabled(!!data.schedule_at)
      // 回显表单数据（克隆时任务名追加时间戳，编辑保持原名）
      const editModelId = data.models?.[0]?.model_id
      const taskName = cloneData
        ? `${data.name || ''}_${dayjs().format('YYYYMMDDHHmmss')}`
        : (data.name || '')
      const formValues: any = {
        taskName,
        description: data.description || '',
        model_type: currentModelType,
        model_id: data.models && data.models.length > 0 ? data.models[0].model_id : undefined,
        schedule_enabled: !!data.schedule_at,
      }
      if (currentModelType === 'model') {
        // model_cascader 不在此写入：编辑/克隆时由「模型列表加载后」的 effect 解析（模型管理为 3 级）
      }
      else {
        formValues.model_id = editModelId
        formValues.model_provider = data.model_provider
      }
      // 回显定时任务配置（仅当 schedule_at 存在时设置日期时间）
      if (data.schedule_at) {
        const scheduleDateTime = dayjs(data.schedule_at)
        formValues.schedule_date = scheduleDateTime
        formValues.schedule_time = scheduleDateTime
      }
      else {
        formValues.schedule_date = undefined
        formValues.schedule_time = undefined
      }
      // 回显显卡资源配置（仅当模型类型为 model 时）
      if (currentModelType === 'model' && data.graphics_card_resource) {
        const gpuResource = data.graphics_card_resource
        if (gpuResource.card_type && gpuResource.card_model) {
          formValues.gpu_type = [gpuResource.card_type, gpuResource.card_model]
          formValues.gpu_model = gpuResource.card_model
          formValues.gpu_memory = gpuResource.card_memory
          formValues.gpu_count = gpuResource.count || 1
          formValues.k8s_resource_type = gpuResource.k8s_resource_type || gpuResource.card_model
        }
        formValues.graphics_card_resource = {
          cpu_request: gpuResource.cpu_request || 0.5,
          cpu_limit: gpuResource.cpu_limit || 16,
          memory_request: gpuResource.memory_request || 0.5,
          memory_limit: gpuResource.memory_limit || 16,
        }
      }
      if (data.inference_params) {
        let inferenceParams: Record<string, number> = {}
        if (typeof data.inference_params === 'string') {
          try {
            inferenceParams = JSON.parse(data.inference_params) || {}
          }
          catch {
            inferenceParams = {}
          }
        }
        else {
          inferenceParams = data.inference_params as Record<string, number>
        }
        if (inferenceParams && typeof inferenceParams === 'object') {
          if (inferenceParams.temperature !== undefined)
            formValues.temperature = inferenceParams.temperature
          if (inferenceParams.top_p !== undefined)
            formValues.top_p = inferenceParams.top_p
          if (inferenceParams.max_tokens !== undefined && inferenceParams.max_tokens !== null)
            formValues.max_tokens = inferenceParams.max_tokens
          if (inferenceParams.presence_penalty !== undefined)
            formValues.presence_penalty = inferenceParams.presence_penalty
        }
      }
      // 设置表单值
      form.setFieldsValue(formValues)
      // 回显数据集选择（数据集列表已加载完成）
      if (data.datasets && data.datasets.length > 0) {
        const datasetNames = data.datasets.map((ds: any) => ds.dataset_name)
        setSelectedDatasets(datasetNames)
      }
    }
  }, [location.state, form, benchmarkDatasets])
  const handleBack = () => {
    navigate(`/project/${projectId}/effect-evaluation/benchmark`)
  }
  const handleSubmit = async (values: any) => {
    try {
      // 获取选中的数据集ID列表
      const selectedDatasetIds = benchmarkDatasets
        .filter((ds) => selectedDatasets.includes(ds.name))
        .map((ds) => ds.id)
      if (selectedDatasetIds.length === 0) {
        message.error('请至少选择一个数据集')
        return
      }
      // 构建请求参数
      const params: any = {
        name: values.taskName,
        description: values.description || '',
        model_type: values.model_type,
        model_id: values.model_type === 'model'
          ? (() => {
              const item = values.model_cascader
              if (!item?.length)
                return values.model_id
              if (item[0] === 'trained')
                return item[2] ?? values.model_id
              return item[1] ?? values.model_id
            })()
          : values.model_id,
        dataset_ids: selectedDatasetIds,
      }
      // 定时任务配置
      if (values.schedule_enabled) {
        if (!values.schedule_date || !values.schedule_time) {
          message.error('启用定时任务时，请选择执行日期和时间')
          return
        }
        const schedule_date = values.schedule_date.format('YYYY-MM-DD')
        const schedule_time = values.schedule_time.format('HH:mm:ss')
        params.schedule_at = `${schedule_date}T${schedule_time}`
      }
      params.inference_params = {
        temperature: values.temperature ?? 0.7,
        top_p: values.top_p ?? 1.0,
        max_tokens: values.max_tokens ?? 4096,
        presence_penalty: values.presence_penalty ?? 0,
      }
      // 服务类型时传入服务提供商
      if (values.model_type === 'service' && values.model_provider) {
        params.model_provider = values.model_provider
      }
      // 显卡资源配置和离线模型来源（仅在选择模型时）
      if (values.model_type === 'model') {
        if (!values.gpu_type || !Array.isArray(values.gpu_type) || values.gpu_type.length !== 2) {
          message.error('请完成显卡资源配置')
          return
        }
        const graphicsCardResource = {
          card_type: values.gpu_type[0],
          card_model: values.gpu_model || '',
          count: values.gpu_count || 1,
          card_memory: values.gpu_memory || '',
          k8s_resource_type: values.k8s_resource_type || values.gpu_type[1],
          cpu_request: values.graphics_card_resource?.cpu_request || 0.5,
          cpu_limit: values.graphics_card_resource?.cpu_limit || 16,
          memory_request: values.graphics_card_resource?.memory_request || 0.5,
          memory_limit: values.graphics_card_resource?.memory_limit || 16,
        }
        params.graphics_card_resource = graphicsCardResource
        // 离线模型来源由级联选择器第一级（基础模型/模型管理）决定
        const cascaderSource = values.model_cascader?.[0]
        if (cascaderSource) {
          params.offline_model_source = cascaderSource
        }
      }
      if (isEditMode && editTaskId) {
        await benchmarkEvaluationServices.updateBenchmarkTaskConfig(Number(projectId), editTaskId, params)
        message.success('更新基准评估任务成功！')
      }
      else {
        await benchmarkEvaluationServices.createBenchmarkEvaluationTask(Number(projectId), params)
        message.success('创建基准评估任务成功！')
      }
      handleBack()
    }
    catch (error: any) {
      message.error(error?.response?.data?.message || '创建失败，请重试')
      console.error('创建失败:', error)
    }
  }
  const handleDatasetSelect = (datasetName: string, selected: boolean) => {
    if (selected) {
      setSelectedDatasets((prev) => [...prev, datasetName])
    }
    else {
      setSelectedDatasets((prev) => prev.filter((name) => name !== datasetName))
    }
  }
  const columns = [
    {
      title: '数据集',
      dataIndex: 'name',
      key: 'name',
      width: 120,
    },
    {
      title: '语言',
      dataIndex: 'language',
      key: 'language',
      width: 80,
    },
    {
      title: '题目数量',
      dataIndex: 'score',
      key: 'score',
      width: 100,
    },
    {
      title: '说明',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
  ]
  return (
    <div className="create-form-page">
      <section className="create-form-card">
        <CreateFormPageHeader
          title={isEditMode ? '编辑基准评估任务' : '创建基准评估任务'}
          onBack={handleBack}
          actions={(
            <>
              <Button className="create-form-cancel" onClick={handleBack}>取消</Button>
              <Button className="create-form-submit" type="primary" onClick={() => form.submit()}>
                {isEditMode ? '更新' : '创建'}
              </Button>
            </>
          )}
        />
        <div className="create-form-divider" />
        <div className="create-form-body">
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            initialValues={{
              evaluationType: 'single',
              model_type: 'model', // 默认选择"模型"
              schedule_enabled: false,
              temperature: 0.7,
              top_p: 1.0,
              presence_penalty: 0.0,
              graphics_card_resource: {
                cpu_request: 0.5,
                cpu_limit: 16,
                memory_request: 0.5,
                memory_limit: 16,
              },
            }}
          >
            <Card className="mb-6">
              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item
                    label="任务名称"
                    name="taskName"
                    rules={[
                      { required: true, message: '请输入任务名称' },
                      {
                        validator: (_, value) => {
                          if (!value) {
                            return Promise.resolve()
                          }
                          // 检查长度
                          if (value.length < 2 || value.length > 64) {
                            return Promise.reject(new Error('任务名称长度为2-64个字符'))
                          }
                          // 检查不能以下划线或中划线开头
                          if (value.startsWith('_') || value.startsWith('-')) {
                            return Promise.reject(new Error('任务名称不能以下划线或中划线开头'))
                          }
                          // 检查只能包含中英文、数字、小数点、中划线、下划线
                          if (!/^[\u4E00-\u9FA5a-zA-Z0-9._-]+$/.test(value)) {
                            return Promise.reject(new Error('任务名称只能包含中英文、数字、小数点、中划线、下划线，不能包含空格和特殊符号'))
                          }
                          return Promise.resolve()
                        },
                      },
                    ]}
                  >
                    <Input placeholder="请输入任务名称" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="描述" name="description">
                <TextArea placeholder="请输入评估任务描述，1000字符以内" rows={4} maxLength={1000} showCount />
              </Form.Item>

              <Divider />

              {/* 任务定时配置：开关打开时才展示日期/时间选择器（编辑时 schedule_at 为 null 则开关关闭，时间组件不展示） */}
              <Form.Item label="任务定时配置">
                <Space direction="vertical" className="w-full">
                  <Form.Item name="schedule_enabled" valuePropName="checked" className="mb-0">
                    <Switch
                      checked={scheduleEnabled}
                      onChange={(checked) => {
                        setScheduleEnabled(checked)
                        form.setFieldsValue({ schedule_enabled: checked })
                        if (!checked) {
                          form.setFieldsValue({ schedule_date: undefined, schedule_time: undefined })
                        }
                      }}
                    />
                  </Form.Item>
                  {scheduleEnabled && (
                    <Row gutter={16}>
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

              <Divider />

              <BenchmarkEvaluationModelService form={form} />

            </Card>

            {/* 待推理模型参数设置 */}
            <Card className="mb-6">
              <InferenceParametersConfig form={form} />
            </Card>

            {modelType === 'model' && (
              <div className="mb-6 [&_.ant-card]:mb-0">
                <ResourceConfig projectId={projectId ? Number(projectId) : undefined} skipLocalStorageEcho simpleGpuCountSelect />
              </div>
            )}

            <p className="my-2"></p>

            {/* 基准评估数据集 */}
            <Card title="基准评估数据集" className="mb-6">
              <div className="mb-4">
                <Text strong>评估数据集</Text>
              </div>

              {/* 数据集选择标签 */}
              <div className="mb-4">
                {loading ? (<div className="text-center text-gray-400 py-4">加载中...</div>) : (
                  <Space wrap>
                    {benchmarkDatasets.map((dataset) => (
                      <Tag className="cursor-pointer p-[4px_12px]" key={dataset.key} color={selectedDatasets.includes(dataset.name) ? 'blue' : 'default'} onClick={() => handleDatasetSelect(dataset.name, !selectedDatasets.includes(dataset.name))}>
                        {dataset.name}
                        {' '}
                        (
                        {dataset.score}
                        )
                      </Tag>
                    ))}
                  </Space>
                )}
              </div>

              {/* 根据选择的数据集显示对应的表格 */}
              {!loading && selectedDatasets.length > 0 && (
                <>
                  <Table rowKey="key" columns={columns} dataSource={benchmarkDatasets.filter((ds) => selectedDatasets.includes(ds.name))} pagination={false} scroll={{ x: 800 }} size="small" loading={loading} />

                  <div className="mt-4 text-gray-500 text-sm">
                    当前评估数据集：
                    {selectedDatasets.length}
                    条
                  </div>
                </>
              )}

              {!loading && selectedDatasets.length === 0 && (
                <div className="text-center text-gray-400 py-8">
                  请选择评估数据集
                </div>
              )}
            </Card>

          </Form>
        </div>
      </section>
    </div>
  )
}
export default CreateBenchmarkEvaluationTask
