# tenant_context.py
from contextvars import ContextVar, Token
from typing import Optional

from app.models.models import JWTPayLoad, JwtUserInfo

_current_user_info: ContextVar[Optional[JwtUserInfo]] = ContextVar(
    "current_user_info", default=None
)

_current_jwt_payload: ContextVar[Optional[JWTPayLoad]] = ContextVar(
    "current_jwt_payload", default=None
)

def set_current_user_info(user_info: JwtUserInfo) -> Token:
    """设置租户ID，返回 Token 用于后续重置（支持嵌套场景）"""
    if not isinstance(user_info, JwtUserInfo) or not user_info:
        raise ValueError("current info 无效的对象")
    return _current_user_info.set(user_info)


def get_current_user_info() -> Optional[JwtUserInfo]:
    """获取当前租户ID（从上下文提取）"""
    return _current_user_info.get()


def set_current_jwt_payload(jwt_payload: JWTPayLoad) -> Token:
    """设置当前请求 JWT payload。"""
    if not isinstance(jwt_payload, JWTPayLoad) or not jwt_payload:
        raise ValueError("jwt payload 无效的对象")
    return _current_jwt_payload.set(jwt_payload)


def get_current_jwt_payload() -> Optional[JWTPayLoad]:
    """获取当前请求 JWT payload。"""
    return _current_jwt_payload.get()


def reset_current_user_info(token: Token) -> None:
    """重置租户ID（请求/任务结束时调用，避免上下文污染）"""
    _current_user_info.reset(token)


def reset_current_user_payload() -> None:
    """清理当前请求用户上下文。"""
    _current_jwt_payload.set(None)
