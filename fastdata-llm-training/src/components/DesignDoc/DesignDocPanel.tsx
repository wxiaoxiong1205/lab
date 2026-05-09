import React, { useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Empty, Input, Popconfirm, Space, Tabs, Tag, Typography } from 'antd'
import {
  CloseOutlined,
  CopyOutlined,
  DeleteOutlined,
  HolderOutlined,
} from '@ant-design/icons'
import type { PageDesignDoc } from '../../docs/pageDocs'

const { Paragraph, Text, Title } = Typography
const { TextArea } = Input

interface RequirementNote {
  id: string
  createdAt: string
  content: string
}

interface RequirementChange {
  id: string
  createdAt: string
  action: string
  detail: string
}

interface DesignDocPanelProps {
  doc: PageDesignDoc
  open: boolean
  onClose: () => void
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function createRequirementNote(content = ''): RequirementNote {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    content,
  }
}

function createRequirementChange(action: string, detail: string): RequirementChange {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    action,
    detail,
  }
}

function buildCopyText(doc: PageDesignDoc, notes: RequirementNote[], changes: RequirementChange[]): string {
  const requirements = notes.length
    ? notes.map((item, index) => `- 需求 ${index + 1} | ${formatTimestamp(item.createdAt)}\n${item.content || '（未填写）'}`).join('\n\n')
    : '- 暂无'
  const recentChanges = changes.length
    ? changes.map(item => `- ${formatTimestamp(item.createdAt)} | ${item.action} | ${item.detail}`).join('\n')
    : '- 暂无'

  return [
    `页面名称：${doc.pageName}`,
    `页面路径：${doc.pagePath}`,
    `所属模块：${doc.module}`,
    `当前状态：${doc.status}`,
    '说明存储：当前浏览器本地保存，不自动同步仓库文件',
    '',
    '需求说明',
    requirements,
    '',
    '最近变更记录',
    recentChanges,
  ].join('\n')
}

async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fallback below.
    }
  }

  if (typeof document === 'undefined') {
    throw new Error('clipboard-unavailable')
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)

  if (!copied) {
    throw new Error('copy-failed')
  }
}

