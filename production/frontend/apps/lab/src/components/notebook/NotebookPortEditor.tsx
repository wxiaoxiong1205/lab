import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Typography,
  message,
} from 'antd'
import { CopyOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { notebookService } from '@/services/notebookService'
import type { PortItems } from '@/types'
import { copyToClipboard } from '@/utils/clipboard'

const { Text } = Typography

const PORT_PROTOCOL_OPTIONS = [
  { label: 'TCP', value: 'TCP' },
  { label: 'UDP', value: 'UDP' },
]

function resolvePortResourceId(port: PortItems): string {
  if (port.id != null && String(port.id).length > 0)
    return String(port.id)
  return String(port.container_port)
}

export interface NotebookPortRowCardProps {
  port: PortItems
  onEdit: () => void
  onDelete: () => void
}

export const NotebookPortRowCard: React.FC<NotebookPortRowCardProps> = ({ port, onEdit, onDelete }) => {
  const [hovered, setHovered] = useState(false)
  const [deletePopOpen, setDeletePopOpen] = useState(false)
  const showActions = hovered || deletePopOpen
  return (
    <div
      className="flex-1 flex-shrink min-w-[220px] max-w-[400px] basis-[260px]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Card
        size="small"
        title="   "
        className="[&_.ant-modal-body]:pt-3"
        extra={showActions
          ? (
              <Space size={4} onClick={(e) => e.stopPropagation()}>
                <Button type="link" size="small" icon={<EditOutlined />} onClick={onEdit}>
                  编辑
                </Button>
                <Popconfirm
                  title="确定删除该开放端口？"
                  okText="确定"
                  cancelText="取消"
                  onConfirm={onDelete}
                  onOpenChange={setDeletePopOpen}
                >
                  <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()}>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            )
          : undefined}
      >
        <div>
          <div className="mb-1.5">
            <Text strong>内部端口：</Text>
            <Text>{port.container_port}</Text>
          </div>
          <div className="mb-1.5">
            <Text strong>协议：</Text>
            <Text>{port.protocol}</Text>
          </div>
          <div className="mb-1.5">
            <Text strong>使用用途：</Text>
            <Text>{port.description}</Text>
          </div>
          <div>
            <Text strong>外部访问：</Text>
            <Text className="break-all">{port.access_url}</Text>
            <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => void copyToClipboard(port.access_url)} />
          </div>
        </div>
      </Card>
    </div>
  )
}

export type NotebookPortEditorModalRef = {
  openAdd: () => void
  openEdit: (port: PortItems) => void
}

export type NotebookPortEditorModalProps = {
  getProjectId: () => number | null
  routeNotebookId: string | undefined
  notebookNumericId: number
  onSuccess: () => void | Promise<void>
}

type PendingPortOpen = 'add' | { kind: 'edit', port: PortItems }

export const NotebookPortEditorModal = forwardRef<NotebookPortEditorModalRef, NotebookPortEditorModalProps>(
  ({ getProjectId, routeNotebookId, notebookNumericId, onSuccess }, ref) => {
    const [form] = Form.useForm()
    const [open, setOpen] = useState(false)
    const [mode, setMode] = useState<'add' | 'edit'>('add')
    const [editResourceId, setEditResourceId] = useState<string | null>(null)
    const [submitLoading, setSubmitLoading] = useState(false)
    const pendingOpenRef = useRef<PendingPortOpen | null>(null)

    const applyPendingFormValues = useCallback(() => {
      const pending = pendingOpenRef.current
      pendingOpenRef.current = null
      if (pending === 'add') {
        form.resetFields()
        form.setFieldsValue({ protocol: 'TCP', description: '' })
        return
      }
      if (pending && typeof pending === 'object' && pending.kind === 'edit') {
        const { port } = pending
        form.setFieldsValue({
          protocol: port.protocol,
          container_port: port.container_port != null ? Number(port.container_port) : undefined,
          description: port.description ?? '',
        })
      }
    }, [form])

    useImperativeHandle(ref, () => ({
      openAdd: () => {
        setMode('add')
        setEditResourceId(null)
        pendingOpenRef.current = 'add'
        setOpen(true)
      },
      openEdit: (port: PortItems) => {
        setMode('edit')
        setEditResourceId(resolvePortResourceId(port))
        pendingOpenRef.current = { kind: 'edit', port }
        setOpen(true)
      },
    }), [])

    const handleCancel = useCallback(() => {
      setOpen(false)
    }, [])

    const handleSubmit = useCallback(async () => {
      const currentProjectId = getProjectId()
      const nid = routeNotebookId ?? String(notebookNumericId)
      if (!currentProjectId || !nid) {
        message.error('未找到项目或 Notebook 信息')
        return
      }
      try {
        const values = await form.validateFields()
        const payload: PortItems = {
          protocol: values.protocol,
          container_port: Number(values.container_port),
          description: values.description ?? '',
        }
        setSubmitLoading(true)
        const pid = String(currentProjectId)
        if (mode === 'add') {
          await notebookService.addPort(pid, nid, payload)
          message.success('端口已添加')
        }
        else {
          if (!editResourceId) {
            message.error('缺少端口标识，无法保存')
            return
          }
          await notebookService.editPort(pid, nid, editResourceId, payload)
          message.success('端口已更新')
        }
        setOpen(false)
        await onSuccess()
      }
      catch (error: unknown) {
        if (error && typeof error === 'object' && 'errorFields' in error)
          return
        console.error(error)
        message.error(mode === 'add' ? '添加端口失败' : '更新端口失败')
      }
      finally {
        setSubmitLoading(false)
      }
    }, [getProjectId, routeNotebookId, notebookNumericId, form, mode, editResourceId, onSuccess])

    return (
      <Modal
        title={mode === 'add' ? '新增开放端口' : '编辑开放端口'}
        open={open}
        onOk={() => void handleSubmit()}
        onCancel={handleCancel}
        afterOpenChange={(visible) => {
          if (visible)
            applyPendingFormValues()
        }}
        confirmLoading={submitLoading}
        destroyOnClose
        okText="确定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="protocol"
            label="协议"
            rules={[{ required: true, message: '请选择协议' }]}
          >
            <Select options={[...PORT_PROTOCOL_OPTIONS]} placeholder="协议" />
          </Form.Item>
          <Form.Item
            name="container_port"
            label="内部端口"
            rules={[
              { required: true, message: '请输入内部端口' },
              { type: 'number', min: 0, max: 65535, message: '端口范围为 0-65535' },
            ]}
          >
            <InputNumber min={0} max={65535} precision={0} className="w-full" placeholder="内部端口" />
          </Form.Item>
          <Form.Item
            name="description"
            label="使用用途"
            rules={[{ max: 64, message: '用途说明最多 64 个字符' }]}
          >
            <Input maxLength={64} showCount placeholder="请说明端口用途" />
          </Form.Item>
        </Form>
      </Modal>
    )
  },
)

NotebookPortEditorModal.displayName = 'NotebookPortEditorModal'

export { resolvePortResourceId }
