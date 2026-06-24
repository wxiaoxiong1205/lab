import React, { useEffect, useMemo, useState } from 'react'
import Layout from '@theme/Layout'

const STORAGE_KEY = 'deepexilab-doc-config'
const CONFIG_SERVER_URL = 'http://127.0.0.1:5174'

const createId = () =>
  `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const defaultDocContent =
  '# 产品概述\n\n在这里维护文档中心首页 Markdown 内容。\n\n## 快速开始\n\n1. 准备文档内容\n2. 上传本地图片\n3. 导出配置包\n'

const defaultConfig = {
  siteTitle: 'DeepexiLab 文档中心',
  tagline: '一站式模型训练平台产品文档',
  baseUrl: '/',
  apiEnabled: true,
  fixedApiLabel: '固定 OpenAPI',
  dynamicApiLabel: '动态 OpenAPI',
  defaultSpecPath: '/openapi.json',
  defaultDynamicSpecUrl: 'http://127.0.0.1:8000/openapi.json',
  specQueryParam: 'spec',
  docTree: [
    {
      id: 'home',
      type: 'doc',
      label: 'DeepexiLab 文档中心',
      path: 'index.md',
      content: defaultDocContent,
      children: []
    }
  ]
}

function toPathSegment(value, fallback) {
  const segment = String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/[/:*?"<>|#]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
  return segment || fallback
}

function normalizePath(value) {
  const raw = (value || 'index.md')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^docs\//, '')
  return raw.endsWith('.md') || raw.endsWith('.mdx') ? raw : `${raw}.md`
}

function docIdFromPath(value) {
  return normalizePath(value).replace(/\.(md|mdx)$/i, '')
}

function getEffectiveDocPath(node) {
  const path = normalizePath(node.path)
  const filename = path.split('/').pop()
  const label = normalizeHeadingText(node.label)

  if (filename === 'index.md' && label === '产品概述') return 'index.md'
  if (filename === 'operation.md' && label === '操作指南') return 'operation.md'
  if (path === 'api.md' && label === 'API文档') return 'open-platform/api.md'

  return path
}

function stripMarkdownFrontmatter(markdown) {
  const content = markdown
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(/<font\b[^>]*>([\s\S]*?)<\/font>/gi, '$1')
    .trim()
  return content.replace(/^#(?!#)\s+/gm, '## ')
}

function normalizeHeadingText(text) {
  return String(text || '')
    .replace(/[`*_~[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function removeLeadingTitleHeading(content, title) {
  const lines = String(content || '').replace(/^\s+/, '').split('\n')
  const firstLine = lines[0] || ''
  const match = firstLine.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)

  if (!match) return String(content || '').trim()

  const headingText = normalizeHeadingText(match[2])
  const titleText = normalizeHeadingText(title)

  if (headingText !== titleText) return String(content || '').trim()

  return lines.slice(1).join('\n').replace(/^\s+/, '').trim()
}

function migrateConfig(value) {
  const config = { ...defaultConfig, ...value }
  if (!Array.isArray(config.docTree)) {
    config.docTree = [
      {
        id: 'home',
        type: 'doc',
        label: config.docsLabel || 'DeepexiLab 文档中心',
        path: 'index.md',
        content: config.documentMarkdown || defaultDocContent,
        children: []
      }
    ]
  }
  const normalizeNodes = (nodes) =>
    nodes.map((node) => ({
      ...node,
      children: node.type === 'category' ? normalizeNodes(node.children || []) : [],
      dirName:
        node.type === 'category'
          ? node.dirName || toPathSegment(node.label, node.id)
          : ''
    }))
  config.docTree = normalizeNodes(config.docTree)
  return config
}

function loadConfig() {
  if (typeof window === 'undefined') return defaultConfig
  try {
    const cached = window.localStorage.getItem(STORAGE_KEY)
    return cached ? migrateConfig(JSON.parse(cached)) : defaultConfig
  } catch {
    return defaultConfig
  }
}

