import React, { useState } from 'react'
import { message, Modal, Form, Input, Button, Typography, Space, Divider, Descriptions } from 'antd'
import { UserOutlined, PlusOutlined } from '@ant-design/icons'
import SharedListPage from '../../components/Shared/SharedListPage'

const { Text } = Typography

const mockData = [
  {
    id: '1',
    account: 'system_admin',
    username: '平台管理员',
    email: '1****@qq.com',
    joinedAt: '2026-02-03 16:51:43',
  },
]

const PlatformAdmin: React.FC = () => {
  const [data] = useState(mockData)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<(typeof mockData)[0] | null>(null)
  const [form] = Form.useForm()

  const handleOpenCreate = () => {
    form.resetFields()
    setCreateModalVisible(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('添加成员:', values)
      message.success('添加成功')
      setCreateModalVisible(false)
      form.resetFields()
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  const handleCancel = () => {
    setCreateModalVisible(false)
    form.resetFields()
  }

  const handleOpenDetail = (record: (typeof mockData)[0]) => {
    setSelectedRecord(record)
    setDetailModalVisible(true)
  }

  const handleCloseDetail = () => {
    setDetailModalVisible(false)
    setSelectedRecord(null)
  }

  return (
    <>
      <SharedListPage
        title="平台管理员"
        titleIcon={<UserOutlined style={{ color: '#fff', fontSize: 18 }} />}
        subtitle={`平台管理员共 ${data.length} 名成员`}
        showSearch={false}
        columns={[
          {
            title: '账号',
            dataIndex: 'account',
            key: 'account',
            render: (val: string) => (
              <Text code style={{ color: '#3b82f6' }}>{val}</Text>
            ),
          },
          { title: '用户名', dataIndex: 'username', key: 'username' },
          { title: '邮箱', dataIndex: 'email', key: 'email' },
          { title: '加入时间', dataIndex: 'joinedAt', key: 'joinedAt' },
        ]}
        dataSource={data}
        createButtonText="添加成员"
        onCreate={handleOpenCreate}
        onRefresh={() => message.success('刷新成功')}
        emptyText="暂无平台管理员"
        actionButtons={[
          { label: '详情', onClick: handleOpenDetail },
          { label: '删除', danger: true, onClick: () => message.success('删除成功') },
        ]}
      />

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <PlusOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>添加平台管理员</span>
          </div>
        }
        open={createModalVisible}
        onCancel={handleCancel}
        width={480}
        footer={
          <Space>
            <Button onClick={handleCancel}>取消</Button>
            <Button type="primary" onClick={handleSubmit} style={{ background: '#4f46e5' }}>
              确认
            </Button>
          </Space>
        }
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Divider orientation="horizontal" plain style={{ margin: '0 0 16px 0', color: '#64748b', fontSize: 12 }}>
            成员信息
          </Divider>

          <Form.Item
            label="用户账号"
            name="account"
            rules={[
              { required: true, message: '请输入用户账号' },
              { pattern: /^[a-zA-Z0-9_-]{2,32}$/, message: '支持字母、数字、下划线、中划线，2-32字符' }
            ]}
            extra="输入需要添加为平台管理员的用户账号"
          >
            <Input placeholder="请输入用户账号" maxLength={32} />
          </Form.Item>

          <Form.Item
            label="备注"
            name="remark"
          >
            <Input.TextArea rows={2} placeholder="请输入备注信息（可选）" maxLength={100} showCount />
          </Form.Item>

          <div style={{
            background: '#f8fafc',
            borderRadius: 8,
            padding: '12px 16px',
            border: '1px solid #e2e8f0'
          }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <UserOutlined style={{ marginRight: 6 }} />
              提示：平台管理员拥有平台最高权限，可以管理所有项目和系统配置
            </Text>
          </div>
        </Form>
      </Modal>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <UserOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>管理员详情</span>
          </div>
        }
        open={detailModalVisible}
        onCancel={handleCloseDetail}
        width={480}
        footer={<Button onClick={handleCloseDetail}>关闭</Button>}
      >
        {selectedRecord && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="账号">
              <Text code style={{ color: '#3b82f6' }}>{selectedRecord.account}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="用户名">{selectedRecord.username}</Descriptions.Item>
            <Descriptions.Item label="邮箱">{selectedRecord.email}</Descriptions.Item>
            <Descriptions.Item label="加入时间">{selectedRecord.joinedAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default PlatformAdmin