# API业务流程与系统交互

## 用户角色定义

### 1. 系统管理员（Admin）
- **权限范围**: 系统级完全访问权限
- **主要职责**: 用户管理、系统配置、全局监控
- **访问资源**: 所有项目、用户、系统设置
- **标识字段**: User.is_admin = True

### 2. 普通用户（User）
- **权限范围**: 项目级访问权限
- **主要职责**: 数据集管理、模型评估、任务执行
- **访问资源**: 通过project_id隔离的项目内资源
- **标识字段**: User.is_admin = False

## 核心业务流程

### 1. 认证与授权流程

#### 1.1 JWT认证流程
```mermaid
sequenceDiagram
    participant Client as 客户端
    participant Middleware as 认证中间件
    participant Auth as 认证服务
    participant DB as 数据库

    Client->>Middleware: HTTP请求 + Authorization Header
    Middleware->>Auth: 验证JWT Token
    Auth->>Auth: 解析Token payload
    Auth->>DB: 查询用户信息
    DB-->>Auth: 返回用户数据
    Auth-->>Middleware: 返回用户对象
    Middleware->>API: 传递请求 + 用户信息
    API-->>Client: 返回API响应
```

#### 1.2 项目级权限控制
```mermaid
flowchart TD
    A[API请求] --> B[JWT验证]
    B --> C[提取project_id]
    C --> D[检查用户项目权限]
    D --> E[执行业务逻辑]
    E --> F[返回响应]
    
    B -->|Token无效| G[返回401错误]
    D -->|无项目权限| H[返回403错误]
```

### 2. 项目管理流程

#### 2.1 项目生命周期
```mermaid
flowchart TD
    A[创建项目] --> B[项目运行]
    B --> C[添加资源]
    C --> D[执行任务]
    D --> E[项目维护]
    E --> F[项目删除]
    
    C --> C1[数据集管理]
    C --> C2[提示词管理]
    C --> C3[LLM配置]
    C --> C4[指标定义]
    
    F --> F1[删除数据集日志]
    F --> F2[删除提示词]
    F --> F3[删除数据集]
    F --> F4[删除任务记录]
    F --> F5[删除项目记录]
```

#### 2.2 级联删除策略
```python
# 项目删除时的级联删除顺序
delete_order = [
    "dataset_logs",      # 数据集日志
    "prompts",           # 提示词
    "prompt_directories", # 提示词目录
    "datasets",          # 数据集
    "dataset_directories", # 数据集目录
    "metrics",           # 指标
    "metric_directories", # 指标目录
    "tasks",             # 任务
    "test_runs",         # 测试运行
    "projects"           # 项目
]
```

### 3. 数据集管理流程

#### 3.1 数据集CRUD操作
```mermaid
sequenceDiagram
    participant Client as 客户端
    participant API as API路由
    participant Validator as 数据验证
    participant DB as 数据库
    participant Directory as 目录服务

    Client->>API: 创建数据集请求
    API->>Validator: Pydantic数据验证
    Validator-->>API: 验证通过
    API->>DB: 创建数据集记录
    DB-->>API: 返回数据集ID
    API->>Directory: 更新目录计数
    Directory->>DB: 更新dataset_count
    API-->>Client: 返回数据集信息
```

#### 3.2 批量导入处理
```mermaid
flowchart TD
    A[上传Excel文件] --> B[Pandas解析]
    B --> C[数据格式验证]
    C --> D[批量创建Dataset对象]
    D --> E[数据库批量插入]
    E --> F[更新目录统计]
    F --> G[返回导入结果]
    
    C -->|格式错误| H[返回验证错误]
    E -->|插入失败| I[回滚事务]
```

#### 3.3 数据集执行日志
```mermaid
sequenceDiagram
    participant Chain as 业务逻辑
    participant LogAPI as 日志API
    participant DB as 数据库
    participant Redis as Redis缓存

    Chain->>LogAPI: 创建执行日志
    LogAPI->>DB: 插入DatasetLog记录
    Chain->>LogAPI: 更新执行状态
    LogAPI->>DB: 更新日志状态
    LogAPI->>Redis: 缓存日志信息
    Chain->>LogAPI: 记录性能指标
    LogAPI->>DB: 保存execution_time_ms, ttft_ms
```

### 4. 异步任务处理流程

#### 4.1 Celery任务生命周期
```mermaid
flowchart TD
    A[任务创建] --> B[状态: CREATED]
    B --> C[提交到Celery队列]
    C --> D[状态: PENDING]
    D --> E[Worker接收任务]
    E --> F[状态: RUNNING]
    F --> G{任务执行}
    G -->|成功| H[状态: SUCCESS]
    G -->|失败| I[状态: FAILED]
    G -->|取消| J[状态: CANCELLED]
    
    H --> K[清理资源]
    I --> L[记录错误信息]
    J --> M[释放资源]
```

