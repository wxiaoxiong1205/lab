/**
 * 权限检查工具函数
 * 用于判断用户是否有访问特定路径的权限
 */

import type { MenuItem } from '@/types'
import { mockMenuData } from '@/mock/mockMenuData'
import { isLocalDemoFallbackEnabled } from '@/mock/localPreviewData'

export const getEffectiveUserMenus = (userMenus: MenuItem[] = []): MenuItem[] => {
  if (Array.isArray(userMenus) && userMenus.length > 0) {
    return userMenus
  }

  return isLocalDemoFallbackEnabled() ? mockMenuData : []
}

/**
 * 通过菜单数据判断用户是否是管理员
 * @param userMenus 用户的菜单权限列表
 * @returns 是否是管理员
 */
export const isAdminUser = (userMenus: MenuItem[]): boolean => {
  const effectiveMenus = getEffectiveUserMenus(userMenus)
  // 检查菜单中是否包含管理员模式菜单（code 为 "admin"）
  // 如果用户菜单为空或不是数组，直接返回false
  if (!effectiveMenus || !Array.isArray(effectiveMenus)) {
    return false
  }

  const hasAdminMenu = effectiveMenus.some((menu) => menu.code === 'admin')
  return hasAdminMenu
}

/**
 * 递归收集菜单中所有可访问的路径
 * @param menus 菜单列表
 * @returns 可访问的路径集合
 */
export const collectAllowedPaths = (menus: MenuItem[]): Set<string> => {
  const paths = new Set<string>()

  const traverse = (items: MenuItem[]) => {
    for (const item of items) {
      // 如果菜单项有路径，添加到集合中
      if (item.pathUrl) {
        paths.add(item.pathUrl)
      }

      // 递归处理子菜单
      if (item.children && item.children.length > 0) {
        traverse(item.children)
      }
    }
  }

  traverse(menus)
  return paths
}

/**
 * 检查用户是否有访问指定路径的权限
 * @param userMenus 用户的菜单权限列表
 * @param currentPath 当前访问的路径
 * @returns 是否有权限访问
 */
export const checkPathPermission = (
  userMenus: MenuItem[] = [],
  currentPath: string,
): boolean => {
  const effectiveMenus = getEffectiveUserMenus(userMenus)
  // 通过菜单判断是否是管理员，管理员拥有所有权限
  if (isAdminUser(effectiveMenus)) {
    return true
  }

  // 先标准化当前路径（移除base路径和项目ID）
  const normalizedPath = normalizePath(currentPath)

  // 公共路径，无需权限检查（使用标准化后的路径）
  const publicPaths = [
    '/docs',
    '/home',
    '/',
  ]

  // 检查是否是公共路径
  if (publicPaths.some((path) => normalizedPath === path || normalizedPath.startsWith(`${path}/`))) {
    return true
  }

  // 如果没有菜单权限，只能访问公共路径
  if (!effectiveMenus || effectiveMenus.length === 0) {
    return false
  }

  // 收集所有允许访问的路径
  const allowedPaths = collectAllowedPaths(effectiveMenus)

  // 检查是否有精确匹配
  if (allowedPaths.has(normalizedPath)) {
    return true
  }

  // 检查是否有前缀匹配（支持子路由）
  for (const allowedPath of allowedPaths) {
    if (normalizedPath.startsWith(`${allowedPath}/`) || normalizedPath.startsWith(`${allowedPath}?`)) {
      return true
    }
  }

  return false
}

/**
 * 标准化路径，移除base路径和项目ID参数
 * 例如：/t_deepexilab/LAB/project/123/datasets -> /datasets
 *       /t_deepexilab/LAB/project/admin/projects -> /admin/projects
 *       /t_deepexilab/LAB/home -> /home
 * @param path 原始路径
 * @returns 标准化后的路径
 */
export const normalizePath = (path: string): string => {
  // 移除查询参数
  const pathWithoutQuery = path.split('?')[0]

  // 移除末尾的斜杠
  let normalized = pathWithoutQuery.replace(/\/$/, '')

  // 确保路径以 / 开头
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`
  }

  // 兼容宿主路径：/t_deepexilab/LAB/project/139/model -> /project/139/model
  const labPathIndex = normalized.indexOf('/LAB/')
  if (labPathIndex >= 0) {
    normalized = normalized.substring(labPathIndex + '/LAB'.length) || '/'
  }
  else if (normalized.endsWith('/LAB')) {
    normalized = '/'
  }

  // 处理 /project/admin/xxx -> /admin/xxx
  if (normalized.startsWith('/project/admin/')) {
    normalized = normalized.replace('/project/admin/', '/admin/')
  }

  // 处理包含项目ID的路径：/project/:projectId/xxx -> /xxx
  const projectPathPattern = /^\/project\/(?!admin\/)[^/]+(.*)$/
  const match = normalized.match(projectPathPattern)
  if (match) {
    normalized = match[1] || '/home'
  }

  // /project/home 与 /project/:projectId/home 统一为 /home，便于菜单与面包屑一致（同一菜单项 home）
  if (normalized === '/project/home') {
    normalized = '/home'
  }

  return normalized
}

/**
 * 获取路径的菜单信息（用于显示无权限提示）
 * @param userMenus 用户的菜单权限列表
 * @param currentPath 当前路径
 * @returns 菜单信息，如果找不到返回 null
 */
export const getMenuInfoByPath = (
  userMenus: MenuItem[],
  currentPath: string,
): MenuItem | null => {
  const normalizedPath = normalizePath(currentPath)

  const findMenu = (items: MenuItem[]): MenuItem | null => {
    for (const item of items) {
      if (item.pathUrl === normalizedPath) {
        return item
      }

      if (item.children && item.children.length > 0) {
        const found = findMenu(item.children)
        if (found) {
          return found
        }
      }
    }
    return null
  }

  return findMenu(userMenus)
}
