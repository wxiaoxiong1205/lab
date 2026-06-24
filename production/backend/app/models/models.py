from datetime import datetime
from typing import Dict, Optional, List, Any

from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, DateTime, JSON, Index, Text, Boolean, UniqueConstraint, Numeric, \
    event, BigInteger, text, Float, SmallInteger
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, Session

from app.common.status import TaskStatus
from app.common.task_execution import TaskExecutionStatus
from app.database.base import Base
from app.utils import app_runtime_context
from app.utils.timezone_utils import get_current_shanghai_time


# ------------------------------
# SQLAlchemy 事件监听：新增数据自动填充 tenant_id，这里对于insert 语句是有效果的
# ------------------------------
@event.listens_for(Session, "before_flush")
def auto_fill_tenant_id(session: Session, flush_context, instances):
    """
    监听 Session 提交事件：
    - 新增（new）的 TenantBase 子类实例，自动填充当前租户ID
    - 禁止修改（dirty）实例的 tenant_id（防止跨租户篡改数据）
    """
    current_tenant = app_runtime_context.get_tenant_id()

    # 处理新增实例：自动填充 tenant_id
    for instance in session.new:
        if isinstance(instance, baseModel):
            # 如果表中没有租户字段不会出现在这个分支，有租户的统一继承baseModel
            # if not current_tenant:
            #     raise RuntimeError("提交数据前未设置租户ID，租户隔离校验失败")
            if not instance.tenant_id:
                instance.tenant_id = current_tenant


class baseModel(Base):
    # 定义为抽象类，只能被继承，不能实例化
    __abstract__ = True
    # 默认字段
    id: Mapped[int] = Column(Integer, primary_key=True, comment="主键ID")
    created_at: Mapped[datetime] = Column(DateTime(timezone=False), default=get_current_shanghai_time)
    updated_at: Mapped[datetime] = Column(DateTime(timezone=False), default=get_current_shanghai_time,
                                          onupdate=get_current_shanghai_time)
    created_id: Mapped[Optional[int]] = Column(BigInteger, nullable=True, comment='创建者用户ID')
    created_by: Mapped[str] = Column(String(100), nullable=True, comment='创建者用户名称')
    # 所有表必须包含 tenant_id 字段（存储租户标识）
    tenant_id = Column(String(32), nullable=False, comment="租户ID")

    @classmethod
    def async_query(cls, session: AsyncSession):
        return cls.query_class(cls, session=session)


class Project(baseModel):
    __tablename__ = "projects"
    name: Mapped[str] = Column(String(100), nullable=False)
    description: Mapped[str] = Column(String(1000))
    former_name: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="项目曾用名，用于项目名称变更时保留的原始值")
    image_build_namespace: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="镜像命名空间/项目")


# class DatasetDirectory(baseModel):
#     """数据集目录表，用于组织数据集 - 已删除"""
#     __tablename__ = "dataset_directories"
#
#     name: Mapped[str] = Column(String(100), nullable=False)
#     description: Mapped[Optional[str]] = Column(String(500), nullable=True)
#     project_id: Mapped[int] = Column(Integer, nullable=False)  # 关联到project
#     dataset_count: Mapped[int] = Column(Integer, nullable=False, default=0)  # 存储目录中的数据集数量
#
#     # 创建联合索引以确保在同一project下目录名称唯一
#     __table_args__ = (
#         Index('idx_project_directory_name', 'project_id', 'name', unique=True),
#         Index('idx_dataset_directories_project_id', 'project_id'),
#     )


# class PromptDirectory(baseModel):
#     """提示词目录表，用于组织提示词 - 已删除"""
#     __tablename__ = "prompt_directories"
#
#     name: Mapped[str] = Column(String(100), nullable=False)
#     description: Mapped[Optional[str]] = Column(String(500), nullable=True)
#     project_id: Mapped[int] = Column(Integer, nullable=False)  # 关联到project
#     prompt_count: Mapped[int] = Column(Integer, nullable=False, default=0)  # 存储目录中的提示词数量
#
#     # 创建联合索引以确保在同一project下目录名称唯一
#     __table_args__ = (
#         Index('idx_project_prompt_directory_name', 'project_id', 'name', unique=True),
#     )


# class Dataset(baseModel):
#     """数据集表 - 已删除"""
#     __tablename__ = "datasets"
#
#     question: Mapped[str] = Column(Text, nullable=False)
#     meta_info: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={})  # 存储元数据信息
#     project_id: Mapped[int] = Column(Integer, nullable=False)  # 关联到project
#     directory_id: Mapped[Optional[int]] = Column(Integer, nullable=True)  # 关联到目录，可为空
#     ground_truth: Mapped[Optional[str]] = Column(Text, nullable=True)  # 存储标准答案/ground truth
#     output: Mapped[Optional[str]] = Column(Text, nullable=True)  # 存储chain返回结果
#     context: Mapped[List[str]] = Column(JSON, default=list)  # 存储上下文信息，用于输入给LLM，改为数组类型
#     retrieval_context: Mapped[List[str]] = Column(JSON, default=list)  # 存储检索上下文列表
#     tools_called: Mapped[List[str]] = Column(JSON, default=list)  # 存储调用的工具列表
#     tools: Mapped[List[str]] = Column(JSON, default=list)  # 存储工具列表
#     expected_tools: Mapped[List[str]] = Column(JSON, default=list)  # 存储期望调用的工具列表
#     comments: Mapped[Optional[str]] = Column(Text, nullable=True)  # 存储数据集备注信息
#
#     @staticmethod
#     def validate_meta_info(meta_info_str: str) -> Dict:
#         """
#         验证meta_info是否为合法的JSON结构
#
#         Args:
#             meta_info_str: JSON字符串
#
#         Returns:
#             解析后的JSON对象
#
#         Raises:
#             ValueError: 如果JSON格式不合法
#         """
#         if not meta_info_str:
#             return {}
#
#         try:
#             return json.loads(meta_info_str) if isinstance(meta_info_str, str) else meta_info_str
#         except json.JSONDecodeError:
#             raise ValueError("Invalid JSON format for meta_info")

