import asyncio
import os
import uuid
import aiofiles
import sys
from typing import Tuple, Optional, List

import httpx
import websockets
from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query, UploadFile, File, BackgroundTasks
from fastapi.responses import Response, FileResponse
# 导入 fastapi-pagination 相关组件
from fastapi_pagination import Page, Params
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse, HTMLResponse, RedirectResponse
from starlette.websockets import WebSocket

from app.common.function_type import FunctionType
from app.common.operator_type import OperatorType
# 导入统一错误消息工具模块
from app.common.status import TaskStatus
from app.core.depend_manager import AutoContainer
from app.database.base import get_db
from app.interceptor.log.operator_logs_annotation import OperatorLogsAnnotation
from app.models.models import Notebook, NotebookPort, ProjectUser, \
    JwtUserInfo, Project, ProjectKubernetesRelation
from app.schemas.notebook import NotebookResponse, NotebookCreate, NotebookUpdate, \
    NotebookDetailResponse, PublishNotebookAsExampleRequest, PublishNotebookAsExampleResponse, \
    ExampleNotebookResponse, ExampleNotebookUpdate, ExampleNotebookPermissionResponse, NotebookFilesResponse, UploadExampleImageResponse, NotebookBizType, \
    NotebookPortItemCreate, NotebookPortUpdate, NotebookPortItem, NotebookVisibilityPermissionResponse, NotebookViewMode
from app.services.notebook.interface import NotebookService
from app.services.user.interface import UserService
from app.utils.auth import get_current_user, get_current_user_from_token
from app.utils.dependencies import get_db_and_user, get_db_and_admin  # 导入组合依赖函数
from app.utils.http_util import NotebookProxyClient, set_current_token
from app.utils.notebook_proxy_cache import (
    NOTEBOOK_STATIC_DISK_CACHE_MAX_NOTEBOOKS,
    evict_notebook_static_disk_cache_if_needed,
    get_notebook_static_disk_cache_meta,
    get_notebook_address_cached,
    has_notebook_static_disk_cache_file,
    is_project_user_cached,
    notebook_static_disk_cache_file,
    register_notebook_static_disk_cache_file,
    register_notebook_static_disk_cache_notebook,
)
from app.utils.storage_enum import StoragePath
from app.utils.validators import validate_ml_backend_usage
from app.schemas.model import MlTaskType
from app.schemas.notebook import NotebookSSHConfigResponse, NotebookSSHConfigUpdate
from app.core.logging import logger, get_request_id

router = APIRouter(prefix="/api/v1/notebooks", tags=["notebooks"])

# 与 ml_backend_proxy 一致，便于长连接与流式响应
NOTEBOOK_ML_BACKEND_PROXY_TIMEOUT = httpx.Timeout(
    connect=10.0, read=300.0, write=120.0, pool=10.0
)


def _filter_proxy_response_headers(headers: httpx.Headers) -> dict:
    skip = {"content-encoding", "transfer-encoding", "connection", "content-length"}
    return {k: v for k, v in headers.items() if k.lower() not in skip}


# Notebook 浏览器代理：仅过滤逐跳头（hop-by-hop），保留 cache-control/etag/last-modified
# 注意：Content-Encoding 在“原样透传 raw 字节”路径中需要保留，让浏览器自行解压；
# 在“需要平台已解压后再返回”的路径（HTML 走 .aread()，httpx 已自动解压）中应剔除。
_NOTEBOOK_PROXY_HOP_BY_HOP_HEADERS = {
    "transfer-encoding",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "upgrade",
    # content-length 由 starlette 根据 chunk/raw 重新计算
    "content-length",
}


def _filter_notebook_proxy_response_headers(
    headers: httpx.Headers,
    drop_content_encoding: bool = False,
) -> dict:
    skip = set(_NOTEBOOK_PROXY_HOP_BY_HOP_HEADERS)
    if drop_content_encoding:
        skip.add("content-encoding")
    return {k: v for k, v in headers.items() if k.lower() not in skip}


# 不应转发到上游的请求头：host/origin 让 httpx 自动按 target_url 计算；
# content-length 由 httpx 根据 content 自动设置；逐跳头不能透传。
_NOTEBOOK_PROXY_REQUEST_HEADER_BLOCKLIST = {
    "host",
    "origin",
    "content-length",
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "upgrade",
}


def _build_notebook_proxy_request_headers(request: Request) -> dict:
    return {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in _NOTEBOOK_PROXY_REQUEST_HEADER_BLOCKLIST
    }


