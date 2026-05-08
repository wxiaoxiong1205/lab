import type {
  DatasetRecord,
  EvaluationTask,
  EvaluationIndicator,
  ModelService,
  MLDataset,
  MLAnnotationTask,
  Project,
  KubernetesCluster,
  StorageConfig,
  ImageRegistry,
  ImageRecord,
  BaseModelRecord,
  SystemSetting,
  PlatformAdmin,
} from '../types/shared'
import { mockBaseModelCatalog } from './modelCatalog'

// ============ 数据服务 Mock 数据 ============

export const mockTrainingDatasets: DatasetRecord[] = [
  { id: '1', name: '多轮对话训练集', latestVersion: 'v3.1', versionStatus: 'released', dataUsage: '训练', dataFormat: 'jsonl', creator: 'admin', createdAt: '2026/03/10 10:00:00', charCount: 1250000, sampleCount: 5000, trainRatio: 85 },
  { id: '2', name: '单轮问答训练集', latestVersion: 'v2.0', versionStatus: 'released', dataUsage: '训练', dataFormat: 'jsonl', creator: 'lab1', createdAt: '2026/03/08 14:30:00', charCount: 860000, sampleCount: 3200, trainRatio: 80 },
  { id: '3', name: '医疗问答训练集', latestVersion: 'v1.0', versionStatus: 'draft', dataUsage: '训练', dataFormat: 'xlsx', creator: 'lab2', createdAt: '2026/03/05 09:15:00', charCount: 2100000, sampleCount: 8000, trainRatio: 100 },
]

export const mockTestDatasets: DatasetRecord[] = [
  { id: '1', name: '对话测试数据集', latestVersion: 'v2.0', versionStatus: 'released', dataUsage: '测试', dataFormat: 'jsonl', createdAt: '2026/03/12 11:00:00' },
  { id: '2', name: '意图识别测试集', latestVersion: 'v1.0', versionStatus: 'released', dataUsage: '测试', dataFormat: 'csv', createdAt: '2026/03/14 15:30:00' },
]

export const mockInferenceResults: DatasetRecord[] = [
  { id: '1', name: '文本生成推理结果_20260325', inferenceProgress: 100, dataUsage: '推理', pendingData: 'test_input_v2.jsonl', pendingModel: 'Qwen2.5-7B-Instruct', dataVolume: 10000, createdAt: '2026/03/25 09:00:00' },
  { id: '2', name: '情感分析推理_20260323', inferenceProgress: 45, dataUsage: '推理', pendingData: 'sentiment_data_v3.jsonl', pendingModel: 'Qwen3-8B', dataVolume: 50000, createdAt: '2026/03/23 14:20:00' },
]

// ============ 模型评估 Mock 数据 ============

export const mockEffectEvaluations: EvaluationTask[] = [
  { id: '1', name: 'Qwen2.5-7B 效果评估', model: 'Qwen2.5-7B-Instruct', indicator: 'BLEU/ROUGE', result: '78.5', status: 'completed', createdAt: '2026/03/24 10:00:00', creator: 'admin' },
  { id: '2', name: 'LoRA微调效果对比', model: 'Qwen2.5-0.5B-LoRA', indicator: 'Loss/Accuracy', result: '0.23 / 92.1%', status: 'completed', createdAt: '2026/03/22 15:30:00', creator: 'lab1' },
  { id: '3', name: '图像理解模型评估', model: 'Qwen2-VL-2B-Instruct', indicator: 'CIDEr/SPICE', result: '65.2', status: 'running', createdAt: '2026/03/26 09:15:00', creator: 'admin' },
]

export const mockEvaluationIndicators: EvaluationIndicator[] = [
  { id: '1', name: 'BLEU', type: '翻译质量', description: '衡量生成文本与参考文本的n-gram重叠度', calculationMethod: 'n-gram precision' },
  { id: '2', name: 'ROUGE-L', type: '摘要质量', description: '衡量生成摘要与参考摘要的最长公共子序列', calculationMethod: 'LCS' },
  { id: '3', name: 'Accuracy', type: '分类准确率', description: '正确分类样本占总样本比例', calculationMethod: 'correct / total' },
  { id: '4', name: 'F1-Score', type: '综合指标', description: '精确率和召回率的调和平均', calculationMethod: '2 * P * R / (P + R)' },
  { id: '5', name: 'Perplexity', type: '语言模型', description: '衡量语言模型的不确定性', calculationMethod: 'exp(-1/N * sum(log_p))' },
]

// ============ 模型服务 Mock 数据 ============

