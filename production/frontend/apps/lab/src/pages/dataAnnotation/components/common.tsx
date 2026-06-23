import { Input, Table } from 'antd'
import React, { useMemo, useState } from 'react'
import { SearchOutlined } from '@ant-design/icons'
import type { TaskListTableProps } from '..'
import WorkflowSteps, { type WorkflowStepItem } from '@/components/common/WorkflowSteps'
import { getTablePagination } from '@/utils/tablePagination'
import SvgIcon from '@/components/common/SvgIcon'

export const TaskListTable: React.FC<TaskListTableProps> = ({
  columns,
  taskList,
  loading,
  pagination,
  fetchTaskList,
  toolbarExtra,
  searchPlaceholder = '任务名称',
  searchValue,
  onSearchChange,
  onSearchPressEnter,
}) => {
  const [keyword, setKeyword] = useState('')
  const isRemoteSearch = onSearchChange != null
  const currentKeyword = isRemoteSearch ? (searchValue ?? '') : keyword

  const filteredTaskList = useMemo(() => {
    if (isRemoteSearch) return taskList
    const trimmedKeyword = keyword.trim()
    if (!trimmedKeyword) return taskList

    return taskList.filter((task) => {
      const candidates = [
        task.task_name,
        task.datasetName,
        task.dataset_name,
        task.source_dataset_name,
        task.submit_dataset_name,
      ]
      return candidates.some((value) => String(value ?? '').includes(trimmedKeyword))
    })
  }, [isRemoteSearch, keyword, taskList])

  return (
    <div className="data-annotation-table-block">
      <div className="mb-4 flex min-h-9 items-center justify-between gap-4 overflow-visible">
        <Input
          allowClear
          prefix={<SearchOutlined className="text-[18px] text-[rgba(24,24,25,1)]" />}
          placeholder={searchPlaceholder}
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
        dataSource={filteredTaskList}
        rowKey="id"
        loading={loading}
        scroll={{ x: 'max-content', y: 550 }}
        pagination={getTablePagination({
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: !isRemoteSearch && keyword.trim() ? filteredTaskList.length : pagination.total,
          showTotal: (total) => (
            <>
              共
              {total}
              {' '}
              条
            </>
          ),
          showQuickJumper: true,
          onChange: (page, pageSize) => fetchTaskList(page, pageSize),
        })}
        size="middle"
      />
    </div>
  )
}

// 工作流步骤卡片区域（复用）
export const WorkflowStepsSection: React.FC<{ steps?: WorkflowStepItem[] }> = ({
  steps = [
    {
      icon: <SvgIcon name="dataCleanSelect" className="h-10 w-10" />,
      title: '选择数据集',
      description: '从已有数据集中选择或上传新数据',
    },
    {
      icon: <SvgIcon name="dataAnnotationData" className="h-10 w-10" />,
      title: '标注数据',
      description: '使用工具对数据进行精确标注',
    },
    {
      icon: <SvgIcon name="dataAnnotationPublish" className="h-10 w-10" />,
      title: '发布数据集',
      description: '完成标注后发布供模型训练使用',
    },
    {
      icon: <SvgIcon name="dataAnnotationUse" className="h-10 w-10" />,
      title: '使用数据集',
      description: '下载或直接调用标注完成的数据集',
    },
  ],
}) => <WorkflowSteps steps={steps} className="mb-5" />
