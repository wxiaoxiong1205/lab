export interface DesignDocField {
  name: string
  location: string
  type: string
  required: string
  description: string
}

export interface DesignDocAction {
  name: string
  entry: string
  precondition: string
  successFeedback: string
  errorFeedback: string
}

export interface DesignDocState {
  name: string
  meaning: string
  presentation: string
  availableActions: string
}

export interface DesignDocChange {
  date: string
  change: string
  reason: string
  scope: string
}

export interface PageDesignDoc {
  pageName: string
  pagePath: string
  module: string
  updatedAt: string
  status: '规划中' | '开发中' | '已对齐生产环境' | '已基于需求演进'
  goal: string
  audience: string
  problem: string
  structure: string[]
  fields: DesignDocField[]
  actions: DesignDocAction[]
  states: DesignDocState[]
  interactionNotes: string[]
  productionComparison: string[]
  userChanges: string[]
  recentChanges: DesignDocChange[]
}

interface PageDocEntry {
  match: (pathname: string) => boolean
  doc: PageDesignDoc
}

const DOC_DATE = '2026-04-13'

function createDoc(doc: Omit<PageDesignDoc, 'updatedAt' | 'recentChanges'> & { recentChanges?: DesignDocChange[] }): PageDesignDoc {
  return {
    ...doc,
    updatedAt: DOC_DATE,
    recentChanges: doc.recentChanges ?? [
      {
        date: DOC_DATE,
        change: '接入页面内嵌设计文档通用能力',
        reason: '让页面效果与设计说明融合展示，减少产品与开发来回切换成本',
        scope: '全局页面壳层与当前页面文档内容',
      },
    ],
  }
}

