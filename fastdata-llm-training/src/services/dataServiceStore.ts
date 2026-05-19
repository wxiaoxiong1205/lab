import { useSyncExternalStore } from 'react'
import { normalizeDatasetUsage, type TrainingDatasetUsage } from './datasetUsage'
import { isDpoUsage, normalizeDatasetFormat, type CanonicalDatasetFormat } from './datasetFormats'
import { getCurrentUser } from './permissionStore'

export type DataUsage = TrainingDatasetUsage
export type DataFormat = CanonicalDatasetFormat
export type TaskLifecycleStatus =
  | '已创建'
  | '定时待启动'
  | '启动中'
  | '排队中'
  | '运行中'
  | '已完成'
  | '失败'
  | '已终止'

export interface DatasetDetailRowRecord {
  key: string
  system?: string
  user?: string
  assistant?: string
  instruction?: string
  input?: string
  messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  chosen?: string | { role: 'assistant'; content: string }
  rejected?: string | { role: 'assistant'; content: string }
  prompt?: string
  response?: string
}

export interface DatasetVersionRecord {
  id: string
  version: string
  processStatus: string
  publishStatus: string
  creator?: string
  createdAt: string
  sampleCount: number
  charCount?: number
  trainRatio?: number
  description?: string
  detailRows: DatasetDetailRowRecord[]
}

export interface DatasetRecord {
  id: string
  name: string
  versionStatus: string
  latestVersion: string
  dataUsage: DataUsage
  dataFormat: DataFormat
  creator: string
  createdAt: string
  status: string
  sampleCount: number
  charCount?: number
  trainRatio?: number
  versions: DatasetVersionRecord[]
}

export interface InferenceResultRecord {
  id: string
  name: string
  description?: string
  progress: TaskLifecycleStatus
  dataUsage: '文本生成' | '图像理解'
  inferenceMode?: '离线推理' | '在线推理' | '导入推理结果集'
  importFile?: string
  pendingData: string
  pendingModel: string
  dataVolume: number | '-'
  createdAt: string
}

export interface AnnotationTaskRecord {
  id: string
  name: string
  description?: string
  dataVolume: number
  progress: number | null
  status?: '未开始' | '标注中' | '待审核' | '已完成' | '已提交' | '失败'
  collaborationMode?: 'online' | 'multi'
  reviewerCount?: number
  reviewMode?: string
  datasetType?: 'text-generation' | 'image-understanding'
  preDataset: string
  postDataset: string
  outputMode?: string
  creator: string
  createdAt: string
}

export interface CleaningTaskRecord {
  id: string
  name: string
  description?: string
  status: TaskLifecycleStatus
  preDataset: string
  postDataset: string
  operatorValues?: string[]
  creator: string
  createdAt: string
}

export interface DataServiceState {
  trainingDatasets: DatasetRecord[]
  validationDatasets: DatasetRecord[]
  testDatasets: DatasetRecord[]
  inferenceResults: InferenceResultRecord[]
  annotationTasks: AnnotationTaskRecord[]
  cleaningTasks: CleaningTaskRecord[]
}

const STORAGE_KEY = 'lab-coding:data-service-store:v1'

