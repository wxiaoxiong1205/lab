import React, { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import {
  canRunOperation,
  createProject,
  getCurrentUser,
  getOperationDeniedMessage,
  getRoleLabel,
  getUserByAccount,
  updateProjectMembers,
  usePermissionStore,
  type RoleKey,
  type PermissionProject,
  type ProjectPermissionMember,
} from '../../services/permissionStore'

const { Title, Text } = Typography

const clusterOptions = ['V1.12版本集群', '测试环境集群12', '生产环境集群A']

const ProjectManagement: React.FC = () => {
  const permissionState = usePermissionStore()
  const currentUser = getCurrentUser(permissionState)
  const [form] = Form.useForm()
  const [memberForm] = Form.useForm()
  const [createOpen, setCreateOpen] = useState(false)
  const [permissionOpen, setPermissionOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<PermissionProject | null>(null)
  const [draftMembers, setDraftMembers] = useState<ProjectPermissionMember[]>([])
  const [selectedMemberAccount, setSelectedMemberAccount] = useState<string>()

  const visibleProjects = useMemo(() => {
    if (currentUser.roleKeys.includes('platform_admin')) {
      return permissionState.projects
    }

    return permissionState.projects.filter(project =>
      project.members.some(member => member.account === currentUser.account && member.hasDataPermission),
    )
  }, [currentUser.account, currentUser.roleKeys, permissionState.projects])

  const memberRoleOptions = useMemo(() => {
    if (!selectedMemberAccount) {
      return []
    }
    const targetUser = getUserByAccount(selectedMemberAccount, permissionState)
    return (targetUser?.roleKeys ?? []).map(roleKey => ({
      value: roleKey,
      label: getRoleLabel(roleKey, permissionState),
    }))
  }, [permissionState, selectedMemberAccount])

  const guardOperation = (operationKey: string, callback: () => void) => {
    const result = canRunOperation(operationKey, undefined, permissionState)
    if (!result.allowed) {
      message.warning(getOperationDeniedMessage(result.reason))
      return
    }
    callback()
  }

  const columns: ColumnsType<PermissionProject> = [
    { title: '项目名称', dataIndex: 'name', key: 'name' },
    { title: '项目描述', dataIndex: 'description', key: 'description', render: value => value || '-' },
    { title: '绑定集群', dataIndex: 'cluster', key: 'cluster' },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
    {
      title: '项目成员',
      key: 'members',
      render: (_, record) => (
        <Space wrap size={[6, 6]}>
          {record.members
            .filter(member => member.hasDataPermission || member.roleKey === 'platform_admin')
            .map(member => (
              <Tag key={`${record.id}-${member.account}`} color={member.roleKey === 'platform_admin' ? 'blue' : 'default'}>
                {member.account}
              </Tag>
            ))}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 320,
      render: (_, record) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            onClick={() =>
              guardOperation('admin.project.edit', () => {
                message.success(`项目 ${record.name} 编辑入口已开放`)
              })
            }
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() =>
              guardOperation('admin.project.members', () => {
                setSelectedProject(record)
                setDraftMembers(record.members)
                memberForm.resetFields()
                setSelectedMemberAccount(undefined)
                setPermissionOpen(true)
              })
            }
          >
            成员管理
          </Button>
          <Button
            type="link"
            size="small"
            icon={<SafetyCertificateOutlined />}
            onClick={() =>
              guardOperation('admin.project.data-permission', () => {
                setSelectedProject(record)
                setDraftMembers(record.members)
                memberForm.resetFields()
                setSelectedMemberAccount(undefined)
                setPermissionOpen(true)
              })
            }
          >
            项目权限
          </Button>
        </Space>
      ),
    },
  ]

  const permissionColumns: ColumnsType<ProjectPermissionMember> = [
    {
      title: '账号',
      dataIndex: 'account',
      key: 'account',
    },
    {
      title: '角色',
      key: 'role',
      render: (_, record) => getRoleLabel(record.roleKey, permissionState),
    },
    {
      title: '数据权限',
      key: 'permission',
      width: 140,
      render: (_, record) => (
        <Switch
          checked={record.roleKey === 'platform_admin' ? true : record.hasDataPermission}
          disabled={record.roleKey === 'platform_admin'}
          checkedChildren="已开通"
          unCheckedChildren="未开通"
          onChange={checked => {
            setDraftMembers(previous =>
              previous.map(item =>
                item.account === record.account ? { ...item, hasDataPermission: checked } : item,
              ),
            )
          }}
        />
      ),
    },
    {
      title: '切换角色',
      key: 'switchRole',
      width: 180,
      render: (_, record) => {
        const targetUser = getUserByAccount(record.account, permissionState)
        const options = (targetUser?.roleKeys ?? [record.roleKey]).map(roleKey => ({
          value: roleKey,
          label: getRoleLabel(roleKey, permissionState),
        }))
        return (
          <Select
            value={record.roleKey}
            style={{ width: '100%' }}
            disabled={record.roleKey === 'platform_admin'}
            options={options}
            onChange={value => {
              setDraftMembers(previous =>
                previous.map(item =>
                  item.account === record.account ? { ...item, roleKey: value as RoleKey } : item,
                ),
              )
            }}
          />
        )
      },
    },
    {
      title: '说明',
      key: 'description',
      render: (_, record) =>
        record.roleKey === 'platform_admin' ? (
          <Text type="secondary">平台管理员默认拥有项目数据权限</Text>
        ) : record.hasDataPermission ? (
          <Text style={{ color: '#059669' }}>可查看该项目及其业务页面</Text>
        ) : (
          <Text type="secondary">无数据权限，不显示该项目</Text>
        ),
    },
  ]

  const submitCreate = async () => {
    try {
      const values = await form.validateFields()
      createProject({
        name: values.name,
        description: values.description ?? '',
        cluster: values.cluster,
      })
      setCreateOpen(false)
      form.resetFields()
      message.success('项目创建成功')
    } catch {
      return
    }
  }

  const submitPermissions = () => {
    if (!selectedProject) {
      return
    }

    updateProjectMembers(selectedProject.id, draftMembers)
    setPermissionOpen(false)
    message.success('项目权限已更新')
  }

  const submitMember = async () => {
    if (!selectedProject) {
      return
    }

    try {
      const values = await memberForm.validateFields()
      setDraftMembers(previous => {
        const existingIndex = previous.findIndex(item => item.account === values.account)
        const nextMember: ProjectPermissionMember = {
          account: values.account,
          roleKey: values.roleKey,
          hasDataPermission: values.roleKey === 'platform_admin' ? true : Boolean(values.hasDataPermission),
        }

        if (existingIndex >= 0) {
          const nextMembers = [...previous]
          nextMembers[existingIndex] = nextMember
          return nextMembers
        }

        return [...previous, nextMember]
      })

      memberForm.resetFields()
      setSelectedMemberAccount(undefined)
      message.success('成员已加入待保存列表')
    } catch {
      return
    }
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Card style={{ borderRadius: 20, border: '1px solid #e5e7eb' }}>
          <Title level={2}>项目管理</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 18 }}>
            数据权限在项目维度控制。只有同时具备菜单权限、操作权限和项目权限的账号，才可以进入项目并执行操作。
          </Text>

          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => guardOperation('admin.project.create', () => setCreateOpen(true))}
            >
              新建项目
            </Button>
          </div>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={visibleProjects}
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
            <Button type="primary" onClick={submitCreate}>
              创建
            </Button>
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
            <Text type="secondary">
              平台管理员在新建项目后默认拥有该项目数据权限，其他角色默认无数据权限。
            </Text>
          </div>
        </Form>
      </Modal>

      <Modal
        title={selectedProject ? `${selectedProject.name} · 项目权限` : '项目权限'}
        open={permissionOpen}
        onCancel={() => setPermissionOpen(false)}
        width={920}
        footer={
          <Space>
            <Button onClick={() => setPermissionOpen(false)}>取消</Button>
            <Button type="primary" onClick={submitPermissions}>
              保存
            </Button>
          </Space>
        }
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          有菜单权限和操作权限但无项目权限的账号，不显示该项目，也不能进入该项目相关业务页面。
        </Text>
        <Card
          size="small"
          style={{ marginBottom: 16, borderRadius: 14, border: '1px solid #e5e7eb', background: '#fbfdff' }}
        >
          <Form form={memberForm} layout="inline">
            <Form.Item
              label="选择成员"
              name="account"
              rules={[{ required: true, message: '请选择成员' }]}
              style={{ minWidth: 240 }}
            >
              <Select
                placeholder="请选择成员"
                options={permissionState.users.map(user => ({
                  value: user.account,
                  label: `${user.account}（${user.username}）`,
                }))}
                onChange={value => {
                  setSelectedMemberAccount(value)
                  memberForm.setFieldValue('roleKey', undefined)
                }}
              />
            </Form.Item>
            <Form.Item
              label="成员角色"
              name="roleKey"
              rules={[{ required: true, message: '请选择角色' }]}
              style={{ minWidth: 220 }}
            >
              <Select placeholder="请选择该成员角色" options={memberRoleOptions} disabled={!selectedMemberAccount} />
            </Form.Item>
            <Form.Item label="数据权限" name="hasDataPermission" valuePropName="checked" initialValue={false}>
              <Switch checkedChildren="已开通" unCheckedChildren="未开通" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" onClick={submitMember}>
                添加成员
              </Button>
            </Form.Item>
          </Form>
        </Card>
        <Table rowKey="account" columns={permissionColumns} dataSource={draftMembers} pagination={false} />
      </Modal>
    </>
  )
}

export default ProjectManagement
