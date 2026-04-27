import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, 'data-service-db.json')
const port = Number(process.env.DATA_SERVICE_API_PORT || 5203)

function makeDataset({
  id,
  name,
  latestVersion,
  dataUsage,
  dataFormat,
  creator,
  createdAt,
  sampleCount,
  charCount,
  trainRatio,
  status = '已发布',
}) {
  return {
    id,
    name,
    versionStatus: '处理完成',
    latestVersion,
    dataUsage,
    dataFormat,
    creator,
    createdAt,
    status,
    sampleCount,
    charCount,
    trainRatio,
    versions: [
      {
        id: `${id}-${latestVersion}`,
        version: latestVersion,
        processStatus: '处理完成',
        publishStatus: status,
        createdAt,
        sampleCount,
        charCount,
        trainRatio,
      },
    ],
  }
}

const seedState = {
  trainingDatasets: [
    makeDataset({ id: 'train-1', name: 'roleBased', latestVersion: 'V5', dataUsage: 'SFT-文本生成', dataFormat: 'role-based', creator: 'deepexilab', createdAt: '2026/03/11 14:43:09', sampleCount: 2, charCount: 3200, trainRatio: 80 }),
    makeDataset({ id: 'train-2', name: '训练测试-1', latestVersion: 'V8', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/03/08 14:30:00', sampleCount: 40, charCount: 125000, trainRatio: 80 }),
    makeDataset({ id: 'train-6', name: '偏好对训练集-DPO-demo', latestVersion: 'V2', dataUsage: 'DPO-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/03/04 14:00:00', sampleCount: 18, charCount: 42000, trainRatio: 80 }),
    makeDataset({ id: 'train-7', name: '视觉偏好训练集-DPO-VLM', latestVersion: 'V1', dataUsage: 'DPO-图像理解', dataFormat: 'prompt-response', creator: 'admin', createdAt: '2026/03/03 18:20:00', sampleCount: 12, charCount: 18000, trainRatio: 80 }),
    makeDataset({ id: 'train-3', name: '奖励反馈训练集-RFT-PPO', latestVersion: 'V3', dataUsage: 'RFT-PPO-文本生成', dataFormat: 'prompt-response', creator: 'deepexilab', createdAt: '2026/03/02 09:30:00', sampleCount: 24, charCount: 58000, trainRatio: 80 }),
    makeDataset({ id: 'train-9', name: '群组反馈训练集-RFT-GRPO', latestVersion: 'V1', dataUsage: 'RFT-GRPO-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/03/01 16:10:00', sampleCount: 16, charCount: 36000, trainRatio: 80 }),
    makeDataset({ id: 'train-10', name: '客服偏好对训练集-DPO-Plus', latestVersion: 'V4', dataUsage: 'DPO-文本生成', dataFormat: 'prompt-response', creator: 'deepexilab', createdAt: '2026/03/10 10:16:00', sampleCount: 96, charCount: 268000, trainRatio: 80 }),
    makeDataset({ id: 'train-11', name: '多轮指令精调-SFT-财税问答', latestVersion: 'V3', dataUsage: 'SFT-文本生成', dataFormat: 'role-based', creator: 'lab1', createdAt: '2026/03/09 19:20:00', sampleCount: 128, charCount: 312000, trainRatio: 80 }),
    makeDataset({ id: 'train-12', name: '图文偏好排序-DPO-电商审核', latestVersion: 'V2', dataUsage: 'DPO-图像理解', dataFormat: 'prompt-response', creator: 'admin', createdAt: '2026/03/07 13:42:00', sampleCount: 64, charCount: 91000, trainRatio: 80 }),
    makeDataset({ id: 'train-13', name: '222222222222222', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/03/07 09:15:00', sampleCount: 20, charCount: 56000, trainRatio: 80 }),
    makeDataset({ id: 'train-4', name: 'role_base', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/03/06 09:15:00', sampleCount: 12, charCount: 32000, trainRatio: 80, status: '处理失败' }),
    makeDataset({ id: 'train-5', name: '小量训练数据-xjh-test', latestVersion: 'V3', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/03/05 15:45:00', sampleCount: 28, charCount: 83000, trainRatio: 80 }),
  ],
  validationDatasets: [
    makeDataset({ id: 'val-1', name: '多轮---1', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'role-based', creator: 'admin', createdAt: '2026/02/27 14:00:00', sampleCount: 20, charCount: 36000, trainRatio: 20 }),
    makeDataset({ id: 'val-2', name: '正常-2', latestVersion: 'V2', dataUsage: 'SFT-文本生成', dataFormat: 'role-based', creator: 'admin', createdAt: '2026/02/26 14:00:00', sampleCount: 16, charCount: 24000, trainRatio: 20 }),
    makeDataset({ id: 'val-4', name: 'RFT-PPO-验证集-文本', latestVersion: 'V1', dataUsage: 'RFT-PPO-文本生成', dataFormat: 'prompt-response', creator: 'admin', createdAt: '2026/02/25 17:20:00', sampleCount: 20, charCount: 22000, trainRatio: 20 }),
    makeDataset({ id: 'val-3', name: '验证-xlsx-0001', latestVersion: 'V15', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/02/25 15:00:00', sampleCount: 40, charCount: 68000, trainRatio: 20 }),
  ],
  testDatasets: [
    makeDataset({ id: 'test-1', name: '多文件-10', latestVersion: 'V2', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'admin', createdAt: '2026/03/03 17:04:19', sampleCount: 40 }),
    makeDataset({ id: 'test-5', name: '偏好对测试集-DPO-A', latestVersion: 'V1', dataUsage: 'DPO-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/03/03 08:10:00', sampleCount: 22 }),
    makeDataset({ id: 'test-6', name: '强化评测集-RFT-GRPO', latestVersion: 'V2', dataUsage: 'RFT-GRPO-文本生成', dataFormat: 'prompt-response', creator: 'admin', createdAt: '2026/03/02 18:30:00', sampleCount: 18 }),
    makeDataset({ id: 'test-2', name: '乱码测试4', latestVersion: 'V7', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/03/02 14:30:00', sampleCount: 50 }),
    makeDataset({ id: 'test-3', name: '333333333', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'role-based', creator: 'lab1', createdAt: '2026/03/01 11:00:00', sampleCount: 10, status: '处理失败' }),
    makeDataset({ id: 'test-4', name: '属性回归测试-22-333-444', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'admin', createdAt: '2026/04/09 10:00:00', sampleCount: 5 }),
  ],
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
  const state = JSON.parse(raw)
  const existingIds = new Set((state.trainingDatasets || []).map(item => item.id))
  for (const item of seedState.trainingDatasets) {
    if (!existingIds.has(item.id)) {
      state.trainingDatasets.push(clone(item))
    }
  }

  const existingValidationIds = new Set((state.validationDatasets || []).map(item => item.id))
  for (const item of seedState.validationDatasets) {
    if (!existingValidationIds.has(item.id)) {
      state.validationDatasets.push(clone(item))
    }
  }

  const existingTestIds = new Set((state.testDatasets || []).map(item => item.id))
  for (const item of seedState.testDatasets) {
    if (!existingTestIds.has(item.id)) {
      state.testDatasets.push(clone(item))
    }
  }

  return state
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

function normalizeDatasetUsage(value) {
  switch (value) {
    case '图像理解':
      return 'SFT-图像理解'
    case 'DPO-文本生成':
    case 'DPO-图像理解':
    case 'RFT-PPO-文本生成':
    case 'RFT-PPO-图像理解':
    case 'RFT-GRPO-文本生成':
    case 'RFT-GRPO-图像理解':
    case 'SFT-图像理解':
    case 'SFT-文本生成':
      return value
    default:
      return 'SFT-文本生成'
  }
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
      dataUsage: normalizeDatasetUsage(body.dataUsage),
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
