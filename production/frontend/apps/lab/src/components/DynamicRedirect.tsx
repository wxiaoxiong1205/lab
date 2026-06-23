import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import type { MenuItem } from '../types'

/**
 * 递归查找菜单中是否有指定路径
 */
const hasMenuPath = (menuItems: MenuItem[], targetPath: string): boolean => {
  for (const item of menuItems) {
    if (item.pathUrl === targetPath) {
      return true
    }
    if (item.children && item.children.length > 0) {
      if (hasMenuPath(item.children, targetPath)) {
        return true
      }
    }
  }
  return false
}

/**
 * 递归查找第一个有 pathUrl 的菜单项（按 sort 排序）
 */
const findFirstMenuPath = (menuItems: MenuItem[]): string | null => {
  const sortedItems = [...menuItems].sort((a, b) => a.sort - b.sort)
  for (const item of sortedItems) {
    if (item.pathUrl) {
      return item.pathUrl
    }
    if (item.children && item.children.length > 0) {
      const childPath = findFirstMenuPath(item.children)
      if (childPath) {
        return childPath
      }
    }
  }
  return null
}

/**
 * 动态重定向组件
 * 根据菜单数据决定重定向到 /home 还是第一个菜单路径
 */
const DynamicRedirect = () => {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId?: string }>()
  const { userMenus } = useAuthStore()

  useEffect(() => {
    if (projectId) {
      let targetPath = '/home'

      if (userMenus && userMenus.length > 0) {
        if (hasMenuPath(userMenus, '/home')) {
          targetPath = '/home'
        }
        else {
          const firstMenuPath = findFirstMenuPath(userMenus)
          if (firstMenuPath) {
            targetPath = firstMenuPath
          }
        }
      }

      navigate(`/project/${projectId}${targetPath}`, { replace: true })
      return
    }

    navigate('/home', { replace: true })
  }, [navigate, projectId, userMenus])

  return null
}

export default DynamicRedirect
