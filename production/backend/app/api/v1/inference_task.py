from typing import List, Optional, Tuple

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Body, Depends, Query, Path, status
from fastapi_pagination import Page
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.function_type import FunctionType
from app.common.operator_type import OperatorType
from app.common.status import TaskStatus
from app.core.depend_manager import AutoContainer
from app.interceptor.log.operator_logs_annotation import OperatorLogsAnnotation
from app.models.models import JwtUserInfo
from app.schemas.inference_task import (
    BackendEnum,
    InferenceTaskCreate,
    InferenceTaskCreatedResponse,
    InferenceTaskRedeploy,
    InferenceTaskResponse,
    InferenceTaskScale,
    InferenceTaskSummaryResponse,
    InferenceTaskUpdate,
    ModelSourceEnum,
    MlDeployDevNotebookCreate,
    MlDeployDevNotebookResponse,
)
from app.schemas.model import MlTaskType
from app.services.inference_task.interface import InferenceTaskService
from app.services.notebook.interface import NotebookService
from app.utils.dependencies import get_db_and_user
from app.utils.validators import (
    validate_inference_engine_type_list,
    validate_ml_backend_usage,
    validate_model_source_list,
    validate_task_status,
)

router = APIRouter(prefix="/api/v1/inference_tasks", tags=["inference-tasks"])

@router.post("/project/{project_id}", response_model=InferenceTaskCreatedResponse, status_code=status.HTTP_202_ACCEPTED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.INFERENCE_SERVICE, table_name="inference_tasks",
                        operator_type=OperatorType.ADD, operator_content_key=["inference_task_create.instance_name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={
                            "service_name": "project_service",
                            "field_name": "project_id",
                            "tag_field_name": "name"})
