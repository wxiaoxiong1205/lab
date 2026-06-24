export interface AppProps {
  container?: HTMLElement | string
  userInfo: LoginUserInfo
  base: string
  entry: string
  apiServer?: string
  authStorage: AuthStorage
  appInfo?: any
  methods: {
    getUnSubscribeAppForResource: () => string[]
    getAppByAppCode: (appCode: string) => IApp | undefined
    isSubscribeApp: (appCode: string) => boolean
    logout: (redirect?: string) => void
    setCurrentMicroAppAndMenus: (appAndMenus: { appInfo: any, menus: any[] }) => void
    updateBaseConfig: (key: keyof BaseConfig, value: any) => void
    getRuntimeProps: () => { base: string, isPageMfe: boolean }
    hasPermission: (code: string) => boolean
    errorNotification: (options: { title: string, message: string, traceId?: string }) => Promise<void>
  }
  baseConfig?: BaseConfig
  system: {
    locale: string
  }
}

interface IAccountInfo {
  avatar: string
  email: string
  id: number
  isMain: boolean
  nickname: string
  phone: string
  status: number
  tenantId: string
  userId: number
  username: string
  createTime: number
}

export type LoginUserInfo = {
  accountId: string
  enterpriseCode: string
  tenantId: string
  userId: string
  username: string
  nickname: string
  isSanYuan?: boolean
  needResetPassword?: boolean
  isSanYuanDefaultAccount?: boolean
  isMain: boolean
} & IAccountInfo

export type AppName = string
export interface IApp {
  appCode: AppName
  appId: number
  appName: string
  backendUrl: string
  description: string
  homeUrl: string
  url?: string
  iconImage: string
  introduceUrl: string
  startUseTime: number | null
  lastUseTime: number | null
  subApplicationStatusEnum: SubApplicationStatus
  supportMicroFront: boolean
  supportProject: boolean
  relationMenuCode: string
}

export interface AuthStorage {
  getAuthInfo: (key?: string | undefined) => any
  getUserInfo: () => LoginUserInfo
  set: ({ userInfo, authInfo }: {
    userInfo: LoginUserInfo
    authInfo: AuthInfo
  }) => void
  setAuthInfo: (authInfo: AuthInfo) => void
  setUserInfo: (userInfo: LoginUserInfo) => void
  remove: () => void
  removeAuthInfo: () => void
  setLoginUrl: (loginUrl?: string) => void
  getLoginUrl: () => any
  refresh: <T extends () => any>(callbackFn: T) => Promise<ReturnType<T>>
  onAuthChange: (callback: (authInfo: AuthInfo) => void) => void
  offAuthChange: (callback: (authInfo: AuthInfo) => void) => void
}
export interface AuthInfo {
  token: string
  refreshToken: string
}

export enum SubApplicationStatus {
  APPLICATION_NOT_DETECTED = 'APPLICATION_NOT_DETECTED', // 应用未接入控制台
  TENANT_DO_NOT_SUBSCRIBE_APPLICATION = 'TENANT_DO_NOT_SUBSCRIBE_APPLICATION', // 账号未开通应用
  TENANT_CAN_USE_APPLICATION = 'TENANT_CAN_USE_APPLICATION', // 账号已开通应用且在有效期内,并且用户有菜单授权
  TENANT_DO_NOT_MENU = 'TENANT_DO_NOT_MENU', // 租户开通应用，但当前账号没有菜单权限
  TENANT_OUT_OF_TIME_OF_APPLICATION = 'TENANT_OUT_OF_TIME_OF_APPLICATION', // 租户已开通应用但已过期
  TENANT_HAS_SUBSCRIBE_BUT_NOT_IN_USE_TIME = 'TENANT_HAS_SUBSCRIBE_BUT_NOT_IN_USE_TIME', // 租户已开通应用但未达到使用时间
}

export interface BaseConfig {
  isFixedMenu: boolean
}