# class DatasetLog(baseModel):
#     """数据集执行日志表，记录每次执行的详细信息（平铺结构） - 已删除"""
#     __tablename__ = "dataset_logs"
#
#     # 数据集基本信息
#     dataset_id: Mapped[Optional[int]] = Column(Integer, nullable=True)  # 不强制外键约束
#     project_id: Mapped[int] = Column(Integer, nullable=False)
#     question: Mapped[str] = Column(Text, nullable=False)  # 用户输入的问题
#     output: Mapped[Optional[str]] = Column(Text, nullable=True)  # 模型输出
#     last_message: Mapped[Optional[str]] = Column(Text, nullable=True)  # 最后一个message
#
#     # 执行上下文信息
#     request_id: Mapped[Optional[str]] = Column(String(50), nullable=True,)
#     session_id: Mapped[Optional[str]] = Column(String(50), nullable=True)
#     task_id: Mapped[Optional[int]] = Column(Integer, nullable=True)  # 关联任务ID，可为空
#     task_name: Mapped[Optional[str]] = Column(String(255), nullable=True)  # 关联任务名称，可为空
#     log_type: Mapped[str] = Column(String(20), nullable=False, default="chat")  # 日志类型，job或chat
#
#     # 新增字段 - 存储快照内容
#     llm_config_content: Mapped[Optional[Dict]] = Column(JSON, nullable=True)  # 存储llm_config的快照内容
#     prompt_messages: Mapped[Optional[Dict]] = Column(JSON, nullable=True)  # 存储prompt的快照内容
#     dataset_content: Mapped[Optional[Dict]] = Column(JSON, nullable=True)  # 存储dataset的快照内容
#     tools_called: Mapped[List[str]] = Column(JSON, default=list)  # 存储调用的工具列表
#     history_content: Mapped[List[Dict]] = Column(JSON, nullable=True, default=list)  # 存储调用模型的历史对话数据
#
#     # 输入和元数据
#     input_values: Mapped[Optional[Dict]] = Column(JSON, nullable=True)  # 输入值
#     meta_info: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={})  # 元数据
#
#     # 执行状态信息
#     success: Mapped[bool] = Column(Boolean, default=True)  # 是否成功
#     error_message: Mapped[Optional[str]] = Column(Text, nullable=True)
#
#     # 时间信息
#     execution_time_ms: Mapped[Optional[int]] = Column(Integer, nullable=True)  # 执行时间（毫秒）
#     ttft_ms : Mapped[Optional[int]] = Column(Integer, nullable=True) # 首token耗时
#
#     __table_args__ = (
#         Index('idx_dataset_logs_dataset_id', 'dataset_id'),
#         Index('idx_dataset_logs_project_id', 'project_id'),
#         Index('idx_dataset_logs_task_id', 'task_id'),
#     )


# class Prompt(baseModel):
#     """提示词表 - 已删除"""
#     __tablename__ = "prompts"
#
#     title: Mapped[str] = Column(String(100), nullable=False)
#     description: Mapped[Optional[str]] = Column(String(500), nullable=True)
#     project_id: Mapped[int] = Column(Integer, nullable=False)  # 关联到project
#     directory_id: Mapped[Optional[int]] = Column(Integer, nullable=True)  # 关联到目录，可为空
#
#     # LangChain-style ChatPromptTemplate support
#     messages: Mapped[Optional[List[Dict]]] = Column(JSON, nullable=True, default=list)  # 存储消息模板列表
#     input_variables: Mapped[Optional[List[str]]] = Column(JSON, nullable=True, default=list)  # 存储变量名列表
#     template_format: Mapped[Optional[str]] = Column(String(20), nullable=True, default="jinja2")  # 模板格式
#
#     __table_args__ = (
#         Index('idx_prompts_project_id', 'project_id'),
#         Index('idx_prompts_directory_id', 'directory_id'),
#     )


# class LLMConfig(baseModel):
#     """LLM配置表 - 已删除"""
#     __tablename__ = "llm_configs"
#
#     name: Mapped[str] = Column(String(100), nullable=False)
#     description: Mapped[Optional[str]] = Column(String(500), nullable=True)
#     project_id: Mapped[int] = Column(Integer, nullable=False)  # 关联到project
#
#     # LLM基本配置
#     model: Mapped[str] = Column(String(100), nullable=False)
#     temperature: Mapped[Optional[float]] = Column(Float, nullable=True)
#     max_tokens: Mapped[Optional[int]] = Column(Integer, nullable=True)
#     timeout: Mapped[Optional[int]] = Column(Integer, nullable=True)
#     max_retries: Mapped[Optional[int]] = Column(Integer, nullable=True)
#
#     # 模型生成参数
#     frequency_penalty: Mapped[Optional[float]] = Column(Float, nullable=True, default=0.0)  # 控制重复度，值越大越不倾向重复内容
#     presence_penalty: Mapped[Optional[float]] = Column(Float, nullable=True, default=0.0)  # 控制主题新颖度，值越大越倾向引入新主题
#     top_p: Mapped[Optional[float]] = Column(Float, nullable=True, default=1.0)  # 控制输出多样性，值越小则模型输出越确定性
#
#     # 可选配置
#     api_key: Mapped[Optional[str]] = Column(String(200), nullable=True)
#     base_url: Mapped[Optional[str]] = Column(String(200), nullable=True)
#     organization: Mapped[Optional[str]] = Column(String(100), nullable=True)
#
#     # 其他配置参数，以JSON格式存储
#     additional_params: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={})
#
#     # 是否为当前项目的默认配置
#     is_default: Mapped[bool] = Column(Boolean, default=False)
#
#     __table_args__ = (
#         Index('idx_llm_configs_project_id', 'project_id'),
#     )


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


class JwtUserInfo(BaseModel):
    accountId: int
    userId: int
    username: str
    tenantId: str
    enterpriseCode: str


class JWTPayLoad(BaseModel):
    iamType: str
    isSanYuan: Optional[bool]
    user_name: str
    scope: list
    iam_client_identifier: str
    exp: int
    needResetPassword: Optional[bool]
    jti: str
    client_id: str
    userInfo: JwtUserInfo


