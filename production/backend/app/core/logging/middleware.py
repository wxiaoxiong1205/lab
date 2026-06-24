"""
极简日志中间件

提供HTTP请求的自动日志记录功能，包括请求信息、响应状态和处理时间。
设计原则：轻量级、高性能、易于理解。
支持完整记录请求内容：查询参数、请求体、所有请求头。
"""

import time
import uuid
import json
from typing import Callable, Dict, Any, Optional
from fastapi import Request, Response, HTTPException
from contextvars import ContextVar, Token
from starlette.responses import Response

from .logger import logger

# 请求ID上下文变量
request_id_context: ContextVar[str] = ContextVar("request_id", default="")


def _response_has_deferred_body(response: Response) -> bool:
    """
    判断响应体是否会在 middleware 返回后继续由 ASGI 异步发送。
    此类响应若在 call_next 返回后立即 reset ContextVar，后续流式/断开阶段的日志会丢失 request_id。
    判断逻辑：响应对象上是否存在 body_iterator（如 StreamingResponse）。
    """
    return getattr(response, "body_iterator", None) is not None


def _wrap_response_body_iterator_for_context_reset(response: Response, token: Token) -> Response:
    """
    包装 body_iterator，在流式发送结束（或异常/取消）后再 reset request_id_context。
    """
    original = response.body_iterator

    async def wrapped_body():
        try:
            async for chunk in original:
                yield chunk
        finally:
            try:
                request_id_context.reset(token)
            except (ValueError, RuntimeError):
                # token 已失效等情况，避免二次 reset 影响其它逻辑
                pass

    response.body_iterator = wrapped_body()  # type: ignore[assignment]
    return response


