import React, { useMemo, useState } from 'react'
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useLocation, useNavigate } from 'react-router-dom'
import { formatResourceLockMessage, getModelReferenceLocks } from '../../services/resourceReferenceGuard'
import { canAccessResourceData } from '../../services/permissionStore'
import { validateFieldsAndScroll } from '../../utils/formValidation'

const { Text, Title } = Typography

type ModelVersionStatus = '已创建' | '启动中' | '运行中' | '已终止' | '已完成' | '失败'
type FineTuneType = 'LoRA' | '全量微调'
type ModelTrainingMethod = 'SFT' | 'DPO' | 'RFT'
type RelatedTaskInfo =
  | {
      type: '大模型训练'
      taskName: string
      version: string
      checkpoint: string
    }
  | {
      type: '在线Notebook'
      taskName: string
      fileName: string
    }

type ModelVersionRecord = {
  id: string
  version: string
  description?: string
  baseModelName: string
  baseModelSource: '模型仓库' | '我的模型'
  trainingMethod: ModelTrainingMethod
  source: '大模型训练' | 'Notebook'
  relatedTask: RelatedTaskInfo
  status: ModelVersionStatus
  fineTuneType: FineTuneType
  taskVersion?: string
  checkpoint?: string
  creator: string
  createdAt: string
}

type ModelRecord = {
  id: string
  name: string
  modelType: string
  modelSource: '大模型训练' | 'Notebook'
  creator: string
  createdAt: string
  versions: ModelVersionRecord[]
}

const statusColorMap: Record<ModelVersionStatus, string> = {
  已创建: 'default',
  启动中: 'processing',
  运行中: 'blue',
  已终止: 'orange',
  已完成: 'success',
  失败: 'error',
}

