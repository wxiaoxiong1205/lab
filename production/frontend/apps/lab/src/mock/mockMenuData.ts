/**
 * 本地预览菜单兜底数据。
 *
 * 生产环境菜单由控制台/IAM 的 /v1/menu/{app_id}/appMenu 下发，仓库内不会保存
 * 完整租户菜单。这里仅用于本地缺 IAM/控制台 token 时，按生产路由结构还原可预览的信息架构。
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
  children?: MenuSeed[]
}

const createMenuItem = (seed: MenuSeed, parentId = 0, idPath = '/'): MenuItem => {
  const id = nextMenuId++
  const currentPath = `${idPath}${id}/`

  return {
    id,
    code: seed.code,
    name: seed.name,
    type: MenuType.MENU,
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
    sort: 0,
    pathUrl: '/home',
    iconUrl: 'home',
  },
  {
    code: 'large_model',
    name: '大模型',
    sort: 1,
    iconUrl: 'RobotOutlined',
    children: [
      {
        code: 'llm_overview',
        name: '任务概览',
        sort: 1,
        pathUrl: '/task-overview',
        iconUrl: 'HomeOutlined',
      },
      {
        code: 'llm_data_management',
        name: '数据管理',
        sort: 2,
        iconUrl: 'DatabaseOutlined',
        children: [
          { code: 'training_dataset', name: '训练数据管理', sort: 1, pathUrl: '/datasets', iconUrl: 'DatabaseOutlined' },
          { code: 'validation_dataset', name: '验证数据管理', sort: 2, pathUrl: '/measurement', iconUrl: 'FileSearchOutlined' },
          { code: 'business_test_dataset', name: '业务测试数据集', sort: 3, pathUrl: '/business-test', iconUrl: 'ExperimentOutlined' },
          { code: 'business_inference_dataset', name: '业务推理数据集', sort: 4, pathUrl: '/business-inference', iconUrl: 'RadarChartOutlined' },
          { code: 'inference_result_dataset', name: '推理结果集', sort: 5, pathUrl: '/Inference', iconUrl: 'FileSearchOutlined' },
        ],
      },
      {
        code: 'llm_development',
        name: '开发与训练',
        sort: 3,
        iconUrl: 'ThunderboltOutlined',
        children: [
          { code: 'llm_training', name: '大模型训练', sort: 1, pathUrl: '/training', iconUrl: 'ThunderboltOutlined' },
          { code: 'llm_finetune_tasks', name: '微调任务', sort: 2, pathUrl: '/finetune/tasks', iconUrl: 'RocketOutlined' },
          { code: 'llm_notebook', name: '在线 Notebook', sort: 3, pathUrl: '/finetune/notebooks', iconUrl: 'CloudServerOutlined' },
          { code: 'preset_model', name: '预置模型调参', sort: 4, pathUrl: '/preset-model', iconUrl: 'SettingOutlined' },
          { code: 'data_cleaning', name: '数据清洗', sort: 5, pathUrl: '/data-cleaning', iconUrl: 'FilterOutlined' },
        ],
      },
      {
        code: 'llm_model_management',
        name: '模型管理',
        sort: 4,
        iconUrl: 'AppstoreOutlined',
        children: [
          { code: 'llm_model', name: '模型列表', sort: 1, pathUrl: '/model', iconUrl: 'AppstoreOutlined' },
          { code: 'llm_model_deployment', name: '模型部署', sort: 2, pathUrl: '/service/inference', iconUrl: 'DeploymentUnitOutlined' },
          { code: 'llm_api_service', name: 'API 服务', sort: 3, pathUrl: '/service/api', iconUrl: 'ApiOutlined' },
        ],
      },
      {
        code: 'llm_evaluation',
        name: '评估管理',
        sort: 5,
        iconUrl: 'LineChartOutlined',
        children: [
          { code: 'evaluation_indicator', name: '评估指标', sort: 1, pathUrl: '/evaluation-indicator', iconUrl: 'LineChartOutlined' },
          { code: 'effect_evaluation', name: '效果评估', sort: 2, pathUrl: '/effect-evaluation', iconUrl: 'BoxPlotOutlined' },
          { code: 'business_effect_evaluation', name: '业务效果评估', sort: 3, pathUrl: '/business-effect-evaluation', iconUrl: 'RadarChartOutlined' },
        ],
      },
      {
        code: 'llm_resources',
        name: '资源与工具',
        sort: 6,
        iconUrl: 'FolderFilled',
        children: [
          { code: 'file_management', name: '文件管理', sort: 1, pathUrl: '/file-management', iconUrl: 'FolderFilled' },
          { code: 'prompt_management', name: 'Prompt 管理', sort: 2, pathUrl: '/prompts', iconUrl: 'FormOutlined' },
          { code: 'llm_config', name: '大模型配置', sort: 3, pathUrl: '/llm-configs', iconUrl: 'SettingOutlined' },
          { code: 'chain_test', name: '链路测试', sort: 4, pathUrl: '/chain-test', iconUrl: 'ExperimentOutlined' },
          { code: 'openapi_access_key', name: 'OpenAPI AccessKey', sort: 5, pathUrl: '/api-access-key', iconUrl: 'ApiOutlined' },
        ],
      },
    ],
  },
  {
    code: 'machine_learning',
    name: '机器学习',
    sort: 2,
    iconUrl: 'DeploymentUnitOutlined',
    children: [
      {
        code: 'ml_overview_group',
        name: '任务中心',
        sort: 1,
        iconUrl: 'HomeOutlined',
        children: [
          { code: 'ml_task_overview', name: '任务概览', sort: 1, pathUrl: '/machine-task-overview', iconUrl: 'HomeOutlined' },
        ],
      },
      {
        code: 'ml_data_group',
        name: '数据管理',
        sort: 2,
        iconUrl: 'DatabaseOutlined',
        children: [
          { code: 'ml_data_management', name: '数据管理', sort: 1, pathUrl: '/machine-data-management', iconUrl: 'DatabaseOutlined' },
          { code: 'ml_data_annotation', name: '数据标注', sort: 2, pathUrl: '/machine-annotation', iconUrl: 'TagsOutlined' },
          { code: 'ml_online_annotation', name: '在线标注服务', sort: 3, pathUrl: '/machine-online-annotation-service', iconUrl: 'FormOutlined' },
        ],
      },
      {
        code: 'ml_development_group',
        name: '开发训练',
        sort: 3,
        iconUrl: 'CloudServerOutlined',
        children: [
          { code: 'ml_notebook', name: '在线 Notebook', sort: 1, pathUrl: '/machine-notebook', iconUrl: 'CloudServerOutlined' },
        ],
      },
      {
        code: 'ml_model_group',
        name: '模型部署',
        sort: 4,
        iconUrl: 'DeploymentUnitOutlined',
        children: [
          { code: 'ml_model_deployment', name: '模型部署', sort: 1, pathUrl: '/machine-model-deployment', iconUrl: 'DeploymentUnitOutlined' },
          { code: 'ml_model_manager', name: '模型管理', sort: 2, pathUrl: '/michine-model-manager', iconUrl: 'AppstoreOutlined' },
        ],
      },
    ],
  },
  {
    code: 'admin',
    name: '系统管理',
    sort: 999,
    iconUrl: 'SettingOutlined',
    children: [
      { code: 'admin_platform', name: '平台管理', sort: 1, pathUrl: '/admin/platform-management', iconUrl: 'SettingOutlined' },
      { code: 'admin_project', name: '项目管理', sort: 2, pathUrl: '/admin/projects', iconUrl: 'ProjectOutlined' },
      { code: 'admin_user', name: '用户管理', sort: 3, pathUrl: '/admin/users', iconUrl: 'UserOutlined' },
      { code: 'admin_member', name: '成员管理', sort: 4, pathUrl: '/admin/members', iconUrl: 'UserOutlined' },
      { code: 'storage_config', name: '存储配置', sort: 5, pathUrl: '/admin/storage', iconUrl: 'HddOutlined' },
      { code: 'kubernetes', name: '集群管理', sort: 6, pathUrl: '/admin/kubernetes', iconUrl: 'CloudServerOutlined' },
      {
        code: 'mirror_management',
        name: '镜像管理',
        sort: 7,
        iconUrl: 'ContainerOutlined',
        children: [
          { code: 'mirror_repository', name: '镜像仓库', sort: 1, pathUrl: '/admin/registry', iconUrl: 'ContainerOutlined' },
          { code: 'mirror_list', name: '镜像列表', sort: 2, pathUrl: '/admin/registry/list', iconUrl: 'ContainerOutlined' },
        ],
      },
      { code: 'basic_model', name: '基础模型管理', sort: 8, pathUrl: '/admin/base-model', iconUrl: 'AppstoreOutlined' },
      { code: 'system_settings', name: '系统设置', sort: 9, pathUrl: '/admin/settings', iconUrl: 'SettingOutlined' },
    ],
  },
]

export const mockMenuData: MenuItem[] = menuSeeds.map((seed) => createMenuItem(seed))
