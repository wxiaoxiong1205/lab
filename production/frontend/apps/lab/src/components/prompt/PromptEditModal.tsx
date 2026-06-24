import React from 'react'
import type { FormInstance } from 'antd'
import { Button, Form, Modal, Space } from 'antd'
import useI18n from '../../hooks/useI18n'
import PromptFormFields from './PromptFormFields'

// 定义表单值类型
export interface PromptFormValues {
  title: string
  description?: string
  project_id?: number
  messages?: Array<{ role: string, content: string }>
  input_variables?: string[]
  content?: string // 可选的内容字段
  template_format?: string // 可选的模板格式
}

interface PromptEditModalProps {
  visible: boolean
  form: FormInstance
  onCancel: () => void
  onSubmit: (values: PromptFormValues) => void
}

const PromptEditModal: React.FC<PromptEditModalProps> = ({
  visible,
  form,
  onCancel,
  onSubmit,
}) => {
  const { t } = useI18n()

  return (
    <Modal
      title={t('prompt.edit')}
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={800}
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <PromptFormFields />
        <Form.Item>
          <div className="text-right">
            <Space>
              <Button onClick={onCancel}>{t('common.cancel')}</Button>
              <Button type="primary" htmlType="submit">
                {t('common.save')}
              </Button>
            </Space>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default PromptEditModal
