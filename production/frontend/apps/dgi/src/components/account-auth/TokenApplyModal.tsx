import { Button, Checkbox, Col, Form, Input, Modal, Row, message } from 'antd'
import type { Rule } from 'antd/es/form'
import TextArea from 'antd/es/input/TextArea'
import { useEffect, useState } from 'react'
import { apiApprovalCreate } from '@/services/api'
import { useTransform } from '@/locales'
import { useSystemConfig } from '@/hooks/use-system-config'

interface TokenQuotaManageModalProps {
  open: boolean
  onCancel: () => void
}

export default function TokenQuotaManageModal({
  open,
  onCancel,
}: TokenQuotaManageModalProps) {
  const [form] = Form.useForm()
  const [equivalentAmount, setEquivalentAmount] = useState(0)
  const { $t } = useTransform()

  const tokenRuleItem = [
    ({ getFieldValue }) => ({ required: !getFieldValue('unlimited_quota'), message: $t('请输入申请额度') }),
    {
      validator: (_: unknown, value: number) => {
        if (value && String(value).length > 18) {
          return Promise.reject(new Error($t('申请额度不能超过18位')))
        }

        if (value < 0) {
          return Promise.reject(new Error($t('输入应为正整数')))
        }
        return Promise.resolve()
      },
    },
  ]
  const [tokenRule, setTokenRule] = useState<Rule[]>(tokenRuleItem)
  const { amountSymbol } = useSystemConfig(true)
  const [confirmLoading, setConfirmLoading] = useState(false)

  const handleApply = async () => {
    try {
      const values = await form.validateFields()
      setConfirmLoading(true)
      const params = {
        type: 1,
        content: JSON.stringify({
          balance_add: values.unlimited_quota ? 0 : Number(values.balance_add),
          unlimited_quota: !!values.unlimited_quota,
        }),
        apply_reason: values.apply_reason,
      }
      await apiApprovalCreate(params)
      message.success($t('提交成功'))
      onCancel()
    }
    catch (error) {
      setConfirmLoading(false)
    }
    finally {
      setConfirmLoading(false)
    }
  }

  const handleValuesChange = (changedValues: {
    unlimited_quota: boolean
    balance_add: number
  }) => {
    if ('balance_add' in changedValues) {
      setEquivalentAmount(changedValues.balance_add)
    }
    setTokenRule(changedValues.unlimited_quota ? [] : tokenRuleItem)
  }

  useEffect(() => {
    if (open) {
      setEquivalentAmount(0)
    }
    else {
      form.resetFields()
      setTokenRule(tokenRuleItem)
    }
  }, [open])

  const isUnlimited = Form.useWatch('unlimited_quota', form)

  return (
    <Modal
      title={$t('申请额度')}
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
          loading={confirmLoading}
          className="bg-[#1677ff]"
        >
          {$t('发起申请')}
        </Button>,
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        className="mt-4"
        onValuesChange={handleValuesChange}
      >
        <Row gutter={12}>
          <Col span={20}>
            <Form.Item
              label={$t('申请可用额度')}
              dependencies={['unlimited_quota']}
              name="balance_add"
              rules={tokenRule}
            // tooltip={$t(
            //   "该账号可用Token数量，基于价格1{symbol}={unit}Token，实际金额花费根据不同的模型输入输出价格决定",
            //   {
            //     symbol: amountSymbol,
            //     unit: quotaPerUnit / 10000 + "w",
            //   }
            // )}
            >
              <Input
                prefix={amountSymbol}
                type="number"
                disabled={isUnlimited}
                placeholder={$t('申请可用额度')}
                min={0}
              />
            </Form.Item>
          </Col>
          <Col span={4}>
            <Form.Item label=" " name="unlimited_quota" valuePropName="checked">
              <Checkbox>无限额度</Checkbox>
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label={$t('申请理由')} name="apply_reason">
          <TextArea
            rows={4}
            placeholder={$t('请输入申请理由')}
            maxLength={64}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
