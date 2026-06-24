import React, { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  Row,
  Select,
  Space,
  Table,
  Tooltip,
  Typography,
  message,
} from 'antd'
import { InfoCircleOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { useProjectStore } from '../../stores/projectStore'
import { createTask } from '../../services/taskService'
import { DirectorySelector } from '../dataset-list/DirectorySelector'
import PromptDirectorySelector from '../prompt/PromptDirectorySelector'
import { llmConfigApi, promptApi } from '../../services/api'

const { Text } = Typography
const { TextArea } = Input
const { Option } = Select

// 类型定义
export interface TaskFormProps {
  onSuccess?: (data: unknown) => void
  projectId?: number | null
}

export interface DatasetField {
  key: string
  label: string
}

export interface Prompt {
  id: string | number
  title?: string
  name?: string
  input_variables?: string[]
  messages?: { content: string }[]
  content?: string
}

export interface LlmConfig {
  id: string | number
  name: string
}

export interface TaskFormValues {
  name: string
  description?: string
  prompt_directory_id?: string | number
  prompt_id?: string | number
  llm_config_id?: string | number
  directory_id?: string | number
  variable_mappings?: Record<string, string>
}

const TaskForm: React.FC<TaskFormProps> = ({
  onSuccess = null,
  projectId = null,
}) => {
  const { currentProject } = useProjectStore()
  const [form] = Form.useForm<TaskFormValues>()
  const effectiveProjectId = projectId || currentProject?.id

  // Data state
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [llmConfigs, setLlmConfigs] = useState<LlmConfig[]>([])
  const [datasetFields] = useState<DatasetField[]>([
    { key: 'question', label: '问题' },
    { key: 'ground_truth', label: '标准答案' },
    { key: 'context', label: '上下文' },
    { key: 'meta_info', label: '元数据' },
  ])
  const [promptVariables, setPromptVariables] = useState<string[]>([])

  // UI state
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      if (!effectiveProjectId) {
        return
      }
      setLoading(true)
      try {
        const llmConfigsResponse = await llmConfigApi.list(projectId, {
          page: 1,
          size: 99,
        })
        setLlmConfigs(llmConfigsResponse.items as LlmConfig[])
      }
      finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [effectiveProjectId])

  useEffect(() => {
    const fetchPrompts = async () => {
      const promptDirId = form.getFieldValue('prompt_directory_id')
      if (!effectiveProjectId || !promptDirId) {
        setPrompts([])
        return
      }
      setLoading(true)
      try {
        const promptsResponse = await promptApi.list(
          effectiveProjectId,
          promptDirId,
          { page: 1, size: 99 },
        )
        setPrompts(promptsResponse.items as Prompt[])
      }
      finally {
        setLoading(false)
      }
    }
    fetchPrompts()
  }, [effectiveProjectId, form.getFieldValue('prompt_directory_id')])

  useEffect(() => {
    const fetchPromptVariables = async () => {
      const promptId = form.getFieldValue('prompt_id')
      if (!promptId) return
      try {
        const selectedPromptDetails = prompts.find((p) => p.id === promptId)
        if (!selectedPromptDetails) return
        let variables: string[] = []
        if (
          Array.isArray(selectedPromptDetails.input_variables)
          && selectedPromptDetails.input_variables.length > 0
        ) {
          variables = selectedPromptDetails.input_variables
        }
        else if (
          Array.isArray(selectedPromptDetails.messages)
          && selectedPromptDetails.messages.length > 0
        ) {
          selectedPromptDetails.messages.forEach((message) => {
            if (message.content) {
              const matches = message.content.match(/\{([^{}]+)\}/g) || []
              const messageVars = matches.map((match) => match.slice(1, -1))
              variables = [...variables, ...messageVars]
            }
          })
        }
        else if (selectedPromptDetails.content) {
          const matches
            = selectedPromptDetails.content.match(/\{([^{}]+)\}/g) || []
          variables = matches.map((match) => match.slice(1, -1))
        }
        if (variables.length === 0) {
          setPromptVariables(['input'])
          form.setFieldsValue({ variable_mappings: { input: 'question' } })
          return
        }
        const uniqueVariables = [...new Set(variables)]
        setPromptVariables(uniqueVariables)
        const initialMappings: Record<string, string> = {}
        uniqueVariables.forEach((variable) => {
          const matchingField = datasetFields.find(
            (field) =>
              field.key.toLowerCase().includes(variable.toLowerCase())
              || variable.toLowerCase().includes(field.key.toLowerCase()),
          )
          initialMappings[variable] = matchingField
            ? matchingField.key
            : 'question'
        })
        form.setFieldsValue({ variable_mappings: initialMappings })
      }
      catch {
        setPromptVariables(['input'])
        form.setFieldsValue({ variable_mappings: { input: 'question' } })
      }
    }
    fetchPromptVariables()
  }, [form.getFieldValue('prompt_id'), datasetFields, prompts])

  const handleSubmit = async (values: TaskFormValues) => {
    try {
      setSubmitting(true)
      if (!values.name) {
        message.error('任务名称为必填项')
        setSubmitting(false)
        return
      }
      if (!effectiveProjectId) {
        message.error('未选择项目')
        setSubmitting(false)
        return
      }
      const taskData = {
        name: values.name,
        description: values.description,
        project_id: effectiveProjectId,
        task_type: 'answer-generation',
        directory_id: values.directory_id
          ? Number(values.directory_id)
          : undefined,
        prompt_id: values.prompt_id ? Number(values.prompt_id) : undefined,
        llm_config_id: values.llm_config_id
          ? Number(values.llm_config_id)
          : undefined,
        variable_mappings: values.variable_mappings,
      }
      const response = await createTask(effectiveProjectId, taskData)
      message.success(`任务 "${values.name}" 创建成功！`)
      form.resetFields()
      if (onSuccess) onSuccess(response)
    }
    catch (error) {
      console.error('创建任务出错:', error)
    }
    finally {
      setSubmitting(false)
    }
  }

  const handleReset = () => {
    form.resetFields()
    setPromptVariables([])
  }

  const renderVariableMappingSection = () => {
    if (!promptVariables || promptVariables.length === 0) return null
    const variableMappings = form.getFieldValue('variable_mappings') || {}
    return (
      <Card
        title={(
          <Space>
            <span>变量映射</span>
            <Tooltip title="将提示词变量映射到数据集字段">
              <InfoCircleOutlined />
            </Tooltip>
          </Space>
        )}
        className="mt-4 mb-4"
      >
        <Table
          dataSource={promptVariables.map((variable) => ({
            key: variable,
            variable,
            mapping: variableMappings[variable] || '',
          }))}
          columns={[
            {
              title: '提示词变量',
              dataIndex: 'variable',
              key: 'variable',
              render: (text: string) => <Text strong>{text}</Text>,
            },
            {
              title: '数据集字段',
              dataIndex: 'mapping',
              key: 'mapping',
              render: (_: string, record: { variable: string }) => (
                <Select
                  className="w-full"
                  value={variableMappings[record.variable] || undefined}
                  onChange={(value: string) => {
                    const newMappings = {
                      ...variableMappings,
                      [record.variable]: value,
                    }
                    form.setFieldsValue({ variable_mappings: newMappings })
                  }}
                  placeholder="请选择数据集字段"
                >
                  {datasetFields.map((field) => (
                    <Option key={field.key} value={field.key}>
                      {field.label}
                    </Option>
                  ))}
                </Select>
              ),
            },
          ]}
          pagination={false}
          size="small"
        />
      </Card>
    )
  }

  if (!effectiveProjectId) {
    return <Alert message="请先选择项目" type="warning" showIcon />
  }

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      initialValues={{ task_type: 'answer-generation' }}
    >
      <Card title="任务信息" className="mb-4">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label={(
                <>
                  任务名称
                  {' '}
                  <span className="text-[var(--lab-color-danger)]">*</span>
                </>
              )}
              name="name"
              required
              rules={[{ required: true, message: '请输入任务名称' }]}
            >
              <Input placeholder="请输入任务名称" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="任务描述" name="description">
          <TextArea placeholder="请输入任务描述" rows={4} />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label={(
                <Space>
                  <span>
                    提示词目录
                    {' '}
                    <span className="text-[var(--lab-color-danger)]">*</span>
                  </span>
                  <Tooltip title="请先选择提示词目录，再选择提示词">
                    <InfoCircleOutlined />
                  </Tooltip>
                </Space>
              )}
              name="prompt_directory_id"
              required
              rules={[{ required: true, message: '请选择提示词目录' }]}
            >
              <PromptDirectorySelector
                projectId={effectiveProjectId}
                value={form.getFieldValue('prompt_directory_id')}
                onChange={(v: string | number) => {
                  form.setFieldsValue({
                    prompt_directory_id: v,
                    prompt_id: undefined,
                  })
                  setPromptVariables([])
                }}
                placeholder="请选择提示词目录"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="提示词"
              name="prompt_id"
              required
              rules={[{ required: true, message: '请选择提示词' }]}
            >
              <Select
                placeholder={
                  form.getFieldValue('prompt_directory_id')
                    ? '请选择提示词'
                    : '请先选择提示词目录'
                }
                loading={loading}
                disabled={!form.getFieldValue('prompt_directory_id')}
                className="w-full"
                onChange={(v: string | number) => {
                  form.setFieldsValue({ prompt_id: v })
                  const selectedPromptDetails = prompts.find((p) => p.id === v)
                  let variables: string[] = []
                  if (
                    Array.isArray(selectedPromptDetails?.input_variables)
                    && selectedPromptDetails.input_variables.length > 0
                  ) {
                    variables = selectedPromptDetails.input_variables
                  }
                  else if (
                    Array.isArray(selectedPromptDetails?.messages)
                    && selectedPromptDetails.messages.length > 0
                  ) {
                    selectedPromptDetails.messages.forEach((message) => {
                      if (message.content) {
                        const matches
                          = message.content.match(/\{([^{}]+)\}/g) || []
                        const messageVars = matches.map((match) =>
                          match.slice(1, -1),
                        )
                        variables = [...variables, ...messageVars]
                      }
                    })
                  }
                  else if (selectedPromptDetails?.content) {
                    const matches
                      = selectedPromptDetails.content.match(/\{([^{}]+)\}/g)
                        || []
                    variables = matches.map((match) => match.slice(1, -1))
                  }
                  if (variables.length === 0) {
                    setPromptVariables(['input'])
                    form.setFieldsValue({
                      variable_mappings: { input: 'question' },
                    })
                  }
                  else {
                    const uniqueVariables = [...new Set(variables)]
                    setPromptVariables(uniqueVariables)
                    const initialMappings: Record<string, string> = {}
                    uniqueVariables.forEach((variable) => {
                      const matchingField = datasetFields.find(
                        (field) =>
                          field.key
                            .toLowerCase()
                            .includes(variable.toLowerCase())
                            || variable
                              .toLowerCase()
                              .includes(field.key.toLowerCase()),
                      )
                      initialMappings[variable] = matchingField
                        ? matchingField.key
                        : 'question'
                    })
                    form.setFieldsValue({ variable_mappings: initialMappings })
                  }
                }}
              >
                {prompts.map((prompt) => (
                  <Select.Option key={prompt.id} value={prompt.id}>
                    {prompt.title || prompt.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="选择模型"
              name="llm_config_id"
              required
              rules={[{ required: true, message: '请选择模型' }]}
            >
              <Select
                placeholder="请选择模型"
                loading={loading}
                disabled={!effectiveProjectId}
                className="w-full"
              >
                {llmConfigs.map((config) => (
                  <Select.Option key={config.id} value={config.id}>
                    {config.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          label={(
            <span>
              数据集目录
              <Tooltip title="选择目录以筛选数据集。不选则包含所有目录下的数据集。">
                <InfoCircleOutlined className="ml-2" />
              </Tooltip>
            </span>
          )}
          name="directory_id"
          required
          rules={[{ required: true, message: '请选择评估数据集目录' }]}
        >
          <DirectorySelector
            projectId={effectiveProjectId}
            value={form.getFieldValue('directory_id')}
            onChange={(v: string | number) =>
              form.setFieldsValue({ directory_id: v })}
            placeholder="请选择评估数据集目录"
          />
        </Form.Item>
        <Form.Item name="variable_mappings" className="hidden">
          <Input type="hidden" />
        </Form.Item>
        {promptVariables.length > 0 && renderVariableMappingSection()}
      </Card>
      <Form.Item>
        <Space>
          <Button
            type="primary"
            htmlType="submit"
            loading={submitting}
            icon={<ThunderboltOutlined />}
          >
            创建任务
          </Button>
          <Button onClick={handleReset}>重置</Button>
        </Space>
      </Form.Item>
    </Form>
  )
}

export default TaskForm