const initialModels: ModelRecord[] = [
  {
    id: 'm-flow-test-1',
    name: '流转测试1',
    modelType: '文本生成',
    modelSource: '大模型训练',
    creator: 'lab1',
    createdAt: '2026/05/21 15:03:39',
    versions: [
      {
        id: 'm-flow-test-1-v1',
        version: 'V1',
        baseModelName: 'Qwen2.5-0.5B',
        baseModelSource: '模型仓库',
        trainingMethod: 'SFT',
        source: '大模型训练',
        relatedTask: { type: '大模型训练', taskName: '流转测试1', version: 'V1', checkpoint: 'checkpoint-1200' },
        status: '已创建',
        fineTuneType: 'LoRA',
        taskVersion: '流转测试1 / V1',
        checkpoint: 'checkpoint-1200',
        creator: 'lab1',
        createdAt: '2026/05/21 15:03:39',
      },
    ],
  },
  {
    id: 'm-status-flow-1',
    name: '状态流转测试1',
    modelType: '文本生成',
    modelSource: '大模型训练',
    creator: 'lab1',
    createdAt: '2026/05/20 11:18:30',
    versions: [
      { id: 'm-status-flow-1-v1', version: 'V1', description: '用于状态流转验证', baseModelName: '流转测试1 / V1', baseModelSource: '我的模型', trainingMethod: 'SFT', source: '大模型训练', relatedTask: { type: '大模型训练', taskName: '状态流转测试1', version: 'V1', checkpoint: 'checkpoint-900' }, status: '运行中', fineTuneType: 'LoRA', taskVersion: '状态流转测试1 / V1', checkpoint: 'checkpoint-900', creator: 'lab1', createdAt: '2026/05/20 11:18:30' },
    ],
  },
  {
    id: 'm-desc-test',
    name: '描述测试',
    modelType: '文本生成',
    modelSource: '大模型训练',
    creator: 'zhangsan',
    createdAt: '2026/05/19 09:16:24',
    versions: [
      { id: 'm-desc-test-v1', version: 'V1', description: '-', baseModelName: 'Qwen2.5-0.5B', baseModelSource: '模型仓库', trainingMethod: 'SFT', source: '大模型训练', relatedTask: { type: '大模型训练', taskName: '描述测试', version: 'V1', checkpoint: 'checkpoint-final' }, status: '已完成', fineTuneType: '全量微调', taskVersion: '描述测试 / V1', checkpoint: 'checkpoint-final', creator: 'zhangsan', createdAt: '2026/05/19 09:16:24' },
    ],
  },
  {
    id: 'm-dpo-role',
    name: 'DPO-ROLE_BASED-training-model',
    modelType: '文本生成',
    modelSource: '大模型训练',
    creator: 'deepexilab',
    createdAt: '2026/05/17 16:41:08',
    versions: [
      { id: 'm-dpo-role-v1', version: 'V1', description: 'Role-Based DPO 偏好模型', baseModelName: 'Qwen2.5-0.5B', baseModelSource: '模型仓库', trainingMethod: 'DPO', source: '大模型训练', relatedTask: { type: '大模型训练', taskName: 'DPO-ROLE_BASED', version: 'V1', checkpoint: 'checkpoint-1800' }, status: '已完成', fineTuneType: 'LoRA', taskVersion: 'DPO-ROLE_BASED / V1', checkpoint: 'checkpoint-1800', creator: 'deepexilab', createdAt: '2026/05/17 16:41:08' },
      { id: 'm-dpo-role-v2', version: 'V2', description: '补充偏好样本后生成', baseModelName: 'DPO-ROLE_BASED-training-model / V1', baseModelSource: '我的模型', trainingMethod: 'DPO', source: '大模型训练', relatedTask: { type: '大模型训练', taskName: 'DPO-ROLE_BASED', version: 'V2', checkpoint: 'checkpoint-2400' }, status: '已创建', fineTuneType: 'LoRA', taskVersion: 'DPO-ROLE_BASED / V2', checkpoint: 'checkpoint-2400', creator: 'deepexilab', createdAt: '2026/05/18 10:02:16' },
    ],
  },
  {
    id: 'm-alpaca',
    name: 'DPO-ALPACA-training-model',
    modelType: '文本生成',
    modelSource: '大模型训练',
    creator: 'zhangsan',
    createdAt: '2026/05/16 18:22:39',
    versions: [
      { id: 'm-alpaca-v1', version: 'V1', description: 'Alpaca DPO 模型', baseModelName: 'Qwen2.5-1.5B-Instruct', baseModelSource: '模型仓库', trainingMethod: 'DPO', source: '大模型训练', relatedTask: { type: '大模型训练', taskName: 'DPO-ALPACA', version: 'V1', checkpoint: 'checkpoint-final' }, status: '已完成', fineTuneType: '全量微调', taskVersion: 'DPO-ALPACA / V1', checkpoint: 'checkpoint-final', creator: 'zhangsan', createdAt: '2026/05/16 18:22:39' },
    ],
  },
]

const trainingTaskVersionOptions = [
  { value: '流转测试1 / V1', label: '流转测试1 / V1', baseModelName: 'Qwen2.5-0.5B', baseModelSource: '模型仓库' as const, trainingMethod: 'SFT' as ModelTrainingMethod, fineTuneType: 'LoRA' as FineTuneType, checkpoints: ['checkpoint-600', 'checkpoint-1200', 'checkpoint-final'] },
  { value: 'DPO-ROLE_BASED / V2', label: 'DPO-ROLE_BASED / V2', baseModelName: 'DPO-ROLE_BASED-training-model / V1', baseModelSource: '我的模型' as const, trainingMethod: 'DPO' as ModelTrainingMethod, fineTuneType: 'LoRA' as FineTuneType, checkpoints: ['checkpoint-1200', 'checkpoint-2400'] },
  { value: 'DPO-ALPACA / V1', label: 'DPO-ALPACA / V1', baseModelName: 'Qwen2.5-1.5B-Instruct', baseModelSource: '模型仓库' as const, trainingMethod: 'DPO' as ModelTrainingMethod, fineTuneType: '全量微调' as FineTuneType, checkpoints: ['checkpoint-final'] },
]

function getModelPathPart(pathname: string, pattern: RegExp): string | null {
  const matched = pathname.match(pattern)
  return matched?.[1] ? decodeURIComponent(matched[1]) : null
}

