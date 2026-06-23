import { useCallback, useEffect, useState } from 'react'
import { message } from 'antd'
import dayjs from 'dayjs'
import type { EvaluationType } from '../types/ReportDetailTypes.ts'
import { benchmarkEvaluationServices } from '@/services/benchmarkEvaluationService.ts'
import { modelEvaluationServices } from '@/services/modelEvaluationServices.ts'
import type { ProjectEvaluationTaskLogsResponse } from '@/services/modelEvaluationServices.ts'
import { downloadBlobFile } from '@/utils/download.ts'

interface UseReportLogsParams {
  projectId?: string
  taskId?: string
  evaluationType: EvaluationType
  activeTab: string
}

export function useReportLogs({
  projectId,
  taskId,
  evaluationType,
  activeTab,
}: UseReportLogsParams) {
  const [logs, setLogs] = useState<string[]>([])
  const [isLoadingLogs, setIsLoadingLogs] = useState(false)
  const [isArchivedLogs, setIsArchivedLogs] = useState(false)
  const [isDownloadingLogs, setIsDownloadingLogs] = useState(false)

  const fetchLogs = useCallback(async (showSuccessMessage = false) => {
    if (!projectId || !taskId) return

    setIsLoadingLogs(true)
    try {
      let logResponse: ProjectEvaluationTaskLogsResponse

      if (evaluationType === 'benchmark') {
        const benchmarkLogResponse = await benchmarkEvaluationServices.getBatchEvaluationLogs(
          Number(projectId),
          Number(taskId),
        )
        logResponse = {
          logs: benchmarkLogResponse?.logs || [],
          archived: benchmarkLogResponse?.archived || false,
        } as ProjectEvaluationTaskLogsResponse
      }
      else {
        logResponse = await modelEvaluationServices.getProjectEvaluationTaskLogs(
          Number(projectId),
          Number(taskId),
          dayjs().toISOString(),
        )
      }

      setLogs(logResponse?.logs || [])
      setIsArchivedLogs(logResponse?.archived || false)
      if (showSuccessMessage) {
        message.success('日志刷新成功')
      }
    }
    catch (error) {
      console.error('获取任务日志失败:', error)
      message.error(showSuccessMessage ? '刷新日志失败' : '获取任务日志失败')
      setLogs([])
      setIsArchivedLogs(false)
    }
    finally {
      setIsLoadingLogs(false)
    }
  }, [projectId, taskId, evaluationType])

  useEffect(() => {
    if (activeTab === 'logs') {
      void fetchLogs()
    }
  }, [activeTab, fetchLogs])

  const handleRefreshLogs = useCallback(() => {
    void fetchLogs(true)
  }, [fetchLogs])

  const handleDownloadLogs = useCallback(async () => {
    if (!projectId || !taskId) {
      message.warning('缺少必要参数')
      return
    }

    setIsDownloadingLogs(true)
    try {
      if (evaluationType === 'benchmark') {
        const logResponse = await benchmarkEvaluationServices.downloadBatchEvaluationLogs(
          Number(projectId),
          Number(taskId),
        )
        const blob = logResponse instanceof Blob ? logResponse : new Blob([String(logResponse || '')], { type: 'text/plain;charset=utf-8' })
        downloadBlobFile(blob, `基准评估任务日志_任务${taskId}_${dayjs().format('YYYYMMDD_HHmmss')}.txt`)
      }
      else {
        const logText = logs.length > 0 ? logs.join('\n') : '暂无日志'
        const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' })
        downloadBlobFile(blob, `评估任务日志_任务${taskId}_${dayjs().format('YYYYMMDD_HHmmss')}.txt`)
      }
      message.success('日志下载成功')
    }
    catch (error) {
      console.error('下载日志失败:', error)
      message.error('下载日志失败，请稍后重试')
    }
    finally {
      setIsDownloadingLogs(false)
    }
  }, [projectId, taskId, evaluationType, logs])

  return {
    logs,
    isLoadingLogs,
    isArchivedLogs,
    isDownloadingLogs,
    handleRefreshLogs,
    handleDownloadLogs,
  }
}