class RequestLoggingMiddleware:
    """
    HTTP请求日志中间件
    
    自动记录所有HTTP请求的完整信息：
    - 基本信息：请求方法、路径、客户端IP
    - 请求内容：查询参数、请求体、所有请求头
    - 响应信息：状态码、处理时间
    - 请求ID：用于链路跟踪
    
    特性：
    - 完整记录所有内容，不进行任何过滤
    - 不限制请求体大小
    - 记录所有请求头信息
    - 支持配置开关控制记录级别
    """
    
    def __init__(self, 
                 log_request_body: bool = True, 
                 log_query_params: bool = True,
                 log_headers: bool = True):
        """
        初始化日志中间件
        
        Args:
            log_request_body: 是否记录请求体内容
            log_query_params: 是否记录查询参数
            log_headers: 是否记录请求头
        """
        self.log_request_body = log_request_body
        self.log_query_params = log_query_params  
        self.log_headers = log_headers
    
    async def __call__(self, request: Request, call_next: Callable) -> Response:
        # 生成唯一请求ID
        request_id = str(uuid.uuid4())[:8]  # 使用短ID提高可读性
        
        # 设置请求上下文
        token = request_id_context.set(request_id)

        # 将request_id 存到 request.state 供 exception_handler 在 reset 后仍能读取
        request.state._request_id = request_id

        # 流式响应需在 body 发送完毕后再 reset，否则此处不能提前 reset
        defer_context_reset = False

        # 提取基本请求信息
        method = request.method
        path = request.url.path
        client_ip = getattr(request.client, 'host', 'unknown') if request.client else 'unknown'
        
        # 收集详细请求信息
        request_details = await self._collect_request_details(request)
        
        # 记录请求开始
        start_time = time.time()

        # 将start_time 存到 request.state 供 exception_handler 在 reset 后仍能读取
        request.state._request_start_time = start_time

        logger.info(f"==================REQUEST ================== | {request_id} | {method} {path} | {client_ip}")
        
        # 记录详细请求信息（如果有的话）
        if request_details:
            logger.info(f"REQUEST_DETAILS | {request_id} | {json.dumps(request_details, ensure_ascii=False)}")
        
        try:
            # 处理请求
            response = await call_next(request)
            
            # 计算处理时间
            duration = (time.time() - start_time) * 1000
            
            # 记录请求完成
            logger.info(
                f"==================RESPONSE ================== | {request_id} | {method} {path} | "
                f"{response.status_code} | {duration:.3f}ms"
            )
            
            # 在响应头中添加请求ID
            response.headers["X-Request-ID"] = request_id

            # 区分「普通响应」与「流式响应」，决定是否在本层 finally 里立即 reset ContextVar：
            #
            # - 普通响应：call_next 返回时响应体已就绪，中间件 return 后不再有本请求的异步发送；
            #   可在下方 finally 中立刻 request_id_context.reset，避免同上下文残留旧 request_id。
            #
            # - 流式响应（存在 body_iterator，如文件下载 StreamingResponse）：call_next 只返回了「响应对象」，
            #   ASGI 还会在 middleware 返回之后继续 async 迭代 body、向客户端写数据，并可能并行执行
            #   listen_for_disconnect 等逻辑。若仍在中间件 finally 里立即 reset，则「流式发送 / 断开 /
            #   读存储超时」等阶段打日志时 ContextVar 已被清空，统一日志里的 request_id 会丢失（常见表现为
            #   前缀为「-」或与 message 内 id 不一致）。
            #
            # 因此对流式响应包装 body_iterator，在迭代结束（正常、异常或取消）时的 finally 里再 reset，
            # 使 request_id 生命周期覆盖整次响应的实际发送过程。
            if _response_has_deferred_body(response):
                response = _wrap_response_body_iterator_for_context_reset(response, token)
                defer_context_reset = True

            return response

        # 这里不再捕获抛出的异常
        # 原因1：在这里捕获异常，打印并抛出后，不会被fastapi统一异常处理器捕获，导致异常直接被抛到服务器
        # 原因2：在这里捕获的异常，只有非fastapi定义的异常，如Exception，这种异常再被fastapi统一异常管理器捕获后，系统仍会往外抛出，在这里捕获没有意义
        # except Exception as e:
        #     # 记录请求失败
        #     duration = (time.time() - start_time) * 1000
        #
        #     if isinstance(e, HTTPException):
        #         # HTTPException 单独格式化，确保 status_code 与 detail 都写入日志
        #         detail_str = f"{e.status_code}-{e.detail if isinstance(e.detail, str) else json.dumps(e.detail, ensure_ascii=False)}"
        #         err_msg = f"HTTPException: {detail_str}"
        #     else:
        #         err_msg = f"{type(e).__name__}: {str(e)}"
        #
        #     logger.error(
        #         f"ERROR | {request_id} | {method} {path} | "
        #         f"{err_msg} | {duration:.3f}ms"
        #     )
        #
        #     # 重新抛出异常，让FastAPI处理
        #     raise

        finally:
            # 清理上下文
            request_id_context.reset(token)

    async def _collect_request_details(self, request: Request) -> Dict[str, Any]:
        """
        收集详细的请求信息
        
        Args:
            request: FastAPI请求对象
            
        Returns:
            包含请求详细信息的字典
        """
        details = {}
        
        # 收集查询参数
        if self.log_query_params and request.query_params:
            query_params = dict(request.query_params)
            details["query_params"] = query_params
        
        # 收集请求体
        if self.log_request_body and request.method in ["POST", "PUT", "PATCH", "DELETE"]:
            body_content = await self._read_request_body(request)
            if body_content is not None:
                details["body"] = body_content
        
        return details
    
    async def _read_request_body(self, request: Request) -> Optional[Any]:
        """
        完整读取请求体内容，不进行任何限制或过滤
        
        Args:
            request: FastAPI请求对象
            
        Returns:
            解析后的请求体内容
        """
        try:
            # 读取原始请求体
            body = await request.body()
            
            # 如果请求体为空，直接返回
            if not body:
                return None
            
            # 尝试解析JSON
            try:
                body_json = json.loads(body.decode('utf-8'))
                return body_json
            except (json.JSONDecodeError, UnicodeDecodeError):
                # 如果不是JSON，返回原始字符串内容
                try:
                    body_str = body.decode('utf-8')
                    return {"_raw_text": body_str}
                except UnicodeDecodeError:
                    # 如果无法解码为文本，返回base64编码的原始数据
                    import base64
                    body_b64 = base64.b64encode(body).decode('ascii')
                    return {
                        "_raw_binary": body_b64,
                        "_content_length": len(body)
                    }
                
        except Exception as e:
            logger.warning(f"Failed to read request body: {e}")
            return {"_error": f"Failed to read body: {str(e)}"}


def get_request_id() -> str:
    """
    获取当前请求ID
    
    Returns:
        当前请求的唯一标识符，如果不在请求上下文中则返回空字符串
    """
    return request_id_context.get("") 