import React from 'react'
import { Button, Card, Divider, Space, Tooltip, Typography } from 'antd'
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, DragOutlined } from '@ant-design/icons'
import OperatorConfigPanel from './OperatorConfigPanel'
import type { CleaningOperator, OperatorConfig } from '@/types/cleaning'

const { Text } = Typography
interface OperatorCardProps {
  operator: CleaningOperator
  config: OperatorConfig
  index: number
  total: number
  isDragging: boolean
  isDragOver: boolean
  onConfigChange: (params: any) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
  onDragStart: () => void
  onDragEnter: () => void
  onDragLeave: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
  onDragEnd?: () => void
}
/**
 * 单个算子卡片组件
 */
const OperatorCard: React.FC<OperatorCardProps> = ({ operator, config, index, total, isDragging, isDragOver, onConfigChange, onMoveUp, onMoveDown, onRemove, onDragStart, onDragEnter, onDragLeave, onDragOver, onDrop, onDragEnd }) => {
  return (
    <Card
      className="mb-[12px] cursor-move"
      key={`${config.operator_id}-${index}`}
      size="small"
      style={{
      // opacity: isDragging ? 0.5 : 1,
      // border: isDragOver ? '2px dashed #1890ff' : '1px solid #d9d9d9',
      // backgroundColor: isDragOver ? '#f0f7ff' : '#fff',
        transition: 'all 0.2s ease',
      }}
      draggable
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={(e) => {
      // 确保拖拽结束时重置样式
        if (onDragEnd) {
          onDragEnd()
        }
      }}
      title={(
        <Space>
          <DragOutlined className="text-[var(--lab-color-placeholder)] cursor-move" />
          <Text strong>
            {index + 1}
            .
            {' '}
            {operator.name}
          </Text>
        </Space>
      )}
      extra={(
        <Space>
          <Tooltip title="上移">
            <Button type="text" icon={<ArrowUpOutlined />} onClick={onMoveUp} disabled={index === 0} />
          </Tooltip>
          <Tooltip title="下移">
            <Button type="text" icon={<ArrowDownOutlined />} onClick={onMoveDown} disabled={index === total - 1} />
          </Tooltip>
          <Tooltip title="删除">
            <Button type="text" danger icon={<DeleteOutlined />} onClick={onRemove} />
          </Tooltip>
        </Space>
      )}
    >
      <div className="mb-2">
        <Text type="secondary">{operator.description}</Text>
      </div>
      {(() => {
        // 检查params_schema中是否有默认值
        const hasDefaultValues = (paramsSchema?: Record<string, any>): boolean => {
          if (!paramsSchema || typeof paramsSchema !== 'object')
            return false
          return Object.values(paramsSchema).some((schema) => schema && typeof schema === 'object' && 'default' in schema)
        }
        // 只有当算子有params_schema且包含默认值时才显示参数配置
        const hasDefaultParams = hasDefaultValues(operator.params_schema)
        if (!hasDefaultParams) {
          return null
        }
        const configPanel = (<OperatorConfigPanel operator={operator} config={config} onConfigChange={onConfigChange} />)
        if (!configPanel) {
          return null
        }
        return (
          <div className="mt-4">
            <Divider className="my-3" orientation="left">
              <Text strong className="text-[13px] text-[var(--lab-color-text-secondary)]">
                参数配置
              </Text>
            </Divider>
            <div
              className="p-[12px] rounded-[4px]"
              style={{
                backgroundColor: '#fafafa',
                border: '1px solid #f0f0f0',
              }}
            >
              {configPanel}
            </div>
          </div>
        )
      })()}
    </Card>
  )
}
export default OperatorCard
