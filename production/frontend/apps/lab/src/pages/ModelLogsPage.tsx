import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Alert, Button, Card, Spin,
} from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { ModelService } from '@/services/modelsApi'
import LogViewer from '@/components/common/LogViewer'
// import { useConfigStore } from '@/stores/configStore';

/**
 * 模型训练日志页面
 * 复用 ExperimentRunDetail 中的日志处理逻辑，但使用模型日志接口
 */
const ModelLogsPage: React.FC = () => {
  const navigate = useNavigate()
  const { projectId, taskId } = useParams<{
    projectId: string
    taskId: string
  }>()
  const [mergedLogsData, setMergedLogsData] = useState<any>(null)

  // const { config, providerType } = useConfigStore();

  // 获取日志数据
  const {
    data: logsData,
    isLoading: isLogsLoading,
    error: logsError,
  } = useQuery({
    queryKey: ['modelLogs', projectId, taskId],
    queryFn: async () => {
      try {
        // 获取当前时间，东八区ISO格式
        const endTime = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace('Z', '+08:00')
        const response = await ModelService.getModelLogs(
          Number(projectId),
          Number(taskId),
          endTime,
        )
        return response
      }
      catch (err) {
        console.error('获取模型日志失败:', err)
        throw err
      }
    },
    enabled: Boolean(projectId) && Boolean(taskId),
    retry: 2,
    staleTime: 0, // 数据立即过期，确保每次都是最新的
    refetchOnMount: 'always', // 每次挂载时都重新获取
  })

  // 处理日志数据
  useEffect(() => {
    if (logsData) {
      setMergedLogsData(logsData)
    }
  }, [logsData])

  // 处理错误情况
  if (logsError) {
    return (
      <div className="p-6">
        <p className="mt-4"></p>
        <Alert message="获取数据失败" description="无法加载日志，请稍后重试" type="error" showIcon />
      </div>
    )
  }

  return (
    <div className="p-6">
      <Button
        type="text"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate(-1)}
        className="mb-4"
      >
        返回
      </Button>

      {/* 日志内容 */}
      <Card title="日志">
        {isLogsLoading ? (
          <div className="text-center py-12">
            <Spin tip="日志加载中..." />
          </div>
        ) : logsError ? (
          <Alert
            message="获取日志失败"
            description="无法加载日志，请稍后重试"
            type="error"
            showIcon
          />
        ) : mergedLogsData ? (
          <LogViewer
            logs={mergedLogsData.logs}
            archived={mergedLogsData.archived}
            maxHeight={600}
          />
        ) : (
          <Alert
            message="暂无日志信息"
            type="info"
            showIcon
          />
        )}
      </Card>
    </div>
  )
}

export default ModelLogsPage
