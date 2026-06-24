import React, { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  Form,
  Input,
  Radio,
  Typography,
  message,
} from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ChunkFileUploaderRef } from '@/components/common/ChunkFileUploader'
import CreateFormPageHeader from '@/components/common/CreateFormPageHeader'
import DataSourceUploadField from '@/components/common/DataSourceUploadField'
import { DescriptionTextArea } from '@/components/common/DescriptionTextArea.tsx'
import { notebookFolderPathFromCascaderValue } from '@/components/models/SourceFromNotebookForm'
import { machineDatamanagement } from '@/services/machineDatamanagement'
import type { CreateDatasetRequest } from '@/services/machineLearnModel'
import { downloadBlobFile, extractFilenameFromHeaders } from '@/utils/download'
import {
  ANNOTATION_TYPE_IMAGE,
  ANNOTATION_TYPE_TEXT,
  DATA_TYPE_OPTIONS,
  TEMPLATE_TYPE_IMAGE_CLASSIFICATION,
  TEMPLATE_TYPE_IMAGE_SEGMENTATION,
  TEMPLATE_TYPE_OBJECT_DETECTION,
  TEMPLATE_TYPE_TEXT_CLASSIFICATION,
  TEMPLATE_TYPE_TEXT_ENTITY_RECOGNITION,
} from '@/services/machineLearnModel'
import { notebookService } from '@/services/notebookService'

const DEFAULT_IS_ANNOTATED = false

