import { ArrowLeftOutlined, DeleteOutlined, FilterOutlined, PlusOutlined, QuestionCircleOutlined, SaveOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { Button, Card, Col, Form, Input, InputNumber, Layout, Modal, Row, Select, Space, Table, Tag, Tooltip, Typography, message } from 'antd'
import type { Key, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { dataInsightService } from '@/services/dataInsightService'

const { Title, Text, Paragraph } = Typography

type InsightSample = {
  row_number?: number
  round_count?: number
  sample_data?: Record<string, unknown>
  quality_flags?: string[]
}

type InsightSegment = {
  sample: InsightSample
  rowNumber: number
  key: string
  label: string
  text: string
  field?: string
  round?: number
  role?: string
}

type DistributionBucket = {
  range: string
  count: number
  min?: number
  max?: number
}

type DetailFilter = {
  id: number
  fieldKey?: string
  metric?: 'text' | 'characters' | 'special_rate'
  operator?: string
  value?: string | number
  maxValue?: number
}

function stringifyCell(value: unknown) {
  if (value == null || value === '') return '-'
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === 'object' && 'role' in item && 'content' in item) {
        return `${String((item as any).role)}: ${String((item as any).content ?? '')}`
      }
      return typeof item === 'string' ? item : JSON.stringify(item)
    }).join('\n')
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function getText(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  return stringifyCell(value)
}

