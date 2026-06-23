import type { TableColumnType } from 'antd'
import { Button, Modal, Table } from 'antd'
import dayjs from 'dayjs'
import React, { useEffect } from 'react'
import { DASHBOARD_USAGE_API } from '../../apis'
import type { TableRow } from '../../config/types'
import FilterBar from './filter-bar'
import useUsageData from './use-usage-data'
import { useTransform } from '@/locales'

// 临时的AutoTooltip组件
const AutoTooltip: React.FC<{ children: React.ReactNode, ghost?: boolean }> = ({
  children,
  ghost,
}) => {
  return <>{children}</>
}

// 临时的ModalFooter组件
const ModalFooter: React.FC<{ onCancel: () => void, onOk?: () => void }> = ({
  onCancel,
  onOk,
}) => {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
      <Button onClick={onCancel}>取消</Button>
      {onOk && <Button type="primary" onClick={onOk}>确定</Button>}
    </div>
  )
}

// 临时的ScrollerModal组件
const ScrollerModal = Modal

// 临时的导出函数
const exportJsonToExcel = (data: any[], filename: string) => {
  console.log('Export data:', data, filename)
  // 这里可以集成真正的导出功能
}

const ExportData: React.FC<{
  open: boolean
  onCancel: () => void
}> = (props) => {
  const { open, onCancel } = props || {}
  const { $t } = useTransform()

  const {
    init,
    setResult,
    loading,
    result,
    userList,
    modelList,
    query,
    setQuery,
    handleExport,
    handleDateChange,
    handleUsersChange,
    handleModelsChange,
  } = useUsageData<{
    items: TableRow[]
  }>({
    url: DASHBOARD_USAGE_API,
    disabledDate: false,
  })

  const exportTableColumns: TableColumnType[] = [
    {
      title: '序号',
      width: 80,
      render(text: any, row: any, index: number) {
        return index + 1
      },
    },
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      render: (text: any) => {
        return text ? dayjs(text).format('YYYY-MM-DD') : '-'
      },
    },
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      render: (text: any) => {
        return (
          <AutoTooltip ghost>
            <span>{text || '-'}</span>
          </AutoTooltip>
        )
      },
    },
    {
      title: '模型',
      dataIndex: 'model_name',
      key: 'model_name',
      render: (text: any) => {
        return (
          <AutoTooltip ghost>
            <span>{text || '-'}</span>
          </AutoTooltip>
        )
      },
    },
    {
      title: '请求数',
      dataIndex: 'request_count',
      key: 'request_count',
    },
    {
      title: 'Token使用量',
      dataIndex: 'token_count',
      key: 'token_count',
    },
  ]

  const handleLocalExport = () => {
    // 支持多种数据结构
    const items = result?.data?.items || []
    if (items.length) {
      exportJsonToExcel(items, `usage-data-${dayjs().format('YYYY-MM-DD')}`)
    }
  }

  useEffect(() => {
    if (open) {
      init()
    }
  }, [open, init])

  // 支持多种数据结构
  const dataSource = result?.data?.items || []
  const total = Array.isArray(dataSource) ? dataSource.length : 0

  return (
    <ScrollerModal
      title="导出数据"
      open={open}
      onCancel={onCancel}
      width={1000}
      footer={(
        <ModalFooter
          onCancel={onCancel}
          onOk={handleLocalExport}
        />
      )}
    >
      <div style={{ marginBottom: 16 }}>
        <FilterBar
          url={DASHBOARD_USAGE_API}
          query={query}
          userList={userList}
          modelList={modelList}
          disabledDate={false}
          handleDateChange={handleDateChange}
          handleUsersChange={handleUsersChange}
          handleModelsChange={handleModelsChange}
        />
      </div>

      <Table
        columns={exportTableColumns}
        dataSource={Array.isArray(dataSource) ? dataSource : []}
        loading={loading}
        pagination={{
          total,
          pageSize: 50,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条记录`,
        }}
        rowKey={(record, index) => `${index || 0}`}
        scroll={{ y: 400 }}
      />
    </ScrollerModal>
  )
}

export default ExportData
