import React, { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { AppstoreOutlined, PlusOutlined } from '@ant-design/icons'
import { mockImageRegistries } from '../../data/mockDataAll'
import type { ImageRegistry } from '../../types/shared'

const { Title, Text } = Typography

const ImageRegistryPage: React.FC = () => {
  const [form] = Form.useForm()
  const [searchValue, setSearchValue] = useState('')
  const [authType, setAuthType] = useState<string>()
  const [createOpen, setCreateOpen] = useState(false)
  const [detailRecord, setDetailRecord] = useState<ImageRegistry | null>(null)
  const [rows, setRows] = useState<ImageRegistry[]>(mockImageRegistries)

  const filteredData = useMemo(
    () =>
      rows.filter(item => {
        const matchSearch =
          !searchValue ||
          item.name.toLowerCase().includes(searchValue.toLowerCase()) ||
          item.address.toLowerCase().includes(searchValue.toLowerCase())
        const matchAuthType = !authType || item.authType === authType
        return matchSearch && matchAuthType
      }),
    [authType, rows, searchValue],
  )

  const columns: ColumnsType<ImageRegistry> = [
    { title: '仓库名称', dataIndex: 'name', key: 'name' },
    { title: '命名空间', dataIndex: 'namespace', key: 'namespace' },
    { title: '仓库地址', dataIndex: 'address', key: 'address', render: value => <Text code>{value}</Text> },
    { title: '认证方式', dataIndex: 'authType', key: 'authType' },
    { title: '管理地址', dataIndex: 'adminAddress', key: 'adminAddress', render: value => value || '-' },
    { title: '绑定集群', dataIndex: 'boundClusterCount', key: 'boundClusterCount', width: 90, render: value => value ?? 0 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: value => <Tag color={value === 'normal' ? 'success' : 'error'}>{value === 'normal' ? '连接正常' : '异常'}</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_, record) => (
        <Space size={0}>
          <Button type="link" size="small">测试连接</Button>
          <Button type="link" size="small" onClick={() => setDetailRecord(record)}>查看详情</Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={() => {
              setRows(previous => previous.filter(item => item.id !== record.id))
              message.success(`已删除镜像仓库：${record.name}`)
            }}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  const submitCreate = async () => {
    try {
      await form.validateFields()
      const values = form.getFieldsValue()
      setRows(previous => [
        {
          id: `repo-${Date.now()}`,
          name: values.name,
          namespace: values.namespace,
          address: values.address,
          authType: values.authType,
          adminAddress: values.adminAddress,
          boundClusterCount: 0,
          status: 'normal',
          createdAt: new Date().toISOString(),
        },
        ...previous,
      ])
      setCreateOpen(false)
      form.resetFields()
      message.success('镜像仓库已创建')
    } catch {
      return
    }
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Card style={{ borderRadius: 20, border: '1px solid #e5e7eb' }}>
          <Title level={2}>镜像仓库</Title>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <Space>
              <Input
                placeholder="请输入仓库名称或地址"
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                style={{ width: 240 }}
              />
              <Select
                placeholder="认证方式"
                allowClear
                value={authType}
                onChange={value => setAuthType(value)}
                style={{ width: 140 }}
                options={[
                  { value: '用户名密码', label: '用户名密码' },
                  { value: 'Token', label: 'Token' },
                  { value: '公开', label: '公开' },
                ]}
              />
              <Button>搜索</Button>
              <Button onClick={() => { setSearchValue(''); setAuthType(undefined) }}>重置</Button>
            </Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新增
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
          <Form.Item label="管理地址" name="adminAddress">
            <Input placeholder="可选，如：https://harbor.example.com" />
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

      <Modal
        title="镜像仓库详情"
        open={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
        footer={<Button onClick={() => setDetailRecord(null)}>关闭</Button>}
      >
        {detailRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="仓库名称" span={2}>{detailRecord.name}</Descriptions.Item>
            <Descriptions.Item label="命名空间">{detailRecord.namespace || '-'}</Descriptions.Item>
            <Descriptions.Item label="认证方式">{detailRecord.authType || '-'}</Descriptions.Item>
            <Descriptions.Item label="仓库地址" span={2}>{detailRecord.address}</Descriptions.Item>
            <Descriptions.Item label="管理地址" span={2}>{detailRecord.adminAddress || '-'}</Descriptions.Item>
            <Descriptions.Item label="绑定集群">{detailRecord.boundClusterCount ?? 0}</Descriptions.Item>
            <Descriptions.Item label="状态">{detailRecord.status === 'normal' ? '连接正常' : '异常'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default ImageRegistryPage
