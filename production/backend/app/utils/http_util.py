import os
from typing import Dict, Any, Optional
import httpx
import logging
from urllib.parse import quote
from fastapi import HTTPException
from contextvars import ContextVar  # 用于存储当前请求的Token（协程安全）

from starlette import status

from app.core import settings

# 配置日志
logging.basicConfig(level=logging.ERROR)
logger = logging.getLogger(__name__)


# 全局连接池客户端（复用连接，避免频繁创建）
class SharedAsyncClient:
    _client: Optional[httpx.AsyncClient] = None

    @classmethod
    def get_client(cls, timeout: httpx.Timeout = None) -> httpx.AsyncClient:
        """获取全局共享的AsyncClient实例（单例模式）"""
        if cls._client is None:
            # 初始化连接池配置
            cls._client = httpx.AsyncClient(
                timeout=timeout or httpx.Timeout(10.0, connect=5.0),
                limits=httpx.Limits(
                    max_connections=100,  # 最大连接数
                    max_keepalive_connections=20,  # 最大长连接数
                    keepalive_expiry=30.0  # 长连接超时时间（秒）
                )
            )
        return cls._client

    @classmethod
    async def close(cls):
        """关闭客户端（应用退出时调用）"""
        if cls._client:
            await cls._client.aclose()
            cls._client = None


class NotebookProxyClient:
    """
    Notebook 浏览器代理专用 AsyncClient（全局单例）。

    与 ``SharedAsyncClient`` 区分开的原因：
    - 代理 JupyterLab 首屏会并发拉取大量 JS / CSS / 字体 / labextension 等静态资源，
      连接池需要更大；
    - 代理流量可能包含长轮询、Kernel info 等较慢响应，``read`` 不能像 API 客户端
      一样设成 10s；
    - 静态资源直接 ``aiter_raw`` 透传，不应在客户端层做 gzip 自动解压（让浏览器
      处理），所以保留 upstream 的 ``Content-Encoding`` 头。

    连接池容量按 ~100 个同时活跃 notebook pod 估算：
    - httpx 内部连接池按 origin (scheme, host, port) 分桶，单 client 即可对接 N 个 pod；
    - max_keepalive: 100 pod * 平均 4 条复用 ≈ 400；
    - max_connections: 留 keepalive 的 ~4 倍承接首屏并发突发；
    - 若实际活跃 pod 远高于 100，请同步上调（并确认进程 ulimit -n 足够）。
    """

    _client: Optional[httpx.AsyncClient] = None
    # connect 给较短的失败感知（多 pod 下 pod 漂移 / 重启更频繁），
    # read 留长以兼容 jupyter 长轮询、kernel info、大文件下载，
    # pool 给短一点避免某个慢 pod 长期占用槽位拖慢整池获取。
    _DEFAULT_TIMEOUT = httpx.Timeout(connect=5.0, read=300.0, write=120.0, pool=5.0)
    _DEFAULT_LIMITS = httpx.Limits(
        max_connections=1500,
        max_keepalive_connections=400,
        keepalive_expiry=60.0,
    )

    @classmethod
    def get_client(cls) -> httpx.AsyncClient:
        if cls._client is None:
            cls._client = httpx.AsyncClient(
                follow_redirects=True,
                timeout=cls._DEFAULT_TIMEOUT,
                limits=cls._DEFAULT_LIMITS,
                http2=False,
            )
        return cls._client

    @classmethod
    async def close(cls):
        if cls._client is not None:
            await cls._client.aclose()
            cls._client = None


# 上下文变量：存储当前请求的Token（支持异步/多协程）
current_token: ContextVar[Optional[str]] = ContextVar("current_token", default=None)


def set_current_token(token: str):
    """设置当前上下文的Token（在请求入口调用，如中间件）"""
    current_token.set(token)


