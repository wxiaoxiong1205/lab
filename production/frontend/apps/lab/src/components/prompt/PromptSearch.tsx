import React from 'react'
import { Button, Card, Form, Input, Select, Space } from 'antd'
import { ClearOutlined, SearchOutlined } from '@ant-design/icons'
import useI18n from '../../hooks/useI18n'

const { Option } = Select
interface PromptSearchProps {
  selectedTags: number[]
  searchTitle: string
  searchContent: string
  onTagsChange: (tags: number[]) => void
  onTitleChange: (title: string) => void
  onContentChange: (content: string) => void
  onSearch: () => void
  onClear: () => void
}
const PromptSearch: React.FC<PromptSearchProps> = ({ selectedTags, searchTitle, searchContent, onTagsChange, onTitleChange, onContentChange, onSearch, onClear }) => {
  const { t } = useI18n()
  return (
    <Card className="mb-4">
      <Form className="mb-[16px]" layout="inline">
        <Form.Item label={t('prompt.keyword')}>
          <Input placeholder={t('prompt.keywordPlaceholder')} value={searchTitle} onChange={(e) => onTitleChange(e.target.value)} className="w-[200px]" />
        </Form.Item>

        <Form.Item label={t('prompt.content')}>
          <Input placeholder={t('prompt.contentPlaceholder')} value={searchContent} onChange={(e) => onContentChange(e.target.value)} className="w-[200px]" />
        </Form.Item>

        <Form.Item>
          <Space>
            <Button type="primary" icon={<SearchOutlined />} onClick={onSearch}>
              {t('prompt.search')}
            </Button>
            <Button icon={<ClearOutlined />} onClick={onClear}>
              {t('prompt.clear')}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  )
}
export default PromptSearch
