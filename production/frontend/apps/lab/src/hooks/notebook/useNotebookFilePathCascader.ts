import type { FormInstance } from 'antd'
import { message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { notebookService } from '@/services/notebookService'
import type { FileStructure } from '@/types'

function childValue(f: FileStructure, parentPath: string | undefined, isRoot: boolean): string {
  return isRoot ? (f.path || f.name) : `${parentPath}/${f.name}`
}

function toFilePickerCascaderOptions(files: FileStructure[], parentPath?: string) {
  const isRoot = parentPath == null || parentPath === ''
  const dirs = files.filter((f) => f.type === 'directory')
  const onlyFiles = files.filter((f) => f.type === 'file')
  const ordered = [
    ...[...dirs].sort((a, b) => a.name.localeCompare(b.name)),
    ...[...onlyFiles].sort((a, b) => a.name.localeCompare(b.name)),
  ]
  return ordered.map((f) => {
    const isDir = f.type === 'directory'
    return {
      label: f.name,
      value: childValue(f, parentPath, isRoot),
      isLeaf: !isDir,
    }
  })
}

/** 无子项时展示不可选的「空目录」，value 以 __empty__ 开头以免触发继续加载 */
function filePickerOptionsWithEmptyHint(
  files: FileStructure[],
  emptyMarker: string,
  parentPath?: string,
) {
  const opts = toFilePickerCascaderOptions(files, parentPath)
  if (opts.length > 0)
    return opts
  return [
    {
      label: '空目录',
      value: `__empty__:${emptyMarker}`,
      disabled: true,
      isLeaf: true,
    },
  ]
}

export function useNotebookFilePathCascader(
  pid: number,
  notebookId: number | undefined,
  form: FormInstance,
  active: boolean,
) {
  const [options, setOptions] = useState<any[]>([])
  const [rootLoading, setRootLoading] = useState(false)

  useEffect(() => {
    if (!active) {
      setOptions([])
      return
    }
    if (!Number.isFinite(pid) || notebookId == null) {
      setOptions([])
      form.setFieldsValue({ notebook_path: undefined })
      return
    }
    let cancelled = false
    setRootLoading(true)
    ; (async () => {
      try {
        const res = await notebookService.getFileStructure({ projectId: pid, notebookId })
        if (cancelled)
          return
        setOptions(filePickerOptionsWithEmptyHint(res.files, '__root__'))
        form.setFieldsValue({ notebook_path: undefined })
      }
      catch {
        if (!cancelled) {
          message.error('加载 Notebook 文件列表失败')
          setOptions([])
        }
      }
      finally {
        if (!cancelled)
          setRootLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [active, pid, notebookId, form])

  const loadChildren = useCallback(
    async (selected: any[]) => {
      if (!active || !Number.isFinite(pid) || notebookId == null)
        return
      const node = selected[selected.length - 1]
      if (node.isLeaf || node.loading || (node.children && node.children.length > 0))
        return
      const dirPath = String(node.value)
      if (dirPath.startsWith('__empty__'))
        return
      try {
        node.loading = true
        setOptions((o) => [...o])
        const res = await notebookService.getFileStructure({
          projectId: pid,
          notebookId,
          path: dirPath,
        })
        node.children = filePickerOptionsWithEmptyHint(res.files, dirPath, dirPath)
        node.loading = false
        setOptions((o) => [...o])
      }
      catch (e) {
        console.error('加载子目录失败:', e)
        message.error('加载子目录失败')
        node.loading = false
        setOptions((o) => [...o])
      }
    },
    [active, pid, notebookId],
  )

  return { options, rootLoading, loadChildren }
}
