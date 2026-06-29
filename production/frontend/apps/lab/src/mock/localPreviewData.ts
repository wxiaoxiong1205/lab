import type { KubernetesCluster, Project, RegistryConfig, StorageConfig } from '@/types'
import type { User } from '@/types'
import type { BaseModel, BaseModelListResponse, GetBaseModelsParams } from '@/types/model'
import type { RegistryMirrorImage, RegistryMirrorImageListResponse } from '@/services/RegistryMirrorService'

const now = '2026-06-24T15:30:00+08:00'

// 演示数据主路径应来自后端 demo_showcase seed；前端预览数据只允许通过显式开关兜底。
export const isLocalPreview = import.meta.env.VITE_SHOWCASE_PREVIEW === 'true'

export const previewTenantAdminCredentials = {
  account: 'lab@lab',
  username: 'lab',
  enterpriseCode: 'lab',
  password: 'abcd1234',
}

export const previewTenantAdminUser: User = {
  userId: 10001,
  username: previewTenantAdminCredentials.username,
  accountId: 10001,
  tenantId: 'lab',
  enterpriseCode: previewTenantAdminCredentials.enterpriseCode,
}

export const previewTenantAdminToken = 'local-preview-lab-tenant-admin-token'

export const previewProjects: Project[] = [
  {
    id: 1001,
    name: '演示项目 - 大模型训练',
    description: '本地预览使用的演示项目，覆盖训练、推理、评估主流程。',
    kubernetes_id: 3001,
    kubernetes_name: 'preview-gpu-cluster',
    admin_user_ids: [1],
    is_project_admin: true,
    is_platform_admin: true,
    is_tenant_admin: true,
    created_at: now,
    updated_at: now,
  },
  {
    id: 1002,
    name: '演示项目 - 机器学习',
    description: '用于验证机器学习数据集、Notebook 与基础资源配置。',
    kubernetes_id: 3001,
    kubernetes_name: 'preview-gpu-cluster',
    admin_user_ids: [1],
    is_project_admin: true,
    is_platform_admin: false,
    is_tenant_admin: true,
    created_at: now,
    updated_at: now,
  },
]

export const previewBaseModels: BaseModel[] = [
  {
    id: '2001',
    name: 'Qwen2.5-7B-Instruct',
    model_source: 'ModelScope',
    k8s_id: '3001',
    model_provider: 'qwen',
    model_type: ['text-generation'],
    description: '演示基础模型，支持大模型训练与在线推理链路预览。',
    created_at: '2026-06-20T10:00:00+08:00',
    updated_at: '2026-06-22T16:30:00+08:00',
    model_tags: ['training', 'inference'],
    status: '已完成',
    schedule_at: undefined,
  },
  {
    id: '2002',
    name: 'Qwen2.5-VL-7B-Instruct',
    model_source: 'ModelScope',
    k8s_id: '3001',
    model_provider: 'qwen',
    model_type: ['image-understanding'],
    description: '演示多模态基础模型，用于图像理解任务配置预览。',
    created_at: '2026-06-21T09:15:00+08:00',
    updated_at: '2026-06-23T11:20:00+08:00',
    model_tags: ['training', 'inference'],
    status: '下载中',
    schedule_at: undefined,
  } as BaseModel & { progress: string },
  {
    id: '2003',
    name: 'llama-3.1-8b-instruct',
    model_source: 'Local',
    k8s_id: '3001',
    model_provider: 'llama',
    model_type: ['text-generation'],
    description: '本地仓库中的演示模型，便于验证 Local 来源表单逻辑。',
    created_at: '2026-06-18T14:05:00+08:00',
    updated_at: '2026-06-19T17:45:00+08:00',
    model_tags: ['inference'],
    status: '已创建',
    schedule_at: undefined,
  },
]

export const previewKubernetesClusters: KubernetesCluster[] = [
  {
    id: '3001',
    name: 'preview-gpu-cluster',
    server: 'https://k8s-preview.example.local',
    api_server: 'https://k8s-preview.example.local',
    status: 'online',
    description: '本地预览集群，模拟 4 卡 GPU 资源池。',
    version: 'v1.28.8',
    nodeCount: 6,
    node_number: 6,
    createdAt: now,
    updatedAt: now,
    created_at: now,
    updated_at: now,
    created_by: 'tenant_admin',
    storage_id: 4001,
    repository_id: 5001,
    is_mount: true,
    ext: {
      graphics_card_resource_type: [
        {
          category: 'NVIDIA',
          resource_types: [
            { type: 'GPU', model: 'A800', memory: '80GB' },
            { type: 'GPU', model: 'L20', memory: '48GB' },
          ],
        },
      ],
    },
  },
]

