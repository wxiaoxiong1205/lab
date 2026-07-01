import type { PageDesignDoc } from '../../docs/pageDocs'

export const DESIGN_DOC_STORAGE_PREFIX = 'design-doc-notes:'
export const GLOBAL_VERSION_STORAGE_KEY = 'design-doc-requirement-versions'
export const DEFAULT_REQUIREMENT_VERSION = 'V1.14'

export interface RequirementNote {
  id: string
  createdAt: string
  content: string
}

export interface RequirementChange {
  id: string
  createdAt: string
  action: string
  detail: string
}

export interface RequirementVersionMeta {
  id: string
  name: string
  createdAt: string
}

export interface RequirementVersion extends RequirementVersionMeta {
  notes: RequirementNote[]
}

export interface StoredDesignDocNotes {
  savedAt?: string
  notes?: RequirementNote[]
  versions?: RequirementVersion[]
  activeVersionId?: string
  changes?: RequirementChange[]
}

export interface StoredGlobalRequirementVersions {
  savedAt?: string
  versions?: RequirementVersionMeta[]
}

export interface HydratedDesignDocState {
  versions: RequirementVersion[]
  activeVersionId: string | null
  changes: RequirementChange[]
  savedAt: string | null
}

export function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function createRequirementNote(content = ''): RequirementNote {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    content,
  }
}

export function createSeedRequirementNote(content: string, createdAt?: string): RequirementNote {
  return {
    ...createRequirementNote(content),
    createdAt: createdAt ?? new Date().toISOString(),
  }
}

export function createRequirementChange(action: string, detail: string): RequirementChange {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    action,
    detail,
  }
}

