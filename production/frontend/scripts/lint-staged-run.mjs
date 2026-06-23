#!/usr/bin/env node
/**
 * lint-staged 按 app 执行 eslint：在对应 app 目录下用该 app 的 eslint 配置校验暂存文件。
 * 用法：node scripts/lint-staged-run.mjs <appName> [...stagedFiles]
 * 例如：node scripts/lint-staged-run.mjs dgi apps/dgi/src/App.tsx
 */
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const appName = process.argv[2]
const stagedFiles = process.argv.slice(3).filter(Boolean)

if (!appName || stagedFiles.length === 0) {
  process.exit(0)
}

const prefix = `apps/${appName}/`
const appDir = path.join(root, 'apps', appName)
const relativePaths = stagedFiles
  .map((f) => {
    const normalized = f.replace(/\\/g, '/')
    return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : f
  })
  .filter(Boolean)

if (relativePaths.length === 0) {
  process.exit(0)
}

const args = relativePaths.map((p) => (p.includes(' ') ? `"${p}"` : p)).join(' ')
// 仅校验不自动修复，保持提交时只检查、不改写文件
// 若需提交时自动 fix，可改为: eslint --fix
try {
  execSync(`pnpm exec eslint ${args}`, {
    cwd: appDir,
    stdio: 'inherit',
    shell: true,
  })
} catch {
  process.exit(1)
}
