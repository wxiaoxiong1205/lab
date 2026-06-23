import io
from typing import Optional, Tuple

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query, Path, status
from fastapi.responses import StreamingResponse
from fastapi_pagination import Page
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.depend_manager import AutoContainer
from app.models.models import JwtUserInfo
from app.schemas.data_cleaning import (
    CleaningTaskCreate, CleaningTaskResponse,
    CleaningTaskListResponse, CleaningTaskDetailResponse,
    CleaningTemplateCreate, CleaningTemplateResponse,
    CleaningLogResponse,
    OperatorCategoryListResponse, CleaningDownloadType,
    CleaningComparisonResponse, DatasetFieldsResponse
)
from app.services.data_cleaning.interface import CleaningService
from app.utils.dependencies import get_db_and_user

router = APIRouter(prefix="/api/v1/data_cleaning", tags=["data_cleaning"])


# ------------------------------ 数据清洗任务接口 ------------------------------

@router.post("/{project_id}/tasks", response_model=CleaningTaskResponse, status_code=status.HTTP_201_CREATED)
@inject
async def create_data_cleaning_task(
    project_id: int = Path(..., description="项目ID", gt=0),
    task_create: CleaningTaskCreate = ...,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    cleaning_service: CleaningService = Depends(Provide[AutoContainer.cleaning_service])
) -> CleaningTaskResponse:
    """创建数据清洗任务"""
    db, current_user = deps
    task_create.project_id = project_id
    return await cleaning_service.create_data_cleaning_task(current_user, task_create)


@router.put("/{project_id}/tasks/{task_id}", response_model=CleaningTaskResponse, status_code=status.HTTP_200_OK)
@inject
async def update_data_cleaning_task(
    project_id: int = Path(..., description="项目ID", gt=0),
    task_id: int = Path(..., description="数据清洗任务ID"),
    task_update: CleaningTaskCreate = ...,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    cleaning_service: CleaningService = Depends(Provide[AutoContainer.cleaning_service])
) -> CleaningTaskResponse:
    """更新数据清洗任务，并同步更新执行器任务数据"""
    db, current_user = deps
    task_update.project_id = project_id
    return await cleaning_service.update_data_cleaning_task(current_user, project_id, task_id, task_update)


