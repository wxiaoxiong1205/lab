import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, 'data-service-db.json')
const port = Number(process.env.DATA_SERVICE_API_PORT || 5203)

const seedState = {
  trainingDatasets: [],
  validationDatasets: [],
  testDatasets: [],
  inferenceResults: [],
  annotationTasks: [],
  cleaningTasks: [],
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

async function ensureDb() {
  if (!existsSync(dbPath)) {
    await writeFile(dbPath, JSON.stringify(seedState, null, 2))
  }
}

async function readDb() {
  await ensureDb()
  const raw = await readFile(dbPath, 'utf8')
  return JSON.parse(raw)
}

async function writeDb(state) {
  await writeFile(dbPath, JSON.stringify(state, null, 2))
}

function nowText() {
  const now = new Date()
  const pad = value => String(value).padStart(2, '0')
  return `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

function nextVersionLabel(current) {
  const match = /^V(\d+)$/i.exec(current)
  const num = match ? Number(match[1]) : 1
  return `V${num + 1}`
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  if (!chunks.length) {
    return {}
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  })
  res.end(JSON.stringify(payload))
}

function notFound(res) {
  json(res, 404, { message: 'Not Found' })
}

function pickList(state, kind) {
  if (kind === 'training') return state.trainingDatasets
  if (kind === 'validation') return state.validationDatasets
  return state.testDatasets
}

function paginate(items, page = 1, pageSize = 10) {
  const total = items.length
  const start = (page - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    total,
  }
}

function queryDatasets(items, searchParams) {
  const search = (searchParams.get('search') || '').toLowerCase()
  const dataUsage = searchParams.get('dataUsage') || ''
  const page = Number(searchParams.get('page') || '1')
  const pageSize = Number(searchParams.get('pageSize') || '10')
  const filtered = items.filter(item => {
    const matchSearch = !search || item.name.toLowerCase().includes(search)
    const matchUsage = !dataUsage || item.dataUsage === dataUsage
    return matchSearch && matchUsage
  })
  return paginate(filtered, page, pageSize)
}

function queryInference(items, searchParams) {
  const search = (searchParams.get('search') || '').toLowerCase()
  const dataUsage = searchParams.get('dataUsage') || ''
  const inferenceMode = searchParams.get('inferenceMode') || ''
  const page = Number(searchParams.get('page') || '1')
  const pageSize = Number(searchParams.get('pageSize') || '10')
  const filtered = items.filter(item => {
    const matchSearch = !search || item.name.toLowerCase().includes(search)
    const matchUsage = !dataUsage || item.dataUsage === dataUsage
    const matchMode = !inferenceMode || item.pendingModel.includes(inferenceMode) || item.name.includes(inferenceMode)
    return matchSearch && matchUsage && matchMode
  })
  return paginate(filtered, page, pageSize)
}

function queryCleaning(items, searchParams) {
  const status = searchParams.get('status') || ''
  const page = Number(searchParams.get('page') || '1')
  const pageSize = Number(searchParams.get('pageSize') || '20')
  const filtered = items.filter(item => !status || item.status === status)
  return paginate(filtered, page, pageSize)
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    return notFound(res)
  }

  if (req.method === 'OPTIONS') {
    return json(res, 204, {})
  }

  const url = new URL(req.url, `http://${req.headers.host}`)
  const pathname = url.pathname

  if (req.method === 'GET' && pathname === '/api/data-service/snapshot') {
    return json(res, 200, await readDb())
  }

  const listDatasetMatch = pathname.match(/^\/api\/data-service\/datasets\/(training|validation|test)$/)
  if (req.method === 'GET' && listDatasetMatch) {
    const state = await readDb()
    return json(res, 200, queryDatasets(pickList(state, listDatasetMatch[1]), url.searchParams))
  }

  const createDatasetMatch = pathname.match(/^\/api\/data-service\/datasets\/(training|validation|test)$/)
  if (req.method === 'POST' && createDatasetMatch) {
    const kind = createDatasetMatch[1]
    const body = await readBody(req)
    const state = await readDb()
    const list = pickList(state, kind)
    const createdAt = nowText()
    const item = {
      id: `${kind}-${Date.now()}`,
      name: body.name,
      versionStatus: '处理完成',
      latestVersion: 'V1',
      dataUsage: body.dataUsage === '图像理解' ? 'SFT-图像理解' : 'SFT-文本生成',
      dataFormat: body.dataFormat === 'ROLE_BASED' ? 'role-based' : 'prompt-response',
      creator: 'deepexilab',
      createdAt,
      status: '已发布',
      sampleCount: Math.max(2, Math.floor(Math.random() * 40) + 2),
      charCount: kind === 'test' ? undefined : Math.floor(Math.random() * 90000) + 12000,
      trainRatio: kind === 'validation' ? 20 : kind === 'test' ? undefined : 80,
      versions: [],
    }
    item.versions = [
      {
        id: `${item.id}-V1`,
        version: 'V1',
        processStatus: '处理完成',
        publishStatus: '已发布',
        createdAt,
        sampleCount: item.sampleCount,
        charCount: item.charCount,
        trainRatio: item.trainRatio,
      },
    ]
    list.unshift(item)
    await writeDb(state)
    return json(res, 200, state)
  }

  const addVersionMatch = pathname.match(/^\/api\/data-service\/datasets\/(training|validation|test)\/([^/]+)\/versions$/)
  if (req.method === 'POST' && addVersionMatch) {
    const [, kind, rawId] = addVersionMatch
    const targetId = decodeURIComponent(rawId)
    const body = await readBody(req)
    const state = await readDb()
    const list = pickList(state, kind)
    const target = list.find(item => item.id === targetId)
    if (!target) {
      return notFound(res)
    }

    const createdAt = nowText()
    const nextVersion = nextVersionLabel(target.latestVersion)
    target.versions = target.versions.map(item =>
      item.version === target.latestVersion ? { ...item, publishStatus: '已归档' } : item,
    )
    target.latestVersion = nextVersion
    target.versionStatus = '处理完成'
    target.status = '已发布'
    target.createdAt = createdAt
    target.sampleCount = Math.max(2, Math.floor(Math.random() * 40) + 2)
    if (typeof target.charCount === 'number') {
      target.charCount = Math.floor(Math.random() * 90000) + 12000
    }
    const previousVersion = target.versions[0]
    target.versions.unshift({
      id: `${target.id}-${nextVersion}`,
      version: nextVersion,
      processStatus: '处理完成',
      publishStatus: '已发布',
      createdAt,
      sampleCount: target.sampleCount,
      charCount: target.charCount,
      trainRatio: target.trainRatio,
      description: body.description || '',
      detailRows: body.inheritFromPrevious ? clone(previousVersion?.detailRows || []) : (previousVersion?.detailRows || []).map(item => ({ ...item, key: `${nextVersion}-${Math.random().toString(16).slice(2, 6)}` })),
    })
    await writeDb(state)
    return json(res, 200, state)
  }

  const deleteDatasetMatch = pathname.match(/^\/api\/data-service\/datasets\/(training|validation|test)\/([^/]+)$/)
  if (req.method === 'DELETE' && deleteDatasetMatch) {
    const [, kind, rawId] = deleteDatasetMatch
    const targetId = decodeURIComponent(rawId)
    const state = await readDb()
    const key = kind === 'training' ? 'trainingDatasets' : kind === 'validation' ? 'validationDatasets' : 'testDatasets'
    state[key] = state[key].filter(item => item.id !== targetId)
    await writeDb(state)
    return json(res, 200, state)
  }

  if (req.method === 'POST' && pathname === '/api/data-service/inference-results') {
    const body = await readBody(req)
    const state = await readDb()
    state.inferenceResults.unshift({
      id: `inf-${Date.now()}`,
      name: body.name,
      progress: '已创建',
      dataUsage: body.dataUsage,
      pendingData: body.pendingData,
      pendingModel: body.pendingModel,
      dataVolume: Math.max(1, Math.floor(Math.random() * 20) + 1),
      createdAt: nowText(),
    })
    await writeDb(state)
    return json(res, 200, state)
  }

  if (req.method === 'GET' && pathname === '/api/data-service/inference-results') {
    const state = await readDb()
    return json(res, 200, queryInference(state.inferenceResults, url.searchParams))
  }

  const deleteInferenceMatch = pathname.match(/^\/api\/data-service\/inference-results\/([^/]+)$/)
  if (req.method === 'DELETE' && deleteInferenceMatch) {
    const targetId = decodeURIComponent(deleteInferenceMatch[1])
    const state = await readDb()
    state.inferenceResults = state.inferenceResults.filter(item => item.id !== targetId)
    await writeDb(state)
    return json(res, 200, state)
  }

  const startInferenceMatch = pathname.match(/^\/api\/data-service\/inference-results\/([^/]+)\/start$/)
  if (req.method === 'POST' && startInferenceMatch) {
    const targetId = decodeURIComponent(startInferenceMatch[1])
    const state = await readDb()
    const target = state.inferenceResults.find(item => item.id === targetId)
    if (!target) {
      return notFound(res)
    }
    if (target.progress !== '启动中') {
      target.progress = '启动中'
    }
    await writeDb(state)
    return json(res, 200, state)
  }

  const terminateInferenceMatch = pathname.match(/^\/api\/data-service\/inference-results\/([^/]+)\/terminate$/)
  if (req.method === 'POST' && terminateInferenceMatch) {
    const targetId = decodeURIComponent(terminateInferenceMatch[1])
    const state = await readDb()
    const target = state.inferenceResults.find(item => item.id === targetId)
    if (!target) {
      return notFound(res)
    }
    target.progress = '已终止'
    await writeDb(state)
    return json(res, 200, state)
  }

  if (req.method === 'POST' && pathname === '/api/data-service/annotation-tasks') {
    const body = await readBody(req)
    const state = await readDb()
    state.annotationTasks.unshift({
      id: `ann-${Date.now()}`,
      name: body.name,
      dataVolume: body.dataVolume,
      progress: 0,
      preDataset: body.preDataset,
      postDataset: '-',
      creator: 'deepexilab',
      createdAt: nowText().replace(/\//g, '-'),
    })
    await writeDb(state)
    return json(res, 200, state)
  }

  if (req.method === 'GET' && pathname === '/api/data-service/annotation-tasks') {
    const state = await readDb()
    const page = Number(url.searchParams.get('page') || '1')
    const pageSize = Number(url.searchParams.get('pageSize') || '10')
    return json(res, 200, paginate(state.annotationTasks, page, pageSize))
  }

  const deleteAnnotationMatch = pathname.match(/^\/api\/data-service\/annotation-tasks\/([^/]+)$/)
  if (req.method === 'DELETE' && deleteAnnotationMatch) {
    const targetId = decodeURIComponent(deleteAnnotationMatch[1])
    const state = await readDb()
    state.annotationTasks = state.annotationTasks.filter(item => item.id !== targetId)
    await writeDb(state)
    return json(res, 200, state)
  }

  if (req.method === 'POST' && pathname === '/api/data-service/cleaning-tasks') {
    const body = await readBody(req)
    const state = await readDb()
    state.cleaningTasks.unshift({
      id: `clean-${Date.now()}`,
      name: body.name,
      status: '启动中',
      preDataset: body.preDataset,
      postDataset: '-',
      creator: 'deepexilab',
      createdAt: nowText(),
    })
    await writeDb(state)
    return json(res, 200, state)
  }

  if (req.method === 'GET' && pathname === '/api/data-service/cleaning-tasks') {
    const state = await readDb()
    return json(res, 200, queryCleaning(state.cleaningTasks, url.searchParams))
  }

  const deleteCleaningMatch = pathname.match(/^\/api\/data-service\/cleaning-tasks\/([^/]+)$/)
  if (req.method === 'DELETE' && deleteCleaningMatch) {
    const targetId = decodeURIComponent(deleteCleaningMatch[1])
    const state = await readDb()
    state.cleaningTasks = state.cleaningTasks.filter(item => item.id !== targetId)
    await writeDb(state)
    return json(res, 200, state)
  }

  const startCleaningMatch = pathname.match(/^\/api\/data-service\/cleaning-tasks\/([^/]+)\/start$/)
  if (req.method === 'POST' && startCleaningMatch) {
    const targetId = decodeURIComponent(startCleaningMatch[1])
    const state = await readDb()
    const target = state.cleaningTasks.find(item => item.id === targetId)
    if (!target) {
      return notFound(res)
    }
    if (target.status !== '启动中') {
      target.status = '启动中'
    }
    await writeDb(state)
    return json(res, 200, state)
  }

  return notFound(res)
})

server.listen(port, () => {
  console.log(`data-service api listening on http://127.0.0.1:${port}`)
})