async def create_inference_task(
    project_id: int = Path(..., description="项目ID"),
    task: InferenceTaskCreate = Body(..., description="创建推理任务请求体"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    inference_task_service: InferenceTaskService = Depends(Provide[AutoContainer.inference_task_service])
) -> InferenceTaskCreatedResponse:
    """创建推理任务（异步）

    **机器学习模型部署** `model.py` 有两种方式（二选一，详见 `ml_model_config`）：
    - **分片上传**：`init` → 分片 → `merge` ≈ **uploadId** → `ml_handle_upload_id`（默认 `ml_handle_source_type: upload`）。
    - **Notebook 工作区**：与「从 Notebook 创建机器学习模型」一致，设 `ml_handle_source_type: notebook`，并填 `notebook_id`、
      `handle_source_ref`（相对 Notebook 工作目录的 `.py` 路径，如 `scripts/model.py`）。
    后端把脚本落到 JuiceFS 部署目录并挂载；关联表 **inference_task_ml_handles** 记录路径（主表不存脚本字段）。

    ## 请求示例

    ### 示例1：ML 模型部署（分片上传 merge 得到 uploadId）
    ```json
    {
      "server_name": "ml-text-clf-infer",
      "description": "机器学习模型（Notebook 产物）在线推理",
      "project_id": 1,
      "model_source": "ml_model",
      "ml_model_config": {
        "ml_model_id": 100,
        "ml_handle_upload_id": "550e8400-e29b-41d4-a716-446655440000"
      },
      "desired_replicas": 1,
      "inference_engine_type": "vLLM",
      "backend_parameters": ["--dtype", "auto"],
      "env_vars": {},
      "image_config": {
        "image_id": 1,
        "image_name": "vllm-serve",
        "image_url": "registry.example.com/inference/vllm:0.6"
      },
      "graphics_card_resource": {
        "card_type": "GPU",
        "card_model": "A800",
        "count": 1,
        "card_memory": "80GB",
        "k8s_resource_type": "nvidia.com/gpu"
      },
      "resource_cpu_config": {
        "resource_cpu_request": 4,
        "resource_cpu_limit": 8,
        "resource_memory_request": 16,
        "resource_memory_limit": 32
      }
    }
    ```

    ### 示例1b：ML 从 Notebook 引用 model.py
    ```json
    {
      "server_name": "ml-from-nb",
      "description": "从 Notebook 工作区引用 model.py",
      "project_id": 1,
      "model_source": "ml_model",
      "ml_model_config": {
        "ml_model_id": 100,
        "ml_handle_source_type": "notebook",
        "notebook_id": 42,
        "handle_source_ref": "src/inference/model.py"
      },
      "desired_replicas": 1,
      "inference_engine_type": "vLLM",
      "backend_parameters": [],
      "env_vars": {},
      "image_config": {
        "image_id": 1,
        "image_name": "vllm-serve",
        "image_url": "registry.example.com/inference/vllm:0.6"
      },
      "graphics_card_resource": {
        "card_type": "GPU",
        "card_model": "A800",
        "count": 1,
        "card_memory": "80GB",
        "k8s_resource_type": "nvidia.com/gpu"
      },
      "resource_cpu_config": {
        "resource_cpu_request": 4,
        "resource_cpu_limit": 8,
        "resource_memory_request": 16,
        "resource_memory_limit": 32
      }
    }
    ```

    ### 示例2：基础模型部署
    ```json
    {
      "server_name": "base-llm-infer",
      "description": "基础模型推理",
      "project_id": 1,
      "model_source": "base_model",
      "base_model_config": {
        "base_model_id": 1,
        "base_model_name": "Qwen2-7B",
        "base_model_path": "/path/to/base/qwen2-7b"
      },
      "desired_replicas": 1,
      "inference_engine_type": "vLLM",
      "backend_parameters": [],
      "env_vars": {},
      "image_config": {
        "image_id": 1,
        "image_name": "vllm-serve",
        "image_url": "registry.example.com/inference/vllm:0.6"
      },
      "graphics_card_resource": {
        "card_type": "GPU",
        "card_model": "A800",
        "count": 1,
        "card_memory": "80GB",
        "k8s_resource_type": "nvidia.com/gpu"
      },
      "resource_cpu_config": {
        "resource_cpu_request": 4,
        "resource_cpu_limit": 8,
        "resource_memory_request": 16,
        "resource_memory_limit": 32
      }
    }
    ```
    """
    db, current_user = deps
    return await inference_task_service.create_inference_task(current_user, project_id, task)


@router.post(
    "/project/{project_id}/ml_debug_notebook",
    response_model=MlDeployDevNotebookResponse,
    status_code=status.HTTP_201_CREATED,
)
@inject
@OperatorLogsAnnotation(
    function_name=FunctionType.NOTEBOOK,
    table_name="notebooks",
    operator_type=OperatorType.ADD,
    operator_content_key=["task.server_name"],
    self_service_field_mapping=None,
    scope_service_field_mapping={
        "service_name": "project_service",
        "field_name": "project_id",
        "tag_field_name": "name",
    },
)
async def create_ml_deploy_dev_notebook(
    project_id: int = Path(..., description="项目ID"),
    task: MlDeployDevNotebookCreate = Body(
        ..., description="在线开发：ml_model_config + 显卡/CPU 资源；镜像由服务端选择"
    ),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    notebook_service: NotebookService = Depends(Provide[AutoContainer.notebook_service]),
) -> MlDeployDevNotebookResponse:
    """机器学习部署在线开发：创建 Notebook 并返回其 ID。

    仅需 **模型**（`ml_model_config`）与 **资源配置**。可选挂载 `model_handle/model.py`：
    - 分片上传：`ml_handle_upload_id`；
    - 或 Notebook：`ml_handle_source_type: notebook` + `notebook_id` + `handle_source_ref`。
    不写上述任一来源则不挂载。脚本会落到与线上一致的 JuiceFS 路径。

    - `auto_start=false`（默认）：只创建 Notebook，由前端再调启动接口。
    - `auto_start=true`：创建后立即发起启动/部署。
    """
    db, current_user = deps
    return await notebook_service.create_ml_deploy_dev_notebook(current_user, project_id, task)


@router.get("/project/{project_id}", response_model=Page[InferenceTaskSummaryResponse])
@inject
async def list_inference_tasks(
        project_id: int = Path(..., description="项目ID"),
        server_name: Optional[str] = Query(None, description="按推理服务名称搜索"),
        model_name: Optional[str] = Query(None, description="按模型名称搜索"),
        model_source: Optional[List[ModelSourceEnum]] = Depends(validate_model_source_list),
        status: Optional[TaskStatus] = Depends(validate_task_status),
        inference_engine_type: Optional[List[BackendEnum]] = Depends(validate_inference_engine_type_list),
        usage: Optional[MlTaskType] = Depends(validate_ml_backend_usage),
        page: Optional[int] = None,
        size: Optional[int] = None,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        inference_task_service: InferenceTaskService = Depends(Provide[AutoContainer.inference_task_service])
) -> Page[InferenceTaskSummaryResponse]:
    """获取项目下的推理任务汇总列表，支持筛选
    
    Args:
        project_id: 项目ID
        server_name: 按推理服务名称搜索（可选）
        model_name: 按模型名称搜索（可选）
        model_source: 按模型来源筛选，可重复查询参数多选（可选）
        status: 按任务状态筛选（可选）
        inference_engine_type: 按推理引擎类型筛选，可重复查询参数多选（可选，与创建任务时 inference_engine_type 一致，如 vLLM、MindIE）
        usage: 按机器学习模型的任务子类型（ml_models.task_type，与 MlTaskType 一致）筛选，仅匹配 model_source=ml_model 的部署；不依赖 Notebook，本地上传模型同样适用（可选）
        page: 页码（可选）
        size: 每页数量（可选）
        deps: 组合依赖

    返回项 ``network_architecture``：机器学习部署（ml_model）取模型管理中「网络结构」，否则为 ``-``。

    Returns:
        分页的推理任务汇总列表，每个任务名称只返回一条汇总记录
    """
    db, current_user = deps

    return await inference_task_service.list_inference_tasks(
        project_id,
        server_name,
        model_name,
        model_source,
        status,
        inference_engine_type,
        usage,
        page,
        size,
    )
    


@router.get("/project/{project_id}/{inference_task_id}", response_model=InferenceTaskResponse)
@inject
async def get_inference_task(
    project_id: int = Path(..., description="项目ID"),
    inference_task_id: int = Path(..., description="推理任务ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    inference_task_service: InferenceTaskService = Depends(Provide[AutoContainer.inference_task_service])
) -> InferenceTaskResponse:
    """根据推理任务ID获取该任务的信息
    
    Args:
        project_id: 项目ID
        inference_task_id: 推理任务ID
        deps: 组合依赖
        
    Returns:
        该推理服务名称的信息
        
    Raises:
        HTTPException: 如果项目不存在或任务不存在
    """
    db, current_user = deps

    return await inference_task_service.get_inference_task(project_id, inference_task_id)



@router.put("/{project_id}/{inference_task_id}/redeploy", response_model=InferenceTaskCreatedResponse)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.INFERENCE_SERVICE, table_name="inference_tasks",
                        operator_type=OperatorType.EDIT, operator_content_key=["inference_task_update.server_name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={
                            "service_name": "project_service",
                            "field_name": "project_id",
                            "tag_field_name": "name"})
async def update_inference_task(
        project_id: int,
        inference_task_id: int,
        inference_task_redeploy: InferenceTaskRedeploy = Body(
            ...,
            description=(
                "重新部署请求体，结构与创建一致；ML 须再次在 ml_model_config 中指定 model.py 来源"
                "（ml_handle_upload_id 或 notebook_id+handle_source_ref）"
            ),
        ),
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        inference_task_service: InferenceTaskService = Depends(Provide[AutoContainer.inference_task_service])
) -> InferenceTaskCreatedResponse:
    """重新部署推理任务：删旧 K8s 应用与库表记录后按当前 Body 再创建。ML 部署须再次指定 model.py 来源（上传或 Notebook），规则同创建接口。

    ## 请求示例

    ### 示例1：ML 模型重新部署（分片上传）
    ```json
    {
      "server_name": "ml-text-clf-infer",
      "description": "机器学习模型（Notebook 产物）在线推理",
      "project_id": 1,
      "model_source": "ml_model",
      "ml_model_config": {
        "ml_model_id": 100,
        "ml_handle_upload_id": "550e8400-e29b-41d4-a716-446655440000"
      },
      "desired_replicas": 1,
      "inference_engine_type": "vLLM",
      "backend_parameters": ["--dtype", "auto"],
      "env_vars": {},
      "image_config": {
        "image_id": 1,
        "image_name": "vllm-serve",
        "image_url": "registry.example.com/inference/vllm:0.6"
      },
      "graphics_card_resource": {
        "card_type": "GPU",
        "card_model": "A800",
        "count": 1,
        "card_memory": "80GB",
        "k8s_resource_type": "nvidia.com/gpu"
      },
      "resource_cpu_config": {
        "resource_cpu_request": 4,
        "resource_cpu_limit": 8,
        "resource_memory_request": 16,
        "resource_memory_limit": 32
      },
      "redeploy": true
    }
    ```
    """
    db, current_user = deps
    return await inference_task_service.redeploy_inference_task(current_user, project_id, inference_task_id, inference_task_redeploy)



@router.put("/{project_id}/{inference_task_id}/update", response_model=InferenceTaskCreatedResponse)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.INFERENCE_SERVICE, table_name="inference_tasks",
                        operator_type=OperatorType.EDIT, operator_content_key=["inference_task_update.server_name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={
                            "service_name": "project_service",
                            "field_name": "project_id",
                            "tag_field_name": "name"})
