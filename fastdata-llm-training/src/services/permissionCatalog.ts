export interface PermissionTreeNode {
  key: string
  label: string
  children?: PermissionTreeNode[]
}

export interface OperationDefinition {
  key: string
  label: string
  menuKey: string
  requiresProject: boolean
}

export interface RouteAccessRule {
  menuKey: string
  requiresProject: boolean
  match: (pathname: string) => boolean
}

export const MENU_PERMISSION_TREE: PermissionTreeNode[] = [
  { key: '/workspace', label: '项目空间' },
  { key: '/home', label: '首页' },
  {
    key: 'menu.data-services',
    label: '数据服务',
    children: [
      {
        key: 'menu.data-management',
        label: '数据管理',
        children: [
          { key: '/datasets', label: '训练数据管理' },
          { key: '/measurement', label: '测试数据管理' },
          { key: '/inference', label: '推理结果集' },
        ],
      },
      {
        key: 'menu.data-processing',
        label: '数据处理',
        children: [
          { key: '/data-annotation', label: '数据标注' },
          { key: '/data-cleaning', label: '数据清洗' },
        ],
      },
    ],
  },
  {
    key: 'menu.training',
    label: '模型训练',
    children: [
      { key: '/finetune/notebooks', label: '在线Notebook' },
      { key: '/training', label: '大模型训练' },
      { key: '/model', label: '我的模型' },
    ],
  },
  {
    key: 'menu.evaluation',
    label: '模型评估',
    children: [
      { key: '/effect-evaluation', label: '效果评估' },
      { key: '/evaluation-indicator', label: '评估指标' },
    ],
  },
  {
    key: 'menu.service',
    label: '模型服务',
    children: [
      { key: '/service/inference/hosted', label: '大模型部署' },
      { key: '/service/inference/external', label: '在线推理服务' },
    ],
  },
  {
    key: 'menu.machine-learning',
    label: '机器学习',
    children: [
      { key: '/machine-data-management', label: '数据管理' },
      { key: '/machine-annotation', label: '机器学习标注' },
      { key: '/machine-model-management', label: '模型管理' },
      { key: '/machine-model-deployment', label: '模型部署' },
      { key: '/machine-notebook', label: '在线Notebook' },
      { key: '/machine-annotation-service', label: '在线标注服务' },
    ],
  },
  {
    key: 'menu.admin',
    label: '系统管理',
    children: [
      { key: '/admin/projects', label: '项目管理' },
      { key: '/admin/kubernetes', label: '集群管理' },
      { key: '/admin/storage', label: '存储管理' },
      {
        key: 'menu.admin.images',
        label: '镜像管理',
        children: [
          { key: '/admin/image-list', label: '镜像列表' },
          { key: '/admin/registry', label: '镜像仓库' },
        ],
      },
      { key: '/admin/base-model', label: '模型仓库' },
      { key: '/admin/settings', label: '系统配置' },
      { key: '/admin/permissions', label: '权限配置' },
    ],
  },
]