#### 4.2 答案生成任务流程
```mermaid
sequenceDiagram
    participant User as 用户请求
    participant TaskAPI as 任务API
    participant DB as 数据库
    participant Celery as Celery队列
    participant Worker as Worker进程
    participant LLM as LLM服务

    User->>TaskAPI: 创建答案生成任务
    TaskAPI->>DB: 创建Task记录
    TaskAPI->>Celery: 提交answer_generation任务
    Celery-->>TaskAPI: 返回celery_task_id
    TaskAPI->>DB: 更新celery_task_id
    TaskAPI-->>User: 返回任务信息
    
    Celery->>Worker: 分发任务
    Worker->>DB: 更新状态为RUNNING
    Worker->>DB: 查询数据集和配置
    Worker->>LLM: 批量生成答案
    LLM-->>Worker: 返回生成结果
    Worker->>DB: 更新数据集output字段
    Worker->>DB: 更新任务状态为SUCCESS
```

### 5. LangChain集成流程

#### 5.1 提示词模板渲染
```mermaid
sequenceDiagram
    participant API as 提示词API
    participant Template as Jinja2引擎
    participant LangChain as LangChain服务
    participant Prompt as 提示词对象

    API->>Prompt: 加载提示词配置
    Prompt-->>API: 返回模板内容
    API->>Template: 传入变量进行渲染
    Template-->>API: 返回渲染结果
    API->>LangChain: 创建ChatPromptTemplate
    LangChain-->>API: 返回可执行模板
    API-->>Client: 返回最终提示词
```

#### 5.2 消息模板处理
```python
# 支持的消息类型
message_types = {
    "system": SystemMessage,
    "human": HumanMessagePromptTemplate,
    "ai": AIMessage
}

# 模板渲染过程
def render_chat_template(prompt_data, variables):
    messages = []
    for msg_config in prompt_data.get('messages', []):
        msg_type = msg_config.get('type')
        content = msg_config.get('content')
        
        # Jinja2模板渲染
        template = Template(content)
        rendered_content = template.render(**variables)
        
        # 创建LangChain消息对象
        message = message_types[msg_type](content=rendered_content)
        messages.append(message)
    
    return ChatPromptTemplate.from_messages(messages)
```

### 6. 在线Notebook管理流程

#### 6.1 Notebook实例生命周期
```mermaid
flowchart TD
    A[创建Notebook] --> B[状态: Creating]
    B --> C[资源分配]
    C --> D[容器启动]
    D --> E[状态: Running]
    E --> F[用户使用]
    F --> G{用户操作}
    G -->|继续使用| F
    G -->|手动停止| H[状态: Stopped]
    G -->|自动回收| I[状态: Expired]
    H --> J[用户重启]
    J --> D
    I --> K[资源回收]
    K --> L[状态: Deleted]
    
    C -->|资源不足| M[状态: Failed]
    D -->|启动失败| M
```

#### 6.2 Notebook创建流程
```mermaid
sequenceDiagram
    participant User as 用户
    participant UI as 前端界面
    participant API as Notebook API
    participant K8s as Kubernetes
    participant GPU as GPU管理器

    User->>UI: 选择创建Notebook
    UI->>UI: 六步创建向导
    UI->>API: 提交创建请求
    API->>GPU: 检查GPU资源可用性
    GPU-->>API: 返回可用GPU节点
    API->>Storage: 创建存储卷

    API->>K8s: 创建Notebook Pod
    K8s-->>API: 返回Pod状态
    API->>API: 更新实例状态
    API-->>UI: 返回创建结果
    UI-->>User: 显示Notebook访问链接
```

#### 6.3 资源配置与监控
```mermaid
flowchart TD
    A[资源配置] --> B[CPU配置]
    A --> C[内存配置]
    A --> D[GPU配置]
    
    
    B --> B1[0.5-16核]
    C --> C1[1GB-64GB]
    D --> D1[A100/H100/V100]
    E --> E1[SSD/HDD/NFS]
    
    F[资源监控] --> G[实时监控]
    G --> H[CPU使用率]
    G --> I[内存使用率]
    G --> J[GPU使用率]
    G --> K[存储使用率]
    
    L[告警机制] --> M[资源超限]
    L --> N[实例异常]
    L --> O[自动回收提醒]
```

