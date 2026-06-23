import React, { useState } from 'react'
import { Button, Input, Modal, Spin } from 'antd'
import { useRequest } from 'ahooks'
import type { ModelItem } from './types'
import { useTransform } from '@/locales'
import ModelCard from '@/components/model-card'
import { apiModelList } from '@/services/api'

interface ChangeModelModalProps {
  open: boolean
  onCancel: () => void
  onConfirm: (model: ModelItem) => void
  modelType?: string
  currentModel: ModelItem
  excludeModels: ModelItem[]
}

const ChangeModelModal: React.FC<ChangeModelModalProps> = ({
  open,
  onCancel,
  onConfirm,
  modelType,
  currentModel,
  excludeModels,
}) => {
  const { $t } = useTransform()
  const [searchText, setSearchText] = useState('')
  const [selectedModel, setSelectedModel] = useState<ModelItem | null>(null)

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

  // 过滤模型列表：排除当前模型和已选择的其他模型，只显示可用的模型
  const filteredItems = data.items.filter((item: ModelItem) => {
    const matchesSearch = item.model_name.toLowerCase().includes(searchText.toLowerCase())
    const isNotCurrent = item.id !== currentModel.id
    const isNotExcluded = !excludeModels.some((m) => m.id === item.id)
    const isUsable = item.can_use === 'usable'
    return matchesSearch && isNotCurrent && isNotExcluded && isUsable
  })

  const handleModelSelect = (model: ModelItem, selected: boolean) => {
    setSelectedModel(selected ? model : null)
  }

  const handleConfirm = () => {
    if (selectedModel) {
      onConfirm(selectedModel)
      setSelectedModel(null)
      onCancel() // 关闭弹窗
    }
  }

  const handleCancel = () => {
    setSelectedModel(null)
    onCancel()
  }

  return (
    <Modal
      open={open}
      onCancel={handleCancel}
      title={$t('更换模型')}
      width="70%"
      footer={(
        <div className="flex justify-end gap-2">
          <Button onClick={handleCancel}>
            {$t('取消')}
          </Button>
          <Button
            type="primary"
            onClick={handleConfirm}
            disabled={!selectedModel}
          >
            {$t('确定')}
          </Button>
        </div>
      )}
    >
      <Spin spinning={loading}>
        <div className="flex flex-col gap-4">
          <div className="text-gray-600 mb-2">
            当前模型：
            <span className="font-medium text-gray-900">{currentModel.model_name}</span>
          </div>
          <Input.Search
            placeholder={$t('请输入模型名称')}
            allowClear
            onChange={(e) => setSearchText(e.target.value)}
            className="max-w-md mx-auto"
          />
          <div className="max-h-[60vh] overflow-y-auto py-4">
            <div className="flex flex-wrap gap-4 justify-center">
              {filteredItems.map((item: ModelItem) => (
                <ModelCard
                  key={item.id}
                  item={item}
                  selectable
                  selectMode="single"
                  selected={selectedModel?.id === item.id}
                  onSelect={(item, selected) => handleModelSelect(item, selected)}
                />
              ))}
            </div>
            {filteredItems.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                {$t('没有可用的模型')}
              </div>
            )}
          </div>
        </div>
      </Spin>
    </Modal>
  )
}

export default ChangeModelModal