const pageDocs: PageDocEntry[] = [
  {
    match: pathname => pathname === '/home',
    doc: createDoc({
      pageName: '首页',
      pagePath: '/home',
      module: '首页',
      status: '开发中',
      goal: '集中呈现平台概览、快捷入口与关键任务动态，帮助用户快速进入主流程。',
      audience: '产品经理、算法工程师、平台使用者',
      problem: '降低用户进入平台后的迷失感，缩短到主要模块的跳转路径。',
      structure: ['欢迎区', '统计卡片区', '快捷入口区', '任务动态区'],
      fields: [
        { name: '统计值', location: '顶部统计卡片', type: '只读数值', required: '否', description: '展示训练任务、评估任务、完成数与 GPU 使用率。' },
        { name: '快捷入口', location: '快捷入口卡片', type: '导航项', required: '否', description: '跳转到训练、数据、评估等高频模块。' },
      ],
      actions: [
        { name: '进入模块', entry: '快捷入口卡片', precondition: '用户已进入首页', successFeedback: '跳转到目标页面', errorFeedback: '无可跳转目标时保持当前页' },
        { name: '查看任务详情', entry: '任务卡片按钮', precondition: '任务卡片有详情内容', successFeedback: '打开详情弹窗', errorFeedback: '提示任务数据缺失' },
      ],
      states: [
        { name: '默认', meaning: '首页正常展示', presentation: '统计、快捷入口与任务动态同时可见', availableActions: '跳转、查看详情' },
        { name: '空态', meaning: '没有任务数据', presentation: '任务区显示空态说明', availableActions: '继续使用快捷入口' },
      ],
      interactionNotes: ['页面默认展示业务概览，不承载复杂配置流程。', '统计卡片和快捷入口需要保持高可读性与快速可点击性。'],
      productionComparison: ['当前首页是优化后的聚合仪表盘，较生产环境的欢迎页信息密度更高。'],
      userChanges: ['后续若首页承载新的业务入口，需要同步更新快捷入口说明与跳转逻辑。'],
    }),
  },
  {
    match: pathname =>
      pathname === '/datasets' ||
      pathname === '/datasets/training/create' ||
      pathname.startsWith('/datasets/training/'),
    doc: createDoc({
      pageName: '训练数据管理',
      pagePath: '/datasets',
      module: '数据管理',
      status: '开发中',
      goal: '管理训练数据集及其版本，支撑模型训练前的数据准备工作。',
      audience: '数据工程师、算法工程师',
      problem: '统一管理训练数据的创建、版本、来源与使用状态。',
      structure: ['页面标题区', '搜索与筛选区', '数据列表区', '独立创建页', '版本侧栏 + 基本信息卡 + 数据详情表'],
      fields: [
        { name: '数据集名称', location: '列表与表单', type: '文本', required: '是', description: '唯一标识训练数据集。' },
        { name: '最新版本', location: '列表列', type: '版本号', required: '否', description: '显示当前数据集的最新版本。' },
        { name: '数据用途', location: '列表列/表单', type: '单字段二级枚举', required: '是', description: '在同一个字段内先选文本生成/图像理解，再选 SFT、DPO、RFT-PPO、RFT-GRPO。' },
        { name: '数据格式', location: '列表列/表单', type: '枚举', required: '否', description: '例如 jsonl、csv、xlsx。' },
      ],
      actions: [
        { name: '新建数据集', entry: '右上角新建按钮', precondition: '具备创建权限', successFeedback: '创建成功并出现在列表中', errorFeedback: '表单校验或接口异常提示' },
        { name: '查看详情', entry: '列表行操作', precondition: '目标数据集存在', successFeedback: '打开详情页', errorFeedback: '提示数据集不存在' },
        { name: '新增版本', entry: '详情页左侧按钮', precondition: '当前数据集存在', successFeedback: '版本列表增加新版本', errorFeedback: '文件上传或接口异常提示' },
        { name: '去训练', entry: '详情页右上角按钮', precondition: '当前为训练数据集详情', successFeedback: '跳转训练模块', errorFeedback: '提示训练入口不可用' },
      ],
      states: [
        { name: '草稿', meaning: '数据集已创建但未发布', presentation: '版本状态为草稿', availableActions: '编辑、补充版本信息' },
        { name: '已发布', meaning: '数据集可用于训练', presentation: '列表状态强调可用', availableActions: '查看、选择用于训练' },
      ],
      interactionNotes: ['列表筛选优先服务数据查找效率。', '详情页采用左侧版本切换、右侧信息与明细展示的结构。', '本页已基于用户新增需求补充 DPO / RFT（PPO、GRPO）对应数据用途，并改为单字段内的二级选择。'],
      productionComparison: ['默认以生产环境训练数据管理为基线进行对齐。'],
      userChanges: ['如果后续增加字段或操作，需要同步更新页面文档侧板与 PRD/RPD 理解。', '根据用户新增需求，训练数据用途扩展为 SFT、DPO、RFT-PPO、RFT-GRPO 的文本生成/图像理解组合。'],
    }),
  },
  {
    match: pathname =>
      pathname === '/measurement' ||
      pathname === '/measurement/testing/create' ||
      pathname.startsWith('/measurement/testing/'),
    doc: createDoc({
      pageName: '测试数据管理',
      pagePath: '/measurement',
      module: '数据管理',
      status: '开发中',
      goal: '管理测试数据集及其版本，用于效果验证和回归评估。',
      audience: '测试工程师、算法工程师',
      problem: '保持测试数据来源、版本和使用场景清晰可追踪。',
      structure: ['搜索过滤区', '测试数据列表', '独立创建页', '版本侧栏 + 基本信息卡 + 数据详情表'],
      fields: [
        { name: '测试数据集名称', location: '列表与表单', type: '文本', required: '是', description: '测试数据的主标识。' },
        { name: '数据用途', location: '列表列/表单', type: '单字段二级枚举', required: '是', description: '在同一个字段内先选文本生成/图像理解，再选 SFT、DPO、RFT-PPO、RFT-GRPO。' },
        { name: '版本信息', location: '展开行/详情', type: '版本列表', required: '否', description: '记录各测试版本与说明。' },
      ],
      actions: [
        { name: '新增测试数据集', entry: '新建按钮', precondition: '具备创建权限', successFeedback: '写入列表并可展开版本', errorFeedback: '校验失败提示' },
        { name: '新增版本', entry: '详情页左侧按钮', precondition: '已有测试数据集', successFeedback: '版本加入当前数据集', errorFeedback: '提示目标已失效' },
        { name: '下载数据集', entry: '详情页顶部按钮', precondition: '测试数据集详情存在', successFeedback: '开始下载', errorFeedback: '提示下载失败' },
      ],
      states: [
        { name: '有版本', meaning: '测试数据集存在历史版本', presentation: '支持展开查看版本', availableActions: '查看、补充版本' },
        { name: '无版本', meaning: '仅有初始版本', presentation: '列表只显示当前版本', availableActions: '新增版本' },
      ],
      interactionNotes: ['版本信息需要与列表信息联动展示。', '详情页采用左侧版本切换、右侧信息与明细展示的结构。', '本页已基于用户新增需求补充 DPO / RFT（PPO、GRPO）对应数据用途，并改为单字段内的二级选择。'],
      productionComparison: ['保持与生产环境测试数据管理一致，不扩展业务测试数据集能力。'],
      userChanges: ['根据用户新增需求，测试数据用途扩展为 SFT、DPO、RFT-PPO、RFT-GRPO 的文本生成/图像理解组合。'],
    }),
  },
  {
    match: pathname =>
      pathname === '/inference' ||
      pathname === '/inference/create' ||
      pathname.startsWith('/inference/'),
    doc: createDoc({
      pageName: '推理结果集',
      pagePath: '/inference',
      module: '数据管理',
      status: '开发中',
      goal: '查看并管理推理结果数据，用于评估与回溯。',
      audience: '算法工程师、产品经理',
      problem: '让推理结果的来源模型、输入数据与结果状态能够被追溯。 ',
      structure: ['搜索区', '结果集列表', '行内操作 + 更多菜单', '独立创建页', '详情页基本信息卡与推理明细表'],
      fields: [
        { name: '结果集名称', location: '列表', type: '文本', required: '是', description: '推理结果记录名称。' },
        { name: '推理模型', location: '列表与详情', type: '关联字段', required: '否', description: '记录产出结果的模型来源。' },
        { name: '处理进度', location: '列表', type: '进度值', required: '否', description: '展示推理任务完成情况。' },
      ],
      actions: [
        { name: '查看结果详情', entry: '更多菜单或详情页入口', precondition: '结果集存在', successFeedback: '展示详情页', errorFeedback: '提示结果不可用' },
        { name: '启动推理', entry: '列表行按钮/更多菜单', precondition: '结果集状态允许启动', successFeedback: '状态切换为启动中', errorFeedback: '提示无法启动' },
        { name: '去评估', entry: '详情页或更多菜单', precondition: '结果集存在', successFeedback: '跳转评估模块', errorFeedback: '提示评估入口不可用' },
        { name: '终止', entry: '详情页或更多菜单', precondition: '任务处于排队中或运行中', successFeedback: '状态切换为已终止', errorFeedback: '启动中任务提示“正在启动中任务不支持终止”' },
      ],
      states: [
        { name: '已创建', meaning: '任务已创建未启动', presentation: '显示已创建标签', availableActions: '启动、编辑、查看详情、删除' },
        { name: '定时待启动', meaning: '任务已设置定时启动', presentation: '显示定时待启动标签', availableActions: '编辑、查看详情、删除' },
        { name: '启动中', meaning: '任务进入数据预处理启动阶段', presentation: '显示启动中标签', availableActions: '查看详情' },
        { name: '排队中', meaning: '任务等待资源调度', presentation: '显示排队中标签', availableActions: '终止、查看详情' },
        { name: '运行中', meaning: '任务已获得资源并运行', presentation: '显示运行中标签', availableActions: '终止、查看详情' },
        { name: '已完成', meaning: '推理结果已生成', presentation: '结果可查看', availableActions: '查看详情、删除' },
        { name: '失败', meaning: '任务执行失败', presentation: '显示失败标签', availableActions: '重新提交、查看详情、删除' },
        { name: '已终止', meaning: '任务被终止', presentation: '显示已终止标签', availableActions: '重新提交、查看详情、删除' },
      ],
      interactionNotes: ['结果集用于标准产品链路，不承接业务推理结果集能力。', '列表页有行内操作和更多菜单，详情页补业务动作区。', '全局任务流转需遵守统一状态规则，尤其是启动中任务不允许终止。'],
      productionComparison: ['对齐生产环境推理结果集页面的核心字段和状态表达。'],
      userChanges: [],
    }),
  },
  {
    match: pathname => pathname === '/data-annotation',
    doc: createDoc({
      pageName: '数据标注',
      pagePath: '/data-annotation',
      module: '数据处理',
      status: '开发中',
      goal: '创建和管理数据标注任务，提升训练前数据质量。',
      audience: '数据工程师、标注运营',
      problem: '统一记录标注任务的输入数据、输出数据、进度和参与者。',
      structure: ['在线标注/多人标注切换', '四步说明卡', '文本标注/图像标注切换', '任务列表', '创建任务弹窗'],
      fields: [
        { name: '任务名称', location: '表单/列表', type: '文本', required: '是', description: '标注任务的名称。' },
        { name: '数据集类型', location: '创建表单', type: '枚举', required: '是', description: '文本生成或图像理解。' },
        { name: '输入数据集', location: '创建表单', type: '下拉选择', required: '是', description: '选择待标注数据集。' },
        { name: '输出数据集', location: '详情', type: '关联数据', required: '否', description: '记录标注后生成的数据集。' },
      ],
      actions: [
        { name: '创建标注任务', entry: '新建按钮', precondition: '具备可选数据集', successFeedback: '任务进入列表', errorFeedback: '表单校验失败提示' },
        { name: '查看详情', entry: '列表操作', precondition: '任务存在', successFeedback: '打开详情', errorFeedback: '提示任务不存在' },
      ],
      states: [
        { name: '进行中', meaning: '标注尚未结束', presentation: '显示进度百分比', availableActions: '查看详情' },
        { name: '已完成', meaning: '标注已结束', presentation: '输出数据集可见', availableActions: '查看结果' },
      ],
      interactionNotes: ['页面顶部需要保留四步说明卡。', '文本标注和图像标注通过 query 参数切换。'],
      productionComparison: ['保持标准数据标注能力，不引入额外业务化标注链路。'],
      userChanges: [],
    }),
  },
  {
    match: pathname => pathname === '/data-cleaning' || pathname === '/data-cleaning/create',
    doc: createDoc({
      pageName: '数据清洗',
      pagePath: '/data-cleaning',
      module: '数据处理',
      status: '开发中',
      goal: '管理数据清洗任务及清洗后结果，提高训练数据可用性。',
      audience: '数据工程师',
      problem: '让数据去重、规范化和清洗结果可追踪。 ',
      structure: ['四步说明卡', '任务列表', '创建清洗任务页', '清洗算子配置区', '流程配置区'],
      fields: [
        { name: '清洗任务名称', location: '表单/列表', type: '文本', required: '是', description: '清洗任务标识。' },
        { name: '源数据集', location: '表单', type: '选择项', required: '是', description: '待清洗数据源。' },
        { name: '清洗字段', location: '创建页', type: '系统生成字段', required: '否', description: '当前数据集可选清洗字段。' },
        { name: '输出数据集', location: '表单/详情', type: '文本', required: '是', description: '清洗后的结果数据集名称。' },
      ],
      actions: [
        { name: '创建清洗任务', entry: '新建按钮', precondition: '已选择源数据集', successFeedback: '生成清洗任务', errorFeedback: '缺少必填项提示' },
      ],
      states: [
        { name: '待执行', meaning: '任务已创建未开始', presentation: '状态标签提示待执行', availableActions: '查看详情' },
        { name: '启动中', meaning: '任务已开始执行', presentation: '状态标签提示启动中', availableActions: '查看详情' },
        { name: '已完成', meaning: '任务执行完成', presentation: '展示清洗结果', availableActions: '查看输出数据' },
      ],
      interactionNotes: ['创建页需要使用独立路由。', '左侧为算子选择，右侧为流程配置空态或已选算子列表。'],
      productionComparison: ['沿用生产环境的数据清洗模块定位。'],
      userChanges: [],
    }),
  },
  {
    match: pathname => pathname === '/finetune/notebooks' || pathname === '/machine-notebook',
    doc: createDoc({
      pageName: '在线 Notebook',
      pagePath: 'dynamic',
      module: '模型训练 / 机器学习',
      status: '开发中',
      goal: '提供 Notebook 工作空间入口，便于实验和脚本编写。',
      audience: '算法工程师、研发工程师',
      problem: '减少在训练前后切换外部工具的成本。',
      structure: ['筛选区', 'Notebook 列表', '新建对话框', '详情入口'],
      fields: [
        { name: 'Notebook 名称', location: '列表/表单', type: '文本', required: '是', description: 'Notebook 主名称。' },
        { name: '描述', location: '表单', type: '长文本', required: '否', description: '补充说明用途。' },
      ],
      actions: [
        { name: '新建 Notebook', entry: '新建按钮', precondition: '具备资源权限', successFeedback: 'Notebook 加入列表', errorFeedback: '资源不足或校验失败提示' },
      ],
      states: [
        { name: '运行中', meaning: 'Notebook 已启动', presentation: '状态可见', availableActions: '查看、停止' },
        { name: '已停止', meaning: 'Notebook 未运行', presentation: '状态标签提示停止', availableActions: '启动、查看' },
      ],
      interactionNotes: ['后续如区分训练 Notebook 与机器学习 Notebook，应维持文档描述同步。'],
      productionComparison: ['以生产环境 Notebook 页面为基线。'],
      userChanges: ['如果不同模块需要不同文档内容，可在 pageDocs.ts 中拆分独立配置。'],
    }),
  },
  {
    match: pathname => pathname === '/training' || pathname === '/training/create' || pathname.startsWith('/training/detail'),
    doc: createDoc({
      pageName: '大模型训练',
      pagePath: '/training',
      module: '模型训练',
      status: '已对齐生产环境',
      goal: '承载大模型训练主链路，包括列表、创建、详情与版本追踪。',
      audience: '算法工程师、平台管理员',
      problem: '统一管理训练任务全生命周期。',
      structure: ['训练任务列表', '创建任务表单', '任务详情', '版本详情'],
      fields: [
        { name: '任务名称', location: '列表/表单', type: '文本', required: '是', description: '训练任务唯一标识。' },
        { name: '训练类型', location: '创建表单', type: '枚举', required: '是', description: '决定训练方案与参数组。' },
        { name: '资源配置', location: '创建表单', type: '复合配置', required: '是', description: 'GPU、CPU、内存和镜像等资源参数。' },
      ],
      actions: [
        { name: '创建训练任务', entry: '创建页', precondition: '表单必填项完整', successFeedback: '生成训练任务并返回列表/详情', errorFeedback: '表单校验或资源配置错误提示' },
        { name: '查看任务详情', entry: '列表项', precondition: '任务存在', successFeedback: '进入详情页', errorFeedback: '提示任务不可访问' },
      ],
      states: [
        { name: '保护中', meaning: '该模块默认不允许随意改动', presentation: '文档中明确标记为受保护模块', availableActions: '仅在用户明确要求时修改' },
        { name: '运行态', meaning: '训练任务已启动', presentation: '展示训练状态与版本记录', availableActions: '查看详情、版本' },
      ],
      interactionNotes: ['该模块为受保护模块，未经明确要求不得调整功能、交互和结构。'],
      productionComparison: ['当前项目已将其视为受保护主链路。'],
      userChanges: ['除非用户明确提出，否则只更新文档描述，不改动功能实现。'],
    }),
  },
  {
    match: pathname => pathname === '/model',
    doc: createDoc({
      pageName: '模型管理',
      pagePath: '/model',
      module: '模型训练',
      status: '开发中',
      goal: '管理训练产出的模型资产及其来源、版本和可用状态。',
      audience: '算法工程师、模型管理员',
      problem: '让模型资产在训练、部署、评估之间可复用。',
      structure: ['搜索与过滤', '模型列表', '新建/导入模型弹窗', '模型详情'],
      fields: [
        { name: '模型名称', location: '列表/表单', type: '文本', required: '是', description: '模型资产名称。' },
        { name: '模型来源', location: '表单', type: '枚举', required: '是', description: '基础模型、训练产物或外部导入。' },
        { name: '基础模型', location: '表单', type: '选择项', required: '否', description: '关联上游基础模型。' },
      ],
      actions: [
        { name: '新建模型记录', entry: '新建按钮', precondition: '具备模型管理权限', successFeedback: '模型出现在列表', errorFeedback: '校验失败提示' },
        { name: '启动/重新提交', entry: '列表行主操作', precondition: '状态允许启动或重提', successFeedback: '状态切换为启动中或已创建', errorFeedback: '不满足状态规则时按钮不可用' },
        { name: '编辑/查看详情/删除', entry: '列表行操作', precondition: '状态允许对应动作', successFeedback: '打开详情或完成删除', errorFeedback: '按钮禁用并保持当前页' },
      ],
      states: [
        { name: '已创建', meaning: '模型记录已建立未进入启动流程', presentation: '显示已创建标签', availableActions: '启动、编辑、查看详情、删除' },
        { name: '启动中', meaning: '模型任务进入启动流程', presentation: '显示启动中标签', availableActions: '查看详情' },
        { name: '已完成', meaning: '模型已可被下游使用', presentation: '显示已完成标签', availableActions: '查看详情、删除' },
        { name: '失败/已终止', meaning: '模型任务异常结束或被终止', presentation: '显示失败或已终止标签', availableActions: '重新提交、查看详情、删除' },
      ],
      interactionNotes: ['模型来源和关联基础模型是页面关键。', '该页已接入统一任务状态流转规则，动作显隐由状态控制。'],
      productionComparison: ['保持与生产环境模型管理能力一致。'],
      userChanges: [],
    }),
  },
  {
    match: pathname => pathname === '/effect-evaluation' || pathname === '/evaluation-indicator',
    doc: createDoc({
      pageName: '效果评估',
      pagePath: 'dynamic',
      module: '模型评估',
      status: '开发中',
      goal: '配置与执行模型效果评估任务，管理指标与结果。',
      audience: '算法工程师、产品经理',
      problem: '让评估任务、指标和结果形成标准闭环。',
      structure: ['任务列表或指标列表', '新建弹窗', '详情或说明区'],
      fields: [
        { name: '评估任务名称', location: '列表/表单', type: '文本', required: '是', description: '评估任务主标识。' },
        { name: '评估指标', location: '表单', type: '多选/下拉', required: '是', description: '决定评估维度。' },
      ],
      actions: [
        { name: '创建评估任务', entry: '新建按钮', precondition: '有可选模型和指标', successFeedback: '任务进入列表', errorFeedback: '缺失依赖提示' },
        { name: '启动/重新提交/终止', entry: '列表行操作', precondition: '状态满足统一任务流转规则', successFeedback: '状态切换并更新任务结果文案', errorFeedback: '启动中任务终止时提示“正在启动中任务不支持终止”' },
        { name: '编辑/查看详情/删除', entry: '列表行操作', precondition: '状态允许对应动作', successFeedback: '打开详情或完成删除', errorFeedback: '按钮禁用' },
      ],
      states: [
        { name: '已创建', meaning: '任务刚创建未启动', presentation: '显示已创建标签', availableActions: '启动、编辑、查看详情、删除' },
        { name: '启动中/排队中/运行中', meaning: '任务正在进入资源调度或执行阶段', presentation: '显示处理态标签', availableActions: '查看详情；排队中和运行中允许终止' },
        { name: '已完成', meaning: '评估结果已生成', presentation: '展示最终得分与结果', availableActions: '查看详情、删除' },
        { name: '失败/已终止', meaning: '任务执行失败或被手动终止', presentation: '显示失败或已终止标签', availableActions: '重新提交、查看详情、删除' },
      ],
      interactionNotes: ['标准产品仅保留效果评估和评估指标，不扩展业务效果评估。', '效果评估任务已遵守统一任务状态流转规则。'],
      productionComparison: ['与生产环境保持一致，避免混入非标准能力。'],
      userChanges: [],
    }),
  },
  {
    match: pathname => pathname === '/service/inference/hosted' || pathname === '/service/inference/external',
    doc: createDoc({
      pageName: '模型服务',
      pagePath: '/service/inference/*',
      module: '模型服务',
      status: '开发中',
      goal: '管理模型部署与在线推理服务，保证模型可对外提供能力。',
      audience: '平台管理员、算法工程师',
      problem: '统一管理服务状态、资源配置和访问方式。',
      structure: ['服务列表', '新建部署弹窗', '详情查看区'],
      fields: [
        { name: '服务名称', location: '列表/表单', type: '文本', required: '是', description: '服务主标识。' },
        { name: '模型来源', location: '表单', type: '枚举', required: '是', description: '说明服务依赖的模型来源。' },
        { name: '资源配置', location: '表单', type: '复合字段', required: '是', description: 'CPU、内存、显卡等配置。' },
      ],
      actions: [
        { name: '新建部署', entry: '新建按钮', precondition: '已选模型与资源', successFeedback: '生成服务记录', errorFeedback: '配置缺失提示' },
        { name: '启动/重新提交/终止', entry: '列表行操作', precondition: '状态满足统一任务流转规则', successFeedback: '状态切换到启动中、已创建或已终止', errorFeedback: '启动中任务终止时提示“正在启动中任务不支持终止”' },
        { name: '编辑/查看详情/删除', entry: '列表行操作', precondition: '状态允许对应动作', successFeedback: '打开详情或完成删除', errorFeedback: '按钮禁用' },
      ],
      states: [
        { name: '已创建', meaning: '服务部署记录已创建未启动', presentation: '显示已创建标签', availableActions: '启动、编辑、查看详情、删除' },
        { name: '启动中/排队中/运行中', meaning: '服务处于启动、排队或运行阶段', presentation: '显示处理中标签', availableActions: '查看详情；排队中和运行中允许终止' },
        { name: '已完成', meaning: '服务部署流程完成', presentation: '显示已完成标签', availableActions: '查看详情、删除' },
        { name: '失败/已终止', meaning: '服务部署失败或被终止', presentation: '显示失败或已终止标签', availableActions: '重新提交、查看详情、删除' },
      ],
      interactionNotes: ['标准产品只保留模型部署与在线推理服务，不增加 API 服务。', '模型部署页已接入统一任务状态流转规则。'],
      productionComparison: ['与生产环境模型服务模块一致。'],
      userChanges: [],
    }),
  },
  {
    match: pathname => pathname === '/machine-model-deployment',
    doc: createDoc({
      pageName: '机器学习模型部署',
      pagePath: '/machine-model-deployment',
      module: '机器学习',
      status: '开发中',
      goal: '管理机器学习模型部署任务及资源占用情况。',
      audience: '机器学习工程师、平台管理员',
      problem: '让机器学习模型部署状态、实例数和资源配置可追踪。',
      structure: ['筛选区', '部署列表', '创建部署弹窗'],
      fields: [
        { name: '服务名称', location: '列表/表单', type: '文本', required: '是', description: '部署服务主标识。' },
        { name: '模型名称', location: '列表/表单', type: '选择项', required: '是', description: '选择待部署的机器学习模型。' },
        { name: '状态', location: '列表', type: '任务状态', required: '是', description: '遵循统一任务状态流转规则。' },
      ],
      actions: [
        { name: '创建部署', entry: '右上角按钮', precondition: '已选择模型和资源', successFeedback: '新增部署进入列表', errorFeedback: '表单校验失败' },
        { name: '启动/重新提交/终止', entry: '列表行操作', precondition: '状态满足统一规则', successFeedback: '状态切换可见', errorFeedback: '不满足条件时按钮禁用' },
        { name: '编辑/删除/访问信息', entry: '列表行操作', precondition: '状态允许对应动作', successFeedback: '打开编辑入口或完成删除', errorFeedback: '按钮禁用' },
      ],
      states: [
        { name: '已创建', meaning: '部署记录已建立未启动', presentation: '显示已创建标签', availableActions: '启动、编辑、查看详情、删除' },
        { name: '启动中/排队中/运行中', meaning: '部署正在申请资源或运行', presentation: '显示处理中标签', availableActions: '查看详情；排队中和运行中允许终止' },
        { name: '已终止/失败', meaning: '部署被终止或执行失败', presentation: '显示失败或已终止标签', availableActions: '重新提交、查看详情、删除' },
      ],
      interactionNotes: ['当前为机器学习模块下的受控实现，但任务状态规则与主线模块保持一致。'],
      productionComparison: ['以生产环境机器学习模型部署页为基线。'],
      userChanges: [],
    }),
  },
  {
    match: pathname => pathname === '/admin/projects',
    doc: createDoc({
      pageName: '项目管理',
      pagePath: '/admin/projects',
      module: '系统管理',
      status: '已基于需求演进',
      goal: '管理项目基本信息，并在项目维度配置数据权限。',
      audience: '平台管理员、项目管理员',
      problem: '让项目列表、成员角色、成员可选角色和项目数据权限形成统一入口。',
      structure: ['项目列表', '新建项目弹窗', '项目权限弹窗', '成员添加区'],
      fields: [
        { name: '项目名称', location: '列表/表单', type: '文本', required: '是', description: '项目唯一显示名称。' },
        { name: '绑定集群', location: '列表/表单', type: '下拉选择', required: '是', description: '项目关联的目标集群。' },
        { name: '成员角色', location: '项目权限弹窗', type: '下拉选择', required: '是', description: '从该成员可拥有的角色中选择项目内生效角色。' },
        { name: '数据权限', location: '项目权限弹窗', type: '开关', required: '是', description: '控制成员是否可查看该项目及其业务页面。' },
      ],
      actions: [
        { name: '新建项目', entry: '右上角按钮', precondition: '具备菜单权限与操作权限', successFeedback: '项目写入列表，平台管理员默认拥有该项目数据权限', errorFeedback: '无操作权限时提示“无操作权限”' },
        { name: '成员管理', entry: '列表行操作', precondition: '具备项目管理操作权限', successFeedback: '打开成员与权限配置弹窗', errorFeedback: '无操作权限时提示“无操作权限”' },
        { name: '添加成员并选择角色', entry: '项目权限弹窗顶部表单', precondition: '成员存在且已选择一个可拥有角色', successFeedback: '成员加入项目并写入对应项目角色', errorFeedback: '缺少成员或角色时表单提示' },
        { name: '项目权限配置', entry: '列表行操作', precondition: '具备项目权限配置操作权限', successFeedback: '成员数据权限保存成功', errorFeedback: '无操作权限时提示“无操作权限”' },
      ],
      states: [
        { name: '有权限项目', meaning: '当前账号拥有该项目数据权限', presentation: '项目显示在列表与左侧项目选择区', availableActions: '查看、编辑、成员管理、项目权限配置' },
        { name: '无权限项目', meaning: '当前账号无该项目数据权限', presentation: '项目不显示在当前账号项目上下文中', availableActions: '不可查看该项目业务页面' },
      ],
      interactionNotes: ['平台管理员默认拥有所有项目数据权限。', '项目管理员与训练工程师默认无新建项目数据权限，需要在项目管理中手动开通。', '一个用户可以拥有多个角色，加入项目时需要明确选择该项目内生效角色。'],
      productionComparison: ['该页在生产环境基线之上新增了项目数据权限配置能力，用于承接本轮权限方案。'],
      userChanges: ['根据用户新增需求，项目数据权限改为在项目管理中维护。', '根据用户新增需求，添加项目成员时必须从该成员可拥有的多个角色中选择一个项目内角色。'],
    }),
  },
  {
    match: pathname => pathname === '/admin/permissions',
    doc: createDoc({
      pageName: '权限配置',
      pagePath: '/admin/permissions',
      module: '系统管理',
      status: '已基于需求演进',
      goal: '集中查看角色的操作权限，并与菜单权限、项目权限组成完整权限体系。',
      audience: '平台管理员',
      problem: '让业务操作权限有独立可视化入口，并和项目数据权限拆开管理。',
      structure: ['页面标题', '角色搜索区', '角色列表', '操作权限 Tab', '权限树'],
      fields: [
        { name: '角色名称', location: '左侧角色列表', type: '文本', required: '是', description: '展示角色名并支持检索。' },
        { name: '操作权限搜索', location: '右侧顶部', type: '搜索框', required: '否', description: '按关键字过滤权限树。' },
        { name: '操作权限树', location: '右侧主体', type: '树形多选', required: '是', description: '按菜单层级展示业务操作权限。' },
      ],
      actions: [
        { name: '切换角色查看权限', entry: '左侧角色列表', precondition: '角色存在', successFeedback: '右侧权限树切换到对应角色权限', errorFeedback: '无匹配角色时保持原选择' },
        { name: '搜索操作权限', entry: '右侧搜索框', precondition: '输入关键字', successFeedback: '树中过滤显示匹配权限节点', errorFeedback: '无匹配时展示空态' },
      ],
      states: [
        { name: '初始化角色只读', meaning: '平台管理员、项目管理员、训练工程师角色名称和操作权限不可修改', presentation: '显示只读锁定标签，权限树不可编辑', availableActions: '查看权限' },
        { name: '正常查看', meaning: '按角色查看现有操作权限', presentation: '树形权限节点按层级展开', availableActions: '检索、查看' },
      ],
      interactionNotes: ['当前只实现“操作权限”Tab。', '业务操作生效必须同时满足菜单权限、操作权限和项目权限。'],
      productionComparison: ['该页为用户本轮新增能力，不以生产环境已有页面为唯一限制。'],
      userChanges: ['新增系统管理下“权限配置”菜单，并按截图实现角色列表+操作权限树布局。'],
    }),
  },
  {
    match: pathname => pathname === '/admin/base-model',
    doc: createDoc({
      pageName: '基础模型管理',
      pagePath: '/admin/base-model',
      module: '系统管理',
      status: '开发中',
      goal: '维护平台基础模型清单、提供商信息和状态流转。',
      audience: '平台管理员',
      problem: '统一管理基础模型资产及其运行状态。',
      structure: ['筛选区', '基础模型列表', '新增弹窗', '详情弹窗'],
      fields: [
        { name: '模型Code', location: '列表/表单', type: '文本', required: '是', description: '基础模型唯一编码。' },
        { name: '模型提供商', location: '列表/表单', type: '枚举', required: '是', description: '模型来源提供商。' },
        { name: '状态', location: '列表', type: '任务状态', required: '是', description: '遵循统一任务状态流转规则。' },
      ],
      actions: [
        { name: '新增模型', entry: '右上角按钮', precondition: '具备平台管理权限', successFeedback: '记录加入列表', errorFeedback: '表单校验失败' },
        { name: '启动/重新提交/终止', entry: '列表行操作', precondition: '状态允许对应动作', successFeedback: '状态切换可见', errorFeedback: '按钮禁用' },
        { name: '编辑/查看详情/删除', entry: '列表行操作', precondition: '状态允许对应动作', successFeedback: '打开详情或删除记录', errorFeedback: '按钮禁用' },
      ],
      states: [
        { name: '已创建', meaning: '基础模型记录已创建未启动', presentation: '显示已创建标签', availableActions: '启动、编辑、查看详情、删除' },
        { name: '运行中', meaning: '基础模型当前可供平台使用', presentation: '显示运行中标签', availableActions: '终止、查看详情' },
        { name: '失败/已终止', meaning: '基础模型启动失败或被终止', presentation: '显示失败或已终止标签', availableActions: '重新提交、查看详情、删除' },
      ],
      interactionNotes: ['基础模型管理已按用户提供的全局任务流转规则收口。'],
      productionComparison: ['以生产环境基础模型管理页为基线，并补齐当前本地缺失的状态显隐逻辑。'],
      userChanges: [],
    }),
  },
  {
    match: pathname => pathname.startsWith('/machine-'),
    doc: createDoc({
      pageName: '机器学习模块',
      pagePath: '/machine-*',
      module: '机器学习',
      status: '开发中',
      goal: '提供机器学习数据、标注、模型和 Notebook 的补充能力。',
      audience: '算法工程师、机器学习工程师',
      problem: '承接与大模型训练平行的机器学习工作流。',
      structure: ['列表页', '创建弹窗/页面', '详情说明区'],
      fields: [
        { name: '名称', location: '列表/表单', type: '文本', required: '是', description: '当前对象的主标识。' },
      ],
      actions: [
        { name: '创建记录', entry: '新建按钮', precondition: '具备权限', successFeedback: '新增记录可见', errorFeedback: '提示校验失败' },
      ],
      states: [
        { name: '默认', meaning: '页面正常展示', presentation: '列表、创建入口可用', availableActions: '创建、查看' },
      ],
      interactionNotes: ['机器学习模块后续仍需持续与生产环境核对。', '当前已确认数据管理、机器学习标注、模型部署、在线Notebook相对稳定；模型管理和在线标注服务仍有稳定性风险。'],
      productionComparison: ['以生产环境机器学习模块为基线，对404或无稳定入口页面先做受控实现，不误判为生产稳定能力。'],
      userChanges: [],
    }),
  },
  {
    match: pathname => pathname.startsWith('/admin/'),
    doc: createDoc({
      pageName: '系统管理',
      pagePath: '/admin/*',
      module: '系统管理',
      status: '开发中',
      goal: '承载项目、集群、存储、镜像、基础模型和系统配置等平台治理能力。',
      audience: '平台管理员',
      problem: '让底层资源和平台配置可集中管理。',
      structure: ['管理列表', '配置弹窗/详情', '搜索筛选区'],
      fields: [
        { name: '资源名称', location: '列表/表单', type: '文本', required: '是', description: '当前管理对象名称。' },
        { name: '状态', location: '列表', type: '枚举', required: '否', description: '展示当前对象的连接或可用状态。' },
      ],
      actions: [
        { name: '新建或导入', entry: '新建按钮', precondition: '具备管理权限', successFeedback: '记录加入列表', errorFeedback: '参数异常提示' },
        { name: '测试连接/查看详情', entry: '列表操作', precondition: '对象存在', successFeedback: '反馈连接结果或打开详情', errorFeedback: '提示操作失败' },
      ],
      states: [
        { name: '正常', meaning: '资源连接或状态正常', presentation: '状态标签为正常/已连接', availableActions: '查看、继续配置' },
        { name: '异常', meaning: '资源状态异常', presentation: '状态标签警示', availableActions: '重试、查看详情' },
      ],
      interactionNotes: ['系统管理页大多仍为 mock 驱动，需要后续逐步换成真实后端。'],
      productionComparison: ['与生产环境系统管理模块对齐，孤立页面需按真实路由接入后再保留。'],
      userChanges: [],
    }),
  },
]