@router.get("/tasks/{task_id}", response_model=CleaningTaskDetailResponse)
@inject
async def get_data_cleaning_task(
    task_id: int = Path(..., description="数据清洗任务ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    cleaning_service: CleaningService = Depends(Provide[AutoContainer.cleaning_service])
) -> CleaningTaskDetailResponse:
    """获取数据清洗任务详情与结果预览（随机50条）"""
    db, current_user = deps
    return await cleaning_service.get_data_cleaning_task(task_id)


@router.get("/{project_id}/tasks", response_model=Page[CleaningTaskListResponse])
@inject
async def list_data_cleaning_tasks(
    project_id: int = Path(..., description="项目ID", gt=0),
    name: Optional[str] = Query(None, description="任务名称搜索（模糊匹配）"),
    status: Optional[str] = Query(None, description="任务状态筛选（创建/排队中/启动中/运行中/已完成/失败/终止"),
    page: Optional[int] = Query(None, description="页码", ge=1),
    size: Optional[int] = Query(None, description="每页数量", ge=1, le=100),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    cleaning_service: CleaningService = Depends(Provide[AutoContainer.cleaning_service])
) -> Page[CleaningTaskListResponse]:
    """
    获取项目下的数据清洗任务列表
    
    支持按任务名称（模糊匹配）和状态筛选，以及分页查询
    """
    db, current_user = deps
    return await cleaning_service.list_data_cleaning_tasks(project_id, name, status, page, size)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def delete_data_cleaning_task(
    task_id: int = Path(..., description="数据清洗任务ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    cleaning_service: CleaningService = Depends(Provide[AutoContainer.cleaning_service])
):
    """
    删除数据清洗任务
    
    运行中的任务不能删除；已完成任务支持删除，并清理任务自身副本与日志
    """
    db, current_user = deps
    await cleaning_service.delete_data_cleaning_task(task_id)


@router.get("/tasks/{task_id}/logs", response_model=CleaningLogResponse)
@inject
async def get_data_cleaning_task_logs(
    task_id: int = Path(..., description="数据清洗任务ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    cleaning_service: CleaningService = Depends(Provide[AutoContainer.cleaning_service])
) -> CleaningLogResponse:
    """
    获取数据清洗任务日志
    
    - 优先返回归档日志（MinIO）
    - 如果没有归档，则从Loki获取实时日志
    """
    db, current_user = deps
    return await cleaning_service.get_data_cleaning_task_logs(task_id)


@router.get("/tasks/{task_id}/comparison", response_model=CleaningComparisonResponse)
@inject
async def get_data_cleaning_comparison(
    task_id: int = Path(..., description="数据清洗任务ID"),
    sample_count: int = Query(50, ge=1, le=200, description="采样数量"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    cleaning_service: CleaningService = Depends(Provide[AutoContainer.cleaning_service])
) -> CleaningComparisonResponse:
    """获取清洗前后数据对比
    
    - random: 随机采样对比
    - smart: 智能采样（优先采样有变化的数据）
    - full: 完整对比（可能很慢，不推荐用于大数据集）
    """
    db, current_user = deps
    return await cleaning_service.get_data_cleaning_comparison(task_id, sample_count)


@router.post("/{project_id}/tasks/{task_id}/stop", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def stop_data_cleaning_task(
    project_id: int = Path(..., description="项目ID", gt=0),
    task_id: int = Path(..., description="数据清洗任务ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    cleaning_service: CleaningService = Depends(Provide[AutoContainer.cleaning_service])
):
    """终止数据清洗任务，并按 Job 名删除 K8s 资源"""
    db, current_user = deps
    await cleaning_service.stop_data_cleaning_task(project_id, task_id)


@router.get("/tasks/download/{download_type}/{task_id}")
@inject
async def download_data_cleaning_result(
    download_type: CleaningDownloadType = Path(..., description="下载类型（result/log）"),
    task_id: int = Path(..., description="数据清洗任务ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    cleaning_service: CleaningService = Depends(Provide[AutoContainer.cleaning_service])
):
    """
    下载数据清洗结果或日志
    
    - **result**: 下载数据清洗结果文件（JSONL格式）
    - **log**: 下载数据清洗日志文件（优先归档日志，其次Loki实时日志）
    """
    db, current_user = deps
    content = await cleaning_service.download_data_cleaning_result(task_id, download_type.value)
    
    # 设置文件名
    if download_type == CleaningDownloadType.RESULT:
        filename = f"data_cleaning_result_{task_id}.jsonl"
        media_type = "application/jsonl"
    else:
        filename = f"data_cleaning_log_{task_id}.log"
        media_type = "text/plain"
    
    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ------------------------------ 数据清洗模板接口 ------------------------------

@router.post("/{project_id}/templates", response_model=CleaningTemplateResponse, status_code=status.HTTP_201_CREATED)
@inject
async def create_data_cleaning_template(
    project_id: int = Path(..., description="项目ID", gt=0),
    template_create: CleaningTemplateCreate = ...,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    cleaning_service: CleaningService = Depends(Provide[AutoContainer.cleaning_service])
) -> CleaningTemplateResponse:
    """
    保存数据清洗模板
    """
    db, current_user = deps
    template_create.project_id = project_id
    return await cleaning_service.create_data_cleaning_template(current_user, template_create)


@router.get("/templates/{template_id}", response_model=CleaningTemplateResponse)
@inject
async def get_data_cleaning_template(
    template_id: int = Path(..., description="模板ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    cleaning_service: CleaningService = Depends(Provide[AutoContainer.cleaning_service])
) -> CleaningTemplateResponse:
    """
    获取数据清洗模板详情
    """
    db, current_user = deps
    return await cleaning_service.get_data_cleaning_template(template_id)


@router.get("/{project_id}/templates", response_model=Page[CleaningTemplateResponse])
@inject
async def list_data_cleaning_templates(
    project_id: int = Path(..., description="项目ID", gt=0),
    page: Optional[int] = Query(None, description="页码", ge=1),
    size: Optional[int] = Query(None, description="每页数量", ge=1),
    created_by: Optional[str] = Query(None, description="创建人搜索（模糊匹配）"),
    operator_type: Optional[str] = Query(None, description="算子类型搜索"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    cleaning_service: CleaningService = Depends(Provide[AutoContainer.cleaning_service])
) -> Page[CleaningTemplateResponse]:
    """获取数据清洗模板列表
    
    支持按创建人和算子类型搜索
    """
    db, current_user = deps
    return await cleaning_service.list_data_cleaning_templates(project_id, page, size, created_by, operator_type)


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def delete_data_cleaning_template(
    template_id: int = Path(..., description="模板ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    cleaning_service: CleaningService = Depends(Provide[AutoContainer.cleaning_service])
):
    """
    删除数据清洗模板
    内置模板不能删除
    """
    db, current_user = deps
    await cleaning_service.delete_data_cleaning_template(template_id)


# ------------------------------ 算子相关接口 ------------------------------
@router.get("/operators/categories", response_model=OperatorCategoryListResponse)
@inject
async def get_operators_by_category(
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    cleaning_service: CleaningService = Depends(Provide[AutoContainer.cleaning_service])
) -> OperatorCategoryListResponse:
    """ 获取按分类组织的数据清洗算子列表 """
    db, current_user = deps
    return await cleaning_service.get_operators_by_category()


# ------------------------------ 数据集字段接口 ------------------------------
@router.get("/datasets/{dataset_id}/fields", response_model=DatasetFieldsResponse)
@inject
async def get_dataset_fields(
    dataset_id: int = Path(..., description="训练数据集ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    cleaning_service: CleaningService = Depends(Provide[AutoContainer.cleaning_service])
) -> DatasetFieldsResponse:
    """
    根据训练数据集ID获取数据清洗可选字段列表。

    该接口保留数据清洗自己的字段格式化逻辑：
    - 优先使用数据集上传/修复阶段入库的 metadata_fields
    - metadata_fields 为空时，回退读取少量有效样本行
    - role-based 数据集返回 system/user/assistant 或 chosen/rejected 等清洗逻辑字段
    """
    db, current_user = deps
    return await cleaning_service.get_dataset_fields(dataset_id)
