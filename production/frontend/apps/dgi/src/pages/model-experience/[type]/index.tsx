import React, { useEffect, useState } from 'react'
import { Button, Spin, Tag, message } from 'antd'
import { useParams, useSearchParams } from 'react-router-dom'
import ModelSelectPage from '../components/ModelSelectPage'
import ModelChatPage from '../components/ModelChatPage'
import { useTransform } from '@/locales'
import Title from '@/components/Title'
import { ModelExperienceTypeMenu, useSystemConfig } from '@/hooks/use-system-config'
import { apiModelList } from '@/services/api'

interface ModelItem {
  id: number
  model_name: string
  model_type: string
  description?: string
  logo?: string
  updated_time?: number
  model_count?: number
  category?: string
  security_policy?: string
  ability_count?: number
  data_level: string
}

const routeTypeMapModelType = {
  'text': 'ChatCompletions,DeepReasoning',
  'vision': 'Vision_Language',
  'vl-model': 'Vision_Language',
  'rerank': 'Rerank',
  'transcriptions': 'AudioTranscription,Realtime,AudioSpeech',
}

const ModelExperiencePage = () => {
  const params = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { $t } = useTransform()
  const [selectedModels, setSelectedModels] = useState<ModelItem[]>([])

  // 标题
  const { type } = useParams()
  const title = ModelExperienceTypeMenu[type || 'text']

  // 如果URL中有models参数，默认就显示聊天界面
  const hasModelsParam = searchParams.get('models')
  const [showChat, setShowChat] = useState(!!hasModelsParam)
  const [loading, setLoading] = useState(!!hasModelsParam)

  // 获取模型类型
  const { modelTypeOptions } = useSystemConfig(true)

  // 处理URL参数中的models
  useEffect(() => {
    const modelNames = searchParams.get('models')?.split(',') || []
    if (modelNames.length > 0 && selectedModels.length === 0) {
      // 获取模型列表并找到匹配的模型
      apiModelList({
        page_number: 1,
        page_size: 100,
        category:
          routeTypeMapModelType[
            params.type as keyof typeof routeTypeMapModelType
          ],
      }).then((res) => {
        const models = res.data?.items?.filter(
          (item: ModelItem) => modelNames.includes(item.model_name),
        )
        if (models?.length > 0) {
          setSelectedModels(models)
          setShowChat(true)
        }
        else {
          console.warn('未找到匹配的模型:', modelNames)
          // 如果没找到模型，回到选择页面
          setShowChat(false)
        }
      }).catch((error) => {
        console.error('获取模型列表失败:', error)
        setShowChat(false)
      }).finally(() => {
        setLoading(false)
      })
    }
  }, [searchParams, params.type, selectedModels.length])

  useEffect(() => {
    setShowChat(false)
    setSelectedModels([])
  }, [params.type])

  const handleStartExperience = () => {
    if (selectedModels.some((model) => model.category?.includes('Realtime')) && selectedModels.length > 1) {
      message.warning('实时语音识别仅支持单模型体验')
      return
    }
    if (selectedModels.length > 3) {
      message.warning('最多只能选择3个模型进行对比')
      return
    }
    setShowChat(true)
  }

  const handleBackToSelect = () => {
    // 先移除URL中的models参数
    const newSearchParams = new URLSearchParams(searchParams)
    newSearchParams.delete('models')
    setSearchParams(newSearchParams, { replace: true })
    // 处理完Params后再改变showChat的值
    setTimeout(() => {
      setShowChat(false)
      setSelectedModels([])
    }, 0)
  }

  const handleModelSelect = (model: ModelItem, selected: boolean) => {
    if (selected) {
      setSelectedModels((prev) => [...prev, model])
    }
    else {
      setSelectedModels((prev) => prev.filter((m) => m.id !== model.id))
    }
  }

  return (
    <div className="h-full flex flex-col">
      {showChat ? (
        loading && selectedModels.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Spin size="large" />
              <div className="mt-4 text-gray-500">正在加载模型...</div>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0">
            <ModelChatPage
              models={selectedModels}
              onBack={handleBackToSelect}
              onModelsChange={setSelectedModels}
            />
          </div>
        )
      ) : (
        <div>
          <Title
            title={title}
          />
          <div className="overflow-auto">
            <ModelSelectPage
              modelType={
                routeTypeMapModelType[
                  params.type as keyof typeof routeTypeMapModelType
                ]
              }
              selectedModels={selectedModels}
              onModelSelect={handleModelSelect}
            />
          </div>
          {selectedModels.length > 0 ? (
            <div className="flex justify-center flex-col items-center mt-4 pt-6">
              <h3 className="text-lg text-gray-500 flex items-center flex-wrap justify-center">
                {$t('已选择')}
                <div className="flex flex-wrap mx-2">
                  {selectedModels.map((model) => (
                    <Tag
                      key={model.id}
                      closable
                      onClose={() => handleModelSelect(model, false)}
                      className="text-base"
                    >
                      {model.model_name}
                    </Tag>
                  ))}
                </div>
                {selectedModels.length === 1
                  ? $t('开启模型体验吧')
                  : $t('开启模型对比体验吧')}
              </h3>
              <div className="mt-4">
                <Button
                  type="primary"
                  size="large"
                  className="w-[240px]"
                  onClick={handleStartExperience}
                  disabled={selectedModels.length === 0}
                >
                  {$t('立即体验')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-center mt-8 pt-6 text-xl">
              {$t('请选择至少一个模型开始体验')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ModelExperiencePage
