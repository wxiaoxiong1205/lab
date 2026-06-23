import React, { useEffect } from 'react'
import { Checkbox, Col, DatePicker, Form, Input, Modal, Radio, Row, Select, Space, Switch, TimePicker } from 'antd'
import dayjs from 'dayjs'
import { useQuery } from '@tanstack/react-query'
import type { BaseModel, CreateBaseModelParams } from '@/types/model'
import { ModelTypeMapping } from '@/utils/EnumMaping'
import { ModelService } from '@/services/modelsApi'
import { getCanUseKubernetesClusters } from '@/services/kubernetesService'
import type { KubernetesCluster } from '@/types'

interface EditBaseModelModalProps {
  visible: boolean
  onCancel: () => void
  onOk: (values: CreateBaseModelParams) => void
  loading?: boolean
  model?: BaseModel | null
}

const EditBaseModelModal: React.FC<EditBaseModelModalProps> = ({
  visible,
  onCancel,
  onOk,
  loading = false,
  model,
}) => {
  const [form] = Form.useForm()
  const model_source = Form.useWatch('model_source', form)
  const scheduleEnabled = Form.useWatch('schedule_enabled', form) ?? false

  // 获取模型来源枚举值
  const { data: modelSourceEnums } = useQuery({
    queryKey: ['modelSourceEnums'],
    queryFn: () => ModelService.getMoudleSorceEnums(),
  })

  // 获取k8s集群
  const { data: k8sClusterList } = useQuery({
    queryKey: ['k8sClusterList'],
    queryFn: () => getCanUseKubernetesClusters(),
  })

  console.log(model, 'model')

  useEffect(() => {
    if (visible && model) {
      const modelTypeArray = model.model_type
        ? (typeof model.model_type === 'string'
            ? model.model_type.split(',').map((type: string) => type.trim()).filter(Boolean)
            : Array.isArray(model.model_type) ? model.model_type : [])
        : []

      // 编辑：仅根据 schedule_at 是否为 null 决定是否回显定时配置（不看 schedule_enabled）
      const rawSchedule = model.schedule_at ?? (model as any).scheduleAt
      let scheduleAt: dayjs.Dayjs | null = null
      if (rawSchedule != null && rawSchedule !== '') {
        const parsed = dayjs(rawSchedule)
        if (parsed.isValid()) scheduleAt = parsed
      }

      form.setFieldsValue({
        id: model.id,
        name: model.name,
        model_type: modelTypeArray,
        model_provider: model.model_provider,
        model_tags: model.model_tags || [],
        description: model.description,
        k8s_id: model.k8s_id?.toString(),
        model_source: model.model_source,
        schedule_enabled: scheduleAt != null,
        ...(scheduleAt && {
          schedule_date: scheduleAt,
          schedule_time: scheduleAt,
        }),
      })
    }
  }, [visible, model, form])

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      const { schedule_enabled, schedule_date, schedule_time, id: _omitId, ...rest } = values
      void _omitId // 仅从提交参数中排除，不传给后端
      // 编辑时始终传定时配置：开启时传时间，关闭时传 undefined 便于后端清空
      const schedule_at = model_source !== 'Local' && schedule_enabled && schedule_date && schedule_time
        ? `${dayjs(schedule_date).format('YYYY-MM-DD')}T${dayjs(schedule_time).format('HH:mm:ss')}`
        : undefined
      const submitValues: CreateBaseModelParams = {
        ...rest,
        ...(model_source !== 'Local' ? { schedule_at } : {}),
      }
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
      title="编辑基础模型"
      open={visible}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={loading}
      cancelText="取消"
      okText="确定"
      width={600}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
      >
        {/* 隐藏的id字段，用于提交时传递模型ID */}
        <Form.Item
          name="id"
          noStyle
        >
          <Input type="hidden" />
        </Form.Item>

        <Form.Item
          name="model_source"
          label="模型来源"
          initialValue={model?.model_source}
          required
        >
          <Radio.Group
            disabled
            options={modelSourceEnums?.map((item) => (item.label === 'ModelScope' ? {
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
          <Select mode="multiple" placeholder="请选择模型类型">
            {['text-generation', 'image-understanding'].map((value) => (
              <Select.Option key={value} value={value}>
                {ModelTypeMapping(value).text}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="model_provider"
          label="模型提供商"
          rules={[
            { required: true, message: '请输入模型提供商' },
            { max: 50, message: '模型提供商不能超过50个字符' },
          ]}
        >
          <Input placeholder="请输入模型提供商，目前仅支持qwen, llama" disabled />
        </Form.Item>

        <Form.Item
          name="name"
          label={(
            <span>
              模型Code
              {/* <Tooltip
                title={
                  <img
                    src={codeExplainDemo}
                  />
                }
                overlayStyle={{ maxWidth: '400px' }}
                className="ml-2"
              >
                <QuestionCircleOutlined/>
              </Tooltip> */}
            </span>
          )}
          rules={[
            { required: true, message: model_source === 'Local' ? '请选择模型Code' : '请输入模型Code' },
            { max: 100, message: '模型Code不能超过100个字符' },
          ]}
        >
          <Input placeholder={model_source === 'Local' ? '请选择模型Code' : '请输入模型Code'} disabled />
        </Form.Item>

        {(model_source && model_source !== 'Local') && (
          <Form.Item
            name="k8s_id"
            label="集群"
            required
          >
            <Select placeholder="请选择集群" disabled>
              {k8sClusterList?.map((item: KubernetesCluster, index) => (
                <Select.Option key={item?.id || index} value={item?.id} label={item?.name}>
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
            { required: true, message: '请至少选择一项支持能力' },
          ]}
        >
          <Checkbox.Group>
            <Checkbox value="training">训练</Checkbox>
            <Checkbox value="inference">推理</Checkbox>
          </Checkbox.Group>
        </Form.Item>

        {model_source !== 'Local' && (
          <Form.Item label="任务定时配置">
            <Space direction="vertical" className="w-full">
              <Form.Item name="schedule_enabled" valuePropName="checked" className="mb-0" initialValue={false}>
                <Switch
                  checked={scheduleEnabled}
                  disabled={model?.status === '已完成'}
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
                        disabled={model?.status === '已完成'}
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
                        disabled={model?.status === '已完成'}
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
        >
          <Input.TextArea
            placeholder="请输入模型描述"
            rows={4}
            showCount
            maxLength={200}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default EditBaseModelModal
