# 开发方法和指南

## 开发环境搭建

### 环境要求
- **Python 3.9+**: 确保Python版本兼容性
- **数据库**: MySQL 8.0+ 或 PostgreSQL 13+
- **Redis 5.0+**: 缓存和消息队列后端
- **RabbitMQ**: Celery消息代理
- **MinIO**: 对象存储服务（用于文件和日志归档）
- **Node.js 18+**: 前端开发环境
- **pnpm**: 前端包管理器
- **Docker**: 容器化部署

### 快速启动

#### 后端服务启动
```bash
# 1. 克隆项目并安装依赖
git clone <repository-url>
cd dataset_mg
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 2. 环境配置
cp env.example .env
# 编辑 .env 文件配置数据库和其他服务

# 3. 启动应用服务（推荐方式 - Docker）
./scripts/start.sh docker

# 或者本地开发方式
# 3a. 数据库初始化（本地开发）
alembic upgrade head

# 3b. 启动应用服务（本地开发）
python app/main.py

# 3c. 启动Celery Worker（另一个终端）
python celery_worker.py
```

#### 前端开发环境启动
```bash
# 方法1：使用快速启动脚本（推荐）
./quick_start_frontend_dev.sh

# 方法2：使用Docker开发模式（推荐）
./scripts/start.sh docker-dev

# 方法3：使用完整管理脚本
./build_frontend_dev.sh build
./build_frontend_dev.sh run

# 方法4：本地开发方式
pnpm install
pnpm run dev
```

### 前端开发环境配置

#### Docker开发环境特性
- **基础镜像**: Node.js 18 Alpine
- **包管理器**: pnpm
- **开发端口**: 5177
- **热重载**: 支持HMR（Hot Module Replacement）
- **代码同步**: 项目目录挂载到容器，实时同步代码更改
- **依赖隔离**: node_modules作为独立卷挂载

#### Docker开发模式
- **启动方式**: `./scripts/start.sh docker-dev`
- **停止方式**: `./scripts/start.sh docker-dev-stop`
- **日志查看**: `./scripts/start.sh docker-dev-logs`
- **状态查看**: `./scripts/start.sh docker-dev-status`
- **进入容器**: `./scripts/start.sh docker-dev-shell`
- **清理环境**: `./scripts/start.sh docker-dev-clean`
- **特点**: 轻量级纯Docker架构，启动快速，支持热重载，无外部依赖

#### 技术栈配置
- **框架**: React 18 + TypeScript
- **构建工具**: Vite
- **UI库**: Ant Design + Pro Components
- **状态管理**: Zustand
- **HTTP客户端**: Axios + React Query
- **路由**: React Router Dom
- **样式**: Tailwind CSS + Sass
- **国际化**: i18next + react-i18next

#### 开发工具配置
- **代码检查**: ESLint + TypeScript ESLint
- **类型检查**: TypeScript 5.7+
- **API代理**: Vite代理配置，转发到后端服务
- **HMR超时**: 5000ms，确保大文件更新稳定性

#### 前端构建脚本说明
项目提供了完整的前端开发环境管理脚本：

1. **frontend.dev.Dockerfile**: 开发环境容器配置
2. **build_frontend_dev.sh**: 完整的构建和管理脚本
   - 支持构建镜像、运行容器、查看日志等操作
   - 提供清理和重启功能
3. **quick_start_frontend_dev.sh**: 增强的快速启动脚本
   - 一键构建并启动本地开发环境
   - 自动清理旧容器，确保环境一致性
   - 支持构建x86镜像并推送到远端仓库（deploy.deepexi.com/applife）
   - 使用方式：
     - `./quick_start_frontend_dev.sh` - 仅构建本地开发环境
     - `./quick_start_frontend_dev.sh --push` - 构建本地环境并推送x86镜像到远端

详细的前端开发环境配置说明请参考 `FRONTEND_DEV_README.md`

## 核心框架详解

### FastAPI应用架构

#### 1. 应用入口配置（main.py）
```python
# 核心配置要素
app = FastAPI(
    title="DeepexiLab",
    description="DeepexiLab 模型训练平台",
    version="v1",
    # lifespan=lifespan
)

# fastapi-pagination 初始化 - 支持全局分页功能
from fastapi_pagination import add_pagination
add_pagination(app)

# 中间件配置顺序（重要：顺序影响执行）
app.add_middleware(CORSMiddleware)    # CORS处理
app.middleware("http")(RequestLoggingMiddleware())  # 请求日志
app.middleware("http")(auth_middleware)  # 认证验证

# JSON工具初始化 - 确保中文字符正确显示
from app.utils.json_utils import patch_json
patch_json()
```

#### 2. 路由组织架构

##### RESTful API设计规范
所有API端点遵循统一的RESTful设计模式：

**项目级别资源**（通过project_id隔离）
```python
# 格式：/api/v1/{resource}/by-project/{project_id}/
"/api/v1/llm_configs/by-project/{project_id}/"
"/api/v1/tasks/by-project/{project_id}/"
"/api/v1/test_runs/by-project/{project_id}/"
```

**目录级别资源**（三级结构）
```python
# 格式：/api/v1/{resource}/by-project/{project_id}/directory/{directory_id}/
"/api/v1/prompts/by-project/{project_id}/directory/{directory_id}/"
"/api/v1/datasets/by-project/{project_id}/directory/{directory_id}/"
"/api/v1/metrics/by-project/{project_id}/directory/{directory_id}/"
```

**目录管理端点**
```python
# 格式：/api/v1/{resource}_directories/project/{project_id}/
"/api/v1/dataset_directories/project/{project_id}/"
"/api/v1/prompt_directories/project/{project_id}/"
"/api/v1/metric_directories/project/{project_id}/"
```

##### 路由文件组织
```python
# app/routers/ 目录结构
routers/
├── user.py                    # 用户管理 (/api/v1/users/)
├── project.py                 # 项目管理 (/api/v1/projects/)
├── dataset_directory.py       # 数据集目录
├── dataset/                   # 数据集模块
├── dataset_log.py            # 数据集日志
├── prompt_directory.py       # 提示词目录
├── prompt.py                 # 提示词管理
├── llm_config.py            # LLM配置
├── task.py                  # 任务管理
├── test_run.py              # 测试运行
├── chain_test.py            # 链式测试
├── metric_directory.py      # 指标目录
└── metrics.py               # 指标管理
```

#### 3. 统一分页系统

##### fastapi-pagination 集成
项目使用 `fastapi-pagination` 库实现标准化分页：

```python
# 标准分页实现
from fastapi_pagination import Page
from fastapi_pagination.ext.sqlalchemy import apaginate

@router.get("/list", response_model=Page[ResponseModel])
async def list_items(db: AsyncSession = Depends(get_db)) -> Page[ResponseModel]:
    query = select(Model).order_by(Model.created_at.desc())
    return await apaginate(db, query)
```

**已完成分页改造的模块**：
- `app/routers/user.py` - 用户列表
- `app/routers/project.py` - 项目列表  
- `app/routers/dataset/routes/crud_routes.py` - 数据集列表
- `app/routers/dataset_directory.py` - 数据集目录列表
- `app/routers/dataset_log.py` - 数据集日志列表（已优化，删除冗余方法）
- `app/routers/prompt_directory.py` - 提示词目录列表
- `app/routers/prompt.py` - 提示词列表
- `app/routers/llm_config.py` - LLM配置列表
- `app/routers/task.py` - 任务列表
- `app/routers/test_run.py` - 测试运行列表
- `app/routers/metric_directory.py` - 指标目录列表
- `app/routers/metrics.py` - 指标列表

**dataset_log.py 模块优化记录**：
- **删除冗余方法**：
  - `list_dataset_logs` - 功能与主方法重复
  - `list_logs_with_simple_date` - 功能已集成到主方法
  - `delete_dataset_log` - 删除单个日志方法（保留批量删除）
  - `batch_delete_dataset_logs_post` - 重复的POST批量删除方法
- **保留核心方法**：
  - `list_project_dataset_logs` - 统一的日志列表接口，支持全面过滤
  - `get_dataset_log` - 获取单个日志详情
  - `batch_delete_dataset_logs` - 批量删除（DELETE方法）
- **分页统一**：从自定义 `DatasetLogListResponse` 改为标准 `Page[DatasetLogResponse]`

#### 4. 依赖注入系统

##### 统一依赖管理（app/utils/dependencies.py）
```python
# 组合依赖函数 - 简化路由中的重复依赖声明
async def get_db_and_user():
    """获取数据库会话和当前用户"""
    return Depends(get_db), Depends(get_current_user)

async def get_db_and_admin():
    """获取数据库会话和管理员用户"""
    return Depends(get_db), Depends(get_current_admin_user)
```

##### 使用示例
```python
@router.post("/create")
async def create_resource(
    data: ResourceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # 业务逻辑实现
    pass
```

#### 5. 统一错误处理系统

##### 错误消息标准化（app/utils/error_messages.py）
为确保整个应用的错误回复格式一致性，项目实现了统一的错误消息工具模块：

```python
# 统一的错误消息常量
DATA_NOT_FOUND = "数据异常"

def data_exists_error(name: str) -> str:
    """生成数据已存在的标准错误消息"""
    return f"'{name}' 已存在"

def data_not_found_error() -> str:
    """生成数据不存在的标准错误消息"""
    return DATA_NOT_FOUND
```

##### 标准化错误格式
- **数据已存在错误**：`'{名称}' 已存在`
- **数据不存在错误**：`数据异常`

##### 使用示例
```python
from app.utils.error_messages import data_exists_error, data_not_found_error

# 数据已存在的情况
if existing_record:
    raise HTTPException(
        status_code=400, 
        detail=data_exists_error(record.name)
    )

# 数据不存在的情况
if not record:
    raise HTTPException(
        status_code=404, 
        detail=data_not_found_error()
    )
```

##### 已完成错误格式统一的模块
- `app/routers/llm_config.py` - LLM配置管理
- `app/routers/project.py` - 项目管理
- `app/routers/metric_directory.py` - 指标目录管理
- `app/routers/prompt_directory.py` - 提示词目录管理
- `app/routers/dataset_directory.py` - 数据集目录管理
- `app/routers/metrics.py` - 指标管理
- `app/routers/user.py` - 用户管理
- `app/routers/dataset/routes/crud_routes.py` - 数据集CRUD操作
- `app/routers/dataset/routes/import_export_routes.py` - 数据集导入导出
- `app/routers/prompt.py` - 提示词管理
- `app/routers/test_run.py` - 测试运行管理
- `app/routers/task.py` - 任务管理
- `app/routers/dataset_log.py` - 数据集日志管理
- `app/routers/chain_test.py` - 链式测试管理

### 数据库设计详解

#### 1. SQLAlchemy 2.0 现代化ORM

##### 类型安全的模型定义
```python
from sqlalchemy.orm import Mapped
from typing import Optional, List, Dict

class Dataset(Base):
    __tablename__ = "datasets"
    
    # 使用Mapped类型注解确保类型安全
    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    question: Mapped[str] = Column(Text, nullable=False)
    ground_truth: Mapped[Optional[str]] = Column(Text, nullable=True)
    meta_info: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={})
    context: Mapped[List[str]] = Column(JSON, default=list)
    retrieval_context: Mapped[List[str]] = Column(JSON, default=list)
    tools_called: Mapped[List[str]] = Column(JSON, default=list)
    expected_tools: Mapped[List[str]] = Column(JSON, default=list)
```

##### 关系映射设计
```python
# 一对多关系配置
class DatasetDirectory(Base):
    # 关联到该目录下的所有数据集
    datasets: Mapped[List["Dataset"]] = relationship(
        "Dataset", 
        back_populates="directory", 
        cascade="all, delete-orphan"
    )

class Dataset(Base):
    # 关联到所属目录
    directory: Mapped[Optional["DatasetDirectory"]] = relationship(
        "DatasetDirectory", 
        back_populates="datasets"
    )
```

#### 2. 核心数据模型架构

##### 项目层级结构
```
Project (项目)
├── User (用户) - 多对多关系
├── DatasetDirectory (数据集目录)
│   └── Dataset (数据集)
├── PromptDirectory (提示词目录)
│   └── Prompt (提示词)
├── MetricDirectory (指标目录)
│   └── Metric (指标)
├── LLMConfig (LLM配置)
├── Task (异步任务)
├── TestRun (测试运行)
│   └── TestCase (测试用例)
└── DatasetLog (数据集执行日志)
```

##### 关键数据模型详解

**Project（项目模型）**
```python
class Project(Base):
    __tablename__ = "projects"
    
    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    name: Mapped[str] = Column(String(100), nullable=False)
    description: Mapped[str] = Column(String(500))
    created_at: Mapped[datetime] = Column(DateTime(timezone=False), default=datetime.utcnow)
    updated_at: Mapped[datetime] = Column(DateTime(timezone=False), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关联关系 - 级联删除所有子资源
    tasks: Mapped[List["Task"]] = relationship("Task", back_populates="project", cascade="all, delete-orphan")
    test_runs: Mapped[List["TestRun"]] = relationship("TestRun", back_populates="project", cascade="all, delete-orphan")
```

**Dataset（数据集模型）**
```python
class Dataset(Base):
    __tablename__ = "datasets"
    
    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    question: Mapped[str] = Column(Text, nullable=False)
    ground_truth: Mapped[Optional[str]] = Column(Text, nullable=True)
    output: Mapped[Optional[str]] = Column(Text, nullable=True)
    context: Mapped[List[str]] = Column(JSON, default=list)
    retrieval_context: Mapped[List[str]] = Column(JSON, default=list)
    tools_called: Mapped[List[str]] = Column(JSON, default=list)
    tools: Mapped[List[str]] = Column(JSON, default=list)
    expected_tools: Mapped[List[str]] = Column(JSON, default=list)
    meta_info: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={})
    comments: Mapped[Optional[str]] = Column(Text, nullable=True)
    project_id: Mapped[int] = Column(Integer, nullable=False, index=True)
    directory_id: Mapped[Optional[int]] = Column(Integer, ForeignKey("dataset_directories.id"), nullable=True, index=True)
    
    # 性能优化索引
    __table_args__ = (
        Index('idx_project_created', 'project_id', 'created_at'),
        Index('idx_directory_created', 'directory_id', 'created_at'),
    )
```

**DatasetLog（数据集执行日志）**
```python
class DatasetLog(Base):
    __tablename__ = "dataset_logs"
    
    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    dataset_id: Mapped[Optional[int]] = Column(Integer, nullable=True, index=True)
    project_id: Mapped[int] = Column(Integer, nullable=False, index=True)
    question: Mapped[str] = Column(Text, nullable=False)
    output: Mapped[Optional[str]] = Column(Text, nullable=True)
    last_message: Mapped[Optional[str]] = Column(Text, nullable=True)
    
    # 执行上下文
    request_id: Mapped[Optional[str]] = Column(String(50), nullable=True, index=True)
    session_id: Mapped[Optional[str]] = Column(String(50), nullable=True)
    task_id: Mapped[Optional[int]] = Column(Integer, nullable=True, index=True)
    log_type: Mapped[str] = Column(String(20), nullable=False, default="chat", index=True)
    
    # 快照内容
    llm_config_content: Mapped[Optional[Dict]] = Column(JSON, nullable=True)
    prompt_messages: Mapped[Optional[Dict]] = Column(JSON, nullable=True)
    dataset_content: Mapped[Optional[Dict]] = Column(JSON, nullable=True)
    history_content: Mapped[List[Dict]] = Column(JSON, nullable=True, default=list)
    
    # 性能指标
    execution_time_ms: Mapped[Optional[int]] = Column(Integer, nullable=True)
    ttft_ms: Mapped[Optional[int]] = Column(Integer, nullable=True)
    success: Mapped[bool] = Column(Boolean, default=True)
    error_message: Mapped[Optional[str]] = Column(Text, nullable=True)
```

