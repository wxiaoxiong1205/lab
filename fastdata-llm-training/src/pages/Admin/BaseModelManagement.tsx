import React, { useState } from 'react'
import { message, Modal, Form, Input, Select, Button, Typography, Space, Divider, Checkbox, Descriptions } from 'antd'
import { RobotOutlined, PlusOutlined } from '@ant-design/icons'
import SharedListPage from '../../components/Shared/SharedListPage'
import { mockBaseModels } from '../../data/mockDataAll'
import type { ColumnsType } from 'antd/es/table'
import type { BaseModelRecord } from '../../types/shared'

const { Text } = Typography

// 模型类型选项
const modelTypes = [
  { value: 'LLM', label: 'LLM', description: '大语言模型' },
  { value: 'VLM', label: 'VLM', description: '视觉语言模型' },
  { value: 'ASR', label: 'ASR', description: '语音识别模型' },
  { value: 'Embedding', label: 'Embedding', description: '文本嵌入模型' },
]

// 支持能力选项
const capabilityOptions = [
  { value: 'text_generation', label: '文本生成' },
  { value: 'dialogue', label: '对话' },
  { value: 'code', label: '代码' },
  { value: 'image_understanding', label: '图像理解' },
  { value: 'multimodal', label: '多模态' },
  { value: 'reasoning', label: '推理' },
  { value: 'training', label: '训练' },
  { value: 'inference', label: '推理' },
]

// 模型提供商选项
const providerOptions = [
  { value: 'aliyun', label: '阿里云' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'local', label: '本地部署' },
]

