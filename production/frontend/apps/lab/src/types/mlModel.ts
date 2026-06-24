export interface MlModelListParams {
  name?: string | null
  page?: number
  size?: number
  status?: string
}

export interface MlModelSummary {
  id: number
  model_name: string
  version_count: number
  model_type: string
  task_type: string
  source_type: string
  source_ref: string
  network_structure: string
  artifact_uri: string
  notebook_id: number
  project_id: number
  latest_version: string
  earliest_version: string
  created_at: string
  updated_at: string
}

export interface MlModelSummaryPage {
  items: MlModelSummary[]
  total: number
  page: number
  size: number
  pages: number
}

export type MlModelVersionStatus = 'running' | 'completed' | 'pending' | 'created' | 'failed' | string

export interface MlModelVersion {
  notebook_name?: string
  id: number
  name: string
  model_version: string
  description: string
  project_id: number
  model_type: string
  task_type: string
  source_type: string
  notebook_id: number
  source_ref: string
  tokenizer_source_ref?: string
  network_structure: string
  artifact_uri?: string | null
  tokenizer_uri?: string | null
  status: MlModelVersionStatus
  created_id: number
  created_by: string
  created_at: string
  updated_at: string
}

export interface CreateMlModelPayload {
  description: string
  model_type: string
  annotation_type: string
  task_type: string
  name: string
  network_structure: string
  notebook_id?: number
  notebook_instance_name?: string
  source_ref?: string
  tokenizer_source_ref?: string
  source_type: string
  upload_id?: string
  tokenizer_upload_id?: string
}

export interface CreateMlModelVersionPayload {
  description: string
  network_structure: string
  source_type: string
  notebook_id?: number
  notebook_instance_name?: string
  source_ref?: string
  tokenizer_source_ref?: string
  upload_id?: string
  tokenizer_upload_id?: string
}

export interface UpdateMlModelVersionPayload extends CreateMlModelVersionPayload {}

export interface MlModelFormValues {
  name?: string
  description: string
  model_type?: string
  annotation_type?: string
  task_type?: string
  sourceType: string
  notebookId?: number
  sourceRef?: string
  tokenizer_source_ref?: string
  uploadId?: string
  tokenizerUploadId?: string
  networkStructure: string
}

export interface MlTaskTypeOption {
  label: string
  value: string
  disabled?: boolean
}
