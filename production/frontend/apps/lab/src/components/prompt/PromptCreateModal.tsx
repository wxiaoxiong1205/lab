import React from 'react'
import { Button, Form, Modal, Space } from 'antd'
import useI18n from '../../hooks/useI18n'
import PromptFormFields from './PromptFormFields'

interface PromptCreateModalProps {
  visible: boolean
  form: any
  onCancel: () => void
  onSubmit: (values: any) => void
}

const PromptCreateModal: React.FC<PromptCreateModalProps> = ({
  visible,
  form,
  onCancel,
  onSubmit,
}) => {
  const { t } = useI18n()

  return (
    <Modal
      title={t('prompt.create')}
      open={visible}
      onCancel={onCancel}
      footer={null}
      width="80%"
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <PromptFormFields />
        <Form.Item>
          <div className="text-right">
            <Space>
              <Button onClick={onCancel}>{t('common.cancel')}</Button>
              <Button type="primary" htmlType="submit">
                {t('common.create')}
              </Button>
            </Space>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default PromptCreateModal
