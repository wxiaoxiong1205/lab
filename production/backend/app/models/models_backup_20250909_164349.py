import json
from datetime import datetime
from typing import List, Dict, Optional

from sqlalchemy import Column, Integer, String, DateTime, JSON, Index, Text, Boolean, Float, UniqueConstraint, Numeric
from sqlalchemy.orm import Mapped

from app.database.base import Base
from app.tasks.constants import TaskStatus


class baseModel(Base):
    # 定义为抽象类，只能被继承，不能实例化
    __abstract__ = True
    # 默认字段
    id:Mapped[int]= Column(Integer, primary_key=True, comment="主键ID")
    created_at:Mapped[datetime] = Column(DateTime(timezone=False), default=datetime.utcnow)
    updated_at:Mapped[datetime] = Column(DateTime(timezone=False), default=datetime.utcnow, onupdate=datetime.utcnow)
    created_id: Mapped[Optional[int]] = Column(Integer, nullable=True, comment='创建者用户ID')
    created_by: Mapped[str] = Column(String(100), nullable=True,comment='创建者用户名称')

class Project(baseModel):
    __tablename__ = "projects"
    name: Mapped[str] = Column(String(100), nullable=False)
    description: Mapped[str] = Column(String(500))




class DatasetDirectory(baseModel):
    """数据集目录表，用于组织数据集"""
    __tablename__ = "dataset_directories"
    
    name: Mapped[str] = Column(String(100), nullable=False)
    description: Mapped[Optional[str]] = Column(String(500), nullable=True)
    project_id: Mapped[int] = Column(Integer, nullable=False)  # 关联到project
    dataset_count: Mapped[int] = Column(Integer, nullable=False, default=0)  # 存储目录中的数据集数量
    
    # 创建联合索引以确保在同一project下目录名称唯一
    __table_args__ = (
        Index('idx_project_directory_name', 'project_id', 'name', unique=True),
        Index('idx_dataset_directories_project_id', 'project_id'),
    )
    

class PromptDirectory(baseModel):
    """提示词目录表，用于组织提示词"""
    __tablename__ = "prompt_directories"
    
    name: Mapped[str] = Column(String(100), nullable=False)
    description: Mapped[Optional[str]] = Column(String(500), nullable=True)
    project_id: Mapped[int] = Column(Integer, nullable=False)  # 关联到project
    prompt_count: Mapped[int] = Column(Integer, nullable=False, default=0)  # 存储目录中的提示词数量
    
    # 创建联合索引以确保在同一project下目录名称唯一
    __table_args__ = (
        Index('idx_project_prompt_directory_name', 'project_id', 'name', unique=True),
    )
    

class Dataset(baseModel):
    __tablename__ = "datasets"
    
    question: Mapped[str] = Column(Text, nullable=False)
    meta_info: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={})  # 存储元数据信息
    project_id: Mapped[int] = Column(Integer, nullable=False)  # 关联到project
    directory_id: Mapped[Optional[int]] = Column(Integer, nullable=True)  # 关联到目录，可为空
    ground_truth: Mapped[Optional[str]] = Column(Text, nullable=True)  # 存储标准答案/ground truth
    output: Mapped[Optional[str]] = Column(Text, nullable=True)  # 存储chain返回结果
    context: Mapped[List[str]] = Column(JSON, default=list)  # 存储上下文信息，用于输入给LLM，改为数组类型
    retrieval_context: Mapped[List[str]] = Column(JSON, default=list)  # 存储检索上下文列表
    tools_called: Mapped[List[str]] = Column(JSON, default=list)  # 存储调用的工具列表
    tools: Mapped[List[str]] = Column(JSON, default=list)  # 存储工具列表
    expected_tools: Mapped[List[str]] = Column(JSON, default=list)  # 存储期望调用的工具列表
    comments: Mapped[Optional[str]] = Column(Text, nullable=True)  # 存储数据集备注信息
    
    @staticmethod
    def validate_meta_info(meta_info_str: str) -> Dict:
        """
        验证meta_info是否为合法的JSON结构
        
        Args:
            meta_info_str: JSON字符串
            
        Returns:
            解析后的JSON对象
            
        Raises:
            ValueError: 如果JSON格式不合法
        """
        if not meta_info_str:
            return {}
            
        try:
            return json.loads(meta_info_str) if isinstance(meta_info_str, str) else meta_info_str
        except json.JSONDecodeError:
            raise ValueError("Invalid JSON format for meta_info")

