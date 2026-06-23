import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Button, Card, Col, DatePicker, Form, Input, Row, Select, Space, Table } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { normalizeCrudResponse } from './request'
import { SearchOutlined } from '@ant-design/icons'
import type {
  CrudActionSchema,
  CrudDataRequest,
  CrudNormalizedResponse,
  CrudRequestPayload,
  CrudSearchFieldSchema,
  DeepSearchTableConfig,
  DeepSearchTableProps,
  DeepSearchTableRef,
} from './types'

function removeEmptyValues(payload: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0
      }

      return value !== undefined && value !== null && value !== ''
    }),
  )
}

function buildRequestConfig(request: CrudDataRequest, payload: CrudRequestPayload) {
  const params = {
    ...(request.staticParams ?? {}),
    ...(request.buildParams?.(payload) ?? {
      page: payload.page,
      size: payload.pageSize,
      ...payload.extraParams,
      ...payload.searchValues,
    }),
  }

  const data = request.buildData?.(payload)

  return {
    url: request.url,
    method: request.method ?? 'GET',
    headers: request.headers,
    params: request.method === 'POST' ? undefined : removeEmptyValues(params),
    data: request.method === 'POST'
      ? removeEmptyValues({
          ...params,
          ...(data ?? {}),
        })
      : data,
  }
}

