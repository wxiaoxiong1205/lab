import type { TrainingDatasetListResponse, getDataParams } from '@/types/training'

type PreviewDatasetVersion = Record<string, any>
type PreviewPreviewRow = { row_number: number, sample_data: Record<string, any> }

const now = '2026-06-25T18:00:00+08:00'

const attrValues = (scope: string, owner = '算法一组') => [
  {
    id: 9001,
    reference_id: 0,
    attr_id: 7001,
    name: '业务线',
    input_type: '下拉选择',
    attr_value: null,
    data_type: 'string',
    required_tag: 1,
    multi_select: 0,
    business_type: 'training_management',
    group: '基础属性',
    options: [{ option_value: scope, option_order: 0 }],
  },
  {
    id: 9002,
    reference_id: 0,
    attr_id: 7002,
    name: '数据负责人',
    input_type: '手动输入',
    attr_value: owner,
    data_type: 'string',
    required_tag: 0,
    multi_select: 0,
    business_type: 'training_management',
    group: '治理属性',
    options: [],
  },
  {
    id: 9003,
    reference_id: 0,
    attr_id: 7003,
    name: '敏感级别',
    input_type: '下拉选择',
    attr_value: null,
    data_type: 'string',
    required_tag: 1,
    multi_select: 1,
    business_type: 'training_management',
    group: '治理属性',
    options: [{ option_value: '内部' }, { option_value: '脱敏' }],
  },
]

const version = (params: Partial<PreviewDatasetVersion> & {
  id: number
  name: string
  version: string
  usage: 'training' | 'test' | 'validation' | 'business_test'
  publish: number
  processing_status: 'pending' | 'completed' | 'failed'
}): PreviewDatasetVersion => {
  const processingDisplayMap = {
    pending: '处理中',
    completed: '处理完成',
    failed: '处理失败',
  } as const
  const publishDisplayMap: Record<number, string> = {
    0: '未发布',
    1: '已发布',
    2: '-',
    3: '-',
  }
  const processingStatusDisplay = processingDisplayMap[params.processing_status]
  const publishDisplay = publishDisplayMap[params.publish] || '-'
  const statusDisplay = params.processing_status === 'completed'
    ? publishDisplay
    : processingStatusDisplay

  return {
    project_id: 1001,
    description: 'V1.14 showcase 演示数据',
    dataset_type: 'text-generation',
    training_method_type: 'sft',
    dataset_format: 'role-based',
    usage: params.usage,
    dataset_config: {},
    metadata_fields: ['messages', 'category', 'difficulty'],
    total_samples: 4,
    total_characters: 1200,
    file_size: 1.28,
    file_size_display: '1.28 MB',
    dataset_path: `/preview/${params.usage}/${params.name}/${params.version}.jsonl`,
    processing_status_display: processingStatusDisplay,
    status_display: statusDisplay,
    publish_display: publishDisplay,
    processing_error: params.processing_status === 'failed' ? '演示：字段 category 缺失，解析失败' : undefined,
    created_at: now,
    updated_at: now,
    created_by: 'showcase_admin',
    is_published: params.publish === 1,
    attr_values: attrValues(params.usage === 'test' ? '效果评估' : '客服训练'),
    ...params,
  }
}

