import { Button, Form, Input, Modal, message } from 'antd'
import { useRequest } from 'ahooks'
import { useEffect, useState } from 'react'
import { apiSecurityServerTest } from '@/services/api'

interface SecurityTestModalProps {
  open: boolean
  onCancel: () => void
  serverUrl: string
  apiKey: string
}

export default function SecurityTestModal({
  open,
  onCancel,
  serverUrl,
  apiKey,
}: SecurityTestModalProps) {
  const [form] = Form.useForm()
  const [result, setResult] = useState<string>('')

  // 每次打开弹窗时重置数据
  useEffect(() => {
    if (open) {
      form.resetFields()
      setResult('')
    }
  }, [open, form])

  const { run: testService, loading } = useRequest(apiSecurityServerTest, {
    manual: true,
    onSuccess: (res) => {
      setResult(JSON.stringify(res.data, null, 2))
    },
    onError: () => {
      // message.error("测试失败");
    },
  })

  const handleTest = async () => {
    try {
      const values = await form.validateFields()
      testService({
        server_url: serverUrl,
        content: values.content,
        api_key: apiKey,
      })
    }
    catch (error) {
      console.error('Validation failed:', error)
    }
  }

  return (
    <Modal
      title="安全服务测试"
      open={open}
      onCancel={onCancel}
      footer={null}
      width={600}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="content"
          label="测试内容"
          rules={[{ required: true, message: '请输入测试内容' }]}
        >
          <Input.TextArea placeholder="请输入需要测试的内容" rows={4} />
        </Form.Item>
        <Form.Item>
          <Button type="primary" onClick={handleTest} loading={loading}>
            开始测试
          </Button>
        </Form.Item>
        {result && (
          <Form.Item label="测试结果">
            <pre className="bg-gray-50 p-4 rounded overflow-auto max-h-[300px]">
              {result}
            </pre>
          </Form.Item>
        )}
      </Form>
    </Modal>
  )
}
