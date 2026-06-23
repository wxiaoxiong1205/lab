import { Form, Input, Radio, Typography } from 'antd'

const { Title } = Typography

export default function ApiConfigForm(props: {
  requestTypeOptions: { label: string, value: string }[]
  protocolOptions: { label: string, value: string }[]
}) {
  const { requestTypeOptions, protocolOptions } = props
  return (
    <>
      <Title level={4} className="mb-4">API服务配置</Title>

      <Form.Item
        name="request_type"
        label="请求方式"
        rules={[{ required: true, message: '请选择请求类型' }]}
        initialValue={requestTypeOptions[0]?.value}
      >
        <Radio.Group options={requestTypeOptions} />
      </Form.Item>

      <Form.Item
        name="protocol"
        label="请求协议"
        rules={[{ required: true, message: '请选择请求协议' }]}
        initialValue={protocolOptions[0]?.value}
      >
        <Radio.Group options={protocolOptions} />
      </Form.Item>

      <Form.Item
        name="base_url"
        label="API地址"
        rules={[
          { required: true, message: '请输入API地址' },
          { max: 200, message: 'API地址最多200个字符' },
        ]}
      >
        <Input placeholder="请输入API地址" />
      </Form.Item>
    </>
  )
}
