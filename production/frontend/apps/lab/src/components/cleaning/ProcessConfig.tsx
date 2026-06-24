import React from 'react'
import { Button, Popconfirm, Space } from 'antd'
import { DeleteOutlined, FileTextOutlined, SaveOutlined } from '@ant-design/icons'
import OperatorCard from './OperatorCard'
import SaveTemplateConfirm from './SaveTemplateModal'
import type { CleaningOperator, OperatorConfig } from '@/types/cleaning'
import dataCleanReminder from '@/assets/data_clean_reminder.png'

interface ProcessConfigProps {
  selectedOperators: OperatorConfig[]
  operatorConfigs: Record<string, any>
  draggedOperatorId: string | null
  dragOverIndex: number | null
  getOperatorInfo: (operatorId: string) => CleaningOperator | undefined
  onSaveAsTemplate: () => void
  onOpenTemplateModal: () => void
  onClearAll?: () => void // 清空所有算子
  onOperatorConfigChange: (operatorId: string, params: any) => void
  onOperatorMoveUp: (index: number) => void
  onOperatorMoveDown: (index: number) => void
  onOperatorRemove: (operatorId: string) => void
  onDragStart: (index: number) => void
  onDragEnter: (index: number) => void
  onDragLeave: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (index: number) => void
  onDragEnd?: () => void
  onOperatorDrop?: (operator: any, index?: number) => void // 从左侧拖拽算子到右侧
  saveTemplateLoading?: boolean // 保存模板的加载状态
}
/**
 * 清洗流程配置区域组件
 */
