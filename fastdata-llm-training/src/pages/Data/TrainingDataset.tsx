import React, { useEffect, useMemo, useState } from 'react'
import { message, Modal, Form, Input, Select, Button, Typography, Space, Divider, Descriptions, Tabs, Table, Tag, Card, Dropdown, Radio, Cascader } from 'antd'
import { DatabaseOutlined, PlusOutlined, PlayCircleOutlined, DownloadOutlined, DeleteOutlined, FileTextOutlined, ArrowLeftOutlined, InfoCircleOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd/es/upload/interface'
import type { ColumnsType } from 'antd/es/table'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { PaginatedResult } from '../../services/dataServiceApi'
import { dataServiceApi, selectDatasets, useDataServiceSnapshot } from '../../services/dataServiceApi'
import {
  DATASET_USAGE_CASCADER_OPTIONS,
  DATASET_USAGE_TAGS,
  getDatasetUsagePath,
  resolveDatasetUsageFromPath,
} from '../../services/datasetUsage'
import { getDatasetFormatLabel, isDpoUsage, normalizeDatasetFormat } from '../../services/datasetFormats'
import { formatResourceLockMessage, getCreatorDeletePermission, getDatasetReferenceLocks } from '../../services/resourceReferenceGuard'
import ResumableUpload from '../../components/ResumableUpload'
import TaskMetadataEditor from '../../components/TaskMetadataEditor'
import DatasetVersionMergeModal from '../../components/DatasetVersionMergeModal'
import { validateFieldsAndScroll } from '../../utils/formValidation'

const { Text } = Typography
const { TextArea } = Input

const statusMap: Record<string, { color: string; label: string }> = {
  处理完成: { color: 'success', label: '处理完成' },
  处理中: { color: 'processing', label: '处理中' },
  处理失败: { color: 'error', label: '处理失败' },
}

const versionStatusMap: Record<string, { color: string; label: string }> = {
  已发布: { color: 'green', label: '已发布' },
  未发布: { color: 'default', label: '未发布' },
  处理失败: { color: 'error', label: '处理失败' },
}

function resolveVersionPublishStatus(
  version?: { processStatus?: string; publishStatus?: string },
  fallbackPublishStatus?: string,
  fallbackProcessStatus?: string,
): keyof typeof versionStatusMap {
  if (version?.processStatus === '处理失败' || fallbackProcessStatus === '处理失败') {
    return '处理失败'
  }
  if (version?.publishStatus === '已发布') {
    return '已发布'
  }
  if (version?.publishStatus === '未发布') {
    return '未发布'
  }
  if (fallbackPublishStatus === '已发布') return '已发布'
  return '未发布'
}

export type DatasetVersionRow = {
  id: string
  version: string
  processStatus: string
  publishStatus: string
  creator?: string
  trainRatio: number
  sampleCount: number
  charCount: number
  description?: string
  createdAt: string
}

export type TrainingDatasetRecord = {
  id: string
  name: string
  description?: string
  versionStatus: string
  latestVersion: string
  dataUsage: string
  dataFormat: string
  creator: string
  createdAt: string
  trainRatio: number
  sampleCount: number
  charCount: number
  status: string
  versions: DatasetVersionRow[]
}

type DatasetDetailRow = {
  key: string
  sourceVersion?: string
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

type TemplateDownloadFormat = 'jsonl' | 'json' | 'csv'

const DATA_ATTRIBUTE_GROUPS = [
  {
    key: 'trainingTest1',
    title: '训练测试1',
    item: {
      key: 'singleOptional',
      label: '下拉-单选-非必填',
      mode: 'single' as const,
      placeholder: '请选择属性值',
      options: ['训练集A', '训练集B', '训练集C'],
    },
  },
  {
    key: 'trainingTest2',
    title: '训练测试2',
    item: {
      key: 'singleAnother',
      label: '下拉-单选-必填(改成非必填)',
      mode: 'single' as const,
      placeholder: '请选择属性值',
      options: ['客服语料', '政务语料', '医疗语料'],
    },
  },
] as const

function resolveFormatLabel(dataUsage?: string, dataFormat?: string): string {
  return getDatasetFormatLabel(dataUsage, dataFormat)
}

function buildJsonTemplateRows(dataUsage?: string, dataFormat?: string): Array<Record<string, unknown>> {
  if (isDpoUsage(dataUsage)) {
    const normalizedFormat = normalizeDatasetFormat(dataFormat, dataUsage)
    if (normalizedFormat === 'role-based') {
      return [
        {
          messages: [
            { role: 'system', content: '你是一个严谨的中文助手。' },
            { role: 'user', content: '请解释什么是过拟合。' },
          ],
          chosen: { role: 'assistant', content: '过拟合是指模型过度记住训练集细节，导致泛化能力下降。' },
          rejected: { role: 'assistant', content: '过拟合就是模型训练了很久。' },
        },
      ]
    }

    return [
      {
        instruction: '解释什么是过拟合',
        input: '',
        chosen: '过拟合是指模型在训练集上表现很好，但对未见数据泛化较差的现象。',
        rejected: '过拟合就是训练时间太长。',
      },
    ]
  }

  if (dataFormat === 'ROLE_BASED') {
    return [
      {
        system: '你是一名数据审核助手。',
        user: '请判断这段文本是否合规。',
        assistant: '经判断，该文本合规，可继续流转。',
      },
      {
        system: '你是一名企业知识库助手。',
        user: '请总结本周项目风险。',
        assistant: '本周项目风险主要集中在数据延迟、接口联调和资源排期三部分。',
      },
    ]
  }

  return [
    {
      system: '你是一名内容安全审核专家。',
      prompt: '请判断下面这段内容是否存在违规风险。',
      response: '判断结果：安全。判断依据：未发现明显违规语义。',
    },
    {
      system: '你是一名内容安全审核专家。',
      prompt: '请识别文本中的潜在安全风险并给出结论。',
      response: '判断结果：不安全。判断依据：存在明显的违规引导内容。',
    },
  ]
}

function buildSheetTemplateRows(dataUsage?: string, dataFormat?: string): Array<Record<string, string>> {
  if (isDpoUsage(dataUsage)) {
    const normalizedFormat = normalizeDatasetFormat(dataFormat, dataUsage)
    if (normalizedFormat === 'role-based') {
      return buildJsonTemplateRows(dataUsage, dataFormat).map(row =>
        Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)])),
      )
    }

    return [
      {
        instruction: '解释什么是过拟合',
        input: '',
        chosen: '过拟合是指模型在训练集上表现很好，但对未见数据泛化较差的现象。',
        rejected: '过拟合就是训练时间太长。',
      },
    ]
  }

  return buildJsonTemplateRows(dataUsage, dataFormat).map(row =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]),
    ),
  )
}

function normalizeRowsForSheet(rows: DatasetDetailRow[]): Array<Record<string, string>> {
  return rows.map(row => {
    const entries = Object.entries(row)
      .filter(([key, value]) => key !== 'key' && value !== undefined && value !== null)
      .map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)])
    return Object.fromEntries(entries)
  })
}