class DatasetLog(baseModel):
    """数据集执行日志表，记录每次执行的详细信息（平铺结构）"""
    __tablename__ = "dataset_logs"
    
    # 数据集基本信息
    dataset_id: Mapped[Optional[int]] = Column(Integer, nullable=True)  # 不强制外键约束
    project_id: Mapped[int] = Column(Integer, nullable=False)
    question: Mapped[str] = Column(Text, nullable=False)  # 用户输入的问题
    output: Mapped[Optional[str]] = Column(Text, nullable=True)  # 模型输出
    last_message: Mapped[Optional[str]] = Column(Text, nullable=True)  # 最后一个message
    
    # 执行上下文信息
    request_id: Mapped[Optional[str]] = Column(String(50), nullable=True,)
    session_id: Mapped[Optional[str]] = Column(String(50), nullable=True)
    task_id: Mapped[Optional[int]] = Column(Integer, nullable=True)  # 关联任务ID，可为空
    task_name: Mapped[Optional[str]] = Column(String(255), nullable=True)  # 关联任务名称，可为空
    log_type: Mapped[str] = Column(String(20), nullable=False, default="chat")  # 日志类型，job或chat
    
    # 新增字段 - 存储快照内容
    llm_config_content: Mapped[Optional[Dict]] = Column(JSON, nullable=True)  # 存储llm_config的快照内容
    prompt_messages: Mapped[Optional[Dict]] = Column(JSON, nullable=True)  # 存储prompt的快照内容
    dataset_content: Mapped[Optional[Dict]] = Column(JSON, nullable=True)  # 存储dataset的快照内容
    tools_called: Mapped[List[str]] = Column(JSON, default=list)  # 存储调用的工具列表
    history_content: Mapped[List[Dict]] = Column(JSON, nullable=True, default=list)  # 存储调用模型的历史对话数据
    
    # 输入和元数据
    input_values: Mapped[Optional[Dict]] = Column(JSON, nullable=True)  # 输入值
    meta_info: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={})  # 元数据
    
    # 执行状态信息
    success: Mapped[bool] = Column(Boolean, default=True)  # 是否成功
    error_message: Mapped[Optional[str]] = Column(Text, nullable=True)
    
    # 时间信息
    execution_time_ms: Mapped[Optional[int]] = Column(Integer, nullable=True)  # 执行时间（毫秒）
    ttft_ms : Mapped[Optional[int]] = Column(Integer, nullable=True) # 首token耗时
    
    __table_args__ = (
        Index('idx_dataset_logs_dataset_id', 'dataset_id'),
        Index('idx_dataset_logs_project_id', 'project_id'),
        Index('idx_dataset_logs_task_id', 'task_id'),
    )
    

class Prompt(baseModel):
    __tablename__ = "prompts"
    
    title: Mapped[str] = Column(String(100), nullable=False)
    description: Mapped[Optional[str]] = Column(String(500), nullable=True)
    project_id: Mapped[int] = Column(Integer, nullable=False)  # 关联到project
    directory_id: Mapped[Optional[int]] = Column(Integer, nullable=True)  # 关联到目录，可为空
    
    # LangChain-style ChatPromptTemplate support
    messages: Mapped[Optional[List[Dict]]] = Column(JSON, nullable=True, default=list)  # 存储消息模板列表
    input_variables: Mapped[Optional[List[str]]] = Column(JSON, nullable=True, default=list)  # 存储变量名列表
    template_format: Mapped[Optional[str]] = Column(String(20), nullable=True, default="jinja2")  # 模板格式

    __table_args__ = (
        Index('idx_prompts_project_id', 'project_id'),
        Index('idx_prompts_directory_id', 'directory_id'),
    )


