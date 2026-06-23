# DeepExiLab Frontend

DeepExiLab Frontend是一个专业的企业级AI/ML前端应用平台，为数据科学家和ML工程师提供直观易用的用户界面，支持数据集管理、模型评估测试、微调任务管理以及系统性能监控等功能。

## 🚀 快速开始

### 环境要求

- Node.js 18+
- pnpm 8+

### 方式一：使用快速启动脚本（推荐）

```bash
# 开发模式
./scripts/start.sh dev

# 构建生产版本
./scripts/start.sh build

# 预览生产版本
./scripts/start.sh preview

# Docker部署
./scripts/start.sh docker

# 停止Docker容器
./scripts/start.sh docker-stop

# 清理构建文件
./scripts/start.sh clean
```

### 方式二：手动命令

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建生产版本
pnpm build

# 预览生产版本
pnpm preview

# Docker部署
./scripts/start.sh docker
```

### 访问地址

- 开发模式：http://localhost:5173
- 预览模式：http://localhost:4173
- Docker模式：http://localhost:8072

## 🏗️ 项目结构

```
src/
├── components/          # 可复用组件
│   ├── common/         # 通用组件
│   ├── dataset/        # 数据集相关组件
│   ├── experiment/     # 实验相关组件
│   └── ...
├── pages/              # 页面组件
├── hooks/              # 自定义Hooks
├── services/           # API服务
├── stores/             # 状态管理
├── types/              # TypeScript类型定义
├── utils/              # 工具函数
├── locales/            # 国际化文件
└── assets/             # 静态资源
```

## 🛠️ 技术栈

- **React 18** - 现代化JavaScript库
- **TypeScript** - 类型安全的JavaScript超集
- **Vite** - 现代化前端构建工具
- **Ant Design** - 企业级UI组件库
- **Tailwind CSS** - 原子化CSS框架
- **Zustand** - 轻量级状态管理
- **React Router** - 客户端路由
- **i18next** - 国际化框架

## 📚 文档

- [项目概述](./project_doc/project-overview.md)
- [技术规格](./project_doc/tech-stack.md)
- [项目结构](./project_doc/project-structure.md)
- [需求与功能](./project_doc/requirements.md)
- [用户流程](./project_doc/user-flow.md)

## 🐳 Docker部署

### 构建镜像

```bash
docker build -t deepexilab-frontend .
```

### 运行容器

```bash
docker run -p 80:80 deepexilab-frontend
```

### Docker 部署

```bash
# 生产环境
./scripts/start.sh docker

# 开发环境
./scripts/start.sh docker-dev
```

## 注意事项

### 菜单

菜单获取后默认进行缓存，刷新页面如果存在菜单则不再请求。触发新请求的方式：

- 清理缓存 auth-storage
- 使用环境变量传递token，VITE_LOCAL_TEST_TOKEN
- url携带 _tk 参数
- 退出登录（实质通上一个）

重新授权，需要重置缓存，如退出登录

## 🤝 贡献

欢迎提交Issue和Pull Request！

## �� 许可证

MIT License