function findNode(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) return node
    const child = findNode(node.children || [], id)
    if (child) return child
  }
  return null
}

function findParentId(nodes, id, parentId = '') {
  for (const node of nodes) {
    if (node.id === id) return parentId
    const childParentId = findParentId(node.children || [], id, node.id)
    if (childParentId !== null) return childParentId
  }
  return null
}

function findNodeTrail(nodes, id, trail = []) {
  for (const node of nodes) {
    const nextTrail = [...trail, node]
    if (node.id === id) return nextTrail
    const childTrail = findNodeTrail(node.children || [], id, nextTrail)
    if (childTrail) return childTrail
  }
  return null
}

function categorySegmentsForNode(nodes, nodeId) {
  const trail = findNodeTrail(nodes, nodeId) || []
  return trail
    .slice(0, -1)
    .filter((node) => node.type === 'category')
    .map((node) => toPathSegment(node.dirName || node.label, node.id))
}

function categorySegmentsForParent(nodes, parentId) {
  if (!parentId) return []
  const trail = findNodeTrail(nodes, parentId) || []
  return trail
    .filter((node) => node.type === 'category')
    .map((node) => toPathSegment(node.dirName || node.label, node.id))
}

function buildHierarchicalDocPath(nodes, node) {
  const segments = categorySegmentsForNode(nodes, node.id)
  const basename = toPathSegment(
    normalizePath(node.path || node.label).split('/').pop().replace(/\.(md|mdx)$/i, '') ||
      node.label,
    node.id
  )
  return [...segments, `${basename}.md`].join('/') || 'index.md'
}

function syncDocPathsWithTree(nodes, rootNodes = nodes) {
  return nodes.map((node) => {
    if (node.type === 'category') {
      return {
        ...node,
        dirName: toPathSegment(node.dirName || node.label, node.id),
        children: syncDocPathsWithTree(node.children || [], rootNodes)
      }
    }
    return {
      ...node,
      path: node.path === 'index.md' ? 'index.md' : buildHierarchicalDocPath(rootNodes, node),
      children: []
    }
  })
}

function isDescendant(node, id) {
  return (node.children || []).some(
    (child) => child.id === id || isDescendant(child, id)
  )
}

function collectCategories(nodes, output = [], depth = 0, excludedId = '') {
  nodes.forEach((node) => {
    if (node.id === excludedId) return
    if (node.type === 'category' && !isDescendant(node, excludedId)) {
      output.push({
        id: node.id,
        label: `${'--'.repeat(depth)}${node.label}`
      })
      collectCategories(node.children || [], output, depth + 1, excludedId)
    } else {
      collectCategories(node.children || [], output, depth, excludedId)
    }
  })
  return output
}

function detachNode(nodes, id) {
  let detached = null
  const nextNodes = []

  nodes.forEach((node) => {
    if (node.id === id) {
      detached = node
      return
    }
    const result = detachNode(node.children || [], id)
    if (result.detached) detached = result.detached
    nextNodes.push({
      ...node,
      children: result.nodes
    })
  })

  return {
    detached,
    nodes: nextNodes
  }
}

function moveNode(nodes, id, parentId) {
  const result = detachNode(nodes, id)
  if (!result.detached) return nodes
  return addChildNode(result.nodes, parentId || null, result.detached)
}

function updateNode(nodes, id, updater) {
  return nodes.map((node) => {
    if (node.id === id) {
      const nextNode = updater(node)
      return {
        ...nextNode,
        children: nextNode.type === 'category' ? nextNode.children || [] : []
      }
    }
    return {
      ...node,
      children: updateNode(node.children || [], id, updater)
    }
  })
}

function removeNode(nodes, id) {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({
      ...node,
      children: removeNode(node.children || [], id)
    }))
}

