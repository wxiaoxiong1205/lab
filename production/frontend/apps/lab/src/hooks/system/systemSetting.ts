import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { MenuProps } from 'antd'
import { userApi } from '@/services/api'

export interface MenuItemType {
  code: string
  description: string
  elementResourceId: number
  elementStatus: number
  highLightIconUrl: string | null
  iconUrl: string
  id: number
  idPath: string
  name: string
  parentId: number
  pathUrl: string
  remark: string | null
  secretLevel: number
  sort: number
  type: number
  children?: MenuItemType[]
}

// 遍历 menuData，返回数组 [preLevel, path]，每项和其父级一起也拿出来
export const parseMenuData = (menuData: MenuItemType[]) => {
  const result: Array<[MenuItemType, MenuItemType | null]> = []

  const traverse = (items: MenuItemType[], parent: MenuItemType | null) => {
    for (const item of items) {
      result.push([item, parent])
      if (item.children && item.children.length > 0) {
        traverse(item.children, item)
      }
    }
  }

  traverse(menuData, null)
  return result
}

export function useSystemSetting() {
  const { data: systemMenuData = [], isLoading: _menuLoading } = useQuery({
    queryKey: ['menuData'],
    queryFn: () => userApi.menuList(),
    staleTime: 0,
    gcTime: 0,
  })

  const allMenItems = useMemo(() => parseMenuData(systemMenuData), [systemMenuData])
  const endItems = useMemo(() => {
    return parseMenuData(systemMenuData)
      .filter((item) => item[0].children.length === 0)
      .map((item) => ({
        preLevelItem: item[1],
        item: item[0],
      }))
  }, [systemMenuData])
  const allMenuList = useMemo(() => endItems.map((items) => items.item.code), [endItems])
  /** 标签设置菜单项 */
  const tagsSettingMenuItems = useMemo(() => {
    const result: MenuProps['items'] = []
    const isHaveCustomImage = endItems.some((item) => item.item.name === '自定义镜像')
    if (isHaveCustomImage) {
      result.push({
        key: 'custom_image',
        label: '自定义镜像',
      })
    }
    return result
  }, [endItems])

  /**
   * 可查看的标签设置标签页
   * ['attribute', 'tags']
   * ['attribute']
   */
  const canViewTabs = useMemo(() => {
    return tagsSettingMenuItems.length > 0 ? ['attribute', 'tags', 'template'] : ['attribute', 'template']
  }, [tagsSettingMenuItems])

  return {
    /**
     * 所有结构后的菜单项，包含父级及当前项
     * [[item, parent], [item, parent], ...]
     * [[item, parent], [item, parent], ...]
     * ...
     */
    allMenItems,
    /**
     * 末级菜单项，包含父级及当前项
     * [{preLevelItem, item}, {preLevelItem, item}, ...]
     */
    endItems,

    /** 标签设置菜单项 */
    tagsSettingMenuItems,
    /**
     * 可查看的标签设置标签页
     * ['attribute', 'tags']
     * ['attribute']
     */
    canViewTabs,
    // 所有末节点菜单code数组 例如[a,v,b,z,s]
    allMenuList,
  }
}
