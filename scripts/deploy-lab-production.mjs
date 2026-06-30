#!/usr/bin/env node

import { spawn } from 'node:child_process'

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
  await run('npm', ['run', 'verify:github-push'])
  await run('npm', ['run', 'verify:vercel-preflight'])
  await run('npx', ['vercel@52.2.0', '--prod', '--yes', '--scope', 'wxiaoxiong1205s-projects'])
  await run('npm', ['run', 'verify:lab-deployment'])
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
