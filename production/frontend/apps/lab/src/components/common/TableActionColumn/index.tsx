import React, { useMemo } from 'react'
import { Button, Dropdown, Modal, Popconfirm, Space } from 'antd'
import type { MenuProps } from 'antd'
import {
  ApiOutlined,
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  InfoCircleOutlined,
  MoreOutlined,
  PlayCircleOutlined,
  SaveOutlined,
  SendOutlined,
  StopOutlined,
} from '@ant-design/icons'

const MAX_VISIBLE_DEFAULT = 2

export interface TableActionItem {
  key: string
  label: React.ReactNode
  icon?: React.ReactNode
  onClick?: () => void
  danger?: boolean
  disabled?: boolean
  loading?: boolean
  /** 需要二次确认时使用；与 onClick 二选一 */
  confirm?: {
    title: React.ReactNode
    description?: React.ReactNode
    okText?: string
    cancelText?: string
    onConfirm: () => void | Promise<void>
  }
  /** 为 false 时不展示 */
  visible?: boolean
}

export interface TableActionColumnProps {
  /** 操作项列表 */
  actions: TableActionItem[]
  /** 首屏可见按钮数量，超出部分放入「更多」 */
  maxVisible?: number
  moreLabel?: React.ReactNode
}

const linkBtnStyle: React.CSSProperties = {
  padding: 0,
  height: 'auto',
  background: 'none',
  border: 'none',
}

function getDefaultActionIcon(item: TableActionItem) {
  const label = typeof item.label === 'string' ? item.label : ''
  const key = item.key.toLowerCase()
  if (key.includes('view') || key.includes('detail') || label.includes('详情') || label.includes('查看')) return <InfoCircleOutlined />
  if (key.includes('edit') || label.includes('编辑')) return <EditOutlined />
  if (key.includes('delete') || label.includes('删除')) return <DeleteOutlined />
  if (key.includes('start') || label.includes('启动')) return <PlayCircleOutlined />
  if (key.includes('stop') || label.includes('停止')) return <StopOutlined />
  if (key.includes('open') || label.includes('打开')) return <ExportOutlined />
  if (key.includes('save') || label.includes('保存')) return <SaveOutlined />
  if (key.includes('publish') || label.includes('发布')) return <SendOutlined />
  if (key.includes('test') || label.includes('测试')) return <ApiOutlined />
  if (key.includes('visit') || key.includes('info') || label.includes('信息')) return <InfoCircleOutlined />
  return undefined
}

function renderButton(item: TableActionItem, closeDropdown?: () => void) {
  const handleClick = () => {
    if (item.onClick) item.onClick()
    closeDropdown?.()
  }

  const btn = (
    <Button
      type="link"
      size="small"
      icon={item.icon ?? getDefaultActionIcon(item)}
      danger={item.danger}
      disabled={item.disabled}
      loading={item.loading}
      onClick={item.confirm ? undefined : handleClick}
      style={linkBtnStyle}
      className="lab-table-action-link"
    >
      {item.label}
    </Button>
  )

  if (item.confirm) {
    return (
      <Popconfirm
        key={item.key}
        title={item.confirm.title}
        description={item.confirm.description}
        onConfirm={() => {
          item.confirm!.onConfirm()
          closeDropdown?.()
        }}
        okText={item.confirm.okText ?? '确定'}
        cancelText={item.confirm.cancelText ?? '取消'}
        okButtonProps={item.danger ? { danger: true } : undefined}
      >
        <span>{btn}</span>
      </Popconfirm>
    )
  }
  return <React.Fragment key={item.key}>{btn}</React.Fragment>
}

/**
 * 表格操作列通用组件
 * - 超过 maxVisible 个按钮时，只显示前 maxVisible 个，其余放入「...」下拉
 * - 按钮样式统一：纯文字、蓝色链接样式、无图标、无背景
 */
export const TableActionColumn: React.FC<TableActionColumnProps> = ({
  actions,
  maxVisible = MAX_VISIBLE_DEFAULT,
  moreLabel,
}) => {
  const visibleActions = useMemo(
    () => actions.filter((a) => a.visible !== false),
    [actions],
  )

  const { visible, overflow } = useMemo(() => {
    const v = visibleActions.slice(0, maxVisible)
    const o = visibleActions.slice(maxVisible)
    return { visible: v, overflow: o }
  }, [visibleActions, maxVisible])

  const overflowMenuItems: MenuProps['items'] = useMemo(
    () =>
      overflow.map((item) => ({
        key: item.key,
        danger: item.danger,
        disabled: item.disabled,
        icon: item.icon ?? getDefaultActionIcon(item),
        label: item.label,
        onClick: () => {
          if (item.confirm) {
            Modal.confirm({
              title: item.confirm.title,
              content: item.confirm.description,
              okText: item.confirm.okText ?? '确定',
              cancelText: item.confirm.cancelText ?? '取消',
              okButtonProps: item.danger ? { danger: true } : undefined,
              onOk: item.confirm.onConfirm,
            })
          }
          else if (item.onClick) {
            item.onClick()
          }
        },
      })),
    [overflow],
  )

  if (visibleActions.length === 0) return null

  return (
    <Space size={8} wrap={false} className="table-action-column lab-table-action-cell">
      {visible.map((item) => renderButton(item))}
      {overflow.length > 0 && (
        <Dropdown
          menu={{ items: overflowMenuItems }}
          trigger={['click']}
          placement="bottomRight"
        >
          <Button
            type="link"
            size="small"
            style={linkBtnStyle}
            icon={<MoreOutlined />}
            aria-label="更多操作"
            className="lab-table-action-link lab-table-action-more"
          >
            {moreLabel}
          </Button>
        </Dropdown>
      )}
    </Space>
  )
}

export default TableActionColumn
