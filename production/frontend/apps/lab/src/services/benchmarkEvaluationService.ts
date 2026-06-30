import apiClient from './apiClient'
import type {
  BenchmarkEvaluationDatasetsResponse,
  BenchmarkEvaluationDetailResponse,
  BenchmarkEvaluationTaskListResponse,
  BenchmarkTaskConfigParams,
  CompareBatchResponse,
  CreateBenchmarkEvaluationTaskParams,
  EvaluationLogsResponse, EvaluationReportResponse,
  LeaderboardListResponse, RadarChartResponse,
} from './benchmarkModel.ts'

const baseBenchmarkDatasets: BenchmarkEvaluationDatasetsResponse[] = [
  {
    id: 86001,
    name: 'MMLU',
    code: 'mmlu',
    language: '英文',
    description: 'MMLU 主要用于评估模型在广泛领域的知识掌握情况，包含 STEM、人文学科、社会科学等 57 个学科。',
    category: 'knowledge',
    model_types: ['text-generation'],
    sort_order: 1,
    original_sample_count: 14079,
  },
  {
    id: 86002,
    name: 'MMLU-Pro',
    code: 'mmlu_pro',
    language: '英文',
    description: 'MMLU-Pro 进阶多任务语言理解，提升对复杂推理和知识应用能力的区分度。',
    category: 'knowledge',
    model_types: ['text-generation'],
    sort_order: 2,
    original_sample_count: 12032,
  },
  {
    id: 86003,
    name: 'CMMLU',
    code: 'cmmlu',
    language: '中文',
    description: '中文多任务语言理解评估集，覆盖中国语境下的知识理解与应用能力。',
    category: 'knowledge',
    model_types: ['text-generation'],
    sort_order: 3,
    original_sample_count: 11582,
  },
  {
    id: 86004,
    name: 'C-Eval',
    code: 'ceval',
    language: '中文',
    description: 'C-Eval 用于评估模型对中文文本的理解和应用能力，覆盖数学、物理、历史、文学等多个学科。',
    category: 'knowledge',
    model_types: ['text-generation'],
    sort_order: 4,
    original_sample_count: 1346,
  },
  {
    id: 86005,
    name: 'AGIEval',
    code: 'agieval',
    language: '英文',
    description: 'AGIEval 面向通用人工智能能力评估，覆盖标准化考试和专业知识任务。',
    category: 'knowledge',
    model_types: ['text-generation'],
    sort_order: 5,
    original_sample_count: 4723,
  },
  {
    id: 86006,
    name: 'GPQA',
    code: 'gpqa',
    language: '英文',
    description: 'GPQA 研究生级别问答评估集，用于检验高难知识问答和复杂推理能力。',
    category: 'knowledge',
    model_types: ['text-generation'],
    sort_order: 6,
    original_sample_count: 198,
  },
  {
    id: 86007,
    name: 'IFEval',
    code: 'IFEval',
    language: '英文',
    description: '指令遵循能力评估集，用于检验模型是否严格遵守用户给定约束。',
    category: 'instruction_following',
    model_types: ['text-generation'],
    sort_order: 7,
    original_sample_count: 541,
  },
  {
    id: 86008,
    name: 'HumanEval',
    code: 'humaneval',
    language: '代码',
    description: 'Python 代码生成权威评估集，用于检验模型根据函数说明生成可执行代码的能力。',
    category: 'code',
    model_types: ['text-generation'],
    sort_order: 8,
    original_sample_count: 164,
  },
  {
    id: 86009,
    name: 'MBPP',
    code: 'mbpp',
    language: '代码',
    description: 'Python 基础编程问题评估集，覆盖常见算法和数据结构代码生成任务。',
    category: 'code',
    model_types: ['text-generation'],
    sort_order: 10,
    original_sample_count: 500,
  },
  {
    id: 86010,
    name: 'MATH',
    code: 'math',
    language: '英文',
    description: '高难度数学问题评估集，用于检验数学推理、步骤规划和答案生成能力。',
    category: 'reasoning',
    model_types: ['text-generation'],
    sort_order: 11,
    original_sample_count: 5000,
  },
  {
    id: 86011,
    name: 'GSM8K',
    code: 'gsm8k',
    language: '英文',
    description: 'GSM8K 用于评估模型解决基础数学问题的能力，包含小学数学应用题。',
    category: 'reasoning',
    model_types: ['text-generation'],
    sort_order: 12,
    original_sample_count: 1319,
  },
  {
    id: 86012,
    name: 'SimpleQA',
    code: 'SimpleQA',
    language: '英文',
    description: '简单问答知识评估集，用于检验事实性回答和知识准确性。',
    category: 'safety',
    model_types: ['text-generation'],
    sort_order: 13,
    original_sample_count: 4326,
  },
]