# class Task(baseModel):
#     """任务表 - 已删除"""
#     __tablename__ = "tasks"
#
#     name = Column(String(255), nullable=False)
#     description = Column(Text, nullable=True)
#     project_id = Column(Integer, nullable=False)
#     prompt_messages = Column(JSON, nullable=True, comment="存储prompt内容的快照")
#     llm_config_content = Column(JSON, nullable=True, comment="存储llm_config的快照内容，包括model,temperature等参数")
#     task_type = Column(String(50), nullable=False, default="answer-generation")
#     status = Column(String(20), nullable=False, default=TaskStatus.CREATED)
#     progress = Column(Float, nullable=False, default=0.0)
#     directory_id = Column(Integer, nullable=True)
#     variable_mappings = Column(JSON, nullable=True)
#
#     # 新增Celery相关字段
#     celery_task_id = Column(String(255), nullable=True, comment='Celery任务ID')
#     log_path = Column(String(500), nullable=True, comment='日志文件在MinIO中的路径')
#     total_count = Column(Integer, default=0, comment='任务总处理数据条数')
#     processed_count = Column(Integer, default=0, comment='已处理数据条数')
#     successful_count = Column(Integer, default=0, comment='成功处理数据条数')
#     failed_count = Column(Integer, default=0, comment='失败处理数据条数')
#     error_message = Column(Text, nullable=True, comment='错误信息')
#     finished_at = Column(DateTime(timezone=False), nullable=True, comment='完成时间（成功或失败）')
#
#     # 时间字段
#     started_at = Column(DateTime(timezone=False), nullable=True)
#
#
#     # 索引
#     __table_args__ = (
#         Index('ix_tasks_celery_task_id', 'celery_task_id', unique=True),
#     )
#
#     def can_transition_to(self, target_status: str) -> bool:
#         """
#         验证状态流转是否合法
#         按照task_management.md文档规范定义的状态流转规则：
#         CREATED -> PENDING, CANCELLED
#         PENDING -> RUNNING, CANCELLED
#         RUNNING -> SUCCESS, FAILED, CANCELLED
#         SUCCESS/FAILED/CANCELLED为终态，不可再流转
#         """
#         return target_status in TaskStatus.VALID_TRANSITIONS.get(self.status, [])
#
#     def is_editable(self) -> bool:
#         """判断任务是否可编辑 - 只有CREATED状态允许编辑"""
#         return self.status in TaskStatus.EDITABLE_STATUSES
#
#     def is_cancellable(self) -> bool:
#         """判断任务是否可取消 - CREATED、PENDING和RUNNING状态允许取消"""
#         return self.status in TaskStatus.CANCELLABLE_STATUSES
#
#     def is_deletable(self) -> bool:
#         """判断任务是否可删除 - 只有终态允许删除"""
#         return self.status in TaskStatus.DELETABLE_STATUSES
#
#     def is_finished(self) -> bool:
#         """判断任务是否已完成（包括成功、失败、取消）"""
#         return self.status in TaskStatus.FINAL_STATUSES

# class TestRun(baseModel):
#     """Test run table for storing test execution data - 已删除"""
#     __tablename__ = "test_runs"
#
#     run_id: Mapped[str] = Column(String(255), nullable=False, unique=True)  # 移除index=True
#     project_id: Mapped[int] = Column(Integer, nullable=False)  # 移除index=True
#     name: Mapped[str] = Column(String(100), nullable=True)  # 评估任务名称
#     model: Mapped[Optional[str]] = Column(String(255), nullable=True)
#     dataset: Mapped[Optional[str]] = Column(String(255), nullable=True)
#     evaluate_id: Mapped[Optional[int]] = Column(Integer, nullable=True)  # 评估集ID
#     metrics: Mapped[Optional[List[Dict]]] = Column(JSON, nullable=True, default=list)  # 存储评估指标列表
#     evaluate_model: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={})  # 存储评估模型信息
#     hyperparameters: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={})  # 存储超参数
#     status: Mapped[Optional[str]] = Column(String(20), nullable=True,)
#     remark: Mapped[Optional[str]] = Column(Text, nullable=True)  # 备注
#     total_test_cases: Mapped[int] = Column(Integer, default=0)
#     successful_test_cases: Mapped[int] = Column(Integer, default=0)
#     testPassed: Mapped[int] = Column(Integer, default=0)  # 通过的测试用例数量
#     testFailed: Mapped[int] = Column(Integer, default=0)  # 失败的测试用例数量
#     run_duration: Mapped[float] = Column(Float, default=0.0)
#     metrics_scores: Mapped[Optional[List[Dict]]] = Column(JSON, default=list)
#     avg_metric_scores: Mapped[Optional[List[Dict]]] = Column(JSON, default=list)  # 指标平均分数
#     created_at: Mapped[datetime] = Column(DateTime(timezone=False), default=datetime.utcnow)
#     started_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True)
#
#     # Celery任务相关字段
#     celery_task_id: Mapped[Optional[str]] = Column(String(255), nullable=True, comment='Celery任务ID')
#     error_message: Mapped[Optional[str]] = Column(Text, nullable=True, comment='错误信息')
#     finished_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment='完成时间（成功或失败）')
#     log_path: Mapped[Optional[str]] = Column(String(500), nullable=True, comment='日志文件在MinIO中的路径')
#
#     # Indexes
#     __table_args__ = (
#         Index("ix_test_runs_run_id", run_id),
#     )

# class TestCase(baseModel):
#     """Test case table for storing individual test case data within a test run - 已删除"""
#     __tablename__ = "test_cases"
#
#     test_run_id: Mapped[int] = Column(Integer,nullable=False)
#     project_id: Mapped[int] = Column(Integer, nullable=False)
#     name: Mapped[str] = Column(String(255), nullable=False)
#     input: Mapped[str] = Column(Text, nullable=False)
#     actual_output: Mapped[str] = Column(Text, nullable=False)
#     success: Mapped[bool] = Column(Boolean, default=False)
#     metrics_data: Mapped[Optional[List[Dict]]] = Column(JSON, default=list)
#     run_duration: Mapped[float] = Column(Float, default=0.0)
#     order: Mapped[int] = Column(Integer, default=0)
#     is_conversational: Mapped[bool] = Column(Boolean, default=False)
#     is_multimodal: Mapped[bool] = Column(Boolean, default=False)
#     context: Mapped[List[str]] = Column(JSON, default=list)  # 存储上下文信息，改为数组类型
#     retrieval_context: Mapped[List[str]] = Column(JSON, default=list)  # 存储检索上下文列表
#     expected_output: Mapped[Optional[str]] = Column(Text, nullable=True)
#     tools_called: Mapped[List[Dict]] = Column(JSON, default=list)  # 存储调用的工具列表
#     expected_tools: Mapped[List[Dict]] = Column(JSON, default=list)  # 存储期望调用的工具列表
#
#
#     # Indexes - use a unique variable name to avoid conflict with TestRun.__table_args__
#     __table_args__ = (
#         Index("idx_test_cases_test_run_id", "test_run_id"),
#         Index("idx_test_cases_success", "success"),
#         Index("idx_test_cases_order", "order"),
#     )

# class MetricDirectory(baseModel):
#     """指标目录表，用于组织指标 - 已删除"""
#     __tablename__ = "metric_directories"
#
#     name: Mapped[str] = Column(String(100), nullable=False)
#     description: Mapped[Optional[str]] = Column(String(500), nullable=True)
#     project_id: Mapped[int] = Column(Integer, nullable=False)  # 关联到project
#     metric_count: Mapped[int] = Column(Integer, nullable=False, default=0)  # 存储目录中的指标数量
#
#     # 创建联合索引以确保在同一project下目录名称唯一
#     __table_args__ = (
#         Index('idx_project_metric_directory_name', 'project_id', 'name', unique=True),
#         Index('idx_metric_directories_project_id', 'project_id'),
#     )


