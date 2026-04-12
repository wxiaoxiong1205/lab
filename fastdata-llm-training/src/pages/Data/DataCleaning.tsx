import React, { useState } from 'react'
import { message, Modal, Form, Input, Select, Button, Typography, Space, Divider, Checkbox, Card, DatePicker, Descriptions, Switch } from 'antd'
import { FilterOutlined, PlusOutlined, CheckCircleOutlined } from '@ant-design/icons'
import SharedListPage from '../../components/Shared/SharedListPage'

const { Text } = Typography

// 数据集选项
const mockDatasets = [
  { value: 'ds_001', label: '多轮对话训练集', count: 5000 },
  { value: 'ds_002', label: '医疗问答训练集', count: 8000 },
  { value: 'ds_003', label: '商品评论训练集', count: 10000 },
]

// 清洗能力配置
const cleaningCapabilities = [
  {
    category: '数据格式清洗',
    items: [
      { value: 'blank_chars', label: '空白字符清洗' },
      { value: 'garbled_chars', label: '乱码清洗' },
      { value: 'html_tags', label: 'HTML标签清洗' },
      { value: 'extra_newlines', label: '多余换行符清洗' },
    ]
  },
  {
    category: 'LLM生成数据清洗',
    items: [
      { value: 'length_filter', label: '长度异常过滤器' },
      { value: 'duplicate_content', label: '重复内容移除器' },
      { value: 'truncated_sentence', label: '截断句移除器' },
      { value: 'language_filter', label: '语种过滤器' },
    ]
  },
  {
    category: '数据去重',
    items: [
      { value: 'exact_dedup', label: '精确匹配去重' },
      { value: 'minhash_dedup', label: 'MinHash去重' },
      { value: 'simhash_dedup', label: 'SimHash去重' },
    ]
  },
  {
    category: '敏感数据清洗',
    items: [
      { value: 'contact_info', label: '联系方式脱敏' },
      { value: 'id_card', label: '证件脱敏' },
      { value: 'web_address', label: '网络地址脱敏' },
      { value: 'finance_vehicle', label: '金融车辆脱敏' },
      { value: 'social_account', label: '社交账号脱敏' },
      { value: 'custom_keywords', label: '自定义关键词脱敏' },
    ]
  },
]

const mockCleaningTasks = [
  { id: '1', name: '训练集去重清洗', dataset: '多轮对话训练集', rules: '去重/格式校验', cleanedCount: 1200, totalCount: 1500, status: 'completed', createdAt: '2026/03/22 10:00:00' },
  { id: '2', name: '医疗数据敏感词过滤', dataset: '医疗问答训练集', rules: '敏感词过滤/去重', cleanedCount: 0, totalCount: 8000, status: 'pending', createdAt: '2026/03/26 09:00:00' },
  { id: '3', name: '商品评论质量过滤', dataset: '商品评论训练集', rules: '低质量过滤/去重', cleanedCount: 6500, totalCount: 10000, status: 'in_progress', createdAt: '2026/03/25 14:30:00' },
]