@router.get("/{project_id}/list", response_model=Page[NotebookResponse])
@inject
async def list_notebooks(
        project_id: int,
        instance_name: Optional[str] = None,
        status: Optional[List[TaskStatus]] = Query(None, description="状态，可传多个"),
        biz_type: Optional[NotebookBizType] = Query(NotebookBizType.LLM, description="业务类型：llm(大模型训练)/machine_learning(机器学习)"),
        usage: Optional[MlTaskType] = Depends(validate_ml_backend_usage),
        is_ml_debug: Optional[bool] = Query(
            None,
            description="是否 ML 调试实例：兼容旧筛选。为 true 时仅返回 usage 非空的记录；为 false 时仅返回 usage 为空的记录；不传则不过滤。若同时传 usage，则优先按 usage 精确筛选",
        ),
        view_mode: NotebookViewMode = Query(NotebookViewMode.USE, description="视图模式：manage=管理端，use=使用端"),
        is_public: Optional[List[bool]] = Query(None, description="是否公开，可传多个（true、false）"),
        created_id: Optional[List[int]] = Query(None, description='创建者用户ID，可传多个'),
        page: Optional[int] = None,
        size: Optional[int] = None,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service])

) -> Page[NotebookResponse]:
    """获取notebook列表，使用 fastapi-pagination 进行分页"""
    db, current_user = deps  # 解包依赖

    return await notebook_service.list_notebooks(project_id, instance_name, status, biz_type, usage, is_ml_debug, view_mode, page, size, current_user, is_public, created_id)



@router.get("/{project_id}/{notebook_id}", response_model=NotebookDetailResponse)
@inject
async def find_notebook(
        project_id: int,
        notebook_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service])
) -> NotebookDetailResponse:
    """获取notebook详情"""
    db, current_user = deps  # 解包依赖
    return await notebook_service.find_notebook(project_id, notebook_id, current_user)


@router.get("/{project_id}/{notebook_id}/visibility-permission", response_model=NotebookVisibilityPermissionResponse)
@inject
async def get_notebook_visibility_permission(
        project_id: int,
        notebook_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service])
) -> NotebookVisibilityPermissionResponse:
    db, current_user = deps
    return await notebook_service.get_notebook_visibility_permission(project_id, notebook_id, current_user)


@router.get("/{project_id}/{notebook_id}/ssh-config", response_model=NotebookSSHConfigResponse)
@inject
async def get_notebook_ssh_config(
        project_id: int,
        notebook_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service])
) -> NotebookSSHConfigResponse:
    db, current_user = deps
    return await notebook_service.get_notebook_ssh_config(project_id, notebook_id, current_user)


@router.put("/{project_id}/{notebook_id}/ssh-config", response_model=NotebookSSHConfigResponse)
@inject
async def update_notebook_ssh_config(
        project_id: int,
        notebook_id: int,
        ssh_config: NotebookSSHConfigUpdate,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service])
) -> NotebookSSHConfigResponse:
    db, current_user = deps
    return await notebook_service.update_notebook_ssh_config(project_id, notebook_id, ssh_config, current_user)


@router.get("/{project_id}/{notebook_id}/ssh-config-key", response_model=None)
@inject
async def gen_notebook_ssh_key(
        project_id: int,
        notebook_id: int,
        background_tasks: BackgroundTasks,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service])
):
    db, current_user = deps
    return await notebook_service.gen_notebook_ssh_key(current_user, project_id, notebook_id, background_tasks)


@router.post("/{project_id}/create", response_model=NotebookResponse, status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.NOTEBOOK, table_name="notebooks",
                        operator_type=OperatorType.ADD, operator_content_key=["notebook_create.instance_name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={
                            "service_name": "project_service",
                            "field_name": "project_id",
                            "tag_field_name": "name"})
async def create_notebook(
        project_id: int,
        notebook_create: NotebookCreate,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service])
) -> NotebookResponse:
    db, current_user = deps
    return await notebook_service.create_notebook(current_user, project_id, notebook_create)



@router.put("/{project_id}/{notebook_id}", response_model=NotebookResponse)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.NOTEBOOK, table_name="notebooks",
                        operator_type=OperatorType.EDIT, operator_content_key=["notebook_update.instance_name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={
                            "service_name": "project_service",
                            "field_name": "project_id",
                            "tag_field_name": "name"})
async def update_notebook(
        project_id: int,
        notebook_id: int,
        notebook_update: NotebookUpdate,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service])
) -> NotebookResponse:
    db, current_user = deps
    return await notebook_service.update_notebook(project_id, notebook_id, notebook_update, current_user)



@router.post("/{project_id}/{notebook_id}/ports", response_model=NotebookPortItem)
@inject
async def add_notebook_port(
        project_id: int,
        notebook_id: int,
        port_create: NotebookPortItemCreate,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service])
) -> NotebookPortItem:
    db, current_user = deps
    return await notebook_service.add_notebook_port(project_id, notebook_id, port_create, current_user)


@router.put("/{project_id}/{notebook_id}/ports/{port_id}", response_model=NotebookPortItem)
@inject
async def update_notebook_port(
        project_id: int,
        notebook_id: int,
        port_id: int,
        port_update: NotebookPortUpdate,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service])
) -> NotebookPortItem:
    db, current_user = deps
    return await notebook_service.update_notebook_port(project_id, notebook_id, port_id, port_update, current_user)


