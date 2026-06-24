import type {
  AddProjectMemberRequest,
  BatchAddProjectMemberRequest,
  CreateDatasetRequest,
  CreateLLMConfigRequest,
  CreateProjectRequest,
  Dataset,
  LLMConfig,
  LoginRequest,
  LoginResponse,
  MenuItem,
  PageUser,
  Page_PromptDirectoryResponse_,
  Page_PromptResponse_,
  Project,
  ProjectMember,
  ProjectMemberListResponse,
  ProjectMemberRole,
  PromptResponse,
  RegisterRequest,
  TestRun,
  UpdateLLMConfigRequest,
  UpdateProjectMemberRequest,
  User,
  UserUpdate,
} from '../types'
import type {
  BatchDeleteRequest,
  DatasetLogResponse,
  Page_DatasetLogResponse_,
} from '../types/dataset'
import { downloadBlobFile } from '../utils/download'
import { mockMenuData } from '../mock/mockMenuData'
import { isLocalPreview, previewProjectList } from '../mock/localPreviewData'
import apiClient from './apiClient'

// 在types部分中添加PromptDirectory类型
export interface PromptDirectory {
  id: number
  name: string
  description: string | null
  project_id: number
  prompt_count: number
  created_at: string
  updated_at: string
}

// 统一使用 apiClient 作为 axios 实例
const api = apiClient

const pickMenuArray = (value: unknown): MenuItem[] | null => {
  if (Array.isArray(value)) {
    return value as MenuItem[]
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const candidates = [
    (value as any).data,
    (value as any).menus,
    (value as any).items,
    (value as any).rows,
    (value as any).result,
    (value as any).data?.menus,
    (value as any).data?.items,
    (value as any).data?.rows,
    (value as any).data?.result,
  ]

  const menuArray = candidates.find(Array.isArray)
  return menuArray ? (menuArray as MenuItem[]) : null
}

const getLocalPreviewMenuData = (): MenuItem[] => {
  return mockMenuData.map((item) => ({ ...item }))
}

// 认证相关API
export const authApi = {
  login: async (data: LoginRequest) => {
    try {
      const formData = new URLSearchParams()
      formData.append('username', data.username)
      formData.append('password', data.password)

      const response = await api.post<LoginResponse>(
        '/users/login',
        formData.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      )

      // 验证响应中是否包含token
      if (!response.data || !response.data.access_token) {
        throw new Error('服务器返回的登录响应中没有包含token')
      }

      // 立即将token存储到localStorage，确保后续请求可以使用
      localStorage.setItem('auth_token', response.data.access_token)

      console.log(
        'Login API: Token received and stored:',
        `${response.data.access_token.substring(0, 10)}...`,
      )

      return response.data
    }
    catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'response' in error) {
        const err = error as { response?: unknown }
        console.error('登录API错误:', err.response || err)
      }
      else {
        console.error('登录API错误:', error)
      }
      throw error
    }
  },

  register: async (data: RegisterRequest) => {
    const response = await api.post<User>('/users/register', data)
    return response.data
  },

  getCurrentUser: async () => {
    try {
      // 确保有token可用
      const token = localStorage.getItem('auth_token')
      if (!token) {
        throw new Error('尝试获取当前用户信息时没有可用的认证token')
      }

      const response = await api.get<User>('/users/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      return response.data
    }
    catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'response' in error) {
        const err = error as { response?: unknown }
        console.error('获取当前用户信息错误:', err.response || err)
      }
      else {
        console.error('获取当前用户信息错误:', error)
      }
      throw error
    }
  },
  updatePassword: async (data: any, id?: number) => {
    const response = await api.put<any>(`/users/${id}`, data)
    return response.data
  },
  /**
   * 获取菜单可见性配置
   */
  getMenuVisible: async () => {
    const response = await api.get<{ visible: boolean, reason: string }>('/permissions/menu/visible')
    return response.data
  },
}

// 获取项目自定义镜像命名空间
export const projectImageBuildNamespaceApi = {
  // 获取项目自定义镜像构建命名空间
  getProjectImageBuildNamespace: async (project_id: number) => {
    const response = await api.get<string>(
      `/projects/get-project-image-build-namespace/${project_id}`,
    )
    return response.data
  },

  // 创建项目自定义镜像构建命名空间
  createProjectImageBuildNamespace: async (project_id: number, image_build_namespace: string) => {
    const response = await api.put<string>(
      `/projects/project-image-build-namespace/${project_id}`,
      { image_build_namespace },
    )
    return response.data
  },
}