function nowText(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

function nextVersionLabel(current: string): string {
  const match = /^V(\d+)$/i.exec(current)
  const num = match ? Number(match[1]) : 1
  return `V${num + 1}`
}

function buildSeedDetailRows(
  format: DataFormat,
  name: string,
  version: string,
  dataUsage: DataUsage = 'SFT-文本生成',
): DatasetDetailRowRecord[] {
  if (isDpoUsage(dataUsage)) {
    if (format === 'role-based') {
      return [
        {
          key: `${name}-${version}-1`,
          messages: [
            { role: 'system', content: '你是一名电商售后服务助手，需要在安抚用户情绪的同时给出清晰的退换货建议。' },
            { role: 'user', content: '耳机收到后右耳没有声音，我已经很着急了，今天必须用。' },
          ],
          chosen: { role: 'assistant', content: '非常抱歉影响了您的使用。我先帮您排查，如确认设备故障可优先为您安排补发，并同步补偿运费。' },
          rejected: { role: 'assistant', content: '你先再试几次，如果还是不行就自己联系售后，平台这边暂时帮不上忙。' },
        },
        {
          key: `${name}-${version}-2`,
          messages: [
            { role: 'system', content: '你是一名金融客服回复优化助手，需要确保表述准确、合规、稳妥。' },
            { role: 'user', content: '基金今天跌了这么多，是不是应该马上全部赎回？' },
          ],
          chosen: { role: 'assistant', content: '我无法直接给出投资决策建议。您可以先关注持仓目标、风险承受能力和基金公告，再结合专业顾问意见综合判断。' },
          rejected: { role: 'assistant', content: '建议你立刻全部赎回，不然继续跌下去会更亏。' },
        },
        {
          key: `${name}-${version}-3`,
          messages: [
            { role: 'system', content: '你是一名医疗问答质检助手，输出应避免夸大疗效和替代医生诊断。' },
            { role: 'user', content: '我连续发烧三天，能不能只吃退烧药不去医院？' },
          ],
          chosen: { role: 'assistant', content: '连续发烧三天建议尽快就医明确原因。退烧药只能缓解症状，若伴随呼吸困难、剧烈头痛或意识异常，应及时就诊。' },
          rejected: { role: 'assistant', content: '不用去医院，继续吃退烧药就行，通常自己会好的。' },
        },
      ]
    }

    return [
      {
        key: `${name}-${version}-1`,
        instruction: '解释什么是过拟合',
        input: '',
        chosen: '过拟合是指模型在训练集上表现很好，但对未见数据泛化较差的现象。',
        rejected: '过拟合就是训练时间太长。',
      },
      {
        key: `${name}-${version}-2`,
        instruction: '请给出更稳妥的客服回复。',
        input: '耳机收到后右耳没有声音，我已经很着急了，今天必须用。',
        chosen: '非常抱歉影响了您的使用。我先帮您排查，如确认设备故障可优先为您安排补发，并同步补偿运费。',
        rejected: '你先再试几次，如果还是不行就自己联系售后，平台这边暂时帮不上忙。',
      },
      {
        key: `${name}-${version}-3`,
        instruction: '请改写为合规的金融客服答复。',
        input: '基金今天跌了这么多，是不是应该马上全部赎回？',
        chosen: '我无法直接给出投资决策建议。您可以先关注持仓目标、风险承受能力和基金公告，再结合专业顾问意见综合判断。',
        rejected: '建议你立刻全部赎回，不然继续跌下去会更亏。',
      },
      {
        key: `${name}-${version}-4`,
        instruction: '请输出安全的医疗问答回复。',
        input: '我连续发烧三天，能不能只吃退烧药不去医院？',
        chosen: '连续发烧三天建议尽快就医明确原因。退烧药只能缓解症状，若伴随呼吸困难、剧烈头痛或意识异常，应及时就诊。',
        rejected: '不用去医院，继续吃退烧药就行，通常自己会好的。',
      },
      {
        key: `${name}-${version}-5`,
        instruction: '请生成清晰可执行的政务热线答复。',
        input: '居住证补办一般需要多久？',
        chosen: '不同地区办理时长会略有差异，通常可在提交补办材料后 5 到 10 个工作日内完成，建议以当地政务大厅通知为准。',
        rejected: '这个时间不固定，你自己去问窗口吧。',
      },
      {
        key: `${name}-${version}-6`,
        instruction: '请避免夸大承诺，生成教育咨询答复。',
        input: '报了你们的课程就一定能保过吗？',
        chosen: '课程会提供系统内容与练习支持，但考试结果仍与个人基础、投入时间和发挥有关，无法承诺保过。',
        rejected: '只要报名我们的课，基本都能保过。',
      },
      {
        key: `${name}-${version}-7`,
        instruction: '请把企业流程问题解释得简洁易懂。',
        input: '为什么我提交报销后一直显示审批中？',
        chosen: '通常是流程仍停留在直属审批人或财务复核节点。您可以先查看流程记录，若超过制度时限，再联系对应审批人协助处理。',
        rejected: '审批慢很正常，等着就好。',
      },
      {
        key: `${name}-${version}-8`,
        instruction: '请生成兼顾同理心和可执行方案的物流异常回复。',
        input: '快递显示签收了，但我根本没收到。',
        chosen: '抱歉给您带来困扰。我建议先核对代收点和门卫处，同时我可以帮您发起快递员回访与异常件核查。',
        rejected: '签收了就是签收了，可能是你自己没找到。',
      },
    ]
  }

  if (format === 'role-based') {
    return [
      {
        key: `${name}-${version}-1`,
        system: '你是一名数据质量审核助手。',
        user: `${name} ${version} 的示例输入 1`,
        assistant: '这是示例输出。',
      },
      {
        key: `${name}-${version}-2`,
        system: '你是一名数据质量审核助手。',
        user: '请判断这段内容是否合规。',
        assistant: '判断结果：合规。',
      },
    ]
  }

  return [
    {
      key: `${name}-${version}-1`,
      system: '# 角色：内容安全审核专家 ## 描述：负责识别和评估文本中的潜在安全风险。',
      prompt: `${name} ${version} 的示例 Prompt 1`,
      response: '判断结果：【不安全】 判断依据：涉及知识产权类、经济犯罪类违规内容。',
    },
    {
      key: `${name}-${version}-2`,
      system: '# 角色：内容安全审核专家 ## 描述：负责识别和评估文本中的潜在安全风险。',
      prompt: `${name} ${version} 的示例 Prompt 2`,
      response: '判断结果：【不安全】 判断依据：属于道德伦理类违规内容。',
    },
  ]
}

function makeDataset(params: {
  id: string
  name: string
  latestVersion: string
  dataUsage: DataUsage
  dataFormat: DataFormat
  creator: string
  createdAt: string
  status?: string
  sampleCount: number
  charCount?: number
  trainRatio?: number
  description?: string
}): DatasetRecord {
  const {
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
    description,
    status = '已发布',
  } = params

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
        creator,
        createdAt,
        sampleCount,
        charCount,
        trainRatio,
        description,
        detailRows: buildSeedDetailRows(dataFormat, name, latestVersion, dataUsage),
      },
    ],
  }
}

