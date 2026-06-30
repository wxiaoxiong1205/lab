import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { useProjectStore } from '../stores/projectStore'
import { projectApi } from '../services/api'
import type { MenuItem, Project } from '../types'
import { getEffectiveUserMenus } from '../utils/permission'
import HomePage from '../pages/HomePage'

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
 * HomePage 包装组件
 * 如果菜单中没有 /home，重定向到第一个菜单路径
 */
const HomePageWrapper = () => {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId?: string }>()
  const { userMenus } = useAuthStore()
  const { setCurrentProject } = useProjectStore()
  const effectiveUserMenus = getEffectiveUserMenus(userMenus)

  // 获取项目列表
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => projectApi
      .list({
        page: 1,
        size: 100,
      })
      .then((res) => res.items),
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  })

  // 检查菜单中是否有 /home 路径
  const hasHomeMenu = effectiveUserMenus && effectiveUserMenus.length > 0 && hasMenuPath(effectiveUserMenus, '/home')

  useEffect(() => {
    // 如果菜单中没有 /home，重定向到第一个菜单路径
    if (!hasHomeMenu && effectiveUserMenus && effectiveUserMenus.length > 0) {
      if (projectId) {
        const firstMenuPath = findFirstMenuPath(effectiveUserMenus)
        if (firstMenuPath) {
          navigate(`/project/${projectId}${firstMenuPath}`, { replace: true })
        }
      }
      else {
        if (projects.length > 0) {
          const firstMenuPath = findFirstMenuPath(effectiveUserMenus)
          if (firstMenuPath) {
            navigate(`/project/${projects[0].id}${firstMenuPath}`, { replace: true })
            setCurrentProject(projects[0])
          }
        }
      }
    }
  }, [navigate, projectId, effectiveUserMenus, projects, setCurrentProject, hasHomeMenu])

  // 如果菜单中没有 /home，返回 null 避免渲染 HomePage（useEffect 会重定向）
  if (!hasHomeMenu) {
    return null
  }

  // 如果菜单中有 /home，渲染 HomePage
  return <HomePage />
}

export default HomePageWrapper
