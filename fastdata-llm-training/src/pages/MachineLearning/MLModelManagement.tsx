import React, { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { BookOutlined, CloudUploadOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

interface MLModelRecord {
  id: string
  name: string
  modelType: 'LLM' | 'VLM' | 'ASR' | 'Embedding'
  baseModel: string
  versionCount: number
  status: 'training' | 'deployed' | 'archived'
  creator: string
  createdAt: string
}

const modelTypeMap: Record<string, { color: string; label: string }> = {
  LLM: { color: 'blue', label: '大语言模型' },
  VLM: { color: 'purple', label: '视觉语言模型' },
  ASR: { color: 'cyan', label: '语音识别' },
  Embedding: { color: 'orange', label: '向量嵌入' },
}

const statusMap: Record<string, { color: string; label: string }> = {
  training: { color: 'processing', label: '训练中' },
  deployed: { color: 'success', label: '已部署' },
  archived: { color: 'default', label: '已归档' },
}

const mockModels: MLModelRecord[] = [
  { id: '1', name: '图像分类模型-v1', modelType: 'VLM', baseModel: 'ResNet50', versionCount: 2, status: 'deployed', creator: 'admin', createdAt: '2026/03/20 10:00:00' },
  { id: '2', name: '情感分析模型', modelType: 'LLM', baseModel: 'BERT-base', versionCount: 1, status: 'training', creator: 'lab1', createdAt: '2026/03/18 14:30:00' },
  { id: '3', name: 'NER命名实体识别', modelType: 'LLM', baseModel: 'RoBERTa', versionCount: 3, status: 'deployed', creator: 'admin', createdAt: '2026/03/25 09:00:00' },
  { id: '4', name: '语音识别模型', modelType: 'ASR', baseModel: 'Whisper-base', versionCount: 1, status: 'archived', creator: 'lab2', createdAt: '2026/03/15 11:00:00' },
]

const MLModelManagement: React.FC = () => {
  const [modelTypeFilter, setModelTypeFilter] = useState<string>()
  const [detailRecord, setDetailRecord] = useState<MLModelRecord | null>(null)

  const filteredData = useMemo(
    () => mockModels.filter(item => !modelTypeFilter || item.modelType === modelTypeFilter),
    [modelTypeFilter],
  )

  const columns: ColumnsType<MLModelRecord> = [
    { title: '模型名称', dataIndex: 'name', key: 'name' },
    {
      title: '模型类型',
      dataIndex: 'modelType',
      key: 'modelType',
      render: value => {
        const item = modelTypeMap[value]
        return <Tag color={item.color}>{item.label}</Tag>
      },
    },
    { title: '基础模型', dataIndex: 'baseModel', key: 'baseModel' },
    {
      title: '版本数量',
      dataIndex: 'versionCount',
      key: 'versionCount',
      width: 120,
      render: value => <Text strong>{value}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: value => {
        const item = statusMap[value]
        return <Tag color={item.color}>{item.label}</Tag>
      },
    },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 110 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170 },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space size={0}>
          <Button type="link" size="small" disabled={record.status === 'deployed'}>部署</Button>
          <Button type="link" size="small" onClick={() => setDetailRecord(record)}>查看详情</Button>
          <Button type="link" size="small" danger>删除</Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Card style={{ borderRadius: 20, border: '1px solid #e5e7eb' }}>
          <Title level={2}>机器学习模型管理</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
            当前生产环境入口不稳定，先保留机器学习模型管理的可演示实现。
          </Text>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
            <Space>
              <Select
                placeholder="模型类型"
                allowClear
                value={modelTypeFilter}
                onChange={value => setModelTypeFilter(value)}
                style={{ width: 160 }}
                options={[
                  { value: 'LLM', label: '大语言模型' },
                  { value: 'VLM', label: '视觉语言模型' },
                  { value: 'ASR', label: '语音识别' },
                ]}
              />
              <Button>刷新</Button>
            </Space>
          </div>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredData}
            pagination={{ pageSize: 10, showTotal: total => `共 ${total} 条记录` }}
          />
        </Card>
      </div>

      <Modal
        title="模型详情"
        open={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
        footer={
          <Space>
            <Button onClick={() => setDetailRecord(null)}>关闭</Button>
            {detailRecord && detailRecord.status !== 'deployed' && (
              <Button type="primary" icon={<CloudUploadOutlined />}>部署</Button>
            )}
          </Space>
        }
      >
        {detailRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="模型名称" span={2}>{detailRecord.name}</Descriptions.Item>
            <Descriptions.Item label="模型类型">{modelTypeMap[detailRecord.modelType].label}</Descriptions.Item>
            <Descriptions.Item label="基础模型">{detailRecord.baseModel}</Descriptions.Item>
            <Descriptions.Item label="版本数量">{detailRecord.versionCount}</Descriptions.Item>
            <Descriptions.Item label="状态">{statusMap[detailRecord.status].label}</Descriptions.Item>
            <Descriptions.Item label="创建人">{detailRecord.creator}</Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>{detailRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default MLModelManagement
