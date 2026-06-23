# 前端项目分离计划

## 分离目标
将现有的前后端混合项目分离为纯前端项目，移除所有后端相关代码和配置，保留完整的前端功能。

## 保留内容

### 前端核心文件
- `frontend/` - 完整的前端代码目录
- `project_doc/` - 项目文档（需要更新为前端相关）
- `frontend.Dockerfile` - 前端Docker构建文件
- `frontend.dev.Dockerfile` - 前端开发Docker文件
- `build_frontend_dev.sh` - 前端构建脚本
- `quick_start_frontend_dev.sh` - 前端快速启动脚本
- `FRONTEND_DEV_README.md` - 前端开发说明

### 前端配置文件
- `.dockerignore` - Docker忽略文件（需要更新）
- `package.json` - 前端依赖配置
- `vite.config.ts` - Vite构建配置
- `tailwind.config.js` - Tailwind CSS配置
- `tsconfig.json` - TypeScript配置

## 移除内容

### 后端代码
- `app/` - FastAPI后端应用
- `migrations/` - 数据库迁移文件
- `alembic.ini` - Alembic配置
- `backend.Dockerfile` - 后端Docker文件
- `celery_worker.py` - Celery工作进程
- `init_db.py` - 数据库初始化脚本
- `requirements.txt` - Python依赖
- `manage_services.sh` - 后端服务管理脚本
- `build_imaegs.sh` - 后端镜像构建脚本
- `docker/` - Docker配置目录（已重构为独立模式）
- `entrypoint.sh` - 后端启动脚本

### 后端配置
- `env.example` - 后端环境变量示例
- `.env` - 后端环境变量
- `DEBUG_GUIDE.md` - 后端调试指南
- `ALEMBIC_GUIDE.md` - 数据库迁移指南

### 后端相关目录
- `logs/` - 后端日志目录
- `.venv/` - Python虚拟环境
- `__pycache__/` - Python缓存
- `.pytest_cache/` - 测试缓存
- `.coverage` - 测试覆盖率

## 分离步骤

1. **创建新的项目根目录结构**
2. **移动前端相关文件到根目录**
3. **更新配置文件**
4. **简化Docker配置**
5. **更新项目文档**
6. **清理不必要的文件**

## 预期结果
- 纯前端项目，基于React + TypeScript + Vite
- 完整的UI组件和页面
- Mock数据服务支持
- 独立的Docker构建和部署
- 清晰的项目文档 