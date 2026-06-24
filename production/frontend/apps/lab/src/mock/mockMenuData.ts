/**
 * 本地预览菜单兜底数据。
 *
 * 生产环境菜单由控制台/IAM 的 /v1/menu/{app_id}/appMenu 下发，仓库内不会保存
 * 完整租户菜单。这里按用户提供的《菜单数据 (3).xlsx》还原本地缺 IAM/控制台 token
 * 时的可预览菜单结构。
 */
import { MenuType } from '@/const/menu'
import type { MenuItem } from '@/types'

let nextMenuId = 1442200000000000

interface MenuSeed {
  code: string
  name: string
  sort: number
  pathUrl?: string
  iconUrl?: string
  type?: MenuItem['type']
  children?: MenuSeed[]
}

const createMenuItem = (seed: MenuSeed, parentId = 0, idPath = '/'): MenuItem => {
  const id = nextMenuId++
  const currentPath = `${idPath}${id}/`

  return {
    id,
    code: seed.code,
    name: seed.name,
    type: seed.type ?? MenuType.MENU,
    sort: seed.sort,
    parentId,
    idPath: currentPath,
    children: seed.children?.map((child) => createMenuItem(child, id, currentPath)) ?? [],
    description: '',
    elementResourceId: id,
    elementStatus: 0,
    highLightIconUrl: null,
    iconUrl: seed.iconUrl ?? '',
    pathUrl: seed.pathUrl ?? '',
    remark: null,
    secretLevel: 9999,
  }
}

