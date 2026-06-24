import { useState } from 'react'
import { getKubernetesClusterGPUTypes } from '@/services/kubernetesService'

/**
 * GPU资源加载 Hook
 */
export const useGPUResources = (projectId: string | undefined) => {
  const [gpuModels, setGpuModels] = useState<Record<string, any[]>>({})

  const loadGpuModelData = async (
    selectedOptions: any[],
    setGpuCascaderOptions: (options: any[]) => void,
    gpuCascaderOptions: any[],
  ) => {
    const targetOption = selectedOptions[selectedOptions.length - 1]
    targetOption.loading = true
    try {
      const gpuType = targetOption.value
      if (!projectId) return

      if (!gpuModels[gpuType]) {
        const models = await getKubernetesClusterGPUTypes(
          Number(projectId),
          gpuType,
        )
        const children = models.map((model: any) => ({
          value: model.type || model.model,
          label: model.desc || model.type || model.model,
          memory: model.memory,
          model: model.model,
          isLeaf: true,
        }))
        setGpuModels((prev) => ({ ...prev, [gpuType]: children }))
        targetOption.children = children
      }
      else {
        targetOption.children = gpuModels[gpuType]
      }
    }
    catch (error) {
      console.error('加载显卡型号失败:', error)
    }
    finally {
      targetOption.loading = false
      setGpuCascaderOptions([...gpuCascaderOptions])
    }
  }

  return {
    loadGpuModelData,
    gpuModels,
  }
}
