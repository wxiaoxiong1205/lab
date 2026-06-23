import { Dropdown, Layout, Menu, message } from 'antd'
import {
  AlignRightOutlined,
  ApiOutlined,
  AppstoreOutlined,
  AreaChartOutlined,
  AudioOutlined,
  BugOutlined,
  ClusterOutlined,
  ContainerOutlined,
  DesktopOutlined,
  EditOutlined,
  FormOutlined,
  HighlightOutlined,
  HistoryOutlined,
  KeyOutlined,
  LogoutOutlined,
  MergeOutlined,
  MessageOutlined,
  MonitorOutlined,
  ReadOutlined,
  RobotOutlined,
  SettingOutlined,
  UserOutlined,
  WindowsOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { ArrowDownWideNarrow, BellRing, FileClock, Image as ImageIcon, KeyRound, LayoutDashboard, Package, ToyBrick, TypeOutline, UserPen, UserPlus, UserRoundCheck } from 'lucide-react'
import { qiankunWindow } from 'vite-plugin-qiankun/dist/helper'
import type { UserInfo } from '@/services/api'
import { apiGetAppMenuTreeByMenuGroup, apiUserInfo } from '@/services/api'
import type { Lang } from '@/locales'
import { langOptions, useTransform } from '@/locales'
import TokenQuotaManageModal from '@/components/account-auth/TokenQuotaManageModal'
import TokenApplyModal from '@/components/account-auth/TokenApplyModal'
import useMenuStore from '@/stores/menu'
import { logout } from '@/utils/system'
import useAuthStore from '@/stores/auth'
import { withBasePath } from '@/utils'
import ModelPermissionModal from '@/components/account-auth/ModelPermissionModal'
import ModelPermissionApplyModal from '@/components/account-auth/ModelPermissionApplyModal'

const { Sider, Content } = Layout
interface TreeNode {
  iconUrl: 'AppstoreOutlined' | 'LogoutOutlined' | 'RobotOutlined' | 'SettingOutlined' | 'ApiOutlined' | 'UserOutlined' | 'ContainerOutlined' | 'HighlightOutlined' | 'FormOutlined' | 'EditOutlined' | 'KeyOutlined' | 'HistoryOutlined' | 'AreaChartOutlined'
  pathUrl: any
  id: number
  code: string
  name: string
  description: string
  enabled: boolean
  type: 0 | 1 | 2
  children?: TreeNode[]
}
interface MenuItem {
  type?: string
  label: string | React.ReactNode
  key: string
  code: string
  icon?: React.ReactNode
  children?: MenuItem[]
}

export default function MainLayout() {
  const { menuList, setMenuList, setIsManager, setIsSanYuan } = useMenuStore(
    useShallow((state) => {
      return {
        menuList: state.menuList,
        setMenuList: state.setMenuList,
        setIsManager: state.setIsManager,
        setIsSanYuan: state.setIsSanYuan,
      }
    }),
  )
  const navigate = useNavigate()
  const location = useLocation()
  const pathname = location.pathname
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const { $t, changeLang, currentLang } = useTransform()
  const [open, setOpen] = useState(false)
  const [isApply, setIsApply] = useState(false)
  const { userInfo: authUserInfo, token } = useAuthStore(useShallow((state) => {
    return {
      userInfo: state.userInfo,
      token: state.token,
    }
  }))
  const iconMap = {
    AppstoreOutlined: <AppstoreOutlined />,
    LogoutOutlined: <LogoutOutlined />,
    RobotOutlined: <RobotOutlined />,
    SettingOutlined: <SettingOutlined />,
    ApiOutlined: <ApiOutlined />,
    UserOutlined: <UserOutlined />,
    ContainerOutlined: <ContainerOutlined />,
    HighlightOutlined: <HighlightOutlined />,
    FormOutlined: <FormOutlined />,
    EditOutlined: <EditOutlined />,
    KeyOutlined: <KeyOutlined />,
    HistoryOutlined: <HistoryOutlined />,
    AreaChartOutlined: <AreaChartOutlined />,
    BugOutlined: <BugOutlined />,
    AlignRightOutlined: <AlignRightOutlined />,
    DesktopOutlined: <DesktopOutlined />,
    MessageOutlined: <MessageOutlined />,
    monitor: <MonitorOutlined />,
    WindowsOutlined: <WindowsOutlined />,
    TypeOutline: <TypeOutline className="w-4 h-4" />,
    Image: <ImageIcon className="w-4 h-4" />,
    ArrowDownWideNarrow: <ArrowDownWideNarrow className="w-4 h-4" />,
    KeyRound: <KeyRound className="w-4 h-4" />,
    ClipboardClock: <FileClock className="w-4 h-4" />,
    Package: <Package className="w-4 h-4" />,
    LayoutDashboard: <LayoutDashboard className="w-4 h-4" />,
    UserPen: <UserPen className="w-4 h-4" />,
    UserRoundCheck: <UserRoundCheck className="w-4 h-4" />,
    UserPlus: <UserPlus className="w-4 h-4" />,
    BellRing: <BellRing className="w-4 h-4" />,
    ToyBrick: <ToyBrick className="w-4 h-4" />,
    AudioOutlined: <AudioOutlined className="w-4 h-4" />,
    ClusterOutlined: <ClusterOutlined className="w-4 h-4" />,
    MergeOutlined: <MergeOutlined className="w-4 h-4" />,
    ReadOutlined: <ReadOutlined className="w-4 h-4" />,
  }
  // 模型权限弹窗数据
  const [openModelPermission, setOpenModelPermission] = useState(false)
  const [applyModelPermission, setApplyModelPermission] = useState(false)

  const isQiankun = qiankunWindow.__POWERED_BY_QIANKUN__

  const forbidenChildren = ['model_settings', 'model_deployment', 'model_requests', 'account_permission', 'monitoring_center', 'alert']

  const isSanYuan = useMenuStore(useShallow((state) => state.isSanYuan))
  // 用户下拉菜单项
  const userMenuItems = [
    {
      key: 'tokenManage',
      icon: iconMap.AppstoreOutlined,
      label: $t('额度管理'),
    },
    ...(!isSanYuan ? [{
      key: 'modelPermission',
      icon: iconMap.Package,
      label: $t('资源权限'),
    }] : []),
    {
      key: 'logout',
      icon: iconMap.LogoutOutlined,
      label: $t('退出登录'),
    },
  ] as const
  const portalMenuItems = userMenuItems.filter((item) => item.key !== 'logout')
  // 统一的获取用户信息函数
  const fetchUserInfo = async () => {
    try {
      const res = await apiUserInfo()
      setUserInfo(res.data)
      useAuthStore.getState().setUserInfo(res.data)
      setIsManager(res.data.role === 100)
      return res.data
    }
    catch (error) {
      console.error('获取用户信息失败:', error)
      return null
    }
  }
  const handleUserMenuClick = ({ key }: { key: string }) => {
    switch (key) {
      case 'tokenManage':
        setOpen(true)
        break
      case 'modelPermission':
        setOpenModelPermission(true)
        break
      case 'logout':
        logout()
        break
      default:
        break
    }
  }

  // 微前端下处理将特定菜单插入到控制台用户菜单处
  const userActionSlotRef = useRef<Record<string, HTMLElement>>({})
  const [isUserActionSlotMounted, setIsUserActionSlotMounted] = useState(false)
  useEffect(() => {
    if (isQiankun && portalMenuItems.length > 0 && !isUserActionSlotMounted) {
      const parentElement = document.querySelector('.ep-popper .i-icon-bank-card')?.parentElement.parentElement
      if (parentElement && parentElement.children.length > 0) {
        const clonedItem = parentElement.children[0].cloneNode(false)
        portalMenuItems.reverse().forEach((item) => {
          const itemElement = clonedItem.cloneNode(false) as HTMLElement
          itemElement.setAttribute('id', `dgi-user-action-${item.key}`)
          userActionSlotRef.current[item.key as string] = itemElement
          parentElement.children[0].insertAdjacentElement('afterend', itemElement)
          itemElement.addEventListener('click', () => {
            handleUserMenuClick({ key: item.key as string })
            const popperElement = parentElement.closest('.ep-popper') as HTMLElement
            if (popperElement) {
              popperElement.style.display = 'none'
            }
          })
        })
      }
      setIsUserActionSlotMounted(true)
    }
    return () => {
      if (isQiankun && portalMenuItems.length > 0) {
        Object.values(userActionSlotRef.current).forEach((item) => item.remove())
        userActionSlotRef.current = {}
        setIsUserActionSlotMounted(false)
      }
    }
  }, [])

  // 初始化时获取用户信息和菜单
  useEffect(() => {
    const initializeApp = async () => {
      const iam_token = useAuthStore.getState().token
      if (!iam_token) {
        logout()
        return
      }

      try {
        // 获取用户信息
        let currentAuthUserInfo = useAuthStore.getState().userInfo
        if (!currentAuthUserInfo) {
          currentAuthUserInfo = await fetchUserInfo()
          if (!currentAuthUserInfo) {
            logout()
            return
          }
        }
        else {
          setUserInfo(currentAuthUserInfo)
        }

        // 获取菜单数据
        const menus: any = await apiGetAppMenuTreeByMenuGroup()
        setIsSanYuan(menus.data.isSanYuan)
        setMenuList(menus.data.payload)
        setIsSanYuan(menus?.data?.isSanYuan)
      }
      catch (error) {
        console.error('获取菜单数据失败:', error)
      }
    }

    initializeApp()
  }, [authUserInfo])

  // 仅在打开额度管理弹窗时刷新用户信息
  useEffect(() => {
    if (open) {
      fetchUserInfo()
    }
  }, [open])

  // 菜单项配置
  // 左侧可展示菜单，不包括隐藏菜单
  const menuItems = useMemo(() => {
    return summarizeMenu(menuList as unknown as TreeNode[])
  }, [menuList])
  // 左侧所有菜单，包括隐藏
  const allMenuItems = useMemo(() => {
    return summarizeMenu(menuList as unknown as TreeNode[], true, false)
  }, [menuList])

  // 获取当前选中的菜单项
  const selectedKeys = useMemo(() => {
    // 从完整路径开始，逐步缩短路径来查找匹配的菜单项
    const pathSegments = pathname.split('/').filter(Boolean)
    let matchingKey = pathname

    // 从完整路径开始，逐步移除最后一个路径段
    for (let i = pathSegments.length; i > 0; i--) {
      const currentPath = `/${pathSegments.slice(0, i).join('/')}`
      if (isRouteInMenu(menuItems, currentPath)) {
        matchingKey = currentPath
        break
      }
    }

    // 如果没找到匹配的菜单项，使用原始路径
    return matchingKey ? [matchingKey] : [pathname]
  }, [pathname])

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key)
  }

  function summarizeMenu(menuList: TreeNode[], isFirstLevel = true, isFilterType = true): MenuItem[] {
    const res = menuList
      .filter((item) => {
        // 过滤掉不需要显示的菜单项
        return item.code !== 'personal_settings' && (isFilterType ? item.type === 0 : true)
      })
      .map((item, index) => {
        const menuItem = {
          key: item.pathUrl || index,
          label: $t(item.name as keyof typeof $t),
          code: item.pathUrl,
          icon: iconMap[item.iconUrl as keyof typeof iconMap] ?? <WindowsOutlined />,
        }

        // 检查当前项的 code 是否在 forbidenChildren 中
        const isForbidenToHaveChildren = forbidenChildren.includes(item.code)

        if (item.children && item.children.length > 0 && !isForbidenToHaveChildren) {
          return {
            ...menuItem,
            icon: iconMap[item.iconUrl as keyof typeof iconMap] ?? <WindowsOutlined />,
            ...(isFirstLevel ? { type: 'group' } : {}),
            children: summarizeMenu(item.children, false, isFilterType),
          }
        }

        return menuItem
      })

    return res.length > 0 || isFirstLevel ? res : undefined
  }

  function isRouteInMenu(menuTree: MenuItem[], currentPath: string): boolean {
    return menuTree.some((item) => {
      // 检查当前路径是否匹配
      const isMatch = currentPath.includes('approval')
        ? item.key === currentPath
        : item.key && currentPath.includes(item.key)

      // 递归检查子菜单
      return isMatch || (item.children?.length && isRouteInMenu(item.children, currentPath))
    })
  }
  useEffect(() => {
    if (menuItems.length === 0) return
    // 根路径由路由 index 重定向到 /model-space，不做菜单权限校验，避免 qiankun 首次进入时误报
    if (pathname === '/' || pathname === '') return
    // 匹配所有菜单信息，判断是否具有权限
    const isPermission = isRouteInMenu(allMenuItems, pathname)
    if (!isPermission && !pathname.includes('iam-login') && !pathname.includes('document')) {
      message.warning('暂无该菜单权限，请先联系管理员进行配置！')
      navigate('/model-space', { replace: true })
    }
  }, [pathname, menuItems, navigate, allMenuItems])

  // 如果用户信息还未加载完成，可以显示加载状态
  if (!userInfo) {
    return null // 或者返回一个加载指示器
  }

  const languageMenuItems: MenuProps['items'] = langOptions.map((lang) => ({
    key: lang.value,
    label: lang.label,
  }))

  const onCancel = (type: string): void => {
    if (type === 'manage') {
      setOpen(false)
    }
    else {
      setIsApply(false)
    }
  }

  const handleApply = () => {
    setIsApply(true)
  }

  return (
    <Layout className={isQiankun ? 'h-full' : 'h-screen'}>
      {/* 顶部 Header */}
      {!isQiankun && (
        <Layout.Header className="h-16 !bg-white border-b border-gray-200 flex items-center justify-between !px-6">
          {/* Logo */}
          <div className="flex items-center h-full">
            <img src={withBasePath('/logo.png')} alt="Logo" width={180} height={32} />
          </div>
          <div className="flex items-center gap-2">
            {/* 语言切换 */}
            <Dropdown
              menu={{
                items: languageMenuItems,
                onClick: ({ key }) => {
                  changeLang(key as Lang)
                },
              }}
              trigger={['click']}
            >
              <div className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                <img
                  src={withBasePath('/language.svg')}
                  width={28}
                  height={28}
                  alt="language"
                  className="cursor-pointer"
                />
                {langOptions.find((lang) => lang.value === currentLang)?.label}
              </div>
            </Dropdown>
            {/* 用户信息 */}
            <Dropdown
              menu={{
                items: userMenuItems as unknown as MenuProps['items'],
                onClick: handleUserMenuClick,
              }}
              trigger={['click']}
              placement="bottomRight"
            >
              <div className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                <UserOutlined className="text-gray-400" />
                <span className="text-gray-600">{userInfo.username}</span>
              </div>
            </Dropdown>
          </div>
        </Layout.Header>
      )}

      {isQiankun && isUserActionSlotMounted && portalMenuItems.length > 0
      && portalMenuItems.map((item) => (
        createPortal(
          <div key={item.key} className="flex gap-2 items-center leading-6">
            {item.icon}
            {item.label}
          </div>, userActionSlotRef.current[item.key as string])
      ),
      )}

      {/* 侧边栏和主内容区 */}
      <Layout>
        <Sider theme="light" width={240} className={`border-r border-gray-200 ${pathname === '/document' ? 'hidden' : 'block'}`}>
          <div className="h-full overflow-y-auto hover-auto-scrollbar">
            <Menu
              mode="inline"
              selectedKeys={selectedKeys}
              items={menuItems as any}
              className="!border-0"
              onClick={handleMenuClick}
            />
          </div>
        </Sider>

        {/* 主内容区 */}
        <Content
          className={`bg-[#f5f9fc] overflow-auto ${['/model-space', '/api-space'].includes(pathname) ? '' : 'p-6'
          }`}
          style={{
            height: isQiankun ? '100%' : 'calc(100vh - 64px)',
          }}
        >
          <Outlet />
        </Content>
      </Layout>

      <TokenQuotaManageModal
        open={open}
        onCancel={() => onCancel('manage')}
        userInfo={userInfo}
        handleApply={handleApply}
      />
      <TokenApplyModal open={isApply} onCancel={() => onCancel('apply')} />

      <ModelPermissionModal
        open={openModelPermission}
        onCancel={() => setOpenModelPermission(false)}
        handleApply={() => setApplyModelPermission(true)}
      />
      <ModelPermissionApplyModal
        open={applyModelPermission}
        onCancel={() => setApplyModelPermission(false)}
      />
    </Layout>
  )
}
