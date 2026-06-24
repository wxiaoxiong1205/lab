import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TableColumnsType } from 'antd'
import {
  Button,
  Form,
  Input,
  Menu,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd'
import { useEffect, useMemo, useState } from 'react'
import {
  TrainingTemplatePreviewForm,
  normalizeTrainingTemplateYamlInput,
} from './TrainingTemplatePreviewForm'
import {
  type AdvancedTemplate,
  type AdvancedTemplateFieldGroup,
  advancedTemplateService,
} from '@/services/advancedTemplateService'

const { TextArea } = Input

type TemplateCategory = 'llm_training'
type TrainingMethod = 'grpo'

interface TrainingTemplate {
  id: number
  name: string
  description: string
  method: TrainingMethod
  enabled: boolean
  yaml: string
  fields?: AdvancedTemplateFieldGroup[]
  updatedAt: string
}

interface TemplateFormValues {
  name: string
  description?: string
  method: TrainingMethod
  enabled: boolean
  yaml: string
}

const TEMPLATE_DOMAIN: TemplateCategory = 'llm_training'
const TEMPLATE_VISIBILITY = 'system'
const ENABLED_STATUS = 'enabled'
const DISABLED_STATUS = 'disabled'

const categoryItems: Array<{ key: TemplateCategory, label: string }> = [
  { key: 'llm_training', label: '大模型训练' },
]

function formatTime(value?: string | null) {
  if (!value)
    return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return value

  return date.toLocaleString('zh-CN', { hour12: false })
}

function isTemplateEnabled(status?: string | null) {
  const normalized = status?.toLowerCase()
  if (!normalized)
    return false

  return ['enabled', 'enable', 'active', 'published', 'online'].includes(normalized)
}

function mapTemplate(item: AdvancedTemplate): TrainingTemplate {
  return {
    id: item.id ?? 0,
    name: item.name,
    description: item.description ?? '',
    method: (item.template_type || 'grpo') as TrainingMethod,
    enabled: isTemplateEnabled(item.status),
    yaml: item.yaml_content || '',
    fields: item.fields,
    updatedAt: formatTime(item.updated_at),
  }
}

function parseTemplateInput(input: string) {
  try {
    const parsed = JSON.parse(input) as Partial<AdvancedTemplate> & { yaml_content?: unknown }
    if (typeof parsed.yaml_content === 'string')
      return parsed
  }
  catch {
    return null
  }

  return null
}

function getYamlToJsonFields(response: Awaited<ReturnType<typeof advancedTemplateService.yamlToJson>>) {
  if (Array.isArray(response))
    return response

  return response.fields ?? response.fileds ?? []
}

function TemplateModal(props: {
  open: boolean
  editing: TrainingTemplate | null
  saving: boolean
  onCancel: () => void
  onSave: (values: TemplateFormValues) => void
}) {
  const { open, editing, saving, onCancel, onSave } = props
  const [form] = Form.useForm<TemplateFormValues>()
  const [activeTab, setActiveTab] = useState('yaml')
  const [inputFieldGroups, setInputFieldGroups] = useState<AdvancedTemplateFieldGroup[] | null | undefined>()
  const previewFieldGroups = inputFieldGroups === undefined ? editing?.fields : inputFieldGroups

  const yamlToJsonMutation = useMutation({
    mutationFn: (yamlContent: string) => advancedTemplateService.yamlToJson({
      yaml_content: normalizeTrainingTemplateYamlInput(yamlContent),
    }),
    onSuccess: (response) => {
      setInputFieldGroups(getYamlToJsonFields(response))
    },
    onError: () => {
      setInputFieldGroups(null)
      message.error('YAML 转表单配置失败')
    },
  })

  useEffect(() => {
    if (!open)
      return

    setInputFieldGroups(undefined)
    form.setFieldsValue({
      name: editing?.name ?? '',
      description: editing?.description ?? '',
      method: editing?.method ?? 'grpo',
      enabled: editing?.enabled ?? true,
      yaml: editing?.yaml ?? '',
    })
    setActiveTab('yaml')
  }, [editing, form, open])

  const handleYamlChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value
    const parsed = parseTemplateInput(value)
    if (!parsed) {
      const normalized = normalizeTrainingTemplateYamlInput(value)
      if (normalized !== value)
        form.setFieldValue('yaml', normalized)
      setInputFieldGroups(null)
      return
    }

    setInputFieldGroups(parsed.fields ?? null)
    form.setFieldsValue({
      name: parsed.name || form.getFieldValue('name'),
      description: parsed.description ?? form.getFieldValue('description'),
      method: (parsed.template_type || form.getFieldValue('method') || 'grpo') as TrainingMethod,
      enabled: parsed.status ? isTemplateEnabled(parsed.status) : form.getFieldValue('enabled'),
      yaml: normalizeTrainingTemplateYamlInput(parsed.yaml_content),
    })
  }

  const refreshPreviewFields = () => {
    const yamlContent = form.getFieldValue('yaml')
    if (!yamlContent) {
      setInputFieldGroups(null)
      message.warning('请先输入 YAML 模板')
      return
    }

    setInputFieldGroups(null)
    yamlToJsonMutation.mutate(yamlContent)
  }

  const handleTabChange = (key: string) => {
    setActiveTab(key)

    if (key === 'preview')
      refreshPreviewFields()
  }

  return (
    <Modal
      title={editing ? '编辑大模型训练参数配置' : '新增大模型训练参数配置'}
      open={open}
      width={920}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button
          key="save"
          type="primary"
          loading={saving}
          onClick={() => {
            form.validateFields().then(onSave)
          }}
        >
          保存
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <div className="grid grid-cols-[1fr_180px_150px] gap-x-4">
          <Form.Item
            name="name"
            label="模板名称"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input placeholder="请输入模板名称" maxLength={80} />
          </Form.Item>
          <Form.Item
            name="method"
            label="训练方法"
            rules={[{ required: true, message: '请选择训练方法' }]}
          >
            <Select options={[{ label: 'GRPO', value: 'grpo' }]} />
          </Form.Item>
          <Form.Item name="enabled" label="启用状态" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </div>

        <Form.Item name="description" label="模板描述">
          <TextArea placeholder="请输入模板描述" rows={3} maxLength={300} />
        </Form.Item>

        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          items={[
            {
              key: 'yaml',
              label: 'YAML模板',
              children: (
                <>
                  <div className="mb-3 text-[13px] text-[var(--lab-color-placeholder)]">
                    切换到表单预览时会调用后端 YAML 转 JSON 接口，并使用返回的 fields 渲染动态表单。
                  </div>
                  <Form.Item
                    name="yaml"
                    rules={[{ required: true, message: '请输入 YAML 模板' }]}
                    className="mb-0"
                  >
                    <TextArea
                      rows={18}
                      spellCheck={false}
                      placeholder="请输入 YAML 模板"
                      onChange={handleYamlChange}
                      className="!resize-none !rounded-md !border-[#1a2440] !bg-[#0f172a] !font-mono !text-[13px] !leading-[19px] !text-white"
                    />
                  </Form.Item>
                </>
              ),
            },
            {
              key: 'preview',
              label: '表单预览',
              children: (
                <Spin spinning={yamlToJsonMutation.isPending}>
                  <TrainingTemplatePreviewForm fieldGroups={previewFieldGroups} />
                </Spin>
              ),
            },
          ]}
        />
      </Form>
    </Modal>
  )
}

