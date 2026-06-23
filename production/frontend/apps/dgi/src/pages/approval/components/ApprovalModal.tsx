import {
  Button,
  Descriptions,
  Input,
  Modal,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ModalProps } from 'antd'
import dayjs from 'dayjs'
import { useRequest } from 'ahooks'
import type { SetStateAction } from 'react'
import { useEffect, useState } from 'react'
import { useTransform } from '@/locales'
import { apiApproves, apiApprovesReject } from '@/services/api'

const { Text } = Typography

interface ApprovalModalProps extends ModalProps {
  open: boolean
  isLoading: boolean
  onSuccess?: () => void
  onCancel?: () => void
  approvalDetails: any
  isApproval: boolean
  type?: number
}

export default function ApprovalModal({
  open,
  isLoading,
  onSuccess,
  onCancel,
  approvalDetails,
  isApproval,
  type,
}: ApprovalModalProps) {
  const { $t } = useTransform()
  const [approver_reason, setApproverReason] = useState('')
  const [approvalOpen, setApprovalOpen] = useState(false)

  const renderApprovalResult = (result?: number) => {
    switch (result) {
      case 2:
        return <Tag color="success">{$t('通过')}</Tag>
      case 3:
        return <Tag color="error">{$t('不通过')}</Tag>
      default:
        return <Tag color="processing">{$t('待审批')}</Tag>
    }
  }

  const parseContent = (content: string, category: string = 'model') => {
    let applyContent
    try {
      const parseContent = JSON.parse(content)
      switch (type) {
        // 额度
        case 1:
          applyContent = parseContent?.unlimited_quota
            ? $t('无限额度')
            : parseContent?.balance_add
          break

        // 模型
        case 2: {
          if (category === 'model') {
            const model_names: string[] = parseContent?.model_names ?? []
            applyContent = (
              model_names.map((item) => (
                <Tag className="mb-2!" key={item}>{item}</Tag>
              ))
            )
          }
          else {
            const api_names: string[] = parseContent?.api_names ?? []
            applyContent = (
              api_names.map((item) => (
                <Tag className="mb-2!" key={item}>{item}</Tag>
              ))
            )
          }
        }
      }
    }
    catch {
      applyContent = 0
    }
    return applyContent
  }

  useEffect(() => {
    if (!open) {
      setApproverReason('')
    }
  }, [open])

  const { loading, run: runApiApproves } = useRequest(
    async (params: {
      isAllowed: boolean
      id: number
      approver_reason: string
    }) =>
      params.isAllowed
        ? apiApproves(params.id)
        : apiApprovesReject(params.id, params.approver_reason),
    {
      manual: true, // 手动触发
      onSuccess: (data) => {
        message.success(data.data)
        onSuccess!()
      },
      onError: (error) => {
        message.error(`获取失败: ${error.message}`)
      },
    },
  )

  const onApprove = (isAllowed: boolean) => {
    if (!isAllowed && !approver_reason)
      return message.warning('请填写审批意见')
    const params: { [key: string]: string | boolean } = {
      isAllowed,
      id: approvalDetails.id,
    }

    params.approver_reason = !isAllowed ? approver_reason : ''
    runApiApproves(params as any)
    if (!isAllowed) {
      setApprovalOpen(false)
    }
    onSuccess!()
  }

  const handleChange = (value: {
    target: { value: SetStateAction<string> }
  }) => {
    setApproverReason(value.target.value)
  }

  const handleApprove = () => {
    onApprove(false)
  }

  return (
    <>
      <Modal
        title={$t('审批')}
        width={900}
        footer={
          !isApproval
            ? null
            : [
                <Button key="cancel" onClick={() => setApprovalOpen(true)}>
                  {$t('不通过')}
                </Button>,
                <Button
                  key="submit"
                  type="primary"
                  className="bg-[#1677ff]"
                  onClick={() => onApprove(true)}
                >
                  {$t('通过')}
                </Button>,
              ]
        }
        open={open}
        onCancel={onCancel}
      >
        <Spin spinning={isLoading}>
          <div className="flex gap-4">
            <div className="w-90">
              <div className="border-l-4 border-blue-600 pl-2 text-base mb-4">
                {type === 1 ? $t('申请额度') : $t('申请模型')}
              </div>
              <Descriptions
                column={1}
                bordered
                labelStyle={{ whiteSpace: 'nowrap' }}
                contentStyle={{ wordBreak: 'break-all' }}
              >
                <Descriptions.Item label={type === 1 ? $t('申请额度') : $t('申请模型')}>
                  <Text strong>{parseContent(approvalDetails?.content)}</Text>
                </Descriptions.Item>
                {type === 2 && (
                  <Descriptions.Item label={$t('申请API')}>
                    {parseContent(approvalDetails?.content, 'api')}
                  </Descriptions.Item>
                )}
              </Descriptions>
            </div>
            <div className="flex-1">
              <div className="border-l-4 border-blue-600 pl-2 text-base mb-4">
                {$t('申请信息')}
              </div>
              <Descriptions column={1} bordered>
                <Descriptions.Item label={$t('申请人')}>
                  <Text strong>{approvalDetails?.applicant_name || '-'}</Text>
                </Descriptions.Item>
                <Descriptions.Item label={$t('申请时间')}>
                  {approvalDetails?.created_time
                    ? dayjs(approvalDetails.created_time * 1000).format(
                        'YYYY-MM-DD HH:mm:ss',
                      )
                    : '-'}
                </Descriptions.Item>
              </Descriptions>

              <div className="text-base mt-4 first-letter:">
                {$t('申请理由')}
              </div>

              <div className="p-4 bg-gray-50 rounded mb-4 mt-2">
                <Text>{approvalDetails?.apply_reason || '-'}</Text>
              </div>

              <div className="border-l-4 border-blue-600 pl-2 text-base mb-4">
                {$t('审批信息')}
              </div>
              <Descriptions column={1} bordered>
                <Descriptions.Item label={$t('审批结果')}>
                  {renderApprovalResult(approvalDetails?.status)}
                </Descriptions.Item>
                <Descriptions.Item label={$t('审批人')}>
                  {approvalDetails?.approver_name || '-'}
                </Descriptions.Item>
                <Descriptions.Item label={$t('审批时间')}>
                  {approvalDetails?.approved_time
                    ? dayjs(
                        Number(approvalDetails.approved_time) * 1000,
                      ).format('YYYY-MM-DD HH:mm:ss')
                    : '-'}
                </Descriptions.Item>
                <Descriptions.Item label={$t('审批意见')}>
                  {/* {isApproval ? (
                  <Input
                    style={{
                      border: "none",
                      boxShadow: "none",
                      backgroundColor: "transparent",
                    }}
                    className="!border-none focus:!border-none"
                    value={approver_reason}
                    onChange={handleChange}
                    placeholder={$t("请填写审批意见")}
                  />
                ) : ( */}
                  {approvalDetails?.approver_reason || '-'}
                </Descriptions.Item>
              </Descriptions>
            </div>
          </div>
        </Spin>
      </Modal>
      <Modal
        title={$t('请填写审批意见')}
        width={400}
        footer={[
          <Button key="cancel" onClick={() => setApprovalOpen(false)}>
            {$t('取消')}
          </Button>,
          <Button
            key="submit"
            type="primary"
            className="bg-[#1677ff]"
            loading={loading}
            onClick={() => handleApprove()}
          >
            {$t('确定')}
          </Button>,
        ]}
        open={approvalOpen}
        onCancel={() => setApprovalOpen(false)}
      >

        <Input
          value={approver_reason}
          onChange={handleChange}
          placeholder={$t('请填写审批意见')}
        />
      </Modal>
    </>
  )
}
