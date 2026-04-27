import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftOutlined,
  CopyOutlined,
  DeleteOutlined,
  EyeOutlined,
  LinkOutlined,
  MoreOutlined,
  PauseCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Button,
  Cascader,
  Card,
  Descriptions,
  Dropdown,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  canRunTaskLifecycleAction,
  TASK_LIFECYCLE_TAG,
  type TaskLifecycleStatus,
} from '../../services/taskLifecycle'
import { getCurrentUser, usePermissionStore } from '../../services/permissionStore'

const { Text, Title, Paragraph } = Typography

type NotebookStatus = TaskLifecycleStatus

type OpenPortRecord = {
  id: string
  protocol: 'TCP' | 'UDP'
  port: number
  purpose: string
}

type SSHConfigRecord = {
  username: string
  sshKey: string
  sshCommand: string
}

type MyNotebookRecord = {
  id: string
  name: string
  description: string
  image: string
  sshSupported: boolean
  status: NotebookStatus
  spec: string
  runtimeLimit: string
  createdAt: string
  updatedAt: string
  aiService?: string
  dataset?: string
  model?: string
  cpuRequest: string
  cpuLimit: string
  memoryRequest: string
  memoryLimit: string
  gpuEnabled: boolean
  gpuType?: string
  gpuCount?: number
  runtimeEnabled: boolean
  runtimeHours?: number
  runtimeMinutes?: number
  openPorts: OpenPortRecord[]
  sshConfig?: SSHConfigRecord
}

type SquareNotebookRecord = {
  id: string
  name: string
  description: string
  creatorAccount: string
  creator: string
  createdAt: string
  sourceNotebookId?: string
}

type OpenPortFormValue = {
  protocol?: 'TCP' | 'UDP'
  port?: number
  purpose?: string
}

interface CreateFormValues {
  name?: string
  description?: string
  aiService?: string[]
  dataset?: string
  model?: string
  cpuRequest?: number
  cpuLimit?: number
  memoryRequest?: number
  memoryLimit?: number
  gpuEnabled?: boolean
  gpuType?: string
  gpuCount?: number
  runtimeEnabled?: boolean
  runtimeHours?: number
  runtimeMinutes?: number
  image?: string
  openPorts?: OpenPortFormValue[]
}

const aiServiceOptions = [
  {
    value: '在线推理服务',
    label: '在线推理服务',
    children: [
      { value: '在线推理服务-A', label: '在线推理服务-A' },
      { value: '在线推理服务-B', label: '在线推理服务-B' },
    ],
  },
]

const datasetOptions = [
  { value: '训练数据集/roleBased-V5', label: '训练数据集/roleBased-V5' },
  { value: '训练数据集/小量训练数据-xjh-test-V3', label: '训练数据集/小量训练数据-xjh-test-V3' },
]

const modelOptions = [
  { value: 'Qwen2.5-7B-Instruct', label: 'Qwen2.5-7B-Instruct' },
  { value: 'Qwen3-8B', label: 'Qwen3-8B' },
]

type NotebookImageOption = {
  value: string
  label: string
  source: 'system' | 'custom'
  namespace: string
  imageName: string
  version: string
  imageType: string
  createdAt: string
  pythonVersion: string
  framework: string
}

const imageOptions: NotebookImageOption[] = [
  {
    value: 'lab-cn-guangzhou.cr.volces.com/fs/jupyter/deepexi-notebook:torch_2.5-cann_8.0.rc1-py311-ubuntu22.04',
    label: 'torch_2.5-cann_8.0.rc1-py311-ubuntu22.04',
    source: 'system',
    namespace: 'fs',
    imageName: 'jupyter/deepexi-notebook',
    version: 'torch_2.5-cann_8.0.rc1-py311-ubuntu22.04',
    imageType: 'GPU镜像',
    createdAt: '2026-04-12 15:28:09',
    pythonVersion: 'python3.11',
    framework: 'Pytorch 2.x',
  },
  {
    value: 'jupyter/deepexi-notebook:datascience-cpu-python',
    label: 'datascience-cpu-python',
    source: 'system',
    namespace: 'fs',
    imageName: 'jupyter/deepexi-notebook',
    version: 'datascience-cpu-python312-ubuntu24.04',
    imageType: 'CPU镜像',
    createdAt: '2025-11-12 15:28:09',
    pythonVersion: 'python3.12',
    framework: 'torch 2.x',
  },
  {
    value: 'registry.deepexi.com/notebook/custom-ml-runtime:1.0.3',
    label: 'custom-ml-runtime:1.0.3',
    source: 'custom',
    namespace: 'custom',
    imageName: 'notebook/custom-ml-runtime',
    version: '1.0.3',
    imageType: 'GPU镜像',
    createdAt: '2026-03-18 10:12:00',
    pythonVersion: 'python3.11',
    framework: 'Pytorch 2.x',
  },
]

const gpuTypeOptions = [
  { value: 'NVIDIA Tesla T4', label: 'NVIDIA Tesla T4' },
  { value: 'NVIDIA A10', label: 'NVIDIA A10' },
]

