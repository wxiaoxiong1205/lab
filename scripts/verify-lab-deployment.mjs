#!/usr/bin/env node

const siteUrl = process.argv[2] ?? 'https://lab.aidaxiong.fun'
const normalizedSiteUrl = siteUrl.replace(/\/+$/, '')

const requiredMainBundleMarkers = [
  {
    name: 'standalone backend endpoint',
    pattern: 'https://deepexilab-dev.deepexi.com/lab-backend',
  },
  {
    name: 'showcase preview token',
    pattern: 'local-preview-lab-tenant-admin-token',
  },
  {
    name: 'showcase preview env guard',
    pattern: 'VITE_SHOWCASE_PREVIEW',
  },
  {
    name: 'showcase static adapter',
    pattern: 'Unhandled showcase static endpoint',
  },
  {
    name: 'showcase static project endpoint',
    pattern: '/projects/list',
  },
]

async function fetchText(url) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`)
  }
  return response.text()
}

async function fetchHead(url) {
  const response = await fetch(url, { method: 'HEAD', redirect: 'follow' })
  return response.status
}

function findMainBundlePath(html) {
  const match = html.match(/\/assets\/index-[^'"]+\.js/)
  if (!match) {
    throw new Error('main bundle path was not found in index.html')
  }
  return match[0]
}

async function main() {
  const homeStatus = await fetchHead(`${normalizedSiteUrl}/home`)
  if (homeStatus !== 200) {
    throw new Error(`/home returned ${homeStatus}, expected 200`)
  }

  const html = await fetchText(`${normalizedSiteUrl}/`)
  const mainBundlePath = findMainBundlePath(html)
  const mainBundleUrl = `${normalizedSiteUrl}${mainBundlePath}`
  const mainBundle = await fetchText(mainBundleUrl)

  const missingMarkers = requiredMainBundleMarkers.filter(({ pattern }) => {
    return !mainBundle.includes(pattern)
  })

  if (missingMarkers.length > 0) {
    throw new Error(`main bundle is missing: ${missingMarkers.map(({ name }) => name).join(', ')}`)
  }

  console.log(JSON.stringify({
    status: 'ok',
    site: normalizedSiteUrl,
    homeStatus,
    mainBundlePath,
    verifiedMarkers: requiredMainBundleMarkers.map(({ name }) => name),
  }, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: 'error',
    site: normalizedSiteUrl,
    message: error.message,
  }, null, 2))
  process.exit(1)
})
