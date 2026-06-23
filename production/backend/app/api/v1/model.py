from typing import List, Tuple, Optional
from datetime import datetime
from dependency_injector.wiring import Provide, inject
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, status, Path, Query
from fastapi.responses import Response
# 导入 fastapi-pagination 相关组件
from fastapi_pagination import Page
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.function_type import FunctionType
from app.common.status import TaskStatus
from app.common.operator_type import OperatorType
from app.core.depend_manager import AutoContainer
from app.interceptor.log.operator_logs_annotation import OperatorLogsAnnotation
from app.models.model_manager import BaseModel, TrainedModel
from app.models.models import JwtUserInfo
from app.schemas.model import BaseModelCreate, BaseModelResponse, TrainedModelCreate, TrainedModelResponse, \
    TrainedModelSummaryResponse, ModelType, ModelProvider, ModelStatusResp, ModelStatus, BaseModelUpdate, \
    TrainedModelLogResponse, ModelTagsResp, ModelTags, ModelSource, ModelSourceResp, \
    MlModelCreate, MlModelVersionCreate, MlModelUpdate, MlModelResponse, MlModelSummaryResponse, MlTaskType
from app.services.model.interface import ModelService
from app.utils.dependencies import get_db_and_user, get_db_and_admin
from app.utils.storage_enum import StoragePath
from app.utils.validators import validate_model_type, validate_model_provider, validate_task_status

router = APIRouter(prefix="/api/v1/models", tags=["models"])