async def update_inference_task(
        project_id: int,
        inference_task_id: int,
        inference_task_update: InferenceTaskUpdate,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        inference_task_service: InferenceTaskService = Depends(Provide[AutoContainer.inference_task_service])
) -> InferenceTaskCreatedResponse:
    db, current_user = deps
    return await inference_task_service.update_inference_task(project_id, inference_task_id, inference_task_update)



@router.delete("/{project_id}/{inference_task_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.INFERENCE_SERVICE, table_name="inference_tasks",
                        operator_type=OperatorType.DELETE, operator_content_key=["inference_task_id"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={
                            "service_name": "project_service",
                            "field_name": "project_id",
                            "tag_field_name": "name"})
async def delete_inference_task(
        project_id: int,
        inference_task_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        inference_task_service: InferenceTaskService = Depends(Provide[AutoContainer.inference_task_service])
) -> None:
    db, current_user = deps
    await inference_task_service.delete_inference_task(project_id, inference_task_id)



@router.post("/{project_id}/{inference_task_id}/scale", status_code=status.HTTP_202_ACCEPTED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.INFERENCE_SERVICE, table_name="inference_tasks",
                        operator_type=OperatorType.EDIT, operator_content_key=["inference_task_update.server_name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={
                            "service_name": "project_service",
                            "field_name": "project_id",
                            "tag_field_name": "name"})
async def update_inference_task(
        project_id: int,
        inference_task_id: int,
        inference_task_scale: InferenceTaskScale,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        inference_task_service: InferenceTaskService = Depends(Provide[AutoContainer.inference_task_service])
) -> None:
    db, current_user = deps
    return await inference_task_service.scale_inference_task(project_id, inference_task_id, inference_task_scale)
