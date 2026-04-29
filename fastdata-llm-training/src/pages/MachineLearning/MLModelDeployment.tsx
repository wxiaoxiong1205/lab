import React, { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Cascader,
  Descriptions,
  Form,
  Input,
  InputNumber,
  message,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftOutlined,
  CloudServerOutlined,
  CodeOutlined,
  DownloadOutlined,
  InboxOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  canRunTaskLifecycleAction,
  getPrimaryTaskLifecycleAction,
  STARTING_TERMINATE_BLOCKED_MESSAGE,
  TASK_LIFECYCLE_TAG,
  type TaskLifecycleStatus,
} from '../../services/taskLifecycle'
import {
  machineDeploymentActions,
  useMachineDeploymentStore,
  type CustomDeploymentConfig,
  type DeploymentType,
  type MLDeploymentRecord,
  type ResourceConfig,
  type StandardDeploymentConfig,
} from '../../services/machineDeploymentStore'

const { Title, Text } = Typography

interface CreateFormValues {
  name?: string
  standard: StandardDeploymentConfig
  custom: CustomDeploymentConfig
}

const modelOptions = [
  { value: 'hzj_图片分类多标签', label: 'hzj_图片分类多标签', network: 'resnet34', versions: ['V3', 'V2'] },
  { value: 'basion-图像分类-单标签', label: 'basion-图像分类-单标签', network: 'resnet50', versions: ['V2', 'V1'] },
  { value: 'defect-detection-yolov8', label: 'defect-detection-yolov8', network: 'yolov8', versions: ['V5', 'V4'] },
]

const gpuOptions = [
  { value: 'NVIDIA Tesla T4', label: 'NVIDIA Tesla T4' },
  { value: 'NVIDIA A10', label: 'NVIDIA A10' },
  { value: 'NVIDIA V100', label: 'NVIDIA V100' },
]

const systemImageOptions = [
  { value: 'python-inference:3.9-ubuntu2004', label: 'python-inference:3.9-ubuntu2004' },
  { value: 'pytorch-inference:2.1-cuda12.1', label: 'pytorch-inference:2.1-cuda12.1' },
  { value: 'sklearn-serving:1.4-ubuntu2204', label: 'sklearn-serving:1.4-ubuntu2204' },
]

const customImageOptions = [
  { value: 'registry.cn-shanghai.aliyuncs.com/ml/custom-serving:1.0.0', label: 'registry.cn-shanghai.aliyuncs.com/ml/custom-serving:1.0.0' },
  { value: 'registry.cn-beijing.aliyuncs.com/ml/yolov8-serving:2.1.0', label: 'registry.cn-beijing.aliyuncs.com/ml/yolov8-serving:2.1.0' },
  { value: 'harbor.example.com/ml/classifier-runtime:latest', label: 'harbor.example.com/ml/classifier-runtime:latest' },
]

const standardRunCommand = 'gunicorn --bind :9090 --workers 1 --threads 1 --timeout 120 _wsgi:app'

const standardImageOptions = [
  {
    value: 'ML',
    label: 'ML',
    children: [
      {
        value: 'jupyter/deepexi-notebook:pytorch_2.11-cuda_12.8-py312-ubuntu24.04-ml',
        label: 'jupyter/deepexi-notebook:pytorch_2.11-cuda_12.8-py312-ubuntu24.04-ml',
      },
      {
        value: 'jupyter/deepexi-notebook:pytorch_2.5-cuda_12.1-py312-ubuntu24.04-ml',
        label: 'jupyter/deepexi-notebook:pytorch_2.5-cuda_12.1-py312-ubuntu24.04-ml',
      },
    ],
  },
]

const notebookPythonOptions = [
  { value: 'nb-1:model.py', label: '3rwrwr / model.py' },
  { value: 'nb-2:model.py', label: '新建 Notebook-选带标签的镜像 / model.py' },
]

const defaultCustomSpec = `{
  "metadata": {
    "name": "",
    "instance": 1,
    "workspace_id": "411740",
    "disk": "30Gi"
  },
  "cloud": {
    "computing": {
      "instances": [
        {
          "type": "ecs.gn6e-c12g1.12xlarge"
        }
      ]
    }
  },
  "containers": [
    {
      "image": "",
      "script": "python app.py",
      "port": 8000
    }
  ]
}`