function getNextVersionName(model?: ModelRecord): string {
  return `V${(model?.versions.length ?? 0) + 1}`
}

function renderStatus(status: ModelVersionStatus): React.ReactNode {
  return <Tag color={statusColorMap[status]}>{status}</Tag>
}

function parseTaskVersion(value?: string): { taskName: string; version: string } {
  const [taskName = '未知任务', version = '-'] = value?.split('/').map(item => item.trim()) ?? []
  return { taskName, version }
}

function renderRelatedTask(task: RelatedTaskInfo): React.ReactNode {
  const primaryTextStyle: React.CSSProperties = { fontSize: 14, color: '#111827' }
  const secondaryTextStyle: React.CSSProperties = { fontSize: 13, color: '#8c8c8c' }

  if (task.type === '在线Notebook') {
    return (
      <div style={{ display: 'grid', gap: 4 }}>
        <Text style={primaryTextStyle}>{task.taskName}</Text>
        <Text style={secondaryTextStyle}>{task.fileName}</Text>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <Text style={primaryTextStyle}>{`${task.taskName} - ${task.version}`}</Text>
      <Text style={secondaryTextStyle}>{task.checkpoint}</Text>
    </div>
  )
}

const ModelManagement: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [createModelForm] = Form.useForm()
  const [versionForm] = Form.useForm()
  const [editVersionForm] = Form.useForm<{ description?: string }>()
  const [searchValue, setSearchValue] = useState('')
  const [rows, setRows] = useState<ModelRecord[]>(initialModels)
  const [editingVersion, setEditingVersion] = useState<{ modelId: string; versionId: string } | null>(null)

  const detailModelId = getModelPathPart(location.pathname, /^\/model\/([^/]+)$/)
  const addVersionModelId = getModelPathPart(location.pathname, /^\/model\/([^/]+)\/version\/create$/)
  const isCreateModelRoute = location.pathname === '/model/create'
  const detailModel = rows.find(item => item.id === detailModelId)
  const addVersionModel = rows.find(item => item.id === addVersionModelId)
  const selectedTrainingTaskVersion = Form.useWatch('taskVersion', versionForm) as string | undefined
  const selectedTaskVersionOption = trainingTaskVersionOptions.find(item => item.value === selectedTrainingTaskVersion)
  const editingModel = rows.find(item => item.id === editingVersion?.modelId)
  const editingModelVersion = editingModel?.versions.find(item => item.id === editingVersion?.versionId)

  const filteredModels = useMemo(
    () => rows.filter(item => item.name.toLowerCase().includes(searchValue.trim().toLowerCase())),
    [rows, searchValue],
  )

  const canOperateModel = (record?: Pick<ModelRecord, 'creator'> | null) =>
    canAccessResourceData('llm', record?.creator).allowed

  const warnNoModelDataAccess = (record?: Pick<ModelRecord, 'creator'> | null) => {
    const permission = canAccessResourceData('llm', record?.creator)
    if (permission.allowed) {
      return true
    }
    Modal.warning({ title: '权限不足', content: '当前账号仅可操作个人模型。' })
    return false
  }

  const deleteModel = (record: ModelRecord) => {
    if (!warnNoModelDataAccess(record)) {
      return
    }
    const locks = getModelReferenceLocks(record.name)
    if (locks.length) {
      Modal.warning({
        title: '模型正在被引用，暂不可删除',
        content: formatResourceLockMessage(record.name, locks),
      })
      return
    }

    setRows(previous => previous.filter(item => item.id !== record.id))
  }

  const submitCreateModel = async () => {
    const values = await validateFieldsAndScroll<Record<string, any>>(createModelForm, message)
    if (!values) {
      return
    }

    const model: ModelRecord = {
      id: `m-${Date.now()}`,
      name: values.name,
      modelType: values.modelType,
      modelSource: values.modelSource,
      creator: 'zhangsan',
      createdAt: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '/'),
      versions: [
        {
          id: `mv-${Date.now()}`,
          version: 'V1',
          description: values.description,
          baseModelName: values.baseModel,
          baseModelSource: '模型仓库',
          trainingMethod: 'SFT',
          source: values.modelSource,
          relatedTask:
            values.modelSource === 'Notebook'
              ? { type: '在线Notebook', taskName: values.name, fileName: 'model-artifact.bin' }
              : { type: '大模型训练', taskName: values.name, version: 'V1', checkpoint: '-' },
          status: '已创建',
          fineTuneType: 'LoRA',
          creator: 'zhangsan',
          createdAt: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '/'),
        },
      ],
    }
    setRows(previous => [model, ...previous])
    navigate(`/model/${model.id}`)
    message.success('模型创建成功')
  }

  const submitAddVersion = async () => {
    const model = addVersionModel
    if (!model) {
      return
    }
    if (!warnNoModelDataAccess(model)) {
      return
    }

    const values = await validateFieldsAndScroll<Record<string, any>>(versionForm, message)
    if (!values) {
      return
    }

    const taskVersion = trainingTaskVersionOptions.find(item => item.value === values.taskVersion)
    const parsedTaskVersion = parseTaskVersion(values.taskVersion)
    const version: ModelVersionRecord = {
      id: `mv-${Date.now()}`,
      version: getNextVersionName(model),
      description: values.description,
      baseModelName: taskVersion?.baseModelName ?? '未知模型',
      baseModelSource: taskVersion?.baseModelSource ?? '模型仓库',
      trainingMethod: taskVersion?.trainingMethod ?? 'SFT',
      source: '大模型训练',
      relatedTask: {
        type: '大模型训练',
        taskName: parsedTaskVersion.taskName,
        version: parsedTaskVersion.version,
        checkpoint: values.checkpoint,
      },
      status: '已创建',
      fineTuneType: taskVersion?.fineTuneType ?? 'LoRA',
      taskVersion: values.taskVersion,
      checkpoint: values.checkpoint,
      creator: 'zhangsan',
      createdAt: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '/'),
    }

    setRows(previous =>
      previous.map(item =>
        item.id === model.id
          ? {
              ...item,
              versions: [...item.versions, version],
            }
          : item,
      ),
    )
    navigate(`/model/${model.id}`)
    message.success(`已新增模型版本 ${version.version}`)
  }

  const updateVersionStatus = (modelId: string, versionId: string, status: ModelVersionStatus) => {
    setRows(previous =>
      previous.map(model =>
        model.id === modelId
          ? {
              ...model,
              versions: model.versions.map(version => (version.id === versionId ? { ...version, status } : version)),
            }
          : model,
      ),
    )
  }

  const deleteVersion = (modelId: string, versionId: string) => {
    setRows(previous =>
      previous.map(model =>
        model.id === modelId
          ? {
              ...model,
              versions: model.versions.filter(version => version.id !== versionId),
            }
          : model,
      ),
    )
  }

  const saveVersionEdit = async () => {
    if (!editingVersion) {
      return
    }
    const values = await editVersionForm.validateFields()
    setRows(previous =>
      previous.map(model =>
        model.id === editingVersion.modelId
          ? {
              ...model,
              versions: model.versions.map(version =>
                version.id === editingVersion.versionId ? { ...version, description: values.description } : version,
              ),
            }
          : model,
      ),
    )
    setEditingVersion(null)
    message.success('版本信息已保存')
  }

  const outerColumns: ColumnsType<ModelRecord> = [
    {
      title: '模型名称',
      dataIndex: 'name',
      key: 'name',
      render: (value, record) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/model/${record.id}`)}>
          {value}
        </Button>
      ),
    },
    { title: '模型类型', dataIndex: 'modelType', key: 'modelType', width: 180 },
    { title: '版本数量', key: 'versionCount', width: 150, render: (_, record) => record.versions.length },
    {
      title: '操作',
      key: 'action',
      width: 190,
      render: (_, record) => (
        <Space size={16}>
          <Button type="link" icon={<InfoCircleOutlined />} style={{ padding: 0 }} onClick={() => navigate(`/model/${record.id}`)}>
            详情
          </Button>
          <Popconfirm
            title="确认删除该模型吗？"
            description="删除后不可恢复。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteModel(record)}
          >
            <Button type="link" danger icon={<DeleteOutlined />} style={{ padding: 0 }} disabled={!canOperateModel(record)}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const versionColumns: ColumnsType<ModelVersionRecord> = [
    { title: '版本', dataIndex: 'version', key: 'version', width: 110 },
    { title: '描述', dataIndex: 'description', key: 'description', render: value => value || '-' },
    {
      title: '关联任务',
      dataIndex: 'relatedTask',
      key: 'relatedTask',
      width: 260,
      render: renderRelatedTask,
    },
    {
      title: '基础模型',
      key: 'baseModel',
      width: 240,
      render: (_, version) => (
        <Space size={8} wrap>
          <Text>{version.baseModelName}</Text>
          <Tag color={version.baseModelSource === '我的模型' ? 'purple' : 'blue'}>{version.baseModelSource}</Tag>
        </Space>
      ),
    },
    {
      title: '训练方法',
      dataIndex: 'trainingMethod',
      key: 'trainingMethod',
      width: 130,
      render: value => (
        <Tag color={value === 'DPO' ? 'green' : value === 'RFT' ? 'purple' : 'blue'} style={{ fontWeight: 600 }}>
          {value}
        </Tag>
      ),
    },
    { title: '状态', dataIndex: 'status', key: 'status', width: 140, render: value => renderStatus(value) },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 160 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 220 },
    {
      title: '操作',
      key: 'action',
      width: 390,
      render: (_, version) => {
        const isLora = version.fineTuneType === 'LoRA'
        const canStart = isLora && ['已创建', '失败', '已终止'].includes(version.status)
        const canTerminate = isLora && ['启动中', '运行中'].includes(version.status)
        const canEdit = version.status !== '已完成'

        return (
          <Space size={8} wrap={false} style={{ whiteSpace: 'nowrap' }}>
            {isLora ? (
              <Button
                type="link"
                size="small"
                icon={<PlayCircleOutlined />}
                disabled={!canStart}
                onClick={() => updateVersionStatus(detailModel!.id, version.id, '启动中')}
              >
                启动
              </Button>
            ) : null}
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              disabled={!canEdit}
              onClick={() => {
                setEditingVersion({ modelId: detailModel!.id, versionId: version.id })
                editVersionForm.setFieldsValue({ description: version.description })
              }}
            >
              编辑
            </Button>
            <Popconfirm
              title="确认删除该模型版本吗？"
              description="删除后不可恢复。"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() => deleteVersion(detailModel!.id, version.id)}
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
            {isLora ? (
              <>
                <Button
                  type="link"
                  size="small"
                  icon={<StopOutlined />}
                  disabled={!canTerminate}
                  onClick={() => updateVersionStatus(detailModel!.id, version.id, '已终止')}
                >
                  终止
                </Button>
                <Button
                  type="link"
                  size="small"
                  icon={<FileTextOutlined />}
                  style={{ paddingInline: 4 }}
                  onClick={() => Modal.info({ title: `${version.version} 日志`, content: `${version.version} 当前状态：${version.status}` })}
                >
                  查看日志
                </Button>
              </>
            ) : null}
          </Space>
        )
      },
    },
  ]

  if (isCreateModelRoute) {
    return (
      <div style={{ padding: '28px 32px', minHeight: '100%', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/model')}>返回</Button>
          <Space>
            <Button onClick={() => navigate('/model')}>取消</Button>
            <Button type="primary" onClick={submitCreateModel}>确定</Button>
          </Space>
        </div>
        <Card style={{ borderRadius: 12 }}>
          <Title level={3}>创建模型</Title>
          <Form form={createModelForm} layout="vertical" scrollToFirstError={{ behavior: 'smooth', block: 'center' }}>
            <Form.Item label="模型名称" name="name" rules={[{ required: true, message: '请输入模型名称' }]}>
              <Input placeholder="请输入模型名称" maxLength={64} />
            </Form.Item>
            <Form.Item label="模型类型" name="modelType" initialValue="文本生成" rules={[{ required: true, message: '请选择模型类型' }]}>
              <Select options={[{ value: '文本生成', label: '文本生成' }]} />
            </Form.Item>
            <Form.Item label="基础模型" name="baseModel" initialValue="Qwen2.5-0.5B" rules={[{ required: true, message: '请选择基础模型' }]}>
              <Select options={[{ value: 'Qwen2.5-0.5B', label: 'Qwen2.5-0.5B' }, { value: 'Qwen2.5-1.5B-Instruct', label: 'Qwen2.5-1.5B-Instruct' }]} />
            </Form.Item>
            <Form.Item label="模型来源" name="modelSource" initialValue="大模型训练" rules={[{ required: true, message: '请选择模型来源' }]}>
              <Select options={[{ value: '大模型训练', label: '大模型训练' }, { value: 'Notebook', label: 'Notebook' }]} />
            </Form.Item>
            <Form.Item label="模型描述" name="description">
              <Input.TextArea rows={4} maxLength={1000} showCount placeholder="请输入模型描述" />
            </Form.Item>
          </Form>
        </Card>
      </div>
    )
  }

  if (addVersionModelId) {
    if (!addVersionModel) {
      return (
        <div style={{ padding: 32 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/model')}>返回</Button>
          <Card style={{ marginTop: 24 }}>模型不存在</Card>
        </div>
      )
    }

    return (
      <div style={{ padding: '28px 32px', minHeight: '100%', background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 20, borderBottom: '1px solid #eef2f7', marginBottom: 28 }}>
          <Space>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/model/${addVersionModel.id}`)}>返回</Button>
            <Title level={3} style={{ margin: 0 }}>新增模型版本</Title>
          </Space>
          <Space>
            <Button onClick={() => navigate(`/model/${addVersionModel.id}`)}>取消</Button>
            <Button type="primary" onClick={submitAddVersion}>确定</Button>
          </Space>
        </div>

        <Form form={versionForm} layout="vertical" scrollToFirstError={{ behavior: 'smooth', block: 'center' }}>
          <Card style={{ borderRadius: 12, marginBottom: 20, border: '1px solid #e5e7eb', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)' }}>
            <Title level={3}>基础信息</Title>
            <div style={{ display: 'grid', gap: 22, padding: '8px 4px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', alignItems: 'center', columnGap: 24 }}>
                <span style={{ color: '#374151', fontSize: 15 }}>模型版本：</span>
                <span style={{ color: '#111827', fontSize: 15, fontWeight: 500 }}>{getNextVersionName(addVersionModel)}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', alignItems: 'start', columnGap: 24 }}>
                <span style={{ color: '#374151', fontSize: 15, paddingTop: 6 }}>模型描述：</span>
                <Form.Item name="description" style={{ marginBottom: 0, maxWidth: 520 }}>
                  <Input.TextArea rows={5} maxLength={1000} showCount placeholder="请输入版本描述" />
                </Form.Item>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', alignItems: 'center', columnGap: 24 }}>
                <span style={{ color: '#374151', fontSize: 15 }}>训练类型：</span>
                <span style={{ color: '#111827', fontSize: 15, fontWeight: 500 }}>{addVersionModel.modelType}</span>
              </div>
            </div>
          </Card>

          <Card style={{ borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)' }}>
            <Title level={3}>模型配置</Title>
            <div style={{ display: 'grid', gap: 22, padding: '8px 4px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', alignItems: 'center', columnGap: 24 }}>
                <span style={{ color: '#374151', fontSize: 15 }}><Text type="danger">*</Text> 模型来源：</span>
                <span style={{ color: '#111827', fontSize: 15, fontWeight: 500 }}>大模型训练</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', alignItems: 'start', columnGap: 24 }}>
                <span style={{ color: '#374151', fontSize: 15, paddingTop: 6 }}><Text type="danger">*</Text> 模型任务版本：</span>
                <Form.Item name="taskVersion" rules={[{ required: true, message: '请选择模型任务版本' }]} style={{ marginBottom: 0 }}>
                  <Select
                    placeholder="请选择模型任务版本"
                    options={trainingTaskVersionOptions.map(item => ({ value: item.value, label: item.label }))}
                    onChange={() => versionForm.setFieldValue('checkpoint', undefined)}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', alignItems: 'start', columnGap: 24 }}>
                <span style={{ color: '#374151', fontSize: 15, paddingTop: 6 }}><Text type="danger">*</Text> Checkpoint：</span>
                <Form.Item name="checkpoint" rules={[{ required: true, message: '请选择 checkpoint' }]} style={{ marginBottom: 0 }}>
                  <Select
                    disabled={!selectedTaskVersionOption}
                    placeholder="请选择step"
                    options={(selectedTaskVersionOption?.checkpoints ?? []).map(value => ({ value, label: value }))}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </div>
            </div>
          </Card>
        </Form>
      </div>
    )
  }

  if (detailModelId) {
    if (!detailModel) {
      return (
        <div style={{ padding: 32 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/model')}>返回</Button>
          <Card style={{ marginTop: 24 }}>模型不存在</Card>
        </div>
      )
    }

    return (
      <div style={{ padding: '28px 32px', minHeight: '100%', background: '#fff' }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/model')} style={{ marginBottom: 28 }}>
          返回
        </Button>

        <Title level={3}>基本信息</Title>
        <Card style={{ borderRadius: 12, marginBottom: 36, border: '1px solid #e5e7eb', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)' }}>
          <div style={{ display: 'grid', gap: 20, padding: '8px 4px' }}>
            {[
              ['模型名称：', detailModel.name],
              ['模型类型：', detailModel.modelType],
              ['模型来源：', detailModel.modelSource],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', alignItems: 'center', columnGap: 18 }}>
                <span style={{ color: '#8c8c8c', fontSize: 15 }}>{label}</span>
                <span style={{ color: '#111827', fontSize: 15, fontWeight: 500 }}>{value}</span>
              </div>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <Title level={3} style={{ margin: 0 }}>模型版本</Title>
          <Space>
            <Button icon={<ReloadOutlined />}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/model/${detailModel.id}/version/create`)}>
              新增版本
            </Button>
          </Space>
        </div>

        <Table
          rowKey="id"
          columns={versionColumns}
          dataSource={detailModel.versions}
          pagination={false}
          scroll={{ x: 1400 }}
        />

        <Modal
          title="编辑模型版本"
          open={Boolean(editingVersion)}
          onCancel={() => setEditingVersion(null)}
          onOk={saveVersionEdit}
          okText="保存"
          cancelText="取消"
        >
          <Form form={editVersionForm} layout="vertical">
            <Form.Item label="版本" style={{ marginBottom: 12 }}>
              <Input value={editingModelVersion?.version} disabled />
            </Form.Item>
            <Form.Item label="模型描述" name="description">
              <Input.TextArea rows={4} maxLength={1000} showCount placeholder="请输入版本描述" />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 32px', minHeight: '100%', background: '#fff' }}>
      <Card style={{ borderRadius: 14, border: '1px solid #f1f5f9' }}>
        <Title level={3} style={{ marginBottom: 42 }}>模型管理</Title>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 22 }}>
          <div style={{ color: '#0958d9', borderBottom: '3px solid #0958d9', paddingBottom: 12, fontWeight: 600 }}>我的模型</div>
          <Space size={18}>
            <Input
              allowClear
              placeholder="搜索模型名称"
              value={searchValue}
              onChange={event => setSearchValue(event.target.value)}
              suffix={<SearchOutlined style={{ color: '#64748b', fontSize: 16 }} />}
              style={{ width: 320 }}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/model/create')}>
              创建模型
            </Button>
          </Space>
        </div>
        <Table
          rowKey="id"
          columns={outerColumns}
          dataSource={filteredModels}
          pagination={false}
        />
      </Card>
    </div>
  )
}

export default ModelManagement