const imageGenerationBenchmarkDatasets: BenchmarkEvaluationDatasetsResponse[] = [
  {
    id: 87031,
    name: 'GenEval',
    code: 'geneval',
    language: '英文',
    description: 'GenEval 用于评估文生图模型的组合泛化、物体计数、颜色、位置关系和属性绑定能力。',
    category: 'alignment',
    model_types: ['image-generation'],
    sort_order: 1,
    original_sample_count: 553,
  },
  {
    id: 87032,
    name: 'DrawBench',
    code: 'drawbench',
    language: '英文',
    description: 'DrawBench 用于评估文生图模型在复杂提示词、组合关系、文字渲染和风格迁移上的生成能力。',
    category: 'alignment',
    model_types: ['image-generation'],
    sort_order: 2,
    original_sample_count: 200,
  },
  {
    id: 87033,
    name: 'PartiPrompts',
    code: 'partiprompts',
    language: '英文',
    description: 'PartiPrompts 覆盖真实世界长尾提示词，用于评估模型对开放域主题、风格和细节的生成表现。',
    category: 'general',
    model_types: ['image-generation'],
    sort_order: 3,
    original_sample_count: 1632,
  },
  {
    id: 87034,
    name: 'T2I-CompBench',
    code: 't2i_compbench',
    language: '英文',
    description: 'T2I-CompBench 用于评估文本到图像模型的属性绑定、空间关系、数量关系和复杂组合理解。',
    category: 'composition',
    model_types: ['image-generation'],
    sort_order: 4,
    original_sample_count: 6000,
  },
  {
    id: 87035,
    name: 'DPG-Bench',
    code: 'dpg_bench',
    language: '英文',
    description: 'DPG-Bench 侧重细粒度提示词遵循能力，评估主体、属性、关系和场景细节是否被准确生成。',
    category: 'alignment',
    model_types: ['image-generation'],
    sort_order: 5,
    original_sample_count: 1065,
  },
  {
    id: 87036,
    name: 'HPSv2',
    code: 'hpsv2',
    language: '英文',
    description: 'HPSv2 用于评估图像生成结果的人类偏好质量，覆盖美学、真实感、主体完整性和整体观感。',
    category: 'preference',
    model_types: ['image-generation'],
    sort_order: 6,
    original_sample_count: 3200,
  },
]

const demoBenchmarkDatasets = [...baseBenchmarkDatasets, ...imageGenerationBenchmarkDatasets]

const filterBenchmarkDatasets = (
  datasets: BenchmarkEvaluationDatasetsResponse[],
  category?: string,
  modelType?: string,
) => datasets.filter((dataset) => {
  const categoryMatched = !category || dataset.category === category
  const modelTypeMatched = !modelType || !dataset.model_types?.length || dataset.model_types.includes(modelType)
  return categoryMatched && modelTypeMatched
})

const appendImageGenerationBenchmarks = (
  datasets: BenchmarkEvaluationDatasetsResponse[],
  category?: string,
  modelType?: string,
) => {
  const shouldAppendImageGeneration = !modelType || modelType === 'image-generation'
  if (!shouldAppendImageGeneration) {
    return datasets
  }
  const imageBenchmarks = filterBenchmarkDatasets(imageGenerationBenchmarkDatasets, category, modelType)
  const existingCodes = new Set(datasets.map((dataset) => dataset.code))
  return [
    ...datasets,
    ...imageBenchmarks.filter((dataset) => !existingCodes.has(dataset.code)),
  ]
}