function buildResourceSummary(resource: ResourceConfig) {
  const cpu = resource.cpuRequest ? `${resource.cpuRequest}C` : '-'
  const memory = resource.memoryRequest ? `${resource.memoryRequest}GB` : '-'
  const gpu = resource.gpuType && resource.gpuCount ? `${resource.gpuType} x${resource.gpuCount}` : 'CPU'
  return `${cpu} / ${memory} / ${gpu}`
}

function buildInstanceCount(resource: ResourceConfig) {
  return `0/${resource.instanceCount ?? 1}`
}

function buildImageSummary(config: CustomDeploymentConfig) {
  const imageName = config.imageSource === 'system' ? config.systemImage : config.customImage
  return imageName ? `镜像部署 / ${imageName}` : '镜像部署'
}

function getStatusTag(status: TaskLifecycleStatus) {
  const config = TASK_LIFECYCLE_TAG[status]
  return <Tag color={config.color}>{config.label}</Tag>
}

function getCreateInitialValues(): CreateFormValues {
  return {
    name: '',
    standard: {
      modelSource: '模型管理',
      model: undefined,
      modelVersion: undefined,
      network: undefined,
      imageSource: 'system',
      imageSelection: ['ML', 'jupyter/deepexi-notebook:pytorch_2.11-cuda_12.8-py312-ubuntu24.04-ml'],
      customImage: undefined,
      runCommand: standardRunCommand,
      pythonSource: 'local',
      pythonFile: undefined,
      notebookSource: undefined,
      resources: {
        cpuRequest: 4,
        cpuLimit: 8,
        memoryRequest: 16,
        memoryLimit: 32,
        gpuType: 'NVIDIA Tesla T4',
        gpuCount: 1,
        instanceCount: 1,
      },
    },
    custom: {
      deployMode: '镜像部署',
      imageSource: 'system',
      systemImage: 'python-inference:3.9-ubuntu2004',
      customImage: '',
      command: 'python app.py',
      port: 8000,
      dependencies: [],
      envs: [],
      resources: {
        cpuRequest: 6,
        cpuLimit: 8,
        memoryRequest: 24,
        memoryLimit: 32,
        gpuType: 'NVIDIA Tesla T4',
        gpuCount: 1,
        instanceCount: 1,
      },
      serviceConfig: {},
      serviceConfigJson: defaultCustomSpec,
    },
  }
}

function buildFormValuesFromRecord(record: MLDeploymentRecord): CreateFormValues {
  const initialValues = getCreateInitialValues()
  return {
    name: record.name,
    standard: record.standardConfig ?? initialValues.standard,
    custom: {
      ...(record.customConfig ?? initialValues.custom),
      serviceConfigJson: record.customConfig?.serviceConfigJson ?? defaultCustomSpec,
    },
  }
}

function buildDeploymentPayload(values: CreateFormValues, deploymentType: DeploymentType) {
  const standard = values.standard

  if (deploymentType === 'standard') {
    return {
      name: values.name?.trim() ?? '',
      deploymentType,
      targetSummary: `${standard.model ?? '-'} / ${standard.network ?? '-'}`,
      resourceSummary: buildResourceSummary(standard.resources),
      instanceCount: buildInstanceCount(standard.resources),
      standardConfig: standard,
      customConfig: undefined,
    }
  }

  const custom = values.custom
  return {
    name: values.name?.trim() ?? '',
    deploymentType,
    targetSummary: buildImageSummary(custom),
    resourceSummary: buildResourceSummary(custom.resources),
    instanceCount: buildInstanceCount(custom.resources),
    standardConfig: standard,
    customConfig: custom,
  }
}

const sectionCardStyle: React.CSSProperties = {
  borderRadius: 18,
  border: '1px solid #e5e7eb',
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.04)',
}

const sectionTitleStyle: React.CSSProperties = {
  marginBottom: 20,
  fontSize: 18,
  fontWeight: 600,
}

