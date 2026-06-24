import { Link, type Location, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import React from 'react'
import { createPortal } from 'react-dom'
import { Alert, Button, Layout, Menu, Select, Spin } from 'antd'
import { ApiOutlined, AppstoreOutlined, ArrowLeftOutlined, BoxPlotOutlined, CloudServerOutlined, ContainerOutlined, DatabaseOutlined, DeploymentUnitOutlined, ExperimentOutlined, FileSearchOutlined, FilterOutlined, FolderFilled, FormOutlined, HddOutlined, HomeOutlined, LineChartOutlined, ProjectOutlined, RadarChartOutlined, RobotOutlined, RocketOutlined, SettingOutlined, TagsOutlined, ThunderboltOutlined, UserOutlined } from '@ant-design/icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MenuProps } from 'antd'
import { Suspense } from 'react'
import { qiankunWindow } from 'vite-plugin-qiankun/dist/helper'
import { authApi, projectApi } from '../services/api'
import { useProjectStore } from '../stores/projectStore'
import type { Project } from '../types'
import useI18n from '../hooks/useI18n'
import { useAuthStore } from '../stores/authStore'
import { isAdminUser, normalizePath } from '../utils/permission'
import MenuErrorFallback from '../components/MenuErrorFallback'
import MainLayout from './MainLayout'
import './ProjectLayout.css'
import { MenuType } from '@/const/menu'
import type { MenuItem } from '@/types'

const { Sider, Content } = Layout
const PRIMARY_NAV_ITEMS = [
  { key: 'workspace', label: '项目空间' },
  { key: 'system', label: '系统管理' },
] as const
const HOME_MENU_CODE = 'home'
const WORKSPACE_ROOT_STORAGE_KEY = 'lab-project-workspace-root-code'
const PROJECT_SELECTOR_MIN_WIDTH = 194
const PROJECT_SELECTOR_RESERVED_WIDTH = 242
interface WorkspaceLocationState {
  workspaceRootCode?: string
}
type PrimaryNavKey = typeof PRIMARY_NAV_ITEMS[number]['key']
interface SecondaryMenuGroup {
  key: string
  label: string
  menus: MenuItem[]
  targetPath?: string
}
interface HeaderNavItem {
  key: string
  label: string
}
interface InjectedHeaderNavItem extends HeaderNavItem {
  onClick: () => void
}
// 图标映射对象
const iconMap: Record<string, React.ReactNode> = {
  DatabaseOutlined: <DatabaseOutlined />,
  CloudServerOutlined: <CloudServerOutlined />,
  ThunderboltOutlined: <ThunderboltOutlined />,
  AppstoreOutlined: <AppstoreOutlined />,
  ProjectOutlined: <ProjectOutlined />,
  UserOutlined: <UserOutlined />,
  ContainerOutlined: <ContainerOutlined />,
  HddOutlined: <HddOutlined />,
  HomeOutlined: <HomeOutlined />,
  home: <HomeOutlined />,
  RocketOutlined: <RocketOutlined />,
  TagsOutlined: <TagsOutlined />,
  FormOutlined: <FormOutlined />,
  ApiOutlined: <ApiOutlined />,
  ExperimentOutlined: <ExperimentOutlined />,
  FileSearchOutlined: <FileSearchOutlined />,
  LineChartOutlined: <LineChartOutlined />,
  RadarChartOutlined: <RadarChartOutlined />,
  FilterOutlined: <FilterOutlined />,
  BoxPlotOutlined: <BoxPlotOutlined />,
  DeploymentUnitOutlined: <DeploymentUnitOutlined />,
  RobotOutlined: <RobotOutlined />,
  SettingOutlined: <SettingOutlined />,
  FolderFilled: <FolderFilled />,
}
/**
 * 根据菜单的 code 或 name 获取默认图标
 * 用于处理后端返回的菜单数据中 iconUrl 为空的情况
 */
const getDefaultIcon = (code: string, name: string): React.ReactNode | null => {
  // 优先根据 name 匹配（中文），更准确
  if (name === '数据处理' || name.includes('数据处理')) {
    return <FilterOutlined />
  }
  if (name === '模型评估' || name.includes('模型评估')) {
    return <LineChartOutlined />
  }
  if (name === '在线推理服务' || name.includes('在线推理服务') || name.includes('推理服务')) {
    return <ApiOutlined />
  }
  // 根据 code 匹配（英文）
  const codeLower = code.toLowerCase()
  if (codeLower.includes('data_processing') || codeLower === 'data_processing') {
    return <FilterOutlined />
  }
  if (codeLower.includes('model_evaluation') || codeLower.includes('evaluation') || codeLower === 'model_evaluation') {
    return <LineChartOutlined />
  }
  if (codeLower.includes('online_inference') || codeLower.includes('inference_service') || codeLower === 'online_inference') {
    return <ApiOutlined />
  }
  return null
}
const sortMenus = (menuItems: MenuItem[]) => [...menuItems].sort((a, b) => a.sort - b.sort)
const isMenuNode = (item: MenuItem) => item.type === MenuType.MENU
const createSecondaryGroups = (menuItems: MenuItem[], getFirstNavigablePath: (menuItems: MenuItem[]) => string | undefined): SecondaryMenuGroup[] => {
  return sortMenus(menuItems).map((menuItem) => ({
    key: menuItem.code,
    label: menuItem.name,
    menus: menuItem.children?.filter(isMenuNode)?.length ? sortMenus(menuItem.children.filter(isMenuNode)) : [menuItem],
    targetPath: getFirstNavigablePath([menuItem]),
  })).filter((group) => group.targetPath || group.menus.length > 0)
}
const getMenuChildren = (menuItem: MenuItem) => menuItem.children?.filter(isMenuNode) ?? []
const hasMenuChildren = (menuItem: MenuItem) => getMenuChildren(menuItem).length > 0
const getWorkspaceRootCodeFromLocation = (location: Location): string | undefined => {
  const state = location.state as WorkspaceLocationState | null
  return state?.workspaceRootCode
}
const hasAdminPath = (item: MenuItem): boolean => {
  if (item.pathUrl?.startsWith('/admin/'))
    return true
  return item.children?.some(hasAdminPath) ?? false
}
const isSystemRootMenu = (item: MenuItem): boolean => {
  const code = item.code?.toLowerCase?.() ?? ''
  // const name = item.name ?? ''
  return [
    code === 'admin',
    code.includes('admin'),
    // code.includes('system'),
    // code.includes('platform'),
    // name.includes('管理员'),
    // name.includes('系统'),
    // name.includes('平台'),
    hasAdminPath(item),
  ].some(Boolean)
}
const matchesMenuPath = (menuItems: MenuItem[], normalizedPath: string): boolean => {
  return menuItems.some((menuItem) => {
    if (menuItem.pathUrl === normalizedPath)
      return true
    if (menuItem.pathUrl
      && (normalizedPath.startsWith(`${menuItem.pathUrl}/`) || normalizedPath.startsWith(`${menuItem.pathUrl}?`))) {
      return true
    }
    return menuItem.children?.length ? matchesMenuPath(menuItem.children, normalizedPath) : false
  })
}
const findNearestMenuPath = (menuItems: MenuItem[], normalizedPath: string): {
  pathUrl: string
  isExact: boolean
  matchLength: number
} | null => {
  let bestMatch: {
    pathUrl: string
    isExact: boolean
    matchLength: number
  } | null = null

  for (const menuItem of menuItems) {
    if (menuItem.pathUrl === normalizedPath) {
      return {
        pathUrl: menuItem.pathUrl,
        isExact: true,
        matchLength: menuItem.pathUrl.length,
      }
    }

    if (menuItem.pathUrl
      && (normalizedPath.startsWith(`${menuItem.pathUrl}/`) || normalizedPath.startsWith(`${menuItem.pathUrl}?`))) {
      if (!bestMatch || menuItem.pathUrl.length > bestMatch.matchLength) {
        bestMatch = {
          pathUrl: menuItem.pathUrl,
          isExact: false,
          matchLength: menuItem.pathUrl.length,
        }
      }
    }

    if (menuItem.children?.length) {
      const childMatch = findNearestMenuPath(menuItem.children, normalizedPath)
      if (childMatch?.isExact)
        return childMatch
      if (childMatch && (!bestMatch || childMatch.matchLength > bestMatch.matchLength)) {
        bestMatch = childMatch
      }
    }
  }

  return bestMatch
}
/**
 * 项目布局组件
 * 提供项目相关页面的布局结构，包括顶部导航栏、项目选择器和左侧菜单
 */
const ProjectLayout = ({ children }: {
  children?: React.ReactNode
}) => {
  const { userMenus, menuLoadError } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const { projectId } = useParams<{
    projectId: string
  }>()
  const { currentProject, setCurrentProject } = useProjectStore()
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [openKeys, setOpenKeys] = useState<string[]>([])
  const [workspaceRootCode, setWorkspaceRootCode] = useState(() => sessionStorage.getItem(WORKSPACE_ROOT_STORAGE_KEY) || undefined)
  const [injectedHeaderSlots, setInjectedHeaderSlots] = useState<HTMLElement[]>([])
  const [injectedProjectSelectorSlot, setInjectedProjectSelectorSlot] = useState<HTMLElement | null>(null)
  const siderRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const injectedHeaderSlotsRef = useRef<HTMLElement[]>([])
  const injectedProjectSelectorSlotRef = useRef<HTMLElement | null>(null)
  const injectedHeaderNavContainerRef = useRef<HTMLElement | null>(null)
  const injectedHeaderMenuStyleRef = useRef<{
    element: HTMLElement
    display: string
    justifyContent: string
    alignItems: string
    gap: string
    width: string
    position: string
    height: string
    boxSizing: string
    overflow: string
    paddingLeft: string
    paddingRight: string
    // minHeight: string
    fontSize: string
    lineHeight: string
  } | null>(null)
  const injectedHeaderStyleRef = useRef<{
    element: HTMLElement
    background: string
    backgroundColor: string
    border: string
    borderBottom: string
    boxShadow: string
    height: string
    // minHeight: string
    lineHeight: string
  } | null>(null)
  // 判断是否是 qiankun 子应用
  const isQiankun = qiankunWindow.__POWERED_BY_QIANKUN__
  // 判断是否是无界微前端子应用
  const isWujie = window.__POWERED_BY_WUJIE__
  // 通过菜单判断是否是管理员
  const isAdmin = isAdminUser(userMenus)
  // 获取菜单可见性配置
  const { data: menuVisibleConfig } = useQuery<{
    visible: boolean
    reason: string
  }>({
    queryKey: ['menuVisible'],
    queryFn: () => authApi.getMenuVisible(),
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  })
  const normalizedPath = useMemo(() => normalizePath(location.pathname), [location.pathname])
  const isStandaloneApiAccessKeyPage = normalizedPath === '/api-access-key'
  const isProjectDetailPage = Boolean(projectId) && !normalizedPath.startsWith('/admin/')
  const currentSiderMenusRef = useRef<MenuItem[]>([])
  const getFullPath = useCallback((path: string, baseUrl: string = `/project/${currentProject?.id}`): string => {
    if (!path)
      return ''
    if (path.startsWith('/admin/')) {
      return `/project${path}`
    }
    return `${baseUrl}${path}`
  }, [currentProject?.id])
  const getFirstNavigablePath = useCallback((menuItems: MenuItem[]): string | undefined => {
    for (const item of sortMenus(menuItems)) {
      if (!isMenuNode(item))
        continue
      if (item.pathUrl) {
        const path = getFullPath(item.pathUrl)
        if (path)
          return path
      }
      if (item.children?.length) {
        const childPath = getFirstNavigablePath(item.children)
        if (childPath)
          return childPath
      }
    }
    return undefined
  }, [getFullPath])
  const systemRootMenu = useMemo(() => {
    return sortMenus(userMenus?.filter(isMenuNode) ?? []).find(isSystemRootMenu)
  }, [userMenus])
  const workspaceRootMenus = useMemo(() => {
    return sortMenus(userMenus?.filter(isMenuNode) ?? [])
      .filter((item) => item.code !== HOME_MENU_CODE)
      .filter((item) => item.code !== systemRootMenu?.code)
  }, [systemRootMenu?.code, userMenus])
  const platformAdminMenu = useMemo<MenuItem | null>(() => {
    if (!menuVisibleConfig?.visible)
      return null
    return {
      id: -1,
      code: 'platform_admin',
      name: '平台管理员',
      type: MenuType.MENU,
      sort: Number.MAX_SAFE_INTEGER,
      parentId: 0,
      idPath: '',
      children: [],
      iconUrl: 'UserOutlined',
      pathUrl: '/admin/platform-management',
    }
  }, [menuVisibleConfig?.visible])
  const systemSiderMenus = useMemo(() => {
    const menus = sortMenus(systemRootMenu?.children?.filter(isMenuNode) ?? [])
    return platformAdminMenu ? [...menus, platformAdminMenu] : menus
  }, [platformAdminMenu, systemRootMenu])
  const activeWorkspaceRootCode = useMemo(() => {
    const codeFromLocation = getWorkspaceRootCodeFromLocation(location)
    if (codeFromLocation && workspaceRootMenus.some((menuItem) => menuItem.code === codeFromLocation)) {
      return codeFromLocation
    }
    const matchedRootMenu = workspaceRootMenus.find((menuItem) => matchesMenuPath([menuItem], normalizedPath))
    return matchedRootMenu?.code ?? workspaceRootCode ?? workspaceRootMenus[0]?.code
  }, [location, normalizedPath, workspaceRootCode, workspaceRootMenus])
  useEffect(() => {
    if (!activeWorkspaceRootCode || workspaceRootCode === activeWorkspaceRootCode)
      return
    setWorkspaceRootCode(activeWorkspaceRootCode)
    sessionStorage.setItem(WORKSPACE_ROOT_STORAGE_KEY, activeWorkspaceRootCode)
  }, [activeWorkspaceRootCode, workspaceRootCode])
  const workspaceSecondaryGroups = useMemo<SecondaryMenuGroup[]>(() => {
    const activeRootMenu = workspaceRootMenus.find((menuItem) => menuItem.code === activeWorkspaceRootCode)
    if (!activeRootMenu)
      return []
    const rootChildren = sortMenus(getMenuChildren(activeRootMenu))
    const headerMenus = rootChildren.length > 0 && rootChildren.some(hasMenuChildren)
      ? rootChildren
      : [activeRootMenu]
    return createSecondaryGroups(headerMenus, getFirstNavigablePath)
  }, [activeWorkspaceRootCode, getFirstNavigablePath, workspaceRootMenus])
  const systemSecondaryGroups = useMemo<SecondaryMenuGroup[]>(() => {
    const groups: SecondaryMenuGroup[] = []
    systemSiderMenus.forEach((child) => {
      groups.push({
        key: child.code,
        label: child.name,
        menus: child.children?.filter(isMenuNode)?.length ? sortMenus(child.children.filter(isMenuNode)) : [child],
        targetPath: getFirstNavigablePath([child]),
      })
    })
    return groups
  }, [getFirstNavigablePath, systemSiderMenus])
  const activeWorkspaceSecondaryKey = useMemo(() => {
    const matchedGroup = workspaceSecondaryGroups.find((group) => matchesMenuPath(group.menus, normalizedPath))
    return matchedGroup?.key ?? workspaceSecondaryGroups[0]?.key
  }, [normalizedPath, workspaceSecondaryGroups])
  const activeSystemSecondaryKey = useMemo(() => {
    const matchedGroup = systemSecondaryGroups.find((group) => matchesMenuPath(group.menus, normalizedPath))
    return matchedGroup?.key ?? systemSecondaryGroups[0]?.key
  }, [normalizedPath, systemSecondaryGroups])
  const activePrimaryKey: PrimaryNavKey = useMemo(() => {
    if (normalizedPath.startsWith('/admin/'))
      return 'system'
    if (systemSecondaryGroups.some((group) => matchesMenuPath(group.menus, normalizedPath))) {
      return 'system'
    }
    return 'workspace'
  }, [normalizedPath, systemSecondaryGroups])
  const activeSecondaryKey = activePrimaryKey === 'system' ? activeSystemSecondaryKey : activeWorkspaceSecondaryKey
  const secondaryNavItems = activePrimaryKey === 'system' ? systemSecondaryGroups : workspaceSecondaryGroups
  const currentSiderMenus = useMemo(() => {
    if (activePrimaryKey === 'system') {
      return systemSiderMenus
    }
    return secondaryNavItems.find((item) => item.key === activeSecondaryKey)?.menus ?? []
  }, [activePrimaryKey, activeSecondaryKey, secondaryNavItems, systemSiderMenus])
  useEffect(() => {
    currentSiderMenusRef.current = currentSiderMenus
  }, [currentSiderMenus])
  // 处理openKeys变化：支持嵌套菜单展开，同级菜单互斥
  const onOpenChange = (keys: string[]) => {
    // 清除之前的延迟关闭定时器
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    const latestOpenKey = keys.find((key) => !openKeys.includes(key))
    if (latestOpenKey) {
      // 有新菜单打开
      const visibleMenus = currentSiderMenusRef.current
      if (!visibleMenus?.length) {
        setOpenKeys(keys)
        return
      }
      // 查找新打开菜单的所有父菜单
      const findParentKeys = (menuItems: MenuItem[], targetKey: string, parents: string[] = []): string[] | null => {
        for (const item of menuItems) {
          if (item.code === targetKey) {
            return parents
          }
          if (item.children?.length) {
            const result = findParentKeys(item.children, targetKey, [...parents, item.code])
            if (result !== null)
              return result
          }
        }
        return null
      }
      const parentKeys = findParentKeys(visibleMenus, latestOpenKey) || []
      // 保留：新打开的菜单 + 它的所有父菜单 + 它的所有子菜单（如果已经打开）
      const newOpenKeys = [latestOpenKey, ...parentKeys]
      // 同时保留新打开菜单的子孙菜单（如果它们已经在openKeys中）
      const isDescendant = (menuItems: MenuItem[], ancestorKey: string, descendantKey: string): boolean => {
        for (const item of menuItems) {
          if (item.code === ancestorKey) {
            const checkChildren = (children: MenuItem[]): boolean => {
              for (const child of children) {
                if (child.code === descendantKey)
                  return true
                if (child.children?.length && checkChildren(child.children))
                  return true
              }
              return false
            }
            return item.children?.length ? checkChildren(item.children) : false
          }
          if (item.children?.length && isDescendant(item.children, ancestorKey, descendantKey)) {
            return true
          }
        }
        return false
      }
      openKeys.forEach((key) => {
        if (isDescendant(visibleMenus, latestOpenKey, key)) {
          newOpenKeys.push(key)
        }
      })
      setOpenKeys([...new Set(newOpenKeys)])
    }
    else {
      // 没有新菜单打开，只是关闭某些菜单
      setOpenKeys(keys)
    }
  }
  // 清理定时器
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
      }
    }
  }, [])
  // 获取项目列表 - 禁用缓存，每次重新请求
  const { data: projects = [], isLoading: projectListLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => projectApi
      .list({
        page: 1,
        size: 100,
      })
      .then((res) => res.items),
    refetchOnWindowFocus: false, // 窗口聚焦时不自动重新获取
    refetchOnMount: true, // 组件挂载时重新获取
  })
  // 当前项目 ID 不在列表中时，将 store 同步为第一个项目并缓存
  useEffect(() => {
    if (menuLoadError)
      return
    if (projects.length === 0)
      return
    const exists = projects.some((p) => p.id === currentProject?.id)
    if (!exists) {
      setCurrentProject(projects[0])
    }
  }, [menuLoadError, projects, currentProject?.id, setCurrentProject])
  useEffect(() => {
    if (menuLoadError)
      return
    // 如果是admin路由，不进行项目相关的重定向
    if (location.pathname.includes('/project/admin/'))
      return
    // 项目空间页保持在 /home，不自动跳入项目内
    if (!projectId)
      return
    // 当项目列表为空时，直接清空localStorage中的项目信息
    if (!projects.length) {
      localStorage.removeItem('project-storage')
      // setCurrentProject(null);
      return
    }
    const goToFirstProject = () => {
      navigate(`/project/${projects[0].id}/home`, { replace: true })
      setCurrentProject(projects[0])
    }
    if (projectId) {
      const targetProject = projects.find((p) => p.id === Number(projectId))
      if (targetProject) {
        setCurrentProject(targetProject)
        if (!location.pathname.includes(`/project/${projectId}/`)) {
          navigate(`/project/${projectId}/home`, { replace: true })
        }
      }
      else {
        goToFirstProject()
      }
    }
  }, [menuLoadError, projectId, projects, location.pathname, currentProject, setCurrentProject, navigate])
  /**
   * 根据选中的菜单项code，递归查找它的所有父菜单code
   * @param menuItems 菜单数据
   * @param targetCode 目标菜单项code
   * @param parentCodes 已找到的父菜单code数组（用于递归）
   * @returns 父菜单code数组，从最外层到最内层，如果没找到返回null
   */
  const findParentMenuCodes = useCallback((menuItems: MenuItem[], targetCode: string, parentCodes: string[] = []): string[] | null => {
    for (const item of menuItems) {
      // 如果找到目标菜单项，返回已收集的父菜单code数组
      if (item.code === targetCode) {
        return parentCodes
      }
      // 如果有子菜单，递归查找
      if (item.children && item.children.length > 0) {
        const result = findParentMenuCodes(item.children, targetCode, [...parentCodes, item.code])
        // 如果找到了，返回结果
        if (result !== null) {
          return result
        }
      }
    }
    // 在当前分支没找到，返回null
    return null
  }, [])
  const collectNavigableMenuPaths = useCallback((menuItems: MenuItem[]): string[] => {
    const paths: string[] = []
    const traverse = (items: MenuItem[]) => {
      items.forEach((item) => {
        if (item.type === MenuType.MENU && item.pathUrl) {
          paths.push(normalizePath(item.pathUrl))
        }
        if (item.children?.length) {
          traverse(item.children)
        }
      })
    }
    traverse(menuItems)
    return [...new Set(paths)]
  }, [])
  const getProjectPathByMenuPath = useCallback((menuPath: string, targetProjectId: number): string => {
    if (menuPath.startsWith('/admin/')) {
      return `/project${menuPath}`
    }
    return `/project/${targetProjectId}${menuPath === '/' ? '/home' : menuPath}`
  }, [])
  const getCommonPathPrefix = useCallback((sourcePath: string, targetPath: string): string => {
    const sourceSegments = sourcePath.split('/').filter(Boolean)
    const targetSegments = targetPath.split('/').filter(Boolean)
    const commonSegments: string[] = []
    const minLength = Math.min(sourceSegments.length, targetSegments.length)
    for (let index = 0; index < minLength; index += 1) {
      if (sourceSegments[index] !== targetSegments[index])
        break
      commonSegments.push(sourceSegments[index])
    }
    return commonSegments.length ? `/${commonSegments.join('/')}` : ''
  }, [])
  const getProjectSwitchTargetPath = useCallback((targetProjectId: number): {
    path: string
    keepSearchAndHash: boolean
  } => {
    if (!projectId) {
      return {
        path: `/project/${targetProjectId}/home`,
        keepSearchAndHash: false,
      }
    }

    const currentNormalizedPath = normalizePath(location.pathname)
    const menuPaths = collectNavigableMenuPaths(userMenus?.filter(isMenuNode) ?? [])
    const menuPathSet = new Set(menuPaths)

    if (menuPathSet.has(currentNormalizedPath)) {
      return {
        path: location.pathname.replace(new RegExp(`^/project/${projectId}(?=/|$)`), `/project/${targetProjectId}`),
        keepSearchAndHash: true,
      }
    }

    const longestPrefixMenuPath = menuPaths
      .filter((menuPath) => currentNormalizedPath.startsWith(`${menuPath}/`) || currentNormalizedPath.startsWith(`${menuPath}?`))
      .sort((a, b) => b.length - a.length)[0]
    if (longestPrefixMenuPath) {
      return {
        path: getProjectPathByMenuPath(longestPrefixMenuPath, targetProjectId),
        keepSearchAndHash: false,
      }
    }

    const parentMenuPath = currentNormalizedPath
      .split('/')
      .filter(Boolean)
      .map((_, index, segments) => `/${segments.slice(0, segments.length - index - 1).join('/')}`)
      .find((parentPath) => parentPath !== '/' && menuPathSet.has(parentPath))
    if (parentMenuPath) {
      return {
        path: getProjectPathByMenuPath(parentMenuPath, targetProjectId),
        keepSearchAndHash: false,
      }
    }

    const commonMenuPath = menuPaths
      .map((menuPath) => getCommonPathPrefix(currentNormalizedPath, menuPath))
      .filter((path) => path && path !== '/')
      .sort((a, b) => b.length - a.length)[0]
    if (commonMenuPath) {
      return {
        path: getProjectPathByMenuPath(commonMenuPath, targetProjectId),
        keepSearchAndHash: false,
      }
    }

    return {
      path: `/project/${targetProjectId}/home`,
      keepSearchAndHash: false,
    }
  }, [collectNavigableMenuPaths, getCommonPathPrefix, getProjectPathByMenuPath, location.pathname, projectId, userMenus])
  // 如果菜单加载失败，显示错误页面（须放在所有 Hook 之后，避免条件调用 Hook）
  // 仅通过按钮切换折叠状态，并持久化到 localStorage
  const handleProjectChange = useCallback((value: number) => {
    const project = projects.find((p) => p.id === value)
    if (project) {
      // 先取消所有正在进行的查询，避免旧项目的数据继续加载
      queryClient.cancelQueries()
      // 清除所有缓存
      queryClient.clear()
      // 移除所有查询
      queryClient.removeQueries()
      // 重置所有查询状态，强制重新获取
      queryClient.resetQueries()
      // 然后设置新项目
      setCurrentProject(project)
      const nearestMenuPath = findNearestMenuPath(userMenus?.filter(isMenuNode) ?? [], normalizedPath)
      const shouldBackToListPath = Boolean(projectId && nearestMenuPath && !nearestMenuPath.isExact)
      const nextPath = shouldBackToListPath
        ? getFullPath(nearestMenuPath.pathUrl, `/project/${project.id}`)
        : projectId
          ? location.pathname.replace(new RegExp(`^/project/${projectId}(?=/|$)`), `/project/${project.id}`)
          : `/project/${project.id}/home`
      const nextUrl = shouldBackToListPath
        ? nextPath
        : `${nextPath}${location.search}${location.hash}`
      navigate(nextUrl, { replace: true })
    }
  }, [getFullPath, location.hash, location.pathname, location.search, navigate, normalizedPath, projectId, projects, queryClient, setCurrentProject, userMenus])
  // 项目选择器配置
  const isNonAdminWithNoProject = projects.length === 0
  const projectOptions = projects.map((project) => ({
    label: project.name,
    value: project.id,
  }))
  const projectSelector = (<Select className="lab-header-project-select" variant="borderless" prefix={<FolderFilled className="lab-header-project-icon text-[18px]" />} placeholder="请选择项目" value={projects.length > 0 ? (projects.find((p) => p.id === currentProject?.id) ? currentProject?.id : projects[0]?.id) : undefined} onChange={handleProjectChange} options={projectOptions} dropdownStyle={{ fontSize: '14px' }} loading={projectListLoading} />)
  /**
   * 将接口返回的菜单数据转换为 Ant Design Menu 所需的格式
   * @param menuItems 菜单数据
   * @param baseUrl 基础路径
   * @param level 当前层级（1: 一级菜单/分组, 2: 二级菜单, 3: 三级菜单）
   */
  const transformMenuData = (menuItems: MenuItem[], baseUrl: string = `/project/${currentProject?.id}`, level: number = 1): MenuProps['items'] => {
    // 按 sort 排序
    const sortedItems = [...menuItems].sort((a, b) => a.sort - b.sort)
    return sortedItems.filter((item) => item.type === MenuType.MENU).map((item) => {
      const { code, name, pathUrl, iconUrl } = item
      const children = item.children?.filter((child) => child.type === MenuType.MENU)
      const fullPath = pathUrl ? getFullPath(pathUrl, baseUrl) : ''
      const hasChildren = Boolean(children?.length)
      // 递归检查子菜单中是否有 /admin/ 路径
      const hasAdminPathInChildren = (menuItems: MenuItem[]): boolean => {
        return menuItems.some((menuItem) => menuItem.pathUrl?.startsWith('/admin/')
          || (menuItem.children?.length && hasAdminPathInChildren(menuItem.children)))
      }
      // 没有项目时，除了首页和admin用户的系统管理菜单，其他都禁用
      const shouldDisable = projects.length === 0
        && pathUrl !== '/home'
        && !(isAdmin && (pathUrl?.startsWith('/admin/') || (hasChildren && hasAdminPathInChildren(children))))
      // 仅一级菜单显示图标，二级/三级无 icon
      let icon: React.ReactNode | null = null
      if (level === 1) {
        if (iconUrl && iconMap[iconUrl]) {
          icon = iconMap[iconUrl]
        }
        else {
          icon = getDefaultIcon(code, name)
        }
      }
      const menuItemBase = {
        key: code,
        icon,
        disabled: shouldDisable,
      }
      // 有子菜单的菜单项
      if (hasChildren) {
        return {
          type: 'group' as const,
          key: `${code}_group`,
          label: (
            <span className="project-sider-group-label">
              {icon ? <span className="project-sider-group-icon">{icon}</span> : <span className="project-sider-group-icon" />}
              <span>{name}</span>
            </span>
          ),
          children: transformMenuData(children, baseUrl, level + 1),
        }
      }
      // 叶子节点
      return {
        ...menuItemBase,
        label: fullPath
          ? (
              <Link to={fullPath} state={activePrimaryKey === 'workspace' ? { workspaceRootCode: activeWorkspaceRootCode } : undefined} className={level === 1 ? 'project-sider-root-leaf-label' : 'project-sider-leaf-label'}>
                {name}
              </Link>
            )
          : <span className={level === 1 ? 'project-sider-root-leaf-label' : 'project-sider-leaf-label'}>{name}</span>,
      }
    })
  }
  /**
   * 获取菜单项（使用动态数据）
   */
  const getMenuItems = (): MenuProps['items'] => {
    return transformMenuData(currentSiderMenus, `/project/${currentProject?.id}`, 1)
  }
  /**
   * 在菜单树中查找匹配的菜单项及其所有父菜单的code路径
   * @param menuItems 菜单数据
   * @param normalizedPath 标准化后的路径
   * @param parentCodes 已收集的父菜单code数组（用于递归）
   * @returns 匹配结果对象，包含路径和匹配类型
   */
  const findMenuPathByUrl = useCallback((menuItems: MenuItem[], normalizedPath: string, parentCodes: string[] = []): {
    path: string[]
    isExact: boolean
    matchLength: number
  } | null => {
    let bestMatch: {
      path: string[]
      isExact: boolean
      matchLength: number
    } | null = null
    for (const item of menuItems) {
      // 先尝试精确匹配
      if (item.pathUrl === normalizedPath) {
        // 找到精确匹配，直接返回（精确匹配优先级最高）
        return {
          path: [...parentCodes, item.code],
          isExact: true,
          matchLength: item.pathUrl.length,
        }
      }
      // 检查是否是前缀匹配（支持子路由）
      if (item.pathUrl
        && (normalizedPath.startsWith(`${item.pathUrl}/`)
          || normalizedPath.startsWith(`${item.pathUrl}?`))) {
        // 选择最长的匹配路径（更精确）
        const currentPath = [...parentCodes, item.code]
        if (!bestMatch || item.pathUrl.length > bestMatch.matchLength) {
          bestMatch = {
            path: currentPath,
            isExact: false,
            matchLength: item.pathUrl.length,
          }
        }
      }
      // 递归查找子菜单
      if (item.children && item.children.length > 0) {
        const found = findMenuPathByUrl(item.children, normalizedPath, [...parentCodes, item.code])
        // 如果子菜单中找到精确匹配，直接返回
        if (found && found.isExact) {
          return found
        }
        // 如果是前缀匹配，更新最佳匹配（选择最长的）
        if (found && (!bestMatch || found.matchLength > bestMatch.matchLength)) {
          bestMatch = found
        }
      }
    }
    // 返回最佳匹配（可能是前缀匹配）
    return bestMatch
  }, [])
  /**
   * 根据路径确定当前选中的菜单项
   * 基于菜单数据结构动态查找，避免硬编码
   */
  const getSelectedKey = useCallback((): string[] => {
    // 如果是文档路径，返回空数组避免选中任何菜单项
    if (location.pathname.includes('/docs')) {
      return []
    }
    // 特殊处理：如果是platform-management路径，选中"平台管理员"菜单项
    if (normalizedPath === '/admin/platform-management') {
      return ['platform_admin']
    }
    // 获取用户菜单数据
    const { userMenus: currentUserMenus } = useAuthStore.getState()
    // 如果没有菜单数据，返回默认值
    if (!currentUserMenus?.length) {
      return (normalizedPath === '/home' || normalizedPath === '/') ? ['home'] : []
    }
    // 特殊处理：admin/members 路径也激活项目管理菜单
    if (normalizedPath === '/admin/members') {
      const findAdminProjectMenu = (items: MenuItem[], parentCodes: string[] = []): string[] | null => {
        for (const item of items) {
          if (item.code === 'admin_project') {
            return [...parentCodes, item.code]
          }
          if (item.children?.length) {
            const found = findAdminProjectMenu(item.children, [...parentCodes, item.code])
            if (found)
              return found
          }
        }
        return null
      }
      const adminProjectPath = findAdminProjectMenu(currentUserMenus)
      if (adminProjectPath) {
        return adminProjectPath
      }
    }
    // 在菜单树中查找匹配的菜单项
    const menuMatch = findMenuPathByUrl(currentUserMenus, normalizedPath)
    if (menuMatch?.path.length) {
      return menuMatch.path
    }
    // 如果没找到匹配的菜单项，检查是否是首页
    if (normalizedPath === '/home' || normalizedPath === '/') {
      const findHomeMenu = (items: MenuItem[], parentCodes: string[] = []): string[] | null => {
        for (const item of items) {
          if (item.code === 'home') {
            return [...parentCodes, item.code]
          }
          if (item.children?.length) {
            const found = findHomeMenu(item.children, [...parentCodes, item.code])
            if (found)
              return found
          }
        }
        return null
      }
      return findHomeMenu(currentUserMenus) || ['home']
    }
    return []
  }, [findMenuPathByUrl, location.pathname, normalizedPath])
  const collectMenuCodes = (menuItems: MenuItem[]): Set<string> => {
    const codeSet = new Set<string>()
    const traverse = (items: MenuItem[]) => {
      items.forEach((item) => {
        codeSet.add(item.code)
        if (item.children?.length) {
          traverse(item.children)
        }
      })
    }
    traverse(menuItems)
    return codeSet
  }
  const selectedKeys = useMemo(() => {
    const visibleCodeSet = collectMenuCodes(currentSiderMenus)
    const selectedKeyPath = getSelectedKey().filter((key) => visibleCodeSet.has(key))
    return selectedKeyPath.length ? [selectedKeyPath[selectedKeyPath.length - 1]] : []
  }, [currentSiderMenus, getSelectedKey])
  useEffect(() => {
    if (menuLoadError)
      return
    if (!currentSiderMenus.length) {
      setOpenKeys([])
      return
    }
    if (selectedKeys.length > 0) {
      const targetCode = selectedKeys[selectedKeys.length - 1]
      const parentCodes = findParentMenuCodes(currentSiderMenus, targetCode, [])
      setOpenKeys(parentCodes?.length ? parentCodes : [])
      return
    }
    setOpenKeys([])
  }, [currentSiderMenus, findParentMenuCodes, menuLoadError, selectedKeys])
  const handlePrimaryMenuClick = useCallback<NonNullable<MenuProps['onClick']>>(({ key }) => {
    if (key === activePrimaryKey)
      return
    const targetPath = key === 'system'
      ? (systemSecondaryGroups[0]?.targetPath ?? '/project/admin/platform-management')
      : '/home'
    if (targetPath) {
      navigate(targetPath)
    }
  }, [activePrimaryKey, navigate, systemSecondaryGroups])
  const handleSecondaryMenuClick = useCallback<NonNullable<MenuProps['onClick']>>(({ key }) => {
    const targetGroup = secondaryNavItems.find((item) => item.key === key)
    if (targetGroup?.targetPath) {
      navigate(targetGroup.targetPath, activePrimaryKey === 'workspace'
        ? { state: { workspaceRootCode: activeWorkspaceRootCode } }
        : undefined)
    }
  }, [activePrimaryKey, activeWorkspaceRootCode, navigate, secondaryNavItems])
  const renderHeaderNav = (items: HeaderNavItem[], selectedKey: string | undefined, onClick: (key: string) => void) => (
    <div className="project-header-nav">
      {items.map((item) => {
        const selected = item.key === selectedKey
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onClick(item.key)}
            className={[
              'project-header-nav-btn',
              selected ? 'project-header-nav-btn-active' : '',
            ].join(' ')}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
  const shouldShowSider = !isStandaloneApiAccessKeyPage && (isProjectDetailPage || activePrimaryKey === 'system')
  let headerContent: React.ReactNode = null
  if (!isStandaloneApiAccessKeyPage) {
    headerContent = isProjectDetailPage
      ? (
          <div className="flex h-[60px] w-full min-w-0 items-center gap-x-5">
            <div className="project-header-selector-wrap flex shrink-0 items-center justify-start">
              {projectSelector}
            </div>
            <div className="project-header-nav-wrap flex flex-1 basis-0 items-center justify-center overflow-hidden">
              {renderHeaderNav(secondaryNavItems.map((item) => ({ key: item.key, label: item.label })), activeSecondaryKey, (key) => handleSecondaryMenuClick({ key } as Parameters<NonNullable<MenuProps['onClick']>>[0]))}
            </div>
          </div>
        )
      : (
          <div className="flex h-[60px] w-full items-center justify-center">
            {renderHeaderNav(PRIMARY_NAV_ITEMS.map((item) => ({ key: item.key, label: item.label })), activePrimaryKey, (key) => handlePrimaryMenuClick({ key } as Parameters<NonNullable<MenuProps['onClick']>>[0]))}
          </div>
        )
  }
  const injectedHeaderItems = useMemo<InjectedHeaderNavItem[]>(() => {
    if (isStandaloneApiAccessKeyPage)
      return []

    if (isProjectDetailPage) {
      return secondaryNavItems.map((item) => ({
        key: item.key,
        label: item.label,
        onClick: () => handleSecondaryMenuClick({ key: item.key } as Parameters<NonNullable<MenuProps['onClick']>>[0]),
      }))
    }

    return PRIMARY_NAV_ITEMS.map((item) => ({
      key: item.key,
      label: item.label,
      onClick: () => handlePrimaryMenuClick({ key: item.key } as Parameters<NonNullable<MenuProps['onClick']>>[0]),
    }))
  }, [handlePrimaryMenuClick, handleSecondaryMenuClick, isProjectDetailPage, isStandaloneApiAccessKeyPage, secondaryNavItems])
  const injectedHeaderSelectedKey = isProjectDetailPage ? activeSecondaryKey : activePrimaryKey
  useEffect(() => {
    const cleanupInjectedHeader = () => {
      document.querySelectorAll('[data-lab-injected-header-nav]').forEach((slot) => slot.remove())
      document.querySelectorAll('[data-lab-injected-project-selector]').forEach((slot) => slot.remove())
      document.querySelectorAll('[data-lab-injected-header-nav-container]').forEach((slot) => slot.remove())
      injectedHeaderSlotsRef.current.forEach((slot) => slot.remove())
      injectedHeaderSlotsRef.current = []
      injectedProjectSelectorSlotRef.current?.remove()
      injectedProjectSelectorSlotRef.current = null
      injectedHeaderNavContainerRef.current?.remove()
      injectedHeaderNavContainerRef.current = null
      if (injectedHeaderMenuStyleRef.current) {
        const { element, display, justifyContent, alignItems, gap, width, position, height, boxSizing, overflow, paddingLeft, paddingRight, fontSize, lineHeight } = injectedHeaderMenuStyleRef.current
        element.style.display = display
        element.style.justifyContent = justifyContent
        element.style.alignItems = alignItems
        element.style.gap = gap
        element.style.width = width
        element.style.position = position
        element.style.height = height
        element.style.boxSizing = boxSizing
        element.style.overflow = overflow
        element.style.paddingLeft = paddingLeft
        element.style.paddingRight = paddingRight
        // element.style.minHeight = minHeight
        element.style.fontSize = fontSize
        element.style.lineHeight = lineHeight
        injectedHeaderMenuStyleRef.current = null
      }
      if (injectedHeaderStyleRef.current) {
        const { element, background, backgroundColor, border, borderBottom, boxShadow, height, lineHeight } = injectedHeaderStyleRef.current
        element.style.background = background
        element.style.backgroundColor = backgroundColor
        element.style.border = border
        element.style.borderBottom = borderBottom
        element.style.boxShadow = boxShadow
        element.style.height = height
        // element.style.minHeight = minHeight
        element.style.lineHeight = lineHeight
        injectedHeaderStyleRef.current = null
      }
      setInjectedHeaderSlots([])
      setInjectedProjectSelectorSlot(null)
    }

    if (!isQiankun || injectedHeaderItems.length === 0) {
      cleanupInjectedHeader()
      return cleanupInjectedHeader
    }

    let observer: MutationObserver | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const mountInjectedHeader = () => {
      const headerMenu = document.querySelector('header ul') as HTMLElement | null
      if (!headerMenu)
        return false

      cleanupInjectedHeader()

      const headerElement = headerMenu.closest('header') as HTMLElement | null
      if (headerElement) {
        injectedHeaderStyleRef.current = {
          element: headerElement,
          background: headerElement.style.background,
          backgroundColor: headerElement.style.backgroundColor,
          border: headerElement.style.border,
          borderBottom: headerElement.style.borderBottom,
          boxShadow: headerElement.style.boxShadow,
          height: headerElement.style.height,
          // minHeight: headerElement.style.minHeight,
          lineHeight: headerElement.style.lineHeight,
        }
        headerElement.style.background = 'rgba(248, 249, 250, 1)'
        headerElement.style.backgroundColor = 'rgba(248, 249, 250, 1)'
        headerElement.style.border = 'none'
        headerElement.style.borderBottom = 'none'
        headerElement.style.boxShadow = 'none'
        // headerElement.style.minHeight = '60px'
        headerElement.style.lineHeight = '60px'
      }

      injectedHeaderMenuStyleRef.current = {
        element: headerMenu,
        display: headerMenu.style.display,
        justifyContent: headerMenu.style.justifyContent,
        alignItems: headerMenu.style.alignItems,
        gap: headerMenu.style.gap,
        width: headerMenu.style.width,
        position: headerMenu.style.position,
        height: headerMenu.style.height,
        boxSizing: headerMenu.style.boxSizing,
        overflow: headerMenu.style.overflow,
        paddingLeft: headerMenu.style.paddingLeft,
        paddingRight: headerMenu.style.paddingRight,
        // minHeight: headerMenu.style.minHeight,
        fontSize: headerMenu.style.fontSize,
        lineHeight: headerMenu.style.lineHeight,
      }
      headerMenu.style.display = 'flex'
      headerMenu.style.justifyContent = 'center'
      headerMenu.style.alignItems = 'center'
      headerMenu.style.gap = '16px'
      headerMenu.style.width = '100%'
      headerMenu.style.position = headerMenu.style.position || 'relative'
      headerMenu.style.height = '60px'
      headerMenu.style.boxSizing = 'border-box'
      headerMenu.style.overflow = 'hidden'
      headerMenu.style.paddingLeft = '0'
      headerMenu.style.paddingRight = '0'
      // headerMenu.style.minHeight = '60px'
      headerMenu.style.fontSize = '14px'
      headerMenu.style.lineHeight = '20px'

      if (isProjectDetailPage) {
        const projectSelectorSlot = document.createElement('li')
        projectSelectorSlot.dataset.labInjectedProjectSelector = 'true'
        projectSelectorSlot.style.position = 'absolute'
        projectSelectorSlot.style.left = '0'
        projectSelectorSlot.style.top = '0'
        projectSelectorSlot.style.display = 'inline-flex'
        projectSelectorSlot.style.alignItems = 'center'
        projectSelectorSlot.style.height = '60px'
        projectSelectorSlot.style.minWidth = `${PROJECT_SELECTOR_RESERVED_WIDTH}px`
        projectSelectorSlot.style.zIndex = '2'
        projectSelectorSlot.style.fontSize = '14px'
        projectSelectorSlot.style.lineHeight = '20px'
        projectSelectorSlot.style.listStyle = 'none'
        headerMenu.appendChild(projectSelectorSlot)
        injectedProjectSelectorSlotRef.current = projectSelectorSlot
        setInjectedProjectSelectorSlot(projectSelectorSlot)
      }

      const headerNavContainer = document.createElement('li')
      headerNavContainer.dataset.labInjectedHeaderNavContainer = 'true'
      headerNavContainer.style.position = isProjectDetailPage ? 'absolute' : 'static'
      headerNavContainer.style.left = isProjectDetailPage ? `${PROJECT_SELECTOR_RESERVED_WIDTH}px` : ''
      headerNavContainer.style.right = isProjectDetailPage ? '0' : ''
      headerNavContainer.style.top = isProjectDetailPage ? '0' : ''
      headerNavContainer.style.display = 'flex'
      headerNavContainer.style.justifyContent = 'center'
      headerNavContainer.style.alignItems = 'center'
      headerNavContainer.style.gap = '16px'
      headerNavContainer.style.height = '60px'
      headerNavContainer.style.minWidth = '0'
      headerNavContainer.style.overflow = 'hidden'
      headerNavContainer.style.listStyle = 'none'
      headerNavContainer.style.zIndex = '1'
      headerMenu.appendChild(headerNavContainer)
      injectedHeaderNavContainerRef.current = headerNavContainer

      const slots = injectedHeaderItems.map((item) => {
        const slot = document.createElement('span')
        slot.dataset.labInjectedHeaderNav = item.key
        slot.style.display = 'inline-flex'
        slot.style.flexShrink = '0'
        slot.style.alignItems = 'center'
        slot.style.height = '60px'
        slot.style.fontSize = '14px'
        slot.style.lineHeight = '20px'
        headerNavContainer.appendChild(slot)
        return slot
      })

      injectedHeaderSlotsRef.current = slots
      setInjectedHeaderSlots(slots)
      return true
    }

    if (!mountInjectedHeader()) {
      observer = new MutationObserver(() => {
        if (mountInjectedHeader()) {
          observer?.disconnect()
          observer = null
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
      retryTimer = setTimeout(() => {
        observer?.disconnect()
        observer = null
      }, 5000)
    }

    return () => {
      observer?.disconnect()
      if (retryTimer)
        clearTimeout(retryTimer)
      cleanupInjectedHeader()
    }
  }, [injectedHeaderItems, isProjectDetailPage, isQiankun])
  // 如果菜单加载失败，显示错误页面（须放在所有 Hook 之后，避免条件调用 Hook）
  if (menuLoadError) {
    return (<MenuErrorFallback error={menuLoadError} />)
  }
  // 样式常量
  // 在 qiankun 或无界子应用模式下使用容器高度（--mfe-height 或 100%），避免溢出被裁剪
  const layoutHeight = (isQiankun || isWujie) ? 'var(--mfe-height, 100%)' : 'calc(100vh - 60px)'
  // 子应用嵌入时需 minHeight: 0 以便在 flex 容器内正确收缩，防止菜单等被溢出裁剪
  const innerLayoutMinHeight = (isQiankun || isWujie) ? 0 : layoutHeight
  // 主应用布局
  return (
    <>
      {isQiankun && injectedHeaderSlots.map((slot, index) => {
        const item = injectedHeaderItems[index]
        if (!item)
          return null

        const selected = item.key === injectedHeaderSelectedKey
        return createPortal(
          <button
            type="button"
            onClick={item.onClick}
            className={[
              'project-header-nav-btn',
              'project-header-nav-btn-compact',
              selected ? 'project-header-nav-btn-active' : '',
            ].join(' ')}
          >
            {item.label}
          </button>,
          slot,
          item.key,
        )
      })}
      {isQiankun && injectedProjectSelectorSlot && isProjectDetailPage && createPortal(
        <div className="flex h-full items-center gap-2">
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            className="project-header-back-btn"
            onClick={() => navigate('/home')}
          />
          {projectSelector}
        </div>,
        injectedProjectSelectorSlot,
      )}

      <MainLayout headerContent={headerContent}>
        <Layout className="flex" style={{ height: layoutHeight, minHeight: innerLayoutMinHeight }}>
          {shouldShowSider && (
            <Sider ref={siderRef} width={170} trigger={null} className="project-visual-sider">
              <div className="project-menu-scroll-container hide-scrollbar overflow-y-auto overflow-x-hidden flex-1 min-h-0">
                <Menu className="project-menu-no-animation pb-[16px]" mode="inline" selectedKeys={selectedKeys} openKeys={openKeys} onOpenChange={onOpenChange} items={getMenuItems()} />
                {!isProjectDetailPage && activePrimaryKey === 'workspace' && isNonAdminWithNoProject && !projectListLoading && (
                  <div className="px-2 pb-2">
                    <Alert message="当前无项目" description={!isAdmin ? '请联系管理员' : '请先新建项目'} type="warning" showIcon className="text-[12px]" />
                  </div>
                )}
              </div>
            </Sider>
          )}
          <Layout
            id="project-layout-scroll-container"
            className="hide-scrollbar h-full flex-1 overflow-auto px-0 pb-0 project-layout-surface"
          >
            <Content className="project-content-surface">
              <Suspense fallback={(
                <div className="project-loading-fallback">
                  <Spin tip={t('common.loading')} size="large" />
                </div>
              )}
              >
                <Outlet />
                {children}
              </Suspense>
            </Content>
          </Layout>
        </Layout>
      </MainLayout>
    </>
  )
}
export default ProjectLayout
