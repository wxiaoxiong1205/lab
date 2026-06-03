import React, { useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Empty, Input, Popconfirm, Segmented, Space, Tabs, Tag, Typography } from 'antd'
import {
  CloseOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  HolderOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import type { PageDesignDoc } from '../../docs/pageDocs'
import {
  buildCopyText,
  createRequirementChange,
  createDefaultRequirementVersion,
  createRequirementNote,
  createRequirementVersion,
  findVersionByName,
  formatTimestamp,
  getDesignDocStorageKey,
  getReorderedVersions,
  isSameVersion,
  loadDesignDocState,
  persistDesignDocState,
  removeVersionFromStoredPages,
  type RequirementChange,
  type RequirementNote,
  type RequirementVersion,
} from './designDocStorage'

const { Paragraph, Text, Title } = Typography
const { TextArea } = Input

interface DesignDocPanelProps {
  doc: PageDesignDoc
  open: boolean
  onClose: () => void
  displayMode?: 'side' | 'fullscreen'
  onDisplayModeChange?: (mode: 'side' | 'fullscreen') => void
  activeVersionName?: string | null
  onActiveVersionChange?: (versionName: string) => void
  docScope?: 'page' | 'global'
  onDocScopeChange?: (scope: 'page' | 'global') => void
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

function getNextRequirementVersionName(versions: RequirementVersion[]): string {
  const existingNames = new Set(versions.map(version => version.name.trim().toLowerCase()))
  const numericVersions = versions
    .map(version => version.name.trim().match(/^V(\d+)(?:\.(\d+))?$/i))
    .filter(Boolean)
    .map(match => {
      const major = Number(match![1])
      const minor = match![2] === undefined ? null : Number(match![2])
      return { major, minor }
    })

  const decimalVersions = numericVersions.filter(version => version.minor !== null)

  if (decimalVersions.length) {
    const maxVersion = decimalVersions.reduce((max, version) => {
      if (version.major > max.major) return version
      if (version.major === max.major && (version.minor ?? 0) > (max.minor ?? 0)) return version
      return max
    }, decimalVersions[0])
    const prefix = `V${maxVersion.major}.`
    let nextMinor = (maxVersion.minor ?? 0) + 1
    while (existingNames.has(`${prefix}${nextMinor}`.toLowerCase())) {
      nextMinor += 1
    }
    return `${prefix}${nextMinor}`
  }

  let nextMajor = numericVersions.length
    ? Math.max(...numericVersions.map(version => version.major)) + 1
    : versions.length + 1
  while (existingNames.has(`v${nextMajor}`)) {
    nextMajor += 1
  }
  return `V${nextMajor}`
}

const DesignDocPanel: React.FC<DesignDocPanelProps> = ({
  doc,
  open,
  onClose,
  displayMode = 'side',
  onDisplayModeChange,
  activeVersionName,
  onActiveVersionChange,
  docScope = 'page',
  onDocScopeChange,
}) => {
  const { message } = App.useApp()
  const storageKey = useMemo(() => getDesignDocStorageKey(doc.pagePath), [doc.pagePath])
  const [versions, setVersions] = useState<RequirementVersion[]>([])
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null)
  const [changes, setChanges] = useState<RequirementChange[]>([])
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [draggingVersionId, setDraggingVersionId] = useState<string | null>(null)
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null)
  const [versionNameDraft, setVersionNameDraft] = useState('')
  const focusContentRef = useRef<Record<string, string>>({})
  const skipVersionCommitRef = useRef(false)

  const activeVersion = useMemo(
    () => versions.find(version => version.id === activeVersionId) ?? versions[0],
    [activeVersionId, versions],
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    setHydratedStorageKey(null)

    try {
      const nextState = loadDesignDocState(doc, window.localStorage)
      const nextActiveVersionId = nextState.versions.find(version => version.id === nextState.activeVersionId)?.id
        ?? nextState.versions[0]?.id
        ?? null

      setVersions(nextState.versions)
      setActiveVersionId(nextActiveVersionId)
      setChanges(nextState.changes)
      setSavedAt(nextState.savedAt)
    } catch {
      const fallbackVersion = createDefaultRequirementVersion()
      setVersions([fallbackVersion])
      setActiveVersionId(fallbackVersion.id)
      setChanges([])
      setSavedAt(new Date().toISOString())
    } finally {
      setHydratedStorageKey(storageKey)
    }
  }, [storageKey])

  useEffect(() => {
    if (hydratedStorageKey !== storageKey || typeof window === 'undefined') {
      return
    }

    const nextSavedAt = persistDesignDocState(window.localStorage, storageKey, versions, activeVersionId, changes)
    setSavedAt(nextSavedAt)
    window.dispatchEvent(new Event('design-doc-updated'))
  }, [activeVersionId, changes, hydratedStorageKey, storageKey, versions])

  useEffect(() => {
    if (!activeVersionName) {
      return
    }

    const targetVersion = findVersionByName(versions, activeVersionName)
    if (targetVersion && targetVersion.id !== activeVersionId) {
      setActiveVersionId(targetVersion.id)
    }
  }, [activeVersionId, activeVersionName, versions])

  const handleSelectVersion = (version: RequirementVersion) => {
    setActiveVersionId(version.id)
    onActiveVersionChange?.(version.name)
  }

  const appendChange = (action: string, detail: string) => {
    setChanges(previous => [createRequirementChange(action, detail), ...previous].slice(0, 50))
  }

  const updateActiveVersionNotes = (updater: (notes: RequirementNote[]) => RequirementNote[]) => {
    if (!activeVersion) {
      return
    }

    setVersions(previous =>
      previous.map(version =>
        version.id === activeVersion.id ? { ...version, notes: updater(version.notes) } : version,
      ),
    )
  }

  const handleAddVersion = () => {
    const nextVersion = createRequirementVersion(getNextRequirementVersionName(versions))
    setVersions(previous => [...previous, nextVersion])
    setActiveVersionId(nextVersion.id)
    onActiveVersionChange?.(nextVersion.name)
    appendChange('新增版本', `新增了需求版本 ${nextVersion.name}`)
  }

  const handleStartEditVersion = (version: RequirementVersion) => {
    skipVersionCommitRef.current = false
    setActiveVersionId(version.id)
    setEditingVersionId(version.id)
    setVersionNameDraft(version.name)
  }

  const handleCancelEditVersion = () => {
    skipVersionCommitRef.current = true
    setEditingVersionId(null)
    setVersionNameDraft('')
  }

  const handleCommitVersionName = () => {
    if (skipVersionCommitRef.current) {
      skipVersionCommitRef.current = false
      return
    }

    if (!editingVersionId) {
      return
    }

    const currentVersion = versions.find(version => version.id === editingVersionId)
    const nextName = versionNameDraft.trim()

    if (!currentVersion) {
      handleCancelEditVersion()
      return
    }

    if (!nextName) {
      message.warning('版本名称不能为空')
      setVersionNameDraft(currentVersion.name)
      handleCancelEditVersion()
      return
    }

    const duplicateVersion = versions.some(version =>
      version.id !== editingVersionId && version.name.trim().toLowerCase() === nextName.toLowerCase(),
    )

    if (duplicateVersion) {
      message.warning('版本名称不能重复')
      setVersionNameDraft(currentVersion.name)
      handleCancelEditVersion()
      return
    }

    if (nextName !== currentVersion.name) {
      setVersions(previous =>
        previous.map(version =>
          version.id === editingVersionId ? { ...version, name: nextName } : version,
        ),
      )
      onActiveVersionChange?.(nextName)
      appendChange('编辑版本', `将需求版本 ${currentVersion.name} 修改为 ${nextName}`)
    }

    handleCancelEditVersion()
  }

  const moveVersion = (fromId: string, toId: string) => {
    if (fromId === toId) {
      return
    }

    const fromIndex = versions.findIndex(item => item.id === fromId)
    const toIndex = versions.findIndex(item => item.id === toId)

    if (fromIndex === -1 || toIndex < 0 || toIndex >= versions.length) {
      return
    }

    const movedVersion = versions[fromIndex]
    setVersions(previous => getReorderedVersions(previous, fromIndex, toIndex))
    setActiveVersionId(movedVersion.id)
    onActiveVersionChange?.(movedVersion.name)
    appendChange('调整版本顺序', `将需求版本 ${movedVersion.name} 调整到位置 ${toIndex + 1}`)
  }

  const handleDeleteVersion = (version: RequirementVersion) => {
    if (versions.length <= 1) {
      message.warning('至少保留一个需求版本')
      return
    }

    if (typeof window !== 'undefined') {
      removeVersionFromStoredPages(window.localStorage, version)
    }

    const currentIndex = versions.findIndex(item => item.id === version.id)
    const nextVersions = versions.filter(item => !isSameVersion(version, item))
    const nextActiveVersion = version.id === activeVersion?.id
      ? nextVersions[Math.max(0, currentIndex - 1)] ?? nextVersions[0]
      : activeVersion

    setVersions(nextVersions)
    setActiveVersionId(nextActiveVersion?.id ?? nextVersions[0]?.id ?? null)
    if (nextActiveVersion?.name ?? nextVersions[0]?.name) {
      onActiveVersionChange?.(nextActiveVersion?.name ?? nextVersions[0].name)
    }
    appendChange('删除版本', `删除了需求版本 ${version.name}，并同步移除各页面该版本下的需求说明`)
  }

  const handleAddNote = () => {
    if (!activeVersion) {
      return
    }

    const nextIndex = activeVersion.notes.length + 1
    updateActiveVersionNotes(previous => [...previous, createRequirementNote()])
    appendChange('新增需求', `在 ${activeVersion.name} 新增了需求 ${nextIndex}`)
  }

  const handleNoteChange = (id: string, value: string) => {
    updateActiveVersionNotes(previous =>
      previous.map(item => (item.id === id ? { ...item, content: value } : item)),
    )
  }

  const handleDeleteNote = (id: string) => {
    if (!activeVersion) {
      return
    }

    updateActiveVersionNotes(previous => {
      const targetIndex = previous.findIndex(item => item.id === id)
      const filtered = previous.filter(item => item.id !== id)
      appendChange('删除需求', `删除了 ${activeVersion.name} 的需求 ${targetIndex + 1}`)
      return filtered
    })
  }

  const moveNote = (fromId: string, toId: string) => {
    if (fromId === toId) {
      return
    }

    if (!activeVersion) {
      return
    }

    updateActiveVersionNotes(previous => {
      const fromIndex = previous.findIndex(item => item.id === fromId)
      const toIndex = previous.findIndex(item => item.id === toId)

      if (fromIndex === -1 || toIndex === -1) {
        return previous
      }

      const next = [...previous]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      appendChange('调整顺序', `将 ${activeVersion.name} 的需求 ${fromIndex + 1} 调整到位置 ${toIndex + 1}`)
      return next
    })
  }

  const handleCopy = async () => {
    try {
      await copyToClipboard(buildCopyText(doc, versions, changes))
      message.success('需求文档已复制')
    } catch {
      message.error('复制失败，请检查浏览器权限')
    }
  }

  const isFullscreen = displayMode === 'fullscreen'

  return (
    <aside className={`design-doc-panel ${open ? 'design-doc-panel--open' : ''} ${isFullscreen ? 'design-doc-panel--fullscreen' : ''}`}>
      <div className="design-doc-panel__header">
        <div className="design-doc-panel__header-main">
          <div>
            <Title level={4} className="design-doc-panel__title">
              {doc.pageName}
            </Title>
            <div className="design-doc-panel__module">
              {doc.module}
            </div>
          </div>
        </div>

        <Space size={8}>
          {onDocScopeChange ? (
            <Segmented
              size="small"
              value={docScope}
              options={[
                { label: '当前页面', value: 'page' },
                { label: '全局模块', value: 'global' },
              ]}
              onChange={value => onDocScopeChange(value as 'page' | 'global')}
            />
          ) : null}
          <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>
            复制
          </Button>
          {onDisplayModeChange ? (
            <Button
              size="small"
              aria-label={isFullscreen ? '退出全屏' : '全屏展示'}
              icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={() => onDisplayModeChange(isFullscreen ? 'side' : 'fullscreen')}
            >
              {isFullscreen ? '退出全屏' : '全屏展示'}
            </Button>
          ) : null}
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

                  <div className="design-doc-version-tabs">
                    <div className="design-doc-version-tabs__list">
                      {versions.map(version => {
                        const isActive = version.id === activeVersion?.id
                        const isEditing = version.id === editingVersionId
                        const canDelete = versions.length > 1

                        return (
                          <div
                            key={version.id}
                            className={`design-doc-version-tab-wrap ${isActive ? 'design-doc-version-tab-wrap--active' : ''} ${isEditing ? 'design-doc-version-tab-wrap--editing' : ''} ${draggingVersionId === version.id ? 'design-doc-version-tab-wrap--dragging' : ''}`}
                            draggable={!isEditing}
                            onDragStart={event => {
                              event.dataTransfer.setData('text/plain', version.id)
                              event.dataTransfer.effectAllowed = 'move'
                              setDraggingVersionId(version.id)
                            }}
                            onDragOver={event => {
                              event.preventDefault()
                              event.dataTransfer.dropEffect = 'move'
                            }}
                            onDrop={event => {
                              event.preventDefault()
                              const fromId = draggingVersionId ?? event.dataTransfer.getData('text/plain')

                              if (fromId) {
                                moveVersion(fromId, version.id)
                              }

                              setDraggingVersionId(null)
                            }}
                            onDragEnd={() => setDraggingVersionId(null)}
                          >
                            {isEditing ? (
                              <Input
                                size="small"
                                autoFocus
                                maxLength={24}
                                value={versionNameDraft}
                                className="design-doc-version-input"
                                onChange={event => setVersionNameDraft(event.target.value)}
                                onBlur={handleCommitVersionName}
                                onPressEnter={event => event.currentTarget.blur()}
                                onKeyDown={event => {
                                  if (event.key === 'Escape') {
                                    handleCancelEditVersion()
                                    event.currentTarget.blur()
                                  }
                                }}
                              />
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className={`design-doc-version-tab ${isActive ? 'design-doc-version-tab--active' : ''}`}
                                  onClick={() => handleSelectVersion(version)}
                                  onDoubleClick={() => handleStartEditVersion(version)}
                                >
                                  <span>{version.name}</span>
                                  <em>{version.notes.length}</em>
                                </button>
                                <span className="design-doc-version-actions">
                                  <button
                                    type="button"
                                    className="design-doc-version-action"
                                    aria-label={`编辑 ${version.name}`}
                                    onClick={event => {
                                      event.stopPropagation()
                                      handleStartEditVersion(version)
                                    }}
                                  >
                                    <EditOutlined />
                                  </button>
                                  {canDelete ? (
                                    <Popconfirm
                                      title="确认删除这个版本吗？"
                                      description="删除后会同步移除所有页面中该版本下的需求说明，无法从当前界面恢复。"
                                      okText="删除"
                                      cancelText="取消"
                                      okButtonProps={{ danger: true }}
                                      onConfirm={() => handleDeleteVersion(version)}
                                    >
                                      <button
                                        type="button"
                                        className="design-doc-version-action design-doc-version-action--danger"
                                        aria-label={`删除 ${version.name}`}
                                      >
                                        <DeleteOutlined />
                                      </button>
                                    </Popconfirm>
                                  ) : null}
                                </span>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <Button
                      size="small"
                      type="text"
                      icon={<PlusOutlined />}
                      className="design-doc-version-add"
                      onClick={handleAddVersion}
                    >
                      新增版本
                    </Button>
                  </div>

                  {activeVersion?.notes.length ? (
                    activeVersion.notes.map((note, index) => (
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
                              appendChange('编辑需求', `更新了 ${activeVersion.name} 的需求 ${index + 1} 内容`)
                              focusContentRef.current[note.id] = note.content
                            }
                          }}
                          autoSize={{ minRows: isFullscreen ? 10 : 5, maxRows: isFullscreen ? 22 : 12 }}
                          placeholder="在这里记录当前页面的需求说明、字段调整、交互要求、补充说明等。"
                          className="design-doc-textarea"
                        />
                      </div>
                    ))
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="点击“添加需求”开始记录当前版本" />
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
