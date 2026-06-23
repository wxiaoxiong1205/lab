import type {
  CaseCloneRequest,
  CaseCloneResponse,
  CaseSearchParams,
  CreateNotebookRequest,
  FileStructureResponse,
  GPUNode,
  GetFileStructureParams,
  NotebookCase,
  NotebookCaseCategory,
  NotebookCaseDetail,
  NotebookCaseEditRequest,
  NotebookInstance,
  NotebookLog,
  NotebookMetrics,
  NotebookOperation,
  NotebookSearchParams,
  NotebookSquareListResponse,
  NotebookSquareSearchParams,
  NotebookTemplate,
  PermissionResponse,
  PortItems,
  PublishCaseParams,
  PublishCaseResponse,
  StorageClass,
  UpdateNotebookRequest,
  notebookSshResponse,
} from '../types'
import { mockNotebookService } from '../mock/mockNotebookService'
import apiClient from './apiClient'

export const notebookService = {
  // 获取Notebook模板列表
  getNotebookTemplates: async (): Promise<NotebookTemplate[]> => {
    try {
      return await mockNotebookService.getNotebookTemplates()
    }
    catch (error) {
      console.error('Failed to fetch notebook templates:', error)
      throw error
    }
  },

  // 获取Notebook实例列表
  getNotebookInstances: async (params: NotebookSearchParams = {}, projectId: number): Promise<{
    data: {
      items: NotebookInstance[]
      page: number
      size: number
      total: number
    }
  }> => {
    try {
      // 构建查询参数
      const queryParams = new URLSearchParams()

      if (params.biz_type) {
        queryParams.append('biz_type', params.biz_type)
      }
      if (params.view_mode) {
        queryParams.append('view_mode', params.view_mode)
      }
      if (params.is_ml_debug) {
        queryParams.append('is_ml_debug', params.is_ml_debug.toString())
      }
      if (params.instance_name) {
        queryParams.append('instance_name', params.instance_name)
      }
      if (params.status?.length) {
        params.status.forEach((status) => queryParams.append('status', status))
      }
      if (params.is_public?.length) {
        params.is_public.forEach((isPublic) => queryParams.append('is_public', isPublic))
      }
      if (params.created_id?.length) {
        params.created_id.forEach((createdId) => queryParams.append('created_id', createdId))
      }
      if (params.page !== undefined) {
        queryParams.append('page', params.page.toString())
      }
      if (params.size !== undefined) {
        queryParams.append('size', params.size.toString())
      }
      if (params.template_id) {
        queryParams.append('template_id', params.template_id)
      }
      if (params.sort_by) {
        queryParams.append('sort_by', params.sort_by)
      }
      if (params.sort_order) {
        queryParams.append('sort_order', params.sort_order)
      }

      const queryString = queryParams.toString()
      const url = `/notebooks/${projectId}/list${queryString ? `?${queryString}` : ''}`

      return await apiClient.get(url)
    }
    catch (error) {
      console.error('Failed to fetch notebook instances:', error)
      throw error
    }
  },

  // 获取单个Notebook实例
  getNotebookInstance: async (notebookId: string, projectId: number): Promise<NotebookInstance> => {
    try {
      const response = await apiClient.get(`/notebooks/${projectId}/${notebookId}`)
      return response.data
    }
    catch (error) {
      console.error(`Failed to fetch notebook instance ${notebookId}:`, error)
      throw error
    }
  },

  /**
   * 列出 Notebook 工作区文件/目录。第一层传 path=`/`；后续层级传入当前目录的完整 path（以 / 开头）。
   * 接口返回形如 { path, files: [{ name, path, type, size }] }，列表取 `files`。
   */
  listNotebookWorkspaceFiles: async (
    projectId: number,
    notebookId: string | number,
    listPath?: string,
  ): Promise<Array<{ path: string, name: string, isDirectory: boolean }>> => {
    try {
      const params = listPath != null && listPath !== '' ? { path: listPath } : undefined
      const response = await apiClient.get(`/notebooks/${projectId}/${notebookId}/files`, { params })
      const payload = response.data ?? {}
      const rawList = (payload as { files?: unknown[], items?: unknown[] }).files
        ?? (payload as { items?: unknown[] }).items
        ?? []

      return (rawList as Record<string, unknown>[]).map((item) => {
        const name = String(
          item.name ?? item.filename ?? '',
        )
        const path = String(item.path ?? item.file_path ?? name)
        const type = String(item.type ?? item.file_type ?? '')
        const isDirectory = Boolean(
          item.is_dir
          ?? item.is_directory
          ?? (type != null && type === 'directory')
          ?? type === 'dir',
        )
        return { path, name, isDirectory }
      })
    }
    catch (error) {
      console.error(`Failed to fetch notebook files for ${projectId}/${notebookId}:`, error)
      throw error
    }
  },

  // 创建Notebook实例
  createNotebookInstance: async (data: CreateNotebookRequest, projectId: number): Promise<NotebookInstance> => {
    try {
      const response = await apiClient.post(`/notebooks/${projectId}/create`, data)
      return response.data
    }
    catch (error) {
      console.error('Failed to create notebook instance:', error)
      throw error
    }
  },

  // 更新Notebook实例
  updateNotebookInstance: async (notebookId: string | number, projectId: number, data: UpdateNotebookRequest): Promise<NotebookInstance> => {
    try {
      const response = await apiClient.put(`/notebooks/${projectId}/${notebookId}`, data)
      return response.data
    }
    catch (error) {
      console.error(`Failed to update notebook instance ${notebookId}:`, error)
      throw error
    }
  },

  // 启动Notebook实例
  startNotebookInstance: async (notebookId: string | number, projectId: number): Promise<NotebookOperation> => {
    try {
      const response = await apiClient.post(`/notebooks/${projectId}/${notebookId}/start_or_deploy`)
      return response.data
    }
    catch (error) {
      console.error(`Failed to start notebook instance ${notebookId}:`, error)
      throw error
    }
  },

  // 停止Notebook实例
  stopNotebookInstance: async (notebookId: number, projectId: number): Promise<NotebookOperation> => {
    try {
      const response = await apiClient.post(`/notebooks/${projectId}/${notebookId}/stop`)
      return response.data
    }
    catch (error) {
      console.error(`Failed to stop notebook instance ${notebookId}:`, error)
      throw error
    }
  },

  // 删除Notebook实例
  deleteNotebookInstance: async (notebookId: string | number, projectId: number): Promise<NotebookOperation> => {
    try {
      const response = await apiClient.delete(`/notebooks/${projectId}/${notebookId}`)
      return response.data
    }
    catch (error) {
      console.error(`Failed to delete notebook instance ${notebookId}:`, error)
      throw error
    }
  },

  // 获取GPU节点信息
  getGPUNodes: async (): Promise<GPUNode[]> => {
    try {
      return await mockNotebookService.getGPUNodes()
    }
    catch (error) {
      console.error('Failed to fetch GPU nodes:', error)
      throw error
    }
  },

  // 获取存储类信息
  getStorageClasses: async (): Promise<StorageClass[]> => {
    try {
      return await mockNotebookService.getStorageClasses()
    }
    catch (error) {
      console.error('Failed to fetch storage classes:', error)
      throw error
    }
  },

  // 获取Notebook监控数据
  getNotebookMetrics: async (id: string, hours: number = 24): Promise<NotebookMetrics[]> => {
    try {
      return await mockNotebookService.getNotebookMetrics(id, hours)
    }
    catch (error) {
      console.error(`Failed to fetch notebook metrics for ${id}:`, error)
      throw error
    }
  },

  // 获取Notebook日志
  getNotebookLogs: async (id: string, limit: number = 100): Promise<NotebookLog[]> => {
    try {
      return await mockNotebookService.getNotebookLogs(id, limit)
    }
    catch (error) {
      console.error(`Failed to fetch notebook logs for ${id}:`, error)
      throw error
    }
  },

  // 获取案例分类列表
  getCaseCategories: async (): Promise<NotebookCaseCategory[]> => {
    try {
      return await mockNotebookService.getCaseCategories()
    }
    catch (error) {
      console.error('Failed to fetch case categories:', error)
      throw error
    }
  },

  // 获取精选案例列表
  getNotebookCases: async (params: CaseSearchParams = {}): Promise<{
    items: NotebookCase[]
    total: number
  }> => {
    try {
      return await mockNotebookService.getNotebookCases(params)
    }
    catch (error) {
      console.error('Failed to fetch notebook cases:', error)
      throw error
    }
  },

  // 获取案例详情
  getCaseDetail: async (caseId: string): Promise<NotebookCaseDetail> => {
    try {
      return await mockNotebookService.getCaseDetail(caseId)
    }
    catch (error) {
      console.error(`Failed to fetch case detail for ${caseId}:`, error)
      throw error
    }
  },

  // 复制案例创建notebook实例
  cloneCase: async (request: CaseCloneRequest): Promise<CaseCloneResponse> => {
    try {
      return await mockNotebookService.cloneCase(request)
    }
    catch (error) {
      console.error('Failed to clone case:', error)
      throw error
    }
  },

  // 获取案例文件内容
  getCaseFileContent: async (caseId: string, filePath: string): Promise<{ content: any }> => {
    try {
      return await mockNotebookService.getCaseFileContent(caseId, filePath)
    }
    catch (error) {
      console.error(`Failed to fetch case file content for ${caseId}/${filePath}:`, error)
      throw error
    }
  },

  // 获取notebook广场列表
  getNotebookSquareList: async (params: NotebookSquareSearchParams): Promise<NotebookSquareListResponse> => {
    try {
      const response = await apiClient.get(
        `notebooks/examples/notebook/list`,
        { params },
      )
      return response.data
    }
    catch (error) {
      console.error('Failed to fetch notebook square list:', error)
      throw error
    }
  },

  // 发布为案例
  publishCase: async (projectId: string, notebookId: string, data: PublishCaseParams): Promise<PublishCaseResponse> => {
    try {
      const response = await apiClient.post(
        `notebooks/examples/${projectId}/${notebookId}/publish`,
        data,
      )
      return response.data
    }
    catch (error) {
      console.error('Failed to publish case:', error)
      throw error
    }
  },

  // 删除案例
  deleteCase: async (id: string): Promise<any> => {
    try {
      const response = await apiClient.delete(`/notebooks/examples/notebook/${id}`)
      return response.data
    }
    catch (error) {
      console.error('Failed to delete case:', error)
      throw error
    }
  },

  // 上传图片
  uploadImage: async (file: File): Promise<{ image_url: string }> => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await apiClient.post(
      `/notebooks/examples/notebook/upload-image`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )

    return response.data
  },

  // 文件
  getFileStructure: async (params: GetFileStructureParams): Promise<FileStructureResponse> => {
    const response = await apiClient.get(
      `/notebooks/${params.projectId}/${params.notebookId}/files`,
      { params: { path: params.path } },
    )
    return response.data
  },

  // 新增开放端口 只需传入PortItems中的protocol、container_port、description
  addPort: async (projectId: string, notebookId: string, data: PortItems) => {
    try {
      const response = await apiClient.post(`/notebooks/${projectId}/${notebookId}/ports`, data)
      return response.data
    }
    catch (error) {
      console.error('Failed to add port:', error)
      throw error
    }
  },
  // 删除开放端口
  deletePort: async (projectId: string, notebookId: string, portId: string) => {
    try {
      const response = await apiClient.delete(`/notebooks/${projectId}/${notebookId}/ports/${portId}`)
      return response.data
    }
    catch (error) {
      console.error('Failed to delete port:', error)
      throw error
    }
  },
  // 编辑开放端口 只需传入PortItems中的protocol、container_port、description
  editPort: async (projectId: string, notebookId: string, portId: string, data: PortItems) => {
    try {
      const response = await apiClient.put(`/notebooks/${projectId}/${notebookId}/ports/${portId}`, data)
      return response.data
    }
    catch (error) {
      console.error('Failed to edit port:', error)
      throw error
    }
  },

  // 编辑案例 id为案例id
  editCase: async (Id: number, data: NotebookCaseEditRequest) => {
    try {
      const response = await apiClient.put(`/notebooks/examples/notebook/${Id}`, data)
      return response.data
    }
    catch (error) {
      console.error('Failed to edit case:', error)
      throw error
    }
  },

  // 判断是否用户是否有权限 对该案例进行编辑
  hasPermissionToEditCase: async (caseId: string) => {
    try {
      const response = await apiClient.get<PermissionResponse>(`/notebooks/examples/notebook/${caseId}/permission`)
      return response.data
    }
    catch (error) {
      console.error('没有权限对该案例进行编辑:', error)
      throw error
    }
  },

  // 获取notebook的ssh配置
  getNotebookSshSetting: async (project_id: number, notebook_id: number) => {
    try {
      const response = await apiClient.get<notebookSshResponse>(`/notebooks/${project_id}/${notebook_id}/ssh-config`)
      return response.data
    }
    catch (error) {
      console.error('获取该ssh配置失败')
      throw error
    }
  },

  // 设置notebook的ssh配置
  setNotebookSsh: async ({
    project_id,
    notebook_id,
    is_ssh,
    ssh_username,
    ssh_password,
  }: {
    project_id: number
    notebook_id: number
    is_ssh: boolean
    ssh_username: string
    ssh_password?: string
  }) => {
    try {
      const data = {
        is_ssh,
        ssh_username,
        ...(ssh_password ? { ssh_password } : {}),
      }
      const response = await apiClient.put<notebookSshResponse>(`/notebooks/${project_id}/${notebook_id}/ssh-config`, data)
      return response.data
    }
    catch (error) {
      console.error('ssh配置失败')
      throw error
    }
  },

  // 生成notebook的ssh
  getNotebookSsh: async (project_id: number, notebook_id: number) => {
    try {
      const response = await apiClient.get<string>(`/notebooks/${project_id}/${notebook_id}/ssh-config-keys`)
      return response.data
    }
    catch (error) {
      console.error('获取该ssh配置失败')
      throw error
    }
  },
}
