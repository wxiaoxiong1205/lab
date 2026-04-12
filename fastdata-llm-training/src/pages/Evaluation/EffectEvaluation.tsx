import React, { useState } from 'react'
import { message, Modal, Form, Input, Select, Button, Typography, Space, Divider, Table, InputNumber, Tag, DatePicker, Descriptions, Switch } from 'antd'
import { ThunderboltOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import SharedListPage from '../../components/Shared/SharedListPage'
import type { ColumnsType } from 'antd/es/table'

const { Text } = Typography

// 评估指标类型
interface EvaluationIndicatorItem {
  id: string
  name: string
  description: string
  field: string
  scoreRange: string
  scoreDescription: string
}

// 可选评估指标
const availableIndicators = [
  { name: '答案相关性', description: '评估回答与问题的相关程度', field: 'answer_relevance', scoreRange: '0-10', scoreDescription: '0分表示完全无关，10分表示高度相关' },
  { name: '忠实度', description: '评估回答对原始文档的忠实程度', field: 'faithfulness', scoreRange: '0-10', scoreDescription: '0分表示完全不忠实，10分表示完全忠实' },
  { name: '上下文精确度', description: '评估回答对上下文的引用精确度', field: 'context_precision', scoreRange: '0-10', scoreDescription: '0分表示完全不精确，10分表示完全精确' },
  { name: '上下文召回率', description: '评估回答对关键信息的召回程度', field: 'context_recall', scoreRange: '0-10', scoreDescription: '0分表示未召回任何关键信息，10分表示完全召回' },
  { name: '上下文相关性', description: '评估回答与上下文的整体相关性', field: 'context_relevance', scoreRange: '0-10', scoreDescription: '0分表示完全无关，10分表示完全相关' },
]

// 模型选项
const mockModels = [
  { value: 'model_001', label: 'Qwen2.5-7B-Instruct-V3', source: '训练生成' },
  { value: 'model_002', label: 'Qwen2.5-1.5B-Instruct-V2', source: '训练生成' },
  { value: 'model_003', label: 'Qwen3-8B-Instruct', source: '训练生成' },
  { value: 'model_004', label: 'Qwen2-VL-2B-Instruct', source: '基础模型' },
]

// 推理结果集选项
const mockInferenceDatasets = [
  { value: 'inf_001', label: '文本生成推理结果_20260325', count: 10000 },
  { value: 'inf_002', label: '情感分析推理_20260323', count: 50000 },
]

const mockData = [
  { id: '1', name: '客服场景评估-3月', taskStatus: 'running', duration: '2h 15m', progress: 65, dataset: '推理结果集_123213213aa', model: '离线_模型管理_lora-文本生成', method: '自动评估', creator: 'admin', createdAt: '2026/03/25 10:00:00' },
  { id: '2', name: '金融风控效果评估', taskStatus: 'completed', duration: '1h 30m', progress: 100, dataset: '离线_模型管理_full-文本生成', model: '离线_基础模型-文本生成', method: '自动评估', creator: 'lab1', createdAt: '2026/03/22 14:30:00' },
]

const statusColor = (status: string) => {
  if (status === 'running' || status === 'pending') return '#1677ff'
  if (status === 'completed') return '#52c41a'
  return '#999'
}
const statusLabel = (status: string) => {
  const map: Record<string, string> = { pending: '待评估', running: '评估中', completed: '已完成', failed: '评估失败' }
  return map[status] || status
}

const EffectEvaluation: React.FC = () => {
  const [data] = useState(mockData)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<typeof mockData[0] | null>(null)
  const [form] = Form.useForm()
  const scheduleEnabled = Form.useWatch('scheduleEnabled', form)
  const [selectedIndicators, setSelectedIndicators] = useState<EvaluationIndicatorItem[]>([])

  const handleOpenCreate = () => {
    form.resetFields()
    setSelectedIndicators([])
    setCreateModalVisible(true)
  }

  const handleAddIndicator = (indicator: typeof availableIndicators[0]) => {
    const newIndicator: EvaluationIndicatorItem = {
      id: `${Date.now()}`,
      name: indicator.name,
      description: indicator.description,
      field: indicator.field,
      scoreRange: indicator.scoreRange,
      scoreDescription: '',
    }
    setSelectedIndicators([...selectedIndicators, newIndicator])
  }

  const handleRemoveIndicator = (id: string) => {
    setSelectedIndicators(selectedIndicators.filter(item => item.id !== id))
  }

  const handleIndicatorScoreChange = (id: string, scoreDescription: string) => {
    setSelectedIndicators(
      selectedIndicators.map(item =>
        item.id === id ? { ...item, scoreDescription } : item
      )
    )
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('创建评估任务:', values, '指标:', selectedIndicators)
      message.success('创建成功')
      setCreateModalVisible(false)
      form.resetFields()
      setSelectedIndicators([])
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  const handleCancel = () => {
    setCreateModalVisible(false)
    form.resetFields()
    setSelectedIndicators([])
  }

  const handleOpenDetail = (record: typeof mockData[0]) => {
    setSelectedRecord(record)
    setDetailModalVisible(true)
  }

  const handleCloseDetail = () => {
    setDetailModalVisible(false)
    setSelectedRecord(null)
  }

  const indicatorColumns: ColumnsType<EvaluationIndicatorItem> = [
    { title: '指标名称', dataIndex: 'name', key: 'name', width: 120 },
    { title: '指标说明', dataIndex: 'description', key: 'description', width: 180 },
    { title: '评估字段', dataIndex: 'field', key: 'field', width: 140, render: (val: string) => <Tag>{val}</Tag> },
    { title: '指标分值量级', dataIndex: 'scoreRange', key: 'scoreRange', width: 100, render: (val: string) => <Tag color="blue">{val}</Tag> },
    {
      title: '量级说明',
      dataIndex: 'scoreDescription',
      key: 'scoreDescription',
      render: (val: string, record) => (
        <Input
          placeholder="请输入量级说明"
          value={val}
          onChange={(e) => handleIndicatorScoreChange(record.id, e.target.value)}
          style={{ width: '100%' }}
        />
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_, record) => (
        <Button type="link" danger size="small" onClick={() => handleRemoveIndicator(record.id)}>
          删除
        </Button>
      )
    },
  ]

  return (
    <>
      <SharedListPage
        title="效果评估"
        titleIcon={<ThunderboltOutlined style={{ color: '#fff', fontSize: 18 }} />}
        subtitle="对训练完成的模型进行效果评估，量化模型性能"
        searchField="name"
        showSearch={false}
        columns={[
          { title: '任务名称', dataIndex: 'name', key: 'name' },
          { title: '任务状态', dataIndex: 'taskStatus', key: 'taskStatus', render: (val: string) => (
            <span style={{ color: statusColor(val), fontWeight: 500 }}>{statusLabel(val)}</span>
          )},
          { title: '运行时长', dataIndex: 'duration', key: 'duration' },
          { title: '评估进度', dataIndex: 'progress', key: 'progress', render: (val: number) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 100, height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${val}%`, height: '100%', background: statusColor(val === 100 ? 'completed' : 'running'), borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 12 }}>{val}%</span>
            </div>
          )},
          { title: '推理结果集', dataIndex: 'dataset', key: 'dataset' },
          { title: '待评估模型/服务', dataIndex: 'model', key: 'model' },
          { title: '评估方法', dataIndex: 'method', key: 'method' },
          { title: '创建人', dataIndex: 'creator', key: 'creator' },
          { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
        ]}
        dataSource={data}
        createButtonText="创建评估任务"
        onCreate={handleOpenCreate}
        onRefresh={() => message.success('刷新成功')}
        emptyText="暂无评估任务"
        actionButtons={[
          { label: '启动', onClick: (record: typeof mockData[0]) => message.success(`启动评估: ${record.name}`) },
          { label: '编辑', onClick: handleOpenDetail },
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
            <span style={{ fontWeight: 600 }}>创建评估任务</span>
          </div>
        }
        open={createModalVisible}
        onCancel={handleCancel}
        width={900}
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
          initialValues={{
            evaluationCategory: 'text',
            evaluationMethod: 'basic',
          }}
        >
          <Divider orientation="horizontal" plain style={{ margin: '0 0 16px 0', color: '#64748b', fontSize: 12 }}>
            基本信息
          </Divider>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item
              label="任务名称"
              name="name"
              rules={[{ required: true, message: '请输入任务名称' }]}
            >
              <Input placeholder="请输入评估任务名称" maxLength={64} showCount />
            </Form.Item>

            <Form.Item
              label="评估类别"
              name="evaluationCategory"
              rules={[{ required: true, message: '请选择评估类别' }]}
            >
              <Select placeholder="请选择">
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
          </div>

          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="请输入任务描述（可选）" maxLength={200} showCount />
          </Form.Item>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            评估配置
          </Divider>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item
              label="评估数据来源"
              name="dataSource"
              rules={[{ required: true, message: '请选择数据来源' }]}
            >
              <Select placeholder="请选择">
                <Select.Option value="inference_result">已有推理结果集</Select.Option>
                <Select.Option value="new">新建推理结果集</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              label="待评估推理结果集"
              name="inferenceDataset"
              rules={[{ required: true, message: '请选择推理结果集' }]}
            >
              <Select placeholder="请选择推理结果集" showSearch>
                {mockInferenceDatasets.map(ds => (
                  <Select.Option key={ds.value} value={ds.value}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{ds.label}</span>
                      <Text type="secondary" style={{ fontSize: 11 }}>{ds.count}条</Text>
                    </div>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <Form.Item
            label="待评估模型/服务"
            name="models"
            rules={[{ required: true, message: '请选择模型' }]}
          >
            <Select mode="multiple" placeholder="请选择模型" showSearch>
              {mockModels.map(m => (
                <Select.Option key={m.value} value={m.value}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{m.label}</span>
                    <Text type="secondary" style={{ fontSize: 11 }}>{m.source}</Text>
                  </div>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="评估方法"
            name="evaluationMethod"
            rules={[{ required: true, message: '请选择评估方法' }]}
          >
            <Select placeholder="请选择">
              <Select.Option value="judge">裁判员评估</Select.Option>
              <Select.Option value="basic">基础指标评估</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.evaluationMethod !== currentValues.evaluationMethod}
          >
            {({ getFieldValue }) => (
              getFieldValue('evaluationMethod') === 'judge' && (
                <Form.Item
                  label="裁判模型/服务"
                  name="judgeModel"
                  rules={[{ required: true, message: '请选择裁判模型' }]}
                >
                  <Select placeholder="请选择裁判模型" showSearch>
                    {mockModels.map(m => (
                      <Select.Option key={m.value} value={m.value}>{m.label}</Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              )
            )}
          </Form.Item>

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            评估指标
          </Divider>

          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>添加评估指标：</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {availableIndicators.map(indicator => (
                <Button
                  key={indicator.name}
                  type={selectedIndicators.some(i => i.name === indicator.name) ? 'primary' : 'default'}
                  size="small"
                  onClick={() => handleAddIndicator(indicator)}
                  disabled={selectedIndicators.some(i => i.name === indicator.name)}
                  style={{
                    borderRadius: 16,
                    background: selectedIndicators.some(i => i.name === indicator.name) ? '#4f46e5' : undefined
                  }}
                >
                  {indicator.name}
                </Button>
              ))}
            </div>
          </div>

          <Table
            columns={indicatorColumns}
            dataSource={selectedIndicators}
            pagination={false}
            size="small"
            rowKey="id"
            locale={{
              emptyText: (
                <div style={{ padding: '24px 0', color: '#94a3b8' }}>
                  <Text type="secondary">请从上方添加评估指标</Text>
                </div>
              )
            }}
          />

          <Divider orientation="horizontal" plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>
            任务配置
          </Divider>

          <Form.Item
            label="任务定时配置"
            tooltip="可选配置，支持定时启动评估任务"
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
              <ThunderboltOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>评估任务详情</span>
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
            <Descriptions.Item label="任务状态">
              <span style={{ color: statusColor(selectedRecord.taskStatus), fontWeight: 500 }}>{statusLabel(selectedRecord.taskStatus)}</span>
            </Descriptions.Item>
            <Descriptions.Item label="运行时长">{selectedRecord.duration}</Descriptions.Item>
            <Descriptions.Item label="评估进度">{selectedRecord.progress}%</Descriptions.Item>
            <Descriptions.Item label="推理结果集" span={2}>{selectedRecord.dataset}</Descriptions.Item>
            <Descriptions.Item label="待评估模型/服务" span={2}>{selectedRecord.model}</Descriptions.Item>
            <Descriptions.Item label="评估方法">{selectedRecord.method}</Descriptions.Item>
            <Descriptions.Item label="创建人">{selectedRecord.creator}</Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>{selectedRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default EffectEvaluation
