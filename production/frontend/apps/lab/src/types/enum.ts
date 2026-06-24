/**
 * 数据集格式枚举项类型定义
 */
export interface DatasetFormatOption {
  name: string
  value: string
  description: string | null
}

/**
 * 数据集枚举配置类型定义
 */
export interface DatasetEnumConfig {
  enum_name: string
  module: string
  description: string
  options: DatasetFormatOption[]
}