function addChildNode(nodes, parentId, child) {
  if (!parentId) return [...nodes, child]
  return nodes.map((node) => {
    if (node.id === parentId && node.type === 'category') {
      return {
        ...node,
        children: [...(node.children || []), child]
      }
    }
    return {
      ...node,
      children: addChildNode(node.children || [], parentId, child)
    }
  })
}

function collectDocs(nodes, output = []) {
  nodes.forEach((node) => {
    if (node.type === 'doc') output.push(node)
    if (node.type === 'category') collectDocs(node.children || [], output)
  })
  return output
}

function buildSidebarItem(node) {
  if (node.type === 'category') {
    const items = (node.children || []).map(buildSidebarItem).filter(Boolean)
    if (items.length === 0) return null
    return {
      type: 'category',
      label: node.label,
      items
    }
  }
  return {
    type: 'doc',
    id: docIdFromPath(getEffectiveDocPath(node)),
    label: node.label
  }
}

function countDocIds(nodes, counts = {}) {
  nodes.forEach((node) => {
    if (node.type === 'doc') {
      const id = docIdFromPath(getEffectiveDocPath(node))
      counts[id] = (counts[id] || 0) + 1
    }
    if (node.type === 'category') countDocIds(node.children || [], counts)
  })
  return counts
}

function buildSidebarItems(nodes, docIdCounts) {
  return nodes
    .map((node) => {
      if (node.type === 'doc') {
        const id = docIdFromPath(node.path)
        if (docIdCounts[id] > 1) {
          docIdCounts[id] -= 1
          return null
        }
      }
      return buildSidebarItem(node)
    })
    .filter(Boolean)
}

function buildSidebar(config) {
  const items = buildSidebarItems(config.docTree, countDocIds(config.docTree))
  return `/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: ${JSON.stringify(items, null, 4)}
}

module.exports = sidebars
`
}

function buildMarkdown(node) {
  const path = getEffectiveDocPath(node)
  const slugLine = path === 'index.md' ? 'slug: /\n' : ''
  const body = removeLeadingTitleHeading(node.content, node.label)
    .replace(/array<T>/g, 'array&lt;T&gt;')
    .replace(/<br>/g, '<br />')
  return `---
title: ${node.label}
sidebar_label: ${node.label}
${slugLine}toc_min_heading_level: 2
toc_max_heading_level: 6
---

${body}
`
}

function buildDocFiles(config) {
  return collectDocs(config.docTree).map((node) => ({
    filename: `docs/${getEffectiveDocPath(node)}`,
    content: buildMarkdown(node)
  }))
}

function buildDocusaurusConfig(config) {
  const navItems = [
    "        { to: '/', label: '首页', position: 'left' }",
    "        { to: '/config', label: '配置平台', position: 'left' }",
    config.apiEnabled
      ? `        {
          type: 'dropdown',
          label: 'API 文档',
          position: 'left',
          items: [
            { to: '/api', label: '${config.fixedApiLabel}' },
            { to: '/api/dynamic', label: '${config.dynamicApiLabel}' }
          ]
        }`
      : null,
    "        { type: 'search', position: 'right' }"
  ]
    .filter(Boolean)
    .join(',\n')

  return `require('dotenv').config()

const baseUrl = process.env.BASE_URL || '${config.baseUrl || '/'}'

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: '${config.siteTitle}',
  tagline: '${config.tagline}',
  url: 'https://example.com',
  baseUrl,
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'favicon.ico',

  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans']
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: require.resolve('./sidebars.cjs'),
          beforeDefaultRemarkPlugins: [
            require('./src/remark/runtimeImageUrls.cjs')
          ],
          lastVersion: 'current',
          versions: {
            current: {
              label: 'v0.0.1'
            }
          }
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css')
        }
      }
    ]
  ],

  plugins: [
    function webpackFallbacks() {
      return {
        name: 'webpack-fallbacks',
        configureWebpack() {
          return {
            resolve: {
              fallback: {
                url: require.resolve('url/')
              }
            }
          }
        }
      }
    }
  ],

  themeConfig: {
    navbar: {
      title: '${config.siteTitle}',
      items: [
${navItems}
      ]
    },
    footer: {
      style: 'light',
      copyright: \`Copyright © \${new Date().getFullYear()}\`
    }
  },
  customFields: {
    apiSpec: {
      defaultSpecPath: process.env.API_DEFAULT_SPEC_PATH || '${config.defaultSpecPath}',
      redocScriptPath:
        process.env.API_REDOC_SCRIPT_PATH || '/redoc/redoc.standalone.js',
      specQueryParam: process.env.API_SPEC_QUERY_PARAM || '${config.specQueryParam}',
      defaultDynamicSpecUrl:
        process.env.API_DEFAULT_DYNAMIC_SPEC_URL ||
        '${config.defaultDynamicSpecUrl}'
    }
  }
}

module.exports = config
`
}

