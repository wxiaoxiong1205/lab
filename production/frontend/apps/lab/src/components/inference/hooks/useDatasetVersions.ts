import { useState } from 'react'
import { message } from 'antd'
import { trainingDatasetService } from '@/services/trainingApi'

/**
 * 数据集版本加载 Hook
 */
export const useDatasetVersions = (
  projectId: string | undefined,
  datasetCascaderOptions: any[],
  setDatasetCascaderOptions: (options: any[]) => void,
) => {
  const [datasetVersions, setDatasetVersions] = useState<
    Record<string, any[]>
  >({})

  const loadDatasetVersions = async (selectedOptions: any[]) => {
    if (selectedOptions.length !== 2) {
      return
    }

    const targetOption = selectedOptions[selectedOptions.length - 1]
    targetOption.loading = true

    try {
      const datasetName = targetOption.value
      if (!projectId || !datasetName) {
        targetOption.loading = false
        return
      }

      // 获取 usage（分类：training/validation/test）
      const categoryOption = selectedOptions[0]
      const usage = categoryOption?.value as 'training' | 'test' | 'validation'
      if (!usage) {
        targetOption.loading = false
        return
      }

      // 检查缓存
      if (datasetVersions[datasetName]) {
        targetOption.children = datasetVersions[datasetName]
        targetOption.loading = false
        setDatasetCascaderOptions([...datasetCascaderOptions])
        return
      }

      // 获取数据集版本信息（使用数据集名称而不是id）
      const versions = await trainingDatasetService.detail(
        Number(projectId),
        datasetName,
        usage,
        'completed',
      )
      const versionList = Array.isArray(versions) ? versions : [versions]

      const children = versionList.map((version: any) => ({
        value: version.version,
        label: version.version,
        isLeaf: true,
        versionData: version,
      }))

      // 更新缓存
      setDatasetVersions((prev) => ({ ...prev, [datasetName]: children }))
      targetOption.children = children
    }
    catch (error) {
      console.error('加载数据集版本失败:', error)
      message.error('加载数据集版本失败')
    }
    finally {
      targetOption.loading = false
      setDatasetCascaderOptions([...datasetCascaderOptions])
    }
  }

  return {
    loadDatasetVersions,
  }
}
