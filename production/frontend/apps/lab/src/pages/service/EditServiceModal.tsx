import React, { useEffect } from 'react'
import { Button, Form, Input, Modal, Select, Space, message } from 'antd'
import { useMutation, useQuery } from '@tanstack/react-query'
import { inferenceServiceApi } from '../../services/inferenceService.ts'
import type { ApiAttributeItem, Attribute, AttributeFormItem, FormValues, InferenceServiceDetail, UpdateServiceRequest, optionsItem } from '../../types/inference'

interface EditServiceModalProps {
  visible: boolean
  serviceId: string
  projectId: string
  onClose: () => void
  onUpdateSuccess: () => void
}
const EditServiceModal: React.FC<EditServiceModalProps> = ({ visible, serviceId, projectId, onClose, onUpdateSuccess }) => {
  const [form] = Form.useForm<FormValues>()
  // 模型类型选项
  const modelTypeOptions = [
    { value: '文本生成', label: '文本生成' },
    { value: '图像理解', label: '图像理解' },
  ]
  // 获取服务详情
  const { data: serviceDetail, refetch: refetchServiceDetail } = useQuery<InferenceServiceDetail>({
    queryKey: ['inference-service', serviceId],
    queryFn: async () => {
      if (!serviceId) {
        throw new Error('服务ID不存在')
      }
      return await inferenceServiceApi.getDetail(serviceId, projectId)
    },
    enabled: false, // 手动触发
  })
  // 更新服务的mutation（用于loading状态）
  const updateServiceMutation = useMutation({
    mutationFn: async () => {
      // 实际提交逻辑在 handleSubmit 中
      return Promise.resolve()
    },
  })
  // 当弹窗可见且服务ID变化时，获取服务详情
  useEffect(() => {
    if (visible && serviceId) {
      refetchServiceDetail()
    }
  }, [visible, serviceId])
  // 将API数据映射为表单需要的格式
  const mapApiDataToFormFormat = (apiItems: ApiAttributeItem[] | Attribute[]): AttributeFormItem[] => {
    return apiItems.map((item: ApiAttributeItem | Attribute): AttributeFormItem => {
      const formItem: AttributeFormItem = {
        id: item.id,
        attr_id: item.attr_id,
        name: item.name || '',
        description: ('description' in item ? item.description : undefined) || '',
        inputType: item.input_type === '下拉选择' ? '下拉选择' : '手动输入',
        required: item.required_tag === 1,
      }
      // 下拉选择
      if (item.input_type === '下拉选择') {
        formItem.selectMode = item.multi_select === 1 ? 'multiple' : 'single'
        formItem.multi_select = item.multi_select !== undefined ? Number(item.multi_select) : 0
        // options作为已选定的选项值 回显到输入框
        formItem.options = (item.options || []).map((opt: string | optionsItem): string => typeof opt === 'string' ? opt : (opt.option_value || '')).filter((val): val is string => Boolean(val))
        // attr_options作为所有的下拉选项
        const attrOptions = 'attr_options' in item ? item.attr_options : undefined
        formItem.attr_options = (attrOptions || []).map((opt: optionsItem): string => opt.option_value || '').filter((val): val is string => Boolean(val))
        if (formItem.options && formItem.options.length > 0) {
          if (item.multi_select === 1) {
            formItem.attr_value = formItem.options as any
          }
          else {
            formItem.attr_value = formItem.options[0]
          }
        }
      }
      else {
        formItem.selectMode = 'single'
        formItem.multi_select = 0
        formItem.options = []
        // 手动输入
        if ('attr_value' in item && item.attr_value) {
          formItem.attr_value = item.attr_value
        }
      }
      return formItem
    })
  }
  // 当服务详情数据变化时，直接将值设置到表单中，并处理属性数据
  useEffect(() => {
    if (serviceDetail) {
      const formValues: FormValues = {
        serviceName: serviceDetail.name,
        description: serviceDetail.description,
        baseUrl: serviceDetail.base_url,
        modelName: serviceDetail.model_name,
        modelType: serviceDetail.model_type || [],
      }
      // 处理属性数据
      if (serviceDetail.attr_values && Array.isArray(serviceDetail.attr_values) && serviceDetail.attr_values.length > 0) {
        formValues.attributes = mapApiDataToFormFormat(serviceDetail.attr_values)
      }
      else {
        formValues.attributes = []
      }
      form.setFieldsValue(formValues)
    }
  }, [serviceDetail])
  // 处理表单提交
  const handleSubmit = async (values: FormValues) => {
    updateServiceMutation.mutate()
    try {
      // 创建基础更新数据对象，只包含必填的id字段
      const updateData: Partial<UpdateServiceRequest> = {
        id: parseInt(serviceId),
      }
      // 只有当字段值不为空时才添加到更新数据中
      if (values.serviceName && values.serviceName.trim() !== '') {
        updateData.name = values.serviceName
      }
      if (values.description && values.description.trim() !== '') {
        updateData.description = values.description
      }
      if (values.baseUrl && values.baseUrl.trim() !== '') {
        updateData.base_url = values.baseUrl
      }
      if (values.modelName && values.modelName.trim() !== '') {
        updateData.model_name = values.modelName
      }
      if (values.apiKey && values.apiKey.trim() !== '') {
        updateData.api_key = values.apiKey
      }
      if (values.modelType && values.modelType.length > 0) {
        updateData.model_type = values.modelType
      }
      // 处理属性数据，转换为 API 需要的格式
      if (values.attributes && Array.isArray(values.attributes) && values.attributes.length > 0) {
        const attrValues: Attribute[] = values.attributes
          .filter((attr: AttributeFormItem) => attr.attr_id) // 只处理已存在的属性
          .map((attr: AttributeFormItem): Attribute => {
            const attribute: Attribute = {
              id: attr.id,
              business_type: 'inference_service',
              attr_id: attr.attr_id,
              name: attr.name,
              input_type: attr.inputType,
              required_tag: attr.required ? 1 : 0,
              data_type: 'string', // 默认数据类型为 string
            }
            // 如果是下拉选择类型，添加选择模式和选项值
            if (attr.inputType === '下拉选择') {
              attribute.multi_select = attr.selectMode === 'multiple' ? 1 : 0
              // attr_value作为用户选定的值 转换为 options
              if (attr.attr_value) {
                const selectedValues = Array.isArray(attr.attr_value)
                  ? attr.attr_value
                  : [attr.attr_value]
                attribute.options = selectedValues
                  .filter((val): val is string => typeof val === 'string' && val.trim() !== '')
                  .map((option: string): optionsItem => ({
                    option_value: option,
                  }))
              }
              else {
                attribute.options = []
              }
            }
            else {
              attribute.options = []
              // 处理 attr_value，可能是字符串或字符串数组
              if (attr.attr_value) {
                if (typeof attr.attr_value === 'string' && attr.attr_value.trim() !== '') {
                  attribute.attr_value = attr.attr_value
                }
                else if (Array.isArray(attr.attr_value) && attr.attr_value.length > 0) {
                  // 如果是数组，转换为字符串（手动输入类型）
                  attribute.attr_value = attr.attr_value.join(',')
                }
              }
            }
            return attribute
          })
        updateData.attr_values = attrValues
      }
      // 一次性更新服务信息和属性
      await inferenceServiceApi.update(updateData as UpdateServiceRequest, projectId)
      message.success('服务更新成功')
      onClose()
      onUpdateSuccess()
    }
    catch (error) {
      message.error('服务更新失败')
      console.error('更新服务失败:', error)
    }
    finally {
      updateServiceMutation.reset()
    }
  }
  return (
    <Modal
      className="top-[20px]"
      title="编辑推理服务"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={600}
      bodyStyle={{
        maxHeight: 'calc(100vh - 120px)',
        overflowY: 'auto',
        padding: '24px',
      }}
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          name="serviceName"
          label="服务名称"
          rules={[
            { required: true, message: '请输入模型名称' },
            { min: 2, max: 64, message: '模型名称长度为2-64个字符' },
            { pattern: /^(?!_|-)[\u4E00-\u9FA5a-zA-Z0-9._-]*$/, message: '模型名称只支持中英文、数字、小数点、中划线(-)、下划线(_)，且不能以下划线和中划线开头，不允许空格和特殊符号' },
          ]}
        >
          <Input placeholder="请输入服务名称" />
        </Form.Item>

        <Form.Item
          name="description"
          label="服务描述"
          rules={[
            { max: 1000, message: '服务描述不能超过1000个字符' },
          ]}
        >
          <Input.TextArea rows={3} placeholder="请输入服务描述" />
        </Form.Item>

        <Form.Item
          name="baseUrl"
          label="Base URL"
          rules={[
            { required: true, message: '请输入Base URL' },
            { type: 'url', message: '请输入有效的URL格式' },
          ]}
        >
          <Input placeholder="请输入Base URL" />
        </Form.Item>

        <Form.Item
          name="apiKey"
          label="API Key"
          rules={[
            // { required: true, message: '请输入API Key' },
            // { min: 32, max: 64, message: 'API Key长度为32-64个字符' },
            // { pattern: /^[a-zA-Z0-9_-]*$/, message: 'API Key只支持英文、数字、中划线(-)、下划线(_)，不允许包含中文和空格' },
          ]}
        >
          <Input placeholder="为确保安全，API Key不做展示。如需更新，请重新输入。" type="password" autoComplete="off" />
        </Form.Item>

        <Form.Item
          name="modelName"
          label="模型名称"
          rules={[
            { required: true, message: '请输入模型名称' },
            { min: 2, max: 64, message: '模型名称长度为2-64个字符' },
            { pattern: /^(?!_|-)[\u4E00-\u9FA5a-zA-Z0-9._-]*$/, message: '模型名称只支持中英文、数字、小数点、中划线(-)、下划线(_)，且不能以下划线和中划线开头，不允许空格和特殊符号' },
          ]}
        >
          <Input placeholder="请输入模型名称" />
        </Form.Item>

        <Form.Item
          name="modelType"
          label="模型类型"
          rules={[
            { required: true, message: '请选择模型类型' },
          ]}
        >
          <Select mode="multiple" placeholder="请选择模型类型" options={modelTypeOptions} />
        </Form.Item>

        {/* 属性编辑列表 */}
        <Form.List name="attributes">
          {(fields) => (
            <>
              {fields.map((field, index) => {
                const inputType = form.getFieldValue(['attributes', field.name, 'inputType'])
                const attributeName = form.getFieldValue(['attributes', field.name, 'name'])
                const options = form.getFieldValue(['attributes', field.name, 'options']) || [] // 已选定的选项值
                const attrOptions = form.getFieldValue(['attributes', field.name, 'attr_options']) || [] // 所有可选的选项值
                const multiSelect = form.getFieldValue(['attributes', field.name, 'multi_select'])
                const required = form.getFieldValue(['attributes', field.name, 'required']) // 获取是否必填
                // 确保 multi_select 转换为数字进行比较，处理 undefined/null 的情况
                const isMultiple = multiSelect !== undefined && multiSelect !== null && Number(multiSelect) === 1
                const isRequired = required === true
                const { key, ...restField } = field
                return (
                  <Space direction="vertical" className="w-full" size="small">
                    {/* 手动输入：属性名称：属性值输入框 */}
                    {inputType === '手动输入' && (
                      <Form.Item
                        {...restField}
                        name={[field.name, 'attr_value']}
                        label={attributeName || '属性值'}
                        rules={[
                          ...(isRequired ? [{ required: true, message: '请输入属性值' }] : []),
                          { max: 64, message: '属性值不能超过64个字符' },
                        ]}
                        className="mb-8"
                      >
                        <Input placeholder="请输入属性值" />
                      </Form.Item>
                    )}

                    {/* 下拉选择：属性名称：下拉选择框 */}
                    {inputType === '下拉选择' && (
                      <Form.Item
                        {...restField}
                        name={[field.name, 'attr_value']}
                        label={attributeName || '属性值'}
                        rules={[
                          ...(isRequired ? [{ required: true, message: '请选择属性值' }] : []),
                        ]}
                        className="mb-8"
                      >
                        <Select placeholder="请选择属性值" mode={isMultiple ? 'multiple' : undefined}>
                          {attrOptions.map((option: string, optIndex: number) => (
                            <Select.Option key={optIndex} value={option}>
                              {option}
                            </Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                    )}

                  </Space>
                )
              })}
            </>
          )}
        </Form.List>

        <Form.Item className="flex justify-end">
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" htmlType="submit" loading={updateServiceMutation.isPending}>
              保存
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  )
}
export default EditServiceModal
