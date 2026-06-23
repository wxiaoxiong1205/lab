import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, Input, Space, Spin, Typography } from 'antd'
import { ArrowLeftOutlined, ClearOutlined, PauseOutlined, PlayCircleOutlined, SearchOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { baseModelLogsApi } from '@/services/baseModelLogsapi'
import '../styles/log-blocks.css'

const { Text } = Typography
/**
 * 基础模型日志页面
 * 只显示日志信息，不包含任务版本数据
 */
const BaseModelLogsPage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const modelId = searchParams.get('modelId')
  const modelName = searchParams.get('modelName')
  const [logSearchText, setLogSearchText] = useState('')
  const [mergedLogsData, setMergedLogsData] = useState<any>(null)
  const [isPolling, setIsPolling] = useState(false)
  const logsContainerRef = React.useRef<HTMLDivElement>(null)
  // 获取日志数据
  const { data: logsData, isLoading: isLogsLoading, error: logsError } = useQuery({
    queryKey: ['baseModelLogs', modelId],
    queryFn: async () => {
      if (!modelId) {
        throw new Error('缺少必要参数')
      }
      try {
        // 获取当前时间，东八区ISO格式
        const endTime = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace('Z', '+08:00')
        const response = await baseModelLogsApi.getBaseModelLogs(Number(modelId), endTime)
        return response
      }
      catch (err) {
        console.error('获取基础模型日志失败:', err)
        throw err
      }
    },
    enabled: Boolean(modelId),
    retry: 2,
    staleTime: 30 * 1000,
  })
  // 处理日志数据合并和轮询
  useEffect(() => {
    if (logsData) {
      setMergedLogsData(logsData)
      // 如果archived为false，开始轮询
      if (!logsData.archived) {
        setIsPolling(true)
      }
      else {
        setIsPolling(false)
      }
    }
  }, [logsData])
  // 自动滚动到底部
  useEffect(() => {
    if (mergedLogsData && logsContainerRef.current && isPolling) {
      const container = logsContainerRef.current
      container.scrollTop = container.scrollHeight
    }
  }, [mergedLogsData, isPolling])
  // 轮询获取增量日志
  useEffect(() => {
    let intervalId = null
    let abortController: AbortController | null = null
    if (isPolling && modelId) {
      const pollIncrementalLogs = async () => {
        try {
          abortController?.abort()
          abortController = new AbortController()
          const startTime = new Date(Date.now() + 8 * 60 * 60 * 1000 - 5000).toISOString().replace('Z', '+08:00')
          const endTime = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace('Z', '+08:00')
          const response = await baseModelLogsApi.getBaseModelLogsByTime(Number(modelId), startTime, endTime, abortController.signal)
          if (response && response.logs && Array.isArray(response.logs)) {
            setMergedLogsData((prevData: any) => {
              if (!prevData)
                return response
              return {
                ...prevData,
                logs: [...(prevData.logs || []), ...response.logs],
                archived: response.archived,
              }
            })
            // 如果返回的archived为true，停止轮询
            if (response.archived) {
              setIsPolling(false)
            }
          }
        }
        catch (error: any) {
          // 如果是取消请求，不显示错误
          if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') {
            return
          }
          console.error('获取增量日志失败:', error)
          // 发生错误时停止轮询
          setIsPolling(false)
        }
      }
      // 立即执行一次
      pollIncrementalLogs()
      // 设置5秒轮询
      intervalId = setInterval(pollIncrementalLogs, 5000)
    }
    return () => {
      abortController?.abort() // 取消未完成的请求
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [isPolling, modelId])
  if (logsError) {
    return (
      <div className="base-model-logs-container lab-list-page-shell">
        <div className="mt-4">
          <Alert message="获取数据失败" description="无法加载日志，请稍后重试" type="error" showIcon />
        </div>
      </div>
    )
  }
  return (
    <div className="base-model-logs-container lab-list-page-shell">
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate(-1)}
        className="mb-4"
      >
        返回
      </Button>

      {/* 日志内容 */}
      <Card title="模型下载日志">
        {isLogsLoading ? (
          <div className="text-center p-[50px]">
            <Spin tip="日志加载中..." />
          </div>
        ) : logsError ? (<Alert message="获取日志失败" description="无法加载模型下载日志，请稍后重试" type="error" showIcon />) : mergedLogsData ? (
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
              </div>
              {/* 日志统计信息 */}
              {mergedLogsData.logs && Array.isArray(mergedLogsData.logs) && (
                <div className="text-[12px] text-[var(--lab-color-text-muted)] flex gap-4 items-center">
                  <span>
                    总日志数:
                    {mergedLogsData.logs.length}
                  </span>
                  {isPolling && (
                    <span className="text-[var(--lab-color-success)]">
                      🔄 实时更新中...
                    </span>
                  )}
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

            <div className="lab-log-container p-[16px] rounded-[6px] font-mono max-h-[600px] overflow-y-auto" ref={logsContainerRef}>
              {mergedLogsData.archived && (
                <div className="lab-log-alert mb-[12px] p-[8px] rounded-[4px]">
                  <Text type="secondary" className="text-[12px]">
                    📁 已加载归档日志
                  </Text>
                </div>
              )}
              {isPolling && (
                <div className="lab-log-live mb-[12px] p-[8px] rounded-[4px]">
                  <Text type="secondary" className="text-[12px] text-[var(--lab-color-success)]">
                    🔄 正在实时获取日志...
                  </Text>
                </div>
              )}
              <div className="text-[13px] leading-[1.5]">
                {mergedLogsData.logs && Array.isArray(mergedLogsData.logs)
                  ? (() => {
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
                          // 如果有message字段
                          if (log.message) {
                            logContent = log.message
                          }
                          // 如果有其他文本字段
                          else if (log.text || log.content || log.log) {
                            logContent = log.text || log.content || log.log
                          }
                          // 如果是对象，尝试序列化
                          else {
                            logContent = JSON.stringify(log, null, 2)
                          }
                          // 如果对象有编号字段，使用对象的编号
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
                            <span className="lab-log-highlight" key={i}>
                              {part}
                            </span>
                          ) : part)
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
                    })()
                  : <div className="lab-log-empty italic">暂无日志内容</div>}
              </div>
            </div>
          </div>
        ) : (<Alert message="暂无日志信息" type="info" showIcon />)}
      </Card>
    </div>
  )
}
export default BaseModelLogsPage
