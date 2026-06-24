import type { FormInstance } from 'antd'
import { message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { notebookService } from '@/services/notebookService'
import type { FileStructure } from '@/types'

function childValue(f: FileStructure, parentPath: string | undefined, isRoot: boolean): string {
  return isRoot ? (f.path || f.name) : `${parentPath}/${f.name}`
}

function toFolderCascaderOptions(files: FileStructure[], parentPath?: string) {
  const dirs = files.filter((f) => f.type === 'directory')
  const isRoot = parentPath == null || parentPath === ''
  return [...dirs]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((f) => ({
      label: f.name,
      value: childValue(f, parentPath, isRoot),
      isLeaf: false,
    }))
}

export function useNotebookFolderPathCascader(
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
        setOptions(toFolderCascaderOptions(res.files))
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
        const children = toFolderCascaderOptions(res.files, dirPath)
        if (children.length === 0) {
          node.isLeaf = true
          node.children = undefined
        }
        else {
          node.children = children
        }
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