# class Metric(baseModel):
#     """指标表，用于存储评估指标定义 - 已删除"""
#     __tablename__ = "metrics"
#
#     name: Mapped[str] = Column(String(100), nullable=False)
#     description: Mapped[Optional[str]] = Column(String(500), nullable=True)
#     type: Mapped[str] = Column(String(50), nullable=False)  # 指标类型，例如accuracy, precision, recall等
#     is_builtin: Mapped[bool] = Column(Boolean, default=False)  # 是否为内置指标
#     metric_type: Mapped[str] = Column(String(50), default="builtin", nullable=False)  # 指标分类类型：builtin或geval
#     required_params: Mapped[List[str]] = Column(JSON, default=list)  # 必填参数列表
#     params_content: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={})  # 参数详细内容和说明
#     directory_id: Mapped[Optional[int]] = Column(Integer, nullable=True)  # 关联到目录，可为空
#     project_id: Mapped[int] = Column(Integer, nullable=False)  # 关联到project
#
#     __table_args__ = (
#         Index('idx_metrics_directory_id', 'directory_id'),
#         Index('idx_metrics_project_id', 'project_id'),
#     )


class KubernetesResource(baseModel):
    """Kubernetes资源表，用于管理K8s集群信息"""
    __tablename__ = "k8s_resources"

    name: Mapped[str] = Column(String(100), nullable=False, comment="集群名称")
    config: Mapped[Optional[str]] = Column(Text, nullable=False, comment="K8s配置信息(kubeconfig内容)")
    api_server: Mapped[str] = Column(String(255), nullable=False, comment="API服务器地址")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="描述信息")
    status: Mapped[str] = Column(String(50), nullable=False, comment="集群状态")
    version: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="K8s版本")
    node_number: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="节点数量")
    ext: Mapped[Optional[Dict]] = Column(JSON, nullable=False,default={}, comment="K8s标签扩展信息")


class StorageResource(baseModel):
    """存储资源表，用于管理不同类型的存储服务"""
    __tablename__ = "storage_resources"

    name: Mapped[str] = Column(String(100), nullable=False, comment="存储配置名称")
    type: Mapped[str] = Column(String(50), nullable=False, comment="存储类型(TOS/MinIO/NFS等)")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="描述信息")
    status: Mapped[str] = Column(String(50), nullable=False, comment="连接状态")
    config: Mapped[Optional[Dict]] = Column(JSON, nullable=False, default={}, comment="存储配置信息")
    cluster_number: Mapped[Optional[int]] = Column(Integer, default=0, nullable=True, comment="关联集群数量")
    last_test_time: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True)
    is_init: Mapped[bool] = Column(Boolean, nullable=False, default=False, comment="是否初始化")


class KubernetesStorageRelation(baseModel):
    """Kubernetes与存储资源关联表"""
    __tablename__ = "k8s_storage_relation"

    k8s_id: Mapped[int] = Column(Integer, nullable=False, comment="K8s资源ID")
    storage_id: Mapped[int] = Column(Integer, nullable=False, comment="存储资源ID")
    is_mount: Mapped[bool] = Column(Boolean, nullable=False, default=False, comment="是否已挂载")
    csi_name: Mapped[Optional[str]] = Column(String(100), nullable=True, default="juicefs", comment="CSI名称")
    csi_config: Mapped[Optional[Dict]] = Column(JSON, nullable=True, default={"version": "v0.29.0"},
                                                comment="CSI配置信息")

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
    cluster_number: Mapped[Optional[int]] = Column(Integer, default=0, nullable=True, comment="关联集群数量")
    status: Mapped[str] = Column(String(50), nullable=False, comment="仓库状态")
    namespace: Mapped[str] = Column(String(50), nullable=False, default='default', server_default=text("'default'"), comment="镜像命名空间/项目")
    type: Mapped[str] = Column(String(50), nullable=False, default='private_harbor', server_default=text("'private_harbor'"), comment="厂商类型(volcengine/private_harbor等)")
    config: Mapped[Optional[Dict]] = Column(JSON, nullable=False, default={}, server_default=text("'{}'"), comment="仓库api调用配置信息")



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
    user_id: Mapped[int] = Column(BigInteger, nullable=False, comment="用户id")

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
    instance_name: Mapped[str] = Column(String(50), nullable=False, comment="实例名称")
    image: Mapped[str] = Column(String(255), nullable=False, comment="容器镜像地址")
    gpu_type: Mapped[str] = Column(String(64), nullable=True,
                                   comment="GPU/NPU 类型（例如 nvidia.com/gpu、huawei.com/npu）")
    gpu_count: Mapped[int] = Column(Integer, nullable=False, default=0, comment="GPU/NPU 数量")
    resource_cpu_request: Mapped[float] = Column(Numeric(4, 2), nullable=False, comment="CPU 请求，单位：核（G）")
    resource_cpu_limit: Mapped[float] = Column(Numeric(4, 2), nullable=False, comment="CPU 限制，单位：核（G）")
    resource_memory_request: Mapped[float] = Column(Numeric(5, 2), nullable=False, comment="内存请求，单位：GiB")
    resource_memory_limit: Mapped[float] = Column(Numeric(5, 2), nullable=False, comment="内存限制，单位：GiB")
    status: Mapped[str] = Column(String(50), nullable=False, default=TaskStatus.CREATED, comment="任务状态")
    lab_k8s_uuid: Mapped[str] = Column(String(100), nullable=True, comment="自定义k8s uuid")
    real_address: Mapped[str] = Column(String(512), nullable=True,
                                       comment="Notebook 实例的真实地址（服务启动后没有权限的URL）")
    access_url: Mapped[str] = Column(String(512), nullable=True,
                                     comment="Notebook 实例的访问地址（服务启动后暴露给用户可访问的 URL）")
    describe: Mapped[str] = Column(String(1000), nullable=True, comment="描述")
    is_public: Mapped[bool] = Column(Boolean, nullable=False, default=False, server_default=text("false"), comment="是否公开")
    secret: Mapped[str] = Column(String(200), nullable=True, comment="Notebook 实例的secret")
    ssh_username: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="ssh用户")
    ssh_password: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="ssh密码")
    ssh_key: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="sshkey 公钥的SHA256")
    ssh_address: Mapped[str] = Column(String(255), nullable=True, comment="Notebook 实例的ssh访问地址IP/域名")
    ssh_port: Mapped[int] = Column(Integer, nullable=True, comment="Notebook 实例的ssh实际端口")
    max_runtime_minutes: Mapped[int] = Column(Integer, nullable=True,
                                              comment="Notebook 实例最大运行分钟数（超时后自动停止）")
    ext: Mapped[Optional[Dict]] = Column(JSON, default={} , nullable=False, comment="扩展信息")
    source_example_id: Mapped[int] = Column(Integer, nullable=True, comment="来源案例id")
    biz_type: Mapped[str] = Column(String(50), nullable=True, default='llm', comment="业务类型")
    model_service_id: Mapped[int] = Column(Integer, nullable=True, comment="在线推理服务id")
    usage: Mapped[Optional[str]] = Column(
        String(32), nullable=True, comment="用途：  枚举MlTaskType",
    )


