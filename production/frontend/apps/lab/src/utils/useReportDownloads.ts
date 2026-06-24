import { useCallback, useMemo, useState } from 'react'
import { message } from 'antd'
import dayjs from 'dayjs'
import type { MenuProps } from 'antd'
import type { EvaluationType } from '../types/ReportDetailTypes.ts'
import { benchmarkEvaluationServices } from '@/services/benchmarkEvaluationService.ts'
import { manualEvaluationServices } from '@/services/manualEvaluationService.ts'
import { modelEvaluationServices } from '@/services/modelEvaluationServices.ts'
import type { ProjectEvaluationTaskDetail, ProjectEvaluationTaskReport } from '@/services/modelEvaluationServices.ts'
import { createBlobFromResponse, downloadBlobFile, downloadInferenceResultSetSample, extractFilenameFromHeaders } from '@/utils/download.ts'

type DownloadFormat = 'json' | 'jsonl' | 'csv' | 'xlsx'

interface UseReportDownloadsParams {
  projectId?: string
  taskId?: string
  evaluationType: EvaluationType
  selectedModelTab: string
  apiEvaluationMethodForResults: string
  isCompleted: boolean
  taskDetail: ProjectEvaluationTaskDetail | null
  reportData: ProjectEvaluationTaskReport | null
}

export function useReportDownloads({
  projectId,
  taskId,
  evaluationType,
  selectedModelTab,
  apiEvaluationMethodForResults,
  isCompleted,
  taskDetail,
  reportData,
}: UseReportDownloadsParams) {
  const [isExportingWord, setIsExportingWord] = useState(false)

  const handleDownloadResults = useCallback(async (format: DownloadFormat) => {
    if (!projectId || !taskId) {
      message.error('缺少必要参数')
      return
    }

    try {
      if (evaluationType === 'manual') {
        await downloadInferenceResultSetSample(format, async (fmt) => {
          return await manualEvaluationServices.downloadProjectEvaluationTaskResults(
            Number(projectId),
            Number(taskId),
            fmt as DownloadFormat,
          )
        })
      }
      else {
        if (!selectedModelTab) {
          message.error('缺少必要参数')
          return
        }
        const datasetId = Number(selectedModelTab)
        await downloadInferenceResultSetSample(format, async (fmt) => {
          return await modelEvaluationServices.downloadProjectEvaluationTaskResults(
            Number(projectId),
            Number(taskId),
            datasetId,
            apiEvaluationMethodForResults,
            fmt as DownloadFormat,
          )
        })
      }
      message.success('下载成功')
    }
    catch (error) {
      console.error('下载失败:', error)
      message.error('下载失败，请稍后重试')
    }
  }, [projectId, taskId, evaluationType, selectedModelTab, apiEvaluationMethodForResults])

  const downloadMenuItems: MenuProps['items'] = useMemo(() => [
    { key: 'json', label: 'JSON', onClick: () => handleDownloadResults('json') },
    { key: 'jsonl', label: 'JSONL', onClick: () => handleDownloadResults('jsonl') },
    { key: 'csv', label: 'CSV', onClick: () => handleDownloadResults('csv') },
    { key: 'xlsx', label: 'XLSX', onClick: () => handleDownloadResults('xlsx') },
  ], [handleDownloadResults])

  const handleDownloadDatasetResult = async (datasetCode: string, modelId?: number) => {
    if (!projectId || !taskId) {
      message.error('缺少必要参数')
      return
    }

    try {
      const response = await benchmarkEvaluationServices.downDatasetResult(
        Number(projectId),
        Number(taskId),
        {
          dataset_code: datasetCode,
          model_id: modelId,
        },
      )

      const contentDisposition = response.headers?.['content-disposition'] || response.headers?.['Content-Disposition']
      let fileName = `基准评估结果_${datasetCode}_${dayjs().format('YYYYMMDD_HHmmss')}.jsonl`

      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
        if (fileNameMatch?.[1]) {
          fileName = fileNameMatch[1].replace(/['"]/g, '')
          if (fileName.startsWith('UTF-8\'\'')) {
            fileName = decodeURIComponent(fileName.replace(/^UTF-8''/, ''))
          }
        }
      }

      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'application/octet-stream' })
      downloadBlobFile(blob, fileName)
      message.success('下载成功')
    }
    catch (error) {
      console.error('下载数据集评测结果失败', error)
      message.error('下载失败，请稍后重试')
    }
  }

  const handleDownloadWordReport = async () => {
    if (!projectId || !taskId) {
      message.error('缺少必要参数')
      return
    }

    if (!isCompleted || !taskDetail || !reportData) {
      message.warning('报告数据未准备好')
      return
    }

    setIsExportingWord(true)
    try {
      const response = evaluationType === 'benchmark'
        ? await benchmarkEvaluationServices.downCompareResult(Number(projectId), Number(taskId))
        : await modelEvaluationServices.downloadProjectEvaluationTaskWordReport(Number(projectId), Number(taskId))

      const defaultFilename = `评估报告_${taskDetail?.name || taskId}_${dayjs().format('YYYYMMDD_HHmmss')}.docx`
      const fileName = extractFilenameFromHeaders(response.headers, defaultFilename)
      const blob = createBlobFromResponse(
        response.data,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      )

      downloadBlobFile(blob, fileName)
      message.success('Word报告下载成功')
    }
    catch (error) {
      console.error('下载Word报告失败:', error)
      message.error('下载Word报告失败，请稍后重试')
    }
    finally {
      setIsExportingWord(false)
    }
  }

  return {
    isExportingWord,
    downloadMenuItems,
    handleDownloadDatasetResult,
    handleDownloadWordReport,
  }
}
