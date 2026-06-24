"""
通用代理路由：将请求转发至 ML 推理服务（inference_tasks.access_url）。
"""
import logging
import sys

import httpx
from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from starlette.responses import StreamingResponse, HTMLResponse, Response

from app.core.depend_manager import AutoContainer
from app.core.logging import get_request_id
from app.models import InferenceTask
from app.repository.base_mapper import BaseMapper

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/ml_backend/proxy", tags=["ml_backend_proxy"])

# 连接/池及时失败；read 放宽以支持长连接与慢速流式推理响应
PROXY_TIMEOUT = httpx.Timeout(connect=10.0, read=300.0, write=120.0, pool=10.0)


def _filter_response_headers(headers: httpx.Headers) -> dict:
    skip = {"content-encoding", "transfer-encoding", "connection"}
    return {k: v for k, v in headers.items() if k.lower() not in skip}


@router.api_route(
    "/{project_id}/{ml_inference_task_id}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
)
@router.api_route(
    "/{project_id}/{ml_inference_task_id}/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
)
@inject
async def proxy_ml_backend(
    project_id: int,
    ml_inference_task_id: int,
    request: Request,
    path: str = "",
    base_mapper: BaseMapper = Depends(Provide[AutoContainer.base_mapper]),
):
    """
    将请求代理到指定推理任务的后端（access_url）。

    示例：``GET /api/v1/ml_backend/proxy/1/42/v1/models`` → ``{access_url}/v1/models``
    """

    inference_task: InferenceTask = await base_mapper.query_one(
        select(InferenceTask)
        .filter(InferenceTask.id == ml_inference_task_id)
        .filter(InferenceTask.project_id == project_id)
    )
    if not inference_task:
        return HTMLResponse("<h1>Inference Task Not Found</h1>", status_code=404)

    base = (inference_task.access_url or "").strip().rstrip("/")
    if not base:
        return HTMLResponse(
            "<h1>Service Not Ready</h1><p>推理任务尚未暴露 access_url，请等待部署就绪。</p>",
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

    client = httpx.AsyncClient(follow_redirects=True, timeout=PROXY_TIMEOUT)
    try:
        await client.__aenter__()
    except Exception:
        logger.exception(
            "ml_backend_proxy client init failed | request_id=%s | target=%s",
            request_id,
            target_url,
        )
        return HTMLResponse(
            "<h1>Proxy Error</h1><p>无法建立到推理后端的连接，请稍后重试。</p>",
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
            "ml_backend_proxy upstream request failed | request_id=%s | target=%s",
            request_id,
            target_url,
        )
        return HTMLResponse(
            "<h1>Proxy Error</h1><p>推理后端请求失败，请稍后重试。</p>",
            status_code=502,
        )

    try:
        content_type = proxied.headers.get("content-type", "")
        out_headers = _filter_response_headers(proxied.headers)

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
            "ml_backend_proxy response error | request_id=%s | target=%s",
            request_id,
            target_url,
        )
        return HTMLResponse(
            "<h1>Proxy Error</h1><p>转发推理响应时出错，请稍后重试。</p>",
            status_code=502,
        )
