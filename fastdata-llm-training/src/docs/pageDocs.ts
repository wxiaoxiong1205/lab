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

export interface DesignDocDefaultRequirement {
  version: string
  content: string
  createdAt?: string
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
  defaultRequirements?: DesignDocDefaultRequirement[]
  syncMissingDefaultRequirements?: boolean
}

interface PageDocEntry {
  match: (pathname: string) => boolean
  doc: PageDesignDoc
}

const DOC_DATE = '2026-04-13'
export const GLOBAL_DESIGN_DOC_PATH = '/__global-requirements'
export const GLOBAL_DESIGN_DOC_MODULE = '全局模块'

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

const globalDesignDoc = createDoc({
  pageName: '全局需求',
  pagePath: GLOBAL_DESIGN_DOC_PATH,
  module: GLOBAL_DESIGN_DOC_MODULE,
  status: '已基于需求演进',
  goal: '承接不归属于单一业务页面或单一模块的跨模块需求、规则和体验优化。',
  audience: '产品经理、研发工程师、测试人员、项目协作者',
  problem: '部分需求会同时影响多个页面、多个业务域或全局壳层，若强行挂到某个页面会导致需求追踪失真。',
  structure: ['全局需求版本', '跨模块需求记录', '全局变更记录'],
  fields: [
    { name: '全局需求内容', location: '需求文档侧板', type: '长文本', required: '否', description: '记录跨页面、跨模块或平台级需求说明。' },
    { name: '需求版本', location: '需求文档侧板', type: '版本标签', required: '是', description: '与页面需求文档共用版本体系，例如 V1.14。' },
  ],
  actions: [
    { name: '新增全局需求', entry: '需求文档侧板切换到全局模块后点击添加需求', precondition: '需求不适合归属到当前页面', successFeedback: '需求保存到全局模块并进入需求评审中心', errorFeedback: '本地存储不可用时提示保存失败' },
    { name: '评审全局需求', entry: '需求评审中心选择全局模块', precondition: '当前版本存在全局需求', successFeedback: '展示全局模块下的需求条目', errorFeedback: '当前版本无全局需求时展示空态' },
  ],
  states: [
    { name: '默认', meaning: '全局模块已启用', presentation: '需求文档侧板可在当前页面与全局模块之间切换', availableActions: '新增、编辑、删除、复制全局需求' },
    { name: '空态', meaning: '当前版本暂无全局需求', presentation: '展示空态说明', availableActions: '添加需求' },
  ],
  interactionNotes: ['当前页以用户迭代需求为基线。', '全局模块用于承接不单独属于某个业务模块的需求，例如全局壳层、权限规则、需求文档体系、跨模块交互和统一校验体验。', '全局需求不跳转到独立业务页面，需求评审中点击全局需求时保持当前页面并打开全局模块文档。'],
  productionComparison: ['该模块为第二阶段协作需求新增，不来源于生产环境单页复刻。'],
  userChanges: ['根据用户需求，需求评审和需求文档均新增全局模块，用于记录不归属单一页面或模块的需求。', '根据用户最新要求，在 V1.14 全局需求中补充任务创建页必填项自动定位体验优化。'],
  syncMissingDefaultRequirements: true,
  defaultRequirements: [
    {
      version: 'V1.14',
      createdAt: '2026-05-27T10:00:00+08:00',
      content: `# V1.14 全局体验优化：任务创建页必填项自动定位

## 1. 背景

平台内多个任务创建页字段较多，用户点击“创建”或“提交”时，如果存在未填写的必填项，只出现顶部提示会导致用户需要上下滚动查找遗漏字段，填写效率低且容易误判。

## 2. 目标

在所有任务创建类页面中统一提交校验体验：当用户点击“创建/提交”且存在未填写必填项时，系统自动定位到首个未通过校验的必填项，并给出明确提示，让用户第一眼知道需要补充哪个字段。

## 3. 适用范围

- 大模型任务创建页，包括训练、Notebook、推理结果集、数据清洗、数据标注、在线推理服务、模型部署等创建流程。
- 机器学习任务创建页，包括数据管理、数据标注、Notebook、模型管理、模型部署等创建流程。
- 系统管理中存在较长表单且通过“创建/提交/保存”触发必填校验的页面，也应复用同一交互。

## 4. 交互规则

- 用户点击“创建/提交/保存”后，如果必填项缺失，优先定位到第一个未通过校验的字段。
- 页面应自动滚动到该字段所在位置，字段尽量进入视口中上部，避免被顶部导航、固定工具条或底部操作栏遮挡。
- 可聚焦的输入控件需要自动聚焦；不可直接聚焦的选择器、上传组件、卡片选择器等，需要滚动到对应 Form.Item 或字段容器，并展示校验态。
- 同步弹出轻量提示，文案需说明需要补充必填项，例如“请完善必填项：任务名称”。
- 如果字段位于折叠面板、步骤区域或 Tab 中，需先展开/切换到包含错误字段的区域，再执行滚动定位。
- 若同一页面存在多个必填项缺失，只定位第一个错误字段，其余字段保留原有校验态。

## 5. 验收标准

- 任一任务创建页空表单点击“创建/提交”后，页面自动跳转到首个未填必填项。
- 目标字段出现校验红字或错误态，并且用户无需手动上下滚动即可看到。
- 填完当前字段再次提交时，若仍有其它必填项缺失，继续定位到下一个首个错误字段。
- Notebook 和大模型训练等字段较多页面必须重点验证，不能只停留在顶部提示。`,
    },
  ],
})

export function getGlobalDesignDoc(): PageDesignDoc {
  return globalDesignDoc
}

