import type {
  CaseCloneRequest,
  CaseCloneResponse,
  CaseSearchParams,
  CreateNotebookRequest,
  GPUNode,
  JupyterNotebook,
  NotebookCase,
  NotebookCaseCategory,
  NotebookCaseDetail,
  NotebookInstance,
  NotebookLog,
  NotebookMetrics,
  NotebookOperation,
  NotebookSearchParams,
  NotebookTemplate,
  StorageClass,
  UpdateNotebookRequest,
} from '../types'

// Mock数据
const mockNotebookTemplates: NotebookTemplate[] = [
  {
    id: 'jupyter-python-39',
    name: 'Jupyter Python 3.9',
    description: 'Python 3.9 with Jupyter Lab, NumPy, Pandas, Matplotlib, Scikit-learn',
    image: 'jupyter/datascience-notebook:python-3.9',
    image_address: 'docker.io/jupyter/datascience-notebook:python-3.9',

    category: 'python',
    tags: ['python', 'jupyter', 'datascience', 'machine-learning'],
    default_resources: {
      cpu: '1',
      memory: '2Gi',
      gpu_supported: true,
    },
    packages: ['numpy', 'pandas', 'matplotlib', 'scikit-learn', 'jupyter'],
    recommended: true,
    version: '3.9.7',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'jupyter-python-311',
    name: 'Jupyter Python 3.11',
    description: 'Python 3.11 with Jupyter Lab, TensorFlow, PyTorch, latest ML libraries',
    image_address: 'docker.io/jupyter/datascience-notebook:python-3.9',
    image: 'jupyter/tensorflow-notebook:python-3.11',
    category: 'python',
    tags: ['python', 'jupyter', 'tensorflow', 'pytorch', 'deep-learning'],
    default_resources: {
      cpu: '2',
      memory: '4Gi',
      gpu_supported: true,
    },
    packages: ['tensorflow', 'pytorch', 'numpy', 'pandas', 'matplotlib'],
    recommended: true,
    version: '3.11.0',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'jupyter-r-43',
    name: 'Jupyter R 4.3',
    description: 'R 4.3 with Jupyter Lab, tidyverse, ggplot2, statistical packages',
    image_address: 'docker.io/jupyter/datascience-notebook:python-3.9',
    image: 'jupyter/r-notebook:r-4.3',
    category: 'r',
    tags: ['r', 'jupyter', 'statistics', 'data-analysis'],
    default_resources: {
      cpu: '1',
      memory: '2Gi',
      gpu_supported: false,
    },
    packages: ['tidyverse', 'ggplot2', 'dplyr', 'shiny'],
    recommended: false,
    version: '4.3.0',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'jupyter-julia-19',
    name: 'Jupyter Julia 1.9',
    description: 'Julia 1.9 with Jupyter Lab, scientific computing packages',
    image_address: 'docker.io/jupyter/datascience-notebook:python-3.9',
    image: 'jupyter/julia-notebook:julia-1.9',
    category: 'julia',
    tags: ['julia', 'jupyter', 'scientific-computing'],
    default_resources: {
      cpu: '1',
      memory: '2Gi',
      gpu_supported: true,
    },
    packages: ['Plots', 'DataFrames', 'StatsBase', 'MLJ'],
    recommended: false,
    version: '1.9.0',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
]

// Mock数据：精选案例分类
const mockCaseCategories: NotebookCaseCategory[] = [
  {
    id: 'machine-learning',
    name: '机器学习',
    description: '经典机器学习算法和应用案例',
    icon: '🤖',
    color: '#1890ff',
    sort_order: 1,
  },
  {
    id: 'deep-learning',
    name: '深度学习',
    description: '深度学习模型和神经网络案例',
    icon: '🧠',
    color: '#722ed1',
    sort_order: 2,
  },
  {
    id: 'data-analysis',
    name: '数据分析',
    description: '数据探索、可视化和分析案例',
    icon: '📊',
    color: '#13c2c2',
    sort_order: 3,
  },
  {
    id: 'nlp',
    name: '自然语言处理',
    description: '文本分析和NLP应用案例',
    icon: '💬',
    color: '#52c41a',
    sort_order: 4,
  },
  {
    id: 'computer-vision',
    name: '计算机视觉',
    description: '图像处理和计算机视觉案例',
    icon: '👁️',
    color: '#fa8c16',
    sort_order: 5,
  },
]

// Mock数据：精选案例
const mockNotebookCases: NotebookCase[] = [
  {
    id: 'iris-classification',
    name: 'Iris花卉分类',
    description: '使用机器学习算法对鸢尾花进行分类的经典案例',
    category_id: 'machine-learning',
    category_name: '机器学习',
    difficulty: 'beginner',
    duration: 30,
    tech_stack: ['Python', 'scikit-learn', 'pandas', 'matplotlib'],
    tags: ['分类', '入门', '经典案例'],
    resource_requirements: {
      cpu: '0.5',
      memory: '1Gi',
      gpu_required: false,
      storage: '1Gi',
    },
    thumbnail: '/cases/iris-classification/thumbnail.png',
    notebook_file: '/cases/iris-classification/iris_classification.ipynb',
    dataset_files: ['/cases/iris-classification/iris.csv'],
    readme_file: '/cases/iris-classification/README.md',
    view_count: 1250,
    clone_count: 340,
    rating: 4.7,
    dependencies: ['numpy', 'pandas', 'scikit-learn', 'matplotlib', 'seaborn'],
    environment: {
      python_version: '3.9',
      packages: ['numpy==1.21.0', 'pandas==1.3.0', 'scikit-learn==1.0.0', 'matplotlib==3.4.0', 'seaborn==0.11.0'],
      conda_environment: 'ml-basics',
    },
    version: '1.2.0',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    created_by: 'DeepEXI Lab',
    learning_objectives: [
      '理解分类问题的基本概念',
      '掌握数据预处理的基本技巧',
      '学会使用scikit-learn进行模型训练',
      '了解模型评估的基本方法',
    ],
    prerequisites: ['Python基础', '基本的数据结构知识'],
    next_steps: ['学习更复杂的分类算法', '尝试其他数据集', '学习特征工程'],
  },
  {
    id: 'pytorch-cnn',
    name: 'PyTorch CNN图像分类',
    description: '使用PyTorch构建卷积神经网络进行图像分类',
    category_id: 'deep-learning',
    category_name: '深度学习',
    difficulty: 'intermediate',
    duration: 90,
    tech_stack: ['Python', 'PyTorch', 'torchvision', 'matplotlib'],
    tags: ['深度学习', 'CNN', '图像分类', 'PyTorch'],
    resource_requirements: {
      cpu: '2',
      memory: '4Gi',
      gpu_required: true,
      gpu_type: 'nvidia-tesla-v100',
      storage: '5Gi',
    },
    thumbnail: '/cases/pytorch-cnn/thumbnail.png',
    notebook_file: '/cases/pytorch-cnn/pytorch_cnn.ipynb',
    dataset_files: ['/cases/pytorch-cnn/cifar10.tar.gz'],
    readme_file: '/cases/pytorch-cnn/README.md',
    view_count: 980,
    clone_count: 210,
    rating: 4.5,
    dependencies: ['torch', 'torchvision', 'matplotlib', 'numpy', 'pillow'],
    environment: {
      python_version: '3.9',
      packages: ['torch==1.12.0', 'torchvision==0.13.0', 'matplotlib==3.4.0', 'numpy==1.21.0', 'pillow==9.0.0'],
      conda_environment: 'pytorch-env',
    },
    version: '2.1.0',
    created_at: '2024-01-05T00:00:00Z',
    updated_at: '2024-01-20T14:30:00Z',
    created_by: 'DeepEXI Lab',
    learning_objectives: [
      '理解卷积神经网络的基本原理',
      '掌握PyTorch的基本使用方法',
      '学会构建和训练CNN模型',
      '了解GPU加速训练的方法',
    ],
    prerequisites: ['Python基础', '深度学习基础知识', '线性代数基础'],
    next_steps: ['学习更复杂的CNN架构', '尝试迁移学习', '学习目标检测'],
  },
  {
    id: 'pandas-data-analysis',
    name: 'Pandas数据分析入门',
    description: '使用Pandas进行数据处理和分析的完整教程',
    category_id: 'data-analysis',
    category_name: '数据分析',
    difficulty: 'beginner',
    duration: 60,
    tech_stack: ['Python', 'pandas', 'numpy', 'matplotlib', 'seaborn'],
    tags: ['数据分析', '数据处理', 'pandas', '入门'],
    resource_requirements: {
      cpu: '1',
      memory: '2Gi',
      gpu_required: false,
      storage: '2Gi',
    },
    thumbnail: '/cases/pandas-data-analysis/thumbnail.png',
    notebook_file: '/cases/pandas-data-analysis/pandas_tutorial.ipynb',
    dataset_files: ['/cases/pandas-data-analysis/sales_data.csv', '/cases/pandas-data-analysis/customer_data.xlsx'],
    readme_file: '/cases/pandas-data-analysis/README.md',
    view_count: 1580,
    clone_count: 520,
    rating: 4.8,
    dependencies: ['pandas', 'numpy', 'matplotlib', 'seaborn', 'openpyxl'],
    environment: {
      python_version: '3.9',
      packages: ['pandas==1.3.0', 'numpy==1.21.0', 'matplotlib==3.4.0', 'seaborn==0.11.0', 'openpyxl==3.0.7'],
      conda_environment: 'data-analysis',
    },
    version: '1.5.0',
    created_at: '2024-01-02T00:00:00Z',
    updated_at: '2024-01-18T16:20:00Z',
    created_by: 'DeepEXI Lab',
    learning_objectives: [
      '掌握Pandas的基本数据结构',
      '学会数据读取和写入',
      '熟练使用数据清洗和预处理技巧',
      '掌握基本的统计分析方法',
    ],
    prerequisites: ['Python基础'],
    next_steps: ['学习高级数据分析技巧', '尝试机器学习项目', '学习数据可视化'],
  },
  {
    id: 'bert-text-classification',
    name: 'BERT文本分类',
    description: '使用预训练BERT模型进行文本分类任务',
    category_id: 'nlp',
    category_name: '自然语言处理',
    difficulty: 'advanced',
    duration: 120,
    tech_stack: ['Python', 'transformers', 'torch', 'datasets'],
    tags: ['NLP', 'BERT', '文本分类', 'transformers'],
    resource_requirements: {
      cpu: '4',
      memory: '8Gi',
      gpu_required: true,
      gpu_type: 'nvidia-tesla-v100',
      storage: '10Gi',
    },
    thumbnail: '/cases/bert-text-classification/thumbnail.png',
    notebook_file: '/cases/bert-text-classification/bert_classification.ipynb',
    dataset_files: ['/cases/bert-text-classification/imdb_dataset.zip'],
    readme_file: '/cases/bert-text-classification/README.md',
    view_count: 760,
    clone_count: 150,
    rating: 4.6,
    dependencies: ['transformers', 'torch', 'datasets', 'numpy', 'pandas'],
    environment: {
      python_version: '3.9',
      packages: ['transformers==4.20.0', 'torch==1.12.0', 'datasets==2.0.0', 'numpy==1.21.0', 'pandas==1.3.0'],
      conda_environment: 'nlp-env',
    },
    version: '1.0.0',
    created_at: '2024-01-10T00:00:00Z',
    updated_at: '2024-01-25T09:15:00Z',
    created_by: 'DeepEXI Lab',
    learning_objectives: [
      '理解BERT模型的基本原理',
      '学会使用Hugging Face transformers库',
      '掌握文本分类的完整流程',
      '了解预训练模型的微调方法',
    ],
    prerequisites: ['Python基础', 'PyTorch基础', 'NLP基础知识'],
    next_steps: ['学习其他NLP任务', '尝试多语言模型', '学习模型压缩技术'],
  },
  {
    id: 'opencv-image-processing',
    name: 'OpenCV图像处理基础',
    description: '使用OpenCV进行图像处理和计算机视觉基础操作',
    category_id: 'computer-vision',
    category_name: '计算机视觉',
    difficulty: 'intermediate',
    duration: 75,
    tech_stack: ['Python', 'OpenCV', 'numpy', 'matplotlib'],
    tags: ['计算机视觉', '图像处理', 'OpenCV', '基础'],
    resource_requirements: {
      cpu: '2',
      memory: '3Gi',
      gpu_required: false,
      storage: '3Gi',
    },
    thumbnail: '/cases/opencv-image-processing/thumbnail.png',
    notebook_file: '/cases/opencv-image-processing/opencv_tutorial.ipynb',
    dataset_files: ['/cases/opencv-image-processing/sample_images.zip'],
    readme_file: '/cases/opencv-image-processing/README.md',
    view_count: 890,
    clone_count: 280,
    rating: 4.4,
    dependencies: ['opencv-python', 'numpy', 'matplotlib', 'pillow'],
    environment: {
      python_version: '3.9',
      packages: ['opencv-python==4.5.0', 'numpy==1.21.0', 'matplotlib==3.4.0', 'pillow==9.0.0'],
      conda_environment: 'cv-env',
    },
    version: '1.3.0',
    created_at: '2024-01-08T00:00:00Z',
    updated_at: '2024-01-22T11:45:00Z',
    created_by: 'DeepEXI Lab',
    learning_objectives: [
      '掌握OpenCV的基本使用方法',
      '学会基本的图像处理操作',
      '了解图像滤波和变换技术',
      '掌握基本的特征检测方法',
    ],
    prerequisites: ['Python基础', '基本的数学知识'],
    next_steps: ['学习深度学习与CV结合', '尝试目标检测项目', '学习图像分割技术'],
  },
]

// Mock数据：示例 Jupyter Notebook 内容
const mockJupyterNotebook: JupyterNotebook = {
  cells: [
    {
      cell_type: 'markdown',
      metadata: {},
      source: [
        '# Iris花卉分类案例\n',
        '\n',
        '这是一个使用机器学习算法对鸢尾花进行分类的经典案例。我们将使用scikit-learn库来实现这个分类任务。\n',
        '\n',
        '## 学习目标\n',
        '- 理解分类问题的基本概念\n',
        '- 掌握数据预处理的基本技巧\n',
        '- 学会使用scikit-learn进行模型训练\n',
        '- 了解模型评估的基本方法\n',
      ],
    },
    {
      cell_type: 'code',
      metadata: {},
      execution_count: 1,
      source: [
        'import numpy as np\n',
        'import pandas as pd\n',
        'import matplotlib.pyplot as plt\n',
        'import seaborn as sns\n',
        'from sklearn.datasets import load_iris\n',
        'from sklearn.model_selection import train_test_split\n',
        'from sklearn.ensemble import RandomForestClassifier\n',
        'from sklearn.metrics import accuracy_score, classification_report\n',
        '\n',
        'print("所有库导入成功！")',
      ],
      outputs: [
        {
          output_type: 'stream',
          name: 'stdout',
          text: ['所有库导入成功！\n'],
        },
      ],
    },
    {
      cell_type: 'markdown',
      metadata: {},
      source: [
        '## 1. 数据加载和探索\n',
        '\n',
        '首先，我们加载鸢尾花数据集并进行初步的数据探索。\n',
      ],
    },
    {
      cell_type: 'code',
      metadata: {},
      execution_count: 2,
      source: [
        '# 加载鸢尾花数据集\n',
        'iris = load_iris()\n',
        'X = iris.data\n',
        'y = iris.target\n',
        '\n',
        '# 创建DataFrame以便更好地查看数据\n',
        'df = pd.DataFrame(X, columns=iris.feature_names)\n',
        'df["target"] = y\n',
        'df["species"] = df["target"].map({0: "setosa", 1: "versicolor", 2: "virginica"})\n',
        '\n',
        'print("数据集形状:", df.shape)\n',
        'print("\\n前5行数据:")\n',
        'df.head()',
      ],
      outputs: [
        {
          output_type: 'stream',
          name: 'stdout',
          text: ['数据集形状: (150, 6)\n', '\n', '前5行数据:\n'],
        },
        {
          output_type: 'execute_result',
          execution_count: 2,
          data: {
            'text/html': ['<div>Table content here</div>'],
            'text/plain': ['DataFrame with iris data'],
          },
        },
      ],
    },
  ],
  metadata: {
    kernelspec: {
      display_name: 'Python 3',
      language: 'python',
      name: 'python3',
    },
    language_info: {
      name: 'python',
      version: '3.9.7',
    },
  },
  nbformat: 4,
  nbformat_minor: 4,
}

const mockNotebookInstances: NotebookInstance[] = [
  {
    id: 1,
    instance_name: 'Python数据分析实验',
    describe: '用于机器学习模型训练的Python环境',
    image: 'jupyter/datascience-notebook:python-3.9',

    // 必需的扁平化资源配置
    resource_cpu_request: '1',
    resource_cpu_limit: '2',
    resource_memory_request: '2Gi',
    resource_memory_limit: '4Gi',
    gpu_type: 'nvidia-tesla-v100',
    gpu_count: 1,

    status: 'running',
    access_url: 'https://notebook-1.example.com',
    created_at: '2024-01-15T09:00:00Z',
    updated_at: '2024-01-15T10:30:00Z',

    // 兼容旧格式的可选字段
    name: 'Python数据分析实验',
    description: '用于机器学习模型训练的Python环境',
    project_id: 'project-1',
    image_display: 'Jupyter Python 3.9',
    resources: {
      cpu: {
        request: '1',
        limit: '2',
      },
      memory: {
        request: '2Gi',
        limit: '4Gi',
      },
      gpu: {
        enabled: true,
        type: 'nvidia-tesla-v100',
        count: 1,
      },
    },
    storage: {
      size: '10Gi',
      storage_class: 'fast-ssd',
      mount_path: '/home/jovyan/work',
      persistent: true,
    },
    network: {
      port: 8888,
      custom_ports: [6006, 8080],
      protocol: 'https',
    },
    access_token: 'token-abc123',
    kubernetes_info: {
      namespace: 'notebooks',
      pod_name: 'notebook-1-pod',
      node_name: 'gpu-node-1',
      cluster_name: 'main-cluster',
    },
    auto_stop_minutes: 120,
    last_activity: '2024-01-15T10:30:00Z',
    started_at: '2024-01-15T09:05:00Z',
  },
  {
    id: 2,
    instance_name: 'R统计分析',
    describe: '用于统计分析和数据可视化的R环境',
    image: 'jupyter/r-notebook:r-4.3',

    // 必需的扁平化资源配置
    resource_cpu_request: '1',
    resource_cpu_limit: '1',
    resource_memory_request: '2Gi',
    resource_memory_limit: '2Gi',
    gpu_count: 0,

    status: 'stopped',
    created_at: '2024-01-14T14:20:00Z',
    updated_at: '2024-01-14T16:45:00Z',

    // 兼容旧格式的可选字段
    name: 'R统计分析',
    description: '用于统计分析和数据可视化的R环境',
    project_id: 'project-1',
    image_display: 'Jupyter R 4.3',
    resources: {
      cpu: {
        request: '1',
        limit: '1',
      },
      memory: {
        request: '2Gi',
        limit: '2Gi',
      },
    },
    storage: {
      size: '5Gi',
      storage_class: 'standard',
      mount_path: '/home/jovyan/work',
      persistent: true,
    },
    network: {
      port: 8888,
      custom_ports: [],
      protocol: 'https',
    },
    kubernetes_info: {
      namespace: 'notebooks',
      pod_name: 'notebook-2-pod',
      node_name: 'cpu-node-1',
      cluster_name: 'main-cluster',
    },
    auto_stop_minutes: 60,
    last_activity: '2024-01-14T16:45:00Z',
    started_at: '2024-01-14T14:05:00Z',
    stopped_at: '2024-01-14T16:45:00Z',
  },
]

const mockGPUNodes: GPUNode[] = [
  {
    node_name: 'gpu-node-1',
    gpu_type: 'nvidia-tesla-v100',
    total_gpus: 4,
    available_gpus: 2,
    gpu_memory: '16Gi',
    node_labels: {
      'nvidia.com/gpu': 'true',
      'accelerator': 'nvidia-tesla-v100',
    },
  },
  {
    node_name: 'gpu-node-2',
    gpu_type: 'nvidia-tesla-a100',
    total_gpus: 2,
    available_gpus: 1,
    gpu_memory: '40Gi',
    node_labels: {
      'nvidia.com/gpu': 'true',
      'accelerator': 'nvidia-tesla-a100',
    },
  },
]

const mockStorageClasses: StorageClass[] = [
  {
    name: 'fast-ssd',
    type: 'ssd',
    description: '高性能SSD存储',
    default: true,
    provisioner: 'kubernetes.io/aws-ebs',
  },
  {
    name: 'standard',
    type: 'hdd',
    description: '标准HDD存储',
    default: false,
    provisioner: 'kubernetes.io/aws-ebs',
  },
]

// 模拟API延迟
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// 模拟API响应
export const mockNotebookService = {
  // 获取Notebook模板列表
  getNotebookTemplates: async (): Promise<NotebookTemplate[]> => {
    await delay(500)
    return mockNotebookTemplates
  },

  // 获取单个Notebook实例
  getNotebookInstance: async (id: number): Promise<NotebookInstance> => {
    await delay(300)

    const instance = mockNotebookInstances.find((item) => item.id === id)
    if (!instance) {
      throw new Error(`Notebook instance not found: ${id}`)
    }

    return instance
  },

  // 创建Notebook实例
  createNotebookInstance: async (data: CreateNotebookRequest): Promise<NotebookInstance> => {
    await delay(1500)

    const template = mockNotebookTemplates.find((t) => t.id === data.template_id)
    if (!template) {
      throw new Error(`Template not found: ${data.template_id}`)
    }

    const newInstance: NotebookInstance = {
      id: Date.now(),
      instance_name: data.name || data.instance_name || 'New Notebook',
      describe: data.description || data.describe,
      image: template.image,

      // 必需的扁平化资源配置
      resource_cpu_request: String(data.resources?.cpu_request || data.resource_cpu_request || '1'),
      resource_cpu_limit: String(data.resources?.cpu_limit || data.resource_cpu_limit || '2'),
      resource_memory_request: String(data.resources?.memory_request || data.resource_memory_request || '2Gi'),
      resource_memory_limit: String(data.resources?.memory_limit || data.resource_memory_limit || '4Gi'),
      gpu_type: data.resources?.gpu_enabled ? (data.resources.gpu_type || 'nvidia-tesla-v100') : undefined,
      gpu_count: data.resources?.gpu_enabled ? (data.resources.gpu_count || 1) : 0,

      status: 'creating',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),

      // 兼容旧格式的可选字段
      name: data.name || data.instance_name || 'New Notebook',
      description: data.description || data.describe,
      project_id: 'project-1',
      image_display: template.name,
      resources: data.resources ? {
        cpu: {
          request: data.resources.cpu_request || '1',
          limit: data.resources.cpu_limit || '2',
        },
        memory: {
          request: data.resources.memory_request || '2Gi',
          limit: data.resources.memory_limit || '4Gi',
        },
        gpu: data.resources.gpu_enabled ? {
          enabled: true,
          type: data.resources.gpu_type || 'nvidia-tesla-v100',
          count: data.resources.gpu_count || 1,
        } : undefined,
      } : undefined,
      storage: data.storage ? {
        size: data.storage.size || '10Gi',
        storage_class: data.storage.storage_class || 'standard',
        mount_path: data.storage.mount_path || '/home/jovyan/work',
        persistent: true,
      } : undefined,
      network: data.network ? {
        port: 8888,
        custom_ports: data.network.custom_ports || [],
        protocol: 'https',
      } : undefined,
      auto_stop_minutes: data.auto_stop_minutes,
    }

    mockNotebookInstances.push(newInstance)

    // 模拟异步创建过程
    setTimeout(() => {
      const instance = mockNotebookInstances.find((i) => i.id === newInstance.id)
      if (instance) {
        instance.status = 'running'
        instance.access_url = `https://${newInstance.id}.example.com`
        instance.access_token = `token-${Math.random().toString(36).substr(2, 9)}`
        instance.started_at = new Date().toISOString()
        instance.kubernetes_info = {
          namespace: 'notebooks',
          pod_name: `${newInstance.id}-pod`,
          node_name: 'gpu-node-1',
          cluster_name: 'main-cluster',
        }
      }
    }, 3000)

    return newInstance
  },

  // 更新Notebook实例
  updateNotebookInstance: async (id: number, data: UpdateNotebookRequest): Promise<NotebookInstance> => {
    await delay(500)

    const instance = mockNotebookInstances.find((item) => item.id === id)
    if (!instance) {
      throw new Error(`Notebook instance not found: ${id}`)
    }

    // 更新字段
    if (data.name) instance.name = data.name
    if (data.description) instance.description = data.description
    if (data.auto_stop_minutes) instance.auto_stop_minutes = data.auto_stop_minutes

    if (data.resources) {
      if (data.resources.cpu_request) instance.resources.cpu.request = data.resources.cpu_request
      if (data.resources.cpu_limit) instance.resources.cpu.limit = data.resources.cpu_limit
      if (data.resources.memory_request) instance.resources.memory.request = data.resources.memory_request
      if (data.resources.memory_limit) instance.resources.memory.limit = data.resources.memory_limit
    }

    instance.updated_at = new Date().toISOString()

    return instance
  },

  // 启动Notebook实例
  startNotebookInstance: async (id: number): Promise<NotebookOperation> => {
    await delay(1000)

    const instance = mockNotebookInstances.find((item) => item.id === id)
    if (!instance) {
      throw new Error(`Notebook instance not found: ${id}`)
    }

    instance.status = 'running'
    instance.started_at = new Date().toISOString()
    instance.access_url = `https://${id}.example.com`
    instance.access_token = `token-${Math.random().toString(36).substr(2, 9)}`

    return {
      id: Date.now(),
      notebook_id: id,
      operation: 'start',
      status: 'completed',
      message: 'Notebook started successfully',
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }
  },

  // 停止Notebook实例
  stopNotebookInstance: async (id: number): Promise<NotebookOperation> => {
    await delay(800)

    const instance = mockNotebookInstances.find((item) => item.id === id)
    if (!instance) {
      throw new Error(`Notebook instance not found: ${id}`)
    }

    instance.status = 'stopped'
    instance.stopped_at = new Date().toISOString()
    instance.access_url = undefined
    instance.access_token = undefined

    return {
      id: Date.now(),
      notebook_id: id,
      operation: 'stop',
      status: 'completed',
      message: 'Notebook stopped successfully',
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }
  },

  // 删除Notebook实例
  deleteNotebookInstance: async (id: number): Promise<NotebookOperation> => {
    await delay(1200)

    const index = mockNotebookInstances.findIndex((item) => item.id === id)
    if (index === -1) {
      throw new Error(`Notebook instance not found: ${id}`)
    }

    mockNotebookInstances.splice(index, 1)

    return {
      id: Date.now(),
      notebook_id: id,
      operation: 'delete',
      status: 'completed',
      message: 'Notebook deleted successfully',
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }
  },

  // 获取GPU节点信息
  getGPUNodes: async (): Promise<GPUNode[]> => {
    await delay(400)
    return mockGPUNodes
  },

  // 获取存储类信息
  getStorageClasses: async (): Promise<StorageClass[]> => {
    await delay(300)
    return mockStorageClasses
  },

  // 获取Notebook监控数据
  getNotebookMetrics: async (id: string, hours: number = 24): Promise<NotebookMetrics[]> => {
    await delay(600)

    const metrics: NotebookMetrics[] = []
    const now = new Date()

    for (let i = 0; i < hours; i++) {
      const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000)

      metrics.push({
        notebook_id: id,
        cpu_usage: Math.random() * 100,
        memory_usage: Math.random() * 100,
        gpu_usage: Math.random() * 100,
        storage_usage: Math.random() * 100,
        network_in: Math.random() * 1000,
        network_out: Math.random() * 1000,
        timestamp: timestamp.toISOString(),
      })
    }

    return metrics.reverse()
  },

  // 获取Notebook日志
  getNotebookLogs: async (id: string, limit: number = 100): Promise<NotebookLog[]> => {
    await delay(400)

    const logs: NotebookLog[] = []
    const now = new Date()

    for (let i = 0; i < limit; i++) {
      const timestamp = new Date(now.getTime() - i * 60 * 1000)

      logs.push({
        id: `log-${i}`,
        notebook_id: id,
        level: ['info', 'warning', 'error'][Math.floor(Math.random() * 3)] as 'info' | 'warning' | 'error',
        message: `Log message ${i + 1}`,
        timestamp: timestamp.toISOString(),
        source: ['system', 'jupyter', 'container'][Math.floor(Math.random() * 3)] as 'system' | 'jupyter' | 'container',
      })
    }

    return logs.reverse()
  },

  // 获取案例分类列表
  getCaseCategories: async (): Promise<NotebookCaseCategory[]> => {
    await delay(300)
    return mockCaseCategories
  },

  // 获取精选案例列表
  getNotebookCases: async (params: CaseSearchParams = {}): Promise<{
    items: NotebookCase[]
    total: number
  }> => {
    await delay(500)

    let filteredCases = [...mockNotebookCases]

    // 根据搜索关键词过滤
    if (params.search) {
      const searchTerm = params.search.toLowerCase()
      filteredCases = filteredCases.filter(
        (case_) =>
          case_.name.toLowerCase().includes(searchTerm)
          || case_.description.toLowerCase().includes(searchTerm)
          || case_.tech_stack.some((tech) => tech.toLowerCase().includes(searchTerm))
          || case_.tags.some((tag) => tag.toLowerCase().includes(searchTerm)),
      )
    }

    // 根据分类过滤
    if (params.category_id) {
      filteredCases = filteredCases.filter((case_) => case_.category_id === params.category_id)
    }

    // 根据难度过滤
    if (params.difficulty) {
      filteredCases = filteredCases.filter((case_) => case_.difficulty === params.difficulty)
    }

    // 根据技术栈过滤
    if (params.tech_stack && params.tech_stack.length > 0) {
      filteredCases = filteredCases.filter((case_) =>
        params.tech_stack!.some((tech) => case_.tech_stack.includes(tech)),
      )
    }

    // 根据标签过滤
    if (params.tags && params.tags.length > 0) {
      filteredCases = filteredCases.filter((case_) =>
        params.tags!.some((tag) => case_.tags.includes(tag)),
      )
    }

    // 排序
    const sortBy = params.sort_by || 'created_at'
    const sortOrder = params.sort_order || 'desc'

    filteredCases.sort((a, b) => {
      let aValue: string | number, bValue: string | number

      switch (sortBy) {
        case 'name':
          aValue = a.name
          bValue = b.name
          break
        case 'rating':
          aValue = a.rating
          bValue = b.rating
          break
        case 'popularity':
          aValue = a.view_count + a.clone_count
          bValue = b.view_count + b.clone_count
          break
        case 'updated_at':
          aValue = new Date(a.updated_at).getTime()
          bValue = new Date(b.updated_at).getTime()
          break
        default:
          aValue = new Date(a.created_at).getTime()
          bValue = new Date(b.created_at).getTime()
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1
      }
      else {
        return aValue < bValue ? 1 : -1
      }
    })

    // 分页
    const skip = params.skip || 0
    const limit = params.limit || 20
    const paginatedCases = filteredCases.slice(skip, skip + limit)

    return {
      items: paginatedCases,
      total: filteredCases.length,
    }
  },

  // 获取案例详情
  getCaseDetail: async (caseId: string): Promise<NotebookCaseDetail> => {
    await delay(400)

    const case_ = mockNotebookCases.find((c) => c.id === caseId)
    if (!case_) {
      throw new Error(`Case ${caseId} not found`)
    }

    // 获取相关案例（同分类的其他案例）
    const relatedCases = mockNotebookCases
      .filter((c) => c.category_id === case_.category_id && c.id !== caseId)
      .slice(0, 3)

    return {
      ...case_,
      notebook_content: mockJupyterNotebook,
      readme_content: `# ${case_.name}\n\n${case_.description}\n\n## 技术栈\n${case_.tech_stack.join(', ')}\n\n## 学习目标\n${case_.learning_objectives.map((obj) => `- ${obj}`).join('\n')}`,
      sample_data: { message: 'Sample data for case' },
      related_cases: relatedCases,
    }
  },

  // 复制案例创建notebook实例
  cloneCase: async (request: CaseCloneRequest): Promise<CaseCloneResponse> => {
    await delay(1000)

    const case_ = mockNotebookCases.find((c) => c.id === request.case_id)
    if (!case_) {
      throw new Error(`Case ${request.case_id} not found`)
    }

    // 创建新的notebook实例
    const newInstance: NotebookInstance = {
      id: Date.now(),
      instance_name: request.notebook_name,
      describe: request.description || `基于案例"${case_.name}"创建`,
      image: 'jupyter/datascience-notebook:python-3.9',

      // 必需的扁平化资源配置
      resource_cpu_request: String(request.resource_config?.cpu_request || case_.resource_requirements.cpu),
      resource_cpu_limit: String(request.resource_config?.cpu_limit || case_.resource_requirements.cpu),
      resource_memory_request: String(request.resource_config?.memory_request || case_.resource_requirements.memory),
      resource_memory_limit: String(request.resource_config?.memory_limit || case_.resource_requirements.memory),
      gpu_type: (request.resource_config?.gpu_enabled || case_.resource_requirements.gpu_required)
        ? (request.resource_config?.gpu_type || case_.resource_requirements.gpu_type || 'nvidia-tesla-v100') : undefined,
      gpu_count: (request.resource_config?.gpu_enabled || case_.resource_requirements.gpu_required)
        ? (request.resource_config?.gpu_count || 1) : 0,

      status: 'creating',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),

      // 兼容旧格式的可选字段
      name: request.notebook_name,
      description: request.description || `基于案例"${case_.name}"创建`,
      project_id: 'project-1',
      image_display: 'Jupyter Python 3.9',
      resources: {
        cpu: {
          request: request.resource_config?.cpu_request || case_.resource_requirements.cpu,
          limit: request.resource_config?.cpu_limit || case_.resource_requirements.cpu,
        },
        memory: {
          request: request.resource_config?.memory_request || case_.resource_requirements.memory,
          limit: request.resource_config?.memory_limit || case_.resource_requirements.memory,
        },
        gpu: {
          enabled: request.resource_config?.gpu_enabled || case_.resource_requirements.gpu_required,
          type: request.resource_config?.gpu_type || case_.resource_requirements.gpu_type || 'nvidia-tesla-v100',
          count: request.resource_config?.gpu_count || 1,
        },
      },
      storage: {
        size: request.resource_config?.storage_size || case_.resource_requirements.storage,
        storage_class: 'standard',
        mount_path: '/home/jovyan/work',
        persistent: true,
      },
      network: {
        port: 8888,
        custom_ports: [],
        protocol: 'http',
      },
      access_url: request.auto_start ? `http://localhost:8888/lab?token=abc123` : undefined,
      access_token: request.auto_start ? 'abc123' : undefined,
      kubernetes_info: {
        namespace: 'default',
        pod_name: `notebook-${Date.now()}`,
        node_name: 'gpu-node-1',
        cluster_name: 'main-cluster',
      },
      auto_stop_minutes: request.auto_stop_minutes || 120,
      last_activity: new Date().toISOString(),
      started_at: request.auto_start ? new Date().toISOString() : undefined,
    }

    // 更新案例的克隆计数
    case_.clone_count += 1

    return {
      success: true,
      notebook_instance: newInstance,
      message: `成功复制案例"${case_.name}"并创建notebook实例`,
      warnings: case_.resource_requirements.gpu_required && !request.resource_config?.gpu_enabled
        ? ['该案例建议使用GPU资源以获得最佳性能']
        : undefined,
    }
  },

  // 获取案例文件内容
  getCaseFileContent: async (caseId: string, filePath: string): Promise<{ content: any }> => {
    await delay(800)

    const case_ = mockNotebookCases.find((c) => c.id === caseId)
    if (!case_) {
      throw new Error(`Case not found: ${caseId}`)
    }

    // 根据文件路径返回模拟内容
    if (filePath.endsWith('.ipynb')) {
      // 返回模拟的notebook内容
      return {
        content: {
          cells: [
            {
              cell_type: 'markdown',
              metadata: {},
              source: [
                `# ${case_.name}\n`,
                `\n`,
                `${case_.description}\n`,
                `\n`,
                `## 技术栈\n`,
                `${case_.tech_stack.map((tech) => `- ${tech}`).join('\n')}\n`,
                `\n`,
                `## 学习目标\n`,
                `${case_.learning_objectives.map((obj) => `- ${obj}`).join('\n')}\n`,
              ],
            },
            {
              cell_type: 'code',
              metadata: {},
              source: [
                '# 导入必要的库\n',
                'import numpy as np\n',
                'import pandas as pd\n',
                'import matplotlib.pyplot as plt\n',
                'import seaborn as sns\n',
                '\n',
                '# 设置图表样式\n',
                'plt.style.use(\'seaborn-v0_8\')\n',
                'sns.set_palette(\'husl\')\n',
                '\n',
                'print(\'环境配置完成！\')',
              ],
              outputs: [
                {
                  output_type: 'stream',
                  name: 'stdout',
                  text: ['环境配置完成！\n'],
                },
              ],
              execution_count: 1,
            },
            {
              cell_type: 'markdown',
              metadata: {},
              source: [
                '## 数据加载\n',
                '\n',
                '在这个部分，我们将加载和预处理数据。',
              ],
            },
            {
              cell_type: 'code',
              metadata: {},
              source: [
                '# 加载数据\n',
                '# 这里使用模拟数据，实际项目中应该替换为真实数据\n',
                'np.random.seed(42)\n',
                'data = np.random.randn(1000, 5)\n',
                'df = pd.DataFrame(data, columns=[\'feature1\', \'feature2\', \'feature3\', \'feature4\', \'target\'])\n',
                '\n',
                'print(f\'数据形状: {df.shape}\')\n',
                'print(f\'数据头部:\')\n',
                'df.head()',
              ],
              outputs: [
                {
                  output_type: 'stream',
                  name: 'stdout',
                  text: ['数据形状: (1000, 5)\n', '数据头部:\n'],
                },
                {
                  output_type: 'execute_result',
                  execution_count: 2,
                  data: {
                    'text/plain': ['        feature1  feature2  feature3  feature4    target\n0       0.496714 -0.138264  0.647689  1.523030 -0.234153\n1       0.241962 -0.322417 -0.384054  1.579213  0.767435\n2      -0.469474  0.542560 -0.463418 -0.465730  0.241962\n3      -0.463418  0.241962 -0.322417 -0.384054 -0.469474\n4       0.647689  1.523030 -0.234153  0.496714 -0.138264'],
                  },
                },
              ],
              execution_count: 2,
            },
          ],
          metadata: {
            kernelspec: {
              display_name: 'Python 3',
              language: 'python',
              name: 'python3',
            },
            language_info: {
              name: 'python',
              version: '3.9.0',
            },
          },
          nbformat: 4,
          nbformat_minor: 4,
        },
      }
    }
    else if (filePath.endsWith('.md')) {
      // 返回README内容
      return {
        content: `# ${case_.name}

${case_.description}

## 技术栈
${case_.tech_stack.map((tech) => `- ${tech}`).join('\n')}

## 学习目标
${case_.learning_objectives.map((obj) => `- ${obj}`).join('\n')}

## 前置条件
${case_.prerequisites.map((pre) => `- ${pre}`).join('\n')}

## 资源需求
- CPU: ${case_.resource_requirements.cpu}
- 内存: ${case_.resource_requirements.memory}
- 存储: ${case_.resource_requirements.storage}
- GPU: ${case_.resource_requirements.gpu_required ? `需要 (${case_.resource_requirements.gpu_type})` : '不需要'}

## 环境配置
- Python版本: ${case_.environment.python_version}
- 依赖包: ${case_.dependencies.join(', ')}

## 使用方法
1. 克隆此案例到你的workspace
2. 安装依赖包
3. 运行notebook文件
4. 按照说明完成学习

## 下一步
${case_.next_steps.map((step) => `- ${step}`).join('\n')}
`,
      }
    }
    else if (filePath === 'requirements.txt') {
      // 返回依赖文件内容
      return {
        content: case_.dependencies.join('\n'),
      }
    }
    else if (filePath === 'config.json') {
      // 返回配置文件内容
      return {
        content: JSON.stringify({
          name: case_.name,
          version: case_.version,
          description: case_.description,
          tech_stack: case_.tech_stack,
          python_version: case_.environment.python_version,
          resource_requirements: case_.resource_requirements,
        }, null, 2),
      }
    }
    else if (filePath.endsWith('.py')) {
      // 返回Python文件内容
      return {
        content: `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
${case_.name}
${case_.description}

Author: ${case_.created_by}
Version: ${case_.version}
Created: ${case_.created_at}
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt


def main():
    """主函数"""
    print("开始执行 ${case_.name}")

    # 这里添加你的代码
    data = np.random.randn(100, 3)
    df = pd.DataFrame(data, columns=['A', 'B', 'C'])

    print("数据生成完成")
    print(df.head())

    # 简单的可视化
    plt.figure(figsize=(10, 6))
    plt.plot(df['A'], label='A')
    plt.plot(df['B'], label='B')
    plt.plot(df['C'], label='C')
    plt.legend()
    plt.title('${case_.name} - 数据可视化')
    plt.show()


if __name__ == '__main__':
    main()
`,
      }
    }
    else {
      // 返回纯文本内容
      return {
        content: `这是 ${filePath} 文件的内容。\n\n此文件属于案例: ${case_.name}\n描述: ${case_.description}\n\n这是一个示例文件内容。`,
      }
    }
  },
}
