import { Affix, Button, Form, Modal, Spin, message } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { qiankunWindow } from 'vite-plugin-qiankun/dist/helper'
import { DeployServiceBasicForm } from './DeployServiceBasicForm'
import { DeployServiceEnvironmentForm } from './DeployServiceEnvironmentForm'
import { DeployServiceResourceForm } from './DeployServiceResourceForm'
import type { TrainedModelVersion } from './deployServiceFormTypes'
import { delopCodeParamsList } from '@/const/delopCodeParams'
import type { DelopServerStartParams, DeplopServerDetailResponse, MlModelConfig } from '@/types/inference/deplop'
import { ModelSource, resolveDeployDetailMlHandle } from '@/types/inference/deplop'
import { DelopServerApi } from '@/services/inferenceService'
import { getKubernetesClusterGPUTypes, getKubernetesClusterGPUs } from '@/services/kubernetesService'
import { ModelService } from '@/services/modelsApi'
import { mlModelService } from '@/services/mlModelService'
import type { MlModelVersion } from '@/types/mlModel'
import { notebookService } from '@/services/notebookService'
import type { ItemListResponse } from '@/types/model'
import { ImageType, registryMirrorService } from '@/services/RegistryMirrorService'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'

export interface DeployServiceFormProps {
  twice?: boolean // 是否为重新部署
  readyDelopMsg?: DelopParams // 已部署信息
  variant?: 'default' | 'machine'
  onTwiceDeploySuccess?: () => void
}

interface DelopParams extends DeplopServerDetailResponse { }

/** 详情部署版本号：仅根级 trained_model_version */
function resolveDetailTaskVersion(detail: DeplopServerDetailResponse): string {
  return String(detail.trained_model_version ?? '').trim()
}