const ResourceFields: React.FC<{ prefix: (string | number)[]; hideInstanceCount?: boolean }> = ({ prefix, hideInstanceCount }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
    <Card size="small" style={{ borderRadius: 14, background: '#f8fafc', borderColor: '#e2e8f0' }}>
      <div style={{ fontWeight: 600, marginBottom: 16 }}>CPU 与内存请求</div>
      <Form.Item label="CPU请求" name={[...prefix, 'cpuRequest']} rules={[{ required: true, message: '请输入 CPU 请求' }]}>
        <InputNumber style={{ width: '100%' }} min={1} addonAfter="Core" />
      </Form.Item>
      <Form.Item label="内存请求" name={[...prefix, 'memoryRequest']} rules={[{ required: true, message: '请输入内存请求' }]}>
        <InputNumber style={{ width: '100%' }} min={1} addonAfter="GB" />
      </Form.Item>
    </Card>

    <Card size="small" style={{ borderRadius: 14, background: '#f8fafc', borderColor: '#e2e8f0' }}>
      <div style={{ fontWeight: 600, marginBottom: 16 }}>CPU 与内存限制</div>
      <Form.Item label="CPU限制" name={[...prefix, 'cpuLimit']} rules={[{ required: true, message: '请输入 CPU 限制' }]}>
        <InputNumber style={{ width: '100%' }} min={1} addonAfter="Core" />
      </Form.Item>
      <Form.Item label="内存限制" name={[...prefix, 'memoryLimit']} rules={[{ required: true, message: '请输入内存限制' }]}>
        <InputNumber style={{ width: '100%' }} min={1} addonAfter="GB" />
      </Form.Item>
    </Card>

    <Card size="small" style={{ borderRadius: 14, background: '#f8fafc', borderColor: '#e2e8f0' }}>
      <div style={{ fontWeight: 600, marginBottom: 16 }}>{hideInstanceCount ? 'GPU' : 'GPU 与实例'}</div>
      <Form.Item label="显卡类型" name={[...prefix, 'gpuType']}>
        <Select allowClear placeholder="可选，无 GPU 可留空" options={gpuOptions} />
      </Form.Item>
      <Form.Item label="显卡数量" name={[...prefix, 'gpuCount']}>
        <InputNumber style={{ width: '100%' }} min={1} max={8} />
      </Form.Item>
      {!hideInstanceCount && (
        <Form.Item label="部署实例数" name={[...prefix, 'instanceCount']} rules={[{ required: true, message: '请输入部署实例数' }]}>
          <InputNumber style={{ width: '100%' }} min={1} max={20} />
        </Form.Item>
      )}
    </Card>
  </div>
)

function createActionButton(label: string, options?: { danger?: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <Button
      type="link"
      size="small"
      danger={options?.danger}
      disabled={options?.disabled}
      onClick={options?.onClick}
      style={{ paddingInline: 0, height: 'auto', fontWeight: 500 }}
    >
      {label}
    </Button>
  )
}

