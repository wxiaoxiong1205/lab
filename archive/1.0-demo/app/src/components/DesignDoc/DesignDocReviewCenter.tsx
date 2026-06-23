import React, { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Empty, Input, Popover, Select, Space, Tag, Typography } from 'antd'
import { FileSearchOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons'
import { getAllPageDesignDocs, GLOBAL_DESIGN_DOC_MODULE, GLOBAL_DESIGN_DOC_PATH, type PageDesignDoc } from '../../docs/pageDocs'
import {
  DEFAULT_REQUIREMENT_VERSION,
  formatTimestamp,
  getMeaningfulNotes,
  loadDesignDocState,
  type RequirementNote,
} from './designDocStorage'

const { Text } = Typography

interface ReviewRequirementEntry {
  doc: PageDesignDoc
  versionName: string
  notes: RequirementNote[]
  updatedAt: string
  summary: string
}

interface DesignDocReviewCenterProps {
  selectedVersionName: string | null
  currentPagePath: string
  rightOffset: number
  onVersionChange: (versionName: string) => void
  onOpenPage: (pagePath: string, versionName: string) => void
  onCurrentPageHasRequirementsChange?: (hasRequirements: boolean) => void
}

function summarize(content: string): string {
  return content
    .replace(/^#+\s*/gm, '')
    .split('\n')
    .map(line => line.trim())
    .find(Boolean)
    ?.slice(0, 72) || '暂无摘要'
}

function summarizeNotes(notes: RequirementNote[]): string {
  return notes
    .map(note => summarize(note.content))
    .filter(Boolean)
    .slice(0, 3)
    .map((summary, index) => `${index + 1}. ${summary}`)
    .join('\n')
}

function getVersionSortValue(versionName: string): number {
  const matched = versionName.match(/V(\d+(?:\.\d+)?)/i)
  return matched ? Number(matched[1]) : 0
}

const MODULE_REVIEW_ORDER = [
  GLOBAL_DESIGN_DOC_MODULE,
  '任务概览',
  '项目空间',
  '数据管理',
  '数据处理',
  '在线 Notebook',
  '模型训练',
  '模型训练 / 机器学习',
  '模型评估',
  '模型服务',
  '机器学习',
  '系统管理',
  '个人中心',
  '文档中心',
  '未分类',
]

const PAGE_REVIEW_ORDER = [
  GLOBAL_DESIGN_DOC_PATH,
  '/task-overview',
  '/workspace',
  '/datasets',
  '/measurement',
  '/file-management',
  '/inference',
  '/data-annotation',
  '/data-cleaning',
  '/finetune/notebooks',
  '/training',
  '/model',
  '/effect-evaluation',
  '/evaluation-indicator',
  '/service/inference/hosted',
  '/service/inference/external',
  '/machine-data-management',
  '/machine-annotation',
  '/machine-model-management',
  '/machine-model-deployment',
  '/machine-notebook',
  '/machine-annotation-service',
  '/admin/projects',
  '/admin/kubernetes',
  '/admin/storage',
  '/admin/image-list',
  '/admin/registry',
  '/admin/base-model',
  '/admin/settings',
  '/admin/permissions',
  '/docs',
]

function getModuleReviewOrder(module: string): number {
  const index = MODULE_REVIEW_ORDER.indexOf(module)
  return index >= 0 ? index : MODULE_REVIEW_ORDER.length
}

function getPageReviewOrder(pagePath: string): number {
  const exactIndex = PAGE_REVIEW_ORDER.indexOf(pagePath)
  if (exactIndex >= 0) {
    return exactIndex
  }

  const prefixIndex = PAGE_REVIEW_ORDER.findIndex(path => path !== '/' && pagePath.startsWith(`${path}/`))
  return prefixIndex >= 0 ? prefixIndex : PAGE_REVIEW_ORDER.length
}

function compareReviewEntries(a: ReviewRequirementEntry, b: ReviewRequirementEntry): number {
  const moduleOrder = getModuleReviewOrder(a.doc.module) - getModuleReviewOrder(b.doc.module)
  if (moduleOrder !== 0) {
    return moduleOrder
  }

  const pageOrder = getPageReviewOrder(a.doc.pagePath) - getPageReviewOrder(b.doc.pagePath)
  if (pageOrder !== 0) {
    return pageOrder
  }

  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
}

function compareModules(a: string, b: string): number {
  return getModuleReviewOrder(a) - getModuleReviewOrder(b) || a.localeCompare(b)
}

function collectReviewState(storage: Storage): { versions: string[]; entries: ReviewRequirementEntry[] } {
  const docs = getAllPageDesignDocs()
  const versionNames = new Set<string>()
  const entries: ReviewRequirementEntry[] = []

  docs.forEach(doc => {
    try {
      const state = loadDesignDocState(doc, storage)
      state.versions.forEach(version => {
        versionNames.add(version.name)
        const notes = getMeaningfulNotes(version.notes)

        if (!notes.length) {
          return
        }

        const updatedAt = notes
          .map(note => note.createdAt)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? state.savedAt ?? version.createdAt

        entries.push({
          doc,
          versionName: version.name,
          notes,
          updatedAt,
          summary: summarizeNotes(notes),
        })
      })
    } catch {
      // Ignore malformed local docs; the panel itself still has fallback behavior.
    }
  })

  const versions = Array.from(versionNames)
    .sort((a, b) => getVersionSortValue(a) - getVersionSortValue(b) || a.localeCompare(b))

  return { versions, entries }
}

const DesignDocReviewCenter: React.FC<DesignDocReviewCenterProps> = ({
  selectedVersionName,
  currentPagePath,
  rightOffset,
  onVersionChange,
  onOpenPage,
  onCurrentPageHasRequirementsChange,
}) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState<string>('all')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const refresh = () => setRefreshKey(key => key + 1)
    window.addEventListener('storage', refresh)
    window.addEventListener('design-doc-updated', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('design-doc-updated', refresh)
    }
  }, [])

  const reviewState = useMemo(
    () => (typeof window === 'undefined' ? { versions: [], entries: [] } : collectReviewState(window.localStorage)),
    [refreshKey],
  )

  const activeVersionName = useMemo(() => {
    if (selectedVersionName && reviewState.versions.includes(selectedVersionName)) {
      return selectedVersionName
    }
    if (reviewState.versions.includes(DEFAULT_REQUIREMENT_VERSION)) {
      return DEFAULT_REQUIREMENT_VERSION
    }
    return reviewState.versions[reviewState.versions.length - 1] ?? DEFAULT_REQUIREMENT_VERSION
  }, [reviewState.versions, selectedVersionName])

  useEffect(() => {
    if (activeVersionName && activeVersionName !== selectedVersionName) {
      onVersionChange(activeVersionName)
    }
  }, [activeVersionName, onVersionChange, selectedVersionName])

  const versionEntries = useMemo(
    () => reviewState.entries.filter(entry => entry.versionName === activeVersionName),
    [activeVersionName, reviewState.entries],
  )
  const versionRequirementCount = useMemo(
    () => versionEntries.reduce((total, entry) => total + entry.notes.length, 0),
    [versionEntries],
  )

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase()

    return versionEntries
      .filter(entry => moduleFilter === 'all' || entry.doc.module === moduleFilter)
      .filter(entry => {
        if (!query) return true
        return [
          entry.doc.module,
          entry.doc.pageName,
          entry.doc.pagePath,
          entry.summary,
          entry.notes.map(note => note.content).join('\n'),
        ].join('\n').toLowerCase().includes(query)
      })
      .sort(compareReviewEntries)
  }, [moduleFilter, search, versionEntries])

  const modules = useMemo(() => {
    const allModules = getAllPageDesignDocs().map(doc => doc.module)
    return Array.from(new Set([GLOBAL_DESIGN_DOC_MODULE, ...allModules, ...versionEntries.map(entry => entry.doc.module)]))
      .sort(compareModules)
  }, [versionEntries])

  useEffect(() => {
    if (moduleFilter !== 'all' && !modules.includes(moduleFilter)) {
      setModuleFilter('all')
    }
  }, [moduleFilter, modules])

  const currentPageHasRequirements = versionEntries.some(entry => entry.doc.pagePath === currentPagePath)
  const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth
  const fixedRightOffset = Math.min(rightOffset, Math.max(24, viewportWidth - 140))
  const popoverPlacement = fixedRightOffset > viewportWidth / 2 ? 'topLeft' : 'topRight'

  useEffect(() => {
    onCurrentPageHasRequirementsChange?.(currentPageHasRequirements)
  }, [currentPageHasRequirements, onCurrentPageHasRequirementsChange])

  const content = (
    <div className="design-doc-review-popover">
      <div className="design-doc-review-popover__head">
        <div>
          <Text strong>需求评审中心</Text>
          <div className="design-doc-review-popover__sub">按版本定位有新需求的页面</div>
        </div>
        <Tag color="blue" style={{ margin: 0 }}>{activeVersionName} · {versionRequirementCount}</Tag>
      </div>

      <Space.Compact style={{ width: '100%', marginBottom: 10 }}>
        <Select
          value={activeVersionName}
          style={{ width: 116 }}
          options={reviewState.versions.map(version => ({ value: version, label: version }))}
          onChange={value => onVersionChange(value)}
        />
        <Select
          value={moduleFilter}
          style={{ width: 132 }}
          options={[
            { value: 'all', label: '全部模块' },
            ...modules.map(module => ({ value: module, label: module })),
          ]}
          onChange={setModuleFilter}
        />
      </Space.Compact>

      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="搜索页面、模块或需求内容"
        value={search}
        onChange={event => setSearch(event.target.value)}
        style={{ marginBottom: 12 }}
      />

      <div className="design-doc-review-list">
        {filteredEntries.length ? filteredEntries.map(entry => (
          <button
            key={`${activeVersionName}-${entry.doc.pagePath}`}
            type="button"
            className="design-doc-review-item"
            onClick={() => {
              setOpen(false)
              onOpenPage(entry.doc.pagePath, activeVersionName)
            }}
          >
            <div className="design-doc-review-item__main">
              <div className="design-doc-review-item__title">
                <Text strong>{entry.doc.pageName}</Text>
                <Tag style={{ margin: 0 }}>{entry.notes.length} 条</Tag>
              </div>
              <div className="design-doc-review-item__meta">
                {entry.doc.module} · {formatTimestamp(entry.updatedAt)}
              </div>
              <div className="design-doc-review-item__summary">{entry.summary}</div>
            </div>
            <RightOutlined />
          </button>
        )) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前版本暂无需求" />
        )}
      </div>
    </div>
  )

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      content={content}
      trigger="click"
      placement={popoverPlacement}
      overlayClassName="design-doc-review-overlay"
      zIndex={2600}
      getPopupContainer={() => document.body}
    >
      <span className="design-doc-review-fab-wrap" style={{ right: fixedRightOffset }}>
        <Badge
          count={versionRequirementCount}
          size="small"
          offset={[-5, 6]}
        >
          <Button
            shape="round"
            icon={<FileSearchOutlined />}
            className={`design-doc-review-fab ${currentPageHasRequirements ? 'design-doc-review-fab--current' : ''}`}
          >
            需求评审
          </Button>
        </Badge>
      </span>
    </Popover>
  )
}

export default DesignDocReviewCenter
