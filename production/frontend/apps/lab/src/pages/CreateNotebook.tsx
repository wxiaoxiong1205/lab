import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, Card, Col, Form, Input, InputNumber, Radio, Row, Select, Switch, Tag, Typography, message } from 'antd'
import { EditOutlined, PlusOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { notebookService } from '../services/notebookService'
import type { CreateNotebookRequest, MachineLearnListModel as NotebookMachineLearningDataset, PortItems, UpdateNotebookRequest } from '../types'
import './styles/finetune.scss'
import { NotebookSystemImageType, registryMirrorService } from '../services/RegistryMirrorService'
import ResourceConfig from '@/components/finetune/ResourceConfig'
import { DatasetCascaderSelector } from '@/components/inference'
import { useNotebookBasePath } from '@/hooks/getProjectPath'
import ModelsCascader from '@/components/models/modelsCascader'
import { ImageDrawer } from '@/components/notebook/ImageDrawer'
import MachineLearningDatasetMultiSelect from '@/components/notebook/MachineLearningDatasetMultiSelect'
import MachineLearningModelMultiSelect from '@/components/notebook/MachineLearningModelMultiSelect'
// import OnlineReasoningServiceSelect from '@/components/notebook/OnlineReasoningServiceSelect'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'

const { Title, Paragraph, Text } = Typography
const { TextArea } = Input
const MAX_MACHINE_LEARNING_LINKED_COUNT = 3
const MAX_COUNT = 5
const SSH_PASSWORD_MASK = '******'
const PORT_PROTOCOL_OPTIONS = [
  { label: 'TCP', value: 'TCP' },
  { label: 'UDP', value: 'UDP' },
] as const
const normalizeIsPublic = (value: unknown) => value === true || value === 1 || value === '1' || value === 'true' || value === '公开'
const normalizeNotebookModels = (models?: ext['models']): NonNullable<ext['models']> => ({
  base_models: models?.base_models ?? [],
  finetuned_models: models?.finetuned_models ?? [],
  ...(models?.machine_learning_models ? { machine_learning_models: models.machine_learning_models } : {}),
})
const getSshPasswordError = (password: string) => {
  if (password.length < 8) {
    return '密码长度不能少于 8 位'
  }
  const typeCount = [
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /\d/.test(password),
  ].filter(Boolean).length
  if (typeCount < 2) {
    return '密码必须包含大写字母、小写字母、数字中的至少两类'
  }
  return ''
}
const normalizeSshFieldValue = (value: unknown) => String(value ?? '').trim()
interface ext {
  model?: string
  memory?: string
  category?: string
  models?: {
    base_models: number[]
    finetuned_models: number[]
    machine_learning_models?: number[]
  }
  dataset?: {
    training: number[]
    validation: number[]
    test: number[]
    machine_learning_dataset?: NotebookMachineLearningDataset[]
  }
}
const CreateNotebook: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { projectId, notebookId } = useParams<{
    projectId: string
    notebookId?: string
  }>()
  const { notebookBasePath } = useNotebookBasePath()
  const isEditMode = Boolean(notebookId)
  const isMachineLearningNotebook = useMemo(() => Boolean(notebookBasePath?.includes('/machine-notebook')), [notebookBasePath])
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedGpuOption, setSelectedGpuOption] = useState<any>(null)
  const prevGpuEnabledRef = useRef<boolean | undefined>(undefined)
  const [useCategoryOnly, setUseCategoryOnly] = useState(false)
  const [showGpuNotAdaptedWarning, setShowGpuNotAdaptedWarning] = useState(false)
  const [imageHelp, setImageHelp] = useState<string>('')
  const [imageDrawerOpen, setImageDrawerOpen] = useState(false)
  const [modelEchoNames, setModelEchoNames] = useState<{
    base_models?: string[]
    finetuned_models?: string[]
  }>({})
  const [machineLearningDatasetEchoNames, setMachineLearningDatasetEchoNames] = useState<string[]>([])
  const [machineLearningModelEchoNames, setMachineLearningModelEchoNames] = useState<string[]>([])
  const source_example_id = searchParams.get('source_example_id') ?? undefined
  const initialSshConfiguredRef = useRef(false)
  const notebookDatasetExtRef = useRef<{
    training: number[]
    validation: number[]
    test: number[]
  }>({
    training: [],
    validation: [],
    test: [],
  })
  const modelDatasetTypeOptions = useMemo(() => isMachineLearningNotebook
    ? [{ label: '机器学习', value: '机器学习' }]
    : [{ label: '大模型', value: '大模型' }], [isMachineLearningNotebook])
  const gpuEnabled = Form.useWatch('gpu_enabled', form)
  const gpuType = Form.useWatch('gpu_type', form)
  const image = Form.useWatch('image', form)

  const sshEnabled = Form.useWatch('is_ssh', form)

  const getEffectiveSshPassword = useCallback((rawValue: unknown) => {
    const normalizedValue = normalizeSshFieldValue(rawValue)
    return isEditMode
      && initialSshConfiguredRef.current
      && normalizedValue === SSH_PASSWORD_MASK
      ? ''
      : normalizedValue
  }, [isEditMode])
  const validateSshUsername = useCallback(async (_: unknown, value: unknown) => {
    const isSshEnabled = Boolean(form.getFieldValue('is_ssh'))
    if (!isSshEnabled) {
      return
    }
    const sshUsername = normalizeSshFieldValue(value)
    if (!sshUsername) {
      throw new Error('请填写SSH配置用户名')
    }
  }, [form])
  const validateSshPassword = useCallback(async (_: unknown, value: unknown) => {
    const isSshEnabled = Boolean(form.getFieldValue('is_ssh'))
    if (!isSshEnabled) {
      return
    }
    const sshUsername = normalizeSshFieldValue(form.getFieldValue('ssh_username'))
    const sshPassword = getEffectiveSshPassword(value)
    const canSkipSshPassword = isEditMode && initialSshConfiguredRef.current
    if (!sshUsername) {
      return
    }
    if (sshUsername && !sshPassword && !canSkipSshPassword) {
      throw new Error('请填写SSH配置用户密码')
    }
    const sshPasswordError = sshPassword ? getSshPasswordError(sshPassword) : ''
    if (sshPasswordError) {
      throw new Error(sshPasswordError)
    }
  }, [form, getEffectiveSshPassword, isEditMode])

  // 系统镜像
  const { data: templates = [], isLoading: selectTemplateLoading, error: templatesError, refetch: refetchTemplates } = useQuery({
    queryKey: ['notebookImages', projectId, gpuEnabled, gpuType, useCategoryOnly, isMachineLearningNotebook],
    queryFn: async () => {
      let queryParams: {
        card_category?: string
        card_model?: string
      } | undefined
      if (gpuEnabled && gpuType && Array.isArray(gpuType) && gpuType.length === 2) {
        queryParams = {
          card_category: gpuType[0] as string,
        }
        if (!useCategoryOnly && selectedGpuOption?.model) {
          queryParams.card_model = selectedGpuOption.model
        }
      }
      const image_type = isMachineLearningNotebook
        ? NotebookSystemImageType.machineLearningNotebook
        : NotebookSystemImageType.baseModelNotebook
      return await registryMirrorService.searchRegistryImages(Number(projectId), image_type, queryParams)
    },
    enabled: !!projectId,
  })
  useEffect(() => {
    if (prevGpuEnabledRef.current === true && gpuEnabled === false) {
      form.setFieldsValue({
        gpu_type: undefined,
        gpu_count: 1,
        gpu_model: undefined,
        gpu_memory: undefined,
        k8s_resource_type: undefined,
      })
      setSelectedGpuOption(null)
      setUseCategoryOnly(false)
      setShowGpuNotAdaptedWarning(false)
      setImageHelp('')
    }
    prevGpuEnabledRef.current = gpuEnabled
    if (form.getFieldValue('image')) {
      form.setFieldsValue({ image: undefined })
    }
  }, [gpuEnabled, gpuType])
  useEffect(() => {
    if (gpuEnabled && gpuType && Array.isArray(gpuType) && gpuType.length === 2 && selectedGpuOption?.model) {
      setUseCategoryOnly(false)
      setShowGpuNotAdaptedWarning(false)
      setImageHelp('')
    }
    else if (!gpuEnabled || !gpuType) {
      setUseCategoryOnly(false)
      setShowGpuNotAdaptedWarning(false)
      setImageHelp('')
    }
  }, [gpuEnabled, gpuType, selectedGpuOption])
  useEffect(() => {
    if (gpuEnabled && gpuType && Array.isArray(gpuType) && gpuType.length === 2 && selectedGpuOption?.model && !useCategoryOnly && Array.isArray && templates.length === 0 && !selectTemplateLoading) {
      setShowGpuNotAdaptedWarning(true)
      setUseCategoryOnly(true)
      setImageHelp('当前选择的显卡型号暂无适配')
    }
  }, [templates, gpuEnabled, gpuType, selectedGpuOption, useCategoryOnly, selectTemplateLoading])
  const handleGpuSelectionChange = useCallback((option: any | null) => {
    setSelectedGpuOption(option)
  }, [])
  useEffect(() => {
    form.setFieldsValue({
      instance_name: '',
      is_public: false,
      describe: '',
      dataModelSelectType: isMachineLearningNotebook ? '机器学习' : '大模型',
      resource_cpu_request: 0.5,
      resource_cpu_limit: 16,
      resource_memory_request: 0.5,
      resource_memory_limit: 16,
      gpu_enabled: false,
      gpu_count: 1,
      max_run_enabled: false,
      max_run_hours: 0,
      max_run_minutes: 0,
      machine_learning_dataset: [],
      machine_learning_model_ids: [],
      // online_reasoning_service: undefined,
      ports: [],
      is_ssh: false,
      ssh_username: '',
      ssh_password: '',
    })
  }, [form, isMachineLearningNotebook])
  useEffect(() => {
    if (!isEditMode || !notebookId || !projectId)
      return

    const fetchNotebookDetail = async () => {
      setDetailLoading(true)
      try {
        const detail = await notebookService.getNotebookInstance(notebookId, Number(projectId))
        const detailExt = detail.ext as ext | undefined
        const maxRuntimeMinutes = detail.max_runtime_minutes ?? 0
        const maxRunHours = Math.floor(maxRuntimeMinutes / 60)
        const maxRunMinutes = maxRuntimeMinutes % 60
        const gpuEnabled = Boolean(detail.gpu_type && detail.gpu_count)
        const gpuCategory = detailExt?.category
        const gpuModel = detailExt?.model
        const hasSshConfig = Boolean(detail.is_ssh || detail.ssh_username)
        const sshUsername = detail.ssh_username ?? ''
        initialSshConfiguredRef.current = hasSshConfig

        if (gpuEnabled) {
          setSelectedGpuOption({
            model: gpuModel,
            memory: detailExt?.memory,
            type: detail.gpu_type ?? undefined,
            value: gpuModel,
          })
        }
        else {
          setSelectedGpuOption(null)
        }

        if (detailExt?.dataset && !isMachineLearningNotebook) {
          notebookDatasetExtRef.current = {
            training: detailExt.dataset.training ?? [],
            validation: detailExt.dataset.validation ?? [],
            test: detailExt.dataset.test ?? [],
          }
        }
        if (!isMachineLearningNotebook) {
          setModelEchoNames({
            base_models: detail.model_names?.base_models ?? [],
            finetuned_models: detail.model_names?.finetuned_models ?? [],
          })
        }
        else {
          setMachineLearningDatasetEchoNames(detail.dataset_names?.machine_learning_dataset ?? [])
          setMachineLearningModelEchoNames(detail.model_names?.machine_learning_models ?? [])
        }

        const datasetValue = !isMachineLearningNotebook
          ? (['training', 'validation', 'test'] as const).flatMap((usage) => {
              const names = detail.dataset_names?.[usage] ?? []
              const ids = detailExt?.dataset?.[usage] ?? []
              return ids.map((_, index) => {
                const nameWithVersion = names[index] ?? ''
                const splitIndex = nameWithVersion.lastIndexOf('_')
                const datasetName = splitIndex > 0 ? nameWithVersion.slice(0, splitIndex) : nameWithVersion
                const versionName = splitIndex > 0 ? nameWithVersion.slice(splitIndex + 1) : ''
                return [usage, datasetName, versionName]
              }).filter((item) => item[1] && item[2])
            })
          : undefined

        form.setFieldsValue({
          instance_name: detail.instance_name,
          is_public: normalizeIsPublic(detail.is_public),
          describe: detail.describe,
          dataModelSelectType: isMachineLearningNotebook ? '机器学习' : '大模型',
          // online_reasoning_service: detail.model_service_id,
          resource_cpu_request: Number(detail.resource_cpu_request),
          resource_cpu_limit: Number(detail.resource_cpu_limit),
          resource_memory_request: Number(detail.resource_memory_request),
          resource_memory_limit: Number(detail.resource_memory_limit),
          gpu_enabled: gpuEnabled,
          gpu_type: gpuEnabled && gpuCategory && gpuModel ? [gpuCategory, gpuModel] : undefined,
          gpu_count: detail.gpu_count || 1,
          gpu_model: gpuModel,
          gpu_memory: detailExt?.memory,
          k8s_resource_type: detail.gpu_type ?? undefined,
          max_run_enabled: maxRuntimeMinutes > 0,
          max_run_hours: maxRunHours,
          max_run_minutes: maxRunMinutes,
          dataset: datasetValue,
          machine_learning_dataset: detailExt?.dataset?.machine_learning_dataset ?? [],
          machine_learning_model_ids: detailExt?.models?.machine_learning_models ?? [],
          models: detailExt?.models,
          ports: (detail.ports ?? []).map((port) => ({
            id: port.id,
            protocol: port.protocol === 'UDP' ? 'UDP' : 'TCP',
            container_port: port.container_port,
            description: port.description ?? '',
          })),
          is_ssh: hasSshConfig,
          ssh_username: sshUsername,
          ssh_password: hasSshConfig ? SSH_PASSWORD_MASK : '',
        })

        window.setTimeout(() => {
          form.setFieldValue('image', detail.image)
        }, 0)
      }
      catch (error) {
        console.error('Failed to fetch notebook detail:', error)
        message.error('加载Notebook详情失败，请刷新重试')
      }
      finally {
        setDetailLoading(false)
      }
    }

    fetchNotebookDetail()
  }, [form, isEditMode, isMachineLearningNotebook, notebookId, projectId])
  const handleSubmit = async () => {
    try {
      await form.validateFields()
      setLoading(true)
      const values = form.getFieldsValue()
      if (!values.instance_name) {
        message.error('实例名称不能为空')
        return
      }
      if (!values.image) {
        message.error('请选择镜像')
        return
      }
      if (values.gpu_enabled && (!values.gpu_count || values.gpu_count < 1)) {
        message.error('启用GPU时必须指定GPU数量')
        return
      }
      const sshUsername = normalizeSshFieldValue(values.ssh_username)
      const rawSshPassword = normalizeSshFieldValue(values.ssh_password)
      const isSshEnabled = Boolean(values.is_ssh)
      const isMaskedSshPassword = isEditMode
        && initialSshConfiguredRef.current
        && rawSshPassword === SSH_PASSWORD_MASK
      const sshPassword = isMaskedSshPassword ? '' : rawSshPassword
      let gpuType: string | undefined
      if (values.gpu_enabled && selectedGpuOption) {
        gpuType = selectedGpuOption.type || selectedGpuOption.value
      }
      const ext: ext = {}
      if (isMachineLearningNotebook) {
        ext.dataset = {
          training: [],
          validation: [],
          test: [],
          machine_learning_dataset: values.machine_learning_dataset ?? [],
        }
        ext.models = {
          base_models: [],
          finetuned_models: [],
          machine_learning_models: values.machine_learning_model_ids ?? [],
        }
      }
      else {
        ext.models = normalizeNotebookModels(values.models)
        ext.dataset = notebookDatasetExtRef.current
      }
      if (values.gpu_enabled && selectedGpuOption) {
        ext.model = selectedGpuOption.model
        ext.memory = selectedGpuOption.memory
        ext.category = values.gpu_type[0]
      }
      const maxRuntimeMinutes = values.max_run_enabled
        ? Number(values.max_run_hours ?? 0) * 60 + Number(values.max_run_minutes ?? 0)
        : (isEditMode ? null : undefined)
      const submitData: CreateNotebookRequest = {
        instance_name: values.instance_name,
        is_public: values.is_public === true,
        describe: values.describe,
        image: values.image,
        resource_cpu_request: values.resource_cpu_request,
        resource_cpu_limit: values.resource_cpu_limit,
        resource_memory_request: values.resource_memory_request,
        resource_memory_limit: values.resource_memory_limit,
        gpu_count: values.gpu_enabled ? values.gpu_count : undefined,
        gpu_type: gpuType || null,
        max_run_hours: values.max_run_enabled ? (values.max_run_hours ?? undefined) : (isEditMode ? 0 : undefined),
        max_run_minutes: values.max_run_enabled ? (values.max_run_minutes ?? undefined) : (isEditMode ? 0 : undefined),
        max_runtime_minutes: maxRuntimeMinutes,
        ext,
        // model_service_id: isEditMode ? (values.online_reasoning_service ?? null) : (values.online_reasoning_service ?? undefined),
      }
      if (isSshEnabled) {
        submitData.is_ssh = true
        submitData.ssh_username = sshUsername
        if (sshPassword) {
          submitData.ssh_password = sshPassword
        }
      }
      else {
        submitData.is_ssh = false
        submitData.ssh_username = ''
        submitData.ssh_password = ''
      }
      if (source_example_id && !isEditMode) {
        submitData.source_example_id = Number(source_example_id)
      }
      if (isMachineLearningNotebook) {
        submitData.biz_type = 'machine_learning'
      }
      const portRows = (values.ports ?? []) as Partial<PortItems>[]
      if (portRows.length > MAX_COUNT) {
        message.error(`开发端口最多添加 ${MAX_COUNT} 个`)
        return
      }
      const portsPayload: PortItems[] = portRows
        .filter((p) => p != null && p.container_port != null && Number.isFinite(Number(p.container_port)))
        .map((p) => ({
          ...(isEditMode && p.id ? { id: p.id } : {}),
          protocol: p.protocol === 'UDP' ? 'UDP' : 'TCP',
          container_port: Number(p.container_port),
          description: p.description ? String(p.description).slice(0, 64) : null,
        }))
      if (isEditMode || portsPayload.length > 0) {
        submitData.ports = portsPayload
      }
      const result = isEditMode && notebookId
        ? await notebookService.updateNotebookInstance(notebookId, Number(projectId), submitData as UpdateNotebookRequest)
        : await notebookService.createNotebookInstance(submitData, Number(projectId))
      message.success(isEditMode ? '编辑成功' : '创建成功', 2)
      if (notebookBasePath) {
        navigate(`${notebookBasePath}/${result.id}`)
      }
    }
    catch (error: any) {
      console.error(`${isEditMode ? 'Edit' : 'Create'} Notebook Error:`, error)
      // 错误处理由apiClient的响应拦截器统一处理
    }
    finally {
      setLoading(false)
    }
  }
  const handleCancel = () => {
    if (notebookBasePath) {
      navigate(notebookBasePath)
    }
  }
  const handleNotebookDatasetChange = useCallback((value: any, selectedOptions?: any) => {
    const empty = { training: [] as number[], validation: [] as number[], test: [] as number[] }
    // 多选：value 为 string[][]，selectedOptions 为每项 [usageOpt, datasetOpt, versionOpt]
    if (Array.isArray(selectedOptions)
      && selectedOptions.length > 0
      && Array.isArray(selectedOptions[0])) {
      const next = { ...empty }
      for (const triple of selectedOptions as any[][]) {
        if (!Array.isArray(triple) || triple.length < 3)
          continue
        const usage = triple[0]?.value as string
        const vid = triple[2]?.versionData?.id
        if (usage && usage in next && vid != null) {
          next[usage as keyof typeof next].push(Number(vid))
        }
      }
      notebookDatasetExtRef.current = next
      return
    }
    if (!value || !Array.isArray(value) || value.length < 3 || !selectedOptions?.[2]) {
      notebookDatasetExtRef.current = empty
      return
    }
    const usage = value[0] as keyof typeof empty
    const vid = (selectedOptions[2] as {
      versionData?: {
        id?: number
      }
    })?.versionData?.id
    if (vid == null || !(usage in empty)) {
      notebookDatasetExtRef.current = empty
      return
    }
    notebookDatasetExtRef.current = { ...empty, [usage]: [Number(vid)] }
  }, [])
  const handleAddImage = () => {
    setImageDrawerOpen(true)
  }
  const dataModelSelectFields = isMachineLearningNotebook
    ? (
        <>
          <Form.Item
            name="machine_learning_dataset"
            rules={[
              {
                validator: (_, selected?: NotebookMachineLearningDataset[]) => (!selected || selected.length <= MAX_MACHINE_LEARNING_LINKED_COUNT
                  ? Promise.resolve()
                  : Promise.reject(new Error(`最多只能选择 ${MAX_MACHINE_LEARNING_LINKED_COUNT} 个数据集`))),
              },
            ]}
            label="数据集"
          >
            <MachineLearningDatasetMultiSelect echoNames={machineLearningDatasetEchoNames} />
          </Form.Item>
          <Form.Item
            name="machine_learning_model_ids"
            rules={[
              {
                validator: (_, selected?: number[]) => (!selected || selected.length <= MAX_MACHINE_LEARNING_LINKED_COUNT
                  ? Promise.resolve()
                  : Promise.reject(new Error(`最多只能选择 ${MAX_MACHINE_LEARNING_LINKED_COUNT} 个模型`))),
              },
            ]}
            label="模型"
            tooltip="来自项目下机器学习模型列表"
          >
            <MachineLearningModelMultiSelect placeholder="请选择模型" echoNames={machineLearningModelEchoNames} />
          </Form.Item>
        </>
      )
    : (
        <>
          <DatasetCascaderSelector form={form} fieldName="dataset" label="数据集" placeholder="请选择1-3个数据集（展开行勾选版本）" projectIdOverride={projectId ? Number(projectId) : undefined} onChange={handleNotebookDatasetChange} modalTitle="选择数据集" selectButtonText="选择" trainingDatasetMultiSelect trainingMultiSelectMax={3} requiredSelection={false} />
          <Form.Item
            name="models"
            label="模型"
            rules={[
              {
                validator: (_, v?: {
                  base_models?: number[]
                  finetuned_models?: number[]
                }) => {
                  const n = (v?.base_models?.length ?? 0) + (v?.finetuned_models?.length ?? 0)
                  return n <= MAX_MACHINE_LEARNING_LINKED_COUNT
                    ? Promise.resolve()
                    : Promise.reject(new Error(`最多只能选择 ${MAX_MACHINE_LEARNING_LINKED_COUNT} 个模型`))
                },
              },
            ]}
          >
            <ModelsCascader placeholder="请输入模型" multiple multipleMax={MAX_MACHINE_LEARNING_LINKED_COUNT} echoNames={modelEchoNames} />
          </Form.Item>
        </>
      )
  return (
    <div className="create-finetune-task-container create-form-page">
      <section className="create-form-card">
        <CreateFormPageHeader
          title={isEditMode ? '编辑 Notebook' : '创建 Notebook'}
          onBack={handleCancel}
          actions={(
            <>
              <Button className="create-form-cancel" onClick={handleCancel}>取消</Button>
              <Button className="create-form-submit" type="primary" loading={loading} disabled={detailLoading} onClick={handleSubmit}>
                {isEditMode ? '保存' : '创建'}
              </Button>
            </>
          )}
        />
        <div className="create-form-divider" />
        <div className="create-form-body">
          <Form className="min-h-[400px]" form={form} layout="vertical" disabled={detailLoading}>
            <Card className="!mb-6" bodyStyle={{ padding: '24px' }}>
              <Title level={5} className="mb-2">基本信息</Title>
              <Paragraph type="secondary" className="mb-6">
                设置Notebook基本信息。
              </Paragraph>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="instance_name"
                    label="名称"
                    rules={[
                      { required: true, message: '请输入名称' },
                      { pattern: /^[^ ]+$/, message: '输入不能包含空格' },
                    ]}
                  >
                    <Input maxLength={50} showCount placeholder="请输入Notebook名称" />
                  </Form.Item>
                </Col>
              </Row>
              <Row>
                <Col span={12}>
                  <Form.Item name="is_public" label="访问权限">
                    <Radio.Group
                      options={[
                        { label: '私有', value: false },
                        { label: '公开', value: true },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="describe" label="描述">
                    <TextArea placeholder="请输入描述 (可选)" rows={4} maxLength={1000} showCount />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            {/* <Card className="!mb-6" bodyStyle={{ padding: '24px' }}>
              <Title level={5} className="mb-2">AI服务选择</Title>
              <Paragraph type="secondary" className="mb-6">
                选择你想使用的模型服务，可在Notebook任务中使用
              </Paragraph>
              <Row>
                <Col span={12}>
                  <Form.Item name="online_reasoning_service" label="在线推理服务">
                    <OnlineReasoningServiceSelect />
                  </Form.Item>
                </Col>
              </Row>
            </Card> */}
            <Card className="!mb-6" bodyStyle={{ padding: '24px' }}>
              <Title level={5} className="mb-2">数据/模型选择</Title>
              <Paragraph type="secondary" className="mb-6">
                选择任务中需要的数据集或模型。
              </Paragraph>

              <Form.Item name="dataModelSelectType" hidden>
                <Radio.Group options={modelDatasetTypeOptions} />
              </Form.Item>

              <Row>
                <Col span={12}>
                  {dataModelSelectFields}
                </Col>
              </Row>

            </Card>

            <Card className="!mb-6" bodyStyle={{ padding: '24px' }}>
              <Title level={5} className="mb-2">资源配置</Title>
              <Paragraph type="secondary" className="mb-6">
                配置CPU、内存和显卡资源。
              </Paragraph>

              <ResourceConfig projectId={projectId ? Number(projectId) : undefined} skipLocalStorageEcho simpleGpuCountSelect embed useFlatResourceFields gpuOptional onGpuSelectionChange={handleGpuSelectionChange} />

              <div>
                <div className="mb-4 flex h-8 items-center gap-4">
                  <Text strong className="leading-8">运行时长配置</Text>
                  <Form.Item name="max_run_enabled" valuePropName="checked" noStyle>
                    <Switch />
                  </Form.Item>
                </div>
                <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.max_run_enabled !== currentValues.max_run_enabled}>
                  {({ getFieldValue }) => {
                    const maxRunEnabled = getFieldValue('max_run_enabled')
                    return maxRunEnabled ? (
                      <div>
                        <Text className="block mb-3">最长运行时长</Text>
                        <div className="flex flex-wrap items-start gap-x-3 gap-y-2 items-center">
                          <Form.Item
                            name="max_run_hours"
                            // className="mb-0 w-[160px]"
                            rules={[
                              {
                                type: 'number',
                                min: 0,
                                max: 24,
                                message: '小时必须在0-24之间',
                              },
                              {
                                validator: (_, value) => {
                                  if (value === undefined || value === null || value === '') {
                                    return Promise.resolve()
                                  }
                                  if (!Number.isInteger(value) || value < 0) {
                                    return Promise.reject(new Error('小时必须是正整数'))
                                  }
                                  return Promise.resolve()
                                },
                              },
                            ]}
                          >
                            <InputNumber min={0} max={24} precision={0} className="w-full" placeholder="请输入小时" />
                          </Form.Item>
                          <Text className="h-8 leading-8 mt-2">小时</Text>
                          <Form.Item
                            name="max_run_minutes"
                            // className="mb-0 w-[160px]"
                            rules={[
                              {
                                type: 'number',
                                min: 0,
                                max: 59,
                                message: '分钟必须在0-59之间',
                              },
                              {
                                validator: (_, value) => {
                                  if (value === undefined || value === null || value === '') {
                                    return Promise.resolve()
                                  }
                                  if (!Number.isInteger(value) || value < 0) {
                                    return Promise.reject(new Error('分钟必须是正整数'))
                                  }
                                  return Promise.resolve()
                                },
                              },
                            ]}
                          >
                            <InputNumber min={0} max={59} precision={0} className="w-full" placeholder="请输入分钟" />
                          </Form.Item>
                          <Text className="h-8 leading-8 mt-2">分钟</Text>
                        </div>
                      </div>
                    ) : null
                  }}
                </Form.Item>
              </div>
            </Card>

            <Card className="!mb-6" bodyStyle={{ padding: '24px' }}>
              <Title level={5} className="mb-2">选择Notebook镜像</Title>
              <Paragraph type="secondary" className="mb-6">
                选择适合您需求的预配置环境
              </Paragraph>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="镜像" name="image" rules={[{ required: true, message: '请选择镜像' }]}>
                    {image && <Tag className="!mb-2">{image}</Tag>}
                    {!image
                      ? <Button icon={<PlusOutlined />} onClick={handleAddImage}>添加镜像</Button>
                      : <Button icon={<EditOutlined />} onClick={handleAddImage}>更换镜像</Button>}
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            <Card className="!mb-6" bodyStyle={{ padding: '24px' }}>
              <Form.List
                name="ports"
                rules={[
                  {
                    validator: async (_, ports?: PortItems[]) => {
                      if ((ports?.length ?? 0) > MAX_COUNT) {
                        return Promise.reject(new Error(`开发端口最多添加 ${MAX_COUNT} 个`))
                      }
                      return Promise.resolve()
                    },
                  },
                ]}
              >
                {(fields, { add, remove }) => (
                  <>
                    <Row justify="space-between" align="middle" className="mb-4">
                      <Col>
                        <Title level={5} className="m-0">开放端口</Title>
                        <Paragraph type="secondary" className="mb-6">
                          开发端口最多添加5个
                        </Paragraph>
                      </Col>
                      <Col>
                        <Button
                          type="primary"
                          ghost
                          icon={<PlusOutlined />}
                          disabled={fields.length >= MAX_COUNT}
                          onClick={() => {
                            if (fields.length >= MAX_COUNT) {
                              message.warning(`开发端口最多添加 ${MAX_COUNT} 个`)
                              return
                            }
                            add({ protocol: 'TCP', container_port: undefined, description: '' })
                          }}
                        >
                          添加端口
                        </Button>
                      </Col>
                    </Row>
                    {fields.map(({ key, name, ...restField }) => (
                      <Row key={key} gutter={12} align="top" className="mb-3" wrap={false}>
                        <Form.Item {...restField} name={[name, 'id']} hidden>
                          <Input />
                        </Form.Item>
                        <Col flex="100px">
                          <Form.Item {...restField} name={[name, 'protocol']} rules={[{ required: true, message: '请选择协议' }]} className="mb-0">
                            <Select options={[...PORT_PROTOCOL_OPTIONS]} placeholder="协议" />
                          </Form.Item>
                        </Col>
                        <Col flex="140px">
                          <Form.Item
                            {...restField}
                            name={[name, 'container_port']}
                            rules={[
                              { required: true, message: '请输入内部端口' },
                              {
                                type: 'number',
                                min: 0,
                                max: 65535,
                                message: '端口范围为 0-65535',
                              },
                            ]}
                            className="mb-0"
                          >
                            <InputNumber min={0} max={65535} precision={0} className="w-full" placeholder="内部端口" />
                          </Form.Item>
                        </Col>
                        <Col flex="auto" className="min-w-0">
                          <Form.Item
                            {...restField}
                            name={[name, 'description']}
                            rules={[
                              { max: 64, message: '用途说明最多 64 个字符' },
                            ]}
                            className="mb-0"
                          >
                            <Input maxLength={64} showCount placeholder="请说明端口用途" />
                          </Form.Item>
                        </Col>
                        <Col flex="none">
                          <Button type="link" danger onClick={() => remove(name)}>
                            删除
                          </Button>
                        </Col>
                      </Row>
                    ))}
                  </>
                )}
              </Form.List>
            </Card>

            <Card className="!mb-6" bodyStyle={{ padding: '24px' }}>
              <Title level={5} className="mb-2">SSH配置</Title>
              <Paragraph type="secondary" className="mb-6">
                可选配置。创建后也可以在 Notebook 详情页补充或修改。
              </Paragraph>
              <Form.Item name="is_ssh" label="启用 SSH" valuePropName="checked">
                <Switch
                  onChange={(checked) => {
                    if (!checked) {
                      form.setFields([
                        { name: 'ssh_username', errors: [] },
                        { name: 'ssh_password', errors: [] },
                      ])
                    }
                  }}
                />
              </Form.Item>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="ssh_username" label="用户名" dependencies={['ssh_password', 'is_ssh']} rules={[{ validator: validateSshUsername }]}>
                    <Input maxLength={64} allowClear placeholder="请输入 SSH 用户名" disabled={!sshEnabled} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="ssh_password" label="密码" dependencies={['ssh_username', 'is_ssh']} rules={[{ validator: validateSshPassword }]}>
                    <Input.Password
                      maxLength={128}
                      allowClear
                      placeholder="请输入 SSH 密码"
                      disabled={!sshEnabled}
                      onFocus={() => {
                        if (
                          isEditMode
                          && initialSshConfiguredRef.current
                          && form.getFieldValue('ssh_password') === SSH_PASSWORD_MASK
                        ) {
                          form.setFieldValue('ssh_password', '')
                        }
                      }}
                      onBlur={() => {
                        if (
                          isEditMode
                          && initialSshConfiguredRef.current
                          && !String(form.getFieldValue('ssh_password') ?? '').trim()
                        ) {
                          form.setFieldValue('ssh_password', SSH_PASSWORD_MASK)
                        }
                      }}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </Form>
        </div>
      </section>

      <ImageDrawer
        open={imageDrawerOpen}
        onClose={() => setImageDrawerOpen(false)}
        gpuEnabled={gpuEnabled}
        gpuType={gpuType}
        useCategoryOnly={useCategoryOnly}
        selectedGpuOption={selectedGpuOption}
        isMachineLearningNotebook={isMachineLearningNotebook}
        onSelect={(image) => {
          form.setFieldsValue({ image: image.image_address || image.name || '' })
          setImageDrawerOpen(false)
        }}
      />
    </div>
  )
}
export default CreateNotebook
