import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Card,
  Cascader,
  Checkbox,
  Col,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  TimePicker,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd'
import type { UploadProps } from 'antd'
import { DeleteOutlined, ExclamationCircleOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  type BusinessApiBindingFields,
  BusinessInferenceParamsMappingCard,
  type BusinessMappingItem,
} from './BusinessInferenceParamsMappingCard'
import type {
  CreateProjectEvaluationTaskParams,
  EvaluationDatasetType,
  GraphicsCardResource,
  InferenceParams,
  NewDatasetModelRelation,
} from '@/services/modelEvaluationServices'
import {
  type ApiParams,
  modelEvaluationServices,
} from '@/services/modelEvaluationServices'
import { inferenceDatasetsServices } from '@/services/inferenceDatasets'
import { inferenceServiceApi } from '@/services/inferenceService'
import { trainingDatasetService } from '@/services/trainingApi'
import apiService from '@/services/apiService'
import { ModelService } from '@/services/modelsApi'
import type { GetBaseModelsParams } from '@/types/model'
import type { TrainingDatasetItem } from '@/types/training'
import { getKubernetesClusterGPUTypes, getKubernetesClusterGPUs } from '@/services/kubernetesService'
import { downloadBlobFile } from '@/utils/download'
import {
  DatasetCascaderSelector,
  InferenceParametersConfig,
  RefereeInferenceParametersConfig,
} from '@/components/inference'
import { useInferenceData } from '@/components/inference/hooks/useInferenceData'
import { useDatasetVersions } from '@/components/inference/hooks/useDatasetVersions'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'

const { Text } = Typography
const { TextArea } = Input
const { Option } = Select

const createLimitValidator = (
  form: any,
  requestFieldPath: (string | number)[],
  errorMessage: string,
) => {
  return (_: any, value: number) => {
    const requestValue = form.getFieldValue(requestFieldPath)
    if (value && requestValue !== undefined && value < requestValue) {
      return Promise.reject(new Error(errorMessage))
    }
    return Promise.resolve()
  }
}

interface CreateAutoEvaluationTaskProps {
  evaluationPrefix?: string
}