const MLModelDeployment: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const [form] = Form.useForm<CreateFormValues>()
  const machineDeploymentState = useMachineDeploymentStore()
  const rows = machineDeploymentState.deployments
  const [detailRecord, setDetailRecord] = useState<MLDeploymentRecord | null>(null)
  const [searchValue, setSearchValue] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskLifecycleStatus | undefined>()
  const [deploymentTypeFilter, setDeploymentTypeFilter] = useState<DeploymentType | undefined>()
  const [createType, setCreateType] = useState<DeploymentType>('standard')
  const isCreateRoute = location.pathname === '/machine-model-deployment/create'
  const editRouteMatch = location.pathname.match(/^\/machine-model-deployment\/([^/]+)\/edit$/)
  const editId = editRouteMatch?.[1]
  const isEditRoute = Boolean(editId)
  const editingRecord = useMemo(
    () => (editId ? rows.find(item => item.id === editId) ?? null : null),
    [editId, rows],
  )
  const customImageSource = Form.useWatch(['custom', 'imageSource'], form) ?? 'system'
  const standardImageSource = Form.useWatch(['standard', 'imageSource'], form) ?? 'system'
  const standardPythonSource = Form.useWatch(['standard', 'pythonSource'], form) ?? 'local'
  const selectedModel = Form.useWatch(['standard', 'model'], form)
  const availableVersions = useMemo(
    () => modelOptions.find(option => option.value === selectedModel)?.versions ?? [],
    [selectedModel],
  )

  useEffect(() => {
    if (isCreateRoute || isEditRoute) {
      form.resetFields()
      if (isEditRoute) {
        if (!editingRecord) {
          message.warning('未找到目标部署记录，已返回列表页。')
          navigate('/machine-model-deployment', { replace: true })
          return
        }

        setCreateType(editingRecord.deploymentType)
        form.setFieldsValue(buildFormValuesFromRecord(editingRecord))
        return
      }

      setCreateType('standard')
      form.setFieldsValue(getCreateInitialValues())
    }
  }, [editingRecord, form, isCreateRoute, isEditRoute, navigate])

  useEffect(() => {
    if (!detailRecord) {
      return
    }

    const nextRecord = rows.find(item => item.id === detailRecord.id) ?? null
    setDetailRecord(nextRecord)
  }, [detailRecord, rows])

  const filteredRows = useMemo(
    () =>
      rows.filter(item => {
        const modelName = item.standardConfig?.model ?? ''
        const matchesKeyword =
          !searchValue ||
          item.name.toLowerCase().includes(searchValue.toLowerCase()) ||
          modelName.toLowerCase().includes(searchValue.toLowerCase())
        const matchesStatus = !statusFilter || item.status === statusFilter
        const matchesType = !deploymentTypeFilter || item.deploymentType === deploymentTypeFilter
        return matchesKeyword && matchesStatus && matchesType
      }),
    [deploymentTypeFilter, rows, searchValue, statusFilter],
  )

  const updateStatus = (record: MLDeploymentRecord) => {
    const primaryAction = getPrimaryTaskLifecycleAction(record.status)
    if (!primaryAction) {
      return
    }

    machineDeploymentActions.setDeploymentStatus(record.id, primaryAction === 'start' ? '启动中' : '已创建')
    message.success(primaryAction === 'start' ? '部署已进入启动中' : '部署已重新提交')
  }

  const openCreate = () => navigate('/machine-model-deployment/create')
  const closeCreate = () => navigate('/machine-model-deployment')
  const openEdit = (record: MLDeploymentRecord) => navigate(`/machine-model-deployment/${record.id}/edit`)

  const submitForm = async () => {
    try {
      const values = await form.validateFields()

      if (createType === 'custom') {
        try {
          JSON.parse(values.custom.serviceConfigJson || '{}')
        } catch {
          message.error('服务配置 JSON 格式不正确')
          return
        }
      }

      const payload = buildDeploymentPayload(values, createType)

      if (isEditRoute && editingRecord) {
        machineDeploymentActions.updateDeployment(editingRecord.id, payload)
        message.success('部署配置已更新')
      } else {
        machineDeploymentActions.createDeployment({
          ...payload,
          creator: 'deepexilab',
        })
        message.success(createType === 'standard' ? '标准部署已创建' : '自定义部署已创建')
      }
      closeCreate()
    } catch {
      return
    }
  }

  const columns: ColumnsType<MLDeploymentRecord> = [
    { title: '服务名称', dataIndex: 'name', key: 'name', width: 220 },
    {
      title: '模型名称',
      key: 'modelName',
      width: 220,
      render: (_, record) =>
        record.standardConfig?.model ??
        (record.customConfig?.imageSource === 'system'
          ? record.customConfig.systemImage
          : record.customConfig?.customImage) ??
        '-',
    },
    {
      title: '网络架构',
      key: 'network',
      width: 140,
      render: (_, record) => record.standardConfig?.network ?? '-',
    },
    {
      title: '模型来源',
      key: 'modelSource',
      width: 120,
      render: (_, record) => record.standardConfig?.modelSource ?? '模型管理',
    },
    { title: '实例数', dataIndex: 'instanceCount', key: 'instanceCount', width: 90 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: value => getStatusTag(value),
    },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 100 },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 170 },
    {
      title: '操作',
      key: 'action',
      width: 280,
      render: (_, record) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', alignItems: 'center' }}>
          {getPrimaryTaskLifecycleAction(record.status) &&
            createActionButton(getPrimaryTaskLifecycleAction(record.status) === 'start' ? '启动' : '重新提交', {
              onClick: () => updateStatus(record),
            })}
          {createActionButton('编辑', {
            disabled: !canRunTaskLifecycleAction(record.status, 'edit'),
            onClick: () => openEdit(record),
          })}
          {createActionButton('访问信息', { onClick: () => setDetailRecord(record) })}
          {createActionButton('删除', {
            danger: true,
            disabled: !canRunTaskLifecycleAction(record.status, 'delete'),
            onClick: () => machineDeploymentActions.deleteDeployment(record.id),
          })}
          {createActionButton('终止', {
            disabled: !canRunTaskLifecycleAction(record.status, 'terminate'),
            onClick: () => {
              if (record.status === '启动中') {
                return message.warning(STARTING_TERMINATE_BLOCKED_MESSAGE)
              }
              machineDeploymentActions.setDeploymentStatus(record.id, '已终止')
            },
          })}
        </div>
      ),
    },
  ]

  const createDescription =
    createType === 'standard'
      ? '配置机器学习标准部署任务，基于模型管理中的已发布模型快速生成在线服务。'
      : '配置机器学习自定义部署任务，基于镜像与启动脚本直接生成机器学习在线服务。'

  if (isCreateRoute || isEditRoute) {
    return (
      <div style={{ padding: '28px 32px 40px', minHeight: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={closeCreate}>
            返回
          </Button>
        </div>

        <div>
          <div>
            <Card style={{ ...sectionCardStyle, marginBottom: 20 }}>
              <Title level={2} style={{ marginBottom: 8 }}>{isEditRoute ? '编辑部署' : '创建部署'}</Title>
              <Text type="secondary">{createDescription}</Text>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 20 }}>
                <Card
                  hoverable
                  onClick={() => setCreateType('standard')}
                  style={{
                    ...sectionCardStyle,
                    cursor: 'pointer',
                    borderColor: createType === 'standard' ? '#1677ff' : '#dfe4ea',
                    background: createType === 'standard' ? 'linear-gradient(180deg, rgba(22, 119, 255, 0.05), #ffffff)' : '#ffffff',
                  }}
                >
                  <Space align="start" size={14}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        display: 'grid',
                        placeItems: 'center',
                        background: createType === 'standard' ? '#1677ff' : '#f3f4f6',
                        color: createType === 'standard' ? '#ffffff' : '#475569',
                        flexShrink: 0,
                      }}
                    >
                      <CloudServerOutlined />
                    </div>
                    <div>
                      <Space align="center" size={10} style={{ marginBottom: 8 }}>
                        <Text strong style={{ fontSize: 18 }}>标准部署</Text>
                        {createType === 'standard' && <Tag color="blue">当前选择</Tag>}
                      </Space>
                      <Text type="secondary">适合基于模型管理中的机器学习模型快速部署服务。</Text>
                    </div>
                  </Space>
                </Card>

                <Card
                  hoverable
                  onClick={() => setCreateType('custom')}
                  style={{
                    ...sectionCardStyle,
                    cursor: 'pointer',
                    borderColor: createType === 'custom' ? '#1677ff' : '#dfe4ea',
                    background: createType === 'custom' ? 'linear-gradient(180deg, rgba(22, 119, 255, 0.05), #ffffff)' : '#ffffff',
                  }}
                >
                  <Space align="start" size={14}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        display: 'grid',
                        placeItems: 'center',
                        background: createType === 'custom' ? '#1677ff' : '#f3f4f6',
                        color: createType === 'custom' ? '#ffffff' : '#475569',
                        flexShrink: 0,
                      }}
                    >
                      <CodeOutlined />
                    </div>
                    <div>
                      <Space align="center" size={10} style={{ marginBottom: 8 }}>
                        <Text strong style={{ fontSize: 18 }}>自定义部署</Text>
                        {createType === 'custom' && <Tag color="blue">当前选择</Tag>}
                      </Space>
                      <Text type="secondary">适合基于镜像和部署配置直接生成机器学习在线服务。</Text>
                    </div>
                  </Space>
                </Card>
              </div>
            </Card>

            <Form form={form} layout="vertical">
              <Card id="basic-info" style={{ ...sectionCardStyle, marginBottom: 20 }}>
                <div style={sectionTitleStyle}>基本信息</div>
                <Form.Item
                  label="服务名称"
                  name="name"
                  rules={[
                    { required: true, message: '请输入服务名称' },
                    { max: 36, message: '服务名称不能超过 36 个字符' },
                  ]}
                >
                  <Input placeholder="请输入服务名称" />
                </Form.Item>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 18px' }}>
                  <Form.Item label="模型来源" name={['standard', 'modelSource']} initialValue="模型管理">
                    <Input readOnly />
                  </Form.Item>
                  <div />
                </div>
                <div
                  style={{
                    marginTop: 6,
                    padding: '16px 18px',
                    borderRadius: 14,
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 12 }}>模型与版本</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 16 }}>
                    <Form.Item
                      label="选择模型"
                      name={['standard', 'model']}
                      rules={[{ required: true, message: '请选择模型' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        placeholder="请选择待部署模型"
                        options={modelOptions.map(item => ({ value: item.value, label: item.label }))}
                        onChange={(value: string) => {
                          const model = modelOptions.find(item => item.value === value)
                          form.setFieldValue(['standard', 'network'], model?.network)
                          form.setFieldValue(['standard', 'modelVersion'], undefined)
                        }}
                      />
                    </Form.Item>
                    <Form.Item
                      label="选择版本"
                      name={['standard', 'modelVersion']}
                      rules={[{ required: true, message: '请选择模型版本' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        placeholder="请选择模型版本"
                        options={availableVersions.map(value => ({ value, label: value }))}
                      />
                    </Form.Item>
                  </div>
                </div>
              </Card>

              {createType === 'standard' ? (
                <>
                  <Card id="environment-info" style={{ ...sectionCardStyle, marginBottom: 20 }}>
                    <div style={sectionTitleStyle}>环境信息</div>
                    <Form.Item
                      label="镜像配置"
                      name={['standard', 'imageSource']}
                      rules={[{ required: true, message: '请选择镜像配置' }]}
                    >
                      <Radio.Group optionType="button" buttonStyle="solid">
                        <Radio.Button value="system">系统镜像</Radio.Button>
                        <Radio.Button value="custom">自定义镜像</Radio.Button>
                      </Radio.Group>
                    </Form.Item>

                    {standardImageSource === 'system' ? (
                      <Form.Item
                        label="系统镜像"
                        name={['standard', 'imageSelection']}
                        rules={[{ required: true, message: '请选择系统镜像' }]}
                      >
                        <Cascader
                          placeholder="请选择镜像类型 / 镜像"
                          options={standardImageOptions}
                          expandTrigger="hover"
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                    ) : (
                      <Form.Item
                        label="自定义镜像"
                        name={['standard', 'customImage']}
                        rules={[{ required: true, message: '请选择自定义镜像' }]}
                      >
                        <Select placeholder="请选择自定义镜像" options={customImageOptions} />
                      </Form.Item>
                    )}

                    <Form.Item
                      label="部署实例数"
                      name={['standard', 'resources', 'instanceCount']}
                      rules={[{ required: true, message: '请输入部署实例数' }]}
                    >
                      <InputNumber style={{ width: '100%' }} min={1} max={20} />
                    </Form.Item>

                    <Form.Item label="运行命令" required>
                      <div
                        style={{
                          borderRadius: 12,
                          overflow: 'hidden',
                          border: '1px solid #1f2937',
                          background: '#111827',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            borderBottom: '1px solid #374151',
                            color: '#cbd5e1',
                            fontSize: 12,
                          }}
                        >
                          <span>bash</span>
                          <span>{standardRunCommand.length} 个字符</span>
                        </div>
                        <pre
                          style={{
                            margin: 0,
                            padding: '12px 14px',
                            color: '#d1fae5',
                            fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace',
                            fontSize: 13,
                            lineHeight: 1.6,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          <span style={{ color: '#65a30d', marginRight: 10 }}>1</span>
                          {standardRunCommand}
                        </pre>
                      </div>
                    </Form.Item>
                    <Form.Item name={['standard', 'runCommand']} hidden>
                      <Input />
                    </Form.Item>

                    <Form.Item
                      name={['standard', 'pythonSource']}
                      rules={[{ required: true, message: '请选择 Python 文件来源' }]}
                    >
                      <Radio.Group>
                        <Space size={28}>
                          <Radio value="local">本地上传</Radio>
                          <Radio value="notebook">Notebook获取</Radio>
                        </Space>
                      </Radio.Group>
                    </Form.Item>

                    {standardPythonSource === 'local' ? (
                      <Form.Item
                        label="Python文件"
                        name={['standard', 'pythonFile']}
                        valuePropName="fileList"
                        getValueFromEvent={event => event?.fileList ?? []}
                        rules={[{ required: true, message: '请上传 Python 文件' }]}
                      >
                        <Upload.Dragger
                          accept=".py"
                          maxCount={1}
                          beforeUpload={() => false}
                        >
                          <p className="ant-upload-drag-icon">
                            <InboxOutlined />
                          </p>
                          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
                          <p className="ant-upload-hint">支持 model.py 文件拖到此处，或点击上传</p>
                        </Upload.Dragger>
                      </Form.Item>
                    ) : (
                      <Form.Item
                        label="Python文件"
                        name={['standard', 'notebookSource']}
                        rules={[{ required: true, message: '请选择 Notebook 文件' }]}
                      >
                        <Select placeholder="请选择 Notebook 中的 Python 文件" options={notebookPythonOptions} />
                      </Form.Item>
                    )}

                    <Button icon={<DownloadOutlined />} onClick={() => message.success('Python 模板示例已准备下载')}>
                      Python模板示例
                    </Button>
                  </Card>

                  <Card id="resource-info" style={{ ...sectionCardStyle, marginBottom: 20 }}>
                    <div style={sectionTitleStyle}>资源信息</div>
                    <ResourceFields prefix={['standard', 'resources']} hideInstanceCount />
                  </Card>
                </>
              ) : (
                <>
                  <Card id="environment-info" style={{ ...sectionCardStyle, marginBottom: 20 }}>
                    <div style={sectionTitleStyle}>环境信息</div>
                    <Form.Item
                      label="镜像配置"
                      name={['custom', 'imageSource']}
                      rules={[{ required: true, message: '请选择镜像配置' }]}
                    >
                      <Radio.Group optionType="button" buttonStyle="solid">
                        <Radio.Button value="system">系统镜像</Radio.Button>
                        <Radio.Button value="custom">自定义镜像</Radio.Button>
                      </Radio.Group>
                    </Form.Item>

                    {customImageSource === 'system' ? (
                      <Form.Item
                        label="系统镜像"
                        name={['custom', 'systemImage']}
                        rules={[{ required: true, message: '请选择系统镜像' }]}
                      >
                        <Select placeholder="请选择系统镜像" options={systemImageOptions} />
                      </Form.Item>
                    ) : (
                      <Form.Item
                        label="自定义镜像"
                        name={['custom', 'customImage']}
                        rules={[{ required: true, message: '请输入自定义镜像地址' }]}
                      >
                        <Select placeholder="请选择自定义镜像" options={customImageOptions} />
                      </Form.Item>
                    )}

                    <Form.Item
                      label="运行命令"
                      name={['custom', 'command']}
                      rules={[{ required: true, message: '请输入运行命令' }]}
                    >
                      <Input.TextArea
                        id="custom_command"
                        rows={5}
                        placeholder="例如 python app.py"
                        spellCheck={false}
                        style={{
                          fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace',
                          fontSize: 13,
                          borderRadius: 12,
                          background: '#0f172a',
                          color: '#e2e8f0',
                        }}
                      />
                    </Form.Item>
                    <Form.Item
                      label="端口号"
                      name={['custom', 'port']}
                      rules={[{ required: true, message: '请输入端口号' }]}
                    >
                      <InputNumber style={{ width: '100%' }} min={1} max={65535} />
                    </Form.Item>
                    <Form.Item
                      label="部署实例数"
                      name={['custom', 'resources', 'instanceCount']}
                      rules={[{ required: true, message: '请输入部署实例数' }]}
                    >
                      <InputNumber style={{ width: '100%' }} min={1} max={20} />
                    </Form.Item>
                  </Card>

                  <Card id="resource-info" style={{ ...sectionCardStyle, marginBottom: 20 }}>
                    <div style={sectionTitleStyle}>资源信息</div>
                    <ResourceFields prefix={['custom', 'resources']} hideInstanceCount />
                  </Card>

                </>
              )}

              <div
                style={{
                  position: 'sticky',
                  bottom: 0,
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.78), #ffffff 30%)',
                  paddingTop: 12,
                }}
              >
                <div style={{ display: 'flex', gap: 12, paddingBottom: 6 }}>
                  <Button onClick={closeCreate}>取消</Button>
                  <Button type="primary" onClick={submitForm}>
                    {isEditRoute
                      ? '保存部署配置'
                      : createType === 'standard'
                        ? '提交标准部署'
                        : '提交自定义部署'}
                  </Button>
                </div>
              </div>
            </Form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <Card style={sectionCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginBottom: 18 }}>
            <div>
              <Title level={2} style={{ marginBottom: 8 }}>机器模型部署</Title>
              <Text type="secondary">
                管理机器学习模型部署任务，支持标准部署和自定义部署两种方式。
              </Text>
            </div>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              创建部署
            </Button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <Space wrap>
              <Input
                placeholder="搜索服务名称或模型名称"
                value={searchValue}
                onChange={event => setSearchValue(event.target.value)}
                style={{ width: 260 }}
              />
              <Select
                placeholder="部署方式"
                allowClear
                style={{ width: 160 }}
                value={deploymentTypeFilter}
                onChange={value => setDeploymentTypeFilter(value)}
                options={[
                  { value: 'standard', label: '标准部署' },
                  { value: 'custom', label: '自定义部署' },
                ]}
              />
              <Select
                placeholder="状态"
                allowClear
                style={{ width: 140 }}
                value={statusFilter}
                onChange={value => setStatusFilter(value)}
                options={[
                  { value: '已创建', label: '已创建' },
                  { value: '启动中', label: '启动中' },
                  { value: '运行中', label: '运行中' },
                  { value: '已终止', label: '已终止' },
                  { value: '失败', label: '失败' },
                ]}
              />
              <Button onClick={() => { setSearchValue(''); setDeploymentTypeFilter(undefined); setStatusFilter(undefined) }}>
                重置
              </Button>
            </Space>
          </div>

          <Table
            rowKey="id"
            columns={columns}
            dataSource={filteredRows}
            pagination={{ pageSize: 10, showTotal: total => `共 ${total} 条记录` }}
          />
        </Card>
      </div>

      <DescriptionsModal record={detailRecord} onClose={() => setDetailRecord(null)} />
    </>
  )
}

const DescriptionsModal: React.FC<{
  record: MLDeploymentRecord | null
  onClose: () => void
}> = ({ record, onClose }) => {
  return (
    <CardModalLike open={Boolean(record)} title="部署详情" onClose={onClose}>
      {record && (
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="服务名称" span={2}>{record.name}</Descriptions.Item>
          <Descriptions.Item label="状态">{getStatusTag(record.status)}</Descriptions.Item>
          <Descriptions.Item label="部署方式">{record.deploymentType === 'standard' ? '标准部署' : '自定义部署'}</Descriptions.Item>
          <Descriptions.Item label="模型名称">{record.standardConfig?.model ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="模型版本">{record.standardConfig?.modelVersion ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="网络架构">{record.standardConfig?.network ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="模型来源">{record.standardConfig?.modelSource ?? '模型管理'}</Descriptions.Item>
          <Descriptions.Item label="资源规格" span={2}>{record.resourceSummary}</Descriptions.Item>
          <Descriptions.Item label="实例数">{record.instanceCount}</Descriptions.Item>
          <Descriptions.Item label="创建人">{record.creator}</Descriptions.Item>
          <Descriptions.Item label="创建时间" span={2}>{record.createdAt}</Descriptions.Item>
          {record.customConfig && (
            <Descriptions.Item label="部署配置" span={2}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace' }}>
                {record.customConfig.serviceConfigJson || defaultCustomSpec}
              </pre>
            </Descriptions.Item>
          )}
        </Descriptions>
      )}
    </CardModalLike>
  )
}

const CardModalLike: React.FC<{
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}> = ({ open, title, onClose, children }) => {
  if (!open) {
    return null
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.38)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
        padding: 24,
      }}
      onClick={onClose}
    >
      <Card
        title={title}
        extra={<Button type="link" onClick={onClose}>关闭</Button>}
        style={{ width: 820, maxWidth: '100%', ...sectionCardStyle }}
        onClick={event => event.stopPropagation()}
      >
        {children}
      </Card>
    </div>
  )
}

export default MLModelDeployment
