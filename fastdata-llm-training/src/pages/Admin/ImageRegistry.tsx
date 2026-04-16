import React, { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { AppstoreOutlined, PlusOutlined } from '@ant-design/icons'
import { mockImageRecords } from '../../data/mockDataAll'
import type { ImageRecord } from '../../types/shared'

const { Title } = Typography

const ImageRegistryPage: React.FC = () => {
  const [form] = Form.useForm()
  const [searchValue, setSearchValue] = useState('')
  const [category, setCategory] = useState<string>()
  const [createOpen, setCreateOpen] = useState(false)

  const filteredData = useMemo(
    () =>
      mockImageRecords.filter(item => {
        const matchSearch = !searchValue || item.name.toLowerCase().includes(searchValue.toLowerCase())
        const matchCategory = !category || item.category === category
        return matchSearch && matchCategory
      }),
    [category, searchValue],
  )

  const columns: ColumnsType<ImageRecord> = [
    { title: '镜像名称', dataIndex: 'name', key: 'name' },
    { title: '镜像描述', dataIndex: 'description', key: 'description' },
    { title: '镜像分类', dataIndex: 'category', key: 'category' },
    { title: '镜像仓库', dataIndex: 'registry', key: 'registry' },
    { title: '命名空间', dataIndex: 'namespace', key: 'namespace' },
    { title: '添加时间', dataIndex: 'addedAt', key: 'addedAt' },
  ]

  const submitCreate = async () => {
    try {
      await form.validateFields()
      setCreateOpen(false)
    } catch {
      return
    }
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Card style={{ borderRadius: 20, border: '1px solid #e5e7eb' }}>
          <Title level={2}>镜像列表</Title>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <Space>
              <Input
                placeholder="请输入镜像服务名称"
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                style={{ width: 240 }}
              />
              <Select
                placeholder="镜像分类"
                allowClear
                value={category}
                onChange={value => setCategory(value)}
                style={{ width: 140 }}
                options={[
                  { value: '训练', label: '训练' },
                  { value: '推理', label: '推理' },
                  { value: '基础', label: '基础' },
                ]}
              />
              <Button>搜索</Button>
              <Button onClick={() => { setSearchValue(''); setCategory(undefined) }}>重置</Button>
            </Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建配置
            </Button>
          </div>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredData}
            pagination={{ pageSize: 10 }}
          />
        </Card>
      </div>

      <Modal
        title="新建镜像仓库"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        footer={
          <Space>
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button type="primary" onClick={submitCreate}>创建</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item label="仓库名称" name="name" rules={[{ required: true, message: '请输入仓库名称' }]}>
            <Input placeholder="请输入仓库名称" />
          </Form.Item>
          <Form.Item label="命名空间" name="namespace" rules={[{ required: true, message: '请输入命名空间' }]}>
            <Input placeholder="请输入命名空间" />
          </Form.Item>
          <Form.Item label="仓库地址" name="address" rules={[{ required: true, message: '请输入仓库地址' }]}>
            <Input placeholder="https://harbor.example.com" />
          </Form.Item>
          <Form.Item label="认证方式" name="authType" rules={[{ required: true, message: '请选择认证方式' }]}>
            <Select
              options={[
                { value: '用户名密码', label: '用户名密码' },
                { value: 'Token', label: 'Token' },
                { value: '公开', label: '公开' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default ImageRegistryPage