const myNotebooksSeed: MyNotebookRecord[] = [
  {
    id: 'nb-1',
    name: '3rwrwr',
    description: '用于文本生成实验的 Notebook，包含默认 torch 环境。',
    image: 'lab-cn-guangzhou.cr.volces.com/fs/jupyter/deepexi-notebook:torch_2.5-cann_8.0.rc1-py311-ubuntu22.04',
    sshSupported: true,
    status: '已创建',
    spec: 'CPU Only\nCPU: 4 Core / 内存: 16 GB',
    runtimeLimit: '-',
    createdAt: '2026/4/14 15:21:19',
    updatedAt: '2026/4/21 11:03:18',
    aiService: '在线推理服务-A',
    dataset: '训练数据集/roleBased-V5',
    model: 'Qwen2.5-7B-Instruct',
    cpuRequest: '4 Core',
    cpuLimit: '8 Core',
    memoryRequest: '16 GB',
    memoryLimit: '32 GB',
    gpuEnabled: false,
    runtimeEnabled: false,
    openPorts: [
      { id: 'port-1', protocol: 'TCP', port: 8000, purpose: 'Web UI' },
      { id: 'port-2', protocol: 'TCP', port: 8888, purpose: 'Jupyter Lab' },
    ],
    sshConfig: {
      username: 'lab',
      sshKey: 'SHA256:PO9za4v8KR0nQZHMIjPYXmnU8a3mA1uEBCexONB4yyYA',
      sshCommand: 'ssh -p 31088 lab@ssh-zGVlcGV4aWxhYI9rZXIfc3NoOojc5QDUzMA==@deepexilab-test.deepexi.com',
    },
  },
  {
    id: 'nb-2',
    name: '新建 Notebook-选带标签的镜像',
    description: '带业务标签镜像的 Notebook 示例。',
    image: 'jupyter/deepexi-notebook:datascience-cpu-python',
    sshSupported: false,
    status: '已终止',
    spec: '1x GPU\nCPU: 2 Core / 内存: 8 GB',
    runtimeLimit: '2小时30分钟',
    createdAt: '2026/3/25 15:19:10',
    updatedAt: '2026/4/20 09:21:10',
    aiService: '-',
    dataset: '训练数据集/小量训练数据-xjh-test-V3',
    model: 'Qwen3-8B',
    cpuRequest: '2 Core',
    cpuLimit: '4 Core',
    memoryRequest: '8 GB',
    memoryLimit: '16 GB',
    gpuEnabled: true,
    gpuType: 'NVIDIA Tesla T4',
    gpuCount: 1,
    runtimeEnabled: true,
    runtimeHours: 2,
    runtimeMinutes: 30,
    openPorts: [{ id: 'port-3', protocol: 'TCP', port: 7860, purpose: 'Gradio UI' }],
  },
]

const squareNotebooks: SquareNotebookRecord[] = [
  {
    id: 'sq-1',
    name: '新建 Notebook-无数据集和模型-案例',
    description: '',
    creatorAccount: 'zhangsan',
    creator: '平台',
    createdAt: '2026/03/23 09:20:00',
  },
  {
    id: 'sq-2',
    name: '新建 Notebook-1-lab5发布的案例',
    description: '# 3.23金价暴跌事件 2026年3月23日上午，国内黄金价迅速暴跌破1000元...',
    creatorAccount: 'lisi',
    creator: 'lab5',
    createdAt: '2026/03/23 11:08:00',
  },
]

const cardStyle: React.CSSProperties = {
  borderRadius: 20,
  border: '1px solid #dbe5f3',
  boxShadow: '0 16px 32px rgba(15, 23, 42, 0.05)',
}

const sectionCardStyle: React.CSSProperties = {
  borderRadius: 18,
  border: '1px solid #e2e8f0',
  background: '#ffffff',
}

const codeBlockStyle: React.CSSProperties = {
  margin: 0,
  padding: '14px 16px',
  borderRadius: 14,
  background: '#0f172a',
  color: '#e2e8f0',
  fontSize: 13,
  lineHeight: 1.7,
  fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
}

function statusTag(status: NotebookStatus): React.ReactNode {
  const config = TASK_LIFECYCLE_TAG[status]
  return <Tag color={config.color}>{config.label}</Tag>
}

function getCreateInitialValues(): CreateFormValues {
  return {
    name: '',
    description: '',
    aiService: undefined,
    dataset: undefined,
    model: undefined,
    cpuRequest: 4,
    cpuLimit: 8,
    memoryRequest: 16,
    memoryLimit: 32,
    gpuEnabled: false,
    runtimeEnabled: false,
    image: imageOptions[0].value,
    openPorts: [{ protocol: 'TCP', port: 8000, purpose: 'Web UI' }],
  }
}

function buildSpecSummary(values: CreateFormValues) {
  const computeLine = values.gpuEnabled ? `${values.gpuCount || 1}x GPU` : 'CPU Only'
  return `${computeLine}\nCPU: ${values.cpuRequest || '-'} Core / 内存: ${values.memoryRequest || '-'} GB`
}

function buildRuntimeLimit(values: CreateFormValues) {
  if (!values.runtimeEnabled) {
    return '-'
  }

  return `${values.runtimeHours || 0}小时${values.runtimeMinutes || 0}分钟`
}

function toPortRecords(values?: OpenPortFormValue[]): OpenPortRecord[] {
  return (values ?? [])
    .filter(item => item.protocol && item.port)
    .map((item, index) => ({
      id: `port-${Date.now()}-${index}`,
      protocol: item.protocol as 'TCP' | 'UDP',
      port: Number(item.port),
      purpose: item.purpose?.trim() || '-',
    }))
}

function formatAiServiceLabel(values?: string[]) {
  if (!values?.length) {
    return '-'
  }

  return values.join(' / ')
}

