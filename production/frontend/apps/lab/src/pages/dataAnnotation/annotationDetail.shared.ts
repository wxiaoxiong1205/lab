export interface AnnotationDataItem<T> {
  id: number
  row_number: number
  system?: string
  prompt?: string
  ground_truth?: string
  data_source?: string
  ability?: string
  reward_model?: {
    style?: string
    ground_truth?: string
  }
  extra_info?: string
  training_method_type?: string
  dataset_format?: string
  instruction?: string
  input?: string
  chosen?: T
  rejected?: T
  chosenRole?: string
  rejectedRole?: string
  rewardModelStyle?: string
  messages?: any[]
  is_annotated?: boolean
  status?: string
  audit_result?: string
  audit_reason?: string
  annotation?: {
    [key: string]: T | Record<string, unknown>
  }
  _systemMessage?: string
  _userMessages?: string[]
  _assistantMessages?: string[]
  base_url?: string
  _rawData?: Record<string, unknown>
  _rawMessages?: any[]
  _rawImages?: string[]
}
