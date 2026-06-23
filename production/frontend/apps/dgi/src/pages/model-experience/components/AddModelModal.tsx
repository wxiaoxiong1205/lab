import React, { useState } from 'react'
import { Button, Input, Modal, Spin } from 'antd'
import { useRequest } from 'ahooks'
import type { ModelItem } from './types'
import { useTransform } from '@/locales'
import ModelCard from '@/components/model-card'
import { apiModelList } from '@/services/api'

interface AddModelModalProps {
  open: boolean
  onCancel: () => void
  onConfirm: (models: ModelItem[]) => void
  modelType?: string
  selectedModels: ModelItem[]
}

const AddModelModal: React.FC<AddModelModalProps> = ({
  open,
  onCancel,
  onConfirm,
  modelType,
  selectedModels,
}) => {
  const { $t } = useTransform()
  const [searchText, setSearchText] = useState('')
  const [selectedModelsInModal, setSelectedModelsInModal] = useState<ModelItem[]>([])

  // 计算最多还能选择多少个模型（实时计算，考虑弹窗内已选数量）
  const maxSelectable = 3 - selectedModels.length - selectedModelsInModal.length
  // 弹窗内最多能选择的数量（固定值，用于检查上限）
  const maxSelectableInModal = 3 - selectedModels.length

  // 获取所有模型列表
  const { data = { items: [], total: 0 }, loading } = useRequest(
    () =>
      apiModelList({
        page_number: 1,
        page_size: 999, // 获取所有模型
        category: modelType,
      }).then((res) => res?.data || { items: [], total: 0 }),
    {
      refreshDeps: [modelType],
    },
  )

  // 过滤模型列表：排除已选择的模型，只显示可用的模型
  const filteredItems = data.items.filter((item: ModelItem) => {
    const matchesSearch = item.model_name.toLowerCase().includes(searchText.toLowerCase())
    const isNotSelected = !selectedModels.some((m) => m.id === item.id)
    const isUsable = item.can_use === 'usable'
    return matchesSearch && isNotSelected && isUsable
  })

  const handleModelSelect = (model: ModelItem, selected: boolean) => {
    if (selected) {
      // 检查是否已达到最大数量
      if (selectedModelsInModal.length >= maxSelectableInModal) {
        return
      }
      setSelectedModelsInModal([...selectedModelsInModal, model])
    }
    else {
      setSelectedModelsInModal(selectedModelsInModal.filter((m) => m.id !== model.id))
    }
  }

  const handleConfirm = () => {
    if (selectedModelsInModal.length > 0) {
      onConfirm(selectedModelsInModal)
      setSelectedModelsInModal([])
      setSearchText('')
      onCancel() // 关闭弹窗
    }
  }

  const handleCancel = () => {
    setSelectedModelsInModal([])
    setSearchText('')
    onCancel()
  }

  // 判断某个模型是否可以被选择（未达到上限）
  const canSelectModel = (model: ModelItem) => {
    return selectedModelsInModal.length < maxSelectableInModal || selectedModelsInModal.some((m) => m.id === model.id)
  }

  return (
    <Modal
      open={open}
      onCancel={handleCancel}
      title={$t('添加模型')}
      width="70%"
      footer={(
        <div className="flex justify-end gap-2">
          <Button onClick={handleCancel}>
            {$t('取消')}
          </Button>
          <Button
            type="primary"
            onClick={handleConfirm}
            disabled={selectedModelsInModal.length === 0}
          >
            {$t('确定')}
          </Button>
        </div>
      )}
    >
      <Spin spinning={loading}>
        <div className="flex flex-col gap-6">
          {/* 已选择模型展示区域 */}
          {selectedModels.length > 0 && (
            <div className="border-b border-gray-200 pb-4">
              <div className="text-gray-600 mb-3 font-medium">
                {$t('已选择')}
              </div>
              <div className="flex flex-wrap gap-4">
                {selectedModels.map((model) => (
                  <ModelCard
                    key={model.id}
                    item={model}
                    selectable={false}
                    disableNavigation
                  />
                ))}
              </div>
            </div>
          )}

          {/* 可选择模型区域 */}
          <div>
            <div className="text-gray-600 mb-3 font-medium">
              {$t('可选择模型')}
              {maxSelectable > 0 && (
                <span className="text-sm text-gray-400 ml-2">
                  （最多还可选择
                  {' '}
                  {maxSelectable}
                  {' '}
                  个）
                </span>
              )}
            </div>
            <Input.Search
              placeholder={$t('请输入模型名称')}
              allowClear
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="max-w-md mb-4"
            />
            <div className="max-h-[50vh] overflow-y-auto py-4">
              <div className="flex flex-wrap gap-4">
                {filteredItems.map((item: ModelItem) => {
                  const isSelected = selectedModelsInModal.some((m) => m.id === item.id)
                  const isDisabled = !canSelectModel(item)
                  return (
                    <ModelCard
                      key={item.id}
                      item={item}
                      selectable
                      selectMode="multiple"
                      selected={isSelected}
                      disabled={isDisabled}
                      onSelect={(item, selected) => handleModelSelect(item, selected)}
                    />
                  )
                })}
              </div>
              {filteredItems.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  {$t('没有可用的模型')}
                </div>
              )}
            </div>
          </div>
        </div>
      </Spin>
    </Modal>
  )
}

export default AddModelModal
