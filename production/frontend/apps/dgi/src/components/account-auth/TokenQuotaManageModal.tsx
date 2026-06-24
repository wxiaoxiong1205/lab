import { Button, Col, Form, Input, Modal, Row } from 'antd'
import { useEffect } from 'react'
import { useSystemConfig } from '@/hooks/use-system-config'
import { $t } from '@/locales'
import type { UserInfo } from '@/services/api'

interface TokenQuotaManageModalProps {
  open: boolean
  onCancel: () => void
  userInfo: UserInfo
  handleApply: () => void
}

export default function TokenQuotaManageModal({
  open,
  onCancel,
  userInfo,
  handleApply,
}: TokenQuotaManageModalProps) {
  const [form] = Form.useForm()
  const { amountSymbol } = useSystemConfig(true)

  useEffect(() => {
    form.setFieldsValue({
      balance: amountSymbol + userInfo.balance,
      used_balance: amountSymbol + userInfo.balance_consumed,
    })
  }, [userInfo])

  return (
    <Modal
      title={$t('用户额度')}
      open={open}
      onCancel={onCancel}
      width={640}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          取消
        </Button>,
        <Button
          key="submit"
          type="primary"
          onClick={handleApply}
          className="bg-[#1677ff]"
        >
          {$t('申请可用额度')}
        </Button>,
      ]}
    >
      {userInfo && (
        <Form form={form} layout="vertical" className="mt-4">
          {!userInfo!.unlimited_quota ? (
            <Row gutter={12}>
              <Col span={16}>
                <Form.Item
                  label={$t('账号可用额度')}
                  name="balance"
                >
                  <Input type="text" readOnly placeholder={$t('账号可用额度')} min={1} />
                </Form.Item>
              </Col>
            </Row>
          ) : (
            <Row>
              <Col>
                <p>{$t('账号可用额度')}</p>
                <Input type="text" value={$t('无限额度')} readOnly placeholder={$t('账号可用额度')} />
              </Col>
            </Row>
          )}
          <Row gutter={12} className="mt-2">
            <Col span={16}>
              <Form.Item
                label={$t('累计已用额度')}
                name="used_balance"
              >
                <Input type="text" readOnly placeholder={$t('累计已用额度')} min={1} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      )}
    </Modal>
  )
}
