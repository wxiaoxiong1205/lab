import React, { useState } from 'react'
import {
  Card,
  Table,
  Button,
  Input,
  Space,
  Typography,
  Tag,
  Progress,
  Modal,
  Tooltip,
} from 'antd'
import type { TableProps } from 'antd/es/table'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

const { Text } = Typography

export interface ActionButton {
  label: string
  icon?: React.ReactNode
  danger?: boolean
  onClick: (record: any) => void
  disabled?: (record: any) => boolean
}

export interface StatusBadge {
  value: string
  color: string
  label?: string
}

export interface SharedListPageProps {
  /** 页面标题 */
  title: string
  /** 标题图标 */
  titleIcon?: React.ReactNode
  /** 标题副标题 */
  subtitle?: string
  /** 搜索框占位文本 */
  searchPlaceholder?: string
  /** 搜索字段名（用于前端过滤） */
  searchField?: string
  /** 表格列配置 */
  columns: ColumnsType<any>
  /** 列表数据 */
  dataSource: any[]
  /** 是否有新建按钮 */
  showCreateButton?: boolean
  /** 新建按钮文本 */
  createButtonText?: string
  /** 新建按钮点击 */
  onCreate?: () => void
  /** 是否有刷新按钮 */
  showRefreshButton?: boolean
  /** 刷新回调 */
  onRefresh?: () => void
  /** 是否有搜索框 */
  showSearch?: boolean
  /** 是否有重置按钮 */
  showResetButton?: boolean
  /** 表格唯一 key */
  rowKey?: string
  /** 表格加载状态 */
  loading?: boolean
  /** 表格分页配置，false 表示不分页 */
  pagination?: false | { pageSize?: number }
  /** 卡片样式 */
  cardStyle?: React.CSSProperties
  /** 操作列按钮 */
  actionButtons?: ActionButton[]
  /** 状态字段映射 */
  statusMap?: Record<string, { color: string; label: string }>
  /** 进度字段名（若有，渲染进度条） */
  progressField?: string
  /** 工具栏左侧额外筛选插槽（放在搜索框左边） */
  toolbarExtra?: React.ReactNode
  /** 无数据时显示文本 */
  emptyText?: string
  /** 行展开配置 */
  expandable?: TableProps<any>['expandable']
}

const SharedListPage: React.FC<SharedListPageProps> = ({
  title,
  titleIcon,
  subtitle,
  searchPlaceholder = '请输入关键词搜索',
  searchField = 'name',
  columns,
  dataSource,
  showCreateButton = true,
  createButtonText = '新建',
  onCreate,
  showRefreshButton = true,
  onRefresh,
  showSearch = true,
  showResetButton = true,
  rowKey = 'id',
  loading = false,
  pagination = { pageSize: 10 },
  cardStyle,
  actionButtons,
  statusMap,
  progressField,
  emptyText = '暂无数据',
  toolbarExtra,
  expandable,
}) => {
  const [searchValue, setSearchValue] = useState('')

  const filteredData = searchValue
    ? dataSource.filter((item: any) => {
        const val = item[searchField] ?? ''
        return String(val).toLowerCase().includes(searchValue.toLowerCase())
      })
    : dataSource

  const enrichedColumns: ColumnsType<any> = [
    ...columns,
    ...(actionButtons && actionButtons.length > 0
      ? [
          {
            title: '操作',
            key: 'action',
            width: actionButtons.length * 80,
            render: (_: any, record: any) => (
              <Space size={4}>
                {actionButtons.map((btn, idx) => (
                  <Tooltip key={idx} title={btn.label}>
                    <Button
                      type="text"
                      size="small"
                      danger={btn.danger}
                      disabled={btn.disabled?.(record)}
                      onClick={() => btn.onClick(record)}
                    >
                      {btn.label}
                    </Button>
                  </Tooltip>
                ))}
              </Space>
            ),
          },
        ]
      : []),
  ]

  const handleReset = () => setSearchValue('')

  return (
    <div style={{ padding: '28px 32px', minHeight: '100%' }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          {titleIcon && (
            <div
              style={{
                width: 40,
                height: 40,
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
              }}
            >
              {titleIcon}
            </div>
          )}
          <Typography.Title level={3} style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>
            {title}
          </Typography.Title>
        </div>
        {subtitle && (
          <Text type="secondary" style={{ fontSize: 14, marginLeft: titleIcon ? 52 : 0 }}>
            {subtitle}
          </Text>
        )}
      </div>

      {/* 工具栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          gap: 12,
        }}
      >
        {/* 搜索 */}
        <div style={{ display: 'flex', gap: 8, flex: 1, maxWidth: 400, alignItems: 'center' }}>
          {toolbarExtra && <div style={{ display: 'flex', gap: 8 }}>{toolbarExtra}</div>}
          {showSearch && (
            <Input
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              allowClear
              style={{ borderRadius: 8, maxWidth: 280 }}
            />
          )}
          {showSearch && showResetButton && (
            <Button onClick={handleReset} style={{ borderRadius: 8 }}>
              重置
            </Button>
          )}
        </div>

        {/* 右侧按钮 */}
        <Space>
          {showRefreshButton && (
            <Tooltip title="刷新">
              <Button
                icon={<ReloadOutlined />}
                onClick={onRefresh}
                style={{ borderRadius: 8 }}
              />
            </Tooltip>
          )}
          {showCreateButton && onCreate && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={onCreate}
              style={{ borderRadius: 8 }}
            >
              {createButtonText}
            </Button>
          )}
        </Space>
      </div>

      {/* 表格 */}
      <Card
        style={{
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          ...cardStyle,
        }}
        styles={{ body: { padding: 0 } }}
      >
        <Table
          rowKey={rowKey}
          columns={enrichedColumns}
          dataSource={filteredData}
          loading={loading}
          pagination={pagination}
          expandable={expandable}
          locale={{
            emptyText: (
              <div style={{ padding: '48px 0', textAlign: 'center' }}>
                <Text type="secondary">{emptyText}</Text>
              </div>
            ),
          }}
        />
      </Card>
    </div>
  )
}

export default SharedListPage
