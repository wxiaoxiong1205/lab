import type { CascaderProps } from 'antd'
import { Cascader, message } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { mlModelService } from '@/services/mlModelService'
import type { MlModelSummary, MlModelVersion } from '@/types/mlModel'
import '@/components/models/modelsCascader.css'

const PAGE_SIZE = 100
const MAX_SELECT_COUNT = 3
type BaseOption = NonNullable<CascaderProps['options']>[number]

type MlModelOption = BaseOption & {
  children?: MlModelOption[]
  modelId?: number
  modelName?: string
  versionId?: number
  versionData?: MlModelVersion
}

function initialOptions(): MlModelOption[] {
  return [
    {
      value: 'model-management',
      label: '我的模型',
      isLeaf: false,
      disableCheckbox: true,
    },
  ]
}

function splitModelDisplayName(displayName: string) {
  const splitIndex = displayName.lastIndexOf('_')
  if (splitIndex <= 0 || splitIndex >= displayName.length - 1) {
    return {
      modelName: displayName,
      versionName: displayName,
    }
  }

  return {
    modelName: displayName.slice(0, splitIndex),
    versionName: displayName.slice(splitIndex + 1),
  }
}

function toModelOptions(items: MlModelSummary[], existingChildren: MlModelOption[] = []): MlModelOption[] {
  const existingMap = new Map(
    existingChildren.map((item) => [String(item.modelName ?? item.value), item]),
  )

  return items.map((item) => {
    const existing = existingMap.get(item.model_name)

    return {
      ...existing,
      value: item.model_name,
      label: item.model_name,
      isLeaf: false,
      disableCheckbox: true,
      modelId: item.id,
      modelName: item.model_name,
    }
  })
}

/**
 * 机器学习在线 Notebook — 模型多选（模型管理 / mlModelService.listByProject）
 */
export default function MachineLearningModelMultiSelect({
  value,
  onChange,
  placeholder = '请选择模型',
  echoNames = [],
}: {
  value?: number[]
  onChange?: (value: number[]) => void
  placeholder?: string
  echoNames?: string[]
}) {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const { data, isLoading } = useQuery({
    queryKey: ['ml-model-notebook-options', pid],
    queryFn: () => mlModelService.listByProject(pid, { page: 1, size: PAGE_SIZE, status: '已完成' }),
    enabled: !!projectId && !Number.isNaN(pid),
  })

  const [options, setOptions] = useState<MlModelOption[]>(initialOptions)
  const [paths, setPaths] = useState<(string | number)[][]>([])
  const selectedPathMapRef = useRef(new Map<number, (string | number)[]>())

  useEffect(() => {
    setOptions((prev) => {
      const root = prev[0] ?? initialOptions()[0]
      const existingChildren = Array.isArray(root.children) ? root.children : []

      return [
        {
          ...root,
          children: toModelOptions(data?.items ?? [], existingChildren),
        },
      ]
    })
  }, [data])

  useEffect(() => {
    if (!value?.length) {
      setPaths([])
      return
    }

    const nextPaths = value.map((id, index) => {
      const cachedPath = selectedPathMapRef.current.get(id)
      if (cachedPath) return cachedPath

      const { modelName } = splitModelDisplayName(echoNames[index] ?? String(id))
      return ['model-management', modelName, id]
    })

    setPaths(nextPaths)
  }, [echoNames, value])

  const loadData: CascaderProps['loadData'] = async (selectedOptions) => {
    if (!projectId || Number.isNaN(pid)) return
    if (selectedOptions.length !== 2) return

    const targetOption = selectedOptions[selectedOptions.length - 1] as MlModelOption
    if (!targetOption.modelName) return

    targetOption.loading = true
    setOptions((prev) => [...prev])

    try {
      const versions = await mlModelService.getVersions(pid, targetOption.modelName, '已完成')
      targetOption.children = versions.map((item) => ({
        value: item.id,
        label: item.model_version,
        isLeaf: true,
        versionId: item.id,
        versionData: item,
      }))
      const versionIds = new Set(versions.map((item) => item.id))
      setPaths((prev) => prev.map((path) => (
        path[1] === targetOption.modelName && versionIds.has(Number(path[2]))
          ? ['model-management', targetOption.modelName, Number(path[2])]
          : path
      )))
    }
    catch (error) {
      console.error('加载机器学习模型版本失败:', error)
    }
    finally {
      targetOption.loading = false
      setOptions((prev) => [...prev])
    }
  }

  const handleChange = (
    nextPaths: (string | number)[][],
    selectedOptions?: MlModelOption[][],
  ) => {
    const nextValue = (nextPaths ?? [])
      .map((path, index) => {
        const pathOptions = selectedOptions?.[index]
        const leaf = pathOptions?.[pathOptions.length - 1]
        const pathId = Number(path?.[2])
        return leaf?.versionId ?? (Number.isFinite(pathId) ? pathId : undefined)
      })
      .filter((id): id is number => typeof id === 'number')

    const selectedIds = new Set<number>()
    const uniqueValue: number[] = []
    const uniquePaths: (string | number)[][] = []
    let hasDuplicate = false

    nextValue.forEach((id, index) => {
      if (selectedIds.has(id)) {
        hasDuplicate = true
        return
      }

      selectedIds.add(id)
      uniqueValue.push(id)
      uniquePaths.push(nextPaths[index])
    })

    if (hasDuplicate) {
      message.warning('该模型已选择')
    }

    if (uniqueValue.length > MAX_SELECT_COUNT) {
      message.warning(`最多只能选择 ${MAX_SELECT_COUNT} 个模型`)
      return
    }

    const nextPathMap = new Map<number, (string | number)[]>()
    uniqueValue.forEach((id, index) => {
      const path = uniquePaths[index]
      if (Array.isArray(path)) {
        nextPathMap.set(id, path)
      }
    })
    selectedPathMapRef.current = nextPathMap

    setPaths(uniquePaths)
    onChange?.(uniqueValue)
  }

  const displayRender = (labels: string[]) => {
    if (labels.length >= 3) {
      const id = Number(labels[2])
      const index = value?.findIndex((item) => item === id) ?? -1
      if (index >= 0) {
        const { modelName, versionName } = splitModelDisplayName(echoNames[index] ?? String(id))
        return ['我的模型', modelName, versionName].join(' / ')
      }
    }

    return labels.join(' / ')
  }

  return (
    <Cascader
      multiple
      allowClear
      popupClassName="model-cascader-no-parent-checkbox"
      placeholder={isLoading ? '加载模型中...' : placeholder}
      options={options}
      loadData={loadData}
      changeOnSelect={false}
      displayRender={displayRender}
      value={paths}
      onChange={handleChange}
      disabled={!projectId || Number.isNaN(pid)}
    />
  )
}