export const mockHostedServices: ModelService[] = [
  { id: '1', name: '文本生成服务', modelVersion: 'Qwen2.5-7B-Instruct-v3', status: 'running', accessUrl: 'https://api.example.com/v1/chat', createdAt: '2026/03/20 10:00:00', creator: 'admin' },
  { id: '2', name: '图像理解服务', modelVersion: 'Qwen2-VL-2B-Instruct-v2', status: 'stopped', accessUrl: 'https://api.example.com/v1/vision', createdAt: '2026/03/18 14:30:00', creator: 'lab1' },
  { id: '3', name: '意图识别服务', modelVersion: 'Qwen2.5-1.5B-Instruct-v1', status: 'running', accessUrl: 'https://api.example.com/v1/intent', createdAt: '2026/03/22 09:00:00', creator: 'admin' },
]

export const mockInferenceServices: ModelService[] = [
  { id: '1', name: '实时推理服务-7B', inferenceModel: 'Qwen2.5-7B-Instruct', status: 'running', qps: 128, latency: '45ms', createdAt: '2026/03/19 11:00:00', creator: 'admin' },
  { id: '2', name: '实时推理服务-1.5B', inferenceModel: 'Qwen2.5-1.5B-Instruct', status: 'running', qps: 256, latency: '22ms', createdAt: '2026/03/17 08:30:00', creator: 'lab1' },
  { id: '3', name: '批量推理服务', inferenceModel: 'Qwen3-8B', status: 'stopped', qps: 0, latency: '--', createdAt: '2026/03/15 16:00:00', creator: 'lab2' },
]

// ============ 机器学习 Mock 数据 ============

export const mockMLDatasets: MLDataset[] = [
  { id: '1', name: '图像分类数据集', version: 'v2.0', dataType: '图像', annotationType: '图像分类', annotationTemplate: 'ImageNet分类模板', createdAt: '2026/03/10 09:00:00' },
  { id: '2', name: 'NER标注数据集', version: 'v1.5', dataType: '文本', annotationType: '命名实体识别', annotationTemplate: '通用NER模板', createdAt: '2026/03/08 14:30:00' },
  { id: '3', name: '情感分析数据集', version: 'v1.0', dataType: '文本', annotationType: '情感分类', annotationTemplate: '三元组情感模板', createdAt: '2026/03/05 11:00:00' },
]

export const mockMLAnnotationTasks: MLAnnotationTask[] = [
  { id: '1', name: '图像分类标注-批次A', dataset: '图像分类数据集', progress: '800/1000', status: 'in_progress', createdAt: '2026/03/23 10:00:00' },
  { id: '2', name: 'NER标注-医疗数据', dataset: 'NER标注数据集', progress: '500/2000', status: 'in_progress', createdAt: '2026/03/22 14:30:00' },
  { id: '3', name: '情感标注-商品评论', dataset: '情感分析数据集', progress: '1500/1500', status: 'completed', createdAt: '2026/03/20 09:00:00' },
]

// ============ 系统管理 Mock 数据 ============

export const mockProjects: Project[] = [
  { id: '1', name: 'V1.12测试项目', description: '大模型训练平台测试项目', boundCluster: '测试集群-01', memberCount: 5, createdAt: '2026/01/15 08:00:00' },
  { id: '2', name: '生产环境项目', description: '正式生产环境使用', boundCluster: '生产集群-A', memberCount: 12, createdAt: '2026/02/01 10:00:00' },
  { id: '3', name: '算法研究项目', description: '新算法研究和实验', boundCluster: '测试集群-02', memberCount: 3, createdAt: '2026/03/01 14:00:00' },
]

export const mockKubernetesClusters: KubernetesCluster[] = [
  { id: '1', name: '测试集群-01', description: '测试环境 Kubernetes 集群', apiServer: 'https://k8s-test.example.com:6443', kubeconfig: 'apiVersion: v1\nclusters:\n- cluster:\n    server: https://k8s-test.example.com:6443', labels: ['dev', 'test'], nodeCount: 8, connectionStatus: 'connected', mountStatus: 'mounted', storageConfig: 'NFS-测试存储', imageRegistry: 'harbor-test.example.com', createdAt: '2026/01/10 09:00:00' },
  { id: '2', name: '生产集群-A', description: '生产环境高内存集群', apiServer: 'https://k8s-prod.example.com:6443', kubeconfig: 'apiVersion: v1\nclusters:\n- cluster:\n    server: https://k8s-prod.example.com:6443', labels: ['prod', 'high-memory'], nodeCount: 32, connectionStatus: 'connected', mountStatus: 'mounted', storageConfig: 'Ceph-生产存储', imageRegistry: 'harbor-prod.example.com', createdAt: '2026/02/01 10:00:00' },
  { id: '3', name: 'GPU集群-01', description: '训练任务 GPU 集群', apiServer: 'https://k8s-gpu.example.com:6443', kubeconfig: 'apiVersion: v1\nclusters:\n- cluster:\n    server: https://k8s-gpu.example.com:6443', labels: ['gpu', '训练'], nodeCount: 16, connectionStatus: 'disconnected', mountStatus: 'unmounted', createdAt: '2026/03/05 14:30:00' },
]