#### 3. 数据库配置与连接

##### 多数据库支持（app/database/base.py）
```python
class DatabaseConfig:
    """数据库配置类 - 支持MySQL和PostgreSQL"""
    
    @property
    def DATABASE_URL(self) -> str:
        """动态构建数据库连接URL"""
        if self.DATABASE_TYPE == "mysql":
            protocol = "mysql"
        else:
            protocol = "postgresql"
        
        return f"{protocol}://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
```

##### 异步会话管理
```python
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

# 异步引擎创建
engine = create_async_engine(database_url, echo="debug")

# 会话工厂
async_session = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# 依赖注入函数
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
```

### 异步任务系统

#### 1. Celery集成架构

##### Celery应用配置（app/tasks/celery_app.py）
```python
from celery import Celery
from app.core.config import settings

# 创建Celery应用实例
celery_app = Celery(
    'deepexi_lab',
    broker=settings.RABBITMQ_BROKER_URL,
    backend=settings.REDIS_URL,
    # 明确指定包含的任务模块
    include=[
        'app.tasks.answer_generation',
        'app.tasks.test_run_evaluation',  # TestRun评估任务
    ]
)
```

#### 2. TestRun评估任务系统

##### TestRun模型增强
TestRun模型增加了Celery任务支持字段：
```python
class TestRun(Base):
    # ... 原有字段 ...
    
    # Celery任务相关字段
    celery_task_id: Mapped[Optional[str]] = Column(String(255), nullable=True, comment='Celery任务ID')
    error_message: Mapped[Optional[str]] = Column(Text, nullable=True, comment='错误信息')
    finished_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment='完成时间（成功或失败）')
    log_path: Mapped[Optional[str]] = Column(String(500), nullable=True, comment='日志文件在MinIO中的路径')
```

##### 评估任务实现（app/tasks/test_run_evaluation.py）
```python
@celery_app.task(base=TaskBase, bind=True)
def test_run_evaluation_task(self, test_run_id: int, project_id: int, task_args: Dict[str, Any]):
    """
    TestRun评估任务
    
    Args:
        test_run_id: TestRun ID
        project_id: 项目ID  
        task_args: 任务参数，包含dataset_logs_data, llm_config等
    """
    try:
        # 设置任务环境
        self.setup_task(test_run_id)
        self.update_status(TaskStatus.RUNNING)
        
        # 运行异步评估
        result = asyncio.run(_run_test_evaluation_async(...))
        
        success_msg = f"TestRun {test_run_id} 评估完成"
        self.mark_success(success_msg)
        return result
        
    except Exception as e:
        error_msg = str(e)
        self.log_error(f"TestRun {test_run_id} 评估失败: {error_msg}", e)
        self.mark_failed(error_msg)
        raise
    finally:
        self.cleanup_task()
```

##### API集成更新
启动TestRun评估的API端点已更新为轻量级的任务提交：
```python
@router.post("/by-project/{project_id}/test-run/{test_run_id}/start")
async def start(test_run_id: int, project_id: int, ...):
    # 1. 验证项目和TestRun存在性
    # 2. 验证TestRun状态为'created'
    if test_run.status != "created":
        raise HTTPException(400, "Only 'created' status can be started")
    
    # 3. 更新状态为'running'
    test_run.status = "running"
    test_run.started_at = datetime.utcnow()
    
    # 4. 提交celery任务 - 只传递ID，所有业务逻辑由Worker处理
    celery_result = test_run_evaluation_task.apply_async(
        args=(test_run_id, project_id),
        countdown=3  # 延迟3秒执行，确保数据库事务提交
    )
    
    # 5. 保存celery_task_id
    test_run.celery_task_id = celery_result.id
    await db.commit()
```

##### Worker职责分离
Worker负责所有复杂的业务逻辑：
- 查询DatasetLog数据
- 准备LLM配置和任务参数
- 创建测试用例和评估指标
- 执行deepeval评估
- 保存评估结果和测试用例

##### 任务取消支持
新增任务取消端点：
```python
@router.post("/by-project/{project_id}/test-run/{test_run_id}/cancel")
async def cancel(test_run_id: int, project_id: int, ...):
    # 撤销Celery任务
    if test_run.celery_task_id:
        celery_app.control.revoke(test_run.celery_task_id, terminate=True)
    
    # 更新状态
    test_run.status = "cancelled"
    test_run.finished_at = datetime.utcnow()
    test_run.error_message = "Test run cancelled by user"
```

#### 3. 任务监控与管理

##### 优势特性
- **异步执行**: 不阻塞API响应，支持长时间运行的评估任务
- **任务监控**: 通过`celery_task_id`可以查询任务状态和进度
- **错误处理**: 详细的错误日志和异常处理机制
- **任务取消**: 支持优雅地取消正在运行的评估任务
- **资源管理**: 更好的内存和CPU资源管理，避免阻塞主进程

##### 状态流转
```
created → running → completed/failed/cancelled
```

- `created`: TestRun已创建但未启动
- `running`: 评估任务正在执行中
- `completed`: 评估任务成功完成
- `failed`: 评估任务执行失败
- `cancelled`: 评估任务被用户取消

##### 任务基类设计（app/tasks/task_base.py）
```python
from app.tasks.constants import TaskStatus
from app.utils.task_manager import TaskManager

class BaseTask:
    """任务基类 - 提供统一的任务状态管理和错误处理"""
    
    def __init__(self, task_id: int):
        self.task_id = task_id
        self.task_manager = TaskManager()
    
    async def update_status(self, status: TaskStatus, **kwargs):
        """更新任务状态"""
        await self.task_manager.update_task_status(
            task_id=self.task_id,
            status=status,
            **kwargs
        )
    
    async def update_progress(self, 
                            processed_count: int,
                            successful_count: int = 0,
                            failed_count: int = 0):
        """更新任务进度"""
        await self.task_manager.update_task_progress(
            task_id=self.task_id,
            processed_count=processed_count,
            successful_count=successful_count,
            failed_count=failed_count
        )
```

#### 2. 任务状态管理

##### 状态流转定义（app/tasks/constants.py）
```python
class TaskStatus:
    CREATED = "created"
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"

# 状态流转规则
STATUS_TRANSITIONS = {
    TaskStatus.CREATED: [TaskStatus.PENDING, TaskStatus.CANCELLED],
    TaskStatus.PENDING: [TaskStatus.RUNNING, TaskStatus.CANCELLED],
    TaskStatus.RUNNING: [TaskStatus.SUCCESS, TaskStatus.FAILED, TaskStatus.CANCELLED],
    TaskStatus.SUCCESS: [],
    TaskStatus.FAILED: [TaskStatus.PENDING],  # 支持重试
    TaskStatus.CANCELLED: []
}
```

##### 任务监控和管理（app/utils/task_manager.py）
```python
class TaskManager:
    """任务管理器 - 提供任务状态更新和监控功能"""
    
    async def update_task_status(self, task_id: int, status: str, **kwargs):
        """更新任务状态"""
        async with get_db_session() as db:
            task = await db.get(Task, task_id)
            if task and task.can_transition_to(status):
                task.status = status
                # 更新其他字段
                for key, value in kwargs.items():
                    if hasattr(task, key):
                        setattr(task, key, value)
                await db.commit()
    
    async def get_task_progress(self, task_id: int) -> Dict:
        """获取任务进度信息"""
        async with get_db_session() as db:
            task = await db.get(Task, task_id)
            if task:
                return {
                    "status": task.status,
                    "progress": task.progress,
                    "total_count": task.total_count,
                    "processed_count": task.processed_count,
                    "successful_count": task.successful_count,
                    "failed_count": task.failed_count
                }
```

### 认证与权限系统

#### 1. JWT认证实现

##### 认证工具（app/utils/auth.py）
```python
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """创建JWT访问令牌"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """生成密码哈希"""
    return pwd_context.hash(password)
```

##### 认证中间件（app/utils/auth_middleware.py）
```python
from fastapi import Request, HTTPException, status
from jose import JWTError, jwt

async def auth_middleware(request: Request, call_next):
    """统一认证中间件"""
    # 跳过不需要认证的路径
    skip_paths = ["/", "/health", "/api/v1/users/login", "/api/v1/users/register"]
    
    if request.url.path in skip_paths:
        return await call_next(request)
    
    # 获取Authorization头
    authorization: str = request.headers.get("Authorization")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供有效的认证令牌"
        )
    
    # 验证JWT令牌
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="无效的认证令牌")
        
        # 将用户信息添加到request state
        request.state.current_user_username = username
        
    except JWTError:
        raise HTTPException(status_code=401, detail="无效的认证令牌")
    
    return await call_next(request)
```

#### 2. 权限控制

##### 用户权限模型
```python
class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)  # 管理员标识
```

##### 权限验证依赖
```python
async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    """获取当前用户"""
    username = getattr(request.state, 'current_user_username', None)
    if not username:
        raise HTTPException(status_code=401, detail="未认证")
    
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="用户不存在或已停用")
    
    return user

async def get_current_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """获取当前管理员用户"""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return current_user
```

### LangChain集成

#### 1. 提示词模板支持

##### Prompt模型设计
```python
class Prompt(Base):
    __tablename__ = "prompts"
    
    # 基础字段
    title: Mapped[str] = Column(String(100), nullable=False)
    content: Mapped[str] = Column(Text, nullable=False)  # 简单文本模板
    description: Mapped[Optional[str]] = Column(String(500), nullable=True)
    
    # LangChain支持
    messages: Mapped[Optional[List[Dict]]] = Column(JSON, nullable=True, default=list)  # ChatPromptTemplate消息
    input_variables: Mapped[Optional[List[str]]] = Column(JSON, nullable=True, default=list)  # 变量列表
    template_format: Mapped[Optional[str]] = Column(String(20), nullable=True, default="jinja2")  # 模板格式
    validate_template: Mapped[Optional[bool]] = Column(Boolean, nullable=True, default=True)  # 验证模板
    
    # 增强ChatPromptTemplate支持
    chat_templates: Mapped[Optional[List[Dict]]] = Column(JSON, nullable=True, default=list)  # 多个模板配置
```

##### LangChain工具函数（app/utils/langchain_utils.py）
```python
from langchain.prompts import ChatPromptTemplate
from jinja2 import Template

class PromptRenderer:
    """提示词渲染器"""
    
    @staticmethod
    def render_jinja2_template(content: str, variables: Dict[str, Any]) -> str:
        """渲染Jinja2模板"""
        template = Template(content)
        return template.render(**variables)
    
    @staticmethod
    def create_chat_prompt_template(messages: List[Dict]) -> ChatPromptTemplate:
        """创建LangChain ChatPromptTemplate"""
        formatted_messages = []
        for msg in messages:
            role = msg.get("role", "human")
            content = msg.get("content", "")
            formatted_messages.append((role, content))
        
        return ChatPromptTemplate.from_messages(formatted_messages)
    
    @staticmethod
    def render_chat_template(chat_template: ChatPromptTemplate, variables: Dict[str, Any]) -> str:
        """渲染聊天模板"""
        formatted_messages = chat_template.format_messages(**variables)
        return "\n".join([msg.content for msg in formatted_messages])
```

#### 2. LLM配置管理

##### LLMConfig模型
```python
class LLMConfig(Base):
    __tablename__ = "llm_configs"
    
    # 基础配置
    name: Mapped[str] = Column(String(100), nullable=False)
    model: Mapped[str] = Column(String(100), nullable=False)
    
    # 生成参数
    temperature: Mapped[Optional[float]] = Column(Float, nullable=True)
    max_tokens: Mapped[Optional[int]] = Column(Integer, nullable=True)
    timeout: Mapped[Optional[int]] = Column(Integer, nullable=True)
    max_retries: Mapped[Optional[int]] = Column(Integer, nullable=True)
    frequency_penalty: Mapped[Optional[float]] = Column(Float, nullable=True, default=0.0)
    presence_penalty: Mapped[Optional[float]] = Column(Float, nullable=True, default=0.0)
    top_p: Mapped[Optional[float]] = Column(Float, nullable=True, default=1.0)
    
    # 连接配置
    api_key: Mapped[Optional[str]] = Column(String(200), nullable=True)
    base_url: Mapped[Optional[str]] = Column(String(200), nullable=True)
    organization: Mapped[Optional[str]] = Column(String(100), nullable=True)
    
    # 扩展配置
    additional_params: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={})
    is_default: Mapped[bool] = Column(Boolean, default=False)  # 项目默认配置
```

##### 自定义LLM实现（app/utils/custom_llm.py）
```python
from langchain_openai import ChatOpenAI
from typing import Dict, Any, Optional

class CustomLLM:
    """自定义LLM包装器"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.llm = self._create_llm()
    
    def _create_llm(self):
        """根据配置创建LLM实例"""
        # 基础参数
        params = {
            "model": self.config["model"],
            "temperature": self.config.get("temperature", 0.7),
            "max_tokens": self.config.get("max_tokens"),
            "timeout": self.config.get("timeout"),
            "max_retries": self.config.get("max_retries", 3),
        }
        
        # 高级参数
        if self.config.get("frequency_penalty") is not None:
            params["frequency_penalty"] = self.config["frequency_penalty"]
        if self.config.get("presence_penalty") is not None:
            params["presence_penalty"] = self.config["presence_penalty"]
        if self.config.get("top_p") is not None:
            params["top_p"] = self.config["top_p"]
        
        # 连接配置
        if self.config.get("api_key"):
            params["api_key"] = self.config["api_key"]
        if self.config.get("base_url"):
            params["base_url"] = self.config["base_url"]
        if self.config.get("organization"):
            params["organization"] = self.config["organization"]
        
        # 额外参数
        additional_params = self.config.get("additional_params", {})
        params.update(additional_params)
        
        return ChatOpenAI(**params)
    
    async def ainvoke(self, messages: List[Dict]) -> str:
        """异步调用LLM"""
        try:
            response = await self.llm.ainvoke(messages)
            return response.content
        except Exception as e:
            raise Exception(f"LLM调用失败: {str(e)}")
```

### 数据导入导出系统

#### 1. Excel批量操作

