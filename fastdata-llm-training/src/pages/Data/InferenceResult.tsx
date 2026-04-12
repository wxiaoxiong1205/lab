import React, { useState } from 'react'
import { message, Modal, Form, Input, Select, Button, Typography, Space, Divider, Descriptions, Tag, Dropdown } from 'antd'
import { DatabaseOutlined, PlusOutlined, MoreOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'

const { Text } = Typography

const progressMap: Record<string, { color: string; label: string }> = {
  '已完成': { color: 'success', label: '已完成' },
  '处理中': { color: 'processing', label: '处理中' },
  '失败': { color: 'error', label: '失败' },
  '已创建': { color: 'default', label: '已创建' },
  '已终止': { color: 'warning', label: '已终止' },
}

const dataUsageTags: Record<string, { color: string; text: string }> = {
  '文本生成': { color: 'blue', text: '文本生成' },
  '图像理解': { color: 'cyan', text: '图像理解' },
}

const mockInferenceData = [
  { id: '1', name: '属性回归-推理结果集-22-333-444', progress: '已完成', dataUsage: '文本生成', pendingData: '测试数据集/属性回归测试-22-333-444>V1', pendingModel: 'qwen3-vl-plus-图像理解-在线推理服务1', dataVolume: 5, createdAt: '2026/04/03 15:41:36' },
  { id: '2', name: '删除测试3', progress: '已创建', dataUsage: '文本生成', pendingData: '测试数据集/测试-role-多轮-1>V1', pendingModel: 'Qwen2-VL-2B-Instruct', dataVolume: 4, createdAt: '2026/04/02 14:49:02' },
  { id: '3', name: '删除测试2', progress: '失败', dataUsage: '文本生成', pendingData: '训练数据集/测试----1>V1', pendingModel: '文本生成模型', dataVolume: 20, createdAt: '2026/04/02 14:14:35' },
  { id: '4', name: '推理结果集_删除测试1_20260402140634', progress: '已完成', dataUsage: '文本生成', pendingData: '测试数据集/测试--2>V2', pendingModel: 'Qwen3-Next-80B-A3B-Instruct-文本生成-在线推理服务', dataVolume: 20, createdAt: '2026/04/02 14:06:35' },
  { id: '5', name: '推理结果集_2026_04_02_14_03_41', progress: '失败', dataUsage: '文本生成', pendingData: '测试数据集/测试--1>V1', pendingModel: 'Qwen2-VL-2B-Instruct', dataVolume: 20, createdAt: '2026/04/01 14:43:25' },
  { id: '6', name: '图像理解-模型管理', progress: '已完成', dataUsage: '图像理解', pendingData: '验证数据集/图像-单轮多轮交叉-2>V1', pendingModel: '图像理解-模型管理', dataVolume: 12, createdAt: '2026/04/01 14:43:25' },
  { id: '7', name: '模型推理', progress: '已完成', dataUsage: '图像理解', pendingData: '验证数据集/图像-多轮-2>V1', pendingModel: 'basion-qwen2-vl-2b-in', dataVolume: 6, createdAt: '2026/04/01 10:29:34' },
  { id: '8', name: '在线Notebook-role文本生成模型训练-推理', progress: '失败', dataUsage: '文本生成', pendingData: '测试数据集/测试-role-单轮多轮交叉-1>V1', pendingModel: '在线Notebook-role文本生成模型训练', dataVolume: 8, createdAt: '2026/03/31 10:51:50' },
  { id: '9', name: '推理结果集_2026_03_31_10_51_32', progress: '已终止', dataUsage: '文本生成', pendingData: '验证数据集/验证-xlsx-1>V1', pendingModel: 'Qwen2-VL-2B-Instruct', dataVolume: 20, createdAt: '2026/03/31 10:51:50' },
  { id: '10', name: '在线Notebook-role文本生成模型管理-推理结果集', progress: '失败', dataUsage: '文本生成', pendingData: '验证数据集/验证-role-多轮-1>V1', pendingModel: '在线Notebook-role文本生成模型训练', dataVolume: 6, createdAt: '2026/03/30 11:49:58' },
]

const InferenceResult: React.FC = () => {
  const [inferenceMode, setInferenceMode] = useState<string | undefined>(undefined)
  const [dataUsage, setDataUsage] = useState<string | undefined>(undefined)
  const [searchValue, setSearchValue] = useState('')
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<typeof mockInferenceData[0] | null>(null)
  const [form] = Form.useForm()

  const filteredData = mockInferenceData.filter(item => {
    const matchSearch = !searchValue || item.name.toLowerCase().includes(searchValue.toLowerCase())
    const matchMode = !inferenceMode || item.pendingModel.includes(inferenceMode) || item.name.includes(inferenceMode)
    const matchUsage = !dataUsage || item.dataUsage === dataUsage
    return matchSearch && matchUsage
  })

  const handleOpenCreate = () => {
    form.resetFields()
    setCreateModalVisible(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      console.log('创建推理结果集:', values)
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

  const handleOpenDetail = (record: any) => {
    setSelectedRecord(record)
    setDetailModalVisible(true)
  }

  const handleCloseDetail = () => {
    setDetailModalVisible(false)
    setSelectedRecord(null)
  }

  const handleAction = (key: string, record: any) => {
    if (key === 'start') message.success(`启动推理: ${record.name}`)
    else if (key === 'edit') handleOpenDetail(record)
    else if (key === 'delete') message.success('删除成功')
  }

  const getActionItems = (record: any): MenuProps['items'] => [
    { key: 'start', label: '启动' },
    { key: 'edit', label: '编辑' },
    { key: 'delete', label: '删除', danger: true },
  ]

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        {/* 页面标题 */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 40, height: 40,
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
            }}>
              <DatabaseOutlined style={{ color: '#fff', fontSize: 18 }} />
            </div>
            <Text strong style={{ fontSize: 18, color: '#0f172a' }}>推理结果集</Text>
          </div>
          <Text type="secondary" style={{ fontSize: 13, marginLeft: 52 }}>
            管理推理数据集, 适用于模型选型、效果评估或模型复用场景。
          </Text>
        </div>

        {/* 工具栏 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Select
              placeholder="推理方式"
              allowClear
              style={{ width: 150 }}
              value={inferenceMode}
              onChange={val => setInferenceMode(val)}
              options={[
                { value: '离线推理', label: '离线推理' },
                { value: '在线推理', label: '在线推理' },
              ]}
            />
            <Select
              placeholder="数据用途"
              allowClear
              style={{ width: 150 }}
              value={dataUsage}
              onChange={val => setDataUsage(val)}
              options={[
                { value: '文本生成', label: '文本生成' },
                { value: '图像理解', label: '图像理解' },
              ]}
            />
            <Input
              prefix={<span style={{ color: '#94a3b8' }}>🔍</span>}
              placeholder="搜索"
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              allowClear
              style={{ borderRadius: 8, width: 200 }}
            />
            <Button onClick={() => { setSearchValue(''); setInferenceMode(undefined); setDataUsage(undefined) }}>重置</Button>
          </div>
          <Space>
            <Button icon={<span>🔄</span>} onClick={() => message.success('刷新成功')}>刷新</Button>
            <Button type="primary" icon={<span>➕</span>} onClick={handleOpenCreate}>创建数据集</Button>
          </Space>
        </div>

        {/* 表格 */}
        <div style={{
          background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['数据集名称', '推理进度', '数据用途', '待推理数据', '待推理模型/服务', '数据量', '创建时间', '操作'].map((col, i) => (
                  <th key={i} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredData.map(record => {
                const p = progressMap[record.progress] || { color: 'default', label: record.progress }
                const d = dataUsageTags[record.dataUsage] || { color: 'default', text: record.dataUsage }
                return (
                  <tr key={record.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#0f172a', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={record.name}>{record.name}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <Tag color={p.color}>{p.label}</Tag>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Tag color={d.color}>{d.text}</Tag>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={record.pendingData}>{record.pendingData}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={record.pendingModel}>{record.pendingModel}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#0f172a' }}>{record.dataVolume}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{record.createdAt}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <Dropdown menu={{ items: getActionItems(record), onClick: ({ key }) => handleAction(key, record) }} trigger={['click']}>
                        <Button type="text" size="small" icon={<MoreOutlined />} />
                      </Dropdown>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>共 {filteredData.length} 条数据</Text>
          </div>
        </div>
      </div>

      {/* 创建弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PlusOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>创建推理数据集</span>
          </div>
        }
        open={createModalVisible}
        onCancel={handleCancel}
        width={720}
        footer={
          <Space>
            <Button onClick={handleCancel}>取消</Button>
            <Button type="primary" onClick={handleSubmit}>确定</Button>
          </Space>
        }
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ inferenceMode: '离线推理', dataUsage: '文本生成' }}>
          <Divider plain style={{ margin: '0 0 16px', color: '#64748b', fontSize: 12 }}>基本信息</Divider>

          <Form.Item label="数据集名称" name="name" rules={[{ required: true, message: '请输入数据集名称' }]}>
            <Input placeholder="请输入数据集名称" maxLength={50} showCount />
          </Form.Item>

          <Form.Item label="描述" name="description">
            <Input.TextArea rows={2} placeholder="请输入描述（0 / 300）" maxLength={300} showCount />
          </Form.Item>

          <Divider plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>推理配置</Divider>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item label="推理方式" name="inferenceMode" rules={[{ required: true, message: '请选择推理方式' }]}>
              <Select placeholder="请选择推理方式">
                <Select.Option value="离线推理">离线推理</Select.Option>
                <Select.Option value="在线推理">在线推理</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item label="数据用途" name="dataUsage" rules={[{ required: true, message: '请选择数据用途' }]}>
              <Select placeholder="请选择数据用途">
                <Select.Option value="文本生成">文本生成</Select.Option>
                <Select.Option value="图像理解">图像理解</Select.Option>
              </Select>
            </Form.Item>
          </div>

          <Form.Item label="待推理模型" name="pendingModel" rules={[{ required: true, message: '请选择待推理模型' }]}>
            <Select placeholder="请选择待推理模型" showSearch>
              <Select.Option value="qwen3-nl-plus">qwen3-nl-plus</Select.Option>
              <Select.Option value="qwen2-vl-2b-instruct">Qwen2-VL-2B-Instruct</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label="待推理数据" name="pendingData" rules={[{ required: true, message: '请选择待推理数据' }]}>
            <Select placeholder="选择" showSearch>
              <Select.Option value="test_ds_1">测试数据集/属性回归测试{'>'}V1</Select.Option>
              <Select.Option value="test_ds_2">测试数据集/测试-role-多轮-1{'>'}V1</Select.Option>
            </Select>
          </Form.Item>

          <Divider plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>资源配置</Divider>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item label="显卡类型及型号" name="gpuType">
              <Select placeholder="请选择显卡类型及型号" />
            </Form.Item>
            <Form.Item label="显卡数量" name="gpuCount">
              <Select placeholder="1张" defaultValue="1张">
                <Select.Option value="1张">1张</Select.Option>
                <Select.Option value="2张">2张</Select.Option>
              </Select>
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item label="CPU 请求" name="cpuRequest">
              <Input suffix="Core" placeholder="请输入CPU请求数" />
            </Form.Item>
            <Form.Item label="CPU 限制" name="cpuLimit">
              <Input suffix="Core" placeholder="请输入CPU限制数" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Form.Item label="内存请求" name="memRequest">
              <Input suffix="GB" placeholder="请输入内存请求" />
            </Form.Item>
            <Form.Item label="内存限制" name="memLimit">
              <Input suffix="GB" placeholder="请输入内存限制" />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* 详情弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DatabaseOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>推理数据集详情</span>
          </div>
        }
        open={detailModalVisible}
        onCancel={handleCloseDetail}
        width={640}
        footer={<Button onClick={handleCloseDetail}>关闭</Button>}
      >
        {selectedRecord && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="数据集名称" span={2}>{selectedRecord.name}</Descriptions.Item>
            <Descriptions.Item label="推理进度">
              <Tag color={(progressMap[selectedRecord.progress] || { color: 'default' }).color}>{selectedRecord.progress}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="数据用途">
              <Tag color={(dataUsageTags[selectedRecord.dataUsage] || { color: 'default' }).color}>{selectedRecord.dataUsage}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="待推理数据" span={2}>{selectedRecord.pendingData}</Descriptions.Item>
            <Descriptions.Item label="待推理模型/服务" span={2}>{selectedRecord.pendingModel}</Descriptions.Item>
            <Descriptions.Item label="数据量">{selectedRecord.dataVolume} 条</Descriptions.Item>
            <Descriptions.Item label="创建时间">{selectedRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default InferenceResult
