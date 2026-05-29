import { useSyncExternalStore } from 'react'
import {
  ALL_MENU_PERMISSION_KEYS,
  ALL_OPERATION_KEYS,
  OPERATION_DEFINITION_MAP,
  findPermissionNodeLabel,
  MENU_PERMISSION_TREE,
  resolveRouteAccess,
} from './permissionCatalog'

export type RoleKey = string
export type DataPermissionDomain = 'llm' | 'machine' | 'system'

export const TENANT_ADMIN_ROLE_KEY = 'platform_admin'
export const BUILT_IN_ROLE_KEYS = ['platform_admin', 'project_admin', 'training_engineer'] as const
export const VISIBLE_BUILT_IN_ROLE_KEYS = ['platform_admin', 'project_admin', 'training_engineer'] as const
export const DATA_PERMISSION_DOMAINS: Array<{ key: DataPermissionDomain; label: string }> = [
  { key: 'llm', label: '大模型' },
  { key: 'machine', label: '机器学习' },
  { key: 'system', label: '系统管理' },
]

export type RoleDataPermissions = Record<DataPermissionDomain, { all: boolean }>

export interface PermissionRole {
  key: RoleKey
  name: string
  lockedName: boolean
  lockedOperations: boolean
  hidden?: boolean
  menuPermissions: string[]
  operationPermissions: string[]
  dataPermissions: RoleDataPermissions
}

export interface PermissionUser {
  account: string
  username: string
  email?: string
  roleKey: RoleKey
  roleKeys: RoleKey[]
}

export interface ProjectPermissionMember {
  account: string
  roleKey: RoleKey
  hasDataPermission?: boolean
  joinedAt?: string
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
  currentProjectMode: 'llm' | 'ml'
  users: PermissionUser[]
  roles: PermissionRole[]
  projects: PermissionProject[]
}

export type OperationDenyReason = 'no-menu' | 'no-operation' | 'no-project' | 'no-data'

const STORAGE_KEY = 'lab-coding:permission-store:v1'

const personalOnlyDataPermissions: RoleDataPermissions = {
  llm: { all: false },
  machine: { all: false },
  system: { all: false },
}

const allDataPermissions: RoleDataPermissions = {
  llm: { all: true },
  machine: { all: true },
  system: { all: true },
}

const projectAdminMenuPermissions = [
  '/workspace',
  '/task-overview',
  '/datasets',
  '/measurement',
  '/file-management',
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
  '/task-overview',
  '/datasets',
  '/measurement',
  '/file-management',
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
    hidden: false,
    menuPermissions: ALL_MENU_PERMISSION_KEYS,
    operationPermissions: ALL_OPERATION_KEYS,
    dataPermissions: allDataPermissions,
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
          !key.startsWith('task-overview.') &&
          !key.startsWith('evaluation-indicator.'),
      ),
      'task-overview.view',
      'evaluation-indicator.detail',
      'admin.project.members',
    ],
    dataPermissions: personalOnlyDataPermissions,
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
    dataPermissions: personalOnlyDataPermissions,
  },
  {
    key: 'external_data_steward',
    name: '数据治理员',
    lockedName: true,
    lockedOperations: false,
    menuPermissions: [
      '/workspace',
      '/task-overview',
      '/datasets',
      '/measurement',
      '/file-management',
      '/inference',
      '/data-annotation',
      '/data-cleaning',
    ],
    operationPermissions: ALL_OPERATION_KEYS.filter(key =>
      ['/task-overview', '/datasets', '/measurement', '/file-management', '/inference', '/data-annotation', '/data-cleaning'].includes(
        OPERATION_DEFINITION_MAP[key]?.menuKey ?? '',
      ),
    ),
    dataPermissions: {
      llm: { all: true },
      machine: { all: false },
      system: { all: false },
    },
  },
  {
    key: 'external_model_reviewer',
    name: '模型评估员',
    lockedName: true,
    lockedOperations: false,
    menuPermissions: [
      '/workspace',
      '/task-overview',
      '/model',
      '/effect-evaluation',
      '/evaluation-indicator',
      '/service/inference/hosted',
      '/service/inference/external',
    ],
    operationPermissions: ALL_OPERATION_KEYS.filter(key =>
      ['/task-overview', '/model', '/effect-evaluation', '/evaluation-indicator', '/service/inference/hosted', '/service/inference/external'].includes(
        OPERATION_DEFINITION_MAP[key]?.menuKey ?? '',
      ),
    ),
    dataPermissions: {
      llm: { all: false },
      machine: { all: false },
      system: { all: false },
    },
  },
  {
    key: 'external_ml_admin',
    name: '机器学习管理员',
    lockedName: true,
    lockedOperations: false,
    menuPermissions: [
      '/workspace',
      '/task-overview',
      '/machine-data-management',
      '/machine-annotation',
      '/machine-model-management',
      '/machine-model-deployment',
      '/machine-notebook',
      '/machine-annotation-service',
    ],
    operationPermissions: ALL_OPERATION_KEYS.filter(key =>
      [
        '/task-overview',
        '/machine-data-management',
        '/machine-annotation',
        '/machine-model-management',
        '/machine-model-deployment',
        '/machine-notebook',
        '/machine-annotation-service',
      ].includes(OPERATION_DEFINITION_MAP[key]?.menuKey ?? ''),
    ),
    dataPermissions: {
      llm: { all: false },
      machine: { all: true },
      system: { all: false },
    },
  },
  {
    key: 'external_readonly_auditor',
    name: '只读审计员',
    lockedName: true,
    lockedOperations: false,
    menuPermissions: [
      '/workspace',
      '/task-overview',
      '/datasets',
      '/measurement',
      '/file-management',
      '/inference',
      '/effect-evaluation',
      '/machine-data-management',
      '/admin/projects',
    ],
    operationPermissions: ALL_OPERATION_KEYS.filter(key => {
      const definition = OPERATION_DEFINITION_MAP[key]
      return (
        ['/task-overview', '/datasets', '/measurement', '/file-management', '/inference', '/effect-evaluation', '/machine-data-management', '/admin/projects'].includes(
          definition?.menuKey ?? '',
        ) && (definition?.label.includes('查看') || definition?.label.includes('详情'))
      )
    }),
    dataPermissions: {
      llm: { all: true },
      machine: { all: true },
      system: { all: false },
    },
  },
]