const demoBenchmarkTaskModels = [
  { id: 1, model_id: 203, model_name: 'SeedDream-SFT-Poster', model_version: 'V1.15', model_type: 'model', sort_order: 1 },
  { id: 2, model_id: 204, model_name: 'Qwen-Image-Service', model_version: 'online', model_type: 'service', sort_order: 2 },
  { id: 3, model_id: 205, model_name: 'SeedDream-SFT-Interior', model_version: 'V1.15', model_type: 'model', sort_order: 3 },
]

const demoBenchmarkTaskDatasets = imageGenerationBenchmarkDatasets.slice(0, 4).map((dataset, index) => ({
  id: index + 1,
  dataset_id: dataset.id,
  dataset_name: dataset.name,
  dataset_code: dataset.code,
}))

const buildDemoBenchmarkTask = (overrides: Partial<BenchmarkEvaluationDetailResponse>): BenchmarkEvaluationDetailResponse => ({
  id: overrides.id || 88031,
  created_at: overrides.created_at || '2026-06-30T10:10:00',
  created_by: overrides.created_by || '产品演示',
  updated_at: overrides.updated_at || overrides.finished_at || '2026-06-30T10:36:00',
  name: overrides.name || '图像生成基准评估-多场景',
  description: overrides.description || '覆盖 GenEval、DrawBench、PartiPrompts、T2I-CompBench 等图像生成权威评估集的演示任务。',
  project_id: overrides.project_id || 1001,
  model_type: overrides.model_type || 'model',
  schedule_enabled: overrides.schedule_enabled || false,
  schedule_date: overrides.schedule_date || '',
  schedule_time: overrides.schedule_time || '',
  status: overrides.status || '已完成',
  progress: overrides.progress ?? 100,
  lab_k8s_uuid: overrides.lab_k8s_uuid || '',
  graphics_card_resource: overrides.graphics_card_resource || {
    card_type: 'GPU',
    card_model: 'A800',
    count: 1,
    card_memory: '80GB',
    k8s_resource_type: 'nvidia.com/gpu',
  },
  started_at: overrides.started_at || '2026-06-30T10:12:00',
  finished_at: overrides.finished_at || '2026-06-30T10:36:00',
  error_message: overrides.error_message || '',
  result_path: overrides.result_path || '',
  log_path: overrides.log_path || '',
  models: overrides.models || demoBenchmarkTaskModels.slice(0, 2),
  datasets: overrides.datasets || demoBenchmarkTaskDatasets,
  model_provider: overrides.model_provider || 'local-demo',
  schedule_at: overrides.schedule_at,
  inference_params: overrides.inference_params || {
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 1024,
    presence_penalty: 0,
  },
})

const demoBenchmarkTasks: BenchmarkEvaluationDetailResponse[] = [
  buildDemoBenchmarkTask({
    id: 88031,
    name: '图像生成基准评估-提示词遵循',
    description: '基于 GenEval、DrawBench 和 PartiPrompts 评估图像生成模型的提示词遵循、组合泛化和开放域生成能力。',
    datasets: imageGenerationBenchmarkDatasets.slice(0, 3).map((dataset, index) => ({
      id: index + 1,
      dataset_id: dataset.id,
      dataset_name: dataset.name,
      dataset_code: dataset.code,
    })),
    models: demoBenchmarkTaskModels.slice(0, 2),
  }),
  buildDemoBenchmarkTask({
    id: 88032,
    name: '图像生成基准评估-组合理解',
    description: '基于 T2I-CompBench 评估图像生成模型对属性绑定、空间关系和数量关系的组合理解能力。',
    created_at: '2026-06-30T13:20:00',
    started_at: '2026-06-30T13:24:00',
    finished_at: '',
    updated_at: '2026-06-30T14:05:00',
    status: '运行中',
    progress: 68,
    datasets: imageGenerationBenchmarkDatasets.slice(3, 4).map((dataset, index) => ({
      id: index + 1,
      dataset_id: dataset.id,
      dataset_name: dataset.name,
      dataset_code: dataset.code,
    })),
    models: [demoBenchmarkTaskModels[2]],
  }),
  buildDemoBenchmarkTask({
    id: 88033,
    name: '图像生成基准评估-偏好质量',
    description: '基于 DPG-Bench 和 HPSv2 评估细粒度提示词遵循与人类偏好质量。',
    created_at: '2026-06-29T16:40:00',
    started_at: '2026-06-29T16:44:00',
    finished_at: '2026-06-29T17:08:00',
    datasets: imageGenerationBenchmarkDatasets.slice(4, 6).map((dataset, index) => ({
      id: index + 1,
      dataset_id: dataset.id,
      dataset_name: dataset.name,
      dataset_code: dataset.code,
    })),
    models: [demoBenchmarkTaskModels[1]],
  }),
]

