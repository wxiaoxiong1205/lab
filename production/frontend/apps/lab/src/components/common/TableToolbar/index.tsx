import React from 'react'
import { Button, Card, Form, Space } from 'antd'
import type { FormInstance } from 'antd'

export interface ToolbarAction {
  key: string
  label: string
  icon?: React.ReactNode
  type?: 'primary' | 'default' | 'dashed' | 'link' | 'text'
  danger?: boolean
  onClick: () => void
  loading?: boolean
  disabled?: boolean
}

export interface TableToolbarProps {
  // 表单实例
  form?: FormInstance
  // 左侧操作按钮（第一排最左侧）
  leftActions?: ToolbarAction[]
  // 搜索区域的表单项（左侧）
  searchFormItems?: React.ReactNode
  // 右侧操作按钮（如刷新、创建等）
  rightActions?: ToolbarAction[]
  // 工具栏按钮（第二排，如新增、删除、导入等）
  toolbarActions?: ToolbarAction[]
  // 表单提交事件
  onSearch?: (values: any) => void
  // 是否显示工具栏（第二排）
  showToolbar?: boolean
  // 自定义类名
  className?: string
}

/**
 * 表格工具栏通用组件
 * 第一排：左侧操作按钮 + 搜索表单项，右侧操作按钮
 * 第二排：工具栏按钮（可选）
 */
export const TableToolbar: React.FC<TableToolbarProps> = ({
  form,
  leftActions = [],
  searchFormItems,
  rightActions = [],
  toolbarActions = [],
  onSearch,
  className = '',
}) => {
  const hasFirstRow = leftActions.length > 0 || (searchFormItems != null && React.Children.count(searchFormItems) > 0) || rightActions.length > 0

  return (
    <div className={className}>
      <div className="mb-4">
        {/* 第一排：左侧操作按钮 + 输入/下拉，右侧搜索/重置 */}
        {hasFirstRow && (
          <Form
            form={form}
            layout="inline"
            onFinish={onSearch}
            className="w-full"
          >
            <div className="flex flex-wrap items-center gap-2 w-full">
              {/* 左侧操作按钮 */}
              {leftActions.length > 0 && (
                <div className="flex gap-2">
                  {leftActions.map((action) => (
                    <Button
                      key={action.key}
                      type={action.type}
                      icon={action.icon}
                      onClick={action.onClick}
                      loading={action.loading}
                      disabled={action.disabled}
                      danger={action.danger}
                      className="rounded-none"
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
              {/* 左侧：输入框、下拉框 */}
              <div className="flex flex-wrap items-center gap-2 flex-1">
                {searchFormItems}
              </div>
              {/* 右侧：搜索、重置、刷新等操控左侧内容的按钮 */}
              {rightActions.length > 0 && (
                <div className="flex gap-2">
                  {rightActions.map((action) => (
                    <Button
                      key={action.key}
                      type={action.type}
                      icon={action.icon}
                      onClick={action.onClick}
                      loading={action.loading}
                      disabled={action.disabled}
                      danger={action.danger}
                      className="rounded-none"
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </Form>
        )}
        {/* 第二排：工具栏（创建、新增、删除等） */}
        {toolbarActions.length > 0 && (
          <div className={hasFirstRow ? 'mt-4 flex gap-2' : 'flex gap-2'}>
            {toolbarActions.map((action) => (
              <Button
                key={action.key}
                type={action.type}
                icon={action.icon}
                onClick={action.onClick}
                loading={action.loading}
                disabled={action.disabled}
                danger={action.danger}
                className="rounded-none"
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default TableToolbar
