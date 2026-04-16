# 模块开发执行模板

## 1. 本轮开发任务
- 模块名称：数据服务 - 最小后端契约与代理接入
- 目标页面/功能：数据服务五页的 HTTP 接口边界
- 对应生产环境模块：数据服务标准链路
- 本轮任务类型：补齐 / 前后端一体化
- 优先级：P0
- 是否涉及用户新增/修改需求：否
- 本轮是“纯对齐生产环境”还是“基于生产环境演进”：纯对齐生产环境
- 是否涉及页面内嵌设计文档能力：否

## 2. 本轮依据
- 当前前端已具备共享仓储和 API 层
- 下一步应补最小后端契约，否则页面仍停留在浏览器本地缓存

---

## 3. 实施内容

### 3.1 后端与接口
- 新增本地 JSON 数据库：
  - [data-service-db.json](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/server/data-service-db.json)
- 新增最小 Node HTTP API：
  - [dataServiceServer.mjs](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/server/dataServiceServer.mjs)
- 提供接口：
  - `GET /api/data-service/snapshot`
  - `POST /api/data-service/datasets/:kind`
  - `POST /api/data-service/datasets/:kind/:id/versions`
  - `DELETE /api/data-service/datasets/:kind/:id`
  - `POST /api/data-service/inference-results`
  - `DELETE /api/data-service/inference-results/:id`
  - `POST /api/data-service/annotation-tasks`
  - `DELETE /api/data-service/annotation-tasks/:id`
  - `POST /api/data-service/cleaning-tasks`
  - `DELETE /api/data-service/cleaning-tasks/:id`

### 3.2 前端接入
- [dataServiceApi.ts](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/services/dataServiceApi.ts)
  - 新增 HTTP 请求逻辑
  - 请求失败时自动回退到本地 store
  - 写接口优先走后端，成功后以快照替换前端缓存
- [App.tsx](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/src/App.tsx)
  - 启动时调用后端 bootstrap，同步 `/snapshot`
- [vite.config.ts](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/vite.config.ts)
  - 新增 `/api` -> `http://127.0.0.1:5203` 代理
- [package.json](/Users/daxiong/Desktop/lab-coding/fastdata-llm-training/package.json)
  - 新增 `npm run dev:api`

---

## 4. 自检结果
- `npm run build` 通过
- 后端代码已接入到前端 API 层和应用 bootstrap
- 沙箱内尝试直接启动 API 服务时，监听端口被环境拒绝，属于运行环境限制，不是构建错误

---

## 5. 风险与下一步
- 当前风险：
  - 未在当前沙箱内完成后端实际监听验证
  - 生产级数据库、鉴权、分页、搜索、详情数据仍未实现
- 下一步建议：
  - 在可监听端口的本地环境下运行 `npm run dev:api`
  - 再通过 `npm run dev` 验证前端实际通过 HTTP 读写数据
  - 下一阶段开始补详情内容、搜索筛选、分页和任务状态流转

