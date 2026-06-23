import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Radio,
  Select,
  Space,
  Switch,
  Table,
  message,
} from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ColumnType } from 'antd/es/table'
import { useMetricStore } from '../stores/metricStore'
import { llmConfigApi } from '../services/api'
import type { LLMConfig } from '../types'
import { metricService } from '../services/metricService'
import EllipsisTooltip from '../components/common/EllipsisTooltip'

interface Metric {
  id: number
  name: string
  description?: string
  type?: string
  is_builtin?: boolean
  params_content?: {
    criteria?: string
    strict_mode?: boolean
    threshold?: number
    evaluation_steps?: string[]
    evaluation_params?: string[]
  }
  [key: string]: unknown
}

const MetricList: React.FC = () => {
  const { projectId, directoryId } = useParams<{
    projectId: string
    directoryId: string
  }>()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    metrics,
    loading,
    fetchMetrics,
    createMetric,
    updateMetric,
    deleteMetric,
    batchDeleteMetrics,
    setSelectedDirectoryId,
  } = useMetricStore() as {
    metrics: Metric[]
    loading: boolean
    fetchMetrics: (projectId: number, params?: Record<string, unknown>) => void
    createMetric: (
      projectId: number,
      data: Record<string, unknown>
    ) => Promise<void>
    updateMetric: (
      projectId: number,
      metricId: number,
      data: Record<string, unknown>
    ) => Promise<void>
    deleteMetric: (projectId: number, metricId: number) => Promise<void>
    batchDeleteMetrics: (ids: number[]) => Promise<void>
    setSelectedDirectoryId: (id: number) => void
  }

  const [isMetricModalVisible, setIsMetricModalVisible] = useState(false)
  const [editingMetric, setEditingMetric] = useState<Metric | null>(null)
  const [metricForm] = Form.useForm()
  const [selectedMetricKeys, setSelectedMetricKeys] = useState<React.Key[]>([])
  const [modelList, setModelList] = useState<
    Array<{ label: string, value: number }>
  >([])
  const [selectedModel, setSelectedModel] = useState<number>()
  const [generating, setGenerating] = useState(false)
  const [builtinMetrics, setBuiltinMetrics] = useState<Array<any>>([])
  const [builtinLoading, setBuiltinLoading] = useState(false)

  // 监听criteria变化
  const criteria = Form.useWatch('criteria', metricForm)
  const requiredParams = Form.useWatch('required_params', metricForm)
  const metricType = Form.useWatch('metric_type', metricForm)
  const isBuiltin = metricType === 'builtin'

  useEffect(() => {
    if (projectId && directoryId) {
      setSelectedDirectoryId(Number(directoryId))
      fetchMetrics(Number(projectId), {
        directory_id: Number(directoryId),
      } as Record<string, unknown>)
    }
  }, [projectId, directoryId])

  // 加载模型列表
  useEffect(() => {
    if (projectId) {
      llmConfigApi.list(Number(projectId)).then((res) => {
        const options = (res.items || []).map((item: LLMConfig) => ({
          label: item.name + (item.model ? ` (${item.model})` : ''),
          value: item.id,
        }))
        setModelList(options)
        if (options.length > 0) setSelectedModel(options[0].value)
      })
    }
  }, [projectId])

  // 监听 type 字段变化，拉取内置指标
  useEffect(() => {
    if (isBuiltin) {
      setBuiltinLoading(true)
      metricService
        .listBuiltinMetrics?.()
        .then((res: any) => {
          setBuiltinMetrics(res.data.items || [])
        })
        .finally(() => setBuiltinLoading(false))
    }
  }, [isBuiltin])

  // 返回目录管理
  const handleBackToDirectory = () => {
    navigate(`/project/${projectId}/metrics/directories`)
  }

  // 新建指标
  const handleAddMetric = () => {
    setEditingMetric(null)
    metricForm.resetFields()
    setIsMetricModalVisible(true)
  }

  // 编辑指标
  const handleEditMetric = (metric: Metric) => {
    setEditingMetric(metric)
    const params = metric.params_content || {}
    metricForm.setFieldsValue({
      ...metric,
      criteria: params.criteria,
      strict_mode: params.strict_mode,
      threshold: params.threshold,
      evaluation_steps: params.evaluation_steps || [],
    })
    setIsMetricModalVisible(true)
  }

  // 提交指标表单
  const handleMetricSubmit = async (values: unknown) => {
    if (!(projectId && directoryId)) return
    const v = values as Record<string, unknown>
    const metric = builtinMetrics.find((m) => m.id === v.type)
    const isBuiltin = v.metric_type === 'builtin'
    const formValues = {
      metric_type: v.metric_type,
      type: isBuiltin ? metric?.type : 'GEval',
      is_builtin: isBuiltin,
      name: v.name,
      description: v.description,
      required_params: v.required_params,
      params_content: {
        criteria: v.criteria,
        strict_mode: v.strict_mode,
        threshold: v.threshold,
        evaluation_params: v.required_params,
        evaluation_steps: v.evaluation_steps,
        include_reason: v.include_reason,
      },
      project_id: Number(projectId),
      directory_id: Number(directoryId),
    }
    try {
      if (editingMetric) {
        // 不能修改的字段
        delete formValues.type
        delete formValues.metric_type

        await updateMetric(
          Number(projectId),
          (editingMetric as { id: number }).id,
          formValues as Record<string, unknown>,
        )
        message.success(t('metric.updateSuccess'))
      }
      else {
        await createMetric(
          Number(projectId),
          formValues as Record<string, unknown>,
        )
        message.success(t('metric.createSuccess'))
      }
      setIsMetricModalVisible(false)
      fetchMetrics(Number(projectId), {
        directory_id: Number(directoryId),
      } as Record<string, unknown>)
    }
    catch {
      message.error(t('common.operationFailed'))
    }
  }

  // 删除指标
  const handleDeleteMetric = async (metricId: number) => {
    if (!projectId) return
    try {
      await deleteMetric(Number(projectId), metricId)
      message.success(t('metric.deleteSuccess'))
      fetchMetrics(Number(projectId), {
        directory_id: Number(directoryId),
      } as Record<string, unknown>)
    }
    catch {
      message.error(t('common.operationFailed'))
    }
  }

  // 批量删除
  const handleBatchDeleteMetrics = async () => {
    try {
      await batchDeleteMetrics(selectedMetricKeys.map((key) => Number(key)))
      message.success(t('metric.batchDeleteSuccess'))
      setSelectedMetricKeys([])
      fetchMetrics(Number(projectId), {
        directory_id: Number(directoryId),
      } as Record<string, unknown>)
    }
    catch {
      message.error(t('common.operationFailed'))
    }
  }

  const handleGenerateEvaluationStep = async () => {
    setGenerating(true)
    try {
      const res = await metricService.generateEvaluationStep({
        project_id: Number(projectId),
        llm_config_id: selectedModel!,
        parameters: metricForm.getFieldValue('required_params') || [],
        criteria,
      })
      metricForm.setFieldsValue({
        evaluation_steps: res.data.steps ?? [],
      })

      message.success(t('metric.generateEvaluationStepSuccess', '生成成功'))
    }
    catch {
      message.error(t('metric.generateEvaluationStepFailed', '生成失败'))
    }
    finally {
      setGenerating(false)
    }
  }

  // 表格列配置
  const columns: ColumnType<Metric>[] = [
    {
      title: t('metric.name'),
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (text: string) => (
        <EllipsisTooltip maxWidth={180}>{text}</EllipsisTooltip>
      ),
    },
    {
      title: t('metric.type'),
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (text: string) => (
        <EllipsisTooltip maxWidth={120}>{text}</EllipsisTooltip>
      ),
    },
    {
      title: t('metric.description'),
      dataIndex: 'description',
      key: 'description',
      width: 220,
      render: (text: string) => (
        <EllipsisTooltip maxWidth={220}>{text || '-'}</EllipsisTooltip>
      ),
    },
    {
      title: t('metric.evaluationParams', '评估参数'),
      key: 'evaluation_params',
      width: 180,
      render: (_: unknown, record: Metric) => {
        const params = record.params_content?.evaluation_params
        return params && params.length > 0 ? (
          <Space wrap>
            {params.map((p) => (
              <EllipsisTooltip key={p} maxWidth={80}>
                {p}
              </EllipsisTooltip>
            ))}
          </Space>
        ) : (
          '-'
        )
      },
    },
    {
      title: t('metric.evaluationSteps', '评估步骤'),
      key: 'evaluation_steps',
      width: 220,
      render: (_: unknown, record: Metric) => {
        const steps = record.params_content?.evaluation_steps
        if (!steps || steps.length === 0) return '-'
        const jsonStr = JSON.stringify(steps, null, 2)
        return (
          <EllipsisTooltip maxWidth={220} placement="topLeft">
            {jsonStr}
          </EllipsisTooltip>
        )
      },
    },
    {
      title: t('metric.strictMode', '严格模式'),
      key: 'strict_mode',
      width: 140,
      render: (_: unknown, record: Metric) => {
        const val = record.params_content?.strict_mode
        return (
          <EllipsisTooltip maxWidth={100}>
            {val ? t('common.yes', '是') : t('common.no', '否')}
          </EllipsisTooltip>
        )
      },
    },
    {
      title: t('metric.threshold', '阈值'),
      key: 'threshold',
      width: 100,
      render: (_: unknown, record: Metric) => {
        const val = record.params_content?.threshold
        return (
          <EllipsisTooltip maxWidth={100}>
            {val !== undefined && val !== null ? String(val) : '-'}
          </EllipsisTooltip>
        )
      },
    },
    {
      title: t('common.actions'),
      key: 'action',
      width: 160,
      fixed: 'right',
      render: (_: unknown, record: unknown) => {
        const r = record as { id: number }
        return (
          <Space>
            <Button
              type="link"
              onClick={() => handleEditMetric(record as Metric)}
            >
              {t('common.edit')}
            </Button>
            <Popconfirm
              title={t('metric.deleteConfirm')}
              onConfirm={() => handleDeleteMetric(r.id)}
            >
              <Button type="link" danger>
                {t('common.delete')}
              </Button>
            </Popconfirm>
          </Space>
        )
      },
    },
  ]

  return (
    <div className="metric-list-container">
      <Card
        title={(
          <div
            className="flex items-center justify-between"
          >
            <Space>
              {selectedMetricKeys.length > 0 && (
                <Popconfirm
                  title={t('metric.batchDeleteConfirm')}
                  onConfirm={handleBatchDeleteMetrics}
                >
                  <Button danger>{t('metric.batchDelete')}</Button>
                </Popconfirm>
              )}
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddMetric}
              >
                {t('metric.add')}
              </Button>
            </Space>
          </div>
        )}
      >
        <Table
          rowSelection={{
            selectedRowKeys: selectedMetricKeys,
            onChange: setSelectedMetricKeys,
          }}
          columns={columns}
          dataSource={metrics}
          scroll={{
            x: 1200,
            y: 'auto',
          }}
          rowKey="id"
          loading={loading}
          locale={{
            emptyText: (
              <Empty description={t('metric.noMetrics') || '暂无指标'} />
            ),
          }}
        />
      </Card>

      {/* 指标表单模态框 */}
      <Drawer
        title={editingMetric ? t('metric.edit') : t('metric.add')}
        open={isMetricModalVisible}
        onClose={() => setIsMetricModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          form={metricForm}
          onFinish={handleMetricSubmit}
          layout="vertical"
          initialValues={{
            metric_type: 'geval',
          }}
        >
          <Form.Item
            name="metric_type"
            className="flex-1"
            label={t('metric.metric_type', '指标类型')}
            rules={[
              { required: true, message: t('metric.metricTypeRequired') },
            ]}
          >
            <Radio.Group
              disabled={!!editingMetric}
              options={[
                { value: 'geval', label: '自定义' },
                { value: 'builtin', label: '内置' },
              ]}
            />
          </Form.Item>

          {isBuiltin && (
            <Form.Item
              className="flex-1"
              name="type"
              label={t('metric.builtinMetric', '内置指标')}
            >
              <Select
                placeholder={t('metric.builtinMetricPlaceholder')}
                loading={builtinLoading}
                disabled={!!editingMetric}
                options={builtinMetrics.map((m) => ({
                  label: m.name,
                  value: m.id,
                  description: m.description,
                }))}
                onChange={(val) => {
                  const metric = builtinMetrics.find((m) => m.id === val)
                  if (metric) {
                    metricForm.setFieldsValue({
                      name: metric.name,
                      description: metric.description,
                      required_params: metric.required_params,
                      criteria: metric.params_content?.criteria,
                      strict_mode: metric.params_content?.strict_mode,
                      threshold: metric.params_content?.threshold,
                      evaluation_steps: metric.params_content?.evaluation_steps,
                    })
                  }
                }}
              />
            </Form.Item>
          )}
          <Form.Item
            name="name"
            label={t('metric.name', '指标名称')}
            rules={[{ required: true, message: t('metric.nameRequired') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t('metric.description', '描述')}>
            <Input.TextArea />
          </Form.Item>
          <Form.Item
            name="required_params"
            label={t('metric.required_params', '必填参数')}
            rules={[
              { required: true, message: t('metric.requiredParamsRequired') },
            ]}
          >
            <Select
              mode="multiple"
              disabled={isBuiltin}
              placeholder={t('metric.requiredParamsPlaceholder')}
              options={[
                { label: 'Input', value: 'input' },
                { label: 'Actual Output', value: 'actual_output' },
                { label: 'Expected Output', value: 'expected_output' },
              ]}
            />
          </Form.Item>
          {!isBuiltin ? (
            <>
              <Form.Item
                name="criteria"
                label={t('metric.criteria', '评判标准')}
                rules={[
                  { required: true, message: t('metric.criteriaRequired') },
                ]}
              >
                <Input.TextArea rows={4} />
              </Form.Item>

              {criteria && requiredParams?.length && modelList.length > 0 && (
                <div className="mb-4 flex items-center gap-2 justify-between">
                  <Select
                    className="flex-1"
                    value={selectedModel}
                    options={modelList}
                    onChange={setSelectedModel}
                  />
                  <Button
                    type="primary"
                    loading={generating}
                    onClick={handleGenerateEvaluationStep}
                  >
                    {t('metric.generateEvaluationStep', '自动生成评估步骤')}
                  </Button>
                </div>
              )}
              <Form.Item
                name="evaluation_steps"
                label={t('metric.evaluationSteps', '评估步骤')}
              >
                <Form.List name="evaluation_steps">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map((field) => (
                        <div key={field.key} className="flex">
                          <Form.Item
                            className="flex-1"
                            {...field}
                            key={field.key}
                            name={field.name}
                            rules={[
                              {
                                required: true,
                                message: t(
                                  'metric.evaluationStepRequired',
                                  '请输入评估步骤',
                                ),
                              },
                            ]}
                          >
                            <Input
                              className="w-full"
                              placeholder={t(
                                'metric.evaluationStepPlaceholder',
                                '请输入评估步骤',
                              )}
                            />
                          </Form.Item>
                          <Button
                            type="link"
                            icon={<DeleteOutlined />}
                            danger
                            onClick={() => remove(field.name)}
                          >
                          </Button>
                        </div>
                      ))}
                      <Form.Item>
                        <Button
                          type="link"
                          icon={<PlusOutlined />}
                          onClick={() => add()}
                          className="!p-0"
                        >
                          {t('metric.addEvaluationStep', '添加步骤')}
                        </Button>
                      </Form.Item>
                    </>
                  )}
                </Form.List>
              </Form.Item>
            </>
          ) : null}

          <Form.Item
            name="strict_mode"
            label={t('metric.strictMode', '严格模式')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="include_reason"
            label={t('metric.includeReason', '包含原因')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="threshold"
            label={t('metric.threshold', '阈值')}
            initialValue={0.5}
            rules={[
              { required: true, message: t('metric.thresholdRequired') },
              {
                type: 'number',
                min: 0,
                max: 1,
                message: t('metric.thresholdRange'),
              },
            ]}
          >
            <InputNumber step={0.1} min={0} max={1} className="w-full" />
          </Form.Item>

          <Form.Item
            name="directory_id"
            initialValue={Number(directoryId)}
            hidden
          >
            <Input />
          </Form.Item>
          <Form.Item className="text-right">
            <Space>
              <Button onClick={() => setIsMetricModalVisible(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="primary" htmlType="submit">
                {t('common.confirm')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  )
}

export default MetricList
