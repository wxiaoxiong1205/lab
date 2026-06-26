import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Form, Input, Modal, Select, Switch, message } from 'antd'
import type { ChunkFileUploaderRef } from '@/components/common/ChunkFileUploader'
import DataSourceUploadField from '@/components/common/DataSourceUploadField'
import { DescriptionTextArea } from '@/components/common/DescriptionTextArea.tsx'
import { machineDatamanagement } from '@/services/machineDatamanagement'
import type { ItemList } from '@/services/machineLearnModel'
import { notebookService } from '@/services/notebookService'
import { notebookFolderPathFromCascaderValue } from '@/components/models/SourceFromNotebookForm'
import { downloadBlobFile, extractFilenameFromHeaders } from '@/utils/download'

const DESC_MAX_LENGTH = 200

export interface AddVersionFormValues {
  description?: string
  inheritFromVersion: boolean
  sourceVersionId?: number
  dataSource?: 'local_upload' | 'notebook'
  chunkUploadIds?: string
  is_annotated: boolean

  notebook_id?: number
  notebook_name?: string
  notebook_path?: string
}

export interface AddVersionModalProps {
  open: boolean
  confirmLoading?: boolean
  projectId?: string
  /** 数据类型，不继承版本且本地上传时用于文件校验与 accept */
  dataType?: 'text' | 'image'
  datasetVersion: string
  dataTypeLabel: string
  taskTypeLabel: string
  templateTypeLabel: string
  /** 标注模板原始值（如 short_text_single_label），用于下载样例接口 */
  templateType?: string
  historyVersions: ItemList[]
  onCancel: () => void
  onConfirm: (values: AddVersionFormValues) => void | Promise<void>
}