export default function TemplateSetting() {
  const queryClient = useQueryClient()
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory>(TEMPLATE_DOMAIN)
  const [searchText, setSearchText] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<TrainingTemplate | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const queryParams = useMemo(() => ({
    page,
    size: pageSize,
    domain: selectedCategory,
    name: searchText.trim() || undefined,
  }), [page, pageSize, searchText, selectedCategory])

  const templatesQuery = useQuery({
    queryKey: ['advanced-templates', queryParams],
    queryFn: () => advancedTemplateService.list(queryParams),
    staleTime: 0,
    gcTime: 0,
  })

  useEffect(() => {
    setPage(1)
  }, [searchText, selectedCategory])

  const templates = useMemo(
    () => templatesQuery.data?.items?.map(mapTemplate) ?? [],
    [templatesQuery.data?.items],
  )

  const invalidateTemplates = () => {
    queryClient.invalidateQueries({ queryKey: ['advanced-templates'] })
  }

  const saveMutation = useMutation({
    mutationFn: async (values: TemplateFormValues) => {
      const parsedInput = parseTemplateInput(values.yaml)
      const payload = {
        name: values.name || parsedInput?.name || '',
        description: values.description ?? parsedInput?.description ?? '',
        domain: parsedInput?.domain || selectedCategory,
        template_type: String(values.method || parsedInput?.template_type || 'grpo').toLowerCase(),
        status: values.enabled ? ENABLED_STATUS : DISABLED_STATUS,
        visibility: parsedInput?.visibility || TEMPLATE_VISIBILITY,
        yaml_content: normalizeTrainingTemplateYamlInput(parsedInput?.yaml_content || values.yaml),
      }

      if (editing) {
        return advancedTemplateService.updateFromYaml(editing.id, {
          ...payload,
          disable_missing_fields: true,
        })
      }

      return advancedTemplateService.createFromYaml(payload)
    },
    onSuccess: () => {
      message.success(editing ? '保存成功' : '新增成功')
      setModalOpen(false)
      setEditing(null)
      invalidateTemplates()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => advancedTemplateService.delete(id),
    onSuccess: () => {
      message.success('删除成功')
      invalidateTemplates()
    },
  })

  const copyMutation = useMutation({
    mutationFn: (id: number) => advancedTemplateService.copy(id),
    onSuccess: () => {
      message.success('复制成功')
      invalidateTemplates()
    },
  })

  const detailMutation = useMutation({
    mutationFn: (id: number) => advancedTemplateService.get(id),
    onSuccess: (detail) => {
      setEditing(mapTemplate(detail))
      setModalOpen(true)
    },
    onError: () => {
      message.error('获取模板详情失败')
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number, enabled: boolean }) => (
      enabled ? advancedTemplateService.enable(id) : advancedTemplateService.disable(id)
    ),
    onSuccess: () => {
      message.success('状态更新成功')
      invalidateTemplates()
    },
  })

  const openCreate = () => {
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (record: TrainingTemplate) => {
    detailMutation.mutate(record.id)
  }

  const handleSave = (values: TemplateFormValues) => {
    saveMutation.mutate(values)
  }

  const handleCopy = (record: TrainingTemplate) => {
    copyMutation.mutate(record.id)
  }

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id)
  }

  const handleEnabledChange = (record: TrainingTemplate, enabled: boolean) => {
    statusMutation.mutate({ id: record.id, enabled })
  }

  const columns: TableColumnsType<TrainingTemplate> = [
    {
      title: '模板名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <div className="min-w-[320px]">
          <div className="font-medium text-[var(--lab-color-text-primary)]">{name}</div>
          <div className="mt-2 text-[13px] text-[var(--lab-color-placeholder)]">{record.description || '-'}</div>
        </div>
      ),
    },
    {
      title: '训练方法',
      dataIndex: 'method',
      key: 'method',
      width: 120,
      render: (method: TrainingMethod) => (
        <Tag color="cyan" className="rounded-full px-3">{method}</Tag>
      ),
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
          className="origin-left scale-110"
          loading={statusMutation.isPending}
          onChange={(checked) => handleEnabledChange(record, checked)}
        />
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
    },
    {
      title: '操作',
      key: 'action',
      width: 210,
      render: (_value, record) => (
        <Space size={14}>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            loading={detailMutation.isPending && detailMutation.variables === record.id}
            onClick={() => openEdit(record)}
          >
            编辑
          </Button>
          <Button type="link" size="small" icon={<CopyOutlined />} onClick={() => handleCopy(record)}>
            复制
          </Button>
          <Popconfirm
            title="确认删除"
            description="确定要删除该模板配置吗？"
            okText="确定"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record.id)}
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
    <div className="flex w-full min-w-0">
      <Menu
        mode="inline"
        selectedKeys={[selectedCategory]}
        items={categoryItems.map((item) => ({
          key: item.key,
          label: item.label,
        }))}
        onClick={({ key }) => setSelectedCategory(key as TemplateCategory)}
        className="!w-[220px] shrink-0"
      />

      <div className="min-w-0 flex-1 overflow-x-auto p-4">
        <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2">
          <Input
            placeholder="请输入模板名称"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onPressEnter={() => templatesQuery.refetch()}
            allowClear
            className="w-[240px]"
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增配置
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={templates}
          rowKey="id"
          loading={templatesQuery.isLoading}
          className="[&_.ant-table-cell]:!px-4 [&_.ant-table-cell]:!py-4"
          pagination={{
            current: page,
            pageSize,
            total: templatesQuery.data?.total ?? 0,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (total) => `共 ${total} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage)
              setPageSize(nextPageSize)
            },
          }}
          scroll={{ x: 'max-content' }}
        />
      </div>

      <TemplateModal
        open={modalOpen}
        editing={editing}
        saving={saveMutation.isPending}
        onCancel={() => {
          setModalOpen(false)
          setEditing(null)
        }}
        onSave={handleSave}
      />
    </div>
  )
}
