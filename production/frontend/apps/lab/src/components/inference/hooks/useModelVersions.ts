import { useState } from 'react'
import { ModelService } from '@/services/modelsApi'

/**
 * 模型版本获取 Hook
 */
export const useModelVersions = (projectId: string | undefined) => {
  const [modelVersions, setModelVersions] = useState<any[]>([])

  const fetchModelVersions = async (modelName: string) => {
    if (!projectId) return
    try {
      const response = await ModelService.getModelVersions(
        Number(projectId),
        modelName,
      )
      setModelVersions(response || [])
    }
    catch (error) {
      console.error('获取模型版本失败:', error)
    }
  }

  return {
    modelVersions,
    fetchModelVersions,
    setModelVersions,
  }
}
