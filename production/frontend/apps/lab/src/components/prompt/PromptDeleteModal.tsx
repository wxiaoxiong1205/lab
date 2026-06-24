import React from 'react'
import { Modal } from 'antd'
import useI18n from '../../hooks/useI18n'

interface PromptDeleteModalProps {
  visible: boolean
  onCancel: () => void
  onConfirm: () => void
}

const PromptDeleteModal: React.FC<PromptDeleteModalProps> = ({
  visible,
  onCancel,
  onConfirm,
}) => {
  const { t } = useI18n()

  return (
    <Modal
      title={t('prompt.delete')}
      open={visible}
      onCancel={onCancel}
      onOk={onConfirm}
      okText={t('common.delete')}
      okButtonProps={{ danger: true }}
      cancelText={t('common.cancel')}
    >
      <p>{t('prompt.deleteConfirm')}</p>
    </Modal>
  )
}

export default PromptDeleteModal
