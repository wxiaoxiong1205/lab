import React, { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, Col, Collapse, Descriptions, Drawer, Form, Input, Layout, Modal, Popconfirm, Row, Select, Space, Table, Tabs, Tag, Tooltip, Typography, message } from 'antd'
import { BulbOutlined, CheckCircleOutlined, CloseCircleOutlined, CopyOutlined, DeleteOutlined, DownOutlined, EyeOutlined, RightOutlined, SearchOutlined, SwapOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import ReactJson from '@microlink/react-json-view'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { useNavigate } from 'react-router-dom'
import { datasetLogApi } from '../../services/api'
import { TruncatedOutput } from '../common/TruncatedOutput'
import './DatasetLogList.css'

dayjs.extend(utc)
const { Text, Title } = Typography
const { Content } = Layout
// ThinkableContent component for processing <think> tags
interface ThinkableContentProps {
  content: string
}
const ThinkableContent: React.FC<ThinkableContentProps> = ({ content }) => {
  const { t } = useTranslation()
  // Process the content to identify think tags
  const parts = useMemo(() => {
    // Handle the case where content starts with thinking text without opening tag
    if (content.trimStart().startsWith('<think>')
      || (!content.includes('<think>') && content.includes('</think>'))) {
      const processedContent = content.includes('<think>')
        ? content
        : `<think>${content}`
      return processContent(processedContent)
    }
    return processContent(content)
  }, [content])
  // State for tracking which thinking sections are expanded
  const [expandedSections, setExpandedSections] = useState<boolean[]>([])
  // Initialize all sections to collapsed
  useEffect(() => {
    const thinkingCount = parts.filter((part) => part.isThinking).length
    setExpandedSections(new Array(thinkingCount).fill(false))
  }, [parts])
  // Process the content to separate thinking and non-thinking parts
  function processContent(text: string) {
    const result = []
    let currentText = text
    let thinkIndex = 0
    // Find all think tags and split the content
    while (currentText.includes('<think>')) {
      const startIndex = currentText.indexOf('<think>')
      if (startIndex > 0) {
        // Add non-thinking content before the tag
        result.push({
          text: currentText.substring(0, startIndex),
          isThinking: false,
        })
      }
      const endIndex = currentText.indexOf('</think>', startIndex)
      if (endIndex === -1) {
        // No closing tag, treat the rest as thinking content
        result.push({
          text: currentText.substring(startIndex + 7),
          isThinking: true,
          index: thinkIndex++,
        })
        currentText = ''
      }
      else {
        // Add thinking content between tags
        result.push({
          text: currentText.substring(startIndex + 7, endIndex),
          isThinking: true,
          index: thinkIndex++,
        })
        currentText = currentText.substring(endIndex + 8)
      }
    }
    // Add any remaining text
    if (currentText) {
      result.push({
        text: currentText,
        isThinking: false,
      })
    }
    return result
  }
  // Toggle all sections expanded/collapsed
  const toggleAllSections = () => {
    const allExpanded = expandedSections.every(Boolean)
    setExpandedSections(expandedSections.map(() => !allExpanded))
  }
  // Toggle a specific section
  const toggleSection = (index: number) => {
    setExpandedSections(expandedSections.map((expanded, i) => i === index ? !expanded : expanded))
  }
  // Count thinking sections
  const thinkingCount = parts.filter((part) => part.isThinking).length
  if (thinkingCount === 0) {
    return (
      <div className="whitespace-pre-wrap break-words">
        {content}
      </div>
    )
  }
  return (
    <div>
      {thinkingCount > 0 && (
        <div className="mb-2">
          <Button size="small" onClick={toggleAllSections} icon={<BulbOutlined />}>
            {expandedSections.every(Boolean)
              ? t('datasetLog.hideThinking')
              : t('datasetLog.showThinking')}
          </Button>
          <Badge count={thinkingCount} size="small" className="ml-[5px] bg-[var(--lab-color-success)]" />
        </div>
      )}

      {parts.map((part, i) => {
        if (!part.isThinking) {
          return (
            <div key={i} className="whitespace-pre-wrap break-words">
              {part.text}
            </div>
          )
        }
        const isExpanded = expandedSections[part.index as number]
        return (
          <div key={i}>
            <div
              className="dataset-log-thinking-toggle cursor-pointer p-[4px_8px] rounded-[4px] flex items-center"
              onClick={() => toggleSection(part.index as number)}
              style={{ marginBottom: isExpanded ? 0 : 8 }}
            >
              {isExpanded ? <DownOutlined /> : <RightOutlined />}
              <span className="ml-2">
                {isExpanded
                  ? t('datasetLog.hideThinking')
                  : t('datasetLog.showThinking')}
              </span>
            </div>

            {isExpanded && (
              <div
                className="dataset-log-thinking-content p-[8px_16px] ml-[16px] mb-[8px] whitespace-pre-wrap"
              >
                {part.text}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
// Function to check if the output contains <think> tags
const hasThinkTags = (output: string) => {
  return output && (output.includes('<think>') || output.includes('</think>'))
}
interface DatasetLogListProps {
  projectId: number
  datasetId?: number
}
const DatasetLogList: React.FC<DatasetLogListProps> = ({ projectId, datasetId }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [filters, setFilters] = useState<any>({})
  const [selectedLog, setSelectedLog] = useState<any>(null)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [logTypeTab, setLogTypeTab] = useState<string>('chat') // 默认显示chat类型日志
  const [form] = Form.useForm()
  const [showCustomDays, setShowCustomDays] = useState(false)
  const fetchLogs = async () => {
    setLoading(true)
    try {
      const response = await datasetLogApi.listByProject(projectId, {
        ...filters,
        log_type: logTypeTab, // 添加log_type筛选
        skip: (currentPage - 1) * pageSize,
        limit: pageSize,
      })
      setLogs(response.items || [])
      setTotal(response.total || 0)
    }
    catch (error) {
      console.error('Failed to fetch logs:', error)
    }
    finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    fetchLogs()
  }, [projectId, datasetId, currentPage, pageSize, filters, logTypeTab]) // 添加logTypeTab依赖
  const handleTableChange = (pagination: any) => {
    setCurrentPage(pagination.current)
    setPageSize(pagination.pageSize)
  }
  const handleSearch = (values: any) => {
    const searchFilters: any = {}
    if (values.question)
      searchFilters.question = values.question
    if (values.status)
      searchFilters.success = values.status === 'success'
    if (values.prompt_id)
      searchFilters.prompt_id = values.prompt_id
    if (values.model_id)
      searchFilters.model_id = values.model_id
    if (values.dataset_id)
      searchFilters.dataset_id = values.dataset_id
    if (values.task_id)
      searchFilters.task_id = values.task_id
    if (values.dateRange) {
      const now = dayjs().utc()
      if (values.dateRange === '1d') {
        searchFilters.created_after = now.startOf('day').toISOString()
        searchFilters.created_before = now.endOf('day').toISOString()
      }
      else if (values.dateRange === '2d') {
        searchFilters.created_after = now
          .subtract(1, 'day')
          .startOf('day')
          .toISOString()
        searchFilters.created_before = now.endOf('day').toISOString()
      }
      else if (values.dateRange === '7d') {
        searchFilters.created_after = now
          .subtract(6, 'day')
          .startOf('day')
          .toISOString()
        searchFilters.created_before = now.endOf('day').toISOString()
      }
      else if (values.dateRange === 'custom' && values.customDays) {
        // 处理自定义天数
        const days = parseInt(values.customDays, 10)
        if (!isNaN(days) && days > 0) {
          if (days === 1) {
            // 如果是1天，等同于今天
            searchFilters.created_after = now.startOf('day').toISOString()
          }
          else {
            // 如果是n天，从今天算起的前n-1天开始
            searchFilters.created_after = now
              .subtract(days - 1, 'day')
              .startOf('day')
              .toISOString()
          }
          searchFilters.created_before = now.endOf('day').toISOString()
        }
      }
    }
    if (values.sort_by)
      searchFilters.sort_by = values.sort_by
    if (values.sort_order)
      searchFilters.sort_order = values.sort_order
    setFilters(searchFilters)
    setCurrentPage(1)
  }
  const handleReset = () => {
    form.resetFields()
    setFilters({})
    setCurrentPage(1)
  }
  const handleViewDetails = async (logId: number) => {
    setLoading(true)
    try {
      const log = await datasetLogApi.get(projectId, logId)
      setSelectedLog(log)
      setSelectedRowKeys([logId])
    }
    catch (error) {
      console.error('Failed to fetch log details:', error)
    }
    finally {
      setLoading(false)
    }
  }
  const copyContent = (content: string) => {
    navigator.clipboard
      .writeText(content)
      .then(() => {
        message.success(t('chainTest.copySuccess'))
      })
      .catch(() => {
        message.error(t('chainTest.copyError'))
      })
  }
  const rowSelection = {
    selectedRowKeys,
    onChange: (selectedKeys: React.Key[]) => {
      setSelectedRowKeys(selectedKeys)
    },
  }
  const handleCompare = () => {
    if (selectedRowKeys.length < 2) {
      message.warning(t('datasetLog.warningSelectAtLeastTwo'))
      return
    }
    const selectedLogsData = logs.filter((log) => selectedRowKeys.includes(log.id))
    navigate(`/project/${projectId}/logs/comparison`, {
      state: {
        selectedLogs: selectedLogsData,
        projectId,
      },
    })
  }
  const handleDelete = async (logId: number) => {
    try {
      setLoading(true)
      await datasetLogApi.batchDelete(projectId, [logId])
      message.success(t('datasetLog.deleteSuccess'))
      // 删除成功后刷新列表
      fetchLogs()
      // 如果当前正在查看的日志被删除，清除选中状态
      if (selectedLog && selectedLog.id === logId) {
        setSelectedLog(null)
        setSelectedRowKeys([])
      }
      else {
        // 更新选中项
        setSelectedRowKeys(selectedRowKeys.filter((key) => key !== logId))
      }
    }
    catch (error) {
      console.error('Failed to delete log:', error)
      message.error(t('datasetLog.deleteError'))
    }
    finally {
      setLoading(false)
    }
  }
  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning(t('datasetLog.selectLogToDelete'))
      return
    }
    try {
      setLoading(true)
      await datasetLogApi.batchDelete(projectId, selectedRowKeys as number[])
      message.success(t('datasetLog.batchDeleteSuccess'))
      // 删除成功后刷新列表
      fetchLogs()
      // 如果当前正在查看的日志被删除，清除选中状态
      if (selectedLog && selectedRowKeys.includes(selectedLog.id)) {
        setSelectedLog(null)
      }
      // 清空选择
      setSelectedRowKeys([])
    }
    catch (error) {
      console.error('Failed to batch delete logs:', error)
      message.error(t('datasetLog.batchDeleteError'))
    }
    finally {
      setLoading(false)
    }
  }
  const questionColumn = {
    title: t('datasetLog.question'),
    dataIndex: 'question',
    key: 'question',
    ellipsis: true,
    width: 300,
    render: (question: string) => (
      <Tooltip placement="topLeft" title={question}>
        <div className="overflow-hidden text-ellipsis whitespace-nowrap">
          {question}
        </div>
      </Tooltip>
    ),
  }
  const outputColumn = {
    title: t('datasetLog.output'),
    dataIndex: 'output',
    key: 'output',
    width: 300,
    ellipsis: {
      showTitle: false,
    },
    render: (output: string) => (<TruncatedOutput content={output} onCopy={copyContent} />),
  }
  const promptColumn = {
    title: t('datasetLog.prompt'),
    dataIndex: 'prompt_messages',
    key: 'prompt_messages',
    ellipsis: {
      showTitle: false,
    },
    width: 100,
    render: (promptMessages: any) => {
      // 从prompt_messages中提取标题
      const title = promptMessages?.title || ''
      return (
        <Tooltip placement="topLeft" title={title}>
          <div className="w-full max-w-[120px]">
            {title && title.length > 15
              ? `${title.substring(0, 15)}...`
              : title}
          </div>
        </Tooltip>
      )
    },
  }
  const modelColumn = {
    title: t('datasetLog.model'),
    dataIndex: 'llm_config_content',
    key: 'llm_config_content',
    ellipsis: {
      showTitle: false,
    },
    width: 100,
    render: (llmConfig: any) => {
      // 从llm_config_content中提取模型名称
      const model = llmConfig?.name || llmConfig?.model || ''
      return (
        <Tooltip placement="topLeft" title={model}>
          <div className="w-full max-w-[120px]">
            {model && model.length > 15
              ? `${model.substring(0, 15)}...`
              : model}
          </div>
        </Tooltip>
      )
    },
  }
  const executionTimeColumn = {
    title: t('datasetLog.executionTime'),
    dataIndex: 'execution_time_ms',
    key: 'execution_time_ms',
    width: 100,
    render: (time: number) => `${time ? (time / 1000).toFixed(2) : 0}s`,
  }
  const statusColumn = {
    title: t('datasetLog.status'),
    dataIndex: 'success',
    key: 'success',
    width: 100,
    render: (success: boolean) => (
      <Tag color={success ? 'success' : 'error'} icon={success ? <CheckCircleOutlined /> : <CloseCircleOutlined />}>
        {success ? t('datasetLog.success') : t('datasetLog.failed')}
      </Tag>
    ),
  }
  const createdAtColumn = {
    title: t('datasetLog.createdAt'),
    dataIndex: 'created_at',
    key: 'created_at',
    width: 180,
    render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm:ss'),
  }
  const actionsColumn = {
    title: t('common.actions'),
    key: 'actions',
    width: 200,
    render: (_: any, record: any) => (
      <Space>
        <Button type="link" icon={<EyeOutlined />} onClick={() => handleViewDetails(record.id)}>
          {t('common.view')}
        </Button>
        <Popconfirm title={t('datasetLog.confirmDelete')} description={t('datasetLog.confirmDeleteDescription')} onConfirm={() => handleDelete(record.id)} okText={t('common.yes')} cancelText={t('common.no')}>
          <Button type="link" icon={<DeleteOutlined />} danger>
            {t('common.delete')}
          </Button>
        </Popconfirm>
      </Space>
    ),
  }
  // 任务ID列
  // const taskIdColumn = {
  //   title: t("datasetLog.task_id"),
  //   dataIndex: "task_id",
  //   key: "task_id",
  //   width: 100,
  //   render: (task_id: string) => (
  //     <Tooltip placement="topLeft" title={task_id}>
  //       <div style={{ width: "100%" }}>{task_id || "-"}</div>
  //     </Tooltip>
  //   ),
  // };
  const answerTaskNameColumn = {
    title: t('datasetLog.answerGenerationTask'),
    dataIndex: 'task_name',
    key: 'task_name',
    width: 160,
    render: (v: string) => (
      <Tooltip placement="topLeft" title={v}>
        <div className="overflow-hidden text-ellipsis whitespace-nowrap">
          {v}
        </div>
      </Tooltip>
    ),
  }
  const columns = useMemo(() => {
    if (logTypeTab === 'chat') {
      // chat类型不显示任务ID和日志类型列
      return [
        questionColumn,
        outputColumn,
        promptColumn,
        modelColumn,
        executionTimeColumn,
        statusColumn,
        createdAtColumn,
        actionsColumn,
      ]
    }
    else if (logTypeTab === 'job') {
      // job类型不显示日志类型列，但显示任务ID
      // 在ID列后插入任务ID列
      return [
        questionColumn,
        outputColumn,
        promptColumn,
        modelColumn,
        executionTimeColumn,
        statusColumn,
        answerTaskNameColumn,
        createdAtColumn,
        actionsColumn,
      ]
    }
    return []
  }, [logTypeTab])
  const handleDateRangeChange = (value: string) => {
    setShowCustomDays(value === 'custom')
    // 如果不是自定义，则清除自定义天数
    if (value !== 'custom') {
      form.setFieldValue('customDays', undefined)
    }
  }
  // 切换日志类型tab时重置分页和选中行
  const handleLogTypeChange = (tabKey: string) => {
    setLogTypeTab(tabKey)
    setCurrentPage(1)
    setSelectedRowKeys([])
    setSelectedLog(null)
  }
  // 渲染日志列表内容
  const renderLogListContent = () => (
    <Card>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSearch}
        initialValues={{
          sort_by: 'created_at',
          sort_order: 'desc',
        }}
      >
        <Row gutter={16}>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Form.Item name="question" label={t('datasetLog.question')}>
              <Input placeholder={t('datasetLog.questionPlaceholder')} prefix={<SearchOutlined />} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Form.Item name="status" label={t('datasetLog.status')}>
              <Select placeholder={t('datasetLog.statusPlaceholder')} allowClear>
                <Select.Option value="success">
                  {t('datasetLog.success')}
                </Select.Option>
                <Select.Option value="failed">
                  {t('datasetLog.failed')}
                </Select.Option>
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8} lg={showCustomDays ? 3 : 6}>
            <Form.Item name="dateRange" label={t('datasetLog.dateRange')}>
              <Select className="w-full" allowClear onChange={handleDateRangeChange}>
                <Select.Option value="1d">
                  {t('datasetLog.today')}
                </Select.Option>
                <Select.Option value="2d">
                  {t('datasetLog.last2Days')}
                </Select.Option>
                <Select.Option value="7d">
                  {t('datasetLog.last7Days')}
                </Select.Option>
                <Select.Option value="custom">
                  {t('datasetLog.customDays')}
                </Select.Option>
              </Select>
            </Form.Item>
          </Col>
          {showCustomDays && (
            <Col xs={24} sm={12} md={8} lg={3}>
              <Form.Item
                name="customDays"
                label={t('datasetLog.daysCount')}
                rules={[
                  {
                    required: true,
                    message: t('datasetLog.customDaysRequired'),
                  },
                  {
                    pattern: /^[1-9]\d*$/,
                    message: t('datasetLog.customDaysPositive'),
                  },
                ]}
              >
                <Input type="number" min={1} placeholder={t('datasetLog.enterDays')} />
              </Form.Item>
            </Col>
          )}
          <Col xs={24} sm={12} md={8} lg={6}>
            <Form.Item name="sort_by" label={t('datasetLog.sortBy')}>
              <Select>
                <Select.Option value="created_at">
                  {t('datasetLog.createdAt')}
                </Select.Option>
                <Select.Option value="execution_time">
                  {t('datasetLog.executionTime')}
                </Select.Option>
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Form.Item name="sort_order" label={t('datasetLog.sortOrder')}>
              <Select>
                <Select.Option value="desc">
                  {t('datasetLog.sortDesc')}
                </Select.Option>
                <Select.Option value="asc">
                  {t('datasetLog.sortAsc')}
                </Select.Option>
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} sm={24} md={8} lg={12}>
            <Form.Item className="mt-[29px]">
              <Space>
                <Button type="primary" htmlType="submit">
                  {t('common.search')}
                </Button>
                <Button onClick={handleReset}>{t('common.reset')}</Button>
              </Space>
            </Form.Item>
          </Col>
        </Row>
      </Form>

      <div className="mb-4">
        <Space>
          <Button type="primary" onClick={handleCompare} disabled={selectedRowKeys.length < 2} icon={<SwapOutlined />}>
            {t('datasetLog.compare')}
          </Button>
          <Popconfirm title={t('datasetLog.confirmBatchDelete')} description={t('datasetLog.confirmBatchDeleteDescription')} onConfirm={handleBatchDelete} okText={t('common.confirm')} cancelText={t('common.cancel')} disabled={selectedRowKeys.length === 0}>
            <Button type="primary" danger disabled={selectedRowKeys.length === 0} icon={<DeleteOutlined />}>
              {t('datasetLog.batchDelete')}
            </Button>
          </Popconfirm>
        </Space>
      </div>

      <Table
        rowKey="id"
        rowSelection={rowSelection}
        columns={columns}
        dataSource={logs}
        loading={loading}
        pagination={{
          current: currentPage,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (total) => `${t('common.total')} ${total} ${t('common.items')}`,
        }}
        onChange={handleTableChange}
        scroll={{ x: 1200 }}
        size="middle"
      />
    </Card>
  )
  return (
    <Layout className="dataset-log-layout min-h-[100vh]">
      <Content className="p-6 relative">
        <Tabs
          className="mb-[16px]"
          activeKey={logTypeTab}
          onChange={handleLogTypeChange}
          items={[
            {
              key: 'chat',
              label: t('datasetLog.chatLogs'),
              children: renderLogListContent(),
            },
            {
              key: 'job',
              label: t('datasetLog.jobLogs'),
              children: renderLogListContent(),
            },
          ]}
        />

        {/* 使用Drawer组件展示日志详情 */}
        <Drawer
          open={!!selectedLog}
          onClose={() => {
            setSelectedLog(null)
            setSelectedRowKeys([])
          }}
          width={800}
          title={(
            <div className="flex justify-between items-center">
              <span>{t('datasetLog.details')}</span>
            </div>
          )}
          bodyStyle={{ padding: 0 }}
        >
          {selectedLog && (
            <div className="p-6 overflow-y-auto">
              {/* 问题部分 */}
              <div className="mb-6">
                <div className="flex justify-between items-start mb-4">
                  <Title level={5} className="m-0">
                    {t('datasetLog.question')}
                  </Title>
                  <Button type="text" icon={<CopyOutlined />} onClick={() => copyContent(selectedLog.question)} />
                </div>
                <div className="dataset-log-detail-block p-[16px] rounded-[4px] whitespace-pre-wrap">
                  {selectedLog.question}
                </div>
              </div>
              {/* 输出部分 */}
              <div className="mb-6">
                <div className="flex justify-between items-start mb-2">
                  <Title level={5} className="m-0">
                    {t('datasetLog.output')}
                  </Title>
                  <Button type="text" icon={<CopyOutlined />} onClick={() => copyContent(selectedLog.output || '')} />
                </div>
                <div className="dataset-log-detail-block p-[16px] rounded-[4px] whitespace-pre-wrap">
                  {hasThinkTags(selectedLog.output) ? (<ThinkableContent content={selectedLog.output || ''} />) : (
                    <div className="whitespace-pre-wrap break-words">
                      {selectedLog.output || ''}
                    </div>
                  )}
                </div>
              </div>
              {/* 模型部分 */}
              <div className="mb-6">
                <Title level={5} className="mb-2">
                  {t('datasetLog.model')}
                </Title>

                <div className="dataset-log-detail-block p-[16px] rounded-[4px]">
                  {selectedLog.llm_config_content ? (
                    <Collapse ghost>
                      <Collapse.Panel header={`Model: ${selectedLog.llm_config_content.model}`} key="1">
                        <div className="max-h-[200px] overflow-auto">
                          <Descriptions column={1} size="small" bordered>
                            <Descriptions.Item label="Name">
                              {selectedLog.llm_config_content.name}
                            </Descriptions.Item>
                            <Descriptions.Item label="Temperature">
                              {selectedLog.llm_config_content.temperature}
                            </Descriptions.Item>
                            <Descriptions.Item label="Max Tokens">
                              {selectedLog.llm_config_content.max_tokens}
                            </Descriptions.Item>
                            <Descriptions.Item label="Frequency Penalty">
                              {selectedLog.llm_config_content.frequency_penalty}
                            </Descriptions.Item>
                            <Descriptions.Item label="Presence Penalty">
                              {selectedLog.llm_config_content.presence_penalty}
                            </Descriptions.Item>
                            <Descriptions.Item label="Top P">
                              {selectedLog.llm_config_content.top_p}
                            </Descriptions.Item>
                            {selectedLog.llm_config_content.additional_params
                            && Object.keys(selectedLog.llm_config_content.additional_params)
                              .length > 0 && (
                              <Descriptions.Item label="Additional Parameters">
                                <pre className="bg-gray-50 p-2 rounded-lg max-h-[100px] overflow-auto text-xs">
                                  {JSON.stringify(selectedLog.llm_config_content.additional_params, null, 2)}
                                </pre>
                              </Descriptions.Item>
                            )}
                          </Descriptions>
                        </div>
                      </Collapse.Panel>
                    </Collapse>
                  ) : '--'}
                </div>
              </div>

              {/* 提示词部分 */}
              <div className="mb-6">
                <Title level={5} className="mb-2">
                  提示词
                </Title>
                <div className="dataset-log-detail-block p-[16px] rounded-[4px]">
                  {selectedLog?.prompt_messages?.messages[0].content ?? '--'}
                </div>
              </div>
              {/* 错误信息部分（仅在请求失败时显示） */}
              {!selectedLog.success && selectedLog.error_message && (
                <div className="mb-6">
                  <div className="flex justify-between items-start mb-2">
                    <Title level={5} className="m-0">
                      {t('datasetLog.errorMessage')}
                    </Title>
                    <Button type="text" icon={<CopyOutlined />} onClick={() => copyContent(selectedLog.error_message)} />
                  </div>
                  <div className="dataset-log-error-block p-[16px] rounded-[4px] whitespace-pre-wrap">
                    {selectedLog.error_message}
                  </div>
                </div>
              )}
            </div>
          )}
        </Drawer>
      </Content>
    </Layout>
  )
}
export default DatasetLogList
