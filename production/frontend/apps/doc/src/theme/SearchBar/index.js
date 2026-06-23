import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useHistory } from '@docusaurus/router'
import { useBaseUrlUtils } from '@docusaurus/useBaseUrl'
import searchIndexData from '@site/static/doc-search-index.json'

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~，。、《》？；：‘’“”（）【】！￥…—]+/g, '')
}

function tokenize(query) {
  const normalized = normalize(query)
  const asciiTokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)

  if (/[\u4e00-\u9fff]/.test(normalized)) {
    const zhTokens = []
    for (let size = Math.min(4, normalized.length); size >= 2; size -= 1) {
      for (let index = 0; index <= normalized.length - size; index += 1) {
        zhTokens.push(normalized.slice(index, index + size))
      }
    }
    zhTokens.push(normalized)
    return [...new Set([...zhTokens, ...asciiTokens])]
  }

  return [...new Set(asciiTokens)]
}

function countIncludes(text, keyword) {
  if (!keyword) return 0
  let count = 0
  let index = text.indexOf(keyword)
  while (index !== -1) {
    count += 1
    index = text.indexOf(keyword, index + keyword.length)
  }
  return count
}

function pickExcerpt(content, query, tokens) {
  const text = String(content || '')
  if (!text) return ''

  const lowerText = text.toLowerCase()
  const rawQuery = String(query || '').toLowerCase().trim()
  let index = rawQuery ? lowerText.indexOf(rawQuery) : -1

  if (index === -1) {
    const token = tokens.find((item) => lowerText.includes(item))
    index = token ? lowerText.indexOf(token) : 0
  }

  const start = Math.max(0, index - 36)
  const end = Math.min(text.length, start + 96)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < text.length ? '...' : ''
  return `${prefix}${text.slice(start, end)}${suffix}`
}

function scoreDocument(document, query, tokens) {
  const exact = normalize(query)
  const title = normalize(document.title)
  const section = normalize(document.sectionTitle)
  const parents = normalize((document.parents || []).join(' '))
  const content = normalize(document.content)

  let score = 0
  if (title === exact) score += 500
  if (section === exact) score += 450
  if (title.includes(exact)) score += 220
  if (section.includes(exact)) score += 260
  if (parents.includes(exact)) score += 120
  if (content.includes(exact)) {
    const contentLimit = document.type === 'page' ? 25 : 120
    const contentStep = document.type === 'page' ? 3 : 18
    score += Math.min(contentLimit, countIncludes(content, exact) * contentStep)
  }

  tokens.forEach((token) => {
    if (title.includes(token)) score += 45
    if (section.includes(token)) score += 58
    if (parents.includes(token)) score += 24
    if (content.includes(token)) {
      const tokenLimit = document.type === 'page' ? 8 : 28
      const tokenStep = document.type === 'page' ? 1 : 5
      score += Math.min(tokenLimit, countIncludes(content, token) * tokenStep)
    }
  })

  if (document.type === 'page') score += 12
  if (document.level) score += Math.max(0, 7 - document.level)
  return score
}

function searchDocuments(documents, query) {
  const normalized = normalize(query)
  if (normalized.length < 1) return []

  const tokens = tokenize(query)
  return documents
    .map((document) => ({
      document,
      score: scoreDocument(document, query, tokens),
      excerpt: pickExcerpt(document.content, query, tokens)
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return left.document.route.localeCompare(right.document.route, 'zh-Hans')
    })
    .slice(0, 10)
}

export default function SearchBar() {
  const history = useHistory()
  const { withBaseUrl } = useBaseUrlUtils()
  const documents = searchIndexData.documents || []
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [panelStyle, setPanelStyle] = useState({})
  const shellRef = useRef(null)
  const panelRef = useRef(null)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    function handleClick(event) {
      const isInsideInput = shellRef.current?.contains(event.target)
      const isInsidePanel = panelRef.current?.contains(event.target)

      if (!isInsideInput && !isInsidePanel) setIsOpen(false)
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    function updatePanelPosition() {
      if (!shellRef.current) return

      const rect = shellRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const width = Math.min(560, viewportWidth - 24)
      const left = Math.min(
        Math.max(12, rect.left),
        Math.max(12, viewportWidth - width - 12)
      )

      setPanelStyle({
        left,
        top: rect.bottom + 8,
        width
      })
    }

    if (isOpen && query) updatePanelPosition()

    window.addEventListener('resize', updatePanelPosition)
    window.addEventListener('scroll', updatePanelPosition, true)

    return () => {
      window.removeEventListener('resize', updatePanelPosition)
      window.removeEventListener('scroll', updatePanelPosition, true)
    }
  }, [isOpen, query])

  const results = useMemo(() => searchDocuments(documents, query), [documents, query])

  function openResult(route) {
    setIsOpen(false)
    history.push(withBaseUrl(route))
  }

  const searchPanel =
    isMounted && isOpen && query
      ? createPortal(
          <div className="doc-search-panel" ref={panelRef} style={panelStyle}>
            {results.length > 0 ? (
              results.map(({ document, excerpt }) => (
                <button
                  className="doc-search-result"
                  key={document.id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => openResult(document.route)}
                >
                  <span className="doc-search-result-title">
                    {document.sectionTitle}
                  </span>
                  <span className="doc-search-result-path">
                    {[...(document.parents || []), document.title].join(' / ')}
                  </span>
                  {excerpt && (
                    <span className="doc-search-result-excerpt">{excerpt}</span>
                  )}
                </button>
              ))
            ) : (
              <div className="doc-search-empty">未找到相关文档</div>
            )}
          </div>,
          document.body
        )
      : null

  return (
    <>
      <div className="doc-search" ref={shellRef}>
        <input
          className="doc-search-input"
          value={query}
          placeholder="搜索文档"
          onChange={(event) => {
            setQuery(event.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && results[0]) openResult(results[0].document.route)
            if (event.key === 'Escape') setIsOpen(false)
          }}
        />
      </div>
      {searchPanel}
    </>
  )
}
