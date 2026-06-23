# 项目结构

## 目录结构概览

```
deepexi_lab_web/
├── 📁 src/                    # 前端源代码
│   ├── components/            # 可复用组件
│   ├── pages/                 # 页面组件
│   ├── hooks/                 # 自定义Hooks
│   ├── services/              # API服务
│   ├── stores/                # 状态管理
│   ├── types/                 # TypeScript类型定义
│   ├── utils/                 # 工具函数
│   ├── locales/               # 国际化文件
│   └── assets/                # 静态资源
├── 📁 public/                 # 静态资源
├── 📁 dist/                   # 构建输出
├── 📁 project_doc/            # 项目文档
├── 📁 scripts/                # 脚本文件
│   ├── start.sh               # 主启动脚本
│   ├── build_frontend_dev.sh  # 开发构建脚本
│   └── quick_start_frontend_dev.sh # 快速启动脚本
├── 📁 docs/                   # 文档文件
│   ├── README_HOMEPAGE.md     # 首页文档
│   ├── README_I18N.md         # 国际化文档
│   └── FRONTEND_DEV_README.md # 开发说明
├── 📁 docker/                 # Docker相关文件
│   ├── Dockerfile             # 生产环境Docker构建文件
│   ├── frontend.dev.Dockerfile # 开发环境Docker构建文件
│   ├── nginx.conf             # Nginx配置
│   └── README.dev.md          # 开发环境使用指南
├── 📁 config/                 # 配置文件
│   ├── tsconfig.json          # TypeScript主配置
│   ├── tsconfig.app.json      # TypeScript应用配置
│   ├── tsconfig.node.json     # TypeScript Node配置
│   ├── tailwind.config.js     # Tailwind CSS配置
│   └── eslint.config.js       # ESLint配置
├── 📁 examples/               # 示例文件
├── 📄 package.json            # 项目依赖配置
├── 📄 vite.config.ts          # Vite构建配置
├── 📄 index.html              # 入口HTML文件
├── 📄 README.md               # 项目说明
└── 🔗 符号链接文件             # 保持兼容性的符号链接
```

## 目录详细说明

### 核心目录

#### `src/` - 前端源代码
- **components/** - 可复用组件库
  - `common/` - 通用组件
  - `dataset/` - 数据集相关组件
  - `experiment/` - 实验相关组件
  - `finetune/` - 微调相关组件
  - `notebook/` - Notebook相关组件
  - `prompt/` - 提示词相关组件
  - `registry/` - 注册表相关组件
  - `storage/` - 存储相关组件
  - `task/` - 任务相关组件

- **pages/** - 页面组件
  - 包含所有主要页面组件
  - 按功能模块组织

- **hooks/** - 自定义Hooks
  - `useI18n.ts` - 国际化Hook
  - `dataset/` - 数据集相关Hooks

- **services/** - API服务
  - 包含所有后端API调用服务
  - 使用Mock数据模拟

- **stores/** - 状态管理
  - 使用Zustand进行状态管理
  - 按功能模块组织

- **types/** - TypeScript类型定义
  - 包含所有接口和类型定义
  - 按功能模块组织

- **utils/** - 工具函数
  - 通用工具函数
  - 数据处理函数

- **locales/** - 国际化文件
  - 支持中文、英文、繁体中文

- **assets/** - 静态资源
  - 图片、图标等静态资源

#### `public/` - 静态资源
- 构建时直接复制的静态文件
- 包含示例数据文件

#### `dist/` - 构建输出
- Vite构建生成的静态文件
- 用于生产部署

### 组织目录

#### `scripts/` - 脚本文件
- **start.sh** - 主启动脚本，支持多种模式
- **build_frontend_dev.sh** - 开发环境构建脚本
- **quick_start_frontend_dev.sh** - 快速启动脚本

#### `docs/` - 文档文件
- **README_HOMEPAGE.md** - 首页相关文档
- **README_I18N.md** - 国际化相关文档
- **FRONTEND_DEV_README.md** - 前端开发说明

#### `docker/` - Docker相关文件
- **Dockerfile** - 生产环境Docker构建文件
- **frontend.dev.Dockerfile** - 开发环境Docker构建文件  
- **nginx.conf** - Nginx配置文件
- **README.dev.md** - 开发环境使用指南

#### `config/` - 配置文件
- **tsconfig.json** - TypeScript主配置文件
- **tsconfig.app.json** - TypeScript应用配置
- **tsconfig.node.json** - TypeScript Node配置
- **tailwind.config.js** - Tailwind CSS配置
- **eslint.config.js** - ESLint代码检查配置

#### `project_doc/` - 项目文档
- **project-overview.md** - 项目概述
- **tech-stack.md** - 技术栈说明
- **requirements.md** - 功能需求
- **implementation.md** - 实现指南
- **user-flow.md** - 用户流程
- **frontend-separation-summary.md** - 前端分离总结

### 配置文件

#### 根目录配置文件
- **package.json** - 项目依赖和脚本配置
- **vite.config.ts** - Vite构建工具配置
- **index.html** - 应用入口HTML文件
- **README.md** - 项目主要说明文档

#### 符号链接文件
为了保持项目兼容性，以下文件通过符号链接指向对应目录：
- `tsconfig.json` → `config/tsconfig.json`
- `tsconfig.app.json` → `config/tsconfig.app.json`
- `tsconfig.node.json` → `config/tsconfig.node.json`
- `tailwind.config.js` → `config/tailwind.config.js`
- `eslint.config.js` → `config/eslint.config.js`
- `start.sh` → `scripts/start.sh`
- `frontend.dev.Dockerfile` - 开发环境Docker配置

## 文件组织原则

### 1. 功能分离
- 按功能将文件分类到不同目录
- 保持目录职责单一

### 2. 易于维护
- 相关文件集中管理
- 清晰的目录结构

### 3. 向后兼容
- 使用符号链接保持原有命令可用
- 不影响现有开发流程

### 4. 文档完善
- 每个目录都有README说明
- 详细的使用指南

## 使用指南

### 开发模式
```bash
# 使用主启动脚本（推荐）
./start.sh dev

# 或直接使用pnpm
pnpm dev
```

### 构建部署
```bash
# 构建生产版本
./start.sh build

# Docker部署
./start.sh docker
```

### 配置文件修改
- 修改 `config/` 目录下的配置文件
- 根目录的符号链接会自动更新

### 脚本使用
- 主要使用 `scripts/start.sh`
- 其他脚本在 `scripts/` 目录下