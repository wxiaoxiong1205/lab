import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Form,
  Modal,
  Typography,
  message,
} from 'antd'
import dayjs from 'dayjs'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cleaningService } from '@/services/cleaningService'
import { trainingDatasetService } from '@/services/trainingApi'
import type {
  CleaningOperator,
  CleaningOperatorConfig,
  CleaningTaskListResponse,
  CleaningTemplateCreate,
  CleaningTemplateResponse,
  CreateCleaningTaskRequest,
  OperatorConfig,
} from '@/types/cleaning'
import type { DatasetPreviewSampleDpo, TrainingDatasetItem } from '@/types/training'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'
import { useProjectStore } from '@/stores/projectStore'
import {
  BasicInfoForm,
  OperatorSelection,
  ProcessConfig,
  TemplateModal,
} from '@/components/cleaning'
import './CreateCleaningTask.css'

const { Text, Title } = Typography

type CleaningTaskEditResponse = CleaningTaskListResponse & {
  override?: boolean
  selected_fields?: string[] | null
  columns?: unknown
}

const normalizeFieldNames = (fields: unknown): string[] => {
  if (!fields) return []

  const list = Array.isArray(fields) ? fields : [fields]
  const fieldNames = list
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') {
        const field = item as Record<string, unknown>
        return field.role ?? field.name ?? field.key ?? field.dataIndex ?? field.title
      }
      return null
    })
    .filter((item): item is string => typeof item === 'string' && item.length > 0)

  return [...new Set(fieldNames)]
}

