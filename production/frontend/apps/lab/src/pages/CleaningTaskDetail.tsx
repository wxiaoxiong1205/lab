import React, { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Descriptions, Empty, Input, Space, Spin, Table, Tabs, Tag, Typography, message } from 'antd'
import { ArrowLeftOutlined, ClearOutlined, CodeOutlined, DownloadOutlined, PauseOutlined, PlayCircleOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cleaningService } from '@/services/cleaningService'
import type { CleaningStepSnapshot, CleaningTaskLogResponse } from '@/types/cleaning'
import { formatDateTime } from '@/utils/timeProcessing'
import { useProjectStore } from '@/stores/projectStore'
import '../styles/log-blocks.css'

const { Title, Text } = Typography
/**
 * 清洗任务详情页面
 */
const CleaningTaskDetail: React.FC = () => {
  const navigate = useNavigate()
  const { projectId, taskId } = useParams<{
    projectId: string
    taskId: string
  }>()
  const { currentProject } = useProjectStore()
  const queryClient = useQueryClient()
  const logsContainerRef = useRef<HTMLDivElement>(null)
  const numericProjectId = projectId ? Number(projectId) : currentProject?.id
  const numericTaskId = taskId ? Number(taskId) : null
  // 状态管理
  const [activeTab, setActiveTab] = useState<string>('detail')
  const [logSearchText, setLogSearchText] = useState<string>('')
  const [isPolling, setIsPolling] = useState<boolean>(false)
  const [mergedLogsData, setMergedLogsData] = useState<CleaningTaskLogResponse | null>(null)
  const [cleaningTaskStatus, setCleaningTaskStatus] = useState<any[]>([])
  // 任务基础信息
  const { data: taskMsgDetail, refetch: refetchTaskMsgDetail } = useQuery({
    queryKey: ['cleaning-task', numericTaskId],
    queryFn: async () => {
      if (!numericTaskId)
        throw new Error('Task ID is required')
      return cleaningService.getTask(numericTaskId)
    },
    enabled: !!numericTaskId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      return query.state.data?.status === '已完成' ? false : 3000
    },
  })
  // 任务详情+对比预览
  const { data: taskDetail, isLoading, refetch: refetchTaskDetail } = useQuery({
    queryKey: ['cleaning-task-detail', numericTaskId],
    queryFn: async () => {
      if (!numericTaskId)
        throw new Error('Task ID is required')
      return cleaningService.getTaskDetail(numericTaskId)
    },
    enabled: !!numericTaskId && taskMsgDetail?.status !== '已完成',
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 3000,
  })
  // previewData 这个保持你原来的 enabled 即可（只有已完成才拉预览）
  // 获取预览数据（如果详情中没有预览数据，则单独获取）
  const { data: previewData, isLoading: previewLoading } = useQuery({
    queryKey: ['cleaning-preview', numericTaskId],
    queryFn: async () => {
      if (!numericTaskId)
        throw new Error('Task ID is required')
      return await cleaningService.getPreview(numericTaskId, 50)
    },
    enabled: !!numericTaskId && activeTab === 'detail' && taskDetail?.status === '已完成' && !taskDetail?.preview_samples,
  })
  // 获取日志
  const { data: logsData, isLoading: logsLoading, error: logsError } = useQuery({
    queryKey: ['cleaning-task-logs', numericTaskId],
    queryFn: async () => {
      if (!numericTaskId)
        throw new Error('Task ID is required')
      return await cleaningService.getTaskLog(numericTaskId)
    },
    enabled: !!numericTaskId && activeTab === 'logs',
    retry: 2,
    staleTime: 30 * 1000,
  })
  useEffect(() => {
    const value = localStorage.getItem('projectEnumValues')
    if (value) {
      setCleaningTaskStatus(JSON.parse(value).all_enums.find((item) => item.enum_name === 'TrainingTaskStatus').options)
    }
  }, [])
  // 处理日志数据合并和轮询
  useEffect(() => {
    if (logsData) {
      setMergedLogsData(logsData)
      if (activeTab === 'detail') {
        refetchTaskMsgDetail()
        refetchTaskDetail()
      }
      // 如果archived为false，开始轮询
      if (!logsData.archived && activeTab === 'logs') {
        setIsPolling(true)
      }
      else {
        setIsPolling(false)
      }
    }
  }, [logsData, activeTab])
  // 自动滚动到底部
  useEffect(() => {
    if (mergedLogsData && logsContainerRef.current && isPolling) {
      const container = logsContainerRef.current
      container.scrollTop = container.scrollHeight
    }
  }, [mergedLogsData, isPolling])
  // 轮询获取增量日志
  useEffect(() => {
    if (!isPolling || !numericTaskId || activeTab !== 'logs') {
      return
    }
    const interval = setInterval(async () => {
      try {
        const newLogs = await cleaningService.getTaskLog(numericTaskId)
        setMergedLogsData(newLogs)
        // 如果已归档，停止轮询
        if (newLogs.archived) {
          setIsPolling(false)
        }
      }
      catch (error) {
        console.error('获取日志失败:', error)
      }
    }, 3000) // 每3秒轮询一次
    return () => clearInterval(interval)
  }, [isPolling, numericTaskId, activeTab])
  // 渲染状态标签
  const renderStatusTag = (status: string) => {
    const statusMap: Record<string, {
      color: string
      text: string
    }> = {
      准备中: { color: 'default', text: '准备中' },
      运行中: { color: 'processing', text: '运行中' },
      已完成: { color: 'success', text: '已完成' },
      失败: { color: 'error', text: '失败' },
    }
    const statusConfig = statusMap[status] || { color: 'default', text: status }
    return <Tag color={statusConfig.color}>{statusConfig.text}</Tag>
  }
  // 获取步骤快照（已排序）
  const getStepsSnapshot = (): CleaningStepSnapshot[] => {
    if (!taskMsgDetail?.steps_snapshot || !Array.isArray(taskMsgDetail.steps_snapshot)) {
      return []
    }
    // 按order排序
    return [...taskMsgDetail.steps_snapshot].sort((a, b) => (a.order || 0) - (b.order || 0))
  }
  // 下载数据
  const handleDownload = async () => {
    if (!numericTaskId) {
      message.error('任务ID不存在')
      return
    }
    try {
      const blob = await cleaningService.downloadResult(numericTaskId, 'result')
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `cleaning_result_${numericTaskId}.jsonl`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      message.success('下载成功')
    }
    catch (error: any) {
      message.error(error?.response?.data?.detail || '下载失败')
    }
  }
  // 下载日志
  const handleDownloadLog = async () => {
    if (!numericTaskId) {
      message.error('任务ID不存在')
      return
    }
    try {
      const blob = await cleaningService.downloadResult(numericTaskId, 'log')
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `cleaning_log_${numericTaskId}.txt`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      message.success('下载成功')
    }
    catch (error: any) {
      message.error(error?.response?.data?.detail || '下载失败')
    }
  }
  // 渲染基本信息
  const renderBasicInfo = () => {
    if (!taskMsgDetail)
      return null
    return (
      <Card title="基本信息" className="mb-6">
        <Descriptions column={2} bordered>
          <Descriptions.Item label="任务名称">{taskMsgDetail.name}</Descriptions.Item>
          <Descriptions.Item label="任务状态">
            {cleaningTaskStatus.find((item) => item.value === taskMsgDetail.status)?.label || taskMsgDetail.status}
          </Descriptions.Item>
          <Descriptions.Item label="数据来源">
            {taskMsgDetail.source === 'existed_dataset' ? '已有数据集' : '上传文件'}
          </Descriptions.Item>
          <Descriptions.Item label="清洗前数据集">
            {taskMsgDetail.input_dataset_name || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="清洗后数据集">
            {taskMsgDetail.output_dataset_name || '-'}
          </Descriptions.Item>
          {/* <Descriptions.Item label="总样本数"> */}
          {/*  {taskMsgDetail.total_samples !== null && taskMsgDetail.total_samples !== undefined */}
          {/*    ? taskMsgDetail.total_samples.toLocaleString() */}
          {/*    : '-'} */}
          {/* </Descriptions.Item> */}
          {/* <Descriptions.Item label="总字符数"> */}
          {/*  {taskMsgDetail.total_characters !== null && taskMsgDetail.total_characters !== undefined */}
          {/*    ? taskMsgDetail.total_characters.toLocaleString() */}
          {/*    : '-'} */}
          {/* </Descriptions.Item> */}
          {/* <Descriptions.Item label="文件大小"> */}
          {/*  {taskMsgDetail.file_size !== null && taskMsgDetail.file_size !== undefined */}
          {/*    ? `${taskMsgDetail.file_size.toFixed(2)} MB` */}
          {/*    : '-'} */}
          {/* </Descriptions.Item> */}
          <Descriptions.Item label="创建人">{taskMsgDetail.created_by || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">
            {taskMsgDetail.created_at ? formatDateTime(taskMsgDetail.created_at) : '-'}
          </Descriptions.Item>
          {/* <Descriptions.Item label="更新时间"> */}
          {/*  {taskMsgDetail.updated_at ? formatDateTime(taskMsgDetail.updated_at) : '-'} */}
          {/* </Descriptions.Item> */}
          <Descriptions.Item label="完成时间">
            {taskMsgDetail.completed_at ? formatDateTime(taskMsgDetail.completed_at) : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>
    )
  }
  // 渲染清洗结果
  const renderCleaningResults = () => {
    if (!taskDetail)
      return null
    const steps = getStepsSnapshot()
    // 预览表格列定义
    const previewColumns = [
      {
        title: '序号',
        dataIndex: 'index',
        key: 'index',
        width: 80,
        align: 'center' as const,
        render: (_: any, __: any, index: number) => index + 1,
      },
      {
        title: '清洗前',
        dataIndex: 'before',
        key: 'before',
        width: '50%',
        render: (text: string) => (
          <div className="max-h-[150px] overflow-y-auto break-words whitespace-pre-wrap">
            {text || '-'}
          </div>
        ),
      },
      {
        title: '清洗后',
        dataIndex: 'after',
        key: 'after',
        width: '50%',
        render: (text: string) => (
          <div className="max-h-[150px] overflow-y-auto break-words whitespace-pre-wrap">
            {text || '-'}
          </div>
        ),
      },
    ]
    // 处理预览数据：优先使用taskDetail.preview_samples，如果没有则使用previewData
    const formatPreviewData = () => {
      // 优先使用 comparisons 格式（新格式）
      const comparisons = (taskDetail as any)?.comparisons || (previewData as any)?.comparisons
      return comparisons.map((item: any, index: number) => {
        let before = ''
        let after = ''
        // 处理 before_data
        if (item.before_data) {
          before = typeof item.before_data === 'string'
            ? item.before_data
            : JSON.stringify(item.before_data, null, 2)
        }
        // 处理 after_data
        if (item.after_data !== null && item.after_data !== undefined) {
          after = typeof item.after_data === 'string'
            ? item.after_data
            : JSON.stringify(item.after_data, null, 2)
        }
        else {
          after = `[已过滤]\n原因：${item.filter_reason}`
        }
        return {
          key: index,
          index: index + 1,
          before,
          after,
        }
      })
    }
    return (
      <Card
        title="清洗结果"
        extra={(
          <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownload} disabled={taskMsgDetail?.status !== '已完成'}>
            下载数据
          </Button>
        )}
      >
        {/* 算子配置 */}
        {steps.length > 0 && (
          <div className="mb-6">
            <Text strong className="mr-4">
              算子配置:
            </Text>
            <Space wrap>
              {steps.map((step, index) => (
                <Tag key={index} color="blue" className="mb-2">
                  {step.operator_name || step.operator_type}
                </Tag>
              ))}
            </Space>
          </div>
        )}

        {/* 数据详情 */}
        <div className="mt-6">
          <div className="mb-4 flex justify-between items-center">
            <Text type="secondary">
              单次随机展示50条数据，如需查看完整数据可下载数据集。
            </Text>
          </div>

          {previewLoading ? (
            <div className="text-center p-[50px]">
              <Spin tip="加载预览数据中..." />
            </div>
          ) : (() => {
            const previewDataList = formatPreviewData()
            if (previewDataList.length > 0) {
              return (<Table columns={previewColumns} dataSource={previewDataList} pagination={false} scroll={{ y: 600 }} size="middle" />)
            }
            if (taskDetail.status === '运行中' || taskDetail.status === '准备中') {
              return (<Alert message="清洗中" description="数据正在清洗中，请稍候..." type="info" showIcon />)
            }
            return <Empty description="暂无预览数据" />
          })()}
        </div>
      </Card>
    )
  }
  // 渲染日志
  const renderLogs = () => {
    if (logsLoading) {
      return (
        <div className="text-center p-[50px]">
          <Spin tip="日志加载中..." />
        </div>
      )
    }
    if (logsError) {
      return (<Alert message="获取日志失败" description="无法加载清洗日志，请稍后重试" type="error" showIcon />)
    }
    if (!mergedLogsData) {
      return (<Alert message="暂无日志信息" type="info" showIcon />)
    }
    return (
      <div>
        {/* 日志搜索栏和统计信息 */}
        <div className="mb-4">
          <div className="flex gap-2 items-center mb-2">
            <Input placeholder="搜索日志内容..." prefix={<SearchOutlined />} value={logSearchText} onChange={(e) => setLogSearchText(e.target.value)} className="flex-1" allowClear />
            {logSearchText && (
              <Button size="small" icon={<ClearOutlined />} onClick={() => setLogSearchText('')}>
                清除
              </Button>
            )}
            {mergedLogsData && !mergedLogsData.archived && (
              <Button size="small" type={isPolling ? 'default' : 'primary'} icon={isPolling ? <PauseOutlined /> : <PlayCircleOutlined />} onClick={() => setIsPolling(!isPolling)}>
                {isPolling ? '暂停' : '继续'}
              </Button>
            )}
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => {
                if (numericTaskId) {
                  queryClient.invalidateQueries({ queryKey: ['cleaning-task-logs', numericTaskId] })
                }
              }}
            >
              刷新
            </Button>
            <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadLog}>
              下载日志
            </Button>
          </div>
          {/* 日志统计信息 */}
          {mergedLogsData.logs && Array.isArray(mergedLogsData.logs) && (
            <div className="text-[12px] text-[var(--lab-color-text-muted)] flex gap-4 items-center">
              <span>
                总日志数:
                {mergedLogsData.logs.length}
              </span>
              {isPolling && (<span className="text-[var(--lab-color-success)]">🔄 实时更新中...</span>)}
              {logSearchText && (
                <span>
                  匹配结果:
                  {' '}
                  {mergedLogsData.logs.filter((log: any) => {
                    let logContent = ''
                    if (typeof log === 'string') {
                      logContent = log
                    }
                    else if (log && typeof log === 'object') {
                      if (log.message) {
                        logContent = log.message
                      }
                      else if (log.text || log.content || log.log) {
                        logContent = log.text || log.content || log.log
                      }
                      else {
                        logContent = JSON.stringify(log, null, 2)
                      }
                    }
                    else {
                      logContent = String(log)
                    }
                    return logContent.toLowerCase().includes(logSearchText.toLowerCase())
                  }).length}
                </span>
              )}
              <span>显示格式: 编号 + 内容</span>
            </div>
          )}
        </div>

        <div
          className="lab-log-container-bordered p-[16px] rounded-[6px] font-mono max-h-[600px] overflow-y-auto min-h-[400px]"
          ref={logsContainerRef}
        >
          {mergedLogsData.archived && (
            <div
              className="lab-log-alert mb-[12px] p-[8px] rounded-[4px]"
            >
              <Text type="secondary" className="text-[12px]">
                📁 已加载归档日志
              </Text>
            </div>
          )}
          {isPolling && (
            <div
              className="lab-log-live mb-[12px] p-[8px] rounded-[4px]"
            >
              <Text type="secondary" className="text-[12px] text-[var(--lab-color-success)]">
                🔄 正在实时获取日志...
              </Text>
            </div>
          )}
          <div className="text-[13px] leading-[1.5]">
            {mergedLogsData.logs && Array.isArray(mergedLogsData.logs) ? ((() => {
              // 过滤日志
              const filteredLogs = mergedLogsData.logs.filter((log: any) => {
                if (!logSearchText)
                  return true
                let logContent = ''
                if (typeof log === 'string') {
                  logContent = log
                }
                else if (log && typeof log === 'object') {
                  if (log.message) {
                    logContent = log.message
                  }
                  else if (log.text || log.content || log.log) {
                    logContent = log.text || log.content || log.log
                  }
                  else {
                    logContent = JSON.stringify(log, null, 2)
                  }
                }
                else {
                  logContent = String(log)
                }
                return logContent.toLowerCase().includes(logSearchText.toLowerCase())
              })
              return filteredLogs.length > 0 ? (filteredLogs.map((log: any, index: number) => {
                // 处理日志格式，支持不同的数据结构
                let logContent = ''
                let logNumber = index
                if (typeof log === 'string') {
                  logContent = log
                }
                else if (log && typeof log === 'object') {
                  if (log.message) {
                    logContent = log.message
                  }
                  else if (log.text || log.content || log.log) {
                    logContent = log.text || log.content || log.log
                  }
                  else {
                    logContent = JSON.stringify(log, null, 2)
                  }
                  if (log.number !== undefined || log.index !== undefined) {
                    logNumber = log.number || log.index
                  }
                }
                else {
                  logContent = String(log)
                }
                // 根据日志级别添加颜色
                const getLogClassName = (content: string) => {
                  if (content.includes('ERROR') || content.includes('error')) {
                    return 'lab-log-line-error'
                  }
                  else if (content.includes('WARN') || content.includes('warning')) {
                    return 'lab-log-line-warning'
                  }
                  else if (content.includes('INFO') || content.includes('info')) {
                    return 'lab-log-line-info'
                  }
                  return ''
                }
                // 高亮搜索关键词
                const highlightText = (text: string, searchText: string) => {
                  if (!searchText)
                    return text
                  const regex = new RegExp(`(${searchText})`, 'gi')
                  const parts = text.split(regex)
                  return parts.map((part, i) => regex.test(part) ? (
                    <span
                      className="lab-log-highlight"
                      key={i}
                    >
                      {part}
                    </span>
                  ) : (part))
                }
                return (
                  <div key={index} className={`lab-log-line ${getLogClassName(logContent)}`}>
                    <span className="text-[var(--lab-color-text-muted)] mr-2 min-w-[40px] inline-block">
                      {logNumber}
                      :
                    </span>
                    <span className="whitespace-pre-wrap break-words">
                      {highlightText(logContent, logSearchText)}
                    </span>
                  </div>
                )
              })) : (
                <div className="lab-log-empty italic text-center p-[20px]">
                  没有找到匹配的日志内容
                </div>
              )
            })()) : (<div className="lab-log-empty italic">暂无日志内容</div>)}
          </div>
        </div>
      </div>
    )
  }
  if (!numericProjectId || !numericTaskId) {
    return (
      <div className="p-6">
        <Alert message="未找到项目或任务信息" type="error" />
      </div>
    )
  }
  if (isLoading) {
    return (
      <div className="text-center py-[100px]">
        <Spin size="large" tip="加载中..." />
      </div>
    )
  }
  if (!taskDetail) {
    return (
      <div className="p-6">
        <Empty description="任务不存在" />
      </div>
    )
  }
  return (
    <div className="p-[24px] min-h-[100vh]">
      {/* 页面头部 */}
      <div className="mb-6 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/project/${numericProjectId}/data-cleaning`)} className="p-0">
            返回
          </Button>
          <Title level={2} className="m-0">
            清洗任务详情
          </Title>
        </div>
      </div>

      {/* 标签页 */}
      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'detail',
              label: '清洗详情',
              children: (
                <div>
                  {renderBasicInfo()}
                  {renderCleaningResults()}
                </div>
              ),
            },
            {
              key: 'logs',
              label: (
                <span>
                  <CodeOutlined />
                  清洗日志
                </span>
              ),
              children: renderLogs(),
            },
          ]}
        />
      </Card>
    </div>
  )
}
export default CleaningTaskDetail