function getSpecialCharCount(text: string) {
  return (text.match(/[^\u4E00-\u9FA5a-zA-Z0-9\s，。！？、；：“”‘’（）,.!?;:'"()-]/g) || []).length
}

function getCharacterBucket(count: number) {
  if (count < 80) return { range: '0-80', min: 0, max: 79 }
  if (count < 160) return { range: '80-160', min: 80, max: 159 }
  if (count < 320) return { range: '160-320', min: 160, max: 319 }
  if (count < 640) return { range: '320-640', min: 320, max: 639 }
  return { range: '640+', min: 640 }
}

function getSpecialRateBucket(rate: number) {
  if (rate < 2) return { range: '0-2%', min: 0, max: 1.99 }
  if (rate < 5) return { range: '2-5%', min: 2, max: 4.99 }
  if (rate < 10) return { range: '5-10%', min: 5, max: 9.99 }
  return { range: '10%+', min: 10 }
}

function makeDistribution(keys: string[], orderedBuckets: DistributionBucket[]) {
  const counts = new Map<string, number>()
  keys.forEach((key) => counts.set(key, (counts.get(key) || 0) + 1))
  return orderedBuckets.map((bucket) => ({ ...bucket, count: counts.get(bucket.range) || 0 }))
}

function extractInsightSegments(sample: InsightSample): InsightSegment[] {
  const data = sample.sample_data ?? {}
  const rowNumber = Number(sample.row_number) || 0
  const segments: InsightSegment[] = []
  const messages = Array.isArray(data.messages) ? data.messages : []

  if (messages.length) {
    let round = 1
    messages.forEach((message) => {
      if (!message || typeof message !== 'object') return
      const role = String((message as any).role ?? '').toLowerCase()
      const content = getText((message as any).content)
      if (role === 'system') {
        segments.push({ sample, rowNumber, key: 'system', label: 'System', text: content, field: 'messages.system', role })
        return
      }
      if (role !== 'user' && role !== 'assistant') return
      const currentRound = role === 'user' ? round : Math.max(round - 1, 1)
      const labelRole = role === 'user' ? 'User' : 'Assistant'
      segments.push({
        sample,
        rowNumber,
        key: `round-${currentRound}-${role}`,
        label: `第${currentRound}轮 ${labelRole}`,
        text: content,
        field: `messages.${role}`,
        round: currentRound,
        role,
      })
      if (role === 'user') round += 1
    })
    return segments
  }

  ;['system', 'prompt', 'response'].forEach((field) => {
    if (field in data) {
      segments.push({ sample, rowNumber, key: field, label: field, text: getText(data[field]), field })
    }
  })

  Object.keys(data).forEach((field) => {
    if (['system', 'prompt', 'response', 'messages'].includes(field)) return
    segments.push({ sample, rowNumber, key: `custom-${field}`, label: field, text: getText(data[field]), field })
  })

  return segments
}

function buildInsightMetrics(segments: InsightSegment[]) {
  const characterCounts = segments.map((segment) => segment.text.length)
  const specialCounts = segments.map((segment) => getSpecialCharCount(segment.text))
  const specialRates = segments.map((segment, index) => {
    const count = characterCounts[index] || 0
    return count ? Number(((specialCounts[index] / count) * 100).toFixed(2)) : 0
  })
  const totalCharacters = characterCounts.reduce((sum, count) => sum + count, 0)
  const totalSpecialCharacters = specialCounts.reduce((sum, count) => sum + count, 0)
  const characterBuckets = characterCounts.map((count) => getCharacterBucket(count).range)
  const specialRateBuckets = specialRates.map((rate) => getSpecialRateBucket(rate).range)

  return {
    sampleCount: segments.length,
    totalCharacters,
    minCharacters: characterCounts.length ? Math.min(...characterCounts) : 0,
    maxCharacters: characterCounts.length ? Math.max(...characterCounts) : 0,
    avgCharacters: characterCounts.length ? Math.round(totalCharacters / characterCounts.length) : 0,
    totalSpecialCharacters,
    minSpecialRate: specialRates.length ? Math.min(...specialRates) : 0,
    maxSpecialRate: specialRates.length ? Math.max(...specialRates) : 0,
    avgSpecialRate: specialRates.length ? Number((specialRates.reduce((sum, rate) => sum + rate, 0) / specialRates.length).toFixed(2)) : 0,
    characterDistribution: makeDistribution(characterBuckets, [
      { range: '0-80', min: 0, max: 79 },
      { range: '80-160', min: 80, max: 159 },
      { range: '160-320', min: 160, max: 319 },
      { range: '320-640', min: 320, max: 639 },
      { range: '640+', min: 640 },
    ]),
    specialRateDistribution: makeDistribution(specialRateBuckets, [
      { range: '0-2%', min: 0, max: 1.99 },
      { range: '2-5%', min: 2, max: 4.99 },
      { range: '5-10%', min: 5, max: 9.99 },
      { range: '10%+', min: 10 },
    ]),
  }
}

function sampleMatchesBucket(sample: InsightSample, selectedSegmentKey: string, bucketType: 'characters' | 'specialRate', range: string) {
  const segment = extractInsightSegments(sample).find((item) => item.key === selectedSegmentKey)
  if (!segment) return false
  if (bucketType === 'characters') return getCharacterBucket(segment.text.length).range === range
  const specialCount = getSpecialCharCount(segment.text)
  const rate = segment.text.length ? Number(((specialCount / segment.text.length) * 100).toFixed(2)) : 0
  return getSpecialRateBucket(rate).range === range
}

function getSegmentByKey(sample: InsightSample, key?: string) {
  if (!key) return undefined
  return extractInsightSegments(sample).find((segment) => segment.key === key)
}

function getTextStats(text: string) {
  const specialCharacterCount = getSpecialCharCount(text)
  const specialCharacterRate = text.length ? Number(((specialCharacterCount / text.length) * 100).toFixed(2)) : 0
  return {
    characterCount: text.length,
    specialCharacterCount,
    specialCharacterRate,
  }
}

function sampleMatchesDetailFilter(sample: InsightSample, filter: DetailFilter) {
  const segment = getSegmentByKey(sample, filter.fieldKey)
  if (!filter.fieldKey || !filter.operator || !segment) return true
  const text = segment.text
  const stats = getTextStats(text)
  const value = String(filter.value ?? '')
  const numericValue = Number(filter.value)
  const maxNumericValue = Number(filter.maxValue)
  const metricValue = filter.metric === 'special_rate'
    ? stats.specialCharacterRate
    : stats.characterCount

  switch (filter.operator) {
    case 'equals':
      if (filter.metric === 'characters' || filter.metric === 'special_rate') return Number.isFinite(numericValue) ? metricValue === numericValue : true
      return value ? text === value : true
    case 'not_equals':
      if (filter.metric === 'characters' || filter.metric === 'special_rate') return Number.isFinite(numericValue) ? metricValue !== numericValue : true
      return value ? text !== value : true
    case 'contains':
      return value ? text.includes(value) : true
    case 'not_contains':
      return value ? !text.includes(value) : true
    case 'empty':
      return text.trim().length === 0
    case 'not_empty':
      return text.trim().length > 0
    case 'gt':
      return Number.isFinite(numericValue) ? metricValue > numericValue : true
    case 'lt':
      return Number.isFinite(numericValue) ? metricValue < numericValue : true
    case 'between':
      return Number.isFinite(numericValue) && Number.isFinite(maxNumericValue)
        ? metricValue >= numericValue && metricValue <= maxNumericValue
        : true
    default:
      return true
  }
}

function filterRequiresValue(operator?: string) {
  return operator && !['empty', 'not_empty'].includes(operator)
}

function filterRequiresRange(operator?: string) {
  return operator === 'between'
}

function getFilterDescription(filter: DetailFilter, fieldOptions: Array<{ key: string, label: string }>) {
  const fieldLabel = fieldOptions.find((item) => item.key === filter.fieldKey)?.label ?? '字段'
  const metricLabelMap: Record<string, string> = {
    text: '文本内容',
    characters: '字符数',
    special_rate: '特殊字符率',
  }
  const operatorLabelMap: Record<string, string> = {
    equals: '等于',
    not_equals: '不等于',
    contains: '包含',
    not_contains: '不包含',
    empty: '为空',
    not_empty: '不为空',
    gt: '大于',
    lt: '小于',
    between: '介于',
  }
  const metricLabel = metricLabelMap[filter.metric ?? 'text'] ?? '文本内容'
  const operatorLabel = operatorLabelMap[filter.operator ?? ''] ?? '条件'
  const valueText = filter.operator === 'between' ? `${filter.value ?? ''}-${filter.maxValue ?? ''}` : `${filter.value ?? ''}`
  return filterRequiresValue(filter.operator) ? `${fieldLabel} ${metricLabel} ${operatorLabel} ${valueText}` : `${fieldLabel} ${metricLabel} ${operatorLabel}`
}

function getQualityFlagDescription(flag: string) {
  if (flag.includes('重复')) {
    return '由洞察任务基于文本完全一致或高度相似的样本检测生成，用于提示可能存在重复训练样本。可点击该标记筛选同类样本后批量删除。'
  }
  if (flag.includes('特殊字符')) {
    return '由洞察任务根据特殊字符率检测生成，用于提示该样本可能包含异常符号、乱码或不符合训练数据规范的内容。'
  }
  if (flag.includes('为空')) {
    return '由洞察任务检测到关键字段为空生成，用于提示样本缺少必要的 Prompt、Response 或对话内容。'
  }
  if (flag.includes('敏感')) {
    return '由洞察任务根据字段内容特征生成，用于提示样本可能包含需要脱敏或复核的信息。'
  }
  return '由洞察任务根据质量规则自动生成的样本标记，用于辅助筛选、删除和另存训练数据。'
}

function MetricCard({ label, value, suffix }: { label: string, value: ReactNode, suffix?: string }) {
  return (
    <Card size="small">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold text-blue-700">{value}{suffix ? <span className="ml-1 text-xs">{suffix}</span> : null}</div>
    </Card>
  )
}

function SpecialCharacterTitle({ children }: { children: ReactNode }) {
  return (
    <Space size={6}>
      <span>{children}</span>
      <Tooltip
        title="特殊字符指非中文、英文字母、数字、空白和常见中英文标点之外的字符，例如 #、@、*、%、=、_、|、/、\、<、>、[]、{}、emoji、不可见控制符等。特殊字符率 = 特殊字符数 / 当前字段字符数。"
      >
        <QuestionCircleOutlined className="text-gray-400" />
      </Tooltip>
    </Space>
  )
}

function buildQualityOverviewText(findings: Record<string, any>, totalSamples: number, selectedSegmentLabel: string, metrics: ReturnType<typeof buildInsightMetrics>) {
  const emptySamples = Number(findings.empty_samples) || 0
  const formatErrors = Number(findings.format_errors) || 0
  const duplicateSamples = Number(findings.duplicate_samples) || 0
  const issueCount = emptySamples + formatErrors + duplicateSamples
  const issueRate = totalSamples ? Number(((issueCount / totalSamples) * 100).toFixed(1)) : 0
  const qualityLevel = issueCount === 0 ? '整体质量较稳定' : issueRate <= 10 ? '整体质量可用，但存在少量需复核样本' : '整体存在较明显质量风险'
  const issueParts = [
    emptySamples > 0 ? `${emptySamples} 条空值样本` : '',
    formatErrors > 0 ? `${formatErrors} 条格式异常样本` : '',
    duplicateSamples > 0 ? `${duplicateSamples} 条疑似重复样本` : '',
  ].filter(Boolean)
  const issueText = issueParts.length ? `主要问题集中在${issueParts.join('、')}。` : '暂未发现空值、格式异常或重复样本。'
  const characterText = `${selectedSegmentLabel} 的字符数范围为 ${metrics.minCharacters}-${metrics.maxCharacters}，平均 ${metrics.avgCharacters}；平均特殊字符率 ${metrics.avgSpecialRate}%。`
  const suggestion = issueCount > 0
    ? '建议先结合右侧数据详情复核异常和重复样本，再保存为训练可用数据。'
    : '建议继续抽样查看右侧数据详情，确认语义覆盖与标注口径一致后再保存为训练可用数据。'
  return `${qualityLevel}。${issueText}${characterText}${suggestion}`
}

function BarList({
  data,
  activeRange,
  onSelect,
}: {
  data: DistributionBucket[]
  activeRange?: string
  onSelect: (bucket: DistributionBucket) => void
}) {
  const max = Math.max(...data.map((item) => item.count), 1)
  return (
    <div className="space-y-3">
      {data.map((item) => {
        const active = activeRange === item.range
        return (
          <button
            key={item.range}
            type="button"
            className={`flex w-full items-center gap-3 rounded px-2 py-1 text-left transition ${active ? 'bg-blue-50 ring-1 ring-blue-300' : 'hover:bg-gray-50'}`}
            onClick={() => onSelect(item)}
          >
            <span className="w-20 text-right text-gray-500">{item.range}</span>
            <span className="h-7 flex-1 rounded bg-gray-100">
              <span className={`block h-7 rounded ${active ? 'bg-blue-600' : 'bg-blue-400'}`} style={{ width: `${(item.count / max) * 100}%` }} />
            </span>
            <span className="w-12 text-gray-700">{item.count}</span>
          </button>
        )
      })}
    </div>
  )
}

function DataDetailCell({ text }: { text: string }) {
  const stats = getTextStats(text)
  return (
    <Tooltip
      overlayStyle={{ maxWidth: 360 }}
      title={(
        <div>
          <div>字符数：{stats.characterCount}</div>
          <div>特殊字符数：{stats.specialCharacterCount}</div>
          <div>特殊字符率：{stats.specialCharacterRate}%</div>
        </div>
      )}
    >
      <Paragraph className="mb-0 max-h-28 overflow-hidden whitespace-pre-wrap text-gray-700">
        {text || <Text type="secondary">-</Text>}
      </Paragraph>
    </Tooltip>
  )
}

export default function DataInsightDetail() {
  const navigate = useNavigate()
  const { projectId, taskId } = useParams<{ projectId: string, taskId: string }>()
  const numericProjectId = Number(projectId)
  const numericTaskId = Number(taskId)
  const [saveOpen, setSaveOpen] = useState(false)
  const [selectedSegmentKey, setSelectedSegmentKey] = useState('')
  const [activeBucket, setActiveBucket] = useState<{ type: 'characters' | 'specialRate', range: string } | null>(null)
  const [detailFilters, setDetailFilters] = useState<DetailFilter[]>([])
  const [detailFilterModes, setDetailFilterModes] = useState<Record<string, 'multi' | 'group'>>({})
  const [activeQualityFlag, setActiveQualityFlag] = useState<string>()
  const [selectedSampleKeys, setSelectedSampleKeys] = useState<Key[]>([])
  const [deletedSampleKeys, setDeletedSampleKeys] = useState<Key[]>([])
  const [form] = Form.useForm()

  const { data: task, isLoading } = useQuery({
    queryKey: ['data-insight-detail', numericProjectId, numericTaskId],
    queryFn: () => dataInsightService.detail(numericProjectId, numericTaskId),
    enabled: !!numericProjectId && !!numericTaskId,
  })

  const summary = task?.result_summary ?? {}
  const samples = useMemo<InsightSample[]>(() => task?.result_samples?.items ?? [], [task?.result_samples?.items])
  const segmentOptions = useMemo(() => {
    const options = new Map<string, string>()
    samples.flatMap(extractInsightSegments).forEach((segment) => {
      if (!options.has(segment.key)) options.set(segment.key, segment.label)
    })
    return Array.from(options.entries()).map(([key, label]) => ({ key, label }))
  }, [samples])

  useEffect(() => {
    if (!segmentOptions.length) return
    const preferredKey = task?.dataset_format === 'role-based'
      ? segmentOptions.find((item) => item.key === 'round-1-user')?.key
      : segmentOptions.find((item) => item.key === 'prompt')?.key
    const nextKey = preferredKey ?? segmentOptions[0].key
    if (!selectedSegmentKey || !segmentOptions.some((item) => item.key === selectedSegmentKey)) {
      setSelectedSegmentKey(nextKey)
      setActiveBucket(null)
    }
  }, [segmentOptions, selectedSegmentKey, task?.dataset_format])

  const selectedSegments = useMemo(() => (
    samples.flatMap(extractInsightSegments).filter((segment) => segment.key === selectedSegmentKey)
  ), [samples, selectedSegmentKey])
  const metrics = useMemo(() => buildInsightMetrics(selectedSegments), [selectedSegments])
  const dataDetailFields = useMemo(() => {
    const preferred = task?.dataset_format === 'role-based'
      ? ['system', 'round-1-user', 'round-1-assistant', 'round-2-user', 'round-2-assistant', 'round-3-user', 'round-3-assistant']
      : ['system', 'prompt', 'response']
    return [...segmentOptions].sort((a, b) => {
      const aIndex = preferred.indexOf(a.key)
      const bIndex = preferred.indexOf(b.key)
      if (aIndex === -1 && bIndex === -1) return a.label.localeCompare(b.label)
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    })
  }, [segmentOptions, task?.dataset_format])
  const activeDetailFilters = useMemo(() => detailFilters.filter((filter) => (
    filter.fieldKey && filter.operator && (!filterRequiresValue(filter.operator) || filter.value !== undefined && filter.value !== '')
  )), [detailFilters])
  const visibleSamples = useMemo(() => {
    return samples.filter((sample) => {
      const rowKey = String(sample.row_number)
      if (deletedSampleKeys.includes(rowKey)) return false
      const matchesBucket = !activeBucket || sampleMatchesBucket(sample, selectedSegmentKey, activeBucket.type, activeBucket.range)
      const groupedFilters = activeDetailFilters.reduce<Record<string, DetailFilter[]>>((groups, filter) => {
        const key = filter.fieldKey ?? 'unknown'
        groups[key] = [...(groups[key] ?? []), filter]
        return groups
      }, {})
      const matchesFilters = Object.entries(groupedFilters).every(([fieldKey, filters]) => {
        const mode = detailFilterModes[fieldKey] ?? 'multi'
        return mode === 'group'
          ? filters.some((filter) => sampleMatchesDetailFilter(sample, filter))
          : filters.every((filter) => sampleMatchesDetailFilter(sample, filter))
      })
      const matchesQualityFlag = !activeQualityFlag || sample.quality_flags?.includes(activeQualityFlag)
      return matchesBucket && matchesFilters && matchesQualityFlag
    })
  }, [activeBucket, activeDetailFilters, activeQualityFlag, deletedSampleKeys, detailFilterModes, samples, selectedSegmentKey])
  const findings = summary.quality_findings ?? {}
  const selectedSegmentLabel = segmentOptions.find((item) => item.key === selectedSegmentKey)?.label ?? '当前字段'
  const qualityOverviewText = buildQualityOverviewText(findings, samples.length, selectedSegmentLabel, metrics)

  useEffect(() => {
    const visibleKeys = new Set(visibleSamples.map((sample) => String(sample.row_number)))
    setSelectedSampleKeys((keys) => {
      const nextKeys = keys.filter((key) => visibleKeys.has(String(key)))
      if (nextKeys.length === keys.length && nextKeys.every((key, index) => key === keys[index])) return keys
      return nextKeys
    })
  }, [visibleSamples])

  const handleBucketSelect = (type: 'characters' | 'specialRate', bucket: DistributionBucket) => {
    setActiveBucket((current) => current?.type === type && current.range === bucket.range ? null : { type, range: bucket.range })
  }

  const handleDeleteSelectedSamples = () => {
    if (!selectedSampleKeys.length) return
    Modal.confirm({
      title: '确认删除已选样本？',
      content: `将从当前洞察结果中删除 ${selectedSampleKeys.length} 条样本，删除后可继续另存为新数据。`,
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        setDeletedSampleKeys((keys) => Array.from(new Set([...keys, ...selectedSampleKeys.map(String)])))
        setSelectedSampleKeys([])
        message.success('已删除已选样本')
      },
    })
  }

  const removeDetailFilter = (id: number) => {
    setDetailFilters((filters) => filters.filter((filter) => filter.id !== id))
  }

  const getFieldFilters = (fieldKey: string) => detailFilters.filter((filter) => filter.fieldKey === fieldKey)

  const upsertFieldFilter = (fieldKey: string, filterId: number, patch: Partial<DetailFilter>) => {
    setDetailFilters((filters) => {
      const current = filters.find((filter) => filter.id === filterId)
      const nextFilter = { id: current?.id ?? filterId, fieldKey, metric: 'text' as const, operator: 'contains', ...current, ...patch }
      const nextFilters = filters.filter((filter) => filter.id !== filterId)
      return [...nextFilters, nextFilter]
    })
  }

  const addFieldFilter = (fieldKey: string) => {
    setDetailFilters((filters) => [...filters, { id: Date.now(), fieldKey, metric: 'text', operator: 'contains', value: '' }])
  }

  const removeFieldFilter = (filterId: number) => {
    setDetailFilters((filters) => filters.filter((filter) => filter.id !== filterId))
  }

  const renderFieldFilterDropdown = (field: { key: string, label: string }, close: () => void) => {
    const filters = getFieldFilters(field.key)
    const draftFilters = filters.length ? filters : [{ id: -1, fieldKey: field.key, metric: 'text' as const, operator: 'contains', value: '' }]
    const mode = detailFilterModes[field.key] ?? 'multi'
    const metricOptions = [
      { label: '文本内容', value: 'text' },
      { label: '字符数', value: 'characters' },
      { label: '特殊字符率', value: 'special_rate' },
    ]
    const getOperatorOptions = (metric?: DetailFilter['metric']) => {
      if (metric === 'characters' || metric === 'special_rate') {
        return [
          { label: '等于', value: 'equals' },
          { label: '不等于', value: 'not_equals' },
          { label: '大于', value: 'gt' },
          { label: '小于', value: 'lt' },
          { label: '区间', value: 'between' },
          { label: '为空', value: 'empty' },
          { label: '不为空', value: 'not_empty' },
        ]
      }
      return [
        { label: '包含', value: 'contains' },
        { label: '不包含', value: 'not_contains' },
        { label: '等于', value: 'equals' },
        { label: '不等于', value: 'not_equals' },
        { label: '为空', value: 'empty' },
        { label: '不为空', value: 'not_empty' },
      ]
    }
    const updateFilter = (filter: DetailFilter, patch: Partial<DetailFilter>) => {
      const id = filter.id === -1 ? Date.now() : filter.id
      upsertFieldFilter(field.key, id, patch)
    }
    return (
      <div className="w-[560px]" onKeyDown={(event) => event.stopPropagation()}>
        <div className="px-4 py-4">
          <div className="grid grid-cols-[56px_1fr] gap-3">
            <div className="flex items-center justify-center">
              {draftFilters.length > 1 ? (
                <Select
                  className="w-14"
                  value={mode}
                  options={[
                    { label: '且', value: 'multi' },
                    { label: '或', value: 'group' },
                  ]}
                  onChange={(value) => setDetailFilterModes((modes) => ({ ...modes, [field.key]: value }))}
                />
              ) : null}
            </div>
            <div className="min-w-0">
              <Space direction="vertical" className="w-full" size={12}>
                {draftFilters.map((filter) => {
                  const metric = filter.metric ?? 'text'
                  const operator = filter.operator
                  const numericMetric = metric === 'characters' || metric === 'special_rate'
                  return (
                    <div key={filter.id} className="grid grid-cols-[132px_116px_minmax(0,1fr)_32px] items-center gap-2">
                      <Select
                        size="middle"
                        value={metric}
                        options={metricOptions}
                        onChange={(value) => updateFilter(filter, { metric: value, operator: value === 'text' ? 'contains' : 'equals', value: undefined, maxValue: undefined })}
                      />
                      <Select
                        size="middle"
                        value={operator}
                        options={getOperatorOptions(metric)}
                        onChange={(value) => updateFilter(filter, { operator: value, value: undefined, maxValue: undefined })}
                      />
                      {filterRequiresValue(operator) ? (
                        filterRequiresRange(operator) ? (
                          <Space.Compact className="w-full">
                            <InputNumber
                              className="w-full"
                              min={0}
                              placeholder="最小值"
                              addonAfter={metric === 'special_rate' ? '%' : undefined}
                              value={typeof filter.value === 'number' ? filter.value : undefined}
                              onChange={(value) => updateFilter(filter, { value: value ?? undefined })}
                            />
                            <InputNumber
                              className="w-full"
                              min={0}
                              placeholder="最大值"
                              addonAfter={metric === 'special_rate' ? '%' : undefined}
                              value={typeof filter.maxValue === 'number' ? filter.maxValue : undefined}
                              onChange={(value) => updateFilter(filter, { maxValue: value ?? undefined })}
                            />
                          </Space.Compact>
                        ) : numericMetric ? (
                          <InputNumber
                            className="w-full"
                            min={0}
                            placeholder="请输入数值"
                            addonAfter={metric === 'special_rate' ? '%' : undefined}
                            value={typeof filter.value === 'number' ? filter.value : undefined}
                            onChange={(value) => updateFilter(filter, { value: value ?? undefined })}
                          />
                        ) : (
                          <Input
                            className="w-full"
                            placeholder="请输入文本"
                            value={typeof filter.value === 'string' ? filter.value : ''}
                            onChange={(event) => updateFilter(filter, { value: event.target.value })}
                          />
                        )
                      ) : (
                        <Input className="w-full" disabled placeholder="无需填写" />
                      )}
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        disabled={filter.id === -1}
                        onClick={() => removeFieldFilter(filter.id)}
                      />
                    </div>
                  )
                })}
              </Space>
              <Button type="link" icon={<PlusOutlined />} className="mt-3 px-0" onClick={() => addFieldFilter(field.key)}>
                添加条件
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-start gap-3 border-t border-gray-100 px-4 py-3">
          <Button type="primary" onClick={close}>确定</Button>
          <Button
            onClick={() => {
              setDetailFilters((filters) => filters.filter((filter) => filter.fieldKey !== field.key))
              close()
            }}
          >
            重置
          </Button>
        </div>
      </div>
    )
  }

  const handleSaveAsDataset = async (values: any) => {
    await dataInsightService.saveAsDataset(numericProjectId, numericTaskId, {
      name: values.name,
      version: values.version || 'V1',
      description: values.description,
      filters: task?.config?.filters as any[] ?? [],
    })
    message.success('已提交另存为新数据集')
    setSaveOpen(false)
  }

  return (
    <Layout.Content className="p-8">
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/project/${numericProjectId}/data-insight`)}>返回</Button>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <Title level={3}>{task?.source_dataset_name ?? '数据洞察详情'}</Title>
          <Text type="secondary">{task?.dataset_format} / {task?.source_dataset_version}</Text>
        </div>
        <Space>
          <Button danger disabled={!selectedSampleKeys.length} onClick={handleDeleteSelectedSamples}>
            删除筛选样本{selectedSampleKeys.length ? `（${selectedSampleKeys.length}）` : ''}
          </Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={() => setSaveOpen(true)}>另存为新数据</Button>
        </Space>
      </div>

      <Row gutter={16} align="top">
        <Col span={8}>
          <Card title="数据洞察" className="mb-4" loading={isLoading}>
            <Space wrap size={[8, 8]}>
              {segmentOptions.map((item) => (
                <Button
                  key={item.key}
                  size="small"
                  type={selectedSegmentKey === item.key ? 'primary' : 'default'}
                  onClick={() => {
                    setSelectedSegmentKey(item.key)
                    setActiveBucket(null)
                  }}
                >
                  {item.label}
                </Button>
              ))}
            </Space>
          </Card>

          <Card title={`${selectedSegmentLabel} 字符数`} className="mb-4" loading={isLoading}>
            <Row gutter={[8, 8]}>
              <Col span={12}><MetricCard label="最小字符数" value={metrics.minCharacters} /></Col>
              <Col span={12}><MetricCard label="最大字符数" value={metrics.maxCharacters} /></Col>
              <Col span={12}><MetricCard label="平均字符数" value={metrics.avgCharacters} /></Col>
              <Col span={12}><MetricCard label="总字符数" value={metrics.totalCharacters} /></Col>
            </Row>
          </Card>

          <Card title="字符数直方图分布" className="mb-4" loading={isLoading}>
            <BarList
              data={metrics.characterDistribution}
              activeRange={activeBucket?.type === 'characters' ? activeBucket.range : undefined}
              onSelect={(bucket) => handleBucketSelect('characters', bucket)}
            />
          </Card>

          <Card title={<SpecialCharacterTitle>{selectedSegmentLabel} 特殊字符率</SpecialCharacterTitle>} className="mb-4" loading={isLoading}>
            <Row gutter={[8, 8]}>
              <Col span={12}><MetricCard label="最小特殊字符率" value={metrics.minSpecialRate} suffix="%" /></Col>
              <Col span={12}><MetricCard label="最大特殊字符率" value={metrics.maxSpecialRate} suffix="%" /></Col>
              <Col span={12}><MetricCard label="平均特殊字符率" value={metrics.avgSpecialRate} suffix="%" /></Col>
              <Col span={12}><MetricCard label="特殊字符总数" value={metrics.totalSpecialCharacters} /></Col>
            </Row>
          </Card>

          <Card title={<SpecialCharacterTitle>特殊字符率直方图分布</SpecialCharacterTitle>} className="mb-4" loading={isLoading}>
            <BarList
              data={metrics.specialRateDistribution}
              activeRange={activeBucket?.type === 'specialRate' ? activeBucket.range : undefined}
              onSelect={(bucket) => handleBucketSelect('specialRate', bucket)}
            />
          </Card>

          <Card title="质量概览" loading={isLoading}>
            <Paragraph className="mb-0 leading-7 text-gray-700">{qualityOverviewText}</Paragraph>
          </Card>
        </Col>

        <Col span={16}>
          <Card
            title="数据详情"
            extra={(
              <Space>
                {selectedSampleKeys.length ? <Tag color="red">已选 {selectedSampleKeys.length} 条</Tag> : null}
                {activeBucket ? (
                  <Tag color="blue" closable onClose={() => setActiveBucket(null)}>
                    {selectedSegmentLabel} {activeBucket.type === 'characters' ? '字符数' : '特殊字符率'}：{activeBucket.range}
                  </Tag>
                ) : null}
                {activeQualityFlag ? (
                  <Tag color="orange" closable onClose={() => setActiveQualityFlag(undefined)}>
                    质量标记：{activeQualityFlag}
                  </Tag>
                ) : null}
                {activeDetailFilters.map((filter) => (
                  <Tag key={filter.id} color="processing" closable onClose={() => removeDetailFilter(filter.id)}>
                    {getFilterDescription(filter, dataDetailFields)}
                  </Tag>
                ))}
                <Text type="secondary">共 {visibleSamples.length} 条</Text>
              </Space>
            )}
          >
            <Table
              rowKey={(record) => String(record.row_number)}
              loading={isLoading}
              dataSource={visibleSamples}
              rowSelection={{
                selectedRowKeys: selectedSampleKeys,
                onChange: (keys) => setSelectedSampleKeys(keys),
                preserveSelectedRowKeys: false,
              }}
              pagination={{ pageSize: 6, total: visibleSamples.length }}
              columns={[
                { title: '序号', dataIndex: 'row_number', width: 80, fixed: 'left', align: 'center' },
                ...dataDetailFields.map((field) => ({
                  title: field.label,
                  key: field.key,
                  width: task?.dataset_format === 'role-based' ? 260 : 300,
                  filteredValue: getFieldFilters(field.key).length ? ['active'] : null,
                  filterIcon: (filtered: boolean) => <FilterOutlined className={filtered ? 'text-blue-600' : undefined} />,
                  filterDropdown: ({ close }: { close: () => void }) => renderFieldFilterDropdown(field, close),
                  render: (_: unknown, record: InsightSample) => <DataDetailCell text={getSegmentByKey(record, field.key)?.text ?? ''} />,
                })),
                {
                  title: '质量标记',
                  width: 140,
                  render: (_, record) => (record.quality_flags?.length
                    ? record.quality_flags.map((flag) => (
                        <Tooltip key={flag} title={getQualityFlagDescription(flag)}>
                          <Tag color="orange" className="cursor-pointer" onClick={() => setActiveQualityFlag(flag)}>{flag}</Tag>
                        </Tooltip>
                      ))
                    : <Text type="secondary">-</Text>),
                },
              ]}
              scroll={{ x: 80 + dataDetailFields.length * (task?.dataset_format === 'role-based' ? 260 : 300) + 140 }}
              bordered
              rowClassName={(_, index) => index % 2 === 0 ? 'bg-gray-50 hover:bg-blue-50' : 'bg-white hover:bg-blue-50'}
            />
          </Card>
        </Col>
      </Row>

      <Modal title="另存为新数据集" open={saveOpen} onCancel={() => setSaveOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={handleSaveAsDataset}>
          <Form.Item name="name" label="数据集名称" rules={[{ required: true, message: '请输入数据集名称' }]}>
            <Input placeholder="筛选后的训练数据集" />
          </Form.Item>
          <Form.Item name="version" label="版本号" initialValue="V1">
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Layout.Content>
  )
}
