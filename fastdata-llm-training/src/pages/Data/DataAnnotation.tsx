import React, { useState } from 'react'
import { message, Modal, Form, Input, Select, Button, Typography, Space, Divider, DatePicker, Descriptions, Tabs, Switch } from 'antd'
import { ToolOutlined, PlusOutlined } from '@ant-design/icons'
import SharedListPage from '../../components/Shared/SharedListPage'

const { Text } = Typography

// 数据集选项
const mockDatasets = [
  { value: 'ds_001', label: '多轮对话训练集', type: '文本生成', count: 5000 },
  { value: 'ds_002', label: '医疗问答训练集', type: '文本生成', count: 8000 },
  { value: 'ds_003', label: '意图识别训练集', type: '文本生成', count: 3000 },
  { value: 'ds_004', label: '图像理解训练集', type: '图像理解', count: 2000 },
]

const mockData = [
  { id: '1', name: '多轮对话标注-批次A', dataVolume: 1000, annotationProgress: '850/1000', preDataset: '多轮对话训练集', postDataset: '多轮对话标注后', creator: 'admin', createdAt: '2026/03/23 10:00:00' },
  { id: '2', name: '意图识别标注-医疗', dataVolume: 2000, annotationProgress: '2000/2000', preDataset: '医疗问答训练集', postDataset: '医疗NER标注后', creator: 'lab1', createdAt: '2026/03/20 14:30:00' },
  { id: '3', name: '情感分类标注-商品', dataVolume: 500, annotationProgress: '0/500', preDataset: '商品评论训练集', postDataset: '商品情感标注后', creator: 'lab2', createdAt: '2026/03/26 09:00:00' },
]

const DataAnnotation: React.FC = () => {
  const [data] = useState(mockData)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<typeof mockData[0] | null>(null)
  const [activeTab, setActiveTab] = useState<string>('online')
  const [form] = Form.useForm()
  const [selectedDataset, setSelectedDataset] = useState<typeof mockDatasets[0] | null>(null)

  const scheduleEnabled = Form.useWatch('scheduleEnabled', form)

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
      {/* Tab切换区域 */}
      <div style={{ padding: '28px 32px 0' }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            { key: 'online', label: '在线标注' },
            { key: 'multi', label: '多人标注' },
          ]}
        />
      </div>

      <SharedListPage
        title="数据标注"
        titleIcon={<ToolOutlined style={{ color: '#fff', fontSize: 18 }} />}
        subtitle="对原始数据进行标注处理，生成高质量训练数据"
        searchPlaceholder="搜索任务名称"
        searchField="name"
        columns={[
          { title: '任务名称', dataIndex: 'name', key: 'name' },
          { title: '数据量', dataIndex: 'dataVolume', key: 'dataVolume' },
          { title: '标注进度', dataIndex: 'annotationProgress', key: 'annotationProgress' },
          { title: '标注前数据集', dataIndex: 'preDataset', key: 'preDataset' },
          { title: '标注后数据集', dataIndex: 'postDataset', key: 'postDataset' },
          { title: '创建人', dataIndex: 'creator', key: 'creator' },
          { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
        ]}
        dataSource={data}
        createButtonText="创建标注任务"
        onCreate={handleOpenCreate}
        onRefresh={() => message.success('刷新成功')}
        emptyText="暂无标注任务"
        cardStyle={{ marginTop: 0 }}
        actionButtons={[
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
              <PlusOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>创建标注任务</span>
          </div>
        }
        open={createModalVisible}
        onCancel={handleCancel}
        width={680}
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
            <Input.TextArea rows={2} placeholder="请输入任务描述（可选）" maxLength={300} showCount />
          </Form.Item>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            数据配置
          </Divider>

          <Form.Item
            label="数据集类型"
            name="datasetType"
            rules={[{ required: true, message: '请选择数据集类型' }]}
          >
            <Select placeholder="请选择数据集类型">
              <Select.Option value="text">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', padding: '2px 6px', borderRadius: 3 }}>SFT</span>
                  文本生成
                </div>
              </Select.Option>
              <Select.Option value="vision">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: '#0891b2', background: 'rgba(8, 145, 178, 0.08)', padding: '2px 6px', borderRadius: 3 }}>VLM</span>
                  图像理解
                </div>
              </Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="数据选择"
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
                    <Text type="secondary" style={{ fontSize: 11 }}>{ds.count}条</Text>
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
                  <Text type="secondary" style={{ fontSize: 12 }}>数据条数</Text>
                  <div style={{ marginTop: 4 }}>{selectedDataset.count} 条</div>
                </div>
              </div>
            </div>
          )}

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            输出配置
          </Divider>

          <Form.Item
            label="处理后数据集"
            name="outputType"
            rules={[{ required: true, message: '请选择输出方式' }]}
          >
            <Select placeholder="请选择">
              <Select.Option value="new_version">新增版本</Select.Option>
              <Select.Option value="new_dataset">新建数据集</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="数据集名称"
            name="outputName"
            rules={[
              { required: true, message: '请输入数据集名称' },
              { pattern: /^[\u4e00-\u9fa5a-zA-Z0-9_-]{2,64}$/, message: '支持中英文、数字、下划线、中划线，2-64字符' }
            ]}
            extra="标注完成后的数据集名称"
          >
            <Input placeholder="请输入数据集名称" maxLength={64} showCount />
          </Form.Item>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            任务配置
          </Divider>

          <Form.Item
            label="任务定时配置"
            tooltip="可选配置，支持定时启动标注任务"
          >
            <Space size={12}>
              <Form.Item name="scheduleEnabled" valuePropName="checked" noStyle>
                <Switch checkedChildren="开" unCheckedChildren="关" />
              </Form.Item>
              {scheduleEnabled && (
                <Form.Item name="schedule" noStyle>
                  <DatePicker showTime format="YYYY-MM-DD HH:mm" placeholder="选择时间" />
                </Form.Item>
              )}
            </Space>
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
              <ToolOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>标注任务详情</span>
          </div>
        }
        open={detailModalVisible}
        onCancel={handleCloseDetail}
        width={640}
        footer={<Button onClick={handleCloseDetail}>关闭</Button>}
      >
        {selectedRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="任务名称" span={2}>{selectedRecord.name}</Descriptions.Item>
            <Descriptions.Item label="数据量">{selectedRecord.dataVolume}</Descriptions.Item>
            <Descriptions.Item label="标注进度">{selectedRecord.annotationProgress}</Descriptions.Item>
            <Descriptions.Item label="标注前数据集" span={2}>{selectedRecord.preDataset}</Descriptions.Item>
            <Descriptions.Item label="标注后数据集" span={2}>{selectedRecord.postDataset}</Descriptions.Item>
            <Descriptions.Item label="创建人">{selectedRecord.creator}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{selectedRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default DataAnnotation
