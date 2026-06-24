import type { ModelVersionListResponse } from '@/types/model'

export interface TrainedModelVersion extends ModelVersionListResponse {
  value: string
  label: string
}