class LLMConfig(baseModel):
    __tablename__ = "llm_configs"
    
    name: Mapped[str] = Column(String(100), nullable=False)
    description: Mapped[Optional[str]] = Column(String(500), nullable=True)
    project_id: Mapped[int] = Column(Integer, nullable=False)  # 关联到project
    
    # LLM基本配置
    model: Mapped[str] = Column(String(100), nullable=False)
    temperature: Mapped[Optional[float]] = Column(Float, nullable=True)
    max_tokens: Mapped[Optional[int]] = Column(Integer, nullable=True)
    timeout: Mapped[Optional[int]] = Column(Integer, nullable=True)
    max_retries: Mapped[Optional[int]] = Column(Integer, nullable=True)
    
    # 模型生成参数
    frequency_penalty: Mapped[Optional[float]] = Column(Float, nullable=True, default=0.0)  # 控制重复度，值越大越不倾向重复内容
    presence_penalty: Mapped[Optional[float]] = Column(Float, nullable=True, default=0.0)  # 控制主题新颖度，值越大越倾向引入新主题
    top_p: Mapped[Optional[float]] = Column(Float, nullable=True, default=1.0)  # 控制输出多样性，值越小则模型输出越确定性
    
    # 可选配置
    api_key: Mapped[Optional[str]] = Column(String(200), nullable=True)
    base_url: Mapped[Optional[str]] = Column(String(200), nullable=True)
    organization: Mapped[Optional[str]] = Column(String(100), nullable=True)
    
    # 其他配置参数，以JSON格式存储
    additional_params: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={})
    
    # 是否为当前项目的默认配置
    is_default: Mapped[bool] = Column(Boolean, default=False)
    
    __table_args__ = (
        Index('idx_llm_configs_project_id', 'project_id'),
    )
    

class User(baseModel):
    __tablename__ = "users"
    
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    hashed_password = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)

    __table_args__ = (
        Index('idx_users_username', 'username'),
        Index('idx_users_email', 'email'),
    )

class Task(baseModel):
    """任务表"""
    __tablename__ = "tasks"
    
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    project_id = Column(Integer, nullable=False)
    prompt_messages = Column(JSON, nullable=True, comment="存储prompt内容的快照")
    llm_config_content = Column(JSON, nullable=True, comment="存储llm_config的快照内容，包括model,temperature等参数")
    task_type = Column(String(50), nullable=False, default="answer-generation")
    status = Column(String(20), nullable=False, default=TaskStatus.CREATED)
    progress = Column(Float, nullable=False, default=0.0)
    directory_id = Column(Integer, nullable=True)
    variable_mappings = Column(JSON, nullable=True)
    
    # 新增Celery相关字段
    celery_task_id = Column(String(255), nullable=True, comment='Celery任务ID')
    log_path = Column(String(500), nullable=True, comment='日志文件在MinIO中的路径')
    total_count = Column(Integer, default=0, comment='任务总处理数据条数')
    processed_count = Column(Integer, default=0, comment='已处理数据条数')
    successful_count = Column(Integer, default=0, comment='成功处理数据条数')
    failed_count = Column(Integer, default=0, comment='失败处理数据条数')
    error_message = Column(Text, nullable=True, comment='错误信息')
    finished_at = Column(DateTime(timezone=False), nullable=True, comment='完成时间（成功或失败）')
    
    # 时间字段
    started_at = Column(DateTime(timezone=False), nullable=True)
    
    
    # 索引
    __table_args__ = (
        Index('ix_tasks_celery_task_id', 'celery_task_id', unique=True),
    )
    
    def can_transition_to(self, target_status: str) -> bool:
        """
        验证状态流转是否合法
        按照task_management.md文档规范定义的状态流转规则：
        CREATED -> PENDING, CANCELLED
        PENDING -> RUNNING, CANCELLED  
        RUNNING -> SUCCESS, FAILED, CANCELLED
        SUCCESS/FAILED/CANCELLED为终态，不可再流转
        """
        return target_status in TaskStatus.VALID_TRANSITIONS.get(self.status, [])
    
    def is_editable(self) -> bool:
        """判断任务是否可编辑 - 只有CREATED状态允许编辑"""
        return self.status in TaskStatus.EDITABLE_STATUSES
    
    def is_cancellable(self) -> bool:
        """判断任务是否可取消 - CREATED、PENDING和RUNNING状态允许取消"""
        return self.status in TaskStatus.CANCELLABLE_STATUSES
    
    def is_deletable(self) -> bool:
        """判断任务是否可删除 - 只有终态允许删除"""
        return self.status in TaskStatus.DELETABLE_STATUSES
    
    def is_finished(self) -> bool:
        """判断任务是否已完成（包括成功、失败、取消）"""
        return self.status in TaskStatus.FINAL_STATUSES

