import { type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Button, Dropdown, Layout, message } from 'antd'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  FileTextOutlined,
  KeyOutlined,
  LogoutOutlined,
  MenuOutlined,
  UserOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { useQueryClient } from '@tanstack/react-query'
import { qiankunWindow } from 'vite-plugin-qiankun/dist/helper'
import { useAuthStore } from '../stores/authStore'
import { useConfigStore } from '../stores/configStore'
import { useProjectStore } from '../stores/projectStore'
import ProfileModal from '../components/ProfileModal'
import useI18n from '../hooks/useI18n'
import { getProjectEnum } from '@/services/api'
import logo from '@/assets/images/logo.png'
import DesignDocFab from '@/components/DesignDoc/DesignDocFab'
import DesignDocPanel from '@/components/DesignDoc/DesignDocPanel'
import DesignDocReviewCenter from '@/components/DesignDoc/DesignDocReviewCenter'
import { getGlobalDesignDoc, getPageDesignDoc, GLOBAL_DESIGN_DOC_PATH, shouldUseGlobalDesignDocOnly } from '@/docs/pageDocs'
import './MainLayout.css'
import './DesignDoc.css'

const { Header } = Layout

const DESIGN_DOC_ROUTE_ALIASES: Array<[RegExp, string]> = [
  [/^\/home$/, '/workspace'],
  [/^\/api-access-key(?:\/|$)/, '/open-platform/api-keys'],
  [/^\/machine-task-overview(?:\/|$)/, '/task-overview'],
  [/^\/Inference(?:\/|$)/i, '/inference'],
  [/^\/business-inference(?:\/|$)/, '/inference'],
  [/^\/datasets\/validation(?:\/|$)/, '/measurement'],
  [/^\/measurement(?:\/|$)/, '/measurement'],
  [/^\/business-test(?:\/|$)/, '/measurement'],
  [/^\/datasets(?:\/|$)/, '/datasets'],
  [/^\/file-management(?:\/|$)/, '/file-management'],
  [/^\/data-cleaning(?:\/|$)/, '/data-cleaning'],
  [/^\/data-insight(?:\/|$)/, '/data-insight'],
  [/^\/data-augmentation(?:\/|$)/, '/data-augmentation'],
  [/^\/data-annotation(?:\/|$)/, '/data-annotation'],
  [/^\/training(?:\/|$)/, '/training'],
  [/^\/finetune\/tasks(?:\/|$)/, '/training'],
  [/^\/finetune\/notebooks(?:\/|$)/, '/finetune/notebooks'],
  [/^\/model(?:\/|$)/, '/model'],
  [/^\/effect-evaluation(?:\/|$)/, '/effect-evaluation'],
  [/^\/business-effect-evaluation(?:\/|$)/, '/effect-evaluation'],
  [/^\/evaluation-indicator(?:\/|$)/, '/evaluation-indicator'],
  [/^\/service\/inference\/hosted(?:\/|$)/, '/service/inference/hosted'],
  [/^\/service\/inference\/external(?:\/|$)/, '/service/inference/external'],
  [/^\/online-inference(?:\/|$)/, '/service/inference/external'],
  [/^\/machine-data-management(?:\/|$)/, '/machine-data-management'],
  [/^\/machine-model-management(?:\/|$)/, '/machine-model-management'],
  [/^\/machine-model-deployment(?:\/|$)/, '/machine-model-deployment'],
  [/^\/machine-annotation(?:\/|$)/, '/machine-annotation'],
  [/^\/machine-online-annotation-service(?:\/|$)/, '/machine-annotation-service'],
  [/^\/machine-annotation-service(?:\/|$)/, '/machine-annotation-service'],
  [/^\/machine-notebook(?:\/|$)/, '/machine-notebook'],
  [/^\/admin\/projects(?:\/|$)/, '/admin/projects'],
  [/^\/admin\/members(?:\/|$)/, '/admin/permissions'],
  [/^\/admin\/users(?:\/|$)/, '/admin/permissions'],
  [/^\/admin\/permissions(?:\/|$)/, '/admin/permissions'],
  [/^\/admin\/base-model(?:\/|$)/, '/admin/base-model'],
  [/^\/admin\/kubernetes(?:\/|$)/, '/admin/kubernetes'],
  [/^\/admin\/storage(?:\/|$)/, '/admin/storage'],
  [/^\/admin\/image-list(?:\/|$)/, '/admin/image-list'],
  [/^\/admin\/registry(?:\/|$)/, '/admin/registry'],
  [/^\/admin\/settings(?:\/|$)/, '/admin/settings'],
  [/^\/docs(?:\/|$)/, '/docs'],
]

