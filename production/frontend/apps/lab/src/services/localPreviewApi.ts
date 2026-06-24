import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import { mockMenuData } from '@/mock/mockMenuData'

const now = '2026-06-24T10:00:00+08:00'

const page = <T>(items: T[], pageNumber = 1, size = 20) => ({
  items,
  total: items.length,
  page: pageNumber,
  size,
  pages: 1,
})

const rowPage = <T>(rows: T[], pageNumber = 1, size = 20) => ({
  total: rows.length,
  rows,
  number: pageNumber,
  size,
  totalPages: 1,
})

const ok = { success: true, message: '本地演示操作已完成' }

const projects = [
  {
    id: 1001,
    name: 'DeepexiLab 演示项目',
    description: '用于本地预览生产前端交互的演示项目',
    kubernetes_id: 9001,
    kubernetes_name: 'lab-demo-gpu-cluster',
    admin_user_ids: [1],
    is_project_admin: true,
    is_platform_admin: true,
    is_tenant_admin: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: 1002,
    name: '算法验证项目',
    description: '覆盖训练、推理、评估和机器学习数据管理的演示项目',
    kubernetes_id: 9001,
    kubernetes_name: 'lab-demo-gpu-cluster',
    admin_user_ids: [1, 2],
    is_project_admin: true,
    is_platform_admin: true,
    is_tenant_admin: true,
    created_at: now,
    updated_at: now,
  },
]

const users = [
  {
    id: 1,
    userId: 1,
    accountId: 1,
    tenantId: 'local-preview-tenant',
    username: 'tenant_admin_preview',
    nickname: '租户管理员',
    email: 'tenant-admin@example.com',
    phone: '138****0001',
    status: 0,
    is_active: true,
    is_admin: true,
    isMain: true,
    isInfinite: true,
    is_project_admin: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: 2,
    userId: 2,
    accountId: 2,
    tenantId: 'local-preview-tenant',
    username: 'algorithm_engineer',
    nickname: '算法工程师',
    email: 'algo@example.com',
    phone: '138****0002',
    status: 0,
    is_active: true,
    is_admin: false,
    isMain: false,
    isInfinite: false,
    is_project_admin: false,
    created_at: now,
    updated_at: now,
  },
]

const clusters = [
  {
    id: 9001,
    name: 'lab-demo-gpu-cluster',
    api_server: 'https://k8s.demo.local',
    status: 'online',
    description: '本地演示 GPU/NPU 训练集群',
    version: 'v1.28.9',
    node_number: 4,
    storage_id: 7001,
    repository_id: 8001,
    is_mount: true,
    created_at: now,
    updated_at: now,
    created_by: 'tenant_admin_preview',
    ext: {
      graphics_card_resource_type: [
        { label: 'GPU', value: 'nvidia.com/gpu' },
        { label: 'NPU', value: 'huawei.com/Ascend910' },
      ],
    },
  },
]

const storageConfigs = [
  {
    id: 7001,
    name: 'demo-minio-storage',
    description: '本地演示对象存储',
    type: 'MINIO',
    config: {
      endpoint: 'localhost:9000',
      bucket: 'deepexilab',
      access_key: 'minioadmin',
      secret_key: '********',
    },
    status: '连接正常',
    cluster_number: 1,
    test_status: 'success',
    test_message: '本地演示连接正常',
    is_init: true,
    created_at: now,
    updated_at: now,
    created_by: 'tenant_admin_preview',
  },
]

const registries = [
  {
    id: 8001,
    name: 'demo-harbor',
    registry_type: 'private_harbor',
    type: 'private_harbor',
    repository_address: 'harbor.demo.local/library',
    manager_address: 'https://harbor.demo.local',
    namespace: 'deepexilab',
    auth_type: 'username_password',
    auth_config: { username: 'admin', password: '********' },
    cluster_number: 1,
    status: '连接正常',
    created_at: now,
    updated_at: now,
    created_id: 1,
    created_by: 'tenant_admin_preview',
  },
]

