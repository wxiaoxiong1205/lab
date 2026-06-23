export interface AnnotationDataItem<T> {
  id: number
  row_number: number
  system?: string
  prompt?: string
  ground_truth?: string
  training_method_type?: string
  dataset_format?: string
  instruction?: string
  input?: string
  chosen?: T
  rejected?: T
  chosenRole?: string
  rejectedRole?: string
  messages?: any[]
  is_annotated?: boolean
  status?: string
  audit_result?: string
  audit_reason?: string
  annotation?: {
    [key: string]: T
  }
  _systemMessage?: string
  _userMessages?: string[]
  _assistantMessages?: string[]
  base_url?: string
  _rawMessages?: any[]
  _rawImages?: string[]
}
