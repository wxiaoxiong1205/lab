import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Card, Skeleton, Space, Typography } from 'antd'
import LogViewer from '@/components/common/LogViewer'

const { Title } = Typography

interface ReportTaskLogsTabProps {
  logs: string[]
  archived: boolean
  loading: boolean
  downloading: boolean
  onRefresh: () => void
  onDownload: () => void
}

export default function ReportTaskLogsTab({
  logs,
  archived,
  loading,
  downloading,
  onRefresh,
  onDownload,
}: ReportTaskLogsTabProps) {
  return (
    <div className="task-logs-content">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <Title level={5} className="m-0">评估任务日志</Title>
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={onRefresh}
              loading={loading}
            >
              刷新
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={onDownload}
              loading={downloading}
              disabled={logs.length === 0 || loading || downloading}
            >
              下载
            </Button>
          </Space>
        </div>
        {loading ? (
          <Skeleton active paragraph={{ rows: 10 }} />
        ) : (
          <LogViewer
            logs={logs}
            archived={archived}
            maxHeight="600px"
            searchPlaceholder="搜索日志内容..."
            showStats
          />
        )}
      </Card>
    </div>
  )
}
