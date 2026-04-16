# 模块开发执行模板

## 1. 本轮开发任务
- 模块名称：数据服务 - 共享数据层与跨页面状态
- 目标页面/功能：训练数据管理、测试数据管理、推理结果集、数据标注、数据清洗
- 对应生产环境模块：数据服务标准链路
- 本轮任务类型：补齐 / 前端内数据层治理
- 优先级：P0
- 是否涉及用户新增/修改需求：否
- 本轮是“纯对齐生产环境”还是“基于生产环境演进”：纯对齐生产环境
- 是否涉及页面内嵌设计文档能力：否，仅补文档映射

## 2. 开发前确认
### 2.1 本轮依据
- 生产环境对应结论：
  - 数据服务五个标准页面共用数据实体和上下游关系
  - 数据标注、数据清洗会消费训练/测试数据集
  - 推理结果集会消费测试/验证数据集
- 当前代码现状：
  - 页面结构已开始对齐，但仍是各页面各自维护孤立 mock
- RPD/PRD 修正后理解：
  - 当前阶段需要补最小可运行数据层，而不是继续堆页面壳子
- 用户新增/修改需求结论：无
- 页面内嵌设计文档结论：
  - 只需要确保新路由仍能命中文档映射

### 2.2 范围边界
- 本轮允许修改的范围：
  - `src/services/dataServiceStore.ts`
  - `src/pages/Data/*`
  - `src/docs/pageDocs.ts`
- 本轮禁止修改的范围：
  - 受保护的大模型训练模块
  - 非标准功能模块
- 是否涉及受保护模块“模型训练 - 大模型训练”：否
- 是否涉及非标准功能：否

---

## 3. 差异与目标

### 3.1 当前差异
| 项目 | 当前实现 | 生产环境表现 | 用户目标 | 设计文档要求 | 差异说明 | 本轮是否处理 |
|---|---|---|---|---|---|---|
| 数据服务数据源 | 每个页面各自维护 `useState(mock)` | 生产环境显然共用同一后端数据 | 建立统一数据层 | 新路由保持文档映射 | 当前状态孤立，跨页不一致 | 是 |
| 数据标注数据选择 | 静态写死选项 | 来自平台已有数据集 | 至少复用同一前端数据源 | 无 | 当前和数据管理脱节 | 是 |
| 数据清洗数据选择 | 静态写死选项 | 来自平台已有数据集 | 至少复用同一前端数据源 | 无 | 当前和数据管理脱节 | 是 |
| 推理结果待推理数据 | 静态写死选项 | 来自测试/验证数据集 | 至少复用同一前端数据源 | 无 | 当前和数据管理脱节 | 是 |

### 3.2 本轮目标
- 目标 1：建立统一的数据服务仓储与本地持久化
- 目标 2：让数据标注、数据清洗、推理结果集开始复用真实的前端共享数据源
- 目标 3：让数据集新增、版本新增、删除、任务新增能跨路由保持一致

---

## 4. 方案设计

### 4.1 页面与交互方案
- 页面结构不做大改，重点补共享数据行为
- 路由保持上一轮已对齐的独立路径
- 页面之间通过统一仓储同步数据，而非 props 或重复 mock

### 4.2 前端实现方案
- 新增统一仓储：
  - [dataServiceStore.ts](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/services/dataServiceStore.ts)
- 技术方案：
  - `useSyncExternalStore` 订阅
  - `localStorage` 持久化
  - 统一 `actions` 管理创建、删除、版本新增
- 接入页面：
  - [TrainingDataset.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/TrainingDataset.tsx)
  - [TestDataset.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/TestDataset.tsx)
  - [InferenceResult.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/InferenceResult.tsx)
  - [DataAnnotation.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/DataAnnotation.tsx)
  - [DataCleaning.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/DataCleaning.tsx)

### 4.3 后端实现方案
- 本轮仍未补真实后端
- 但仓储接口已经把后续后端迁移边界抽出来

