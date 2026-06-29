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
          const newTab = value as 'text' | 'image-understanding' | 'image-generation'
          setContentTab(newTab)
          const newSearchParams = new URLSearchParams(searchParams)
          const datasetType = newTab === 'image-understanding'
            ? 'image-understanding'
            : newTab === 'image-generation'
              ? 'image-generation'
              : 'text-generation'
          newSearchParams.set('dataset_type', datasetType)
          setSearchParams(newSearchParams, { replace: true })
        }}
        options={[
          { value: 'text', label: '文本生成' },
          { value: 'image-understanding', label: '图像理解' },
          { value: 'image-generation', label: '图像生成' },
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