const seedState: DataServiceState = {
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
    makeDataset({ id: 'train-8', name: '奖励反馈训练集-RFT-PPO', latestVersion: 'V3', dataUsage: 'RFT-PPO-文本生成', dataFormat: 'prompt-response', creator: 'deepexilab', createdAt: '2026/03/02 09:30:00', sampleCount: 24, charCount: 58000, trainRatio: 80 }),
    makeDataset({ id: 'train-9', name: '群组反馈训练集-RFT-GRPO', latestVersion: 'V1', dataUsage: 'RFT-GRPO-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/03/01 16:10:00', sampleCount: 16, charCount: 36000, trainRatio: 80 }),
    makeDataset({ id: 'train-10', name: 'DPO-Role-Based-客服质检训练集', latestVersion: 'V4', dataUsage: 'DPO-文本生成', dataFormat: 'role-based', creator: 'deepexilab', createdAt: '2026/03/10 10:16:00', sampleCount: 96, charCount: 268000, trainRatio: 80 }),
    makeDataset({ id: 'train-11', name: '多轮指令精调-SFT-财税问答', latestVersion: 'V3', dataUsage: 'SFT-文本生成', dataFormat: 'role-based', creator: 'lab1', createdAt: '2026/03/09 19:20:00', sampleCount: 128, charCount: 312000, trainRatio: 80 }),
    makeDataset({ id: 'train-12', name: 'DPO-Role-Based-电商图文偏好训练集', latestVersion: 'V2', dataUsage: 'DPO-图像理解', dataFormat: 'role-based', creator: 'admin', createdAt: '2026/03/07 13:42:00', sampleCount: 64, charCount: 91000, trainRatio: 80 }),
    makeDataset({ id: 'train-3', name: '222222222222222', latestVersion: 'V1', dataUsage: 'SFT-文本生成', dataFormat: 'prompt-response', creator: 'lab1', createdAt: '2026/03/07 09:15:00', sampleCount: 20, charCount: 56000, trainRatio: 80 }),
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

function cloneState(state: DataServiceState): DataServiceState {
  return JSON.parse(JSON.stringify(state)) as DataServiceState
}

function enrichStateWithTrainingSeeds(nextState: DataServiceState): DataServiceState {
  const draft = cloneState(nextState)
  const seedFormatById = new Map(
    [
      ...seedState.trainingDatasets,
      ...seedState.validationDatasets,
      ...seedState.testDatasets,
    ].map(item => [item.id, item.dataFormat]),
  )
  const seedDatasetById = new Map(
    [
      ...seedState.trainingDatasets,
      ...seedState.validationDatasets,
      ...seedState.testDatasets,
    ].map(item => [item.id, item]),
  )
  const trainingIds = new Set(draft.trainingDatasets.map(item => item.id))
  seedState.trainingDatasets.forEach(item => {
    if (!trainingIds.has(item.id)) {
      draft.trainingDatasets.push(cloneState({ trainingDatasets: [item], validationDatasets: [], testDatasets: [], inferenceResults: [], annotationTasks: [], cleaningTasks: [] }).trainingDatasets[0])
    }
  })

  const annotationIds = new Map(draft.annotationTasks.map(item => [item.id, item]))
  seedState.annotationTasks.forEach(item => {
    const existing = annotationIds.get(item.id)
    if (existing) {
      Object.assign(existing, cloneState({ trainingDatasets: [], validationDatasets: [], testDatasets: [], inferenceResults: [], annotationTasks: [item], cleaningTasks: [] }).annotationTasks[0])
    } else {
      draft.annotationTasks.push(cloneState({ trainingDatasets: [], validationDatasets: [], testDatasets: [], inferenceResults: [], annotationTasks: [item], cleaningTasks: [] }).annotationTasks[0])
    }
  })

  const cleaningIds = new Map(draft.cleaningTasks.map(item => [item.id, item]))
  seedState.cleaningTasks.forEach(item => {
    const existing = cleaningIds.get(item.id)
    if (existing) {
      Object.assign(existing, cloneState({ trainingDatasets: [], validationDatasets: [], testDatasets: [], inferenceResults: [], annotationTasks: [], cleaningTasks: [item] }).cleaningTasks[0])
    } else {
      draft.cleaningTasks.push(cloneState({ trainingDatasets: [], validationDatasets: [], testDatasets: [], inferenceResults: [], annotationTasks: [], cleaningTasks: [item] }).cleaningTasks[0])
    }
  })

  const normalizeDatasetList = (items: DatasetRecord[]) => items.map(item => {
    if (!isDpoUsage(item.dataUsage)) {
      return item
    }

    const seedDataset = seedDatasetById.get(item.id)
    const nextFormat = seedFormatById.get(item.id) ?? normalizeDatasetFormat(item.dataFormat, item.dataUsage)
    return {
      ...item,
      name: seedDataset?.name ?? item.name,
      dataUsage: seedDataset?.dataUsage ?? item.dataUsage,
      dataFormat: nextFormat,
      versions: item.versions.map(version => ({
        ...version,
        detailRows:
          seedDataset
            ? buildSeedDetailRows(nextFormat, seedDataset.name, version.version, seedDataset.dataUsage)
            : version.detailRows?.some(row => row.instruction || row.messages)
            ? version.detailRows
            : buildSeedDetailRows(nextFormat, item.name, version.version, item.dataUsage),
      })),
    }
  })

  draft.trainingDatasets = normalizeDatasetList(draft.trainingDatasets)
  draft.validationDatasets = normalizeDatasetList(draft.validationDatasets)
  draft.testDatasets = normalizeDatasetList(draft.testDatasets)

  return draft
}

function readState(): DataServiceState {
  if (typeof window === 'undefined') {
    return enrichStateWithTrainingSeeds(seedState)
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? enrichStateWithTrainingSeeds(JSON.parse(raw) as DataServiceState) : enrichStateWithTrainingSeeds(seedState)
  } catch {
    return enrichStateWithTrainingSeeds(seedState)
  }
}

let state = readState()
const listeners = new Set<() => void>()

function emit() {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }
  listeners.forEach(listener => listener())
}