const datasetVersions: PreviewDatasetVersion[] = [
  version({
    id: 91001,
    name: 'showcase-客服SFT多状态数据',
    version: 'V1',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    description: '已发布源版本，可被新增/继承/合并选择',
  }),
  version({
    id: 91002,
    name: 'showcase-客服SFT多状态数据',
    version: 'V2',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    description: '已发布前置版本，用于验证已发布后才允许继续创建下一版本',
  }),
  version({
    id: 91003,
    name: 'showcase-客服SFT多状态数据',
    version: 'V3',
    usage: 'training',
    publish: 2,
    processing_status: 'pending',
    description: '最新版本创建中，列表展示“创建中”，详情操作置灰',
  }),
  version({
    id: 91011,
    name: 'showcase-来源展示与单条删除',
    version: 'V1',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    description: '合并演示 V1',
  }),
  version({
    id: 91012,
    name: 'showcase-来源展示与单条删除',
    version: 'V2',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    description: '合并演示 V2',
  }),
  version({
    id: 91013,
    name: 'showcase-来源展示与单条删除',
    version: 'V3',
    usage: 'training',
    publish: 0,
    processing_status: 'completed',
    description: '由 V1 与 V2 合并生成，未发布，允许删除单条数据',
    dataset_config: {
      data_source_type: 'merge',
      merge_source_versions: ['V1', 'V2'],
    },
    active_operation: {
      operation_id: 'preview-delete-running-91013',
      dataset_kind: 'llm_dataset',
      dataset_id: 91013,
      version: 'V3',
      operation_type: 'delete_rows',
      status: 'running',
      row_numbers: [2],
      requested_count: 1,
      removed_count: 0,
      updated_at: now,
    },
    attr_values: attrValues('客服训练', '数据治理演示组'),
  }),
  version({
    id: 91021,
    name: 'showcase-继承本地上传展示',
    version: 'V1',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    description: '继承演示 V1',
  }),
  version({
    id: 91022,
    name: 'showcase-继承本地上传展示',
    version: 'V2',
    usage: 'training',
    publish: 0,
    processing_status: 'completed',
    description: '继承 V1 后追加本地上传文件生成，未发布，允许删除单条数据',
    dataset_config: {
      data_source_type: 'inherit_upload',
      inherit_source_version: 'V1',
      has_uploaded_files: true,
    },
  }),
  version({
    id: 91041,
    name: 'showcase-单条删除失败演示',
    version: 'V1',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
    description: '删除失败演示的已发布来源版本',
  }),
  version({
    id: 91042,
    name: 'showcase-单条删除失败演示',
    version: 'V2',
    usage: 'training',
    publish: 0,
    processing_status: 'completed',
    description: '未发布版本，单条删除后台任务失败，目标行恢复正常展示',
    dataset_config: {
      data_source_type: 'inherit',
      inherit_source_version: 'V1',
    },
    active_operation: {
      operation_id: 'preview-delete-failed-91042',
      dataset_kind: 'llm_dataset',
      dataset_id: 91042,
      version: 'V2',
      operation_type: 'delete_rows',
      status: 'failed',
      row_numbers: [2],
      requested_count: 1,
      removed_count: 0,
      error_message: '目标数据已变化，请刷新后重试',
      updated_at: now,
    },
    attr_values: attrValues('客服训练', '数据治理演示组'),
  }),
  version({
    id: 91031,
    name: 'showcase-创建失败数据',
    version: 'V1',
    usage: 'training',
    publish: 1,
    processing_status: 'completed',
  }),
  version({
    id: 91032,
    name: 'showcase-创建失败数据',
    version: 'V2',
    usage: 'training',
    publish: 3,
    processing_status: 'failed',
    description: '最新版本创建失败，列表展示“创建失败”',
  }),
  version({
    id: 92001,
    name: 'showcase-测试数据发布态',
    version: 'V1',
    usage: 'test',
    publish: 1,
    processing_status: 'completed',
    description: '测试数据已发布来源',
  }),
  version({
    id: 92002,
    name: 'showcase-测试数据发布态',
    version: 'V2',
    usage: 'test',
    publish: 0,
    processing_status: 'completed',
    description: '测试数据未发布版本，允许删除单条数据',
    dataset_config: {
      data_source_type: 'inherit',
      inherit_source_version: 'V1',
    },
    active_operation: {
      operation_id: 'preview-delete-failed-92002',
      dataset_kind: 'llm_dataset',
      dataset_id: 92002,
      version: 'V2',
      operation_type: 'delete_rows',
      status: 'failed',
      row_numbers: [3],
      requested_count: 1,
      removed_count: 0,
      error_message: '目标数据已变化，请刷新后重试',
      updated_at: now,
    },
    attr_values: attrValues('效果评估', '评估团队'),
  }),
  version({
    id: 92011,
    name: 'showcase-测试数据创建中',
    version: 'V1',
    usage: 'test',
    publish: 2,
    processing_status: 'pending',
    description: '测试数据创建中',
  }),
  version({
    id: 92021,
    name: 'showcase-测试数据创建失败',
    version: 'V1',
    usage: 'test',
    publish: 3,
    processing_status: 'failed',
    description: '测试数据创建失败',
  }),
]

