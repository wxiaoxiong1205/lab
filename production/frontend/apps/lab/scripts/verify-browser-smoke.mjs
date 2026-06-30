#!/usr/bin/env node

import { chromium } from 'playwright'

const siteUrl = (process.argv[2] ?? 'https://lab.aidaxiong.fun').replace(/\/+$/, '')

const routes = [
  {
    name: 'home project list',
    path: '/home',
    requiredText: ['项目空间', '演示项目 - 大模型训练', '需求文档', '需求评审'],
  },
  {
    name: 'project overview',
    path: '/project/1001/home',
    requiredText: ['演示项目 - 大模型训练', '任务概览', '数据服务', '模型训练'],
  },
  {
    name: 'training datasets',
    path: '/project/1001/datasets',
    requiredText: ['训练数据管理', '数据集名称', 'showcase-', '需求文档'],
  },
]

const forbiddenText = [
  '未授权访问',
  '认证失效',
  'Request failed with status code 404',
]

async function checkRoute(page, route) {
  const pageErrors = []
  const onPageError = (error) => pageErrors.push(error.message)
  page.on('pageerror', onPageError)

  await page.goto(`${siteUrl}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)

  const bodyText = await page.locator('body').innerText({ timeout: 10000 })
  const rootChildren = await page.locator('#root > *').count()
  page.off('pageerror', onPageError)

  if (rootChildren === 0 || bodyText.trim().length < 20) {
    throw new Error(`${route.name} rendered blank content`)
  }

  const missingText = route.requiredText.filter((text) => !bodyText.includes(text))
  if (missingText.length > 0) {
    throw new Error(`${route.name} missing text: ${missingText.join(', ')}`)
  }

  const blockedText = forbiddenText.filter((text) => bodyText.includes(text))
  if (blockedText.length > 0) {
    throw new Error(`${route.name} contains failure text: ${blockedText.join(', ')}`)
  }

  if (pageErrors.length > 0) {
    throw new Error(`${route.name} raised page errors: ${pageErrors.join(' | ')}`)
  }

  return {
    name: route.name,
    url: page.url(),
    textLength: bodyText.trim().length,
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
  })

  const results = []
  try {
    for (const route of routes) {
      results.push(await checkRoute(page, route))
    }
  }
  finally {
    await browser.close()
  }

  console.log(JSON.stringify({
    status: 'ok',
    site: siteUrl,
    routes: results,
  }, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: 'error',
    site: siteUrl,
    message: error.message,
  }, null, 2))
  process.exit(1)
})
