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
  SyncOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Cascader,
  Card,
  Checkbox,
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
import { useOnlineInferenceServices } from '../../services/onlineInferenceServiceStore'
import { PUBLISH_CASE_NOTICE } from '../notebookCaseNotice'

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

type MLNotebookRecord = {
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
  creator: string
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

type MLSquareRecord = {
  id: string
  name: string
  description: string
  creatorAccount: string
  creator: string
  createdAt: string
  sourceNotebookId?: string
  sourceNotebookName?: string
  publishStatus?: 'processing' | 'published' | 'failed'
  publishStartedAt?: number
  highlightUntil?: number
}

type OpenPortFormValue = {
  protocol?: 'TCP' | 'UDP'
  port?: number
  purpose?: string
}

type CustomMirrorRecord = {
  id: string
  namespace: string
  imageName: string
  version: string
  description: string
  status: '已完成' | '生成中' | '失败'
  taskSource: string
  tags: string[]
  creator: string
  createdAt: string
}

type SaveEnvironmentFormValues = {
  includePackages?: boolean
  includeWorkspace?: boolean
  imageName?: string
  imageDescription?: string
}

type CustomMirrorFormValues = {
  namespace?: string
  imageName?: string
  description?: string
}

type CustomMirrorTagFormValues = {
  test?: string
  framework?: string
  pythonVersion?: string
  source?: string
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

const datasetOptions = [
  { value: '图像分类-多-1', label: '图像分类-多-1' },
  { value: 'basion-文本实体识别', label: 'basion-文本实体识别' },
  { value: 'basion-图像分类-单标签-无标注', label: 'basion-图像分类-单标签-无标注' },
]

const modelOptions = [
  { value: '图像分类模型-v1', label: '图像分类模型-v1' },
  { value: '情感分析模型', label: '情感分析模型' },
  { value: 'NER命名实体识别', label: 'NER命名实体识别' },
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
    value: 'lab-cn-guangzhou.cr.volces.com/fs/jupyter/ml/deepexi-notebook:pytorch_2.5-cuda_12.1-py311-ubuntu22.04',
    label: 'pytorch_2.5-cuda_12.1-py311-ubuntu22.04',
    source: 'system',
    namespace: 'fs',
    imageName: 'jupyter/ml/deepexi-notebook',
    version: 'pytorch_2.5-cuda_12.1-py311-ubuntu22.04',
    imageType: 'GPU镜像',
    createdAt: '2026-04-12 15:28:09',
    pythonVersion: 'python3.11',
    framework: 'Pytorch 2.x',
  },
  {
    value: 'lab-cn-guangzhou.cr.volces.com/fs/jupyter/ml/deepexi-notebook:pytorch_2.6-cuda_12.4-py311-ubuntu22.04',
    label: 'pytorch_2.6-cuda_12.4-py311-ubuntu22.04',
    source: 'system',
    namespace: 'fs',
    imageName: 'jupyter/ml/deepexi-notebook',
    version: 'pytorch_2.6-cuda_12.4-py311-ubuntu22.04',
    imageType: 'GPU镜像',
    createdAt: '2026-04-26 09:18:24',
    pythonVersion: 'python3.11',
    framework: 'Pytorch 2.x',
  },
  {
    value: 'lab-cn-guangzhou.cr.volces.com/fs/jupyter/ml/deepexi-notebook:tensorflow_2.16-cuda_12.3-py310-ubuntu22.04',
    label: 'tensorflow_2.16-cuda_12.3-py310-ubuntu22.04',
    source: 'system',
    namespace: 'fs',
    imageName: 'jupyter/ml/deepexi-notebook',
    version: 'tensorflow_2.16-cuda_12.3-py310-ubuntu22.04',
    imageType: 'GPU镜像',
    createdAt: '2026-04-16 16:20:35',
    pythonVersion: 'python3.10',
    framework: 'TensorFlow 2.x',
  },
  {
    value: 'lab-cn-guangzhou.cr.volces.com/fs/jupyter/ml/deepexi-notebook:datascience-cpu-python312-ubuntu24.04',
    label: 'datascience-cpu-python312-ubuntu24.04',
    source: 'system',
    namespace: 'fs',
    imageName: 'jupyter/ml/deepexi-notebook',
    version: 'datascience-cpu-python312-ubuntu24.04',
    imageType: 'CPU镜像',
    createdAt: '2025-11-12 15:28:09',
    pythonVersion: 'python3.12',
    framework: 'torch 2.x',
  },
  {
    value: 'lab-cn-guangzhou.cr.volces.com/fs/jupyter/ml/deepexi-notebook:sklearn-cpu-python311-ubuntu22.04',
    label: 'sklearn-cpu-python311-ubuntu22.04',
    source: 'system',
    namespace: 'fs',
    imageName: 'jupyter/ml/deepexi-notebook',
    version: 'sklearn-cpu-python311-ubuntu22.04',
    imageType: 'CPU镜像',
    createdAt: '2026-03-28 09:12:41',
    pythonVersion: 'python3.11',
    framework: 'scikit-learn',
  },
  {
    value: 'lab-cn-guangzhou.cr.volces.com/fs/jupyter/ml/deepexi-notebook:opencv-cpu-python310-ubuntu22.04',
    label: 'opencv-cpu-python310-ubuntu22.04',
    source: 'system',
    namespace: 'fs',
    imageName: 'jupyter/ml/deepexi-notebook',
    version: 'opencv-cpu-python310-ubuntu22.04',
    imageType: 'CPU镜像',
    createdAt: '2026-03-19 14:36:52',
    pythonVersion: 'python3.10',
    framework: 'OpenCV',
  },
  {
    value: 'lab-cn-guangzhou.cr.volces.com/fs/jupyter/ml/deepexi-notebook:mindspore_2.4-cann_8.0-py310-ubuntu22.04',
    label: 'mindspore_2.4-cann_8.0-py310-ubuntu22.04',
    source: 'system',
    namespace: 'fs',
    imageName: 'jupyter/ml/deepexi-notebook',
    version: 'mindspore_2.4-cann_8.0-py310-ubuntu22.04',
    imageType: 'NPU镜像',
    createdAt: '2026-04-08 11:05:37',
    pythonVersion: 'python3.10',
    framework: 'MindSpore 2.x',
  },
  {
    value: 'registry.deepexi.com/ml/notebook/custom-runtime:1.0.3',
    label: 'custom-runtime:1.0.3',
    source: 'custom',
    namespace: 'custom',
    imageName: 'ml/notebook/custom-runtime',
    version: '1.0.3',
    imageType: 'GPU镜像',
    createdAt: '2026-03-18 10:12:00',
    pythonVersion: 'python3.11',
    framework: 'Pytorch 2.x',
  },
  {
    value: 'registry.deepexi.com/ml/notebook/custom-vision-runtime:2.0.1',
    label: 'custom-vision-runtime:2.0.1',
    source: 'custom',
    namespace: 'custom',
    imageName: 'ml/notebook/custom-vision-runtime',
    version: '2.0.1',
    imageType: 'GPU镜像',
    createdAt: '2026-04-27 12:05:28',
    pythonVersion: 'python3.11',
    framework: 'Pytorch 2.x',
  },
  {
    value: 'registry.deepexi.com/ml/notebook/custom-tabular-runtime:1.4.2',
    label: 'custom-tabular-runtime:1.4.2',
    source: 'custom',
    namespace: 'custom',
    imageName: 'ml/notebook/custom-tabular-runtime',
    version: '1.4.2',
    imageType: 'CPU镜像',
    createdAt: '2026-04-23 15:44:19',
    pythonVersion: 'python3.11',
    framework: 'scikit-learn',
  },
  {
    value: 'registry.deepexi.com/ml/notebook/custom-autogluon-runtime:0.9.0',
    label: 'custom-autogluon-runtime:0.9.0',
    source: 'custom',
    namespace: 'custom',
    imageName: 'ml/notebook/custom-autogluon-runtime',
    version: '0.9.0',
    imageType: 'GPU镜像',
    createdAt: '2026-04-18 18:08:33',
    pythonVersion: 'python3.10',
    framework: 'AutoGluon',
  },
]

const gpuTypeOptions = [
  { value: 'NVIDIA Tesla T4', label: 'NVIDIA Tesla T4' },
  { value: 'NVIDIA A10', label: 'NVIDIA A10' },
]

const myNotebooksSeed: MLNotebookRecord[] = [
  {
    id: 'ml-nb-1',
    name: 'hzj_单图多标签-ml-dev',
    description: 'ML 部署在线开发：hzj_单图多标签',
    image: 'lab-cn-guangzhou.cr.volces.com/fs/jupyter/ml/deepexi-notebook:pytorch_2.5-cuda_12.1-py311-ubuntu22.04',
    sshSupported: true,
    status: '运行中',
    spec: '1x GPU\nCPU: 4 Core / 内存: 16 GB',
    runtimeLimit: '-',
    createdAt: '2026/4/15 09:58:34',
    updatedAt: '2026/4/21 11:03:18',
    creator: 'deepexilab',
    aiService: '在线推理服务 / qwen3-vl-plus-图像理解-在线推理服务',
    dataset: '图像分类-多-1',
    model: '图像分类模型-v1',
    cpuRequest: '4 Core',
    cpuLimit: '8 Core',
    memoryRequest: '16 GB',
    memoryLimit: '32 GB',
    gpuEnabled: true,
    gpuType: 'NVIDIA Tesla T4',
    gpuCount: 1,
    runtimeEnabled: false,
    openPorts: [
      { id: 'ml-port-1', protocol: 'TCP', port: 8000, purpose: 'Web UI' },
      { id: 'ml-port-2', protocol: 'TCP', port: 7860, purpose: 'Gradio UI' },
    ],
    sshConfig: {
      username: 'lab',
      sshKey: 'SHA256:PO9za4v8KR0nQZHMIjPYXmnU8a3mA1uEBCexONB4yyYA',
      sshCommand: 'ssh -p 31088 lab@ssh-zGVlcGV4aWxhYI9rZXIfc3NoOojc5QDUzMA==@deepexilab-test.deepexi.com',
    },
  },
  {
    id: 'ml-nb-2',
    name: 'basion-ml-dev',
    description: 'ML 部署在线开发：basion',
    image: 'lab-cn-guangzhou.cr.volces.com/fs/jupyter/ml/deepexi-notebook:datascience-cpu-python312-ubuntu24.04',
    sshSupported: false,
    status: '已终止',
    spec: 'CPU Only\nCPU: 2 Core / 内存: 8 GB',
    runtimeLimit: '2小时30分钟',
    createdAt: '2026/4/13 15:14:48',
    updatedAt: '2026/4/20 09:21:10',
    creator: 'lab1',
    aiService: '-',
    dataset: 'basion-文本实体识别',
    model: 'NER命名实体识别',
    cpuRequest: '2 Core',
    cpuLimit: '4 Core',
    memoryRequest: '8 GB',
    memoryLimit: '16 GB',
    gpuEnabled: false,
    runtimeEnabled: true,
    runtimeHours: 2,
    runtimeMinutes: 30,
    openPorts: [{ id: 'ml-port-3', protocol: 'TCP', port: 8888, purpose: 'Jupyter Lab' }],
  },
]

const squareNotebooks: MLSquareRecord[] = [
  {
    id: 'ml-square-1',
    name: '图像分类开发案例',
    description: '用于机器学习图像分类任务的在线开发模板。',
    creatorAccount: 'zhangsan',
    creator: '平台',
    createdAt: '2026/03/23 09:20:00',
  },
  {
    id: 'ml-square-2',
    name: '实体识别开发案例',
    description: '用于机器学习文本实体识别任务的在线开发模板。',
    creatorAccount: 'lisi',
    creator: 'lab5',
    createdAt: '2026/03/23 11:08:00',
  },
]

const customMirrorSeed: CustomMirrorRecord[] = [
  {
    id: 'mirror-1',
    namespace: 'fs',
    imageName: 'jupyter/ml/deepexi-notebook',
    version: 'datascience-cpu-python312-ubuntu24.04-noconda',
    description: 'ai镜像',
    status: '已完成',
    taskSource: '-',
    tags: [],
    creator: 'lab1',
    createdAt: '2026-04-16 17:54:17',
  },
  {
    id: 'mirror-2',
    namespace: 'lab',
    imageName: 'jupyter/ml/deepexi-notebook',
    version: 'datascience-cpu-python3223-2',
    description: '暂无描述',
    status: '已完成',
    taskSource: '新建 Notebook 6',
    tags: ['Pytorch 2.x', 'python3.11'],
    creator: 'lab1',
    createdAt: '2026-03-04 10:26:57',
  },
  {
    id: 'mirror-3',
    namespace: 'lab',
    imageName: 'jupyter/ml/deepexi-notebook',
    version: 'datascience-cpu-python312-ubuntu24.01',
    description: '暂无描述',
    status: '已完成',
    taskSource: '新建 Notebook -2',
    tags: ['python3.12'],
    creator: 'lab1',
    createdAt: '2026-03-03 09:43:48',
  },
  {
    id: 'mirror-4',
    namespace: 'lab',
    imageName: 'jupyter/ml/deepexi-notebook',
    version: 'datascience-cpu-python312-ubuntu24.02',
    description: '暂无描述',
    status: '失败',
    taskSource: '新建 Notebook -1',
    tags: [],
    creator: 'lab1',
    createdAt: '2026-03-02 17:50:43',
  },
]

const namespaceOptions = [
  { value: 'fs', label: 'fs' },
  { value: 'lab', label: 'lab' },
  { value: 'custom', label: 'custom' },
]

const mirrorNameOptions = [
  { value: 'jupyter/ml/deepexi-notebook', label: 'jupyter/ml/deepexi-notebook' },
  { value: 'ml/notebook/custom-runtime', label: 'ml/notebook/custom-runtime' },
  { value: 'runtime/notebook-lab', label: 'runtime/notebook-lab' },
]

const mirrorTagGroups: Array<{ key: keyof CustomMirrorTagFormValues; title: string; options: string[] }> = [
  { key: 'test', title: 'test', options: ['test1'] },
  { key: 'framework', title: '框架', options: ['aa', 'torch 2.x', 'Pytorch 2.x'] },
  { key: 'pythonVersion', title: 'python版本', options: ['python3.12', 'python3.11'] },
  { key: 'source', title: '测试', options: ['添加的镜像', '保存的镜像'] },
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

const CASE_PUBLISH_READY_DELAY = 4800
const CASE_HIGHLIGHT_DURATION = 5000

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
    cpuRequest: 0.5,
    cpuLimit: 16,
    memoryRequest: 0.5,
    memoryLimit: 16,
    gpuEnabled: false,
    runtimeEnabled: false,
    image: imageOptions[0].value,
    openPorts: [{ protocol: 'TCP', port: 8000, purpose: 'Web UI' }],
  }
}

