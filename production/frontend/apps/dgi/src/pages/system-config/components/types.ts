export interface WebHookItem {
  id: string
  name: string
  url: string
  type: string[]
  encryption: string
  secret?: string
  remark?: string
  createdAt: string
  creator: string
}

export interface CreateWebHookParams {
  name: string
  url: string
  type: string[]
  encryption: string
  secret?: string
  remark?: string
}
