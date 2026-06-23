import { CopyOutlined, DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TableColumnsType } from 'antd'
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, message } from 'antd'
import { useMemo, useState } from 'react'
import {
  trainingParameterTemplateService,
  type TrainingParameterTemplate,
  type TrainingParameterTemplateCreateParams,
  type TrainingTemplateMethod,
} from '@/services/trainingParameterTemplateService'

type TemplateFormValues = {
  name: string
  description?: string
  training_method: TrainingTemplateMethod
  enabled: boolean
  template_content: string
}

const defaultTemplateContent = `fineTuneType: lora
params:
  learning_rate: 0.00002
  num_train_epochs: 3
  per_device_train_batch_size: 2
  gradient_accumulation_steps: 1
  warmup_ratio: 0.1
  lr_scheduler_type: cosine
  bf16: true
  gradient_checkpointing: true
  max_grad_norm: 1
  rope_scaling: yarn
  seed: 42
  weight_decay: 0
  cutoff_len: 4096
  preprocessing_num_workers: 16
  eval_strategy: steps
  eval_steps: 20
  greater_is_better: false
  load_best_model_at_end: true
  metric_for_best_model: loss
  per_device_eval_batch_size: 2
  save_strategy: steps
  save_steps: 20
  save_total_limit: 3
  logging_steps: 5
  num_generations: 8
  max_prompt_length: 1024
  max_completion_length: 1024
  temperature: 0.9
  top_p: 0.95
  top_k: 50
  repetition_penalty: 1.05
  kl_coefficient: 0.04
  clip_range: 0.2
  advantage_estimator: grpo
  reward_normalization: true
  reward_scale: 1
  lora_rank: 16
  lora_target_modules:
    - all
  lora_alpha: 32
  lora_dropout: 0`

function getErrorDetail(error: unknown): string {
  const data = (error as any)?.response?.data
  if (typeof data?.detail === 'string') return data.detail
  if (Array.isArray(data?.detail) && data.detail[0]?.msg) return data.detail[0].msg
  return (error as Error)?.message || '操作失败'
}

function formatTime(value?: string) {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 19)
}

