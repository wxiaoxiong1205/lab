import { Form, Input, Typography } from 'antd'

const { Title } = Typography

export default function BaseForm({ canEdit }: { canEdit: boolean }) {
  return (
    <>
      <Title level={4} className="mb-4">基本信息</Title>

      <Form.Item
        name="name"
        label="API名称"
        rules={[
          { required: true, message: '请输入API名称' },
          { max: 64, message: 'API名称最多64个字符' },
        ]}
      >
        <Input placeholder="请输入API名称" readOnly={!canEdit} />
      </Form.Item>

      <Form.Item
        name="description"
        label="API服务描述"
        rules={[{ max: 500, message: 'API服务描述最多500个字符' }]}
      >
        <Input.TextArea placeholder="请输入API描述" className="!h-20" readOnly={!canEdit} maxLength={500} showCount />
      </Form.Item>
    </>
  )
}