# BaseModel endpoints
@router.get("/base/list", response_model=Page[BaseModelResponse])
@inject
async def list_base_models(
    model_type: Optional[ModelType] = Depends(validate_model_type),
    model_provider: Optional[ModelProvider] = Depends(validate_model_provider),
    page: Optional[int] = None,
    size: Optional[int] = None,
    is_available: Optional[bool] = Query(None, description="仅当 true 时过滤"),
    model_tags: Optional[List[ModelTags]] = Query(None, description="模型标签列表，例如 ['inference', 'training']"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> Page[BaseModelResponse]:
    """获取基础模型列表，支持按类型和提供商筛选，需要用户认证"""
    db, current_user = deps

    return await model_service.list_base_models(model_type, model_provider, page, size, is_available,model_tags)


@router.post("/base", response_model=BaseModelResponse, status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.BASE_MODEL_MANAGER, table_name="base_models",
                        operator_type=OperatorType.ADD, operator_content_key=["base_model.name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def create_base_model(
    base_model: BaseModelCreate,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> BaseModelResponse:
    """创建新的基础模型，需要用户认证"""
    db, current_user = deps
    
    return await model_service.create_base_model(current_user, base_model)

@router.put("/base", response_model=BaseModelResponse, status_code=status.HTTP_200_OK)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.BASE_MODEL_MANAGER, table_name="base_models",
                        operator_type=OperatorType.EDIT, operator_content_key=["base_model.name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def update_base_model(
        base_model: BaseModelUpdate,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> BaseModelResponse:
    """编辑基础模型，需要用户认证"""
    db, current_user = deps

    return await model_service.update_base_model(current_user, base_model)

@router.delete("/base/{base_model_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.BASE_MODEL_MANAGER, table_name="base_models",
                        operator_type=OperatorType.DELETE, operator_content_key=["base_model.name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def delete_base_model(
        base_model_id: int,
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_admin),
        model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> None:
    """删除基础模型，需要用户认证"""
    db, current_user = deps
    return await model_service.delete_base_model(current_user, base_model_id)

# TrainedModel endpoints
@router.get("/trained/project/{project_id}", response_model=Page[TrainedModelSummaryResponse])
@inject
async def list_trained_models(
    project_id: int = Path(..., description="项目ID"),
    name: Optional[str] = Query(None, description="按模型名称搜索"),
    model_type: Optional[ModelType] = Depends(validate_model_type),
    status: Optional[TaskStatus] = Depends(validate_task_status),
    page: Optional[int] = None,
    size: Optional[int] = None,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> Page[TrainedModelSummaryResponse]:
    """获取项目下的训练模型汇总列表，支持按模型类型、状态筛选
    
    Args:
        project_id: 项目ID
        name: 按模型名称搜索
        model_type: 模型类型筛选（可选）
        status: 模型状态筛选（可选）
        deps: 组合依赖
        
    Returns:
        分页的训练模型汇总列表，每个模型名称只返回一条汇总记录
    """
    db, current_user = deps
    
    return await model_service.list_trained_models(project_id, name, model_type, status, page, size)

@router.get("/trained/project/{project_id}/model/{model_name}", response_model=List[TrainedModelResponse])
@inject
async def get_trained_model_versions(
    project_id: int = Path(..., description="项目ID"),
    model_name: str = Path(..., description="模型名称"),
    status: Optional[TaskStatus] = Depends(validate_task_status),
    page: Optional[int] = None,
    size: Optional[int] = None,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> List[TrainedModelResponse]:
    """根据模型名称获取该模型的所有版本
    
    Args:
        project_id: 项目ID
        model_name: 模型名称
        status: 模型状态筛选（可选）
        deps: 组合依赖
        
    Returns:
        该模型名称下的所有版本列表，按版本号降序排序
        
    Raises:
        HTTPException: 如果项目不存在
    """
    db, current_user = deps
    
    return await model_service.get_trained_model_versions(project_id, model_name, status, page, size)


@router.post("/trained", response_model=TrainedModelResponse, status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.MODEL_MANAGER, table_name="trained_models",
                        operator_type=OperatorType.INSERT_VERSION, operator_content_key=["trained_model.name（trained_model.model_version）"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={
                            "service_name": "project_service",
                            "field_name": "trained_models.project_id",
                            "tag_field_name": "name"})
async def create_trained_model(
    trained_model: TrainedModelCreate,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> TrainedModel:
    """创建新的训练模型，需要用户认证"""
    db, current_user = deps
    
    return await model_service.create_trained_model(current_user, trained_model)


@router.put("/trained/{trained_model_id}", response_model=TrainedModelResponse, status_code=status.HTTP_200_OK)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.MODEL_MANAGER, table_name="trained_models",
                        operator_type=OperatorType.EDIT, operator_content_key=["trained_model.name（trained_model.model_version）"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={
                            "service_name": "project_service",
                            "field_name": "trained_models.project_id",
                            "tag_field_name": "name"})
async def update_trained_model(
    trained_model_id: int = Path(..., description="训练模型ID"),
    trained_model: TrainedModelCreate = ...,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> TrainedModel:
    """编辑训练模型（参数与创建一致），并同步更新执行器定时任务"""
    db, current_user = deps
    return await model_service.update_trained_model(current_user, trained_model_id, trained_model)


@router.post("/trained/project/{project_id}/task/{task_id}/stop", status_code=status.HTTP_204_NO_CONTENT)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.MODEL_MANAGER, table_name="trained_models",
                        operator_type=OperatorType.EDIT, operator_content_key=["task_id"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={
                            "service_name": "project_service",
                            "field_name": "project_id",
                            "tag_field_name": "name"})
async def stop_trained_model_task(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="训练模型任务ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> None:
    """终止训练模型任务，并按 Job 名删除 K8s 资源"""
    db, current_user = deps
    await model_service.stop_trained_model_task(project_id, task_id)

@router.delete("/trained/project/{project_id}/model/{model_name}", status_code=status.HTTP_204_NO_CONTENT)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.MODEL_MANAGER, table_name="trained_models",
                        operator_type=OperatorType.DELETE, operator_content_key=["model_name"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={
                            "service_name": "project_service",
                            "field_name": "project_id",
                            "tag_field_name": "name"})
async def delete_trained_model_all_versions(
    project_id: int = Path(..., description="项目ID"),
    model_name: str = Path(..., description="训练模型名称"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> None:
    """删除指定训练模型名下的所有版本
    
    Args:
        project_id: 项目ID
        model_name: 训练模型名称
        deps: 组合依赖
        
    Raises:
        HTTPException: 如果项目不存在或训练模型不存在
    """
    db, current_user = deps
    
    return await model_service.delete_trained_model_all_versions(project_id, model_name)

@router.delete("/trained/project/{project_id}/model/{model_name}/{version}", status_code=status.HTTP_204_NO_CONTENT)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.MODEL_MANAGER, table_name="trained_models",
                        operator_type=OperatorType.DELETE, operator_content_key=["model_name（version）"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={
                            "service_name": "project_service",
                            "field_name": "project_id",
                            "tag_field_name": "name"})
async def delete_single_trained_model(
    project_id: int = Path(..., description="项目ID"),
    model_name: str = Path(..., description="训练模型名称"),
    version: str = Path(..., description="模型版本"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> None:
    """删除单个训练模型版本
    
    Args:
        project_id: 项目ID
        model_name: 训练模型名称
        version: 模型版本
        deps: 组合依赖
        
    Raises:
        HTTPException: 如果项目不存在或训练模型不存在
    """
    db, current_user = deps
    
    return await model_service.delete_single_trained_model(project_id, model_name, version)


# ------------------------------ 机器学习模型 (ML Model) 接口 ------------------------------
@router.get("/ml/project/{project_id}", response_model=Page[MlModelSummaryResponse])
@inject
async def list_ml_models(
    project_id: int = Path(..., description="项目ID"),
    name: Optional[str] = Query(None, description="按模型名称搜索"),
    status: Optional[TaskStatus] = Depends(validate_task_status),
    page: Optional[int] = None,
    size: Optional[int] = None,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> Page[MlModelSummaryResponse]:
    """获取项目下机器学习模型汇总列表（按名称分组，含版本数量）；可按版本状态筛选。

    返回项含 `model_type`、`annotation_type`（第二层，与数据集对齐）、`task_type` 等。
    """
    db, current_user = deps
    return await model_service.list_ml_models(project_id, name, status, page, size)


@router.get("/ml/project/{project_id}/model/{model_name}", response_model=List[MlModelResponse])
@inject
async def get_ml_model_versions(
    project_id: int = Path(..., description="项目ID"),
    model_name: str = Path(..., description="模型名称"),
    status: Optional[TaskStatus] = Depends(validate_task_status),
    page: Optional[int] = None,
    size: Optional[int] = None,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> List[MlModelResponse]:
    """根据模型名称获取该机器学习模型的所有版本；可按状态筛选"""
    db, current_user = deps
    return await model_service.get_ml_model_versions(project_id, model_name, status, page, size)


@router.get(
    "/ml/project/{project_id}/model/{model_name}/versions/{model_version}",
    response_model=MlModelResponse,
)
@inject
async def get_ml_model_by_name_and_version(
    project_id: int = Path(..., description="项目ID"),
    model_name: str = Path(..., description="模型名称"),
    model_version: str = Path(..., description="版本号，如 V1、V2"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    model_service: ModelService = Depends(Provide[AutoContainer.model_service]),
) -> MlModelResponse:
    """根据模型名称与版本号获取单个机器学习模型版本"""
    db, current_user = deps
    return await model_service.get_ml_model_by_name_and_version(
        project_id, model_name, model_version
    )


@router.post("/ml/project/{project_id}", response_model=MlModelResponse, status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.MODEL_MANAGER, table_name="ml_models",
                        operator_type=OperatorType.ADD, operator_content_key=["name", "model_version"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={"service_name": "project_service", "field_name": "project_id", "tag_field_name": "name"})
async def create_ml_model(
    project_id: int = Path(..., description="项目ID"),
    body: MlModelCreate = Body(..., description="创建机器学习模型请求体"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> MlModelResponse:
    """创建机器学习模型（首版 V1）。

    - **类型分层**：`model_type`（text / image）→ `annotation_type`（与数据集对齐，如 `text_classification`、`image_classification`）→ 可选 `task_type`（第三层，如 `text_classification_single_label`）；枚举见 `GET /api/v1/enums/ml-task-types` 等。
    - **notebook**：按 `notebook_id` + `source_ref` 从 Notebook 注册；文本模型的 tokenizer **仅**能来自 Notebook 工作区路径 **`tokenizer_source_ref`**，不得使用分片上传的 `tokenizer_upload_id`。
    - **local_upload**：对 **任意 `.pt` 模型文件** 与（文本模型时）**tokenizer.json** 各走一遍分片上传 init → 分片 → merge，分别得到 `upload_id` 与 `tokenizer_upload_id`；后端将二者异步复制到同一 JFS 目录下的 `model.pt`、`tokenizer.json`。响应中 `source_ref` / `tokenizer_source_ref` 存两份 merge 的 uploadId，`artifact_uri` / `tokenizer_uri` 为落盘路径。
    """
    db, current_user = deps
    return await model_service.create_ml_model(current_user, project_id, body)


@router.post("/ml/project/{project_id}/model/{model_name}/versions", response_model=MlModelResponse, status_code=status.HTTP_201_CREATED)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.MODEL_MANAGER, table_name="ml_models",
                        operator_type=OperatorType.INSERT_VERSION, operator_content_key=["model_name", "model_version"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={"service_name": "project_service", "field_name": "project_id", "tag_field_name": "name"})
async def add_ml_model_version(
    project_id: int = Path(..., description="项目ID"),
    model_name: str = Path(..., description="模型名称"),
    body: MlModelVersionCreate = Body(..., description="新增机器学习模型版本请求体"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> MlModelResponse:
    """新增机器学习模型版本（服务端生成下一版本号如 V2）；与创建一致：notebook 文本模型仅 `tokenizer_source_ref`；local_upload 文本模型仅分片 `upload_id` + `tokenizer_upload_id`，二者来源不可交叉。"""
    db, current_user = deps
    return await model_service.add_ml_model_version(current_user, project_id, model_name, body)


@router.put("/ml/versions/{ml_model_id}", response_model=MlModelResponse, status_code=status.HTTP_200_OK)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.MODEL_MANAGER, table_name="ml_models",
                        operator_type=OperatorType.EDIT, operator_content_key=["name", "model_version"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={"service_name": "project_service", "field_name": "project_id", "tag_field_name": "name"})
async def update_ml_model_version(
    ml_model_id: int = Path(..., description="机器学习模型版本ID"),
    body: MlModelUpdate = ...,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> MlModelResponse:
    """更新机器学习模型版本（描述、网络结构、数据来源与产物路径）。

    仅当该版本状态为「失败」时允许调用；创建中、已完成等状态请走新增版本或等待复制完成。"""
    db, current_user = deps
    return await model_service.update_ml_model_version(current_user, ml_model_id, body)


@router.get("/ml/project/{project_id}/demo-sample")
@inject
async def download_ml_demo_sample_zip(
    project_id: int = Path(..., description="项目ID"),
    ml_task_type: MlTaskType = Query(
        ...,
        description=(
            "第三层任务子类型（枚举），写入 ml_models.task_type；下载 demo 时须与本仓库 `scripts/{ml_task_type}/` "
            "目录名一致（例如 `image_classification_single_label`、`semantic_segmentation`）。"
            "与创建模型时的 `annotation_type`（第二层）配套选择。"
        ),
    ),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    model_service: ModelService = Depends(Provide[AutoContainer.model_service]),
) -> Response:
    """下载机器学习 demo 样例压缩包：按第三层 `ml_task_type` 将本机仓库 `scripts/{ml_task_type}/` 打成 zip 下载。

    该参数与注册模型时的 `task_type` 取值一致（下划线风格），与 `annotation_type`（第二层）为不同字段。
    """
    db, current_user = deps
    body, filename = await model_service.download_ml_demo_sample_zip(
        project_id, ml_task_type.value
    )
    ascii_name = filename.encode("ascii", "ignore").decode("ascii") or "ml-demo.zip"
    quoted = quote(filename)
    return Response(
        content=body,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{quoted}',
        },
    )


@router.delete("/ml/project/{project_id}/model/{model_name}", status_code=status.HTTP_204_NO_CONTENT)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.MODEL_MANAGER, table_name="ml_models",
                        operator_type=OperatorType.DELETE,
                        operator_content_key=["model_name", "model_version"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping={"service_name": "project_service", "field_name": "project_id", "tag_field_name": "name"})
async def delete_ml_model(
    project_id: int = Path(..., description="项目ID"),
    model_name: str = Path(..., description="模型名称"),
    model_version: Optional[str] = Query(
        None,
        description="版本号（如 V1、V2）。不传或空则删除该模型名称下全部版本",
    ),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> None:
    """删除机器学习模型：可删指定版本，或不传 model_version 删除该名称下全部版本"""
    db, current_user = deps
    return await model_service.delete_ml_model(project_id, model_name, model_version)


@router.get("/public/list", response_model=List[str])
@inject
async def public_model_list(
        model_provider: ModelProvider = Query(ModelProvider.QWEN.value, description="按模型厂商"),
        name: Optional[str] = Query(None, description="按模型名称搜索"),
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> List[str]:
    """获取租户下未添加的基础模型，支持按模型类型筛选

    Args:
        model_provider: 按模型厂商
        name: 按模型名称搜索
        deps: 组合依赖

    Returns:
        基础模型列表
    """
    db, current_user = deps

    return await model_service.public_model_list(model_provider,name)


@router.get("/enums/base-model-tags", response_model=List[ModelTagsResp])
async def get_model_tags_enums() -> List[ModelTagsResp]:
    """返回基础模型标签枚举（值+中文描述）"""
    return [
        ModelTagsResp(label=item.desc, value=item.value)
        for item in ModelTags
    ]


@router.get("/enums/model-status", response_model=List[ModelStatusResp])
async def get_model_status_enums() -> List[ModelStatusResp]:
    """返回模型状态类型枚举（值+中文描述）"""
    return [
        ModelStatusResp(label=item.desc, value=item.value)
        for item in ModelStatus
    ]

@router.get("/enums/model-source", response_model=List[ModelSourceResp])
async def get_model_source_enums() -> List[ModelSourceResp]:
    """返回模型来源类型枚举（值+中文描述）"""
    return [
        ModelSourceResp(label=item.desc, value=item.value)
        for item in ModelSource
    ]

@router.get("/trained/project/{project_id}/model/{task_id}/logs", response_model=TrainedModelLogResponse)
@inject
async def get_trained_model_logs(
        project_id: int = Path(..., description="项目ID"),
        task_id: int = Path(..., description="训练任务ID"),
        end_time: datetime = Query(..., description="结束时间（ISO格式），用于指定Loki查询的结束时间点"),
        days: Optional[int] = Query(30, description="如果没有归档日志，从结束时间往前查询N天的日志"),
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> TrainedModelLogResponse:
    """获取合并训练任务日志

    Args:
        project_id: 项目ID
        task_id: 训练任务ID
        end_time: 结束时间（可选），用于指定Loki查询的结束时间点
        days: 如果没有归档日志，从结束时间往前查询N天的日志（可选）
        deps: 组合依赖

    Returns:
        训练任务日志响应，包含是否归档和日志内容
    """
    db, current_user = deps
    return await model_service.get_trained_model_logs(project_id, task_id, end_time, days)

@router.get("/trained/project/{project_id}/model/{task_id}/logs/range", response_model=TrainedModelLogResponse)
@inject
async def get_trained_model_logs_by_time_range(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="训练任务ID"),
    start_time: datetime = Query(..., description="开始时间（ISO格式）"),
    end_time: datetime = Query(..., description="结束时间（ISO格式）"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> TrainedModelLogResponse:
    """获取指定时间范围的合并训练任务日志"""
    db, current_user = deps
    return await model_service.get_trained_model_logs_by_time_range(project_id, task_id, start_time, end_time)

@router.get("/base/model/download/{task_id}/logs", response_model=TrainedModelLogResponse)
@inject
async def get_base_model_download_logs(
        task_id: int = Path(..., description="模型下载任务ID"),
        end_time: datetime = Query(..., description="结束时间（ISO格式），用于指定Loki查询的结束时间点"),
        days: Optional[int] = Query(30, description="如果没有归档日志，从结束时间往前查询N天的日志"),
        deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
        model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> TrainedModelLogResponse:
    """获取模型下载任务日志

    Args:
        task_id: 训练任务ID
        end_time: 结束时间（可选），用于指定Loki查询的结束时间点
        days: 如果没有归档日志，从结束时间往前查询N天的日志（可选）
        deps: 组合依赖

    Returns:
        训练任务日志响应，包含是否归档和日志内容
    """
    db, current_user = deps
    return await model_service.get_base_model_download_logs(task_id, end_time, days)

@router.get("/base/model/download/{task_id}/logs/range", response_model=TrainedModelLogResponse)
@inject
async def get_base_model_download_logs_by_time_range(
    task_id: int = Path(..., description="模型下载任务ID"),
    start_time: datetime = Query(..., description="开始时间（ISO格式）"),
    end_time: datetime = Query(..., description="结束时间（ISO格式）"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> TrainedModelLogResponse:
    """获取指定时间范围的模型下载任务日志"""
    db, current_user = deps
    return await model_service.get_base_model_download_logs_by_time_range(task_id, start_time, end_time)


@router.post("/base/model/download/{task_id}/stop", status_code=status.HTTP_204_NO_CONTENT)
@inject
@OperatorLogsAnnotation(function_name=FunctionType.BASE_MODEL_MANAGER, table_name="base_models",
                        operator_type=OperatorType.EDIT, operator_content_key=["task_id"],
                        self_service_field_mapping=None,
                        scope_service_field_mapping=None)
async def stop_base_model_download_task(
    task_id: int = Path(..., description="模型下载任务ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    model_service: ModelService = Depends(Provide[AutoContainer.model_service])
) -> None:
    """终止基础模型下载任务，并按 Job 名删除 K8s 资源"""
    db, current_user = deps
    await model_service.stop_base_model_download_task(task_id)
