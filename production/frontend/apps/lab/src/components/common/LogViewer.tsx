import React, { useRef, useState } from 'react'
import { Button, Input, Typography } from 'antd'
import { ClearOutlined, SearchOutlined } from '@ant-design/icons'

const { Text } = Typography

export interface LogViewerProps {
  /** 日志数据数组 */
  logs?: any[]
  /** 是否显示归档日志提示 */
  archived?: boolean
  /** 日志容器的最大高度，默认 600px */
  maxHeight?: number | string
  /** 搜索框占位符 */
  searchPlaceholder?: string
  /** 是否显示统计信息 */
  showStats?: boolean
  /** 自定义样式 */
  style?: React.CSSProperties
}

/**
 * 日志查看器组件
 * 支持日志搜索、过滤、高亮显示等功能
 */
const LogViewer: React.FC<LogViewerProps> = ({
  logs = [],
  archived = false,
  maxHeight = '600px',
  searchPlaceholder = '搜索日志内容...',
  showStats = true,
  style,
}) => {
  const [logSearchText, setLogSearchText] = useState('')
  const logsContainerRef = useRef<HTMLDivElement>(null)

  // 提取日志内容的辅助函数
  const extractLogContent = (log: any): string => {
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

  // 过滤日志
  const filteredLogs = logs.filter((log: any) => {
    if (!logSearchText) return true
    const logContent = extractLogContent(log)
    return logContent.toLowerCase().includes(logSearchText.toLowerCase())
  })

  // 计算匹配的日志数量
  const matchedCount = logSearchText
    ? logs.filter((log: any) => {
      const logContent = extractLogContent(log)
      return logContent.toLowerCase().includes(logSearchText.toLowerCase())
    }).length
    : 0

  // 根据日志级别获取 Tailwind 类名
  const getLogClassName = (content: string): string => {
    if (content.includes('ERROR') || content.includes('error')) {
      return 'text-red-500 font-bold'
    }
    else if (content.includes('WARN') || content.includes('warning')) {
      return 'text-orange-500 font-bold'
    }
    else if (content.includes('INFO') || content.includes('info')) {
      return 'text-blue-500'
    }
    else {
      return 'text-gray-800'
    }
  }

  // 高亮搜索关键词
  const highlightText = (text: string, searchText: string): React.ReactNode => {
    if (!searchText) return text
    const regex = new RegExp(`(${searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)
    return parts.map((part, i) =>
      regex.test(part) ? (
        <span key={i} className="bg-yellow-100 px-0.5 py-0 rounded">
          {part}
        </span>
      ) : (
        part
      ),
    )
  }

  const maxHeightStyle = typeof maxHeight === 'number'
    ? { maxHeight: `${maxHeight}px` }
    : { maxHeight }

  return (
    <div style={style}>
      {/* 日志搜索栏和统计信息 */}
      <div className="mb-4">
        <div className="flex gap-2 items-center mb-2">
          <Input
            placeholder={searchPlaceholder}
            prefix={<SearchOutlined />}
            value={logSearchText}
            onChange={(e) => setLogSearchText(e.target.value)}
            className="flex-1"
            allowClear
          />
          {logSearchText && (
            <Button
              size="small"
              icon={<ClearOutlined />}
              onClick={() => setLogSearchText('')}
            >
              清除
            </Button>
          )}
        </div>
        {/* 日志统计信息 */}
        {showStats && Array.isArray(logs) && logs.length > 0 && (
          <div className="text-xs text-gray-500 flex gap-4 items-center">
            <span>
              总日志数:
              {logs.length}
            </span>
            {logSearchText && (
              <span>
                匹配结果:
                {matchedCount}
              </span>
            )}
            <span>显示格式: 编号 + 内容</span>
          </div>
        )}
      </div>

      <div
        ref={logsContainerRef}
        className="bg-gray-100 p-4 rounded-md font-mono overflow-y-auto"
        style={maxHeightStyle}
      >
        {archived && (
          <div className="mb-3 p-2 bg-blue-50 rounded border border-blue-300">
            <Text type="secondary" className="text-xs">
              📁 已加载归档日志
            </Text>
          </div>
        )}
        <div className="text-sm leading-relaxed">
          {Array.isArray(logs) && logs.length > 0 ? (
            filteredLogs.length > 0 ? (
              filteredLogs.map((log: any, index: number) => {
                // 处理日志格式，支持不同的数据结构
                const logContent = extractLogContent(log)
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
                    className={`mb-0.5 py-0.5 border-b border-gray-200 ${getLogClassName(logContent)}`}
                  >
                    <span className="text-gray-500 mr-2 min-w-[40px] inline-block">
                      {logNumber}
                      :
                    </span>
                    <span className="whitespace-pre-wrap break-words">
                      {highlightText(logContent, logSearchText)}
                    </span>
                  </div>
                )
              })
            ) : (
              <div className="text-gray-500 italic text-center py-5">
                没有找到匹配的日志内容
              </div>
            )
          ) : (
            <div className="text-gray-500 italic">暂无日志内容</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default LogViewer
