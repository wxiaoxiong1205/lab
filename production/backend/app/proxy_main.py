"""
代理网关进程入口

只承接两类对外能力：

1. Notebook 浏览器代理（HTTP + WebSocket）
   ``/api/v1/notebooks/proxy/{project_id}/{notebook_id}[/{path}]``
   鉴权由路由内部基于 cookie ``lab_access_token`` 自行完成，与 backend 主服务的
   ``auth_middleware`` 解耦。
2. SSH 跳板网关
   监听 2222（与 backend 主服务一致），由 ``app.core.ssh_gateway`` 负责。

设计目标：
- 进程内不注册任何业务路由，避免暴露其他 API 与无谓加载依赖；
- 不挂载 ``auth_middleware`` / ``permission_middleware``；
- 复用 backend 的 ``AutoContainer`` 以满足代理路由的 ``@inject`` 依赖
  （主要是 ``user_service.is_main()``）。

启动：
    python -m app.proxy_main --port 8001
"""
import argparse
import asyncio
import time
from contextlib import asynccontextmanager
from datetime import datetime
from functools import wraps

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import notebook
from app.core.depend_manager import AutoContainer
from app.core.logging import (
    RequestLoggingMiddleware,
    get_request_id,
    logger,
    setup_logging,
)
from app.core.ssh_gateway import start_ssh_server
from app.utils.http_util import NotebookProxyClient, SharedAsyncClient
from app.utils.json_utils import patch_json
from app.utils.notebook_proxy_cache import (
    bootstrap_notebook_static_disk_cache,
    cleanup_notebook_static_orphan_tmp_files,
)

setup_logging()
logger.info("DeepexiLab 代理网关 开始运行")

patch_json()


def _get_validation_detail(exc: RequestValidationError) -> str:
    errors = exc.errors()
    if not errors:
        return "请求参数验证失败"
    first_error = errors[0]
    field = ".".join(str(loc) for loc in first_error.get("loc", []) if loc != "body")
    msg = first_error.get("msg", "验证失败")
    error_type = first_error.get("type", "")
    if error_type == "string_too_long":
        max_length = first_error.get("ctx", {}).get("max_length", "")
        return f"字段 '{field}' 超过最大长度限制（最多 {max_length} 个字符）"
    if error_type == "string_too_short":
        min_length = first_error.get("ctx", {}).get("min_length", "")
        return f"字段 '{field}' 长度不足（至少需要 {min_length} 个字符）"
    if error_type == "missing":
        return f"缺少必填字段: {field}"
    if error_type == "value_error":
        return f"字段 '{field}' 值无效: {msg}"
    return f"字段 '{field}' 验证失败: {msg}"


def _get_err_msg_for_log(exc: Exception) -> str:
    if isinstance(exc, RequestValidationError):
        return f"RequestValidationError: {_get_validation_detail(exc)}"
    if isinstance(exc, HTTPException):
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        return f"HTTPException: {detail}"
    return f"{type(exc).__name__}: {str(exc)}"


def _resolve_error_request_id(request: Request) -> str:
    return getattr(request.state, "_request_id", "") or get_request_id() or ""


def _log_exception_and_add_request_id(handler):
    """与 backend 主服务保持一致的异常日志 + X-Request-ID 装饰器。"""
    @wraps(handler)
    async def wrapper(request: Request, exc: Exception):
        request_id = getattr(request.state, "_request_id", "") or get_request_id()
        method = request.method
        path = request.url.path
        duration = (time.time() - getattr(request.state, "_request_start_time", time.time())) * 1000
        err_msg = _get_err_msg_for_log(exc)
        line = (
            f"ERROR | {request_id} | {method} {path} | "
            f"{err_msg} | {duration:.3f}ms"
        )
        if isinstance(exc, (HTTPException, RequestValidationError)):
            logger.error(line)
        else:
            logger.opt(exception=exc).error(line)
        response = await handler(request, exc)
        response.headers["X-Request-ID"] = request_id
        return response
    return wrapper


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动 SSH 跳板网关（监听 2222）
    asyncio.create_task(start_ssh_server())

    async def _bootstrap_static_disk_cache():
        # 先扫掉残留的 .tmp.* 孤儿文件，再 bootstrap 内存索引，避免无谓地为 tmp 建索引。
        # bootstrap 内部会按 mtime 排序后触发一次 LRU 淘汰，
        # 让冷启动场景下超过上限的旧 notebook 目录立刻被清理。
        await cleanup_notebook_static_orphan_tmp_files()
        await bootstrap_notebook_static_disk_cache()

    asyncio.create_task(_bootstrap_static_disk_cache())
    logger.info("代理网关 lifespan 启动完成")

    yield

    logger.info("代理网关正在关闭...")
    await SharedAsyncClient.close()
    await NotebookProxyClient.close()


def create_app() -> FastAPI:
    container = AutoContainer()
    app = FastAPI(
        title="DeepexiLab Proxy Gateway",
        description="DeepexiLab 代理网关：仅承接 Notebook HTTP/WebSocket 代理与 SSH 跳板。",
        version="v1",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.container = container

    @app.exception_handler(RequestValidationError)
    @_log_exception_and_add_request_id
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        msg = _get_validation_detail(exc)
        rid = _resolve_error_request_id(request)
        return JSONResponse(status_code=400, content={"msg": msg, "request_id": rid})

    @app.exception_handler(HTTPException)
    @_log_exception_and_add_request_id
    async def http_exception_handler(request: Request, exc: HTTPException):
        msg = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        rid = _resolve_error_request_id(request)
        return JSONResponse(status_code=exc.status_code, content={"msg": msg, "request_id": rid})

    @app.exception_handler(Exception)
    @_log_exception_and_add_request_id
    async def generic_exception_handler(request: Request, exc: Exception):
        rid = _resolve_error_request_id(request)
        return JSONResponse(status_code=500, content={"msg": "系统异常", "request_id": rid})

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 仅保留请求日志中间件，便于排查代理问题；
    # 不挂 auth/permission/token_handle —— 代理路由内部自行解析 cookie token。
    app.middleware("http")(RequestLoggingMiddleware(
        log_request_body=False,
        log_query_params=True,
        log_headers=False,
    ))

    # 仅注册 Notebook 浏览器代理路由（HTTP + WebSocket），
    # 路径与 backend 主服务保持一致：/api/v1/notebooks/proxy/...
    app.include_router(notebook.router)

    return app


app = create_app()


@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description="DeepexiLab 代理网关启动参数")
    parser.add_argument("--port", type=int, default=8000, help="HTTP 监听端口（SSH 固定 2222）")
    args = parser.parse_args()
    uvicorn.run(app, host="0.0.0.0", port=args.port)
