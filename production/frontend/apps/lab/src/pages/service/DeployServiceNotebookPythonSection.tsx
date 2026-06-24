import type { CascaderProps } from 'antd'
import { Button, Cascader, Form, Input, Radio, Space, Tooltip, Typography, message } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormInstance } from 'antd/es/form'
import type { RcFile } from 'antd/es/upload'
import { DownloadOutlined, FileOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import ChunkFileUploader, { type ChunkFileUploaderRef } from '@/components/common/ChunkFileUploader'
import apiClient from '@/services/apiClient'
import { notebookService } from '@/services/notebookService'
import type { DeplopServerDetailResponse } from '@/types/inference/deplop'
import { resolveDeployDetailMlHandle } from '@/types/inference/deplop'
import { downloadBlobFile, extractFilenameFromHeaders } from '@/utils/download'

/** Notebook 作为根节点不计入层级，最多再查询 4 层 file/dir（与 ModelForm 一致） */
const MAX_FILE_PATH_DEPTH = 4

type NotebookPathPick = { path: string, name: string, isDirectory: boolean }

type NotebookCascaderOption = NonNullable<CascaderProps['options']>[number] & {
  pick?: NotebookPathPick
}

/** 详情返回的下载路径（多为 /api/v1/...）转为相对 apiClient baseURL（…/api/v1）的路径 */
function apiPathToClientRelativePath(raw: string): string {
  const s = raw.trim()
  if (!s)
    return ''
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s)
      let pathname = u.pathname.replace(/^\//, '')
      if (pathname.startsWith('api/v1/'))
        pathname = pathname.slice('api/v1/'.length)
      return pathname
    }
    catch {
      return s
    }
  }
  let p = s.replace(/^\//, '')
  if (p.startsWith('api/v1/'))
    p = p.slice('api/v1/'.length)
  return p
}

function fileNameFromStoragePath(raw: string): string {
  try {
    const path = raw.split('?')[0] ?? ''
    const seg = path.replace(/\/+$/, '').split('/').pop() || ''
    return decodeURIComponent(seg) || 'model.py'
  }
  catch {
    return 'model.py'
  }
}

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

interface NotebookOption {
  label: string
  value: number
  instanceName: string
  image?: string | null
}

export interface DeployServiceNotebookPythonSectionProps {
  form: FormInstance
  projectId: string
  twice?: boolean
  readyDelopMsg?: DeplopServerDetailResponse
  onlineDebugLoading?: boolean
  onlineDebugDisabled?: boolean
  onOnlineDebug?: () => void
  mlDemoZipDownloading: boolean
  onDownloadMlDemoZip: () => void
  localPythonResetKey?: string
}