function buildEnv(config) {
  return `API_DEFAULT_SPEC_PATH=${config.defaultSpecPath}
API_REDOC_SCRIPT_PATH=/redoc/redoc.standalone.js
API_SPEC_QUERY_PARAM=${config.specQueryParam}
API_DEFAULT_DYNAMIC_SPEC_URL=${config.defaultDynamicSpecUrl}
`
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function base64ToBlob(base64, type) {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type })
}

function Field({ label, hint, children }) {
  return (
    <label className="config-field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}

function TreeNode({ node, depth, selectedId, expandedIds, onSelect, onToggle }) {
  const hasChildren = node.type === 'category' && (node.children || []).length > 0
  const expanded = expandedIds.includes(node.id)
  return (
    <div>
      <button
        type="button"
        className={`config-tree-node ${selectedId === node.id ? 'is-active' : ''}`}
        style={{ paddingLeft: `${12 + depth * 18}px` }}
        onClick={() => onSelect(node.id)}
      >
        {node.type === 'category' ? (
          <span
            className={`config-tree-caret ${expanded ? 'is-expanded' : ''}`}
            onClick={(event) => {
              event.stopPropagation()
              onToggle(node.id)
            }}
          >
            {hasChildren ? '>' : ''}
          </span>
        ) : (
          <span className="config-tree-caret" />
        )}
        <span className={`config-tree-icon config-tree-icon--${node.type}`}>
          {node.type === 'category' ? '目录' : '文档'}
        </span>
        <span>{node.label}</span>
      </button>
      {expanded
        ? (node.children || []).map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))
        : null}
    </div>
  )
}