class NotebookPort(baseModel):
    """Notebook 暴露端口与访问地址（多端口）"""
    __tablename__ = "notebook_ports"

    notebook_id: Mapped[int] = Column(Integer, nullable=False, comment="关联 notebooks.id")
    protocol: Mapped[str] = Column(String(16), nullable=True, comment="端口协议类型")
    port_usage: Mapped[str] = Column(String(32), nullable=False, comment="端口用途枚举")
    port: Mapped[int] = Column(Integer, nullable=False, comment="外部端口号")
    container_port: Mapped[int] = Column(Integer, nullable=False, comment="容器端口号")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="端口用途描述")
    access_url: Mapped[Optional[str]] = Column(String(512), nullable=True, comment="访问 URL")


class RepositoryImages(baseModel):
    __tablename__ = "repository_images"
    image: Mapped[str] = Column(String(), nullable=False, comment="镜像名:tag")
    type: Mapped[int] = Column(Integer, nullable=False, default=0, comment="镜像分类：0 在线notebook / 1 大模型 / 3 推理")
    sub_type: Mapped[Optional[str]] = Column(String(50), nullable=True, default=None, comment="镜像二级分类")
    repository_id: Mapped[int] = Column(Integer, nullable=False, comment="仓库id")
    describe: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="描述")
    namespace: Mapped[str] = Column(String(50), nullable=False, default='default', server_default=text("'default'"), comment="镜像命名空间/项目")
    card_category: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="显卡类型")
    card_model: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="显卡型号")
    cuda_version: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="cuda版本")
    python_version: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="python版本")
    image_source: Mapped[Optional[str]] = Column(String(20), nullable=True, default='built-in', server_default=text("'built-in'"), comment="镜像来源：是built-in，还是custom")


class OperatorLogs(baseModel):
    __tablename__ = "operator_logs"
    account: Mapped[str] = Column(String(), nullable=False, comment="账号")
    ip_addres: Mapped[str] = Column(String(), nullable=False, comment="ip_addres")
    table_name: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="")
    function_name: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="功能名")
    operation_type: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="操作类型")
    operation_content: Mapped[Optional[str]] = Column(Text(), nullable=True, comment="操作内容")
    audit_status: Mapped[int] = Column(Integer, nullable=False, default=0, comment="审计状态: 0(未审计), 1(通过), 2(拒绝)")

    audit_reason: Mapped[Optional[str]] = Column(Text(), nullable=True, comment="审计原因")
    audit_time: Mapped[datetime] = Column(DateTime(timezone=False), onupdate=get_current_shanghai_time, comment="审计时间")


class SshAuthorizedKeys(baseModel):
    __tablename__ = "ssh_authorized_keys"

    project_id: Mapped[int] = Column(Integer, nullable=False, comment="项目id")
    notebook_id: Mapped[int] = Column(Integer, nullable=False, comment="notebook id")
    authorized_key: Mapped[str] = Column(String(500), nullable=False, comment="notebook SSH 公钥信息")

    __table_args__ = (
        UniqueConstraint('project_id', 'notebook_id', 'tenant_id', name='uq_ssh_authorized_keys_project_notebook_tenant'),
    )
class InferenceService(baseModel):
    __tablename__ = "inference_service"
    name: Mapped[str] = Column(String(100), nullable=False, comment="服务名称")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="服务描述")
    api_key: Mapped[str] = Column(String(255), nullable=False, comment="服务API Key")
    base_url: Mapped[str] = Column(String(255), nullable=False, comment="服务base URL")
    model_name: Mapped[str] = Column(String(100), nullable=False, comment="服务模型名称")
    model_type: Mapped[List[str]] = Column(PG_ARRAY(String), nullable=False, comment="服务模型类型")
    status: Mapped[str] = Column(String(50), nullable=False, comment="服务连接状态")
    project_id: Mapped[int] = Column(Integer, nullable=False, comment="项目id")

    __table_args__ = (
        Index('idx_inference_service_project_id', 'project_id'),
        # 新增：project_id 和 name 以及 tenant_id 的联合唯一约束
        UniqueConstraint('project_id', 'name', 'tenant_id', name='uq_inference_service_project_name_tenant'),
    )


class UserDataRole(baseModel):
    """数据权限角色授权表（统一存储所有数据权限角色的授权信息）"""
    __tablename__ = "user_data_roles"

    user_id: Mapped[int] = Column(BigInteger, nullable=False, comment="被授权的用户ID")
    role_type: Mapped[str] = Column(String(50), nullable=False, comment="角色类型：platform_admin平台管理员/project_admin项目管理员")
    scope_type: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="作用域类型：platform平台级别/project项目级别")
    scope_id: Mapped[Optional[int]] = Column(BigInteger, nullable=True, comment="作用域ID：平台级别为NULL，项目级别为项目ID")

    __table_args__ = (
        Index('idx_user_data_roles_user_id', 'user_id'),
        Index('idx_user_data_roles_role_type', 'role_type'),
        Index('idx_user_data_roles_scope', 'scope_type', 'scope_id'),
        UniqueConstraint('user_id', 'role_type', 'scope_type', 'scope_id', 'tenant_id', name='uk_user_data_roles'),
    )


class Permission(baseModel):
    """权限配置表（维护需要数据权限角色的接口配置）"""
    __tablename__ = "data_permissions"

    permission_code: Mapped[str] = Column(String(100), nullable=False, comment="权限代码（唯一标识）")
    permission_name: Mapped[str] = Column(String(200), nullable=False, comment="权限名称")
    permission_value: Mapped[str] = Column(String(500), nullable=False, comment="权限值：URL路径，如 /api/v1/projects/{project_id}")
    http_method: Mapped[str] = Column(String(10), nullable=False, comment="HTTP方法：GET/POST/PUT/DELETE等")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="权限描述")

    __table_args__ = (
        Index('idx_data_permissions_code', 'permission_code'),
        Index('idx_data_permissions_url_method', 'permission_value', 'http_method'),
        UniqueConstraint('permission_code', 'tenant_id', name='uk_data_permissions_code_tenant'),
    )