const repositoryImages = [
  {
    id: 8101,
    name: 'pytorch-notebook-cuda',
    image: 'harbor.demo.local/deepexilab/pytorch-notebook:2.3.0-cuda12.1',
    image_address: 'harbor.demo.local/deepexilab/pytorch-notebook:2.3.0-cuda12.1',
    type: 11,
    image_type: 11,
    describe: 'Notebook GPU 基础镜像',
    repository_id: 8001,
    repository_name: 'demo-harbor',
    namespace: 'deepexilab',
    project_id: 1001,
    business_id: 0,
    base_image: 'nvidia/cuda:12.1.1-runtime-ubuntu22.04',
    output_image: 'harbor.demo.local/deepexilab/pytorch-notebook:2.3.0-cuda12.1',
    trigger_type: 'manual',
    status: '已完成',
    lab_k8s_uuid: 'demo-cluster',
    log_path: null,
    created_at: now,
    updated_at: now,
    created_by: 'tenant_admin_preview',
    tags: [],
    output_image_id: 8101,
  },
]

const baseModels = [
  {
    id: '6001',
    name: 'Qwen2.5-7B-Instruct',
    model_source: 'ModelScope',
    k8s_id: '9001',
    model_provider: 'qwen',
    model_type: ['text-generation'],
    description: '通用文本生成基础模型',
    model_tags: ['training', 'inference'],
    status: '已完成',
    model_name: 'Qwen2.5-7B-Instruct',
    schedule_at: null,
    created_at: now,
    updated_at: now,
  },
  {
    id: '6002',
    name: 'Qwen2.5-VL-7B-Instruct',
    model_source: 'ModelScope',
    k8s_id: '9001',
    model_provider: 'qwen',
    model_type: ['image-understanding'],
    description: '多模态图像理解基础模型',
    model_tags: ['inference'],
    status: '运行中',
    model_name: 'Qwen2.5-VL-7B-Instruct',
    schedule_at: null,
    created_at: now,
    updated_at: now,
  },
]

const notebooks = [
  {
    id: 5001,
    name: 'SFT 数据检查 Notebook',
    description: '本地演示 Notebook',
    project_id: 1001,
    status: '运行中',
    image: repositoryImages[0].image_address,
    created_at: now,
    updated_at: now,
    created_by: 'tenant_admin_preview',
  },
]

const datasets = [
  {
    id: 3001,
    project_id: 1001,
    name: '客服问答 SFT 数据集',
    description: '演示训练数据集',
    dataset_name: '客服问答 SFT 数据集',
    version: 'v1',
    usage: 'training',
    sample_count: 1280,
    total_samples: 1280,
    created_at: now,
    updated_at: now,
  },
]

const machineLearningDatasets = [
  {
    id: 3101,
    name: '图片缺陷分类数据集',
    description: '机器学习图像分类演示数据集',
    project_id: 1001,
    version: 'V1',
    dataset_category: 'image',
    data_type: 'image',
    annotation_type: 'image_classification',
    task_type: 'image_classification',
    template_type: 'image_classification_single_label',
    source_type: 'local_upload',
    sample_count: 320,
    created_at: now,
    updated_at: now,
    created_by: 'tenant_admin_preview',
    is_annotated: true,
  },
]

const trainingTasks = [
  {
    id: 4001,
    name: 'Qwen 客服问答微调',
    task_name: 'Qwen 客服问答微调',
    project_id: 1001,
    version: 'v1',
    status: '运行中',
    training_type_category: 'text-generation',
    training_method_type: 'sft',
    created_at: now,
    updated_at: now,
  },
]

const cleaningTasks = [
  {
    id: 4101,
    created_at: now,
    updated_at: now,
    created_id: 1,
    created_by: 'tenant_admin_preview',
    tenant_id: 'local-preview-tenant',
    name: '客服问答数据质量清洗',
    project_id: 1001,
    source: 'existed_dataset',
    input_dataset_id: 3001,
    output_dataset_id: 3002,
    input_dataset_name: '客服问答 SFT 数据集-v1',
    output_dataset_name: '客服问答 SFT 数据集-clean-v1',
    status: '已完成',
    total_samples: 1280,
    completed_at: now,
    total_characters: 240000,
    file_size: 18.5,
    steps_snapshot: [
      { order: 1, operator_type: 'text_deduplicate', operator_name: '文本去重', params: { threshold: 0.9 } },
      { order: 2, operator_type: 'sensitive_mask', operator_name: '敏感信息脱敏', params: { mask_phone: true } },
    ],
    schedule_at: null,
  },
]

