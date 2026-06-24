import type { ModelItem } from './types'

/**
 * 处理模型选择逻辑
 * 语音合成和实时语音模型（AudioSpeech / Realtime）只能单选，其他类型支持多选
 * @param model - 要选择的模型
 * @param selected - 是否选中
 * @param modelType - 模型类型
 * @param selectedModels - 当前已选中的模型列表
 * @param onModelSelect - 模型选择回调函数
 */
export const handleModelSelect = (
  model: ModelItem,
  selected: boolean,
  modelType: string | undefined,
  selectedModels: ModelItem[],
  onModelSelect: (model: ModelItem, selected: boolean) => void,
) => {
  if (modelType === 'AudioSpeech' || modelType === 'Realtime') {
    // 语音合成 / 实时语音：单选模式
    if (selected) {
      // 先取消所有已选择的模型
      selectedModels.forEach((m) => {
        if (m.id !== model.id) {
          onModelSelect(m, false)
        }
      })
      // 然后选择新模型
      onModelSelect(model, true)
    }
    else {
      // 取消选择
      onModelSelect(model, false)
    }
  }
  else {
    // 其他类型：多选模式
    onModelSelect(model, selected)
  }
}
