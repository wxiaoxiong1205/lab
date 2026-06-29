import React, { useEffect, useState } from 'react'
import { Button, Form, InputNumber, Modal, Select, Space, Tooltip, Typography, message } from 'antd'
import { QuestionCircleOutlined } from '@ant-design/icons'
import { labelTaskService } from '../../../services/dataAnnotationService'
import { inferenceServiceApi } from '../../../services/inferenceService'
import type { InferenceService } from '../../../types/inference'

const { Text } = Typography
interface AnnotationConfigModalProps {
  visible: boolean
  taskId?: number
  projectId?: string
  initialConfig?: AnnotationConfig | null
  onCancel: () => void
  onConfirm?: (config: AnnotationConfig) => void
  modelType?: '文本生成' | '图像理解' | '图像生成' // 模型类型，用于筛选服务列表
}
export interface AnnotationConfig {
  model_id?: number
  max_token?: number
  temperature?: number
  top_p?: number
  presence_penalty?: number
}
const AnnotationConfigModal: React.FC<AnnotationConfigModalProps> = ({ visible, taskId, projectId, initialConfig, onCancel, onConfirm, modelType }) => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [fetchingServices, setFetchingServices] = useState(false)
  const [serviceList, setServiceList] = useState<InferenceService[]>([])
  // 获取服务列表
  useEffect(() => {
    if (!visible || !projectId) {
      return
    }
    const fetchServiceList = async () => {
      setFetchingServices(true)
      try {
        // 将中文的 modelType 转换为英文的 model_type
        const modelTypeMap: Record<string, string> = {
          文本生成: 'text-generation',
          图像理解: 'image-understanding',
          图像生成: 'image-generation',
        }
        const mappedModelType = modelType ? modelTypeMap[modelType] : 'text-generation'
        const response = await inferenceServiceApi.list({
          projectId,
          page: 1,
          size: 100,
          status: '测试通过',
          ...(mappedModelType && { model_type: mappedModelType }),
        })
        setServiceList(response.items || [])
      }
      catch (error: any) {
        setServiceList([])
      }
      finally {
        setFetchingServices(false)
      }
    }
    fetchServiceList()
  }, [visible, projectId, modelType])
  // 初始化表单值（使用外部传入的配置数据）
  useEffect(() => {
    if (!visible) {
      return
    }
    // 如果有传入的配置数据，使用它；否则使用默认值
    if (initialConfig) {
      form.setFieldsValue({
        model_id: initialConfig.model_id,
        max_token: initialConfig.max_token,
        temperature: initialConfig.temperature ?? 0.7,
        top_p: initialConfig.top_p ?? 1.0,
        presence_penalty: initialConfig.presence_penalty ?? 0.0,
      })
    }
    else {
      // 如果没有配置，使用默认值
      form.setFieldsValue({
        temperature: 0.7,
        top_p: 1.0,
        presence_penalty: 0.0,
      })
    }
  }, [visible, initialConfig, form])
  // 处理确认
  const handleConfirm = async () => {
    if (!taskId) {
      message.error('任务ID不存在')
      return
    }
    try {
      const values = await form.validateFields()
      if (!values.model_id) {
        message.error('请选择模型服务')
        return
      }
      setLoading(true)
      const paramConfig = {
        max_token: values.max_token,
        max_tokens: values.max_token,
        temperature: values.temperature,
        top_p: values.top_p,
        presence_penalty: values.presence_penalty,
      }
      // 保存配置
      await labelTaskService.saveModelConfig({
        task_id: taskId,
        model_id: values.model_id,
        param_config_json: paramConfig,
      })
      message.success('配置保存成功')
      // 调用回调函数
      if (onConfirm) {
        onConfirm({
          model_id: values.model_id,
          ...paramConfig,
        })
      }
      onCancel()
    }
    catch (error: any) {
      if (error?.errorFields) {
        // 表单验证失败
        return
      }
      message.error(error?.message || '保存配置失败')
    }
    finally {
      setLoading(false)
    }
  }
  // 处理取消
  const handleCancel = () => {
    form.resetFields()
    onCancel()
  }
  return (
    <Modal title="标注配置" open={visible} onCancel={handleCancel} footer={null} width={600} destroyOnClose className="annotation-config-modal">
      <Form form={form} layout="vertical" className="mt-4">
        {/* 选择服务 */}
        <div className="mb-6">
          <Form.Item name="model_id" label={<span className="text-base font-medium">选择服务</span>} rules={[{ required: true, message: '请选择模型服务' }]}>
            <Select placeholder="请选择模型服务" className="w-full" loading={fetchingServices}>
              {serviceList.map((service) => (
                <Select.Option key={service.id} value={Number(service.id)}>
                  {service.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </div>

        {/* 参数设置 */}
        <div className="mb-6">
          <Text strong className="block mb-4 text-base">参数设置</Text>

          {/* Max_token */}
          <Form.Item
            name="max_token"
            label={(
              <Space>
                <span>Max_tokens (最大生成token数)</span>
                <Tooltip title="最大生成token数，None表示不限制，使用模型的最长上下文">
                  <QuestionCircleOutlined className="text-gray-400 cursor-help" />
                </Tooltip>
              </Space>
            )}
            className="mb-4"
          >
            <InputNumber className="w-full" min={1} max={100000} placeholder="留空表示不限制" />
          </Form.Item>

          {/* Temperature */}
          <Form.Item
            name="temperature"
            label={(
              <Space>
                <span>Temperature (温度)</span>
                <Tooltip title="控制随机性，范围0-2，默认0.7">
                  <QuestionCircleOutlined className="text-gray-400 cursor-help" />
                </Tooltip>
              </Space>
            )}
            rules={[{ required: true, message: '请输入Temperature' }]}
            initialValue={0.7}
            className="mb-4"
          >
            <InputNumber min={0} max={2} step={0.1} className="w-full" />
          </Form.Item>

          {/* Top_p */}
          <Form.Item
            name="top_p"
            label={(
              <Space>
                <span>Top_p (核采样)</span>
                <Tooltip title="核采样，范围0-1，默认1.0（采样时考虑所有tokens）">
                  <QuestionCircleOutlined className="text-gray-400 cursor-help" />
                </Tooltip>
              </Space>
            )}
            rules={[{ required: true, message: '请输入Top_p' }]}
            initialValue={1.0}
            className="mb-4"
          >
            <InputNumber min={0} max={1} step={0.1} className="w-full" />
          </Form.Item>

          {/* presence_penalty */}
          <Form.Item
            name="presence_penalty"
            label={(
              <Space>
                <span>presence_penalty (存在性惩罚)</span>
                <Tooltip title="存在性惩罚，范围-2.0到2.0，默认0.0（不惩罚）">
                  <QuestionCircleOutlined className="text-gray-400 cursor-help" />
                </Tooltip>
              </Space>
            )}
            rules={[{ required: true, message: '请输入presence_penalty' }]}
            initialValue={0.0}
            className="mb-4"
          >
            <InputNumber min={-2.0} max={2.0} step={0.1} className="w-full" />
          </Form.Item>
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-3 mt-6">
          <Button onClick={handleCancel} className="px-6" disabled={loading}>
            取消
          </Button>
          <Button type="primary" onClick={handleConfirm} className="px-6" loading={loading}>
            确定
          </Button>
        </div>
      </Form>
    </Modal>
  )
}
export default AnnotationConfigModal
