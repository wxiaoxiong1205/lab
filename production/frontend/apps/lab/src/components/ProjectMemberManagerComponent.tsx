import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Avatar,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Typography,
  message,
} from 'antd'
import { TeamOutlined, UserOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import type { Project, ProjectMember, ProjectMemberRole } from '../types'
import { projectMemberApi } from '../services/api'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'
import TableToolbar from '@/components/common/TableToolbar'

const { Text } = Typography

interface ProjectMemberManagerComponentProps {
  /** 是否为管理员模式 */
  isAdminMode?: boolean
  /** 项目ID，如果为空且是管理员模式，则需要项目选择器 */
  projectId?: number
  /** 当前项目信息，用于显示项目名称等 */
  currentProject?: Project | null
  /** 项目列表，用于管理员模式下的项目选择 */
  availableProjects?: Project[]
  /** 项目变更回调 */
  onProjectChange?: (projectId: number) => void
  /** 自定义标题 */
  title?: string
  /** 自定义样式类名 */
  className?: string
}

const ProjectMemberManagerComponent: React.FC<ProjectMemberManagerComponentProps> = ({
  isAdminMode = false,
  projectId: propProjectId,
  availableProjects = [],
  onProjectChange,
  title,
  className = '',
}) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('projectId')
  const navigate = useNavigate()
  const [isBatchAddModalVisible, setIsBatchAddModalVisible] = useState(false)
  const [isEditModalVisible, setIsEditModalVisible] = useState(false)
  const [currentMember, setCurrentMember] = useState<ProjectMember | null>(null)
  const [searchText, setSearchText] = useState('')
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(propProjectId)
  const [form] = Form.useForm()

  // 成员列表分页状态
  const [memberPage, setMemberPage] = useState(1)
  const [memberPageSize, setMemberPageSize] = useState(10)

  // 用户选择相关状态
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
  const [userSearchText, setUserSearchText] = useState('')
  const [userPage, setUserPage] = useState(1)
  const [userPageSize, setUserPageSize] = useState(10)
  const [revokingUserId, setRevokingUserId] = useState<number | null>(null)

  useEffect(() => {
    if (projectId) {
      setSelectedProjectId(Number(projectId))
    }
  }, [projectId])

  // 更新选中的项目ID
  useEffect(() => {
    if (propProjectId) {
      setSelectedProjectId(propProjectId)
    }
  }, [propProjectId])

  // 获取项目成员列表
  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['projectMembers', selectedProjectId, memberPage, memberPageSize],
    queryFn: () => projectMemberApi.list(selectedProjectId!, {
      page: memberPage,
      size: memberPageSize,
    }),
    enabled: !!selectedProjectId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  })

  const members = membersData?.rows || membersData?.items || []
  const totalMembers = membersData?.total || 0

  // 获取未关联该项目的用户列表（分页）
  const { data: availableUsersData, isLoading: usersLoading } = useQuery({
    queryKey: ['notAssociatedUsers', selectedProjectId, userPage, userPageSize, userSearchText],
    queryFn: () => projectMemberApi.getNotAssociatedUsers(selectedProjectId!, {
      page: userPage,
      size: userPageSize,
      username: userSearchText || undefined,
    }),
    enabled: !!selectedProjectId,
  })

  const availableUsers = availableUsersData?.rows || []
  const totalUsers = availableUsersData?.total || 0

  // 批量添加成员
  const batchAddMemberMutation = useMutation({
    mutationFn: async (data: { user_ids: number[], role: ProjectMemberRole }) => {
      // 使用批量添加接口
      await projectMemberApi.batchAdd(selectedProjectId!, { user_ids: data.user_ids })
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['projectMembers', selectedProjectId] })
      queryClient.invalidateQueries({ queryKey: ['notAssociatedUsers', selectedProjectId] })
      message.success(t('projectMember.batchAddSuccess', { count: variables.user_ids.length }))
      setIsBatchAddModalVisible(false)
      setSelectedUserIds([])
      setUserSearchText('')
      setUserPage(1)
    },
    onError: () => {
      message.error(t('projectMember.addError'))
    },
  })

  // 更新成员角色
  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number, role: ProjectMemberRole }) =>
      projectMemberApi.updateRole(selectedProjectId!, userId, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectMembers', selectedProjectId] })
      message.success(t('projectMember.updateRoleSuccess'))
      setIsEditModalVisible(false)
      setCurrentMember(null)
    },
    onError: () => {
      message.error(t('projectMember.updateRoleError'))
    },
  })

  // 移除成员（支持单个和批量）
  const removeMemberMutation = useMutation({
    mutationFn: (userIds: number[]) => projectMemberApi.batchRemove(selectedProjectId!, userIds),
    onSuccess: (_, userIds) => {
      queryClient.invalidateQueries({ queryKey: ['projectMembers', selectedProjectId] })
      queryClient.invalidateQueries({ queryKey: ['notAssociatedUsers', selectedProjectId] })
      if (userIds.length === 1) {
        message.success(t('projectMember.removeSuccess'))
      }
      else {
        message.success(t('projectMember.batchRemoveSuccess', { count: userIds.length }))
      }
      setSelectedMemberIds([])
    },
    onError: () => {
      // message.error(t("projectMember.removeError"));
    },
  })

  // 撤销项目管理员
  const revokeAdminMutation = useMutation({
    mutationFn: (userId: number) => {
      setRevokingUserId(userId)
      return projectMemberApi.revoke(selectedProjectId!, userId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectMembers', selectedProjectId] })
      message.success('撤销成功')
      setRevokingUserId(null)
    },
    onError: () => {
      // message.error("撤销管理员失败");
      setRevokingUserId(null)
    },
  })

  // 暂时允许所有用户管理成员（后续可根据需要添加权限控制）
  const canManageMembers = true

  // 根据is_admin字段推导角色
  const getUserRole = (member: ProjectMember): ProjectMemberRole => {
    if (member.is_admin) {
      return 'admin'
    }
    return 'member'
  }

  // 过滤成员列表
  const filteredMembers = members.filter((member) =>
    member.username.toLowerCase().includes(searchText.toLowerCase()),
  )

  // 获取可以移除的成员（排除owner）
  const removableMemberIds = filteredMembers
    .filter((member) => getUserRole(member) !== 'owner')
    .map((member) => member.id)

  const handleBatchAddMember = () => {
    if (selectedUserIds.length === 0) {
      message.warning(t('projectMember.selectUsersToAdd'))
      return
    }
    batchAddMemberMutation.mutate({ user_ids: selectedUserIds, role: 'member' })
  }

  const handleUpdateRole = (values: { role: ProjectMemberRole }) => {
    if (currentMember) {
      updateRoleMutation.mutate({
        userId: currentMember.id,
        role: values.role,
      })
    }
  }

  const handleRemoveMember = (member: ProjectMember) => {
    removeMemberMutation.mutate([member.userId])
  }

  const handleRevokeAdmin = (member: ProjectMember) => {
    revokeAdminMutation.mutate(member.userId || member.id)
  }

  const handleBatchRemoveMembers = () => {
    if (selectedMemberIds.length === 0) {
      message.warning(t('projectMember.selectMembersToRemove'))
      return
    }

    // 过滤掉owner角色的成员
    const validMemberIds = selectedMemberIds.filter((memberId) => {
      const member = members.find((m) => (m.userId || m.id) === memberId)
      return member && getUserRole(member) !== 'owner'
    })

    if (validMemberIds.length === 0) {
      message.warning(t('projectMember.cannotRemoveSelectedMembers'))
      return
    }

    if (validMemberIds.length !== selectedMemberIds.length) {
      message.warning(t('projectMember.ownerCannotBeRemoved'))
    }

    removeMemberMutation.mutate(validMemberIds)
  }

  const handleSelectChange = (selectedRowKeys: React.Key[]) => {
    setSelectedMemberIds(selectedRowKeys as number[])
  }

  // 用户选择相关处理函数
  const handleUserSelectChange = (selectedRowKeys: React.Key[]) => {
    setSelectedUserIds(selectedRowKeys as number[])
  }

  const handleUserSearch = (value: string) => {
    setUserSearchText(value)
    setUserPage(1)
  }

  const handleUserPageChange = (page: number, pageSize?: number) => {
    setUserPage(page)
    if (pageSize) {
      setUserPageSize(pageSize)
    }
  }

  const handleProjectChange = (newProjectId: number) => {
    setSelectedProjectId(newProjectId)
    setSelectedMemberIds([])
    setSearchText('')
    setMemberPage(1)
    queryClient.invalidateQueries({ queryKey: ['projectMembers'] })
    queryClient.invalidateQueries({ queryKey: ['notAssociatedUsers'] })
    onProjectChange?.(newProjectId)
  }

  const handleMemberPageChange = (page: number, pageSize?: number) => {
    setMemberPage(page)
    if (pageSize) {
      setMemberPageSize(pageSize)
    }
  }

  const columns = [
    {
      title: '账号',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '用户名',
      dataIndex: 'nickname',
      key: 'nickname',
    },
    {
      title: '角色',
      dataIndex: 'is_project_admin',
      key: 'is_project_admin',
      render: (is_project_admin: boolean) => {
        return is_project_admin ? '项目管理员' : '普通成员'
      },
    },
    {
      title: t('projectMember.email'),
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: t('projectMember.joinedAt'),
      dataIndex: 'joinTime',
      key: 'joinTime',
      render: (date: string) => {
        if (!date) return '-'
        const dateObj = new Date(date)
        return dateObj.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      },
    },
    {
      title: t('projectMember.actions'),
      key: 'actions',
      render: (_: any, record: ProjectMember) => (
        <Space size="small">
          {getUserRole(record) !== 'owner' ? (
            <>
              {/* <Popconfirm
                title="确定要撤销此成员的管理员权限吗？"
                description="撤销后该用户将失去项目管理员权限"
                onConfirm={() => handleRevokeAdmin(record)}
                okText="确定"
                cancelText="取消"
              >
                <Button
                  type="link"
                  size="small"
                  loading={revokingUserId === (record.userId || record.id)}
                >
                  撤销
                </Button>
              </Popconfirm> */}
              <Popconfirm
                title={t('projectMember.removeConfirm')}
                description={t('projectMember.removeWarning')}
                onConfirm={() => handleRemoveMember(record)}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
              >
                <Button
                  type="link"
                  size="small"
                  danger
                >
                  删除
                </Button>
              </Popconfirm>
            </>
          ) : (
            <Text type="secondary">-</Text>
          )}
        </Space>
      ),
    },
  ]

  // 行选择配置
  const rowSelection = {
    selectedRowKeys: selectedMemberIds,
    onChange: handleSelectChange,
    getCheckboxProps: (record: ProjectMember) => ({
      disabled: getUserRole(record) === 'owner', // 禁用owner的选择框
      name: record.username,
    }),
    preserveSelectedRowKeys: true, // 保持选中状态
    type: 'checkbox' as const, // 明确指定为复选框类型
  }

  return (
    <div className={`project-member-management-container lab-list-page-shell ${className}`}>

      {/* 页面标题和统计 */}
      <CreateFormPageHeader
        title={title || t('projectMember.management')}
        onBack={() => navigate('/project/admin/projects')}
      />
      <div className="mb-6">
        <TableToolbar
          searchFormItems={(
            <>
              {/* 项目选择器（管理员模式） */}
              {isAdminMode && (
                <Select
                  placeholder={t('common.selectProject')}
                  className="w-[200px]"
                  value={selectedProjectId && availableProjects.some((p) => p.id === selectedProjectId)
                    ? selectedProjectId
                    : undefined}
                  onChange={handleProjectChange}
                  options={availableProjects.map((project) => ({
                    label: project.name,
                    value: project.id,
                  }))}
                />
              )}
              <Input
                placeholder="请输入账号"
                allowClear
                className="w-[300px]"
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value)
                  setMemberPage(1)
                }}
              />
            </>
          )}
          toolbarActions={[
            {
              key: 'batchAdd',
              label: t('projectMember.batchAddMember'),
              type: 'primary',
              disabled: availableUsers.length === 0,
              onClick: () => setIsBatchAddModalVisible(true),
            },
            {
              key: 'batchRemove',
              label: `${t('projectMember.batchRemove')} (${selectedMemberIds.length})`,
              type: 'primary',
              danger: true,
              disabled: selectedMemberIds.length === 0,
              loading: removeMemberMutation.isPending,
              onClick: () => {
                Modal.confirm({
                  title: t('projectMember.batchRemoveConfirm'),
                  content: t('projectMember.batchRemoveWarning', { count: selectedMemberIds.length }),
                  okText: t('common.confirm'),
                  cancelText: t('common.cancel'),
                  onOk: handleBatchRemoveMembers,
                })
              },
            },
          ]}
        />

        <Card size="small" className="mb-4">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <TeamOutlined className="text-blue-500" />
              <Text>
                {t('projectMember.total')}
                {' '}
                {totalMembers}
                {' '}
                {t('projectMember.members')}
              </Text>
            </div>
            {selectedMemberIds.length > 0 && (
              <div className="flex items-center space-x-2">
                <Text type="secondary">
                  {t('projectMember.selected', { count: selectedMemberIds.length })}
                </Text>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* 成员列表 */}
      <Table
        columns={columns}
        dataSource={filteredMembers}
        rowKey={(record) => record.userId || record.id}
        loading={membersLoading}
        rowSelection={rowSelection}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t('projectMember.noMembers')}
            />
          ),
        }}
        pagination={{
          current: memberPage,
          pageSize: memberPageSize,
          total: totalMembers,
          onChange: handleMemberPageChange,
          onShowSizeChange: handleMemberPageChange,
          showSizeChanger: true,
          // showQuickJumper: true,
          showTotal: (total, range) =>
            `总共 ${total} ${t('projectMember.members')}`,
        }}
      />

      {/* 编辑角色模态框 */}
      <Modal
        title={t('projectMember.editRole')}
        open={isEditModalVisible}
        onCancel={() => {
          setIsEditModalVisible(false)
          setCurrentMember(null)
        }}
        onOk={() => form.submit()}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmLoading={updateRoleMutation.isPending}
      >
        {currentMember && (
          <div className="mb-4 p-4 bg-gray-50 rounded">
            <div className="flex items-center space-x-2 mb-2">
              <Avatar icon={<UserOutlined />} size="small" />
              <span className="font-medium">{currentMember.username}</span>
            </div>
            <Text type="secondary">{currentMember.email}</Text>
          </div>
        )}

        <Form
          form={form}
          layout="vertical"
          onFinish={handleUpdateRole}
        >
          <Form.Item
            name="role"
            label={t('projectMember.newRole')}
            rules={[{ required: true, message: t('projectMember.selectRole') }]}
          >
            <Select placeholder={t('projectMember.selectRole')}>
              <Select.Option value="admin">
                <div>
                  <div className="font-medium">{t('projectMember.admin')}</div>
                  <div className="text-xs text-gray-500">{t('projectMember.roleAdmin')}</div>
                </div>
              </Select.Option>
              <Select.Option value="member">
                <div>
                  <div className="font-medium">{t('projectMember.member')}</div>
                  <div className="text-xs text-gray-500">{t('projectMember.roleMember')}</div>
                </div>
              </Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量添加成员模态框 */}
      <Modal
        title={t('projectMember.batchAddMember')}
        open={isBatchAddModalVisible}
        onCancel={() => {
          setIsBatchAddModalVisible(false)
          setSelectedUserIds([])
          setUserSearchText('')
          setUserPage(1)
        }}
        onOk={handleBatchAddMember}
        confirmLoading={batchAddMemberMutation.isPending}
        width={800}
        okText={t('projectMember.addSelectedUsers', { count: selectedUserIds.length })}
        cancelText={t('common.cancel')}
        okButtonProps={{ disabled: selectedUserIds.length === 0 }}
      >
        {/* 用户搜索 */}
        <div className="mb-4">
          <Input.Search
            placeholder="请输入账号"
            value={userSearchText}
            onChange={(e) => setUserSearchText(e.target.value)}
            onSearch={handleUserSearch}
            allowClear
            enterButton
          />
        </div>

        {/* 选中用户展示 */}
        {selectedUserIds.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-800">
                {t('projectMember.selectedUsers', { count: selectedUserIds.length })}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableUsers
                .filter((user) => selectedUserIds.includes(user.id))
                .map((user) => (
                  <div key={user.id} className="flex items-center space-x-2 bg-white px-2 py-1 rounded border hover:bg-gray-50 transition-colors">
                    <span className="text-sm font-medium">{user.username}</span>
                    <span className="text-xs text-gray-500">
                      (
                      {user.email}
                      )
                    </span>
                    <button
                      onClick={() => {
                        const newSelectedIds = selectedUserIds.filter((id) => id !== user.id)
                        setSelectedUserIds(newSelectedIds)
                      }}
                      className="ml-1 text-gray-400 hover:text-red-500 transition-colors"
                      title={t('projectMember.removeFromSelection')}
                    >
                      <span className="text-xs">×</span>
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 用户选择表格 */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">
              {t('projectMember.selectUsersFromTable')}
            </span>
            {selectedUserIds.length > 0 && (
              <span className="text-sm text-blue-600">
                {t('projectMember.selectedUsers', { count: selectedUserIds.length })}
              </span>
            )}
          </div>
          <Table
            dataSource={availableUsers}
            rowKey="id"
            loading={usersLoading}
            rowSelection={{
              selectedRowKeys: selectedUserIds,
              onChange: handleUserSelectChange,
              type: 'checkbox',
            }}

            pagination={{
              current: userPage,
              pageSize: userPageSize,
              total: totalUsers,
              onChange: handleUserPageChange,
              onShowSizeChange: handleUserPageChange,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) =>
                `${range[0]}-${range[1]} / ${total} ${t('projectMember.users')}`,
            }}
            size="small"
            scroll={{ y: 300 }}
          >
            <Table.Column
              title="账号"
              dataIndex="username"
              key="username"
            />
            <Table.Column
              title="用户名"
              dataIndex="nickname"
              key="nickname"
            />
            <Table.Column
              title={t('projectMember.email')}
              dataIndex="email"
              key="email"
            />
            <Table.Column
              title={t('projectMember.createdAt')}
              dataIndex="createdTime"
              key="createdTime"
              render={(date: string) => {
                if (!date) return '-'
                const dateObj = new Date(date)
                return dateObj.toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false,
                })
              }}
            />
          </Table>
        </div>
      </Modal>
    </div>
  )
}

export default ProjectMemberManagerComponent
