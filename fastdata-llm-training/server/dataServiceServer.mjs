import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, 'data-service-db.json')
const documentAgentDbPath = path.join(__dirname, 'document-agent-db.json')
const documentKnowledgeBasePath = path.join(__dirname, 'document-knowledge-base.json')
const port = Number(process.env.DATA_SERVICE_API_PORT || 5203)
const host = process.env.DATA_SERVICE_API_HOST || '127.0.0.1'
const allowedOrigins = new Set([
  'http://127.0.0.1:5202',
  'http://localhost:5202',
])
const allowedOriginPattern = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/
const maxBodyBytes = 1024 * 1024

function isDpoUsage(value) {
  return String(value || '').startsWith('DPO-')
}

function normalizeDataFormat(format, dataUsage) {
  const value = String(format || '')
  if (isDpoUsage(dataUsage)) {
    return value === 'role-based' || value === 'ROLE_BASED' ? 'role-based' : 'alpaca'
  }
  return value === 'role-based' || value === 'ROLE_BASED' ? 'role-based' : 'prompt-response'
}

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
    makeDataset({ id: 'train-6', name: 'DPO-Alpaca-通用偏好训练集', latestVersion: 'V2', dataUsage: 'DPO-文本生成', dataFormat: 'alpaca', creator: 'lab1', createdAt: '2026/03/04 14:00:00', sampleCount: 18, charCount: 42000, trainRatio: 80 }),
    makeDataset({ id: 'train-7', name: 'DPO-Role-Based-视觉偏好训练集', latestVersion: 'V1', dataUsage: 'DPO-图像理解', dataFormat: 'role-based', creator: 'admin', createdAt: '2026/03/03 18:20:00', sampleCount: 12, charCount: 18000, trainRatio: 80 }),
    makeDataset({ id: 'train-14', name: '图像理解-SFT-商品图文问答', latestVersion: 'V2', dataUsage: 'SFT-图像理解', dataFormat: 'role-based', creator: 'deepexilab', createdAt: '2026/05/10 10:12:00', sampleCount: 640, charCount: 96000, trainRatio: 80 }),
    makeDataset({ id: 'train-15', name: '图像理解-SFT-文档截图解析', latestVersion: 'V1', dataUsage: 'SFT-图像理解', dataFormat: 'role-based', creator: 'admin', createdAt: '2026/05/10 11:24:00', sampleCount: 420, charCount: 78000, trainRatio: 80 }),
    makeDataset({ id: 'train-16', name: '图像理解-SFT-质检缺陷识别', latestVersion: 'V3', dataUsage: 'SFT-图像理解', dataFormat: 'role-based', creator: 'lab1', createdAt: '2026/05/09 16:38:00', sampleCount: 1280, charCount: 156000, trainRatio: 85 }),
    makeDataset({ id: 'train-17', name: '图像理解-DPO-多模态偏好对', latestVersion: 'V1', dataUsage: 'DPO-图像理解', dataFormat: 'role-based', creator: 'deepexilab', createdAt: '2026/05/09 15:18:00', sampleCount: 360, charCount: 72000, trainRatio: 80 }),
    makeDataset({ id: 'train-18', name: '图像理解-RFT-PPO-视觉推理奖励集', latestVersion: 'V1', dataUsage: 'RFT-PPO-图像理解', dataFormat: 'prompt-response', creator: 'admin', createdAt: '2026/05/08 18:06:00', sampleCount: 260, charCount: 54000, trainRatio: 80 }),
    makeDataset({ id: 'train-19', name: '图像理解-RFT-GRPO-图表推理集', latestVersion: 'V1', dataUsage: 'RFT-GRPO-图像理解', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/05/08 17:20:00', sampleCount: 300, charCount: 62000, trainRatio: 80 }),
    makeDataset({ id: 'train-3', name: '奖励反馈训练集-RFT-PPO', latestVersion: 'V3', dataUsage: 'RFT-PPO-文本生成', dataFormat: 'prompt-response', creator: 'deepexilab', createdAt: '2026/03/02 09:30:00', sampleCount: 24, charCount: 58000, trainRatio: 80 }),
    makeDataset({ id: 'train-9', name: '群组反馈训练集-RFT-GRPO', latestVersion: 'V1', dataUsage: 'RFT-GRPO-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/03/01 16:10:00', sampleCount: 16, charCount: 36000, trainRatio: 80 }),
    makeDataset({ id: 'train-10', name: 'DPO-Role-Based-客服质检训练集', latestVersion: 'V4', dataUsage: 'DPO-文本生成', dataFormat: 'role-based', creator: 'deepexilab', createdAt: '2026/03/10 10:16:00', sampleCount: 96, charCount: 268000, trainRatio: 80 }),
    makeDataset({ id: 'train-11', name: '多轮指令精调-SFT-财税问答', latestVersion: 'V3', dataUsage: 'SFT-文本生成', dataFormat: 'role-based', creator: 'lab1', createdAt: '2026/03/09 19:20:00', sampleCount: 128, charCount: 312000, trainRatio: 80 }),
    makeDataset({ id: 'train-12', name: 'DPO-Role-Based-电商图文偏好训练集', latestVersion: 'V2', dataUsage: 'DPO-图像理解', dataFormat: 'role-based', creator: 'admin', createdAt: '2026/03/07 13:42:00', sampleCount: 64, charCount: 91000, trainRatio: 80 }),
    makeDataset({ id: 'train-13', name: '222222222222222', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/03/07 09:15:00', sampleCount: 20, charCount: 56000, trainRatio: 80 }),
    makeDataset({ id: 'train-4', name: 'role_base', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/03/06 09:15:00', sampleCount: 12, charCount: 32000, trainRatio: 80, status: '处理失败' }),
    makeDataset({ id: 'train-5', name: '小量训练数据-xjh-test', latestVersion: 'V3', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/03/05 15:45:00', sampleCount: 28, charCount: 83000, trainRatio: 80 }),
  ],
  validationDatasets: [
    makeDataset({ id: 'val-1', name: '多轮---1', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'role-based', creator: 'admin', createdAt: '2026/02/27 14:00:00', sampleCount: 20, charCount: 36000, trainRatio: 20 }),
    makeDataset({ id: 'val-2', name: '正常-2', latestVersion: 'V2', dataUsage: 'SFT-文本生成', dataFormat: 'role-based', creator: 'admin', createdAt: '2026/02/26 14:00:00', sampleCount: 16, charCount: 24000, trainRatio: 20 }),
    makeDataset({ id: 'val-5', name: 'DPO-Alpaca-偏好验证集', latestVersion: 'V1', dataUsage: 'DPO-文本生成', dataFormat: 'alpaca', creator: 'admin', createdAt: '2026/02/26 10:10:00', sampleCount: 18, charCount: 26000, trainRatio: 20 }),
    makeDataset({ id: 'val-6', name: 'DPO-Role-Based-质量验证集', latestVersion: 'V1', dataUsage: 'DPO-文本生成', dataFormat: 'role-based', creator: 'lab1', createdAt: '2026/02/26 09:30:00', sampleCount: 14, charCount: 21000, trainRatio: 20 }),
    makeDataset({ id: 'val-4', name: 'RFT-PPO-验证集-文本', latestVersion: 'V1', dataUsage: 'RFT-PPO-文本生成', dataFormat: 'prompt-response', creator: 'admin', createdAt: '2026/02/25 17:20:00', sampleCount: 20, charCount: 22000, trainRatio: 20 }),
    makeDataset({ id: 'val-3', name: '验证-xlsx-0001', latestVersion: 'V15', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/02/25 15:00:00', sampleCount: 40, charCount: 68000, trainRatio: 20 }),
  ],
  testDatasets: [
    makeDataset({ id: 'test-1', name: '多文件-10', latestVersion: 'V2', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'admin', createdAt: '2026/03/03 17:04:19', sampleCount: 40 }),
    makeDataset({ id: 'test-5', name: 'DPO-Alpaca-偏好测试集', latestVersion: 'V1', dataUsage: 'DPO-文本生成', dataFormat: 'alpaca', creator: 'lab1', createdAt: '2026/03/03 08:10:00', sampleCount: 22 }),
    makeDataset({ id: 'test-6', name: '强化评测集-RFT-GRPO', latestVersion: 'V2', dataUsage: 'RFT-GRPO-文本生成', dataFormat: 'prompt-response', creator: 'admin', createdAt: '2026/03/02 18:30:00', sampleCount: 18 }),
    makeDataset({ id: 'test-2', name: '乱码测试4', latestVersion: 'V7', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/03/02 14:30:00', sampleCount: 50 }),
    makeDataset({ id: 'test-3', name: '333333333', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'role-based', creator: 'lab1', createdAt: '2026/03/01 11:00:00', sampleCount: 10, status: '处理失败' }),
    makeDataset({ id: 'test-4', name: '属性回归测试-22-333-444', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'admin', createdAt: '2026/04/09 10:00:00', sampleCount: 5 }),
  ],
  inferenceResults: [
    { id: 'inf-1', name: '推理结果集_2026_03_26_09_34_47', description: '', progress: '已完成', dataUsage: '文本生成', inferenceMode: '离线推理', pendingData: '验证数据集/验证-示例-1-json>V6', pendingModel: '123123', dataVolume: 20, createdAt: '2026/03/26 09:36:42' },
    { id: 'inf-2', name: '测试111', description: '', progress: '已创建', dataUsage: '文本生成', inferenceMode: '离线推理', pendingData: '验证集/多轮---1>V1', pendingModel: '123123', dataVolume: 6, createdAt: '2026/03/24 18:55:23' },
    { id: 'inf-3', name: '导入-文本生成-PROMPT_RESPONSE格式-推理结果集', description: '', progress: '已完成', dataUsage: '文本生成', inferenceMode: '导入推理结果集', importFile: 'PROMPT_RESPONSE_导入样例.csv', pendingData: '外部导入', pendingModel: '手输模型', dataVolume: 273, createdAt: '2026/03/24 11:06:59' },
    { id: 'inf-4', name: '推理结果集_2026_03_18_16_46_47', description: '', progress: '已完成', dataUsage: '图像理解', inferenceMode: '在线推理', pendingData: '外部导入', pendingModel: '手输模型', dataVolume: 18, createdAt: '2026/03/18 16:47:08' },
  ],
  annotationTasks: [
    { id: 'ann-1', name: '财税问答-人工标注-未开始', dataVolume: 12, progress: 0, status: '未开始', collaborationMode: 'online', datasetType: 'text-generation', preDataset: '训练数据集/多轮指令精调-SFT-财税问答-V3', postDataset: '-', creator: 'deepexilab', createdAt: '2026-04-29 09:10:21' },
    { id: 'ann-2', name: '客服意图识别-在线标注中', dataVolume: 36, progress: 45, status: '标注中', collaborationMode: 'online', datasetType: 'text-generation', preDataset: '训练数据集/训练测试-1-V8', postDataset: '-', creator: 'lab1', createdAt: '2026-04-28 16:38:22' },
    { id: 'ann-3', name: 'DPO-Alpaca-偏好审核任务', dataVolume: 24, progress: 80, status: '待审核', collaborationMode: 'multi', reviewerCount: 3, reviewMode: '双人交叉审核', datasetType: 'text-generation', preDataset: '训练数据集/DPO-Alpaca-通用偏好训练集-V2', postDataset: '-', creator: 'lab1', createdAt: '2026-04-27 14:17:59' },
    { id: 'ann-4', name: 'RFT-PPO反馈标注-已完成', dataVolume: 30, progress: 100, status: '已完成', collaborationMode: 'online', datasetType: 'text-generation', preDataset: '训练数据集/奖励反馈训练集-RFT-PPO-V3', postDataset: '训练数据集/奖励反馈训练集-RFT-PPO-标注结果-V1', creator: 'deepexilab', createdAt: '2026-04-26 11:22:13' },
    { id: 'ann-5', name: '多轮对话质量复核-已提交', dataVolume: 18, progress: 100, status: '已提交', collaborationMode: 'multi', reviewerCount: 2, reviewMode: '组长复核', datasetType: 'text-generation', preDataset: '验证数据集/多轮---1-V1', postDataset: '验证数据集/多轮---1-标注结果-V2', creator: 'admin', createdAt: '2026-04-25 17:05:46' },
    { id: 'ann-6', name: 'DPO-Role-Based-视觉偏好标注中', dataVolume: 16, progress: 35, status: '标注中', collaborationMode: 'online', datasetType: 'image-understanding', preDataset: '训练数据集/DPO-Role-Based-视觉偏好训练集-V1', postDataset: '-', creator: 'deepexilab', createdAt: '2026-04-24 10:26:08' },
    { id: 'ann-7', name: 'DPO-Role-Based-电商图文偏好失败', dataVolume: 8, progress: null, status: '失败', collaborationMode: 'multi', reviewerCount: 2, reviewMode: '全量复核', datasetType: 'image-understanding', preDataset: '训练数据集/DPO-Role-Based-电商图文偏好训练集-V2', postDataset: '-', creator: 'lab1', createdAt: '2026-04-23 19:41:30' },
    { id: 'ann-8', name: 'DPO-Alpaca-测试标注失败', dataVolume: 10, progress: null, status: '失败', collaborationMode: 'online', datasetType: 'text-generation', preDataset: '测试数据集/DPO-Alpaca-偏好测试集-V1', postDataset: '-', creator: 'lab1', createdAt: '2026-04-22 13:09:18' },
    { id: 'ann-9', name: 'DPO-Alpaca-客服偏好标注中', dataVolume: 18, progress: 44, status: '标注中', collaborationMode: 'online', datasetType: 'text-generation', preDataset: '训练数据集/DPO-Alpaca-通用偏好训练集-V2', postDataset: '-', creator: 'deepexilab', createdAt: '2026-04-21 10:18:34' },
    { id: 'ann-10', name: 'DPO-Role-Based-客服质检多人标注', dataVolume: 32, progress: 62, status: '标注中', collaborationMode: 'multi', reviewerCount: 4, reviewMode: '抽检审核', datasetType: 'text-generation', preDataset: '训练数据集/DPO-Role-Based-客服质检训练集-V4', postDataset: '-', creator: 'admin', createdAt: '2026-04-20 16:46:12' },
    { id: 'ann-11', name: 'DPO-Alpaca-偏好验证已完成', dataVolume: 18, progress: 100, status: '已完成', collaborationMode: 'online', datasetType: 'text-generation', preDataset: '验证数据集/DPO-Alpaca-偏好验证集-V1', postDataset: '验证数据集/DPO-Alpaca-偏好验证集-标注结果-V2', creator: 'lab1', createdAt: '2026-04-19 15:12:07' },
    { id: 'ann-12', name: 'DPO-Role-Based-质量验证待审核', dataVolume: 14, progress: 86, status: '待审核', collaborationMode: 'multi', reviewerCount: 3, reviewMode: '双人交叉审核', datasetType: 'text-generation', preDataset: '验证数据集/DPO-Role-Based-质量验证集-V1', postDataset: '-', creator: 'deepexilab', createdAt: '2026-04-18 11:36:52' },
    { id: 'ann-13', name: 'DPO-Role-Based-多模态偏好标注', dataVolume: 20, progress: 25, status: '标注中', collaborationMode: 'online', datasetType: 'image-understanding', preDataset: '训练数据集/图像理解-DPO-多模态偏好对-V1', postDataset: '-', creator: 'admin', createdAt: '2026-04-17 09:44:20' },
  ],
  cleaningTasks: [
    { id: 'clean-1', name: 'DPO-Alpaca-偏好对清洗', description: '', status: '已完成', preDataset: '训练数据集/DPO-Alpaca-通用偏好训练集-V2', postDataset: '训练数据集/DPO-Alpaca-通用偏好训练集-V3', creator: 'deepexilab', createdAt: '2026/03/24 11:53:50' },
    { id: 'clean-2', name: 'DPO-Role-Based-客服质检清洗', description: '', status: '启动中', preDataset: '训练数据集/DPO-Role-Based-客服质检训练集-V4', postDataset: '-', creator: 'lab1', createdAt: '2026/03/20 09:45:19' },
    { id: 'clean-3', name: 'DPO-Alpaca-测试集清洗', description: '', status: '已完成', preDataset: '测试数据集/DPO-Alpaca-偏好测试集-V1', postDataset: '测试数据集/DPO-Alpaca-偏好测试集-V2', creator: 'lab1', createdAt: '2026/03/13 15:18:51' },
  ],
}

const documentKnowledgeBase = JSON.parse(readFileSync(documentKnowledgeBasePath, 'utf8'))

const seedDocumentAgentState = {
  services: [
    {
      id: 'doc-agent-seed',
      name: '文档中心默认助手',
      directory: '文档中心',
      description: '用于文档中心问答和文档定位的全局 Agent 服务。',
      status: 'stopped',
      indexStatus: 'ready',
      embedding: {
        apiUrl: 'http://127.0.0.1:5203/mock/embedding',
        apiKey: '',
        modelName: 'bge-m3',
      },
      rerank: {
        apiUrl: 'http://127.0.0.1:5203/mock/rerank',
        apiKey: '',
        modelName: 'bge-reranker-large',
      },
      chatModel: {
        source: 'customApi',
        customApi: {
          apiUrl: 'http://127.0.0.1:5203/mock/chat',
          apiKey: '',
          modelName: 'qwen-plus',
        },
        advanced: {
          maxTokens: null,
          temperature: 0.7,
          topP: 1,
          presencePenalty: 0,
        },
      },
      createdBy: 'system_admin',
      createdAt: '2026/05/07 10:00:00',
      updatedAt: '2026/05/07 10:00:00',
    },
  ],
  conversations: [],
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
  const seedFormatById = new Map([
    ...(seedState.trainingDatasets || []),
    ...(seedState.validationDatasets || []),
    ...(seedState.testDatasets || []),
  ].map(item => [item.id, item.dataFormat]))
  const seedDatasetById = new Map([
    ...(seedState.trainingDatasets || []),
    ...(seedState.validationDatasets || []),
    ...(seedState.testDatasets || []),
  ].map(item => [item.id, item]))
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

  state.annotationTasks = state.annotationTasks || []
  const existingAnnotationMap = new Map(state.annotationTasks.map(item => [item.id, item]))
  for (const item of seedState.annotationTasks) {
    const existing = existingAnnotationMap.get(item.id)
    if (existing) {
      Object.assign(existing, clone(item))
    } else {
      state.annotationTasks.push(clone(item))
    }
  }

  state.inferenceResults = state.inferenceResults || []
  const existingInferenceIds = new Set(state.inferenceResults.map(item => item.id))
  for (const item of seedState.inferenceResults) {
    if (!existingInferenceIds.has(item.id)) {
      state.inferenceResults.push(clone(item))
    }
  }

  state.cleaningTasks = state.cleaningTasks || []
  const existingCleaningMap = new Map(state.cleaningTasks.map(item => [item.id, item]))
  for (const item of seedState.cleaningTasks) {
    const existing = existingCleaningMap.get(item.id)
    if (existing) {
      Object.assign(existing, clone(item))
    } else {
      state.cleaningTasks.push(clone(item))
    }
  }

  for (const list of [state.trainingDatasets || [], state.validationDatasets || [], state.testDatasets || []]) {
    for (const item of list) {
      const seedDataset = seedDatasetById.get(item.id)
      if (isDpoUsage(item.dataUsage) && seedDataset) {
        item.name = seedDataset.name
        item.dataUsage = seedDataset.dataUsage
      }
      item.dataFormat = seedFormatById.get(item.id) || normalizeDataFormat(item.dataFormat, item.dataUsage)
    }
  }

  return state
}

async function writeDb(state) {
  await writeFile(dbPath, JSON.stringify(state, null, 2))
}

async function ensureDocumentAgentDb() {
  if (!existsSync(documentAgentDbPath)) {
    await writeFile(documentAgentDbPath, JSON.stringify(seedDocumentAgentState, null, 2))
  }
}

async function readDocumentAgentDb() {
  await ensureDocumentAgentDb()
  const raw = await readFile(documentAgentDbPath, 'utf8')
  const state = JSON.parse(raw)
  state.services = state.services || []
  state.conversations = state.conversations || []

  const existingIds = new Set(state.services.map(item => item.id))
  for (const item of seedDocumentAgentState.services) {
    if (!existingIds.has(item.id)) {
      state.services.push(clone(item))
    }
  }
  if (state.services.length > 1) {
    state.services = [state.services.find(item => item.status === 'running') || state.services[0]]
  }

  return state
}

async function writeDocumentAgentDb(state) {
  await writeFile(documentAgentDbPath, JSON.stringify(state, null, 2))
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
  let totalBytes = 0
  for await (const chunk of req) {
    totalBytes += chunk.length
    if (totalBytes > maxBodyBytes) {
      const error = new Error('Request body too large')
      error.statusCode = 413
      throw error
    }
    chunks.push(chunk)
  }
  if (!chunks.length) {
    return {}
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const error = new Error('Invalid JSON body')
    error.statusCode = 400
    throw error
  }
}

function getAllowedOrigin(req) {
  const origin = req.headers.origin
  if (origin && (allowedOrigins.has(origin) || allowedOriginPattern.test(origin))) {
    return origin
  }
  return 'http://127.0.0.1:5202'
}

function json(req, res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': getAllowedOrigin(req),
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(JSON.stringify(payload))
}

function notFound(req, res) {
  json(req, res, 404, { message: 'Not Found' })
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

function normalizeText(value) {
  return String(value || '').toLowerCase()
}

function getSearchTerms(question) {
  const query = normalizeText(question)
  const tokens = query.split(/[\s,，。！？?;；:：/\\-]+/).filter(Boolean)
  const compact = query.replace(/[\s,，。！？?;；:：/\\-]+/g, '')
  const cleaned = compact
    .replace(/^(如何|怎么|怎样|请问|什么是|如何查看|如何创建)/, '')
    .replace(/(是什么|有哪些能力|有哪些|有什么能力|怎么做|怎么操作|如何操作|的内容是)$/, '')
  return Array.from(new Set([...tokens, compact, cleaned].filter(term => term.length >= 2)))
}

function scoreDocument(question, item) {
  const query = normalizeText(question)
  const haystack = normalizeText(`${item.title} ${item.sectionTitle} ${item.content}`)
  const tokens = getSearchTerms(question)
  const keywordScore = tokens.reduce((score, token) => score + (haystack.includes(token) ? Math.min(token.length, 8) : 0), 0)
  const directScore = haystack.includes(query) ? 2 : 0
  return keywordScore + directScore + (item.title && query.includes(normalizeText(item.title)) ? 1 : 0)
}

function searchDocuments(question) {
  const scored = documentKnowledgeBase
    .map(item => ({ ...item, score: scoreDocument(question, item) }))
    .sort((a, b) => b.score - a.score)

  const positive = scored.filter(item => item.score > 0)
  return (positive.length ? positive : scored).slice(0, 3).map((item, index) => ({
    docId: item.docId,
    title: item.title,
    sectionTitle: item.sectionTitle,
    routePath: item.routePath,
    anchor: item.anchor,
    snippet: item.content.slice(0, 110),
    score: Number((0.92 - index * 0.11).toFixed(2)),
  }))
}

function buildRagAnswer(question, service, citations) {
  if (!citations.length) {
    return '当前知识库没有找到足够相关的文档。你可以换一种关键词提问，或联系管理员确认文档索引是否已构建。'
  }

  const modelName = service.chatModel?.source === 'onlineInference'
    ? service.chatModel?.onlineInferenceServiceName
    : service.chatModel?.customApi?.modelName
  const citationText = citations.map(item => `「${item.title} / ${item.sectionTitle}」`).join('、')
  return [
    `已通过 ${service.name} 处理你的问题：“${question}”。`,
    `最相关的文档定位为 ${citationText}。`,
    `当前最小 RAG 服务已完成检索、重排占位和回答生成链路；实际模型调用可接入 ${modelName || '已配置的对话模型'}。`,
  ].join('\n')
}

const server = createServer(async (req, res) => {
  try {
    if (!req.url) {
      return notFound(req, res)
    }

    if (req.method === 'OPTIONS') {
      return json(req, res, 204, {})
    }

    const url = new URL(req.url, `http://${req.headers.host}`)
    const pathname = url.pathname

  if (req.method === 'GET' && pathname === '/api/document-agent/services') {
    const state = await readDocumentAgentDb()
    return json(req, res, 200, { items: state.services })
  }

  if (req.method === 'GET' && pathname === '/api/document-agent/active') {
    const state = await readDocumentAgentDb()
    return json(req, res, 200, { service: state.services.find(item => item.status === 'running') || null })
  }

  if (req.method === 'POST' && pathname === '/api/document-agent/services') {
    const body = await readBody(req)
    const state = await readDocumentAgentDb()
    const createdAt = nowText()
    state.services = [{
      id: `doc-agent-${Date.now()}`,
      name: body.name,
      directory: '文档中心',
      description: body.description || '',
      status: 'stopped',
      indexStatus: 'not_built',
      embedding: body.embedding,
      rerank: body.rerank,
      chatModel: body.chatModel,
      createdBy: 'system_admin',
      createdAt,
      updatedAt: createdAt,
    }]
    await writeDocumentAgentDb(state)
    return json(req, res, 200, { items: state.services })
  }

  const documentAgentServiceMatch = pathname.match(/^\/api\/document-agent\/services\/([^/]+)$/)
  if (req.method === 'PUT' && documentAgentServiceMatch) {
    const targetId = decodeURIComponent(documentAgentServiceMatch[1])
    const body = await readBody(req)
    const state = await readDocumentAgentDb()
    const target = state.services.find(item => item.id === targetId)
    if (!target) {
      return notFound(req, res)
    }

    target.name = body.name
    target.description = body.description || ''
    target.embedding = body.embedding
    target.rerank = body.rerank
    target.chatModel = body.chatModel
    target.updatedAt = nowText()
    await writeDocumentAgentDb(state)
    return json(req, res, 200, { items: state.services })
  }

  if (req.method === 'DELETE' && documentAgentServiceMatch) {
    const targetId = decodeURIComponent(documentAgentServiceMatch[1])
    const state = await readDocumentAgentDb()
    state.services = state.services.filter(item => item.id !== targetId)
    await writeDocumentAgentDb(state)
    return json(req, res, 200, { items: state.services })
  }

  const startDocumentAgentMatch = pathname.match(/^\/api\/document-agent\/services\/([^/]+)\/start$/)
  if (req.method === 'POST' && startDocumentAgentMatch) {
    const targetId = decodeURIComponent(startDocumentAgentMatch[1])
    const state = await readDocumentAgentDb()
    const target = state.services.find(item => item.id === targetId)
    if (!target) {
      return notFound(req, res)
    }

    state.services = state.services.map(item => {
      if (item.id === targetId) {
        return {
          ...item,
          status: 'running',
          indexStatus: item.indexStatus === 'not_built' ? 'ready' : item.indexStatus,
          startedAt: nowText(),
          updatedAt: nowText(),
        }
      }
      return { ...item, status: item.status === 'running' ? 'stopped' : item.status }
    })
    await writeDocumentAgentDb(state)
    return json(req, res, 200, { items: state.services })
  }

  const stopDocumentAgentMatch = pathname.match(/^\/api\/document-agent\/services\/([^/]+)\/stop$/)
  if (req.method === 'POST' && stopDocumentAgentMatch) {
    const targetId = decodeURIComponent(stopDocumentAgentMatch[1])
    const state = await readDocumentAgentDb()
    const target = state.services.find(item => item.id === targetId)
    if (!target) {
      return notFound(req, res)
    }

    target.status = 'stopped'
    target.updatedAt = nowText()
    await writeDocumentAgentDb(state)
    return json(req, res, 200, { items: state.services })
  }

  const testDocumentAgentMatch = pathname.match(/^\/api\/document-agent\/services\/([^/]+)\/test$/)
  if (req.method === 'POST' && testDocumentAgentMatch) {
    const state = await readDocumentAgentDb()
    const target = state.services.find(item => item.id === decodeURIComponent(testDocumentAgentMatch[1]))
    if (!target) {
      return notFound(req, res)
    }

    return json(req, res, 200, { ok: true, message: 'Embedding、Rerank 与对话模型接口契约校验通过' })
  }

  const reindexDocumentAgentMatch = pathname.match(/^\/api\/document-agent\/services\/([^/]+)\/reindex$/)
  if (req.method === 'POST' && reindexDocumentAgentMatch) {
    const targetId = decodeURIComponent(reindexDocumentAgentMatch[1])
    const state = await readDocumentAgentDb()
    const target = state.services.find(item => item.id === targetId)
    if (!target) {
      return notFound(req, res)
    }

    target.indexStatus = 'ready'
    target.updatedAt = nowText()
    await writeDocumentAgentDb(state)
    return json(req, res, 200, { items: state.services })
  }

  if (req.method === 'GET' && pathname === '/api/document-agent/index/status') {
    const state = await readDocumentAgentDb()
    const active = state.services.find(item => item.status === 'running')
    return json(req, res, 200, { status: active?.indexStatus || 'not_built', chunkCount: documentKnowledgeBase.length })
  }

  if (req.method === 'POST' && pathname === '/api/document-agent/chat') {
    const body = await readBody(req)
    const question = String(body.question || '').trim()
    const state = await readDocumentAgentDb()
    const active = state.services.find(item => item.status === 'running')
    if (!active) {
      return json(req, res, 409, { message: '当前没有启动中的文档中心 Agent 服务' })
    }
    if (!question) {
      return json(req, res, 400, { message: '请输入问题' })
    }

    const citations = searchDocuments(question)
    const conversationId = body.conversationId || `conv-${Date.now()}`
    const answer = buildRagAnswer(question, active, citations)
    state.conversations.unshift({
      id: conversationId,
      serviceId: active.id,
      question,
      answer,
      citations,
      createdAt: nowText(),
    })
    state.conversations = state.conversations.slice(0, 50)
    await writeDocumentAgentDb(state)
    return json(req, res, 200, {
      answer,
      citations,
      conversationId,
      serviceName: active.name,
    })
  }

  if (req.method === 'GET' && pathname === '/api/data-service/snapshot') {
    return json(req, res, 200, await readDb())
  }

  const listDatasetMatch = pathname.match(/^\/api\/data-service\/datasets\/(training|validation|test)$/)
  if (req.method === 'GET' && listDatasetMatch) {
    const state = await readDb()
    return json(req, res, 200, queryDatasets(pickList(state, listDatasetMatch[1]), url.searchParams))
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
      dataFormat: normalizeDataFormat(body.dataFormat, normalizeDatasetUsage(body.dataUsage)),
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
    return json(req, res, 200, state)
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
      return notFound(req, res)
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
    return json(req, res, 200, state)
  }

  const deleteDatasetMatch = pathname.match(/^\/api\/data-service\/datasets\/(training|validation|test)\/([^/]+)$/)
  if (req.method === 'DELETE' && deleteDatasetMatch) {
    const [, kind, rawId] = deleteDatasetMatch
    const targetId = decodeURIComponent(rawId)
    const state = await readDb()
    const key = kind === 'training' ? 'trainingDatasets' : kind === 'validation' ? 'validationDatasets' : 'testDatasets'
    state[key] = state[key].filter(item => item.id !== targetId)
    await writeDb(state)
    return json(req, res, 200, state)
  }

  if (req.method === 'POST' && pathname === '/api/data-service/inference-results') {
    const body = await readBody(req)
    const state = await readDb()
    state.inferenceResults.unshift({
      id: `inf-${Date.now()}`,
      name: body.name,
      description: body.description || '',
      progress: '已创建',
      dataUsage: body.dataUsage,
      inferenceMode: body.inferenceMode,
      importFile: body.importFile,
      pendingData: body.pendingData,
      pendingModel: body.pendingModel,
      dataVolume: body.dataVolume ?? Math.max(1, Math.floor(Math.random() * 20) + 1),
      createdAt: nowText(),
    })
    await writeDb(state)
    return json(req, res, 200, state)
  }

  if (req.method === 'GET' && pathname === '/api/data-service/inference-results') {
    const state = await readDb()
    return json(req, res, 200, queryInference(state.inferenceResults, url.searchParams))
  }

  const deleteInferenceMatch = pathname.match(/^\/api\/data-service\/inference-results\/([^/]+)$/)
  if (req.method === 'PATCH' && deleteInferenceMatch) {
    const targetId = decodeURIComponent(deleteInferenceMatch[1])
    const body = await readBody(req)
    const state = await readDb()
    const target = state.inferenceResults.find(item => item.id === targetId)
    if (!target) {
      return notFound(req, res)
    }
    target.name = String(body.name || '').trim() || target.name
    target.description = String(body.description || '').trim()
    await writeDb(state)
    return json(req, res, 200, state)
  }

  if (req.method === 'DELETE' && deleteInferenceMatch) {
    const targetId = decodeURIComponent(deleteInferenceMatch[1])
    const state = await readDb()
    state.inferenceResults = state.inferenceResults.filter(item => item.id !== targetId)
    await writeDb(state)
    return json(req, res, 200, state)
  }

  const startInferenceMatch = pathname.match(/^\/api\/data-service\/inference-results\/([^/]+)\/start$/)
  if (req.method === 'POST' && startInferenceMatch) {
    const targetId = decodeURIComponent(startInferenceMatch[1])
    const state = await readDb()
    const target = state.inferenceResults.find(item => item.id === targetId)
    if (!target) {
      return notFound(req, res)
    }
    if (target.progress !== '启动中') {
      target.progress = '启动中'
    }
    await writeDb(state)
    return json(req, res, 200, state)
  }

  const terminateInferenceMatch = pathname.match(/^\/api\/data-service\/inference-results\/([^/]+)\/terminate$/)
  if (req.method === 'POST' && terminateInferenceMatch) {
    const targetId = decodeURIComponent(terminateInferenceMatch[1])
    const state = await readDb()
    const target = state.inferenceResults.find(item => item.id === targetId)
    if (!target) {
      return notFound(req, res)
    }
    target.progress = '已终止'
    await writeDb(state)
    return json(req, res, 200, state)
  }

  if (req.method === 'POST' && pathname === '/api/data-service/annotation-tasks') {
    const body = await readBody(req)
    const state = await readDb()
    state.annotationTasks.unshift({
      id: `ann-${Date.now()}`,
      name: body.name,
      dataVolume: body.dataVolume,
      progress: 0,
      status: '未开始',
      collaborationMode: body.collaborationMode,
      reviewerCount: body.reviewerCount,
      reviewMode: body.reviewMode,
      datasetType: body.datasetType,
      preDataset: body.preDataset,
      postDataset: body.postDataset || '-',
      outputMode: body.outputMode,
      creator: 'deepexilab',
      createdAt: nowText().replace(/\//g, '-'),
    })
    await writeDb(state)
    return json(req, res, 200, state)
  }

  if (req.method === 'GET' && pathname === '/api/data-service/annotation-tasks') {
    const state = await readDb()
    const page = Number(url.searchParams.get('page') || '1')
    const pageSize = Number(url.searchParams.get('pageSize') || '10')
    return json(req, res, 200, paginate(state.annotationTasks, page, pageSize))
  }

  const deleteAnnotationMatch = pathname.match(/^\/api\/data-service\/annotation-tasks\/([^/]+)$/)
  if (req.method === 'DELETE' && deleteAnnotationMatch) {
    const targetId = decodeURIComponent(deleteAnnotationMatch[1])
    const state = await readDb()
    state.annotationTasks = state.annotationTasks.filter(item => item.id !== targetId)
    await writeDb(state)
    return json(req, res, 200, state)
  }

  if (req.method === 'POST' && pathname === '/api/data-service/cleaning-tasks') {
    const body = await readBody(req)
    const state = await readDb()
    state.cleaningTasks.unshift({
      id: `clean-${Date.now()}`,
      name: body.name,
      description: body.description || '',
      status: '启动中',
      preDataset: body.preDataset,
      postDataset: body.postDataset || '-',
      operatorValues: body.operatorValues || [],
      creator: 'deepexilab',
      createdAt: nowText(),
    })
    await writeDb(state)
    return json(req, res, 200, state)
  }

  if (req.method === 'GET' && pathname === '/api/data-service/cleaning-tasks') {
    const state = await readDb()
    return json(req, res, 200, queryCleaning(state.cleaningTasks, url.searchParams))
  }

  const deleteCleaningMatch = pathname.match(/^\/api\/data-service\/cleaning-tasks\/([^/]+)$/)
  if (req.method === 'PATCH' && deleteCleaningMatch) {
    const targetId = decodeURIComponent(deleteCleaningMatch[1])
    const body = await readBody(req)
    const state = await readDb()
    const target = state.cleaningTasks.find(item => item.id === targetId)
    if (!target) {
      return notFound(req, res)
    }
    target.name = String(body.name || '').trim() || target.name
    target.description = String(body.description || '').trim()
    await writeDb(state)
    return json(req, res, 200, state)
  }

  if (req.method === 'DELETE' && deleteCleaningMatch) {
    const targetId = decodeURIComponent(deleteCleaningMatch[1])
    const state = await readDb()
    state.cleaningTasks = state.cleaningTasks.filter(item => item.id !== targetId)
    await writeDb(state)
    return json(req, res, 200, state)
  }

  const startCleaningMatch = pathname.match(/^\/api\/data-service\/cleaning-tasks\/([^/]+)\/start$/)
  if (req.method === 'POST' && startCleaningMatch) {
    const targetId = decodeURIComponent(startCleaningMatch[1])
    const state = await readDb()
    const target = state.cleaningTasks.find(item => item.id === targetId)
    if (!target) {
      return notFound(req, res)
    }
    if (target.status !== '启动中') {
      target.status = '启动中'
    }
    await writeDb(state)
    return json(req, res, 200, state)
  }

    return notFound(req, res)
  } catch (error) {
    const statusCode = Number(error?.statusCode || 500)
    const message = statusCode === 500 ? 'Internal Server Error' : error.message
    return json(req, res, statusCode, { message })
  }
})

server.listen(port, host, () => {
  console.log(`data-service api listening on http://${host}:${port}`)
})
