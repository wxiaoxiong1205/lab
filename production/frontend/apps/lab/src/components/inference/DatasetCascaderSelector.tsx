import { Alert, Button, Form, Input, Modal, Pagination, Space, Spin, Table, Tag, message } from 'antd'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CloseCircleFilled, DownOutlined, InfoCircleFilled, SearchOutlined } from '@ant-design/icons'
import { useParams } from 'react-router-dom'
import { useDebounceFn } from 'ahooks'
import { type DatasetCascaderSelectorProps, type TrainingMultiPick, formatUsageLabel } from './DatasetCascaderSelectorShared.ts'
import { DatasetCascaderFiltersSidebar } from './DatasetCascaderFiltersSidebar'
import { buildDatasetListColumns } from './DatasetCascaderTableColumns'
import { buildTrainingPickSelectedOptions, createDatasetToInferFieldValidator, handleNoVersionInferenceDatasetRowClick, inferTrainingDatasetItemFromVersionData, isNoVersionInferenceUsage, normalizeInferenceItemToTrainingRow, parseRowKey, reconcileTrainingMultiPicksWithListData, rowKeyOf } from './datasetCascaderSelectorUtils'
import { DatasetExpandedVersionOpCell, type ExpandedVersionTableRow } from './DatasetExpandedVersionOpCell'
import './DatasetCascaderSelector.css'
import { type AttrOptions, DatasetFilter, type DatasetStatsQuery, type FilterItem, type FilterOptions, type Options } from '@/services/datasetFilter'
import { trainingDatasetService } from '@/services/trainingApi'
import type { TrainingDatasetItem } from '@/types/training'
import { useSystemSetting } from '@/hooks/system/systemSetting'
/**
 * 待推理数据集选择：弹窗 + 左侧筛选 + 右侧列表与版本选择（与级联选择器表单值兼容）
 */
