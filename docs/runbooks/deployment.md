# Deployment Runbook

本手册用于发布 `production/frontend/apps/lab` 到 Vercel，并记录 2026-06-29 正式域名修复过程中暴露的问题。目标是让下次推送先验证基本条件，再发布，再用固定检查收口。

## 第一性原理

一次前端发布能成立，需要同时满足六个条件：

1. 源码是正确的：本地改动、依赖解析、构建入口都和生产代码一致。
2. 构建环境是确定的：Vercel 的 root、install command、build command、output directory、环境变量都和本地预期一致。
3. 静态资源路径是正确的：独立域名必须使用 `/assets/...`，不能使用控制台内嵌时的 `/lab/assets/...`。
4. API 基址是正确的：独立域名不能请求 `https://lab.aidaxiong.fun/lab-backend/...`，必须使用真实后端 `https://deepexilab-dev.deepexi.com/lab-backend/api/v1`。
5. 认证模式是闭环的：授权链接 token、控制台内嵌 token、演示预览 token 不能互相覆盖；演示 token 触发真实后端 401 时不能清空演示登录态。
6. 发布结果经过验证：GitHub 分支、Vercel deployment、正式域名、线上主 JS 内容必须对齐。

## 标准发布流程

### 0. 固定发布路径

本仓库当前最稳发布路径固定为：

- GitHub：HTTPS remote + 仓库本地 `http.proxy=http://127.0.0.1:7897`。
- Vercel：只从仓库根目录发布正式项目 `wxiaoxiong1205s-projects/lab`。
- 不把 SSH、GitHub API 推送、子目录 Vercel 部署作为常规路径；它们只用于诊断或应急。

首次或代理配置被改动后，在仓库根目录执行：

```bash
npm run setup:github-proxy
```

一键正式发布入口：

```bash
npm run deploy:lab:prod
```

该命令会按顺序执行 GitHub 推送门禁、Vercel 项目防误发门禁、正式部署和正式域名验收。除非正在排查某一步，否则优先使用该命令。

### 1. 发布前检查

在仓库根目录执行：

```bash
git status --short --branch
npm run verify:github-push
npm run verify:vercel-preflight
```

确认只包含本次要发布的文件。不要提交：

- `.env`、`.env.*`
- `.github-token.local`
- `.vercel/.env*.local`
- 本地数据库、运行态缓存
- `.playwright-cli/`
- `Project/`

`npm run verify:github-push` 会强制检查：

- `origin=https://github.com/wxiaoxiong1205/lab.git`
- `git http.proxy=http://127.0.0.1:7897`
- GitHub credential helper 可读取本地 token，且输出只显示 `password=<redacted>`
- 远端分支可读、`fetch` 可用、`git push --dry-run` 可用

`npm run verify:vercel-preflight` 会强制检查：

- 当前执行目录是仓库根目录
- 根目录、`production/frontend`、`production/frontend/apps/lab` 的本地 Vercel 绑定指向同一个正式 `lab` 项目
- Vercel 线上项目 ID、Root Directory、Build Command、Output Directory、Install Command 都与正式配置一致
- 归档目录如果仍有指向正式 `lab` 的 `.vercel` 绑定，会打印风险警告

在 `production/frontend` 执行本地构建。当前发布门禁已经恢复为完整 `tsc -b && vite build`：

```bash
pnpm --filter lab build
```

如果本地构建失败，不要进入 Vercel 部署。

### 2. Vercel 项目配置

当前 Vercel 项目：

- Project: `lab`
- Scope: `wxiaoxiong1205s-projects`
- Root Directory: `production/frontend`
- Output Directory: `apps/lab/dist`
- Install Command: `pnpm install --no-frozen-lockfile --config.recursive-install=true`
- Build Command: `pnpm --filter lab exec vite build`

Production 环境变量必须包含：

- `VITE_PUBLIC_PATH=/`
- `VITE_API_BASE_URL=https://deepexilab-dev.deepexi.com/lab-backend`
- `VITE_SHOWCASE_PREVIEW=true`

如果后端环境用于独立域名演示，并且该后端是隔离的演示后端，可以显式开启：

- `SHOWCASE_PREVIEW_AUTH=true`

该开关只允许固定演示 token 读取后端种子数据，不允许写操作；不应在真实生产租户或共享开发后端开启。

检查命令：

