import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Modal,
  Button,
  Input,
  Space,
  Typography,
  Checkbox,
  Radio,
  Table,
  Tag,
} from 'antd'
import { CaretDownOutlined, CaretRightOutlined, SearchOutlined } from '@ant-design/icons'
import type { TrainingType } from '../types/training'
import { TRAINING_METHOD_LABELS, type TrainingMethod } from '../types/training'
import {
  DATASET_PICKER_CATALOG,
  type DatasetPickerDataType,
  type DatasetPickerItem,
  makeDatasetRowKey,
  resolveDatasetVersionRow,
  type DatasetPickerResolvedRow,
} from '../data/datasetPickerCatalog'
import { isPreferenceOrRewardFormat } from '../services/datasetFormats'

const { Text } = Typography

export type SelectedDatasetVersionRow = DatasetPickerResolvedRow
export type DetailedDataUsage = '文本生成 / SFT' | '文本生成 / DPO' | '文本生成 / RFT-PPO' | '文本生成 / RFT-GRPO' | '图像理解'

export interface DatasetSelectModalProps {
  open: boolean
  title: string
  mode: 'multiple' | 'single'
  trainingType: TrainingType
  /** 当前训练方法：决定数据格式过滤规则 */
  trainingMethod?: TrainingMethod
  /** 固定数据类型：训练/验证数据集选择场景下只显示对应类型 */
  fixedDataType?: DatasetPickerDataType
  /** 不固定数据类型时，首次打开默认选中的数据类型 */
  defaultDataType?: DatasetPickerDataType
  /** 不固定数据类型时，仅允许展示的数据类型 */
  allowedDataTypes?: DatasetPickerDataType[]
  /** 推理结果集选择数据时，数据用途需要细分到 SFT / DPO / RFT-PPO / RFT-GRPO */
  detailedDataUsage?: boolean
  /** 数据用途细分后的白名单，适用于推理结果集等只允许 SFT 的场景 */
  allowedDetailedUsages?: DetailedDataUsage[]
  /** 按数据类型设置数据用途白名单，适用于“测试数据保留，训练/验证只允许 SFT”的场景 */
  allowedDetailedUsagesByDataType?: Partial<Record<DatasetPickerDataType, DetailedDataUsage[]>>
  /** 按数据类型排除数据格式，适用于训练/验证中排除 DPO/RFT 格式但保留基础用途筛选的场景 */
  excludedFormatsByDataType?: Partial<Record<DatasetPickerDataType, string[]>>
  /** 按数据类型排除 DPO/RFT 偏好或奖励数据，避免 ROLE_BASED 与 SFT 格式冲突时误伤 */
  excludePreferenceOrRewardByDataType?: DatasetPickerDataType[]
  /** 隐藏当前范围内数量为 0 的细分用途选项 */
  hideEmptyDetailedUsageOptions?: boolean
  /** 隐藏细分用途选项，仅保留“全部” */
  hideDetailedUsageOptions?: boolean
  /** 首次打开时默认选中的数据用途 */
  defaultDataUsage?: string
  /** 弹窗顶部的业务约束提示 */
  dataScopeHint?: React.ReactNode
  emptyText?: string
  emptyDescription?: string
  defaultSelectedKeys?: string[]
  excludeKeys?: string[]
  onCancel: () => void
  onConfirm: (rows: SelectedDatasetVersionRow[]) => void
}

/** 训练方法 → 允许的数据格式映射 */
export const TRAINING_METHOD_FORMATS: Record<TrainingMethod, string[]> = {
  SFT: ['PROMPT_RESPONSE', 'ROLE_BASED'],
  DPO: ['ALPACA', 'ROLE_BASED'],
  RFT: ['Completion_Reward'],
}

function getAllowedFormats(trainingType: TrainingType, trainingMethod?: TrainingMethod): Set<string> | null {
  if (!trainingMethod) return null
  if (trainingType === 'vision' && trainingMethod === 'SFT') {
    return new Set(['ROLE_BASED'])
  }
  return new Set(TRAINING_METHOD_FORMATS[trainingMethod])
}