function canonicalizeDesignDocPath(pathname: string): string {
  const alias = DESIGN_DOC_ROUTE_ALIASES.find(([pattern]) => pattern.test(pathname))
  return alias?.[1] ?? pathname
}

function normalizeDesignDocPath(pathname: string): string {
  const cleanPath = pathname.replace(/\/+$/, '') || '/'

  if (cleanPath === '/' || cleanPath === '/home') {
    return '/workspace'
  }

  if (cleanPath.startsWith('/project/admin')) {
    return canonicalizeDesignDocPath(cleanPath.replace('/project', '') || '/admin')
  }

  const projectDetailMatch = cleanPath.match(/^\/project\/([^/]+)(\/.*)?$/)
  if (projectDetailMatch) {
    return canonicalizeDesignDocPath(projectDetailMatch[2] || '/workspace')
  }

  if (cleanPath === '/project') {
    return '/workspace'
  }

  return canonicalizeDesignDocPath(cleanPath)
}

function getCurrentProjectRouteBase(pathname: string): string {
  const match = pathname.match(/^\/project\/([^/]+)/)

  if (!match || match[1] === 'admin') {
    return '/project'
  }

  return `/project/${match[1]}`
}

function toAppRoutePath(pagePath: string, currentPathname: string): string | null {
  if (pagePath === GLOBAL_DESIGN_DOC_PATH) {
    return null
  }

  if (pagePath === '/workspace') {
    return '/home'
  }

  if (pagePath.startsWith('/admin')) {
    return `/project${pagePath}`
  }

  return `${getCurrentProjectRouteBase(currentPathname)}${pagePath}`
}

/**
 * 主布局头部组件
 * 提供统一的头部导航，包括管理员模式切换功能
 */