const seedUsers: PermissionUser[] = [
  { account: 'zhangsan', username: '张三', email: 'z****@deepexilab.com', roleKey: 'platform_admin', roleKeys: ['platform_admin'] },
  { account: 'lisi', username: '李四', email: 'l****@deepexilab.com', roleKey: 'project_admin', roleKeys: ['project_admin', 'training_engineer', 'external_data_steward'] },
  { account: 'wangwu', username: '王五', email: 'w****@deepexilab.com', roleKey: 'training_engineer', roleKeys: ['training_engineer', 'external_model_reviewer', 'external_ml_admin'] },
]

const seedProjects: PermissionProject[] = [
  {
    id: 'project-1',
    name: 'V1.12测试项目',
    description: '',
    cluster: 'V1.12版本集群',
    createdAt: '2026/3/23 15:43:58',
    members: [
      { account: 'lisi', roleKey: 'project_admin', joinedAt: '2026/03/23 15:43:58' },
      { account: 'wangwu', roleKey: 'training_engineer', joinedAt: '2026/03/23 15:43:58' },
    ],
  },
  {
    id: 'project-2',
    name: 'demo',
    description: '1卡',
    cluster: '测试环境集群12',
    createdAt: '2025/12/10 22:08:35',
    members: [
      { account: 'lisi', roleKey: 'project_admin', joinedAt: '2025/12/10 22:08:35' },
    ],
  },
]