export const previewStorageConfigs: StorageConfig[] = [
  {
    id: 4001,
    name: 'preview-minio',
    description: '演示对象存储，用于模型文件、数据集文件和评估产物预览。',
    type: 'minio',
    config: {
      endpoint: 'http://minio-preview.example.local:9000',
      bucket: 'deepexilab-preview',
    },
    status: '连接正常',
    cluster_number: 1,
    last_test_at: now,
    test_status: 'success',
    test_message: '演示连接正常',
    created_at: now,
    updated_at: now,
    created_id: 1,
    created_by: 'tenant_admin',
    is_init: true,
  },
]

export const previewRegistryConfigs: RegistryConfig[] = [
  {
    id: 5001,
    name: 'preview-harbor',
    registry_type: 'private_harbor',
    type: 'private_harbor',
    repository_address: 'harbor-preview.example.local/deepexilab',
    auth_type: 'username_password',
    auth_config: { username: 'preview' },
    manager_address: 'https://harbor-preview.example.local',
    cluster_number: 1,
    status: '连接正常',
    namespace: 'deepexilab',
    created_at: now,
    updated_at: now,
    created_id: 1,
    created_by: 'tenant_admin',
  },
]

export const previewRegistryImages: RegistryMirrorImage[] = [
  {
    id: 6001,
    name: 'pytorch-2.3-cuda12.1',
    project_id: 1001,
    business_id: 0,
    base_image: 'nvidia/cuda:12.1.1-cudnn8-devel-ubuntu22.04',
    output_image: 'harbor-preview.example.local/deepexilab/pytorch:2.3-cuda12.1',
    image_type: 11,
    trigger_type: 'manual',
    status: '已完成',
    lab_k8s_uuid: 'preview-gpu-cluster',
    log_path: null,
    image_address: 'harbor-preview.example.local/deepexilab/pytorch:2.3-cuda12.1',
    created_at: now,
    updated_at: now,
    created_by: 'tenant_admin',
    tags: [],
    output_image_id: 6001,
    image: 'harbor-preview.example.local/deepexilab/pytorch:2.3-cuda12.1',
    type: 11,
    describe: 'Notebook 和训练任务通用演示镜像',
    repository_id: 5001,
    repository_name: 'preview-harbor',
    namespace: 'deepexilab',
  },
]

export function previewProjectList(page = 1, size = 50) {
  return {
    items: previewProjects.slice((page - 1) * size, page * size),
    total: previewProjects.length,
    page,
    size,
  }
}

export function previewBaseModelList(params: GetBaseModelsParams = {}): BaseModelListResponse {
  const page = params.page ?? 1
  const size = params.size ?? 50
  const filtered = previewBaseModels.filter((model) => {
    const matchName = !params.name || model.name.toLowerCase().includes(params.name.toLowerCase())
    const matchProvider = !params.model_provider || model.model_provider === params.model_provider
    const modelTypes = Array.isArray(model.model_type) ? model.model_type : [model.model_type]
    const matchType = !params.model_type || modelTypes.includes(params.model_type)
    const matchStatus = !params.status || model.status === params.status
    const matchTags = !params.model_tags || model.model_tags.includes(params.model_tags)
    return matchName && matchProvider && matchType && matchStatus && matchTags
  })

  return {
    items: filtered.slice((page - 1) * size, page * size),
    total: filtered.length,
    page,
    size,
  }
}

export function previewStorageConfigList(page = 1, pageSize = 10) {
  return {
    items: previewStorageConfigs.slice((page - 1) * pageSize, page * pageSize),
    total: previewStorageConfigs.length,
    page,
    page_size: pageSize,
  }
}

export function previewRegistryConfigList(page = 1, size = 10) {
  return {
    items: previewRegistryConfigs.slice((page - 1) * size, page * size),
    total: previewRegistryConfigs.length,
    page,
    size,
  }
}

export function previewRegistryImageList(page = 1, size = 10): RegistryMirrorImageListResponse {
  return {
    items: previewRegistryImages.slice((page - 1) * size, page * size),
    total: previewRegistryImages.length,
    page,
    size,
    pages: Math.ceil(previewRegistryImages.length / size),
  }
}
