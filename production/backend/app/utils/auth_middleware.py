"""
认证中间件模块

提供JWT认证中间件支持
"""
import re
import logging
from contextvars import ContextVar
from datetime import datetime
from fastapi import HTTPException, status, Request, Depends, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.depend_manager import AutoContainer
from app.models.models import User, JWTPayLoad
from app.utils.auth import decode_token, get_user_by_username
from app.utils.db_session_context import reset_db_session, set_db_session
from app.database.base import AsyncSessionLocal, IS_DM, sync_engine
from app.utils.http_util import set_current_token
from app.utils import app_runtime_context
from app.utils.user_info_context import reset_current_user_payload, set_current_jwt_payload, set_current_user_info

logger = logging.getLogger("app.utils.auth_middleware")

# 定义公开路径（不需要认证的路径）
PUBLIC_PATHS = [
    r"^/api/v1/users/login$",
    r"^/api/v1/users/register$", 
    r"^/$",
    r"^/docs$",
    r"^/redoc$",
    r"^/openapi.json$",
    r"^/openapi/lab/v1/docs$",
    r"^/openapi/lab/v1/redoc$",
    r"^/openapi/lab/v1/openapi\.json$",
    r"^/openapi/lab/v1/openapi\.[^/]+\.json$",
    r"^/health$",
    r"^/\.well-known/.*$",  # 系统服务发现路径，如Chrome开发者工具请求
    r"^/api/v1/notebooks/proxy/",
    r"^/api/v1/storage/download/.*",
    r"^/api/v1/storage/download-file/.*",
    r"^/api/v1/k8s/upgrade-alloy$",
    r"^/api/v1/k8s/[^/]+/upgrade-alloy$",
    r"^/api/v1/repository/sync/init-db",
    r"^/api/v1/repository/jfs/dir/",  # 删除 JFS 指定目录（与 init-db 一样不鉴权）
    r"^/api/v1/storage/upload/minio/file",
    r"^/api/v1/projects/set/sa/permission/all",
    r"^/api/v1/projects/set/project-read-only-pvc/all",
    r"^/api/v1/training-datasets/metadata-fields/repair$",
    r"^/api/v1/machine-learning-datasets/metadata-fields/repair$",
    r"^/api/v1/config$",
]

# HTTP Bearer认证方案
security = HTTPBearer()

def create_auth_error_response(detail: str) -> JSONResponse:
    """
    创建认证错误响应
    
    Args:
        detail: 错误详情
        
    Returns:
        JSONResponse: 401认证失败响应
    """
    return JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={"detail": detail},
        headers={"WWW-Authenticate": "Bearer"}
    )

async def auth_middleware(request: Request, call_next):
    """
    认证中间件 - 统一处理JWT认证
    
    检查请求路径：
    - 公开路径：直接通过
    - 其他路径：要求JWT认证
    
    Args:
        request: FastAPI请求对象
        call_next: 下一个中间件或路由处理函数
        
    Returns:
        Response: HTTP响应对象
    """
    if request.method == "OPTIONS":
        # 直接返回空响应，CORS 会处理 header
        from fastapi.responses import Response
        headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
        return Response(status_code=200, headers=headers)

    path = request.url.path
    
    # 检查是否为公开路径
    for pattern in PUBLIC_PATHS:
        if re.match(pattern, path):
            return await call_next(request)
    
    # 非公开路径，检查JWT认证
    authorization = request.headers.get("Authorization")
    if not authorization or not authorization.startswith("Bearer "):
        logger.warning(f"认证失败：缺少或无效的Authorization头 | 路径: {path} | IP: {request.client.host if request.client else 'unknown'}")
        return create_auth_error_response("Missing or invalid authorization header")
    
    # 提取token并验证
    token = authorization.split(" ")[1]
    
    # 验证JWT token的有效性
    payload = decode_token(token)
    if not payload:
        logger.warning(f"认证失败：无效的JWT token | 路径: {path} | IP: {request.client.host if request.client else 'unknown'}")
        return create_auth_error_response("Invalid token")

    # 解析payload并设置用户信息到上下文
    try:
        obj = JWTPayLoad.model_validate(payload)
        info = obj.userInfo
        # 设置tenantId到当前上下文
        app_runtime_context.set_tenant_id(info.tenantId)
        app_runtime_context.set_san_yuan_tag(obj.isSanYuan)
        # 设置用户信息到上下文（供权限中间件使用）
        set_current_user_info(info)
        set_current_jwt_payload(obj)
    except Exception as e:
        logger.error(f"解析JWT payload失败: {e}", exc_info=True)
        return create_auth_error_response("Invalid token payload")

    ip = get_real_ip(request)
    app_runtime_context.set_ip_addr(ip)

    # 认证成功，继续处理请求
    # 为每个请求创建独立的 session（避免并发请求共享 session）
    if IS_DM:
        from sqlalchemy.orm import Session
        from app.database.base import AsyncCompatibleSession
        sync_sess = Session(sync_engine)
        session = AsyncCompatibleSession(sync_sess)
    else:
        session = AsyncSessionLocal()
    
    token = set_db_session(session)
    try:
        next1 = await call_next(request)
        return next1
    except Exception as e:
        logger.warning("发生异常，自动触发事务回滚")
        try:
            await session.rollback()
        except Exception:
            logger.warning("事务回滚出现异常", exc_info=True)
        raise e
    finally:
        # 确保无论成功还是异常都清理上下文状态
        await reset_db_session(token)
        app_runtime_context.reset()
        reset_current_user_payload()


def get_real_ip(request: Request) -> str:
    """获取真实 IP（支持代理场景）"""
    # 优先从 X-Forwarded-For 获取（多个代理时，第一个为真实 IP）
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        # X-Forwarded-For 格式：client_ip, proxy1_ip, proxy2_ip
        return x_forwarded_for.split(",")[0].strip()

    # 其次从 X-Real-IP 获取
    x_real_ip = request.headers.get("X-Real-IP")
    if x_real_ip:
        return x_real_ip

    # 最后返回直接连接的 IP
    return request.client.host

async def token_handle(request: Request, call_next):

    if request.method == "OPTIONS":
        # 直接返回空响应，CORS 会处理 header
        from fastapi.responses import Response
        headers={
            "Access-Control-Allow-Origin":"*",
            "Access-Control-Allow-Methods":"*",
            "Access-Control-Allow-Headers":"*",
        }
        return Response(status_code=200,headers=headers)

    # 从Authorization头提取Token（示例逻辑，根据实际场景调整）
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        set_current_token(token)  # 设置到上下文
    response = await call_next(request)
    return response
