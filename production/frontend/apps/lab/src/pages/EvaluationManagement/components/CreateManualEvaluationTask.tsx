import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { type CreateManualEvaluationTaskParams, type InferenceParams, type NewDatasetModelRelation, type ProjectEvaluationTaskDetail, manualEvaluationServices } from '@/services/manualEvaluationService'
import { modelEvaluationServices } from '@/services/modelEvaluationServices'
import { inferenceDatasetsServices } from '@/services/inferenceDatasets'
import { inferenceServiceApi } from '@/services/inferenceService'
import { trainingDatasetService } from '@/services/trainingApi'
import {
  DatasetCascaderSelector,
  InferenceParametersConfig,
} from '@/components/inference'
import { useInferenceData } from '@/components/inference/hooks/useInferenceData'
import { useDatasetVersions } from '@/components/inference/hooks/useDatasetVersions'
import type { TrainingDatasetItem } from '@/types/training'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'

const { Text } = Typography
const { TextArea } = Input
const { Option } = Select

interface EvaluationCriteria {
  key: string
  metricId: number
  name: string
  description: string
  metricsMapping: Record<string, string>
  score_min: number
  score_max: number
  score_definitions?: string | string[] // 指标分值定义
  isEnabled: boolean
}

const CreateManualEvaluationTask: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { projectId } = useParams()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
  const [evaluationDataSource, setEvaluationDataSource] = useState<string>('existing')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false) // 提交加载状态
  const urlDatasetType = searchParams.get('dataset_type') as 'text-generation' | 'image-understanding' | null

  // 评估指标数据
  const [evaluationCriteria, setEvaluationCriteria] = useState<EvaluationCriteria[]>([])

  // 添加指标 Modal 相关状态
  const [isAddModalVisible, setIsAddModalVisible] = useState(false)
  const [selectedMetricId, setSelectedMetricId] = useState<number | null>(null)
  const [selectedMetricsMapping, setSelectedMetricsMapping] = useState<Record<string, string>>({})

  // 存储推理结果集的元数据字段（用于数据字段关联）
  const [availableMetricsFields, setAvailableMetricsFields] = useState<string[]>([])

  // 存储当前选择的推理结果集对应的模型名称（用于显示）
  const [currentInferenceDataset, setCurrentInferenceDataset] = useState<string[]>([])

  // 已有推理结果集：与 DatasetCascaderSelector 回显文案一致
  const [selectedInferenceDataset, setSelectedInferenceDataset] = useState<{
    id: number
    modelId: number
    name?: string
  } | null>(null)
  const [selectedInferenceDatasets, setSelectedInferenceDatasets] = useState<Array<{
    id: number
    modelId: number
    modelName?: string
    name?: string
  }>>([])

  // 新建推理结果集相关状态
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [selectedServicesObjs, setSelectedServicesObjs] = useState<any[]>([])
  const [selectedDatasetForNew, setSelectedDatasetForNew] = useState<any | null>(null)
  const [selectedDatasetSourceForNew, setSelectedDatasetSourceForNew] = useState<string | null>(null)
  const [selectedDatasetVersionForNew, setSelectedDatasetVersionForNew] = useState<string | null>(null)
  const [selectedDatasetVersionObjForNew, setSelectedDatasetVersionObjForNew] = useState<any | null>(null)

  /** 由已选数据推导：已有推理结果集多于 1 个为对比；新建时待评估服务多于 1 个为对比 */
  const evaluationType = useMemo((): 'single' | 'comparison' => {
    if (evaluationDataSource === 'existing') {
      return selectedInferenceDatasets.length > 1 ? 'comparison' : 'single'
    }
    return selectedServices.length > 1 ? 'comparison' : 'single'
  }, [evaluationDataSource, selectedInferenceDatasets.length, selectedServices.length])

  // 监听表单中的评估类别字段
  const datasetType = Form.useWatch('dataset_type', form) || 'text-generation'
  const prevDatasetTypeRef = useRef(datasetType)

  // 用户手动切换评估类别时：新建推理仅清空「待评估模型/服务」；已有推理结果集则按原逻辑清空关联数据。
  useEffect(() => {
    if (prevDatasetTypeRef.current === datasetType) return

    prevDatasetTypeRef.current = datasetType

    // 新建推理结果集：评估类别变化时只清空待评估模型/服务，保留已选待推理数据
    if (evaluationDataSource === 'new') {
      setSelectedServices([])
      setSelectedServicesObjs([])
      form.setFieldsValue({ services_to_infer: [] })
      return
    }

    setSelectedServices([])
    setSelectedServicesObjs([])
    setCurrentInferenceDataset([])
    setAvailableMetricsFields([])
    setSelectedInferenceDataset(null)
    setSelectedInferenceDatasets([])
    setSelectedDatasetForNew(null)
    setSelectedDatasetSourceForNew(null)
    setSelectedDatasetVersionForNew(null)
    setSelectedDatasetVersionObjForNew(null)
    form.setFieldsValue({
      services_to_infer: [],
      inferenceResultDatasetId: undefined,
      data_to_infer: undefined,
    })
  }, [datasetType, evaluationDataSource, form])

  // 使用 useInferenceData hook 获取推理数据（仅当选择新建推理结果集时）
  const datasetTypeForNewInference = evaluationDataSource === 'new' ? datasetType : undefined
  const modelTypeForNewInference = evaluationDataSource === 'new' ? datasetType : undefined

  const {
    inferenceServices,
    datasetCascaderOptions,
    setDatasetCascaderOptions,
    loading: inferenceDataLoading,
  } = useInferenceData(projectId, datasetTypeForNewInference, modelTypeForNewInference)

  // 下拉数据来自按类别过滤的 hook；回显对象可能不在其中，合并已选对象避免 Select 空白
  const inferenceServicesForSelect = useMemo(() => {
    const out = [...inferenceServices]
    const exists = (s: any) =>
      out.some((x) => (x.id != null && s.id != null && x.id === s.id) || (x.name && s.name && x.name === s.name))
    for (const obj of selectedServicesObjs) {
      if (obj && !exists(obj))
        out.push(obj)
    }
    return out
  }, [inferenceServices, selectedServicesObjs])

  const { loadDatasetVersions } = useDatasetVersions(
    projectId,
    datasetCascaderOptions,
    setDatasetCascaderOptions,
  )

  const inferenceResultDisplayLabel = useMemo(() => {
    if (evaluationType === 'comparison') {
      if (selectedInferenceDatasets.length === 0) return ''
      return selectedInferenceDatasets.map((d) => d.name || `推理结果集${d.id}`).join('、')
    }
    return selectedInferenceDataset?.name || ''
  }, [evaluationType, selectedInferenceDatasets, selectedInferenceDataset])

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
    enabled: !!projectId && isAddModalVisible,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  })

  const availableMetrics = metricsData?.items || []

  // 处理新建推理结果集的服务选择变化
  const handleNewInferenceServicesChange = (serviceNames: string[]) => {
    const names = Array.isArray(serviceNames) ? serviceNames : (serviceNames ? [serviceNames] : [])
    if (names.length > 5) {
      message.warning('最多只能选择5个服务')
      return
    }
    setSelectedServices(names)
    const serviceObjs = names.map((name) =>
      inferenceServicesForSelect.find((item) => item.name === name),
    ).filter(Boolean)
    setSelectedServicesObjs(serviceObjs)
  }

  const handleInferenceDatasetChange = async (datasetId: number | undefined) => {
    if (!projectId) return
    if (!datasetId) {
      setSelectedInferenceDataset(null)
      setCurrentInferenceDataset([])
      setAvailableMetricsFields([])
      return
    }
    try {
      const details = await inferenceDatasetsServices.getInferenceDatasetDetails(
        Number(projectId),
        datasetId,
      )
      setCurrentInferenceDataset([details.model_name])
      setSelectedInferenceDataset({
        id: datasetId,
        modelId: details.model_id || 0,
        name: details.name,
      })
      try {
        const metadataFields = await inferenceDatasetsServices.getInferenceDatasetIndicators(
          Number(projectId),
          datasetId,
          'default-inference',
        )
        const fields = metadataFields?.fields || metadataFields || []
        setAvailableMetricsFields(Array.isArray(fields) ? fields : [])
      }
      catch {
        setAvailableMetricsFields([])
      }
    }
    catch (error) {
      console.error('获取推理结果集信息失败:', error)
      setAvailableMetricsFields([])
    }
  }

  const handleInferenceDatasetsChange = async (datasetIds: number[]) => {
    if (!projectId) return
    if (datasetIds.length === 0) {
      setSelectedInferenceDatasets([])
      setCurrentInferenceDataset([])
      setAvailableMetricsFields([])
      return
    }
    try {
      const detailsArray = await Promise.all(
        datasetIds.map((datasetId) =>
          inferenceDatasetsServices.getInferenceDatasetDetails(Number(projectId), datasetId),
        ),
      )
      const datasetsInfo = detailsArray.map((details, index) => ({
        id: datasetIds[index],
        modelId: details.model_id || 0,
        modelName: details.model_name,
        name: details.name,
      }))
      setSelectedInferenceDatasets(datasetsInfo)
      setCurrentInferenceDataset(detailsArray.map((d) => d.model_name))
      try {
        const metadataFields = await inferenceDatasetsServices.getInferenceDatasetIndicators(
          Number(projectId),
          datasetIds[0],
          'default-inference',
        )
        const fields = metadataFields?.fields || metadataFields || []
        setAvailableMetricsFields(Array.isArray(fields) ? fields : [])
      }
      catch {
        setAvailableMetricsFields([])
      }
    }
    catch (error) {
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
        void handleInferenceDatasetChange(value[0])
        break
      case Array.isArray(value):
        setSelectedInferenceDataset(null)
        void handleInferenceDatasetsChange(value)
        break
      case typeof value === 'number':
        setSelectedInferenceDatasets([])
        void handleInferenceDatasetChange(value)
        break
      default:
        break
    }
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

  // 清空新建推理结果集的相关数据
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
      setCurrentInferenceDataset([])
      setSelectedInferenceDataset(null)
      setSelectedInferenceDatasets([])
      setAvailableMetricsFields([])
      form.setFieldsValue({
        inferenceResultDatasetId: undefined,
      })
    }
  }

  // 初始化dataset_type
  useEffect(() => {
    if (urlDatasetType && (urlDatasetType === 'text-generation' || urlDatasetType === 'image-understanding')) {
      form.setFieldsValue({ dataset_type: urlDatasetType })
    }
  }, [urlDatasetType, form])

  // 处理克隆数据回显（与自动评估一致：已有推理结果集走 inferenceResultDatasetId + 详情/指标；新建走全量服务列表与数据集解析）
  useEffect(() => {
    const cloneData = (location.state as any)?.cloneData as ProjectEvaluationTaskDetail | undefined
    const timestamp = dayjs().format('YYYYMMDDHHmmss')
    if (!cloneData) return

    setEvaluationDataSource(cloneData.data_source || 'existing')

    form.setFieldsValue({
      taskName: cloneData.name ? `${cloneData.name}_${timestamp}` : '',
      description: cloneData.description || '',
      dataset_type: cloneData.dataset_type || 'text-generation',
      evaluationDataSource: cloneData.data_source || 'existing',
      samplingRate: cloneData.sampling_rate !== undefined && cloneData.sampling_rate !== null
        ? cloneData.sampling_rate
        : undefined,
    })

    void (async () => {
      if (cloneData.data_source === 'existing' && cloneData.dataset_model_relations && projectId) {
        const existingRelations = cloneData.dataset_model_relations.filter(
          (item) => 'inference_result_dataset_id' in item,
        ) as Array<{ inference_result_dataset_id: number }>

        if (existingRelations.length > 0) {
          try {
            if (cloneData.evaluation_type === 'single') {
              const datasetId = existingRelations[0].inference_result_dataset_id
              const [details, metadataFields] = await Promise.all([
                inferenceDatasetsServices.getInferenceDatasetDetails(Number(projectId), datasetId),
                inferenceDatasetsServices.getInferenceDatasetIndicators(
                  Number(projectId),
                  datasetId,
                  'default-inference',
                ),
              ])
              form.setFieldsValue({ inferenceResultDatasetId: datasetId })
              setSelectedInferenceDataset({
                id: datasetId,
                modelId: details.model_id || 0,
                name: details.name,
              })
              setCurrentInferenceDataset([details.model_name])
              const fields = metadataFields?.fields || metadataFields || []
              setAvailableMetricsFields(Array.isArray(fields) ? fields : [])
            }
            else {
              const datasetIds = existingRelations.map((r) => r.inference_result_dataset_id)
              const detailsPromises = datasetIds.map((id) =>
                inferenceDatasetsServices.getInferenceDatasetDetails(Number(projectId), id),
              )
              const metadataFieldsPromise = inferenceDatasetsServices.getInferenceDatasetIndicators(
                Number(projectId),
                datasetIds[0],
                'default-inference',
              )
              const [detailsArray, metadataFields] = await Promise.all([
                Promise.all(detailsPromises),
                metadataFieldsPromise,
              ])
              form.setFieldsValue({ inferenceResultDatasetId: datasetIds })
              setSelectedInferenceDatasets(
                detailsArray.map((details, index) => ({
                  id: datasetIds[index],
                  modelId: details.model_id || 0,
                  modelName: details.model_name,
                  name: details.name,
                })),
              )
              setCurrentInferenceDataset(detailsArray.map((d) => d.model_name))
              const fields = metadataFields?.fields || metadataFields || []
              setAvailableMetricsFields(Array.isArray(fields) ? fields : [])
            }
          }
          catch (error) {
            console.error('获取推理结果集信息失败:', error)
            form.setFieldsValue({
              inferenceResultDatasetId: cloneData.evaluation_type === 'comparison' ? [] : undefined,
            })
            setSelectedInferenceDataset(null)
            setSelectedInferenceDatasets([])
            setCurrentInferenceDataset([])
            setAvailableMetricsFields([])
          }
        }
        else {
          form.setFieldsValue({
            inferenceResultDatasetId: cloneData.evaluation_type === 'comparison' ? [] : undefined,
          })
          setSelectedInferenceDataset(null)
          setSelectedInferenceDatasets([])
          setCurrentInferenceDataset([])
        }
      }
      else if (
        cloneData.data_source === 'new'
        && cloneData.dataset_model_relations
        && cloneData.dataset_model_relations.length > 0
        && projectId
      ) {
        const firstRelation = cloneData.dataset_model_relations[0] as NewDatasetModelRelation
        const relations = cloneData.dataset_model_relations as NewDatasetModelRelation[]

        const toPositiveId = (item: unknown): number | undefined => {
          if (item === null || item === undefined || item === '') return undefined
          const n = typeof item === 'string' ? Number.parseInt(item, 10) : Number(item)
          if (Number.isNaN(n) || n <= 0) return undefined
          return n
        }

        const serviceNameForRelation = (rel: NewDatasetModelRelation, index: number): string | undefined => {
          const direct = rel.online_service_name || rel.model_name || rel.evaluated_model_name
          if (typeof direct === 'string' && direct.trim()) return direct.trim()
          const fromTask = cloneData.evaluated_model_names?.[index]
          if (typeof fromTask === 'string' && fromTask.trim()) return fromTask.trim()
          return undefined
        }

        const hasAnyServiceHint
          = relations.some((rel, i) => {
            const id = toPositiveId(rel.online_service_id) ?? toPositiveId(rel.evaluated_model_id)
            return id != null || !!serviceNameForRelation(rel, i)
          })
          || (relations.length === 1 && typeof cloneData.referee_model_name === 'string' && !!cloneData.referee_model_name.trim())

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
              pool.find((s: any) => {
                const sId = typeof s.id === 'string' ? Number.parseInt(s.id, 10) : Number(s.id)
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
                const byName = pool.find((s: any) => s.name === nm)
                if (byName) return byName
              }
              return undefined
            }).filter(Boolean) as any[]

            if (
              selectedServiceObjs.length === 0
              && relations.length === 1
              && cloneData.referee_model_name?.trim()
            ) {
              const hit = pool.find((s: any) => s.name === cloneData.referee_model_name.trim())
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

        if (firstRelation.inference_params) {
          form.setFieldsValue({
            temperature: firstRelation.inference_params.temperature,
            top_p: firstRelation.inference_params.top_p,
            max_tokens: firstRelation.inference_params.max_tokens,
            presence_penalty: firstRelation.inference_params.presence_penalty,
          })
        }

        if (firstRelation.source_dataset_name && firstRelation.source_dataset_id) {
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

          // eslint-disable-next-line regexp/no-misleading-capturing-group
          const versionMatch = datasetNameWithVersion.match(/^(.+)>(.+)$/)
          const datasetName = versionMatch ? versionMatch[1] : datasetNameWithVersion
          const datasetVersion = versionMatch ? versionMatch[2] : null

          const categoryMapping: Record<string, string> = {
            训练数据集: 'training',
            验证数据集: 'validation',
            测试数据集: 'test',
          }

          const usage = categoryMapping[categoryLabel] || 'training'

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
      else {
        form.setFieldsValue({
          inferenceResultDatasetId: cloneData.evaluation_type === 'comparison' ? [] : undefined,
        })
        setSelectedInferenceDataset(null)
        setSelectedInferenceDatasets([])
        setCurrentInferenceDataset([])
      }

      if (cloneData.evaluation_prompt_config?.metrics) {
        const criteria: EvaluationCriteria[] = cloneData.evaluation_prompt_config.metrics.map((metric, index) => ({
          key: `metric_${Date.now()}_${index}`,
          metricId: metric.system_metric_id || 0,
          name: metric.name,
          description: metric.description || '',
          metricsMapping: metric.metrics_mapping || {},
          score_min: metric.score_min || 0,
          score_max: metric.score_max || 10,
          score_definitions: typeof metric.score_definitions === 'string'
            ? metric.score_definitions.split('\n').filter(Boolean)
            : metric.score_definitions,
          isEnabled: true,
        }))
        setEvaluationCriteria(criteria)
      }

      window.history.replaceState({ ...window.history.state, state: null }, '')
    })()
  }, [location.state, form, projectId])

  const handleBack = () => {
    navigate(`/project/${projectId}/effect-evaluation/manual?dataset_type=${urlDatasetType}`)
  }

  const normalizeInferenceResultIdSingle = (inferId: unknown): number | undefined => {
    if (typeof inferId === 'number' && !Number.isNaN(inferId) && inferId > 0) return inferId
    if (Array.isArray(inferId) && inferId.length === 1) {
      const n = Number(inferId[0])
      if (!Number.isNaN(n) && n > 0) return n
    }
    return undefined
  }

  const handleSubmit = async (values: any) => {
    // 防止重复提交
    if (isSubmitting) {
      return
    }

    try {
      setIsSubmitting(true)

      if (!projectId) {
        message.error('缺少项目ID')
        setIsSubmitting(false)
        return
      }

      // 验证评估指标
      if (evaluationCriteria.length === 0) {
        message.error('请至少添加一个评估指标')
        setIsSubmitting(false)
        return
      }

      // 构建 dataset_model_relations
      let datasetModelRelations: any[] = []
      if (evaluationDataSource === 'existing') {
        const inferId = values.inferenceResultDatasetId
        if (evaluationType === 'single') {
          const id = normalizeInferenceResultIdSingle(inferId)
          if (!id) {
            message.error('请选择推理结果集')
            setIsSubmitting(false)
            return
          }
          datasetModelRelations = [{ inference_result_dataset_id: id, sort_order: 0 }]
        }
        else {
          const ids = Array.isArray(inferId) ? inferId : []
          if (ids.length === 0) {
            message.error('请至少选择一个推理结果集')
            setIsSubmitting(false)
            return
          }
          datasetModelRelations = ids.map((datasetId: number, index: number) => ({
            inference_result_dataset_id: datasetId,
            sort_order: index,
          }))
        }
      }
      else if (evaluationDataSource === 'new') {
        // 新建推理结果集：构建 NewDatasetModelRelation
        if (selectedServices.length === 0 || !selectedDatasetForNew || !selectedDatasetVersionObjForNew) {
          message.error('请完成新建推理结果集的配置')
          setIsSubmitting(false)
          return
        }

        // 验证服务对象是否完整
        if (selectedServicesObjs.length !== selectedServices.length) {
          message.error('部分服务信息加载不完整，请重新选择')
          setIsSubmitting(false)
          return
        }

        // 检查是否有缺失的服务对象
        const missingServices = selectedServicesObjs.some((obj) => !obj)
        if (missingServices) {
          message.error('部分服务对象不存在，请重新选择')
          setIsSubmitting(false)
          return
        }

        // 获取推理参数
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

        // 获取数据集信息
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

        // 生成数据集名称（基于任务名称和时间戳）
        const timestamp = dayjs().format('YYYYMMDDHHmmss')
        const datasetNameForNew = `推理结果集_${values.taskName}_${timestamp}`

        // 为每个选中的服务构建一个 NewDatasetModelRelation
        datasetModelRelations = selectedServicesObjs.map((serviceObj, index) => {
          if (!serviceObj) {
            throw new Error(`服务对象不存在: ${selectedServices[index]}`)
          }

          const serviceId = typeof serviceObj.id === 'string' ? parseInt(serviceObj.id, 10) : serviceObj.id
          const serviceName = serviceObj.name // 服务名称
          const modelName = serviceObj.model_name || serviceObj.name // 模型名称

          return {
            evaluated_model_id: serviceId, // 被评估的模型ID（使用服务ID）
            evaluated_model_name: modelName, // 被评估的模型名称
            sort_order: index,
            inference_method: 'online', // 推理方法：在线推理
            model_id: serviceId, // 模型ID（使用服务ID）
            model_name: modelName, // 模型名称
            online_service_id: serviceId, // 待推理服务ID
            online_service_name: serviceName, // 待推理服务名称
            inference_params: inferenceParams, // 推理参数
            dataset_name: datasetNameForNew + (selectedServices.length > 1 ? `_${index + 1}` : ''), // 数据集名称
            dataset_description: values.description || '', // 数据集描述
            source_dataset_id: Number(datasetId), // 源数据集ID
            source_dataset_name: sourceDatasetName, // 源数据集名称
          } as NewDatasetModelRelation
        })
      }

      // 构建评估指标配置
      const metrics = evaluationCriteria.map((criteria) => ({
        name: criteria.name,
        description: criteria.description,
        system_metric_id: criteria.metricId,
        metrics_mapping: criteria.metricsMapping,
        score_min: criteria.score_min,
        score_max: criteria.score_max,
        score_definitions: Array.isArray(criteria.score_definitions)
          ? criteria.score_definitions.join(';')
          : (criteria.score_definitions || ''),
      }))

      // 构建请求参数
      const params: CreateManualEvaluationTaskParams = {
        name: values.taskName,
        description: values.description || undefined,
        evaluation_type: evaluationType as 'single' | 'comparison',
        dataset_type: (values.dataset_type || 'text-generation') as 'text-generation' | 'image-understanding',
        data_source: evaluationDataSource as 'existing' | 'new',
        evaluation_method: 'manual', // 系统会自动设置为 manual
        data_format: values.dataFormat || undefined,
        dataset_model_relations: datasetModelRelations,
        sampling_rate: values.samplingRate !== undefined && values.samplingRate !== null ? Number(values.samplingRate) : null,
        evaluation_prompt_config: {
          metrics,
        },
      }

      await manualEvaluationServices.createManualEvaluationTask(Number(projectId), params)
      // 触发自动刷新
      queryClient.invalidateQueries({
        queryKey: ['manualEvaluationTasks', projectId],
      })

      message.success('创建人工评估任务成功！')
      handleBack()
    }
    catch (error: any) {
      console.error('创建失败:', error)
      message.error(error?.response?.data?.message || '创建失败，请重试')
    }
    finally {
      setIsSubmitting(false)
    }
  }

  // 打开增加指标弹窗
  const handleAddCriteria = () => {
    setSelectedMetricId(null)
    setSelectedMetricsMapping({})
    setIsAddModalVisible(true)
  }

  // 关闭弹窗
  const handleAddCriteriaCancel = () => {
    setIsAddModalVisible(false)
    setSelectedMetricId(null)
    setSelectedMetricsMapping({})
  }

  // 确认添加指标
  const handleAddCriteriaConfirm = () => {
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

      // 新增模式：检查是否已存在该指标
      const isDuplicate = evaluationCriteria.some((item) => item.metricId === selectedMetricId)
      if (isDuplicate) {
        message.warning('该评估指标已存在，请勿重复添加')
        return
      }

      // 新增模式：添加到列表
      const newMetric: EvaluationCriteria = {
        key: `metric_${Date.now()}`,
        metricId: selectedMetricId,
        name: selectedMetric.name,
        description: selectedMetric.description,
        metricsMapping: selectedMetricsMapping,
        score_min: scoreMin || 0,
        score_max: scoreMax || 10,
        score_definitions: scoreDefinitions,
        isEnabled: true,
      }
      setEvaluationCriteria((prev) => [...prev, newMetric])
      message.success('添加指标成功')
      handleAddCriteriaCancel()
    }
  }

  // 处理指标字段映射变化
  const handleMetricMappingChange = (field: string, value: string) => {
    setSelectedMetricsMapping((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  // 处理删除指标
  const handleDeleteCriteria = (key: string) => {
    setEvaluationCriteria(evaluationCriteria.filter((item) => item.key !== key))
    message.success('删除指标成功')
  }

  const columns = [
    {
      title: '序号',
      dataIndex: 'key',
      key: 'key',
      width: 60,
      render: (_: string, _record: EvaluationCriteria, index: number) => index + 1,
    },
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
      render: (_: any, record: EvaluationCriteria) => {
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
      render: (_: any, record: EvaluationCriteria) => {
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
        // 如果是字符串格式，也处理
        if (record.score_definitions && typeof record.score_definitions === 'string') {
          return (
            <Tooltip title={record.score_definitions} placement="topLeft">
              <div className="line-clamp-3 break-words">
                {record.score_definitions}
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
      width: 120,
      render: (_: unknown, record: EvaluationCriteria) => (
        <Space>
          <Button
            type="link"
            size="small"
            danger
            onClick={() => handleDeleteCriteria(record.key)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="create-form-page">
      <section className="create-form-card">
        <CreateFormPageHeader
          title="创建人工评估任务"
          onBack={handleBack}
          actions={(
            <>
              <Button className="create-form-cancel" onClick={handleBack} disabled={isSubmitting}>取消</Button>
              <Button className="create-form-submit" type="primary" loading={isSubmitting} onClick={() => form.submit()}>
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
              dataset_type: urlDatasetType || 'text-generation',
              evaluationDataSource: 'existing',
              samplingRate: 100,
            }}
          >
            {/* 基本信息 */}
            <Card className="mb-6">
              {/* 基本信息 */}
              <Row gutter={24}>
                <Col span={12}>
                  <Form.Item
                    label="任务名称"
                    name="taskName"
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

              {/* 评估类别 */}
              <Form.Item
                name="dataset_type"
                rules={[{ required: true }]}
                label="评估类别"
                initialValue={urlDatasetType || 'text-generation'}
              >
                <Radio.Group>
                  <Radio value="text-generation">文本生成</Radio>
                  <Radio value="image-understanding">图像理解</Radio>
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
                  statsQuery={{ usage: ['default-inference'], dataset_type: [datasetType] }}
                  fixedListUsage="default-inference"
                  listDatasetType={datasetType}
                  useInferenceResultApi
                  inferenceMultiSelect
                  inferenceDisplayName={inferenceResultDisplayLabel}
                  onChange={handleExistingInferenceResultDatasetChange}
                />
              )}

              <Form.Item
                label="数据采样率（可选）"
                name="samplingRate"
                tooltip="数据随机采样率（1-100%），默认100%"
              >
                <InputNumber
                  placeholder="请输入采样率（1-100）"
                  min={0}
                  max={100}
                  className="w-full"
                  addonAfter="%"
                />
              </Form.Item>

              {evaluationDataSource === 'new' && (
                <>
                  {/* 推理方式 */}
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

                  {/* 待评估模型/服务 */}
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
                        className="w-[400px]"
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
                        /5)
                      </span>
                    </div>
                  </Form.Item>

                  {/* 推理参数配置 */}
                  {selectedServices.length > 0 && (
                    <InferenceParametersConfig form={form} />
                  )}

                  {/* 待推理数据 */}
                  <DatasetCascaderSelector
                    form={form}
                    options={datasetCascaderOptions}
                    onLoadData={loadDatasetVersions}
                    onChange={handleNewDatasetCascaderChange}
                    filter={filterNewDatasetCascader}
                    loading={inferenceDataLoading.datasets}
                    label="待推理数据"
                    statsQuery={{ training_method_type: ['sft'], dataset_type: [datasetType] }}
                    listDatasetType={datasetType}
                  />
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

            {/* 评估配置 */}
            <Card title="评估配置" className="mb-6">

              {/* 评估指标 */}
              <div className="mb-4 flex items-center justify-between">
                <Text strong>评估指标</Text>
                <Button type="primary" size="small" onClick={handleAddCriteria}>
                  添加指标
                </Button>
              </div>

              <Table
                columns={columns}
                dataSource={evaluationCriteria}
                pagination={false}
                scroll={{ x: 800 }}
                size="small"
                bordered
                rowKey="key"
                locale={{ emptyText: '暂无评估指标，请点击"添加指标"按钮添加' }}
              />
            </Card>

            {/* 添加指标 Modal */}
            <Modal
              title="评估指标选择"
              open={isAddModalVisible}
              onCancel={handleAddCriteriaCancel}
              footer={[
                <Button key="cancel" onClick={handleAddCriteriaCancel}>
                  取消
                </Button>,
                <Button key="submit" type="primary" onClick={handleAddCriteriaConfirm}>
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

                {/* 数据字段关联 */}
                {selectedMetricId && (
                  <div>
                    <Text className="block mb-2">数据字段关联</Text>
                    <div className="space-y-3">
                      {(() => {
                        const metric = availableMetrics.find((m: any) => m.id === selectedMetricId)
                        const metricsParam = metric?.metrics_param || []

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
                              disabled={availableMetricsFields.length === 0}
                            >
                              {availableMetricsFields.map((fieldName: string) => (
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

          </Form>
        </div>
      </section>
    </div>
  )
}

export default CreateManualEvaluationTask
