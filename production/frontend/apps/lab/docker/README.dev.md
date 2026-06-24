# DeepExiLab Frontend Docker开发模式

## 概述

Docker开发模式直接使用Docker命令启动开发环境，不依赖docker-compose。这种方式轻量级且高效，适合前端开发场景。

## 特性

- ✅ **轻量级**: 直接使用Docker命令，无额外依赖
- ✅ **热重载**: 代码修改自动刷新
- ✅ **源码映射**: 容器内外源码同步
- ✅ **完整管理**: 提供完整的容器生命周期管理

## 快速开始

### 1. 启动开发容器

```bash
# 使用主启动脚本
./scripts/start.sh docker-dev

# 或直接使用Docker命令
./scripts/start.sh docker-dev
```

### 2. 访问应用

开发服务器启动后，访问: http://localhost:5177

### 3. 停止开发容器

```bash
# 使用主启动脚本
./scripts/start.sh docker-dev-stop

# 或直接使用Docker命令
./scripts/start.sh docker-dev-stop
```

## 完整命令参考

### 容器管理

```bash
# 启动容器
./scripts/start.sh docker-dev

# 停止并删除容器
./scripts/start.sh docker-dev-stop

# 重启容器
./scripts/start.sh docker-dev-restart

# 查看容器状态
./scripts/start.sh docker-dev-status
```

### 日志和调试

```bash
# 查看实时日志
./scripts/start.sh docker-dev-logs

# 进入容器shell
./scripts/start.sh docker-dev-shell
```

### 维护操作

```bash
# 仅构建镜像
./scripts/start.sh docker-dev-build

# 清理开发环境（停止容器+删除镜像）
./scripts/start.sh docker-dev-clean
```

## 配置说明

### 容器配置

- **容器名称**: `deepexilab-frontend-dev`
- **镜像名称**: `deepexilab-frontend-dev`
- **端口映射**: `5177:5177`
- **重启策略**: `unless-stopped`

### 卷挂载

```bash
-v "$(pwd)/src:/app/src"                    # 源码目录
-v "$(pwd)/public:/app/public"              # 静态资源
-v "$(pwd)/package.json:/app/package.json"  # 依赖配置
-v "$(pwd)/pnpm-lock.yaml:/app/pnpm-lock.yaml"
-v "$(pwd)/vite.config.ts:/app/vite.config.ts"
-v "$(pwd)/tsconfig.json:/app/tsconfig.json"
-v "$(pwd)/tailwind.config.js:/app/tailwind.config.js"
```

### 环境变量

```bash
-e NODE_ENV=development
```

## 优势

| 特性 | 说明 |
|------|------|
| 依赖简单 | 仅需要Docker，无需docker-compose |
| 配置简单 | 直接使用Docker命令，配置清晰 |
| 启动快速 | 无额外编排开销，启动更快 |
| 资源占用少 | 轻量级，资源占用更少 |
| 易于调试 | 容器管理更直观，便于调试 |

## 使用场景

### 适合Docker开发模式的场景
- 前端单服务开发环境
- 简单的开发需求
- 对启动速度要求高
- 不需要复杂的网络配置
- 个人开发或小团队协作

## 故障排除

### 端口冲突

如果5177端口被占用，可以修改脚本中的PORT变量：

```bash
# 编辑 scripts/start.sh 中的 DOCKER_PORT 变量
DOCKER_PORT="5178"  # 改为其他端口
```

### 容器启动失败

```bash
# 查看详细错误信息
docker logs deepexilab-frontend-dev

# 清理并重新启动
./scripts/start.sh docker-dev-clean
./scripts/start.sh docker-dev
```

### 权限问题

```bash
# 确保脚本有执行权限
chmod +x scripts/start.sh
```

### 镜像构建失败

```bash
# 清理Docker缓存
docker system prune -f

# 重新构建
./scripts/start.sh docker-dev-build
```

## 高级用法

### 自定义端口

```bash
# 临时修改端口（需要修改脚本中的DOCKER_PORT变量）
DOCKER_PORT=5178 ./scripts/start.sh docker-dev
```

### 自定义环境变量

```bash
# 启动时添加环境变量
docker run -d \
    --name deepexilab-frontend-dev \
    -p 5177:5177 \
    -e NODE_ENV=development \
    -e CUSTOM_VAR=value \
    ...其他参数
```

### 调试模式

```bash
# 进入容器进行调试
./scripts/start.sh docker-dev-shell

# 在容器内执行命令
docker exec -it deepexilab-frontend-dev pnpm install new-package
```

## 性能优化

### 构建优化

```bash
# 使用BuildKit加速构建
DOCKER_BUILDKIT=1 ./scripts/start.sh docker-dev-build
```

### 缓存优化

```bash
# 使用Docker缓存
docker build --cache-from deepexilab-frontend-dev -f docker/frontend.dev.Dockerfile -t deepexilab-frontend-dev .
```

## 相关文件

- `scripts/start.sh` - 统一启动脚本（包含Docker开发模式）
- `docker/frontend.dev.Dockerfile` - 开发环境Dockerfile 