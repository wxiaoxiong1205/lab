import React, { useState } from 'react'
import { message, Modal, Form, Input, Select, Button, Typography, Space, Divider, Table, Tabs, Descriptions } from 'antd'
import { SettingOutlined, PlusOutlined, UserOutlined, KeyOutlined } from '@ant-design/icons'
import SharedListPage from '../../components/Shared/SharedListPage'
import type { ColumnsType } from 'antd/es/table'

const { Text } = Typography

// 集群选项
const mockClusters = [
  { value: 'cluster_001', label: '测试集群-01', nodeCount: 8 },
  { value: 'cluster_002', label: '生产集群-A', nodeCount: 32 },
  { value: 'cluster_003', label: 'GPU集群-01', nodeCount: 16 },
]

// 项目成员数据
const mockMembers = [
  { id: '1', name: '管理员', account: 'admin', role: '管理员', joinedAt: '2026/02/01 10:00:00' },
  { id: '2', name: 'lab1', account: 'lab1', role: '开发者', joinedAt: '2026/02/10 14:30:00' },
  { id: '3', name: 'lab2', account: 'lab2', role: '标注员', joinedAt: '2026/03/01 09:00:00' },
]

// SSH 配置数据
const mockSSHConfigs = [
  { id: '1', name: 'default-ssh-key', publicKey: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC9...', createdAt: '2026/02/15 11:00:00' },
]

const mockData = [
  {
    id: '1',
    name: 'V1.12测试项目',
    description: '',
    boundCluster: 'V1.12版本集群',
    createdAt: '2026/3/23 15:43:58',
  },
  {
    id: '2',
    name: 'demo',
    description: '1卡',
    boundCluster: '测试环境集群12',
    createdAt: '2025/12/10 22:08:35',
  },
]

const ProjectManagement: React.FC = () => {
  const [data] = useState(mockData)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<typeof mockData[0] | null>(null)
  const [detailTab, setDetailTab] = useState<string>('members')
  const [memberFormVisible, setMemberFormVisible] = useState(false)
  const [sshFormVisible, setSshFormVisible] = useState(false)
  const [form] = Form.useForm()
  const [memberForm] = Form.useForm()
  const [sshForm] = Form.useForm()

  const memberColumns: ColumnsType<typeof mockMembers[0]> = [
    { title: '用户名', dataIndex: 'name', key: 'name' },
    { title: '账号', dataIndex: 'account', key: 'account' },
    { title: '角色', dataIndex: 'role', key: 'role', render: (val: string) => (
      <Text style={{ color: val === '管理员' ? '#4f46e5' : '#64748b' }}>{val}</Text>
    )},
    { title: '加入时间', dataIndex: 'joinedAt', key: 'joinedAt' },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Button type="link" danger size="small">移除</Button>
      ),
    },
  ]

  const sshColumns: ColumnsType<typeof mockSSHConfigs[0]> = [
    { title: '配置名称', dataIndex: 'name', key: 'name' },
    { title: '公钥', dataIndex: 'publicKey', key: 'publicKey', ellipsis: true, render: (val: string) => (
      <Text code style={{ fontSize: 11 }}>{val.substring(0, 40)}...</Text>
    )},
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
    {
      title: '操作',
      key: 'action',
      render: () => (
        <Button type="link" danger size="small">删除</Button>
      ),
    },
  ]

  const handleOpenCreate = () => {
    form.resetFields()
    setCreateModalVisible(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('新建项目:', values)
      message.success('创建成功')
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

  const handleOpenDetail = (record: typeof mockData[0]) => {
    setSelectedRecord(record)
    setDetailTab('members')
    setDetailModalVisible(true)
  }

  const handleCloseDetail = () => {
    setDetailModalVisible(false)
    setSelectedRecord(null)
  }

  const handleAddMember = async () => {
    try {
      const values = await memberForm.validateFields()
      console.log('添加成员:', values)
      message.success('添加成功')
      setMemberFormVisible(false)
      memberForm.resetFields()
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  const handleAddSSH = async () => {
    try {
      const values = await sshForm.validateFields()
      console.log('添加SSH配置:', values)
      message.success('添加成功')
      setSshFormVisible(false)
      sshForm.resetFields()
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  return (
    <>
      <SharedListPage
        title="项目管理"
        titleIcon={<SettingOutlined style={{ color: '#fff', fontSize: 18 }} />}
        subtitle="管理和配置不同项目的设置与资源"
        searchPlaceholder="搜索项目名称"
        searchField="name"
        columns={[
          { title: '项目名称', dataIndex: 'name', key: 'name' },
          { title: '项目描述', dataIndex: 'description', key: 'description', ellipsis: true, render: (val: string) => val || '-' },
          { title: '绑定集群', dataIndex: 'boundCluster', key: 'boundCluster' },
          { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
        ]}
        dataSource={data}
        createButtonText="新建项目"
        onCreate={handleOpenCreate}
        onRefresh={() => message.success('刷新成功')}
        emptyText="暂无项目"
        actionButtons={[
          { label: '详情', onClick: handleOpenDetail },
          { label: '删除', danger: true, onClick: () => message.success('删除成功') },
        ]}
      />

      {/* 创建项目 Modal */}
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
            <span style={{ fontWeight: 600 }}>新建项目</span>
          </div>
        }
        open={createModalVisible}
        onCancel={handleCancel}
        width={640}
        footer={
          <Space>
            <Button onClick={handleCancel}>取消</Button>
            <Button type="primary" onClick={handleSubmit} style={{ background: '#4f46e5' }}>
              创建
            </Button>
          </Space>
        }
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Divider orientation="horizontal" plain style={{ margin: '0 0 16px 0', color: '#64748b', fontSize: 12 }}>
            基本信息
          </Divider>

          <Form.Item
            label="项目名称"
            name="name"
            rules={[
              { required: true, message: '请输入项目名称' },
              { pattern: /^[\u4e00-\u9fa5a-zA-Z0-9_-]{2,64}$/, message: '支持中英文、数字、下划线、中划线，2-64字符' }
            ]}
          >
            <Input placeholder="请输入项目名称" maxLength={64} showCount />
          </Form.Item>

          <Form.Item label="项目描述" name="description">
            <Input.TextArea rows={3} placeholder="请输入项目描述（可选）" maxLength={200} showCount />
          </Form.Item>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            集群配置
          </Divider>

          <Form.Item
            label="绑定集群"
            name="cluster"
            rules={[{ required: true, message: '请选择绑定的集群' }]}
            extra="选择此项目将使用的Kubernetes集群"
          >
            <Select placeholder="请选择集群" showSearch>
              {mockClusters.map(c => (
                <Select.Option key={c.value} value={c.value}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{c.label}</span>
                    <Text type="secondary" style={{ fontSize: 11 }}>{c.nodeCount}节点</Text>
                  </div>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 16px', border: '1px solid #e2e8f0' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <SettingOutlined style={{ marginRight: 6 }} />
              提示：创建项目后可进行成员管理和SSH配置
            </Text>
          </div>
        </Form>
      </Modal>

      {/* 项目详情 Modal */}
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
              <SettingOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>{selectedRecord?.name || '项目详情'}</span>
          </div>
        }
        open={detailModalVisible}
        onCancel={handleCloseDetail}
        width={800}
        footer={<Button onClick={handleCloseDetail}>关闭</Button>}
      >
        {selectedRecord && (
          <>
            <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="项目名称" span={2}>{selectedRecord.name}</Descriptions.Item>
              <Descriptions.Item label="项目描述">{selectedRecord.description || '-'}</Descriptions.Item>
              <Descriptions.Item label="绑定集群">{selectedRecord.boundCluster}</Descriptions.Item>
              <Descriptions.Item label="创建时间" span={2}>{selectedRecord.createdAt}</Descriptions.Item>
            </Descriptions>

            <Tabs
              activeKey={detailTab}
              onChange={setDetailTab}
              items={[
                {
                  key: 'members',
                  label: (
                    <span><UserOutlined /> 成员管理</span>
                  ),
                  children: (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <Text type="secondary">共 {mockMembers.length} 名成员</Text>
                        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setMemberFormVisible(true)}>
                          添加成员
                        </Button>
                      </div>
                      <Table
                        columns={memberColumns}
                        dataSource={mockMembers}
                        rowKey="id"
                        pagination={false}
                        size="small"
                      />
                    </div>
                  ),
                },
                {
                  key: 'ssh',
                  label: (
                    <span><KeyOutlined /> SSH配置</span>
                  ),
                  children: (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                        <Text type="secondary">SSH 公钥配置，用于训练节点访问</Text>
                        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setSshFormVisible(true)}>
                          添加SSH密钥
                        </Button>
                      </div>
                      <Table
                        columns={sshColumns}
                        dataSource={mockSSHConfigs}
                        rowKey="id"
                        pagination={false}
                        size="small"
                      />
                    </div>
                  ),
                },
              ]}
            />
          </>
        )}
      </Modal>

      {/* 添加成员 Modal */}
      <Modal
        title="添加成员"
        open={memberFormVisible}
        onCancel={() => { setMemberFormVisible(false); memberForm.resetFields(); }}
        onOk={handleAddMember}
        okText="添加"
        cancelText="取消"
      >
        <Form form={memberForm} layout="vertical">
          <Form.Item
            label="选择成员"
            name="member"
            rules={[{ required: true, message: '请选择成员' }]}
          >
            <Select placeholder="请选择成员" showSearch>
              <Select.Option value="user_new">新成员A</Select.Option>
              <Select.Option value="user_admin">管理员B</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="成员角色"
            name="role"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select placeholder="请选择角色">
              <Select.Option value="管理员">管理员</Select.Option>
              <Select.Option value="开发者">开发者</Select.Option>
              <Select.Option value="标注员">标注员</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* 添加SSH Modal */}
      <Modal
        title="添加SSH密钥"
        open={sshFormVisible}
        onCancel={() => { setSshFormVisible(false); sshForm.resetFields(); }}
        onOk={handleAddSSH}
        okText="添加"
        cancelText="取消"
      >
        <Form form={sshForm} layout="vertical">
          <Form.Item
            label="配置名称"
            name="name"
            rules={[
              { required: true, message: '请输入配置名称' },
              { pattern: /^[\u4e00-\u9fa5a-zA-Z0-9_-]{2,32}$/, message: '支持中英文、数字、下划线、中划线，2-32字符' }
            ]}
          >
            <Input placeholder="如：my-ssh-key" />
          </Form.Item>
          <Form.Item
            label="公钥内容"
            name="publicKey"
            rules={[{ required: true, message: '请输入公钥内容' }]}
            extra="支持 RSA、ED25519 等格式的公钥"
          >
            <Input.TextArea rows={4} placeholder="ssh-rsa AAAA..." />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default ProjectManagement