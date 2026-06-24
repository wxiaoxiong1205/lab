import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Layout,
  Popover,
  Radio,
  Select,
  Space,
  Switch,
  TimePicker,
  Tooltip,
  message,
} from 'antd'
import {
  CloudUploadOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import type { RcFile } from 'antd/es/upload'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import datasetTypeRoleImage from '../../assets/dataset_type_role.png'
import datasetTypeBasedImage from '../../assets/dataset_type_based.png'
import datasetTypeRoleTextImage from '../../assets/dataset_type_role_text.png'
import { inferenceResultSetService } from '@/services/inferenceApi'
import apiService from '@/services/apiService'
import { trainingDatasetService } from '@/services/trainingApi'
import { InferenceMethod } from '@/types/inference/index'
import {
  BasicInfoForm,
  DatasetCascaderSelector,
  GPUResourceCascaderSelector,
  InferenceParametersConfig,
  RefereeInferenceParametersConfig,
} from '@/components/inference'
import {
  useInferenceData,
} from '@/components/inference/hooks/useInferenceData'
import { useDatasetVersions } from '@/components/inference/hooks/useDatasetVersions'
import { useGPUResources } from '@/components/inference/hooks/useGPUResources'
import type { ChunkFileUploaderRef } from '@/components/common/ChunkFileUploader'
import ChunkFileUploader from '@/components/common/ChunkFileUploader'
import type { DatasetEnumConfig } from '@/types/enum'
import type { TrainingDatasetItem } from '@/types/training'
import { downloadInferenceResultSetSample } from '@/utils/download'
import ModelsCascader from '@/components/models/modelsCascader'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'
import './CreateInferenceResultSetPage.css'

const { Option } = Select
const TEXT_FILE_MAX_SIZE_MB = 500
const IMAGE_FILE_MAX_SIZE_MB = 1024

// 映射项接口
interface MappingItem {
  sourceField: string // 业务测试数据集字段
  targetField: string // name 或字段映射
}

// 输入字段映射组件（request_binding）
function RequestMappingComponent(params: {
  sourceFields: { label: string, value: string }[]
  name: string // 从 request_binding 来的 name
  mapping: MappingItem
  onChange: (mapping: MappingItem) => void
}) {
  const { sourceFields, name, mapping, onChange } = params

  const handleSourceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...mapping,
      sourceField: e.target.value,
    })
  }

  const handleTargetChange = (value: string) => {
    onChange({
      ...mapping,
      targetField: value,
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="请输入字段映射"
        className="w-[200px]"
        value={mapping.sourceField}
        onChange={handleSourceChange}
      />
      <span className="text-xl text-gray-400 px-2">→</span>
      <Select
        placeholder="请选择业务测试数据集元数据字段"
        className="w-[200px]"
        options={sourceFields}
        value={mapping.targetField || undefined}
        onChange={handleTargetChange}
      />
    </div>
  )
}

// 输出字段映射组件（response_binding）
function ResponseMappingComponent(params: {
  name: string // 从 response_binding 来的 name
  mapping: MappingItem
  onChange: (mapping: MappingItem) => void
}) {
  const { name, mapping, onChange } = params

  const handleTargetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...mapping,
      targetField: e.target.value,
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        readOnly
        className="w-[200px] bg-[var(--lab-color-surface-page)]"
        value={name || ''}
      />
      <span className="text-xl text-gray-400 px-2">→</span>
      <Input
        placeholder="请输入字段映射"
        className="w-[200px]"
        value={mapping.targetField || name || ''}
        onChange={handleTargetChange}
      />
    </div>
  )
}

/**
 * 创建推理结果集页面组件
 */
