import React, { useEffect, useMemo, useState } from 'react'
import { Checkbox, Collapse, Space, Typography } from 'antd'
import type { CleaningCategoryItem, CleaningOperator, OperatorConfig } from '@/types/cleaning'

const { Text } = Typography
const { Panel } = Collapse
interface OperatorSelectionProps {
  operatorsData: CleaningCategoryItem[]
  selectedOperators: OperatorConfig[]
  onOperatorToggle: (operator: CleaningOperator, checked: boolean) => void
}
/**
 * 算子选择区域组件
 */
const OperatorSelection: React.FC<OperatorSelectionProps> = ({ operatorsData = [], selectedOperators, onOperatorToggle }) => {
  // 默认展开所有分类
  const defaultActiveKeys = useMemo(() => operatorsData.map((category) => category.category), [operatorsData])
  const [activeKeys, setActiveKeys] = useState<string[]>([])
  const [isInitialized, setIsInitialized] = useState(false)
  // 跟踪每个算子的拖拽状态和鼠标按下位置
  const [dragStates, setDragStates] = useState<Record<string, {
    isDragging: boolean
    mouseDownPos: {
      x: number
      y: number
    } | null
  }>>({})
  // 当数据首次加载完成后，默认展开所有分类
  useEffect(() => {
    if (defaultActiveKeys.length > 0 && !isInitialized) {
      setActiveKeys(defaultActiveKeys)
      setIsInitialized(true)
    }
  }, [defaultActiveKeys, isInitialized])
  // 计算每个分类的选中状态
  const getCategoryCheckState = (category: CleaningCategoryItem) => {
    const categoryOperators = category.operators
    const selectedCount = categoryOperators.filter((op) => selectedOperators.some((selected) => selected.operator_id === op.type)).length
    if (selectedCount === 0) {
      return { checked: false, indeterminate: false }
    }
    else if (selectedCount === categoryOperators.length) {
      return { checked: true, indeterminate: false }
    }
    else {
      return { checked: false, indeterminate: true }
    }
  }
  // 处理分类全选/取消全选
  const handleCategoryToggle = (category: CleaningCategoryItem, checked: boolean) => {
    category.operators.forEach((operator) => {
      const isSelected = selectedOperators.some((op) => op.operator_id === operator.type)
      if (checked && !isSelected) {
        onOperatorToggle(operator, true)
      }
      else if (!checked && isSelected) {
        onOperatorToggle(operator, false)
      }
    })
  }
  if (!operatorsData || operatorsData.length === 0) {
    return (
      <div className="text-center p-10">
        <Text type="secondary">暂无可用算子</Text>
      </div>
    )
  }
  return (
    <Collapse
      activeKey={activeKeys}
      className="create-cleaning-task-operator-collapse"
      onChange={(keys) => setActiveKeys(keys as string[])}
      ghost
    >
      {operatorsData.map((category) => {
        const checkState = getCategoryCheckState(category)
        return (
          <Panel
            key={category.category}
            header={(
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={checkState.checked}
                  indeterminate={checkState.indeterminate}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation()
                    handleCategoryToggle(category, e.target.checked)
                  }}
                >
                  <Text strong className="text-[14px]">
                    {category.category_name}
                  </Text>
                </Checkbox>
                <Text type="secondary" className="text-[12px] ml-2">
                  (
                  {category.operators.length}
                  {' '}
                  个算子)
                </Text>
              </div>
            )}
          >
            <Space direction="vertical" className="w-full" size="small">
              {category.operators.map((operator) => {
                const isSelected = selectedOperators.some((op) => op.operator_id === operator.type)
                const operatorState = dragStates[operator.type] || { isDragging: false, mouseDownPos: null }
                return (
                  <div
                    className={`create-cleaning-task-operator-item${isSelected ? ' is-selected' : ''}${operatorState.isDragging ? ' is-dragging' : ''}`}
                    key={operator.type}
                    draggable
                    onDragStart={(e) => {
                    // 标记开始拖拽
                      setDragStates((prev) => ({
                        ...prev,
                        [operator.type]: { ...(prev[operator.type] || { mouseDownPos: null }), isDragging: true },
                      }))
                      // 检查是否是从 Checkbox 区域开始的拖拽
                      const target = e.target as HTMLElement
                      if (target.closest('.ant-checkbox-wrapper') || target.closest('.ant-checkbox') || target.closest('.ant-checkbox-input')) {
                        e.preventDefault()
                        setDragStates((prev) => ({
                          ...prev,
                          [operator.type]: { isDragging: false, mouseDownPos: null },
                        }))
                        return
                      }
                      e.dataTransfer.setData('application/json', JSON.stringify(operator))
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    onDragEnd={() => {
                      setTimeout(() => {
                        setDragStates((prev) => ({
                          ...prev,
                          [operator.type]: { isDragging: false, mouseDownPos: null },
                        }))
                      }, 100)
                    }}
                    onMouseDown={(e) => {
                    // 记录鼠标按下位置，用于判断是否是拖拽
                      setDragStates((prev) => ({
                        ...prev,
                        [operator.type]: {
                          isDragging: false,
                          mouseDownPos: { x: e.clientX, y: e.clientY },
                        },
                      }))
                      // 如果点击的是 Checkbox ，不改变鼠标样式，也不允许拖拽
                      const target = e.target as HTMLElement
                      if (target.closest('.ant-checkbox-wrapper') || target.closest('.ant-checkbox') || target.closest('.ant-checkbox-input')) {
                      // 阻止拖拽
                        e.currentTarget.draggable = false
                        setDragStates((prev) => ({
                          ...prev,
                          [operator.type]: { isDragging: false, mouseDownPos: null },
                        }))
                        return
                      }
                      // 允许拖拽并改变鼠标样式
                      e.currentTarget.draggable = true
                    }}
                    onClick={(e) => {
                    // 如果点击的是 Checkbox 区域，不处理点击事件（由 Checkbox 自己处理）
                      const target = e.target as HTMLElement
                      if (target.closest('.ant-checkbox-wrapper') || target.closest('.ant-checkbox') || target.closest('.ant-checkbox-input')) {
                        return
                      }
                      // 如果发生了拖拽，不触发点击事件
                      if (operatorState.isDragging) {
                        return
                      }
                      // 检查鼠标移动距离，如果移动距离较大，说明是拖拽而不是点击
                      if (operatorState.mouseDownPos) {
                        const moveDistance = Math.sqrt((e.clientX - operatorState.mouseDownPos.x) ** 2
                          + (e.clientY - operatorState.mouseDownPos.y) ** 2)
                        if (moveDistance > 5) {
                        // 移动距离超过 5px，认为是拖拽
                          return
                        }
                      }
                      // 点击算子 body 区域，切换选中状态
                      onOperatorToggle(operator, !isSelected)
                    }}
                  >
                    <div
                      onMouseDown={(e) => {
                      // 阻止拖拽开始
                        e.stopPropagation()
                      }}
                      onClick={(e) => {
                      // 阻止事件冒泡，避免触发父元素的点击事件
                        e.stopPropagation()
                      }}
                      className="inline-block"
                    >
                      <Checkbox
                        checked={isSelected}
                        onChange={(e) => {
                        // 确保 Checkbox 的 onChange 正常工作
                          onOperatorToggle(operator, e.target.checked)
                        }}
                        onClick={(e) => {
                        // 阻止事件冒泡，避免触发父元素的点击事件
                          e.stopPropagation()
                        }}
                      >
                        <Text strong>{operator.name}</Text>
                      </Checkbox>
                    </div>
                    <div className="mt-2 ml-6">
                      <Text type="secondary" className="text-[12px]">
                        {operator.description}
                      </Text>
                    </div>
                  </div>
                )
              })}
            </Space>
          </Panel>
        )
      })}
    </Collapse>
  )
}
export default OperatorSelection
