export interface CreateMachineAnnotation {
  id?: number // 可选，更新时需要 服务id
  name: string
  description?: string
  base_url: string
  category: string
  data_type: string
  annotation_type: string
  template_type: string
  status?: string // 创建
}

export interface ListMachineAnnotationResponse {
  items: MachineAnnotationItem[]
  page: number
  size: number
  pages: number
  total: number
}

export interface MachineAnnotationItem {
  id: number
  name: string
  description: string
  base_url: string
  category: string
  data_type: string
  annotation_type: string
  template_type: string
  status: string
  created_by: string
  created_at: string
  service_type?: string
  model_service_id?: number
  model_service_name?: string
}

export interface ForwardRequestParams {
  project: number
  predict_base_url: string
  tasks: TaskItem[]
  label_config: string
}

export interface TaskItem {
}
