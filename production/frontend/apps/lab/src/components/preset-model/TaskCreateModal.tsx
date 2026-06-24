import React, { useState } from 'react'
import { Alert, Button, Col, Form, Input, Modal, Row, Select, Space, Tag, Typography, message } from 'antd'
import { BranchesOutlined, BulbOutlined, ExperimentOutlined, PartitionOutlined, PictureOutlined, RocketOutlined, ScanOutlined, TableOutlined } from '@ant-design/icons'
import type { PresetModelTemplate } from '../../mock/mockPresetModelService'
import { mockPresetModelService } from '../../mock/mockPresetModelService'

const { Text } = Typography
const { TextArea } = Input
const { Option } = Select
interface TaskCreateModalProps {
  visible: boolean
  onClose: () => void
  onSuccess: (taskId: string) => void
  initialTemplate?: PresetModelTemplate
}
// 任务类型选项 - 基于预设模板的扩展名称
const taskTypeOptions = [
  // 通用模型 - 计算机视觉
  { value: 'cv_single_classification', label: '图像分类-单图单标签', icon: <PictureOutlined /> },
  { value: 'cv_multi_classification', label: '图像分类-单图多标签', icon: <PictureOutlined /> },
  { value: 'cv_object_detection', label: '物体检测', icon: <ScanOutlined /> },
  { value: 'cv_instance_segmentation', label: '图像分割-实例分割', icon: <PartitionOutlined /> },
  { value: 'cv_semantic_segmentation', label: '图像分割-语义分割', icon: <BranchesOutlined /> },
  // 通用模型 - 机器学习
  { value: 'ml_tabular_detection', label: '表格数据检测', icon: <TableOutlined /> },
  // 行业模型
  { value: 'industry_finance_risk', label: '金融风控模型', icon: <BulbOutlined /> },
  { value: 'industry_medical_diagnosis', label: '医疗影像诊断', icon: <ExperimentOutlined /> },
]
// 难度等级颜色映射
const getDifficultyColor = (difficulty: string) => {
  switch (difficulty) {
    case 'easy': return 'green'
    case 'medium': return 'orange'
    case 'hard': return 'red'
    default: return 'default'
  }
}
// 难度等级文本映射
const getDifficultyText = (difficulty: string) => {
  switch (difficulty) {
    case 'easy': return '简单'
    case 'medium': return '中等'
    case 'hard': return '困难'
    default: return '未知'
  }
}
// 技术领域文本映射
const getDomainText = (domain: string) => {
  switch (domain) {
    case 'computer_vision': return '计算机视觉'
    case 'nlp': return '自然语言处理'
    case 'structured_data': return '结构化数据'
    default: return '未知'
  }
}
export default function TaskCreateModal({ visible, onClose, onSuccess, initialTemplate }: TaskCreateModalProps) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const template = initialTemplate || null
  // 重置表单
  const resetForm = () => {
    form.resetFields()
  }
  // 处理模态框关闭
  const handleClose = () => {
    resetForm()
    onClose()
  }
  // 提交表单
  const handleSubmit = async () => {
    try {
      setLoading(true)
      const values = await form.validateFields()
      if (!template) {
        message.error('请选择模板')
        return
      }
      // 创建任务数据
      const taskData = {
        name: values.name,
        description: values.description || '',
        templateId: template.id,
        projectId: 'project_1', // 这里应该从上下文获取
        taskType: values.taskType, // 添加任务类型字段
        config: {
          // 基础配置作为任务模板
          model: template.supportedModels[0],
          mode: 'simple' as const,
          hyperparameters: { ...template.defaultConfig },
          resourceRequirements: {
            gpu: template.requirements.minGpu,
            memory: template.requirements.minMemory,
            storage: template.requirements.minStorage,
          },
          dataSplit: {
            train: 0.7,
            validation: 0.2,
            test: 0.1,
          },
        },
        tags: values.tags || [],
      }
      // 调用API创建任务
      const response = await mockPresetModelService.createTask(taskData)
      if (response.success) {
        message.success('任务创建成功！')
        onSuccess(response.data.id)
        handleClose()
      }
    }
    catch (error) {
      console.error('创建任务失败:', error)
      message.error('创建任务失败，请重试')
    }
    finally {
      setLoading(false)
    }
  }
  // 渲染模板信息 - 更简洁的设计
  const renderTemplateInfo = () => {
    if (!template)
      return null
    return (
      <div
        className="rounded-[8px] p-[16px] mb-[24px]"
        style={{
          background: '#f8f9fa',
          border: '1px solid #e9ecef',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[20px]">{template.icon}</span>
            <Text strong className="text-[16px] text-[var(--lab-color-brand-primary)]">
              {template.name}
            </Text>
            <Tag color="blue">
              {template.category === 'general' ? '通用模型' : '行业模型'}
            </Tag>
          </div>
        </div>

        <Row gutter={16} className="mb-2">
          <Col span={6}>
            <Text type="secondary" className="text-[12px]">技术领域：</Text>
            <Text className="text-[13px] text-[var(--lab-color-text-muted)]">
              {getDomainText(template.domain)}
            </Text>
          </Col>
          <Col span={6}>
            <Text type="secondary" className="text-[12px]">难度等级：</Text>
            <Tag color={getDifficultyColor(template.difficulty)} className="text-[12px] ml-1">
              {getDifficultyText(template.difficulty)}
            </Tag>
          </Col>
          <Col span={6}>
            <Text type="secondary" className="text-[12px]">预计时间：</Text>
            <Text className="text-[13px] text-[var(--lab-color-text-muted)]">
              {template.estimatedTime}
            </Text>
          </Col>
          <Col span={6}>
            <Text type="secondary" className="text-[12px]">支持模型：</Text>
            <Text className="text-[13px] text-[var(--lab-color-text-muted)]">
              {template.supportedModels.slice(0, 2).join(', ')}
              {template.supportedModels.length > 2 && '...'}
            </Text>
          </Col>
        </Row>

        <Text type="secondary" className="text-[12px] leading-[1.5]">
          {template.description}
        </Text>
      </div>
    )
  }
  return (
    <Modal
      title={(
        <Space>
          <RocketOutlined />
          新建实验任务
        </Space>
      )}
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={600}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>

        {/* 信息提示 */}
        <Alert message="创建实验任务" description="实验任务是您研究的主题，创建后可以进行多次运行来测试不同的参数和配置。" type="info" showIcon className="mb-6" />

        {/* 任务名称 */}
        <Form.Item
          label="任务名称"
          name="name"
          rules={[
            { required: true, message: '请输入任务名称' },
            { max: 50, message: '任务名称不能超过50个字符' },
          ]}
        >
          <Input placeholder="请输入任务名称，例如：商品图像分类实验" prefix={<RocketOutlined />} size="middle" />
        </Form.Item>

        {/* 任务类型 */}
        <Form.Item label="任务类型" name="taskType" rules={[{ required: true, message: '请选择任务类型' }]}>
          <Select placeholder="请选择任务类型" showSearch size="middle" filterOption={(input, option) => option?.children?.toString().toLowerCase().includes(input.toLowerCase()) ?? false}>
            {taskTypeOptions.map((option) => (
              <Option key={option.value} value={option.value}>
                <Space>
                  <span>{option.icon}</span>
                  <span>{option.label}</span>
                </Space>
              </Option>
            ))}
          </Select>
        </Form.Item>

        {/* 任务描述 */}
        <Form.Item label="任务描述" name="description" rules={[{ max: 200, message: '描述不能超过200个字符' }]}>
          <TextArea className="resize-none" placeholder="请描述您的实验目标、数据特点、预期效果等..." rows={4} maxLength={200} showCount />
        </Form.Item>

        {/* 标签 */}
        <Form.Item label="标签" name="tags" help="添加标签有助于任务分类和检索">
          <Select mode="tags" placeholder="请添加标签，例如：图像分类、商品识别" className="w-full" tokenSeparators={[',']} maxTagCount={5} maxTagTextLength={10} size="middle" />
        </Form.Item>

        {/* 按钮区域 */}
        <div
          className="flex justify-end gap-[8px] mt-[32px] pt-[16px]"
          style={{
            borderTop: '1px solid #f0f0f0',
          }}
        >
          <Button size="middle" onClick={handleClose}>
            取消
          </Button>
          <Button type="primary" size="middle" htmlType="submit" loading={loading} icon={<ExperimentOutlined />}>
            创建任务
          </Button>
        </div>
      </Form>
    </Modal>
  )
}
