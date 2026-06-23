
## 安装和运行

### 1. 环境准备

创建并激活虚拟环境：

```bash
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
# 或
.venv\Scripts\activate     # Windows
```

安装依赖：

```bash
pip install -r requirements.txt
```

配置环境变量：

```bash
cp env.example .env
# 然后根据实际环境修改 .env 中的配置项
参考 https://deepexi.yuque.com/pxb7n8/atnvko/via6ts1db1gp7a21 搭建个人调试环境和初始化相关数据
```

### 2. 启动服务

本项目包含三个主要服务，需要分别启动：

#### 2.1 API 服务 (主服务)

FastAPI Web 服务，提供 REST API 接口。

```bash
uvicorn app.main:app --reload
```

#### 2.2 统一管理器 (unified_manager.py)

**作用**：后台管理服务，同时运行以下两个组件：
- **K8s 状态管理器**：监听 Kubernetes 集群状态变化
- **定时任务管理器**：管理和执行定时任务

```bash
python unified_manager.py
```

#### 2.3 Celery Worker (celery_worker.py)

**作用**：异步任务处理器，用于执行耗时的后台任务（如数据处理、通知发送等）。

```bash
# 基本启动（单进程）
python celery_worker.py

# 自定义参数启动
python celery_worker.py 
```

### 3. 启动顺序

建议按以下顺序启动：

1. **Celery Worker** - 先启动任务处理器
2. **统一管理器** - 启动后台管理服务
3. **API 服务** - 最后启动 Web 服务