export default function TrainingParameterTemplateSetting() {
  const [form] = Form.useForm<TemplateFormValues>()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [searchText, setSearchText] = useState('')
  const [enabledFilter, setEnabledFilter] = useState<boolean | undefined>()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<TrainingParameterTemplate | null>(null)

  const queryParams = useMemo(() => ({
    page,
    size: pageSize,
    training_method: 'rft-grpo' as const,
    ...(searchText.trim() ? { name: searchText.trim() } : {}),
    ...(enabledFilter !== undefined ? { enabled: enabledFilter } : {}),
  }), [enabledFilter, page, pageSize, searchText])

  const { data, isLoading } = useQuery({
    queryKey: ['training-parameter-templates', queryParams],
    queryFn: () => trainingParameterTemplateService.list(queryParams),
    staleTime: 0,
    gcTime: 0,
  })

  const invalidateTemplates = () => queryClient.invalidateQueries({ queryKey: ['training-parameter-templates'] })

  const saveMutation = useMutation({
    mutationFn: async (values: TemplateFormValues) => {
      if (editingTemplate) {
        return trainingParameterTemplateService.update(editingTemplate.id, {
          name: values.name,
          description: values.description ?? '',
          template_content: values.template_content,
          enabled: values.enabled,
        })
      }
      const payload: TrainingParameterTemplateCreateParams = {
        name: values.name,
        description: values.description ?? '',
        training_method: values.training_method,
        template_content: values.template_content,
        enabled: values.enabled,
      }
      return trainingParameterTemplateService.create(payload)
    },
    onSuccess: async () => {
      message.success(editingTemplate ? '保存成功' : '创建成功')
      closeModal()
      await invalidateTemplates()
    },
    onError: (error) => message.error(getErrorDetail(error)),
  })

  const copyMutation = useMutation({
    mutationFn: ({ templateId, name }: { templateId: number, name: string }) =>
      trainingParameterTemplateService.copy(templateId, name),
    onSuccess: async () => {
      message.success('复制成功')
      await invalidateTemplates()
    },
    onError: (error) => message.error(getErrorDetail(error)),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ templateId, enabled }: { templateId: number, enabled: boolean }) =>
      trainingParameterTemplateService.toggleEnabled(templateId, enabled),
    onSuccess: async () => {
      await invalidateTemplates()
    },
    onError: (error) => message.error(getErrorDetail(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (templateId: number) => trainingParameterTemplateService.delete(templateId),
    onSuccess: async () => {
      message.success('删除成功')
      await invalidateTemplates()
    },
    onError: (error) => message.error(getErrorDetail(error)),
  })

  const openCreateModal = () => {
    setEditingTemplate(null)
    form.setFieldsValue({
      name: '',
      description: '',
      training_method: 'rft-grpo',
      enabled: true,
      template_content: defaultTemplateContent,
    })
    setModalOpen(true)
  }

  const openEditModal = (template: TrainingParameterTemplate) => {
    setEditingTemplate(template)
    form.setFieldsValue({
      name: template.name,
      description: template.description ?? '',
      training_method: template.training_method,
      enabled: template.enabled,
      template_content: template.template_content,
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingTemplate(null)
    form.resetFields()
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    saveMutation.mutate(values)
  }

  const handleCopy = (template: TrainingParameterTemplate) => {
    let nameDraft = `${template.name} 副本`
    Modal.confirm({
      title: '复制模板',
      icon: null,
      content: (
        <Input
          defaultValue={nameDraft}
          maxLength={100}
          onChange={(event) => {
            nameDraft = event.target.value
          }}
        />
      ),
      okText: '确定',
      cancelText: '取消',
      onOk: () => {
        const name = nameDraft.trim()
        if (!name) {
          message.warning('请输入模板名称')
          return Promise.reject(new Error('empty name'))
        }
        copyMutation.mutate({ templateId: template.id, name })
      },
    })
  }

  const columns: TableColumnsType<TrainingParameterTemplate> = [
    {
      title: '模板名称',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      render: (value: string, record) => (
        <Space direction="vertical" size={2}>
          <span className="font-medium">{value}</span>
          <span className="text-xs text-gray-500">{record.description || '-'}</span>
        </Space>
      ),
    },
    {
      title: '训练方法',
      dataIndex: 'training_method',
      key: 'training_method',
      width: 120,
      render: () => <Tag color="cyan">RFT-GRPO</Tag>,
    },
    {
      title: '参数类型',
      dataIndex: 'fine_tune_type',
      key: 'fine_tune_type',
      width: 100,
      render: (value: string) => <Tag>{value === 'full' ? 'Full' : 'LoRA'}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 110,
      render: (enabled: boolean, record) => (
        <Switch
          checked={enabled}
          checkedChildren="启用"
          unCheckedChildren="停用"
          loading={toggleMutation.isPending}
          onChange={(checked) => toggleMutation.mutate({ templateId: record.id, enabled: checked })}
        />
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
      render: formatTime,
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            编辑
          </Button>
          <Button type="link" size="small" icon={<CopyOutlined />} onClick={() => handleCopy(record)}>
            复制
          </Button>
          <Popconfirm
            title="确定删除该模板？"
            okText="确定"
            cancelText="取消"
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="min-w-0 p-4">
      <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <Space wrap>
          <Input
            placeholder="请输入模板名称"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value)
              setPage(1)
            }}
            allowClear
            className="w-[240px]"
          />
          <Select
            allowClear
            placeholder="状态"
            value={enabledFilter}
            className="w-[140px]"
            onChange={(value) => {
              setEnabledFilter(value)
              setPage(1)
            }}
            options={[
              { value: true, label: '启用' },
              { value: false, label: '停用' },
            ]}
          />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          新增模板
        </Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isLoading}
        scroll={{ x: 980 }}
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: [10, 20, 50, 100],
          showTotal: (total) => `共 ${total} 条`,
          onChange: (nextPage, nextPageSize) => {
            setPage(nextPage)
            setPageSize(nextPageSize)
          },
        }}
      />

      <Modal
        title={editingTemplate ? '编辑模板' : '新增模板'}
        open={modalOpen}
        width={840}
        onCancel={closeModal}
        destroyOnClose
        footer={(
          <Space>
            <Button onClick={closeModal}>取消</Button>
            <Button type="primary" loading={saveMutation.isPending} onClick={handleSubmit}>
              保存
            </Button>
          </Space>
        )}
      >
        <Form form={form} layout="vertical" initialValues={{ enabled: true, training_method: 'rft-grpo' }}>
          <div className="grid grid-cols-[1fr_160px_140px] gap-x-4">
            <Form.Item label="模板名称" name="name" rules={[{ required: true, message: '请输入模板名称' }]}>
              <Input maxLength={100} placeholder="请输入模板名称" />
            </Form.Item>
            <Form.Item label="训练方法" name="training_method" rules={[{ required: true, message: '请选择训练方法' }]}>
              <Select options={[{ value: 'rft-grpo', label: 'RFT-GRPO' }]} />
            </Form.Item>
            <Form.Item label="状态" name="enabled" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="停用" />
            </Form.Item>
          </div>
          <Form.Item label="模板描述" name="description">
            <Input.TextArea rows={2} maxLength={1000} showCount placeholder="请输入模板描述" />
          </Form.Item>
          <Form.Item
            label="YAML 模板"
            name="template_content"
            rules={[{ required: true, message: '请输入 YAML 模板' }]}
          >
            <Input.TextArea
              rows={20}
              spellCheck={false}
              className="font-mono text-xs"
              placeholder="fineTuneType: lora"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
