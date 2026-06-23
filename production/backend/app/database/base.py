from sqlalchemy.event import listen
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import create_engine, text, select, Select, BooleanClauseList, BinaryExpression, Update, Delete, \
    ColumnElement
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session, Query
from sqlalchemy.orm.util import AliasedClass

from app.core.config import settings
import logging
from typing import Dict, Any, Optional, AsyncGenerator, Union, List
from urllib.parse import urlparse
from contextlib import asynccontextmanager
from sqlalchemy import event, TypeDecorator, JSON
from sqlalchemy.ext.asyncio import AsyncSession as BaseAsyncSession
from app.database.dialect_utils import get_dialect, DbDialect
import json
import asyncio
from sqlalchemy.engine import Result

from app.utils import app_runtime_context
from starlette.exceptions import HTTPException

# Configure logger
logger = logging.getLogger(__name__)

# 自定义JSON类型，确保中文字符正确编码而非Unicode编码
class ChineseJSON(TypeDecorator):
    """
    自定义JSON类型，确保中文字符正确编码
    
    这个类型会拦截所有JSON数据的序列化过程，确保中文字符以正常中文形式存储
    而不是Unicode编码形式 (xxxx)
    """
    impl = JSON
    cache_ok = True
    
    def process_bind_param(self, value, dialect):
        """
        处理写入数据库前的参数
        
        Args:
            value: 要序列化的数据
            dialect: 数据库方言
            
        Returns:
            处理后的数据
        """
        if value is None:
            return None
        
        # 强制使用ensure_ascii=False确保中文正确编码
        # 注意: 这里我们先通过json.dumps序列化，让SQLAlchemy在内部再解析这个JSON字符串
        # 这样能确保中文字符不会被编码为Unicode
        serialized = json.dumps(value, ensure_ascii=False)
        
        # 对于PostgreSQL，返回JSON字符串即可
        if settings.DATABASE_TYPE == "postgresql":
            return serialized
            
        # 对于其他数据库类型，我们使用默认的JSON序列化逻辑
        return value
    
    def process_result_value(self, value, dialect):
        """
        处理从数据库读取的值
        
        Args:
            value: 从数据库读取的值
            dialect: 数据库方言
            
        Returns:
            处理后的数据
        """
        # 使用标准方式反序列化，不需要特殊处理
        return value

class Base(DeclarativeBase):
    """
    SQLAlchemy声明式基类
    
    所有模型类都应该继承这个类
    内部使用了自定义的JSON类型处理中文字符编码
    """
    # 类型注册表，将标准JSON类型替换为我们的自定义类型
    type_annotation_map = {
        Dict[str, Any]: ChineseJSON,
        Dict: ChineseJSON,
        list: ChineseJSON,
       
    }


class AsyncCompatibleResult:
    """包装同步 Result，使 scalars() / first() / all() 等可直接用"""
    def __init__(self, result: Result, loop: asyncio.AbstractEventLoop):
        self._result = result
        self._loop = loop

    def scalars(self):
        return AsyncCompatibleScalars(self._result.scalars(), self._loop)

    def first(self):
        return self._result.first()

    def all(self):
        return self._result.all()

    def scalar_one_or_none(self):
        return self._result.scalar_one_or_none()

    def scalar_one(self):
        return self._result.scalar_one()

    def scalar(self):
        return self._result.scalar()



class AsyncCompatibleScalars:
    """包装同步 ScalarsResult"""
    def __init__(self, scalars, loop: asyncio.AbstractEventLoop):
        self._scalars = scalars
        self._loop = loop

    def first(self):
        return self._scalars.first()

    def all(self):
        return self._scalars.all()

    def __iter__(self):
        return iter(self._scalars)