const previewRowsByVersionId = new Map<number, PreviewPreviewRow[]>(
  datasetVersions.map((item) => [
    item.id,
    [
      {
        row_number: 1,
        sample_data: {
          messages: [
            { role: 'system', content: '你是企业客服助手。' },
            { role: 'user', content: `请说明 ${item.name} ${item.version} 的用途。` },
          ],
          chosen: { role: 'assistant', content: '用于覆盖 V1.14 showcase 中的数据创建态、发布态和来源展示。' },
          rejected: { role: 'assistant', content: '这是普通样例。' },
          category: item.usage === 'test' ? '效果评估' : '客服问答',
          difficulty: '中',
        },
      },
      {
        row_number: 2,
        sample_data: {
          messages: [
            { role: 'user', content: '未发布版本可以做什么？' },
          ],
          chosen: { role: 'assistant', content: '未发布版本允许删除单条数据，发布后明细锁定。' },
          rejected: { role: 'assistant', content: '可以随意改。' },
          category: '发布态',
          difficulty: '低',
        },
      },
      {
        row_number: 3,
        sample_data: {
          messages: [
            { role: 'user', content: '新增/继承/合并版本的来源范围是什么？' },
          ],
          chosen: { role: 'assistant', content: '只展示已发布版本作为来源。' },
          rejected: { role: 'assistant', content: '所有历史版本都可以。' },
          category: '来源版本',
          difficulty: '高',
        },
      },
    ],
  ]),
)

const getLatestVersions = (usage?: string) => {
  const grouped = new Map<string, PreviewDatasetVersion[]>()
  datasetVersions
    .filter((item) => !usage || item.usage === usage)
    .forEach((item) => {
      grouped.set(item.name, [...(grouped.get(item.name) || []), item])
    })
  return [...grouped.values()].map((items) => items[items.length - 1])
}

export const previewTrainingDatasetList = (params: getDataParams = {}): TrainingDatasetListResponse => {
  const page = params.page ?? 1
  const size = params.size ?? 10
  const latestVersions = getLatestVersions(params.usage).filter((item) => {
    const matchName = !params.name || item.name.toLowerCase().includes(params.name.toLowerCase())
    const matchDatasetType = !params.dataset_type || item.dataset_type === params.dataset_type
    return matchName && matchDatasetType
  })

  const items = latestVersions.map((item) => {
    const versions = datasetVersions.filter((versionItem) => versionItem.name === item.name && versionItem.usage === item.usage)
    return {
      id: item.id,
      dataset_name: item.name,
      version_count: versions.length,
      dataset_type: item.dataset_type,
      training_method_type: item.training_method_type,
      dataset_format: item.dataset_format,
      usage: item.usage,
      project_id: item.project_id,
      model_name: 'Qwen2.5-7B-Instruct',
      latest_version: item.version,
      earliest_version: versions[0]?.version || item.version,
      processing_status: item.processing_status,
      processing_status_display: item.processing_status_display,
      processing_error: item.processing_error,
      metadata_fields: item.metadata_fields,
      publish: item.publish,
      publish_display: item.publish_display,
      created_at: versions[0]?.created_at || item.created_at,
      updated_at: item.updated_at,
      created_by: item.created_by,
    }
  })

  return {
    items: items.slice((page - 1) * size, page * size),
    total: items.length,
    page,
    size,
    pages: Math.max(1, Math.ceil(items.length / size)),
  } as TrainingDatasetListResponse
}

