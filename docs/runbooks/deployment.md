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

### 1. 发布前检查

在仓库根目录执行：

```bash
git status --short --branch
```

确认只包含本次要发布的文件。不要提交：

- `.env`、`.env.*`
- `.github-token.local`
- `.vercel/.env*.local`
- 本地数据库、运行态缓存
- `.playwright-cli/`
- `Project/`

在 `production/frontend` 执行本地构建：

```bash
VITE_PUBLIC_PATH=/ VITE_API_BASE_URL=https://deepexilab-dev.deepexi.com/lab-backend VITE_SHOWCASE_PREVIEW=true pnpm --filter lab exec vite build
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

检查命令：

```bash
npx vercel@52.2.0 project inspect lab --scope wxiaoxiong1205s-projects
npx vercel@52.2.0 env ls --scope wxiaoxiong1205s-projects
```

### 3. 部署

```bash
npx vercel@52.2.0 --prod --yes --scope wxiaoxiong1205s-projects
```

成功标准：

- CLI 输出 `status: ok`
- `readyState` 为 `READY`
- `Aliased: https://lab.aidaxiong.fun`

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

1. 打开 `https://lab.aidaxiong.fun/home`
2. 强制刷新：`Cmd + Shift + R`
3. 如果仍看到旧认证状态，清理该域名站点数据后重试
4. 预期不再出现：
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

### 已完成修复

- `vite.config.ts` 允许 Vercel 环境变量覆盖 `.env.production` 的 `VITE_PUBLIC_PATH`。
- 独立部署时 `apiClient` 优先使用 `VITE_API_BASE_URL`。
- Vercel Production 环境变量补齐 `VITE_PUBLIC_PATH`、`VITE_API_BASE_URL`、`VITE_SHOWCASE_PREVIEW`。
- `vite.config.ts` 不再硬编码 `@antv/util` 的 `.pnpm` 安装路径，改为从实际安装包解析。
- 演示预览 token 收到真实后端 401 时，不触发全局登出。
- 新增 `scripts/verify-lab-deployment.mjs` 做部署后静态验收。

### 仍未解决的问题

1. 普通 `git push` 仍不可用，本机 Git HTTPS 凭据需要单独修复；当前只能通过 GitHub API 兜底。
2. Vercel 仍会按项目创建时间默认使用 pnpm 10，仓库 lockfile 是 pnpm 9 生成；目前可构建，但长期应统一 package manager 版本策略。
3. `VITE_SHOWCASE_PREVIEW=true` 是前端演示兜底，不是最终的后端演示数据闭环；后续仍应让演示主路径依赖后端 seed 数据。
4. 部分模块仍有前端 fallback/mock，可能在真实后端接口返回 401、空数组或字段变化时出现局部异常。
5. 当前静态检查不能替代浏览器冒烟；后续应补一个稳定的 Playwright/Chrome 检查，覆盖登录后首页、项目列表、数据集入口和右下角需求文档入口。

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

## 下次发布完成定义

一次发布只有同时满足以下条件才算完成：

1. 本地构建通过。
2. GitHub 远端分支 HEAD 已确认。
3. Vercel deployment 为 Ready。
4. `lab.aidaxiong.fun` alias 指向最新 deployment。
5. `node scripts/verify-lab-deployment.mjs` 通过。
6. 浏览器强刷后首页不再出现白屏、404、未授权、认证失效。
