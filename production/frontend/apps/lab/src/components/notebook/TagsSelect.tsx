import { Tag, Typography } from 'antd'
import { useState } from 'react'
import type { TagByBusinessTypeResData } from '@/types/tags'

const { Title } = Typography
export interface TagsSelectProps {
  tags?: TagByBusinessTypeResData[]
  value?: number[]
  onChange?: (value: number[]) => void
}
export const TagsSelect = ({ tags, value = [], onChange }: TagsSelectProps) => {
  const [list, setList] = useState(value)
  const handleSelect = (tagClassId: number, tagElementId: number) => {
    const sameClassElements = tags?.find((tag) => tag.tag_class_id === tagClassId)?.elements
    const sameClassIds = sameClassElements?.map((el) => el.tag_element_id) ?? []
    const isCurrentlySelected = list.includes(tagElementId)
    let next: number[]
    if (isCurrentlySelected) {
      next = list.filter((id) => id !== tagElementId)
    }
    else {
      next = [...list.filter((id) => !sameClassIds.includes(id)), tagElementId]
    }
    setList(next)
    onChange?.(next)
  }
  return (
    <div>
      {tags && tags.length > 0 ? (tags.map((tag) => (
        <div key={tag.tag_class_id}>
          <Title className="mb-[12px] font-semibold" level={5}>
            {tag.tag_class_name}
          </Title>
          <div className="flex flex-wrap gap-2 mb-6">
            {tag.elements?.map((element) => {
              const selected = list.includes(element.tag_element_id)
              return (
                <Tag key={element.tag_element_id} color={selected ? 'blue' : 'default'} className="cursor-pointer !m-0" onClick={() => handleSelect(tag.tag_class_id, element.tag_element_id)}>
                  {element.tag_element_name}
                </Tag>
              )
            })}
          </div>
        </div>
      ))) : (<div className="text-center py-8 text-gray-400">请联系平台管理员去系统管理-系统配置-标签配置页面进行配置</div>)}
    </div>
  )
}
