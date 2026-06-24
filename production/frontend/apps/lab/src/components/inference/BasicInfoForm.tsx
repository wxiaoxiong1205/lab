import React from 'react'
import { Form, Input } from 'antd'

const { TextArea } = Input

interface BasicInfoFormProps {
  form: any
  validateDatasetName: (
    _: any,
    value: string
  ) => Promise<void>
}

/**
 * 基础信息表单组件
 */
const BasicInfoForm: React.FC<BasicInfoFormProps> = ({
  form,
  validateDatasetName,
}) => {
  return (
    <>
      <Form.Item
        label={(
          <span className="create-inference-name-label-content">
            <span>数据集名称</span>
            <span className="create-inference-name-label-tip">
              支持中英文、数字、下划线、中划线不能以下划线或中划线开头，2-64个字符
            </span>
          </span>
        )}
        name="name"
        className="create-inference-name-field"
        rules={[
          { required: true, message: '请输入数据集名称' },
          { min: 2, max: 64, message: '数据集名称长度为2-64个字符' },
          { pattern: /^[^-_].*$/, message: '数据集名称不能以下划线和中划线开头' },
          { pattern: /^(?![_-])[\u4E00-\u9FA5a-zA-Z0-9_.-]+$/, message: '只支持中英文、数字、小数点、中划线(-)、下划线(_)，且不能以下划线和中划线开头，不允许空格和特殊符号' },
        ]}
        validateTrigger={['onChange', 'onBlur']}
      >
        <Input
          placeholder="请输入数据集名称"
          className="create-inference-name-input"
          maxLength={64}
          showCount
        />
      </Form.Item>

      <Form.Item label="描述" name="description">
        <TextArea
          placeholder="请输入推理结果数据集描述"
          maxLength={1000}
          showCount
          rows={4}
          className="create-inference-description-input"
        />
      </Form.Item>
    </>
  )
}

export default BasicInfoForm