const enumPayload = [
  {
    enum_name: 'ModelProvider',
    options: [
      { name: 'qwen', label: '通义千问', value: 'qwen', description: null },
      { name: 'llama', label: 'Llama', value: 'llama', description: null },
    ],
  },
  {
    enum_name: 'ModelType',
    options: [
      { name: 'text-generation', label: '文本生成', value: 'text-generation', description: null },
      { name: 'image-understanding', label: '图像理解', value: 'image-understanding', description: null },
      { name: 'multimodal', label: '多模态', value: 'multimodal', description: null },
    ],
  },
  {
    enum_name: 'TrainingTaskStatus',
    options: [
      { name: 'created', label: '已创建', value: '已创建', description: null },
      { name: 'queued', label: '排队中', value: '排队中', description: null },
      { name: 'running', label: '运行中', value: '运行中', description: null },
      { name: 'finished', label: '已完成', value: '已完成', description: null },
      { name: 'failed', label: '失败', value: '失败', description: null },
      { name: 'stopped', label: '已终止', value: '已终止', description: null },
    ],
  },
]

const getPathname = (url?: string) => {
  if (!url) return '/'
  try {
    return new URL(url, window.location.origin).pathname.replace(/^\/api\/v1/, '')
  }
  catch {
    return url.split('?')[0].replace(/^\/api\/v1/, '')
  }
}

export const isLocalPreviewApiEnabled = () =>
  import.meta.env.DEV && localStorage.getItem('lab-local-role') === 'tenant_admin'

