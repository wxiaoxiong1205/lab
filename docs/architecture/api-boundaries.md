# API Boundaries

## 当前定位

当前项目采用“前端服务层 + 最小本地后端 + 页面级本地数据”的混合边界，不是统一完整后端。

这不是缺陷，而是当前阶段的现实约束：

- 一部分模块已经具备较清晰的服务边界
- 一部分模块还处于页面级或模块级本地实现

因此第二阶段的原则不是“假装已有完整后端”，而是持续把高频模块往稳定边界上收敛。

## 数据服务模块的接口边界

当前最清晰的接口层在数据服务模块。

### 前端服务入口

- [dataServiceApi.ts](../../fastdata-llm-training/src/services/dataServiceApi.ts)

负责：

- 数据集列表查询
- 推理结果查询
- 标注任务查询
- 清洗任务查询
- 数据集创建 / 新增版本 / 删除
- 推理结果创建 / 删除 / 启动 / 终止
- 标注任务创建 / 删除
- 清洗任务创建 / 删除 / 启动

### 前端共享仓储

- [dataServiceStore.ts](../../fastdata-llm-training/src/services/dataServiceStore.ts)

负责：

- 本地状态基线
- 本地持久化
- 无后端时的回退写入能力

### 本地最小后端

- [dataServiceServer.mjs](../../fastdata-llm-training/server/dataServiceServer.mjs)
- [data-service-db.json](../../fastdata-llm-training/server/data-service-db.json)

负责：

- 基础 HTTP 路由
- JSON 文件读写
- 最小分页与筛选

## 当前接口设计决策

### 1. 页面不直接依赖 store action

页面应优先调用 `dataServiceApi`，而不是直接写 `dataServiceActions`。

这样做的好处：

- 页面不感知后端是否存在
- API 层可优先尝试远端请求，失败后再回退本地 store
- 后续替换成真实后端时，页面层改动最小

### 2. 查询逻辑集中在 API 层

列表页的：

- 搜索
- 筛选
- 分页

都优先收敛到 API 层，而不是每页各写一套。

### 3. 本地后端只解决高频链路

当前并不是所有模块都接本地后端，只有数据服务先落地最小 HTTP 服务。

这是一种“从核心链路开始收敛边界”的策略，而不是要求整个系统一次性补齐真实后端。

## 当前接口清单

### Snapshot

- `GET /api/data-service/snapshot`

用途：

- 前端启动时把本地后端的完整快照拉回共享状态

### Datasets

- `GET /api/data-service/datasets/:kind`
- `POST /api/data-service/datasets/:kind`
- `POST /api/data-service/datasets/:kind/:id/versions`
- `DELETE /api/data-service/datasets/:kind/:id`

其中 `kind` 为：

- `training`
- `validation`
- `test`

### Inference Results

- `GET /api/data-service/inference-results`
- `POST /api/data-service/inference-results`
- `DELETE /api/data-service/inference-results/:id`
- `POST /api/data-service/inference-results/:id/start`
- `POST /api/data-service/inference-results/:id/terminate`

### Annotation Tasks

- `GET /api/data-service/annotation-tasks`
- `POST /api/data-service/annotation-tasks`
- `DELETE /api/data-service/annotation-tasks/:id`

### Cleaning Tasks

- `GET /api/data-service/cleaning-tasks`
- `POST /api/data-service/cleaning-tasks`
- `DELETE /api/data-service/cleaning-tasks/:id`
- `POST /api/data-service/cleaning-tasks/:id/start`

## 当前限制

- 仅数据服务模块有较完整 API 边界
- 其余模块大量仍停留在页面内 mock 或本地状态
- 权限系统目前是纯前端状态层，没有服务端鉴权接口

## 后续建议

### 优先继续收敛的边界

1. 权限 / 项目上下文
2. 系统管理高频页面
3. 项目空间项目列表

### 推荐策略

- 先形成稳定前端服务层
- 再决定是否为该模块引入本地最小后端
- 最后再考虑接真实后端
