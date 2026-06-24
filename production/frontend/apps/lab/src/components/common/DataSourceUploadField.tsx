import React from 'react'
import { Button, Form, Radio, Space, message } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import type { RadioChangeEvent } from 'antd/es/radio'
import type { RcFile } from 'antd/es/upload'
import type { FormInstance } from 'antd'
import { SourceFromNotebookForm } from '../models/SourceFromNotebookForm'
import ChunkFileUploader, { type ChunkFileUploaderRef } from '@/components/common/ChunkFileUploader'
import { DATA_SOURCE_OPTIONS } from '@/services/machineLearnModel'

export type SampleDownloadFormat = 'jsonl' | 'zip'
const TEXT_FILE_MAX_SIZE_MB = 500
const IMAGE_FILE_MAX_SIZE_MB = 1024

export interface DataSourceUploadFieldProps {
  form?: FormInstance
  dataSourceFieldName?: string
  annotatedFieldName?: string
  showAnnotatedStatus?: boolean
  onAnnotatedChange?: (value: boolean) => void
  projectId?: string
  dataType: 'text' | 'image'
  isAnnotated?: boolean
  chunkUploadId: string | null
  onChunkUploadIdsChange: (ids: string | null) => void
  chunkUploaderRef: React.RefObject<ChunkFileUploaderRef | null>
  showDownloadSample?: boolean
  downloadSampleLoading?: boolean
  onDownloadSample?: (format: SampleDownloadFormat) => void | Promise<void>
  rules?: import('antd').FormItemProps['rules']
  notbookType?: string
}

const ANNOTATED_STATUS_OPTIONS = [
  { value: false, label: '无标注信息' },
  { value: true, label: '有标注信息' },
]

function getMaxFileSizeMB(dataType: 'text' | 'image'): number {
  return dataType === 'image' ? IMAGE_FILE_MAX_SIZE_MB : TEXT_FILE_MAX_SIZE_MB
}

function getMaxFileSizeLabel(dataType: 'text' | 'image'): string {
  return dataType === 'image' ? '1G' : '500M'
}

function isZipFile(file: RcFile): boolean {
  return file.name.endsWith('.zip')
    || file.type === 'application/zip'
    || file.type === 'application/x-zip-compressed'
}

function validateFileByDataType(
  dataType: 'text' | 'image',
  isAnnotated: boolean | undefined,
  file: RcFile,
): boolean {
  if (dataType === 'image') {
    if (!isZipFile(file)) return false
  }
  else {
    const isJsonlFile = /\.jsonl$/i.test(file.name)
    if (isAnnotated === false) {
      if (!isJsonlFile) return false
    }
    else if (!isZipFile(file) && !isJsonlFile) {
      return false
    }
  }
  const maxFileSizeMB = getMaxFileSizeMB(dataType)
  if (file.size / 1024 / 1024 > maxFileSizeMB) {
    message.error(`文件大小不能超过 ${getMaxFileSizeLabel(dataType)}!`)
    return false
  }
  return true
}

/**
 * 数据来源（本地上传 / Notebook 获取）+ 本地上传时的文件上传区域，供创建数据集、新增版本等复用。
 * 需在 Form 内使用，或传入 form 实例。
 */
