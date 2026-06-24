# 文档中心

这是一个**纯前端静态文档站点**，基于 Docusaurus v2 构建，支持版本化文档与离线搜索。

## 主要特性

- ✅ **零后端** - 无数据库、无接口、无鉴权
- ✅ **纯静态** - HTML + JS + CSS，可部署到任何静态服务器
- ✅ **离线搜索** - 本地索引，离线可用
- ✅ **版本化** - 支持历史版本文档
- ✅ **自动目录** - 侧边栏自动生成

## 快速开始

### 1. 安装依赖

```bash
cd document
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:5173 查看文档。

### 3. 构建生产版本

```bash
npm run build
```

构建产物在 `build` 目录。

### 4. 预览构建结果

```bash
npm run serve
```

## 搜索说明

- 使用 `@cmfcmf/docusaurus-search-local`，离线可用
- 索引在 `build` 时生成，`dev` 模式不会显示搜索入口

## 目录结构

```
document/
├── docs/                    # 文档源文件（Markdown）
├── versioned_docs/         # 历史版本文档
├── versioned_sidebars/     # 历史版本侧边栏
├── versions.json           # 版本列表
├── static/                 # 静态资源（openapi.json、favicon）
├── src/                    # Docusaurus 主题/页面
├── docusaurus.config.cjs   # Docusaurus 配置
├── sidebars.cjs            # 侧边栏配置
├── package.json            # 项目配置
└── README.md               # 说明文档
```

## 文档编写

- 在 `docs/` 目录下新增 Markdown 文件
- 侧边栏默认自动生成（配置见 `sidebars.cjs`）

## 版本管理

- 版本由 `docs` 快照生成：`npx docusaurus docs:version <version>`
- 历史版本访问路径：`/version/<version>/...`

## API 文档（ReDoc）

- 固定入口：`/api`（读取 `static/openapi.json`）
- 动态入口：`/api/dynamic`（读取 `API_DEFAULT_DYNAMIC_SPEC_URL`）
- 动态覆盖：`/api/dynamic?spec=https://example.com/openapi.json`

### API 文档环境变量

可通过 `.env` 覆盖默认值：

- `API_DEFAULT_SPEC_PATH`（默认 `/openapi.json`）
- `API_REDOC_SCRIPT_PATH`（默认 `/redoc/redoc.standalone.js`）
- `API_SPEC_QUERY_PARAM`（默认 `spec`）
- `API_DEFAULT_DYNAMIC_SPEC_URL`（默认 `http://127.0.0.1:8000/openapi.json`）

## 部署

默认路径为 `/`，构建后直接部署 `build` 目录。

### Nginx

```nginx
server {
    listen 80;
    server_name docs.example.com;
    root /path/to/docs/build;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 对象存储（OSS/COS）

1. 将 `build` 目录上传到对象存储
2. 开启静态网站托管
3. 配置访问域名

### MinIO

1. 新建 Bucket（例如 `doc-center`）
2. 上传 `build` 下的所有文件与目录
3. 开启静态网站托管
4. 首页 `index.html`，错误页 `404.html`
5. 配置公开读或通过网关鉴权

### GitHub Pages

1. 启用 Pages
2. 选择 `build` 作为源目录
3. 访问 `https://username.github.io/repo/`

## 技术栈

- **Docusaurus** - 静态站点生成器
- **React** - 前端框架
- **Markdown** - 文档格式

## 更多信息

- [Docusaurus 官方文档](https://docusaurus.io/docs)
- [Markdown 语法指南](https://www.markdownguide.org/)
