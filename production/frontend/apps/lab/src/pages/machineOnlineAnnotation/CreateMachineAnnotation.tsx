import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Cascader, Divider, Form, Input, Spin, Typography, message } from 'antd'
import type { DefaultOptionType } from 'antd/es/cascader'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { CreateMachineAnnotation as MachineAnnotationPayload } from '@/types/machineLearing/machineAnnotationModel.ts'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'
import { machineAnnotationService } from '@/services/machineAnnotation.ts'
import {
  ANNOTATION_TYPE_IMAGE,
  ANNOTATION_TYPE_TEXT,
  DATA_TYPE_OPTIONS,
  TEMPLATE_TYPE_IMAGE_CLASSIFICATION,
  TEMPLATE_TYPE_IMAGE_SEGMENTATION,
  TEMPLATE_TYPE_OBJECT_DETECTION,
  TEMPLATE_TYPE_TEXT_CLASSIFICATION,
  TEMPLATE_TYPE_TEXT_ENTITY_RECOGNITION,
} from '@/services/machineLearnModel.ts'

const { Title } = Typography
const { TextArea } = Input

const TEMPLATES_BY_ANNOTATION_TYPE: Record<string, readonly { label: string, value: string }[]> = {
  image_classification: TEMPLATE_TYPE_IMAGE_CLASSIFICATION,
  object_detection: TEMPLATE_TYPE_OBJECT_DETECTION,
  image_segmentation: TEMPLATE_TYPE_IMAGE_SEGMENTATION,
  text_classification: TEMPLATE_TYPE_TEXT_CLASSIFICATION,
  entity_recognition: TEMPLATE_TYPE_TEXT_ENTITY_RECOGNITION,
}

function annotationTypesForDataType(dataType: string) {
  return dataType === 'image' ? ANNOTATION_TYPE_IMAGE : ANNOTATION_TYPE_TEXT
}

function buildAnnotationCascaderOptions(): DefaultOptionType[] {
  return DATA_TYPE_OPTIONS.map((dt) => ({
    value: dt.value,
    label: dt.label,
    children: annotationTypesForDataType(dt.value).map((at) => ({
      value: at.value,
      label: at.label,
      children: (TEMPLATES_BY_ANNOTATION_TYPE[at.value] ?? []).map((tt) => ({
        value: tt.value,
        label: tt.label,
      })),
    })),
  }))
}

/** 编辑回填：优先用详情字段拼路径；路径无效时返回 undefined */
function cascadeValueFromDetail(detail: {
  data_type: string
  annotation_type: string
  template_type: string
}): [string, string, string] | undefined {
  const { data_type, annotation_type, template_type } = detail
  if (!data_type || !annotation_type || !template_type) {
    return undefined
  }
  const annOptions = annotationTypesForDataType(data_type)
  if (!annOptions.some((a) => a.value === annotation_type)) {
    return undefined
  }
  const templates = TEMPLATES_BY_ANNOTATION_TYPE[annotation_type] ?? []
  if (!templates.some((t) => t.value === template_type)) {
    return undefined
  }
  return [data_type, annotation_type, template_type]
}