const DatasetCascaderSelector: React.FC<DatasetCascaderSelectorProps> = ({ form, onChange, loading: parentLoading, label = '待推理数据', fieldName = 'data_to_infer', statsQuery, includeAllStatsDatasetFormats, fixedListUsage, listDatasetType, disabled: triggerDisabled, requiredSelection = true, placeholder = '请选择数据集分类、数据集和版本', modalTitle = '选择待推理数据集', selectButtonText = '+ 选择', projectIdOverride, useInferenceResultApi = false, inferenceDisplayName, inferenceMultiSelect = false, trainingDatasetMultiSelect = false, trainingMultiSelectMax = 3, hideStatsDatasetTypeAndFormatFilters = false, onModalOpenChange }) => {
  /** 仅当显式传入 boolean 时使用（部分页面误传整个 dataLoading 对象，需忽略） */
  const parentBusy = parentLoading === true
  const { projectId: routeProjectId } = useParams()
  const pid = projectIdOverride != null && !Number.isNaN(Number(projectIdOverride))
    ? Number(projectIdOverride)
    : routeProjectId && !Number.isNaN(Number(routeProjectId))
      ? Number(routeProjectId)
      : NaN
  const listUsage = fixedListUsage ?? undefined
  const { allMenuList } = useSystemSetting() // 所有菜单code数组
  const usageList = useMemo(() => {
    const list: string[] = []
    if (allMenuList.includes('test_management')) {
      list.push('test')
    }
    if (allMenuList.includes('training_management')) {
      list.push('training')
      list.push('validation')
    }
    return list
  }, [allMenuList])
  const resolvedStatsQuery = useMemo((): DatasetStatsQuery => {
    const usage = statsQuery?.usage !== undefined && statsQuery.usage.length > 0
      ? statsQuery.usage
      : [...usageList]
    const q: DatasetStatsQuery = {
      processing_status: statsQuery?.processing_status ?? 'completed',
      usage,
    }
    if (statsQuery?.dataset_type?.length) {
      q.dataset_type = statsQuery.dataset_type
    }
    if (statsQuery?.training_method_type?.length) {
      q.training_method_type = statsQuery.training_method_type
    }
    if (statsQuery?.dataset_format?.length) {
      q.dataset_format = statsQuery.dataset_format
    }
    else if (includeAllStatsDatasetFormats === false) {
      q.dataset_format = ['prompt-response', 'role-based']
    }
    return q
  }, [includeAllStatsDatasetFormats, statsQuery, usageList])

  /** 父组件通过 statsQuery 限定数据用途/格式时，弹窗内不再提供对应筛选，列表与 stats 与父选择一致 */
  const parentLocksDatasetTypeFilter = Boolean(statsQuery?.dataset_type?.length)
  const parentLocksDatasetFormatFilter = Boolean(statsQuery?.dataset_format?.length)
  const [open, setOpen] = useState(false)
  const [stats, setStats] = useState<FilterOptions | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const attrGroups: AttrOptions[] = useMemo(() => stats?.attr_option ?? [], [stats?.attr_option])
  const datasetTypeOptions = useMemo(() => stats?.dataset_type ?? [], [stats?.dataset_type])
  const datasetFormatOptions = useMemo(() => stats?.dataset_format ?? [], [stats?.dataset_format])
  const defaultDatasetFormatPick = useMemo(() => {
    if (hideStatsDatasetTypeAndFormatFilters || parentLocksDatasetFormatFilter) {
      return undefined
    }
    return datasetFormatOptions[0]?.value
  }, [datasetFormatOptions, hideStatsDatasetTypeAndFormatFilters, parentLocksDatasetFormatFilter])
  const shouldKeepDatasetFormatSelected = !hideStatsDatasetTypeAndFormatFilters && !parentLocksDatasetFormatFilter

  const usageRadioOptions = useMemo(() => {
    const source: FilterItem[] = stats?.usage?.length
      ? stats.usage
      : resolvedStatsQuery.usage.map((v) => ({ value: v }))
    const items = source.map((it: FilterItem) => {
      const title = formatUsageLabel(it.value)
      return {
        value: it.value,
        label: typeof it.count === 'number' ? `${title} (${it.count})` : title,
      }
    })
    return items
  }, [stats, resolvedStatsQuery.usage])
  const resolveUsageLabel = useCallback((usage: string) => {
    if (!usage)
      return '全部'
    return formatUsageLabel(usage)
  }, [])
  const defaultUsageFilter = useMemo(() => (fixedListUsage ?? resolvedStatsQuery.usage[resolvedStatsQuery.usage.length - 1] ?? ''), [fixedListUsage, resolvedStatsQuery.usage])
  const [usageFilter, setUsageFilter] = useState<string>('')
  const noVersionInferenceMode = useMemo(() => useInferenceResultApi && isNoVersionInferenceUsage(fixedListUsage ?? usageFilter), [useInferenceResultApi, fixedListUsage, usageFilter])
  const [datasetTypePick, setDatasetTypePick] = useState<string | undefined>()
  const [datasetFormatPick, setDatasetFormatPick] = useState<string | undefined>()
  const [attrNamePick, setAttrNamePick] = useState<string | undefined>()
  const [attrValuePick, setAttrValuePick] = useState<string | undefined>()
  const [searchName, setSearchName] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const { run: debounceSearch } = useDebounceFn((v: string) => setDebouncedSearch(v), { wait: 300 })
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [listLoading, setListLoading] = useState(false)
  const [listData, setListData] = useState<TrainingDatasetItem[]>([])
  const [total, setTotal] = useState(0)
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([])
  const [versionsByKey, setVersionsByKey] = useState<Record<string, any[]>>({})
  const [versionsLoading, setVersionsLoading] = useState<Record<string, boolean>>({})
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null)
  const [selectedInferenceRowKeys, setSelectedInferenceRowKeys] = useState<string[]>([])
  const [selectedVersionByRow, setSelectedVersionByRow] = useState<Record<string, string>>({})
  const [selectedDatasetRecord, setSelectedDatasetRecord] = useState<TrainingDatasetItem | null>(null)
  const [trainingMultiPicks, setTrainingMultiPicks] = useState<TrainingMultiPick[]>([])
  /** 推理结果多选：表单里存 id，切换「数据类型」后当前 list 可能不含该行，用 ref 保留 id→rowKey 以便回显勾选不丢 */
  const inferenceResultIdToRowKeyRef = useRef<Record<number, string>>({})
  const dataToInferFieldRules = useMemo(() => requiredSelection
    ? [
        {
          validator: createDatasetToInferFieldValidator({
            trainingDatasetMultiSelect,
            useInferenceResultApi,
            trainingMultiSelectMax,
            noVersionInferenceMode,
          }),
        },
      ]
    : [], [
    requiredSelection,
    trainingDatasetMultiSelect,
    useInferenceResultApi,
    trainingMultiSelectMax,
    noVersionInferenceMode,
  ])
  const displayValue = Form.useWatch(fieldName, form) as unknown
  const displayText = useMemo(() => {
    if (trainingDatasetMultiSelect && !useInferenceResultApi) {
      if (!Array.isArray(displayValue) || displayValue.length === 0)
        return ''
      const first = (displayValue as unknown[])[0]
      if (!Array.isArray(first))
        return ''
      const rows = displayValue as string[][]
      return rows
        .filter((t) => Array.isArray(t) && t.length >= 3)
        .map((t) => {
          const [u, name, ver] = t
          return `${resolveUsageLabel(u)} / ${name} / ${ver}`
        })
        .join('；')
    }
    if (useInferenceResultApi) {
      if (typeof displayValue === 'number' && displayValue > 0) {
        if (inferenceDisplayName)
          return inferenceDisplayName
        const selected = listData.find((item) => Number(item?.id) === Number(displayValue))
        return selected?.dataset_name ?? ''
      }
      if (Array.isArray(displayValue) && displayValue.length > 0 && typeof displayValue[0] === 'number') {
        return inferenceDisplayName || `已选 ${displayValue.length} 个推理结果集`
      }
    }
    if (!Array.isArray(displayValue) || displayValue.length < 2)
      return ''
    const [u, name, ver] = displayValue as string[]
    if (ver) {
      return `${resolveUsageLabel(u)} / ${name} / ${ver}`
    }
    return `${resolveUsageLabel(u)} / ${name}`
  }, [displayValue, resolveUsageLabel, useInferenceResultApi, listData, inferenceDisplayName, trainingDatasetMultiSelect])
  useEffect(() => {
    if (!open || !selectedRowKey)
      return
    const { usage, datasetName } = parseRowKey(selectedRowKey)
    const r = listData.find((d) => d.usage === usage && d.dataset_name === datasetName)
    if (r)
      setSelectedDatasetRecord(r)
  }, [open, listData, selectedRowKey])
  /** 多选推理结果集：根据表单已确认的值回显勾选（仅当有 id；列表筛选变化时用 ref 兜底 rowKey）。须排在下方「维护 ref」effect 之前，避免 keys 尚为空时把 ref 清空。 */
  useEffect(() => {
    if (!open || !useInferenceResultApi || !inferenceMultiSelect || !noVersionInferenceMode)
      return
    if (listData.length === 0)
      return
    const v = displayValue
    const ids: number[] = Array.isArray(v)
      ? v.filter((x): x is number => typeof x === 'number' && x > 0)
      : (typeof v === 'number' && v > 0 ? [v] : [])
    if (ids.length === 0)
      return
    const ref = inferenceResultIdToRowKeyRef.current
    for (const id of Object.keys(ref).map(Number)) {
      if (!ids.includes(id))
        delete ref[id]
    }
    const keys: string[] = []
    for (const id of ids) {
      const row = listData.find((d) => Number(d.id) === Number(id))
      if (row) {
        const rk = rowKeyOf(String(row.usage), row.dataset_name)
        ref[id] = rk
        keys.push(rk)
      }
      else {
        const rk = ref[id]
        if (rk)
          keys.push(rk)
      }
    }
    setSelectedInferenceRowKeys(keys)
  }, [open, listData, useInferenceResultApi, inferenceMultiSelect, noVersionInferenceMode, displayValue])
  /** 多选推理结果集：勾选变化时维护 id→rowKey，避免切换筛选后当前页列表里暂时没有该行 */
  useEffect(() => {
    if (!open || !useInferenceResultApi || !inferenceMultiSelect)
      return
    const ref = inferenceResultIdToRowKeyRef.current
    for (const id of Object.keys(ref).map(Number)) {
      const rk = ref[id]
      if (!rk || !selectedInferenceRowKeys.includes(rk))
        delete ref[id]
    }
    for (const rk of selectedInferenceRowKeys) {
      const { usage, datasetName } = parseRowKey(rk)
      const row = listData.find((d) => d.usage === usage && d.dataset_name === datasetName)
      if (row?.id != null)
        ref[Number(row.id)] = rk
    }
  }, [open, useInferenceResultApi, inferenceMultiSelect, selectedInferenceRowKeys, listData])
  const loadStats = useCallback(async () => {
    if (!Number.isFinite(pid))
      return
    setStatsLoading(true)
    try {
      const data = useInferenceResultApi
        ? await DatasetFilter.statsInferenceResult(pid, resolvedStatsQuery)
        : await DatasetFilter.stats(pid, resolvedStatsQuery)
      setStats(data)
    }
    catch (e) {
      console.error(e)
      message.error('加载筛选条件失败')
    }
    finally {
      setStatsLoading(false)
    }
  }, [pid, resolvedStatsQuery, useInferenceResultApi])
  const buildFilterParams = useCallback((): Options => {
    const parentScopedType
      = listDatasetType
        ?? (statsQuery?.dataset_type?.length === 1 ? statsQuery.dataset_type![0] : '')
        ?? ''
    const parentScopedFormat
      = statsQuery?.dataset_format?.length === 1 ? statsQuery.dataset_format![0] : undefined
    const parentScopedTrainingMethod
      = statsQuery?.training_method_type?.length === 1 ? statsQuery.training_method_type[0] : undefined

    const params: Options = {
      page,
      size: pageSize,
      processing_status: 'completed',
      usage: listUsage ?? (usageFilter ?? ''),
      training_method_type: parentScopedTrainingMethod,
      dataset_type: hideStatsDatasetTypeAndFormatFilters
        ? (listDatasetType ?? '')
        : (parentLocksDatasetTypeFilter
            ? parentScopedType
            : (datasetTypePick ?? (listDatasetType ?? ''))),
    }
    if (debouncedSearch) {
      params.name = debouncedSearch
    }
    if (!hideStatsDatasetTypeAndFormatFilters) {
      const fmt = parentLocksDatasetFormatFilter ? parentScopedFormat : datasetFormatPick
      if (fmt) {
        params.dataset_format = fmt
      }
    }
    if (attrNamePick && attrValuePick) {
      params.attr_name = attrNamePick
      params.option_value = attrValuePick
    }
    return params
  }, [
    debouncedSearch,
    page,
    pageSize,
    usageFilter,
    listUsage,
    listDatasetType,
    datasetTypePick,
    datasetFormatPick,
    attrNamePick,
    attrValuePick,
    hideStatsDatasetTypeAndFormatFilters,
    statsQuery?.dataset_type,
    statsQuery?.dataset_format,
    statsQuery?.training_method_type,
    parentLocksDatasetTypeFilter,
    parentLocksDatasetFormatFilter,
  ])
  const loadList = useCallback(async () => {
    if (!Number.isFinite(pid))
      return
    setListLoading(true)
    try {
      if (useInferenceResultApi) {
        const res = await DatasetFilter.listInferenceResult(pid, buildFilterParams())
        console.log('res,', res)
        const rows = (res.items ?? []).map((item) => normalizeInferenceItemToTrainingRow(item))
        setListData(rows)
        setTotal(res.total ?? 0)
      }
      else {
        const res = await DatasetFilter.list(pid, buildFilterParams())
        setListData(res.items ?? [])
        setTotal(res.total ?? 0)
      }
    }
    catch (e) {
      console.error(e)
      message.error('加载数据集列表失败')
    }
    finally {
      setListLoading(false)
    }
  }, [pid, buildFilterParams, useInferenceResultApi])
  useEffect(() => {
    if (open) {
      loadStats()
    }
  }, [open, loadStats])
  useEffect(() => {
    if (!open) return
    if (shouldKeepDatasetFormatSelected && !stats) return
    if (
      shouldKeepDatasetFormatSelected
      && defaultDatasetFormatPick
      && !datasetFormatOptions.some((item) => item.value === datasetFormatPick)
    ) {
      return
    }
    loadList()
  }, [
    open,
    loadList,
    shouldKeepDatasetFormatSelected,
    stats,
    defaultDatasetFormatPick,
    datasetFormatOptions,
    datasetFormatPick,
  ])

  useEffect(() => {
    if (!open) return
    if (!defaultDatasetFormatPick) return
    if (datasetFormatPick && datasetFormatOptions.some((item) => item.value === datasetFormatPick)) return
    setDatasetFormatPick(defaultDatasetFormatPick)
  }, [open, defaultDatasetFormatPick, datasetFormatOptions, datasetFormatPick])

  const clearSidebarFilters = () => {
    setUsageFilter(defaultUsageFilter)
    setDatasetTypePick(undefined)
    setDatasetFormatPick(defaultDatasetFormatPick)
    setAttrNamePick(undefined)
    setAttrValuePick(undefined)
    setPage(1)
  }
  const openModal = () => {
    setOpen(true)
    onModalOpenChange?.(true)
    setUsageFilter(defaultUsageFilter)
    setDatasetFormatPick(defaultDatasetFormatPick)
    setSearchName('')
    setDebouncedSearch('')
    setPage(1)
    setExpandedRowKeys([])
    if (useInferenceResultApi && inferenceMultiSelect) {
      inferenceResultIdToRowKeyRef.current = {}
      setSelectedRowKey(null)
      setSelectedVersionByRow({})
      setSelectedDatasetRecord(null)
      setSelectedInferenceRowKeys([])
      setTrainingMultiPicks([])
      return
    }
    if (trainingDatasetMultiSelect && !useInferenceResultApi) {
      setSelectedRowKey(null)
      setSelectedVersionByRow({})
      setSelectedDatasetRecord(null)
      const v = form.getFieldValue(fieldName) as unknown
      if (Array.isArray(v) && v.length > 0 && Array.isArray((v as unknown[])[0])) {
        const tuples = v as string[][]
        const picks: TrainingMultiPick[] = tuples
          .filter((t) => Array.isArray(t) && t.length >= 3)
          .map(([usage, name, ver]) => {
            const rk = rowKeyOf(usage, name)
            return {
              pickKey: `${rk}::${ver}`,
              rk,
              usage,
              datasetName: name,
              version: ver,
              versionData: null,
              record: null,
            }
          })
        setTrainingMultiPicks(picks)
        setExpandedRowKeys([...new Set(picks.map((p) => p.rk))])
      }
      else {
        setTrainingMultiPicks([])
        setExpandedRowKeys([])
      }
      return
    }
    setTrainingMultiPicks([])
    const v = form.getFieldValue(fieldName) as string[] | undefined
    if (v && v.length >= 2) {
      const [u, name, ver] = v
      const rk = rowKeyOf(u, name)
      setSelectedRowKey(rk)
      setSelectedVersionByRow(ver ? { [rk]: ver } : {})
    }
    else {
      setSelectedRowKey(null)
      setSelectedVersionByRow({})
      setSelectedDatasetRecord(null)
    }
  }
  const closeModal = () => {
    setOpen(false)
    onModalOpenChange?.(false)
  }
  const clearSelection = () => {
    form.setFieldsValue({ [fieldName]: undefined })
    onChange?.(undefined, [])
    setSelectedRowKey(null)
    setSelectedInferenceRowKeys([])
    setSelectedVersionByRow({})
    setSelectedDatasetRecord(null)
    setTrainingMultiPicks([])
    inferenceResultIdToRowKeyRef.current = {}
  }
  const loadVersionsForDataset = useCallback(async (usage: string, name: string) => {
    const rk = rowKeyOf(usage, name)
    if (versionsByKey[rk]?.length)
      return versionsByKey[rk]
    if (!Number.isFinite(pid))
      return []
    setVersionsLoading((m) => ({ ...m, [rk]: true }))
    try {
      const raw = await trainingDatasetService.detail(pid, name, usage, 'completed')
      const list = Array.isArray(raw) ? raw : [raw]
      const children = list.map((ver: any) => ({
        value: ver.version,
        label: ver.version,
        isLeaf: true,
        versionData: ver,
        total_samples: ver.total_samples,
      }))
      setVersionsByKey((prev) => ({ ...prev, [rk]: children }))
      return children
    }
    catch (e) {
      console.error(e)
      message.error('加载版本列表失败')
      return []
    }
    finally {
      setVersionsLoading((m) => ({ ...m, [rk]: false }))
    }
  }, [pid, versionsByKey])

  const ensureVersions = async (record: TrainingDatasetItem) => {
    await loadVersionsForDataset(record.usage as string, record.dataset_name)
  }
  /** 训练数据多选：展开行加载版本列表 */
  useEffect(() => {
    if (!open || !trainingDatasetMultiSelect || useInferenceResultApi)
      return
    for (const rk of expandedRowKeys) {
      const { usage, datasetName } = parseRowKey(rk)
      const rec = listData.find((d) => d.usage === usage && d.dataset_name === datasetName)
      if (rec)
        void ensureVersions(rec)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ensureVersions 依赖 versionsByKey，仅用于懒加载
  }, [open, trainingDatasetMultiSelect, useInferenceResultApi, expandedRowKeys, listData])
  /** 列表刷新或切换「数据类型」后：补全 record，并移除已不在当前 listData 中的历史勾选 */
  useEffect(() => {
    if (!open || !trainingDatasetMultiSelect || useInferenceResultApi)
      return
    if (listLoading)
      return
    setTrainingMultiPicks((prev) => {
      if (!prev.length)
        return prev
      const next = reconcileTrainingMultiPicksWithListData(prev, listData)
      const unchanged = next.length === prev.length
        && next.every((q, i) => prev[i]
          && q.pickKey === prev[i].pickKey
          && q.record === prev[i].record
          && q.version === prev[i].version)
      return unchanged ? prev : next
    })
  }, [open, trainingDatasetMultiSelect, useInferenceResultApi, listData, listLoading])
  /** picks 被剔除后，同步收缩 expandedRowKeys，避免残留展开态 */
  useEffect(() => {
    if (!open || !trainingDatasetMultiSelect || useInferenceResultApi)
      return
    setExpandedRowKeys((keys) => {
      const next = keys.filter((rk) => trainingMultiPicks.some((p) => p.rk === rk))
      return next.length === keys.length && next.every((k, i) => k === keys[i]) ? keys : next
    })
  }, [open, trainingDatasetMultiSelect, useInferenceResultApi, trainingMultiPicks])
  const onExpand = async (expanded: boolean, record: TrainingDatasetItem) => {
    const rk = rowKeyOf(record.usage, record.dataset_name)
    if (expanded) {
      setExpandedRowKeys((k) => [...new Set([...k, rk])])
      await ensureVersions(record)
    }
    else {
      setExpandedRowKeys((k) => k.filter((x) => x !== rk))
    }
  }

  const toggleDatasetVersionExpand = (record: TrainingDatasetItem) => {
    const rk = rowKeyOf(record.usage, record.dataset_name)
    void onExpand(!expandedRowKeys.includes(rk), record)
  }

  const onConfirm = async () => {
    if (useInferenceResultApi && noVersionInferenceMode && inferenceMultiSelect) {
      if (selectedInferenceRowKeys.length === 0) {
        message.warning('请选择至少一个推理结果集')
        return
      }
      const records: TrainingDatasetItem[] = []
      const ids: number[] = []
      for (const rk of selectedInferenceRowKeys) {
        const { usage, datasetName } = parseRowKey(rk)
        const record = listData.find((d) => d.usage === usage && d.dataset_name === datasetName)
        if (record && record.id != null) {
          records.push(record)
          ids.push(Number(record.id))
        }
      }
      if (ids.length === 0) {
        message.warning('无法解析所选推理结果集')
        return
      }
      const value = ids.length === 1 ? ids[0] : ids
      form.setFieldsValue({ [fieldName]: value })
      onChange?.(value, records)
      setOpen(false)
      return
    }
    if (trainingDatasetMultiSelect && !useInferenceResultApi) {
      if (trainingMultiPicks.length === 0) {
        message.warning('请至少选择1个数据集')
        return
      }
      const payloads: any[][] = []
      const value: string[][] = []
      for (const p of trainingMultiPicks) {
        let versionEntry = versionsByKey[p.rk]?.find((c: any) => c.value === p.version)
        let versionData = versionEntry?.versionData ?? p.versionData
        if (!versionData?.id) {
          const versions = await loadVersionsForDataset(p.usage, p.datasetName)
          versionEntry = versions.find((c: any) => c.value === p.version)
          versionData = versionEntry?.versionData ?? p.versionData
        }
        if (!versionData?.id) {
          message.warning(`请展开数据集并等待「${p.datasetName}」版本列表加载完成`)
          return
        }
        const record = p.record
          ?? listData.find((d) => d.usage === p.usage && d.dataset_name === p.datasetName)
          ?? inferTrainingDatasetItemFromVersionData(p, versionData)
        payloads.push(buildTrainingPickSelectedOptions(p, record, versionData, resolveUsageLabel))
        value.push([p.usage, p.datasetName, p.version])
      }
      form.setFieldsValue({ [fieldName]: value })
      onChange?.(value, payloads as any)
      setOpen(false)
      return
    }
    if (!selectedRowKey) {
      message.warning('请选择数据集及版本')
      return
    }
    const { usage, datasetName } = parseRowKey(selectedRowKey)
    const record = selectedDatasetRecord
      ?? listData.find((d) => d.usage === usage && d.dataset_name === datasetName)
    const ver = selectedVersionByRow[selectedRowKey]
    const rk = selectedRowKey
    const versionEntry = ver ? versionsByKey[rk]?.find((c: any) => c.value === ver) : undefined
    const versionData = versionEntry?.versionData
    if (!noVersionInferenceMode && !ver) {
      message.warning('请选择数据集版本')
      return
    }
    const usageLabel = resolveUsageLabel(usage)
    const selectedOptions = [
      { label: usageLabel, value: usage },
      {
        label: datasetName,
        value: datasetName,
        datasetId: record?.id ?? datasetName,
        data: record,
        isLeaf: false,
      },
      ...(noVersionInferenceMode ? [] : [{ label: ver, value: ver, versionData }]),
    ]
    if (useInferenceResultApi && noVersionInferenceMode && !inferenceMultiSelect) {
      const selectedId = Number(record?.id)
      if (!selectedId || Number.isNaN(selectedId)) {
        message.warning('请选择有效的推理结果集')
        return
      }
      form.setFieldsValue({ [fieldName]: selectedId })
      onChange?.(selectedId, selectedOptions)
      setOpen(false)
      return
    }
    const value = noVersionInferenceMode ? [usage, datasetName] : [usage, datasetName, ver]
    form.setFieldsValue({ [fieldName]: value })
    onChange?.(value, selectedOptions)
    setOpen(false)
  }

  const bumpPage = useCallback(() => setPage(1), [])
  const columns = useMemo(() => buildDatasetListColumns({
    useInferenceResultApi,
    hideStatsDatasetTypeAndFormatFilters,
    noVersionInferenceMode,
    inferenceMultiSelect,
    selectedInferenceRowKeys,
    setSelectedInferenceRowKeys,
    selectedRowKey,
    setSelectedRowKey,
    setSelectedDatasetRecord,
  }), [
    useInferenceResultApi,
    hideStatsDatasetTypeAndFormatFilters,
    noVersionInferenceMode,
    inferenceMultiSelect,
    selectedInferenceRowKeys,
    setSelectedInferenceRowKeys,
    selectedRowKey,
    setSelectedRowKey,
    setSelectedDatasetRecord,
  ])
  const busy = parentBusy || statsLoading
  const isTriggerDisabled = Boolean(triggerDisabled || busy || resolvedStatsQuery.usage.length === 0)
  return (
    <Form.Item label={label === '' ? undefined : label} name={fieldName} rules={dataToInferFieldRules} required={requiredSelection}>
      <div className="inline-flex flex-col gap-1 max-w-full">
        <Space.Compact className="dataset-cascader-selector-trigger w-[400px]">
          <Input
            readOnly
            placeholder={placeholder}
            value={displayText}
            onClick={() => !isTriggerDisabled && openModal()}
          />
          {displayText && (
            <CloseCircleFilled
              aria-label="清空"
              className="dataset-cascader-selector-clear text-foreground-muted hover:text-foreground-primary cursor-pointer"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onClick={(e) => {
                e.stopPropagation()
                clearSelection()
              }}
            />
          )}
          <Button type="primary" onClick={openModal} loading={busy} disabled={isTriggerDisabled}>
            {selectButtonText}
          </Button>
        </Space.Compact>
        {resolvedStatsQuery.usage.length === 0 && (
          <div className="text-sm text-gray-500 pl-0.5 leading-normal">
            当前无可用数据集
          </div>
        )}
      </div>

      <Modal
        title={modalTitle}
        open={open}
        onCancel={closeModal}
        width={900}
        destroyOnClose
        classNames={{
          content: '!h-[800px] !p-5 !flex !flex-col',
          header: '!mb-4 !p-0 !shrink-0',
          body: '!p-0 !flex-1 !min-h-0',
          footer: '!mb-0 !mt-4 !p-0 !shrink-0',
        }}
        footer={(
          <div className="flex justify-end gap-[10px]">
            <Button onClick={closeModal} className="!h-[36px] !w-[80px] !border !border-button-border">取消</Button>
            <Button type="primary" onClick={onConfirm} className="!h-[36px] !w-[80px] !border !border-button-border">
              确定
            </Button>
          </div>
        )}
      >
        <div className="flex h-[624px] min-h-0">
          <DatasetCascaderFiltersSidebar statsLoading={statsLoading} clearSidebarFilters={clearSidebarFilters} fixedListUsage={fixedListUsage} usageFilter={usageFilter} setUsageFilter={setUsageFilter} usageRadioOptions={usageRadioOptions} hideStatsDatasetTypeAndFormatFilters={hideStatsDatasetTypeAndFormatFilters} parentLocksDatasetTypeFilter={parentLocksDatasetTypeFilter} parentLocksDatasetFormatFilter={parentLocksDatasetFormatFilter} datasetTypeOptions={datasetTypeOptions} datasetFormatOptions={datasetFormatOptions} datasetTypePick={datasetTypePick} setDatasetTypePick={setDatasetTypePick} datasetFormatPick={datasetFormatPick} setDatasetFormatPick={setDatasetFormatPick} attrGroups={attrGroups} attrNamePick={attrNamePick} attrValuePick={attrValuePick} setAttrNamePick={setAttrNamePick} setAttrValuePick={setAttrValuePick} bumpPage={bumpPage} />

          <div className="flex-1 w-[624px] flex flex-col ml-[20px] min-h-0">
            <Alert
              type="info"
              showIcon
              message="可选择数据集；训练/验证数据集中仅展示 SFT 版本。DPO/RFT 偏好或奖励数据不支持创建推理结果集。"
            />

            <div className="p-2">
              <div className="font-medium mb-[10px] flex flex-wrap items-center">
                <span>数据集列表</span>
                {trainingDatasetMultiSelect && !useInferenceResultApi && (
                  <span className="text-gray-500 text-sm font-normal">
                    已选
                    {' '}
                    {trainingMultiPicks.length}
                    /
                    {trainingMultiSelectMax}
                    （请展开行勾选版本，至少1个、最多
                    {trainingMultiSelectMax}
                    个）
                  </span>
                )}
              </div>
              <Input
                allowClear
                placeholder="搜索数据集名称"
                prefix={<SearchOutlined />}
                value={searchName}
                onChange={(e) => {
                  const v = e.target.value
                  setSearchName(v)
                  debounceSearch(v)
                  setPage(1)
                }}
                className="mb-3 !h-[36px] !w-[180px]"
              />
              <Spin spinning={listLoading}>
                <Table<TrainingDatasetItem>
                  size="small"
                  rowKey={(r) => rowKeyOf(r.usage, r.dataset_name)}
                  columns={columns}
                  dataSource={listData}
                  pagination={false}
                  scroll={{ x: 'max-content', y: 460 }}
                  className={[
                    '!w-[626px]',
                    // '[&_.ant-table-body]:!overflow-y-auto',
                    // '[&_.ant-table-tbody>tr:not(.ant-table-expanded-row):not(.ant-table-measure-row)]:!h-[46px]',
                  ].join(' ')}
                  onRow={(record) => ({
                    onClick: () => {
                      if (!noVersionInferenceMode) {
                        toggleDatasetVersionExpand(record)
                        return
                      }
                      handleNoVersionInferenceDatasetRowClick(record, {
                        inferenceMultiSelect,
                        setSelectedInferenceRowKeys,
                        setSelectedRowKey,
                        setSelectedDatasetRecord,
                      })
                    },
                  })}
                  expandable={noVersionInferenceMode
                    ? undefined
                    : {
                        expandedRowKeys,
                        onExpand,
                        expandIcon: ({ expanded, onExpand: triggerExpand, record }) => (
                          <button
                            type="button"
                            className="flex h-[22px] w-[22px] items-center justify-center border-0 bg-transparent p-0 text-foreground-muted cursor-pointer transition-transform"
                            onClick={(e) => {
                              e.stopPropagation()
                              triggerExpand(record, e)
                            }}
                            aria-label={expanded ? '收起版本' : '展开版本'}
                          >
                            <DownOutlined className={expanded ? '' : '-rotate-90'} />
                          </button>
                        ),
                        expandedRowRender: (record) => {
                          const rk = rowKeyOf(record.usage, record.dataset_name)
                          const loadingV = versionsLoading[rk]
                          const children = versionsByKey[rk] ?? []
                          return (
                            <div className="m-0 p-0">
                              <Spin spinning={!!loadingV}>
                                <Table
                                  size="small"
                                  pagination={false}
                                  rowKey={(row: any) => row.value}
                                  showHeader={false}
                                  className={[
                                    '[&_.ant-table-tbody>tr]:!h-[46px]',
                                    '[&_.ant-table-tbody>tr>td]:!bg-tag-gray',
                                    '[&_.ant-table-tbody>tr:hover>td]:!bg-tag-gray',
                                  ].join(' ')}
                                  columns={[
                                    {
                                      title: '',
                                      key: 'select',
                                      width: 68,
                                      render: (_, row: ExpandedVersionTableRow) => (
                                        <div className="flex h-[46px] items-center justify-center">
                                          <DatasetExpandedVersionOpCell row={row} rk={rk} record={record} showLabel={false} trainingDatasetMultiSelect={trainingDatasetMultiSelect} useInferenceResultApi={useInferenceResultApi} trainingMultiPicks={trainingMultiPicks} setTrainingMultiPicks={setTrainingMultiPicks} trainingMultiSelectMax={trainingMultiSelectMax} selectedRowKey={selectedRowKey} selectedVersionByRow={selectedVersionByRow} setSelectedRowKey={setSelectedRowKey} setSelectedDatasetRecord={setSelectedDatasetRecord} setSelectedVersionByRow={setSelectedVersionByRow} />
                                        </div>
                                      ),
                                    },
                                    {
                                      title: '版本',
                                      dataIndex: 'value',
                                      key: 'total_samples',
                                      width: 170,
                                      render: (value: string) => (
                                        <div className="flex h-[46px] items-center text-[14px] leading-5 text-foreground-primary">
                                          {`版本: ${value}`}
                                        </div>
                                      ),
                                    },
                                    {
                                      title: '数据量',
                                      dataIndex: 'total_samples',
                                      key: 'version',
                                      width: 170,
                                      render: (value?: number) => (
                                        <div className="flex h-[46px] items-center text-[14px] leading-5 text-foreground-primary">
                                          {`数据量: ${value ?? 0}`}
                                        </div>
                                      ),
                                    },
                                    {
                                      title: '操作',
                                      key: 'op',
                                      render: (_: unknown, row: ExpandedVersionTableRow) => {
                                        const checked = trainingDatasetMultiSelect && !useInferenceResultApi
                                          ? trainingMultiPicks.some((p) => p.rk === rk && p.version === row.value)
                                          : selectedRowKey === rk && selectedVersionByRow[rk] === row.value
                                        return (
                                          <div className="flex h-[46px] items-center text-[14px] leading-5 text-foreground-muted">
                                            {checked ? '已选此版本' : ''}
                                          </div>
                                        )
                                      },
                                    },
                                  ]}
                                  dataSource={children}
                                />
                              </Spin>
                            </div>
                          )
                        },
                      }}
                />
              </Spin>
              <div className="flex justify-end items-center mt-3 flex-wrap gap-2">
                <div className="[&_.ant-pagination-item]:!bg-transparent [&_.ant-pagination-item]:!border-transparent [&_.ant-pagination-item-active]:!border-background-numberSelected [&_.ant-pagination-item-active]:!bg-background-numberSelected [&_.ant-pagination-item-active_a]:!text-foreground-primary [&_.ant-pagination-item-active:hover]:!border-background-numberSelected [&_.ant-pagination-item-active:hover]:!bg-background-numberSelected [&_.ant-pagination-item-active:hover_a]:!text-foreground-primary">
                  <Pagination size="small" current={page} pageSize={pageSize} total={total} onChange={(p) => setPage(p)} showSizeChanger={false} />
                </div>
              </div>
            </div>

          </div>
        </div>
      </Modal>
    </Form.Item>
  )
}
export default DatasetCascaderSelector