export const getLocalPreviewData = (config: AxiosRequestConfig): unknown | undefined => {
  if (!isLocalPreviewApiEnabled()) return undefined

  const method = (config.method || 'get').toLowerCase()
  const path = getPathname(config.url)
  const params = (config.params || {}) as Record<string, any>
  const pageNumber = Number(params.page || 1)
  const size = Number(params.size || params.page_size || 20)

  if (method !== 'get') {
    if (path.includes('test-connectivity')) {
      return { ...ok, is_connected: true, test_time: now, cluster_id: 9001, repository_id: 8001 }
    }
    if (path.includes('validate')) {
      return { valid: true, message: '本地演示 kubeconfig 校验通过' }
    }
    return ok
  }

  if (path === '/config') {
    return { data: { PROVIDER_TYPE: 'local-preview', FASTDATA_WORKBENCH_URL_PRE: 'http://localhost:5177' } }
  }
  if (path === '/menu') return mockMenuData
  if (path === '/users/me') return users[0]
  if (path === '/users/list') return rowPage(users, pageNumber, size)
  if (path.startsWith('/users/')) return users.find(user => String(user.id) === path.split('/').pop()) || users[0]
  if (path === '/permissions/menu/visible') return { visible: true, reason: 'local-preview' }
  if (path === '/enums/list') return { all_enums: enumPayload, enums_by_module: [], training_dataset: [], training_task: [] }

  if (path === '/projects/list') return page(projects, pageNumber, size)
  if (/^\/projects\/\d+$/.test(path)) return projects.find(project => String(project.id) === path.split('/').pop()) || projects[0]
  if (path.includes('/user/list') || path.includes('/users/not-associated')) return rowPage(users, pageNumber, size)
  if (path.includes('ssh-config')) return { ssh_username: 'demo-user', ssh_password: '', ssh_key: '', is_ssh: false }

  if (path === '/k8s/clusters' || path === '/k8s/available-clusters') return page(clusters, pageNumber, size)
  if (/^\/k8s\/clusters\/\d+$/.test(path)) return clusters[0]
  if (path.includes('/health')) return { cluster_id: 9001, is_connected: true, status: 'online', message: '本地演示集群正常' }
  if (path.includes('k8s-resource') || path.includes('allocatable')) {
    return [
      { resource_type: 'nvidia.com/gpu', resource_card_model: 'A800', card_memory: '80GB', total: 8, available: 6 },
    ]
  }
  if (path.includes('k8s-graphics-card-model')) return [{ label: 'A800 / 80GB', value: 'A800', card_memory: '80GB' }]

  if (path === '/storage') return page(storageConfigs, pageNumber, size)
  if (path === '/storage/available-clusters') return page(clusters, pageNumber, size)
  if (path.includes('/occupied-clusters/') || path.includes('/cluster-mappings')) return page(clusters, pageNumber, size)
  if (/^\/storage\/\d+/.test(path)) return storageConfigs[0]
  if (path.includes('/storage-configs')) return storageConfigs

  if (path === '/repository') return page(registries, pageNumber, size)
  if (path === '/repository/enums/type-list') {
    return [
      { label: '私有 Harbor', value: 'private_harbor' },
      { label: '火山云镜像仓库', value: 'volcengine' },
    ]
  }
  if (path === '/repository/available-clusters') return page(clusters, pageNumber, size)
  if (path.includes('/occupied-clusters/') || path.includes('/clusters')) return clusters
  if (path.includes('/images')) return page(repositoryImages, pageNumber, size)
  if (path.includes('/repositories')) return page([{ name: 'deepexilab', tag_count: 3 }], pageNumber, size)
  if (/^\/repository\/\d+/.test(path)) return registries[0]

  if (path === '/repository_images/list') return page(repositoryImages, pageNumber, size)
  if (path === '/repository_images/enums/type-list') {
    return [
      { label: 'Notebook 基础镜像', value: 11 },
      { label: '机器学习 Notebook 镜像', value: 12 },
    ]
  }
  if (path.includes('/repository_images/find-namespaces/list')) return page(['deepexilab', 'library'], pageNumber, size)
  if (path.includes('/repository_images/by_project/') && path.endsWith('/page')) return page(repositoryImages, pageNumber, size)
  if (path.includes('/repository_images/by_project/')) return repositoryImages
  if (path.includes('/repository_images/custom/')) return page(repositoryImages, pageNumber, size)
  if (/^\/repository_images\/\d+/.test(path)) return repositoryImages[0]

  if (path === '/models/base/list') return page(baseModels, pageNumber, size)
  if (path === '/models/enums/model-source') {
    return [
      { label: 'ModelScope', value: 'ModelScope' },
      { label: '本地模型', value: 'Local' },
    ]
  }
  if (path === '/models/enums/model-status') {
    return [
      { label: '已完成', value: '已完成' },
      { label: '运行中', value: '运行中' },
      { label: '失败', value: '失败' },
      { label: '已终止', value: '已终止' },
    ]
  }
  if (path === '/models/public/list') return ['Qwen2.5-7B-Instruct', 'Qwen2.5-VL-7B-Instruct']
  if (path.includes('/models/base/model/download/') && path.includes('/logs')) return { archived: false, logs: ['本地演示：模型下载任务正常。'] }
  if (path.includes('/models/trained/project/')) return page(trainingTasks, pageNumber, size)
  if (path.includes('/models/ml/project/')) return page([], pageNumber, size)

  if (path.includes('/notebooks/') && path.endsWith('/list')) return page(notebooks, pageNumber, size)
  if (path.includes('/notebooks/examples')) return page(notebooks, pageNumber, size)
  if (/^\/notebooks\/\d+\/\d+/.test(path)) return notebooks[0]

  if (path.includes('/machine-learning-datasets/dataset/export-formats')) {
    return {
      image_classification_single_label: ['platform', 'imagenet'],
      image_classification_multi_label: ['platform'],
      entity_recognition: ['platform', 'jsonl'],
      text_classification_single_label: ['platform', 'csv'],
      text_classification_multi_label: ['platform', 'csv'],
    }
  }
  if (path.includes('/machine-learning-datasets/dataset/')) {
    if (path.includes('/versions')) return machineLearningDatasets
    if (path.includes('/download')) {
      return { status: 'accepted', task_id: 'local-preview-export', dataset_id: 3101, export_format: 'platform', message: '本地演示导出任务已提交' }
    }
    if (path.includes('/page')) return page(machineLearningDatasets, pageNumber, size)
    if (/\/machine-learning-datasets\/dataset\/\d+\/\d+$/.test(path)) {
      return {
        ...machineLearningDatasets[0],
        base_url: 'https://example.com',
        storage_path: '/demo/ml-datasets/defect-classification',
        dataset_path: '/demo/ml-datasets/defect-classification/V1',
        label_schema_path: '/demo/ml-datasets/defect-classification/label_schema.json',
        file_size: 42.8,
        label_schema: { 0: '合格', 1: '划痕', 2: '污渍' },
        items: [
          {
            row_number: 1,
            sample_data: [
              {
                sample_id: 1,
                annotations: [1],
                data: { content: '', image: '/demo/defect-001.jpg' },
              },
            ],
          },
        ],
        total: 1,
        page: pageNumber,
        size,
        pages: 1,
      }
    }
    return page(machineLearningDatasets, pageNumber, size)
  }

  if (path.includes('/training-datasets') || path.includes('/datasets') || path.includes('/inference-result-datasets')) {
    if (path.includes('/logs')) return { archived: false, logs: ['本地演示：任务日志正常。'] }
    return page(datasets, pageNumber, size)
  }
  if (path.includes('/training_tasks') || path.includes('/finetune/tasks')) {
    if (path.includes('/logs')) return { archived: false, logs: ['本地演示：训练任务日志正常。'] }
    if (path.includes('/metrics')) return []
    if (path.includes('/checkpoints')) return []
    return page(trainingTasks, pageNumber, size)
  }
  if (path.includes('/data_cleaning/')) {
    if (path.includes('/operators/categories')) {
      return {
        categories: [
          {
            category: 'deduplication',
            category_name: '文本去重',
            operators: [
              {
                type: 'text_deduplicate',
                name: '文本去重',
                category: 'deduplication',
                description: '识别并过滤高度重复的文本样本',
                params_schema: {
                  threshold: {
                    type: 'float',
                    default: 0.9,
                    description: '相似度阈值',
                    ui_type: 'number',
                    min: 0,
                    max: 1,
                    step: 0.01,
                  },
                },
              },
            ],
          },
          {
            category: 'sensitive_data_cleaning',
            category_name: '敏感数据清洗',
            operators: [
              {
                type: 'sensitive_mask',
                name: '敏感信息脱敏',
                category: 'sensitive_data_cleaning',
                description: '对手机号、身份证等敏感字段进行脱敏',
                params_schema: {
                  mask_phone: {
                    type: 'bool',
                    default: true,
                    description: '手机号脱敏',
                    ui_type: 'switch',
                  },
                },
              },
            ],
          },
        ],
      }
    }
    if (path.includes('/operators')) {
      return [
        {
          type: 'text_deduplicate',
          name: '文本去重',
          category: 'deduplication',
          description: '识别并过滤高度重复的文本样本',
          params_schema: {},
        },
      ]
    }
    if (path.includes('/templates')) return page([], pageNumber, size)
    if (path.includes('/comparison')) {
      return {
        ...cleaningTasks[0],
        override: false,
        selected_fields: ['instruction', 'output'],
        dataset_path: '/demo/customer-service-sft.jsonl',
        preview_samples: [],
        comparisons: [
          {
            mapping_key: 'sample-001',
            before_data: { instruction: '请问订单怎么退款？电话 13800000000', output: '请在订单详情提交退款申请。' },
            after_data: { instruction: '请问订单怎么退款？电话 138****0000', output: '请在订单详情提交退款申请。' },
            before_index: 1,
            after_index: 1,
            status: 'modified',
            changes: { instruction: '手机号脱敏' },
            filter_reason: null,
          },
        ],
      }
    }
    if (/\/data_cleaning\/tasks\/\d+$/.test(path)) return cleaningTasks[0]
    return page(cleaningTasks, pageNumber, size)
  }
  if (path.includes('/evaluation-tasks') || path.includes('/benchmark') || path.includes('/manual-evaluation-tasks')) {
    if (path.includes('/metrics')) return page([], pageNumber, size)
    return page([], pageNumber, size)
  }
  if (path.includes('/online_inference_service') || path.includes('/inference_tasks')) return page([], pageNumber, size)
  if (path.includes('/file-management')) return page([], pageNumber, size)
  if (path.includes('/tags/business/') || path.includes('/tags/types/')) return { data: [] }
  if (path.includes('/tags/')) return []
  if (path.includes('/task-executions')) return ok
  if (path.includes('/openapi-applications')) return page([], pageNumber, size)

  if (method === 'get') return page([], pageNumber, size)
  return undefined
}

export const createLocalPreviewResponse = (
  config: AxiosRequestConfig,
  data: unknown,
): AxiosResponse => ({
  data,
  status: 200,
  statusText: 'OK',
  headers: {},
  config: config as any,
  request: {},
})
