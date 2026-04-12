import React, { useState } from 'react'
import { message, Modal, Form, Input, Select, Button, Typography, Space, Divider, Descriptions, Tag } from 'antd'
import { BookOutlined, PlusOutlined, CloudUploadOutlined } from '@ant-design/icons'
import SharedListPage from '../../components/Shared/SharedListPage'
import type { ColumnsType } from 'antd/es/table'

const { Text } = Typography

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
  const [data] = useState(mockModels)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<MLModelRecord | null>(null)

  const columns: ColumnsType<MLModelRecord> = [
    {
      title: '模型名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <Text strong style={{ color: '#0f172a' }}>{name}</Text>
      ),
    },
    {
      title: '模型类型',
      dataIndex: 'modelType',
      key: 'modelType',
      render: (val: string) => {
        const t = modelTypeMap[val] || { color: 'default', label: val }
        return <Tag color={t.color}>{t.label}</Tag>
      },
    },
    {
      title: '基础模型',
      dataIndex: 'baseModel',
      key: 'baseModel',
      render: (val: string) => <Text type="secondary">{val}</Text>,
    },
    {
      title: '版本数量',
      dataIndex: 'versionCount',
      key: 'versionCount',
      render: (val: number) => (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 32,
          height: 28,
          padding: '0 10px',
          background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
          borderRadius: 14,
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
        }}>
          {val} 个版本
        </span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => {
        const s = statusMap[val] || { color: 'default', label: val }
        return <Tag color={s.color}>{s.label}</Tag>
      },
    },
    { title: '创建人', dataIndex: 'creator', key: 'creator' },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
  ]

  const handleOpenDetail = (record: MLModelRecord) => {
    setSelectedRecord(record)
    setDetailModalVisible(true)
  }

  const handleCloseDetail = () => {
    setDetailModalVisible(false)
    setSelectedRecord(null)
  }

  const handleDeploy = (record: MLModelRecord) => {
    message.success(`部署模型: ${record.name}`)
  }

  return (
    <>
      <SharedListPage
        title="机器学习模型管理"
        titleIcon={<BookOutlined style={{ color: '#fff', fontSize: 18 }} />}
        subtitle="管理机器学习模块训练产生的模型，支持版本追溯和部署配置"
        searchPlaceholder="搜索模型名称"
        searchField="name"
        columns={columns}
        dataSource={data}
        showCreateButton={false}
        onRefresh={() => message.success('刷新成功')}
        emptyText="暂无模型"
        actionButtons={[
          { label: '部署', onClick: handleDeploy, disabled: (record: MLModelRecord) => record.status === 'deployed' },
          { label: '查看详情', onClick: handleOpenDetail },
          { label: '删除', danger: true, onClick: () => message.success('删除成功') },
        ]}
      />

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <BookOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>模型详情</span>
          </div>
        }
        open={detailModalVisible}
        onCancel={handleCloseDetail}
        width={640}
        footer={
          <Space>
            <Button onClick={handleCloseDetail}>关闭</Button>
            {selectedRecord && selectedRecord.status !== 'deployed' && (
              <Button type="primary" icon={<CloudUploadOutlined />} style={{ background: '#4f46e5' }} onClick={() => { handleCloseDetail(); handleDeploy(selectedRecord); }}>
                部署
              </Button>
            )}
          </Space>
        }
      >
        {selectedRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="模型名称" span={2}>{selectedRecord.name}</Descriptions.Item>
            <Descriptions.Item label="模型类型">
              {modelTypeMap[selectedRecord.modelType]?.label || selectedRecord.modelType}
            </Descriptions.Item>
            <Descriptions.Item label="基础模型">{selectedRecord.baseModel}</Descriptions.Item>
            <Descriptions.Item label="版本数量">{selectedRecord.versionCount}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusMap[selectedRecord.status]?.color}>{statusMap[selectedRecord.status]?.label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="创建人">{selectedRecord.creator}</Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>{selectedRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default MLModelManagement