const BaseModelManagement: React.FC = () => {
  const [data] = useState<BaseModelRecord[]>(mockBaseModels)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<BaseModelRecord | null>(null)
  const [form] = Form.useForm()

  const columns: ColumnsType<BaseModelRecord> = [
    { title: '模型Code', dataIndex: 'code', key: 'code', render: (val: string) => (
      <Text code style={{ fontSize: 11 }}>{val}</Text>
    )},
    { title: '模型名称', dataIndex: 'name', key: 'name' },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: '模型类型', dataIndex: 'type', key: 'type', render: (val: string) => (
      <Text style={{ color: '#4f46e5', fontWeight: 500 }}>{val}</Text>
    )},
    { title: '提供商', dataIndex: 'provider', key: 'provider' },
    {
      title: '支持能力',
      dataIndex: 'capabilities',
      key: 'capabilities',
      render: (vals: string[] | undefined) => vals?.map(c => (
        <Text key={c} style={{ marginRight: 4, padding: '2px 6px', background: 'rgba(79, 70, 229, 0.08)', borderRadius: 4, fontSize: 11, color: '#4f46e5' }}>{c}</Text>
      )),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => (
        <Text style={{ color: val === 'running' ? '#52c41a' : '#999' }}>
          {val === 'running' ? '启动' : '停止'}
        </Text>
      ),
    },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
  ]

  const handleOpenCreate = () => {
    form.resetFields()
    setCreateModalVisible(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('新增基础模型:', values)
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

  const handleOpenDetail = (record: BaseModelRecord) => {
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
        title="基础模型管理"
        titleIcon={<RobotOutlined style={{ color: '#fff', fontSize: 18 }} />}
        subtitle="基础模型管理，支持模型启动、编辑、删除和日志查看"
        searchPlaceholder="请输入模型Code"
        searchField="code"
        columns={columns}
        dataSource={data}
        createButtonText="新增模型"
        onCreate={handleOpenCreate}
        onRefresh={() => message.success('刷新成功')}
        emptyText="暂无基础模型"
        actionButtons={[
          {
            label: '启动',
            onClick: (record: BaseModelRecord) => message.success(`启动模型: ${record.name}`),
            disabled: (record: BaseModelRecord) => record.status === 'running',
          },
          { label: '详情', onClick: handleOpenDetail },
          {
            label: '终止',
            danger: true,
            onClick: (record: BaseModelRecord) => message.success(`终止模型: ${record.name}`),
            disabled: (record: BaseModelRecord) => record.status !== 'running',
          },
          { label: '删除', danger: true, onClick: (record: BaseModelRecord) => message.success(`删除模型: ${record.name}`) },
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
            <span style={{ fontWeight: 600 }}>新增基础模型</span>
          </div>
        }
        open={createModalVisible}
        onCancel={handleCancel}
        width={720}
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
        <Form
          form={form}
          layout="vertical"
        >
          <Divider orientation="horizontal" plain style={{ margin: '0 0 16px 0', color: '#64748b', fontSize: 12 }}>
            基本信息
          </Divider>

          <Form.Item
            label="模型Code"
            name="code"
            rules={[
              { required: true, message: '请输入模型Code' },
              { pattern: /^[a-z0-9-_.]{1,64}$/, message: '支持小写字母、数字、中划线、下划线，1-64字符' }
            ]}
            extra="模型唯一标识，用于API调用"
          >
            <Input placeholder="如：qwen2.5-7b-instruct" />
          </Form.Item>

          <Form.Item
            label="模型名称"
            name="name"
            rules={[
              { required: true, message: '请输入模型名称' },
              { pattern: /^[\u4e00-\u9fa5a-zA-Z0-9_-]{1,64}$/, message: '支持中英文、数字，1-64字符' }
            ]}
          >
            <Input placeholder="如：Qwen2.5-7B-Instruct" />
          </Form.Item>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            模型配置
          </Divider>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item
              label="模型类型"
              name="type"
              rules={[{ required: true, message: '请选择模型类型' }]}
            >
              <Select placeholder="请选择模型类型">
                {modelTypes.map(mt => (
                  <Select.Option key={mt.value} value={mt.value}>
                    <div>
                      <div>{mt.label}</div>
                      <Text type="secondary" style={{ fontSize: 11 }}>{mt.description}</Text>
                    </div>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              label="模型提供商"
              name="provider"
              rules={[{ required: true, message: '请选择模型提供商' }]}
            >
              <Select placeholder="请选择模型提供商">
                {providerOptions.map(p => (
                  <Select.Option key={p.value} value={p.label}>{p.label}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <Form.Item
            label="模型地址"
            name="address"
            rules={[{ required: true, message: '请输入模型文件存储地址' }]}
            extra="模型文件的存储路径或API地址"
          >
            <Input placeholder="如：/data/models/qwen2.5-7b-instruct 或 API地址" />
          </Form.Item>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            支持能力
          </Divider>

          <Form.Item
            label="支持能力"
            name="capabilities"
            rules={[{ required: true, message: '请选择至少一项支持能力' }]}
          >
            <Checkbox.Group style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Space wrap>
                {capabilityOptions.map(opt => (
                  <Checkbox key={opt.value} value={opt.label}>{opt.label}</Checkbox>
                ))}
              </Space>
            </Checkbox.Group>
          </Form.Item>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            其他信息
          </Divider>

          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} placeholder="请输入模型详细描述（可选）" maxLength={200} showCount />
          </Form.Item>
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
              <RobotOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>基础模型详情</span>
          </div>
        }
        open={detailModalVisible}
        onCancel={handleCloseDetail}
        width={640}
        footer={<Button onClick={handleCloseDetail}>关闭</Button>}
      >
        {selectedRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="模型Code" span={2}>
              <Text code>{selectedRecord.code}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="模型名称" span={2}>{selectedRecord.name}</Descriptions.Item>
            <Descriptions.Item label="描述" span={2}>{selectedRecord.description || '-'}</Descriptions.Item>
            <Descriptions.Item label="模型类型">
              <Text style={{ color: '#4f46e5' }}>{selectedRecord.type}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="提供商">{selectedRecord.provider}</Descriptions.Item>
            <Descriptions.Item label="支持能力" span={2}>
              {selectedRecord.capabilities?.map(c => (
                <Text key={c} style={{ marginRight: 6, padding: '2px 8px', background: 'rgba(79, 70, 229, 0.08)', borderRadius: 4, fontSize: 11, color: '#4f46e5' }}>{c}</Text>
              ))}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <span style={{ color: selectedRecord.status === 'running' ? '#52c41a' : '#999' }}>
                {selectedRecord.status === 'running' ? '启动' : '停止'}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="模型地址">
              <Text code style={{ fontSize: 11 }}>{selectedRecord.address || '-'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>{selectedRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default BaseModelManagement
