import React, { useState } from 'react'
import { message, Modal, Form, Input, Select, Button, Typography, Space, Divider, Descriptions } from 'antd'
import { AppstoreOutlined, PlusOutlined } from '@ant-design/icons'
import SharedListPage from '../../components/Shared/SharedListPage'
import { mockMLAnnotationTasks } from '../../data/mockDataAll'
import type { ColumnsType } from 'antd/es/table'
import type { MLAnnotationTask } from '../../types/shared'

const { Text } = Typography

const mockDatasets = [
  { value: 'ds_001', label: '图像分类数据集', type: '图像', annotationType: '图像分类', count: 1000 },
  { value: 'ds_002', label: 'NER标注数据集', type: '文本', annotationType: '命名实体识别', count: 2000 },
  { value: 'ds_003', label: '情感分析数据集', type: '文本', annotationType: '情感分类', count: 1500 },
]

const statusMap: Record<string, { color: string; label: string }> = {
  pending: { color: 'default', label: '待标注' },
  in_progress: { color: 'processing', label: '标注中' },
  completed: { color: 'success', label: '已完成' },
}

const MLAnnotation: React.FC = () => {
  const [data] = useState<MLAnnotationTask[]>(mockMLAnnotationTasks)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<MLAnnotationTask | null>(null)
  const [form] = Form.useForm()
  const [selectedDataset, setSelectedDataset] = useState<typeof mockDatasets[0] | null>(null)

  const columns: ColumnsType<MLAnnotationTask> = [
    { title: '任务名称', dataIndex: 'name', key: 'name' },
    { title: '数据集', dataIndex: 'dataset', key: 'dataset' },
    { title: '标注进度', dataIndex: 'progress', key: 'progress' },
    {
      title: '标注状态',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => {
        const s = statusMap[val] || { color: 'default', label: val }
        return <span style={{ color: s.color === 'success' ? '#52c41a' : s.color === 'processing' ? '#1677ff' : '#999' }}>{s.label}</span>
      },
    },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
  ]

  const handleOpenCreate = () => {
    form.resetFields()
    setSelectedDataset(null)
    setCreateModalVisible(true)
  }

  const handleDatasetChange = (value: string) => {
    const dataset = mockDatasets.find(ds => ds.value === value)
    setSelectedDataset(dataset || null)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('创建标注任务:', values)
      message.success('创建成功')
      setCreateModalVisible(false)
      form.resetFields()
      setSelectedDataset(null)
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  const handleCancel = () => {
    setCreateModalVisible(false)
    form.resetFields()
    setSelectedDataset(null)
  }

  const handleOpenDetail = (record: MLAnnotationTask) => {
    setSelectedRecord(record)
    setDetailModalVisible(true)
  }

  const handleCloseDetail = () => {
    setDetailModalVisible(false)
    setSelectedRecord(null)
  }

  const handleStartAnnotation = (record: MLAnnotationTask) => {
    message.loading('正在打开标注工具...', 1.5).then(() => {
      message.info(`已跳转到标注任务: ${record.name}`)
    })
  }

  return (
    <>
      <SharedListPage
        title="机器学习标注"
        titleIcon={<AppstoreOutlined style={{ color: '#fff', fontSize: 18 }} />}
        subtitle="对机器学习数据集进行标注处理，支持分配标注人员和选择标注工具"
        searchPlaceholder="请输入任务名称"
        searchField="name"
        columns={columns}
        dataSource={data}
        createButtonText="创建标注任务"
        onCreate={handleOpenCreate}
        onRefresh={() => message.success('刷新成功')}
        emptyText="暂无标注任务"
        actionButtons={[
          { label: '开始标注', onClick: handleStartAnnotation },
          { label: '详情', onClick: handleOpenDetail },
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
            <span style={{ fontWeight: 600 }}>创建标注任务</span>
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
        <Form
          form={form}
          layout="vertical"
        >
          <Divider orientation="horizontal" plain style={{ margin: '0 0 16px 0', color: '#64748b', fontSize: 12 }}>
            基本信息
          </Divider>

          <Form.Item
            label="任务名称"
            name="name"
            rules={[
              { required: true, message: '请输入任务名称' },
              { pattern: /^[\u4e00-\u9fa5a-zA-Z0-9_-]{2,64}$/, message: '支持中英文、数字、下划线、中划线，2-64字符' }
            ]}
          >
            <Input placeholder="请输入标注任务名称" maxLength={64} showCount />
          </Form.Item>

          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="请输入任务描述（可选）" maxLength={200} showCount />
          </Form.Item>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            数据配置
          </Divider>

          <Form.Item
            label="选择数据集"
            name="dataset"
            rules={[{ required: true, message: '请选择数据集' }]}
          >
            <Select
              placeholder="请选择数据集"
              showSearch
              onChange={handleDatasetChange}
              filterOption={(input, option) =>
                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            >
              {mockDatasets.map(ds => (
                <Select.Option key={ds.value} value={ds.value} label={ds.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{ds.label}</span>
                    <Text type="secondary" style={{ fontSize: 11 }}>{ds.type} · {ds.annotationType}</Text>
                  </div>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          {selectedDataset && (
            <div style={{
              background: '#f8fafc',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 16,
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ display: 'flex', gap: 24 }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>数据类型</Text>
                  <div style={{ marginTop: 4 }}>{selectedDataset.type}</div>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>标注类型</Text>
                  <div style={{ marginTop: 4 }}>{selectedDataset.annotationType}</div>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>数据条数</Text>
                  <div style={{ marginTop: 4 }}>{selectedDataset.count} 条</div>
                </div>
              </div>
            </div>
          )}

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            标注配置
          </Divider>

          <Form.Item
            label="标注工具"
            name="tool"
            rules={[{ required: true, message: '请选择标注工具' }]}
          >
            <Select placeholder="请选择标注工具">
              <Select.Option value="builtin">内置标注工具</Select.Option>
              <Select.Option value="custom">自定义标注工具</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="标注人员"
            name="annotators"
            tooltip="可选，指定参与此任务的标注人员"
          >
            <Select mode="multiple" placeholder="请选择标注人员（可选）" allowClear>
              <Select.Option value="admin">管理员</Select.Option>
              <Select.Option value="user1">标注员A</Select.Option>
              <Select.Option value="user2">标注员B</Select.Option>
            </Select>
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
              <AppstoreOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>标注任务详情</span>
          </div>
        }
        open={detailModalVisible}
        onCancel={handleCloseDetail}
        width={600}
        footer={
          <Space>
            <Button onClick={handleCloseDetail}>关闭</Button>
            {selectedRecord && selectedRecord.status !== 'completed' && (
              <Button type="primary" style={{ background: '#4f46e5' }} onClick={() => { handleCloseDetail(); handleStartAnnotation(selectedRecord); }}>
                开始标注
              </Button>
            )}
          </Space>
        }
      >
        {selectedRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="任务名称" span={2}>{selectedRecord.name}</Descriptions.Item>
            <Descriptions.Item label="数据集">{selectedRecord.dataset}</Descriptions.Item>
            <Descriptions.Item label="标注进度">{selectedRecord.progress}</Descriptions.Item>
            <Descriptions.Item label="标注状态" span={2}>
              <Text style={{ color: selectedRecord.status === 'completed' ? '#52c41a' : selectedRecord.status === 'in_progress' ? '#1677ff' : '#999' }}>
                {statusMap[selectedRecord.status]?.label || selectedRecord.status}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>{selectedRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default MLAnnotation