export function createRequirementVersionMeta(name: string): RequirementVersionMeta {
  return {
    id: `version-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name,
    createdAt: new Date().toISOString(),
  }
}

export function createRequirementVersion(name: string, notes: RequirementNote[] = [createRequirementNote()]): RequirementVersion {
  return {
    ...createRequirementVersionMeta(name),
    notes,
  }
}

export function createDefaultRequirementVersion(notes: RequirementNote[] = [createRequirementNote()]): RequirementVersion {
  return createRequirementVersion(DEFAULT_REQUIREMENT_VERSION, notes)
}

export function toVersionMeta(version: RequirementVersion): RequirementVersionMeta {
  return {
    id: version.id,
    name: version.name,
    createdAt: version.createdAt,
  }
}

export function normalizeVersionMeta(version: Partial<RequirementVersionMeta>, index: number): RequirementVersionMeta {
  return {
    id: version.id || `version-global-${index + 1}`,
    name: version.name || `V${index + 1}`,
    createdAt: version.createdAt || new Date().toISOString(),
  }
}

export function mergeVersionMetas(...groups: RequirementVersionMeta[][]): RequirementVersionMeta[] {
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

export function isSameVersion(target: Pick<RequirementVersionMeta, 'id' | 'name'>, candidate: Pick<RequirementVersionMeta, 'id' | 'name'>): boolean {
  return target.id === candidate.id
    || target.name.trim().toLowerCase() === candidate.name.trim().toLowerCase()
}

export function getReorderedVersions(versions: RequirementVersion[], fromIndex: number, toIndex: number): RequirementVersion[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= versions.length || toIndex >= versions.length) {
    return versions
  }

  const next = [...versions]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

export function hydrateVersionsFromGlobalMetas(
  globalMetas: RequirementVersionMeta[],
  pageVersions: RequirementVersion[],
): RequirementVersion[] {
  const pageById = new Map(pageVersions.map(version => [version.id, version]))
  const pageByName = new Map(pageVersions.map(version => [version.name.trim().toLowerCase(), version]))

  return globalMetas.map((meta) => {
    const matchedPageVersion = pageById.get(meta.id) ?? pageByName.get(meta.name.trim().toLowerCase())

    return {
      ...meta,
      notes: matchedPageVersion?.notes ?? [],
    }
  })
}

export function normalizeStoredNotes(parsed?: StoredDesignDocNotes): HydratedDesignDocState {
  if (parsed?.versions?.length) {
    const effectiveVersions = parsed.versions.map((version, index) => ({
      ...version,
      name: version.name || `V${index + 1}`,
      createdAt: version.createdAt || parsed.savedAt || new Date().toISOString(),
      notes: version.notes ?? [],
    }))
    const activeVersionId = effectiveVersions.some(version => version.id === parsed.activeVersionId)
      ? parsed.activeVersionId!
      : effectiveVersions[0].id

    return {
      versions: effectiveVersions,
      activeVersionId,
      changes: parsed.changes ?? [],
      savedAt: parsed.savedAt ?? null,
    }
  }

  const legacyVersion = createDefaultRequirementVersion(parsed?.notes ?? [])

  return {
    versions: [legacyVersion],
    activeVersionId: legacyVersion.id,
    changes: parsed?.changes ?? [],
    savedAt: parsed?.savedAt ?? null,
  }
}

export function normalizeStoredGlobalVersions(parsed?: StoredGlobalRequirementVersions): RequirementVersionMeta[] {
  if (!parsed?.versions?.length) {
    return []
  }

  return mergeVersionMetas(parsed.versions.map(normalizeVersionMeta))
}

export function hasMeaningfulNotes(notes: RequirementNote[]): boolean {
  return notes.some(note => note.content.trim())
}

export function getMeaningfulNotes(notes: RequirementNote[]): RequirementNote[] {
  return notes.filter(note => note.content.trim())
}

function getRequirementIdentity(content: string): string {
  return content
    .split('\n')
    .map(line => line.trim())
    .find(line => line.startsWith('#'))
    ?.replace(/^#+\s*/, '')
    .trim()
    .toLowerCase()
    || content.trim().slice(0, 80).toLowerCase()
}

function isLegacyRequirementContent(content: string): boolean {
  return !content.includes('## 1. 需求描述') || !content.includes('## 2. 涉及模块') || !content.includes('## 3. 验收标准')
}

export function applyDefaultRequirements(doc: PageDesignDoc, versions: RequirementVersion[]): RequirementVersion[] {
  if (!doc.defaultRequirements?.length && !doc.removedDefaultRequirementTitles?.length) {
    return versions
  }

  const removedRequirementIdentities = new Set(
    (doc.removedDefaultRequirementTitles ?? []).map(title => getRequirementIdentity(`# ${title}`)),
  )
  const nextVersions = removedRequirementIdentities.size
    ? versions.map(version => ({
      ...version,
      notes: version.notes.filter(note => !removedRequirementIdentities.has(getRequirementIdentity(note.content))),
    }))
    : [...versions]

  if (!doc.defaultRequirements?.length) {
    return nextVersions
  }

  doc.defaultRequirements.forEach(requirement => {
    const versionName = requirement.version.trim() || DEFAULT_REQUIREMENT_VERSION

    const existingIndex = nextVersions.findIndex(version => version.name.trim().toLowerCase() === versionName.toLowerCase())
    const seededNote = createSeedRequirementNote(requirement.content, requirement.createdAt)

    if (existingIndex >= 0) {
      const existing = nextVersions[existingIndex]

      if (!hasMeaningfulNotes(existing.notes)) {
        nextVersions[existingIndex] = {
          ...existing,
          notes: [seededNote],
        }
        return
      }

      if (doc.syncMissingDefaultRequirements) {
        const seededIdentity = getRequirementIdentity(requirement.content)
        const existingNoteIndex = existing.notes.findIndex(note => getRequirementIdentity(note.content) === seededIdentity)
        const shouldReplace = (doc.replaceDefaultRequirementTitles ?? [])
          .map(title => getRequirementIdentity(`# ${title}`))
          .includes(seededIdentity)
        const existingNote = existingNoteIndex >= 0 ? existing.notes[existingNoteIndex] : null
        const shouldMigrateLegacyContent = Boolean(existingNote && isLegacyRequirementContent(existingNote.content))

        if (existingNoteIndex >= 0 && (shouldReplace || shouldMigrateLegacyContent)) {
          nextVersions[existingIndex] = {
            ...nextVersions[existingIndex],
            notes: nextVersions[existingIndex].notes.map((note, index) =>
              index === existingNoteIndex ? seededNote : note,
            ),
          }
        } else if (existingNoteIndex < 0) {
          nextVersions[existingIndex] = {
            ...nextVersions[existingIndex],
            notes: [...nextVersions[existingIndex].notes, seededNote],
          }
        }
      }

      return
    }

    nextVersions.push(createRequirementVersion(versionName, [seededNote]))
  })

  return nextVersions
}