@router.delete("/{project_id}/{notebook_id}/ports/{port_id}")
@inject
async def delete_notebook_port(
        project_id: int,
        notebook_id: int,
        port_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service])
):
    db, current_user = deps
    return await notebook_service.delete_notebook_port(project_id, notebook_id, port_id, current_user)


@router.post("/{project_id}/{notebook_id}/start_or_deploy", response_model=NotebookResponse)
@inject
async def start_or_deploy_notebook(
        project_id: int,
        notebook_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service])
):
    db, current_user = deps
    return await notebook_service.start_or_deploy_notebook(project_id, notebook_id, current_user)


@router.post("/{project_id}/{notebook_id}/stop", response_model=NotebookResponse)
@inject
async def stop_notebook(
        project_id: int,
        notebook_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service])
):
    db, current_user = deps
    return await notebook_service.stop_notebook(project_id, notebook_id, current_user)



@router.delete("/{project_id}/{notebook_id}", status_code=204)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.NOTEBOOK, table_name="notebooks",
                        operator_type=OperatorType.DELETE, operator_content_key=None,
                        self_service_field_mapping={
                            "service_name": "notebook_service",
                            "field_name": "notebook_id",
                            "tag_field_name": "instance_name"},
                        scope_service_field_mapping={
                            "service_name": "project_service",
                            "field_name": "project_id",
                            "tag_field_name": "name"})
async def delete_notebook(
        project_id: int,
        notebook_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service])
):
    db, current_user = deps
    return await notebook_service.delete_notebook(project_id, notebook_id, current_user)


@router.api_route(
    "/ml_backend_proxy/{project_id}/{notebook_id}/{notebook_port_id}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
)
@router.api_route(
    "/ml_backend_proxy/{project_id}/{notebook_id}/{notebook_port_id}/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
)
@inject
async def proxy_notebook_ml_backend_port(
    project_id: int,
    notebook_id: int,
    notebook_port_id: int,
    request: Request,
    path: str = "",
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    user_service: UserService = Depends(Provide[AutoContainer.user_service]),
):
    path_parts = [part for part in path.split("/") if part]
    if (
            request.method == "GET"
            and len(path_parts) == 2
            and path_parts[0] == "tensorboard_pro"
            and not request.url.path.endswith("/")
    ):
        return RedirectResponse(url=f"{request.url.path.split('/')[-1]}/", status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    """
    将请求代理到 Notebook 指定端口的 access_url（与 ``/api/v1/ml_backend/proxy/...`` 行为一致）。

    示例：``GET .../ml_backend_proxy/1/2/99/v1/models`` → ``{notebook_ports.access_url}/v1/models``
    """
    try:
        db, current_user = deps
        project_user_query = await db.execute(
            select(ProjectUser.id).filter(
                ProjectUser.project_id == project_id,
                ProjectUser.user_id == current_user.userId,
            )
        )
        project_user_id = project_user_query.scalar_one_or_none()
        main = await user_service.is_main()
        if not project_user_id and not main:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User Not Permission",
            )
    except HTTPException as e:
        return HTMLResponse(
            f"<h1>Authentication Error</h1><pre>{e.detail}</pre>",
            status_code=e.status_code,
        )

    port_row = await db.execute(
        select(NotebookPort)
        .join(Notebook, Notebook.id == NotebookPort.notebook_id)
        .filter(
            Notebook.project_id == project_id,
            Notebook.id == notebook_id,
            NotebookPort.id == notebook_port_id,
        )
    )
    notebook_port = port_row.scalar_one_or_none()
    if not notebook_port:
        return HTMLResponse("<h1>Notebook Port Not Found</h1>", status_code=404)

    base = (notebook_port.access_url or "").strip().rstrip("/")
    if not base:
        return HTMLResponse(
            "<h1>Service Not Ready</h1><p>该端口尚未暴露 access_url，请等待部署就绪。</p>",
            status_code=503,
        )

    suffix = path.strip("/")
    target_url = f"{base}/{suffix}" if suffix else base

    req_body = await request.body()
    req_headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in ("host", "origin", "content-length")
    }
    request_id = getattr(request.state, "request_id", None) or get_request_id()

    client = httpx.AsyncClient(follow_redirects=True, timeout=NOTEBOOK_ML_BACKEND_PROXY_TIMEOUT)
    try:
        await client.__aenter__()
    except Exception:
        logger.exception(
            "notebook_ml_backend_proxy client init failed | request_id=%s | target=%s",
            request_id,
            target_url,
        )
        return HTMLResponse(
            "<h1>Proxy Error</h1><p>无法建立到后端的连接，请稍后重试。</p>",
            status_code=502,
        )

    stream_ctx = client.stream(
        request.method,
        target_url,
        headers=req_headers,
        content=req_body,
        params=request.query_params,
    )
    try:
        proxied = await stream_ctx.__aenter__()
    except Exception:
        await client.__aexit__(None, None, None)
        logger.exception(
            "notebook_ml_backend_proxy upstream failed | request_id=%s | target=%s",
            request_id,
            target_url,
        )
        return HTMLResponse(
            "<h1>Proxy Error</h1><p>后端请求失败，请稍后重试。</p>",
            status_code=502,
        )

    try:
        content_type = proxied.headers.get("content-type", "")
        out_headers = _filter_proxy_response_headers(proxied.headers)

        if "text/html" in content_type or "javascript" in content_type:
            content = await proxied.aread()
            await stream_ctx.__aexit__(None, None, None)
            await client.__aexit__(None, None, None)
            return Response(
                content=content,
                media_type=content_type or None,
                status_code=proxied.status_code,
                headers=out_headers,
            )

        async def iter_body():
            try:
                async for chunk in proxied.aiter_bytes():
                    yield chunk
            finally:
                await stream_ctx.__aexit__(None, None, None)
                await client.__aexit__(None, None, None)

        return StreamingResponse(
            iter_body(),
            status_code=proxied.status_code,
            media_type=content_type or None,
            headers=out_headers,
        )
    except Exception:
        await stream_ctx.__aexit__(*sys.exc_info())
        await client.__aexit__(None, None, None)
        logger.exception(
            "notebook_ml_backend_proxy response error | request_id=%s | target=%s",
            request_id,
            target_url,
        )
        return HTMLResponse(
            "<h1>Proxy Error</h1><p>转发响应时出错，请稍后重试。</p>",
            status_code=502,
        )


