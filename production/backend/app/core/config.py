import json
import os
from typing import Optional, Literal, List, Tuple, Any, Dict
from urllib.parse import urlparse, unquote_plus
from dotenv import load_dotenv
import urllib.parse
# 再导入 JuiceFS SDK
import juicefs
import redis.asyncio as redis_async
from redis.asyncio.client import Redis as AsyncRedis
from redis.client import Redis as SyncRedis
import redis as redis_sync

# 加载环境变量
load_dotenv()


def _parse_sentinel_hosts(redis_sentinel_host_port: str) -> List[Tuple[str, int]]:
    """解析 Sentinel 地址列表"""
    if not redis_sentinel_host_port:
        return []

    sentinel_hosts = []
    for host_port in redis_sentinel_host_port.split(','):
        host_port = host_port.strip()
        if ':' in host_port:
            host, port = host_port.split(':', 1)
            try:
                sentinel_hosts.append((host, int(port)))
            except ValueError:
                continue
    return sentinel_hosts

def env_json(key: str, default: str = "[]") -> Any:
    try:
        json_env = os.getenv(key, default)
        if json_env:
            return json.loads(json_env)
    except ValueError:
        raise ValueError(
            f"配置：{key} json格式错误"
        )


class Settings:
    """
    统一配置管理类 - 所有配置通过环境变量管理
    
    参考celery_demo的设计模式，简化配置结构，提高可维护性
    """
    LAB_EXPORT_PROTOCOL: str = os.getenv('LAB_EXPORT_PROTOCOL')
    if not LAB_EXPORT_PROTOCOL:
        raise ValueError("LAB_EXPORT_PROTOCOL 为空，请配置LAB_EXPORT_PROTOCOL")
    LAB_EXPORT_ADDRESS: str = os.getenv('LAB_EXPORT_ADDRESS')
    if not LAB_EXPORT_ADDRESS:
        raise ValueError("LAB_EXPORT_ADDRESS 为空，请配置LAB_EXPORT_ADDRESS")
    LAB_EXPORT_PATH: str = os.getenv('LAB_EXPORT_PATH', '')
    # ==================== Loki 配置 ====================
    # 内部查询配置（后端服务直接访问 Loki 查询日志）
    LOKI_PROTOCOL: str = os.getenv('LOKI_PROTOCOL', 'http')
    LOKI_ADDRESS: str = os.getenv('LOKI_ADDRESS', 'loki:3100')
    
    # 外部推送配置（alloy 回传日志，可选，不配置时 fallback 到 LAB_EXPORT_*）
    LOKI_PUSH_PROTOCOL: str = os.getenv('LOKI_PUSH_PROTOCOL', '')
    LOKI_PUSH_ADDRESS: str = os.getenv('LOKI_PUSH_ADDRESS', '')
            
    # ==================== 数据库配置 ====================
    # 数据库连接配置
    DATABASE_TYPE: Literal["mysql", "postgresql"] = os.getenv('DATABASE_TYPE', 'mysql')
    DB_HOST: str = os.getenv('DB_HOST')
    if not DB_HOST:
        raise ValueError("DB_HOST 为空，请配置DB_HOST")
    DB_PORT: int = int(os.getenv('DB_PORT'))
    if not DB_PORT:
        raise ValueError("DB_PORT 为空，请配置DB_PORT")
    DB_USER: str = os.getenv('DB_USER')
    if not DB_USER:
        raise ValueError("DB_USER 为空，请配置DB_USER")
    DB_PASSWORD: str = os.getenv('DB_PASSWORD')
    if not DB_PASSWORD:
        raise ValueError("DB_PASSWORD 为空，请配置DB_PASSWORD")
    DB_NAME: str = os.getenv('DB_NAME', 'deepexilab')

    # ==================== MLFLOW数据库配置 ====================
    # 数据库连接配置
    MLFLOW_DATABASE_TYPE: Literal["mysql", "postgresql"] = os.getenv('MLFLOW_DATABASE_TYPE')
    MLFLOW_DB_HOST: str = os.getenv('MLFLOW_DB_HOST')
    MLFLOW_DB_PORT: str = os.getenv('MLFLOW_DB_PORT')
    MLFLOW_DB_USER: str = os.getenv('MLFLOW_DB_USER')
    MLFLOW_DB_PASSWORD: str = os.getenv('MLFLOW_DB_PASSWORD')

    STORAGE_METAURL: str = os.getenv('STORAGE_METAURL')
    if not STORAGE_METAURL:
        raise ValueError("STORAGE_METAURL 为空，请配置STORAGE_METAURL")
    if "redis" in STORAGE_METAURL and not STORAGE_METAURL.endswith('/'):
        raise ValueError("STORAGE_METAURL 使用 Redis 协议时，必须以 '/' 结尾")
    STORAGE_METAURL: str = os.getenv('STORAGE_METAURL', '')


    # ==================== 全局适配客户环境切换 ====================
    PROVIDER_TYPE = os.getenv("PROVIDER_TYPE","default")

    BELLE_API_URL_PRE = os.getenv("BELLE_API_URL_PRE","")
    BELLE_API_CLIENT_ID = os.getenv("BELLE_API_CLIENT_ID","")
    BELLE_API_CLIENT_KEY = os.getenv("BELLE_API_CLIENT_KEY","")
    BELLE_RESOURCES_RATIO_DEFAULT=0.4
    BELLE_RESOURCES_RATIO = os.getenv("BELLE_RESOURCES_RATIO", BELLE_RESOURCES_RATIO_DEFAULT)
    BELLE_TRAINING_ENV_VARIABLES: List[Dict[str, Any]] = env_json("BELLE_TRAINING_ENV_VARIABLES")

    # ==================== 全局配置notebook内部端口数量设置 ====================
    NOTEBOOK_MAX_OPEN_PORTS = os.getenv("NOTEBOOK_MAX_OPEN_PORTS", 5)

    @property
    def DATABASE_URL(self) -> str:
        """
        构建数据库连接URL
        
        优先使用独立配置项构建URL，如果独立配置项不完整则使用DATABASE_URL_FALLBACK
        参考REDIS_URL的实现模式
        """
        # 达梦数据库直接使用 dm:// 用户名:密码@host:port/database
        if self.DATABASE_TYPE in ("dm", "dm8", "dameng"):
            if all([self.DB_HOST, self.DB_USER, self.DB_PASSWORD, self.DB_NAME]):
                port = self.DB_PORT or 5236  # 默认达梦端口
                # return f"dm://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{port}/{self.DB_NAME}"
                return f"dm+dmPython://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{port}?schema={self.DB_NAME}"
            else:
                # fallback
                return getattr(self, "DATABASE_URL_FALLBACK", "dm://DEMO:Demo#1234@127.0.0.1:5237")
        # 检查是否有完整的独立配置项
        if all([self.DB_HOST, self.DB_USER, self.DB_PASSWORD, self.DB_NAME]):
            # 根据数据库类型选择协议
            protocol = "mysql" if self.DATABASE_TYPE == "mysql" else "postgresql"
            # 构建URL，格式：protocol://user:password@host:port/database
            return f"{protocol}://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
    @property
    def STORAGE_ENDPOINT(self) -> str:
        # return self.STORAGE_METAURL
        if "postgres" in self.STORAGE_METAURL:
            return f'{self.STORAGE_METAURL}?table_prefix=juicefs'
        elif "redis" in self.STORAGE_METAURL:
            return self.STORAGE_METAURL
        else:
            return self.STORAGE_METAURL
    
    @property
    def LOKI_PUSH_ENDPOINT(self) -> str:
        """
        构建 Loki 推送端点（alloy 用，外部集群回传日志）
        
        优先使用 LOKI_PUSH_* 配置（本地调试用）
        未配置时 fallback 到 LAB_EXPORT_*（生产环境）
        
        Raises:
            ValueError: 当 LOKI_PUSH_* 和 LAB_EXPORT_* 都未配置时抛出异常
        """
        # 如果配置了 LOKI_PUSH_ADDRESS，使用独立配置
        if self.LOKI_PUSH_ADDRESS:
            protocol = self.LOKI_PUSH_PROTOCOL or 'http'
            return f"{protocol}://{self.LOKI_PUSH_ADDRESS}/loki/api/v1/push"
        
        # Fallback 到 LAB_EXPORT_*，校验配置不为空
        if not self.LAB_EXPORT_PROTOCOL or not self.LAB_EXPORT_ADDRESS:
            raise ValueError(
                "Loki 推送端点配置缺失 LAB_EXPORT_PROTOCOL + LAB_EXPORT_ADDRESS"
            )
        
        if self.LAB_EXPORT_PATH:
            return f"{self.LAB_EXPORT_PROTOCOL}://{self.LAB_EXPORT_ADDRESS}/{self.LAB_EXPORT_PATH}/loki/api/v1/push"
        return f"{self.LAB_EXPORT_PROTOCOL}://{self.LAB_EXPORT_ADDRESS}/loki/api/v1/push"
    
    # ==================== Redis配置 ====================
    # Redis 用于缓存、会话存储和Celery结果后端
    REDIS_HOST: str = os.getenv('NORMAL_REDIS_HOST', 'localhost')
    REDIS_PORT: int = int(os.getenv('NORMAL_REDIS_PORT', 6379))
    REDIS_DB: int = int(os.getenv('NORMAL_REDIS_DB', 0))
    REDIS_PASSWORD: Optional[str] = os.getenv('NORMAL_REDIS_PASSWORD')
    REDIS_LOG_MAX_ENTRIES: int = int(os.getenv('REDIS_LOG_MAX_ENTRIES', 1000))
    REDIS_LOG_EXPIRE_SECONDS: int = int(os.getenv('REDIS_LOG_EXPIRE_SECONDS', 86400))

    REDIS_SENTINEL: str = os.getenv('REDIS_SENTINEL', '')
    REDIS_SENTINEL_HOST_PORT: str = os.getenv('REDIS_SENTINEL_HOST_PORT', '')
    REDIS_MASTER_NAME: str = os.getenv('REDIS_MASTER_NAME', 'mymaster')
    REDIS_SENTINEL_PASSWORD: Optional[str] = os.getenv('REDIS_SENTINEL_PASSWORD')
    REDIS_NODE_PASSWORD: Optional[str] = os.getenv('REDIS_NODE_PASSWORD')
    REDIS_SENTINEL_DB: Optional[str] = os.getenv('REDIS_SENTINEL_DB')
    REDIS_SOCKET_TIMEOUT: int = int(os.getenv('REDIS_SOCKET_TIMEOUT', 10))
    REDIS_SOCKET_CONNECT_TIMEOUT: int = int(os.getenv('REDIS_SOCKET_CONNECT_TIMEOUT', 3))

    @property
    def REDIS_URL(self) -> str:
        """
        构建Redis连接URL（用于普通模式和 Celery）
        
        Sentinel 模式：返回 kombu 支持的 sentinel:// URL 格式
        普通模式：返回标准的 redis:// URL 格式
        """
        if self.REDIS_SENTINEL and self.REDIS_SENTINEL == 'enable':
            # Sentinel 模式：使用 kombu 支持的 sentinel:// URL 格式
            # 格式：sentinel://host1:port1/db;sentinel://host2:port2/db;sentinel://host3:port3/db
            # 或：sentinel://:password@host1:port1/db;sentinel://:password@host2:port2/db;sentinel://:password@host3:port3/db
            # 注意：Redis 主节点密码和数据库编号都在 URL 中传递
            sentinel_hosts = _parse_sentinel_hosts(self.REDIS_SENTINEL_HOST_PORT)
            if sentinel_hosts:
                # 构建 Sentinel URL 列表
                # 如果 Redis 主节点需要密码，在 URL 中包含密码
                # 使用 REDIS_SENTINEL_DB 如果设置了，否则使用 REDIS_DB
                db = int(self.REDIS_SENTINEL_DB)
                sentinel_urls = []
                for host, port in sentinel_hosts:
                    if self.REDIS_NODE_PASSWORD:
                        # 在 URL 中包含 Redis 主节点密码和数据库编号
                        sentinel_urls.append(f"sentinel://:{self.REDIS_NODE_PASSWORD}@{host}:{port}/{db}")
                    else:
                        # 在 URL 中包含数据库编号
                        sentinel_urls.append(f"sentinel://{host}:{port}/{db}")
                # 使用分号连接多个 Sentinel 节点
                return ";".join(sentinel_urls)
            # 如果没有配置 Sentinel 地址，fallback 到普通模式
            if self.REDIS_PASSWORD:
                return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
            else:
                return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
        else:
            # 普通模式
            if self.REDIS_PASSWORD:
                return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
            else:
                return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
    
    # ==================== 安全配置 ====================
    # 接入控制台需要使用控制台的JWT_SECRET_KEY
    JWT_SECRET_KEY: str = os.getenv('JWT_SECRET_KEY', 'd20a0382a5f840f7afbd3f4df92ecaf8')
    JWT_ALGORITHM: str = os.getenv('JWT_ALGORITHM', 'HS256')
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv('JWT_ACCESS_TOKEN_EXPIRE_MINUTES', 1440))
    
    # ==================== 日志配置 ====================
    LOG_LEVEL: str = os.getenv('LOG_LEVEL', 'INFO')
    LOG_FILE: str = os.getenv('LOG_FILE', 'logs/app.log')  # 日志文件路径
    LOG_FORMAT: str = os.getenv('LOG_FORMAT', '%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    LOG_RETENTION: Optional[str] = os.getenv('LOG_RETENTION', '30 days')
    LOG_ROTATION: Optional[str] = os.getenv('LOG_ROTATION', '1 day')
    LOG_TO_STDOUT: bool = os.getenv('LOG_TO_STDOUT', 'true').lower() == 'true'
    LOG_TO_FILE: bool = os.getenv('LOG_TO_FILE', 'true').lower() == 'true'
    # 为 true 时，含换行的 message（如多行 SQL）每一行前都带上时间、request_id、级别、位置（便于 Loki 按行匹配）。默认开启。
    LOG_MULTILINE_PREFIX_EACH_LINE: bool = os.getenv('LOG_MULTILINE_PREFIX_EACH_LINE', 'true').lower() == 'true'

    # ==================== 数据清洗配置 ====================
    # 清洗任务资源配置
    DATA_JUICER_WORKERS: int = int(os.getenv("DATA_JUICER_WORKERS", 4))
    DATA_CLEANING_CPU_LIMIT: str = os.getenv('DATA_CLEANING_CPU_LIMIT', '2')
    DATA_CLEANING_MEMORY_LIMIT: str = os.getenv('DATA_CLEANING_MEMORY_LIMIT', '4Gi')
    DATA_CLEANING_CPU_REQUEST: str = os.getenv('DATA_CLEANING_CPU_REQUEST', '2')
    DATA_CLEANING_MEMORY_REQUEST: str = os.getenv('DATA_CLEANING_MEMORY_REQUEST', '4Gi')
    # 默认关闭 PyTorch 设备后端自动发现，避免通用镜像在未完整安装 Ascend 运行时的情况下误加载 torch_npu。
    DATA_CLEANING_TORCH_DEVICE_BACKEND_AUTOLOAD: str = os.getenv(
        'DATA_CLEANING_TORCH_DEVICE_BACKEND_AUTOLOAD', '0'
    )

    # ==================== Celery配置 ====================
    # Celery 任务队列配置
    CELERY_TIMEZONE: str = os.getenv('CELERY_TIMEZONE', 'Asia/Shanghai')
    
    # ==================== MLflow配置 ====================
    # MLflow 实验跟踪配置
    MLFLOW_HOST: str = os.getenv('LAB_MLFLOW_HOST','')
    MLFLOW_PORT: int = int(os.getenv('LAB_MLFLOW_PORT', 0))
    MLFLOW_DB: str = os.getenv('MLFLOW_DB', 'mlflowdb')
    
    @property
    def MLFLOW_TRACKING_URI(self) -> str:
        """
        构建MLflow跟踪服务器URI
        
        通过前端nginx服务转发到MLflow容器：
        - 外部访问：LAB_EXPORT_ADDRESS (如: 101.126.150.150:8072)
        - nginx路由：/api/2.0/mlflow/* -> mlflow:5000
        - 工件访问：/mlflow-artifacts/* -> mlflow:5000
        - Web UI：/mlflow/* -> mlflow:5000
        
        注意：返回包含/mlflow路径的URI，确保训练任务输出的URL能正确访问MLflow Web UI
        """
        # 本地开发的时候需要配置一下
        if self.MLFLOW_HOST != '' and self.MLFLOW_PORT != 0: 
            return f"http://{self.MLFLOW_HOST}:{self.MLFLOW_PORT}/mlflow"
     
        if self.LAB_EXPORT_PATH and self.LAB_EXPORT_PATH != '':
            return f"{self.LAB_EXPORT_PROTOCOL}://{self.LAB_EXPORT_ADDRESS}/{self.LAB_EXPORT_PATH}/mlflow"
        return f"{self.LAB_EXPORT_PROTOCOL}://{self.LAB_EXPORT_ADDRESS}/mlflow"

    @property
    def BACKEND_URL(self) -> str:
        """
        构建BACKEND_URL服务器URI
        """
        if self.LAB_EXPORT_PATH and self.LAB_EXPORT_PATH != '':
            return f"{self.LAB_EXPORT_PROTOCOL}://{self.LAB_EXPORT_ADDRESS}/{self.LAB_EXPORT_PATH}"
        return f"{self.LAB_EXPORT_PROTOCOL}://{self.LAB_EXPORT_ADDRESS}"
    
    @property
    def MLFLOW_BACKEND_STORE_URI(self) -> str:
        """构建MLflow后端存储URI（数据库连接）"""
        if self.MLFLOW_DATABASE_TYPE and self.MLFLOW_DB_HOST and self.MLFLOW_DB_PORT and self.MLFLOW_DB_USER and self.MLFLOW_DB_PASSWORD:
            # 根据数据库类型选择协议
            MLFLOW_DB_PORT = int(self.MLFLOW_DB_PORT)
            protocol = "mysql" if self.MLFLOW_DATABASE_TYPE == "mysql" else "postgresql"
            # 使用与主数据库相同的连接信息，但使用MLflow专用数据库
            return f"{protocol}://{self.MLFLOW_DB_USER}:{urllib.parse.quote_plus(self.MLFLOW_DB_PASSWORD)}@{self.MLFLOW_DB_HOST}:{MLFLOW_DB_PORT}/{self.MLFLOW_DB}"

        # 根据数据库类型选择协议
        protocol = "mysql" if self.DATABASE_TYPE == "mysql" else "postgresql"
        # 使用与主数据库相同的连接信息，但使用MLflow专用数据库
        return f"{protocol}://{self.DB_USER}:{urllib.parse.quote_plus(self.DB_PASSWORD)}@{self.DB_HOST}:{self.DB_PORT}/{self.MLFLOW_DB}"
    
    def get_mlflow_experiment_name(self, project_name: str, task_name: str, tenant_id: str = None) -> str:
        """生成MLflow实验名称（支持租户隔离）
        
        Args:
            project_name: 项目名称
            task_name: 任务名称
            tenant_id: 租户ID（可选，如果不提供则从上下文获取）
            
        Returns:
            str: 格式化的实验名称 deepexilab-{tenant_id}-{project_name}-{task_name}
        """
        from app.utils.app_runtime_context import get_tenant_id
        
        # 如果没有传入 tenant_id，从上下文获取
        if tenant_id is None:
            tenant_id = get_tenant_id()
        
        # 如果仍然没有 tenant_id，使用默认值（向后兼容）
        if tenant_id:
            return f"deepexilab-{tenant_id}-{project_name}-{task_name}"
        else:
            # 向后兼容：如果没有 tenant_id，使用旧格式
            return f"deepexilab-{project_name}-{task_name}"
    
    def get_mlflow_run_name(self, task_name: str, version: str, task_id: int) -> str:
        """生成MLflow运行名称
        
        Args:
            task_name: 任务名称
            version: 任务版本
            task_id: 任务ID
            
        Returns:
            str: 格式化的运行名称 {task_name}-{version}-{task_id}
        """
        return f"{task_name}-{version}-{task_id}"
    

    
    # ==================== MinIO配置 ====================
    # MinIO 对象存储 - 用于文件存储和归档
    MINIO_ENDPOINT: str = os.getenv('MINIO_ENDPOINT')
    if not MINIO_ENDPOINT:
        raise ValueError("MINIO_ENDPOINT 为空，请配置MINIO_ENDPOINT")
    MINIO_ACCESS_KEY: str = os.getenv('MINIO_ACCESS_KEY')
    if not MINIO_ACCESS_KEY:
        raise ValueError("MINIO_ACCESS_KEY 为空，请配置MINIO_ACCESS_KEY")
    MINIO_SECRET_KEY: str = os.getenv('MINIO_SECRET_KEY')
    if not MINIO_SECRET_KEY:
        raise ValueError("MINIO_SECRET_KEY 为空，请配置MINIO_SECRET_KEY")
    MINIO_SECURE: str = os.getenv('MINIO_SECURE', 'false')
    if MINIO_SECURE not in ['true', 'false']:
        raise ValueError("MINIO_SECURE 配置错误，只能为 true 或 false")
    MINIO_BUCKET: str = os.getenv('MINIO_BUCKET', 'deepexilab')  # 文件存储桶

    @property
    def JUICEFS_CLIENT(self) -> juicefs.Client:
        """构建JUICEFS客户端"""
        return juicefs.Client(name="",meta=self.STORAGE_ENDPOINT)

    redis_client: AsyncRedis | None = None
    redis_client_sync: redis_sync.Redis | None = None

    @property
    def REDIS_CLIENT(self) -> AsyncRedis:
        """
        懒加载异步 Redis 客户端 (全局单例)
        支持普通模式和 Sentinel 模式
        第一次调用创建，后续复用
        
        注意：异步 Sentinel 客户端需要在使用时通过 await 初始化
        """
        if self.redis_client is None:
            if self.REDIS_SENTINEL and self.REDIS_SENTINEL == 'enable':
                # Sentinel 模式（异步）
                sentinel_hosts = _parse_sentinel_hosts(self.REDIS_SENTINEL_HOST_PORT)
                if not sentinel_hosts:
                    raise ValueError("REDIS_SENTINEL_HOST_PORT 配置错误，无法解析 Sentinel 地址")

                from redis.asyncio.sentinel import Sentinel

                # 创建异步 Sentinel 连接
                sentinel = Sentinel(
                    sentinel_hosts,
                    password=self.REDIS_NODE_PASSWORD,
                    socket_timeout=self.REDIS_SOCKET_TIMEOUT,
                    socket_connect_timeout=self.REDIS_SOCKET_CONNECT_TIMEOUT
                )

                # 获取主节点客户端（异步 Sentinel 的 master_for 返回的是 Redis 对象，不是协程）
                # 使用 REDIS_SENTINEL_DB 如果设置了，否则使用 REDIS_DB
                db = int(self.REDIS_SENTINEL_DB)
                self.redis_client = sentinel.master_for(
                    self.REDIS_MASTER_NAME,
                    password=self.REDIS_NODE_PASSWORD,
                    db=db,
                    socket_timeout=self.REDIS_SOCKET_TIMEOUT,
                    decode_responses=True
                )
            else:
                # 普通模式（异步）
                self.redis_client = redis_async.from_url(
                    self.REDIS_URL,
                    encoding="utf-8",
                    decode_responses=True,
                )
        return self.redis_client

    @property
    def REDIS_CLIENT_SYNC(self) -> redis_sync.Redis:
        """
        懒加载同步 Redis 客户端
        用于 APScheduler / 后台任务 / 初始化阶段
        """
        if self.redis_client_sync is None:
            if self.REDIS_SENTINEL and self.REDIS_SENTINEL == 'enable':
                sentinel_hosts = _parse_sentinel_hosts(self.REDIS_SENTINEL_HOST_PORT)
                if not sentinel_hosts:
                    raise ValueError("REDIS_SENTINEL_HOST_PORT 配置错误")

                from redis.sentinel import Sentinel as SyncSentinel

                sentinel = SyncSentinel(
                    sentinel_hosts,
                    password=self.REDIS_NODE_PASSWORD,
                    socket_timeout=self.REDIS_SOCKET_TIMEOUT,
                )

                db = int(self.REDIS_SENTINEL_DB)
                self.redis_client_sync = sentinel.master_for(
                    self.REDIS_MASTER_NAME,
                    password=self.REDIS_NODE_PASSWORD,
                    db=db,
                    socket_timeout=self.REDIS_SOCKET_TIMEOUT,
                    decode_responses=True,
                )
            else:
                self.redis_client_sync = redis_sync.Redis.from_url(
                    self.REDIS_URL,
                    decode_responses=True,
                )

        return self.redis_client_sync

    FASTDATA_WORKBENCH_URL_PRE: str = os.getenv('FASTDATA_WORKBENCH_URL_PRE')
    if not FASTDATA_WORKBENCH_URL_PRE:
        raise ValueError("FASTDATA_WORKBENCH_URL_PRE 配置错误，无法获取控制台URL")
    APP_ID: str = os.getenv('APP_ID', '1442199057321728')
    ADMIN_ROLE_NAME: str = os.getenv("ADMIN_ROLE_NAME", "模型训练管理员")



# 创建全局配置实例
settings = Settings()


def get_settings() -> Settings:
    """
    获取应用配置实例
    
    此函数用作FastAPI的依赖注入
    
    Returns:
        Settings实例
    """
    return settings


# 导出常用配置，方便其他模块导入
__all__ = ['Settings', 'settings', 'get_settings'] 