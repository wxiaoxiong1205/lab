"""
权限拦截中间件

在认证中间件之后执行，检查用户是否有权限访问特定URL

说明：本中间件在权限失败时显式返回 JSONResponse，避免在中间件内 raise HTTPException。
自定义 HTTP 中间件在 Starlette 栈中的位置可能导致异常无法稳定进入 ExceptionMiddleware，
从而出现状态码或响应体与全局异常处理不一致的问题。
"""
import re
import logging
from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.logging import get_request_id
from app.utils.auth_middleware import PUBLIC_PATHS
from app.utils.db_session_context import get_db_session
from app.utils.user_info_context import get_current_user_info
from app.services.permission.permission import (
    get_permission_by_url,
    check_url_permission,
    extract_project_id
)

logger = logging.getLogger("app.middleware.permission_middleware")


def _permission_error_response(request: Request, status_code: int, msg: str) -> JSONResponse:
    """
    与 main.py 中 http_exception_handler 的响应体一致：{msg, request_id}，并写入 X-Request-ID，确保错误响应风格一致
    """
    rid = getattr(request.state, "_request_id", "") or get_request_id() or ""
    response = JSONResponse(
        status_code=status_code,
        content={"msg": msg, "request_id": rid},
    )
    response.headers["X-Request-ID"] = rid
    return response


def is_public_path(path: str) -> bool:
    """检查是否为公开路径（无需认证的路径）"""
    for pattern in PUBLIC_PATHS:
        if re.match(pattern, path):
            return True
    return False


async def permission_middleware(request: Request, call_next):
    """
    权限拦截中间件
    
    检查逻辑：
    1. 跳过公开路径（无需认证的路径）
    2. 获取当前用户（必须认证）
    3. 检查URL是否在权限配置表中
    4. 如果不在配置表中，允许所有认证用户访问
    5. 如果在配置表中，检查用户是否有对应的数据权限角色
    """
    # 跳过公开路径（无需认证的路径）
    if is_public_path(request.url.path):
        return await call_next(request)
    
    # 获取当前用户（必须认证）
    current_user = get_current_user_info()
    if not current_user:
        logger.warning(f"权限检查失败：未获取到用户信息 | 路径: {request.url.path}")
        return _permission_error_response(request, 401, "未认证")
    
    # 获取数据库会话（从上下文获取，由auth_middleware设置）
    db = get_db_session()
    if not db:
        logger.error(f"权限检查失败：未获取到数据库会话 | 路径: {request.url.path}")
        return _permission_error_response(request, 500, "内部服务器错误")
    
    # 权限检查逻辑（只捕获权限检查相关的异常）
    try:
        # 检查URL是否在权限配置表中
        permission = await get_permission_by_url(db, request.url.path, request.method)
        
        if permission is not None:
            # URL在权限配置表中，需要检查用户是否有对应的数据权限角色
            # 从URL中提取project_id（如果存在）
            project_id = extract_project_id(request.url.path)
            
            # 检查权限
            has_permission = await check_url_permission(
                db=db,
                url=request.url.path,
                method=request.method,
                user_id=current_user.userId,
                project_id=project_id
            )
            
            if not has_permission:
                logger.warning(
                    f"权限检查失败：用户无权限访问 | "
                    f"用户ID: {current_user.userId} | "
                    f"路径: {request.url.path} | "
                    f"方法: {request.method}"
                )
                return _permission_error_response(
                    request,
                    403,
                    "无权限，如需获取权限，请联系平台管理员。",
                )
        # permission is None: URL不在权限配置表中，允许所有认证用户访问
    except Exception as e:
        # 只处理权限检查过程中的异常（如数据库查询错误、权限服务异常等）
        logger.error(f"权限检查异常：{str(e)} | 路径: {request.url.path}", exc_info=True)
        return _permission_error_response(request, 500, "权限检查失败")
    
    # 权限检查通过，继续处理请求（不捕获业务逻辑异常）
    return await call_next(request)