export const OPERATION_PERMISSION_TREE: PermissionTreeNode[] = [
  {
    key: '/home',
    label: '首页',
    children: [{ key: 'home.view', label: '查看首页' }],
  },
  {
    key: 'ops.data-services',
    label: '数据服务',
    children: [
      {
        key: '/datasets',
        label: '训练数据管理',
        children: [
          { key: 'datasets.training.create', label: '创建数据集' },
          { key: 'datasets.training.detail', label: '查看详情' },
          { key: 'datasets.training.train', label: '去训练' },
          { key: 'datasets.training.version.create', label: '新增版本' },
          { key: 'datasets.training.download', label: '下载' },
          { key: 'datasets.training.delete', label: '删除' },
        ],
      },
      {
        key: '/measurement',
        label: '测试数据管理',
        children: [
          { key: 'datasets.test.create', label: '创建数据集' },
          { key: 'datasets.test.detail', label: '查看详情' },
          { key: 'datasets.test.version.create', label: '新增版本' },
          { key: 'datasets.test.download', label: '下载' },
          { key: 'datasets.test.delete', label: '删除' },
        ],
      },
      {
        key: '/inference',
        label: '推理结果集',
        children: [
          { key: 'inference.create', label: '创建结果集' },
          { key: 'inference.start', label: '启动' },
          { key: 'inference.edit', label: '编辑' },
          { key: 'inference.detail', label: '查看详情' },
          { key: 'inference.terminate', label: '终止' },
          { key: 'inference.resubmit', label: '重新提交' },
          { key: 'inference.delete', label: '删除' },
        ],
      },
      {
        key: '/data-annotation',
        label: '数据标注',
        children: [
          { key: 'annotation.create', label: '创建标注任务' },
          { key: 'annotation.detail', label: '查看详情' },
          { key: 'annotation.delete', label: '删除' },
        ],
      },
      {
        key: '/data-cleaning',
        label: '数据清洗',
        children: [
          { key: 'cleaning.create', label: '创建清洗任务' },
          { key: 'cleaning.detail', label: '查看详情' },
          { key: 'cleaning.delete', label: '删除' },
        ],
      },
    ],
  },
  {
    key: 'ops.training',
    label: '模型训练',
    children: [
      {
        key: '/finetune/notebooks',
        label: '在线Notebook',
        children: [
          { key: 'notebook.create', label: '创建Notebook' },
          { key: 'notebook.start', label: '启动' },
          { key: 'notebook.detail', label: '查看详情' },
          { key: 'notebook.publish', label: '发布为案例' },
        ],
      },
      {
        key: '/training',
        label: '大模型训练',
        children: [
          { key: 'training.detail', label: '查看详情' },
          { key: 'training.version.detail', label: '查看版本详情' },
        ],
      },
      {
        key: '/model',
        label: '我的模型',
        children: [
          { key: 'model.create', label: '创建模型' },
          { key: 'model.start', label: '启动' },
          { key: 'model.edit', label: '编辑' },
          { key: 'model.detail', label: '查看详情' },
          { key: 'model.delete', label: '删除' },
        ],
      },
    ],
  },
  {
    key: 'ops.evaluation',
    label: '模型评估',
    children: [
      {
        key: '/effect-evaluation',
        label: '效果评估',
        children: [
          { key: 'evaluation.create', label: '创建评估任务' },
          { key: 'evaluation.start', label: '启动' },
          { key: 'evaluation.edit', label: '编辑' },
          { key: 'evaluation.detail', label: '查看详情' },
          { key: 'evaluation.terminate', label: '终止' },
          { key: 'evaluation.delete', label: '删除' },
        ],
      },
      {
        key: '/evaluation-indicator',
        label: '评估指标',
        children: [
          { key: 'evaluation-indicator.create', label: '新增指标' },
          { key: 'evaluation-indicator.edit', label: '编辑' },
          { key: 'evaluation-indicator.detail', label: '查看详情' },
          { key: 'evaluation-indicator.delete', label: '删除' },
        ],
      },
    ],
  },
  {
    key: 'ops.service',
    label: '模型服务',
    children: [
      {
        key: '/service/inference/hosted',
        label: '大模型部署',
        children: [
          { key: 'service.deployment.create', label: '新建部署' },
          { key: 'service.deployment.start', label: '启动' },
          { key: 'service.deployment.edit', label: '编辑' },
          { key: 'service.deployment.detail', label: '查看详情' },
          { key: 'service.deployment.terminate', label: '终止' },
          { key: 'service.deployment.delete', label: '删除' },
        ],
      },
      {
        key: '/service/inference/external',
        label: '在线推理服务',
        children: [
          { key: 'service.online.detail', label: '查看详情' },
          { key: 'service.online.start', label: '启动' },
          { key: 'service.online.stop', label: '停止' },
        ],
      },
    ],
  },
  {
    key: 'ops.machine',
    label: '机器学习',
    children: [
      {
        key: '/machine-data-management',
        label: '数据管理',
        children: [
          { key: 'machine.dataset.create', label: '创建数据集' },
          { key: 'machine.dataset.detail', label: '查看详情' },
          { key: 'machine.dataset.delete', label: '删除' },
        ],
      },
      {
        key: '/machine-annotation',
        label: '机器学习标注',
        children: [
          { key: 'machine.annotation.create', label: '创建标注任务' },
          { key: 'machine.annotation.detail', label: '查看详情' },
          { key: 'machine.annotation.delete', label: '删除' },
        ],
      },
      {
        key: '/machine-model-management',
        label: '模型管理',
        children: [
          { key: 'machine.model.detail', label: '查看详情' },
          { key: 'machine.model.deploy', label: '部署' },
          { key: 'machine.model.delete', label: '删除' },
        ],
      },
      {
        key: '/machine-model-deployment',
        label: '模型部署',
        children: [
          { key: 'machine.deployment.create', label: '创建部署' },
          { key: 'machine.deployment.start', label: '启动' },
          { key: 'machine.deployment.edit', label: '编辑' },
          { key: 'machine.deployment.terminate', label: '终止' },
          { key: 'machine.deployment.delete', label: '删除' },
        ],
      },
      {
        key: '/machine-notebook',
        label: '在线Notebook',
        children: [
          { key: 'machine.notebook.create', label: '创建Notebook' },
          { key: 'machine.notebook.start', label: '启动' },
          { key: 'machine.notebook.detail', label: '查看详情' },
        ],
      },
      {
        key: '/machine-annotation-service',
        label: '在线标注服务',
        children: [
          { key: 'machine.annotation-service.create', label: '创建服务' },
          { key: 'machine.annotation-service.detail', label: '查看详情' },
          { key: 'machine.annotation-service.stop', label: '停止' },
          { key: 'machine.annotation-service.delete', label: '删除' },
        ],
      },
    ],
  },
  {
    key: 'ops.admin',
    label: '系统管理',
    children: [
      {
        key: '/admin/projects',
        label: '项目管理',
        children: [
          { key: 'admin.project.create', label: '新建项目' },
          { key: 'admin.project.edit', label: '编辑项目' },
          { key: 'admin.project.members', label: '成员管理' },
          { key: 'admin.project.data-permission', label: '项目权限配置' },
        ],
      },
      {
        key: '/admin/kubernetes',
        label: '集群管理',
        children: [{ key: 'admin.cluster.manage', label: '集群管理' }],
      },
      {
        key: '/admin/storage',
        label: '存储管理',
        children: [{ key: 'admin.storage.manage', label: '存储管理' }],
      },
      {
        key: 'ops.admin.images',
        label: '镜像管理',
        children: [
          {
            key: '/admin/image-list',
            label: '镜像列表',
            children: [{ key: 'admin.image-list.manage', label: '镜像列表管理' }],
          },
          {
            key: '/admin/registry',
            label: '镜像仓库',
            children: [{ key: 'admin.registry.manage', label: '镜像仓库管理' }],
          },
        ],
      },
      {
        key: '/admin/base-model',
        label: '模型仓库',
        children: [
          { key: 'admin.base-model.create', label: '新增模型' },
          { key: 'admin.base-model.edit', label: '编辑' },
          { key: 'admin.base-model.detail', label: '查看详情' },
          { key: 'admin.base-model.terminate', label: '终止' },
          { key: 'admin.base-model.delete', label: '删除' },
        ],
      },
      {
        key: '/admin/settings',
        label: '系统配置',
        children: [{ key: 'admin.settings.manage', label: '系统配置管理' }],
      },
      {
        key: '/admin/permissions',
        label: '权限配置',
        children: [{ key: 'admin.permission.view', label: '查看操作权限' }],
      },
    ],
  },
]