# 只为这些前缀做本地磁盘静态缓存（不含 query，避免 ?v= 重复文件）
STATIC_CACHE_PATH_PREFIX = (
    "static/",
    "lab/api/themes/",
    "lab/extensions/",
)
STATIC_CACHE_MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
STATIC_CACHE_MAX_NOTEBOOKS = NOTEBOOK_STATIC_DISK_CACHE_MAX_NOTEBOOKS
_STATIC_CACHE_CONTROL = "public, max-age=31536000, immutable"
_STATIC_CACHE_VARY = "Accept-Encoding"
# 当前正在回源写盘的 cache_file_path 集合：实现 "首个请求负责写缓存，其它请求直接透传"，
# 避免后到的请求被阻塞等待大文件下载完成。
_STATIC_CACHE_BUILDING: set[str] = set()
_STATIC_CACHE_BUILDING_LOCK = asyncio.Lock()


def _parse_accept_encoding(accept_encoding: str) -> dict[str, float]:
    """解析 ``Accept-Encoding`` 头为 ``{encoding: q_value}``，支持 q 权重。"""
    result: dict[str, float] = {}
    for part in (accept_encoding or "").split(","):
        part = part.strip().lower()
        if not part:
            continue
        if ";" in part:
            tokens = [t.strip() for t in part.split(";")]
            enc = tokens[0]
            q = 1.0
            for token in tokens[1:]:
                if token.startswith("q="):
                    try:
                        q = float(token[2:])
                    except ValueError:
                        q = 0.0
                    break
        else:
            enc = part
            q = 1.0
        if enc:
            result[enc] = q
    return result


def _resolve_encoding_variant(accept_encoding: str) -> str:
    encodings = _parse_accept_encoding(accept_encoding)
    if encodings.get("br", 0.0) > 0.0:
        return "br"
    if encodings.get("gzip", 0.0) > 0.0:
        return "gzip"
    return "identity"


async def _try_become_static_cache_writer(cache_file_path: str) -> bool:
    """
    非阻塞地尝试成为某个 ``cache_file_path`` 的写缓存者。

    - 首个请求得到 ``True``，负责回源 + tee 写盘；
    - 后到的并发请求得到 ``False``，**不再阻塞等待**，直接走普通流式透传，
      不写缓存（避免重复写同一个文件 / 阻塞 waterfall）。
    """
    async with _STATIC_CACHE_BUILDING_LOCK:
        if cache_file_path in _STATIC_CACHE_BUILDING:
            return False
        _STATIC_CACHE_BUILDING.add(cache_file_path)
        return True


async def _release_static_cache_writer(cache_file_path: Optional[str]) -> None:
    if not cache_file_path:
        return
    async with _STATIC_CACHE_BUILDING_LOCK:
        _STATIC_CACHE_BUILDING.discard(cache_file_path)


def _static_cache_response_headers(content_encoding: Optional[str] = None) -> dict:
    """为静态缓存响应（命中或回源）生成一致的强缓存头 + Vary。"""
    headers = {
        "Cache-Control": _STATIC_CACHE_CONTROL,
        "Vary": _STATIC_CACHE_VARY,
    }
    if content_encoding:
        headers["Content-Encoding"] = content_encoding
    return headers


