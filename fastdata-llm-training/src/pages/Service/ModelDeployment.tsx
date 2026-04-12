import React, { useState } from 'react'
import { message, Modal, Form, Input, Select, Button, Typography, Space, Divider, InputNumber, Switch, Descriptions, Tag } from 'antd'
import { ExperimentOutlined, PlusOutlined } from '@ant-design/icons'
import SharedListPage from '../../components/Shared/SharedListPage'

const { Text } = Typography

// 模型选项
const mockModels = [
  { value: 'model_001', label: 'Qwen2.5-7B-Instruct-V3', source: '训练生成', type: '文本生成' },
  { value: 'model_002', label: 'Qwen2.5-1.5B-Instruct-V2', source: '训练生成', type: '文本生成' },
  { value: 'model_003', label: 'Qwen3-8B-Instruct', source: '基础模型', type: '文本生成' },
  { value: 'model_004', label: 'Qwen2-VL-2B-Instruct', source: '基础模型', type: '图像理解' },
  { value: 'model_005', label: 'Qwen2.5-0.5B-Instruct', source: '基础模型', type: '文本生成' },
]

// 镜像选项
const mockImages = [
  { value: 'vllm_0_6', label: 'vllm:v0.6.3.post1', category: 'vLLM' },
  { value: 'vllm_0_5', label: 'vllm:v0.5.3', category: 'vLLM' },
  { value: 'dgi_1_0', label: 'dgi-server:v1.0.0', category: 'DGI Server' },
  { value: 'dgi_latest', label: 'dgi-server:latest', category: 'DGI Server' },
]

// 显卡类型选项
const gpuTypes = [
  { value: 'A100', label: 'NVIDIA A100' },
  { value: 'V100', label: 'NVIDIA V100' },
  { value: 'T4', label: 'NVIDIA T4' },
  { value: 'H100', label: 'NVIDIA H100' },
]

const mockData = [
  { id: '1', name: '服务名称-7B', modelName: 'Qwen2.5-7B-Instruct', modelSource: '基础模型', instanceCount: 2, status: 'running', creator: 'admin', createdAt: '2026/03/19 11:00:00' },
  { id: '2', name: '服务名称-1.5B', modelName: 'Qwen2.5-1.5B-Instruct', modelSource: '基础模型', instanceCount: 1, status: 'running', creator: 'lab1', createdAt: '2026/03/17 08:30:00' },
]

