#!/usr/bin/env node

import { spawn } from 'node:child_process'

const runCapture = (cmd, args, options = {}) => {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code, signal) => {
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

const run = (cmd, args, options = {}) => {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${cmd} ${args.join(' ')} failed with ${signal || code}`))
    })
  })
}

async function main() {
  const status = (await runCapture('git', ['status', '--porcelain'])).stdout.trim()
  if (status && process.env.ALLOW_DIRTY_VERCEL_DEPLOY !== '1') {
    throw new Error('Vercel production deploy requires a clean working tree. Commit/stash unrelated work, or set ALLOW_DIRTY_VERCEL_DEPLOY=1 only for an intentional local-directory deploy.')
  }

  await run('npm', ['run', 'verify:github-push'])
  await run('npm', ['run', 'verify:vercel-preflight'])
  await run('npm', ['run', 'verify:showcase-static'])
  await run('npx', ['vercel@52.2.0', '--prod', '--yes', '--scope', 'wxiaoxiong1205s-projects'])
  await run('npm', ['run', 'verify:lab-deployment'])
  await run('npm', ['run', 'verify:lab-browser'])
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