const MainLayout = ({
  children,
  headerContent,
}: {
  children: ReactNode
  headerContent?: ReactNode
}) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const { user, logout } = useAuthStore()
  const { config, providerType } = useConfigStore()
  const { clearProject } = useProjectStore()
  const [profileModalVisible, setProfileModalVisible] = useState(false)
  const [apiAccessKeySlot, setApiAccessKeySlot] = useState<HTMLElement | null>(null)
  const [designDocOpen, setDesignDocOpen] = useState(false)
  const [designDocDisplayMode, setDesignDocDisplayMode] = useState<'side' | 'fullscreen'>('side')
  const [activeRequirementVersion, setActiveRequirementVersion] = useState<string | null>('V1.14')
  const [designDocScope, setDesignDocScope] = useState<'page' | 'global'>('page')
  const [currentPageHasRequirements, setCurrentPageHasRequirements] = useState(false)
  const apiAccessKeySlotRef = useRef<HTMLElement | null>(null)
  const designDocPath = normalizeDesignDocPath(location.pathname)
  const effectiveDesignDocScope = shouldUseGlobalDesignDocOnly(designDocPath) ? 'global' : designDocScope
  const activeDesignDoc = effectiveDesignDocScope === 'global'
    ? getGlobalDesignDoc()
    : getPageDesignDoc(designDocPath)
  const designDocRightOffset = designDocOpen && designDocDisplayMode === 'side' ? 484 : 24

  // 判断是否是 qiankun 子应用
  const isQiankun = qiankunWindow.__POWERED_BY_QIANKUN__
  // 判断是否是无界微前端
  const isWujie = window.__POWERED_BY_WUJIE__
  const isBelleProvider = config?.PROVIDER_TYPE === providerType

  // 组件挂载时获取项目枚举值并存储到本地
  useEffect(() => {
    const fetchProjectEnumValues = async () => {
      // 先检查localStorage中是否有缓存的枚举值
      const cachedEnumValues = localStorage.getItem('projectEnumValues')

      if (cachedEnumValues) {
        try {
          JSON.parse(cachedEnumValues)
        }
        catch (error) {
          console.error('Failed to parse cached enum values:', error)
          // 解析失败时继续从API获取
        }
      }

      try {
        const data = await getProjectEnum()
        localStorage.setItem('projectEnumValues', JSON.stringify(data))
      }
      catch (error) {
        console.error('Failed to fetch project enum values:', error)
      }
    }

    // 只有在用户已认证的情况下才获取枚举值
    if (user) {
      fetchProjectEnumValues()
    }
  }, [user])

  // 处理登出
  const handleLogout = () => {
    // 1. 获取登录URL（在清除localStorage之前）
    const loginUrl = localStorage.getItem('login_url')

    // 2. 清除认证和localStorage数据
    logout()

    // 3. 清除项目状态
    clearProject()

    // 4. 清除React Query缓存
    queryClient.clear()

    // 5. 显示成功消息
    message.success(t('user.loggedOut'))

    // 6. 立即重定向到登录URL（避免显示未授权页面）
    if (loginUrl) {
      // 使用replace避免用户通过后退按钮回到应用
      window.location.replace(loginUrl)
    }
    else {
      // 如果没有登录URL，重定向到首页并显示提示
      window.location.replace('/')
      message.info('请通过授权链接重新访问')
    }
  }

  // 处理关闭个人信息弹窗
  const handleCloseProfile = () => {
    setProfileModalVisible(false)
  }

  const handleOpenApiAccessKey = useCallback(() => {
    if (isQiankun) {
      navigate('/api-access-key')
      return
    }

    const baseUrl = import.meta.env.BASE_URL || '/'
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
    window.open(`${normalizedBaseUrl}/api-access-key`, '_blank', 'noopener,noreferrer')
  }, [isQiankun, navigate])

  const handleDocCenterClick = () => {
    navigate('/docs')
  }

  const handleOpenRequirementPage = useCallback((pagePath: string, versionName: string) => {
    setActiveRequirementVersion(versionName)
    setDesignDocOpen(true)

    if (pagePath === GLOBAL_DESIGN_DOC_PATH) {
      setDesignDocScope('global')
      return
    }

    setDesignDocScope('page')
    const targetRoute = toAppRoutePath(pagePath, location.pathname)

    if (targetRoute && targetRoute !== location.pathname) {
      navigate(targetRoute)
    }
  }, [location.pathname, navigate])

  const getDocCenterPageUrl = useCallback(() => {
    const baseUrl = isQiankun
      ? (window.qiankunProps?.base && window.qiankunProps.base !== '/' ? window.qiankunProps.base : '/lab')
      : (import.meta.env.BASE_URL || '/')
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl

    return `${normalizedBaseUrl}/docs`
  }, [isQiankun])

  useEffect(() => {
    if (!isQiankun) {
      return
    }

    let docCenterTrigger: HTMLElement | null = null
    let fallbackDocCenterEntry: HTMLElement | null = null
    const hiddenDocCenterEntries = new Map<HTMLElement, string>()

    const handleConsoleDocCenterClick = (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      window.open(getDocCenterPageUrl(), '_blank', 'noopener,noreferrer')
    }

    const getConfiguredDocCenterIcon = () => {
      const icons = Array.from(document.querySelectorAll<HTMLElement>(
        '.i-icon-book-one[title="文档中心"], [title="文档中心"] .i-icon-book-one, [title="文档中心"]',
      ))

      return icons.find((icon) => !icon.closest('[data-lab-doc-center-fallback="true"]')) || null
    }

    const createFallbackDocCenterEntry = () => {
      if (fallbackDocCenterEntry?.isConnected) {
        return fallbackDocCenterEntry
      }

      const actionList = document.querySelector<HTMLElement>('ul.ml-6.flex.items-center.space-x-4')

      if (!actionList) {
        return null
      }

      const entry = document.createElement('li')
      entry.className = 'relative h-5 cursor-pointer pt-0.5 leading-0'
      entry.dataset.labDocCenterFallback = 'true'
      entry.title = '文档中心'
      entry.innerHTML = `
        <span class="i-icon i-icon-book-one" title="文档中心">
          <svg width="16" height="16" viewBox="0 0 48 48" fill="none">
            <path d="M7 37C7 29.2967 7 11 7 11C7 7.68629 9.68629 5 13 5H35V31C35 31 18.2326 31 13 31C9.7 31 7 33.6842 7 37Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"></path>
            <path d="M35 31C35 31 14.1537 31 13 31C9.68629 31 7 33.6863 7 37C7 40.3137 9.68629 43 13 43C15.2091 43 25.8758 43 41 43V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
            <path d="M14 37H34" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </span>
      `

      actionList.appendChild(entry)
      fallbackDocCenterEntry = entry

      return entry
    }

    const getDocCenterEntry = (icon: HTMLElement) => (
      icon.closest<HTMLElement>('li, button, a, [role="button"]') || icon
    )

    const hideConfiguredDocCenterEntries = () => {
      const configuredIcons = Array.from(document.querySelectorAll<HTMLElement>(
        '.i-icon-book-one[title="文档中心"], [title="文档中心"] .i-icon-book-one, [title="文档中心"]',
      ))

      configuredIcons
        .filter((icon) => !icon.closest('[data-lab-doc-center-fallback="true"]'))
        .map(getDocCenterEntry)
        .forEach((entry) => {
          if (!hiddenDocCenterEntries.has(entry)) {
            hiddenDocCenterEntries.set(entry, entry.style.display)
          }
          entry.style.display = 'none'
        })

      fallbackDocCenterEntry?.remove()
      fallbackDocCenterEntry = null
    }

    const bindConsoleDocCenterEntry = () => {
      const configuredIcon = getConfiguredDocCenterIcon()

      if (configuredIcon && fallbackDocCenterEntry?.isConnected) {
        fallbackDocCenterEntry.remove()
        fallbackDocCenterEntry = null
      }

      const icon = configuredIcon || createFallbackDocCenterEntry()
      const trigger = icon ? getDocCenterEntry(icon) : null

      if (!trigger || trigger === docCenterTrigger) {
        return
      }

      docCenterTrigger?.removeEventListener('click', handleConsoleDocCenterClick, true)
      docCenterTrigger = trigger
      docCenterTrigger.setAttribute('title', '文档中心')
      docCenterTrigger.addEventListener('click', handleConsoleDocCenterClick, true)
    }

    if (isBelleProvider) {
      hideConfiguredDocCenterEntries()
    }
    else {
      bindConsoleDocCenterEntry()
    }

    const observer = new MutationObserver(() => {
      if (isBelleProvider) {
        hideConfiguredDocCenterEntries()
        return
      }

      bindConsoleDocCenterEntry()
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()
      docCenterTrigger?.removeEventListener('click', handleConsoleDocCenterClick, true)
      fallbackDocCenterEntry?.remove()
      hiddenDocCenterEntries.forEach((display, entry) => {
        entry.style.display = display
      })
    }
  }, [getDocCenterPageUrl, isBelleProvider, isQiankun])

  // 用户下拉菜单
  const userDropdownItems: MenuProps['items'] = [
    {
      key: 'apiAccessKey',
      icon: <KeyOutlined />,
      label: 'API访问密钥',
      onClick: handleOpenApiAccessKey,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: t('user.logout'),
      onClick: handleLogout,
    },
  ]

  // qiankun 模式下本应用头部会隐藏，需要把 API 访问密钥入口注入到主应用用户菜单中
  useEffect(() => {
    let observer: MutationObserver | null = null
    let injectedElement: HTMLElement | null = null
    let injectedClickHandler: (() => void) | null = null

    const cleanupInjectedUserAction = () => {
      if (injectedElement && injectedClickHandler) {
        injectedElement.removeEventListener('click', injectedClickHandler)
      }
      apiAccessKeySlotRef.current?.remove()
      apiAccessKeySlotRef.current = null
      injectedElement = null
      injectedClickHandler = null
      setApiAccessKeySlot(null)
    }

    if (!isQiankun) {
      cleanupInjectedUserAction()
      return cleanupInjectedUserAction
    }

    const mountInjectedUserAction = () => {
      if (apiAccessKeySlotRef.current?.isConnected)
        return true

      const parentElement = document.querySelector('.ep-popper .i-icon-bank-card')?.parentElement?.parentElement as HTMLElement | null
      if (!parentElement || parentElement.children.length === 0)
        return false

      cleanupInjectedUserAction()

      const clonedItem = parentElement.children[0].cloneNode(false) as HTMLElement
      const itemElement = clonedItem.cloneNode(false) as HTMLElement
      itemElement.setAttribute('id', 'lab-user-action-api-access-key')
      itemElement.dataset.labInjectedUserAction = 'apiAccessKey'

      injectedClickHandler = () => {
        handleOpenApiAccessKey()
        const popperElement = parentElement.closest('.ep-popper') as HTMLElement | null
        if (popperElement) {
          popperElement.style.display = 'none'
        }
      }
      itemElement.addEventListener('click', injectedClickHandler)

      apiAccessKeySlotRef.current = itemElement
      injectedElement = itemElement
      parentElement.children[0].insertAdjacentElement('afterend', itemElement)
      setApiAccessKeySlot(itemElement)
      return true
    }

    mountInjectedUserAction()
    observer = new MutationObserver(() => {
      mountInjectedUserAction()
    })
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer?.disconnect()
      cleanupInjectedUserAction()
    }
  }, [handleOpenApiAccessKey, isQiankun])

  // 子应用嵌入时：占满容器且参与 flex 收缩，避免内容溢出被裁剪
  const layoutStyle: CSSProperties = (isQiankun || isWujie)
    ? { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }
    : { minHeight: '100vh' }

  return (
    <Layout style={layoutStyle}>
      {isQiankun && apiAccessKeySlot && createPortal(
        <div className="flex gap-2 items-center leading-6">
          <KeyOutlined />
          API访问密钥
        </div>,
        apiAccessKeySlot,
      )}
      {/* 在 qiankun 或 wujie 模式下隐藏头部 */}
      {(!isQiankun && !isWujie) && (
        <Header
          className="lab-main-header grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-0 px-0 h-[60px] leading-[60px] bg-[var(--lab-color-surface-page)]"
        >
          <div
            className="flex h-[60px] w-[158px] min-w-0 shrink-0 cursor-pointer items-center justify-self-start"
            onClick={() => navigate('/home')}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                navigate('/home')
              }
            }}
          >
            <Button
              type="text"
              icon={<MenuOutlined />}
              className="lab-header-menu-btn ml-3 h-9 w-9"
            />
            <img
              src={logo}
              alt={t('app.title')}
              className="ml-1 h-[22px] w-auto object-contain"
            />
            <span className="lab-header-logo-divider" />
          </div>

          <div className="flex h-[60px] w-full min-w-0 items-center">
            {headerContent}
          </div>

          <div className="mr-[30px] flex h-[60px] shrink-0 items-center justify-self-end">
            <Button
              type="text"
              icon={<FileTextOutlined />}
              className="lab-header-doc-btn"
              onClick={handleDocCenterClick}
            >
              文档中心
            </Button>
            <Dropdown menu={{ items: userDropdownItems }} placement="bottomRight">
              <Button
                type="text"
                icon={<UserOutlined />}
                className="lab-header-user-btn px-0"
              >
                {user?.username || t('user.profile')}
              </Button>
            </Dropdown>
          </div>
        </Header>
      )}

      {(isQiankun || isWujie) ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {children}
        </div>
      ) : (
        children
      )}

      <DesignDocPanel
        doc={activeDesignDoc}
        open={designDocOpen}
        onClose={() => setDesignDocOpen(false)}
        displayMode={designDocDisplayMode}
        onDisplayModeChange={setDesignDocDisplayMode}
        activeVersionName={activeRequirementVersion}
        onActiveVersionChange={setActiveRequirementVersion}
        docScope={effectiveDesignDocScope}
        onDocScopeChange={setDesignDocScope}
      />
      <DesignDocFab
        open={designDocOpen}
        onToggle={() => setDesignDocOpen(open => !open)}
        rightOffset={designDocRightOffset}
        highlighted={currentPageHasRequirements}
      />
      <DesignDocReviewCenter
        selectedVersionName={activeRequirementVersion}
        currentPagePath={activeDesignDoc.pagePath}
        rightOffset={24}
        onVersionChange={setActiveRequirementVersion}
        onOpenPage={handleOpenRequirementPage}
        onCurrentPageHasRequirementsChange={setCurrentPageHasRequirements}
      />

      {/* 个人信息弹窗 */}
      <ProfileModal
        visible={profileModalVisible}
        onClose={handleCloseProfile}
        onChangePassword={() => {}}
        user={user}
      />
    </Layout>
  )
}

export default MainLayout
