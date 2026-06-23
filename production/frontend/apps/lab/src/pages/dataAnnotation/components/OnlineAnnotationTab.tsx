import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Segmented } from 'antd'
import React from 'react'
import type { OnlineAnnotationTabProps } from '..'
import { TaskListTable, WorkflowStepsSection } from './common'

/** 在线标注 */
export const OnlineAnnotationTab: React.FC<OnlineAnnotationTabProps> = ({
  contentTab,
  setContentTab,
  searchParams,
  setSearchParams,
  columns,
  taskList,
  loading,
  pagination,
  fetchTaskList,
  handleRefresh,
  handleCreateTask,
  searchValue,
  onSearchChange,
  onSearchPressEnter,
  onSearchReset,
}) => (
  <div className="data-annotation-tab-pane">
    <WorkflowStepsSection />
    <div className="mb-4">
      <Segmented
        className="data-annotation-segmented"
        value={contentTab}
        onChange={(value) => {
          const newTab = value as 'text' | 'image'
          setContentTab(newTab)
          const newSearchParams = new URLSearchParams(searchParams)
          newSearchParams.set('dataset_type', newTab === 'text' ? 'text-generation' : 'image-understanding')
          setSearchParams(newSearchParams, { replace: true })
        }}
        options={[
          { value: 'text', label: '文本标注' },
          { value: 'image', label: '图像标注' },
        ]}
      />
    </div>
    <TaskListTable
      columns={columns}
      taskList={taskList}
      loading={loading}
      pagination={pagination}
      fetchTaskList={fetchTaskList}
      searchValue={searchValue}
      onSearchChange={onSearchChange}
      onSearchPressEnter={onSearchPressEnter}
      // onSearchReset={onSearchReset}
      toolbarExtra={(
        <>
          <Button className="data-annotation-refresh-btn" icon={<ReloadOutlined />} onClick={handleRefresh}>
            刷新
          </Button>
          <Button className="w-[88px]" onClick={onSearchReset}>
            重置
          </Button>
          <Button className="data-annotation-create-btn" type="primary" icon={<PlusOutlined />} onClick={handleCreateTask}>
            创建标注任务
          </Button>
        </>
      )}
    />
  </div>
)
