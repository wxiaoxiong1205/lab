import React, { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
  Dropdown,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowLeftOutlined, DatabaseOutlined, MoreOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  canRunTaskLifecycleAction,
  STARTING_TERMINATE_BLOCKED_MESSAGE,
  TASK_LIFECYCLE_TAG,
  type TaskLifecycleStatus,
} from '../../services/taskLifecycle'

const { Title, Text } = Typography

type InferenceMode = '离线推理' | '在线推理' | '导入推理结果集'
type DataUsage = '文本生成' | '图像理解'

type InferenceResultRecord = {
  id: string
  name: string
  progress: TaskLifecycleStatus
  dataUsage: DataUsage
  inferenceMode: InferenceMode
  importFile?: string
  pendingData: string
  pendingModel: string
  dataVolume: number | '-'
  createdAt: string
  description?: string
}

type InferenceDetailRow = {
  key: string
  input: string
  output: string
  status: string
}

const seedRows: InferenceResultRecord[] = [
  {
    id: 'inf-1',
    name: '推理结果集_2026_03_26_09_34_47',
    progress: '已完成',
    dataUsage: '文本生成',
    inferenceMode: '离线推理',
    pendingData: '验证数据集/验证-示例-1-json>V6',
    pendingModel: '123123',
    dataVolume: 20,
    createdAt: '2026/03/26 09:36:42',
    description: '',
  },
  {
    id: 'inf-2',
    name: '测试111',
    progress: '已创建',
    dataUsage: '文本生成',
    inferenceMode: '离线推理',
    pendingData: '验证集/多轮---1>V1',
    pendingModel: '123123',
    dataVolume: 6,
    createdAt: '2026/03/24 18:55:23',
    description: '',
  },
  {
    id: 'inf-3',
    name: '导入-文本生成-PROMPT_RESPONSE格式-推理结果集',
    progress: '已完成',
    dataUsage: '文本生成',
    inferenceMode: '导入推理结果集',
    importFile: 'PROMPT_RESPONSE_导入样例.xlsx',
    pendingData: '外部导入',
    pendingModel: '手输模型',
    dataVolume: 273,
    createdAt: '2026/03/24 11:06:59',
    description: '',
  },
  {
    id: 'inf-4',
    name: '推理结果集_2026_03_18_16_46_47',
    progress: '已完成',
    dataUsage: '图像理解',
    inferenceMode: '在线推理',
    pendingData: '外部导入',
    pendingModel: '手输模型',
    dataVolume: 18,
    createdAt: '2026/03/18 16:47:08',
    description: '',
  },
]

const sectionCardStyle: React.CSSProperties = {
  borderRadius: 18,
  border: '1px solid #e5e7eb',
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.04)',
}

function buildInferenceDetailRows(record: InferenceResultRecord): InferenceDetailRow[] {
  const inputPrefix = record.inferenceMode === '导入推理结果集' ? `${record.importFile || record.pendingData}` : record.pendingData
  return [
    {
      key: `${record.id}-1`,
      input: `${inputPrefix} / 样本1`,
      output: `${record.pendingModel} 输出示例 1`,
      status: record.progress,
    },
    {
      key: `${record.id}-2`,
      input: `${inputPrefix} / 样本2`,
      output: `${record.pendingModel} 输出示例 2`,
      status: record.progress,
    },
  ]
}