/** 根据 trainingType 计算 dataUsage 默认值 */
function getDefaultDataUsage(trainingType: TrainingType): string {
  return trainingType === 'vision' ? '图像理解' : trainingType === 'text' ? '文本生成' : ''
}

interface FormatOption { value: string; label: string; count: number }

function getDetailedUsage(item: DatasetPickerItem): string {
  if (item.dataUsage === '图像理解') return '图像理解'
  if (item.dataFormat === 'ALPACA' || (item.dataFormat === 'ROLE_BASED' && item.name.toUpperCase().includes('DPO'))) return '文本生成 / DPO'
  if (item.dataFormat === 'Completion_Reward') {
    return item.name.toUpperCase().includes('GRPO') ? '文本生成 / RFT-GRPO' : '文本生成 / RFT-PPO'
  }
  return '文本生成 / SFT'
}

function matchesTrainingMethod(item: DatasetPickerItem, trainingMethod?: TrainingMethod): boolean {
  if (!trainingMethod) return true
  if (trainingMethod === 'SFT') {
    return !isPreferenceOrRewardFormat(item.dataFormat, item.name)
  }
  if (trainingMethod === 'DPO') {
    return item.dataFormat === 'ALPACA' || (item.dataFormat === 'ROLE_BASED' && item.name.toUpperCase().includes('DPO'))
  }
  return item.dataFormat === 'Completion_Reward'
}

