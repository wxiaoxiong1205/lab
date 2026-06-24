import { message } from 'antd'
import type {
  ApiResponse,
  AppMenuFilteredResult,
  CreateServiceRequest,
  CreateServiceResponse,
  DeleteServiceRequest,
  GroupListResponse,
  InferenceServiceDetail,
  ListParams,
  MenuResponse,
  ModelServiceMenuGroup,
  TestServiceRequest,
  TestServiceResponse,
  UpdateServiceRequest,
} from '../types/inference'
import apiClient from './apiClient'
import type {
  DebugResponse,
  DelopServerDeleteParams,
  DelopServerDetailParams,
  DelopServerListParams,
  DelopServerStartParams,
  DelopServerUpdateDesiredReplicasParams,
  DeplopServerDetailResponse,
  DeplopServerListResponse,
  DeplopServerStartResponse,
  StartOrStopParams,
} from '@/types/inference/deplop'

function serializeDelopServerListParams(params) {
  const query = new URLSearchParams()
  for (const [key, raw] of Object.entries(params)) {
    if (raw === undefined || raw === null)
      continue
    // 字符串数组情况
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (item !== undefined && item !== null)
          query.append(key, String(item))
      }
      continue
    }
    // 单个字符串
    query.append(key, String(raw))
  }
  return query.toString()
}

const DATA_MANAGEMENT_CHILD_CODES = ['business_test', 'training_management', 'test_management'] as const

/** 做一层映射 将菜单service_inference_external映射为接口所用inference_service */
function mapBussinessType(businessType: string): string {
  return businessType === 'service_inference_external' ? 'inference_service' : businessType
}
const MODEL_SERVICE_CHILD_CODES = ['service_inference_external', 'api_service'] as const

/** 从原始菜单列表中解析「模型服务」一级菜单及其二级子项（如在线推理服务、API服务） */
function getModelServiceMenu(list: MenuResponse[]): ModelServiceMenuGroup | null {
  if (!Array.isArray(list) || list.length === 0) return null
  const largeModelNode = list.find((item) => item.code === 'large_model')
  if (!largeModelNode || !Array.isArray(largeModelNode.children) || largeModelNode.children.length === 0)
    return null
  const largeModelChildren = (largeModelNode.children as MenuResponse[]).filter(
    (item): item is MenuResponse => typeof item === 'object' && item != null && 'code' in item,
  )
  const modelServiceNode = largeModelChildren.find((item) => item.code === 'model_service')
  if (!modelServiceNode) return null
  let children: MenuResponse[] = []
  if (Array.isArray(modelServiceNode.children) && modelServiceNode.children.length > 0) {
    children = (modelServiceNode.children as MenuResponse[]).filter(
      (c): c is MenuResponse => typeof c === 'object' && c != null && 'code' in c,
    )
  }
  else {
    children = list.filter((item) => item.parentId === modelServiceNode.id)
  }
  const options = children
    .filter((item) => MODEL_SERVICE_CHILD_CODES.includes(item.code as any))
    .map((item) => ({ code: item.code, name: item.name }))
  if (options.length === 0) return null
  return {
    code: modelServiceNode.code,
    name: modelServiceNode.name || '模型服务',
    options,
  }
}

/** 从原始菜单列表中过滤：large_model 下的一级菜单 + 数据管理下的选项 + 模型服务下的二级菜单。 */
function filterAppMenu(list: MenuResponse[]): AppMenuFilteredResult {
  const result: AppMenuFilteredResult = {
    firstLevelMenus: [],
    dataManagementOptions: [],
    modelServiceMenu: getModelServiceMenu(list),
  }
  if (!Array.isArray(list) || list.length === 0) return result

  const largeModelNode = list.find((item) => item.code === 'large_model')
  if (!largeModelNode || !Array.isArray(largeModelNode.children) || largeModelNode.children.length === 0)
    return result
  const largeModelChildren = (largeModelNode.children as MenuResponse[]).filter(
    (c): c is MenuResponse => typeof c === 'object' && c != null && 'code' in c,
  )
  const dataServicesNode = largeModelChildren.find((item) => item.code === 'data_services')
  let firstLevel: MenuResponse[] = []
  let dataManagementNode: MenuResponse | undefined

  if (dataServicesNode) {
    if (Array.isArray(dataServicesNode.children) && dataServicesNode.children.length > 0) {
      const children = dataServicesNode.children as MenuResponse[]
      firstLevel = children.filter((c) => {
        if (typeof c === 'object' && c !== null) {
          const item = c
          return item.code !== undefined
        }
        return false
      }) as MenuResponse[]
    }
    else {
      firstLevel = list.filter((item) => item.parentId === dataServicesNode.id)
    }
    dataManagementNode = firstLevel.find((c) => c.code === 'data_management')
  }

  result.firstLevelMenus = firstLevel.map((item) => ({ code: item.code, name: item.name }))

  if (!dataManagementNode) return result

  let optionsSource: MenuResponse[] = []
  if (Array.isArray(dataManagementNode.children) && dataManagementNode.children.length > 0) {
    const children = dataManagementNode.children as MenuResponse[]
    optionsSource = children.filter((c): c is MenuResponse => typeof c === 'object' && c != null && 'code' in c)
  }
  else {
    optionsSource = list.filter((item) => item.parentId === dataManagementNode!.id)
  }
  result.dataManagementOptions = optionsSource
    .filter((item) => DATA_MANAGEMENT_CHILD_CODES.includes(item.code as any))
    .map((item) => ({ code: item.code, name: item.name }))

  return result
}

