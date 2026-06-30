#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const run = (cmd, args, options = {}) => {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] })
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

    if (options.input) {
      child.stdin.write(options.input)
    }
    child.stdin.end()
  })
}

const redact = (value) => value.replace(/^password=.*/m, 'password=<redacted>')
const forbiddenPathPrefixes = [
  '.github-token.local',
  '.env',
  '.vercel/.env',
  '.playwright-cli/',
  'Project/',
]
const expectedRemote = 'https://github.com/wxiaoxiong1205/lab.git'
const expectedHttpProxy = process.env.GITHUB_HTTP_PROXY ?? 'http://127.0.0.1:7897'

const parseStatusLines = (status) => {
  return status
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line && !line.startsWith('##'))
    .map((line) => ({
      code: line.slice(0, 2),
      path: line.slice(3),
      raw: line,
    }))
}

const isForbiddenPath = (path) => forbiddenPathPrefixes.some((prefix) => path === prefix.replace(/\/$/, '') || path.startsWith(prefix))

async function main() {
  const branch = (await run('git', ['branch', '--show-current'])).stdout.trim()
  if (!branch) {
    throw new Error('当前不在普通分支上，无法确认推送目标。')
  }

  const status = (await run('git', ['status', '--short', '--branch'])).stdout.trim()
  console.log(status)
  const statusEntries = parseStatusLines(status)
  const forbiddenTrackedOrStaged = statusEntries.filter((entry) => entry.code !== '??' && isForbiddenPath(entry.path))
  if (forbiddenTrackedOrStaged.length > 0) {
    throw new Error(`禁止提交的路径已进入跟踪或暂存状态：\n${forbiddenTrackedOrStaged.map((entry) => entry.raw).join('\n')}`)
  }
  const forbiddenUntracked = statusEntries.filter((entry) => entry.code === '??' && isForbiddenPath(entry.path))
  if (forbiddenUntracked.length > 0) {
    console.warn(`warning: 存在未跟踪的禁止提交路径，确认不要 git add：\n${forbiddenUntracked.map((entry) => entry.raw).join('\n')}`)
  }

  if (existsSync('.github-token.local')) {
    await run('git', ['check-ignore', '-q', '.github-token.local']).catch(() => {
      throw new Error('.github-token.local 存在但未被 git ignore 覆盖。')
    })
    console.log('.github-token.local=ignored')
  }

  const remote = (await run('git', ['remote', 'get-url', 'origin'])).stdout.trim()
  if (remote !== expectedRemote) {
    throw new Error(`origin 必须使用稳定 HTTPS 地址：${expectedRemote}。当前：${remote}`)
  }
  console.log(`origin=${remote.replace(/\/\/.*@/, '//<redacted>@')}`)

  const httpProxy = (await run('git', ['config', '--get', 'http.proxy']).catch(() => ({ stdout: '' }))).stdout.trim()
  if (httpProxy !== expectedHttpProxy) {
    throw new Error(`git http.proxy 必须固定为 ${expectedHttpProxy}。当前：${httpProxy || '<empty>'}`)
  }
  console.log(`http.proxy=${httpProxy}`)

  const helper = (await run('git', ['config', '--get-all', 'credential.helper']).catch(() => ({ stdout: '' }))).stdout.trim()
  if (!helper) {
    throw new Error('未配置 Git credential.helper，普通 HTTPS push 可能无法读取凭据。')
  }
  console.log('credential.helper=configured')

  const credential = await run('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
  })
  const filled = credential.stdout
  if (!/^username=.+/m.test(filled) || !/^password=.+/m.test(filled)) {
    throw new Error(`GitHub 凭据不完整：\n${redact(filled)}`)
  }
  console.log(redact(filled).trim())

  const remoteHead = await run('git', ['ls-remote', '--heads', 'origin', branch], { timeout: 60000 })
  const line = remoteHead.stdout.trim()
  if (!line) {
    throw new Error(`远端分支不存在或不可读：origin/${branch}`)
  }
  console.log(line)
  await run('git', ['fetch', 'origin', branch], { timeout: 90000 })
  console.log(`fetch=origin/${branch}`)

  const pushDryRun = await run('git', ['push', '--dry-run', '--porcelain', 'origin', `HEAD:refs/heads/${branch}`], { timeout: 90000 })
  console.log(pushDryRun.stdout.trim() || pushDryRun.stderr.trim() || 'push dry-run ok')
  console.log('github push readiness passed')
}

main().catch((error) => {
  console.error('github push readiness failed')
  console.error(error.message)
  if (error.stderr) {
    console.error(error.stderr.trim())
  }
  process.exit(1)
})
