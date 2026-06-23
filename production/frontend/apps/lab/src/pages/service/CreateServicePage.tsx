import React, { useEffect, useState } from 'react'
import { Alert, Button, Card, Checkbox, Divider, Form, Input, Select, Typography, message } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { attributeService, inferenceServiceApi } from '../../services/inferenceService'
import type { ApiResponse, Attribute, CreateServiceRequest } from '../../types/inference'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'

const { Title } = Typography
const { TextArea } = Input

// API 返回的属性数据类型
interface ApiAttribute {
  id: number
  name: string // 属性名称
  description: string // 属性描述
  input_type: string // 输入方式
  required_tag: number // 是否必填：1=必填，0=非必填
  multi_select?: number // 下拉选择模式：0=单选，1=多选（仅下拉选择类型有）
  options?: Array<{ option_value: string, option_order?: number } | string> // 选项列表（仅下拉选择类型有）
  [key: string]: any
}

// 已从inferenceService导入CreateServiceRequest类型，使用统一的接口定义

const CreateServicePage: React.FC = () => {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const [form] = Form.useForm()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 获取属性列表
  const { data: attributesData, isLoading: attributesLoading, error: attributesError } = useQuery<ApiResponse>({
    queryKey: ['attributes', 'inference_service', projectId],
    queryFn: async () => {
      if (!projectId) {
        throw new Error('项目ID不存在')
      }
      return await attributeService.list({ page: 1, size: 100, business_type: 'inference_service' })
    },
    enabled: !!projectId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  })

  // 处理属性列表错误
  useEffect(() => {
    if (attributesError) {
      console.error('获取属性列表失败:', attributesError)
      message.error('获取属性列表失败')
    }
  }, [attributesError])

  // 获取属性列表数据
  const attributes: ApiAttribute[] = Array.isArray(attributesData?.items)
    ? (attributesData.items as unknown as ApiAttribute[])
    : []

  // 调用实际API创建服务
  const createServiceMutation = useMutation({
    mutationFn: async (data: CreateServiceRequest) => {
      const response = await inferenceServiceApi.create(data, projectId)
      return response
    },
    onMutate: () => {
      setIsSubmitting(true)
    },
    onSuccess: (response) => {
      form.resetFields()
      setIsSubmitting(false)
      // 返回上一级页面
      navigate(-1)
    },
  })

  // 返回上一页
  const handleBack = () => {
    navigate(-1)
  }

  // 提交表单
  const handleSubmit = (values: any) => {
    // 构建 attr_values 数组
    const attrValues: Attribute[] = []

    // 处理手动输入类型的属性
    attributes
      .filter((attr) => attr.input_type === '手动输入')
      .forEach((attr) => {
        const inputValue = values[`manualInput_${attr.id}`]
        // 如果属性有值，则添加到数组中（必填项已通过表单验证确保有值）
        if (inputValue !== undefined && inputValue !== null && inputValue !== '') {
          attrValues.push({
            business_type: 'inference_service',
            attr_id: attr.id,
            attr_value: inputValue, // 使用用户输入的值
            data_type: attr.data_type,
            required_tag: attr.required_tag,
            name: attr.name,
            input_type: attr.input_type,
            options: [], // 手动输入类型，options 为空数组
          })
        }
      })

    // 处理下拉选择类型的属性
    attributes
      .filter((attr) => attr.input_type === '下拉选择')
      .forEach((attr) => {
        const selectedValue = values[`dropdown_${attr.id}`]
        // 如果该属性有选择值，添加到数组中
        if (selectedValue !== undefined && selectedValue !== null && selectedValue !== '') {
          const selectedValuesArray = Array.isArray(selectedValue) ? selectedValue : [selectedValue]
          const options: { option_value: string }[] = selectedValuesArray.map((value: string) => ({
            option_value: value,
          }))

          attrValues.push({
            business_type: 'inference_service',
            attr_id: attr.id,
            data_type: attr.data_type,
            required_tag: attr.required_tag,
            name: attr.name,
            input_type: attr.input_type,
            multi_select: attr.multi_select ?? 0, // 下拉选择模式：0=单选，1=多选
            options, // 只包含用户选中的选项
          })
        }
      })

    // 构建提交数据
    const submitData: CreateServiceRequest = {
      name: values.name,
      description: values.description || '',
      api_key: values.api_key,
      base_url: values.base_url,
      model_name: values.model_name,
      model_type: values.model_type,
      attr_values: attrValues,
    }

    createServiceMutation.mutate(submitData)
  }

  return (
    <div className="create-form-page">
      <section className="create-form-card">
        <CreateFormPageHeader
          title="创建服务"
          onBack={handleBack}
          actions={(
            <>
              <Button className="create-form-cancel" onClick={handleBack}>取消</Button>
              <Button className="create-form-submit" type="primary" onClick={() => form.submit()} loading={isSubmitting}>创建</Button>
            </>
          )}
        />
        <div className="create-form-divider" />
        <div className="create-form-body">

          {/* 错误提示 */}
          {createServiceMutation.isError && (
            <Alert
              message="创建服务失败"
              description={createServiceMutation.error instanceof Error ? createServiceMutation.error.message : '请检查表单信息并稍后重试'}
              type="error"
              showIcon
              className="mb-4"
            />
          )}

          {/* 表单卡片 */}
          <Card>
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              autoComplete="off"
            >
              {/* 基本信息 */}
              <div className="mb-8">
                <Title level={4} className="mb-4">基本信息</Title>

                {/* 服务名称 */}
                <Form.Item
                  name="name"
                  label="服务名称"
                  rules={[
                    { required: true, message: '请输入模型名称' },
                    { min: 2, max: 64, message: '模型名称长度为2-64个字符' },
                    { pattern: /^(?!_|-)[\u4E00-\u9FA5a-zA-Z0-9._-]*$/, message: '模型名称只支持中英文、数字、小数点、中划线(-)、下划线(_)，且不能以下划线和中划线开头，不允许空格和特殊符号' },
                  ]}
                >
                  <Input
                    placeholder="请输入服务名称"
                    maxLength={64}
                    showCount
                  />
                </Form.Item>

                {/* 服务描述 */}
                <Form.Item
                  name="description"
                  label="服务描述"
                  rules={[
                    { max: 1000, message: '服务描述不能超过1000个字符' },
                  ]}
                >
                  <TextArea
                    placeholder="请输入服务描述，1000字符以内"
                    rows={3}
                    maxLength={1000}
                    showCount
                  />
                </Form.Item>
              </div>

              {/* 属性配置 */}
              {attributes && attributes.length > 0 && (
                <>
                  <Divider />
                  <div className="mb-8">
                    {/* <Title level={4} className="mb-4">属性配置</Title> */}

                    {/* 显示手动输入类型的属性（每个属性一个输入框） */}
                    {attributes
                      .filter((attr) => attr.input_type === '手动输入')
                      .map((attr) => (
                        <Form.Item
                          key={attr.id}
                          name={`manualInput_${attr.id}`}
                          label={(
                            <span>
                              {attr.name}
                            </span>
                          )}
                          rules={[
                            ...(attr.required_tag === 1
                              ? [{ required: true, message: `请输入${attr.name}` }]
                              : []),
                            { max: 64, message: '输入值不能超过64个字符' },
                          ]}
                        >
                          <Input
                            placeholder="请输入属性值"
                            maxLength={64}
                            showCount
                          />
                        </Form.Item>
                      ))}

                    {/* 显示下拉选择类型的属性（每个属性一个下拉选择框） */}
                    {attributes
                      .filter((attr) => attr.input_type === '下拉选择')
                      .map((attr) => {
                        // 处理 options 数据：从对象数组中提取 option_value
                        const optionsArray = attr.options || []
                        const selectOptions = optionsArray.map((option: any) => {
                          // 如果 option 是对象，提取 option_value；如果是字符串，直接使用
                          if (typeof option === 'string') {
                            return option
                          }
                          else if (option && typeof option === 'object' && option.option_value) {
                            return option.option_value
                          }
                          return ''
                        }).filter(Boolean)

                        // multi_select: 0代表单选，1代表多选
                        const isMultiple = attr.multi_select === 1

                        return (
                          <Form.Item
                            key={attr.id}
                            name={`dropdown_${attr.id}`}
                            label={(
                              <span>
                                {attr.name}
                              </span>
                            )}
                            rules={[
                              ...(attr.required_tag === 1
                                ? [{ required: true, message: '请选择必选属性值' }]
                                : []),
                            ]}
                          >
                            <Select
                              mode={isMultiple ? 'multiple' : undefined}
                              placeholder="请选择属性值"
                              allowClear
                              showSearch
                              filterOption={(input, option) => {
                                const value = option?.value as string
                                return value ? value.toLowerCase().includes(input.toLowerCase()) : false
                              }}
                              options={selectOptions.map((optionValue: string) => ({
                                label: optionValue,
                                value: optionValue,
                              }))}
                            />
                          </Form.Item>
                        )
                      })}
                  </div>
                </>
              )}

              <Divider />

              {/* 模型服务配置 */}
              <div>
                <Title level={4} className="mb-4">模型服务配置</Title>
                {/* Base URL */}
                <Form.Item
                  name="base_url"
                  label="Base URL"
                  rules={[
                    { required: true, message: '请输入Base URL' },
                    { type: 'url', message: '请输入有效的URL格式' },
                  ]}
                >
                  <Input
                    placeholder="例如: http://101.153.150.150:2215/v1/chat/completions"
                  />
                </Form.Item>

                {/* API Key */}
                <Form.Item
                  name="api_key"
                  label="API Key"
                  rules={[
                    { required: true, message: '请输入API Key' },
                    // { min: 32, max: 64, message: 'API Key长度为32-64个字符' },
                    // { pattern: /^[a-zA-Z0-9_-]*$/, message: 'API Key只支持英文、数字、中划线(-)、下划线(_)，不允许包含中文和空格' },
                  ]}
                >
                  <Input
                    placeholder="请输入API Key"
                  />
                </Form.Item>

                {/* 模型名称 */}
                <Form.Item
                  name="model_name"
                  label="模型名称"
                  rules={[
                    { required: true, message: '请输入模型名称' },
                    { min: 2, max: 64, message: '模型名称长度为2-64个字符' },
                    { pattern: /^(?!_|-)[\u4E00-\u9FA5a-zA-Z0-9._-]*$/, message: '模型名称只支持中英文、数字、小数点、中划线(-)、下划线(_)，且不能以下划线和中划线开头，不允许空格和特殊符号' },
                  ]}
                >
                  <Input
                    placeholder="请输入模型名称"
                    allowClear
                    maxLength={64}
                    showCount
                  />
                </Form.Item>

                {/* 模型类型 */}
                <Form.Item
                  name="model_type"
                  label="模型类型"
                  rules={[
                    { required: true, message: '请选择模型类型' },
                  ]}
                >
                  <Checkbox.Group>
                    <Checkbox value="文本生成">文本生成</Checkbox>
                    <Checkbox value="图像理解">图像理解</Checkbox>
                  </Checkbox.Group>
                </Form.Item>
              </div>

            </Form>
          </Card>
        </div>
      </section>
    </div>
  )
}

export default CreateServicePage
