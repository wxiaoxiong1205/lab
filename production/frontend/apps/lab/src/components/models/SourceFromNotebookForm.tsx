import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Cascader, Form, Select } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { notebookService } from '@/services/notebookService'
import { useNotebookFilePathCascader } from '@/hooks/notebook/useNotebookFilePathCascader'
import { useNotebookFolderPathCascader } from '@/hooks/notebook/useNotebookFolderPathCascader'
/**
 * Cascader 在 Form 里的原始值是各级 value 组成的数组；提交/调接口须取最后一项为完整路径，
 * 勿直接 String(数组)（会变成逗号拼接的多段路径）。
 */
export function notebookFolderPathFromCascaderValue(value: unknown): string {
  if (value == null)
    return ''
  if (typeof value === 'string')
    return value
  if (Array.isArray(value) && value.length)
    return String(value[value.length - 1])
  return ''
}
function parseNotebookId(raw: unknown): number | undefined {
  if (raw == null || raw === '')
    return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}
export function SourceFromNotebookForm({ canEditNotebook = true, selectFileType = 'folder', notbookType = '' }: {
  canEditNotebook?: boolean
  selectFileType?: 'folder' | 'file'
  notbookType?: string
}) {
  const { projectId } = useParams<{
    projectId: string
  }>()
  const form = Form.useFormInstance()
  const notebookIdRaw = Form.useWatch('notebook_id', form)
  const pid = projectId ? Number(projectId) : NaN
  const notebookId = parseNotebookId(notebookIdRaw)
  const isFolder = selectFileType === 'folder'
  const isFile = selectFileType === 'file'
  useEffect(() => {
    form.setFieldsValue({ notebook_path: undefined })
  }, [selectFileType, form])
  const folderCascader = useNotebookFolderPathCascader(pid, notebookId, form, isFolder)
  const fileCascader = useNotebookFilePathCascader(pid, notebookId, form, isFile)
  const { data: notebookList } = useQuery({
    queryKey: ['notebookList', projectId],
    queryFn: () => notebookService.getNotebookInstances({ page: 1, size: 100, biz_type: notbookType }, pid),
    enabled: Number.isFinite(pid),
    staleTime: 0,
    gcTime: 0,
  })
  return (
    <>
      <Form.Item name="notebook_id" label="Notebook" rules={[{ required: true, message: '请选择Notebook' }]}>
        <Select
          allowClear
          placeholder="请选择Notebook"
          className="w-[400px]"
          options={notebookList?.data?.items?.map((item: any) => ({
            label: item.instance_name,
            value: item.id,
          }))}
          disabled={!canEditNotebook}
        />
      </Form.Item>
      {selectFileType === 'folder' && (
        <Form.Item name="notebook_path" label="模型文件夹" rules={[{ required: true, message: '请选择模型所在文件夹' }]} tooltip="仅展示文件夹；可点击某一文件夹直接选中，或展开后继续选子文件夹">
          <Cascader className="w-[400px]" options={folderCascader.options} loadData={folderCascader.loadChildren} changeOnSelect loading={folderCascader.rootLoading} placeholder="请选择文件夹" />
        </Form.Item>
      )}
      {selectFileType === 'file' && (
        <Form.Item name="notebook_path" label="数据集文件" rules={[{ required: true, message: '请选择数据集文件' }]} tooltip="展示目录与文件；请展开目录后选择具体文件">
          <Cascader className="w-[400px]" options={fileCascader.options} loadData={fileCascader.loadChildren} changeOnSelect={false} loading={fileCascader.rootLoading} placeholder="请选择文件" />
        </Form.Item>
      )}
    </>
  )
}
