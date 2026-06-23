import { Alert, Button, Descriptions, Modal, Spin, message } from 'antd'
import { CopyOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { useRequest } from 'ahooks'
import { useEffect } from 'react'
import copy from 'copy-to-clipboard'
import { apiSecretDetail } from '@/services/api'
import { useTransform } from '@/locales'

interface ViewAccessKeyModalProps {
  open: boolean
  onCancel: () => void
  accessId: number
}

export default function ViewAccessKeyModal({
  open,
  onCancel,
  accessId,
}: ViewAccessKeyModalProps) {
  const { $t } = useTransform()
  const { data, run, loading } = useRequest(
    () => apiSecretDetail(accessId).then((res) => res.data),
    {
      manual: true,
    },
  )

  useEffect(() => {
    if (open) {
      run()
    }
  }, [open])

  const onCopy = (text: string) => {
    copy(text)
    message.success($t('复制成功！'))
  }

  return (
    <Modal
      title={$t('查看密钥')}
      open={open}
      onCancel={onCancel}
      width={640}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          {$t('取消')}
        </Button>,
        <Button
          key="submit"
          type="primary"
          onClick={onCancel}
          className="bg-[#1677ff]"
        >
          {$t('确定')}
        </Button>,
      ]}
    >
      <Alert
        className="!mb-6"
        message={$t(
          '请您务必妥善保管！不要以任何方式公开到外部渠道，避免因未经授权的使用造成安全风险或资金损失。',
        )}
        type="warning"
        icon={<InfoCircleOutlined />}
        showIcon
      />
      <Spin spinning={loading}>
        <Descriptions column={1}>
          {/* <Descriptions.Item label={$t("网关访问内网地址")}>
            <a href={data?.gateway_inner_url} target="_blank">
              {data?.gateway_inner_url}
            </a>
          </Descriptions.Item> */}
          {/* <Descriptions.Item label={$t("网关访问外网地址")}>
            <a href={data?.gateway_out_url} target="_blank">
              {data?.gateway_out_url}
            </a>
          </Descriptions.Item> */}
          <Descriptions.Item label={$t('网关访问地址')}>
            <div>
              <span className="bg-gray-100 px-2 rounded font-mono mr-2">
                {data?.gateway_out_url}
              </span>
              <Button size="small" icon={<CopyOutlined />} onClick={() => onCopy(data?.gateway_out_url)} />
            </div>
          </Descriptions.Item>
          <Descriptions.Item label={$t('密钥')}>
            <div>
              <span className="bg-gray-100 px-2 rounded font-mono mr-2">
                sk-
                {data?.key}
                {' '}
              </span>
              <Button size="small" icon={<CopyOutlined />} onClick={() => onCopy(`sk-${data?.key}`)} />
            </div>
          </Descriptions.Item>
          {(data?.models && data?.models !== '') ? (
            <Descriptions.Item label={$t('可用模型')}>
              {data?.models}
            </Descriptions.Item>
          ) : null}
          {(data?.apis && data?.apis !== '') && (
            <Descriptions.Item label={$t('可用API')}>
              {data?.apis}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Spin>
    </Modal>
  )
}