const DataCleaning: React.FC = () => {
  const [data] = useState(mockCleaningTasks)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<typeof mockCleaningTasks[0] | null>(null)
  const [form] = Form.useForm()
  const [selectedCapabilities, setSelectedCapabilities] = useState<string[]>([])

  const scheduleEnabled = Form.useWatch('scheduleEnabled', form)

  const handleOpenCreate = () => {
    form.resetFields()
    setSelectedCapabilities([])
    setCreateModalVisible(true)
  }

  const handleCapabilityChange = (checkedValues: string[]) => {
    setSelectedCapabilities(checkedValues)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('创建清洗任务:', values, '清洗能力:', selectedCapabilities)
      message.success('创建成功')
      setCreateModalVisible(false)
      form.resetFields()
      setSelectedCapabilities([])
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  const handleCancel = () => {
    setCreateModalVisible(false)
    form.resetFields()
    setSelectedCapabilities([])
  }

  const handleOpenDetail = (record: typeof mockCleaningTasks[0]) => {
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
        title="数据清洗"
        titleIcon={<FilterOutlined style={{ color: '#fff', fontSize: 18 }} />}
        subtitle="通过对数据进行异常清洗、文本过滤、文本去重和去除隐私信息，提升数据质量"
        searchPlaceholder="请输入清洗任务名称"
        searchField="name"
        columns={[
          { title: '任务名称', dataIndex: 'name', key: 'name' },
          { title: '目标数据集', dataIndex: 'dataset', key: 'dataset' },
          { title: '清洗规则', dataIndex: 'rules', key: 'rules' },
          { title: '清洗数量/总数', dataIndex: 'cleanedCount', key: 'cleanedCount', render: (c: number, record: typeof mockCleaningTasks[0]) => `${c}/${record.totalCount}` },
          { title: '状态', dataIndex: 'status', key: 'status', render: (val: string) => {
            const map: Record<string, { color: string; label: string }> = {
              pending: { color: 'default', label: '待执行' },
              in_progress: { color: 'processing', label: '执行中' },
              completed: { color: 'success', label: '已完成' },
            }
            const s = map[val] || { color: 'default', label: val }
            return <span style={{ color: s.color === 'success' ? '#52c41a' : s.color === 'processing' ? '#1677ff' : '#999' }}>{s.label}</span>
          }},
          { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
        ]}
        dataSource={data}
        createButtonText="创建清洗任务"
        onCreate={handleOpenCreate}
        onRefresh={() => message.success('刷新成功')}
        emptyText="暂无清洗任务"
        actionButtons={[
          { label: '执行', onClick: (record: typeof mockCleaningTasks[0]) => message.success(`执行清洗: ${record.name}`) },
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
            <span style={{ fontWeight: 600 }}>创建清洗任务</span>
          </div>
        }
        open={createModalVisible}
        onCancel={handleCancel}
        width={800}
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
            <Input placeholder="请输入清洗任务名称" maxLength={64} showCount />
          </Form.Item>

          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="请输入任务描述（可选）" maxLength={300} showCount />
          </Form.Item>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            数据配置
          </Divider>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item
              label="数据来源"
              name="dataset"
              rules={[{ required: true, message: '请选择数据集' }]}
            >
              <Select placeholder="请选择数据集" showSearch>
                {mockDatasets.map(ds => (
                  <Select.Option key={ds.value} value={ds.value}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{ds.label}</span>
                      <Text type="secondary" style={{ fontSize: 11 }}>{ds.count}条</Text>
                    </div>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              label="清洗后数据集名称"
              name="outputName"
              rules={[
                { required: true, message: '请输入数据集名称' },
                { pattern: /^[\u4e00-\u9fa5a-zA-Z0-9_-]{2,64}$/, message: '支持中英文、数字、下划线、中划线，2-64字符' }
              ]}
            >
              <Input placeholder="清洗后的数据集名称" />
            </Form.Item>
          </div>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            清洗能力配置
          </Divider>

          <Card
            size="small"
            style={{ background: '#fafafa', border: '1px solid #e2e8f0', marginBottom: 16 }}
          >
            <Checkbox.Group
              onChange={(values) => handleCapabilityChange(values as string[])}
              style={{ width: '100%' }}
            >
              {cleaningCapabilities.map((category, catIndex) => (
                <div key={catIndex} style={{ marginBottom: 16 }}>
                  <Text strong style={{ fontSize: 13, color: '#0f172a', marginBottom: 8, display: 'block' }}>
                    {category.category}
                  </Text>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {category.items.map(item => (
                      <Checkbox
                        key={item.value}
                        value={item.value}
                        style={{
                          marginRight: 8,
                          background: selectedCapabilities.includes(item.value) ? 'rgba(79, 70, 229, 0.08)' : '#fff',
                          padding: '4px 12px',
                          borderRadius: 6,
                          border: selectedCapabilities.includes(item.value) ? '1px solid rgba(79, 70, 229, 0.3)' : '1px solid #e2e8f0'
                        }}
                      >
                        {item.label}
                      </Checkbox>
                    ))}
                  </div>
                </div>
              ))}
            </Checkbox.Group>
          </Card>

          {selectedCapabilities.length > 0 && (
            <div style={{
              background: '#f8fafc',
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 16,
              border: '1px solid #e2e8f0'
            }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />
                已选择 {selectedCapabilities.length} 项清洗能力
              </Text>
            </div>
          )}

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            任务配置
          </Divider>

          <Form.Item
            label="任务定时配置"
            tooltip="可选配置，支持定时启动清洗任务"
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
              <FilterOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>清洗任务详情</span>
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
            <Descriptions.Item label="目标数据集">{selectedRecord.dataset}</Descriptions.Item>
            <Descriptions.Item label="清洗规则">{selectedRecord.rules}</Descriptions.Item>
            <Descriptions.Item label="清洗进度">
              {selectedRecord.cleanedCount} / {selectedRecord.totalCount}
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <span style={{ color: selectedRecord.status === 'completed' ? '#52c41a' : selectedRecord.status === 'in_progress' ? '#1677ff' : '#999' }}>
                {selectedRecord.status === 'completed' ? '已完成' : selectedRecord.status === 'in_progress' ? '执行中' : '待执行'}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>{selectedRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default DataCleaning