const CreateAutoEvaluationTask: React.FC<CreateAutoEvaluationTaskProps> = ({ evaluationPrefix }) => {
  const navigate = useNavigate()
  const { projectId } = useParams()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()

  // 获取克隆任务ID（从location state）
  const cloneTaskId = location.state?.cloneTaskId
  // 获取重新评估任务ID（从location state）
  const restartTaskId = location.state?.restartTaskId
  // 获取编辑任务ID（从location state）
  const editTaskId = location.state?.editTaskId
  // 获取推理结果集ID（从location state，用于从推理结果集页面跳转过来时自动选中）
  const inferenceDatasetId = location.state?.inferenceDatasetId
  // 获取数据集类型（从location state，用于回显评估类别）
  const datasetType = searchParams.get('dataset_type') || location.state?.dataset_type
  // 获取usage，用于区分业务和普通推理结果集
  // 将 "business-inference" 转换为 "BUSSINESS" 以匹配接口要求
  const rawUsage = location.state?.usage || evaluationPrefix
  const usage = rawUsage === 'business-inference' ? 'BUSSINESS' : rawUsage
  // 存储上一次的 inferenceDatasetId，用于检测变化
  const prevInferenceDatasetIdRef = useRef<number | undefined>(undefined)
  const [evaluationDataSource, setEvaluationDataSource] = useState<string>('existing')
  const [evaluationMethod, setEvaluationMethod] = useState<string[]>(['referee'])
  const [evaluationCategory, setEvaluationCategory] = useState<EvaluationDatasetType>('text-generation') // 评估类别：text-generation=文本生成，image-understanding=图像理解，image-generation=图像生成
  const isImageGeneration = evaluationCategory === 'image-generation'
  const imageGenerationDatasetFormatQuery = isImageGeneration ? { dataset_format: ['image-prompt'] } : {}

  // 弹窗状态
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [selectedMetricId, setSelectedMetricId] = useState<number | null>(null)
  const [selectedMetricsMapping, setSelectedMetricsMapping] = useState<Record<string, string>>({})
  const [editingMetricKey, setEditingMetricKey] = useState<string | null>(null) // 编辑中的指标

  const [currentInferenceDataset, setCurrentInferenceDataset] = useState<string[]>([])

  // 级联选择器相关状态
  const [refereeType, setRefereeType] = useState<string>('')
  const [refereeModelId, setRefereeModelId] = useState<number | null>(null)
  const [cascaderOptions, setCascaderOptions] = useState<any[]>([])
  const [loadingCascader, setLoadingCascader] = useState(false)
  const [cascaderValue, setCascaderValue] = useState<any[] | undefined>(undefined)

  // GPU资源配置相关状态
  const [gpuCascaderOptions, setGpuCascaderOptions] = useState<any[]>([])
  const [gpuTypeHelp, setGpuTypeHelp] = useState<string>('')

  const [scheduleEnabled, setScheduleEnabled] = useState<boolean>(false)

  // 存储推理结果集信息（单个评估）
  const [selectedInferenceDataset, setSelectedInferenceDataset] = useState<{
    id: number
    modelId: number
    name?: string
    evaluated_model_source?: string
  } | null>(null)

  // 存储推理结果集信息（对比评估 - 多选）
  const [selectedInferenceDatasets, setSelectedInferenceDatasets] = useState<Array<{
    id: number
    modelId: number
    modelName?: string
    name?: string
    evaluated_model_source?: string
  }>>([])

  // 存储推理结果集的元数据字段（用于数据字段关联）
  const [availableMetricsFields, setAvailableMetricsFields] = useState<string[]>([])

  // 存储source_dataset_id筛选条件（用于对比评估时的数据集筛选）
  const [sourceDatasetIdFilter, setSourceDatasetIdFilter] = useState<number | null>(null)

  // 新建推理结果集相关状态
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [selectedServicesObjs, setSelectedServicesObjs] = useState<any[]>([])
  const [selectedDatasetForNew, setSelectedDatasetForNew] = useState<any | null>(null)
  const [selectedDatasetSourceForNew, setSelectedDatasetSourceForNew] = useState<string | null>(null)
  const [selectedDatasetVersionForNew, setSelectedDatasetVersionForNew] = useState<string | null>(null)
  const [selectedDatasetVersionObjForNew, setSelectedDatasetVersionObjForNew] = useState<any | null>(null)

  // 业务效果评估-新建推理结果集（第三方 API + 业务测试数据集）相关状态
  // 业务效果评估-新建推理：支持单个/对比（多选最多5个），统一用数组 + 按 apiId 存储的 binding/mappings
  const [selectedApiIdsForBusiness, setSelectedApiIdsForBusiness] = useState<number[]>([])
  const [selectedApisObjsForBusiness, setSelectedApisObjsForBusiness] = useState<any[]>([])
  const [selectedBusinessTestDatasetForBusiness, setSelectedBusinessTestDatasetForBusiness] = useState<any | null>(null)
  const [apiBindingFieldsByApiIdForBusiness, setApiBindingFieldsByApiIdForBusiness] = useState<
    Record<number, BusinessApiBindingFields>
  >({})
  const [requestMappingsByApiIdForBusiness, setRequestMappingsByApiIdForBusiness] = useState<Record<number, BusinessMappingItem[]>>({})
  const [responseMappingsByApiIdForBusiness, setResponseMappingsByApiIdForBusiness] = useState<Record<number, BusinessMappingItem[]>>({})
  const [businessTestDatasetMetadataFieldsForBusiness, setBusinessTestDatasetMetadataFieldsForBusiness] = useState<Array<string | { name?: string, jsonpath?: string }>>([])
  const [loadingBindingFieldsForBusiness, setLoadingBindingFieldsForBusiness] = useState(false)
  const [loadingMetadataForBusiness, setLoadingMetadataForBusiness] = useState(false)

  /** 由已选数据推导：已有推理结果集多于1个为对比；新建时服务/API多于1个为对比 */
  const evaluationType = useMemo((): 'single' | 'comparison' => {
    if (evaluationDataSource === 'existing') {
      return selectedInferenceDatasets.length > 1 ? 'comparison' : 'single'
    }
    if (evaluationPrefix === 'BUSSINESS') {
      return selectedApiIdsForBusiness.length > 1 ? 'comparison' : 'single'
    }
    return selectedServices.length > 1 ? 'comparison' : 'single'
  }, [
    evaluationDataSource,
    evaluationPrefix,
    selectedInferenceDatasets.length,
    selectedApiIdsForBusiness.length,
    selectedServices.length,
  ])

  // 使用 useInferenceData hook 获取推理数据（仅当选择新建推理结果集时）
  const datasetTypeForNewInference = evaluationDataSource === 'new' ? evaluationCategory : undefined
  const modelTypeForNewInference = evaluationDataSource === 'new' ? evaluationCategory : undefined

  const {
    inferenceServices,
    datasetCascaderOptions,
    setDatasetCascaderOptions,
    loading: inferenceDataLoading,
  } = useInferenceData(projectId, datasetTypeForNewInference, modelTypeForNewInference)

  // 下拉数据来自按类别过滤的 hook；回显对象可能不在其中，合并已选对象避免 Select 空白
  const inferenceServicesForSelect = useMemo(() => {
    const out = [...inferenceServices]
    const exists = (s) =>
      out.some((x) => (x.id != null && s.id != null && x.id === s.id) || (x.name && s.name && x.name === s.name))
    for (const obj of selectedServicesObjs) {
      if (obj && !exists(obj))
        out.push(obj)
    }
    return out
  }, [inferenceServices, selectedServicesObjs])

  // 业务效果评估-新建推理：第三方 API 列表
  const isBusinessNewInference = evaluationPrefix === 'BUSSINESS' && evaluationDataSource === 'new'
  const { data: apiListDataForBusiness, isLoading: loadingApiListForBusiness } = useQuery({
    queryKey: ['api-list', projectId],
    queryFn: () => apiService.getApiList(Number(projectId!), { page_num: 1, page_size: 100, status: '连接成功' }),
    enabled: !!projectId && !isNaN(Number(projectId)) && isBusinessNewInference,
    staleTime: 0,
    gcTime: 0,
  })
  const apiOptionsForBusiness = useMemo(() => {
    if (!apiListDataForBusiness?.items) return []
    return apiListDataForBusiness.items.map((item: any) => ({ label: item.name, value: item.id }))
  }, [apiListDataForBusiness])

  const { loadDatasetVersions } = useDatasetVersions(
    projectId,
    datasetCascaderOptions,
    setDatasetCascaderOptions,
  )

  // 处理新建推理结果集的服务选择变化
  const handleNewInferenceServicesChange = (serviceNames: string[]) => {
    const names = Array.isArray(serviceNames) ? serviceNames : (serviceNames ? [serviceNames] : [])
    if (names.length > 5) {
      message.warning('最多只能选择5个服务')
      return
    }
    setSelectedServices(names)
    // 保存选中的服务对象
    const serviceObjs = names.map((name) =>
      inferenceServicesForSelect.find((s) => s.name === name),
    ).filter(Boolean)
    setSelectedServicesObjs(serviceObjs)
  }

  // 处理新建推理结果集的数据集选择变化（级联选择器）
  const handleNewDatasetCascaderChange = async (value: any[], selectedOptions?: any[]) => {
    if (!value || value.length === 0) {
      setSelectedDatasetForNew(null)
      setSelectedDatasetSourceForNew(null)
      setSelectedDatasetVersionForNew(null)
      setSelectedDatasetVersionObjForNew(null)
      setAvailableMetricsFields([]) // 清空元数据字段
      return
    }

    // value格式: [分类, 数据集名称, 版本]
    if (value.length >= 2 && selectedOptions && selectedOptions.length >= 2) {
      // 保存数据集来源（分类）
      if (selectedOptions[0] && selectedOptions[0].label) {
        setSelectedDatasetSourceForNew(selectedOptions[0].label)
      }

      const datasetOption = selectedOptions[1]
      // 从级联选择器选项中获取数据集对象
      if (datasetOption) {
        setSelectedDatasetForNew(datasetOption)
      }

      // 如果有版本选择，获取版本对象
      if (value.length >= 3 && selectedOptions.length >= 3 && selectedOptions[2]) {
        const versionOption = selectedOptions[2]
        const version = value[2]
        const versionData = versionOption.versionData // 从选项中获取完整的版本数据对象

        setSelectedDatasetVersionForNew(version)
        setSelectedDatasetVersionObjForNew(versionData || null)

        // 选择完数据集版本后，调用接口获取元数据字段（同"已有推理结果集"的逻辑）
        if (projectId && versionData?.id) {
          try {
            const metadataFields = await inferenceDatasetsServices.getDatasetIndicators(
              Number(projectId),
              Number(versionData.id),
            )
            // 存储元数据字段列表
            const fields = metadataFields?.fields || metadataFields || []
            setAvailableMetricsFields(Array.isArray(fields) ? fields : [])
          }
          catch (error) {
            console.error('获取数据集元数据字段失败:', error)
            // 接口报错时，将元数据列表设置为空数组
            setAvailableMetricsFields([])
          }
        }
      }
      else {
        setSelectedDatasetVersionForNew(null)
        setSelectedDatasetVersionObjForNew(null)
        setAvailableMetricsFields([]) // 未选择版本时，清空元数据字段
      }
    }
  }

  // 级联选择器搜索过滤（只允许搜索分类和数据集名称，不允许搜索版本）
  const filterNewDatasetCascader = (inputValue: string, path: any[]) => {
    // 只在前两级（分类和数据集）进行搜索
    return path.slice(0, 2).some((option) =>
      (option.label || '').toLowerCase().includes(inputValue.toLowerCase()),
    )
  }

  // 清空推理结果集相关状态的公共函数
  const clearInferenceDatasetStates = (options?: { clearSingleDataset?: boolean }) => {
    form.setFieldsValue({ inferenceResultDatasetId: undefined })
    setCurrentInferenceDataset([])
    setSelectedInferenceDatasets([])
    setAvailableMetricsFields([])
    if (options?.clearSingleDataset) {
      setSelectedInferenceDataset(null)
    }
  }

  // 清空新建推理结果集相关的数据
  const clearNewInferenceStates = () => {
    setSelectedServices([])
    setSelectedServicesObjs([])
    setSelectedDatasetForNew(null)
    setSelectedDatasetSourceForNew(null)
    setSelectedDatasetVersionForNew(null)
    setSelectedDatasetVersionObjForNew(null)
    setAvailableMetricsFields([]) // 清空元数据字段
    form.setFieldsValue({
      services_to_infer: undefined,
      data_to_infer: undefined,
    })
    // 业务效果评估-新建推理：清空 API / 业务测试数据集相关状态
    if (evaluationPrefix === 'BUSSINESS') {
      setSelectedApiIdsForBusiness([])
      setSelectedApisObjsForBusiness([])
      setSelectedBusinessTestDatasetForBusiness(null)
      setApiBindingFieldsByApiIdForBusiness({})
      setRequestMappingsByApiIdForBusiness({})
      setResponseMappingsByApiIdForBusiness({})
      setBusinessTestDatasetMetadataFieldsForBusiness([])
      form.setFieldsValue({ business_eval_api: undefined, business_eval_business_test_dataset: undefined })
    }
  }

  // 业务效果评估-新建推理：第三方 API 选择变化（单个评估选一个，对比评估可多选最多5个）
  const handleBusinessApisChange = async (apiIds: number[], evaluationTypeOverride?: string) => {
    if (!projectId || isNaN(Number(projectId))) {
      setSelectedApiIdsForBusiness([])
      setSelectedApisObjsForBusiness([])
      setApiBindingFieldsByApiIdForBusiness({})
      setRequestMappingsByApiIdForBusiness({})
      setResponseMappingsByApiIdForBusiness({})
      const currentEvaluationType = evaluationTypeOverride ?? evaluationType
      form.setFieldsValue({ business_eval_api: currentEvaluationType === 'comparison' ? [] : undefined })
      return
    }
    const currentEvaluationType = evaluationTypeOverride ?? evaluationType
    const isComparison = currentEvaluationType === 'comparison'
    let ids = Array.isArray(apiIds) ? apiIds : []
    if (isComparison && ids.length > 5) {
      message.warning('最多只能选择5个第三方API服务')
      ids = ids.slice(0, 5)
    }
    if (!isComparison && ids.length > 1) ids = ids.slice(0, 1)

    const idSet = new Set(ids.map((id) => Number(id)))
    const apis = (apiListDataForBusiness?.items || []).filter((item: any) => idSet.has(Number(item.id)))
    setSelectedApiIdsForBusiness(ids)
    setSelectedApisObjsForBusiness(apis)

    const prevIds = selectedApiIdsForBusiness
    const newIds = ids.filter((id) => !prevIds.includes(id))
    const removedIds = prevIds.filter((id) => !ids.includes(id))

    setLoadingBindingFieldsForBusiness(true)
    const nextBinding: typeof apiBindingFieldsByApiIdForBusiness = { ...apiBindingFieldsByApiIdForBusiness }
    const nextRequest: Record<number, BusinessMappingItem[]> = { ...requestMappingsByApiIdForBusiness }
    const nextResponse: Record<number, BusinessMappingItem[]> = { ...responseMappingsByApiIdForBusiness }
    removedIds.forEach((id) => {
      delete nextBinding[id]
      delete nextRequest[id]
      delete nextResponse[id]
    })

    try {
      for (const apiId of newIds) {
        const fields = await apiService.getApiBindingFields(Number(projectId), apiId)
        const requestOptions = (fields.request_binding || []).map((field: any) => ({
          label: `${field.desc || field.name || ''} (${field.name || ''})`,
          value: field.name || '',
          name: field.name || '',
          jsonpath: field.jsonpath || '',
        }))
        const responseOptions = (fields.response_binding || []).map((field: any) => ({
          label: `${field.desc || field.name || ''} (${field.name || ''})`,
          value: field.name || '',
          name: field.name || '',
          jsonpath: field.jsonpath || '',
        }))
        nextBinding[apiId] = { request_binding: requestOptions, response_binding: responseOptions }
        nextRequest[apiId] = (fields.request_binding || []).map((field: any) => ({
          sourceField: field.name ?? '',
          targetField: '',
        }))
        nextResponse[apiId] = (fields.response_binding || []).map((field: any) => ({
          sourceField: '',
          targetField: field.name ?? '',
        }))
      }
      setApiBindingFieldsByApiIdForBusiness(nextBinding)
      setRequestMappingsByApiIdForBusiness(nextRequest)
      setResponseMappingsByApiIdForBusiness(nextResponse)
    }
    catch (error) {
      console.error('获取API绑定字段失败:', error)
      message.error('获取API绑定字段失败，请稍后重试')
    }
    finally {
      setLoadingBindingFieldsForBusiness(false)
    }
  }

  /** 任务详情回显：仅有数据集名与 id 时补全级联值并拉元数据 */
  const hydrateBusinessTestDatasetFromTask = async (datasetName: string, datasetId: number) => {
    if (!projectId || isNaN(Number(projectId))) return
    try {
      const raw = await trainingDatasetService.detail(Number(projectId), datasetName, 'business_test', 'completed')
      const list = Array.isArray(raw) ? raw : [raw]
      const first = list[0] as TrainingDatasetItem & { version?: string }
      const ver = first?.version ?? (first as any)?.versions?.[0]?.version ?? first?.latest_version ?? ''
      form.setFieldsValue({ business_eval_business_test_dataset: ['business_test', datasetName, ver] })
      setSelectedBusinessTestDatasetForBusiness({
        ...first,
        id: datasetId,
        dataset_name: datasetName,
        usage: 'business_test',
      })
      setLoadingMetadataForBusiness(true)
      try {
        const metadataFields = await apiService.getBusinessInferenceMetadataFields(Number(projectId), datasetId)
        const arr = Array.isArray(metadataFields) ? metadataFields : []
        setBusinessTestDatasetMetadataFieldsForBusiness(arr)
        setRequestMappingsByApiIdForBusiness((prev) => {
          const next = { ...prev }
          Object.keys(next).forEach((apiId) => {
            next[Number(apiId)] = next[Number(apiId)].map((m) => ({ ...m, targetField: '' }))
          })
          return next
        })
      }
      catch {
        setBusinessTestDatasetMetadataFieldsForBusiness([])
        setRequestMappingsByApiIdForBusiness((prev) => {
          const next = { ...prev }
          Object.keys(next).forEach((apiId) => {
            next[Number(apiId)] = next[Number(apiId)].map((m) => ({ ...m, targetField: '' }))
          })
          return next
        })
      }
      finally {
        setLoadingMetadataForBusiness(false)
      }
    }
    catch (e) {
      console.error('回显业务测试数据集失败:', e)
    }
  }

  // 业务效果评估-新建推理：业务测试数据集（DatasetCascaderSelector：[usage, dataset_name, version]）
  const handleBusinessTestDatasetChange = async (value?: any[], selectedOptions?: any[]) => {
    if (!projectId || isNaN(Number(projectId))) {
      setBusinessTestDatasetMetadataFieldsForBusiness([])
      setSelectedBusinessTestDatasetForBusiness(null)
      setRequestMappingsByApiIdForBusiness((prev) => {
        const next = { ...prev }
        Object.keys(next).forEach((apiId) => {
          next[Number(apiId)] = next[Number(apiId)].map((m) => ({ ...m, targetField: '' }))
        })
        return next
      })
      form.setFieldsValue({ business_eval_business_test_dataset: undefined })
      return
    }
    if (!value || value.length < 3 || !selectedOptions?.[1]) {
      setBusinessTestDatasetMetadataFieldsForBusiness([])
      setSelectedBusinessTestDatasetForBusiness(null)
      setRequestMappingsByApiIdForBusiness((prev) => {
        const next = { ...prev }
        Object.keys(next).forEach((apiId) => {
          next[Number(apiId)] = next[Number(apiId)].map((m) => ({ ...m, targetField: '' }))
        })
        return next
      })
      form.setFieldsValue({ business_eval_business_test_dataset: undefined })
      return
    }
    const dataset = (selectedOptions[1] as { data?: TrainingDatasetItem }).data
    setSelectedBusinessTestDatasetForBusiness(dataset || null)
    setLoadingMetadataForBusiness(true)
    try {
      const datasetId = dataset?.id
      if (datasetId == null) {
        setBusinessTestDatasetMetadataFieldsForBusiness([])
        return
      }
      const metadataFields = await apiService.getBusinessInferenceMetadataFields(Number(projectId), Number(datasetId))
      const fields = metadataFields || []
      const arr = Array.isArray(fields) ? fields : []
      setBusinessTestDatasetMetadataFieldsForBusiness(arr)
      setRequestMappingsByApiIdForBusiness((prev) => {
        const next = { ...prev }
        Object.keys(next).forEach((apiId) => {
          next[Number(apiId)] = next[Number(apiId)].map((m) => ({ ...m, targetField: '' }))
        })
        return next
      })
    }
    catch {
      setBusinessTestDatasetMetadataFieldsForBusiness([])
      setRequestMappingsByApiIdForBusiness((prev) => {
        const next = { ...prev }
        Object.keys(next).forEach((apiId) => {
          next[Number(apiId)] = next[Number(apiId)].map((m) => ({ ...m, targetField: '' }))
        })
        return next
      })
    }
    finally {
      setLoadingMetadataForBusiness(false)
    }
  }

  // 处理评估数据来源切换
  const handleEvaluationDataSourceChange = (newValue: string) => {
    setEvaluationDataSource(newValue)
    // 切换数据来源时，清空对应的状态
    if (newValue === 'existing') {
      // 切换到已有推理结果集时，清空新建推理结果集的状态
      clearNewInferenceStates()
    }
    else {
      // 切换到新建推理结果集时，清空已有推理结果集的状态
      clearInferenceDatasetStates({ clearSingleDataset: true })
    }
  }

  // 查询评估指标列表
  const { data: metricsData, isLoading: metricsLoading } = useQuery({
    queryKey: ['projectMetrics', projectId],
    queryFn: async () => {
      if (!projectId) return { items: [], total: 0 }
      const result = await modelEvaluationServices.getProjectMetrics(
        Number(projectId),
        { page: 1, size: 100 },
      )
      return result
    },
    enabled: !!projectId && isModalVisible,
    staleTime: 0, // 数据立即过期，确保每次都会重新获取
    refetchOnMount: true, // 组件挂载时重新获取
    refetchOnWindowFocus: false, // 窗口聚焦时不重新获取（可选，根据需要设置）
  })

  const availableMetrics = metricsData?.items || []

  /** 已有推理结果集：弹窗未打开时的展示名（克隆/编辑回显） */
  const inferenceResultDisplayLabel = useMemo(() => {
    if (evaluationType === 'comparison') {
      if (selectedInferenceDatasets.length === 0) return ''
      return selectedInferenceDatasets.map((d) => d.name || `推理结果集${d.id}`).join('、')
    }
    return selectedInferenceDataset?.name || ''
  }, [evaluationType, selectedInferenceDatasets, selectedInferenceDataset])

  // 处理推理结果集选择变化（单个评估）
  const handleInferenceDatasetChange = async (datasetId: number | undefined) => {
    if (!projectId) return

    // 如果清空了选择，重置状态
    if (!datasetId) {
      setSelectedInferenceDataset(null)
      setCurrentInferenceDataset([])
      setAvailableMetricsFields([])
      return
    }

    try {
      const [details, metadataFields] = await Promise.all([
        inferenceDatasetsServices.getInferenceDatasetDetails(
          Number(projectId),
          datasetId,
        ),
        inferenceDatasetsServices.getInferenceDatasetIndicators(
          Number(projectId),
          datasetId,
          usage,
        ),
      ])

      // console.log('单选', details)

      setCurrentInferenceDataset([details.model_name])

      // 存储推理结果集信息
      setSelectedInferenceDataset({
        id: datasetId,
        modelId: details.model_id || 0,
        name: details.name,
        evaluated_model_source: details.model_source,
      })

      // 存储元数据字段列表
      const fields = metadataFields?.fields || metadataFields || []
      setAvailableMetricsFields(Array.isArray(fields) ? fields : [])

      if (evaluationPrefix === 'BUSSINESS') {
        setSelectedJudgeMetrics([])
        setSelectedBasicMetrics([])
      }
    }
    catch (error) {
      console.error('获取推理结果集信息失败:', error)
      // message.error('获取推理结果集元数据失败');
      // 接口报错时，将元数据列表设置为空数组
      setAvailableMetricsFields([])
    }
  }

  // 处理推理结果集选择变化（对比评估 - 多选）
  const handleInferenceDatasetsChange = async (datasetIds: number[]) => {
    if (!projectId) return

    // 如果清空了选择，重置状态
    if (datasetIds.length === 0) {
      setSelectedInferenceDatasets([])
      setCurrentInferenceDataset([])
      setAvailableMetricsFields([])
      setSourceDatasetIdFilter(null) // 重置筛选条件
      return
    }

    try {
      // 获取所有选中数据集的详情和元数据字段
      const detailsPromises = datasetIds.map((datasetId) =>
        inferenceDatasetsServices.getInferenceDatasetDetails(
          Number(projectId),
          datasetId,
        ),
      )
      // 获取第一个数据集的元数据字段（用于数据字段关联）
      const metadataFieldsPromise = inferenceDatasetsServices.getInferenceDatasetIndicators(
        Number(projectId),
        datasetIds[0],
        usage,
      )

      const [detailsArray, metadataFields] = await Promise.all([
        Promise.all(detailsPromises),
        metadataFieldsPromise,
      ])

      // console.log('多选', detailsArray, detailsArray[0].model_source)

      // 检查所有已选数据集的source_dataset_id
      const sourceDatasetIds = detailsArray.map((details) => details?.source_dataset_id)
      const nonNullSourceDatasetIds = sourceDatasetIds.filter(
        (id) => id !== null && id !== undefined,
      )

      // 根据所有已选数据集的source_dataset_id进行筛选
      let newFilter: number | null
      if (nonNullSourceDatasetIds.length === 0) {
        newFilter = null
      }
      else {
        const uniqueSourceDatasetIds = [...new Set(nonNullSourceDatasetIds)]
        if (uniqueSourceDatasetIds.length === 1) {
          newFilter = uniqueSourceDatasetIds[0] as number
        }
        else {
          newFilter = null
        }
      }

      // 如果筛选条件发生变化，更新筛选条件（弹窗内列表由 DatasetCascaderSelector 自行请求）
      if (newFilter !== sourceDatasetIdFilter) {
        setSourceDatasetIdFilter(newFilter)
      }

      // 构建推理结果集信息数组
      const datasetsInfo = detailsArray.map((details, index) => ({
        id: datasetIds[index],
        modelId: details.model_id || 0,
        modelName: details.model_name,
        name: details.name,
        evaluated_model_source: details.model_source,
      }))

      setSelectedInferenceDatasets(datasetsInfo)
      setCurrentInferenceDataset(detailsArray.map((d) => d.model_name))

      // 存储元数据字段列表（使用第一个数据集的元数据）
      const fields = metadataFields?.fields || metadataFields || []
      setAvailableMetricsFields(Array.isArray(fields) ? fields : [])

      if (evaluationPrefix === 'BUSSINESS') {
        setSelectedJudgeMetrics([])
        setSelectedBasicMetrics([])
      }
    }
    catch (error) {
      console.error('获取推理结果集信息失败:', error)
      message.error('获取推理结果集信息失败')
      // 接口报错时，将元数据列表设置为空数组
      setAvailableMetricsFields([])
    }
  }

  /** 已有推理结果集 DatasetCascaderSelector：单选 / 多选推理结果集 */
  const handleExistingInferenceResultDatasetChange = (
    value: number | number[] | undefined,
    _second?: unknown,
  ) => {
    const clearExistingInferenceSelection = () => {
      setSelectedInferenceDataset(null)
      setSelectedInferenceDatasets([])
      setCurrentInferenceDataset([])
      setAvailableMetricsFields([])
      setSourceDatasetIdFilter(null)
    }
    switch (true) {
      case value == null:
        clearExistingInferenceSelection()
        break
      case Array.isArray(value) && value.length === 0:
        clearExistingInferenceSelection()
        break
      case Array.isArray(value) && value.length === 1:
        setSelectedInferenceDatasets([])
        handleInferenceDatasetChange(value[0])
        break
      case Array.isArray(value):
        setSelectedInferenceDataset(null)
        handleInferenceDatasetsChange(value)
        break
      case typeof value === 'number':
        setSelectedInferenceDatasets([])
        handleInferenceDatasetChange(value)
        break
      default:
        break
    }
  }

  // 处理评估类别切换
  const handleEvaluationCategoryChange = (value: string) => {
    const nextCategory = value as EvaluationDatasetType
    setEvaluationCategory(nextCategory)
    form.setFieldsValue({ evaluationCategory: value })
    if (nextCategory === 'image-generation' && evaluationMethod.includes('basic_metric')) {
      const nextMethods = evaluationMethod.filter((method) => method !== 'basic_metric')
      setEvaluationMethod(nextMethods.length > 0 ? nextMethods : ['referee'])
      form.setFieldsValue({ evaluationMethod: nextMethods.length > 0 ? nextMethods : ['referee'] })
      setSelectedBasicMetrics([])
    }
    // 切换评估类别时，清空推理结果集选择
    setSelectedInferenceDataset(null)
    setSelectedInferenceDatasets([])
    setCurrentInferenceDataset([])
    setAvailableMetricsFields([])
    setSourceDatasetIdFilter(null) // 重置筛选条件
    form.setFieldsValue({ inferenceResultDatasetId: undefined })
    // 清空新建推理结果集的数据
    clearNewInferenceStates()
    // 切换评估类别时，清空选择裁判模型/服务
    clearCascaderValue()
    setRefereeType('')
    setRefereeModelId(null)
  }

  // 初始化级联选择器的第一级数据
  useEffect(() => {
    setCascaderOptions([
      {
        value: 'service',
        label: '在线服务',
        isLeaf: false,
      },
      {
        value: 'model',
        label: '模型仓库',
        isLeaf: false,
      },
    ])
  }, [])

  // 根据 dataset_type 回显评估类别
  useEffect(() => {
    if (datasetType && !cloneTaskId && !restartTaskId && !editTaskId) {
      // 如果 evaluationPrefix 为 BUSSINESS，强制使用 text-generation
      const categoryValue = evaluationPrefix === 'BUSSINESS'
        ? 'text-generation'
        : (['text-generation', 'image-understanding', 'image-generation'].includes(datasetType) ? datasetType : 'text-generation')
      setEvaluationCategory(categoryValue)
      form.setFieldsValue({ evaluationCategory: categoryValue })
    }
  }, [datasetType, cloneTaskId, restartTaskId, editTaskId, evaluationPrefix, form])

  // 当 evaluationPrefix 为 BUSSINESS时 防止直接更改url中dataset_type为非文本生成
  useEffect(() => {
    if (evaluationPrefix === 'BUSSINESS' && evaluationCategory !== 'text-generation') {
      setEvaluationCategory('text-generation')
      form.setFieldsValue({ evaluationCategory: 'text-generation' })
      // 切换评估类别时，清空推理结果集选择
      setSelectedInferenceDataset(null)
      setSelectedInferenceDatasets([])
      setCurrentInferenceDataset([])
      setAvailableMetricsFields([])
    }
  }, [evaluationPrefix, evaluationCategory, form])

  // 自动选中单个评估的推理结果集
  const autoSelectSingleDataset = (datasetId: number, hasChanged: boolean) => {
    const currentSelectedId = selectedInferenceDataset?.id
    const needsAutoSelect = hasChanged || currentSelectedId !== datasetId

    if (!needsAutoSelect) return

    prevInferenceDatasetIdRef.current = datasetId
    form.setFieldsValue({ inferenceResultDatasetId: datasetId })
    handleInferenceDatasetChange(datasetId)
  }

  // 自动选中对比评估的推理结果集
  const autoSelectComparisonDatasets = (datasetId: number, hasChanged: boolean) => {
    const currentSelectedIds = selectedInferenceDatasets.map((d) => d.id)
    const needsAutoSelect = hasChanged || !currentSelectedIds.includes(datasetId)

    if (!needsAutoSelect) return

    prevInferenceDatasetIdRef.current = datasetId
    const newDatasetIds = currentSelectedIds.includes(datasetId)
      ? currentSelectedIds
      : [...currentSelectedIds, datasetId]
    form.setFieldsValue({ inferenceResultDatasetId: newDatasetIds })
    handleInferenceDatasetsChange(newDatasetIds)
  }

  // 执行自动选中逻辑
  const executeAutoSelect = () => {
    const hasChanged = prevInferenceDatasetIdRef.current !== inferenceDatasetId

    // 前置条件检查
    if (!inferenceDatasetId || cloneTaskId || restartTaskId || editTaskId || !projectId || evaluationDataSource !== 'existing') {
      if (hasChanged) {
        prevInferenceDatasetIdRef.current = inferenceDatasetId
      }
      return
    }

    // 根据评估类型执行相应的自动选中逻辑（列表由选择弹窗内请求，此处直接按 id 拉详情）
    if (evaluationType === 'single') {
      autoSelectSingleDataset(inferenceDatasetId, hasChanged)
    }
    else if (evaluationType === 'comparison') {
      autoSelectComparisonDatasets(inferenceDatasetId, hasChanged)
    }
  }

  // 从路由带入 inferenceDatasetId 时重置 ref，便于自动选中
  useEffect(() => {
    if (inferenceDatasetId) {
      prevInferenceDatasetIdRef.current = undefined
    }
  }, [inferenceDatasetId])

  // 从推理结果集页面跳转过来时，自动选中对应的推理结果集
  useEffect(() => {
    executeAutoSelect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inferenceDatasetId, cloneTaskId, restartTaskId, editTaskId, projectId, evaluationDataSource, evaluationType])

  // 克隆任务或重新评估或编辑：加载任务详情并填充表单
  const loadCloneTaskData = async () => {
    const taskId = cloneTaskId || restartTaskId || editTaskId
    if (!taskId || !projectId) return

    setLoadingCloneData(true)
    try {
      // 先加载任务详情，获取 dataset_type
      const taskDetail = await modelEvaluationServices.getProjectEvaluationTaskDetail(
        Number(projectId),
        taskId,
      )

      // 生成带时间戳的任务名称
      const timestamp = dayjs().format('YYYYMMDDHHmmss')
      // 如果是重新评估或编辑，使用原任务名称；如果是克隆，添加时间戳后缀
      const newTaskName = (restartTaskId || editTaskId) ? taskDetail.name : `${taskDetail.name}_${timestamp}`

      setEvaluationDataSource(taskDetail.data_source)

      // 设置评估类别（根据 dataset_type 映射）
      // 如果 evaluationPrefix 为 BUSSINESS，强制使用 text-generation
      const categoryValue = evaluationPrefix === 'BUSSINESS'
        ? 'text-generation'
        : (['text-generation', 'image-understanding', 'image-generation'].includes(taskDetail.dataset_type || '') ? taskDetail.dataset_type as EvaluationDatasetType : 'text-generation')
      setEvaluationCategory(categoryValue)

      // 设置评估方法
      if (categoryValue === 'image-generation') {
        setEvaluationMethod(['referee'])
      }
      else if (taskDetail.evaluation_method === 'all') {
        setEvaluationMethod(['referee', 'basic_metric'])
      }
      else if (taskDetail.evaluation_method === 'referee') {
        setEvaluationMethod(['referee'])
      }
      else if (taskDetail.evaluation_method === 'basic_metric') {
        setEvaluationMethod(['basic_metric'])
      }

      // 设置表单基本字段
      form.setFieldsValue({
        name: newTaskName,
        description: taskDetail.description || '',
        evaluationDataSource: taskDetail.data_source,
        evaluationCategory: categoryValue,
      })

      // 处理定时任务配置
      if (taskDetail.schedule_at) {
        // schedule_at 格式：YYYY-MM-DDTHH:mm:ss
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

      // 处理推理结果集
      if (taskDetail.data_source === 'new' && taskDetail.dataset_model_relations && taskDetail.dataset_model_relations.length > 0) {
        // 新建推理结果集：回显服务、推理参数和数据集
        const firstRelation = taskDetail.dataset_model_relations[0] as NewDatasetModelRelation

        // 回显待评估服务：一次拉全量「测试通过」列表再按 id/名称匹配（不按 model_type 过滤，避免漏匹配）
        if (projectId) {
          const relations = taskDetail.dataset_model_relations as NewDatasetModelRelation[]

          const toPositiveId = (v: unknown): number | undefined => {
            if (v === null || v === undefined || v === '') return undefined
            const n = typeof v === 'string' ? Number.parseInt(v, 10) : Number(v)
            if (Number.isNaN(n) || n <= 0) return undefined
            return n
          }

          const serviceNameForRelation = (rel: NewDatasetModelRelation, index: number): string | undefined => {
            const direct = rel.online_service_name || rel.model_name || rel.evaluated_model_name
            if (typeof direct === 'string' && direct.trim()) return direct.trim()
            const fromTask = taskDetail.evaluated_model_names?.[index]
            if (typeof fromTask === 'string' && fromTask.trim()) return fromTask.trim()
            return undefined
          }

          const hasAnyServiceHint
            = relations.some((rel, i) => {
              const id = toPositiveId(rel.online_service_id) ?? toPositiveId(rel.evaluated_model_id)
              return id != null || !!serviceNameForRelation(rel, i)
            })
            || (relations.length === 1 && typeof taskDetail.referee_model_name === 'string' && !!taskDetail.referee_model_name.trim())

          if (hasAnyServiceHint) {
            try {
              const listRes = await inferenceServiceApi.list({
                projectId,
                page: 1,
                size: 100,
                status: '测试通过',
              })
              const pool = listRes.items || []
              const findById = (id: number) =>
                pool.find((item) => {
                  const sId = typeof item.id === 'string' ? Number.parseInt(item.id, 10) : Number(item.id)
                  return !Number.isNaN(sId) && sId === id
                })

              let selectedServiceObjs = relations.map((rel, i) => {
                const id = toPositiveId(rel.online_service_id) ?? toPositiveId(rel.evaluated_model_id)
                if (id != null) {
                  const byId = findById(id)
                  if (byId) return byId
                }
                const nm = serviceNameForRelation(rel, i)
                if (nm) {
                  const byName = pool.find((item) => item.name === nm)
                  if (byName) return byName
                }
                return undefined
              }).filter(Boolean)

              if (
                selectedServiceObjs.length === 0
                && relations.length === 1
                && taskDetail.referee_model_name?.trim()
              ) {
                const hit = pool.find((item) => item.name === taskDetail.referee_model_name.trim())
                if (hit) selectedServiceObjs = [hit]
              }

              if (selectedServiceObjs.length > 0) {
                const selectedServiceNames = selectedServiceObjs.map((s: any) => s.name)
                setSelectedServices(selectedServiceNames)
                setSelectedServicesObjs(selectedServiceObjs)
                form.setFieldsValue({
                  services_to_infer: selectedServiceNames,
                })
              }
            }
            catch (error) {
              console.error('获取服务列表失败:', error)
            }
          }
        }

        // 回显推理参数
        if (firstRelation.inference_params) {
          form.setFieldsValue({
            temperature: firstRelation.inference_params.temperature,
            top_p: firstRelation.inference_params.top_p,
            max_tokens: firstRelation.inference_params.max_tokens,
            presence_penalty: firstRelation.inference_params.presence_penalty,
          })
        }

        // 回显数据集选择
        if (firstRelation.source_dataset_name && projectId && firstRelation.source_dataset_id) {
          if (evaluationPrefix === 'BUSSINESS') {
            const apiSelectedIds = taskDetail.dataset_model_relations
              .map((relation: any) => relation.evaluated_model_id ?? relation.online_service_id)
              .map((id: any) => (typeof id === 'string' ? Number(id) : id))
              .filter((id: any): id is number => typeof id === 'number' && !Number.isNaN(id))
            await handleBusinessApisChange(apiSelectedIds, taskDetail.evaluation_type)
            form.setFieldsValue({
              business_eval_api: taskDetail.evaluation_type === 'single' ? apiSelectedIds[0] : apiSelectedIds,
            })

            await hydrateBusinessTestDatasetFromTask(firstRelation.source_dataset_name, firstRelation.source_dataset_id)
          }
          else {
            // 解析 source_dataset_name，格式：分类/数据集名称>版本
            const sourceNameParts = firstRelation.source_dataset_name.split('/')
            let categoryLabel = ''
            let datasetNameWithVersion = ''

            if (sourceNameParts.length >= 2) {
              categoryLabel = sourceNameParts[0]
              datasetNameWithVersion = sourceNameParts.slice(1).join('/')
            }
            else {
              datasetNameWithVersion = firstRelation.source_dataset_name
            }

            // 解析数据集名称和版本
            // eslint-disable-next-line regexp/no-misleading-capturing-group
            const versionMatch = datasetNameWithVersion.match(/^(.+)>(.+)$/)
            const datasetName = versionMatch ? versionMatch[1] : datasetNameWithVersion
            const datasetVersion = versionMatch ? versionMatch[2] : null

            // 映射中文分类标签到英文 usage
            const categoryMapping: Record<string, string> = {
              训练数据集: 'training',
              验证数据集: 'validation',
              测试数据集: 'test',
            }

            const usage = categoryMapping[categoryLabel] || 'training'

            // 获取数据集版本信息
            try {
              const datasetDetail = await trainingDatasetService.detail(
                Number(projectId),
                datasetName,
                usage,
              )

              const actualDatasetName = datasetDetail?.dataset_name || datasetName
              const cascaderValue = [
                categoryLabel,
                actualDatasetName,
                ...(datasetVersion ? [datasetVersion] : []),
              ]

              setTimeout(() => {
                form.setFieldsValue({ data_to_infer: cascaderValue })
              }, 800)

              setSelectedDatasetSourceForNew(categoryLabel)
              setSelectedDatasetForNew({ value: actualDatasetName, label: actualDatasetName })

              // 克隆回显：优先从 versions 中匹配版本对象；若未匹配到则用 source_dataset_id 构造最小对象，保证提交校验通过
              const versionObj = datasetVersion && datasetDetail.versions
                ? datasetDetail.versions.find((v: any) => v.version === datasetVersion)
                : null
              if (versionObj) {
                setSelectedDatasetVersionForNew(datasetVersion)
                setSelectedDatasetVersionObjForNew(versionObj)
                if (versionObj.id) {
                  try {
                    const metadataFields = await inferenceDatasetsServices.getDatasetIndicators(
                      Number(projectId),
                      Number(versionObj.id),
                    )
                    const fields = metadataFields?.fields || metadataFields || []
                    setAvailableMetricsFields(Array.isArray(fields) ? fields : [])
                  }
                  catch (error) {
                    console.error('获取数据集元数据字段失败:', error)
                    setAvailableMetricsFields([])
                  }
                }
              }
              else if (firstRelation.source_dataset_id != null) {
                setSelectedDatasetVersionForNew(datasetVersion || null)
                setSelectedDatasetVersionObjForNew({
                  id: firstRelation.source_dataset_id,
                  dataset_name: actualDatasetName,
                  version: datasetVersion,
                })
              }
            }
            catch (error) {
              console.error('获取数据集详情失败:', error)
            }
          }
        }
      }
      else if (taskDetail.dataset_model_relations && taskDetail.dataset_model_relations.length > 0) {
        // 已有推理结果集：过滤出已有推理结果集的关系
        const existingRelations = taskDetail.dataset_model_relations.filter(
          (r: any) => 'inference_result_dataset_id' in r,
        ) as Array<{ inference_result_dataset_id: number, evaluated_model_id: number }>

        if (existingRelations.length > 0) {
          // 等待状态更新完成后再设置表单值
          await new Promise((resolve) => setTimeout(resolve, 50))

          if (taskDetail.evaluation_type === 'single') {
            // 单个评估
            const relation = existingRelations[0]
            const datasetId = relation.inference_result_dataset_id

            // 加载推理结果集详情
            try {
              const [details, metadataFields] = await Promise.all([
                inferenceDatasetsServices.getInferenceDatasetDetails(
                  Number(projectId),
                  datasetId,
                ),
                inferenceDatasetsServices.getInferenceDatasetIndicators(
                  Number(projectId),
                  datasetId,
                  usage,
                ),
              ])

              // 只有成功获取到详情后才设置表单值
              form.setFieldsValue({ inferenceResultDatasetId: datasetId })
              setCurrentInferenceDataset([details.model_name])
              setSelectedInferenceDataset({
                id: datasetId,
                modelId: details.model_id || 0,
                name: details.name,
                evaluated_model_source: details.model_source,
              })

              const fields = metadataFields?.fields || metadataFields || []
              setAvailableMetricsFields(Array.isArray(fields) ? fields : [])
            }
            catch (error) {
              console.error('获取推理结果集信息失败:', error)
              // 获取失败时清空表单字段和状态
              clearInferenceDatasetStates({ clearSingleDataset: true })
            }
          }
          else {
            // 对比评估
            const datasetIds = existingRelations.map((r) => r.inference_result_dataset_id)

            // 加载多个推理结果集详情
            try {
              const detailsPromises = datasetIds.map((datasetId) =>
                inferenceDatasetsServices.getInferenceDatasetDetails(
                  Number(projectId),
                  datasetId,
                ),
              )

              const metadataFieldsPromise = inferenceDatasetsServices.getInferenceDatasetIndicators(
                Number(projectId),
                datasetIds[0],
                usage,
              )

              const [detailsArray, metadataFields] = await Promise.all([
                Promise.all(detailsPromises),
                metadataFieldsPromise,
              ])

              form.setFieldsValue({ inferenceResultDatasetId: datasetIds })
              const datasetsInfo = detailsArray.map((details, index) => ({
                id: datasetIds[index],
                modelId: details.model_id || 0,
                modelName: details.model_name,
                name: details.name,
                evaluated_model_source: details.model_source,
              }))

              setSelectedInferenceDatasets(datasetsInfo)
              setCurrentInferenceDataset(detailsArray.map((d) => d.model_name))

              const fields = metadataFields?.fields || metadataFields || []
              setAvailableMetricsFields(Array.isArray(fields) ? fields : [])
            }
            catch (error) {
              console.error('获取推理结果集信息失败:', error)
              clearInferenceDatasetStates()
            }
          }
        }
        else {
          // 找不到推理结果集，清空相关字段和状态
          clearInferenceDatasetStates({ clearSingleDataset: true })
        }
      }
      else {
        clearInferenceDatasetStates({ clearSingleDataset: true })
      }

      // 处理裁判员评估配置
      if (taskDetail.evaluation_method === 'referee' || taskDetail.evaluation_method === 'all') {
        if (taskDetail.referee_type) {
          setRefereeType(taskDetail.referee_type)
        }
        if (taskDetail.referee_model_id) {
          setRefereeModelId(taskDetail.referee_model_id)

          // 需要加载级联选择器的数据
          if (taskDetail.referee_type === 'service') {
            // 加载服务列表并更新级联选择器选项
            try {
              const result = await inferenceServiceApi.list({
                projectId,
                page: 1,
                size: 100,
                status: '测试通过',
                model_type: categoryValue,
              })
              const service = result.items?.find((item: any) => item.id === taskDetail.referee_model_id)
              const serviceChildren = result.items?.map((item: any) => ({
                value: item.id,
                label: item.name,
                data: item,
              })) || []

              if (service) {
                // 更新级联选择器选项
                setCascaderOptions([
                  {
                    value: 'service',
                    label: '在线服务',
                    isLeaf: false,
                    children: serviceChildren,
                    disabled: serviceChildren.length === 0,
                  },
                  {
                    value: 'model',
                    label: '模型仓库',
                    isLeaf: false,
                  },
                ])
                // 设置级联选择器的值
                const serviceValue = ['service', taskDetail.referee_model_id]
                setCascaderValue(serviceValue)
                form.setFieldsValue({ evaluationService: serviceValue })
              }
            }
            catch (error) {
              console.error('加载服务列表失败:', error)
            }
          }
          else if (taskDetail.referee_type === 'model') {
            // 加载模型列表并更新级联选择器选项
            try {
              const params: GetBaseModelsParams = {
                page: 1,
                size: 100,
                model_type: categoryValue,
              }
              const result = await ModelService.getBaseModels(params)
              const model = result.items?.find((item: any) => item.id === taskDetail.referee_model_id)
              const modelChildren = result.items?.map((item: any) => ({
                value: item.id,
                label: item.name,
                data: item,
              })) || []

              if (model) {
                // 更新级联选择器选项
                setCascaderOptions([
                  {
                    value: 'service',
                    label: '在线服务',
                    isLeaf: false,
                  },
                  {
                    value: 'model',
                    label: '模型仓库',
                    isLeaf: false,
                    children: modelChildren,
                    disabled: modelChildren.length === 0,
                  },
                ])
                // 设置级联选择器的值
                const modelValue = ['model', taskDetail.referee_model_id]
                setCascaderValue(modelValue)
                form.setFieldsValue({ evaluationService: modelValue })
              }
            }
            catch (error) {
              console.error('加载模型列表失败:', error)
            }
          }

          // 处理显卡资源配置（如果是离线模型）
          if (taskDetail.referee_type === 'model' && taskDetail.graphics_card_resource) {
            const gpuResource = taskDetail.graphics_card_resource
            // 设置GPU相关字段
            form.setFieldsValue({
              gpu_count: gpuResource.count,
              gpu_model: gpuResource.card_model,
              gpu_memory: gpuResource.card_memory,
              gpu_type: [gpuResource.card_type, gpuResource.k8s_resource_type], // 设置级联选择器的值
              graphics_card_resource: {
                cpu_request: gpuResource.cpu_request,
                cpu_limit: gpuResource.cpu_limit,
                memory_request: gpuResource.memory_request,
                memory_limit: gpuResource.memory_limit,
              },
            })
          }
        }

        // 处理推理参数配置
        if (taskDetail.referee_inference_params) {
          form.setFieldsValue({
            referee_temperature: taskDetail.referee_inference_params.temperature ?? 0.7,
            referee_top_p: taskDetail.referee_inference_params.top_p ?? 1.0,
            referee_max_tokens: taskDetail.referee_inference_params.max_tokens ?? 4096,
            referee_presence_penalty: taskDetail.referee_inference_params.presence_penalty ?? 0.0,
          })
        }

        // 处理评估指标配置
        if (taskDetail.evaluation_prompt_config?.metrics) {
          const metrics = taskDetail.evaluation_prompt_config.metrics.map((metric, index) => ({
            key: `metric_${Date.now()}_${index}`,
            metricId: metric.system_metric_id,
            name: metric.name,
            description: metric.description,
            metricsMapping: metric.metrics_mapping,
            score: '0-10',
            weight: '10',
            score_min: metric.score_min,
            score_max: metric.score_max,
            score_definitions: metric.score_definitions,
          }))
          setSelectedJudgeMetrics(metrics)
        }
      }

      // 处理基础指标评估配置
      if (taskDetail.evaluation_method === 'basic_metric' || taskDetail.evaluation_method === 'all') {
        if (taskDetail.basic_metric_config?.metrics) {
          setSelectedBasicMetrics(taskDetail.basic_metric_config.metrics)
        }
        if (taskDetail.basic_metric_config?.stop_words) {
          setStopWordsFile(taskDetail.basic_metric_config.stop_words)
        }
      }
    }
    catch (error) {
      console.error('加载克隆任务数据失败:', error)
      message.error('加载克隆任务数据失败')
    }
    finally {
      setLoadingCloneData(false)
    }
  }

  // 克隆任务或重新评估或编辑：在组件挂载时加载任务详情并填充表单
  useEffect(() => {
    loadCloneTaskData()
  }, [cloneTaskId, restartTaskId, editTaskId, projectId])

  // 获取选项标签的公共函数
  const getOptionLabel = (value: string) => {
    return value === 'service' ? '在线服务' : '模型仓库'
  }

  // 清空级联选择器值的公共函数
  const clearCascaderValue = () => {
    setCascaderValue(undefined)
    form.setFieldsValue({ evaluationService: undefined })
  }

  // 清空GPU相关字段的公共函数
  const clearGpuFields = () => {
    form.setFieldsValue({
      gpu_type: undefined,
      gpu_model: undefined,
      gpu_memory: undefined,
      gpu_count: undefined,
    })
    setGpuTypeHelp('')
  }

  // 重置裁判员评估相关状态的公共函数
  const resetRefereeState = () => {
    clearCascaderValue()
    setRefereeType('')
    setRefereeModelId(null)
    clearGpuFields()
    setGpuCascaderOptions([])
  }

  // 动态加载级联选择器的数据
  const loadCascaderData = async (selectedOptions: any[]) => {
    const targetOption = selectedOptions[selectedOptions.length - 1]

    if (!targetOption || !projectId) return

    targetOption.loading = true
    setLoadingCascader(true)

    try {
      let children: any[] = []

      if (targetOption.value === 'service') {
        const result = await inferenceServiceApi.list({
          projectId,
          page: 1,
          size: 100,
          status: '测试通过',
          model_type: evaluationCategory,
        })
        children = result.items?.map((item: any) => ({
          value: item.id,
          label: item.name,
          data: item,
        })) || []
      }
      else if (targetOption.value === 'model') {
        const params: GetBaseModelsParams = {
          page: 1,
          size: 100,
          is_available: true,
          model_type: evaluationCategory,
        }
        const result = await ModelService.getBaseModels(params)
        children = result.items?.map((item: any) => ({
          value: item.id,
          label: item.name,
          data: item,
        })) || []
      }

      targetOption.children = children
      // 如果没有二级数据，禁用该一级选项
      targetOption.disabled = !children || children.length === 0

      targetOption.loading = false
      // 更新选项数组，确保 disabled 状态正确保留
      setCascaderOptions((prev) => prev.map((option) => {
        if (option.value === targetOption.value) {
          return {
            ...option,
            children: targetOption.children,
            disabled: targetOption.disabled,
            loading: false,
          }
        }
        return option
      }))

      // 如果数据加载完成后，数据为空，且当前选中了该一级选项，清空选择并提示
      if (targetOption.disabled) {
        const currentValue = form.getFieldValue('evaluationService')
        if (currentValue && Array.isArray(currentValue) && currentValue[0] === targetOption.value) {
          clearCascaderValue()
          message.warning(`${getOptionLabel(targetOption.value)}下暂无可用数据，请选择其他选项`)
        }
      }
    }
    catch (error) {
      console.error('加载级联数据失败:', error)
      targetOption.loading = false
      // 加载失败时也禁用该选项
      targetOption.disabled = true
      setCascaderOptions((prev) => prev.map((option) =>
        option.value === targetOption.value
          ? { ...option, disabled: true }
          : option,
      ))
      message.error('加载数据失败，请重试')
    }
    finally {
      setLoadingCascader(false)
    }
  }

  // 处理级联选择器变化
  const handleCascaderChange = (value: any, selectedOptions: any[]) => {
    if (selectedOptions && selectedOptions.length > 0) {
      const firstLevelOption = selectedOptions[0]
      const refereeTypeValue = firstLevelOption?.value // service 或 model

      // 如果只选择了一级菜单，不允许设置值，清空选择
      if (selectedOptions.length === 1) {
        // 如果正在加载数据，清空选择，等待加载完成
        if (firstLevelOption.loading || loadingCascader) {
          clearCascaderValue()
          return
        }

        // 检查是否有二级数据
        const childrenIsEmpty = Array.isArray(firstLevelOption.children) && firstLevelOption.children.length === 0
        const isDisabled = firstLevelOption.disabled

        // 如果没有二级数据或选项被禁用，清空选择并提示
        if (childrenIsEmpty || isDisabled) {
          clearCascaderValue()
          message.warning(`${getOptionLabel(refereeTypeValue)}下暂无可用数据，请选择其他选项`)
          return
        }

        // 即使有二级数据，也不允许只选择一级菜单，清空选择
        clearCascaderValue()
        return
      }

      // 只有选择了完整的路径（一级+二级）时，才设置值
      if (selectedOptions.length === 2) {
        const selectedItem = selectedOptions[1]
        setCascaderValue(value)
        setRefereeType(refereeTypeValue)
        setRefereeModelId(selectedItem.value)
        form.setFieldsValue({ evaluationService: value })

        // 无论选择在线服务还是离线模型，都需要清空之前的GPU选择
        clearGpuFields()
      }
      else {
        // 其他情况，清空选择
        clearCascaderValue()
        setRefereeType('')
        setRefereeModelId(null)
      }
    }
    else {
      // 清空选择时，重置所有相关状态
      resetRefereeState()
    }
  }

  // 获取显卡资源列表（第一级：显卡类型）
  const { data: gpuResourceOptions = [], isLoading: gpuResourceOptionsLoading, error: gpuResourceOptionsError } = useQuery({
    queryKey: ['gpuResources', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('项目ID不能为空')
      const res = await getKubernetesClusterGPUs(Number(projectId))
      const data = res.map((item: any) => ({
        value: item.category,
        label: item.category,
        isLeaf: false, // 标记为非叶子节点，表示有子节点
      }))
      return data
    },
    enabled: !!projectId && evaluationMethod.includes('referee') && refereeType === 'model',
  })

  // 当查询数据加载完成后，更新 Cascader 选项
  useEffect(() => {
    if (gpuResourceOptions && gpuResourceOptions.length > 0) {
      setGpuCascaderOptions(gpuResourceOptions)
    }
  }, [gpuResourceOptions])

  // 加载级联数据的第二级（显卡型号）
  const loadGpuModelData = async (selectedOptions: any[]) => {
    const targetOption = selectedOptions[selectedOptions.length - 1]
    targetOption.loading = true

    try {
      if (!projectId) {
        throw new Error('项目ID不能为空')
      }
      const resourceType = targetOption.value
      const models = await getKubernetesClusterGPUTypes(Number(projectId), resourceType)

      const children = models.map((model: any) => ({
        value: model.type,
        label: model.desc || model.type,
        memory: model.memory,
        model: model.model,
        isLeaf: true,
      }))
      targetOption.loading = false
      targetOption.children = children

      // 更新状态，触发重新渲染
      setGpuCascaderOptions((prevOptions) => {
        return prevOptions.map((option) => {
          if (option.value === resourceType) {
            return {
              ...option,
              loading: false,
              children,
            }
          }
          return option
        })
      })
    }
    catch (error) {
      targetOption.loading = false
      setGpuCascaderOptions((prevOptions) => {
        return prevOptions.map((option) => {
          if (option.value === targetOption.value) {
            return {
              ...option,
              loading: false,
            }
          }
          return option
        })
      })
      console.error('Failed to load GPU models:', error)
    }
  }

  const handleGpuCascaderChange = (value: any, selectedOptions: any[]) => {
    // 当选择完成时（选择了类型和型号），设置gpu_model、gpu_memory、card_type和k8s_resource_type
    if (value && value.length === 2) {
      // 从gpuCascaderOptions中查找对应的选项
      const typeOption = gpuCascaderOptions.find((opt) => opt.value === value[0])
      if (typeOption && typeOption.children) {
        const modelOption = typeOption.children.find((child: any) => child.value === value[1])
        if (modelOption && modelOption.memory !== undefined && modelOption.model !== undefined) {
          form.setFieldsValue({
            gpu_model: modelOption.model,
            gpu_memory: modelOption.memory,
            gpu_type: value, // 保存级联选择器的值 [card_type, k8s_resource_type]
          })
          setGpuTypeHelp('')
        }
      }
    }
    else {
      // 当选择被清空或未完成时，清空相关字段
      form.setFieldsValue({
        gpu_model: undefined,
        gpu_memory: undefined,
        gpu_type: undefined,
      })
      setGpuTypeHelp('')
    }
  }

  // 裁判员评估指标列表（用于裁判员评估）
  const [selectedJudgeMetrics, setSelectedJudgeMetrics] = useState<Array<{
    key: string
    metricId: number
    name: string
    description: string
    metricsMapping: Record<string, string>
    score?: string
    weight?: string
    score_min?: number
    score_max?: number
    score_definitions?: string[]
  }>>([])

  // 基础指标评估配置
  const [selectedBasicMetrics, setSelectedBasicMetrics] = useState<string[]>([])
  const [stopWordsFile, setStopWordsFile] = useState<string>('')

  // 停用词上传弹窗状态
  const [isUploadModalVisible, setIsUploadModalVisible] = useState(false)
  const [uploading, setUploading] = useState(false)

  // 提交loading状态
  const [submitting, setSubmitting] = useState(false)

  // 克隆/重新评估数据加载loading状态
  const [loadingCloneData, setLoadingCloneData] = useState(false)

  // 查询基础指标列表
  const { data: basicMetricsData, isLoading: basicMetricsLoading } = useQuery({
    queryKey: ['basicMetrics'],
    queryFn: async () => {
      const result = await modelEvaluationServices.getBasicMetrics({
        page: 1,
        size: 100,
      })
      return result
    },
    enabled: evaluationMethod.includes('basic_metric'),
  })

  const availableBasicMetrics = basicMetricsData as any || []

  const handleBack = () => {
    // 获取当前评估类别，用于返回时保持对应的 type
    const currentDatasetType = evaluationCategory || datasetType || 'text-generation'
    const basePath = evaluationPrefix === 'BUSSINESS' ? 'business-effect-evaluation' : 'effect-evaluation'
    navigate(`/project/${projectId}/${basePath}/auto?dataset_type=${currentDatasetType}`)
  }

  const handleSubmit = async (values: any) => {
    // 防止重复提交
    if (submitting) {
      return
    }

    // 验证必填字段（在设置loading之前进行验证）
    if (!projectId) {
      message.error('项目ID不存在')
      return
    }

    // 根据数据来源验证
    if (evaluationDataSource === 'existing') {
      // 已有推理结果集：根据评估类型验证推理结果集
      if (evaluationType === 'single') {
        if (!selectedInferenceDataset) {
          message.error('请选择推理结果集')
          return
        }
      }
      else if (evaluationType === 'comparison') {
        if (selectedInferenceDatasets.length === 0) {
          message.error('请至少选择一个推理结果集')
          return
        }
      }
    }
    else if (evaluationDataSource === 'new') {
      if (evaluationPrefix === 'BUSSINESS') {
        // 业务效果评估-新建推理：验证第三方 API + 业务测试数据集 + 入参（对比评估时至少2个API）
        if (evaluationType === 'comparison' && selectedApiIdsForBusiness.length < 2) {
          message.error('对比评估时，至少选择2个第三方API服务')
          return
        }
        if (selectedApiIdsForBusiness.length === 0) {
          message.error('请选择第三方API服务')
          return
        }
        if (!selectedBusinessTestDatasetForBusiness) {
          message.error('请选择业务测试数据集')
          return
        }
        const firstApiId = selectedApiIdsForBusiness[0]
        const binding = firstApiId ? apiBindingFieldsByApiIdForBusiness[firstApiId] : null
        const reqMappings = firstApiId ? requestMappingsByApiIdForBusiness[firstApiId] || [] : []
        const resMappings = firstApiId ? responseMappingsByApiIdForBusiness[firstApiId] || [] : []
        if (!binding) {
          message.error('请等待推理参数设置加载完成')
          return
        }
        const missingRequest = reqMappings.some((m, i) => !m.targetField && binding.request_binding?.[i])
        if (missingRequest) {
          message.error('请填写所有输入字段映射的业务测试数据集元数据字段')
          return
        }
        const validResponse = resMappings.filter((m, i) => m.targetField && binding.response_binding?.[i])
        if (validResponse.length === 0) {
          message.error('请至少完成输出字段映射')
          return
        }
      }
      else {
        // 普通新建推理结果集：验证必填字段
        if (selectedServices.length === 0) {
          message.error('请至少选择一个待推理服务')
          return
        }
        if (!selectedDatasetForNew || !selectedDatasetVersionObjForNew) {
          message.error('请选择待推理数据')
          return
        }
        const temperature = form.getFieldValue('temperature')
        const top_p = form.getFieldValue('top_p')
        const max_tokens = form.getFieldValue('max_tokens')
        const presence_penalty = form.getFieldValue('presence_penalty')
        if (temperature === undefined || top_p === undefined || presence_penalty === undefined) {
          message.error('请完成推理参数配置')
          return
        }
      }
    }

    // 验证评估方法是否至少选择一种
    if (evaluationMethod.length === 0) {
      message.error('请至少选择一种评估方法')
      return
    }
    if (isImageGeneration && evaluationMethod.includes('basic_metric')) {
      message.error('图像生成 V1.15 暂未接入基础指标评估，请使用裁判员评估')
      return
    }

    // 验证裁判员评估的必填项
    if (evaluationMethod.includes('referee')) {
      if (!refereeModelId) {
        message.error('请选择裁判模型/服务')
        return
      }
      if (selectedJudgeMetrics.length === 0) {
        message.error('请至少添加一个评估指标')
        return
      }
      // 如果选择的是离线模型，验证GPU配置
      if (refereeType === 'model') {
        const gpuType = form.getFieldValue('gpu_type')
        const gpuModel = form.getFieldValue('gpu_model')
        const gpuMemory = form.getFieldValue('gpu_memory')
        const gpuCount = form.getFieldValue('gpu_count')
        if (!gpuType || !Array.isArray(gpuType) || gpuType.length !== 2 || !gpuModel || !gpuMemory || !gpuCount) {
          message.error('请完成显卡资源配置')
          return
        }
      }
    }

    // 验证基础指标评估的必填项
    if (evaluationMethod.includes('basic_metric')) {
      if (selectedBasicMetrics.length === 0) {
        message.error('请至少选择一个基础评估指标')
        return
      }
    }

    // 验证通过后，设置loading状态并提交
    setSubmitting(true)
    try {
      const scheduleDate = scheduleEnabled ? dayjs(form.getFieldValue('schedule_date')).format('YYYY-MM-DD') : undefined
      const scheduleTime = scheduleEnabled ? dayjs(form.getFieldValue('schedule_time')).format('HH:mm:ss') : undefined
      const time = `${scheduleDate}T${scheduleTime}`

      // 构建推理结果集与模型关联
      let datasetModelRelations: any[] = []

      if (evaluationDataSource === 'existing') {
        // 已有推理结果集
        if (evaluationType === 'single') {
          // 单个评估：单个关联
          if (selectedInferenceDataset) {
            datasetModelRelations = [{
              inference_result_dataset_id: selectedInferenceDataset.id,
              evaluated_model_id: selectedInferenceDataset.modelId,
              sort_order: 0,
              evaluated_model_source: selectedInferenceDataset.evaluated_model_source,
            }]
          }
        }
        else if (evaluationType === 'comparison') {
          // 对比评估：多个关联
          datasetModelRelations = selectedInferenceDatasets.map((dataset, index) => ({
            inference_result_dataset_id: dataset.id,
            evaluated_model_id: dataset.modelId,
            sort_order: index,
            evaluated_model_source: dataset.evaluated_model_source,
          }))
        }
      }
      else if (evaluationDataSource === 'new') {
        if (evaluationPrefix === 'BUSSINESS') {
          // 业务效果评估-新建推理：使用第三方 API + 业务测试数据集，入参格式与之前一致（每个 API 一条 relation，含 api_params）
          if (selectedApiIdsForBusiness.length === 0 || !selectedBusinessTestDatasetForBusiness) {
            message.error('请完成新建推理结果集的配置（第三方API服务、业务测试数据集及推理参数设置）')
            setSubmitting(false)
            return
          }
          const sourceDatasetId = selectedBusinessTestDatasetForBusiness.id
          const sourceDatasetName = selectedBusinessTestDatasetForBusiness.dataset_name ?? ''
          const timestamp = dayjs().format('YYYYMMDDHHmmss')
          const apiIdsToSubmit = evaluationType === 'single' ? selectedApiIdsForBusiness.slice(0, 1) : selectedApiIdsForBusiness
          const firstApiId = apiIdsToSubmit[0]
          const binding = apiBindingFieldsByApiIdForBusiness[firstApiId]
          const reqMappings = requestMappingsByApiIdForBusiness[firstApiId] || []
          const resMappings = responseMappingsByApiIdForBusiness[firstApiId] || []

          const request_map = reqMappings
            .map((mapping, i) => {
              if (!mapping.sourceField || !mapping.targetField) return null
              const bindingField = binding?.request_binding?.[i]
              return {
                source_field_desc: bindingField?.name ?? mapping.sourceField,
                source_field_path: bindingField?.jsonpath ?? '',
                target_field_desc: mapping.targetField,
                target_field_path: mapping.targetField,
              }
            })
            .filter(Boolean) as ApiParams['request_map']

          const response_map = resMappings
            .map((mapping, i) => {
              if (!mapping.targetField) return null
              const bindingField = binding?.response_binding?.[i]
              return {
                source_field_desc: bindingField?.name ?? '',
                target_field_desc: mapping.targetField,
              }
            })
            .filter(Boolean) as ApiParams['response_map']

          const api_params: ApiParams = { request_map, response_map }

          datasetModelRelations = apiIdsToSubmit.map((apiId, index) => {
            const apiObj = selectedApisObjsForBusiness.find((a: any) => Number(a.id) === Number(apiId))
              || (apiListDataForBusiness?.items || []).find((a: any) => Number(a.id) === Number(apiId))
              || selectedApisObjsForBusiness[index]
            const apiName = apiObj?.name ?? String(apiId)
            const datasetNameForNew = `推理结果集_${values.name}_${timestamp}${apiIdsToSubmit.length > 1 ? `_${index + 1}` : ''}`

            return {
              evaluated_model_id: apiId,
              evaluated_model_name: apiName,
              sort_order: index,
              inference_method: 'third_api',
              model_id: apiId,
              model_name: apiName,
              online_service_id: apiId,
              online_service_name: apiName,
              dataset_name: datasetNameForNew,
              dataset_description: values.description ?? '',
              source_dataset_id: Number(sourceDatasetId),
              source_dataset_name: sourceDatasetName,
              // api_id: apiId,
              // api_name: apiName,
              api_params,
            } as NewDatasetModelRelation
          })
        }
        else {
          // 普通新建推理结果集：构建 NewDatasetModelRelation
          if (selectedServices.length === 0 || !selectedDatasetForNew || !selectedDatasetVersionObjForNew) {
            message.error('请完成新建推理结果集的配置')
            setSubmitting(false)
            return
          }

          const temperature = form.getFieldValue('temperature') ?? 0.7
          const top_p = form.getFieldValue('top_p') ?? 1.0
          const max_tokens = form.getFieldValue('max_tokens')
          const presence_penalty = form.getFieldValue('presence_penalty') ?? 0.0

          const inferenceParams: InferenceParams = {
            temperature,
            top_p,
            max_tokens: max_tokens ?? 4096,
            presence_penalty,
          }

          const datasetId = selectedDatasetVersionObjForNew.id || selectedDatasetForNew.datasetId
          const datasetName = selectedDatasetVersionObjForNew.dataset_name || selectedDatasetForNew.value
          const datasetVersion = selectedDatasetVersionForNew
          let sourceDatasetName = datasetName
          if (selectedDatasetSourceForNew) {
            sourceDatasetName = `${selectedDatasetSourceForNew}/${datasetName}`
          }
          if (datasetVersion) {
            sourceDatasetName = `${sourceDatasetName}>${datasetVersion}`
          }

          const timestamp = dayjs().format('YYYYMMDDHHmmss')
          const datasetNameForNew = `推理结果集_${values.name}_${timestamp}`

          datasetModelRelations = selectedServicesObjs.map((serviceObj, index) => {
            if (!serviceObj) {
              throw new Error(`服务对象不存在: ${selectedServices[index]}`)
            }
            const serviceId = typeof serviceObj.id === 'string' ? parseInt(serviceObj.id, 10) : serviceObj.id
            const serviceName = serviceObj.name
            const modelName = serviceObj.model_name || serviceObj.name
            return {
              evaluated_model_id: serviceId,
              evaluated_model_name: modelName,
              sort_order: index,
              inference_method: 'online',
              model_id: serviceId,
              model_name: modelName,
              online_service_id: serviceId,
              online_service_name: serviceName,
              inference_params: inferenceParams,
              dataset_name: datasetNameForNew + (selectedServices.length > 1 ? `_${index + 1}` : ''),
              dataset_description: values.description || '',
              source_dataset_id: Number(datasetId),
              source_dataset_name: sourceDatasetName,
            } as NewDatasetModelRelation
          })
        }
      }

      // 构建显卡资源配置（离线模型的裁判员评估时）
      let graphicsCardResource: GraphicsCardResource | undefined
      if (evaluationMethod.includes('referee') && refereeType === 'model') {
        const gpuType = form.getFieldValue('gpu_type') // 级联选择器的值 [card_type, k8s_resource_type]
        const gpuModel = form.getFieldValue('gpu_model')
        const gpuCount = form.getFieldValue('gpu_count')
        const gpuMemory = form.getFieldValue('gpu_memory')

        if (gpuType && Array.isArray(gpuType) && gpuType.length === 2 && gpuModel && gpuCount && gpuMemory) {
          graphicsCardResource = {
            card_type: gpuType[0], // 从接口获取的显卡类型（如 "GPU"）
            card_model: gpuModel, // 从接口获取的显卡型号（如 "A800"）
            count: gpuCount, // 用户选择的卡数
            card_memory: gpuMemory, // 从接口获取的显存（如 "80GB"）
            k8s_resource_type: gpuType[1], // 从接口获取的K8s资源类型（如 "nvidia.com/gpu"）
            cpu_request: form.getFieldValue(['graphics_card_resource', 'cpu_request']),
            cpu_limit: form.getFieldValue(['graphics_card_resource', 'cpu_limit']),
            memory_request: form.getFieldValue(['graphics_card_resource', 'memory_request']),
            memory_limit: form.getFieldValue(['graphics_card_resource', 'memory_limit']),
          }
        }
      }

      // 确定 evaluation_method 的值
      let evaluationMethodValue: 'referee' | 'basic_metric' | 'all'
      if (evaluationMethod.includes('referee') && evaluationMethod.includes('basic_metric')) {
        evaluationMethodValue = 'all'
      }
      else if (evaluationMethod.includes('referee')) {
        evaluationMethodValue = 'referee'
      }
      else {
        evaluationMethodValue = 'basic_metric'
      }

      // 构建API请求数据
      const requestData: CreateProjectEvaluationTaskParams = {
        name: values.name,
        description: values.description || '',
        evaluation_type: evaluationType,
        data_source: values.evaluationDataSource as 'existing' | 'new',
        evaluation_method: evaluationMethodValue,
        dataset_type: evaluationPrefix === 'BUSSINESS' ? 'text-generation' : evaluationCategory,

        // 推理结果集与模型关联
        dataset_model_relations: datasetModelRelations,

        // 裁判员模型信息（裁判员评估时）
        ...(evaluationMethod.includes('referee') && {
          referee_model_id: refereeModelId,
          referee_type: refereeType as 'service' | 'model',
        }),

        // 显卡资源配置（离线模型的裁判员评估时，必须传递）
        ...(evaluationMethod.includes('referee') && refereeType === 'model' && graphicsCardResource && {
          graphics_card_resource: graphicsCardResource,
        }),

        // 评估提示词配置（裁判员评估时）
        ...(evaluationMethod.includes('referee') && {
          evaluation_prompt_config: {
            metrics: selectedJudgeMetrics.map((metric) => ({
              name: metric.name,
              description: metric.description,
              system_metric_id: metric.metricId,
              metrics_mapping: metric.metricsMapping,
            })),
          },
          // 添加推理参数配置
          referee_inference_params: {
            temperature: form.getFieldValue('referee_temperature') ?? 0.7,
            top_p: form.getFieldValue('referee_top_p') ?? 1.0,
            max_tokens: form.getFieldValue('referee_max_tokens') ?? 4096,
            presence_penalty: form.getFieldValue('referee_presence_penalty') ?? 0.0,
          },
        }),

        // 基础指标配置（基础指标评估时）
        ...(evaluationMethod.includes('basic_metric') && {
          basic_metric_config: {
            metrics: selectedBasicMetrics,
            ...(stopWordsFile && { stop_words: stopWordsFile }),
          },
        }),

        // 重新评估或编辑时传递原任务ID
        ...((restartTaskId || editTaskId) && { id: restartTaskId || editTaskId }),

        ...(scheduleEnabled && time && { schedule_at: time }),
      }

      // 调用API提交数据
      await modelEvaluationServices.createProjectEvaluationTask(Number(projectId), requestData)

      // 使列表查询失效，触发自动刷新
      queryClient.invalidateQueries({
        queryKey: ['evaluationTasks', projectId],
      })

      message.success(editTaskId ? '编辑自动评估任务成功！' : '创建自动评估任务成功！')
      handleBack()
    }
    catch (error: any) {
      console.error('创建任务失败:', error)
      const errorMessage = error?.response?.data?.msg || error?.message || '创建失败，请重试'
      message.error(errorMessage)
    }
    finally {
      setSubmitting(false)
    }
  }

  // 打开增加指标弹窗
  const handleOpenModal = () => {
    setEditingMetricKey(null)
    setSelectedMetricId(null)
    setSelectedMetricsMapping({})
    setIsModalVisible(true)
  }

  // 关闭弹窗
  const handleCloseModal = () => {
    setIsModalVisible(false)
    setEditingMetricKey(null)
    setSelectedMetricId(null)
    setSelectedMetricsMapping({})
  }

  // 确认添加/编辑指标
  const handleConfirmAddMetric = () => {
    if (!selectedMetricId) {
      message.warning('请选择评估指标')
      return
    }

    // 检查 metrics_mapping 是否都已配置
    const mappingValues = Object.values(selectedMetricsMapping)
    if (mappingValues.length === 0 || mappingValues.some((v) => !v)) {
      message.warning('请完成数据字段关联配置')
      return
    }

    // 找到选中的指标
    const selectedMetric = availableMetrics.find((m: any) => m.id === selectedMetricId)
    if (selectedMetric) {
      // 从 score_scope 中提取分值量级和量级说明
      let scoreMin: number | undefined
      let scoreMax: number | undefined
      let scoreDefinitions: string[] | undefined

      if (selectedMetric.score_scope && Array.isArray(selectedMetric.score_scope) && selectedMetric.score_scope.length > 0) {
        // 计算最小值和最大值
        scoreMin = Math.min(...selectedMetric.score_scope.map((s: any) => s.score_min))
        scoreMax = Math.max(...selectedMetric.score_scope.map((s: any) => s.score_max))
        // 提取所有量级说明
        scoreDefinitions = selectedMetric.score_scope.map((s: any) =>
          `${s.score_min}-${s.score_max}:${s.score_definitions}`,
        )
      }

      if (editingMetricKey) {
        // 编辑模式：检查是否与其他指标重复（排除自己）
        const isDuplicate = selectedJudgeMetrics.some(
          (item) => item.key !== editingMetricKey && item.metricId === selectedMetricId,
        )
        if (isDuplicate) {
          message.warning('该评估指标已存在，请勿重复添加')
          return
        }

        // 编辑模式：更新现有指标
        setSelectedJudgeMetrics((prev) =>
          prev.map((item) =>
            item.key === editingMetricKey
              ? {
                  ...item,
                  metricId: selectedMetricId,
                  name: selectedMetric.name,
                  description: selectedMetric.description,
                  metricsMapping: selectedMetricsMapping,
                  score_min: scoreMin,
                  score_max: scoreMax,
                  score_definitions: scoreDefinitions,
                }
              : item,
          ),
        )
        message.success('编辑指标成功')
      }
      else {
        // 新增模式：检查是否已存在该指标
        const isDuplicate = selectedJudgeMetrics.some((item) => item.metricId === selectedMetricId)
        if (isDuplicate) {
          message.warning('该评估指标已存在，请勿重复添加')
          return
        }

        // 新增模式：添加到列表
        const newMetric = {
          key: `metric_${Date.now()}`,
          metricId: selectedMetricId,
          name: selectedMetric.name,
          description: selectedMetric.description,
          metricsMapping: selectedMetricsMapping,
          score: '0-10',
          weight: '10',
          score_min: scoreMin,
          score_max: scoreMax,
          score_definitions: scoreDefinitions,
        }
        setSelectedJudgeMetrics((prev) => [...prev, newMetric])
        message.success('添加指标成功')
      }
      handleCloseModal()
    }
  }

  // 删除指标
  const handleDeleteMetric = (metricKey: string) => {
    setSelectedJudgeMetrics((prev) => prev.filter((item) => item.key !== metricKey))
    message.success('删除指标成功')
  }

  // 处理指标字段映射变化
  const handleMetricMappingChange = (field: string, value: string) => {
    setSelectedMetricsMapping((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  // 打开停用词上传弹窗
  const handleOpenUploadModal = () => {
    setIsUploadModalVisible(true)
  }

  // 关闭停用词上传弹窗
  const handleCloseUploadModal = () => {
    setIsUploadModalVisible(false)
  }

  // 下载停用词模板
  const handleDownloadTemplate = () => {
    const templateContent = `--
?
"
"
》
－－
$`
    const blob = new Blob([templateContent], { type: 'text/plain;charset=utf-8' })
    downloadBlobFile(blob, '停用词模板.txt')
  }

  // 处理文件上传
  const handleUploadStopWords: UploadProps['customRequest'] = async (options) => {
    const { file, onSuccess, onError } = options

    if (!projectId) {
      message.error('项目ID不存在')
      onError?.(new Error('项目ID不存在'))
      return
    }

    setUploading(true)

    try {
      const response = await modelEvaluationServices.uploadStopWords(
        Number(projectId),
        file as File,
      )

      // 假设接口返回的数据中有文件路径字段
      const filePath = response.payload?.file_path || response.data?.file_path || response.file_path

      if (filePath) {
        setStopWordsFile(filePath)
        form.setFieldsValue({ stopWords: filePath })
        message.success('停用词文件上传成功！')
        onSuccess?.(response)
        handleCloseUploadModal()
      }
      else {
        message.error('上传成功但未返回文件路径')
        onError?.(new Error('未返回文件路径'))
      }
    }
    catch (error: any) {
      onError?.(error)
    }
    finally {
      setUploading(false)
    }
  }

  // 裁判员评估指标表格列定义
  const judgeMetricColumns = [
    {
      title: '指标名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
      render: (text: string) => text || '-',
    },
    {
      title: '指标说明',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '评估字段',
      dataIndex: 'metricsMapping',
      key: 'metricsMapping',
      width: 400,
      render: (mapping: Record<string, string>) => {
        const entries = Object.entries(mapping)
        return (
          <div className="flex flex-col gap-1">
            {entries.map(([key, value]) => (
              <Text key={key} className="text-xs">
                {key}
                {' '}
                →
                {value}
              </Text>
            ))}
          </div>
        )
      },
    },
    {
      title: '指标分值量级',
      dataIndex: 'score',
      key: 'score',
      width: 120,
      render: (_: any, record: any) => {
        // 优先使用克隆回显的数据
        if (record.score_min !== undefined && record.score_max !== undefined) {
          return (
            <Tag color="blue">
              {record.score_min}
              -
              {record.score_max}
            </Tag>
          )
        }
        return <span>-</span>
      },
    },
    {
      title: '量级说明',
      dataIndex: 'weight',
      key: 'weight',
      width: 120,
      render: (_: any, record: any) => {
        // 优先使用克隆回显的数据
        if (record.score_definitions && Array.isArray(record.score_definitions) && record.score_definitions.length > 0) {
          const fullText = record.score_definitions.join('\n')
          return (
            <Tooltip title={fullText} placement="topLeft">
              <div className="line-clamp-3 break-words">
                {fullText}
              </div>
            </Tooltip>
          )
        }
        return <span>-</span>
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: any) => (
        <Space size="small">
          {/* <Button type="link" size="small" onClick={() => handleEditMetric(record.key)}>
            编辑
          </Button> */}
          <Button type="link" size="small" danger onClick={() => handleDeleteMetric(record.key)}>
            删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <Spin spinning={loadingCloneData} tip="正在加载任务数据，请稍候..." size="large">
      <div className="create-form-page">
        <section className="create-form-card">
          <CreateFormPageHeader
            title={evaluationPrefix === 'BUSSINESS' ? '创建业务效果评估任务' : '创建自动评估任务'}
            onBack={handleBack}
            actions={(
              <>
                <Button className="create-form-cancel" onClick={handleBack} disabled={submitting}>取消</Button>
                <Button
                  className="create-form-submit"
                  type="primary"
                  loading={submitting}
                  onClick={() => form.submit()}
                >
                  创建
                </Button>
              </>
            )}
          />
          <div className="create-form-divider" />
          <div className="create-form-body">
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              initialValues={{
                evaluationDataSource: 'existing',
                evaluationMethod: ['referee'],
                evaluationCategory: 'text-generation',
              }}
            >
              {/* 基本信息 */}
              <Card title="" className="mb-6">
                <Row gutter={24}>
                  <Col span={12}>
                    <Form.Item
                      label="任务名称"
                      name="name"
                      rules={[
                        { required: true, message: '请输入任务名称' },
                        {
                          validator: (_, value) => {
                            if (!value) {
                              return Promise.resolve()
                            }
                            // 检查长度
                            if (value.length < 2 || value.length > 64) {
                              return Promise.reject(new Error('任务名称长度为2-64个字符'))
                            }
                            // 检查不能以下划线或中划线开头
                            if (value.startsWith('_') || value.startsWith('-')) {
                              return Promise.reject(new Error('任务名称不能以下划线或中划线开头'))
                            }
                            // 检查只能包含中英文、数字、小数点、中划线、下划线
                            if (!/^[\u4E00-\u9FA5a-zA-Z0-9._-]+$/.test(value)) {
                              return Promise.reject(new Error('任务名称只能包含中英文、数字、小数点、中划线、下划线，不能包含空格和特殊符号'))
                            }
                            return Promise.resolve()
                          },
                        },
                      ]}
                    >
                      <Input placeholder="请输入任务名称" />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item label="描述" name="description">
                  <TextArea
                    placeholder="请输入评估任务描述，1000字符以内"
                    rows={4}
                    maxLength={1000}
                    showCount
                  />
                </Form.Item>

                <Divider />

                <Form.Item label="任务定时配置">
                  <Space direction="vertical" className="w-full">
                    <Form.Item name="schedule_enabled" valuePropName="checked" className="mb-0">
                      <Switch
                        checked={scheduleEnabled}
                        onChange={(checked) => {
                          setScheduleEnabled(checked)
                          form.setFieldsValue({ schedule_enabled: checked })
                          if (!checked) {
                            form.setFieldsValue({ schedule_date: undefined, schedule_time: undefined })
                          }
                        }}
                      />
                    </Form.Item>
                    {scheduleEnabled && (
                      <Row gutter={16}>
                        <Col span={12}>
                          <Form.Item
                            name="schedule_date"
                            label="执行时间"
                            rules={scheduleEnabled ? [{ required: true, message: '请选择日期' }] : []}
                          >
                            <DatePicker
                              className="w-full"
                              placeholder="请选择日期"
                              format="YYYY-MM-DD"
                              disabledDate={(current) => current && current < dayjs().startOf('day')}
                            />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item
                            name="schedule_time"
                            label=" "
                            rules={scheduleEnabled ? [{ required: true, message: '请选择时间' }] : []}
                          >
                            <TimePicker
                              className="w-full"
                              placeholder="请选择时间"
                              format="HH:mm:ss"
                            />
                          </Form.Item>
                        </Col>
                      </Row>
                    )}
                  </Space>
                </Form.Item>

                <Divider />

                {/* 评估类别 */}
                <Form.Item name="evaluationCategory" rules={[{ required: true, message: '请选择评估类别' }]} label="评估类别">
                  <Radio.Group
                    value={evaluationCategory}
                    onChange={(e) => handleEvaluationCategoryChange(e.target.value)}
                  >
                    <Radio value="text-generation">文本生成</Radio>
                    {evaluationPrefix !== 'BUSSINESS' && (
                      <>
                        <Radio value="image-understanding">图像理解</Radio>
                        <Radio value="image-generation">图像生成</Radio>
                      </>
                    )}
                  </Radio.Group>
                </Form.Item>

                <Divider />

                {/* 评估数据来源 */}
                <Form.Item name="evaluationDataSource" rules={[{ required: true }]} label="评估数据来源">
                  <Radio.Group onChange={(e) => handleEvaluationDataSourceChange(e.target.value)}>
                    <Radio value="existing">已有推理结果集</Radio>
                    <Radio value="new">新建推理结果集</Radio>
                  </Radio.Group>
                </Form.Item>

                {evaluationDataSource === 'existing' && (
                  <DatasetCascaderSelector
                    form={form}
                    fieldName="inferenceResultDatasetId"
                    label=""
                    placeholder="请选择已有推理结果集"
                    modalTitle="选择已有推理结果集"
                    selectButtonText="选择"
                    projectIdOverride={projectId ? Number(projectId) : undefined}
                    statsQuery={{
                      usage: [evaluationPrefix === 'BUSSINESS' ? 'business-inference' : 'default-inference'],
                      dataset_type: [evaluationPrefix === 'BUSSINESS' ? 'business' : evaluationCategory],
                      ...imageGenerationDatasetFormatQuery,
                    }}
                    fixedListUsage={evaluationPrefix === 'BUSSINESS' ? 'business-inference' : 'default-inference'}
                    listDatasetType={evaluationPrefix === 'BUSSINESS' ? 'business' : evaluationCategory}
                    useInferenceResultApi
                    inferenceMultiSelect
                    inferenceDisplayName={inferenceResultDisplayLabel}
                    hideStatsDatasetTypeAndFormatFilters={evaluationPrefix === 'BUSSINESS'}
                    onChange={handleExistingInferenceResultDatasetChange}
                  />
                )}

                {evaluationDataSource === 'new' && (
                  <>
                    {evaluationPrefix === 'BUSSINESS' ? (
                    /* 业务效果评估-新建推理：第三方 API + 业务测试数据集 + 入参（与创建业务推理结果集一致） */
                      <>
                        <Form.Item
                          label="第三方API服务"
                          name="business_eval_api"
                          rules={[
                            { required: true, message: '请选择第三方API服务' },
                            ...(evaluationType === 'comparison'
                              ? [
                                  {
                                    validator: (_: any, v: number[]) =>
                                      v && v.length >= 2 ? Promise.resolve() : Promise.reject(new Error('对比评估时至少选择2个第三方API服务')),
                                  },
                                ]
                              : []),
                          ]}
                        >
                          {evaluationType === 'comparison' ? (
                            <Select
                              mode="multiple"
                              placeholder="请选择第三方API服务（可多选，最多5个）"
                              className="w-[400px]"
                              maxTagCount={5}
                              options={apiOptionsForBusiness}
                              loading={loadingApiListForBusiness}
                              onChange={(value) => {
                                handleBusinessApisChange(value || [])
                                form.setFieldsValue({ business_eval_api: value })
                              }}
                              value={selectedApiIdsForBusiness}
                            />
                          ) : (
                            <Select
                              placeholder="请选择第三方API服务"
                              className="w-[400px]"
                              options={apiOptionsForBusiness}
                              loading={loadingApiListForBusiness}
                              onChange={(value) => {
                                handleBusinessApisChange(value != null ? [value] : [])
                                form.setFieldsValue({ business_eval_api: value })
                              }}
                              value={selectedApiIdsForBusiness[0]}
                            />
                          )}
                        </Form.Item>
                        <DatasetCascaderSelector
                          form={form}
                          fieldName="business_eval_business_test_dataset"
                          label="业务测试数据集"
                          placeholder="请选择业务测试数据集"
                          projectIdOverride={projectId ? Number(projectId) : undefined}
                          statsQuery={{ usage: ['business_test'], dataset_type: ['business'] }}
                          fixedListUsage="business_test"
                          listDatasetType="business"
                          modalTitle="选择业务测试数据集"
                          selectButtonText="选择"
                          hideStatsDatasetTypeAndFormatFilters
                          onChange={handleBusinessTestDatasetChange}
                        />
                        <BusinessInferenceParamsMappingCard
                          firstApiId={selectedApiIdsForBusiness[0]}
                          apiBindingFieldsByApiIdForBusiness={apiBindingFieldsByApiIdForBusiness}
                          requestMappingsByApiIdForBusiness={requestMappingsByApiIdForBusiness}
                          responseMappingsByApiIdForBusiness={responseMappingsByApiIdForBusiness}
                          businessTestDatasetMetadataFieldsForBusiness={businessTestDatasetMetadataFieldsForBusiness}
                          setRequestMappingsByApiIdForBusiness={setRequestMappingsByApiIdForBusiness}
                          setResponseMappingsByApiIdForBusiness={setResponseMappingsByApiIdForBusiness}
                        />
                        {(loadingBindingFieldsForBusiness || loadingMetadataForBusiness) && (
                          <div className="text-sm text-gray-500 mt-2">正在加载字段数据...</div>
                        )}
                      </>
                    ) : (
                    /* 普通效果评估-新建推理：待评估模型/服务 + 推理参数 + 待推理数据 */
                      <>
                        <Form.Item
                          label="推理方式"
                          name="inferenceMethod"
                          rules={[{ required: true, message: '请选择推理方式' }]}
                          initialValue="online"
                        >
                          <Radio.Group value="online">
                            <Radio value="online">在线推理</Radio>
                          </Radio.Group>
                        </Form.Item>
                        <Form.Item
                          label="待评估模型/服务"
                          name="services_to_infer"
                          rules={[
                            { required: true, message: '请选择待推理服务' },
                            {
                              validator: (_, value) => {
                                const arr = Array.isArray(value) ? value : (value != null && value !== '' ? [value] : [])
                                if (arr.length > 5) {
                                  return Promise.reject(new Error('最多只能选择5个待评估模型/服务'))
                                }
                                return Promise.resolve()
                              },
                            },
                          ]}
                        >
                          <div className="flex items-center gap-2">
                            <Select
                              mode="multiple"
                              placeholder="请选择待推理服务（选1个为单个评估，选多个为对比评估）"
                              className="!w-[400px]"
                              maxTagCount={5}
                              value={selectedServices}
                              onChange={(values) => {
                                const next = (values as string[]) || []
                                handleNewInferenceServicesChange(next)
                                form.setFieldsValue({ services_to_infer: next })
                              }}
                              loading={inferenceDataLoading.inferenceServices}
                              disabled={inferenceDataLoading.inferenceServices}
                            >
                              {inferenceServicesForSelect.map((service) => (
                                <Option key={service.id ?? service.name} value={service.name}>
                                  {service.name}
                                </Option>
                              ))}
                            </Select>
                            <span className="text-gray-500 text-sm">
                              (
                              {selectedServices.length}
                              /5
                              )
                            </span>
                          </div>
                        </Form.Item>
                        {selectedServices.length > 0 && <InferenceParametersConfig form={form} />}
                        <DatasetCascaderSelector
                          form={form}
                          options={datasetCascaderOptions}
                          onLoadData={loadDatasetVersions}
                          onChange={handleNewDatasetCascaderChange}
                          filter={filterNewDatasetCascader}
                          loading={inferenceDataLoading.datasets}
                          label="待推理数据"
                          statsQuery={{ training_method_type: ['sft'], dataset_type: [evaluationCategory], ...imageGenerationDatasetFormatQuery }}
                          listDatasetType={evaluationCategory}
                        />
                      </>
                    )}
                  </>
                )}
                <div className="text-gray-500 text-sm mt-2">
                  {
                    evaluationDataSource !== 'new' && (
                      <>
                        待评估模型/服务：
                        {currentInferenceDataset.length > 0 ? currentInferenceDataset?.join(', ') : '请先选择推理结果集'}
                      </>
                    )
                  }
                </div>
              </Card>

              <p className="my-2"></p>

              {/* 评估方法 */}
              <Card title="评估方法" className="mb-6">
                <Form.Item
                  name="evaluationMethod"
                  rules={[
                    {
                      validator: () => {
                        if (evaluationMethod.length === 0) {
                          return Promise.reject(new Error('请选择评估方法'))
                        }
                        return Promise.resolve()
                      },
                    },
                  ]}
                >
                  <div className="flex gap-4">
                    {/* 裁判员评估 */}
                    <Checkbox
                      checked={evaluationMethod.includes('referee')}
                      onChange={(e) => {
                        const checked = e.target.checked
                        let newMethods: string[]
                        if (checked) {
                          newMethods = evaluationMethod.includes('referee')
                            ? evaluationMethod
                            : [...evaluationMethod, 'referee']
                        }
                        else {
                          newMethods = evaluationMethod.filter((m) => m !== 'referee')
                          resetRefereeState()
                        }
                        setEvaluationMethod(newMethods)
                        form.setFieldsValue({ evaluationMethod: newMethods })
                        // 触发表单验证
                        form.validateFields(['evaluationMethod'])
                      }}
                    >
                      裁判员评估
                    </Checkbox>

                    {/* 基础指标评估 */}
                    {evaluationPrefix !== 'BUSSINESS' && (
                      <Tooltip title={isImageGeneration ? 'V1.15 图像生成暂未接入 CLIPScore、审美、安全等基础指标流水线，首版请使用裁判员评估。' : ''}>
                        <Checkbox
                          checked={!isImageGeneration && evaluationMethod.includes('basic_metric')}
                          disabled={isImageGeneration}
                          onChange={(e) => {
                            const checked = e.target.checked
                            let newMethods: string[]
                            if (checked) {
                              newMethods = evaluationMethod.includes('basic_metric')
                                ? evaluationMethod
                                : [...evaluationMethod, 'basic_metric']
                            }
                            else {
                              newMethods = evaluationMethod.filter((m) => m !== 'basic_metric')
                            }
                            setEvaluationMethod(newMethods)
                            form.setFieldsValue({ evaluationMethod: newMethods })
                            // 触发表单验证
                            form.validateFields(['evaluationMethod'])
                          }}
                        >
                          基础指标评估
                        </Checkbox>
                      </Tooltip>
                    )}
                  </div>
                </Form.Item>

                {/* 裁判员评估相关内容 */}
                {evaluationMethod.includes('referee') && (
                  <Card title="裁判员评估" className="mt-6">
                    {/* 选择裁判模型/服务 */}
                    <Form.Item
                      label="选择裁判模型/服务"
                      name="evaluationService"
                      rules={[{ required: evaluationMethod.includes('referee'), message: '请选择评估模型/服务' }]}
                    >
                      <Cascader
                        options={cascaderOptions}
                        loadData={loadCascaderData}
                        onChange={handleCascaderChange}
                        value={cascaderValue}
                        placeholder="请先选择在线服务或模型仓库"
                        changeOnSelect
                        loading={loadingCascader}
                        onPopupVisibleChange={(visible) => {
                          // 当下拉框关闭时，如果只选择了一级菜单，清空值
                          if (!visible) {
                            // 使用 setTimeout 确保在 Cascader 内部状态更新后再检查
                            setTimeout(() => {
                              const currentValue = cascaderValue || form.getFieldValue('evaluationService')
                              if (currentValue && Array.isArray(currentValue) && currentValue.length === 1) {
                                clearCascaderValue()
                                setRefereeType('')
                                setRefereeModelId(null)
                              }
                            }, 0)
                          }
                        }}
                        displayRender={(labels, selectedOptions) => {
                          // 只有选择了完整路径（一级+二级）时才显示
                          if (selectedOptions && selectedOptions.length === 2) {
                            return labels.join(' / ')
                          }
                          // 如果只选择了一级菜单，不显示任何内容（返回空字符串会显示为空）
                          if (selectedOptions && selectedOptions.length === 1) {
                            return ''
                          }
                          return labels.join(' / ')
                        }}
                      />
                    </Form.Item>

                    {/* 推理模型参数设置（选择裁判模型/服务后显示） */}
                    {refereeModelId && (
                      <RefereeInferenceParametersConfig form={form} />
                    )}

                    {/* 显卡资源配置（仅在裁判员评估且选择离线模型时显示） */}
                    {refereeType === 'model' && (
                      <Card
                        title={(
                          <div className="flex items-center">
                            <ThunderboltOutlined className="mr-2 text-[var(--lab-color-danger)]" />
                            显卡资源配置
                          </div>
                        )}
                        className="mt-4 rounded-[8px]"
                        size="small"
                      >
                        <Row gutter={16}>
                          <Col span={8}>
                            <Form.Item
                              name="gpu_type"
                              label="显卡类型及型号"
                              rules={[{ required: true, message: '请选择显卡类型及型号' }]}
                              help={gpuTypeHelp ? (
                                <span style={{ color: '#faad14' }}>
                                  <ExclamationCircleOutlined className="mr-1" />
                                  {gpuTypeHelp}
                                </span>
                              ) : undefined}
                              validateStatus={gpuTypeHelp ? 'warning' : ''}
                            >
                              <Cascader
                                placeholder="请选择显卡类型及型号"
                                options={gpuCascaderOptions}
                                loadData={loadGpuModelData}
                                changeOnSelect={false}
                                loading={gpuResourceOptionsLoading}
                                disabled={!projectId}
                                onChange={handleGpuCascaderChange}
                              />
                            </Form.Item>
                          </Col>
                          <Col span={8} className="hidden">
                            <Form.Item
                              name="gpu_model"
                              label="显卡型号"
                            >
                              <Text></Text>
                            </Form.Item>
                          </Col>
                          <Col span={8} className="hidden">
                            <Form.Item
                              name="gpu_memory"
                              label="显卡内存"
                            >
                              <Text></Text>
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item
                              name="gpu_count"
                              label="显卡 卡数配置"
                              rules={[{ required: true, message: '请选择显卡卡数配置' }]}
                            >
                              <Select placeholder="请选择显卡数量">
                                {Array.from({ length: 8 }, (_, i) => i + 1).map((count) => (
                                  <Option key={count} value={count}>
                                    {count}
                                    张
                                  </Option>
                                ))}
                              </Select>
                            </Form.Item>
                          </Col>
                        </Row>
                        {/* CPU配置 */}
                        <Row gutter={16}>
                          <Col span={8}>
                            <Form.Item
                              name={['graphics_card_resource', 'cpu_request']}
                              label="CPU 请求"
                              rules={[{ required: true, message: '请输入CPU请求' }]}
                              initialValue={0.5}
                            >
                              <InputNumber
                                min={0}
                                step={0.1}
                                placeholder="请输入CPU请求"
                                className="w-full"
                                addonAfter="Core"
                              />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item
                              name={['graphics_card_resource', 'cpu_limit']}
                              label="CPU 限制"
                              dependencies={[['graphics_card_resource', 'cpu_request']]}
                              rules={[
                                { required: true, message: '请输入CPU限制' },
                                {
                                  validator: createLimitValidator(
                                    form,
                                    ['graphics_card_resource', 'cpu_request'],
                                    'CPU限制必须大于或等于CPU请求的值',
                                  ),
                                },
                              ]}
                              initialValue={16}
                            >
                              <InputNumber
                                min={0}
                                step={0.1}
                                placeholder="请输入CPU限制"
                                className="w-full"
                                addonAfter="Core"
                              />
                            </Form.Item>
                          </Col>
                        </Row>

                        {/* 内存配置 */}
                        <Row gutter={16}>
                          <Col span={8}>
                            <Form.Item
                              name={['graphics_card_resource', 'memory_request']}
                              label="内存请求"
                              rules={[{ required: true, message: '请输入内存请求' }]}
                              initialValue={0.5}
                            >
                              <InputNumber
                                min={0}
                                step={0.1}
                                placeholder="请输入内存请求"
                                className="w-full"
                                addonAfter="GB"
                              />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item
                              name={['graphics_card_resource', 'memory_limit']}
                              label="内存限制"
                              dependencies={[['graphics_card_resource', 'memory_request']]}
                              rules={[
                                { required: true, message: '请输入内存限制' },
                                {
                                  validator: createLimitValidator(
                                    form,
                                    ['graphics_card_resource', 'memory_request'],
                                    '内存限制必须大于或等于内存请求的值',
                                  ),
                                },
                              ]}
                              initialValue={16}
                            >
                              <InputNumber
                                min={0}
                                step={0.1}
                                placeholder="请输入内存限制"
                                className="w-full"
                                addonAfter="GB"
                              />
                            </Form.Item>
                          </Col>
                        </Row>
                      </Card>
                    )}

                    {/* 裁判员评估 - 复杂Prompt配置 */}
                    <div className="mt-6">
                      <div className="my-4 flex items-center justify-between">
                        <Text>评估指标</Text>
                        <Space>
                          <Button type="primary" size="small" onClick={handleOpenModal}>
                            增加指标
                          </Button>
                        </Space>
                      </div>

                      <Table
                        columns={judgeMetricColumns}
                        dataSource={selectedJudgeMetrics}
                        pagination={false}
                        size="small"
                        locale={{ emptyText: '暂无评估指标，请点击"增加指标"按钮添加' }}
                      />
                    </div>
                  </Card>
                )}

                <p className="mt-4"></p>

                {/* 基础指标评估相关内容 */}
                {evaluationMethod.includes('basic_metric') && (
                  <Card title="基础指标评估">
                    {/* 基础指标评估 - 表格形式 */}
                    <div>
                      <div className="mb-4">
                        <Text strong>选择评估指标</Text>
                      </div>
                      {basicMetricsLoading ? (
                        <div className="text-center py-4">
                          <Text type="secondary">加载基础指标中...</Text>
                        </div>
                      ) : (
                        <Checkbox.Group
                          value={selectedBasicMetrics}
                          onChange={(checkedValues) => setSelectedBasicMetrics(checkedValues as string[])}
                          className="w-full"
                        >
                          <Table
                            columns={[
                              {
                                title: '选择',
                                dataIndex: 'select',
                                key: 'select',
                                width: 60,
                                render: (_: any, record: any) => (
                                  <Checkbox value={record.name} />
                                ),
                              },
                              {
                                title: '指标',
                                dataIndex: 'name',
                                key: 'name',
                                width: 150,
                              },
                              {
                                title: '指标说明',
                                dataIndex: 'description',
                                key: 'description',
                                ellipsis: true,
                              },
                            ]}
                            dataSource={availableBasicMetrics}
                            pagination={false}
                            size="small"
                            bordered
                            locale={{ emptyText: '暂无基础指标' }}
                          />
                        </Checkbox.Group>
                      )}

                      <div className="mt-6">
                        <div className="mb-4">
                          <Text strong>停用词</Text>
                          <Button type="link" className="text-blue-500 ml-2" onClick={handleOpenUploadModal}>
                            添加停用词表
                          </Button>
                          <Button type="link" className="text-blue-500 ml-2" onClick={handleDownloadTemplate}>
                            模板下载
                          </Button>
                        </div>

                        {stopWordsFile && (
                          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <Text type="success" strong>已上传的停用词文件：</Text>
                                <div className="mt-1">
                                  <Text code>{stopWordsFile}</Text>
                                </div>
                              </div>
                              <Button
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => {
                                  setStopWordsFile('')
                                  form.setFieldsValue({ stopWords: '' })
                                  message.success('已删除停用词文件')
                                }}
                                className="ml-2"
                              >
                                删除
                              </Button>
                            </div>
                          </div>
                        )}

                        <Form.Item
                          name="stopWords"
                        >
                          <Input
                            placeholder="请输入停用词文件路径，如：jfs://evaluation/stop_words/stop_words_20250828.txt"
                            value={stopWordsFile}
                            hidden
                            onChange={(e) => setStopWordsFile(e.target.value)}
                          />
                        </Form.Item>
                      </div>
                    </div>
                  </Card>
                )}
              </Card>
            </Form>

            {/* 评估指标选择弹窗 */}
            <Modal
              title="评估指标选择"
              open={isModalVisible}
              onCancel={handleCloseModal}
              footer={[
                <Button key="cancel" onClick={handleCloseModal}>
                  取消
                </Button>,
                <Button key="submit" type="primary" onClick={handleConfirmAddMetric}>
                  确定
                </Button>,
              ]}
              width={600}
            >
              <div className="space-y-4">
                {/* 评估指标下拉选择 */}
                <div>
                  <Text className="block mb-2">评估指标</Text>
                  <Select
                    className="w-full"
                    placeholder="请选择评估指标"
                    value={selectedMetricId}
                    onChange={(value) => {
                      setSelectedMetricId(value)
                      // 重置字段映射
                      const metric = availableMetrics.find((m: any) => m.id === value)
                      if (metric && metric.metrics_param) {
                        const initialMapping: Record<string, string> = {}
                        metric.metrics_param.forEach((field: string) => {
                          initialMapping[field] = ''
                        })
                        setSelectedMetricsMapping(initialMapping)
                      }
                    }}
                    loading={metricsLoading}
                  >
                    {availableMetrics.map((metric: any) => (
                      <Select.Option key={metric.id} value={metric.id}>
                        {metric.name}
                      </Select.Option>
                    ))}
                  </Select>
                </div>

                {/* 数据字段关联：业务效果评估+新建推理时用 API 绑定字段（req_/res_）+ 业务测试数据集元数据字段拼接，否则用 availableMetricsFields */}
                {selectedMetricId && (
                  <div>
                    <Text className="block mb-2">数据字段关联</Text>
                    <div className="space-y-3">
                      {(() => {
                        const metric = availableMetrics.find((m: any) => m.id === selectedMetricId)
                        const metricsParam = metric?.metrics_param || []
                        const sourceFieldsForMapping
                      = evaluationPrefix === 'BUSSINESS' && evaluationDataSource === 'new'
                        ? (() => {
                            const firstApiId = selectedApiIdsForBusiness[0]
                            const binding = firstApiId ? apiBindingFieldsByApiIdForBusiness[firstApiId] : null
                            // 数据字段关联使用 API 绑定的原始字段名，不受输入/输出映射中 targetField 修改影响
                            const reqFields = (binding?.request_binding || []).map((b: any) => {
                              const t = b.value || b.name || ''
                              return t ? `req_${t}` : null
                            }).filter(Boolean) as string[]
                            const resFields = (binding?.response_binding || []).map((b: any) => {
                              const t = b.value ?? b.name ?? ''
                              return t ? `res_${t}` : null
                            }).filter(Boolean) as string[]
                            // 拼接业务测试数据集元数据字段（与输入/输出映射处一致：取 name 或字符串本身）
                            const testDatasetFields = (businessTestDatasetMetadataFieldsForBusiness || []).map((f: string | { name?: string, jsonpath?: string }) =>
                              typeof f === 'string' ? f : (f?.name ?? ''),
                            ).filter(Boolean) as string[]
                            const combined = [...reqFields, ...resFields, ...testDatasetFields]
                            return [...new Set(combined)]
                          })()
                        : availableMetricsFields

                        const fieldLabels: Record<string, string> = {
                          input_content: '（用户问题）',
                          actual_output: '（模型答案）',
                          expected_output: '（期待答案）',
                          retrieval_context: '（召回上下文）',
                        }

                        return metricsParam.map((field: string) => (
                          <div key={field} className="flex items-center gap-3">
                            <Space>
                              <Text strong>{field}</Text>
                              <Text type="secondary">{fieldLabels[field] || ''}</Text>
                            </Space>
                            <Select
                              className="flex-1"
                              placeholder="关联数据集字段"
                              value={selectedMetricsMapping[field]}
                              onChange={(value) => handleMetricMappingChange(field, value)}
                              disabled={sourceFieldsForMapping.length === 0}
                            >
                              {sourceFieldsForMapping.map((fieldName: string) => (
                                <Select.Option key={fieldName} value={fieldName}>
                                  {fieldName}
                                </Select.Option>
                              ))}
                            </Select>
                          </div>
                        ))
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </Modal>

            {/* 停用词上传弹窗 */}
            <Modal
              title="上传停用词文件"
              open={isUploadModalVisible}
              onCancel={handleCloseUploadModal}
              footer={null}
              width={500}
            >
              <div className="py-4">
                <Upload.Dragger
                  name="file"
                  accept=".txt"
                  customRequest={handleUploadStopWords}
                  showUploadList={false}
                  disabled={uploading}
                >
                  <p className="ant-upload-drag-icon">
                    <span className="text-5xl">📄</span>
                  </p>
                  <p className="ant-upload-text">
                    {uploading ? '上传中...' : '点击或拖拽文件到此区域上传'}
                  </p>
                  <p className="ant-upload-hint">
                    支持 .txt 格式的停用词文件
                  </p>
                </Upload.Dragger>

                {stopWordsFile && (
                  <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <Text type="success" strong>当前停用词文件：</Text>
                        <div className="mt-1">
                          <Text code>{stopWordsFile}</Text>
                        </div>
                      </div>
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => {
                          setStopWordsFile('')
                          message.success('已删除停用词文件')
                        }}
                        className="ml-2"
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Modal>
          </div>
        </section>
      </div>
    </Spin>
  )
}

export default CreateAutoEvaluationTask
