import type { CascaderProps } from 'antd'
import {
  Button,
  Card,
  Cascader,
  Form,
  Input,
  Radio,
  Typography,
  message,
} from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { RadioChangeEvent } from 'antd/es/radio'
import type { RcFile } from 'antd/es/upload'
import ChunkFileUploader, { type ChunkFileUploaderRef } from '@/components/common/ChunkFileUploader'
import { notebookService } from '@/services/notebookService'
import {
  ANNOTATION_TYPE_IMAGE,
  ANNOTATION_TYPE_TEXT,
  DATA_SOURCE_OPTIONS,
  DATA_TYPE_OPTIONS,
  TEMPLATE_TYPE_IMAGE_CLASSIFICATION,
  TEMPLATE_TYPE_IMAGE_SEGMENTATION,
  TEMPLATE_TYPE_OBJECT_DETECTION,
  TEMPLATE_TYPE_TEXT_CLASSIFICATION,
  TEMPLATE_TYPE_TEXT_ENTITY_RECOGNITION,
} from '@/services/machineLearnModel'
import type { MlModelFormValues } from '@/types/mlModel'

const { TextArea } = Input

interface NotebookOption {
  label: string
  value: number
  instanceName: string
  image?: string | null
  bizType?: string
}

type NotebookPathPick = { path: string, name: string, isDirectory: boolean }

type NotebookCascaderOption = NonNullable<CascaderProps['options']>[number] & {
  pick?: NotebookPathPick
}

const MAX_FILE_MB = 100
const MODEL_FILE_EXT = '.pt'
const TOKENIZER_FILE_EXT = '.json'

function validateModelUploadFile(file: RcFile): boolean {
  const isPtFile = hasExpectedExtension(file.name, MODEL_FILE_EXT)
  if (!isPtFile) return false
  if (file.size > MAX_FILE_MB * 1024 * 1024) return false
  return true
}

function hasExpectedExtension(fileName: string, extension: string): boolean {
  return fileName.toLowerCase().endsWith(extension.toLowerCase())
}

function getFileExtension(fileName: string): string {
  const normalized = fileName.trim().toLowerCase()
  const dotIndex = normalized.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === normalized.length - 1) {
    return ''
  }
  return normalized.slice(dotIndex)
}

function createNotebookRootOptions(notebookOptions: NotebookOption[]): NotebookCascaderOption[] {
  return notebookOptions
    .filter((nb) => !nb.bizType || nb.bizType === 'machine_learning')
    .map((nb) => ({
      value: nb.value,
      label: nb.label,
      isLeaf: false,
    }))
}

/** 第一层列表用 `/`；子项与父 path 拼接为完整绝对路径（供下一层 list 与 sourceRef） */
function resolveItemFullPath(
  parentListPath: string,
  item: { path: string, name: string, isDirectory: boolean },
): string {
  const raw = item.path?.trim()
  if (raw && raw.startsWith('/')) {
    return raw.replace(/\/+$/, '') || '/'
  }
  const base = parentListPath === '/' ? '' : parentListPath.replace(/\/$/, '')
  const seg = (raw || item.name || '').replace(/^\/+/, '').replace(/\/$/, '')
  if (!seg) {
    return parentListPath === '/' ? '/' : parentListPath
  }
  const tail = base ? `${base}/${seg}` : seg
  return `/${tail.replace(/^\/+/, '')}`
}

interface ModelFormProps {
  initialValues?: Partial<MlModelFormValues>
  loading?: boolean
  mode: 'create' | 'version'
  onCancel: () => void
  onSubmit: (values: MlModelFormValues) => void
  notebookOptions: NotebookOption[]
  projectId: number
  title: string
  versionLabel: string
}

