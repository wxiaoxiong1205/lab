import { useEffect, useState } from 'react'
import { Input, Modal, Table, message } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { platformAdminApi } from '@/services/api'
import type { PageUser } from '@/types'

interface AddPlatformAdminModalProps {
  open: boolean
  onCancel: () => void
  onSuccess?: () => void
}

const AddPlatformAdminModal: React.FC<AddPlatformAdminModalProps> = ({
  open,
  onCancel,
  onSuccess,
}) => {
  const queryClient = useQueryClient()
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
  const [userSearchText, setUserSearchText] = useState('')
  const [userPage, setUserPage] = useState(1)
  const [userPageSize, setUserPageSize] = useState(10)

  // 获取用户列表（用于添加平台管理员）
  const { data: usersData, isLoading: usersLoading } = useQuery<PageUser>({
    queryKey: ['platformNotAssociatedUsers', userPage, userPageSize, userSearchText],
    queryFn: () => platformAdminApi.getNotAssociatedUsers({
      page: userPage,
      size: userPageSize,
      username: userSearchText || undefined,
    }),
    enabled: open,
    staleTime: 0,
  })

  const availableUsers = usersData?.items || usersData?.rows || []
  const totalUsers = usersData?.total || 0

  // 添加平台管理员
  const addMutation = useMutation({
    mutationFn: async (userIds: number[]) => {
      await platformAdminApi.batchGrant(userIds)
    },
    onSuccess: () => {
      message.success('添加成功')
      queryClient.invalidateQueries({ queryKey: ['platformAdmins'] })
      handleCancel()
      if (onSuccess) {
        onSuccess()
      }
    },
    onError: () => {
      message.error('添加失败')
    },
  })

  // 重置状态
  useEffect(() => {
    if (open) {
      setSelectedUserIds([])
      setUserSearchText('')
      setUserPage(1)
      setUserPageSize(10)
      queryClient.invalidateQueries({
        queryKey: ['platformNotAssociatedUsers'],
      })
    }
  }, [open, queryClient])

  const handleCancel = () => {
    setSelectedUserIds([])
    setUserSearchText('')
    setUserPage(1)
    onCancel()
  }

  const handleUserSearch = (value: string) => {
    setUserSearchText(value)
    setUserPage(1)
  }

  const handleUserSelectChange = (selectedRowKeys: React.Key[]) => {
    setSelectedUserIds(selectedRowKeys as number[])
  }

  const handleUserPageChange = (page: number, pageSize?: number) => {
    setUserPage(page)
    if (pageSize) {
      setUserPageSize(pageSize)
    }
  }

  const handleOk = () => {
    if (selectedUserIds.length === 0) {
      message.warning('请选择要添加的用户')
      return
    }
    addMutation.mutate(selectedUserIds)
  }

  return (
    <Modal
      title="添加平台管理员"
      open={open}
      onCancel={handleCancel}
      onOk={handleOk}
      confirmLoading={addMutation.isPending}
      width={800}
      okText={`添加选中用户 (${selectedUserIds.length})`}
      cancelText="取消"
      okButtonProps={{ disabled: selectedUserIds.length === 0 }}
    >
      {/* 用户搜索 */}
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

      {/* 选中用户展示 */}
      {selectedUserIds.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-800">
              已选中
              {' '}
              {selectedUserIds.length}
              {' '}
              个用户
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {availableUsers
              .filter((user: any) => selectedUserIds.includes(user.id || user.userId))
              .map((user: any) => (
                <div key={user.id || user.userId} className="flex items-center space-x-2 bg-white px-2 py-1 rounded border hover:bg-gray-50 transition-colors">
                  <span className="text-sm font-medium">{user.username}</span>
                  {user.email && (
                    <span className="text-xs text-gray-500">
                      (
                      {user.email}
                      )
                    </span>
                  )}
                  <button
                    onClick={() => {
                      const newSelectedIds = selectedUserIds.filter((id) => id !== (user.id || user.userId))
                      setSelectedUserIds(newSelectedIds)
                    }}
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

      {/* 用户选择表格 */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">
            从列表中选择账号
          </span>
          {selectedUserIds.length > 0 && (
            <span className="text-sm text-blue-600">
              已选中
              {' '}
              {selectedUserIds.length}
              {' '}
              个账号
            </span>
          )}
        </div>
        <Table
          dataSource={availableUsers}
          rowKey={(record: any) => record.id || record.userId}
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
              `${range[0]}-${range[1]} / ${total} 个用户`,
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
            title="邮箱"
            dataIndex="email"
            key="email"
          />
          <Table.Column
            title="创建时间"
            dataIndex="createdTime"
            key="createdTime"
            render={(date: string) => {
              if (!date) return '-'
              return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
            }}
          />
        </Table>
      </div>
    </Modal>
  )
}

export default AddPlatformAdminModal
