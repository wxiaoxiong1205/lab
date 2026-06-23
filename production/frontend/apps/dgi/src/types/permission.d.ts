// 用户权限级别类型
export type UserPermissionLevel = '非密' | '一般' | '重要' | '核心'

// 数据安全级别类型
export type DataSecurityLevel = '公开' | '受控' | '普通商密' | '核心商密' | '内部' | 'MM' | 'JM'

// 数据安全级别选项接口
export interface DataSecurityLevelOption {
  label: string
  value: string
  enabled: boolean
}

// 权限映射配置类型
export type PermissionDataAccessMap = Record<UserPermissionLevel, DataSecurityLevelOption[]>

// 权限检查相关的工具函数类型
export interface PermissionUtils {
  getDataSecurityLevelsByUserPermission: (userPermissionLevel: string) => DataSecurityLevelOption[]
  hasDataSecurityAccess: (userPermissionLevel: string, dataSecurityLevel: string) => boolean
}
