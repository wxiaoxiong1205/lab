import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type MenuItems = { title?: string, key?: number, children?: MenuItems }

// 定义状态类型
type MenuState = {
  menuList: MenuItems[]
  isRoot: boolean
  isManager: boolean
  isSanYuan: boolean
  setMenuList: (menuList: MenuItems[]) => void
  setIsRoot: (isRoot: boolean) => void
  setIsManager: (isManager: boolean) => void
  setIsSanYuan: (isSanYuan: boolean) => void
}

interface TreeNode {
  status: any
  id: number
  code: string
  name: string
  description: string
  enabled: boolean
  children?: TreeNode[]
}

const filterEnabledNodes = (data: TreeNode[]): TreeNode[] => {
  return data.filter((node) => {
    if (!node.status) return false
    if (node.children) {
      node.children = filterEnabledNodes(node.children)
    }
    return true
  })
}

// 创建 store
const useMenuStore = create(
  persist<MenuState>(
    (set) => ({
      menuList: [] as MenuItems[],
      isRoot: false,
      isManager: false,
      isSanYuan: false,
      setMenuList: (menuList) =>
        set(() => ({
          menuList: menuList || [],
        })),
      setIsRoot: (isRoot) =>
        set(() => ({
          isRoot,
        })),
      setIsManager: (isManager) =>
        set(() => ({
          isManager,
        })),
      setIsSanYuan: (isSanYuan) =>
        set(() => ({
          isSanYuan,
        })),
    }),
    {
      name: 'menu-storage', // localStorage key
    },
  ),
)

export default useMenuStore