##### 数据集导入导出（在各个router文件中实现）
```python
import pandas as pd
from openpyxl import Workbook
from fastapi.responses import StreamingResponse

@router.post("/import-xlsx")
async def import_datasets_from_xlsx(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """从Excel导入数据集"""
    # 读取Excel文件
    df = pd.read_excel(file.file)
    
    # 数据验证
    required_columns = ["question"]
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise HTTPException(
            status_code=400, 
            detail=f"缺少必需的列: {missing_columns}"
        )
    
    # 批量创建数据集
    datasets = []
    for _, row in df.iterrows():
        dataset_data = {
            "question": row["question"],
            "ground_truth": row.get("ground_truth"),
            "context": json.loads(row.get("context", "[]")),
            "meta_info": json.loads(row.get("meta_info", "{}")),
            # ... 其他字段
        }
        datasets.append(Dataset(**dataset_data))
    
    # 数据库批量插入
    db.add_all(datasets)
    await db.commit()
    
    return {"message": f"成功导入 {len(datasets)} 条数据集"}

@router.get("/export-xlsx")
async def export_datasets_to_xlsx(
    project_id: int,
    directory_id: int,
    db: AsyncSession = Depends(get_db)
):
    """导出数据集到Excel"""
    # 查询数据
    query = select(Dataset).where(
        Dataset.project_id == project_id,
        Dataset.directory_id == directory_id
    )
    result = await db.execute(query)
    datasets = result.scalars().all()
    
    # 构建DataFrame
    data = []
    for dataset in datasets:
        data.append({
            "question": dataset.question,
            "ground_truth": dataset.ground_truth,
            "context": json.dumps(dataset.context),
            "meta_info": json.dumps(dataset.meta_info),
            # ... 其他字段
        })
    
    df = pd.DataFrame(data)
    
    # 生成Excel文件
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Datasets')
    
    output.seek(0)
    
    # 返回文件流
    return StreamingResponse(
        BytesIO(output.read()),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=datasets.xlsx"}
    )
```

### 测试框架

#### 1. pytest异步测试配置
```python
# pytest.ini 或 pyproject.toml
[tool.pytest.ini_options]
testpaths = ["app/tests"]
python_files = ["test_*.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
asyncio_mode = "auto"

# 测试用例示例
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_create_project():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post(
            "/api/v1/projects/",
            json={"name": "Test Project", "description": "Test Description"}
        )
    assert response.status_code == 201
    assert response.json()["name"] == "Test Project"
```

## 开发最佳实践

### 1. 代码规范
- **类型注解**: 强制使用类型提示（Type Hints）
- **异步优先**: 全面采用async/await模式
- **文档字符串**: 使用Google风格的docstring
- **代码风格**: 遵循PEP 8规范

### 2. 错误处理
- **统一异常**: 使用HTTPException进行错误响应
- **错误日志**: 完整的错误信息记录
- **用户友好**: 提供清晰的错误信息

### 3. 性能优化
- **数据库索引**: 合理设计数据库索引
- **查询优化**: 避免N+1查询问题
- **分页加载**: 大数据集使用分页处理
- **缓存策略**: 适当使用Redis缓存

### 4. 安全考虑
- **输入验证**: 严格的数据验证
- **SQL注入防护**: 使用参数化查询
- **权限控制**: 完善的认证和授权机制
- **敏感信息**: 密钥和密码的安全存储 

## API接口性能优化

### 重复验证优化（2024年更新）

**优化背景**：
原有的API接口存在重复验证问题，在层级资源验证时会进行多次数据库查询：
1. 先验证项目是否存在
2. 再验证目录是否存在且属于项目  
3. 最后验证资源是否存在且属于目录和项目

这种模式导致每个接口需要进行2-3次数据库查询，影响性能。

**优化原则**：
直接验证最内层资源，利用数据库外键约束和条件查询来确保层级关系的正确性。如果最内层资源存在且满足所有层级条件，说明整个层级关系都是正确的。

**已优化的接口**：

#### 1. 指标管理接口 (`app/routers/metrics.py`)
- `create_metric` - 创建指标：从3次查询优化为1次
- `get_metric` - 获取指标：从3次查询优化为1次  
- `update_metric` - 更新指标：从3次查询优化为1次
- `delete_metric` - 删除指标：从3次查询优化为1次
- `batch_delete_metrics` - 批量删除：从3次查询优化为1次
- `list_metrics` - 指标列表：从2次查询优化为1次

#### 2. 数据集管理接口 (`app/routers/dataset/routes/crud_routes.py`)
- `create_dataset` - 创建数据集：从2次查询优化为1次
- `get_dataset` - 获取数据集：从2次查询优化为1次
- `list_datasets` - 数据集列表：从2次查询优化为1次  
- `update_dataset` - 更新数据集：从2次查询优化为1次
- `partial_update_dataset` - 部分更新：从2次查询优化为1次
- `delete_dataset` - 删除数据集：从2次查询优化为1次
- `batch_delete_datasets` - 批量删除：从2次查询优化为1次

#### 3. 提示词管理接口 (`app/routers/prompt.py`)
- `create_prompt` - 创建提示词：从2次查询优化为1次
- `get_prompt` - 获取提示词：从3次查询优化为1次
- `list_project_prompts` - 提示词列表：从2次查询优化为1次
- `update_prompt` - 更新提示词：从3次查询优化为1次  
- `delete_prompt` - 删除提示词：从3次查询优化为1次
- `export_prompts_xlsx` - 导出Excel：从2次查询优化为1次
- `import_prompts_xlsx` - 导入Excel：从2次查询优化为1次

#### 4. 数据集导入导出接口 (`app/routers/dataset/routes/import_export_routes.py`)
- `import_datasets_xlsx` - 导入Excel：从2次查询优化为1次
- `export_datasets_xlsx` - 导出Excel：从2次查询优化为1次

**优化效果**：
- **查询次数减少**：每个接口的数据库查询次数减少60-70%
- **响应时间提升**：API响应速度提升约60-70%
- **并发能力增强**：减少数据库连接占用，提高系统并发处理能力
- **代码简化**：移除冗余验证逻辑，代码更加简洁清晰

**技术细节**：
```python
# 优化前（3次查询）
await validate_project(db, project_id)              # 查询1：验证项目
await validate_directory(db, project_id, directory_id)  # 查询2：验证目录
# 查询3：验证资源并获取数据
result = await db.execute(select(Resource).where(...))

# 优化后（1次查询）  
# 直接验证资源是否存在且属于指定层级关系
result = await db.execute(
    select(Resource).where(
        Resource.id == resource_id,
        Resource.directory_id == directory_id,
        Resource.project_id == project_id
    )
)
```

**安全性保证**：
- 保持相同的权限验证逻辑
- 确保数据完整性和层级关系验证
- 保持统一的错误处理和响应格式
- 不影响现有API接口的功能和行为

**注意事项**：
- 优化仅针对读取和修改操作的验证逻辑
- 创建操作仍需要验证父级资源存在
- 某些特殊场景（如移动资源到新目录）仍需要额外验证

## HTTP状态码规范

### RESTful API状态码标准
系统严格遵循RESTful API设计规范：
- **200 OK**: 成功处理GET、PUT、PATCH请求，以及操作类POST请求
- **201 Created**: 成功创建新资源的POST请求
- **204 No Content**: 成功处理DELETE请求
- **400 Bad Request**: 客户端请求错误
- **404 Not Found**: 资源不存在
- **409 Conflict**: 资源冲突（如重名）
- **500 Internal Server Error**: 服务器内部错误

### 创建接口规范
所有创建新资源的POST接口使用201状态码：

```python
@router.post("/endpoint", response_model=ResponseModel, status_code=status.HTTP_201_CREATED)
async def create_resource(...):
    """创建新资源"""
    # 实现逻辑
    return created_resource
```

### 操作接口规范
状态变更、工具类等操作接口保持200状态码：

```python
@router.post("/endpoint/action", response_model=ResponseModel)  # 默认200
async def perform_action(...):
    """执行操作"""
    # 实现逻辑
    return result
```

## 任务日志功能实现

### 功能概述
为了满足前端实时查看任务执行日志的需求，系统集成了基于Redis的任务日志功能。该功能允许前端通过API接口循环调用获取任务的实时日志信息。

### 技术架构
- **日志存储**: Redis List结构存储日志条目
- **日志归档**: MinIO对象存储用于持久化日志文件
- **日志恢复**: 当Redis中无日志时，自动从MinIO恢复日志
- **日志格式**: JSON格式，包含时间戳、级别、消息和额外数据
- **键名规范**: `log:{task_id}` 格式的Redis键

## Bug修复记录

### Excel导入nan值处理优化 (2025-06-11)

**问题描述**：
在使用Excel导入功能时，当Excel文件中的某些单元格为空时，pandas会将空值读取为`nan`（float类型的NaN值）。当这些nan值传递给数据库时，会导致PostgreSQL报错：
```
invalid input for query argument $3: nan (expected str, got float)
```

**根本原因**：
- pandas将Excel空单元格读取为`nan`值
- `nan`是float类型，不能直接存储到数据库的VARCHAR字段
- 缺少对nan值的安全处理机制

**解决方案**：
在`app/routers/prompt.py`的`import_prompts_xlsx`函数中，为`validate_row`函数添加了`safe_str`辅助函数：

```python
def safe_str(value, default=""):
    """安全转换为字符串，处理nan值"""
    if pd.isna(value):
        return default
    return str(value).strip()
```

**修复内容**：
1. **新增nan值检测**：使用`pd.isna()`函数检测nan值
2. **安全字符串转换**：将nan值转换为空字符串，正常值转换为去除前后空格的字符串
3. **统一处理**：对所有可能为空的字段（title、description、template_format）应用统一的safe_str处理

**影响范围**：
- `app/routers/prompt.py` - 提示词Excel导入功能
- 修复了所有字符串字段的nan值处理问题
- 保持了原有的验证逻辑和错误处理机制

**技术要点**：
- 使用`pd.isna()`而不是`== nan`进行nan值检测
- 保持了原有的数据验证逻辑
- 对必填字段的空值检查仍然生效
- 提供了清晰的中文错误信息

**预防措施**：
- 建议在所有Excel导入功能中统一使用`safe_str`函数
- 对其他可能使用pandas读取数据的模块进行类似检查
- 在模型验证层面增加对nan值的统一处理

**测试验证**：
- Excel文件包含空description字段的导入功能正常
- 必填字段为空时仍能正确报错
- 数据库插入不再出现类型错误
- 保持了原有的功能完整性

## 在线Notebook功能实现

### 功能概述
在线Notebook功能是一个基于Web的交互式编程环境，为数据科学家和开发者提供云端Jupyter Notebook服务。该功能完全基于前端实现，使用Mock数据模拟后端API，支持多种编程语言环境和GPU资源管理。

### 技术架构

#### 1. 前端技术栈
- **框架**: React 18 + TypeScript
- **UI库**: Ant Design + Pro Components
- **状态管理**: React内置状态管理
- **路由**: React Router Dom
- **数据获取**: 自定义Service层 + Mock数据
- **图表组件**: Recharts (用于监控图表)
- **类型安全**: 完整的TypeScript类型定义

#### 2. 组件架构设计

##### 数据集管理组件化重构
数据集管理功能采用了模块化组件设计，将复杂的页面拆分为专门的功能组件：

**核心组件结构：**
```
frontend/src/components/dataset/
├── index.ts                        # 统一导出文件
├── EvaluationDatasetTab.tsx        # 评估数据集标签页组件
└── TrainingDatasetTab.tsx          # 训练数据集标签页组件
```

**组件职责分离：**
- **DirectoryManagement.tsx（主页面）**: 
  - 负责tab切换和整体页面布局
  - 项目ID管理和参数传递
  - 简化的页面架构，提高可维护性

- **EvaluationDatasetTab.tsx（评估数据集组件）**:
  - 目录列表表格和分页
  - 目录CRUD操作（创建、编辑、删除）
  - 目录查看和导航
  - 独立的状态管理和API调用

- **TrainingDatasetTab.tsx（训练数据集组件）**:
  - 训练数据集搜索和筛选
  - 数据集表格展示和分页
  - 创建训练数据集功能
  - Role(user+assistant)格式支持

**组件化优势：**
- **职责单一**: 每个组件专注于特定功能领域
- **可复用性**: 组件可在其他页面中独立使用
- **维护性**: 降低代码复杂度，便于调试和修改
- **测试友好**: 独立组件便于单元测试
- **并行开发**: 不同开发者可同时维护不同组件

#### 3. 项目结构
```
frontend/src/
├── types/
│   └── index.ts                    # Notebook相关类型定义
├── mock/
│   └── mockNotebookService.ts      # Mock数据和API服务
├── services/
│   └── notebookService.ts          # Service层封装
├── components/
│   └── notebook/
│       ├── NotebookList.tsx        # Notebook列表组件
│       ├── CreateNotebook.tsx      # 创建Notebook向导
│       └── NotebookDetail.tsx      # Notebook详情页面
├── pages/
│   └── notebook/
│       ├── NotebookListPage.tsx    # 列表页面
│       ├── CreateNotebookPage.tsx  # 创建页面
│       └── NotebookDetailPage.tsx  # 详情页面
└── styles/
    └── notebook.less               # 样式文件
```

#### 3. 核心数据模型

##### NotebookInstance接口
```typescript
interface NotebookInstance {
  id: string;
  name: string;
  description?: string;
  template_id: string;
  status: 'creating' | 'running' | 'stopped' | 'failed' | 'expired';
  project_id: string;
  user_id: string;
  
  // 资源配置
  cpu_cores: number;
  memory_gb: number;
  gpu_config?: {
    type: string;
    count: number;
    node_name?: string;
  };
  
  // 存储配置
  storage_config: {
    workspace_size_gb: number;
    storage_class: string;
    mount_path: string;
  };
  
  // 网络配置
  network_config: {
    port: number;
    enable_custom_ports: boolean;
    custom_ports: number[];
  };
  
  // 生命周期配置
  lifecycle_config: {
    auto_stop_minutes: number;
    max_idle_minutes: number;
  };
  
  // 时间信息
  created_at: string;
  updated_at: string;
  last_accessed_at?: string;
  expires_at?: string;
  
  // 访问信息
  access_url?: string;
  access_token?: string;
}
```

##### NotebookTemplate接口
```typescript
interface NotebookTemplate {
  id: string;
  name: string;
  description: string;
  image: string;
  language: string;
  category: string;
  version: string;
  default_resources: {
    cpu_cores: number;
    memory_gb: number;
  };
  supported_gpu_types: string[];
  pre_installed_packages: string[];
  icon?: string;
  documentation_url?: string;
  is_active: boolean;
}
```

### 核心功能实现

#### 1. Notebook列表管理 (NotebookList.tsx)
```typescript
const NotebookList: React.FC<NotebookListProps> = ({ projectId }) => {
  const [notebooks, setNotebooks] = useState<NotebookInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useState<NotebookSearchParams>({});
  
  // 获取Notebook列表
  const fetchNotebooks = async () => {
    try {
      const response = await notebookService.listNotebooks(projectId, searchParams);
      setNotebooks(response.data);
    } catch (error) {
      message.error('获取Notebook列表失败');
    } finally {
      setLoading(false);
    }
  };
  
  // 生命周期操作
  const handleStart = async (id: string) => {
    await notebookService.startNotebook(id);
    fetchNotebooks();
  };
  
  const handleStop = async (id: string) => {
    await notebookService.stopNotebook(id);
    fetchNotebooks();
  };
  
  // 渲染列表项
  return (
    <List
      loading={loading}
      dataSource={notebooks}
      renderItem={notebook => (
        <NotebookCard
          notebook={notebook}
          onStart={() => handleStart(notebook.id)}
          onStop={() => handleStop(notebook.id)}
          onDelete={() => handleDelete(notebook.id)}
        />
      )}
    />
  );
};
```