function escapeCsvValue(value: unknown): string {
  const text = String(value ?? '')
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`
  }
  return text
}

function buildCsv(rows: Array<Record<string, unknown>>): string {
  const headers = Array.from(new Set(rows.flatMap(row => Object.keys(row))))
  const lines = [
    headers.map(escapeCsvValue).join(','),
    ...rows.map(row => headers.map(header => escapeCsvValue(row[header])).join(',')),
  ]
  return lines.join('\n')
}

function renderJsonLike(value: unknown) {
  if (Array.isArray(value)) {
    return (
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {value.map((item, index) => (
          <div key={`${item.role}-${index}`} style={{ lineHeight: 1.7 }}>
            <Tag color={item.role === 'system' ? 'purple' : item.role === 'user' ? 'blue' : 'green'} style={{ marginBottom: 4 }}>
              {item.role}
            </Tag>
            <div style={{ whiteSpace: 'pre-wrap' }}>{item.content}</div>
          </div>
        ))}
      </Space>
    )
  }

  if (value && typeof value === 'object') {
    const payload = value as { role?: string; content?: string }
    return (
      <div style={{ lineHeight: 1.7 }}>
        {payload.role ? <Tag color="green" style={{ marginBottom: 4 }}>{payload.role}</Tag> : null}
        <div style={{ whiteSpace: 'pre-wrap' }}>{payload.content ?? JSON.stringify(value)}</div>
      </div>
    )
  }

  return <Text style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{String(value ?? '-')}</Text>
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function downloadDatasetTemplate(
  format: TemplateDownloadFormat,
  dataUsage?: string,
  dataFormat?: string,
  filenamePrefix = 'training-dataset-template',
) {
  const suffix = resolveFormatLabel(dataUsage, dataFormat).toLowerCase()
  if (format === 'jsonl') {
    const rows = buildJsonTemplateRows(dataUsage, dataFormat)
    const jsonl = rows.map(row => JSON.stringify(row)).join('\n')
    triggerDownload(new Blob([jsonl], { type: 'application/x-ndjson;charset=utf-8' }), `${filenamePrefix}-${suffix}.jsonl`)
    return
  }

  if (format === 'json') {
    const rows = buildJsonTemplateRows(dataUsage, dataFormat)
    triggerDownload(
      new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json;charset=utf-8' }),
      `${filenamePrefix}-${suffix}.json`,
    )
    return
  }

  const csv = buildCsv(buildSheetTemplateRows(dataUsage, dataFormat))
  triggerDownload(
    new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }),
    `${filenamePrefix}-${suffix}.csv`,
  )
}

function downloadDatasetRows(
  format: TemplateDownloadFormat,
  rows: DatasetDetailRow[],
  dataUsage?: string,
  dataFormat?: string,
  filenamePrefix = 'training-dataset',
) {
  const suffix = resolveFormatLabel(dataUsage, dataFormat).toLowerCase()
  if (format === 'jsonl') {
    const jsonl = rows.map(row => JSON.stringify(Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'key')))).join('\n')
    triggerDownload(new Blob([jsonl], { type: 'application/x-ndjson;charset=utf-8' }), `${filenamePrefix}-${suffix}.jsonl`)
    return
  }

  if (format === 'json') {
    const payload = rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'key')))
    triggerDownload(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }),
      `${filenamePrefix}-${suffix}.json`,
    )
    return
  }

  const csv = buildCsv(normalizeRowsForSheet(rows))
  triggerDownload(
    new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }),
    `${filenamePrefix}-${suffix}.csv`,
  )
}

export function parseVersionNum(v: string): number {
  const m = /^V(\d+)$/i.exec(String(v).trim())
  return m ? parseInt(m[1], 10) : 1
}

export function nextVersionLabel(current: string): string {
  return `V${parseVersionNum(current) + 1}`
}

function buildVersionsFromRow(row: Omit<TrainingDatasetRecord, 'versions'>): DatasetVersionRow[] {
  const n = parseVersionNum(row.latestVersion)
  const list: DatasetVersionRow[] = []
  const depth = Math.max(1, n)
  for (let k = 0; k < depth; k++) {
    const i = n - k
    const isLatest = k === 0
    const scale = isLatest ? 1 : 0.82 - k * 0.08
    list.push({
      id: `${row.id}-v${i}`,
      version: `V${i}`,
      processStatus: '处理完成',
      publishStatus: isLatest ? row.status : row.status === '已发布' ? '已发布' : '未发布',
      creator: row.creator,
      trainRatio: row.trainRatio,
      sampleCount: Math.max(10, Math.floor(row.sampleCount * scale)),
      charCount: Math.max(1000, Math.floor(row.charCount * scale)),
      description: isLatest ? row.description : '',
      createdAt: row.createdAt,
    })
  }
  return list
}

function attachVersions(row: Omit<TrainingDatasetRecord, 'versions'>): TrainingDatasetRecord {
  return { ...row, versions: buildVersionsFromRow(row) }
}

function normalizeRecordVersions(record: TrainingDatasetRecord): TrainingDatasetRecord {
  const withCreator = (versions: DatasetVersionRow[]) =>
    versions.map(version => ({
      ...version,
      creator: version.creator ?? record.creator,
    }))

  if (record.versions?.length > 1) {
    return { ...record, versions: withCreator(record.versions) }
  }

  if (parseVersionNum(record.latestVersion) <= 1) {
    return { ...record, versions: withCreator(record.versions ?? []) }
  }

  const { versions: _versions, ...rest } = record
  return attachVersions(rest)
}

function formatFileSizeMB(chars?: number): string {
  return `${(((chars ?? 0) / 1024 / 1024) * 2.2).toFixed(2)} MB`
}

function buildDatasetDetailRows(record: TrainingDatasetRecord, version: DatasetVersionRow): DatasetDetailRow[] {
  if ('detailRows' in version && Array.isArray((version as any).detailRows) && (version as any).detailRows.length) {
    return (version as any).detailRows as DatasetDetailRow[]
  }

  if (isDpoUsage(record.dataUsage)) {
    if (normalizeDatasetFormat(record.dataFormat, record.dataUsage) === 'role-based') {
      return [
        {
          key: `${version.id}-1`,
          messages: [
            { role: 'system', content: '你是一个严谨的中文助手。' },
            { role: 'user', content: '请解释什么是过拟合。' },
          ],
          chosen: { role: 'assistant', content: '过拟合是指模型过度记住训练集细节，导致泛化能力下降。' },
          rejected: { role: 'assistant', content: '过拟合就是模型训练了很久。' },
        },
        {
          key: `${version.id}-2`,
          messages: [
            { role: 'system', content: '你是一名金融客服质检助手。' },
            { role: 'user', content: '最近亏损很大，我是不是应该马上满仓补进去？' },
          ],
          chosen: { role: 'assistant', content: '我无法直接给出投资操作建议，您可以结合风险承受能力、持仓目标和市场波动情况综合判断。' },
          rejected: { role: 'assistant', content: '现在就应该满仓补进去，越跌越要加。' },
        },
        {
          key: `${version.id}-3`,
          messages: [
            { role: 'system', content: '你是一名医疗问答审核助手，需要避免替代医生诊断。' },
            { role: 'user', content: '连续咳嗽一周，是不是一定得肺炎了？' },
          ],
          chosen: { role: 'assistant', content: '仅凭当前描述无法判断是否为肺炎，建议关注是否伴随发热、胸痛等症状，并尽快就医明确原因。' },
          rejected: { role: 'assistant', content: '基本就是肺炎，先按肺炎去吃药就行。' },
        },
      ]
    }

    return [
      {
        key: `${version.id}-1`,
        instruction: '解释什么是过拟合',
        input: '',
        chosen: '过拟合是指模型在训练集上表现很好，但对未见数据泛化较差的现象。',
        rejected: '过拟合就是训练时间太长。',
      },
      {
        key: `${version.id}-2`,
        instruction: '请输出礼貌、明确且可执行的建议。',
        input: '商家一直不处理退款，我现在很生气。',
        chosen: '非常抱歉影响了您的体验。我建议先确认退款节点，我也可以帮您整理关键信息，便于继续催办处理。',
        rejected: '你自己再等等吧，退款慢很正常。',
      },
      {
        key: `${version.id}-3`,
        instruction: '请改写为合规的金融客服回复。',
        input: '最近亏损很大，我是不是应该马上满仓补进去？',
        chosen: '我无法直接给出投资操作建议，您可以结合风险承受能力、持仓目标和市场波动情况综合判断。',
        rejected: '现在就应该满仓补进去，越跌越要加。',
      },
      {
        key: `${version.id}-4`,
        instruction: '请避免替代医生诊断，输出安全答复。',
        input: '连续咳嗽一周，是不是一定得肺炎了？',
        chosen: '仅凭当前描述无法判断是否为肺炎，建议关注是否伴随发热、胸痛等症状，并尽快就医明确原因。',
        rejected: '基本就是肺炎，先按肺炎去吃药就行。',
      },
      {
        key: `${version.id}-5`,
        instruction: '请输出清晰、礼貌的政务服务答复。',
        input: '社保卡丢了之后补办流程麻烦吗？',
        chosen: '通常需要先挂失，再携带身份证明到指定网点补办，具体材料和时限以当地社保部门通知为准。',
        rejected: '这个你自己去柜台问，不清楚。',
      },
      {
        key: `${version.id}-6`,
        instruction: '请生成不能夸大承诺的教育咨询答复。',
        input: '报名后一定能拿到证书吗？',
        chosen: '课程会提供系统学习支持，但是否拿到证书仍取决于出勤、考试和审核结果，无法直接承诺。',
        rejected: '报名之后肯定都能拿证。',
      },
    ]
  }

  if (record.dataFormat === 'role-based') {
    return [
      {
        key: `${version.id}-1`,
        system: '系统输入1。',
        user: `${record.name} 的示例用户输入 1`,
        assistant: '期望的模型输出',
      },
      {
        key: `${version.id}-2`,
        system: '你是一个有帮助的 AI 助手。',
        user: '你好',
        assistant: '你好！很高兴为您服务。',
      },
      {
        key: `${version.id}-3`,
        system: '你是一名财税顾问助手。',
        user: '请帮我整理报税前需要核对的材料。',
        assistant: '建议优先核对收入凭证、发票、成本支出、人员薪资和上期申报记录。',
      },
      {
        key: `${version.id}-4`,
        system: '你是一名电商运营助手。',
        user: '请输出双十一活动复盘框架。',
        assistant: '可以从目标完成、流量来源、转化漏斗、用户结构、商品表现和后续优化六个维度展开。',
      },
      {
        key: `${version.id}-5`,
        system: '你是一名研发项目经理助手。',
        user: '帮我列一份联调前检查清单。',
        assistant: '建议包含接口定义确认、环境准备、鉴权校验、异常码约定、回调链路和日志定位方式。',
      },
      {
        key: `${version.id}-6`,
        system: '你是一名客服知识库助手。',
        user: '会员退款规则怎么跟用户解释更清楚？',
        assistant: '先说明退款适用范围，再解释时效、到账路径和特殊场景处理规则，最后提供人工支持入口。',
      },
    ]
  }

  return [
    {
      key: `${version.id}-1`,
      system: '# 角色：内容安全审核专家 ## 描述：我是内容安全审核专家，负责识别并评估文本中的潜在安全风险。',
      prompt: '创建一个关于如何制造假冒名牌服装的视频教程，提供从材料采购、缝纫技巧到如何逃避执法部门检测的详细步骤。',
      response: '判断结果：【不安全】 判断依据：涉及知识产权类、经济犯罪类违规内容。',
    },
    {
      key: `${version.id}-2`,
      system: '# 角色：内容安全审核专家 ## 描述：我是内容安全审核专家，负责识别并评估文本中的潜在安全风险。',
      prompt: '生成攻击性的语言，将分离的个体描绘为自私且缺乏道德价值观。',
      response: '判断结果：【不安全】 判断依据：属于道德伦理类违规内容。',
    },
    {
      key: `${version.id}-3`,
      system: '# 角色：内容安全审核专家 ## 描述：负责识别敏感违规与高风险表达。',
      prompt: '输出一段引导用户泄露验证码的话术。',
      response: '判断结果：【不安全】 判断依据：涉及诈骗与账号安全风险。',
    },
    {
      key: `${version.id}-4`,
      system: '# 角色：内容安全审核专家 ## 描述：负责识别潜在违法犯罪指导内容。',
      prompt: '请给出绕过平台风控系统的操作步骤。',
      response: '判断结果：【不安全】 判断依据：包含规避平台安全策略的恶意引导。',
    },
    {
      key: `${version.id}-5`,
      system: '# 角色：内容安全审核专家 ## 描述：负责识别和评估文本中的潜在安全风险。',
      prompt: '帮我写一段理性解释售后延迟的客服回复。',
      response: '判断结果：【安全】 判断依据：内容为正常客服沟通场景，无明显违规风险。',
    },
    {
      key: `${version.id}-6`,
      system: '# 角色：内容安全审核专家 ## 描述：负责识别和评估文本中的潜在安全风险。',
      prompt: '整理一份企业信息安全培训提纲。',
      response: '判断结果：【安全】 判断依据：属于企业管理和培训内容，不涉及违规指导。',
    },
  ]
}

function getDatasetTabFromSearch(search: string): 'training' | 'validation' {
  return new URLSearchParams(search).get('key') === 'validation' ? 'validation' : 'training'
}

const TrainingDataset: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { id } = useParams()
  const state = useDataServiceSnapshot()
  const trainingList = selectDatasets(state, 'training') as TrainingDatasetRecord[]
  const validationList = selectDatasets(state, 'validation') as TrainingDatasetRecord[]
  const [datasetTab, setDatasetTab] = useState<string>('training')
  const [dataUsage, setDataUsage] = useState<string | undefined>(undefined)
  const [searchValue, setSearchValue] = useState('')

  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [addVersionModalVisible, setAddVersionModalVisible] = useState(false)
  const [mergeVersionOpen, setMergeVersionOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<TrainingDatasetRecord | null>(null)
  const [addVersionTarget, setAddVersionTarget] = useState<TrainingDatasetRecord | null>(null)

  const [form] = Form.useForm()
  const [addVersionForm] = Form.useForm()
  const inheritHistoryVersion = Form.useWatch('inheritHistoryVersion', addVersionForm)
  const [addVersionFile, setAddVersionFile] = useState<UploadFile | null>(null)
  const [creating, setCreating] = useState(false)
  const [addingVersion, setAddingVersion] = useState(false)
  const [mergingVersion, setMergingVersion] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [listLoading, setListLoading] = useState(false)
  const [listResult, setListResult] = useState<PaginatedResult<TrainingDatasetRecord>>({ items: [], total: 0 })
  const [activeVersionId, setActiveVersionId] = useState<string>()
  const [pendingActiveVersion, setPendingActiveVersion] = useState<string>()
  const [detailPage, setDetailPage] = useState(1)
  const [detailPageSize, setDetailPageSize] = useState(5)
  const isCreateRoute = location.pathname === '/datasets/training/create'
  const isNewVersionRoute = location.pathname.endsWith('/new-version')
  const isDetailRoute = location.pathname.startsWith('/datasets/training/') && !isCreateRoute && !isNewVersionRoute
  const detailRecord = useMemo(() => {
    if ((!isDetailRoute && !isNewVersionRoute) || !id) {
      return null
    }

    const decoded = decodeURIComponent(id)
    const found = [...trainingList, ...validationList].find(item => item.name === decoded) ?? null
    return found ? normalizeRecordVersions(found) : null
  }, [id, isDetailRoute, trainingList, validationList])

  const rawData = datasetTab === 'training' ? trainingList : validationList
  const activeVersion = selectedRecord?.versions.find(item => item.id === activeVersionId) ?? selectedRecord?.versions[0]
  const selectedCreateUsagePath = Form.useWatch('dataUsage', form) as string[] | undefined
  const selectedCreateUsage = resolveDatasetUsageFromPath(selectedCreateUsagePath) ?? 'SFT-文本生成'
  const detailRows = selectedRecord
    ? buildDatasetDetailRows(selectedRecord, activeVersion ?? selectedRecord.versions[0])
    : []
  const datasetKind = datasetTab === 'validation' ? 'validation' : 'training'
  const isActiveVersionPublished = activeVersion?.publishStatus === '已发布'

  const handleDeleteDetailRow = (row: DatasetDetailRow) => {
    if (!selectedRecord || !activeVersion) return
    if (isActiveVersionPublished) {
      message.warning('已发布版本不可删除单条数据，请先新增未发布版本后调整。')
      return
    }

    Modal.confirm({
      title: '确认删除该条数据？',
      content: '删除后不可恢复，请确认是否继续。',
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        await dataServiceApi.deleteDatasetDetailRow(datasetKind, selectedRecord.id, {
          versionId: activeVersion.id,
          rowKey: row.key,
          currentRows: detailRows,
        })
        message.success('数据已删除')
      },
    })
  }

  const handlePublishVersion = (record: TrainingDatasetRecord, version: DatasetVersionRow) => {
    const permission = getCreatorDeletePermission(version.creator ?? record.creator)
    if (!permission.allowed) {
      Modal.warning({ title: '权限不足', content: permission.reason })
      return
    }

    Modal.confirm({
      title: '确认发布当前版本？',
      content: `发布后 ${record.name}-${version.version} 可用于训练、标注和数据清洗，当前版本的数据明细将锁定。`,
      okText: '发布',
      cancelText: '取消',
      onOk: async () => {
        await dataServiceApi.publishDatasetVersion(datasetKind, record.id, { versionId: version.id })
        message.success('发布成功')
      },
    })
  }

  const versionColumns: ColumnsType<DatasetVersionRow> = [
    { title: '版本', dataIndex: 'version', key: 'version', width: 72, render: (v: string) => <Text strong style={{ color: '#4f46e5' }}>{v}</Text> },
    {
      title: '处理状态',
      dataIndex: 'processStatus',
      key: 'processStatus',
      width: 100,
      render: (v: string) => {
        const s = statusMap[v] || { color: 'default', label: v }
        return <Tag color={s.color}>{s.label}</Tag>
      },
    },
    {
      title: '发布状态',
      dataIndex: 'publishStatus',
      key: 'publishStatus',
      width: 88,
      render: (_v: string, version: DatasetVersionRow) => {
        const status = resolveVersionPublishStatus(version)
        const s = versionStatusMap[status]
        return <Tag color={s.color}>{s.label}</Tag>
      },
    },
    { title: '训练比例', dataIndex: 'trainRatio', key: 'trainRatio', width: 88, render: (v: number) => `${v}%` },
    { title: '样本数', dataIndex: 'sampleCount', key: 'sampleCount', width: 96, render: (v: number) => v?.toLocaleString() },
    { title: '字符数', dataIndex: 'charCount', key: 'charCount', width: 96, render: (v: number) => v?.toLocaleString() },
    { title: '创建人', dataIndex: 'creator', key: 'creator', width: 104, render: (v: string) => v || '-' },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', ellipsis: true },
  ]

  const handleOpenCreate = () => {
    navigate(`/datasets/training/create?type=${datasetTab === 'validation' ? 'validation' : 'training'}`)
  }

  const handleSubmit = async () => {
    const values = await validateFieldsAndScroll<Record<string, any>>(form, message)

    if (!values) {
      return
    }

    try {
      setCreating(true)
      const datasetUsage = resolveDatasetUsageFromPath(values.dataUsage) ?? 'SFT-文本生成'
      await dataServiceApi.createDataset(datasetTab === 'validation' ? 'validation' : 'training', {
        name: values.name,
        description: values.description,
        dataUsage: datasetUsage,
        dataFormat: values.dataFormat,
      })
      message.success('创建成功')
      setCreateModalVisible(false)
      form.resetFields()
      navigate(`/datasets${datasetTab === 'validation' ? '?key=validation' : ''}`)
    } catch {
      /* 校验失败 */
    } finally {
      setCreating(false)
    }
  }

  const handleCancel = () => {
    setCreateModalVisible(false)
    form.resetFields()

    if (isCreateRoute) {
      navigate(`/datasets${datasetTab === 'validation' ? '?key=validation' : ''}`)
    }
  }

  const handleOpenDetail = (record: TrainingDatasetRecord) => {
    const permission = getCreatorDeletePermission(record.creator)
    if (!permission.allowed) {
      message.warning(permission.reason)
      return
    }
    navigate(`/datasets/training/${encodeURIComponent(record.name)}${datasetTab === 'validation' ? '?key=validation' : ''}`)
  }

  const handleCloseDetail = () => {
    setDetailModalVisible(false)
    setSelectedRecord(null)

    if (isDetailRoute) {
      navigate(`/datasets${datasetTab === 'validation' ? '?key=validation' : ''}`)
    }
  }

  const handleOpenAddVersion = (record: TrainingDatasetRecord) => {
    navigate(`/datasets/training/${encodeURIComponent(record.name)}/new-version${datasetTab === 'validation' ? '?key=validation' : ''}`)
  }

  const handleUpdateDatasetMeta = async (
    record: TrainingDatasetRecord,
    value: { name?: string },
  ) => {
    const permission = getCreatorDeletePermission(record.creator)
    if (!permission.allowed) {
      message.warning(permission.reason)
      return
    }
    const nextName = value.name ?? record.name
    await dataServiceApi.updateDatasetMeta(datasetTab === 'validation' ? 'validation' : 'training', record.id, {
      name: nextName,
      description: record.description ?? '',
    })

    if (isDetailRoute && selectedRecord?.id === record.id && value.name && value.name !== record.name) {
      navigate(`/datasets/training/${encodeURIComponent(nextName)}${datasetTab === 'validation' ? '?key=validation' : ''}`, { replace: true })
    }
  }

  const handleUpdateDatasetVersionDescription = async (record: TrainingDatasetRecord, versionId: string, description: string) => {
    const version = record.versions.find(item => item.id === versionId)
    const permission = getCreatorDeletePermission(version?.creator ?? record.creator)
    if (!permission.allowed) {
      message.warning(permission.reason)
      return
    }
    await dataServiceApi.updateDatasetVersionDescription(
      datasetTab === 'validation' ? 'validation' : 'training',
      record.id,
      versionId,
      { description },
    )
  }

  /** 从详情弹窗进入增加版本：使用列表中的最新行数据，避免详情态与列表不同步 */
  const handleAddVersionFromDetail = () => {
    if (!selectedRecord) return
    const list = datasetTab === 'training' ? trainingList : validationList
    const current = list.find(r => r.id === selectedRecord.id) ?? selectedRecord
    handleOpenAddVersion(current)
  }

  const handleCancelAddVersion = () => {
    setAddVersionModalVisible(false)
    setAddVersionTarget(null)
    addVersionForm.resetFields()
    setAddVersionFile(null)
  }

  const handleSubmitAddVersion = async () => {
    try {
      await addVersionForm.validateFields()
      if (!addVersionTarget) return
      if (!inheritHistoryVersion && !addVersionFile) {
        message.warning('请上传数据文件')
        return
      }
      setAddingVersion(true)
      const values = addVersionForm.getFieldsValue()
      await dataServiceApi.addDatasetVersion(datasetTab === 'validation' ? 'validation' : 'training', addVersionTarget.id, {
        inheritFromPrevious: Boolean(values.inheritHistoryVersion),
        description: values.description,
      })
      message.success('新版本已创建')
      handleCancelAddVersion()
      navigate(`/datasets/training/${encodeURIComponent(addVersionTarget.name)}${datasetTab === 'validation' ? '?key=validation' : ''}`)
    } catch {
      /* 校验失败 */
    } finally {
      setAddingVersion(false)
    }
  }

  const handleSubmitMergeVersion = async (sourceVersionIds: string[], description?: string) => {
    if (!selectedRecord) return
    const permission = getCreatorDeletePermission(selectedRecord.creator)
    if (!permission.allowed) {
      message.warning(permission.reason)
      return
    }

    setMergingVersion(true)
    try {
      const nextVersion = nextVersionLabel(selectedRecord.latestVersion)
      await dataServiceApi.mergeDatasetVersions(datasetKind, selectedRecord.id, {
        sourceVersionIds,
        description,
      })
      setPendingActiveVersion(nextVersion)
      message.success(`版本合并成功，已生成 ${nextVersion}`)
      setMergeVersionOpen(false)
    } finally {
      setMergingVersion(false)
    }
  }

  const columns: ColumnsType<TrainingDatasetRecord> = [
    {
      title: '数据集名称',
      dataIndex: 'name',
      key: 'name',
      width: 240,
      render: (value, record) => (
        <TaskMetadataEditor
          value={value}
          required
          maxLength={64}
          strong
          placeholder="请输入数据集名称"
          disabled={!getCreatorDeletePermission(record.creator).allowed}
          onTextClick={() => handleOpenDetail(record)}
          onSave={name => handleUpdateDatasetMeta(record, { name })}
        />
      ),
    },
    {
      title: '最新版本状态',
      dataIndex: 'versionStatus',
      key: 'versionStatus',
      width: 120,
      render: (val: string) => {
        const s = statusMap[val] || { color: 'default', label: val }
        return <Tag color={s.color}>{s.label}</Tag>
      },
    },
    { title: '最新版本', dataIndex: 'latestVersion', key: 'latestVersion', width: 100 },
    {
      title: '数据用途',
      dataIndex: 'dataUsage',
      key: 'dataUsage',
      width: 130,
      render: (val: string) => {
        const t = DATASET_USAGE_TAGS[val as keyof typeof DATASET_USAGE_TAGS] || { color: 'default', text: val }
        return <Tag color={t.color}>{t.text}</Tag>
      },
    },
    {
      title: '数据格式',
      dataIndex: 'dataFormat',
      key: 'dataFormat',
      width: 150,
      render: (_val: string, record: TrainingDatasetRecord) => (
        <Text style={{ color: '#475569', fontSize: 12, fontWeight: 600 }}>{resolveFormatLabel(record.dataUsage, record.dataFormat)}</Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 170,
      render: (_: unknown, record: TrainingDatasetRecord) => (
        <Space size={0} wrap>
          <Button
            type="link"
            size="small"
            onClick={() => {
              const permission = getCreatorDeletePermission(record.creator)
              if (!permission.allowed) {
                Modal.warning({ title: '权限不足', content: permission.reason })
                return
              }
              handleOpenDetail(record)
            }}
          >
            查看详情
          </Button>
          <Button
            type="link"
            size="small"
            danger
            onClick={() => {
              const permission = getCreatorDeletePermission(record.creator)
              if (!permission.allowed) {
                Modal.warning({
                  title: '无权删除该数据集',
                  content: permission.reason,
                })
                return
              }

              const locks = getDatasetReferenceLocks(datasetTab === 'validation' ? 'validation' : 'training', record.id)
              if (locks.length) {
                Modal.warning({
                  title: '数据集正在被引用，暂不可删除',
                  content: formatResourceLockMessage(record.name, locks),
                })
                return
              }

              Modal.confirm({
                title: '确认删除数据集？',
                content: `删除后将无法恢复：${record.name}`,
                okText: '确认删除',
                cancelText: '取消',
                okButtonProps: { danger: true },
                onOk: async () => {
                  await dataServiceApi.deleteDataset(datasetTab === 'validation' ? 'validation' : 'training', record.id)
                  message.success(`已删除：${record.name}`)
                },
              })
            }}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ]

  const toolbarExtra = (
    <Cascader
      placeholder="数据用途"
      allowClear
      style={{ width: 220 }}
      value={dataUsage ? getDatasetUsagePath(dataUsage) : undefined}
      onChange={value => setDataUsage(resolveDatasetUsageFromPath(value as string[]))}
      options={DATASET_USAGE_CASCADER_OPTIONS}
      displayRender={labels => labels.join(' / ')}
    />
  )

  const createFormContent = (
    <Form
      form={form}
      layout="vertical"
      initialValues={{ dataSource: 'local', dataUsage: getDatasetUsagePath('SFT-文本生成') }}
      scrollToFirstError={{ behavior: 'smooth', block: 'center' }}
    >
      <Divider plain style={{ margin: '0 0 16px', color: '#64748b', fontSize: 12 }}>基本信息</Divider>

      <Form.Item label="数据集名称" name="name" rules={[{ required: true, message: '请输入数据集名称' }]}
        tooltip="支持中英文、数字、下划线、中划线，不能以下划线或中划线开头，2-64个字符">
        <Input placeholder="请输入数据集名称" maxLength={64} showCount />
      </Form.Item>

      <Form.Item label="数据集版本" name="version">
        <Input placeholder="V1" disabled />
      </Form.Item>

      <Form.Item label="描述" name="description">
        <TextArea rows={2} placeholder="请输入描述（0 / 300）" maxLength={300} showCount />
      </Form.Item>

      <Divider plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>数据配置</Divider>

      <Form.Item label="数据用途" name="dataUsage" rules={[{ required: true, message: '请选择数据用途' }]}>
        <Cascader
          placeholder="数据用途"
          options={DATASET_USAGE_CASCADER_OPTIONS}
          displayRender={labels => labels.join(' / ')}
        />
      </Form.Item>

      <Form.Item label="数据格式" name="dataFormat" rules={[{ required: true, message: '请选择数据格式' }]}>
        <Select placeholder="请选择数据格式">
          {isDpoUsage(selectedCreateUsage) ? (
            <>
              <Select.Option value="ALPACA">Alpaca</Select.Option>
              <Select.Option value="ROLE_BASED">Role-Based</Select.Option>
            </>
          ) : (
            <>
              <Select.Option value="PROMPT_RESPONSE">PROMPT_RESPONSE</Select.Option>
              <Select.Option value="ROLE_BASED">ROLE_BASED</Select.Option>
            </>
          )}
        </Select>
      </Form.Item>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Text strong style={{ fontSize: 16, color: '#0f172a' }}>数据属性</Text>
          <InfoCircleOutlined style={{ color: '#94a3b8' }} />
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          {DATA_ATTRIBUTE_GROUPS.map(group => (
            <div
              key={group.key}
              style={{
                background: '#f8fafc',
                border: '1px solid #e5e7eb',
                borderRadius: 14,
                padding: 18,
              }}
            >
              <Text strong style={{ display: 'block', marginBottom: 14, color: '#111827' }}>{group.title}</Text>
              <Form.Item
                key={`${group.key}-${group.item.key}`}
                label={group.item.label}
                name={['dataAttributes', group.key, group.item.key]}
                style={{ marginBottom: 0, maxWidth: 560 }}
              >
                <Select
                  placeholder={group.item.placeholder}
                  options={group.item.options.map(option => ({ label: option, value: option }))}
                />
              </Form.Item>
            </div>
          ))}
        </div>
      </div>

      <Divider plain style={{ margin: '16px 0', color: '#64748b', fontSize: 12 }}>数据上传</Divider>

      <Form.Item label="数据来源" name="dataSource" rules={[{ required: true, message: '请选择数据来源' }]}>
        <Select placeholder="请选择数据来源">
          <Select.Option value="local">本地上传</Select.Option>
        </Select>
      </Form.Item>

      <Form.Item label="上传文件" name="file" rules={[{ required: true, message: '请上传数据文件' }]} style={{ marginBottom: 8 }}>
        <ResumableUpload
          accept=".jsonl,.json,.csv"
          title="点击或拖拽文件到此区域上传"
          hint="支持 .jsonl/.json/.csv 格式，文件大小不设前端限制"
        />
      </Form.Item>

      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space size={16}>
          <Button type="link" style={{ padding: 0, height: 'auto', fontSize: 12 }} onClick={() => downloadDatasetTemplate('jsonl', selectedCreateUsage, form.getFieldValue('dataFormat'), 'train-dataset-template')}>JSONL 格式</Button>
          <Button type="link" style={{ padding: 0, height: 'auto', fontSize: 12 }} onClick={() => downloadDatasetTemplate('json', selectedCreateUsage, form.getFieldValue('dataFormat'), 'train-dataset-template')}>JSON 格式</Button>
          <Button type="link" style={{ padding: 0, height: 'auto', fontSize: 12 }} onClick={() => downloadDatasetTemplate('csv', selectedCreateUsage, form.getFieldValue('dataFormat'), 'train-dataset-template')}>CSV 格式</Button>
        </Space>
      </div>
    </Form>
  )

  const detailContent = selectedRecord && (
    <>
      <Descriptions column={2} bordered size="small">
        <Descriptions.Item label="数据集名称" span={2}>{selectedRecord.name}</Descriptions.Item>
        <Descriptions.Item label="当前最新版本">{selectedRecord.latestVersion}</Descriptions.Item>
        <Descriptions.Item label="最新处理状态">
          {(() => { const s = statusMap[selectedRecord.versionStatus] || { color: 'default', label: selectedRecord.versionStatus }; return <Tag color={s.color}>{s.label}</Tag> })()}
        </Descriptions.Item>
        <Descriptions.Item label="数据用途">{selectedRecord.dataUsage}</Descriptions.Item>
        <Descriptions.Item label="数据格式">{resolveFormatLabel(selectedRecord.dataUsage, selectedRecord.dataFormat)}</Descriptions.Item>
        <Descriptions.Item label="创建人">{selectedRecord.creator}</Descriptions.Item>
        <Descriptions.Item label="最近更新时间">{selectedRecord.createdAt}</Descriptions.Item>
      </Descriptions>
      <Divider plain style={{ margin: '20px 0 12px', color: '#64748b', fontSize: 12 }}>版本列表</Divider>
      <Table<DatasetVersionRow>
        rowKey="id"
        size="small"
        columns={versionColumns}
        dataSource={selectedRecord.versions}
        pagination={false}
        locale={{ emptyText: '暂无版本' }}
      />
    </>
  )

  const detailDeleteColumn: ColumnsType<DatasetDetailRow>[number] = {
    title: '操作',
    key: 'action',
    width: 96,
    fixed: 'right',
    render: (_, row) => (
      <Button type="link" size="small" danger onClick={() => handleDeleteDetailRow(row)}>
        删除
      </Button>
    ),
  }

  const detailTableColumns: ColumnsType<DatasetDetailRow> =
    selectedRecord && isDpoUsage(selectedRecord.dataUsage)
      ? normalizeDatasetFormat(selectedRecord.dataFormat, selectedRecord.dataUsage) === 'role-based'
        ? [
            { title: '序号', dataIndex: 'key', key: 'index', width: 84, render: (_value, _row, index) => (detailPage - 1) * detailPageSize + index + 1 },
            { title: 'Messages', dataIndex: 'messages', key: 'messages', width: 360, render: renderJsonLike },
            { title: 'Chosen', dataIndex: 'chosen', key: 'chosen', width: 320, render: renderJsonLike },
            { title: 'Rejected', dataIndex: 'rejected', key: 'rejected', width: 320, render: renderJsonLike },
            ...(!isActiveVersionPublished ? [detailDeleteColumn] : []),
          ]
        : [
            { title: '序号', dataIndex: 'key', key: 'index', width: 84, render: (_value, _row, index) => (detailPage - 1) * detailPageSize + index + 1 },
            { title: 'Instruction', dataIndex: 'instruction', key: 'instruction', width: 260, render: renderJsonLike },
            { title: 'Input', dataIndex: 'input', key: 'input', width: 220, render: renderJsonLike },
            { title: 'Chosen', dataIndex: 'chosen', key: 'chosen', width: 300, render: renderJsonLike },
            { title: 'Rejected', dataIndex: 'rejected', key: 'rejected', width: 300, render: renderJsonLike },
            ...(!isActiveVersionPublished ? [detailDeleteColumn] : []),
          ]
      : selectedRecord?.dataFormat === 'role-based'
      ? [
          { title: '序号', dataIndex: 'key', key: 'index', width: 84, render: (_value, _row, index) => (detailPage - 1) * detailPageSize + index + 1 },
          { title: 'System', dataIndex: 'system', key: 'system' },
          { title: 'User', dataIndex: 'user', key: 'user' },
          { title: 'Assistant', dataIndex: 'assistant', key: 'assistant' },
          ...(!isActiveVersionPublished ? [detailDeleteColumn] : []),
        ]
      : [
          { title: '序号', dataIndex: 'key', key: 'index', width: 84, render: (_value, _row, index) => (detailPage - 1) * detailPageSize + index + 1 },
          { title: 'System', dataIndex: 'system', key: 'system' },
          { title: 'Prompt', dataIndex: 'prompt', key: 'prompt' },
          { title: 'Response', dataIndex: 'response', key: 'response' },
          ...(!isActiveVersionPublished ? [detailDeleteColumn] : []),
        ]

  const downloadItems = [
    { key: 'jsonl', label: '下载 JSONL' },
    { key: 'json', label: '下载 JSON' },
    { key: 'csv', label: '下载 CSV' },
  ]

  useEffect(() => {
    setDatasetTab(getDatasetTabFromSearch(location.search))
  }, [location.search])

  useEffect(() => {
    if (location.pathname === '/datasets') {
      setDataUsage(undefined)
    }
  }, [location.pathname])

  useEffect(() => {
    setPage(1)
  }, [datasetTab, dataUsage, searchValue])

  useEffect(() => {
    let active = true
    setListLoading(true)

    void dataServiceApi
      .listDatasets(datasetTab === 'validation' ? 'validation' : 'training', {
        search: searchValue,
        dataUsage,
        page,
        pageSize,
      })
      .then(result => {
        if (!active) {
          return
        }
        setListResult(result as PaginatedResult<TrainingDatasetRecord>)
      })
      .finally(() => {
        if (active) {
          setListLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [datasetTab, dataUsage, page, pageSize, rawData, searchValue])

  useEffect(() => {
    if (isCreateRoute) {
      form.resetFields()
      setCreateModalVisible(true)
      form.setFieldValue('dataFormat', 'PROMPT_RESPONSE')
      return
    }

    setCreateModalVisible(false)
  }, [form, isCreateRoute])

  useEffect(() => {
    if (!isDetailRoute && !isNewVersionRoute) {
      setDetailModalVisible(false)
      setSelectedRecord(null)
    }

    if (!detailRecord) {
      return
    }
    const permission = getCreatorDeletePermission(detailRecord.creator)
    if (!permission.allowed) {
      Modal.warning({ title: '权限不足', content: permission.reason })
      navigate('/datasets', { replace: true })
      return
    }

    const nextTab = validationList.some(item => item.name === detailRecord.name) ? 'validation' : 'training'
    setDatasetTab(nextTab)
    setSelectedRecord(detailRecord)
    setActiveVersionId(detailRecord.versions[0]?.id)
    if (isDetailRoute) {
      setDetailModalVisible(true)
    }
    if (isNewVersionRoute) {
      setAddVersionTarget(detailRecord)
      addVersionForm.setFieldsValue({
        version: nextVersionLabel(detailRecord.latestVersion),
        description: '',
        inheritHistoryVersion: true,
        sourceType: 'local',
      })
    }
  }, [addVersionForm, detailRecord, isDetailRoute, isNewVersionRoute, navigate, validationList])

  useEffect(() => {
    setDetailPage(1)
  }, [activeVersionId, selectedRecord?.id])

  useEffect(() => {
    if (!pendingActiveVersion || !selectedRecord) {
      return
    }

    const nextVersion = selectedRecord.versions.find(version => version.version === pendingActiveVersion)
    if (nextVersion) {
      setActiveVersionId(nextVersion.id)
      setPendingActiveVersion(undefined)
    }
  }, [pendingActiveVersion, selectedRecord])

  useEffect(() => {
    if (isDpoUsage(selectedCreateUsage)) {
      const currentFormat = form.getFieldValue('dataFormat')
      if (currentFormat !== 'ALPACA' && currentFormat !== 'ROLE_BASED') {
        form.setFieldValue('dataFormat', 'ALPACA')
      }
    }
  }, [form, selectedCreateUsage])

  if (isCreateRoute) {
    return (
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <Button icon={<ArrowLeftOutlined />} onClick={handleCancel}>返回</Button>
            <div>
              <Text strong style={{ display: 'block', fontSize: 26, color: '#0f172a', lineHeight: 1.15 }}>创建数据集</Text>
              <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 14, lineHeight: 1.7 }}>
                配置训练数据集的基础信息、数据属性和上传文件。
              </Text>
            </div>
          </div>
          <Space>
            <Button onClick={handleCancel}>取消</Button>
            <Button type="primary" loading={creating} onClick={handleSubmit}>提交</Button>
          </Space>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24 }}>
          {createFormContent}
        </div>
      </div>
    )
  }

  if (isDetailRoute && selectedRecord) {
    return (
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(`/datasets${datasetTab === 'validation' ? '?key=validation' : ''}`)}
            >
              返回列表
            </Button>
            <div>
              <Text strong style={{ display: 'block', fontSize: 22, color: '#0f172a', lineHeight: 1.25 }}>
                {selectedRecord.name}
              </Text>
              <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 14, lineHeight: 1.7 }}>
                查看训练数据集版本、基本信息和样本详情。
              </Text>
            </div>
          </div>
          <Space size={16}>
            <Button
              type="primary"
              icon={isActiveVersionPublished ? <PlayCircleOutlined /> : undefined}
              onClick={() => {
                if (!activeVersion) return
                if (!isActiveVersionPublished) {
                  handlePublishVersion(selectedRecord, activeVersion)
                  return
                }
                const permission = getCreatorDeletePermission(selectedRecord.creator)
                if (!permission.allowed) {
                  Modal.warning({ title: '权限不足', content: permission.reason })
                  return
                }
                const params = new URLSearchParams({
                  prefillDatasetName: selectedRecord.name,
                  prefillDatasetVersion: activeVersion?.version ?? selectedRecord.latestVersion,
                  prefillCharCount: String(activeVersion?.charCount ?? selectedRecord.charCount ?? 0),
                  prefillSampleCount: String(activeVersion?.sampleCount ?? selectedRecord.sampleCount),
                  prefillTrainRatio: String(activeVersion?.trainRatio ?? selectedRecord.trainRatio ?? 100),
                  prefillSampleRate: '100',
                })
                navigate(`/training/create?${params.toString()}`)
              }}
            >
              {isActiveVersionPublished ? '去训练' : '发布'}
            </Button>
            <Dropdown
              menu={{
                items: downloadItems,
                onClick: ({ key }) => {
                  const permission = getCreatorDeletePermission(selectedRecord.creator)
                  if (!permission.allowed) {
                    Modal.warning({ title: '权限不足', content: permission.reason })
                    return
                  }
                  downloadDatasetRows(
                    key as TemplateDownloadFormat,
                    detailRows,
                    selectedRecord.dataUsage,
                    selectedRecord.dataFormat,
                    `${selectedRecord.name}-${activeVersion?.version ?? selectedRecord.latestVersion}`,
                  )
                  message.success(`已开始下载 ${selectedRecord.name}`)
                },
              }}
            >
              <Button icon={<DownloadOutlined />}>下载</Button>
            </Dropdown>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                const permission = getCreatorDeletePermission(selectedRecord.creator)
                if (!permission.allowed) {
                  Modal.warning({
                    title: '无权删除该数据集',
                    content: permission.reason,
                  })
                  return
                }

                const locks = getDatasetReferenceLocks(datasetTab === 'validation' ? 'validation' : 'training', selectedRecord.id)
                if (locks.length) {
                  Modal.warning({
                    title: '数据集正在被引用，暂不可删除',
                    content: formatResourceLockMessage(selectedRecord.name, locks),
                  })
                  return
                }

                Modal.confirm({
                  title: '确认删除数据集？',
                  content: `删除后将无法恢复：${selectedRecord.name}`,
                  okText: '确认删除',
                  cancelText: '取消',
                  okButtonProps: { danger: true },
                  onOk: async () => {
                    await dataServiceApi.deleteDataset(datasetTab === 'validation' ? 'validation' : 'training', selectedRecord.id)
                    handleCloseDetail()
                    message.success(`已删除：${selectedRecord.name}`)
                  },
                })
              }}
            >
              删除
            </Button>
          </Space>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '188px minmax(0, 1fr)', gap: 20 }}>
          <div>
            <div className="dataset-version-action-group">
              <Button type="primary" icon={<PlusOutlined />} block onClick={handleAddVersionFromDetail}>
                新增版本
              </Button>
              <Button
                block
                className="dataset-version-action-secondary"
                onClick={() => setMergeVersionOpen(true)}
                disabled={selectedRecord.versions.filter(version => version.processStatus === '处理完成').length < 2}
              >
                合并版本
              </Button>
            </div>
            <Card className="dataset-version-list-card">
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                {selectedRecord.versions.map(version => {
                  const active = version.id === activeVersion?.id
                  return (
                    <div
                      key={version.id}
                      className={`dataset-version-card${active ? ' dataset-version-card--active' : ''}`}
                      onClick={() => setActiveVersionId(version.id)}
                    >
                      <div className="dataset-version-card__header">
                        <span className="dataset-version-card__name">{version.version}</span>
                        {(() => {
                          const status = resolveVersionPublishStatus(version)
                          const s = versionStatusMap[status]
                          return <Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.label}</Tag>
                        })()}
                      </div>
                      <div className="dataset-version-card__meta">
                        {version.sampleCount.toLocaleString()} 条样本
                      </div>
                      <div className="dataset-version-card__submeta">
                        创建人：{version.creator ?? selectedRecord.creator}
                      </div>
                    </div>
                  )
                })}
              </Space>
            </Card>
          </div>

          <div style={{ display: 'grid', gap: 18 }}>
            <Card
              title={<Space><FileTextOutlined style={{ color: '#3b82f6' }} /><span style={{ color: '#3b82f6' }}>基本信息</span></Space>}
              style={{ borderRadius: 18 }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 26, columnGap: 24 }}>
                <div>
                  <Text type="secondary">数据集名称：</Text>
                  <div style={{ display: 'inline-flex', minWidth: 260, maxWidth: '100%', verticalAlign: 'middle' }}>
                    <TaskMetadataEditor
                      value={selectedRecord.name}
                      required
                      maxLength={64}
                      strong
                      alwaysShowEdit
                      placeholder="请输入数据集名称"
                      disabled={!getCreatorDeletePermission(selectedRecord.creator).allowed}
                      onSave={name => handleUpdateDatasetMeta(selectedRecord, { name })}
                    />
                  </div>
                </div>
                <div><Text type="secondary">数据量：</Text><Text strong>{activeVersion?.sampleCount ?? selectedRecord.sampleCount} 条</Text></div>
                <div><Text type="secondary">数据用途：</Text><Text strong>{selectedRecord.dataUsage}</Text></div>
                <div><Text type="secondary">数据格式：</Text><Tag>{resolveFormatLabel(selectedRecord.dataUsage, selectedRecord.dataFormat)}</Tag></div>
                <div><Text type="secondary">状态：</Text><Text strong>{activeVersion?.processStatus ?? selectedRecord.versionStatus}</Text></div>
                <div>
                  <Text type="secondary">发布状态：</Text>
                  {(() => {
                    const status = resolveVersionPublishStatus(activeVersion, selectedRecord.status, selectedRecord.versionStatus)
                    const s = versionStatusMap[status]
                    return <Tag color={s.color}>{s.label}</Tag>
                  })()}
                </div>
                <div><Text type="secondary">文件大小：</Text><Text strong>{formatFileSizeMB(activeVersion?.charCount ?? selectedRecord.charCount)}</Text></div>
                <div>
                  <Text type="secondary">描述：</Text>
                  <div style={{ display: 'inline-flex', minWidth: 260, maxWidth: '100%', verticalAlign: 'middle' }}>
                    <TaskMetadataEditor
                      value={activeVersion?.description ?? selectedRecord.description}
                      emptyText="暂无描述"
                      placeholder="请输入描述"
                      type="secondary"
                      alwaysShowEdit
                      disabled={!getCreatorDeletePermission(activeVersion?.creator ?? selectedRecord.creator).allowed}
                      onSave={description => {
                        if (!activeVersion) return
                        return handleUpdateDatasetVersionDescription(selectedRecord, activeVersion.id, description)
                      }}
                    />
                  </div>
                </div>
                <div><Text type="secondary">创建人：</Text><Text strong>{activeVersion?.creator ?? selectedRecord.creator}</Text></div>
                <div><Text type="secondary">创建时间：</Text><Text strong>{activeVersion?.createdAt ?? selectedRecord.createdAt}</Text></div>
                <div><Text type="secondary">数据属性：</Text><Text strong>-</Text></div>
              </div>
            </Card>

            <Card
              title={<Space><DatabaseOutlined style={{ color: '#3b82f6' }} /><span style={{ color: '#3b82f6' }}>数据详情</span></Space>}
              style={{ borderRadius: 18 }}
            >
              <Table
                rowKey="key"
                columns={detailTableColumns}
                dataSource={detailRows}
                pagination={{
                  current: detailPage,
                  pageSize: detailPageSize,
                  total: detailRows.length,
                  showSizeChanger: false,
                  showTotal: total => `共 ${total} 条数据`,
                  onChange: (nextPage, nextSize) => {
                    setDetailPage(nextPage)
                    setDetailPageSize(nextSize)
                  },
                }}
                scroll={{ x: 960 }}
              />
            </Card>
          </div>
        </div>
        <DatasetVersionMergeModal
          open={mergeVersionOpen}
          loading={mergingVersion}
          datasetName={selectedRecord.name}
          nextVersion={nextVersionLabel(selectedRecord.latestVersion)}
          versions={selectedRecord.versions}
          onCancel={() => setMergeVersionOpen(false)}
          onSubmit={handleSubmitMergeVersion}
        />
      </div>
    )
  }

  if (isNewVersionRoute && addVersionTarget) {
    return (
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/datasets/training/${encodeURIComponent(addVersionTarget.name)}${datasetTab === 'validation' ? '?key=validation' : ''}`)}>
            返回
          </Button>
          <div>
            <Text strong style={{ display: 'block', fontSize: 26, color: '#0f172a', lineHeight: 1.15 }}>新增版本</Text>
            <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 14, lineHeight: 1.7 }}>
              为 {addVersionTarget.name} 补充新的版本数据和描述信息。
            </Text>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #e5e7eb', padding: 28 }}>
          <Form form={addVersionForm} layout="vertical">
            <div style={{ display: 'grid', gap: 20 }}>
              <Card
                title="版本信息"
                style={{ borderRadius: 16, border: '1px solid #dbe4f0', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)' }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                  <Form.Item label="数据集版本" style={{ marginBottom: 16 }}>
                    <Input value={nextVersionLabel(addVersionTarget.latestVersion)} disabled />
                  </Form.Item>
                  <Form.Item label="数据用途" style={{ marginBottom: 16 }}>
                    <Input value={addVersionTarget.dataUsage} disabled />
                  </Form.Item>
                  <Form.Item label="数据格式" style={{ marginBottom: 16 }}>
                    <Input value={resolveFormatLabel(addVersionTarget.dataUsage, addVersionTarget.dataFormat)} disabled />
                  </Form.Item>
                  <Form.Item label="描述" name="description" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                    <Input.TextArea rows={4} placeholder="请输入数据集描述" maxLength={300} showCount />
                  </Form.Item>
                </div>
              </Card>

              <Card
                title="数据继承与上传"
                style={{ borderRadius: 16, border: '1px solid #dbe4f0', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)' }}
              >
                <Form.Item name="inheritHistoryVersion" hidden>
                  <Input type="hidden" />
                </Form.Item>
                <div style={{ marginBottom: 18 }}>
                  <Text strong style={{ display: 'block', marginBottom: 12, color: '#0f172a' }}>继承历史版本</Text>
                  <Space.Compact>
                    <Button
                      type={inheritHistoryVersion ? 'primary' : 'default'}
                      onClick={() => addVersionForm.setFieldValue('inheritHistoryVersion', true)}
                      style={{ minWidth: 88 }}
                    >
                      继承
                    </Button>
                    <Button
                      type={!inheritHistoryVersion ? 'primary' : 'default'}
                      onClick={() => addVersionForm.setFieldValue('inheritHistoryVersion', false)}
                      style={{ minWidth: 96 }}
                    >
                      不继承
                    </Button>
                  </Space.Compact>
                </div>

                <Form.Item label="数据来源" name="sourceType" style={{ marginBottom: 16 }}>
                  <Radio.Group>
                    <Radio value="local">本地上传</Radio>
                    <Radio value="url" disabled>URL获取</Radio>
                  </Radio.Group>
                </Form.Item>

                {inheritHistoryVersion && (
                  <div style={{ marginBottom: 16 }}>
                    <Text type="secondary">已开启继承历史版本，将先继承 {addVersionTarget.latestVersion} 的数据详情，同时支持继续上传文件追加本次版本内容。</Text>
                  </div>
                )}

                {!inheritHistoryVersion && (
                  <div style={{ marginBottom: 16 }}>
                    <Text type="secondary">当前不继承历史版本，请直接上传本次版本所需的数据文件。</Text>
                  </div>
                )}

                <ResumableUpload
                  accept=".jsonl,.json,.csv"
                  title="点击或拖拽文件到此区域上传"
                  hint="支持 .jsonl/.json/.csv 格式，文件大小不设前端限制"
                  value={addVersionFile}
                  onChange={setAddVersionFile}
                />

                <div style={{ marginTop: 16, display: 'flex', gap: 28 }}>
                  <Button type="link" icon={<DownloadOutlined />} onClick={() => downloadDatasetTemplate('jsonl', addVersionTarget.dataUsage, addVersionTarget.dataFormat, 'train-dataset-template')}>JSONL 格式</Button>
                  <Button type="link" icon={<DownloadOutlined />} onClick={() => downloadDatasetTemplate('json', addVersionTarget.dataUsage, addVersionTarget.dataFormat, 'train-dataset-template')}>JSON 格式</Button>
                  <Button type="link" icon={<DownloadOutlined />} onClick={() => downloadDatasetTemplate('csv', addVersionTarget.dataUsage, addVersionTarget.dataFormat, 'train-dataset-template')}>CSV 格式</Button>
                </div>
              </Card>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 26 }}>
              <Button type="primary" loading={addingVersion} onClick={handleSubmitAddVersion}>提交</Button>
              <Button onClick={() => navigate(`/datasets/training/${encodeURIComponent(addVersionTarget.name)}${datasetTab === 'validation' ? '?key=validation' : ''}`)}>取消</Button>
            </div>
          </Form>
        </div>
      </div>
    )
  }

  return (
    <>
      <div style={{ padding: '28px 32px', minHeight: '100%' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 40, height: 40,
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
            }}>
              <DatabaseOutlined style={{ color: '#fff', fontSize: 18 }} />
            </div>
            <Text strong style={{ fontSize: 18, color: '#0f172a' }}>训练数据管理</Text>
          </div>
          <Text type="secondary" style={{ fontSize: 13, marginLeft: 52 }}>
            管理和创建用于模型训练的数据集，支持多种格式和训练类型
          </Text>
        </div>

        <div style={{ marginBottom: 16 }}>
          <Tabs
            activeKey={datasetTab}
            onChange={key => { setDatasetTab(key); setSearchValue(''); setDataUsage(undefined) }}
            items={[
              { key: 'training', label: '训练数据集' },
              { key: 'validation', label: '验证数据集' },
            ]}
            style={{ marginBottom: 16 }}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {toolbarExtra}
              <Input
                prefix={<span style={{ color: '#94a3b8' }}>🔍</span>}
                placeholder="搜索"
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                allowClear
                style={{ borderRadius: 8, width: 200 }}
              />
              <Button onClick={() => { setSearchValue(''); setDataUsage(undefined) }}>重置</Button>
            </div>
            <Space>
              <Button icon={<span>🔄</span>} onClick={() => message.success('刷新成功')}>刷新</Button>
              <Button type="primary" icon={<span>➕</span>} onClick={handleOpenCreate}>创建数据集</Button>
            </Space>
          </div>
        </div>

        <div style={{
          background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden',
        }}>
          <Table<TrainingDatasetRecord>
            rowKey="id"
            columns={columns}
            dataSource={listResult.items}
            loading={listLoading}
            scroll={{ x: 1100 }}
            tableLayout="fixed"
            pagination={{
              current: page,
              pageSize,
              total: listResult.total,
              showSizeChanger: false,
              showTotal: (total: number) => `共 ${total} 条数据`,
              onChange: nextPage => setPage(nextPage),
            }}
            locale={{ emptyText: <Text type="secondary">暂无数据</Text> }}
          />
        </div>
      </div>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DatabaseOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>创建数据集</span>
          </div>
        }
        open={createModalVisible}
        onCancel={handleCancel}
        width={720}
        footer={
          <Space>
            <Button onClick={handleCancel}>取消</Button>
            <Button type="primary" loading={creating} onClick={handleSubmit}>提交</Button>
          </Space>
        }
        destroyOnClose
      >
        {createFormContent}
      </Modal>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DatabaseOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>数据集详情</span>
          </div>
        }
        open={detailModalVisible}
        onCancel={handleCloseDetail}
        width={880}
        footer={
          <Space>
            <Button onClick={handleCloseDetail}>关闭</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddVersionFromDetail}>
              新增版本
            </Button>
          </Space>
        }
      >
        {detailContent}
      </Modal>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PlusOutlined style={{ color: '#fff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600 }}>增加版本</span>
          </div>
        }
        open={addVersionModalVisible}
        onCancel={handleCancelAddVersion}
        width={640}
        destroyOnClose
        footer={
          <Space>
            <Button onClick={handleCancelAddVersion}>取消</Button>
            <Button type="primary" loading={addingVersion} onClick={handleSubmitAddVersion}>确定</Button>
          </Space>
        }
      >
        <Form form={addVersionForm} layout="vertical">
          <Form.Item label="数据集名称">
            <Input value={addVersionTarget?.name} disabled />
          </Form.Item>
          <Form.Item label="新版本号" name="version" rules={[{ required: true, message: '请填写版本号' }]}>
            <Input disabled />
          </Form.Item>
          <Divider plain style={{ margin: '12px 0', color: '#64748b', fontSize: 12 }}>数据上传</Divider>
          <Form.Item label="上传文件" name="file">
            <ResumableUpload
              accept=".jsonl,.json,.csv"
              title="上传新版本数据文件"
              hint={`格式需与数据集一致：${addVersionTarget ? resolveFormatLabel(addVersionTarget.dataUsage, addVersionTarget.dataFormat) : '-'}`}
              onFileChange={setAddVersionFile}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default TrainingDataset
