import React from 'react'
import { Button, Form, Input, Select, Space } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'

interface SearchFormProps {
  onSearch: (values: any) => void
  onReset: () => void
  form: any
}
export const SearchForm: React.FC<SearchFormProps> = ({ onSearch, onReset, form }) => {
  const { t } = useTranslation()
  return (
    <Form
      className="mb-[16px]"
      form={form}
      onFinish={onSearch}
      initialValues={{
        sort_by: 'updated_at',
        sort_order: 'desc',
      }}
      preserve={false}
    >
      <Space wrap>
        <Form.Item name="question" className="mb-0">
          <Input placeholder={t('dataset.nameLabel')} allowClear />
        </Form.Item>
        <Form.Item name="sort_by" className="mb-0">
          <Select className="w-[120px]">
            <Select.Option value="created_at">
              {t('dataset.sortByCreatedAt')}
            </Select.Option>
            <Select.Option value="updated_at">
              {t('dataset.sortByUpdatedAt')}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item name="sort_order" className="mb-0">
          <Select className="w-[90px]">
            <Select.Option value="desc">
              {t('dataset.sortOrderDesc')}
            </Select.Option>
            <Select.Option value="asc">
              {t('dataset.sortOrderAsc')}
            </Select.Option>
          </Select>
        </Form.Item>
        <Form.Item className="mb-0">
          <Space>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
              {t('dataset.search')}
            </Button>
            <Button onClick={onReset}>{t('dataset.reset')}</Button>
          </Space>
        </Form.Item>
      </Space>
    </Form>
  )
}