export default function ConfigPage() {
  const [config, setConfig] = useState(defaultConfig)
  const [selectedId, setSelectedId] = useState(defaultConfig.docTree[0].id)
  const [activeArtifact, setActiveArtifact] = useState('sidebar')
  const [copied, setCopied] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [expandedIds, setExpandedIds] = useState([])

  useEffect(() => {
    const loaded = loadConfig()
    setConfig(loaded)
    setSelectedId(loaded.docTree[0]?.id || '')
    setExpandedIds(collectCategories(loaded.docTree).map((item) => item.id))
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    }
  }, [config])

  const selectedNode = findNode(config.docTree, selectedId) || config.docTree[0]
  const selectedParentId = selectedNode
    ? findParentId(config.docTree, selectedNode.id) || ''
    : ''
  const parentOptions = selectedNode
    ? collectCategories(config.docTree, [], 0, selectedNode.id)
    : []
  const docFiles = useMemo(() => buildDocFiles(config), [config])
  const artifacts = useMemo(
    () => ({
      sidebar: {
        filename: 'sidebars.cjs',
        label: '侧边栏配置',
        content: buildSidebar(config)
      },
      docusaurus: {
        filename: 'docusaurus.config.cjs',
        label: '站点配置',
        content: buildDocusaurusConfig(config)
      },
      env: {
        filename: '.env',
        label: '环境变量',
        content: buildEnv(config)
      },
      manifest: {
        filename: 'doc-files.json',
        label: '文档文件清单',
        content: JSON.stringify(docFiles, null, 2)
      }
    }),
    [config, docFiles]
  )

  const update = (key) => (event) => {
    const { type, checked, value } = event.target
    setConfig((current) => ({
      ...current,
      [key]: type === 'checkbox' ? checked : value
    }))
  }

  const updateSelectedNode = (patch) => {
    if (!selectedNode) return
    setConfig((current) => ({
      ...current,
      docTree: updateNode(current.docTree, selectedNode.id, (node) => ({
        ...node,
        ...patch
      }))
    }))
  }

  const changeSelectedParent = (parentId) => {
    if (!selectedNode) return
    setConfig((current) => ({
      ...current,
      docTree: syncDocPathsWithTree(moveNode(current.docTree, selectedNode.id, parentId))
    }))
  }

  const addNode = (type, placement = 'child') => {
    const parent =
      placement === 'sibling'
        ? selectedParentId || null
        : selectedNode?.type === 'category'
          ? selectedNode.id
          : null
    const label = type === 'category' ? '新目录' : '新文档'
    const id = createId()
    const pathSegment = toPathSegment(label, id)
    const parentSegments = categorySegmentsForParent(config.docTree, parent)
    const node = {
      id,
      type,
      label,
      dirName: type === 'category' ? pathSegment : '',
      path: type === 'doc' ? [...parentSegments, `${pathSegment}.md`].join('/') : '',
      content: type === 'doc' ? '请输入文档内容。\n' : '',
      children: []
    }
    setConfig((current) => ({
      ...current,
      docTree: addChildNode(current.docTree, parent, node)
    }))
    if (parent) {
      setExpandedIds((current) =>
        current.includes(parent) ? current : [...current, parent]
      )
    }
    setSelectedId(node.id)
  }

  const toggleExpanded = (id) => {
    setExpandedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    )
  }

  const syncPaths = () => {
    setConfig((current) => ({
      ...current,
      docTree: syncDocPathsWithTree(current.docTree)
    }))
    setSaveMessage('已按菜单目录层级同步 Markdown 文件路径，请保存到项目。')
  }

  const deleteSelectedNode = () => {
    if (!selectedNode || config.docTree.length === 1 && selectedNode.id === config.docTree[0].id) {
      return
    }
    setConfig((current) => ({
      ...current,
      docTree: removeNode(current.docTree, selectedNode.id)
    }))
    setSelectedId(config.docTree[0]?.id || '')
  }

  const importMarkdownToNode = async (event) => {
    const [file] = event.target.files || []
    if (!file || !selectedNode || selectedNode.type !== 'doc') return
    const text = await file.text()
    let content = stripMarkdownFrontmatter(text)
    let assetMessage = ''

    try {
      setSaveMessage('正在处理 Markdown 外链图片...')
      const response = await fetch(`${CONFIG_SERVER_URL}/api/docs/process-markdown-assets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content })
      })
      const result = await response.json()
      if (!response.ok || !result.ok) {
        throw new Error(result.message || '处理 Markdown 图片失败')
      }

      content = result.content
      if (result.zipBase64) {
        downloadBlob(
          result.zipFilename || 'markdown-images.zip',
          base64ToBlob(result.zipBase64, 'application/zip')
        )
      }

      assetMessage = result.imageCount
        ? `已替换 ${result.imageCount} 个图片链接，下载 ${result.downloadedCount} 张图片。`
        : '未发现需要处理的语雀 CDN 图片。'
      if (result.failed?.length) {
        assetMessage += ` ${result.failed.length} 张图片下载失败，请检查链接。`
      }
    } catch (error) {
      assetMessage = `图片处理失败：${error.message}。请先运行 npm run config-server`
    }

    updateSelectedNode({
      label: selectedNode.label || file.name.replace(/\.(md|mdx)$/i, ''),
      path: selectedNode.path || buildHierarchicalDocPath(config.docTree, selectedNode),
      content
    })
    setSaveMessage(assetMessage)
    event.target.value = ''
  }

  const importConfig = async (event) => {
    const [file] = event.target.files || []
    if (!file) return
    const text = await file.text()
    const imported = migrateConfig(JSON.parse(text))
    setConfig(imported)
    setSelectedId(imported.docTree[0]?.id || '')
    setExpandedIds(collectCategories(imported.docTree).map((item) => item.id))
    event.target.value = ''
  }

  const copyActive = async () => {
    const artifact = artifacts[activeArtifact]
    await navigator.clipboard.writeText(artifact.content)
    setCopied(artifact.filename)
    window.setTimeout(() => setCopied(''), 1600)
  }

  const requestWrite = async (url, payload) => {
    const response = await fetch(`${CONFIG_SERVER_URL}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    const result = await response.json()
    if (!response.ok || !result.ok) {
      throw new Error(result.message || '保存失败')
    }
    return result
  }

  const saveCurrentDocToProject = async () => {
    if (!selectedNode || selectedNode.type !== 'doc') return
    setSaveMessage('正在保存当前文档和侧边栏...')
    try {
      const normalized = normalizePath(selectedNode.path)
      const effectivePath = getEffectiveDocPath({ ...selectedNode, path: normalized })
      const nextConfig = {
        ...config,
        docTree: updateNode(config.docTree, selectedNode.id, (node) => ({
          ...node,
          path: effectivePath
        }))
      }
      setConfig(nextConfig)
      const result = await requestWrite('/api/docs/write-all', {
        files: [
          {
            path: effectivePath,
            content: buildMarkdown({ ...selectedNode, path: effectivePath })
          }
        ],
        sidebar: buildSidebar(nextConfig)
      })
      setSaveMessage(`已写入 ${result.written.length} 个文件。新增/删除菜单后请重启 npm run dev`)
    } catch (error) {
      setSaveMessage(`保存失败：${error.message}。请先运行 npm run config-server`)
    }
  }

  const downloadAllSources = () => {
    downloadText('docusaurus.config.cjs', buildDocusaurusConfig(config))
    downloadText('sidebars.cjs', buildSidebar(config))
    downloadText('.env', buildEnv(config))
    docFiles.forEach((file, index) => {
      window.setTimeout(() => downloadText(file.filename, file.content), 120 * (index + 1))
    })
  }

  const saveAllToProject = async () => {
    setSaveMessage('正在保存全部文档和侧边栏...')
    try {
      const result = await requestWrite('/api/docs/write-all', {
        files: docFiles.map((file) => ({
          path: file.filename.replace(/^docs\//, ''),
          content: file.content
        })),
        sidebar: buildSidebar(config)
      })
      setSaveMessage(`已写入 ${result.written.length} 个文件`)
    } catch (error) {
      setSaveMessage(`保存失败：${error.message}。请先运行 npm run config-server`)
    }
  }

  const scrollToConfigSection = (id) => {
    if (typeof document === 'undefined') return
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <Layout title="可视化配置平台" className="config-page">
      <main className="config-shell">
        <div className="config-app-layout">
          <aside className="config-page-sider">
            <div className="config-page-sider-title">
              <strong>文档配置</strong>
              <span>DeepexiLab Doc Center</span>
            </div>
            <nav className="config-page-menu" aria-label="配置平台导航">
              <button type="button" onClick={() => scrollToConfigSection('config-site-section')}>
                站点配置
              </button>
              <button type="button" onClick={() => scrollToConfigSection('config-doc-section')}>
                文档菜单
              </button>
              <button type="button" onClick={() => scrollToConfigSection('config-publish-section')}>
                发布文件
              </button>
            </nav>
          </aside>

          <section className="config-page-content">
            <section className="config-hero">
              <div>
                <p className="config-kicker">Doc Center Config</p>
                <h1>可视化配置平台</h1>
                <p>
                  配置文档中心左侧菜单、对应 Markdown 文件层级和每个节点内容。
                  配置保存在浏览器本地，可导出为项目源码文件用于发布。
                </p>
              </div>
              <div className="config-actions">
                <label className="config-file">
                  导入配置
                  <input type="file" accept=".json,application/json" onChange={importConfig} />
                </label>
                <button type="button" onClick={() => downloadText('doc-center-config.json', JSON.stringify(config, null, 2))}>
                  导出配置
                </button>
                <button type="button" onClick={downloadAllSources}>
                  导出源码文件
                </button>
                <button type="button" onClick={saveAllToProject}>
                  保存全部到项目
                </button>
              </div>
            </section>

            <section className="config-grid" id="config-site-section">
              <div className="config-panel">
            <h2>站点信息</h2>
            <Field label="站点标题">
              <input value={config.siteTitle} onChange={update('siteTitle')} />
            </Field>
            <Field label="站点描述">
              <input value={config.tagline} onChange={update('tagline')} />
            </Field>
            <Field label="部署路径" hint="根路径部署用 /；子路径部署用 /docs/ 这类格式。">
              <input value={config.baseUrl} onChange={update('baseUrl')} />
            </Field>
              </div>

              <div className="config-panel">
            <h2>API 文档</h2>
            <label className="config-switch">
              <input type="checkbox" checked={config.apiEnabled} onChange={update('apiEnabled')} />
              <span>显示 API 文档入口</span>
            </label>
            <Field label="默认 OpenAPI 文件">
              <input value={config.defaultSpecPath} onChange={update('defaultSpecPath')} />
            </Field>
            <Field label="动态 OpenAPI 地址">
              <input value={config.defaultDynamicSpecUrl} onChange={update('defaultDynamicSpecUrl')} />
            </Field>
            <Field label="动态地址参数名">
              <input value={config.specQueryParam} onChange={update('specQueryParam')} />
            </Field>
              </div>
            </section>

            <section className="config-grid" id="config-doc-section">
              <div className="config-panel config-panel--wide">
            <div className="config-doc-layout">
              <aside className="config-doc-tree">
                <div className="config-panel-header">
                  <h2>左侧菜单结构</h2>
                </div>
                <div className="config-actions config-actions--compact">
                  <button type="button" onClick={() => addNode('doc')}>
                    新增子文档
                  </button>
                  <button type="button" onClick={() => addNode('category')}>
                    新增子目录
                  </button>
                  <button type="button" onClick={() => addNode('doc', 'sibling')}>
                    新增同级文档
                  </button>
                  <button type="button" onClick={() => addNode('category', 'sibling')}>
                    新增同级目录
                  </button>
                  <button type="button" onClick={syncPaths}>
                    同步层级路径
                  </button>
                </div>
                <p className="config-help">
                  只有目录可以展开收起并承载子节点；文档是叶子节点。子节点会挂在当前目录下，同级节点会挂在当前节点的父级目录下。
                </p>
                <div className="config-tree">
                  {config.docTree.map((node) => (
                    <TreeNode
                      key={node.id}
                      node={node}
                      depth={0}
                      selectedId={selectedId}
                      expandedIds={expandedIds}
                      onSelect={setSelectedId}
                      onToggle={toggleExpanded}
                    />
                  ))}
                </div>
              </aside>

              <section className="config-doc-editor">
                <div className="config-panel-header">
                  <h2>节点配置</h2>
                  <button type="button" className="config-danger" onClick={deleteSelectedNode}>
                    删除节点
                  </button>
                </div>

                {selectedNode ? (
                  <>
                    <Field label="节点类型">
                      <select
                        value={selectedNode.type}
                        onChange={(event) =>
                          updateSelectedNode({
                            type: event.target.value,
                            children: event.target.value === 'category' ? selectedNode.children || [] : [],
                            dirName:
                              event.target.value === 'category'
                                ? selectedNode.dirName || toPathSegment(selectedNode.label, selectedNode.id)
                                : ''
                          })
                        }
                      >
                        <option value="doc">文档</option>
                        <option value="category">目录</option>
                      </select>
                    </Field>
                    <Field label="菜单显示名称">
                      <input value={selectedNode.label} onChange={(event) => updateSelectedNode({ label: event.target.value })} />
                    </Field>
                    <Field
                      label="父级目录"
                      hint="选择根级表示显示在左侧菜单第一层；只有目录节点可以作为父级。"
                    >
                      <select
                        value={selectedParentId}
                        onChange={(event) => changeSelectedParent(event.target.value)}
                      >
                        <option value="">根级菜单</option>
                        {parentOptions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {selectedNode.type === 'doc' ? (
                      <>
                        <Field
                          label="Markdown 文件路径"
                          hint="对应 apps/doc/docs 下的文件层级，例如 index.md、guide/start.md。"
                        >
                          <input
                            value={selectedNode.path || ''}
                            onChange={(event) => updateSelectedNode({ path: event.target.value })}
                            onBlur={(event) => updateSelectedNode({ path: normalizePath(event.target.value) })}
                          />
                        </Field>
                        <div className="config-panel-header">
                          <h2>Markdown 内容</h2>
                          <div className="config-actions">
                            <label className="config-file">
                              上传 MD
                              <input type="file" accept=".md,.mdx,text/markdown,text/plain" onChange={importMarkdownToNode} />
                            </label>
                            <button type="button" onClick={saveCurrentDocToProject}>
                              保存当前文档到项目
                            </button>
                          </div>
                        </div>
                        {saveMessage ? <p className="config-save-message">{saveMessage}</p> : null}
                        <textarea
                          className="config-markdown-input"
                          value={selectedNode.content || ''}
                          onChange={(event) => updateSelectedNode({ content: event.target.value })}
                          spellCheck="false"
                        />
                      </>
                    ) : (
                      <>
                        <Field
                          label="目录路径片段"
                          hint="用于生成子文档文件夹，例如 guide、user/module。目录本身不会生成 md 文件。"
                        >
                          <input
                            value={selectedNode.dirName || ''}
                            onChange={(event) => updateSelectedNode({ dirName: event.target.value })}
                            onBlur={(event) =>
                              updateSelectedNode({
                                dirName: toPathSegment(event.target.value, selectedNode.id)
                              })
                            }
                          />
                        </Field>
                        <p className="config-empty">
                          目录节点只生成左侧菜单分组和文件夹层级，不生成 Markdown 文件。只有目录节点可以展开收起并承载子节点。
                        </p>
                      </>
                    )}
                  </>
                ) : (
                  <p className="config-empty">请选择一个菜单节点。</p>
                )}
              </section>
            </div>
              </div>
            </section>

            <section className="config-grid" id="config-publish-section">
              <div className="config-panel config-panel--wide">
            <h2>发布文件</h2>
            <div className="config-tabs" role="tablist" aria-label="发布文件">
              {Object.entries(artifacts).map(([key, artifact]) => (
                <button
                  type="button"
                  key={key}
                  className={activeArtifact === key ? 'is-active' : ''}
                  onClick={() => setActiveArtifact(key)}
                >
                  {artifact.label}
                </button>
              ))}
            </div>
            <pre className="config-code-preview">{artifacts[activeArtifact].content}</pre>
            <div className="config-actions config-actions--right">
              <button type="button" onClick={copyActive}>
                {copied ? `已复制 ${copied}` : '复制当前文件'}
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadText(
                    artifacts[activeArtifact].filename,
                    artifacts[activeArtifact].content
                  )
                }
              >
                下载当前文件
              </button>
            </div>
              </div>
            </section>
          </section>
        </div>
      </main>
    </Layout>
  )
}