class AsyncCompatibleSession:
    """包装同步 Session，使其具备异步接口"""
    def __init__(self, sync_session: Session):
        self._sync = sync_session
        self._loop = asyncio.get_running_loop()

    # 数据操作方法
    def add(self, obj: Any):
        self._sync.add(obj)

    def add_all(self, objs: List[Any]):
        self._sync.add_all(objs)

    async def flush(self):
        await self._loop.run_in_executor(None, self._sync.flush)

    async def commit(self):
        await self._loop.run_in_executor(None, self._sync.commit)

    async def rollback(self):
        await self._loop.run_in_executor(None, self._sync.rollback)

    async def refresh(self, obj: Any):
        await self._loop.run_in_executor(None, self._sync.refresh, obj)

    async def close(self):
        await self._loop.run_in_executor(None, self._sync.close)

    async def scalar(self, *args, **kwargs):
        """兼容 fastapi-pagination 等直接调用 scalar 的场景"""
        return await self._loop.run_in_executor(None, lambda: self._sync.scalar(*args, **kwargs))

    async def execute(self, stmt, *args, **kwargs):
        # 仅 execute，不包装 Result
        return await self._loop.run_in_executor(None, lambda: self._sync.execute(stmt, *args, **kwargs))

    async def delete(self, obj: Any):
        return await self._loop.run_in_executor(None, lambda: self._sync.delete(obj))

    def scalars(self, result):
        # 手动包装 result.scalars()
        return AsyncCompatibleScalars(result.scalars(), self._loop)

    # 上下文管理
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()


def get_db_connection_args() -> Dict[str, Any]:
    """
    Get database-specific connection arguments
    
    Returns:
        Dict[str, Any]: Connection arguments for the configured database type
    """
    common_args = {
        "connect_timeout": 30
    }
    
    if settings.DATABASE_TYPE == "mysql":
        return common_args
    elif settings.DATABASE_TYPE == "postgresql":
        # PostgreSQL specific connection args
        postgresql_args = {
            "timeout": 10,  
            "command_timeout": 30, 
            "prepared_statement_cache_size": 500,
            "statement_cache_size": 200,
            "server_settings": {
                "timezone": "Asia/Shanghai"  # 设置会话时区为上海时区
            }
        }
        return postgresql_args
    
    return common_args

def get_connection_url() -> str:
    """
    Get the appropriate connection URL based on the configured database type.
    
    If the URL already has the correct prefix for the database type, it is returned as is.
    Otherwise, the URL is modified to use the correct prefix.
    
    Returns:
        str: The database connection URL with the correct prefix
    """
    url = settings.DATABASE_URL
    parsed_url = urlparse(url)
    
    # Determine the correct prefix based on database type
    if settings.DATABASE_TYPE == "mysql" and not url.startswith("mysql+aiomysql://"):
        if url.startswith("mysql://"):
            # Replace mysql:// with mysql+aiomysql://
            return url.replace("mysql://", "mysql+aiomysql://", 1)
        else:
            logger.warning(f"DATABASE_URL does not start with 'mysql://' but DATABASE_TYPE is 'mysql'. Ensure your connection URL is correct.")
    
    elif settings.DATABASE_TYPE == "postgresql" and not url.startswith("postgresql+asyncpg://"):
        if url.startswith("postgresql://"):
            # Replace postgresql:// with postgresql+asyncpg://
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgres://"):
            # Replace postgres:// with postgresql+asyncpg://
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        else:
            logger.warning(f"DATABASE_URL does not start with 'postgresql://' or 'postgres://' but DATABASE_TYPE is 'postgresql'. Ensure your connection URL is correct.")
    
    return url


def get_sync_connection_url() -> str:
    """
    获取同步数据库连接URL
    
    Returns:
        str: 同步数据库连接URL
    """
    url = settings.DATABASE_URL
    
    # 将异步URL转换为同步URL
    if settings.DATABASE_TYPE == "mysql" and url.startswith("mysql+aiomysql://"):
        # 将 mysql+aiomysql:// 替换为 mysql+pymysql://
        return url.replace("mysql+aiomysql://", "mysql+pymysql://", 1)
    elif settings.DATABASE_TYPE == "postgresql" and url.startswith("postgresql+asyncpg://"):
        # 将 postgresql+asyncpg:// 替换为 postgresql+psycopg2://
        return url.replace("postgresql+asyncpg://", "postgresql+psycopg2://", 1)
    elif url.startswith("mysql://"):
        # 原始mysql URL，添加pymysql驱动
        return url.replace("mysql://", "mysql+pymysql://", 1)
    elif url.startswith("postgresql://") or url.startswith("postgres://"):
        # 原始postgresql URL，添加psycopg2驱动
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+psycopg2://", 1)
        else:
            return url.replace("postgresql://", "postgresql+psycopg2://", 1)
    
    return url