const ModelForm = ({
  initialValues,
  loading,
  mode,
  onCancel,
  onSubmit,
  notebookOptions,
  projectId,
  title,
  versionLabel,
}: ModelFormProps) => {
  const [form] = Form.useForm<MlModelFormValues>()
  const watchedModelType = Form.useWatch('model_type', form)
  const initialModelType = initialValues?.model_type === 'image'
    ? 'image'
    : initialValues?.model_type === 'text'
      ? 'text'
      : undefined
  const modelType = ((mode === 'version' ? initialModelType : undefined) ?? watchedModelType ?? 'text') as 'text' | 'image'
  const isTextModel = modelType === 'text'
  const annotationType = Form.useWatch('annotation_type', form) ?? 'text_classification'
  const isTextClassificationModel = modelType === 'text' && annotationType === 'text_classification'
  const sourceType = Form.useWatch('sourceType', form) ?? 'notebook'
  const [notebookPathValue, setNotebookPathValue] = useState<(string | number)[]>([])
  const [tokenizerPathValue, setTokenizerPathValue] = useState<(string | number)[]>([])
  const [chunkUploadId, setChunkUploadId] = useState<string | null>(null)
  const [tokenizerUploadId, setTokenizerUploadId] = useState<string | null>(null)
  const [localUploadFiles, setLocalUploadFiles] = useState<File[]>([])
  const chunkUploaderRef = useRef<ChunkFileUploaderRef>(null)

  const annotationTypeOptions = useMemo(
    () => (modelType === 'image' ? ANNOTATION_TYPE_IMAGE : ANNOTATION_TYPE_TEXT),
    [modelType],
  )

  /** 第三层选项：与创建数据集页 templateOptions 推导逻辑一致 */
  const taskTypeOptions = useMemo(() => {
    return modelType === 'text'
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
  }, [modelType, annotationType])

  const handleModelTypeChange = (value: string) => {
    const v = value as 'text' | 'image'
    const defaultAnnotation = v === 'image' ? 'image_classification' : 'text_classification'
    const defaultTaskType = v === 'image' ? 'image_classification_single_label' : 'text_classification_single_label'
    if (v !== 'text') {
      setTokenizerPathValue([])
      form.setFieldValue('tokenizer_source_ref', undefined)
    }
    if (sourceType === 'local_upload') {
      chunkUploaderRef.current?.abort()
      setChunkUploadId(null)
      setTokenizerUploadId(null)
      setLocalUploadFiles([])
      form.setFieldsValue({
        uploadId: undefined,
        tokenizerUploadId: undefined,
      })
    }
    form.setFieldValue('annotation_type', defaultAnnotation)
    form.setFieldValue('task_type', defaultTaskType)
  }

  const handleAnnotationTypeChange = (e: RadioChangeEvent) => {
    const v = String(e.target.value ?? '')
    const firstTaskType = v === 'image_classification'
      ? 'image_classification_single_label'
      : v === 'object_detection'
        ? 'object_detection_bbox'
        : v === 'image_segmentation'
          ? 'image_segmentation_instance'
          : modelType === 'text'
            ? (v === 'entity_recognition' || v === 'text_entity_recognition'
                ? 'entity_recognition'
                : 'text_classification_single_label')
            : undefined
    if (firstTaskType) {
      form.setFieldValue('task_type', firstTaskType)
    }
    if (sourceType === 'local_upload') {
      chunkUploaderRef.current?.abort()
      setChunkUploadId(null)
      setTokenizerUploadId(null)
      setLocalUploadFiles([])
      form.setFieldsValue({
        uploadId: undefined,
        tokenizerUploadId: undefined,
      })
    }
  }

  const [notebookCascaderOptions, setNotebookCascaderOptions] = useState<NotebookCascaderOption[]>(
    () => createNotebookRootOptions(notebookOptions),
  )
  const [tokenizerCascaderOptions, setTokenizerCascaderOptions] = useState<NotebookCascaderOption[]>(
    () => createNotebookRootOptions(notebookOptions),
  )

  const selectedModelNotebookId = notebookPathValue.length > 0
    ? Number(notebookPathValue[0])
    : undefined

  useEffect(() => {
    setNotebookCascaderOptions(createNotebookRootOptions(notebookOptions))
  }, [notebookOptions])

  useEffect(() => {
    setTokenizerCascaderOptions(
      createNotebookRootOptions(notebookOptions).map((option) => ({
        ...option,
        disabled: selectedModelNotebookId != null && option.value !== selectedModelNotebookId,
      })),
    )
  }, [notebookOptions, selectedModelNotebookId])

  const loadNotebookPathData = async (
    selectedOptions: NotebookCascaderOption[],
    extension: string,
    setOptions: Dispatch<SetStateAction<NotebookCascaderOption[]>>,
  ) => {
    const targetOption = selectedOptions[selectedOptions.length - 1] as NotebookCascaderOption
    targetOption.loading = true
    setOptions((prev) => [...prev])
    try {
      const notebookId = Number(selectedOptions[0].value)
      const listPathForApi
        = selectedOptions.length === 1 ? '/' : String(targetOption.value)
      const items = await notebookService.listNotebookWorkspaceFiles(
        projectId,
        notebookId,
        listPathForApi,
      )
      if (items.length === 0) {
        // Notebook 根层（notelist）如果没有任何 file，标记为不可选
        if (selectedOptions.length === 1) {
          targetOption.disabled = true
          targetOption.isLeaf = false
          targetOption.children = []
          return
        }
        // 文件层返回空列表表示已到最后一层：将当前节点收敛为可选叶子节点
        const targetName = String(targetOption.pick?.name ?? targetOption.label ?? '')
        const isExpectedLeaf = !targetOption.pick?.isDirectory && hasExpectedExtension(targetName, extension)
        targetOption.isLeaf = true
        targetOption.disabled = !isExpectedLeaf
        targetOption.children = undefined
        return
      }
      targetOption.children = items.map((item) => {
        const fullPath = resolveItemFullPath(listPathForApi, item)
        const isLeaf = !item.isDirectory
        const pick: NotebookPathPick = {
          path: fullPath,
          name: item.name,
          isDirectory: item.isDirectory,
        }
        const isExpectedFile = !item.isDirectory && hasExpectedExtension(item.name, extension)
        return {
          value: fullPath,
          label: item.isDirectory ? `${item.name}/` : item.name,
          isLeaf,
          pick,
          disabled: isLeaf ? item.isDirectory || !isExpectedFile : false,
        } satisfies NotebookCascaderOption
      })
    }
    finally {
      targetOption.loading = false
      setOptions((prev) => [...prev])
    }
  }

  const handleLoadModelNotebookPathData: CascaderProps['loadData'] = async (selectedOptions) => {
    await loadNotebookPathData(
      selectedOptions as NotebookCascaderOption[],
      MODEL_FILE_EXT,
      setNotebookCascaderOptions,
    )
  }

  const handleLoadTokenizerPathData: CascaderProps['loadData'] = async (selectedOptions) => {
    await loadNotebookPathData(
      selectedOptions as NotebookCascaderOption[],
      TOKENIZER_FILE_EXT,
      setTokenizerCascaderOptions,
    )
  }

  const resetNotebookSelection = () => {
    setNotebookPathValue([])
    setTokenizerPathValue([])
    form.setFieldsValue({
      notebookId: undefined,
      sourceRef: undefined,
      tokenizer_source_ref: undefined,
    })
  }

  const resetLocalUploadState = () => {
    chunkUploaderRef.current?.abort()
    setChunkUploadId(null)
    setTokenizerUploadId(null)
    setLocalUploadFiles([])
    form.setFieldsValue({
      uploadId: undefined,
      tokenizerUploadId: undefined,
    })
  }

  useEffect(() => {
    const nextValues: Partial<MlModelFormValues> = {
      sourceType: 'notebook',
      ...(mode === 'create'
        ? {
            model_type: 'text',
            annotation_type: 'text_classification',
            task_type: 'text_classification_single_label',
          }
        : {}),
      ...initialValues,
    }

    form.setFieldsValue(nextValues)

    if (mode === 'version' && initialValues?.notebookId && initialValues?.sourceRef) {
      setNotebookPathValue([initialValues.notebookId, initialValues.sourceRef])
    }
    else {
      setNotebookPathValue([])
    }

    if (mode === 'version' && initialValues?.notebookId && initialValues?.tokenizer_source_ref) {
      setTokenizerPathValue([initialValues.notebookId, initialValues.tokenizer_source_ref])
    }
    else {
      setTokenizerPathValue([])
    }

    setChunkUploadId(null)
    setTokenizerUploadId(null)
    setLocalUploadFiles([])
  }, [form, initialValues, mode])

  useEffect(() => {
    setNotebookPathValue([])
    setTokenizerPathValue([])
    setChunkUploadId(null)
    setTokenizerUploadId(null)
    setLocalUploadFiles([])
    form.setFieldsValue({
      notebookId: undefined,
      sourceRef: undefined,
      tokenizer_source_ref: undefined,
      uploadId: undefined,
      tokenizerUploadId: undefined,
    })
    chunkUploaderRef.current?.abort()
  }, [projectId])

  const validateLocalUploadFile = (file: RcFile): boolean => {
    if (isTextClassificationModel) {
      const extension = getFileExtension(file.name)
      if (![MODEL_FILE_EXT, TOKENIZER_FILE_EXT].includes(extension)) {
        message.error(`仅支持上传 ${MODEL_FILE_EXT} 权重文件和 ${TOKENIZER_FILE_EXT} 分词器文件`)
        return false
      }
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        message.error(`文件 ${file.name} 大小不能超过 ${MAX_FILE_MB}MB!`)
        return false
      }
      const existingExtensions = new Set(localUploadFiles.map((item) => getFileExtension(item.name)))
      if (existingExtensions.has(extension)) {
        message.error(`同一后缀文件只能上传一个，${extension} 文件已存在`)
        return false
      }
      return true
    }

    return validateModelUploadFile(file)
  }

  const handleLocalUploadFilesChange = (files: File[]) => {
    setLocalUploadFiles(files)
    form.setFields([
      { name: 'uploadId', errors: [] },
      { name: 'tokenizerUploadId', errors: [] },
    ])
    if (!isTextClassificationModel) {
      return
    }
    const extensions = files.map((file) => getFileExtension(file.name))
    if (!extensions.includes(MODEL_FILE_EXT)) {
      setChunkUploadId(null)
      form.setFieldValue('uploadId', undefined)
    }
    if (!extensions.includes(TOKENIZER_FILE_EXT)) {
      setTokenizerUploadId(null)
      form.setFieldValue('tokenizerUploadId', undefined)
    }
  }

  const handleLocalUploadSuccess = ({ uploadId, file }: { uploadId?: string, file?: File }) => {
    if (!uploadId || !file) {
      return
    }
    form.setFields([
      { name: 'uploadId', errors: [] },
      { name: 'tokenizerUploadId', errors: [] },
    ])
    const extension = getFileExtension(file.name)
    if (extension === MODEL_FILE_EXT) {
      setChunkUploadId(uploadId)
      form.setFieldValue('uploadId', uploadId)
      return
    }
    if (extension === TOKENIZER_FILE_EXT) {
      setTokenizerUploadId(uploadId)
      form.setFieldValue('tokenizerUploadId', uploadId)
    }
  }

  const handleNotebookPathChange: CascaderProps['onChange'] = (value, selectedOptions) => {
    if (value == null || value.length === 0) {
      setNotebookPathValue([])
      setTokenizerPathValue([])
      form.setFieldsValue({ notebookId: undefined, sourceRef: '', tokenizer_source_ref: '' })
      void form.validateFields(['notebookId', 'sourceRef', 'tokenizer_source_ref'])
      return
    }
    const nid = Number(value[0])
    if (Number(notebookPathValue[0]) !== nid) {
      setTokenizerPathValue([])
      form.setFieldValue('tokenizer_source_ref', '')
    }
    setNotebookPathValue(value)
    form.setFieldValue('notebookId', nid)
    if (selectedOptions && selectedOptions.length > 1) {
      const picks = selectedOptions
        .slice(1)
        .map((o) => (o as NotebookCascaderOption).pick)
        .filter(Boolean) as NotebookPathPick[]
      const lastPathFromPick = picks[picks.length - 1]?.path
      const lastPathFromValue
        = value.length > 1 ? String(value[value.length - 1]) : ''
      form.setFieldValue('sourceRef', lastPathFromPick ?? lastPathFromValue)
    }
    else {
      form.setFieldValue('sourceRef', '')
    }
    void form.validateFields(['notebookId', 'sourceRef', 'tokenizer_source_ref'])
  }

  const handleTokenizerPathChange: CascaderProps['onChange'] = (value, selectedOptions) => {
    if (value == null || value.length === 0) {
      setTokenizerPathValue([])
      form.setFieldValue('tokenizer_source_ref', '')
      void form.validateFields(['tokenizer_source_ref'])
      return
    }
    setTokenizerPathValue(value)
    if (selectedOptions && selectedOptions.length > 1) {
      const picks = selectedOptions
        .slice(1)
        .map((o) => (o as NotebookCascaderOption).pick)
        .filter(Boolean) as NotebookPathPick[]
      const lastPathFromPick = picks[picks.length - 1]?.path
      const lastPathFromValue
        = value.length > 1 ? String(value[value.length - 1]) : ''
      form.setFieldValue('tokenizer_source_ref', lastPathFromPick ?? lastPathFromValue)
    }
    else {
      form.setFieldValue('tokenizer_source_ref', '')
    }
    void form.validateFields(['tokenizer_source_ref'])
  }

  const handleFinish = async (values: MlModelFormValues) => {
    if (values.sourceType === 'local_upload') {
      const uploadId = chunkUploadId?.trim()
      const currentTokenizerUploadId = tokenizerUploadId?.trim()
      if (!uploadId) {
        form.setFields([{ name: 'uploadId', errors: [isTextClassificationModel ? '请上传权重文件' : '请上传文件'] }])
        return
      }
      if (isTextClassificationModel && !currentTokenizerUploadId) {
        form.setFields([{ name: 'tokenizerUploadId', errors: ['请上传分词器文件'] }])
        return
      }

      onSubmit({
        ...values,
        notebookId: undefined,
        sourceRef: undefined,
        tokenizer_source_ref: undefined,
        uploadId,
        tokenizerUploadId: isTextClassificationModel ? currentTokenizerUploadId : undefined,
      })
      return
    }

    onSubmit({
      ...values,
      tokenizer_source_ref: isTextModel ? values.tokenizer_source_ref : undefined,
      tokenizerUploadId: undefined,
      uploadId: undefined,
    })
  }

  const handleSourceTypeChange = (value: string) => {
    if (value === 'local_upload') {
      resetNotebookSelection()
      return
    }
    resetLocalUploadState()
  }

  return (
    <div className="h-full">
      {title && (
        <Typography.Title level={4} className="!mb-4">
          {title}
        </Typography.Title>
      )}
      <Form<MlModelFormValues>
        form={form}
        layout="vertical"
        initialValues={{
          ...(mode === 'create'
            ? {
                model_type: 'text',
                annotation_type: 'text_classification',
                task_type: 'text_classification_single_label',
              }
            : {}),
          sourceType: 'notebook',
          ...initialValues,
        }}
        onFinish={handleFinish}
      >
        <div>
          <Card className="my-6">
            <Typography.Title level={5}>基本信息</Typography.Title>
            {mode === 'create' && (
              <Form.Item
                label="模型名称"
                name="name"
                rules={[
                  { required: true, message: '请输入模型名称' },
                  {
                    validator: (_, value?: string) => {
                      if (!value) {
                        return Promise.resolve()
                      }
                      if (!/^[a-zA-Z0-9_.-]{1,96}$/.test(value)) {
                        return Promise.reject(new Error('仅支持字母、数字、连字符(-)、下划线(_)和点号(.)，最多96个字符'))
                      }
                      if (/--|\.\./.test(value)) {
                        return Promise.reject(new Error('不能包含连续的 -- 或 ..'))
                      }
                      if (/^[-.]|[-.]$/.test(value)) {
                        return Promise.reject(new Error('不能以 - 或 . 开头/结尾'))
                      }
                      return Promise.resolve()
                    },
                  },
                ]}
              >
                <Input placeholder="请输入模型名称" maxLength={96} showCount />
              </Form.Item>
            )}

            <Form.Item label="模型版本">
              <Typography.Text>{versionLabel}</Typography.Text>
            </Form.Item>

            <Form.Item
              label="模型描述"
              name="description"
              // rules={[{ required: true, message: '请输入模型描述' }]}
            >
              <TextArea placeholder="请输入模型描述，1000字符以内" rows={4} maxLength={1000} showCount />
            </Form.Item>
          </Card>

          <Card className="!my-6">
            <Typography.Title level={5}>模型配置</Typography.Title>
            {mode === 'create' && (
              <>
                <Form.Item
                  label="模型类型"
                  name="model_type"
                  rules={[{ required: true, message: '请选择模型类型' }]}
                >
                  <Radio.Group
                    options={DATA_TYPE_OPTIONS}
                    onChange={(e) => handleModelTypeChange(e.target.value)}
                  />
                </Form.Item>

                <Form.Item
                  label="标注类型"
                  name="annotation_type"
                  rules={[{ required: true, message: '请选择标注类型' }]}
                >
                  <Radio.Group
                    options={annotationTypeOptions}
                    onChange={handleAnnotationTypeChange}
                  />
                </Form.Item>

                <Form.Item
                  label="任务类型"
                  name="task_type"
                  rules={[{ required: true, message: '请选择任务类型' }]}
                >
                  <Radio.Group options={taskTypeOptions} />
                </Form.Item>
              </>
            )}

            <Form.Item
              name="sourceType"
              label="模型来源"
              rules={[{ required: true, message: '请选择模型来源' }]}
            >
              <Radio.Group
                options={DATA_SOURCE_OPTIONS}
                onChange={(e) => handleSourceTypeChange(e.target.value)}
              />
            </Form.Item>

            {sourceType === 'local_upload' && (
              <Form.Item shouldUpdate noStyle>
                {() => {
                  const uploadErrors = [
                    ...form.getFieldError('uploadId'),
                    ...(isTextClassificationModel ? form.getFieldError('tokenizerUploadId') : []),
                  ]
                  return (
                    <Form.Item
                      label="文件上传"
                      required
                      tooltip={isTextClassificationModel ? '请上传权重文件和分词器文件' : '将合适文件拖到此处，或点击上传'}
                      validateStatus={uploadErrors.length > 0 ? 'error' : undefined}
                      help={uploadErrors[0]}
                    >
                      <ChunkFileUploader
                        ref={chunkUploaderRef}
                        accept={isTextClassificationModel ? '.pt,.json' : '.pt'}
                        maxSize={MAX_FILE_MB}
                        maxCount={isTextClassificationModel ? 2 : 1}
                        projectId={String(projectId)}
                        beforeUpload={validateLocalUploadFile}
                        onFilesChange={handleLocalUploadFilesChange}
                        onSuccess={handleLocalUploadSuccess}
                        onUploadIdsChange={isTextClassificationModel
                          ? undefined
                          : (ids) => {
                              const nextId = ids?.trim() || null
                              setChunkUploadId(nextId)
                              if (nextId) {
                                form.setFields([{ name: 'uploadId', errors: [] }])
                              }
                              else {
                                void form.validateFields(['uploadId'])
                              }
                            }}
                        hintText={(
                          <>
                            {isTextClassificationModel
                              ? (
                                  <>
                                    <p className="ant-upload-hint">将合适的权重文件和分词器拖到此处，或点击上传</p>
                                    <p className="ant-upload-hint text-gray-500">
                                      权重文件支持
                                      {' '}
                                      {MODEL_FILE_EXT}
                                      {' '}
                                      格式，分词器文件支持
                                      {' '}
                                      {TOKENIZER_FILE_EXT}
                                      {' '}
                                      格式。单个文件最多 100MB。
                                    </p>
                                  </>
                                )
                              : (
                                  <p className="ant-upload-hint text-gray-500">
                                    支持
                                    {' '}
                                    {MODEL_FILE_EXT}
                                    {' '}
                                    文件。单个文件最多 100MB。
                                  </p>
                                )}
                          </>
                        )}
                      />
                    </Form.Item>
                  )
                }}
              </Form.Item>
            )}

            {sourceType === 'notebook' && Number.isFinite(projectId) && notebookCascaderOptions.length > 0 ? (
              <Form.Item shouldUpdate noStyle>
                {() => {
                  const notebookErrors = [
                    ...form.getFieldError('notebookId'),
                    ...form.getFieldError('sourceRef'),
                    ...(isTextModel ? form.getFieldError('tokenizer_source_ref') : []),
                  ]
                  return (
                    <>
                      <Form.Item
                        label="权重文件"
                        required
                        validateStatus={notebookErrors.length > 0 && form.getFieldError('sourceRef').length > 0 ? 'error' : undefined}
                        help={form.getFieldError('sourceRef')[0] ?? form.getFieldError('notebookId')[0]}
                      >
                        <Cascader
                          className="w-full"
                          allowClear
                          showSearch={{
                            filter: (inputValue, path) =>
                              path.some((option) =>
                                String(option.label ?? '')
                                  .toLowerCase()
                                  .includes(inputValue.toLowerCase()),
                              ),
                          }}
                          options={notebookCascaderOptions}
                          loadData={handleLoadModelNotebookPathData}
                          placeholder={`请选择 Notebook，再展开选择 ${MODEL_FILE_EXT} 文件`}
                          value={notebookPathValue}
                          onChange={handleNotebookPathChange}
                          displayRender={(labels) => {
                            const parts = labels.map((l) => (l == null ? '' : String(l))).filter(Boolean)
                            if (parts.length >= 2) {
                              return parts.join(' / ')
                            }
                            if (notebookPathValue.length >= 2) {
                              const nb = notebookOptions.find(
                                (n) => n.value === Number(notebookPathValue[0]),
                              )
                              const pathStr = String(notebookPathValue[notebookPathValue.length - 1])
                              const nbLabel = nb?.label ?? String(notebookPathValue[0])
                              return `${nbLabel} / ${pathStr}`
                            }
                            return parts.join(' / ')
                          }}
                        />
                      </Form.Item>

                      {isTextModel && (
                        <Form.Item
                          label="分词器"
                          required
                          validateStatus={form.getFieldError('tokenizer_source_ref').length > 0 ? 'error' : undefined}
                          help={form.getFieldError('tokenizer_source_ref')[0]}
                        >
                          <Cascader
                            className="w-full"
                            allowClear
                            disabled={selectedModelNotebookId == null}
                            showSearch={{
                              filter: (inputValue, path) =>
                                path.some((option) =>
                                  String(option.label ?? '')
                                    .toLowerCase()
                                    .includes(inputValue.toLowerCase()),
                                ),
                            }}
                            options={tokenizerCascaderOptions}
                            loadData={handleLoadTokenizerPathData}
                            placeholder={selectedModelNotebookId == null
                              ? '请先选择权重文件所在 Notebook'
                              : `请选择同一 Notebook 下的 ${TOKENIZER_FILE_EXT} 文件`}
                            value={tokenizerPathValue}
                            onChange={handleTokenizerPathChange}
                            displayRender={(labels) => {
                              const parts = labels.map((l) => (l == null ? '' : String(l))).filter(Boolean)
                              if (parts.length >= 2) {
                                return parts.join(' / ')
                              }
                              if (tokenizerPathValue.length >= 2) {
                                const nb = notebookOptions.find(
                                  (n) => n.value === Number(tokenizerPathValue[0]),
                                )
                                const pathStr = String(tokenizerPathValue[tokenizerPathValue.length - 1])
                                const nbLabel = nb?.label ?? String(tokenizerPathValue[0])
                                return `${nbLabel} / ${pathStr}`
                              }
                              return parts.join(' / ')
                            }}
                          />
                        </Form.Item>
                      )}
                    </>
                  )
                }}
              </Form.Item>
            ) : sourceType === 'notebook' && Number.isFinite(projectId) ? (
              <Form.Item label="Notebook 与文件路径">
                <Typography.Text type="secondary">暂无可用 Notebook，请先在项目中创建 Notebook 实例</Typography.Text>
              </Form.Item>
            ) : null}

            <Form.Item
              name="notebookId"
              hidden
              rules={[{
                validator: (_, value) => {
                  if (form.getFieldValue('sourceType') !== 'notebook' || value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('请选择 Notebook 文件路径'))
                },
              }]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              name="sourceRef"
              hidden
              rules={[{
                validator: (_, value) => {
                  if (form.getFieldValue('sourceType') !== 'notebook' || value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('来源路径缺失'))
                },
              }]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              name="uploadId"
              hidden
              rules={[{
                validator: (_, value) => {
                  if (form.getFieldValue('sourceType') !== 'local_upload') {
                    return Promise.resolve()
                  }
                  if (!value) {
                    return Promise.reject(new Error(isTextClassificationModel ? '请上传权重文件' : '请上传文件'))
                  }
                  return Promise.resolve()
                },
              }]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              name="tokenizerUploadId"
              hidden
              rules={[{
                validator: (_, value) => {
                  if (
                    form.getFieldValue('sourceType') !== 'local_upload'
                    || !isTextClassificationModel
                  ) {
                    return Promise.resolve()
                  }
                  if (value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('请上传分词器文件'))
                },
              }]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              name="tokenizer_source_ref"
              hidden
              rules={[{
                validator: (_, value) => {
                  if (
                    form.getFieldValue('sourceType') !== 'notebook'
                    || form.getFieldValue('model_type') !== 'text'
                    || value
                  ) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('请选择分词器文件路径'))
                },
              }]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              label="网络结构"
              name="networkStructure"
              // rules={[{ required: true, message: '请输入网络结构' }]}
            >
              <Input placeholder="请输入网络结构" />
            </Form.Item>
          </Card>
        </div>
      </Form>
      <div className="flex justify-start gap-3 bg-white py-4">
        <Button className="create-form-cancel !mt-0" onClick={onCancel}>取消</Button>
        <Button className="create-form-submit !mt-0" type="primary" loading={loading} onClick={() => form.submit()}>
          确定
        </Button>
      </div>
    </div>
  )
}

export default ModelForm