function customizeDocForPath(pathname: string, doc: PageDesignDoc): PageDesignDoc {
  const routeTitleMap: Record<string, { pageName: string; module?: string }> = {
    '/service/inference/hosted': { pageName: '模型部署' },
    '/service/inference/external': { pageName: '在线推理服务' },
    '/machine-data-management': { pageName: '数据管理', module: '机器学习' },
    '/machine-annotation': { pageName: '机器学习标注', module: '机器学习' },
    '/machine-model-management': { pageName: '模型管理', module: '机器学习' },
    '/machine-model-deployment': { pageName: '模型部署', module: '机器学习' },
    '/machine-notebook': { pageName: '在线 Notebook', module: '机器学习' },
    '/machine-annotation-service': { pageName: '在线标注服务', module: '机器学习' },
    '/admin/projects': { pageName: '项目管理' },
    '/admin/kubernetes': { pageName: '集群管理' },
    '/admin/storage': { pageName: '存储配置' },
    '/admin/registry': { pageName: '镜像管理' },
    '/admin/base-model': { pageName: '基础模型管理' },
    '/admin/settings': { pageName: '系统配置' },
    '/admin/permissions': { pageName: '权限配置' },
    '/admin/platform-management': { pageName: '平台管理员' },
  }

  const mapped = routeTitleMap[pathname]

  if (mapped) {
    return {
      ...doc,
      pageName: mapped.pageName,
      module: mapped.module ?? doc.module,
    }
  }

  if (pathname === '/machine-notebook') {
    return {
      ...doc,
      pageName: '在线 Notebook',
      module: '机器学习',
    }
  }

  if (pathname === '/evaluation-indicator') {
    return {
      ...doc,
      pageName: '评估指标',
    }
  }

  return doc
}

export function getPageDesignDoc(pathname: string): PageDesignDoc {
  const entry = pageDocs.find(item => item.match(pathname))

  if (!entry) {
    return createDoc({
      pageName: '页面设计文档待补充',
      pagePath: pathname,
      module: '未分类',
      status: '规划中',
      goal: '当前页面尚未建立完整的内嵌设计文档内容。',
      audience: '产品经理、开发工程师',
      problem: '需要补充页面目标、结构、字段和交互说明后，侧板文档才能完整发挥作用。',
      structure: ['待补充页面结构说明'],
      fields: [],
      actions: [],
      states: [],
      interactionNotes: ['后续开发该页面时，请同步更新 pageDocs.ts 中的文档定义。'],
      productionComparison: ['尚未与生产环境建立完整映射。'],
      userChanges: [],
    })
  }

  return customizeDocForPath(pathname, {
    ...entry.doc,
    pagePath: entry.doc.pagePath === 'dynamic' ? pathname : entry.doc.pagePath,
  })
}
