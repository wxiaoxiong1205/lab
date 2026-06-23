import { CheckOutlined, CloseOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Input, Modal, Popconfirm, Space, Spin, message } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { tagsService } from '@/services/tagsServie'
import type { classesItemType } from '@/types/tags'

interface EditTagsModalProps {
  open: boolean
  tag: classesItemType | null
  onCancel: () => void
  onSuccess?: () => void
}

type Row = { id: number, name: string, code: string, sort_order: number }

function newDraftKey() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function elementCode(name: string, order: number) {
  const s = name.trim().replace(/\s+/g, '_').replace(/[^\w\u4E00-\u9FFF-]/g, '') || 'tag'
  return `${s}_${order + 1}`
}

export const EditTagsModal = ({ open, tag, onCancel, onSuccess }: EditTagsModalProps) => {
  const classId = tag?.id ?? null
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [drafts, setDrafts] = useState<{ key: string, name: string }[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [buffer, setBuffer] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (classId == null) return
    setLoading(true)
    try {
      const res = await tagsService.getElementsList({ class_id: classId, page: 1, size: 500 })
      const list = [...(res.items ?? [])].sort((a, b) => a.sort_order - b.sort_order)
      setRows(list.map((e) => ({ id: e.id, name: e.name, code: e.code, sort_order: e.sort_order })))
      setDrafts([])
      setEditingId(null)
      setBuffer('')
    }
    catch (e) {
      console.error(e)
      message.error('加载标签值失败')
    }
    finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => {
    if (open && classId != null) reload()
  }, [open, classId, reload])

  const editingOther = (id: number) => editingId != null && editingId !== id
  const idle = busy == null
  /** 有一条未提交的新增草稿时：不能操作其它行、不能再点「添加标签值」 */
  const hasDraft = drafts.length > 0

  async function withBusy(key: string, err: string, fn: () => Promise<void>) {
    setBusy(key)
    try {
      await fn()
    }
    catch (e) {
      console.error(e)
      message.error(err)
    }
    finally {
      setBusy(null)
    }
  }

  function saveRow(row: Row) {
    const name = buffer.trim()
    if (!name) {
      message.warning('请输入标签值名称')
      return
    }
    if (name === row.name) {
      setEditingId(null)
      setBuffer('')
      return
    }
    withBusy(`save-${row.id}`, '保存失败', async () => {
      await tagsService.updateElement(row.id, { name, code: row.code, sort_order: row.sort_order })
      message.success('已保存')
      setEditingId(null)
      setBuffer('')
      await reload()
      onSuccess?.()
    })
  }

  function deleteRow(id: number) {
    const clearEdit = editingId === id
    withBusy(`del-${id}`, '删除失败', async () => {
      await tagsService.deleteElement(id)
      message.success('已删除')
      if (clearEdit) {
        setEditingId(null)
        setBuffer('')
      }
      await reload()
      onSuccess?.()
    })
  }

  function saveDraft(key: string, name: string) {
    const n = name.trim()
    if (!n) {
      message.warning('请输入标签值名称')
      return
    }
    if (classId == null) return
    const order = rows.length ? Math.max(...rows.map((r) => r.sort_order)) + 1 : 0
    withBusy(`new-${key}`, '添加失败', async () => {
      await tagsService.createElement({
        class_id: classId,
        name: n,
        code: elementCode(n, order),
        sort_order: order,
      })
      message.success('已添加')
      setDrafts((d) => d.filter((x) => x.key !== key))
      await reload()
      onSuccess?.()
    })
  }

  const delBtnDisabled = (rowId: number) =>
    !idle || editingOther(rowId) || hasDraft

  return (
    <Modal footer={null} open={open} onCancel={onCancel} title="编辑标签" width={600} destroyOnClose>
      <Spin spinning={loading}>
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto py-1">
          {rows.map((row) => {
            const isEdit = editingId === row.id
            const saving = busy === `save-${row.id}`
            return (
              <div key={row.id} className="flex items-center gap-2">
                <Input
                  value={isEdit ? buffer : row.name}
                  onChange={(e) => isEdit && setBuffer(e.target.value)}
                  placeholder="标签值名称"
                  maxLength={128}
                  readOnly={!isEdit}
                  tabIndex={isEdit ? undefined : -1}
                  disabled={saving}
                  className={isEdit ? 'flex-1' : 'flex-1 cursor-not-allowed select-none'}
                  onMouseDown={(e) => {
                    if (!isEdit) e.preventDefault()
                  }}
                />
                <Space size={0}>
                  {isEdit
                    ? (
                        <>
                          <Button type="text" icon={<CheckOutlined className="text-green-600" />} loading={saving} onClick={() => saveRow(row)} />
                          <Button type="text" icon={<CloseOutlined className="text-red-500" />} disabled={saving} onClick={() => { setEditingId(null); setBuffer('') }} />
                        </>
                      )
                    : (
                        <Button
                          type="text"
                          icon={<EditOutlined />}
                          disabled={!idle || editingId != null || hasDraft}
                          onClick={() => {
                            setEditingId(row.id)
                            setBuffer(row.name)
                          }}
                        />
                      )}
                  <Popconfirm title="确定删除该标签值？" onConfirm={() => deleteRow(row.id)} okText="确定" cancelText="取消">
                    <Button type="text" danger icon={<DeleteOutlined />} disabled={delBtnDisabled(row.id)} />
                  </Popconfirm>
                </Space>
              </div>
            )
          })}

          {drafts.map((d) => {
            const pending = busy === `new-${d.key}`
            return (
              <div key={d.key} className="flex items-center gap-2">
                <Input
                  value={d.name}
                  onChange={(e) => setDrafts((list) => list.map((x) => (x.key === d.key ? { ...x, name: e.target.value } : x)))}
                  placeholder="新增标签值"
                  maxLength={128}
                  disabled={pending}
                  className="flex-1"
                />
                <Space size={0}>
                  <Button type="text" icon={<CheckOutlined className="text-green-600" />} loading={pending} onClick={() => saveDraft(d.key, d.name)} title="保存" />
                  <Button
                    type="text"
                    icon={<CloseOutlined className="text-red-500" />}
                    disabled={pending}
                    title="取消"
                    onClick={() => setDrafts((list) => list.filter((x) => x.key !== d.key))}
                  />
                </Space>
              </div>
            )
          })}

          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            disabled={loading || classId == null || editingId != null || hasDraft}
            onClick={() => setDrafts((list) => [...list, { key: newDraftKey(), name: '' }])}
            className="mt-1"
          >
            添加标签值
          </Button>
        </div>
      </Spin>
    </Modal>
  )
}
