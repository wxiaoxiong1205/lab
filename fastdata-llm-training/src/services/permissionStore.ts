import { useSyncExternalStore } from 'react'
import {
  ALL_MENU_PERMISSION_KEYS,
  ALL_OPERATION_KEYS,
  OPERATION_DEFINITION_MAP,
  findPermissionNodeLabel,
  MENU_PERMISSION_TREE,
  resolveRouteAccess,
} from './permissionCatalog'

export type RoleKey = 'platform_admin' | 'project_admin' | 'training_engineer'

export interface PermissionRole {
  key: RoleKey
  name: string
  lockedName: boolean
  lockedOperations: boolean
  menuPermissions: string[]
  operationPermissions: string[]
}

export interface PermissionUser {
  account: string
  username: string
  roleKey: RoleKey
  roleKeys: RoleKey[]
}

export interface ProjectPermissionMember {
  account: string
  roleKey: RoleKey
  hasDataPermission: boolean
}

export interface PermissionProject {
  id: string
  name: string
  description: string
  cluster: string
  createdAt: string
  members: ProjectPermissionMember[]
}

export interface PermissionState {
  currentUserAccount: string
  currentProjectId: string | null
  users: PermissionUser[]
  roles: PermissionRole[]
  projects: PermissionProject[]
}

export type OperationDenyReason = 'no-menu' | 'no-operation' | 'no-project'

const STORAGE_KEY = 'lab-coding:permission-store:v1'

const projectAdminMenuPermissions = [
  '/workspace',
  '/home',
  '/datasets',
  '/measurement',
  '/inference',
  '/data-annotation',
  '/data-cleaning',
  '/finetune/notebooks',
  '/training',
  '/model',
  '/effect-evaluation',
  '/evaluation-indicator',
  '/service/inference/hosted',
  '/service/inference/external',
  '/machine-data-management',
  '/machine-annotation',
  '/machine-model-management',
  '/machine-model-deployment',
  '/machine-notebook',
  '/machine-annotation-service',
  '/admin/projects',
] as const

const trainingEngineerMenuPermissions = [
  '/workspace',
  '/home',
  '/datasets',
  '/measurement',
  '/inference',
  '/data-annotation',
  '/data-cleaning',
  '/finetune/notebooks',
  '/training',
  '/model',
  '/effect-evaluation',
  '/evaluation-indicator',
  '/service/inference/hosted',
  '/service/inference/external',
  '/machine-data-management',
  '/machine-annotation',
  '/machine-model-management',
  '/machine-model-deployment',
  '/machine-notebook',
  '/machine-annotation-service',
] as const

const seedRoles: PermissionRole[] = [
  {
    key: 'platform_admin',
    name: '平台管理员',
    lockedName: true,
    lockedOperations: true,
    menuPermissions: ALL_MENU_PERMISSION_KEYS,
    operationPermissions: ALL_OPERATION_KEYS,
  },
  {
    key: 'project_admin',
    name: '项目管理员',
    lockedName: true,
    lockedOperations: true,
    menuPermissions: [...projectAdminMenuPermissions],
    operationPermissions: [
      ...ALL_OPERATION_KEYS.filter(
        key =>
          !key.startsWith('admin.') &&
          !key.startsWith('home.') &&
          !key.startsWith('evaluation-indicator.'),
      ),
      'home.view',
      'evaluation-indicator.detail',
      'admin.project.members',
    ],
  },
  {
    key: 'training_engineer',
    name: '训练工程师',
    lockedName: true,
    lockedOperations: true,
    menuPermissions: [...trainingEngineerMenuPermissions],
    operationPermissions: ALL_OPERATION_KEYS.filter(key =>
      trainingEngineerMenuPermissions.includes(OPERATION_DEFINITION_MAP[key]?.menuKey as (typeof trainingEngineerMenuPermissions)[number]),
    ),
  },
]

const seedUsers: PermissionUser[] = [
  { account: 'zhangsan', username: '张三', roleKey: 'platform_admin', roleKeys: ['platform_admin'] },
  { account: 'lisi', username: '李四', roleKey: 'project_admin', roleKeys: ['project_admin', 'training_engineer'] },
  { account: 'wangwu', username: '王五', roleKey: 'training_engineer', roleKeys: ['training_engineer'] },
]

