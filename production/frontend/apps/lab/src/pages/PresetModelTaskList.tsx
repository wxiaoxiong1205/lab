import React, { useEffect, useState } from 'react'
import { Button, Card, Col, Modal, Popconfirm, Progress, Row, Space, Table, Tag, Typography, message } from 'antd'
import { CheckCircleOutlined, ClockCircleOutlined, DeleteOutlined, PlayCircleOutlined, RocketOutlined, StopOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import type { ColumnsType } from 'antd/es/table'
import type { PresetModelTask, PresetModelTemplate } from '../mock/mockPresetModelService'
import { PresetTaskStatus, mockPresetModelService } from '../mock/mockPresetModelService'
import TaskCreateModal from '../components/preset-model/TaskCreateModal'

const { Title, Text } = Typography
// 状态颜色映射
const STATUS_COLORS = {
  [PresetTaskStatus.DRAFT]: 'default',
  [PresetTaskStatus.ACTIVE]: 'success',
  [PresetTaskStatus.ARCHIVED]: 'default',
}
// 状态文本映射
const STATUS_TEXT = {
  [PresetTaskStatus.DRAFT]: '草稿',
  [PresetTaskStatus.ACTIVE]: '活跃',
  [PresetTaskStatus.ARCHIVED]: '已归档',
}
// 状态图标映射
const STATUS_ICONS = {
  [PresetTaskStatus.DRAFT]: <ClockCircleOutlined />,
  [PresetTaskStatus.ACTIVE]: <CheckCircleOutlined />,
  [PresetTaskStatus.ARCHIVED]: <StopOutlined />,
}
// 任务详情模态框组件
const TaskDetailModal: React.FC<{
  task: PresetModelTask | null
  visible: boolean
  onClose: () => void
}> = ({ task, visible, onClose }) => {
  if (!task)
    return null
  return (
    <Modal
      title={`任务详情 - ${task.name}`}
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>关闭</Button>,
        task.result && (
          <Button key="result" type="primary" onClick={() => window.open(`/preset-model/results/${task.id}`)}>
            查看结果
          </Button>
        ),
      ]}
      width={800}
    >
      <div className="max-h-[500px] overflow-y-auto">
        <Row gutter={16}>
          <Col span={12}>
            <Card title="基本信息" size="small">
              <p>
                <strong>任务ID:</strong>
                {' '}
                {task.id}
              </p>
              <p>
                <strong>任务名称:</strong>
                {' '}
                {task.name}
              </p>
              <p>
                <strong>描述:</strong>
                {' '}
                {task.description}
              </p>
              <p>
                <strong>模板:</strong>
                {' '}
                {task.templateName}
              </p>
              <p>
                <strong>状态:</strong>
                <Tag icon={STATUS_ICONS[task.status]} color={STATUS_COLORS[task.status]} className="ml-2">
                  {STATUS_TEXT[task.status]}
                </Tag>
              </p>
              <p>
                <strong>进度:</strong>
                <Progress className="ml-[8px] w-[100px] inline-block" percent={task.progress} size="small" />
              </p>
            </Card>
          </Col>
          <Col span={12}>
            <Card title="配置信息" size="small">
              <p>
                <strong>模式:</strong>
                {' '}
                {task.config.mode === 'simple' ? '简单模式' : '专家模式'}
              </p>
              <p>
                <strong>模型:</strong>
                {' '}
                {task.config.model}
              </p>
              <p>
                <strong>数据集:</strong>
                {' '}
                {task.datasetName}
              </p>
              <p>
                <strong>GPU资源:</strong>
                {' '}
                {task.config.resourceRequirements.gpu}
              </p>
              <p>
                <strong>内存:</strong>
                {' '}
                {task.config.resourceRequirements.memory}
              </p>
              <p>
                <strong>存储:</strong>
                {' '}
                {task.config.resourceRequirements.storage}
              </p>
            </Card>
          </Col>
        </Row>

        <Card title="时间信息" size="small" className="mt-4">
          <Row gutter={16}>
            <Col span={8}>
              <p>
                <strong>创建时间:</strong>
                <br />
                {new Date(task.createdAt).toLocaleString()}
              </p>
            </Col>
            <Col span={8}>
              {task.startedAt && (
                <p>
                  <strong>开始时间:</strong>
                  <br />
                  {new Date(task.startedAt).toLocaleString()}
                </p>
              )}
            </Col>
            <Col span={8}>
              {task.finishedAt && (
                <p>
                  <strong>完成时间:</strong>
                  <br />
                  {new Date(task.finishedAt).toLocaleString()}
                </p>
              )}
            </Col>
          </Row>
        </Card>

        {task.logs.length > 0 && (
          <Card title="执行日志" size="small" className="mt-4">
            <div className="max-h-[200px] overflow-y-auto bg-[var(--lab-color-surface-page)] p-2 rounded-[4px]">
              {task.logs.map((log, index) => (
                <div className="font-mono text-[12px] mb-[4px]" key={index}>
                  {log}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </Modal>
  )
}
// 主组件Props
interface PresetModelTaskListProps {
  activeSecondaryTab?: string
}
// 主组件
const PresetModelTaskList: React.FC<PresetModelTaskListProps> = ({ activeSecondaryTab = 'computer_vision' }) => {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<PresetModelTask[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedTask, setSelectedTask] = useState<PresetModelTask | null>(null)
  const [detailVisible, setDetailVisible] = useState(false)
  const [operationLoading, setOperationLoading] = useState<string | null>(null)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<PresetModelTemplate | null>(null)
  // 根据二级tab过滤任务类型
  const getTaskTypeByTab = (tab: string) => {
    const tabTaskTypeMap: Record<string, string[]> = {
      computer_vision: ['图像分类', '物体检测', '图像分割'],
      machine_learning: ['表格数据', '结构化数据'],
      finance: ['金融风控', '信用评估'],
      medical: ['医疗影像', '疾病诊断'],
    }
    return tabTaskTypeMap[tab] || []
  }
  // 加载任务列表
  const loadTasks = async () => {
    setLoading(true)
    try {
      const response = await mockPresetModelService.getTasks({
        projectId: 'project_1', // 当前项目ID
      })
      // 根据当前选择的二级tab过滤任务
      const taskTypes = getTaskTypeByTab(activeSecondaryTab)
      const filteredTasks = response.data.filter((task: PresetModelTask) => taskTypes.length === 0 || taskTypes.some((type) => task.templateName.includes(type) || task.name.includes(type)))
      setTasks(filteredTasks)
    }
    catch {
      message.error('加载任务列表失败')
    }
    finally {
      setLoading(false)
    }
  }
  // 当tab切换时重新加载
  useEffect(() => {
    loadTasks()
  }, [activeSecondaryTab])
  // 启动任务
  const handleStartTask = async (taskId: string) => {
    setOperationLoading(taskId)
    try {
      await mockPresetModelService.startTask(taskId)
      await loadTasks()
    }
    catch {
      message.error('启动任务失败')
    }
    finally {
      setOperationLoading(null)
    }
  }
  // 取消任务
  const handleCancelTask = async (taskId: string) => {
    setOperationLoading(taskId)
    try {
      await mockPresetModelService.cancelTask(taskId)
      await loadTasks()
    }
    catch {
      message.error('取消任务失败')
    }
    finally {
      setOperationLoading(null)
    }
  }
  // 重新运行任务
  const handleRetryTask = async (taskId: string) => {
    setOperationLoading(taskId)
    try {
      await mockPresetModelService.retryTask(taskId)
      await loadTasks()
    }
    catch {
      message.error('重新运行任务失败')
    }
    finally {
      setOperationLoading(null)
    }
  }
  // 删除任务
  const handleDeleteTask = async (taskId: string) => {
    setOperationLoading(taskId)
    try {
      await mockPresetModelService.deleteTask(taskId)
      await loadTasks()
    }
    catch {
      message.error('删除任务失败')
    }
    finally {
      setOperationLoading(null)
    }
  }
  // 查看任务详情
  const handleViewDetail = (task: PresetModelTask) => {
    setSelectedTask(task)
    setDetailVisible(true)
  }
  // 查看结果
  const handleViewResult = (taskId: string) => {
    navigate(`/preset-model/results/${taskId}`)
  }
  // 创建新任务 - 基于特定模板
  const handleCreateTaskWithTemplate = async (templateId: string) => {
    try {
      const response = await mockPresetModelService.getTemplate(templateId)
      setSelectedTemplate(response.data)
      setCreateModalVisible(true)
    }
    catch {
      message.error('加载模板信息失败')
    }
  }
  // 处理任务创建成功
  const handleTaskCreateSuccess = (taskId: string) => {
    message.success('任务创建成功！')
    loadTasks() // 重新加载任务列表
    navigate(`/preset-model/results/${taskId}`)
  }
  // 打开创建任务模态框（不依赖特定模板）
  const handleCreateTask = () => {
    setSelectedTemplate(null)
    setCreateModalVisible(true)
  }
  // 创建新的运行实例
  const handleCreateRun = (task: PresetModelTask) => {
    // 跳转到运行创建页面或打开运行创建模态框
    navigate(`/preset-model/task/${task.id}/create-run`)
  }
  // 表格列定义
  const columns: ColumnsType<PresetModelTask> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      ellipsis: true,
      render: (text, record) => (
        <div>
          <Text strong className="cursor-pointer text-[var(--lab-color-brand-primary)]" onClick={() => handleViewDetail(record)} title="点击查看任务详情">
            {text}
          </Text>
          <br />
          <Text type="secondary" className="text-[12px]">
            {record.templateName}
          </Text>
        </div>
      ),
    },
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 120,
      ellipsis: true,
      render: (text) => (
        <Text code className="text-[12px]">
          {text.slice(-6)}
        </Text>
      ),
    },
    {
      title: '类型',
      key: 'type',
      width: 120,
      render: (_, record) => {
        // 根据模板名称判断类型
        const getTypeFromTemplate = (templateName: string) => {
          if (templateName.includes('图像') || templateName.includes('视觉')) {
            return { text: '图像分类', color: 'blue' }
          }
          else if (templateName.includes('文本') || templateName.includes('情感')) {
            return { text: '文本分析', color: 'green' }
          }
          else if (templateName.includes('预测') || templateName.includes('流失')) {
            return { text: '数据挖掘', color: 'orange' }
          }
          return { text: '通用模型', color: 'default' }
        }
        const type = getTypeFromTemplate(record.templateName)
        return (
          <Tag color={type.color}>
            {type.text}
          </Tag>
        )
      },
    },
    {
      title: '任务数量',
      key: 'runStats',
      width: 120,
      render: (_, record) => (
        <div>
          <Text strong>{record.runs.total}</Text>
          <br />
          <Text type="secondary" className="text-[12px]">
            完成:
            {' '}
            {record.runs.completed}
            {' '}
            | 失败:
            {' '}
            {record.runs.failed}
          </Text>
        </div>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (time) => {
        const date = new Date(time)
        return (
          <div>
            <div>{date.toLocaleDateString()}</div>
            <Text type="secondary" className="text-[12px]">
              {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </div>
        )
      },
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 200,
      ellipsis: true,
      render: (text) => (
        <Text className="text-[13px]" title={text}>
          {text || '暂无描述'}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      fixed: 'right',
      render: (_, record) => {
        const isLoading = operationLoading === record.id
        return (
          <Space>
            <Button size="small" type="primary" icon={<PlayCircleOutlined />} loading={isLoading} onClick={() => handleCreateRun(record)}>
              新建运行
            </Button>

            <Popconfirm title="确定要删除这个任务吗？" description="删除后将无法恢复，相关的运行记录也会被删除。" onConfirm={() => handleDeleteTask(record.id)} okText="确定" cancelText="取消">
              <Button size="small" danger icon={<DeleteOutlined />} loading={isLoading}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        )
      },
    },
  ]
  // 获取当前tab对应的标题
  const getTabTitle = (tab: string) => {
    const tabTitleMap: Record<string, string> = {
      computer_vision: '计算机视觉模型任务',
      machine_learning: '机器学习模型任务',
      finance: '金融行业模型任务',
      medical: '医疗行业模型任务',
    }
    return tabTitleMap[tab] || '预置模型调参任务'
  }
  return (
    <div className="p-3 h-full flex flex-col">
      <div className="mb-3">
        <div className="flex justify-between items-center">
          <Title level={4} className="m-0">
            <RocketOutlined />
            {' '}
            {getTabTitle(activeSecondaryTab)}
          </Title>
          <Button type="primary" size="small" icon={<RocketOutlined />} onClick={handleCreateTask}>
            创建任务
          </Button>
        </div>
      </div>

      {/* 任务表格 */}
      <Card className="flex-1 overflow-hidden flex flex-col" bodyStyle={{ padding: '16px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Table
          columns={columns}
          dataSource={tasks}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1200, y: 'calc(100vh - 400px)' }}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
            size: 'small',
          }}
        />
      </Card>

      {/* 任务详情模态框 */}
      <TaskDetailModal
        task={selectedTask}
        visible={detailVisible}
        onClose={() => {
          setDetailVisible(false)
          setSelectedTask(null)
        }}
      />

      {/* 任务创建模态框 */}
      <TaskCreateModal
        visible={createModalVisible}
        onClose={() => {
          setCreateModalVisible(false)
          setSelectedTemplate(null)
        }}
        onSuccess={handleTaskCreateSuccess}
        initialTemplate={selectedTemplate || undefined}
      />
    </div>
  )
}
export default PresetModelTaskList