const CreateCleaningTask: React.FC = () => {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams] = useSearchParams()
  const { currentProject } = useProjectStore()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()

  // 获取编辑模式的任务ID
  const taskIdParam = searchParams.get('taskId')
  const editTaskId = taskIdParam ? Number(taskIdParam) : null
  const isEditMode = !!editTaskId

  const numericProjectId = projectId ? Number(projectId) : currentProject?.id

  // 状态管理
  const [selectedOperators, setSelectedOperators] = useState<OperatorConfig[]>([])
  const [operatorConfigs, setOperatorConfigs] = useState<Record<string, any>>({})
  const [templateModalVisible, setTemplateModalVisible] = useState(false)
  const [dataSource, setDataSource] = useState<'existed_dataset' | 'upload'>('existed_dataset')
  const [outputMode, setOutputMode] = useState<'new' | 'override'>('new')
  const [selectedInputDataset, setSelectedInputDataset] = useState<string>('')
  const [selectedInputVersion, setSelectedInputVersion] = useState<string>('')
  const [selectedInputDatasetId, setSelectedInputDatasetId] = useState<number | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [datasetVersions, setDatasetVersions] = useState<Record<string, any[]>>({})
  const [datasetFields, setDatasetFields] = useState<string[]>([])
  const [selectedField, setSelectedField] = useState<string>('')
  const [fieldsLoading, setFieldsLoading] = useState<boolean>(false)
  const [scheduleEnabled, setScheduleEnabled] = useState<boolean>(false)

  const { data: trainingDatasetsData = { items: [] }, isLoading: trainingDatasetsLoading } = useQuery({
    queryKey: ['training-datasets', numericProjectId, 'training'],
    queryFn: async () => {
      if (!numericProjectId) throw new Error('Project ID is required')
      return await trainingDatasetService.get(numericProjectId, { page: 1, size: 100, usage: 'training' })
    },
    enabled: !!numericProjectId,
    staleTime: 0,
  })
  const { data: validationDatasetsData = { items: [] }, isLoading: validationDatasetsLoading } = useQuery({
    queryKey: ['training-datasets', numericProjectId, 'validation'],
    queryFn: async () => {
      if (!numericProjectId) throw new Error('Project ID is required')
      return await trainingDatasetService.get(numericProjectId, { page: 1, size: 100, usage: 'validation' })
    },
    enabled: !!numericProjectId,
    staleTime: 0,
  })
  const { data: testDatasetsData = { items: [] }, isLoading: testDatasetsLoading } = useQuery({
    queryKey: ['training-datasets', numericProjectId, 'test'],
    queryFn: async () => {
      if (!numericProjectId) throw new Error('Project ID is required')
      return await trainingDatasetService.get(numericProjectId, { page: 1, size: 100, usage: 'test' })
    },
    enabled: !!numericProjectId,
    staleTime: 0,
  })

  const datasetsData = useMemo(() => ({
    items: [
      ...(trainingDatasetsData?.items || []),
      ...(validationDatasetsData?.items || []),
      ...(testDatasetsData?.items || []),
    ],
  }), [trainingDatasetsData?.items, validationDatasetsData?.items, testDatasetsData?.items])

  const datasetsLoading = trainingDatasetsLoading || validationDatasetsLoading || testDatasetsLoading

  const { data: operatorsData = [], isLoading: operatorsLoading } = useQuery({
    queryKey: ['cleaning-operators'],
    queryFn: async () => {
      const operators = await cleaningService.getOperatorsByCategory()
      return operators.categories
    },
  })

  // 创建任务
  const createTaskMutation = useMutation({
    mutationFn: async (data: CreateCleaningTaskRequest) => {
      return await cleaningService.createTask(data)
    },
    onSuccess: () => {
      message.success('清洗任务创建成功')
      queryClient.invalidateQueries({ queryKey: ['cleaningTasks', numericProjectId] })
      navigate(`/project/${numericProjectId}/data-cleaning`)
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.detail || '创建任务失败')
    },
  })

  // 更新任务
  const updateTaskMutation = useMutation({
    mutationFn: async (data: Partial<CreateCleaningTaskRequest>) => {
      if (!editTaskId || !numericProjectId) throw new Error('Task ID and Project ID are required')
      return await cleaningService.updateTask(numericProjectId, editTaskId, data)
    },
    onSuccess: () => {
      message.success('清洗任务更新成功')
      queryClient.invalidateQueries({ queryKey: ['cleaningTasks', numericProjectId] })
      queryClient.invalidateQueries({ queryKey: ['cleaning-task', editTaskId] })
      navigate(`/project/${numericProjectId}/data-cleaning`)
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.detail || '更新任务失败')
    },
  })

  // 获取任务详情（编辑模式下）- 使用查看详情接口
  const { data: taskDetail, isLoading: taskDetailLoading } = useQuery<CleaningTaskEditResponse>({
    queryKey: ['cleaning-task-edit', editTaskId],
    queryFn: async () => {
      if (!editTaskId) throw new Error('Task ID is required')
      // 使用查看详情接口 getTask（与详情页面使用的接口一致）
      return await cleaningService.getTask(editTaskId)
    },
    enabled: isEditMode && !!editTaskId,
    staleTime: 0,
  })

  const getDefaultParamsFromSchema = (paramsSchema: Record<string, any>): Record<string, any> | null => {
    if (!paramsSchema || typeof paramsSchema !== 'object') return null
    const defaultParams: Record<string, any> = {}
    for (const [key, schema] of Object.entries(paramsSchema)) {
      if (schema && typeof schema === 'object' && 'default' in schema) {
        defaultParams[key] = schema.default
      }
    }
    return Object.keys(defaultParams).length > 0 ? defaultParams : null
  }

  const buildOperatorStep = (op: OperatorConfig, index: number) => {
    const operatorInfo = getOperatorInfo(op.operator_id)
    const hasParamsSchema = operatorInfo?.params_schema
      && typeof operatorInfo.params_schema === 'object'
      && Object.keys(operatorInfo.params_schema).length > 0

    // 检查是否有默认值
    const hasDefaultValues = hasParamsSchema && operatorInfo.params_schema
      ? Object.values(operatorInfo.params_schema).some(
          (schema: any) => schema && typeof schema === 'object' && 'default' in schema,
        )
      : false

    // 优先使用用户配置的参数，否则使用算子配置中的参数
    let params = operatorConfigs[op.operator_id] ?? op.params

    // 只有当有默认值且参数为空时，才使用默认值
    if (hasDefaultValues && operatorInfo.params_schema) {
      const isEmptyParams = !params
        || (typeof params === 'object' && !Array.isArray(params) && Object.keys(params).length === 0)
      if (isEmptyParams) {
        const defaultParams = getDefaultParamsFromSchema(operatorInfo.params_schema)
        if (defaultParams) params = defaultParams
      }
    }

    // 只有当有默认值时才传递params，否则传递null
    const finalParams = hasDefaultValues
      ? (params !== null && params !== undefined && typeof params === 'object' && !Array.isArray(params)
          ? params
          : null)
      : null

    return {
      operator_type: op.operator_id,
      operator_name: operatorInfo?.name || null,
      params: finalParams,
      order: index + 1,
    }
  }

  const createTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!numericProjectId) throw new Error('Project ID is required')
      const requestData: CleaningTemplateCreate = {
        project_id: numericProjectId,
        steps_json: selectedOperators.map(buildOperatorStep),
      }
      return await cleaningService.createTemplate(requestData)
    },
    onSuccess: () => {
      message.success('模板保存成功')
      queryClient.invalidateQueries({ queryKey: ['cleaning-templates', numericProjectId] })
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.detail || '保存模板失败')
    },
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      return await cleaningService.deleteTemplate(templateId)
    },
    onSuccess: () => {
      message.success('模板删除成功')
      queryClient.invalidateQueries({ queryKey: ['cleaning-templates', numericProjectId] })
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.detail || '删除模板失败')
    },
  })

  const [cascaderOptions, setCascaderOptions] = useState<any[]>([])

  const buildCascaderOption = (usage: string, label: string, items: TrainingDatasetItem[]) => ({
    value: usage,
    label,
    children: items.length > 0
      ? items.map((dataset: TrainingDatasetItem) => ({
          value: dataset.dataset_name,
          label: dataset.dataset_name,
          isLeaf: false,
        }))
      : [{
          value: '__no_dataset__',
          label: `暂无${label}数据集`,
          isLeaf: true,
          disabled: true,
        }],
  })

  useEffect(() => {
    setCascaderOptions([
      buildCascaderOption('training', '训练数据集', trainingDatasetsData?.items || []),
      buildCascaderOption('validation', '验证数据集', validationDatasetsData?.items || []),
      buildCascaderOption('test', '测试数据集', testDatasetsData?.items || []),
    ])
  }, [trainingDatasetsData, validationDatasetsData, testDatasetsData])

  // 编辑模式：回显任务详情数据
  useEffect(() => {
    if (!isEditMode || !taskDetail || taskDetailLoading) return

    try {
      // 回显基本信息
      form.setFieldsValue({
        task_name: taskDetail.name,
      })

      // 回显数据来源
      if (taskDetail.source) {
        setDataSource(taskDetail.source as 'existed_dataset' | 'upload')
      }

      // 回显输出模式
      if (taskDetail.override !== undefined) {
        setOutputMode(taskDetail.override ? 'override' : 'new')
      }

      // 回显数据集选择（如果数据来源是已有数据集）
      if (taskDetail.source === 'existed_dataset' && taskDetail.input_dataset_name) {
        // 兼容两种格式：
        // 1) 数据集名称-版本号
        // 2) 训练数据集/数据集名称-版本号（含用途前缀）
        const parseDatasetNameAndVersion = (rawName: string) => {
          let normalizedName = rawName.trim()
          let version = ''
          let usageFromPrefix: 'training' | 'validation' | 'test' | null = null

          const suffixMatch = normalizedName.match(/-(V?\d+)$/i)
          if (suffixMatch) {
            version = suffixMatch[1].toUpperCase()
            if (/^\d+$/.test(version)) {
              version = `V${version}`
            }
            normalizedName = normalizedName.slice(0, -suffixMatch[0].length)
          }
          else {
            const parts = normalizedName.split('-')
            if (parts.length >= 2) {
              version = parts[parts.length - 1]
              if (/^\d+$/.test(version)) {
                version = `V${version}`
              }
              normalizedName = parts.slice(0, -1).join('-')
            }
          }

          const usagePrefixMap: Array<{ prefix: string, usage: 'training' | 'validation' | 'test' }> = [
            { prefix: '训练数据集/', usage: 'training' },
            { prefix: '验证数据集/', usage: 'validation' },
            { prefix: '测试数据集/', usage: 'test' },
          ]

          for (const item of usagePrefixMap) {
            if (normalizedName.startsWith(item.prefix)) {
              usageFromPrefix = item.usage
              normalizedName = normalizedName.slice(item.prefix.length)
              break
            }
          }

          return {
            datasetName: normalizedName,
            version,
            usageFromPrefix,
          }
        }

        const { datasetName, version, usageFromPrefix } = parseDatasetNameAndVersion(taskDetail.input_dataset_name)

        if (datasetName && version) {
          setSelectedInputDataset(datasetName)
          setSelectedInputVersion(version)
          if (taskDetail.input_dataset_id) {
            setSelectedInputDatasetId(taskDetail.input_dataset_id)
          }

          // 查找数据集所在的 usage（training/validation/test）
          let datasetUsage: 'training' | 'validation' | 'test' | null = usageFromPrefix
          const allDatasets = datasetsData.items
          const foundDataset = allDatasets.find((ds: TrainingDatasetItem) => ds.dataset_name === datasetName)
          if (foundDataset && !datasetUsage) {
            // 从数据集列表中查找对应的 usage
            if (trainingDatasetsData?.items?.some((ds: TrainingDatasetItem) => ds.dataset_name === datasetName)) {
              datasetUsage = 'training'
            }
            else if (validationDatasetsData?.items?.some((ds: TrainingDatasetItem) => ds.dataset_name === datasetName)) {
              datasetUsage = 'validation'
            }
            else if (testDatasetsData?.items?.some((ds: TrainingDatasetItem) => ds.dataset_name === datasetName)) {
              datasetUsage = 'test'
            }
          }

          const taskSelectedFields = normalizeFieldNames(taskDetail.selected_fields)
          const taskColumns = normalizeFieldNames(taskDetail.columns)

          // 如果有选中的字段，先设置回显值
          if (taskSelectedFields.length > 0) {
            setSelectedField(taskSelectedFields[0])
          }
          else if (taskColumns.length === 1) {
            setSelectedField(taskColumns[0])
          }

          // 编辑模式下始终加载字段列表，确保清洗字段选项可见且可校验
          if (datasetUsage) {
            if (taskColumns.length > 0) {
              setDatasetFields(taskColumns)
              setFieldsLoading(false)
            }

            // 拉取版本列表供输出数据集名称（下一版本）等逻辑使用，并基于预览数据刷新真实字段
            if (numericProjectId) {
              void trainingDatasetService
                .detail(numericProjectId, datasetName, datasetUsage)
                .then((detail) => {
                  const versions = parseVersions(detail, null)
                  setDatasetVersions((prev) => ({ ...prev, [datasetName]: versions }))
                  const versionInfo = Array.isArray(detail)
                    ? detail.find((item) => item?.version === version)
                    : detail?.versions?.find((item) => item?.version === version)
                  return fetchDatasetFields(datasetName, version, datasetUsage, versionInfo, taskColumns)
                })
                .catch(() => {
                  if (taskColumns.length === 0) {
                    void fetchDatasetFields(datasetName, version, datasetUsage)
                  }
                })
            }
            else if (taskColumns.length === 0) {
              fetchDatasetFields(datasetName, version, datasetUsage)
            }
          }
        }
      }

      // 回显定时任务配置：仅当 schedule_at 有值时才开启并回显；为 null 时不开启且清空，避免缓存旧数据
      if (taskDetail.schedule_at) {
        const scheduleDateTime = dayjs(taskDetail.schedule_at)
        if (scheduleDateTime.isValid()) {
          setScheduleEnabled(true)
          form.setFieldsValue({
            schedule_enabled: true,
            schedule_date: scheduleDateTime,
            schedule_time: scheduleDateTime,
          })
        }
      }
      else {
        setScheduleEnabled(false)
        form.setFieldsValue({
          schedule_enabled: false,
          schedule_date: undefined,
          schedule_time: undefined,
        })
      }

      // 回显算子配置
      if (taskDetail.steps_snapshot && Array.isArray(taskDetail.steps_snapshot)) {
        const operators: OperatorConfig[] = taskDetail.steps_snapshot
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map((step) => ({
            operator_id: step.operator_type,
            params: step.params || {},
          }))

        setSelectedOperators(operators)

        const configs: Record<string, any> = {}
        operators.forEach((op) => {
          if (op.params) {
            configs[op.operator_id] = op.params
          }
        })
        setOperatorConfigs(configs)
      }
    }
    catch (error) {
      console.error('回显任务详情失败:', error)
      message.error('加载任务详情失败，请刷新重试')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isEditMode,
    taskDetail,
    taskDetailLoading,
    form,
    datasetsData.items,
    trainingDatasetsData?.items,
    validationDatasetsData?.items,
    testDatasetsData?.items,
  ])

  const parseDatasetId = (item: any): number | null => {
    if (item.id) return typeof item.id === 'string' ? parseInt(item.id, 10) : item.id
    if (item.dataset_id) return typeof item.dataset_id === 'string' ? parseInt(item.dataset_id, 10) : item.dataset_id
    return null
  }

  const parseVersions = (detail: any, datasetId: number | null): any[] => {
    if (Array.isArray(detail) && detail.length > 0) {
      const id = datasetId || parseDatasetId(detail[0])
      return detail.map((v: any) => ({
        version: v.version,
        record_count: v.total_samples || v.record_count,
        dataset_id: v.id || v.dataset_id || id,
      }))
    }
    if (detail?.versions) {
      const id = datasetId || parseDatasetId(detail)
      return detail.versions.map((v: any) => ({
        version: v.version,
        record_count: v.total_samples || v.record_count,
        dataset_id: v.id || v.dataset_id || id,
      }))
    }
    if (detail?.version) {
      const id = datasetId || parseDatasetId(detail)
      return [{
        version: detail.version,
        record_count: detail.total_samples || detail.record_count,
        dataset_id: id,
      }]
    }
    return []
  }

  const fetchDatasetFields = async (
    datasetName: string,
    version: string,
    usage: 'training' | 'validation' | 'test',
    versionInfo: any = null,
    fallbackFields: string[] = [],
  ) => {
    if (!numericProjectId || !datasetName || !version) return

    setFieldsLoading(true)
    if (fallbackFields.length === 0) {
      setDatasetFields([])
    }

    const dataset_id = versionInfo?.id
    // const dataset_name = versionInfo?.dataset_name
    const dataset_format = versionInfo?.dataset_format
    // const training_method_type = versionInfo?.training_method_type
    // const metadata_fields = versionInfo?.metadata_fields

    try {
      // if (metadata_fields) {
      //   setDatasetFields(metadata_fields)
      //   return
      // }
      const dataFields = (await cleaningService.getCleaningWords(dataset_id))?.fields
      if (dataFields) {
        setDatasetFields(dataFields)
        return
      }

      const previewData = await trainingDatasetService.preview(numericProjectId, datasetName, version, 1, 1, usage)
      const firstItem = previewData?.items?.[0]
      const rawSampleData = firstItem?.sample_data

      let fields: string[] = []

      // 取第一行数据（兼容 sample_data 为数组或对象）
      const sampleData = rawSampleData && typeof rawSampleData === 'object'
        ? (Array.isArray(rawSampleData) ? rawSampleData[0] : rawSampleData)
        : null

      // 对话格式：sample_data 为对象且含 messages，或为数组且首项含 messages，以 role 作为清洗字段
      const messagesArray = Array.isArray(rawSampleData?.messages)
        ? (rawSampleData as { messages: Array<{ role?: string }> }).messages
        : (sampleData && Array.isArray(sampleData?.messages)
            ? (sampleData as { messages: Array<{ role?: string }> }).messages
            : null)
      if (messagesArray && messagesArray.length > 0) {
        const roles = messagesArray
          .map((m) => m?.role)
          .filter(Boolean) as string[]
        fields = [...new Set(roles)]
      }
      else if (sampleData && typeof sampleData === 'object') {
        // 原有逻辑：取第一行键名作为字段
        fields = Object.keys(sampleData).filter(
          (key) => !['row_number', 'key', 'id'].includes(key),
        )
      }

      const dpoSample = rawSampleData as DatasetPreviewSampleDpo
      const hasRoleBasedDpoChoices = !!(
        dpoSample?.chosen
        && typeof dpoSample.chosen === 'object'
        && dpoSample?.rejected
        && typeof dpoSample.rejected === 'object'
      )

      if (dpoSample?.chosen && dpoSample?.rejected && (dataset_format === 'role-based' || hasRoleBasedDpoChoices)) {
        fields.push('chosen', 'rejected')
      }

      if (fields.length > 0) {
        setDatasetFields([...new Set(fields)])
        if (fields.length === 1) {
          setSelectedField(fields[0])
        }
      }
      else if (fallbackFields.length > 0) {
        setDatasetFields(fallbackFields)
      }
    }
    catch (error) {
      console.error('获取数据集字段失败:', error)
      message.error('获取数据集字段失败，请稍后重试')
      setDatasetFields(fallbackFields)
    }
    finally {
      setFieldsLoading(false)
    }
  }

  // 保持状态与表单字段同步，避免编辑态已选字段未写入表单导致不回显/校验失败
  useEffect(() => {
    form.setFieldsValue({ selected_field: selectedField || undefined })
  }, [selectedField, form])

  const resetDatasetSelection = () => {
    setSelectedInputDataset('')
    setSelectedInputVersion('')
    setSelectedInputDatasetId(null)
    setDatasetFields([])
    setSelectedField('')
    form.setFieldsValue({ selected_field: undefined, data_to_infer: undefined })
  }

  const getDatasetId = (versionOption: any, datasetName: string, version: string): number | null => {
    if (versionOption?.dataset_id) {
      return typeof versionOption.dataset_id === 'string'
        ? parseInt(versionOption.dataset_id, 10)
        : versionOption.dataset_id
    }
    const vd = versionOption?.versionData
    if (vd?.dataset_id != null) {
      return typeof vd.dataset_id === 'string' ? parseInt(vd.dataset_id, 10) : vd.dataset_id
    }
    if (vd?.id != null) {
      return typeof vd.id === 'string' ? parseInt(vd.id, 10) : vd.id
    }
    const versions = datasetVersions[datasetName]
    const versionInfo = versions?.find((v: any) => v.version === version)
    if (versionInfo?.dataset_id) {
      return typeof versionInfo.dataset_id === 'string'
        ? parseInt(versionInfo.dataset_id, 10)
        : versionInfo.dataset_id
    }
    return null
  }

  const handleCascaderChange = async (value: (string | number)[] | null, selectedOptions?: any[]) => {
    if (!value || !selectedOptions) {
      resetDatasetSelection()
      return
    }

    if (value.length === 3 && selectedOptions.length === 3) {
      const [usage, datasetName, version] = value as string[]
      if (version === '__no_version__' || version === '__load_error__') {
        resetDatasetSelection()
        message.warning('请选择有效的数据集版本')
        return
      }

      setSelectedInputDataset(datasetName)
      setSelectedInputVersion(version)
      setSelectedInputDatasetId(getDatasetId(selectedOptions[2], datasetName, version))

      let versions, detail

      if (numericProjectId) {
        try {
          detail = await trainingDatasetService.detail(numericProjectId, datasetName, usage)
          versions = parseVersions(detail, null)
          setDatasetVersions((prev) => ({ ...prev, [datasetName]: versions }))
        }
        catch (e) {
          console.error(e)
        }
      }
      const versionInfo = Array.isArray(detail)
        ? detail.find((item) => item?.version === version)
        : detail?.versions?.find((item) => item?.version === version)

      fetchDatasetFields(datasetName, version, usage as 'training' | 'validation' | 'test', versionInfo)
    }
    else {
      resetDatasetSelection()
      if (value.length === 2) {
        message.info('请继续选择数据集版本以完成选择')
      }
    }
  }

  const handleDataSourceChange = (value: 'existed_dataset' | 'upload') => {
    setDataSource(value)
    if (value === 'existed_dataset') {
      setSelectedFile(null)
    }
    else {
      setSelectedInputDataset('')
      setSelectedInputVersion('')
      setSelectedInputDatasetId(null)
      setDatasetFields([])
      setSelectedField('')
      form.setFieldsValue({ data_to_infer: undefined })
    }
  }

  const handleFieldChange = (field: string) => {
    setSelectedField(field)
  }

  const handleOperatorToggle = (operator: CleaningOperator, checked: boolean) => {
    if (checked) {
      // 获取默认参数
      const defaultParams = operator.params_schema
        ? getDefaultParamsFromSchema(operator.params_schema)
        : null
      const initialParams = defaultParams || {}

      setSelectedOperators((prev) => {
        if (prev.some((op) => op.operator_id === operator.type)) return prev
        return [...prev, { operator_id: operator.type, params: initialParams }]
      })

      // 如果有默认值，也初始化到operatorConfigs中
      if (defaultParams) {
        setOperatorConfigs((prev) => ({ ...prev, [operator.type]: defaultParams }))
      }
    }
    else {
      setSelectedOperators((prev) => prev.filter((op) => op.operator_id !== operator.type))
      setOperatorConfigs((prev) => {
        const newConfigs = { ...prev }
        delete newConfigs[operator.type]
        return newConfigs
      })
    }
  }

  const handleOperatorDrop = (operator: CleaningOperator, index?: number) => {
    if (selectedOperators.some((op) => op.operator_id === operator.type)) {
      message.warning(`算子 "${operator.name}" 已存在于流程中`)
      return
    }

    // 获取默认参数
    const defaultParams = operator.params_schema
      ? getDefaultParamsFromSchema(operator.params_schema)
      : null
    const initialParams = defaultParams || {}
    const newOperator: OperatorConfig = { operator_id: operator.type, params: initialParams }

    setSelectedOperators((prev) => {
      if (index !== undefined && index >= 0 && index <= prev.length) {
        const newOperators = [...prev]
        newOperators.splice(index, 0, newOperator)
        return newOperators
      }
      return [...prev, newOperator]
    })

    // 如果有默认值，也初始化到operatorConfigs中
    if (defaultParams) {
      setOperatorConfigs((prev) => ({ ...prev, [operator.type]: defaultParams }))
    }

    message.success(`算子 "${operator.name}" 已添加到流程中`)
  }

  const handleOperatorConfigChange = (operatorId: string, params: any) => {
    setOperatorConfigs((prev) => ({ ...prev, [operatorId]: params }))
    setSelectedOperators((prev) =>
      prev.map((op) => (op.operator_id === operatorId ? { ...op, params } : op)),
    )
  }

  const handleOperatorRemove = (operatorId: string) => {
    setSelectedOperators((prev) => prev.filter((op) => op.operator_id !== operatorId))
    setOperatorConfigs((prev) => {
      const newConfigs = { ...prev }
      delete newConfigs[operatorId]
      return newConfigs
    })
  }

  const handleClearAll = () => {
    setSelectedOperators([])
    setOperatorConfigs({})
    message.success('已清空所有算子')
  }

  const handleOperatorMoveUp = (index: number) => {
    if (index === 0) return
    setSelectedOperators((prev) => {
      const newOperators = [...prev];
      [newOperators[index - 1], newOperators[index]] = [newOperators[index], newOperators[index - 1]]
      return newOperators
    })
  }

  const handleOperatorMoveDown = (index: number) => {
    if (index === selectedOperators.length - 1) return
    setSelectedOperators((prev) => {
      const newOperators = [...prev];
      [newOperators[index], newOperators[index + 1]] = [newOperators[index + 1], newOperators[index]]
      return newOperators
    })
  }

  const [draggedOperatorId, setDraggedOperatorId] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragItemRef = useRef<number | null>(null)

  // 处理拖拽结束事件
  const handleDragEnd = useCallback(() => {
    setDraggedOperatorId(null)
    setDragOverIndex(null)
    dragItemRef.current = null
  }, [])

  // 添加全局dragend事件监听，确保在任何情况下都能重置拖拽状态
  useEffect(() => {
    const handleGlobalDragEnd = (e: DragEvent) => {
      // 重置所有拖拽相关状态
      handleDragEnd()
    }

    document.addEventListener('dragend', handleGlobalDragEnd)

    return () => {
      document.removeEventListener('dragend', handleGlobalDragEnd)
    }
  }, [handleDragEnd])

  const handleDragStart = useCallback((index: number) => {
    dragItemRef.current = index
    const draggedOperator = selectedOperators[index]
    if (draggedOperator) {
      setDraggedOperatorId(draggedOperator.operator_id)
    }
  }, [selectedOperators])

  const handleDragEnter = useCallback((index: number) => {
    if (dragItemRef.current === null) return
    const dragIndex = dragItemRef.current
    if (dragIndex < 0 || dragIndex >= selectedOperators.length || index < 0 || index > selectedOperators.length) {
      return
    }
    if (dragIndex === index) {
      setDragOverIndex(index)
      return
    }
    setSelectedOperators((prev) => {
      if (dragIndex < 0 || dragIndex >= prev.length || index < 0 || index > prev.length) {
        return prev
      }
      const newOperators = [...prev]
      const [removed] = newOperators.splice(dragIndex, 1)
      const insertIndex = Math.min(index, newOperators.length)
      newOperators.splice(insertIndex, 0, removed)
      setTimeout(() => {
        // 清空拖拽的算子ID和拖拽目标索引
        setDraggedOperatorId(null)
        // 清空拖拽目标索引
        setDragOverIndex(null)
      }, 0)
      return newOperators
    })

    // 更新引用和状态
    dragItemRef.current = index
    setDragOverIndex(index)
  }, [selectedOperators])

  // 拖拽离开时
  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null)
  }, [])

  // 拖拽过程中
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  // 处理放置事件
  const handleDrop = useCallback(() => {
    setDraggedOperatorId(null)
    setDragOverIndex(null)
    dragItemRef.current = null
  }, [])
  const handleApplyTemplate = (template: CleaningTemplateResponse) => {
    if (!template.steps_json || !Array.isArray(template.steps_json)) return

    const operators: OperatorConfig[] = template.steps_json.map((step: CleaningOperatorConfig) => ({
      operator_id: step.operator_type,
      params: step.params || {},
    }))

    setSelectedOperators(operators)
    const configs: Record<string, any> = {}
    operators.forEach((op) => {
      if (op.params) configs[op.operator_id] = op.params
    })
    setOperatorConfigs(configs)
    setTemplateModalVisible(false)
    message.success('模板应用成功')
  }

  const handleSaveAsTemplate = () => {
    if (selectedOperators.length === 0) {
      message.warning('请先配置清洗流程')
      return
    }
    if (!numericProjectId) {
      message.error('未找到项目信息')
      return
    }
    createTemplateMutation.mutate()
  }

  /**
   * 检查值是否为空
   * 用于验证必填项是否已填写
   */
  const isEmptyValue = (value: any, type: string): boolean => {
    if (value === null || value === undefined) {
      return true
    }
    if (type === 'string' && value === '') {
      return true
    }
    if (type === 'list') {
      // 对于 list 类型，需要兼容数组和字符串
      // 如果是数组，检查是否为空数组
      if (Array.isArray(value)) {
        return value.length === 0
      }
      // 如果是字符串，检查是否为空字符串（兼容单选的枚举值）
      if (typeof value === 'string') {
        return value === ''
      }
      // 其他类型（如数字、对象等）认为有值
      return false
    }
    return false
  }

  /**
   * 验证所有算子的必填参数
   */
  const validateRequiredParams = (): { isValid: boolean, errors: string[] } => {
    const errors: string[] = []

    for (const operatorConfig of selectedOperators) {
      const operatorInfo = getOperatorInfo(operatorConfig.operator_id)
      if (!operatorInfo?.params_schema) continue

      const paramsSchema = operatorInfo.params_schema
      let currentParams = operatorConfigs[operatorConfig.operator_id] ?? operatorConfig.params ?? {}

      const defaultParams = getDefaultParamsFromSchema(paramsSchema)
      if (defaultParams) {
        currentParams = { ...defaultParams, ...currentParams }
      }

      // 检查每个参数的必填性
      for (const [paramName, schema] of Object.entries(paramsSchema)) {
        const paramSchema = schema as any
        // 如果参数是必填的
        if (paramSchema.required === true) {
          // 从合并后的参数中获取值，如果没有则使用默认值
          const currentValue = paramName in currentParams
            ? currentParams[paramName]
            : paramSchema.default

          // 检查是否为空值
          if (isEmptyValue(currentValue, paramSchema.type)) {
            const paramLabel = paramSchema.description || paramName
            errors.push(`算子 "${operatorInfo.name}" 的必填参数 "${paramLabel}"(${paramName}) 未提供`)
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()

      if (dataSource === 'existed_dataset') {
        if (!selectedInputDataset || !selectedInputVersion) {
          message.warning('请选择处理前数据集及版本')
          return
        }
        if (!selectedField) {
          message.warning('请选择清洗字段')
          return
        }
      }
      else if (dataSource === 'upload' && !selectedFile) {
        message.warning('请上传文件')
        return
      }

      if (selectedOperators.length === 0) {
        message.warning('请至少选择一个清洗算子')
        return
      }

      // 验证所有算子的必填参数
      const validation = validateRequiredParams()
      if (!validation.isValid) {
        // 显示错误信息
        if (validation.errors.length === 1) {
          message.error(validation.errors[0])
        }
        else {
          message.error(`${validation.errors[0]}（共 ${validation.errors.length} 个错误）`)
          console.warn('所有验证错误:', validation.errors)
        }
        return
      }

      submitTask(values)
    }
    catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  const buildTaskStep = (op: OperatorConfig, index: number) => {
    const operatorInfo = getOperatorInfo(op.operator_id)
    const hasParamsSchema = operatorInfo?.params_schema
      && typeof operatorInfo.params_schema === 'object'
      && Object.keys(operatorInfo.params_schema).length > 0

    // 检查是否有默认值
    const hasDefaultValues = hasParamsSchema && operatorInfo.params_schema
      ? Object.values(operatorInfo.params_schema).some(
          (schema: any) => schema && typeof schema === 'object' && 'default' in schema,
        )
      : false

    if (!hasDefaultValues) {
      return {
        operator_type: op.operator_id,
        operator_name: operatorInfo?.name || null,
        params: null,
        order: index,
      }
    }

    let params = operatorConfigs[op.operator_id] ?? op.params ?? {}

    // 合并默认值和用户设置的参数，用户设置的参数优先
    const defaultParams = getDefaultParamsFromSchema(operatorInfo.params_schema!)
    if (defaultParams) {
      params = { ...defaultParams, ...params }
    }

    // 只有当params不为空时才传递
    const finalParams = params && typeof params === 'object' && !Array.isArray(params) && Object.keys(params).length > 0
      ? params
      : null

    return {
      operator_type: op.operator_id,
      operator_name: operatorInfo?.name || null,
      params: finalParams,
      order: index,
    }
  }

  const submitTask = async (values: any) => {
    if (!numericProjectId) {
      message.error('未找到项目信息')
      return
    }
    if (dataSource === 'existed_dataset' && !selectedInputDatasetId) {
      message.error('无法获取输入数据集ID，请重新选择数据集')
      return
    }

    try {
      const scheduleDate = scheduleEnabled ? dayjs(form.getFieldValue('schedule_date')).format('YYYY-MM-DD') : undefined
      const scheduleTime = scheduleEnabled ? dayjs(form.getFieldValue('schedule_time')).format('HH:mm:ss') : undefined
      const scheduleAt = scheduleEnabled && scheduleDate && scheduleTime ? `${scheduleDate}T${scheduleTime}` : undefined

      const requestData: CreateCleaningTaskRequest = {
        name: values.task_name || form.getFieldValue('task_name'),
        project_id: numericProjectId,
        source: dataSource,
        input_dataset_id: dataSource === 'existed_dataset' ? selectedInputDatasetId : null,
        override: outputMode === 'override',
        selected_fields: dataSource === 'existed_dataset' && selectedField ? [selectedField] : undefined,
        steps: selectedOperators.map(buildTaskStep),
        ...(scheduleAt && { schedule_at: scheduleAt }),
      }

      if (isEditMode) {
        // 编辑模式：调用更新接口
        updateTaskMutation.mutate(requestData)
      }
      else {
        // 创建模式：调用创建接口
        createTaskMutation.mutate(requestData)
      }
    }
    catch (error) {
      console.error('提交任务失败:', error)
      message.error('提交任务失败，请重试')
    }
  }

  const handleDeleteTemplate = (templateId: number) => {
    Modal.confirm({
      title: '确认删除模板',
      content: '确定要删除此模板吗？此操作不可恢复。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => deleteTemplateMutation.mutate(templateId),
    })
  }

  const getOperatorInfo = (operatorId: string): CleaningOperator | undefined => {
    if (!operatorsData) return undefined
    for (const category of operatorsData) {
      const operator = category.operators.find((op) => op.type === operatorId)
      if (operator) return operator
    }
    return undefined
  }

  if (!numericProjectId) {
    return (
      <div className="p-6">
        <Alert message="未找到项目信息，请先选择一个项目" type="error" />
      </div>
    )
  }

  // 编辑模式下加载任务详情时的显示
  if (isEditMode && taskDetailLoading) {
    return (
      <div className="p-6 text-center">
        <div className="mt-[100px]">
          <Text>正在加载任务详情...</Text>
        </div>
      </div>
    )
  }

  return (
    <div className="create-cleaning-task-page create-form-page min-h-full bg-[var(--lab-color-surface-page)] p-0">
      <div className="create-cleaning-task-card create-form-card min-h-[2045px] w-full rounded-[10px] bg-[var(--lab-color-surface-elevated)] shadow-[var(--lab-shadow-page-card)]">
        <CreateFormPageHeader
          title={isEditMode ? '编辑清洗任务' : '创建清洗任务'}
          description="配置您的数据清洗流程，提升数据质量与一致性"
          onBack={() => navigate(`/project/${numericProjectId}/data-cleaning`)}
          actions={(
            <>
              <Button className="create-form-cancel" onClick={() => navigate(`/project/${numericProjectId}/data-cleaning`)}>
                取消
              </Button>
              <Button
                className="create-form-submit"
                type="primary"
                loading={isEditMode ? updateTaskMutation.isPending : createTaskMutation.isPending}
                onClick={handleSubmit}
              >
                提交
              </Button>
            </>
          )}
        />
        <div className="create-form-divider" />

        <div className="create-cleaning-task-content ml-10 w-[1172px] pt-[21px]">
          <section className="create-cleaning-task-basic-section">
            <Title level={2}>基本信息</Title>
            <BasicInfoForm
              form={form}
              dataSource={dataSource}
              selectedInputDataset={selectedInputDataset}
              selectedInputVersion={selectedInputVersion}
              outputMode={outputMode}
              selectedFile={selectedFile}
              datasetsData={datasetsData}
              datasetsLoading={datasetsLoading}
              datasetVersions={datasetVersions}
              cascaderOptions={cascaderOptions}
              datasetFields={datasetFields}
              selectedField={selectedField}
              fieldsLoading={fieldsLoading}
              onDataSourceChange={handleDataSourceChange}
              onCascaderChange={handleCascaderChange}
              onOutputModeChange={setOutputMode}
              onFileChange={setSelectedFile}
              onFieldChange={handleFieldChange}
              scheduleEnabled={scheduleEnabled}
              onScheduleEnabledChange={(checked) => {
                setScheduleEnabled(checked)
                form.setFieldsValue({ schedule_enabled: checked })
                if (!checked) {
                  form.setFieldsValue({ schedule_date: undefined, schedule_time: undefined })
                }
              }}
            />
          </section>

          <div className="create-cleaning-task-section-titles mt-1 grid grid-cols-[560px_594px] gap-x-[18px]">
            <Title level={2}>清洗能力</Title>
            <Title level={2}>数据清洗流程配置</Title>
          </div>

          <div className="create-cleaning-task-workspace mt-2.5 grid grid-cols-[560px_594px] gap-x-[18px] pb-[26px]">
            <section className="create-cleaning-task-operator-section w-[560px]">
              {operatorsLoading ? (
                <div className="text-center p-10">
                  <Text type="secondary">加载中...</Text>
                </div>
              ) : (
                <OperatorSelection
                  operatorsData={operatorsData}
                  selectedOperators={selectedOperators}
                  onOperatorToggle={handleOperatorToggle}
                />
              )}
            </section>
            <section className="create-cleaning-task-process-section min-h-[1159px] w-[594px] rounded-md border border-[var(--lab-color-divider)] p-3.5">
              <ProcessConfig
                selectedOperators={selectedOperators}
                operatorConfigs={operatorConfigs}
                draggedOperatorId={draggedOperatorId}
                dragOverIndex={dragOverIndex}
                getOperatorInfo={getOperatorInfo}
                onSaveAsTemplate={handleSaveAsTemplate}
                onOpenTemplateModal={() => setTemplateModalVisible(true)}
                onClearAll={handleClearAll}
                onOperatorConfigChange={handleOperatorConfigChange}
                onOperatorMoveUp={handleOperatorMoveUp}
                onOperatorMoveDown={handleOperatorMoveDown}
                onOperatorRemove={handleOperatorRemove}
                onDragStart={handleDragStart}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                onOperatorDrop={handleOperatorDrop}
                saveTemplateLoading={createTemplateMutation.isPending}
              />
            </section>
          </div>
        </div>
      </div>
      <TemplateModal
        visible={templateModalVisible}
        projectId={numericProjectId!}
        getOperatorInfo={getOperatorInfo}
        onCancel={() => setTemplateModalVisible(false)}
        onApply={handleApplyTemplate}
        onDelete={handleDeleteTemplate}
      />
    </div>
  )
}

export default CreateCleaningTask