const seedProjects: PermissionProject[] = [
  {
    id: 'project-1',
    name: 'V1.12测试项目',
    description: '',
    cluster: 'V1.12版本集群',
    createdAt: '2026/3/23 15:43:58',
    members: [
      { account: 'zhangsan', roleKey: 'platform_admin', hasDataPermission: true },
      { account: 'lisi', roleKey: 'project_admin', hasDataPermission: true },
      { account: 'wangwu', roleKey: 'training_engineer', hasDataPermission: true },
    ],
  },
  {
    id: 'project-2',
    name: 'demo',
    description: '1卡',
    cluster: '测试环境集群12',
    createdAt: '2025/12/10 22:08:35',
    members: [
      { account: 'zhangsan', roleKey: 'platform_admin', hasDataPermission: true },
      { account: 'lisi', roleKey: 'project_admin', hasDataPermission: false },
      { account: 'wangwu', roleKey: 'training_engineer', hasDataPermission: false },
    ],
  },
]

const seedState: PermissionState = {
  currentUserAccount: 'zhangsan',
  currentProjectId: null,
  users: seedUsers,
  roles: seedRoles,
  projects: seedProjects,
}

let state: PermissionState = loadState()

const listeners = new Set<() => void>()

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function loadState(): PermissionState {
  if (typeof window === 'undefined') {
    return cloneState(seedState)
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return cloneState(seedState)
  }

  try {
    const parsed = JSON.parse(raw) as PermissionState
    return {
      ...parsed,
      users: parsed.users.map(user => ({
        ...user,
        roleKeys: user.roleKeys?.length ? user.roleKeys : [user.roleKey],
      })),
    }
  } catch {
    return cloneState(seedState)
  }
}

function persistState(nextState: PermissionState) {
  state = nextState
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState))
  }
  listeners.forEach(listener => listener())
}

function getRole(roleKey: RoleKey, sourceState = state): PermissionRole {
  return sourceState.roles.find(item => item.key === roleKey) ?? seedRoles[0]
}

export function getPermissionState(): PermissionState {
  return state
}

