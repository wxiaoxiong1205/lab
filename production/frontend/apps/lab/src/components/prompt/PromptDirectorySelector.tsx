import React from 'react'
import { Select } from 'antd'
import { FolderOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { promptDirectoryApi } from '../../services/api'
import type { PromptDirectory } from '../../types'

interface PromptDirectorySelectorProps {
  projectId: number
  value?: number | null
  onChange?: (value: number | null) => void
  width?: number | string
  placeholder?: string
}

const PromptDirectorySelector: React.FC<PromptDirectorySelectorProps> = ({
  projectId,
  value,
  onChange,
  width = '100%',
  placeholder = '选择提示词目录',
}) => {
  const { t } = useTranslation()

  // 获取目录列表
  const { data: directories = [], isLoading } = useQuery({
    queryKey: ['promptDirectories', projectId],
    queryFn: () =>
      promptDirectoryApi
        .list(projectId, { page: 1, size: 99 }) // 目前超出 99 后端有判断会报错
        .then((res) => res.items),
    enabled: Boolean(projectId),
  })

  // 处理Select变化
  const handleChange = (directoryId: number | null) => {
    if (onChange) {
      onChange(directoryId)
    }
  }

  return (
    <Select
      style={{ width }}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      allowClear
      loading={isLoading}
      optionLabelProp="label"
    >
      {directories.map((directory: PromptDirectory) => (
        <Select.Option
          key={directory.id}
          value={directory.id}
          label={directory.name}
        >
          <div className="flex items-center">
            <FolderOutlined className="mr-2" />
            {directory.name}
            {directory.prompt_count > 0 && (
              <span className="text-[var(--lab-color-text-muted)] ml-2">
                (
                {directory.prompt_count}
                )
              </span>
            )}
          </div>
        </Select.Option>
      ))}
    </Select>
  )
}

export default PromptDirectorySelector