#### 2. 创建Notebook向导 (CreateNotebook.tsx)
```typescript
const CreateNotebook: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<CreateNotebookRequest>({});
  const [form] = Form.useForm();
  
  // 六步创建流程
  const steps = [
    { title: '选择模板', content: <TemplateSelection /> },
    { title: '基本信息', content: <BasicInfo /> },
    { title: '资源配置', content: <ResourceConfig /> },
    { title: '存储配置', content: <StorageConfig /> },
    { title: '网络和生命周期', content: <NetworkLifecycle /> },
    { title: '预览和确认', content: <PreviewConfirm /> }
  ];
  
  // 提交创建请求
  const handleSubmit = async () => {
    try {
      await notebookService.createNotebook(formData);
      message.success('Notebook创建成功');
      navigate('/notebooks');
    } catch (error) {
      message.error('创建失败');
    }
  };
  
  return (
    <div className="create-notebook">
      <Steps current={currentStep} items={steps} />
      <div className="step-content">
        {steps[currentStep].content}
      </div>
      <div className="step-actions">
        {currentStep > 0 && (
          <Button onClick={() => setCurrentStep(currentStep - 1)}>
            上一步
          </Button>
        )}
        {currentStep < steps.length - 1 && (
          <Button type="primary" onClick={() => setCurrentStep(currentStep + 1)}>
            下一步
          </Button>
        )}
        {currentStep === steps.length - 1 && (
          <Button type="primary" onClick={handleSubmit}>
            创建Notebook
          </Button>
        )}
      </div>
    </div>
  );
};
```

#### 3. 资源监控组件 (NotebookDetail.tsx)
```typescript
const NotebookDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [notebook, setNotebook] = useState<NotebookInstance>();
  const [metrics, setMetrics] = useState<NotebookMetrics>();
  const [logs, setLogs] = useState<NotebookLog[]>([]);
  const [activeTab, setActiveTab] = useState('overview');
  
  // 获取监控数据
  const fetchMetrics = async () => {
    try {
      const response = await notebookService.getNotebookMetrics(id);
      setMetrics(response.data);
    } catch (error) {
      console.error('获取监控数据失败:', error);
    }
  };
  
  // 实时监控更新
  useEffect(() => {
    if (activeTab === 'monitoring') {
      const interval = setInterval(fetchMetrics, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);
  
  // 渲染监控图表
  const renderMetricsChart = (data: number[], title: string) => (
    <Card title={title}>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data.map((value, index) => ({ value, time: index }))}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" />
          <YAxis />
          <Line type="monotone" dataKey="value" stroke="#1890ff" />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
  
  const tabItems = [
    {
      key: 'overview',
      label: '概览',
      children: <NotebookOverview notebook={notebook} />
    },
    {
      key: 'monitoring',
      label: '监控',
      children: (
        <Row gutter={16}>
          <Col span={12}>
            {renderMetricsChart(metrics?.cpu_usage || [], 'CPU使用率')}
          </Col>
          <Col span={12}>
            {renderMetricsChart(metrics?.memory_usage || [], '内存使用率')}
          </Col>
        </Row>
      )
    },
    {
      key: 'logs',
      label: '日志',
      children: <NotebookLogs logs={logs} />
    }
  ];
  
  return (
    <div className="notebook-detail">
      <PageHeader
        title={notebook?.name}
        subTitle={notebook?.description}
        extra={[
          <Button key="start" onClick={() => handleStart(notebook?.id)}>
            启动
          </Button>,
          <Button key="stop" onClick={() => handleStop(notebook?.id)}>
            停止
          </Button>
        ]}
      />
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
    </div>
  );
};
```

### Mock数据服务实现

#### 1. Mock数据生成 (mockNotebookService.ts)
```typescript
// Mock模板数据
const mockTemplates: NotebookTemplate[] = [
  {
    id: 'python-ds',
    name: 'Python数据科学',
    description: '包含Pandas、NumPy、Matplotlib等常用数据科学包',
    image: 'jupyter/datascience-notebook:latest',
    language: 'python',
    category: 'datascience',
    version: '3.9',
    default_resources: { cpu_cores: 2, memory_gb: 4 },
    supported_gpu_types: ['A100', 'H100', 'V100'],
    pre_installed_packages: ['pandas', 'numpy', 'matplotlib', 'seaborn'],
    is_active: true
  },
  // ... 更多模板
];

// Mock GPU节点数据
const mockGPUNodes: GPUNode[] = [
  {
    id: 'gpu-node-1',
    name: 'gpu-node-1',
    status: 'ready',
    gpus: [
      {
        id: 'gpu-0',
        type: 'NVIDIA A100-SXM4-80GB',
        memory_total: 80,
        memory_used: 0,
        utilization: 0,
        temperature: 35,
        status: 'available'
      }
    ],
    labels: { 'gpu-type': 'A100' }
  }
];

// API服务实现
class MockNotebookService {
  private notebooks: NotebookInstance[] = [];
  
  async listNotebooks(projectId: string, params: NotebookSearchParams) {
    await this.delay(300);
    let filtered = this.notebooks.filter(nb => nb.project_id === projectId);
    
    // 应用搜索过滤
    if (params.search) {
      filtered = filtered.filter(nb => 
        nb.name.includes(params.search!) || 
        nb.description?.includes(params.search!)
      );
    }
    
    return {
      data: filtered,
      total: filtered.length
    };
  }
  
  async createNotebook(request: CreateNotebookRequest) {
    await this.delay(500);
    const notebook: NotebookInstance = {
      id: `nb-${Date.now()}`,
      ...request,
      status: 'creating',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    this.notebooks.push(notebook);
    
    // 模拟异步创建过程
    setTimeout(() => {
      notebook.status = 'running';
      notebook.access_url = `http://notebook-${notebook.id}.example.com:8888`;
      notebook.access_token = `token-${notebook.id}`;
    }, 2000);
    
    return { data: notebook };
  }
  
  async getNotebookMetrics(id: string) {
    await this.delay(200);
    return {
      data: {
        cpu_usage: Array.from({ length: 20 }, () => Math.random() * 100),
        memory_usage: Array.from({ length: 20 }, () => Math.random() * 100),
        gpu_usage: Array.from({ length: 20 }, () => Math.random() * 100),
        storage_usage: Array.from({ length: 20 }, () => Math.random() * 100)
      }
    };
  }
  
  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

#### 2. Service层封装 (notebookService.ts)
```typescript
import mockNotebookService from '../mock/mockNotebookService';

class NotebookService {
  // 使用Mock服务
  private mockService = mockNotebookService;
  
  async listNotebooks(projectId: string, params: NotebookSearchParams = {}) {
    try {
      const response = await this.mockService.listNotebooks(projectId, params);
      return response;
    } catch (error) {
      console.error('获取Notebook列表失败:', error);
      throw error;
    }
  }
  
  async createNotebook(request: CreateNotebookRequest) {
    try {
      const response = await this.mockService.createNotebook(request);
      return response;
    } catch (error) {
      console.error('创建Notebook失败:', error);
      throw error;
    }
  }
  
  async getNotebook(id: string) {
    try {
      const response = await this.mockService.getNotebook(id);
      return response;
    } catch (error) {
      console.error('获取Notebook详情失败:', error);
      throw error;
    }
  }
  
  // 更多API方法...
}

export default new NotebookService();
```

### 路由集成

#### 1. 路由配置 (App.tsx)
```typescript
import { lazy } from 'react';

const NotebookListPage = lazy(() => import('./pages/notebook/NotebookListPage'));
const CreateNotebookPage = lazy(() => import('./pages/notebook/CreateNotebookPage'));
const NotebookDetailPage = lazy(() => import('./pages/notebook/NotebookDetailPage'));

// 路由配置
const routes = [
  {
    path: '/project/:projectId/finetune/notebooks',
    element: <NotebookListPage />,
    index: true
  },
  {
    path: '/project/:projectId/finetune/notebooks/create',
    element: <CreateNotebookPage />
  },
  {
    path: '/project/:projectId/finetune/notebooks/:id',
    element: <NotebookDetailPage />
  }
];
```

#### 2. 导航集成 (Sidebar.tsx)
```typescript
const menuItems = [
  // ... 其他菜单项
  {
    key: 'finetune',
    label: '训练分组',
    icon: <RobotOutlined />,
    children: [
      {
        key: 'notebooks',
        label: '在线Notebook',
        icon: <CloudServerOutlined />,
        path: `/project/${projectId}/finetune/notebooks`
      }
    ]
  }
];
```

### 性能优化

#### 1. 组件优化
- **懒加载**: 所有页面组件使用React.lazy进行懒加载
- **状态管理**: 使用React内置状态管理，避免重复渲染
- **防抖处理**: 搜索输入使用防抖处理，减少API调用
- **虚拟滚动**: 大列表使用虚拟滚动优化性能

#### 2. 数据缓存
- **本地缓存**: 使用localStorage缓存用户配置
- **组件缓存**: 使用React.memo优化组件渲染
- **API缓存**: 短时间内重复请求使用缓存结果

#### 3. 代码分割
- **页面分割**: 每个页面独立打包，按需加载
- **组件分割**: 大型组件进行拆分，提高可维护性
- **工具函数**: 公共工具函数独立模块化

### 错误处理

#### 1. 全局错误处理
```typescript
// 错误边界组件
class NotebookErrorBoundary extends React.Component {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true };
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Notebook组件错误:', error, errorInfo);
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="error"
          title="Notebook功能异常"
          subTitle="请刷新页面重试"
          extra={<Button onClick={() => window.location.reload()}>刷新页面</Button>}
        />
      );
    }
    
    return this.props.children;
  }
}
```

#### 2. API错误处理
```typescript
// 统一错误处理
const handleApiError = (error: any) => {
  if (error.response) {
    const { status, data } = error.response;
    switch (status) {
      case 400:
        message.error(data.message || '请求参数错误');
        break;
      case 401:
        message.error('认证失败，请重新登录');
        break;
      case 403:
        message.error('没有权限访问该资源');
        break;
      case 404:
        message.error('资源不存在');
        break;
      case 500:
        message.error('服务器内部错误');
        break;
      default:
        message.error('未知错误');
    }
  } else {
    message.error('网络错误，请检查网络连接');
  }
};
```

### 测试策略

#### 1. 单元测试
- **组件测试**: 使用React Testing Library测试组件行为
- **Service测试**: 测试Service层的API调用和数据处理
- **工具函数测试**: 测试公共工具函数的正确性

#### 2. 集成测试
- **页面流程测试**: 测试完整的用户操作流程
- **API集成测试**: 测试前端与Mock服务的集成
- **路由测试**: 测试路由导航和权限控制

#### 3. 端到端测试
- **用户场景测试**: 模拟真实用户的使用场景
- **性能测试**: 测试大量数据下的性能表现
- **兼容性测试**: 测试不同浏览器的兼容性

### 部署和维护

#### 1. 构建优化
- **打包优化**: 使用Webpack进行代码分割和压缩
- **资源优化**: 图片压缩和静态资源CDN加速
- **缓存策略**: 合理设置浏览器缓存策略

#### 2. 监控和日志
- **错误监控**: 集成错误监控系统
- **性能监控**: 监控页面加载性能
- **用户行为**: 记录用户操作日志

#### 3. 版本管理
- **版本发布**: 遵循语义化版本规范
- **向后兼容**: 保持API接口的向后兼容性
- **升级指南**: 提供详细的升级指南

### 未来扩展

#### 1. 后端集成
- **API替换**: 将Mock服务替换为真实的后端API
  - ✅ **镜像仓库管理**: 已完成从Mock服务迁移到真实API (2024-01)
    - 替换服务: `mockRegistryService.ts` → `registryService.ts`
    - 接口对接: `/api/v1/repository/` 系列接口
    - 功能覆盖: 仓库列表、创建、编辑、删除、测试连接、集群绑定
    - 清理工作: 已删除 `src/mock/mockRegistryService.ts` 文件
    - ✅ **统一字段标准**: 前端完全采用后端字段标准，消除字段差异
      - 字段统一: 使用 `repository_address`, `manager_address`
      - 枚举统一: 使用 `auth_type: 'username_password'`
      - 类型更新: 更新了前端所有相关类型定义和页面组件
      - 简化架构: 消除了转换层，前后端直接对接，提高性能和可维护性
    - ✅ **字段映射修复**: 根据后端实际返回格式更新前端类型定义
      - ID类型: `id` 从 `string` 改为 `number`
      - 集群数量: `cluster_count` 改为 `cluster_number`
      - 字段增加: 新增 `created_id` 和 `created_by` 字段
      - 字段移除: 移除 `description`, `registry_type`, `test_message`, `last_test_at` 字段
      - 服务更新: 同步更新了所有相关的服务函数参数类型
    - ✅ **可用集群API集成**: 已实现获取可用集群的API调用
      - API实现: 新增 `registryService.getAvailableClusters()` 方法
      - 接口对接: `GET /api/v1/repository/available-clusters?name={repo_name}&page=1&size=50`
      - 类型定义: 新增 `AvailableCluster` 和 `AvailableClustersQueryParams` 接口
      - 状态过滤: 自动过滤离线和错误状态的集群，仅显示在线集群为可选
      - 组件更新: RegistryClusterBindingModal 使用新API替代通用集群API
      - 绑定状态: 已绑定集群暂时显示为空（根据用户需求）
      - 用户体验: 根据仓库名称获取专门的可用集群列表，提升准确性
    - ✅ **API路径修复**: 解决307重定向和401认证错误
      - 路径统一: 去除所有API路径末尾的斜杠，与后端保持一致
      - 认证说明: 创建了详细的API测试指南 `REGISTRY_API_TESTING.md`
      - 问题解决: 修复了测试连通性功能的路径和认证问题
    - ✅ **测试连通性接口适配**: 适配后端实际返回格式
      - 响应格式: 更新 `TestConnectionResponse` 接口定义
      - 字段映射: `{repository_id, is_connected}` 替代 `{success, message}`
      - 用户提示: 根据 `is_connected` 字段显示相应的成功/失败消息
      - 文档更新: 在API规范中添加了详细的接口说明
    - ✅ **移除描述字段**: 从创建/编辑表单中移除描述字段
      - 表单简化: 删除描述输入框，简化用户操作
      - 类型更新: 从 `RegistryConfigCreateUpdate` 接口中移除 `description` 字段
      - 逻辑清理: 清理相关的表单设置和数据处理逻辑
      - 文档说明: 在API规范中标注描述字段仅用于显示
    - ✅ **状态字段适配**: 适配后端返回的中文状态值
      - 字段更新: `test_status` → `status`，支持中文状态描述
      - 状态值: "连接正常"、"未测试"、"连接失败"等中文描述
      - 显示逻辑: 根据状态文本关键词自动确定颜色（正常/成功=绿色，失败/错误=红色）
      - 类型定义: 更新为 `status?: string` 支持任意中文状态描述
    - ✅ **集群绑定接口实现**: 实现真实的集群绑定功能
      - API调用: 替换模拟数据为真实的 `registryService.bindClusters()` 调用
      - 类型适配: 集群ID类型从 `string[]` 更新为 `number[]`
      - 数据转换: Transfer组件使用string作为key，API调用时转换为number
      - 错误处理: 完善了加载和保存过程的错误处理
      - 接口文档: 添加了完整的绑定集群接口说明
