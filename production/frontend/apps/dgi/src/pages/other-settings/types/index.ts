export interface SensitiveWordItem {
  word_id: string
  original_word: string
  creator: string
  updated_at: string
  category: string
  enhance: boolean
}

export interface CategoryItem {
  id: string
  name: string
  risk_level?: 'low' | 'medium' | 'high'
  parent_id?: string
  children?: CategoryItem[]
}

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}