### 4.4 数据与对象设计
- 统一状态对象：
  - `trainingDatasets`
  - `validationDatasets`
  - `testDatasets`
  - `inferenceResults`
  - `annotationTasks`
  - `cleaningTasks`
- 统一动作：
  - `createDataset`
  - `addDatasetVersion`
  - `deleteDataset`
  - `createInferenceResult`
  - `deleteInferenceResult`
  - `createAnnotationTask`
  - `deleteAnnotationTask`
  - `createCleaningTask`
  - `deleteCleaningTask`

---

## 5. 实际修改计划

### 5.1 前端修改项
- 文件/模块：[dataServiceStore.ts](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/services/dataServiceStore.ts)
- 修改目的：建立统一数据服务仓储
- 关键变更点：增加种子数据、本地持久化、订阅与 actions

- 文件/模块：[TrainingDataset.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/TrainingDataset.tsx)
- 修改目的：接入共享数据源
- 关键变更点：训练/验证数据改为从仓储读取，创建/新增版本/删除改为走 actions

- 文件/模块：[TestDataset.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/TestDataset.tsx)
- 修改目的：接入共享数据源
- 关键变更点：测试数据改为从仓储读取，创建/新增版本/删除改为走 actions

- 文件/模块：[InferenceResult.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/InferenceResult.tsx)
- 修改目的：接入共享数据源
- 关键变更点：推理结果集改为从仓储读取；待推理数据选项来自测试/验证数据集

- 文件/模块：[DataAnnotation.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/DataAnnotation.tsx)
- 修改目的：接入共享数据源
- 关键变更点：数据选择改为来自训练/验证/测试数据集；任务列表改为仓储数据

- 文件/模块：[DataCleaning.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/DataCleaning.tsx)
- 修改目的：接入共享数据源
- 关键变更点：数据选择改为来自训练/测试数据集；任务列表改为仓储数据

### 5.2 文档修正项
- 文件/模块：[pageDocs.ts](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/docs/pageDocs.ts)
- 修改目的：保证新路径仍能命中文档定义

---

## 6. 实际开发结果

### 6.1 已完成内容
- 新增统一数据服务仓储与本地持久化
- 训练数据、测试数据、推理结果集已改为共享数据源
- 数据标注、数据清洗已开始复用数据管理中的数据集
- 推理结果集创建页的待推理数据选项开始来自真实共享数据

### 6.2 实际代码改动摘要
- 前端：已修改
- 后端：未修改
- 接口：未修改
- 数据结构：已统一到仓储层
- 文档：补充本文件

### 6.3 与原计划的偏差
- 偏差点：
  - 仍未实现真实后端
- 原因：
  - 仓库当前没有后端工程，先补最小可运行数据层
- 对结果的影响：
  - 当前已实现跨路由持久与跨页面共享，但仍属于前端本地仓储

---

## 7. 自检结果

### 7.1 页面与流程自检
- 页面是否可访问：构建通过
- 路由是否正确：是
- 列表是否正常：是
- 创建是否正常：已接 actions
- 详情是否正常：是
- 关键操作是否闭环：前端本地闭环

### 7.2 前后端联调自检
- 接口是否通畅：无真实接口
- 数据是否正确回显：共享仓储下可回显
- 提交后结果是否正确：是，能跨路由保持

### 7.3 一致性自检
- 哪些地方已与生产环境对齐：
  - 数据服务五页开始共享同一数据源
  - 数据标注/清洗/推理结果开始引用数据集实体
- 哪些地方仍有偏差：
  - 没有真实后端
  - 没有完整任务状态机和详情数据内容

### 7.4 范围自检
- 是否误改受保护模块：否
- 是否误增强非标准功能：否

### 7.5 工程自检
- 是否可运行：是
- 是否可构建：是
- 是否具备部署条件：仍否
- 是否存在临时 mock 未标记：是，仓储种子数据本质仍是 mock

---

## 8. 下一步建议
- 下一优先模块：数据服务真实后端契约
- 原因：当前结构和共享数据层已具备，继续留在前端本地仓储收益开始下降
- 建议先处理前端还是后端：先补后端边界，再回填前端请求层

