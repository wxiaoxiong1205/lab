# 方案设计文档：离线文档中心（Docusaurus v2 + ReDoc）

## 1. 目标与范围

本方案用于构建一个**离线可部署**的文档中心，满足以下需求：

- 纯前端静态站点，无后端依赖
- 文档版本化管理（current + 历史版本）
- 离线搜索（本地索引）
- API 文档展示（ReDoc，支持固定与动态 OpenAPI）
- 支持部署到 Nginx / 对象存储 / MinIO

非目标：

- 不提供在线搜索（Algolia 等）
- 不提供后端鉴权与数据服务

## 2. 总体架构

```
Markdown 文档 + OpenAPI 规范
        │
        ├─ Docusaurus v2（文档站点生成）
        │   ├─ 版本管理：versioned_docs / versions.json
        │   ├─ 本地搜索：@cmfcmf/docusaurus-search-local
        │   └─ 静态产物：build/
        │
        └─ ReDoc（API UI 渲染）
            ├─ 固定入口 /api（static/openapi.json）
            └─ 动态入口 /api/dynamic（支持 ?spec=）
```

## 3. 目录结构

```
document/
├── docs/                    # 文档源文件（Markdown）
├── versioned_docs/          # 历史版本文档
├── versioned_sidebars/      # 历史版本侧边栏
├── versions.json            # 版本列表
├── static/                  # 静态资源（openapi.json、redoc 脚本）
├── src/                     # Docusaurus 页面与样式
├── docusaurus.config.cjs    # 站点配置
├── sidebars.cjs             # 侧边栏配置
└── build/                   # 构建产物
```

## 4. 关键实现

### 4.1 文档系统

- 引擎：Docusaurus v2
- 路由：`docs` 作为 current，历史版本通过 `versioned_docs`
- 版本生成：`npx docusaurus docs:version <version>`

### 4.2 版本策略

- current 路由为 `/`
- 历史版本路由为 `/version/<version>/...`
- `versions.json` 记录版本清单

### 4.3 搜索

- 插件：`@cmfcmf/docusaurus-search-local`
- 特性：离线可用，本地索引
- 注意：索引在 `build` 阶段生成，`dev` 不显示搜索入口

### 4.4 API 文档（ReDoc）

- 固定入口：`/api`，读取 `static/openapi.json`
- 动态入口：`/api/dynamic`
  - 默认读取 `API_DEFAULT_DYNAMIC_SPEC_URL`
  - 支持 `?spec=<url>` 临时覆盖
- ReDoc 脚本：`static/redoc/redoc.standalone.js`（离线可用）

## 5. 环境变量

用于覆盖 API 文档默认配置：

- `API_DEFAULT_SPEC_PATH`（默认 `/openapi.json`）
- `API_REDOC_SCRIPT_PATH`（默认 `/redoc/redoc.standalone.js`）
- `API_SPEC_QUERY_PARAM`（默认 `spec`）
- `API_DEFAULT_DYNAMIC_SPEC_URL`（默认 `http://127.0.0.1:8000/openapi.json`）

## 6. 部署方案

### 6.1 Nginx

```
root /path/to/docs/build;
try_files $uri $uri/ /index.html;
```

### 6.2 对象存储 / MinIO

- 上传 `build` 目录
- 开启静态网站托管
- 设置首页 `index.html`、错误页 `404.html`

## 7. 运维与构建流程

```
npm install
npm run build
npm run serve
```

## 8. 风险与注意事项

- 搜索索引仅在 build 阶段生成
- 动态 OpenAPI URL 必须是合法 URL（端口 1–65535）
- ReDoc 依赖本地脚本文件，确保 `static/redoc/` 存在

