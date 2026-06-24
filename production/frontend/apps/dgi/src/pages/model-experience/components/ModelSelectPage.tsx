import React, { useMemo, useState } from 'react'
import { Empty, Spin, Tabs } from 'antd'
import { useRequest } from 'ahooks'
import ModelSelectModal from './ModelSelectModal'
import type { ModelItem } from './types'
import { handleModelSelect as handleModelSelectUtil } from './modelSelect'
import { useTransform } from '@/locales'
import type Transform from '@/locales/translation.json'
import ModelCard from '@/components/model-card'
import { apiModelList } from '@/services/api'

interface ModelSelectPageProps {
  modelType?: string
  selectedModels: ModelItem[]
  onModelSelect: (model: ModelItem, selected: boolean) => void
}

const ModelSelectPage: React.FC<ModelSelectPageProps> = ({
  modelType,
  selectedModels,
  onModelSelect,
}) => {
  const { $t } = useTransform()
  const [modalVisible, setModalVisible] = useState(false)
  const model_mapping = {
    'ChatCompletions,DeepReasoning': $t('可选择文本生成与深度推理模型服务，立即开启体验'),
    'Vision_Language': $t('可选择VL模型服务，立即开启体验'),
    'Rerank': $t('可选择重排模型服务，立即开启体验'),
    'AudioTranscription': $t('可选择语音模型服务，立即开启体验'),
    'Realtime': $t('可选择实时语音识别模型服务，立即开启体验'),
    'AudioSpeech': $t('可选择语音模型服务，立即开启体验'),
  }

  // 语音类：Tab 切换 语音识别(AudioTranscription) / 实时语音识别(Realtime) / 语音合成(AudioSpeech)
  const isAudioType = modelType?.includes('AudioTranscription')
    || modelType?.includes('Realtime')
    || modelType?.includes('AudioSpeech')
  const [audioTab, setAudioTab] = useState<'AudioTranscription' | 'Realtime' | 'AudioSpeech'>('AudioTranscription')
  const effectiveModelType = useMemo(
    () => (isAudioType ? audioTab : modelType),
    [isAudioType, audioTab, modelType],
  )

  // 获取模型列表（只获取前3个）
  const { data = { items: [], total: 0 }, loading } = useRequest(
    () =>
      apiModelList({
        page_number: 1,
        page_size: 6,
        category: effectiveModelType,
        view: 'usable',
      }).then((res) => res?.data || { items: [], total: 0 }),
    {
      refreshDeps: [effectiveModelType],
    },
  )

  // 处理模型选择：语音合成模型只能单选
  const handleModelSelect = (model: ModelItem, selected: boolean) => {
    handleModelSelectUtil(model, selected, effectiveModelType, selectedModels, onModelSelect)
  }

  return (
    <div>
      <div className="text-center mb-10">
        {isAudioType && (
          <Tabs
            activeKey={audioTab}
            onChange={(key) => {
              // 切换 tab 时清空选择的模型
              selectedModels.forEach((model) => {
                onModelSelect(model, false)
              })
              setAudioTab(key as 'AudioTranscription' | 'Realtime' | 'AudioSpeech')
            }}
            className="inline-flex min-w-full"
            items={[
              { key: 'AudioTranscription', label: $t('语音识别' as keyof typeof Transform) },
              { key: 'Realtime', label: $t('实时语音识别' as keyof typeof Transform) },
              { key: 'AudioSpeech', label: $t('语音合成' as keyof typeof Transform) },
            ]}
          />
        )}
        <h2 className="text-2xl font-bold mb-4">
          {model_mapping[effectiveModelType as keyof typeof model_mapping] ?? model_mapping[modelType as keyof typeof model_mapping]}
        </h2>
        {effectiveModelType === 'Realtime'
          ? (
              <p className="text-gray-500 mb-4">
                {$t('实时语音识别暂不支持模型对比，仅支持单模型体验')}
              </p>
            )
          : effectiveModelType !== 'AudioSpeech' && (
            <p className="text-gray-500 mb-4">
              {$t('可以选择多个模型进行对比，最多可选择3个模型同时对比')}
            </p>
          )}
      </div>
      <Spin spinning={loading}>
        {data.items.length ? (
          <div className="flex flex-col items-center">
            <div className="flex flex-wrap gap-4 justify-center w-full px-16">
              {data.items?.slice(0, 3).map((item: ModelItem) => (
                <ModelCard
                  key={item.id}
                  item={item}
                  selectable
                  selectMode={effectiveModelType === 'AudioSpeech' || effectiveModelType === 'Realtime' ? 'single' : 'multiple'}
                  selected={selectedModels.some((m) => m.id === item.id)}
                  onSelect={(item, selected) => {
                    handleModelSelect(item, selected)
                  }}
                  className="!max-w-[calc((100%-32px)/3)]"
                />
              ))}
            </div>
            {data.items.length > 3 && (
              <div
                className="mt-4 w-[400px] h-[42px] flex items-center justify-center text-blue-500 hover:text-blue-600 hover:bg-blue-100 cursor-pointer rounded-md"
                onClick={() => setModalVisible(true)}
              >
                {$t('更多模型')}
              </div>
            )}
          </div>
        ) : (
          <Empty description={$t('暂无模型')} className="mt-24" />
        )}
      </Spin>

      <ModelSelectModal
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        modelType={effectiveModelType}
        selectedModels={selectedModels}
        onModelSelect={handleModelSelect}
      />
    </div>
  )
}

export default ModelSelectPage