const InferenceResult: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { id } = useParams()
  const [form] = Form.useForm()
  const [rows, setRows] = useState(seedRows)
  const [searchValue, setSearchValue] = useState('')
  const [inferenceMode, setInferenceMode] = useState<InferenceMode | undefined>()
  const [dataUsage, setDataUsage] = useState<DataUsage | undefined>()
  const [detailRecord, setDetailRecord] = useState<InferenceResultRecord | null>(null)
  const isCreateRoute = location.pathname === '/inference/create'
  const isDetailRoute = Boolean(id) && !isCreateRoute
  const createInferenceMode = Form.useWatch('inferenceMode', form) as InferenceMode | undefined

  const selectedRecord = useMemo(
    () => (id ? rows.find(item => item.id === id || item.name === decodeURIComponent(id)) ?? null : null),
    [id, rows],
  )

  const filteredRows = useMemo(
    () =>
      rows.filter(item => {
        const matchSearch = !searchValue || item.name.toLowerCase().includes(searchValue.toLowerCase())
        const matchMode = !inferenceMode || item.inferenceMode === inferenceMode
        const matchUsage = !dataUsage || item.dataUsage === dataUsage
        return matchSearch && matchMode && matchUsage
      }),
    [dataUsage, inferenceMode, rows, searchValue],
  )

  const columns: ColumnsType<InferenceResultRecord> = [
    {
      title: '数据集名称',
      dataIndex: 'name',
      key: 'name',
      render: (value, record) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/inference/${record.id}`)}>
          {value}
        </Button>
      ),
    },
    {
      title: '推理进度',
      dataIndex: 'progress',
      key: 'progress',
      width: 120,
      render: (value: TaskLifecycleStatus) => <Tag color={TASK_LIFECYCLE_TAG[value].color}>{TASK_LIFECYCLE_TAG[value].label}</Tag>,
    },
    {
      title: '数据用途',
      dataIndex: 'dataUsage',
      key: 'dataUsage',
      width: 120,
      render: value => <Tag color={value === '文本生成' ? 'blue' : 'cyan'}>{value}</Tag>,
    },
    { title: '待推理数据', dataIndex: 'pendingData', key: 'pendingData', width: 220, ellipsis: true },
    { title: '待推理模型/服务', dataIndex: 'pendingModel', key: 'pendingModel', width: 200, ellipsis: true },
    { title: '数据量', dataIndex: 'dataVolume', key: 'dataVolume', width: 100 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 180 },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_, record) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            disabled={!canRunTaskLifecycleAction(record.progress, 'start') && !canRunTaskLifecycleAction(record.progress, 'resubmit')}
            onClick={() => {
              setRows(previous =>
                previous.map(item =>
                  item.id === record.id
                    ? { ...item, progress: canRunTaskLifecycleAction(item.progress, 'start') ? '启动中' : '已创建' }
                    : item,
                ),
              )
              message.success('任务状态已更新')
            }}
          >
            {canRunTaskLifecycleAction(record.progress, 'start')
              ? '启动'
              : canRunTaskLifecycleAction(record.progress, 'resubmit')
                ? '重新提交'
                : '启动'}
          </Button>
          <Button type="link" size="small" disabled={!canRunTaskLifecycleAction(record.progress, 'edit')}>
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            disabled={!canRunTaskLifecycleAction(record.progress, 'delete')}
            onClick={() => {
              setRows(previous => previous.filter(item => item.id !== record.id))
              message.success('删除成功')
            }}
          >
            删除
          </Button>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'detail', label: '查看详情' },
                ...(record.progress === '已完成' ? [{ key: 'evaluate', label: '去评估' }, { key: 'download', label: '下载' }] : []),
                ...(canRunTaskLifecycleAction(record.progress, 'terminate') ? [{ key: 'terminate', label: '终止' }] : []),
              ],
              onClick: ({ key }) => {
                if (key === 'detail') {
                  navigate(`/inference/${record.id}`)
                  return
                }
                if (key === 'evaluate') {
                  navigate('/effect-evaluation')
                  return
                }
                if (key === 'download') {
                  message.success(`开始下载：${record.name}`)
                  return
                }
                if (key === 'terminate') {
                  if (record.progress === '启动中') {
                    message.warning(STARTING_TERMINATE_BLOCKED_MESSAGE)
                    return
                  }
                  setRows(previous =>
                    previous.map(item => (item.id === record.id ? { ...item, progress: '已终止' } : item)),
                  )
                }
              },
            }}
          >
            <Button type="text" size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ]

  const openCreate = () => {
    form.resetFields()
    form.setFieldsValue({
      inferenceMode: '离线推理',
      dataUsage: '文本生成',
    })
    navigate('/inference/create')
  }

  const closeCreate = () => {
    navigate('/inference')
  }

  const submit = async () => {
    try {
      const values = await form.validateFields()
      setRows(previous => [
        {
          id: `inf-${Date.now()}`,
          name: values.name,
          progress: '已创建',
          dataUsage: values.dataUsage,
          inferenceMode: values.inferenceMode,
          importFile: values.importFile,
          pendingData: values.inferenceMode === '导入推理结果集' ? '外部导入' : values.pendingData,
          pendingModel: values.pendingModel,
          dataVolume: values.dataVolume ?? '-',
          createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
          description: values.description ?? '',
        },
        ...previous,
      ])
      message.success('推理结果集已创建')
      closeCreate()
    } catch {
      return
    }
  }

  if (isCreateRoute) {
    return (
      <div style={{ padding: '28px 32px 40px', minHeight: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={closeCreate}>返回</Button>
          <div>
            <Text strong style={{ display: 'block', fontSize: 26, color: '#0f172a', lineHeight: 1.15 }}>创建推理结果集</Text>
            <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 14, lineHeight: 1.7 }}>
              配置推理方式、模型和待推理数据来源。
            </Text>
          </div>
        </div>

        <Card style={sectionCardStyle}>
          <Form form={form} layout="vertical">
            <Form.Item label="数据集名称" name="name" rules={[{ required: true, message: '请输入数据集名称' }]}>
              <Input maxLength={50} showCount />
            </Form.Item>
            <Form.Item label="描述" name="description">
              <Input.TextArea rows={3} maxLength={300} showCount />
            </Form.Item>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Form.Item label="推理方式" name="inferenceMode" rules={[{ required: true, message: '请选择推理方式' }]}>
                <Select
                  options={[
                    { value: '离线推理', label: '离线推理' },
                    { value: '在线推理', label: '在线推理' },
                    { value: '导入推理结果集', label: '导入推理结果集' },
                  ]}
                />
              </Form.Item>
              <Form.Item label="数据用途" name="dataUsage" rules={[{ required: true, message: '请选择数据用途' }]}>
                <Select
                  options={[
                    { value: '文本生成', label: '文本生成' },
                    { value: '图像理解', label: '图像理解' },
                  ]}
                />
              </Form.Item>
            </div>

            {createInferenceMode === '导入推理结果集' ? (
              <>
                <Form.Item label="导入文件" name="importFile" rules={[{ required: true, message: '请输入导入文件名' }]}>
                  <Input placeholder="请输入导入文件名" />
                </Form.Item>
                <Form.Item label="手输模型" name="pendingModel" rules={[{ required: true, message: '请输入模型名称' }]}>
                  <Input placeholder="请输入模型名称" />
                </Form.Item>
                <Card
                  size="small"
                  style={{ borderRadius: 14, border: '1px solid #e2e8f0', marginBottom: 16, background: '#f8fafc' }}
                >
                  <Text type="secondary">导入场景会直接生成推理结果集，待推理数据固定记录为“外部导入”。</Text>
                </Card>
              </>
            ) : (
              <>
                <Form.Item label="待推理模型" name="pendingModel" rules={[{ required: true, message: '请选择待推理模型' }]}>
                  <Select
                    options={[
                      { value: '123123', label: '123123' },
                      { value: 'Qwen2-VL-2B-Instruct', label: 'Qwen2-VL-2B-Instruct' },
                      { value: '测试模型1', label: '测试模型1' },
                      { value: '手输模型', label: '手输模型' },
                    ]}
                  />
                </Form.Item>

                <Form.Item label="待推理数据" name="pendingData" rules={[{ required: true, message: '请选择待推理数据' }]}>
                  <Select
                    options={[
                      { value: '验证数据集/验证-示例-1-json>V6', label: '验证数据集/验证-示例-1-json>V6' },
                      { value: '验证集/多轮---1>V1', label: '验证集/多轮---1>V1' },
                      { value: '训练集/roleBased>V5', label: '训练集/roleBased>V5' },
                    ]}
                  />
                </Form.Item>
              </>
            )}

            <Form.Item label="数据量" name="dataVolume">
              <Input />
            </Form.Item>

            <Card size="small" style={{ borderRadius: 14, border: '1px solid #e2e8f0', marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <Text type="secondary">当前推理方式</Text>
                  <div style={{ marginTop: 6, fontWeight: 600 }}>{createInferenceMode || '-'}</div>
                </div>
                <div>
                  <Text type="secondary">待推理来源</Text>
                  <div style={{ marginTop: 6, fontWeight: 600 }}>
                    {createInferenceMode === '导入推理结果集'
                      ? form.getFieldValue('importFile') || '待填写导入文件'
                      : form.getFieldValue('pendingData') || '待选择数据集'}
                  </div>
                </div>
              </div>
            </Card>

            <div style={{ display: 'flex', gap: 12 }}>
              <Button onClick={closeCreate}>取消</Button>
              <Button type="primary" onClick={submit}>确定</Button>
            </div>
          </Form>
        </Card>
      </div>
    )
  }

  if (isDetailRoute && selectedRecord) {
    return (
      <div style={{ padding: '28px 32px 40px', minHeight: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/inference')}>返回列表</Button>
            <div>
              <Text strong style={{ display: 'block', fontSize: 26, color: '#0f172a', lineHeight: 1.15 }}>{selectedRecord.name}</Text>
              <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 14, lineHeight: 1.7 }}>
                查看推理结果集的任务状态、来源模型和推理明细。
              </Text>
            </div>
          </div>
          <Space>
            <Button disabled={selectedRecord.progress !== '已完成'} onClick={() => navigate('/effect-evaluation')}>去评估</Button>
            <Button onClick={() => message.success(`开始下载：${selectedRecord.name}`)}>下载</Button>
            <Button
              disabled={!canRunTaskLifecycleAction(selectedRecord.progress, 'terminate')}
              onClick={() => {
                if (selectedRecord.progress === '启动中') {
                  message.warning(STARTING_TERMINATE_BLOCKED_MESSAGE)
                  return
                }
                setRows(previous =>
                  previous.map(item => (item.id === selectedRecord.id ? { ...item, progress: '已终止' } : item)),
                )
              }}
            >
              终止
            </Button>
            <Button
              danger
              onClick={() => {
                setRows(previous => previous.filter(item => item.id !== selectedRecord.id))
                navigate('/inference')
              }}
            >
              删除
            </Button>
          </Space>
        </div>

        <Card title="基本信息" style={{ ...sectionCardStyle, marginBottom: 18 }}>
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="数据集名称" span={2}>{selectedRecord.name}</Descriptions.Item>
            <Descriptions.Item label="推理进度">
              <Tag color={TASK_LIFECYCLE_TAG[selectedRecord.progress].color}>{TASK_LIFECYCLE_TAG[selectedRecord.progress].label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="推理方式">{selectedRecord.inferenceMode}</Descriptions.Item>
            <Descriptions.Item label="数据用途">
              <Tag color={selectedRecord.dataUsage === '文本生成' ? 'blue' : 'cyan'}>{selectedRecord.dataUsage}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="待推理数据">{selectedRecord.pendingData}</Descriptions.Item>
            <Descriptions.Item label="待推理模型/服务">{selectedRecord.pendingModel}</Descriptions.Item>
            <Descriptions.Item label="导入文件">{selectedRecord.importFile || '-'}</Descriptions.Item>
            <Descriptions.Item label="数据量">{selectedRecord.dataVolume}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{selectedRecord.createdAt}</Descriptions.Item>
            <Descriptions.Item label="描述" span={2}>{selectedRecord.description || '-'}</Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="推理明细" style={sectionCardStyle}>
          <Table<InferenceDetailRow>
            rowKey="key"
            pagination={false}
            columns={[
              { title: '序号', key: 'index', width: 80, render: (_value, _row, index) => index + 1 },
              { title: '输入数据', dataIndex: 'input', key: 'input' },
              { title: '推理结果', dataIndex: 'output', key: 'output' },
              { title: '状态', dataIndex: 'status', key: 'status', width: 120 },
            ]}
            dataSource={buildInferenceDetailRows(selectedRecord)}
          />
        </Card>
      </div>
    )
  }

  return (
    <>
      <div style={{ padding: '28px 32px 40px', minHeight: '100%' }}>
        <Card style={sectionCardStyle}>
          <Title level={2} style={{ marginBottom: 8 }}>推理结果集</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
            管理推理数据集，适用于模型选型、效果评估或模型复用场景。
          </Text>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <Space wrap>
              <Input
                placeholder="搜索数据集名称"
                value={searchValue}
                onChange={event => setSearchValue(event.target.value)}
                style={{ width: 200 }}
              />
              <Select
                placeholder="推理方式"
                allowClear
                value={inferenceMode}
                onChange={value => setInferenceMode(value)}
                style={{ width: 140 }}
                options={[
                  { value: '离线推理', label: '离线推理' },
                  { value: '在线推理', label: '在线推理' },
                  { value: '导入推理结果集', label: '导入推理结果集' },
                ]}
              />
              <Select
                placeholder="数据用途"
                allowClear
                value={dataUsage}
                onChange={value => setDataUsage(value)}
                style={{ width: 140 }}
                options={[
                  { value: '文本生成', label: '文本生成' },
                  { value: '图像理解', label: '图像理解' },
                ]}
              />
              <Button onClick={() => message.success('搜索完成')}>搜索</Button>
              <Button onClick={() => {
                setSearchValue('')
                setInferenceMode(undefined)
                setDataUsage(undefined)
              }}>
                重置
              </Button>
            </Space>

            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => message.success('刷新成功')}>刷新</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>创建数据集</Button>
            </Space>
          </div>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredRows}
            scroll={{ x: 1400 }}
            tableLayout="fixed"
            pagination={{ pageSize: 10, showTotal: total => `共 ${total} 条数据` }}
          />
        </Card>
      </div>

      <Modal
        title="推理结果集详情"
        open={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
        footer={<Button onClick={() => setDetailRecord(null)}>关闭</Button>}
      >
        {detailRecord && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="数据集名称">{detailRecord.name}</Descriptions.Item>
            <Descriptions.Item label="推理进度">
              <Tag color={TASK_LIFECYCLE_TAG[detailRecord.progress].color}>{TASK_LIFECYCLE_TAG[detailRecord.progress].label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="数据用途">{detailRecord.dataUsage}</Descriptions.Item>
            <Descriptions.Item label="待推理数据">{detailRecord.pendingData}</Descriptions.Item>
            <Descriptions.Item label="待推理模型/服务">{detailRecord.pendingModel}</Descriptions.Item>
            <Descriptions.Item label="数据量">{detailRecord.dataVolume}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{detailRecord.createdAt}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  )
}

export default InferenceResult