@router.api_route(
    "/proxy/{project_id}/{notebook_id}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"]
)
@router.api_route(
    "/proxy/{project_id}/{notebook_id}/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"]
)
@inject
async def proxy_notebook(
        project_id: int,
        notebook_id: int,
        request: Request,
        path: str = "",
        db: AsyncSession = Depends(get_db),
        user_service: UserService = Depends(Provide[AutoContainer.user_service])
):
    path_parts = [part for part in path.split("/") if part]
    if (
            request.method == "GET"
            and len(path_parts) == 2
            and path_parts[0] == "tensorboard_pro"
            and not request.url.path.endswith("/")
    ):
        return RedirectResponse(url=f"{request.url.path.split('/')[-1]}/", status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    # 从 Cookie 获取 token
    token = request.cookies.get("lab_access_token")
    try:
        current_user: JwtUserInfo = await get_current_user_from_token(token)

        # 校验是否在项目空间内或者管理员（命中缓存可避免 DB 查询）
        async def _query_project_user() -> bool:
            project_user_query = await db.execute(
                select(ProjectUser.id).filter(
                    ProjectUser.project_id == project_id,
                    ProjectUser.user_id == current_user.userId,
                )
            )
            return project_user_query.scalar_one_or_none() is not None

        is_project_member = await is_project_user_cached(
            project_id=project_id,
            user_id=current_user.userId,
            fallback=_query_project_user,
        )

        # 设置token
        set_current_token(token)
        # 项目成员命中即可放行，避免不必要的 is_main() 调用
        if not is_project_member and not await user_service.is_main():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User Not Permission"
            )

    except HTTPException as e:
        return HTMLResponse(f"<h1>Authentication Error</h1><pre>{e.detail}</pre>", status_code=e.status_code)

    # 查询 Notebook 真实地址（命中缓存可避免 DB 查询）
    async def _query_notebook_address() -> Optional[str]:
        result = await db.execute(
            select(Notebook.real_address).filter(
                Notebook.project_id == project_id,
                Notebook.id == notebook_id,
            )
        )
        return result.scalar_one_or_none()

    target_base = await get_notebook_address_cached(
        project_id=project_id,
        notebook_id=notebook_id,
        fallback=_query_notebook_address,
    )
    if not target_base:
        return HTMLResponse("<h1>Notebook Not Found</h1>", status_code=404)

    target_url = f"{target_base}{path}" if path else target_base

    # =========================
    # 静态资源本地磁盘缓存（路径含 project_id/notebook_id，避免冲突）
    # =========================
    is_static_cache_request = (
        request.method == "GET"
        and any(path.startswith(prefix) for prefix in STATIC_CACHE_PATH_PREFIX)
    )
    cache_relative_path = None
    if is_static_cache_request:
        encoding_variant = _resolve_encoding_variant(
            request.headers.get("accept-encoding", "")
        )
        cache_relative_path = f".enc/{encoding_variant}/{path.lstrip('/')}"
    cache_file_path: Optional[str] = None
    # 当前请求是否承担"写缓存"职责（非阻塞 single-flight）：
    # - True：首个 MISS 请求，回源后 tee 写盘；
    # - False：要么命中缓存，要么有其他请求正在写，本次只透传不写盘。
    is_static_cache_writer = False

    if is_static_cache_request and cache_relative_path:
        try:
            cache_file_path = notebook_static_disk_cache_file(
                project_id, notebook_id, cache_relative_path
            )
        except ValueError:
            cache_file_path = None

        if cache_file_path and await has_notebook_static_disk_cache_file(cache_file_path):
            # 与后台 LRU 淘汰存在窗口：内存索引仍命中但文件可能已被 rmtree 删除。
            # 这里再做一次 isfile 兜底，未命中则继续走回源逻辑。
            if await asyncio.to_thread(os.path.isfile, cache_file_path):
                cached_content_type, cached_content_encoding = await get_notebook_static_disk_cache_meta(
                    cache_file_path
                )
                try:
                    await register_notebook_static_disk_cache_notebook(
                        project_id, notebook_id
                    )
                except Exception as e:
                    logger.debug(
                        "notebook_proxy refresh static cache index failed | path=%s | %s",
                        path,
                        e,
                    )
                return FileResponse(
                    cache_file_path,
                    media_type=cached_content_type,
                    headers=_static_cache_response_headers(cached_content_encoding),
                )

    if is_static_cache_request and cache_file_path:
        # 非阻塞地尝试成为本资源的写缓存者：失败说明已有请求在写，本次直接透传。
        is_static_cache_writer = await _try_become_static_cache_writer(cache_file_path)
        if is_static_cache_writer:
            # 双检：取到 writer 标记后再确认一次缓存是否已经被刚刚完成的写入者落盘。
            if await has_notebook_static_disk_cache_file(cache_file_path) and await asyncio.to_thread(
                os.path.isfile, cache_file_path
            ):
                cached_content_type, cached_content_encoding = await get_notebook_static_disk_cache_meta(
                    cache_file_path
                )
                try:
                    await register_notebook_static_disk_cache_notebook(
                        project_id, notebook_id
                    )
                except Exception as e:
                    logger.debug(
                        "notebook_proxy refresh static cache index failed | path=%s | %s",
                        path,
                        e,
                    )
                await _release_static_cache_writer(cache_file_path)
                is_static_cache_writer = False
                return FileResponse(
                    cache_file_path,
                    media_type=cached_content_type,
                    headers=_static_cache_response_headers(cached_content_encoding),
                )

    # =========================
    # 上游代理
    # =========================

    client = NotebookProxyClient.get_client()

    req_headers = _build_notebook_proxy_request_headers(request)
    req_body = b""
    if request.method not in ("GET", "HEAD"):
        req_body = await request.body()
    request_id = getattr(request.state, "request_id", None) or get_request_id()

    try:
        upstream_req = client.build_request(
            request.method,
            target_url,
            headers=req_headers,
            content=req_body,
            params=request.query_params,
        )

        proxied = await client.send(
            upstream_req,
            stream=True,
        )

    except Exception as e:
        logger.exception(
            "notebook_proxy upstream send failed | request_id=%s | target=%s",
            request_id,
            target_url,
        )
        if is_static_cache_writer:
            await _release_static_cache_writer(cache_file_path)
            is_static_cache_writer = False
        return HTMLResponse(
            f"<h1>Proxy Error</h1><pre>{str(e)}</pre>",
            status_code=502
        )

    content_type = proxied.headers.get("content-type", "")

    # =========================
    # HTML
    # =========================

    if request.method == "HEAD":
        out_headers = _filter_notebook_proxy_response_headers(
            proxied.headers,
            drop_content_encoding=False,
        )
        await proxied.aclose()
        if is_static_cache_writer:
            await _release_static_cache_writer(cache_file_path)
            is_static_cache_writer = False
        return Response(
            status_code=proxied.status_code,
            media_type=content_type or None,
            headers=out_headers,
        )

    if content_type.startswith("text/html"):
        try:
            # 注：httpx 在 stream=True + aread() 路径下会按 Content-Encoding 自动解压，
            # 拿到的是解压后的 bytes，所以必须 drop_content_encoding=True，否则浏览器会再解压一次。
            content = await proxied.aread()

            out_headers = _filter_notebook_proxy_response_headers(
                proxied.headers,
                drop_content_encoding=True
            )

            return Response(
                content=content,
                media_type=content_type or None,
                status_code=proxied.status_code,
                headers=out_headers,
            )

        finally:
            await proxied.aclose()
            if is_static_cache_writer:
                await _release_static_cache_writer(cache_file_path)
                is_static_cache_writer = False

    # =========================
    # 静态资源回源 + 写本地磁盘缓存（仅 writer 写盘；非 writer 走普通透传）
    # =========================
    should_cache_static = (
        is_static_cache_writer
        and cache_file_path is not None
        and proxied.status_code == 200
    )

    if should_cache_static:
        # 静态资源走 tee：边回浏览器边写本地缓存，不阻塞响应首包。
        # writer_key 用于 release writer 标记，即使 cache_file_path 在中途被置 None，
        # 也能保证 _STATIC_CACHE_BUILDING 里的项被清掉，避免泄漏 / 后续永远走透传。
        writer_key = cache_file_path
        cache_dir = os.path.dirname(cache_file_path)
        # 加 pid + uuid，避免 worker 崩溃 / pod kill / cancel 导致的孤儿 tmp 文件互相覆盖，
        # 同时方便后续按 ``*.tmp.*`` 模式做扫尾清理。
        tmp_cache_file = f"{cache_file_path}.tmp.{os.getpid()}.{uuid.uuid4().hex}"
        content_encoding = proxied.headers.get("content-encoding") or ""

        try:
            await asyncio.to_thread(os.makedirs, cache_dir, exist_ok=True)
        except Exception as e:
            logger.warning(
                "notebook_proxy static cache mkdir failed | request_id=%s | path=%s | %s",
                request_id,
                path,
                e,
            )
            cache_file_path = None

        async def iter_and_cache():
            cache_writer = None
            cached_size = 0
            cache_enabled = bool(cache_file_path)
            try:
                if cache_enabled:
                    try:
                        cache_writer = await aiofiles.open(tmp_cache_file, "wb")
                    except Exception as e:
                        cache_enabled = False
                        logger.debug(
                            "notebook_proxy static cache open temp failed | request_id=%s | path=%s | %s",
                            request_id,
                            path,
                            e,
                        )

                async for chunk in proxied.aiter_raw(65536):
                    if cache_enabled and cache_writer is not None:
                        cached_size += len(chunk)
                        if cached_size <= STATIC_CACHE_MAX_FILE_SIZE:
                            await cache_writer.write(chunk)
                        else:
                            cache_enabled = False
                            try:
                                await cache_writer.close()
                            except Exception:
                                pass
                            cache_writer = None
                            try:
                                if await asyncio.to_thread(os.path.exists, tmp_cache_file):
                                    await asyncio.to_thread(os.remove, tmp_cache_file)
                            except Exception:
                                pass
                    yield chunk
            finally:
                try:
                    if cache_writer is not None:
                        await cache_writer.close()
                finally:
                    await proxied.aclose()

                try:
                    if cache_enabled and cache_file_path and await asyncio.to_thread(os.path.exists, tmp_cache_file):
                        try:
                            await asyncio.to_thread(os.replace, tmp_cache_file, cache_file_path)
                            await register_notebook_static_disk_cache_file(
                                project_id,
                                notebook_id,
                                cache_file_path,
                                content_type or "",
                                content_encoding,
                            )
                            await evict_notebook_static_disk_cache_if_needed(STATIC_CACHE_MAX_NOTEBOOKS)
                        except Exception as e:
                            logger.debug(
                                "notebook_proxy static cache finalize failed | request_id=%s | path=%s | %s",
                                request_id,
                                path,
                                e,
                            )
                            try:
                                if await asyncio.to_thread(os.path.exists, tmp_cache_file):
                                    await asyncio.to_thread(os.remove, tmp_cache_file)
                            except Exception:
                                pass
                finally:
                    # writer 责任结束：无论成功失败都必须释放 writer 标记，否则后续请求会一直走透传。
                    await _release_static_cache_writer(writer_key)

        out_headers = _filter_notebook_proxy_response_headers(
            proxied.headers,
            drop_content_encoding=False,
        )
        out_headers["Cache-Control"] = _STATIC_CACHE_CONTROL
        out_headers["Vary"] = _STATIC_CACHE_VARY

        return StreamingResponse(
            iter_and_cache(),
            status_code=proxied.status_code,
            media_type=content_type or None,
            headers=out_headers,
        )

    # =========================
    # 普通流式透传（也覆盖：is_static_cache_request 但本次不写缓存的并发 MISS 请求）
    # =========================

    out_headers = _filter_notebook_proxy_response_headers(
        proxied.headers,
        drop_content_encoding=False
    )
    if is_static_cache_request and proxied.status_code == 200:
        out_headers["Cache-Control"] = _STATIC_CACHE_CONTROL
        out_headers["Vary"] = _STATIC_CACHE_VARY

    # 这里既可能是 is_static_cache_writer=True 但状态码 != 200（不写缓存），
    # 也可能是 is_static_cache_writer=False 的并发 MISS 透传；两种情况都要释放 writer。
    release_cache_writer = is_static_cache_writer
    cache_writer_path = cache_file_path
    is_static_cache_writer = False

    async def iter_body():
        try:
            async for chunk in proxied.aiter_raw(65536):
                yield chunk
        finally:
            await proxied.aclose()
            if release_cache_writer:
                await _release_static_cache_writer(cache_writer_path)

    return StreamingResponse(
        iter_body(),
        status_code=proxied.status_code,
        media_type=content_type or None,
        headers=out_headers,
    )


