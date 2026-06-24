import json
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any, AsyncGenerator, Union, List
from urllib.parse import urlparse

from sqlalchemy import create_engine, text, Select, BooleanClauseList, BinaryExpression, Update, Delete, ColumnElement
from sqlalchemy.event import listen
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm.util import AliasedClass

from app.core.config import settings
from app.utils import app_runtime_context
from app.database.base import AsyncCompatibleSession, before_execute_handler

# Configure logger
logger = logging.getLogger(__name__)


class Database:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self, ) -> None:
        if getattr(self, "_initialized", False):
            return

        from app.database.base import IS_DM, sync_engine, get_connection_url, get_db_connection_args
        self._is_dm = IS_DM

        if self._is_dm:
            # 达梦同步引擎
            from sqlalchemy.orm import Session
            self._sync_engine = sync_engine
            self._session_factory = Session(self._sync_engine)
            # 绑定事件（注意：需返回修改后的 clauseelement 才会生效）
            listen(self._sync_engine, "before_execute", before_execute_handler, retval=True)
        else:
            self._engine = create_async_engine(
                DATABASE_URL,
                echo=settings.LOG_LEVEL.upper() == "DEBUG",  # 只有在DEBUG级别时才启用echo
                pool_size=20,
                max_overflow=100,
                pool_timeout=30,
                pool_recycle=1200,
                pool_pre_ping=True,
                pool_use_lifo=True,
                connect_args=connect_args,
                json_serializer=lambda obj: json.dumps(obj, ensure_ascii=False)  # 确保JSON序列化不使用Unicode编码
            )
            self._session_factory = async_sessionmaker(
                self._engine,
                class_=AsyncSession,
                expire_on_commit=False,
                autoflush=False
            )
            # 同步数据库引擎配置（用于Celery任务）- 优化连接池配置
            # 同步数据库引擎配置（用于Celery任务）- 优化连接池配置
            sync_engine = create_engine(
                get_sync_connection_url(),
                echo=settings.LOG_LEVEL.upper() == "DEBUG",  # 只有在DEBUG级别时才启用echo
                pool_size=4,  # 增加连接池大小
                max_overflow=100,  # 增加溢出连接数，从40增加到100
                pool_timeout=90,
                pool_recycle=1200,
                pool_pre_ping=True,
                pool_use_lifo=True,  # 使用LIFO策略，提高连接复用效率
                json_serializer=lambda obj: json.dumps(obj, ensure_ascii=False)  # 确保JSON序列化不使用Unicode编码
            )
            # 绑定事件（注意：需返回修改后的 clauseelement 才会生效）
            listen(sync_engine, "before_execute", before_execute_handler, retval=True)
            listen(self._engine.sync_engine, "before_execute", before_execute_handler, retval=True)

        self._initialized = True

    @asynccontextmanager
    async def session(self) -> AsyncGenerator[Union[AsyncSession, AsyncCompatibleSession], None]:
        """
            Dependency function to get a database session.

            Yields:
                AsyncSession: A database session
            """
        session = None
        try:
            if self._is_dm:
                from sqlalchemy.orm import Session
                sync_sess = Session(self._sync_engine)
                session = AsyncCompatibleSession(sync_sess)
            else:
                session = self._session_factory()
            # 测试会话连接性
            await session.execute(text("SELECT 1"))
            yield session
        except Exception as e:
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
            logger.warning(
                f"DATABASE_URL does not start with 'mysql://' but DATABASE_TYPE is 'mysql'. Ensure your connection URL is correct.")

    elif settings.DATABASE_TYPE == "postgresql" and not url.startswith("postgresql+asyncpg://"):
        if url.startswith("postgresql://"):
            # Replace postgresql:// with postgresql+asyncpg://
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgres://"):
            # Replace postgres:// with postgresql+asyncpg://
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        else:
            logger.warning(
                f"DATABASE_URL does not start with 'postgresql://' or 'postgres://' but DATABASE_TYPE is 'postgresql'. Ensure your connection URL is correct.")

    return url


# Use the connection URL and arguments from helper functions
DATABASE_URL = get_connection_url()
connect_args = get_db_connection_args()


# 获取同步数据库连接URL（移除async相关的驱动前缀）
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


