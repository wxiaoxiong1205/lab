import React, { useEffect, useRef } from 'react'
import { AutoComplete, Button, Form, Input, Modal, Radio, Select, Space } from 'antd'
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import TextArea from 'antd/es/input/TextArea'
import { useQuery } from '@tanstack/react-query'
import { attributeService } from '@/services/inferenceService'
import type { BusinessAttrGroupItem } from '@/types/inference'

interface AttributeModalProps {
  visible: boolean
  editingRecord?: null // 不再支持编辑，始终为 null
  attributesData?: any[] // 不再需要，但保留以兼容现有调用
  form: any
  onCancel: () => void
  onSubmit: (values: any) => void
  businessType?: string
}
// Form.List 包装组件，用于处理自动创建字段
const OptionsFormList: React.FC<{
  form: any
}> = ({ form }) => {
  const prevOptionsLengthRef = useRef<number>(0)
  return (
    <Form.Item
      noStyle
      shouldUpdate={(prevValues, currentValues) => {
        const prevOptions = prevValues?.options || []
        const currentOptions = currentValues?.options || []
        return prevOptions.length !== currentOptions.length
          || JSON.stringify(prevOptions) !== JSON.stringify(currentOptions)
      }}
    >
      {() => {
        const currentOptions = form.getFieldValue('options') || []
        return (
          <Form.List name="options">
            {(fields, { add, remove }) => {
              // 如果字段数量少于 options 数组长度，需要添加字段并设置值
              if (Array.isArray(currentOptions)
                && currentOptions.length > 0
                && fields.length < currentOptions.length
                && currentOptions.length !== prevOptionsLengthRef.current) {
                // 添加字段并设置初始值
                // 注意：add() 的第一个参数是初始值
                const fieldsToAdd = currentOptions.length - fields.length
                for (let i = 0; i < fieldsToAdd; i++) {
                  const index = fields.length + i
                  const value = currentOptions[index]
                  add(value)
                }
                prevOptionsLengthRef.current = currentOptions.length
              }
              else if (Array.isArray(currentOptions) && currentOptions.length === 0) {
                prevOptionsLengthRef.current = 0
              }
              return (
                <>
                  {fields.map((field, index) => {
                    // 获取当前字段的值，确保值正确显示
                    const fieldValue = form.getFieldValue(['options', field.name])
                    const expectedValue = Array.isArray(currentOptions) ? currentOptions[index] : undefined
                    return (
                      <Form.Item
                        {...field}
                        key={field.key}
                        rules={[
                          { required: true, message: '请输入选项值' },
                          { max: 64, message: '选项值不能超过64个字符' },
                          {
                            validator: (_, value) => {
                              if (value && /\s/.test(value)) {
                                return Promise.reject(new Error('不能包含空格'))
                              }
                              return Promise.resolve()
                            },
                          },
                        ]}
                        className="mb-2"
                      >
                        <Space className="w-full" align="baseline">
                          <Input
                            className="w-[calc(100%)]"
                            placeholder="请输入选项值"
                            value={fieldValue !== undefined ? fieldValue : (expectedValue || '')}
                            onChange={(e) => {
                            // 过滤掉所有空格
                              const noSpaceValue = e.target.value.replace(/\s/g, '')
                              form.setFieldValue(['options', field.name], noSpaceValue)
                            }}
                          />
                          {fields.length > 1 && (<Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} />)}
                        </Space>
                      </Form.Item>
                    )
                  })}
                  <Form.Item>
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      添加选项
                    </Button>
                  </Form.Item>
                </>
              )
            }}
          </Form.List>
        )
      }}
    </Form.Item>
  )
}
const AttributeModal: React.FC<AttributeModalProps> = ({ visible, form, onCancel, onSubmit, businessType }) => {
  const allowManualInput = businessType === 'inference_service' || businessType === 'service_inference_external' || businessType === 'api_service'
  // 获取已有分组列表（仅用每项的 group 字段）
  const { data: attrGroupListRaw } = useQuery({
    queryKey: ['business-attr-group-list', businessType],
    queryFn: () => attributeService.groupList(businessType || ''),
    enabled: !!businessType && visible,
  })
  const attrGroupList: BusinessAttrGroupItem[] = Array.isArray(attrGroupListRaw) ? attrGroupListRaw : []
  const existingGroupNames = Array.from(new Set(attrGroupList.map((item) => item.group).filter((g): g is string => g != null && g !== '')))
  const groupOptions = existingGroupNames.map((name) => ({ value: name, label: name }))
  // 当弹窗打开时，重置表单并设置默认值
  useEffect(() => {
    if (visible) {
      form.resetFields()
      form.setFieldsValue({
        required: true,
        selectMode: 'single',
        options: [],
        ...(!allowManualInput && { inputType: '下拉选择' }),
      })
    }
  }, [visible, form, allowManualInput])
  return (
    <Modal title="新增属性" open={visible} onCancel={onCancel} footer={null} width={520}>
      <Form
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        initialValues={{
          required: true,
          selectMode: 'single',
          options: [],
        }}
      >
        <Form.Item
          name="name"
          label={(
            <span>
              属性名称
            </span>
          )}
          rules={[
            { required: true, message: '请输入属性名称' },
            { min: 2, max: 64, message: '属性名称长度为2-64个字符' },
            { pattern: /^(?!_|-)[\u4E00-\u9FA5a-zA-Z0-9._-]*$/, message: '模型名称只支持中英文、数字、小数点、中划线(-)、下划线(_)，且不能以下划线和中划线开头，不允许空格和特殊符号' },
          ]}
        >
          <Input placeholder="请输入属性名称" />
        </Form.Item>

        <Form.Item
          name="description"
          label="属性描述"
          rules={[
            { max: 1000, message: '属性描述不能超过200个字符' },
          ]}
        >
          <TextArea placeholder="请输入属性描述" rows={3} maxLength={1000} showCount />
        </Form.Item>

        <Form.Item name="group" label="属性分组">
          <AutoComplete placeholder="请输入或选择已有分组" options={groupOptions} filterOption={(inputValue, option) => (option?.value ?? '').toLowerCase().includes((inputValue || '').toLowerCase())} />
        </Form.Item>

        <Form.Item
          name="inputType"
          label={(
            <span>
              输入方式
            </span>
          )}
          rules={[
            { required: true, message: '请选择输入方式' },
          ]}
        >
          <Select
            placeholder="请选择输入方式"
            onChange={(value) => {
            // 切换输入方式时，重置下拉选择相关字段
              if (value !== '下拉选择') {
                form.setFieldsValue({
                  selectMode: 'single',
                  options: [],
                })
              }
            }}
          >
            {allowManualInput && <Select.Option value="手动输入">手动输入</Select.Option>}
            <Select.Option value="下拉选择">下拉选择</Select.Option>
          </Select>
        </Form.Item>

        {/* 当选择"下拉选择"时，显示单选/多选和选项值配置 */}
        <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.inputType !== currentValues.inputType}>
          {({ getFieldValue }) => {
            const inputType = getFieldValue('inputType')
            if (inputType === '下拉选择') {
              return (
                <>
                  <Form.Item
                    name="selectMode"
                    label={(
                      <span>
                        选择模式
                      </span>
                    )}
                    rules={[
                      { required: true, message: '请选择选择模式' },
                    ]}
                  >
                    <Radio.Group>
                      <Radio value="single">单选</Radio>
                      <Radio value="multiple">多选</Radio>
                    </Radio.Group>
                  </Form.Item>

                  <Form.Item
                    label={(
                      <span>
                        属性值
                      </span>
                    )}
                    required
                  >
                    <OptionsFormList form={form} />
                  </Form.Item>
                </>
              )
            }
            return null
          }}
        </Form.Item>

        <Form.Item
          name="required"
          label={(
            <span>
              是否必填
            </span>
          )}
          rules={[
            { required: true, message: '请选择是否必填' },
          ]}
        >
          <Radio.Group>
            <Radio value>是</Radio>
            <Radio value={false}>否</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item className="mb-0 mt-6 text-right">
          <Space>
            <Button onClick={onCancel}>取消</Button>
            <Button type="primary" htmlType="submit">
              确定
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  )
}
export default AttributeModal