# ------------------- WebSocket 代理 -------------------
@router.websocket("/proxy/{project_id}/{notebook_id}/{path:path}")
async def proxy_notebook_ws(
        websocket: WebSocket,
        project_id: int,
        notebook_id: int,
        path: str,
        db: AsyncSession = Depends(get_db),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service])
):
    # --- 尽早 Accept，避免中间件超时或状态冲突 ---
    subprotocols = websocket.headers.get("sec-websocket-protocol", "").split(",")
    subprotocols = [s.strip() for s in subprotocols if s.strip()]

    # 尝试接受连接，捕获可能由中间件导致的重复 accept 错误
    try:
        await websocket.accept(subprotocol=subprotocols[0] if subprotocols else None)
    except RuntimeError as e:
        if "already accepted" in str(e) or "websocket.accept" in str(e):
            pass  # 已经被中间件或其他地方 accept 过了
        else:
            raise e

    # 从 Cookie 获取 token
    cookies = websocket.cookies
    token = cookies.get("lab_access_token")
    if not token:
        await websocket.close(code=1008)
        return

    # 查询 Notebook 真实地址（命中缓存可避免 DB 查询）
    async def _query_notebook_address() -> Optional[str]:
        result = await db.execute(
            select(Notebook.real_address).filter(
                Notebook.project_id == project_id,
                Notebook.id == notebook_id,
            )
        )
        return result.scalar_one_or_none()

    target_base = await get_notebook_address_cached(
        project_id=project_id,
        notebook_id=notebook_id,
        fallback=_query_notebook_address,
    )
    if not target_base:
        await websocket.close(code=1008)
        return
    # 构建 WebSocket URL，保留 query 参数
    qs = f"?{websocket.scope['query_string'].decode()}" if websocket.scope['query_string'] else ""
    ws_url = target_base.replace("http", "ws") + (f"{path}{qs}" if path else "")

    try:
        async with websockets.connect(ws_url, subprotocols=subprotocols) as ws_client:
            async def client_to_ws():
                try:
                    while True:
                        msg = await websocket.receive()
                        if "text" in msg:
                            await ws_client.send(msg["text"])
                        elif "bytes" in msg:
                            await ws_client.send(msg["bytes"])
                        elif msg["type"] == "websocket.disconnect":
                            break
                except Exception:
                    pass

            async def ws_to_client():
                try:
                    async for msg in ws_client:
                        if isinstance(msg, bytes):
                            await websocket.send_bytes(msg)
                        else:
                            await websocket.send_text(msg)
                except Exception:
                    pass

            await asyncio.gather(client_to_ws(), ws_to_client())

    except Exception:
        await websocket.close(code=1011)


