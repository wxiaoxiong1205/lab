import { useCallback, useEffect, useState } from 'react'
import { Button, Col, Input, Popconfirm, Row, Typography } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useDebounceFn } from 'ahooks'
import { useTransform } from '@/locales'

const { Text } = Typography

// Key-Value 项接口 - 简化版，只支持数字类型
interface KeyValueItem {
  id: string
  key: string
  value: string // 存储为字符串，但会转换为数字
}

interface KeyValueEditorProps {
  value: string
  onChange: (value: string) => void
  loading?: boolean
}

export default function KeyValueEditor({
  value,
  onChange,
  loading,
}: KeyValueEditorProps) {
  const { $t } = useTransform()
  const [items, setItems] = useState<KeyValueItem[]>([])

  // 生成稳定的ID，基于key内容而不是索引
  const generateStableId = (key: string, existingIds: Set<string>): string => {
    if (key.trim()) {
      const baseId = `item_${key.trim()}`
      if (!existingIds.has(baseId)) {
        return baseId
      }
      // 如果key重复，添加后缀
      let counter = 1
      while (existingIds.has(`${baseId}_${counter}`)) {
        counter++
      }
      return `${baseId}_${counter}`
    }
    // 空key的情况，生成唯一ID
    return `empty_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // 将 JSON 字符串转换为 key-value 项列表
  const parseJsonToItems = (jsonStr: string): KeyValueItem[] => {
    try {
      const parsed = JSON.parse(jsonStr)
      if (
        typeof parsed !== 'object'
        || parsed === null
        || Array.isArray(parsed)
      ) {
        return []
      }

      const existingIds = new Set<string>()
      return Object.entries(parsed).map(([key, val]) => {
        const id = generateStableId(key, existingIds)
        existingIds.add(id)
        return {
          id,
          key,
          value: String(Number(val) || 0), // 确保转换为数字字符串
        }
      })
    }
    catch {
      return []
    }
  }

  // 将 key-value 项列表转换为 JSON 字符串
  const convertItemsToJson = (itemList: KeyValueItem[]): string => {
    const obj: Record<string, number> = {}

    itemList.forEach((item) => {
      if (item.key.trim()) {
        // 所有值都转换为数字类型
        obj[item.key.trim()] = Number(item.value) || 0
      }
    })

    return JSON.stringify(obj, null, 2)
  }

  // 使用防抖来延迟更新 JSON，避免频繁触发 onChange
  const { run: debouncedUpdateJson } = useDebounceFn(
    (itemList: KeyValueItem[]) => {
      const jsonStr = convertItemsToJson(itemList)
      onChange(jsonStr)
    },
    { wait: 300 },
  )

  // 初始化时解析 JSON - 简化版本，只在组件挂载时执行
  useEffect(() => {
    const parsedItems = parseJsonToItems(value)
    setItems(parsedItems)
  }, []) // 只在组件挂载时执行一次

  // 监听外部value变化，但只在组件内部没有数据时才更新
  useEffect(() => {
    if (items.length === 0) {
      const parsedItems = parseJsonToItems(value)
      setItems(parsedItems)
    }
  }, [value, items.length])

  // 添加新的 key-value 项
  const handleAddItem = () => {
    const newItem: KeyValueItem = {
      id: `new_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      key: '',
      value: '1', // 默认倍率为 1
    }
    const newItems = [...items, newItem]
    setItems(newItems)
    // 立即更新 JSON（添加操作不需要防抖）
    const jsonStr = convertItemsToJson(newItems)
    onChange(jsonStr)
  }

  // 删除 key-value 项
  const handleDeleteItem = (id: string) => {
    const newItems = items.filter((item) => item.id !== id)
    setItems(newItems)
    // 立即更新 JSON（删除操作不需要防抖）
    const jsonStr = convertItemsToJson(newItems)
    onChange(jsonStr)
  }

  // 更新 key-value 项 - 优化版本，避免频繁触发 onChange
  const handleUpdateItem = useCallback(
    (id: string, field: keyof KeyValueItem, newValue: string) => {
      setItems((prevItems) => {
        const newItems = prevItems.map((item) => {
          if (item.id === id) {
            const updatedItem = { ...item, [field]: newValue }

            // 如果更新的是值字段，确保是有效数字
            if (field === 'value') {
              const numValue = Number(newValue)
              if (!isNaN(numValue) || newValue === '') {
                updatedItem.value = newValue
              }
              else {
                // 如果输入的不是有效数字，保持原值
                return item
              }
            }

            return updatedItem
          }
          return item
        })

        // 使用防抖更新 JSON
        debouncedUpdateJson(newItems)
        return newItems
      })
    },
    [debouncedUpdateJson],
  )

  if (loading) {
    return <div className="text-center py-8">{$t('加载中...')}</div>
  }

  return (
    <div className="space-y-4">
      {/* 表头 */}
      <Row gutter={16} className="mb-4">
        <Col span={10}>
          <Text strong>{$t('分组名称')}</Text>
        </Col>
        {/* <Col span={10}>
          <Text strong>{$t("分组倍率")}</Text>
        </Col> */}
        <Col span={4}>
          <Text strong>{$t('操作')}</Text>
        </Col>
      </Row>

      {/* Key-Value 项列表 */}
      {items.map((item) => (
        <div key={item.id} className="border rounded-lg p-4 mb-2 bg-gray-50">
          <Row gutter={16} align="middle">
            <Col span={10}>
              <Input
                value={item.key}
                onChange={(e) =>
                  handleUpdateItem(item.id, 'key', e.target.value)}
                placeholder={$t('输入分组名称')}
              />
            </Col>
            {/* <Col span={10}>
              <Input
                type="number"
                value={item.value}
                onChange={(e) =>
                  handleUpdateItem(item.id, "value", e.target.value)
                }
                placeholder={$t("输入分组倍率")}
                min="0"
                step="0.1"
              />
            </Col> */}
            <Col span={4}>
              <Popconfirm
                title={$t('确定删除这个配置项吗？')}
                onConfirm={() => handleDeleteItem(item.id)}
                okText={$t('确定')}
                cancelText={$t('取消')}
              >
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  size="small"
                />
              </Popconfirm>
            </Col>
          </Row>
        </div>
      ))}

      {/* 添加按钮 */}
      <Button
        type="dashed"
        onClick={handleAddItem}
        icon={<PlusOutlined />}
        className="w-full"
      >
        {$t('添加配置项')}
      </Button>

      {/* 空状态提示 */}
      {items.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <Text type="secondary">{$t('暂无配置项，点击上方按钮添加')}</Text>
        </div>
      )}
    </div>
  )
}