export function isBlankDefaultVersion(version: RequirementVersion, versionCount: number): boolean {
  return versionCount === 1
    && /^V\d+$/.test(version.name)
    && version.notes.length <= 1
    && version.notes.every(note => !note.content.trim())
}

export function collectStoredPageVersionMetas(storage: Storage): RequirementVersionMeta[] {
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

export function removeVersionFromStoredPages(storage: Storage, deletedVersion: RequirementVersionMeta): void {
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

export function getDesignDocStorageKey(pagePath: string): string {
  return `${DESIGN_DOC_STORAGE_PREFIX}${pagePath}`
}

export function loadDesignDocState(doc: PageDesignDoc, storage: Storage): HydratedDesignDocState {
  const storageKey = getDesignDocStorageKey(doc.pagePath)
  const raw = storage.getItem(storageKey)
  const rawGlobal = storage.getItem(GLOBAL_VERSION_STORAGE_KEY)
  const parsed = raw ? JSON.parse(raw) as StoredDesignDocNotes : undefined
  const parsedGlobal = rawGlobal ? JSON.parse(rawGlobal) as StoredGlobalRequirementVersions : undefined
  const normalized = raw
    ? normalizeStoredNotes(parsed)
    : { versions: [], activeVersionId: null, changes: [], savedAt: null }
  const globalMetas = normalizeStoredGlobalVersions(parsedGlobal)
  const effectiveGlobalMetas = globalMetas.length ? globalMetas : collectStoredPageVersionMetas(storage)
  const pageMetas = globalMetas.length
    ? normalized.versions.slice(globalMetas.length).map(toVersionMeta)
    : normalized.versions.map(toVersionMeta)
  const mergedMetas = mergeVersionMetas(effectiveGlobalMetas, pageMetas)
  const baseVersions = mergedMetas.length
    ? hydrateVersionsFromGlobalMetas(mergedMetas, normalized.versions)
    : [createDefaultRequirementVersion()]
  const versions = applyDefaultRequirements(doc, baseVersions)
  const activeVersionName = normalized.versions.find(version => version.id === normalized.activeVersionId)?.name
  const activeVersionId = versions.find(version => version.id === normalized.activeVersionId)?.id
    ?? versions.find(version => version.name === activeVersionName)?.id
    ?? versions[0]?.id
    ?? null

  return {
    versions,
    activeVersionId,
    changes: normalized.changes,
    savedAt: normalized.savedAt ?? new Date().toISOString(),
  }
}

export function persistDesignDocState(
  storage: Storage,
  storageKey: string,
  versions: RequirementVersion[],
  activeVersionId: string | null,
  changes: RequirementChange[],
): string {
  const nextSavedAt = new Date().toISOString()
  storage.setItem(GLOBAL_VERSION_STORAGE_KEY, JSON.stringify({
    savedAt: nextSavedAt,
    versions: versions.map(toVersionMeta),
  }))
  storage.setItem(storageKey, JSON.stringify({
    savedAt: nextSavedAt,
    versions,
    activeVersionId,
    changes,
  }))
  return nextSavedAt
}

export function findVersionByName(versions: RequirementVersion[], versionName?: string | null): RequirementVersion | undefined {
  if (!versionName) {
    return undefined
  }

  return versions.find(version => version.name.trim().toLowerCase() === versionName.trim().toLowerCase())
}

export function getLatestVersionName(versions: RequirementVersion[]): string | null {
  return versions[versions.length - 1]?.name ?? null
}

export function buildCopyText(doc: PageDesignDoc, versions: RequirementVersion[], changes: RequirementChange[]): string {
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