// 项目相关API
export interface ProjectListResponse {
  items: Project[]
  total: number
  page: number
  size: number
}
// 获取项目所有枚举值api
export interface ProjectEnumValuesResponse {
  all_enums?: []
  enums_by_module?: []
  training_dataset?: []
  training_task?: []
}
export const getProjectEnum = async () => {
  const response = await api.get<ProjectEnumValuesResponse>(`/enums/list`)
  return response.data
}
export const projectApi = {
  /**
   * 获取项目列表（分页）
   * @param page 页码（从1开始，默认1）
   * @param size 每页数量（默认50，最大100）
   */
  list: async (data: {
    page: number
    size: number
  }): Promise<ProjectListResponse> => {
    try {
      const response = await api.get<ProjectListResponse>('/projects/list', {
        params: data,
      })
      if (isLocalPreview && (!Array.isArray(response.data?.items) || response.data.items.length === 0)) {
        return previewProjectList(data.page, data.size)
      }
      return response.data
    }
    catch (error) {
      if (isLocalPreview) {
        console.warn('本地预览：项目列表获取失败，使用演示数据兜底。', error)
        return previewProjectList(data.page, data.size)
      }
      throw error
    }
  },

  /**
   * 创建新项目
   */
  create: async (data: CreateProjectRequest) => {
    const response = await api.post<Project>('/projects', data)
    return response.data
  },

  /**
   * 获取项目详情
   */
  get: async (id: number) => {
    const response = await api.get<Project>(`/projects/${id}`)
    return response.data
  },

  /**
   * 更新项目
   */
  update: async (id: number, data: CreateProjectRequest) => {
    const response = await api.put<Project>(`/projects/${id}`, data)
    return response.data
  },

  /**
   * 删除项目
   */
  delete: async (id: number) => {
    await api.delete(`/projects/${id}`)
  },
}

// 项目成员管理API
export const projectMemberApi = {
  /**
   * 获取项目成员列表
   * @param projectId 项目ID
   * @param params 分页参数
   */
  list: async (
    projectId: number,
    params?: { page?: number, size?: number },
  ): Promise<ProjectMemberListResponse> => {
    const response = await api.get<ProjectMemberListResponse>(
      `/projects/${projectId}/user/list`,
      { params },
    )
    return response.data
  },

  /**
   * 获取项目的用户列表（项目已关联的用户）
   * @param projectId 项目ID
   * @param params 分页参数
   */
  getProjectUsers: async (
    projectId: number,
    params?: { page?: number, size?: number },
  ): Promise<PageUser> => {
    const response = await api.get<PageUser>(
      `/projects/${projectId}/user/list`,
      { params },
    )
    return response.data
  },

  /**
   * 获取未关联该项目的用户列表（可添加为成员的用户）
   * @param projectId 项目ID
   * @param params 分页和搜索参数
   */
  getNotAssociatedUsers: async (
    projectId: number,
    params?: { page?: number, size?: number, username?: string },
  ): Promise<PageUser> => {
    const response = await api.get<PageUser>(
      `/projects/${projectId}/users/not-associated`,
      { params },
    )
    return response.data
  },

  /**
   * 添加项目成员（单个）
   * @param projectId 项目ID
   * @param data 添加成员请求数据
   */
  add: async (
    projectId: number,
    data: AddProjectMemberRequest,
  ): Promise<ProjectMember> => {
    const response = await api.post<ProjectMember>(
      `/projects/${projectId}/members`,
      data,
    )
    return response.data
  },

  /**
   * 批量添加项目成员（绑定用户到项目）
   * @param projectId 项目ID
   * @param data 批量添加成员请求数据
   */
  batchAdd: async (
    projectId: number,
    data: BatchAddProjectMemberRequest,
  ): Promise<void> => {
    await api.post(
      `/projects/${projectId}/user/batch_save`,
      data,
    )
  },

  /**
   * 更新项目成员权限
   * @param projectId 项目ID
   * @param userId 用户ID
   * @param data 更新权限请求数据
   */
  updateRole: async (
    projectId: number,
    userId: number,
    data: UpdateProjectMemberRequest,
  ): Promise<ProjectMember> => {
    const response = await api.put<ProjectMember>(
      `/projects/${projectId}/members/${userId}`,
      data,
    )
    return response.data
  },

  /**
   * 移除项目成员
   * @param projectId 项目ID
   * @param userId 用户ID
   */
  remove: async (projectId: number, userId: number): Promise<void> => {
    await api.delete(`/projects/${projectId}/members/${userId}`)
  },

  /**
   * 批量移除项目成员
   * @param projectId 项目ID
   * @param userIds 用户ID数组
   */
  batchRemove: async (projectId: number, userIds: number[]): Promise<void> => {
    await api.post(`/projects/${projectId}/user/batch_remove`, {
      user_ids: userIds,
    })
  },

  /**
   * 撤销项目管理员
   * @param projectId 项目ID
   * @param userId 用户ID
   */
  revoke: async (projectId: number, userId: number): Promise<void> => {
    await api.post(`/project/${projectId}/revoke`, {
      user_id: userId,
    })
  },

}