@router.get("/examples/notebook/list", response_model=Page[ExampleNotebookResponse])
@inject
async def example_notebooks_list(
        example_id: Optional[int] = Query(None, description="案例id"),
        name: Optional[str] = Query(None, max_length=255, description="案例名称（模糊搜索）"),
        biz_type: NotebookBizType = Query(NotebookBizType.LLM, description="业务类型：llm(大模型训练)/machine_learning(机器学习)"),
        params: Params = Depends(),
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service])
) -> Page[ExampleNotebookResponse]:
    """获取案例广场列表（只查询可用的案例，支持按名称过滤和分页）"""
    db, current_user = deps
    
    return await notebook_service.example_notebooks_list(example_id, name, biz_type, params)


@router.post("/examples/{project_id}/{notebook_id}/publish", response_model=PublishNotebookAsExampleResponse, status_code=status.HTTP_202_ACCEPTED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.NOTEBOOK, table_name="example_notebook",
                        operator_type=OperatorType.ADD, operator_content_key=["publish_request.name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={
                            "service_name": "project_service",
                            "field_name": "project_id",
                            "tag_field_name": "name"})
async def publish_notebook_as_example(
        project_id: int,
        notebook_id: int,
        publish_request: PublishNotebookAsExampleRequest,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service])
) -> PublishNotebookAsExampleResponse:
    """将 Notebook 发布为案例（异步任务）
    
    该接口会创建一个 Celery 任务，将指定的 Notebook 工作目录克隆到案例模板目录。
    任务完成后会自动创建一条案例记录。
    """
    db, current_user = deps
    
    return await notebook_service.publish_notebook_as_example(project_id, notebook_id, publish_request, current_user)


