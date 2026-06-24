from datetime import datetime

from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.common.custom_params import CustomParams
from app.core.depend_manager import AutoContainer

from contextlib import asynccontextmanager
import time

from fastapi.middleware.cors import CORSMiddleware
# 导入 fastapi-pagination 初始化函数
from fastapi_pagination import add_pagination
from app.common.swagger_config import setup_swagger_bearer_auth

# 已删除相关功能的路由导入被注释
# from app.api import project, prompt, llm_config, chain_test, user, task, test_run, prompt_directory, metrics, \
#     dataset_directory, dataset_log, metric_directory, k8s, repository, storage, notebook, repository_image, model, training_dataset, training_task
# from app.api.dataset import router as dataset_router

from app.api.v1 import (project, user, repository, storage, notebook, repository_image, model, training_dataset, \
                        training_task, enums, menu, operator_log, inference_result, business_attr,
                        evaluation_task, online_inference_service, common_config,
                        training_dataset, inference_task, applications, label,
                        data_cleaning, chunk_upload, file_management, manual_evaluation_task, online_inference_service,
                        common_config, training_dataset, inference_task, applications, label, multi_label, data_cleaning,
                        admin_permissions, third_party_api, business_inference_result_dataset, task_execution, benchmark_task,
                        machine_learning_dataset, online_annotation_service, ml_backend_proxy, tag, openapi_application,
                        compute_task_overview, advanced_template, reward)
from app.api.openapi.v1.router import router as openapi_v1_router
from app.api.v1 import k8s
from app.tasks.sync_k8s_labels import KubernetesLabelsSync
from app.tasks.label_tasks import start_annotation_consumer, stop_annotation_consumer
# 以下路由已被禁用：prompt, llm_config, task, test_run, prompt_directory, metrics, dataset_directory, dataset_log, metric_directory, dataset
from app.utils.auth_middleware import auth_middleware, token_handle
from app.middleware.permission_middleware import permission_middleware
from app.core.logging import setup_logging, logger, RequestLoggingMiddleware, get_request_id
from functools import wraps
from app.utils.http_util import NotebookProxyClient, SharedAsyncClient
# 导入JSON工具
from app.utils.json_utils import patch_json
from app.core.ssh_gateway import start_ssh_server
from app.tasks.stop_notebook_task import NotebookTasks
import asyncio
import argparse

setup_logging()
# 记录应用启动日志
logger.info(f"DeepexiLab 开始运行")

# 替换Python标准库中的json.dumps函数，确保全局默认使用ensure_ascii=False
patch_json()


def _get_validation_detail(exc: RequestValidationError) -> str:
    """从 RequestValidationError 提取友好校验文案，供响应与日志复用。"""
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
    """根据异常类型生成统一格式的 error 日志文案。"""
    if isinstance(exc, RequestValidationError):
        return f"RequestValidationError: {_get_validation_detail(exc)}"
    if isinstance(exc, HTTPException):
        detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        return f"HTTPException: {detail}"
    return f"{type(exc).__name__}: {str(exc)}"


def _resolve_error_request_id(request: Request) -> str:
    """与装饰器一致：优先 request.state，其次上下文。"""
    return getattr(request.state, "_request_id", "") or get_request_id() or ""


def _is_openapi_request(request: Request) -> bool:
    return request.url.path.startswith("/openapi/lab/v1/")


def _openapi_error_response(status_code: int, code: str, message: str, request_id: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "request_id": request_id,
            "code": code,
            "message": message,
        },
    )


def _log_exception_and_add_request_id(handler):
    """装饰器：在异常处理器执行前打 ERROR 日志，并在响应头写入 X-Request-ID。

    HTTPException / RequestValidationError 仅单行（便于 Loki 按行检索）；其余异常附带完整堆栈。
    """
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
            # 若异常为预期内异常，仅打印日常信息
            logger.error(line)
        else:
            # 若异常不为预期内异常，打印完整的异常信息
            logger.opt(exception=exc).error(line)
        response = await handler(request, exc)
        response.headers["X-Request-ID"] = request_id
        return response
    return wrapper


