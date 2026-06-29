import apiClient from './apiClient'
import { isLocalPreview } from '@/mock/localPreviewData'
import {
  isPreviewLabelTaskId,
  mergePreviewLabelTaskList,
  previewLabelCompletionStatus,
  previewLabelTaskData,
  previewLabelTaskList,
} from '@/mock/previewDataAnnotation'

export type TaskType = 'online' | 'multi_person'
export type SourceType = 'existed_dataset' | 'new_dataset'

export interface GetLabelTasksParams {
  project_id: number
  task_type?: TaskType
  task_name?: string
  dataset_type?: string // 数据集类型：'text-generation' | 'image-understanding'
  biz_type?: string
  page?: number
  size?: number
}

export interface CreateLabelTaskRequest {
  task_type: TaskType
  task_name: string
  dataset_name?: string
  dataset_description: string
  biz_type?: string
  project_id: number
  source: SourceType
  source_dataset_id: number
  override: boolean
}

export interface GetLabelTaskDataParams {
  page: number // 页码，从1开始
  size: number // 每页数量，固定为1
  is_annotated?: boolean // 标注状态过滤：true=已完成，false=未标注，不传=全部
  audit_status?: 'unaudited' | 'passed' | 'failed'
  biz_type?: string
}

export interface SaveAnnotationRequest {
  task_id: number // 任务ID，> 0
  row_number: number // 行号（从1开始，对应页码），>= 1
  annotation?: unknown // 标注内容（JSON格式）
  is_final?: boolean // 是否最终提交（false=暂存，true=最终提交），默认false
  biz_type?: string
}

/** 多人标注保存请求（无 is_final 字段） */
export interface SaveMultiLabelAnnotationRequest {
  task_id: number
  row_number: number
  annotation?: object
  biz_type?: string
}

export interface SaveAutoModelConfigRequest {
  task_id: number // 任务ID，> 0
  model_id: number // 关联模型ID，> 0
  param_config_json?: object // 参数配置JSON（可选）
}

export interface GetAutoModelConfigParams {
  task_id: number // 任务ID，必需
}

export interface GetCompletionStatusParams {
  task_id: number // 任务ID，必需
  biz_type?: string
}

export interface PredictAnnotationRequest {
  project_id: number
  ml_inference_task_id: number
  predict_base_url?: string
  tasks: Array<{
    id: string | number
    data: { image: string } | { text: string }
  }>
  project: string
  label_config: string
}

export interface LabelTaskLabelItem {
  id?: number | string
  label_id?: number | string
  class_id?: number
  tag_name?: string
  name?: string
  label?: string
  label_name?: string
  display_name?: string
}

export interface CreateLabelTaskLabelRequest {
  tag_name: string
}

export interface GetMultiLabelAnnotationTasksParams {
  project_id: number
  biz_type?: string
  task_name?: string
  page?: number
  size?: number
}

export interface MultiLabelAdminAccessResponse {
  can_access: boolean
}

export type MultiLabelMemberRole = 'annotator' | 'auditor'

export interface ReplaceMultiLabelTaskMemberRequest {
  role: MultiLabelMemberRole
  from_user_id: number
  to_user_id: number
}

/** 任务数据概览单条项（overview-data 接口返回） */
export interface OverviewDataItem {
  item_id: string
  row_number: number
  raw_data: Record<string, unknown>
  training_method_type?: string
  dataset_format?: string
  is_annotated: boolean
  annotator_id?: number
  annotator_name?: string
  annotation: Record<string, unknown> | null
  is_audited?: boolean
  auditor_id?: number
  auditor_name?: string
  audit_result: string | null
  audit_reason: string | null
  status?: string
  is_editable?: boolean
}

export interface GetOverviewDataParams {
  project_id: number
  task_id: number
  biz_type?: string
  page?: number
  size?: number
  /** 审核状态筛选：unaudited=未审核，passed=通过，failed=不通过，不传=全部 */
  audit_status?: 'unaudited' | 'passed' | 'failed'
}