const CreateMachineAnnotation: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { projectId } = useParams<{ projectId: string }>()
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  const cascaderOptions = useMemo(() => buildAnnotationCascaderOptions(), [])

  const editId = (location.state as { editId?: number } | null)?.editId
  const isEdit = typeof editId === 'number'

  const pid = Number(projectId)

  const {
    data: detail,
    isLoading: detailLoading,
    isError: detailError,
    error: detailErr,
  } = useQuery({
    queryKey: ['machineAnnotationDetail', projectId, editId],
    queryFn: () => machineAnnotationService.getDetail(pid, editId!),
    enabled: !!projectId && isEdit,
  })

  useEffect(() => {
    if (!detail) {
      return
    }
    form.setFieldsValue({
      name: detail.name,
      description: detail.description,
      base_url: detail.base_url,
      annotation_cascade: cascadeValueFromDetail(detail),
    })
  }, [detail, form])

  const pageTitle = useMemo(() => (isEdit ? '编辑在线标注服务' : '创建在线标注服务'), [isEdit])

  const handleBack = () => {
    navigate(-1)
  }

  const onFinish = async (values: {
    name: string
    description?: string
    base_url: string
    annotation_cascade: [string, string, string]
  }) => {
    const path = values.annotation_cascade
    if (!path || path.length !== 3) {
      message.error('请完整选择数据类型、标注类型与标注模板')
      return
    }
    const [data_type, annotation_type, template_type] = path

    const payload: MachineAnnotationPayload = {
      name: values.name.trim(),
      description: values.description?.trim(),
      base_url: values.base_url.trim(),
      category: annotation_type,
      data_type,
      annotation_type,
      template_type,
    }

    if (isEdit) {
      payload.id = editId
    }

    setSubmitting(true)
    try {
      if (isEdit) {
        await machineAnnotationService.update(pid, payload)
        await queryClient.invalidateQueries({
          queryKey: ['machine-annotation-detail', projectId, String(editId)],
        })
        message.success('保存成功')
      }
      else {
        await machineAnnotationService.create(pid, payload)
        message.success('创建成功')
      }
      navigate(`/project/${projectId}/machine-online-annotation-service`)
    }
    catch (e) {
      message.error((e as Error)?.message || (isEdit ? '保存失败' : '创建失败'))
    }
    finally {
      setSubmitting(false)
    }
  }

  if (!projectId) {
    return (
      <div className="p-4">
        <Alert type="error" message="缺少项目 ID" showIcon />
      </div>
    )
  }

  if (isEdit && detailLoading) {
    return (
      <div className="flex justify-center p-16">
        <Spin size="large" />
      </div>
    )
  }

  if (isEdit && detailError) {
    return (
      <div className="p-4">
        <Alert
          type="error"
          message="加载服务详情失败"
          description={detailErr instanceof Error ? detailErr.message : undefined}
          showIcon
        />
        <Button className="mt-4" onClick={handleBack}>
          返回
        </Button>
      </div>
    )
  }

  return (
    <div className="create-form-page">
      <section className="create-form-card">
        <CreateFormPageHeader
          title={pageTitle}
          onBack={handleBack}
          actions={(
            <>
              <Button className="create-form-cancel" onClick={handleBack}>取消</Button>
              <Button className="create-form-submit" type="primary" htmlType="submit" loading={submitting} form="machine-annotation-form">
                {isEdit ? '保存' : '创建'}
              </Button>
            </>
          )}
        />
        <div className="create-form-divider" />

        <Form
          id="machine-annotation-form"
          form={form}
          layout="vertical"
          onFinish={onFinish}
          autoComplete="off"
          className="create-form-body max-w-[880px]"
        >
          <Card bordered={false} className="mb-6">
            <Title level={4} className="mb-4 mt-0">
              基本信息
            </Title>

            <Form.Item
              name="name"
              label="服务名称"
              rules={[
                { required: true, message: '请输入模型服务名称' },
                { min: 2, max: 64, message: '服务名称长度为 2-64 个字符' },
                {
                  pattern: /^(?!_|-)[\u4E00-\u9FA5a-zA-Z0-9_-]{2,64}$/,
                  message: '仅支持中英文、数字、中划线(-)、下划线(_)，且不能以下划线或中划线开头',
                },
              ]}
              extra="支持中英文、数字、中划线(-)、下划线(_)、2-64个字符，不能以下划线和中划线开头"
            >
              <Input
                placeholder="请输入模型服务名称"
                maxLength={64}
                showCount
              />
            </Form.Item>

            <Form.Item
              name="description"
              label="服务描述"
              rules={[{ max: 1000, message: '服务描述不能超过 1000 个字符' }]}
            >
              <TextArea
                placeholder="请输入模型服务描述，1000字符以内"
                rows={4}
                maxLength={1000}
                showCount
              />
            </Form.Item>
          </Card>

          <Divider className="my-6" />

          <Card bordered={false}>
            <Title level={4} className="mb-4 mt-0">
              标注服务配置
            </Title>

            <Form.Item
              name="base_url"
              label="Base URL"
              rules={[
                { required: true, message: '请输入 Base URL' },
                { type: 'url', message: '请输入有效的 URL（需包含 http:// 或 https://）' },
              ]}
            >
              <Input placeholder="例如：https://api.openai.com/v1" allowClear />
            </Form.Item>

            <Form.Item
              name="annotation_cascade"
              label="服务类型"
              rules={[
                { required: true, message: '请选择标注服务类型' },
                {
                  validator: (_, value) => {
                    if (value && Array.isArray(value) && value.length === 3 && value.every(Boolean)) {
                      return Promise.resolve()
                    }
                    return Promise.reject(new Error('请完整选择三级选项'))
                  },
                },
              ]}
            >
              <Cascader
                options={cascaderOptions}
                placeholder="请选择标注服务类型"
                allowClear
                expandTrigger="hover"
                displayRender={(labels) => labels.join(' / ')}
                className="w-full"
                showSearch={{
                  filter: (input, path) =>
                    path.some((opt) => String(opt.label).toLowerCase().includes(input.toLowerCase())),
                }}
              />
            </Form.Item>
          </Card>
        </Form>
      </section>
    </div>
  )
}

export default CreateMachineAnnotation