// 数据集相关API
export const datasetApi = {
  /**
   * 获取指定目录下的数据集列表（分页、搜索、排序）
   */
  list: async (
    projectId: number,
    directoryId: number,
    params: {
      question?: string
      sort_by?: 'created_at' | 'updated_at' | 'question'
      sort_order?: 'asc' | 'desc'
      created_after?: string
      created_before?: string
      page?: number
      size?: number
    } = {},
  ) => {
    const response = await api.get<Page_DatasetDirectoryResponse_>(
      `/datasets/by-project/${projectId}/directory/${directoryId}/list`,
      { params },
    )
    return response.data
  },

  /**
   * 在指定目录下创建数据集
   */
  create: async (
    projectId: number,
    directoryId: number,
    data: CreateDatasetRequest,
  ) => {
    const response = await api.post<Dataset>(
      `/datasets/by-project/${projectId}/directory/${directoryId}`,
      data,
    )
    return response.data
  },

  /**
   * 获取指定目录下的数据集详情
   */
  get: async (projectId: number, directoryId: number, datasetId: number) => {
    const response = await api.get<Dataset>(
      `/datasets/by-project/${projectId}/directory/${directoryId}/dataset/${datasetId}`,
    )
    return response.data
  },

  /**
   * 更新指定目录下的数据集
   */
  update: async (
    projectId: number,
    directoryId: number,
    datasetId: number,
    data: CreateDatasetRequest,
  ) => {
    const response = await api.put<Dataset>(
      `/datasets/by-project/${projectId}/directory/${directoryId}/dataset/${datasetId}`,
      data,
    )
    return response.data
  },

  /**
   * 部分更新指定目录下的数据集
   */
  partialUpdate: async (
    projectId: number,
    directoryId: number,
    datasetId: number,
    data: Partial<CreateDatasetRequest>,
  ) => {
    const response = await api.patch<Dataset>(
      `/datasets/by-project/${projectId}/directory/${directoryId}/dataset/${datasetId}`,
      data,
    )
    return response.data
  },

  /**
   * 删除指定目录下的数据集
   */
  delete: async (projectId: number, directoryId: number, datasetId: number) => {
    await api.delete(
      `/datasets/by-project/${projectId}/directory/${directoryId}/dataset/${datasetId}`,
    )
  },

  /**
   * 批量删除指定目录下的数据集
   */
  batchDelete: async (
    projectId: number,
    directoryId: number,
    datasetIds: number[],
  ) => {
    await api.delete(
      `/datasets/by-project/${projectId}/directory/${directoryId}/batch-delete`,
      {
        data: { dataset_ids: datasetIds },
      },
    )
  },

  /**
   * 导出指定目录下的数据集为Excel
   */
  exportXlsx: async (
    projectId: number,
    directoryId: number,
    params: {
      question?: string
      sort_by?: 'created_at' | 'updated_at' | 'question'
      sort_order?: 'asc' | 'desc'
      created_after?: string
      created_before?: string
    } = {},
  ) => {
    const response = await api.get(
      `/datasets/by-project/${projectId}/directory/${directoryId}/export-xlsx`,
      {
        params,
        responseType: 'blob',
      },
    )
    return response.data
  },

  /**
   * 从Excel导入数据集到指定目录
   */
  importXlsx: async (
    projectId: number,
    directoryId: number,
    file: File,
    batchSize?: number,
  ) => {
    const formData = new FormData()
    formData.append('file', file)
    const query = batchSize ? `?batch_size=${batchSize}` : ''
    const response = await api.post(
      `/datasets/by-project/${projectId}/directory/${directoryId}/import-xlsx${query}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    )
    return response.data
  },

  /**
   * 获取数据集Excel导入模板
   */
  getXlsxTemplate: async () => {
    try {
      const response = await api.get('/datasets/xlsx-template', {
        responseType: 'blob',
      })
      downloadBlobFile(new Blob([response.data]), 'dataset_template.xlsx')
    }
    catch (error) {
      console.error('Excel导出错误:', error)
      throw new Error(
        '导出Excel失败：请确保已安装xlsx库（npm install xlsx --legacy-peer-deps）',
      )
    }
  },
}

// 数据集执行日志相关API
export const datasetLogApi = {
  /**
   * 获取项目的数据集执行日志列表（分页、过滤、排序）
   * 对应后端 /dataset_logs/project/{project_id}
   */
  listByProject: async (
    projectId: number,
    params: {
      dataset_id?: number | null
      question?: string | null
      prompt_id?: number | null
      model_id?: number | null
      success?: boolean | null
      request_id?: string | null
      session_id?: string | null
      created_after?: string | null
      created_before?: string | null
      task_id?: number | null
      log_type?: string | null
      date_range?: string | null
      exact_match?: boolean
      sort_by?: 'created_at' | 'execution_time_ms' | 'question'
      sort_order?: 'asc' | 'desc'
      page?: number
      size?: number
    } = {},
  ): Promise<Page_DatasetLogResponse_> => {
    const response = await api.get<Page_DatasetLogResponse_>(
      `/dataset_logs/project/${projectId}`,
      { params },
    )
    return response.data
  },

  /**
   * 获取特定日志详情
   * 对应后端 /dataset_logs/project/{project_id}/log/{log_id}
   */
  get: async (
    projectId: number,
    logId: number,
  ): Promise<DatasetLogResponse> => {
    const response = await api.get<DatasetLogResponse>(
      `/dataset_logs/project/${projectId}/log/${logId}`,
    )
    return response.data
  },

  /**
   * 批量删除日志
   * 对应后端 /dataset_logs/project/{project_id}/batch
   */
  batchDelete: async (projectId: number, logIds: number[]): Promise<void> => {
    const data: BatchDeleteRequest = { log_ids: logIds }
    await api.delete(`/dataset_logs/project/${projectId}/batch`, {
      data,
    })
  },
}

// 提示词相关API
export interface Prompt {
  id: number
  title: string
  content: string
  description: string | null
  project_id: number
  tag_ids: number[]
  meta_info: Record<string, unknown>
  created_at: string
  updated_at: string

  // 新增字段，用于LangChain风格的模板支持
  messages?: Array<{ role: string, content: string }>
  input_variables?: string[]
  template_format?: string
  validate_template?: boolean

  // 目录相关字段
  directory_id?: number | null
  directory_name?: string | null
}

export interface CreatePromptRequest {
  title?: string
  content?: string
  description?: string
  meta_info?: Record<string, unknown>
  messages?: Array<Record<string, unknown>>
  input_variables?: string[]
  template_format?: string
  validate_template?: boolean

  // 目录ID字段
  directory_id?: number | null
}

export interface PromptSearchParams {
  project_id?: number
  title?: string
  content?: string
  tag_ids?: number[] | number
  sort_by?: 'created_at' | 'updated_at' | 'title'
  sort_order?: 'asc' | 'desc'
  skip?: number
  limit?: number

  // 目录ID字段
  directory_id?: number | null
}

// 添加更新提示词的接口定义
export interface PromptUpdate {
  title?: string
  content?: string
  description?: string
  meta_info?: Record<string, unknown>
  messages?: Array<Record<string, unknown>>
  input_variables?: string[]
  template_format?: string
  validate_template?: boolean
}

export const promptApi = {
  /**
   * 获取指定项目指定目录下的提示词列表（分页、搜索、排序）
   */
  list: async (
    projectId: number,
    directoryId: number,
    params: {
      title?: string
      content?: string
      sort_by?: 'created_at' | 'updated_at' | 'title'
      sort_order?: 'asc' | 'desc'
      page?: number
      size?: number
    } = {},
  ) => {
    const response = await api.get<Page_PromptResponse_>(
      `/prompts/by-project/${projectId}/directory/${directoryId}/prompts`,
      { params },
    )
    return response.data
  },

  /**
   * 在指定项目指定目录下创建提示词
   */
  create: async (
    projectId: number,
    directoryId: number,
    data: CreatePromptRequest,
  ) => {
    const response = await api.post<PromptResponse>(
      `/prompts/by-project/${projectId}/directory/${directoryId}/prompts`,
      data,
    )
    return response.data
  },

  /**
   * 导出指定目录下的提示词为Excel
   */
  exportXlsx: async (
    projectId: number,
    directoryId: number,
    params: {
      title?: string
      content?: string
      sort_by?: 'created_at' | 'updated_at' | 'title'
      sort_order?: 'asc' | 'desc'
      created_after?: string
      created_before?: string
    } = {},
  ) => {
    const response = await api.get(
      `/prompts/by-project/${projectId}/directory/${directoryId}/prompts/export-xlsx`,
      {
        params,
        responseType: 'blob',
      },
    )
    downloadBlobFile(
      new Blob([response.data]),
      `prompts_project_${projectId}_directory_${directoryId}.xlsx`,
    )
    return response.data
  },

  /**
   * 从Excel导入提示词到指定目录
   */
  importXlsx: async (projectId: number, directoryId: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post(
      `/prompts/by-project/${projectId}/directory/${directoryId}/prompts/import-xlsx`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    )
    return response.data
  },

  /**
   * 获取指定目录下的单个提示词
   */
  get: async (projectId: number, directoryId: number, promptId: number) => {
    const response = await api.get<PromptResponse>(
      `/prompts/by-project/${projectId}/directory/${directoryId}/prompts/${promptId}`,
    )
    return response.data
  },

  /**
   * 更新指定目录下的提示词
   */
  update: async (
    projectId: number,
    directoryId: number,
    promptId: number,
    data: PromptUpdate,
  ) => {
    const response = await api.put<PromptResponse>(
      `/prompts/by-project/${projectId}/directory/${directoryId}/prompts/${promptId}`,
      data,
    )
    return response.data
  },

  /**
   * 删除指定目录下的提示词
   */
  delete: async (projectId: number, directoryId: number, promptId: number) => {
    await api.delete(
      `/prompts/by-project/${projectId}/directory/${directoryId}/prompts/${promptId}`,
    )
  },
  getXlsxTemplate: async () => {
    const response = await api.get(`/prompts/xlsx-template`, {
      responseType: 'blob',
    })
    downloadBlobFile(new Blob([response.data]), 'prompt_template.xlsx')
    return response.data
  },
}

// LLM配置相关API
export const llmConfigApi = {
  /**
   * 获取项目下的LLM配置列表（分页、搜索、排序）
   */
  list: async (
    projectId: number,
    params: {
      name?: string
      model?: string
      is_default?: boolean
      sort_by?: 'created_at' | 'updated_at' | 'name'
      sort_order?: 'asc' | 'desc'
      page?: number
      size?: number
    } = {},
  ) => {
    const response = await api.get<Page_LLMConfigResponse_>(
      `/llm_configs/by-project/${projectId}/list`,
      { params },
    )
    return response.data
  },

  /**
   * 创建新的LLM配置
   */
  create: async (projectId: number, data: CreateLLMConfigRequest) => {
    const response = await api.post<LLMConfig>(
      `/llm_configs/by-project/${projectId}`,
      data,
    )
    return response.data
  },

  /**
   * 获取特定的LLM配置
   */
  get: async (projectId: number, configId: number) => {
    const response = await api.get<LLMConfig>(
      `/llm_configs/by-project/${projectId}/config/${configId}`,
    )
    return response.data
  },

  /**
   * 更新LLM配置
   */
  update: async (
    projectId: number,
    configId: number,
    data: UpdateLLMConfigRequest,
  ) => {
    const response = await api.put<LLMConfig>(
      `/llm_configs/by-project/${projectId}/config/${configId}`,
      data,
    )
    return response.data
  },

  /**
   * 删除LLM配置
   */
  delete: async (projectId: number, configId: number) => {
    await api.delete(`/llm_configs/by-project/${projectId}/config/${configId}`)
  },

  /**
   * 获取项目的默认LLM配置
   */
  getDefault: async (projectId: number) => {
    const response = await api.get<LLMConfig>(
      `/llm_configs/by-project/${projectId}/default`,
    )
    return response.data
  },

  /**
   * 导出LLM配置为Excel
   */
  exportXlsx: async (
    projectId: number,
    params: {
      name?: string
      model?: string
      is_default?: boolean
      sort_by?: 'created_at' | 'updated_at' | 'name'
      sort_order?: 'asc' | 'desc'
    } = {},
  ) => {
    const response = await api.get(
      `/llm_configs/by-project/${projectId}/export-xlsx`,
      {
        params,
        responseType: 'blob',
      },
    )
    downloadBlobFile(
      new Blob([response.data]),
      `llm_config_project_${projectId}.xlsx`,
    )
    return response.data
  },

  /**
   * 从Excel导入LLM配置
   */
  importXlsx: async (projectId: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post(
      `/llm_configs/by-project/${projectId}/import-xlsx`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    )
    return response.data
  },

  /**
   * 获取Excel导入模板
   */
  getXlsxTemplate: async () => {
    const response = await api.get(`/llm_configs/xlsx-template`, {
      responseType: 'blob',
    })
    downloadBlobFile(new Blob([response.data]), `llm_config_template.xlsx`)
    return response.data
  },
}

// User API
export const userApi = {
  /**
   * 用户注册 - 公开接口，无需认证
   */
  register: async (data: RegisterRequest) => {
    const response = await api.post<User>('/users/register', data)
    return response.data
  },

  /**
   * 用户登录 - 已停用，现在只通过 URL token 参数登录
   * @deprecated 不再使用表单登录，改用 URL 参数 token 登录
   */
  // login: async (data: LoginRequest) => {
  //   throw new Error('登录接口已停用，请通过授权链接访问');
  // },

  /**
   * 获取当前用户信息 - 需要认证
   */
  me: async () => {
    const response = await api.get<User>('/users/me')
    return response.data
  },

  /**
   * 获取用户列表（分页、搜索）- 需要管理员权限
   */
  list: async (params: { page?: number, size?: number, username?: string }) => {
    const response = await api.get<PageUser>('/users/list', { params })
    return response.data
  },
  /**
   * 获取菜单列表（分页、搜索）-
   */
  menuList: async () => {
    // 用于测试菜单获取失败的情况
    // throw new Error('模拟菜单获取失败 - 用于测试错误处理功能');

    try {
      const response = await api.get<unknown>('/menu')
      const menus = pickMenuArray(response.data)

      if (menus) {
        return menus
      }

      if (import.meta.env.DEV) {
        console.warn('本地预览：/menu 未返回菜单数组，使用预览菜单数据兜底。', response.data)
        return getLocalPreviewMenuData()
      }

      return []
    }
    catch (error) {
      if (import.meta.env.DEV) {
        console.warn('本地预览：/menu 获取失败，使用预览菜单数据兜底。', error)
        return getLocalPreviewMenuData()
      }

      throw error
    }
  },
  /**
   * 获取指定用户信息 - 需要认证
   */
  get: async (id: number) => {
    const response = await api.get<User>(`/users/${id}`)
    return response.data
  },

  /**
   * 更新用户信息 - 需要认证
   */
  update: async (id: number, data: UserUpdate) => {
    const response = await api.put<User>(`/users/${id}`, data)
    return response.data
  },

  /**
   * 删除用户 - 需要管理员权限
   */
  delete: async (id: number) => {
    await api.delete(`/users/${id}`)
  },
}

/**
 * 获取用户列表 - 用于项目管理员选择
 * @param params 分页参数
 */
export const apiUsersList = async (params?: { page?: number, size?: number, username?: string, scope?: string }) => {
  const response = await userApi.list(params || {})
  return response
}

// 平台管理员用户信息（从API返回的完整用户信息）
export interface PlatformAdminUser {
  tenantId: string
  accountId: number
  userId: number
  username: string
  nickname: string
  phone: string
  email: string
  status: number
  krb5ConfFileName: string | null
  keytabFileName: string | null
  principal: string | null
  isMain: boolean
  userAttrValueList: any
  tokenQuota: any
  isInfinite: boolean
  roles: Array<{
    id: number
    code: string
    name: string
    description: string
    status: number
    type: number
    securityName: string | null
    securityId: number
  }> | null
  orgs: any
  joinTime: string | null
  is_project_admin: boolean
}

// 平台管理员列表分页响应
export interface PlatformAdminListResponse {
  total: number
  rows: PlatformAdminUser[]
  number: number
  size: number
  totalPages: number
}

// 平台管理员类型定义（保留用于兼容）
export interface PlatformAdmin {
  id: number
  user_id: number
  created_id: number
  created_by: string
  created_at: string
}

// 平台管理员API
export const platformAdminApi = {
  /**
   * 获取平台管理员列表（分页格式）
   */
  list: async (params?: { username?: string, page?: number, size?: number }) => {
    const response = await api.get<PlatformAdminListResponse>('/platform/list', { params })
    return response.data
  },

  /**
   * 批量授权平台管理员
   */
  batchGrant: async (userIds: number[]) => {
    await api.post('/platform/batch-grant', { user_ids: userIds })
  },

  /**
   * 撤销平台管理员（删除）
   */
  revoke: async (userId: number) => {
    await api.post('/platform/revoke', { user_id: userId })
  },

  /**
   * 获取未关联的用户列表（用于添加平台管理员）
   * 支持分页和username查询
   */
  getNotAssociatedUsers: async (
    params?: { page?: number, size?: number, username?: string },
  ): Promise<PageUser> => {
    const response = await api.get<PageUser>(
      '/platform/users/not-associated',
      { params },
    )
    return response.data
  },
}

// 定义会话接口
interface AgentSession {
  session_id: string
  user_id: string | null
  agent_id: string
  created_at: number
  updated_at: number
  memory?: Record<string, unknown> | null
  session_data?: Record<string, unknown> | null
  extra_data?: Record<string, unknown> | null
  agent_data?: Record<string, unknown> | null
}

// 分页响应接口
interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export const sessionApi = {
  // 获取项目会话列表
  list: async (
    projectId: number,
    page = 1,
    pageSize = 10,
  ): Promise<PaginatedResponse<AgentSession>> => {
    const response = await api.get('/agent-sessions/', {
      params: {
        project_id: projectId,
        page,
        page_size: pageSize,
      },
    })
    return response.data
  },

  // 获取单个会话详情
  get: async (sessionId: string): Promise<AgentSession> => {
    const response = await api.get(`/agent-sessions/${sessionId}`)
    return response.data
  },

  // 删除会话
  delete: async (sessionId: string): Promise<void> => {
    await api.delete(`/agent-sessions/${sessionId}`)
  },
}

interface CreateTestRunRequest {
  name: string
  project_id: number
  evaluate_id: number
  metrics: Record<string, unknown>[]
  evaluate_model: Record<string, unknown>
  remark: string
}

// Test Run API
export const testRunApi = {
  // 创建测试运行
  create: async (projectId: number, data: CreateTestRunRequest) => {
    const response = await api.post(`/test_runs/by-project/${projectId}`, data)
    return response.data
  },
  // 获取测试运行列表（分页）
  list: async (
    projectId: number,
    params: { model?: string, page?: number, size?: number },
  ) => {
    const response = await api.get(`/test_runs/by-project/${projectId}/list`, {
      params,
    })
    return response.data
  },
  // 获取测试运行详情
  getById: async (projectId: number, testRunId: number) => {
    const response = await api.get(
      `/test_runs/by-project/${projectId}/test-run/${testRunId}`,
    )
    return response.data
  },
  // 删除测试运行
  delete: async (projectId: number, testRunId: number) => {
    await api.delete(
      `/test_runs/by-project/${projectId}/test-run/${testRunId}`,
    )
  },
  // 启动测试运行
  start: async (projectId: number, testRunId: number) => {
    const response = await api.post(
      `/test_runs/by-project/${projectId}/test-run/${testRunId}/start`,
    )
    return response.data
  },
  // 取消测试运行
  cancel: async (projectId: number, testRunId: number) => {
    const response = await api.post(
      `/test_runs/by-project/${projectId}/test-run/${testRunId}/cancel`,
    )
    return response.data
  },
  // 添加导出Excel功能
  exportTestCasesToXlsx: async (
    testRun: TestRun,
    statusFilter: string = 'all',
  ) => {
    // 迁移到工具函数
    const { exportTestCasesToXlsx } = await import(
      '../utils/exportTestCasesToXlsx'
    )
    return exportTestCasesToXlsx(testRun, statusFilter)
  },
}

// 数据集目录相关类型
export interface DatasetDirectoryCreate {
  name: string
  description?: string | null
}

export interface DatasetDirectoryUpdate {
  name?: string
  description?: string | null
}

// 泛型接口定义，默认为 any 类型
export interface DatasetDirectoryResponse<T = any> {
  // 基础字段保留
  id?: number
  name?: string
  description?: string | null
  project_id?: number
  created_at?: string
  updated_at?: string
  dataset_count?: number

  // 泛型数据字段，用于扩展额外数据
  data?: T
  [key: string]: any
}

export interface Page_DatasetDirectoryResponse_ {
  items: DatasetDirectoryResponse[]
  total: number
  page: number
  size: number
}
// 数据集相关API

export const datasetDirectoryApi = {
  // 分页获取目录列表
  list: async (
    projectId: number,
    params: { page?: number, size?: number } = {},
  ) => {
    const response = await api.get<Page_DatasetDirectoryResponse_>(
      `/dataset_directories/project/${projectId}`,
      { params },
    )
    return response.data
  },

  // 获取单个目录详情
  get: async (projectId: number, directoryId: number) => {
    const response = await api.get<DatasetDirectoryResponse>(
      `/dataset_directories/project/${projectId}/directory/${directoryId}`,
    )
    return response.data
  },

  // 创建目录
  create: async (projectId: number, data: DatasetDirectoryCreate) => {
    const response = await api.post<DatasetDirectoryResponse>(
      `/dataset_directories/project/${projectId}`,
      data,
    )
    return response.data
  },

  // 更新目录
  update: async (
    projectId: number,
    directoryId: number,
    data: DatasetDirectoryUpdate,
  ) => {
    const response = await api.put<DatasetDirectoryResponse>(
      `/dataset_directories/project/${projectId}/directory/${directoryId}`,
      data,
    )
    return response.data
  },

  // 删除目录
  delete: async (
    projectId: number,
    directoryId: number,
    force: boolean = false,
  ) => {
    await api.delete(
      `/dataset_directories/project/${projectId}/directory/${directoryId}`,
      { params: { force } },
    )
  },
}

// 提示词目录相关API
export const promptDirectoryApi = {
  /**
   * 分页获取项目下的所有提示词目录
   */
  list: async (
    projectId: number,
    params: { page?: number, size?: number } = {},
  ) => {
    const response = await api.get<Page_PromptDirectoryResponse_>(
      `/prompt_directories/project/${projectId}`,
      { params },
    )
    return response.data
  },

  /**
   * 创建提示词目录
   */
  create: async (
    projectId: number,
    data: { name: string, description?: string | null },
  ) => {
    const response = await api.post<PromptDirectory>(
      `/prompt_directories/project/${projectId}`,
      data,
    )
    return response.data
  },

  /**
   * 获取目录详情和包含的提示词数量
   */
  get: async (projectId: number, directoryId: number) => {
    const response = await api.get(
      `/prompt_directories/project/${projectId}/directory/${directoryId}`,
    )
    return response.data
  },

  /**
   * 更新提示词目录
   */
  update: async (
    projectId: number,
    directoryId: number,
    data: { name?: string, description?: string | null },
  ) => {
    const response = await api.put<PromptDirectory>(
      `/prompt_directories/project/${projectId}/directory/${directoryId}`,
      data,
    )
    return response.data
  },

  /**
   * 删除提示词目录
   */
  delete: async (
    projectId: number,
    directoryId: number,
    force: boolean = false,
  ) => {
    await api.delete(
      `/prompt_directories/project/${projectId}/directory/${directoryId}`,
      { params: { force } },
    )
  },

  /**
   * 移动提示词到指定目录
   */
  movePrompt: async (
    projectId: number,
    promptId: number,
    directoryId: number | null,
  ) => {
    const response = await api.put(
      `/prompt-directories/project/${projectId}/prompt/${promptId}/move`,
      { directory_id: directoryId },
    )
    return response.data
  },
}

// LLMConfig 分页返回类型，适配 fastapi-pagination
export interface Page_LLMConfigResponse_ {
  items: LLMConfig[]
  total: number
  page: number
  size: number
}
