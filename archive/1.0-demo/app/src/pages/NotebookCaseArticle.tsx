import React from 'react'
import { Card, Tag, Typography } from 'antd'
import type { BuiltinNotebookCase } from './notebookBuiltinCases'

const { Paragraph, Text, Title } = Typography

type NotebookCaseArticleProps = {
  caseRecord: Pick<BuiltinNotebookCase, 'name' | 'description'> &
    Partial<Pick<BuiltinNotebookCase, 'summary' | 'category' | 'taskType' | 'datasetName' | 'runtime' | 'tags'>>
}

const articleCodeStyle: React.CSSProperties = {
  margin: 0,
  padding: '14px 16px',
  borderRadius: 12,
  background: '#0f172a',
  color: '#e2e8f0',
  fontSize: 13,
  lineHeight: 1.7,
  fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflowX: 'auto',
}

const inlineCodeStyle: React.CSSProperties = {
  padding: '1px 6px',
  borderRadius: 6,
  background: '#f1f5f9',
  color: '#0f172a',
  fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace',
  fontSize: '0.92em',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  margin: '12px 0 18px',
  fontSize: 14,
}

const tableCellStyle: React.CSSProperties = {
  border: '1px solid #e2e8f0',
  padding: '9px 10px',
  textAlign: 'left',
  verticalAlign: 'top',
}

function renderInline(text: string): React.ReactNode[] {
  const segments: React.ReactNode[] = []
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push(text.slice(lastIndex, match.index))
    }

    const token = match[0]
    if (token.startsWith('`')) {
      segments.push(
        <code key={`${match.index}-code`} style={inlineCodeStyle}>
          {token.slice(1, -1)}
        </code>,
      )
    } else {
      segments.push(
        <Text key={`${match.index}-strong`} strong>
          {token.slice(2, -2)}
        </Text>,
      )
    }

    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex))
  }

  return segments
}

function collectTable(lines: string[], startIndex: number) {
  const rows: string[][] = []
  let index = startIndex

  while (index < lines.length && /^\s*\|.+\|\s*$/.test(lines[index])) {
    const cells = lines[index]
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(cell => cell.trim())

    const isDivider = cells.every(cell => /^:?-{3,}:?$/.test(cell))
    if (!isDivider) {
      rows.push(cells)
    }
    index += 1
  }

  return { rows, nextIndex: index }
}