class TestRun(baseModel):
    """Test run table for storing test execution data"""
    __tablename__ = "test_runs"
    
    run_id: Mapped[str] = Column(String(255), nullable=False, unique=True)  # 移除index=True
    project_id: Mapped[int] = Column(Integer, nullable=False)  # 移除index=True
    name: Mapped[str] = Column(String(100), nullable=True)  # 评估任务名称
    model: Mapped[Optional[str]] = Column(String(255), nullable=True)
    dataset: Mapped[Optional[str]] = Column(String(255), nullable=True)
    evaluate_id: Mapped[Optional[int]] = Column(Integer, nullable=True)  # 评估集ID
    metrics: Mapped[Optional[List[Dict]]] = Column(JSON, nullable=True, default=list)  # 存储评估指标列表
    evaluate_model: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={})  # 存储评估模型信息
    hyperparameters: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={})  # 存储超参数
    status: Mapped[Optional[str]] = Column(String(20), nullable=True,) 
    remark: Mapped[Optional[str]] = Column(Text, nullable=True)  # 备注
    total_test_cases: Mapped[int] = Column(Integer, default=0)
    successful_test_cases: Mapped[int] = Column(Integer, default=0)
    testPassed: Mapped[int] = Column(Integer, default=0)  # 通过的测试用例数量
    testFailed: Mapped[int] = Column(Integer, default=0)  # 失败的测试用例数量
    run_duration: Mapped[float] = Column(Float, default=0.0)
    metrics_scores: Mapped[Optional[List[Dict]]] = Column(JSON, default=list)
    avg_metric_scores: Mapped[Optional[List[Dict]]] = Column(JSON, default=list)  # 指标平均分数
    created_at: Mapped[datetime] = Column(DateTime(timezone=False), default=datetime.utcnow)
    started_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True)
    
    # Celery任务相关字段
    celery_task_id: Mapped[Optional[str]] = Column(String(255), nullable=True, comment='Celery任务ID')
    error_message: Mapped[Optional[str]] = Column(Text, nullable=True, comment='错误信息')
    finished_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment='完成时间（成功或失败）')
    log_path: Mapped[Optional[str]] = Column(String(500), nullable=True, comment='日志文件在MinIO中的路径')
        
    # Indexes
    __table_args__ = (
        Index("ix_test_runs_run_id", run_id),
    )

class TestCase(baseModel):
    """Test case table for storing individual test case data within a test run"""
    __tablename__ = "test_cases"
    
    test_run_id: Mapped[int] = Column(Integer,nullable=False)
    project_id: Mapped[int] = Column(Integer, nullable=False) 
    name: Mapped[str] = Column(String(255), nullable=False)
    input: Mapped[str] = Column(Text, nullable=False)
    actual_output: Mapped[str] = Column(Text, nullable=False)
    success: Mapped[bool] = Column(Boolean, default=False)
    metrics_data: Mapped[Optional[List[Dict]]] = Column(JSON, default=list)
    run_duration: Mapped[float] = Column(Float, default=0.0)
    order: Mapped[int] = Column(Integer, default=0)
    is_conversational: Mapped[bool] = Column(Boolean, default=False)
    is_multimodal: Mapped[bool] = Column(Boolean, default=False)
    context: Mapped[List[str]] = Column(JSON, default=list)  # 存储上下文信息，改为数组类型
    retrieval_context: Mapped[List[str]] = Column(JSON, default=list)  # 存储检索上下文列表
    expected_output: Mapped[Optional[str]] = Column(Text, nullable=True)
    tools_called: Mapped[List[Dict]] = Column(JSON, default=list)  # 存储调用的工具列表
    expected_tools: Mapped[List[Dict]] = Column(JSON, default=list)  # 存储期望调用的工具列表
    
    
    # Indexes - use a unique variable name to avoid conflict with TestRun.__table_args__
    __table_args__ = (
        Index("idx_test_cases_test_run_id", "test_run_id"),
        Index("idx_test_cases_success", "success"),
        Index("idx_test_cases_order", "order"),
    )

