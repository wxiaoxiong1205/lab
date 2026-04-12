import React, { useState } from 'react'
import { message, Tag, Modal, Form, Input, Select, Button, Typography, Space, Divider, Descriptions } from 'antd'
import { BookOutlined, PlusOutlined } from '@ant-design/icons'
import SharedListPage from '../../components/Shared/SharedListPage'

const { Text } = Typography

const mockData = [
  { id: '1', name: 'Qwen2.5-7B-Instruct', modelType: 'LLM', baseModel: 'Qwen2.5-7B', versionCount: 3, creator: 'admin', createdAt: '2026/03/20 10:00:00' },
  { id: '2', name: 'Qwen2-VL-2B-Instruct', modelType: 'VLM', baseModel: 'Qwen2-VL-2B', versionCount: 2, creator: 'lab1', createdAt: '2026/03/18 14:30:00' },
  { id: '3', name: 'Qwen2.5-0.5B-LoRA', modelType: 'LLM', baseModel: 'Qwen2.5-0.5B', versionCount: 1, creator: 'admin', createdAt: '2026/03/25 09:00:00' },
]

const modelTypeOptions = [
  { value: 'text_generation', label: '文本生成' },
  { value: 'image_generation', label: '图像生成' },
  { value: 'multimodal', label: '多模态' },
]

const baseModels = [
  { value: 'qwen2.5-7b', label: 'Qwen2.5-7B' },
  { value: 'qwen2.5-1.5b', label: 'Qwen2.5-1.5B' },
  { value: 'qwen2-vl-2b', label: 'Qwen2-VL-2B-Instruct' },
  { value: 'qwen3-8b', label: 'Qwen3-8B' },
  { value: 'llama2-7b', label: 'Llama2-7B' },
]

const ModelManagement: React.FC = () => {
  const [data] = useState(mockData)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<typeof mockData[0] | null>(null)
  const [form] = Form.useForm()

  const handleOpenCreate = () => {
    form.resetFields()
    setCreateModalVisible(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('创建模型:', values)
      message.success('创建成功')
      setCreateModalVisible(false)
      form.resetFields()
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  const handleCancel = () => {
    setCreateModalVisible(false)
    form.resetFields()
  }

  const handleOpenDetail = (record: typeof mockData[0]) => {
    setSelectedRecord(record)
    setDetailModalVisible(true)
  }

  const handleCloseDetail = () => {
    setDetailModalVisible(false)
    setSelectedRecord(null)
  }

  return (
    <>
      <SharedListPage
        title="模型管理"
        titleIcon={<BookOutlined style={{ color: '#fff', fontSize: 18 }} />}
        subtitle="管理所有训练完成的模型，支持模型部署和版本对比"
        searchPlaceholder="搜索模型名称"
        searchField="name"
        columns={[
          { title: '模型名称', dataIndex: 'name', key: 'name' },
          { title: '模型类型', dataIndex: 'modelType', key: 'modelType', render: (val: string) => (
            <Tag color="blue">{val}</Tag>
          )},
          { title: '基础模型', dataIndex: 'baseModel', key: 'baseModel' },
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
          { title: '创建人', dataIndex: 'creator', key: 'creator' },
          { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
        ]}
        dataSource={data}
        createButtonText="创建模型"
        onCreate={handleOpenCreate}
        onRefresh={() => message.success('刷新成功')}
        emptyText="暂无模型"
        actionButtons={[
          { label: '详情', onClick: handleOpenDetail },
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
              <PlusOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>创建模型</span>
          </div>
        }
        open={createModalVisible}
        onCancel={handleCancel}
        width={640}
        footer={
          <Space>
            <Button onClick={handleCancel}>取消</Button>
            <Button type="primary" onClick={handleSubmit} style={{ background: '#4f46e5' }}>
              创建
            </Button>
          </Space>
        }
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Divider orientation="horizontal" plain style={{ margin: '0 0 16px 0', color: '#64748b', fontSize: 12 }}>
            基本信息
          </Divider>

          <Form.Item
            label="模型名称"
            name="name"
            rules={[
              { required: true, message: '请输入模型名称' },
              { pattern: /^[\u4e00-\u9fa5a-zA-Z0-9_-]{2,64}$/, message: '支持中英文、数字、下划线、中划线，2-64字符' }
            ]}
            extra="支持中英文、数字、下划线、中划线，2-64字符，不能以下划线或中划线开头"
          >
            <Input placeholder="请输入模型名称" maxLength={64} showCount />
          </Form.Item>

          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="请输入模型描述（可选）" maxLength={200} showCount />
          </Form.Item>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            模型配置
          </Divider>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item
              label="模型来源"
              name="modelSource"
              rules={[{ required: true, message: '请选择模型来源' }]}
            >
              <Select placeholder="请选择模型来源">
                <Select.Option value="trained">大模型训练</Select.Option>
                <Select.Option value="notebook">Notebook</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              label="模型类型"
              name="modelType"
              rules={[{ required: true, message: '请选择模型类型' }]}
            >
              <Select placeholder="请选择模型类型">
                {modelTypeOptions.map(mt => (
                  <Select.Option key={mt.value} value={mt.label}>{mt.label}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <Form.Item
            label="基础模型"
            name="baseModel"
            rules={[{ required: true, message: '请选择基础模型' }]}
          >
            <Select placeholder="请选择基础模型" showSearch>
              {baseModels.map(bm => (
                <Select.Option key={bm.value} value={bm.label}>{bm.label}</Select.Option>
              ))}
            </Select>
          </Form.Item>

          <div style={{
            background: '#f8fafc',
            borderRadius: 8,
            padding: '12px 16px',
            border: '1px solid #e2e8f0'
          }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <BookOutlined style={{ marginRight: 6 }} />
              提示：创建模型后可将此模型部署为在线服务
            </Text>
          </div>
        </Form>
      </Modal>

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
        footer={<Button onClick={handleCloseDetail}>关闭</Button>}
      >
        {selectedRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="模型名称" span={2}>{selectedRecord.name}</Descriptions.Item>
            <Descriptions.Item label="模型类型">
              <Tag color="blue">{selectedRecord.modelType}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="基础模型">{selectedRecord.baseModel}</Descriptions.Item>
            <Descriptions.Item label="版本数量">
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
                {selectedRecord.versionCount} 个版本
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="创建人">{selectedRecord.creator}</Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>{selectedRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default ModelManagement