function collectLeafKeys(nodes: PermissionTreeNode[], target: string[] = []): string[] {
  nodes.forEach(node => {
    if (node.children?.length) {
      collectLeafKeys(node.children, target)
      return
    }
    target.push(node.key)
  })
  return target
}

export const ALL_MENU_PERMISSION_KEYS = collectLeafKeys(MENU_PERMISSION_TREE)

export const OPERATION_DEFINITION_MAP: Record<string, OperationDefinition> = {
  'home.view': { key: 'home.view', label: '查看首页', menuKey: '/home', requiresProject: false },
  'datasets.training.create': { key: 'datasets.training.create', label: '创建训练数据集', menuKey: '/datasets', requiresProject: true },
  'datasets.training.detail': { key: 'datasets.training.detail', label: '查看训练数据详情', menuKey: '/datasets', requiresProject: true },
  'datasets.training.train': { key: 'datasets.training.train', label: '训练数据去训练', menuKey: '/datasets', requiresProject: true },
  'datasets.training.version.create': { key: 'datasets.training.version.create', label: '训练数据新增版本', menuKey: '/datasets', requiresProject: true },
  'datasets.training.download': { key: 'datasets.training.download', label: '下载训练数据', menuKey: '/datasets', requiresProject: true },
  'datasets.training.delete': { key: 'datasets.training.delete', label: '删除训练数据', menuKey: '/datasets', requiresProject: true },
  'datasets.test.create': { key: 'datasets.test.create', label: '创建测试数据集', menuKey: '/measurement', requiresProject: true },
  'datasets.test.detail': { key: 'datasets.test.detail', label: '查看测试数据详情', menuKey: '/measurement', requiresProject: true },
  'datasets.test.version.create': { key: 'datasets.test.version.create', label: '测试数据新增版本', menuKey: '/measurement', requiresProject: true },
  'datasets.test.download': { key: 'datasets.test.download', label: '下载测试数据', menuKey: '/measurement', requiresProject: true },
  'datasets.test.delete': { key: 'datasets.test.delete', label: '删除测试数据', menuKey: '/measurement', requiresProject: true },
  'inference.create': { key: 'inference.create', label: '创建推理结果集', menuKey: '/inference', requiresProject: true },
  'inference.start': { key: 'inference.start', label: '启动推理结果集', menuKey: '/inference', requiresProject: true },
  'inference.edit': { key: 'inference.edit', label: '编辑推理结果集', menuKey: '/inference', requiresProject: true },
  'inference.detail': { key: 'inference.detail', label: '查看推理结果集详情', menuKey: '/inference', requiresProject: true },
  'inference.terminate': { key: 'inference.terminate', label: '终止推理结果集', menuKey: '/inference', requiresProject: true },
  'inference.resubmit': { key: 'inference.resubmit', label: '重新提交推理结果集', menuKey: '/inference', requiresProject: true },
  'inference.delete': { key: 'inference.delete', label: '删除推理结果集', menuKey: '/inference', requiresProject: true },
  'annotation.create': { key: 'annotation.create', label: '创建标注任务', menuKey: '/data-annotation', requiresProject: true },
  'annotation.detail': { key: 'annotation.detail', label: '查看标注任务详情', menuKey: '/data-annotation', requiresProject: true },
  'annotation.delete': { key: 'annotation.delete', label: '删除标注任务', menuKey: '/data-annotation', requiresProject: true },
  'cleaning.create': { key: 'cleaning.create', label: '创建清洗任务', menuKey: '/data-cleaning', requiresProject: true },
  'cleaning.detail': { key: 'cleaning.detail', label: '查看清洗任务详情', menuKey: '/data-cleaning', requiresProject: true },
  'cleaning.delete': { key: 'cleaning.delete', label: '删除清洗任务', menuKey: '/data-cleaning', requiresProject: true },
  'notebook.create': { key: 'notebook.create', label: '创建Notebook', menuKey: '/finetune/notebooks', requiresProject: true },
  'notebook.start': { key: 'notebook.start', label: '启动Notebook', menuKey: '/finetune/notebooks', requiresProject: true },
  'notebook.detail': { key: 'notebook.detail', label: '查看Notebook详情', menuKey: '/finetune/notebooks', requiresProject: true },
  'notebook.publish': { key: 'notebook.publish', label: '发布Notebook案例', menuKey: '/finetune/notebooks', requiresProject: true },
  'training.detail': { key: 'training.detail', label: '查看训练详情', menuKey: '/training', requiresProject: true },
  'training.version.detail': { key: 'training.version.detail', label: '查看训练版本详情', menuKey: '/training', requiresProject: true },
  'model.create': { key: 'model.create', label: '创建模型', menuKey: '/model', requiresProject: true },
  'model.start': { key: 'model.start', label: '启动模型', menuKey: '/model', requiresProject: true },
  'model.edit': { key: 'model.edit', label: '编辑模型', menuKey: '/model', requiresProject: true },
  'model.detail': { key: 'model.detail', label: '查看模型详情', menuKey: '/model', requiresProject: true },
  'model.delete': { key: 'model.delete', label: '删除模型', menuKey: '/model', requiresProject: true },
  'evaluation.create': { key: 'evaluation.create', label: '创建评估任务', menuKey: '/effect-evaluation', requiresProject: true },
  'evaluation.start': { key: 'evaluation.start', label: '启动评估任务', menuKey: '/effect-evaluation', requiresProject: true },
  'evaluation.edit': { key: 'evaluation.edit', label: '编辑评估任务', menuKey: '/effect-evaluation', requiresProject: true },
  'evaluation.detail': { key: 'evaluation.detail', label: '查看评估任务详情', menuKey: '/effect-evaluation', requiresProject: true },
  'evaluation.terminate': { key: 'evaluation.terminate', label: '终止评估任务', menuKey: '/effect-evaluation', requiresProject: true },
  'evaluation.delete': { key: 'evaluation.delete', label: '删除评估任务', menuKey: '/effect-evaluation', requiresProject: true },
  'evaluation-indicator.create': { key: 'evaluation-indicator.create', label: '新增评估指标', menuKey: '/evaluation-indicator', requiresProject: false },
  'evaluation-indicator.edit': { key: 'evaluation-indicator.edit', label: '编辑评估指标', menuKey: '/evaluation-indicator', requiresProject: false },
  'evaluation-indicator.detail': { key: 'evaluation-indicator.detail', label: '查看评估指标详情', menuKey: '/evaluation-indicator', requiresProject: false },
  'evaluation-indicator.delete': { key: 'evaluation-indicator.delete', label: '删除评估指标', menuKey: '/evaluation-indicator', requiresProject: false },
  'service.deployment.create': { key: 'service.deployment.create', label: '新建部署', menuKey: '/service/inference/hosted', requiresProject: true },
  'service.deployment.start': { key: 'service.deployment.start', label: '启动模型部署', menuKey: '/service/inference/hosted', requiresProject: true },
  'service.deployment.edit': { key: 'service.deployment.edit', label: '编辑模型部署', menuKey: '/service/inference/hosted', requiresProject: true },
  'service.deployment.detail': { key: 'service.deployment.detail', label: '查看模型部署详情', menuKey: '/service/inference/hosted', requiresProject: true },
  'service.deployment.terminate': { key: 'service.deployment.terminate', label: '终止模型部署', menuKey: '/service/inference/hosted', requiresProject: true },
  'service.deployment.delete': { key: 'service.deployment.delete', label: '删除模型部署', menuKey: '/service/inference/hosted', requiresProject: true },
  'service.online.detail': { key: 'service.online.detail', label: '查看在线推理服务详情', menuKey: '/service/inference/external', requiresProject: true },
  'service.online.start': { key: 'service.online.start', label: '启动在线推理服务', menuKey: '/service/inference/external', requiresProject: true },
  'service.online.stop': { key: 'service.online.stop', label: '停止在线推理服务', menuKey: '/service/inference/external', requiresProject: true },
  'machine.dataset.create': { key: 'machine.dataset.create', label: '创建机器学习数据集', menuKey: '/machine-data-management', requiresProject: true },
  'machine.dataset.detail': { key: 'machine.dataset.detail', label: '查看机器学习数据集详情', menuKey: '/machine-data-management', requiresProject: true },
  'machine.dataset.delete': { key: 'machine.dataset.delete', label: '删除机器学习数据集', menuKey: '/machine-data-management', requiresProject: true },
  'machine.annotation.create': { key: 'machine.annotation.create', label: '创建机器学习标注任务', menuKey: '/machine-annotation', requiresProject: true },
  'machine.annotation.detail': { key: 'machine.annotation.detail', label: '查看机器学习标注详情', menuKey: '/machine-annotation', requiresProject: true },
  'machine.annotation.delete': { key: 'machine.annotation.delete', label: '删除机器学习标注', menuKey: '/machine-annotation', requiresProject: true },
  'machine.model.detail': { key: 'machine.model.detail', label: '查看机器学习模型详情', menuKey: '/machine-model-management', requiresProject: true },
  'machine.model.deploy': { key: 'machine.model.deploy', label: '部署机器学习模型', menuKey: '/machine-model-management', requiresProject: true },
  'machine.model.delete': { key: 'machine.model.delete', label: '删除机器学习模型', menuKey: '/machine-model-management', requiresProject: true },
  'machine.deployment.create': { key: 'machine.deployment.create', label: '创建机器学习模型部署', menuKey: '/machine-model-deployment', requiresProject: true },
  'machine.deployment.start': { key: 'machine.deployment.start', label: '启动机器学习模型部署', menuKey: '/machine-model-deployment', requiresProject: true },
  'machine.deployment.edit': { key: 'machine.deployment.edit', label: '编辑机器学习模型部署', menuKey: '/machine-model-deployment', requiresProject: true },
  'machine.deployment.terminate': { key: 'machine.deployment.terminate', label: '终止机器学习模型部署', menuKey: '/machine-model-deployment', requiresProject: true },
  'machine.deployment.delete': { key: 'machine.deployment.delete', label: '删除机器学习模型部署', menuKey: '/machine-model-deployment', requiresProject: true },
  'machine.notebook.create': { key: 'machine.notebook.create', label: '创建机器学习Notebook', menuKey: '/machine-notebook', requiresProject: true },
  'machine.notebook.start': { key: 'machine.notebook.start', label: '启动机器学习Notebook', menuKey: '/machine-notebook', requiresProject: true },
  'machine.notebook.detail': { key: 'machine.notebook.detail', label: '查看机器学习Notebook详情', menuKey: '/machine-notebook', requiresProject: true },
  'machine.annotation-service.create': { key: 'machine.annotation-service.create', label: '创建在线标注服务', menuKey: '/machine-annotation-service', requiresProject: true },
  'machine.annotation-service.detail': { key: 'machine.annotation-service.detail', label: '查看在线标注服务详情', menuKey: '/machine-annotation-service', requiresProject: true },
  'machine.annotation-service.stop': { key: 'machine.annotation-service.stop', label: '停止在线标注服务', menuKey: '/machine-annotation-service', requiresProject: true },
  'machine.annotation-service.delete': { key: 'machine.annotation-service.delete', label: '删除在线标注服务', menuKey: '/machine-annotation-service', requiresProject: true },
  'admin.project.create': { key: 'admin.project.create', label: '新建项目', menuKey: '/admin/projects', requiresProject: false },
  'admin.project.edit': { key: 'admin.project.edit', label: '编辑项目', menuKey: '/admin/projects', requiresProject: false },
  'admin.project.members': { key: 'admin.project.members', label: '成员管理', menuKey: '/admin/projects', requiresProject: false },
  'admin.project.data-permission': { key: 'admin.project.data-permission', label: '项目数据权限配置', menuKey: '/admin/projects', requiresProject: false },
  'admin.cluster.manage': { key: 'admin.cluster.manage', label: '集群管理', menuKey: '/admin/kubernetes', requiresProject: false },
  'admin.storage.manage': { key: 'admin.storage.manage', label: '存储管理', menuKey: '/admin/storage', requiresProject: false },
  'admin.image-list.manage': { key: 'admin.image-list.manage', label: '镜像列表管理', menuKey: '/admin/image-list', requiresProject: false },
  'admin.registry.manage': { key: 'admin.registry.manage', label: '镜像仓库管理', menuKey: '/admin/registry', requiresProject: false },
  'admin.base-model.create': { key: 'admin.base-model.create', label: '新增基础模型', menuKey: '/admin/base-model', requiresProject: false },
  'admin.base-model.edit': { key: 'admin.base-model.edit', label: '编辑基础模型', menuKey: '/admin/base-model', requiresProject: false },
  'admin.base-model.detail': { key: 'admin.base-model.detail', label: '查看基础模型详情', menuKey: '/admin/base-model', requiresProject: false },
  'admin.base-model.terminate': { key: 'admin.base-model.terminate', label: '终止基础模型', menuKey: '/admin/base-model', requiresProject: false },
  'admin.base-model.delete': { key: 'admin.base-model.delete', label: '删除基础模型', menuKey: '/admin/base-model', requiresProject: false },
  'admin.settings.manage': { key: 'admin.settings.manage', label: '管理系统配置', menuKey: '/admin/settings', requiresProject: false },
  'admin.permission.view': { key: 'admin.permission.view', label: '查看操作权限', menuKey: '/admin/permissions', requiresProject: false },
}

