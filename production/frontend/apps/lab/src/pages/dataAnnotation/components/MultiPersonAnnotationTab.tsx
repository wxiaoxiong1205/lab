import { Button, Dropdown, Input, Modal, Progress, Segmented, Table, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { MenuProps } from 'antd'
import dayjs from 'dayjs'
import { DeleteOutlined, EyeOutlined, MoreOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, SendOutlined, TeamOutlined } from '@ant-design/icons'
import React, { useMemo, useState } from 'react'
import type { MultiPersonAnnotationTabProps } from '..'
import { TaskListTable, WorkflowStepsSection } from './common'
import { getTablePagination } from '@/utils/tablePagination'

// 审核任务表格列（需传入 onViewAuditDetail：跳转到标注详情页做审核）
const getReviewTableColumns = (onViewAuditDetail: (record: Record<string, unknown>) => void): ColumnsType<Record<string, unknown>> => [
  { title: '标注任务', dataIndex: 'task_name', key: 'task_name', align: 'left', width: 120, ellipsis: true },
  { title: '数据量', dataIndex: 'my_audit_total', key: 'my_audit_total', align: 'left', width: 80 },
  {
    title: '审核进度',
    dataIndex: 'my_audit_progress',
    key: 'my_audit_progress',
    align: 'left',
    width: 120,
    render: (val: number) => {
      const progress = val != null ? val : 0
      return (
        <div className="flex items-center justify-start gap-2">
          <div className="w-[150px]">
            <Progress
              percent={progress}
              size="small"
              strokeColor={{ '0%': 'rgba(0,84,221,1)', '100%': 'rgba(82,133,247,1)' }}
            />
          </div>
        </div>
      )
    },
  },
  { title: '创建人', dataIndex: 'created_by', key: 'created_by', align: 'left', width: 80 },
  {
    title: '截止时间',
    dataIndex: 'deadline',
    key: 'deadline',
    align: 'left',
    width: 160,
    render: (t: string) => (t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-'),
  },
  {
    title: '操作',
    key: 'action',
    align: 'left',
    width: 160,
    fixed: 'right',
    render: (_: unknown, record: Record<string, unknown>) => (
      <div className="data-annotation-action-cell">
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            if (record.status === 'creating') {
              message.warning('任务创建中')
              return
            }
            onViewAuditDetail(record)
          }}
        >
          详情
        </Button>
      </div>
    ),
  },
]