export default function DeployServiceForm(props: DeployServiceFormProps = { twice: false }) {
  const { twice, readyDelopMsg, variant = 'default', onTwiceDeploySuccess } = props
  /** 创建页通过 variant 传入；重新部署时根据详情里的 model_source 判定 */
  const isMachine = variant === 'machine' || (!!twice && readyDelopMsg?.model_source === ModelSource.MachineModel)
  const navigate = useNavigate()
  const isQiankun = qiankunWindow.__POWERED_BY_QIANKUN__

  const [formData] = Form.useForm()
  const serveName = Form.useWatch('name', formData)
  const modelName = Form.useWatch('modelName', formData)
  const mirrorType = Form.useWatch('mirror_type', formData)
  const gpuCount = Form.useWatch('gpu_count', formData)
  const reasoningParams = Form.useWatch('inferenceParams', formData)
  const selectedSource = Form.useWatch('source', formData)
  const modelVersion = Form.useWatch('model_version', formData)
  const mlModelVersion = Form.useWatch('ml_model_version', formData)
  const gpuType = Form.useWatch('gpu_type', formData)
  const resourceCpuRequest = Form.useWatch('resource_cpu_request', formData)
  const resourceCpuLimit = Form.useWatch('resource_cpu_limit', formData)
  const resourceMemoryRequest = Form.useWatch('resource_memory_request', formData)
  const resourceMemoryLimit = Form.useWatch('resource_memory_limit', formData)
  const mlModelSummaryIdWatch = Form.useWatch('ml_model_id', formData)
  const mlModelVersionRecordIdWatch = Form.useWatch('ml_model_version_id', formData)
  /** 机器模型部署页或来源为 ml_model（含重新部署回显前 isMachine 已为 true） */
  const isMlDeployContext = isMachine || selectedSource === ModelSource.MachineModel

  const [gpuCascaderOptions, setGpuCascaderOptions] = useState<any[]>([])
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()
  const getNotebookDetailPageUrl = useCallback((notebookId: number | string) => {
    const baseUrl = isQiankun
      ? (window.qiankunProps?.base && window.qiankunProps.base !== '/' ? window.qiankunProps.base : '/lab')
      : (import.meta.env.BASE_URL || '/')
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl

    return `${normalizedBaseUrl}/project/${projectId}/machine-notebook/${notebookId}`
  }, [isQiankun, projectId])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(99)
  const [modelsOptions, setModelsOptions] = useState<any[]>([])
  // 环境信息
  const [codeText, setCodeText] = useState<string>('')
  // const mirrorTypeList = ['vLLM', 'SGLang', 'MindIE', 'DGI Server']
  const mirrorTypeList = ['vLLM', 'DGI Server']
  // 配置参数选项
  const [configParamOptions, setConfigParamOptions] = useState<any[]>(delopCodeParamsList.vLLM)
  // 配置参数缓存
  const [configParamCache, setConfigParamCache] = useState<any[]>([])
  const [localPythonResetKey, setLocalPythonResetKey] = useState('')
  // 环境变量选项
  const envVariableOptions = []
  const [loading, setLoading] = useState(false)
  // 显卡及配置
  const [graphics_card_resource, setGraphicsCardResource] = useState<any>({})
  const disabedParamsKeyList = ['--served-model-name', '--tensor-parallel-size']
  // 模型版本(训练模型)
  const [trainedModelVersions, setTrainedModelVersions] = useState<TrainedModelVersion[]>([])
  /** 机器模型重新部署：init 里 getVersions 的结果交给 BasicForm 做级联回显，避免子组件再监听表单去请求 */
  const [mlRedeployVersionList, setMlRedeployVersionList] = useState<MlModelVersion[] | null>(null)
  const isHydratingMirrorRef = useRef(true)
  const previousMirrorQueryKeyRef = useRef<string | null>(null)
  // 机器模型列表（模型管理）
  const { data: mlModelListRes, isFetching: mlModelListLoading } = useQuery({
    queryKey: ['ml-model-list', projectId],
    queryFn: () => ModelService.getMlModelList(parseInt(projectId!, 10), { page: 1, size: 100 }),
    enabled: isMachine && !!projectId,
  })
  /**
   * 重新部署时详情里的「模型汇总」model_id 可能尚未出现在列表第一页，将当前模型插入选项首位。
   * 注意：ml_model_config.ml_model_id 为版本记录 id，不能用于此处；应使用根级 model_id。
   */
  const mlModelSelectOptions = useMemo((): ItemListResponse[] => {
    const rows = [...(mlModelListRes?.items ?? [])]
    if (twice && readyDelopMsg?.model_source === ModelSource.MachineModel) {
      const handle = resolveDeployDetailMlHandle(readyDelopMsg)
      const rawFid = readyDelopMsg.model_id
      const fname = readyDelopMsg.model_name
      if (rawFid == null || !fname?.trim())
        return rows
      const numFid = typeof rawFid === 'number' ? rawFid : Number(rawFid)
      if (!Number.isFinite(numFid))
        return rows
      const exists = rows.some((r) => r.id === numFid || String(r.id) === String(numFid))
      if (!exists) {
        rows.unshift({
          id: numFid,
          model_name: fname,
          version_count: 0,
          model_type: '',
          task_type: '',
          source_type: '',
          source_ref: handle.uploadId,
          ml_handle_upload_id: handle.uploadId || undefined,
          latest_version: '',
          notebook_id: 0,
          earliest_version: '',
          created_at: '',
          updated_at: '',
        })
      }
    }
    return rows
  }, [mlModelListRes, twice, readyDelopMsg])

  // 获取镜像列表（ml_model：仅 ML 类型，sub_type=ML，type=ImageType.Ml）
  const { data: mirrors } = useQuery({
    queryKey: ['mirrors', mirrorType, gpuType, isMlDeployContext ? 'ml' : 'deploy'],
    queryFn: () => {
      if (isMlDeployContext) {
        return registryMirrorService.searchRegistryImages(
          parseInt(projectId), 3, { sub_type: 'ML', card_category: gpuType?.[0] ?? '' },
        )
      }
      return registryMirrorService.searchRegistryImages(
        parseInt(projectId), 3, { sub_type: mirrorType === 'DGI Server' ? 'DGI-Server' : mirrorType, card_category: gpuType?.[0] ?? '' },
      )
    },
    enabled: !!mirrorType && !!projectId && (isMlDeployContext ? mirrorType === 'ML' : true),
    gcTime: 0,
  })

  // 获取模型数据列表(基础模型)
  const getModels = async (type: string) => {
    try {
      if (type == 'base_model') {
        const res = await ModelService.getBaseModels({
          page: currentPage,
          size: pageSize,
          is_available: true,
          model_tags: 'inference',
        })
        if (res.items.length > 0) {
          setModelsOptions(res.items)
        }
      }
      else if (type == 'trained_model') {
        // 训练模型
        const res = await ModelService.getBaseModelsByProjectId(parseInt(projectId), {
          page: currentPage,
          size: pageSize,
        })
        if (res.items.length > 0) {
          setModelsOptions(res.items.map((item) => {
            return {
              ...item,
              name: (item as any)?.model_name,
            }
          }))
        }
      }
    }
    catch (error) {
      console.error('Failed to get models:', error)
    }
  }

  // 获取显卡类型级联选项（第一层级）
  const getGpuCascaderOptions = async () => {
    try {
      const res = await getKubernetesClusterGPUs(parseInt(projectId))
      setGpuCascaderOptions(
        res.map((item: any) => {
          return {
            value: item.category,
            label: item.category,
            isLeaf: false,
          }
        }),
      )
    }
    catch (error) {
      console.error('Failed to get GPU cascader options:', error)
    }
  }

  // 二级数据
  const loadGpuModelData = async (selectedOptions: any[]) => {
    try {
      const res = await getKubernetesClusterGPUTypes(parseInt(projectId), selectedOptions[0].value)
      setGpuCascaderOptions((prevOptions) => {
        return prevOptions.map((option) => {
          if (option.value === selectedOptions[0].value) {
            return {
              ...option,
              children: res.map((item: any) => {
                return {
                  ...item,
                  key: item.type,
                  value: item.desc,
                  label: item.desc,
                  isLeaf: true,
                }
              }),
            }
          }
          return option
        })
      })
    }
    catch (error) {
      console.error('Failed to load GPU model data:', error)
    }
  }

  // 获取模型版本（训练模型）
  const getModelVersions = async (name: string = modelName) => {
    const res = await ModelService.getModelVersions(parseInt(projectId), name)
    const versions = res.map((item) => {
      return {
        ...item,
        value: item.model_version,
        label: item.model_version,
      }
    })
    setTrainedModelVersions(versions)
    return versions
  }

  // 初始化表单数据
  const initFormData = async () => {
    setMlRedeployVersionList(null)
    // 转换环境变量对象为数组格式
    const envVariables = readyDelopMsg.env_vars
      ? Object.entries(readyDelopMsg.env_vars).map(([key, value]) => ({
          key,
          value: String(value),
        }))
      : []

    // 转换推理参数数组为键值对格式
    const filterBackendParameters = readyDelopMsg.backend_parameters?.filter((item, index) => index != 0) || []
    const inferenceParams: any[] = []
    let type: 'key' | 'value' = 'key'
    let key = ''

    filterBackendParameters.forEach((item, index) => {
      if (type === 'key') {
        // 当前应该是 key
        if (index === filterBackendParameters.length - 1) {
          // 最后一项且没有 value
          inferenceParams.push({ key: item, value: '' })
        }
        else {
          key = item
          type = 'value'
        }
      }
      else if (type === 'value') {
        // 当前应该是 value
        if (item.startsWith('--')) {
          // 遇到新的 key，说明上一个 key 没有 value
          inferenceParams.push({ key, value: '' })
          key = item
          type = 'key' // 下一项应该是这个新 key 的 value
        }
        else {
          // 正常的 value
          inferenceParams.push({ key, value: item })
          key = ''
          type = 'key'
        }
      }
    })

    // 处理最后可能剩下的 key（没有配对的 value）
    if (key) {
      inferenceParams.push({ key, value: '' })
    }

    if (readyDelopMsg.model_source === ModelSource.TrainedModel) {
      const versions = await getModelVersions(readyDelopMsg.model_name)
      const targetVer = String(readyDelopMsg.trained_model_version ?? '').trim()
      const version = versions.find(
        (item) => String(item.value) === targetVer || String((item as { model_version?: string }).model_version) === targetVer,
      )
      if (version)
        formData.setFieldValue('model_version', version.value)
      else if (targetVer)
        formData.setFieldValue('model_version', targetVer)
    }

    // 构建GPU配置级联值
    setGraphicsCardResource(readyDelopMsg.graphics_card_resource)
    const gpuType = readyDelopMsg.graphics_card_resource
      ? [
          readyDelopMsg.graphics_card_resource.card_type,
          `${readyDelopMsg.graphics_card_resource.card_model}(${readyDelopMsg.graphics_card_resource.card_memory})`,
        ]
      : undefined

    if (readyDelopMsg.model_source === ModelSource.TrainedModel) {
      getModelVersions(readyDelopMsg.model_name)
    }

    formData.setFieldsValue({
      // 基本信息
      name: readyDelopMsg.server_name,
      source: readyDelopMsg.model_source,
      modelName: readyDelopMsg.model_name,
      ...(readyDelopMsg.model_source === ModelSource.MachineModel
        ? (() => {
            const cfg = readyDelopMsg.ml_model_config
            const handle = resolveDeployDetailMlHandle(readyDelopMsg)
            const notebookMode = handle.isNotebook
            /** 旧详情可能仍返回 ml_model_version_id；新接口版本主键在 ml_model_id */
            const legacyVid = (cfg as MlModelConfig & { ml_model_version_id?: number })?.ml_model_version_id
            const versionRecordId = legacyVid ?? cfg?.ml_model_id
            return {
              /** 表单里为模型汇总 id（列表行），与请求体 ml_model_config.ml_model_id（版本 id）不同 */
              ml_model_id: readyDelopMsg.model_id,
              ml_python_source_type: notebookMode ? 'notebook' : 'local',
              ...(notebookMode
                ? {
                    ml_notebook_id: handle.notebookId,
                    ml_notebook_source_ref: handle.sourceRef,
                  }
                : {}),
              ...(!notebookMode
                ? {
                    ml_handle_upload_id: handle.uploadId || '',
                  }
                : { ml_handle_upload_id: undefined }),
              ml_model_version: resolveDetailTaskVersion(readyDelopMsg) || undefined,
              ml_model_version_id: versionRecordId ?? '',
            }
          })()
        : {}),

      // 资源信息
      gpu_type: gpuType,
      gpu_count: readyDelopMsg.graphics_card_resource?.count,
      deploy_count: readyDelopMsg.desired_replicas,
      mirror_type: isMachine ? 'ML' : (readyDelopMsg.inference_engine_type === 'DGI-Server' ? 'DGI Server' : readyDelopMsg.inference_engine_type),
      ReasoningMirror: readyDelopMsg.image_id,

      // 环境信息
      inferenceParams,
      envVariables,

      // cpu及内存配置
      resource_cpu_request: readyDelopMsg.resource_cpu_config?.resource_cpu_request || 0.5,
      resource_cpu_limit: readyDelopMsg.resource_cpu_config?.resource_cpu_limit || 16,
      resource_memory_request: readyDelopMsg.resource_cpu_config?.resource_memory_request || 0.5,
      resource_memory_limit: readyDelopMsg.resource_cpu_config?.resource_memory_limit || 16,
    })

    if (readyDelopMsg.model_source === ModelSource.MachineModel && projectId) {
      try {
        const mid = readyDelopMsg.model_id
        const listRow = mlModelSelectOptions.find((r) => r.id === mid || String(r.id) === String(mid))
        const nameForVersionsApi = listRow?.model_name?.trim() || String(readyDelopMsg.model_name ?? '').trim()
        if (!nameForVersionsApi) {
          setMlRedeployVersionList(null)
          return
        }
        const list = await mlModelService.getVersions(parseInt(projectId, 10), nameForVersionsApi, '已完成')
        let arr = Array.isArray(list) ? list : []
        const ver = resolveDetailTaskVersion(readyDelopMsg) || String(formData.getFieldValue('ml_model_version') ?? '').trim()
        const cfg = readyDelopMsg.ml_model_config
        const handle = resolveDeployDetailMlHandle(readyDelopMsg)
        const legacyVid = (cfg as MlModelConfig & { ml_model_version_id?: number })?.ml_model_version_id
        const versionRecordId = legacyVid ?? cfg?.ml_model_id
        if (ver && !arr.some((x) => String(x.model_version) === String(ver))) {
          const pid = parseInt(projectId, 10)
          const placeholderId = typeof versionRecordId === 'number' && Number.isFinite(versionRecordId) ? versionRecordId : 0
          arr = [
            {
              id: placeholderId,
              name: ver,
              model_version: ver,
              description: '',
              project_id: pid,
              model_type: '',
              task_type: '',
              source_type: '',
              notebook_id: 0,
              source_ref: '',
              network_structure: '',
              artifact_uri: '',
              status: '',
              created_id: 0,
              created_by: '',
              created_at: '',
              updated_at: '',
            },
            ...arr,
          ]
        }
        setMlRedeployVersionList(arr)
        const match = ver ? arr.find((x) => String(x.model_version) === String(ver)) : undefined
        formData.setFieldsValue({
          ml_model_id: mid,
          ml_model_version: ver || undefined,
          ml_model_version_id:
            match?.id
            ?? legacyVid
            ?? cfg?.ml_model_id
            ?? '',
          ...(handle.isNotebook
            ? {
                ml_handle_upload_id: undefined,
                ml_notebook_id:
                  handle.notebookId
                  ?? formData.getFieldValue('ml_notebook_id'),
                ml_notebook_source_ref:
                  handle.sourceRef
                  || formData.getFieldValue('ml_notebook_source_ref')
                  || '',
              }
            : {
                ml_handle_upload_id:
                  handle.uploadId
                  || formData.getFieldValue('ml_handle_upload_id')
                  || '',
              }),
          ml_model_cascade: ver && mid != null ? [mid, ver] : undefined,
        })
      }
      catch (e) {
        console.error('Failed to sync ml model version for redeploy:', e)
        setMlRedeployVersionList(null)
      }
    }
  }

  const init = async () => {
    setLoading(true)
    isHydratingMirrorRef.current = true
    try {
      await getGpuCascaderOptions()
      formData.setFieldsValue({
        resource_cpu_request: 0.5,
        resource_cpu_limit: 16,
        resource_memory_request: 0.5,
        resource_memory_limit: 16,
      })

      if (!twice && isMachine) {
        formData.setFieldValue('source', ModelSource.MachineModel)
        formData.setFieldValue('mirror_type', 'ML')
        formData.setFieldValue('ml_python_source_type', 'local')
      }

      // 确定模型来源后再获取模型列表
      if (twice && readyDelopMsg) {
        const isBaseModel = readyDelopMsg.model_source === ModelSource.BaseModel
        const isTrained = readyDelopMsg.model_source === ModelSource.TrainedModel
        const isMl = readyDelopMsg.model_source === ModelSource.MachineModel
        if (isBaseModel) {
          formData.setFieldValue('source', ModelSource.BaseModel)
          await getModels('base_model')
        }
        else if (isTrained) {
          formData.setFieldValue('source', ModelSource.TrainedModel)
          await getModels('trained_model')
        }
        else if (isMl) {
          formData.setFieldValue('source', ModelSource.MachineModel)
          /** 与基础模型一致：先拉机器模型列表再回显，减少仅依赖兜底项的情况 */
          try {
            const mlRes = await ModelService.getMlModelList(parseInt(projectId!, 10), { page: 1, size: 100 })
            queryClient.setQueryData(['ml-model-list', projectId], mlRes)
          }
          catch (e) {
            console.error('Failed to prefetch ml model list for redeploy:', e)
          }
        }
        await initFormData()
      }
    }
    catch (error: any) {
      message.error(error?.message || '加载失败')
      console.error('Failed to initialize:', error)
    }
    finally {
      isHydratingMirrorRef.current = false
      setLoading(false)
    }
  }

  useEffect(() => {
    init()
  }, [])

  useEffect(() => {
    const currentKey = JSON.stringify([
      mirrorType ?? null,
      gpuType?.[0] ?? null,
      isMlDeployContext ? 'ml' : 'deploy',
    ])

    if (previousMirrorQueryKeyRef.current === null) {
      previousMirrorQueryKeyRef.current = currentKey
      return
    }

    if (previousMirrorQueryKeyRef.current !== currentKey) {
      previousMirrorQueryKeyRef.current = currentKey
      if (!isHydratingMirrorRef.current)
        formData.setFieldValue('ReasoningMirror', undefined)
    }
  }, [formData, gpuType, isMlDeployContext, mirrorType])

  // 监听模型来源变化
  useEffect(() => {
    if (isMachine)
      return
    setModelsOptions([])
    formData.setFieldValue('modelName', undefined)
    formData.setFieldValue('model_version', undefined)
    getModels(selectedSource)
  }, [selectedSource, isMachine])

  // 用于获取模型版本
  useEffect(() => {
    if (isMachine)
      return
    setTrainedModelVersions([])
    const modelVersion = formData.getFieldValue('model_version')
    formData.setFieldValue('model_version', modelVersion)

    if (selectedSource == 'trained_model' && modelName !== undefined) {
      getModelVersions()
    }
  }, [modelName, isMachine])

  // 数据监听，发生变化加入参数配置中置灰
  useEffect(() => {
    const disabledParams = []
    let inferenceParams = formData.getFieldValue('inferenceParams') || []

    // 对模型名称、显卡数量做特殊处理
    if (serveName && mirrorType === 'vLLM') {
      disabledParams.push({
        key: '--served-model-name',
        value: serveName,
      })
    }
    if (gpuCount > 1) {
      disabledParams.push({
        key: '--tensor-parallel-size',
        value: gpuCount.toString(),
      })
    }
    else {
      // 如果显卡数量为1，则过滤掉 disabledParams 中的 key
      inferenceParams = inferenceParams.filter((item) => !disabedParamsKeyList.includes(item.key))
    }

    // 过滤掉 disabledParams 中的 key，后合并 disabledParams 和 filteredParams
    const disabledKeys = disabledParams.map((p) => p.key)
    const filteredParams = inferenceParams.filter(
      (p: any) => !disabledKeys.includes(p.key),
    )

    const mergedParams = [...disabledParams, ...filteredParams]
    formData.setFieldValue('inferenceParams', mergedParams)
  }, [serveName, gpuCount])

  // 监听镜像类型变化
  const previousMirrorType = useRef<string | undefined>(mirrorType)
  useEffect(() => {
    const oldValue = previousMirrorType.current
    const newValue = mirrorType

    // 只在有新值且值发生变化时更新
    if (newValue && oldValue !== newValue) {
      setConfigParamOptions(delopCodeParamsList[newValue === 'DGI Server' ? 'DgiServer' : newValue] || [])

      // 保存旧镜像类型配置的参数到缓存
      if (oldValue) {
        const currentParams = formData.getFieldValue('inferenceParams') || []
        const currentEnvVariables = formData.getFieldValue('envVariables') || []
        setConfigParamCache((prev) => ({
          ...prev,
          [oldValue]: {
            params: currentParams,
            envVariables: currentEnvVariables,
          },
        }))
      }

      // 恢复新镜像类型的参数（如果有缓存的话）
      setTimeout(() => {
        if (configParamCache[newValue]) {
          formData.setFieldsValue({
            inferenceParams: configParamCache[newValue].params,
            envVariables: configParamCache[newValue].envVariables,
          })
        }
        else {
          formData.setFieldsValue({
            inferenceParams: [],
          })
        }
      }, 0)
    }

    // 更新 ref 为当前值
    previousMirrorType.current = newValue
  }, [mirrorType])

  // 筛选模型（基础模型/训练模型/机器模型）
  const filterModel = () => {
    if (selectedSource === ModelSource.MachineModel) {
      return {
        id: formData.getFieldValue('ml_model_id'),
        name: formData.getFieldValue('modelName'),
      }
    }
    const model = selectedSource == ModelSource.TrainedModel
      ? trainedModelVersions.find((item) => item.model_version === modelVersion)
      : modelsOptions.find((item) => item.name === modelName)
    return model
  }
  const computeModelPath = () => {
    const model = filterModel()
    let code_model_name = ''
    if (selectedSource === ModelSource.MachineModel) {
      code_model_name = modelName && mlModelVersion
        ? `/data/ml_models/${modelName}_${mlModelVersion}`
        : ''
    }
    if (selectedSource == ModelSource.TrainedModel) {
      code_model_name = modelName && modelVersion
        ? `/data/models/${model?.name}_${modelVersion}` : ''
    }
    if (selectedSource == ModelSource.BaseModel) {
      code_model_name = modelName
        ? `/data/models/${model?.model_provider}/${model?.name}`
        : ''
    }
    return code_model_name
  }
  // 展示更多配置
  useEffect(() => {
    if (isMlDeployContext) {
      setCodeText('gunicorn --bind :9090 --workers 1 --threads 1 --timeout 120 _wsgi:app')
      return
    }

    const Prefix = () => {
      switch (mirrorType) {
        case 'vLLM':
          return 'vLLM serve'
        case 'SGLang':
          return 'python3 -m sglang.launch_server'
        case 'DGI Server':
          return 'dgi server'
      }
    }

    const modelPath = computeModelPath()
    const params = [
      ...reasoningParams || [],
    ].filter((item) => item?.key)
      .map((item) => `${item.key} ${item.value ? item.value : ''}`).join(' ')

    setCodeText(
      `${Prefix()} ${modelPath} ${params}`,
    )
  }, [modelName, mirrorType, reasoningParams, modelVersion, mlModelVersion, selectedSource, isMachine])

  // 开始部署
  const [deployLoading, setDeployLoading] = useState(false)
  const [onlineDebugLoading, setOnlineDebugLoading] = useState(false)

  /** 在线调试：服务名 + 资源 + 模型汇总 + 版本记录 id 有值即可请求 */
  const ONLINE_DEBUG_VALIDATE_FIELDS = [
    'name',
    'resource_cpu_request',
    'resource_cpu_limit',
    'resource_memory_request',
    'resource_memory_limit',
    'gpu_type',
    'gpu_count',
    'ml_model_id',
    'ml_model_version',
    'ml_model_version_id',
  ] as const

  const onlineDebugCanSubmit = useMemo(() => {
    if (!isMachine)
      return false
    const nameOk = typeof serveName === 'string' && serveName.trim().length > 0
    const resourceOk
      = resourceCpuRequest != null
        && resourceCpuLimit != null
        && resourceMemoryRequest != null
        && resourceMemoryLimit != null
        && Array.isArray(gpuType)
        && gpuType.length >= 2
        && gpuCount != null
    const rawRec = mlModelVersionRecordIdWatch
    const numRec = typeof rawRec === 'number' ? rawRec : Number(rawRec)
    const modelOk
      = mlModelSummaryIdWatch != null
        && mlModelSummaryIdWatch !== ''
        && Number.isFinite(numRec)
    return nameOk && resourceOk && modelOk
  }, [
    isMachine,
    serveName,
    resourceCpuRequest,
    resourceCpuLimit,
    resourceMemoryRequest,
    resourceMemoryLimit,
    gpuType,
    gpuCount,
    mlModelSummaryIdWatch,
    mlModelVersionRecordIdWatch,
  ])

  const assembleDelopData = (values: Record<string, any>): DelopServerStartParams => {
    const gpuTypeVal = values.gpu_type as unknown[] | undefined
    let gpuDetailInfo: { model?: string, memory?: string, type?: string } | undefined
    if (gpuTypeVal?.length) {
      const tier1 = gpuCascaderOptions?.find((item) => item.value === gpuTypeVal[0])
      gpuDetailInfo = tier1?.children?.find((item) => item.value === gpuTypeVal[1])
    }
    const imageInfo = mirrors?.find((item) => item.id === values.ReasoningMirror)
    const model = filterModel()

    const modelSource: ModelSource = isMachine
      ? ModelSource.MachineModel
      : (values.source as ModelSource)

    const mirrorTypeVal = values.mirror_type || (isMachine ? 'ML' : 'vLLM')
    const inferenceType = mirrorTypeVal === 'DGI Server' ? 'DGI-Server' : mirrorTypeVal

    const delopData: DelopServerStartParams = {
      server_name: values.name ?? '',
      project_id: parseInt(projectId!),
      model_source: modelSource,
      desired_replicas: values.deploy_count ?? 0,
      inference_engine_type: inferenceType as DelopServerStartParams['inference_engine_type'],
      ...(!isMachine
        ? {
            backend_parameters: [
              computeModelPath(),
              ...(values.inferenceParams || [])
                .filter((item: any) => item.key)
                .flatMap((item: any) => (item.value ? [item.key, item.value] : [item.key])),
            ].flat(),
          }
        : {}),
      env_vars: (values.envVariables || [])
        .filter((item: any) => item?.key)
        .reduce((acc: Record<string, any>, item: any) => {
          acc[item.key] = item.value ?? ''
          return acc
        }, {}),
      run_command: codeText || '',
      image_config: {
        image_id: values.ReasoningMirror ?? 0,
        image_name: imageInfo?.image ?? '',
        image_url: imageInfo?.image_address ?? '',
      },
      graphics_card_resource: {
        card_type: String(gpuTypeVal?.[0] ?? ''),
        card_model: gpuDetailInfo?.model || graphics_card_resource?.card_model || '',
        count: values.gpu_count as number,
        card_memory: gpuDetailInfo?.memory || graphics_card_resource?.card_memory || '',
        k8s_resource_type: gpuDetailInfo?.type || graphics_card_resource?.k8s_resource_type || ('' as any),
      },
      resource_cpu_config: {
        resource_cpu_request: values.resource_cpu_request,
        resource_cpu_limit: values.resource_cpu_limit,
        resource_memory_request: values.resource_memory_request,
        resource_memory_limit: values.resource_memory_limit,
      },
    }

    if (modelSource === ModelSource.TrainedModel) {
      delopData.trained_model_config = {
        trained_model_id: model?.id,
        trained_model_name: model?.name,
        trained_model_path: model?.model_path,
        model_version: values.model_version,
      }
    }
    if (modelSource === ModelSource.BaseModel) {
      delopData.base_model_config = {
        base_model_id: model?.id,
        base_model_name: model?.name,
        base_model_path: model?.model_path,
      }
    }
    if (modelSource === ModelSource.MachineModel) {
      const rawVid = values.ml_model_version_id
      const versionRecordId = typeof rawVid === 'number' ? rawVid : Number(rawVid)
      const fromNotebook = values.ml_python_source_type === 'notebook'
      const refTrim = String(values.ml_notebook_source_ref ?? '').trim()
      const mlModelName
        = String(values.modelName ?? '').trim()
          || mlModelSelectOptions.find(
            (r) => r.id === values.ml_model_id || String(r.id) === String(values.ml_model_id),
          )?.model_name?.trim()
          || ''
      if (!Number.isFinite(versionRecordId))
        throw new Error('请选择机器模型版本')
      const baseMl: MlModelConfig = {
        /** 接口约定：传版本记录 id，与表单字段 ml_model_version_id 一致 */
        ml_model_id: versionRecordId,
        ml_model_name: mlModelName,
        ...(values.ml_model_version != null && values.ml_model_version !== ''
          ? { model_version: values.ml_model_version }
          : {}),
      }
      if (fromNotebook && values.ml_notebook_id != null && refTrim !== '') {
        delopData.ml_model_config = {
          ...baseMl,
          notebook_id: values.ml_notebook_id as number,
          handle_source_ref: refTrim,
          ml_handle_source_type: 'notebook',
        }
      }
      else {
        const uploadId = String(values.ml_handle_upload_id ?? '').trim()
        delopData.ml_model_config = {
          ...baseMl,
          ...(uploadId !== '' ? { ml_handle_upload_id: uploadId } : {}),
        }
      }
    }
    return delopData
  }

  const validateMachinePythonSourceForDeploy = (values: Record<string, any>) => {
    if (!isMachine)
      return
    if (values.ml_python_source_type === 'notebook') {
      formData.setFields([
        { name: 'ml_notebook_id', errors: [] },
        { name: 'ml_notebook_source_ref', errors: [] },
      ])
      return
    }
    if (values.ml_python_source_type !== 'local') {
      formData.setFields([{ name: 'ml_handle_upload_id', errors: [] }])
      return
    }
    const uploadId = String(values.ml_handle_upload_id ?? '').trim()
    if (uploadId !== '') {
      formData.setFields([{ name: 'ml_handle_upload_id', errors: [] }])
      return
    }
    formData.setFields([{ name: 'ml_handle_upload_id', errors: ['请先上传 Python 文件'] }])
    throw new Error('请先上传 Python 文件')
  }

  const buildDelopData = async (): Promise<DelopServerStartParams> => {
    const values = await formData.validateFields()
    validateMachinePythonSourceForDeploy(values)
    return assembleDelopData(values)
  }

  const buildDelopDataForOnlineDebug = async (): Promise<DelopServerStartParams> => {
    await formData.validateFields([...ONLINE_DEBUG_VALIDATE_FIELDS])
    return assembleDelopData(formData.getFieldsValue(true))
  }

  const onOnlineDebug = async () => {
    if (!projectId)
      return
    try {
      setOnlineDebugLoading(true)
      const delopData = await buildDelopDataForOnlineDebug()
      delopData.auto_start = true
      const debugRes = await DelopServerApi.onlineDebug(parseInt(projectId, 10), delopData)
      const notebook = await notebookService.getNotebookInstance(String(debugRes.notebook_id), parseInt(projectId, 10))
      window.open(getNotebookDetailPageUrl(notebook.id), '_blank', 'noopener,noreferrer')
      message.success('在线调试已启动，已打开 Notebook 详情页')
    }
    catch (error) {
      console.error('Failed to start online debug:', error)
      message.error('在线调试启动失败')
    }
    finally {
      setOnlineDebugLoading(false)
    }
  }

  const onStartDeploy = async () => {
    try {
      setDeployLoading(true)
      const delopData = await buildDelopData()

      const successMsg = twice ? '重新部署中' : '部署中'
      const response = twice ? await DelopServerApi.redeploy(props.readyDelopMsg?.id, delopData) : await DelopServerApi.action(delopData)

      if (twice)
        onTwiceDeploySuccess?.()

      message.success(successMsg)
      // 保持loading状态直到页面跳转，防止重复点击
      setTimeout(() => {
        navigate(-1)
      }, 1000)
    }
    catch (error) {
      console.error('Failed to start deploy:', error)
      message.error('部署失败')
      setDeployLoading(false)
    }
  }

  const formContent = (
    <Spin spinning={loading} tip="加载中...">
      <DeployServiceBasicForm
        form={formData}
        isMachine={isMachine}
        twice={twice}
        readyDelopMsg={readyDelopMsg}
        mlModelListLoading={mlModelListLoading}
        mlModelSelectOptions={mlModelSelectOptions}
        projectId={projectId}
        mlRedeployVersionList={mlRedeployVersionList}
        selectedSource={selectedSource}
        modelVersion={modelVersion}
        modelsOptions={modelsOptions}
        trainedModelVersions={trainedModelVersions}
        onMachineModelChange={setLocalPythonResetKey}
      />
      <DeployServiceResourceForm
        form={formData}
        gpuCascaderOptions={gpuCascaderOptions}
        loadGpuModelData={loadGpuModelData}
        isMlDeployContext={isMlDeployContext}
        mirrorTypeList={mirrorTypeList}
        mirrors={mirrors}
      />
      <DeployServiceEnvironmentForm
        form={formData}
        codeText={codeText}
        isMachine={isMachine}
        projectId={projectId}
        onlineDebugLoading={onlineDebugLoading}
        onlineDebugDisabled={!onlineDebugCanSubmit}
        onOnlineDebug={() => void onOnlineDebug()}
        twice={twice}
        readyDelopMsg={readyDelopMsg}
        mlModelSelectOptions={mlModelSelectOptions}
        configParamOptions={configParamOptions}
        reasoningParams={reasoningParams}
        disabedParamsKeyList={disabedParamsKeyList}
        localPythonResetKey={localPythonResetKey}
      />
    </Spin>
  )

  if (!twice) {
    return (
      <div className="create-form-page">
        <section className="create-form-card">
          <CreateFormPageHeader
            title={isMachine ? '创建机器模型部署' : '部署服务'}
            onBack={() => navigate(-1)}
            actions={(
              <>
                <Button className="create-form-cancel" onClick={() => navigate(-1)}>取消</Button>
                <Button className="create-form-submit" type="primary" onClick={() => onStartDeploy()} loading={deployLoading}>
                  {deployLoading ? '部署中...' : '开始部署'}
                </Button>
              </>
            )}
          />
          <div className="create-form-divider" />
          <div className="create-form-body">
            {formContent}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="p-0 pb-6">
      {/* 主体内容区域：固定最大高度，超出滚动 */}
      <div className="mt-0 max-h-[calc(100vh-280px)] overflow-y-auto mt-4 pl-6">
        {formContent}
      </div>

      <Affix offsetBottom={0}>
        <div className="mt-4 flex justify-start gap-4 mb-2 pl-6 bg-white py-2">
          <Button
            type="primary"
            loading={deployLoading}
            onClick={() => {
              Modal.confirm({
                title: '确认重新部署',
                content: '重新部署推理服务，过程中推理服务不可用。是否确认重新部署？',
                okText: '确认重新部署',
                cancelText: '取消',
                centered: true,
                okButtonProps: { danger: true },
                width: 500,
                onOk: () => {
                  onStartDeploy()
                },
              })
            }}
          >
            {deployLoading ? '部署中...' : '重新部署'}
          </Button>
        </div>
      </Affix>
    </div>
  )
}