const seedState: PermissionState = {
  currentUserAccount: 'zhangsan',
  currentProjectId: null,
  currentProjectMode: 'llm',
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
    const parsedRoles = parsed.roles?.length ? parsed.roles : seedRoles
    const migratedRoleMap = new Map(seedRoles.map(role => [role.key, cloneState(role)]))
    parsedRoles.forEach(role => {
      const isTenantAdmin = role.key === TENANT_ADMIN_ROLE_KEY
      const seedRole = seedRoles.find(item => item.key === role.key)
      const isBuiltInRole = BUILT_IN_ROLE_KEYS.includes(role.key as (typeof BUILT_IN_ROLE_KEYS)[number])
      migratedRoleMap.set(role.key, {
        ...role,
        name: isTenantAdmin ? '平台管理员' : role.name,
        hidden: isTenantAdmin ? false : role.hidden,
        lockedName: isBuiltInRole ? true : Boolean(role.lockedName),
        lockedOperations: isBuiltInRole ? true : Boolean(role.lockedOperations),
        menuPermissions: uniqueValues(
          [...(isBuiltInRole ? seedRole?.menuPermissions ?? [] : []), ...(role.menuPermissions ?? [])].map(key => (key === '/home' ? '/task-overview' : key)),
        ),
        operationPermissions: uniqueValues(
          [...(isBuiltInRole ? seedRole?.operationPermissions ?? [] : []), ...(role.operationPermissions ?? [])].map(key => (key === 'home.view' ? 'task-overview.view' : key)),
        ),
        dataPermissions: normalizeDataPermissions(isTenantAdmin ? allDataPermissions : role.dataPermissions),
      })
    })
    const migratedRoles = Array.from(migratedRoleMap.values())
    const roleKeys = new Set(migratedRoles.map(role => role.key))
    const users = (parsed.users?.length ? parsed.users : seedUsers).map(user => {
      const roleKeysForUser = (user.roleKeys?.length ? user.roleKeys : [user.roleKey]).filter(roleKey => roleKeys.has(roleKey))
      const normalizedRoleKeys = roleKeysForUser.length ? roleKeysForUser : ['training_engineer']
      return {
        ...user,
        roleKey: normalizedRoleKeys[0],
        roleKeys: normalizedRoleKeys,
      }
    })

    return {
      ...parsed,
      currentProjectMode: parsed.currentProjectMode ?? 'llm',
      roles: migratedRoles,
      users,
      projects: (parsed.projects?.length ? parsed.projects : seedProjects).map(project => ({
        ...project,
        members: project.members
          .filter(member => member.roleKey !== TENANT_ADMIN_ROLE_KEY)
          .filter(member => member.hasDataPermission !== false)
          .filter(member => users.some(user => user.account === member.account && user.roleKeys.includes(member.roleKey)))
          .map(member => ({
            account: member.account,
            roleKey: member.roleKey,
            joinedAt: member.joinedAt,
          })),
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
  return sourceState.roles.find(item => item.key === roleKey) ?? sourceState.roles.find(item => item.key === 'training_engineer') ?? seedRoles[2]
}

function uniqueValues<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

function normalizeDataPermissions(value?: Partial<RoleDataPermissions>): RoleDataPermissions {
  return {
    llm: { all: Boolean(value?.llm?.all) },
    machine: { all: Boolean(value?.machine?.all) },
    system: { all: Boolean(value?.system?.all) },
  }
}

function deriveMenuPermissionsFromOperations(operationPermissions: string[]): string[] {
  return uniqueValues([
    '/workspace',
    ...operationPermissions
      .map(key => OPERATION_DEFINITION_MAP[key]?.menuKey)
      .filter((key): key is string => Boolean(key)),
  ])
}

function isTenantAdmin(user: PermissionUser): boolean {
  return user.roleKeys.includes(TENANT_ADMIN_ROLE_KEY)
}

function mergeRoles(roles: PermissionRole[], key: RoleKey, name: string): PermissionRole {
  return {
    key,
    name,
    lockedName: true,
    lockedOperations: true,
    menuPermissions: uniqueValues(roles.flatMap(role => role.menuPermissions)),
    operationPermissions: uniqueValues(roles.flatMap(role => role.operationPermissions)),
    dataPermissions: {
      llm: { all: roles.some(role => role.dataPermissions.llm.all) },
      machine: { all: roles.some(role => role.dataPermissions.machine.all) },
      system: { all: roles.some(role => role.dataPermissions.system.all) },
    },
  }
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

export function getVisibleRoles(sourceState = state): PermissionRole[] {
  return sourceState.roles.filter(role => !role.hidden)
}

export function getAssignableRolesForUser(account: string, sourceState = state): PermissionRole[] {
  const user = getUserByAccount(account, sourceState)
  if (!user || isTenantAdmin(user)) {
    return []
  }

  return user.roleKeys
    .map(roleKey => getRole(roleKey, sourceState))
    .filter(role => !role.hidden && role.key !== TENANT_ADMIN_ROLE_KEY)
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
  if (isTenantAdmin(currentUser)) {
    return getRole(TENANT_ADMIN_ROLE_KEY, sourceState)
  }

  const projectMember = getCurrentProjectMember(sourceState)
  if (projectMember) {
    return getRole(projectMember.roleKey, sourceState)
  }

  const mergedRoles = currentUser.roleKeys.map(roleKey => getRole(roleKey, sourceState))
  return mergeRoles(mergedRoles, currentUser.roleKey, mergedRoles.map(role => role.name).join(' / '))
}

export function hasMenuPermission(menuKey: string, sourceState = state): boolean {
  return getCurrentRole(sourceState).menuPermissions.includes(menuKey)
}

export function getAccessibleProjects(sourceState = state): PermissionProject[] {
  const currentUser = getCurrentUser(sourceState)
  if (isTenantAdmin(currentUser)) {
    return sourceState.projects
  }

  return sourceState.projects.filter(project =>
    project.members.some(member => member.account === currentUser.account),
  )
}

export function getCurrentProject(sourceState = state): PermissionProject | null {
  if (!sourceState.currentProjectId) {
    return null
  }
  const accessibleProjects = getAccessibleProjects(sourceState)
  return accessibleProjects.find(item => item.id === sourceState.currentProjectId) ?? accessibleProjects[0] ?? null
}

export function getCurrentProjectMode(sourceState = state): 'llm' | 'ml' {
  return sourceState.currentProjectMode ?? 'llm'
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
    if (!isTenantAdmin(currentUser)) {
      const targetProject = sourceState.projects.find(item => item.id === projectId)
      const hasPermission = Boolean(
        targetProject?.members.some(member => member.account === currentUser.account),
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
  if (reason === 'no-data') {
    return '权限不足'
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

export function setCurrentProject(projectId: string | null, mode: 'llm' | 'ml' = 'llm') {
  const nextState = cloneState(state)
  nextState.currentProjectId = projectId
  nextState.currentProjectMode = mode
  persistState(nextState)
}

export function createProject(input: { name: string; description: string; cluster: string }) {
  const nextState = cloneState(state)
  const currentUser = getCurrentUser(nextState)
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const createdAt = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  const ownerMember: ProjectPermissionMember[] = isTenantAdmin(currentUser)
    ? []
    : [{ account: currentUser.account, roleKey: currentUser.roleKey, joinedAt: createdAt }]

  const project: PermissionProject = {
    id: `project-${Date.now()}`,
    name: input.name,
    description: input.description,
    cluster: input.cluster,
    createdAt,
    members: ownerMember,
  }

  nextState.projects.unshift(project)
  persistState(nextState)
}

export function updateProject(
  projectId: string,
  input: { name: string; description: string; cluster: string },
) {
  const nextState = cloneState(state)

  nextState.projects = nextState.projects.map(project => {
    if (project.id !== projectId) {
      return project
    }

    return {
      ...project,
      name: input.name,
      description: input.description,
      cluster: input.cluster,
    }
  })

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
        account: member.account,
        roleKey: member.roleKey,
        joinedAt: member.joinedAt,
      })),
    }
  })

  const currentProject = getCurrentProject(nextState)
  nextState.currentProjectId = currentProject?.id ?? null
  persistState(nextState)
}

export function addProjectMember(
  projectId: string,
  member: { account: string; roleKey: RoleKey; joinedAt?: string },
) {
  const nextState = cloneState(state)
  nextState.projects = nextState.projects.map(project => {
    if (project.id !== projectId) {
      return project
    }

    const user = getUserByAccount(member.account, nextState)
    if (!user || isTenantAdmin(user) || !user.roleKeys.includes(member.roleKey)) {
      return project
    }

    const normalizedMember: ProjectPermissionMember = {
      account: member.account,
      roleKey: member.roleKey,
      joinedAt: member.joinedAt ?? new Date().toLocaleString('zh-CN', { hour12: false }).replaceAll('-', '/'),
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

export function createRole(input: { name: string; operationPermissions: string[]; dataPermissions: RoleDataPermissions }) {
  const nextState = cloneState(state)
  const key = `custom_${Date.now()}`
  const operationPermissions = uniqueValues(input.operationPermissions)
  nextState.roles.push({
    key,
    name: input.name,
    lockedName: false,
    lockedOperations: false,
    menuPermissions: deriveMenuPermissionsFromOperations(operationPermissions),
    operationPermissions,
    dataPermissions: normalizeDataPermissions(input.dataPermissions),
  })
  persistState(nextState)
  return key
}

export function updateRole(
  roleKey: RoleKey,
  input: { name?: string; operationPermissions?: string[]; dataPermissions?: RoleDataPermissions },
) {
  if (BUILT_IN_ROLE_KEYS.includes(roleKey as (typeof BUILT_IN_ROLE_KEYS)[number])) {
    return
  }

  const nextState = cloneState(state)
  nextState.roles = nextState.roles.map(role => {
    if (role.key !== roleKey) {
      return role
    }
    const operationPermissions = input.operationPermissions ? uniqueValues(input.operationPermissions) : role.operationPermissions
    return {
      ...role,
      name: input.name ?? role.name,
      menuPermissions: deriveMenuPermissionsFromOperations(operationPermissions),
      operationPermissions,
      dataPermissions: input.dataPermissions ? normalizeDataPermissions(input.dataPermissions) : role.dataPermissions,
    }
  })
  persistState(nextState)
}

export function deleteRole(roleKey: RoleKey) {
  if (BUILT_IN_ROLE_KEYS.includes(roleKey as (typeof BUILT_IN_ROLE_KEYS)[number])) {
    return
  }

  const nextState = cloneState(state)
  nextState.roles = nextState.roles.filter(role => role.key !== roleKey)
  nextState.users = nextState.users.map(user => {
    const roleKeys = user.roleKeys.filter(item => item !== roleKey)
    return {
      ...user,
      roleKeys: roleKeys.length ? roleKeys : ['training_engineer'],
      roleKey: roleKeys[0] ?? 'training_engineer',
    }
  })
  nextState.projects = nextState.projects.map(project => ({
    ...project,
    members: project.members.filter(member => member.roleKey !== roleKey),
  }))
  persistState(nextState)
}

export function updateUserRoles(account: string, roleKeys: RoleKey[]) {
  const nextState = cloneState(state)
  const validRoleKeys = uniqueValues(roleKeys).filter(roleKey => {
    const role = getRole(roleKey, nextState)
    return role && !role.hidden && role.key !== TENANT_ADMIN_ROLE_KEY
  })

  nextState.users = nextState.users.map(user => {
    if (user.account !== account || isTenantAdmin(user)) {
      return user
    }

    const nextRoleKeys = validRoleKeys.length ? validRoleKeys : ['training_engineer']
    return {
      ...user,
      roleKey: nextRoleKeys[0],
      roleKeys: nextRoleKeys,
    }
  })
  nextState.projects = nextState.projects.map(project => ({
    ...project,
    members: project.members.filter(member => {
      if (member.account !== account) {
        return true
      }
      return validRoleKeys.includes(member.roleKey)
    }),
  }))
  persistState(nextState)
}

export function normalizeCreatorAccount(creator?: string, sourceState = state): string | null {
  const value = String(creator ?? '').trim()
  if (!value || value === '-') {
    return null
  }

  const normalized = value.toLowerCase()
  const aliasMap: Record<string, string> = {
    admin: 'zhangsan',
    system_admin: 'zhangsan',
    platform: 'zhangsan',
    '平台': 'zhangsan',
    deepexilab: 'zhangsan',
    lab1: 'lisi',
    lab5: 'lisi',
    dp1: 'lisi',
    lab2: 'wangwu',
    dp2: 'wangwu',
  }
  if (aliasMap[normalized]) {
    return aliasMap[normalized]
  }

  const matchedUser = sourceState.users.find(user =>
    [user.account, user.username].some(item => String(item).toLowerCase() === normalized),
  )
  return matchedUser?.account ?? value
}

export function canAccessResourceData(
  domain: DataPermissionDomain,
  creator?: string,
  sourceState = state,
): { allowed: boolean; reason?: OperationDenyReason; ownerAccount?: string | null } {
  const currentUser = getCurrentUser(sourceState)
  if (isTenantAdmin(currentUser)) {
    return { allowed: true, ownerAccount: normalizeCreatorAccount(creator, sourceState) }
  }

  const currentRole = getCurrentRole(sourceState)
  if (currentRole.dataPermissions[domain]?.all) {
    return { allowed: true, ownerAccount: normalizeCreatorAccount(creator, sourceState) }
  }

  const ownerAccount = normalizeCreatorAccount(creator, sourceState)
  if (!ownerAccount || ownerAccount === currentUser.account) {
    return { allowed: true, ownerAccount }
  }

  return { allowed: false, reason: 'no-data', ownerAccount }
}

export function guardResourceDataAccess(
  domain: DataPermissionDomain,
  creator?: string,
  callback?: () => void,
  sourceState = state,
): boolean {
  const result = canAccessResourceData(domain, creator, sourceState)
  if (!result.allowed) {
    return false
  }
  callback?.()
  return true
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
