import React from 'react'
import {
  Button,
  Card,
  Divider,
  Form,
  Input,
  Select,
  Space,
  Tooltip,
} from 'antd'
import {
  MinusCircleOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import useI18n from '../../hooks/useI18n'

const { TextArea } = Input
const { Option } = Select

// 支持的消息角色
const MESSAGE_ROLES = [
  { value: 'system', label: 'System' },
  { value: 'human', label: 'Human' },
  { value: 'assistant', label: 'Assistant' },
  { value: 'function', label: 'Function' },
]

interface PromptFormFieldsProps {}

const PromptFormFields: React.FC<PromptFormFieldsProps> = () => {
  const { t } = useI18n()
  // 监听 template_format 字段（自动获取最近的 Form 实例）
  const templateFormat = Form.useWatch('template_format')

  // 动态 placeholder
  const getContentPlaceholder = () => {
    if (templateFormat === 'f-string') {
      return '请输入内容，支持按此格式书写变量：{USER_NAME}'
    }
    // 默认 jinja2
    return '请输入内容，支持按此格式书写变量：{{USER_NAME}}'
  }

  return (
    <>
      <Form.Item
        name="title"
        label="提示词名称"
        rules={[{ required: true, message: '请输入提示词名称' }]}
      >
        <Input placeholder="请输入提示词名称" />
      </Form.Item>

      <Form.Item name="description" label="提示词描述">
        <TextArea rows={2} placeholder="请输入提示词描述" />
      </Form.Item>

      {/* 新增 template_format 字段 */}
      <Form.Item
        name="template_format"
        label="模板格式"
        rules={[{ required: true, message: '请选择模板格式' }]}
        initialValue="jinja2"
      >
        <Select>
          <Option value="f-string">f-string</Option>
          <Option value="jinja2">jinja2</Option>
        </Select>
      </Form.Item>

      <Form.Item label="提示词配置">
        <Form.List name="messages">
          {(fields, { add, remove }) => (
            <>
              {fields.map((field) => (
                <Card key={field.key} className="mb-4">
                  <Form.Item
                    {...field}
                    name={[field.name, 'role']}
                    label={t('prompt.role')}
                    rules={[
                      { required: true, message: t('prompt.roleRequired') },
                    ]}
                  >
                    <Select placeholder={t('prompt.selectRole')}>
                      {MESSAGE_ROLES.map((role) => (
                        <Option key={role.value} value={role.value}>
                          {role.label}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                  <Form.Item
                    {...field}
                    name={[field.name, 'content']}
                    label={t('prompt.content')}
                    rules={[
                      { required: true, message: t('prompt.contentRequired') },
                    ]}
                  >
                    <TextArea
                      rows={3}
                      placeholder={getContentPlaceholder()}
                    />
                  </Form.Item>
                  <Button
                    type="text"
                    danger
                    icon={<MinusCircleOutlined />}
                    onClick={() => remove(field.name)}
                    className="absolute top-2 right-2"
                  >
                    {t('common.delete')}
                  </Button>
                </Card>
              ))}
              <Form.Item>
                <Button
                  type="dashed"
                  onClick={() => add({ role: 'system', content: '' })}
                  block
                  icon={<PlusOutlined />}
                >
                  {t('prompt.addMessage')}
                </Button>
              </Form.Item>
            </>
          )}
        </Form.List>
      </Form.Item>
    </>
  )
}

export default PromptFormFields