const AddVersionModal: React.FC<AddVersionModalProps> = ({
  open,
  confirmLoading = false,
  projectId,
  dataType = 'text',
  datasetVersion,
  dataTypeLabel,
  taskTypeLabel,
  templateTypeLabel,
  templateType,
  historyVersions,
  onCancel,
  onConfirm,
}) => {
  const [form] = Form.useForm<AddVersionFormValues>()
  const chunkUploaderRef = useRef<ChunkFileUploaderRef>(null)
  const [chunkUploadId, setChunkUploadId] = useState<string | null>(null)
  const [downloadSampleLoading, setDownloadSampleLoading] = useState(false)

  const clearUploadedFile = useCallback(() => {
    setChunkUploadId(null)
    chunkUploaderRef.current?.abort()
  }, [])

  useEffect(() => {
    if (open) {
      form.resetFields()
      form.setFieldsValue({
        inheritFromVersion: true,
        description: undefined,
        sourceVersionId: undefined,
        dataSource: 'local_upload',
        is_annotated: false,
      })
      clearUploadedFile()
    }
  }, [open, form, clearUploadedFile])

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      const inheritFromVersion = values.inheritFromVersion ?? true
      const dataSource = values.dataSource ?? 'local_upload'
      if (!inheritFromVersion && dataSource === 'local_upload' && !chunkUploadId) {
        form.setFields([{ name: 'dataSource', errors: ['请上传文件'] }])
        return
      }
      const params: AddVersionFormValues = {
        description: values.description?.trim(),
        inheritFromVersion,
        sourceVersionId: inheritFromVersion ? values.sourceVersionId : undefined,
        dataSource: inheritFromVersion ? undefined : dataSource,
        // chunkUploadIds: !inheritFromVersion && dataSource === 'local_upload' ? chunkUploadId ?? undefined : undefined,
        is_annotated: values.is_annotated,
      }

      if (chunkUploadId) params.chunkUploadIds = chunkUploadId

      if (dataSource === 'notebook') {
        const notebook = await notebookService.getNotebookInstance(String(values.notebook_id), Number(projectId))
        params.notebook_id = values.notebook_id
        params.notebook_name = notebook?.instance_name
        params.notebook_path = `/${notebookFolderPathFromCascaderValue(values.notebook_path)}`
      }
      try {
        await onConfirm(params)
        onCancel()
      }
      catch {
        if (!inheritFromVersion && dataSource === 'local_upload') {
          clearUploadedFile()
        }
      }
    }
    catch (error) {
      // 校验失败不关闭
      console.error(error)
    }
  }

  const isPublishedVersion = (version: ItemList) => {
    if (version.is_published !== undefined && version.is_published !== null) {
      return version.is_published === true
    }
    return (version.publish_display || version.status_display) === '已发布'
  }
  const publishedHistoryVersions = historyVersions.filter(isPublishedVersion)

  const getSelectedSourceVersion = (sourceVersionId?: number) => {
    return publishedHistoryVersions.find((v) => v.id === sourceVersionId)
  }

  const handleSourceVersionChange = (sourceVersionId?: number) => {
    const sourceVersion = getSelectedSourceVersion(sourceVersionId)
    form.setFieldValue('is_annotated', sourceVersion?.is_annotated ?? false)
    clearUploadedFile()
  }

  const handleDownloadSample = async (fileType: 'jsonl' | 'zip') => {
    if (!projectId) return
    if (dataType === 'image' && fileType !== 'zip') {
      return
    }
    const values = form.getFieldsValue()
    const inheritFromVersion = values.inheritFromVersion ?? true
    let isAnnotated = values.is_annotated
    if (inheritFromVersion) {
      if (values.sourceVersionId == null) {
        form.setFields([{ name: 'sourceVersionId', errors: ['请选择历史版本'] }])
        message.warning('请先选择历史版本')
        return
      }
      const sourceVersion = getSelectedSourceVersion(values.sourceVersionId)
      if (!sourceVersion) {
        form.setFields([{ name: 'sourceVersionId', errors: ['请选择有效的历史版本'] }])
        message.warning('请选择有效的历史版本')
        return
      }
      isAnnotated = sourceVersion.is_annotated
      form.setFieldValue('is_annotated', isAnnotated)
    }
    if (dataType === 'text' && isAnnotated === false && fileType !== 'jsonl') {
      return
    }
    const apiTemplateType = templateType || undefined
    if (!apiTemplateType) {
      message.warning('当前标注模板暂无对应样例')
      return
    }
    setDownloadSampleLoading(true)
    try {
      const { blob, headers } = await machineDatamanagement.downloadSampleDataset(Number(projectId), {
        data_type: dataType,
        template_type: apiTemplateType,
        file_type: fileType,
        is_annotated: isAnnotated,
      })
      const filename = extractFilenameFromHeaders(headers)
      downloadBlobFile(blob, filename)
      message.success('下载成功')
    }
    catch (err: unknown) {
      message.error((err as Error)?.message || '下载失败')
    }
    finally {
      setDownloadSampleLoading(false)
    }
  }

  const inheritFromVersion = Form.useWatch('inheritFromVersion', form)

  return (
    <Modal
      title="新增数据集版本"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="确定"
      cancelText="取消"
      confirmLoading={confirmLoading}
      maskClosable={false}
      destroyOnClose
      width={520}
    >
      <Form form={form} layout="vertical" className="mt-4" initialValues={{ inheritFromVersion: true, dataSource: 'local_upload' }}>
        <Form.Item label="数据集版本">
          <Input value={datasetVersion} disabled />
        </Form.Item>

        <Form.Item
          name="description"
          label="描述"
          rules={[{ max: DESC_MAX_LENGTH, message: `描述最多 ${DESC_MAX_LENGTH} 字` }]}
        >
          <DescriptionTextArea
            placeholder="请输入数据集描述"
            rows={3}
            maxLength={DESC_MAX_LENGTH}
            showCount
          />
        </Form.Item>

        <div className="mb-4">
          <div className="text-gray-700 text-sm space-y-1">
            <div>
              数据类型：
              {dataTypeLabel}
            </div>
            <div>
              标注类型：
              {taskTypeLabel}
            </div>
            <div>
              标注模板：
              {templateTypeLabel}
            </div>
          </div>
        </div>

        <Form.Item name="inheritFromVersion" label="继承历史版本:" valuePropName="checked">
          <Switch />
        </Form.Item>

        {inheritFromVersion && (
          <Form.Item
            name="sourceVersionId"
            label="历史版本:"
            rules={[{ required: true, message: '请选择已发布版本' }]}
          >
            <Select
              placeholder="请选择已发布版本"
              allowClear
              onChange={handleSourceVersionChange}
              options={publishedHistoryVersions.map((v) => ({
                value: v.id,
                label: `${v.version}（${v.is_annotated ? '有标注信息' : '无标注信息'}）`,
              }))}
            />
          </Form.Item>
        )}

        {/* {!inheritFromVersion && ( */}
        <DataSourceUploadField
          form={form}
          dataSourceFieldName="dataSource"
          projectId={projectId}
          dataType={dataType}
          showAnnotatedStatus
          chunkUploadId={chunkUploadId}
          onChunkUploadIdsChange={setChunkUploadId}
          chunkUploaderRef={chunkUploaderRef}
          showDownloadSample
          downloadSampleLoading={downloadSampleLoading}
          onDownloadSample={handleDownloadSample}
          notbookType="machine_learning"
        />
        {/* )} */}
      </Form>
    </Modal>
  )
}

export default AddVersionModal
