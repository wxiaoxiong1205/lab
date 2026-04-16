import React, { useState } from 'react'
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
  Tabs,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { AppstoreOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

type MLAnnotationRecord = {
  id: string
  name: string
  count: number
  progress: string
  preDataset: string
  postDataset: string
  creator: string
  createdAt: string
  status: '草稿' | '已完成'
}

const records: MLAnnotationRecord[] = [
  {
    id: '1',
    name: 'hzj_单图多标签_自动标注测试',
    count: 13,
    progress: '0%',
    preDataset: '图像分类/图像分类-多-1-V3',
    postDataset: '-',
    creator: 'lab1',
    createdAt: '2026-04-15 10:04:35',
    status: '草稿',
  },
  {
    id: '2',
    name: 'basion-文本实体识别-a',
    count: 30,
    progress: '7%',
    preDataset: '实体识别/basion-文本实体识别-V1',
    postDataset: '-',
    creator: 'lab1',
    createdAt: '2026-04-15 09:35:59',
    status: '草稿',
  },
  {
    id: '3',
    name: 'hzj_单图多标签',
    count: 13,
    progress: '',
    preDataset: '图像分类/图像分类-多-1-V1',
    postDataset: '图像分类/图像分类-多-1-V3',
    creator: 'lab1',
    createdAt: '2026-04-14 17:43:06',
    status: '已完成',
  },
]

const stepCards = [
  {
    title: '选择数据',
    description: '从已有数据集版本创建在线标注任务或协同标注任务。',
  },
  {
    title: '配置标签',
    description: '根据任务类型维护标签集与模型配置，准备进入标注流程。',
  },
  {
    title: '执行标注',
    description: '支持在线标注、多人分配、审核流转等机器学习标注场景。',
  },
  {
    title: '提交结果',
    description: '保存标注结果并提交，产出可用于训练或复核的数据版本。',
  },
]

const datasetOptions = [
  { value: 'img-v3', label: '图像分类/图像分类-多-1-V3', count: 13 },
  { value: 'entity-v1', label: '实体识别/basion-文本实体识别-V1', count: 30 },
  { value: 'text-v2', label: '文本分类/basion-文本分类-多标签-无标注-V2', count: 25 },
]

const MLAnnotation: React.FC = () => {
  const [form] = Form.useForm()
  const [activeTab, setActiveTab] = useState<'online' | 'multi'>('online')
  const [createOpen, setCreateOpen] = useState(false)
  const [detailRecord, setDetailRecord] = useState<MLAnnotationRecord | null>(null)

  const columns: ColumnsType<MLAnnotationRecord> = [
    { title: '任务名称', dataIndex: 'name', key: 'name' },
    { title: '数据量', dataIndex: 'count', key: 'count', width: 90 },
    { title: '标注进度', dataIndex: 'progress', key: 'progress', width: 110, render: value => value || '-' },
    { title: '标注前数据集', dataIndex: 'preDataset', key: 'preDataset', ellipsis: true },
    { title: '标注后数据集', dataIndex: 'postDataset', key: 'postDataset', ellipsis: true },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 110 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: value => value === '已完成' ? <Tag color="success">已完成</Tag> : <Tag color="default">草稿</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => setDetailRecord(record)}>详情</Button>
          <Button type="link" size="small" danger>删除</Button>
        </Space>
      ),
    },
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
          <Title level={2}>机器学习标注</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
            支持在线标注与多人协同标注。
          </Text>

          <Tabs
            activeKey={activeTab}
            onChange={key => setActiveTab(key as 'online' | 'multi')}
            items={[
              { key: 'online', label: '在线标注' },
              { key: 'multi', label: '多人标注' },
            ]}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 24 }}>
            {stepCards.map(card => (
              <Card key={card.title} style={{ borderRadius: 16, border: '1px solid #e5e7eb', minHeight: 150 }}>
                <Title level={5}>{card.title}</Title>
                <Text type="secondary">{card.description}</Text>
              </Card>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginBottom: 16 }}>
            <Button icon={<ReloadOutlined />}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              创建标注任务
            </Button>
          </div>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={records}
            pagination={{ pageSize: 10, showTotal: total => `共 ${total} 条记录` }}
          />
        </Card>
      </div>

      <Modal
        title="创建标注任务"
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
          <Form.Item label="任务名称" name="name" rules={[{ required: true, message: '请输入任务名称' }]}>
            <Input placeholder="请输入任务名称" />
          </Form.Item>
          <Form.Item label="选择数据集" name="dataset" rules={[{ required: true, message: '请选择数据集' }]}>
            <Select
              placeholder="请选择数据集"
              options={datasetOptions.map(item => ({ value: item.value, label: `${item.label}（${item.count}条）` }))}
            />
          </Form.Item>
          <Form.Item label="标注工具" name="tool" rules={[{ required: true, message: '请选择标注工具' }]}>
            <Select
              options={[
                { value: 'builtin', label: '内置标注工具' },
                { value: 'custom', label: '自定义标注工具' },
              ]}
            />
          </Form.Item>
          <Form.Item label="标注人员" name="annotators">
            <Select
              mode="multiple"
              options={[
                { value: 'lab1', label: 'lab1' },
                { value: 'lab2', label: 'lab2' },
                { value: 'admin', label: 'admin' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="标注任务详情"
        open={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
        footer={<Button onClick={() => setDetailRecord(null)}>关闭</Button>}
      >
        {detailRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="任务名称" span={2}>{detailRecord.name}</Descriptions.Item>
            <Descriptions.Item label="数据量">{detailRecord.count}</Descriptions.Item>
            <Descriptions.Item label="标注进度">{detailRecord.progress || '-'}</Descriptions.Item>
            <Descriptions.Item label="标注前数据集" span={2}>{detailRecord.preDataset}</Descriptions.Item>
            <Descriptions.Item label="标注后数据集" span={2}>{detailRecord.postDataset}</Descriptions.Item>
            <Descriptions.Item label="状态">{detailRecord.status}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{detailRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default MLAnnotation