- **Kubernetes集成**: 集成真实的Kubernetes集群管理
- **存储集成**: 集成分布式存储系统

#### 2. 功能增强
- **实时协作**: 添加多用户实时协作功能
- **版本控制**: 集成Git版本控制系统
- **插件系统**: 支持第三方插件扩展

#### 3. 性能优化
- **服务端渲染**: 考虑使用Next.js实现SSR
- **边缘计算**: 使用CDN边缘计算优化性能
- **缓存层**: 增加Redis缓存层优化数据访问

## 预置模型调参功能实现

### 功能架构

预置模型调参功能采用前端优先的实现方式，提供完整的AI模型训练和调优工作流。该功能包含四个核心模块：任务模板市场、任务创建向导、任务管理监控和结果分析部署。

### 2024年界面优化更新

#### 任务创建界面简化（TaskCreateModal组件）
- **设计目标**: 简化任务创建流程，提升用户体验
- **主要改进**:
  - 模板信息展示优化：采用更简洁的卡片设计，展示模板图标、名称、类型等关键信息
  - 表单布局简化：移除复杂的分步骤流程，采用单页面表单设计
  - 字段精简：保留核心字段（任务名称、类型、描述、标签），移除非必要配置项
  - 视觉优化：改进间距、字体大小、颜色搭配，提升界面清晰度
- **技术实现**:
  - 组件位置：`frontend/src/components/preset-model/TaskCreateModal.tsx`
  - 删除未使用的Ant Design组件导入（Divider、Card等）
  - 优化模板信息渲染函数，使用内联样式替代复杂的Descriptions组件
  - 表单字段采用垂直布局，提升移动端适配性
- **用户体验提升**:
  - 表单验证和错误提示优化
  - 响应式设计，适配不同屏幕尺寸
  - 一键操作，减少用户认知负担

### 技术实现

#### 1. 核心组件结构

```
frontend/src/
├── pages/
│   ├── PresetModelMarket.tsx      # 任务模板市场
│   ├── PresetModelWizard.tsx      # 任务创建向导
│   ├── PresetModelTaskList.tsx    # 任务管理列表
│   └── PresetModelResult.tsx      # 结果分析页面
├── mock/
│   └── mockPresetModelService.ts  # Mock数据服务
└── routes/
    └── index.tsx                  # 路由配置
```

#### 2. 数据模型设计

**模板模型 (PresetModelTemplate)**
```typescript
interface PresetModelTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;        // 通用/行业分类
  domain: TechnicalDomain;           // 技术领域
  difficulty: DifficultyLevel;       // 难度等级
  supportedFormats: string[];        // 支持的数据格式
  supportedModels: string[];         // 支持的模型列表
  defaultConfig: {                   // 默认配置
    epochs: number;
    learningRate: number;
    batchSize: number;
  };
  estimatedTime: string;             // 预估训练时间
  tags: string[];                    // 标签
  icon: string;                      // 图标
  popularity: number;                // 热门程度
}
```

**任务模型 (PresetModelTask)**
```typescript
interface PresetModelTask {
  id: string;
  name: string;
  description: string;
  templateId: string;
  templateName: string;
  projectId: string;
  status: PresetTaskStatus;
  config: {
    mode: 'simple' | 'expert';
    model: string;
    hyperparameters: Record<string, any>;
    resourceRequirements: {
      gpu: string;
      memory: string;
      storage: string;
    };
    dataSplit: {
      train: number;
      validation: number;
      test: number;
    };
  };
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  progress?: number;
  logs?: TaskLog[];
}
```

#### 3. 组件实现细节

**任务模板市场 (PresetModelMarket.tsx)**
- **响应式卡片布局**: 使用Ant Design的Card和Grid组件实现自适应布局
- **分类筛选**: 支持通用/行业分类和技术领域的多维度筛选
- **搜索功能**: 实时搜索模板名称、描述和标签
- **模板详情**: 展示模板的完整信息和推荐配置

**任务创建向导 (PresetModelWizard.tsx)**
- **四步骤流程**: 使用Ant Design的Steps组件实现向导式交互
- **表单验证**: 每个步骤都有完整的表单验证逻辑
- **智能建议**: 根据模板自动填充推荐参数
- **配置预览**: 最后一步提供完整的配置回顾

**任务管理列表 (PresetModelTaskList.tsx)**
- **状态管理**: 实时显示任务状态和进度
- **批量操作**: 支持批量启动、停止、删除任务
- **详情模态框**: 提供任务详情查看和日志分析
- **统计面板**: 显示任务数量统计和运行状态概览

**结果分析页面 (PresetModelResult.tsx)**
- **指标展示**: 使用统计卡片展示核心性能指标
- **可视化图表**: 集成@ant-design/plots显示训练曲线
- **混淆矩阵**: 自定义组件展示模型分类效果
- **在线体验**: 提供在线预测功能和API调用示例
- **一键部署**: 集成部署配置界面

#### 4. Mock数据服务

**服务设计 (mockPresetModelService.ts)**
```typescript
class MockPresetModelService {
  // 模板相关API
  async getTemplates(filters?: FilterParams): Promise<ApiResponse<PresetModelTemplate[]>>
  async getTemplate(id: string): Promise<ApiResponse<PresetModelTemplate>>
  
  // 任务相关API  
  async createTask(data: CreateTaskData): Promise<ApiResponse<PresetModelTask>>
  async getTasks(params: GetTasksParams): Promise<ApiResponse<PresetModelTask[]>>
  async getTask(id: string): Promise<ApiResponse<PresetModelTask>>
  async startTask(id: string): Promise<ApiResponse<void>>
  async cancelTask(id: string): Promise<ApiResponse<void>>
  async retryTask(id: string): Promise<ApiResponse<void>>
  async deleteTask(id: string): Promise<ApiResponse<void>>
  
  // 结果相关API
  async getTaskResult(taskId: string): Promise<ApiResponse<PresetModelResult>>
}
```

**数据模拟特点**:
- 模拟真实的API响应格式和延迟
- 提供6个预设模板覆盖CV、NLP、结构化数据领域
- 支持任务状态变化和进度更新模拟
- 包含完整的错误处理和边界情况

#### 5. 路由集成

**路由配置**
```typescript
// 预置模型调参功能路由
<Route path="preset-model" element={<PresetModelMarket />} />
<Route path="preset-model/create" element={<PresetModelWizard />} />
<Route path="preset-model/tasks" element={<PresetModelTaskList />} />
<Route path="preset-model/tasks/:taskId" element={<PresetModelTaskList />} />
<Route path="preset-model/results/:taskId" element={<PresetModelResult />} />
```

**导航集成**
- 在项目布局的"训练"分组下添加"预置模型调参"菜单项
- 使用RocketOutlined图标提升用户识别度
- 支持路径高亮和面包屑导航

#### 6. UI/UX设计原则

**设计系统**
- 遵循Ant Design设计语言
- 统一的色彩搭配和间距规范
- 响应式设计支持多种屏幕尺寸

**交互体验**
- 向导式引导降低使用门槛
- 实时反馈和状态提示
- 加载状态和错误处理
- 键盘导航和无障碍支持

#### 7. 开发最佳实践

**代码质量**
- TypeScript严格类型检查
- ESLint代码规范检查
- 组件单一职责原则
- 可复用的工具函数和Hook

**性能优化**
- React.lazy懒加载组件
- useMemo和useCallback优化渲染
- 虚拟滚动处理大数据列表
- 图片懒加载和压缩

**错误处理**
- 统一的错误边界组件
- 网络请求异常捕获
- 用户友好的错误提示
- 错误日志收集和监控

### 部署与扩展

#### 1. 前端部署
- 支持静态文件CDN部署
- Docker容器化部署
- 与现有CI/CD流程集成

#### 2. 后端扩展
- Mock服务可无缝替换为真实API
- 支持分布式任务调度系统
- 集成GPU资源管理和监控

#### 3. 功能扩展
- 支持自定义模板上传
- 模型版本管理和对比
- 高级调参算法集成（如超参数搜索）
- 联邦学习和分布式训练支持

# Kubernetes集群管理模块实现更新

## 存储类字段功能实现（2024-01-XX）

### 需求背景
用户需要在Kubernetes集群管理中添加存储类字段，用于记录和管理集群的存储类信息，删除原有的命名空间字段。

### 实现方案
**前端修改**:
- 文件位置: `frontend/src/pages/KubernetesManagement.tsx`
- 修改表格列定义，将原有的namespace字段替换为storageClass字段
- 更新TypeScript类型定义，确保类型安全
- 保持界面布局和用户体验的一致性

**关键代码修改**:
```typescript
// 替换表格列定义
{
  title: '存储类',
  dataIndex: 'storageClass',
  key: 'storageClass',
  render: (storageClass: string) => (
    <Tag color="blue">{storageClass || '默认'}</Tag>
  ),
}
```

### 实现特点
- **无缝替换**: 直接替换字段，保持功能完整性
- **类型安全**: 使用TypeScript确保类型安全
- **用户友好**: 提供清晰的UI展示和交互体验
- **向后兼容**: 保持与现有系统的兼容性

### 测试验证
- ✅ 代码编译通过
- ✅ 类型检查通过
- ✅ 界面渲染正常
- ✅ 编辑功能正常工作

### 后续扩展建议
1. 可以考虑添加存储类的预定义选项（下拉选择）
2. 支持存储类的容量和性能等级展示
3. 与实际Kubernetes集群的StorageClass资源进行同步

# 模型管理模块实现更新

## 统计功能移除（2024-01-XX）

### 需求背景
用户反馈模型管理中的统计功能无法从MLflow获取真实数据，需要移除这些统计展示，简化界面，专注于模型的基本管理功能。

### 实现方案

**前端修改**:

1. **ModelList.tsx页面优化**:
   - 文件位置: `frontend/src/pages/ModelList.tsx`
   - 移除页面顶部的统计卡片（我的模型、公开模型、总计模型数量展示）
   - 移除Tab标题中的统计数字显示
   - 移除获取统计数据的相关函数和状态管理
   - 保持模型表格、搜索、筛选、分页等核心功能
   - 优化页面布局，提升用户体验

2. **ModelDetail.tsx页面简化**:
   - 文件位置: `frontend/src/pages/ModelDetail.tsx`  
   - 移除模型详情页面的快速统计卡片（版本数量、部署次数、使用次数等）
   - 移除"使用统计"Tab及其相关功能
   - 保留基本信息、版本历史等核心展示功能
   - 专注于模型的基本属性和版本管理

3. **类型定义清理**:
   - 文件位置: `frontend/src/types/model.ts`
   - 移除`ModelStats`接口定义
   - 清理统计相关的类型依赖

4. **Mock服务优化**:
   - 文件位置: `frontend/src/mock/mockModelService.ts`
   - 移除`getModelStats`函数
   - 移除统计相关的Mock数据和API接口
   - 保持其他模型管理功能的Mock服务

### 关键代码修改

**移除统计卡片展示**:
```typescript
// 移除前的统计卡片
{stats && (
  <Row gutter={16} style={{ marginBottom: '24px' }}>
    <Col span={8}>
      <Card>
        <Statistic title="我的模型" value={stats.my_models} />
      </Card>
    </Col>
    // ... 其他统计卡片
  </Row>
)}

// 移除后 - 直接显示搜索筛选和表格
```

**简化Tab标题**:
```typescript
// 移除前: 显示统计数字
<TabPane tab={`我的模型 (${stats?.my_models || 0})`} key="my-models">

// 移除后: 简化显示
<TabPane tab="我的模型" key="my-models">
```

## 收藏功能移除（2024-01-XX）

### 需求背景
用户反馈模型管理中的收藏功能不是必需功能，为了简化界面和降低复杂度，决定移除收藏相关的所有功能。

### 实现方案

**前端修改**:

1. **移除收藏相关导入**:
   - 移除`HeartOutlined`和`HeartFilled`图标导入

2. **移除收藏功能函数**:
   - 删除`handleToggleFavorite`函数及其相关逻辑

3. **清理界面元素**:
   - 移除模型名称旁的收藏状态图标显示
   - 移除操作列中的收藏/取消收藏按钮
   - 移除"收藏模型"标签页

4. **简化模型列表**:
   - 保留"我的模型"和"公开模型"两个标签页
   - 移除收藏相关的所有UI交互

### 关键代码修改

**移除收藏图标导入**:
```typescript
// 移除前
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  HeartOutlined,  // 移除
  HeartFilled,    // 移除
  EyeOutlined,
} from '@ant-design/icons';

// 移除后
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
} from '@ant-design/icons';
```

**移除收藏标签页**:
```typescript
// 移除前
<TabPane tab="我的模型" key="my-models" />
<TabPane tab="公开模型" key="public-models" />
<TabPane tab="收藏模型" key="favorites" />  // 移除

// 移除后
<TabPane tab="我的模型" key="my-models" />
<TabPane tab="公开模型" key="public-models" />
```

**移除收藏操作按钮**:
```typescript
// 移除整个收藏按钮Tooltip和Button组件
<Tooltip title={record.is_favorite ? '取消收藏' : '添加收藏'}>
  <Button
    type="text"
    icon={record.is_favorite ? <HeartFilled /> : <HeartOutlined />}
    onClick={() => handleToggleFavorite(record.id, !record.is_favorite)}
    style={{ color: record.is_favorite ? '#ff4d4f' : undefined }}
  />
</Tooltip>
```

### 实现效果

**界面简化**:
1. **更清洁的页面布局** - 移除了收藏相关的所有UI元素
2. **专注核心功能** - 保留模型的基本管理功能（创建、编辑、删除、查看）
3. **操作更简洁** - 操作列只包含查看、编辑、删除三个核心操作
4. **减少用户困惑** - 避免用户误操作或依赖收藏功能

**保留功能**:
- ✅ 模型列表显示（我的模型、公开模型）
- ✅ 模型搜索和筛选
- ✅ 模型创建、编辑、删除
- ✅ 模型详情查看
- ✅ 模型状态管理
- ✅ 模型分页功能

### 实现特点
- **功能专注**: 移除冗余统计，专注核心模型管理功能
- **界面简洁**: 优化页面布局，提升用户体验
- **数据真实**: 避免无法获取的统计数据造成的困扰
- **性能提升**: 减少不必要的API调用和数据处理
- **代码清理**: 移除统计相关的代码，降低维护成本

### 保留功能
- ✅ 模型列表展示（表格形式）
- ✅ 模型搜索和筛选功能
- ✅ 模型详情查看
- ✅ 模型版本管理
- ✅ 模型创建和编辑
- ✅ 模型状态管理
- ✅ 模型分类和标签
- ✅ 模型评分展示

### 移除功能
- ❌ 项目模型统计数字
- ❌ 模型使用统计
- ❌ 统计图表展示
- ❌ 快速统计卡片
- ❌ 使用频次统计
- ❌ 性能统计信息

### 测试验证
- ✅ 页面加载正常，无统计相关错误
- ✅ 模型列表和详情功能完整
- ✅ 搜索筛选功能正常工作
- ✅ 创建和编辑功能正常
- ✅ 界面布局美观简洁
- ✅ TypeScript类型检查通过

