import type React from 'react'
import type { ButtonProps, FormInstance, FormItemProps, TableProps } from 'antd'
import type { ColumnType } from 'antd/es/table'

export type CrudPrimitive = string | number | boolean | null | undefined
export type CrudFormValue = CrudPrimitive | CrudPrimitive[] | Record<string, any>

export interface CrudRequestPayload {
  page: number
  pageSize: number
  searchValues: Record<string, any>
  extraParams?: Record<string, any>
}

export interface CrudRequestConfig {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  params?: Record<string, any>
  data?: Record<string, any>
  headers?: Record<string, string>
}

export interface CrudRequestAdapter {
  (config: CrudRequestConfig): Promise<any>
}

export interface CrudResponseMapping {
  list?: string
  total?: string
  page?: string
  pageSize?: string
}

export interface CrudNormalizedResponse<TData = Record<string, any>> {
  list: TData[]
  total: number
  page?: number
  pageSize?: number
  raw: unknown
}

export type CrudResponseMapper<TData = Record<string, any>, TResponse = unknown>
  = CrudResponseMapping | ((response: TResponse) => CrudNormalizedResponse<TData>)

export interface CrudQueryConfig {
  key?: string
  enabled?: boolean
  staleTime?: number
}

export interface CrudSearchFieldOption {
  label: React.ReactNode
  value: string | number | boolean
  disabled?: boolean
}

interface CrudBaseFieldSchema {
  key: string
  label?: React.ReactNode
  initialValue?: CrudFormValue
  hidden?: boolean
  formItemProps?: Omit<FormItemProps, 'name' | 'label' | 'children'>
  colSpan?: number
}

export interface CrudInputFieldSchema extends CrudBaseFieldSchema {
  type: 'input'
  props?: Record<string, any>
}

export interface CrudSelectFieldSchema extends CrudBaseFieldSchema {
  type: 'select'
  options?: CrudSearchFieldOption[]
  props?: Record<string, any>
}

export interface CrudDatePickerFieldSchema extends CrudBaseFieldSchema {
  type: 'datePicker'
  props?: Record<string, any>
}

export interface CrudRangePickerFieldSchema extends CrudBaseFieldSchema {
  type: 'rangePicker'
  props?: Record<string, any>
}

export interface CrudCustomFieldSchema extends CrudBaseFieldSchema {
  type: 'custom'
  render: (context: { form: FormInstance }) => React.ReactNode
}

export type CrudSearchFieldSchema =
  | CrudInputFieldSchema
  | CrudSelectFieldSchema
  | CrudDatePickerFieldSchema
  | CrudRangePickerFieldSchema
  | CrudCustomFieldSchema

export interface CrudActionSchema extends Omit<ButtonProps, 'onClick' | 'children'> {
  key: string
  label: React.ReactNode
  actionKey?: string
  placement?: 'beforeReset' | 'afterReset'
  hidden?: boolean
}

export interface CrudActionHandlerContext<TData = Record<string, any>> {
  reload: () => Promise<TData[]>
  reset: () => void
  getDataSource: () => TData[]
  getSearchValues: () => Record<string, any>
}

export type CrudActionHandlers<TData = Record<string, any>> = Record<
  string,
  (context: CrudActionHandlerContext<TData>) => void | Promise<void>
>

export interface CrudDataRequest {
  url: string
  method?: 'GET' | 'POST'
  requestAdapter: CrudRequestAdapter
  staticParams?: Record<string, any>
  headers?: Record<string, string>
  buildParams?: (payload: CrudRequestPayload) => Record<string, any>
  buildData?: (payload: CrudRequestPayload) => Record<string, any>
}

export interface CrudTablePagination {
  current: number
  pageSize: number
  total: number
}

export interface DeepSearchTableRef<TData = Record<string, any>> {
  reload: () => Promise<TData[]>
  reset: () => void
  getDataSource: () => TData[]
  getSearchValues: () => Record<string, any>
  setPage: (page: number, pageSize?: number) => void
}

export interface DeepSearchTableConfig<TData = Record<string, any>, TResponse = unknown> {
  title?: React.ReactNode
  searchFields?: CrudSearchFieldSchema[]
  searchInitialValues?: Record<string, any>
  columns: ColumnType<TData>[]
  rowKey: TableProps<TData>['rowKey']
  toolbarActions?: CrudActionSchema[]
  extraActions?: CrudActionSchema[]
  actionHandlers?: CrudActionHandlers<TData>
  request: CrudDataRequest
  responseMapper?: CrudResponseMapper<TData, TResponse>
  extraParams?: Record<string, any>
  queryConfig?: CrudQueryConfig
  pagination?: Partial<CrudTablePagination>
  showSearchButton?: boolean
  searchButtonText?: React.ReactNode
  resetButtonText?: React.ReactNode
  onDataLoaded?: (payload: CrudNormalizedResponse<TData>) => void
  tableProps?: Omit<TableProps<TData>, 'columns' | 'dataSource' | 'rowKey' | 'loading' | 'pagination'>
  beforeRequest?: (payload: CrudRequestPayload) => CrudRequestPayload
}

export interface DeepSearchTableProps<TData = Record<string, any>, TResponse = unknown>
  extends Partial<DeepSearchTableConfig<TData, TResponse>> {
  config?: DeepSearchTableConfig<TData, TResponse>
}

