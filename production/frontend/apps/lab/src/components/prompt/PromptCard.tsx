import React from 'react'
import { Tag as AntTag, Button, Card, Space, Tooltip, Typography } from 'antd'
import { CopyOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { PromptResponse } from '../../types'

const { Paragraph, Text } = Typography

interface PromptCardProps {
  prompt: PromptResponse
  onEdit: (prompt: PromptResponse) => void
  onDelete: (prompt: PromptResponse) => void
  onCopy: (prompt: PromptResponse) => void
}

const PromptCard: React.FC<PromptCardProps> = ({
  prompt,
  onEdit,
  onDelete,
  onCopy,
}) => {
  const { t } = useTranslation()

  return (
    <Card
      title={prompt.title}
      extra={(
        <Space>
          <Tooltip title="复制">
            <Button
              type="text"
              icon={<CopyOutlined />}
              onClick={() => onCopy(prompt)}
            />
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => onEdit(prompt)}
            />
          </Tooltip>
          <Tooltip title="删除">
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => onDelete(prompt)}
            />
          </Tooltip>
        </Space>
      )}
    >
      {prompt.description && (
        <Paragraph type="secondary" ellipsis={{ rows: 2 }}>
          {prompt.description}
        </Paragraph>
      )}

      <Paragraph ellipsis={{ rows: 3 }}>
        {prompt.messages ? JSON.stringify(prompt.messages) : ''}
      </Paragraph>

      <div>
        {prompt.input_variables && prompt.input_variables.length > 0 && (
          <div className="mb-2">
            {Array.isArray(prompt.input_variables)
              ? prompt.input_variables.map((variable) => (
                  <AntTag key={variable} color="blue">
                    {variable}
                  </AntTag>
                ))
              : ''}
          </div>
        )}

        <Text type="secondary" className="text-[12px]">
          创建时间:
          {' '}
          {new Date(prompt.created_at).toLocaleString()}
        </Text>
      </div>
    </Card>
  )
}

export default PromptCard