def patch_dm_sqlalchemy():
    """
    修复 sqlalchemy_dm 在 SQLAlchemy 2.x 下的兼容问题：
    - 缺失 _json_serializer / _json_deserializer 属性
    - 某些类型解析异常
    - DDL 语法不兼容问题（部分版本）
    """
    try:
        import sqlalchemy_dm.base as dm_base
        dialect_cls = getattr(dm_base, "DMDialect_dmPython", dm_base.DMDialect)

        # 修复 JSON 序列化器问题
        if not hasattr(dialect_cls, "_json_deserializer"):
            dialect_cls._json_deserializer = staticmethod(json.loads)
        if not hasattr(dialect_cls, "_json_serializer"):
            dialect_cls._json_serializer = staticmethod(json.dumps)

        # 修复 datetime/time 类型解析异常
        if not hasattr(dialect_cls, "_resolve_time_type"):
            def _resolve_time_type(self, value):
                return str(value)
            dialect_cls._resolve_time_type = _resolve_time_type

        # 修复部分版本未声明事务支持
        if not hasattr(dialect_cls, "supports_sane_rowcount_returning"):
            dialect_cls.supports_sane_rowcount_returning = True
        if not hasattr(dialect_cls, "supports_sane_multi_rowcount"):
            dialect_cls.supports_sane_multi_rowcount = True

        # 打印确认日志
        logging.getLogger(__name__).info("[DM PATCH] 达梦 SQLAlchemy 方言补丁已应用。")

    except Exception as e:
        logging.getLogger(__name__).warning(f"[DM PATCH] 达梦补丁应用失败: {e}")

# 判断是否为达梦
IS_DM = settings.DATABASE_TYPE in ("dm", "dm8", "dameng")

if IS_DM:
    patch_dm_sqlalchemy()
    # 达梦同步引擎
    sync_engine = create_engine(
        settings.DATABASE_URL,
        echo=False,  # 禁用直接输出，通过logging系统统一处理
        pool_size=4,
        max_overflow=100,
        pool_timeout=90,
        pool_recycle=1200,
        pool_pre_ping=True,
        pool_use_lifo=True
    )
else:
    # 原有异步引擎
    engine = create_async_engine(
        get_connection_url(),
        echo=False,  # 禁用直接输出，通过logging系统统一处理
        pool_size=4,  # 增加连接池大小
        max_overflow=100,  # 增加溢出连接数，从40增加到100
        pool_timeout=90,
        pool_recycle=1200,  # 连接池回收时间，1200秒=20分钟
        pool_pre_ping=True,
        pool_use_lifo=True,
        connect_args=get_db_connection_args(),
        json_serializer=lambda obj: json.dumps(obj, ensure_ascii=False))

    # Configure async session with expire_on_commit=False to prevent detached instance errors
    AsyncSessionLocal = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False
    )


# 同步Session（Celery等任务使用）
if not IS_DM:
    sync_engine = create_engine(
        get_sync_connection_url(),
        echo=False,  # 禁用直接输出，通过logging系统统一处理
        pool_size=4,
        max_overflow=100,
        pool_timeout=90,
        pool_recycle=1200,
        pool_pre_ping=True,
        pool_use_lifo=True,
        json_serializer=lambda obj: json.dumps(obj, ensure_ascii=False)
    )

# Configure sync session for Celery tasks
SessionLocal = sessionmaker(
    sync_engine,
    class_=Session,
    expire_on_commit=False,
    autoflush=False
)

