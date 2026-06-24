import {
  DATA_SECURITY_LEVELS,
  USER_PERMISSION_LEVELS,
  getDataSecurityLevelsByUserPermission,
  hasDataSecurityAccess,
} from '@/constants'
import type { DataSecurityLevelOption, UserPermissionLevel } from '@/types/permission'

/**
 * 权限辅助工具类
 */
export class PermissionHelper {
  /**
   * 获取用户可访问的数据安全级别选项列表
   * @param userPermissionLevel 用户权限级别（中文）
   * @returns 数据安全级别选项列表
   */
  static getAvailableDataSecurityLevels(userPermissionLevel: UserPermissionLevel): DataSecurityLevelOption[] {
    return [...getDataSecurityLevelsByUserPermission(userPermissionLevel)]
  }

  /**
   * 获取用户可访问的数据安全级别（仅返回可用的）
   * @param userPermissionLevel 用户权限级别（中文）
   * @returns 可访问的数据安全级别选项列表
   */
  static getEnabledDataSecurityLevels(userPermissionLevel: UserPermissionLevel): DataSecurityLevelOption[] {
    return getDataSecurityLevelsByUserPermission(userPermissionLevel).filter((item) => item.enabled)
  }

  /**
   * 获取用户不可访问的数据安全级别
   * @param userPermissionLevel 用户权限级别（中文）
   * @returns 不可访问的数据安全级别选项列表
   */
  static getDisabledDataSecurityLevels(userPermissionLevel: UserPermissionLevel): DataSecurityLevelOption[] {
    return getDataSecurityLevelsByUserPermission(userPermissionLevel)?.filter((item) => !item.enabled) ?? []
  }

  /**
   * 检查用户是否有访问权限
   * @param userPermissionLevel 用户权限级别（中文）
   * @param dataSecurityLevel 数据安全级别
   * @returns 是否有权限
   */
  static checkAccess(userPermissionLevel: UserPermissionLevel, dataSecurityLevel: string): boolean {
    return hasDataSecurityAccess(userPermissionLevel, dataSecurityLevel)
  }

  /**
   * 根据用户权限级别过滤数据列表
   * @param dataList 原始数据列表
   * @param userPermissionLevel 用户权限级别
   * @param getDataSecurityLevel 获取数据安全级别的函数
   * @returns 过滤后的数据列表
   */
  static filterDataByPermission<T>(
    dataList: T[],
    userPermissionLevel: UserPermissionLevel,
    getDataSecurityLevel: (item: T) => string,
  ): T[] {
    return dataList.filter((item) => {
      const securityLevel = getDataSecurityLevel(item)
      return this.checkAccess(userPermissionLevel, securityLevel)
    })
  }

  /**
   * 获取所有用户权限级别选项
   * @returns 用户权限级别选项列表
   */
  static getUserPermissionLevelOptions() {
    return Object.values(USER_PERMISSION_LEVELS).map((level) => ({
      label: level,
      value: level,
    }))
  }

  /**
   * 获取所有数据安全级别选项
   * @returns 数据安全级别选项列表
   */
  static getDataSecurityLevelOptions() {
    return Object.values(DATA_SECURITY_LEVELS).map((level) => ({
      label: level,
      value: level.toLowerCase().replace(/\s+/g, '_'),
    }))
  }
}

// 使用示例导出
export const permissionExamples = {
  // 示例：获取非密用户可访问的数据安全级别
  getNonSecretUserAccess: () => {
    return PermissionHelper.getAvailableDataSecurityLevels('非密')
  },

  // 示例：检查一般用户是否可以访问MM级别数据
  checkGeneralUserMMAccess: () => {
    return PermissionHelper.checkAccess('一般', 'mm')
  },

  // 示例：过滤数据列表（假设有一个包含安全级别的数据列表）
  filterModelsByPermission: (models: Array<{ name: string, securityLevel: string }>, userLevel: UserPermissionLevel) => {
    return PermissionHelper.filterDataByPermission(
      models,
      userLevel,
      (model) => model.securityLevel,
    )
  },
}