function renderMarkdownBlocks(markdown: string) {
  const lines = markdown.split('\n')
  const blocks: React.ReactNode[] = []
  let index = 0
  let codeBuffer: string[] = []
  let inCode = false
  let codeLang = ''
  let listBuffer: string[] = []
  let paragraphBuffer: string[] = []

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return
    const text = paragraphBuffer.join(' ').trim()
    if (text) {
      blocks.push(
        <Paragraph key={`p-${blocks.length}`} style={{ marginBottom: 14, lineHeight: 1.9, color: '#1f2937' }}>
          {renderInline(text)}
        </Paragraph>,
      )
    }
    paragraphBuffer = []
  }

  const flushList = () => {
    if (!listBuffer.length) return
    blocks.push(
      <ul key={`ul-${blocks.length}`} style={{ margin: '0 0 16px 20px', padding: 0, lineHeight: 1.9 }}>
        {listBuffer.map((item, itemIndex) => (
          <li key={`${itemIndex}-${item}`} style={{ color: '#1f2937' }}>
            {renderInline(item)}
          </li>
        ))}
      </ul>,
    )
    listBuffer = []
  }

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (trimmed.startsWith('~~~')) {
      if (inCode) {
        blocks.push(
          <div key={`code-${blocks.length}`} style={{ marginBottom: 18 }}>
            {codeLang && (
              <div style={{ marginBottom: 6 }}>
                <Tag color="blue">{codeLang}</Tag>
              </div>
            )}
            <pre style={articleCodeStyle}>{codeBuffer.join('\n')}</pre>
          </div>,
        )
        inCode = false
        codeBuffer = []
        codeLang = ''
      } else {
        flushParagraph()
        flushList()
        inCode = true
        codeLang = trimmed.replace(/^~~~/, '').trim()
      }
      index += 1
      continue
    }

    if (inCode) {
      codeBuffer.push(line)
      index += 1
      continue
    }

    if (!trimmed) {
      flushParagraph()
      flushList()
      index += 1
      continue
    }

    const imageMatch = trimmed.match(/^!\[(.*)\]\((.*)\)$/)
    if (imageMatch) {
      flushParagraph()
      flushList()
      blocks.push(
        <figure key={`img-${blocks.length}`} style={{ margin: '18px 0 26px' }}>
          <img
            alt={imageMatch[1]}
            src={imageMatch[2]}
            style={{
              display: 'block',
              width: '100%',
              maxWidth: 980,
              margin: '0 auto',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
            }}
          />
          {imageMatch[1] && (
            <figcaption style={{ textAlign: 'center', color: '#64748b', marginTop: 8 }}>{imageMatch[1]}</figcaption>
          )}
        </figure>,
      )
      index += 1
      continue
    }

    if (/^\s*\|.+\|\s*$/.test(line)) {
      flushParagraph()
      flushList()
      const { rows, nextIndex } = collectTable(lines, index)
      if (rows.length) {
        blocks.push(
          <table key={`table-${blocks.length}`} style={tableStyle}>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${rowIndex}-${row.join('-')}`}>
                  {row.map((cell, cellIndex) => {
                    const CellTag = rowIndex === 0 ? 'th' : 'td'
                    return (
                      <CellTag
                        key={`${cellIndex}-${cell}`}
                        style={{
                          ...tableCellStyle,
                          background: rowIndex === 0 ? '#f8fafc' : '#ffffff',
                          fontWeight: rowIndex === 0 ? 700 : 400,
                        }}
                      >
                        {renderInline(cell)}
                      </CellTag>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>,
        )
      }
      index = nextIndex
      continue
    }

    if (trimmed.startsWith('### ')) {
      flushParagraph()
      flushList()
      blocks.push(
        <Title key={`h3-${blocks.length}`} level={4} style={{ margin: '24px 0 12px' }}>
          {trimmed.replace(/^### /, '')}
        </Title>,
      )
      index += 1
      continue
    }

    if (trimmed.startsWith('## ')) {
      flushParagraph()
      flushList()
      blocks.push(
        <Title key={`h2-${blocks.length}`} level={3} style={{ margin: '30px 0 14px' }}>
          {trimmed.replace(/^## /, '')}
        </Title>,
      )
      index += 1
      continue
    }

    if (trimmed.startsWith('# ')) {
      flushParagraph()
      flushList()
      blocks.push(
        <Title key={`h1-${blocks.length}`} level={2} style={{ margin: '0 0 16px' }}>
          {trimmed.replace(/^# /, '')}
        </Title>,
      )
      index += 1
      continue
    }

    if (/^- /.test(trimmed)) {
      flushParagraph()
      listBuffer.push(trimmed.replace(/^- /, ''))
      index += 1
      continue
    }

    paragraphBuffer.push(trimmed)
    index += 1
  }

  flushParagraph()
  flushList()

  return blocks
}

const NotebookCaseArticle: React.FC<NotebookCaseArticleProps> = ({ caseRecord }) => (
  <Card
    style={{
      borderRadius: 18,
      border: '1px solid #dbe5f3',
      boxShadow: '0 16px 32px rgba(15, 23, 42, 0.05)',
    }}
  >
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 12,
        marginBottom: 24,
      }}
    >
      {[
        ['任务类型', caseRecord.taskType || '-'],
        ['数据路径', caseRecord.datasetName || '-'],
        ['运行环境', caseRecord.runtime || '-'],
        ['案例分类', caseRecord.category || '-'],
      ].map(([label, value]) => (
        <div key={label} style={{ padding: 14, borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div style={{ color: '#64748b', fontSize: 12, marginBottom: 6 }}>{label}</div>
          <Text strong style={{ color: '#0f172a' }}>
            {value}
          </Text>
        </div>
      ))}
    </div>
    {caseRecord.summary && (
      <Paragraph style={{ marginBottom: 18, color: '#475569', lineHeight: 1.8 }}>{caseRecord.summary}</Paragraph>
    )}
    <div style={{ marginBottom: 20 }}>
      {(caseRecord.tags ?? []).map(tag => (
        <Tag key={tag} color="blue" style={{ marginBottom: 8 }}>
          {tag}
        </Tag>
      ))}
    </div>
    <div>{renderMarkdownBlocks(caseRecord.description)}</div>
  </Card>
)

export default NotebookCaseArticle