const demoLeaderboardItems: LeaderboardListResponse = {
  items: [
    {
      id: 1,
      created_at: '2026-06-30T10:36:00',
      updated_at: '2026-06-30T10:36:00',
      project_id: 1001,
      model_id: 203,
      model_name: 'SeedDream-SFT-Poster',
      model_version: 'V1.15',
      average_score: 86.8,
      dataset_scores: {
        GenEval: 89.2,
        DrawBench: 84.5,
        PartiPrompts: 86.7,
        'T2I-CompBench': 82.4,
        'DPG-Bench': 88.1,
        HPSv2: 89.9,
      },
      last_task_id: 88031,
      last_evaluated_at: '2026-06-30T10:36:00',
    },
    {
      id: 2,
      created_at: '2026-06-30T10:36:00',
      updated_at: '2026-06-30T10:36:00',
      project_id: 1001,
      model_id: 204,
      model_name: 'Qwen-Image-Service',
      model_version: 'online',
      average_score: 82.3,
      dataset_scores: {
        GenEval: 83.5,
        DrawBench: 81.8,
        PartiPrompts: 84.1,
        'T2I-CompBench': 79.6,
        'DPG-Bench': 83.7,
        HPSv2: 81.1,
      },
      last_task_id: 88031,
      last_evaluated_at: '2026-06-30T10:36:00',
    },
    {
      id: 3,
      created_at: '2026-06-30T14:05:00',
      updated_at: '2026-06-30T14:05:00',
      project_id: 1001,
      model_id: 205,
      model_name: 'SeedDream-SFT-Interior',
      model_version: 'V1.15',
      average_score: 85.1,
      dataset_scores: {
        GenEval: 80.4,
        DrawBench: 82.2,
        PartiPrompts: 81.5,
        'T2I-CompBench': 91.3,
        'DPG-Bench': 83.6,
        HPSv2: 81.7,
      },
      last_task_id: 88032,
      last_evaluated_at: '2026-06-30T14:05:00',
    },
  ],
  total: 3,
  page: 1,
  size: 10,
  pages: 1,
}

const buildDemoRadar = (modelIds?: number | number[]): RadarChartResponse => {
  const ids = modelIds === undefined ? demoLeaderboardItems.items.map((item) => item.model_id) : (Array.isArray(modelIds) ? modelIds : [modelIds])
  return {
    benchmark_task_id: 88031,
    evaluation_type: 'single',
    model_reports: demoLeaderboardItems.items
      .filter((item) => ids.includes(item.model_id))
      .map((item) => ({
        model_id: item.model_id,
        model_name: item.model_name,
        model_version: item.model_version,
        average_score: item.average_score,
        dataset_scores: item.dataset_scores,
      })),
  }
}

const buildDemoBenchmarkReport = (taskId?: number): EvaluationReportResponse => ({
  benchmark_task_id: taskId || 88031,
  evaluation_type: 'single',
  model_reports: demoLeaderboardItems.items.slice(0, taskId === 88032 ? 3 : 2).map((item) => ({
    model_id: item.model_id,
    model_name: item.model_name,
    model_version: item.model_version,
    dataset_scores: item.dataset_scores,
    average_score: item.average_score,
  })),
})

