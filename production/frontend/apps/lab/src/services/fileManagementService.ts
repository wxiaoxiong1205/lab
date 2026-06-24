import apiClient from './apiClient'

// 类型定义
export interface FileFolder {
  id: number
  name: string
  description: string | null
  project_id: number
  created_at: string
  updated_at: string
  created_by: string | null
  file_count: number
}

export interface FileManagementFile {
  id: number
  file_name: string
  file_size: number
  file_hash: string
  file_path: string
  folder_id: number | null
  folder_name: string | null
  project_id: number
  upload_id: string | null
  created_at: string
  created_by: string | null
}

export interface PageResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
  pages: number
}

export interface ApiResponse<T> {
  code: number
  message: string
  result: T
}

// 文件夹相关接口
export interface CreateFolderParams {
  name: string
  description?: string
  project_id: number
}

export interface UpdateFolderParams {
  name?: string
  description?: string
}

export interface GetFoldersParams {
  project_id: number
  name?: string
  page?: number
  size?: number
}

// 文件相关接口
export interface GetFilesParams {
  project_id: number
  folder_id?: number
  name?: string
  suffix?: string
  page?: number
  size?: number
}

export interface AddFileParams {
  upload_id: string
  project_id: number
  folder_id?: number
}

export const fileManagementService = {
  // ========== 文件夹管理 ==========

  /**
   * 创建文件夹
   */
  createFolder: async (params: CreateFolderParams) => {
    const response = await apiClient.post(
      '/file-management/folders',
      params,
    )
    return response.data
  },

  /**
   * 查询文件夹列表
   */
  getFolders: async (params: GetFoldersParams) => {
    const response = await apiClient.get(
      '/file-management/folders',
      { params },
    )
    return response.data
  },

  /**
   * 查询文件夹详情
   */
  getFolderDetail: async (folderId: number) => {
    const response = await apiClient.get(
      `/file-management/folders/${folderId}`,
    )
    return response.data
  },

  /**
   * 更新文件夹
   */
  updateFolder: async (folderId: number, params: UpdateFolderParams) => {
    const response = await apiClient.put(
      `/file-management/folders/${folderId}`,
      params,
    )
    return response.data
  },

  /**
   * 删除文件夹（支持批量）
   */
  deleteFolders: async (folderIds: number[]) => {
    const response = await apiClient.delete(
      '/file-management/folders',
      {
        params: {
          folder_ids: folderIds.join(','),
        },
      },
    )
    return response
  },

  // ========== 文件管理 ==========

  /**
   * 查询文件列表
   */
  getFiles: async (params: GetFilesParams) => {
    const response = await apiClient.get(
      '/file-management/files',
      { params },
    )
    return response.data
  },

  /**
   * 查询文件详情
   */
  getFileDetail: async (fileId: number) => {
    const response = await apiClient.get(
      `/file-management/files/${fileId}`,
    )
    return response.data
  },

  /**
   * 下载文件（支持单个/批量）
   */
  downloadFiles: async (fileIds: number[] | number) => {
    const params = Array.isArray(fileIds)
      ? { file_ids: fileIds.join(',') }
      : { file_id: fileIds }

    const response = await apiClient.get('/file-management/files/download', {
      params,
      responseType: 'blob',
    })
    return response
  },

  /**
   * 删除文件（支持批量）
   */
  deleteFiles: async (fileIds: number[]) => {
    const response = await apiClient.delete(
      '/file-management/files',
      {
        params: {
          file_ids: fileIds.join(','),
        },
      },
    )
    return response
  },

  /**
   * 根据 upload_id 保存文件信息
   */
  addFile: async (params: AddFileParams) => {
    const response = await apiClient.post(
      '/file-management/files/add',
      null,
      { params },
    )
    return response.data
  },
}