const ProcessConfig: React.FC<ProcessConfigProps> = ({ selectedOperators, operatorConfigs, draggedOperatorId, dragOverIndex, getOperatorInfo, onSaveAsTemplate, onOpenTemplateModal, onClearAll, onOperatorConfigChange, onOperatorMoveUp, onOperatorMoveDown, onOperatorRemove, onDragStart, onDragEnter, onDragLeave, onDragOver, onDrop, onDragEnd, onOperatorDrop, saveTemplateLoading = false }) => {
  // 处理从左侧拖拽算子到右侧
  const [isDragOverArea, setIsDragOverArea] = React.useState(false)
  const [dropIndex, setDropIndex] = React.useState<number | null>(null)
  const dropZoneRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const handleGlobalDragEnd = (e: DragEvent) => {
      // 重置所有拖拽相关状态
      setIsDragOverArea(false)
      setDropIndex(null)
      if (onDragEnd) {
        onDragEnd()
      }
    }
    document.addEventListener('dragend', handleGlobalDragEnd)
    return () => {
      document.removeEventListener('dragend', handleGlobalDragEnd)
    }
  }, [onDragEnd])
  // 检查是否是从左侧拖拽的算子
  const isExternalDrag = (e: React.DragEvent): boolean => {
    if (draggedOperatorId !== null) {
      return false
    }
    // 检查是否有拖拽数据（从左侧拖拽过来的算子会有数据）
    try {
      const types = Array.from(e.dataTransfer.types)
      return types.includes('application/json')
    }
    catch {
      return false
    }
  }
  const handleDragOver = (e: React.DragEvent) => {
    // 如果是右侧已有算子的拖拽排序，使用原有逻辑
    if (draggedOperatorId !== null) {
      onDragOver(e)
      return
    }
    // 从左侧拖拽算子
    if (isExternalDrag(e)) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
      setIsDragOverArea(true)
    }
  }
  const handleDragLeave = (e: React.DragEvent) => {
    // 如果是右侧已有算子的拖拽排序，使用原有逻辑
    if (draggedOperatorId !== null) {
      onDragLeave()
      return
    }
    // 从左侧拖拽算子
    e.preventDefault()
    e.stopPropagation()
    // 只有当离开整个区域时才清除状态
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOverArea(false)
      setDropIndex(null)
    }
  }
  const handleDrop = (e: React.DragEvent, index?: number) => {
    e.preventDefault()
    e.stopPropagation()
    // 如果是右侧已有算子的拖拽排序，使用原有逻辑
    if (draggedOperatorId !== null && index !== undefined) {
      onDrop(index)
    }
    // 从左侧拖拽算子
    if (onOperatorDrop) {
      try {
        const operatorData = e.dataTransfer.getData('application/json')
        if (operatorData) {
          const operator = JSON.parse(operatorData)
          onOperatorDrop(operator, index)
        }
      }
      catch (error) {
        console.error('解析拖拽数据失败:', error)
      }
    }
    // 重置本地拖拽状态
    setIsDragOverArea(false)
    setDropIndex(null)
  }
  // 处理放置区域的拖拽悬停
  const handleDropZoneDragOver = (e: React.DragEvent, index: number) => {
    // 只处理从左侧拖拽的算子
    if (draggedOperatorId === null && isExternalDrag(e)) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
      setIsDragOverArea(true)
      setDropIndex(index)
    }
  }
  const handleDropZoneDragLeave = (e: React.DragEvent) => {
    // 只处理从左侧拖拽的算子
    if (draggedOperatorId === null) {
      e.preventDefault()
      e.stopPropagation()
      // 检查是否真的离开了放置区域
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setDropIndex(null)
      }
    }
  }
  return (
    <div>
      <div className="mb-4 flex justify-between">
        <Space>
          <SaveTemplateConfirm loading={saveTemplateLoading} onConfirm={onSaveAsTemplate}>
            <Button className="create-cleaning-task-save-template-btn" icon={<SaveOutlined />} disabled={selectedOperators.length === 0}>
              保存为模板
            </Button>
          </SaveTemplateConfirm>
          <Button className="create-cleaning-task-template-btn" icon={<FileTextOutlined />} onClick={onOpenTemplateModal}>
            清洗模板
          </Button>
          {onClearAll && (
            <Popconfirm title="确定要清空所有算子吗？" description="此操作将清空当前配置的所有清洗算子，且无法撤销。" onConfirm={onClearAll} okText="确定" cancelText="取消">
              <Button className="create-cleaning-task-clear-btn" icon={<DeleteOutlined />} danger disabled={selectedOperators.length === 0}>
                清空算子
              </Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      <div
        className={`create-cleaning-task-flow-drop-area${selectedOperators.length === 0 ? ' is-empty' : ''}${isDragOverArea ? ' is-drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e)}
      >
        {selectedOperators.length === 0 ? (
          <div className={`create-cleaning-task-empty-flow${isDragOverArea ? ' is-drag-over' : ''}`}>
            <img className="create-cleaning-task-empty-icon" src={dataCleanReminder} alt="" />
            <div className="create-cleaning-task-empty-title">暂无配置的清洗流程</div>
            <div className="create-cleaning-task-empty-desc">
              {isDragOverArea
                ? '释放鼠标以添加算子到流程中'
                : '请在左侧选择清洗算子，或直接拖拽算子到此区域'}
            </div>
          </div>
        ) : (
          <div ref={dropZoneRef}>
            {selectedOperators.map((config, index) => {
              const operator = getOperatorInfo(config.operator_id)
              if (!operator)
                return null
              const isDragging = draggedOperatorId === config.operator_id
              const isDragOver = dragOverIndex === index
              return (
                <div
                  key={`${config.operator_id}-${index}`}
                  className={`create-cleaning-task-flow-item${draggedOperatorId !== null ? ' is-sorting' : ''}${isDragging ? ' is-dragging' : ''}`}
                >
                  {/* 在每个算子前添加放置区域 */}
                  <div
                    className={`create-cleaning-task-insert-zone${isDragOverArea && dropIndex === index ? ' is-active' : ''}`}
                    onDragOver={(e) => handleDropZoneDragOver(e, index)}
                    onDragLeave={handleDropZoneDragLeave}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleDrop(e, index)
                    }}
                  >
                    {isDragOverArea && dropIndex === index && (
                      <div className="create-cleaning-task-insert-hint">
                        释放鼠标以在此位置插入算子
                      </div>
                    )}
                  </div>
                  <OperatorCard operator={operator} config={config} index={index} total={selectedOperators.length} isDragging={isDragging} isDragOver={isDragOver} onConfigChange={(params) => onOperatorConfigChange(config.operator_id, params)} onMoveUp={() => onOperatorMoveUp(index)} onMoveDown={() => onOperatorMoveDown(index)} onRemove={() => onOperatorRemove(config.operator_id)} onDragStart={() => onDragStart(index)} onDragEnter={() => onDragEnter(index)} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={() => onDrop(index)} onDragEnd={onDragEnd} />
                </div>
              )
            })}
            {/* 在最后一个算子后添加放置区域 */}
            <div
              className={`create-cleaning-task-insert-zone is-tail${isDragOverArea && dropIndex === selectedOperators.length ? ' is-active' : ''}`}
              onDragOver={(e) => handleDropZoneDragOver(e, selectedOperators.length)}
              onDragLeave={handleDropZoneDragLeave}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleDrop(e, selectedOperators.length)
              }}
            >
              {isDragOverArea && dropIndex === selectedOperators.length && (
                <div className="create-cleaning-task-insert-hint">
                  释放鼠标以在此位置插入算子
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
export default ProcessConfig
