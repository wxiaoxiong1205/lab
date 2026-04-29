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
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SettingOutlined, CloudServerOutlined } from '@ant-design/icons'
import {
  canRunOperation,
  createProject,
  deleteProject,
  getCurrentUser,
  getOperationDeniedMessage,
  getRoleLabel,
  getUserByAccount,
  updateProject,
  updateProjectMembers,
  usePermissionStore,
  type PermissionProject,
  type ProjectPermissionMember,
} from '../../services/permissionStore'

const { Title, Text } = Typography

const clusterOptions = ['V1.12版本集群', '测试环境集群12', '生产环境集群A']
const namespaceOptions = ['ai-infra', 'lab', 'fs']

type SSHConfigRecord = {
  enabled: boolean
  username: string
  password: string
  sshKey: string
}

const ProjectManagement: React.FC = () => {
  const permissionState = usePermissionStore()
  const currentUser = getCurrentUser(permissionState)
  const [form] = Form.useForm()
  const [memberForm] = Form.useForm()
  const [sshForm] = Form.useForm()
  const [namespaceForm] = Form.useForm()
  const [createOpen, setCreateOpen] = useState(false)
  const [permissionOpen, setPermissionOpen] = useState(false)
  const [sshOpen, setSshOpen] = useState(false)
  const [namespaceOpen, setNamespaceOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<PermissionProject | null>(null)
  const [editingProject, setEditingProject] = useState<PermissionProject | null>(null)
  const [draftMembers, setDraftMembers] = useState<ProjectPermissionMember[]>([])
  const [selectedMemberAccount, setSelectedMemberAccount] = useState<string>()
  const [sshConfigs, setSshConfigs] = useState<Record<string, SSHConfigRecord>>({})
  const [namespaceConfigs, setNamespaceConfigs] = useState<Record<string, string>>({})
  const sshEnabled = Form.useWatch('enabled', sshForm)

  const visibleProjects = useMemo(() => {
    if (currentUser.roleKeys.includes('platform_admin')) {
      return permissionState.projects
    }

    return permissionState.projects.filter(project =>
      project.members.some(member => member.account === currentUser.account && member.hasDataPermission),
    )
  }, [currentUser.account, currentUser.roleKeys, permissionState.projects])

  const projectAdminOptions = useMemo(
    () =>
      permissionState.users
        .filter(user => user.roleKeys.includes('project_admin') && !user.roleKeys.includes('platform_admin'))
        .map(user => ({
          value: user.account,
          label: `${user.account}（${user.username}）`,
        })),
    [permissionState.users],
  )

  const getProjectAdminAccounts = (project: PermissionProject) =>
    project.members
      .filter(member => {
        const user = getUserByAccount(member.account, permissionState)
        return Boolean(member.hasDataPermission && user?.roleKeys.includes('project_admin') && !user.roleKeys.includes('platform_admin'))
      })
      .map(member => member.account)

  const getPrimaryRoleKey = (account: string) => {
    const user = getUserByAccount(account, permissionState)
    if (!user) {
      return 'training_engineer' as const
    }
    if (user.roleKeys.includes('platform_admin')) {
      return 'platform_admin' as const
    }
    if (user.roleKeys.includes('project_admin')) {
      return 'project_admin' as const
    }
    return user.roleKey
  }

  const getRoleTags = (account: string) => {
    const user = getUserByAccount(account, permissionState)
    return (user?.roleKeys ?? []).map(roleKey => getRoleLabel(roleKey, permissionState))
  }

  const getMemberUser = (account: string) => getUserByAccount(account, permissionState)

  const formatJoinedAt = () => {
    const now = new Date()
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  }

  const guardOperation = (operationKey: string, callback: () => void) => {
    const result = canRunOperation(operationKey, undefined, permissionState)
    if (!result.allowed) {
      message.warning(getOperationDeniedMessage(result.reason))
      return
    }
    callback()
  }

  const openCreateProject = () => {
    setEditingProject(null)
    form.resetFields()
    setCreateOpen(true)
  }

  const openEditProject = (project: PermissionProject) => {
    setEditingProject(project)
    form.setFieldsValue({
      name: project.name,
      description: project.description,
      projectAdmins: getProjectAdminAccounts(project),
      cluster: project.cluster,
    })
    setCreateOpen(true)
  }

  const closeProjectModal = () => {
    setCreateOpen(false)
    setEditingProject(null)
    form.resetFields()
  }

  const confirmDeleteProject = (project: PermissionProject) => {
    Modal.confirm({
      title: '确认删除项目？',
      content: `删除后项目「${project.name}」将从项目管理列表移除，请确认是否继续。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        deleteProject(project.id)
        message.success(`已删除项目：${project.name}`)
      },
    })
  }

  const generateSSHKey = () => {
    const generatedKey = `ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDeepexiLabGeneratedKey-${Date.now()}`
    sshForm.setFieldValue('sshKey', generatedKey)
    const blob = new Blob([`${generatedKey}\n`], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${selectedProject?.name ?? 'project'}-ssh-key.pub`
    link.click()
    URL.revokeObjectURL(url)
  }

  const columns: ColumnsType<PermissionProject> = [
    { title: '项目名称', dataIndex: 'name', key: 'name', width: 180 },
    {
      title: '项目描述',
      dataIndex: 'description',
      key: 'description',
      width: 220,
      ellipsis: true,
      render: value => value || '-',
    },
    { title: '绑定集群', dataIndex: 'cluster', key: 'cluster', width: 180 },
    {
      title: 'SSH配置',
      key: 'ssh',
      width: 120,
      render: (_, record) => {
        const config = sshConfigs[record.id]
        return config?.enabled ? '已配置' : '未配置'
      },
    },
    {
      title: '镜像命名空间',
      key: 'namespace',
      width: 150,
      render: (_, record) => namespaceConfigs[record.id] || '-',
    },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180 },
    {
      title: '操作',
      key: 'action',
      width: 420,
      render: (_, record) => (
        <Space size={0} style={{ whiteSpace: 'nowrap' }}>
          <Button
            type="link"
            size="small"
            onClick={() =>
              guardOperation('admin.project.edit', () => {
                openEditProject(record)
              })
            }
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            icon={<SettingOutlined />}
            onClick={() =>
              guardOperation('admin.project.edit', () => {
                setSelectedProject(record)
                const currentConfig = sshConfigs[record.id] ?? {
                  enabled: false,
                  username: '',
                  password: '',
                  sshKey: '',
                }
                sshForm.setFieldsValue(currentConfig)
                setSshOpen(true)
              })
            }
          >
            SSH配置
          </Button>
          <Button
            type="link"
            size="small"
            icon={<CloudServerOutlined />}
            onClick={() =>
              guardOperation('admin.project.edit', () => {
                setSelectedProject(record)
                namespaceForm.setFieldsValue({ namespace: namespaceConfigs[record.id] })
                setNamespaceOpen(true)
              })
            }
          >
            镜像命名空间配置
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() =>
              guardOperation('admin.project.members', () => {
                setSelectedProject(record)
                setDraftMembers(record.members.filter(member => member.hasDataPermission))
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
            danger
            onClick={() =>
              guardOperation('admin.project.edit', () => {
                confirmDeleteProject(record)
              })
            }
          >
            删除
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
      width: 180,
    },
    {
      title: '用户名',
      key: 'username',
      width: 180,
      render: (_, record) => getMemberUser(record.account)?.username ?? '-',
    },
    {
      title: '角色',
      key: 'role',
      width: 260,
      render: (_, record) => getRoleTags(record.account).join('、') || '-',
    },
    {
      title: '邮箱',
      key: 'email',
      width: 240,
      render: (_, record) => getMemberUser(record.account)?.email ?? '-',
    },
    {
      title: '加入时间',
      key: 'joinedAt',
      width: 190,
      render: (_, record) => record.joinedAt ?? '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Button
          type="link"
          danger
          size="small"
          onClick={() => {
            setDraftMembers(previous => previous.filter(item => item.account !== record.account))
          }}
        >
          删除
        </Button>
      ),
    },
  ]

  const submitCreate = async () => {
    try {
      const values = await form.validateFields()
      const payload = {
        name: values.name,
        description: values.description ?? '',
        projectAdmins: values.projectAdmins ?? [],
        cluster: values.cluster,
      }

      if (editingProject) {
        updateProject(editingProject.id, payload)
        message.success('项目编辑成功')
      } else {
        createProject(payload)
        message.success('项目创建成功')
      }
      closeProjectModal()
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

  const submitSSHConfig = async () => {
    if (!selectedProject) {
      return
    }

    try {
      const values = await sshForm.validateFields()
      setSshConfigs(previous => ({
        ...previous,
        [selectedProject.id]: {
          enabled: Boolean(values.enabled),
          username: values.username || '',
          password: values.password || '',
          sshKey: values.sshKey || '',
        },
      }))
      setSshOpen(false)
      message.success('SSH配置已保存')
    } catch {
      return
    }
  }

  const submitNamespace = async () => {
    if (!selectedProject) {
      return
    }

    try {
      const values = await namespaceForm.validateFields()
      setNamespaceConfigs(previous => ({
        ...previous,
        [selectedProject.id]: values.namespace,
      }))
      setNamespaceOpen(false)
      message.success('镜像命名空间已保存')
    } catch {
      return
    }
  }

  const submitMember = async () => {
    if (!selectedProject) {
      return
    }

    try {
      const values = await memberForm.validateFields()
      setDraftMembers(previous => {
        const existingIndex = previous.findIndex(item => item.account === values.account)
        const roleKey = getPrimaryRoleKey(values.account)
        const nextMember: ProjectPermissionMember = {
          account: values.account,
          roleKey,
          hasDataPermission: true,
          joinedAt: previous[existingIndex]?.joinedAt ?? formatJoinedAt(),
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
            统一维护项目基础信息、绑定集群、项目管理员、成员权限、SSH 配置与镜像命名空间。
          </Text>

          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => guardOperation('admin.project.create', openCreateProject)}
            >
              新建项目
            </Button>
          </div>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={visibleProjects}
            pagination={{ pageSize: 10, showTotal: total => `共 ${total} 条数据` }}
            scroll={{ x: 1250 }}
          />
        </Card>
      </div>

      <Modal
        title={editingProject ? '编辑项目' : '新建项目'}
        open={createOpen}
        onCancel={closeProjectModal}
        footer={
          <Space>
            <Button onClick={closeProjectModal}>取消</Button>
            <Button type="primary" onClick={submitCreate}>
              {editingProject ? '确定' : '创建'}
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
          <Form.Item label="项目管理员" name="projectAdmins">
            <Select
              mode="multiple"
              placeholder="请选择项目管理员"
              options={projectAdminOptions}
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item label="绑定集群" name="cluster" rules={[{ required: true, message: '请选择绑定集群' }]}>
            <Select
              disabled={Boolean(editingProject)}
              placeholder="请选择集群"
              options={clusterOptions.map(item => ({ value: item, label: item }))}
            />
          </Form.Item>
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14 }}>
            <Text type="secondary">
              平台管理员在新建项目后默认拥有该项目数据权限，其他角色默认无数据权限。
            </Text>
          </div>
        </Form>
      </Modal>

      <Modal
        title={selectedProject ? `${selectedProject.name} · 成员管理` : '成员管理'}
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
                }}
              />
            </Form.Item>
            <Form.Item>
              <Button type="primary" onClick={submitMember}>
                添加成员
              </Button>
            </Form.Item>
          </Form>
          {selectedMemberAccount && (
            <Text type="secondary" style={{ display: 'block', marginTop: 10 }}>
              该成员已有角色：
              {getRoleTags(selectedMemberAccount).join('、') || '-'}；项目内操作权限将按多个角色的权限合集生效。
            </Text>
          )}
        </Card>
        <Table
          rowKey="account"
          columns={permissionColumns}
          dataSource={draftMembers}
          pagination={false}
          rowSelection={{}}
          scroll={{ x: 1170 }}
        />
      </Modal>

      <Modal
        title={selectedProject ? `${selectedProject.name} · SSH配置` : 'SSH配置'}
        open={sshOpen}
        onCancel={() => setSshOpen(false)}
        footer={
          <Space>
            <Button onClick={() => setSshOpen(false)}>取消</Button>
            <Button type="primary" onClick={submitSSHConfig}>确定</Button>
          </Space>
        }
      >
        <Form form={sshForm} layout="vertical" initialValues={{ enabled: false }}>
          <Card size="small" style={{ borderRadius: 14, background: '#f8fafc', marginBottom: 16 }}>
            <Form.Item label="ssh配置" name="enabled" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>
            {!sshEnabled && (
              <Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
                当前未开启 SSH 配置，开启后可填写用户名、密码并生成 SSH Key。
              </Text>
            )}
          </Card>
          {sshEnabled && (
            <Card size="small" style={{ borderRadius: 14, border: '1px solid #e5e7eb' }}>
              <Form.Item label="用户名" name="username">
                <Input placeholder="请输入用户名" />
              </Form.Item>
              <Form.Item label="密码" name="password">
                <Input.Password placeholder="请输入密码" />
              </Form.Item>
              <Form.Item label="SSH Key" name="sshKey">
                <Input placeholder="可手动输入或生成 SSH Key" />
              </Form.Item>
              <Button onClick={generateSSHKey}>生成SSH Key</Button>
            </Card>
          )}
        </Form>
      </Modal>

      <Modal
        title={selectedProject ? `${selectedProject.name} · 编辑命名空间` : '编辑命名空间'}
        open={namespaceOpen}
        onCancel={() => setNamespaceOpen(false)}
        footer={
          <Space>
            <Button onClick={() => setNamespaceOpen(false)}>取消</Button>
            <Button type="primary" onClick={submitNamespace}>确定</Button>
          </Space>
        }
      >
        <Form form={namespaceForm} layout="vertical">
          <Form.Item label="命名空间" name="namespace" rules={[{ required: true, message: '请选择命名空间' }]}>
            <Select placeholder="请选择命名空间" options={namespaceOptions.map(item => ({ value: item, label: item }))} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default ProjectManagement
