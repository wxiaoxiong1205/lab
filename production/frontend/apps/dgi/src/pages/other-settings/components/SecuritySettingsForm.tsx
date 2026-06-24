import { Button, Form, Input, Space, message } from 'antd'
import { useRequest } from 'ahooks'
import { useEffect, useState } from 'react'
import SecurityTestModal from './SecurityTestModal'
import {
  apiGetSecurityServer,
  apiSaveSecurityServer,
  apiSecurityServerConnectTest,
  apiSystemConfig,
} from '@/services/api'

export default function SecuritySettingsForm() {
  const [form] = Form.useForm()
  const [testModalOpen, setTestModalOpen] = useState(false)

  // 获取配置
  const {
    data: config,
    loading: configLoading,
    run: getConfig,
  } = useRequest(apiGetSecurityServer, {
    manual: true,
    onSuccess: (res) => {
      form.setFieldsValue({ security_server: res.data?.security_server || '' })
      form.setFieldsValue({ security_server_key: res.data?.security_server_key || '' })
    },
  })

  useEffect(() => {
    getConfig()
  }, [getConfig])

  // 保存配置
  const { run: saveConfig, loading: saveLoading } = useRequest(
    apiSaveSecurityServer,
    {
      manual: true,
      onSuccess: () => {
        message.success('保存成功')
      },
    },
  )

  // 连通性测试
  const { run: testConnect, loading: testConnectLoading } = useRequest(
    apiSecurityServerConnectTest,
    {
      manual: true,
      onSuccess: (res: any) => {
        if (res.data.success === false) {
          message.error(res.data.message || '连通性测试失败')
        }
        else {
          message.success(res.message || '连通性测试成功')
        }
      },
    },
  )

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      saveConfig(values)
    }
    catch (error) {
      console.error('Validation failed:', error)
    }
  }

  const handleConnectTest = async () => {
    try {
      const values = await form.validateFields()
      testConnect({ server_url: values.security_server, api_key: values.security_server_key })
    }
    catch (error) {
      console.error('Validation failed:', error)
    }
  }

  const handleOpenTestModal = async () => {
    try {
      await form.validateFields()
      setTestModalOpen(true)
    }
    catch (error) {
      console.error('Validation failed:', error)
    }
  }

  return (
    <>
      <Form form={form} layout="vertical" className="max-w-md">
        <Form.Item
          name="security_server"
          label="内容安全服务地址"
          rules={[{ required: true, message: '请输入模型安全服务地址' }]}
        >
          <Input placeholder="请输入模型安全服务地址" maxLength={50} />
        </Form.Item>
        <Form.Item
          name="security_server_key"
          label="访问令牌"
          rules={[{ required: true, message: '请输入访问令牌' }]}
        >
          <Input placeholder="请输入访问令牌" maxLength={50} />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button
              type="primary"
              onClick={handleSave}
              loading={saveLoading || configLoading}
            >
              保存
            </Button>
            <Button onClick={handleConnectTest} loading={testConnectLoading}>
              连通性测试
            </Button>
            <Button onClick={handleOpenTestModal}>测试</Button>
          </Space>
        </Form.Item>
      </Form>

      <SecurityTestModal
        open={testModalOpen}
        onCancel={() => setTestModalOpen(false)}
        serverUrl={form.getFieldValue('security_server')}
        apiKey={form.getFieldValue('security_server_key')}
      />
    </>
  )
}
