import React, { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Cascader,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Popover,
  Radio,
  Table,
  Typography,
  message,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import type { Dayjs } from 'dayjs'
import AddAnnotationMemberModal from './components/AddAnnotationMemberModal'
import {
  DATE_TIME_PICKER_ZH_FORMAT,
  disabledDateNotBeforeToday,
  disabledTimeNotBeforeNow,
} from '@/utils/datePickerDisabledUtils'
import { DatasetCascaderSelector } from '@/components/inference'
import type { User } from '@/types'
import type { TrainingDatasetItem } from '@/types/training'
import { labelTaskService } from '@/services/dataAnnotationService'
import { machineDatamanagement } from '@/services/machineDatamanagement'
import {
  type ItemList,
  TASK_TYPE_MAP,
  TASK_TYPE_TO_TEMPLATE_TYPES,
  TEMPLATE_TYPE_MAP,
} from '@/services/machineLearnModel'
import type {
  CreateMultiLabelTaskRequest,
  MultiLabelAssignItem,
  SourceType,
} from '@/services/dataAnnotationService'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'

const { Text } = Typography
const { TextArea } = Input

function distributeCountEvenly<T extends { count: number }>(rows: T[], total: number): T[] {
  if (rows.length === 0) return rows
  const base = Math.floor(total / rows.length)
  const remainder = total % rows.length

  return rows.map((row, index) => ({
    ...row,
    count: base + (index < remainder ? 1 : 0),
  }))
}

// 标注成员行
interface AnnotationMemberRow {
  key: string
  userId: number
  username: string
  count: number
  deadline: Dayjs | null
}

// 审核成员行
interface ReviewMemberRow {
  key: string
  userId: number
  username: string
  count: number
  deadline: Dayjs | null
}

interface MachineDatasetCascaderOption {
  value: string | number
  label: string
  isLeaf?: boolean
  disabled?: boolean
  loading?: boolean
  children?: MachineDatasetCascaderOption[]
  dataset?: ItemList
  versionItem?: ItemList
}

const DATASET_PAGE_SIZE = 100

function createMachineTaskTypeOptions(): MachineDatasetCascaderOption[] {
  return Object.entries(TASK_TYPE_MAP).map(([value, label]) => ({
    value,
    label,
    isLeaf: false,
  }))
}

interface CreateMultiPersonAnnotationTaskProps {
  projectId?: string
  backPath?: string
  bizType?: string
}

const CreateMultiPersonAnnotationTask: React.FC<CreateMultiPersonAnnotationTaskProps> = ({
  projectId: projectIdProp,
  backPath,
  bizType,
}) => {
  const routeParams = useParams<{ projectId: string }>()
  const projectId = projectIdProp ?? routeParams.projectId
  const projectIdNum = Number(projectId)
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const isMachineLearningBiz = bizType === 'machine_learning'

  const [submitLoading, setSubmitLoading] = useState(false)
  const [sourceType, setSourceType] = useState<SourceType>('existed_dataset')
  const [datasetName, setDatasetName] = useState<string>('')
  const [selectedDatasetObj, setSelectedDatasetObj] = useState<any>(null)
  const [selectedDatasetVersionObj, setSelectedDatasetVersionObj] = useState<any>(null)
  const [machineDatasetOptions, setMachineDatasetOptions] = useState<MachineDatasetCascaderOption[]>(() => createMachineTaskTypeOptions())

  const [annotationMembers, setAnnotationMembers] = useState<AnnotationMemberRow[]>([])
  const [reviewMembers, setReviewMembers] = useState<ReviewMemberRow[]>([])
  const [annotationMemberModalOpen, setAnnotationMemberModalOpen] = useState(false)
  const [reviewMemberModalOpen, setReviewMemberModalOpen] = useState(false)
  const [annotationDeadlinePopoverOpen, setAnnotationDeadlinePopoverOpen] = useState(false)
  const [reviewDeadlinePopoverOpen, setReviewDeadlinePopoverOpen] = useState(false)
  const samplingRatio = Form.useWatch('sampling_ratio', form) ?? 100

  const datasetType = isMachineLearningBiz
    ? ((selectedDatasetVersionObj?.dataset_category ?? selectedDatasetObj?.dataset_category) === 'image'
        ? 'image-understanding'
        : 'text-generation')
    : (selectedDatasetVersionObj?.dataset_type
      ?? selectedDatasetObj?.dataset_type
      ?? 'text-generation')
  const datasetFormat = isMachineLearningBiz
    ? (selectedDatasetVersionObj?.template_type
      ?? selectedDatasetObj?.template_type
      ?? selectedDatasetVersionObj?.task_type
      ?? selectedDatasetObj?.task_type
      ?? 'text_classification_single_label')
    : (selectedDatasetVersionObj?.dataset_format
      ?? selectedDatasetObj?.dataset_format
      ?? 'prompt-response')

  const totalDataCount = selectedDatasetVersionObj?.total_samples
    ?? selectedDatasetVersionObj?.sample_count
    ?? 0
  const reviewQuota = totalDataCount > 0
    ? Math.ceil((totalDataCount * Number(samplingRatio || 100)) / 100)
    : 0
  const totalAnnotationAssigned = annotationMembers.reduce((sum, r) => sum + (r.count || 0), 0)
  const totalReviewAssigned = reviewMembers.reduce((sum, r) => sum + (r.count || 0), 0)

  /** 基于所选版本推导处理后数据集默认名称（与 DatasetCascaderSelector 弹窗内数据一致） */
  const calculateNewDatasetName = (datasetName: string, selectedVersionStr: string) => {
    const match = selectedVersionStr?.match(/v(\d+)/i)
    if (match) {
      const n = parseInt(match[1], 10)
      return `${datasetName}-V${n + 1}`
    }
    return `${datasetName}-V1`
  }

  useEffect(() => {
    if (!isMachineLearningBiz) return
    setMachineDatasetOptions(createMachineTaskTypeOptions())
  }, [isMachineLearningBiz])

  const loadMachineDatasetOptions = useCallback(async (selectedOptions: MachineDatasetCascaderOption[]) => {
    const targetOption = selectedOptions[selectedOptions.length - 1]
    if (!targetOption || targetOption.loading || targetOption.children || Number.isNaN(projectIdNum)) return

    targetOption.loading = true
    setMachineDatasetOptions((prev) => [...prev])

    try {
      if (selectedOptions.length === 1) {
        const taskType = String(targetOption.value)
        const templates = TASK_TYPE_TO_TEMPLATE_TYPES[taskType] ?? []
        targetOption.children = templates.length
          ? templates.map((templateType) => ({
              value: templateType,
              label: TEMPLATE_TYPE_MAP[templateType] ?? templateType,
              isLeaf: false,
            }))
          : [{
              value: '__no_template__',
              label: '暂无可用模板',
              isLeaf: true,
              disabled: true,
            }]
      }
      else if (selectedOptions.length === 2) {
        const taskType = String(selectedOptions[0].value)
        const templateType = String(targetOption.value)
        const response = await machineDatamanagement.getMachineDatasetList(
          projectIdNum,
          1,
          DATASET_PAGE_SIZE,
          taskType,
          undefined,
          templateType,
        )
        const items = response.items ?? []
        targetOption.children = items.length
          ? items.map((item) => ({
              value: `ds-${item.id}`,
              label: item.name || `数据集 ${item.id}`,
              isLeaf: false,
              dataset: item,
            }))
          : [{
              value: '__no_dataset__',
              label: '暂无可用数据集',
              isLeaf: true,
              disabled: true,
            }]
      }
      else if (selectedOptions.length === 3) {
        const dataset = targetOption.dataset
        if (!dataset) return

        const versions = await machineDatamanagement.getDatasetVersion(projectIdNum, dataset.id)
        targetOption.children = versions.length
          ? versions.map((item) => ({
              value: item.id,
              label: item.version || `版本 ${item.id}`,
              isLeaf: true,
              versionItem: item,
            }))
          : [{
              value: '__no_version__',
              label: '暂无可用版本',
              isLeaf: true,
              disabled: true,
            }]
      }
      else {
        targetOption.children = []
      }
    }
    catch (error) {
      targetOption.children = [{
        value: '__load_error__',
        label: '加载版本失败，请重试',
        isLeaf: true,
        disabled: true,
      }]
      message.error(error instanceof Error ? error.message : '加载数据集版本失败')
    }
    finally {
      targetOption.loading = false
      setMachineDatasetOptions((prev) => [...prev])
    }
  }, [projectIdNum])

  const handleMachineDatasetChange = useCallback((
    value: Array<string | number>,
    selectedOptions?: MachineDatasetCascaderOption[],
  ) => {
    form.setFieldsValue({ data_to_infer: value?.length ? value : undefined })
    if (!value?.length || !selectedOptions?.length) {
      setSelectedDatasetObj(null)
      setSelectedDatasetVersionObj(null)
      setDatasetName('')
      return
    }

    if (selectedOptions.length >= 4) {
      const [, , datasetOption, versionOption] = selectedOptions
      const dataset = datasetOption.dataset
      const versionItem = versionOption.versionItem

      setSelectedDatasetObj(dataset ?? null)
      setSelectedDatasetVersionObj(versionItem ?? null)

      if (dataset?.name && versionItem?.version) {
        setDatasetName(calculateNewDatasetName(dataset.name, versionItem.version))
      }
      else {
        setDatasetName('')
      }
    }
  }, [form])

  const handleDatasetCascaderChange = (value: any[], selectedOptions?: any[]) => {
    form.setFieldsValue({ data_to_infer: value?.length ? value : undefined })
    if (!value?.length || !selectedOptions?.length) {
      setSelectedDatasetObj(null)
      setSelectedDatasetVersionObj(null)
      setDatasetName('')
      return
    }
    if (value.length >= 2 && selectedOptions.length >= 2) {
      const name = value[1]
      const rowData = (selectedOptions[1] as { data?: TrainingDatasetItem })?.data
      setSelectedDatasetObj(rowData ?? null)
      if (value.length >= 3 && selectedOptions[2]) {
        const versionData = selectedOptions[2].versionData
        setSelectedDatasetVersionObj(versionData || null)
        const version = value[2]
        const newName = calculateNewDatasetName(name, String(version))
        setDatasetName(newName)
      }
      else {
        setSelectedDatasetVersionObj(null)
        setDatasetName('')
      }
    }
  }

  const handleBack = () => {
    navigate(backPath ?? `/project/${projectId}/data-annotation?tab=multi-person&sub_tab=overview`)
  }

  const onAnnotationMembersConfirm = (users: User[]) => {
    const existingIds = new Set(annotationMembers.map((r) => r.userId))
    const toAdd = users.filter((u) => !existingIds.has(u.userId))
    if (toAdd.length === 0) {
      message.warning('所选成员已在列表中')
      return
    }
    setAnnotationMembers((prev) => [
      ...prev,
      ...toAdd.map((u) => ({
        key: `ann-${u.userId}-${Date.now()}`,
        userId: u.userId,
        username: u.username,
        count: 0,
        deadline: null as Dayjs | null,
      })),
    ])
  }

  const removeAnnotationMember = (key: string) => {
    setAnnotationMembers((prev) => prev.filter((r) => r.key !== key))
  }

  const updateAnnotationMember = (key: string, field: keyof AnnotationMemberRow, value: any) => {
    setAnnotationMembers((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)),
    )
  }

  const averageAnnotation = () => {
    if (annotationMembers.length === 0) return
    const per = Math.floor(totalDataCount / annotationMembers.length)
    const remainder = totalDataCount % annotationMembers.length
    setAnnotationMembers((prev) =>
      prev.map((r, index) => ({
        ...r,
        count: per + (index < remainder ? 1 : 0),
      })),
    )
  }

  const unifiedAnnotationDeadline = (date: Dayjs | null) => {
    setAnnotationMembers((prev) => prev.map((r) => ({ ...r, deadline: date })))
    setAnnotationDeadlinePopoverOpen(false)
  }

  const onReviewMembersConfirm = (users: User[]) => {
    const existingIds = new Set(reviewMembers.map((r) => r.userId))
    const toAdd = users.filter((u) => !existingIds.has(u.userId))
    if (toAdd.length === 0) {
      message.warning('所选成员已在列表中')
      return
    }
    setReviewMembers((prev) => [
      ...prev,
      ...toAdd.map((u) => ({
        key: `rev-${u.userId}-${Date.now()}`,
        userId: u.userId,
        username: u.username,
        count: 0,
        deadline: null as Dayjs | null,
      })),
    ])
  }

  const removeReviewMember = (key: string) => {
    setReviewMembers((prev) => prev.filter((r) => r.key !== key))
  }

  const updateReviewMember = (key: string, field: keyof ReviewMemberRow, value: any) => {
    setReviewMembers((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)),
    )
  }

  const averageReview = () => {
    if (reviewMembers.length === 0) return
    setReviewMembers((prev) => distributeCountEvenly(prev, reviewQuota))
  }

  const unifiedReviewDeadline = (date: Dayjs | null) => {
    setReviewMembers((prev) => prev.map((r) => ({ ...r, deadline: date })))
    setReviewDeadlinePopoverOpen(false)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (!projectId) {
        message.error('项目ID不存在')
        return
      }
      if (!selectedDatasetVersionObj) {
        message.error('请选择需要标注的数据集')
        return
      }
      if (annotationMembers.length === 0) {
        message.error('请至少添加一位标注成员')
        return
      }
      if (totalAnnotationAssigned !== totalDataCount) {
        message.error('标注员分配总数必须等于总样本数')
        return
      }
      if (reviewMembers.length === 0) {
        message.error('请至少添加一位审核成员')
        return
      }
      if (totalReviewAssigned !== reviewQuota) {
        message.error('审核员分配总数必须等于抽检后的审核数量')
        return
      }

      const toAssignItem = (userId: number, count: number, deadline: Dayjs | null): MultiLabelAssignItem => ({
        user_id: userId,
        assign_count: count,
        deadline: deadline?.format('YYYY-MM-DD HH:mm:ss') ?? null,
      })

      setSubmitLoading(true)
      const datasetId = selectedDatasetVersionObj?.id ?? selectedDatasetObj?.id ?? 0
      const payload: CreateMultiLabelTaskRequest = {
        task_name: values.task_name?.trim() ?? '',
        description: values.task_description?.trim() ?? '',
        biz_type: bizType,
        source: sourceType,
        source_dataset_id: datasetId,
        dataset_type: datasetType,
        dataset_format: datasetFormat,
        override: values.override === 'override',
        annotators: annotationMembers.map((r) => toAssignItem(r.userId, r.count, r.deadline)),
        auditors: reviewMembers.map((r) => toAssignItem(r.userId, r.count, r.deadline)),
        audit_sampling_ratio: Number(values.sampling_ratio) || 100,
      }
      await labelTaskService.createMultiLabelTask(Number(projectId), payload)
      message.success('创建多人标注任务成功')
      handleBack()
    }
    catch {
      // if (e?.errorFields) return
      // message.error(e?.message || '创建失败')
    }
    finally {
      setSubmitLoading(false)
    }
  }

  const annotationColumns = [
    {
      title: '标注成员',
      dataIndex: 'username',
      key: 'username',
      width: 120,
      render: (_: string, record: AnnotationMemberRow) => record.username,
    },
    {
      title: (
        <span>
          标注数量
          {' '}
          <Button type="link" size="small" onClick={averageAnnotation} className="p-0 h-auto">
            平均分配
          </Button>
        </span>
      ),
      dataIndex: 'count',
      key: 'count',
      width: 140,
      render: (_: number, record: AnnotationMemberRow) => (
        <InputNumber
          min={0}
          value={record.count}
          onChange={(v) => updateAnnotationMember(record.key, 'count', v ?? 0)}
          className="w-full"
        />
      ),
    },
    {
      title: (
        <span>
          任务截止时间
          {' '}
          <Popover
            open={annotationDeadlinePopoverOpen}
            onOpenChange={setAnnotationDeadlinePopoverOpen}
            content={(
              <div className="py-1">
                <DatePicker
                  showTime
                  format={DATE_TIME_PICKER_ZH_FORMAT}
                  disabledDate={disabledDateNotBeforeToday}
                  disabledTime={disabledTimeNotBeforeNow}
                  onChange={(d) => unifiedAnnotationDeadline(d)}
                  allowClear
                  className="w-[260px]"
                />
              </div>
            )}
            trigger="click"
          >
            <Button type="link" size="small" className="p-0 h-auto">
              统一时间
            </Button>
          </Popover>
        </span>
      ),
      dataIndex: 'deadline',
      key: 'deadline',
      width: 200,
      render: (_: any, record: AnnotationMemberRow) => (
        <DatePicker
          showTime
          value={record.deadline}
          onChange={(d) => updateAnnotationMember(record.key, 'deadline', d)}
          format={DATE_TIME_PICKER_ZH_FORMAT}
          disabledDate={disabledDateNotBeforeToday}
          disabledTime={disabledTimeNotBeforeNow}
          className="w-full"
          placeholder="请选择日期时间"
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, record: AnnotationMemberRow) => (
        <Button type="link" danger size="small" onClick={() => removeAnnotationMember(record.key)}>
          删除
        </Button>
      ),
    },
  ]

  const reviewColumns = [
    {
      title: '审核成员',
      dataIndex: 'username',
      key: 'username',
      width: 120,
      render: (_: string, record: ReviewMemberRow) => record.username,
    },
    {
      title: (
        <span>
          审核数量
          {' '}
          <Button type="link" size="small" onClick={averageReview} className="p-0 h-auto">
            平均分配
          </Button>
        </span>
      ),
      dataIndex: 'count',
      key: 'count',
      width: 140,
      render: (_: number, record: ReviewMemberRow) => (
        <InputNumber
          min={0}
          value={record.count}
          onChange={(v) => updateReviewMember(record.key, 'count', v ?? 0)}
          className="w-full"
        />
      ),
    },
    {
      title: (
        <span>
          任务截止时间
          {' '}
          <Popover
            open={reviewDeadlinePopoverOpen}
            onOpenChange={setReviewDeadlinePopoverOpen}
            content={(
              <div className="py-1">
                <DatePicker
                  showTime
                  format={DATE_TIME_PICKER_ZH_FORMAT}
                  disabledDate={disabledDateNotBeforeToday}
                  disabledTime={disabledTimeNotBeforeNow}
                  onChange={(d) => unifiedReviewDeadline(d)}
                  allowClear
                  className="w-[260px]"
                />
              </div>
            )}
            trigger="click"
          >
            <Button type="link" size="small" className="p-0 h-auto">
              统一时间
            </Button>
          </Popover>
        </span>
      ),
      dataIndex: 'deadline',
      key: 'deadline',
      width: 200,
      render: (_: any, record: ReviewMemberRow) => (
        <DatePicker
          showTime
          value={record.deadline}
          onChange={(d) => updateReviewMember(record.key, 'deadline', d)}
          format={DATE_TIME_PICKER_ZH_FORMAT}
          disabledDate={disabledDateNotBeforeToday}
          disabledTime={disabledTimeNotBeforeNow}
          className="w-full"
          placeholder="请选择日期时间"
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, record: ReviewMemberRow) => (
        <Button type="link" danger size="small" onClick={() => removeReviewMember(record.key)}>
          删除
        </Button>
      ),
    },
  ]

  return (
    <div className="create-form-page">
      <section className="create-form-card">
        <CreateFormPageHeader
          title="创建多人标注任务"
          onBack={handleBack}
          actions={(
            <>
              <Button className="create-form-cancel" onClick={handleBack}>取消</Button>
              <Button className="create-form-submit" type="primary" onClick={handleSubmit} loading={submitLoading}>
                确定
              </Button>
            </>
          )}
        />
        <div className="create-form-divider" />
        <div className="create-form-body">
          <Form
            form={form}
            layout="vertical"
            initialValues={{
              override: 'new_version',
              sourceType: 'existed_dataset',
              sampling_ratio: 100,
            }}
          >
            {/* 基本信息 */}
            <Typography.Title level={5} className="mb-3">
              基本信息
            </Typography.Title>
            <Form.Item
              name="task_name"
              label="任务名称"
              required
              rules={[
                { required: true, message: '请输入标注任务名称' },
                { min: 2, max: 64, message: '2-64个字符' },
                {
                  pattern: /^[a-zA-Z0-9\u4E00-\u9FA5][a-zA-Z0-9_\u4E00-\u9FA5-]*$/,
                  message: '支持中英文、数字、中划线(-)、下划线(_)，不能以下划线和中划线开头',
                },
              ]}
            >
              <Input
                placeholder="请输入标注任务名称"
                maxLength={64}
                showCount
              />
            </Form.Item>
            <Form.Item name="task_description" label="任务描述">
              <TextArea
                placeholder="请输入数据标注任务描述,1000字符以内"
                rows={3}
                maxLength={1000}
                showCount
              />
            </Form.Item>

            {/* 数据选择 */}
            <Typography.Title level={5} className="mb-3 mt-6">
              数据选择
            </Typography.Title>
            <Form.Item name="sourceType" initialValue="existed_dataset">
              <Radio.Group
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as SourceType)}
              >
                <Radio value="existed_dataset">已有数据集</Radio>
              </Radio.Group>
            </Form.Item>
            {isMachineLearningBiz
              ? (
                  <Form.Item
                    name="data_to_infer"
                    rules={[{ required: true, message: '请选择需要标注的数据集' }]}
                  >
                    <Cascader
                      options={machineDatasetOptions}
                      onChange={handleMachineDatasetChange}
                      loadData={loadMachineDatasetOptions}
                      changeOnSelect={false}
                      placeholder={machineDatasetOptions.length ? '请选择需要标注的数据集版本' : '暂无可用数据集'}
                      disabled={!machineDatasetOptions.length}
                      displayRender={(labels, selectedOptions) => {
                        if (selectedOptions && selectedOptions.length < 2) {
                          return `${labels.join(' / ')} (请继续选择版本)`
                        }
                        return labels.join(' / ')
                      }}
                    />
                  </Form.Item>
                )
              : (
                  <DatasetCascaderSelector
                    label="待标注数据"
                    form={form}
                    onChange={handleDatasetCascaderChange}
                    placeholder="请选择需要标注的数据集"
                    modalTitle="待标注数据集"
                  />
                )}
            <div className="mb-4">
              <Text type="secondary">
                数据量:
                {' '}
                {totalDataCount !== undefined ? `${totalDataCount} 条` : '-- 条'}
              </Text>
            </div>

            <Typography.Title level={5} className="mb-2 mt-4">
              处理后数据集
            </Typography.Title>
            <Form.Item name="override" initialValue="new_version">
              <Radio.Group>
                <Radio value="new_version">新增版本</Radio>
              </Radio.Group>
            </Form.Item>
            <div className="mb-6">
              <Text>
                数据集名称:
                {' '}
                {datasetName || '--'}
                {' '}
                {datasetName && '(' + '预计' + ')'}
              </Text>
            </div>

            {/* 任务分配 - 标注成员 */}
            <Typography.Title level={5} className="mb-2 mt-6">
              选择标注成员
            </Typography.Title>
            <Table
              columns={annotationColumns}
              dataSource={annotationMembers}
              pagination={false}
              size="middle"
              rowKey="key"
            />
            <div className="mb-6 mt-2 flex justify-end gap-3 items-center">
              <Text type="secondary">
                分配标注数量/总计标注数量:
                {' '}
                {totalAnnotationAssigned}
                条/
                {totalDataCount ?? 0}
                条
              </Text>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setAnnotationMemberModalOpen(true)}
              >
                添加标注成员
              </Button>
            </div>

            {/* 选择审核成员 */}
            <div className="flex items-center gap-4 mt-6 mb-2">
              <Typography.Title level={5} className="!mb-0">
                选择审核成员
              </Typography.Title>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-gray-600 whitespace-nowrap">抽检比例:</span>
                <Form.Item
                  name="sampling_ratio"
                  label=""
                  className="!mb-0"
                  rules={[
                    { type: 'number', min: 1, max: 100, message: '抽检比例范围为 1-100 的整数' },
                  ]}
                >
                  <InputNumber
                    min={1}
                    max={100}
                    precision={0}
                    placeholder="请输入数据抽检比例"
                    addonAfter="%"
                    className="w-[240px]"
                    onChange={() => {
                      setReviewMembers((prev) => prev.map((member) => ({ ...member, count: 0 })))
                    }}
                    onBlur={() => {
                      const v = form.getFieldValue('sampling_ratio')
                      if (v === undefined || v === null || v === '') {
                        form.setFieldsValue({ sampling_ratio: 100 })
                      }
                    }}
                  />
                </Form.Item>
              </div>
            </div>
            <Text type="secondary" className="block mb-2">
              请填写人数或输入分配比例，默认100%
            </Text>
            <Table
              columns={reviewColumns}
              dataSource={reviewMembers}
              pagination={false}
              size="middle"
              rowKey="key"
            />
            <div className="mb-2 mt-2 flex justify-end gap-3 items-center">
              <Text type="secondary">
                分配审核数量/总计审核数量:
                {' '}
                {totalReviewAssigned}
                条/
                {reviewQuota}
                条
              </Text>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setReviewMemberModalOpen(true)}
              >
                添加审核成员
              </Button>
            </div>
          </Form>
        </div>

        <AddAnnotationMemberModal
          open={annotationMemberModalOpen}
          mode="annotation"
          projectId={projectId}
          excludeUserIds={annotationMembers.map((r) => r.userId)}
          onCancel={() => setAnnotationMemberModalOpen(false)}
          onConfirm={onAnnotationMembersConfirm}
        />
        <AddAnnotationMemberModal
          open={reviewMemberModalOpen}
          mode="review"
          projectId={projectId}
          excludeUserIds={reviewMembers.map((r) => r.userId)}
          onCancel={() => setReviewMemberModalOpen(false)}
          onConfirm={onReviewMembersConfirm}
        />
      </section>
    </div>
  )
}

export default CreateMultiPersonAnnotationTask