// 删除服务的工具函数，包含错误处理和消息提示
export const deleteInferenceService = async (serviceId: string | number, projectId: string, onSuccess?: () => void): Promise<boolean> => {
  try {
    // 将string类型的id转换为number类型
    const deleteData: DeleteServiceRequest = {
      ids: [typeof serviceId === 'string' ? parseInt(serviceId) : serviceId],
    }

    // 调用删除接口
    const response = await inferenceServiceApi.delete(deleteData, projectId)

    if (response.status === 204) {
      message.success('服务删除成功')
      // 调用成功回调
      onSuccess?.()
      return true
    }
    else {
      message.error(response.msg || '服务删除失败')
      return false
    }
  }
  catch {
    message.error('删除服务时发生错误')
    return false
  }
}

export const inferenceServiceApi = {
  // 服务列表
  list: async (params?: ListParams): Promise<ApiResponse> => {
    if (!params?.projectId) {
      throw new Error('projectId is required')
    }
    const response = await apiClient.get(`/online_inference_service/project/${params.projectId}/list`, {
      params: {
        page: params?.page || 1,
        size: params?.size || 50,
        ...(params?.name && { name: params.name }),
        ...(params?.status && { status: params.status }),
        ...(params?.model_type && { model_type: params.model_type }),
      },
    })
    return response.data
  },

  // 获取服务详情
  getDetail: async (serviceId: string, projectId: string): Promise<InferenceServiceDetail> => {
    const response = await apiClient.get(`/online_inference_service/project/${projectId}/detail/${serviceId}`)
    return response.data
  },

  // 创建服务
  create: async (data: CreateServiceRequest, projectId: string): Promise<CreateServiceResponse> => {
    const response = await apiClient.post(`/online_inference_service/project/${projectId}/create`, data)
    return response.data
  },

  // 删除服务
  delete: async (data: DeleteServiceRequest, projectId: string): Promise<any> => {
    const response = await apiClient.delete(`/online_inference_service/project/${projectId}/delete`, {
      data,
    })
    return response
  },

  // 测试连接服务
  test: async (data: TestServiceRequest, projectId: string): Promise<TestServiceResponse> => {
    const response = await apiClient.post(`/online_inference_service/project/${projectId}/test_connectivity`, data)
    return response.data
  },

  // 更新服务
  update: async (data: UpdateServiceRequest, projectId: string): Promise<TestServiceResponse> => {
    const response = await apiClient.put(`/online_inference_service/project/${projectId}/update`, data)
    return response.data
  },
}

