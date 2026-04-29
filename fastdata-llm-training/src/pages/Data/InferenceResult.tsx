import React, { useMemo, useState } from 'react'
import {
  Button,
  Card,
  Cascader,
  Descriptions,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftOutlined,
  FileTextOutlined,
  MoreOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  canRunTaskLifecycleAction,
  STARTING_TERMINATE_BLOCKED_MESSAGE,
  TASK_LIFECYCLE_TAG,
  type TaskLifecycleStatus,
} from '../../services/taskLifecycle'
import DatasetSelectModal, { type SelectedDatasetVersionRow } from '../../components/DatasetSelectModal'

const { Title, Text } = Typography

type InferenceMode = '离线推理' | '在线推理' | '导入推理结果集'
type DataUsage = '文本生成' | '图像理解'
type ImportDataUsage = '文本生成 / SFT' | '文本生成 / DPO' | '文本生成 / RFT-PPO' | '文本生成 / RFT-GRPO' | '图像理解'

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

const pendingModelOptions = [
  {
    value: 'model-repository',
    label: '模型仓库',
    children: [
      { value: 'Qwen2.5-7B-Instruct', label: 'Qwen2.5-7B-Instruct' },
      { value: 'Qwen2-VL-2B-Instruct', label: 'Qwen2-VL-2B-Instruct' },
      { value: 'Qwen2.5-0.5B-Instruct-GPTQ-Int8', label: 'Qwen2.5-0.5B-Instruct-GPTQ-Int8' },
    ],
  },
  {
    value: 'my-model',
    label: '我的模型',
    children: [
      {
        value: '金融客服回复质量模型',
        label: '金融客服回复质量模型',
        children: [
          { value: 'V3', label: 'V3' },
          { value: 'V2', label: 'V2' },
          { value: 'V1', label: 'V1' },
        ],
      },
      {
        value: '内容安全审核模型',
        label: '内容安全审核模型',
        children: [
          { value: 'V2', label: 'V2' },
          { value: 'V1', label: 'V1' },
        ],
      },
    ],
  },
]

const importUsageOptions: ImportDataUsage[] = [
  '文本生成 / SFT',
  '文本生成 / DPO',
  '文本生成 / RFT-PPO',
  '文本生成 / RFT-GRPO',
  '图像理解',
]

function normalizeModelLabel(value: unknown) {
  return Array.isArray(value) ? value.slice(1).join(' / ') : String(value || '')
}

function getBaseDataUsage(value?: ImportDataUsage): DataUsage {
  return value === '图像理解' ? '图像理解' : '文本生成'
}

function getImportDataFormatOptions(value?: ImportDataUsage) {
  if (value === '文本生成 / DPO') return ['Chosen_Rejected']
  if (value === '文本生成 / RFT-PPO' || value === '文本生成 / RFT-GRPO') return ['Completion_Reward']
  if (value === '图像理解') return ['image_text_pair']
  return ['PROMPT_RESPONSE', 'ROLE_BASED']
}

