import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, Card, Form, Input, Select, Space, Spin, Typography, message } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { registryService } from '../services/registryService'
import type { AuthType, RegistryConfig, RegistryConfigCreateUpdate, RegistryType } from '../types'
import './RegistryConfigForm.css'

const { Title, Text } = Typography
const { Option } = Select
const { Password } = Input
/**
 * 镜像仓库配置创建/编辑页面
 */
const RegistryConfigForm = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams<{
    id: string
  }>()
  const [searchParams] = useSearchParams()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editingConfig, setEditingConfig] = useState<RegistryConfig | null>(null)
  const [authType, setAuthType] = useState<AuthType>('none')
  const [registryType, setRegistryType] = useState<RegistryType>('private_harbor')
  const isEditMode = !!id
  const isViewMode = searchParams.get('view') === 'true' || (editingConfig && (editingConfig.cluster_number || 0) > 0)
  // 加载编辑数据
  useEffect(() => {
    if (id) {
      loadConfig(parseInt(id))
    }
  }, [id])
  const { data: registryTypeEnum, isLoading: registryTypeEnumLoading } = useQuery({
    queryKey: ['registryTypeEnum'],
    queryFn: () => registryService.getRegistryTypeEnum(),
  })
  // 2. 添加数据同步逻辑
  useEffect(() => {
    if (registryTypeEnum && !isEditMode) {
      form.setFieldsValue({
        registry_type: 'private_harbor',
      })
    }
    if (id) {
      form.setFieldsValue({
        name: editingConfig?.name,
        registry_type: editingConfig?.type,
        repository_address: editingConfig?.repository_address,
        auth_type: editingConfig?.auth_type,
        username: editingConfig?.auth_config.username,
        password: editingConfig?.auth_config.password,
        token: editingConfig?.auth_config.token,
        access_key: editingConfig?.config.access_key,
        secret_key: editingConfig?.config.secret_key,
        region: editingConfig?.config.region,
        registry: editingConfig?.config.registry,
        manager_address: editingConfig?.manager_address,
        namespace: editingConfig?.namespace,
      })
    }
  }, [registryTypeEnum, editingConfig])
  const loadConfig = async (configId: number) => {
    try {
      setLoading(true)
      const config = await registryService.getRegistryConfig(configId)
      setEditingConfig(config)
      setAuthType(config.auth_type)
      setRegistryType(config.registry_type)
    }
    catch (error) {
      // message.error("加载配置失败");
      console.error('Load config error:', error)
    }
    finally {
      setLoading(false)
    }
  }
  // 保存配置
  const handleSave = async (values: Record<string, string | boolean | number>) => {
    try {
      setSubmitting(true)
      // 构建认证配置
      const authConfig: Record<string, string> = {}
      if (values.username)
        authConfig.username = values.username as string
      if (values.password)
        authConfig.password = values.password as string
      if (values.token)
        authConfig.token = values.token as string
      const data: RegistryConfigCreateUpdate = {
        name: values.name as string,
        type: values.registry_type as string,
        repository_address: values.repository_address as string,
        auth_type: values.auth_type as AuthType,
        auth_config: authConfig,
        manager_address: values.manager_address as string || undefined,
        namespace: values.namespace as string || undefined,
        config: {
          access_key: values.access_key as string || undefined,
          secret_key: values.secret_key as string || undefined,
          region: values.region as string || undefined,
          registry: values.registry as string || undefined,
        },
      }
      if (isEditMode && editingConfig) {
        await registryService.updateRegistryConfig(editingConfig.id, data)
        message.success('更新镜像仓库配置成功')
      }
      else {
        await registryService.createRegistryConfig(data)
        message.success('创建镜像仓库配置成功')
      }
      navigate(-1)
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : '保存失败'
      // message.error(errorMessage);
    }
    finally {
      setSubmitting(false)
    }
  }
  // 取消并返回
  const handleCancel = () => {
    navigate(-1)
  }
  // 密码占位符组件
  const PasswordPlaceholder = () => (
    <div className="flex items-center text-[var(--lab-color-text-muted)]">
      {'*'.repeat(8)}
    </div>
  )
  // 渲染仓库类型配置字段
  const renderRegistryTypeFields = (registryType: RegistryType) => {
    const readOnlyControlClass = isViewMode ? 'registry-config-readonly-control' : undefined
    switch (registryType) {
      case 'volcengine':
        return (
          <>
            <Form.Item name="access_key" label="访问密钥(Access Key)" rules={isViewMode ? [] : [{ required: true, message: '请输入访问密钥' }]}>
              <Input placeholder="请输入访问密钥" disabled={isViewMode} readOnly={isViewMode} className={readOnlyControlClass} />
            </Form.Item>
            <Form.Item name="secret_key" label="密钥(Secret Key)" rules={isViewMode ? [] : [{ required: true, message: '请输入密钥' }]}>
              {isViewMode ? (
                <div className="registry-config-password-placeholder">
                  <PasswordPlaceholder />
                </div>
              ) : (
                <Password
                  placeholder="请输入密钥"
                  visibilityToggle={{
                    visible: false,
                    onVisibleChange: () => { },
                  }}
                />
              )}
            </Form.Item>
            <Form.Item name="region" label="地区(region)" rules={isViewMode ? [] : [{ required: true, message: '请输入地区' }]} extra="例如：cn-guangzhou">
              <Input placeholder="请输入地区，例如：cn-guangzhou" disabled={isViewMode} readOnly={isViewMode} className={readOnlyControlClass} />
            </Form.Item>
            <Form.Item name="registry" label="实例名称" rules={isViewMode ? [] : [{ required: true, message: '请输入实例' }]} extra="例如：lab">
              <Input placeholder="请输入实例名称" disabled={isViewMode} readOnly={isViewMode} className={readOnlyControlClass} />
            </Form.Item>
          </>
        )
      case 'private_harbor':
        return (
          <>
            <Form.Item name="access_key" label="访问密钥(Access Key)" rules={isViewMode ? [] : [{ required: true, message: '请输入访问密钥' }]}>
              <Input placeholder="请输入访问密钥" disabled={isViewMode} readOnly={isViewMode} className={readOnlyControlClass} />
            </Form.Item>
            <Form.Item name="secret_key" label="密钥(Secret Key)" rules={isViewMode ? [] : [{ required: true, message: '请输入密钥' }]}>
              {isViewMode ? (
                <div className="registry-config-password-placeholder">
                  <PasswordPlaceholder />
                </div>
              ) : (
                <Password
                  placeholder="请输入密钥"
                  visibilityToggle={{
                    visible: false,
                    onVisibleChange: () => { },
                  }}
                />
              )}
            </Form.Item>
          </>
        )
      default:
        return null
    }
  }
  // 渲染认证类型字段
  const renderAuthFields = (authType: AuthType) => {
    switch (authType) {
      case 'username_password':
        return (
          <>
            <Form.Item name="username" label="用户名" rules={isViewMode ? [] : [{ required: true, message: '请输入用户名' }]}>
              <Input
                placeholder="请输入用户名"
                disabled={isViewMode}
                readOnly={isViewMode}
                className={isViewMode ? 'registry-config-readonly-control' : undefined}
              />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={isViewMode ? [] : [{ required: true, message: '请输入密码' }]}>
              {isViewMode ? (
                <div className="registry-config-password-placeholder">
                  <PasswordPlaceholder />
                </div>
              ) : (<Password placeholder="请输入密码" />)}
            </Form.Item>
          </>
        )
      case 'token':
        return (
          <>
            <Form.Item name="username" label="用户名">
              <Input
                placeholder="可选，某些仓库需要用户名"
                disabled={isViewMode}
                readOnly={isViewMode}
                className={isViewMode ? 'registry-config-readonly-control' : undefined}
              />
            </Form.Item>
            <Form.Item name="token" label="访问令牌" rules={isViewMode ? [] : [{ required: true, message: '请输入访问令牌' }]}>
              <Input
                placeholder="请输入访问令牌"
                disabled={isViewMode}
                readOnly={isViewMode}
                className={isViewMode ? 'registry-config-readonly-control' : undefined}
              />
            </Form.Item>
          </>
        )
      case 'none':
      default:
        return (
          <div className="p-4 bg-[var(--lab-color-surface-page)] rounded-[6px]">
            <Text type="secondary">
              该镜像仓库无需认证，可以直接访问公共镜像
            </Text>
          </div>
        )
    }
  }
  return (
    <div className="p-6">
      <Spin spinning={loading}>
        <Space direction="vertical" size="large" className="w-full">
          <Card className="mb-[98px]">
            <Form
              className="max-w-[800px]"
              form={form}
              layout="vertical"
              onFinish={handleSave}
              initialValues={{
                auth_type: 'none',
              }}
            >
              <div className="registry-config-section-header registry-config-section-header-basic">
                <Text strong className="text-inherit">基本信息</Text>
              </div>

              <Form.Item name="name" label="仓库名称" rules={isViewMode ? [] : [{ required: true, message: '请输入仓库名称' }]}>
                <Input
                  placeholder="请输入仓库名称"
                  disabled={isViewMode}
                  readOnly={isViewMode}
                  className={isViewMode ? 'registry-config-readonly-control' : undefined}
                />
              </Form.Item>

              <Form.Item name="registry_type" label="仓库类型" rules={isViewMode ? [] : [{ required: true, message: '请选择仓库类型' }]}>
                {registryTypeEnumLoading ? (<Select placeholder="加载中..." disabled loading />) : (
                  <Select
                    placeholder="请选择仓库类型"
                    onChange={(value) => setRegistryType(value)}
                    value={registryType}
                    disabled={isViewMode}
                    className={isViewMode ? 'registry-config-readonly-control' : undefined}
                    options={registryTypeEnum?.map((item) => ({
                      label: item.label,
                      value: item.value,
                    }))}
                  />
                )}
              </Form.Item>

              <Form.Item
                name="repository_address"
                label="仓库地址"
                rules={isViewMode ? [] : [
                  { required: true, message: '请输入仓库地址' },
                  { type: 'url', message: '请输入有效的URL地址' },
                ]}
              >
                <Input
                  placeholder="https://lab-cn-guangzhou.cr.volces.com"
                  disabled={isViewMode}
                  readOnly={isViewMode}
                  className={isViewMode ? 'registry-config-readonly-control' : undefined}
                />
              </Form.Item>

              <Form.Item name="namespace" label="命名空间" help="此命名空间专门用于存放应用自身业务所需的镜像" rules={isViewMode ? [] : [{ required: true, message: '请输入命名空间名称' }]}>
                <Input
                  placeholder="请输入命名空间名称"
                  disabled={isViewMode}
                  readOnly={isViewMode}
                  className={isViewMode ? 'registry-config-readonly-control' : undefined}
                />
              </Form.Item>
              <Form.Item name="auth_type" label="认证方式" rules={isViewMode ? [] : [{ required: true, message: '请选择认证方式' }]}>
                <Select
                  placeholder="请选择认证方式"
                  onChange={(value) => setAuthType(value)}
                  disabled={isViewMode}
                  className={isViewMode ? 'registry-config-readonly-control' : undefined}
                >
                  <Option value="none">无需认证</Option>
                  <Option value="username_password">用户名密码</Option>
                  <Option value="token">访问令牌</Option>
                </Select>
              </Form.Item>

              {/* 动态认证字段 */}
              <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.auth_type !== currentValues.auth_type}>
                {({ getFieldValue }) => {
                  const currentAuthType = getFieldValue('auth_type') || authType
                  return renderAuthFields(currentAuthType)
                }}
              </Form.Item>
              <Form.Item
                name="manager_address"
                label="管理地址（可选）"
                rules={isViewMode ? [] : [
                  { type: 'url', message: '请输入有效的URL地址' },
                ]}
                extra="填写镜像仓库的Web管理界面地址"
              >
                <Input
                  placeholder="填写镜像仓库的Web管理界面地址"
                  disabled={isViewMode}
                  readOnly={isViewMode}
                  className={isViewMode ? 'registry-config-readonly-control' : undefined}
                />
              </Form.Item>

              <div className="registry-config-section-header registry-config-section-header-params">
                <Text strong className="text-inherit">配置参数</Text>
              </div>

              {/* 动态仓库类型配置字段 */}
              <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.registry_type !== currentValues.registry_type}>
                {({ getFieldValue }) => {
                  const currentRegistryType = getFieldValue('registry_type') || registryType
                  return renderRegistryTypeFields(currentRegistryType)
                }}
              </Form.Item>

              <div className="registry-config-action-bar">
                <Space className="ml-1">
                  {!isViewMode && (
                    <Button type="primary" htmlType="submit" loading={submitting}>
                      {isEditMode ? '更新' : '创建'}
                    </Button>
                  )}
                  <Button type="default" onClick={handleCancel}>
                    {isViewMode ? '返回' : '取消'}
                  </Button>
                </Space>
              </div>
            </Form>
          </Card>
        </Space>
      </Spin>
    </div>
  )
}
export default RegistryConfigForm
