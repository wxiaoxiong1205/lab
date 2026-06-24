# tenant_context.py
from contextlib import asynccontextmanager
from contextvars import ContextVar, Token
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession


# 默认为false，当为true的时候代表当前线程已经存在了session
_current_db_session: ContextVar[Optional[AsyncSession]] = ContextVar(
    "db_session", default=None
)


def set_db_session(session: Optional[AsyncSession]) -> Token:
    """设置租户ID，返回 Token 用于后续重置（支持嵌套场景）"""
    return _current_db_session.set(session)

def get_db_session() -> Optional[AsyncSession]:
    """获取当前租户ID（从上下文提取）"""
    return _current_db_session.get()


async def reset_db_session(token: Token) -> None:
    """
    重置数据库 session 上下文
    
    注意：当 session 正在执行操作时（如创建连接、执行查询），
    任何 commit/rollback/close 操作都可能失败，因此需要捕获所有异常。
    SQLAlchemy 的 InvalidRequestError 和 IllegalStateChangeError 都需要安全忽略。
    """
    session = _current_db_session.get()
    if session is not None:
        # 尝试提交事务（忽略所有异常）
        try:
            await session.commit()
        except Exception:
            # commit 失败时尝试 rollback（同样忽略异常）
            try:
                await session.rollback()
            except Exception:
                pass
        
        # 尝试关闭 session（忽略所有异常）
        try:
            await session.close()
        except Exception:
            pass
    
    _current_db_session.reset(token)


@asynccontextmanager
async def db_session_with_context(session: AsyncSession):
    """带上下文管理的数据库会话
    
    自动设置和清理 db_session 上下文变量
    
    Usage:
        async with async_session() as session:
            async with db_session_with_context(session):
                # 使用 session，会自动设置到上下文
                pass
    """
    token = set_db_session(session)
    try:
        yield session
    finally:
        # 恢复之前的上下文状态（如果有嵌套的话）
        _current_db_session.reset(token)