class RolePermission(baseModel):
    """角色权限关联表（维护角色和权限的映射关系）"""
    __tablename__ = "data_role_permissions"

    role_type: Mapped[str] = Column(String(50), nullable=False, comment="角色类型：platform_admin/project_admin")
    permission_code: Mapped[str] = Column(String(100), nullable=False, comment="权限代码（关联data_permissions表）")

    __table_args__ = (
        Index('idx_data_role_permissions_role', 'role_type'),
        Index('idx_data_role_permissions_code', 'permission_code'),
        UniqueConstraint('role_type', 'permission_code', 'tenant_id', name='uk_data_role_permissions'),
    )



class ImageBuildLog(baseModel):
    __tablename__ = "image_build_log"
    name: Mapped[str] = Column(String(255), nullable=False, comment="镜像名称")
    project_id: Mapped[int] = Column(Integer, nullable=False, comment="项目ID")
    business_id: Mapped[int] = Column(Integer, nullable=False, comment="业务id")
    business_name: Mapped[str] = Column(String(255), nullable=False, comment="业务名称")
    base_image: Mapped[str] = Column(String(255), nullable=False, comment="基础镜像名称")
    output_image: Mapped[str] = Column(String(255), nullable=False, comment="输出镜像名称")
    output_image_id: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="输出镜像ID（RepositoryImages.id）")
    image_type: Mapped[int] = Column(Integer, nullable=False, comment="镜像类型，与image表的type一致")
    trigger_type: Mapped[str] = Column(String(50), nullable=False, comment="触发类型，自动：auto、手动：manual")
    status: Mapped[str] = Column(String(50), nullable=False, comment="状态")
    lab_k8s_uuid: Mapped[str] = Column(String(100), nullable=False, comment="自定义k8s uuid")
    log_path: Mapped[Optional[str]] = Column(String(500), nullable=True, comment="日志路径")
    snapshot_id: Mapped[Optional[str]] = Column(String(200), nullable=True, comment="快照id")
    describe: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="描述")


class TaskExecution(baseModel):
    """任务执行表：仅描述如何调用执行器"""
    __tablename__ = "task_execution"
    business_type: Mapped[str] = Column(String(50), nullable=False, comment="业务类型")
    business_id: Mapped[int] = Column(Integer, nullable=False, comment="业务ID")
    schedule_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="计划执行时间")
    status: Mapped[str] = Column(String(20), nullable=False, default=TaskExecutionStatus.PENDING.value, comment="执行状态")
    executor: Mapped[str] = Column(String(100), nullable=False, comment="执行器标识")
    method: Mapped[str] = Column(String(100), nullable=False, comment="执行方法")
    kwargs: Mapped[Optional[Dict[str, Any]]] = Column(JSON, nullable=True, comment="方法参数")
    retry_count: Mapped[int] = Column(Integer, nullable=False, default=0, comment="已重试次数")
    max_retry: Mapped[int] = Column(Integer, nullable=False, default=3, comment="最大重试次数")
    last_error: Mapped[Optional[str]] = Column(Text, nullable=True, comment="最近错误信息")
    locked_at: Mapped[Optional[datetime]] = Column(DateTime(timezone=False), nullable=True, comment="锁定时间")
    locked_by: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="锁定者")

    __table_args__ = (
        Index("idx_task_execution_status_schedule", "status", "schedule_at"),
        Index("idx_task_execution_biz", "business_type", "business_id"),
    )


class ExampleNotebook(baseModel):
    __tablename__ = "example_notebook"
    name: Mapped[str] = Column(String(255), nullable=False, comment="案例名称")
    describe: Mapped[Optional[str]] = Column(Text, nullable=True, comment="描述")
    is_available: Mapped[bool] = Column(Boolean, nullable=False, default=False, comment="是否可用（False=不可用，True=可用）")
    built_in_address: Mapped[Optional[str]] = Column(String(500), nullable=True, comment="内置地址minio,非内置使用的是jfs地址/public/notebook-example/example-id")
    biz_type: Mapped[Optional[str]] = Column(String(32), nullable=True, default='llm', comment="业务类型")


class BusinessAttr(baseModel):
    __tablename__ = "business_attr"

    name: Mapped[str] = Column(String(255), nullable=False, comment="属性名称")
    description: Mapped[Optional[str]] = Column(Text(), nullable=True, comment="属性描述")
    attr_order: Mapped[int] = Column(Integer, nullable=False, default=0, comment="属性排序")
    input_type: Mapped[str] = Column(String(64), nullable=False, comment="输入类型")
    data_type: Mapped[str] = Column(String(64), default="string", comment="数据类型")
    multi_select: Mapped[int] = Column(Integer, nullable=False, default=0, comment="是否多选")
    required_tag: Mapped[int] = Column(Integer, nullable=False, comment="是否必填标签")
    business_type: Mapped[str] = Column(String(64), nullable=False, comment="业务类型")
    group: Mapped[Optional[str]] = Column(String(64), nullable=True, comment="分组")

    __table_args__ = (
        Index("idx_business_attr_name", "name"),
        Index("idx_business_attr_business_type", "business_type"),
        )


class BusinessAttrOption(baseModel):
    __tablename__ = "business_attr_option"

    attr_id: Mapped[int] = Column(Integer, nullable=False, comment="属性id")
    option_value: Mapped[str] = Column(String(255), nullable=False, comment="选项值")
    option_order: Mapped[int] = Column(Integer, nullable=False, default=0, comment="选项排序")
    business_type: Mapped[str] = Column(String(64), nullable=False, comment="业务类型")

    __table_args__ = (
        Index("idx_business_attr_option_attr_id", "attr_id"),
        Index("idx_business_attr_option_business_type", "business_type"),
        UniqueConstraint("attr_id", "option_value", "business_type", name="uq_business_attr_option_attr_value_business"),
    )


class BusinessAttrValue(baseModel):
    __tablename__ = "business_attr_value"

    reference_id: Mapped[int] = Column(Integer, nullable=False, comment="关联业务数据的id")
    attr_id: Mapped[int] = Column(Integer, nullable=False, comment="属性id")
    name: Mapped[str] = Column(String(255), nullable=False, comment="属性名称")
    data_type: Mapped[str] = Column(String(64), nullable=False, comment="数据类型")
    attr_value: Mapped[str] = Column(String(255), nullable=True, comment="属性值")
    input_type: Mapped[str] = Column(String(64), nullable=False, comment="输入类型")
    value_order: Mapped[int] = Column(Integer, nullable=False, default=0, comment="属性值排序")
    required_tag: Mapped[int] = Column(Integer, nullable=False, comment="是否必填标签")
    multi_select: Mapped[int] = Column(Integer, nullable=False, default=0, comment="是否多选")
    business_type: Mapped[str] = Column(String(64), nullable=False, comment="业务类型")
    group: Mapped[Optional[str]] = Column(String(64), nullable=True, comment="分组")

    __table_args__ = (
        Index("idx_business_attr_value_attr_id", "attr_id"),
        Index("idx_business_attr_value_reference_id", "reference_id"),
        Index("idx_business_attr_value_business_type", "business_type")
    )


