import type { CascaderProps } from 'antd'
import { Cascader, message } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { machineDatamanagement } from '@/services/machineDatamanagement'
import type { ItemList } from '@/services/machineLearnModel'
import {
  TASK_TYPE_MAP,
  TASK_TYPE_TO_TEMPLATE_TYPES,
  TEMPLATE_TYPE_MAP,
} from '@/services/machineLearnModel'
import type { MachineLearnListModel as NotebookMachineLearningDataset } from '@/types'
import '@/components/dataset/datasetCascader.css'

const PAGE_SIZE = 100
const MAX_SELECT_COUNT = 3
const ECHO_PATH_PREFIX = '__machine_learning_dataset_echo__'

/** export-formats 接口：按 template_type 取数组第二项作为创建 Notebook 的 format */
function formatFromExportFormats(
  dict: Record<string, string[]> | undefined,
  templateType: string,
): string {
  const arr = dict?.[templateType]
  return Array.isArray(arr) && arr.length > 1 ? String(arr[1]) : ''
}

function initialTaskTypeOptions(): NonNullable<CascaderProps['options']> {
  return Object.entries(TASK_TYPE_MAP).map(([value, label]) => ({
    value,
    label,
    isLeaf: false,
    disableCheckbox: true,
  }))
}

type MlOption = NonNullable<CascaderProps['options']>[number] & {
  datasetId?: number
  mlVersion?: ItemList
}

function splitFullPathName(fullPathName: string): string[] {
  const parts = fullPathName.split('/').filter(Boolean)
  const last = parts.at(-1)

  if (!last) return parts

  const splitIndex = last.lastIndexOf('_')
  if (splitIndex <= 0 || splitIndex >= last.length - 1) return parts

  return [...parts.slice(0, -1), last.slice(0, splitIndex), last.slice(splitIndex + 1)]
}

/**
 * 机器学习在线 Notebook — 数据集多选（级联）
 * L1 任务类型（task_type）→ L2 标注模板（template_type）→ L3 数据集（列表接口）→ L4 版本
 */