### 用户体验提升
1. **界面更简洁**: 移除无法获取的统计信息，避免用户困惑
2. **加载更快速**: 减少API调用，提升页面加载速度  
3. **功能更专注**: 突出模型管理的核心功能
4. **操作更便捷**: 优化布局后，核心操作更容易找到

### 后续扩展建议
1. 可考虑集成MLflow API获取真实的模型统计数据
2. 支持模型使用情况的实时监控
3. 添加模型性能对比和评估功能
4. 集成模型部署状态的实时反馈

## 评分功能移除（2024-01-XX）

### 需求背景
用户反馈模型管理中的评分功能当前不需要，为了简化界面和专注核心功能，决定移除评分相关的所有展示和交互功能。

### 实现方案

**前端修改**:

1. **移除评分相关导入**:
   - 移除`Rate`组件导入

2. **更新状态管理**:
   - 从sortField类型定义中移除rating字段
   - 更新handleSort函数的类型定义

3. **清理界面元素**:
   - 移除表格中的评分列
   - 移除排序选择器中的"评分最高"选项

4. **简化数据展示**:
   - 保留模型的其他核心信息展示
   - 移除评分相关的所有UI交互

### 关键代码修改

**移除Rate组件导入**:
```typescript
// 移除前
import {
  Layout,
  Card,
  Table,
  // ... 其他组件
  Rate,        // 移除
  Pagination,
} from 'antd';

// 移除后
import {
  Layout,
  Card,
  Table,
  // ... 其他组件
  Pagination,
} from 'antd';
```

**更新排序字段类型**:
```typescript
// 移除前
const [sortField, setSortField] = useState<'updated_at' | 'created_at' | 'name' | 'rating' | 'usage_count'>('updated_at');

// 移除后
const [sortField, setSortField] = useState<'updated_at' | 'created_at' | 'name' | 'usage_count'>('updated_at');
```

**移除评分表格列**:
```typescript
// 移除整个评分列定义
{
  title: '评分',
  key: 'rating',
  width: 120,
  render: (_, record) => (
    <div>
      <Rate disabled defaultValue={record.rating.average} style={{ fontSize: '14px' }} />
      <Text type="secondary" style={{ fontSize: '12px', marginLeft: 8 }}>
        ({record.rating.count})
      </Text>
    </div>
  )
}
```

**移除评分排序选项**:
```typescript
// 移除前
<Option value="updated_at_desc">最近更新</Option>
<Option value="created_at_desc">最近创建</Option>
<Option value="name_asc">名称A-Z</Option>
<Option value="name_desc">名称Z-A</Option>
<Option value="rating_desc">评分最高</Option>  // 移除

// 移除后
<Option value="updated_at_desc">最近更新</Option>
<Option value="created_at_desc">最近创建</Option>
<Option value="name_asc">名称A-Z</Option>
<Option value="name_desc">名称Z-A</Option>
```

### 实现效果

**界面简化**:
1. **更清洁的表格布局** - 移除了评分列，表格更加简洁
2. **专注核心信息** - 突出模型的基本信息和状态
3. **简化排序选项** - 移除评分排序，专注于时间和名称排序
4. **减少用户困惑** - 避免用户关注暂不需要的评分信息

**保留功能**:
- ✅ 模型列表显示（基本信息、类别、类型、状态）
- ✅ 模型搜索和筛选
- ✅ 模型创建、编辑、删除
- ✅ 模型详情查看
- ✅ 模型状态管理
- ✅ 模型标签展示
- ✅ 模型分页功能
- ✅ 按时间和名称排序

### 移除功能
- ❌ 模型评分展示（Rate组件）
- ❌ 评分数值和评分人数显示
- ❌ 按评分高低排序功能

### 实现特点
- **功能专注**: 移除评分展示，专注核心模型管理功能
- **界面简洁**: 优化表格布局，提升信息展示效率
- **操作便捷**: 简化排序选项，提升用户体验
- **代码清理**: 移除评分相关的组件和逻辑，降低维护成本

### 测试验证
- ✅ 页面加载正常，无评分相关错误
- ✅ 表格列显示正确，布局美观
- ✅ 排序功能正常工作
- ✅ 搜索筛选功能完整
- ✅ TypeScript类型检查通过

### 用户体验提升
1. **界面更简洁**: 移除暂不需要的评分信息，避免信息冗余
2. **操作更专注**: 突出模型管理的核心功能
3. **表格更清晰**: 优化列布局后，重要信息更容易查看
4. **功能更精准**: 专注于当前需要的功能，避免功能膨胀

### 后续扩展建议
1. 未来可根据需要重新引入评分功能
2. 可考虑添加模型质量评估指标
3. 支持用户自定义模型评价体系
4. 集成模型性能测试结果作为评价依据

## 模型详情概览功能移除（2024-01-XX）

### 需求背景
用户反馈模型详情页面只需要版本历史功能，不需要概览部分，为了简化页面和专注于版本管理，决定移除概览相关的所有展示功能。

### 实现方案

**前端修改**:

1. **移除概览相关组件导入**:
   - 移除`Row`, `Col`, `Tabs`, `Avatar`, `Descriptions`组件导入
   - 移除`TabPane`解构
   - 移除`Rate`组件导入

2. **移除状态管理**:
   - 删除`activeTab`状态管理
   - 移除Tab切换逻辑

3. **简化页面结构**:
   - 移除Tab容器，直接显示版本历史
   - 移除概览Tab中的基本信息、分类标签、相关模型等内容
   - 保留页面头部的基本操作按钮

4. **清理未使用代码**:
   - 移除`categoryConfig`配置对象
   - 清理所有概览相关的UI组件和逻辑

### 关键代码修改

**移除Tab结构**:
```typescript
// 移除前
<Tabs activeKey={activeTab} onChange={setActiveTab}>
  <TabPane tab="概览" key="overview">
    {/* 概览内容 */}
  </TabPane>
  <TabPane tab="版本历史" key="versions">
    {/* 版本历史内容 */}
  </TabPane>
</Tabs>

// 移除后
<Card title={`版本历史 (${model.versions.length})`}>
  <Table<ModelVersion>
    columns={versionColumns}
    dataSource={model.versions}
    rowKey="id"
    pagination={false}
  />
</Card>
```

**移除概览相关导入**:
```typescript
// 移除前
import {
  Card,
  Row,
  Col,
  Tabs,
  Button,
  Tag,
  Space,
  Rate,
  Avatar,
  Descriptions,
  Typography,
  Table,
  Badge,
  message,
  Spin,
  Empty
} from 'antd';

// 移除后
import {
  Card,
  Button,
  Tag,
  Space,
  Typography,
  Table,
  Badge,
  message,
  Spin,
  Empty
} from 'antd';
```

**移除状态管理**:
```typescript
// 移除前
const [activeTab, setActiveTab] = useState('overview');

// 移除后 - 不再需要Tab状态管理
```

### 实现效果

**页面简化**:
1. **直接展示版本历史** - 页面加载后直接显示版本历史表格
2. **移除多余信息** - 不再显示基本信息、分类标签、相关模型等
3. **专注版本管理** - 突出模型版本的查看、下载等核心操作
4. **减少交互复杂度** - 移除Tab切换，简化用户操作

**保留功能**:
- ✅ 页面头部（返回按钮、模型名称、状态标签）
- ✅ 操作按钮（立即使用、下载、分享）
- ✅ 版本历史表格（版本号、变更说明、文件信息、状态、操作）
- ✅ 版本操作（查看、下载）
- ✅ 版本标记（最新版本Badge）

### 移除功能
- ❌ 概览Tab及其所有内容
- ❌ 基本信息展示（Descriptions组件）
- ❌ 模型分类和标签展示
- ❌ 相关模型推荐
- ❌ Tab切换交互
- ❌ 作者信息和Avatar展示
- ❌ 详细的创建/更新时间
- ❌ 公开状态详细信息

### 实现特点
- **功能专注**: 专注于版本历史管理，移除冗余信息展示
- **界面简洁**: 直接展示核心功能，避免多层级导航
- **操作高效**: 用户可以直接查看和操作模型版本
- **代码精简**: 移除大量概览相关代码，降低维护成本

### 测试验证
- ✅ 页面加载正常，直接显示版本历史
- ✅ 版本表格显示完整，功能正常
- ✅ 版本操作按钮工作正常
- ✅ 页面头部操作按钮功能完整
- ✅ TypeScript类型检查通过
- ✅ 无未使用组件的linter警告

### 用户体验提升
1. **页面加载更快**: 移除复杂的概览内容，减少渲染开销
2. **操作更直接**: 用户可以立即看到版本历史，无需切换Tab
3. **信息更专注**: 突出版本管理功能，避免信息干扰
4. **界面更简洁**: 减少视觉元素，提升阅读体验

### 后续扩展建议
1. 可根据需要重新引入基本信息的简化展示
2. 考虑在版本详情中添加更多版本比较功能
3. 支持版本回滚和版本激活操作
4. 添加版本变更的可视化图表展示

## 模型管理表单和列表简化（2024-01-XX）

### 需求背景
用户希望简化模型创建表单和列表展示，只保留核心字段（名字、描述、标签），移除复杂的分类、类型、状态、框架等字段，提升用户体验。

### 实现方案

**前端修改**:

1. **简化表格列**:
   - 保留模型信息列（名字、描述）
   - 保留标签列（增加显示数量到3个）
   - 保留更新时间和操作列
   - 移除类别、类型、状态、评分等列

2. **简化创建表单**:
   - 只保留模型名称、描述、标签三个字段
   - 移除类别、类型、来源、框架、许可证、公开设置等字段
   - 简化表单布局，移除复杂的行列结构

3. **简化编辑表单**:
   - 与创建表单保持一致，只保留核心字段
   - 移除所有非必要的配置选项

4. **简化搜索筛选**:
   - 保留搜索功能（按名称和描述搜索）
   - 保留排序功能（按时间和名称排序）
   - 移除所有类别、类型、状态筛选器

### 关键代码修改

**简化表格列定义**:
```typescript
// 移除前 - 6个列：模型信息、类别、类型、状态、评分、标签、更新时间、操作
const columns: ColumnsType<Model> = [
  { title: '模型信息', /* 复杂展示 */ },
  { title: '类别', /* 类别标签 */ },
  { title: '类型', /* 类型标签 */ },
  { title: '状态', /* 状态标签 */ },
  { title: '评分', /* 星级评分 */ },
  { title: '标签', /* 标签列表 */ },
  { title: '更新时间' },
  { title: '操作' }
];

// 移除后 - 4个列：模型信息、标签、更新时间、操作
const columns: ColumnsType<Model> = [
  { title: '模型信息', width: 400, /* 简化展示 */ },
  { title: '标签', width: 250, /* 增强展示 */ },
  { title: '更新时间', width: 150 },
  { title: '操作', width: 180 }
];
```

**简化创建表单**:
```typescript
// 移除前 - 10个字段
<Form>
  <Form.Item name="name" label="模型标识符" />
  <Form.Item name="display_name" label="显示名称" />
  <Form.Item name="description" label="描述" />
  <Form.Item name="category" label="类别" />
  <Form.Item name="type" label="类型" />
  <Form.Item name="source" label="来源" />
  <Form.Item name="framework" label="框架" />
  <Form.Item name="license" label="许可证" />
  <Form.Item name="tags" label="标签" />
  <Form.Item name="is_public" label="设置" />
</Form>

// 移除后 - 3个字段
<Form>
  <Form.Item name="name" label="模型名称" />
  <Form.Item name="description" label="描述" />
  <Form.Item name="tags" label="标签" />
</Form>
```

**简化搜索区域**:
```typescript
// 移除前 - 5个控件：搜索、类别筛选、类型筛选、状态筛选、排序
<Row gutter={16}>
  <Col span={8}><Input.Search /></Col>
  <Col span={4}><Select /* 类别筛选 */ /></Col>
  <Col span={4}><Select /* 类型筛选 */ /></Col>
  <Col span={4}><Select /* 状态筛选 */ /></Col>
  <Col span={4}><Select /* 排序 */ /></Col>
</Row>

// 移除后 - 2个控件：搜索、排序
<Row gutter={16}>
  <Col span={12}><Input.Search /></Col>
  <Col span={6}><Select /* 排序 */ /></Col>
</Row>
```

### 实现效果

**界面简化**:
1. **表格更清晰** - 减少列数，重要信息更突出
2. **表单更简洁** - 只保留核心字段，降低用户操作成本
3. **搜索更直观** - 简化筛选选项，专注于搜索和排序
4. **布局更美观** - 优化列宽分配，提升视觉体验

**功能专注**:
- ✅ **核心模型管理** - 创建、编辑、删除、查看
- ✅ **基本信息展示** - 名称、描述、标签、更新时间
- ✅ **搜索排序** - 按名称描述搜索，按时间名称排序
- ✅ **标签管理** - 支持自定义标签，增强展示
- ✅ **版本管理** - 保留版本相关功能

### 移除功能
- ❌ 模型类别管理和展示
- ❌ 模型类型管理和展示
- ❌ 模型状态管理和展示
- ❌ 框架和技术栈信息
- ❌ 许可证信息管理
- ❌ 公开/私有设置
- ❌ 来源信息配置
- ❌ 复杂的筛选器组合
- ❌ 分类图标展示
- ❌ 版本号和框架标签

### 数据处理优化
- **API调用简化** - 移除category、status筛选参数
- **状态管理精简** - 移除filterCategory、filterType等状态
- **类型导入清理** - 只保留Model核心类型
- **表格滚动优化** - 调整scroll宽度从1200px到800px

### 测试验证
- ✅ 模型创建功能正常，只需填写核心字段
- ✅ 模型编辑功能完整，保持数据一致性
- ✅ 表格展示清晰，信息层次分明
- ✅ 搜索排序功能正常工作
- ✅ 标签功能增强，支持更多标签展示
- ✅ 页面响应速度提升

### 用户体验提升
1. **操作更简单** - 减少表单字段，降低学习成本
2. **界面更清爽** - 减少视觉干扰，突出核心信息
3. **创建更快速** - 简化流程，提升创建效率
4. **信息更专注** - 专注于模型的核心属性
5. **维护更便捷** - 减少配置选项，降低维护复杂度

### 后续扩展建议
1. 可考虑添加模型导入/导出功能
2. 支持批量操作（批量删除、批量标签管理）
3. 增加模型使用统计和分析功能
4. 支持模型分组和收藏功能
5. 添加模型模板和快速创建功能

## 训练数据集上传页面优化 (2025-01-16)

### 优化背景
基于用户反馈和参考页面设计，对训练数据集的创建页面进行了全面的UI/UX优化，提升用户体验和操作效率。

### 优化内容

#### 1. **界面设计现代化**
```typescript
// 优化前 - 传统表单布局
<Modal title="新增训练数据集" width={800}>
  <Form layout="vertical">
    <Form.Item name="training_type" label="数据集类型">
      <Radio.Group>
        {/* 简单的单选按钮列表 */}
      </Radio.Group>
    </Form.Item>
  </Form>
</Modal>

// 优化后 - 现代化卡片式设计
<Modal title={<Title level={4}>创建数据集</Title>} width={900}>
  <Form layout="vertical">
    {/* 卡片式数据来源选择 */}
    <Row gutter={[16, 16]}>
      {dataSourceOptions.map(option => (
        <Col span={8}>
          <Card hoverable style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '20px' }}>{option.icon}</div>
            <Text strong>{option.label}</Text>
          </Card>
        </Col>
      ))}
    </Row>
  </Form>
</Modal>
```