// 属性api接口
export const attributeService = {
  /** 获取应用内菜单（已过滤：一级菜单 + 数据管理下的选项） */
  getAppMenu: async (): Promise<AppMenuFilteredResult> => {
    const response = await apiClient.get<MenuResponse[]>('/business-attr/app-menu')
    const list: MenuResponse[] = Array.isArray(response?.data) ? response.data : (response as any) ?? []
    return filterAppMenu(list)
  },

  // 属性列表
  list: async (params?: { page?: number, size?: number, business_type: string, name?: string }): Promise<ApiResponse> => {
    const apiBusinessType = params?.business_type ? mapBussinessType(params.business_type) : undefined
    const response = await apiClient.get('/business-attr/list', {
      params: {
        page: params?.page || 1,
        size: params?.size || 10,
        ...(apiBusinessType && { business_type: apiBusinessType }),
        name: params?.name,
      },
    })
    return response.data
  },
  delete: async (attrId: number): Promise<any> => {
    const response = await apiClient.delete(`/business-attr/delete`, {
      data: {
        ids: [
          attrId,
        ],
      },
    })
    return response
  },
  create: async (params): Promise<any> => {
    const apiBusinessType = params.business_type ? mapBussinessType(params.business_type) : undefined
    const requestBody: any = {
      description: params.description,
      order_attr: 0,
      required_tag: params.required_tags,
      name: params.name,
      input_type: params.input_type,
      data_type: 'string',
      group: params.group,
      ...(apiBusinessType && { business_type: apiBusinessType }),
    }

    // 如果是下拉选择类型，添加 multi_select 和 options
    if (params.input_type === '下拉选择') {
      requestBody.multi_select = params.multi_select ?? 0
      requestBody.options = params.options || []
    }
    console.log(requestBody.options)
    const response = await apiClient.post('/business-attr/create',
      requestBody,
    )
    return response.data
  },

  groupList: async (business_type: string): Promise<GroupListResponse> => {
    const apiBusinessType = mapBussinessType(business_type)
    const response = await apiClient.get<GroupListResponse>('/business-attr/list-by-group', {
      params: {
        business_type: apiBusinessType,
      },
    })
    return response.data
  },
}

// 已部署推理服务
export const DelopServerApi = {
  mock: {
    list: [
      {
        id: 44,
        service_name: 'qwen1351',
        description: '模型推理',
        project_id: 1,
        status: '准备中',
        model_source: 'base_model',
        model_name: 'Qwen2.5-1.5B-Instruct',
        desired_replicas: 1,
        ready_replicas: 0,
        created_by: 'lab_debug_admin',
        created_at: '2025-12-12T13:55:38.910418',
        updated_at: '2025-12-12T13:55:38.910418',
        access_url: 'http://115.190.108.164:9056',
      },
    ],
  },
  // 列表
  list: async (params: DelopServerListParams): Promise<DeplopServerListResponse> => {
    const response = await apiClient.get(`/inference_tasks/project/${params.project_id}`, {
      params,
      paramsSerializer: serializeDelopServerListParams,
    })
    return response.data
  },

  // 部署服务
  action: async (data: DelopServerStartParams): Promise<DeplopServerStartResponse> => {
    const response = await apiClient.post(`/inference_tasks/project/${data.project_id}`, data)
    return response.data
  },

  // 重新部署
  redeploy: async (inference_task_id: number, data: DelopServerStartParams): Promise<DeplopServerStartResponse> => {
    const response = await apiClient.put(`/inference_tasks/${data.project_id}/${inference_task_id}/redeploy`, data)
    return response.data
  },

  // 详情获取
  getDetail: async (params: DelopServerDetailParams): Promise<DeplopServerDetailResponse> => {
    const response = await apiClient.get(`/inference_tasks/project/${params.project_id}/${params.inference_task_id}`)
    return response.data
  },

  // 删除推理任务
  delete: async (params: DelopServerDeleteParams): Promise<any> => {
    const response = await apiClient.delete(`/inference_tasks/${params.project_id}/${params.inference_task_id}`)
    return response.data
  },

  // 启动或停止运行
  startOrStop: async (data: StartOrStopParams): Promise<any> => {
    const response = await apiClient.put(`/inference_tasks/${data.project_id}/${data.inference_task_id}/update`, {
      update_type: data.update_type,
    })
    return response.data
  },

  // 修改实例数
  updateDesiredReplicas: async (params: DelopServerUpdateDesiredReplicasParams): Promise<any> => {
    const response = await apiClient.post(`/inference_tasks/${params.project_id}/${params.inference_task_id}/scale`, {
      desired_replicas: params.desired_replicas,
    })
    return response.data
  },

  /** 下载机器学习 demo 样例压缩包（zip） */
  downloadDemo: async (projectId: number, ml_task_type: string): Promise<Blob> => {
    const response = await apiClient.get(`/models/ml/project/${projectId}/demo-sample`, {
      params: { ml_task_type },
      responseType: 'blob',
    })
    return response.data
  },

  // 机器学习 模型部署 在线调试
  onlineDebug: async (projectId: number, data: DelopServerStartParams) => {
    const response = await apiClient.post<DebugResponse>(`/inference_tasks/project/${projectId}/ml_debug_notebook`, data)
    return response.data
  },
}
