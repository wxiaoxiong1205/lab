import React from 'react'
import type { TablePaginationConfig } from 'antd'

/** 表格分页默认展示：从左往右为「共 N 条数据」、每页条数、页码 */
const DEFAULT_PAGE_SIZE_OPTIONS = ['10', '20', '50', '100']

/** 默认 showTotal：共 **N** 条数据 */
export function defaultShowTotal(total: number): React.ReactNode {
  return (
    <>
      共
      {' '}
      <strong>{total}</strong>
      {' '}
      条数据
    </>
  )
}

export interface TablePaginationOptions {
  total: number
  current: number
  pageSize: number
  onChange: (page: number, pageSize: number) => void
  showQuickJumper?: boolean
  pageSizeOptions?: string[]
  /** 自定义总数文案，默认 共 N 条数据 */
  showTotal?: (total: number, range?: [number, number]) => React.ReactNode
}

/**
 * 统一表格分页配置
 * 从左往右：共 N 条数据 → 每页条数选择器 → 页码
 */
export function getTablePagination(options: TablePaginationOptions): TablePaginationConfig {
  const {
    total,
    current,
    pageSize,
    onChange,
    showQuickJumper = false,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
    showTotal = defaultShowTotal,
  } = options

  return {
    total,
    current,
    pageSize,
    onChange,
    showSizeChanger: true,
    showQuickJumper,
    showTotal,
    pageSizeOptions,
  }
}

export { DEFAULT_PAGE_SIZE_OPTIONS }