#### 6.4 数据集成与访问
```mermaid
sequenceDiagram
    participant Notebook as Notebook实例
    participant DataAPI as 数据API
    participant Database as 数据库
    participant External as 外部数据源

    Notebook->>DataAPI: 请求项目数据集
    DataAPI->>Database: 查询数据集列表
    Database-->>DataAPI: 返回数据集信息
    DataAPI-->>Notebook: 返回数据集访问路径
    
    Notebook->>Storage: 读取数据文件
    Storage-->>Notebook: 返回数据内容
    
    Notebook->>External: 连接外部数据源
    External-->>Notebook: 返回数据
    
    Notebook->>Storage: 保存处理结果
    Storage-->>Notebook: 确认保存成功
```

#### 6.5 协作与共享流程
```mermaid
flowchart TD
    A[用户A创建Notebook] --> B[设置共享权限]
    B --> C[生成共享链接]
    C --> D[用户B访问链接]
    D --> E[权限验证]
    E --> F[协作编辑]
    F --> G[版本同步]
    G --> H[结果分享]
    
    H --> I[导出HTML]
    H --> J[导出PDF]
    H --> K[导出Python脚本]
    H --> L[发布报告]
```

### 7. 分页查询优化

#### 7.1 fastapi-pagination集成
```mermaid
flowchart TD
    A[分页请求] --> B[解析分页参数]
    B --> C[构建SQLAlchemy查询]
    C --> D[应用排序条件]
    D --> E[计算总记录数]
    E --> F[应用OFFSET和LIMIT]
    F --> G[执行查询]
    G --> H[构造分页响应]
    H --> I[返回Page对象]
```

#### 7.2 查询性能优化
```python
# 标准分页查询实现
@router.get("/list", response_model=Page[DatasetResponse])
async def list_datasets(
    project_id: int,
    db: AsyncSession = Depends(get_db)
):
    # 构建基础查询，使用索引优化
    query = select(Dataset).where(
        Dataset.project_id == project_id
    ).order_by(Dataset.created_at.desc())
    
    # 使用fastapi-pagination自动处理分页
    return await apaginate(db, query)
```

### 8. 错误处理与监控

#### 8.1 统一错误处理
```mermaid
flowchart TD
    A[API请求] --> B[业务逻辑执行]
    B --> C{是否有异常}
    C -->|是| D[捕获异常]
    C -->|否| E[正常响应]
    
    D --> F[记录错误日志]
    F --> G[返回标准错误响应]
    
    G --> G1[400: 请求参数错误]
    G --> G2[401: 认证失败]
    G --> G3[403: 权限不足]
    G --> G4[404: 资源不存在]
    G --> G5[500: 服务器内部错误]
```

#### 8.2 请求生命周期监控
```python
# RequestLoggingMiddleware记录的信息
log_data = {
    "method": request.method,
    "url": str(request.url),
    "user_agent": request.headers.get("user-agent"),
    "start_time": start_time,
    "end_time": end_time,
    "duration_ms": duration_ms,
    "status_code": response.status_code,
    "user_id": getattr(request.state, 'user_id', None)
}
```

## API设计最佳实践

### 1. RESTful资源设计
```
# 项目级别资源
GET    /api/v1/projects/{project_id}
PUT    /api/v1/projects/{project_id}
DELETE /api/v1/projects/{project_id}

# 项目内资源
GET    /api/v1/datasets/by-project/{project_id}/
POST   /api/v1/datasets/by-project/{project_id}/
GET    /api/v1/datasets/by-project/{project_id}/{dataset_id}

# 目录级别资源
GET    /api/v1/datasets/by-project/{project_id}/directory/{directory_id}/
POST   /api/v1/datasets/by-project/{project_id}/directory/{directory_id}/
```

### 2. 数据验证策略
```python
# 使用Pydantic进行请求验证
class DatasetCreate(BaseModel):
    question: str = Field(..., min_length=1, max_length=5000)
    ground_truth: Optional[str] = None
    context: List[str] = Field(default_factory=list)
    meta_info: Dict[str, Any] = Field(default_factory=dict)
    
    @validator('meta_info')
    def validate_meta_info(cls, v):
        # 自定义验证逻辑
        return v
```

### 3. 数据库事务管理
```python
# 事务边界控制
async def create_dataset_with_directory_update(
    dataset_data: DatasetCreate,
    project_id: int,
    db: AsyncSession
):
    async with db.begin():  # 事务开始
        # 创建数据集
        dataset = Dataset(**dataset_data.dict(), project_id=project_id)
        db.add(dataset)
        await db.flush()  # 获取生成的ID
        
        # 更新目录统计
        if dataset.directory_id:
            directory = await db.get(DatasetDirectory, dataset.directory_id)
            directory.dataset_count += 1
        
        await db.commit()  # 事务提交
        return dataset
``` 