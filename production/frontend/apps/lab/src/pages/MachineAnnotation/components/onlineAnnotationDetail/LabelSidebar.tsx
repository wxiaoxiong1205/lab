import React, { useEffect, useMemo, useState } from 'react'
import { Button, Input, Popconfirm, Tooltip, Typography } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import type { SegmentationLabelOption } from './types'

const { Text } = Typography

interface LabelSidebarProps {
  options: SegmentationLabelOption[]
  onAdd: () => void
  onEdit: (option: SegmentationLabelOption) => void
  onRemove: (classId: number) => void | Promise<void>
  hideActions?: boolean
}

const LabelSidebar: React.FC<LabelSidebarProps> = ({
  options,
  onAdd,
  onEdit,
  onRemove,
  hideActions = false,
}) => {
  const [keyword, setKeyword] = useState('')
  const trimmedKeyword = keyword.trim().toLowerCase()
  const filteredOptions = useMemo(() => {
    if (!trimmedKeyword) return options
    return options.filter((option) => option.label.toLowerCase().includes(trimmedKeyword))
  }, [options, trimmedKeyword])

  return (
    <div className="flex min-h-0 flex-col border-r border-[#edf0f5]">
      <div className="flex items-center justify-between px-4 py-4">
        <Text strong>标签栏</Text>
        {!hideActions && <Button type="primary" icon={<PlusOutlined />} onClick={onAdd} />}
      </div>
      <div className="px-4 pb-3">
        <Input
          allowClear
          placeholder="搜索标签"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="space-y-2">
          {filteredOptions.map((option) => (
            <div
              key={`${option.value}-${option.label}`}
              className="flex items-center gap-3 rounded-lg border border-[#e5edf6] bg-white px-3 py-2"
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: option.color }} />
              <div className="min-w-0 flex-1 text-sm text-[#1f2937]">
                <div className="truncate">{option.label}</div>
              </div>
              {!hideActions && (
                <div className="flex items-center">
                  <Tooltip title="编辑标签">
                    <Button
                      type="text"
                      icon={<EditOutlined />}
                      onClick={() => onEdit(option)}
                    />
                  </Tooltip>
                  <Popconfirm
                    title="确认删除该标签？"
                    description="删除标签后，使用该标签的标注区域也会一并删除。"
                    okText="删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => onRemove(option.value)}
                  >
                    <Tooltip title="删除标签">
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                      />
                    </Tooltip>
                  </Popconfirm>
                </div>
              )}
            </div>
          ))}
          {!filteredOptions.length && (
            <div className="rounded-lg border border-dashed border-[#d7deea] bg-[#fafbfc] px-3 py-6 text-center text-sm text-[#94a3b8]">
              未找到匹配标签
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default LabelSidebar
