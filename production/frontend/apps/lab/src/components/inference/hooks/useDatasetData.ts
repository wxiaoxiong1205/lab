import { useCallback, useEffect, useState } from 'react'
import { trainingDatasetService } from '@/services/trainingApi'

/**
 * 数据集数据获取 Hook（仅用于数据集选择）
 */
export const useDatasetData = (projectId: string | undefined, datasetType?: string) => {
  const [datasets, setDatasets] = useState<any[]>([])
  const [trainingDatasets, setTrainingDatasets] = useState<any[]>([])
  const [validationDatasets, setValidationDatasets] = useState<any[]>([])
  const [testDatasets, setTestDatasets] = useState<any[]>([])
  const [datasetCascaderOptions, setDatasetCascaderOptions] = useState<any[]>(
    [],
  )

  // Loading 状态
  const [loading, setLoading] = useState(false)

  // Error 状态
  const [error, setError] = useState<Error | null>(null)

  // 获取数据集列表（训练/验证/测试）并构建级联选择器选项
  const fetchDatasets = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      // 构建请求参数，如果传入了 datasetType 则添加到参数中
      const baseParams: any = {
        page: 1,
        size: 100,
      }
      // 确保 datasetType 有值时才添加参数，用于过滤数据集类型
      if (datasetType && datasetType.trim()) {
        baseParams.dataset_type = datasetType
      }

      const [trainingRes, validationRes, testRes] = await Promise.all([
        trainingDatasetService.get(Number(projectId), {
          ...baseParams,
          usage: 'training',
        }),
        trainingDatasetService.get(Number(projectId), {
          ...baseParams,
          usage: 'validation',
        }),
        trainingDatasetService.get(Number(projectId), {
          ...baseParams,
          usage: 'test',
        }),
      ])
      // 分别保存训练集、验证集和测试集
      const training = (trainingRes.items || []).map((item: any) => ({
        ...item,
        label: item.dataset_name,
        value: item.dataset_name,
      }))
      const validation = (validationRes.items || []).map((item: any) => ({
        ...item,
        label: item.dataset_name,
        value: item.dataset_name,
      }))
      const test = (testRes.items || []).map((item: any) => ({
        ...item,
        label: item.dataset_name,
        value: item.dataset_name,
      }))
      setTrainingDatasets(training)
      setValidationDatasets(validation)
      setTestDatasets(test)
      // 保留allDatasets用于兼容（如果需要）
      const allDatasets = [...training, ...validation, ...test]
      setDatasets(allDatasets)

      // 构建级联选择器选项（第一级：分类，第二级：数据集，第三级：版本（懒加载））
      // 即使列表为空也显示分类项，但设置为 disabled: true 来置灰，并添加提示信息
      const cascaderOptions = []

      const isTrainingEmpty = training.length === 0
      cascaderOptions.push({
        value: 'training',
        label: isTrainingEmpty ? '训练集（请新建数据集）' : '训练集',
        isLeaf: false,
        disabled: isTrainingEmpty, // 没有数据时置灰
        children:
          training.length > 0
            ? training.map((item: any) => ({
                value: item.dataset_name,
                label: item.dataset_name,
                isLeaf: false, // 版本信息懒加载
                datasetId: item.id || item.dataset_name,
              }))
            : [],
      })

      const isValidationEmpty = validation.length === 0
      cascaderOptions.push({
        value: 'validation',
        label: isValidationEmpty ? '验证集（请新建数据集）' : '验证集',
        isLeaf: false,
        disabled: isValidationEmpty, // 没有数据时置灰
        children:
          validation.length > 0
            ? validation.map((item: any) => ({
                value: item.dataset_name,
                label: item.dataset_name,
                isLeaf: false, // 版本信息懒加载
                datasetId: item.id || item.dataset_name,
              }))
            : [],
      })

      const isTestEmpty = test.length === 0
      cascaderOptions.push({
        value: 'test',
        label: isTestEmpty ? '测试集（请新建数据集）' : '测试集',
        isLeaf: false,
        disabled: isTestEmpty, // 没有数据时置灰
        children:
          test.length > 0
            ? test.map((item: any) => ({
                value: item.dataset_name,
                label: item.dataset_name,
                isLeaf: false, // 版本信息懒加载
                datasetId: item.id || item.dataset_name,
              }))
            : [],
      })

      setDatasetCascaderOptions(cascaderOptions)
      setError(null)
    }
    catch (error) {
      console.error('获取数据集列表失败:', error)
      setError(error as Error)
    }
    finally {
      setLoading(false)
    }
  }, [projectId, datasetType])

  useEffect(() => {
    fetchDatasets()
  }, [fetchDatasets])

  return {
    datasets,
    trainingDatasets,
    validationDatasets,
    testDatasets,
    datasetCascaderOptions,
    setDatasetCascaderOptions,
    loading,
    error,
    refetch: fetchDatasets,
  }
}
