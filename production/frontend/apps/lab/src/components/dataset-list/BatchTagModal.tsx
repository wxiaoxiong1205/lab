import React from 'react'
import { Button, Form, Modal } from 'antd'
import { useTranslation } from 'react-i18next'

interface BatchTagModalProps {
  visible: boolean
  onCancel: () => void
  onSubmit: (values: { tag_ids: number[] }) => void
  loading: boolean
  selectedCount: number
}

export const BatchTagModal: React.FC<BatchTagModalProps> = ({
  visible,
  onCancel,
  onSubmit,
  loading,
  selectedCount,
}) => {
  const { t } = useTranslation()
  const [form] = Form.useForm()

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      onSubmit(values)
      form.resetFields()
    })
  }

  return (
    <Modal
      title={t('dataset.batchTag', { count: selectedCount })}
      open={visible}
      onCancel={() => {
        form.resetFields()
        onCancel()
      }}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          {t('common.cancel')}
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={loading}
          onClick={handleSubmit}
        >
          {t('common.confirm')}
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical">
        {/* 标签相关表单项已移除 */}
      </Form>
    </Modal>
  )
}
