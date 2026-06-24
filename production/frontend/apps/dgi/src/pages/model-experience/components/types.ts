export interface ModelItem {
  id: number
  model_name: string
  model_type: string
  description?: string
  logo?: string
  updated_time?: number
  model_count?: number
  category?: string
  security_policy?: string
  ability_count?: number
  data_level: string
  can_use?: string
}

// 将文件转换为 base64
export interface MessageContent {
  type: 'image_url' | 'text' | 'audio_url'
  image_url?: {
    url: string
  }
  audio_url?: {
    url: string
  }
  text?: string
}

/**
 * 定义流式数据块的结构
 * @property data - 实际的数据内容
 * @property event - 事件类型
 * @property id - 消息ID
 * @property retry - 重试时间
 */
export interface StreamChunk {
  data?: string
  event?: string
  id?: string
  retry?: number
}

/**
 * 用于跟踪对话内容的状态接口
 * @property content - 主要对话内容
 * @property reasoningContent - AI的思考过程内容
 */
export interface StreamState {
  content: string
  reasoningContent: string
}