class BusinessAttrValueOption(baseModel):
    __tablename__ = "business_attr_value_option"

    reference_id: Mapped[int] = Column(Integer, nullable=False, comment="关联业务数据的id")
    attr_value_id: Mapped[int] = Column(Integer, nullable=False, comment="属性值id")
    option_value: Mapped[str] = Column(String(255), nullable=False, comment="选项值")
    option_order: Mapped[int] = Column(Integer, nullable=False, default=0, comment="选项排序")
    business_type: Mapped[str] = Column(String(64), nullable=False, comment="业务类型")

    __table_args__ = (
        Index("idx_business_attr_value_option_attr_value_id", "attr_value_id"),
        Index("idx_business_attr_value_option_reference_id", "reference_id"),
        Index("idx_business_attr_value_option_business_type", "business_type"),
    )



class ChunkUploadSession(baseModel):
    """分片上传会话表"""
    __tablename__ = "chunk_upload_sessions"

    upload_id: Mapped[str] = Column(String(100), nullable=False, unique=True, comment="上传会话ID")
    file_name: Mapped[str] = Column(String(255), nullable=False, comment="文件名")
    file_size: Mapped[int] = Column(BigInteger, nullable=False, comment="文件大小（字节）")
    chunk_size: Mapped[int] = Column(Integer, nullable=False, comment="分片大小（字节）")
    file_hash: Mapped[str] = Column(String(64), nullable=False, comment="文件SHA-256哈希值")
    total_chunks: Mapped[int] = Column(Integer, nullable=False, comment="总分片数")
    # 移除 uploaded_chunks 字段，改用 ChunkUploadRecord 表记录
    is_complete: Mapped[bool] = Column(Boolean, nullable=False, default=False, comment="是否已完成")
    file_url: Mapped[Optional[str]] = Column(String(500), nullable=True, comment="最终文件URL（合并完成后）")
    error_message: Mapped[Optional[str]] = Column(Text, nullable=True, comment="错误信息")

    __table_args__ = (
        Index('idx_chunk_upload_session_upload_id', 'upload_id'),
        Index('idx_chunk_upload_session_file_hash', 'file_hash'),
    )


class ChunkUploadRecord(baseModel):
    """分片上传记录表"""
    __tablename__ = "chunk_upload_records"

    upload_id: Mapped[str] = Column(String(100), nullable=False, comment="上传会话ID")
    chunk_index: Mapped[int] = Column(Integer, nullable=False, comment="分片索引（从0开始）")
    chunk_path: Mapped[str] = Column(String(500), nullable=False, comment="分片文件在JuiceFS中的路径")
    chunk_size: Mapped[int] = Column(BigInteger, nullable=False, comment="分片大小（字节）")
    uploaded_at: Mapped[datetime] = Column(DateTime, nullable=False, default=datetime.now, comment="上传时间")

    __table_args__ = (
        UniqueConstraint('upload_id', 'chunk_index', name='uq_chunk_upload_record'),
        Index('idx_chunk_upload_record_upload_id', 'upload_id'),
        Index('idx_chunk_upload_record_upload_chunk', 'upload_id', 'chunk_index'),
    )


class FileFolder(baseModel):
    """文件管理文件夹表"""
    __tablename__ = "file_folders"

    name: Mapped[str] = Column(String(100), nullable=False, comment="文件夹名称")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="文件夹描述")
    project_id: Mapped[int] = Column(Integer, nullable=False, comment="关联的项目ID")

    __table_args__ = (
        UniqueConstraint('project_id', 'name', 'tenant_id', name='uq_file_folder_project_name'),
        Index('idx_file_folders_project_id', 'project_id'),
    )


class FileManagementFile(baseModel):
    """文件管理文件信息表"""
    __tablename__ = "file_management_files"

    file_name: Mapped[str] = Column(String(255), nullable=False, comment="文件名（带后缀）")
    file_size: Mapped[int] = Column(BigInteger, nullable=False, comment="文件大小（字节）")
    file_hash: Mapped[str] = Column(String(64), nullable=False, comment="文件SHA-256哈希值")
    file_path: Mapped[str] = Column(String(500), nullable=False, comment="文件在JuiceFS中的完整路径")
    folder_id: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="关联的文件夹ID")
    project_id: Mapped[int] = Column(Integer, nullable=False, comment="关联的项目ID")
    upload_id: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="分片上传会话ID")

    __table_args__ = (
        Index('idx_file_management_files_project_id', 'project_id'),
        Index('idx_file_management_files_folder_id', 'folder_id'),
        Index('idx_file_management_files_file_hash', 'file_hash'),
        Index('idx_file_management_files_file_name', 'file_name'),
    )

class ThirdPartyApiServiceModel(baseModel):
    __tablename__ = "third_party_api"
    name: Mapped[str] = Column(String(100), nullable=False, comment="第三方接口名称")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="第三饭接口描述")
    base_url: Mapped[str] = Column(String(300), nullable=False, comment="第三方接口地址")
    header: Mapped[Dict] = Column(JSON, nullable=False, comment="第三方接口地址")
    request_param: Mapped[Dict] = Column(JSON, nullable=False, comment="入参")
    response_param: Mapped[Dict] = Column(JSON, nullable=False, comment="出参")
    request_type: Mapped[str] = Column(String(300), nullable=False, comment="第三方接口请求类型")
    protocol: Mapped[str] = Column(String(300), nullable=False, comment="第三方接口协议")
    status: Mapped[str] = Column(String(50), nullable=False, comment="连接状态")
    project_id: Mapped[int] = Column(Integer, nullable=False, comment="项目id")
    __table_args__ = (
        Index('idx_third_party_interface_project_id', 'project_id'),
        # 新增：project_id 和 name 以及 tenant_id 的联合唯一约束
        UniqueConstraint('project_id', 'name', 'tenant_id', name='uq_third_party_interface_project_name_tenant'),
    )


class TagClass(baseModel):
    """标签分类表"""
    __tablename__ = "tag_class"
    name: Mapped[str] = Column(String(64), nullable=False, comment="标签分类名称")
    business_type: Mapped[str] = Column(String(32), nullable=False, comment="业务类型（IMAGE/NOTEBOOK/PROJECT等）")
    sort_order: Mapped[int] = Column(Integer, nullable=False, default=0, comment="前端展示排序值，越小越靠前")

    __table_args__ = (
        Index('idx_tag_class_business_type', 'business_type'),
    )


