import React, { useState } from 'react'
import { message, Modal, Form, Input, Select, Button, Typography, Space, Divider, InputNumber, Tag } from 'antd'
import { CloudServerOutlined, PlusOutlined } from '@ant-design/icons'
import SharedListPage from '../../components/Shared/SharedListPage'

const { Text } = Typography

interface MLDeploymentRecord {
  id: string
  name: string
  modelName: string
  modelType: string
  instanceCount: number
  status: 'running' | 'stopped' | 'error'
  creator: string
  createdAt: string
}

const statusMap: Record<string, { color: string; label: string }> = {
  running: { color: 'success', label: '运行中' },
  stopped: { color: 'default', label: '已停止' },
  error: { color: 'error', label: '异常' },
}

const mockDeployments: MLDeploymentRecord[] = [
  { id: '1', name: '图像分类服务', modelName: '图像分类模型-v1', modelType: 'VLM', instanceCount: 2, status: 'running', creator: 'admin', createdAt: '2026/03/20 10:00:00' },
  { id: '2', name: 'NER推理服务', modelName: 'NER命名实体识别', modelType: 'LLM', instanceCount: 1, status: 'running', creator: 'lab1', createdAt: '2026/03/18 14:30:00' },
  { id: '3', name: '情感分析服务', modelName: '情感分析模型', modelType: 'LLM', instanceCount: 1, status: 'stopped', creator: 'admin', createdAt: '2026/03/15 09:00:00' },
]

const gpuTypes = [
  { value: 'T4', label: 'NVIDIA T4' },
  { value: 'V100', label: 'NVIDIA V100' },
  { value: 'A100', label: 'NVIDIA A100' },
]

const MLModelDeployment: React.FC = () => {
  const [data] = useState(mockDeployments)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [form] = Form.useForm()

  const columns: any[] = [
    { title: '服务名称', dataIndex: 'name', key: 'name' },
    { title: '模型名称', dataIndex: 'modelName', key: 'modelName' },
    { title: '模型类型', dataIndex: 'modelType', key: 'modelType' },
    { title: '实例数', dataIndex: 'instanceCount', key: 'instanceCount' },
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

  const handleOpenCreate = () => {
    form.resetFields()
    setCreateModalVisible(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('部署服务:', values)
      message.success('部署成功')
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

  const handleStart = (record: MLDeploymentRecord) => {
    message.success(`启动服务: ${record.name}`)
  }

  const handleStop = (record: MLDeploymentRecord) => {
    message.info(`停止服务: ${record.name}`)
  }

  return (
    <>
      <SharedListPage
        title="机器学习模型部署"
        titleIcon={<CloudServerOutlined style={{ color: '#fff', fontSize: 18 }} />}
        subtitle="将机器学习模型部署为在线服务，提供推理能力"
        searchPlaceholder="搜索服务名称"
        searchField="name"
        columns={columns}
        dataSource={data}
        createButtonText="部署服务"
        onCreate={handleOpenCreate}
        onRefresh={() => message.success('刷新成功')}
        emptyText="暂无部署服务"
        actionButtons={[
          { label: '启动', onClick: handleStart, disabled: (record: MLDeploymentRecord) => record.status === 'running' },
          { label: '停止', onClick: handleStop, disabled: (record: MLDeploymentRecord) => record.status !== 'running' },
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
            <span style={{ fontWeight: 600 }}>部署服务</span>
          </div>
        }
        open={createModalVisible}
        onCancel={handleCancel}
        width={640}
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
        <Form form={form} layout="vertical">
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

          <Form.Item
            label="选择模型"
            name="model"
            rules={[{ required: true, message: '请选择模型' }]}
          >
            <Select placeholder="请选择模型" showSearch>
              <Select.Option value="model_1">图像分类模型-v1</Select.Option>
              <Select.Option value="model_2">NER命名实体识别</Select.Option>
              <Select.Option value="model_3">情感分析模型</Select.Option>
            </Select>
          </Form.Item>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            资源配置
          </Divider>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item label="CPU请求" name="cpuRequest" rules={[{ required: true, message: '请输入CPU请求' }]}>
              <InputNumber style={{ width: '100%' }} min={1} addonAfter="Core" placeholder="如: 4" />
            </Form.Item>

            <Form.Item label="内存请求" name="memoryRequest" rules={[{ required: true, message: '请输入内存请求' }]}>
              <InputNumber style={{ width: '100%' }} min={1} addonAfter="GB" placeholder="如: 8" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item label="显卡类型" name="gpuType" rules={[{ required: true, message: '请选择显卡类型' }]}>
              <Select placeholder="请选择显卡类型">
                {gpuTypes.map(g => (
                  <Select.Option key={g.value} value={g.value}>{g.label}</Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item label="实例数" name="instanceCount" rules={[{ required: true, message: '请输入实例数' }]}>
              <InputNumber style={{ width: '100%' }} min={1} max={10} placeholder="如: 1" />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  )
}

export default MLModelDeployment