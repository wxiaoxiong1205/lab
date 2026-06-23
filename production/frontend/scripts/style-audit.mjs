import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const targetArg = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
const targetDir = path.resolve(root, targetArg || 'apps/lab/src')
const strict = process.argv.includes('--strict')

const sourceExts = new Set(['.tsx', '.jsx'])
const styleExts = new Set(['.tsx', '.jsx', '.css', '.scss', '.less'])
const ignoredDirs = new Set(['node_modules', 'dist', 'build', '.git'])

const patterns = {
  inlineStyle: /style\s*=\s*\{/g,
  styleTag: /<style\b/g,
  hardColor: /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)/g,
  hardBorderOrRadius: /\b(?:border(?:Color|Radius)?|boxShadow|background(?:Color)?)\s*[:=]/g,
}

function walk(dir) {
  const entries = readdirSync(dir)
  const files = []

  for (const entry of entries) {
    if (ignoredDirs.has(entry)) continue

    const filePath = path.join(dir, entry)
    const stat = statSync(filePath)

    if (stat.isDirectory()) {
      files.push(...walk(filePath))
      continue
    }

    files.push(filePath)
  }

  return files
}

function countMatches(content, pattern) {
  return content.match(pattern)?.length || 0
}

function toRelative(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/')
}

if (!existsSync(targetDir)) {
  console.error(`[style-audit] target not found: ${targetDir}`)
  process.exit(1)
}

const files = walk(targetDir)
const records = []

for (const filePath of files) {
  const ext = path.extname(filePath)
  if (!styleExts.has(ext)) continue

  const content = readFileSync(filePath, 'utf8')
  const isSource = sourceExts.has(ext)
  const record = {
    file: toRelative(filePath),
    inlineStyle: isSource ? countMatches(content, patterns.inlineStyle) : 0,
    styleTag: isSource ? countMatches(content, patterns.styleTag) : 0,
    hardColor: countMatches(content, patterns.hardColor),
    hardBorderOrRadius: countMatches(content, patterns.hardBorderOrRadius),
  }

  if (
    record.inlineStyle
    || record.styleTag
    || record.hardColor
    || record.hardBorderOrRadius
  ) {
    records.push(record)
  }
}

const totals = records.reduce(
  (sum, record) => ({
    inlineStyle: sum.inlineStyle + record.inlineStyle,
    styleTag: sum.styleTag + record.styleTag,
    hardColor: sum.hardColor + record.hardColor,
    hardBorderOrRadius: sum.hardBorderOrRadius + record.hardBorderOrRadius,
  }),
  { inlineStyle: 0, styleTag: 0, hardColor: 0, hardBorderOrRadius: 0 },
)

const topFiles = [...records]
  .sort((a, b) => {
    const aScore = a.inlineStyle * 4 + a.styleTag * 8 + a.hardColor + a.hardBorderOrRadius
    const bScore = b.inlineStyle * 4 + b.styleTag * 8 + b.hardColor + b.hardBorderOrRadius
    return bScore - aScore
  })
  .slice(0, 30)

console.log('[style-audit] target:', toRelative(targetDir))
console.table(totals)

if (topFiles.length > 0) {
  console.log('[style-audit] top files:')
  console.table(topFiles)
}

if (strict && (totals.inlineStyle || totals.styleTag || totals.hardColor || totals.hardBorderOrRadius)) {
  process.exit(1)
}
