import React from 'react'
import dayjs from 'dayjs'
import {
  CheckCircleOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  TagsOutlined,
} from '@ant-design/icons'
import type {
  MemberOption,
  MemberRow,
  OnlineAnnotationTaskDetail,
  WorkflowStepItem,
} from './types'

export const workflowSteps: WorkflowStepItem[] = [
  {
    icon: <DatabaseOutlined className="text-[24px] text-[#1677ff]" />,
    title: '选择数据',
    description: '从已有数据集版本创建在线标注任务或协同标注任务。',
  },
  {
    icon: <TagsOutlined className="text-[24px] text-[#1677ff]" />,
    title: '配置标签',
    description: '根据任务类型维护标签集与模型配置，准备进入标注流程。',
  },
  {
    icon: <DeploymentUnitOutlined className="text-[24px] text-[#1677ff]" />,
    title: '执行标注',
    description: '支持在线标注、多人分配、审核流转等机器学习标注场景。',
  },
  {
    icon: <CheckCircleOutlined className="text-[24px] text-[#1677ff]" />,
    title: '提交结果',
    description: '保存标注结果并提交，产出可用于训练或复核的数据版本。',
  },
]

export const totalDataCount = 100

export const memberPool: MemberOption[] = [
  { userId: 101, username: '张晨' },
  { userId: 102, username: '李敏' },
  { userId: 103, username: '王磊' },
  { userId: 104, username: '赵雪' },
  { userId: 105, username: '陈涛' },
  { userId: 106, username: '周宁' },
]

const createDefaultMember = (
  type: 'annotation' | 'review',
  member: MemberOption,
  count: number,
  deadlineOffset: number,
): MemberRow => ({
  key: `${type}-${member.userId}`,
  userId: member.userId,
  username: member.username,
  count,
  deadline: dayjs().add(deadlineOffset, 'day'),
})

export const defaultAnnotationMembers = (): MemberRow[] => [
  createDefaultMember('annotation', memberPool[0], 50, 7),
  createDefaultMember('annotation', memberPool[1], 50, 7),
]

export const defaultReviewMembers = (): MemberRow[] => [
  createDefaultMember('review', memberPool[2], 50, 10),
]

export const createFallbackOnlineTaskDetail = (taskId?: number): OnlineAnnotationTaskDetail => ({
  id: taskId ?? 0,
  title: '标注任务详情',
  task_name: '标注任务详情',
  kind: 'text-classification',
  labels: [],
  pages: [],
})
