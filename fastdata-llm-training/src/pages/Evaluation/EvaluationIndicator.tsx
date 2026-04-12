import React, { useState } from 'react'
import { message, Modal, Form, Input, Select, Button, Typography, Space, Divider, Descriptions } from 'antd'
import { FundViewOutlined, PlusOutlined } from '@ant-design/icons'
import SharedListPage from '../../components/Shared/SharedListPage'
import { mockEvaluationIndicators } from '../../data/mockDataAll'
import type { ColumnsType } from 'antd/es/table'
import type { EvaluationIndicator } from '../../types/shared'

const { Text } = Typography

// 指标类型选项
const indicatorTypes = [
  { value: 'translation', label: '翻译质量' },
  { value: 'summarization', label: '摘要质量' },
  { value: 'classification', label: '分类准确率' },
  { value: 'comprehensive', label: '综合指标' },
  { value: 'language_model', label: '语言模型' },
  { value: 'qa', label: '问答质量' },
  { value: 'retrieval', label: '检索质量' },
]

// 计算方式选项
const calculationMethods = [
  { value: 'ngram_precision', label: 'n-gram precision' },
  { value: 'lcs', label: 'LCS (最长公共子序列)' },
  { value: 'correct_total', label: 'correct / total' },
  { value: 'f1', label: '2 * P * R / (P + R)' },
  { value: 'perplexity', label: 'exp(-1/N * sum(log_p))' },
  { value: 'custom', label: '自定义' },
]

const EvaluationIndicatorPage: React.FC = () => {
  const [data] = useState<EvaluationIndicator[]>(mockEvaluationIndicators)
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<EvaluationIndicator | null>(null)
  const [form] = Form.useForm()

  const columns: ColumnsType<EvaluationIndicator> = [
    { title: '指标名称', dataIndex: 'name', key: 'name' },
    { title: '指标类型', dataIndex: 'type', key: 'type', render: (val: string) => <Text style={{ color: '#4f46e5' }}>{val}</Text> },
    { title: '指标描述', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: '计算方式', dataIndex: 'calculationMethod', key: 'calculationMethod', render: (val: string) => <Text code>{val}</Text> },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
  ]

  const handleOpenCreate = () => {
    form.resetFields()
    setCreateModalVisible(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('新增评估指标:', values)
      message.success('新增成功')
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

  const handleOpenDetail = (record: EvaluationIndicator) => {
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
        title="评估指标"
        titleIcon={<FundViewOutlined style={{ color: '#fff', fontSize: 18 }} />}
        subtitle="管理自定义评估指标，支持新增、编辑和删除"
        searchPlaceholder="请输入指标名称"
        searchField="name"
        columns={columns}
        dataSource={data}
        createButtonText="新增指标"
        onCreate={handleOpenCreate}
        onRefresh={() => message.success('刷新成功')}
        emptyText="暂无评估指标"
        actionButtons={[
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
            <span style={{ fontWeight: 600 }}>新增评估指标</span>
          </div>
        }
        open={createModalVisible}
        onCancel={handleCancel}
        width={640}
        footer={
          <Space>
            <Button onClick={handleCancel}>取消</Button>
            <Button type="primary" onClick={handleSubmit} style={{ background: '#4f46e5' }}>
              确认
            </Button>
          </Space>
        }
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Divider orientation="horizontal" plain style={{ margin: '0 0 16px 0', color: '#64748b', fontSize: 12 }}>
            指标信息
          </Divider>

          <Form.Item
            label="指标名称"
            name="name"
            rules={[
              { required: true, message: '请输入指标名称' },
              { pattern: /^[\u4e00-\u9fa5a-zA-Z0-9_-]{1,32}$/, message: '支持中英文、数字，1-32字符' }
            ]}
          >
            <Input placeholder="请输入指标名称，如：BLEU、ROUGE-L" maxLength={32} showCount />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item
              label="指标类型"
              name="type"
              rules={[{ required: true, message: '请选择指标类型' }]}
            >
              <Select placeholder="请选择指标类型">
                {indicatorTypes.map(t => (
                  <Select.Option key={t.value} value={t.label}>{t.label}</Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              label="计算方式"
              name="calculationMethod"
              rules={[{ required: true, message: '请选择计算方式' }]}
            >
              <Select placeholder="请选择计算方式">
                {calculationMethods.map(m => (
                  <Select.Option key={m.value} value={m.label}>{m.label}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <Form.Item
            label="指标说明"
            name="description"
            rules={[{ required: true, message: '请输入指标说明' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="请详细描述该评估指标的含义和使用场景"
              maxLength={200}
              showCount
            />
          </Form.Item>

          <div style={{
            background: '#f8fafc',
            borderRadius: 8,
            padding: '12px 16px',
            border: '1px solid #e2e8f0'
          }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              <FundViewOutlined style={{ marginRight: 6 }} />
              提示：新增的评估指标将可用于效果评估任务的评估配置中
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
              <FundViewOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>指标详情</span>
          </div>
        }
        open={detailModalVisible}
        onCancel={handleCloseDetail}
        width={600}
        footer={<Button onClick={handleCloseDetail}>关闭</Button>}
      >
        {selectedRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="指标名称" span={2}>{selectedRecord.name}</Descriptions.Item>
            <Descriptions.Item label="指标类型">
              <Text style={{ color: '#4f46e5' }}>{selectedRecord.type}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="计算方式">
              <Text code>{selectedRecord.calculationMethod}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="指标说明" span={2}>{selectedRecord.description}</Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>{selectedRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default EvaluationIndicatorPage