export const mockStorageConfigs: StorageConfig[] = [
  { id: '1', name: '测试环境存储', description: '', type: '火山引擎 TOS', endpoint: 'tos-cn-beijing.volces.com', region: 'cn-beijing', bucket: 'lab-juicefs-test-not-sanyuan', accessKeyId: 'VOLCENGINE_ACCESS_KEY_ID_PLACEHOLDER', accessKeySecret: 'VOLCENGINE_ACCESS_KEY_SECRET_PLACEHOLDER', clusterCount: 2, connectionStatus: 'connected', lastTestTime: '2026/03/26 10:00:00' },
  { id: '2', name: 'MinIO-研发存储', description: '研发环境对象存储', type: 'MinIO', endpoint: 'minio-dev.deepexi.local', region: 'local', bucket: 'lab-dev', accessKeyId: 'minio-access-key', accessKeySecret: 'minio-secret-key', clusterCount: 3, connectionStatus: 'connected', lastTestTime: '2026/03/26 09:30:00' },
  { id: '3', name: 'NFS-共享存储', description: '训练共享目录', type: 'NFS', endpoint: 'nfs.lab.local:/data/share', region: '-', bucket: 'lab-share', accessKeyId: '-', accessKeySecret: '-', clusterCount: 1, connectionStatus: 'untested', lastTestTime: '--' },
]

export const mockImageRegistries: ImageRegistry[] = [
  { id: '1', name: 'Harbor测试仓库', namespace: 'deepexi/test', address: 'harbor-test.example.com', authType: '用户名密码', adminAddress: 'https://harbor-test.example.com', boundClusterCount: 2, status: 'normal', createdAt: '2026/01/10 09:00:00' },
  { id: '2', name: 'Harbor生产仓库', namespace: 'deepexi/prod', address: 'harbor-prod.example.com', authType: 'Token', adminAddress: 'https://harbor-prod.example.com', boundClusterCount: 3, status: 'normal', createdAt: '2026/02/01 10:00:00' },
  { id: '3', name: 'Docker Hub镜像', namespace: 'library', address: 'registry.hub.docker.com', authType: '公开', boundClusterCount: 1, status: 'normal', createdAt: '2026/03/01 11:00:00' },
]

export const mockImageRecords: ImageRecord[] = [
  { id: '1', name: 'deepspeed-trainer:v1.2', description: 'DeepSpeed训练镜像', category: '模型训练', registry: 'Harbor测试仓库', namespace: 'training', addedAt: '2026/03/10 14:00:00' },
  { id: '2', name: 'vllm-inference:v2.0', description: 'vLLM推理服务镜像', category: '模型部署', registry: 'Harbor测试仓库', namespace: 'inference', addedAt: '2026/03/15 10:00:00' },
  { id: '3', name: 'transformers:v4.40', description: 'HuggingFace Transformers基础镜像', category: '大模型-在线Notebook', registry: 'Docker Hub镜像', namespace: 'library', addedAt: '2026/03/08 09:00:00' },
  { id: '4', name: 'ml-notebook-runtime:v1.0', description: '机器学习在线Notebook镜像', category: '机器学习-在线Notebook', registry: 'Harbor生产仓库', namespace: 'notebook', addedAt: '2026/03/20 08:30:00' },
]

export const mockBaseModels: BaseModelRecord[] = mockBaseModelCatalog

export const mockSystemSettings: SystemSetting[] = [
  { id: '1', name: '训练最大GPU数', description: '单次训练任务最大使用GPU数量', inputType: 'number', value: '8', group: '训练配置', required: true },
  { id: '2', name: '模型存储路径', description: '训练产物的默认存储路径', inputType: 'text', value: '/data/models', group: '存储配置', required: true },
  { id: '3', name: '数据存储路径', description: '数据集的默认存储路径', inputType: 'text', value: '/data/datasets', group: '存储配置', required: true },
  { id: '4', name: '允许公开访问API', description: '是否允许平台API公开访问', inputType: 'boolean', value: 'false', group: '安全配置', required: false },
  { id: '5', name: '会话超时时间(分钟)', description: '用户会话超时时间', inputType: 'number', value: '120', group: '会话配置', required: true },
  { id: '6', name: '最大并发训练任务数', description: '同一项目最大并发训练任务数量', inputType: 'number', value: '3', group: '训练配置', required: true },
]

export const mockPlatformAdmins: PlatformAdmin[] = [
  { id: '1', account: 'admin', username: '平台管理员', email: 'admin@deepexi.com', joinedAt: '2026/01/01 00:00:00' },
  { id: '2', account: 'lab1', username: '研发工程师A', email: 'lab1@deepexi.com', joinedAt: '2026/02/15 10:00:00' },
  { id: '3', account: 'lab2', username: '算法工程师B', email: 'lab2@deepexi.com', joinedAt: '2026/03/01 14:30:00' },
]