const ModelDeployment: React.FC = () => {
  const [data] = useState(mockData)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<typeof mockData[0] | null>(null)
  const [form] = Form.useForm()
  const [selectedModel, setSelectedModel] = useState<typeof mockModels[0] | null>(null)

  const handleOpenCreate = () => {
    form.resetFields()
    setSelectedModel(null)
    setCreateModalVisible(true)
  }

  const handleModelChange = (value: string) => {
    const model = mockModels.find(m => m.value === value)
    setSelectedModel(model || null)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('部署服务:', values)
      message.success('部署成功')
      setCreateModalVisible(false)
      form.resetFields()
      setSelectedModel(null)
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  const handleCancel = () => {
    setCreateModalVisible(false)
    form.resetFields()
    setSelectedModel(null)
  }

  const handleOpenDetail = (record: (typeof mockData)[0]) => {
    setSelectedRecord(record)
    setDetailModalVisible(true)
  }

  const handleCloseDetail = () => {
    setDetailModalVisible(false)
    setSelectedRecord(null)
  }

  const handleStart = (record: (typeof mockData)[0]) => {
    message.success(`启动服务: ${record.name}`)
  }

  const handleStop = (record: (typeof mockData)[0]) => {
    message.info(`停止服务: ${record.name}`)
  }

  return (
    <>
      <SharedListPage
        title="模型部署"
        titleIcon={<ExperimentOutlined style={{ color: '#fff', fontSize: 18 }} />}
        subtitle="将训练生成的模型或基础模型部署为在线服务"
        searchPlaceholder="请输入服务名称"
        searchField="name"
        columns={[
          { title: '服务名称', dataIndex: 'name', key: 'name' },
          { title: '模型名称', dataIndex: 'modelName', key: 'modelName' },
          { title: '模型来源', dataIndex: 'modelSource', key: 'modelSource' },
          { title: '实例数', dataIndex: 'instanceCount', key: 'instanceCount' },
          { title: '状态', dataIndex: 'status', key: 'status', render: (val: string) => (
            <span style={{ color: val === 'running' ? '#52c41a' : '#999' }}>{val === 'running' ? '运行中' : '已停止'}</span>
          )},
          { title: '创建人', dataIndex: 'creator', key: 'creator' },
          { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
        ]}
        dataSource={data}
        createButtonText="部署服务"
        onCreate={handleOpenCreate}
        onRefresh={() => message.success('刷新成功')}
        emptyText="暂无部署服务"
        actionButtons={[
          { label: '启动', onClick: handleStart, disabled: (record: (typeof mockData)[0]) => record.status === 'running' },
          { label: '停止', onClick: handleStop, disabled: (record: (typeof mockData)[0]) => record.status !== 'running' },
          { label: '详情', onClick: handleOpenDetail },
          { label: '删除', danger: true, onClick: (record: (typeof mockData)[0]) => message.success(`删除服务: ${record.name}`) },
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
            <span style={{ fontWeight: 600 }}>部署服务</span>
          </div>
        }
        open={createModalVisible}
        onCancel={handleCancel}
        width={720}
        footer={
          <Space>
            <Button onClick={handleCancel}>取消</Button>
            <Button type="primary" onClick={handleSubmit} style={{ background: '#4f46e5' }}>
              部署
            </Button>
          </Space>
        }
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            modelSource: 'trained',
            instanceCount: 1,
          }}
        >
          <Divider orientation="horizontal" plain style={{ margin: '0 0 16px 0', color: '#64748b', fontSize: 12 }}>
            基本信息
          </Divider>

          <Form.Item
            label="服务名称"
            name="name"
            rules={[
              { required: true, message: '请输入服务名称' },
              { pattern: /^[\u4e00-\u9fa5a-zA-Z0-9_-]{2,64}$/, message: '支持中英文、数字、下划线、中划线，2-64字符' }
            ]}
          >
            <Input placeholder="请输入服务名称" maxLength={64} showCount />
          </Form.Item>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            模型配置
          </Divider>

          <Form.Item
            label="模型来源"
            name="modelSource"
            rules={[{ required: true, message: '请选择模型来源' }]}
          >
            <Select placeholder="请选择模型来源">
              <Select.Option value="trained">训练生成</Select.Option>
              <Select.Option value="base">基础模型</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="选择模型"
            name="model"
            rules={[{ required: true, message: '请选择模型' }]}
          >
            <Select
              placeholder="请选择模型"
              showSearch
              onChange={handleModelChange}
              filterOption={(input, option) =>
                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            >
              {mockModels.map(m => (
                <Select.Option key={m.value} value={m.value} label={m.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{m.label}</span>
                    <Text type="secondary" style={{ fontSize: 11 }}>{m.source} · {m.type}</Text>
                  </div>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          {selectedModel && (
            <div style={{
              background: '#f8fafc',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 16,
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ display: 'flex', gap: 24 }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>模型来源</Text>
                  <div style={{ marginTop: 4 }}>{selectedModel.source}</div>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>模型类型</Text>
                  <div style={{ marginTop: 4 }}>{selectedModel.type}</div>
                </div>
              </div>
            </div>
          )}

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            资源信息
          </Divider>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item
              label="CPU请求"
              name="cpuRequest"
              rules={[{ required: true, message: '请输入CPU请求' }]}
            >
              <InputNumber style={{ width: '100%' }} min={1} addonAfter="Core" placeholder="如: 8" />
            </Form.Item>

            <Form.Item
              label="CPU限制"
              name="cpuLimit"
              rules={[{ required: true, message: '请输入CPU限制' }]}
            >
              <InputNumber style={{ width: '100%' }} min={1} addonAfter="Core" placeholder="如: 16" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item
              label="内存请求"
              name="memoryRequest"
              rules={[{ required: true, message: '请输入内存请求' }]}
            >
              <InputNumber style={{ width: '100%' }} min={1} addonAfter="GB" placeholder="如: 32" />
            </Form.Item>

            <Form.Item
              label="内存限制"
              name="memoryLimit"
              rules={[{ required: true, message: '请输入内存限制' }]}
            >
              <InputNumber style={{ width: '100%' }} min={1} addonAfter="GB" placeholder="如: 64" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item
              label="显卡类型"
              name="gpuType"
              rules={[{ required: true, message: '请选择显卡类型' }]}
            >
              <Select placeholder="请选择显卡类型">
                {gpuTypes.map(g => (
                  <Select.Option key={g.value} value={g.value}>{g.label}</Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              label="显卡数量"
              name="gpuCount"
              rules={[{ required: true, message: '请选择显卡数量' }]}
            >
              <Select placeholder="请选择显卡数量">
                <Select.Option value={1}>1卡</Select.Option>
                <Select.Option value={2}>2卡</Select.Option>
                <Select.Option value={4}>4卡</Select.Option>
                <Select.Option value={8}>8卡</Select.Option>
              </Select>
            </Form.Item>
          </div>

          <Form.Item
            label="部署实例数"
            name="instanceCount"
            rules={[{ required: true, message: '请输入部署实例数' }]}
          >
            <InputNumber style={{ width: '100%' }} min={1} max={10} placeholder="如: 1" />
          </Form.Item>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            镜像配置
          </Divider>

          <Form.Item
            label="镜像类型"
            name="imageType"
            rules={[{ required: true, message: '请选择镜像类型' }]}
          >
            <Select placeholder="请选择镜像类型">
              <Select.Option value="vllm">vLLM</Select.Option>
              <Select.Option value="dgi">DGI Server</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="选择镜像"
            name="image"
            rules={[{ required: true, message: '请选择镜像' }]}
          >
            <Select placeholder="请选择镜像" showSearch>
              {mockImages.map(img => (
                <Select.Option key={img.value} value={img.value}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{img.label}</span>
                    <Text type="secondary" style={{ fontSize: 11 }}>{img.category}</Text>
                  </div>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="运行命令"
            name="command"
            tooltip="可选配置，用于指定服务启动命令"
          >
            <Input.TextArea rows={2} placeholder="可选配置，如: --port 8000 --tensor-parallel-size 2" />
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
              <ExperimentOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>部署服务详情</span>
          </div>
        }
        open={detailModalVisible}
        onCancel={handleCloseDetail}
        width={640}
        footer={
          <Space>
            <Button onClick={handleCloseDetail}>关闭</Button>
            {selectedRecord && selectedRecord.status !== 'running' && (
              <Button type="primary" style={{ background: '#4f46e5' }} onClick={() => { handleCloseDetail(); handleStart(selectedRecord); }}>
                启动
              </Button>
            )}
            {selectedRecord && selectedRecord.status === 'running' && (
              <Button onClick={() => { handleCloseDetail(); handleStop(selectedRecord); }}>
                停止
              </Button>
            )}
          </Space>
        }
      >
        {selectedRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="服务名称" span={2}>{selectedRecord.name}</Descriptions.Item>
            <Descriptions.Item label="模型名称">{selectedRecord.modelName}</Descriptions.Item>
            <Descriptions.Item label="模型来源">{selectedRecord.modelSource}</Descriptions.Item>
            <Descriptions.Item label="实例数">{selectedRecord.instanceCount}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={selectedRecord.status === 'running' ? 'success' : 'default'}>
                {selectedRecord.status === 'running' ? '运行中' : '已停止'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="创建人">{selectedRecord.creator}</Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>{selectedRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default ModelDeployment