class TagElement(baseModel):
    """标签元素表"""
    __tablename__ = "tag_element"
    class_id: Mapped[int] = Column(BigInteger, nullable=False, comment="所属标签分类ID")
    name: Mapped[str] = Column(String(64), nullable=False, comment="标签元素展示名称")
    code: Mapped[Optional[str]] = Column(String(32), nullable=True, comment="标签编码（用于规则判断/程序识别）")
    sort_order: Mapped[int] = Column(Integer, nullable=False, default=0, comment="同分类下的展示排序")

    __table_args__ = (
        Index('idx_tag_element_class_id', 'class_id'),
    )


class BusinessTagRel(baseModel):
    """业务对象-标签关联表"""
    __tablename__ = "business_tag_rel"
    business_type: Mapped[str] = Column(String(32), nullable=False, comment="业务类型（IMAGE/NOTEBOOK/PROJECT等）")
    business_id: Mapped[str] = Column(String(64), nullable=False, comment="业务对象ID（字符串，兼容不同业务主键）")
    tag_class_id: Mapped[int] = Column(BigInteger, nullable=False, comment="标签分类ID（冗余字段，用于快速约束与查询）")
    tag_element_id: Mapped[int] = Column(BigInteger, nullable=False, comment="标签元素ID")

    __table_args__ = (
        # 唯一索引：同一业务对象在同一分类下只能有一个标签（单选场景）
        UniqueConstraint('business_type', 'business_id', 'tag_class_id', 'tenant_id', name='uk_business_tag_single'),
        # 查询索引
        Index('idx_business_tag_lookup', 'business_type', 'business_id'),
    )


class MachineLearningDataset(baseModel):
    """机器学习数据集表"""

    __tablename__ = "machine_learning_datasets"

    name: Mapped[str] = Column(String(100), nullable=False, comment="数据集名称")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="数据集描述")
    project_id: Mapped[int] = Column(Integer, nullable=False, comment="项目ID")
    version: Mapped[str] = Column(String(50), nullable=False, default="V1", comment="版本号")
    dataset_category: Mapped[str] = Column(
        String(50),
        nullable=False,
        default="machine_learning",
        comment="数据集分类标识，固定为 machine_learning",
    )
    task_type: Mapped[str] = Column(String(50), nullable=False, comment="任务类型")
    data_type: Mapped[str] = Column(String(32), nullable=True, comment="数据类型：text/image")
    data_source: Mapped[Optional[str]] = Column(String(32), nullable=True, comment="数据来源：local_upload/notebook_fetch")
    notebook_id: Mapped[Optional[int]] = Column(Integer, nullable=True, comment="关联的notebook任务ID")
    notebook_name: Mapped[Optional[str]] = Column(String(50), nullable=True, comment="关联的notebook任务名称")
    notebook_path: Mapped[Optional[str]] = Column(String(500), nullable=True, comment="notebook文件来源地址")
    annotation_type: Mapped[str] = Column(String(64), nullable=True, comment="标注类型")
    template_type: Mapped[str] = Column(String(64), nullable=True, comment="标注模板")
    is_annotated: Mapped[bool] = Column(Boolean, nullable=False, default=True, comment="是否有标注：true=有标注，false=无标注")
    source_type: Mapped[str] = Column(String(20), nullable=False, comment="上传源类型：json/jsonl/zip/mixed")
    storage_path: Mapped[str] = Column(String(500), nullable=False, comment="对象存储根路径")
    dataset_path: Mapped[str] = Column(String(500), nullable=False, comment="dataset.jsonl 路径")
    label_schema_path: Mapped[Optional[str]] = Column(String(500), nullable=True, comment="classname.json 路径")
    metadata_fields: Mapped[Optional[List[str]]] = Column(JSON, nullable=True, comment="数据集字段元数据，上传解析完成后生成")
    sample_count: Mapped[int] = Column(Integer, nullable=False, default=0, comment="样本数量")
    file_size: Mapped[Optional[float]] = Column(Float, nullable=True, comment="dataset.jsonl 大小(MB)")
    processing_status: Mapped[str] = Column(String(20), nullable=False, default="completed", comment="处理状态：pending处理中, completed处理完成, failed处理失败")
    publish: Mapped[int] = Column(SmallInteger, nullable=False, default=0, comment="发布状态：0未发布, 1已发布, 2处理中展示-, 3处理失败展示-")

    __table_args__ = (
        Index("idx_ml_datasets_project", "project_id"),
        Index("idx_ml_datasets_project_name_version", "project_id", "name", "version", unique=True),
        Index("idx_ml_datasets_category", "dataset_category"),
    )


class AnnotationServiceModel(baseModel):
    """在线标注服务表"""

    __tablename__ = "annotation_service"

    name: Mapped[str] = Column(String(100), nullable=False, comment="服务名称")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="服务描述")
    project_id: Mapped[int] = Column(Integer, nullable=False, comment="项目ID")
    base_url: Mapped[str] = Column(String(500), nullable=False, comment="服务基础地址")
    category: Mapped[str] = Column(String(50), nullable=False, default="machine_learning", comment="服务分类")
    data_type: Mapped[Optional[str]] = Column(String(32), nullable=True, comment="数据类型：text/image")
    annotation_type: Mapped[Optional[str]] = Column(String(64), nullable=True, comment="标注类型")
    template_type: Mapped[Optional[str]] = Column(String(64), nullable=True, comment="标注模板")
    status: Mapped[str] = Column(String(32), nullable=False, default="未测试", comment="服务状态")

    __table_args__ = (
        Index("idx_annotation_service_name", "name"),
        Index("idx_annotation_service_project", "project_id"),
        Index("idx_annotation_service_template_type", "template_type"),
        Index("idx_annotation_service_status", "status"),
    )


class OpenAPIApplicationModel(baseModel):
    """OpenAPI 应用表"""

    __tablename__ = "openapi_applications"

    name: Mapped[str] = Column(String(100), nullable=False, comment="应用名称")
    group_id: Mapped[Optional[str]] = Column(String(100), nullable=True, comment="分组ID")
    key_id: Mapped[str] = Column(String(100), nullable=False, comment="Key ID")
    secret_key: Mapped[str] = Column(String(255), nullable=False, comment="应用密钥")
    description: Mapped[Optional[str]] = Column(String(1000), nullable=True, comment="应用描述")
    labels: Mapped[Dict] = Column(JSON, nullable=False, default=dict, server_default=text("'{}'"), comment="标签数据")
    plugins: Mapped[Dict] = Column(JSON, nullable=False, default=dict, server_default=text("'{}'"), comment="插件数据")

    __table_args__ = (
        UniqueConstraint('key_id', name='uq_openapi_applications_key_id'),
    )
