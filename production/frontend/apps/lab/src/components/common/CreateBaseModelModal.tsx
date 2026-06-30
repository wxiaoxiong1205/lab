/*
 * @Author: fangjun fangjun@deepexi.com
 * @Date: 2025-09-23 11:37:32
 * @LastEditors: fangjun fangjun@deepexi.com
 * @LastEditTime: 2025-09-23 14:26:52
 * @FilePath: \deepexi-lab-web\src\components\common\CreateBaseModelModal.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import React, { useEffect, useMemo, useState } from 'react'
import { AutoComplete, Col, DatePicker, Form, Input, Modal, Radio, Row, Select, Space, Switch, TimePicker } from 'antd'
import dayjs from 'dayjs'
import { useQuery } from '@tanstack/react-query'
import type { CreateBaseModelParams, ModelProviderOption } from '@/types/model'
import { ModelService } from '@/services/modelsApi'
import { getCanUseKubernetesClusters } from '@/services/kubernetesService'
import type { KubernetesCluster } from '@/types'
import { useConfigStore } from '@/stores/configStore'

const COMMON_MODEL_PROVIDERS = [
  'Qwen',
  'DeepSeek',
  'Llama',
  'Baichuan',
  'ChatGLM',
]

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
  const model_source = Form.useWatch('model_source', form)
  const scheduleEnabled = Form.useWatch('schedule_enabled', form) ?? false
  const { config, providerType } = useConfigStore()
  const isCurrentProvider = config?.PROVIDER_TYPE !== providerType

  useEffect(() => {
    const projectEnumValues = JSON.parse(localStorage.getItem('projectEnumValues') || '{}')
    const allEnums = Array.isArray(projectEnumValues?.all_enums) ? projectEnumValues.all_enums : []
    const modelProvider = allEnums.find((item) => item.enum_name === 'ModelProvider')
    const modelProviderOptions = Array.isArray(modelProvider?.options) ? modelProvider.options : [
      { name: 'Qwen', value: 'Qwen', description: null },
      { name: 'Llama', value: 'Llama', description: null },
    ]

    setModelProviderEnumValues(modelProviderOptions)
  }, [])

  useEffect(() => {
    form.setFieldValue('name', undefined)
  }, [model_source])

  // 获取模型来源枚举值
  const { data: modelSourceEnums } = useQuery({
    queryKey: ['modelSourceEnums'],
    queryFn: () => ModelService.getMoudleSorceEnums(),
  })

  const modelSourceOptions = useMemo(
    () => modelSourceEnums?.filter((item) => item.value === 'ModelScope'),
    [modelSourceEnums],
  )

  const fixedModelSourceOptions = useMemo(
    () => (modelSourceOptions?.length ? modelSourceOptions : [{ label: 'ModelScope', value: 'ModelScope' }]).map((item) => ({
      value: item.value,
      label: (
        <span>
          ModelScope
          <a href="https://www.modelscope.cn/models" target="_blank" rel="noreferrer" className="ml-2 !underline">
            https://www.modelscope.cn/models
          </a>
        </span>
      ),
    })),
    [modelSourceOptions],
  )

  const modelProviderOptions = useMemo(() => {
    const providerValues = new Set<string>()
    for (const provider of COMMON_MODEL_PROVIDERS) {
      providerValues.add(provider)
    }
    for (const item of modelProviderEnumValues) {
      const value = item?.value || item?.name
      if (value) {
        providerValues.add(value)
      }
    }

    return Array.from(providerValues).map((value) => ({ value }))
  }, [modelProviderEnumValues])

  useEffect(() => {
    if (!visible)
      return

    if (!model_source || model_source === 'Local') {
      form.setFieldValue('model_source', 'ModelScope')
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

  // 处理模型提供商变化
  const handleProviderChange = () => {
    // 清空模型名称的选择
    form.setFieldValue('name', undefined)
  }

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      const submitValues: CreateBaseModelParams = {
        ...values,
        model_source: 'ModelScope',
        model_type: ['text-generation'],
        model_tags: ['training', 'inference'],
      }
      if (values.schedule_enabled && values.schedule_date && values.schedule_time) {
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
      title="新增模型"
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
          initialValue="ModelScope"
          rules={[{ required: true, message: '请选择模型来源' }]}
        >
          <Radio.Group options={fixedModelSourceOptions} />
        </Form.Item>

        <Form.Item
          name="model_provider"
          label="模型提供商"
          rules={[
            { required: true, message: '请选择或输入模型提供商' },
            { max: 50, message: '模型提供商不能超过50个字符' },
          ]}
        >
          <AutoComplete
            options={modelProviderOptions}
            placeholder="请选择或输入模型提供商"
            filterOption={(inputValue, option) =>
              String(option?.value ?? '').toLowerCase().includes(inputValue.toLowerCase())}
            onChange={handleProviderChange}
          />
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
          <Input placeholder="请输入模型code" />
        </Form.Item>

        {(isCurrentProvider && model_source) && (
          <Form.Item
            name="k8s_id"
            label="集群"
            rules={[{ required: true, message: '请选择集群' }]}
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

        {/* 新增：是否定时由用户通过 enabled 开关控制 */}
        {model_source && (
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