export interface OverviewDataResponse {
  items: OverviewDataItem[]
  total: number
  page: number
  size: number
  total_pages: number
  /** 图像/文件下载基础路径，用于 messages 中图片展示 */
  base_url?: string
  dataset_format?: string
  training_method_type?: string
  ml_task_template_type?: string
  ml_task_annotation_type?: string
}

/** 多人标注任务：标注/审核成员分配项 */
export interface MultiLabelAssignItem {
  user_id: number
  assign_count: number
  deadline: string | null // ISO 8601，未设置时传 null
}

export interface CreateMultiLabelTaskRequest {
  task_name: string
  description: string
  biz_type?: string
  source: SourceType
  source_dataset_id: number
  dataset_type: string
  dataset_format: string
  override: boolean
  annotators: MultiLabelAssignItem[]
  auditors: MultiLabelAssignItem[]
  audit_sampling_ratio: number
}

/** 任务详情接口 - 标注成员 */
export interface MultiLabelTaskAnnotator {
  user_id: number
  user_name: string
  assign_count: number
  saved_count: number
  final_count: number
  deadline: string | null
}

/** 任务详情接口 - 审核成员 */
export interface MultiLabelTaskAuditor {
  user_id: number
  user_name: string
  assigned_count: number
  reviewed_passed_count: number
  reviewed_failed_count: number
  deadline: string | null
}

/** 任务详情接口 - GET /multi-label/project/{project_id}/tasks/{task_id} */
export interface MultiLabelTaskDetail {
  id: number
  created_at?: string
  updated_at?: string
  created_id?: number
  created_by?: string
  tenant_id?: string
  task_type?: string
  task_name?: string
  status?: string
  total_samples?: number
  assigned_count?: number
  saved_count?: number
  source_dataset_name?: string
  submit_dataset_name?: string
  description?: string
  dataset?: Record<string, unknown>
  progress?: Record<string, unknown>
  annotate_deadline?: string
  audit_deadline?: string
  audit_sampling_ratio?: number
  annotators?: MultiLabelTaskAnnotator[]
  auditors?: MultiLabelTaskAuditor[]
}

