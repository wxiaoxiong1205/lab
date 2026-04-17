> 归档说明：本文件属于第一阶段历史材料，仅供背景回溯，不作为第二阶段默认执行依据。

# 模块开发执行模板

## 1. 本轮开发任务
- 模块名称：数据服务 - API 契约层收敛
- 目标页面/功能：训练数据管理、测试数据管理、推理结果集、数据标注、数据清洗
- 对应生产环境模块：数据服务标准链路
- 本轮任务类型：补齐 / 前端接口层治理
- 优先级：P0
- 是否涉及用户新增/修改需求：否
- 本轮是“纯对齐生产环境”还是“基于生产环境演进”：纯对齐生产环境
- 是否涉及页面内嵌设计文档能力：否

## 2. 开发前确认
### 2.1 本轮依据
- 当前代码现状：
  - 已有共享数据仓储，但页面仍直接依赖 store actions
- 目标：
  - 增加面向未来真实后端的 API 契约层
  - 让页面通过 API 层读写数据

### 2.2 范围边界
- 本轮允许修改的范围：
  - `src/services/dataServiceApi.ts`
  - `src/pages/Data/*`
- 本轮禁止修改的范围：
  - 受保护训练模块
  - 非标准功能

---

## 3. 差异与目标

### 3.1 当前差异
| 项目 | 当前实现 | 目标实现 | 差异说明 | 本轮是否处理 |
|---|---|---|---|---|
| 页面写操作 | 直接调用 store actions | 通过统一 API 层 | 缺少接口边界 | 是 |
| 页面读操作 | 直接使用底层 store hook | 通过 API 层导出的 snapshot/selectors | 缺少稳定读模型 | 是 |
| 页面选项构造 | 各页自行拼装 | API 层统一 selector 构造 | 逻辑重复 | 是 |

### 3.2 本轮目标
- 新增 `dataServiceApi.ts`
- 页面不再直接调用 `dataServiceActions`
- 数据标注/清洗/推理结果的选项拼装统一收口

---

## 4. 方案设计

### 4.1 前端实现方案
- 新增 API 层文件：
  - [dataServiceApi.ts](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/services/dataServiceApi.ts)
- 核心能力：
  - `useDataServiceSnapshot`
  - `selectDatasets`
  - `selectInferenceResults`
  - `selectAnnotationTasks`
  - `selectCleaningTasks`
  - `buildAnnotationDatasetOptions`
  - `buildCleaningDatasetOptions`
  - `buildInferencePendingDatasetOptions`
  - `dataServiceApi.*` 异步写接口
- 页面切换策略：
  - 页面仍保持现有结构
  - 读写路径统一走 API 层
  - 提交按钮补 `loading`

### 4.2 后端实现方案
- 本轮仍未引入真实后端
- 但 API 层已形成后续替换真实请求的接口边界

---

## 5. 实际修改计划

### 5.1 前端修改项
- [dataServiceApi.ts](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/services/dataServiceApi.ts)
  - 新增正式 API/selector 层
- [TrainingDataset.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/TrainingDataset.tsx)
  - 改为通过 API 层读写训练/验证数据
- [TestDataset.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/TestDataset.tsx)
  - 改为通过 API 层读写测试数据
- [InferenceResult.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/InferenceResult.tsx)
  - 改为通过 API 层读写推理结果集
- [DataAnnotation.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/DataAnnotation.tsx)
  - 改为通过 API 层读取任务与候选数据集
- [DataCleaning.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/pages/Data/DataCleaning.tsx)
  - 改为通过 API 层读取任务与候选数据集

---

## 6. 实际开发结果

### 6.1 已完成内容
- 新增数据服务 API/selector 层
- 数据服务五页已切换到 API 层
- 关键创建按钮增加了提交 loading

### 6.2 实际代码改动摘要
- 前端：已修改
- 后端：未修改
- 接口：新增前端 API 契约层
- 数据结构：沿用 round2 仓储结构

---

## 7. 自检结果
- `npm run build` 通过
- 页面不再直接依赖底层 `dataServiceActions`
- 当前仍是前端本地持久层，不是真实后端

---

## 8. 下一步建议
- 下一优先模块：数据服务真实请求层 / mock-server 或真实后端
- 原因：当前接口边界已具备，继续留在组件内部重构价值有限