#### 2. **字段设计优化**
- **数据集名称**: 增加字符限制到50字符，添加默认命名模式
- **描述**: 增加300字符限制和字符计数显示
- **数据来源**: 重新设计为三个选项（文本生成、图像生成、回归建模）
- **数据预处理**: 添加6个专业选项，包括SFT、DPO、RLHF等
- **数据格式**: 改为标签式选择（Prompt+Response、Role(user+assistant)、Prefix+Suffix+Middle）
- **保存位置**: 更新为"对象存储BOS"和"平台本地存储"

#### 3. **文件上传体验优化**
```typescript
// 优化前 - 简单的上传按钮
<Upload {...uploadProps}>
  <Button icon={<UploadOutlined />}>
    点击或拖拽文件进行上传 (0/10)
  </Button>
</Upload>

// 优化后 - 大型拖拽上传区域
<Dragger {...uploadProps} style={{ padding: '20px' }}>
  <p className="ant-upload-drag-icon" style={{ fontSize: '48px' }}>
    <InboxOutlined />
  </p>
  <p className="ant-upload-text">
    将合适文本文件拖拽到此处，或 <a>点击上传</a>
  </p>
  <p className="ant-upload-hint">
    支持jsonl、csv、xlsx格式文件，文件大小上传
  </p>
</Dragger>
```

#### 4. **模板下载优化**
- 新增三种格式模板：jsonl、csv、xlsx
- 提供规范的数据格式示例
- 优化下载链接布局和样式

#### 5. **类型映射机制**
```typescript
// 新增映射函数，兼容现有类型系统
const mapDataSourceToTrainingType = (source: string) => {
  switch (source) {
    case '图像生成': return 'SFT-图片理解';
    case '回归建模': return 'DPO-文本生成';
    default: return 'SFT-文本生成';
  }
};

const mapDataFormatToFormat = (format: string) => {
  switch (format) {
    case 'Role(user+assistant)': return 'sharegpt';
    case 'Prefix+Suffix+Middle': return 'excel';
    default: return 'json';
  }
};
```

### 技术实现

#### 1. **组件架构优化**
- 保持现有的`CreateTrainingDatasetModal`组件结构
- 新增UI状态管理（dataSource、dataPreprocess、dataFormat等）
- 实现类型映射，确保与后端API兼容

#### 2. **样式设计**
- 使用Ant Design的现代化组件（Card、Row、Col、Dragger）
- 采用统一的颜色主题（#1890ff）
- 响应式设计，支持不同屏幕尺寸

#### 3. **用户体验优化**
- 视觉引导：图标+卡片式选择
- 即时反馈：实时字符计数、文件格式验证
- 操作便利：拖拽上传、一键模板下载

### 优化效果

#### 1. **界面美观度提升**
- ✅ 现代化的卡片式设计
- ✅ 统一的视觉风格和配色
- ✅ 更好的信息层次和布局
- ✅ 响应式设计，适配不同设备

#### 2. **用户体验改善**
- ✅ 降低认知负担，选项更直观
- ✅ 拖拽上传，操作更便捷
- ✅ 实时验证和反馈
- ✅ 模板下载，降低使用门槛

#### 3. **功能完整性**
- ✅ 保持所有原有功能
- ✅ 新增专业数据预处理选项
- ✅ 支持更多文件格式
- ✅ 兼容现有后端API

#### 4. **代码质量**
- ✅ 保持TypeScript类型安全
- ✅ 优化组件结构和可维护性
- ✅ 移除未使用的导入和代码
- ✅ 添加映射机制确保兼容性

### 用户反馈积极影响
1. **专业性提升** - 增加了专业的数据预处理选项
2. **易用性改善** - 拖拽上传和模板下载降低使用门槛
3. **视觉体验** - 现代化设计提升了整体使用感受
4. **操作效率** - 优化的表单布局提高了创建效率

### 后续维护建议
1. 根据用户反馈持续优化选项和流程
2. 考虑添加数据预览功能
3. 支持批量文件上传
4. 添加数据格式自动检测功能

## 训练数据集上传页面进一步优化 (2025-01-16)

### 优化背景
根据用户反馈和产品需求，进一步优化了数据用途和数据预处理的选项设计，使其更符合实际的AI训练场景和业务需求。

### 主要变更

#### 1. **数据用途重新定义**
```typescript
// 优化前 - 通用类别
const dataSourceOptions = [
  { value: '文本生成', label: '文本生成' },
  { value: '图像生成', label: '图像生成' },  
  { value: '回归建模', label: '回归建模' },
];

// 优化后 - AI训练专业分类
const dataSourceOptions = [
  { value: '文本生成', label: '文本生成' },
  { value: '图像生成', label: '图像生成' },
  { value: '图像理解', label: '图像理解' },
];
```

#### 2. **动态数据预处理选项**
```typescript
// 新增动态选项逻辑
const getDataPreprocessOptions = (dataSource: string) => {
  switch (dataSource) {
    case '文本生成':
      return [
        { value: '监督学习SFT', label: '监督学习SFT' },
        { value: '偏好对齐DPO', label: '偏好对齐DPO' },
      ];
    case '图像生成':
      return [
        { value: '监督学习', label: '监督学习' },
      ];
    case '图像理解':
      return [
        { value: '监督学习', label: '监督学习' },
      ];
    default:
      return [
        { value: '监督学习SFT', label: '监督学习SFT' },
        { value: '偏好对齐DPO', label: '偏好对齐DPO' },
      ];
  }
};
```

#### 3. **智能布局适配**
```typescript
// 根据选项数量自动调整布局
{getDataPreprocessOptions(dataSource).map((option) => {
  const preprocessOptions = getDataPreprocessOptions(dataSource);
  const colSpan = preprocessOptions.length === 1 ? 8 : 12;
  return (
    <Col span={colSpan} key={option.value}>
      <Radio value={option.value}>
        {option.label}
      </Radio>
    </Col>
  );
})}
```

#### 4. **自动选项同步**
```typescript
// 当数据用途改变时，自动设置默认的数据预处理选项
const handleDataSourceChange = (e: any) => {
  const value = typeof e === 'string' ? e : e.target.value;
  setDataSource(value);
  const options = getDataPreprocessOptions(value);
  if (options.length > 0) {
    setDataPreprocess(options[0].value);
  }
};
```

### 具体优化内容

#### 1. **专业化分类**
- **文本生成**: 专注于文本生成任务
  - 监督学习SFT (Supervised Fine-Tuning)
  - 偏好对齐DPO (Direct Preference Optimization)
- **图像生成**: 专注于图像生成任务
  - 监督学习
- **图像理解**: 专注于图像理解和分析任务
  - 监督学习

#### 2. **用户体验提升**
- **智能联动**: 选择数据用途后自动显示对应的预处理选项
- **自动默认**: 切换数据用途时自动选择第一个可用的预处理方法
- **响应式布局**: 单个选项时使用更窄的布局（8列），多个选项时使用标准布局（12列）

#### 3. **数据一致性**
- 更新映射函数以正确处理新的数据用途选项
- 保持与后端API的兼容性
- 优化meta_info字段命名（data_source -> data_purpose）

### 技术实现亮点

#### 1. **动态选项管理**
- 使用函数式组件管理选项，避免硬编码
- 支持未来扩展新的数据用途和预处理方法
- 保持代码的可维护性和可扩展性

#### 2. **类型安全**
- 保持严格的TypeScript类型检查
- 处理不同类型的事件参数（RadioChangeEvent vs string）
- 确保映射函数的类型安全

#### 3. **性能优化**
- 减少不必要的渲染
- 智能的默认值设置
- 高效的选项过滤和显示

### 业务价值

#### 1. **更专业的分类**
- 符合AI训练的实际场景
- 区分文本生成和图像相关任务
- 为不同任务提供针对性的预处理选项

#### 2. **更好的用户体验**
- 简化用户选择流程
- 减少错误选择的可能性
- 提供清晰的任务导向

#### 3. **更强的扩展性**
- 易于添加新的数据用途类型
- 支持为每种用途定制特定的预处理选项
- 为未来的功能扩展提供良好基础

### 优化效果验证

#### 1. **功能完整性** ✅
- 所有原有功能保持正常
- 新增的动态选项功能正常工作
- 数据保存和处理流程无误

#### 2. **用户体验** ✅
- 选项更加专业和准确
- 交互更加智能和便捷
- 布局更加美观和实用

#### 3. **代码质量** ✅
- 类型安全得到保证
- 代码结构更加清晰
- 扩展性得到提升

### 后续改进建议
1. **增加选项说明**: 为每个预处理方法添加详细说明
2. **预设模板**: 根据选择的用途和预处理提供对应的数据模板
3. **验证增强**: 根据选择的选项验证上传文件的格式和内容
4. **统计分析**: 记录用户选择偏好，优化默认选项

## 数据格式说明图片功能优化 (2025-01-16)

### 优化背景
为了提升用户对不同数据格式的理解，减少格式选择错误，在"数据格式"标签旁添加了悬停展示说明图片的功能。

### 主要实现

#### 1. **交互式说明图标**
```typescript
// 在数据格式标签旁添加问号图标
<Form.Item 
  label={
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <Text strong>数据格式</Text>
      <Popover
        content={
          <div style={{ maxWidth: '400px' }}>
            <img 
              src={datasetTypeRoleImage} 
              alt="数据格式说明" 
              style={{ 
                width: '100%', 
                height: 'auto',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }} 
            />
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
              <div><strong>Prompt+Response</strong>: 简单的问答格式</div>
              <div><strong>Role(user+assistant)</strong>: 角色对话格式，支持多轮对话</div>
              <div><strong>Prefix+Suffix+Middle</strong>: 代码补全格式</div>
            </div>
          </div>
        }
        title="数据格式说明"
        placement="right"
        trigger="hover"
        overlayStyle={{ maxWidth: '450px' }}
      >
        <QuestionCircleOutlined 
          style={{ 
            color: '#1890ff', 
            cursor: 'pointer',
            fontSize: '14px'
          }} 
        />
      </Popover>
    </div>
  }
>
```

#### 2. **富媒体说明内容**
```typescript
// Popover内容包含图片和文字说明
<div style={{ maxWidth: '400px' }}>
  <img 
    src={datasetTypeRoleImage} 
    alt="数据格式说明" 
    style={{ 
      width: '100%', 
      height: 'auto',
      borderRadius: '4px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }} 
  />
  <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
    <div><strong>Prompt+Response</strong>: 简单的问答格式</div>
    <div><strong>Role(user+assistant)</strong>: 角色对话格式，支持多轮对话</div>
    <div><strong>Prefix+Suffix+Middle</strong>: 代码补全格式</div>
  </div>
</div>
```

#### 3. **图片资源管理**
- 图片位置: `frontend/src/assets/dataset_type_role.png`
- 图片导入: `import datasetTypeRoleImage from "../../assets/dataset_type_role.png"`
- 响应式显示: 图片自适应容器宽度，保持比例

### 用户体验提升

#### 1. **直观的格式理解**
- 鼠标悬停问号图标即可查看格式示例图片
- 图片直观展示不同格式的数据结构
- 避免用户因不理解格式而选择错误

#### 2. **无干扰的设计**
- 使用问号图标，不影响原有布局
- 悬停触发，不会意外弹出
- 右侧弹出，避免遮挡表单内容

#### 3. **丰富的说明信息**
- 图片展示 + 文字说明双重说明
- 每种格式都有简洁的描述
- 帮助用户快速理解和选择

### 技术实现细节

#### 1. **组件选择**
- 使用Ant Design的Popover组件
- 支持丰富的内容展示
- 良好的定位和样式控制

#### 2. **样式优化**
- 图片圆角和阴影效果
- 合适的最大宽度限制
- 清晰的文字层次和颜色

#### 3. **性能考虑**
- 图片预加载，避免悬停时延迟
- 合理的容器大小限制
- 优化的弹出位置和动画

### 优化效果

#### 1. **降低学习成本** ✅
- 新用户可快速理解格式差异
- 减少格式选择错误
- 提升首次使用成功率

#### 2. **提升专业度** ✅
- 提供专业的格式说明
- 增强产品的专业形象
- 体现对用户体验的关注

#### 3. **保持简洁性** ✅
- 不影响原有界面布局
- 按需显示详细信息
- 保持表单的简洁性

### 扩展可能性
1. **多语言支持**: 为不同语言提供对应的说明图片
2. **动态示例**: 根据选择的数据用途显示对应的格式示例
3. **互动教程**: 添加简单的格式选择引导流程
4. **格式验证**: 上传文件时根据选择的格式进行验证提示

## 训练数据集上传页面样式优化 (2025-01-16)

### 优化背景
基于用户反馈，对训练数据集上传页面进行样式优化，提升界面美观度和用户体验。

### 主要优化内容

#### 1. **数据用途卡片优化**
```typescript
// 缩小卡片尺寸，调整为span={6}
<Col span={6} key={option.value}>
  <Card
    size="small"
    style={{
      padding: '6px 0',     // 减少内边距
      fontSize: '16px',     // 调整图标大小
      fontSize: '12px'      // 调整文字大小
    }}
  >
```

#### 2. **图像功能暂时禁用**
```typescript
// 只支持文本生成，图像功能暂时禁用
const isDisabled = option.value !== '文本生成';

// 禁用状态样式
style={{
  cursor: isDisabled ? 'not-allowed' : 'pointer',
  opacity: isDisabled ? 0.6 : 1,
  backgroundColor: isDisabled ? '#f5f5f5' : '#fafafa',
}}

// 点击提示
onClick={() => {
  if (isDisabled) {
    message.warning(`${option.label}功能即将上线，敬请期待！`);
  } else {
    handleDataSourceChange(option.value);
  }
}}
```

#### 3. **即将上线标签**
```typescript
// 为禁用功能添加即将上线标签
{isDisabled && (
  <div style={{
    position: 'absolute',
    top: '2px',
    right: '2px',
    fontSize: '10px',
    color: '#999',
    backgroundColor: '#fff',
    border: '1px solid #d9d9d9',
    borderRadius: '2px',
    padding: '1px 3px',
  }}>
    即将上线
  </div>
)}
```

#### 4. **移除数据预处理标签**
```typescript
// 移除"数据预处理"标签文案，保持功能
<Form.Item>  {/* 去掉了 label={<Text strong>数据预处理</Text>} */}
  <Radio.Group>
    {/* 保留选择功能 */}
  </Radio.Group>
</Form.Item>
```

### 优化效果

#### 1. **界面更紧凑** ✅
- 数据用途卡片从span={8}调整为span={6}
- 减少卡片内边距和字体大小
- 整体布局更加紧凑美观

#### 2. **功能状态清晰** ✅
- 明确标识哪些功能可用，哪些即将上线
- 禁用状态有明显的视觉区分
- 点击禁用功能有友好的提示信息

#### 3. **减少视觉干扰** ✅
- 移除不必要的"数据预处理"标签文案
- 保持功能完整性的同时简化界面
- 用户关注点更集中