const menuSeeds: MenuSeed[] = [
  {
    code: 'home',
    name: '首页',
    sort: 10,
    pathUrl: '/home',
    iconUrl: 'home',
  },
  {
    code: 'large_model',
    name: '大模型',
    sort: 20,
    iconUrl: 'RobotOutlined',
    children: [
      {
        code: 'task_overview',
        name: '任务概览',
        sort: 10,
        pathUrl: '/task-overview',
        iconUrl: 'DatabaseOutlined',
      },
      {
        code: 'data_services',
        name: '数据服务',
        sort: 20,
        iconUrl: 'DatabaseOutlined',
        children: [
          {
            code: 'data_management',
            name: '数据管理',
            sort: 10,
            iconUrl: 'DatabaseOutlined',
            children: [
              { code: 'training_management', name: '训练数据管理', sort: 10, pathUrl: '/datasets' },
              { code: 'test_management', name: '测试数据管理', sort: 20, pathUrl: '/measurement' },
              { code: 'Inference_result', name: '推理结果集', sort: 30, pathUrl: '/Inference' },
              { code: 'file_manafement', name: '文件管理', sort: 40, pathUrl: '/file-management' },
            ],
          },
          {
            code: 'data_processing',
            name: '数据处理',
            sort: 20,
            iconUrl: 'BarcodeOutlined',
            children: [
              { code: 'data_annotation', name: '数据标注', sort: 10, pathUrl: '/data-annotation' },
              { code: 'data_cleaning', name: '数据清洗', sort: 20, pathUrl: '/data-cleaning' },
            ],
          },
        ],
      },
      {
        code: 'model_training',
        name: '模型训练',
        sort: 30,
        iconUrl: 'CloudServerOutlined',
        children: [
          {
            code: 'online_notebook',
            name: '在线Notebook',
            sort: 10,
            pathUrl: '/finetune/notebooks',
            iconUrl: 'CloudServerOutlined',
            children: [
              {
                code: 'custom_image',
                name: '自定义镜像',
                sort: 10,
                pathUrl: '/finetune/notebooks/custom-image',
                type: MenuType.BUTTON,
              },
            ],
          },
          {
            code: 'large_model_training',
            name: '大模型训练',
            sort: 20,
            pathUrl: '/training',
            iconUrl: 'ThunderboltOutlined',
          },
          {
            code: 'model_management',
            name: '我的模型',
            sort: 30,
            pathUrl: '/model',
            iconUrl: 'AppstoreOutlined',
          },
        ],
      },
      {
        code: 'evaluation_management',
        name: '模型评估',
        sort: 40,
        iconUrl: 'BoxPlotOutlined',
        children: [
          { code: 'effect_evaluation', name: '效果评估', sort: 10, pathUrl: '/effect-evaluation', iconUrl: 'RadarChartOutlined' },
          { code: 'evaluation_indicator', name: '评估指标', sort: 20, pathUrl: '/evaluation-indicator', iconUrl: 'BoxPlotOutlined' },
        ],
      },
      {
        code: 'model_service',
        name: '模型服务',
        sort: 50,
        iconUrl: 'DeploymentUnitOutlined',
        children: [
          { code: 'service_inference_hosted', name: '大模型部署', sort: 10, pathUrl: '/service/inference/hosted', iconUrl: 'DeploymentUnitOutlined' },
          { code: 'service_inference_external', name: '在线推理服务', sort: 20, pathUrl: '/service/inference/external' },
        ],
      },
    ],
  },
  {
    code: 'machine_learn',
    name: '机器学习',
    sort: 30,
    iconUrl: 'RobotOutlined',
    children: [
      { code: 'machine_task_overview', name: '任务概览', sort: 10, pathUrl: '/machine-task-overview', iconUrl: 'DatabaseOutlined' },
      { code: 'machine_data_management', name: '数据管理', sort: 20, pathUrl: '/machine-data-management', iconUrl: 'DatabaseOutlined' },
      { code: 'MACHINE_ANNOTATION', name: '数据标注', sort: 30, pathUrl: '/machine-annotation', iconUrl: 'DeploymentUnitOutlined' },
      { code: 'MACHINE_MODEL_MANAGER', name: '我的模型', sort: 40, pathUrl: '/michine-model-manager', iconUrl: 'AppstoreOutlined' },
      { code: 'MACHINE_MODEL_DEPLOYMENT', name: '模型部署', sort: 50, pathUrl: '/machine-model-deployment', iconUrl: 'DeploymentUnitOutlined' },
      {
        code: 'MACHINE_NOTEBOOK',
        name: '在线Notebook',
        sort: 60,
        pathUrl: '/machine-notebook',
        iconUrl: 'CloudServerOutlined',
        children: [
          {
            code: 'MIRROR',
            name: '自定义镜像',
            sort: 10,
            pathUrl: '/machine-notebook/mirror',
            type: MenuType.BUTTON,
          },
        ],
      },
      { code: 'ONLINE_ANNOTATION_SERVICE', name: '在线标注服务', sort: 70, pathUrl: '/machine-online-annotation-service', iconUrl: 'DeploymentUnitOutlined' },
    ],
  },
  {
    code: 'admin',
    name: '系统管理',
    sort: 40,
    iconUrl: 'AppstoreOutlined',
    children: [
      { code: 'admin_project', name: '项目管理', sort: 10, pathUrl: '/admin/projects', iconUrl: 'ProjectOutlined' },
      { code: 'kubernetes', name: '集群管理', sort: 20, pathUrl: '/admin/kubernetes', iconUrl: 'CloudServerOutlined' },
      { code: 'storage_config', name: '存储配置', sort: 30, pathUrl: '/admin/storage', iconUrl: 'HddOutlined' },
      {
        code: 'mirror_management',
        name: '镜像管理',
        sort: 40,
        iconUrl: 'ContainerOutlined',
        children: [
          { code: 'mirror_list', name: '镜像列表', sort: 10, pathUrl: '/admin/registry/list' },
          { code: 'mirror_repository', name: '镜像仓库', sort: 20, pathUrl: '/admin/registry' },
        ],
      },
      { code: 'basic_model', name: '模型仓库', sort: 50, pathUrl: '/admin/base-model', iconUrl: 'AppstoreOutlined' },
      { code: 'admin_settings', name: '系统配置', sort: 60, pathUrl: '/admin/settings', iconUrl: 'SettingOutlined' },
    ],
  },
]

export const mockMenuData: MenuItem[] = menuSeeds.map((seed) => createMenuItem(seed))
