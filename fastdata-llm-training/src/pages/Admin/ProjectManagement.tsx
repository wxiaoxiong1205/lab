import React, { useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SettingOutlined, PlusOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

type ProjectRecord = {
  id: string
  name: string
  description: string
  cluster: string
  createdAt: string
}

const projects: ProjectRecord[] = [
  {
    id: '1',
    name: 'V1.12测试项目',
    description: '',
    cluster: 'V1.12版本集群',
    createdAt: '2026/3/23 15:43:58',
  },
  {
    id: '2',
    name: 'demo',
    description: '1卡',
    cluster: '测试环境集群12',
    createdAt: '2025/12/10 22:08:35',
  },
]

const clusterOptions = [
  'V1.12版本集群',
  '测试环境集群12',
  '生产环境集群A',
]

const ProjectManagement: React.FC = () => {
  const [form] = Form.useForm()
  const [memberForm] = Form.useForm()
  const [createOpen, setCreateOpen] = useState(false)
  const [memberOpen, setMemberOpen] = useState(false)

  const columns: ColumnsType<ProjectRecord> = [
    { title: '项目名称', dataIndex: 'name', key: 'name' },
    { title: '项目描述', dataIndex: 'description', key: 'description', render: value => value || '-' },
    { title: '绑定集群', dataIndex: 'cluster', key: 'cluster' },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
    {
      title: '操作',
      key: 'action',
      width: 240,
      render: (_, record) => (
        <Space size={0}>
          <Button type="link" size="small">编辑</Button>
          <Button type="link" size="small">SSH配置</Button>
          <Button type="link" size="small">成员管理</Button>
          <Button type="link" size="small">...</Button>
        </Space>
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

  const submitMember = async () => {
    try {
      await memberForm.validateFields()
      setMemberOpen(false)
    } catch {
      return
    }
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Card style={{ borderRadius: 20, border: '1px solid #e5e7eb' }}>
          <Title level={2}>项目管理</Title>

          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建项目
            </Button>
            <Button onClick={() => setMemberOpen(true)}>成员管理</Button>
          </div>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={projects}
            pagination={{ pageSize: 10, showTotal: total => `共 ${total} 条数据` }}
          />
        </Card>
      </div>

      <Modal
        title="新建项目"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={
          <Space>
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button type="primary" onClick={submitCreate}>创建</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item label="项目名称" name="name" rules={[{ required: true, message: '请输入项目名称' }]}>
            <Input placeholder="请输入项目名称" />
          </Form.Item>
          <Form.Item label="项目描述" name="description">
            <Input.TextArea rows={3} placeholder="请输入项目描述（可选）" />
          </Form.Item>
          <Form.Item label="绑定集群" name="cluster" rules={[{ required: true, message: '请选择绑定集群' }]}>
            <Select placeholder="请选择集群" options={clusterOptions.map(item => ({ value: item, label: item }))} />
          </Form.Item>
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14 }}>
            <Text type="secondary">创建项目后可继续进行 SSH 配置和成员管理。</Text>
          </div>
        </Form>
      </Modal>

      <Modal
        title="成员管理"
        open={memberOpen}
        onCancel={() => setMemberOpen(false)}
        footer={
          <Space>
            <Button onClick={() => setMemberOpen(false)}>取消</Button>
            <Button type="primary" onClick={submitMember}>添加</Button>
          </Space>
        }
      >
        <Form form={memberForm} layout="vertical">
          <Form.Item label="选择成员" name="member" rules={[{ required: true, message: '请选择成员' }]}>
            <Select
              placeholder="请选择成员"
              options={[
                { value: 'lab1', label: 'lab1' },
                { value: 'lab2', label: 'lab2' },
                { value: 'admin', label: 'admin' },
              ]}
            />
          </Form.Item>
          <Form.Item label="成员角色" name="role" rules={[{ required: true, message: '请选择角色' }]}>
            <Select
              placeholder="请选择角色"
              options={[
                { value: '管理员', label: '管理员' },
                { value: '开发者', label: '开发者' },
                { value: '标注员', label: '标注员' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default ProjectManagement
