/*
 * @Author: fangjun fangjun@deepexi.com
 * @Date: 2025-01-XX XX:XX:XX
 * @LastEditors: fangjun fangjun@deepexi.com
 * @LastEditTime: 2025-01-XX XX:XX:XX
 * @FilePath: \deepexi-lab-web\src\components\common\TaskLogsPage.tsx
 * @Description: 任务日志查看器组件
 */
import React, { useRef, useState } from 'react'
import { Button, Empty, Input, Space, Spin, message } from 'antd'
import { ClearOutlined, DownloadOutlined, SearchOutlined } from '@ant-design/icons'

export interface TaskLogsPageProps {
  /** 日志数据 */
  logs: any[]
  /** 加载状态 */
  loading?: boolean
  /** 任务名称，用于下载文件名 */
  taskName?: string
  /** 是否显示任务ID错误提示 */
  showTaskIdError?: boolean
  /** 最大高度 */
  maxHeight?: number
  /** 是否显示下载按钮 */
  showDownloadButton?: boolean
  /** 下载回调函数 */
  onDownload?: () => void
}
/**
 * 任务日志查看器组件
 * 提供日志搜索、过滤、下载等功能
 */
const TaskLogsPage: React.FC<TaskLogsPageProps> = ({ logs = [], loading = false, taskName = 'logs', showTaskIdError = false, maxHeight = 600, showDownloadButton = true, onDownload }) => {
  const [logSearchText, setLogSearchText] = useState('')
  const logsContainerRef = useRef<HTMLDivElement>(null)
  // 获取日志内容文本
  const getLogContent = (log: any): string => {
    if (typeof log === 'string') {
      return log
    }
    else if (log && typeof log === 'object') {
      if (log.message) {
        return log.message
      }
      else if (log.text || log.content || log.log) {
        return log.text || log.content || log.log
      }
      else {
        return JSON.stringify(log, null, 2)
      }
    }
    else {
      return String(log)
    }
  }
  // 获取日志样式
  const getLogStyle = (content: string) => {
    if (content.includes('ERROR') || content.includes('error')) {
      return { color: '#ff4d4f', fontWeight: 'bold' as const }
    }
    else if (content.includes('WARN') || content.includes('warning')) {
      return { color: '#faad14', fontWeight: 'bold' as const }
    }
    else if (content.includes('INFO') || content.includes('info')) {
      return { color: '#1890ff' }
    }
    else {
      return { color: '#262626' }
    }
  }
  // 高亮搜索关键词
  const highlightText = (text: string, searchText: string) => {
    if (!searchText)
      return text
    const regex = new RegExp(`(${searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)
    return parts.map((part, i) => regex.test(part) ? (
      <span
        className="p-[1px_2px] rounded-[2px]"
        key={i}
        style={{
          background: '#fff3cd',
        }}
      >
        {part}
      </span>
    ) : (part))
  }
  // 下载日志
  const downloadLogs = async () => {
    if (!logs || logs.length === 0) {
      message.warning('暂无日志可下载')
      return
    }
    try {
      const logContent = logs
        .map((log: any, index: number) => {
          const content = getLogContent(log)
          return `${index}: ${content}`
        })
        .join('\n')
      const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `任务日志_${taskName}_${new Date().toISOString().split('T')[0]}.txt`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      message.success('日志下载成功')
    }
    catch (error) {
      console.error('下载日志失败:', error)
      message.error('下载日志失败')
    }
  }
  // 过滤日志
  const filteredLogs = logs.filter((log: any) => {
    if (!logSearchText)
      return true
    const logContent = getLogContent(log)
    return logContent.toLowerCase().includes(logSearchText.toLowerCase())
  })
  if (showTaskIdError) {
    return (
      <div className="text-center p-[50px]">
        <Empty description="暂无任务ID，无法获取日志" />
      </div>
    )
  }
  if (loading) {
    return (
      <div className="text-center p-[50px]">
        <Spin tip="加载日志中..." />
      </div>
    )
  }
  if (!logs || logs.length === 0) {
    return (
      <div className="text-center p-[50px]">
        <Empty description="暂无日志数据" />
      </div>
    )
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
          {showDownloadButton && (
            <Button size="small" icon={<DownloadOutlined />} onClick={onDownload || downloadLogs} disabled={logs.length === 0}>
              下载
            </Button>
          )}
        </div>
        {/* 日志统计信息 */}
        {logs && Array.isArray(logs) && (
          <div className="text-[12px] text-[var(--lab-color-text-muted)] flex gap-4 items-center">
            <span>
              总日志数:
              {logs.length}
            </span>
            {logSearchText && (
              <span>
                匹配结果:
                {filteredLogs.length}
              </span>
            )}
            <span>显示格式: 编号 + 内容</span>
          </div>
        )}
      </div>

      {/* 日志内容区域 */}
      <div
        className="p-[16px] rounded-[6px] font-mono overflow-y-auto"
        ref={logsContainerRef}
        style={{
          background: '#f5f5f5',
          maxHeight: `${maxHeight}px`,
        }}
      >
        <div className="text-[13px] leading-[1.5]">
          {filteredLogs.length > 0 ? (filteredLogs.map((log: any, index: number) => {
            const logContent = getLogContent(log)
            let logNumber = index
            // 如果对象有编号字段，使用对象的编号
            if (log && typeof log === 'object') {
              if (log.number !== undefined || log.index !== undefined) {
                logNumber = log.number || log.index
              }
            }
            return (
              <div
                key={index}
                style={{
                  marginBottom: '2px',
                  padding: '2px 0',
                  borderBottom: '1px solid #f0f0f0',
                  ...getLogStyle(logContent),
                }}
              >
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
            <div
              className="italic text-center p-[20px]"
              style={{
                color: '#8c8c8c',
              }}
            >
              没有找到匹配的日志内容
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
export default TaskLogsPage
