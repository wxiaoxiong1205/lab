import { useMutation, useQueryClient } from '@tanstack/react-query'
import { message } from 'antd'
import { datasetApi } from '../../services/api'
import type { CreateDatasetRequest } from '../../types/dataset'

export const useDatasetOperations = (
  projectId: number,
  directoryId: number,
) => {
  const queryClient = useQueryClient()

  // 创建数据集
  const createDataset = useMutation({
    mutationFn: (values: CreateDatasetRequest) =>
      datasetApi.create(projectId, directoryId, values),
    onSuccess: () => {
      message.success('数据集创建成功')
      queryClient.invalidateQueries({ queryKey: ['datasets', 'search'] })
    },
    onError: (error: any) => {
      message.error(`创建数据集失败: ${error.message}`)
    },
  })

  // 删除数据集
  const deleteDataset = useMutation({
    mutationFn: async (datasetId: number) => {
      try {
        await datasetApi.delete(projectId, directoryId, datasetId)
      }
      catch (error: any) {
        console.error('Delete dataset error:', error)
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets', 'search'] })
    },
    onError: (error: any) => {
      message.error(`删除数据集失败: ${error.message}`)
    },
  })

  // 批量删除数据集
  const batchDeleteDatasets = useMutation({
    mutationFn: async (datasetIds: number[]) => {
      try {
        await datasetApi.batchDelete(projectId, directoryId, datasetIds)
      }
      catch (error: any) {
        console.error('Batch delete datasets error:', error)
        throw error
      }
    },
    onSuccess: () => {
      message.success('批量删除数据集成功')
      queryClient.invalidateQueries({ queryKey: ['datasets', 'search'] })
    },
    onError: (error: any) => {
      message.error(`批量删除数据集失败: ${error.message}`)
    },
  })

  // 更新数据集
  const updateDataset = useMutation({
    mutationFn: async ({
      datasetId,
      data,
    }: {
      datasetId: number
      data: CreateDatasetRequest
    }) => {
      try {
        return await datasetApi.update(projectId, directoryId, datasetId, data)
      }
      catch (error: any) {
        console.error('Update dataset error:', error)
        throw error
      }
    },
    onSuccess: () => {
      message.success('数据集更新成功')
      queryClient.invalidateQueries({ queryKey: ['datasets', 'search'] })
    },
    onError: (error: any) => {
      message.error(`更新数据集失败: ${error.message}`)
    },
  })

  // 导入XLSX文件
  const importXlsx = useMutation({
    mutationFn: async ({
      file,
      directoryId,
    }: {
      file: File
      directoryId: number
    }) => {
      return await datasetApi.importXlsx(projectId, directoryId, file)
    },
    onSuccess: (data) => {
      message.success(data.message)
      queryClient.invalidateQueries({ queryKey: ['datasets', projectId] })
    },
    onError: (error: any) => {
      message.error(error.response?.data?.detail || '导入失败')
    },
  })

  // 导出XLSX文件
  const exportXlsx = async (searchParams: any) => {
    try {
      const blob = await datasetApi.exportXlsx(
        projectId,
        directoryId,
        searchParams,
      )
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `datasets_export_${new Date()
        .toISOString()
        .replace(/:/g, '-')}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      message.success('数据集导出成功')
    }
    catch (error) {
      message.error('导出数据集失败')
      console.error('Export error:', error)
    }
  }

  return {
    createDataset,
    deleteDataset,
    batchDeleteDatasets,
    updateDataset,
    importXlsx,
    exportXlsx,
  }
}
