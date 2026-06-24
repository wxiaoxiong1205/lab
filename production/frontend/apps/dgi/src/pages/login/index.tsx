import { Button, Form, Input } from 'antd'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { apiLogin } from '@/services/api'
import { useTransform } from '@/locales'
import { withBasePath } from '@/utils'

interface LoginForm {
  username: string
  password: string
}

export default function LoginPage() {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const { $t } = useTransform()

  const handleLogin = async (values: LoginForm) => {
    setLoading(true)
    try {
      const res = await apiLogin(values)
      localStorage.setItem('dgi-token', res.data)
      navigate('/')
    }
    catch (error) {
      console.error('登录失败:', error)
    }
    finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* 左侧内容区 */}
      <div
        className="w-1/2 bg-[#f5f9fc] p-12 flex flex-col relative"
        style={{
          backgroundImage: `url(${withBasePath('/login_background.jpg')})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="relative z-10">
          <div className="mb-12">
            <img
              src={withBasePath('/logo.png')}
              alt="Logo"
              width={220}
              height={40}
            />
          </div>

          <div className="max-w-[520px] text-[#272F3B] ml-[40px] mt-[100px]">
            <h1 className="text-2xl font-bold mb-4">{$t('DGI融合推理引擎')}</h1>
            <p className="leading-relaxed text-sm">
              {$t('DGI')}
              {$t(
                '是基于异构算力生态的融合推理引擎，致力于为企业提供标准化、高稳定、易扩展的模型加速推理与接口服务管理能力。通过智能资源调度和请求路由提高算力利用率，助力企业加速Agentic AI 应用落地。',
              )}
            </p>
          </div>
        </div>
      </div>

      {/* 右侧登录区 */}
      <div className="w-1/2 bg-white flex flex-col min-h-screen">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-[420px]">
            <h2 className="text-2xl font-bold mb-8">{$t('欢迎登录')}</h2>

            <Form
              form={form}
              onFinish={handleLogin}
              size="large"
              className="space-y-4"
            >
              <Form.Item
                name="username"
                rules={[{ required: true, message: $t('请输入账号') }]}
              >
                <Input
                  prefix={<UserOutlined className="text-gray-400" />}
                  placeholder={$t('请输入账号')}
                />
              </Form.Item>

              <Form.Item
                name="password"
                rules={[{ required: true, message: $t('请输入密码') }]}
              >
                <Input.Password
                  prefix={<LockOutlined className="text-gray-400" />}
                  placeholder={$t('请输入密码')}
                />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  className="w-full h-10 bg-blue-600"
                  loading={loading}
                >
                  {$t('登录')}
                </Button>
              </Form.Item>
            </Form>
          </div>
        </div>

        {/* 版权信息固定在底部 */}
        <div className="p-8 text-center text-gray-500 text-xs">
          {$t('Copyright © 2025 滴普科技 版权所有')}
        </div>
      </div>
    </div>
  )
}