export const labelTaskService = {
  /**
   * 获取项目下的标注任务列表（在线标注等）
   * @param params 查询参数，包含project_id, task_type, page, size
   * @returns 标注任务列表响应
   */
  getList: async (params: GetLabelTasksParams) => {
    const { project_id, ...restParams } = params
    try {
      const response = await apiClient.get(`/label/${project_id}/tasks`, { params: restParams })
      return isLocalPreview
        ? mergePreviewLabelTaskList(response.data, params)
        : response.data
    }
    catch (error) {
      if (isLocalPreview) {
        console.warn('本地预览：标注任务列表获取失败，使用演示数据兜底。', error)
        return previewLabelTaskList(params)
      }
      throw error
    }
  },

  /**
   * 获取多人标注任务列表（标注任务 Tab 专用）
   * 接口：GET /multi-label/project/{project_id}/tasks/annotation
   */
  getMultiLabelAnnotationTaskList: async (params: GetMultiLabelAnnotationTasksParams) => {
    const { project_id, ...restParams } = params
    const response = await apiClient.get(`/multi-label/project/${project_id}/tasks/annotation`, { params: restParams })
    return response.data
  },

  /**
   * 获取审核任务列表
   * 接口：GET /multi-label/project/{project_id}/tasks/audit-list
   */
  getMultiLabelAuditTaskList: async (params: GetMultiLabelAnnotationTasksParams) => {
    const { project_id, ...restParams } = params
    const response = await apiClient.get(`/multi-label/project/${project_id}/tasks/audit-list`, { params: restParams })
    return response.data
  },

  /**
   * 获取任务总览列表
   * 接口：GET /multi-label/project/{project_id}/tasks/overview
   */
  getMultiLabelTaskOverview: async (params: GetMultiLabelAnnotationTasksParams) => {
    const { project_id, ...restParams } = params
    const response = await apiClient.get(`/multi-label/project/${project_id}/tasks/overview`, { params: restParams })
    return response.data
  },

  /**
   * 查询当前用户是否可访问多人标注任务总览
   * 接口：GET /multi-label/project/{project_id}/admin-access
   */
  getMultiLabelAdminAccess: async (
    projectId: number,
    biz_type?: string,
  ): Promise<MultiLabelAdminAccessResponse> => {
    const response = await apiClient.get(`/multi-label/project/${projectId}/admin-access`, {
      params: biz_type ? { biz_type } : undefined,
    })
    return response.data
  },

  /**
   * 替换多人标注任务成员
   * 接口：POST /multi-label/project/{project_id}/tasks/{task_id}/members/replace
   */
  replaceMultiLabelTaskMember: async (
    projectId: number,
    taskId: number,
    data: ReplaceMultiLabelTaskMemberRequest,
    biz_type?: string,
  ) => {
    const response = await apiClient.post(
      `/multi-label/project/${projectId}/tasks/${taskId}/members/replace`,
      data,
      {
        params: biz_type ? { biz_type } : undefined,
      },
    )
    return response.data
  },

  /**
   * 获取多人标注任务详情（含标注/审核成员）
   * 接口：GET /multi-label/project/{project_id}/tasks/{task_id}
   */
  getMultiLabelTaskDetail: async (
    projectId: number,
    taskId: number,
    biz_type?: string,
  ): Promise<MultiLabelTaskDetail> => {
    const response = await apiClient.get(
      `/multi-label/project/${projectId}/tasks/${taskId}`,
      {
        params: biz_type ? { biz_type } : undefined,
      },
    )
    return response.data
  },

  /**
   * 删除多人标注任务
   * 接口：DELETE /multi-label/project/{project_id}/tasks/{task_id}
   */
  deleteMultiLabelTask: async (projectId: number, taskId: number, biz_type?: string) => {
    await apiClient.delete(`/multi-label/project/${projectId}/tasks/${taskId}`, {
      params: biz_type ? { biz_type } : undefined,
    })
  },

  /**
   * 获取任务数据概览（数据列表页）
   * 接口：GET /multi-label/project/{project_id}/tasks/{task_id}/overview-data
   * @param params 包含 project_id, task_id, page?, size?, audit_status?
   */
  /**
   * 发布多人标注任务的数据集
   * 接口：POST /multi-label/project/{project_id}/tasks/{task_id}/publish
   */
  publishMultiLabelTask: async (projectId: number, taskId: number, biz_type?: string) => {
    const response = await apiClient.post(
      `/multi-label/project/${projectId}/tasks/${taskId}/publish`,
      undefined,
      {
        params: biz_type ? { biz_type } : undefined,
      },
    )
    return response.data
  },

  /**
   * 获取任务数据总览（数据列表页）
   * 接口：GET /multi-label/project/{project_id}/tasks/{task_id}/overview-data
   */
  getOverviewData: async (params: GetOverviewDataParams): Promise<OverviewDataResponse> => {
    const { project_id, task_id, ...restParams } = params
    const response = await apiClient.get(
      `/multi-label/project/${project_id}/tasks/${task_id}/overview-data`,
      { params: restParams },
    )
    return response.data
  },

  /**
   * 创建标注任务（在线标注）
   */
  create: async (data: CreateLabelTaskRequest) => {
    const { project_id, ...restData } = data
    const response = await apiClient.post(`/label/${project_id}/tasks`, restData)
    return response.data
  },

  /**
   * 创建多人标注任务
   * POST /multi-label/project/{project_id}/tasks
   */
  createMultiLabelTask: async (projectId: number, data: CreateMultiLabelTaskRequest) => {
    const response = await apiClient.post(`/multi-label/project/${projectId}/tasks`, data)
    return response.data
  },

  /**
   * 获取标注任务中的单条数据
   * @param taskId 任务ID
   * @param params 查询参数，包含page（页码，从1开始）和size（每页数量，固定为1）
   * @returns 单条数据响应
   */
  getData: async (taskId: number, params: GetLabelTaskDataParams) => {
    if (isLocalPreview && isPreviewLabelTaskId(taskId)) {
      return previewLabelTaskData(taskId, params)
    }
    const response = await apiClient.get(`/label/tasks/${taskId}`, { params })
    return response.data
  },

  /**
   * 获取在线标注任务标签列表
   * 接口：GET /label/tasks/{task_id}/labels
   */
  getLabels: async (
    taskId: number,
    biz_type?: string,
  ): Promise<LabelTaskLabelItem[] | { items?: LabelTaskLabelItem[], labels?: LabelTaskLabelItem[] }> => {
    const response = await apiClient.get(`/label/tasks/${taskId}/labels`, {
      params: biz_type ? { biz_type } : undefined,
    })
    return response.data
  },

  /**
   * 获取多人标注任务数据（单条分页）
   * 接口：GET /multi-label/project/{project_id}/tasks/{task_id}/data
   */
  getMultiLabelTaskData: async (
    projectId: number,
    taskId: number,
    params: GetLabelTaskDataParams,
  ) => {
    const response = await apiClient.get(
      `/multi-label/project/${projectId}/tasks/${taskId}/data`,
      { params },
    )
    return response.data
  },

  /**
   * 获取审核任务数据列表（审核员详情页用）
   * 接口：GET /multi-label/project/{project_id}/tasks/{task_id}/audit
   */
  getAuditData: async (
    projectId: number,
    taskId: number,
    params: GetLabelTaskDataParams,
  ) => {
    const response = await apiClient.get(
      `/multi-label/project/${projectId}/tasks/${taskId}/audit`,
      { params },
    )
    return response.data
  },

  /**
   * 暂存审核结果（单条：审核通过/审核不通过）
   * 接口：POST /multi-label/project/{project_id}/audits/save
   * audit_result 为 failed 时 audit_reason 必填
   */
  saveAudit: async (
    projectId: number,
    data: { task_id: number, row_number: number, audit_result: 'passed' | 'failed', reason?: string, biz_type?: string },
  ) => {
    const { biz_type, ...payload } = data
    const response = await apiClient.post(
      `/multi-label/project/${projectId}/audits/save`,
      payload,
      {
        params: biz_type ? { biz_type } : undefined,
      },
    )
    return response.data
  },

  /**
   * 提交审核（全部提交，类似提交标注）
   * 接口：POST /multi-label/project/{project_id}/tasks/{task_id}/audit/submit
   */
  submitAuditTask: async (projectId: number, taskId: number, biz_type?: string) => {
    const response = await apiClient.post(
      `/multi-label/project/${projectId}/tasks/${taskId}/audit/submit`,
      undefined,
      {
        params: biz_type ? { biz_type } : undefined,
      },
    )
    return response.data
  },

  /**
   * 审核任务完成状态（审核员详情页轮询）
   * 接口：GET /multi-label/project/{project_id}/tasks/{task_id}/audit-completion-status
   */
  getAuditCompletionStatus: async (projectId: number, taskId: number, biz_type?: string) => {
    const response = await apiClient.get(
      `/multi-label/project/${projectId}/tasks/${taskId}/audit-completion-status`,
      {
        params: biz_type ? { biz_type } : undefined,
      },
    )
    return response.data
  },

  /**
   * 删除标注任务（仅限未完成的任务）
   * @param taskId 任务ID
   * @returns 删除结果响应
   */
  delete: async (taskId: number, biz_type?: string) => {
    const response = await apiClient.delete(`/label/tasks/${taskId}`, {
      params: biz_type ? { biz_type } : undefined,
    })
    return response.data
  },
  /**
   * 保存标注（暂存/最终提交）- 在线标注
   * @param data 保存标注的请求数据
   * @returns 保存结果响应
   */
  save: async (data: SaveAnnotationRequest) => {
    if (isLocalPreview && isPreviewLabelTaskId(data.task_id)) {
      return { success: true, message: '演示数据已暂存' }
    }
    const response = await apiClient.post(`/label/annotations/save`, data)
    return response.data
  },

  /**
   * 多人标注保存（完成标注）
   * 接口：POST /multi-label/project/{project_id}/annotations/save
   * @param projectId 项目ID
   * @param data 请求体：task_id, row_number, annotation（无 is_final）
   */
  saveMultiLabelAnnotation: async (
    projectId: number,
    data: SaveMultiLabelAnnotationRequest & { biz_type?: string },
  ) => {
    const { biz_type, ...payload } = data
    const response = await apiClient.post(
      `/multi-label/project/${projectId}/annotations/save`,
      payload,
      {
        params: biz_type ? { biz_type } : undefined,
      },
    )
    return response.data
  },

  /**
   * 多人标注提交全部（提交标注）
   * 接口：POST /multi-label/project/{project_id}/annotations/submit-all
   * @param projectId 项目ID
   * @param task_id 任务ID
   */
  submitAllMultiLabelAnnotation: async (projectId: number, task_id: number, biz_type?: string) => {
    const response = await apiClient.post(
      `/multi-label/project/${projectId}/annotations/submit-all`,
      { task_id },
      {
        params: biz_type ? { biz_type } : undefined,
      },
    )
    return response.data
  },

  /**
   * 保存自动标注配置（创建或更新）
   * @param data 保存自动标注配置的请求数据
   * @returns 保存结果响应
   */
  saveModelConfig: async (data: SaveAutoModelConfigRequest) => {
    const response = await apiClient.post(`/label/auto-models-config`, data)
    return response.data
  },

  /**
   * 获取项目的自动标注配置
   * @param params 查询参数，包含task_id
   * @returns 自动标注配置响应
   */
  getModelConfig: async (params: GetAutoModelConfigParams) => {
    const response = await apiClient.get(`/label/auto-models-config`, { params })
    return response.data
  },

  /**
   * 查询标注任务完成状态（在线标注）
   * @param task_id 任务ID
   * @returns 标注任务完成状态响应
   */
  getCompletionStatus: async (task_id: number, biz_type?: string) => {
    if (isLocalPreview && isPreviewLabelTaskId(task_id)) {
      return previewLabelCompletionStatus(task_id)
    }
    const response = await apiClient.get(`/label/tasks/${task_id}/completion-status`, {
      params: biz_type ? { biz_type } : undefined,
    })
    return response.data
  },

  /**
   * AI 自动标注预测
   * 接口：POST /ml_backend/proxy/{project_id}/{ml_inference_task_id}/predict
   */
  predict: async (data: PredictAnnotationRequest) => {
    const { predict_base_url, ...payload } = data
    const response = await apiClient.post(
      predict_base_url,
      payload,
    )
    return response.data
  },

  predictOnlineAnnotationService: async (data: PredictAnnotationRequest) => {
    const response = await apiClient.post(
      `/online_annotation_service/project/${data.project_id}/annotations/ai`,
      data,
    )
    return response.data
  },

  /**
   * 查询多人标注任务完成状态
   * 接口：GET /multi-label/project/{project_id}/tasks/{task_id}/completion-status
   * @param projectId 项目ID
   * @param task_id 任务ID
   */
  getMultiLabelCompletionStatus: async (projectId: number, task_id: number, biz_type?: string) => {
    const response = await apiClient.get(
      `/multi-label/project/${projectId}/tasks/${task_id}/completion-status`,
      {
        params: biz_type ? { biz_type } : undefined,
      },
    )
    return response.data
  },

  /**
   * 新增在线标注任务标签
   * 接口：POST /label/tasks/{task_id}/labels
   */
  createLabel: async (taskId: number, data: CreateLabelTaskLabelRequest, biz_type?: string) => {
    const response = await apiClient.post(`/label/tasks/${taskId}/labels`, data, {
      params: biz_type ? { biz_type } : undefined,
    })
    return response.data
  },

  /**
   * 更新在线标注任务标签
   * 接口：PUT /label/tasks/{task_id}/labels/{class_id}
   */
  updateLabel: async (
    taskId: number,
    classId: number,
    data: CreateLabelTaskLabelRequest,
    biz_type?: string,
  ) => {
    const response = await apiClient.put(`/label/tasks/${taskId}/labels/${classId}`, data, {
      params: biz_type ? { biz_type } : undefined,
    })
    return response.data
  },

  /**
   * 删除在线标注任务标签
   * 接口：DELETE /label/tasks/{task_id}/labels/{class_id}
   */
  deleteLabel: async (taskId: number, classId: number, biz_type?: string) => {
    const response = await apiClient.delete(`/label/tasks/${taskId}/labels/${classId}`, {
      params: biz_type ? { biz_type } : undefined,
    })
    return response.data
  },
}
