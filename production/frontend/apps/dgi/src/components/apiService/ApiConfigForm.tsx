import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Form, Input, Radio, Typography } from 'antd'

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
        label="API地址"
        required
      >
        <Form.List
          name="urls"
          initialValue={['']}
          rules={[
            {
              validator: async (_, list: string[]) => {
                const valid = (list || []).map((u) => (typeof u === 'string' ? u.trim() : '')).filter(Boolean)
                if (!valid.length) {
                  throw new Error('至少填写一个 API 地址')
                }
              },
            },
          ]}
        >
          {(fields, { add, remove }) => (
            <div className="w-full max-w-[640px]">
              {fields.map((field) => (
                <div key={field.key} className="flex gap-2 items-start w-full mb-2">
                  <Form.Item
                    name={field.name}
                    className="mb-0 flex-1 min-w-0 w-full"
                    rules={[
                      { required: true, message: '请输入API地址' },
                      { max: 200, message: 'API地址最多200个字符' },
                    ]}
                  >
                    <Input placeholder="请输入API地址" className="w-full" />
                  </Form.Item>
                  {fields.length > 1 && (
                    <MinusCircleOutlined
                      className="!text-red-500 !cursor-pointer !shrink-0 !mt-2"
                      onClick={() => remove(field.name)}
                    />
                  )}
                </div>
              ))}
              <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} className="w-full">
                添加 API 地址
              </Button>
            </div>
          )}
        </Form.List>
      </Form.Item>
    </>
  )
}
