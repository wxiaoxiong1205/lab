from typing import Optional, Tuple

from dependency_injector.wiring import inject, Provide
from fastapi import APIRouter, Depends, Query, Path, status
from fastapi.responses import StreamingResponse
from fastapi_pagination import Page
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.depend_manager import AutoContainer
from app.models.models import JwtUserInfo
from app.schemas.label import (
    LabelTaskCreate, LabelTaskResponse,
    AnnotationSaveRequest, AnnotationSaveResponse,
    AnnotationDataResponse,
    LabelTaskDetailResponse,
    LabelAutoModelCreate, LabelAutoModelResponse,
    AIAnnotationRequest,
    AnnotationCompletionStatusResponse, LabelTaskBizType,
    LabelTagCreateRequest, LabelTagListResponse, LabelTagCreateResponse,
    LabelTagUpdateRequest, LabelTagUpdateResponse,
)
from app.schemas.training_task import TrainingTypeCategory
from app.services.label.interface import LabelService
from app.utils.dependencies import get_db_and_user
from app.utils.validators import validate_dataset_type_category

router = APIRouter(prefix="/api/v1/label", tags=["label"])

@router.post("/{project_id}/tasks", status_code=status.HTTP_201_CREATED)
@inject
async def create_label_task(
    project_id: int = Path(..., description="项目ID", gt=0),
    task_create: LabelTaskCreate = ...,
    # file: Optional[UploadFile] = File(None, description="数据文件（.jsonl格式，当source=upload时必需）"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    label_service: LabelService = Depends(Provide[AutoContainer.label_service])
) -> dict:
    """
    创建标注任务（在线/多人）
    
    返回: {"id": 任务ID}
    """
    db, current_user = deps
    task_create.project_id = project_id
    return await label_service.create_label_task(current_user, task_create, None)