const CreateMachineDataset: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
  const chunkUploaderRef = useRef<ChunkFileUploaderRef>(null)

  const [dataType, setDataType] = useState<'text' | 'image'>('text')
  const [annotationType, setAnnotationType] = useState<string>('text_classification')
  const [chunkUploadId, setChunkUploadId] = useState<string | null>(null)
  const [downloadSampleLoading, setDownloadSampleLoading] = useState(false)

  const projectIdNum = Number(projectId)

  const clearUploadedFile = () => {
    setChunkUploadId(null)
    chunkUploaderRef.current?.abort()
  }

  const createMutation = useMutation({
    mutationFn: (params: CreateDatasetRequest) =>
      machineDatamanagement.createMachineDataset(projectIdNum, params),
    onSuccess: () => {
      message.success('数据集创建成功')
      queryClient.invalidateQueries({ queryKey: ['machine-dataset-list'] })
      navigate(`/project/${projectId}/machine-data-management`)
    },
    onError: (err: any) => {
      console.error(err?.message || '创建失败')
      if (form.getFieldValue('data_source') === 'local_upload') {
        setChunkUploadId(null)
        chunkUploaderRef.current?.abort()
      }
    },
  })

  // 标注模板：文本-实体识别唯一为「文本实体识别」；文本-文本分类为当前选项；图像按标注类型对应
  const templateOptions
    = dataType === 'text'
      ? (annotationType === 'entity_recognition'
          ? TEMPLATE_TYPE_TEXT_ENTITY_RECOGNITION
          : TEMPLATE_TYPE_TEXT_CLASSIFICATION)
      : annotationType === 'image_classification'
        ? TEMPLATE_TYPE_IMAGE_CLASSIFICATION
        : annotationType === 'object_detection'
          ? TEMPLATE_TYPE_OBJECT_DETECTION
          : annotationType === 'image_segmentation'
            ? TEMPLATE_TYPE_IMAGE_SEGMENTATION
            : TEMPLATE_TYPE_IMAGE_CLASSIFICATION

  const handleDataTypeChange = (value: string) => {
    const v = value as 'text' | 'image'
    setDataType(v)
    const defaultAnnotation = v === 'image' ? 'image_classification' : 'text_classification'
    const defaultTemplate = v === 'image' ? 'image_classification_single_label' : 'text_classification_single_label'
    setAnnotationType(defaultAnnotation)
    form.setFieldValue('annotation_type', defaultAnnotation)
    form.setFieldValue('template_type', defaultTemplate)
    clearUploadedFile()
  }

  const handleAnnotationTypeChange = (e: any) => {
    const v = e.target.value
    setAnnotationType(v)
    const firstTemplate = v === 'image_classification'
      ? 'image_classification_single_label'
      : v === 'object_detection'
        ? 'object_detection_bbox'
        : v === 'image_segmentation'
          ? 'image_segmentation_instance'
          : dataType === 'text'
            ? (v === 'entity_recognition' || v === 'text_entity_recognition'
                ? 'entity_recognition'
                : 'text_classification_single_label')
            : undefined
    form.setFieldValue('template_type', firstTemplate)
    clearUploadedFile()
  }

  const handleTemplateTypeChange = () => {
    clearUploadedFile()
  }

  const handleAnnotatedChange = () => {
    clearUploadedFile()
  }

  const handleSubmit = () => {
    form.validateFields().then(async (values) => {
      const dataSource = form.getFieldValue('data_source')
      if (dataSource === 'local_upload' && !chunkUploadId) {
        message.error('请先上传文件')
        return
      }

      // 创建接口要求的 template_type 枚举值（后端校验用）
      const apiTemplateType = values.template_type
      if (!apiTemplateType) {
        message.error('请选择正确的标注模板（template_type）')
        return
      }
      const params: CreateDatasetRequest = {
        name: values.name?.trim(),
        version: 'V1',
        description: values.description?.trim() || undefined,
        data_type: dataType,
        annotation_type: values.annotation_type,
        template_type: apiTemplateType,
        is_annotated: values.is_annotated,
        inherit_from_version: false,
        data_source: dataSource === 'local_upload' ? 'local_upload' : 'notebook_fetch',
      }
      if (dataSource === 'local_upload' && chunkUploadId) {
        params.chunk_upload_ids = chunkUploadId.split(',').map((id) => id.trim()).filter(Boolean).join(',')
      }
      if (dataSource === 'notebook' && values.notebook_id) {
        params.notebook_id = values.notebook_id
        const notebook = await notebookService.getNotebookInstance(values.notebook_id, Number(projectId))
        params.notebook_name = notebook.instance_name
        params.notebook_path = `/${notebookFolderPathFromCascaderValue(values.notebook_path)}`
      }
      createMutation.mutate(params)
    }).catch(() => { })
  }

  const handleCancel = () => {
    navigate(`/project/${projectId}/machine-data-management`)
  }

  const handleDownloadSample = async (fileType: 'jsonl' | 'zip') => {
    const dataTypeVal = dataType
    const annotatedVal = form.getFieldValue('is_annotated')
    if (annotatedVal === undefined) {
      message.warning('请先选择数据标注状态')
      return
    }
    if (dataTypeVal === 'image' && fileType !== 'zip') {
      return
    }
    if (dataTypeVal === 'text' && annotatedVal === false && fileType !== 'jsonl') {
      return
    }
    const formTemplateType = form.getFieldValue('template_type')
    if (!formTemplateType) {
      message.warning('请先选择标注模板')
      return
    }
    const apiTemplateType = formTemplateType
    if (!apiTemplateType) {
      message.warning('当前标注模板暂无对应样例')
      return
    }
    setDownloadSampleLoading(true)
    try {
      const { blob, headers } = await machineDatamanagement.downloadSampleDataset(projectIdNum, {
        data_type: dataTypeVal,
        template_type: apiTemplateType,
        is_annotated: annotatedVal,
        file_type: fileType,
      })

      const filename = extractFilenameFromHeaders(headers)
      downloadBlobFile(blob, filename)
      message.success('下载成功')
    }
    catch (err: any) {
      message.error(err?.message || '下载失败')
    }
    finally {
      setDownloadSampleLoading(false)
    }
  }

  if (!projectId) {
    return (
      <div className="px-6 py-4">
        <Typography.Text type="danger">缺少项目 ID</Typography.Text>
      </div>
    )
  }

  return (
    <div className="create-form-page">
      <section className="create-form-card">
        <CreateFormPageHeader
          title="创建数据集"
          onBack={handleCancel}
          actions={(
            <>
              <Button className="create-form-cancel" onClick={handleCancel}>取消</Button>
              <Button className="create-form-submit" type="primary" onClick={() => form.submit()} loading={createMutation.isPending}>
                确定
              </Button>
            </>
          )}
        />
        <div className="create-form-divider" />

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          className="create-form-body max-w-[880px]"
          initialValues={{
            data_type: 'text',
            annotation_type: 'text_classification',
            template_type: 'text_classification_single_label',
            is_annotated: DEFAULT_IS_ANNOTATED,
            data_source: 'local_upload',
          }}
        >
          <Form.Item
            name="name"
            label="数据集名称"
            rules={[
              { required: true, message: '请输入数据集名称' },
              { min: 2, max: 64, message: '数据集名称长度为2-64个字符' },
              { pattern: /^(?!_|-)[\u4E00-\u9FA5a-zA-Z0-9._-]*$/, message: '数据集名称只支持中英文、数字、小数点、中划线(-)、下划线(_)，且不能以下划线和中划线开头，不允许空格和特殊符号' },
            ]}
          >
            <Input
              placeholder="请输入数据集名称"
              maxLength={64}
              showCount
            />
          </Form.Item>

          <Form.Item label="数据集版本">
            <span className="text-gray-600">V1</span>
          </Form.Item>

          <Form.Item name="description" label="描述">
            <DescriptionTextArea
              placeholder="请输入训练数据集描述"
              maxLength={1000}
              showCount
              rows={4}
            />
          </Form.Item>

          <Form.Item
            name="data_type"
            label="数据类型"
            rules={[{ required: true }]}
          >
            <Radio.Group options={DATA_TYPE_OPTIONS} onChange={(e) => handleDataTypeChange(e.target.value as 'text' | 'image')} />
          </Form.Item>

          <Form.Item
            name="annotation_type"
            label="标注类型"
            rules={[{ required: true, message: '请选择标注类型' }]}
          >
            <Radio.Group
              options={dataType === 'image' ? ANNOTATION_TYPE_IMAGE : ANNOTATION_TYPE_TEXT}
              onChange={handleAnnotationTypeChange}
            />
          </Form.Item>

          <Form.Item
            name="template_type"
            label="标注模板"
            rules={[{ required: true, message: '请选择标注模板' }]}
          >
            <Radio.Group options={templateOptions} onChange={handleTemplateTypeChange} />
          </Form.Item>

          <DataSourceUploadField
            form={form}
            dataSourceFieldName="data_source"
            projectId={projectId}
            dataType={dataType}
            onAnnotatedChange={handleAnnotatedChange}
            chunkUploadId={chunkUploadId}
            onChunkUploadIdsChange={setChunkUploadId}
            chunkUploaderRef={chunkUploaderRef}
            downloadSampleLoading={downloadSampleLoading}
            showDownloadSample
            onDownloadSample={handleDownloadSample}
            rules={[{ required: true }]}
            notbookType="machine_learning"
          />
        </Form>
      </section>
    </div>
  )
}

export default CreateMachineDataset