function buildDefaultInferenceName() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `推理结果集_${now.getFullYear()}_${pad(now.getMonth() + 1)}_${pad(now.getDate())}_${pad(now.getHours())}_${pad(now.getMinutes())}_${pad(now.getSeconds())}`
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
  const [datasetPickerOpen, setDatasetPickerOpen] = useState(false)
  const [selectedPendingDataset, setSelectedPendingDataset] = useState<SelectedDatasetVersionRow | null>(null)
  const isCreateRoute = location.pathname === '/inference/create'
  const isDetailRoute = Boolean(id) && !isCreateRoute
  const createInferenceMode = Form.useWatch('inferenceMode', form) as InferenceMode | undefined
  const selectedModelValue = Form.useWatch('pendingModel', form) as string[] | undefined
  const importDataUsage = Form.useWatch('importDataUsage', form) as ImportDataUsage | undefined
  const createFormInitialValues = useMemo(
    () => ({
      name: buildDefaultInferenceName(),
      inferenceMode: '离线推理',
      taskSchedule: false,
      temperature: 0.7,
      topP: 1.0,
      presencePenalty: 0.0,
      gpuCount: 1,
      cpuRequest: 4,
      cpuLimit: 8,
      memoryRequest: 16,
      memoryLimit: 32,
    }),
    [],
  )

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
    setSelectedPendingDataset(null)
    form.setFieldsValue({
      name: buildDefaultInferenceName(),
      inferenceMode: '离线推理',
      taskSchedule: false,
      temperature: 0.7,
      topP: 1.0,
      presencePenalty: 0.0,
      gpuCount: 1,
      cpuRequest: 4,
      cpuLimit: 8,
      memoryRequest: 16,
      memoryLimit: 32,
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
          dataUsage: values.inferenceMode === '导入推理结果集'
            ? getBaseDataUsage(values.importDataUsage)
            : (selectedPendingDataset?.dataUsage === '图像理解' ? '图像理解' : '文本生成') as DataUsage,
          inferenceMode: values.inferenceMode,
          importFile: values.importFile,
          pendingData: values.inferenceMode === '导入推理结果集' ? '外部导入' : values.pendingData,
          pendingModel: values.inferenceMode === '导入推理结果集' ? values.importModelName : normalizeModelLabel(values.pendingModel),
          dataVolume: values.inferenceMode === '导入推理结果集' ? '-' : selectedPendingDataset?.sampleCount ?? '-',
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

  const adjustModelParameter = (field: string, delta: number, min?: number, max?: number) => {
    const current = Number(form.getFieldValue(field) ?? 0)
    const next = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, current + delta))
    form.setFieldValue(field, Number(next.toFixed(2)))
  }

  const renderParameterInput = (
    field: string,
    placeholder: string,
    delta: number,
    min?: number,
    max?: number,
  ) => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 36px 36px',
        width: '100%',
        alignItems: 'stretch',
      }}
    >
      <Form.Item name={field} noStyle>
        <InputNumber
          controls={false}
          placeholder={placeholder}
          min={min}
          max={max}
          style={{ width: '100%' }}
        />
      </Form.Item>
      <Button style={{ borderLeft: 0, borderRadius: 0 }} onClick={() => adjustModelParameter(field, -delta, min, max)}>
        -
      </Button>
      <Button style={{ borderLeft: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }} onClick={() => adjustModelParameter(field, delta, min, max)}>
        +
      </Button>
    </div>
  )

  if (isCreateRoute) {
    return (
      <>
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
            <Form form={form} layout="vertical" initialValues={createFormInitialValues}>
              <Form.Item label="数据集名称" name="name" rules={[{ required: true, message: '请输入数据集名称' }]}>
                <Input maxLength={50} showCount />
              </Form.Item>
              <Form.Item label="描述" name="description">
                <Input.TextArea rows={3} maxLength={300} showCount />
              </Form.Item>

              <Form.Item label="推理方式" name="inferenceMode" rules={[{ required: true, message: '请选择推理方式' }]}>
                <Radio.Group
                  onChange={() => {
                    setSelectedPendingDataset(null)
                    form.setFieldsValue({
                      pendingModel: undefined,
                      pendingData: undefined,
                      importFile: undefined,
                      importModelName: undefined,
                      importDataUsage: undefined,
                      importDataFormat: undefined,
                    })
                  }}
                  options={[
                    { value: '离线推理', label: '离线推理' },
                    { value: '在线推理', label: '在线推理' },
                    { value: '导入推理结果集', label: '导入推理结果集' },
                  ]}
                />
              </Form.Item>

              {createInferenceMode !== '导入推理结果集' ? (
                <Form.Item label="任务定时配置" name="taskSchedule" valuePropName="checked">
                  <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                </Form.Item>
              ) : null}

              {createInferenceMode === '导入推理结果集' ? (
                <>
                  <Form.Item label="上传方式" name="uploadMode" initialValue="本地上传">
                    <Radio.Group options={[{ value: '本地上传', label: '本地上传' }]} />
                  </Form.Item>
                  <Form.Item label="模型名称" name="importModelName" rules={[{ required: true, message: '请输入模型名称' }]}>
                    <Input placeholder="请输入模型名称" />
                  </Form.Item>
                  <Form.Item label="数据用途" name="importDataUsage" rules={[{ required: true, message: '请选择数据用途' }]}>
                    <Radio.Group
                      optionType="button"
                      buttonStyle="solid"
                      onChange={() => form.setFieldValue('importDataFormat', undefined)}
                      options={importUsageOptions.map(value => ({ value, label: value }))}
                    />
                  </Form.Item>
                  <Form.Item label="数据格式" name="importDataFormat" rules={[{ required: true, message: '请选择数据格式' }]}>
                    <Radio.Group
                      options={getImportDataFormatOptions(importDataUsage).map(value => ({ value, label: value }))}
                    />
                  </Form.Item>
                  <Form.Item label="上传文件">
                    <div
                      style={{
                        border: '1px dashed #d9d9d9',
                        borderRadius: 14,
                        padding: '34px 24px',
                        textAlign: 'center',
                        background: '#fcfcfd',
                      }}
                    >
                      <UploadOutlined style={{ fontSize: 36, color: '#1677ff', marginBottom: 12 }} />
                      <div style={{ fontSize: 16, marginBottom: 8 }}>点击或拖拽文件到此区域上传</div>
                      <Text type="secondary">支持 .jsonl/.json/.xlsx 格式，单个文件不超过 100MB</Text>
                      <Form.Item name="importFile" rules={[{ required: true, message: '请输入或选择上传文件' }]} noStyle>
                        <Input placeholder="请输入导入文件名" style={{ marginTop: 18 }} />
                      </Form.Item>
                    </div>
                  </Form.Item>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 28, marginBottom: 20 }}>
                    <Text>下载示例文件：</Text>
                    {['JSONL 格式', 'JSON 格式', 'XLSX 格式'].map(item => (
                      <Button key={item} type="link" icon={<FileTextOutlined />} style={{ padding: 0 }}>
                        {item}
                      </Button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <Form.Item label="待推理模型" name="pendingModel" rules={[{ required: true, message: '请选择待推理模型' }]}>
                    <Cascader
                      placeholder="请选择待推理模型"
                      options={pendingModelOptions}
                      expandTrigger="hover"
                      changeOnSelect={false}
                    />
                  </Form.Item>

                  {selectedModelValue?.length ? (
                    <Card
                      title="推理模型参数设置"
                      size="small"
                      style={{ borderRadius: 14, border: '1px solid #e2e8f0', marginBottom: 20 }}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', rowGap: 20, columnGap: 24, alignItems: 'center' }}>
                        <Text>
                          max_tokens(最大生成token数)
                          <Tooltip title="留空表示不限制最大生成 token 数。"><QuestionCircleOutlined style={{ marginLeft: 4, color: '#64748b' }} /></Tooltip>：
                        </Text>
                        {renderParameterInput('maxTokens', '留空表示不限制', 1, 1)}
                        <Text>
                          <span style={{ color: '#ff4d4f' }}>* </span>Temperature（温度）
                          <Tooltip title="控制生成随机性，值越高越发散。"><QuestionCircleOutlined style={{ marginLeft: 4, color: '#64748b' }} /></Tooltip>：
                        </Text>
                        {renderParameterInput('temperature', '0.7', 0.1, 0, 2)}
                        <Text>
                          <span style={{ color: '#ff4d4f' }}>* </span>Top_p（核采样）
                          <Tooltip title="控制候选 token 的累计概率范围。"><QuestionCircleOutlined style={{ marginLeft: 4, color: '#64748b' }} /></Tooltip>：
                        </Text>
                        {renderParameterInput('topP', '1.0', 0.1, 0, 1)}
                        <Text>
                          <span style={{ color: '#ff4d4f' }}>* </span>presence_penalty（存在性惩罚）
                          <Tooltip title="提高该值可降低重复表达。"><QuestionCircleOutlined style={{ marginLeft: 4, color: '#64748b' }} /></Tooltip>：
                        </Text>
                        {renderParameterInput('presencePenalty', '0.0', 0.1, -2, 2)}
                      </div>
                    </Card>
                  ) : null}

                  <Form.Item label="待推理数据" name="pendingData" rules={[{ required: true, message: '请选择待推理数据' }]}>
                    <Input
                      readOnly
                      placeholder="请选择数据集分类、数据集和版本"
                      addonAfter={
                        <Button type="link" size="small" onClick={() => setDatasetPickerOpen(true)}>
                          选择
                        </Button>
                      }
                    />
                  </Form.Item>
                </>
              )}

              {createInferenceMode === '离线推理' ? (
                <Card
                  title="显卡资源配置"
                  size="small"
                  style={{ borderRadius: 14, border: '1px solid #e2e8f0', marginBottom: 20 }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))', gap: 16 }}>
                    <Form.Item label="GPU 类型" name="gpuType">
                      <Select
                        placeholder="请选择 GPU 类型"
                        options={[
                          { value: 'NVIDIA-A10', label: 'NVIDIA A10' },
                          { value: 'NVIDIA-A100', label: 'NVIDIA A100' },
                          { value: 'NVIDIA-L20', label: 'NVIDIA L20' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item label="GPU 数量" name="gpuCount">
                      <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item label="CPU Request" name="cpuRequest">
                      <InputNumber min={1} addonAfter="Core" style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item label="CPU Limit" name="cpuLimit">
                      <InputNumber min={1} addonAfter="Core" style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item label="Memory Request" name="memoryRequest">
                      <InputNumber min={1} addonAfter="Gi" style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item label="Memory Limit" name="memoryLimit">
                      <InputNumber min={1} addonAfter="Gi" style={{ width: '100%' }} />
                    </Form.Item>
                  </div>
                </Card>
              ) : null}

              <div style={{ display: 'flex', gap: 12 }}>
                <Button onClick={closeCreate}>取消</Button>
                <Button type="primary" onClick={submit}>确定</Button>
              </div>
            </Form>
          </Card>
        </div>

        <DatasetSelectModal
          open={datasetPickerOpen}
          title="选择待推理数据集"
          mode="single"
          trainingType="text"
          defaultDataType="验证数据集"
          detailedDataUsage
          defaultSelectedKeys={selectedPendingDataset ? [selectedPendingDataset.key] : []}
          onCancel={() => setDatasetPickerOpen(false)}
          onConfirm={selectedRows => {
            const selected = selectedRows[0]
            if (!selected) {
              setSelectedPendingDataset(null)
              form.setFieldValue('pendingData', undefined)
              setDatasetPickerOpen(false)
              return
            }
            setSelectedPendingDataset(selected)
            form.setFieldValue('pendingData', `${selected.datasetName}>${selected.version}`)
            setDatasetPickerOpen(false)
          }}
        />
      </>
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