function renderActionButton(action: CrudActionSchema, onClick: () => void) {
  const { label, actionKey: _actionKey, hidden: _hidden, placement: _placement, ...buttonProps } = action

  return (
    <Button
      key={action.key}
      {...buttonProps}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

function renderSearchField(field: CrudSearchFieldSchema, form: any) {
  switch (field.type) {
    case 'input':
      return <Input allowClear prefix={<SearchOutlined />} {...field.props} />
    case 'select':
      return <Select allowClear options={field.options} {...field.props} />
    case 'datePicker':
      return <DatePicker style={{ width: '100%' }} {...field.props} />
    case 'rangePicker':
      return <DatePicker.RangePicker style={{ width: '100%' }} {...field.props} />
    case 'custom':
      return field.render({ form })
    default:
      return null
  }
}

function DeepSearchTableInner<TData = Record<string, any>, TResponse = unknown>(
  props: DeepSearchTableProps<TData, TResponse>,
  ref: React.ForwardedRef<DeepSearchTableRef<TData>>,
) {
  const mergedProps = (props.config ?? props) as DeepSearchTableConfig<TData, TResponse>
  const {
    title,
    searchFields = [],
    searchInitialValues,
    columns,
    rowKey,
    toolbarActions = [],
    extraActions = [],
    actionHandlers = {},
    request,
    responseMapper,
    extraParams,
    queryConfig,
    pagination,
    showSearchButton = true,
    searchButtonText = '查询',
    resetButtonText = '重置',
    onDataLoaded,
    tableProps,
    beforeRequest,
  } = mergedProps

  const [form] = Form.useForm()
  const latestDataSource = useRef<TData[]>([])
  const [searchValues, setSearchValues] = useState<Record<string, any>>(searchInitialValues ?? {})
  const [tablePagination, setTablePagination] = useState({
    current: pagination?.current ?? 1,
    pageSize: pagination?.pageSize ?? 10,
    total: pagination?.total ?? 0,
  })

  useEffect(() => {
    form.setFieldsValue(searchInitialValues ?? {})
  }, [form, searchInitialValues])

  const queryPayload = useMemo<CrudRequestPayload>(() => {
    const payload: CrudRequestPayload = {
      page: tablePagination.current,
      pageSize: tablePagination.pageSize,
      searchValues,
      extraParams,
    }

    return beforeRequest ? beforeRequest(payload) : payload
  }, [beforeRequest, extraParams, searchValues, tablePagination.current, tablePagination.pageSize])

  const queryResult = useQuery({
    queryKey: [
      queryConfig?.key ?? 'deep-search-table',
      request.url,
      queryPayload.page,
      queryPayload.pageSize,
      queryPayload.searchValues,
      queryPayload.extraParams,
    ],
    queryFn: async () => {
      const response = await request.requestAdapter(buildRequestConfig(request, queryPayload))
      return normalizeCrudResponse<TData, TResponse>(response, responseMapper)
    },
    enabled: queryConfig?.enabled ?? true,
    staleTime: queryConfig?.staleTime,
  })

  const normalizedData = queryResult.data as CrudNormalizedResponse<TData> | undefined
  const dataSource = normalizedData?.list ?? []
  latestDataSource.current = dataSource
  const visibleExtraActions = extraActions.filter(action => !action.hidden)
  const extraActionsBeforeReset = visibleExtraActions.filter(action => action.placement === 'beforeReset')
  const extraActionsAfterReset = visibleExtraActions.filter(action => action.placement !== 'beforeReset')

  useEffect(() => {
    if (!normalizedData) {
      return
    }

    setTablePagination(current => ({
      current: normalizedData.page ?? current.current,
      pageSize: normalizedData.pageSize ?? current.pageSize,
      total: normalizedData.total,
    }))
    onDataLoaded?.(normalizedData)
  }, [normalizedData, onDataLoaded])

  const handleSearch = (values: Record<string, any>) => {
    setTablePagination(current => ({
      ...current,
      current: 1,
    }))
    setSearchValues(removeEmptyValues(values))
  }

  const handleReset = () => {
    form.resetFields()
    setTablePagination(current => ({
      ...current,
      current: 1,
    }))
    setSearchValues({})
  }

  const handleReload = async () => {
    const response = await queryResult.refetch()
    return response.data?.list ?? []
  }

  const invokeAction = async (action: CrudActionSchema) => {
    const actionKey = action.actionKey ?? action.key
    const handler = actionHandlers[actionKey]

    if (!handler) {
      return
    }

    await handler({
      reload: handleReload,
      reset: handleReset,
      getDataSource: () => latestDataSource.current,
      getSearchValues: () => form.getFieldsValue(true),
    })
  }

  useImperativeHandle(ref, () => ({
    reload: handleReload,
    reset: handleReset,
    getDataSource: () => latestDataSource.current,
    getSearchValues: () => form.getFieldsValue(true),
    setPage: (page: number, pageSize?: number) => {
      setTablePagination(current => ({
        ...current,
        current: page,
        pageSize: pageSize ?? current.pageSize,
      }))
    },
  }), [form, queryResult])

  return (
    <Card title={title} bordered={false}>
      {searchFields.length > 0 && (
        <Form
          form={form}
          layout="vertical"
          initialValues={searchInitialValues}
          onFinish={handleSearch}
        >
          <Row gutter={[16, 0]} align="bottom" justify="space-between" wrap>
            <Col flex="auto">
              <Row gutter={[16, 0]} align="bottom">
                {searchFields.filter(field => !field.hidden).map(field => (
                  <Col key={field.key} span={field.colSpan ?? 6}>
                    <Form.Item
                      name={field.key}
                      label={field.label}
                      initialValue={field.initialValue}
                      {...field.formItemProps}
                    >
                      {renderSearchField(field, form)}
                    </Form.Item>
                  </Col>
                ))}
              </Row>
            </Col>
            <Col flex="none">
              <Form.Item label=" " colon={false}>
                <Space wrap>
                  {showSearchButton && (
                    <Button type="primary" htmlType="submit">
                      {searchButtonText}
                    </Button>
                  )}
                  {extraActionsBeforeReset.map(action => renderActionButton(action, () => {
                    void invokeAction(action)
                  }))}
                  <Button onClick={handleReset}>
                    {resetButtonText}
                  </Button>
                  {extraActionsAfterReset.map(action => renderActionButton(action, () => {
                    void invokeAction(action)
                  }))}
                </Space>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      )}

      {toolbarActions.filter(action => !action.hidden).length > 0 && (
        <Space wrap style={{ marginTop: searchFields.length > 0 ? 16 : 0, marginBottom: 16 }}>
          {toolbarActions.filter(action => !action.hidden).map(action => renderActionButton(action, () => {
            void invokeAction(action)
          }))}
        </Space>
      )}

      <Table<TData>
        rowKey={rowKey}
        columns={columns}
        dataSource={dataSource}
        loading={queryResult.isLoading || queryResult.isFetching}
        pagination={{
          current: tablePagination.current,
          pageSize: tablePagination.pageSize,
          total: tablePagination.total,
          showSizeChanger: true,
          showTotal: total => `共 ${total} 条`,
          onChange: (page, pageSize) => {
            setTablePagination(current => ({
              ...current,
              current: page,
              pageSize,
            }))
          },
        }}
        {...tableProps}
      />
    </Card>
  )
}

export const DeepSearchTable = forwardRef(DeepSearchTableInner) as <
  TData = Record<string, any>,
  TResponse = unknown,
>(
  props: DeepSearchTableProps<TData, TResponse> & { ref?: React.Ref<DeepSearchTableRef<TData>> }
) => React.ReactElement

