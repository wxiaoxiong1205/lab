# AGENTS.md

在开始任何分析、设计、编码、修改、重构、联调、测试、文档修订之前，必须先完整阅读本文件，并严格遵守以下规则。

## 1. 当前阶段定位

本仓库已进入“生产代码替换与 DeepexiLab 2.0 承接期”。

当前目标：

- 将生产前端与生产后端纳入 `lab-coding` 总仓库统一管理。
- 以生产代码作为新的 1.x 与 2.0 后续开发基线。
- 对比 V1.14 需求，识别生产代码已覆盖项和未覆盖项。
- 对生产代码未覆盖的 V1.14 能力，从 1.0 Demo 中按生产规范迁入。
- 保留右下角“需求评审 / 需求文档”能力，用于承接 V1.14 未覆盖需求上下文。

这意味着：

- 不再以 `archive/1.0-demo/app` 作为主应用。
- 不再把 Demo 的技术栈、mock 架构、本地状态结构原样搬进生产代码。
- 后续 DeepexiLab 2.0 开发必须基于 `production/frontend` 和 `production/backend` 继续演进。

## 2. 唯一真相源与优先级

默认优先级如下：

1. 用户当前明确需求。
2. 生产代码规范与生产代码当前实现。
3. `docs/migration/v1.14-coverage-matrix.md` 中的覆盖结论。
4. `archive/1.0-demo/app` 中 V1.14 未覆盖能力的历史实现。
5. `planning/2.0` 中的 PRD、原型、调研和设计方案。
6. 第一阶段历史文档和生产环境拆解资料。

特别规则：

- 生产代码已覆盖的 V1.14 能力，默认直接采用生产实现。
- 生产代码未覆盖或部分冲突的 V1.14 能力，必须先登记到覆盖矩阵，再按生产架构适配迁移。
- 如果 Demo 与生产代码冲突，不能直接覆盖生产实现；必须保留生产接口、路由、状态和样式约束，做最小适配。
- 2.0 规划资料是下一阶段输入，不得直接替代当前生产基线。

## 3. 目录与职责

- `production/frontend`
  - 生产前端代码，主应用在 `production/frontend/apps/lab`。
  - 技术栈：pnpm workspace、Vite、React 18、TypeScript、Ant Design 5、Zustand、React Router、React Query。
  - 后续前端开发默认在这里进行。
- `production/backend`
  - 生产后端代码，主服务在 `production/backend/app`。
  - 技术栈：FastAPI、Pydantic schema、repository/service 分层、Celery、后台 manager、K8s executor。
  - 后续后端开发默认在这里进行。
- `archive/1.0-demo`
  - 生产替换前的 1.0 Demo 归档。
  - 只作为 V1.14 缺口、页面内需求文档、历史 mock 行为和验收口径参考。
- `planning/2.0`
  - DeepexiLab 2.0 PRD、原型、调研、设计方案、产品语言。
  - 只作为 2.0 需求输入，不作为当前生产代码替换的直接实现。
- `docs/migration`
  - 生产代码来源、目录组织、V1.14 覆盖矩阵和迁移记录。

## 4. 默认工作顺序

每轮任务默认按以下顺序：

1. 阅读本文件。
2. 阅读本轮相关生产前端、生产后端代码。
3. 如果涉及 V1.14，先查 `docs/migration/v1.14-coverage-matrix.md`。
4. 判断需求属于生产已覆盖、Demo-only、部分冲突或 2.0 延后。
5. 只在需要迁移缺口时读取 `archive/1.0-demo/app` 对应实现。
6. 输出影响范围、实施方案和风险点。
7. 修改生产代码或迁移文档。
8. 同步检查右下角“需求评审 / 需求文档”上下文是否需要更新。
9. 运行构建、自检或最小冒烟验证。
10. 汇报实际修改、验证结果和剩余风险。

## 5. 生产前端开发规则

- 默认工作目录：`production/frontend/apps/lab`。
- 优先复用现有 routes、layouts、services、stores、components、types、styles。
- 不引入 React 19、Ant Design 6 或 Demo 专属依赖。
- 页面能力应通过生产 services 调接口，不用 Demo localStorage mock 伪装业务闭环。
- 新增公共能力优先放在公共组件或壳层，不侵入每个业务页面。
- 修改页面功能、字段、状态、布局、信息架构、交互时，必须同步检查右下角需求文档。
- 右下角“需求评审 / 需求文档”是 V1.14 缺口承接能力，必须保持：
  - 右下角入口可见。
  - 页面与需求文档可关联。
  - V1.14 版本说明和评审入口可用。
  - 本地存储兼容旧 Demo 结构或提供转换策略。

## 6. 生产后端开发规则

- 默认工作目录：`production/backend`。
- API 路由优先放入 `app/api/v1` 或已有 openapi 路由体系。
- 请求/响应类型放入 `app/schemas`。
- 业务逻辑进入 `app/services`，数据访问进入 `app/repository`，后台任务进入 `app/tasks` 或 `app/executors`。
- 涉及异步处理、K8s、Notebook、训练、评估、推理、数据处理时，必须同步考虑 Celery worker、manager 和任务状态流转。
- 不把 Demo 的 Node mock server 或 JSON DB 迁入生产后端。
- 涉及权限、租户、项目、用户、Token、外部系统配置时，不得写入真实敏感信息。

## 7. V1.14 缺口迁移规则

迁移前必须完成三件事：

1. 在覆盖矩阵中标记当前需求状态。
2. 找到生产代码中的对应模块、接口和数据结构。
3. 找到 Demo 中可参考的行为，不直接照搬技术实现。

迁移时：

- `production-covered`：只验证，不迁移 Demo。
- `demo-only`：按生产规范迁入，保留必要的用户体验和验收口径。
- `partial-conflict`：以生产代码为主，补齐缺口，避免破坏已有生产能力。
- `defer-to-2.0`：只记录，不进入当前生产替换。

每个模块迁移应独立提交，提交信息说明模块和缺口类型。

## 8. Git 与敏感信息

- 当前生产替换分支默认使用 `codex/production-baseline-transition`。
- 重大操作按阶段提交：现状保存、生产导入、目录整理、规则文档、各 V1.14 缺口迁移。
- 不提交 `.env`、`.env.*`、SSH key、Token、本地数据库、运行态缓存。
- 生产代码原始来源记录在 `docs/migration/production-source-inventory.md`。
- 若发现嵌套 `.git`、本地密钥或环境配置，必须排除后再提交。

## 9. 验证要求

前端常用验证：

- 在 `production/frontend` 运行依赖检查、lint、build 或目标 app 构建。
- 涉及 UI 时，启动本地前端做关键路由冒烟。
- 涉及需求文档时，验证右下角“需求文档”和“需求评审”入口可见且可操作。

后端常用验证：

- 在 `production/backend` 做 Python 导入检查。
- 可用环境下启动 FastAPI。
- 涉及任务时检查 Celery/manager 入口和状态字段。

如果因依赖、环境变量、外部服务不可用导致无法完整验证，必须明确说明未验证项和风险。

## 10. 输出要求

每轮汇报尽量包含：

1. 当前处理的模块 / 页面。
2. 生产代码与 V1.14 目标的差异。
3. 是否从 1.0 Demo 迁移。
4. 是否涉及右下角需求评审 / 需求文档。
5. 实际修改内容。
6. 自检结果。
7. 风险点和下一步建议。
