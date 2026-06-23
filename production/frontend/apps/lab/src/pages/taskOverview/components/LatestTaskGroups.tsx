import { ArrowRightOutlined, BarChartOutlined, CloudServerOutlined, DatabaseOutlined, ExperimentOutlined, FireOutlined, PlayCircleOutlined, RocketOutlined } from '@ant-design/icons'
import { Card, Col, Empty, Pagination, Row, Space, Tag, Typography, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import React from 'react'
import { getLatestTaskTargetPath } from '../utils/taskNavigation'
import type { LatestComputeTask } from '@/services/taskOverviewService'

export interface LatestTaskGroup {
  key: string
  label: string
  color: string
  tagColor: string
  totalCount: number
  page: number
  pageSize: number
  tasks: LatestComputeTask[]
}

interface LatestTaskGroupsProps {
  groups: LatestTaskGroup[]
  projectId?: number
  currentUsername?: string
  onPageChange?: (status: string, page: number) => void
}

const { Text, Title } = Typography

const moduleMeta: Record<string, { label: string, icon: React.ReactNode, color: string }> = {
  'dataset-output-clean': { label: '数据清洗', icon: <DatabaseOutlined />, color: '#0891b2' },
  'dataset-distillation': { label: '大模型训练', icon: <CloudServerOutlined />, color: '#2563eb' },
  'evaluation': { label: '效果评估', icon: <BarChartOutlined />, color: '#7c3aed' },
  'deployment': { label: '大模型部署', icon: <RocketOutlined />, color: '#f97316' },
  'notebook': { label: '在线Notebook', icon: <PlayCircleOutlined />, color: '#4f46e5' },
  'machine': { label: '机器学习模型部署', icon: <ExperimentOutlined />, color: '#0f766e' },
}

const getTaskOwner = (task: LatestComputeTask) => {
  return task.created_by || '-'
}

const getModuleMeta = (task: LatestComputeTask) => {
  const type = String(task.task_type || '').toLowerCase()
  if (task.task_type_name) {
    const color = type.includes('machine') || type.includes('ml') ? moduleMeta.machine.color : '#2563eb'
    return {
      label: task.task_type_name,
      icon: type.includes('machine') || type.includes('ml') ? moduleMeta.machine.icon : <CloudServerOutlined />,
      color,
    }
  }
  if (type.includes('machine') || type.includes('ml')) return moduleMeta.machine
  if (type.includes('deploy') || type.includes('service')) return moduleMeta.deployment
  if (type.includes('notebook')) return moduleMeta.notebook
  if (type.includes('evaluation') || type.includes('eval')) return moduleMeta.evaluation
  return moduleMeta[type] || { label: type || '算力任务', icon: <CloudServerOutlined />, color: '#2563eb' }
}

const LatestTaskGroups = ({ groups, projectId, currentUsername, onPageChange }: LatestTaskGroupsProps) => {
  const navigate = useNavigate()

  const handleOpenTask = (task: LatestComputeTask) => {
    const owner = getTaskOwner(task)
    // if (owner !== '-' && currentUsername && owner !== currentUsername) {
    //   message.warning('暂无权限')
    //   return
    // }

    navigate(getLatestTaskTargetPath(task, projectId))
  }

  return (
    <Card className="task-overview-section-card" bodyStyle={{ padding: 24 }}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <Title level={4} className="!m-0">最新任务</Title>
          <Text type="secondary">按待启动、启动中、排队、运行和失败任务聚合展示</Text>
        </div>
        <Tag color="processing" className="rounded-full">全部算力型任务</Tag>
      </div>

      <Row gutter={[16, 16]}>
        {groups.map((group) => (
          <Col xs={24} lg={12} xxl={group.key === 'failed' ? 24 : 12} key={group.key}>
            <div className="task-overview-latest-group" style={{ '--group-color': group.color } as React.CSSProperties}>
              <div className="task-overview-latest-group__head">
                <Space size={8}>
                  <FireOutlined style={{ color: group.color }} />
                  <Text strong>{group.label}</Text>
                </Space>
                <Tag color={group.tagColor}>{group.totalCount}</Tag>
              </div>
              <div className="task-overview-latest-group__body">
                {group.tasks.length === 0
                  ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`当前范围暂无${group.label}任务`} />
                  : group.tasks.map((task) => {
                      const meta = getModuleMeta(task)
                      return (
                        <button
                          key={task.task_id}
                          type="button"
                          className="task-overview-item"
                          onClick={() => handleOpenTask(task)}
                        >
                          <div className="flex min-w-0 flex-1 flex-col gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span style={{ color: meta.color }}>{meta.icon}</span>
                              <Text strong ellipsis className="max-w-[360px]">{task.task_name}</Text>
                            </div>
                            <Space wrap size={8}>
                              <Tag className="!m-0">{meta.label}</Tag>
                              <Text type="secondary" className="text-[12px]">
                                创建人：
                                {getTaskOwner(task)}
                              </Text>
                              <Text type="secondary" className="text-[12px]">
                                创建时间：
                                {task.created_at ? dayjs(task.created_at).format('YYYY/MM/DD HH:mm:ss') : '-'}
                              </Text>
                            </Space>
                          </div>
                          <ArrowRightOutlined className="mt-1 shrink-0 text-[#2563eb]" />
                        </button>
                      )
                    })}
                {group.totalCount > group.pageSize && (
                  <div className="mt-3 flex justify-end">
                    <Pagination
                      size="small"
                      current={group.page}
                      pageSize={group.pageSize}
                      total={group.totalCount}
                      showSizeChanger={false}
                      onChange={(page) => onPageChange?.(group.key, page)}
                    />
                  </div>
                )}
              </div>
            </div>
          </Col>
        ))}
      </Row>
    </Card>
  )
}

export default LatestTaskGroups
