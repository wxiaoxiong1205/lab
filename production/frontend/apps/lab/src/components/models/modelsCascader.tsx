import type { CascaderProps } from 'antd'
import { Cascader, message } from 'antd'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ModelService } from '@/services/modelsApi'
import './modelsCascader.css'
import type { BaseModel, GetBaseModelsParams, ModelVersionListResponse } from '@/types/model'

type BaseOption = NonNullable<CascaderProps['options']>[number]

interface DatasetOption<T, C = any> extends BaseOption {
  children?: DatasetOption<C>[]
  data?: T
}
type SelectOption = [DatasetOption<null, BaseModel>, DatasetOption<BaseModel, ModelVersionListResponse>?, DatasetOption<ModelVersionListResponse>?]

interface MultipleModelOptionsType {
  base_models: number[]
  finetuned_models: number[]
}
interface SingleModelOptionsType {
  version?: string
  id: number
  name: string
  type: 'base' | 'trained'
}

interface ModelVersionsProps {
  /**
   * 选择器placeholder
   */
  placeholder?: string
  /**
   * 是否多选
   */
  multiple?: boolean
  /**
   * 多选时最多可选数量（不设置则不限制）
   */
  multipleMax?: number
  /**
   * 选择器样式
   */
  style?: CSSProperties
  /**
   * 选择器原子样式
   */
  className?: string
  /**
   * 基础模型筛选参数
   */
  filterBaseModelsParams?: GetBaseModelsParams
  /**
   * 训练模型筛选参数
   */
  filterTrainedModelsParams?: GetBaseModelsParams
  /**
   * 模型版本筛选参数
   */
  filterModelVersionsParams?: { status?: string }
  /**
   * 模型类型筛选
   */
  filterModelType?: string[]
  /**
   * 选择器值
   */
  value?: MultipleModelOptionsType | SingleModelOptionsType
  /**
   * 选择器变化回调
   */
  onChange?: (value: MultipleModelOptionsType | SingleModelOptionsType | undefined, selectedOptions?: SelectOption | SelectOption[]) => void
  /**
   * 多选编辑回显时，接口只把 ID 放在 value 中，名称放在详情的 model_names 中。
   * 这里单独接收名称用于 Cascader 输入框展示，提交仍使用 value 中的 ID。
   */
  echoNames?: {
    base_models?: string[]
    finetuned_models?: string[]
  }
}

