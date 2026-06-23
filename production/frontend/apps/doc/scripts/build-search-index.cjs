const fs = require('fs')
const path = require('path')
const { createSlugger } = require('@docusaurus/utils')

const rootDir = path.resolve(__dirname, '..')
const docsDir = path.join(rootDir, 'docs')
const staticDir = path.join(rootDir, 'static')
const outputFile = path.join(staticDir, 'doc-search-index.json')
const markdownOutputFile = path.join(rootDir, 'src', 'config', 'doc-markdown.generated.json')
const sidebarPath = path.join(rootDir, 'sidebars.cjs')

function walkMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return []

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return walkMarkdownFiles(fullPath)
    if (!entry.isFile() || !entry.name.endsWith('.md')) return []
    return [fullPath]
  })
}

function parseFrontMatter(markdown) {
  if (!markdown.startsWith('---')) {
    return { frontMatter: {}, body: markdown }
  }

  const end = markdown.indexOf('\n---', 3)
  if (end === -1) return { frontMatter: {}, body: markdown }

  const raw = markdown.slice(3, end).trim()
  const frontMatter = {}
  raw.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!match) return
    frontMatter[match[1]] = match[2].replace(/^['"]|['"]$/g, '').trim()
  })

  return { frontMatter, body: markdown.slice(end + 4).trim() }
}

function docIdFromFile(filePath) {
  const relative = path.relative(docsDir, filePath).replace(/\\/g, '/')
  return relative.replace(/\.md$/, '')
}

function routeFromDoc(id, frontMatter) {
  if (frontMatter.slug) return frontMatter.slug
  if (id === 'index') return '/'
  return `/${id}`
}

function normalizeText(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)]\(([^)]+)\)/g, '$1 $2')
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, '$1 $2')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_~|`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripHeadingNumber(title) {
  return title.replace(/^\d+(?:\.\d+)*\s+/, '').trim()
}

function extractSections(body, route) {
  const slugger = createSlugger()
  const lines = body.split(/\r?\n/)
  const headings = []

  lines.forEach((line, lineIndex) => {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/)
    if (heading) {
      const rawTitle = heading[2].replace(/\s+\{#[^}]+}$/, '').trim()
      const title = stripHeadingNumber(normalizeText(rawTitle))
      const idMatch = heading[2].match(/\s+\{#([^}]+)}$/)
      const anchor = idMatch ? idMatch[1] : slugger.slug(title)
      headings.push({
        level: heading[1].length,
        title,
        route: `${route}#${anchor}`,
        lineIndex
      })
    }
  })

  return headings.map((heading, index) => {
    const nextPeerOrParent = headings
      .slice(index + 1)
      .find((item) => item.level <= heading.level)
    const endLine = nextPeerOrParent ? nextPeerOrParent.lineIndex : lines.length
    const content = lines.slice(heading.lineIndex + 1, endLine).join('\n')

    return {
      level: heading.level,
      title: heading.title,
      route: heading.route,
      content: normalizeText(content)
    }
  })
}

function flattenSidebarItems(items, parents = [], result = new Map()) {
  items.forEach((item) => {
    if (typeof item === 'string') {
      result.set(item, { label: item, parents })
      return
    }

    if (!item || typeof item !== 'object') return

    if (item.type === 'doc') {
      result.set(item.id, {
        label: item.label || item.id,
        parents
      })
      return
    }

    if (item.type === 'category') {
      flattenSidebarItems(item.items || [], [...parents, item.label], result)
    }
  })

  return result
}

function loadSidebarMap() {
  delete require.cache[require.resolve(sidebarPath)]
  const sidebars = require(sidebarPath)
  return Object.values(sidebars).reduce((map, items) => {
    flattenSidebarItems(items, [], map)
    return map
  }, new Map())
}

function buildIndex() {
  const sidebarMap = loadSidebarMap()
  const files = walkMarkdownFiles(docsDir)
  const documents = []
  const markdownDocuments = {}

  files.forEach((filePath) => {
    const id = docIdFromFile(filePath)
    const markdown = fs.readFileSync(filePath, 'utf8')
    const { frontMatter, body } = parseFrontMatter(markdown)
    const sidebar = sidebarMap.get(id)
    const title =
      sidebar?.label ||
      frontMatter.sidebar_label ||
      frontMatter.title ||
      path.basename(id)
    const parents = sidebar?.parents || []
    const route = routeFromDoc(id, frontMatter)
    const pageText = normalizeText(body)

    markdownDocuments[id] = {
      filename: `${title}.md`,
      markdown
    }

    documents.push({
      id: `${id}::page`,
      docId: id,
      type: 'page',
      title,
      sectionTitle: title,
      parents,
      route,
      content: pageText
    })

    extractSections(body, route).forEach((section, index) => {
      documents.push({
        id: `${id}::${index}`,
        docId: id,
        type: 'section',
        title,
        sectionTitle: section.title,
        level: section.level,
        parents,
        route: section.route,
        content: section.content
      })
    })
  })

  fs.mkdirSync(staticDir, { recursive: true })
  fs.writeFileSync(
    outputFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        documents
      },
      null,
      2
    )
  )
  console.log(`Search index generated: ${documents.length} records`)

  fs.mkdirSync(path.dirname(markdownOutputFile), { recursive: true })
  fs.writeFileSync(
    markdownOutputFile,
    JSON.stringify(markdownDocuments, null, 2)
  )
  console.log(`Markdown export data generated: ${Object.keys(markdownDocuments).length} records`)
}

buildIndex()