// 任务总览表格列（需传入 onViewDataList、onViewTaskMembers、onDeleteTask）
const getOverviewTableColumns = (
  onViewDataList: (record: Record<string, unknown>) => void,
  onPublishTask?: (record: Record<string, unknown>) => Promise<void>,
  publishingTaskId?: number | null,
  onDeleteTask?: (record: Record<string, unknown>) => void,
  onViewTaskMembers?: (record: Record<string, unknown>) => void,
): ColumnsType<Record<string, unknown>> => [
  { title: '标注任务', dataIndex: 'task_name', key: 'task_name', align: 'left', width: 120, ellipsis: true },
  { title: '数据量', dataIndex: 'total_samples', key: 'total_samples', align: 'left', width: 80 },
  { title: '状态', dataIndex: 'status', key: 'status', align: 'left', width: 80, render: (status: string) => {
    return <span>{status === 'published' ? '已发布' : '未发布'}</span>
  } },
  {
    title: '标注进度',
    dataIndex: 'annotation_progress',
    key: 'annotation_progress',
    align: 'left',
    width: 120,
    render: (val: number) => {
      const progress = val != null ? val : 0
      return (
        <div className="flex items-center justify-start gap-2">
          <div className="w-[150px]">
            <Progress
              percent={Math.round(progress)}
              size="small"
              strokeColor={{ '0%': 'rgba(0,84,221,1)', '100%': 'rgba(82,133,247,1)' }}
            />
          </div>
        </div>
      )
    },
  },
  {
    title: '审核进度',
    dataIndex: 'audit_progress',
    key: 'audit_progress',
    align: 'left',
    width: 120,
    render: (val: number) => {
      const progress = val != null ? val : 0
      return (
        <div className="flex items-center justify-start gap-2">
          <div className="w-[150px]">
            <Progress
              percent={progress}
              size="small"
              strokeColor={{ '0%': 'rgba(0,84,221,1)', '100%': 'rgba(82,133,247,1)' }}
            />
          </div>
        </div>
      )
    },
  },
  { title: '创建人', dataIndex: 'created_by', key: 'created_by', align: 'left', width: 80 },
  {
    title: '创建时间',
    dataIndex: 'created_at',
    key: 'created_at',
    align: 'left',
    width: 160,
    render: (t: string) => (t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-'),
  },
  {
    title: '操作',
    key: 'action',
    align: 'left',
    width: 160,
    fixed: 'right',
    render: (_: unknown, record: Record<string, unknown>) => {
      const taskId = Number(record.id)
      const taskName = typeof record.task_name === 'string' ? record.task_name : '未命名任务'
      const isPublishing = publishingTaskId === taskId
      const publishDisabled = record?.status !== 'audit_passed'
      const detailDisabled = record?.status === 'creating'

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

      const handleDetail = () => {
        if (detailDisabled) {
          message.warning('任务创建中')
          return
        }
        onViewDataList(record)
      }

      const handleDelete = () => {
        if (!onDeleteTask) return
        Modal.confirm({
          title: '确认删除',
          content: `确定要删除任务「${(record.task_name as string) || '未命名'}」吗？删除后不可恢复。`,
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
        <div className="data-annotation-action-cell">
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
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={handleDetail}
          >
            详情
          </Button>
          <Dropdown menu={{ items: moreItems }} trigger={['click']} placement="bottomRight">
            <Button
              type="link"
              size="small"
              icon={<MoreOutlined />}
              aria-label="更多操作"
              className="data-annotation-more-action"
            />
          </Dropdown>
        </div>
      )
    },
  },
]

interface StyledRecordTableProps {
  columns: ColumnsType<Record<string, unknown>>
  dataSource: Record<string, unknown>[]
  loading: boolean
  pagination: { current: number, pageSize: number, total: number }
  onPageChange: (page: number, pageSize: number) => void
  toolbarExtra?: React.ReactNode
  searchValue?: string
  onSearchChange?: (value: string) => void
  onSearchPressEnter?: () => void
}

const StyledRecordTable: React.FC<StyledRecordTableProps> = ({
  columns,
  dataSource,
  loading,
  pagination,
  onPageChange,
  toolbarExtra,
  searchValue,
  onSearchChange,
  onSearchPressEnter,
}) => {
  const [keyword, setKeyword] = useState('')
  const isRemoteSearch = onSearchChange != null
  const currentKeyword = isRemoteSearch ? (searchValue ?? '') : keyword

  const filteredDataSource = useMemo(() => {
    if (isRemoteSearch) return dataSource
    const trimmedKeyword = keyword.trim()
    if (!trimmedKeyword) return dataSource

    return dataSource.filter((record) => {
      const candidates = [
        record.task_name,
        record.dataset_name,
        record.source_dataset_name,
        record.submit_dataset_name,
        record.created_by,
      ]
      return candidates.some((value) => String(value ?? '').includes(trimmedKeyword))
    })
  }, [dataSource, isRemoteSearch, keyword])

  return (
    <div className="data-annotation-table-block">
      <div className="mb-4 flex min-h-9 items-center justify-between gap-4 overflow-visible">
        <Input
          allowClear
          prefix={<SearchOutlined className="text-[18px] text-[rgba(24,24,25,1)]" />}
          placeholder="任务名称"
          value={currentKeyword}
          onChange={(event) => {
            const { value } = event.target
            if (isRemoteSearch) {
              onSearchChange?.(value)
            }
            else {
              setKeyword(value)
            }
          }}
          onPressEnter={onSearchPressEnter}
          className="data-annotation-search"
        />
        {toolbarExtra ? <div className="flex shrink-0 items-center gap-[10px]">{toolbarExtra}</div> : null}
      </div>

      <Table
        className="data-annotation-table"
        columns={columns}
        dataSource={filteredDataSource}
        rowKey="id"
        loading={loading}
        scroll={{ x: 'max-content', y: 550 }}
        pagination={getTablePagination({
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: !isRemoteSearch && keyword.trim() ? filteredDataSource.length : pagination.total,
          showTotal: (total) => (
            <>
              共
              {total}
              {' '}
              条
            </>
          ),
          showQuickJumper: true,
          onChange: onPageChange,
        })}
        size="middle"
      />
    </div>
  )
}

/** 多人标注 */
export const MultiPersonAnnotationTab: React.FC<MultiPersonAnnotationTabProps> = ({
  showOverviewTab,
  columns,
  taskList,
  loading,
  pagination,
  fetchTaskList,
  overviewList,
  overviewLoading,
  overviewPagination,
  fetchOverview,
  auditList,
  auditLoading,
  auditPagination,
  fetchAudit,
  handleRefresh,
  handleCreateTask,
  onViewDataList,
  onPublishTask,
  publishingTaskId,
  onViewAuditDetail,
  onViewTaskMembers,
  onDeleteTask,
  multiSubTab,
  onMultiSubTabChange,
  searchValue,
  onSearchChange,
  onSearchPressEnter,
  onSearchReset,
}) => {
  const hasOverviewTab = showOverviewTab !== false
  const activeMultiSubTab = !hasOverviewTab && multiSubTab === 'overview' ? 'task' : multiSubTab

  const onRefresh = () => {
    if (hasOverviewTab && activeMultiSubTab === 'overview') fetchOverview(overviewPagination.current, overviewPagination.pageSize)
    else if (activeMultiSubTab === 'task') handleRefresh()
    else fetchAudit(auditPagination.current, auditPagination.pageSize)
  }

  const toolbarExtra = (
    <>
      <Button className="data-annotation-refresh-btn" icon={<ReloadOutlined />} onClick={onRefresh}>
        刷新
      </Button>
      <Button className="w-[88px]" onClick={onSearchReset}>
        重置
      </Button>
      {hasOverviewTab && activeMultiSubTab === 'overview' && (
        <Button className="data-annotation-create-btn" type="primary" icon={<PlusOutlined />} onClick={handleCreateTask}>
          创建标注任务
        </Button>
      )}
    </>
  )

  const multiTabOptions = [
    hasOverviewTab ? { value: 'overview', label: '任务总览' } : null,
    { value: 'task', label: '标注任务' },
    { value: 'review', label: '审核任务' },
  ].filter(Boolean) as Array<{ value: 'overview' | 'task' | 'review', label: string }>

  return (
    <div className="data-annotation-tab-pane">
      <WorkflowStepsSection />
      <div className="data-annotation-sub-tabs mb-4">
        <div className="mb-4 flex min-h-10 items-center justify-between gap-4 overflow-visible">
          <Segmented
            className="data-annotation-segmented data-annotation-multi-segmented"
            value={activeMultiSubTab}
            onChange={(value) => onMultiSubTabChange(value as 'overview' | 'task' | 'review')}
            options={multiTabOptions}
          />
        </div>
        {hasOverviewTab && activeMultiSubTab === 'overview' && (
          <StyledRecordTable
            columns={getOverviewTableColumns(onViewDataList, onPublishTask, publishingTaskId, onDeleteTask, onViewTaskMembers)}
            dataSource={overviewList}
            loading={overviewLoading}
            pagination={overviewPagination}
            onPageChange={(page, pageSize) => fetchOverview(page, pageSize)}
            toolbarExtra={toolbarExtra}
            searchValue={searchValue}
            onSearchChange={onSearchChange}
            onSearchPressEnter={onSearchPressEnter}
          />
        )}
        {activeMultiSubTab === 'task' && (
          <TaskListTable
            columns={columns}
            taskList={taskList}
            loading={loading}
            pagination={pagination}
            fetchTaskList={fetchTaskList}
            toolbarExtra={toolbarExtra}
            searchValue={searchValue}
            onSearchChange={onSearchChange}
            onSearchPressEnter={onSearchPressEnter}
          />
        )}
        {activeMultiSubTab === 'review' && (
          <StyledRecordTable
            columns={getReviewTableColumns(onViewAuditDetail ?? onViewDataList)}
            dataSource={auditList}
            loading={auditLoading}
            pagination={auditPagination}
            onPageChange={(page, pageSize) => fetchAudit(page, pageSize)}
            toolbarExtra={toolbarExtra}
            searchValue={searchValue}
            onSearchChange={onSearchChange}
            onSearchPressEnter={onSearchPressEnter}
          />
        )}
      </div>
    </div>
  )
}
