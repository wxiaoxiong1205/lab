import React, { useState } from 'react'
import { Button, Input, Space, Tooltip, Typography, message } from 'antd'
import { CheckOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons'

const { Text } = Typography
const { TextArea } = Input

export type TaskMetadataValue = {
  name: string
  description?: string
}

type TaskMetadataEditorProps = TaskMetadataValue & {
  editable: boolean
  disabledReason?: string
  onSave: (value: TaskMetadataValue) => void | Promise<void>
  onNameClick?: () => void
}

const TaskMetadataEditor: React.FC<TaskMetadataEditorProps> = ({
  name,
  description,
  editable,
  disabledReason = '当前任务状态不支持编辑名称和描述',
  onSave,
  onNameClick,
}) => {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(name)
  const [draftDescription, setDraftDescription] = useState(description ?? '')
  const [saving, setSaving] = useState(false)

  const beginEdit = () => {
    if (!editable) {
      return
    }
    setDraftName(name)
    setDraftDescription(description ?? '')
    setEditing(true)
  }

  const cancelEdit = () => {
    setDraftName(name)
    setDraftDescription(description ?? '')
    setEditing(false)
  }

  const save = async () => {
    const nextName = draftName.trim()
    const nextDescription = draftDescription.trim()

    if (!nextName) {
      message.warning('任务名称不能为空')
      return
    }

    if (nextDescription.length > 300) {
      message.warning('任务描述不能超过 300 字')
      return
    }

    setSaving(true)
    try {
      await onSave({ name: nextName, description: nextDescription })
      setEditing(false)
      message.success('任务信息已更新')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Input
          size="small"
          value={draftName}
          maxLength={80}
          onChange={event => setDraftName(event.target.value)}
          onPressEnter={save}
          placeholder="请输入任务名称"
        />
        <TextArea
          size="small"
          value={draftDescription}
          rows={2}
          maxLength={300}
          showCount
          onChange={event => setDraftDescription(event.target.value)}
          placeholder="请输入任务描述，最多 300 字"
        />
        <Space size={6}>
          <Button type="primary" size="small" icon={<CheckOutlined />} loading={saving} onClick={save}>
            保存
          </Button>
          <Button size="small" icon={<CloseOutlined />} disabled={saving} onClick={cancelEdit}>
            取消
          </Button>
        </Space>
      </Space>
    )
  }

  const nameNode = onNameClick ? (
    <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontWeight: 600 }} onClick={onNameClick}>
      {name}
    </Button>
  ) : (
    <Text strong style={{ color: '#0f172a' }}>{name}</Text>
  )

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {nameNode}
        </div>
        <Tooltip title={editable ? '编辑任务名称和描述' : disabledReason}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            disabled={!editable}
            onClick={beginEdit}
            style={{ flex: '0 0 auto', color: editable ? '#1677ff' : undefined }}
          />
        </Tooltip>
      </div>
      <Tooltip title={description || '暂无描述'}>
        <Text
          type="secondary"
          style={{
            display: 'block',
            marginTop: 3,
            fontSize: 12,
            maxWidth: 280,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {description || '暂无描述'}
        </Text>
      </Tooltip>
    </div>
  )
}

export default TaskMetadataEditor
