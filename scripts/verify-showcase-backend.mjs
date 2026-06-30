#!/usr/bin/env node

const defaultBackendUrl = 'https://deepexilab-dev.deepexi.com/lab-backend'
const backendUrl = (process.argv[2] ?? process.env.SHOWCASE_BACKEND_URL ?? defaultBackendUrl).replace(/\/+$/, '')
const apiBaseUrl = backendUrl.endsWith('/api/v1') ? backendUrl : `${backendUrl}/api/v1`
const showcasePreviewToken = 'local-preview-lab-tenant-admin-token'

const checks = [
  {
    name: 'project list',
    path: '/projects/list?page=1&size=1',
    validate: (data) => {
      const items = data?.items ?? data?.data?.items ?? data?.data?.records ?? data?.records
      return Array.isArray(items) && items.length > 0
    },
  },
  {
    name: 'menu',
    path: '/menu',
    validate: (data) => {
      const candidates = [
        data,
        data?.data,
        data?.menus,
        data?.items,
        data?.data?.menus,
        data?.data?.items,
      ]
      return candidates.some(Array.isArray)
    },
  },
  {
    name: 'menu visibility',
    path: '/permissions/menu/visible',
    validate: (data) => {
      const value = data?.visible ?? data?.data?.visible
      return typeof value === 'boolean'
    },
  },
]

async function checkEndpoint(check) {
  const url = `${apiBaseUrl}${check.path}`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${showcasePreviewToken}`,
      Accept: 'application/json',
    },
    redirect: 'follow',
  })

  let data = null
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    data = await response.json().catch(() => null)
  }
  else {
    await response.text().catch(() => '')
  }

  if (!response.ok) {
    throw new Error(`${check.name} returned ${response.status}`)
  }

  if (!check.validate(data)) {
    throw new Error(`${check.name} returned unexpected showcase data shape`)
  }

  return {
    name: check.name,
    status: response.status,
  }
}

async function main() {
  const results = []
  for (const check of checks) {
    results.push(await checkEndpoint(check))
  }

  console.log(JSON.stringify({
    status: 'ok',
    backend: apiBaseUrl,
    checks: results,
  }, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: 'error',
    backend: apiBaseUrl,
    message: error.message,
    hint: 'Enable SHOWCASE_PREVIEW_AUTH=true on the isolated showcase backend and run python -m app.init_db.init demo_showcase.',
  }, null, 2))
  process.exit(1)
})
