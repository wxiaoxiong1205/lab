import React, { useEffect } from 'react'
import { Button, Form, Input, Modal, Select } from 'antd'
import type { CreateMetricParams } from '../../services/modelEvaluationServices'

const { TextArea } = Input

interface CreateEvaluationIndicatorModalProps {
  visible: boolean
  onCancel: () => void
  onOk: (values: CreateMetricParams) => Promise<void>
  initialValues?: any
  isEdit?: boolean
  loading?: boolean
}

const CreateEvaluationIndicatorModal: React.FC<CreateEvaluationIndicatorModalProps> = ({
  visible,
  onCancel,
  onOk,
  initialValues,
  isEdit = false,
  loading = false,
}) => {
  const [form] = Form.useForm()

  useEffect(() => {
    if (visible) {
      if (initialValues) {
        form.setFieldsValue({
          name: initialValues.name,
          scoreLevel: initialValues.score_range
            ? parseInt(initialValues.score_range.split('-')[1]?.replace('分', '')) || 10 : 10,
          description: initialValues.description,
          scenario: initialValues.scenario,
        })
      }
      else {
        form.resetFields()
        form.setFieldsValue({
          scoreLevel: 3,
        })
      }
    }
  }, [visible, initialValues, form])

  const handleOk = async () => {
    try {
      const values = await form.validateFields()

      const params: CreateMetricParams = {
        name: values.name,
        description: values.description,
        score_range: `0-${values.scoreLevel}分`,
        scenario: values.scenario,
        sort_order: initialValues?.sort_order || 0,
        is_enabled: true,
      }

      await onOk(params)
      form.resetFields()
    }
    catch (error: any) {
      if (error?.errorFields) {
        console.error('表单验证失败:', error)
      }
    }
  }

  const handleCancel = () => {
    form.resetFields()
    onCancel()
  }

  const placeholderText = `请输入指标说明及分数说明，如评估生成文本中间。短语或句子的多样性，缩进或句子的多样性，每句话上手意。
0分：回答中间。短语或句子的使用极为单一，缺乏多样性，表达单调乏味，句法结构单一缺乏变化，句法结构单一缺乏变化。
1分：回答中的词汇，整体语言显示有吸引和表现。
2分：回答中整体语言显示有吸引和表现。
3分：回答中的词汇，短语或句子的使用较为多样，词汇选择准确目自然，句法结构尚有变化，句法结构尚有变化，句法结构尚有变`

  return (
    <Modal
      title={isEdit ? '编辑评估指标' : '创建评估指标'}
      open={visible}
      onCancel={handleCancel}
      width={720}
      footer={[
        <Button key="cancel" onClick={handleCancel} disabled={loading}>
          取消
        </Button>,
        <Button key="submit" type="primary" onClick={handleOk} loading={loading}>
          确定
        </Button>,
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        autoComplete="off"
      >
        <Form.Item
          label="指标名称"
          name="name"
          rules={[
            { required: true, message: '请输入指标名称' },
            { max: 50, message: '指标名称不能超过50个字符' },
          ]}
        >
          <Input
            placeholder="请输入指标名称"
            showCount
            maxLength={50}
          />
        </Form.Item>

        <Form.Item
          label="指标分值级数"
          name="scoreLevel"
          rules={[{ required: true, message: '请选择指标分值级数' }]}
          initialValue={3}
        >
          <Select placeholder="请选择指标分值级数">
            {[...Array(9)].map((_, idx) => {
              const value = idx + 2
              return (
                <Select.Option key={value} value={value}>
                  {value}
                </Select.Option>
              )
            })}
          </Select>
        </Form.Item>

        <Form.Item
          label="指标说明"
          name="description"
          rules={[
            { required: true, message: '请输入指标说明' },
          ]}
        >
          <TextArea
            placeholder={placeholderText}
            rows={8}
            showCount
          />
        </Form.Item>

        <Form.Item
          label="评估场景"
          name="scenario"
          rules={[{ required: true, message: '请选择评估场景' }]}
        >
          <Select placeholder="请选择或输入评估场景">
            <Select.Option value="开放性问答">开放性问答</Select.Option>
            <Select.Option value="对话生成">对话生成</Select.Option>
            <Select.Option value="文本摘要">文本摘要</Select.Option>
            <Select.Option value="内容创作">内容创作</Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default CreateEvaluationIndicatorModal
