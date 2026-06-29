/*
 * @Author: fangjun fangjun@deepexi.com
 * @Date: 2025-09-23 11:37:32
 * @LastEditors: fangjun fangjun@deepexi.com
 * @LastEditTime: 2025-09-23 14:26:52
 * @FilePath: \deepexi-lab-web\src\components\common\CreateBaseModelModal.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import React, { useEffect, useMemo, useState } from 'react'
import { Checkbox, Col, DatePicker, Form, Input, Modal, Radio, Row, Select, Space, Switch, TimePicker } from 'antd'
import dayjs from 'dayjs'
import { useQuery } from '@tanstack/react-query'
import type { CreateBaseModelParams, ModelListItem, ModelProviderOption, ModelTypeOption } from '@/types/model'
import { ModelTypeMapping } from '@/utils/EnumMaping'
import { ModelService } from '@/services/modelsApi'
import { getCanUseKubernetesClusters } from '@/services/kubernetesService'
import type { KubernetesCluster } from '@/types'
import { useConfigStore } from '@/stores/configStore'

interface CreateBaseModelModalProps {
  visible: boolean
  onCancel: () => void
  onOk: (values: CreateBaseModelParams) => void
  loading?: boolean
}

const CreateBaseModelModal: React.FC<CreateBaseModelModalProps> = ({
  visible,
  onCancel,
  onOk,
  loading = false,
}) => {
  const [form] = Form.useForm()
  const [modelProviderEnumValues, setModelProviderEnumValues] = useState<ModelProviderOption[]>([])
  const [modelTypeList, setModelTypeList] = useState<ModelTypeOption[]>([])
  const [modelList, setModelList] = useState<ModelListItem[]>([])
  const model_source = Form.useWatch('model_source', form)
  const model_type = Form.useWatch('model_type', form)
  const model_provider = Form.useWatch('model_provider', form)
  const scheduleEnabled = Form.useWatch('schedule_enabled', form) ?? false
  const { config, providerType } = useConfigStore()
  const isCurrentProvider = config?.PROVIDER_TYPE !== providerType

  useEffect(() => {
    const projectEnumValues = JSON.parse(localStorage.getItem('projectEnumValues') || '{}')
    const allEnums = Array.isArray(projectEnumValues?.all_enums) ? projectEnumValues.all_enums : []
    const modelProvider = allEnums.find((item) => item.enum_name === 'ModelProvider')
    const modelType = allEnums.find((item) => item.enum_name === 'ModelType')
    const modelProviderOptions = Array.isArray(modelProvider?.options) ? modelProvider.options : [
      { name: 'qwen', value: 'qwen', description: null },
      { name: 'llama', value: 'llama', description: null },
    ]
    const modelTypeOptions = Array.isArray(modelType?.options) ? modelType.options : [
      { name: 'text-generation', value: 'text-generation', description: null },
      { name: 'image-understanding', value: 'image-understanding', description: null },
    ]

    setModelProviderEnumValues(modelProviderOptions)
    setModelTypeList(modelTypeOptions)
  }, [])

  useEffect(() => {
    console.log(model_source, '模型资源')
    form.setFieldValue('name', undefined)
    if (model_source && model_source === 'Local') {
      form.setFieldsValue({ schedule_enabled: false, schedule_date: undefined, schedule_time: undefined })
    }
  }, [model_source])

  // 获取模型来源枚举值
  const { data: modelSourceEnums } = useQuery({
    queryKey: ['modelSourceEnums'],
    queryFn: () => ModelService.getMoudleSorceEnums(),
  })

  const modelSourceOptions = useMemo(
    () => modelSourceEnums?.filter((item) => isCurrentProvider || item.value !== 'Local'),
    [isCurrentProvider, modelSourceEnums],
  )

  useEffect(() => {
    if (!visible || !modelSourceOptions?.length)
      return

    if (!isCurrentProvider && (!model_source || model_source === 'Local')) {
      form.setFieldValue('model_source', modelSourceOptions[0]?.value)
    }

    if (!isCurrentProvider) {
      form.setFieldValue('k8s_id', undefined)
    }
  }, [form, isCurrentProvider, model_source, modelSourceOptions, visible])

  // 获取k8s集群
  const { data: k8sClusterList } = useQuery({
    queryKey: ['k8sClusterList'],
    queryFn: () => getCanUseKubernetesClusters(),
    enabled: isCurrentProvider,
  })

  // 动态获取模型列表
  const fetchModelList = (provider: string, types?: string | string[]) => {
    const params: any = { model_provider: provider }
    if (types && types.length > 0) {
      // 如果是数组，转换为逗号分隔的原始值字符串
      if (Array.isArray(types)) {
        params.model_type = types.join(',')
      }
      else {
        params.model_type = types
      }
    }
    ModelService.getModelList(params)
      .then((response) => {
        // 确保modelList是字符串数组
        const models = Array.isArray(response) ? response : []
        setModelList(models)
      })
      .catch((error) => {
        console.error('获取模型列表失败:', error)
      })
  }

  // 处理模型提供商变化
  const handleProviderChange = (value: string) => {
    // 清空模型名称的选择
    form.setFieldValue('name', undefined)
    // 根据选中的模型提供商和类型获取对应的模型列表
    fetchModelList(value, model_type)
  }

  // 处理模型类型变化
  const handleModelTypeChange = (value: string[]) => {
    // 清空模型名称的选择
    form.setFieldValue('name', undefined)
    // 如果已选择提供商，根据选中的模型类型重新获取模型列表
    if (model_provider) {
      fetchModelList(model_provider, value)
    }
  }

  // 监听模型类型和提供商变化，自动刷新模型列表
  useEffect(() => {
    if (model_source === 'Local' && model_provider) {
      fetchModelList(model_provider, model_type)
    }
  }, [model_type, model_provider, model_source])

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      const submitValues: CreateBaseModelParams = { ...values }
      if (model_source !== 'Local' && values.schedule_enabled && values.schedule_date && values.schedule_time) {
        submitValues.schedule_at = `${dayjs(values.schedule_date).format('YYYY-MM-DD')}T${dayjs(values.schedule_time).format('HH:mm:ss')}`
      }
      delete (submitValues as any).schedule_enabled
      delete (submitValues as any).schedule_date
      delete (submitValues as any).schedule_time
      onOk(submitValues)
    }
    catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  const handleCancel = () => {
    form.resetFields()
    onCancel()
  }

  return (
    <Modal
      title="新增基础模型"
      open={visible}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={loading}
      width={600}
      cancelText="取消"
      okText="确定"
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
      >
        <Form.Item
          name="model_source"
          label="模型来源"
          initialValue={isCurrentProvider ? 'Local' : undefined}
          required
        >
          <Radio.Group
            options={modelSourceOptions?.map((item) => (item.label === 'ModelScope' ? {
              value: item.value, label: (
                <div>
                  ModelScope
                  <a href="https://www.modelscope.cn/models" target="_blank" className="ml-2 !underline">https://www.modelscope.cn/models</a>
                </div>
              ),
            } : item))}
          />
        </Form.Item>

        <Form.Item
          name="model_type"
          label="模型类型"
          rules={[{ required: true, message: '请选择模型类型' }]}
        >
          <Select mode="multiple" placeholder="请选择模型类型" onChange={handleModelTypeChange}>
            {modelTypeList?.filter((item) => ['text-generation', 'image-generation', 'image-understanding'].includes(item?.value)).map((item, index) => (
              <Select.Option key={item?.name || index} value={item?.value}>
                {item?.value && ModelTypeMapping(item.value).text}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="model_provider"
          label="模型提供商"
          rules={[{ required: true, message: '请选择模型提供商' }]}
        >
          <Select
            placeholder="请选择模型提供商"
            onChange={handleProviderChange}
          >
            {modelProviderEnumValues?.map((item: any, index) => (
              <Select.Option key={item?.value || index} value={item?.value}>
                {item?.value}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="name"
          label={(
            <span>
              模型Code
            </span>
          )}
          rules={[
            { required: true, message: model_source === 'Local' ? '请选择模型Code' : '请输入模型Code' },
            { max: 100, message: '模型Code不能超过100个字符' },
          ]}
        >
          {model_source === 'Local' ? (
            <Select placeholder="请选择模型Code">
              {modelList.map((model, index) => {
                // 如果model是字符串，直接使用；如果是对象，使用model.name
                const modelName = typeof model === 'string' ? model : model?.name
                return (
                  <Select.Option key={modelName || index} value={modelName}>
                    {modelName}
                  </Select.Option>
                )
              })}
            </Select>
          ) : (
            <Input placeholder="请输入模型code" />
          )}
        </Form.Item>

        {(isCurrentProvider && model_source && model_source !== 'Local') && (
          <Form.Item
            name="k8s_id"
            label="集群"
            required
          >
            <Select placeholder="请选择集群，用于模型下载">
              {k8sClusterList?.map((item: KubernetesCluster, index) => (
                <Select.Option key={item?.id || index} value={item?.id}>
                  {item?.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        )}

        <Form.Item
          name="model_tags"
          label="支持能力"
          rules={[
            { required: true, message: '请选择支持能力' },
          ]}
        >
          <Checkbox.Group>
            <Checkbox value="training">训练</Checkbox>
            <Checkbox value="inference">推理</Checkbox>
          </Checkbox.Group>
        </Form.Item>

        {/* 新增：是否定时由用户通过 enabled 开关控制 */}
        {model_source !== 'Local' && (
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
                  <Col span={12}>
                    <Form.Item
                      name="schedule_date"
                      label="执行时间"
                      rules={scheduleEnabled ? [{ required: true, message: '请选择日期' }] : []}
                    >
                      <DatePicker
                        className="w-full"
                        placeholder="请选择日期"
                        format="YYYY-MM-DD"
                        disabledDate={(current) => current && current < dayjs().startOf('day')}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="schedule_time"
                      label=" "
                      rules={scheduleEnabled ? [{ required: true, message: '请选择时间' }] : []}
                    >
                      <TimePicker
                        className="w-full"
                        placeholder="请选择时间"
                        format="HH:mm:ss"
                      />
                    </Form.Item>
                  </Col>
                </Row>
              )}
            </Space>
          </Form.Item>
        )}

        <Form.Item
          name="description"
          label="模型描述"
          rules={[
            { max: 1000, message: '模型描述不能超过1000个字符' },
          ]}
        >
          <Input.TextArea
            placeholder="请输入模型描述"
            rows={4}
            showCount
            maxLength={1000}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default CreateBaseModelModal
