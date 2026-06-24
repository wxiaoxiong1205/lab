import { useState } from 'react'
import {
  Button,
  Card,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  CopyOutlined,
  EditOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import NotebookCaseEdit from './NotebookCaseEdit'
import MdPreview from '@/components/md-preview'
import { notebookService } from '@/services/notebookService'
import { useNotebookBasePath } from '@/hooks/getProjectPath'

/**
 * 案例详情页面（静态占位）
 */
export default function NotebookCaseDetail() {
  const { notebookBasePath } = useNotebookBasePath()
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const [editNonce, setEditNonce] = useState(0)
  const [permissionLoading, setPermissionLoading] = useState(false)
  const bizType = notebookBasePath.includes('machine-notebook') ? 'machine_learning' : 'llm'
  const { data: detail, refetch: refetchCaseDetail } = useQuery({
    queryKey: ['caseDetail', caseId],
    queryFn: () => {
      return notebookService.getNotebookSquareList({ page: 1, size: 1, example_id: caseId, biz_type: bizType }).then((res) => {
        return res.items[0]
      })
    },
    staleTime: 0,
    gcTime: 0,
  })

  const handleCopyCase = () => {
    navigate(`${notebookBasePath}/create?source_example_id=${detail?.id}`)
  }

  const openEditModal = async () => {
    if (!detail || !caseId)
      return
    try {
      setPermissionLoading(true)
      const { has_permission } = await notebookService.hasPermissionToEditCase(caseId)
      if (!has_permission) {
        message.warning('您没有权限编辑该案例')
        return
      }
      setEditNonce((n) => n + 1)
      setEditOpen(true)
    }
    catch {
      message.error('权限校验失败，请稍后重试')
    }
    finally {
      setPermissionLoading(false)
    }
  }

  if (editOpen && detail) {
    return (
      <NotebookCaseEdit
        key={`case-edit-${detail.id}-${editNonce}`}
        caseNumericId={detail.id}
        initialName={detail.name}
        initialDescribe={detail.describe ?? ''}
        onCancel={() => setEditOpen(false)}
        onSaved={async () => {
          setEditOpen(false)
          await refetchCaseDetail()
        }}
      />
    )
  }

  return (
    <div className="p-4">
      <Card>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          返回
        </Button>

        <Card className="!mb-8">
          <div className="flex items-center justify-between">
            <h2 className="!m-0">{detail?.name}</h2>
            <div className="flex items-center gap-2 ml-auto">
              <Button type="primary" icon={<CopyOutlined />} onClick={handleCopyCase}>
                复制案例
              </Button>
              <Button
                type="primary"
                icon={<EditOutlined />}
                disabled={!detail || !caseId}
                loading={permissionLoading}
                onClick={openEditModal}
              >
                编辑案例
              </Button>
            </div>
          </div>
        </Card>

        <Card className="!mb-8">
          <div className="min-h-0 overflow-y-auto">
            <MdPreview content={detail?.describe ?? '暂无描述'} />
          </div>
        </Card>
      </Card>
    </div>
  )
}
