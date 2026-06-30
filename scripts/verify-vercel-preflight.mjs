#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const expected = {
  projectName: 'lab',
  projectId: 'prj_wn14DtmRx509BEqsrZITUOmcK0Sd',
  orgId: 'team_51z30QShX4MR1YyW1h0RUebV',
  scope: 'wxiaoxiong1205s-projects',
  rootDirectory: 'production/frontend',
  outputDirectory: 'apps/lab/dist',
  buildCommand: 'pnpm --filter lab exec vite build',
  installCommand: 'pnpm install --no-frozen-lockfile --config.recursive-install=true',
}

const localProjectFiles = [
  '.vercel/project.json',
  'production/frontend/.vercel/project.json',
  'production/frontend/apps/lab/.vercel/project.json',
]

const riskyProjectFiles = [
  'archive/1.0-demo/app/.vercel/project.json',
]

const run = (cmd, args, options = {}) => {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      const error = new Error(`${cmd} ${args.join(' ')} timed out`)
      error.stdout = stdout
      error.stderr = stderr
      reject(error)
    }, options.timeout ?? 45000)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => {
      clearTimeout(timer)
      error.stdout = stdout
      error.stderr = stderr
      reject(error)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      const error = new Error(`${cmd} ${args.join(' ')} failed with ${signal || code}`)
      error.stdout = stdout
      error.stderr = stderr
      reject(error)
    })
  })
}

const readProjectJson = (repoRoot, relativePath) => {
  const filePath = path.join(repoRoot, relativePath)
  if (!existsSync(filePath)) {
    return null
  }
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

const requireEqual = (label, actual, wanted) => {
  if (actual !== wanted) {
    throw new Error(`${label} expected ${wanted}, got ${actual || '<empty>'}`)
  }
}

const parseInspectValue = (inspectText, label) => {
  const line = inspectText.split('\n').find((item) => item.trim().startsWith(label))
  if (!line) {
    return ''
  }
  return line.replace(label, '').trim()
}

async function main() {
  const repoRoot = (await run('git', ['rev-parse', '--show-toplevel'])).stdout.trim()
  const cwd = process.cwd()
  if (path.resolve(cwd) !== path.resolve(repoRoot)) {
    throw new Error(`Vercel production deploy must run from repo root: ${repoRoot}. Current cwd: ${cwd}`)
  }

  const remote = (await run('git', ['remote', 'get-url', 'origin'])).stdout.trim()
  if (remote !== 'https://github.com/wxiaoxiong1205/lab.git') {
    throw new Error(`origin must use the stable HTTPS remote. Current origin: ${remote}`)
  }

  for (const relativePath of localProjectFiles) {
    const project = readProjectJson(repoRoot, relativePath)
    if (!project) {
      console.warn(`warning: ${relativePath} is missing; Vercel CLI may relink interactively if this is the active cwd.`)
      continue
    }
    requireEqual(`${relativePath}.projectName`, project.projectName, expected.projectName)
    requireEqual(`${relativePath}.projectId`, project.projectId, expected.projectId)
    requireEqual(`${relativePath}.orgId`, project.orgId, expected.orgId)
  }

  const riskyBindings = riskyProjectFiles
    .map((relativePath) => ({ relativePath, project: readProjectJson(repoRoot, relativePath) }))
    .filter(({ project }) => project?.projectId === expected.projectId)
  if (riskyBindings.length > 0) {
    console.warn(`warning: archived or non-production folders still contain local Vercel bindings to lab:\n${riskyBindings.map(({ relativePath }) => `- ${relativePath}`).join('\n')}`)
  }

  const inspect = await run('npx', ['vercel@52.2.0', 'project', 'inspect', expected.projectName, '--scope', expected.scope], {
    cwd: repoRoot,
    timeout: 90000,
  })
  const inspectText = `${inspect.stdout}\n${inspect.stderr}`
  requireEqual('Vercel Project', parseInspectValue(inspectText, 'Name'), expected.projectName)
  requireEqual('Vercel Project ID', parseInspectValue(inspectText, 'ID'), expected.projectId)
  requireEqual('Vercel Root Directory', parseInspectValue(inspectText, 'Root Directory'), expected.rootDirectory)
  requireEqual('Vercel Build Command', parseInspectValue(inspectText, 'Build Command'), expected.buildCommand)
  requireEqual('Vercel Output Directory', parseInspectValue(inspectText, 'Output Directory'), expected.outputDirectory)
  requireEqual('Vercel Install Command', parseInspectValue(inspectText, 'Install Command'), expected.installCommand)

  console.log(JSON.stringify({
    status: 'ok',
    project: expected.projectName,
    projectId: expected.projectId,
    scope: expected.scope,
    rootDirectory: expected.rootDirectory,
    outputDirectory: expected.outputDirectory,
    buildCommand: expected.buildCommand,
    installCommand: expected.installCommand,
  }, null, 2))
}

main().catch((error) => {
  console.error('vercel preflight failed')
  console.error(error.message)
  if (error.stderr) {
    console.error(error.stderr.trim())
  }
  process.exit(1)
})