/** 训练/验证弹窗固定为训练/验证数据集类型 */
const DatasetSelectModal: React.FC<DatasetSelectModalProps> = ({
  open,
  title,
  mode,
  trainingType,
  trainingMethod,
  fixedDataType,
  defaultDataType,
  allowedDataTypes,
  detailedDataUsage = false,
  allowedDetailedUsages,
  allowedDetailedUsagesByDataType,
  excludedFormatsByDataType,
  excludePreferenceOrRewardByDataType,
  hideEmptyDetailedUsageOptions = false,
  hideDetailedUsageOptions = false,
  defaultDataUsage,
  dataScopeHint,
  emptyText = '暂无数据集',
  emptyDescription,
  defaultSelectedKeys = [],
  excludeKeys = [],
  onCancel,
  onConfirm,
}) => {
  // ─── 筛选状态 ───
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10

  const [dataType, setDataType] = useState<string>(fixedDataType ?? defaultDataType ?? '')
  const [dataUsage, setDataUsage] = useState(() => defaultDataUsage ?? (detailedDataUsage ? '' : getDefaultDataUsage(trainingType)))
  const [dataFormat, setDataFormat] = useState('')

  // 选中状态
  const [multiSelected, setMultiSelected] = useState<Set<string>>(() => new Set())
  const [singleSelected, setSingleSelected] = useState<string | null>(null)

  // 展开行
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  // ─── 核心修复：使用 ref 追踪上一次 open，变化时才重置 ───
  // 仅在 open 从 false → true 时触发一次重置，不会产生无限循环
  const prevOpenRef = useRef<boolean>(false)
  useEffect(() => {
    if (!open) {
      prevOpenRef.current = false
      return
    }
    // open 为 true 时，若上一次是 false（首次打开或重新打开），执行重置
    if (!prevOpenRef.current) {
      setSearch('')
      setPage(1)
      setExpandedIds(new Set())
      setDataType(fixedDataType ?? defaultDataType ?? '')
      setDataUsage(defaultDataUsage ?? (detailedDataUsage ? '' : getDefaultDataUsage(trainingType)))
      setDataFormat('')
      if (mode === 'multiple') {
        setMultiSelected(new Set(defaultSelectedKeys.filter(k => !excludeKeys.includes(k))))
        setSingleSelected(null)
      } else {
        setSingleSelected(defaultSelectedKeys[0] ?? null)
        setMultiSelected(new Set())
      }
    }
    prevOpenRef.current = true
  }, [open, fixedDataType, defaultDataType, mode, trainingType, trainingMethod, detailedDataUsage, defaultDataUsage, defaultSelectedKeys, excludeKeys])

  // ─── 派生数据：数据类型选项 & 数量 ───
  const DATA_TYPES = useMemo(
    () => ['训练数据集', '验证数据集', '测试数据集'] as const,
    [],
  )
  const selectableDataTypes = useMemo(
    () => allowedDataTypes?.length
      ? DATA_TYPES.filter(t => allowedDataTypes.includes(t))
      : DATA_TYPES,
    [DATA_TYPES, allowedDataTypes],
  )
  const allowedDetailedUsageSet = useMemo(
    () => allowedDetailedUsages?.length ? new Set<string>(allowedDetailedUsages) : null,
    [allowedDetailedUsages],
  )
  const allowedDetailedUsageByTypeSets = useMemo(() => {
    if (!allowedDetailedUsagesByDataType) return null
    return Object.fromEntries(
      Object.entries(allowedDetailedUsagesByDataType).map(([type, usages]) => [type, new Set(usages)]),
    ) as Partial<Record<DatasetPickerDataType, Set<DetailedDataUsage>>>
  }, [allowedDetailedUsagesByDataType])
  const excludedFormatByTypeSets = useMemo(() => {
    if (!excludedFormatsByDataType) return null
    return Object.fromEntries(
      Object.entries(excludedFormatsByDataType).map(([type, formats]) => [type, new Set(formats)]),
    ) as Partial<Record<DatasetPickerDataType, Set<string>>>
  }, [excludedFormatsByDataType])
  const excludePreferenceOrRewardTypes = useMemo(
    () => new Set(excludePreferenceOrRewardByDataType ?? []),
    [excludePreferenceOrRewardByDataType],
  )
  const baseCatalog = useMemo(() => {
    let list = DATASET_PICKER_CATALOG
    if (allowedDataTypes?.length) {
      list = list.filter(d => allowedDataTypes.includes(d.dataType))
    }
    if (allowedDetailedUsageSet) {
      list = list.filter(d => allowedDetailedUsageSet.has(getDetailedUsage(d)))
    }
    if (allowedDetailedUsageByTypeSets) {
      list = list.filter(d => {
        const scopedSet = allowedDetailedUsageByTypeSets[d.dataType]
        return !scopedSet || scopedSet.has(getDetailedUsage(d) as DetailedDataUsage)
      })
    }
    if (excludedFormatByTypeSets) {
      list = list.filter(d => {
        const scopedSet = excludedFormatByTypeSets[d.dataType]
        return !scopedSet || !scopedSet.has(d.dataFormat)
      })
    }
    if (excludePreferenceOrRewardTypes.size) {
      list = list.filter(d => !excludePreferenceOrRewardTypes.has(d.dataType) || !isPreferenceOrRewardFormat(d.dataFormat, d.name))
    }
    return list
  }, [allowedDataTypes, allowedDetailedUsageByTypeSets, allowedDetailedUsageSet, excludePreferenceOrRewardTypes, excludedFormatByTypeSets])

  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const t of DATA_TYPES) m[t] = 0
    for (const d of baseCatalog) {
      m[d.dataType] = (m[d.dataType] ?? 0) + 1
    }
    return m
  }, [DATA_TYPES, baseCatalog])

  // ─── 筛选逻辑 ───
  const allowedFormats = useMemo(
    () => getAllowedFormats(trainingType, trainingMethod),
    [trainingType, trainingMethod],
  )

  const filteredCatalog = useMemo(() => {
    let list = baseCatalog
    if (fixedDataType) list = list.filter(d => d.dataType === fixedDataType)
    else if (dataType) list = list.filter(d => d.dataType === dataType)
    if (dataUsage) {
      list = list.filter(d => (detailedDataUsage ? getDetailedUsage(d) === dataUsage : d.dataUsage === dataUsage))
    }
    if (dataFormat) list = list.filter(d => d.dataFormat === dataFormat)
    if (allowedFormats) list = list.filter(d => allowedFormats.has(d.dataFormat))
    if (trainingMethod) list = list.filter(d => matchesTrainingMethod(d, trainingMethod))
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(d => d.name.toLowerCase().includes(q))
    }
    return list
  }, [baseCatalog, fixedDataType, dataType, dataUsage, dataFormat, search, allowedFormats, detailedDataUsage, trainingMethod])

  const usageScope = useMemo(() => {
    let list = baseCatalog
    if (fixedDataType) list = list.filter(d => d.dataType === fixedDataType)
    else if (dataType) list = list.filter(d => d.dataType === dataType)
    return list
  }, [baseCatalog, fixedDataType, dataType])

  const formatScope = useMemo(() => {
    let list = baseCatalog
    if (fixedDataType) list = list.filter(d => d.dataType === fixedDataType)
    else if (dataType) list = list.filter(d => d.dataType === dataType)
    if (dataUsage) {
      list = list.filter(d => (detailedDataUsage ? getDetailedUsage(d) === dataUsage : d.dataUsage === dataUsage))
    }
    if (allowedFormats) list = list.filter(d => allowedFormats.has(d.dataFormat))
    if (trainingMethod) list = list.filter(d => matchesTrainingMethod(d, trainingMethod))
    return list
  }, [baseCatalog, fixedDataType, dataType, dataUsage, allowedFormats, detailedDataUsage, trainingMethod])

  const usageOptions = useMemo(() => {
    if (detailedDataUsage) {
      const values: DetailedDataUsage[] = ['文本生成 / SFT', '文本生成 / DPO', '文本生成 / RFT-PPO', '文本生成 / RFT-GRPO', '图像理解']
      const scopedValues = allowedDetailedUsages?.length ? values.filter(value => allowedDetailedUsages.includes(value)) : values
      const visibleValues = hideEmptyDetailedUsageOptions
        ? scopedValues.filter(value => usageScope.some(item => getDetailedUsage(item) === value))
        : scopedValues
      return [
        { value: '', label: '全部', count: usageScope.length },
        ...(hideDetailedUsageOptions ? [] : visibleValues.map(value => ({
          value,
          label: value,
          count: usageScope.filter(item => getDetailedUsage(item) === value).length,
        }))),
      ]
    }
    const text = usageScope.filter(d => d.dataUsage === '文本生成').length
    const vision = usageScope.filter(d => d.dataUsage === '图像理解').length
    return [
      { value: '', label: '全部', count: usageScope.length },
      { value: '文本生成', label: '文本生成', count: text },
      { value: '图像理解', label: '图像理解', count: vision },
    ]
  }, [allowedDetailedUsages, detailedDataUsage, hideDetailedUsageOptions, hideEmptyDetailedUsageOptions, usageScope])

  useEffect(() => {
    if (!dataUsage) return
    const allowed = new Set(usageOptions.map(option => option.value))
    if (!allowed.has(dataUsage)) {
      setDataUsage('')
    }
  }, [dataUsage, usageOptions])

  // dataFormat 超出范围时自动清除（单向监听 formatScope，避免无限循环）
  useEffect(() => {
    if (!dataFormat) return
    const allowed = new Set(formatScope.map(d => d.dataFormat))
    if (!allowed.has(dataFormat)) setDataFormat('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatScope]) // 不依赖 dataFormat，只在 formatScope 变化时检查

  const formatOptions = useMemo((): FormatOption[] => {
    const map = new Map<string, number>()
    for (const d of formatScope) {
      map.set(d.dataFormat, (map.get(d.dataFormat) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([fmt, count]) => ({ value: fmt, label: fmt, count }))
  }, [formatScope])

  const pagedList = useMemo(
    () => filteredCatalog.slice((page - 1) * pageSize, page * pageSize),
    [filteredCatalog, page],
  )
  const selectableKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const item of baseCatalog) {
      for (const version of item.versions) {
        keys.add(makeDatasetRowKey(item.id, version.id))
      }
    }
    return keys
  }, [baseCatalog])

  // ─── 操作 ───
  const toggleMulti = useCallback(
    (key: string, checked: boolean) => {
      if (excludeKeys.includes(key)) return
      setMultiSelected(prev => {
        const next = new Set(prev)
        if (checked) next.add(key)
        else next.delete(key)
        return next
      })
    },
    [excludeKeys],
  )

  const handleConfirm = useCallback(() => {
    if (mode === 'multiple') {
      const rows = Array.from(multiSelected)
        .filter(k => selectableKeys.has(k))
        .map(k => resolveDatasetVersionRow(k))
        .filter(Boolean) as SelectedDatasetVersionRow[]
      onConfirm(rows)
    } else {
      if (!singleSelected || !selectableKeys.has(singleSelected)) { onConfirm([]); return }
      const row = resolveDatasetVersionRow(singleSelected)
      onConfirm(row ? [row] : [])
    }
  }, [mode, multiSelected, onConfirm, selectableKeys, singleSelected])

  const totalCount = filteredCatalog.length
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, totalCount)

  // ─── 表格列定义 ───
  const columns = useMemo(
    () => [
      {
        title: '数据集名称',
        dataIndex: 'name',
        key: 'name',
        ellipsis: true as const,
      },
      {
        title: '最新版本',
        dataIndex: 'latestVersion',
        key: 'latestVersion',
        width: 110,
      },
      {
        title: '数据用途',
        dataIndex: 'dataUsage',
        key: 'dataUsage',
        width: 120,
        render: (u: DatasetPickerItem['dataUsage']) => (
          <Tag color={u === '图像理解' ? 'cyan' : 'blue'} style={{ margin: 0 }}>
            {u}
          </Tag>
        ),
      },
      {
        title: '数据格式',
        dataIndex: 'dataFormat',
        key: 'dataFormat',
        width: 170,
      },
    ],
    [],
  )

  return (
    <>
      {open && (
      <Modal
        title={title}
        open={open}
        onCancel={onCancel}
        width={960}
        footer={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {totalCount === 0
                ? '暂无数据集'
                : `显示 ${rangeStart} 到 ${rangeEnd} 共 ${totalCount} 个数据集`}
            </Text>
            <Space>
              <Button onClick={onCancel}>取消</Button>
              <Button type="primary" onClick={handleConfirm}>
                确定
              </Button>
            </Space>
          </div>
        }
      >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 30%) 1fr', gap: 20 }}>
        {/* ── 左侧筛选面板 ── */}
        <div
          style={{
            border: '1px solid #f0f0f0',
            borderRadius: 8,
            padding: 14,
            height: 'fit-content',
            background: '#fafafa',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <Text strong>筛选条件</Text>
            <Button
              type="link"
              size="small"
              style={{ padding: 0, height: 'auto' }}
              onClick={() => {
                setDataType(fixedDataType ?? defaultDataType ?? '')
                setDataUsage(defaultDataUsage ?? (detailedDataUsage ? '' : getDefaultDataUsage(trainingType)))
                setDataFormat('')
                setSearch('')
                setPage(1)
              }}
            >
              清除筛选
            </Button>
          </div>

          {/* 数据类型：有 fixedDataType 时只读展示，否则可切换 */}
          <div style={{ marginBottom: 18 }}>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 10 }}>
              数据类型
            </Text>
            {fixedDataType ? (
              <Text type="secondary">{fixedDataType}</Text>
            ) : (
              <Radio.Group
                value={dataType}
                onChange={e => {
                  setDataType(e.target.value)
                  setPage(1)
                }}
              >
                <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                  <Radio value="">
                    全部（{baseCatalog.length}）
                  </Radio>
                  {selectableDataTypes.map(t => (
                    <Radio key={t} value={t}>
                      {t}（{typeCounts[t] ?? 0}）
                    </Radio>
                  ))}
                </Space>
              </Radio.Group>
            )}
          </div>

          {/* 数据用途 */}
          <div style={{ marginBottom: 18 }}>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 10 }}>
              数据用途
            </Text>
            <Radio.Group
              value={dataUsage}
              onChange={e => {
                setDataUsage(e.target.value)
                setPage(1)
              }}
            >
              <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                {usageOptions.map(opt => (
                  <Radio key={opt.value || 'all'} value={opt.value}>
                    {opt.label}（{opt.count}）
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          </div>

          {/* 数据格式 */}
          <div>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 10 }}>
              数据格式
            </Text>
            <Radio.Group
              value={dataFormat}
              onChange={e => {
                setDataFormat(e.target.value)
                setPage(1)
              }}
            >
              <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                <Radio value="">
                  全部（{formatScope.length}）
                </Radio>
                {formatOptions.map(opt => (
                  <Radio key={opt.value} value={opt.value}>
                    {opt.label}（{opt.count}）
                  </Radio>
                ))}
              </Space>
            </Radio.Group>
          </div>
        </div>

        {/* ── 右侧数据集列表 ── */}
        <div>
          {dataScopeHint ? (
            <Alert
              type="info"
              showIcon
              message={dataScopeHint}
              style={{ borderRadius: 10, marginBottom: 12 }}
            />
          ) : null}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
              gap: 12,
            }}
          >
            <Text strong style={{ fontSize: 14 }}>
              数据集列表
            </Text>
          </div>

          <div style={{ marginBottom: 12 }}>
            <Input
              allowClear
              placeholder="搜索数据集名称"
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              value={search}
              onChange={e => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>

          <Table<DatasetPickerItem>
            size="small"
            rowKey="id"
            columns={columns}
            dataSource={pagedList}
            pagination={false}
            locale={{
              emptyText: (
                <div style={{ padding: '18px 0' }}>
                  <Text type="secondary">{emptyText}</Text>
                  {emptyDescription ? (
                    <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
                      {emptyDescription}
                    </Text>
                  ) : null}
                </div>
              ),
            }}
            onRow={record => ({
              style: { cursor: 'pointer' },
              onClick: () => {
                setExpandedIds(prev => {
                  const next = new Set(prev)
                  if (next.has(record.id)) next.delete(record.id)
                  else next.add(record.id)
                  return next
                })
              },
            })}
            expandable={{
              expandedRowKeys: Array.from(expandedIds),
              expandIconColumnIndex: 0,
              expandIcon: ({ expanded, onExpand, record }) => (
                <Button
                  type="text"
                  size="small"
                  icon={expanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                  onClick={event => {
                    event.stopPropagation()
                    onExpand(record, event)
                  }}
                />
              ),
              onExpand: (expanded, record) => {
                setExpandedIds(prev => {
                  const next = new Set(prev)
                  if (expanded) next.add(record.id)
                  else next.delete(record.id)
                  return next
                })
              },
              expandedRowRender: record =>
                mode === 'single' ? (
                  <div style={{ padding: '10px 16px 14px', background: '#f8fafc', borderRadius: 10 }}>
                    <Radio.Group
                      value={singleSelected ?? undefined}
                      onChange={e => setSingleSelected(e.target.value)}
                    >
                      <Space orientation="vertical" size={10} onClick={event => event.stopPropagation()}>
                        {record.versions.map(v => {
                          const key = makeDatasetRowKey(record.id, v.id)
                          return (
                            <Radio key={v.id} value={key}>
                              <Text strong>{v.label}</Text>
                              <Text
                                type="secondary"
                                style={{ marginLeft: 12, fontSize: 12 }}
                              >
                                数据量 {v.sampleCount.toLocaleString()}
                              </Text>
                            </Radio>
                          )
                        })}
                      </Space>
                    </Radio.Group>
                  </div>
                ) : (
                  <div style={{ padding: '4px 8px 8px' }}>
                    <Space orientation="vertical" size={8}>
                      {record.versions.map(v => {
                        const key = makeDatasetRowKey(record.id, v.id)
                        const excluded = excludeKeys.includes(key)
                        return (
                          <div
                            key={v.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              opacity: excluded ? 0.45 : 1,
                            }}
                          >
                            <Checkbox
                              disabled={excluded}
                              checked={multiSelected.has(key)}
                              onChange={e => toggleMulti(key, e.target.checked)}
                            >
                              {v.label}
                            </Checkbox>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              数据量 {v.sampleCount.toLocaleString()}
                            </Text>
                            {excluded && (
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                已添加
                              </Text>
                            )}
                          </div>
                        )
                      })}
                    </Space>
                  </div>
                ),
            }}
          />

          {totalCount > pageSize && (
            <div style={{ textAlign: 'right', marginTop: 12 }}>
              <Button
                size="small"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                style={{ marginRight: 8 }}
              >
                上一页
              </Button>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {page} / {Math.ceil(totalCount / pageSize)}
              </Text>
              <Button
                size="small"
                disabled={page >= Math.ceil(totalCount / pageSize)}
                onClick={() => setPage(p => p + 1)}
                style={{ marginLeft: 8 }}
              >
                下一页
              </Button>
            </div>
          )}
        </div>
      </div>
    </Modal>
      )}
    </>
  )
}

export default DatasetSelectModal