class SafeHTTPClient:
    """带连接池和安全隔离的HTTP客户端"""

    def __init__(self, base_url: str):
        self.base_url = base_url
        self.default_headers = {"Content-Type": "application/json"}

    async def request(
            self,
            method: str,
            path: str,
            params: Optional[Dict[str, Any]] = None,
            data: Optional[Dict[str, Any]] = None,
            headers: Optional[Dict[str, Any]] = None,
            token: Optional[str] = None  # 允许显式传入Token，覆盖上下文Token
    ) -> Dict[str, Any]:
        """
        通用请求方法：优先使用显式传入的Token，否则使用上下文Token
        """
        # 1. 获取Token（显式传入 > 上下文Token）
        used_token = token or current_token.get()

        # 2. 构建请求头（合并默认头和自定义头）
        request_headers = self.default_headers.copy()
        if headers:
            request_headers.update(headers)
        # 添加Token认证头
        if used_token:
            request_headers["Authorization"] = f"Bearer {used_token}"

        # 3. 构建完整URL
        url = f"{self.base_url.rstrip('/')}/{path.lstrip('/')}"

        try:
            # 复用全局连接池客户端
            client = SharedAsyncClient.get_client()
            response = await client.request(
                method=method.upper(),
                url=url,
                params=params,
                json=data,
                headers=request_headers
            )

            # 检查HTTP状态码
            response.raise_for_status()

            # 解析响应
            try:
                return response.json()
            except ValueError:
                return {"response_text": response.text}

        except httpx.HTTPStatusError as e:
            status_code = e.response.status_code
            error_msg = f"HTTP error {status_code}: {e.response.content}"
            logger.error(f"请求 {method} {url} 失败: {error_msg}")

            if status_code == 401:
                raise HTTPException(status_code=401, detail="Token无效或已过期")
            elif status_code == 403:
                raise HTTPException(status_code=403, detail=error_msg)
            elif status_code == 404:
                raise HTTPException(status_code=404, detail=error_msg)
            else:
                raise HTTPException(status_code=500, detail=f"外部服务错误: {status_code}")

        except httpx.TimeoutException:
            logger.error(f"请求 {method} {url} 超时")
            raise HTTPException(status_code=504, detail="外部服务响应超时")

        except httpx.RequestError as e:
            logger.error(f"请求 {method} {url} 失败: {str(e)}")
            raise HTTPException(status_code=503, detail="无法连接到外部服务")

    # 便捷方法（GET/POST等）
    async def get(self, path: str, **kwargs) -> Dict[str, Any]:
        return await self.request(method="GET", path=path, **kwargs)

    async def post(self, path: str, **kwargs) -> Dict[str, Any]:
        return await self.request(method="POST", path=path, **kwargs)

    async def put(self, path: str, **kwargs) -> Dict[str, Any]:
        return await self.request(method="PUT", path=path, **kwargs)


# 1. 初始化全局客户端（单例，共享连接池）
api_client = SafeHTTPClient(base_url=settings.FASTDATA_WORKBENCH_URL_PRE)
belle_api_client: Optional[SafeHTTPClient] = None

def get_api_client() -> SafeHTTPClient:
    return api_client


def build_content_disposition_header(filename: str) -> str:
    """
    构建 Content-Disposition 响应头，支持非 ASCII 字符（如中文）

    根据 RFC 5987 标准，当文件名包含非 ASCII 字符时，使用 filename* 参数。
    格式：attachment; filename="fallback"; filename*=UTF-8''encoded_name

    注意：filename 参数必须是 ASCII 安全的，否则 Starlette 会报错。
    如果文件名包含非 ASCII 字符，filename 将使用 ASCII 安全的回退值。

    Args:
        filename: 文件名（可能包含非 ASCII 字符）

    Returns:
        Content-Disposition 头的值（纯 ASCII，可以直接编码为 latin-1）

    Examples:
        >>> build_content_disposition_header("test.jsonl")
        'attachment; filename="test.jsonl"'

        >>> build_content_disposition_header("测试.jsonl")
        'attachment; filename="download.jsonl"; filename*=UTF-8\'\'%E6%B5%8B%E8%AF%95.jsonl'
    """
    try:
        # 尝试使用 ASCII 编码，如果成功则直接使用
        filename.encode('ascii')
        # 纯 ASCII 字符，可以直接使用
        return f'attachment; filename="{filename}"'
    except UnicodeEncodeError:
        # 包含非 ASCII 字符，使用 RFC 5987 格式
        # URL 编码文件名（不编码斜杠等安全字符）
        encoded_filename = quote(filename, safe='')

        # 提取文件扩展名（如果存在）
        import os
        _, ext = os.path.splitext(filename)
        # 生成 ASCII 安全的回退文件名
        # 使用 "download" + 原始扩展名作为回退
        # 确保扩展名也是 ASCII 安全的
        if ext:
            try:
                ext.encode('ascii')
                fallback_filename = f"download{ext}"
            except UnicodeEncodeError:
                # 扩展名也包含非 ASCII 字符，只使用 "download"
                fallback_filename = "download"
        else:
            fallback_filename = "download"

        # 使用 filename* 参数，格式：UTF-8''encoded_name
        # filename 参数必须是 ASCII 安全的（纯 ASCII 字符）
        # 这样整个 header 值就可以被编码为 latin-1
        return f'attachment; filename="{fallback_filename}"; filename*=UTF-8\'\'{encoded_filename}'

# 2. 初始化百丽全局客户端（单例，共享连接池）
provider_type = settings.PROVIDER_TYPE
if provider_type == 'belle':
    belle_api_client = SafeHTTPClient(base_url=settings.BELLE_API_URL_PRE)

def get_belle_api_client() -> SafeHTTPClient:
    if belle_api_client is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="当前环境非belle，无法获取belle API客户端，请检查配置"
        )
    return belle_api_client