const pageDocs: PageDocEntry[] = [
  {
    match: pathname => pathname === '/workspace',
    doc: createDoc({
      pageName: '项目空间',
      pagePath: '/workspace',
      module: '项目空间',
      status: '已基于需求演进',
      goal: '作为登录后的默认入口，展示当前用户有权限访问的项目列表。',
      audience: '平台用户、算法工程师、项目管理员',
      problem: '让用户先在项目空间中匹配并进入项目，再查看具体业务功能菜单。',
      structure: ['顶部双 Tab 壳层', '右上角消息中心', '项目空间标题区', '搜索与新增区', '项目卡片网格'],
      fields: [
        { name: '项目名称', location: '项目卡片', type: '文本', required: '是', description: '展示项目主标题。' },
        { name: '项目描述', location: '项目卡片', type: '文本', required: '否', description: '展示项目简介。' },
        { name: '创建人', location: '项目卡片底部', type: '文本', required: '否', description: '展示项目创建人。' },
        { name: '任务消息', location: '右上角消息中心', type: '站内消息', required: '否', description: '展示 Lab 核心任务的创建、启动、完成、失败、终止和待处理通知。' },
      ],
      actions: [
        { name: '搜索项目', entry: '顶部搜索框', precondition: '用户进入项目空间', successFeedback: '项目卡片按关键字过滤', errorFeedback: '无匹配结果显示空态' },
        { name: '进入项目', entry: '项目卡片', precondition: '用户拥有该项目权限', successFeedback: '建立当前项目上下文并进入项目业务页', errorFeedback: '无项目权限则不展示该卡片' },
        { name: '新增项目', entry: '右上角新增按钮', precondition: '具备系统管理中的新建项目权限', successFeedback: '项目加入项目空间列表', errorFeedback: '无操作权限时提示“无操作权限”' },
        { name: '查看消息中心', entry: '右上角 Bell 图标', precondition: '用户已登录', successFeedback: '打开右侧消息抽屉，可筛选未读、标记已读并跳转任务详情', errorFeedback: '无消息时展示空态' },
      ],
      states: [
        { name: '默认', meaning: '正常展示当前用户可访问项目', presentation: '项目卡片网格可见', availableActions: '搜索、进入项目、新增项目' },
        { name: '空态', meaning: '当前账号暂无可访问项目', presentation: '展示空态提示', availableActions: '等待分配项目或新建项目' },
      ],
      interactionNotes: ['登录后默认进入项目空间，而不是直接进入业务模块。', '点击项目卡片后才显示项目内具体功能菜单；大模型入口进入大模型业务默认页，机器学习入口进入机器学习业务默认页，任务概览由顶部同级入口进入。', '顶部主导航包含“任务概览、项目空间、系统管理”，任务概览与项目空间/系统管理同层。', '当前页以用户迭代需求为基线。旧结构：右上角 Bell 仅展示静态红点数字；新结构：Bell 接入可交互消息中心，未读数来自通知 store，点击后以右侧抽屉展示 Lab 任务站内消息。'],
      productionComparison: ['该页为用户新增的信息架构调整，不是直接复刻当前生产环境首页。'],
      userChanges: ['根据用户新增需求，项目选择改为登录后自动匹配项目卡片列表，点击项目后再进入具体功能菜单。', '根据本轮需求，右上角新增 Lab 任务站内消息中心，覆盖训练、推理、清洗、标注、部署、在线 Notebook、Notebook 案例发布和自定义镜像生成等核心异步任务。'],
    }),
  },
  {
    match: pathname => pathname === '/task-overview',
    doc: createDoc({
      pageName: '任务概览',
      pagePath: '/task-overview',
      module: '任务概览',
      status: '已基于需求演进',
      goal: '作为顶层入口，默认进入当前用户有权限的最近项目，并集中展示该项目算力型任务与资源使用情况。',
      audience: '项目管理员、算法工程师、平台使用者',
      problem: '用户需要在不进入具体功能模块前快速判断项目中的算力任务状态、资源占用和需要关注的最新任务。',
      structure: ['仪表盘标题区', '项目与任务范围控制条', '当前视图与任务状态模块', '算力资源对比模块', '按状态分组的最新任务区'],
      fields: [
        { name: '任务状态统计', location: '当前视图模块', type: '只读数值', required: '是', description: '在当前视图说明下方按已创建、定时待启动、启动中、排队中、运行中、已终止、已完成、失败统计需要配置算力资源的任务。' },
        { name: '任务范围', location: '顶部控制条范围卡片', type: '卡片式筛选', required: '是', description: '支持全部任务、大模型、机器学习三种视图范围；默认全部任务，只影响当前页统计、资源和最新任务，不改变顶部业务导航上下文。' },
        { name: '项目算力', location: '算力资源模块左侧', type: '只读资源指标', required: '是', description: '展示当前项目在绑定集群中的已使用卡数、已使用显存、已使用 CPU、已使用内存；分母与对应集群总量保持一致。' },
        { name: '集群算力', location: '算力资源模块右侧', type: '只读资源指标', required: '是', description: '展示项目绑定集群的算力类型、集群总资源和集群整体已使用资源，用于和当前项目使用量对比。' },
        { name: '最新任务', location: '任务分组卡片', type: '任务列表', required: '是', description: '按定时待启动、启动中、排队中、运行中、失败分组展示任务名称、创建人、创建时间和任务模块。' },
      ],
      actions: [
        { name: '自动进入项目', entry: '顶部任务概览入口', precondition: '当前用户至少拥有一个可访问项目', successFeedback: '默认选中最近有权限项目并展示任务概览', errorFeedback: '无可访问项目时展示空态' },
        { name: '切换项目', entry: '当前项目名称旁的下拉选择', precondition: '用户拥有多个可访问项目', successFeedback: '直接切换当前项目并刷新任务概览数据，保留当前项目业务域上下文', errorFeedback: '无可访问项目时展示空态' },
        { name: '切换任务范围', entry: '任务范围卡片', precondition: '用户已进入任务概览页', successFeedback: '状态统计、当前项目算力、最新任务同步切换到全部任务/大模型/机器学习范围', errorFeedback: '当前范围无任务时保留 0 值和分组空态' },
        { name: '返回当前业务域', entry: '顶部原有业务导航按钮', precondition: '已选择当前项目且存在业务域上下文', successFeedback: '通过数据服务/模型训练/模型评估/模型服务或机器学习按钮进入对应项目业务页', errorFeedback: '无项目上下文时展示顶层导航' },
        { name: '进入任务详情', entry: '最新任务卡片', precondition: '任务由当前用户创建', successFeedback: '跳转到对应任务详情页', errorFeedback: '非本人创建的任务提示“暂无权限”' },
      ],
      states: [
        { name: '默认', meaning: '当前项目存在算力型任务', presentation: '默认展示大模型与机器学习全部算力型任务，状态统计、资源指标和最新任务同时可见', availableActions: '通过项目下拉切换项目、切换任务范围、顶部业务导航返回当前项目业务域、进入本人任务详情' },
        { name: '无项目权限', meaning: '当前账号没有可访问项目', presentation: '展示空态说明', availableActions: '等待项目授权' },
        { name: '分组空态', meaning: '某个状态下暂无最新任务', presentation: '对应状态卡片展示空态', availableActions: '查看其他状态分组' },
      ],
      interactionNotes: ['旧结构：大模型板块内存在“首页”入口，展示项目快捷入口和简单任务动态。', '新结构：抽离为顶层“任务概览”，与项目空间、系统管理同级；大模型顶部模块导航不再展示“首页”。', '任务概览顶部采用轻量仪表盘标题区，标题下不展示说明段落，项目选择与任务范围收敛到薄工具条，避免形成过重的大容器。', '任务范围采用三项轻量横向筛选，展示全部任务、大模型、机器学习的任务数量；选中态使用淡色底、细描边和左侧强调线，不使用大面积强渐变。', '窄屏下任务范围仍保持紧凑横排，不再纵向堆叠成大块卡片。', '当前视图说明与状态统计合并为一个模块，减少独立说明卡和统计卡之间的割裂。', '当前项目算力和对应集群算力融合为一个“算力资源”模块，左右分栏对比项目范围占用和集群整体使用。', '任务统计只覆盖需要配置算力资源的任务，不统计数据集、模型、标注等资源类实体。', '项目资源和集群资源分开展示在同一模块内，两侧指标的分母均为绑定集群总量，分子分别表示当前项目已使用资源和集群整体已使用资源；两者不一致时表示同集群下还有其他项目在使用资源。', '项目切换入口放在当前项目名称旁边，采用下拉选择方式，切换后留在任务概览页并刷新当前项目上下文。', '任务范围是页面视图筛选，不是业务工作区切换；默认展示全部，可切换为仅大模型或仅机器学习，且不改变顶部导航上下文。', '任务概览不新增页内返回按钮；当存在当前项目时，顶部仍展示原有业务域导航，用户通过数据服务/模型训练/模型评估/模型服务或机器学习按钮回到对应项目业务模块。', '最新任务只聚合定时待启动、启动中、排队中、运行中、失败五类需要关注的任务。'],
      productionComparison: ['当前页以用户第二阶段迭代需求为基线，不参考生产环境。'],
      userChanges: ['根据用户本轮需求，将原大模型首页抽离为顶层任务概览。', '新增任务状态统计、项目/集群算力资源对比、按状态分组的最新任务入口。', '新增非本人任务点击提示“暂无权限”的访问约束。', '根据用户最新需求，任务概览默认展示大模型与机器学习全部算力任务，并支持按大模型或机器学习切换视图范围。', '根据用户最新样式反馈，将普通分段筛选升级为顶部控制条和卡片式范围选择，强化任务概览的 dashboard 层级。', '根据用户继续反馈，弱化顶部视觉存在感，减少阴影、渐变、卡片高度和选中态重量。', '根据用户批注，删除任务概览标题下方说明文案。', '根据用户最新反馈，将当前视图与状态统计合并，并将项目算力和集群算力融合为一个算力资源模块，降低模块分割感。', '根据用户截图反馈，继续弱化顶部项目与任务范围区域，去掉外层大容器感并将范围筛选压缩为紧凑横排。'],
      syncMissingDefaultRequirements: true,
      defaultRequirements: [
        {
          version: 'V1.14',
          createdAt: '2026-05-22T16:40:00+08:00',
          content: `# V1.14 任务概览需求

## 1. 背景与目标

原“大模型首页”从大模型业务模块中抽离，升级为顶层“任务概览”入口，与“项目空间”“系统管理”处于同一导航层级。用户进入任务概览后，默认进入当前用户有权限的最近项目，用于快速查看该项目下需要配置算力资源的任务状态、资源占用与近期风险任务。

本页以第二阶段用户迭代需求为基线，不再默认参考生产环境首页结构。

## 2. 信息架构

- 顶部一级导航包含“任务概览 / 项目空间 / 系统管理”。
- 任务概览进入后不展示左侧业务侧栏，避免被误认为属于大模型或机器学习单一业务模块。
- 在已有项目上下文下，顶部仍保留原项目业务入口，包括“数据服务 / 模型训练 / 模型评估 / 模型服务 / 机器学习”，用户通过这些既有入口回到对应项目业务模块。
- 不新增“进入大模型”“进入机器学习”等页内返回按钮，避免在已有导航体系外再增加重复入口。
- 大模型或机器学习业务模块不应被任务概览入口劫持；用户从项目空间进入大模型或机器学习时，应能正常进入对应业务域。

## 3. 项目上下文

- 进入任务概览时，如果当前没有项目上下文，则默认选择当前用户有权限的最近项目。
- 如果用户拥有多个项目权限，则在任务概览顶部靠近项目名称的位置提供项目下拉选择。
- 切换项目后，用户仍停留在任务概览页，页面内状态统计、算力资源、最新任务同步刷新为新项目数据。
- 项目切换不改变用户在项目业务域中的导航能力；用户后续仍可通过顶部原有业务入口进入当前项目的大模型或机器学习模块。
- 如果当前账号没有任何可访问项目，页面展示无项目权限空态。

## 4. 任务范围筛选

- 任务概览默认展示“全部任务”，即当前项目下大模型与机器学习两类算力型任务的汇总视图。
- 支持切换为“大模型”或“机器学习”单域视图。
- 任务范围筛选只是当前页的数据视图筛选，不是业务工作区切换，不改变顶部导航、不隐藏业务入口、不改变当前项目上下文。
- 切换任务范围后，需要同步影响当前视图标题与说明、任务状态统计、当前项目算力使用量、最新任务列表和顶部范围数量。
- 范围筛选采用轻量横向样式，展示“全部任务 / 大模型 / 机器学习”及各自任务数量；选中态弱化处理，不使用重型卡片或大面积渐变。

## 5. 任务统计范围

只统计需要配置算力资源的任务，不统计数据集、模型、标注资源、存储配置、权限配置等资源类实体。

需要覆盖的任务状态包括：

- 已创建
- 定时待启动
- 启动中
- 排队中
- 运行中
- 已终止
- 已完成
- 失败

大模型范围内包含：

- 大模型训练任务
- 推理结果集任务
- 数据清洗任务
- 效果评估任务
- 大模型部署任务
- 在线 Notebook 等需要算力资源的任务

机器学习范围内包含：

- 机器学习模型部署任务
- 后续新增的机器学习算力型任务

## 6. 算力资源展示

“当前项目算力”和“对应集群算力”需要融合为一个“算力资源”模块，不拆成两个割裂卡片。

模块内分为两个对比面板：

- 当前项目算力：展示当前项目在所选任务范围下正在使用的资源。
- 对应集群算力：展示当前项目绑定集群的整体资源使用情况。

两侧指标使用同一套集群总量作为分母，便于用户判断当前项目与整个集群的占用关系。指标包括：

- 已使用卡数 / 总卡数
- 已使用显存 / 总显存
- 已使用 CPU / 总 CPU
- 已使用内存 / 总内存

当前项目算力的分子受任务范围筛选影响，只统计当前项目内当前范围下启动中、运行中等正在占用资源的任务。对应集群算力的分子表示集群整体已使用资源，不受当前任务范围筛选影响。

当当前项目已使用量与集群整体已使用量不一致时，说明同一集群下还有其他项目正在占用资源。算力类型需展示集群或任务涉及的类型，例如 GPU T4、GPU A100、NPU Ascend、CPU。

## 7. 最新任务

最新任务只展示需要重点关注的任务状态，按状态分组呈现：

- 定时待启动
- 启动中
- 排队中
- 运行中
- 失败

每条任务至少展示：

- 任务名称
- 创建人
- 创建时间
- 任务模块

任务列表按创建时间或更新时间倒序展示近期任务。切换项目或任务范围后，最新任务同步刷新。

点击任务时需要进行权限判断：如果任务由当前用户创建，则进入对应任务详情；如果不是当前用户创建，则不跳转，并提示“暂无权限”。当某个状态分组在当前范围内没有任务时，展示“当前范围暂无{状态}任务”的空态。

## 8. 页面布局与视觉要求

- 页面顶部保持轻量化，不使用厚重 hero 卡片。
- 标题区只保留必要的页面标题、项目标签和集群标签，不展示额外说明段落。
- 项目选择和任务范围筛选收敛在同一顶部控制区域，整体更像薄工具条。
- “当前视图”和“任务状态统计”合并为一个模块，减少上下文说明和统计数据之间的割裂。
- “当前项目算力”和“对应集群算力”合并为一个模块，通过左右对比表达项目与集群关系。
- 模块之间减少过强阴影、重边框和大面积背景色，整体保持轻、清晰、可快速扫读。

## 9. 验收标准

- 进入任务概览后，默认展示当前用户有权限项目下的全部算力型任务。
- 项目下拉切换后，状态统计、算力资源和最新任务全部同步刷新。
- 切换“全部任务 / 大模型 / 机器学习”后，当前视图、任务状态、项目算力、最新任务均按范围刷新。
- 顶部原业务导航仍可进入当前项目的数据服务、模型训练、模型评估、模型服务和机器学习模块。
- 从项目空间进入大模型或机器学习时，不会被错误跳转到任务概览。
- 任务概览页不展示左侧业务侧栏。
- 当前项目算力与对应集群算力在同一模块内展示，且分母保持为同一集群总量。
- 最新任务点击本人创建任务可进入详情，点击非本人任务提示“暂无权限”。
- 当没有可访问项目、某范围无任务、某状态分组无任务时，均有明确空态。
- 页面可正常运行并通过构建检查。`,
        },
      ],
    }),
  },
  {
    match: pathname => pathname.startsWith('/open-platform/api-keys'),
    doc: createDoc({
      pageName: 'API访问密钥',
      pagePath: '/open-platform/api-keys',
      module: '个人中心',
      status: '已基于需求演进',
      goal: '让当前登录用户创建、复制和删除用于访问开放平台 API 的个人访问密钥。',
      audience: '平台用户、开发者、外部系统集成方',
      problem: '用户需要从右上角个人入口获取 API 调用凭证，且该凭证应归属个人账号，不跟随当前项目切换。',
      structure: ['页面标题与功能描述', '开放平台文档跳转入口', '单个访问密钥创建入口', 'API 访问密钥列表'],
      fields: [
        { name: 'Access Key ID', location: '列表', type: '文本 + 复制按钮', required: '是', description: '展示当前账号唯一访问密钥的 Access Key ID，并支持复制完整 Key ID。' },
        { name: 'Secret Access Key', location: '列表', type: '脱敏文本 + 复制按钮', required: '是', description: '界面中间部分使用星号代替，复制时复制完整 Secret Access Key。' },
        { name: '创建时间', location: '列表', type: '日期', required: '是', description: '展示访问密钥创建日期。' },
        { name: '操作', location: '列表', type: '按钮', required: '是', description: '仅支持删除当前访问密钥。' },
      ],
      actions: [
        { name: '创建密钥', entry: '页面右上角创建密钥按钮', precondition: '用户已登录且当前账号尚未创建访问密钥', successFeedback: '在列表展示 Access Key ID、Secret Access Key 和创建时间', errorFeedback: '已存在密钥时提示每个账号仅允许创建一个' },
        { name: '查看开放平台文档', entry: '页面右上角开放平台文档按钮', precondition: '用户已登录', successFeedback: '跳转至文档中心开发指南页面', errorFeedback: '无' },
        { name: '复制 Access Key ID', entry: '列表 Access Key ID 列复制按钮', precondition: '密钥记录存在', successFeedback: '复制完整 Access Key ID 并提示已复制', errorFeedback: '浏览器复制能力不可用时使用兜底复制' },
        { name: '复制 Secret Access Key', entry: '列表 Secret Access Key 列复制按钮', precondition: '密钥记录存在', successFeedback: '复制完整 Secret Access Key 并提示已复制', errorFeedback: '浏览器复制能力不可用时使用兜底复制' },
        { name: '删除密钥', entry: '列表操作', precondition: '密钥记录存在', successFeedback: '二次确认后从列表移除', errorFeedback: '取消确认则保持列表不变' },
      ],
      states: [
        { name: '未创建', meaning: '当前账号尚无 API 访问密钥', presentation: '创建按钮可用，列表为空', availableActions: '创建密钥' },
        { name: '已创建', meaning: '当前账号已有唯一且永久有效的 API 访问密钥', presentation: '列表展示唯一记录，创建按钮置灰', availableActions: '删除密钥' },
      ],
      interactionNotes: ['入口位于右上角个人按钮下拉菜单，菜单名称为 API访问密钥。', '访问密钥归属当前登录账号，不归属当前项目，进入该页时左侧不展示项目菜单，卡片标题区不再重复展示当前账号。', '页面功能描述改为说明该密钥用于访问开放平台 API，并在标题区操作位提供开放平台文档入口，点击后新开独立窗口进入 /docs/developer-guide。', '每个账号仅允许创建一个访问密钥，密钥永久有效，不提供有效期、禁用、备注和名称字段。', 'Access Key ID 明文展示并可复制；Secret Access Key 中间部分星号脱敏展示，复制按钮复制完整值。', '当前页以用户第二阶段迭代需求为基线。', '本轮先使用 localStorage mock 数据，并通过 openPlatformApi 服务层保留未来接真实后端的边界。', '根据用户最新要求，点击右上角个人菜单中的 API访问密钥后新开窗口；API访问密钥作为独立工具页打开时，顶栏中间不展示“项目空间 / 系统管理”等菜单。', '根据本轮截图反馈，个人菜单中的 API访问密钥入口不展示前置图标，仅保留文本。'],
      productionComparison: ['当前页以用户第二阶段新增需求为基线，不参考生产环境。'],
      userChanges: ['根据用户本轮需求，右上角个人按钮入口由开放平台 API 改为 API访问密钥。', '访问密钥调整为个人账号级资源，不跟项目走，开放平台路由不展示左侧项目菜单。', '密钥能力调整为每个账号只允许创建一个，永久有效，列表字段固定为 Access Key ID、Secret Access Key、创建时间和删除操作。', '根据浏览器批注，修改页面功能描述，新增开放平台文档跳转入口，删除卡片右侧当前账号展示，并支持 Access Key ID 与 Secret Access Key 复制，其中 Secret Access Key 中间脱敏。', '根据用户最新要求，API访问密钥入口和开放平台文档入口改为新开独立窗口，并隐藏独立工具页顶栏中间菜单。', '根据本轮截图反馈，删除个人菜单中 API访问密钥前置图标。'],
      recentChanges: [
        {
          date: '2026-05-12',
          change: '按浏览器批注补齐文档入口、复制和脱敏展示',
          reason: '用户要求优化功能说明，删除当前账号展示，并支持 Key 复制与 Secret 脱敏',
          scope: 'API访问密钥页面与页面内嵌设计文档',
        },
        {
          date: '2026-05-12',
          change: 'API 访问密钥调整为个人账号级单密钥模型',
          reason: '用户要求只允许创建一个、永久有效、且不跟项目走',
          scope: '个人菜单、API访问密钥页面、开放平台本地服务层与页面内嵌设计文档',
        },
        {
          date: '2026-05-08',
          change: '安全盘点后确认 API Key mock 只持久化前缀和掩码',
          reason: '避免本地存储长期保存完整密钥，符合开放平台凭证最小暴露原则',
          scope: '开放平台 API 页面与页面内嵌设计文档',
        },
        {
          date: '2026-05-08',
          change: '新增开放平台 API 密钥管理页',
          reason: '用户要求在个人入口提供 API 密钥设置能力',
          scope: '个人菜单、开放平台 API 页面、API Key 本地服务层与页面内嵌设计文档',
        },
      ],
    }),
  },
  {
    match: pathname => pathname.startsWith('/docs'),
    doc: createDoc({
      pageName: '文档中心',
      pagePath: '/docs',
      module: '文档中心',
      status: '已基于需求演进',
      goal: '集中提供产品操作手册、开发指南和文档问答入口。',
      audience: '平台用户、开发者、产品经理、实施人员',
      problem: '原文档中心只有单一产品操作手册，无法承载开放平台 API 的开发接入说明。',
      structure: ['左侧静态标题', '左侧多文档目录', '文档内标题目录', '正文阅读区', '右侧 Agent 助手'],
      fields: [
        { name: '文档类型', location: '左侧目录', type: '导航项', required: '是', description: '包含产品操作手册和开发指南。' },
        { name: '关键词搜索', location: '左侧搜索框', type: '文本输入', required: '否', description: '在当前文档标题范围内搜索并定位章节。' },
      ],
      actions: [
        { name: '切换文档', entry: '左侧文档目录', precondition: '用户进入文档中心', successFeedback: '切换到对应文档路由和目录', errorFeedback: '无匹配文档时回到产品操作手册' },
        { name: '搜索章节', entry: '搜索框回车', precondition: '当前文档存在匹配标题', successFeedback: '跳转到首个匹配章节', errorFeedback: '无结果则保持当前文档' },
      ],
      states: [
        { name: '产品操作手册', meaning: '默认文档', presentation: '展示产品手册目录和正文', availableActions: '搜索、章节跳转、切换开发指南' },
        { name: '开发指南', meaning: '开放平台 API 接入说明', presentation: '展示 API 认证、密钥和错误码说明', availableActions: '搜索、章节跳转、切换产品手册' },
      ],
      interactionNotes: ['旧结构：文档中心左侧只有产品操作手册。', '新结构：文档中心左侧升级为多文档目录，产品操作手册和开发指南并列。', '开发指南路由为 /docs/developer-guide，/docs 默认仍进入产品操作手册。', '根据本轮批注，顶栏个人下拉不再提供身份切换入口，仅保留 API访问密钥、个人中心和设置。', '根据用户最新要求，点击顶栏文档中心图标时新开独立窗口，文档中心窗口顶部不展示中间业务菜单。', '根据截图备注，左侧删除“返回项目概览/返回项目空间”按钮；“文档中心”不再作为可展开一级目录，而是作为静态标题展示，目录从具体文档开始。', '根据本轮反馈，左侧保留具体文档入口，但过滤掉与文档名称重复的正文标题目录项，避免“产品使用手册”重复展示。'],
      productionComparison: ['当前页以用户第二阶段新增需求为基线，不参考生产环境。'],
      userChanges: ['根据用户本轮需求，在文档中心新增开发指南文档，用于说明开放平台 API、认证方式、密钥创建、请求示例和错误码。', '根据浏览器批注，移除右上角个人下拉中的身份切换分组和用户列表。', '根据用户最新要求，文档中心改为从顶栏新开窗口进入，并隐藏独立窗口顶栏中间菜单。', '根据用户截图备注，删除文档中心左侧返回按钮，并将文档中心从菜单一级节点改成左侧标题。', '根据本轮反馈，去掉左侧文档目录中与文档入口同名的重复正文标题。'],
      recentChanges: [
        {
          date: '2026-05-12',
          change: '移除个人下拉中的身份切换入口',
          reason: '用户要求不需要身份切换',
          scope: '全局顶栏个人菜单与文档中心页面内嵌设计文档',
        },
        {
          date: '2026-05-08',
          change: '文档中心从单文档升级为多文档目录',
          reason: '用户要求新增开发指南并承载开放平台 API 接入说明',
          scope: '文档中心路由、左侧目录、搜索定位与页面设计文档',
        },
      ],
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
        { name: '数据集名称', location: '列表/详情页/表单', type: '文本', required: '是', description: '唯一标识训练数据集；列表页与详情页基本信息支持行内编辑，详情页顶部标题只读展示。' },
        { name: '描述', location: '详情页/创建页/新增版本页', type: '长文本', required: '否', description: '训练数据描述属于版本维度；列表页不展示描述，详情页编辑当前选中版本的描述。' },
        { name: '最新版本', location: '列表列', type: '版本号', required: '否', description: '显示当前数据集的最新版本。' },
        { name: '版本创建人', location: '详情页版本侧栏/版本表/基本信息', type: '文本', required: '否', description: '每个版本展示对应创建人；历史本地数据无版本创建人时回退展示数据集创建人。' },
        { name: '来源版本', location: '合并版本数据详情表', type: '只读标签', required: '否', description: '当当前版本由多个已有版本合并生成时，每条明细展示其原始来源版本。' },
        { name: '数据用途', location: '列表列/表单', type: '单字段二级枚举', required: '是', description: '在同一个字段内先选文本生成/图像理解，再选 SFT、DPO、RFT-PPO、RFT-GRPO。' },
        { name: '数据格式', location: '列表列/表单', type: '枚举', required: '否', description: '文本生成 SFT 展示 PROMPT_RESPONSE / ROLE_BASED；图像理解 SFT 仅展示 ROLE_BASED；DPO 仅支持 Alpaca 与 Role-Based 两种格式。' },
      ],
      actions: [
        { name: '新建数据集', entry: '右上角新建按钮', precondition: '具备创建权限', successFeedback: '创建成功并出现在列表中', errorFeedback: '表单校验或接口异常提示' },
        { name: '查看详情', entry: '列表行操作', precondition: '目标数据集存在', successFeedback: '打开详情页', errorFeedback: '提示数据集不存在' },
        { name: '编辑名称', entry: '列表数据集名称或详情页名称后的编辑按钮', precondition: '目标数据集存在', successFeedback: '保存后列表、详情和引用选项同步刷新', errorFeedback: '必填或长度校验失败时提示' },
        { name: '编辑版本描述', entry: '详情页基本信息描述后的编辑按钮', precondition: '当前版本存在', successFeedback: '保存后更新当前版本描述', errorFeedback: '长度校验失败时提示' },
        { name: '新增版本', entry: '详情页左侧按钮', precondition: '当前数据集存在', successFeedback: '版本列表增加新版本', errorFeedback: '文件上传或接口异常提示' },
        { name: '合并版本', entry: '详情页左侧版本区合并版本按钮', precondition: '同一数据集内至少存在 2 个处理完成版本', successFeedback: '生成新的最新未发布版本，并在明细中保留来源版本标签', errorFeedback: '版本不足或接口异常时提示' },
        { name: '去训练', entry: '详情页右上角按钮', precondition: '当前为训练数据集详情', successFeedback: '跳转训练模块并自动回填当前数据集版本', errorFeedback: '提示训练入口不可用' },
        { name: '删除数据明细', entry: '详情页数据详情表操作列', precondition: '当前版本存在该条数据', successFeedback: '二次确认后删除该条数据并更新样本数', errorFeedback: '取消确认则不做修改' },
      ],
      states: [
        { name: '未发布', meaning: '版本已创建但尚未发布', presentation: '详情页版本状态为未发布', availableActions: '删除单条数据、发布、补充版本信息' },
        { name: '已发布', meaning: '版本可用于训练等下游链路', presentation: '详情页版本状态为已发布', availableActions: '查看、选择用于训练' },
        { name: '处理失败', meaning: '版本处理失败，不能进入发布可用态', presentation: '详情页版本状态为处理失败', availableActions: '查看失败版本信息' },
      ],
      interactionNotes: ['页面头部不再展示面包屑，统一只保留标题、返回按钮和必要操作。', '去掉面包屑后，创建页、详情页和新增版本页顶部统一改为“返回 + 标题 + 说明/操作”的紧凑结构，避免出现大面积留白。', '详情页顶部标题只展示数据集名称，不提供编辑入口；名称编辑统一放在基本信息的数据集名称字段。', '列表筛选优先服务数据查找效率。', '列表筛选项默认提示词使用“数据用途”，返回列表时不保留旧筛选值。', '列表表格统一使用普通横向滚动，不再使用固定操作列，避免内容与操作区重叠。', '列表页只允许编辑数据集名称，不新增描述列；描述属于版本维度，只在详情页当前版本基本信息中编辑。', '字段进入编辑态后不展示叉和勾按钮，按 Enter 或点击空白失焦即保存，Esc 取消本次编辑；详情页名称和描述字段后常显编辑按钮，编辑图标紧跟字段文本，不拉到单元格或字段容器右侧。', '左侧导航为固定侧栏时，主内容宽度需要扣除侧栏宽度，避免“100% 宽度 + 左边距”导致页面整体向右溢出。', '右侧需求文档侧板采用覆盖式抽屉，不再参与主内容宽度计算，避免窄屏或缩放时挤压列表并造成左右错位。', '详情页采用左侧版本切换、右侧信息与明细展示的结构，版本区展示版本级状态标签，只展示处理失败、未发布、已发布三类状态，并展示每个版本的创建人。', '详情页顶部需提供“返回列表”操作。', '数据删除必须有二次确认。', 'DPO 数据详情按格式切换：Alpaca 展示 Instruction、Input、Chosen、Rejected；Role-Based 展示 Messages、Chosen、Rejected，其中 system 和 user 都在 messages 字段内。', '创建页的数据属性区域改为分组卡片结构，一个数据属性分组只保留一个可填值入口。', '创建页提交时如果存在未填写必填项，需要自动滚动并聚焦到首个错误字段，同时提示用户补充必填项。', '新增版本页保持生产环境基础布局，数据来源字段下移到继承历史版本下方，继承历史版本开启后仍允许继续上传文件追加内容。', '创建页和新增版本页需提供 JSONL / JSON / CSV 三种上传模板下载，安全盘点后移除前端 xlsx 依赖。', '涉及文件上传的区域统一展示上传进度；上传过程中允许取消并保留断点，失败或取消后可点击继续上传从当前进度恢复；文件大小不设前端限制。', '本页已基于用户新增需求补充 DPO / RFT（PPO、GRPO）对应数据用途，并改为单字段内的二级选择。', '为演示图像理解训练流程，训练数据列表补充 SFT、DPO、RFT-PPO、RFT-GRPO 多类图像理解训练数据集。', '根据本轮批注，图像理解 SFT 不再暴露 PROMPT_RESPONSE，列表与训练选择弹窗统一使用 ROLE_BASED。', '版本合并与新增版本放在同一版本操作区域；只要求源版本处理完成，不要求已发布，因此未发布但处理完成的版本也可以参与合并。', '合并生成的新版本默认为未发布，源版本保持不变，重复样本全部保留，并通过来源版本列区分数据来源。', '版本侧栏操作区将新增版本和合并版本融合为同一组按钮，合并按钮在可合并版本不足 2 个时置灰。'],
      productionComparison: ['默认以生产环境训练数据管理为基线进行对齐。'],
      userChanges: ['如果后续增加字段或操作，需要同步更新页面文档侧板与 PRD/RPD 理解。', '根据用户新增需求，训练数据用途扩展为 SFT、DPO、RFT-PPO、RFT-GRPO 的文本生成/图像理解组合。', '根据本轮需求，DPO 数据结构从旧 CHOSEN_REJECTED 收敛为 Alpaca 与 Role-Based 两种格式；Role-Based 的 system/user 放在 messages 字段中，chosen/rejected 为 assistant 消息对象。', '根据本轮需求，训练数据详情页的“去训练”需要自动回填当前数据集到训练创建页。', '根据本轮批注，创建页删除 DPO 默认字段提示文案，数据属性改为分组卡片形式，详情页版本卡展示版本级状态与创建人。', '根据安全盘点结果，训练数据导出从 XLSX 改为 CSV，避免继续引入存在已知高危漏洞且无官方 npm 修复版本的 xlsx 依赖。', '根据本轮需求，被推理、标注、清洗或训练任务引用的数据集暂不允许删除；任务完成、失败或终止不释放引用，必须删除相关任务或停止引用链后才可删除。', '根据本轮需求，数据集删除增加创建人权限校验，仅创建人本人、项目管理员或租户管理员可删除。', '根据本轮演示需求，新增多条图像理解训练数据集，覆盖 SFT、DPO、RFT-PPO、RFT-GRPO 场景。', '根据本轮批注，图像理解 SFT 数据格式去掉 PROMPT_RESPONSE，仅保留 ROLE_BASED。', '根据本轮批注，训练数据详情页每个版本补充创建人展示，新增版本记录当前操作人，已有版本缺省时使用数据集创建人兜底。', '根据本轮需求，数据详情页支持删除当前版本内单条数据，删除前二次确认并明确不可恢复。', '根据本轮需求，数据管理上传文件大小放开前端限制。', '根据本轮需求，训练数据列表支持编辑名称但不展示描述；详情页名称可编辑，描述按当前版本维度编辑，保存后走数据服务 store/API 统一同步；详情页改名后自动替换当前路由。', '根据本轮 V1.14 需求，训练/验证数据详情支持合并同一数据集内多个处理完成版本，未发布版本也可参与，合并结果作为最新未发布版本。', '根据本轮发布态需求，新建和新增版本默认未发布；未发布版本展示发布入口且允许删除单条数据，已发布版本展示去训练入口并锁定单条删除，标注和清洗只允许选择已发布数据。'],
      syncMissingDefaultRequirements: true,
      defaultRequirements: [
        {
          version: 'V1.14',
          createdAt: '2026-05-27T16:20:00+08:00',
          content: `# V1.14 数据版本合并

训练/验证数据管理需要支持同一数据集内多个版本合并。入口与新增版本放在详情页左侧版本操作区域，用户可选择至少 2 个处理完成版本，未发布但处理完成的版本也允许参与合并。

合并后生成一个新的最新版本，默认未发布，源版本不删除、不改写。合并样本全部保留，即使内容或样本名重复也不去重；每条合并后的明细写入来源版本标签，并在数据详情表展示“来源版本”列。

不支持跨数据集、跨数据类型或跨数据格式合并。合并失败、版本不足或目标数据集不存在时需要给出明确提示。`,
        },
        {
          version: 'V1.14',
          createdAt: '2026-05-27T18:30:00+08:00',
          content: `# V1.14 数据版本发布态与下游可用性

训练/验证数据以版本发布态作为下游可用性边界。新建数据集、新增版本、清洗产出和标注产出的新数据默认未发布；未发布版本允许继续删除单条数据和发布。

下游训练、标注、清洗和推理数据选择按版本展开，已发布版本可选择，未发布版本保留展示但置灰且不可选择。若最新版本未发布，但同一数据集存在上一个已发布版本，下游仍可选择这个已发布版本。`,
        },
      ],
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
        { name: '测试数据集名称', location: '列表/详情页/表单', type: '文本', required: '是', description: '测试数据的主标识；列表页与详情页基本信息支持行内编辑，详情页顶部标题只读展示。' },
        { name: '描述', location: '详情页/创建页/新增版本页', type: '长文本', required: '否', description: '测试数据描述属于版本维度；列表页不展示描述，详情页编辑当前选中版本的描述。' },
        { name: '数据用途', location: '列表列/创建表单/详情页', type: '单级枚举', required: '是', description: '仅保留文本生成、图像理解两个选项，不再提供 SFT、DPO、RFT-PPO、RFT-GRPO 二级选择。' },
        { name: '版本信息', location: '展开行/详情', type: '版本列表', required: '否', description: '记录各测试版本与说明。' },
        { name: '来源版本', location: '合并版本数据详情表', type: '只读标签', required: '否', description: '当测试数据版本由多个已有版本合并生成时，每条明细展示其原始来源版本。' },
      ],
      actions: [
        { name: '新增测试数据集', entry: '新建按钮', precondition: '具备创建权限', successFeedback: '写入列表并可展开版本', errorFeedback: '校验失败提示' },
        { name: '编辑名称', entry: '列表测试数据集名称或详情页名称后的编辑按钮', precondition: '目标数据集存在', successFeedback: '保存后列表、详情和引用选项同步刷新', errorFeedback: '必填或长度校验失败时提示' },
        { name: '编辑版本描述', entry: '详情页基本信息描述后的编辑按钮', precondition: '当前版本存在', successFeedback: '保存后更新当前版本描述', errorFeedback: '长度校验失败时提示' },
        { name: '新增版本', entry: '详情页左侧按钮', precondition: '已有测试数据集', successFeedback: '版本加入当前数据集', errorFeedback: '提示目标已失效' },
        { name: '合并版本', entry: '详情页左侧版本区合并版本按钮', precondition: '同一测试数据集内至少存在 2 个处理完成版本', successFeedback: '生成新的最新未发布版本，并在明细中保留来源版本标签', errorFeedback: '版本不足或接口异常时提示' },
        { name: '发布当前版本', entry: '详情页顶部按钮', precondition: '当前版本处理完成且未发布', successFeedback: '当前版本发布后可被推理、评估、标注和清洗引用', errorFeedback: '权限不足或接口异常时提示' },
        { name: '下载数据集', entry: '详情页顶部按钮', precondition: '测试数据集详情存在', successFeedback: '开始下载', errorFeedback: '提示下载失败' },
        { name: '删除数据明细', entry: '详情页数据详情表操作列', precondition: '当前版本存在该条数据', successFeedback: '二次确认后删除该条数据并更新样本数', errorFeedback: '取消确认则不做修改' },
      ],
      states: [
        { name: '有版本', meaning: '测试数据集存在多个版本', presentation: '支持展开查看版本', availableActions: '查看、补充版本' },
        { name: '无版本', meaning: '仅有初始版本', presentation: '列表只显示当前版本', availableActions: '新增版本' },
      ],
      interactionNotes: ['页面头部不再展示面包屑，统一只保留标题、返回按钮和必要操作。', '去掉面包屑后，列表页头部采用克制的标题 + 说明结构，不新增统计卡；创建页、详情页和新增版本页统一改为“返回 + 标题 + 说明/操作”的紧凑结构。', '详情页顶部标题只展示数据集名称，不提供编辑入口；名称编辑统一放在基本信息的数据集名称字段。', '版本信息需要与列表信息联动展示。', '列表表格统一使用普通横向滚动，不再使用固定操作列，避免内容与操作区重叠。', '列表页只允许编辑测试数据集名称，不新增描述列；描述属于版本维度，只在详情页当前版本基本信息中编辑。', '字段进入编辑态后不展示叉和勾按钮，按 Enter 或点击空白失焦即保存，Esc 取消本次编辑；详情页名称和描述字段后常显编辑按钮，编辑图标紧跟字段文本，不拉到单元格或字段容器右侧。', '详情页采用左侧版本切换、右侧信息与明细展示的结构。', '测试数据创建和新增版本的文件上传需展示进度，上传中可取消，失败或取消后可继续上传并保留断点进度；文件大小不设前端限制。', '创建页提交时如果存在未填写必填项，需要自动滚动并聚焦到首个错误字段，同时提示用户补充必填项。', '根据用户最新要求，测试数据管理的数据用途从“文本生成/图像理解 + SFT/DPO/RFT 二级选择”收敛为单级枚举；创建页、列表筛选、列表列、详情页和新增版本页均只展示文本生成/图像理解。', '历史 mock 数据中带 SFT、DPO、RFT 前缀的数据用途在测试数据页按文本生成/图像理解归一展示。', '版本合并与新增版本放在同一版本操作区域；只要求源版本处理完成，不要求已发布，因此未发布但处理完成的版本也可以参与合并。', '合并生成的新版本默认为未发布，源版本保持不变，重复样本全部保留，并通过来源版本列区分数据来源。', '未发布版本可继续删除单条数据；发布后的版本锁定明细，不再展示单条删除操作。'],
      productionComparison: ['当前页以用户迭代需求为基线，本轮不参考生产环境。'],
      userChanges: ['根据用户最新反馈，测试数据管理创建页的数据用途只保留文本生成和图像理解，不再提供二级选择；列表和详情页的数据用途字段同步改为单级展示。', '根据本轮需求，被推理、标注、清洗或训练任务引用的测试数据集暂不允许删除；任务完成、失败或终止不释放引用，必须删除相关任务或停止引用链后才可删除。', '根据本轮需求，测试数据详情页支持删除当前版本内单条数据，删除前二次确认并明确不可恢复。', '根据本轮需求，数据管理上传文件大小放开前端限制。', '根据本轮需求，测试数据列表支持编辑名称但不展示描述；详情页名称可编辑，描述按当前版本维度编辑，保存后走数据服务 store/API 统一同步；详情页改名后自动替换当前路由。', '根据本轮 V1.14 需求，测试数据详情支持合并同一数据集内多个处理完成版本，未发布版本也可参与，合并结果作为最新未发布版本。'],
      syncMissingDefaultRequirements: true,
      defaultRequirements: [
        {
          version: 'V1.14',
          createdAt: '2026-05-27T18:30:00+08:00',
          content: `# V1.14 测试数据版本发布态

测试数据以版本发布态作为评估、推理、标注和清洗的数据可用边界。新建、追加、合并、清洗产出或标注产出的版本默认未发布；未发布版本允许删除版本里的单条数据和发布，发布前不做额外强校验。版本一旦发布，数据明细锁定，不允许继续删除该版本里的单条数据。

发布状态只属于具体版本，测试数据集外层列表不展示单一“发布状态”列，避免用一个状态代表所有版本。详情页版本状态标签只展示“处理失败 / 未发布 / 已发布”三类状态，不展示“历史版本”或“已归档”。

下游选择按版本展开，已发布版本可选择，未发布版本保留展示但置灰且不可选择。若最新版本未发布，但同一测试数据集仍有历史已发布版本，下游继续允许选择该历史已发布版本。`,
        },
        {
          version: 'V1.14',
          createdAt: '2026-05-27T16:20:00+08:00',
          content: `# V1.14 测试数据版本合并

测试数据管理需要支持同一测试数据集内多个版本合并。入口与新增版本放在详情页左侧版本操作区域，用户可选择至少 2 个处理完成版本，未发布但处理完成的版本也允许参与合并。

合并后生成一个新的最新版本，默认未发布，源版本不删除、不改写。合并样本全部保留，即使内容或样本名重复也不去重；每条合并后的明细写入来源版本标签，并在数据详情表展示“来源版本”列。

未发布合并版本允许继续检查和调整，包括删除该版本里的单条数据；发布后当前版本明细锁定，不允许继续删除单条数据，可被推理、评估、标注和清洗引用。`,
        },
      ],
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
      structure: ['搜索区', '结果集列表', '行内操作 + 更多菜单', '独立创建页', '推理模型参数设置', '选择待推理数据弹窗', '导入推理结果集上传区', '详情页基本信息卡与推理明细表'],
      fields: [
        { name: '结果集名称', location: '列表/详情页', type: '文本', required: '是', description: '推理结果记录名称，支持在列表和详情页基本信息行内编辑；详情页顶部标题只读展示。' },
        { name: '结果集描述', location: '列表/创建页/详情页', type: '长文本', required: '否', description: '推理结果集任务级描述，最多 300 字；列表与详情页均可行内编辑。' },
        { name: '推理方式', location: '创建页/筛选区', type: '单选枚举', required: '是', description: '离线推理、在线推理或导入推理结果集。' },
        { name: '待推理数据', location: '创建页', type: '弹窗选择', required: '是', description: '点击“选择”后打开数据集选择弹窗，可选择数据集；训练/验证数据集中仅展示 SFT 类型版本，DPO/RFT 数据不允许作为待推理数据。' },
        { name: '推理模型', location: '创建页/列表与详情', type: '级联选择', required: '否', description: '创建页先选择模型仓库或我的模型，再选择具体模型；我的模型继续选择版本。' },
        { name: '推理模型参数', location: '创建页', type: '数值配置', required: '否', description: '选择待推理模型后展示 max_tokens、Temperature、Top_p、presence_penalty，默认值按截图配置。' },
        { name: '处理进度', location: '列表', type: '进度值', required: '否', description: '展示推理任务完成情况。' },
      ],
      actions: [
        { name: '查看结果详情', entry: '更多菜单或详情页入口', precondition: '结果集存在', successFeedback: '展示详情页', errorFeedback: '提示结果不可用' },
        { name: '编辑名称/描述', entry: '列表字段或详情页字段后的编辑按钮', precondition: '结果集存在', successFeedback: '保存后列表、详情和评估选择项同步刷新', errorFeedback: '必填或长度校验失败时提示' },
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
      interactionNotes: ['结果集用于标准产品链路，不承接业务推理结果集能力。', '列表页有行内操作和更多菜单，详情页补业务动作区。', '详情页顶部标题只展示结果集名称，不提供编辑入口；名称编辑统一放在基本信息的数据集名称字段。', '创建页中的推理方式会影响表单字段，导入推理结果集切换为上传方式、模型名称、数据用途、数据格式、上传文件和示例模板下载，不展示任务定时配置。', '导入推理结果集的文件上传需展示进度，上传中可取消，失败或取消后可继续上传并保留断点进度；文件大小不设前端限制。', '创建页删除独立“数据用途”和“数据量”录入字段，数据量由选择的数据集版本自动带出。', '待推理数据改为只读输入框 + 选择弹窗，可选择数据集；训练/验证数据集只允许选择 SFT 类型版本，DPO/RFT 数据在数据源层面过滤，弹窗的数据用途筛选展示“全部、文本生成、图像理解”，不单独展示 SFT 选项。', '待推理模型改为级联选择：模型仓库/我的模型 -> 模型 -> 版本；选择后展示推理模型参数设置。', '推理模型参数的数值输入与 -/+ 操作按钮采用不换行栅格，避免窄屏下按钮错位。', '在线推理不展示显卡资源配置，离线推理才展示显卡资源配置。', '创建页删除底部“当前推理方式/待推理来源”摘要卡。', '创建页提交时如果存在未填写必填项，需要自动滚动并聚焦到首个错误字段，同时提示用户补充必填项。', '全局任务流转需遵守统一状态规则，尤其是启动中任务不允许终止。', '当前页以用户迭代需求为基线；生命周期任务支持在列表名称列与描述列分别行内编辑，编辑入口悬浮显示且不受任务状态影响，效果评估引用的推理结果集选项随数据服务任务源刷新。', '列表与详情字段进入编辑态后不展示叉和勾按钮，按 Enter 或点击空白失焦即保存，Esc 取消本次编辑；详情页名称和描述字段后常显编辑按钮，编辑图标紧跟字段文本，不拉到单元格或字段容器右侧。'],
      productionComparison: ['本轮按用户要求直接访问生产环境推理结果集创建页核对，创建表单对齐其推理方式、定时配置、待推理数据选择和资源配置结构；用户明确要求删除的数据用途字段已改为弹窗筛选项。'],
      userChanges: ['根据本轮批注，推理创建页删除独立数据用途和数据量字段，待推理数据改为弹窗选择，并在弹窗中补充 SFT/DPO/RFT-PPO/RFT-GRPO 数据用途筛选。', '根据最新批注，补齐待推理模型级联选择、模型参数设置、数据弹窗整行点击展开、在线推理隐藏资源配置、导入推理结果集上传配置和模板下载。', '根据本轮批注，修复推理模型参数 -/+ 按钮在窄区域换行错位问题。', '根据本轮需求，推理结果集详情页支持删除单条推理明细，删除前二次确认并提示不可恢复。', '根据本轮全局任务需求，推理结果集列表支持名称列与描述列分别行内编辑，编辑入口悬浮显示且不受任务状态影响，保存后通过数据服务 store/API 同步到评估选择项和引用提示。', '根据本轮需求，数据管理上传文件大小放开前端限制。', '根据本轮需求，推理结果集待推理数据保留测试数据集；训练/验证数据集中的 DPO/RFT 数据从选择弹窗的数据源、筛选项、列表和确认结果中统一过滤，并补充限制提示与空状态。', '根据本轮需求，推理结果集详情页同步支持名称和描述行内编辑，详情保存后与列表共享同一状态源。'],
    }),
  },
  {
    match: pathname => pathname === '/data-annotation' || pathname.startsWith('/data-annotation/'),
    doc: createDoc({
      pageName: '数据标注',
      pagePath: '/data-annotation',
      module: '数据处理',
      status: '开发中',
      goal: '创建和管理数据标注任务，提升训练前数据质量。',
      audience: '数据工程师、标注运营',
      problem: '统一记录标注任务的输入数据、输出数据、进度和参与者。',
      structure: ['生产截图一致的大白色内容面板', '在线标注/多人标注切换', '箭头式四步横向流程说明', '在线标注下的文本标注/图像标注分段按钮', '任务名称搜索 + 刷新/重置/创建操作区', '生产样式任务列表', '多人标注下的任务总览/标注任务/审核任务固定页签', '在线标注创建弹窗', '多人标注整页创建', '任务成员管理弹窗', '数据集选择弹窗', '任务总览详情', '标注任务工作台', '审核任务工作台', '标注配置弹窗'],
      fields: [
        { name: '任务名称', location: '表单/列表', type: '文本', required: '是', description: '标注任务的名称，列表支持在字段旁悬浮显示编辑入口并行内编辑。' },
        { name: '任务描述', location: '列表/详情', type: '长文本', required: '否', description: '标注任务补充说明，编辑入口悬浮显示且不受任务状态影响。' },
        { name: '任务状态', location: '列表', type: '状态标签', required: '否', description: '覆盖未开始、标注中、待审核、已完成、已提交、失败等标注任务状态。' },
        { name: '数据集类型', location: '创建表单', type: '卡片式单选', required: '是', description: '文本生成或图像理解，切换后同步过滤可选数据集。' },
        { name: '输入数据集', location: '创建表单', type: '只读输入框 + 选择弹窗', required: '是', description: '选择待标注数据集，并自动带出数据量。' },
        { name: '协作人数', location: '多人标注创建表单', type: '枚举', required: '是', description: '仅多人标注模式下可配置。' },
        { name: '审核方式', location: '多人标注创建表单', type: '枚举', required: '是', description: '仅多人标注模式下可配置。' },
        { name: '输出数据集', location: '详情', type: '关联数据', required: '否', description: '记录标注后生成的数据集。' },
        { name: 'Ground Truth', location: '标注详情工作台', type: '多行文本/只读结果', required: '是', description: '当前数据的标注结果；已完成或已提交任务均锁定为只读，不允许再次编辑。' },
        { name: 'DPO Alpaca 标注', location: '标注详情工作台', type: 'Instruction/Input/Chosen/Rejected', required: '是', description: 'DPO-Alpaca 数据进入标注页后，表格除序号、进度和操作外直接按 Instruction、Input、Chosen、Rejected 字段展开展示；Chosen/Rejected 输入框悬浮时右下角展示 AI 标注按钮。' },
        { name: 'DPO Role-Based 标注', location: '标注详情工作台', type: 'Messages/Chosen/Rejected', required: '是', description: 'DPO-Role-Based 数据进入标注页后，表格除序号、进度和操作外直接按 Messages、Chosen、Rejected 字段展开展示，system 和 user 均在 Messages 内；Chosen/Rejected 输入框悬浮时右下角展示 AI 标注按钮。' },
        { name: '图像理解标注', location: '图像详情工作台', type: 'System/User/Assistant 表格', required: '是', description: 'User 列展示图片与问题，Assistant 列支持多条标注答案和 AI 标注入口。' },
        { name: '多人标注任务视图', location: '多人标注页', type: '固定页签', required: '是', description: '项目管理员可见任务总览并创建任务，标注任务和审核任务按当前登录账号分配数据展示。' },
        { name: '标注/审核成员', location: '多人标注创建页/任务成员弹窗', type: '项目成员多选表格', required: '是', description: '标注成员和审核成员分别选择；创建页配置成员与截止时间，任务成员弹窗仅展示创建时配置并支持替换成员。' },
        { name: '标注进度/审核进度', location: '多人标注详情页', type: '状态文字', required: '是', description: '多人标注详情页始终展示整体标注/审核进度，并按数据行展示未标注/已标注、未审核/通过/未通过。' },
        { name: '选择服务', location: '标注配置弹窗', type: '下拉选择', required: '是', description: '选择模型服务中的在线推理服务作为标注辅助服务。' },
        { name: '模型参数', location: '标注配置弹窗', type: '数字输入', required: '是', description: '包含 Max_tokens、Temperature、Top_p、presence_penalty，使用用户指定默认值。' },
        { name: 'User / Assistant', location: '多人标注工作台', type: '表格列', required: '是', description: '多人标注任务入口按生产环境以 User 承载待标注输入、Assistant 承载标注结果。' },
        { name: '审核结果', location: '审核任务工作台', type: '单选/原因', required: '是', description: '审核任务入口一页展示一条数据；选择未通过时必须填写原因，完成审核后锁定当前条。' },
      ],
      actions: [
        { name: '创建标注任务', entry: '新建按钮', precondition: '具备可选数据集', successFeedback: '任务进入列表', errorFeedback: '表单校验失败提示' },
        { name: '查看详情', entry: '列表操作', precondition: '任务存在', successFeedback: '进入整页标注工作台', errorFeedback: '提示任务不存在' },
        { name: '完成标注', entry: '标注详情行操作', precondition: '当前数据已填写 Ground Truth 且未提交', successFeedback: '当前条标为已标注并自动切换下一条', errorFeedback: '提示先填写标注结果' },
        { name: '提交标注', entry: '标注详情底部按钮', precondition: '全部数据均已完成标注', successFeedback: '提交成功并锁定编辑', errorFeedback: '按钮不可点击或提示未完成' },
        { name: '标注配置', entry: '详情页顶部按钮', precondition: '进入标注详情', successFeedback: '保存在线推理服务和模型参数', errorFeedback: '表单校验失败提示' },
        { name: '任务成员', entry: '多人标注任务总览行操作', precondition: '任务存在', successFeedback: '打开成员管理弹窗并可维护标注/审核成员', errorFeedback: '无' },
        { name: '删除单条数据', entry: '标注/审核工作台行操作', precondition: '当前任务未提交且二次确认通过', successFeedback: '当前数据从工作台移除并自动调整分页', errorFeedback: '已提交任务提示不允许删除；取消确认后不变更' },
        { name: '查看详情（标注任务）', entry: '多人标注/标注任务行操作', precondition: '当前账号被分配标注任务', successFeedback: '进入标注任务工作台，仅展示标注填写、完成标注和提交标注', errorFeedback: '无' },
        { name: '完成审核', entry: '审核任务工作台行操作', precondition: '已选择审核结果；不通过时已填写原因', successFeedback: '当前条完成审核并自动跳转下一条', errorFeedback: '缺少结果或不通过原因时提示' },
        { name: '详情（审核任务）', entry: '多人标注/审核任务行操作', precondition: '当前账号被分配审核任务', successFeedback: '进入审核任务工作台，一页一条数据，展示审核结果、原因和完成审核操作', errorFeedback: '无' },
      ],
      states: [
        { name: '未开始', meaning: '任务已创建但尚未开始标注', presentation: '灰色状态标签，进度为0', availableActions: '查看详情、删除' },
        { name: '标注中', meaning: '任务正在执行标注', presentation: '蓝色状态标签，展示进度百分比', availableActions: '查看详情' },
        { name: '待审核', meaning: '多人标注已完成标注等待复核', presentation: '黄色状态标签，展示进度百分比', availableActions: '查看详情' },
        { name: '已完成', meaning: '标注已结束', presentation: '绿色状态标签，输出数据集可见', availableActions: '查看结果' },
        { name: '已提交', meaning: '标注结果已提交并锁定', presentation: '绿色状态标签，详情不可编辑', availableActions: '查看结果' },
        { name: '失败', meaning: '任务处理失败或服务不可用', presentation: '红色状态标签，进度显示为-', availableActions: '查看详情、删除' },
      ],
      interactionNotes: ['页面列表态以用户截图为基线：内容区使用大白色圆角面板，标题、说明、顶层页签、箭头流程、文本/图像分段、搜索操作区和表格按截图顺序排列。', '页面顶部四步说明从独立卡片收敛为生产环境的横向箭头流程说明，顶层页签与流程条之间保持紧凑间距，避免大面积留白。', '在线标注和多人标注需要在创建字段、详情信息和列表过滤上体现差异。', '在线标注中保留文本标注/图像标注切换；多人标注中固定展示任务总览、标注任务、审核任务三个页签。', '在线标注列表按截图隐藏任务描述和任务状态列，仅展示任务名称、数据量、标注进度、标注前数据集、标注后数据集、创建人、创建时间和操作。', '多人标注的标注任务列表按领取任务视角展示任务名称、数据量、标注进度、创建人和操作，不展示标注前数据集和标注后数据集。', '多人标注的审核任务列表按领取审核视角展示标注任务、数据量、审核进度、创建人、截止时间和操作。', '任务名称搜索框位于表格左上方，刷新、重置、创建标注任务按钮位于右侧。', '表格使用浅灰表头、大行高、细分割线和进度条 + 百分比/完成图标的生产样式。', '多人标注三个入口必须按来源拆分详情视角：任务总览进入创建者只读看板，标注任务进入标注工作台，审核任务进入审核工作台，不能共用任务总览详情。', '多人标注的标注任务详情按生产环境使用 System/User/Assistant/标注进度/操作列，列表操作文案保持“详情”。', '多人标注的审核任务详情按生产环境使用 System/User/Assistant/审核结果/操作列，一页一条数据；审核不通过时必须填写原因，点击完成审核后自动跳转下一条。', 'DPO 标注详情不再套用 SFT 的 Ground Truth 或 Assistant 单字段，Alpaca 使用 Instruction/Input/Chosen/Rejected，Role-Based 使用 Messages/Chosen/Rejected。', '根据本轮批注，DPO 标注详情表格不再使用“数据格式、待标注数据、偏好结果”等分组列，除序号、进度和操作外直接展开当前数据格式的字段列。', '根据本轮截图，DPO Chosen/Rejected 输入框鼠标悬浮或聚焦时，右下角浮现 AI 标注按钮；点击后生成演示内容并填入当前字段。', '多人标注创建从弹窗调整为整页表单，旧结构“弹窗创建” -> 新结构“基础信息卡片 + 标注成员分配 + 审核成员分配 + 页面底部操作”。', '多人标注列表不再展示当前身份文本；任务成员操作打开成员管理弹窗，删除操作必须先二次确认。', '多人标注详情是创建者查看视角，只读展示整体标注/审核进度和每条数据的标注/审核状态；行级状态使用未标注、已标注、未审核、通过、未通过，不使用进度条。', '任务成员弹窗中的任务截止时间取创建任务时配置，查看时不可编辑；成员调整只提供替换，不提供删除成员操作；替换成员时只能单选并逐个替换。', '文本标注和图像标注通过 query 参数切换。', '创建弹窗中数据选择不再使用普通下拉，改为生产环境的输入框加选择按钮。', '数据标注选择数据集弹窗统一改用共享数据集选择弹窗，左侧筛选、右侧列表、版本展开和格式展示与推理/清洗模块保持一致。', '从列表查看详情进入 /data-annotation/:id 整页工作台；在线/单人工作台单页只展示一条待标注数据，完成当前条后自动切换下一条。', '图像理解详情页按 System/User/Assistant 展示，User 内承载图片和问题，Assistant 内可维护多条答案。', '提交标注按钮需等全部数据已标注后才可点击；DPO 任务必须同时填写 Chosen 与 Rejected；提交成功后结果全部锁定。', '已完成/已提交标注任务详情为只读数据查看模式，Ground Truth 或 DPO 偏好结果以只读结果块展示，不展示标注状态列、完成标注操作和提交按钮。', '标注配置弹窗以在线推理服务为服务来源，图像理解任务默认选择图像理解在线推理服务。', '数据标注任务名称仍保留悬浮行内编辑能力；任务描述不在截图列表列中展示，但数据层继续保留。', '无项目上下文直接访问业务路由时，不再展示“请先进入项目空间”空状态，统一自动跳转项目空间页。'],
      productionComparison: ['本轮按用户要求重新查看生产环境：图像详情表格按 System/User/Assistant 呈现，多人标注页按任务总览/标注任务/审核任务三页签呈现。'],
      userChanges: ['旧截图已不作为设计依据；数据标注页以生产环境当前页面为基线进行收敛。', '根据本轮截图，数据标注列表页调整为大白色面板、顶层页签、箭头式四步流程、文本/图像分段、任务名称搜索与右侧刷新/重置/创建按钮，表格列和行高对齐截图。', '根据本轮明确需求，补齐查看详情的逐条标注工作台、完成自动下一条、全量完成后提交、提交后不可编辑，以及在线推理服务标注配置。', '根据本轮要求，数据标注列表补充多条演示任务，并覆盖未开始、标注中、待审核、已完成、已提交、失败等状态；已完成详情切换为只读数据模式。', '根据本轮批注，图像标注详情改为图像理解结构，多人标注按项目管理员视角补齐任务总览、标注任务和审核任务。', '根据最新批注，删除多人标注页当前身份展示，补齐任务成员管理、删除二次确认、多人标注整页创建以及多人详情的标注/审核进度。', '根据本轮批注，多人标注创建者详情改为只读进度看板，按页展示多条数据的标注/审核进度；任务成员弹窗取消截止时间编辑和移除成员，改为固定截止时间与替换成员。', '根据本轮批注，替换成员弹窗改为单选且逐个替换；多人详情行级标注/审核进度改为文字状态，不再使用进度条。', '根据本轮反馈，标注任务和审核任务入口不再共用任务总览详情，分别进入标注操作工作台和审核操作工作台。', '根据最新反馈，审核任务详情改为一页一条数据，审核操作收敛为审核结果列，并补充未通过原因和完成审核后自动下一条。', '根据本轮澄清，数据标注删除指进入标注/审核页后删除单条数据；只要任务未提交，无论该条是否已标注均可删除，已提交后不允许删除。', '根据本轮全局编辑反馈，数据标注任务名称与任务描述补齐悬浮编辑入口，点击后字段内直接变为输入框，且不受任务状态影响。', '根据本轮需求，多人标注的标注任务和审核任务列表重新对齐截图字段；标注任务删除标注前数据集和标注后数据集字段。', '根据本轮需求，数据标注 DPO 演示任务重生成为 DPO-Alpaca 与 DPO-Role-Based 两类规范数据，并同步修正引用的数据集名称。', '根据本轮截图反馈，压缩顶层页签到流程演示模块之间的留白。', '根据本轮反馈，补充更多 DPO 演示标注任务，并修正 DPO 详情页字段格式：Alpaca 展示 Instruction/Input/Chosen/Rejected，Role-Based 展示 Messages/Chosen/Rejected。', '根据本轮批注，标注页样本表格的 DPO 列从分组展示改为按格式字段直出，Alpaca 直出 Instruction/Input/Chosen/Rejected，Role-Based 直出 Messages/Chosen/Rejected。', '根据本轮截图，DPO 标注页 Chosen 和 Rejected 输入框悬浮浮现 AI 标注按钮，点击后自动生成内容并回填。', '根据本轮体验优化，创建页提交校验失败时自动定位到第一个未填必填项，减少上下滚动寻找字段。', '根据本轮发布态需求，创建标注任务时仅允许选择已发布的数据集，未发布数据不进入标注数据源。'],
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
      structure: ['生产环境一致的四步横向说明', '搜索与状态筛选区', '任务列表', '创建清洗任务页', '推理结果集同款数据集选择弹窗', '清洗算子配置区', '流程配置区', '清洗详情/清洗日志弹窗'],
      fields: [
        { name: '清洗任务名称', location: '表单/列表', type: '文本', required: '是', description: '清洗任务标识，支持在字段旁悬浮显示编辑入口并行内编辑。' },
        { name: '清洗任务描述', location: '表单/列表/详情', type: '长文本', required: '否', description: '任务级说明，最多 300 字。' },
        { name: '源数据集', location: '表单', type: '只读输入框 + 选择弹窗', required: '是', description: '待清洗数据源，选择弹窗与推理结果集选择方式保持一致。' },
        { name: '清洗字段', location: '创建页', type: '单选下拉', required: '是', description: '根据所选数据集格式回显可清洗字段后单选。' },
        { name: '输出数据集', location: '表单/详情', type: '文本', required: '是', description: '默认在所选数据集版本基础上增加一个版本号，支持编辑。' },
        { name: '任务定时配置', location: '创建页', type: '开关 + 时间配置', required: '否', description: '开启后仅设置定时执行时间，不再展示失败重试次数字段。' },
      ],
      actions: [
        { name: '创建清洗任务', entry: '新建按钮', precondition: '已选择源数据集', successFeedback: '生成清洗任务', errorFeedback: '缺少必填项提示' },
      ],
      states: [
        { name: '已终止', meaning: '任务已停止或已结束且可重新处理', presentation: '状态标签提示已终止', availableActions: '启动、编辑、删除' },
        { name: '启动中', meaning: '任务已开始执行', presentation: '状态标签提示启动中', availableActions: '查看详情' },
        { name: '已完成', meaning: '任务执行完成', presentation: '展示清洗结果', availableActions: '查看输出数据' },
      ],
      interactionNotes: ['创建页需要使用独立路由。', '左侧为算子选择，右侧为流程配置空态或已选算子列表。', '流程配置区不再展示清洗后数据集、流程结果预期和流程摘要卡片。', '列表支持按任务名称搜索和按清洗状态筛选。', '列表分页与生产环境一致默认 20 条/页，行操作展示启动、编辑、删除和更多入口。', '清洗任务详情弹窗拆为清洗详情和清洗日志两个页签；清洗详情按基本信息、清洗结果、算子标签和清洗前后对照表展示。', '创建页提交时如果存在未填写必填项，需要自动滚动并聚焦到首个错误字段，同时提示用户补充必填项。', '当前页以用户迭代需求为基线；生命周期任务支持在列表名称列与描述列分别行内编辑，编辑入口悬浮显示且不受任务状态影响，详情和日志读取更新后的任务对象。'],
      productionComparison: ['本轮按用户要求直接参考生产环境；列表字段、筛选区、四步横向说明和分页规格对齐生产环境当前页面。'],
      userChanges: ['旧截图已删除并回退影响；数据清洗页改以生产环境当前页面为基线。', '根据本轮批注，创建页数据集选择对齐推理结果集选择弹窗，清洗字段改为按数据集格式回显单选，删除数据集名称、流程摘要、清洗后数据集和流程结果预期卡片，并补充定时执行时间配置。', '根据本轮批注，删除失败重试次数字段，清洗任务详情调整为基本信息与清洗结果结构，并保留清洗日志页签。', '根据本轮全局任务需求，清洗任务列表支持名称列与描述列分别行内编辑，编辑入口悬浮显示且不受任务状态影响，保存后详情、日志和资源引用提示同步刷新。', '根据本轮需求，数据清洗可选择 DPO 数据集；DPO Alpaca 回显 Instruction/Input/Chosen/Rejected，DPO Role-Based 回显 Messages/Chosen/Rejected 内容字段。', '根据本轮需求，数据清洗 DPO 演示任务重新生成，示例任务直接覆盖 DPO-Alpaca 偏好对清洗、DPO-Role-Based 客服质检清洗和 DPO-Alpaca 测试集清洗。', '根据本轮发布态需求，创建清洗任务时仅允许选择已发布的数据集，未发布数据不进入清洗数据源。'],
    }),
  },
  {
    match: pathname =>
      pathname === '/finetune/notebooks' ||
      pathname.startsWith('/finetune/notebooks/') ||
      pathname === '/machine-notebook' ||
      pathname.startsWith('/machine-notebook/'),
    doc: createDoc({
      pageName: '在线 Notebook',
      pagePath: 'dynamic',
      module: '模型训练 / 机器学习',
      status: '开发中',
      goal: '提供 Notebook 工作空间入口，并支持以整页形式查看创建配置、资源和端口详情。',
      audience: '算法工程师、研发工程师',
      problem: '减少在训练前后切换外部工具的成本，并让详情信息不再被弹窗截断或遗漏。',
      structure: ['筛选区', '可横向滚动的 Notebook 列表', '上下分区的卡片式创建/编辑页', '带顶部操作区的整页详情', '广场案例卡片', '案例生成中占位卡片', '案例详情页', '发布案例页'],
      fields: [
        { name: 'Notebook 名称', location: '列表/表单', type: '文本', required: '是', description: 'Notebook 主名称，列表支持在字段旁悬浮显示编辑入口并行内编辑。' },
        { name: '描述', location: '列表/表单', type: '长文本', required: '否', description: '补充说明用途，列表支持悬浮编辑入口，点击后当前字段变为输入框。' },
        { name: '状态筛选', location: '我的Notebook状态列表头', type: '多选表头筛选', required: '否', description: '状态表头使用自定义多选筛选面板，展示完整生命周期状态、状态标签和当前数量；不提供“全部”选项，清空筛选即回到默认全量。' },
        { name: '访问权限', location: '列表/创建页/编辑页/详情页', type: '单选枚举', required: '是', description: '创建 Notebook 时默认私有，可切换为公开；私有 Notebook 对其他用户可见，但不可进入详情或执行操作。' },
        { name: '访问权限筛选', location: '我的Notebook访问权限列表头', type: '多选表头筛选', required: '否', description: '访问权限表头使用自定义多选筛选面板，展示私有、公开和当前数量，清空筛选后恢复默认全量。' },
        { name: '创建人筛选', location: '我的Notebook创建人列表头', type: '多选表头筛选', required: '否', description: '从当前 Notebook 列表创建人去重生成选项，支持多选和按创建人数量提示。' },
        { name: 'AI服务', location: '创建页/详情页', type: '二级级联选择', required: '否', description: '一级选择在线推理服务分类，二级从模型服务中的在线推理服务列表选择具体服务；创建后在详情页记录展示。' },
        { name: '数据集', location: '创建页/详情页', type: '下拉选择', required: '否', description: '数据集与模型拆分为两个独立字段；机器学习在线Notebook仅可选择机器学习-数据管理中的数据集。' },
        { name: '大模型', location: '创建页/详情页', type: '下拉选择', required: '否', description: '如果创建时已选择，需要在详情页完整展示；机器学习在线Notebook仅可选择机器学习-模型管理中的模型。' },
        { name: 'Notebook镜像', location: '创建页', type: '按钮触发右侧抽屉选择', required: '是', description: '创建页仅保留“选择镜像”按钮，点击后从右侧展开较窄的镜像面板进行筛选和确认。' },
        { name: '开放端口', location: '创建页/详情页', type: '多行配置', required: '否', description: '支持多个端口；详情页按端口卡片展示，并支持新增、编辑、删除。' },
        { name: '案例名称', location: '发布案例页/案例详情页', type: '文本', required: '是', description: '发布为案例时必填，并作为案例详情页主标题展示；新发布入口不从 Notebook 预填，仅展示输入提示语。' },
        { name: '案例说明', location: '发布案例页/案例详情页', type: '长文本', required: '是', description: '发布为案例时必填，并作为案例详情页正文内容展示；新发布入口不从 Notebook 预填，发布页标签旁展示问号提示，输入框 placeholder 同步展示发布注意事项。' },
        { name: '案例发布状态', location: 'Notebook广场', type: '状态标签', required: '否', description: '发布后先展示生成中状态，后端处理完成后替换为已发布案例并短暂高亮。' },
        { name: 'SSH信息', location: '详情页', type: '只读信息块', required: '否', description: '仅在 Notebook 本身支持 SSH 时展示用户名、SSH Key 和 SSH 命令。' },
        { name: '保存环境', location: '我的Notebook运行中行操作', type: '弹窗表单', required: '否', description: '默认勾选且不可取消“包+依赖库”，可选工作目录并填写镜像名称、镜像描述。' },
        { name: 'SSH配置', location: '列表/详情页', type: '项目级状态', required: '否', description: 'SSH 配置状态来自当前项目，同一个项目下所有 Notebook 保持一致；项目开启后列表统一展示已支持，详情页展示同一份项目 SSH 信息。' },
        { name: '自定义镜像', location: '独立镜像管理页', type: '列表与添加弹窗', required: '否', description: '按生产环境形态展示镜像、描述、状态、任务来源、标签、创建人、创建时间与操作。' },
        { name: '镜像标签', location: '自定义镜像列表', type: '分组单选标签', required: '否', description: '编辑标签时按已配置标签分组展示，每个类型最多选择一种。' },
      ],
      actions: [
        { name: '新建 Notebook', entry: '新建按钮', precondition: '具备资源权限', successFeedback: 'Notebook 加入列表', errorFeedback: '资源不足或校验失败提示' },
        { name: '编辑 Notebook', entry: '已停止/已终止/失败 Notebook 的列表行操作或详情页顶部操作', precondition: 'Notebook 未处于运行中、启动中或排队中，且公开或当前用户为创建人', successFeedback: '进入编辑页回填原创建配置；保存后更新配置并返回详情页，重新启动后生效', errorFeedback: '运行中进入编辑页时提示需先停止；私有且非创建人提示仅创建人可操作' },
        { name: '查看详情', entry: '列表行操作', precondition: 'Notebook 存在，且公开或当前用户为创建人', successFeedback: '进入整页详情并展示创建页填写的全部主要信息', errorFeedback: 'Notebook 不存在或私有且非创建人时给出提示' },
        { name: '更多操作', entry: '列表行三点菜单', precondition: 'Notebook 行已渲染', successFeedback: '仅保留删除操作', errorFeedback: '删除失败时提示' },
        { name: '发布为案例', entry: '我的Notebook列表行操作', precondition: '目标 Notebook 存在，且公开或当前用户为创建人', successFeedback: '提交后停留在 Notebook 广场，先展示生成中占位卡片，生成完成后高亮新案例', errorFeedback: 'Notebook 不存在或私有且非创建人时提示无法发布' },
        { name: '编辑并发布广场案例', entry: 'Notebook广场案例详情', precondition: '当前用户为平台管理员、项目管理员或案例发布者', successFeedback: '点击编辑进入案例发布页，可修改案例名称与案例说明后再次发布', errorFeedback: '无编辑权限时不展示编辑按钮' },
        { name: '保存环境', entry: '运行中 Notebook 行操作', precondition: 'Notebook 状态为运行中', successFeedback: '弹窗确认后生成一条自定义镜像记录', errorFeedback: '镜像名称为空时表单校验提示' },
        { name: '管理自定义镜像', entry: '自定义镜像按钮', precondition: '进入镜像管理页', successFeedback: '支持搜索、刷新、添加镜像、编辑标签、删除和查看日志入口', errorFeedback: '添加镜像字段未填时表单校验提示' },
        { name: '停止 Notebook', entry: '运行中 Notebook 行操作/详情页顶部操作', precondition: 'Notebook 允许终止', successFeedback: '弹窗内询问是否保存当前最新环境；选择是时直接展示保存环境同款字段，保存后停止；选择否则直接停止', errorFeedback: '取消时不变更状态' },
        { name: '编辑镜像标签', entry: '自定义镜像列表操作', precondition: '镜像状态非失败', successFeedback: '按标签类型单选后更新列表标签', errorFeedback: '失败镜像禁用编辑标签' },
      ],
      states: [
        { name: '运行中', meaning: 'Notebook 已启动', presentation: '状态可见', availableActions: '打开、保存环境、停止、查看详情、发布为案例' },
        { name: '已停止', meaning: 'Notebook 未运行', presentation: '状态标签提示停止', availableActions: '启动、编辑、查看详情、发布为案例' },
      ],
      interactionNotes: [
        '创建页按生产环境拆成基本信息、AI服务选择、数据/模型选择、资源配置、选择Notebook镜像、开放端口六段，上下单列排列。',
        'GPU 配置和运行时长都改为开关驱动，创建页不再展示解释性注释。',
        '运行时长改为一个整体配置行，在同一行内完成小时和分钟选择。',
        '列表区默认展示“我的Notebook”，字段对齐当前用户迭代要求：Notebook名称、镜像、SSH配置、状态、访问权限、资源规格、最大运行时长、创建人、创建时间、操作。',
        '训练 Notebook 详情中的“在线推理服务”统一命名为“AI服务”。',
        '镜像字段改为按钮触发的右侧抽屉选择交互，并收窄抽屉宽度，减少对主页面的遮挡。',
        '模型训练在线Notebook与机器学习在线Notebook共用同一套页面结构、列表操作、创建流程、详情布局、自定义镜像、保存环境、停止确认和广场案例交互，仅数据集与模型可选来源按各自业务域区分。',
        'Notebook广场中的案例详情支持按角色控制编辑能力，平台管理员、项目管理员或发布者可编辑后发布更新。',
        '案例详情页只展示案例名称和案例说明；新发布案例页要求用户重新填写案例名称和案例说明，不自动带入 Notebook 名称或描述，编辑案例页才回填已有案例内容。',
        '发布案例页的案例说明字段需提示发布注意事项：严禁包含 .venv、env 等虚拟环境目录，禁止发布包含软链接的文件，额外第三方库应通过 pip install 或 requirements.txt 处理。',
        '发布为案例存在后端异步处理窗口：前端提交成功后不直接跳详情，而是回到 Notebook 广场展示生成中卡片并自动刷新，完成后高亮新案例，减少用户手动刷新成本。',
        'Notebook详情页采用截图中的运行页结构：顶部操作区、左侧基本信息、右侧资源配置、下方开放端口卡片区。',
        'Notebook详情页的 SSH 配置信息移动到资源配置下方的右侧空白区域，减少下方端口区与 SSH 区的割裂感。',
        '详情页顶部的打开/停止/刷新按钮按状态控制可用性：运行中才允许打开，允许终止的状态才允许停止，刷新可推动启动中/排队中进入运行中。',
        'Notebook 不使用通用算力任务的“重新提交”文案，已终止或失败后仍展示“启动”；保存环境仅运行中可见，三点菜单不提供复制 Notebook 和编辑配置。',
        'Notebook 点击停止时先弹出确认弹窗，询问是否保存当前最新环境；选择“是”时在当前弹窗内直接展示包+依赖库、工作目录、镜像名称、镜像描述等保存环境同款字段。',
        'Notebook 停止后可进入编辑页修改原创建配置；保存后配置立即写回，重新启动前可继续反复编辑，重新启动后按最新配置生效。',
        '创建/编辑页提交时如果存在未填写必填项，需要自动滚动并聚焦到首个错误字段，同时提示用户补充必填项。',
        'Notebook广场案例卡片底部操作改为两列等宽按钮，避免在小宽度卡片中按钮突出。',
        '自定义镜像入口从占位提示改为独立管理页，整体参考生产环境：列表搜索、刷新、添加镜像弹窗以及操作列。',
        '自定义镜像编辑标签弹窗按 test、框架、python版本、测试等标签类型分组，每个分组只允许选择一种标签。',
        'AI服务选择从页面静态选项调整为读取模型服务中的在线推理服务列表，测试失败的服务可见但不可选。',
        '当前页以用户迭代需求为基线。旧结构：Notebook 创建不区分访问权限，列表行默认都可操作；新结构：创建/编辑页新增公开/私有选择，私有 Notebook 对其他用户仍展示在列表中，但行操作置为不可操作，直接进入详情、编辑或发布页时也会拦截。',
        '根据用户最新要求，在线Notebook创建页访问权限默认选中私有，选项顺序调整为私有在前、公开在后。',
        'Notebook 列表名称列和描述列统一接入字段级行内编辑，编辑入口仅在鼠标悬浮对应字段时展示，且不受 Notebook 运行状态影响。',
        '我的Notebook筛选从顶部三下拉调整为列表字段表头筛选：状态、访问权限、创建人分别在对应列表头使用自定义多选筛选面板；筛选面板仅保留标题、选项和清空/应用操作，不展示说明文案和选项搜索框；筛选项不包含“全部”，通过“清空”恢复默认全量；顶部保留名称搜索，重置会清空名称搜索和表头筛选；Notebook广场仍只保留名称搜索。',
        'SSH 配置调整为项目级状态：同一个项目内所有 Notebook 的 SSH 配置列保持一致，新建 Notebook 自动继承当前项目 SSH 配置，详情页读取同一份项目 SSH 信息。',
      ],
      productionComparison: ['本轮按用户明确要求直接查看生产环境在线Notebook，当前列表、创建页分段、广场卡片和主要操作文案按生产环境对齐。'],
      userChanges: [
        '根据用户最新迭代，创建页新增开放端口多行配置，并在详情页展示。',
        '根据用户最新评论，创建页删除 SSH 配置区，仅在详情页按实际能力展示 SSH 信息。',
        '根据用户最新迭代，数据集与模型拆成两个独立下拉字段，并在详情页展示。',
        '根据用户最新评论，AI 服务改成二级展示，镜像改为右侧展开的选择面板。',
        '根据用户最新批注，Notebook 创建/编辑页的添加镜像操作在确认后必须回显当前镜像信息，并补充系统镜像、自定义镜像、CPU/GPU/NPU 等多组可选数据。',
        '根据用户最新评论，运行时长改成小时与分钟的一体化配置；镜像卡片仅展示已确认选择的当前镜像摘要。',
        '根据用户最新评论，机器学习在线Notebook的页面结构、交互和详情样式与模型训练在线Notebook保持一致，仅数据集和模型来源切换为机器学习模块的数据管理与模型管理。',
        '根据本轮要求，两个在线Notebook继续保持一致：机器学习侧补齐模型训练侧已有的自定义镜像、保存环境、停止前保存环境、创建人列、启动/停止操作分流和广场案例交互，仅保留数据集与模型选项来源差异。',
        '根据用户最新评论，模型训练和机器学习在线Notebook的Notebook广场案例详情增加编辑/发布流程，并按平台管理员、项目管理员或发布者控制可见性。',
        '根据用户最新评论，模型训练和机器学习在线Notebook详情页改为运行页布局，开放端口模块支持多个端口的新增、编辑、删除。',
        '根据用户最新要求，发布为案例后停留在 Notebook 广场，通过生成中占位卡片和自动刷新承接后端异步处理时间。',
        '根据本轮要求，在线Notebook再次对齐生产环境：我的Notebook排在第一位，列表补创建人列，运行中操作展示打开/保存环境/停止，创建页按生产环境顺序重排。',
        '根据本轮批注，Notebook 行操作移除重新提交、复制 Notebook 和编辑配置；运行中行补充查看详情与发布为案例，并限定只有运行中展示保存环境。',
        '根据本轮批注，保存环境改为弹窗表单并生成自定义镜像记录；自定义镜像入口改为独立镜像管理页。',
        '根据本轮批注，详情页 SSH 配置信息移动到资源配置下方，Notebook 广场案例卡片按钮改为不外凸的等宽布局。',
        '根据本轮批注，Notebook 停止前增加是否保存最新环境弹窗；自定义镜像编辑标签改为按标签类型单选。',
        '根据本轮要求，大模型和机器学习 Notebook 创建页新增可选择模型服务在线推理服务的 AI 服务选择，并在 Notebook 详情页展示创建时选中的 AI 服务。',
        '根据本轮需求，Notebook 停止后可编辑原创建配置，保存后未再次启动前仍可反复编辑；大模型和机器学习 Notebook 行为保持一致。',
        '根据用户最新需求，在线Notebook创建时新增访问权限，可选择公开或私有；私有 Notebook 对其他用户可见但无法进入或执行启动、停止、编辑、删除、发布等操作。',
        '根据用户最新要求，在线Notebook创建时访问权限默认私有，并将公开/私有的位置调整为私有/公开。',
        '根据本轮全局编辑反馈，大模型和机器学习 Notebook 列表补齐名称与描述字段级行内编辑，统一采用悬浮显示编辑按钮、点击后原字段变输入框的样式。',
        '根据本轮需求，在线Notebook列表筛选调整为表头多选筛选，状态、访问权限、创建人不再单独占用顶部筛选区；筛选面板补齐完整状态、数量提示和清空操作，但不提供“全部”作为筛选项，并同步覆盖模型训练和机器学习两个 Notebook 页面。',
        '根据用户最新要求，表头筛选支持多选；列表字段顺序调整为创建人位于创建时间之前。',
        '根据用户最新反馈，Notebook 的 SSH 配置不再按单条 Notebook 展示差异，而是按当前项目统一展示并同步覆盖模型训练和机器学习在线 Notebook。',
      ],
    }),
  },
  {
    match: pathname => pathname === '/training' || pathname === '/training/create' || pathname.startsWith('/training/detail'),
    doc: createDoc({
      pageName: '大模型训练',
      pagePath: '/training',
      module: '模型训练',
      status: '已基于需求演进',
      goal: '承载大模型训练主链路，包括列表、创建、详情与版本追踪。',
      audience: '算法工程师、平台管理员',
      problem: '统一管理训练任务全生命周期。',
      structure: ['训练任务列表', '创建任务表单', '任务详情', '版本详情'],
      fields: [
        { name: '任务名称', location: '列表/表单', type: '文本', required: '是', description: '训练任务唯一标识，列表支持在字段旁悬浮显示编辑入口并行内编辑。' },
        { name: '训练类型', location: '创建表单', type: '枚举', required: '是', description: '决定训练方案与参数组。' },
        { name: '基础模型版本', location: '创建表单/模型配置', type: '弹窗选择', required: '是', description: '创建页只展示选择入口和已选摘要；弹窗内先选模型提供商，再展示该提供商模型。Qwen 本期标记已适配，未下载时提示联系管理员；其它仓库模型可选并标记未适配。' },
        { name: '训练加速配置', location: '创建表单/训练配置/版本详情任务基本信息', type: '开关 + 单选策略', required: '否', description: '基于 DeepSpeed ZeRO 显存优化策略，默认关闭；开启后以 Radio 单选形式展示 ZeRO-0、ZeRO-2、ZeRO-3，每个类型保留短说明和悬浮注释；版本详情需同步展示该版本实际配置。' },
        { name: '资源配置', location: '创建表单/版本详情', type: '复合配置', required: '是', description: '显卡类型及型号、显卡卡数配置、CPU请求、CPU限制、内存请求、内存限制等资源参数，详情页展示口径需与创建页保持一致。' },
      ],
      actions: [
        { name: '创建训练任务', entry: '创建页', precondition: '表单必填项完整', successFeedback: '生成训练任务并返回列表/详情', errorFeedback: '表单校验或资源配置错误提示' },
        { name: '查看任务详情', entry: '列表项', precondition: '任务存在', successFeedback: '进入详情页', errorFeedback: '提示任务不可访问' },
      ],
      states: [
        { name: '用户迭代基线', meaning: '当前页以用户本轮明确需求为实现基线', presentation: '创建页模型配置按模型仓库全量展示并区分可选状态', availableActions: '按本轮需求持续迭代' },
        { name: '运行态', meaning: '训练任务已启动', presentation: '展示训练状态与版本记录', availableActions: '查看详情、版本' },
      ],
      interactionNotes: ['当前页以用户迭代需求为基线。', '旧结构：基础模型创建页按固定 Qwen 系列筛选模型版本并直铺在创建页；新结构：基础模型选择改为弹窗，弹窗左侧先选模型提供商，右侧展示该提供商下匹配当前训练类型的模型。', '本期以 Qwen 作为已适配模型示例，已下载模型可选，未下载模型展示“未下载，请联系管理员”；模型仓库新增的其它提供商模型也允许选择，但标记为“未适配”。', '弹窗标题行不展示“已适配/未适配”状态图例，适配状态仅保留在具体模型卡片上。', '训练配置新增 DeepSpeed 训练加速配置，默认关闭；开启开关后以 Radio 单选形式展示 ZeRO-0、ZeRO-2、ZeRO-3，界面不展示内部配置文件路径。', '训练加速配置标题悬浮说明需要保持精简，只说明 DeepSpeed 用于提升训练效率和优化显存占用。', '训练加速配置采用紧凑单选排版，不使用按钮组或大卡片；每个 ZeRO 类型展示短说明，并通过问号悬浮提示查看详细注释。', '训练加速配置开关旁不展示额外说明文字，避免创建页信息过密。', '训练加速配置展示在微调类型上方；微调类型下方紧跟参数配置 Tabs，避免把微调类型和参数配置拆散。', 'ZeRO-0/2/3 选项必须提供悬浮说明：ZeRO-0 是普通 DDP 基线，ZeRO-2 切分优化器状态和梯度，ZeRO-3 切分优化器状态、梯度和参数。', '版本详情的任务基本信息需展示当前版本训练加速配置，缺省或关闭展示“未开启”，开启时展示 ZeRO-0、ZeRO-2 或 ZeRO-3。', '版本详情的显卡资源配置不再拆成显卡类型、型号、内存、张数，而是与创建页字段保持一致：显卡类型及型号、显卡卡数配置、CPU请求、CPU限制、内存请求、内存限制。', '训练任务详情页的任务版本表格设置明确列宽与横向滚动，小屏下可右滑查看创建时间后的操作列。', '创建图像理解训练任务时，训练数据集选择弹窗提供 SFT、DPO、RFT 场景下可演示的图像理解训练数据。', '创建页提交时如果存在未填写必填项，需要自动滚动并聚焦到首个错误字段，同时提示用户补充必填项。', '根据本轮批注，图像理解 SFT 数据集选择弹窗的格式筛选不展示 PROMPT_RESPONSE，只展示 ROLE_BASED。', '训练任务从 mockTasks 直读改为共享本地 store；列表仅保留任务名称行内编辑，任务描述不再作为训练列表和任务信息字段展示。'],
      productionComparison: ['本轮未参考生产环境，按用户新增需求在当前仓库基线上迭代。'],
      userChanges: ['根据本轮需求，大模型训练创建页的基础模型选择改为展示模型仓库所有匹配训练类型的模型；Qwen 作为本期已适配示例，已下载可选，未下载提示联系管理员；其它提供商模型也可选择并标记未适配。', '根据本轮调整，基础模型选择改成弹窗：先选模型提供商，再选具体模型，避免在创建页直铺大量模型。', '根据本轮需求，大模型训练版本详情中的显卡资源配置字段与创建页所选字段保持一致，并展示 CPU/内存请求与限制。', '根据用户截图反馈，修复训练任务详情小屏下任务版本表格无法右滑、右侧操作列不可见的问题。', '根据本轮演示需求，补充创建图像理解训练任务时可选择的多模态训练数据集。', '根据本轮批注，图像理解 SFT 数据集格式收敛为 ROLE_BASED，避免在创建训练任务时出现 PROMPT_RESPONSE。', '根据本轮全局任务需求，大模型训练任务补任务级描述并支持名称/描述行内编辑，版本级 taskDescription 保持原语义。', '根据本轮上传的 DeepSpeed 配置文档，创建页新增训练加速配置，可选不开启、ZeRO-0、ZeRO-2、ZeRO-3，并为各策略提供悬浮注释。', '根据本轮反馈，训练加速配置改为微调类型上方的开关控制项，打开后展开 ZeRO-0/2/3，微调类型下方继续紧跟参数配置。', '根据本轮批注，精简训练加速配置 tooltip，并修复开关关闭态下无法开启的问题。', '根据本轮批注，训练加速配置改为紧凑一行排版，开启后仅展示 ZeRO 策略按钮，详细说明通过悬浮提示查看。', '根据本轮反馈，ZeRO 策略选择从按钮组调整为 Radio 单选项，每个类型保留短说明和问号悬浮注释。', '根据本轮批注，删除训练加速配置开关旁的“启用 DeepSpeed”文字。', '根据本轮需求，版本详情页的任务基本信息同步展示创建页训练加速配置，缺省为未开启，开启时展示对应 ZeRO 策略。', '根据本轮截图反馈，大模型训练列表和任务信息删除任务描述字段，仅保留训练任务名称、训练类型、版本数量、创建时间和操作等核心列。'],
    }),
  },
  {
    match: pathname => pathname === '/model',
    doc: createDoc({
      pageName: '我的模型',
      pagePath: '/model',
      module: '模型训练',
      status: '开发中',
      goal: '管理训练产出的模型资产及其来源、版本和可用状态。',
      audience: '算法工程师、模型管理员',
      problem: '让模型资产在训练、部署、评估之间可复用。',
      structure: ['搜索与过滤', '模型列表', '新建/导入模型弹窗', '模型详情'],
      fields: [
        { name: '模型名称', location: '列表/表单', type: '文本', required: '是', description: '模型资产名称，列表支持在字段旁悬浮显示编辑入口并行内编辑。' },
        { name: '模型描述', location: '列表', type: '长文本', required: '否', description: '模型资产补充说明，编辑入口悬浮显示且不受状态影响。' },
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
      interactionNotes: ['模型来源和关联基础模型是页面关键。', '该页已接入统一任务状态流转规则，动作显隐由状态控制。', '模型列表名称列和描述列统一接入字段级行内编辑，编辑入口仅在鼠标悬浮对应字段时展示，点击后当前字段变为输入框。'],
      productionComparison: ['保持与生产环境模型管理能力一致。'],
      userChanges: ['根据本轮需求，被推理、部署或训练任务引用的模型暂不允许删除；任务完成、失败或终止不释放引用，必须删除相关任务或停止引用链后才可删除。', '根据本轮全局编辑反馈，大模型模型管理列表补齐模型名称与模型描述字段级行内编辑。'],
    }),
  },
  {
    match: pathname => pathname === '/effect-evaluation' || pathname === '/effect-evaluation/create' || pathname.startsWith('/effect-evaluation/report/'),
    doc: createDoc({
      pageName: '效果评估',
      pagePath: '/effect-evaluation',
      module: '模型评估',
      status: '开发中',
      goal: '配置与执行效果评估任务，对模型在文本生成和图像理解场景下的效果进行自动化评价。',
      audience: '算法工程师、评测工程师、产品经理',
      problem: '将评估数据准备、模型推理结果生成与评估指标计算串成可复用的评测流程。',
      structure: ['自动/基准/人工评估顶层切换', '三段说明卡', '文本生成/图像理解子标签', '任务列表', '创建评估任务页', '推理结果集选择弹窗', '独立报告页（按模式与状态分支展示）'],
      fields: [
        { name: '任务名称', location: '列表/创建页', type: '文本', required: '是', description: '评估任务主标识，列表支持在字段旁悬浮显示编辑入口并行内编辑。' },
        { name: '任务描述', location: '列表/创建页/详情', type: '长文本', required: '否', description: '评估任务补充说明，最多 300 字。' },
        { name: '评估类别', location: '创建页', type: '单选', required: '是', description: '文本生成或图像理解。' },
        { name: '评估数据来源', location: '创建页', type: '单选', required: '是', description: '已有推理结果集或新建推理结果集。' },
        { name: '推理结果集', location: '列表/创建页/报告', type: '只读输入框 + 选择弹窗', required: '是', description: '自动评估和人工评估从已有推理结果集中选择，弹窗支持按数据格式筛选、搜索和单选确认；推理结果集改名后引用展示同步刷新。' },
        { name: '待推理数据', location: '创建页新建推理结果集分支', type: '只读输入框 + 数据集选择弹窗', required: '是', description: '自动评估和人工评估选择新建推理结果集时，复用推理结果集创建页的数据选择交互；训练/验证数据集仅展示 SFT，DPO/RFT 数据不展示，测试数据集保留可选。' },
        { name: '待评估模型', location: '列表/创建页', type: '只读自动带出', required: '是', description: '跟随所选推理结果集自动回填其来源模型或服务。' },
        { name: '基准评估榜单', location: '基准评估页签', type: '聚合榜单', required: '否', description: '基于已完成的基准评估任务，按模型聚合平均分和各评估数据集得分。' },
        { name: '基准评估报告结果', location: '基准评估报告页', type: '图表 + 明细表', required: '否', description: '按生产环境结构展示评分维度雷达图、评分数据明细和评分对比柱状图，明细表每个基准评估数据集支持下载模型结果 JSON。' },
      ],
      actions: [
        { name: '创建评估任务', entry: '创建评估任务按钮', precondition: '已选择数据来源和评估方法', successFeedback: '任务进入列表', errorFeedback: '缺失依赖项时提示' },
        { name: '增加指标', entry: '创建页评估指标区', precondition: '进入创建页', successFeedback: '指标加入当前任务配置', errorFeedback: '未选择指标时提示' },
        { name: '启动/重新提交/终止', entry: '列表行操作', precondition: '状态满足统一任务流转规则', successFeedback: '状态切换并刷新进度', errorFeedback: '启动中任务终止时提示“正在启动中任务不支持终止”' },
      ],
      states: [
        { name: '已创建', meaning: '任务创建完成但尚未启动', presentation: '显示已创建标签', availableActions: '启动、编辑、删除、查看详情' },
        { name: '启动中/排队中/运行中', meaning: '任务正在调度或执行', presentation: '显示处理中状态与进度条', availableActions: '查看详情；排队中和运行中允许终止' },
        { name: '已完成', meaning: '评估已完成', presentation: '进度100%，结果可查看', availableActions: '查看详情、删除' },
        { name: '失败/已终止', meaning: '任务执行失败或人工终止', presentation: '显示失败或已终止标签', availableActions: '重新提交、查看详情、删除' },
      ],
      interactionNotes: ['效果评估需要区分自动评估、基准评估和人工评估三种模式。', '列表支持按模式、数据类别和任务名称共同过滤。', '自动评估、基准评估、人工评估三种创建页表单不能共用同一套内容，需按模式切换字段。', '基准评估页签中需要额外展示榜单和雷达图；榜单只统计已完成的基准评估任务，缺失评估数据集得分显示为 -。', '基准评估雷达图在悬浮某个点位时，需要展示当前维度下各对比模型的具体分值。', '自动评估创建页中的表单项会随评估模式和评估方法变化。', '自动评估与人工评估创建页中，已有推理结果集从下拉选择改为数据管理同款弹窗选择：左侧按数据格式筛选，右侧表格搜索、单选并确认。', '自动评估与人工评估选择“新建推理结果集”时，待推理数据选择必须复用推理结果集创建页同款数据集选择弹窗，筛选项、提示文案、DPO/RFT 过滤规则和测试数据集保留规则保持一致。', '新建推理结果集分支不使用普通 Select 下拉选择数据集，而是使用只读输入框 + 选择按钮，确认后回填“数据集名称>版本”。', '已有推理结果集弹窗必须跟随创建表单当前“评估类别”过滤，不依赖 URL 初始参数；切换评估类别时清空已选推理结果集和待评估模型。', '图像理解评估只允许选择 ROLE_BASED 格式的推理结果集，弹窗不展示 PROMPT_RESPONSE。', '选择已有推理结果集后，创建页新增“待评估模型”字段，并自动带出该推理结果集的来源模型/服务；弹窗表格也同步展示待评估模型列。', '当前页面内置了一批文本生成和图像理解的演示任务数据，便于直接查看基准评估榜单、雷达图和人工评估列表效果。', '报告页不再使用一个通用详情弹窗，而是改为独立报告路由。', '不同状态的报告内容需要分支处理：未完成任务优先展示基本信息和“任务尚未完成”的提示；已完成任务才展示完整报告内容。', '自动评估、基准评估、人工评估的报告结构不同，其中自动评估优先对齐“评估报告/评估详情/任务日志”，基准评估优先对齐“评估报告/任务日志”。', '自动评估、基准评估、人工评估报告中的评分对比统一使用竖版柱状图，不再使用横向进度条。', '基准评估详情页按生产环境收敛为基本信息 + 报告结果，报告结果包含评分维度雷达图、评分数据明细和评分对比柱状图，不再在报告详情中展示榜单定位和多模型对比模块。', '基准评估评分数据明细的第三列为操作列，每个基准评估数据集均提供下载模型结果 JSON 文档入口。', '人工评估的去评估页不是普通报告表，而是独立的人工标注页，需要展示总任务数、已完成、未评估统计卡，以及可直接录入分数和评语的任务表。', '人工评估报告需要突出“评审进展、评分分布、评审状态和人工亮点说明”。', '任务日志不应展示摘要卡片，而应以代码日志视图呈现任务从创建、调度、执行到完成/失败/终止的全过程。', '创建页提交时如果存在未填写必填项，需要自动滚动并聚焦到首个错误字段，同时提示用户补充必填项。', '当前页以用户迭代需求为基线；评估任务列表支持名称列与描述列分别行内编辑，编辑入口悬浮显示且不受任务状态影响，报告基本信息、详情弹窗和任务日志读取更新后的任务对象。'],
      productionComparison: ['以当前生产环境效果评估页为基线。'],
      userChanges: ['为方便验收当前页面效果，补充了基准评估与人工评估的演示数据，覆盖文本生成与图像理解两类场景。', '根据最新需求，基准评估雷达图补充悬浮分值展示，详情弹窗同步增强结果摘要与亮点说明。', '根据本轮批注，自动评估、基准评估、人工评估报告的评分对比统一改为竖版柱状图。', '根据本轮需求，评估创建页的已有推理结果集选择改为数据管理同款弹窗，并新增待评估模型字段自动回填。', '根据本轮批注，已有推理结果集弹窗改为按表单当前评估类别实时过滤，图像理解仅展示 ROLE_BASED，并在弹窗中补充待评估模型列。', '根据本轮批注，基准评估详情页重新按生产环境调整为基本信息、报告结果、任务日志结构，报告结果内展示雷达图、数据明细和竖版柱状图。', '根据本轮批注，基准评估评分数据明细的“当前任务”列改为“操作”列，每行支持下载该基准数据集对应的模型运行结果 JSON。', '根据本轮演示需求，自动评估补充多条已完成文本生成任务，覆盖单个评估和对比评估，并在报告基本信息中按任务显示评估类型。', '根据本轮全局任务需求，自动/基准/人工评估任务支持名称列与描述列分别行内编辑，编辑入口悬浮显示且不受任务状态影响，推理结果集改名后评估引用展示同步刷新。', '根据本轮需求，自动评估和人工评估在“新建推理结果集”时统一复用推理结果集创建页的数据选择弹窗，训练/验证数据过滤 DPO/RFT，测试数据集保持可选。'],
    }),
  },
  {
    match: pathname => pathname === '/evaluation-indicator',
    doc: createDoc({
      pageName: '评估指标',
      pagePath: '/evaluation-indicator',
      module: '模型评估',
      status: '开发中',
      goal: '管理评估指标库，支持区分自定义指标与基础指标。',
      audience: '算法工程师、评测工程师',
      problem: '让可复用的指标配置集中管理，并在效果评估任务中被引用。',
      structure: ['自定义指标/基础指标页签', '搜索区', '列表区', '新建/编辑指标弹窗', '指标详情弹窗'],
      fields: [
        { name: '评估指标', location: '列表/表单', type: '文本', required: '是', description: '指标名称。' },
        { name: '指标说明', location: '列表/表单', type: '长文本', required: '是', description: '指标用途和判定说明。' },
        { name: '指标分值范围', location: '列表/表单', type: '文本', required: '是', description: '如 0-10分、1-5分。' },
      ],
      actions: [
        { name: '新建指标', entry: '新建指标按钮', precondition: '处于自定义指标页签', successFeedback: '指标加入列表', errorFeedback: '必填项缺失提示' },
        { name: '查看详情', entry: '基础指标列表操作', precondition: '目标指标存在', successFeedback: '打开详情弹窗', errorFeedback: '提示指标不存在' },
        { name: '编辑/删除', entry: '自定义指标列表操作', precondition: '非系统内置指标', successFeedback: '更新或删除成功', errorFeedback: '内置指标不展示该操作' },
      ],
      states: [
        { name: '基础指标', meaning: '系统内置指标，只读', presentation: '仅展示查看详情操作', availableActions: '查看详情' },
        { name: '自定义指标', meaning: '用户创建的指标', presentation: '展示编辑和删除操作', availableActions: '编辑、删除' },
      ],
      interactionNotes: ['基础指标和自定义指标在操作权限上不同。'],
      productionComparison: ['以当前生产环境评估指标页为基线。'],
      userChanges: [],
    }),
  },
  {
    match: pathname => pathname === '/service/inference/hosted',
    doc: createDoc({
      pageName: '大模型部署',
      pagePath: '/service/inference/hosted',
      module: '模型服务',
      status: '开发中',
      goal: '管理大模型部署任务，统一追踪资源、模型来源和部署状态。',
      audience: '算法工程师、平台管理员',
      problem: '让部署流程标准化并和模型资产打通。',
      structure: ['部署列表', '创建部署页', '详情查看区'],
      fields: [
        { name: '服务名称', location: '列表/创建页', type: '文本', required: '是', description: '部署服务名称，列表支持在字段旁悬浮显示编辑入口并行内编辑。' },
        { name: '服务描述', location: '列表/创建页/详情', type: '长文本', required: '否', description: '部署任务级说明，最多 300 字。' },
        { name: '模型来源', location: '创建页', type: '枚举', required: '是', description: '来源于模型管理或基础模型。' },
        { name: '资源配置', location: '创建页', type: '复合字段', required: '是', description: 'CPU、内存、显卡等部署资源。' },
      ],
      actions: [
        { name: '新建部署', entry: '创建按钮', precondition: '已选模型和资源配置', successFeedback: '部署加入列表', errorFeedback: '配置缺失提示' },
        { name: '启动/重新提交/终止', entry: '列表行操作', precondition: '状态满足统一任务流转规则', successFeedback: '状态切换', errorFeedback: '启动中任务终止时提示“正在启动中任务不支持终止”' },
      ],
      states: [
        { name: '已创建/启动中/运行中/失败/已终止', meaning: '沿用统一任务生命周期', presentation: '展示状态标签', availableActions: '按统一任务规则执行操作' },
      ],
      interactionNotes: ['大模型部署页已接入统一任务状态流转规则。', '创建页提交时如果存在未填写必填项，需要自动滚动并聚焦到首个错误字段，同时提示用户补充必填项。', '当前页以用户迭代需求为基线；部署任务支持在列表名称列与描述列分别行内编辑，编辑入口悬浮显示且不受任务状态影响，详情读取更新后的任务对象。'],
      productionComparison: ['与生产环境大模型部署页对齐。'],
      userChanges: ['根据本轮全局任务需求，大模型部署任务支持名称列与描述列分别行内编辑，编辑入口悬浮显示且不受任务状态影响，保存后列表和详情同步刷新。'],
    }),
  },
  {
    match: pathname => pathname === '/service/inference/external' || pathname.startsWith('/service/inference/external/'),
    doc: createDoc({
      pageName: '在线推理服务',
      pagePath: '/service/inference/external',
      module: '模型服务',
      status: '开发中',
      goal: '管理在线推理服务接入与连接测试状态。',
      audience: '平台管理员、算法工程师',
      problem: '统一管理服务名称、连接状态、模型类型及基础接入信息。',
      structure: ['搜索筛选区', '服务列表', '新建服务弹窗', '详情弹窗', '支持从 Agent助手配置跳转的新建服务路由'],
      fields: [
        { name: '服务名称', location: '列表/创建页', type: '文本', required: '是', description: '在线推理服务名称，列表支持在字段旁悬浮显示编辑入口并行内编辑。' },
        { name: '连接状态', location: '列表', type: '状态标签', required: '否', description: '测试通过或测试失败。' },
        { name: '描述', location: '列表/创建页', type: '文本', required: '否', description: '服务补充描述，编辑入口悬浮显示且不受连接状态影响。' },
        { name: '模型类型', location: '列表/创建页', type: '枚举', required: '是', description: '文本生成、图像理解或混合类型。' },
      ],
      actions: [
        { name: '搜索/重置', entry: '筛选区', precondition: '进入列表页', successFeedback: '列表按条件过滤或恢复', errorFeedback: '无匹配项显示空态' },
        { name: '新建服务', entry: '新建服务按钮', precondition: '具备创建权限', successFeedback: '服务加入列表', errorFeedback: '表单校验提示' },
        { name: '查看详情/编辑/连接测试', entry: '列表行操作', precondition: '服务存在', successFeedback: '打开详情、编辑表单或更新连接状态', errorFeedback: '目标服务不存在时提示' },
      ],
      states: [
        { name: '测试通过', meaning: '连接测试成功', presentation: '绿色状态标签', availableActions: '查看详情、编辑、再次连接测试' },
        { name: '测试失败', meaning: '连接测试失败', presentation: '红色状态标签', availableActions: '查看详情、编辑、重新连接测试' },
      ],
      interactionNotes: ['在线推理服务与大模型部署是两类不同服务，不再共用同一份设计文档。', '新增 /service/inference/external/create 路由，用于从系统配置 Agent助手中跳转创建对话模型服务；创建或取消后按 redirect 参数返回来源页。', '新建或编辑服务提交时如果存在未填写必填项，需要自动滚动并聚焦到首个错误字段，同时提示用户补充必填项。', '在线推理服务列表名称列和描述列统一接入字段级行内编辑，编辑入口仅在鼠标悬浮对应字段时展示，点击后当前字段变为输入框。'],
      productionComparison: ['以当前生产环境在线推理服务列表页为基线。'],
      userChanges: ['根据本轮需求，在线推理服务可作为文档中心 Agent 的对话模型来源，并支持从 Agent 配置页跳转新建后返回。', '根据本轮需求，在线推理服务补齐删除操作；若被推理或标注任务引用则暂不允许删除，任务完成不释放引用，必须删除任务或停止引用链。', '根据本轮全局编辑反馈，在线推理服务名称和描述补齐悬浮行内编辑，且不受连接状态影响。'],
    }),
  },
  {
    match: pathname => pathname === '/machine-data-management' || pathname.startsWith('/machine-data-management/'),
    doc: createDoc({
      pageName: '数据管理',
      pagePath: '/machine-data-management',
      module: '机器学习',
      status: '已基于需求演进',
      goal: '管理和创建用于机器学习任务的数据集，确保数据类型、标注类型、模板和版本信息可追踪。',
      audience: '机器学习工程师、平台管理员',
      problem: '创建数据集时需要明确版本起点和数据类型范围，避免后续新增版本与标注配置缺少上下文。',
      structure: ['数据集列表', '筛选与搜索区', '创建数据集独立页面', '生产环境同款整页详情', '左侧版本列表', '基本信息卡', '数据详情表'],
      fields: [
        { name: '数据集名称', location: '创建页/列表/详情', type: '文本', required: '是', description: '机器学习数据集主名称。' },
        { name: '版本', location: '创建页/列表/详情', type: '只读版本号', required: '是', description: '创建数据集时默认展示 V1；后续新增版本在当前版本基础上递增。' },
        { name: '数据类型', location: '创建页/列表/详情', type: '单选', required: '是', description: '当前仅支持文本和图片，按用户要求不提供音频类型。' },
        { name: '标注类型', location: '创建页/列表/详情', type: '联动单选', required: '是', description: '根据已选数据类型回显可用标注类型。' },
        { name: '标注模板', location: '创建页/列表/详情', type: '联动单选', required: '是', description: '根据标注类型提供对应模板。' },
        { name: '数据标注状态', location: '创建页/详情', type: '单选', required: '是', description: '与生产创建页一致，记录无标注信息或有标注信息。' },
        { name: '数据来源', location: '创建页/详情', type: '单选', required: '是', description: '支持本地上传和 Notebook 获取。' },
        { name: '来源版本', location: '合并版本数据详情表', type: '只读标签', required: '否', description: '当机器学习数据版本由多个历史版本合并生成时，数据详情表展示原始来源版本。' },
      ],
      actions: [
        { name: '创建数据集', entry: '创建数据集按钮进入独立创建页', precondition: '填写名称、选择数据类型、标注类型和标注模板', successFeedback: '新增数据集插入列表顶部，版本为 V1', errorFeedback: '必填项缺失时展示表单校验提示' },
        { name: '查看详情', entry: '列表行操作', precondition: '数据集存在', successFeedback: '进入整页详情，左侧展示版本，右侧展示基本信息和数据详情', errorFeedback: '记录不存在时展示空状态' },
        { name: '新增版本', entry: '详情页左侧版本区新增版本按钮', precondition: '数据集存在', successFeedback: '提交后生成递增版本并自动切换到新版本，基本信息与数据详情同步刷新', errorFeedback: '表单校验失败时停留在弹窗' },
        { name: '合并版本', entry: '详情页左侧版本区合并版本按钮', precondition: '同一机器学习数据集内至少存在 2 个处理完成版本', successFeedback: '提交后生成递增版本并自动切换到新版本，明细保留来源版本', errorFeedback: '版本不足或提交异常时提示' },
        { name: '删除单条数据', entry: '详情页数据详情表操作列', precondition: '当前版本存在该条数据', successFeedback: '二次确认后删除该条数据', errorFeedback: '取消确认时不做修改' },
        { name: '删除数据集', entry: '列表行操作', precondition: '数据集存在', successFeedback: '二次确认后从列表移除', errorFeedback: '取消确认时不做修改' },
      ],
      states: [
        { name: 'V1', meaning: '新建数据集的初始版本', presentation: '创建页只读字段和列表最新版本列', availableActions: '查看详情、后续新增版本' },
      ],
      interactionNotes: [
        '当前页以生产环境核对结果和用户迭代需求共同为基线，冲突时以用户明确要求为准。',
        '创建数据集从弹窗调整为独立页面，字段布局对齐生产环境。',
        '数据集详情从弹窗调整为生产环境同款整页结构：顶部返回/导出/删除，左侧版本区，右侧基本信息和数据详情。',
        '基本信息卡从 AntD Descriptions 灰底块状展示改为两列标签-值信息网格，字段名轻量灰色、字段值正常文本，标签字段使用可换行 Tag 组。',
        '新增版本已形成本地闭环：版本号自动按当前最大版本递增，提交后写入版本数组、刷新创建人/创建时间/描述/样本明细，并默认选中新版本。',
        '图片类数据详情按图片/标签展示，文本类数据详情按文本内容/标签展示；详情表操作列保留删除单条数据。',
        '创建数据集补齐版本字段，默认 V1 且不需要用户手动输入。',
        '数据类型移除音频，仅保留文本和图片。',
        '创建页提交时如果存在未填写必填项，需要自动滚动并聚焦到首个错误字段，同时提示用户补充必填项。',
        '本地上传数据需展示进度，上传中可取消，失败或取消后可继续上传并保留断点进度；文件大小不设前端限制。',
        '版本合并与新增版本放在同一版本操作区域；机器学习数据管理当前为本地 state 闭环，处理完成版本均可合并，未发布概念不阻断合并。',
        '版本侧栏操作区将新增版本和合并版本融合为同一组按钮，合并按钮在可合并版本不足 2 个时置灰。',
        '新建与新增版本默认未发布；未发布版本可删除单条数据并发布，发布后数据明细锁定，且才允许被机器学习数据标注选择。',
        '合并生成的新版本作为最新版本展示，源版本保持不变，重复样本全部保留；前端数据详情只展示来源版本列，不展示样本名，样本重名处理属于后端保存逻辑。',
      ],
      productionComparison: ['本轮已重新核对生产环境：列表字段为数据集名称、最新版本、数据类型、标注类型、标注模板、操作；创建为独立页面。'],
      userChanges: ['保留用户明确要求：创建数据集补版本字段，默认 V1；数据类型移除音频，并将文本排序在图片前。', '根据本轮需求，被在线标注任务引用的机器学习数据集暂不允许删除；任务完成不释放引用，必须删除任务或停止引用链。', '根据本轮需求，机器学习数据集补充创建人字段，并限制仅创建人本人、项目管理员或租户管理员可删除。', '根据本轮要求重新参考生产环境，机器学习数据管理详情改为整页版本侧栏 + 基本信息 + 数据详情表结构，并支持删除详情表中的单条数据。', '根据本轮计划，基本信息样式改为生产环境式标签-值网格，新增版本从占位提示改为可提交的新版本表单闭环。', '根据本轮需求，机器学习数据管理上传文件大小放开前端限制。', '根据本轮 V1.14 需求，机器学习数据管理详情支持合并同一数据集内多个版本，合并结果作为最新版本并保留每条样本来源版本。', '根据本轮发布态需求，机器学习数据新建/新增版本默认未发布；未发布版本展示发布入口并允许单条删除，已发布版本锁定单条删除，数据标注仅选择已发布数据。'],
      syncMissingDefaultRequirements: true,
      defaultRequirements: [
        {
          version: 'V1.14',
          createdAt: '2026-05-27T18:30:00+08:00',
          content: `# V1.14 机器学习数据发布态

机器学习数据按版本控制发布态。新建数据、追加版本、合并版本和标注产出的版本默认未发布；未发布版本可删除版本里的单条数据并发布，发布前不做额外强校验。版本一旦发布，数据明细锁定，不允许继续删除该版本里的单条数据。

机器学习数据标注的数据源按版本展示，已发布版本可选择，未发布版本保留展示但置灰且不可选择。若最新版本未发布，但同一数据集存在历史已发布版本，标注创建仍可选择这个历史已发布版本。`,
        },
        {
          version: 'V1.14',
          createdAt: '2026-05-27T16:20:00+08:00',
          content: `# V1.14 机器学习数据版本合并

机器学习数据管理需要支持同一数据集内多个版本合并。入口与新增版本放在详情页左侧版本操作区域，用户可选择至少 2 个版本合并。

合并后生成一个新的最新版本，源版本不删除、不改写。合并样本全部保留，即使内容或样本名重复也不去重；数据详情表展示“来源版本”列，样本重名处理属于后端保存逻辑。合并生成的未发布版本允许删除版本里的单条数据；发布后该版本明细锁定，不允许继续删除单条数据。

合并生成的版本在基本信息中将数据来源展示为“版本合并（Vx、Vy）”。前台不展示样本名字段，不暴露后端用于保存和去重的内部标识。`,
        },
      ],
    }),
  },
  {
    match: pathname => pathname === '/machine-model-management' || pathname.startsWith('/machine-model-management/'),
    doc: createDoc({
      pageName: '模型管理',
      pagePath: '/machine-model-management',
      module: '机器学习',
      status: '已对齐生产环境',
      goal: '管理机器学习模型资产和模型版本，并支持从本地或 Notebook 产物创建模型。',
      audience: '机器学习工程师、平台管理员',
      problem: '本地实现曾保留过训练状态、基础模型和部署动作等非生产字段，当前需要收敛为生产环境的机器学习模型资产管理结构。',
      structure: ['我的模型列表', '名称搜索', '创建模型独立页面', '模型详情弹窗'],
      fields: [
        { name: '模型名称', location: '列表/创建页/详情', type: '文本', required: '是', description: '模型资产主名称，列表支持在字段旁悬浮显示编辑入口并行内编辑。' },
        { name: '模型描述', location: '列表', type: '长文本', required: '否', description: '模型资产补充说明，编辑入口悬浮显示且不受版本状态影响。' },
        { name: '模型版本', location: '创建页/详情', type: '只读版本号', required: '是', description: '新建模型默认 V1。' },
        { name: '版本数量', location: '列表/详情', type: '数字', required: '否', description: '模型下版本数量。' },
        { name: '模型类型', location: '创建页/详情', type: '单选', required: '是', description: '文本或图片。' },
        { name: '标注类型 / 任务类型', location: '创建页/详情', type: '联动单选', required: '是', description: '按模型类型切换文本分类、实体识别、图像分类、图像分割、物体检测及其任务类型。' },
        { name: '模型来源', location: '创建页/详情', type: '单选', required: '是', description: '本地上传或 Notebook 获取。' },
        { name: '权重文件 / 分词器 / 网络结构', location: '创建页/详情', type: '文件选择或文本', required: '权重文件必填', description: '对齐生产环境创建模型的模型配置字段。' },
      ],
      actions: [
        { name: '创建模型', entry: '创建模型按钮进入独立创建页', precondition: '填写模型名称和模型配置', successFeedback: '新模型加入我的模型列表，版本数量为 1', errorFeedback: '必填项缺失时展示表单校验' },
        { name: '查看详情', entry: '列表行操作', precondition: '模型存在', successFeedback: '打开详情弹窗展示模型配置', errorFeedback: '记录不存在时不打开详情' },
        { name: '删除模型', entry: '列表行操作', precondition: '模型存在', successFeedback: '二次确认后从列表移除', errorFeedback: '取消确认时不做修改' },
      ],
      states: [
        { name: 'V1', meaning: '新建模型的初始版本', presentation: '创建页只读字段和详情字段', availableActions: '查看详情、删除' },
      ],
      interactionNotes: [
        '当前页按用户要求重新参考生产环境；生产无部署动作，因此从模型管理列表移除部署按钮。',
        '保留用户历史新增功能优先原则：如后续模型部署需要读取该模型资产，可通过模型部署页完成，不在模型管理列表直接部署。',
        '本地上传权重文件和分词器文件需展示进度，上传中可取消，失败或取消后可继续上传并保留断点进度。',
        '机器学习模型列表名称列和描述列统一接入字段级行内编辑，编辑入口仅在鼠标悬浮对应字段时展示，点击后当前字段变为输入框。',
      ],
      productionComparison: ['本轮已核对生产环境：模型管理列表为我的模型、按名称搜索、创建模型、模型名称/版本数量/操作三列；创建模型为独立页面。'],
      userChanges: ['对齐生产环境时未覆盖用户已明确要求的机器学习 Notebook、部署和数据管理新增能力。', '根据本轮需求，被推理、部署或训练任务引用的模型暂不允许删除；任务完成、失败或终止不释放引用，必须删除相关任务或停止引用链后才可删除。', '根据本轮全局编辑反馈，机器学习模型管理列表补齐模型名称与模型描述字段级行内编辑。'],
    }),
  },
  {
    match: pathname => pathname === '/docs' || pathname.startsWith('/docs/'),
    doc: createDoc({
      pageName: '文档中心',
      pagePath: '/docs',
      module: '文档中心',
      status: '已基于需求演进',
      goal: '展示 DeepexiLab 产品使用手册 V1.2，并在存在运行中 Agent 服务时支持自然语言问答查找手册章节。',
      audience: '平台用户、平台管理员、算法工程师',
      problem: '将旧使用指南替换为用户上传的产品使用手册，并让用户可通过目录、搜索和 Agent 问答定位对应章节。',
      structure: ['左侧静态标题', '产品使用手册目录', '手册正文 HTML 还原区', 'Agent助手右侧对话栏', '回答引用与文档定位'],
      fields: [
        { name: '用户问题', location: 'Agent助手输入框', type: '多行文本', required: '是', description: '用户以自然语言输入要查找的文档问题。' },
        { name: '回答内容', location: 'Agent助手消息区', type: '文本', required: '否', description: '由启动中的文档中心 Agent 基于 RAG 结果生成。' },
        { name: '文档定位', location: '回答引用区', type: '引用列表', required: '是', description: '展示文档标题、章节、片段摘要和可跳转路由。' },
      ],
      actions: [
        { name: '发送问题', entry: 'Agent助手发送按钮或 Enter', precondition: '存在运行中的全局 Agent 服务', successFeedback: '展示回答和引用定位', errorFeedback: '服务不可用或无索引时提示失败' },
        { name: '跳转文档定位', entry: '回答引用卡片', precondition: '引用中包含 routePath', successFeedback: '跳转到对应文档或页面位置', errorFeedback: '目标路由不可用时保持当前页' },
      ],
      states: [
        { name: '无运行服务', meaning: '系统配置中未启动文档 Agent', presentation: '不展示 Agent助手', availableActions: '继续阅读文档' },
        { name: '运行中', meaning: '存在全局 Agent 服务', presentation: '右侧展示 Agent助手对话栏', availableActions: '提问、查看引用、跳转定位' },
      ],
      interactionNotes: ['当前页以用户迭代需求为基线。', '旧结构“使用指南”已替换为“DeepexiLab产品使用手册-V1.2”，正文按用户上传 docx 转换展示，不改写原文。', '文档中心使用固定高度的左右布局，左侧目录不随正文滚动消失；正文滚动时同步高亮当前章节并展开所属一级目录。', '一级目录支持折叠与展开，便于阅读长手册。', 'Agent助手右侧面板保持稳定展示，运行中展示对话框，加载或未启动时展示明确状态。', 'Agent助手回答必须带 citations，不能只返回自然语言。', '引用定位优先跳转产品使用手册章节。', '根据截图备注，左侧删除返回按钮；文档中心作为静态标题展示，不再作为可展开一级目录。', '根据本轮反馈，产品使用手册左侧仅保留一次文档名称，正文中的同名 H1 不再作为目录项重复展示。'],
      productionComparison: ['本页当前不参考生产环境，以第二阶段用户需求为基线。'],
      userChanges: ['根据本轮需求，文档中心接入由系统配置 Agent助手控制的全局 RAG 对话入口。', '根据本轮计划，文档中心唯一文档替换为用户上传的 DeepexiLab 产品使用手册 V1.2，并同步更新 RAG 索引来源。', '根据本轮反馈，修复左侧目录随页面滚动消失、目录定位不精准、一级目录不可折叠以及 Agent 对话框消失的问题。', '根据用户截图备注，删除文档中心左侧返回按钮，并将文档中心从菜单一级节点改成左侧标题。', '根据本轮反馈，移除左侧目录中与文档入口重复的产品手册标题项。'],
    }),
  },
  {
    match: pathname => pathname === '/machine-model-deployment' || pathname.startsWith('/machine-model-deployment/'),
    doc: createDoc({
      pageName: '机器学习模型部署',
      pagePath: '/machine-model-deployment',
      module: '机器学习',
      status: '已基于需求演进',
      goal: '管理机器学习模型的标准部署与自定义部署任务，并统一追踪模型、版本、资源与部署配置。',
      audience: '机器学习工程师、平台管理员',
      problem: '让机器学习模型部署列表和创建页的信息表达更贴近当前业务需求，减少无效字段和样式噪音。',
      structure: ['筛选区', '部署列表', '部署类型选择卡片', '标准部署创建页', '自定义部署创建页', '详情弹层'],
      fields: [
        { name: '服务名称', location: '列表/创建页', type: '文本', required: '是', description: '部署服务主标识，列表支持在字段旁悬浮显示编辑入口并行内编辑。' },
        { name: '服务描述', location: '列表/创建页/详情', type: '长文本', required: '否', description: '部署任务级说明，最多 300 字。' },
        { name: '模型名称', location: '列表 / 标准部署创建页', type: '选择项', required: '是', description: '标准部署选择待发布的机器学习模型。' },
        { name: '模型版本', location: '标准部署创建页', type: '选择项', required: '是', description: '标准部署在选择模型后继续选择版本。' },
        { name: '模型来源', location: '列表 / 标准部署创建页', type: '固定值', required: '是', description: '标准部署固定为模型管理。' },
        { name: '网络架构', location: '列表', type: '只读字段', required: '否', description: '列表单独展示网络架构。' },
        { name: '标准部署镜像', location: '标准部署环境信息', type: '镜像配置 + 二级级联选择', required: '是', description: '先选择系统镜像/自定义镜像；系统镜像下一级选择镜像类型 ML，二级选择具体 Notebook ML 镜像。' },
        { name: '标准部署运行命令', location: '标准部署环境信息', type: '只读代码块', required: '是', description: '固定展示 gunicorn 启动命令，不开放编辑。' },
        { name: 'Python文件', location: '标准部署环境信息', type: '本地上传/Notebook获取', required: '是', description: '支持本地上传 model.py 或从 Notebook 中获取 Python 文件。' },
        { name: '部署配置 JSON', location: '自定义部署创建页', type: '代码编辑框', required: '是', description: '自定义部署通过 JSON 编辑框维护部署配置。' },
        { name: '资源信息', location: '标准部署 / 自定义部署创建页', type: '复合字段', required: '是', description: '统一配置 CPU、内存、GPU 与实例数。' },
      ],
      actions: [
        { name: '创建标准部署', entry: '创建页部署类型卡片 + 提交按钮', precondition: '已填写服务名称、模型信息与资源信息', successFeedback: '标准部署记录加入列表', errorFeedback: '表单校验失败' },
        { name: '创建自定义部署', entry: '创建页部署类型卡片 + 提交按钮', precondition: '已填写服务名称、镜像信息、资源信息与部署配置 JSON', successFeedback: '自定义部署记录加入列表', errorFeedback: '表单校验失败或 JSON 格式错误' },
        { name: '编辑部署', entry: '列表行编辑按钮', precondition: '状态满足统一规则', successFeedback: '打开编辑页并回填原有配置，保存后列表与详情同步更新', errorFeedback: '无目标记录时返回列表页并提示' },
        { name: '启动/重新提交/终止', entry: '列表行操作', precondition: '状态满足统一规则', successFeedback: '状态切换可见', errorFeedback: '启动中任务终止时提示阻断文案' },
        { name: '访问信息 / 删除', entry: '列表行操作', precondition: '状态允许对应动作', successFeedback: '打开详情或完成删除', errorFeedback: '按钮禁用' },
      ],
      states: [
        { name: '已创建', meaning: '部署记录已建立未启动', presentation: '显示已创建标签', availableActions: '启动、编辑、访问信息、删除' },
        { name: '启动中/排队中/运行中', meaning: '部署正在申请资源或运行', presentation: '显示处理中标签', availableActions: '访问信息；排队中和运行中允许终止' },
        { name: '已终止/失败', meaning: '部署被终止或执行失败', presentation: '显示失败或已终止标签', availableActions: '重新提交、访问信息、删除' },
      ],
      interactionNotes: [
        '列表页列顺序已调整为服务名称、模型名称、网络架构、模型来源等当前业务更关心的信息。',
        '失败或已终止记录保留重新提交语义，操作按钮区按紧凑横向布局展示，避免换行杂乱。',
        '标准部署页已把基本信息和模型信息合并，删除网络架构输入，增加模型版本选择。',
        '标准部署页把环境信息放在资源信息前面；部署实例数字段从资源信息移入环境信息，并与镜像配置、固定运行命令、本地上传/Notebook获取、Python 文件上传同卡展示。',
        '标准部署本地上传 Python 文件需展示进度，上传中可取消，失败或取消后可继续上传并保留断点进度。',
        'Notebook获取选项不再展示额外“说明”文本。',
        '自定义部署页在环境信息中展示部署实例数，资源信息不再重复展示实例数。',
        '自定义部署页的服务配置已改为 JSON 代码编辑框，不再使用访问路径 / 健康检查 / 超时三字段表单。',
        '当前页以用户迭代需求为基线；机器学习部署任务支持在列表名称列与描述列分别行内编辑，编辑入口悬浮显示且不受任务状态影响，详情、资源引用拦截和本地持久化 store 同步读取更新结果。',
      ],
      productionComparison: ['该页已不再沿用第一阶段生产环境基线，当前结构以用户截图与文字要求为准。'],
      userChanges: [
        '根据用户新增需求，原有部署方式被明确命名为标准部署。',
        '根据评论需求，列表页新增模型名称字段，并把发布对象改为网络架构、资源规格改为模型来源。',
        '根据评论需求，自定义部署说明文案改为机器学习部署功能描述。',
        '根据评论需求，基本信息与模型信息合并，模型来源固定为模型管理，标准部署增加模型版本选择。',
        '根据评论需求，自定义部署服务配置改为 JSON 代码编辑框。',
        '根据本轮批注，标准部署创建页补齐环境信息，运行命令固定不可编辑，镜像配置移动到环境信息并补系统镜像/自定义镜像切换，同时保留部署实例数字段。',
        '根据本轮批注，自定义部署环境信息补充部署实例数字段。',
        '根据本轮批注，标准部署环境信息与资源信息互换位置，部署实例数仅放在环境信息中。',
        '根据本轮全局任务需求，机器学习部署任务支持名称列与描述列分别行内编辑，编辑入口悬浮显示且不受任务状态影响，保存后列表、详情和引用提示同步刷新。',
      ],
      recentChanges: [
        {
          date: '2026-04-20',
          change: '新增标准部署 / 自定义部署双模式创建流，并为自定义部署补齐镜像环境与服务配置表单。',
          reason: '承接用户对机器学习模型部署模块的新一轮迭代需求。',
          scope: '机器学习模型部署列表页、创建页与页面内嵌设计文档',
        },
        {
          date: '2026-04-20',
          change: '补充部署记录本地持久化与编辑回填能力，创建、编辑、删除和状态切换共享同一套数据源。',
          reason: '让模型部署页形成完整的前端业务闭环，而不是一次性表单。',
          scope: '机器学习模型部署数据层、编辑页路由与交互回填',
        },
      ],
    }),
  },
  {
    match: pathname => pathname === '/admin/projects',
    doc: createDoc({
      pageName: '项目管理',
      pagePath: '/admin/projects',
      module: '系统管理',
      status: '已基于需求演进',
      goal: '集中管理项目基础信息、项目成员角色、SSH 配置与镜像命名空间。',
      audience: '平台管理员、项目管理员',
      problem: '让项目创建、编辑、成员角色分配和项目级配置形成统一入口；项目内数据范围由成员角色的数据权限决定。',
      structure: ['项目列表', '新建/编辑项目弹窗', '成员管理弹窗', 'SSH 配置弹窗', '镜像命名空间弹窗'],
      fields: [
        { name: '项目名称', location: '列表/表单', type: '文本', required: '是', description: '项目唯一显示名称。' },
        { name: '项目描述', location: '列表/表单', type: '多行文本', required: '否', description: '项目说明信息。' },
        { name: '绑定集群', location: '列表/表单', type: '下拉选择', required: '是', description: '项目关联的目标集群；编辑项目时不开放修改。' },
        { name: 'SSH配置', location: '列表与 SSH 配置弹窗', type: '开关 + 条件表单', required: '否', description: '未开启时只展示开关，开启后展示用户名、密码、SSH Key 和生成按钮。' },
        { name: '镜像命名空间', location: '列表与命名空间弹窗', type: '下拉选择', required: '否', description: '为项目维护镜像命名空间。' },
        { name: '成员角色', location: '成员管理弹窗', type: '用户下拉 + 角色下拉', required: '是', description: '添加成员时先选用户，再从该用户在控制台已授权的角色中选择当前项目角色。' },
        { name: '成员列表', location: '成员管理弹窗', type: '表格', required: '是', description: '展示账号、用户名、当前项目角色、邮箱、加入时间和删除操作。' },
      ],
      actions: [
        { name: '新建项目', entry: '顶部按钮', precondition: '具备菜单权限与操作权限', successFeedback: '项目写入列表', errorFeedback: '无操作权限时提示“无操作权限”' },
        { name: '编辑项目', entry: '列表行操作', precondition: '具备项目编辑权限', successFeedback: '打开与新建项目字段顺序一致的编辑弹窗，仅维护项目名称、描述和绑定集群', errorFeedback: '无操作权限时提示“无操作权限”' },
        { name: '成员管理', entry: '列表行操作', precondition: '具备项目管理操作权限', successFeedback: '打开成员与权限配置弹窗', errorFeedback: '无操作权限时提示“无操作权限”' },
        { name: '添加成员', entry: '成员管理弹窗顶部表单', precondition: '成员存在且已在控制台授权至少一个可见角色', successFeedback: '成员加入项目，列表展示账号、用户名、项目角色、邮箱与加入时间', errorFeedback: '缺少成员或角色时表单提示' },
        { name: '删除成员', entry: '成员管理弹窗成员列表', precondition: '成员已加入项目', successFeedback: '从待保存成员列表中移除该成员', errorFeedback: '保存前关闭弹窗则不落库' },
        { name: 'SSH配置', entry: '列表行操作', precondition: '具备项目编辑权限', successFeedback: '打开 SSH 配置弹窗并保存；开启后展示配置字段，生成 SSH Key 时直接调用浏览器下载能力', errorFeedback: '无操作权限时提示“无操作权限”' },
        { name: '镜像命名空间配置', entry: '列表行操作', precondition: '具备项目编辑权限', successFeedback: '保存镜像命名空间', errorFeedback: '无操作权限时提示“无操作权限”' },
        { name: '删除项目', entry: '列表行操作', precondition: '具备项目编辑权限', successFeedback: '二次确认后从列表移除项目', errorFeedback: '取消确认时不删除' },
      ],
      states: [
        { name: '项目成员', meaning: '当前账号已被添加到项目成员列表', presentation: '项目显示在列表与项目空间中', availableActions: '按项目角色的操作权限和数据权限执行操作' },
        { name: '非项目成员', meaning: '当前账号未被添加到项目成员列表', presentation: '项目不显示在当前账号项目上下文中', availableActions: '不可查看该项目业务页面' },
      ],
      interactionNotes: ['项目创建/编辑不再维护项目管理员字段；项目管理员仍是内置角色，但通过成员管理分配给项目用户。', '成员管理添加用户时必须选择项目角色，角色选项只能来自该用户在控制台已授权的角色。', '点击添加成员后立即写入项目成员列表，同时保留保存按钮用于确认整批成员调整。', '成员进入项目后，是否只能操作个人数据或可操作全部数据，由该项目角色的数据权限决定。', 'SSH 配置未开启时只展示开关，开启后再展示用户名、密码、SSH Key 和生成按钮，生成按钮使用低强调样式；点击生成 SSH Key 时不展示页面内进度或下载状态，只调用浏览器下载组件。', '项目表格使用普通横向滚动，不使用固定列，避免小屏下操作列覆盖中间字段。', '删除项目必须先进行二次确认。'],
      productionComparison: ['该页以用户第二阶段权限需求为基线，不再沿用项目创建页选择项目管理员的旧结构。'],
      userChanges: ['根据用户最新权限需求，项目创建/编辑删除项目管理员字段。', '成员管理增加项目角色选择，且只能从用户在控制台已授权角色中选择。', '成员列表角色字段展示当前项目角色，数据范围由权限配置页的数据权限 tab 决定。', '根据本轮批注，项目创建提示删除租户管理员相关描述，并修复添加成员点击后不立即生效的问题。'],
    }),
  },
  {
    match: pathname => pathname === '/admin/permissions',
    doc: createDoc({
      pageName: '权限配置',
      pagePath: '/admin/permissions',
      module: '系统管理',
      status: '已基于需求演进',
      goal: '配置角色在 Lab 内的操作权限和数据权限。',
      audience: '平台管理员',
      problem: 'Lab 平台不负责创建角色或给用户授权角色，但需要基于外部角色配置 Lab 内操作权限和数据权限。',
      structure: ['页面标题', '角色搜索区', '角色列表', '操作权限 Tab', '数据权限 Tab'],
      fields: [
        { name: '角色名称', location: '左侧角色列表', type: '文本', required: '是', description: '展示角色名并支持检索。' },
        { name: '操作权限搜索', location: '右侧顶部', type: '搜索框', required: '否', description: '按关键字过滤权限树。' },
        { name: '操作权限树', location: '右侧主体', type: '树形多选', required: '是', description: '按菜单层级展示业务操作权限；内置角色只读，外部角色可编辑。' },
        { name: '数据权限', location: '数据权限 Tab', type: '模块权限矩阵', required: '是', description: '按大模型、机器学习、系统管理三部分展示个人数据/任务和全部数据；内置角色只读，外部角色可编辑全部数据。' },
      ],
      actions: [
        { name: '切换角色查看权限', entry: '左侧角色列表', precondition: '角色存在', successFeedback: '右侧权限树切换到对应角色权限', errorFeedback: '无匹配角色时保持原选择' },
        { name: '搜索操作权限', entry: '右侧搜索框', precondition: '输入关键字', successFeedback: '树中过滤显示匹配权限节点', errorFeedback: '无匹配时展示空态' },
        { name: '编辑外部角色权限', entry: '操作权限树 / 数据权限 Tab', precondition: '选中的角色为外部同步角色', successFeedback: '更新该角色在 Lab 内的操作权限和数据权限', errorFeedback: '内置角色不可编辑' },
      ],
      states: [
        { name: '平台管理员', meaning: '内置最高权限角色，默认拥有所有操作权限和全部数据权限', presentation: '在角色管理中展示，标记为内置', availableActions: '查看权限，不可编辑或删除' },
        { name: '内置角色只读', meaning: '平台管理员、项目管理员、训练工程师等内置角色名称和操作权限不可修改', presentation: '只读展示角色名称和权限配置', availableActions: '查看权限' },
        { name: '外部角色', meaning: '外部平台创建并同步到 Lab 的角色', presentation: '角色卡片不额外展示外部标识', availableActions: '编辑操作权限和数据权限' },
      ],
      interactionNotes: ['权限配置页现在包含操作权限和数据权限两个 Tab。', '页面只保留权限配置功能描述，不展示用户角色只读表。', '平台管理员、项目管理员、训练工程师均作为内置角色展示；内置角色只读，且角色卡片不额外展示“内置”标识。', '角色创建、角色删除、角色名称和用户与角色授权均由外部控制台维护。', '外部控制台同步来的新角色允许在 Lab 内编辑操作权限和数据权限。', '数据权限分为大模型、机器学习、系统管理三部分，每部分的个人数据/任务默认勾选且不可取消；外部角色可编辑全部数据。', '无全部数据权限时，用户可以在列表和搜索中看到他人数据，但详情、编辑、删除、启动、下载等操作会提示权限不足。', '业务操作生效必须同时满足菜单权限、操作权限、项目成员身份和数据权限。'],
      productionComparison: ['该页为用户本轮新增能力，不以生产环境已有页面为唯一限制。'],
      userChanges: ['新增系统管理下“权限配置”菜单，并按截图实现角色列表+操作权限树布局。', '根据待迭代项截图，项目管理员关于系统管理的默认权限仅保留项目成员管理，训练工程师除系统管理外其它功能均有权限。', '根据用户最新权限需求，新增数据权限 Tab，支持大模型、机器学习和系统管理的个人数据/任务与全部数据展示。', '根据用户最新反馈，补回平台管理员内置角色在角色管理中的展示。', '根据用户纠正，移除 Lab 内的用户角色授权和新建角色入口，Lab 只负责读取外部平台同步的角色。', '根据用户最新反馈，外部同步的新角色允许在 Lab 内编辑操作权限和数据权限，并补充多个外部角色示例。', '根据本轮批注，删除用户角色区、角色卡片标识和“外部角色权限可编辑”提示。'],
      defaultRequirements: [
        {
          version: 'V1.14',
          createdAt: '2026-05-22T15:23:00+08:00',
          content: `# V1.14 权限配置需求

## 需求背景
Lab 需要基于外部控制台同步的用户、角色和授权关系，在平台内配置角色对应的操作权限和数据权限，避免用户拥有按钮入口后越权操作他人数据、任务、模型或服务。

## 目标范围
- Lab 只读取外部控制台同步的用户、角色和用户授权关系，不提供用户角色授权、角色创建、角色删除、角色改名能力。
- 权限配置包含“操作权限”和“数据权限”两个 Tab，二者共同参与业务操作拦截。
- 内置角色固定为平台管理员、项目管理员、训练工程师；内置角色只读，不允许编辑操作权限和数据权限。
- 外部控制台同步的新角色允许在 Lab 内编辑操作权限和数据权限。
- 项目创建/编辑不再维护项目管理员字段；项目成员通过成员管理添加，并选择该用户在外部控制台已授权的项目角色。

## 页面结构
- 顶部仅展示权限配置功能描述：配置角色在 Lab 内的操作权限和数据权限。
- 左侧展示角色搜索和角色列表，角色卡片展示角色名称与全部数据范围摘要，不展示“内置”“外部角色”等额外标识。
- 右侧包含操作权限 Tab 和数据权限 Tab。
- 操作权限 Tab 使用权限树展示菜单、页面和业务动作权限。
- 数据权限 Tab 按大模型、机器学习、系统管理三部分展示权限范围。

## 操作权限规则
- 操作权限覆盖菜单入口、页面查看、创建、编辑、删除、启动、停止、提交、下载等业务动作。
- 内置角色只能查看权限配置，不允许修改。
- 外部同步角色可勾选或取消操作权限，保存后影响该角色在 Lab 内的功能入口与按钮能力。
- 用户执行业务动作时，必须同时满足项目成员身份、当前项目角色、菜单权限和操作权限。

## 数据权限规则
- 大模型、机器学习、系统管理均包含“个人数据/任务”和“全部数据”两种范围。
- “个人数据/任务”默认勾选且不可取消，仅允许操作本人创建的数据、任务、模型、服务等资源。
- “全部数据”勾选后，允许操作对应数据域内全部用户创建的资源。
- 系统管理的数据权限仅控制存在创建人归属的系统资源。
- 判断个人数据时，以资源创建人账号与当前登录账号是否一致为准；历史 mock 数据需要补齐或映射创建人账号。

## 权限不足规则
- 没有“全部数据”权限时，用户仍可在列表看到并搜索到他人资源的基础行信息。
- 进入详情、编辑、删除、启动、停止、下载、提交等操作时，如资源创建人不是当前账号，则提示“权限不足”。
- 权限不足时不进入详情、不提交表单、不改变资源或任务状态。

## 项目管理联动
- 项目创建/编辑保留项目名称、描述、绑定集群等字段，删除项目管理员字段。
- 成员管理添加成员时先选择用户，再选择该用户在外部控制台已授权的项目角色。
- 成员列表展示成员账号、用户名、邮箱、项目角色、加入时间和操作。
- 成员进入项目后，能操作个人数据还是全部数据，由该项目角色的数据权限决定。

## 验收标准
- 权限配置页不出现用户角色授权、新建角色、删除角色、编辑角色名称入口。
- 页面展示三个内置角色和多个外部同步角色；内置角色只读，外部角色可编辑。
- 数据权限 Tab 三个数据域均展示个人数据/任务和全部数据；个人数据/任务不可取消。
- 无全部数据权限用户可以搜索到他人资源，但详情、编辑、删除、启动、下载等操作统一提示权限不足。
- 项目成员添加时必须选择该用户已授权角色，成员列表展示项目角色字段。`,
        },
      ],
    }),
  },
  {
    match: pathname => pathname === '/admin/base-model',
    doc: createDoc({
      pageName: '模型仓库',
      pagePath: '/admin/base-model',
      module: '系统管理',
      status: '开发中',
      goal: '维护平台模型仓库清单、提供商信息和状态流转。',
      audience: '平台管理员',
      problem: '统一管理模型仓库资产及其运行状态。',
      structure: ['筛选区', '模型仓库列表', '新增弹窗', '详情弹窗'],
      fields: [
        { name: '模型Code', location: '列表/表单', type: '文本', required: '是', description: '模型仓库条目的唯一编码。' },
        { name: '模型提供商', location: '筛选区/列表/表单', type: '枚举/自定义', required: '是', description: '下拉支持国内外主流开源提供商，并可选择自定义后填写提供商名称。' },
        { name: '状态', location: '列表', type: '任务状态', required: '是', description: '遵循统一任务状态流转规则。' },
      ],
      actions: [
        { name: '新增模型', entry: '右上角按钮', precondition: '具备平台管理权限', successFeedback: '记录加入列表', errorFeedback: '表单校验失败' },
        { name: '启动/重新提交/终止', entry: '列表行操作', precondition: '状态允许对应动作', successFeedback: '状态切换可见', errorFeedback: '按钮禁用' },
        { name: '编辑/查看详情/删除', entry: '列表行操作', precondition: '状态允许对应动作', successFeedback: '打开详情或删除记录', errorFeedback: '按钮禁用' },
      ],
      states: [
        { name: '已创建', meaning: '模型仓库记录已创建未启动', presentation: '显示已创建标签', availableActions: '启动、编辑、查看详情、删除' },
        { name: '运行中', meaning: '模型仓库条目当前可供平台使用', presentation: '显示运行中标签', availableActions: '终止、查看详情' },
        { name: '失败/已终止', meaning: '模型仓库条目启动失败或被终止', presentation: '显示失败或已终止标签', availableActions: '重新提交、查看详情、删除' },
      ],
      interactionNotes: ['当前页以用户迭代需求为基线。', '模型仓库页面已按用户提供的全局任务流转规则收口。', '旧结构：模型提供商收敛为 Qwen，列表、表单和详情包含模型类型与支持能力字段；新结构：模型类型和支持能力均从列表、表单、详情和数据结构中删除，模型提供商放开为国内外主流开源提供商并支持自定义。', '新增模型弹窗保留“本地 / ModelScope”来源切换：本地来源使用模型 Code 下拉或自定义输入，ModelScope 来源补集群选择、下载入口提示和任务定时配置。', '筛选区支持换行，列表设置明确列宽与横向滚动，避免小屏内容错位或右侧操作不可见。'],
      productionComparison: ['本轮未参考生产环境，按用户新增需求在当前仓库基线上迭代。'],
      userChanges: ['根据待迭代项截图，本地上传模型操作中不再展示日志能力，新增模型补模型来源选择，支持本地和 ModelScope。', '根据本轮批注重做新增基础模型弹窗字段顺序和来源差异，并修复模型仓库小屏错位与无法横向滑动问题。', '根据最新批注将模型类型从 LLM/VLM 改为文本生成/图像理解，并将模型提供商收敛为 Qwen。', '根据本轮需求，模型仓库放开模型提供商限制，下拉支持国内外主流开源提供商和自定义，同时删除支持能力字段。', '根据本轮需求，模型仓库继续删除模型类型字段，训练创建页改为根据模型 Code/名称推断训练类型。', '根据本轮需求，被推理、部署或训练任务引用的模型仓库条目暂不允许删除；任务完成、失败或终止不释放引用，必须删除相关任务或停止引用链后才可删除。'],
    }),
  },
  {
    match: pathname => pathname === '/admin/kubernetes',
    doc: createDoc({
      pageName: '集群管理',
      pagePath: '/admin/kubernetes',
      module: '系统管理',
      status: '已基于需求演进',
      goal: '管理 Kubernetes 集群、挂载状态、关联存储配置和镜像仓库。',
      audience: '平台管理员',
      problem: '让集群资源接入、关联配置和删除操作在同一页面可见可控。',
      structure: ['集群列表', '导入集群弹窗', '编辑集群信息弹窗'],
      fields: [
        { name: '集群名称', location: '列表', type: '文本', required: '是', description: '当前集群主标识。' },
        { name: '集群描述', location: '导入/编辑弹窗', type: '文本', required: '否', description: '补充说明当前集群用途。' },
        { name: 'API Server', location: '列表/编辑弹窗', type: 'URL 文本', required: '编辑时是', description: '展示并允许修改已创建集群的 API Server 地址；导入时仍从 kubeconfig 解析。' },
        { name: 'kubeconfig', location: '导入弹窗', type: 'YAML 文本输入', required: '是', description: '通过文本输入方式粘贴 kubeconfig 内容。' },
        { name: '集群配置', location: '编辑弹窗', type: 'YAML 只读文本域', required: '否', description: '编辑已有集群时仅展示 YAML 配置信息，不允许修改。' },
        { name: '挂载状态', location: '列表', type: '状态标签', required: '是', description: '展示集群是否已挂载。' },
        { name: '存储配置', location: '列表', type: '文本', required: '否', description: '展示当前集群绑定的存储配置。' },
        { name: '镜像仓库', location: '列表', type: '文本', required: '否', description: '展示当前集群绑定的镜像仓库。' },
      ],
      actions: [
        { name: '测试连接', entry: '列表行操作', precondition: '集群存在', successFeedback: '显示连接结果', errorFeedback: '提示测试失败' },
        { name: '导入集群', entry: '顶部按钮', precondition: '填写集群名称并粘贴 kubeconfig', successFeedback: '新增集群并将连接状态置为未测试', errorFeedback: '表单校验失败时保留弹窗' },
        { name: '编辑', entry: '列表行操作', precondition: '集群存在', successFeedback: '更新集群名称、描述和 API Server 后连接状态重置为未测试，原 kubeconfig 保持不变', errorFeedback: '表单校验失败时保留弹窗' },
        { name: '绑定存储配置', entry: '列表行操作', precondition: '集群存在', successFeedback: '集群绑定存储成功', errorFeedback: '提示绑定失败' },
        { name: '绑定仓库配置', entry: '列表行操作', precondition: '集群存在', successFeedback: '集群绑定仓库成功', errorFeedback: '提示绑定失败' },
        { name: '删除', entry: '列表行操作', precondition: '集群存在', successFeedback: '集群从列表中移除', errorFeedback: '提示删除失败' },
      ],
      states: [
        { name: '连接正常', meaning: '集群连接可用', presentation: '连接状态为绿色标签', availableActions: '测试连接、编辑、绑定、删除' },
        { name: '连接失败', meaning: '集群连接异常', presentation: '连接状态为红色标签', availableActions: '测试连接、编辑、删除' },
        { name: '未测试', meaning: '集群信息更新后尚未重新测试连接', presentation: '连接状态为默认标签', availableActions: '测试连接、编辑、删除' },
      ],
      interactionNotes: ['当前页已根据第二阶段截图需求补充挂载状态、存储配置、镜像仓库三列，并新增删除按钮。', '集群表格使用横向滚动和明确列宽，避免小屏下右侧字段与操作不可见。', '导入集群弹窗按截图改为文本输入 kubeconfig，并补充集群描述字段；不再展示 API Server、标签、上传按钮和测试连接。', '无论连接成功、失败或未测试，列表均展示编辑按钮；编辑集群信息弹窗包含集群名称、集群描述、API Server、集群配置（YAML格式），其中集群配置在编辑态只读不可修改，点击更新后连接状态自动变为未测试。', '列表操作删除三个点详情入口，不再提供集群详情弹窗。', '当前页以用户迭代需求为基线；右上角 Bell 已从静态红点升级为可交互消息中心，点击后以右侧抽屉展示 Lab 核心任务站内消息。'],
      productionComparison: ['本页当前以用户迭代需求为基线，不再以第一阶段生产环境拆解为默认依据。'],
      userChanges: ['根据待迭代项截图，集群管理补充挂载状态、存储配置、镜像仓库字段，并增加删除操作。', '根据批注补充小屏横向滚动，并为连接失败集群开放编辑更新流程。', '根据用户截图重做导入和编辑弹窗，导入页补集群描述并采用文本输入 kubeconfig，编辑页采用 YAML 配置表单。', '根据用户最新要求，编辑按钮不再受连接状态限制，所有集群均可编辑。', '根据用户要求删除操作列三个点详情入口和详情弹窗。', '根据本轮要求，已创建集群点击编辑时增加 API Server 字段，并允许保存修改。', '根据用户最新批注，编辑已有集群时集群配置（YAML格式）不允许编辑，保存时保留原 kubeconfig。', '根据本轮需求，右上角消息中心接入 Lab 任务站内消息通知，未读数、筛选、手动已读和任务跳转均在全局壳层生效。'],
    }),
  },
  {
    match: pathname => pathname === '/admin/storage',
    doc: createDoc({
      pageName: '存储管理',
      pagePath: '/admin/storage',
      module: '系统管理',
      status: '已基于需求演进',
      goal: '管理存储配置并控制存储与集群绑定关系下的删除权限。',
      audience: '平台管理员',
      problem: '让存储创建、列表展示、详情查看、文件系统格式化和删除行为在绑定约束下可控。 ',
      structure: ['搜索筛选区', '存储列表', '新建弹窗', '详情弹窗'],
      fields: [
        { name: '存储名称', location: '列表', type: '文本', required: '是', description: '当前存储配置主标识。' },
        { name: '配置名称', location: '新建弹窗/基本信息', type: '文本', required: '是', description: '新建存储配置的名称。' },
        { name: '存储类型', location: '新建弹窗/基本信息', type: '下拉选择', required: '是', description: '支持火山引擎 TOS、MinIO、NFS、华为云 OBS、移动云。' },
        { name: '配置参数', location: '新建弹窗/配置参数', type: '表单', required: '是', description: '包含终端节点、Region、Bucket、Access Key、Secret Key。' },
        { name: '配置参数详情', location: '详情弹窗/配置参数', type: '只读表单', required: '否', description: '按创建页字段展示终端节点、Region、Bucket、Access Key、Secret Key，其中 Secret Key 掩码展示。' },
        { name: '集群数量', location: '列表', type: '数值', required: '否', description: '展示当前绑定的集群数量。' },
        { name: '连接状态', location: '列表', type: '状态标签', required: '否', description: '展示存储连接状态。' },
      ],
      actions: [
        { name: '新建配置', entry: '顶部按钮', precondition: '填写必填的基本信息与配置参数', successFeedback: '新增存储配置并将连接状态置为未测试', errorFeedback: '表单校验失败时保留弹窗' },
        { name: '测试连接', entry: '列表行操作', precondition: '存储存在', successFeedback: '提示连接结果', errorFeedback: '提示连接失败' },
        { name: '查看详情', entry: '列表行操作', precondition: '存储存在', successFeedback: '打开详情弹窗', errorFeedback: '提示记录不存在' },
        { name: '文件系统格式化', entry: '列表行操作', precondition: '存储存在', successFeedback: '进入格式化流程', errorFeedback: '提示操作失败' },
        { name: '删除', entry: '列表行操作', precondition: '未绑定集群且完成二次确认', successFeedback: '存储配置从列表中移除', errorFeedback: '若已绑定集群，提示“已绑定集群，不允许删除”；取消确认则不删除' },
      ],
      states: [
        { name: '可删除', meaning: '未绑定集群', presentation: '删除按钮可执行', availableActions: '测试连接、查看详情、文件系统格式化、删除' },
        { name: '不可删除', meaning: '已绑定集群', presentation: '点击删除给出限制提示', availableActions: '测试连接、查看详情、文件系统格式化' },
      ],
      interactionNotes: ['当前页已根据第二阶段截图需求补充删除按钮，并增加“已绑定集群，不允许删除”的约束，未绑定集群删除前仍需二次确认。', '搜索筛选区使用可换行布局，表格设置明确列宽与横向滚动，避免小屏下内容错位或右侧操作不可见。', '新建存储配置弹窗按用户截图调整为“基本信息”和“配置参数”两块卡片；存储类型下拉使用火山引擎 TOS、MinIO、NFS、华为云 OBS、移动云；配置参数对齐 TOS 场景字段。', '列表 mock 数据和新建数据统一使用新的存储类型；查看详情弹窗同步改为基本信息和配置参数两块卡片，Secret Key 掩码展示。'],
      productionComparison: ['本页当前以用户迭代需求为基线，不再以第一阶段生产环境拆解为默认依据。'],
      userChanges: ['根据待迭代项截图，存储管理操作区新增删除按钮，且在已绑定集群时禁止删除。', '根据用户反馈修复小屏错位和列表无法横向滑动的问题。', '根据用户截图重做新建存储配置弹窗，补齐基本信息、配置参数、TOS 参数字段与创建配置按钮。', '根据用户反馈同步列表侧存储类型、删除二次确认和详情页字段结构。', '根据本轮需求，存储类型新增移动云。'],
    }),
  },
  {
    match: pathname => pathname === '/admin/image-list',
    doc: createDoc({
      pageName: '镜像列表',
      pagePath: '/admin/image-list',
      module: '系统管理',
      status: '已基于需求演进',
      goal: '查看平台镜像列表，不在该页承担镜像仓库配置职责。',
      audience: '平台管理员',
      problem: '让镜像列表和镜像仓库配置各自独立，避免职责混杂。',
      structure: ['搜索筛选区', '镜像列表表格'],
      fields: [
        { name: '镜像名称', location: '列表', type: '文本', required: '是', description: '镜像主标识。' },
        { name: '镜像分类', location: '列表', type: '枚举', required: '否', description: '训练 / 推理 / 基础。' },
        { name: '镜像仓库', location: '列表', type: '文本', required: '否', description: '来源仓库名称。' },
      ],
      actions: [
        { name: '搜索', entry: '搜索框', precondition: '输入关键字', successFeedback: '表格按关键字过滤', errorFeedback: '无匹配时展示空态' },
      ],
      states: [
        { name: '默认', meaning: '镜像列表正常展示', presentation: '仅展示镜像列表，不展示新建配置按钮', availableActions: '搜索、查看列表' },
      ],
      interactionNotes: ['该页已根据迭代需求删除新建配置按钮。'],
      productionComparison: ['本页当前以第二阶段用户需求为基线。'],
      userChanges: ['根据待迭代项截图，镜像管理拆分为镜像列表和镜像仓库，镜像列表删除新建配置按钮。'],
    }),
  },
  {
    match: pathname => pathname === '/admin/registry',
    doc: createDoc({
      pageName: '镜像仓库',
      pagePath: '/admin/registry',
      module: '系统管理',
      status: '已基于需求演进',
      goal: '独立管理镜像仓库配置、命名空间和认证方式。',
      audience: '平台管理员',
      problem: '补齐原先缺失的镜像仓库配置页，并与镜像列表拆分。',
      structure: ['搜索筛选区', '镜像仓库表格', '新增弹窗', '详情弹窗'],
      fields: [
        { name: '仓库名称', location: '列表/表单', type: '文本', required: '是', description: '镜像仓库主标识。' },
        { name: '命名空间', location: '列表/表单', type: '文本', required: '是', description: '仓库命名空间。' },
        { name: '认证方式', location: '列表/表单', type: '枚举', required: '是', description: '用户名密码 / Token / 公开。' },
      ],
      actions: [
        { name: '新增仓库', entry: '右上角按钮', precondition: '具备管理权限', successFeedback: '仓库写入列表', errorFeedback: '表单校验失败' },
        { name: '测试连接/查看详情/删除', entry: '列表行操作', precondition: '仓库存在；未绑定集群时才可删除', successFeedback: '反馈连接结果、打开详情或二次确认后删除', errorFeedback: '已绑定集群时删除不可执行' },
      ],
      states: [
        { name: '连接正常', meaning: '镜像仓库状态正常', presentation: '绿色状态标签', availableActions: '测试连接、查看详情、删除' },
        { name: '异常', meaning: '镜像仓库状态异常', presentation: '红色状态标签', availableActions: '测试连接、查看详情、删除' },
      ],
      interactionNotes: ['该页是第二阶段新增补齐的镜像仓库配置页。', '镜像仓库按当前需求限制为全局只能创建一个，已有仓库时新增按钮置灰不可点击；删除后才可重新创建。', '删除逻辑按绑定集群状态控制：已绑定集群不可删除，未绑定集群删除前必须二次确认。', '筛选区支持换行，列表设置明确列宽与横向滚动，避免小屏内容错位或右侧操作不可见。'],
      productionComparison: ['本页当前以第二阶段用户需求为基线。'],
      userChanges: ['根据待迭代项截图，镜像管理拆分为镜像列表和镜像仓库，并补齐镜像仓库页面。', '根据本轮批注限制镜像仓库只保留单条配置，并修复页面错位和列表无法右滑问题。', '根据最新批注修正新增按钮为已有仓库时置灰，并补充绑定集群不可删、未绑定集群二次确认删除。'],
    }),
  },
  {
    match: pathname => pathname === '/admin/settings',
    doc: createDoc({
      pageName: '系统配置',
      pagePath: '/admin/settings',
      module: '系统管理',
      status: '已基于需求演进',
      goal: '管理属性配置、标签配置和文档中心 Agent 助手服务，并把平台级配置收敛在系统管理中。',
      audience: '平台管理员',
      problem: '让平台管理员既能维护基础配置，也能为文档中心配置唯一生效的全局 RAG 问答服务。',
      structure: ['属性配置 Tab', '标签配置 Tab', '标签配置左侧分组', 'Agent助手 Tab', '文档中心单目录', 'Agent服务单配置卡', 'Agent 服务配置弹窗', '标签值弹窗'],
      fields: [
        { name: '属性名称', location: '属性配置列表/弹窗', type: '文本', required: '是', description: '属性配置主名称。' },
        { name: '属性值', location: '属性配置列表/弹窗', type: '文本', required: '是', description: '当前属性的配置值；列表不再展示输入方式。' },
        { name: '属性分组', location: '属性配置列表/弹窗', type: '枚举', required: '是', description: '属性所属业务分组。' },
        { name: '标签名称', location: '标签配置列表/弹窗', type: '文本', required: '是', description: '标签主名称。' },
        { name: '标签分组', location: '标签配置左侧菜单', type: '一级选择', required: '是', description: '标签配置左侧包含模型仓库、在线Notebook等一级业务域，标签按当前业务域展示。' },
        { name: '标签值', location: '查看标签值弹窗', type: '文本列表', required: '否', description: '某个标签下的值列表。' },
        { name: 'Embedding 配置', location: 'Agent助手弹窗', type: 'API地址/API Key/模型名称', required: '是', description: '用于文档知识库向量化；修改后需提示是否重建知识库向量。' },
        { name: 'Rerank 配置', location: 'Agent助手弹窗', type: 'API地址/API Key/模型名称', required: '是', description: '用于对召回文档片段进行重排。' },
        { name: '对话模型配置', location: 'Agent助手弹窗', type: '在线推理服务或自定义 API', required: '是', description: '用于生成文档问答结果；高级配置默认收起，展开后配置 max_tokens、Temperature、Top_p、presence_penalty。' },
      ],
      actions: [
        { name: '添加属性', entry: '属性配置页按钮', precondition: '进入属性配置 Tab', successFeedback: '新增属性记录并切换到对应分组', errorFeedback: '表单校验失败' },
        { name: '添加标签', entry: '标签配置页按钮', precondition: '进入标签配置 Tab', successFeedback: '仅新增标签记录', errorFeedback: '表单校验失败' },
        { name: '查看标签值', entry: '标签行操作', precondition: '标签存在', successFeedback: '打开标签值弹窗', errorFeedback: '提示标签不存在' },
        { name: '添加标签值', entry: '标签值弹窗', precondition: '已打开某个标签值弹窗', successFeedback: '标签值加入当前标签', errorFeedback: '表单校验失败' },
        { name: '配置 Agent 服务', entry: 'Agent助手 Tab 右上角按钮', precondition: '进入文档中心目录', successFeedback: '保存唯一 Agent 服务配置并自动启动', errorFeedback: '表单校验失败或接口不可用' },
        { name: '重建索引', entry: 'Agent 服务行操作或 Embedding 修改确认弹窗', precondition: '服务存在', successFeedback: '知识库向量状态切换为已就绪', errorFeedback: '重建失败时展示构建失败状态' },
      ],
      states: [
        { name: '标签层', meaning: '仅管理标签主记录', presentation: '标签列表和添加标签按钮', availableActions: '新增、编辑、删除、查看标签值' },
        { name: '标签值层', meaning: '查看并维护某个标签的值', presentation: '弹窗列表 + 添加标签值入口', availableActions: '新增标签值、删除标签值' },
        { name: 'Agent 未配置', meaning: '尚未保存文档中心 Agent 配置', presentation: '展示空态和配置服务按钮', availableActions: '配置服务' },
        { name: 'Agent 运行中', meaning: '唯一 Agent 服务已保存并启动', presentation: '绿色运行中状态和单配置详情卡，文档中心展示 Agent 助手', availableActions: '编辑配置、测试连接、重建索引' },
      ],
      interactionNotes: ['当前页以用户迭代需求为基线。', '当前页已根据用户需求把“添加标签”和“添加标签值”拆成两层操作。', '标签配置旧结构：左侧仅在线Notebook / 自定义镜像；新结构：在线Notebook和模型仓库保持同一顶层层级，自定义镜像缩进为在线Notebook子项。', '添加属性按钮已接入新增属性弹窗，属性列表移除“输入方式”列，仅展示属性名称、属性描述、属性值、属性分组和是否必填。', 'Agent助手当前以用户迭代需求为基线，不参考生产环境；服务作用域固定为全局文档中心。', 'Agent助手左侧目录只展示一个“文档中心”，右侧标题使用“Agent服务”。', 'Agent 服务从可配置多个调整为只可配置一个；配置保存完成后即自动启动服务。', '对话模型可选择在线推理服务，也可自行配置 API；如果没有可用在线推理服务，可跳转在线推理服务创建页。', '配置弹窗底部不展示 Embedding 修改提示，只在实际保存且 Embedding 配置变化时弹窗确认是否重建向量。', '对话模型参数收进“高级配置”，默认不展开。'],
      productionComparison: ['本页当前以第二阶段用户需求为基线。'],
      userChanges: ['根据待迭代项截图，添加标签仅添加标签，新增标签值需要进入“查看标签值”后处理。', '根据本轮批注修复添加属性按钮无响应问题，并移除属性列表的输入方式字段。', '根据本轮需求新增 Agent助手 Tab：在文档中心目录下配置全局 Agent 服务，拆分 Embedding、Rerank 和对话模型配置，并接入最小 RAG 接口契约。', '根据浏览器批注删除 Agent 页左侧“标签配置”标题，左侧只展示一个文档中心，右侧改为单 Agent 服务配置卡并解决表格列重叠。', '根据本轮批注，Agent 页顶部说明改为功能描述，对话模型参数改为默认收起的高级配置，并删除弹窗底部 Embedding 提示卡。', '根据本轮需求，标签配置左侧新增模型仓库一级选择，模型仓库标签与在线Notebook标签按业务域分组展示。', '根据本轮反馈，左侧调整为在线Notebook和模型仓库同级，自定义镜像作为在线Notebook子项。'],
    }),
  },
  {
    match: pathname => pathname === '/machine-model-deployment' || pathname.startsWith('/machine-model-deployment/'),
    doc: createDoc({
      pageName: '模型部署',
      pagePath: '/machine-model-deployment',
      module: '机器学习',
      status: '开发中',
      goal: '管理机器学习模型的标准部署与自定义部署能力，并保证基础信息一致可追踪。',
      audience: '机器学习工程师、算法工程师',
      problem: '让不同部署方式在创建页都能保留统一的模型来源、模型和版本上下文。',
      structure: ['部署列表', '标准/自定义部署切换', '基本信息卡', '环境/资源配置卡', '部署详情弹层'],
      fields: [
        { name: '服务名称', location: '创建页/列表', type: '文本', required: '是', description: '部署服务主名称。' },
        { name: '模型来源', location: '创建页基本信息', type: '只读字段', required: '是', description: '当前统一固定为模型管理。' },
        { name: '模型与版本', location: '创建页基本信息', type: '级联选择', required: '是', description: '标准部署与自定义部署都需要保留相同的模型上下文。' },
        { name: '环境信息', location: '标准部署创建页', type: '镜像配置 + 固定命令 + Python 文件来源', required: '是', description: '标准部署补齐系统/自定义镜像切换、固定运行命令、本地上传/Notebook获取与 Python 文件选择。' },
      ],
      actions: [
        { name: '创建部署', entry: '创建按钮', precondition: '基础信息和资源信息填写完整', successFeedback: '部署记录加入列表', errorFeedback: '表单校验失败或 JSON 配置错误' },
        { name: '查看访问信息', entry: '列表操作', precondition: '部署记录存在', successFeedback: '打开详情弹层', errorFeedback: '提示记录不存在' },
      ],
      states: [
        { name: '标准部署', meaning: '基于模型管理中的模型快速部署', presentation: '展示标准部署配置表单', availableActions: '创建、编辑、查看' },
        { name: '自定义部署', meaning: '基于镜像和自定义命令部署', presentation: '展示自定义环境配置表单', availableActions: '创建、编辑、查看' },
      ],
      interactionNotes: ['即使选择自定义部署，基本信息区域仍需保留模型来源和模型/版本选择。', '标准部署的环境信息位于资源信息上方；运行命令固定不可编辑，镜像配置和部署实例数都放在环境信息内。', '自定义部署环境信息需要直接展示部署实例数。', '创建/编辑页提交时如果存在未填写必填项，需要自动滚动并聚焦到首个错误字段，同时提示用户补充必填项。'],
      productionComparison: ['当前页以第二阶段用户评论和迭代要求为基线。'],
      userChanges: ['根据用户最新评论，自定义部署创建页补齐模型来源与模型/版本字段，并与标准部署保持一致。', '根据本轮批注，标准部署补齐环境信息、部署实例数与二级镜像选择。', '根据本轮批注，标准部署镜像移入环境信息并增加系统/自定义镜像切换，自定义部署环境信息补部署实例数。', '根据本轮批注，标准部署环境信息与资源信息互换位置，部署实例数只放在环境信息中。'],
    }),
  },
  {
    match: pathname => pathname === '/machine-annotation' || pathname.startsWith('/machine-annotation/'),
    doc: createDoc({
      pageName: '数据标注',
      pagePath: '/machine-annotation',
      module: '机器学习',
      status: '已对齐生产环境',
      goal: '提供机器学习数据的在线标注与多人协同标注能力，并按任务总览、标注任务、审核任务拆分多人协作视图。',
      audience: '算法工程师、标注人员、审核人员',
      problem: '原页面只保留简化列表，没有体现生产环境中多人标注的发布、成员分配、标注进度和审核进度管理。',
      structure: ['在线标注 Tab', '多人标注 Tab', '在线标注整页详情/标注页', '多人标注任务总览', '标注任务子列表', '审核任务子列表', '独立创建页', '标注工作台', '审核工作台', '任务成员弹窗', '详情弹窗'],
      fields: [
        { name: '标注任务', location: '多人标注任务总览', type: '文本', required: '是', description: '多人标注任务主名称，列表支持在字段旁悬浮显示编辑入口并行内编辑。' },
        { name: '任务描述', location: '在线标注/多人标注列表', type: '长文本', required: '否', description: '标注任务补充说明，编辑入口悬浮显示且不受任务状态影响。' },
        { name: '数据量', location: '列表/创建页', type: '数值', required: '是', description: '当前任务需要处理的数据条数。' },
        { name: '标注进度', location: '任务总览/标注任务', type: '进度条', required: '否', description: '展示标注成员整体或个人完成比例。' },
        { name: '审核进度', location: '任务总览/审核任务', type: '进度条', required: '否', description: '展示审核成员整体或个人完成比例。' },
        { name: '标注成员/审核成员', location: '创建页/任务成员弹窗', type: '成员选择', required: '是', description: '用于多人协同分工与审核抽检。' },
        { name: '标注前/后数据集', location: '标注任务列表/标注工作台', type: '文本', required: '是', description: '与生产环境标注任务列表保持一致，用于判断处理前后的数据版本。' },
        { name: '标注类型', location: '审核任务列表/审核工作台', type: '文本', required: '是', description: '与生产环境审核任务列表保持一致，用于区分图像分类、文本分类等审核类型。' },
        { name: '在线标注创建字段', location: '在线标注创建弹窗', type: '表单', required: '是', description: '包含任务名称、数据类型、数据选择、选择数据集、数据量和处理后数据集，不再使用简化的标注工具下拉。' },
      ],
      actions: [
        { name: '创建标注任务', entry: '多人标注任务总览右上角按钮', precondition: '当前用户为项目管理员或平台管理员，并进入任务总览', successFeedback: '进入独立创建页并完成任务配置', errorFeedback: '普通成员不展示入口，直接访问创建页时展示无权限提示' },
        { name: '发布', entry: '任务总览行操作', precondition: '任务处于未发布状态', successFeedback: '任务进入已完成状态', errorFeedback: '已完成任务禁用发布入口' },
        { name: '查看任务成员', entry: '任务总览行操作', precondition: '任务存在成员配置', successFeedback: '打开成员弹窗展示标注与审核成员', errorFeedback: '无成员时展示空态' },
        { name: '进入标注', entry: '标注任务行操作', precondition: '当前用户可见该标注分配任务', successFeedback: '进入标注工作台处理样本、选择标签并通过右上角完成标注保存当前条', errorFeedback: '任务不存在或无权限时展示未找到任务' },
        { name: '进入审核', entry: '审核任务行操作', precondition: '当前用户可见该审核分配任务', successFeedback: '进入审核工作台查看样本并提交通过或驳回意见', errorFeedback: '任务不存在或无权限时展示未找到任务' },
        { name: '删除单条标注数据', entry: '在线标注详情页/多人标注工作台', precondition: '任务未提交且不是已完成状态', successFeedback: '二次确认后删除当前数据并切换到下一条', errorFeedback: '已提交或已完成时按钮禁用或提示不可删除' },
        { name: '平均分配/统一时间', entry: '创建页成员表头', precondition: '已添加成员并选择数据集', successFeedback: '批量更新成员分配数量或截止时间', errorFeedback: '未添加成员时保持空态' },
      ],
      states: [
        { name: '未发布', meaning: '任务已创建但尚未发布', presentation: '状态为未发布，可删除，发布入口按当前规则展示', availableActions: '详情、任务成员、删除' },
        { name: '已完成', meaning: '任务已完成并产出可用结果', presentation: '状态为已完成，删除按钮禁用', availableActions: '详情、任务成员' },
        { name: '任务子列表', meaning: '查看标注或审核成员维度的任务分配', presentation: '项目管理员可查看全量成员任务；普通成员仅查看自己领取到的标注/审核任务', availableActions: '查看任务执行情况' },
        { name: '普通成员视图', meaning: '当前用户不是项目管理员或平台管理员', presentation: '不展示任务总览 Tab；标注任务和审核任务不展示创建标注任务按钮', availableActions: '处理本人标注任务、处理本人审核任务' },
        { name: '标注工作台', meaning: '处理从标注任务列表进入的单个分配任务', presentation: '展示任务基础信息、样本列表、待处理数据和标签录入区', availableActions: '上一条、完成标注' },
        { name: '审核工作台', meaning: '处理从审核任务列表进入的单个审核分配任务', presentation: '展示任务基础信息、样本列表、待处理数据和审核意见区', availableActions: '上一条、保存、完成审核' },
      ],
      interactionNotes: ['本轮明确重新参考生产环境机器学习数据标注页。', '在线标注列表的详情入口进入整页标注详情，而不是普通详情弹窗；详情页展示任务基本信息，并根据标注类型分流到不同工作台。', '根据用户本轮 5 张截图，在线标注详情统一改成生产环境式工作台壳：顶部返回 + 标注配置 + AI自动标注 + 完成标注，左侧固定标签栏，底部固定分页和提交标注按钮。', '在线标注、标注任务、审核任务处理路由采用沉浸式标注页，隐藏全局顶栏、侧栏和需求文档浮层，避免截图中的标注画布被业务壳层挤压。', '左侧标签栏支持搜索、新增、编辑、删除和当前标签选择；不同标注类型使用不同默认标签集。', '底部分页遵循一页一条数据语义，样本数与任务数据量一致；完成当前数据后自动切换下一条，全部数据完成前提交标注按钮保持禁用。', '标注配置按钮打开配置弹窗，记录标注类型、标签数量、当前标签和一页一条的操作规则；AI自动标注会生成当前标签建议。', '在线标注详情任务信息从高密度 Descriptions 表格调整为自适应字段网格，避免右侧文档展开或窄屏时字段名竖排。', '在线标注详情已拆分文本分类、实体识别、图像分类、物体检测、图像分割五类工作台：文本分类展示生产环境表格式序号/文本/标注结果；实体识别展示中间文本实体区与右侧可用标签/已标注实体；图像分类展示图片区域与单选/多选标签结果；物体检测展示矩形框画布、区域信息和标签图例；图像分割展示多边形分割画布、区域信息和标签图例。', '本轮排查修复标注操作不生效问题：标签栏、下拉框、AI 自动标注、完成标注、删除当前数据和提交标注都会写入当前样本状态；完成标注即保存当前条并自动跳到下一条未完成数据，全部完成后才允许提交并锁定。', '多人标注的标注任务入口复用在线标注五类工作台，不再回退到旧的静态三栏页；审核任务入口补齐审核通过/驳回原因、保存审核、完成审核和提交审核的状态闭环。', '物体检测和图像分割保留本地 mock 画布工具栏，覆盖框选/多边形、缩放、拖拽、删除等可见操作入口，并补充新增框/新增区域、删除当前框/区域的本地交互。', '文本分类在线标注区采用一个整体工作台卡片，内部三栏承载数据列表、文本内容和标签选择，避免拆成多个卡片后右侧标注区被挤出。', '在线标注与多人标注工作台均在操作区显式提供“删除当前数据”，未提交可删，已提交或已完成锁定不可删。', '多人标注从单一列表补齐为任务总览、标注任务、审核任务三个子视图。', '任务总览仅面向项目管理员/平台管理员；普通成员不展示该 Tab。', '标注任务和审核任务按当前用户领取到的任务展示，且不展示创建标注任务按钮。', '标注任务和审核任务列表存在数据时，行操作必须进入对应标注或审核工作台。', '创建多人标注任务采用独立路由 /machine-annotation/create，而不是普通弹窗。', '创建页保留基本信息、数据选择、处理后数据集、选择标注成员、选择审核成员五个区域。', '在线标注创建弹窗需要对齐生产环境创建流程：通过数据类型过滤可选数据集，选择数据集使用输入框加选择按钮，选择后展示数据量、标注类型和处理后数据集。', '在线标注、多人标注及创建页成员表均设置横向滚动容器和表格滚动宽度，窄屏或右侧需求文档展开时不得挤压重叠；任务名称、数据集名称使用省略并可通过横向滚动查看完整列。', '机器学习在线标注与多人标注任务总览的名称列和描述列统一接入字段级行内编辑，编辑入口仅在鼠标悬浮对应字段时展示，点击后当前字段变为输入框。', '演示数据需要覆盖文本分类、实体识别、图像分类、物体检测、图像分割等不同标注任务类型。'],
      productionComparison: ['已按生产环境确认：多人标注总览列包含标注任务、数据量、状态、标注进度、审核进度、创建人、创建时间、操作。', '已按生产环境确认：任务总览操作包含发布、详情、任务成员、删除；当前按用户批注将状态收敛为未发布和已完成。', '已按生产环境确认：标注任务列表列包含任务名称、数据量、标注进度、标注前数据集、标注后数据集、创建人、创建时间、操作。', '已按生产环境确认：审核任务列表列包含标注任务、标注类型、数据量、审核进度、创建人、截止时间、操作。', '生产环境当前账号标注任务/审核任务为空，行操作文案按业务语义采用标注/审核。', '已按生产环境确认：创建页提供平均分配、统一时间、抽检比例与成员添加能力。'],
      userChanges: ['根据用户本轮要求，机器学习多人标注重新阅读生产环境并补充开发。', '根据浏览器批注，任务总览仅给项目管理员，普通成员只看自己领取到的标注任务和审核任务，创建按钮仅保留在管理员任务总览。', '根据本轮批注，标注任务和审核任务列表补齐行操作入口，并进入对应标注或审核工作台。', '根据本轮需求，机器学习在线标注详情改为整页标注页，和多人标注/审核工作台一起支持删除当前单条数据；任务提交或已完成后不允许删除。', '根据本轮计划，在线标注详情按 annotationType 拆为五种可见差异化工作台，并补充图像分割演示任务。', '根据本轮截图，在线标注详情重构为生产环境式顶部操作、左侧标签栏、类型化内容区、右侧信息面板和底部分页/提交结构。', '根据本轮反馈，修复机器学习标注列表列重叠和横向不可滑动问题，并补充多类型演示任务数据。', '根据本轮批注，在线标注创建弹窗去掉标注工具字段，改为生产环境式的数据类型、数据选择、数据集选择、数据量和处理后数据集配置。', '根据本轮状态批注，机器学习数据标注状态只保留未发布和已完成，在线标注与多人标注总览统一展示。', '根据本轮详情页批注，在线标注详情字段区改为自适应网格，文本分类标注区改为一个整体工作台卡片。', '根据本轮全局编辑反馈，机器学习标注的在线标注列表和多人标注任务总览补齐名称与描述字段级行内编辑，且不受未发布/已完成状态影响。', '根据本轮发布态需求，机器学习数据标注创建仅展示已发布数据集；任务未提交/未完成前仍允许删除当前单条数据，提交或已完成后锁定。'],
      recentChanges: [
        {
          date: '2026-05-08',
          change: '补齐标注/审核任务处理入口',
          reason: '浏览器批注指出标注任务或审核任务列表有数据时，对应操作需要进入标注或审核',
          scope: '多人标注子列表列结构、行操作、标注工作台、审核工作台和路由',
        },
        {
          date: '2026-05-08',
          change: '调整多人标注角色视图',
          reason: '浏览器批注指出任务总览是项目管理员视图，普通成员不应看到任务总览和创建入口',
          scope: '多人标注 Tab 权限、成员任务过滤、创建入口显示规则',
        },
        {
          date: '2026-05-08',
          change: '补齐机器学习多人标注生产环境结构',
          reason: '用户指出多人标注没有按生产环境设计，需要参考生产环境补充开发',
          scope: '机器学习数据标注列表、多人标注子视图、创建页与页面内嵌设计文档',
        },
      ],
    }),
  },
  {
    match: pathname => pathname === '/machine-annotation-service' || pathname === '/machine-online-annotation-service',
    doc: createDoc({
      pageName: '在线标注服务',
      pagePath: '/machine-annotation-service',
      module: '机器学习',
      status: '开发中',
      goal: '管理机器学习在线标注服务，承接标注任务中的服务化能力。',
      audience: '机器学习工程师、标注运营',
      problem: '让在线标注服务的连接状态、目标数据集和引用关系可见。',
      structure: ['服务列表', '创建服务入口', '行级停止/查看/删除操作'],
      fields: [
        { name: '服务名称', location: '列表', type: '文本', required: '是', description: '在线标注服务主名称，列表支持在字段旁悬浮显示编辑入口并行内编辑。' },
        { name: '描述', location: '列表', type: '文本', required: '否', description: '服务补充说明，编辑入口悬浮显示且不受运行状态影响。' },
        { name: '目标数据集', location: '列表', type: '文本', required: '是', description: '服务当前关联的数据集。' },
      ],
      actions: [
        { name: '停止服务', entry: '列表行操作', precondition: '服务运行中', successFeedback: '状态切换为已停止', errorFeedback: '非运行中禁用' },
        { name: '删除服务', entry: '列表行操作', precondition: '服务未运行且未被引用', successFeedback: '二次确认后删除', errorFeedback: '运行中或被引用时提示原因' },
      ],
      states: [
        { name: '运行中', meaning: '服务可用于标注', presentation: '绿色状态标签', availableActions: '停止、查看详情' },
        { name: '已停止', meaning: '服务不可用', presentation: '默认状态标签', availableActions: '查看详情、删除' },
      ],
      interactionNotes: ['当前页以用户迭代需求为基线。', '在线标注服务列表名称列和描述列统一接入字段级行内编辑，编辑入口仅在鼠标悬浮对应字段时展示，点击后当前字段变为输入框。'],
      productionComparison: ['当前生产环境未提供稳定独立入口，本页作为机器学习标注服务化能力的受控实现。'],
      userChanges: ['根据本轮全局编辑反馈，在线标注服务补齐服务名称与描述字段级行内编辑，且不受运行中/已停止状态影响。'],
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
  if (pathname === GLOBAL_DESIGN_DOC_PATH) {
    return doc
  }

  const routeTitleMap: Record<string, { pageName: string; module?: string }> = {
    '/workspace': { pageName: '项目空间', module: '项目空间' },
    '/service/inference/hosted': { pageName: '大模型部署' },
    '/service/inference/external': { pageName: '在线推理服务' },
    '/machine-data-management': { pageName: '数据管理', module: '机器学习' },
    '/machine-annotation': { pageName: '数据标注', module: '机器学习' },
    '/machine-model-management': { pageName: '模型管理', module: '机器学习' },
    '/machine-model-deployment': { pageName: '模型部署', module: '机器学习' },
    '/machine-notebook': { pageName: '在线 Notebook', module: '机器学习' },
    '/machine-annotation-service': { pageName: '在线标注服务', module: '机器学习' },
    '/machine-online-annotation-service': { pageName: '在线标注服务', module: '机器学习' },
    '/admin/projects': { pageName: '项目管理' },
    '/admin/kubernetes': { pageName: '集群管理' },
    '/admin/storage': { pageName: '存储配置' },
    '/admin/image-list': { pageName: '镜像列表' },
    '/admin/registry': { pageName: '镜像仓库' },
    '/admin/base-model': { pageName: '模型仓库' },
    '/admin/settings': { pageName: '系统配置' },
    '/admin/permissions': { pageName: '权限配置' },
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
  if (pathname === GLOBAL_DESIGN_DOC_PATH) {
    return globalDesignDoc
  }

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

export function getAllPageDesignDocs(): PageDesignDoc[] {
  const seen = new Set<string>()

  return [globalDesignDoc, ...pageDocs.map(item => item.doc)]
    .filter(doc => doc.pagePath.startsWith('/') && !doc.pagePath.includes('*'))
    .filter(doc => {
      if (seen.has(doc.pagePath)) {
        return false
      }
      seen.add(doc.pagePath)
      return true
    })
    .map(doc => customizeDocForPath(doc.pagePath, doc))
}
