import { useState } from 'react'
import { Avatar, Button, Col, Input, Popconfirm, Row, Space, Table, Typography, message } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import { platformAdminApi } from '../../services/api'
import type { PlatformAdmin, PlatformAdminListResponse, PlatformAdminUser } from '../../services/api'
import type { PageUser, User } from '../../types'
import { calculatePageAfterDelete } from '../../utils/paginationUtils'
import AddPlatformAdminModal from './components/AddPlatformAdminModal'

const { Title } = Typography
const PlatformManagement = () => {
  const [isAddModalVisible, setIsAddModalVisible] = useState(false)
  const queryClient = useQueryClient()
  // 平台管理员列表搜索状态
  const [adminSearchText, setAdminSearchText] = useState('')
  const [adminPage, setAdminPage] = useState(1)
  const [adminPageSize, setAdminPageSize] = useState(10)
  // 获取平台管理员列表
  const { data: platformAdminsData, isLoading } = useQuery({
    queryKey: ['platformAdmins', adminSearchText, adminPage, adminPageSize],
    queryFn: () => platformAdminApi.list({
      username: adminSearchText || undefined,
      page: adminPage,
      size: adminPageSize,
    }),
    staleTime: 0, // 数据立即过期，确保每次切换页码都重新请求
  })
  // 从分页响应中提取用户列表
  const platformAdmins = (platformAdminsData as PlatformAdminListResponse | undefined)?.rows || []
  const totalAdmins = (platformAdminsData as PlatformAdminListResponse | undefined)?.total || 0
  // 撤销平台管理员
  const revokeMutation = useMutation({
    mutationFn: (userId: number) => platformAdminApi.revoke(userId),
    onSuccess: () => {
      message.success('撤销成功')
      // 计算删除后应该跳转的页码
      const newPage = calculatePageAfterDelete(adminPage, adminPageSize, totalAdmins, 1)
      // 如果页码发生变化，更新页码状态
      if (newPage !== adminPage) {
        setAdminPage(newPage)
      }
      // 使查询失效，触发重新获取数据
      queryClient.invalidateQueries({ queryKey: ['platformAdmins'] })
    },
    onError: () => {
      // message.error("撤销失败");
    },
  })
  const handleRevoke = (userId: number) => {
    revokeMutation.mutate(userId)
  }
  const handleAdd = () => {
    setIsAddModalVisible(true)
  }
  const handleAddCancel = () => {
    setIsAddModalVisible(false)
  }
  const handleAdminPageChange = (page: number, pageSize?: number) => {
    setAdminPage(page)
    if (pageSize) {
      setAdminPageSize(pageSize)
    }
    queryClient.invalidateQueries({
      queryKey: ['platformAdmins', adminSearchText, page, pageSize || adminPageSize],
    })
  }
  const columns: ColumnsType<PlatformAdminUser> = [
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
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: '加入时间',
      dataIndex: 'joinTime',
      key: 'joinTime',
      render: (joinTime: string | null) => {
        if (!joinTime)
          return '-'
        return dayjs(joinTime).format('YYYY-MM-DD HH:mm:ss')
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_: unknown, record: PlatformAdminUser) => (
        <Popconfirm title="确定要删除这个成员吗？" description="删除后将无法恢复。" onConfirm={() => handleRevoke(record.userId)} okText="确定" cancelText="取消">
          <Button type="link" icon={<DeleteOutlined />} danger size="small">
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ]
  return (
    <div className="platform-management-container lab-list-page-shell">
      <Row justify="space-between" align="middle" className="mb-6">
        <Col>
          <Title level={2} className="m-0">
            平台管理员
            <span className="text-[14px] font-normal ml-2 text-[var(--lab-color-text-muted)]">
              共
              {totalAdmins}
              名成员
            </span>
          </Title>
        </Col>
        <Col>
          <Space>
            <Input.Search
              className="w-[200px]"
              placeholder="搜索账号"
              value={adminSearchText}
              onChange={(e) => {
                const value = e.target.value
                setAdminSearchText(value)
                if (value === '') {
                  setAdminPage(1) // 清除搜索时重置到第一页
                }
              }}
              onSearch={(value) => {
                setAdminSearchText(value)
                setAdminPage(1) // 搜索时重置到第一页
              }}
              allowClear
              enterButton
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              添加成员
            </Button>
          </Space>
        </Col>
      </Row>

      <Table
        columns={columns}
        dataSource={Array.isArray(platformAdmins) ? platformAdmins : []}
        rowKey="id"
        loading={isLoading}
        pagination={{
          current: adminPage,
          pageSize: adminPageSize,
          total: totalAdmins,
          onChange: handleAdminPageChange,
          onShowSizeChange: handleAdminPageChange,
          showSizeChanger: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} / ${total} 条`,
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
      />

      {/* 添加平台管理员弹窗 */}
      <AddPlatformAdminModal open={isAddModalVisible} onCancel={handleAddCancel} onSuccess={handleAddCancel} />
    </div>
  )
}
export default PlatformManagement