export function subscribePermissionStore(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePermissionStore(): PermissionState {
  return useSyncExternalStore(subscribePermissionStore, getPermissionState, getPermissionState)
}

export function getCurrentUser(sourceState = state): PermissionUser {
  return sourceState.users.find(item => item.account === sourceState.currentUserAccount) ?? sourceState.users[0]
}

export function getUserByAccount(account: string, sourceState = state): PermissionUser | null {
  return sourceState.users.find(item => item.account === account) ?? null
}

export function getCurrentProjectMember(sourceState = state, projectId?: string | null): ProjectPermissionMember | null {
  const currentUser = getCurrentUser(sourceState)
  const targetProjectId = projectId ?? sourceState.currentProjectId
  if (!targetProjectId) {
    return null
  }

  const project = sourceState.projects.find(item => item.id === targetProjectId)
  return project?.members.find(member => member.account === currentUser.account) ?? null
}

export function getCurrentRole(sourceState = state): PermissionRole {
  const currentUser = getCurrentUser(sourceState)
  if (currentUser.roleKeys.includes('platform_admin')) {
    return getRole('platform_admin', sourceState)
  }

  const projectMember = getCurrentProjectMember(sourceState)
  return getRole(projectMember?.roleKey ?? currentUser.roleKey, sourceState)
}

export function hasMenuPermission(menuKey: string, sourceState = state): boolean {
  return getCurrentRole(sourceState).menuPermissions.includes(menuKey)
}

export function getAccessibleProjects(sourceState = state): PermissionProject[] {
  const currentUser = getCurrentUser(sourceState)
  if (currentUser.roleKeys.includes('platform_admin')) {
    return sourceState.projects
  }

  return sourceState.projects.filter(project =>
    project.members.some(member => member.account === currentUser.account && member.hasDataPermission),
  )
}

export function getCurrentProject(sourceState = state): PermissionProject | null {
  if (!sourceState.currentProjectId) {
    return null
  }
  const accessibleProjects = getAccessibleProjects(sourceState)
  return accessibleProjects.find(item => item.id === sourceState.currentProjectId) ?? accessibleProjects[0] ?? null
}

export function canViewCurrentRoute(pathname: string, sourceState = state): { allowed: boolean; reason?: OperationDenyReason } {
  const route = resolveRouteAccess(pathname)
  if (!route) {
    return { allowed: true }
  }

  if (!hasMenuPermission(route.menuKey, sourceState)) {
    return { allowed: false, reason: 'no-menu' }
  }

  if (route.requiresProject && !getCurrentProject(sourceState)) {
    return { allowed: false, reason: 'no-project' }
  }

  return { allowed: true }
}

export function canRunOperation(
  operationKey: string,
  options?: { projectId?: string | null },
  sourceState = state,
): { allowed: boolean; reason?: OperationDenyReason } {
  const definition = OPERATION_DEFINITION_MAP[operationKey]
  if (!definition) {
    return { allowed: true }
  }

  if (!hasMenuPermission(definition.menuKey, sourceState)) {
    return { allowed: false, reason: 'no-menu' }
  }

  if (!getCurrentRole(sourceState).operationPermissions.includes(operationKey)) {
    return { allowed: false, reason: 'no-operation' }
  }

  if (definition.requiresProject) {
    const projectId = options?.projectId ?? getCurrentProject(sourceState)?.id ?? null
    const currentUser = getCurrentUser(sourceState)
    if (!currentUser.roleKeys.includes('platform_admin')) {
      const targetProject = sourceState.projects.find(item => item.id === projectId)
      const hasPermission = Boolean(
        targetProject?.members.some(member => member.account === currentUser.account && member.hasDataPermission),
      )
      if (!hasPermission) {
        return { allowed: false, reason: 'no-project' }
      }
    }
  }

  return { allowed: true }
}

export function getOperationDeniedMessage(reason?: OperationDenyReason): string {
  if (reason === 'no-operation') {
    return '无操作权限'
  }
  if (reason === 'no-project') {
    return '无项目权限'
  }
  if (reason === 'no-menu') {
    return '无菜单权限'
  }
  return '无权限'
}

export function setCurrentUser(account: string) {
  const nextState = cloneState(state)
  nextState.currentUserAccount = account
  nextState.currentProjectId = null
  persistState(nextState)
}

export function setCurrentProject(projectId: string | null) {
  const nextState = cloneState(state)
  nextState.currentProjectId = projectId
  persistState(nextState)
}

export function createProject(input: { name: string; description: string; cluster: string }) {
  const nextState = cloneState(state)
  const currentUser = getCurrentUser(nextState)
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const createdAt = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

  const project: PermissionProject = {
    id: `project-${Date.now()}`,
    name: input.name,
    description: input.description,
    cluster: input.cluster,
    createdAt,
    members: [
      {
        account: currentUser.account,
        roleKey: currentUser.roleKeys.includes('platform_admin') ? 'platform_admin' : currentUser.roleKey,
        hasDataPermission: true,
      },
    ],
  }

  nextState.projects.unshift(project)
  persistState(nextState)
}

export function deleteProject(projectId: string) {
  const nextState = cloneState(state)
  nextState.projects = nextState.projects.filter(project => project.id !== projectId)
  if (nextState.currentProjectId === projectId) {
    nextState.currentProjectId = null
  }
  persistState(nextState)
}

export function updateProjectMembers(projectId: string, members: ProjectPermissionMember[]) {
  const nextState = cloneState(state)
  nextState.projects = nextState.projects.map(project => {
    if (project.id !== projectId) {
      return project
    }

    return {
      ...project,
      members: members.map(member => ({
        ...member,
        hasDataPermission: member.roleKey === 'platform_admin' ? true : member.hasDataPermission,
      })),
    }
  })

  const currentProject = getCurrentProject(nextState)
  nextState.currentProjectId = currentProject?.id ?? null
  persistState(nextState)
}

export function addProjectMember(
  projectId: string,
  member: { account: string; roleKey: RoleKey; hasDataPermission: boolean },
) {
  const nextState = cloneState(state)
  nextState.projects = nextState.projects.map(project => {
    if (project.id !== projectId) {
      return project
    }

    const user = getUserByAccount(member.account, nextState)
    const normalizedMember: ProjectPermissionMember = {
      account: member.account,
      roleKey: member.roleKey,
      hasDataPermission: member.roleKey === 'platform_admin' ? true : member.hasDataPermission,
    }

    if (user && !user.roleKeys.includes(member.roleKey)) {
      return project
    }

    const existingIndex = project.members.findIndex(item => item.account === member.account)
    if (existingIndex >= 0) {
      const nextMembers = [...project.members]
      nextMembers[existingIndex] = normalizedMember
      return { ...project, members: nextMembers }
    }

    return {
      ...project,
      members: [...project.members, normalizedMember],
    }
  })

  persistState(nextState)
}

export function getRoleLabel(roleKey: RoleKey, sourceState = state): string {
  return getRole(roleKey, sourceState).name
}

export function getUserRoleLabels(account: string, sourceState = state): string[] {
  const user = getUserByAccount(account, sourceState)
  if (!user) {
    return []
  }

  return user.roleKeys.map(roleKey => getRoleLabel(roleKey, sourceState))
}

export function getMenuLabel(menuKey: string): string {
  return findPermissionNodeLabel(MENU_PERMISSION_TREE, menuKey) ?? menuKey
}
