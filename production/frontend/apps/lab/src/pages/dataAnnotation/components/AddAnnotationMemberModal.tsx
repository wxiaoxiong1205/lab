import React, { useEffect, useState } from 'react'
import { Input, Modal, Table, message } from 'antd'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { projectMemberApi } from '@/services/api'
import type { PageUser, User } from '@/types'

export type AddAnnotationMemberMode = 'annotation' | 'review'

interface AddAnnotationMemberModalProps {
  open: boolean
  mode: AddAnnotationMemberMode
  projectId: string | undefined
  /** 已选中的用户 ID，用于排除或展示已选 */
  excludeUserIds?: number[]
  /** 审核模式下最多选几人 */
  maxSelect?: number
  onCancel: () => void
  onConfirm: (users: User[]) => void
}

const AddAnnotationMemberModal: React.FC<AddAnnotationMemberModalProps> = ({
  open,
  mode,
  projectId,
  excludeUserIds = [],
  maxSelect,
  onCancel,
  onConfirm,
}) => {
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
  const [selectedUsers, setSelectedUsers] = useState<User[]>([])
  const [userSearchText, setUserSearchText] = useState('')
  const [userPage, setUserPage] = useState(1)
  const [userPageSize, setUserPageSize] = useState(10)

  const title = mode === 'annotation' ? '添加标注成员' : '添加审核成员'

  const { data: usersData, isLoading: usersLoading } = useQuery<PageUser>({
    queryKey: ['projectUsers', projectId, userPage, userPageSize, userSearchText],
    queryFn: () =>
      projectMemberApi.getProjectUsers(Number(projectId!), {
        page: userPage,
        size: userPageSize,
      }),
    enabled: open && !!projectId,
    staleTime: 0,
  })

  const rawUsers = usersData?.items ?? usersData?.rows ?? []
  const totalUsers = usersData?.total ?? 0
  const availableUsers = userSearchText.trim()
    ? rawUsers.filter((u: User) =>
        (u.username || '').toLowerCase().includes(userSearchText.trim().toLowerCase()),
      )
    : rawUsers
  const displayTotal = userSearchText.trim() ? availableUsers.length : totalUsers

  useEffect(() => {
    if (open) {
      setSelectedUserIds([])
      setSelectedUsers([])
      setUserSearchText('')
      setUserPage(1)
      setUserPageSize(10)
    }
  }, [open])

  const handleCancel = () => {
    setSelectedUserIds([])
    setSelectedUsers([])
    setUserSearchText('')
    setUserPage(1)
    onCancel()
  }

  const handleUserSearch = (value: string) => {
    setUserSearchText(value)
    setUserPage(1)
  }

  const getId = (u: User & { id?: number }) => u.userId ?? u.id ?? 0

  const handleUserSelectChange = (selectedRowKeys: React.Key[], selectedRows: (User & { id?: number })[]) => {
    let ids = selectedRowKeys as number[]
    let rows = selectedRows

    // 单人替换场景下按“单选”处理：直接用最新一次点击的结果覆盖旧选择，
    // 用户不需要先手动取消旧选项再选择新成员。
    if (maxSelect === 1 && ids.length > 1) {
      ids = [ids[ids.length - 1]]
      rows = selectedRows.length > 0 ? [selectedRows[selectedRows.length - 1]] : []
    }
    else if (maxSelect != null && ids.length > maxSelect) {
      message.warning(`最多选择 ${maxSelect} 人`)
      return
    }

    setSelectedUserIds(ids)
    const currentPageMap = new Map(rows.map((r) => [getId(r), r]))
    const prevMap = new Map(selectedUsers.map((u) => [getId(u as User & { id?: number }), u]))
    const merged = ids.map(
      (id) => currentPageMap.get(id) ?? prevMap.get(id),
    ).filter(Boolean) as User[]
    setSelectedUsers(merged)
  }

  const handleUserPageChange = (page: number, pageSize?: number) => {
    setUserPage(page)
    if (pageSize) {
      setUserPageSize(pageSize)
    }
  }

  const handleOk = () => {
    if (selectedUsers.length === 0) {
      message.warning('请选择要添加的成员')
      return
    }
    if (maxSelect != null && selectedUsers.length > maxSelect) {
      message.warning(`最多选择 ${maxSelect} 人`)
      return
    }
    onConfirm(selectedUsers)
    handleCancel()
  }

  const rowKey = (record: User & { id?: number }) => record.userId ?? record.id ?? 0

  const removeSelected = (id: number) => {
    setSelectedUserIds((prev) => prev.filter((i) => i !== id))
    setSelectedUsers((prev) => prev.filter((u) => getId(u as User & { id?: number }) !== id))
  }

  return (
    <Modal
      title={title}
      open={open}
      onCancel={handleCancel}
      onOk={handleOk}
      width={800}
      okText={`添加选中成员 (${selectedUserIds.length})`}
      cancelText="取消"
      okButtonProps={{ disabled: selectedUserIds.length === 0 }}
    >
      <div className="mb-4">
        <Input.Search
          placeholder="搜索账号"
          value={userSearchText}
          onChange={(e) => setUserSearchText(e.target.value)}
          onSearch={handleUserSearch}
          allowClear
          enterButton
        />
      </div>

      {selectedUserIds.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-800">
              已选中
              {' '}
              {selectedUserIds.length}
              {' '}
              个成员
              {maxSelect != null ? ` / 最多 ${maxSelect} 人` : ''}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedUsers.map((user: User & { id?: number }) => (
              <div
                key={rowKey(user)}
                className="flex items-center space-x-2 bg-white px-2 py-1 rounded border hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm font-medium">{user.username}</span>
                <button
                  type="button"
                  onClick={() => removeSelected(getId(user))}
                  className="ml-1 text-gray-400 hover:text-red-500 transition-colors"
                  title="移除"
                >
                  <span className="text-xs">×</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">从项目成员列表中选择</span>
          {selectedUserIds.length > 0 && (
            <span className="text-sm text-blue-600">
              已选中
              {' '}
              {selectedUserIds.length}
              {' '}
              人
            </span>
          )}
        </div>
        <Table
          dataSource={availableUsers}
          rowKey={rowKey}
          loading={usersLoading}
          rowSelection={{
            selectedRowKeys: selectedUserIds,
            onChange: handleUserSelectChange,
            type: maxSelect === 1 ? 'radio' : 'checkbox',
            getCheckboxProps: (record) => {
              const id = (record as User & { id?: number }).userId ?? (record as any).id
              const excluded = excludeUserIds.includes(id)
              const atMax = maxSelect != null && selectedUserIds.length >= maxSelect && !selectedUserIds.includes(id)
              return { disabled: excluded || atMax }
            },
          }}
          pagination={{
            current: userPage,
            pageSize: userPageSize,
            total: userSearchText.trim() ? undefined : totalUsers,
            onChange: handleUserPageChange,
            onShowSizeChange: handleUserPageChange,
            showSizeChanger: true,
            showQuickJumper: !userSearchText.trim(),
            showTotal: (total, range) =>
              userSearchText.trim()
                ? `${range[0]}-${range[1]} / ${displayTotal} 条`
                : `${range[0]}-${range[1]} / ${total} 个用户`,
          }}
          size="small"
          scroll={{ y: 300 }}
        >
          <Table.Column title="账号" dataIndex="username" key="username" />
          <Table.Column title="用户名" dataIndex="nickname" key="nickname" />
          <Table.Column title="邮箱" dataIndex="email" key="email" />
        </Table>
      </div>
    </Modal>
  )
}

export default AddAnnotationMemberModal
