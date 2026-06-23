import React, { useEffect, useState } from 'react'
import {
  Alert, Button, Card, Col, Form,
  Input, InputNumber, Modal, Row, Select,
  Space, Switch, Tag, Typography,
  message,
} from 'antd'
import {
  AppstoreOutlined, DatabaseOutlined,
  RocketOutlined, SettingOutlined,
} from '@ant-design/icons'
import { notebookService } from '../../services/notebookService'
import type {
  CreateNotebookRequest,
  GPUNode,
  NotebookCaseDetail,
  NotebookTemplate,
} from '../../types'

const { Option } = Select
const { TextArea } = Input
const { Text } = Typography

interface CloneCaseModalProps {
  visible: boolean
  onCancel: () => void
  onSuccess: (notebookId: string) => void
  caseDetail: NotebookCaseDetail | null
}

/**
 * 克隆案例弹窗组件
 * 基于案例信息创建新的Notebook实例
 */
const CloneCaseModal: React.FC<CloneCaseModalProps> = ({
  visible,
  onCancel,
  onSuccess,
  caseDetail,
}) => {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState<boolean>(false)
  const [templates, setTemplates] = useState<NotebookTemplate[]>([])
  const [gpuNodes, setGpuNodes] = useState<GPUNode[]>([])

  // 初始化数据
  useEffect(() => {
    if (visible) {
      fetchInitialData()
    }
  }, [visible])

  // 案例信息变化时更新表单
  useEffect(() => {
    if (caseDetail && visible) {
      // 基于案例信息预填充表单
      const caseName = `${caseDetail.name}_clone_${Date.now()}`
      const description = `克隆自案例: ${caseDetail.name}\n\n${caseDetail.description}`

      form.setFieldsValue({
        name: caseName,
        description,
        resources: {
          cpu_request: caseDetail.resource_requirements.cpu || '1',
          cpu_limit: caseDetail.resource_requirements.cpu || '2',
          memory_request: caseDetail.resource_requirements.memory || '2Gi',
          memory_limit: caseDetail.resource_requirements.memory || '4Gi',
          gpu_enabled: caseDetail.resource_requirements.gpu_required || false,
          gpu_count: 1,
          gpu_type: caseDetail.resource_requirements.gpu_type || 'V100',
        },
        storage: {
          size: caseDetail.resource_requirements.storage || '5Gi',
          storage_class: 'standard',
          mount_path: '/home/jovyan/work',
        },
        network: {
          custom_ports: [],
        },
        auto_stop_minutes: 120,
      })
    }
  }, [caseDetail, visible, form])

  // 获取初始化数据
  const fetchInitialData = async () => {
    try {
      const [templatesData, gpuNodesData] = await Promise.all([
        notebookService.getNotebookTemplates(),
        notebookService.getGPUNodes(),
      ])

      setTemplates(templatesData)
      setGpuNodes(gpuNodesData)

      // 根据案例技术栈选择合适的模板
      if (caseDetail) {
        const suitableTemplate = findSuitableTemplate(templatesData, caseDetail)
        if (suitableTemplate) {
          form.setFieldsValue({
            template_id: suitableTemplate.id,
          })
        }
      }
    }
    catch (error) {
      console.error('加载初始数据失败:', error)
      message.error('加载初始数据失败')
    }
  }

  // 根据案例技术栈找到合适的模板
  const findSuitableTemplate = (templates: NotebookTemplate[], caseDetail: NotebookCaseDetail) => {
    // 优先匹配技术栈
    const techStackMatch = templates.find((template) =>
      caseDetail.tech_stack.some((tech) =>
        template.packages.some((pkg) =>
          pkg.toLowerCase().includes(tech.toLowerCase()),
        ),
      ),
    )

    if (techStackMatch) return techStackMatch

    // 如果没有匹配的技术栈，选择推荐的模板
    return templates.find((template) => template.recommended) || templates[0]
  }

  // 提交表单
  const handleSubmit = async () => {
    try {
      await form.validateFields()
      setLoading(true)

      const values = form.getFieldsValue()
      const createData: CreateNotebookRequest = {
        name: values.name,
        description: values.description,
        template_id: values.template_id,
        resources: values.resources,
        storage: values.storage,
        network: values.network,
        auto_stop_minutes: values.auto_stop_minutes,
      }

      console.log('Creating notebook from case:', createData)

      const result = await notebookService.createNotebookInstance(createData, 1)
      message.success('基于案例的Notebook创建成功！')

      // 调用成功回调
      onSuccess(String(result.id))

      // 重置表单
      form.resetFields()
      onCancel()
    }
    catch (error) {
      console.error('创建Notebook失败:', error)
      message.error('创建Notebook失败')
    }
    finally {
      setLoading(false)
    }
  }

  // 取消
  const handleCancel = () => {
    form.resetFields()
    onCancel()
  }

  if (!caseDetail) {
    return null
  }

  return (
    <Modal
      title={(
        <Space>
          <RocketOutlined />
          克隆案例到新Notebook
        </Space>
      )}
      open={visible}
      onCancel={handleCancel}
      width={800}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          取消
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={loading}
          onClick={handleSubmit}
        >
          创建Notebook
        </Button>,
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
      >
        {/* 案例信息展示 */}
        <Card size="small" title="案例信息" className="mb-4">
          <Row gutter={16}>
            <Col span={12}>
              <Text strong>案例名称:</Text>
              {' '}
              {caseDetail.name}
              <br />
              <Text strong>分类:</Text>
              {' '}
              {caseDetail.category_name}
              <br />
              <Text strong>难度:</Text>
              <Tag color={
                caseDetail.difficulty === 'beginner' ? 'green'
                  : caseDetail.difficulty === 'intermediate' ? 'orange' : 'red'
              }
              >
                {caseDetail.difficulty === 'beginner' ? '初级'
                  : caseDetail.difficulty === 'intermediate' ? '中级' : '高级'}
              </Tag>
            </Col>
            <Col span={12}>
              <Text strong>预计时长:</Text>
              {' '}
              {caseDetail.duration}
              {' '}
              分钟
              <br />
              <Text strong>技术栈:</Text>
              <div className="mt-1">
                {caseDetail.tech_stack.map((tech) => (
                  <Tag key={tech} color="blue" className="text-[12px]">
                    {tech}
                  </Tag>
                ))}
              </div>
            </Col>
          </Row>
        </Card>

        {/* 基本信息 */}
        <Card
          size="small"
          title={(
            <>
              <DatabaseOutlined />
              {' '}
              基本信息
            </>
          )}
          className="mb-4"
        >
          <Form.Item
            name="name"
            label="Notebook名称"
            rules={[{ required: true, message: '请输入Notebook名称' }]}
          >
            <Input placeholder="请输入Notebook名称" />
          </Form.Item>

          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea
              placeholder="请输入描述（可选）"
              rows={3}
            />
          </Form.Item>

          <Form.Item
            name="template_id"
            label="模板选择"
            rules={[{ required: true, message: '请选择模板' }]}
          >
            <Select placeholder="选择适合的模板">
              {templates.map((template) => (
                <Option key={template.id} value={template.id}>
                  <div className="flex items-center">
                    <strong>{template.name}</strong>
                    {template.recommended && (
                      <Tag color="gold" className="ml-2 text-[12px]">
                        推荐
                      </Tag>
                    )}
                  </div>
                  <div className="text-[12px] text-[var(--lab-color-text-muted)]">
                    {template.description}
                  </div>
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Card>

        {/* 资源配置 */}
        <Card
          size="small"
          title={(
            <>
              <SettingOutlined />
              {' '}
              资源配置
            </>
          )}
          className="mb-4"
        >
          <Alert
            message="资源配置已根据案例需求预设"
            description="您可以根据实际需要调整资源配置"
            type="info"
            showIcon
            className="mb-4"
          />

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name={['resources', 'cpu_request']}
                label="CPU请求"
                rules={[{ required: true, message: '请选择CPU请求' }]}
              >
                <Select>
                  <Option value="0.5">0.5 Core</Option>
                  <Option value="1">1 Core</Option>
                  <Option value="2">2 Cores</Option>
                  <Option value="4">4 Cores</Option>
                  <Option value="8">8 Cores</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name={['resources', 'memory_request']}
                label="内存请求"
                rules={[{ required: true, message: '请选择内存请求' }]}
              >
                <Select>
                  <Option value="1Gi">1GB</Option>
                  <Option value="2Gi">2GB</Option>
                  <Option value="4Gi">4GB</Option>
                  <Option value="8Gi">8GB</Option>
                  <Option value="16Gi">16GB</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name={['resources', 'gpu_enabled']}
            label="启用GPU"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) =>
              prevValues.resources?.gpu_enabled !== currentValues.resources?.gpu_enabled}
          >
            {({ getFieldValue }) => {
              const gpuEnabled = getFieldValue(['resources', 'gpu_enabled'])

              return gpuEnabled ? (
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      name={['resources', 'gpu_type']}
                      label="GPU类型"
                      rules={[{ required: true, message: '请选择GPU类型' }]}
                    >
                      <Select placeholder="选择GPU类型">
                        {gpuNodes.map((node) => (
                          <Option key={node.gpu_type} value={node.gpu_type}>
                            {node.gpu_type}
                            {' '}
                            (
                            {node.gpu_memory}
                            )
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name={['resources', 'gpu_count']}
                      label="GPU数量"
                      rules={[{ required: true, message: '请输入GPU数量' }]}
                    >
                      <InputNumber min={1} max={8} className="w-full" />
                    </Form.Item>
                  </Col>
                </Row>
              ) : null
            }}
          </Form.Item>
        </Card>

        {/* 存储设置 */}
        <Card
          size="small"
          title={(
            <>
              <AppstoreOutlined />
              {' '}
              存储设置
            </>
          )}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name={['storage', 'size']}
                label="存储大小"
                rules={[{ required: true, message: '请输入存储大小' }]}
              >
                <Select>
                  <Option value="5Gi">5GB</Option>
                  <Option value="10Gi">10GB</Option>
                  <Option value="20Gi">20GB</Option>
                  <Option value="50Gi">50GB</Option>
                  <Option value="100Gi">100GB</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="auto_stop_minutes"
                label="自动停止时间（分钟）"
                rules={[{ required: true, message: '请输入自动停止时间' }]}
              >
                <InputNumber min={30} max={480} className="w-full" />
              </Form.Item>
            </Col>
          </Row>
        </Card>
      </Form>
    </Modal>
  )
}

export default CloneCaseModal