@router.get("/tasks/{task_id}/completion-status", response_model=AnnotationCompletionStatusResponse)
@inject
async def check_annotation_completion(
    task_id: int = Path(..., description="标注任务ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    label_service: LabelService = Depends(Provide[AutoContainer.label_service])
) -> AnnotationCompletionStatusResponse:
    """
    查询标注任务的完成状态和提交状态
    
    返回信息包括：
    - is_completed: 是否完成标注（暂存数=总条数）
    - is_submitted: 是否已提交（任务状态为已完成或已生成提交数据集）
    """
    db, current_user = deps
    return await label_service.check_annotation_completion(task_id)

# 目前无用接口
@router.get("/tasks/{task_id}/detail", response_model=LabelTaskDetailResponse)
@inject
async def get_label_task_detail(
    task_id: int = Path(..., description="标注任务ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    label_service: LabelService = Depends(Provide[AutoContainer.label_service])
) -> LabelTaskDetailResponse:
    """获取标注任务详情（按 biz_type 返回 LLM 或机器学习数据集信息）"""
    _db, _current_user = deps
    return await label_service.get_label_task(task_id)


@router.get("/tasks/{task_id}", response_model=AnnotationDataResponse)
@inject
async def get_label_task(
    task_id: int = Path(..., description="标注任务ID"),
    page: Optional[int] = Query(1, description="页码（从1开始），用于前端分页显示，表示过滤后数据的页码位置", ge=1),
    size: Optional[int] = Query(20, description="每页数量，与page配合使用", ge=1, le=100),
    is_annotated: Optional[bool] = Query(None, description="标注状态过滤（true=已标注，false=未标注，不传=不过滤）"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    label_service: LabelService = Depends(Provide[AutoContainer.label_service])
) -> AnnotationDataResponse:
    """
    获取标注任务中的单条数据（支持分页和标注状态过滤）
    
    - page/size: 前端分页参数，用于显示分页信息（过滤后数据的页码位置）
    - is_annotated: 标注状态过滤（true=已标注，false=未标注，不传=不过滤）
    
    如果指定了is_annotated过滤，会返回符合条件的数据总数和分页信息。
    返回的数据项中包含row_number字段（原始数据在文件中的行号），前端保存标注时需要用到此字段来定位标注信息是给哪条数据的。
    """
    db, current_user = deps
    return await label_service.get_label_task_data(task_id, page, size, is_annotated)


@router.get("/{project_id}/tasks", response_model=Page[LabelTaskResponse])
@inject
async def list_label_tasks(
    project_id: int = Path(..., description="项目ID", gt=0),
    task_type: Optional[str] = Query(None, description="任务类型筛选（online/multi）"),
    task_name: Optional[str] = Query(None, description="任务名称搜索（模糊匹配）"),
    biz_type: Optional[LabelTaskBizType] = Query(LabelTaskBizType.LLM, description="任务业务类型枚举"),
    dataset_type: Optional[TrainingTypeCategory] = Depends(validate_dataset_type_category),
    page: Optional[int] = Query(None, description="页码", ge=1),
    size: Optional[int] = Query(None, description="每页数量", ge=1, le=100),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    label_service: LabelService = Depends(Provide[AutoContainer.label_service])
) -> Page[LabelTaskResponse]:
    """获取项目下的标注任务列表"""
    db, current_user = deps
    return await label_service.list_label_tasks(project_id, task_type, task_name, dataset_type, page, size, biz_type)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def delete_label_task(
    task_id: int = Path(..., description="标注任务ID"),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    label_service: LabelService = Depends(Provide[AutoContainer.label_service])
):
    """删除标注任务（已完成/已发布任务也支持删除）"""
    db, current_user = deps
    await label_service.delete_label_task(task_id)


@router.post("/tasks/{task_id}/labels", response_model=LabelTagCreateResponse, status_code=status.HTTP_201_CREATED)
@inject
async def add_label_tag(
    task_id: int = Path(..., description="标注任务ID", gt=0),
    request: LabelTagCreateRequest = ...,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    label_service: LabelService = Depends(Provide[AutoContainer.label_service])
) -> LabelTagCreateResponse:
    """新增标注标签（仅机器学习标注任务）"""
    _db, _current_user = deps
    return await label_service.add_label_tag(task_id, request)


@router.get("/tasks/{task_id}/labels", response_model=LabelTagListResponse, status_code=status.HTTP_200_OK)
@inject
async def list_label_tags(
    task_id: int = Path(..., description="标注任务ID", gt=0),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    label_service: LabelService = Depends(Provide[AutoContainer.label_service])
) -> LabelTagListResponse:
    """查询标注标签列表（仅机器学习标注任务）"""
    _db, _current_user = deps
    return await label_service.list_label_tags(task_id)


@router.put("/tasks/{task_id}/labels/{class_id}", response_model=LabelTagUpdateResponse, status_code=status.HTTP_200_OK)
@inject
async def update_label_tag(
    task_id: int = Path(..., description="标注任务ID", gt=0),
    class_id: int = Path(..., description="类别ID", ge=0),
    request: LabelTagUpdateRequest = ...,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    label_service: LabelService = Depends(Provide[AutoContainer.label_service])
) -> LabelTagUpdateResponse:
    """编辑标注标签（仅机器学习标注任务）"""
    _db, _current_user = deps
    return await label_service.update_label_tag(task_id, class_id, request)


@router.delete("/tasks/{task_id}/labels/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
@inject
async def delete_label_tag(
    task_id: int = Path(..., description="标注任务ID", gt=0),
    class_id: int = Path(..., description="类别ID", ge=0),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    label_service: LabelService = Depends(Provide[AutoContainer.label_service])
) -> None:
    """删除标注标签（仅机器学习标注任务）"""
    _db, _current_user = deps
    await label_service.delete_label_tag(task_id, class_id)


@router.post("/annotations/save", response_model=AnnotationSaveResponse)
@inject
async def save_annotations(
    request: AnnotationSaveRequest,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    label_service: LabelService = Depends(Provide[AutoContainer.label_service])
) -> AnnotationSaveResponse:
    """保存标注（暂存/最终提交"""
    db, current_user = deps
    return await label_service.save_annotations(current_user, request)


@router.post("/annotations/ai")
@inject
async def ai_annotate(
    request: AIAnnotationRequest,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    label_service: LabelService = Depends(Provide[AutoContainer.label_service])
):
    """
    AI自动标注接口（流式输出）
    
    返回 SSE (Server-Sent Events) 格式的流式响应：
    - 每个数据块格式：data: {"content": "生成的文本片段"}
    - 完成时返回：data: {"done": true, "annotation": {...}}
    - 错误时返回：data: {"error": "错误信息"}
    """
    db, current_user = deps
    
    return StreamingResponse(
        label_service.ai_annotate_stream(current_user, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# ------------------------------ 自动标注配置接口 ------------------------------
@router.post("/auto-models-config", response_model=LabelAutoModelResponse, status_code=status.HTTP_201_CREATED)
@inject
async def save_auto_model_config(
    config: LabelAutoModelCreate,
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    label_service: LabelService = Depends(Provide[AutoContainer.label_service])
) -> LabelAutoModelResponse:
    """保存自动标注配置（创建或更新）"""
    db, current_user = deps
    return await label_service.save_auto_model_config(current_user, config)


@router.get("/auto-models-config", response_model=Optional[LabelAutoModelResponse])
@inject
async def get_auto_model_config(
    task_id: int = Query(..., description="任务ID", gt=0),
    deps: Tuple[AsyncSession, JwtUserInfo] = Depends(get_db_and_user),
    label_service: LabelService = Depends(Provide[AutoContainer.label_service])
) -> Optional[LabelAutoModelResponse]:
    """获取项目的自动标注配置"""
    db, current_user = deps
    return await label_service.get_auto_model_config(task_id)
