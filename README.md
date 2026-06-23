# lab-coding

DeepexiLab 平台持续迭代开发总仓库。

## 当前阶段

本仓库已进入“生产代码替换与 DeepexiLab 2.0 承接期”。

当前主基线不再是 1.0 Demo，而是纳入总仓库管理的生产前后端代码：

- `production/frontend`：生产前端，主应用在 `production/frontend/apps/lab`
- `production/backend`：生产后端，主服务在 `production/backend/app`

1.0 Demo 和 2.0 规划资料仍保留，但用途已经调整：

- `archive/1.0-demo`：历史 Demo、V1.14 缺口参考、需求评审/需求文档能力来源
- `planning/2.0`：DeepexiLab 2.0 PRD、原型、调研、设计方案和产品语言
- `docs/migration`：生产代码来源、V1.14 覆盖矩阵和迁移记录

## 工作原则

- 生产代码是后续 1.x 收口和 2.0 开发的新实现基线。
- V1.14 中生产代码未覆盖的能力，先在覆盖矩阵中标记，再从 `archive/1.0-demo` 按生产代码规范迁入。
- 右下角“需求评审 / 需求文档”能力必须随 V1.14 未覆盖需求一起保留。
- 不把 Demo 的 React 19、Ant Design 6、本地 mock 架构原样搬进生产代码。
- 不提交 `.env`、SSH key、Token 或本地运行态数据。

## AI 协作入口

后续 AI coding 请优先阅读：

- `AGENTS.md`
- `docs/migration/production-source-inventory.md`
- `docs/migration/v1.14-coverage-matrix.md`
- `docs/ai/phase2-operating-guide.md`

## 本地开发

生产前端：

```bash
cd production/frontend
pnpm install
pnpm --filter lab dev
```

生产后端：

```bash
cd production/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

1.0 Demo 归档如需临时对照：

```bash
cd archive/1.0-demo/app
npm install
npm run dev
```
