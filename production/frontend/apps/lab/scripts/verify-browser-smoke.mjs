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
  {
    name: 'data cleaning',
    path: '/project/1001/data-cleaning',
    requiredText: ['数据清洗', '任务名称', 'showcase-', '需求文档'],
  },
  {
    name: 'data insight',
    path: '/project/1001/data-insight',
    requiredText: ['数据洞察', '数据集名称', 'showcase-', '需求文档'],
  },
  {
    name: 'data augmentation',
    path: '/project/1001/data-augmentation',
    requiredText: ['数据增强', '任务名称', 'showcase-', '需求文档'],
  },
  {
    name: 'data annotation',
    path: '/project/1001/data-annotation',
    requiredText: ['数据标注', '任务名称', '演示-', '需求文档'],
  },
  {
    name: 'training tasks',
    path: '/project/1001/finetune/tasks',
    requiredText: ['大模型训练', '训练任务名称', 'showcase-', '需求文档'],
  },
  {
    name: 'model list',
    path: '/project/1001/model',
    requiredText: ['我的模型', '模型名称', 'showcase-', '需求文档'],
  },
  {
    name: 'notebooks',
    path: '/project/1001/finetune/notebooks/tabs/mine',
    requiredText: ['在线Notebook', 'Notebook名称', 'showcase-', '需求文档'],
  },
  {
    name: 'inference results',
    path: '/project/1001/Inference',
    requiredText: ['推理结果集', '数据集名称', 'showcase-', '需求文档'],
  },
  {
    name: 'effect evaluation',
    path: '/project/1001/effect-evaluation',
    requiredText: ['效果评估', '任务名称', 'showcase-', '需求文档'],
  },
  {
    name: 'business effect evaluation',
    path: '/project/1001/business-effect-evaluation',
    requiredText: ['业务效果评估', '任务名称', 'showcase-', '需求文档'],
  },
  {
    name: 'preset model market',
    path: '/project/1001/preset-model',
    requiredText: ['小模型调参', '计算机视觉模型', '商品图像分类实验', '需求文档'],
  },
  {
    name: 'preset model tasks',
    path: '/project/1001/preset-model/tasks',
    requiredText: ['计算机视觉模型任务', '商品图像分类实验', '需求文档'],
  },
  {
    name: 'machine datasets',
    path: '/project/1001/machine-data-management',
    requiredText: ['数据管理', '数据集名称', 'showcase-', '需求文档'],
  },
  {
    name: 'machine deployments',
    path: '/project/1001/machine-model-deployment',
    requiredText: ['机器模型部署', '服务名称', 'showcase-', '需求文档'],
  },
  {
    name: 'machine annotation',
    path: '/project/1001/machine-annotation',
    requiredText: ['机器学习标注', '任务名称', '演示-', '需求文档'],
  },
]

const forbiddenText = [
  '未授权访问',
  '认证失效',
  'Request failed with status code 404',
]

async function checkRoute(page, route) {
  const pageErrors = []
  const apiFailures = []
  const onPageError = (error) => pageErrors.push(error.message)
  const onResponse = (response) => {
    const url = response.url()
    if (!url.includes('/api/') && !url.includes('/openapi/')) {
      return
    }

    const status = response.status()
    if (status === 401 || status === 403 || status === 404 || status >= 500) {
      apiFailures.push(`${status} ${url}`)
    }
  }
  page.on('pageerror', onPageError)
  page.on('response', onResponse)

  await page.goto(`${siteUrl}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1500)

  const bodyText = await page.locator('body').innerText({ timeout: 10000 })
  const rootChildren = await page.locator('#root > *').count()
  page.off('pageerror', onPageError)
  page.off('response', onResponse)

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

  if (apiFailures.length > 0) {
    throw new Error(`${route.name} API failures: ${apiFailures.join(' | ')}`)
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