# @asynccontextmanager
# async def lifespan(app: FastAPI):
#     """
#     应用生命周期管理器

#     在应用启动和关闭时执行必要的初始化和清理工作
#     """
#     # 应用启动时的初始化逻辑
#     logger.info("应用正在启动...")

#     yield  # 这里是应用运行的阶段

#     # 应用关闭时的清理逻辑
#     logger.info("应用正在关闭...")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动ssh监听
    # asyncio.create_task(start_ssh_server())

    # 启动stop_notebook_tasks任务
    stop_notebook_tasks = NotebookTasks()
    stop_notebook_tasks.start()

    # 启动sync_k8s_labels任务
    sync_k8s_labels = KubernetesLabelsSync()
    sync_k8s_labels.start()

    # 启动标注事件消费者
    await start_annotation_consumer()

    yield

    # shutdown 可以在这里处理
    logger.info("应用正在关闭...")

    # 停止标注事件消费者
    await stop_annotation_consumer()

    # httpClient close
    await SharedAsyncClient.close()
    await NotebookProxyClient.close()

def create_app() -> FastAPI:
    # 初始化容器并关联到当前模块
    # container = AutoContainer()
    container = AutoContainer()
    app = FastAPI(
        title="DeepexiLab",
        description="DeepexiLab 模型生成平台",
        version="v1",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url=None
    )
    app.container = container

    # 添加全局验证错误处理器，统一返回格式（日志与 X-Request-ID 由装饰器统一处理）
    @app.exception_handler(RequestValidationError)
    @_log_exception_and_add_request_id
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        """将 Pydantic 验证错误转换为统一的 HTTPException 格式"""
        msg = _get_validation_detail(exc)
        rid = _resolve_error_request_id(request)
        if _is_openapi_request(request):
            return _openapi_error_response(400, "InvalidParameter", msg, rid)
        return JSONResponse(status_code=400, content={"msg": msg, "request_id": rid})

    @app.exception_handler(HTTPException)
    @_log_exception_and_add_request_id
    async def http_exception_handler(request: Request, exc: HTTPException):
        """HTTPException 异常统一处理逻辑"""
        msg = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        rid = _resolve_error_request_id(request)
        if _is_openapi_request(request):
            return _openapi_error_response(exc.status_code, "InvalidParameter", msg, rid)
        return JSONResponse(status_code=exc.status_code, content={"msg": msg, "request_id": rid})

    @app.exception_handler(Exception)
    @_log_exception_and_add_request_id
    async def generic_exception_handler(request: Request, exc: Exception):
        """
            未捕获服务器异常统一处理逻辑
            注意：非fastapi框架定义的异常，再被fastapi框架捕获后，仍会按照原样往外抛出。
        """
        rid = _resolve_error_request_id(request)
        if _is_openapi_request(request):
            return _openapi_error_response(500, "InternalError", "系统异常", rid)
        return JSONResponse(status_code=500, content={"msg": "系统异常", "request_id": rid})

    # 初始化 fastapi-pagination，支持全局分页功能
    # 仅将 Page.__params_type__ 设为 CustomParams，使 add_pagination 注入的依赖使用 size 上限 1000；
    # 不替换 default.Params，否则 Page.create() 的 isinstance(params, Params) 会失败（mapper 传入的是 CustomParams）
    import fastapi_pagination.default as _paginate_default
    _paginate_default.Page.__params_type__ = CustomParams
    # 这将自动为所有返回 Page[T] 的路由添加分页参数和响应格式
    add_pagination(app)

    # 配置CORS    这个配置被app.middleware("http")这种方式覆盖失效了
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # 开发环境允许所有源
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 添加日志中间件 - 自动记录所有HTTP请求（不记录请求体以保护隐私）
    app.middleware("http")(RequestLoggingMiddleware(
        log_request_body=False,  # 禁用请求体记录，保护数据隐私
        log_query_params=True,  # 保留查询参数记录
        log_headers=False  # 禁用请求头记录，避免敏感信息泄露
    ))

    # 将前端传递过来的token，继续透传到其他的http请求中
    app.middleware("http")(token_handle)

    # 设置权限拦截中间件（在认证中间件之后执行，所以先注册）
    app.middleware("http")(permission_middleware)

    # 设置认证中间件（最后注册，最先执行）
    app.middleware("http")(auth_middleware)

    # 路由配置
    #
    # 说明：现在我们通过 app.utils.dependencies 提供组合的依赖函数
    # 来简化路由中的重复依赖声明
    # 使用方式：
    # - 对于需要数据库和用户认证的路由：使用 get_db_and_user()
    # - 对于需要管理员权限的路由：使用 get_db_and_admin()
    app.include_router(user.router)
    app.include_router(menu.router)
    app.include_router(project.router)
    # 以下路由已被禁用，相关功能已删除
    # app.include_router(llm_config.router)
    # app.include_router(dataset_directory.router)
    # app.include_router(dataset_router)
    # app.include_router(dataset_log.router)
    # app.include_router(prompt_directory.router)
    # app.include_router(prompt.router)
    # app.include_router(task.router)
    # app.include_router(metric_directory.router)
    # app.include_router(metrics.router)
    # app.include_router(test_run.router)
    # app.include_router(chain_test.router)
    app.include_router(training_dataset.router)
    app.include_router(training_task.router)
    app.include_router(inference_task.router)
    app.include_router(compute_task_overview.router)
    app.include_router(k8s.router)
    app.include_router(repository.router)

    app.include_router(storage.router)
    app.include_router(model.router)
    app.include_router(enums.router)

    app.include_router(notebook.router)
    app.include_router(ml_backend_proxy.router)

    app.include_router(repository_image.router)
    app.include_router(operator_log.router)
    app.include_router(inference_result.router)
    app.include_router(evaluation_task.router)
    app.include_router(manual_evaluation_task.router)
    app.include_router(benchmark_task.router)
    app.include_router(common_config.router)
    app.include_router(advanced_template.router)
    app.include_router(reward.router)

    # 在所有路由注册完成后，配置 Swagger UI 的 Bearer Token 认证
    # 这样可以确保 OpenAPI schema 包含所有路由信息
    setup_swagger_bearer_auth(app)

    app.include_router(applications.router)
    app.include_router(label.router)
    app.include_router(multi_label.router)
    app.include_router(data_cleaning.router)

    app.include_router(online_inference_service.router)
    app.include_router(chunk_upload.router)
    app.include_router(file_management.router)
    app.include_router(admin_permissions.router)
    app.include_router(task_execution.router)

    app.include_router(business_attr.router)

    app.include_router(tag.router)
    app.include_router(openapi_application.router)
    app.include_router(openapi_v1_router)

    # 在所有路由注册完成后，配置 Swagger UI 的 Bearer Token 认证
    # 这样可以确保 OpenAPI schema 包含所有路由信息
    setup_swagger_bearer_auth(app)
    # 第三方api接口
    app.include_router(third_party_api.router)

    # 业务推理结果集
    app.include_router(business_inference_result_dataset.router)
    app.include_router(machine_learning_dataset.router)
    app.include_router(online_annotation_service.router)
    return app

app = create_app()


@app.get("/")
async def root():
    """根路径健康检查"""
    return {"message": f"欢迎使用DeepexiLab", "version": "v1"}


@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


@app.get("/redoc", include_in_schema=False)
def redoc():
    """Redoc 文档"""
    from fastapi.openapi.docs import get_redoc_html
    return get_redoc_html(
        openapi_url="/openapi.json",
        title="API Docs",
        redoc_js_url="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js",
    )

if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description='DeepexiLab 启动参数')
    parser.add_argument('--port', type=int, default=8000, help='监听端口')
    args = parser.parse_args()
    uvicorn.run(app, host="0.0.0.0", port=args.port)
