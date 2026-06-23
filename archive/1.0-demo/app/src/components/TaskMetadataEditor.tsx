import React, { useState } from 'react'
import { Button, Input, Tooltip, Typography, message } from 'antd'
import { EditOutlined } from '@ant-design/icons'

const { Text } = Typography

type TaskMetadataEditorProps = {
  value?: string
  emptyText?: string
  placeholder?: string
  required?: boolean
  maxLength?: number
  strong?: boolean
  type?: 'default' | 'secondary'
  alwaysShowEdit?: boolean
  disabled?: boolean
  onSave: (value: string) => void | Promise<void>
  onTextClick?: () => void
}

const TaskMetadataEditor: React.FC<TaskMetadataEditorProps> = ({
  value,
  emptyText = '-',
  placeholder = '请输入',
  required = false,
  maxLength = 300,
  strong = false,
  type = 'default',
  alwaysShowEdit = false,
  disabled = false,
  onSave,
  onTextClick,
}) => {
  const displayValue = value?.trim() || ''
  const [hovered, setHovered] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftValue, setDraftValue] = useState(displayValue)
  const [saving, setSaving] = useState(false)

  const beginEdit = () => {
    if (disabled) {
      return
    }
    setDraftValue(displayValue)
    setEditing(true)
  }

  const cancelEdit = () => {
    setDraftValue(displayValue)
    setEditing(false)
  }

  const save = async () => {
    const nextValue = draftValue.trim()

    if (nextValue === displayValue) {
      setEditing(false)
      return
    }

    if (required && !nextValue) {
      message.warning('名称不能为空')
      return
    }

    if (nextValue.length > maxLength) {
      message.warning(`内容不能超过 ${maxLength} 字`)
      return
    }

    setSaving(true)
    try {
      await onSave(nextValue)
      setEditing(false)
      message.success('已更新')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <Input
        size="small"
        value={draftValue}
        maxLength={maxLength}
        onBlur={save}
        onChange={event => setDraftValue(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault()
            cancelEdit()
          }
        }}
        onPressEnter={save}
        placeholder={placeholder}
        disabled={saving}
        autoFocus
        style={{ width: '100%' }}
      />
    )
  }

  const textNode = onTextClick && displayValue ? (
    <Button
      type="link"
      size="small"
      style={{ padding: 0, height: 'auto', maxWidth: '100%', fontWeight: strong ? 600 : undefined }}
      onClick={onTextClick}
    >
      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {displayValue}
      </span>
    </Button>
  ) : (
    <Text
      strong={strong}
      type={type === 'secondary' || !displayValue ? 'secondary' : undefined}
      style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
    >
      {displayValue || emptyText}
    </Text>
  )

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, maxWidth: '100%', width: 'fit-content' }}
    >
      <Tooltip title={displayValue || emptyText}>
        <div style={{ minWidth: 0, flex: '0 1 auto' }}>{textNode}</div>
      </Tooltip>
      <Tooltip title="编辑">
        <Button
          type="text"
          size="small"
          icon={<EditOutlined />}
          onClick={beginEdit}
          disabled={disabled}
          style={{
            flex: '0 0 auto',
            color: '#1677ff',
            opacity: disabled ? 0 : hovered || alwaysShowEdit ? 1 : 0,
            pointerEvents: disabled ? 'none' : hovered || alwaysShowEdit ? 'auto' : 'none',
            transition: 'opacity 0.16s ease',
          }}
        />
      </Tooltip>
    </div>
  )
}

export default TaskMetadataEditor
