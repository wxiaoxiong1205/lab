import React from 'react'
import { Button, Card, Empty, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { AppstoreOutlined, PlusOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

type AnnotationServiceRecord = {
  id: string
  name: string
  tool: string
  targetDataset: string
  status: '运行中' | '已停止'
  creator: string
  createdAt: string
}

const services: AnnotationServiceRecord[] = [
  {
    id: 'svc-1',
    name: '图像分类在线标注服务',
    tool: '内置标注工具',
    targetDataset: '图像分类/图像分类-多-1-V3',
    status: '运行中',
    creator: 'lab1',
    createdAt: '2026/04/15 11:05:00',
  },
]

const MLAnnotationService: React.FC = () => {
  const columns: ColumnsType<AnnotationServiceRecord> = [
    { title: '服务名称', dataIndex: 'name', key: 'name' },
    { title: '标注工具', dataIndex: 'tool', key: 'tool' },
    { title: '目标数据集', dataIndex: 'targetDataset', key: 'targetDataset' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: value => <Tag color={value === '运行中' ? 'success' : 'default'}>{value}</Tag>,
    },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 110 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170 },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: () => (
        <Space size={0}>
          <Button type="link" size="small">停止</Button>
          <Button type="link" size="small">查看详情</Button>
          <Button type="link" size="small" danger>删除</Button>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: '28px 32px', minHeight: '100%' }}>
      <Card style={{ borderRadius: 20, border: '1px solid #e5e7eb' }}>
        <Title level={2}>在线标注服务</Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
          当前生产环境未提供稳定独立入口，先保留在线标注服务的可演示实现，承接机器学习标注的后续服务化能力。
        </Text>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />}>创建服务</Button>
        </div>

        {services.length ? (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={services}
            pagination={{ pageSize: 10, showTotal: total => `共 ${total} 条记录` }}
          />
        ) : (
          <Empty description="暂无在线标注服务" />
        )}
      </Card>
    </div>
  )
}

export default MLAnnotationService
