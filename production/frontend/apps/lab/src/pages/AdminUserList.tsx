import { useState } from 'react'
import type React from 'react'
import type { TablePaginationConfig } from 'antd'
import { Button, Form, Input, Modal, Popconfirm, Progress, Space, Switch, Table, Typography, message } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { userApi } from '../services/api'
import type { PageUser, RegisterRequest, User, UserUpdate } from '../types'
import { getPasswordStrengthColor, getPasswordStrengthText, validatePassword } from '../utils/passwordValidator'

const { Title, Text } = Typography
const AdminUserList = () => {
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [currentUser, setCurrentUser] = useState<any | null>(null)
  const [form] = Form.useForm()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const password = Form.useWatch('password', form)
  const [passwordStrength, setPasswordStrength] = useState({
    score: 0,
    strength: 'weak' as const,
    errors: [] as string[],
  })
  // 自定义验证函数
  const validateUsername = (_: unknown, value: string) => {
    if (!value) {
      return Promise.reject(new Error(t('user.usernameRequired')))
    }
    // 只允许英文字母
    if (!/^[a-zA-Z]+$/.test(value)) {
      return Promise.reject(new Error(t('user.usernameEnglishOnly')))
    }
    return Promise.resolve()
  }
  // 处理密码输入变化
  const handlePasswordInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // 实时更新密码强度状态
    if (value) {
      const validation = validatePassword(value)
      setPasswordStrength({
        score: validation.score,
        strength: validation.strength as any,
        errors: validation.errors,
      })
      // 当密码符合规则时，主动清除表单错误
      if (validation.isValid) {
        form.validateFields(['password']).catch(() => { })
      }
    }
    else {
      setPasswordStrength({
        score: 0,
        strength: 'weak',
        errors: [],
      })
    }
  }
  const validatePasswordStrength = (_: unknown, value: string) => {
    // 如果是编辑模式且密码为空，允许通过（不修改密码）
    if (isEditMode && !value) {
      return Promise.resolve()
    }
    // 新增用户时密码不能为空
    if (!isEditMode && !value) {
      return Promise.reject(new Error(t('user.passwordRequired')))
    }
    if (value) {
      const validation = validatePassword(value)
      // 同步更新密码强度状态
      setPasswordStrength({
        score: validation.score,
        strength: validation.strength as any,
        errors: validation.errors,
      })
      if (!validation.isValid) {
        return Promise.reject(new Error(validation.errors[0]))
      }
    }
    else {
      // 清空密码时重置强度状态
      setPasswordStrength({
        score: 0,
        strength: 'weak',
        errors: [],
      })
    }
    return Promise.resolve()
  }
  // 分页参数
  const [pagination, setPagination] = useState<TablePaginationConfig>({
    current: 1,
    pageSize: 10,
    total: 0,
  })
  // 搜索参数
  const [searchUsername, setSearchUsername] = useState<string>('')
  // Fetch users with pagination and search
  const { data: users = [], isLoading } = useQuery<PageUser, Error, User[]>({
    queryKey: ['users', pagination.current, pagination.pageSize, searchUsername],
    queryFn: () => userApi
      .list({
        page: pagination.current,
        size: pagination.pageSize,
        username: searchUsername || undefined,
      })
      .then((res) => {
        setPagination((prev) => ({
          ...prev,
          total: res.total,
        }))
        return res
      }),
    select: (data) => data.rows,
  })
  const total = pagination.total ?? 0
  // Create user
  const createUser = useMutation({
    mutationFn: (data: RegisterRequest) => userApi.register(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      message.success(t('user.createSuccess'))
      setIsModalVisible(false)
      form.resetFields()
    },
  })
  // Update user
  const updateUser = useMutation({
    mutationFn: ({ id, data }: {
      id: number
      data: UserUpdate
    }) => userApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      message.success(t('user.updateSuccess'))
      setIsModalVisible(false)
      form.resetFields()
    },
  })
  // Delete user
  const deleteUser = useMutation({
    mutationFn: (id: number) => userApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      message.success(t('user.deleteSuccess'))
    },
  })
  const handleCreateOrUpdate = (values: RegisterRequest | UserUpdate) => {
    if (isEditMode && currentUser) {
      // For update, we don't need to send the password if it's empty
      const updateData: UserUpdate = {
        username: values.username,
        email: values.email,
        is_active: values.is_active,
        is_admin: values.is_admin,
      }
      if (values.password) {
        updateData.password = values.password
      }
      updateUser.mutate({ id: currentUser.id, data: updateData })
    }
    else {
      // For create, password is required
      createUser.mutate(values as RegisterRequest)
    }
  }
  const handleEdit = (user: any) => {
    setCurrentUser(user)
    setIsEditMode(true)
    form.setFieldsValue({
      username: user.username,
      email: user.email,
      is_active: user.is_active,
      is_admin: user.is_admin,
      // Don't set password for edit
    })
    setIsModalVisible(true)
  }
  const handleDelete = (id: number) => {
    deleteUser.mutate(id)
  }
  const handleAddNew = () => {
    setCurrentUser(null)
    setIsEditMode(false)
    form.resetFields()
    setIsModalVisible(true)
  }
  // 搜索处理函数
  const handleSearch = (value: string) => {
    setSearchUsername(value.trim())
    // 搜索时重置到第一页
    setPagination((prev) => ({
      ...prev,
      current: 1,
    }))
  }
  // 清空搜索
  const handleClearSearch = () => {
    setSearchUsername('')
    setPagination((prev) => ({
      ...prev,
      current: 1,
    }))
  }
  const columns = [
    {
      title: '序号',
      key: 'index',
      width: 80,
      render: (_: unknown, __: User, index: number) => ((pagination.current || 1) - 1) * (pagination.pageSize || 10) + index + 1,
    },
    {
      title: t('user.username'),
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: t('user.email'),
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: t('user.isActive'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => <Switch checked={active} disabled />,
    },
    {
      title: t('user.isAdmin'),
      dataIndex: 'is_admin',
      key: 'is_admin',
      render: (admin: boolean) => <Switch checked={admin} disabled />,
    },
    {
      title: t('user.createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: t('user.actions'),
      key: 'action',
      render: (_: unknown, record: any) => (
        <Space size="middle">
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} type="text" />
          <Popconfirm title="确定要删除这个用户吗？" description="删除后将无法恢复。" onConfirm={() => handleDelete(record.id)} okText="确定" cancelText="取消">
            <Button icon={<DeleteOutlined />} danger type="text" />
          </Popconfirm>
        </Space>
      ),
    },
  ]
  return (
    <div className="admin-user-list-container lab-list-page-shell">
      <div className="flex justify-between items-center mb-4">
        <Title level={4} className="m-0">{t('user.management')}</Title>
        <div className="flex gap-3 items-center">
          <Input.Search
            className="w-[240px]"
            placeholder={t('user.searchByUsername') || '请输入用户名搜索'}
            allowClear
            value={searchUsername}
            onChange={(e) => {
              const value = e.target.value
              setSearchUsername(value)
              // 如果清空了搜索框，立即执行搜索
              if (!value.trim()) {
                handleClearSearch()
              }
            }}
            onSearch={handleSearch}
            onClear={handleClearSearch}
            enterButton={<SearchOutlined />}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddNew}>
            {t('user.new')}
          </Button>
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        scroll={{ x: 1200 }}
        loading={isLoading}
        pagination={{
          ...pagination,
          total,
        }}
        onChange={(pagination) => setPagination(pagination)}
      />

      <Modal title={isEditMode ? t('user.edit') : t('user.new')} open={isModalVisible} onCancel={() => setIsModalVisible(false)} onOk={() => form.submit()} okText={t('common.confirm')} cancelText={t('common.cancel')} confirmLoading={createUser.isPending || updateUser.isPending}>
        <Form form={form} onFinish={handleCreateOrUpdate} layout="vertical">
          <Form.Item
            name="username"
            label={t('user.username')}
            required
            rules={[
              { validator: validateUsername },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="email"
            label={t('user.email')}
            rules={[
              { required: true, message: t('user.emailRequired') },
              { type: 'email', message: t('user.emailInvalid') },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="password"
            label={t('user.password')}
            required
            rules={[
              { validator: validatePasswordStrength },
            ]}
          >
            <Input.Password placeholder={isEditMode ? t('user.leaveEmpty') : ''} onChange={handlePasswordInputChange} />

          </Form.Item>
          <div className="text-[var(--lab-color-text-muted)] text-[12px] mt-1">
            {t('user.passwordRules')}
          </div>
          {/* 密码强度指示器 */}
          {password && (
            <div className="mb-4">
              <div className="mb-2 flex items-center gap-2">
                <Text className="text-[12px]">密码强度:</Text>
                <Text
                  className="text-[12px] font-bold"
                  style={{
                    color: getPasswordStrengthColor(passwordStrength.strength),
                  }}
                >
                  {getPasswordStrengthText(passwordStrength.strength)}
                </Text>
              </div>
              <Progress percent={passwordStrength.score} size="small" strokeColor={getPasswordStrengthColor(passwordStrength.strength)} showInfo={false} />

            </div>
          )}
          <Form.Item name="is_active" label={t('user.isActive')} valuePropName="checked" initialValue>
            <Switch />
          </Form.Item>
          <Form.Item name="is_admin" label={t('user.isAdmin')} valuePropName="checked" initialValue={false}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
export default AdminUserList