export const mergePreviewTrainingDatasetList = (
  source: TrainingDatasetListResponse,
  params: getDataParams = {},
): TrainingDatasetListResponse => {
  const preview = previewTrainingDatasetList({ ...params, page: 1, size: 999 })
  const existingNames = new Set((source.items || []).map((item: any) => item.dataset_name))
  const mergedItems = [
    ...(source.items || []),
    ...preview.items.filter((item: any) => !existingNames.has(item.dataset_name)),
  ]
  const page = params.page ?? source.page ?? 1
  const size = params.size ?? source.size ?? 10
  return {
    ...source,
    items: mergedItems.slice((page - 1) * size, page * size),
    total: Math.max(source.total || 0, mergedItems.length),
    page,
    size,
    pages: Math.max(1, Math.ceil(mergedItems.length / size)),
  }
}

export const isPreviewTrainingDatasetName = (datasetName?: string) => {
  return datasetVersions.some((item) => item.name === datasetName)
}

export const isPreviewTrainingDatasetId = (datasetId?: number) => {
  return datasetVersions.some((item) => item.id === datasetId)
}

export const previewTrainingDatasetDetail = (datasetName: string, usage?: string) => {
  return datasetVersions
    .filter((item) => item.name === datasetName && (!usage || item.usage === usage))
    .map((item) => ({ ...item, attr_values: item.attr_values.map((attr: any) => ({ ...attr, reference_id: item.id })) }))
}

export const previewTrainingDatasetPreview = (
  datasetName: string,
  versionName: string,
  page = 1,
  size = 10,
  usage?: string,
) => {
  const versionItem = datasetVersions.find((item) => item.name === datasetName && item.version === versionName && (!usage || item.usage === usage))
  const rows = versionItem ? (previewRowsByVersionId.get(versionItem.id) || []) : []
  return {
    items: rows.slice((page - 1) * size, page * size),
    total: rows.length,
    page,
    size,
  }
}

export const publishPreviewTrainingDataset = (datasetId: number) => {
  const item = datasetVersions.find((versionItem) => versionItem.id === datasetId)
  if (!item) return
  item.publish = 1
  item.publish_display = '已发布'
  item.status_display = '已发布'
  item.is_published = true
  item.updated_at = new Date().toISOString()
}

export const deletePreviewTrainingDatasetRows = (datasetId: number, rowNumbers: number[]) => {
  const rows = previewRowsByVersionId.get(datasetId)
  if (!rows) return
  const nextRows = rows.filter((row) => !rowNumbers.includes(row.row_number))
  previewRowsByVersionId.set(datasetId, nextRows)
  const item = datasetVersions.find((versionItem) => versionItem.id === datasetId)
  if (item) {
    item.total_samples = nextRows.length
    item.updated_at = new Date().toISOString()
  }
}

export const deletePreviewTrainingDatasetVersion = (datasetName: string, versionName: string, usage?: string) => {
  const index = datasetVersions.findIndex((item) => item.name === datasetName && item.version === versionName && (!usage || item.usage === usage))
  if (index >= 0) {
    previewRowsByVersionId.delete(datasetVersions[index].id)
    datasetVersions.splice(index, 1)
  }
}

export const deletePreviewTrainingDatasetAllVersions = (datasetName: string, usage?: string) => {
  for (let index = datasetVersions.length - 1; index >= 0; index--) {
    const item = datasetVersions[index]
    if (item.name === datasetName && (!usage || item.usage === usage)) {
      previewRowsByVersionId.delete(item.id)
      datasetVersions.splice(index, 1)
    }
  }
}

export const editPreviewTrainingDataset = (
  datasetName: string,
  datasetId: number,
  usage: string,
  nextName?: string,
  description?: string,
) => {
  const item = datasetVersions.find((versionItem) => versionItem.id === datasetId)
  if (!item) return
  const oldName = item.name || datasetName
  datasetVersions.forEach((versionItem) => {
    if (versionItem.name === oldName && versionItem.usage === usage) {
      if (nextName) versionItem.name = nextName
    }
  })
  if (description !== undefined) item.description = description
}