function update(mutator: (draft: DataServiceState) => void) {
  const draft = cloneState(state)
  mutator(draft)
  state = draft
  emit()
}

export function useDataServiceStore(): DataServiceState {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
    () => state,
  )
}

export function getDataServiceState(): DataServiceState {
  return state
}

export function replaceDataServiceState(nextState: DataServiceState): void {
  state = cloneState(nextState)
  emit()
}

function createDatasetVersion(
  version: string,
  createdAt: string,
  sampleCount: number,
  charCount?: number,
  trainRatio?: number,
  description?: string,
  detailRows?: DatasetDetailRowRecord[],
  creator?: string,
): DatasetVersionRecord {
  return {
    id: `${version}-${Date.now()}`,
    version,
    processStatus: '处理完成',
    publishStatus: '已发布',
    creator,
    createdAt,
    sampleCount,
    charCount,
    trainRatio,
    description,
    detailRows: detailRows ?? [],
  }
}

export const dataServiceActions = {
  createDataset(
    kind: 'training' | 'validation' | 'test',
    params: { name: string; dataUsage: TrainingDatasetUsage | '文本生成' | '图像理解'; dataFormat: 'PROMPT_RESPONSE' | 'ROLE_BASED' | 'ALPACA' },
  ) {
    update(draft => {
      const createdAt = nowText()
      const normalizedUsage = normalizeDatasetUsage(params.dataUsage)
      const next: DatasetRecord = {
        id: `${kind}-${Date.now()}`,
        name: params.name,
        versionStatus: '处理完成',
        latestVersion: 'V1',
        dataUsage: normalizedUsage,
        dataFormat: normalizeDatasetFormat(params.dataFormat, normalizedUsage),
        creator: getCurrentUser().account,
        createdAt,
        status: '已发布',
        sampleCount: Math.max(2, Math.floor(Math.random() * 40) + 2),
        charCount: kind === 'test' ? undefined : Math.floor(Math.random() * 90000) + 12000,
        trainRatio: kind === 'validation' ? 20 : kind === 'test' ? undefined : 80,
        versions: [],
      }

      next.versions = [
        createDatasetVersion(
          next.latestVersion,
          createdAt,
          next.sampleCount,
          next.charCount,
          next.trainRatio,
          undefined,
          buildSeedDetailRows(next.dataFormat, next.name, next.latestVersion, next.dataUsage),
          next.creator,
        ),
      ]

      if (kind === 'training') draft.trainingDatasets.unshift(next)
      else if (kind === 'validation') draft.validationDatasets.unshift(next)
      else draft.testDatasets.unshift(next)
    })
  },

  addDatasetVersion(
    kind: 'training' | 'validation' | 'test',
    id: string,
    options?: { inheritFromPrevious?: boolean; description?: string },
  ) {
    update(draft => {
      const list =
        kind === 'training'
          ? draft.trainingDatasets
          : kind === 'validation'
            ? draft.validationDatasets
            : draft.testDatasets
      const target = list.find(item => item.id === id)
      if (!target) return

      const createdAt = nowText()
      const nextVersion = nextVersionLabel(target.latestVersion)
      target.versions = target.versions.map(item =>
        item.version === target.latestVersion ? { ...item, publishStatus: '已归档' } : item,
      )
      target.latestVersion = nextVersion
      target.createdAt = createdAt
      target.versionStatus = '处理完成'
      target.status = '已发布'
      target.sampleCount = Math.max(2, Math.floor(Math.random() * 40) + 2)
      if (typeof target.charCount === 'number') {
        target.charCount = Math.floor(Math.random() * 90000) + 12000
      }
      const previousVersion = target.versions[0]
      target.versions.unshift(
          createDatasetVersion(
          nextVersion,
          createdAt,
          target.sampleCount,
          target.charCount,
          target.trainRatio,
          options?.description,
          options?.inheritFromPrevious
            ? JSON.parse(JSON.stringify(previousVersion?.detailRows ?? []))
            : buildSeedDetailRows(target.dataFormat, target.name, nextVersion, target.dataUsage),
          getCurrentUser().account,
        ),
      )
    })
  },

  deleteDataset(kind: 'training' | 'validation' | 'test', id: string) {
    update(draft => {
      if (kind === 'training') draft.trainingDatasets = draft.trainingDatasets.filter(item => item.id !== id)
      else if (kind === 'validation') draft.validationDatasets = draft.validationDatasets.filter(item => item.id !== id)
      else draft.testDatasets = draft.testDatasets.filter(item => item.id !== id)
    })
  },

  deleteDatasetDetailRow(
    kind: 'training' | 'validation' | 'test',
    id: string,
    versionId: string,
    rowKey: string,
    currentRows: DatasetDetailRowRecord[],
  ) {
    update(draft => {
      const list =
        kind === 'training'
          ? draft.trainingDatasets
          : kind === 'validation'
            ? draft.validationDatasets
            : draft.testDatasets
      const target = list.find(item => item.id === id)
      const version = target?.versions.find(item => item.id === versionId)
      if (!target || !version) return

      const sourceRows = version.detailRows?.length ? version.detailRows : currentRows
      version.detailRows = sourceRows.filter(item => item.key !== rowKey)
      version.sampleCount = version.detailRows.length

      if (version.version === target.latestVersion) {
        target.sampleCount = version.sampleCount
      }
    })
  },

  createInferenceResult(params: {
    name: string
    description?: string
    dataUsage: '文本生成' | '图像理解'
    inferenceMode?: '离线推理' | '在线推理' | '导入推理结果集'
    importFile?: string
    pendingData: string
    pendingModel: string
    dataVolume?: number | '-'
  }) {
    update(draft => {
      draft.inferenceResults.unshift({
        id: `inf-${Date.now()}`,
        name: params.name,
        description: params.description ?? '',
        progress: '已创建',
        dataUsage: params.dataUsage,
        inferenceMode: params.inferenceMode,
        importFile: params.importFile,
        pendingData: params.pendingData,
        pendingModel: params.pendingModel,
        dataVolume: params.dataVolume ?? Math.max(1, Math.floor(Math.random() * 20) + 1),
        createdAt: nowText(),
      })
    })
  },

  updateInferenceResultMeta(id: string, value: { name: string; description?: string }) {
    update(draft => {
      const target = draft.inferenceResults.find(item => item.id === id)
      if (!target) return
      target.name = value.name
      target.description = value.description ?? ''
    })
  },

  deleteInferenceResult(id: string) {
    update(draft => {
      draft.inferenceResults = draft.inferenceResults.filter(item => item.id !== id)
    })
  },

  startInferenceResult(id: string) {
    update(draft => {
      const target = draft.inferenceResults.find(item => item.id === id)
      if (!target) return
      if (target.progress !== '启动中') {
        target.progress = '启动中'
      }
    })
  },

  terminateInferenceResult(id: string) {
    update(draft => {
      const target = draft.inferenceResults.find(item => item.id === id)
      if (!target) return
      target.progress = '已终止'
    })
  },

  createAnnotationTask(params: {
    name: string
    dataVolume: number
    collaborationMode?: 'online' | 'multi'
    reviewerCount?: number
    reviewMode?: string
    datasetType?: 'text-generation' | 'image-understanding'
    preDataset: string
    postDataset?: string
    outputMode?: string
  }) {
    update(draft => {
      draft.annotationTasks.unshift({
        id: `ann-${Date.now()}`,
        name: params.name,
        description: '',
        dataVolume: params.dataVolume,
        progress: 0,
        status: '未开始',
        collaborationMode: params.collaborationMode,
        reviewerCount: params.reviewerCount,
        reviewMode: params.reviewMode,
        datasetType: params.datasetType,
        preDataset: params.preDataset,
        postDataset: params.postDataset ?? '-',
        outputMode: params.outputMode,
        creator: 'deepexilab',
        createdAt: nowText().replace(/\//g, '-'),
      })
    })
  },

  deleteAnnotationTask(id: string) {
    update(draft => {
      draft.annotationTasks = draft.annotationTasks.filter(item => item.id !== id)
    })
  },

  updateAnnotationTaskMeta(id: string, value: { name: string; description?: string }) {
    update(draft => {
      const target = draft.annotationTasks.find(item => item.id === id)
      if (!target) return
      target.name = value.name
      target.description = value.description ?? ''
    })
  },

  createCleaningTask(params: {
    name: string
    description?: string
    preDataset: string
    postDataset?: string
    operatorValues?: string[]
  }) {
    update(draft => {
      draft.cleaningTasks.unshift({
        id: `clean-${Date.now()}`,
        name: params.name,
        description: params.description ?? '',
        status: '启动中',
        preDataset: params.preDataset,
        postDataset: params.postDataset ?? '-',
        operatorValues: params.operatorValues ?? [],
        creator: 'deepexilab',
        createdAt: nowText(),
      })
    })
  },

  deleteCleaningTask(id: string) {
    update(draft => {
      draft.cleaningTasks = draft.cleaningTasks.filter(item => item.id !== id)
    })
  },

  updateCleaningTaskMeta(id: string, value: { name: string; description?: string }) {
    update(draft => {
      const target = draft.cleaningTasks.find(item => item.id === id)
      if (!target) return
      target.name = value.name
      target.description = value.description ?? ''
    })
  },

  startCleaningTask(id: string) {
    update(draft => {
      const target = draft.cleaningTasks.find(item => item.id === id)
      if (!target) return
      if (target.status !== '启动中') {
        target.status = '启动中'
      }
    })
  },
}