export default function MachineLearningDatasetMultiSelect({
  value,
  onChange,
  placeholder = '请选择数据集',
  echoNames = [],
}: {
  value?: NotebookMachineLearningDataset[]
  onChange?: (value: NotebookMachineLearningDataset[]) => void
  placeholder?: string
  echoNames?: string[]
}) {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const { data: exportFormats, isLoading: exportFormatsLoading } = useQuery({
    queryKey: ['machine-learning-dataset-export-formats'],
    queryFn: () => machineDatamanagement.getDatasetExportFormats(),
    staleTime: 60 * 60 * 1000,
  })

  const [options, setOptions] = useState<MlOption[]>(initialTaskTypeOptions() as MlOption[])

  /** 与 Form 中 { dataset_id, format }[] 同步的多选路径（仅叶子为具体版本） */
  const [paths, setPaths] = useState<(string | number)[][]>([])
  const userChangedRef = useRef(false)
  const echoValueRef = useRef<NotebookMachineLearningDataset[]>([])
  const echoNameRef = useRef<string[]>([])

  useEffect(() => {
    if (!value?.length) {
      userChangedRef.current = false
      setPaths([])
      return
    }

    if (userChangedRef.current)
      return

    echoValueRef.current = value
    echoNameRef.current = echoNames
    setPaths(value.map((item) => [ECHO_PATH_PREFIX, item.dataset_id]))
  }, [echoNames, value])

  const loadData: CascaderProps['loadData'] = async (selectedOptions) => {
    const targetOption = selectedOptions[selectedOptions.length - 1] as MlOption
    if (!projectId || Number.isNaN(pid)) return

    targetOption.loading = true
    setOptions((prev) => [...prev])

    try {
      if (selectedOptions.length === 1) {
        const taskType = String(targetOption.value)
        const templates = TASK_TYPE_TO_TEMPLATE_TYPES[taskType] ?? []
        targetOption.children = templates.map((tt) => ({
          value: tt,
          label: TEMPLATE_TYPE_MAP[tt] ?? tt,
          isLeaf: false,
          disableCheckbox: true,
        }))
      }
      else if (selectedOptions.length === 2) {
        const taskType = String((selectedOptions[0] as MlOption).value)
        const templateType = String(targetOption.value)
        const res = await machineDatamanagement.getMachineDatasetList(
          pid,
          1,
          PAGE_SIZE,
          taskType,
          undefined,
          templateType,
          true,
        )
        const items = res.items ?? []
        targetOption.children = items.map((it) => ({
          value: `ds-${it.id}`,
          label: it.name,
          isLeaf: false,
          disableCheckbox: true,
          datasetId: it.id,
        }))
      }
      else if (selectedOptions.length === 3) {
        const datasetId = targetOption.datasetId
        if (datasetId == null) return
        const versions = await machineDatamanagement.getDatasetVersion(pid, datasetId, true)
        const list = versions ?? []
        targetOption.children = list.map((v) => ({
          value: `ver-${v.id}`,
          label: v.version || v.name || String(v.id),
          isLeaf: true,
          mlVersion: v,
        }))
        const taskType = selectedOptions[0]?.value
        const templateType = selectedOptions[1]?.value
        const datasetValue = selectedOptions[2]?.value
        const versionIds = new Set(list.map((item) => item.id))
        setPaths((prev) => prev.map((path) => {
          const echoId = path[0] === ECHO_PATH_PREFIX ? Number(path[1]) : undefined
          return echoId != null && versionIds.has(echoId)
            ? [taskType, templateType, datasetValue, `ver-${echoId}`]
            : path
        }))
      }
    }
    catch (e) {
      console.error('机器学习数据集级联加载失败:', e)
    }
    finally {
      targetOption.loading = false
      setOptions((prev) => [...prev])
    }
  }

  const handleChange = (
    nextPaths: (string | number)[][],
    selectedOptions?: MlOption[][],
  ) => {
    const next: NotebookMachineLearningDataset[] = []
    const nextUniquePaths: (string | number)[][] = []
    const selectedDatasetIds = new Set<number>()
    let hasDuplicate = false

    ;(nextPaths ?? []).forEach((path, index) => {
      const pathOpts = selectedOptions?.[index]
      const leaf = pathOpts?.[pathOpts.length - 1]

      const echoId = path[0] === ECHO_PATH_PREFIX ? Number(path[1]) : undefined
      const echoItem = echoId != null
        ? echoValueRef.current.find((item) => item.dataset_id === echoId)
        : undefined
      const versionId = leaf?.mlVersion?.id ?? echoItem?.dataset_id
      const templateType = String(pathOpts?.[1]?.value ?? '')
      if (typeof versionId !== 'number') return null
      const item = echoItem && !templateType
        ? echoItem
        : {
            dataset_id: versionId,
            format: formatFromExportFormats(exportFormats, templateType),
          }

      if (selectedDatasetIds.has(item.dataset_id)) {
        hasDuplicate = true
        return
      }

      selectedDatasetIds.add(item.dataset_id)
      next.push(item)
      nextUniquePaths.push(path)
    })

    if (hasDuplicate) {
      message.warning('该数据集已选择')
    }

    if (next.length > MAX_SELECT_COUNT) {
      message.warning(`最多只能选择 ${MAX_SELECT_COUNT} 个数据集`)
      return
    }

    userChangedRef.current = true
    setPaths(nextUniquePaths)

    onChange?.(next)
  }

  const displayRender = (labels: string[], selectedOptions?: MlOption[]) => {
    if (labels[0] === ECHO_PATH_PREFIX) {
      const id = Number(labels[1])
      const index = echoValueRef.current.findIndex((item) => item.dataset_id === id)
      return splitFullPathName(echoNameRef.current[index] ?? String(id)).join(' / ')
    }

    const leaf = selectedOptions?.[selectedOptions.length - 1]
    const versionId = leaf?.mlVersion?.id
    const echoIndex = typeof versionId === 'number'
      ? echoValueRef.current.findIndex((item) => item.dataset_id === versionId)
      : -1
    if (echoIndex >= 0) {
      return splitFullPathName(echoNameRef.current[echoIndex] ?? String(versionId)).join(' / ')
    }

    return labels.join(' / ')
  }

  return (
    <Cascader
      multiple
      allowClear
      disabled={exportFormatsLoading}
      popupClassName="dataset-cascader-no-parent-checkbox"
      placeholder={exportFormatsLoading ? '加载导出格式中…' : placeholder}
      options={options}
      loadData={loadData}
      changeOnSelect={false}
      displayRender={displayRender}
      value={paths}
      onChange={handleChange}
    />
  )
}
