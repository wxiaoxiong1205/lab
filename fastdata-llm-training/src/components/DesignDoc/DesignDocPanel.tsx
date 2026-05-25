import React, { useEffect, useMemo, useRef, useState } from 'react'
import { App, Button, Empty, Input, Popconfirm, Space, Tabs, Tag, Typography } from 'antd'
import {
  CloseOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  HolderOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import type { PageDesignDoc } from '../../docs/pageDocs'

const { Paragraph, Text, Title } = Typography
const { TextArea } = Input
const DESIGN_DOC_STORAGE_PREFIX = 'design-doc-notes:'
const GLOBAL_VERSION_STORAGE_KEY = 'design-doc-requirement-versions'

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

interface RequirementVersionMeta {
  id: string
  name: string
  createdAt: string
}

interface RequirementVersion extends RequirementVersionMeta {
  notes: RequirementNote[]
}

interface StoredDesignDocNotes {
  savedAt?: string
  notes?: RequirementNote[]
  versions?: RequirementVersion[]
  activeVersionId?: string
  changes?: RequirementChange[]
}

interface StoredGlobalRequirementVersions {
  savedAt?: string
  versions?: RequirementVersionMeta[]
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

function createSeedRequirementNote(content: string, createdAt?: string): RequirementNote {
  return {
    ...createRequirementNote(content),
    createdAt: createdAt ?? new Date().toISOString(),
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

function createRequirementVersionMeta(name: string): RequirementVersionMeta {
  return {
    id: `version-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name,
    createdAt: new Date().toISOString(),
  }
}

function createRequirementVersion(name: string, notes: RequirementNote[] = [createRequirementNote()]): RequirementVersion {
  return {
    ...createRequirementVersionMeta(name),
    notes,
  }
}

function toVersionMeta(version: RequirementVersion): RequirementVersionMeta {
  return {
    id: version.id,
    name: version.name,
    createdAt: version.createdAt,
  }
}

function normalizeVersionMeta(version: Partial<RequirementVersionMeta>, index: number): RequirementVersionMeta {
  return {
    id: version.id || `version-global-${index + 1}`,
    name: version.name || `V${index + 1}`,
    createdAt: version.createdAt || new Date().toISOString(),
  }
}

function mergeVersionMetas(...groups: RequirementVersionMeta[][]): RequirementVersionMeta[] {
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  const merged: RequirementVersionMeta[] = []

  groups.flat().forEach((version, index) => {
    const normalized = normalizeVersionMeta(version, index)
    const nameKey = normalized.name.trim().toLowerCase()

    if (seenIds.has(normalized.id) || seenNames.has(nameKey)) {
      return
    }

    seenIds.add(normalized.id)
    seenNames.add(nameKey)
    merged.push(normalized)
  })

  return merged
}

function isSameVersion(target: Pick<RequirementVersionMeta, 'id' | 'name'>, candidate: Pick<RequirementVersionMeta, 'id' | 'name'>): boolean {
  return target.id === candidate.id
    || target.name.trim().toLowerCase() === candidate.name.trim().toLowerCase()
}

function getReorderedVersions(versions: RequirementVersion[], fromIndex: number, toIndex: number): RequirementVersion[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= versions.length || toIndex >= versions.length) {
    return versions
  }

  const next = [...versions]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

function hydrateVersionsFromGlobalMetas(
  globalMetas: RequirementVersionMeta[],
  pageVersions: RequirementVersion[],
): RequirementVersion[] {
  const pageById = new Map(pageVersions.map(version => [version.id, version]))
  const pageByName = new Map(pageVersions.map(version => [version.name.trim().toLowerCase(), version]))

  return globalMetas.map((meta, index) => {
    const matchedPageVersion = pageById.get(meta.id) ?? pageByName.get(meta.name.trim().toLowerCase()) ?? pageVersions[index]

    return {
      ...meta,
      notes: matchedPageVersion?.notes ?? [],
    }
  })
}

function normalizeStoredNotes(parsed?: StoredDesignDocNotes): {
  versions: RequirementVersion[]
  activeVersionId: string | null
  changes: RequirementChange[]
  savedAt: string | null
} {
  if (parsed?.versions?.length) {
    const versions = parsed.versions.map((version, index) => ({
      ...version,
      name: version.name || `V${index + 1}`,
      createdAt: version.createdAt || parsed.savedAt || new Date().toISOString(),
      notes: version.notes ?? [],
    }))
    const activeVersionId = versions.some(version => version.id === parsed.activeVersionId)
      ? parsed.activeVersionId!
      : versions[0].id

    return {
      versions,
      activeVersionId,
      changes: parsed.changes ?? [],
      savedAt: parsed.savedAt ?? null,
    }
  }

  const legacyNotes = parsed?.notes?.length ? parsed.notes : [createRequirementNote()]
  const legacyVersion = createRequirementVersion('V1', legacyNotes)

  return {
    versions: [legacyVersion],
    activeVersionId: legacyVersion.id,
    changes: parsed?.changes ?? [],
    savedAt: parsed?.savedAt ?? null,
  }
}

function normalizeStoredGlobalVersions(parsed?: StoredGlobalRequirementVersions): RequirementVersionMeta[] {
  if (!parsed?.versions?.length) {
    return []
  }

  return mergeVersionMetas(parsed.versions.map(normalizeVersionMeta))
}

function hasMeaningfulNotes(notes: RequirementNote[]): boolean {
  return notes.some(note => note.content.trim())
}

function applyDefaultRequirements(doc: PageDesignDoc, versions: RequirementVersion[]): RequirementVersion[] {
  if (!doc.defaultRequirements?.length) {
    return versions
  }

  const nextVersions = [...versions]

  doc.defaultRequirements.forEach(requirement => {
    const versionName = requirement.version.trim() || 'V1'
    const existingIndex = nextVersions.findIndex(version => version.name.trim().toLowerCase() === versionName.toLowerCase())
    const seededNote = createSeedRequirementNote(requirement.content, requirement.createdAt)

    if (existingIndex >= 0) {
      const existing = nextVersions[existingIndex]

      if (!hasMeaningfulNotes(existing.notes)) {
        nextVersions[existingIndex] = {
          ...existing,
          notes: [seededNote],
        }
      }

      return
    }

    nextVersions.push(createRequirementVersion(versionName, [seededNote]))
  })

  return nextVersions
}

function isBlankDefaultVersion(version: RequirementVersion, versionCount: number): boolean {
  return versionCount === 1
    && /^V\d+$/.test(version.name)
    && version.notes.length <= 1
    && version.notes.every(note => !note.content.trim())
}

function collectStoredPageVersionMetas(storage: Storage): RequirementVersionMeta[] {
  const meaningfulMetas: RequirementVersionMeta[] = []
  const fallbackMetas: RequirementVersionMeta[] = []

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)

    if (!key?.startsWith(DESIGN_DOC_STORAGE_PREFIX)) {
      continue
    }

    try {
      const raw = storage.getItem(key)
      const parsed = raw ? JSON.parse(raw) as StoredDesignDocNotes : undefined
      const normalized = normalizeStoredNotes(parsed)

      normalized.versions.forEach(version => {
        if (isBlankDefaultVersion(version, normalized.versions.length)) {
          fallbackMetas.push(toVersionMeta(version))
          return
        }

        meaningfulMetas.push(toVersionMeta(version))
      })
    } catch {
      // Ignore malformed local entries; the current page still has its fallback path.
    }
  }

  return mergeVersionMetas(meaningfulMetas.length ? meaningfulMetas : fallbackMetas)
}

function removeVersionFromStoredPages(storage: Storage, deletedVersion: RequirementVersionMeta): void {
  const updatedAt = new Date().toISOString()

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)

    if (!key?.startsWith(DESIGN_DOC_STORAGE_PREFIX)) {
      continue
    }

    try {
      const raw = storage.getItem(key)
      const parsed = raw ? JSON.parse(raw) as StoredDesignDocNotes : undefined
      const normalized = normalizeStoredNotes(parsed)
      const nextVersions = normalized.versions.filter(version => !isSameVersion(deletedVersion, version))
      const nextActiveVersionId = nextVersions.some(version => version.id === normalized.activeVersionId)
        ? normalized.activeVersionId
        : nextVersions[0]?.id ?? null

      storage.setItem(key, JSON.stringify({
        ...parsed,
        savedAt: updatedAt,
        versions: nextVersions,
        activeVersionId: nextActiveVersionId,
        changes: parsed?.changes ?? [],
      }))
    } catch {
      // Ignore malformed local entries; deletion still applies to the current in-memory state.
    }
  }
}

function buildCopyText(doc: PageDesignDoc, versions: RequirementVersion[], changes: RequirementChange[]): string {
  const requirements = versions.length
    ? versions.map(version => {
      const versionNotes = version.notes.length
        ? version.notes.map((item, index) => `- 需求 ${index + 1} | ${formatTimestamp(item.createdAt)}\n${item.content || '（未填写）'}`).join('\n\n')
        : '- 暂无'

      return `## ${version.name}\n${versionNotes}`
    }).join('\n\n')
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
      const raw = window.localStorage.getItem(storageKey)
      const rawGlobal = window.localStorage.getItem(GLOBAL_VERSION_STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) as StoredDesignDocNotes : undefined
      const parsedGlobal = rawGlobal ? JSON.parse(rawGlobal) as StoredGlobalRequirementVersions : undefined
      const normalized = raw
        ? normalizeStoredNotes(parsed)
        : { versions: [], activeVersionId: null, changes: [], savedAt: null }
      const globalMetas = normalizeStoredGlobalVersions(parsedGlobal)
      const effectiveGlobalMetas = globalMetas.length ? globalMetas : collectStoredPageVersionMetas(window.localStorage)
      const pageMetas = globalMetas.length
        ? normalized.versions.slice(globalMetas.length).map(toVersionMeta)
        : normalized.versions.map(toVersionMeta)
      const mergedMetas = mergeVersionMetas(effectiveGlobalMetas, pageMetas)
      const baseVersions = mergedMetas.length
        ? hydrateVersionsFromGlobalMetas(mergedMetas, normalized.versions)
        : [createRequirementVersion('V1')]
      const nextVersions = applyDefaultRequirements(doc, baseVersions)
      const activeVersionName = normalized.versions.find(version => version.id === normalized.activeVersionId)?.name
      const nextActiveVersionId = nextVersions.find(version => version.id === normalized.activeVersionId)?.id
        ?? nextVersions.find(version => version.name === activeVersionName)?.id
        ?? nextVersions[0]?.id
        ?? null

      setVersions(nextVersions)
      setActiveVersionId(nextActiveVersionId)
      setChanges(normalized.changes)
      setSavedAt(normalized.savedAt ?? new Date().toISOString())
    } catch {
      const fallbackVersion = createRequirementVersion('V1')
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

    const nextSavedAt = new Date().toISOString()
    window.localStorage.setItem(GLOBAL_VERSION_STORAGE_KEY, JSON.stringify({
      savedAt: nextSavedAt,
      versions: versions.map(toVersionMeta),
    }))
    window.localStorage.setItem(storageKey, JSON.stringify({
      savedAt: nextSavedAt,
      versions,
      activeVersionId,
      changes,
    }))
    setSavedAt(nextSavedAt)
  }, [activeVersionId, changes, hydratedStorageKey, storageKey, versions])

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
    const nextVersion = createRequirementVersion(`V${versions.length + 1}`)
    setVersions(previous => [...previous, nextVersion])
    setActiveVersionId(nextVersion.id)
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

    if (nextName !== currentVersion.name) {
      setVersions(previous =>
        previous.map(version =>
          version.id === editingVersionId ? { ...version, name: nextName } : version,
        ),
      )
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
                                  onClick={() => setActiveVersionId(version.id)}
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
                          autoSize={{ minRows: 5, maxRows: 12 }}
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