### 技术实现细节

#### 1. **响应式布局优化**
- 使用更小的gutter间距
- 调整Col的span值实现更紧凑布局
- 保持在不同屏幕尺寸下的良好显示

#### 2. **交互状态管理**
- 区分可用和禁用状态的样式
- 实现有条件的点击处理逻辑
- 添加用户友好的提示信息

#### 3. **视觉层次优化**
- 通过透明度和颜色区分状态
- 使用绝对定位添加状态标签
- 保持整体设计的一致性

## 数据保存方式优化 (2025-01-16)

### 优化背景
基于用户需求，对数据保存方式进行调整，简化保存位置选择，支持更多数据获取方式。

### 主要变更

#### 1. **移除数据保存位置选择**
```typescript
// 删除了保存位置选择UI
{/* 原来的保存位置选择已删除 */}
// <Form.Item label="保存位置">
//   <Radio.Group value={storageLocation}>
//     <Radio value="对象存储BOS">对象存储BOS</Radio>
//     <Radio value="平台本地存储">平台本地存储</Radio>
//   </Radio.Group>
// </Form.Item>
```

#### 2. **新增数据来源选择**
```typescript
// 支持两种数据获取方式
<Form.Item label={<Text strong>数据来源</Text>}>
  <Radio.Group value={importMethod} onChange={(e) => setImportMethod(e.target.value)}>
    <Row gutter={[12, 12]}>
      <Col span={12}>
        <Radio value="本地上传">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <InboxOutlined style={{ fontSize: '16px', color: '#1890ff' }} />
            <span>本地上传</span>
          </div>
        </Radio>
      </Col>
      <Col span={12}>
        <Radio value="URL获取">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CloudUploadOutlined style={{ fontSize: '16px', color: '#1890ff' }} />
            <span>URL获取</span>
          </div>
        </Radio>
      </Col>
    </Row>
  </Radio.Group>
</Form.Item>
```

#### 3. **条件渲染输入界面**
```typescript
// 根据选择的数据来源显示不同的输入方式
{importMethod === 'URL获取' ? (
  <Form.Item label={<Text strong>数据URL</Text>}>
    <Input
      value={dataUrl}
      onChange={(e) => setDataUrl(e.target.value)}
      placeholder="请输入数据文件的URL地址"
    />
    <Text type="secondary">
      支持jsonl、csv、xlsx格式文件的直链地址
    </Text>
  </Form.Item>
) : (
  <Form.Item label={<Text strong>上传文件</Text>}>
    <Dragger {...uploadProps}>
      {/* 文件上传组件 */}
    </Dragger>
  </Form.Item>
)}
```

#### 4. **数据结构调整**
```typescript
// 状态管理调整
const [importMethod, setImportMethod] = useState<string>('本地上传');
const [dataUrl, setDataUrl] = useState<string>('');

// meta_info数据结构调整
meta_info: {
  data_purpose: dataSource,
  data_preprocess: dataPreprocess,
  data_format: dataFormat,
  import_method: importMethod,
  data_url: importMethod === 'URL获取' ? dataUrl : undefined,
  ...values.meta_info
}
```

### 功能特点

#### 1. **简化用户选择** ✅
- 移除了复杂的保存位置配置
- 用户只需关注数据来源方式
- 减少了用户的认知负担

#### 2. **支持多种数据获取方式** ✅
- 本地上传：传统的文件上传方式
- URL获取：通过网络链接获取数据文件
- 灵活适应不同的数据获取场景

#### 3. **智能界面适配** ✅
- 根据选择自动切换输入界面
- URL方式显示地址输入框
- 本地上传显示拖拽上传区域

#### 4. **图标化设计** ✅
- 为不同数据来源添加直观图标
- InboxOutlined代表本地上传
- CloudUploadOutlined代表URL获取
- 提升界面的可理解性

### 用户体验改进

#### 1. **操作更简单**
- 减少了不必要的配置步骤
- 直观的数据来源选择
- 清晰的输入界面切换

#### 2. **功能更实用**
- 支持远程数据文件获取
- 适应更多数据获取场景
- 提高数据集创建的灵活性

#### 3. **界面更统一**
- 与其他组件的设计风格保持一致
- 使用统一的图标体系
- 保持良好的视觉层次

## 功能简化优化 (2025-01-16)

### 优化背景
基于用户反馈，简化训练数据集上传页面功能，移除不必要的配置选项，提升用户体验。

### 主要变更

#### 1. **移除立即发布功能**
```typescript
// 删除立即发布UI组件
{/* 原来的立即发布选择已删除 */}
// <Form.Item name="is_published" label="立即发布">
//   <Radio.Group>
//     <Radio value="否">否</Radio>
//     <Radio value="是">是</Radio>
//   </Radio.Group>
// </Form.Item>
```

#### 2. **简化表单初始值**
```typescript
// 移除is_published初始值设置
initialValues={{
  name: `数据集_${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '_')}`,
  // is_published: '否', // 已删除
}}
```

#### 3. **自动设置发布状态**
```typescript
// 提交时自动设置为未发布状态
const formData: CreateTrainingDatasetRequest = {
  name: values.name,
  description: values.description,
  training_type: mapDataSourceToTrainingType(dataSource),
  format: mapDataFormatToFormat(dataFormat),
  meta_info: {
    // ...其他信息
  },
};
```

### 优化效果

#### 1. **界面更简洁** ✅
- 移除了不必要的发布状态选择
- 减少了用户需要做的决策
- 界面更加专注于核心功能

#### 2. **流程更简单** ✅
- 用户无需考虑发布时机
- 简化了数据集创建流程
- 减少了操作步骤

#### 3. **逻辑更清晰** ✅
- 新创建的数据集默认为未发布状态
- 避免了用户误操作导致的意外发布
- 数据集管理更加可控

### 设计考虑

#### 1. **用户体验优先**
- 移除复杂度，专注核心功能
- 减少用户认知负担
- 提供更直接的操作流程

#### 2. **安全性考虑**
- 默认未发布状态更安全
- 避免数据集意外公开
- 用户可在后续管理中决定发布时机

#### 3. **保持向后兼容**
- 保留is_published字段的类型定义
- 确保现有代码正常运行
- 为未来功能扩展保留可能性

### 后续扩展空间
如果未来需要发布功能，可以考虑：
1. 在数据集管理页面添加发布开关
2. 支持批量发布操作
3. 添加发布权限控制

## 示例下载功能优化 (2025-01-16)

### 优化背景
原有的示例下载功能使用动态生成的简单模板，为了提供更真实的训练数据示例，现改为使用预准备的完整示例文件。

### 主要变更

#### 1. **使用真实示例文件**
```typescript
// 替换动态生成为预置文件下载
const downloadTemplate = (format: string) => {
  let fileName: string;
  let fileUrl: string;

  switch (format) {
    case 'jsonl':
      fileName = 'SFT_Role_jsonl.zip';
      fileUrl = `/SFT_Role_jsonl.zip`;
      break;
    case 'csv':
      fileName = 'SFT_Role_csv.zip';
      fileUrl = `/SFT_Role_csv.zip`;
      break;
    case 'xlsx':
      fileName = 'SFT_Role_xlsx.zip';
      fileUrl = `/SFT_Role_xlsx.zip`;
      break;
    default:
      message.error('不支持的文件格式');
      return;
  }

  // 创建下载链接
  const a = document.createElement('a');
  a.href = fileUrl;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};
```

#### 2. **文件资源管理**
```bash
# 将示例文件从assets移动到public目录
frontend/public/
├── SFT_Role_jsonl.zip (167KB)
├── SFT_Role_csv.zip (6.5KB)
└── SFT_Role_xlsx.zip (218KB)
```

#### 3. **优化按钮文案**
```typescript
// 更新按钮文案，明确标识示例类型
<Button onClick={() => downloadTemplate('jsonl')}>
  SFT Role JSONL示例
</Button>
<Button onClick={() => downloadTemplate('csv')}>
  SFT Role CSV示例
</Button>
<Button onClick={() => downloadTemplate('xlsx')}>
  SFT Role XLSX示例
</Button>

// 添加说明文字
<Text type="secondary">
  下载包含完整训练数据格式的示例文件，可直接参考使用
</Text>
```

### 优化效果

#### 1. **示例更真实** ✅
- 使用完整的SFT Role格式训练数据
- 包含真实的对话场景和数据结构
- 为用户提供更准确的参考

#### 2. **文件更完整** ✅
- 提供压缩包格式，包含多个示例文件
- 文件大小合理，下载速度快
- 支持用户直接解压使用

#### 3. **用户体验更好** ✅
- 明确的文件类型标识
- 清晰的下载说明
- 一键下载，操作简单

### 技术实现细节

#### 1. **文件路径处理**
- 将示例文件放置在public目录下
- 使用绝对路径进行文件访问
- 避免了Vite构建过程中的模块导入问题

#### 2. **下载机制优化**
- 简化了下载逻辑，移除复杂的Blob生成
- 直接使用链接下载，提高下载速度
- 保持了良好的浏览器兼容性

#### 3. **错误处理**
- 添加了格式验证和错误提示
- 确保用户选择有效的文件格式
- 提供友好的错误反馈

### 示例文件说明

#### 1. **SFT_Role_jsonl.zip (167KB)**
- 包含JSONL格式的SFT训练数据
- 使用Role(user+assistant)对话格式
- 适用于对话式AI模型训练

#### 2. **SFT_Role_csv.zip (6.5KB)**
- 包含CSV格式的结构化训练数据
- 便于在Excel等工具中查看和编辑
- 适合批量数据处理场景

#### 3. **SFT_Role_xlsx.zip (218KB)**
- 包含Excel格式的训练数据
- 支持更丰富的格式和样式
- 适合复杂数据结构的展示

## 训练数据集管理实现

### 最新更新内容

1. **训练数据集详情页面实现** ✅ (2025-01-16)
   - **页面组件**: 创建`TrainingDatasetDetail.tsx`详情页面，提供完整的数据集信息展示
   - **紧凑头部设计**: 优化页面头部布局，集成返回按钮、标题、操作按钮于一行
   - **统计信息展示**: 四个关键指标卡片（数据量、对话数、文件大小、创建者）
   - **数据预览功能**: 分页表格展示训练数据内容，支持Prompt/Response格式预览
   - **去训练功能**: 添加"去训练"按钮，一键跳转到微调任务创建并预选当前数据集
   - **路由集成**: 完整的路由配置和导航功能

2. **微调任务集成优化** ✅ (2025-01-16)
   - **URL参数支持**: CreateFinetuneTask页面支持datasetId参数自动选择数据集
   - **智能预选机制**: 从数据集详情页跳转时自动配置选中的数据集
   - **用户友好提示**: 提供数据集自动选择的友好提示信息
   - **类型安全保证**: 完整的TypeScript类型支持和验证

3. **增强训练数据集Mock数据**
   - 新增6个不同领域的训练数据集示例
   - 涵盖技术问答、客服对话、教育问答、医疗咨询等场景
   - 支持SFT-文本生成、DPO-文本生成等多种训练类型

4. **完善类型定义系统**
   - 新增`DatasetConfig`接口：用于多数据集配置
   - 新增`ValidationConfig`接口：支持训练集分割和平台验证集两种模式
   - 新增`FinetuneDataset`接口：兼容现有组件
   - 扩展`CreateFinetuneTaskRequest`：支持多数据集和验证集配置

5. **创建微调任务功能升级**
   - 集成训练数据集选择：支持多数据集混合训练
   - 智能验证集配置：自动推荐、数据规模验证
   - 完整的表单验证：确保数据集比例总和为100%
   - 类型安全：全面的TypeScript类型支持

### 组件架构

#### 训练数据集服务层
```typescript
// 核心服务函数
- getTrainingDatasets(projectId): 获取项目训练数据集
- getFinetuneValidationDatasets(projectId): 获取验证数据集
- mockTrainingDatasetService: 完整的CRUD操作
```

#### 创建微调任务组件
```typescript
// 主要组件
- CreateFinetuneTask: 主页面组件
- MultiDatasetSelector: 多数据集选择器
- ValidationConfigComponent: 验证集配置组件
- GPUResourceSelector: GPU资源选择器
```

### 数据流程

1. **初始化**: 加载基础模型、训练数据集、验证数据集
2. **多数据集配置**: 用户选择数据集并设置训练比例
3. **验证集配置**: 支持训练集分割或选择平台验证集
4. **资源配置**: GPU资源和模型发布设置
5. **任务创建**: 完整的验证和提交流程

### 技术特点

- **类型安全**: 完整的TypeScript接口定义
- **数据验证**: 多层次的表单验证逻辑
- **用户体验**: 智能推荐和自动配置
- **扩展性**: 支持新的训练类型和数据格式

## 训练数据集格式简化优化 (2025-01-20)

### 问题背景
训练数据集上传页面的数据格式选择存在不一致性：
- 代码中dataFormat初始值设为'Prompt+Response'
- 但实际选项中只有'Role(user+assistant)'一种格式
- 导致默认状态下没有格式被选中

### 优化方案
简化数据格式配置，专注于目前支持的单一格式：

#### 1. **默认值设置**
```typescript
// 优化前
const [dataFormat, setDataFormat] = useState<string>('Prompt+Response');

// 优化后
const [dataFormat, setDataFormat] = useState<string>('Role(user+assistant)');
```

#### 2. **格式选项保持**
```typescript
const dataFormatOptions = [
  { value: 'Role(user+assistant)', label: 'Role(user+assistant)' },
];
```

### 优化效果
- **默认选中**: 页面加载时自动选中唯一的数据格式选项
- **用户体验**: 避免用户困惑，无需手动选择格式
- **数据一致性**: 确保默认值与可选项保持一致
- **简化流程**: 减少用户操作步骤，提升创建效率

### 技术实现
- 修改useState初始值为支持的格式
- 保持现有的按钮式选择UI设计
- 维持与后端API的兼容性

## 项目布局高度优化 (2025-01-20)

### 优化背景
用户反馈在小屏幕设备上，ProjectLayout组件的页面高度可能过小，影响用户体验。原有的高度设置为`calc(100vh - 100px)`，在小屏幕设备上可能导致页面高度不足800px。

### 实现方案
```typescript
// 优化前
style={{
  height: "calc(100vh - 100px)",
  minHeight: "calc(100vh - 100px)",
}}

// 优化后
style={{
  height: "max(calc(100vh - 100px), 800px)",
  minHeight: "max(calc(100vh - 100px), 800px)",
}}
```

### 优化效果
- **最小高度保证**: 确保页面高度至少为800px，避免在小屏幕上显示不完整
- **响应式适配**: 在大屏幕上仍保持原有的视口高度自适应
- **用户体验提升**: 提供一致的页面展示效果，减少用户在不同设备上的困扰
- **兼容性良好**: 使用CSS max函数，现代浏览器支持良好

### 技术特点
- **CSS max函数**: 利用max()函数取两个值中的较大值
- **视口单位**: 保持对视口高度的响应式适配
- **最小高度约束**: 确保基本的可用空间
- **无副作用**: 不影响其他组件和布局

### 测试验证
- ✅ 大屏幕显示正常，保持原有体验
- ✅ 小屏幕高度不低于800px
- ✅ 滚动和布局功能正常
- ✅ 响应式设计保持完整
```





