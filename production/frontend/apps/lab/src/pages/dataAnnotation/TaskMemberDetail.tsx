import React, { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  Progress,
  Table,
  Typography,
  message,
} from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import AddAnnotationMemberModal from './components/AddAnnotationMemberModal'
import { labelTaskService } from '@/services/dataAnnotationService'
import type {
  MultiLabelMemberRole,
  MultiLabelTaskAnnotator,
  MultiLabelTaskAuditor,
  MultiLabelTaskDetail,
} from '@/services/dataAnnotationService'
import type { User } from '@/types'

const { Title, Text } = Typography

const TaskMemberDetail: React.FC = () => {
  const { projectId, taskId } = useParams<{ projectId: string, taskId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const bizType = searchParams.get('biz_type') || undefined
  const from = searchParams.get('from')
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<MultiLabelTaskDetail | null>(null)
  const [canAccessOverview, setCanAccessOverview] = useState(false)
  const [replaceModalOpen, setReplaceModalOpen] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [replaceTarget, setReplaceTarget] = useState<{
    role: MultiLabelMemberRole
    userId: number
    userName: string
  } | null>(null)

  const fetchDetail = useCallback(async () => {
    if (!projectId || !taskId) return
    setLoading(true)
    try {
      const data = await labelTaskService.getMultiLabelTaskDetail(
        Number(projectId),
        Number(taskId),
        bizType,
      )
      setDetail(data)
    }
    catch {
      setDetail(null)
    }
    finally {
      setLoading(false)
    }
  }, [bizType, projectId, taskId])

  const fetchAdminAccess = useCallback(async () => {
    if (!projectId) return
    try {
      const data = await labelTaskService.getMultiLabelAdminAccess(Number(projectId), bizType)
      setCanAccessOverview(Boolean(data?.can_access))
    }
    catch {
      setCanAccessOverview(false)
    }
  }, [bizType, projectId])

  useEffect(() => {
    fetchDetail()
    fetchAdminAccess()
  }, [fetchDetail, fetchAdminAccess])

  const handleBack = () => {
    const subTab = searchParams.get('sub_tab') || 'overview'
    const params = new URLSearchParams({ tab: 'multi-person', sub_tab: subTab })
    if (bizType) params.set('biz_type', bizType)
    navigate(`/project/${projectId}/${from === 'machine-annotation' ? 'machine-annotation' : 'data-annotation'}?${params.toString()}`)
  }

  const datasetName = detail?.source_dataset_name ?? '--'
  const dataQuantity = detail?.total_samples ?? 0
  const auditRatio = detail?.audit_sampling_ratio ?? 0
  const taskName = detail?.task_name ?? '--'
  const annotators = detail?.annotators ?? []
  const auditors = detail?.auditors ?? []
  const canReplaceMembers = canAccessOverview && detail?.status !== 'published'

  const openReplaceModal = (role: MultiLabelMemberRole, userId: number, userName: string) => {
    if (!canReplaceMembers) return
    setReplaceTarget({ role, userId, userName })
    setReplaceModalOpen(true)
  }

  const handleReplaceConfirm = async (users: User[]) => {
    if (!canReplaceMembers) return
    if (!projectId || !taskId || !replaceTarget || users.length === 0) return
    const selectedUser = users[0]
    if (!selectedUser?.userId || selectedUser.userId === replaceTarget.userId) {
      message.warning('请选择新的成员')
      return
    }

    setReplacing(true)
    try {
      await labelTaskService.replaceMultiLabelTaskMember(Number(projectId), Number(taskId), {
        role: replaceTarget.role,
        from_user_id: replaceTarget.userId,
        to_user_id: selectedUser.userId,
      }, bizType)
      message.success('替换成功')
      setReplaceModalOpen(false)
      setReplaceTarget(null)
      await fetchDetail()
    }
    catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '替换失败')
    }
    finally {
      setReplacing(false)
    }
  }

  const handleReplaceCancel = () => {
    if (replacing) return
    setReplaceModalOpen(false)
    setReplaceTarget(null)
  }

  const renderUserNameWithReplace = (
    name: string,
    index: number,
    role: MultiLabelMemberRole,
    userId: number,
  ) => (
    <div className="flex items-center gap-3">
      <span>{name}</span>
      {canReplaceMembers && (
        <Button
          type="link"
          size="small"
          onClick={() => openReplaceModal(role, userId, name)}
        >
          替换
        </Button>
      )}
    </div>
  )

  const annotatorColumns: ColumnsType<MultiLabelTaskAnnotator> = [
    {
      title: '用户名',
      dataIndex: 'user_name',
      key: 'user_name',
      width: 220,
      render: (name: string, record: MultiLabelTaskAnnotator, index: number) =>
        renderUserNameWithReplace(name, index, 'annotator', record.user_id),
    },
    {
      title: '标注数量',
      dataIndex: 'assign_count',
      key: 'assign_count',
      width: 120,
      align: 'center',
      render: (v: number) => v ?? 0,
    },
    {
      title: '标注进度',
      key: 'progress',
      width: 200,
      render: (_: unknown, record: MultiLabelTaskAnnotator) => {
        const total = record.assign_count ?? 0
        const done = record.saved_count ?? 0
        const percent = total > 0 ? Math.round((done / total) * 100) : 0
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 max-w-[140px]">
              <Progress percent={Math.round(percent)} size="small" strokeColor="#1890ff" />
            </div>
          </div>
        )
      },
    },
    {
      title: '任务截止时间',
      dataIndex: 'deadline',
      key: 'deadline',
      width: 160,
      render: (t: string | null) =>
        t ? dayjs(t).format('YYYY/MM/DD HH:mm:ss') : '-',
    },
  ]

  const auditorColumns: ColumnsType<MultiLabelTaskAuditor> = [
    {
      title: '用户名',
      dataIndex: 'user_name',
      key: 'user_name',
      width: 220,
      render: (name: string, record: MultiLabelTaskAuditor, index: number) =>
        renderUserNameWithReplace(name, index, 'auditor', record.user_id),
    },
    {
      title: (
        <span>
          审核数量
          {' '}
          <Text type="success">
            抽检比例:
            {auditRatio}
            %
          </Text>
        </span>
      ),
      dataIndex: 'assigned_count',
      key: 'assigned_count',
      width: 160,
      align: 'center',
      render: (v: number) => v ?? 0,
    },
    {
      title: '审核进度',
      key: 'progress',
      width: 200,
      render: (_: unknown, record: MultiLabelTaskAuditor) => {
        const total = record.assigned_count ?? 0
        const done
          = (record.reviewed_passed_count ?? 0) + (record.reviewed_failed_count ?? 0)
        const percent = total > 0 ? Math.round((done / total) * 100) : 0
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 max-w-[140px]">
              <Progress percent={percent} size="small" strokeColor="#1890ff" />
            </div>
          </div>
        )
      },
    },
    {
      title: '任务截止时间',
      dataIndex: 'deadline',
      key: 'deadline',
      width: 160,
      render: (t: string | null) =>
        t ? dayjs(t).format('YYYY/MM/DD HH:mm:ss') : '-',
    },
  ]

  if (loading && !detail) {
    return (
      <div className="min-h-screen bg-white p-6">
        <div className="py-12 text-center text-gray-500">加载中...</div>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="min-h-screen bg-white p-6">
        <div className="py-12 text-center text-gray-500">任务不存在或加载失败</div>
        <Button onClick={handleBack}>返回</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="mb-4 flex items-center">
        <Button
          type="text"
          className="mr-3 !h-7 !w-7 !p-0 text-[18px] leading-7"
          icon={<ArrowLeftOutlined />}
          onClick={handleBack}
        />
        <Title level={5} className="!mb-0">
          任务成员
        </Title>
      </div>
      <Title level={5} className="mb-3">
        基本信息
      </Title>
      <Card size="small" className="mb-6">
        <div className="space-y-2">
          <div>
            <Text strong>标注任务：</Text>
            <Text>{taskName}</Text>
          </div>
          <div>
            <Text strong>数据集：</Text>
            <Text>{datasetName}</Text>
          </div>
          <div>
            <Text strong>数据量：</Text>
            <Text>
              {dataQuantity}
              条
            </Text>
          </div>
          <div>
            <Text strong>任务描述：</Text>
            <Text>{detail.description}</Text>
          </div>
        </div>
      </Card>

      <Title level={5} className="mt-6 mb-2">
        标注成员
      </Title>
      <Table<MultiLabelTaskAnnotator>
        columns={annotatorColumns}
        dataSource={annotators}
        rowKey="user_id"
        pagination={false}
        size="middle"
        loading={loading}
        className="mb-6"
      />

      <Title level={5} className="mb-2">
        审核成员
      </Title>
      <Table<MultiLabelTaskAuditor>
        columns={auditorColumns}
        dataSource={auditors}
        rowKey="user_id"
        pagination={false}
        size="middle"
        loading={loading}
      />

      <AddAnnotationMemberModal
        open={replaceModalOpen}
        mode={replaceTarget?.role === 'auditor' ? 'review' : 'annotation'}
        projectId={projectId}
        excludeUserIds={
          replaceTarget?.role === 'auditor'
            ? auditors.map((item) => item.user_id)
            : annotators.map((item) => item.user_id)
        }
        maxSelect={1}
        onCancel={handleReplaceCancel}
        onConfirm={handleReplaceConfirm}
      />
    </div>
  )
}

export default TaskMemberDetail