const DesignDocPanel: React.FC<DesignDocPanelProps> = ({ doc, open, onClose }) => {
  const { message } = App.useApp()
  const storageKey = useMemo(() => `design-doc-notes:${doc.pagePath}`, [doc.pagePath])
  const [notes, setNotes] = useState<RequirementNote[]>([])
  const [changes, setChanges] = useState<RequirementChange[]>([])
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const focusContentRef = useRef<Record<string, string>>({})

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      const raw = window.localStorage.getItem(storageKey)

      if (!raw) {
        const initialNotes = [createRequirementNote()]
        setNotes(initialNotes)
        setSavedAt(new Date().toISOString())
        setHydrated(true)
        return
      }

      const parsed = JSON.parse(raw) as { savedAt?: string; notes?: RequirementNote[]; changes?: RequirementChange[] }
      const restoredNotes = parsed.notes?.length ? parsed.notes : [createRequirementNote()]
      setNotes(restoredNotes)
      setChanges(parsed.changes ?? [])
      setSavedAt(parsed.savedAt ?? null)
    } catch {
      setNotes([createRequirementNote()])
      setChanges([])
      setSavedAt(new Date().toISOString())
    } finally {
      setHydrated(true)
    }
  }, [storageKey])

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') {
      return
    }

    const nextSavedAt = new Date().toISOString()
    window.localStorage.setItem(storageKey, JSON.stringify({ savedAt: nextSavedAt, notes, changes }))
    setSavedAt(nextSavedAt)
  }, [changes, hydrated, notes, storageKey])

  const appendChange = (action: string, detail: string) => {
    setChanges(previous => [createRequirementChange(action, detail), ...previous].slice(0, 50))
  }

  const handleAddNote = () => {
    setNotes(previous => {
      const next = [...previous, createRequirementNote()]
      appendChange('新增需求', `新增了需求 ${next.length}`)
      return next
    })
  }

  const handleNoteChange = (id: string, value: string) => {
    setNotes(previous =>
      previous.map(item => (item.id === id ? { ...item, content: value } : item)),
    )
  }

  const handleDeleteNote = (id: string) => {
    setNotes(previous => {
      const targetIndex = previous.findIndex(item => item.id === id)
      const filtered = previous.filter(item => item.id !== id)
      appendChange('删除需求', `删除了需求 ${targetIndex + 1}`)
      return filtered
    })
  }

  const moveNote = (fromId: string, toId: string) => {
    if (fromId === toId) {
      return
    }

    setNotes(previous => {
      const fromIndex = previous.findIndex(item => item.id === fromId)
      const toIndex = previous.findIndex(item => item.id === toId)

      if (fromIndex === -1 || toIndex === -1) {
        return previous
      }

      const next = [...previous]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      appendChange('调整顺序', `将需求 ${fromIndex + 1} 调整到位置 ${toIndex + 1}`)
      return next
    })
  }

  const handleCopy = async () => {
    try {
      await copyToClipboard(buildCopyText(doc, notes, changes))
      message.success('需求文档已复制')
    } catch {
      message.error('复制失败，请检查浏览器权限')
    }
  }

  return (
    <aside className={`design-doc-panel ${open ? 'design-doc-panel--open' : ''}`}>
      <div className="design-doc-panel__header">
        <div className="design-doc-panel__header-main">
          <div>
            <Title level={4} className="design-doc-panel__title">
              {doc.pageName}
            </Title>
          </div>
        </div>

        <Space size={8}>
          <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>
            复制
          </Button>
          <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} />
        </Space>
      </div>

      <Tabs
        className="design-doc-panel__tabs"
        items={[
          {
            key: 'requirements',
            label: '需求说明',
            children: (
              <div className="design-doc-panel__content">
                <section className="design-doc-section">
                  <div className="design-doc-section__label">页面基线</div>
                  <div className="design-doc-card">
                    <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                      <div>
                        <Text type="secondary">页面目标</Text>
                        <Paragraph style={{ marginBottom: 0 }}>{doc.goal}</Paragraph>
                      </div>
                      {doc.structure.length ? (
                        <div>
                          <Text type="secondary">页面结构</Text>
                          <div style={{ marginTop: 8 }}>
                            <Space size={[6, 6]} wrap>
                              {doc.structure.map(item => (
                                <Tag key={item} color="blue">
                                  {item}
                                </Tag>
                              ))}
                            </Space>
                          </div>
                        </div>
                      ) : null}
                      {doc.interactionNotes.length ? (
                        <div>
                          <Text type="secondary">交互说明</Text>
                          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                            {doc.interactionNotes.map(item => (
                              <li key={item}>
                                <Text>{item}</Text>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </Space>
                  </div>
                </section>

                <section className="design-doc-section">
                  <div className="design-doc-section__header">
                    <Space size={8}>
                      <Text type="secondary" className="design-doc-save-hint">
                        {savedAt ? `自动保存于 ${formatTimestamp(savedAt)}` : '本地保存'}
                      </Text>
                      <Button type="primary" size="small" onClick={handleAddNote}>
                        添加需求
                      </Button>
                    </Space>
                  </div>

                  {notes.length ? (
                    notes.map((note, index) => (
                      <div
                        key={note.id}
                        className={`design-doc-card design-doc-card--editor ${draggingId === note.id ? 'design-doc-card--dragging' : ''}`}
                        onDragOver={event => {
                          event.preventDefault()
                          event.dataTransfer.dropEffect = 'move'
                        }}
                        onDrop={event => {
                          event.preventDefault()
                          const fromId = event.dataTransfer.getData('text/plain')

                          if (fromId) {
                            moveNote(fromId, note.id)
                          }

                          setDraggingId(null)
                        }}
                      >
                        <div className="design-doc-card__row">
                          <div className="design-doc-card__title-group">
                            <Button
                              type="text"
                              size="small"
                              icon={<HolderOutlined />}
                              draggable
                              className="design-doc-drag-handle"
                              onDragStart={event => {
                                event.dataTransfer.setData('text/plain', note.id)
                                event.dataTransfer.effectAllowed = 'move'
                                setDraggingId(note.id)
                              }}
                              onDragEnd={() => setDraggingId(null)}
                            />
                            <Text strong>需求 {index + 1}</Text>
                          </div>
                          <Space size={8}>
                            <Tag color="default">{formatTimestamp(note.createdAt)}</Tag>
                            <Popconfirm
                              title="确认删除这条需求吗？"
                              description="删除后将从当前浏览器本地记录中移除。"
                              okText="删除"
                              cancelText="取消"
                              okButtonProps={{ danger: true }}
                              onConfirm={() => handleDeleteNote(note.id)}
                            >
                              <Button
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                              />
                            </Popconfirm>
                          </Space>
                        </div>
                        <TextArea
                          value={note.content}
                          onChange={event => handleNoteChange(note.id, event.target.value)}
                          onFocus={() => {
                            focusContentRef.current[note.id] = note.content
                          }}
                          onBlur={() => {
                            const original = focusContentRef.current[note.id] ?? ''
                            if (original !== note.content) {
                              appendChange('编辑需求', `更新了需求 ${index + 1} 的内容`)
                              focusContentRef.current[note.id] = note.content
                            }
                          }}
                          autoSize={{ minRows: 5, maxRows: 12 }}
                          placeholder="在这里记录当前页面的需求说明、字段调整、交互要求、补充说明等。"
                          className="design-doc-textarea"
                        />
                      </div>
                    ))
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="点击“添加需求”开始记录" />
                  )}
                </section>
              </div>
            ),
          },
          {
            key: 'changes',
            label: '变更记录',
            children: (
              <div className="design-doc-panel__content">
                <section className="design-doc-section">
                  <div className="design-doc-section__label">最近变更记录</div>
                  {changes.length ? (
                    changes.map(change => (
                      <div key={change.id} className="design-doc-card">
                        <div className="design-doc-card__row">
                          <Text strong>{change.action}</Text>
                          <Tag color="default">{formatTimestamp(change.createdAt)}</Tag>
                        </div>
                        <Paragraph style={{ marginBottom: 0 }}>{change.detail}</Paragraph>
                      </div>
                    ))
                  ) : (
                    <Paragraph type="secondary">当前还没有变更记录。只有你实际新增、编辑、删除或拖拽需求后，这里才会出现内容。</Paragraph>
                  )}
                </section>
              </div>
            ),
          },
        ]}
      />
    </aside>
  )
}

export default DesignDocPanel
