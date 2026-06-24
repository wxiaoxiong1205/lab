/**
 * 菜单相关 API
 * 供布局等获取菜单数据使用；也可从 useAuthStore 的 userMenus 直接读取（已登录后）
 */

import { userApi } from './api'
import type { MenuItem } from '@/types'

/**
 * 获取菜单数据（调用 /menu 接口）
 * 若已登录，优先使用 useAuthStore().userMenus 避免重复请求
 */
export async function fetchMenuData(): Promise<MenuItem[]> {
  const data = await userApi.menuList()
  return Array.isArray(data) ? (data as MenuItem[]) : []
}
