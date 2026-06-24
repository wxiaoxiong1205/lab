import React from 'react'
import { Button, Layout, Segmented, Space, Table, Tabs, Typography } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  createMultiTaskColumns,
  createOnlineColumns,
  createOverviewColumns,
  createReviewColumns,
} from '../columns'
import { workflowSteps } from '../constants'
import type { AnnotationTaskItem, MainTab, MultiSubTab } from '../types'
import WorkflowSteps from '@/components/common/WorkflowSteps'
import './AnnotationListContent.css'

const { Title, Text } = Typography

interface AnnotationListContentProps {
  showOverviewTab: boolean | null
  mainTab: MainTab
  multiSubTab: MultiSubTab
  taskList: AnnotationTaskItem[]
  loading: boolean
  pagination: { current: number, pageSize: number, total: number }
  overviewList: AnnotationTaskItem[]
  overviewLoading: boolean
  overviewPagination: { current: number, pageSize: number, total: number }
  auditList: AnnotationTaskItem[]
  auditLoading: boolean
  auditPagination: { current: number, pageSize: number, total: number }
  onMainTabChange: (tab: MainTab) => void
  onMultiSubTabChange: (tab: MultiSubTab) => void
  onRefresh: () => void
  onCreate: () => void
  onTaskPageChange: (page: number, pageSize: number) => void
  onOverviewPageChange: (page: number, pageSize: number) => void
  onAuditPageChange: (page: number, pageSize: number) => void
  onViewDetail: (id: number) => void
  onViewOverviewDetail: (id: number) => void
  onViewAuditDetail: (id: number) => void
  onViewTaskMembers: (id: number) => void
  onDeleteOnlineTask: (id: number) => void
  onDeleteMultiTask: (id: number) => void
  onPublishMultiTask: (id: number) => Promise<void>
  deletingOnlineTaskId?: number | null
  publishingTaskId?: number | null
}