class MetricDirectory(baseModel):
    """指标目录表，用于组织指标"""
    __tablename__ = "metric_directories"
    
    name: Mapped[str] = Column(String(100), nullable=False)
    description: Mapped[Optional[str]] = Column(String(500), nullable=True)
    project_id: Mapped[int] = Column(Integer, nullable=False)  # 关联到project
    metric_count: Mapped[int] = Column(Integer, nullable=False, default=0)  # 存储目录中的指标数量
    
    # 创建联合索引以确保在同一project下目录名称唯一
    __table_args__ = (
        Index('idx_project_metric_directory_name', 'project_id', 'name', unique=True),
        Index('idx_metric_directories_project_id', 'project_id'),
    )
    

class Metric(baseModel):
    """指标表，用于存储评估指标定义"""
    __tablename__ = "metrics"
    
    name: Mapped[str] = Column(String(100), nullable=False)
    description: Mapped[Optional[str]] = Column(String(500), nullable=True)
    type: Mapped[str] = Column(String(50), nullable=False)  # 指标类型，例如accuracy, precision, recall等
    is_builtin: Mapped[bool] = Column(Boolean, default=False)  # 是否为内置指标
    metric_type: Mapped[str] = Column(String(50), default="builtin", nullable=False)  # 指标分类类型：builtin或geval
    required_params: Mapped[List[str]] = Column(JSON, default=list)  # 必填参数列表
    params_content: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={})  # 参数详细内容和说明
    directory_id: Mapped[Optional[int]] = Column(Integer, nullable=True)  # 关联到目录，可为空
    project_id: Mapped[int] = Column(Integer, nullable=False)  # 关联到project
    
    __table_args__ = (
        Index('idx_metrics_directory_id', 'directory_id'),
        Index('idx_metrics_project_id', 'project_id'),
    )
    

class KubernetesResource(baseModel):
    """Kubernetes资源表，用于管理K8s集群信息"""
    __tablename__ = "k8s_resources"
    
    name: Mapped[str] = Column(String(100), nullable=False, comment="集群名称")
    config: Mapped[Optional[str]] = Column(Text, nullable=False, comment="K8s配置信息(kubeconfig内容)")
    api_server: Mapped[str] = Column(String(255), nullable=False, comment="API服务器地址")
    desc: Mapped[Optional[str]] = Column(String(500), nullable=True, comment="描述信息")
    status: Mapped[str] = Column(String(50), nullable=False, comment="集群状态")
    version: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="K8s版本")
    node_number: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="节点数量")
    
class StorageResource(baseModel):
    """存储资源表，用于管理不同类型的存储服务"""
    __tablename__ = "storage_resources"

    name: Mapped[str] = Column(String(100), nullable=False, comment="存储配置名称")
    type: Mapped[str] = Column(String(50), nullable=False, comment="存储类型(TOS/MinIO/NFS等)")
    desc: Mapped[Optional[str]] = Column(String(500), nullable=True, comment="描述信息")
    status: Mapped[str] = Column(String(50), nullable=False, comment="连接状态")
    config: Mapped[Optional[Dict]] = Column(JSON, nullable=False, default={}, comment="存储配置信息")
    cluster_number: Mapped[Optional[int]] = Column(Integer, default=0, nullable=True, comment="关联集群数量")
    last_test_time: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True)


class KubernetesStorageRelation(baseModel):
    """Kubernetes与存储资源关联表"""
    __tablename__ = "k8s_storage_relation"

    k8s_id: Mapped[int] = Column(Integer, nullable=False, comment="K8s资源ID")
    storage_id: Mapped[int] = Column(Integer, nullable=False, comment="存储资源ID")
    is_mount: Mapped[bool] = Column(Boolean, nullable=False, default=False, comment="是否已挂载")
    csi_name: Mapped[Optional[str]] = Column(String(100), nullable=True, default="juicefs", comment="CSI名称")
    csi_config: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={"version":"v0.29.0"}, comment="CSI配置信息")

    # 创建联合唯一约束
    __table_args__ = (
        UniqueConstraint('k8s_id', 'storage_id', name='uq_k8s_storage'),
    )


