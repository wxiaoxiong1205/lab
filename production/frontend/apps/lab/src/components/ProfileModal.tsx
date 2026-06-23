import React from 'react'
import { Button, Col, Input, Modal, Row } from 'antd'
import type { User } from '../types'
import useI18n from '../hooks/useI18n'

interface ProfileModalProps {
  visible: boolean
  onClose: () => void
  onChangePassword: () => void
  user: any | null
}
const ProfileModal: React.FC<ProfileModalProps> = ({ visible, onClose, onChangePassword, user }) => {
  const { t } = useI18n()
  return (
    <Modal
      title={t('user.profile')}
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t('user.cancel')}
        </Button>,
      ]}
      width={520}
      destroyOnClose
    >
      <div className="p-[20px_0]">
        {/* 用户基本信息 */}
        <Row className="mb-4">
          <Col span={6}>
            <label className="font-medium">
              {t('user.username')}
              ：
            </label>
          </Col>
          <Col span={18}>
            <Input value={user?.username || ''} disabled className="bg-[var(--lab-color-surface-page)]" />
          </Col>
        </Row>

        <Row className="mb-4">
          <Col span={6}>
            <label className="font-medium">
              {t('user.password')}
              ：
            </label>
          </Col>
          <Col span={18}>
            <div className="flex items-center">
              <Input value="**********" disabled className="bg-[var(--lab-color-surface-page)] mr-2" />
              <Button type="link" onClick={onChangePassword} className="p-0 text-[12px]">
                {t('user.changePassword')}
              </Button>
            </div>
          </Col>
        </Row>

        <Row className="mb-4">
          <Col span={6}>
            <label className="font-medium">
              {t('user.nickname')}
              ：
            </label>
          </Col>
          <Col span={18}>
            <Input value={user?.email || user?.username || ''} disabled className="bg-[var(--lab-color-surface-page)]" />
          </Col>
        </Row>
      </div>
    </Modal>
  )
}
export default ProfileModal
