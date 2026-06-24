import { useCallback, useEffect, useState } from 'react'
import { ModelService } from '@/services/modelsApi'
import { trainingDatasetService } from '@/services/trainingApi'
import { inferenceServiceApi } from '@/services/inferenceService'
import {
  getKubernetesClusterGPUTypes,
  getKubernetesClusterGPUs,
} from '@/services/kubernetesService'

/**
 * 推理数据获取 Hook
 * @param projectId 项目ID
 * @param datasetType 数据集类型（可选，用于过滤数据集）
 * @param modelType 模型类型（可选，用于过滤模型和服务）
 */
export const useInferenceData = (
  projectId: string | undefined,
  datasetType?: string,
  modelType?: string,
) => {
  const [baseModels, setBaseModels] = useState<any[]>([])
  const [trainedModels, setTrainedModels] = useState<any[]>([])
  const [inferenceServices, setInferenceServices] = useState<any[]>([])
  const [gpuCascaderOptions, setGpuCascaderOptions] = useState<any[]>([])
  const [datasets, setDatasets] = useState<any[]>([])
  const [trainingDatasets, setTrainingDatasets] = useState<any[]>([])
  const [validationDatasets, setValidationDatasets] = useState<any[]>([])
  const [testDatasets, setTestDatasets] = useState<any[]>([])
  const [datasetCascaderOptions, setDatasetCascaderOptions] = useState<any[]>(
    [],
  )

  // Loading 状态
  const [loading, setLoading] = useState({
    baseModels: false,
    trainedModels: false,
    datasets: false,
    inferenceServices: false,
    gpuResources: false,
  })

  // Error 状态
  const [errors, setErrors] = useState({
    baseModels: null as Error | null,
    trainedModels: null as Error | null,
    datasets: null as Error | null,
    inferenceServices: null as Error | null,
    gpuResources: null as Error | null,
  })

  // 获取基础模型列表
  const fetchBaseModels = useCallback(async () => {
    setLoading((prev) => ({ ...prev, baseModels: true }))
    setErrors((prev) => ({ ...prev, baseModels: null }))
    try {
      const response = await ModelService.getBaseModels({
        page: 1,
        size: 100,
        is_available: true,
        ...(modelType && { model_type: modelType }),
      })
      setBaseModels(response.items || [])
      setErrors((prev) => ({ ...prev, baseModels: null }))
    }
    catch (error) {
      console.error('获取基础模型列表失败:', error)
      setErrors((prev) => ({ ...prev, baseModels: error as Error }))
    }
    finally {
      setLoading((prev) => ({ ...prev, baseModels: false }))
    }
  }, [modelType])

  useEffect(() => {
    fetchBaseModels()
  }, [fetchBaseModels])

  // 获取训练模型列表
  const fetchTrainedModels = useCallback(async () => {
    if (!projectId) return
    setLoading((prev) => ({ ...prev, trainedModels: true }))
    setErrors((prev) => ({ ...prev, trainedModels: null }))
    try {
      const response = await ModelService.getBaseModelsByProjectId(
        Number(projectId),
        {
          page: 1,
          size: 100,
          ...(modelType && { model_type: modelType }),
        },
      )
      setTrainedModels(response.items || [])
      setErrors((prev) => ({ ...prev, trainedModels: null }))
    }
    catch (error) {
      console.error('获取训练模型列表失败:', error)
      setErrors((prev) => ({ ...prev, trainedModels: error as Error }))
    }
    finally {
      setLoading((prev) => ({ ...prev, trainedModels: false }))
    }
  }, [projectId, modelType])

  useEffect(() => {
    fetchTrainedModels()
  }, [fetchTrainedModels])

  // 获取数据集列表（训练/验证/测试）并构建级联选择器选项
  const fetchDatasets = useCallback(async () => {
    if (!projectId) return
    setLoading((prev) => ({ ...prev, datasets: true }))
    setErrors((prev) => ({ ...prev, datasets: null }))
    try {
      const baseParams: any = {
        page: 1,
        size: 100,
      }
      // 如果提供了datasetType，添加到查询参数中
      if (datasetType) {
        baseParams.dataset_type = datasetType
      }

      const [trainingRes, validationRes, testRes] = await Promise.all([
        trainingDatasetService.get(Number(projectId), {
          ...baseParams,
          usage: 'training',
          processing_status: 'completed',
        }),
        trainingDatasetService.get(Number(projectId), {
          ...baseParams,
          usage: 'validation',
          processing_status: 'completed',
        }),
        trainingDatasetService.get(Number(projectId), {
          ...baseParams,
          usage: 'test',
          processing_status: 'completed',
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
      setErrors((prev) => ({ ...prev, datasets: null }))
    }
    catch (error) {
      console.error('获取数据集列表失败:', error)
      setErrors((prev) => ({ ...prev, datasets: error as Error }))
    }
    finally {
      setLoading((prev) => ({ ...prev, datasets: false }))
    }
  }, [projectId, datasetType])

  useEffect(() => {
    fetchDatasets()
  }, [fetchDatasets])

  // 获取在线推理服务列表
  const fetchInferenceServices = useCallback(async () => {
    if (!projectId) return
    setLoading((prev) => ({ ...prev, inferenceServices: true }))
    setErrors((prev) => ({ ...prev, inferenceServices: null }))
    try {
      const response = await inferenceServiceApi.list({
        page: 1,
        size: 100,
        projectId,
        status: '测试通过',
        ...(modelType && { model_type: modelType }),
      })
      setInferenceServices(response.items || [])
      setErrors((prev) => ({ ...prev, inferenceServices: null }))
    }
    catch (error) {
      console.error('获取在线推理服务列表失败:', error)
      setErrors((prev) => ({ ...prev, inferenceServices: error as Error }))
    }
    finally {
      setLoading((prev) => ({ ...prev, inferenceServices: false }))
    }
  }, [projectId, modelType])

  useEffect(() => {
    fetchInferenceServices()
  }, [fetchInferenceServices])

  // 获取显卡资源列表
  const fetchGPUResources = useCallback(async () => {
    if (!projectId) return
    setLoading((prev) => ({ ...prev, gpuResources: true }))
    setErrors((prev) => ({ ...prev, gpuResources: null }))
    try {
      const res = await getKubernetesClusterGPUs(Number(projectId))
      const data = res.map((item: any) => ({
        value: item.category,
        label: item.category,
        isLeaf: false,
      }))
      setGpuCascaderOptions(data)
      setErrors((prev) => ({ ...prev, gpuResources: null }))
    }
    catch (error) {
      console.error('获取显卡资源列表失败:', error)
      setErrors((prev) => ({ ...prev, gpuResources: error as Error }))
    }
    finally {
      setLoading((prev) => ({ ...prev, gpuResources: false }))
    }
  }, [projectId])

  useEffect(() => {
    fetchGPUResources()
  }, [fetchGPUResources])

  // 重试所有失败的数据获取
  const retryAll = useCallback(() => {
    fetchBaseModels()
    fetchTrainedModels()
    fetchDatasets()
    fetchInferenceServices()
    fetchGPUResources()
  }, [fetchBaseModels, fetchTrainedModels, fetchDatasets, fetchInferenceServices, fetchGPUResources])

  // 计算整体 loading 状态
  const isLoading = Object.values(loading).includes(true)

  // 计算是否有错误
  const hasError = Object.values(errors).some((e) => e !== null)

  return {
    baseModels,
    trainedModels,
    inferenceServices,
    gpuCascaderOptions,
    setGpuCascaderOptions,
    datasets,
    trainingDatasets,
    validationDatasets,
    testDatasets,
    datasetCascaderOptions,
    setDatasetCascaderOptions,
    loading,
    errors,
    isLoading,
    hasError,
    retryAll,
    retry: {
      baseModels: fetchBaseModels,
      trainedModels: fetchTrainedModels,
      datasets: fetchDatasets,
      inferenceServices: fetchInferenceServices,
      gpuResources: fetchGPUResources,
    },
  }
}
