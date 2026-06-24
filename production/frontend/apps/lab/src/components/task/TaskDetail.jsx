import React, { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Collapse,
  Descriptions,
  Divider,
  Dropdown,
  List,
  Menu,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import {
  getTaskById,
  getTaskLogs,
  retryErrorTask,
  updateTaskStatus,
} from '../../services/taskService'
import { datasetLogApi } from '../../services/api'
import { TruncatedOutput } from '../common/TruncatedOutput'

dayjs.extend(relativeTime)

const { Title, Text } = Typography
const { TabPane } = Tabs

const TaskDetail = ({ taskId, projectId = null }) => {
  const [task, setTask] = useState(null)
  const [logs, setLogs] = useState([])
  const [errorDatasets, setErrorDatasets] = useState([])
  const [loading, setLoading] = useState(true)
  const [logsLoading, setLogsLoading] = useState(false)
  const [errorDatasetsLoading, setErrorDatasetsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [logTotal, setLogTotal] = useState(0)
  const [logPage, setLogPage] = useState(1)
  const [logPageSize, setLogPageSize] = useState(50)
  const [errorDatasetTotal, setErrorDatasetTotal] = useState(0)
  const [errorDatasetPage, setErrorDatasetPage] = useState(1)
  const [errorDatasetPageSize, setErrorDatasetPageSize] = useState(10)
  const [errorDetailVisible, setErrorDetailVisible] = useState(false)
  const [selectedErrorDataset, setSelectedErrorDataset] = useState(null)
  const [fixingErrorDatasets, setFixingErrorDatasets] = useState(false)
  const [fixErrorResult, setFixErrorResult] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(() => {
    const savedSetting = localStorage.getItem('taskDetailAutoRefresh')
    return savedSetting !== null ? savedSetting === 'true' : true
  })
  const refreshTimerRef = useRef(null)
  const logsContainerRef = useRef(null)
  const scrollPositionRef = useRef(null)
  const [logTabKey, setLogTabKey] = useState('logs')
  const [resultLogs, setResultLogs] = useState([])
  const [resultLogsLoading, setResultLogsLoading] = useState(false)
  const [resultLogsTotal, setResultLogsTotal] = useState(0)
  const [resultLogsPage, setResultLogsPage] = useState(1)
  const [resultLogsPageSize, setResultLogsPageSize] = useState(10)
  const [resultStatusFilter, setResultStatusFilter] = useState(null)

  // Save auto-refresh setting to localStorage when changed
  useEffect(() => {
    localStorage.setItem('taskDetailAutoRefresh', autoRefreshEnabled)
  }, [autoRefreshEnabled])

  // Helper function to generate links with project context
  const getProjectLink = (path) => {
    return projectId ? `/project/${projectId}${path}` : path
  }

  const fetchTask = async () => {
    try {
      const taskData = await getTaskById(projectId, taskId)
      setTask(taskData)
      setError(null)
      setLastRefreshed(new Date())
    }
    catch (error) {
      console.error('Error fetching task:', error)
      setError('Failed to load task details')
    }
    finally {
      setLoading(false)
    }
  }

  const fetchLogs = async () => {
    if (!taskId) return

    // Save current scroll position before updating
    if (logsContainerRef.current) {
      scrollPositionRef.current = {
        scrollTop: logsContainerRef.current.scrollTop,
        scrollHeight: logsContainerRef.current.scrollHeight,
      }
    }

    setLogsLoading(true)
    try {
      const logsData = await getTaskLogs(projectId, taskId, {
        start: (logPage - 1) * logPageSize,
        limit: logPageSize,
      })
      setLogs(logsData.logs)
      setLogTotal(logsData.total)
      setError(null)
      setLastRefreshed(new Date())

      // We'll restore scroll position after the DOM updates in a useEffect
    }
    catch (error) {
      console.error('Error fetching task logs:', error)
      setError('Failed to load task logs')
    }
    finally {
      setLogsLoading(false)
    }
  }

  useEffect(() => {
    if (taskId) {
      fetchTask()
    }

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [taskId])

  // Restore scroll position after logs update
  useEffect(() => {
    if (logsContainerRef.current && scrollPositionRef.current) {
      const newScrollTop
        = logsContainerRef.current.scrollHeight
          - scrollPositionRef.current.scrollHeight
          + scrollPositionRef.current.scrollTop

      // Only maintain scroll position if user had scrolled
      logsContainerRef.current.scrollTop = newScrollTop
    }
  }, [logs])

  useEffect(() => {
    fetchLogs()

    // 清除已有定时器
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current)
      refreshTimerRef.current = null
    }

    // 仅在 RUNNING 且开启自动刷新时轮询
    if (autoRefreshEnabled && task && task.status === 'RUNNING') {
      refreshTimerRef.current = setInterval(() => {
        fetchTask()
        fetchLogs()
      }, 5000)
    }

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [
    task?.status,
    taskId,
    logPage,
    logPageSize,
    errorDatasetPage,
    errorDatasetPageSize,
    autoRefreshEnabled,
  ])

  const handleStatusChange = async (action) => {
    try {
      await updateTaskStatus(projectId, taskId, {
        action,
      })
      fetchTask()
    }
    catch (error) {
      console.error(`Error ${action} task:`, error)
      setError(`Failed to ${action} task`)
    }
  }

  const handleRetry = async () => {
    if (!task) return
    try {
      await retryErrorTask(task.project_id, task.id)
      fetchTask()
    }
    catch (e) {
      // 可选：message.error('重试失败')
      console.error(e)
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

  const getLogTypeIcon = (type) => {
    switch (type) {
      case 'info':
        return <InfoCircleOutlined className="text-[var(--lab-color-brand-primary)]" />
      case 'success':
        return <CheckCircleOutlined className="text-[var(--lab-color-success)]" />
      case 'warning':
        return <ExclamationCircleOutlined style={{ color: '#faad14' }} />
      case 'error':
        return <ExclamationCircleOutlined className="text-[var(--lab-color-danger)]" />
      default:
        return <ClockCircleOutlined className="text-[var(--lab-color-brand-primary)]" />
    }
  }

  const getActionButtons = () => {
    if (!task) return null
    const buttons = []
    switch (task.status) {
      case 'CREATED':
        buttons.push(
          <Button
            key="start"
            size="small"
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => handleStatusChange('start')}
          >
            启动
          </Button>,
        )
        break
      case 'PENDING':
        buttons.push(
          <Button
            key="cancel"
            size="small"
            danger
            icon={<StopOutlined />}
            onClick={() => handleStatusChange('cancel')}
          >
            取消
          </Button>,
        )
        break
      case 'RUNNING':
        buttons.push(
          <Button
            key="cancel"
            size="small"
            danger
            icon={<StopOutlined />}
            onClick={() => handleStatusChange('cancel')}
          >
            取消
          </Button>,
        )
        break
      case 'FAILED':
        buttons.push(
          <Button
            key="retry"
            size="small"
            danger
            icon={<StopOutlined />}
            onClick={handleRetry}
          >
            重试
          </Button>,
        )
        break
      default:
        break
    }
    return buttons.length > 0 ? <Space>{buttons}</Space> : null
  }

  const renderTaskTypeInfo = () => {
    if (!task) return null

    switch (task.task_type) {
      case 'answer-generation':
        return (
          <>
            <Descriptions.Item label="Prompt">
              {task.prompt_messages ? (
                <Collapse ghost>
                  <Collapse.Panel
                    header=""
                    key="1"
                  >
                    <div className="max-h-[200px] overflow-auto">
                      {task.prompt_messages.messages ? (
                        <div className="bg-gray-50 p-2 rounded mb-2">
                          {task.prompt_messages.messages.map((msg, idx) => (
                            <div key={idx} className="mb-2 border-b pb-2">
                              <Tag
                                color={msg.role === 'system' ? 'blue' : 'green'}
                              >
                                {msg.role}
                              </Tag>
                              <div className="whitespace-pre-wrap mt-1">
                                {msg.content}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Text type="secondary">
                          No prompt messages available
                        </Text>
                      )}
                      {task.prompt_messages.input_variables
                      && task.prompt_messages.input_variables.length > 0 && (
                        <div className="mt-2">
                          <Text strong>Input Variables: </Text>
                          {task.prompt_messages.input_variables.map(
                            (variable) => (
                              <Tag key={variable}>{variable}</Tag>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  </Collapse.Panel>
                </Collapse>
              ) : (
                <Text type="secondary">No prompt information available</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="LLM Config">
              {task.llm_config_content ? (
                <Collapse ghost>
                  <Collapse.Panel
                    header={`Model: ${task.llm_config_content.model}`}
                    key="1"
                  >
                    <div className="max-h-[200px] overflow-auto">
                      <Descriptions column={1} size="small" bordered>
                        <Descriptions.Item label="Name">
                          {task.llm_config_content.name}
                        </Descriptions.Item>
                        <Descriptions.Item label="Temperature">
                          {task.llm_config_content.temperature}
                        </Descriptions.Item>
                        <Descriptions.Item label="Max Tokens">
                          {task.llm_config_content.max_tokens}
                        </Descriptions.Item>
                        <Descriptions.Item label="Frequency Penalty">
                          {task.llm_config_content.frequency_penalty}
                        </Descriptions.Item>
                        <Descriptions.Item label="Presence Penalty">
                          {task.llm_config_content.presence_penalty}
                        </Descriptions.Item>
                        <Descriptions.Item label="Top P">
                          {task.llm_config_content.top_p}
                        </Descriptions.Item>
                        {task.llm_config_content.additional_params
                        && Object.keys(task.llm_config_content.additional_params)
                          .length > 0 && (
                          <Descriptions.Item label="Additional Parameters">
                            <pre className="bg-gray-50 p-2 rounded-lg max-h-[100px] overflow-auto text-xs">
                              {JSON.stringify(
                                task.llm_config_content.additional_params,
                                null,
                                2,
                              )}
                            </pre>
                          </Descriptions.Item>
                        )}
                      </Descriptions>
                    </div>
                  </Collapse.Panel>
                </Collapse>
              ) : (
                <Text type="secondary">
                  No LLM config information available
                </Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Variable Mappings">
              {task.variable_mappings ? (
                <div className="max-h-[150px] overflow-auto">
                  <Descriptions column={1} size="small">
                    {Object.entries(task.variable_mappings).map(
                      ([key, value]) => (
                        <Descriptions.Item key={key} label={key}>
                          {value}
                        </Descriptions.Item>
                      ),
                    )}
                  </Descriptions>
                </div>
              ) : (
                <Text type="secondary">No variable mappings</Text>
              )}
            </Descriptions.Item>
          </>
        )
      case 'dataset-output-clean':
        return (
          <Descriptions.Item label="Task Type" span={2}>
            <Tag color="cyan">Dataset Output Clean</Tag>
            <Text type="secondary" className="ml-2">
              This task clears the output field for all selected datasets.
            </Text>
          </Descriptions.Item>
        )
      default:
        return null
    }
  }

  // 获取结果列表
  const fetchResultLogs = async () => {
    if (!task) return
    setResultLogsLoading(true)
    try {
      const params = {
        task_id: task.id,
        page: resultLogsPage,
        size: resultLogsPageSize,
      }
      if (resultStatusFilter) params.success = resultStatusFilter === 'SUCCESS'
      const res = await datasetLogApi.listByProject(projectId, params)
      setResultLogs(res.items || [])
      setResultLogsTotal(res.total || 0)
    }
    catch (e) {
      // 可选: message.error('获取结果列表失败')
    }
    finally {
      setResultLogsLoading(false)
    }
  }

  useEffect(() => {
    if (logTabKey === 'results' && task) {
      fetchResultLogs()
    }
    // eslint-disable-next-line
  }, [
    logTabKey,
    task?.id,
    resultLogsPage,
    resultLogsPageSize,
    resultStatusFilter,
  ])

  // 结果列表表格列
  const resultColumns = [
    { title: '问题', dataIndex: 'question', key: 'question', ellipsis: true },
    {
      title: '输出',
      dataIndex: 'output',
      key: 'output',
      width: 300,
      ellipsis: { showTitle: false },
      render: (output) => (
        <TruncatedOutput
          content={output}
          onCopy={(text) => {
            if (navigator.clipboard) {
              navigator.clipboard.writeText(text)
            }
            else {
              // fallback
              const textarea = document.createElement('textarea')
              textarea.value = text
              document.body.appendChild(textarea)
              textarea.select()
              document.execCommand('copy')
              document.body.removeChild(textarea)
            }
          }}
        />
      ),
    },
    {
      title: '状态',
      dataIndex: 'success',
      key: 'success',
      width: 80,
      render: (success) =>
        success ? <Tag color="green">成功</Tag> : <Tag color="red">失败</Tag>,
    },
    {
      title: '执行时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date) => dayjs(date).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '耗时(ms)',
      dataIndex: 'execution_time_ms',
      key: 'execution_time_ms',
      width: 100,
    },
  ]

  if (loading) {
    return <Spin tip="Loading task details..." />
  }

  if (error) {
    return <Alert message="Error" description={error} type="error" showIcon />
  }

  if (!task) {
    return <Alert message="Task not found" type="warning" showIcon />
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-4">
        <Title level={4} className="!mb-0">
          {task.name}
        </Title>
        <Space>
          {lastRefreshed && (
            <Text type="secondary" className="text-sm">
              上次刷新:
              {' '}
              {dayjs(lastRefreshed).format('HH:mm:ss')}
              {autoRefreshEnabled ? ' (每5秒自动刷新)' : ''}
            </Text>
          )}
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              fetchTask()
              fetchLogs()
            }}
            loading={loading}
            size="small"
          >
            刷新
          </Button>
          <Switch
            checkedChildren="自动刷新"
            unCheckedChildren="自动刷新"
            checked={autoRefreshEnabled}
            onChange={(checked) => setAutoRefreshEnabled(checked)}
          />
          {getActionButtons()}
        </Space>
      </div>
      <div className="grid grid-cols-4 gap-4 mt-4">
        <Card className="shadow-sm">
          <Statistic
            title="数据集总数"
            value={task.total_count}
            suffix={`/ ${task.total_count}`}
          />
        </Card>
        <Card className="shadow-sm">
          <Statistic
            title="已处理"
            value={task.processed_count}
            suffix={`/ ${task.total_count}`}
          />
        </Card>
        <Card className="shadow-sm">
          <Statistic
            title="成功"
            value={task.successful_count}
            valueStyle={{ color: '#3f8600' }}
          />
        </Card>
        <Card className="shadow-sm">
          <Statistic
            title="失败"
            value={task.failed_count}
            valueStyle={{ color: '#cf1322' }}
          />
        </Card>
      </div>

      <Descriptions
        bordered
        className="bg-white rounded-lg !px-0 !pt-0"
        column={3}
      >
        <Descriptions.Item label="ID">{task.id}</Descriptions.Item>
        <Descriptions.Item label="状态">
          <Tag color={getStatusColor(task.status)}>
            {(() => {
              const statusMap = {
                CREATED: '已创建',
                PENDING: '等待中',
                RUNNING: '运行中',
                SUCCESS: '成功',
                FAILED: '失败',
                CANCELLED: '已取消',
              }
              return statusMap[task.status] || task.status
            })()}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="开始时间">
          {task.started_at
            ? dayjs(task.started_at).format('YYYY-MM-DD HH:mm:ss')
            : '未开始'}
        </Descriptions.Item>
        <Descriptions.Item label="完成时间">
          {task.finished_at
            ? dayjs(task.finished_at).format('YYYY-MM-DD HH:mm:ss')
            : '未完成'}
        </Descriptions.Item>
      </Descriptions>
      <Descriptions
        bordered
        className="bg-white rounded-lg !px-0 !pt-0"
        column={1}
      >
        {renderTaskTypeInfo()}
      </Descriptions>

      <Tabs
        activeKey={logTabKey}
        onChange={setLogTabKey}
        defaultActiveKey="logs"
        className="bg-white rounded-lg !px-4"
        items={[
          {
            key: 'logs',
            label: '日志',
            children: (
              <>
                <div
                  ref={logsContainerRef}
                  className="h-[500px] overflow-y-auto p-4 border border-gray-200 rounded-lg mb-4"
                >
                  {logsLoading ? (
                    <div className="flex justify-center items-center h-full">
                      <Spin />
                    </div>
                  ) : (
                    <Timeline>
                      {logs.map((log, index) => (
                        <Timeline.Item
                          key={index}
                          color={
                            log.type === 'ERROR'
                              ? 'red'
                              : log.type === 'WARNING'
                                ? 'orange'
                                : 'blue'
                          }
                          dot={getLogTypeIcon(log.type)}
                        >
                          <p className="mb-2">
                            <Text type="secondary">{log.timestamp}</Text>
                            <Text strong className="ml-2">
                              {log.type}
                            </Text>
                            <Text className="ml-2">{log.message}</Text>
                          </p>
                          {log.details && (
                            <div className="bg-gray-50 p-2 rounded-lg mt-2">
                              <pre className="m-0 text-sm">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                            </div>
                          )}
                        </Timeline.Item>
                      ))}
                    </Timeline>
                  )}
                </div>

                {logTotal > logPageSize && (
                  <div className="flex justify-end my-4 space-x-2">
                    <Button
                      disabled={logPage === 1}
                      onClick={() => setLogPage(logPage - 1)}
                    >
                      上一页
                    </Button>
                    <Button
                      disabled={logPage * logPageSize >= logTotal}
                      onClick={() => setLogPage(logPage + 1)}
                    >
                      下一页
                    </Button>
                  </div>
                )}
              </>
            ),
          },
          {
            key: 'results',
            label: '结果列表',
            children: (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <Select
                      value={resultStatusFilter}
                      onChange={setResultStatusFilter}
                      allowClear
                      className="w-[120px]"
                      placeholder="按状态过滤"
                      size="small"
                    >
                      <Select.Option value={null}>全部</Select.Option>
                      <Select.Option value="SUCCESS">成功</Select.Option>
                      <Select.Option value="FAILED">失败</Select.Option>
                    </Select>
                  </div>
                </div>
                <Table
                  columns={resultColumns}
                  dataSource={resultLogs}
                  rowKey="id"
                  loading={resultLogsLoading}
                  pagination={{
                    current: resultLogsPage,
                    pageSize: resultLogsPageSize,
                    total: resultLogsTotal,
                    showSizeChanger: true,
                    onChange: (page, pageSize) => {
                      setResultLogsPage(page)
                      setResultLogsPageSize(pageSize)
                    },
                  }}
                  size="small"
                />
              </>
            ),
          },
        ]}
      />
    </div>
  )
}

export default TaskDetail
