import React from 'react'
import { Cascader, Form, Select } from 'antd'

const { Option } = Select
interface ModelSelectorProps {
  form: any
  baseModels: any[]
  trainedModels: any[]
  modelVersions: any[]
  selectedModelType: 'base' | 'trained' | null
  onModelChange: (value: string, option: any) => void
  loading?: boolean
}
/**
 * 模型选择器组件
 */
const ModelSelector: React.FC<ModelSelectorProps> = ({ form, baseModels, trainedModels, modelVersions, selectedModelType, onModelChange, loading = false }) => {
  const options = [
    {
      value: '基础模型',
      label: '基础模型',
      modelType: 'base',
      children: baseModels.map((model) => ({
        key: `base-${model.id}`,
        value: model.name,
        modelType: 'base',
        label: model.name,
      })),
    },
    {
      value: '模型管理',
      label: '模型管理',
      modelType: 'trained',
      children: trainedModels.map((model) => ({
        key: `trained-${model.id}`,
        value: model.model_name,
        modelType: 'trained',
        label: model.model_name,
      })),
    },
  ]
  return (
    <>
      <Form.Item label="待推理模型" name="model_to_infer" rules={[{ required: true, message: '请选择待推理模型' }]}>
        <Cascader
          className="w-[400px]"
          options={options}
          placeholder="请选择待推理模型"
          onChange={(value, option) => {
            if (value && value.length >= 2) {
              const modelName = value[1]
              onModelChange(modelName, option[0])
              form.setFieldsValue({
                model_to_infer: modelName, // 存储字符串而非数组
              })
            }
          }}
        />
      </Form.Item>

      {selectedModelType === 'trained' && (
        <Form.Item label="模型版本" name="model_version" rules={[{ required: true, message: '请选择模型版本' }]}>
          <Select placeholder="请选择模型版本" className="w-[400px]" loading={loading} disabled={loading}>
            {modelVersions.map((version) => (
              <Option key={version.model_version} value={version.model_version}>
                {version.model_version}
              </Option>
            ))}
          </Select>
        </Form.Item>
      )}
    </>
  )
}
export default ModelSelector