function splitFinetunedModelDisplayName(displayName: string) {
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

function modelPathKey(path: Array<string | number | undefined>) {
  return path.map((item) => String(item ?? '')).join('\u0001')
}

function getRootOption(options: DatasetOption<any>[], rootValue: string) {
  return options.find((item) => item.value === rootValue)
}

function moveSelectedChildrenFirst<T extends DatasetOption<any>>(children: T[] = [], selectedValues: string[]) {
  const selectedSet = new Set(selectedValues)
  const selectedChildren: T[] = []
  const otherChildren: T[] = []

  children.forEach((child) => {
    if (selectedSet.has(String(child.value))) {
      selectedChildren.push(child)
    }
    else {
      otherChildren.push(child)
    }
  })

  selectedChildren.sort((a, b) => selectedValues.indexOf(String(a.value)) - selectedValues.indexOf(String(b.value)))

  return [...selectedChildren, ...otherChildren]
}

function mergeSelectedEchoOptions(
  options: DatasetOption<any>[],
  value?: MultipleModelOptionsType | SingleModelOptionsType,
  echoNames?: ModelVersionsProps['echoNames'],
) {
  if (!value || !('base_models' in value || 'finetuned_models' in value)) {
    return options
  }

  const multipleValue = value as MultipleModelOptionsType
  const nextOptions = options.map((item) => ({ ...item }))
  const baseRoot = getRootOption(nextOptions, 'base')
  const trainedRoot = getRootOption(nextOptions, 'trained')

  if (baseRoot) {
    const selectedBaseNames = (multipleValue.base_models ?? []).map((id, index) => echoNames?.base_models?.[index] ?? String(id))
    const baseChildren = [...(baseRoot.children ?? [])]
    selectedBaseNames.forEach((name, index) => {
      const id = multipleValue.base_models[index]
      const existing = baseChildren.find((child) => child.value === name)
      if (existing) {
        existing.modelData = existing.modelData ?? { id, name }
      }
      else {
        baseChildren.push({
          value: name,
          label: name,
          isLeaf: true,
          modelData: { id, name },
        } as DatasetOption<any>)
      }
    })
    baseRoot.children = moveSelectedChildrenFirst(baseChildren, selectedBaseNames)
  }

  if (trainedRoot) {
    const trainedChildren = [...(trainedRoot.children ?? [])]
    const selectedModelNames: string[] = []
    const selectedVersionNamesByModel = new Map<string, string[]>()

    ;(multipleValue.finetuned_models ?? []).forEach((id, index) => {
      const displayName = echoNames?.finetuned_models?.[index] ?? String(id)
      const { modelName, versionName } = splitFinetunedModelDisplayName(displayName)
      selectedModelNames.push(modelName)

      const versionNames = selectedVersionNamesByModel.get(modelName) ?? []
      versionNames.push(versionName)
      selectedVersionNamesByModel.set(modelName, versionNames)

      let modelOption = trainedChildren.find((child) => child.value === modelName)
      if (!modelOption) {
        modelOption = {
          value: modelName,
          label: modelName,
          isLeaf: false,
          disableCheckbox: true,
          children: [],
        } as DatasetOption<any>
        trainedChildren.push(modelOption)
      }

      const versionChildren = [...(modelOption.children ?? [])]
      const existingVersion = versionChildren.find((child) => child.value === versionName)
      if (existingVersion) {
        existingVersion.versionData = existingVersion.versionData ?? { id, name: modelName, model_version: versionName }
      }
      else {
        versionChildren.push({
          value: versionName,
          label: versionName,
          isLeaf: true,
          versionData: { id, name: modelName, model_version: versionName },
        } as DatasetOption<any>)
      }
      modelOption.children = moveSelectedChildrenFirst(versionChildren, selectedVersionNamesByModel.get(modelName) ?? [])
    })

    trainedRoot.children = moveSelectedChildrenFirst(trainedChildren, selectedModelNames)
  }

  return nextOptions
}

export default function ModelsCascader({
  placeholder = '请选择模型',
  multiple = false,
  multipleMax,
  style,
  className,

  filterBaseModelsParams,
  filterTrainedModelsParams,
  filterModelVersionsParams,
  filterModelType = ['base', 'trained'],

  value,
  onChange,
  echoNames,
}: ModelVersionsProps) {
  const projectId = useParams().projectId
  const [multipleSelectValue, setMultipleSelectValue] = useState<string[][]>([])
  const userChangedRef = useRef(false)

  useEffect(() => {
    if (multiple && !value) {
      userChangedRef.current = false
      setMultipleSelectValue([])
    }
  }, [multiple, value])

  useEffect(() => {
    if (!multiple || !value)
      return
    if (userChangedRef.current)
      return
    const multipleValue = value as MultipleModelOptionsType
    const nextValue: string[][] = []
    multipleValue.base_models?.forEach((id, index) => {
      const name = echoNames?.base_models?.[index] ?? String(id)
      nextValue.push(['base', name])
    })
    multipleValue.finetuned_models?.forEach((id, index) => {
      const displayName = echoNames?.finetuned_models?.[index] ?? String(id)
      const { modelName, versionName } = splitFinetunedModelDisplayName(displayName)
      nextValue.push(['trained', modelName, versionName])
    })
    setMultipleSelectValue(nextValue)
  }, [echoNames, multiple, value])

  const cascaderValue = useMemo(() => {
    if (!value) return undefined

    if (multiple) {
      return undefined
    }
    else {
      const singleValue = value as SingleModelOptionsType
      if (!singleValue?.type || !singleValue?.name) return undefined
      if (singleValue.type === 'base') {
        return [singleValue.type, singleValue.name]
      }
      else {
        return [singleValue.type, singleValue.name, singleValue.version]
      }
    }
  }, [value, multiple])

  const selectedIdFallbackMaps = useMemo(() => {
    const maps = {
      base: new Map<string, number>(),
      trained: new Map<string, number>(),
    }

    if (!multiple || !value) {
      return maps
    }

    const multipleValue = value as MultipleModelOptionsType
    multipleValue.base_models?.forEach((id, index) => {
      const name = echoNames?.base_models?.[index] ?? String(id)
      maps.base.set(modelPathKey(['base', name]), id)
    })
    multipleValue.finetuned_models?.forEach((id, index) => {
      const displayName = echoNames?.finetuned_models?.[index] ?? String(id)
      const { modelName, versionName } = splitFinetunedModelDisplayName(displayName)
      maps.trained.set(modelPathKey(['trained', modelName, versionName]), id)
    })

    return maps
  }, [echoNames, multiple, value])

  // 状态管理
  const [modelCascaderOptions, setModelCascaderOptions] = useState<DatasetOption<any>[]>([
    {
      value: 'base',
      label: '模型仓库',
      isLeaf: false,
      disableCheckbox: true,
    },
    {
      value: 'trained',
      label: '我的模型',
      isLeaf: false,
      disableCheckbox: true,
    },
  ].filter((item) => filterModelType.includes(item.value)))

  useEffect(() => {
    if (!multiple)
      return
    setModelCascaderOptions((prev) => mergeSelectedEchoOptions(prev, value, echoNames))
  }, [echoNames, multiple, value])

  // 动态加载数据
  const loadData = async (selectedOptions: SelectOption) => {
    const targetOption = selectedOptions[selectedOptions.length - 1]

    // 第一层：加载模型列表
    if (selectedOptions.length === 1) {
      const targetOption = selectedOptions[0]
      targetOption.loading = true
      try {
        const modelType = targetOption.value
        let response

        if (modelType === 'base') {
          // 加载基础模型
          response = await ModelService.getBaseModels(
            Object.assign({ page: 1, size: 100, is_available: true }, filterBaseModelsParams),
          )
        }
        else {
          // 加载训练模型
          const res = await ModelService.getBaseModelsByProjectId(
            Number(projectId), Object.assign({ page: 1, size: 100, status: '已完成', is_available: true }, filterTrainedModelsParams),
          )

          response = {
            items: res?.items?.map((item) => ({
              ...item,
              name: item.model_name,
            })),
          }
        }

        targetOption.children = response?.items?.map((model: BaseModel) => ({
          value: model.name,
          label: model.name,
          isLeaf: modelType === 'base', // 基础模型没有版本，是叶子节点
          disableCheckbox: modelType === 'trained', // 训练模型需要选择版本
          modelData: model,
        })) || []
      }
      catch (error) {
        console.error('加载模型列表失败:', error)
      }
      finally {
        targetOption.loading = false
        setModelCascaderOptions(mergeSelectedEchoOptions([...modelCascaderOptions], value, echoNames))
      }
    }
    // 第二层：加载模型版本（仅训练模型）
    else if (selectedOptions.length === 2) {
      const modelType = selectedOptions[0].value

      // 只有训练模型才需要加载版本
      if (modelType === 'trained') {
        targetOption.loading = true
        try {
          const modelName = targetOption.value as 'trained' | 'base'
          const versions = await ModelService.getModelVersions(
            Number(projectId),
            modelName,
            filterModelVersionsParams?.status || '已完成',
          )

          const versionList = Array.isArray(versions) ? versions : [versions]

          targetOption.children = versionList.map((version) => ({
            value: version.model_version,
            label: version.model_version,
            isLeaf: true,
            versionData: version,
          }))
        }
        catch (error) {
          console.error('加载模型版本失败:', error)
        }
        finally {
          targetOption.loading = false
          setModelCascaderOptions(mergeSelectedEchoOptions([...modelCascaderOptions], value, echoNames))
        }
      }
    }
  }

  // 自定义显示完整路径
  const displayRender = (labels: string[]) => {
    return labels.join(' / ')
  }

  // 多选模式
  const handleChangeMultiple = (value: string[][], selectedOptions?: SelectOption[]) => {
    if (multipleMax && value && value.length > multipleMax) {
      message.warning(`最多只能选择 ${multipleMax} 个模型`)
      return
    }
    userChangedRef.current = true
    setMultipleSelectValue(value || [])
    if (!value?.length) {
      onChange?.({
        base_models: [],
        finetuned_models: [],
      })
      return
    }

    const groupedData: MultipleModelOptionsType = {
      base_models: [],
      finetuned_models: [],
    }

    value.forEach((item: string[], index: number) => {
      const optionArray = selectedOptions?.[index]
      const modelType = item[0] // 'base' 或 'trained'

      if (modelType === 'base') {
        // 基础模型
        const modelId = optionArray?.[1]?.modelData?.id ?? selectedIdFallbackMaps.base.get(modelPathKey(item))
        if (modelId) {
          groupedData.base_models.push(modelId)
        }
      }
      else {
        // 训练模型
        const versionId = optionArray?.[2]?.versionData?.id ?? selectedIdFallbackMaps.trained.get(modelPathKey(item))
        if (versionId) {
          groupedData.finetuned_models.push(versionId)
        }
      }
    })

    onChange?.(groupedData)
  }
  // 单选模式
  const handleChangeSingle = (value: string[], selectedOptions?: SelectOption) => {
    if (!value?.length) {
      onChange?.(undefined)
      return
    }
    const modelType = value[0] // 'base' 或 'trained'

    if (modelType === 'base') {
      // 基础模型：返回模型数据
      const name = selectedOptions?.[1]?.modelData?.name
      const id = selectedOptions?.[1]?.modelData?.id
      onChange?.({
        name,
        id,
        type: 'base',
      })
    }
    else {
      // 训练模型：返回版本数据
      const name = selectedOptions?.[2]?.versionData?.name
      const id = selectedOptions?.[2]?.versionData?.id
      const version = selectedOptions?.[2]?.versionData?.model_version
      onChange?.({
        version,
        name,
        id,
        type: 'trained',
      })
    }
  }

  return (
    <Cascader
      popupClassName="model-cascader-no-parent-checkbox"
      options={modelCascaderOptions}
      placeholder={placeholder}
      loadData={loadData}
      changeOnSelect={false}
      {...(multiple ? {
        multiple: true,
        onChange: handleChangeMultiple,
        value: multipleSelectValue.length ? multipleSelectValue : undefined,
      } : {
        onChange: handleChangeSingle,
        value: cascaderValue as string[],
      })}
      displayRender={displayRender}
      style={style}
      className={className}
    />
  )
}
