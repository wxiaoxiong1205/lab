const http = require('http')
const https = require('https')
const fs = require('fs/promises')
const path = require('path')

const PORT = Number(process.env.DOC_CONFIG_PORT || 5174)
const appRoot = path.resolve(__dirname, '..')
const docsRoot = path.join(appRoot, 'docs')
const YUQUE_IMAGE_RE =
  /https:\/\/cdn\.nlark\.com\/yuque\/0\/\d{4}\/[^/\s)>"']+\/[^/\s)>"']+\/([^)\s>"']+)/g

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let value = i
    for (let j = 0; j < 8; j += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[i] = value >>> 0
  }
  return table
})()

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  })
  res.end(JSON.stringify(payload))
}

function normalizeDocPath(input) {
  const raw = String(input || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^docs\//, '')

  if (!raw) {
    throw new Error('文档路径不能为空')
  }

  const withExt = /\.(md|mdx)$/i.test(raw) ? raw : `${raw}.md`
  const fullPath = path.resolve(docsRoot, withExt)
  const relativeCheck = path.relative(docsRoot, fullPath)

  if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) {
    throw new Error('文档路径不能超出 apps/doc/docs 目录')
  }

  return {
    relativePath: withExt,
    fullPath
  }
}

function todayStamp() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date = new Date()) {
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2)
  const dosDate =
    ((date.getFullYear() - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate()
  return { time, date: dosDate }
}

function createZip(entries) {
  const fileParts = []
  const centralParts = []
  let offset = 0
  const { time, date } = dosDateTime()

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8')
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data)
    const checksum = crc32(data)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0x0800, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt16LE(time, 10)
    localHeader.writeUInt16LE(date, 12)
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(data.length, 18)
    localHeader.writeUInt32LE(data.length, 22)
    localHeader.writeUInt16LE(nameBuffer.length, 26)
    localHeader.writeUInt16LE(0, 28)
    fileParts.push(localHeader, nameBuffer, data)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0x0800, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt16LE(time, 12)
    centralHeader.writeUInt16LE(date, 14)
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(data.length, 20)
    centralHeader.writeUInt32LE(data.length, 24)
    centralHeader.writeUInt16LE(nameBuffer.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)
    centralParts.push(centralHeader, nameBuffer)

    offset += localHeader.length + nameBuffer.length + data.length
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const endHeader = Buffer.alloc(22)
  endHeader.writeUInt32LE(0x06054b50, 0)
  endHeader.writeUInt16LE(0, 4)
  endHeader.writeUInt16LE(0, 6)
  endHeader.writeUInt16LE(entries.length, 8)
  endHeader.writeUInt16LE(entries.length, 10)
  endHeader.writeUInt32LE(centralSize, 12)
  endHeader.writeUInt32LE(offset, 16)
  endHeader.writeUInt16LE(0, 20)

  return Buffer.concat([...fileParts, ...centralParts, endHeader])
}

function downloadBuffer(url, redirectCount = 0) {
  if (redirectCount > 5) {
    return Promise.reject(new Error(`重定向次数过多：${url}`))
  }

  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http
    const req = client.get(
      url,
      {
        headers: {
          Referer: 'https://www.yuque.com/',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
        }
      },
      (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume()
        const nextUrl = new URL(res.headers.location, url).toString()
        downloadBuffer(nextUrl, redirectCount + 1).then(resolve, reject)
        return
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume()
        reject(new Error(`下载失败 ${res.statusCode}：${url}`))
        return
      }

      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      }
    )
    req.setTimeout(30000, () => {
      req.destroy(new Error(`下载超时：${url}`))
    })
    req.on('error', reject)
  })
}

function collectYuqueImages(markdown) {
  const images = []
  const seen = new Set()
  for (const match of markdown.matchAll(YUQUE_IMAGE_RE)) {
    const url = match[0]
    const filename = decodeURIComponent(match[1])
    if (seen.has(url)) continue
    seen.add(url)
    images.push({ url, filename })
  }
  return images
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 20 * 1024 * 1024) {
        reject(new Error('请求内容过大'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

async function handleWriteDoc(req, res) {
  const body = JSON.parse(await readBody(req))
  const { relativePath, fullPath } = normalizeDocPath(body.path)
  const content = String(body.content || '')

  await fs.mkdir(path.dirname(fullPath), { recursive: true })
  await fs.writeFile(fullPath, content, 'utf8')

  sendJson(res, 200, {
    ok: true,
    path: `docs/${relativePath}`
  })
}

async function handleWriteAll(req, res) {
  const body = JSON.parse(await readBody(req))
  const files = Array.isArray(body.files) ? body.files : []
  const written = []

  for (const file of files) {
    const { relativePath, fullPath } = normalizeDocPath(file.path || file.filename)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, String(file.content || ''), 'utf8')
    written.push(`docs/${relativePath}`)
  }

  if (typeof body.sidebar === 'string') {
    await fs.writeFile(path.join(appRoot, 'sidebars.cjs'), body.sidebar, 'utf8')
    written.push('sidebars.cjs')
  }

  sendJson(res, 200, {
    ok: true,
    written
  })
}

async function handleProcessMarkdownAssets(req, res) {
  const body = JSON.parse(await readBody(req))
  const content = String(body.content || '')
  const date = body.date ? String(body.date) : todayStamp()
  const images = collectYuqueImages(content)
  const entries = []
  const failed = []
  let processedContent = content

  for (const image of images) {
    const localUrl = `/lab-backend/api/v1/storage/download-file/images/${date}/${image.filename}`
    processedContent = processedContent.split(image.url).join(localUrl)

    if (entries.some((entry) => entry.name === image.filename)) continue

    try {
      const data = await downloadBuffer(image.url)
      entries.push({
        name: image.filename,
        data
      })
    } catch (error) {
      failed.push({
        url: image.url,
        filename: image.filename,
        message: error.message
      })
    }
  }

  const zipBuffer = entries.length > 0 ? createZip(entries) : null

  sendJson(res, 200, {
    ok: true,
    date,
    content: processedContent,
    imageCount: images.length,
    downloadedCount: entries.length,
    failed,
    zipFilename: entries.length > 0 ? `markdown-images-${date}.zip` : '',
    zipBase64: zipBuffer ? zipBuffer.toString('base64') : ''
  })
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {})
    return
  }

  try {
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { ok: true })
      return
    }

    if (req.method === 'POST' && req.url === '/api/docs/write') {
      await handleWriteDoc(req, res)
      return
    }

    if (req.method === 'POST' && req.url === '/api/docs/write-all') {
      await handleWriteAll(req, res)
      return
    }

    if (req.method === 'POST' && req.url === '/api/docs/process-markdown-assets') {
      await handleProcessMarkdownAssets(req, res)
      return
    }

    sendJson(res, 404, { ok: false, message: 'Not found' })
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      message: error.message
    })
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Doc config server running at http://127.0.0.1:${PORT}`)
})
