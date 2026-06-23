import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Layout,
  Menu,
  Modal,
  Row,
  Space,
  Spin,
  Switch,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd'
import {
  DeleteOutlined,
  DownOutlined,
  DownloadOutlined,
  EditOutlined,
  FileTextOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  StarFilled,
  UploadOutlined,
} from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UploadProps } from 'antd'
import type { RcFile } from 'antd/es/upload/interface'
import { llmConfigApi } from '../services/api'
import { useProjectStore } from '../stores/projectStore'
import type {
  CreateLLMConfigRequest,
  LLMConfig,
  UpdateLLMConfigRequest,
} from '../types'
import useI18n from '../hooks/useI18n'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input
const { Dragger } = Upload

const LLMConfigList = () => {
  const { t } = useI18n()
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()
  const { currentProject } = useProjectStore()
  const [form] = Form.useForm()
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [editingConfig, setEditingConfig] = useState<LLMConfig | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [importModalVisible, setImportModalVisible] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importFile, setImportFile] = useState<RcFile | null>(null)

  const effectiveProjectId = projectId || currentProject?.id?.toString()
  // hooks 必须在组件顶层调用
  const { data: llmConfigPage, isLoading } = useQuery({
    queryKey: ['llmConfigs', effectiveProjectId],
    queryFn: () => {
      // 支持分页参数扩展
      if (!effectiveProjectId) throw new Error('No project selected')
      return llmConfigApi.list(Number(effectiveProjectId), {
        page: 1,
        size: 100,
      })
    },
    enabled: !!effectiveProjectId,
  })
  const llmConfigs = llmConfigPage?.items ?? []
  // useMutation 必须在组件顶层调用
  const createLLMConfig = useMutation({
    mutationFn: (data: CreateLLMConfigRequest) => {
      return llmConfigApi.create(Number(effectiveProjectId), data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['llmConfigs', effectiveProjectId],
      })
      message.success(t('llmConfig.createSuccess'))
      setIsModalVisible(false)
      form.resetFields()
    },
    onError: (error: unknown) => {
      const err = error as any
      message.error(
        `${t('llmConfig.createError')}: ${
          err.response?.data?.detail || err.message
        }`,
      )
    },
  })

  const updateLLMConfig = useMutation({
    mutationFn: ({
      configId,
      data,
    }: {
      configId: number
      data: UpdateLLMConfigRequest
    }) => {
      if (!effectiveProjectId) throw new Error('No project selected')
      return llmConfigApi.update(Number(effectiveProjectId), configId, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['llmConfigs', effectiveProjectId],
      })
      message.success(t('llmConfig.updateSuccess'))
      setIsModalVisible(false)
      form.resetFields()
      setEditingConfig(null)
    },
    onError: (error: unknown) => {
      const err = error as any
      message.error(
        `${t('llmConfig.updateError')}: ${
          err.response?.data?.detail || err.message
        }`,
      )
    },
  })

  const deleteLLMConfig = useMutation({
    mutationFn: (configId: number) => {
      if (!effectiveProjectId) throw new Error('No project selected')
      return llmConfigApi.delete(Number(effectiveProjectId), configId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['llmConfigs', effectiveProjectId],
      })
      message.success(t('llmConfig.deleteSuccess'))
    },
    onError: (error: unknown) => {
      const err = error as any
      message.error(
        `${t('llmConfig.deleteError')}: ${
          err.response?.data?.detail || err.message
        }`,
      )
    },
  })

  // 处理表单提交
  const handleSubmit = (values: Record<string, any>) => {
    // 处理额外参数
    let additionalParams = {}
    if (values.additional_params) {
      try {
        additionalParams = JSON.parse(values.additional_params)
      }
      catch {
        message.error('额外参数JSON格式不正确')
        return
      }
    }
    const data = {
      ...values,
      project_id: Number(effectiveProjectId),
      additional_params: additionalParams,
    } as any
    if (editingConfig) {
      updateLLMConfig.mutate({ configId: editingConfig.id, data })
    }
    else {
      createLLMConfig.mutate(data)
    }
  }

  // 处理删除配置
  const handleDelete = (config: LLMConfig) => {
    Modal.confirm({
      title: t('common.confirm'),
      content: `${t('common.delete')} "${config.name}"?`,
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: () => deleteLLMConfig.mutate(config.id),
    })
  }

  // 处理导出Excel
  const handleExportXlsx = async () => {
    try {
      await llmConfigApi.exportXlsx(Number(effectiveProjectId), {
        sort_by: 'created_at',
        sort_order: 'desc',
      })
      message.success(t('prompt.exportSuccess'))
    }
    catch (error) {
      console.error('Error exporting LLM configs:', error)
      message.error(t('prompt.exportError'))
    }
  }

  // 处理下载模板
  const handleDownloadTemplate = async () => {
    try {
      await llmConfigApi.getXlsxTemplate()
      message.success(t('prompt.templateDownloadSuccess'))
    }
    catch (error) {
      console.error('Error downloading template:', error)
      message.error(t('prompt.templateDownloadError'))
    }
  }

  // 处理导入提交
  const handleImportSubmit = async () => {
    console.log(importFile, effectiveProjectId)
    if (!importFile || !effectiveProjectId) return
    setImporting(true)
    try {
      await llmConfigApi.importXlsx(Number(effectiveProjectId), importFile)
      message.success(t('llmConfig.importSuccess'))
      setImportModalVisible(false)
      setImportFile(null)
      queryClient.invalidateQueries({
        queryKey: ['llmConfigs', effectiveProjectId],
      })
    }
    catch (error) {
      const err = error as any
      console.error('Error importing LLM configs:', err)
      message.error(t('llmConfig.importError'))
    }
    finally {
      setImporting(false)
    }
  }

  // 打开编辑模态框
  const openEditModal = (config: LLMConfig) => {
    setEditingConfig(config)
    setShowApiKey(false)
    form.setFieldsValue({
      ...config,
      additional_params:
        config.additional_params
        && Object.keys(config.additional_params).length > 0
          ? JSON.stringify(config.additional_params, null, 2)
          : '',
    })
    setIsModalVisible(true)
  }

  // 打开创建模态框
  const openCreateModal = () => {
    setEditingConfig(null)
    setShowApiKey(false)
    form.resetFields()
    form.setFieldsValue({
      temperature: 0,
      max_retries: 2,
      frequency_penalty: 0.0,
      presence_penalty: 0.0,
      top_p: 1.0,
    })
    setIsModalVisible(true)
  }

  const uploadProps: UploadProps = {
    beforeUpload: (file) => {
      setImportFile(file)
      return false
    },
    onRemove: () => {
      setImportFile(null)
    },
    fileList: importFile ? [importFile] : [],
  }

  const handleImportModalOk = async () => {
    if (!importFile) {
      message.error('请先选择文件')
      return
    }
    setImporting(true)
    await handleImportSubmit()
    setImporting(false)
    setImportModalVisible(false)
    setImportFile(null)
  }

  return (
    <Layout.Content className="llm-config-list-container lab-list-page-shell">
      <Card>
        <Row
          justify="space-between"
          align="middle"
          className="mb-4"
        >
          <Col>
            <Title level={3}>模型管理</Title>
          </Col>
          <Col>
            <Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={openCreateModal}
              >
                新建模型
              </Button>
              <Dropdown
                overlay={(
                  <Menu>
                    <Menu.Item
                      key="import"
                      onClick={() => setImportModalVisible(true)}
                    >
                      <UploadOutlined className="mr-2" />
                      导入模型
                    </Menu.Item>
                    <Menu.Item
                      key="export"
                      onClick={handleExportXlsx}
                      disabled={llmConfigs.length === 0}
                    >
                      <DownloadOutlined className="mr-2" />
                      导出模型
                    </Menu.Item>
                  </Menu>
                )}
                placement="bottomRight"
              >
                <Button icon={<DownOutlined />}>更多操作</Button>
              </Dropdown>
            </Space>
          </Col>
        </Row>
        <Spin spinning={isLoading}>
          {llmConfigs.length === 0 ? (
            <Card>
              <div className="text-center p-6">
                <Text type="secondary">{t('llmConfig.noConfigs')}</Text>
              </div>
            </Card>
          ) : (
            <Row gutter={[16, 16]}>
              {llmConfigs.map((config) => (
                <Col xs={24} sm={12} md={8} key={config.id}>
                  <Card
                    title={(
                      <Space>
                        {config.name}
                        {config.is_default && (
                          <StarFilled style={{ color: '#faad14' }} />
                        )}
                      </Space>
                    )}
                    extra={(
                      <Space>
                        <Tooltip title={t('common.edit')}>
                          <Button
                            type="text"
                            icon={<EditOutlined />}
                            onClick={() => openEditModal(config)}
                          />
                        </Tooltip>
                        <Tooltip title={t('common.delete')}>
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => handleDelete(config)}
                          />
                        </Tooltip>
                      </Space>
                    )}
                    actions={[]}
                  >
                    <div className="mb-2">
                      <Text type="secondary">
                        {t('llmConfig.model')}
                        :
                      </Text>
                      {' '}
                      {config.model}
                    </div>

                    {config.description && (
                      <div className="mb-2">
                        <Text type="secondary">
                          {t('llmConfig.descriptionLabel')}
                          :
                        </Text>
                        {' '}
                        {config.description}
                      </div>
                    )}

                    <div className="mb-2">
                      <Text type="secondary">
                        {t('llmConfig.temperature')}
                        :
                      </Text>
                      {' '}
                      {config.temperature ?? 'Default'}
                    </div>

                    {config.max_tokens && (
                      <div className="mb-2">
                        <Text type="secondary">
                          {t('llmConfig.maxTokens')}
                          :
                        </Text>
                        {' '}
                        {config.max_tokens}
                      </div>
                    )}

                    {config.frequency_penalty !== null
                    && config.frequency_penalty !== undefined && (
                      <div className="mb-2">
                        <Text type="secondary">
                          {t('llmConfig.frequencyPenalty') || '频率惩罚'}
                          :
                        </Text>
                        {' '}
                        {config.frequency_penalty}
                      </div>
                    )}

                    {config.presence_penalty !== null
                    && config.presence_penalty !== undefined && (
                      <div className="mb-2">
                        <Text type="secondary">
                          {t('llmConfig.presencePenalty') || '存在惩罚'}
                          :
                        </Text>
                        {' '}
                        {config.presence_penalty}
                      </div>
                    )}

                    {config.top_p !== null && config.top_p !== undefined && (
                      <div className="mb-2">
                        <Text type="secondary">
                          {t('llmConfig.topP') || 'Top P'}
                          :
                        </Text>
                        {' '}
                        {config.top_p}
                      </div>
                    )}

                    {config.base_url && (
                      <div className="mb-2">
                        <Text type="secondary">
                          {t('llmConfig.baseUrl')}
                          :
                        </Text>
                        {' '}
                        {config.base_url}
                      </div>
                    )}
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </Spin>

        {/* 创建/编辑模态框 */}
        <Modal
          title={editingConfig ? t('llmConfig.edit') : t('llmConfig.create')}
          open={isModalVisible}
          onCancel={() => setIsModalVisible(false)}
          footer={null}
          width={800}
        >
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            initialValues={{
              is_default: false,
            }}
          >
            <Form.Item
              name="name"
              label={t('llmConfig.name')}
              rules={[{ required: true, message: t('llmConfig.nameRequired') }]}
            >
              <Input placeholder={t('llmConfig.namePlaceholder')} />
            </Form.Item>

            <Form.Item
              name="description"
              label={t('llmConfig.descriptionLabel')}
            >
              <TextArea
                rows={2}
                placeholder={t('llmConfig.descriptionPlaceholder')}
              />
            </Form.Item>

            <Divider orientation="left">{t('llmConfig.basicConfig')}</Divider>

            <Form.Item
              name="model"
              label={(
                <Space>
                  <span>{t('llmConfig.model')}</span>
                  <Tooltip title={t('llmConfig.modelTooltip')}>
                    <QuestionCircleOutlined />
                  </Tooltip>
                </Space>
              )}
              rules={[
                { required: true, message: t('llmConfig.modelRequired') },
              ]}
            >
              <Input placeholder={t('llmConfig.modelPlaceholder')} />
            </Form.Item>

            <Form.Item
              name="temperature"
              label={(
                <Space>
                  {t('llmConfig.temperature')}
                  <Tooltip title={t('llmConfig.temperatureTooltip')}>
                    <QuestionCircleOutlined />
                  </Tooltip>
                </Space>
              )}
            >
              <InputNumber
                min={0}
                max={2}
                step={0.1}
                className="w-full"
                placeholder={t('llmConfig.temperaturePlaceholder')}
              />
            </Form.Item>

            <Form.Item
              name="max_tokens"
              label={(
                <Space>
                  {t('llmConfig.maxTokens')}
                  <Tooltip title={t('llmConfig.maxTokensTooltip')}>
                    <QuestionCircleOutlined />
                  </Tooltip>
                </Space>
              )}
            >
              <InputNumber
                min={1}
                className="w-full"
                placeholder={t('llmConfig.maxTokensPlaceholder')}
              />
            </Form.Item>

            <Form.Item
              name="timeout"
              label={(
                <Space>
                  {t('llmConfig.timeout')}
                  <Tooltip title={t('llmConfig.timeoutTooltip')}>
                    <QuestionCircleOutlined />
                  </Tooltip>
                </Space>
              )}
            >
              <InputNumber
                min={1}
                className="w-full"
                placeholder={t('llmConfig.timeoutPlaceholder')}
              />
            </Form.Item>

            <Form.Item
              name="max_retries"
              label={(
                <Space>
                  {t('llmConfig.maxRetries')}
                  <Tooltip title={t('llmConfig.maxRetriesTooltip')}>
                    <QuestionCircleOutlined />
                  </Tooltip>
                </Space>
              )}
            >
              <InputNumber
                min={0}
                className="w-full"
                placeholder={t('llmConfig.maxRetriesPlaceholder')}
              />
            </Form.Item>

            <Divider orientation="left">
              {t('llmConfig.advancedConfig')}
            </Divider>

            <Form.Item
              name="frequency_penalty"
              label={(
                <Space>
                  {t('llmConfig.frequencyPenalty') || '频率惩罚'}
                  <Tooltip
                    title={
                      t('llmConfig.frequencyPenaltyTooltip')
                      || '控制重复度，值越高（0-2）越不倾向重复内容，默认为0'
                    }
                  >
                    <QuestionCircleOutlined />
                  </Tooltip>
                </Space>
              )}
            >
              <InputNumber
                min={0}
                max={2}
                step={0.1}
                className="w-full"
                placeholder="0-2之间，默认为0"
              />
            </Form.Item>

            <Form.Item
              name="presence_penalty"
              label={(
                <Space>
                  {t('llmConfig.presencePenalty') || '存在惩罚'}
                  <Tooltip
                    title={
                      t('llmConfig.presencePenaltyTooltip')
                      || '控制主题新颖度，值越高（0-2）越倾向引入新主题，默认为0'
                    }
                  >
                    <QuestionCircleOutlined />
                  </Tooltip>
                </Space>
              )}
            >
              <InputNumber
                min={0}
                max={2}
                step={0.1}
                className="w-full"
                placeholder="0-2之间，默认为0"
              />
            </Form.Item>

            <Form.Item
              name="top_p"
              label={(
                <Space>
                  {t('llmConfig.topP') || 'Top P'}
                  <Tooltip
                    title={
                      t('llmConfig.topPTooltip')
                      || '控制输出多样性，值越小模型输出越确定性，默认为1'
                    }
                  >
                    <QuestionCircleOutlined />
                  </Tooltip>
                </Space>
              )}
            >
              <InputNumber
                min={0}
                max={1}
                step={0.05}
                className="w-full"
                placeholder="0-1之间，默认为1"
              />
            </Form.Item>

            <Form.Item
              name="api_key"
              label={(
                <Space>
                  {t('llmConfig.apiKey')}
                  <Tooltip title={t('llmConfig.apiKeyTooltip')}>
                    <QuestionCircleOutlined />
                  </Tooltip>
                </Space>
              )}
            >
              <Input.Password
                placeholder={t('llmConfig.apiKeyPlaceholder')}
                visibilityToggle={{
                  visible: showApiKey,
                  onVisibleChange: setShowApiKey,
                }}
              />
            </Form.Item>

            <Form.Item
              name="base_url"
              label={(
                <Space>
                  {t('llmConfig.baseUrl')}
                  <Tooltip title={t('llmConfig.baseUrlTooltip')}>
                    <QuestionCircleOutlined />
                  </Tooltip>
                </Space>
              )}
            >
              <Input placeholder={t('llmConfig.baseUrlPlaceholder')} />
            </Form.Item>

            <Form.Item
              name="organization"
              label={(
                <Space>
                  {t('llmConfig.organization')}
                  <Tooltip title={t('llmConfig.organizationTooltip')}>
                    <QuestionCircleOutlined />
                  </Tooltip>
                </Space>
              )}
            >
              <Input placeholder={t('llmConfig.organizationPlaceholder')} />
            </Form.Item>

            <Form.Item
              name="additional_params"
              label={(
                <Space>
                  {t('llmConfig.additionalParams')}
                  <Tooltip title={t('llmConfig.additionalParamsTooltip')}>
                    <QuestionCircleOutlined />
                  </Tooltip>
                </Space>
              )}
            >
              <TextArea
                rows={4}
                placeholder={t('llmConfig.additionalParamsPlaceholder')}
              />
            </Form.Item>

            <Form.Item
              name="is_default"
              label={(
                <Space>
                  {t('llmConfig.isDefault')}
                  <Tooltip title={t('llmConfig.isDefaultTooltip')}>
                    <QuestionCircleOutlined />
                  </Tooltip>
                </Space>
              )}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Form.Item>
              <Space className="w-full justify-end">
                <Button onClick={() => setIsModalVisible(false)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={
                    createLLMConfig.isPending || updateLLMConfig.isPending
                  }
                >
                  {editingConfig ? t('llmConfig.update') : t('common.create')}
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>

        {/* 导入模态框 */}
        <Modal
          title="导入 LLM 配置"
          open={importModalVisible}
          onCancel={() => {
            setImportModalVisible(false)
            setImportFile(null)
          }}
          onOk={handleImportModalOk}
          confirmLoading={importing}
          okText="导入"
          cancelText="取消"
        >
          <Dragger
            {...uploadProps}
            accept=".xlsx"
            showUploadList
            multiple={false}
          >
            <p className="ant-upload-drag-icon">
              <UploadOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽XLSX文件到此区域上传</p>
            <p className="ant-upload-hint">仅支持 .xlsx 格式，最大10MB</p>
          </Dragger>
          <div className="mt-4">
            <Button
              type="link"
              icon={<FileTextOutlined />}
              onClick={handleDownloadTemplate}
            >
              下载模板
            </Button>
          </div>
        </Modal>
      </Card>
    </Layout.Content>
  )
}

export default LLMConfigList