const CreateInferenceResultSetPage: React.FC<{ usage?: string }> = ({ usage }) => {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
  const validateTimeoutRef = useRef<number | null>(null)

  // 获取编辑ID（从location.state中获取）
  const editId = (location.state as any)?.editId

  // 状态管理
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedModelType, setSelectedModelType] = useState<
    'base' | 'trained' | null
  >(null)
  const [selectedModel, setSelectedModel] = useState<number | null>(null)
  const [selectedService, setSelectedService] = useState<string | null>(null)
  const [selectedServiceObj, setSelectedServiceObj] = useState<any | null>(null)
  const [selectedDatasetObj, setSelectedDatasetObj] = useState<any | null>(null)
  const [datasetSelectorModalOpen, setDatasetSelectorModalOpen] = useState(false)
  const [selectedDatasetSource, setSelectedDatasetSource] = useState<string | null>(null)
  const [selectedDatasetVersion, setSelectedDatasetVersion] = useState<string | null>(null)
  const [selectedDatasetVersionObj, setSelectedDatasetVersionObj] = useState<any | null>(null)
  const [uploadMethod, setUploadMethod] = useState<'local' | 'url'>('local')
  const [dataSource, setDataSource] = useState<string>('text-generation')
  const [dataFormatOptions, setDataFormatOptions] = useState<DatasetEnumConfig | null>(null)
  const [chunkUploadId, setChunkUploadId] = useState<string | null>(null)
  const chunkUploaderRef = useRef<ChunkFileUploaderRef>(null)

  const [scheduleEnabled, setScheduleEnabled] = useState<boolean>(false)
  const dataFormat = Form.useWatch('dataFormat', form)
  const selectedModelField = Form.useWatch('model_to_infer', form)

  // 标记是否已经回显过数据（避免重复回显覆盖用户选择）
  const hasPopulatedRef = useRef<boolean>(false)

  // 保存编辑时的原始数据集信息（用于提交时判断是否修改）
  const originalDatasetRef = useRef<{
    source_dataset_id?: number
    source_dataset_name?: string
  } | null>(null)

  // 当为业务推理结果的时候，只有导入和api
  const inferenceMethodOptions = useMemo(() => {
    const options = [
      { value: InferenceMethod.OFFLINE, label: '离线推理' },
      { value: InferenceMethod.ONLINE, label: '在线推理' },
      { value: InferenceMethod.IMPORT, label: '导入推理结果集' },
      { value: InferenceMethod.API, label: 'API服务' },
    ].filter((option) => editId ? option.label !== 'API服务' : true)

    switch (usage) {
      case 'business-inference':
        return options.filter((option) =>
          [
            InferenceMethod.IMPORT,
            InferenceMethod.API,
          ].includes(option.value),
        )
      default:
        return options.filter((option) =>
          [
            InferenceMethod.OFFLINE,
            InferenceMethod.ONLINE,
            InferenceMethod.IMPORT,
          ].includes(option.value),
        )
    }
  }, [usage])

  const [inferenceMethod, setInferenceMethod] = useState<InferenceMethod>(
    inferenceMethodOptions[0].value,
  )

  // 使用 Hooks 获取数据
  // 对于离线推理和在线推理，根据数据用途过滤数据
  // dataset_type 和 model_type 使用相同的值（数据用途的值）
  const datasetTypeForFilter = (inferenceMethod === InferenceMethod.OFFLINE || inferenceMethod === InferenceMethod.ONLINE)
    ? dataSource
    : undefined
  const modelTypeForFilter = (inferenceMethod === InferenceMethod.OFFLINE || inferenceMethod === InferenceMethod.ONLINE)
    ? dataSource
    : undefined

  const {
    baseModels,
    trainedModels,
    inferenceServices,
    gpuCascaderOptions,
    setGpuCascaderOptions,
    datasets,
    datasetCascaderOptions,
    setDatasetCascaderOptions,
    loading: dataLoading,
    errors: dataErrors,
    isLoading: isDataLoading,
    hasError: hasDataError,
    retryAll,
    retry,
  } = useInferenceData(projectId, datasetTypeForFilter, modelTypeForFilter)

  const { loadDatasetVersions } = useDatasetVersions(
    projectId,
    datasetCascaderOptions,
    setDatasetCascaderOptions,
  )

  const { loadGpuModelData, gpuModels } = useGPUResources(projectId)

  // 获取编辑数据（如果有editId）
  const { data: editData, isLoading: loadingEditData } = useQuery({
    queryKey: ['inference-result-set-detail', projectId, editId],
    queryFn: () => inferenceResultSetService.detail(Number(projectId!), editId!),
    enabled: !!editId && !!projectId && !isNaN(Number(projectId)),
    gcTime: 0,
  })

  // 获取 API 列表
  const { data: apiListData, isLoading: loadingApiList } = useQuery({
    queryKey: ['api-list', projectId],
    queryFn: () => apiService.getApiList(Number(projectId!), { page_num: 1, page_size: 100 }),
    enabled: inferenceMethod === InferenceMethod.API && !!projectId && !isNaN(Number(projectId)),
    staleTime: 0, // 数据立即过期，不缓存
    gcTime: 0, // 不缓存数据（React Query v5+ 使用 gcTime 替代 cacheTime）
    refetchOnMount: 'always', // 每次挂载时都重新获取
  })

  // 转换 API 列表为 Select 选项格式
  const apiOptions = useMemo(() => {
    if (!apiListData?.items) return []
    return apiListData.items.map((item) => ({
      label: item.name,
      value: item.id,
    }))
  }, [apiListData])

  // API绑定字段状态
  const [apiBindingFields, setApiBindingFields] = useState<{
    request_binding: { label: string, value: string, desc?: string, name?: string, jsonpath?: string }[]
    response_binding: { label: string, value: string, desc?: string, name?: string, jsonpath?: string }[]
  } | null>(null)
  const [loadingBindingFields, setLoadingBindingFields] = useState(false)

  // 业务测试数据集字段状态（用于其他用途）
  const [businessTestDatasetFields, setBusinessTestDatasetFields] = useState<string[]>([])
  const [loadingDatasetFields, setLoadingDatasetFields] = useState(false)

  // 业务测试数据集元数据字段状态（用于 request_binding 右侧 Select）
  const [businessTestDatasetMetadataFields, setBusinessTestDatasetMetadataFields] = useState<string[]>([])
  const [loadingMetadataFields, setLoadingMetadataFields] = useState(false)

  // 选中的API对象和业务测试数据集对象
  const [selectedApiObj, setSelectedApiObj] = useState<any | null>(null)
  const [selectedBusinessTestDatasetObj, setSelectedBusinessTestDatasetObj] = useState<any | null>(null)

  // 字段映射状态 - 根据 request_binding 和 response_binding 自动生成
  const [requestMappings, setRequestMappings] = useState<MappingItem[]>([])
  const [responseMappings, setResponseMappings] = useState<MappingItem[]>([])

  const [selectedModelObj, setSelectedModelObj] = useState<string[]>(null)

  // 同步表单中选择的模型，确保参数区显示/提交逻辑与模型选择保持一致
  useEffect(() => {
    setSelectedModel(selectedModelField?.id ?? null)
  }, [selectedModelField])

  // 处理API选择变化
  const handleApiChange = async (apiId: number | undefined) => {
    if (!projectId || !apiId || isNaN(Number(projectId))) {
      setApiBindingFields(null)
      setSelectedApiObj(null)
      setRequestMappings([])
      setResponseMappings([])
      form.setFieldsValue({ api: undefined })
      return
    }

    // 保存选中的API对象
    const api = apiListData?.items?.find((item) => item.id === apiId)
    setSelectedApiObj(api || null)

    setLoadingBindingFields(true)
    try {
      const fields = await apiService.getApiBindingFields(Number(projectId), apiId)

      // 转换绑定字段为选项格式，保留desc、name和jsonpath信息
      const requestOptions = (fields.request_binding || []).map((field) => ({
        label: `${field.desc || field.name || ''} (${field.name || ''})`,
        value: field.name || '',
        desc: field.desc,
        name: field.name || '',
        jsonpath: field.jsonpath || '',
      }))

      const responseOptions = (fields.response_binding || []).map((field) => ({
        label: `${field.desc || field.name || ''} (${field.name || ''})`,
        value: field.name || '',
        desc: field.desc,
        name: field.name || '',
        jsonpath: field.jsonpath || '',
      }))

      setApiBindingFields({
        request_binding: requestOptions,
        response_binding: responseOptions,
      })

      // 根据 request_binding 和 response_binding 自动生成映射项
      // 输入映射：sourceField 初始值为 name（回显到左侧输入框），targetField 初始为空
      const requestMaps = (fields.request_binding || []).map((field) => ({
        sourceField: field.name, // name 回显到左侧输入框
        targetField: '', // 右侧 Select
      }))
      // 输出映射：targetField 初始值为 name，用户可修改
      const responseMaps = (fields.response_binding || []).map((field) => ({
        sourceField: '',
        targetField: field.name, // 初始值为 name
      }))

      setRequestMappings(requestMaps)
      setResponseMappings(responseMaps)
    }
    catch (error) {
      console.error('获取API绑定字段失败:', error)
      message.error('获取API绑定字段失败，请稍后重试')
      setApiBindingFields(null)
    }
    finally {
      setLoadingBindingFields(false)
    }
  }

  // 处理业务测试数据集选择变化（DatasetCascaderSelector：[usage, dataset_name, version]）
  const handleBusinessTestDatasetChange = async (value?: any[], selectedOptions?: any[]) => {
    if (!projectId || isNaN(Number(projectId))) {
      setBusinessTestDatasetFields([])
      setBusinessTestDatasetMetadataFields([])
      setSelectedBusinessTestDatasetObj(null)
      setRequestMappings((prev) => prev.map((m) => ({ ...m, targetField: '' })))
      form.setFieldsValue({ business_test_dataset: undefined })
      return
    }
    if (!value || value.length < 3 || !selectedOptions?.[1]) {
      setBusinessTestDatasetFields([])
      setBusinessTestDatasetMetadataFields([])
      setSelectedBusinessTestDatasetObj(null)
      setRequestMappings((prev) => prev.map((m) => ({ ...m, targetField: '' })))
      form.setFieldsValue({ business_test_dataset: undefined })
      return
    }

    const dataset = (selectedOptions[1] as { data?: TrainingDatasetItem }).data
    setSelectedBusinessTestDatasetObj(dataset || null)

    setLoadingMetadataFields(true)
    try {
      const datasetId = dataset?.id
      if (datasetId == null) {
        setBusinessTestDatasetMetadataFields([])
        setRequestMappings((prev) => prev.map((m) => ({ ...m, targetField: '' })))
        return
      }
      const metadataFields = await apiService.getBusinessInferenceMetadataFields(
        Number(projectId),
        datasetId,
      )
      const fields = metadataFields || []
      const metadataFieldsArray = Array.isArray(fields) ? fields : []
      setBusinessTestDatasetMetadataFields(metadataFieldsArray)
      setRequestMappings((prev) => prev.map((m) => ({ ...m, targetField: '' })))
    }
    catch {
      setBusinessTestDatasetMetadataFields([])
      setRequestMappings((prev) => prev.map((m) => ({ ...m, targetField: '' })))
    }
    finally {
      setLoadingMetadataFields(false)
    }
  }

  // 生成默认数据集名称
  const generateDefaultName = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hour = String(now.getHours()).padStart(2, '0')
    const minute = String(now.getMinutes()).padStart(2, '0')
    const second = String(now.getSeconds()).padStart(2, '0')
    return `推理结果集_${year}_${month}_${day}_${hour}_${minute}_${second}`
  }

  // 初始化表单默认值（仅在非编辑模式下）
  useEffect(() => {
    if (!editId) {
      const defaultName = generateDefaultName()
      form.setFieldsValue({
        name: defaultName,
        temperature: 0.7,
        top_p: 1.0,
        presence_penalty: 0.0,
        gpu_count: 1,
      })
    }
  }, [form, editId])

  // 当editId变化时，重置回显标志位和原始数据集信息
  useEffect(() => {
    hasPopulatedRef.current = false
    originalDatasetRef.current = null
  }, [editId])

  // ============================ 回显表单 ============================
  const initOfflineForm = (data) => {
    if (data.model_id && data.model_name) {
      const modelType
        = data.model_source === 'base_model'
          ? 'base'
          : data.model_source === 'trained_model'
            ? 'trained'
            : undefined

      if (modelType) {
        let version: string | undefined
        if (modelType === 'trained') {
          version = data?.model_version ?? 'v1'
        }

        form.setFieldsValue({
          model_to_infer: {
            id: data.model_id,
            name: data.model_name,
            type: modelType,
            ...(modelType === 'trained' ? { version } : {}),
          },
        })
      }
    }

    // 回显推理参数（离线推理使用referee_前缀）
    if (data.inference_params) {
      try {
        const params = typeof data.inference_params === 'string'
          ? JSON.parse(data.inference_params)
          : data.inference_params
        form.setFieldsValue({
          referee_temperature: params.temperature,
          referee_top_p: params.top_p,
          referee_presence_penalty: params.presence_penalty,
          referee_max_tokens: params.max_tokens,
        })
      }
      catch (e) {
        console.error('解析推理参数失败:', e)
      }
    }

    // 保存原始数据集信息
    if (data.source_dataset_id || data.source_dataset_name) {
      originalDatasetRef.current = {
        source_dataset_id: data.source_dataset_id,
        source_dataset_name: data.source_dataset_name,
      }
    }

    // 回显数据集（根据source_dataset_name解析级联选择器的值）
    // source_dataset_name格式可能是：分类/数据集名称>版本 或 数据集名称>版本
    if (data.source_dataset_name) {
      try {
        const parts = data.source_dataset_name.split('>')
        const datasetPart = parts[0]
        const version = parts[1]
        const datasetParts = datasetPart.split('/')

        let cascaderValue: any[] = []
        if (datasetParts.length >= 2) {
          // 有分类：分类/数据集名称>版本
          cascaderValue = [datasetParts[0], datasetParts[1]]
          if (version) {
            cascaderValue.push(version)
          }
        }
        else {
          // 无分类：数据集名称>版本
          cascaderValue = [datasetPart]
          if (version) {
            cascaderValue.push(version)
          }
        }

        if (cascaderValue.length > 0) {
          form.setFieldsValue({ data_to_infer: cascaderValue })
        }
      }
      catch (e) {
        console.error('解析数据集名称失败:', e)
      }
    }

    // 回显GPU资源配置
    if (data.graphics_card_resource) {
      const populateGpuResourceFields = async () => {
        const gpuResource = typeof data.graphics_card_resource === 'string'
          ? JSON.parse(data.graphics_card_resource)
          : data.graphics_card_resource
        if (!gpuResource.card_type) return

        const gpuTypeOption = gpuCascaderOptions.find(
          (option: any) => option.value === gpuResource.card_type,
        )

        // 回显前先确保二级型号已加载，保证Cascader展示label（desc）
        if (gpuTypeOption && (!gpuTypeOption.children || gpuTypeOption.children.length === 0)) {
          await loadGpuModelData(
            [gpuTypeOption],
            setGpuCascaderOptions,
            gpuCascaderOptions,
          )
        }

        // loadGpuModelData 结束后，优先使用当前 option 上的 children（避免依赖异步 setState 的时序）
        const gpuChildren = gpuTypeOption?.children || []
        const matchedGpuOption = gpuChildren.find((child: any) =>
          child.value === gpuResource.k8s_resource_type
          || child.model === gpuResource.k8s_resource_type
          || child.value === gpuResource.card_model
          || child.label === gpuResource.card_model,
        )
        const gpuModelValue
          = matchedGpuOption?.value || gpuResource.k8s_resource_type || gpuResource.card_model

        form.setFieldsValue({
          gpu_type: gpuModelValue ? [gpuResource.card_type, gpuModelValue] : [gpuResource.card_type],
          gpu_count: gpuResource.count || 1,
          graphics_card_resource: {
            cpu_request: gpuResource.cpu_request,
            cpu_limit: gpuResource.cpu_limit,
            memory_request: gpuResource.memory_request,
            memory_limit: gpuResource.memory_limit,
          },
        })
      }

      populateGpuResourceFields().catch((e) => {
        console.error('解析GPU资源配置失败:', e)
      })
    }
  }
  const initOnlineForm = (data) => {
    setSelectedServiceObj({
      id: data?.online_service_id,
    })
    // 在线推理：回显服务
    if (data.online_service_name) {
      form.setFieldsValue({ service_to_infer: data.online_service_name })
      setSelectedService(data.online_service_name)
    }

    // 回显推理参数
    if (data.inference_params) {
      try {
        const params = typeof data.inference_params === 'string'
          ? JSON.parse(data.inference_params)
          : data.inference_params
        form.setFieldsValue({
          temperature: params.temperature,
          top_p: params.top_p,
          presence_penalty: params.presence_penalty,
          max_tokens: params.max_tokens,
        })
      }
      catch (e) {
        console.error('解析推理参数失败:', e)
      }
    }

    // 保存原始数据集信息
    if (data.source_dataset_id || data.source_dataset_name) {
      originalDatasetRef.current = {
        source_dataset_id: data.source_dataset_id,
        source_dataset_name: data.source_dataset_name,
      }
    }

    // 回显数据集（根据source_dataset_name解析级联选择器的值）
    if (data.source_dataset_name) {
      try {
        const parts = data.source_dataset_name.split('>')
        const datasetPart = parts[0]
        const version = parts[1]
        const datasetParts = datasetPart.split('/')

        let cascaderValue: any[] = []
        if (datasetParts.length >= 2) {
          // 有分类：分类/数据集名称>版本
          cascaderValue = [datasetParts[0], datasetParts[1]]
          if (version) {
            cascaderValue.push(version)
          }
        }
        else {
          // 无分类：数据集名称>版本
          cascaderValue = [datasetPart]
          if (version) {
            cascaderValue.push(version)
          }
        }

        if (cascaderValue.length > 0) {
          form.setFieldsValue({ data_to_infer: cascaderValue })
        }
      }
      catch (e) {
        console.error('解析数据集名称失败:', e)
      }
    }
  }
  const initApiForm = async (data) => {
    // API服务：回显API和业务测试数据集（级联值为 [business_test, dataset_name, version]）
    if (data.online_service_id) {
      form.setFieldsValue({ api: data.online_service_id })
      await handleApiChange(data.online_service_id)
    }
    if (projectId) {
      // 业务测试数据集名称优先取 business_test_dataset，其次回退到 source_dataset_name
      const businessTestDatasetName = typeof data.business_test_dataset === 'string'
        ? data.business_test_dataset
        : (Array.isArray(data.business_test_dataset) && data.business_test_dataset.length >= 2
            ? data.business_test_dataset[1]
            : undefined)

      const parsedFromSource = (() => {
        const src = data.source_dataset_name
        if (!src) return { name: undefined, version: undefined }
        const [beforeVersion, afterVersion] = src.split('>')
        const name = (beforeVersion || '').split('/').filter(Boolean).pop()
        const version = afterVersion || undefined
        return { name, version }
      })()

      const name = businessTestDatasetName || parsedFromSource.name
      const preferredVersion = Array.isArray(data.business_test_dataset) && data.business_test_dataset.length >= 3
        ? data.business_test_dataset[2]
        : parsedFromSource.version

      if (name) {
        void (async () => {
          try {
            // 通过数据集名称获取详情，用于拿到 id/versions，确保级联回显与元数据字段加载
            const raw = await trainingDatasetService.detail(Number(projectId), name, 'business_test', 'completed')
            const list = Array.isArray(raw) ? raw : [raw]
            const first = list[0] as TrainingDatasetItem & { version?: string }
            const ver = preferredVersion
              ?? first?.version
              ?? (first as any)?.versions?.[0]?.version
              ?? (first as any)?.latest_version
              ?? ''

            form.setFieldsValue({ business_test_dataset: ['business_test', name, ver] })

            const row: TrainingDatasetItem = {
              ...first,
              id: first?.id ?? data.source_dataset_id,
              dataset_name: name,
              usage: 'business_test',
            }
            setSelectedBusinessTestDatasetObj(row)

            setLoadingMetadataFields(true)
            try {
              const datasetId = row?.id
              if (datasetId != null) {
                const metadataFields = await apiService.getBusinessInferenceMetadataFields(
                  Number(projectId),
                  Number(datasetId),
                )
                const metadataFieldsArray = Array.isArray(metadataFields) ? metadataFields : []
                setBusinessTestDatasetMetadataFields(metadataFieldsArray)
                setRequestMappings((prev) => prev.map((m) => ({ ...m, targetField: '' })))
              }
              else {
                setBusinessTestDatasetMetadataFields([])
              }
            }
            finally {
              setLoadingMetadataFields(false)
            }
          }
          catch (e) {
            console.error('回显业务测试数据集失败:', e)
          }
        })()
      }
    }
  }
  const initImportForm = (data) => {
    form.setFieldsValue({
      model_name: data.model_name,
      dataFormat: data.dataset_format,
    })
    // 导入推理结果集：回显上传方式和文件URL
    if (data.file_url) {
      setUploadMethod('url')
      form.setFieldsValue({
        upload_method: 'url',
        file_url: data.file_url,
      })
    }
    else {
      form.setFieldsValue({ upload_method: 'local' })
    }
  }
  // 编辑模式：回显数据（只执行一次）
  useEffect(() => {
    // 如果已经回显过，或者没有编辑数据，或者模型列表未加载完成，则不执行
    if (hasPopulatedRef.current || !editData || !editId) {
      return
    }

    const data = editData

    if (data.schedule_at) {
      // schedule_at 格式：YYYY-MM-DDTHH:mm:ss
      const scheduleDateTime = dayjs(data.schedule_at)
      if (scheduleDateTime.isValid()) {
        setScheduleEnabled(true)
        form.setFieldsValue({
          schedule_enabled: true,
          schedule_date: scheduleDateTime,
          schedule_time: scheduleDateTime,
        })
      }
    }

    // 对于离线推理，需要等待模型和GPU选项加载完成
    if (data.inference_method === InferenceMethod.OFFLINE) {
      if (!baseModels || baseModels.length === 0 || !gpuCascaderOptions || gpuCascaderOptions.length === 0) {
        return // 等待依赖数据加载完成
      }
    }

    // 标记已经回显过
    hasPopulatedRef.current = true

    // 回显基本信息
    form.setFieldsValue({
      name: data.name || '',
      description: data.description || '',
    })

    // 回显推理方式
    const inference_method = data.inference_method === 'third_api' ? InferenceMethod.API : data.inference_method
    if (inference_method) {
      setInferenceMethod(inference_method)
      form.setFieldsValue({ inference_method })
    }

    // 回显数据用途（离线推理和在线推理需要）
    if (data.dataset_type && (data.inference_method !== InferenceMethod.API)) {
      setDataSource(data.dataset_type)
      form.setFieldsValue({ dataset_type: data.dataset_type })
    }

    // 根据推理方式回显对应的字段
    switch (inference_method) {
      case InferenceMethod.OFFLINE:
        initOfflineForm(data)
        break
      case InferenceMethod.ONLINE:
        initOnlineForm(data)
        break
      case InferenceMethod.API:
        initApiForm(data)
        break
      case InferenceMethod.IMPORT:
        initImportForm(data)
        break
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editData, editId, baseModels, trainedModels, gpuCascaderOptions]) // 当编辑依赖数据加载完成时执行，但只执行一次

  // 加载数据格式选项
  useEffect(() => {
    try {
      const projectEnumValues = JSON.parse(localStorage.getItem('projectEnumValues') || '[]')
      if (projectEnumValues) {
        const formatOptions = projectEnumValues.all_enums.find((item: any) => item.enum_name === 'DatasetFormat')
        formatOptions.options = formatOptions.options.filter((item: any) => !['business', 'prefix-suffix-middle', 'alpaca'].includes(item.value))
        setDataFormatOptions(formatOptions)
      }
    }
    catch (error) {
      console.error('解析数据集枚举值失败:', error)
    }
  }, [])

  // 根据数据源类型设置默认数据格式
  useEffect(() => {
    if (dataFormatOptions && dataFormatOptions.options && dataFormatOptions.options.length > 0) {
      const currentDataFormat = form.getFieldValue('dataFormat')
      // 如果数据格式未设置或者是 undefined/null，则根据数据源类型设置默认值
      const availableDataFormats = dataFormatOptions.options.map((option) => option.value)
      if (!currentDataFormat || !availableDataFormats.includes(currentDataFormat)) {
        if (dataSource === 'image-understanding') {
          form.setFieldValue('dataFormat', 'role-based')
        }
        else if (dataSource === 'text-generation') {
          form.setFieldValue('dataFormat', 'prompt-response')
        }
        else {
          form.setFieldValue('dataFormat', dataFormatOptions.options[0].value)
        }
      }
    }
  }, [form, dataSource, dataFormatOptions])

  // 数据用途选项
  const dataSourceOptions = [
    { value: 'text-generation', label: '文本生成', disabled: false, icon: <FileTextOutlined /> },
    { value: 'image-understanding', label: '图像理解', disabled: false, icon: <CloudUploadOutlined /> },
    // { value: 'image-generation', label: '图像生成', disabled: true, icon: <DatabaseOutlined /> },
  ]

  // 处理数据用途变化
  const handleDataSourceChange = (e: any) => {
    const value = typeof e === 'string' ? e : e.target.value
    setDataSource(value)
    // 如果选择图像理解，自动设置数据格式为 role-based
    if (value === 'image-understanding') {
      form.setFieldValue('dataFormat', 'role-based')
    }
    else if (value === 'text-generation') {
      // 如果选择文本生成，自动设置数据格式为 prompt-response
      form.setFieldValue('dataFormat', 'prompt-response')
    }
    // 切换数据用途时重置上传的文件
    setSelectedFile(null)
    setChunkUploadId(null)
  }

  // 根据数据源类型获取允许的文件类型
  const getAcceptType = () => {
    if (dataSource === 'image-understanding') {
      return '.zip'
    }
    else if (usage === 'business-inference') {
      return '.jsonl,.json,.xlsx,.csv'
    }
    else {
      return '.jsonl,.json,.xlsx,.csv'
    }
  }
  const getMaxFileSizeMB = () => {
    return dataSource === 'image-understanding' ? IMAGE_FILE_MAX_SIZE_MB : TEXT_FILE_MAX_SIZE_MB
  }
  const getMaxFileSizeLabel = () => {
    return dataSource === 'image-understanding' ? '1G' : '500M'
  }

  // 文件验证函数
  const validateFile = (file: RcFile): boolean => {
    // 图像理解类型只支持 zip 文件
    if (dataSource === 'image-understanding') {
      const isZip = file.name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed'
      if (!isZip) {
        message.error('图像理解类型只支持 zip 文件格式!')
        return false
      }
    }
    else {
      // 文本生成类型支持 jsonl、json、xlsx、csv
      const isJsonl = file.name.endsWith('.jsonl')
      const isJson = file.name.endsWith('.json') || file.type === 'application/json'
      const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.name.endsWith('.xlsx')
      const isCsv = file.name.endsWith('.csv') || file.type === 'text/csv'

      if (usage === 'business-inference') {
        if (!isJsonl && !isJson && !isExcel && !isCsv) {
          message.error('只支持 jsonl、json、xlsx 和 csv 文件格式!')
          return false
        }
      }
      else {
        if (!isJsonl && !isJson && !isExcel) {
          message.error('只支持 jsonl、json 和 xlsx 文件格式!')
          return false
        }
      }
    }
    const maxFileSizeMB = getMaxFileSizeMB()
    if (file.size / 1024 / 1024 > maxFileSizeMB) {
      message.error(`文件大小不能超过 ${getMaxFileSizeLabel()}!`)
      return false
    }
    return true
  }

  // 获取提示文本
  const getHintText = () => {
    if (dataSource === 'image-understanding') {
      return (
        <>
          <p className="ant-upload-hint">支持ZIP压缩包，图片文件包含jpg、png格式，文本文件包含jsonl格式</p>
          {/* <p className="ant-upload-hint">单张图片限制在5M内，最多支持1000张</p> */}
          <p className="ant-upload-hint">文件大小不能超过1G</p>
        </>
      )
    }
    if (usage === 'business-inference') {
      return (
        <p className="ant-upload-hint">
          支持 .jsonl/.json/.xlsx/.csv 格式，文件大小不能超过500M
        </p>
      )
    }
    return (
      <p className="ant-upload-hint">
        支持 .jsonl/.json/.xlsx 格式，文件大小不能超过500M
      </p>
    )
  }

  // 处理服务选择变化
  const handleServiceChange = (value: string) => {
    setSelectedService(value)
    // 从服务列表中找到对应的服务对象并保存
    const service = inferenceServices.find((s) => s.name === value)
    setSelectedServiceObj(service || null)
  }

  // 处理数据集选择变化（级联选择器 / 数据集弹窗）
  const handleDatasetCascaderChange = (value: any[], selectedOptions?: any[]) => {
    if (!value || value.length === 0) {
      setSelectedDatasetObj(null)
      setSelectedDatasetSource(null)
      setSelectedDatasetVersion(null)
      setSelectedDatasetVersionObj(null)
      return
    }

    // value格式: [usage, 数据集名称, 版本]
    if (value.length >= 2 && selectedOptions && selectedOptions.length >= 2) {
      // 保存数据集来源（分类）
      if (selectedOptions[0] && selectedOptions[0].label) {
        setSelectedDatasetSource(selectedOptions[0].label)
      }

      const datasetName = value[1]

      // 从训练集或验证集中找到对应的数据集对象（类型刚切换时列表可能尚未按新用途刷新，回退用弹窗行数据）
      const dataset = datasets.find((d) => d.dataset_name === datasetName)
      if (dataset) {
        setSelectedDatasetObj(dataset)
      }
      else if ((selectedOptions[1] as { data?: TrainingDatasetItem })?.data) {
        setSelectedDatasetObj((selectedOptions[1] as { data: TrainingDatasetItem }).data)
      }

      // 如果有版本选择，获取版本对象
      if (value.length >= 3 && selectedOptions.length >= 3 && selectedOptions[2]) {
        const versionOption = selectedOptions[2]
        const version = value[2]
        const versionData = versionOption.versionData // 从选项中获取完整的版本数据对象

        setSelectedDatasetVersion(version)
        setSelectedDatasetVersionObj(versionData || null)
      }
      else {
        setSelectedDatasetVersion(null)
        setSelectedDatasetVersionObj(null)
      }
    }
  }

  // 级联选择器搜索过滤（只允许搜索分类和数据集名称，不允许搜索版本）
  const filterDatasetCascader = (inputValue: string, path: any[]) => {
    // 只在前两级（分类和数据集）进行搜索
    return path.slice(0, 2).some((option) =>
      (option.label || '').toLowerCase().includes(inputValue.toLowerCase()),
    )
  }

  // 重置推理表单字段
  const resetInferenceFormFields = (options?: {
    datasetType?: string
    dataFormat?: string
  }) => {
    const { datasetType, dataFormat } = options || {}
    const fieldsToReset: any = {
      model_to_infer: undefined,
      service_to_infer: undefined,
      model_version: undefined,
      data_to_infer: undefined,
      file_url: undefined,
      upload_method: 'local',
      model_name: undefined,
      dataFormat: dataFormat !== undefined ? dataFormat : undefined,
    }

    if (datasetType !== undefined) {
      fieldsToReset.dataset_type = datasetType
    }

    form.setFieldsValue(fieldsToReset)
  }

  // 表单提交处理
  const handleSubmit = async (values: any) => {
    try {
      setLoading(true)
      if (!projectId || isNaN(Number(projectId))) {
        message.error('项目ID无效')
        return
      }

      const requestData: any = {
        name: values.name?.trim(),
        project_id: Number(projectId),
        inference_method: inferenceMethod,
        ...(usage === 'business-inference' ? { usage } : {}),
      }

      // 添加描述（如果存在）
      if (values.description?.trim()) {
        requestData.description = values.description.trim()
      }

      // 添加定时任务配置
      if (scheduleEnabled) {
        const schedule_date = dayjs(form.getFieldValue('schedule_date')).format('YYYY-MM-DD')
        const schedule_time = dayjs(form.getFieldValue('schedule_time')).format('HH:mm:ss')
        requestData.time = `${schedule_date}T${schedule_time}`
      }

      if (inferenceMethod === InferenceMethod.OFFLINE) {
        // 添加数据用途
        if (dataSource) {
          requestData.dataset_type = dataSource
        }

        // 模型数据
        const model = form.getFieldsValue().model_to_infer
        const modelId = model?.id
        const modelName = model?.name
        if (model?.type === 'trained') {
          requestData.model_source = 'trained_model'
        }
        else {
          requestData.model_source = 'base_model'
        }

        if (modelId !== undefined) {
          requestData.model_id = modelId
        }
        if (modelName) {
          requestData.model_name = modelName
        }

        // 数据集ID和名称
        // 如果是编辑模式且数据集未修改，使用原始数据；否则使用当前选择的数据
        if (editId && originalDatasetRef.current) {
          // 检查数据集是否被修改
          const currentDatasetId = selectedDatasetVersionObj?.id || selectedDatasetObj?.id
          const originalDatasetId = originalDatasetRef.current.source_dataset_id

          // 如果当前没有选择数据集，或者选择的ID与原始ID相同，使用原始数据
          if (!currentDatasetId || (originalDatasetId && Number(currentDatasetId) === originalDatasetId)) {
            if (originalDatasetRef.current.source_dataset_id) {
              requestData.source_dataset_id = originalDatasetRef.current.source_dataset_id
            }
            if (originalDatasetRef.current.source_dataset_name) {
              requestData.source_dataset_name = originalDatasetRef.current.source_dataset_name
            }
          }
          else {
            // 数据集被修改了，使用新选择的数据
            if (currentDatasetId) {
              requestData.source_dataset_id = Number(currentDatasetId)
            }
            const datasetName = selectedDatasetVersionObj?.dataset_name || selectedDatasetObj?.dataset_name
            if (datasetName) {
              // 格式：数据集来源/数据集名称>数据集版本
              let finalDatasetName = datasetName
              if (selectedDatasetSource) {
                finalDatasetName = `${selectedDatasetSource}/${datasetName}`
              }
              if (selectedDatasetVersion) {
                finalDatasetName = `${finalDatasetName}>${selectedDatasetVersion}`
              }
              requestData.source_dataset_name = finalDatasetName
            }
          }
        }
        else {
          // 创建模式或数据集被修改，使用当前选择的数据
          // 优先使用版本对象中的ID，如果没有则使用数据集对象的ID
          const datasetId = selectedDatasetVersionObj?.id || selectedDatasetObj?.id
          if (datasetId) {
            requestData.source_dataset_id = Number(datasetId)
          }

          // 优先使用版本对象中的数据集名称，如果没有则使用数据集对象的名称
          const datasetName = selectedDatasetVersionObj?.dataset_name || selectedDatasetObj?.dataset_name
          if (datasetName) {
            // 格式：数据集来源/数据集名称>数据集版本
            let finalDatasetName = datasetName
            if (selectedDatasetSource) {
              finalDatasetName = `${selectedDatasetSource}/${datasetName}`
            }
            if (selectedDatasetVersion) {
              finalDatasetName = `${finalDatasetName}>${selectedDatasetVersion}`
            }
            requestData.source_dataset_name = finalDatasetName
          }
        }

        // 推理参数配置（转换为JSON字符串）
        const offlineTemperature = values.referee_temperature
        const offlineTopP = values.referee_top_p
        const offlinePresencePenalty = values.referee_presence_penalty
        const offlineMaxTokens = values.referee_max_tokens

        if (
          selectedModel
          && (
            offlineTemperature !== undefined
            || offlineTopP !== undefined
            || offlinePresencePenalty !== undefined
            || offlineMaxTokens !== undefined
          )
        ) {
          const inferenceParams: any = {}
          if (offlineTemperature !== undefined) {
            inferenceParams.temperature = offlineTemperature
          }
          if (offlineTopP !== undefined) {
            inferenceParams.top_p = offlineTopP
          }
          if (offlineMaxTokens !== undefined && offlineMaxTokens !== null) {
            inferenceParams.max_tokens = offlineMaxTokens
          }
          if (offlinePresencePenalty !== undefined) {
            inferenceParams.presence_penalty = offlinePresencePenalty
          }
          if (Object.keys(inferenceParams).length > 0) {
            requestData.inference_params = JSON.stringify(inferenceParams)
          }
        }

        // GPU资源配置（转换为JSON字符串）
        if (values.gpu_type && Array.isArray(values.gpu_type) && values.gpu_type.length >= 2) {
          const gpuType = values.gpu_type[0]
          const gpuModel = values.gpu_type[1]
          const gpuCount = values.gpu_count || 1

          // 获取显卡内存信息
          const gpuModelObj = gpuModels[gpuType]?.find((m: any) => m.value === gpuModel)
          const cardMemory = gpuModelObj?.memory || ''
          const k8sResourceType = gpuModelObj?.model || ''

          const graphicsCardResource = {
            card_type: gpuType,
            card_model: '',
            count: gpuCount,
            card_memory: '',
            k8s_resource_type: gpuModel,
            cpu_request: values.graphics_card_resource.cpu_request,
            cpu_limit: values.graphics_card_resource.cpu_limit,
            memory_request: values.graphics_card_resource.memory_request,
            memory_limit: values.graphics_card_resource.memory_limit,
          }
          requestData.graphics_card_resource = JSON.stringify(graphicsCardResource)
        }
        else {
          message.error('请选择显卡类型及型号')
          setLoading(false)
          return
        }
      }
      else if (inferenceMethod === InferenceMethod.ONLINE) {
        // 在线推理必需字段
        if (!selectedService) {
          message.error('请选择待推理服务')
          setLoading(false)
          return
        }
        // 编辑模式下，如果没有选择数据集但有原始数据，可以使用原始数据
        if (!selectedDatasetObj && (!editId || !originalDatasetRef.current?.source_dataset_id)) {
          message.error('请选择待推理数据')
          setLoading(false)
          return
        }

        // 添加数据用途
        if (dataSource) {
          requestData.dataset_type = dataSource
        }

        // 服务ID和名称
        if (selectedServiceObj?.id) {
          requestData.online_service_id = Number(selectedServiceObj.id)
        }
        requestData.online_service_name = selectedService

        // 从服务对象中获取 model_name
        if (selectedServiceObj?.model_name) {
          requestData.model_name = selectedServiceObj.model_name
        }

        // 数据集ID和名称
        // 如果是编辑模式且数据集未修改，使用原始数据；否则使用当前选择的数据
        if (editId && originalDatasetRef.current) {
          // 检查数据集是否被修改
          const currentDatasetId = selectedDatasetVersionObj?.id || selectedDatasetObj?.id
          const originalDatasetId = originalDatasetRef.current.source_dataset_id

          // 如果当前没有选择数据集，或者选择的ID与原始ID相同，使用原始数据
          if (!currentDatasetId || (originalDatasetId && Number(currentDatasetId) === originalDatasetId)) {
            if (originalDatasetRef.current.source_dataset_id) {
              requestData.source_dataset_id = originalDatasetRef.current.source_dataset_id
            }
            if (originalDatasetRef.current.source_dataset_name) {
              requestData.source_dataset_name = originalDatasetRef.current.source_dataset_name
            }
          }
          else {
            // 数据集被修改了，使用新选择的数据
            if (currentDatasetId) {
              requestData.source_dataset_id = Number(currentDatasetId)
            }
            const datasetName = selectedDatasetVersionObj?.dataset_name || selectedDatasetObj?.dataset_name
            if (datasetName) {
              // 格式：数据集来源/数据集名称>数据集版本
              let finalDatasetName = datasetName
              if (selectedDatasetSource) {
                finalDatasetName = `${selectedDatasetSource}/${datasetName}`
              }
              if (selectedDatasetVersion) {
                finalDatasetName = `${finalDatasetName}>${selectedDatasetVersion}`
              }
              requestData.source_dataset_name = finalDatasetName
            }
          }
        }
        else {
          // 创建模式或数据集被修改，使用当前选择的数据
          // 优先使用版本对象中的ID，如果没有则使用数据集对象的ID
          const datasetId = selectedDatasetVersionObj?.id || selectedDatasetObj?.id
          if (datasetId) {
            requestData.source_dataset_id = Number(datasetId)
          }

          // 优先使用版本对象中的数据集名称，如果没有则使用数据集对象的名称
          const datasetName = selectedDatasetVersionObj?.dataset_name || selectedDatasetObj?.dataset_name
          if (datasetName) {
            // 格式：数据集来源/数据集名称>数据集版本
            let finalDatasetName = datasetName
            if (selectedDatasetSource) {
              finalDatasetName = `${selectedDatasetSource}/${datasetName}`
            }
            if (selectedDatasetVersion) {
              finalDatasetName = `${finalDatasetName}>${selectedDatasetVersion}`
            }
            requestData.source_dataset_name = finalDatasetName
          }
        }

        // 推理参数配置（转换为JSON字符串）
        if (selectedService && (values.temperature !== undefined || values.top_p !== undefined || values.presence_penalty !== undefined || values.max_tokens !== undefined)) {
          const inferenceParams: any = {}
          if (values.temperature !== undefined) {
            inferenceParams.temperature = values.temperature
          }
          if (values.top_p !== undefined) {
            inferenceParams.top_p = values.top_p
          }
          if (values.max_tokens !== undefined && values.max_tokens !== null) {
            inferenceParams.max_tokens = values.max_tokens
          }
          if (values.presence_penalty !== undefined) {
            inferenceParams.presence_penalty = values.presence_penalty
          }
          if (Object.keys(inferenceParams).length > 0) {
            requestData.inference_params = JSON.stringify(inferenceParams)
          }
        }
      }
      else if (inferenceMethod === InferenceMethod.IMPORT) {
        // 导入推理结果集
        requestData.upload_method = uploadMethod

        if (uploadMethod === 'url') {
          if (!values.file_url?.trim()) {
            message.error('请输入文件URL')
            setLoading(false)
            return
          }
          requestData.file_url = values.file_url.trim()
        }
        else {
          if (!selectedFile) {
            message.error('请上传文件')
            setLoading(false)
            return
          }

          // 检查文件是否为空
          if (selectedFile.size === 0) {
            message.error('上传的文件不能为空')
            setLoading(false)
            return
          }

          if (!chunkUploadId) {
            message.error('文件尚未上传完成，请等待上传完成后再提交')
            setLoading(false)
            return
          }

          // 使用分片上传后的 chunk_upload_id（将逗号拼接的字符串拆分成数组）
          requestData.chunk_upload_ids = chunkUploadId.split(',').filter((id) => id.trim())
        }

        // 添加 model_name（从表单中获取）
        if (values.model_name?.trim()) {
          requestData.model_name = values.model_name.trim()
        }

        // 添加数据格式和数据用途，在业务推理结果中不添加
        if (usage !== 'business-inference') {
          const dataFormat = form.getFieldValue('dataFormat')
          if (dataFormat) {
            requestData.dataset_format = dataFormat
          }
          if (dataSource) {
            requestData.dataset_type = dataSource
          }
        }
        else {
          requestData.dataset_type = 'business'
        }
      }
      else if (inferenceMethod === InferenceMethod.API) {
        // API服务推理
        if (!selectedApiObj) {
          message.error('请选择第三方API服务')
          setLoading(false)
          return
        }
        if (!selectedBusinessTestDatasetObj) {
          message.error('请选择业务测试数据集')
          setLoading(false)
          return
        }

        // 验证字段映射
        // 输入映射：需要 sourceField 和 targetField 都有值，且所有输入字段映射的select都必须填写
        const requestMappingsWithBinding = requestMappings.map((m, index) => ({
          mapping: m,
          index,
          bindingField: apiBindingFields?.request_binding[index],
        })).filter((item) => item.bindingField)

        // 检查是否有未填写的输入字段映射select
        const missingRequestMappings = requestMappingsWithBinding.filter(
          (item) => !item.mapping.sourceField || !item.mapping.targetField,
        )

        if (missingRequestMappings.length > 0) {
          message.error('请填写所有输入字段映射的业务测试数据集元数据字段')
          setLoading(false)
          return
        }

        if (requestMappingsWithBinding.length === 0) {
          message.error('请至少添加一个输入字段映射')
          setLoading(false)
          return
        }

        // 输出映射：只需要 targetField 有值（左侧是只读的 name）
        const validResponseMappings = responseMappings.filter(
          (m, index) => {
            const bindingField = apiBindingFields?.response_binding[index]
            return m.targetField && bindingField
          },
        )

        // 构建字段映射数据
        // request_map（请求参数映射）：
        // - source_field_desc: api请求参数名称（name）
        // - source_field_path: api请求参数JSONPath（jsonpath）
        // - target_field_desc: 数据集字段名称（用户选择的业务测试数据集元数据字段）
        // - target_field_path: 数据集字段/JSONPath（用户选择的业务测试数据集元数据字段）
        const request_map = requestMappings
          .map((mapping, index) => {
            if (!mapping.sourceField || !mapping.targetField) return null
            const bindingField = apiBindingFields?.request_binding[index]
            return {
              source_field_desc: bindingField?.name || mapping.sourceField, // api请求参数名称
              source_field_path: bindingField?.jsonpath || '', // api请求参数JSONPath
              target_field_desc: mapping.targetField, // 数据集字段名称
              target_field_path: mapping.targetField, // 数据集字段/JSONPath
            }
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)

        // response_map（响应参数映射）：
        // - source_field_desc: api响应参数名称（name）
        // - target_field_desc: 评估模型字段名称（用户输入的字段映射）
        const response_map = responseMappings
          .map((mapping, index) => {
            if (!mapping.targetField) return null
            const bindingField = apiBindingFields?.response_binding[index]
            return {
              source_field_desc: bindingField?.name || '', // api响应参数名称
              target_field_desc: mapping.targetField, // 评估模型字段名称（用户输入的字段映射）
            }
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)

        // 构建API服务推理请求数据
        const apiRequestData = {
          name: values.name?.trim(),
          description: values.description?.trim(),
          inference_type: 'api' as const,
          api_id: selectedApiObj.id,
          api_name: selectedApiObj.name,
          dataset_id: selectedBusinessTestDatasetObj?.id,
          dataset_name: selectedBusinessTestDatasetObj.dataset_name,
          usage: 'business-inference',
          param: {
            request_map,
            response_map,
          },
          ...(requestData.time ? { schedule_at: requestData.time } : {}),
        }

        // API服务推理：编辑模式
        if (editId) {
          await apiService.updateBusinessInferenceResult(Number(projectId), editId, apiRequestData)
          message.success('推理结果集更新成功')
        }
        else {
          await apiService.createBusinessInferenceResult(Number(projectId), apiRequestData)
          message.success('推理结果集创建成功')
        }
        queryClient.invalidateQueries({
          queryKey: ['inference-result-sets', Number(projectId)],
        })
        navigateBack()
        return
      }

      // 编辑模式：调用更新接口
      if (editId) {
        await inferenceResultSetService.update(Number(projectId), editId, requestData)
        message.success(usage === 'business-inference' ? '业务推理结果集更新成功' : '推理结果集更新成功')
      }
      else {
        // 创建模式：调用创建接口
        await inferenceResultSetService.create(Number(projectId), requestData)
        message.success(usage === 'business-inference' ? '业务推理结果集创建成功' : '推理结果集创建成功')
      }
      queryClient.invalidateQueries({
        queryKey: ['inference-result-sets', Number(projectId)],
      })

      // 根据usage跳转到不同的页面
      navigateBack()
    }
    catch (error: Error | any) {
      console.error('创建失败:', error)
      const errorMessage = error?.response?.data?.message
        || error?.message
        || '创建推理结果集失败，请检查输入信息'
      message.error(errorMessage)
    }
    finally {
      setLoading(false)
    }
  }

  const navigateBack = () => {
    if (usage === 'business-inference') {
      navigate(`/project/${projectId}/business-inference`)
    }
    else {
      navigate(`/project/${projectId}/Inference`)
    }
  }

  const handleCancel = () => {
    navigateBack()
  }

  // 下载示例文件
  const downloadSample = async (fileType: 'jsonl' | 'csv' | 'xlsx' | 'json' | 'zip') => {
    try {
      const datasetFormat = form.getFieldValue('dataFormat')
      const datasetType = dataSource
      await downloadInferenceResultSetSample(
        fileType,
        inferenceResultSetService.downloadSample,
        undefined,
        datasetFormat,
        datasetType,
      )
      message.success('示例文件下载成功')
    }
    catch (error) {
      message.error('下载示例文件失败，请稍后重试')
      console.error('下载示例文件失败:', error)
    }
  }

  // 数据集名称重复校验
  const validateDatasetName = async (
    _: any,
    value: string,
  ): Promise<void> => {
    if (!value || !projectId || isNaN(Number(projectId))) {
      return Promise.resolve()
    }

    if (validateTimeoutRef.current) {
      clearTimeout(validateTimeoutRef.current)
    }

    return new Promise((resolve, reject) => {
      validateTimeoutRef.current = window.setTimeout(async () => {
        try {
          const response = await inferenceResultSetService.list(
            Number(projectId),
            { page: 1, size: 100 },
          )
          const existingNames
            = response.items?.map((item) => item.name) || []

          if (existingNames.includes(value)) {
            reject(new Error('数据集名称已存在，请使用其他名称'))
          }
          else {
            resolve()
          }
        }
        catch (error) {
          console.error('校验数据集名称失败:', error)
          resolve()
        }
      }, 500)
    })
  }

  // 获取错误信息列表
  const getErrorMessages = () => {
    const errorList: string[] = []
    if (dataErrors.baseModels) {
      errorList.push('基础模型列表加载失败')
    }
    if (dataErrors.trainedModels) {
      errorList.push('训练模型列表加载失败')
    }
    if (dataErrors.datasets) {
      errorList.push('数据集列表加载失败')
    }
    if (dataErrors.inferenceServices) {
      errorList.push('推理服务列表加载失败')
    }
    if (dataErrors.gpuResources) {
      errorList.push('GPU资源列表加载失败')
    }
    return errorList
  }

  return (
    <Layout.Content className="create-inference-result-page relative !h-full">
      {/* 页面标题
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col flex="auto" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <a onClick={() => navigate(-1)}>推理结果集</a>
                  </>
                ),
              },
              {
                title: usage === 'business-inference' ? '创建业务推理结果集' : '创建推理结果集',
              },
            ]}
          />
        </Col>
      </Row> */}

      {/* 错误提示 */}
      {hasDataError && (
        <Alert
          message="数据加载失败"
          description={(
            <div>
              <div className="mb-2">
                以下数据加载失败，请重试：
              </div>
              <ul className="m-0 pl-5">
                {getErrorMessages().map((msg, index) => (
                  <li key={index}>{msg}</li>
                ))}
              </ul>
            </div>
          )}
          type="error"
          showIcon
          action={(
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={retryAll}
              loading={isDataLoading}
            >
              重试
            </Button>
          )}
          className="mb-4"
        />
      )}

      <div className="create-inference-result-card create-form-card">
        <CreateFormPageHeader
          title={editId ? (usage === 'business-inference' ? '编辑业务推理结果集' : '编辑推理结果集') : (usage === 'business-inference' ? '创建业务推理结果集' : '创建推理结果集')}
          description="配置推理方式与数据来源，生成推理结果集"
          onBack={handleCancel}
          actions={(
            <>
              <Button className="create-form-cancel" onClick={handleCancel}>
                取消
              </Button>
              <Button className="create-form-submit" type="primary" onClick={() => form.submit()} loading={loading}>
                提交
              </Button>
            </>
          )}
        />
        <div className="create-form-divider" />
        <Form
          form={form}
          layout="vertical"
          labelAlign="left"
          onFinish={handleSubmit}
          className="create-inference-result-form"
        >
          <BasicInfoForm form={form} validateDatasetName={validateDatasetName} />

          <Form.Item
            label="推理方式"
            name="inference_method"
            initialValue={inferenceMethodOptions[0].value}
          >
            <Radio.Group
              value={inferenceMethod}
              onChange={(e) => {
                const newMethod = e.target.value
                setInferenceMethod(newMethod)
                // 切换推理方式时重置选择状态
                setSelectedModel(null)
                setSelectedService(null)
                setSelectedServiceObj(null)
                setSelectedDatasetObj(null)
                setSelectedDatasetSource(null)
                setSelectedDatasetVersion(null)
                setSelectedDatasetVersionObj(null)
                setUploadMethod('local')
                setSelectedFile(null)
                setChunkUploadId(null)
                setApiBindingFields(null)
                setBusinessTestDatasetFields([])
                setBusinessTestDatasetMetadataFields([])
                setSelectedApiObj(null)
                setSelectedBusinessTestDatasetObj(null)
                setRequestMappings([])
                setResponseMappings([])

                // 如果是离线推理或在线推理，重置数据用途为默认值
                if (newMethod === InferenceMethod.OFFLINE || newMethod === InferenceMethod.ONLINE) {
                  setDataSource('text-generation')
                  resetInferenceFormFields({
                    datasetType: 'text-generation',
                    dataFormat: undefined,
                  })
                }
                else if (newMethod === InferenceMethod.IMPORT) {
                  // 如果是导入推理结果集，设置数据用途和数据格式
                  setDataSource('text-generation')
                  // 如果数据格式选项已加载，设置默认数据格式
                  const defaultDataFormat = dataFormatOptions && dataFormatOptions.options && dataFormatOptions.options.length > 0
                    ? 'prompt-response' // 文本生成的默认格式
                    : undefined
                  resetInferenceFormFields({
                    dataFormat: defaultDataFormat,
                  })
                }
                else {
                  // 其他推理方式，清除数据格式
                  resetInferenceFormFields({
                    dataFormat: undefined,
                  })
                }
              }}
            >
              {inferenceMethodOptions.map((option) => (
                <Radio key={option.value} value={option.value}>
                  {option.label}
                </Radio>
              ))}
            </Radio.Group>
          </Form.Item>

          {inferenceMethod !== InferenceMethod.IMPORT && (
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
                  <div className="create-inference-schedule-panel">
                    <Form.Item
                      name="schedule_date"
                      label="执行时间"
                      rules={scheduleEnabled ? [{ required: true, message: '请选择日期' }] : []}
                    >
                      <DatePicker
                        placeholder="请选择日期"
                        format="YYYY-MM-DD"
                        disabledDate={(current) => current && current < dayjs().startOf('day')}
                      />
                    </Form.Item>
                    <Form.Item
                      name="schedule_time"
                      rules={scheduleEnabled ? [{ required: true, message: '请选择时间' }] : []}
                    >
                      <TimePicker
                        placeholder="请选择时间"
                        format="HH:mm:ss"
                      />
                    </Form.Item>
                  </div>
                )}
              </Space>
            </Form.Item>
          )}

          {/* API服务 */}
          {inferenceMethod === InferenceMethod.API && (
            <>
              <Form.Item
                label="第三方API服务"
                name="api"
                rules={[{ required: true, message: '请选择第三方api' }]}
              >
                <Select
                  placeholder="请选择第三方api"
                  className="w-[400px]"
                  options={apiOptions}
                  loading={loadingApiList}
                  onChange={handleApiChange}
                />
              </Form.Item>

              <DatasetCascaderSelector
                form={form}
                fieldName="business_test_dataset"
                label="业务测试数据集"
                placeholder="请选择业务测试数据集"
                projectIdOverride={projectId ? Number(projectId) : undefined}
                statsQuery={{ usage: ['business_test'], training_method_type: ['sft'], dataset_type: ['business'] }}
                includeAllStatsDatasetFormats={false}
                onModalOpenChange={setDatasetSelectorModalOpen}
                fixedListUsage="business_test"
                listDatasetType="business"
                modalTitle="选择业务测试数据集"
                selectButtonText="选择"
                hideStatsDatasetTypeAndFormatFilters
                onChange={handleBusinessTestDatasetChange}
              />

              {/* 字段映射 */}
              {apiBindingFields && (
                <Card title="推理参数设置" size="small">
                  <div className="flex items-start gap-8">
                    <div className="flex-1">
                      <div className="mb-2 text-sm font-medium">输入字段映射 (request_binding)</div>
                      <div className="space-y-3">
                        {apiBindingFields.request_binding.map((bindingField, index) => {
                          const mapping = requestMappings[index] || { sourceField: '', targetField: '' }
                          return (
                            <RequestMappingComponent
                              key={index}
                              sourceFields={businessTestDatasetMetadataFields.map((field: any) => ({
                                label: field.name,
                                value: field.name,
                              }))}
                              name={bindingField.value}
                              mapping={mapping}
                              onChange={(newMapping) => {
                                const newMappings = [...requestMappings]
                                newMappings[index] = newMapping
                                setRequestMappings(newMappings)
                              }}
                            />
                          )
                        })}
                      </div>
                    </div>

                    {/* 输出映射 */}
                    <div className="flex-1">
                      <div className="mb-2 text-sm font-medium">输出字段映射 (response_binding)</div>
                      <div className="space-y-3">
                        {apiBindingFields.response_binding.map((bindingField, index) => {
                          const mapping = responseMappings[index] || { sourceField: '', targetField: bindingField.value }
                          return (
                            <ResponseMappingComponent
                              key={index}
                              name={bindingField.value}
                              mapping={mapping}
                              onChange={(newMapping) => {
                                const newMappings = [...responseMappings]
                                newMappings[index] = newMapping
                                setResponseMappings(newMappings)
                              }}
                            />
                          )
                        })}
                      </div>
                    </div>
                  </div>
                  {(loadingBindingFields || loadingMetadataFields) && (
                    <div className="text-sm text-gray-500 mt-2">
                      正在加载字段数据...
                    </div>
                  )}
                </Card>
              )}
            </>
          )}

          {/* 数据用途 - 离线推理和在线推理都需要 */}
          {(inferenceMethod === InferenceMethod.OFFLINE || inferenceMethod === InferenceMethod.ONLINE) && (
            <Form.Item
              label="数据用途"
              name="dataset_type"
              initialValue="text-generation"
            >
              <Radio.Group
                value={dataSource}
                onChange={(e) => {
                  const value = e.target.value
                  setDataSource(value)
                  form.setFieldsValue({ dataset_type: value })
                  // 数据用途变化时，清除已选择的内容
                  // useInferenceData hook 会自动根据新的 dataSource 值重新获取数据
                  setSelectedModel(null)
                  setSelectedService(null)
                  setSelectedServiceObj(null)
                  setSelectedDatasetObj(null)
                  setSelectedDatasetSource(null)
                  setSelectedDatasetVersion(null)
                  setSelectedDatasetVersionObj(null)
                  // 切换数据用途时重置上传的文件
                  setSelectedFile(null)
                  setChunkUploadId(null)
                  form.setFieldsValue({
                    model_to_infer: undefined,
                    service_to_infer: undefined,
                    model_version: undefined,
                    data_to_infer: undefined,
                  })
                }}
              >
                <Radio value="text-generation">文本生成</Radio>
                <Radio value="image-understanding">图像理解</Radio>
              </Radio.Group>
            </Form.Item>
          )}

          {/* 离线推理 */}
          {inferenceMethod === InferenceMethod.OFFLINE && (
            <>
              <Form.Item
                label="待推理模型"
                name="model_to_infer"
                rules={[{ required: true, message: '请选择待推理模型' }]}
              >
                <ModelsCascader
                  multiple={false}
                  placeholder="请选择待推理模型"
                  className="w-[560px] h-[40px]"
                  filterBaseModelsParams={{ model_type: dataSource, is_available: true }}
                  filterTrainedModelsParams={{ model_type: dataSource, is_available: false }}
                  filterModelType={['base', 'trained']}
                />
              </Form.Item>

              {/* 只有选择了模型后才显示推理参数配置 */}
              {selectedModel && <RefereeInferenceParametersConfig form={form} />}

              <DatasetCascaderSelector
                form={form}
                options={datasetCascaderOptions}
                onLoadData={loadDatasetVersions}
                onChange={handleDatasetCascaderChange}
                filter={filterDatasetCascader}
                loading={dataLoading.datasets}
                onModalOpenChange={setDatasetSelectorModalOpen}
                statsQuery={{ training_method_type: ['sft'], dataset_type: [dataSource] }}
                includeAllStatsDatasetFormats={false}
                listDatasetType={dataSource}
              />

              <GPUResourceCascaderSelector
                form={form}
                gpuCascaderOptions={gpuCascaderOptions}
                onLoadData={(selectedOptions) =>
                  loadGpuModelData(
                    selectedOptions,
                    setGpuCascaderOptions,
                    gpuCascaderOptions,
                  )}
                loading={dataLoading.gpuResources}
              />
            </>
          )}

          {/* 在线推理 */}
          {inferenceMethod === InferenceMethod.ONLINE && (
            <>
              <Form.Item
                label="待推理服务"
                name="service_to_infer"
                rules={[{ required: true, message: '请选择待推理服务' }]}
              >
                <Select
                  placeholder="请选择待推理服务"
                  className="w-[400px]"
                  onChange={handleServiceChange}
                  loading={dataLoading.inferenceServices}
                  disabled={dataLoading.inferenceServices}
                >
                  {inferenceServices.map((service) => (
                    <Option key={service.id} value={service.name}>
                      {service.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              {/* 只有选择了服务后才显示推理参数配置 */}
              {selectedService && <InferenceParametersConfig form={form} />}

              <DatasetCascaderSelector
                form={form}
                options={datasetCascaderOptions}
                onLoadData={loadDatasetVersions}
                onChange={handleDatasetCascaderChange}
                filter={filterDatasetCascader}
                loading={dataLoading.datasets}
                onModalOpenChange={setDatasetSelectorModalOpen}
                statsQuery={{ training_method_type: ['sft'], dataset_type: [dataSource] }}
                includeAllStatsDatasetFormats={false}
                listDatasetType={dataSource}
              />
            </>
          )}

          {/* 导入推理结果集 */}
          {inferenceMethod === InferenceMethod.IMPORT && (
            <>
              <Form.Item
                label="上传方式"
                name="upload_method"
                initialValue="local"
              >
                <Radio.Group
                  value={uploadMethod}
                  onChange={(e) => {
                    setUploadMethod(e.target.value)
                    form.setFieldsValue({
                      file_url: undefined,
                    })
                    setSelectedFile(null)
                    setChunkUploadId(null)
                  }}
                >
                  <Radio value="local">本地上传</Radio>
                  {/* <Tooltip title="即将上线" color="blue">
                    <Radio value="url" disabled>URL获取</Radio>
                  </Tooltip> */}
                </Radio.Group>
              </Form.Item>

              <Form.Item
                label="模型名称"
                name="model_name"
                rules={[
                  { required: true, message: '请输入模型名称' },
                  { min: 2, max: 64, message: '模型名称长度为2-64个字符' },
                  { pattern: /^[^-_].*$/, message: '模型名称不能以下划线和中划线开头' },
                  { pattern: /^[\u4E00-\u9FA5a-zA-Z0-9._-]*$/, message: '模型名称只支持中英文、数字、小数点、中划线(-)、下划线(_)' },
                ]}
              >
                <Input placeholder="请输入模型名称" className="w-[400px]" />
              </Form.Item>

              {usage !== 'business-inference' && (
                <Form.Item label="数据用途">
                  <div className="mb-4">
                    <Radio.Group onChange={handleDataSourceChange} value={dataSource}>
                      <Space direction="horizontal">
                        {dataSourceOptions.map((option) => (
                          <Tooltip title={option.disabled ? '即将上线' : null} color="blue" key={option.value}>
                            <Radio.Button disabled={option.disabled} value={option.value}>
                              <Space>
                                {option.icon}
                                <span>{option.label}</span>
                              </Space>
                            </Radio.Button>
                          </Tooltip>
                        ))}
                      </Space>
                    </Radio.Group>
                  </div>
                </Form.Item>
              )}

              {usage !== 'business-inference' && (
                <Form.Item
                  label="数据格式"
                  name="dataFormat"
                >
                  <Radio.Group
                    onChange={() => {
                      setChunkUploadId(null)
                      setSelectedFile(null)
                    }}
                  >
                    <Space direction="horizontal" size="middle">
                      {dataFormatOptions?.options
                        ?.filter((option) => {
                          const isImageUnderstanding = dataSource === 'image-understanding'
                          if (isImageUnderstanding && option.value === 'prompt-response') {
                            return false
                          }
                          return true
                        })
                        ?.map((option) => {
                          const isImageUnderstanding = dataSource === 'image-understanding'
                          const shouldDisable = isImageUnderstanding
                            ? option.value !== 'role-based'
                            : option.value === 'prefix-suffix-middle'
                          return (
                            <div key={option.value} className="create-inference-format-option">
                              <Radio value={option.value} disabled={shouldDisable}>
                                <span className="create-inference-format-content">
                                  <span>{option.name}</span>
                                  {(option.value === 'role-based' || option.value === 'prompt-response') && (
                                    <Popover
                                      content={(
                                        <div className="max-w-[400px]">
                                          <img
                                            src={option.value === 'role-based' ? (dataSource === 'image-understanding' ? datasetTypeBasedImage : datasetTypeRoleTextImage) : datasetTypeRoleImage}
                                            alt="数据格式说明"
                                            className="w-full h-auto rounded-md shadow-sm"
                                          />
                                        </div>
                                      )}
                                      title="数据格式说明"
                                      placement="right"
                                      trigger="hover"
                                      overlayStyle={{ maxWidth: '450px' }}
                                    >
                                      <QuestionCircleOutlined className="create-inference-format-help" />
                                    </Popover>
                                  )}
                                </span>
                              </Radio>
                            </div>
                          )
                        })}
                    </Space>
                  </Radio.Group>
                </Form.Item>
              )}

              {uploadMethod === 'local' ? (
                <Form.Item
                  label="上传文件"
                  rules={[{ required: true, message: '请上传文件' }]}
                >
                  <div className="create-inference-upload-wrapper">
                    <ChunkFileUploader
                      ref={chunkUploaderRef}
                      key={`${dataSource}-${dataFormat ?? ''}`}
                      accept={getAcceptType()}
                      beforeUpload={validateFile}
                      hintText={getHintText()}
                      projectId={projectId}
                      usage="public"
                      onUploadIdsChange={(uploadIds) => {
                        setChunkUploadId(uploadIds || null)
                      }}
                      onFileChange={(file) => {
                        setSelectedFile(file)
                        // chunkUploadId 会通过 onUploadIdsChange 自动更新，不需要手动清空
                      }}
                    />
                  </div>
                </Form.Item>
              ) : (
                <Form.Item
                  label="文件URL"
                  name="file_url"
                  rules={[{ required: true, message: '请输入文件URL' }]}
                >
                  <Input placeholder="请输入文件URL" className="w-[500px]" />
                </Form.Item>
              )}

              <div className="create-inference-example-row">
                <span>下载示例文件：</span>
                {dataSource === 'image-understanding' ? (
                  <Space>
                    <Button
                      type="link"
                      icon={<DatabaseOutlined />}
                      onClick={() => downloadSample('zip')}
                    >
                      ZIP 格式
                    </Button>
                  </Space>
                ) : (
                  <>
                    <Space>
                      <Button
                        type="link"
                        icon={<DatabaseOutlined />}
                        onClick={() => downloadSample('jsonl')}
                      >
                        JSONL 格式
                      </Button>
                    </Space>
                    <Space>
                      <Button
                        type="link"
                        icon={<DatabaseOutlined />}
                        onClick={() => downloadSample('json')}
                      >
                        JSON 格式
                      </Button>
                    </Space>
                    <Space>
                      <Button
                        type="link"
                        icon={<DatabaseOutlined />}
                        onClick={() => downloadSample('xlsx')}
                      >
                        XLSX 格式
                      </Button>
                    </Space>
                    {usage === 'business-inference' && (
                      <Space>
                        <Button
                          type="link"
                          icon={<DatabaseOutlined />}
                          onClick={() => downloadSample('csv')}
                        >
                          CSV 格式
                        </Button>
                      </Space>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </Form>
      </div>
    </Layout.Content>
  )
}

export default CreateInferenceResultSetPage
