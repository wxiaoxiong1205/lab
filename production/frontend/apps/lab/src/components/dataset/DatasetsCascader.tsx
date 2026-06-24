import type { CascaderProps } from 'antd'
import { Cascader } from 'antd'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { trainingDatasetService } from '@/services/trainingApi'
import { useDatasetVersions } from '@/components/inference/hooks/useDatasetVersions'
import './datasetCascader.css'
import type { DatasetVersionItem, TrainingDatasetItem } from '@/types/training'

type UsageType = 'training' | 'validation' | 'test'

type BaseOption = NonNullable<CascaderProps['options']>[number]

interface DatasetOption<T, C = any> extends BaseOption {
  children?: DatasetOption<C>[]
  data?: T
}
type SelectOption = [DatasetOption<null, TrainingDatasetItem>, DatasetOption<TrainingDatasetItem, DatasetVersionItem>?, DatasetOption<DatasetVersionItem>?]

// 数据集返回数据格式
interface datasetChangeOptionsType {
  training: number[]
  validation: number[]
  test: number[]
}

export default function DatasetCascader({
  placeholder = '请选择数据集',
  multiple = false,
  onChange,
}: {
  placeholder?: string
  multiple?: boolean
  onChange?: (value: datasetChangeOptionsType | number | undefined, selectedOptions?: SelectOption | SelectOption[]) => void
}) {
  const projectId = useParams().projectId

  // 状态管理
  const [datasetCascaderOptions, setDatasetCascaderOptions] = useState<SelectOption[0][]>([
    {
      value: 'training',
      label: '训练集',
      isLeaf: false,
      disableCheckbox: true,
    },
    {
      value: 'validation',
      label: '验证集',
      isLeaf: false,
      disableCheckbox: true,
    },
    {
      value: 'test',
      label: '测试集',
      isLeaf: false,
      disableCheckbox: true,
    },
  ])

  // 使用 useDatasetVersions hook
  const { loadDatasetVersions } = useDatasetVersions(
    projectId,
    datasetCascaderOptions,
    setDatasetCascaderOptions,
  )

  // 动态加载数据
  const loadData = async (selectedOptions: SelectOption) => {
    // 第一层：加载数据集列表
    if (selectedOptions.length === 1) {
      const targetOption = selectedOptions[0]
      targetOption.loading = true
      try {
        const usage = targetOption.value as UsageType
        const response = await trainingDatasetService.get(Number(projectId), {
          page: 1,
          size: 100,
          usage,
        })

        targetOption.children = response?.items?.map((item) => ({
          value: item.dataset_name,
          label: item.dataset_name,
          isLeaf: false,
          disableCheckbox: true,
        })) || []
      }
      catch (error) {
        console.error('加载数据集失败:', error)
      }
      finally {
        targetOption.loading = false
        setDatasetCascaderOptions([...datasetCascaderOptions])
      }
    }
    // 第二层：加载版本列表（使用 hook）
    else if (selectedOptions.length === 2) {
      await loadDatasetVersions(selectedOptions)
    }
  }

  // 自定义显示完整路径
  const displayRender = (labels: string[]) => {
    return labels.join(' / ')
  }

  // 单选模式
  const handleChangeSingle = (
    value: string[],
    selectedOptions?: SelectOption,
  ) => {
    if (!value) return

    const versionOption = selectedOptions?.[2]
    const id = versionOption?.data?.id

    onChange?.(id)
  }
  // 多选模式
  const handleChangeMultiple = (
    value: string[][],
    selectedOptions?: SelectOption[],
  ) => {
    if (!value) return

    // 多选模式：按 usage 分组
    const groupedData = {
      training: [],
      validation: [],
      test: [],
    }

    value.forEach((item: string[], index: number) => {
      const optionArray = (selectedOptions as SelectOption[])?.[index]
      const usage = item[0]
      const datasetId = optionArray?.[optionArray.length - 1]?.versionData?.id

      if (datasetId && groupedData[usage]) {
        groupedData[usage].push(datasetId)
      }
    })

    onChange?.(groupedData)
  }

  return (
    <Cascader
      popupClassName="dataset-cascader-no-parent-checkbox"
      options={datasetCascaderOptions}
      placeholder={placeholder}
      loadData={loadData}
      changeOnSelect={false}
      maxTagCount="responsive"
      displayRender={displayRender}
      {...(multiple ? {
        multiple: true,
        onChange: handleChangeMultiple,
      } : {
        onChange: handleChangeSingle,
      })}
    />
  )
}
