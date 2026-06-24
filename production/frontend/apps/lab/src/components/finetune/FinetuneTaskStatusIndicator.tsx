import React from 'react'
import { Tag } from 'antd'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  StopOutlined,
  SyncOutlined,
} from '@ant-design/icons'

interface FinetuneTaskStatusIndicatorProps {
  status: string
}

/**
 * 微调任务状态指示器组件
 * 显示任务的当前状态，不同状态有不同的颜色和图标标识
 */
const FinetuneTaskStatusIndicator: React.FC<FinetuneTaskStatusIndicatorProps> = ({ status }) => {
  // 根据状态返回对应的配置
  const getStatusConfig = (status: string) => {
    const statusLower = status.toLowerCase()

    if (statusLower === 'running' || statusLower === 'training') {
      return {
        color: 'processing',
        text: '训练中',
        icon: <SyncOutlined spin />,
      }
    }
    else if (statusLower === 'pending' || statusLower === 'queued') {
      return {
        color: 'default',
        text: '等待中',
        icon: <ClockCircleOutlined />,
      }
    }
    else if (statusLower === 'completed' || statusLower === 'success') {
      return {
        color: 'success',
        text: '完成',
        icon: <CheckCircleOutlined />,
      }
    }
    else if (statusLower === 'failed' || statusLower === 'error') {
      return {
        color: 'error',
        text: '失败',
        icon: <ExclamationCircleOutlined />,
      }
    }
    else if (statusLower === 'stopped' || statusLower === 'cancelled') {
      return {
        color: 'warning',
        text: '已停止',
        icon: <StopOutlined />,
      }
    }
    else if (statusLower === 'preparing' || statusLower === 'initializing') {
      return {
        color: 'blue',
        text: '准备中',
        icon: <SyncOutlined spin />,
      }
    }
    else {
      return {
        color: 'default',
        text: status,
        icon: null,
      }
    }
  }

  const { color, text, icon } = getStatusConfig(status)

  return (
    <div className="task-status">
      {icon && <span className="status-icon">{icon}</span>}
      <Tag color={color}>{text}</Tag>
    </div>
  )
}

export default FinetuneTaskStatusIndicator
