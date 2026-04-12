import React, { useState } from 'react'
import { message, Modal, Form, Input, Select, Button, Typography, Space, Divider, Tag } from 'antd'
import { ExperimentOutlined, PlusOutlined, FileTextOutlined } from '@ant-design/icons'
import SharedListPage from '../../components/Shared/SharedListPage'

const { Text } = Typography

interface MLNotebookRecord {
  id: string
  name: string
  description: string
  status: 'running' | 'stopped'
  creator: string
  createdAt: string
}

const statusMap: Record<string, { color: string; label: string }> = {
  running: { color: 'success', label: '运行中' },
  stopped: { color: 'default', label: '已停止' },
}

const mockNotebooks: MLNotebookRecord[] = [
  { id: '1', name: '图像分类数据探索', description: '用于探索图像分类数据集的特征分布和标签分布', status: 'running', creator: 'admin', createdAt: '2026/03/20 10:00:00' },
  { id: '2', name: 'NER数据预处理', description: '对NER训练数据进行预处理和特征工程', status: 'stopped', creator: 'lab1', createdAt: '2026/03/18 14:30:00' },
  { id: '3', name: '模型调参实验', description: '对比不同超参数下的模型效果', status: 'stopped', creator: 'admin', createdAt: '2026/03/15 09:00:00' },
  { id: '4', name: '特征重要性分析', description: '分析各个特征对模型预测的贡献度', status: 'running', creator: 'lab2', createdAt: '2026/03/12 16:00:00' },
]

const MLNotebook: React.FC = () => {
  const [data] = useState(mockNotebooks)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [tab, setTab] = useState<'square' | 'mine'>('mine')
  const [form] = Form.useForm()

  const handleOpenCreate = () => {
    form.resetFields()
    setCreateModalVisible(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('创建Notebook:', values)
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

  const handleOpen = (record: MLNotebookRecord) => {
    message.loading('正在打开Notebook...', 1.5).then(() => {
      message.info(`已打开: ${record.name}`)
    })
  }

  const handleCopyTemplate = (record: MLNotebookRecord) => {
    message.success(`已复制模板: ${record.name}`)
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        {/* 页面标题 */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div
              style={{
                width: 40,
                height: 40,
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
              }}
            >
              <ExperimentOutlined style={{ color: '#fff', fontSize: 20 }} />
            </div>
            <Typography.Title level={3} style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>
              机器学习在线Notebook
            </Typography.Title>
          </div>
          <Text type="secondary" style={{ fontSize: 14, marginLeft: 52 }}>
            交互式编程环境，支持 Python / Jupyter，提供即开即用的数据科学环境
          </Text>
        </div>

        {/* Tab切换 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Button
            type={tab === 'mine' ? 'primary' : 'default'}
            onClick={() => setTab('mine')}
            style={{ borderRadius: 8 }}
          >
            我的Notebook
          </Button>
          <Button
            type={tab === 'square' ? 'primary' : 'default'}
            onClick={() => setTab('square')}
            style={{ borderRadius: 8 }}
          >
            Notebook广场
          </Button>
        </div>

        {/* 工具栏 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <Text type="secondary" style={{ fontSize: 13 }}>
            共 {data.length} 个 Notebook
          </Text>
          <Space>
            <Button icon={<PlusOutlined />} onClick={handleOpenCreate} style={{ borderRadius: 8 }}>
              新建 Notebook
            </Button>
          </Space>
        </div>

        {/* Notebook卡片列表 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 16,
          }}
        >
          {data.map((notebook) => (
            <div
              key={notebook.id}
              style={{
                background: '#fff',
                borderRadius: 16,
                border: '1px solid #e2e8f0',
                padding: 20,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onClick={() => handleOpen(notebook)}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    background: notebook.status === 'running' ? 'rgba(82, 196, 26, 0.1)' : 'rgba(0, 0, 0, 0.04)',
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <FileTextOutlined style={{ color: notebook.status === 'running' ? '#52c41a' : '#94a3b8', fontSize: 18 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <Text strong style={{ fontSize: 15, color: '#0f172a', display: 'block', marginBottom: 4 }}>
                    {notebook.name}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {notebook.description}
                  </Text>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Tag color={statusMap[notebook.status].color}>{statusMap[notebook.status].label}</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>{notebook.creator}</Text>
                </div>
                <Space>
                  {tab === 'square' && (
                    <Button size="small" onClick={(e) => { e.stopPropagation(); handleCopyTemplate(notebook); }}>复制案例</Button>
                  )}
                </Space>
              </div>
            </div>
          ))}
        </div>
      </div>

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
            <span style={{ fontWeight: 600 }}>新建 Notebook</span>
          </div>
        }
        open={createModalVisible}
        onCancel={handleCancel}
        width={520}
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
            label="Notebook名称"
            name="name"
            rules={[
              { required: true, message: '请输入Notebook名称' },
              { pattern: /^[\u4e00-\u9fa5a-zA-Z0-9_-]{2,64}$/, message: '支持中英文、数字、下划线、中划线，2-64字符' }
            ]}
          >
            <Input placeholder="请输入Notebook名称" maxLength={64} showCount />
          </Form.Item>

          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} placeholder="请输入Notebook描述（可选）" maxLength={300} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default MLNotebook