function nowText(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

function getNotebookInstanceId(id: string): string {
  const numericPart = id.replace(/\D/g, '')
  return numericPart || '530'
}

function getExternalAccess(port: number): string {
  return `http://180.184.81.11:${30000 + Number(port)}`
}

function canOpenNotebook(status: NotebookStatus): boolean {
  return status === '运行中'
}

function getNotebookStatusAfterRefresh(status: NotebookStatus): NotebookStatus {
  if (status === '启动中' || status === '排队中') {
    return '运行中'
  }

  return status
}

const OnlineNotebook: React.FC = () => {
  const permissionState = usePermissionStore()
  const currentUser = getCurrentUser(permissionState)
  const location = useLocation()
  const navigate = useNavigate()
  const { id, notebookId, caseId } = useParams()
  const [form] = Form.useForm<CreateFormValues>()
  const [caseForm] = Form.useForm<{ name: string; description: string }>()
  const [portForm] = Form.useForm<OpenPortFormValue>()
  const [searchValue, setSearchValue] = useState('')
  const [activeTab, setActiveTab] = useState<'mine' | 'square'>('mine')
  const [rows, setRows] = useState(myNotebooksSeed)
  const [squareRows, setSquareRows] = useState(squareNotebooks)
  const [imageDrawerOpen, setImageDrawerOpen] = useState(false)
  const [portModalOpen, setPortModalOpen] = useState(false)
  const [editingPortId, setEditingPortId] = useState<string | null>(null)
  const [imageSource, setImageSource] = useState<'system' | 'custom'>('system')
  const [pythonVersionFilter, setPythonVersionFilter] = useState('python3.11')
  const [frameworkFilter, setFrameworkFilter] = useState('Pytorch 2.x')
  const [previewImageValue, setPreviewImageValue] = useState<string>()
  const isCreateRoute = location.pathname === '/finetune/notebooks/create'
  const isPublishCaseRoute = /^\/finetune\/notebooks\/[^/]+\/publish-case$/.test(location.pathname)
  const isCaseEditRoute = /^\/finetune\/notebooks\/cases\/[^/]+\/edit$/.test(location.pathname)
  const isCaseDetailRoute = /^\/finetune\/notebooks\/cases\/[^/]+$/.test(location.pathname)
  const isDetailRoute = Boolean(id) && !isCreateRoute && !isPublishCaseRoute && !isCaseDetailRoute && !isCaseEditRoute
  const gpuEnabled = Form.useWatch('gpuEnabled', form)
  const runtimeEnabled = Form.useWatch('runtimeEnabled', form)
  const notebookDetail = useMemo(() => (id ? rows.find(item => item.id === id) ?? null : null), [id, rows])
  const sourceNotebook = useMemo(
    () => (notebookId ? rows.find(item => item.id === notebookId) ?? null : null),
    [notebookId, rows],
  )
  const caseDetail = useMemo(
    () => (caseId ? squareRows.find(item => item.id === caseId) ?? null : null),
    [caseId, squareRows],
  )
  const filteredImageOptions = useMemo(
    () =>
      imageOptions.filter(
        item =>
          item.source === imageSource &&
          item.pythonVersion === pythonVersionFilter &&
          item.framework === frameworkFilter,
      ),
    [frameworkFilter, imageSource, pythonVersionFilter],
  )

  const previewImage = useMemo(
    () => imageOptions.find(item => item.value === previewImageValue) ?? filteredImageOptions[0] ?? null,
    [filteredImageOptions, previewImageValue],
  )

  useEffect(() => {
    if (isCreateRoute) {
      form.setFieldsValue(getCreateInitialValues())
    }
  }, [form, isCreateRoute])

  useEffect(() => {
    if (isPublishCaseRoute && sourceNotebook) {
      caseForm.setFieldsValue({
        name: sourceNotebook.name,
        description: sourceNotebook.description,
      })
    }

    if (isCaseEditRoute && caseDetail) {
      caseForm.setFieldsValue({
        name: caseDetail.name,
        description: caseDetail.description,
      })
    }
  }, [caseDetail, caseForm, isCaseEditRoute, isPublishCaseRoute, sourceNotebook])

  useEffect(() => {
    const nextPreview = filteredImageOptions[0]?.value
    if (!previewImageValue || !filteredImageOptions.some(item => item.value === previewImageValue)) {
      setPreviewImageValue(nextPreview)
    }
  }, [filteredImageOptions, previewImageValue])

  const notebookList = useMemo(
    () => rows.filter(item => item.name.toLowerCase().includes(searchValue.toLowerCase())),
    [rows, searchValue],
  )

  const squareList = useMemo(
    () => squareRows.filter(item => item.name.toLowerCase().includes(searchValue.toLowerCase())),
    [searchValue, squareRows],
  )

  const canManageSquareCase = Boolean(
    caseDetail &&
      (currentUser.roleKeys.includes('platform_admin') ||
        currentUser.roleKeys.includes('project_admin') ||
        caseDetail.creatorAccount === currentUser.account),
  )

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      message.success(`${label}已复制`)
    } catch {
      message.warning(`复制${label}失败`)
    }
  }

  const deleteNotebook = (notebookId: string) => {
    setRows(previous => previous.filter(item => item.id !== notebookId))
    message.success('Notebook 已删除')
  }

  const openPortEditor = (port?: OpenPortRecord) => {
    setEditingPortId(port?.id ?? null)
    portForm.setFieldsValue(
      port
        ? {
            protocol: port.protocol,
            port: port.port,
            purpose: port.purpose,
          }
        : {
            protocol: 'TCP',
            port: undefined,
            purpose: '',
          },
    )
    setPortModalOpen(true)
  }

  const handleDeletePort = (portId: string) => {
    if (!notebookDetail) return
    setRows(previous =>
      previous.map(item =>
        item.id === notebookDetail.id
          ? { ...item, openPorts: item.openPorts.filter(port => port.id !== portId) }
          : item,
      ),
    )
    message.success('端口已删除')
  }

  const handleSubmitPort = async () => {
    if (!notebookDetail) return

    try {
      const values = await portForm.validateFields()
      const nextPort: OpenPortRecord = {
        id: editingPortId ?? `port-${Date.now()}`,
        protocol: values.protocol as 'TCP' | 'UDP',
        port: Number(values.port),
        purpose: values.purpose?.trim() || '-',
      }

      setRows(previous =>
        previous.map(item => {
          if (item.id !== notebookDetail.id) return item
          const openPorts = editingPortId
            ? item.openPorts.map(port => (port.id === editingPortId ? nextPort : port))
            : [...item.openPorts, nextPort]
          return { ...item, openPorts }
        }),
      )
      setPortModalOpen(false)
      setEditingPortId(null)
      portForm.resetFields()
      message.success(editingPortId ? '端口已更新' : '端口已新增')
    } catch {
      return
    }
  }

  const notebookColumns: ColumnsType<MyNotebookRecord> = [
    { title: 'Notebook名称', dataIndex: 'name', key: 'name', width: 240, ellipsis: true },
    { title: '镜像', dataIndex: 'image', key: 'image', width: 300, ellipsis: true },
    {
      title: 'SSH配置',
      dataIndex: 'sshSupported',
      key: 'sshSupported',
      width: 120,
      render: value => (value ? <Text style={{ color: '#059669' }}>已支持</Text> : <Text type="secondary">未支持</Text>),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: value => statusTag(value),
    },
    {
      title: '资源规格',
      dataIndex: 'spec',
      key: 'spec',
      width: 190,
      render: value => <div style={{ whiteSpace: 'pre-line' }}>{value}</div>,
    },
    { title: '最大运行时长', dataIndex: 'runtimeLimit', key: 'runtimeLimit', width: 140 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170 },
    {
      title: '操作',
      key: 'action',
      width: 300,
      render: (_, record) => (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            minWidth: 260,
            whiteSpace: 'nowrap',
          }}
        >
          <Button
            type="link"
            size="small"
            disabled={!canRunTaskLifecycleAction(record.status, 'start') && !canRunTaskLifecycleAction(record.status, 'resubmit')}
            onClick={() => {
              setRows(previous =>
                previous.map(item =>
                  item.id === record.id
                    ? { ...item, status: canRunTaskLifecycleAction(item.status, 'start') ? '启动中' : '已创建' }
                    : item,
                ),
              )
              message.success(
                canRunTaskLifecycleAction(record.status, 'start') ? 'Notebook 已进入启动中' : 'Notebook 已重新提交',
              )
            }}
          >
            {canRunTaskLifecycleAction(record.status, 'start')
              ? '启动'
              : canRunTaskLifecycleAction(record.status, 'resubmit')
                ? '重新提交'
                : '启动'}
          </Button>
          <Button type="link" size="small" onClick={() => navigate(`/finetune/notebooks/${record.id}`)}>
            查看详情
          </Button>
          <Button type="link" size="small" onClick={() => navigate(`/finetune/notebooks/${record.id}/publish-case`)}>
            发布为案例
          </Button>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'duplicate', label: '复制Notebook' },
                { key: 'edit', label: '编辑配置' },
                { key: 'delete', label: '删除', danger: true },
              ],
              onClick: ({ key }) => {
                if (key === 'duplicate') {
                  message.success('已复制 Notebook 配置')
                  return
                }
                if (key === 'edit') {
                  message.info('当前版本暂未开放 Notebook 编辑页')
                  return
                }
                deleteNotebook(record.id)
              },
            }}
          >
            <Button type="text" size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </div>
      ),
    },
  ]

  const handleTabChange = (key: string) => {
    setActiveTab(key as 'mine' | 'square')
    setSearchValue('')
  }

  const openCreate = () => {
    form.setFieldsValue(getCreateInitialValues())
    navigate('/finetune/notebooks/create')
  }

  const closeCreate = () => {
    navigate('/finetune/notebooks')
  }

  const openImagePicker = () => {
    const currentImage = imageOptions.find(item => item.value === (form.getFieldValue('image') as string | undefined)) ?? imageOptions[0]
    setImageSource(currentImage.source)
    setPythonVersionFilter(currentImage.pythonVersion)
    setFrameworkFilter(currentImage.framework)
    setPreviewImageValue(currentImage.value)
    setImageDrawerOpen(true)
  }

  const confirmImagePicker = () => {
    if (!previewImage) {
      message.warning('请选择镜像')
      return
    }

    form.setFieldValue('image', previewImage.value)
    setImageDrawerOpen(false)
  }

  const submitCreate = async () => {
    try {
      const values = await form.validateFields()
      const newRecord: MyNotebookRecord = {
        id: `nb-${Date.now()}`,
        name: values.name || '未命名Notebook',
        description: values.description?.trim() || '',
        image: values.image || imageOptions[0].value,
        sshSupported: false,
        status: '已创建',
        spec: buildSpecSummary(values),
        runtimeLimit: buildRuntimeLimit(values),
        createdAt: nowText(),
        updatedAt: nowText(),
        aiService: formatAiServiceLabel(values.aiService),
        dataset: values.dataset,
        model: values.model,
        cpuRequest: `${values.cpuRequest || '-'} Core`,
        cpuLimit: `${values.cpuLimit || '-'} Core`,
        memoryRequest: `${values.memoryRequest || '-'} GB`,
        memoryLimit: `${values.memoryLimit || '-'} GB`,
        gpuEnabled: Boolean(values.gpuEnabled),
        gpuType: values.gpuEnabled ? values.gpuType : undefined,
        gpuCount: values.gpuEnabled ? values.gpuCount : undefined,
        runtimeEnabled: Boolean(values.runtimeEnabled),
        runtimeHours: values.runtimeEnabled ? values.runtimeHours : undefined,
        runtimeMinutes: values.runtimeEnabled ? values.runtimeMinutes : undefined,
        openPorts: toPortRecords(values.openPorts),
        sshConfig: undefined,
      }

      setRows(previous => [newRecord, ...previous])
      message.success('Notebook 创建成功')
      closeCreate()
    } catch {
      return
    }
  }

  const submitCasePublish = async () => {
    try {
      const values = await caseForm.validateFields()

      if (isCaseEditRoute && caseDetail) {
        const nextRecord: SquareNotebookRecord = {
          ...caseDetail,
          name: values.name,
          description: values.description,
        }
        setSquareRows(previous => previous.map(item => (item.id === nextRecord.id ? nextRecord : item)))
        message.success('案例内容已发布更新')
        navigate(`/finetune/notebooks/cases/${nextRecord.id}`)
        return
      }

      if (!sourceNotebook) {
        message.warning('未找到要发布的 Notebook')
        return
      }

      const nextRecord: SquareNotebookRecord = {
        id: `sq-${Date.now()}`,
        name: values.name,
        description: values.description,
        creatorAccount: currentUser.account,
        creator: currentUser.username,
        createdAt: nowText(),
        sourceNotebookId: sourceNotebook.id,
      }
      setSquareRows(previous => [nextRecord, ...previous])
      message.success('案例已发布')
      navigate(`/finetune/notebooks/cases/${nextRecord.id}`)
    } catch {
      return
    }
  }

  if (isCreateRoute) {
    return (
      <div style={{ padding: '28px 32px 40px', minHeight: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={closeCreate}>
            返回
          </Button>
        </div>

        <Card style={cardStyle}>
          <div
            style={{
              padding: '24px 26px',
              borderRadius: 18,
              marginBottom: 24,
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(15, 23, 42, 0.03))',
              border: '1px solid rgba(148, 163, 184, 0.28)',
            }}
          >
            <Title level={2} style={{ marginBottom: 8 }}>
              创建 Notebook
            </Title>
            <Text type="secondary">
              统一配置 Notebook 的基础信息、资源、镜像和开放端口，创建后可在详情页查看完整配置。
            </Text>
          </div>

          <Form form={form} layout="vertical" initialValues={getCreateInitialValues()}>
            <div style={{ display: 'grid', gap: 18 }}>
              <Card size="small" style={sectionCardStyle}>
                <Title level={4} style={{ marginBottom: 18 }}>
                  基本信息
                </Title>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
                    <Input maxLength={50} showCount placeholder="请输入 Notebook 名称" />
                  </Form.Item>
                  <Form.Item label="AI服务" name="aiService">
                    <Cascader allowClear placeholder="请选择 AI 服务" options={aiServiceOptions} />
                  </Form.Item>
                </div>
                <Form.Item label="描述" name="description">
                  <Input.TextArea rows={4} maxLength={300} showCount placeholder="请输入 Notebook 描述" />
                </Form.Item>
              </Card>

              <Card size="small" style={sectionCardStyle}>
                <Title level={4} style={{ marginBottom: 18 }}>
                  数据与模型
                </Title>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Form.Item label="数据集" name="dataset">
                    <Select allowClear placeholder="请选择数据集" options={datasetOptions} />
                  </Form.Item>
                  <Form.Item label="大模型" name="model">
                    <Select allowClear placeholder="请选择模型" options={modelOptions} />
                  </Form.Item>
                </div>
              </Card>

              <Card size="small" style={sectionCardStyle}>
                <Title level={4} style={{ marginBottom: 18 }}>
                  资源配置
                </Title>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Form.Item label="CPU请求" name="cpuRequest" rules={[{ required: true, message: '请输入 CPU 请求' }]}>
                    <InputNumber style={{ width: '100%' }} min={1} addonAfter="Core" />
                  </Form.Item>
                  <Form.Item label="CPU限制" name="cpuLimit" rules={[{ required: true, message: '请输入 CPU 限制' }]}>
                    <InputNumber style={{ width: '100%' }} min={1} addonAfter="Core" />
                  </Form.Item>
                  <Form.Item label="内存请求" name="memoryRequest" rules={[{ required: true, message: '请输入内存请求' }]}>
                    <InputNumber style={{ width: '100%' }} min={1} addonAfter="GB" />
                  </Form.Item>
                  <Form.Item label="内存限制" name="memoryLimit" rules={[{ required: true, message: '请输入内存限制' }]}>
                    <InputNumber style={{ width: '100%' }} min={1} addonAfter="GB" />
                  </Form.Item>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 12,
                    alignItems: 'center',
                    padding: '14px 16px',
                    borderRadius: 14,
                    background: '#f8fafc',
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>显卡配置</div>
                  </div>
                  <Form.Item name="gpuEnabled" valuePropName="checked" style={{ margin: 0 }}>
                    <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                  </Form.Item>
                </div>

                {gpuEnabled && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Form.Item label="显卡类型及型号" name="gpuType" rules={[{ required: true, message: '请选择显卡类型' }]}>
                      <Select placeholder="请选择显卡类型及型号" options={gpuTypeOptions} />
                    </Form.Item>
                    <Form.Item label="显卡数量" name="gpuCount" rules={[{ required: true, message: '请选择显卡数量' }]}>
                      <Select
                        placeholder="请选择显卡数量"
                        options={Array.from({ length: 8 }, (_, index) => ({ value: index + 1, label: `${index + 1}` }))}
                      />
                    </Form.Item>
                  </div>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 12,
                    alignItems: 'center',
                    padding: '14px 16px',
                    borderRadius: 14,
                    background: '#f8fafc',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>运行时长配置</div>
                  </div>
                  <Form.Item name="runtimeEnabled" valuePropName="checked" style={{ margin: 0 }}>
                    <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                  </Form.Item>
                </div>

                {runtimeEnabled && (
                  <Form.Item label="最长运行时长" required style={{ marginTop: 16, marginBottom: 0 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: 12, alignItems: 'center' }}>
                      <Form.Item name="runtimeHours" rules={[{ required: true, message: '请选择小时' }]} style={{ marginBottom: 0 }}>
                        <Select options={Array.from({ length: 25 }, (_, index) => ({ value: index, label: `${index}` }))} />
                      </Form.Item>
                      <Text type="secondary">小时</Text>
                      <Form.Item name="runtimeMinutes" rules={[{ required: true, message: '请选择分钟' }]} style={{ marginBottom: 0 }}>
                        <Select options={[0, 15, 30, 45].map(value => ({ value, label: `${value}` }))} />
                      </Form.Item>
                      <Text type="secondary">分钟</Text>
                    </div>
                  </Form.Item>
                )}
              </Card>

              <Card size="small" style={sectionCardStyle}>
                <Title level={4} style={{ marginBottom: 18 }}>
                  Notebook 镜像
                </Title>
                <Form.Item name="image" rules={[{ required: true, message: '请选择镜像' }]} hidden>
                  <Input />
                </Form.Item>
                <Form.Item
                  label="镜像"
                  required
                  validateStatus={form.getFieldError('image').length ? 'error' : ''}
                  help={form.getFieldError('image')[0]}
                >
                  <Button icon={<PlusOutlined />} onClick={openImagePicker} style={{ width: 160 }}>
                    选择镜像
                  </Button>
                </Form.Item>
              </Card>

              <Card size="small" style={sectionCardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                  <Title level={4} style={{ margin: 0 }}>
                    开放端口
                  </Title>
                  <Form.List name="openPorts">
                    {(_, { add }) => (
                      <Button icon={<PlusOutlined />} onClick={() => add({ protocol: 'TCP', port: undefined, purpose: '' })}>
                        添加端口
                      </Button>
                    )}
                  </Form.List>
                </div>

                <Form.List name="openPorts">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map(field => (
                        <div
                          key={field.key}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '180px 220px minmax(0, 1fr) auto',
                            gap: 12,
                            alignItems: 'start',
                            marginBottom: 12,
                          }}
                        >
                          <Form.Item
                            {...field}
                            label={field.name === 0 ? '协议' : ' '}
                            name={[field.name, 'protocol']}
                            rules={[{ required: true, message: '请选择协议' }]}
                          >
                            <Select options={[{ value: 'TCP', label: 'TCP' }, { value: 'UDP', label: 'UDP' }]} />
                          </Form.Item>
                          <Form.Item
                            {...field}
                            label={field.name === 0 ? '开放端口' : ' '}
                            name={[field.name, 'port']}
                            rules={[{ required: true, message: '请输入端口' }]}
                          >
                            <InputNumber style={{ width: '100%' }} min={1} max={65535} placeholder="内部端口" />
                          </Form.Item>
                          <Form.Item
                            {...field}
                            label={field.name === 0 ? '用途说明' : ' '}
                            name={[field.name, 'purpose']}
                            rules={[{ required: true, message: '请输入用途说明' }]}
                          >
                            <Input placeholder="请输入端口用途" maxLength={64} showCount />
                          </Form.Item>
                          <div style={{ paddingTop: field.name === 0 ? 30 : 0 }}>
                            <Button
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => {
                                if (fields.length === 1) {
                                  message.warning('至少保留一个端口配置')
                                  return
                                }
                                remove(field.name)
                              }}
                            />
                          </div>
                        </div>
                      ))}

                      {!fields.length && (
                        <div style={{ padding: '20px 0' }}>
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无端口配置">
                            <Button type="primary" onClick={() => add({ protocol: 'TCP', purpose: '' })}>
                              添加第一个端口
                            </Button>
                          </Empty>
                        </div>
                      )}
                    </>
                  )}
                </Form.List>
              </Card>

            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <Button type="primary" onClick={submitCreate}>
                创建 Notebook
              </Button>
              <Button onClick={closeCreate}>取消</Button>
            </div>
          </Form>
        </Card>

        <Drawer
          title="镜像"
          placement="right"
          width={860}
          open={imageDrawerOpen}
          onClose={() => setImageDrawerOpen(false)}
          destroyOnClose={false}
          extra={
            <Space>
              <Button onClick={() => setImageDrawerOpen(false)}>取消</Button>
              <Button type="primary" onClick={confirmImagePicker}>
                确认
              </Button>
            </Space>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 280px) 1fr', minHeight: 520 }}>
            <div style={{ paddingRight: 20, borderRight: '1px solid #f1f5f9' }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 18 }}>镜像来源</div>
              <Radio.Group value={imageSource} onChange={event => setImageSource(event.target.value)} style={{ marginBottom: 28 }}>
                <Space size={24}>
                  <Radio value="system">系统镜像</Radio>
                  <Radio value="custom">自定义镜像</Radio>
                </Space>
              </Radio.Group>

              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>python版本</div>
              <Space wrap size={10} style={{ marginBottom: 28 }}>
                {Array.from(new Set(imageOptions.filter(item => item.source === imageSource).map(item => item.pythonVersion))).map(item => (
                  <Button
                    key={item}
                    size="small"
                    type={pythonVersionFilter === item ? 'primary' : 'default'}
                    onClick={() => setPythonVersionFilter(item)}
                  >
                    {item}
                  </Button>
                ))}
              </Space>

              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>框架</div>
              <Space wrap size={10}>
                {Array.from(new Set(imageOptions.filter(item => item.source === imageSource).map(item => item.framework))).map(item => (
                  <Button
                    key={item}
                    size="small"
                    type={frameworkFilter === item ? 'primary' : 'default'}
                    onClick={() => setFrameworkFilter(item)}
                  >
                    {item}
                  </Button>
                ))}
              </Space>
            </div>

            <div style={{ padding: '0 20px', borderRight: '1px solid #f1f5f9' }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 18 }}>镜像列表</div>
              <div style={{ display: 'grid', gap: 12 }}>
                {filteredImageOptions.map(item => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setPreviewImageValue(item.value)}
                    style={{
                      textAlign: 'left',
                      borderRadius: 16,
                      border: previewImage?.value === item.value ? '1px solid #1677ff' : '1px solid #e2e8f0',
                      background: previewImage?.value === item.value ? 'rgba(22, 119, 255, 0.06)' : '#ffffff',
                      padding: '16px 18px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>{item.imageName}</div>
                    <div style={{ color: '#475569', marginBottom: 6 }}>镜像版本：{item.version}</div>
                    <Space size={8} wrap>
                      <Tag color={item.imageType === 'CPU镜像' ? 'green' : 'blue'}>{item.imageType}</Tag>
                      <Tag>{item.pythonVersion}</Tag>
                      <Tag>{item.framework}</Tag>
                    </Space>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ paddingLeft: 20 }}>
              {previewImage ? (
                <div
                  style={{
                    maxWidth: 320,
                    padding: '20px 22px',
                    borderRadius: 18,
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                  }}
                >
                  <div style={{ color: '#64748b', marginBottom: 10 }}>命名空间：<Text strong>{previewImage.namespace}</Text></div>
                  <div style={{ color: '#64748b', marginBottom: 10 }}>名称：<Text strong>{previewImage.imageName}</Text></div>
                  <div style={{ color: '#64748b', marginBottom: 18 }}>镜像版本：<Text strong>{previewImage.version}</Text></div>
                  <div style={{ color: '#334155', fontSize: 24, fontWeight: 700, marginBottom: 14 }}>{previewImage.imageType}</div>
                  <div style={{ color: '#475569', marginBottom: 18 }}>创建时间：{previewImage.createdAt}</div>
                  <Space wrap size={10}>
                    <Tag color={previewImage.imageType === 'CPU镜像' ? 'green' : 'blue'}>{previewImage.imageType}</Tag>
                    <Tag color="green">{previewImage.pythonVersion}</Tag>
                    <Tag>{previewImage.framework}</Tag>
                  </Space>
                </div>
              ) : (
                <Empty description="暂无匹配镜像" />
              )}
            </div>
          </div>
        </Drawer>
      </div>
    )
  }

  if (isPublishCaseRoute || isCaseEditRoute) {
    if ((isPublishCaseRoute && !sourceNotebook) || (isCaseEditRoute && !caseDetail)) {
      return (
        <div style={{ padding: '28px 32px' }}>
          <Card style={cardStyle}>
            <Empty description="未找到目标案例" />
          </Card>
        </div>
      )
    }

    return (
      <div style={{ padding: '28px 32px 40px', minHeight: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() =>
              navigate(
                isCaseEditRoute && caseDetail
                  ? `/finetune/notebooks/cases/${caseDetail.id}`
                  : '/finetune/notebooks',
              )
            }
          >
            返回
          </Button>
          <Text type="secondary">
            在线Notebook / {isCaseEditRoute ? '编辑案例' : '发布案例'}
          </Text>
        </div>

        <Card style={cardStyle}>
          <Form form={caseForm} layout="vertical">
            <Form.Item label="案例名称" name="name" rules={[{ required: true, message: '请输入案例名称' }]}>
              <Input placeholder="请输入案例名称" maxLength={120} />
            </Form.Item>

            <Form.Item label="案例说明" name="description" rules={[{ required: true, message: '请输入案例说明' }]}>
              <Input.TextArea rows={18} placeholder="请输入案例说明" maxLength={5000} showCount />
            </Form.Item>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <Button onClick={() => navigate(isCaseEditRoute && caseDetail ? `/finetune/notebooks/cases/${caseDetail.id}` : '/finetune/notebooks')}>
                取消
              </Button>
              <Button type="primary" onClick={submitCasePublish}>
                发布为案例
              </Button>
            </div>
          </Form>
        </Card>
      </div>
    )
  }

  if (isCaseDetailRoute && caseDetail) {
    return (
      <div style={{ padding: '28px 32px 40px', minHeight: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/finetune/notebooks')}>
            返回
          </Button>
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          <Card style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
              <Title level={2} style={{ margin: 0 }}>
                {caseDetail.name}
              </Title>
              <Space>
                <Button icon={<CopyOutlined />} onClick={() => handleCopy(caseDetail.description || '', '案例说明')}>
                  复制案例
                </Button>
                {canManageSquareCase && (
                  <Button type="primary" onClick={() => navigate(`/finetune/notebooks/cases/${caseDetail.id}/edit`)}>
                    编辑
                  </Button>
                )}
              </Space>
            </div>
          </Card>

          <Card style={cardStyle}>
            <Title level={3} style={{ marginBottom: 20 }}>
              案例说明
            </Title>
            <div style={{ whiteSpace: 'pre-wrap', color: '#0f172a', lineHeight: 1.9, fontSize: 16 }}>
              {caseDetail.description || '暂无案例说明'}
            </div>
          </Card>
        </div>
      </div>
    )
  }

  if (isDetailRoute && notebookDetail) {
    return (
      <div style={{ padding: '28px 32px 40px', minHeight: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/finetune/notebooks')}>
            返回
          </Button>
        </div>

        <Card style={cardStyle}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <Button
              type="primary"
              icon={<LinkOutlined />}
              disabled={!canOpenNotebook(notebookDetail.status)}
              onClick={() => {
                const targetPort = notebookDetail.openPorts[0]
                if (!targetPort) {
                  message.warning('暂无可访问端口')
                  return
                }
                window.open(getExternalAccess(targetPort.port), '_blank', 'noopener,noreferrer')
              }}
            >
              打开Notebook
            </Button>
            <Button
              icon={<PauseCircleOutlined />}
              disabled={!canRunTaskLifecycleAction(notebookDetail.status, 'terminate')}
              onClick={() => {
                setRows(previous =>
                  previous.map(item =>
                    item.id === notebookDetail.id ? { ...item, status: '已终止', updatedAt: nowText() } : item,
                  ),
                )
                message.success('Notebook 已停止')
              }}
            >
              停止
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setRows(previous =>
                  previous.map(item =>
                    item.id === notebookDetail.id
                      ? {
                          ...item,
                          status: getNotebookStatusAfterRefresh(item.status),
                          updatedAt: nowText(),
                        }
                      : item,
                  ),
                )
                message.success('Notebook 状态已刷新')
              }}
            >
              刷新
            </Button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 0.95fr)',
              gap: 20,
              alignItems: 'start',
              marginBottom: 24,
            }}
          >
            <Card title="基本信息" size="small" style={sectionCardStyle}>
              <div style={{ display: 'grid', gap: 12, fontSize: 16 }}>
                <div><Text strong>名称：</Text>{notebookDetail.name}</div>
                <div><Text strong>描述：</Text>{notebookDetail.description || '无'}</div>
                <div><Text strong>状态：</Text>{statusTag(notebookDetail.status)}</div>
                <div>
                  <Text strong>镜像：</Text>
                  <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: '#eff6ff', color: '#2563eb', wordBreak: 'break-all' }}>
                    {notebookDetail.image}
                  </div>
                </div>
                <div><Text strong>数据集：</Text>{notebookDetail.dataset || '-'}</div>
                <div><Text strong>模型：</Text>{notebookDetail.model || '-'}</div>
                <div><Text strong>AI服务：</Text>{notebookDetail.aiService || '-'}</div>
                <div><Text strong>运行时长：</Text>-</div>
                <div><Text strong>最大运行时长：</Text>{notebookDetail.runtimeLimit}</div>
                <div><Text strong>创建时间：</Text>{notebookDetail.createdAt}</div>
                <div><Text strong>更新时间：</Text>{notebookDetail.updatedAt}</div>
              </div>
            </Card>

            <Card title="资源配置" size="small" style={sectionCardStyle}>
              <div style={{ display: 'grid', gap: 16, fontSize: 16 }}>
                <div><Text strong>CPU：</Text>{`${notebookDetail.cpuRequest.replace(' Core', '')} ~ ${notebookDetail.cpuLimit.replace(' Core', '')} Cores`}</div>
                <div><Text strong>内存：</Text>{`${notebookDetail.memoryRequest.replace(' GB', '')} ~ ${notebookDetail.memoryLimit.replace(' GB', '')} GB`}</div>
                <div><Text strong>显卡类型：</Text>{notebookDetail.gpuEnabled ? notebookDetail.gpuType || '-' : '未启用'}</div>
                <div><Text strong>显卡数量：</Text>{notebookDetail.gpuEnabled ? notebookDetail.gpuCount || '-' : '-'}</div>
                <div><Text strong>实例ID：</Text>{getNotebookInstanceId(notebookDetail.id)}</div>
              </div>
            </Card>
          </div>

          <Card
            title="开放端口"
            size="small"
            style={sectionCardStyle}
            extra={
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openPortEditor()}>
                新增端口
              </Button>
            }
          >
            {notebookDetail.openPorts.length ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                {notebookDetail.openPorts.map(port => (
                  <Card
                    key={port.id}
                    size="small"
                    style={{ borderRadius: 16, border: '1px solid #e5e7eb' }}
                    extra={
                      <Space size={4}>
                        <Button type="link" size="small" onClick={() => openPortEditor(port)}>
                          编辑
                        </Button>
                        <Button type="link" size="small" danger onClick={() => handleDeletePort(port.id)}>
                          删除
                        </Button>
                      </Space>
                    }
                  >
                    <div style={{ display: 'grid', gap: 10, fontSize: 15 }}>
                      <div><Text strong>内部端口：</Text>{port.port}</div>
                      <div><Text strong>协议：</Text>{port.protocol}</div>
                      <div><Text strong>使用用途：</Text>{port.purpose}</div>
                      <div><Text strong>外部访问：</Text>{getExternalAccess(port.port)}</div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无开放端口配置" />
            )}
          </Card>

          {notebookDetail.sshConfig && (
            <Card size="small" style={{ ...sectionCardStyle, marginTop: 18 }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
                SSH 配置信息
              </div>
              <div style={{ display: 'grid', gap: 14 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text strong>用户名</Text>
                    <Button type="link" size="small" onClick={() => handleCopy(notebookDetail.sshConfig?.username || '', '用户名')}>
                      复制
                    </Button>
                  </div>
                  <pre style={codeBlockStyle}>{notebookDetail.sshConfig.username}</pre>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text strong>SSH Key</Text>
                    <Button type="link" size="small" onClick={() => handleCopy(notebookDetail.sshConfig?.sshKey || '', 'SSH Key')}>
                      复制
                    </Button>
                  </div>
                  <pre style={codeBlockStyle}>{notebookDetail.sshConfig.sshKey}</pre>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text strong>SSH 命令</Text>
                    <Button type="link" size="small" onClick={() => handleCopy(notebookDetail.sshConfig?.sshCommand || '', 'SSH 命令')}>
                      复制
                    </Button>
                  </div>
                  <pre style={codeBlockStyle}>{notebookDetail.sshConfig.sshCommand}</pre>
                </div>
              </div>
            </Card>
          )}
        </Card>

        <Modal
          title={editingPortId ? '编辑端口' : '新增端口'}
          open={portModalOpen}
          onCancel={() => {
            setPortModalOpen(false)
            setEditingPortId(null)
            portForm.resetFields()
          }}
          onOk={handleSubmitPort}
          okText={editingPortId ? '保存' : '新增'}
        >
          <Form form={portForm} layout="vertical">
            <Form.Item label="协议" name="protocol" rules={[{ required: true, message: '请选择协议' }]}>
              <Select options={[{ value: 'TCP', label: 'TCP' }, { value: 'UDP', label: 'UDP' }]} />
            </Form.Item>
            <Form.Item label="内部端口" name="port" rules={[{ required: true, message: '请输入端口' }]}>
              <InputNumber style={{ width: '100%' }} min={1} max={65535} />
            </Form.Item>
            <Form.Item label="使用用途" name="purpose" rules={[{ required: true, message: '请输入用途' }]}>
              <Input maxLength={64} />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    )
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Card style={cardStyle}>
          <Title level={2} style={{ marginBottom: 18 }}>
            在线Notebook
          </Title>

          <Tabs
            activeKey={activeTab}
            onChange={handleTabChange}
            items={[
              { key: 'square', label: 'Notebook广场' },
              { key: 'mine', label: '我的Notebook' },
            ]}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <Space wrap>
              <Input
                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                placeholder="搜索名称"
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                style={{ width: 230 }}
              />
              <Button icon={<ReloadOutlined />} onClick={() => message.success('Notebook 列表已刷新')}>
                刷新
              </Button>
              {activeTab === 'mine' && (
                <Button onClick={() => message.info('自定义镜像能力将在后续版本补充')}>
                  自定义镜像
                </Button>
              )}
            </Space>

            {activeTab === 'mine' && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                创建Notebook
              </Button>
            )}
          </div>

          {activeTab === 'mine' ? (
            <Table
              rowKey="id"
              columns={notebookColumns}
              dataSource={notebookList}
              scroll={{ x: 1600 }}
              tableLayout="fixed"
              pagination={{ pageSize: 10, showTotal: total => `共 ${total} 条数据` }}
            />
          ) : (
            <>
              {squareList.length ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 18 }}>
                  {squareList.map(item => (
                    <Card key={item.id} style={{ borderRadius: 18, minHeight: 212 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <Title level={4} style={{ margin: 0, fontSize: 18 }}>
                          {item.name}
                        </Title>
                        <Button type="text" danger icon={<DeleteOutlined />} />
                      </div>
                      <Paragraph type="secondary" style={{ minHeight: 84 }}>
                        {item.description || '暂无说明'}
                      </Paragraph>
                      <Space>
                        <Button icon={<EyeOutlined />} onClick={() => navigate(`/finetune/notebooks/cases/${item.id}`)}>
                          查看详情
                        </Button>
                        <Button type="primary" icon={<CopyOutlined />}>
                          复制案例
                        </Button>
                      </Space>
                    </Card>
                  ))}
                </div>
              ) : (
                <Empty description="暂无案例" />
              )}
            </>
          )}
        </Card>
      </div>

    </>
  )
}

export default OnlineNotebook