// 基准评估所需接口
export const benchmarkEvaluationServices = {

  // 获取基准评估数据集列表（按分类、模型类型组织）；含全局 + 当前租户数据集
  getBenchmarkEvaluationDatasets: async (category?: string, model_type?: string) => {
    try {
      const response = await apiClient.get<BenchmarkEvaluationDatasetsResponse[]>('/benchmark/datasets', {
        params: {
          category,
          model_type,
        },
      })
      const items = response.data || []
      return appendImageGenerationBenchmarks(items, category, model_type)
    }
    catch (error) {
      return filterBenchmarkDatasets(demoBenchmarkDatasets, category, model_type)
    }
  },

  // 创建基准评估任务
  createBenchmarkEvaluationTask: async (project_Id?: number, params?: CreateBenchmarkEvaluationTaskParams) => {
    const response = await apiClient.post(`/benchmark/project/${project_Id}/tasks`, params)
    return response.data
  },

  // 获取项目下的基准评估任务列表（分页）
  getBenchmarkEvaluationTasks: async (project_Id?: number, params?: { page?: number, size?: number, status?: string }) => {
    try {
      const response = await apiClient.get<BenchmarkEvaluationTaskListResponse>(`/benchmark/project/${project_Id}/tasks`, {
        params: {
          page: params?.page || 1,
          size: params?.size || 10,
          status: params?.status,
        },
      })
      const items = response.data?.items || []
      if (items.length === 0) {
        return { items: demoBenchmarkTasks, total: demoBenchmarkTasks.length, page: params?.page || 1, size: params?.size || 10, pages: 1 }
      }
      return response.data
    }
    catch (error) {
      return { items: demoBenchmarkTasks, total: demoBenchmarkTasks.length, page: params?.page || 1, size: params?.size || 10, pages: 1 }
    }
  },

  // 获取指定基准评估任务详情
  getBenchmarkEvaluationDetail: async (project_Id?: number, id?: number) => {
    try {
      const response = await apiClient.get<BenchmarkEvaluationDetailResponse>(`/benchmark/project/${project_Id}/tasks/${id}`)
      return response.data
    }
    catch (error) {
      return demoBenchmarkTasks.find((task) => task.id === id) || buildDemoBenchmarkTask({ id })
    }
  },

  // 编辑任务配置
  updateBenchmarkTaskConfig: async (project_Id?: number, id?: number, params?: BenchmarkTaskConfigParams) => {
    const response = await apiClient.put(`/benchmark/project/${project_Id}/tasks/${id}`, params)
    return response.data
  },

  // 删除任务（运行中需先终止）
  deleteBenchmarkTask: async (project_Id?: number, id?: number) => {
    const response = await apiClient.delete(`/benchmark/project/${project_Id}/tasks/${id}`)
    return response.data
  },

  // 启动任务
  startBenchmarkTask: async (project_Id?: number, id?: number) => {
    const response = await apiClient.post(`/benchmark/project/${project_Id}/tasks/${id}/start`)
    return response.data
  },

  // 终止任务
  cancelBenchmarkTask: async (project_Id?: number, id?: number) => {
    const response = await apiClient.post(`/benchmark/project/${project_Id}/tasks/${id}/cancel`)
    return response.data
  },

  // 重新提交任务（失败/已取消状态）
  resubmitBatchTask: async (project_Id?: number, id?: number) => {
    const response = await apiClient.post(`/benchmark/project/${project_Id}/tasks/${id}/resubmit`)
    return response.data
  },

  // 克隆任务
  cloneBatchTask: async (project_Id?: number, id?: number) => {
    const response = await apiClient.post<BenchmarkEvaluationDetailResponse>(`/benchmark/project/${project_Id}/tasks/${id}/clone`)
    return response.data
  },

  // 对比评估（传入任务ID列表，2-5个，返回对比数据）
  compareBatchTask: async (project_Id?: number, params?: { task_ids: number[] }) => {
    try {
      const response = await apiClient.post<CompareBatchResponse>(`/benchmark/project/${project_Id}/tasks/compare`, params)
      return response.data
    }
    catch (error) {
      return {
        benchmark_task_ids: params?.task_ids || demoBenchmarkTasks.slice(0, 2).map((task) => task.id),
        evaluation_type: 'comparison',
        model_reports: demoLeaderboardItems.items.map((item) => ({
          model_id: item.model_id,
          model_name: item.model_name,
          model_version: item.model_version,
          radar_chart_data: {
            model_id: item.model_id,
            model_name: item.model_name,
            model_version: item.model_version,
            data: Object.entries(item.dataset_scores).map(([dataset_name, score]) => ({
              dataset_code: dataset_name,
              dataset_name,
              score,
            })),
          },
        })),
      }
    }
  },

  // 获取评估报告
  getBatchEvaluationReport: async (project_Id?: number, id?: number) => {
    try {
      const response = await apiClient.get<EvaluationReportResponse>(`/benchmark/project/${project_Id}/tasks/${id}/report`)
      return response.data
    }
    catch (error) {
      return buildDemoBenchmarkReport(id)
    }
  },

  // 获取基准评估任务日志
  getBatchEvaluationLogs: async (project_Id?: number, id?: number) => {
    try {
      const response = await apiClient.get<EvaluationLogsResponse>(`/benchmark/project/${project_Id}/tasks/${id}/logs`)
      return response.data
    }
    catch (error) {
      return {
        archived: false,
        logs: [
          '[10:12:03] 读取 GenEval、DrawBench、T2I-CompBench 等图像生成基准集',
          '[10:18:41] 完成提示词遵循、组合理解、偏好质量样本推理',
          '[10:31:26] 汇总提示词匹配、画面质量、安全合规评分',
          '[10:36:00] 生成图像生成基准评估报告',
        ],
      }
    }
  },

  // 下载基准评估任务日志文件（优先归档日志，其次 Loki 实时日志）
  downloadBatchEvaluationLogs: async (project_Id?: number, id?: number) => {
    const response = await apiClient.get<EvaluationLogsResponse>(`/benchmark/project/${project_Id}/tasks/download/log/${id}`)
    return response.data
  },

  // 获取榜单列表（分页、支持按平均分或指定数据集得分排序）
  getLeaderboardList: async (project_Id?: number, params?: { sort_by?: string, sort_order?: string, page?: number, size?: number }) => {
    try {
      const response = await apiClient.get<LeaderboardListResponse>(`/benchmark/project/${project_Id}/leaderboard`, {
        params: {
          sort_by: params?.sort_by,
          sort_order: params?.sort_order,
          page: params?.page || 1,
          size: params?.size || 10,
        },
      })
      if (!response.data?.items?.length) {
        return { ...demoLeaderboardItems, page: params?.page || 1, size: params?.size || 10 }
      }
      return response.data
    }
    catch (error) {
      return { ...demoLeaderboardItems, page: params?.page || 1, size: params?.size || 10 }
    }
  },

  // 获取雷达图数据
  getLeaderboardRadarChart: async (project_Id?: number, params?: { model_ids: number | number[] }) => {
    let queryString = ''
    if (params?.model_ids !== undefined) {
      const modelIds = Array.isArray(params.model_ids) ? params.model_ids : [params.model_ids]
      queryString = modelIds.map((id) => `model_ids=${id}`).join('&')
    }

    const url = `/benchmark/project/${project_Id}/leaderboard/radar-chart${queryString ? `?${queryString}` : ''}`
    try {
      const response = await apiClient.get<RadarChartResponse>(url)
      if (!response.data?.model_reports?.length) {
        return buildDemoRadar(params?.model_ids)
      }
      return response.data
    }
    catch (error) {
      return buildDemoRadar(params?.model_ids)
    }
  },

  // 下载数据集评测结果 //数据集代码（如 humaneval）model_id 模型id
  downDatasetResult: async (project_Id?: number, id?: number, params?: { dataset_code?: string, model_id?: number }) => {
    const response = await apiClient.get(`/benchmark/project/${project_Id}/tasks/${id}/download-result`, {
      params: {
        dataset_code: params.dataset_code,
        model_id: params?.model_id || null,
      },
      responseType: 'blob', // 设置为 blob 类型以处理文件下载
    })
    return response
  },
  downCompareResult: async (project_Id?: number, id?: number) => {
    const response = await apiClient.get(`/benchmark/project/${project_Id}/tasks/${id}/report/download-docx`, {
      responseType: 'blob', // 设置为 blob 类型以处理文件下载
    })
    return response
  },

  // 下载对比评估报告结果（传入任务 id 数组，与对比评估一致）
  downCompareResults: async (project_Id?: number, task_ids?: number[]) => {
    const response = await apiClient.post(
      `/benchmark/project/${project_Id}/tasks/compare/download-docx`,
      { task_ids },
      { responseType: 'blob' },
    )
    return response
  },
}