const AnnotationListContent: React.FC<AnnotationListContentProps> = ({
  showOverviewTab,
  mainTab,
  multiSubTab,
  taskList,
  loading,
  pagination,
  overviewList,
  overviewLoading,
  overviewPagination,
  auditList,
  auditLoading,
  auditPagination,
  onMainTabChange,
  onMultiSubTabChange,
  onRefresh,
  onCreate,
  onTaskPageChange,
  onOverviewPageChange,
  onAuditPageChange,
  onViewDetail,
  onViewOverviewDetail,
  onViewAuditDetail,
  onViewTaskMembers,
  onDeleteOnlineTask,
  onDeleteMultiTask,
  onPublishMultiTask,
  deletingOnlineTaskId,
  publishingTaskId,
}) => {
  const onlineColumns = React.useMemo(
    () => createOnlineColumns(
      (record) => onViewDetail(record.id),
      (record) => onDeleteOnlineTask(record.id),
      deletingOnlineTaskId,
    ),
    [deletingOnlineTaskId, onDeleteOnlineTask, onViewDetail],
  )
  const multiColumns = React.useMemo(
    () => createMultiTaskColumns((record) => onViewDetail(record.id)),
    [onViewDetail],
  )
  const overviewColumns = React.useMemo(
    () => createOverviewColumns(
      (record) => onViewOverviewDetail(record.id),
      (record) => onPublishMultiTask(record.id),
      publishingTaskId,
      (record) => onDeleteMultiTask(record.id),
      (record) => onViewTaskMembers(record.id),
    ),
    [onDeleteMultiTask, onPublishMultiTask, onViewOverviewDetail, onViewTaskMembers, publishingTaskId],
  )
  const reviewColumns = React.useMemo(
    () => createReviewColumns((record) => onViewAuditDetail(record.id)),
    [onViewAuditDetail],
  )
  const hasOverviewTab = showOverviewTab !== false
  const activeMultiSubTab = !hasOverviewTab && multiSubTab === 'overview' ? 'task' : multiSubTab
  const multiSubTabOptions = [
    hasOverviewTab ? { value: 'overview', label: '任务总览' } : null,
    { value: 'task', label: '标注任务' },
    { value: 'review', label: '审核任务' },
  ].filter(Boolean) as Array<{ value: MultiSubTab, label: string }>

  return (
    <Layout.Content className="machine-annotation-page">
      <div className="mb-6">
        <Title level={3} className="machine-annotation-page-title">
          机器学习标注
        </Title>
        <Text type="secondary" className="machine-annotation-page-desc">
          支持在线标注与多人协同标注。
        </Text>
      </div>

      <Tabs
        activeKey={mainTab}
        onChange={(key) => onMainTabChange(key as MainTab)}
        size="large"
        className="machine-annotation-main-tabs"
        items={[
          {
            key: 'online',
            label: '在线标注',
            children: (
              <div className="machine-annotation-tab-pane">
                <WorkflowSteps steps={workflowSteps} />
                <div className="mb-4 flex justify-end">
                  <Space>
                    <Button className="machine-annotation-refresh-btn" icon={<ReloadOutlined />} onClick={onRefresh}>
                      刷新
                    </Button>
                    <Button className="machine-annotation-create-btn" type="primary" icon={<PlusOutlined />} onClick={onCreate}>
                      创建标注任务
                    </Button>
                  </Space>
                </div>
                <div className="machine-annotation-table-block">
                  <Table
                    className="machine-annotation-table"
                    columns={onlineColumns}
                    dataSource={taskList}
                    rowKey="id"
                    loading={loading}
                    size="middle"
                    scroll={{ x: 'max-content', y: 550 }}
                    pagination={{
                      current: pagination.current,
                      pageSize: pagination.pageSize,
                      total: pagination.total,
                      showTotal: (total) => `共 ${total} 条记录`,
                      onChange: (page, pageSize) => onTaskPageChange(page, pageSize),
                    }}
                  />
                </div>
              </div>
            ),
          },
          {
            key: 'multi-person',
            label: '多人标注',
            children: (
              <div className="machine-annotation-tab-pane">
                <WorkflowSteps steps={workflowSteps} />
                <div className="machine-annotation-sub-tabs mb-4">
                  <div className="mb-4 flex min-h-10 items-center justify-between gap-4 overflow-visible">
                    <Segmented
                      className="machine-annotation-segmented"
                      value={activeMultiSubTab}
                      onChange={(value) => onMultiSubTabChange(value as MultiSubTab)}
                      options={multiSubTabOptions}
                    />
                    <div className="flex shrink-0 items-center gap-[10px]">
                      <Space>
                        <Button className="machine-annotation-refresh-btn" icon={<ReloadOutlined />} onClick={onRefresh}>
                          刷新
                        </Button>
                        {hasOverviewTab && activeMultiSubTab === 'overview' && (
                          <Button className="machine-annotation-create-btn" type="primary" icon={<PlusOutlined />} onClick={onCreate}>
                            创建标注任务
                          </Button>
                        )}
                      </Space>
                    </div>
                  </div>
                  {hasOverviewTab && activeMultiSubTab === 'overview' && (
                    <div className="machine-annotation-table-block">
                      <Table
                        className="machine-annotation-table"
                        columns={overviewColumns}
                        dataSource={overviewList}
                        rowKey="id"
                        loading={overviewLoading}
                        size="middle"
                        scroll={{ x: 'max-content', y: 550 }}
                        pagination={{
                          current: overviewPagination.current,
                          pageSize: overviewPagination.pageSize,
                          total: overviewPagination.total,
                          showTotal: (total) => `共 ${total} 条记录`,
                          onChange: (page, pageSize) => onOverviewPageChange(page, pageSize),
                        }}
                      />
                    </div>
                  )}
                  {activeMultiSubTab === 'task' && (
                    <div className="machine-annotation-table-block">
                      <Table
                        className="machine-annotation-table"
                        columns={multiColumns}
                        dataSource={taskList}
                        rowKey="id"
                        loading={loading}
                        size="middle"
                        scroll={{ x: 'max-content', y: 550 }}
                        pagination={{
                          current: pagination.current,
                          pageSize: pagination.pageSize,
                          total: pagination.total,
                          showTotal: (total) => `共 ${total} 条记录`,
                          onChange: (page, pageSize) => onTaskPageChange(page, pageSize),
                        }}
                      />
                    </div>
                  )}
                  {activeMultiSubTab === 'review' && (
                    <div className="machine-annotation-table-block">
                      <Table
                        className="machine-annotation-table"
                        columns={reviewColumns}
                        dataSource={auditList}
                        rowKey="id"
                        loading={auditLoading}
                        size="middle"
                        scroll={{ x: 'max-content', y: 550 }}
                        pagination={{
                          current: auditPagination.current,
                          pageSize: auditPagination.pageSize,
                          total: auditPagination.total,
                          showTotal: (total) => `共 ${total} 条记录`,
                          onChange: (page, pageSize) => onAuditPageChange(page, pageSize),
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ),
          },
        ]}
      />
    </Layout.Content>
  )
}

export default AnnotationListContent
