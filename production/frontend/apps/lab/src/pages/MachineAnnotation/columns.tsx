import React from 'react'
import { Button, DatePicker, Dropdown, InputNumber, Modal, Popconfirm, Progress, Tag, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { MenuProps } from 'antd'
import { DeleteOutlined, InfoCircleOutlined, MoreOutlined, SendOutlined, TeamOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { AnnotationTaskItem, MemberRow } from './types'
import { formatAnnotationTypeLabel } from '@/services/machineLearnModel'

export const renderStatusTag = (status?: AnnotationTaskItem['status']) => {
  if (status === 'completed') return <Tag color="success">已完成</Tag>
  if (status === 'published') return <Tag color="processing">已发布</Tag>
  if (status === 'audit_passed') return <Tag color="success">审核通过</Tag>
  if (status === 'running') return <Tag color="warning">进行中</Tag>
  return <Tag>未发布</Tag>
}

const TASK_NAME_CELL_MAX_WIDTH = 180
const PROGRESS_STROKE_COLOR = { '0%': 'rgba(0,84,221,1)', '100%': 'rgba(82,133,247,1)' }

const renderTaskNameTooltipCell = (value?: string | null) => {
  const display = value?.trim() ? value : '-'
  if (display === '-') return display
  return (
    <Tooltip title={display}>
      <div className="mx-auto truncate" style={{ maxWidth: TASK_NAME_CELL_MAX_WIDTH }}>
        {display}
      </div>
    </Tooltip>
  )
}

export const createOnlineColumns = (
  onViewDetail: (record: AnnotationTaskItem) => void,
  onDelete: (record: AnnotationTaskItem) => void,
  deletingId?: number | null,
): ColumnsType<AnnotationTaskItem> => [
  {
    title: '任务名称',
    dataIndex: 'task_name',
    key: 'task_name',
    align: 'center',
    width: 180,
    render: (value) => renderTaskNameTooltipCell(value),
  },
  {
    title: '数据量',
    dataIndex: 'total_samples',
    key: 'total_samples',
    align: 'center',
    width: 100,
  },
  {
    title: '标注进度',
    key: 'progress',
    align: 'center',
    width: 180,
    render: (_, record) => {
      const percent = record.total_samples ? Math.round(((record.saved_count ?? 0) / record.total_samples) * 100) : 0
      return <Progress percent={Math.round(percent)} size="small" strokeColor={PROGRESS_STROKE_COLOR} />
    },
  },
  {
    title: '标注前数据集',
    dataIndex: 'source_dataset_name',
    key: 'source_dataset_name',
    align: 'center',
    ellipsis: true,
    width: 180,
    render: (value) => value || '-',
  },
  {
    title: '标注后数据集',
    dataIndex: 'submit_dataset_name',
    key: 'submit_dataset_name',
    align: 'center',
    ellipsis: true,
    width: 180,
    render: (value) => value || '-',
  },
  {
    title: '创建人',
    dataIndex: 'created_by',
    key: 'created_by',
    align: 'center',
    width: 100,
  },
  {
    title: '创建时间',
    dataIndex: 'created_at',
    key: 'created_at',
    align: 'center',
    ellipsis: true,
    width: 180,
    render: (created_at) => dayjs(created_at).format('YYYY-MM-DD HH:mm:ss'),
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    align: 'center',
    width: 100,
    render: (status) => renderStatusTag(status),
  },
  {
    title: '操作',
    key: 'action',
    align: 'center',
    width: 180,
    fixed: 'right',
    render: (_, record) => (
      <div className="machine-annotation-action-cell">
        <Button
          type="link"
          icon={<InfoCircleOutlined />}
          onClick={() => onViewDetail(record)}
        >
          详情
        </Button>
        <Popconfirm
          title="确认删除"
          description={`确定要删除标注任务“${record.task_name || '该任务'}”吗？`}
          onConfirm={() => onDelete(record)}
          okText="确定"
          cancelText="取消"
          okButtonProps={{ danger: true, loading: deletingId === record.id }}
        >
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            loading={deletingId === record.id}
          >
            删除
          </Button>
        </Popconfirm>
      </div>
    ),
  },
]

export const createMultiTaskColumns = (
  onViewDetail: (record: AnnotationTaskItem) => void,
): ColumnsType<AnnotationTaskItem> => [
  {
    title: '任务名称',
    dataIndex: 'task_name',
    key: 'task_name',
    align: 'center',
    width: 180,
    render: (value) => renderTaskNameTooltipCell(value),
  },
  {
    title: '数据量',
    dataIndex: 'my_assigned_count',
    key: 'my_assigned_count',
    align: 'center',
    width: 100,
  },
  {
    title: '标注进度',
    dataIndex: 'my_progress',
    key: 'my_progress',
    align: 'center',
    width: 180,
    render: (value) => <Progress percent={Math.round(value ?? 0)} size="small" strokeColor={PROGRESS_STROKE_COLOR} />,
  },
  {
    title: '标注前数据集',
    dataIndex: 'source_dataset_name',
    key: 'source_dataset_name',
    align: 'center',
    width: 180,
    render: (value) => value || '-',
  },
  {
    title: '标注后数据集',
    dataIndex: 'submit_dataset_name',
    key: 'submit_dataset_name',
    align: 'center',
    width: 180,
    render: (value) => value || '-',
  },
  {
    title: '创建人',
    dataIndex: 'created_by',
    key: 'created_by',
    align: 'center',
    width: 100,
  },
  {
    title: '创建时间',
    dataIndex: 'created_at',
    key: 'created_at',
    align: 'center',
    width: 180,
    render: (createdAt) => createdAt ? dayjs(createdAt).format('YYYY-MM-DD HH:mm:ss') : '-',
  },
  {
    title: '操作',
    key: 'action',
    align: 'center',
    width: 100,
    fixed: 'right',
    render: (_, record) => (
      <div className="machine-annotation-action-cell">
        <Button type="link" size="small" icon={<InfoCircleOutlined />} onClick={() => onViewDetail(record)}>
          详情
        </Button>
      </div>
    ),
  },
]

export const createOverviewColumns = (
  onViewDataList: (record: AnnotationTaskItem) => void,
  onPublishTask?: (record: AnnotationTaskItem) => Promise<void>,
  publishingTaskId?: number | null,
  onDeleteTask?: (record: AnnotationTaskItem) => void,
  onViewTaskMembers?: (record: AnnotationTaskItem) => void,
): ColumnsType<AnnotationTaskItem> => [
  {
    title: '标注任务',
    dataIndex: 'task_name',
    key: 'task_name',
    align: 'center',
    width: 180,
    render: (value) => renderTaskNameTooltipCell(value),
  },
  {
    title: '数据量',
    dataIndex: 'total_samples',
    key: 'total_samples',
    align: 'center',
    width: 100,
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    align: 'center',
    width: 100,
    render: (status) => renderStatusTag(status),
  },
  {
    title: '标注进度',
    dataIndex: 'annotation_progress',
    key: 'annotation_progress',
    align: 'center',
    width: 180,
    render: (value) => <Progress percent={Math.round(value ?? 0)} size="small" strokeColor={PROGRESS_STROKE_COLOR} />,
  },
  {
    title: '审核进度',
    dataIndex: 'audit_progress',
    key: 'audit_progress',
    align: 'center',
    width: 180,
    render: (value) => <Progress percent={value ?? 0} size="small" strokeColor={PROGRESS_STROKE_COLOR} />,
  },
  {
    title: '创建人',
    dataIndex: 'created_by',
    key: 'created_by',
    align: 'center',
    width: 100,
  },
  {
    title: '创建时间',
    dataIndex: 'created_at',
    key: 'created_at',
    align: 'center',
    width: 180,
    render: (createdAt) => createdAt ? dayjs(createdAt).format('YYYY-MM-DD HH:mm:ss') : '-',
  },
  {
    title: '操作',
    key: 'action',
    align: 'center',
    width: 220,
    fixed: 'right',
    render: (_, record) => {
      const taskId = Number(record.id)
      const taskName = record.task_name || '未命名任务'
      const isPublishing = publishingTaskId === taskId
      const publishDisabled = record.status !== 'audit_passed'

      const handlePublish = () => {
        if (!onPublishTask || publishDisabled) return
        Modal.confirm({
          title: '确认发布',
          content: `确定要发布任务“${taskName}”吗？发布后将生成标注后数据集。`,
          okText: '确认',
          cancelText: '取消',
          onOk: () => onPublishTask(record),
        })
      }

      const handleDelete = () => {
        if (!onDeleteTask) return
        Modal.confirm({
          title: '确认删除',
          content: `确定要删除任务「${taskName}」吗？删除后不可恢复。`,
          okText: '确定',
          okType: 'danger',
          cancelText: '取消',
          onOk: () => onDeleteTask(record),
        })
      }

      const moreItems: MenuProps['items'] = [
        {
          key: 'members',
          icon: <TeamOutlined />,
          label: '任务成员',
          onClick: () => onViewTaskMembers?.(record),
        },
        {
          key: 'delete',
          icon: <DeleteOutlined />,
          label: '删除',
          danger: true,
          onClick: handleDelete,
        },
      ]

      return (
        <div className="machine-annotation-action-cell">
          <Button
            type="link"
            size="small"
            icon={<SendOutlined />}
            loading={isPublishing}
            disabled={publishDisabled}
            onClick={handlePublish}
          >
            发布
          </Button>
          <Button type="link" size="small" icon={<InfoCircleOutlined />} onClick={() => onViewDataList(record)}>
            详情
          </Button>
          <Dropdown menu={{ items: moreItems }} trigger={['click']} placement="bottomRight">
            <Button
              type="link"
              size="small"
              icon={<MoreOutlined />}
              aria-label="更多操作"
              className="machine-annotation-more-action"
            />
          </Dropdown>
        </div>
      )
    },
  },
]

export const createReviewColumns = (
  onViewAuditDetail: (record: AnnotationTaskItem) => void,
): ColumnsType<AnnotationTaskItem> => [
  {
    title: '标注任务',
    dataIndex: 'task_name',
    key: 'task_name',
    align: 'center',
    width: 180,
    render: (value) => renderTaskNameTooltipCell(value),
  },
  {
    title: '标注类型',
    dataIndex: 'dataset_type',
    key: 'dataset_type',
    align: 'center',
    width: 120,
    render: (value: string | undefined) => formatAnnotationTypeLabel(value),
  },
  {
    title: '数据量',
    dataIndex: 'my_audit_total',
    key: 'my_audit_total',
    align: 'center',
    width: 100,
  },
  {
    title: '审核进度',
    dataIndex: 'my_audit_progress',
    key: 'my_audit_progress',
    align: 'center',
    width: 180,
    render: (value) => <Progress percent={value ?? 0} size="small" strokeColor={PROGRESS_STROKE_COLOR} />,
  },
  {
    title: '创建人',
    dataIndex: 'created_by',
    key: 'created_by',
    align: 'center',
    width: 100,
  },
  {
    title: '截止时间',
    dataIndex: 'deadline',
    key: 'deadline',
    align: 'center',
    width: 180,
    render: (deadline) => deadline ? dayjs(deadline).format('YYYY-MM-DD HH:mm:ss') : '-',
  },
  {
    title: '操作',
    key: 'action',
    align: 'center',
    width: 100,
    fixed: 'right',
    render: (_, record) => (
      <div className="machine-annotation-action-cell">
        <Button type="link" size="small" icon={<InfoCircleOutlined />} onClick={() => onViewAuditDetail(record)}>
          详情
        </Button>
      </div>
    ),
  },
]

interface CreateMemberColumnsOptions {
  type: 'annotation' | 'review'
  averageMemberCount: (type: 'annotation' | 'review') => void
  updateMember: (
    type: 'annotation' | 'review',
    key: string,
    field: keyof MemberRow,
    value: MemberRow[keyof MemberRow],
  ) => void
  removeMember: (type: 'annotation' | 'review', key: string) => void
}

export const createMemberColumns = ({
  type,
  averageMemberCount,
  updateMember,
  removeMember,
}: CreateMemberColumnsOptions): ColumnsType<MemberRow> => [
  {
    title: type === 'annotation' ? '标注成员' : '审核成员',
    dataIndex: 'username',
    key: 'username',
    width: 160,
  },
  {
    title: (
      <span>
        {type === 'annotation' ? '标注数量' : '审核数量'}
        <Button type="link" size="small" onClick={() => averageMemberCount(type)} className="ml-1 p-0">
          平均分配
        </Button>
      </span>
    ),
    dataIndex: 'count',
    key: 'count',
    width: 180,
    render: (_, record) => (
      <InputNumber
        min={0}
        value={record.count}
        onChange={(value) => updateMember(type, record.key, 'count', value ?? 0)}
        className="w-full"
      />
    ),
  },
  {
    title: '任务截止时间',
    dataIndex: 'deadline',
    key: 'deadline',
    width: 220,
    render: (_, record) => (
      <DatePicker
        value={record.deadline}
        onChange={(value) => updateMember(type, record.key, 'deadline', value)}
        format="YYYY-MM-DD"
        className="w-full"
        placeholder="请选择日期"
      />
    ),
  },
  {
    title: '操作',
    key: 'action',
    width: 100,
    render: (_, record) => (
      <Button type="link" danger size="small" onClick={() => removeMember(type, record.key)}>
        删除
      </Button>
    ),
  },
]