function buildSpecSummary(values: CreateFormValues) {
  const computeLine = values.gpuEnabled ? `${values.gpuCount || 1}x GPU` : 'CPU Only'
  return `${computeLine}\n${values.cpuRequest || '-'}~${values.cpuLimit || '-'} Cores`
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

function parseAiServiceValue(value?: string): string[] | undefined {
  if (!value || value === '-') {
    return undefined
  }

  return value.split(' / ')
}

function toEditFormValues(record: MLNotebookRecord): CreateFormValues {
  return {
    name: record.name,
    description: record.description,
    aiService: parseAiServiceValue(record.aiService),
    dataset: record.dataset,
    model: record.model,
    cpuRequest: Number.parseFloat(record.cpuRequest),
    cpuLimit: Number.parseFloat(record.cpuLimit),
    memoryRequest: Number.parseFloat(record.memoryRequest),
    memoryLimit: Number.parseFloat(record.memoryLimit),
    gpuEnabled: record.gpuEnabled,
    gpuType: record.gpuType,
    gpuCount: record.gpuCount,
    runtimeEnabled: record.runtimeEnabled,
    runtimeHours: record.runtimeHours,
    runtimeMinutes: record.runtimeMinutes,
    image: record.image,
    openPorts: record.openPorts.map(port => ({
      protocol: port.protocol,
      port: port.port,
      purpose: port.purpose,
    })),
  }
}

function canEditNotebook(status: NotebookStatus): boolean {
  return !['启动中', '排队中', '运行中'].includes(status)
}

function renderNotebookImageSummary(image: string) {
  const option = imageOptions.find(item => item.value === image)
  if (!option) {
    return <Text ellipsis>{image}</Text>
  }

  return (
    <div style={{ fontSize: 12, lineHeight: 1.65 }}>
      <div>
        <Text type="secondary">命名空间：</Text>
        <Text strong>{option.namespace}</Text>
      </div>
      <div>
        <Text type="secondary">名称：</Text>
        <Text strong>{option.imageName}</Text>
      </div>
      <div>
        <Text type="secondary">镜像版本：</Text>
        <Text strong>{option.version}</Text>
      </div>
    </div>
  )
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

const MLNotebook: React.FC = () => {
  const permissionState = usePermissionStore()
  const currentUser = getCurrentUser(permissionState)
  const onlineInferenceServices = useOnlineInferenceServices()
  const location = useLocation()
  const navigate = useNavigate()
  const { id, notebookId, caseId } = useParams()
  const [form] = Form.useForm<CreateFormValues>()
  const [caseForm] = Form.useForm<{ name: string; description: string }>()
  const [portForm] = Form.useForm<OpenPortFormValue>()
  const [saveEnvForm] = Form.useForm<SaveEnvironmentFormValues>()
  const [customMirrorForm] = Form.useForm<CustomMirrorFormValues>()
  const [mirrorTagForm] = Form.useForm<CustomMirrorTagFormValues>()
  const [searchValue, setSearchValue] = useState('')
  const [activeTab, setActiveTab] = useState<'mine' | 'square'>('mine')
  const [rows, setRows] = useState(myNotebooksSeed)
  const [squareRows, setSquareRows] = useState(squareNotebooks)
  const [customMirrorRows, setCustomMirrorRows] = useState(customMirrorSeed)
  const [imageDrawerOpen, setImageDrawerOpen] = useState(false)
  const [portModalOpen, setPortModalOpen] = useState(false)
  const [saveEnvModalOpen, setSaveEnvModalOpen] = useState(false)
  const [savingNotebook, setSavingNotebook] = useState<MLNotebookRecord | null>(null)
  const [saveEnvShouldStop, setSaveEnvShouldStop] = useState(false)
  const [stopModalOpen, setStopModalOpen] = useState(false)
  const [stoppingNotebook, setStoppingNotebook] = useState<MLNotebookRecord | null>(null)
  const [shouldSaveBeforeStop, setShouldSaveBeforeStop] = useState(true)
  const [customMirrorModalOpen, setCustomMirrorModalOpen] = useState(false)
  const [mirrorTagModalOpen, setMirrorTagModalOpen] = useState(false)
  const [editingMirror, setEditingMirror] = useState<CustomMirrorRecord | null>(null)
  const [customMirrorSearch, setCustomMirrorSearch] = useState('')
  const [editingPortId, setEditingPortId] = useState<string | null>(null)
  const [imageSource, setImageSource] = useState<'system' | 'custom'>('system')
  const [pythonVersionFilter, setPythonVersionFilter] = useState('python3.11')
  const [frameworkFilter, setFrameworkFilter] = useState('Pytorch 2.x')
  const [previewImageValue, setPreviewImageValue] = useState<string>()
  const isCreateRoute = location.pathname === '/machine-notebook/create'
  const isMirrorRoute = location.pathname === '/machine-notebook/mirror'
  const isEditRoute = /^\/machine-notebook\/[^/]+\/edit$/.test(location.pathname)
  const isPublishCaseRoute = /^\/machine-notebook\/[^/]+\/publish-case$/.test(location.pathname)
  const isCaseEditRoute = /^\/machine-notebook\/cases\/[^/]+\/edit$/.test(location.pathname)
  const isCaseDetailRoute = /^\/machine-notebook\/cases\/[^/]+$/.test(location.pathname)
  const isDetailRoute = Boolean(id) && !isMirrorRoute && !isCreateRoute && !isEditRoute && !isPublishCaseRoute && !isCaseDetailRoute && !isCaseEditRoute
  const gpuEnabled = Form.useWatch('gpuEnabled', form)
  const runtimeEnabled = Form.useWatch('runtimeEnabled', form)
  const selectedImageValue = Form.useWatch('image', form)
  const notebookDetail = useMemo(() => (id ? rows.find(item => item.id === id) ?? null : null), [id, rows])
  const editingNotebook = useMemo(() => (isEditRoute && id ? rows.find(item => item.id === id) ?? null : null), [id, isEditRoute, rows])
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
  const aiServiceOptions = useMemo(
    () => [
      {
        value: '在线推理服务',
        label: '在线推理服务',
        children: onlineInferenceServices.map(item => ({
          value: item.name,
          label: item.connectionStatus === '测试通过' ? item.name : `${item.name}（测试失败）`,
          disabled: item.connectionStatus !== '测试通过',
        })),
      },
    ],
    [onlineInferenceServices],
  )

  useEffect(() => {
    if (isCreateRoute) {
      form.setFieldsValue(getCreateInitialValues())
    } else if (isEditRoute && editingNotebook) {
      form.setFieldsValue(toEditFormValues(editingNotebook))
    }
  }, [editingNotebook, form, isCreateRoute, isEditRoute])

  useEffect(() => {
    if (
      !isCreateRoute &&
      !isEditRoute &&
      !isMirrorRoute &&
      !isPublishCaseRoute &&
      !isCaseEditRoute &&
      !isCaseDetailRoute &&
      new URLSearchParams(location.search).get('tab') === 'square'
    ) {
      setActiveTab('square')
      setSearchValue('')
    }
  }, [isCaseDetailRoute, isCaseEditRoute, isCreateRoute, isEditRoute, isMirrorRoute, isPublishCaseRoute, location.search])

  useEffect(() => {
    if (isPublishCaseRoute) {
      caseForm.resetFields()
      return
    }

    if (isCaseEditRoute && caseDetail) {
      caseForm.setFieldsValue({
        name: caseDetail.name,
        description: caseDetail.description,
      })
    }
  }, [caseDetail, caseForm, isCaseEditRoute, isPublishCaseRoute])

  useEffect(() => {
    const nextPreview = filteredImageOptions[0]?.value
    if (!previewImageValue || !filteredImageOptions.some(item => item.value === previewImageValue)) {
      setPreviewImageValue(nextPreview)
    }
  }, [filteredImageOptions, previewImageValue])

  useEffect(() => {
    const processingRows = squareRows.filter(item => item.publishStatus === 'processing')
    if (!processingRows.length) return

    const timer = window.setTimeout(() => {
      const now = Date.now()
      let completedCount = 0

      setSquareRows(previous =>
        previous.map(item => {
          if (item.publishStatus !== 'processing') return item
          if (now - (item.publishStartedAt ?? now) < CASE_PUBLISH_READY_DELAY) return item

          completedCount += 1
          return {
            ...item,
            publishStatus: 'published',
            createdAt: nowText(),
            highlightUntil: now + CASE_HIGHLIGHT_DURATION,
          }
        }),
      )

      if (completedCount) {
        message.success('案例已生成，可在 Notebook 广场查看')
      }
    }, 1500)

    return () => window.clearTimeout(timer)
  }, [squareRows])

  useEffect(() => {
    const now = Date.now()
    const activeHighlightRows = squareRows.filter(item => (item.highlightUntil ?? 0) > now)
    if (!activeHighlightRows.length) return

    const nextClearAt = Math.min(...activeHighlightRows.map(item => item.highlightUntil ?? now))
    const timer = window.setTimeout(() => {
      const current = Date.now()
      setSquareRows(previous =>
        previous.map(item => ((item.highlightUntil ?? 0) <= current ? { ...item, highlightUntil: undefined } : item)),
      )
    }, Math.max(nextClearAt - now, 0))

    return () => window.clearTimeout(timer)
  }, [squareRows])

  const notebookList = useMemo(
    () => rows.filter(item => item.name.toLowerCase().includes(searchValue.toLowerCase())),
    [rows, searchValue],
  )

  const squareList = useMemo(
    () => squareRows.filter(item => item.name.toLowerCase().includes(searchValue.toLowerCase())),
    [searchValue, squareRows],
  )
  const processingCaseCount = squareRows.filter(item => item.publishStatus === 'processing').length
  const mirrorNamespace = Form.useWatch('namespace', customMirrorForm)
  const customMirrorList = useMemo(
    () =>
      customMirrorRows.filter(item => {
        const keyword = customMirrorSearch.trim().toLowerCase()
        if (!keyword) return true
        return (
          item.imageName.toLowerCase().includes(keyword) ||
          item.version.toLowerCase().includes(keyword) ||
          item.description.toLowerCase().includes(keyword)
        )
      }),
    [customMirrorRows, customMirrorSearch],
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

  const stopNotebook = (notebookId: string, options?: { silent?: boolean }) => {
    setRows(previous =>
      previous.map(item => (item.id === notebookId ? { ...item, status: '已终止', updatedAt: nowText() } : item)),
    )
    if (!options?.silent) {
      message.success('Notebook 已停止')
    }
  }

  const saveNotebookEnvironment = (record: MLNotebookRecord, values: SaveEnvironmentFormValues) => {
    setCustomMirrorRows(previous => [
      {
        id: `mirror-${Date.now()}`,
        namespace: 'lab',
        imageName: 'jupyter/ml/deepexi-notebook',
        version: values.imageName?.trim() || `${record.name}-env`,
        description: values.imageDescription?.trim() || '暂无描述',
        status: '已完成',
        taskSource: record.name,
        tags: values.includeWorkspace ? ['包+依赖库', '/lab/work'] : ['包+依赖库'],
        creator: currentUser.account,
        createdAt: nowText(),
      },
      ...previous,
    ])
  }

  const setSaveEnvironmentDefaults = (record: MLNotebookRecord) => {
    saveEnvForm.setFieldsValue({
      includePackages: true,
      includeWorkspace: false,
      imageName: `${record.name}-env`,
      imageDescription: '',
    })
  }

  const openSaveEnvironment = (record: MLNotebookRecord, options?: { stopAfterSave?: boolean }) => {
    setSavingNotebook(record)
    setSaveEnvShouldStop(Boolean(options?.stopAfterSave))
    setSaveEnvironmentDefaults(record)
    setSaveEnvModalOpen(true)
  }

  const submitSaveEnvironment = async () => {
    if (!savingNotebook) return

    try {
      const values = await saveEnvForm.validateFields()
      saveNotebookEnvironment(savingNotebook, values)
      setSaveEnvModalOpen(false)
      if (saveEnvShouldStop) {
        stopNotebook(savingNotebook.id, { silent: true })
      }
      setSavingNotebook(null)
      setSaveEnvShouldStop(false)
      saveEnvForm.resetFields()
      message.success(saveEnvShouldStop ? '环境已保存，Notebook 已停止' : 'Notebook 环境已保存为自定义镜像')
    } catch {
      return
    }
  }

  const openStopNotebook = (record: MLNotebookRecord) => {
    setStoppingNotebook(record)
    setShouldSaveBeforeStop(true)
    setSaveEnvironmentDefaults(record)
    setStopModalOpen(true)
  }

  const submitStopNotebook = async () => {
    if (!stoppingNotebook) return

    const targetNotebook = stoppingNotebook

    if (shouldSaveBeforeStop) {
      try {
        const values = await saveEnvForm.validateFields()
        saveNotebookEnvironment(targetNotebook, values)
        stopNotebook(targetNotebook.id, { silent: true })
        setStopModalOpen(false)
        setStoppingNotebook(null)
        saveEnvForm.resetFields()
        message.success('环境已保存，Notebook 已停止')
      } catch {
        return
      }
      return
    }

    setStopModalOpen(false)
    setStoppingNotebook(null)
    stopNotebook(targetNotebook.id)
  }

  const submitCustomMirror = async () => {
    try {
      const values = await customMirrorForm.validateFields()
      setCustomMirrorRows(previous => [
        {
          id: `mirror-${Date.now()}`,
          namespace: values.namespace || 'lab',
          imageName: values.imageName || 'jupyter/ml/deepexi-notebook',
          version: `custom-${Date.now()}`,
          description: values.description?.trim() || '暂无描述',
          status: '已完成',
          taskSource: '-',
          tags: [],
          creator: currentUser.account,
          createdAt: nowText(),
        },
        ...previous,
      ])
      setCustomMirrorModalOpen(false)
      customMirrorForm.resetFields()
      message.success('镜像已添加')
    } catch {
      return
    }
  }

  const deleteCustomMirror = (mirrorId: string) => {
    Modal.confirm({
      title: '确认删除镜像？',
      content: '删除后该镜像将从自定义镜像列表移除。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        setCustomMirrorRows(previous => previous.filter(item => item.id !== mirrorId))
        message.success('镜像已删除')
      },
    })
  }

  const openMirrorTagEditor = (record: CustomMirrorRecord) => {
    const nextValues = mirrorTagGroups.reduce<CustomMirrorTagFormValues>((acc, group) => {
      const selectedTag = group.options.find(option => record.tags.includes(option))
      if (selectedTag) {
        acc[group.key] = selectedTag
      }
      return acc
    }, {})
    setEditingMirror(record)
    mirrorTagForm.setFieldsValue(nextValues)
    setMirrorTagModalOpen(true)
  }

  const submitMirrorTags = async () => {
    if (!editingMirror) return

    const values = await mirrorTagForm.validateFields()
    const tags = mirrorTagGroups
      .map(group => values[group.key])
      .filter((value): value is string => Boolean(value))

    setCustomMirrorRows(previous =>
      previous.map(item => (item.id === editingMirror.id ? { ...item, tags } : item)),
    )
    setMirrorTagModalOpen(false)
    setEditingMirror(null)
    mirrorTagForm.resetFields()
    message.success('镜像标签已更新')
  }

  const canStartNotebookTask = (status: NotebookStatus) => !['启动中', '排队中', '运行中'].includes(status)

  const startNotebookTask = (notebookId: string) => {
    setRows(previous => previous.map(item => (item.id === notebookId ? { ...item, status: '启动中' } : item)))
    message.success('Notebook 已进入启动中')
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

  const notebookColumns: ColumnsType<MLNotebookRecord> = [
    { title: 'Notebook名称', dataIndex: 'name', key: 'name', width: 240, ellipsis: true },
    {
      title: '镜像',
      dataIndex: 'image',
      key: 'image',
      width: 330,
      render: value => renderNotebookImageSummary(value),
    },
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
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 120 },
    {
      title: '操作',
      key: 'action',
      width: 430,
      render: (_, record) => (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            minWidth: 390,
            whiteSpace: 'nowrap',
          }}
        >
          {record.status === '运行中' ? (
            <>
              <Button type="link" size="small" disabled={!canOpenNotebook(record.status)} onClick={() => message.success('正在打开 Notebook')}>
                打开
              </Button>
              <Button type="link" size="small" onClick={() => openSaveEnvironment(record)}>
                保存环境
              </Button>
              <Button
                type="link"
                size="small"
                disabled={!canRunTaskLifecycleAction(record.status, 'terminate')}
                onClick={() => openStopNotebook(record)}
              >
                停止
              </Button>
              <Button type="link" size="small" onClick={() => navigate(`/machine-notebook/${record.id}`)}>
                查看详情
              </Button>
              <Button type="link" size="small" onClick={() => navigate(`/machine-notebook/${record.id}/publish-case`)}>
                发布为案例
              </Button>
            </>
          ) : (
            <>
              <Button
                type="link"
                size="small"
                disabled={!canStartNotebookTask(record.status)}
                onClick={() => startNotebookTask(record.id)}
              >
                启动
              </Button>
              <Button
                type="link"
                size="small"
                disabled={!canEditNotebook(record.status)}
                onClick={() => navigate(`/machine-notebook/${record.id}/edit`)}
              >
                编辑
              </Button>
              <Button type="link" size="small" onClick={() => navigate(`/machine-notebook/${record.id}`)}>
                查看详情
              </Button>
              <Button type="link" size="small" onClick={() => navigate(`/machine-notebook/${record.id}/publish-case`)}>
                发布为案例
              </Button>
            </>
          )}
          <Dropdown
            trigger={['click']}
            menu={{
              items: [{ key: 'delete', label: '删除', danger: true }],
              onClick: () => {
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
    navigate('/machine-notebook/create')
  }

  const closeCreate = () => {
    navigate('/machine-notebook')
  }

  const closeEdit = () => {
    if (editingNotebook) {
      navigate(`/machine-notebook/${editingNotebook.id}`)
      return
    }

    navigate('/machine-notebook')
  }

  const openImagePicker = () => {
    const currentImage = imageOptions.find(item => item.value === (form.getFieldValue('image') as string | undefined)) ?? imageOptions[0]
    setImageSource(currentImage.source)
    setPythonVersionFilter(currentImage.pythonVersion)
    setFrameworkFilter(currentImage.framework)
    setPreviewImageValue(currentImage.value)
    setImageDrawerOpen(true)
  }

  const switchImageSource = (source: 'system' | 'custom') => {
    const firstImage = imageOptions.find(item => item.source === source)
    setImageSource(source)
    if (firstImage) {
      setPythonVersionFilter(firstImage.pythonVersion)
      setFrameworkFilter(firstImage.framework)
      setPreviewImageValue(firstImage.value)
    }
  }

  const switchPythonVersionFilter = (pythonVersion: string) => {
    const firstImage = imageOptions.find(item => item.source === imageSource && item.pythonVersion === pythonVersion)
    setPythonVersionFilter(pythonVersion)
    if (firstImage) {
      setFrameworkFilter(firstImage.framework)
      setPreviewImageValue(firstImage.value)
    }
  }

  const switchFrameworkFilter = (framework: string) => {
    const firstImage = imageOptions.find(
      item => item.source === imageSource && item.pythonVersion === pythonVersionFilter && item.framework === framework,
    )
    setFrameworkFilter(framework)
    if (firstImage) {
      setPreviewImageValue(firstImage.value)
    }
  }

  const confirmImagePicker = () => {
    if (!previewImage) {
      message.warning('请选择镜像')
      return
    }

    form.setFieldValue('image', previewImage.value)
    form.setFields([{ name: 'image', errors: [] }])
    setImageDrawerOpen(false)
    message.success('镜像已选择')
  }

  const submitCreate = async () => {
    try {
      const values = await form.validateFields()
      const newRecord: MLNotebookRecord = {
        id: `ml-nb-${Date.now()}`,
        name: values.name || '未命名Notebook',
        description: values.description?.trim() || '',
        image: values.image || imageOptions[0].value,
        sshSupported: false,
        status: '已创建',
        spec: buildSpecSummary(values),
        runtimeLimit: buildRuntimeLimit(values),
        createdAt: nowText(),
        updatedAt: nowText(),
        creator: currentUser.username,
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

  const submitEdit = async () => {
    if (!editingNotebook || !canEditNotebook(editingNotebook.status)) {
      message.warning('请先停止 Notebook 后再编辑配置')
      return
    }

    try {
      const values = await form.validateFields()
      setRows(previous =>
        previous.map(item =>
          item.id === editingNotebook.id
            ? {
                ...item,
                name: values.name || item.name,
                description: values.description?.trim() || '',
                image: values.image || item.image,
                spec: buildSpecSummary(values),
                runtimeLimit: buildRuntimeLimit(values),
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
              }
            : item,
        ),
      )
      message.success('Notebook 配置已保存，重新启动后生效')
      navigate(`/machine-notebook/${editingNotebook.id}`)
    } catch {
      return
    }
  }

  const submitCasePublish = async () => {
    try {
      const values = await caseForm.validateFields()

      if (isCaseEditRoute && caseDetail) {
        const nextRecord: MLSquareRecord = {
          ...caseDetail,
          name: values.name,
          description: values.description,
        }
        setSquareRows(previous => previous.map(item => (item.id === nextRecord.id ? nextRecord : item)))
        message.success('案例内容已发布更新')
        navigate(`/machine-notebook/cases/${nextRecord.id}`)
        return
      }

      if (!sourceNotebook) {
        message.warning('未找到要发布的 Notebook')
        return
      }

      const nextRecord: MLSquareRecord = {
        id: `ml-sq-pending-${Date.now()}`,
        name: values.name,
        description: values.description,
        creatorAccount: currentUser.account,
        creator: currentUser.username,
        createdAt: nowText(),
        sourceNotebookId: sourceNotebook.id,
        sourceNotebookName: sourceNotebook.name,
        publishStatus: 'processing',
        publishStartedAt: Date.now(),
      }
      setSquareRows(previous => [nextRecord, ...previous])
      setActiveTab('square')
      setSearchValue('')
      message.success('案例发布任务已提交，正在生成案例')
      navigate('/machine-notebook?tab=square')
    } catch {
      return
    }
  }

  const notebookWorkflowModals = (
    <>
      <Modal
        title="停止 Notebook"
        open={stopModalOpen}
        okText="确定"
        cancelText="取消"
        onOk={submitStopNotebook}
        onCancel={() => {
          setStopModalOpen(false)
          setStoppingNotebook(null)
          saveEnvForm.resetFields()
        }}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Text>停止前是否保存当前最新环境？</Text>
          <Radio.Group
            value={shouldSaveBeforeStop}
            onChange={event => setShouldSaveBeforeStop(event.target.value)}
          >
            <Space>
              <Radio value={true}>是，保存当前最新环境</Radio>
              <Radio value={false}>否，直接停止</Radio>
            </Space>
          </Radio.Group>
          {shouldSaveBeforeStop && (
            <Form form={saveEnvForm} layout="vertical" style={{ width: '100%', paddingTop: 8 }}>
              <div style={{ marginBottom: 16 }}>
                <Text type="secondary">选择需要保存到自定义镜像的内容，并填写镜像信息。</Text>
              </div>
              <Form.Item name="includePackages" valuePropName="checked" style={{ marginBottom: 8 }}>
                <Checkbox disabled>包+依赖库</Checkbox>
              </Form.Item>
              <Form.Item name="includeWorkspace" valuePropName="checked">
                <Checkbox>工作目录（/lab/work）</Checkbox>
              </Form.Item>
              <Form.Item
                label="镜像名称"
                name="imageName"
                rules={[
                  { required: true, message: '请输入镜像名称' },
                  { max: 64, message: '镜像名称不能超过 64 个字符' },
                ]}
              >
                <Input placeholder="请输入镜像名称" />
              </Form.Item>
              <Form.Item label="镜像描述" name="imageDescription">
                <Input.TextArea rows={4} placeholder="请输入镜像描述" maxLength={300} showCount />
              </Form.Item>
            </Form>
          )}
        </Space>
      </Modal>

      <Modal
        title="保存环境"
        open={saveEnvModalOpen}
        okText="保存"
        cancelText="取消"
        onOk={submitSaveEnvironment}
        onCancel={() => {
          setSaveEnvModalOpen(false)
          setSavingNotebook(null)
          setSaveEnvShouldStop(false)
          saveEnvForm.resetFields()
        }}
      >
        <Form form={saveEnvForm} layout="vertical">
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">选择需要保存到自定义镜像的内容，并填写镜像信息。</Text>
          </div>
          <Form.Item name="includePackages" valuePropName="checked" style={{ marginBottom: 8 }}>
            <Checkbox disabled>包+依赖库</Checkbox>
          </Form.Item>
          <Form.Item name="includeWorkspace" valuePropName="checked">
            <Checkbox>工作目录（/lab/work）</Checkbox>
          </Form.Item>
          <Form.Item
            label="镜像名称"
            name="imageName"
            rules={[
              { required: true, message: '请输入镜像名称' },
              { max: 64, message: '镜像名称不能超过 64 个字符' },
            ]}
          >
            <Input placeholder="请输入镜像名称" />
          </Form.Item>
          <Form.Item label="镜像描述" name="imageDescription">
            <Input.TextArea rows={4} placeholder="请输入镜像描述" maxLength={300} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )

  if (isEditRoute && (!editingNotebook || !canEditNotebook(editingNotebook.status))) {
    return (
      <div style={{ padding: '28px 32px 40px', minHeight: '100%' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(editingNotebook ? `/machine-notebook/${editingNotebook.id}` : '/machine-notebook')} style={{ marginBottom: 20 }}>
          返回
        </Button>
        <Alert
          type="warning"
          showIcon
          message={editingNotebook ? '运行中的 Notebook 暂不支持编辑配置' : 'Notebook 不存在'}
          description={editingNotebook ? '请先停止 Notebook，停止后可进入编辑页修改原创建配置；再次启动前可反复编辑。' : '请返回列表重新选择要编辑的 Notebook。'}
        />
      </div>
    )
  }

  if (isCreateRoute || isEditRoute) {
    const isEditing = Boolean(isEditRoute && editingNotebook)
    return (
      <div style={{ padding: '28px 32px 40px', minHeight: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={isEditing ? closeEdit : closeCreate}>
            返回
          </Button>
        </div>

        <Card style={cardStyle}>
          <Title level={4} style={{ marginTop: 0, marginBottom: 20 }}>
            {isEditing ? '编辑 Notebook' : '创建 Notebook'}
          </Title>
          <Form form={form} layout="vertical" initialValues={getCreateInitialValues()}>
            <div style={{ display: 'grid', gap: 18 }}>
              <Card size="small" style={sectionCardStyle}>
                <Title level={5} style={{ marginBottom: 6 }}>
                  基本信息
                </Title>
                <Text type="secondary" style={{ display: 'block', marginBottom: 18 }}>设置Notebook基本信息。</Text>
                <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
                  <Input maxLength={50} showCount placeholder="请输入Notebook名称" />
                </Form.Item>
                <Form.Item label="描述" name="description">
                  <Input.TextArea rows={4} maxLength={300} showCount placeholder="请输入描述（可选）" />
                </Form.Item>
              </Card>

              <Card size="small" style={sectionCardStyle}>
                <Title level={5} style={{ marginBottom: 6 }}>
                  AI服务选择
                </Title>
                <Text type="secondary" style={{ display: 'block', marginBottom: 18 }}>选择你想使用的模型服务，可在Notebook任务中使用</Text>
                <Form.Item label="AI服务" name="aiService">
                  <Cascader allowClear placeholder="请选择在线推理服务（可选）" options={aiServiceOptions} />
                </Form.Item>
              </Card>

              <Card size="small" style={sectionCardStyle}>
                <Title level={5} style={{ marginBottom: 6 }}>
                  数据/模型选择
                </Title>
                <Text type="secondary" style={{ display: 'block', marginBottom: 18 }}>选择任务中需要的数据集或模型。</Text>
                <Radio checked style={{ display: 'block', marginBottom: 16 }}>机器学习</Radio>
                <Form.Item label="数据集">
                  <Input.Group compact>
                    <Form.Item name="dataset" noStyle>
                      <Select allowClear placeholder="请选择1-3个数据集（展开行勾选版本）" options={datasetOptions} style={{ width: 'calc(100% - 72px)' }} />
                    </Form.Item>
                    <Button type="primary">选择</Button>
                  </Input.Group>
                </Form.Item>
                <Form.Item label="模型" name="model">
                  <Select allowClear placeholder="请输入模型" options={modelOptions} />
                </Form.Item>
              </Card>

              <Card size="small" style={sectionCardStyle}>
                <Title level={5} style={{ marginBottom: 6 }}>
                  资源配置
                </Title>
                <Text type="secondary" style={{ display: 'block', marginBottom: 18 }}>配置CPU、内存和显卡资源。</Text>
                <Text strong style={{ display: 'block', marginBottom: 12 }}>CPU配置</Text>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Form.Item label="CPU请求" name="cpuRequest" rules={[{ required: true, message: '请输入 CPU 请求' }]}>
                    <InputNumber style={{ width: '100%' }} min={0.5} step={0.5} addonAfter="Core" />
                  </Form.Item>
                  <Form.Item label="CPU限制" name="cpuLimit" rules={[{ required: true, message: '请输入 CPU 限制' }]}>
                    <InputNumber style={{ width: '100%' }} min={0.5} step={0.5} addonAfter="Core" />
                  </Form.Item>
                </div>
                <Text strong style={{ display: 'block', marginBottom: 12 }}>内存配置</Text>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Form.Item label="内存请求" name="memoryRequest" rules={[{ required: true, message: '请输入内存请求' }]}>
                    <InputNumber style={{ width: '100%' }} min={0.5} step={0.5} addonAfter="GB" />
                  </Form.Item>
                  <Form.Item label="内存限制" name="memoryLimit" rules={[{ required: true, message: '请输入内存限制' }]}>
                    <InputNumber style={{ width: '100%' }} min={0.5} step={0.5} addonAfter="GB" />
                  </Form.Item>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 12,
                    alignItems: 'center',
                    padding: '8px 0',
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
                    padding: '8px 0',
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
                <Title level={5} style={{ marginBottom: 6 }}>
                  选择Notebook镜像
                </Title>
                <Text type="secondary" style={{ display: 'block', marginBottom: 18 }}>选择适合您需求的预配置环境</Text>
                <Form.Item name="image" rules={[{ required: true, message: '请选择镜像' }]} hidden>
                  <Input />
                </Form.Item>
                <Form.Item
                  label="镜像"
                  required
                  validateStatus={form.getFieldError('image').length ? 'error' : ''}
                  help={form.getFieldError('image')[0]}
                >
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Button icon={<PlusOutlined />} onClick={openImagePicker} style={{ width: 160 }}>
                      添加镜像
                    </Button>
                    {selectedImageValue ? (
                      <div
                        style={{
                          width: '100%',
                          maxWidth: 560,
                          border: '1px solid #dbeafe',
                          background: '#f8fbff',
                          borderRadius: 12,
                          padding: '12px 14px',
                        }}
                      >
                        <Text type="secondary" style={{ display: 'block', marginBottom: 6 }}>
                          当前镜像
                        </Text>
                        {renderNotebookImageSummary(selectedImageValue)}
                      </div>
                    ) : null}
                  </Space>
                </Form.Item>
              </Card>

              <Card size="small" style={sectionCardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                  <Title level={5} style={{ margin: 0 }}>
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
              <Button type="primary" onClick={isEditing ? submitEdit : submitCreate}>
                {isEditing ? '保存' : '创建'}
              </Button>
              <Button onClick={isEditing ? closeEdit : closeCreate}>取消</Button>
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
              <Radio.Group value={imageSource} onChange={event => switchImageSource(event.target.value)} style={{ marginBottom: 28 }}>
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
                    onClick={() => switchPythonVersionFilter(item)}
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
                    onClick={() => switchFrameworkFilter(item)}
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
                  ? `/machine-notebook/cases/${caseDetail.id}`
                  : '/machine-notebook',
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

            <Form.Item
              label="案例说明"
              name="description"
              tooltip={{ title: <span style={{ whiteSpace: 'pre-line' }}>{PUBLISH_CASE_NOTICE}</span> }}
              rules={[{ required: true, message: '请输入案例说明' }]}>
              <Input.TextArea rows={18} placeholder={PUBLISH_CASE_NOTICE} maxLength={5000} showCount />
            </Form.Item>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <Button onClick={() => navigate(isCaseEditRoute && caseDetail ? `/machine-notebook/cases/${caseDetail.id}` : '/machine-notebook')}>
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

  if (isMirrorRoute) {
    const mirrorColumns: ColumnsType<CustomMirrorRecord> = [
      {
        title: '镜像',
        key: 'image',
        width: 260,
        render: (_, record) => (
          <div style={{ fontSize: 12, lineHeight: 1.7 }}>
            <div><Text type="secondary">命名空间：</Text><Text strong>{record.namespace}</Text></div>
            <div><Text type="secondary">名称：</Text><Text strong>{record.imageName}</Text></div>
            <div><Text type="secondary">镜像版本：</Text><Text strong>{record.version}</Text></div>
          </div>
        ),
      },
      { title: '描述', dataIndex: 'description', key: 'description', width: 180 },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 110,
        render: value => <Tag color={value === '已完成' ? 'green' : value === '失败' ? 'red' : 'processing'}>{value}</Tag>,
      },
      { title: '任务来源', dataIndex: 'taskSource', key: 'taskSource', width: 160 },
      {
        title: '标签',
        key: 'tags',
        width: 180,
        render: (_, record) =>
          record.tags.length ? (
            <Space size={6} wrap>
              {record.tags.map(tag => <Tag key={tag}>{tag}</Tag>)}
            </Space>
          ) : (
            <Text type="secondary">暂无标签</Text>
          ),
      },
      { title: '创建人', dataIndex: 'creator', key: 'creator', width: 110 },
      { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170 },
      {
        title: '操作',
        key: 'action',
        width: 190,
        fixed: 'right',
        render: (_, record) => (
          <Space size={10}>
            <Button
              type="link"
              size="small"
              disabled={record.status === '失败'}
              onClick={() => openMirrorTagEditor(record)}
            >
              编辑标签
            </Button>
            <Button type="link" size="small" danger onClick={() => deleteCustomMirror(record.id)}>
              删除
            </Button>
            <Button type="link" size="small" onClick={() => message.info('暂无镜像构建日志')}>
              日志
            </Button>
          </Space>
        ),
      },
    ]

    return (
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Card style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'center', marginBottom: 18 }}>
            <div>
              <Title level={2} style={{ marginBottom: 8 }}>自定义镜像</Title>
              <Text type="secondary">管理 Notebook 保存环境或手动添加的自定义镜像。</Text>
            </div>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/machine-notebook')}>
              返回Notebook
            </Button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <Space wrap>
              <Input
                placeholder="请输入镜像名称"
                value={customMirrorSearch}
                onChange={event => setCustomMirrorSearch(event.target.value)}
                style={{ width: 260 }}
              />
              <Button type="primary" icon={<SearchOutlined />}>
                搜索
              </Button>
            </Space>
            <Space wrap>
              <Button icon={<ReloadOutlined />} onClick={() => message.success('自定义镜像列表已刷新')}>
                刷新
              </Button>
              <Button type="primary" onClick={() => setCustomMirrorModalOpen(true)}>
                添加镜像
              </Button>
            </Space>
          </div>

          <Table
            rowKey="id"
            columns={mirrorColumns}
            dataSource={customMirrorList}
            scroll={{ x: 1450 }}
            tableLayout="fixed"
            pagination={{ pageSize: 10, showTotal: total => `第 1-${total} 条，共 ${total} 条` }}
          />
        </Card>

        <Modal
          title="添加镜像"
          open={customMirrorModalOpen}
          okText="确定"
          cancelText="取消"
          onOk={submitCustomMirror}
          onCancel={() => {
            setCustomMirrorModalOpen(false)
            customMirrorForm.resetFields()
          }}
        >
          <Form form={customMirrorForm} layout="vertical">
            <Form.Item label="命名空间" name="namespace" rules={[{ required: true, message: '请选择命名空间' }]}>
              <Select placeholder="请选择命名空间" options={namespaceOptions} />
            </Form.Item>
            <Form.Item label="镜像名称" name="imageName" rules={[{ required: true, message: '请选择镜像名称' }]}>
              <Select
                disabled={!mirrorNamespace}
                placeholder={mirrorNamespace ? '请选择镜像名称' : '请先选择命名空间'}
                options={mirrorNameOptions}
              />
            </Form.Item>
            <Form.Item label="描述" name="description">
              <Input.TextArea rows={4} placeholder="请输入描述（选填）" />
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title="编辑标签"
          open={mirrorTagModalOpen}
          okText="确定"
          cancelText="取消"
          onOk={submitMirrorTags}
          onCancel={() => {
            setMirrorTagModalOpen(false)
            setEditingMirror(null)
            mirrorTagForm.resetFields()
          }}
        >
          <Form form={mirrorTagForm} layout="vertical">
            <Text type="secondary" style={{ display: 'block', marginBottom: 18 }}>
              每个标签类型最多选择一种，保存后同步展示在镜像列表。
            </Text>
            {mirrorTagGroups.map(group => (
              <Form.Item key={group.key} label={group.title} name={group.key}>
                <Radio.Group optionType="button">
                  <Space wrap>
                    {group.options.map(option => (
                      <Radio.Button key={option} value={option}>
                        {option}
                      </Radio.Button>
                    ))}
                  </Space>
                </Radio.Group>
              </Form.Item>
            ))}
          </Form>
        </Modal>
      </div>
    )
  }

  if (isCaseDetailRoute && caseDetail) {
    return (
      <div style={{ padding: '28px 32px 40px', minHeight: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/machine-notebook')}>
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
                  <Button type="primary" onClick={() => navigate(`/machine-notebook/cases/${caseDetail.id}/edit`)}>
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
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/machine-notebook')}>
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
              onClick={() => openStopNotebook(notebookDetail)}
            >
              停止
            </Button>
            <Button
              disabled={!canEditNotebook(notebookDetail.status)}
              onClick={() => navigate(`/machine-notebook/${notebookDetail.id}/edit`)}
            >
              编辑
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

            <div style={{ display: 'grid', gap: 18 }}>
              <Card title="资源配置" size="small" style={sectionCardStyle}>
                <div style={{ display: 'grid', gap: 16, fontSize: 16 }}>
                  <div><Text strong>CPU：</Text>{`${notebookDetail.cpuRequest.replace(' Core', '')} ~ ${notebookDetail.cpuLimit.replace(' Core', '')} Cores`}</div>
                  <div><Text strong>内存：</Text>{`${notebookDetail.memoryRequest.replace(' GB', '')} ~ ${notebookDetail.memoryLimit.replace(' GB', '')} GB`}</div>
                  <div><Text strong>显卡类型：</Text>{notebookDetail.gpuEnabled ? notebookDetail.gpuType || '-' : '未启用'}</div>
                  <div><Text strong>显卡数量：</Text>{notebookDetail.gpuEnabled ? notebookDetail.gpuCount || '-' : '-'}</div>
                  <div><Text strong>实例ID：</Text>{getNotebookInstanceId(notebookDetail.id)}</div>
                </div>
              </Card>

              {notebookDetail.sshConfig && (
                <Card title="SSH 配置信息" size="small" style={sectionCardStyle}>
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
            </div>
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
        {notebookWorkflowModals}
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
              { key: 'mine', label: '我的Notebook' },
              { key: 'square', label: 'Notebook广场' },
            ]}
          />

          <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
            <Space wrap>
              <Input
                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                placeholder={activeTab === 'mine' ? '搜索Notebook' : '搜索名称'}
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                style={{ width: 230 }}
              />
              {activeTab === 'mine' && (
                <Select
                  allowClear
                  placeholder="状态"
                  style={{ width: 150 }}
                  options={[
                    { value: '运行中', label: '运行中' },
                    { value: '已终止', label: '已终止' },
                    { value: '已创建', label: '已创建' },
                  ]}
                />
              )}
              {activeTab === 'mine' ? (
                <>
                  <Button type="primary">搜索</Button>
                  <Button onClick={() => setSearchValue('')}>重置</Button>
                </>
              ) : (
                <Button icon={<SearchOutlined />} />
              )}
            </Space>

            <Space wrap>
              {activeTab === 'mine' && (
                <>
                  <Button type="primary" onClick={openCreate}>
                    创建Notebook
                  </Button>
                  <Button onClick={() => navigate('/machine-notebook/mirror')}>
                    自定义镜像
                  </Button>
                </>
              )}
              <Button icon={<ReloadOutlined />} onClick={() => message.success('Notebook 列表已刷新')}>
                刷新
              </Button>
            </Space>
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
              {processingCaseCount > 0 && (
                <Alert
                  showIcon
                  type="info"
                  style={{ marginBottom: 16 }}
                  message={`有 ${processingCaseCount} 个案例正在生成`}
                  description="发布任务已提交，系统会自动刷新 Notebook 广场；生成完成后新案例会高亮展示。"
                />
              )}
              {squareList.length ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 18 }}>
                  {squareList.map(item => {
                    const isProcessing = item.publishStatus === 'processing'
                    const isHighlighted = item.publishStatus === 'published' && (item.highlightUntil ?? 0) > Date.now()

                    return (
                      <Card
                        key={item.id}
                        style={{
                          borderRadius: 18,
                          minHeight: 212,
                          border: isProcessing
                            ? '1px solid #93c5fd'
                            : isHighlighted
                              ? '1px solid #22c55e'
                              : undefined,
                          background: isProcessing
                            ? 'linear-gradient(180deg, #eff6ff 0%, #ffffff 72%)'
                            : isHighlighted
                              ? 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 72%)'
                              : undefined,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 }}>
                          <Title level={4} style={{ margin: 0, fontSize: 18 }}>
                            {item.name}
                          </Title>
                          {isProcessing ? (
                            <Tag icon={<SyncOutlined spin />} color="processing">
                              生成中
                            </Tag>
                          ) : (
                            <Button type="text" danger icon={<DeleteOutlined />} />
                          )}
                        </div>
                        {item.sourceNotebookName && (
                          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                            来源：{item.sourceNotebookName}
                          </Text>
                        )}
                        <Paragraph type="secondary" style={{ minHeight: 72 }}>
                          {item.description || '暂无说明'}
                        </Paragraph>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                          <Button
                            icon={<EyeOutlined />}
                            disabled={isProcessing}
                            onClick={() => navigate(`/machine-notebook/cases/${item.id}`)}
                            style={{ width: '100%' }}
                          >
                            查看详情
                          </Button>
                          <Button type="primary" icon={<CopyOutlined />} disabled={isProcessing} style={{ width: '100%' }}>
                            复制案例
                          </Button>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              ) : (
                <Empty description="暂无案例" />
              )}
            </>
          )}
        </Card>
      </div>

      {notebookWorkflowModals}
    </>
  )
}

export default MLNotebook