const DataSourceUploadField: React.FC<DataSourceUploadFieldProps> = ({
  form: formProp,
  dataSourceFieldName = 'dataSource',
  annotatedFieldName = 'is_annotated',
  showAnnotatedStatus = true,
  onAnnotatedChange,
  projectId,
  dataType,
  isAnnotated,
  onChunkUploadIdsChange,
  chunkUploaderRef,
  showDownloadSample = false,
  downloadSampleLoading = false,
  notbookType = '',
  onDownloadSample,
  rules = [{ required: true, message: '请选择数据来源' }],
}) => {
  const formContext = Form.useFormInstance()
  const form = formProp ?? formContext
  const dataSource = Form.useWatch(dataSourceFieldName, form)
  const watchedIsAnnotated = Form.useWatch(annotatedFieldName, form)
  const effectiveIsAnnotated = watchedIsAnnotated ?? isAnnotated

  const inheritFromVersion = Form.useWatch('inheritFromVersion')

  const validateFile = React.useCallback(
    (file: RcFile) => validateFileByDataType(dataType, effectiveIsAnnotated, file),
    [dataType, effectiveIsAnnotated],
  )

  const accept = dataType === 'image'
    ? '.zip'
    : effectiveIsAnnotated === false
      ? '.jsonl'
      : '.zip,.jsonl'
  const maxFileSizeLabel = getMaxFileSizeLabel(dataType)

  const handleDataSourceChange = (value: string) => {
    if (value !== 'local_upload') {
      onChunkUploadIdsChange(null)
      chunkUploaderRef.current?.abort()
    }
  }

  if (!form) {
    return null
  }

  const handleAnnotatedRadioChange = (e: RadioChangeEvent) => {
    const v = e.target.value
    onAnnotatedChange?.(v as boolean)
  }

  return (
    <>
      {showAnnotatedStatus && (
        <Form.Item
          name={annotatedFieldName}
          label="数据标注状态"
          rules={[{ required: true, message: '请选择数据标注状态' }]}
          hidden={inheritFromVersion}
        >
          <Radio.Group
            options={ANNOTATED_STATUS_OPTIONS}
            onChange={handleAnnotatedRadioChange}
          />
        </Form.Item>
      )}
      <Form.Item name={dataSourceFieldName} label="数据来源" rules={rules} hidden={inheritFromVersion}>
        <Radio.Group
          options={DATA_SOURCE_OPTIONS}
          onChange={(e) => handleDataSourceChange(e.target.value)}
        />
      </Form.Item>

      {dataSource === 'local_upload' && projectId && (
        <Form.Item
          label="文件上传"
          required={!inheritFromVersion}
          tooltip="将合适文件拖到此处，或点击上传"
        >
          <ChunkFileUploader
            ref={chunkUploaderRef}
            accept={accept}
            maxCount={1}
            projectId={projectId}
            beforeUpload={validateFile}
            onUploadIdsChange={(ids) => onChunkUploadIdsChange(ids?.trim() || null)}
            hintText={(
              <>
                <p className="ant-upload-hint">将合适文件拖到此处，或点击上传</p>
                <p className="ant-upload-hint text-gray-500">
                  {dataType === 'image'
                    ? `支持 zip 压缩包。文件大小不能超过${maxFileSizeLabel}。`
                    : effectiveIsAnnotated === false
                      ? `支持 jsonl 文件。文件大小不能超过${maxFileSizeLabel}。`
                      : `支持 zip 压缩包；还可上传 jsonl。文件大小不能超过${maxFileSizeLabel}。`}
                </p>
              </>
            )}
          />
          {showDownloadSample && onDownloadSample && (
            <div className="mt-1">
              <Space size="middle" wrap>
                {dataType === 'text' ? (
                  <>
                    <Button
                      type="link"
                      size="small"
                      icon={<DownloadOutlined />}
                      className="pl-0"
                      loading={downloadSampleLoading}
                      onClick={() => onDownloadSample('jsonl')}
                    >
                      JSONL 格式示例
                    </Button>
                    {effectiveIsAnnotated !== false && (
                      <Button
                        type="link"
                        size="small"
                        icon={<DownloadOutlined />}
                        loading={downloadSampleLoading}
                        onClick={() => onDownloadSample('zip')}
                      >
                        ZIP 格式示例
                      </Button>
                    )}
                  </>
                ) : (
                  <Button
                    type="link"
                    size="small"
                    icon={<DownloadOutlined />}
                    className="pl-0"
                    loading={downloadSampleLoading}
                    onClick={() => onDownloadSample('zip')}
                  >
                    ZIP 格式示例
                  </Button>
                )}
              </Space>
            </div>
          )}
        </Form.Item>
      )}

      {dataSource === 'notebook' && (
        <SourceFromNotebookForm selectFileType="file" notbookType={notbookType} />
      )}
    </>
  )
}

export default DataSourceUploadField
