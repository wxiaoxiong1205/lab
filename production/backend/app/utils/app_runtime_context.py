# tenant_context.py
from contextvars import ContextVar, Token
from typing import Optional

_current_ip_addr: ContextVar[Optional[str]] = ContextVar(
    "current_ip_addr", default=None
)

_current_operator_log_content: ContextVar[Optional[str]] = ContextVar(
    "current_operator_log_content", default=None
)

# 存储当前请求/任务的 tenant_id，默认 None（未设置）
_current_tenant_id: ContextVar[Optional[str]] = ContextVar(
    "current_tenant_id", default=None
)

_current_san_yuan_tag: ContextVar[Optional[bool]] = ContextVar(
    "current_san_yuan_tag", default=None
)


def set_tenant_id(tenant_id: str) -> Token:
    return _current_tenant_id.set(tenant_id)


def get_tenant_id() -> Optional[str]:
    """获取当前租户ID（从上下文提取）"""
    return _current_tenant_id.get()


def set_san_yuan_tag(san_yuan_tag: bool) -> Token:
    return _current_san_yuan_tag.set(san_yuan_tag)


def get_san_yuan_tag() -> Optional[bool]:
    """获取当前租户ID（从上下文提取）"""
    return _current_san_yuan_tag.get()


def set_ip_addr(ip_addr: str) -> Token:
    """设置租户ID，返回 Token 用于后续重置（支持嵌套场景）"""
    return _current_ip_addr.set(ip_addr.strip())


def set_operator_log_content(log_content: str) -> Token:
    return _current_operator_log_content.set(log_content.strip())


def get_ip_addr() -> Optional[str]:
    """获取当前租户ID（从上下文提取）"""
    return _current_ip_addr.get()


def get_operator_log_content() -> Optional[str]:
    return _current_operator_log_content.get()


def reset() -> None:
    """重置租户ID（请求/任务结束时调用，避免上下文污染）"""
    _current_ip_addr.set(None)
    _current_operator_log_content.set(None)
    _current_tenant_id.set(None)