@router.post("/examples/notebook/upload-image", response_model=UploadExampleImageResponse)
@inject
async def upload_example_image(
        request: Request,
        file: UploadFile = File(...),
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service]),
) -> UploadExampleImageResponse:
    """上传案例图片到JFS并返回访问地址"""
    db, current_user = deps
    _ = db
    return await notebook_service.upload_example_image(file=file, current_user=current_user)


@router.delete("/examples/notebook/{id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.NOTEBOOK, table_name="example_delete",
                        operator_type=OperatorType.DELETE, operator_content_key=["example_delete.id"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={"id": "id"})
async def example_delete(
        id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service])
) -> None:
    """ 删除案例（异步任务）
    """
    db, current_user = deps

    return await notebook_service.example_delete(id, current_user, db)


@router.put("/examples/notebook/{id}", response_model=ExampleNotebookResponse)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.NOTEBOOK, table_name="example_update",
                       operator_type=OperatorType.EDIT, operator_content_key=["update_request.name"],
                       self_service_field_mapping=None,
                       scope_service_field_mapping={"id": "id"})
async def example_update(
        id: int,
        update_request: ExampleNotebookUpdate,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service])
) -> ExampleNotebookResponse:
    """编辑案例"""
    db, current_user = deps

    return await notebook_service.example_update(id, update_request, current_user, db)


@router.get("/examples/notebook/{id}/permission", response_model=ExampleNotebookPermissionResponse)
@inject
async def get_example_permission(
        id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service])
) -> ExampleNotebookPermissionResponse:
    """判断当前用户是否具备案例编辑/删除权限"""
    db, current_user = deps

    return await notebook_service.has_example_permission(id, current_user, db)


@router.get("/{project_id}/{notebook_id}/files", response_model=NotebookFilesResponse)
@inject
async def list_notebook_files(
        project_id: int,
        notebook_id: int,
        path: str = Query("/", description="Notebook 工作目录下的子路径，默认根目录"),
        recursive: bool = Query(False, description="是否递归列出子目录文件"),
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service])
) -> NotebookFilesResponse:
    db, current_user = deps
    return await notebook_service.list_notebook_files(project_id, notebook_id, path, recursive, current_user)