```bash
npm run verify:vercel-preflight
npx vercel@52.2.0 env ls --scope wxiaoxiong1205s-projects
```

### 3. 部署

```bash
npm run deploy:lab:prod
```

成功标准：

- CLI 输出 `status: ok`
- `readyState` 为 `READY`
- `Aliased: https://lab.aidaxiong.fun`
- `npm run verify:lab-deployment` 自动通过
- `npm run verify:lab-browser` 自动通过

### 4. 部署后检查

先跑快速静态检查：

```bash
node scripts/verify-lab-deployment.mjs
```

成功时会验证：

- `https://lab.aidaxiong.fun/home` 返回 200
- 正式域名 HTML 引用的是 `/assets/index-*.js`
- 主 JS 包含真实后端地址
- 主 JS 包含演示预览 token
- 主 JS 包含 `VITE_SHOWCASE_PREVIEW` 构建标记

再做浏览器检查：

```bash
npm run verify:lab-browser
```

成功时会用 Playwright 验证：

- 首页项目列表渲染正常
- 项目首页渲染正常
- 训练数据集列表渲染正常且有 showcase 数据
- 右下角“需求文档 / 需求评审”入口仍可见

必要时再手工打开 `https://lab.aidaxiong.fun/home` 强制刷新：`Cmd + Shift + R`。如果仍看到旧认证状态，清理该域名站点数据后重试。预期不再出现：
   - 白屏
   - `Request failed with status code 404`
   - `未授权访问`
   - `认证失效，请重新通过授权链接访问`

## 2026-06-29 复盘

### 现象链路

1. 正式域名打不开，最初是静态资源路径错误：Vercel 独立域名使用了 `/lab/assets/...`。
2. 修正静态资源后，菜单接口 404：前端请求了 Vercel 域名下的 `/lab-backend/api/v1/menu`，而 Vercel 只托管前端。
3. 改为真实后端后，页面显示未授权：Vercel 构建缺少 `VITE_SHOWCASE_PREVIEW=true`，直开域名没有演示登录态。
4. 补回演示开关后，页面显示认证失败：演示 token 请求真实后端返回 401，前端全局 401 拦截器把演示登录态清空。
5. 重新部署时耗时很久：Vercel 构建环境与本地依赖解析不完全一致，`vite.config.ts` 硬编码 `.pnpm` 路径导致云端找不到 `@antv/util`。
6. GitHub 普通 push 不通：本机 Git HTTPS 凭据不可用，临时使用 GitHub Git Database API 推送。

### 核心问题

1. 发布前没有固定检查 Vercel 项目配置和环境变量。
2. 没有把独立部署、控制台内嵌、演示预览三种运行模式作为不同契约处理。
3. 线上验证停留在 “页面能加载”，没有检查主 JS 中的关键构建标记。
4. 构建配置依赖 pnpm 私有目录结构，破坏了跨环境可复现性。
5. GitHub 推送链路没有提前验证，导致发布阶段临时切换 API 推送方案。
6. 每修一个症状就部署一次，缺少一次性覆盖静态资源、API、认证、构建标记的验证矩阵。
7. 从 `production/frontend` 临场执行 Vercel 部署时，CLI 曾误建并发布到 `frontend` 项目，说明缺少“必须从仓库根目录发布”和“部署前核对项目 ID”的硬门禁。

### 已完成修复

- `vite.config.ts` 允许 Vercel 环境变量覆盖 `.env.production` 的 `VITE_PUBLIC_PATH`。
- 独立部署时 `apiClient` 优先使用 `VITE_API_BASE_URL`。
- Vercel Production 环境变量补齐 `VITE_PUBLIC_PATH`、`VITE_API_BASE_URL`、`VITE_SHOWCASE_PREVIEW`。
- `vite.config.ts` 不再硬编码 `@antv/util` 的 `.pnpm` 安装路径，改为从实际安装包解析。
- 演示预览 token 收到真实后端 401 时，不触发全局登出。
- 新增 `scripts/verify-lab-deployment.mjs` 做部署后静态验收。
- 新增 `scripts/verify-vercel-preflight.mjs`，发布前校验正式 Vercel 项目、Root Directory、构建配置和本地绑定，降低误发到 `frontend` 或归档目录的风险。
- 新增 `scripts/deploy-lab-production.mjs` 和 `npm run deploy:lab:prod`，把 GitHub 门禁、Vercel 门禁、正式部署、正式域名验收串成固定入口。
- `.github-token.local`、`.playwright-cli/`、`Project/` 已加入仓库级忽略规则，降低误提交本地 token、浏览器调试产物和外部项目副本的风险。
- 通过 workspace overrides 收敛 `@types/react` / `@types/react-dom` 到 React 18 类型版本，`pnpm --filter lab build` 已恢复为完整 TypeScript + Vite 门禁。
- 新增 `production/frontend/apps/lab/scripts/verify-browser-smoke.mjs` 和 `npm run verify:lab-browser`，发布后自动覆盖首页、项目首页、训练数据集列表和右下角需求文档入口。

