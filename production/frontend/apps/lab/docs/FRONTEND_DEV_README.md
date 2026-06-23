# 前端开发环境 Docker 配置

本项目提供了完整的前端开发环境 Docker 配置，包含 Dockerfile 和构建脚本，方便快速启动开发环境。

## 📁 文件说明

- `frontend.dev.Dockerfile` - 前端开发环境 Dockerfile
- `build_frontend_dev.sh` - 完整的构建和管理脚本
- `quick_start_frontend_dev.sh` - 快速启动脚本

## 🚀 快速开始

### 方法 1：使用快速启动脚本（推荐）

```bash
# 仅构建本地开发环境
./quick_start_frontend_dev.sh

# 构建本地环境并推送x86镜像到远端
./quick_start_frontend_dev.sh --push
```

这个脚本会自动：
- 构建前端开发镜像
- 清理现有容器
- 启动新的开发容器
- 显示访问地址和常用命令

**增强功能**：
- 支持构建x86平台镜像（适用于部署到生产环境）
- 自动推送到远端仓库（deploy.deepexi.com/applife）
- 使用Docker buildx进行多平台构建
- 自动标记镜像版本（dev、dev-x86）

### 方法 2：使用完整管理脚本

```bash
# 查看帮助
./build_frontend_dev.sh help

# 构建镜像
./build_frontend_dev.sh build

# 运行容器
./build_frontend_dev.sh run

# 查看日志
./build_frontend_dev.sh logs

# 停止容器
./build_frontend_dev.sh stop

# 重启容器
./build_frontend_dev.sh restart

# 清理镜像和容器
./build_frontend_dev.sh clean
```

## 🐳 Docker 配置详情

### 基础镜像
- `node:18-alpine` - 轻量级 Node.js 18 环境

### 环境配置
- 使用 pnpm 作为包管理器
- 设置国内镜像源加速依赖下载
- 开发环境端口：5177
- 支持热重载（HMR）

### 容器特性
- **代码同步**：项目目录挂载到容器，支持实时代码更新
- **依赖隔离**：node_modules 作为独立卷挂载，避免权限问题
- **端口映射**：容器 5177 端口映射到主机 5177 端口

## 💻 访问方式

启动成功后，访问：
- 本地地址：http://localhost:5177
- 支持热重载，修改代码后会自动刷新

## 🛠️ 常用命令

### 查看容器状态
```bash
docker ps -a | grep dataset-demo-frontend-dev
```

### 查看实时日志
```bash
docker logs -f dataset-demo-frontend-dev
```

### 进入容器
```bash
docker exec -it dataset-demo-frontend-dev sh
```

### 停止容器
```bash
docker stop dataset-demo-frontend-dev
```

### 删除容器
```bash
docker rm dataset-demo-frontend-dev
```

## 📋 技术栈

- **框架**：React 18 + TypeScript
- **构建工具**：Vite
- **UI 库**：Ant Design
- **状态管理**：Zustand
- **HTTP 客户端**：Axios + React Query
- **路由**：React Router Dom
- **样式**：Tailwind CSS + Sass

## 🔧 开发环境配置

### Vite 配置
- 开发服务器端口：5177
- 主机绑定：0.0.0.0（支持容器访问）
- 代理配置：API 请求代理到 `https://deepexilab-dev.deepexi.com`
- HMR 超时：5000ms

### 依赖管理
- 使用 pnpm 作为包管理器
- 支持 lockfile 锁定版本
- 国内镜像源加速下载

## 🚨 注意事项

1. **Docker 要求**：需要安装 Docker 并启动 Docker 服务
2. **端口冲突**：确保 5177 端口未被占用
3. **权限问题**：如果遇到权限问题，可以使用 `sudo` 运行脚本
4. **网络访问**：如果网络较慢，可以考虑使用其他 npm 镜像源

## 📝 故障排除

### 构建失败
- 检查 Docker 是否正常运行
- 确认网络连接正常
- 查看构建日志定位问题

### 容器启动失败
- 检查端口 5177 是否被占用
- 确认镜像构建成功
- 查看容器日志：`docker logs dataset-demo-frontend-dev`

### 代码更新不生效
- 确认代码目录挂载正确
- 检查 HMR 配置是否正常
- 重启开发服务器

### 推送镜像失败
- 检查 Docker buildx 是否可用：`docker buildx version`
- 确认已登录到远端仓库：`docker login deploy.deepexi.com`
- 验证网络连接和仓库访问权限
- 检查镜像标签是否正确

## 🎯 开发建议

1. 使用快速启动脚本进行日常开发
2. 定期清理 Docker 镜像和容器
3. 遇到问题时先查看容器日志
4. 代码提交前确保本地测试通过

---

需要帮助或有问题，请查看项目文档或联系开发团队。 