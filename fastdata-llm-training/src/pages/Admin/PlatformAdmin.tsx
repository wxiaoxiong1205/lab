import React, { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { UserOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

type AdminRecord = {
  id: string
  account: string
  username: string
  email: string
  joinedAt: string
}

const admins: AdminRecord[] = [
  {
    id: '1',
    account: 'system_admin',
    username: '平台管理员',
    email: '1****@qq.com',
    joinedAt: '2026-02-03 16:51:43',
  },
]

const PlatformAdmin: React.FC = () => {
  const [form] = Form.useForm()
  const [searchValue, setSearchValue] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const filteredData = useMemo(
    () => admins.filter(item => item.account.toLowerCase().includes(searchValue.toLowerCase())),
    [searchValue],
  )

  const columns: ColumnsType<AdminRecord> = [
    { title: '账号', dataIndex: 'account', key: 'account' },
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '邮箱', dataIndex: 'email', key: 'email' },
    { title: '加入时间', dataIndex: 'joinedAt', key: 'joinedAt' },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: () => (
        <Button type="link" size="small" danger>删除</Button>
      ),
    },
  ]

  const submitCreate = async () => {
    try {
      await form.validateFields()
      setCreateOpen(false)
    } catch {
      return
    }
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Card style={{ borderRadius: 20, border: '1px solid #e5e7eb' }}>
          <Title level={2}>平台管理员 <Text type="secondary" style={{ fontSize: 18 }}>共{filteredData.length}名成员</Text></Title>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginBottom: 16 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              placeholder="搜索账号"
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              style={{ width: 240 }}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              添加成员
            </Button>
          </div>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredData}
            pagination={{ pageSize: 10 }}
          />
        </Card>
      </div>

      <Modal
        title="添加成员"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={
          <Space>
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button type="primary" onClick={submitCreate}>确认</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item label="用户账号" name="account" rules={[{ required: true, message: '请输入用户账号' }]}>
            <Input placeholder="请输入用户账号" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default PlatformAdmin