class RepositoryResource(baseModel):
    """仓库资源表，用于管理不同类型的代码仓库"""
    __tablename__ = "repository_resources"
    
    name: Mapped[str] = Column(String(100), nullable=False, comment="仓库名称")
    repository_address: Mapped[str] = Column(String(500), nullable=False, comment="仓库地址")
    auth_type: Mapped[str] = Column(String(50), nullable=False, comment="认证方式")
    auth_config: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={}, comment="认证配置信息")
    manager_address: Mapped[Optional[str]] = Column(String(500), nullable=True, comment="管理地址")
    cluster_number: Mapped[Optional[int]] = Column(Integer,default=0, nullable=True, comment="关联集群数量")
    status: Mapped[str] = Column(String(50), nullable=False, comment="仓库状态")
    


class KubernetesRepositoryRelation(baseModel):
    """Kubernetes与仓库资源关联表"""
    __tablename__ = "k8s_repository_relation"
    
    k8s_id: Mapped[int] = Column(Integer, nullable=False, comment="K8s资源ID")
    repository_id: Mapped[int] = Column(Integer, nullable=False, comment="仓库资源ID")
    
    # 创建联合唯一约束
    __table_args__ = (
        UniqueConstraint('k8s_id', 'repository_id', name='uq_k8s_repository'),
    )
    
class ProjectUser(baseModel):
    __tablename__ = "project_user"

    project_id: Mapped[int] = Column(Integer, nullable=False, comment="项目id")
    user_id: Mapped[int] = Column(Integer, nullable=False, comment="用户id")

    # 创建联合唯一约束
    __table_args__ = (
        UniqueConstraint('project_id', 'user_id', name='uq_project_user'),
    )

class ProjectKubernetesRelation(baseModel):
    __tablename__ = "project_k8s_relation"

    project_id: Mapped[int] = Column(Integer, nullable=False, comment="项目id")
    k8s_id: Mapped[int] = Column(Integer, nullable=False, comment="k8s集群id")
    namespace: Mapped[str] = Column(String(63), nullable=False,
                       comment='k8s命名空间，规则“固定前缀-项目id-k8sid”')

    # 创建联合唯一约束
    __table_args__ = (
        UniqueConstraint('project_id', 'k8s_id', name='uq_project_k8s'),
    )


class Notebook(baseModel):
    __tablename__ = "notebooks"
    project_id: Mapped[int] = Column(Integer, nullable=False, comment="项目id")
    namespace: Mapped[str] = Column(String(64), nullable=False, comment="K8s 命名空间")
    instance_name: Mapped[str] = Column(String(64), nullable=False, comment="实例名称")
    image: Mapped[str] = Column(String(255), nullable=False, comment="容器镜像地址")
    gpu_type: Mapped[str] = Column(String(64), nullable=True, comment="GPU/NPU 类型（例如 nvidia.com/gpu、huawei.com/npu）")
    gpu_count: Mapped[int] = Column(Integer, default=0, comment="GPU/NPU 数量")
    resource_cpu_request: Mapped[float] = Column(Numeric(4, 2), nullable=False, comment="CPU 请求，单位：核（G）")
    resource_cpu_limit: Mapped[float] = Column(Numeric(4, 2), nullable=False, comment="CPU 限制，单位：核（G）")
    resource_memory_request: Mapped[float] = Column(Numeric(5, 2), nullable=False, comment="内存请求，单位：GiB")
    resource_memory_limit: Mapped[float] = Column(Numeric(5, 2), nullable=False, comment="内存限制，单位：GiB")
    status: Mapped[int] = Column(Integer, default=0, comment="实例状态：0 未运行 / 1 运行中 / 2 停止 / 3 失败")
    access_url: Mapped[str] = Column(String(512), nullable=True, comment="Notebook 实例的访问地址（服务启动后可访问的 URL）")
    describe: Mapped[str] = Column(String(100), nullable=True, comment="描述")

class RepositoryImages(baseModel):
    __tablename__ = "repository_images"
    image: Mapped[str] = Column(String(), nullable=False, comment="镜像名:tag")
    type: Mapped[int] = Column(Integer, default=0, comment="镜像分类：0 在线notebook / 1 大模型")
    repository_id: Mapped[int] = Column(Integer, nullable=False, comment="仓库id")
    describe: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="描述")
