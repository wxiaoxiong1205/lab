import React from 'react'
import { Button, Form, Input, Modal, Radio, Select, message } from 'antd'
import type { WebHookItem } from './types.ts'
import { $t } from '@/locales'

interface WebHookModalProps {
  open: boolean
  editingWebHook?: WebHookItem
  typeList: { value: string, label: string }[]
  onClose: () => void
  onSubmit: (values: any) => Promise<void>
}

const WebHookModal: React.FC<WebHookModalProps> = ({
  open,
  editingWebHook,
  typeList,
  onClose,
  onSubmit,
}) => {
  const [form] = Form.useForm()
  const isEditing = !!editingWebHook

  const encryptMethod = Form.useWatch('encrypt_method', form)

  const encryptMethodOptions = [
    { value: 'none', label: '无' },
    { value: 'signature', label: '签名密钥' },
  ]

  // 表单提交
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      await onSubmit(values)
      // message.success(`${isEditing ? '编辑' : '创建'}成功`)
      // onClose()
    }
    catch (error) {
      // message.error(`${isEditing ? '编辑' : '创建'}失败`)
    }
  }

  // 重置表单
  React.useEffect(() => {
    if (open && editingWebHook) {
      form.setFieldsValue(editingWebHook)
    }
    else if (open) {
      form.resetFields()
    }
  }, [open, editingWebHook, form])

  return (
    <Modal
      title={isEditing ? $t('编辑Webhook') : $t('新建Webhook')}
      open={open}
      onOk={handleSubmit}
      onCancel={onClose}
      width={600}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {$t('取消')}
        </Button>,
        <Button key="submit" type="primary" onClick={handleSubmit}>
          {$t('确定')}
        </Button>,
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ type: 'dingtalk', encrypt_method: 'none' }}
      >
        <Form.Item
          name="name"
          label={$t('Webhook名称')}
          rules={[
            { required: true, message: $t('请输入Webhook名称') },
            { max: 20, message: $t('不能超过20个字符') },
            {
              pattern: /^[\u4E00-\u9FA5a-zA-Z0-9_]*$/,
              message: $t('只允许包含中文、字母、数字和下划线'),
            },
          ]}
        >
          <Input placeholder={$t('请输入Webhook名称')} />
        </Form.Item>

        <Form.Item
          name="url"
          label={$t('Webhook地址')}
          rules={[
            { required: true, message: $t('请输入Webhook地址') },
            { type: 'url', message: $t('请输入有效的URL地址') },
          ]}
        >
          <Input placeholder={$t('请输入Webhook地址')} />
        </Form.Item>

        <Form.Item
          name="type"
          label={$t('Webhook类型')}
          rules={[{ required: true, message: $t('请选择Webhook类型') }]}
        >
          <Radio.Group>
            {typeList.map((type) => (
              <Radio key={type.value} value={type.value}>{type.label}</Radio>
            ))}
          </Radio.Group>
        </Form.Item>

        <Form.Item
          name="encrypt_method"
          label={$t('加密方式')}
          rules={[{ required: true, message: $t('请选择加密方式') }]}
        >
          <Select>
            {encryptMethodOptions.map((option) => (
              <Select.Option key={option.value} value={option.value}>{option.label}</Select.Option>
            ))}
          </Select>
        </Form.Item>

        {encryptMethod === 'signature' && (
          <Form.Item
            name="secret"
            label={$t('密文')}
            rules={[
              { required: true, message: $t('请输入密文') },
              { max: 150, message: $t('不能超过150个字符') },
            ]}
          >
            <Input.Password placeholder={$t('请输入密文')} maxLength={150} />
          </Form.Item>
        )}

        <Form.Item
          name="description"
          label={$t('备注')}
          rules={[{ max: 150, message: $t('不能超过150字') }]}
        >
          <Input.TextArea
            placeholder={$t('不超过150字')}
            maxLength={150}
            showCount
            rows={4}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default WebHookModal
