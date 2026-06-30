#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'

const repoRoot = process.cwd()
const staticApiPath = path.join(repoRoot, 'production/frontend/apps/lab/src/showcase/staticApi.ts')
const apiClientPath = path.join(repoRoot, 'production/frontend/apps/lab/src/services/apiClient.ts')

const requiredEndpointMarkers = [
  '/projects/list',
  '/training-datasets/project/1001',
  '/data_cleaning/1001/tasks',
  '/training_tasks/project/1001',
  '/notebooks/1001/list',
  '/inference-result-datasets/project/1001/list',
  '/evaluation-tasks/project/1001',
  '/machine-learning-datasets/dataset/1001/page',
  '/inference_tasks/project/1001',
  '/data-insights/project/1001/tasks',
  '/data-augmentations/project/1001/tasks',
  '/label/1001/tasks',
  '/online_annotation_service/project/1001/list',
]

const toSourceRegexMarker = (endpoint) => endpoint.replaceAll('/', '\\/')

const run = (cmd, args, options = {}) => {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
      },
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
    }, options.timeout ?? 180000)

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

function requireFileContains(filePath, markers) {
  if (!existsSync(filePath)) {
    throw new Error(`${path.relative(repoRoot, filePath)} is missing`)
  }
  const text = readFileSync(filePath, 'utf8')
  const missing = markers.filter((marker) => !text.includes(marker))
  if (missing.length > 0) {
    throw new Error(`${path.relative(repoRoot, filePath)} is missing showcase markers: ${missing.join(', ')}`)
  }
}

async function main() {
  requireFileContains(staticApiPath, [
    'VITE_SHOWCASE_STATIC',
    'showcaseStaticAdapter',
    ...requiredEndpointMarkers.map(toSourceRegexMarker),
  ])
  requireFileContains(apiClientPath, [
    'showcaseStaticAdapter',
    'getShowcaseStaticResponse',
  ])

  const build = await run('pnpm', ['--dir', 'production/frontend', '--filter', 'lab', 'build'], {
    cwd: repoRoot,
    env: {
      VITE_SHOWCASE_STATIC: 'true',
      VITE_SHOWCASE_PREVIEW: 'true',
      VITE_API_BASE_URL: 'https://deepexilab-dev.deepexi.com/lab-backend',
    },
  })

  console.log(JSON.stringify({
    status: 'ok',
    mode: 'static',
    checkedEndpoints: requiredEndpointMarkers,
    buildOutput: build.stdout.split('\n').filter(Boolean).slice(-6),
  }, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: 'error',
    mode: 'static',
    message: error.message,
  }, null, 2))
  if (error.stderr) {
    console.error(error.stderr.trim())
  }
  process.exit(1)
})
