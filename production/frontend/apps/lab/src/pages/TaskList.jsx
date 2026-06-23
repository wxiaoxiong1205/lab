import React, { useEffect, useState } from 'react'
import { Badge, Button, Card, Col, Input, Modal, Pagination, Progress, Row, Select, Space, Statistic, Table, Tag, Tooltip, Typography, message } from 'antd'
import { BarChartOutlined, BugOutlined, DeleteOutlined, EditOutlined, EyeOutlined, PauseCircleOutlined, PlayCircleOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Link, useParams } from 'react-router-dom'
import useI18n from '../hooks/useI18n'
import { deleteTask, getTasks, updateTaskStatus } from '../services/taskService'
import { useProjectStore } from '../stores/projectStore'

dayjs.extend(relativeTime)
const { Option } = Select
const { Search } = Input
const { Title } = Typography
const TaskList = ({ projectId = null }) => {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [statusFilter, setStatusFilter] = useState(null)
  const [searchText, setSearchText] = useState('')
  const navigate = useNavigate()
  const { t } = useI18n()
  // Helper function to generate task detail URL with project context
  const getTaskDetailUrl = (taskId) => {
    return projectId
      ? `/project/${projectId}/tasks/${taskId}`
      : `/tasks/${taskId}`
  }
  const fetchTasks = async () => {
    setLoading(true)
    try {
      const params = {
        page: currentPage,
        size: pageSize,
      }
      if (statusFilter)
        params.status = statusFilter
      const response = await getTasks(projectId, params)
      setTasks(response.items)
      setTotal(response.total)
    }
    catch (error) {
      console.error('Error fetching tasks:', error)
    }
    finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    fetchTasks()
  }, [projectId, currentPage, pageSize, statusFilter])
  const handleStatusChange = async (taskId, action) => {
    try {
      await updateTaskStatus(projectId, taskId, {
        action,
      })
      fetchTasks()
      message.success(`Task ${action} successfully`)
    }
    catch (error) {
      console.error(`Error ${action} task:`, error)
      message.error(`Failed to ${action} task`)
    }
  }
  const handleDelete = async (taskId, status) => {
    try {
      await deleteTask(projectId, taskId)
      fetchTasks()
      message.success(t('task.deleteSuccess'))
    }
    catch (error) {
      console.error('Error deleting task:', error)
      message.error(t('task.deleteError'))
    }
  }
  const getStatusColor = (status) => {
    const statusColors = {
      CREATED: 'blue',
      PENDING: 'purple',
      RUNNING: 'green',
      SUCCESS: 'cyan',
      FAILED: 'red',
      CANCELLED: 'gray',
    }
    return statusColors[status] || 'default'
  }
  const renderStatusActions = (task) => {
    const { id, status } = task
    const buttons = []
    switch (status) {
      case 'CREATED':
        buttons.push(
          <Button key="start" size="small" type="primary" icon={<PlayCircleOutlined />} onClick={() => handleStatusChange(id, 'start')}>
            启动
          </Button>,
        )
        break
      case 'PENDING':
        buttons.push(
          <Button key="cancel" size="small" danger icon={<StopOutlined />} onClick={() => handleStatusChange(id, 'cancel')}>
            取消
          </Button>,
        )
        break
      case 'RUNNING':
        buttons.push(
          <Button key="cancel" size="small" danger icon={<StopOutlined />} onClick={() => handleStatusChange(id, 'cancel')}>
            取消
          </Button>,
        )
        break
      case 'FAILED':
        buttons.push(
          <Button key="retry" size="small" danger icon={<StopOutlined />} onClick={() => handleStatusChange(id, 'retry')}>
            重试
          </Button>,
        )
        break
      default:
        buttons.push(
          <Button key="view" size="small" icon={<EyeOutlined />} onClick={() => navigate(getTaskDetailUrl(id))}>
            详情
          </Button>,
        )
        buttons.push(
          <Button
            key="delete"
            icon={<DeleteOutlined />}
            size="small"
            danger
            onClick={() => {
              Modal.confirm({
                title: t('task.deleteConfirm'),
                onOk: () => handleDelete(id, status),
                okText: t('common.confirm'),
                cancelText: t('common.cancel'),
              })
            }}
          >
            删除
          </Button>,
        )
        break
    }
    return <Space>{buttons}</Space>
  }
  const columns = [
    {
      title: t('task.id'),
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: t('task.name'),
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (<a onClick={() => navigate(getTaskDetailUrl(record.id))}>{text}</a>),
    },
    {
      title: t('task.status'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status) => {
        const statusMap = {
          CREATED: '已创建',
          PENDING: '等待中',
          RUNNING: '运行中',
          SUCCESS: '成功',
          FAILED: '失败',
          CANCELLED: '已取消',
        }
        return (
          <Tag color={getStatusColor(status)}>
            {statusMap[status] || status.toUpperCase()}
          </Tag>
        )
      },
    },
    {
      title: t('task.progress'),
      dataIndex: 'progress',
      key: 'progress',
      width: 150,
      render: (progress) => (<Progress percent={Math.round(progress)} size="small" />),
    },
    {
      title: t('task.created'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (date) => (
        <Tooltip title={dayjs(date).format('YYYY-MM-DD HH:mm:ss')}>
          {dayjs(date).fromNow()}
        </Tooltip>
      ),
    },
    {
      title: t('task.datasets'),
      key: 'datasets',
      width: 150,
      render: (_, record) => (
        <span>
          {record.processed_datasets}
          /
          {record.total_datasets}
          {record.failed_datasets > 0 && (
            <Tooltip title={t('task.viewErrorDatasets')}>
              <Typography.Link to={`/tasks/${record.id}/error-datasets`}>
                <Badge count={record.failed_datasets} className="bg-[var(--lab-color-danger)] ml-2 cursor-pointer" />
              </Typography.Link>
            </Tooltip>
          )}
        </span>
      ),
    },
    {
      title: t('task.actions'),
      key: 'actions',
      width: 150,
      render: (_, record) => renderStatusActions(record),
    },
  ]
  return (
    <div>
      <div className="mb-4">
        <Row gutter={16}>
          <Col span={8}>
            <Search className="w-[100%]" placeholder={t('task.search')} value={searchText} onChange={(e) => setSearchText(e.target.value)} onSearch={() => fetchTasks()} />
          </Col>
          <Col span={8}>
            <Select
              placeholder={t('task.filterByStatus')}
              className="w-[200px]"
              allowClear
              onChange={(value) => {
                setStatusFilter(value)
                setCurrentPage(1)
              }}
            >
              <Option value="CREATED">已创建</Option>
              <Option value="PENDING">等待中</Option>
              <Option value="RUNNING">运行中</Option>
              <Option value="SUCCESS">成功</Option>
              <Option value="FAILED">失败</Option>
              <Option value="CANCELLED">已取消</Option>
            </Select>
          </Col>
          <Col span={8} className="text-right">
            <Button type="primary" onClick={() => navigate(`/project/${projectId}/tasks/create`)}>
              {t('task.create')}
            </Button>
            <Button icon={<ReloadOutlined />} onClick={fetchTasks} className="ml-2">
              {t('task.refresh')}
            </Button>
          </Col>
        </Row>
      </div>

      <Table columns={columns} dataSource={tasks} rowKey="id" loading={loading} pagination={false} />

      <div className="mt-4 text-right">
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          showQuickJumper
          showTotal={(total) => `Total ${total} tasks`}
          onChange={(page) => setCurrentPage(page)}
          onShowSizeChange={(current, size) => {
            setCurrentPage(1)
            setPageSize(size)
          }}
        />
      </div>
    </div>
  )
}
const TaskListPage = () => {
  const { projectId } = useParams()
  const { currentProject } = useProjectStore()
  const { t } = useI18n()
  const numericProjectId = projectId
    ? parseInt(projectId, 10)
    : currentProject?.id
  return (
    <div className="p-5">
      <Title level={2}>问答生成</Title>
      <TaskList projectId={numericProjectId} />
    </div>
  )
}
export default TaskListPage
