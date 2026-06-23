# Docker 目录

这个目录包含了项目的Docker相关文件。

## 文件说明

- `Dockerfile` - 生产环境Docker构建文件
- `frontend.dev.Dockerfile` - 开发环境Docker构建文件
- `nginx.conf` - Nginx配置文件
- `README.dev.md` - 开发环境使用指南

## 使用方法

### 生产环境

```bash
# 构建和启动生产环境
./scripts/start.sh docker

# 停止生产环境
./scripts/start.sh docker-stop
```

### 开发环境

```bash
# 启动开发环境
./scripts/start.sh docker-dev

# 停止开发环境
./scripts/start.sh docker-dev-stop
```

## 端口说明

- 开发环境：5173
- 预览环境：4173
- Docker环境：8072 