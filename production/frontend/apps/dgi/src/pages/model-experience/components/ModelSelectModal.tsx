import React, { useState } from 'react'
import { Button, Input, Modal, Spin } from 'antd'
import { useRequest } from 'ahooks'
import type { ModelItem } from './types'
import { handleModelSelect as handleModelSelectUtil } from './modelSelect'
import { useTransform } from '@/locales'
import ModelCard from '@/components/model-card'
import { apiModelList } from '@/services/api'

interface ModelSelectModalProps {
  open: boolean
  onCancel: () => void
  onConfirm?: () => void
  modelType?: string
  selectedModels: ModelItem[]
  onModelSelect: (model: ModelItem, selected: boolean) => void
}

const ModelSelectModal: React.FC<ModelSelectModalProps> = ({
  open,
  onCancel,
  onConfirm,
  modelType,
  selectedModels,
  onModelSelect,
}) => {
  const { $t } = useTransform()
  const [searchText, setSearchText] = useState('')

  // 获取所有模型列表
  const { data = { items: [], total: 0 }, loading } = useRequest(
    () =>
      apiModelList({
        page_number: 1,
        page_size: 999, // 获取所有模型
        category: modelType,
        view: 'usable',
      }).then((res) => res?.data || { items: [], total: 0 }),
    {
      refreshDeps: [modelType],
    },
  )

  // 过滤模型列表
  const filteredItems = data.items.filter((item: ModelItem) =>
    item.model_name.toLowerCase().includes(searchText.toLowerCase()),
  )

  // 处理模型选择：语音合成 / 实时语音模型只能单选
  const handleModelSelect = (model: ModelItem, selected: boolean) => {
    handleModelSelectUtil(model, selected, modelType, selectedModels, onModelSelect)
  }

  const handleConfirm = () => {
    onConfirm?.()
    onCancel() // 关闭弹窗
  }

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      title={$t('选择模型')}
      width="70%"
      footer={(
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel}>
            {$t('取消')}
          </Button>
          <Button type="primary" onClick={handleConfirm}>
            {$t('确定')}
          </Button>
        </div>
      )}
    >
      <Spin spinning={loading}>
        <div className="flex flex-col gap-4">
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
                  selectMode={modelType === 'AudioSpeech' || modelType === 'Realtime' ? 'single' : 'multiple'}
                  selected={selectedModels.some((m) => m.id === item.id)}
                  onSelect={(item, selected) => {
                    handleModelSelect(item, selected)
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </Spin>
    </Modal>
  )
}

export default ModelSelectModal