def before_execute_handler(conn, clauseelement, multiparams, params):
    if not isinstance(clauseelement, (Select, Update, Delete)):
        return clauseelement, multiparams, params

    current_tenant = app_runtime_context.get_tenant_id()
    if not current_tenant:
        return clauseelement, multiparams, params

    logger.debug(f"原始查询 SQL: {clauseelement}")

    # Select
    if isinstance(clauseelement, Select):
        whereclause = clauseelement.whereclause
        if whereclause is not None and "tenant_id" in str(whereclause):
            return clauseelement, multiparams, params

        # 检查 FROM 子句中的子查询是否已包含 tenant_id 条件
        for from_obj in clauseelement.get_final_froms():
            # 检查子查询的 SQL 字符串中是否包含 tenant_id
            try:
                from_obj_str = str(from_obj)
                if "tenant_id" in from_obj_str:
                    return clauseelement, multiparams, params
            except Exception:
                pass

        tenant_conditions = []

        for from_obj in clauseelement.get_final_froms():
            # Join / Alias / Subquery 都统一从 .c 取列
            if hasattr(from_obj, "c") and "tenant_id" in from_obj.c:
                tenant_conditions.append(
                    from_obj.c.tenant_id == current_tenant
                )

        # 没有任何 tenant 表，直接放行
        if not tenant_conditions:
            return clauseelement, multiparams, params

        # 只追加一次 where（避免多表语义混乱）
        for cond in tenant_conditions:
            clauseelement = clauseelement.where(cond)

    # Update，Delete
    table = getattr(clauseelement, "table", None)
    if table is None:
        return clauseelement, multiparams, params

    # 表本身没有 tenant_id，直接放行
    if not hasattr(table, "c") or "tenant_id" not in table.c:
        return clauseelement, multiparams, params

    # 已经有人手动加过 tenant 条件，直接放行
    whereclause = clauseelement.whereclause
    if whereclause is not None and "tenant_id" in str(whereclause):
        return clauseelement, multiparams, params

    tenant_expr: ColumnElement[bool] = table.c.tenant_id == current_tenant
    # 自动注入 tenant 条件
    clauseelement = clauseelement.where(tenant_expr)

    logger.debug(f"添加租户条件后的查询 SQL: {clauseelement}")

    return clauseelement, multiparams, params


# 绑定事件（注意：需设置 retval=True 并返回正确格式才会生效）
from sqlalchemy.event import listen

try:
    if 'sync_engine' in globals() and sync_engine is not None:
        listen(sync_engine, "before_execute", before_execute_handler, retval=True)
except NameError:
    pass

try:
    if 'engine' in globals() and engine is not None:
        listen(engine.sync_engine, "before_execute", before_execute_handler, retval=True)
except NameError:
    pass



# Create a session factory for direct use in background tasks
@asynccontextmanager
async def async_session():
    """
    Create a new database session for use in async context managers.
    
    Usage:
        async with async_session() as session:
            # use session here
    
    Returns:
        AsyncSession: A database session
    """
    if IS_DM:
        loop = asyncio.get_running_loop()
        session = Session(sync_engine)
        try:
            yield session
        finally:
            await loop.run_in_executor(None, session.close)
    else:
        session = AsyncSessionLocal()
        try:
            yield session
        finally:
            await session.close()


async def get_db() -> AsyncGenerator[Union[AsyncSession, AsyncCompatibleSession], None]:
    """
    Dependency function to get a database session.
    
    Yields:
        AsyncSession: A database session
    """
    session = None
    try:
        if IS_DM:
            sync_sess = Session(sync_engine)
            session = AsyncCompatibleSession(sync_sess)
        else:
            session = AsyncSessionLocal()

        yield session
    except Exception as e:
        # 此处不再记录完整的异常堆栈，避免重复打印
        logger.error(f"Database session error: {str(e)}")
        if session:
            try:
                await session.rollback()
            except Exception as rollback_error:
                logger.error(f"Database rollback error: {str(rollback_error)}")
        raise
    finally:
        if session:
            try:
                await session.close()
            except Exception as close_error:
                logger.error(f"Database close error: {str(close_error)}")

# 添加直接获取session的函数，用于脚本和 Celery 任务
# 统一使用同步引擎 + AsyncCompatibleSession，避免事件循环冲突
@asynccontextmanager
async def get_db_session():
    """
    获取数据库会话（用于脚本和 Celery 任务）
    
    使用同步引擎 + AsyncCompatibleSession，避免 asyncio.run() 创建新事件循环时
    与旧事件循环绑定的异步连接发生冲突（Event loop is closed 错误）
    """
    session = Session(sync_engine)
    async_session = AsyncCompatibleSession(session)

    try:
        yield async_session
    except Exception as e:
        # 此处不再记录完整的异常堆栈，避免重复打印
        logger.error(f"Database session error: {str(e)}")
        await async_session.rollback()
        raise
    finally:
        await async_session.close()