### 仍未解决的问题

1. 普通 `git push` 的认证链路已恢复：仓库本地 credential helper 会从 `.github-token.local` 读取 GitHub token，且 `npm run verify:github-push` 会在发布前验证凭据、远端读取、fetch 和 `git push --dry-run --porcelain` 写入门禁；当前仍观察到 `git ls-remote` 偶发 `Operation too slow` / timeout，这属于 GitHub Git 传输链路或本机网络问题，不应再误判为 token 权限问题。
2. Vercel 仍会按项目创建时间默认使用 pnpm 10，仓库 lockfile 是 pnpm 9 生成；目前可构建，但长期应统一 package manager 版本策略。
3. `VITE_SHOWCASE_PREVIEW=true` 已改为后端优先、前端兜底，但 Notebook 周边、预置模型、已发布模型选择等模块仍有前端 mock 主导路径，需后续补真实 API 或单列迁移边界。
4. 浏览器冒烟当前覆盖首页、项目首页、训练数据集列表和需求文档入口；后续可继续扩展到创建训练、推理、评估、清洗、增强、洞察、标注入口。

## 下次发布的快速决策树

### 白屏

优先检查：

```bash
curl -sS https://lab.aidaxiong.fun/ | rg '/assets|/lab/assets'
```

如果出现 `/lab/assets`，检查 `VITE_PUBLIC_PATH=/` 是否进入 Vercel Production 构建。

### 菜单 404

检查线上主 JS：

```bash
node scripts/verify-lab-deployment.mjs
```

如果缺少真实后端地址，检查 `VITE_API_BASE_URL`。

### 未授权访问

检查是否缺少演示开关：

```bash
npx vercel@52.2.0 env ls --scope wxiaoxiong1205s-projects
```

如果缺少 `VITE_SHOWCASE_PREVIEW`，补齐后重新部署。

### 认证失效

优先判断是否是演示 token 被真实后端 401 清空。演示模式下不应该触发全局登出；如果复现，检查 `apiClient.ts` 的演示 401 guard 是否仍在。

### Vercel 构建失败

先看失败类型：

- `Could not load ... node_modules/.pnpm/...`：不要硬编码 pnpm 虚拟仓库路径，改为包解析。
- `Unsupported environment pnpm`：不要直接降级整个 workspace 的 pnpm，先检查各 app 的 `engines.pnpm`。
- 静态资源 404：检查 `base` 和 `VITE_PUBLIC_PATH`。

### GitHub 推送失败

如果普通 Git 失败，先记录错误类型：

- `could not read Username for 'https://github.com'`：本机 Git 凭据缺失。
- `Operation timed out`：到 `github.com` Git 传输链路异常。
- `api.github.com` 正常但 Git 不正常：可临时使用 GitHub Git Database API 推送，但必须避免重复提交历史。

固定检查入口：

```bash
npm run setup:github-proxy
npm run verify:github-push
```

如果该检查能读出 `username`、隐藏后的 `password=<redacted>`、远端分支 SHA，并通过 `push --dry-run`，说明认证和写入门禁在当前网络条件下是通的；后续失败优先看网络、非快进或远端保护规则。

## 下次发布完成定义

一次发布只有同时满足以下条件才算完成：

1. 本地构建通过。
2. GitHub 远端分支 HEAD 已确认。
3. `npm run verify:vercel-preflight` 通过，确认 Vercel 正式项目不是 `frontend`。
4. Vercel deployment 为 Ready。
5. `lab.aidaxiong.fun` alias 指向最新 deployment。
6. `npm run verify:lab-deployment` 通过。
7. `npm run verify:lab-browser` 通过。