export const ALL_OPERATION_DEFINITIONS: OperationDefinition[] = collectLeafKeys(OPERATION_PERMISSION_TREE).map(key => {
  const definition = OPERATION_DEFINITION_MAP[key]
  if (!definition) {
    throw new Error(`Missing operation definition for ${key}`)
  }
  return definition
})

export const ALL_OPERATION_KEYS = ALL_OPERATION_DEFINITIONS.map(item => item.key)

export const ROUTE_ACCESS_RULES: RouteAccessRule[] = [
  { menuKey: '/workspace', requiresProject: false, match: pathname => pathname === '/workspace' },
  { menuKey: '/home', requiresProject: true, match: pathname => pathname === '/home' },
  { menuKey: '/datasets', requiresProject: true, match: pathname => pathname === '/datasets' || pathname.startsWith('/datasets/') },
  { menuKey: '/measurement', requiresProject: true, match: pathname => pathname === '/measurement' || pathname.startsWith('/measurement/') },
  { menuKey: '/inference', requiresProject: true, match: pathname => pathname === '/inference' || pathname.startsWith('/inference/') },
  { menuKey: '/data-annotation', requiresProject: true, match: pathname => pathname === '/data-annotation' || pathname.startsWith('/data-annotation/') },
  { menuKey: '/data-cleaning', requiresProject: true, match: pathname => pathname === '/data-cleaning' || pathname.startsWith('/data-cleaning/') },
  { menuKey: '/finetune/notebooks', requiresProject: true, match: pathname => pathname === '/finetune/notebooks' || pathname.startsWith('/finetune/notebooks/') },
  { menuKey: '/training', requiresProject: true, match: pathname => pathname === '/training' || pathname.startsWith('/training/') },
  { menuKey: '/model', requiresProject: true, match: pathname => pathname === '/model' || pathname.startsWith('/model/') },
  { menuKey: '/effect-evaluation', requiresProject: true, match: pathname => pathname === '/effect-evaluation' || pathname.startsWith('/effect-evaluation/') },
  { menuKey: '/evaluation-indicator', requiresProject: false, match: pathname => pathname === '/evaluation-indicator' },
  { menuKey: '/service/inference/hosted', requiresProject: true, match: pathname => pathname === '/service/inference/hosted' || pathname.startsWith('/service/inference/hosted/') },
  { menuKey: '/service/inference/external', requiresProject: true, match: pathname => pathname === '/service/inference/external' },
  { menuKey: '/machine-data-management', requiresProject: true, match: pathname => pathname === '/machine-data-management' },
  { menuKey: '/machine-annotation', requiresProject: true, match: pathname => pathname === '/machine-annotation' },
  { menuKey: '/machine-model-management', requiresProject: true, match: pathname => pathname === '/machine-model-management' },
  { menuKey: '/machine-model-deployment', requiresProject: true, match: pathname => pathname === '/machine-model-deployment' || pathname.startsWith('/machine-model-deployment/') },
  { menuKey: '/machine-notebook', requiresProject: true, match: pathname => pathname === '/machine-notebook' },
  { menuKey: '/machine-annotation-service', requiresProject: true, match: pathname => pathname === '/machine-annotation-service' },
  { menuKey: '/admin/projects', requiresProject: false, match: pathname => pathname === '/admin/projects' },
  { menuKey: '/admin/kubernetes', requiresProject: false, match: pathname => pathname === '/admin/kubernetes' },
  { menuKey: '/admin/storage', requiresProject: false, match: pathname => pathname === '/admin/storage' },
  { menuKey: '/admin/image-list', requiresProject: false, match: pathname => pathname === '/admin/image-list' },
  { menuKey: '/admin/registry', requiresProject: false, match: pathname => pathname === '/admin/registry' },
  { menuKey: '/admin/base-model', requiresProject: false, match: pathname => pathname === '/admin/base-model' },
  { menuKey: '/admin/settings', requiresProject: false, match: pathname => pathname === '/admin/settings' },
  { menuKey: '/admin/permissions', requiresProject: false, match: pathname => pathname === '/admin/permissions' },
]

export function resolveRouteAccess(pathname: string): RouteAccessRule | null {
  return ROUTE_ACCESS_RULES.find(rule => rule.match(pathname)) ?? null
}

export function findPermissionNodeLabel(nodes: PermissionTreeNode[], key: string): string | null {
  for (const node of nodes) {
    if (node.key === key) {
      return node.label
    }
    if (node.children?.length) {
      const result = findPermissionNodeLabel(node.children, key)
      if (result) {
        return result
      }
    }
  }
  return null
}