export function DeployServiceNotebookPythonSection(props: DeployServiceNotebookPythonSectionProps) {
  const {
    form,
    projectId,
    twice,
    readyDelopMsg,
    onlineDebugLoading,
    onlineDebugDisabled,
    onOnlineDebug,
    mlDemoZipDownloading,
    onDownloadMlDemoZip,
    localPythonResetKey,
  } = props

  const numericProjectId = Number(projectId)
  const sourceType = Form.useWatch('ml_python_source_type', form) ?? 'local'
  const mlHandleUploadIdWatch = Form.useWatch('ml_handle_upload_id', form)
  const mlNotebookIdWatch = Form.useWatch('ml_notebook_id', form)
  const mlNotebookSourceRefWatch = Form.useWatch('ml_notebook_source_ref', form)

  const redeployHandleUploadId = useMemo(() => {
    if (!twice || !readyDelopMsg)
      return ''
    const { uploadId } = resolveDeployDetailMlHandle(readyDelopMsg)
    return uploadId
  }, [twice, readyDelopMsg])

  const redeployHandleDownloadUrl = useMemo(() => {
    if (!twice || !readyDelopMsg)
      return ''
    const { downloadUrl } = resolveDeployDetailMlHandle(readyDelopMsg)
    return downloadUrl
  }, [twice, readyDelopMsg])

  const [hasNewLocalHandleUpload, setHasNewLocalHandleUpload] = useState(false)
  const hasNewLocalHandleUploadRef = useRef(false)
  const localUploaderRef = useRef<ChunkFileUploaderRef>(null)
  const hasTrackedUploadResetKeyRef = useRef(false)
  const prevUploadResetKeyRef = useRef<unknown>(undefined)
  const suppressUploadIdsFallbackRef = useRef(false)
  const setNewLocalUpload = (flag: boolean) => {
    hasNewLocalHandleUploadRef.current = flag
    setHasNewLocalHandleUpload(flag)
  }
  const [existingFileDownloading, setExistingFileDownloading] = useState(false)

  const redeployDetailIdKey = readyDelopMsg?.id != null ? String(readyDelopMsg.id) : ''
  useEffect(() => {
    setNewLocalUpload(false)
  }, [redeployDetailIdKey, twice])

  useEffect(() => {
    if (sourceType !== 'local')
      setNewLocalUpload(false)
  }, [sourceType])

  const [notebookPathValue, setNotebookPathValue] = useState<(string | number)[]>([])
  const [notebookCascaderOptions, setNotebookCascaderOptions] = useState<NotebookCascaderOption[]>([])

  const { data: notebookList } = useQuery({
    queryKey: ['deploy-service-notebook-options', numericProjectId],
    queryFn: async () => {
      const response = await notebookService.getNotebookInstances({ page: 1, size: 100, biz_type: 'machine_learning', is_ml_debug: true }, numericProjectId)
      return response.data.items
    },
    enabled: Number.isFinite(numericProjectId) && sourceType === 'notebook',
    staleTime: 0,
  })

  const notebookOptions: NotebookOption[] = useMemo(() => {
    if (!notebookList?.length)
      return []
    return notebookList.map((item) => ({
      label: item.instance_name,
      value: item.id,
      instanceName: item.instance_name,
      image: item.image,
    }))
  }, [notebookList])

  useEffect(() => {
    setNotebookCascaderOptions(
      notebookOptions.map((nb) => ({
        value: nb.value,
        label: nb.label,
        isLeaf: false,
      })),
    )
  }, [notebookOptions])

  useEffect(() => {
    setNotebookPathValue([])
  }, [numericProjectId])

  /** 详情 / 重新部署回显：与 ModelForm 一致，用 [notebookId, 完整 workspace 路径] 驱动级联展示 */
  useEffect(() => {
    if (sourceType !== 'notebook')
      return
    const rawId = mlNotebookIdWatch
    const ref = String(mlNotebookSourceRefWatch ?? '').trim()
    if (rawId == null || rawId === '' || !ref) {
      setNotebookPathValue([])
      return
    }
    const n = typeof rawId === 'number' ? rawId : Number(rawId)
    if (!Number.isFinite(n))
      return
    setNotebookPathValue([n, ref])
  }, [sourceType, mlNotebookIdWatch, mlNotebookSourceRefWatch])

  const loadNotebookPathData: CascaderProps['loadData'] = async (selectedOptions) => {
    const targetOption = selectedOptions[selectedOptions.length - 1] as NotebookCascaderOption
    targetOption.loading = true
    setNotebookCascaderOptions((prev) => [...prev])
    try {
      const notebookId = Number(selectedOptions[0].value)
      const listPathForApi
        = selectedOptions.length === 1 ? '/' : String(targetOption.value)
      const currentFileDepth = selectedOptions.length - 1
      const items = await notebookService.listNotebookWorkspaceFiles(
        numericProjectId,
        notebookId,
        listPathForApi,
      )
      if (items.length === 0) {
        if (selectedOptions.length === 1) {
          targetOption.disabled = true
          targetOption.isLeaf = false
          targetOption.children = []
          return
        }
        targetOption.isLeaf = true
        targetOption.disabled = false
        targetOption.children = undefined
        return
      }
      targetOption.children = items.map((item) => {
        const fullPath = resolveItemFullPath(listPathForApi, item)
        const childDepth = currentFileDepth + 1
        const isLeaf = !item.isDirectory || childDepth >= MAX_FILE_PATH_DEPTH
        const pick: NotebookPathPick = {
          path: fullPath,
          name: item.name,
          isDirectory: item.isDirectory,
        }
        return {
          value: fullPath,
          label: item.isDirectory ? `${item.name}/` : item.name,
          isLeaf,
          pick,
        } satisfies NotebookCascaderOption
      })
    }
    finally {
      targetOption.loading = false
      setNotebookCascaderOptions((prev) => [...prev])
    }
  }

  const handleNotebookPathChange: CascaderProps['onChange'] = (value, selectedOptions) => {
    if (value == null || value.length === 0) {
      setNotebookPathValue([])
      form.setFieldsValue({ ml_notebook_id: undefined, ml_notebook_source_ref: '' })
      return
    }
    if (value.length === 1) {
      setNotebookPathValue([])
      form.setFieldsValue({ ml_notebook_id: undefined, ml_notebook_source_ref: '' })
      return
    }
    const nid = Number(value[0])
    setNotebookPathValue(value)
    form.setFieldValue('ml_notebook_id', nid)
    if (selectedOptions && selectedOptions.length > 1) {
      const picks = selectedOptions
        .slice(1)
        .map((o) => (o as NotebookCascaderOption).pick)
        .filter(Boolean) as NotebookPathPick[]
      const lastPathFromPick = picks[picks.length - 1]?.path
      const lastPathFromValue
        = value.length > 1 ? String(value[value.length - 1]) : ''
      form.setFieldValue('ml_notebook_source_ref', lastPathFromPick ?? lastPathFromValue)
    }
    else {
      form.setFieldValue('ml_notebook_source_ref', '')
    }
  }

  const syncFieldsOnSourceTypeChange = useCallback((next: 'local' | 'notebook') => {
    form.setFields([{ name: 'ml_handle_upload_id', errors: [] }])
    if (next === 'local') {
      form.setFieldsValue({
        ml_notebook_id: undefined,
        ml_notebook_source_ref: '',
      })
      setNotebookPathValue([])
    }
    else {
      form.setFieldValue('ml_handle_upload_id', undefined)
    }
  }, [form])

  const prevMlPythonSourceRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (prevMlPythonSourceRef.current === undefined) {
      prevMlPythonSourceRef.current = sourceType
      return
    }
    if (prevMlPythonSourceRef.current !== sourceType) {
      syncFieldsOnSourceTypeChange(sourceType as 'local' | 'notebook')
      prevMlPythonSourceRef.current = sourceType
    }
  }, [sourceType, syncFieldsOnSourceTypeChange])

  useEffect(() => {
    if (!hasTrackedUploadResetKeyRef.current) {
      hasTrackedUploadResetKeyRef.current = true
      prevUploadResetKeyRef.current = localPythonResetKey
      return
    }
    if (prevUploadResetKeyRef.current === localPythonResetKey)
      return
    prevUploadResetKeyRef.current = localPythonResetKey
    setNewLocalUpload(false)
    suppressUploadIdsFallbackRef.current = true
    localUploaderRef.current?.abort()
    form.setFieldsValue({ ml_handle_upload_id: '' })
    form.setFields([{ name: 'ml_handle_upload_id', errors: [] }])
  }, [form, localPythonResetKey])

  const showRedeployExistingLocalFile
    = !!twice
      && sourceType === 'local'
      && redeployHandleUploadId !== ''
      && String(mlHandleUploadIdWatch ?? '').trim() === redeployHandleUploadId
      && !hasNewLocalHandleUpload

  const existingFileDisplayName = fileNameFromStoragePath(
    redeployHandleDownloadUrl || '/model.py',
  )

  const handleDownloadRedeployExistingFile = async () => {
    if (!redeployHandleDownloadUrl) {
      message.warning('暂无文件下载地址')
      return
    }
    const rel = apiPathToClientRelativePath(redeployHandleDownloadUrl)
    if (!rel) {
      message.error('下载地址无效')
      return
    }
    try {
      setExistingFileDownloading(true)
      const res = await apiClient.get(rel, { responseType: 'blob' })
      const name
        = extractFilenameFromHeaders(res.headers, existingFileDisplayName) || existingFileDisplayName
      downloadBlobFile(res.data, name)
      message.success('已开始下载')
    }
    catch (e) {
      console.error(e)
      message.error('文件下载失败')
    }
    finally {
      setExistingFileDownloading(false)
    }
  }

  return (
    <>
      <Form.Item name="ml_python_source_type" initialValue="local" className="!mb-4">
        <Radio.Group>
          <Space size={24}>
            <Radio value="local">本地上传</Radio>
            <Radio value="notebook">
              <span className="inline-flex items-center gap-1">
                Notebook获取
                <Tooltip title="推理处理脚本须为 .py 文件">
                  <span className="inline-flex">
                    <QuestionCircleOutlined className="text-gray-400 cursor-help text-sm" aria-label="说明" />
                  </span>
                </Tooltip>
              </span>
            </Radio>
          </Space>
        </Radio.Group>
      </Form.Item>

      {sourceType === 'local' && (
        <Form.Item
          label={(
            <span className="inline-flex items-center gap-3 flex-wrap">
              <span>Python文件</span>
              <Button
                className="text-sm font-normal"
                type="link"
                loading={onlineDebugLoading}
                disabled={!!onlineDebugDisabled}
                onClick={onOnlineDebug}
              >
                在线开发
              </Button>
            </span>
          )}
          required
        >
          <Form.Item
            name="ml_handle_upload_id"
            noStyle
          >
            <Input type="hidden" />
          </Form.Item>
          {showRedeployExistingLocalFile && (
            <div
              className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#91caff] bg-[#e6f4ff] px-4 py-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <FileOutlined className="shrink-0 text-[#1677ff]" aria-hidden />
                <span className="shrink-0 text-sm text-gray-700">已部署文件</span>
                {redeployHandleDownloadUrl ? (
                  <Typography.Link
                    className="truncate text-sm"
                    disabled={existingFileDownloading}
                    onClick={() => void handleDownloadRedeployExistingFile()}
                  >
                    {existingFileDownloading ? '下载中…' : existingFileDisplayName}
                  </Typography.Link>
                ) : (
                  <span className="truncate text-sm text-gray-700">{existingFileDisplayName}</span>
                )}
              </div>
              <span className="shrink-0 text-xs text-gray-500">点击下方重新上传将使用新的文件</span>
            </div>
          )}
          <ChunkFileUploader
            ref={localUploaderRef}
            accept=".py"
            maxSize={100}
            maxCount={1}
            projectId={projectId}
            beforeUpload={(file: RcFile) => {
              const okPy = /\.py$/i.test(file.name)
              if (!okPy) {
                message.error('仅支持上传 model.py文件')
                return false
              }
              return true
            }}
            hintText={(
              <p className="ant-upload-hint">
                支持 model.py文件拖到此处，或
                <span className="text-[#1677ff]">点击上传</span>
              </p>
            )}
            onUploadIdsChange={(ids) => {
              const raw = ids?.trim() || ''
              const firstId = raw.split(',')[0]?.trim()
              if (firstId) {
                setNewLocalUpload(true)
                form.setFieldsValue({ ml_handle_upload_id: firstId })
                form.setFields([{ name: 'ml_handle_upload_id', errors: [] }])
              }
              else {
                if (suppressUploadIdsFallbackRef.current) {
                  suppressUploadIdsFallbackRef.current = false
                  form.setFieldsValue({ ml_handle_upload_id: '' })
                  return
                }
                if (!hasNewLocalHandleUploadRef.current) {
                  const fallback
                    = twice && redeployHandleUploadId !== '' ? redeployHandleUploadId : undefined
                  form.setFieldsValue({ ml_handle_upload_id: fallback })
                }
              }
            }}
            onSuccess={({ uploadId: uid }) => {
              const id = uid != null ? String(uid).trim() : ''
              if (id) {
                setNewLocalUpload(true)
                form.setFieldsValue({ ml_handle_upload_id: id })
                form.setFields([{ name: 'ml_handle_upload_id', errors: [] }])
              }
            }}
          />
          <Form.Item noStyle shouldUpdate>
            {() => (
              <Form.ErrorList errors={form.getFieldError('ml_handle_upload_id')} />
            )}
          </Form.Item>
          <Button
            type="link"
            size="small"
            icon={<DownloadOutlined />}
            className="pl-0 mt-1 h-auto p-0"
            loading={mlDemoZipDownloading}
            onClick={() => void onDownloadMlDemoZip()}
          >
            Python模板示例
          </Button>
        </Form.Item>
      )}

      {sourceType === 'notebook' && (
        <>
          {Number.isFinite(numericProjectId) && notebookCascaderOptions.length > 0 ? (
            <Form.Item label="" className="!mb-0">
              <Cascader
                className="w-full max-w-2xl"
                allowClear
                changeOnSelect
                // disabled={disabledByRedeploy}
                showSearch={{
                  filter: (inputValue, path) =>
                    path.some((option) =>
                      String(option.label ?? '')
                        .toLowerCase()
                        .includes(inputValue.toLowerCase()),
                    ),
                }}
                options={notebookCascaderOptions}
                loadData={loadNotebookPathData}
                placeholder="请选择 Notebook，再展开选择目录或文件"
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
          ) : Number.isFinite(numericProjectId) ? (
            <Form.Item label="">
              <Typography.Text type="secondary">暂无可用 Notebook，请先在项目中创建 Notebook 实例</Typography.Text>
            </Form.Item>
          ) : null}

          <Form.Item
            name="ml_notebook_id"
            hidden
            rules={[
              {
                validator: (_, v) => {
                  if (form.getFieldValue('ml_python_source_type') !== 'notebook')
                    return Promise.resolve()
                  if (v == null || v === '')
                    return Promise.reject(new Error('请选择 Notebook 与文件路径'))
                  return Promise.resolve()
                },
              },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="ml_notebook_source_ref"
            hidden
            rules={[
              {
                validator: (_, v) => {
                  if (form.getFieldValue('ml_python_source_type') !== 'notebook')
                    return Promise.resolve()
                  if (v == null || String(v).trim() === '')
                    return Promise.reject(new Error('请选择 Notebook 与文件路径'))
                  return Promise.resolve()
                },
              },
            ]}
          >
            <Input />
          </Form.Item>
        </>
      )}
    </>
  )
}