# todo 这里没有生效，逻辑太复杂，还是手动线拼接处理多租户条件吧，后期有时间可以多考虑一下如何实现
# def before_execute_handler(conn, clauseelement, multiparams, params):
#     """拦截同步 Session 的 SELECT 查询"""
#     """拦截cept SELECT queries and add tenant tenant filter"""
#     if isinstance(clauseelement, Select):
#         logger.debug(f"原始查询 SQL: {clauseelement}")
#         current_tenant = app_runtime_context.get_tenant_id()  # 假设已实现获取租户ID的逻辑
#         if not current_tenant:
#             return conn, clauseelement, multiparams, params
#
#         # 1. 获取查询涉及的实体（模型或表）
#         entities = []
#         # 处理 FROM 子句中的表或模型（支持 JOIN 等复杂查询）
#         for from_obj in clauseelement.get_final_froms():
#             # 解析别名（如 aliased(User)）
#             if isinstance(from_obj, AliasedClass):
#                 entity = from_obj.entity
#             else:
#                 entity = from_obj
#             entities.append(entity)
#
#         # 2. 为包含 tenant_id 的实体添加过滤条件
#         for entity in entities:
#             # 检查实体是否有 tenant_id 字段（区分 ORM 模型和 Table 对象）
#             if hasattr(entity, 'tenant_id') or (hasattr(entity, 'c') and 'tenant_id' in entity.c):
#                 # 构建租户条件（模型用 entity.tenant_id，表用 entity.c.tenant_id）
#                 if hasattr(entity, 'c'):  # Table 对象
#                     tenant_column = entity.c.tenant_id
#                 else:  # ORM 模型
#                     tenant_column = entity.tenant_id
#                 target_condition = tenant_column == current_tenant
#
#                 # 3. 检查是否已存在相同条件（避免重复添加）
#                 has_tenant_condition = False
#                 if clauseelement.whereclause is not None:
#                     # 处理 where 条件（可能是单个条件或多个条件的组合）
#                     clauses = (
#                         clauseelement.whereclause.clauses
#                         if isinstance(clauseelement.whereclause, BooleanClauseList)
#                         else [clauseelement.whereclause]
#                     )
#                     for cond in clauses:
#                         if isinstance(cond, BinaryExpression) and cond == target_condition:
#                             has_tenant_condition = True
#                             break
#
#                 # 4. 不存在则添加条件
#                 if not has_tenant_condition:
#                     clauseelement = clauseelement.where(target_condition)
#
#         logger.debug(f"添加租户条件后的查询 SQL: {clauseelement}")
#
#     return conn, clauseelement, multiparams, params

# def before_execute_handler(conn, clauseelement, multiparams, params):
#     if not isinstance(clauseelement, (Select, Update, Delete)):
#         return clauseelement, multiparams, params
#
#     current_tenant = app_runtime_context.get_tenant_id()
#     if not current_tenant:
#         return clauseelement, multiparams, params
#
#     logger.debug(f"原始查询 SQL: {clauseelement}")
#
#     # Select
#     if isinstance(clauseelement, Select):
#         whereclause = clauseelement.whereclause
#         if whereclause is not None and "tenant_id" in str(whereclause):
#             return clauseelement, multiparams, params
#
#         tenant_conditions = []
#
#         for from_obj in clauseelement.get_final_froms():
#             # Join / Alias / Subquery 都统一从 .c 取列
#             if hasattr(from_obj, "c") and "tenant_id" in from_obj.c:
#                 tenant_conditions.append(
#                     from_obj.c.tenant_id == current_tenant
#                 )
#
#         # 没有任何 tenant 表，直接放行
#         if not tenant_conditions:
#             return clauseelement, multiparams, params
#
#         # 只追加一次 where（避免多表语义混乱）
#         for cond in tenant_conditions:
#             clauseelement = clauseelement.where(cond)
#
#     # Update，Delete
#     table = getattr(clauseelement, "table", None)
#     if table is None:
#         return clauseelement, multiparams, params
#
#     # 表本身没有 tenant_id，直接放行
#     if not hasattr(table, "c") or "tenant_id" not in table.c:
#         return clauseelement, multiparams, params
#
#     # 已经有人手动加过 tenant 条件，直接放行
#     whereclause = clauseelement.whereclause
#     if whereclause is not None and "tenant_id" in str(whereclause):
#         return clauseelement, multiparams, params
#
#     tenant_expr: ColumnElement[bool] = table.c.tenant_id == current_tenant
#     # 自动注入 tenant 条件
#     clauseelement = clauseelement.where(tenant_expr)
#
#     logger.debug(f"添加租户条件后的查询 SQL: {clauseelement}")
#
#     return clauseelement, multiparams, params


async def dispose_di_async_engine_after_celery_task() -> None:
    """
    释放依赖注入单例 Database 中的异步引擎连接池。

    Celery 任务里每次 asyncio.run() 结束会关闭事件循环；asyncpg 连接绑定在该 loop 上。
    若不 dispose，下一次 run 会从池中取出旧连接，触发 Event loop is closed。
    """
    from app.database.base import IS_DM

    if IS_DM:
        return
    try:
        db = Database()
        engine = getattr(db, "_engine", None)
        if engine is not None:
            await engine.dispose(close=True)
    except Exception as e:
        logger.warning(
            "dispose DI async engine after Celery task failed: %s", e, exc_info=True
        )


def run_async_in_celery(coro):
    """
    在 Celery 同步任务中执行协程：asyncio.run + 结束后 dispose 异步连接池。

    凡通过 AutoContainer / BaseMapper、或 StorageMapper(Database()) 等走 Database 单例
    异步引擎的任务，均应使用本函数代替裸 asyncio.run(...)，避免多次任务后 Event loop is closed。
    """
    import asyncio

    async def _runner():
        try:
            return await coro
        finally:
            await dispose_di_async_engine_after_celery_task()

    return asyncio.run(_runner())
